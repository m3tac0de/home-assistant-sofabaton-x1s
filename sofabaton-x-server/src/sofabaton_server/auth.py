"""The admin account, the write tokens and the panel sessions (auth plan).

``auth.json`` in the data directory holds all three, written atomically
like ``hubs.json`` and kept apart from ``server.json`` (which refuses
secrets). Nothing secret is stored in the clear:

* the admin password as an scrypt hash (stdlib, no dependency),
* tokens and session secrets as SHA-256 digests: they are 256-bit
  random values, so a salt or a slow hash adds nothing.

A missing file (or one without an admin) is the *unclaimed* state: the
server is as open as 0.2.1 until someone sets up the admin account
(decision 2). ``--reset-password`` edits the file from a second process
while the server runs, so every access checks the file's mtime and
reloads when it changed. ``last_used_at`` / ``last_seen_at`` move in
memory on every use and reach the disk at most every few minutes.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

log = logging.getLogger(__name__)

AUTH_FILE = "auth.json"
SCHEMA = 1

TOKEN_PREFIX = "sbx_"
# Remembered sessions slide: each use pushes the expiry out again.
REMEMBER_SECONDS = 90 * 24 * 3600
# A session that is not remembered dies with the browser (no Max-Age on
# the cookie) and, on the server, after this long without a request.
IDLE_SECONDS = 12 * 3600
# How stale last_used_at / last_seen_at may be on disk.
PERSIST_EVERY_SECONDS = 300

USERNAME_MAX = 64
PASSWORD_MIN = 8
PASSWORD_MAX = 1024
TOKEN_NAME_MAX = 64

# scrypt cost: about 16 MB and tens of milliseconds per hash.
_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_MAXMEM = 64 * 1024 * 1024


class AuthError(ValueError):
    """A refused auth operation; ``code`` is the Problem type the route answers with."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# -- hashing ----------------------------------------------------------------------


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str, *, salt: Optional[bytes] = None) -> str:
    salt = salt if salt is not None else secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P,
                            maxmem=_SCRYPT_MAXMEM, dklen=32)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        kind, n, r, p, salt, digest = stored.split("$")
        if kind != "scrypt":
            return False
        expected = _unb64(digest)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=_unb64(salt), n=int(n), r=int(r), p=int(p),
                                maxmem=_SCRYPT_MAXMEM, dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def _digest(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).replace(microsecond=0).isoformat()


def _ts(text: Any) -> float:
    try:
        return datetime.fromisoformat(str(text)).timestamp()
    except (TypeError, ValueError):
        return 0.0


# -- validation -------------------------------------------------------------------


def clean_username(username: Any) -> str:
    name = str(username or "").strip()
    if not name:
        raise AuthError("invalid_request", "username must not be empty")
    if len(name) > USERNAME_MAX:
        raise AuthError("invalid_request", f"username is longer than {USERNAME_MAX} characters")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        raise AuthError("invalid_request", "username must not contain control characters")
    return name


def check_password(password: Any) -> str:
    text = str(password or "")
    if len(text) < PASSWORD_MIN:
        raise AuthError("weak_password", f"the password needs at least {PASSWORD_MIN} characters")
    if len(text) > PASSWORD_MAX:
        raise AuthError("invalid_request", f"the password is longer than {PASSWORD_MAX} characters")
    return text


def clean_token_name(name: Any) -> str:
    text = str(name or "").strip()
    if not text:
        raise AuthError("invalid_request", "a token needs a name")
    if len(text) > TOKEN_NAME_MAX:
        raise AuthError("invalid_request", f"the token name is longer than {TOKEN_NAME_MAX} characters")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in text):
        raise AuthError("invalid_request", "the token name must not contain control characters")
    return text


# -- records ----------------------------------------------------------------------


@dataclass(frozen=True)
class TokenInfo:
    """A write token as the panel lists it; the secret is never kept."""

    id: str
    name: str
    hint: str
    created_at: str
    last_used_at: Optional[str]


@dataclass(frozen=True)
class SessionInfo:
    id: str
    remember: bool
    created_at: str
    last_seen_at: str
    expires_at: str
    user_agent: str


@dataclass(frozen=True)
class Credential:
    """Who a request authenticated as: ``kind`` is ``"token"`` or ``"session"``."""

    kind: str
    id: str
    name: str


# -- the store --------------------------------------------------------------------


