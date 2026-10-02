# sofabaton-x-server image. Build context is the REPOSITORY ROOT (the
# library and the server are two distributions of one repo). Needs
# BuildKit (the default builder since Docker 23).
#
# Two wheel sources, chosen with --build-arg WHEEL_SOURCE=...:
#
#   checkout (default): both wheels are built from this checkout.
#       docker build -f sofabaton-x-server/Dockerfile -t sofabaton-x-server .
#
#   release: the wheels in ./release-wheels/ are installed and anything
#       they need comes from PyPI. The release workflow puts the server
#       wheel it just published there, so the image runs exactly the
#       published release with the library PyPI resolves for it.
#       docker build -f sofabaton-x-server/Dockerfile --build-arg WHEEL_SOURCE=release .
#
# Published images: ghcr.io/m3tac0de/sofabaton-x-server and
# m3tac0de/sofabaton-x-server on Docker Hub (tags X.Y.Z, X.Y, latest).
#
# Run with host networking (mDNS, the app's UDP broadcast and the hub's
# TCP dial-back all need the host's real interface; Linux hosts only):
#
#     docker run --network host -v ./data:/data m3tac0de/sofabaton-x-server
#
# or use the docker-compose.yml next to this file.

ARG WHEEL_SOURCE=checkout

# --- wheels from the checkout ------------------------------------------
FROM python:3.12-slim AS wheels-checkout
WORKDIR /src
RUN pip install --no-cache-dir build
COPY pyproject.toml LICENSE ./
COPY custom_components/sofabaton_x1s/lib ./custom_components/sofabaton_x1s/lib
COPY sofabaton-x ./sofabaton-x
RUN python -m build --wheel --outdir /wheels
COPY sofabaton-x-server ./sofabaton-x-server
RUN python -m build --wheel --outdir /wheels ./sofabaton-x-server

# --- wheels from a release -----------------------------------------------
FROM python:3.12-slim AS wheels-release
COPY release-wheels/*.whl /wheels/

FROM wheels-${WHEEL_SOURCE} AS wheels

# --- runtime --------------------------------------------------------------
FROM python:3.12-slim
LABEL org.opencontainers.image.title="sofabaton-x-server" \
      org.opencontainers.image.description="REST + WebSocket server over the sofabaton-x library for Sofabaton X1 / X1S / X2 hubs" \
      org.opencontainers.image.source="https://github.com/m3tac0de/home-assistant-sofabaton-x1s" \
      org.opencontainers.image.licenses="MIT"
COPY --from=wheels /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels
# SOFABATON_INSTALL tells the update check how this server was installed,
# so the panel says "pull the new image" instead of a pip line.
ENV SOFABATON_DATA_DIR=/data \
    SOFABATON_BIND=0.0.0.0 \
    SOFABATON_PORT=8480 \
    SOFABATON_INSTALL=container \
    PYTHONUNBUFFERED=1
VOLUME ["/data"]
# Host networking makes EXPOSE informational; listed for the record:
# API 8480/tcp, hub dial-back 8200/tcp, app discovery 8102/udp, mDNS 5353/udp.
EXPOSE 8480/tcp 8200/tcp 8102/udp 5353/udp
# The probe follows the scheme: https (certificate unchecked) with built-in TLS.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import os, ssl, urllib.request; p = os.environ.get('SOFABATON_PORT', '8480'); tls = bool(os.environ.get('SOFABATON_TLS_CERT')); s = 'https' if tls else 'http'; c = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT) if tls else None; c and setattr(c, 'check_hostname', False); c and setattr(c, 'verify_mode', ssl.CERT_NONE); urllib.request.urlopen(f'{s}://127.0.0.1:{p}/api/v1/server', timeout=3, context=c)" || exit 1
ENTRYPOINT ["sofabaton-x-server"]
