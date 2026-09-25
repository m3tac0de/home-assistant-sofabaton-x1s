"""Access (auth plan): the store, the access classes, the Origin guard, CORS,
the /auth routes, the settings and the CLI reset, across the deployment
modes of section 5a."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.routing import APIRoute, APIWebSocketRoute
from fastapi.testclient import TestClient

from sofabaton_server import API_PREFIX
from sofabaton_server.access import (
    ADMIN,
    ADMIN_OPERATIONS,
    CONTROL,
    CONTROL_OPERATIONS,
    PUBLIC,
    PUBLIC_OPERATIONS,
    READ,
    WRITE,
    iter_routes,
    route_class,
)
from sofabaton_server.app import create_app
from sofabaton_server.auth import IDLE_SECONDS, REMEMBER_SECONDS, AuthError, AuthStore, LoginThrottle
from sofabaton_server.cli import main
from sofabaton_server.config import Settings, load_settings, normalize_origin
from sofabaton_server.manager import HubManager

from fakes import Factory, no_network_discovery

API = API_PREFIX
LAN = ("192.168.1.20", 50000)
PASSWORD = "correct horse"
# A route in each free and guarded class that needs no hub.
WRITE_URL = f"{API}/server/settings"          # PUT, write
CONTROL_URL = f"{API}/discovery/scan"          # POST, control


def _app(settings: Settings):
    manager = HubManager(settings, proxy_factory=Factory())
    return create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager))


def _client(settings: Settings, **kwargs) -> TestClient:
    kwargs.setdefault("client", LAN)
    return TestClient(_app(settings), **kwargs)


def _claim(client: TestClient, *, remember: bool = False) -> None:
    r = client.post(f"{API}/auth/setup", json={"username": "admin", "password": PASSWORD, "remember": remember})
    assert r.status_code == 200, r.text


def _token(client: TestClient, name: str = "Hubitat") -> str:
    r = client.post(f"{API}/auth/tokens", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["token"]


class Clock:
    def __init__(self, now: float = 1_800_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


# -- the store ----------------------------------------------------------------------


def test_store_setup_login_and_hash_on_disk(tmp_path: Path) -> None:
    store = AuthStore(tmp_path)
    assert not store.claimed and store.username is None
    with pytest.raises(AuthError) as err:
        store.setup("admin", "short")
    assert err.value.code == "weak_password"
    store.setup(" admin ", PASSWORD)
    assert store.claimed and store.username == "admin" and len(store.install_id) == 8
    assert store.check_login("admin", PASSWORD)
    assert not store.check_login("admin", "wrong password")
    assert not store.check_login("root", PASSWORD)
    raw = (tmp_path / "auth.json").read_text(encoding="utf-8")
    assert PASSWORD not in raw and "scrypt$" in raw
    with pytest.raises(AuthError) as err:
        store.setup("other", PASSWORD)
    assert err.value.code == "already_claimed"
    if os.name != "nt":
        assert (tmp_path / "auth.json").stat().st_mode & 0o777 == 0o600


def test_store_tokens_are_hashed_named_and_revocable(tmp_path: Path) -> None:
    store = AuthStore(tmp_path)
    with pytest.raises(AuthError):
        store.create_token("before claim")
    store.setup("admin", PASSWORD)
    info, secret = store.create_token("Hubitat")
    assert secret.startswith("sbx_") and info.hint == secret[-4:]
    assert secret not in (tmp_path / "auth.json").read_text(encoding="utf-8")
    with pytest.raises(AuthError) as err:
        store.create_token("hubitat")
    assert err.value.code == "token_name_taken"
    cred = store.authenticate_token(secret)
    assert cred is not None and (cred.kind, cred.name) == ("token", "Hubitat")
    assert store.tokens()[0].last_used_at is not None
    assert store.authenticate_token(secret + "x") is None
    store.rename_token(info.id, "Hubitat hub")
    assert store.authenticate_token(secret).name == "Hubitat hub"
    store.revoke_token(info.id)
    assert store.authenticate_token(secret) is None and store.tokens() == []


def test_store_session_lifetimes(tmp_path: Path) -> None:
    clock = Clock()
    store = AuthStore(tmp_path, clock=clock)
    store.setup("admin", PASSWORD)
    _short, short = store.create_session(remember=False)
    _long, long = store.create_session(remember=True)
    clock.now += IDLE_SECONDS - 60
    assert store.authenticate_session(short) is not None           # used: the idle clock restarts
    clock.now += IDLE_SECONDS - 60
    assert store.authenticate_session(short) is not None
    clock.now += IDLE_SECONDS + 1
    assert store.authenticate_session(short) is None               # idle too long
    assert store.authenticate_session(long) is not None            # remembered: 90 days, sliding
    clock.now += REMEMBER_SECONDS - 60
    assert store.authenticate_session(long) is not None
    clock.now += REMEMBER_SECONDS + 1
    assert store.authenticate_session(long) is None
    assert store.sessions() == []


def test_store_admin_change_signs_out_the_others(tmp_path: Path) -> None:
    store = AuthStore(tmp_path)
    store.setup("admin", PASSWORD)
    mine, mine_secret = store.create_session(remember=False)
    _other, other_secret = store.create_session(remember=True)
    with pytest.raises(AuthError) as err:
        store.change_admin("nope", new_password="another password")
    assert err.value.code == "wrong_password"
    assert store.change_admin(PASSWORD, username="marcel", new_password="another password", keep_session=mine.id)
    assert store.authenticate_session(mine_secret) is not None
    assert store.authenticate_session(other_secret) is None
    assert store.check_login("marcel", "another password")
    assert not store.change_admin("another password", username="marcel")    # nothing changed


def test_store_reset_password_keeps_name_and_tokens(tmp_path: Path) -> None:
    store = AuthStore(tmp_path)
    with pytest.raises(AuthError):
        store.reset_password()
    store.setup("marcel", PASSWORD)
    _info, token = store.create_token("Hubitat")
    _s, session = store.create_session(remember=True)
    new = store.reset_password()
    assert store.claimed and store.check_login("marcel", new) and not store.check_login("marcel", PASSWORD)
    assert store.authenticate_session(session) is None
    assert store.authenticate_token(token) is not None


def test_store_reloads_when_another_process_changes_the_file(tmp_path: Path) -> None:
    running = AuthStore(tmp_path)
    running.setup("admin", PASSWORD)
    _s, session = running.create_session(remember=True)
    assert running.authenticate_session(session) is not None
    new = AuthStore(tmp_path).reset_password()                     # the CLI, a second process
    # Some filesystems keep a coarse mtime; make sure this one moved.
    stat = (tmp_path / "auth.json").stat()
    os.utime(tmp_path / "auth.json", ns=(stat.st_atime_ns, stat.st_mtime_ns + 10_000_000))
    assert running.authenticate_session(session) is None
    assert running.check_login("admin", new)


def test_store_usage_reaches_disk_throttled_and_on_flush(tmp_path: Path) -> None:
    clock = Clock()
    store = AuthStore(tmp_path, clock=clock)
    store.setup("admin", PASSWORD)
    _info, token = store.create_token("t")
    on_disk = lambda: json.loads((tmp_path / "auth.json").read_text(encoding="utf-8"))["tokens"][0]["last_used_at"]
    clock.now += 10
    store.authenticate_token(token)
    assert on_disk() is None                                        # created a moment ago: not yet
    store.flush()
    assert on_disk() is not None


def test_store_unreadable_file_is_locked_not_open(tmp_path: Path) -> None:
    (tmp_path / "auth.json").write_text("{not json", encoding="utf-8")
    store = AuthStore(tmp_path)
    assert store.claimed                                            # writes stay refused
    assert not store.check_login("", "")
    store.reset_password()                                          # the way out
    assert store.username == "admin"


def test_login_throttle_backs_off_and_caps() -> None:
    clock = Clock(0.0)
    throttle = LoginThrottle(clock)
    for _ in range(5):
        assert throttle.retry_after("a") == 0
        throttle.failed("a")
    assert throttle.retry_after("a") == pytest.approx(1.0)
    for _ in range(20):
        throttle.failed("a")
    assert throttle.retry_after("a") <= LoginThrottle.MAX_WAIT
    assert throttle.retry_after("b") == 0
    throttle.succeeded("a")
    assert throttle.retry_after("a") == 0


# -- access classes ---------------------------------------------------------------------


def test_every_route_has_a_class_and_the_lists_are_real(tmp_path: Path) -> None:
    app = _app(Settings(data_dir=tmp_path))
    operations: dict[str, str] = {}
    for route in iter_routes(app.routes):
        if isinstance(route, APIWebSocketRoute):
            assert route_class(route) == READ
        elif isinstance(route, APIRoute):
            kind = route_class(route)
            assert kind in (READ, CONTROL, PUBLIC, WRITE, ADMIN)
            if route.operation_id:
                operations[route.operation_id] = kind
            if kind == READ:
                assert set(route.methods) <= {"GET", "HEAD"}, route.path
    for name in CONTROL_OPERATIONS | PUBLIC_OPERATIONS | ADMIN_OPERATIONS:
        assert name in operations, f"{name} names no route"
    assert operations["listTokens"] == ADMIN                        # an admin GET is not a free read
    assert operations["learnPayload"] == WRITE and operations["scanForHubs"] == CONTROL
    assert operations["planActivityEdit"] == WRITE                  # dry runs are writes too
    assert operations["getAuthStatus"] == READ


def test_openapi_security_follows_the_classes(tmp_path: Path) -> None:
    spec = _app(Settings(data_dir=tmp_path)).openapi()
    ops = {op["operationId"]: op for methods in spec["paths"].values() for op in methods.values()}
    assert ops["getSnapshot"]["security"] == [] and ops["sendCommand"]["security"] == []
    assert {"bearerAuth": []} in ops["eraseHub"]["security"] and "401" in ops["eraseHub"]["responses"]
    assert ops["createToken"]["security"] == [{"sessionCookie": []}]
    assert set(spec["components"]["securitySchemes"]) == {"bearerAuth", "tokenHeader", "sessionCookie"}


# -- unclaimed ----------------------------------------------------------------------------


def test_unclaimed_is_open_like_0_2(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as client:
        assert client.get(f"{API}/auth").json() == {"claimed": False, "signed_in": False, "username": None, "via": None}
        assert client.get(f"{API}/server").json()["auth"] == {"claimed": False}
        assert client.put(WRITE_URL, json={}).status_code == 200
        assert client.post(CONTROL_URL, json={}).status_code == 200
        assert client.get(f"{API}/auth/tokens").json()["type"] == "not_claimed"
        assert client.post(f"{API}/auth/login", json={"username": "a", "password": "b"}).status_code == 409
    assert not (tmp_path / "auth.json").exists()                    # nothing written until a claim


def test_setup_only_from_a_local_address(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path), client=("8.8.8.8", 5000)) as client:
        r = client.post(f"{API}/auth/setup", json={"username": "admin", "password": PASSWORD})
        assert r.status_code == 403 and r.json()["type"] == "setup_local_only"
    for address in ("127.0.0.1", "10.1.2.3", "169.254.3.4", "::1", "fd00::5"):
        folder = tmp_path / address.replace(":", "_")
        with _client(Settings(data_dir=folder), client=(address, 5000)) as client:
            assert client.post(f"{API}/auth/setup", json={"username": "admin", "password": PASSWORD}).status_code == 200


def test_setup_signs_in_announces_and_advertises(tmp_path: Path) -> None:
    app = _app(Settings(data_dir=tmp_path))
    with TestClient(app, client=LAN) as client:
        r = client.post(f"{API}/auth/setup", json={"username": "admin", "password": PASSWORD, "remember": True})
        assert r.json() == {"claimed": True, "signed_in": True, "username": "admin", "via": "session"}
        cookie = r.headers["set-cookie"]
        store = app.state.auth
        assert cookie.startswith(f"sbx_session_{store.install_id}=")
        assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/api/" in cookie
        assert "Max-Age=7776000" in cookie and "Secure" not in cookie
        assert client.get(f"{API}/server").json()["auth"] == {"claimed": True}
        assert app.state.discovery._advertiser.updates[-1]["auth"] == "1"
        again = client.post(f"{API}/auth/setup", json={"username": "x", "password": PASSWORD})
        assert again.status_code == 409 and again.json()["type"] == "already_claimed"


# -- claimed: the classes -------------------------------------------------------------------


def test_claimed_reads_and_control_stay_free(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as admin:
        _claim(admin)
    with _client(Settings(data_dir=tmp_path)) as anyone:
        assert anyone.get(f"{API}/hubs").status_code == 200
        assert anyone.get(f"{API}/server/settings").status_code == 200
        assert anyone.post(CONTROL_URL, json={}).status_code == 200
        with anyone.websocket_connect(f"{API}/events") as ws:
            assert ws.receive_json()["type"] == "hello"


def test_claimed_writes_need_a_credential(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as admin:
        _claim(admin)
        token = _token(admin)
    with _client(Settings(data_dir=tmp_path)) as client:
        r = client.put(WRITE_URL, json={})
        assert r.status_code == 401 and r.json()["type"] == "auth_required"
        assert r.headers["www-authenticate"].startswith("Bearer")
        # a bad body is still a 401 first: nothing is validated for a stranger
        assert client.put(WRITE_URL, json={"callback_port": "x"}).status_code == 401
        assert client.put(WRITE_URL, json={}, headers={"Authorization": f"Bearer {token}"}).status_code == 200
        assert client.put(WRITE_URL, json={}, headers={"X-Sofabaton-Token": token}).status_code == 200
        bad = client.put(WRITE_URL, json={}, headers={"Authorization": "Bearer sbx_nope"})
        assert bad.status_code == 401 and bad.json()["type"] == "invalid_credentials"
        # a reverse proxy's Basic auth is not ours: no credential, not an invalid one
        basic = client.put(WRITE_URL, json={}, headers={"Authorization": "Basic dXNlcjpwYXNz"})
        assert basic.json()["type"] == "auth_required"
        both = client.put(WRITE_URL, json={}, headers={"Authorization": "Basic dXNlcjpwYXNz", "X-Sofabaton-Token": token})
        assert both.status_code == 200
        assert client.get(f"{API}/auth", headers={"Authorization": f"Bearer {token}"}).json()["via"] == "token"


def test_admin_routes_need_the_session_not_a_token(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as admin:
        _claim(admin)
        token = _token(admin)
        assert admin.get(f"{API}/auth/tokens").status_code == 200
    with _client(Settings(data_dir=tmp_path)) as client:
        r = client.get(f"{API}/auth/tokens", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403 and r.json()["type"] == "admin_required"
        assert client.post(f"{API}/auth/tokens", json={"name": "x"}, headers={"X-Sofabaton-Token": token}).status_code == 403
        assert client.get(f"{API}/auth/tokens").status_code == 401


def test_sign_in_out_and_the_session_cookie(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as admin:
        _claim(admin)
    with _client(Settings(data_dir=tmp_path)) as client:
        r = client.post(f"{API}/auth/login", json={"username": "admin", "password": PASSWORD})
        assert r.status_code == 200 and "Max-Age" not in r.headers["set-cookie"]      # a browser-session cookie
        assert client.put(WRITE_URL, json={}).status_code == 200
        assert client.get(f"{API}/auth").json()["signed_in"] is True
        assert client.post(f"{API}/auth/logout").status_code == 204
        assert client.put(WRITE_URL, json={}).status_code == 401
        assert client.get(f"{API}/auth").json()["signed_in"] is False


def test_a_stale_cookie_is_invalid_credentials(tmp_path: Path) -> None:
    app = _app(Settings(data_dir=tmp_path))
    with TestClient(app, client=LAN) as client:
        _claim(client)
        client.cookies.set(f"sbx_session_{app.state.auth.install_id}", "forged", path="/api/")
        r = client.put(WRITE_URL, json={})
        assert r.status_code == 401 and r.json()["type"] == "invalid_credentials"


def test_wrong_passwords_are_throttled(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as client:
        _claim(client)
        client.post(f"{API}/auth/logout")
        for _ in range(5):
            assert client.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong!!!"}).status_code == 401
        r = client.post(f"{API}/auth/login", json={"username": "admin", "password": PASSWORD})
        assert r.status_code == 429 and r.json()["type"] == "login_throttled" and int(r.headers["retry-after"]) >= 1


def test_password_change_signs_out_the_other_browser(tmp_path: Path) -> None:
    app = _app(Settings(data_dir=tmp_path))
    with TestClient(app, client=LAN) as one, TestClient(app, client=("192.168.1.21", 5000)) as two:
        _claim(one)
        assert two.post(f"{API}/auth/login", json={"username": "admin", "password": PASSWORD, "remember": True}).status_code == 200
        wrong = one.put(f"{API}/auth/admin", json={"current_password": "nope", "new_password": "a new password"})
        assert wrong.status_code == 403 and wrong.json()["type"] == "wrong_password"
        weak = one.put(f"{API}/auth/admin", json={"current_password": PASSWORD, "new_password": "short"})
        assert weak.status_code == 422 and weak.json()["type"] == "weak_password"
        ok = one.put(f"{API}/auth/admin", json={"current_password": PASSWORD, "username": "marcel", "new_password": "a new password"})
        assert ok.json()["username"] == "marcel"
        assert one.put(WRITE_URL, json={}).status_code == 200
        assert two.put(WRITE_URL, json={}).json()["type"] == "invalid_credentials"


def test_token_and_session_management(tmp_path: Path) -> None:
    app = _app(Settings(data_dir=tmp_path))
    with TestClient(app, client=LAN) as one, TestClient(app, client=("192.168.1.21", 5000)) as two:
        _claim(one)
        token = _token(one, "Hubitat")
        listed = one.get(f"{API}/auth/tokens").json()
        assert listed[0]["name"] == "Hubitat" and "token" not in listed[0] and listed[0]["hint"] == token[-4:]
        assert one.post(f"{API}/auth/tokens", json={"name": "HUBITAT"}).status_code == 409
        assert one.post(f"{API}/auth/tokens", json={"name": "  "}).status_code == 422
        tid = listed[0]["id"]
        assert one.patch(f"{API}/auth/tokens/{tid}", json={"name": "Hubitat C-8"}).json()["name"] == "Hubitat C-8"
        assert one.delete(f"{API}/auth/tokens/{tid}").status_code == 204
        assert one.delete(f"{API}/auth/tokens/{tid}").status_code == 404
        assert two.put(WRITE_URL, json={}, headers={"Authorization": f"Bearer {token}"}).status_code == 401

        two.post(f"{API}/auth/login", json={"username": "admin", "password": PASSWORD})
        sessions = one.get(f"{API}/auth/sessions").json()
        assert len(sessions) == 2 and sum(s["current"] for s in sessions) == 1
        assert one.delete(f"{API}/auth/sessions").status_code == 204
        assert two.put(WRITE_URL, json={}).status_code == 401
        mine = one.get(f"{API}/auth/sessions").json()
        assert len(mine) == 1 and mine[0]["current"]
        assert one.delete(f"{API}/auth/sessions/{mine[0]['id']}").status_code == 204
        assert one.put(WRITE_URL, json={}).status_code == 401


# -- the Origin guard and CORS (section 5a) ------------------------------------------------


def test_foreign_origins_are_refused_on_every_non_get(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as client:
        for url, method in ((CONTROL_URL, "post"), (WRITE_URL, "put")):
            r = getattr(client, method)(url, json={}, headers={"Origin": "https://evil.example"})
            assert r.status_code == 403 and r.json()["type"] == "cross_origin_refused"
            assert "advertise-url" in r.json()["detail"]
        assert client.post(CONTROL_URL, json={}, headers={"Origin": "null"}).status_code == 403
        # the server's own pages, and non-browser clients (no Origin)
        assert client.post(CONTROL_URL, json={}, headers={"Origin": "http://testserver"}).status_code == 200
        assert client.post(CONTROL_URL, json={}).status_code == 200
        # reads are not guarded
        assert client.get(f"{API}/hubs", headers={"Origin": "https://evil.example"}).status_code == 200
        # a sign-in from another site is refused before any password check
        assert client.post(f"{API}/auth/login", json={"username": "a", "password": "b"},
                           headers={"Origin": "https://evil.example"}).status_code == 403


def test_origin_matching_behind_a_reverse_proxy(tmp_path: Path) -> None:
    ok = lambda client, origin, **headers: client.post(CONTROL_URL, json={}, headers={"Origin": origin, **headers}).status_code == 200
    with _client(Settings(data_dir=tmp_path)) as client:
        # TLS ends at the proxy: https Origin, the request arrives as http with the public Host
        assert ok(client, "https://sofa.example", host="sofa.example")
        assert ok(client, "https://sofa.example:8443", host="sofa.example:8443")
        # nginx's $host drops the port: only a default port can match
        assert not ok(client, "https://sofa.example:8443", host="sofa.example")
        # X-Forwarded-Host is ignored without trusted proxies
        assert not ok(client, "https://sofa.example:8443", host="127.0.0.1:8480", **{"x-forwarded-host": "sofa.example:8443"})
    with _client(Settings(data_dir=tmp_path / "p", trusted_proxies=("127.0.0.1",))) as client:
        assert ok(client, "https://sofa.example:8443", host="127.0.0.1:8480", **{"x-forwarded-host": "sofa.example:8443"})
    with _client(Settings(data_dir=tmp_path / "a", advertise_url="https://home.example:8443/sofabaton")) as client:
        assert ok(client, "https://home.example:8443", host="127.0.0.1:8480")


def test_allowed_origins_get_cors_without_credentials(tmp_path: Path) -> None:
    dash = "http://nas:8123"
    with _client(Settings(data_dir=tmp_path, allowed_origins=(dash + "/",))) as client:
        pre = client.options(f"{API}/hubs/x/send", headers={
            "Origin": dash, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"})
        assert pre.status_code == 204
        assert pre.headers["access-control-allow-origin"] == dash
        assert "POST" in pre.headers["access-control-allow-methods"]
        assert "access-control-allow-credentials" not in pre.headers
        got = client.get(f"{API}/hubs", headers={"Origin": dash})
        assert got.headers["access-control-allow-origin"] == dash and "ETag" in got.headers["access-control-expose-headers"]
        assert client.post(CONTROL_URL, json={}, headers={"Origin": dash}).status_code == 200
        other = client.get(f"{API}/hubs", headers={"Origin": "http://nas:9999"})
        assert "access-control-allow-origin" not in other.headers


def test_a_listed_origin_cannot_ride_the_cookie(tmp_path: Path) -> None:
    dash = "http://nas:8123"
    with _client(Settings(data_dir=tmp_path, allowed_origins=(dash,))) as client:
        _claim(client)
        token = _token(client)
        # the cookie is in this jar, as it would be for a credentialed fetch from a
        # dashboard on the same host (same site): it must not count for that page
        r = client.put(WRITE_URL, json={}, headers={"Origin": dash})
        assert r.status_code == 401 and "access-control-allow-credentials" not in r.headers
        assert client.put(WRITE_URL, json={}, headers={"Origin": "http://testserver"}).status_code == 200
        with_token = client.put(WRITE_URL, json={}, headers={"Origin": dash, "Authorization": f"Bearer {token}"})
        assert with_token.status_code == 200


# -- cookies across deployment modes -------------------------------------------------------


def test_cookie_is_secure_only_over_https(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path), base_url="https://testserver") as client:
        r = client.post(f"{API}/auth/setup", json={"username": "admin", "password": PASSWORD})
        assert "Secure" in r.headers["set-cookie"]
        assert client.put(WRITE_URL, json={}).status_code == 200


def test_cookie_path_follows_the_root_path(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path, root_path="/sofabaton")) as client:
        r = client.post(f"{API}/auth/setup", json={"username": "admin", "password": PASSWORD})
        assert "Path=/sofabaton/api/" in r.headers["set-cookie"]


def test_two_installs_on_one_host_use_different_cookies(tmp_path: Path) -> None:
    a, b = _app(Settings(data_dir=tmp_path / "a")), _app(Settings(data_dir=tmp_path / "b"))
    with TestClient(a, client=LAN) as ca, TestClient(b, client=LAN) as cb:
        _claim(ca)
        _claim(cb)
        assert a.state.auth.install_id != b.state.auth.install_id


def test_remembered_cookie_is_renewed_on_status(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as client:
        _claim(client, remember=True)
        assert "Max-Age=7776000" in client.get(f"{API}/auth").headers.get("set-cookie", "")
    with _client(Settings(data_dir=tmp_path / "n")) as client:
        _claim(client, remember=False)
        assert "set-cookie" not in client.get(f"{API}/auth").headers


# -- settings and CLI ------------------------------------------------------------------------


def test_origin_normalization() -> None:
    assert normalize_origin("HTTP://NAS:80/") == "http://nas"
    assert normalize_origin("https://nas:8443") == "https://nas:8443"
    assert normalize_origin("http://[::1]:8123") == "http://[::1]:8123"
    for bad in ("*", "null", "nas:8123", "http://nas/path", "ftp://nas", "http://u:p@nas"):
        with pytest.raises(ValueError):
            normalize_origin(bad)
    s = load_settings(environ={"SOFABATON_ALLOWED_ORIGINS": "http://a:1, http://b:2"}, data_dir=Path("."))
    assert s.allowed_origins == ("http://a:1", "http://b:2") and "allowed_origins" in s.pinned


def test_allowed_origins_setting_applies_live_and_persists(tmp_path: Path) -> None:
    with _client(Settings(data_dir=tmp_path)) as client:
        assert client.get(WRITE_URL).json()["allowed_origins"] == {"value": [], "pinned": False}
        assert client.post(CONTROL_URL, json={}, headers={"Origin": "http://nas:8123"}).status_code == 403
        r = client.put(WRITE_URL, json={"allowed_origins": ["HTTP://nas:8123/"]})
        assert r.json()["allowed_origins"]["value"] == ["http://nas:8123"]
        assert client.post(CONTROL_URL, json={}, headers={"Origin": "http://nas:8123"}).status_code == 200
        assert json.loads((tmp_path / "server.json").read_text(encoding="utf-8"))["allowed_origins"] == ["http://nas:8123"]
        bad = client.put(WRITE_URL, json={"allowed_origins": ["*"]})
        assert bad.status_code == 422 and bad.json()["type"] == "invalid_origin"
    pinned = Settings(data_dir=tmp_path / "p", allowed_origins=("http://a:1",), pinned=frozenset({"allowed_origins"}))
    with _client(pinned) as client:
        assert client.get(WRITE_URL).json()["allowed_origins"] == {"value": ["http://a:1"], "pinned": True}
        assert client.put(WRITE_URL, json={"allowed_origins": []}).status_code == 409
        assert client.put(WRITE_URL, json={"allowed_origins": ["http://a:1"]}).status_code == 200    # unchanged


def test_cli_reset_password(tmp_path: Path, capsys, monkeypatch) -> None:
    monkeypatch.delenv("SOFABATON_DATA_DIR", raising=False)
    assert main(["--data-dir", str(tmp_path), "--reset-password"]) == 1
    assert "no admin account" in capsys.readouterr().err
    store = AuthStore(tmp_path)
    store.setup("marcel", PASSWORD)
    _info, token = store.create_token("Hubitat")
    assert main(["--data-dir", str(tmp_path), "--reset-password"]) == 0
    out = capsys.readouterr().out
    new = out.split(": ", 1)[1].splitlines()[0].strip()
    fresh = AuthStore(tmp_path)
    assert fresh.check_login("marcel", new) and fresh.authenticate_token(token) is not None
