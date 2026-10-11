# 刻意不写 `# syntax=docker/dockerfile:1`：会额外出网拉前端镜像，且本文件未用到超出内置的语法。

# 基础镜像：两个 ARG 可整体指向镜像站/私有仓库（ops/build.py 的 --base-mirror）。
ARG PYTHON_IMAGE=python:3.14-slim-bookworm
ARG CADDY_IMAGE=caddy:2.11.4-alpine

#: 版本号来自仓库根 package.json，构建期写成 <包>/_version.py 随源码编译。
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

COPY homeos/backend/requirements.txt /tmp/requirements-app.txt
COPY homeos-store/backend/requirements.txt /tmp/requirements-store.txt
#: 构建容器连不上 pypi.org 时，由 ops/build.py 的 --pip-index 换成可达镜像。
ARG PIP_INDEX_URL=""
RUN pip install --upgrade pip ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    && pip install ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
        -r /tmp/requirements-app.txt -r /tmp/requirements-store.txt \
    && rm /tmp/requirements-app.txt /tmp/requirements-store.txt

#: Debian 包源同上，由 ops/build.py 换成就近镜像。
ARG APT_MIRROR=""
RUN if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
    fi


# 后端保护：Cython 编译成 .so 后删除 .py 源码。
# 主应用与商店共用这段流程，差异（源码目录、启动器、遗留目录）全部由 ARG PROJECT 派生；
# 「哪个项目配哪个 PROJECT」由 ops/build.py 的 PROJECTS 表与 ops/check_deploy_independence.py 对账。
# 产物经 --target backend-export 导出到根 dist/ 再 COPY 回运行阶段；前端不在本文件构建。
FROM base AS backend-build
#: 必传、无默认值：漏传时下面的 COPY 找不到源而失败；给默认值会静默编出另一个项目的后端。
ARG PROJECT
ARG CYTHON_VERSION
#: 版本号唯一来源是仓库根 package.json 的 version；CI 用 build-arg 传同一个值。
ARG HOMEOS_VERSION=""

#: 同 base 阶段：构建容器连不上 pypi.org / deb.debian.org 时换成可达的镜像。
ARG PIP_INDEX_URL=""
ARG APT_MIRROR=""
#: apt 超时+重试：直连 deb.debian.org 会「连上但不传数据」而无限卡住。
RUN if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get -o Acquire::http::Timeout=20 -o Acquire::Retries=5 update \
    && apt-get -o Acquire::http::Timeout=20 -o Acquire::Retries=5 install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && pip install ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} "cython==${CYTHON_VERSION}" setuptools

