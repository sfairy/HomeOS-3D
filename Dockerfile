# syntax=docker/dockerfile:1

#: 镜像版本号来自仓库根 package.json 的 version（CI 用 --build-arg HOMEOS_VERSION 传同一个值）：
#: 构建期写成 src/_version.py 再随源码一起编译，镜像里不再有 VERSION 文件。
ARG CYTHON_VERSION=3.2.9
#: 内置反代的 Caddy 二进制来源。Caddy 官方镜像是静态编译的 Go 二进制（/usr/bin/caddy），
#: 直接把它拷进 Debian 基础镜像即可运行。这里钉住小版本以保证可复现；升级时改这一行，
#: 或用 --build-arg CADDY_IMAGE=... 覆盖（也可换成 digest）。
ARG CADDY_IMAGE=caddy:2.11.4-alpine

# ─── 内置反代：只取 caddy 静态二进制，运行镜像不依赖这个基础镜像 ─────
FROM ${CADDY_IMAGE} AS caddy-bin

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


FROM python:3.14-slim-bookworm AS base

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

# 镜像内置反代：Caddy 静态二进制（配置由各角色最终阶段复制到 /etc/caddy/Caddyfile）。
# 放在 base 里，app / store 两个运行镜像都自带，不需要再单独拉一个 caddy 容器。
COPY --from=caddy-bin /usr/bin/caddy /usr/bin/caddy

WORKDIR /app

COPY homeos-3d/backend/src/requirements.txt /tmp/requirements-app.txt
COPY homeos-store/backend/src/requirements.txt /tmp/requirements-store.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements-app.txt -r /tmp/requirements-store.txt \
    && rm /tmp/requirements-app.txt /tmp/requirements-store.txt


FROM base AS app-build
ARG CYTHON_VERSION
#: 版本号唯一来源是仓库根 package.json 的 version；CI 用 build-arg 传同一个值。
ARG HOMEOS_VERSION=""

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && pip install "cython==${CYTHON_VERSION}" setuptools

COPY ops/docker/compile_python.py /tmp/compile_python.py
COPY ops/container_entrypoint.py ./ops/
COPY ops/license_keys.py ./ops/
COPY ops/docker ./ops/docker
COPY package.json /tmp/package.json
COPY homeos-3d/alembic.ini ./alembic.ini
COPY homeos-3d/backend/src ./backend/src
COPY --from=frontend-tools /work/homeos-3d/dist ./dist
# migrations/ 里的迁移脚本必须原样保留（compile_python.py 的 KEEP_SOURCE_PREFIXES 已含它）：
# alembic 是**读源码文件**来执行的，编译成 .so 之后它反而找不到脚本。
# 位置与导入名都不是随意定的：/app/alembic.ini 的 script_location=migrations，而
# migrations/env.py 按 backend.src.* 导入（见 backend/src/main.py 与 tools/smoke_pages.py），
# 所以后端必须落在 /app/backend/src，PYTHONPATH=/app 才能同时解析 backend.src.* 与 ops.*。
COPY homeos-3d/migrations ./migrations
# /app/image：内置素材目录（settings.built_in_assets_dir），默认空，可另行挂载增删。
# backend/src/_version.py 随后与其它源码一起被编译成 .so，运行期由 config.py 读取。
RUN mkdir -p /app/image \
    && rm -f /app/ops/docker/compile_python.py /app/ops/docker/obfuscate_javascript.mjs \
    && version="${HOMEOS_VERSION}" \
    && if [ -z "$version" ]; then \
         version="$(sed -n 's/^  "version":[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/package.json | head -n 1)"; \
       fi \
    && [ -n "$version" ] || { echo "无法确定版本号：package.json 缺 version 且未传 --build-arg HOMEOS_VERSION" >&2; exit 1; } \
    && printf '__version__ = "%s"\n' "$version" > /app/backend/src/_version.py \
    && echo "主应用构建版本：$version" \
    && python /tmp/compile_python.py /app \
    && rm -f /tmp/compile_python.py \
    && test -f /app/alembic.ini \
    && test -f /app/backend/src/main.*.so \
    && test -f /app/backend/src/__init__.*.so \
    && test -f /app/backend/src/_version.*.so \
    && test -f /app/ops/container_entrypoint.*.so \
    && test -f /app/ops/license_keys.*.so \
    && test -f /app/ops/docker/start_app.*.so \
    && test -f /app/migrations/env.py \
    && test ! -f /app/backend/src/main.py \
    && test ! -f /app/ops/container_entrypoint.py \
    && test -z "$(find /app/backend/src /app/ops/docker \( -name '*.py' -o -name '*.pyc' \) -print -quit)"


