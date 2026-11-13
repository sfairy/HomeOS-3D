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

## R6 商店订单弹窗的公共行为（本轮补做）

**问题**：`homeos-store/frontend/src/features/storefront/components/PaymentDialog.vue` 与
`PendingOrderDialog.vue` 里三件事逐字相同（jscpd: 31 行）：

1. `watch(openRef, ...)` 里 `<dialog>` 的 `showModal()` / `close()` 与「打开期间每秒刷新 `now`」；
2. `onBeforeUnmount(() => window.clearInterval(timer))`；
3. `cancel()` 的二次确认 —— 连 `kicker` / `title` / `message` / `detail` / 两个按钮文案 / `tone`
   都一字不差。

**改法**：新增 `features/storefront/composables/useOrderDialog.ts`，导出

- `useOrderDialog(isOpen: () => boolean, dialog: Ref<HTMLDialogElement | null>)` → `{ dialog, now }`
- `useCancelOrder()` → `(target: StoreOrder | null | undefined) => Promise<void>`

两个弹窗各留 3 行调用，模板完全不动（`ref="dialog"` 仍然绑同一个 ref）。

**为什么 `dialog` 由调用方传入而不是在 composable 里新建**：模板里的 `ref="dialog"` 绑的是 SFC
作用域内的名字。若 ref 只在 composable 内创建、SFC 只解构 `now`，vue-tsc 的 `noUnusedLocals`
会把解构出来的 `dialog` 判成「声明未使用」（模板引用不算脚本引用）—— 这是本轮实际撞到的编译错误。

**行为等价性**：三处语义逐条保持 —— 已 open 时不再 `showModal()`（重复调用会抛
`InvalidStateError`）；每次打开先清旧 interval 再起新的；关闭时只在 `node.open` 为真时 `close()`；
卸载清定时器。`cancelOrder(target)` 的 target 由调用方给（支付弹窗传 `currentOrder`，
待提醒传 `pendingOrder`），与原实现一致。

**验证**：`vue-tsc`（商店）+ `biome` + 商店生产构建均通过；jscpd 该克隆归零，总量 −31 行。

---

## R7 告警面板的转发清单（第二轮）

**问题**：`features/settings/interact/composables/alert-rules-context.internals.ts` 的
`useAlertRulesPanelContext` 从 `useVoiceAlertsEditor()` 解构 30 个字段，函数体只用到 7 个，
其余 23 个只是为了在 `return` 里再列一遍 —— 同一串名字写两次（jscpd: 30 行）。

**改法**：

```ts
const { voiceMeta: _voiceMetaNotExposed, ...voiceAlertsEditor } = useVoiceAlertsEditor()
const { voice, voiceSaveTip, ttsMediaPlayerId, speakCooldownMin,
        builtinStyleState, initVoiceAlerts, persistVoiceAlerts } = voiceAlertsEditor
// ...
return { /* … */ ...voiceAlertsEditor /* … */ }
```

**`voiceMeta` 为什么必须显式剔除**：它确实是 composable 的返回值（31 键），但本 wrapper
一直没暴露。展开会「顺手多暴露一个」—— 那也是行为变更（会经 `useAlertRulesPanel` 的
`...ctx` 一路传到设置页）。剔掉才能保持对外键集逐字一致。

**展开安全性**：`useVoiceAlertsEditor` 的 return 块里 0 个 getter（实测扫描），返回的是
ref / computed **对象本身**，浅拷贝不改变响应性。

**等价性证明**（脚本比对）：新透传 30 键与旧解构列表集合相同、顺序相同；return 显式键
102 → 72，差额恰为被展开的 30 个；展开位置即原 `voice,` 的位置，最终键序不变。

**运行时验证**：设置 › 告警规则 › 语音播报，DOM 实测「10 播报项」、7 个安防开关全 checked、
冷却 10、分组 7/4/2 —— 全部来自被转发的字段。

---

## R8 Inspector 动作触发块 ×27（第三轮）

**问题**：`Editor{Button,Chart,Device,Layout,Media}Inspectors.vue` 里，
「一个触发方式 × 四个动作类型 + 跳转目标下拉」这 11 行标记写了 **27 遍**
（`tap` / `doubleTap` / `hold` 各一组，部分文件有多组控件）。

**改法**：新增 `studio/chrome/editor/ComponentActionTrigger.vue`，27 处变为组件调用。

### 为什么它比前几项危险