COPY ops/docker/compile_python.py /tmp/compile_python.py
COPY ops/container_entrypoint.py ./ops/
COPY ops/license_keys.py ./ops/
COPY ops/docker ./ops/docker
COPY package.json /tmp/package.json
# 源码目录一律落到 ./app：Cython 模块名取自路径，产物里不会出现 src 目录。
# 左边由 ARG 拼出，写死任一个项目名会让另一个镜像装错源码。
COPY ${PROJECT}/backend/src ./app
# 共享 Python 包（真源 packages/shared-py，见其 README）：本阶段自己 COPY 一份再编译，
# 于是两个镜像里各有一份自己编译的 homeos_shared/*.so —— 是「源码共享 + 各自内联」，
# 不是运行期跨镜像依赖（ops/check_deploy_independence.py 的第 5 项钉死这一点）。
# 源写 <目录>/homeos_shared 而不是 <目录>：COPY 复制的是目录**内容**，写后者会多出一层
# /app/homeos_shared/homeos_shared/。
# 落点是 ./homeos_shared（而非 ./app 下）：PYTHONPATH=/app，包名要能在该根下直接解析。
COPY packages/shared-py/homeos_shared ./homeos_shared
# 迁移脚本（主应用的 migrations/ 与 alembic.ini、商店的 db/）**不进产物**：发行版里没有
# Alembic，新库由 app.migrations 按 ORM 元数据直接建（基线 0001 与 Base.metadata 等价，
# ops/check_schema.py 会比对结构指纹）。位置与两个项目一致：后端落在 /app/app，
# PYTHONPATH=/app 才能同时解析 app.* 与 ops.*。该禁哪个目录由下面的 case 给出。
# /app/image：内置素材目录（settings.built_in_assets_dir，由 HOMEOS_IMAGE_DIR 指到此处），
# 默认空，可另行挂载增删。
# app/_version.py 随后与其它源码一起被编译成 .so，运行期由 config.py 读取。
RUN case "$PROJECT" in \
        homeos) start=app; banned=migrations ;; \
        homeos-store) start=store; banned=db ;; \
        *) echo "未知 PROJECT='$PROJECT'：本阶段只认 homeos / homeos-store；新增项目要同时改 ops/build.py 的 PROJECTS 与本行" >&2; exit 1 ;; \
    esac \
    && mkdir -p /app/image \
    && rm -f /app/ops/docker/compile_python.py /app/ops/docker/obfuscate_javascript.mjs \
    && version="${HOMEOS_VERSION}" \
    && if [ -z "$version" ]; then \
         version="$(sed -n 's/^  "version":[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/package.json | head -n 1)"; \
       fi \
    && [ -n "$version" ] || { echo "无法确定版本号：package.json 缺 version 且未传 --build-arg HOMEOS_VERSION" >&2; exit 1; } \
    && printf '__version__ = "%s"\n' "$version" > /app/app/_version.py \
    && echo "后端构建版本：$version（$PROJECT → /app/app）" \
    && python /tmp/compile_python.py /app \
    && rm -f /tmp/compile_python.py \
    && test -f /app/app/app.*.so \
    && test -f /app/app/run.*.so \
    && test -f /app/app/__init__.*.so \
    && test -f /app/app/_version.*.so \
    && test -f /app/ops/container_entrypoint.*.so \
    && test -f /app/ops/license_keys.*.so \
    # 启动器按项目取（start_app / start_store）；两个启动器都进两个镜像，只断言本项目那个。
    && test -f /app/ops/docker/start_${start}.*.so \
    && test ! -f /app/app/app.py \
    && test ! -f /app/app/run.py \
    && test ! -f /app/ops/container_entrypoint.py \
    # 遗留目录（应用 migrations/、商店 db/）与 alembic.ini 都不该出现在产物里。
    && test ! -e /app/${banned} \
    && test ! -e /app/alembic.ini \
    # 共享包必须真的编译到位。只断言 __init__（每个共享包都有），新增模块不必改这一行。
    && test -f /app/homeos_shared/__init__.*.so \
    # 产物里只允许有原生扩展：多一个 .py/.pyc/.pyi/.md 都算加密没做完整；报出具体文件名便于排查。
    && stray="$(find /app/app /app/ops /app/homeos_shared -type f ! -name '*.so' -print)" \
    && test -z "$stray" || { echo "产物里混入了非 .so 文件：$stray" >&2; exit 1; }

# 导出阶段：FROM scratch + 只 COPY /app，令 --output type=local 得到干净 /app 而非整个 rootfs。
FROM scratch AS backend-export
COPY --from=backend-build /app/ /


# 运行镜像：组装工作区根 dist/ 里已构建好的加密后端与前端产物（本阶段不编译后端源码）。
FROM base AS app

#: HOMEOS_BACKUPS_DIR：备份包落到数据卷 /data，重建容器不丢。
ENV APP_DATA_DIR=/data \
    HOMEOS_DATA_DIR=/data \
    HOMEOS_BACKUPS_DIR=/data/backups \
    HOMEOS_PORT=8801 \
    APP_PORT=8801 \
    HOMEOS_IMAGE_DIR=/app/image \
    HOMEOS_FRONTEND_DIR=/app/dist \
    APP_CLIENT_KEYS_DIR=/data/client-keys \
    APP_LICENSE_SERVER_URL=\
    APP_UPDATE_CHANNEL=docker \
    PYTHONPATH=/app

#: 后端 .so 的平台目录名（linux-amd64 / linux-arm64），由构建方按目标架构指定。
ARG BACKEND_PLATFORM=linux-amd64

RUN mkdir -p /data /data/backups /data/client-keys /run/secrets \
    && chown -R homeos:homeos /data /run/secrets /home/homeos

# 加密后端（纯 Cython .so，无任何明文 .py）与前端产物都来自工作区根 dist/。
COPY --chown=homeos:homeos dist/homeos/backend/${BACKEND_PLATFORM} /app
COPY --chown=homeos:homeos dist/homeos/frontend /app/dist
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

# 加密后端（纯 Cython .so，无任何明文 .py）与前端产物都来自工作区根 dist/。
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
