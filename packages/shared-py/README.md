# homeos_shared —— 两个后端共享的 Python 源码

与 `packages/shared`（TS）并列的唯一真源。

## 为什么要它

主应用与授权商店各自独立部署、各自把后端编译成内嵌 `.so`，**运行期互不 import**。
但有些模块两边确实需要**同一份实现** —— 此前靠「两处各存一份」维持，代价是改一处必须记得改另一处。

这里换成**构建期源码共享**：真源唯一，在两个镜像的**各自构建阶段**被分别内联编译，
产物里各有一份**自己编译的副本** —— 不引入运行期跨项目依赖，也不产生副本漂移。

## 目录形状与「为什么是这个形状」

```text
packages/shared-py/
├── README.md            ← 本文件（**不进镜像**，故意放在包目录之外）
└── homeos_shared/       ← 可导入的包，名字稳定，不随 src→app 改名而变
    ├── __init__.py
    ├── logging_noise.py     ← 重载提示等例行启动噪音的过滤
    ├── status_log_dedupe.py ← 重复状态日志折叠（按数量级放行并注明折叠条数）
    ├── uvicorn_messages.py  ← uvicorn 英文启动文案 → 中文（两侧共用一份规则表）
    ├── http_access_log.py   ← HTTP/WebSocket 访问日志降噪（丢弃成功请求 + 折叠重复握手/请求）
    ├── file_lock.py
    ├── schema_core.py       ← 按 ORM 元数据建库与库完整性校验
    ├── schema_migrate.py    ← SQLite 版本化迁移内核（快照 → BEGIN IMMEDIATE → 按版本增量；失败即拒启动）
    ├── sqlite_email.py      ← 迁移里的「email 归一化 + 唯一索引」步骤（表名/补列 SQL 参数化）
    ├── http_cache.py        ← 条件请求判定（ETag / If-None-Match 协商，两个后端逐字相同）
    ├── client_ip.py         ← 可信代理链 → 真实客户端地址（安全判据，两侧共用）
    ├── rate_limit.py        ← 有界滑动窗口限流器（内存上限 + 淘汰）
    ├── password_policy.py   ← 口令强弱判据（8–128 位 + ASCII 字母与数字；主应用 / 商店后端共用）
    ├── license_transport.py ← 授权传输的协议参数（PROTOCOL / HKDF info / AAD / base64url / 规范 JSON）
    └── feature_codes.py     ← 能力码目录加载（内嵌副本 + 读 `ops/contracts/feature_codes.json`）
```

模块清单以 `ls packages/shared-py/homeos_shared/` 为准。

这个两层形状是被三处硬约束**同时**定出来的，不是随意选的：

1. **Dockerfile 的 `COPY` 语义**：`COPY <目录> <目标>` 复制的是目录**内容**，不是目录本身。
   故 `COPY packages/shared-py/homeos_shared ./homeos_shared` 得到 `/app/homeos_shared/*.py`；
   若写成 `COPY packages/shared-py ./homeos_shared`，就会多出一层
   `/app/homeos_shared/homeos_shared/`。
2. **本文件必须在被 COPY 的目录之外**：两个构建阶段末尾都有一条「`/app/homeos_shared` 下
   只允许 `.so`」的产物断言（`stray` 扫描）。`.md` 落在里面会被一起 COPY 进去、让构建失败；
   别处的做法是再加一条 `rm -f`（如商店阶段的 `rm -f /app/app/README.md`），但把说明文档
   放在包目录之外，这条约束就不必存在。
3. **源码态 `import homeos_shared.*`**：需要把 `packages/shared-py`（即 `homeos_shared/`
   的**父目录**）挂进 `sys.path`。这一步由两个后端的 `src/__init__.py` 完成
   （见 `_register_shared_python_root`，里面有「为什么放在包入口而不是各启动脚本」的说明）。

## 三处消费方式

| 场景 | 机制 |
| --- | --- |
| 镜像 | 两个构建阶段各 `COPY packages/shared-py/homeos_shared ./homeos_shared`，由 `compile_python.compile_tree` 一并编译成 `.so`；`PYTHONPATH=/app` 即可 `import homeos_shared` |
| 源码态（dev） | 后端 `src/__init__.py` 把 `packages/shared-py` 挂进 `sys.path` |
| 约定 | 两个构建阶段都必须 `COPY` 内联本包；后端不得再存同名副本 |

## 往里放东西的准则

只放「两个后端确实需要同一实现、且无业务耦合」的叶子模块（纯标准库最好）。有业务语义的
东西不放 —— 否则它会退化成新的上帝包，且改动会同时影响两个独立部署的服务。依赖方向只能是
「后端 → `homeos_shared`」，本包不得反向 import 任一后端。

新增一个模块时，**除了这个目录本身，别处都不用改**（也不该改）：
`COPY` / `find` 断言是整目录的，门槛是「后端不得有同名文件」这种通用判据，
`ruff.toml` 的 `known-first-party` 与 `pyrightconfig.json` 的 `extraPaths` 挂的都是
这个包目录而不是某个模块。

## 判据：什么进来、什么留在各自包内

- **进来**：两侧**逐字相同**、且漂移了本端**不会报错**的判定逻辑 —— 限流器参数与淘汰、可信代理解析、
  授权协议参数（HKDF `info` / AAD / base64url）、ETag 协商、日志降噪与文案表、迁移内核。
- **留在各自包内**：装配与错误语义。同一件事的差异如果是「商店用 `StoreSettings`、主应用用
  `database_url`」，或「一边抛 `LicenseCryptoError`、一边抛 `LicenseServerError(400)`」，合并只会
  得到一个塞满 `if` 的壳。据此 `database.py`、`run.py`、口令哈希（argon2id ↔ pbkdf2）、迁移**注册表**、
  「哪些路由可缓存」策略都维持两份，靠评审对齐。
- **适配层不算真源**：只做 `Request` → 共享函数的入参映射（如
  `platform/security/client_address.py`），判定逻辑一行都不许留在这里，否则就是第二份判据。

> 最后核对：2026-10-28（模块清单与路径已逐条验证）
