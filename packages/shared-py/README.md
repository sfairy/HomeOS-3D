"""两个后端共享的源码（**唯一真源**），与 ``packages/shared``（TS）并列。

为什么要它
----------
主应用与授权商店各自独立部署、各自把后端编译成内嵌 ``.so``，**运行期互不 import**。
但有些模块两边确实需要**同一份实现** —— 此前靠「两处各存一份」维持，代价是改一处必须记得改另一处。

这里换成**构建期源码共享**：真源唯一，在两个镜像的**各自构建阶段**被分别内联编译，
产物里各有一份**自己编译的副本** —— 不引入运行期跨项目依赖，也不产生副本漂移。

目录形状与「为什么是这个形状」
------------------------------
```
packages/shared-py/
├── README.md            ← 本文件（**不进镜像**，故意放在包目录之外）
└── homeos_shared/       ← 可导入的包，名字稳定，不随 src→app 改名而变
    ├── __init__.py
    ├── logging_noise.py   ← 重载提示与 alembic 例行播报的过滤
    ├── status_log_dedupe.py ← 重复状态日志折叠（按数量级放行并注明折叠条数）
    ├── uvicorn_messages.py ← uvicorn 英文启动文案 → 中文（两侧共用一份规则表）
    ├── http_access_log.py ← HTTP 访问日志降噪（按状态码丢弃成功请求 + 折叠重复）
    ├── file_lock.py
    ├── migrations_core.py
    ├── client_ip.py       ← 可信代理链 → 真实客户端地址（安全判据，两侧共用）
    ├── rate_limit.py      ← 有界滑动窗口限流器（内存上限 + 淘汰）
    ├── license_transport.py ← 授权传输的协议参数（PROTOCOL / HKDF info / AAD / base64url / 规范 JSON）
    └── feature_codes.py   ← 能力码目录加载（内嵌副本 + 读 ``ops/check/feature_codes.json``）
```

这个两层形状是被三处硬约束**同时**定出来的，不是随意选的：

1. **Dockerfile 的 ``COPY`` 语义**：``COPY <目录> <目标>`` 复制的是目录**内容**，不是目录本身。
   故 ``COPY packages/shared-py/homeos_shared ./homeos_shared`` 得到 ``/app/homeos_shared/*.py``；
   若写成 ``COPY packages/shared-py ./homeos_shared``，就会多出一层
   ``/app/homeos_shared/homeos_shared/``。
2. **本文件必须在被 COPY 的目录之外**：两个构建阶段末尾都有一条「``/app/homeos_shared`` 下
   只允许 ``.so``」的产物断言（`stray` 扫描）。``.md`` 落在里面会被一起 COPY 进去、让构建失败；
   别处的做法是再加一条 ``rm -f``（如商店阶段的 ``rm -f /app/app/README.md``），但把说明文档
   放在包目录之外，这条约束就不必存在。
3. **源码态 ``import homeos_shared.*``**：需要把 ``packages/shared-py``（即 ``homeos_shared/``
   的**父目录**）挂进 ``sys.path``。这一步由两个后端的 ``src/__init__.py`` 完成
   （见 ``_register_shared_python_root``，里面有「为什么放在包入口而不是各启动脚本」的说明）。

三处消费方式
------------
| 场景 | 机制 |
|------|------|
| 镜像 | 两个构建阶段各 ``COPY packages/shared-py/homeos_shared ./homeos_shared``，由 ``compile_python.compile_tree`` 一并编译成 ``.so``；``PYTHONPATH=/app`` 即可 ``import homeos_shared`` |
| 源码态（dev） | 后端 ``src/__init__.py`` 把 ``packages/shared-py`` 挂进 ``sys.path`` |
| 约定 | 两个构建阶段都必须 ``COPY`` 内联本包；后端不得再存同名副本 |

往里放东西的准则
----------------
只放「两个后端确实需要同一实现、且无业务耦合」的叶子模块（纯标准库最好）。有业务语义的
东西不放 —— 否则它会退化成新的上帝包，且改动会同时影响两个独立部署的服务。依赖方向只能是
「后端 → ``homeos_shared``」，本包不得反向 import 任一后端。

新增一个模块时，**除了这个目录本身，别处都不用改**（也不该改）：
``COPY`` / ``find`` 断言是整目录的，门槛是「后端不得有同名文件」这种通用判据，
``ruff.toml`` 的 ``known-first-party`` 与 ``pyrightconfig.json`` 的 ``extraPaths`` 挂的都是
这个包目录而不是某个模块。

分诊台账：评估过、且**已判定不共享**的模块
------------------------------------------
台账的作用是「别下轮再评估一次」。每一项都写清**为什么不能共享**，而不只是「没做」。

| 模块 | 结论 | 理由（实测） |
|------|------|--------------|
| `core/migrations.py` | **部分共享** → `homeos_shared/migrations_core.py` | 已下沉的与库结构/ORM 无关的叶子逻辑：读写 `alembic_version`、迁移前快照与保留、升级后 integrity/外键核对、脚本目录是否认识某 revision。**留在各自包内**的是编排与两侧确有差异的部分：主应用多出「退役列清理」「数据兼容地板」并返回备份路径，商店的备份/报错文案点名 `store.db.pre-migrate-*`；`_schema_drift`/`_schema_matches_orm` 依赖各自 `Base` 与 `security.schema_guard`；脚本目录布局不同（`migrations/` ↔ `backend/migrations/`）。 |
| `core/database.py` | **不共享** | 真正逐字相同的只有连接级 PRAGMA 那 4 行；其余是结构性差异：构造函数一边吃 `database_url`、一边吃 `StoreSettings`（并额外提供 `create_store_engine`），会话语义一边是 FastAPI `Depends` 用的生成器、一边是自带 commit/rollback 的 `@contextmanager`，且 `busy_timeout` 一边是毫秒常量、一边是秒常量。抽那条 PRAGMA 的收益（约 6 行）小于让最热的启动路径多一个共享包依赖 —— 维持两份，PRAGMA 集合靠评审对齐。 |
| `run.py` | **不共享** | 两边除了都调 `uvicorn.run` 之外几乎没有公共面：环境变量名（`PORT`/`HOMEOS_*` ↔ `STORE_RELOAD`/settings）、主机端口的来源（env 解析 ↔ `Settings`）、重载方式（字符串 factory + 关闭超时上限 ↔ `reload_dirs`）、以及一边要 `logging.basicConfig`、一边要首行打版本号。强行合并只会得到一个塞满 `if` 的壳。 |
| `security/limiter.py`（商店） | **已下沉** → `homeos_shared/rate_limit.py` | 商店版（有界 + 淘汰）本来就是正确实现，主应用版是无界全局字典；差异是**缺陷**而非设计选择，所以不是「两套各有理由」，而是「一份对、一份错」。商店文件保留为一行转发（导入路径有 5 处调用点，改路径只有噪音）。 |
| `security/request_security.py`（商店） | **部分共享** → `homeos_shared/client_ip.py` | 只把「可信代理链 → 真实客户端地址」这段纯判定下沉 —— 它是安全判据（限流分桶、审计记录、MCP IP 白名单都读它），两份副本必然分叉。**留在商店包内**的是 FastAPI 适配与同源校验：`request_is_https` / `same_origin_request` / CSP nonce / 500 页面，它们与商店的 Cookie、模板、Caddy 形态绑定，主应用没有对应物。 |
| 授权密码学：主应用 `domains/license/crypto.py` ↔ 商店 `licensing/crypto.py` | **部分共享** → `homeos_shared/license_transport.py` | 只下沉「两侧必须逐字节一致、且漂移了**本端不报错**」的协议参数：`PROTOCOL` 字面量、HKDF 的 `info`、AES-GCM 的 AAD 组成、无填充 base64url、规范化 JSON、keyId 判据。此前两处各写一遍：改一处本端不报错，只是派生密钥/AAD 不同，对手端解密必然失败（症状是「激活突然全挂」）。**留在各自包内**的是密码学调用与错误语义 —— 主应用抛 `LicenseCryptoError`（离线门禁）并多出租约 Ed25519 验签、`SecretCipher`；商店抛 `LicenseServerError(400)` 并多出 `LeaseSigner` / `KeyRegistry`。客户端 ↔ 服务端握手靠联调/人工验收。 |
| 能力码目录：主应用 `domains/license/features.py` ↔ 商店 `ops/features.py` | **部分共享** → `homeos_shared/feature_codes.py` | 只下沉目录加载与内嵌副本（两侧曾各粘一份 ~3KB JSON，且查找路径曾误写成 `ops/feature_codes.json` 永远 miss）。**留在各自包内**的是主应用门禁判定（`granted` / `expand` / `FEATURE_*`）与商店运营展示（`feature_catalog_payload` / 商品种子元组）。 |
| 主应用 `platform/security/client_address.py` | **适配层，不是真源** | 只做 `Request` → `homeos_shared.client_ip.resolve_client_address` 的入参映射（共享包刻意不依赖 FastAPI）。判定逻辑一行都不在这里，避免出现「第二份判据」。 |
| 口令哈希：主应用 `platform/security/passwords.py` ↔ 商店 `security/security.py` | **不共享** | 算法刻意不同：主应用 argon2id（兼容存量 bcrypt 首登迁移）；商店 pbkdf2。强行统一等于给存量库做一次密码学迁移，不在「抽共享」范围内。 |
| 访问日志降噪：主应用 `platform/core/access_log_noise.py` ↔ 商店 `security/access_log.py` | **部分共享** → `homeos_shared/http_access_log.py` | 下沉「按状态码丢弃成功请求」的过滤器与模式解析（`errors` / `off` / `all`、fail-open 取舍），以及「同一来源的重复 4xx/5xx 折叠成一行」的归纳键（临时端口不进键）。两侧差别只有变量名（`LOG_HTTP_ACCESS` ↔ `STORE_LOG_HTTP_ACCESS`）与说明日志挂哪棵树，而逻辑逐字相同 —— 分叉的代价是「一边收掉了噪音、另一边还在刷屏」，正是首装时找引导密钥横幅最容易被坑的地方。**留在各自包内**的是商店那类「即便成交也永远不是 2xx」的已知路径过滤（`/sm/*.map` 404），以及各自的选择与安装入口。 |
| 状态日志去重：主应用 `platform/core/status_log_dedupe.py` ↔ 商店（此前**没有**） | **已下沉** → `homeos_shared/status_log_dedupe.py` | 商店侧此前完全没有这一层，实测 110 次错误请求打出 80 行逐字相同的告警（有效信息 4 行，约 50:1）。判定与取舍（`error` 恒放行、生命周期文案恒放行、按数量级放行并补「同类已折叠 N 条」、多 handler 只判一次、访问日志与调用方点名的日志树一律放行）逐字相同，两侧各存一份必然分叉。**留在各自包内**的是变量名绑定（`LOG_STATUS_DEDUPE_MS` ↔ `STORE_LOG_STATUS_DEDUPE_MS`）、「过滤器挂到哪些 handler」的装配，以及商店那份「永不折叠」名单（`src.payments` / `src.ops.incidents`）。 |
| uvicorn 文案与上下文名：主应用 `platform/core/log.py` ↔ 商店 `core/console_log.py` | **部分共享** → `homeos_shared/uvicorn_messages.py` | 只下沉「英文启动文案 → 中文」的规则表与「uvicorn 日志器名 → 中文展示名」的映射，它跟着 uvicorn 版本走、两侧必须一致（否则同一台机器上两个服务的启动日志风格不同）。**留在各自包内**的是装配：主应用是 Nest 风格（颜色 / pid / traceId / JSON 行），商店是自己的时间戳行格式，两者刻意不同。 |
| alembic 例行播报过滤（「Context impl SQLiteImpl.」等） | **已下沉** → `homeos_shared/logging_noise.py`（与重载噪音同模块） | 两行常量每次启动都打、与本次迁移无关，却以另一套无时间戳格式混进启动日志。过滤规则逐字相同，且都必须在 `migrations/env.py` 的 `fileConfig` 之后安装，属于同一件事，故并入既有的降噪模块（该模块原先只放「重载噪音」）。 |
"""
