# 刻意**不写** `# syntax=docker/dockerfile:1`：那一行会让每次构建都先去 Docker Hub
# 拉一次前端镜像（实测 120s，网络差时直接超时失败），而本文件没有用到任何超越内置
# 前端的语法（多阶段 / scratch / ARG before FROM / COPY --chown 都是内置支持）。

# ─── 基础镜像（可用镜像站覆盖）─────────────────────────────────────
#
# Docker Hub 在部分网络下拉不动（auth.docker.io 超时）。这两个 ARG 让整个基础镜像
# 可以整体指向镜像站 / 私有仓库，而不必改本文件：
#
#   docker buildx build \
#     --build-arg PYTHON_IMAGE=docker.m.daocloud.io/library/python:3.14-slim-bookworm \
#     --build-arg CADDY_IMAGE=docker.m.daocloud.io/library/caddy:2.11.4-alpine ...
#
# ops/build.py 的 --base-mirror（或 HOMEOS_BASE_MIRROR 环境变量）会自动拼出这两个引用，
# 例如 `HOMEOS_BASE_MIRROR=docker.m.daocloud.io bun run build:backend`。
ARG PYTHON_IMAGE=python:3.14-slim-bookworm
ARG CADDY_IMAGE=caddy:2.11.4-alpine

#: 镜像版本号来自仓库根 package.json 的 version（CI 用 --build-arg HOMEOS_VERSION 传同一个值）：
#: 构建期写成 src/_version.py 再随源码一起编译，镜像里不再有 VERSION 文件。
ARG CYTHON_VERSION=3.2.9

# ─── 内置反代：只取 caddy 静态二进制，运行镜像不依赖这个基础镜像 ─────
FROM ${CADDY_IMAGE} AS caddy-bin

FROM ${PYTHON_IMAGE} AS base

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


# ═══ 后端保护：Cython 把 Python 源码编译成原生扩展（.so），随后删除 .py 源码 ═══
#
# 这两段产物**不直接进运行镜像**，而是由 ops/build.py 用
#   docker buildx build --target app-export --output type=local,dest=dist/homeos-3d/backend/linux-<arch>
# 导出到工作区根 dist/，再由运行阶段 COPY 回来。这样「加密后的后端」是一份可归档、
# 可跨镜像复用的产物，运行镜像里不再编译任何后端源码。
#
# 前端（Vite 构建 + JS 混淆）改由宿主机的 `bun run build:frontend` 产出，也落在根 dist/，
# 本文件不再承担前端构建。
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
# migrations/ 里的迁移脚本必须原样保留（compile_python.py 的 KEEP_SOURCE_PREFIXES 已含它）：
# alembic 是**读源码文件**来执行的，编译成 .so 之后它反而找不到脚本。
# 位置与导入名都不是随意定的：/app/alembic.ini 的 script_location=migrations，而
# migrations/env.py 按 backend.src.* 导入（见 backend/src/main.py），
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

# 导出阶段：FROM scratch + 只 COPY /app，令 --output type=local 得到干净的 /app 内容，
# 而不是整个 Debian rootfs（见 ops/build.py 的 export_backend）。
FROM scratch AS app-export
COPY --from=app-build /app/ /


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

FROM scratch AS store-export
COPY --from=store-build /app/ /


# ═══ 运行镜像：组装工作区根 dist/ 里已构建好的加密后端与前端产物 ═══
#
# 两阶段构建（先 `bun run build:frontend` + `ops/build.py backend`，再 `ops/build.py image`）：
# 本阶段不再编译任何后端源码，只 COPY dist/，因此构建极快、且拿到的就是被审计过的那份产物。
# BACKEND_PLATFORM 选平台子目录（Cython .so 与架构绑定，amd64 / arm64 各一份）。
FROM base AS app

ENV APP_DATA_DIR=/data \
    APP_PORT=8801 \
    APP_CLIENT_KEYS_DIR=/data/client-keys \
    APP_LICENSE_SERVER_URL=\
    APP_UPDATE_CHANNEL=docker \
    PYTHONPATH=/app

#: 后端 .so 的平台目录名（linux-amd64 / linux-arm64），由构建方按目标架构指定。
ARG BACKEND_PLATFORM=linux-amd64

RUN mkdir -p /data /data/client-keys /run/secrets \
    && chown -R homeos:homeos /data /run/secrets /home/homeos

# 加密后端（Cython .so + 保留的 migrations 源码）与前端产物都来自工作区根 dist/。
COPY --chown=homeos:homeos dist/homeos-3d/backend/${BACKEND_PLATFORM} /app
COPY --chown=homeos:homeos dist/homeos-3d/frontend /app/dist
# 内置素材目录：空目录可能不被 local 导出保留，这里补建。
RUN mkdir -p /app/image && chown homeos:homeos /app/image
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

ARG BACKEND_PLATFORM=linux-amd64

RUN mkdir -p /data /data/license-keys /data/client-keys \
    && chown -R homeos:homeos /data /home/homeos

# 加密后端（Cython .so + 保留的 db/migrations 源码）与前端产物都来自工作区根 dist/。
COPY --chown=homeos:homeos dist/homeos-store/backend/${BACKEND_PLATFORM} /app
COPY --chown=homeos:homeos dist/homeos-store/frontend /app/dist
# 内置反代配置（Caddy 与商店同容器，见 ops/docker/start_store.py）。
COPY ops/caddy/store.Caddyfile /etc/caddy/Caddyfile

EXPOSE 8802 8804
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import ops.container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import ops.docker.start_store as m; m.main()"]

# 同时探活应用与内置反代：反代挂了也算不健康（HTTP 直连端口此时仍可用）。
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 CMD curl -fsS "http://127.0.0.1:${STORE_PORT:-8802}/healthz" >/dev/null && curl -fsSk "https://localhost:8804/healthz" >/dev/null
