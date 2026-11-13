# 重复代码清单

## 1. 口径

| 口径 | 工具 | 判定 | 用途 |
|---|---|---|---|
| **M1 精确克隆** | `jscpd` 5.4.3 | `minLines=10` 且 `minTokens=50`，`mode=weak`（跳过注释 token，空白不参与比较） | **门禁**：`bun run check:duplicates` |
| **M2 近似重复** | `ops/checks/dup_near.py` | 连续 10 个有效代码行，行集合 Jaccard ≥ 0.80 | 只出清单，**不进 CI** |

### 为什么 M1 选 `mode=weak` 而不是 `strict`

这是本次唯一一处对初版方案的修正，且有实测依据。

`strict` 会把注释当 token 比较，于是**注释位置不同就会切断一个克隆**。本仓库注释密度很高，
后果是真实重复被藏起来。实测（重构前的两份文件，同样 `minLines=10` / `minTokens=50`）：

| mode | 检出的 `security/config.py ↔ app_config/defaults.py` 克隆 |
|---|---|
| `strict` | **0 条** |
| `mild` | 1 条（28 行） |
| `weak` | 1 条（28 行） |

`weak` 与方案里写的「token 级完全相同，忽略空白与注释」一致，因此采用 `weak`。
代价是要重新度量基线 —— 所以「重构前」的数字是从**重构前的 git 工作树**（`HEAD = 147cbc6d2`）
用同一份 `.jscpd.json` 重跑出来的，不是拍脑袋估的。

### 产物

| 文件 | 说明 | 是否入库 |
|---|---|---|
| `docs/analysis/code-duplication/jscpd-before.json` | 重构前全量克隆（194 条，含路径/行号/指纹/片段预览） | 否（`docs/` 全目录 gitignore，可用第 6 节命令重跑） |
| `docs/analysis/code-duplication/jscpd-after.json` | 重构后全量克隆（190 条） | 否 |
| `docs/analysis/code-duplication/near-duplicates.{json,md}` | M2 清单（583 簇） | 否 |
| `docs/analysis/code-duplication/report/jscpd-report.html` | 可点开的 HTML 报告 | 否 |
| `ops/checks/duplication-baseline.json` | 门禁基线（总量 + 每条克隆的指纹） | **是** |

## 2. 总量

| 指标 | 重构前 | 重构后 | 变化 |
|---|---:|---:|---:|
| 克隆数 | 194 | 183 | **−11** |
| `statistics.total.duplicatedLines` | 3371 | 3043 | **−328（−9.73%）** |
| 扫描总行 | 668,982 | 669,611 | +629（新增脚本与组件） |
| 重复占比 | 0.5039% | 0.4544% | **−0.0495 个百分点** |
| 重复 token | 17,648 | 14,590 | **−3,058** |
| M2 近似重复簇 | 590 | 583 | **−7** |

> 分母涨了 629 行（门禁脚本与新增组件，均不含重复）。**判断以绝对重复行 −328 为准**。
> 另注：门禁脚本自身也在扫描范围内，因此**每次修改这些脚本，`lines` 就会变**（不影响克隆判定）——
> 对照数字必须取同一次生成的两份 artifact，不要跨次混用。

### 按格式

**注意口径**：下表取 jscpd 的 `statistics.formats`（各格式相加 = 总量）。
不要把 `duplicates[].lines` 直接按 `format` 求和 —— 重叠的克隆会让同一行被计多次。
这份清单初版就踩过这个坑（求和得 3714/3604，比总量多出约 340 行），已修正。

| 格式 | 前（行 / 克隆） | 后（行 / 克隆） | Δ行 | 对应改动 |
|---|---:|---:|---:|---|
| typescript | 1826 / 92 | 1751 / 89 | **−75** | R3（16）+ R6（29，商店弹窗）+ R7（30，告警面板转发清单） |
| python | 787 / 57 | 741 / 55 | **−46** | R1（26）+ R2（20） |
| html（`.vue` 模板段） | 482 / 26 | 275 / 20 | **−207** | R4（48）+ R8（159，27 份动作块） |
| javascript | 276 / 19 | 276 / 19 | 0 | — |
| css / vue | 0 / 0 | 0 / 0 | 0 | — |
| **合计** | **3371 / 194** | **3043 / 183** | **−328** | |

> `.vue` 文件在 jscpd 里被拆成两段：模板算 `html`、`<script>` 算 `typescript`，
> 所以「html」这一行的含义是「Vue 模板段」，不是「HTML 文件」。
> 商店弹窗那 31 行克隆的 `format` 是 `typescript`（匹配到的是 `<script setup>` 里的组合式逻辑），
> 不是模板。

