# 重构方案

原则：**行为不变**。每一处改动都必须能在「改完之后的运行结果与改之前逐字相同」这个意义上被验证，
而不是「看起来更干净」。据此，本次只做两类事：

1. **同一份数据/契约被声明两遍** → 收成一份，另一处改为派生（R1、R2、R3）；
2. **同一段模板被写两遍** → 就地抽成组件（R4）。

不做 R5 这类「减少行数」之外的事吗？做，但它的价值是**防止未来重复**，并明确标注不产生行数收益。

---

## R1 Python 配置默认值单点化

**问题**：`domains/app_config/defaults.py` 是默认值权威源，但 `domains/security/config.py`
与 `domains/notification/config.py` 各自又抄了一遍字面量。

**改法**（`homeos/backend/src/domains/security/config.py`）：

```python
from ..app_config.defaults import DEFAULT_APP_CONFIG
import copy

DEFAULT_SECURITY_CONFIG: dict[str, Any] = {
    **copy.deepcopy(DEFAULT_APP_CONFIG["security"]),
    "manualArmLockSec": 300,
}
DEFAULT_FRONTEND_CONFIG: dict[str, Any] = {
    "maxRemoteNotifications": DEFAULT_APP_CONFIG["frontend"]["maxRemoteNotifications"],
}
DEFAULT_NOTIFICATION_CONFIG: dict[str, Any] = {
    "maxNotifications": DEFAULT_APP_CONFIG["notification"]["maxNotifications"],
}
```

`notification/config.py` 同理，四个整段字面量改为 `copy.deepcopy(DEFAULT_APP_CONFIG[<section>])`，
`DEFAULT_OTHER_CONFIG` 只取它真正用到的两个键。

**为什么用 `deepcopy` 而不是直接引用**：`DEFAULT_APP_CONFIG` 是模块级单例，直接引用会把
「每个模块各有一份独立可变字面量」悄悄变成「全仓共享同一个 `dict` / `list`」——
`presencePersons`、`alertChannels`、`circuitEntityIds` 都是可变容器。深拷贝把旧语义原样保住。

**为什么 `manualArmLockSec` 留在安防侧**：它只被安防联动读取；放进 `DEFAULT_APP_CONFIG`
会多出一个前端也要渲染的分区字段，属于行为变更。

**行为等价性证据**（`security/config.py` / `notification/config.py` 的实际键集：

| 常量 | 前 | 后 | 依据 |
|---|---|---|---|
| `DEFAULT_SECURITY_CONFIG` | 26 键 | 26 键 | `DEFAULT_APP_CONFIG["security"]` 25 键 + `manualArmLockSec` |
| `DEFAULT_FRONTEND_CONFIG` | 1 键 | 1 键 | `frontend.maxRemoteNotifications` |
| `DEFAULT_NOTIFICATION_CONFIG`（安防侧） | 1 键 | 1 键 | `notification.maxNotifications` |
| `DEFAULT_NOTIFICATION_CONFIG`（通知侧） | 9 键 | 9 键 | `notification` 全分区 |
| `DEFAULT_ENERGY_CONFIG` | 10 键 | 10 键 | `energy` 全分区 |
| `DEFAULT_WATER_CONFIG` | 2 键 | 2 键 | `water` 全分区 |
| `DEFAULT_IAQ_CONFIG` | 1 键 | 1 键 | `iaq` 全分区 |
| `DEFAULT_OTHER_CONFIG` | 2 键 | 2 键 | `other` 的子集 |

验证脚本逐项 `assert` 了 8 个常量的完整键值、**键顺序**，并额外断言「修改派生常量不会污染
`DEFAULT_APP_CONFIG`」。结果见 `04-verification.md`。

**风险与兜底**：`domains/security` 新增一条指向 `domains/app_config` 的依赖边。
`app_config` 不反向依赖 `security`，因此不构成环；仍以 `check:backend-deps`（B4/B5）为准。
若将来出现环，退路是把纯数据分区下沉到叶子模块 `domains/app_config/sections.py`，
两处都从它取。

---

## R2 迁移助手收敛到 `packages/shared-py`

**问题**：主后端 `platform/core/db/migrations.py` 与商店 `core/persistence/migrations.py`
各有一份 `_normalize_all_datetimes` —— 同一套 SQLite PRAGMA 语义逐字写了两遍。

