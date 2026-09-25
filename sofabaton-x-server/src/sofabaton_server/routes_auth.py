"""``/auth``: the admin account, the panel's sessions and the write tokens.

Plan: docs/internal/sofabaton-x-server-auth-plan.md, section 6. The
access classes are in ``access.py``: ``GET /auth`` is a read, setup /
sign-in / sign-out are public, everything else here is ``admin`` (the
panel's session; a token is refused).
"""

from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field

from . import API_PREFIX
from .access import (
    clear_session_cookie,
    client_address,
    cookie_name,
    is_local_client,
    presented_token,
    session_credential,
    set_session_cookie,
)
from .auth import AuthError, AuthStore, Credential, LoginThrottle, SessionInfo, TokenInfo, verify_password
from .models import Problem
from .problems import ApiProblem

log = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/auth", tags=["auth"])

_STATUS = {
    "already_claimed": 409,
    "not_claimed": 409,
    "token_name_taken": 409,
    "token_not_found": 404,
    "session_not_found": 404,
    "wrong_password": 403,
    "weak_password": 422,
    "invalid_request": 422,
}
_TITLES = {
    "already_claimed": "The admin account already exists",
    "not_claimed": "No admin account yet",
    "token_name_taken": "Token name in use",
    "token_not_found": "Unknown token",
    "session_not_found": "Unknown session",
    "wrong_password": "Wrong password",
    "weak_password": "Password too short",
    "invalid_request": "Invalid request",
}


def _problem(err: AuthError) -> ApiProblem:
    return ApiProblem(_STATUS.get(err.code, 422), err.code, _TITLES.get(err.code, "Invalid request"), detail=str(err))


# -- models -----------------------------------------------------------------------


@dataclass(frozen=True)
class AuthStatus:
    """``GET /auth``: whether access is set up and who this request is."""

    claimed: bool
    signed_in: bool
    username: Optional[str] = None
    via: Optional[str] = None


class Credentials(BaseModel):
    username: str = Field(max_length=256)
    password: str = Field(max_length=4096)
    remember: bool = Field(False, description="keep the session across browser restarts (90 days, renewed with use)")


class AdminUpdate(BaseModel):
    current_password: str = Field(max_length=4096)
    username: Optional[str] = Field(None, max_length=256)
    new_password: Optional[str] = Field(None, max_length=4096)


class TokenCreate(BaseModel):
    name: str = Field(max_length=256, description="what the token is for, e.g. the integration's name")


class TokenRename(BaseModel):
    name: str = Field(max_length=256)


@dataclass(frozen=True)
class TokenCreated:
    """The new token; ``token`` is the secret and is never shown again."""

    id: str
    name: str
    hint: str
    created_at: str
    token: str
    last_used_at: Optional[str] = None


@dataclass(frozen=True)
class SessionView:
    id: str
    remember: bool
    created_at: str
    last_seen_at: str
    expires_at: str
    user_agent: str
    current: bool


# -- helpers ----------------------------------------------------------------------


def _store(request: Request) -> AuthStore:
    return request.app.state.auth


def _announce(request: Request) -> None:
    """Open panels re-check ``GET /auth`` (a claim, a password change, a sign-out elsewhere)."""

    relay = getattr(request.app.state, "event_relay", None)
    if relay is not None:
        from .ws import WsServerEvent

        relay.publish("", WsServerEvent(hub_id="", kind="auth"))


def _current(request: Request) -> Credential:
    credential = getattr(request.state, "credential", None)
    assert credential is not None and credential.kind == "session"     # enforce_access made sure
    return credential


