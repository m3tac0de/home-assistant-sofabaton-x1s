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

## Release order

The 0.2.2 server requires `sofabaton-x>=0.2.2,<0.3` for display ordering,
firmware status and X2 number keys. Prepare both packages together:

1. Set the library version in
   `custom_components/sofabaton_x1s/lib/version.py`, the server version in
   `src/sofabaton_server/__init__.py`, and the server's library dependency
   in `pyproject.toml`. These are independent of the Home Assistant version.
2. Finalize the dated entries in both changelogs, leaving a fresh
   **Unreleased** section. Update README notices, installation pins and
   guides. Keep the API generation at `1` for this release.
   Include the 0.2.2 access-control and panel-managed MQTT additions:
   document origin checks before access setup, token versus admin-only
   operations, broker credentials/storage, and the examples' token setup.
3. Regenerate `openapi.json` with the pinned toolchain even when only the
   package version changed. Rebuild the frontend bundles, run the library,
   server and frontend checks in [CONTRIBUTING](../../CONTRIBUTING.md#-versioning-and-releases),
   and build/install both wheels together for a local smoke test.
   Review `git status` before committing so new modules and tests are
   included; `git commit -a` does not include untracked files.
4. Commit the release preparation, then tag and push
   `sofabaton-x-v0.2.2`. Wait for the library's publishing workflow to
   succeed and confirm that 0.2.2 is available on PyPI.
5. Only then tag and push `sofabaton-x-server-v0.2.2`. Its workflow installs
   the library from PyPI, so pushing both tags together can fail. Confirm
   the server publishing workflow succeeds and 0.2.2 is available on PyPI.

The workflows verify tags against package versions, run tests and publish
to PyPI. These tags do not create GitHub Releases. For subsequent releases,
substitute the selected versions and dependency range in this sequence.
