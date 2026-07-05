# Contributing

Thanks for your interest in improving the Sofabaton X1/X1S/X2 Home Assistant
integration. This document explains how the repository is laid out, how to
build and test each part, and how releases work.

If you just want to report a problem, please
[open an issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues)
and include diagnostics as described in [docs/logging.md](docs/logging.md).

## Repository layout

One repository ships three things: a Home Assistant custom integration, a
standalone PyPI library, and two Lovelace cards.

| Path                                   | What it is                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `custom_components/sofabaton_x1s/`     | The Home Assistant integration (entities, config flow, services, websocket APIs).                                                                                                                                                                                                                        |
| `custom_components/sofabaton_x1s/lib/` | The hub protocol engine. This directory is also the **source of truth for the `sofabaton-x` PyPI package**: the root `pyproject.toml` remaps it into the wheel as the top-level `sofabaton` package. It must stay importable without Home Assistant — no HA imports allowed, enforced by boundary tests. |
| `custom_components/sofabaton_x1s/www/` | Frontend cards. `src/**/*.ts` is the TypeScript source; `tools-card.js` and `remote-card.js` are **generated esbuild bundles — never edit them by hand**.                                                                                                                                                |
| `sofabaton-x/`                         | PyPI-facing README and runnable examples for the library.                                                                                                                                                                                                                                                |
| `docs/`                                | User-facing documentation. `docs/protocol/` is the reverse-engineered wire protocol reference.                                                                                                                                                                                                           |
| `IrScrutinizer/`                       | IrScrutinizer export formats for producing hub-compatible IR blobs.                                                                                                                                                                                                                                      |
| `tests/`                               | All test suites (see below).                                                                                                                                                                                                                                                                             |
| `scripts/`                             | Build scripts for the cards and frontend tests, plus the Windows `pytest.cmd` wrapper.                                                                                                                                                                                                                   |

The default branch is `main`; day-to-day development happens on `dev`. Target PRs at `dev`.

## Prerequisites

- **Python 3.11+** (development and CI primarily use 3.13)
- **Node 20+** (only needed for frontend work)

Python setup (Windows shown; the checked-in `pytest.cmd` wrapper picks up
`.venv-py313`, then `.venv-py313-smoke`, then `.venv`):

```powershell
py -3.13 -m venv .venv-py313
.venv-py313\Scripts\python -m pip install -U pip pytest zeroconf
```

Frontend setup:

```powershell
npm ci
```

You do **not** need Home Assistant installed to run the Python tests —
`tests/conftest.py` installs lightweight stubs for the `homeassistant` and
`voluptuous` modules.

## Building the frontend cards

The cards Home Assistant loads are single-file bundles built from the
TypeScript sources:

```powershell
npm run build:tools-card    # www/src/tools-card.ts  -> www/tools-card.js
npm run build:remote-card   # www/src/remote-card.ts -> www/remote-card.js
```

After changing anything under `www/src/`, rebuild the affected bundle and
commit **both** the source and the regenerated `.js` file.

## Running the tests

There are three suites:

### 1. Python (pytest)

```powershell
pytest -q                 # full suite, via the pytest.cmd wrapper
pytest tests\lib -q       # standalone-library tests only
```

- `tests/` covers the integration (services, websocket APIs, parsers,
  backup/restore, config flow, ...).
- `tests/lib/` covers the standalone library surface: public API, discovery,
  async wrapper, wire layouts.
- `tests/lib/test_library_boundary.py` and `tests/test_module_boundaries.py`
  are lint-style guards. If they fail, you introduced a forbidden dependency
  (for example an HA import inside `lib/`) — fix the import, don't relax the
  test.

### 2. Frontend unit tests (node --test)

```powershell
npm run test:frontend
```

This bundles `tests/frontend/*.test.ts` into `tests/frontend-dist/` with
esbuild and runs them with Node's built-in test runner. The generated
`tests/frontend-dist/*.js` files are checked in; commit them together with
the `.ts` test sources.

### 3. Playwright (visual/interaction tests for the cards)

```powershell
npm run test:playwright            # run
npm run test:playwright:update     # refresh snapshots after intended UI changes
```

Snapshot diffs are expected whenever card rendering changes intentionally —
review them, then update.

## Documentation

- User docs live in `docs/`; keep links **relative** (they are read on GitHub).
- Protocol findings go in `docs/protocol/` in this project's own terminology.
- The library README shown on PyPI is `sofabaton-x/README.md`; links in it
  must be absolute GitHub URLs, since PyPI renders it outside the repo.

## Versioning and releases

The integration and the library are **versioned independently**:

| Component             | Version lives in                                                                | Released by                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HA integration        | `custom_components/sofabaton_x1s/manifest.json` (plus the badge in `README.md`) | Publishing a GitHub release. `release.yml` zips `custom_components/sofabaton_x1s/` (excluding `www/src/`) and attaches `sofabaton_x1s.zip`, which HACS installs (`hacs.json` uses `zip_release`). |
| `sofabaton-x` library | `custom_components/sofabaton_x1s/lib/version.py`                                | Pushing a tag `sofabaton-x-vX.Y.Z`. `sofabaton-x-release.yml` verifies the tag matches `version.py`, runs the tests, builds, and publishes to PyPI via trusted publishing.                        |

Library stability contract: names exported from the package root
(`sofabaton.__all__`) follow semver; everything else is internal. Changes to
the public API surface are guarded by `tests/lib/test_public_api.py`.

CI (`sofabaton-x-ci.yml`) runs on PRs and pushes to `main`/`dev` that touch
the library, the packaging metadata, or the tests: boundary lint, lib tests
across supported Python versions, the full suite, and a wheel
build-and-install smoke test. `hassfest.yaml` and `hacs.yaml` validate the
integration side.

## Pull requests

- Keep generated artifacts in sync: card bundles (`www/*.js`) and frontend
  test bundles (`tests/frontend-dist/*.js`) must match their sources.
- Run the suites relevant to your change before opening the PR; CI will run
  them again.
- For protocol-affecting changes, update the matching page under
  `docs/protocol/` in the same PR.