**改法**：`packages/shared-py/homeos_shared/sqlite_introspect.py` 新增

```python
def normalize_all_datetimes(connection, *, skip_tables=("schema_migrations",)) -> int:
    ...
```

两个注册表的本地实现缩成 3 行适配：

```python
def _normalize_all_datetimes(connection, context):
    changed = normalize_all_datetimes(connection)
    if changed:
        context.logger.warning("已归一化 %s 个时间字段为 UTC-naive", changed)
```

**保留 3 行适配而不是让共享层吃 `MigrationContext`**：两边的 `context.logger` 分属不同进程/项目，
日志留在调用侧才对；共享层只返回改动计数。

**顺带修掉一处非确定性**：主后端原实现按 `_columns()` 返回的 **set** 顺序遍历列，
同一份数据在不同进程里可能以不同顺序被 UPDATE。合并后统一按 `PRAGMA table_info` 的**声明顺序**。
SQLite 上顺序不影响最终结果，但确定性的执行顺序对「逐字相同的两次运行」是可验证的。

**行为等价性证据**（内存库实测）：建 `t(id, created_at DATETIME, plain TEXT, d DATE)`，
塞入带 `+08:00` 偏移、带 `T` 分隔符、19 字符、26 字符四种形态，跑一遍后断言：

- 改了 3 个字段（2 个 `created_at` + 1 个 `d`）；
- 已是 26 字符形态的值**不动**；
- 19 字符形态（`2024-01-01 02:00:00`）**不动** —— 这与旧实现的「长度不是 19/26 才算脏」完全一致；
- `plain TEXT` 列**永不参与**；
- `schema_migrations` 表被跳过；
- 再跑一遍返回 0（幂等）。

---

## R3 语音告警默认矩阵单点化

**问题**：`homeos/frontend/src/shared/utils/config/frontend-config.ts` 里内联了 14 个布尔键的
`ttsAlerts` 对象，与 `packages/shared/src/notification/voice-alert.ts` 的
`DEFAULT_VOICE_ALERT_RULES` 逐字相同。

**改法**：

1. `packages/shared/package.json` 的 `exports` 增加 subpath
   `"./notification/voice-alert": "./src/notification/voice-alert.ts"`。
   走 subpath 而非根 barrel，符合该包「浏览器侧只打包被引用的那一个文件」的既有边界。
2. `frontend-config.ts` 改为 `ttsAlerts: { ...DEFAULT_VOICE_ALERT_RULES }`。

**为什么展开而不是直接赋引用**：调用方会就地改这个对象，共享单例会被跨实例改写。

**行为等价性**：14 个键与默认值逐项相同（已核对）。

---

## R4 Vue 模板重复片段抽取（3 处，4 个新组件）

| 目标 | 重复形态 | 处理 | 消除行数 |
|---|---|---|---:|
| `features/home-mode/editor/HomeModeContextBar.vue` | `<details>` 分支与 `v-else` 分支的 22 行 pill 标记逐字相同 | 抽 `HomeModeContextPill.vue`（props: `pill`；emit: `pill-click`） | 24 |
| `components/widgets/system/NotificationCenter.vue` | 固定分页分支与虚拟列表插槽内的 46 行通知行逐字相同 | 抽 `NotificationRowContent.vue`（props: `n` / `icon` / `iconClass` / `hasLink`；emit: `action-prompt` / `dismiss`） | 43→19 |
| `features/settings/automate/linkage/PresenceSection.vue` | 完整头部与嵌入态工具条各有一份 13 行摘要 + 18 行按钮组 | 抽 `PresenceStatusMeta.vue` + `PresenceActions.vue` | 37（M2 口径） |

### 两个刻意的设计选择

**(a) `NotificationRowContent` 不自己算级别映射。**
`levelIcon()` / `levelColor()` 属于 `useNotificationCenter`（闭包里的 composable 返回值），
若复制进子组件就变成第二处真相 —— 「图标改了颜色没改」。因此由调用方算好，以 `icon` /
`iconClass` 传入。代价是多 2 个 prop，换来级别映射仍然只有一份。

