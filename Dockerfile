# syntax=docker/dockerfile:1
# HomeOS 双镜像：app（主应用）与 store（授权商店 / 授权服务器）
# 保护策略：业务 JS 经 javascript-obfuscator 混淆；Python 经 Cython 编译成原生扩展
# （.so）后删除源码。运行镜像里读不到、也反编译不出后端代码。
#
# 构建：
#   docker build --target app   -t homeos-3d:local .
#   docker build --target store -t homeos-3d-store:local .
# 或直接用 GHCR 预构建镜像：docker-compose.store.yml + docker-compose.app.yml（先起商店）

# Cython 必须钉死版本：3.3.0 的 AnalyseExpressionsTransform 在本项目的
# backend/observability/global_log.py 上会崩溃（`(value or {}).items()` 触发类型推断
# 回归），3.1.x / 3.2.x 正常。升级前请先用两个 target 各跑一次构建验证。
ARG CYTHON_VERSION=3.1.6

# ─── 前端 / 商店静态资源混淆 ─────────────────────────────────────
FROM node:20-bookworm-slim AS js-tools

WORKDIR /opt/obfuscate
COPY docker/package.json docker/package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force
COPY docker/obfuscate_javascript.mjs ./


FROM js-tools AS frontend-protected

WORKDIR /work
COPY frontend ./frontend
RUN node /opt/obfuscate/obfuscate_javascript.mjs frontend \
    && ! grep -q '全局日志上报的启动引导' frontend/static/logging/global-log-boot.js \
    && grep -q . frontend/static/vendor/three/0.182.0/three.module.min.js


FROM js-tools AS store-static-protected

WORKDIR /work
COPY store/static ./store/static
RUN node /opt/obfuscate/obfuscate_javascript.mjs store/static \
    && ! grep -q '给商店静态资源补上版本号' store/static/store.js \
    && test -f store/static/jquery.min.js


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

COPY store/requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt


# ─── 主应用构建（源码仅存在于此阶段，产出全为 .so 的 /app）─────────
FROM base AS app-build
ARG CYTHON_VERSION

# 编译器只装在构建阶段：最终镜像从 base 拷 /app，工具链不进运行镜像。
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && pip install "cython==${CYTHON_VERSION}" setuptools

COPY docker/compile_python.py /tmp/compile_python.py
COPY container_entrypoint.py ./
COPY docker ./docker
COPY VERSION alembic.ini ./
COPY backend ./backend
COPY --from=frontend-protected /work/frontend ./frontend
COPY migrations ./migrations
COPY keys ./keys
RUN mkdir -p /app/image \
    && rm -f /app/docker/compile_python.py /app/docker/obfuscate_javascript.mjs /app/docker/package.json /app/docker/package-lock.json \
    && rm -rf /app/docker/node_modules \
    && python /tmp/compile_python.py /app \
    && rm -f /tmp/compile_python.py \
    && test -f /app/backend/main.*.so \
    && test -f /app/container_entrypoint.*.so \
    && test -f /app/docker/start_app.*.so \
    && test -f /app/migrations/env.py \
    && test -f /app/backend/__init__.*.so \
    && test ! -f /app/backend/main.py \
    && test ! -f /app/container_entrypoint.py \
    && test -z "$(find /app/backend /app/docker \( -name '*.py' -o -name '*.pyc' \) -print -quit)"


# ─── 商店构建（源码仅存在于此阶段，产出全为 .so 的 /app）──────────
FROM base AS store-build
ARG CYTHON_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && pip install "cython==${CYTHON_VERSION}" setuptools

COPY docker/compile_python.py /tmp/compile_python.py
COPY container_entrypoint.py ./
COPY docker ./docker
COPY VERSION ./
COPY store ./store
COPY --from=store-static-protected /work/store/static ./store/static
RUN rm -f /app/docker/compile_python.py /app/docker/obfuscate_javascript.mjs /app/docker/package.json /app/docker/package-lock.json \
    && rm -rf /app/docker/node_modules \
    && python /tmp/compile_python.py /app \
    && rm -f /tmp/compile_python.py \
    && test -f /app/store/app.*.so \
    && test -f /app/store/run.*.so \
    && test -f /app/container_entrypoint.*.so \
    && test -f /app/docker/start_store.*.so \
    && test -f /app/store/__init__.*.so \
    && test ! -f /app/store/app.py \
    && test ! -f /app/container_entrypoint.py \
    && test -z "$(find /app/store /app/docker \( -name '*.py' -o -name '*.pyc' \) -print -quit)"


# ─── 主应用运行镜像（18081）──────────────────────────────────────
FROM base AS app

ENV APP_DATA_DIR=/data \
    APP_PORT=18081 \
    APP_CLIENT_KEYS_DIR=/data/keys \
    APP_LICENSE_SERVER_URL=http://homeos-3d-store:18082 \
    APP_UPDATE_CHANNEL=docker \
    PYTHONPATH=/app

RUN mkdir -p /data /data/keys /run/secrets \
    && chown -R homeos:homeos /data /run/secrets /home/homeos

COPY --from=app-build --chown=homeos:homeos /app /app

EXPOSE 18081
VOLUME ["/data", "/run/secrets"]

# 入口脚本已编译成扩展模块，``python -m`` 无法运行扩展模块，故用 import + main()。
ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import docker.start_app as m; m.main()"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${APP_PORT:-18081}/health/ready" >/dev/null || exit 1


# ─── 商店运行镜像（18082）────────────────────────────────────────
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

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import docker.start_store as m; m.main()"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${STORE_PORT:-18082}/healthz" >/dev/null || exit 1
