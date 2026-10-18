# 刻意不写 `# syntax=docker/dockerfile:1`：会额外出网拉前端镜像，且本文件未用到超出内置的语法。

# 基础镜像：**按 digest 钉死**（tag 后面跟 @sha256:<manifest-list 摘要>）。
#
# 只写 tag（`python:3.15-slim-bookworm`）是**可变引用**：上游随时重推同一个 tag，同一份
# 源码在不同时间构建出的镜像不同，且此前构建过的产物无法复现 —— 对「出货给客户的私有化
# 部署」是实打实的供应链风险（也是 .github/workflows/docker.yml 里 release 必须在
# 不可取消的 concurrency group 里跑的原因：单架构镜像已推、manifest list 没合成，就会留下
# 一个谁也说不清成分的镜像）。
#
# 钉的是 **manifest list 的摘要**，不是某个架构的镜像摘要 —— 这样 amd64 / arm64 各自
# 仍从同一个多架构清单里解析，构建矩阵照旧（钉单架构摘要会让另一个架构直接拉不到）。
# 换版本时必须同步改 tag 与摘要（真源 `ops/docker-pins.json`），避免只改一半。
#
# **apt 级版本不再逐个钉**：摘要已经把 apt 包索引钉在同一个 Debian 快照上，`ca-certificates` /
# `curl` / `tini` 每次拿到的都是那一份（`apt-get update` 读的就是该快照里的索引）；反过来写死
# `apt-get install ca-certificates=<版本>` 会在 bookworm 发小版本后**直接装不上**。真需要换 apt
# 包版本时，正确动作是升级上面的 digest。
#
# **Python 侧构建工具单独钉**（顶部 PIP_VERSION / SETUPTOOLS_VERSION / CYTHON_VERSION）：它们
# 来自 PyPI 而不是这个 Debian 快照，基础镜像摘要管不到，`pip install cython setuptools` 这类
# 裸包名会随上游滚动（见下方 ARG 处的说明）。
#
# 两个 ARG 整体指向镜像站/私有仓库（ops/build.py 的 --base-mirror）：镜像站是**另一个仓库**，
# 摘要必然不同，所以走镜像站时会显式去掉 `@sha256:…` 并在构建期打印警告（见 ops/build.py）。
ARG PYTHON_IMAGE=python:3.15-slim-bookworm@sha256:2a41267d9de9d358f77a1de356e0f16ecba8d39827855be0ce9ef4792edce402
ARG CADDY_IMAGE=caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f

#: 版本号来自仓库根 package.json，构建期写成 <包>/_version.py 随源码编译。
ARG CYTHON_VERSION=3.3.0
#: 构建期工具链版本。与基础镜像摘要同理：裸写包名（更别说 `pip install --upgrade pip`）
#: 会让「同一份源码、不同时间构建」装上不同版本的 pip / setuptools，而这两者恰恰是
#: 「昨天能编、今天编不过」的常客（setuptools 收紧过 `setuptools.command.*` 的兼容面，
#: 而 ops/docker/compile_python.py 直接用 `setuptools.command.build_ext`；
#: pip 大版本也会改依赖解析与元数据校验口径）。
#: 升级方式：改这里的默认值 —— 四个值都在构建日志里可见，且被
#: 构建期 pip 工具必须写成 `name==版本`，避免随时间装出不同产物。
ARG PIP_VERSION=26.2.1
ARG SETUPTOOLS_VERSION=84.0.0

# ─── 主应用内置反代：只取 caddy 静态二进制，运行镜像不依赖这个基础镜像 ─────
# 只有 app 运行镜像需要它（商店不提供 HTTPS，见下方 store 阶段），所以不放进 base，
# 免得白白把 ~50MB 的二进制带进商店镜像。
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

WORKDIR /app