def _status(request: Request, response: Optional[Response] = None) -> AuthStatus:
    store = _store(request)
    if not store.claimed:
        return AuthStatus(claimed=False, signed_in=False)
    credential, _sent = session_credential(request, store)
    if credential is not None:
        if response is not None and store.session_remembered(credential.id):
            # Renew the browser's copy too, or it dies 90 days after sign-in.
            secret = request.cookies.get(cookie_name(store)) or ""
            set_session_cookie(response, request, request.app.state.settings, store, secret, remember=True)
        return AuthStatus(claimed=True, signed_in=True, username=store.username, via="session")
    token = presented_token(request.headers)
    if token and store.authenticate_token(token) is not None:
        return AuthStatus(claimed=True, signed_in=False, via="token")
    return AuthStatus(claimed=True, signed_in=False)


def _sign_in(request: Request, response: Response, remember: bool) -> None:
    store = _store(request)
    _info, secret = store.create_session(remember=remember, user_agent=request.headers.get("user-agent", ""))
    set_session_cookie(response, request, request.app.state.settings, store, secret, remember=remember)


# -- account ----------------------------------------------------------------------


@router.get("", operation_id="getAuthStatus", response_model=AuthStatus,
            summary="Whether access is set up, and whether this request is signed in")
async def get_auth_status(request: Request, response: Response) -> AuthStatus:
    return _status(request, response)


@router.post("/setup", operation_id="setupAdmin", response_model=AuthStatus,
             summary="Create the admin account (only while none exists) and sign in",
             responses={403: {"model": Problem}, 409: {"model": Problem}, 422: {"model": Problem}})
async def setup_admin(request: Request, response: Response, body: Credentials) -> AuthStatus:
    store = _store(request)
    if store.claimed:
        raise _problem(AuthError("already_claimed", "the admin account already exists; sign in instead"))
    if not is_local_client(request):
        raise ApiProblem(403, "setup_local_only", "Set up access from the local network",
                         detail=f"{client_address(request)} is not a local address")
    try:
        store.setup(body.username, body.password)
    except AuthError as err:
        raise _problem(err) from None
    log.warning("auth: admin account %r created from %s; writes now need a token or the panel's sign-in",
                store.username, client_address(request))
    _sign_in(request, response, body.remember)
    discovery = getattr(request.app.state, "discovery", None)
    if discovery is not None:
        discovery.refresh_advertisement()
    _announce(request)
    return AuthStatus(claimed=True, signed_in=True, username=store.username, via="session")


@router.post("/login", operation_id="signIn", response_model=AuthStatus,
             summary="Sign in to the control panel (sets the session cookie)",
             responses={401: {"model": Problem}, 409: {"model": Problem}, 429: {"model": Problem}})
async def sign_in(request: Request, response: Response, body: Credentials) -> AuthStatus:
    store = _store(request)
    throttle: LoginThrottle = request.app.state.login_throttle
    address = client_address(request)
    wait = throttle.retry_after(address)
    if wait > 0:
        raise ApiProblem(429, "login_throttled", "Too many failed sign-ins",
                         detail=f"try again in {math.ceil(wait)} s", headers={"Retry-After": str(math.ceil(wait))})
    if not store.claimed:
        raise _problem(AuthError("not_claimed", "set up access first"))
    name_ok, stored = store.login_material(body.username)
    # scrypt is tens of milliseconds; keep it off the event loop.
    pass_ok = await asyncio.to_thread(verify_password, body.password, stored)
    if not (name_ok and pass_ok):
        throttle.failed(address)
        log.warning("auth: failed sign-in from %s", address)
        raise ApiProblem(401, "invalid_credentials", "Wrong username or password")
    throttle.succeeded(address)
    _sign_in(request, response, body.remember)
    log.info("auth: admin signed in from %s (remember=%s)", address, body.remember)
    return AuthStatus(claimed=True, signed_in=True, username=store.username, via="session")


@router.post("/logout", operation_id="signOut", status_code=status.HTTP_204_NO_CONTENT,
             summary="Sign out this browser")
async def sign_out(request: Request) -> Response:
    store = _store(request)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    if store.claimed:
        credential, _sent = session_credential(request, store)
        if credential is not None:
            store.revoke_session(credential.id)
        clear_session_cookie(response, request, request.app.state.settings, store)
    return response


