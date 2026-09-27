"""Who may call what (auth plan, sections 4 and 5).

Every route has one access class, decided here and nowhere else:

* ``read``: every GET/HEAD and the events WebSocket. Free.
* ``control``: the explicit allowlist below (send, activities, find /
  resync remote, play a payload, the discovery scan). Free.
* ``public``: signing in and out, and claiming an unclaimed server.
* ``admin``: the account, tokens and sessions, GETs included. The
  control panel's session only; a token is refused.
* ``write``: every other route. A token or the panel's session, once the
  server is claimed. New routes land here unless someone adds them to
  the allowlist, so the default is closed.

Every non-GET request, whatever its class, also passes the Origin guard:
a browser request from another website is refused unless the operator
listed that origin in ``allowed_origins``. Listed origins get CORS
headers without credentials, so they can use the free routes, and write
with a token, but never ride the panel's cookie.
"""

from __future__ import annotations

import ipaddress
import logging
from typing import Any, Iterable, Optional
from urllib.parse import urlsplit

from fastapi.routing import APIRoute, APIWebSocketRoute
from starlette.requests import HTTPConnection
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .auth import AuthStore, Credential
from .config import Settings, normalize_origin
from .problems import ApiProblem

log = logging.getLogger(__name__)

READ = "read"
CONTROL = "control"
PUBLIC = "public"
WRITE = "write"
ADMIN = "admin"

# Free non-GET routes (decisions 1 and 8). The route-walk test fails when
# one of these names no longer exists.
CONTROL_OPERATIONS = frozenset({
    "startActivity",
    "stopActivity",
    "sendCommand",
    "findRemote",
    "resyncRemote",
    "playPayload",
    "scanForHubs",
})
PUBLIC_OPERATIONS = frozenset({"setupAdmin", "signIn", "signOut"})
ADMIN_OPERATIONS = frozenset({
    "updateAdmin",
    "listTokens",
    "createToken",
    "renameToken",
    "revokeToken",
    "listSessions",
    "revokeSession",
    "revokeOtherSessions",
    # The broker holds a secret the server sends out (mqtt_config.py): the panel's sign-in only.
    "updateMqttConfig",
    "removeMqttConfig",
    "testMqttConfig",
})

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
TOKEN_HEADER = "x-sofabaton-token"
REALM = 'Bearer realm="sofabaton-x-server"'


def route_class(route: Any) -> str:
    if isinstance(route, APIWebSocketRoute):
        return READ
    operation = getattr(route, "operation_id", None)
    if operation in ADMIN_OPERATIONS:
        return ADMIN
    if operation in PUBLIC_OPERATIONS:
        return PUBLIC
    if operation in CONTROL_OPERATIONS:
        return CONTROL
    methods = set(getattr(route, "methods", None) or ())
    if methods and methods <= {"GET", "HEAD"}:
        return READ
    return WRITE


def iter_routes(routes: Iterable[Any]) -> Iterable[Any]:
    """The leaf routes, through included routers (FastAPI keeps an
    ``include_router`` as one wrapper whose ``original_router`` has them)."""

    for route in routes:
        inner = getattr(route, "original_router", None)
        if inner is not None:
            yield from iter_routes(inner.routes)
        else:
            yield route


def operation_classes(routes: Iterable[Any]) -> dict[str, str]:
    """operation id -> class, for the OpenAPI document and the tests."""

    return {r.operation_id: route_class(r) for r in iter_routes(routes) if isinstance(r, APIRoute) and r.operation_id}


# -- origins ----------------------------------------------------------------------

_DEFAULT_PORTS = {"http": 80, "https": 443}


def _origin_parts(origin: str) -> Optional[tuple[str, str, int]]:
    try:
        parts = urlsplit(origin)
        port = parts.port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    if scheme not in _DEFAULT_PORTS or not parts.hostname:
        return None
    return scheme, parts.hostname.lower(), port or _DEFAULT_PORTS[scheme]


def _host_parts(value: str) -> Optional[tuple[str, Optional[int]]]:
    """``host[:port]`` from a Host / X-Forwarded-Host value."""

    text = value.split(",")[0].strip().lower()
    if not text:
        return None
    try:
        parts = urlsplit(f"//{text}")
        return (parts.hostname or "", parts.port) if parts.hostname else None
    except ValueError:
        return None


