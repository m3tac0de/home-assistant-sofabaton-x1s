# Server development

For building the application and publishing releases. To build a client,
start with [Build an integration](first-integration.md).

The web remote (`src/sofabaton_server/ui/remote/`), embeddable remote
(`src/sofabaton_server/ui/embed/`) and control panel
(`src/sofabaton_server/ui/panel/`) are built from the repository's
frontend sources (`npm run build:remote-web`, `npm run build:remote-embed`
and `npm run build:server-panel` at the repository root; the bundles are
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

Then regenerate the TypeScript types the control panel and the web remote
use. The file is committed next to the document, and CI regenerates and
diffs it. The codegen smoke type-checks a sample client against it:

```
npm run gen:server-types
npx tsc --noEmit -p sofabaton-x-server/codegen-smoke/tsconfig.json
```

`tests/frontend/server-contract.test.ts` fails when `openapi.d.ts` is older
than the document, or when the panel or the web remote calls a route the
document does not list.

Unit tests and schema checks do not establish live hub compatibility.
The [live-hub testing notes](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/live-hub-testing.md) record
hardware coverage. The document-write bench covers X1/X1S library
operations; its equivalent X2 run remains pending. Separate server checks
cover the X1S web remote and activity input editing, and X2 MQTT deployment,
presses, rename, restart and deletion. They do not cover every route or firmware.

## Release order

The 0.2.4 server requires `sofabaton-x>=0.2.3,<0.3`: it calls
`hub_info(cached_only=True)`, which library 0.2.3 adds, so library 0.2.3
must be on PyPI first. The library, server, npm remote package and Home
Assistant integration are versioned independently.

1. Set the server version in `src/sofabaton_server/__init__.py` to `0.2.4`.
   Set the library dependency in `pyproject.toml` to `sofabaton-x>=0.2.3,<0.3`.
   Do not bump the library solely to match the server version.
2. Finalize the 0.2.4 date in the server changelog (and the 0.2.3 date in
   the library changelog) for the actual release day, leaving a fresh
   **Unreleased** section. Update README notices, installation pins and
   guides. Keep the API generation at `1`. The release notes cover the
   review fixes, the 30-character name limit and the OpenAPI response
   list changes.
3. Regenerate `openapi.json` with the pinned toolchain even when only the
   package version changed. Rebuild the frontend bundles, run the library,
   server and frontend checks in [CONTRIBUTING](../../CONTRIBUTING.md#-versioning-and-releases),
   and build/install the server wheel with the published library for a
   local smoke test. Verify the wheel serves `/ui/embed/sofabaton-remote.js`
   and the control panel, and test the web remote and an embed from an
   allowed dashboard origin.
   Review `git status` before committing so new modules and tests are
   included; `git commit -a` does not include untracked files.
4. Commit the release preparation, then tag and push `sofabaton-x-v0.2.3`.
   Wait for the library workflow to succeed and confirm that PyPI has a
   library version satisfying the dependency.
5. Tag and push `sofabaton-x-server-v0.2.4` on the same commit. Its
   workflow installs the library from PyPI. Confirm the server publishing
   workflow succeeds and 0.2.4 is available on PyPI.

The workflows verify tags against package versions, run tests and publish
to PyPI. These tags do not create GitHub Releases. For subsequent releases,
substitute the selected versions and dependency range in this sequence.

### Separate npm remote release

`npm run build:remote-embed` produces both the committed server bundle and
`packages/sofabaton-x-remote/dist/sofabaton-remote.js` for npm. The npm
`dist/` is not committed. Its version is in
`packages/sofabaton-x-remote/package.json` (currently `0.1.1`); a
`sofabaton-x-remote-v0.1.1` tag runs `sofabaton-x-remote-release.yml`.
Publishing the server does not publish this package. The server-hosted
embed is included in the server wheel and does not require npm publication.
