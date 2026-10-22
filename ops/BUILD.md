# 镜像构建细节

README 的「从源码构建镜像」只给命令；这份文档解释那条命令**为什么长这样**，以及出问题时的处置。
只想把镜像跑起来的话看 [README](../README.md) 就够了。

## 两阶段：先产出 dist/，再组装镜像

```
源码 ──①前端 Vite / ②后端 Cython──▶ 工作区根 dist/ ──③Dockerfile──▶ 运行镜像
```

镜像内**不再编译后端**，也不装前端依赖：它只消费根 `dist/`。所以本地构建必须按上面的顺序来，
跳过后端导出直接 `image` 会得到一个缺后端的镜像。

```bash
bun install
# ① + ② → 工作区根 dist/
bun run build:frontend
python3 ops/build.py backend              # 默认跟随宿主 Docker 架构
# ③ 从根 dist/ 组装（等价于 bun run image，走 Dockerfile 的 app / store 目标）
python3 ops/build.py image --project app   --tag homeos:local
python3 ops/build.py image --project store --tag homeos-store:local
```

## 前端为什么不做混淆

Vite 的 `build` 已经产出压缩产物：删注释、删类型、局部变量压到 1–2 字符、不生成 sourcemap。
`obfuscate_javascript.mjs`（已删除）曾在这之上再做一层 `stringArray` + 控制流平坦化，实测是负优化：

| 配置 | `static/assets/*.js` raw | gzip | 首屏 12 个 js（gzip） | 业务关键词命中数 |
| --- | --- | --- | --- | --- |
| Vite 压缩（现状） | 5.87 MB | 1.79 MB | 261 KB | 2,165 |
| 重型混淆（已移除） | 33.13 MB | 11.48 MB | 1,591 KB | 797 |

体积之外还有两点决定不再保留：

- **保护收益接近零**：`renameProperties: false` 是硬约束（属性名就是 API 契约），所以
  `scene` / `light` / `entity` 这些业务标识一律原样保留，grep 难度没有变化；UI 文案与
  `'/api/v1/...'` 路径也都在。`stringArray` 的 base64 表用 de4js 可直接 dump。
- **调试成本是真实的**：混淆后线上堆栈只剩 `_0x51e24b`，前端无法从错误报告反推函数；
  而授权判定在后端（`license_service`），前端不持有任何密钥。

真正需要保护的东西在后端：Cython `.so` + `strip --strip-all`，以及所有授权与密钥校验都在服务端。
`ops/ci/build_frontend_verify.sh` 保留了一条反向断言（产物里出现 `_0x` 即失败），
防止有人重新把这层加回来。

## 产物里为什么没有明文 `.py`

后端经 Cython 编译成 per-arch 的 `.so`，所以：

- **`dist/<项目>/backend/linux-<arch>/` 一份只对应一个架构**，amd64 / arm64 不能互搬。
  `--arch amd64|arm64` 可与宿主不同，但跨架构要过 QEMU，会慢很多。
- **产物里的包名是 `app`，不是 `src`**：源码目录按约定叫 `homeos/backend/src`，构建阶段用
  `COPY homeos/backend/src ./app` 映射过去再交给 Cython —— 模块名取自文件路径，映射之后
  `.so` 里烤进去的就是 `app.*`。主应用与商店用**同一条**映射（`.../src → ./app`），镜像里
  都是 `/app/app`，区别只在装什么、以什么入口启动。
- **没有任何明文 `.py`**：后端包之外，`dist/` 里也不含构建期脚本
  （Dockerfile 的构建阶段用 `find /app \( -name '*.py' -o -name '*.pyc' \)` 兜底断言）。
  全新库由后端按 ORM 元数据直接建（见主应用 `backend/src/platform/core/schema.py` 与商店
  `backend/src/core/schema.py` 的 `prepare_schema`）。

### strip 掉调试信息，但保留异常行号