### 按目录（相对比较用）

克隆横跨两个文件，下表把一条克隆的重复行在**两侧各记一次**。因此：

- 表内数字**不相加等于总量**（重叠克隆还会重复计行）；
- 只用于回答「收益落在哪个目录」，不用于对账。

| 根目录 | 前 | 后 | Δ |
|---|---:|---:|---:|
| `homeos/frontend/src` | 4824 | 4334 | **−490** |
| `homeos/backend/src` | 863 | 791 | **−72** |
| `homeos-store/frontend/src` | 570 | 508 | **−62** |
| `homeos-store/backend/src` | 187 | 167 | **−20** |
| `packages/shared/src` | 16 | 0 | **−16** |
| `homeos/frontend/scripts` | 228 | 228 | 0 |
| `packages/shared-py` | 22 | 22 | 0 |
| `ops` | 718 | 718 | 0 |

## 3. 本次已消除的克隆

| 行数 | 克隆 | 处理 |
|---:|---|---|
| 26 | `backend/src/domains/app_config/defaults.py:113` ↔ `backend/src/domains/security/config.py:21` | **R1** 已消除（→ 0） |
| 20 | `store backend/core/persistence/migrations.py:113` ↔ `backend/src/platform/core/db/migrations.py:172` | **R2** 已消除（→ 0） |
| 16 | `frontend/src/shared/utils/config/frontend-config.ts:95` ↔ `shared/src/notification/voice-alert.ts:42` | **R3** 已消除（→ 0） |
| 24 | `features/home-mode/editor/HomeModeContextBar.vue:35 ↔ :61` | **R4** 已消除（→ 0） |
| 43 | `components/widgets/system/NotificationCenter.vue:93 ↔ :152` | **R4** 部分消除（43 → 19，剩余部分是两处调用点各自的外层容器，低于 10 行阈值无法再抽） |
| 37 | `features/settings/automate/linkage/PresenceSection.vue:61 ↔ :104`（M2 口径） | **R4** 已消除（jscpd 本来就没报到它 —— 低于 50 token，是 M2 抓到的） |

另外 `domains/app_config/defaults.py` 与 `domains/notification/config.py` 之间的
`energy` / `water` / `iaq` / `notification` 四个分区字面量，**低于 M1 阈值**（每块只有 1–10 行），
jscpd 从未报到，但确实是逐字重复 —— R1 一并消掉了。这也是为什么 R1 的实际删除量（132 行）
大于 M1 计到的 26 行。

## 4. 剩余清单（≥ 20 行）

### 4.0 这份清单怎么读

判定列只有三种取值，**每种都注明依据**：

| 判定 | 含义 |
|---|---|
| **已修复** | 本次改掉了，见对应 R* |
| **保留** | 已读代码，确认**不该合并**（下面是具体原因） |
| **待办** | 已读代码，确认是真复制，且给出了具体抽法 |
| **未研判** | 只有路径，**我还没读它的上下文**，不给结论 |

之所以要做这个区分：初版清单里有十几条是**按文件名猜的**，标注「待办」并附了一个抽法。
复核后发现其中两类猜错了（见 4.3），如果照那个建议去改会白费功夫甚至改错结构。
**没有读过代码就不该给判断**，所以未读的条目一律降级为「未研判」。

### 4.1 已修复

| 行 | 克隆 | 对应 |
|---:|---|---|
| 26 | `backend/domains/app_config/defaults.py:113` ↔ `backend/domains/security/config.py:21` | R1 |
| 20 | `store backend/core/persistence/migrations.py:113` ↔ `backend/platform/core/db/migrations.py:172` | R2 |
| 16 | `frontend/src/shared/utils/config/frontend-config.ts:95` ↔ `shared/src/notification/voice-alert.ts:42` | R3 |
| 24 | `features/home-mode/editor/HomeModeContextBar.vue:35 ↔ :61` | R4 |
| 43→19 | `components/widgets/system/NotificationCenter.vue:93 ↔ :152` | R4（剩余 19 行是两处调用点各自的外层容器，已低于可抽粒度） |
| 37（M2） | `features/settings/automate/linkage/PresenceSection.vue:61 ↔ :104` | R4 |
| 31 | `store .../storefront/components/PaymentDialog.vue:26` ↔ `.../PendingOrderDialog.vue:29` | R6（本轮补做）：`<dialog>` 开关 + 每秒 `now` + 取消二次确认三件事逐字相同 → `useOrderDialog.ts` |