# 运行期依赖的**唯一**安装输入是仓库根的 requirements.lock：每个依赖都钉了精确版本与
# sha256，由两个后端的 requirements.txt 合并生成（`python3 ops/ci/python_lock.py generate`）。
# 那两个 requirements.txt 仍留给开发期（`pip install -r requirements.txt` 走开区间），
# **不进镜像** —— 这样「同一份源码在不同时间构建出不同镜像」在这条链上也有了解药
# （此前唯一被钉住的只有顶部的基础镜像摘要与 pip/setuptools/cython）。
#
# 为什么合并成一份而不是每个后端一份：两个后端的依赖装进**同一层**（app / store 两个运行
# 镜像共用 base），所以实际安装的是两份要求的并集。两份各自独立解析的锁会对公共依赖
# （pydantic / starlette / httpx …）各钉一个版本，只重新生成其中一个就会让并集里出现两个
# 不同的 pin，pip 直接报解析冲突 —— 那是构建期才炸、症状还指向「某个传递依赖冲突」的坑。
COPY requirements.lock /tmp/requirements.lock
#: 构建容器连不上 pypi.org 时，由 ops/build.py 的 --pip-index 换成可达镜像。
ARG PIP_INDEX_URL=""
#: 复用顶部 ARG 的默认值（Docker 的规则：FROM 之前的 ARG 要在阶段内重新声明才能用）。
ARG PIP_VERSION
#: 运行期依赖装进 base：两个运行镜像共用这一层缓存。
#: pip 本身**钉版本**再 --upgrade：裸 `--upgrade pip` 每次构建都可能换一个 pip 大版本，
#: 而 pip 换版本会改依赖解析与元数据校验的口径 —— 那是「同一份源码、不同时间构建出不同
#: 镜像」的另一个入口，与基础镜像摘要漂移同类。
#: `--require-hashes` 是刻意的硬约束：锁里每个 pin 都必须带哈希，任何一项对不上（版本被改、
#: 镜像站的包与 PyPI 不一致）就直接失败，不留「警告后继续」的口子；它同时让 pip 拒绝一切
#: 没出现在锁里的传递依赖，等于把「运行期到底装了哪些包」钉死在这一个文件上。
#: PyYAML 6.0.3（uvicorn[standard] 的依赖）尚未发布 cp315 wheel，而本阶段没有编译器。
#: PYYAML_FORCE_LIBYAML=0 让它的构建关闭 C 扩展、产出纯 Python wheel —— PyYAML 在这里
#: 只服务于 uvicorn 的 YAML 日志配置，纯 Python 实现足够；等上游发布 cp315 wheel 后删掉。
RUN PYYAML_FORCE_LIBYAML=0 pip install --upgrade "pip==${PIP_VERSION}" ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    && PYYAML_FORCE_LIBYAML=0 pip install ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} --require-hashes \
        -r /tmp/requirements.lock \
    && rm /tmp/requirements.lock

#: Debian 包源同上，由 ops/build.py 换成就近镜像。
ARG APT_MIRROR=""
RUN if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
    fi


