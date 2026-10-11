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
#: 构建期写成 <包>/_version.py 再随源码一起编译，镜像里不再有 VERSION 文件。
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
#: 构建容器连不上 pypi.org 时（表现为卡在 Downloading 一动不动、且不报错）由
#: ops/build.py 的 --pip-index / HOMEOS_PIP_INDEX 传进来，换成可达的 PyPI 镜像。
ARG PIP_INDEX_URL=""
RUN pip install --upgrade pip ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    && pip install ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
        -r /tmp/requirements-app.txt -r /tmp/requirements-store.txt \
    && rm /tmp/requirements-app.txt /tmp/requirements-store.txt

#: Debian 包源同上：deb.debian.org 直连时单个包能等 30–80 秒，换成就近镜像
#: （如 mirrors.tuna.tsinghua.edu.cn 或 mirrors.aliyun.com），由 ops/build.py 传入。
ARG APT_MIRROR=""
RUN if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
    fi


# ═══ 后端保护：Cython 把 Python 源码编译成原生扩展（.so），随后删除 .py 源码 ═══
#
# 主应用与商店**共用这一段编译流程**（P5 合并）：两者的差异只有三处 —— 源码目录、启动器
# 模块名（start_app / start_store）、不得进产物的遗留目录（migrations / db）—— 全部由
# ARG PROJECT 派生，见下方那个 case。合并前是两份逐行复制的 app-build / store-build，
# 「改了一处忘了另一处」是迟早的事（共享包的 COPY 与 find 断言当时就各写了一遍）。
#
# 产物**不直接进运行镜像**，而是由 ops/build.py 用
#   docker buildx build --target backend-export --build-arg PROJECT=<项目目录> \
#     --output type=local,dest=dist/<项目名>/backend/linux-<arch>
# 导出到工作区根 dist/，再由运行阶段 COPY 回来。这样「加密后的后端」是一份可归档、
# 可跨镜像复用的产物，运行镜像里不再编译任何后端源码。
#
# 「哪个项目配哪个 PROJECT」由 ops/build.py 的 PROJECTS 表唯一决定：ops/check_deploy_
# independence.py 会核对那张表与下面 case 的分支一致、且应用侧只能取 homeos。给错值是
# 编出了**另一个项目**的后端 —— 镜像层面无法自证（单阶段 + ARG 是同一个模板），只能靠
# 这道门禁 + 全绿的冒烟来钉。
#
# 前端（Vite 构建 + JS 混淆）改由宿主机的 `bun run build:frontend` 产出，也落在根 dist/，
# 本文件不再承担前端构建。
FROM base AS backend-build
#: **必传、无默认值**：仓库内的项目目录名（homeos / homeos-store）。刻意不给默认值 ——
#: 漏传时下面的 `COPY ${PROJECT}/backend/src` 直接找不到源而失败；一旦给了默认值，
#: 「忘了传」就会静默编出另一个项目的后端，那种错只在运行期才暴露。
ARG PROJECT
ARG CYTHON_VERSION
#: 版本号唯一来源是仓库根 package.json 的 version；CI 用 build-arg 传同一个值。
ARG HOMEOS_VERSION=""

#: 同 base 阶段：构建容器连不上 pypi.org / deb.debian.org 时换成可达的镜像。
ARG PIP_INDEX_URL=""
ARG APT_MIRROR=""
#: apt 的超时 + 重试是必要的：直连 deb.debian.org 时会「连上但不传数据」，
#: 表现为构建卡死在某个 Get 上无限等；设了超时它才会自己重试或快速失败。
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
# 源码目录（仓库约定 `<项目>/backend/src`）在镜像里一律落到 ./app：Cython 的模块名取自路径，
# 所以 .so 里烤进去的是 app.*，产物里不会出现 src 目录。两个项目同层数、同包名 —— 它们只在
# 「装什么、跑什么」上不同，不再有 backend/ 这一层的差异。
# 左边由 ARG 拼出：写死任何一个项目名，另一个镜像就会装错源码（下面那个 case 与
# ops/check_deploy_independence.py 第 4 项都在防这件事）。
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
    # 启动器按项目取（start_app / start_store）。ops/docker/ 是仓库级目录，两个启动器都会进
    # 两个镜像，所以这里只断言「本项目的那个真的编译出来了」。
    && test -f /app/ops/docker/start_${start}.*.so \
    && test ! -f /app/app/app.py \
    && test ! -f /app/app/run.py \
    && test ! -f /app/ops/container_entrypoint.py \
    # 遗留目录（应用 migrations/、商店 db/）与 alembic.ini 都不该出现在产物里。
    && test ! -e /app/${banned} \
    && test ! -e /app/alembic.ini \
    # 共享包必须真的编译到位。只断言 __init__（每个共享包都有），新增模块不必改这一行。
    && test -f /app/homeos_shared/__init__.*.so \
    # 产物里只允许有原生扩展：多一个 .py/.pyc/.pyi/.md/requirements.txt 都算加密没做完整。
    # src/ 下的非 .py 残留（README.md / _version.pyi）已由 .dockerignore 的 `**/*.md`、
    # `**/*.pyi` 挡在构建上下文外，这里再兜一层 —— 报出具体文件名而不是只给一个非零退出码，
    # 否则排查得重新解包镜像。
    && stray="$(find /app/app /app/ops /app/homeos_shared -type f ! -name '*.so' -print)" \
    && test -z "$stray" || { echo "产物里混入了非 .so 文件：$stray" >&2; exit 1; }

# 导出阶段：FROM scratch + 只 COPY /app，令 --output type=local 得到干净的 /app 内容，
# 而不是整个 Debian rootfs（见 ops/build.py 的 export_backend）。PROJECT 由调用方按项目
# 传入，与上面那个阶段是同一次构建的同一个值 —— 阶段名不再区分项目，正是为了避免
# 「target 名与 PROJECT 值各说各话」。
FROM scratch AS backend-export
COPY --from=backend-build /app/ /


# ═══ 运行镜像：组装工作区根 dist/ 里已构建好的加密后端与前端产物 ═══
#
# 两阶段构建（先 `bun run build:frontend` + `ops/build.py backend`，再 `ops/build.py image`）：
# 本阶段不再编译任何后端源码，只 COPY dist/，因此构建极快、且拿到的就是被审计过的那份产物。
# BACKEND_PLATFORM 选平台子目录（Cython .so 与架构绑定，amd64 / arm64 各一份）。
FROM base AS app

#: HOMEOS_BACKUPS_DIR：服务器全量备份包落到数据卷。容器里 /app 不是卷，写在那里
#: 重建容器即丢；指到 /data 后与数据库 / 素材一起持久化。
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