FROM base AS store-build
ARG CYTHON_VERSION
#: 版本号唯一来源是仓库根 package.json 的 version；CI 用 build-arg 传同一个值。
ARG HOMEOS_VERSION=""

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && pip install "cython==${CYTHON_VERSION}" setuptools

COPY ops/docker/compile_python.py /tmp/compile_python.py
COPY ops/container_entrypoint.py ./ops/
COPY ops/license_keys.py ./ops/
COPY ops/docker ./ops/docker
COPY package.json /tmp/package.json
COPY homeos-store/alembic.ini ./alembic.ini
COPY homeos-store/backend/src ./src
COPY --from=frontend-tools /work/homeos-store/dist ./dist
# db/ 里的迁移脚本必须原样保留（compile_python.py 的 KEEP_SOURCE_PREFIXES 已含它）：
# alembic 是**读源码文件**来执行的，编译成 .so 之后它反而找不到脚本。
COPY homeos-store/db ./db
# src/_version.py 随后与其它源码一起被编译成 .so，运行期由 src/__init__.py 读取。
# 末尾两条 test 是**结构约束**而不是重复检查：迁移文件一旦没随镜像走，代价是
# 「镜像推出去、用户机器上才发现容器起不来」—— 在这里失败，代价只是一次构建。
RUN rm -f /app/ops/docker/compile_python.py /app/ops/docker/obfuscate_javascript.mjs \
    && version="${HOMEOS_VERSION}" \
    && if [ -z "$version" ]; then \
         version="$(sed -n 's/^  "version":[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/package.json | head -n 1)"; \
       fi \
    && [ -n "$version" ] || { echo "无法确定版本号：package.json 缺 version 且未传 --build-arg HOMEOS_VERSION" >&2; exit 1; } \
    && printf '__version__ = "%s"\n' "$version" > /app/src/_version.py \
    && echo "商店构建版本：$version" \
    && python /tmp/compile_python.py /app \
    && rm -f /tmp/compile_python.py \
    && test -f /app/src/app.*.so \
    && test -f /app/src/run.*.so \
    && test -f /app/src/__init__.*.so \
    && test -f /app/src/_version.*.so \
    && test -f /app/ops/container_entrypoint.*.so \
    && test -f /app/ops/license_keys.*.so \
    && test -f /app/ops/docker/start_store.*.so \
    && test -f /app/alembic.ini \
    && test -f /app/db/migrations/env.py \
    && test ! -f /app/src/app.py \
    && test ! -f /app/ops/container_entrypoint.py \
    && test -z "$(find /app/src /app/ops/docker \( -name '*.py' -o -name '*.pyc' \) -print -quit)"


FROM base AS app

ENV APP_DATA_DIR=/data \
    APP_PORT=8801 \
    APP_CLIENT_KEYS_DIR=/data/client-keys \
    APP_LICENSE_SERVER_URL=\
    APP_UPDATE_CHANNEL=docker \
    PYTHONPATH=/app

RUN mkdir -p /data /data/client-keys /run/secrets \
    && chown -R homeos:homeos /data /run/secrets /home/homeos

COPY --from=app-build --chown=homeos:homeos /app /app
# 内置反代配置（Caddy 与 uvicorn 同容器，见 ops/docker/start_app.py）。
COPY ops/caddy/app.Caddyfile /etc/caddy/Caddyfile

EXPOSE 8801 8803
VOLUME ["/data", "/run/secrets"]

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import ops.container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import ops.docker.start_app as m; m.main()"]

# 同时探活应用与内置反代：反代挂了也算不健康（HTTP 直连端口此时仍可用）。
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 CMD curl -fsS "http://127.0.0.1:${APP_PORT:-8801}/health/ready" >/dev/null && curl -fsSk "https://localhost:8803/health/ready" >/dev/null


FROM base AS store

ENV STORE_DATA_DIR=/data \
    STORE_LICENSE_KEYS_DIR=/data/license-keys \
    APP_CLIENT_KEYS_DIR=/data/client-keys \
    STORE_HOST=0.0.0.0 \
    STORE_PORT=8802 \
    PYTHONPATH=/app

RUN mkdir -p /data /data/license-keys /data/client-keys \
    && chown -R homeos:homeos /data /home/homeos

COPY --from=store-build --chown=homeos:homeos /app /app
# 内置反代配置（Caddy 与商店同容器，见 ops/docker/start_store.py）。
COPY ops/caddy/store.Caddyfile /etc/caddy/Caddyfile

EXPOSE 8802 8804
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import ops.container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import ops.docker.start_store as m; m.main()"]

# 同时探活应用与内置反代：反代挂了也算不健康（HTTP 直连端口此时仍可用）。
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 CMD curl -fsS "http://127.0.0.1:${STORE_PORT:-8802}/healthz" >/dev/null && curl -fsSk "https://localhost:8804/healthz" >/dev/null