**(b) `HomeModeContextPill` 接管「有没有 section」的判断。**
旧模板里 `role` / `tabindex` / 三个键位事件与 `@click` 是 5 个必须同时出现的属性，
抽组件后由子组件统一决定，父级的 `onPillClick(section)` 不再重复判空。
实测渲染结果：5 个 pill 中「在场」「日历」两个（无 section）`role=null`、`tabindex=null`；
「自动触发」「全屋动作」「联动」三个（有 section）`role=button`、`tabindex=0` —— 与改动前逐字一致。

---

## R5 跨语言契约对齐门禁（不减少行数）

**问题**：`modules/interaction3d/extra_types.py` 的 `EXTRA_TYPES`（45 条）与
`studio/runtime/climate/purifier-extras.ts` 的 `extraTypes()`（43 条）是同一张
「HA 域 → 控制类型」表。两端不一致的后果是「面板能显示、命令发不出去」，**两侧单测都看不出来**。

**改法**：新增 `ops/checks/check_extra_types_parity.py`，接进 `gate:static`。

- **不做代码生成**：跨语言生成器本身会成为第三处真相，还要维护模板与产物的一致性。
  只做断言。
- **口径是「语义等价」而非「逐字相同」**：Python 显式登记 `sensor` / `binary_sensor` 为 `state`，
  TS 靠 `return ['state']` 兜底 —— 语义相同，所以断言写成「两端非 `state` 映射逐条相等」+
  「Python 登记为 `state` 的域，TS 不得映射成可写类型」。
- **解析失败即报错，不静默通过**：TS 侧用正则从 `extraTypes()` 里抠出
  `[...].includes(domain)` 名单与 `const mapped = {...}` 字面量；实现形状一旦变化就抛错
  并提示「请更新本脚本」—— 静默返回空表会长出一条永远绿的假门禁。
- **顺带守一条结构不变量**：`extra_types.py` 必须保持无 import 的纯数据叶子模块
  （模块注释写明这是为了断掉 `config_ctx → purifier → lock → config_ctx` 的环）。

---

## 明确不做的

| 项 | 行数 | 为什么不做 |
|---|---:|---|
| `studio/app/3d-studio/.../boot.ts` 的 6 处大克隆 | 约 260 | 那是 **facade 的依赖对象字面量**，`boot.ts` 侧与实现侧必须一致；不是复制粘贴，是依赖倒置的手法。真正的问题是 `boot.ts` 4182 行 / 765 个 `*Impl` 包装，属结构问题，要用 `check_split_budget.mjs` 分阶段拆，不该混进「去重」PR。 |
| `screensaver.defaults.ts ↔ frontend-config.ts` | 19 | 两份默认值**故意不同**（`defaultMode` clock/random，`brandSizePx` 26/22）。合并需要引入覆盖参数，反而更绕；正解是删掉已被 config 覆盖的键，属行为变更。 |
| `DEFAULT_RETENTION ↔ _ops_defaults()['retention*']` | 15 | 前者是「各表保留天数」的领域模型，后者是运维行为参数（批大小/首次延迟/间隔），只是前缀同名。 |
| `DiagnosticsView.vue`（store） | 211 | 收益最大的一处，但属于 `homeos-store` 前端，本次范围聚焦主应用与跨端契约；已列在 `02` 的后续建议第 1 位。 |
| 测试夹具之间的重复 | 约 80 | 刻意并列的用例结构，合并会降低可读性。 |

---

## 提交切分与回滚

分支 `refactor/dedup-safe-batch`，按 R1→R5 分 6 个提交（R1 两个文件一个提交）。

| 提交 | 内容 | 回滚方式 |
|---|---|---|
| 1 | 度量基础设施：`.jscpd.json`、`check_duplicates.mjs`、`dup_near.py`、基线、`package.json`、`gates.mjs` | 单独 revert，不触及业务代码 |
| 2 | R1 配置默认值 | 单独 revert；`check:backend-deps` 是环的兜底 |
| 3 | R2 迁移助手 | 单独 revert；`sqlite_introspect.py` 的回退需要同时还原两个注册表 |
| 4 | R3 语音告警 | 单独 revert；`packages/shared` 的 exports 与调用点必须同进同退 |
| 5 | R4 四个组件 | 单独 revert；`gate:build` + 浏览器冒烟是兜底 |
| 6 | R5 契约门禁 | 单独 revert |

任一提交失败即单独 `git revert`，不影响其他项 —— 每个提交都能独立通过 `gate:static`。
