"""The pages this server serves and the web remote's configuration document.

* The control panel (docs/internal/server-panel-plan.md) at ``/ui/``;
  ``/`` and the old ``/harness`` redirect there.
* The web remote (docs/internal/web-remote-plan.md, S1) at ``/ui/remote/``.
* The per-hub card configuration document at
  ``/api/v1/hubs/{hub_id}/ui/remote-card``.

The pages and their assets ship inside the package (``sofabaton_server/ui``,
one directory per page) so card, panel and server can never drift; they
are outside the API contract (absent from the OpenAPI document). The
configuration document is in the contract: it is how a phone, a tablet
and a wall panel show the same layout, and how the panel edits it.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field

from . import API_PREFIX, __version__
from .manager import HubManager, HubNotFound
from .models import Problem, now_iso
from .problems import ApiProblem, hub_not_found

UI_DIR = Path(__file__).resolve().parent / "ui"
PANEL_DIR = UI_DIR / "panel"
REMOTE_DIR = UI_DIR / "remote"
EMBED_DIR = UI_DIR / "embed"
PANEL_PREFIX = "/ui"
UI_PREFIX = "/ui/remote"
EMBED_PREFIX = "/ui/embed"

# Only these files are served; nothing else in the directories is reachable.
_PANEL_ASSETS: dict[str, str] = {
    "index.html": "text/html; charset=utf-8",
    "panel.js": "text/javascript; charset=utf-8",
    "manifest.webmanifest": "application/manifest+json",
}
_REMOTE_ASSETS: dict[str, str] = {
    "index.html": "text/html; charset=utf-8",
    "remote-web.js": "text/javascript; charset=utf-8",
    "manifest.webmanifest": "application/manifest+json",
    "icon.svg": "image/svg+xml",
}
# The embeddable remote (docs/internal/remote-embed-plan.md, E4): a module
# script other people's dashboards load cross-origin. A module script is
# fetched in CORS mode, so it carries ``Access-Control-Allow-Origin: *``
# whatever the origin: an unlisted dashboard must still run the element,
# which is what shows the "list your origin" notice. The API keeps the
# listed-origin rule (access.py); this asset is public and credential-free.
_EMBED_ASSETS: dict[str, str] = {
    "sofabaton-remote.js": "text/javascript; charset=utf-8",
}
_EMBED_HEADERS: dict[str, str] = {"Access-Control-Allow-Origin": "*"}

# A layout document is a few kilobytes; anything near this is not one.
MAX_DOCUMENT_BYTES = 64 * 1024

router = APIRouter(prefix=f"{API_PREFIX}/hubs/{{hub_id}}/ui", tags=["ui"])
ui_pages_router = APIRouter(include_in_schema=False)


# -- the configuration document ---------------------------------------------


@dataclass(frozen=True)
class RemoteCardDocument:
    """``GET/PUT /hubs/{id}/ui/remote-card``: the web remote's card configuration."""

    hub_id: str
    document: Optional[dict[str, Any]]
    updated_at: Optional[str]


class RemoteCardDocumentBody(BaseModel):
    document: dict[str, Any] = Field(
        description="the remote card's configuration keys (the HA card's YAML as JSON, "
                    "minus entity, theme and Home Assistant actions); an empty object resets to defaults",
    )


def _manager(request: Request) -> HubManager:
    return request.app.state.hub_manager


