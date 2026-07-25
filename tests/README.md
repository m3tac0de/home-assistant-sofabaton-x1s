## 🧪 Development tests

For local development on Windows, run tests from the repo root with:

```powershell
pytest tests\test_play_ir_blob.py -q
```

The checked-in `pytest.cmd` wrapper automatically picks a project Python in this order:

1. `.venv-py313`
2. `.venv-py313-smoke`
3. `.venv`

So the shell doesn't need an activated virtual environment as long as one of those folders exists and has `pytest` installed.

If you are setting up a new machine, the most compatible default is:

```powershell
py -3.13 -m venv .venv-py313
.venv-py313\Scripts\python -m pip install -U pip pytest
```

After that, plain `pytest ...` from the repository root should work.

### Control Panel browser harness

Build the current Control Panel bundle, serve the repository root, and open
`tests/tools-card-harness.html`:

```powershell
npm run build:tools-card
python -m http.server 8000 --bind 127.0.0.1
```

The harness provides shareable scenario, language, theme, and card-width
controls. Its mock backend is deliberately strict: an API operation that has
not been modeled appears as an **unhandled API call** instead of receiving a
generic success response. Keep the harness scenarios and mock contract current
when adding or changing Control Panel websocket operations.

To build the minimal static site deployed by GitHub Pages:

```powershell
npm run build:tools-card
npm run build:tools-card-harness-site
```

The output is written to `dist/tools-card-harness-site`. Serve that directory
to exercise the same URL structure that GitHub Pages uses:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory dist/tools-card-harness-site
```

The `tools-card harness Pages` workflow publishes this artifact after relevant
changes reach `main`. For the first deployment, set **Settings → Pages →
Build and deployment → Source** to **GitHub Actions**. The public harness will
then be available at:

`https://m3tac0de.github.io/home-assistant-sofabaton-x1s/`

---