这些检查器是**引擎命令式填充的静态 DOM 契约**：`inspector-sync.ts` 的
`syncComponentActionControlsCore()` 按 `[data-action-trigger]` 找根节点，再在内部
query `[data-action-type]` / `.component-action-target` / `[data-action-target]`，
并且会**直接改写** `<select>` 的子节点与 `.component-action-target` 的 `hidden`；
`initActionPopupConfig()` 还会往 `.component-action-control` 内部 **append** 一个
`div.component-popup-config`、并把 more-info 的文案统一改成「打开弹窗」。

两条硬约束因此写进了组件注释：

1. **props 必须保持静态**。Vue 一旦重渲染，引擎塞进去的 `<select>` 选项、`hidden`
   状态、`component-popup-config` 都会消失。现状安全，因为这些检查器模板本身零响应式绑定，
   渲染一次即定型。
2. **class 与 `data-*` 一个都不能改**。它们是 `inspector-sync.ts`、`popup-inspectors.ts`、
   `date-inspector-submit.ts`、`document-entity-picker-dismiss.ts` 的选择器契约。

### 27 处并非一致：两类真实差异

| 差异 | 处数 | 处理 |
|---|---:|---|
| more-info 文案「打开弹窗」 vs 「显示详情」 | 6（Layout×3 + Media 后 3） | `moreInfoLabel` prop |
| `role="group"` / `<select>` 的 `aria-label` 有无 | 部分 | `groupAriaLabel` / `selectAriaLabel` prop，空串不渲染属性 |

**`moreInfoLabel` 的运行时不重要性**：引擎会把所有 more-info 文案统一改成「打开弹窗」，
所以这个静态值只在 init 前可见。仍然保留差异 —— 一旦将来那行覆盖被去掉（它本来就该由
组件负责文案），静态值就成了唯一真相，届时要能追溯「原本写的是什么」。

### 一个被自己的校验器救下来的事故

第一版替换脚本在「结构不等价」分支漏了「先追加未处理原文」，**删掉了 130 行真实内容**
（Media 的整个相机检查器）。靠 `git diff --numstat` 报 `-133`（远超 27×11 的预期）发现。
已还原重做。规则：**批量改写脚本先核对行数，再继续**。

---

## 文档修正（第二轮）

`studio/app/editor/**` 下 7 个 inspector 接口的注释声称字段清单由
`ops/studio/studio_context_bag_typing.mjs` 生成。该脚本已在 `a70ed33d7` 删除且无替代品 ——
注释在指引后来者找一个不存在的东西。改为陈述现状（手写维护，形状由构造器 + tsc 兜底）。

顺带得到一个实测结论：这 7 个文件共 +35 行注释，`check:duplicates` 的 `duplicatedLines`
**一行没变** —— 实证了 `mode=weak` 跳过注释，当初从 `strict` 换过来的理由成立。

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

分支 `refactor/dedup-safe-batch`，按 R1→R5 分 6 个提交（R1 两个文件一个提交），
另加 5 个提交（门禁缺陷修正、R6、R7、R8、报告口径与文档），共 11 个。

| 提交 | 内容 | 回滚方式 |
|---|---|---|
| 1 | 度量基础设施：`.jscpd.json`、`check_duplicates.mjs`、`dup_near.py`、基线、`package.json`、`gates.mjs` | 单独 revert，不触及业务代码 |
| 2 | R1 配置默认值 | 单独 revert；`check:backend-deps` 是环的兜底 |
| 3 | R2 迁移助手 | 单独 revert；`sqlite_introspect.py` 的回退需要同时还原两个注册表 |
| 4 | R3 语音告警 | 单独 revert；`packages/shared` 的 exports 与调用点必须同进同退 |
| 5 | R4 四个组件 | 单独 revert；`gate:build` + 浏览器冒烟是兜底 |
| 6 | R5 契约门禁 | 单独 revert |
| 7 | 门禁缺陷修正：把「重复变小」与「新增重复」区分开；`--json` 输出纯度 | 单独 revert（会退回「改善被判成新增」的误报） |
| 8 | 报告口径修正与文档 | 纯文档 |
| 9 | R6 商店订单弹窗 composable | 单独 revert；只动 `homeos-store` 两个弹窗与一个新文件 |
| 10 | R7 告警面板转发清单 + 7 处陈旧注释 | 单独 revert；两者互不依赖 |
| 11 | R8 Inspector 动作块 ×27 + 5 处陈旧注释 | 单独 revert；回滚需同时删掉 `ComponentActionTrigger.vue` |

任一提交失败即单独 `git revert`，不影响其他项 —— 每个提交都能独立通过 `gate:static`
（提交 1 已在独立工作树里实跑验证：`重复代码门禁通过`，exit 0）。