# 后端保护：Cython 编译成 .so 后删除 .py 源码。
# 主应用与商店共用这段流程，差异（源码目录、启动器、遗留目录）全部由 ARG PROJECT 派生；
# 「哪个项目配哪个 PROJECT」由 ops/build.py 的 PROJECTS 表约定。
# 产物经 --target backend-export 导出到根 dist/ 再 COPY 回运行阶段；前端不在本文件构建。
FROM base AS backend-build
#: 必传、无默认值：漏传时下面的 COPY 找不到源而失败；给默认值会静默编出另一个项目的后端。
ARG PROJECT
ARG CYTHON_VERSION
#: 同 CYTHON_VERSION：编译后端要用，**必须**精确版本（见顶部关于「同一份源码不同时间
#: 构建出不同产物」的说明）。`setuptools.command.build_ext` 是 compile_python.py 的直接依赖，
#: setuptools 一收兼容面就会在构建期炸。
ARG SETUPTOOLS_VERSION
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
    && pip install ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} "cython==${CYTHON_VERSION}" "setuptools==${SETUPTOOLS_VERSION}"

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
# 不是运行期跨镜像依赖（两侧各自内联编译副本）。
# 源写 <目录>/homeos_shared 而不是 <目录>：COPY 复制的是目录**内容**，写后者会多出一层
# /app/homeos_shared/homeos_shared/。
# 落点是 ./homeos_shared（而非 ./app 下）：PYTHONPATH=/app，包名要能在该根下直接解析。
COPY packages/shared-py/homeos_shared ./homeos_shared
# 位置与两个项目一致：后端落在 /app/app，PYTHONPATH=/app 才能同时解析 app.* 与 ops.*。
# /app/image：内置素材目录（settings.built_in_assets_dir，由 HOMEOS_IMAGE_DIR 指到此处），
# 默认空，可另行挂载增删。
# app/_version.py 随后与其它源码一起被编译成 .so，运行期由 config.py 读取。
RUN case "$PROJECT" in \
        homeos) start=app ;; \
        homeos-store) start=store ;; \
        *) echo "未知 PROJECT='$PROJECT'：本阶段只认 homeos / homeos-store；新增项目要同时改 ops/build.py 的 PROJECTS 与本行" >&2; exit 1 ;; \
    esac \
    && mkdir -p /app/image \
    && rm -f /app/ops/docker/compile_python.py \
    && version="${HOMEOS_VERSION}" \
    && if [ -z "$version" ]; then \
         version="$(sed -n 's/^  "version":[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/package.json | head -n 1)"; \
       fi \
    # 这里同样用 if 而不是 `|| { … }`：`||` 会兜住整条 && 链的失败，链上更早的一步出错
    # 也会打出「无法确定版本号」这条与真实原因无关的报错（理由详见末尾的 stray 断言）。
    && if [ -z "$version" ]; then echo "无法确定版本号：package.json 缺 version 且未传 --build-arg HOMEOS_VERSION" >&2; exit 1; fi \
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
    # 共享包必须真的编译到位。只断言 __init__（每个共享包都有），新增模块不必改这一行。
    && test -f /app/homeos_shared/__init__.*.so \
    # 产物里只允许有原生扩展：多一个 .py/.pyc/.pyi/.md 都算加密没做完整；报出具体文件名便于排查。
    # 刻意写成 `if` 而不是 `test -z "$stray" || { …; exit 1; }`：`||` 会兜住**整条 && 链**的失败，
    # 于是链上任何一步出错（实测：compile_python 的 import 门禁拦下绝对 `src.` 导入）都会打这一行，
    # 而那时 $stray 根本没被赋值 —— 报出来的是一条**空清单**，把排查方向带偏到「混入文件」。
    && stray="$(find /app/app /app/ops /app/homeos_shared -type f ! -name '*.so' -print)" \
    && if [ -n "$stray" ]; then echo "产物里混入了非 .so 文件：$stray" >&2; exit 1; fi

# 导出阶段：FROM scratch + 只 COPY /app，令 --output type=local 得到干净 /app 而非整个 rootfs。
FROM scratch AS backend-export
COPY --from=backend-build /app/ /


# 运行镜像：组装工作区根 dist/ 里已构建好的加密后端与前端产物（本阶段不编译后端源码）。
FROM base AS app

#: HOMEOS_BACKUPS_DIR：备份包落到数据卷 /data，重建容器不丢。
#: APP_ENVIRONMENT=production：运行镜像即生产（授权门禁、5xx 脱敏、MCP fail-closed 都读它，
#: 见 backend/src/config.py 的 environment_is_production）。这是**镜像层**的默认，宿主要覆盖
#: 可在 .env / compose 里显式改；LICENSE_REQUIRED 仍可单独覆盖（显式值优先）。
ENV APP_ENVIRONMENT=production \
    HOMEOS_DATA_DIR=/data \
    HOMEOS_BACKUPS_DIR=/data/backups \
    HOMEOS_PORT=8801 \
    APP_PORT=8801 \
    HOMEOS_IMAGE_DIR=/app/image \
    HOMEOS_ASSETS_DIR=/app/assets \
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