编译后会对每个 `.so` 执行 `strip --strip-all`（见 `ops/docker/compile_python.py` 的
`_strip_extensions`）：去掉 DWARF 调试信息与 `.symtab` 静态符号，保留 `.dynsym`（动态加载靠它，
删了 `import` 就失败）。这样 `strings` 里不再出现 `__pyx_pf_*` 内部函数名与原始路径。

**Python 层的异常行号不受影响**：Cython 把「文件名 + 行号」作为常量编译进了机器码（供
`__Pyx_AddTraceback` 使用），不在 DWARF 里，所以 strip 之后线上堆栈依然是
`backend/src/.../config.py, line N`；丢掉的只是 gdb 级调试信息。

## 基础镜像的版本真源

默认基础镜像写在**唯一真源** [`ops/docker-pins.json`](docker-pins.json)（`upstream_tag` 与
`digest` 分开两行），并写进 `Dockerfile` 的 `ARG` 默认值与 `docker-compose.yml` 里那段
「可选：内置 Caddy 入口」的 caddy 镜像。升级基础镜像时改真源，并同步更新 Dockerfile / compose 中
的引用 —— 这三处是人工对账，没有脚本挡着。

### 构建期工具的精确版本

`--build-arg CYTHON_VERSION=3.2.9`、`PIP_VERSION=26.2.1`、`SETUPTOOLS_VERSION=84.0.0`。

这三个是**构建期工具**的精确版本，不是可有可无的美化：`pip install --upgrade pip` /
`pip install setuptools` 这类裸写法会让同一份源码随时间装出不同产物，而 `setuptools` 一收
`setuptools.command.*` 的兼容面，就会让 `ops/docker/compile_python.py` 直接编不过。

不传 `--build-arg HOMEOS_VERSION=0.8.0` 时，构建阶段会自己从 `package.json` 读版本号
（镜像内没有 VERSION 文件，版本号由构建期生成的 `src/_version.py` 携带）。

## 拉不动 Docker Hub / 要用私有仓库

典型报错是 `load metadata for docker.io/library/python:3.15-slim-bookworm` → `auth.docker.io`
超时。把基础镜像切到镜像站即可，**不必改 Dockerfile**：

```bash
# 方式一：命令行
python3 ops/build.py backend --base-mirror docker.m.daocloud.io

# 方式二：写进 .env（真实环境变量优先；ops/build.py 会读），之后 bun run build 直接可用
echo 'HOMEOS_BASE_MIRROR=docker.m.daocloud.io' >> .env
bun run build
```

也可以直接把基础镜像钉到任意镜像站 / 私有仓库：`--python-image <ref>`、`--caddy-image <ref>`。

> ⚠ 走 `--base-mirror`（或上面两个 `--*-image`）会**丢掉基础镜像的摘要钉版**：镜像站 / 私有
> 仓库是另一个仓库，`@sha256:…` 摘要必然与上游不同，照搬会直接拉不到，所以 `ops/build.py`
> 只保留 `tag` 并在构建期打印警告。正式产物走 CI 时用真源 `ops/docker-pins.json` 里钉死的
> `tag@digest`。

## CI 侧

`.github/workflows/docker.yml` **手动 `workflow_dispatch`**：构建并推送 `linux/amd64` +
`linux/arm64` 双架构镜像到 GHCR，tag 取仓库根 `package.json` 的 `version`（外加 `latest`）。
默认分支 push **不会**自动触发镜像构建，避免每次提交都推 GHCR。

轻检查（`.github/workflows/checks.yml`：typecheck / eslint / ruff / 前端构建 / 基建 lint）
**同样只手动触发**（`workflow_dispatch`，或由 `docker.yml` 通过 `uses:` 调起），push / PR
不再自动跑。`docker.yml` 复用它 `build` job 构建好的前端制品 —— 前端与 CPU 架构无关，
全流水线只构建一次。`.github/workflows/build-check.yml`（只构建、不推镜像）是只手动触发的
补充入口。三个工作流都手动，意味着推送本身不会触发任何构建或检查。