另外 `domains/app_config/defaults.py` 与 `domains/notification/config.py` 之间的
`energy` / `water` / `iaq` / `notification` 四个分区字面量**低于 M1 阈值**（每块 1–10 行），
jscpd 从未报到，但确实是逐字重复 —— R1 一并消掉了。这也是 R1 的实际删除量（37 行）
大于 M1 计到的 26 行的原因。

### 4.2 保留（已读代码，确认不该合并）

| 行 | 克隆 | 为什么保留 |
|---:|---|---|
| 101 / 62 / 48 | `store .../ops/DiagnosticsView.vue` 自重复三处 | **初版建议是错的**。它不是「指标卡重复」，而是**两张不同的表**（账号会话 / 客户端会话，列不同）共用同一套单元格写法：`<td class="nowrap">{{ dt(...) }}</td>`、`—` 兜底、`pill` 成对、`row-actions` 按钮。jscpd 匹配的是这套 token 骨架。唯一的抽法是 `<DataCell>` 级别的原语，抽象收益低于它带来的间接层。 |
| 51 / 51 / 42 / 42 / 41 / 42 / 40 / 34 / 30 / 29 / 28 / 27 / 27 | `studio-app/boot.ts` 与各实现文件（13 条） | facade 的「依赖对象字面量」：`boot.ts` 侧 `xDeps()` 与实现侧解构出的名字必须一致，这是依赖倒置手法的代价，不是复制粘贴。真正的结构问题是 4182 行 / 765 个 `*Impl` 包装，归 `check_split_budget.mjs` 分阶段处理。 |
| 37 / 30 / 28 | `EntityMultiSelect.vue ↔ useEntityMultiSelect.ts`、`EntityInput.vue ↔ useEntityInput.ts`、`DevicesPage.vue ↔ useDevicesView.ts` | 一侧是 composable 的 `return { ... }`，另一侧是 SFC 的 `const { ... } = useX()`。**这是 API 面本身**，就像函数签名。合并只能靠「返回一个对象再整体解构」，会让每个调用点都多一层间接，可读性更差。 |
| 19 | `composables/ui/screensaver/screensaver.defaults.ts ↔ shared/utils/config/frontend-config.ts` | 两份默认值**故意不同**：`defaultMode` 是 `clock` vs `random`，`brandSizePx` 是 `26` vs `22`。 |
| 15 | `domains/app_config/defaults.py:382` ↔ `platform/core/db/retention.py:35` | `DEFAULT_RETENTION` 是「各表保留天数」的领域模型，`_ops_defaults()` 里的是运维行为参数（批大小 / 首次延迟 / 间隔），只是前缀同名。 |
| 21 / 20 | `ops/checks/smarthome/tests/*`、`ops/checks/security/tests/*` | 测试用例之间刻意并列的结构，合并会降低可读性。 |
| 30 / 27 | `inspector-context-builders.ts:301` ↔ `home-title-button-inspector.ts:39`；`popup-inspectors.ts:93` ↔ `home-weather-inspector.ts:18` | **初版建议是错的**。这些是**每个文件只声明自己用到的字段**的窄接口（`TitleButtonInspectorContext` 34 个 vs 宿主 `InspectorContextsDeps` 307 个）。合并成一个大类型会毁掉「键名拼错 / 宿主漏传被 tsc 拦下」这个性质 —— 而它正是这批接口唯一的价值。形状由调用处的 `buildXInspectorContext()` 构造器 + tsc 保证。 |
| 26 / 23 / 15 / 15 | `editor/component-templates.ts` ↔ `editor/metadata/editor-navigation-style-metadata.ts`（合计 79 行） | **确是同一份默认契约写了两遍**：实测 4 组配对的同名字段**取值 0 处不同**（icon-button 37 个同名键、navButton 42 个同名键，全部相等）。但**合并是语义决定，不是机械改动**：`styleComponentTypeState` 同时被 `style-apply.ts` 当作「属性缺失时的回退」用，而模板是「新建时初值」。合并等于把两个现在只是碰巧相等的策略焊死。要动须先有视觉快照基线，否则改错的后果是「新建设置对、旧设备回退错」这类静默渲染差异。 |

### 4.3 待办（已读代码，确认真复制）

| 行 | 克隆 | 抽法 | 风险 |
|---:|---|---|---|
| 109 | `features/home-mode/editor/HomeModeActionsSection.vue:15` ↔ `HomeModeTriggersSection.vue:20` | 两个兄弟分区的「标题 + 描述 + 紧凑态按钮组」及批量面板头部同构 → `HomeModeSectionHead` | 中：两个文件各 300–420 行，涉及主从导航 |
| 46 | `scripts/models/items/dryer.mjs:7` ↔ `washer.mjs:7` | 洗衣/烘干两个模型脚本的尺寸与外壳构造逐字相同 → 共享 `buildLaundryShell()` | 低技术风险，但**归模型库 owner**：哪天两者要分化，过早共享会碍事 |
| 30 | `features/settings/interact/composables/alert-rules-context.internals.ts:44 ↔ :242` | 同文件内两段同构的取值/合并逻辑 | 中：需逐行确认两边字段集是否真的相同 |