def _require_hub(manager: HubManager, hub_id: str) -> None:
    try:
        manager.record(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None


def _view(manager: HubManager, hub_id: str) -> RemoteCardDocument:
    stored = manager.ui_documents.load(hub_id)
    if not stored:
        return RemoteCardDocument(hub_id=hub_id, document=None, updated_at=None)
    document = stored.get("document")
    return RemoteCardDocument(
        hub_id=hub_id,
        document=dict(document) if isinstance(document, dict) else None,
        updated_at=stored.get("updated_at"),
    )


@router.get("/remote-card", operation_id="getRemoteCardDocument", response_model=RemoteCardDocument,
            summary="The web remote's card configuration for this hub (document is null until one is stored)",
            responses={404: {"model": Problem}})
async def get_remote_card_document(request: Request, hub_id: str) -> RemoteCardDocument:
    manager = _manager(request)
    _require_hub(manager, hub_id)
    return _view(manager, hub_id)


@router.put("/remote-card", operation_id="putRemoteCardDocument", response_model=RemoteCardDocument,
            summary="Store the web remote's card configuration for this hub (replaces the whole document)",
            # The committed openapi.json must not depend on the interpreter:
            # FastAPI's default description is http.HTTPStatus(413).phrase,
            # which Python 3.13 renamed from "Request Entity Too Large".
            responses={404: {"model": Problem}, 413: {"model": Problem, "description": "Content Too Large"}})
async def put_remote_card_document(request: Request, hub_id: str, body: RemoteCardDocumentBody) -> RemoteCardDocument:
    manager = _manager(request)
    _require_hub(manager, hub_id)
    encoded = json.dumps(body.document, sort_keys=True)
    if len(encoded.encode("utf-8")) > MAX_DOCUMENT_BYTES:
        raise ApiProblem(413, "ui_document_too_large", "The configuration document is too large",
                         detail=f"limit is {MAX_DOCUMENT_BYTES} bytes of JSON", hub_id=hub_id)
    manager.ui_documents.save(hub_id, {
        "kind": "sofabaton_remote_card_document",
        "document": body.document,
        "updated_at": now_iso(),
    })
    return _view(manager, hub_id)


@router.delete("/remote-card", operation_id="deleteRemoteCardDocument", status_code=status.HTTP_204_NO_CONTENT,
               summary="Forget the stored configuration (the web remote falls back to the card's defaults)",
               responses={404: {"model": Problem}})
async def delete_remote_card_document(request: Request, hub_id: str) -> Response:
    manager = _manager(request)
    _require_hub(manager, hub_id)
    manager.ui_documents.delete(hub_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- the page ---------------------------------------------------------------


def _etag(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(__version__.encode("utf-8"))
    digest.update(path.read_bytes())
    return f'"{digest.hexdigest()[:24]}"'


def _asset_response(request: Request, directory: Path, assets: dict[str, str], name: str,
                    extra_headers: Optional[dict[str, str]] = None) -> Response:
    media_type = assets.get(name)
    path = directory / name
    if media_type is None or not path.is_file():
        raise ApiProblem(404, "ui_asset_not_found", "No such page asset", detail=name)
    etag = _etag(path)
    extra = dict(extra_headers or {})
    if request.headers.get("if-none-match") == etag:
        # A revalidated module script is CORS-checked on the 304 too.
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag, **extra})
    # Always revalidate: the bundle changes with every server release, and
    # a wall panel must not keep last month's card after an upgrade.
    return FileResponse(path, media_type=media_type,
                        headers={"ETag": etag, "Cache-Control": "no-cache", **extra})


# Relative asset URLs in each index.html resolve against the directory, so
# both pages live under a trailing slash and the bare paths redirect.


@ui_pages_router.get("/")
async def root_redirect() -> RedirectResponse:
    return RedirectResponse(url=f"{PANEL_PREFIX}/", status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@ui_pages_router.get("/harness")
async def harness_redirect() -> RedirectResponse:
    """The development console this panel grew out of; the old address stays valid."""

    return RedirectResponse(url=f"{PANEL_PREFIX}/", status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@ui_pages_router.get(PANEL_PREFIX)
async def ui_panel_redirect() -> RedirectResponse:
    return RedirectResponse(url=f"{PANEL_PREFIX}/", status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@ui_pages_router.get(f"{PANEL_PREFIX}/")
async def ui_panel_index(request: Request) -> Response:
    return _asset_response(request, PANEL_DIR, _PANEL_ASSETS, "index.html")


@ui_pages_router.get(UI_PREFIX)
async def ui_remote_redirect() -> RedirectResponse:
    return RedirectResponse(url=f"{UI_PREFIX}/", status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@ui_pages_router.get(f"{UI_PREFIX}/")
async def ui_remote_index(request: Request) -> Response:
    return _asset_response(request, REMOTE_DIR, _REMOTE_ASSETS, "index.html")


@ui_pages_router.get(f"{UI_PREFIX}/{{asset}}")
async def ui_remote_asset(request: Request, asset: str) -> Response:
    return _asset_response(request, REMOTE_DIR, _REMOTE_ASSETS, asset)


@ui_pages_router.get(f"{EMBED_PREFIX}/{{asset}}")
async def ui_embed_asset(request: Request, asset: str) -> Response:
    """The embeddable remote's bundle: ``<script type="module" src=".../ui/embed/sofabaton-remote.js">``."""

    return _asset_response(request, EMBED_DIR, _EMBED_ASSETS, asset, extra_headers=_EMBED_HEADERS)


# Declared after the remote routes: a literal ``/ui/remote`` wins over ``/ui/{asset}``.
@ui_pages_router.get(f"{PANEL_PREFIX}/{{asset}}")
async def ui_panel_asset(request: Request, asset: str) -> Response:
    return _asset_response(request, PANEL_DIR, _PANEL_ASSETS, asset)
