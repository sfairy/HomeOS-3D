# syntax=docker/dockerfile:1

ARG CYTHON_VERSION=3.1.6

# ─── 前端：Bun + Vite → dist（含 JS 混淆）─────────────────────────
FROM oven/bun:1.4-debian AS frontend-tools

WORKDIR /work
COPY package.json bun.lock bunfig.toml ./
COPY homeos-3d/package.json ./homeos-3d/
COPY homeos-store/package.json ./homeos-store/
RUN bun install --frozen-lockfile

COPY ops/docker/obfuscate_javascript.mjs ./ops/docker/obfuscate_javascript.mjs
COPY homeos-3d ./homeos-3d
COPY homeos-store ./homeos-store
RUN bun run build \
    && grep -q '_0x' homeos-3d/dist/static/logging/client-log.js \
    && test -f homeos-3d/dist/static/vendor/three/0.186.0/three.module.min.js \
    && grep -q '_0x' homeos-store/dist/static/auth-bootstrap.js \
    && test -f homeos-store/dist/static/jquery.min.js \
    && test -f homeos-3d/dist/index.html \
    && test -f homeos-store/dist/templates/store.html


FROM frontend-tools AS frontend-protected
WORKDIR /work


FROM frontend-tools AS store-static-protected
WORKDIR /work


FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 homeos \
    && useradd --system --uid 1000 --gid homeos --home-dir /home/homeos --create-home --shell /usr/sbin/nologin homeos

WORKDIR /app

COPY homeos-3d/backend/src/requirements.txt /tmp/requirements-app.txt
COPY homeos-store/backend/src/requirements.txt /tmp/requirements-store.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements-app.txt -r /tmp/requirements-store.txt \
    && rm /tmp/requirements-app.txt /tmp/requirements-store.txt


FROM base AS app-build
ARG CYTHON_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && pip install "cython==${CYTHON_VERSION}" setuptools

COPY ops/docker/compile_python.py /tmp/compile_python.py
COPY ops/container_entrypoint.py ./ops/
COPY ops/docker ./ops/docker
COPY homeos-3d/VERSION ./VERSION
COPY homeos-3d/alembic.ini ./alembic.ini
COPY homeos-3d/backend/src ./src
COPY --from=frontend-protected /work/homeos-3d/dist ./dist
COPY homeos-3d/db ./db
COPY keys ./keys
RUN mkdir -p /app/image \
    && rm -f /app/ops/docker/compile_python.py /app/ops/docker/obfuscate_javascript.mjs /app/ops/docker/package.json /app/ops/docker/bun.lock \
    && python /tmp/compile_python.py /app \
    && rm -f /tmp/compile_python.py \
    && test -f /app/src/main.*.so \
    && test -f /app/ops/container_entrypoint.*.so \
    && test -f /app/ops/docker/start_app.*.so \
    && test -f /app/db/migrations/env.py \
    && test -f /app/src/__init__.*.so \
    && test ! -f /app/src/main.py \
    && test ! -f /app/ops/container_entrypoint.py \
    && test -z "$(find /app/src /app/ops/docker \( -name '*.py' -o -name '*.pyc' \) -print -quit)"


FROM base AS store-build
ARG CYTHON_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && pip install "cython==${CYTHON_VERSION}" setuptools

COPY ops/docker/compile_python.py /tmp/compile_python.py
COPY ops/container_entrypoint.py ./ops/
COPY ops/docker ./ops/docker
COPY homeos-store/VERSION ./VERSION
COPY homeos-store/backend/src ./src
COPY --from=store-static-protected /work/homeos-store/dist ./dist
RUN rm -f /app/ops/docker/compile_python.py /app/ops/docker/obfuscate_javascript.mjs /app/ops/docker/package.json /app/ops/docker/bun.lock \
    && python /tmp/compile_python.py /app \
    && rm -f /tmp/compile_python.py \
    && test -f /app/src/app.*.so \
    && test -f /app/src/run.*.so \
    && test -f /app/ops/container_entrypoint.*.so \
    && test -f /app/ops/docker/start_store.*.so \
    && test -f /app/src/__init__.*.so \
    && test ! -f /app/src/app.py \
    && test ! -f /app/ops/container_entrypoint.py \
    && test -z "$(find /app/src /app/ops/docker \( -name '*.py' -o -name '*.pyc' \) -print -quit)"


FROM base AS app

ENV APP_DATA_DIR=/data \
    APP_PORT=18081 \
    APP_CLIENT_KEYS_DIR=/data/keys \
    APP_LICENSE_SERVER_URL= \
    APP_UPDATE_CHANNEL=docker \
    PYTHONPATH=/app

RUN mkdir -p /data /data/keys /run/secrets \
    && chown -R homeos:homeos /data /run/secrets /home/homeos

COPY --from=app-build --chown=homeos:homeos /app /app

EXPOSE 18081
VOLUME ["/data", "/run/secrets"]

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import ops.container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import ops.docker.start_app as m; m.main()"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${APP_PORT:-18081}/health/ready" >/dev/null || exit 1


FROM base AS store

ENV STORE_DATA_DIR=/data \
    STORE_LICENSE_KEYS_DIR=/data/license-keys \
    APP_CLIENT_KEYS_DIR=/data/keys \
    STORE_HOST=0.0.0.0 \
    STORE_PORT=18082 \
    PYTHONPATH=/app

RUN mkdir -p /data /data/license-keys /data/keys \
    && chown -R homeos:homeos /data /home/homeos

COPY --from=store-build --chown=homeos:homeos /app /app

EXPOSE 18082
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import ops.container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import ops.docker.start_store as m; m.main()"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${STORE_PORT:-18082}/healthz" >/dev/null || exit 1