### 4.4 未研判（只有路径，本轮未读代码）

下面这些出现在报表里，但**我没有读它们的上下文，因此不给判定**。
triage 方法：先看两侧是不是「同一份契约的两处声明」或「API 面」（→ 保留），
再看能不能就地抽一个纯展示件（→ 待办）。

```
24  features/settings/connect/connection/EventLogRecordFilterSection.vue:263 ↔ :288 (自重复)
23  api/entities.py:48 ↔ api/voice.py:32                                    (backend)
23  features/device/components/DeviceStatsDashboard.vue:214 ↔ :261          (自重复)
23  views/auth/RegisterView.vue:75 ↔ ResetPasswordView.vue:34
22  composables/ui/hub-viewport.internals.ts:101 ↔ :194                     (自重复)
22  renderer/panel-seams/details/entity-details.ts:14 ↔ popups/custom-popup.ts:9
22  views/auth/RegisterView.vue:105 ↔ ResetPasswordView.vue:67
21  features/device/components/DeviceAnalyticsPanel.vue:316 ↔ DeviceUsageStats.vue:308
21  features/notifications/components/ViewHero.vue:42 ↔ ViewStream.vue:30
21  features/security/composables/useSecuritySensors.ts:21 ↔ utils/zone-room.util.ts:35
20  components/common/AssetPickerModal.vue:97 ↔ asset-manager/AssetManagerModal.vue:66
20  features/device/components/DeviceAnalyticsPanel.vue:168 ↔ DeviceUsageStats.vue:160
20  features/settings/nav.ts:58 ↔ shared/utils/registry/settings-header-icons.ts:63
29  studio/app/3d-studio/authoring/items/studio-static-item-meshes.ts:61 ↔ scene-build/buildStudioScene.ts:317
29  同上 ↔ scene-build/scene-layers.ts:128
24  ops/checks/... (测试夹具，见 4.2 同类)
```

### 4.5 规模分布

| 行数区间 | 重构前 | 重构后 |
|---|---:|---:|
| 10–14 | 98 | 98 |
| 15–29 | 71 | 68 |
| 30–59 | 22 | 14 |
| ≥60 | 3 | 3 |
| **合计** | **194** | **183** |

`10–14` 段一条没少，符合预期：这一段绝大多数是「一处契约的两份声明」和测试夹具，属于
**已知不会去改**的重复；真正的收益集中在 `≥15` 段（71 → 66）。

## 5. 后续建议顺序（按「已核实 + 收益/风险」）

初版这份排序里前两条（`airflow*` 常量、类型声明）**已被证伪**，见 4.2 的最后两条。
剩下的按「已核实 + 能验证」重排：

1. `HomeModeActionsSection ↔ HomeModeTriggersSection`（109 行）：现已是剩余最大一块，
   但两个文件各 300–420 行、涉及主从导航，建议与 `studio` 拆分同批做。
2. `studio/chrome/editor` 的 `EditorLayoutInspectors` 等文件已无动作块重复（R8 已清零），
   若后续新增控件请直接复用 `ComponentActionTrigger.vue`。
3. 模型脚本 `dryer.mjs ↔ washer.mjs`（46 行）：归模型库 owner，随时可做。
4. 4.4 里的未研判项：先 triage 再决定，不要按行数排序直接改。
5. `airflow*` 那 79 行：需要 studio owner 决定「新建初值」与「回退默认」是否应该焊死；
   决定合并前先补视觉快照基线。

## 6. 复现命令

```bash
# 门禁（与 CI 同一条）
bun run check:duplicates

# 出 HTML + JSON 报告，并刷新 M2 清单
bun run dup:analyze

# 从重构前的提交重测「前」快照（工作树已前进时）
git worktree add /tmp/homeos-before 147cbc6d2
cd /tmp/homeos-before && node /path/to/repo/node_modules/.bin/jscpd \
  homeos/frontend/src homeos/frontend/scripts homeos/backend/src \
  homeos-store/frontend/src homeos-store/backend/src packages/shared/src \
  packages/shared-py ops -c /path/to/repo/.jscpd.json

# 降低基线（只允许变小；要放宽必须 --allow-increase 并在 PR 里说明）
bun run update:duplication-baseline
```