class OriginPolicy:
    """Which browser origins may make non-GET requests, and which get CORS.

    ``allowed`` is live: ``PUT /server/settings`` replaces it in place.
    """

    def __init__(self, settings: Settings) -> None:
        self.allowed: frozenset[str] = frozenset(settings.allowed_origins)
        self.advertised: Optional[str] = None
        if settings.advertise_url:
            parts = urlsplit(settings.advertise_url)
            try:
                self.advertised = normalize_origin(f"{parts.scheme}://{parts.netloc}")
            except ValueError:
                self.advertised = None
        self.trust_forwarded_host = bool(settings.trusted_proxies)

    def set_allowed(self, origins: Iterable[str]) -> None:
        self.allowed = frozenset(origins)

    def cors_allows(self, origin: str) -> bool:
        try:
            return normalize_origin(origin) in self.allowed
        except ValueError:
            return False

    def allows(self, origin: str, headers: Any) -> bool:
        return self.classify(origin, headers) != "refused"

    def classify(self, origin: str, headers: Any) -> str:
        """The Origin guard (plan section 5a): ``same``, ``listed`` or ``refused``.

        ``same``: 1. ``advertise_url``'s origin, or 3. the host:port the
        request was sent to (Host, or X-Forwarded-Host behind a trusted
        proxy). The scheme is not compared in 3: only this server or its
        proxy can serve a page from its host:port, and a scheme difference
        only comes from TLS ending at a proxy. ``listed``: 2. an entry in
        ``allowed_origins``; such a page never gets the panel's session.
        """

        try:
            normalized = normalize_origin(origin)
        except ValueError:
            return "refused"                           # "null", garbage
        if normalized == self.advertised or self._sent_here(normalized, headers):
            return "same"
        if normalized in self.allowed:
            return "listed"
        return "refused"

    def _sent_here(self, normalized: str, headers: Any) -> bool:
        parsed = _origin_parts(normalized)
        if parsed is None:
            return False
        scheme, host, port = parsed
        candidates = [headers.get("host", "")]
        if self.trust_forwarded_host and headers.get("x-forwarded-host"):
            candidates.append(headers.get("x-forwarded-host", ""))
        for candidate in candidates:
            target = _host_parts(candidate or "")
            if target is None or target[0] != host:
                continue
            if target[1] is None:
                # nginx's $host drops the port; only a default port matches.
                if port == _DEFAULT_PORTS[scheme]:
                    return True
            elif target[1] == port:
                return True
        return False


# -- cookies ----------------------------------------------------------------------


def cookie_name(store: AuthStore) -> str:
    # Cookies ignore ports: two servers on one host must not share a name.
    return f"sbx_session_{store.install_id or 'x'}"


def cookie_path(settings: Settings) -> str:
    return f"{settings.root_path}/api/"


def set_session_cookie(response: Response, conn: HTTPConnection, settings: Settings, store: AuthStore,
                       secret: str, *, remember: bool) -> None:
    from .auth import REMEMBER_SECONDS

    response.set_cookie(
        cookie_name(store), secret,
        max_age=REMEMBER_SECONDS if remember else None,
        path=cookie_path(settings),
        # Only when the browser really talks https: a Secure cookie set on
        # a plain-HTTP path would be dropped and sign-in would fail there.
        secure=conn.url.scheme == "https",
        httponly=True,
        samesite="strict",
    )


def clear_session_cookie(response: Response, conn: HTTPConnection, settings: Settings, store: AuthStore) -> None:
    response.delete_cookie(cookie_name(store), path=cookie_path(settings),
                           secure=conn.url.scheme == "https", httponly=True, samesite="strict")


# -- credentials ------------------------------------------------------------------


def presented_token(headers: Any) -> Optional[str]:
    """``Authorization: Bearer`` or ``X-Sofabaton-Token``.

    Any other ``Authorization`` scheme (a proxy's Basic auth passed
    upstream) is not ours and counts as no credential.
    """

    scheme, _, value = str(headers.get("authorization", "")).strip().partition(" ")
    if scheme.lower() == "bearer" and value.strip():
        return value.strip()
    token = str(headers.get(TOKEN_HEADER, "")).strip()
    return token or None


def session_credential(conn: HTTPConnection, store: AuthStore) -> tuple[Optional[Credential], bool]:
    """The panel session from the cookie, and whether a cookie was sent at all.

    Not from a listed other origin (``cookie_ok``, set by the guard).
    """

    if not getattr(conn.state, "cookie_ok", True):
        return None, False
    secret = conn.cookies.get(cookie_name(store))
    if not secret:
        return None, False
    return store.authenticate_session(secret), True


def client_address(conn: HTTPConnection) -> str:
    return conn.client.host if conn.client else "local"


def is_local_client(conn: HTTPConnection) -> bool:
    """Loopback, private or link-local (after trusted-proxy resolution).

    No client at all is a Unix socket: local. A name that is not an
    address (a test client) is not.
    """

    if conn.client is None:
        return True
    try:
        address = ipaddress.ip_address(conn.client.host)
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return address.is_loopback or address.is_private or address.is_link_local


def _unauthorized(type_: str, title: str, detail: str) -> ApiProblem:
    return ApiProblem(401, type_, title, detail=detail, headers={"WWW-Authenticate": REALM})