# 随包默认 UI 素材（图标 / 背景图 / 音效 / Logo）。
#
# 落点分两处，职责不同：
#   - ``/app/assets-default``：镜像内的**种子**，只读、随镜像升级而更新；
#   - ``/app/assets``：运行期的**实例目录**，compose 把宿主机 ``./assets`` bind mount 到这里，
#     管理员可以直接替换图 / 音效，不必重建镜像。
#
# bind mount 会整个遮住镜像里的同名目录，所以默认素材**不能只放 /app/assets**：
# 首次启动必须由 ``ops/container_entrypoint.py`` 从种子铺一份进去，否则
# ``/icons``、``/backgrounds``、``/sounds``、``/logo`` 会全部 404，并连带
# ``sw.js`` 的 ``cache.addAll(['/logo/logo.svg', …])`` 失败、Service Worker 装不上。
#
# 路径口径：``asset_paths`` 的解析顺序是「单项 env（ICONS_DIR 等）→ HOMEOS_ASSETS_DIR →
# REPO_ROOT/assets → PROJECT_ROOT/assets」。镜像里 PROJECT_ROOT=/app，所以不设 env 时实例
# 目录也正是 /app/assets；这里显式钉住 HOMEOS_ASSETS_DIR，让 entrypoint 与后端读同一份
# 环境变量，不给「两边各推一次」留漂移空间。
COPY --chown=homeos:homeos homeos/assets /app/assets-default
RUN mkdir -p /app/assets \
    && chown homeos:homeos /app/assets \
    && test -f /app/assets-default/logo/logo.svg \
    && test -d /app/assets-default/icons \
    && test -d /app/assets-default/backgrounds \
    && test -d /app/assets-default/sounds

# 内置素材目录：空目录可能不被 local 导出保留，这里补建。
RUN mkdir -p /app/image && chown homeos:homeos /app/image
# 内置反代：Caddy 静态二进制 + 配置（与 uvicorn 同容器，见 ops/docker/start_app.py）。
# 只装在 app 阶段：商店没有 HTTPS 入口，不需要这个二进制。
COPY --from=caddy-bin /usr/bin/caddy /usr/bin/caddy
COPY ops/caddy/app.Caddyfile /etc/caddy/Caddyfile

EXPOSE 8801 8803
VOLUME ["/data", "/run/secrets"]

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import ops.container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import ops.docker.start_app as m; m.main()"]

# 同时探活应用与内置反代：反代挂了也算不健康（HTTP 直连端口此时仍可用）。
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 CMD curl -fsS "http://127.0.0.1:${APP_PORT:-8801}/health/ready" >/dev/null && curl -fsSk "https://localhost:8803/health/ready" >/dev/null


FROM base AS store

ENV APP_ENVIRONMENT=production \
    STORE_DATA_DIR=/data \
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
# 商店**没有** HTTPS 入口：内网走 http://<局域网IP>:8802，公网由隧道 / 跳板机在 80·443 上
# 用真实证书终止 TLS（见 ops/deploy/TUNNEL-ACCESS.md）。镜像里不再内置 Caddy 反代，也就不存在
# 8804 —— 那是个自签端口，客户机（httpx 按系统 CA 校验）和支付平台都必然拒绝它。
EXPOSE 8802
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-c", "import ops.container_entrypoint as m; m.main()"]
CMD ["python", "-c", "import ops.docker.start_store as m; m.main()"]

# 商店对外提供的服务就是 8802，健康判定只探它。
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 CMD curl -fsS "http://127.0.0.1:${STORE_PORT:-8802}/healthz" >/dev/null
