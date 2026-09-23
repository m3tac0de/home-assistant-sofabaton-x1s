# Server development

For building the application and publishing releases. To build a client,
start with [Build an integration](first-integration.md).

The web remote (`src/sofabaton_server/ui/remote/`) and the control
panel (`src/sofabaton_server/ui/panel/`) are built from the repository's
frontend sources (`npm run build:remote-web` and
`npm run build:server-panel` at the repository root; the bundles are
committed and the frontend CI checks them for drift), so a server change
never needs a frontend toolchain, and a card or panel change ships with
the next server release.

From the repository root, with the library importable (the tests alias
the in-tree library automatically):

```
python -m pip install . ./sofabaton-x-server
python -m pip install -r sofabaton-x-server/openapi-toolchain.txt pytest httpx
python -m pytest sofabaton-x-server/tests -q
```

`openapi.json` is the committed contract; a test fails when the running
app's document differs. After an API change:

```
python -m pip install -e ./sofabaton-x-server
python -m pip install -r sofabaton-x-server/openapi-toolchain.txt
python -m sofabaton_server.openapi
```

The toolchain file pins the FastAPI and pydantic versions the document
is generated with; CI installs the same set before the drift test, so a
framework's own wording (the 422 description changed between FastAPI
releases, for instance) never shows up as API drift.

The codegen smoke (also in CI) checks generation and type-checks the sample
client:

```
npx -y openapi-typescript@7 sofabaton-x-server/openapi.json -o sofabaton-x-server/codegen-smoke/schema.d.ts
npx tsc --noEmit -p sofabaton-x-server/codegen-smoke/tsconfig.json
```

Unit tests and schema checks do not establish live hub compatibility.
The [live-hub testing notes](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/live-hub-testing.md) record
hardware coverage. The document-write bench covers X1/X1S library
operations; its equivalent X2 run remains pending. Separate server checks
cover the X1S web remote and activity input editing, and X2 MQTT deployment,
presses, rename, restart and deletion. They do not cover every route or firmware.

To release: set `__version__` in `src/sofabaton_server/__init__.py`, update
the documentation and changelog (replace the pending release heading with
the release date), regenerate `openapi.json` with the pinned toolchain, and push the tag `sofabaton-x-server-vX.Y.Z`.
The release workflow re-runs the tests, checks the tag against the
version and publishes to PyPI; a compatible `sofabaton-x` version must be
on PyPI first (see the repository's CONTRIBUTING).