async def enforce_access(conn: HTTPConnection) -> None:
    """The app-wide dependency: the Origin guard, then the class check.

    Runs before the body is validated, so an unauthenticated write with a
    bad body is a 401, not a 422. Leaves ``conn.state.credential``.
    """

    conn.state.credential = None
    conn.state.cookie_ok = True
    if conn.scope.get("type") != "http":
        return                                          # the events stream is a read
    method = conn.scope.get("method", "GET")
    app_state = conn.app.state
    route = conn.scope.get("route")
    kind = route_class(route) if route is not None else READ

    if method not in SAFE_METHODS:
        origin = conn.headers.get("origin")
        policy: OriginPolicy = app_state.origin_policy
        verdict = policy.classify(origin, conn.headers) if origin is not None else "same"
        # A listed dashboard is the same *site* as this server when it runs
        # on the same host, so a credentialed request from it would carry
        # the panel's cookie; it must not count (section 5).
        conn.state.cookie_ok = verdict == "same"
        if verdict == "refused":
            raise ApiProblem(
                403, "cross_origin_refused", "Refused a request from another website",
                detail=(f"Origin {origin} does not match this server (Host {conn.headers.get('host', '?')}); "
                        "behind a reverse proxy set --advertise-url, and list other browser origins in allowed_origins"),
            )

    if kind in (READ, CONTROL, PUBLIC):
        return
    store: AuthStore = app_state.auth
    if not store.claimed:
        if kind == ADMIN:
            raise ApiProblem(409, "not_claimed", "No admin account yet",
                             detail="set up access in the control panel first")
        _log_write(conn, None)
        return

    if kind == ADMIN:
        credential, sent_cookie = session_credential(conn, store)
        if credential is not None:
            conn.state.credential = credential
            _log_write(conn, credential)
            return
        if presented_token(conn.headers):
            raise ApiProblem(403, "admin_required", "Needs the control panel's sign-in",
                             detail="tokens cannot manage tokens or the admin account")
        if sent_cookie:
            raise _unauthorized("invalid_credentials", "Signed out", "the session expired or was signed out")
        raise _unauthorized("auth_required", "Sign in first", "sign in to the control panel")

    token = presented_token(conn.headers)
    if token is not None:
        credential = store.authenticate_token(token)
        if credential is None:
            raise _unauthorized("invalid_credentials", "Unknown or revoked token",
                                "the token is not valid; create a new one in the control panel")
        conn.state.credential = credential
        _log_write(conn, credential)
        return
    credential, sent_cookie = session_credential(conn, store)
    if credential is not None:
        conn.state.credential = credential
        _log_write(conn, credential)
        return
    if sent_cookie:
        raise _unauthorized("invalid_credentials", "Signed out", "the session expired or was signed out")
    raise _unauthorized("auth_required", "This needs a token",
                        "send Authorization: Bearer <token>; tokens are made in the control panel under Server settings > Access")


def _log_write(conn: HTTPConnection, credential: Optional[Credential]) -> None:
    if conn.scope.get("method") in SAFE_METHODS:
        return                                          # an admin read (the token list) is not a write
    who ="anyone (unclaimed)" if credential is None else (
        f"token {credential.name!r}" if credential.kind == "token" else "admin")
    log.info("write %s %s from=%s by %s", conn.scope.get("method"), conn.url.path, client_address(conn), who)


# -- CORS -------------------------------------------------------------------------

_CORS_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE"
_CORS_EXPOSE = "ETag, Location, Retry-After, WWW-Authenticate"
_CORS_DEFAULT_HEADERS = "Accept, Content-Type, Authorization, X-Sofabaton-Token, If-Match, Idempotency-Key"


class CorsMiddleware:
    """CORS for the listed origins only, read live from the policy.

    Never sends ``Access-Control-Allow-Credentials``: a listed page gets
    the free routes and token writes, never the panel's cookie.
    Unlisted origins get no headers at all (the browser then keeps the
    response from the page, as before).
    """

    def __init__(self, app: ASGIApp, policy: OriginPolicy) -> None:
        self.app = app
        self.policy = policy

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
        origin = headers.get("origin")
        if not origin or not self.policy.cors_allows(origin):
            await self.app(scope, receive, send)
            return
        if scope.get("method") == "OPTIONS" and "access-control-request-method" in headers:
            preflight = {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": _CORS_METHODS,
                "Access-Control-Allow-Headers": headers.get("access-control-request-headers") or _CORS_DEFAULT_HEADERS,
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            }
            # Chrome's Private Network Access: a public (https) page calling
            # a LAN address preflights with this request header and drops
            # the request unless the reply grants it, whatever the origin
            # rule says (docs/internal/remote-embed-plan.md, E4).
            if headers.get("access-control-request-private-network", "").lower() == "true":
                preflight["Access-Control-Allow-Private-Network"] = "true"
            response = Response(status_code=204, headers=preflight)
            await response(scope, receive, send)
            return

        async def send_with_cors(message: Message) -> None:
            if message["type"] == "http.response.start":
                raw = list(message.get("headers") or [])
                # A public asset (the embeddable remote's bundle) carries its
                # own ``*``; a second value would make the browser reject it.
                if not any(name.lower() == b"access-control-allow-origin" for name, _ in raw):
                    raw.append((b"access-control-allow-origin", origin.encode("latin-1")))
                raw.append((b"access-control-expose-headers", _CORS_EXPOSE.encode("latin-1")))
                raw.append((b"vary", b"Origin"))
                message = {**message, "headers": raw}
            await send(message)

        await self.app(scope, receive, send_with_cors)