class AuthStore:
    """``auth.json``: admin account, tokens, sessions. One per server."""

    def __init__(self, data_dir: Path, *, clock: Callable[[], float] = time.time) -> None:
        self.path = Path(data_dir) / AUTH_FILE
        self._clock = clock
        self._data: dict[str, Any] = self._empty()
        self._mtime: Optional[int] = None
        self._loaded = False
        self._dirty = False
        self._persisted_at = 0.0

    # -- file ------------------------------------------------------------------

    @staticmethod
    def _empty() -> dict[str, Any]:
        return {"schema": SCHEMA, "install_id": None, "admin": None, "tokens": [], "sessions": []}

    def _stat(self) -> Optional[int]:
        try:
            return self.path.stat().st_mtime_ns
        except OSError:
            return None

    def _sync(self) -> None:
        """Load on first use and whenever another process changed the file."""

        mtime = self._stat()
        if self._loaded and mtime == self._mtime:
            return
        data = self._empty()
        if mtime is not None:
            try:
                loaded = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as err:
                # Refusing to start would lock the operator out of a server
                # they can no longer reach; an unreadable file is reported
                # and treated as locked (claimed, nothing verifies).
                log.error("auth: %s is unreadable (%s); fix or delete it, writes stay refused", self.path, err)
                loaded = {"schema": SCHEMA, "admin": {"username": "", "password": "!"}, "tokens": [], "sessions": []}
            if isinstance(loaded, dict) and int(loaded.get("schema") or 0) == SCHEMA:
                data.update({k: loaded[k] for k in data if k in loaded})
            else:
                log.error("auth: %s has an unsupported schema; writes stay refused", self.path)
                data["admin"] = {"username": "", "password": "!"}
        data["tokens"] = [dict(t) for t in data.get("tokens") or [] if isinstance(t, dict)]
        data["sessions"] = [dict(s) for s in data.get("sessions") or [] if isinstance(s, dict)]
        self._data = data
        self._mtime = mtime
        self._loaded = True
        self._dirty = False

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(self._data, indent=2, sort_keys=True)
        fd, tmp = tempfile.mkstemp(prefix=".auth-", suffix=".json", dir=str(self.path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(payload)
            try:
                os.chmod(tmp, 0o600)
            except OSError:
                # Some bind-mounted shares ignore chmod; the file still works.
                log.debug("auth: could not restrict %s to 0600", tmp, exc_info=True)
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        self._mtime = self._stat()
        self._dirty = False
        self._persisted_at = self._clock()

    def _touch(self) -> None:
        """A usage timestamp moved; write it out only every few minutes."""

        self._dirty = True
        if self._clock() - self._persisted_at >= PERSIST_EVERY_SECONDS:
            self._save()

    def flush(self) -> None:
        """Write pending usage timestamps (shutdown)."""

        if self._loaded and self._dirty and self._stat() == self._mtime:
            self._save()

    # -- account ---------------------------------------------------------------

    @property
    def claimed(self) -> bool:
        self._sync()
        return bool(self._data.get("admin"))

    @property
    def install_id(self) -> str:
        self._sync()
        return str(self._data.get("install_id") or "")

    @property
    def username(self) -> Optional[str]:
        self._sync()
        admin = self._data.get("admin")
        return str(admin.get("username") or "") if admin else None

    def setup(self, username: str, password: str) -> None:
        self._sync()
        if self._data.get("admin"):
            raise AuthError("already_claimed", "the admin account already exists")
        name = clean_username(username)
        secret = check_password(password)
        self._data["admin"] = {"username": name, "password": hash_password(secret), "changed_at": _iso(self._clock())}
        if not self._data.get("install_id"):
            self._data["install_id"] = secrets.token_hex(4)
        self._save()

    def login_material(self, username: str) -> tuple[bool, str]:
        """(username matches, the hash to verify the password against).

        The username is compared in constant time, and a locked or
        missing account still yields a hash (one no password matches) so
        a sign-in costs the same whatever the reason it fails.
        """

        self._sync()
        admin = self._data.get("admin") or {}
        stored = str(admin.get("password") or "")
        name_ok = hmac.compare_digest(str(username or "").strip().encode("utf-8"),
                                      str(admin.get("username") or "").encode("utf-8"))
        if not admin or not stored.startswith("scrypt$"):
            return False, _dummy_hash()
        return name_ok, stored

    def check_login(self, username: str, password: str) -> bool:
        name_ok, stored = self.login_material(username)
        return verify_password(str(password or ""), stored) and name_ok

    def change_admin(self, current_password: str, *, username: Optional[str] = None,
                     new_password: Optional[str] = None, keep_session: Optional[str] = None) -> bool:
        """Returns True when something changed; every other session is then revoked."""

        self._sync()
        admin = self._data.get("admin")
        if not admin:
            raise AuthError("not_claimed", "there is no admin account yet")
        if not verify_password(str(current_password or ""), str(admin.get("password") or "")):
            raise AuthError("wrong_password", "the current password is not right")
        changed = False
        if username is not None:
            name = clean_username(username)
            if name != admin.get("username"):
                admin["username"] = name
                changed = True
        if new_password is not None:
            admin["password"] = hash_password(check_password(new_password))
            changed = True
        if changed:
            admin["changed_at"] = _iso(self._clock())
            self._data["sessions"] = [s for s in self._data["sessions"] if s.get("id") == keep_session]
            self._save()
        return changed

    def reset_password(self) -> str:
        """``--reset-password``: a generated password, every session revoked,
        the username and the tokens kept. The server stays claimed."""

        self._sync()
        admin = self._data.get("admin")
        if not admin:
            raise AuthError("not_claimed", "there is no admin account to reset")
        password = secrets.token_urlsafe(12)
        # An unreadable file loads as a nameless, locked account; the
        # reset then rewrites it (its tokens are lost with it).
        if not admin.get("username"):
            admin["username"] = "admin"
        admin["password"] = hash_password(password)
        admin["changed_at"] = _iso(self._clock())
        self._data["sessions"] = []
        if not self._data.get("install_id"):
            self._data["install_id"] = secrets.token_hex(4)
        self._save()
        return password

    # -- tokens ----------------------------------------------------------------

    def tokens(self) -> list[TokenInfo]:
        self._sync()
        return [TokenInfo(id=str(t["id"]), name=str(t.get("name") or ""), hint=str(t.get("hint") or ""),
                          created_at=str(t.get("created_at") or ""), last_used_at=t.get("last_used_at"))
                for t in self._data["tokens"]]

    def create_token(self, name: str) -> tuple[TokenInfo, str]:
        self._sync()
        if not self._data.get("admin"):
            raise AuthError("not_claimed", "set up the admin account first")
        clean = clean_token_name(name)
        if any(str(t.get("name") or "").casefold() == clean.casefold() for t in self._data["tokens"]):
            raise AuthError("token_name_taken", f"a token named {clean!r} already exists")
        secret = TOKEN_PREFIX + secrets.token_urlsafe(32)
        row = {"id": "tk_" + secrets.token_hex(6), "name": clean, "hash": _digest(secret), "hint": secret[-4:],
               "created_at": _iso(self._clock()), "last_used_at": None}
        self._data["tokens"].append(row)
        self._save()
        return self._token_info(row), secret

    def rename_token(self, token_id: str, name: str) -> TokenInfo:
        self._sync()
        row = self._token_row(token_id)
        clean = clean_token_name(name)
        if any(t is not row and str(t.get("name") or "").casefold() == clean.casefold() for t in self._data["tokens"]):
            raise AuthError("token_name_taken", f"a token named {clean!r} already exists")
        row["name"] = clean
        self._save()
        return self._token_info(row)

    def revoke_token(self, token_id: str) -> None:
        self._sync()
        row = self._token_row(token_id)
        self._data["tokens"].remove(row)
        self._save()

    def authenticate_token(self, secret: str) -> Optional[Credential]:
        self._sync()
        if not secret or not self._data.get("admin"):
            return None
        wanted = _digest(secret)
        for row in self._data["tokens"]:
            if hmac.compare_digest(str(row.get("hash") or ""), wanted):
                row["last_used_at"] = _iso(self._clock())
                self._touch()
                return Credential(kind="token", id=str(row["id"]), name=str(row.get("name") or ""))
        return None

    def _token_row(self, token_id: str) -> dict[str, Any]:
        for row in self._data["tokens"]:
            if row.get("id") == token_id:
                return row
        raise AuthError("token_not_found", f"no token {token_id!r}")

    @staticmethod
    def _token_info(row: dict[str, Any]) -> TokenInfo:
        return TokenInfo(id=str(row["id"]), name=str(row.get("name") or ""), hint=str(row.get("hint") or ""),
                         created_at=str(row.get("created_at") or ""), last_used_at=row.get("last_used_at"))

    # -- sessions --------------------------------------------------------------

    def _expires(self, row: dict[str, Any]) -> float:
        span = REMEMBER_SECONDS if row.get("remember") else IDLE_SECONDS
        return _ts(row.get("last_seen_at")) + span

    def _prune(self) -> bool:
        now = self._clock()
        kept = [s for s in self._data["sessions"] if self._expires(s) > now]
        if len(kept) != len(self._data["sessions"]):
            self._data["sessions"] = kept
            return True
        return False

    def create_session(self, *, remember: bool, user_agent: str = "") -> tuple[SessionInfo, str]:
        self._sync()
        if not self._data.get("admin"):
            raise AuthError("not_claimed", "set up the admin account first")
        self._prune()
        secret = secrets.token_urlsafe(32)
        now = _iso(self._clock())
        row = {"id": "ss_" + secrets.token_hex(6), "hash": _digest(secret), "remember": bool(remember),
               "created_at": now, "last_seen_at": now, "user_agent": str(user_agent or "")[:200]}
        self._data["sessions"].append(row)
        self._save()
        return self._session_info(row), secret

    def authenticate_session(self, secret: str) -> Optional[Credential]:
        self._sync()
        if not secret or not self._data.get("admin"):
            return None
        wanted = _digest(secret)
        for row in self._data["sessions"]:
            if hmac.compare_digest(str(row.get("hash") or ""), wanted):
                if self._expires(row) <= self._clock():
                    self._data["sessions"].remove(row)
                    self._save()
                    return None
                row["last_seen_at"] = _iso(self._clock())
                self._touch()
                return Credential(kind="session", id=str(row["id"]), name=str(self._data["admin"].get("username") or ""))
        return None

    def sessions(self) -> list[SessionInfo]:
        self._sync()
        if self._prune():
            self._save()
        return [self._session_info(s) for s in self._data["sessions"]]

    def revoke_session(self, session_id: str) -> bool:
        self._sync()
        before = len(self._data["sessions"])
        self._data["sessions"] = [s for s in self._data["sessions"] if s.get("id") != session_id]
        if len(self._data["sessions"]) != before:
            self._save()
            return True
        return False

    def revoke_other_sessions(self, keep: Optional[str]) -> int:
        self._sync()
        before = len(self._data["sessions"])
        self._data["sessions"] = [s for s in self._data["sessions"] if s.get("id") == keep]
        removed = before - len(self._data["sessions"])
        if removed:
            self._save()
        return removed

    def session_remembered(self, session_id: str) -> bool:
        self._sync()
        return any(s.get("id") == session_id and s.get("remember") for s in self._data["sessions"])

    def _session_info(self, row: dict[str, Any]) -> SessionInfo:
        return SessionInfo(id=str(row["id"]), remember=bool(row.get("remember")),
                           created_at=str(row.get("created_at") or ""), last_seen_at=str(row.get("last_seen_at") or ""),
                           expires_at=_iso(self._expires(row)), user_agent=str(row.get("user_agent") or ""))


_DUMMY: list[str] = []


def _dummy_hash() -> str:
    if not _DUMMY:
        _DUMMY.append(hash_password("sofabaton-x-server dummy", salt=b"\0" * 16))
    return _DUMMY[0]


# -- login throttling -------------------------------------------------------------


class LoginThrottle:
    """Failed sign-ins per client address, with a global cap.

    Five free failures, then a doubling wait capped at 60 s. It never
    locks out: behind a proxy without ``trusted_proxies`` every client
    shares one address, so a lockout would lock the operator out too.
    The global window stops one host rotating addresses.
    """

    FREE_FAILURES = 5
    MAX_WAIT = 60.0
    GLOBAL_WINDOW = 60.0
    GLOBAL_LIMIT = 30

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._by_address: dict[str, tuple[int, float]] = {}
        self._recent: list[float] = []

    def retry_after(self, address: str) -> float:
        """Seconds to wait before this address may try again; 0 = go."""

        now = self._clock()
        self._recent = [t for t in self._recent if now - t < self.GLOBAL_WINDOW]
        wait = 0.0
        count, last = self._by_address.get(address, (0, 0.0))
        if count >= self.FREE_FAILURES:
            span = min(2.0 ** (count - self.FREE_FAILURES), self.MAX_WAIT)
            wait = max(wait, last + span - now)
        if len(self._recent) >= self.GLOBAL_LIMIT:
            wait = max(wait, min(self._recent[-1] + 2.0 - now, self.MAX_WAIT))
        return max(0.0, wait)

    def failed(self, address: str) -> None:
        now = self._clock()
        count, _last = self._by_address.get(address, (0, 0.0))
        self._by_address[address] = (count + 1, now)
        self._recent.append(now)
        if len(self._by_address) > 1024:
            # Oldest first; a flood of addresses must not grow this forever.
            for key in sorted(self._by_address, key=lambda k: self._by_address[k][1])[:512]:
                del self._by_address[key]

    def succeeded(self, address: str) -> None:
        self._by_address.pop(address, None)