@router.put("/admin", operation_id="updateAdmin", response_model=AuthStatus,
            summary="Change the admin username and/or password (signs out every other session)",
            responses={403: {"model": Problem}, 422: {"model": Problem}})
async def update_admin(request: Request, body: AdminUpdate) -> AuthStatus:
    store = _store(request)
    current = _current(request)
    try:
        changed = store.change_admin(body.current_password, username=body.username,
                                     new_password=body.new_password, keep_session=current.id)
    except AuthError as err:
        raise _problem(err) from None
    if changed:
        log.warning("auth: admin account changed from %s; other sessions signed out", client_address(request))
        _announce(request)
    return AuthStatus(claimed=True, signed_in=True, username=store.username, via="session")


# -- tokens -----------------------------------------------------------------------


@router.get("/tokens", operation_id="listTokens", response_model=list[TokenInfo],
            summary="The write tokens (never their secrets)")
async def list_tokens(request: Request) -> list[TokenInfo]:
    return _store(request).tokens()


@router.post("/tokens", operation_id="createToken", response_model=TokenCreated, status_code=201,
             summary="Create a write token; the secret is in this answer only",
             responses={409: {"model": Problem}, 422: {"model": Problem}})
async def create_token(request: Request, body: TokenCreate) -> TokenCreated:
    try:
        info, secret = _store(request).create_token(body.name)
    except AuthError as err:
        raise _problem(err) from None
    log.info("auth: token %r created", info.name)
    return TokenCreated(id=info.id, name=info.name, hint=info.hint, created_at=info.created_at, token=secret)


@router.patch("/tokens/{token_id}", operation_id="renameToken", response_model=TokenInfo,
              summary="Rename a write token", responses={404: {"model": Problem}, 409: {"model": Problem}})
async def rename_token(request: Request, token_id: str, body: TokenRename) -> TokenInfo:
    try:
        return _store(request).rename_token(token_id, body.name)
    except AuthError as err:
        raise _problem(err) from None


@router.delete("/tokens/{token_id}", operation_id="revokeToken", status_code=status.HTTP_204_NO_CONTENT,
               summary="Revoke a write token", responses={404: {"model": Problem}})
async def revoke_token(request: Request, token_id: str) -> Response:
    store = _store(request)
    name = next((t.name for t in store.tokens() if t.id == token_id), token_id)
    try:
        store.revoke_token(token_id)
    except AuthError as err:
        raise _problem(err) from None
    log.info("auth: token %r revoked", name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- sessions ---------------------------------------------------------------------


def _session_view(info: SessionInfo, current_id: str) -> SessionView:
    return SessionView(id=info.id, remember=info.remember, created_at=info.created_at, last_seen_at=info.last_seen_at,
                       expires_at=info.expires_at, user_agent=info.user_agent, current=info.id == current_id)


@router.get("/sessions", operation_id="listSessions", response_model=list[SessionView],
            summary="The signed-in browsers")
async def list_sessions(request: Request) -> list[SessionView]:
    current = _current(request)
    return [_session_view(s, current.id) for s in _store(request).sessions()]


@router.delete("/sessions", operation_id="revokeOtherSessions", status_code=status.HTTP_204_NO_CONTENT,
               summary="Sign out every other browser")
async def revoke_other_sessions(request: Request) -> Response:
    current = _current(request)
    if _store(request).revoke_other_sessions(current.id):
        _announce(request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/sessions/{session_id}", operation_id="revokeSession", status_code=status.HTTP_204_NO_CONTENT,
               summary="Sign out one browser", responses={404: {"model": Problem}})
async def revoke_session(request: Request, session_id: str) -> Response:
    store = _store(request)
    current = _current(request)
    if not store.revoke_session(session_id):
        raise _problem(AuthError("session_not_found", f"no session {session_id!r}"))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    if session_id == current.id:
        clear_session_cookie(response, request, request.app.state.settings, store)
    _announce(request)
    return response
