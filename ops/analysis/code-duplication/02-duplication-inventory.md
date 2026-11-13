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
| 克隆数 | 194 | 190 | **−4** |
| 重复行（按克隆计） | 3714 | 3604 | **−110** |
| `statistics.total.duplicatedLines` | 3371 | 3261 | **−110（−3.26%）** |
| 扫描总行 | 668,982 | 669,911 | +929（新增度量脚本与 4 个组件） |
| 重复占比 | 0.5039% | 0.4868% | **−0.0171 个百分点** |
| M2 近似重复簇 | 590 | 583 | **−7** |

> 分母涨了 929 行（3 个门禁脚本 + 4 个新组件，均不含重复），所以占比的下降幅度比
> 「重复行 −3.26%」看起来更大一点；**判断以绝对重复行 −110 为准**。

### 按格式

| 格式 | 前（行/克隆） | 后（行/克隆） | Δ行 | 对应改动 |
|---|---:|---:|---:|---|
| typescript | 1852 / 92 | 1836 / 91 | **−16** | R3 |
| python | 787 / 57 | 741 / 55 | **−46** | R1（26）+ R2（20） |
| html（`.vue` 模板段） | 776 / 26 | 728 / 25 | **−48** | R4（24 + 24） |
| javascript | 299 / 19 | 299 / 19 | 0 | — |
| **合计** | **3714 / 194** | **3604 / 190** | **−110** | |

### 按目录（克隆两侧各计一次）

| 根目录 | 前 | 后 | Δ |
|---|---:|---:|---:|
| `homeos/frontend/src` | 4824 | 4712 | **−112** |
| `homeos/backend/src` | 863 | 791 | **−72** |
| `homeos-store/backend/src` | 187 | 167 | **−20** |
| `packages/shared/src` | 16 | 0 | **−16** |
| `homeos/frontend/scripts` | 228 | 228 | 0 |
| `homeos-store/frontend/src` | 570 | 570 | 0 |
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

## 4. 剩余清单（≥ 20 行，共 51 条）

按「是否值得动」标注。

| 行 | 格式 | A | B | 判定 |
|---:|---|---|---|---|
| 109 | html | `features/home-mode/editor/HomeModeActionsSection.vue:15` | `features/home-mode/editor/HomeModeTriggersSection.vue:20` | **待办**：两个兄弟分区的头部/批量面板同构，抽出 `HomeModeSectionHead` 可一次消 109 行 |
| 101 | html | `store .../ops/DiagnosticsView.vue:370` | 同文件 `:416` | **待办**：同一运维页内三处指标卡重复 |
| 62 | html | 同上 `:409` | 同上 `:517` | **待办**：同上（抽 `MetricCard`） |
| 48 | html | 同上 `:471` | 同上 `:517` | **待办**：同上 |
| 51 | ts | `studio-app/boot.ts:2305` | `studio-app/ui/refreshStudioUiInner.ts:131` | **保留**：facade 的「依赖对象字面量」必然与实现侧一致，是依赖倒置的代价 |
| 51 | ts | `studio-app/boot.ts:3920` | `studio-app/render/studio-render-loop.ts:165` | **保留**：同上 |
| 46 | js | `scripts/models/items/dryer.mjs:7` | `scripts/models/items/washer.mjs:7` | **待办**：洗衣/烘干模型脚本样板，可提 `buildApplianceSpec()` |
| 45 | ts | `editor/home/lifecycle/asset-dialog-wiring.ts:7` | 同目录 `boot.ts:4014` | **保留**：facade 依赖字面量 |
| 42 | ts | `studio-app/boot.ts:2590` | `export/generateExportBundle.ts:60` | **保留**：同上 |
| 42 | ts | `studio-app/boot.ts:2834` | `interaction/handlePointerDown.ts:65` | **保留**：同上 |
| 41 | ts | `studio-app/boot.ts:2543` | `export/openExportPanel.ts:50` | **保留**：同上 |
| 42 | ts | `editor/home/elements/inspectors-navigation.ts:525` | `editor/home/lifecycle/boot.ts:424` | **保留**：同上 |
| 40 | ts | `editor/home/elements/inspectors-navigation.ts:526` | `editor/home/lifecycle/boot.ts:484` | **保留**：同上 |
| 37 | ts | `components/common/entity-multi-select/EntityMultiSelect.vue:86` | `.../useEntityMultiSelect.ts:398` | **待办**：SFC 与同目录 composable 的同构解构块（`EntityInput.vue ↔ useEntityInput.ts` 同类） |
| 34 | ts | `editor/home/lifecycle/boot.ts:3778` | `.../navigation-style-wiring.ts:7` | **保留**：facade 依赖字面量 |
| 33 | html | `studio/chrome/editor/EditorButtonInspectors.vue:166` | 同文件 `:337` | **待办**：同一文件内同一段写了 3 遍（`:166` / `:337` / `:612`），`EditorChartInspectors` / `EditorDeviceInspectors` / `EditorMediaInspectors` 里还有第 4、5 份 |
| 33 | html | 同上 `:166` | 同文件 `:612` | **待办**：同上 |
| 31 | ts | `store .../storefront/components/PaymentDialog.vue:26` | `.../PendingOrderDialog.vue:29` | **待办**：两个结算弹窗的倒计时/取消逻辑同构 |
| 31 | html | `EditorButtonInspectors.vue:167` | `EditorChartInspectors.vue:139` | **待办**：同族 |
| 31 | html | `EditorChartInspectors.vue:139` | `EditorDeviceInspectors.vue:172` | **待办**：同族 |
| 31 | html | `EditorChartInspectors.vue:460` | `EditorMediaInspectors.vue:75` | **待办**：同族 |
| 30 | ts | `features/settings/interact/composables/alert-rules-context.internals.ts:44` | 同文件 `:242` | **待办**：同一文件内两段同构 |
| 30 | ts | `studio-app/boot.ts:3972` | `studio-render-loop.ts:215` | **保留**：facade 依赖字面量 |
| 30 | ts | `editor/home/inspectors/inspector-context-builders.ts:301` | `editor/inspectors/home/home-title-button-inspector.ts:39` | **待办**：`titleButton*Element` 25 个字段的类型声明抄了两份 |
| 29 | ts | `studio-static-item-meshes.ts:61` | `scene-build/buildStudioScene.ts:317` | **待办** |
| 29 | ts | `studio-static-item-meshes.ts:61` | `scene-build/scene-layers.ts:128` | **待办** |
| 29 | ts | `editor/home/lifecycle/boot.ts:2299` | `.../floorplan-messages.ts:10` | **保留**：facade 依赖字面量 |
| 28 | ts | `features/device/DevicesPage.vue:251` | `features/device/composables/useDevicesView.ts:352` | **待办**：SFC↔composable 同构 |
| 28 | ts | `editor/home/elements/inspectors-charts.ts:179` | `editor/home/lifecycle/boot.ts:418` | **保留**：同上 |
| 27 | ts | `studio-app/boot.ts:2260` | `ui/refreshStudioView.ts:36` | **保留**：同上 |
| 27 | ts | `studio-app/boot.ts:2801` | `scene-build/buildStudioScene.ts:71` | **保留**：同上 |
| 27 | ts | `editor/home/inspectors/popup-inspectors.ts:93` | `editor/inspectors/home/home-weather-inspector.ts:18` | **待办**：与上面 `titleButton` 同型（`weather*Element` 字段声明） |
| 26 | ts | `items/studio-item-model.ts:43` | 同文件 `:182` | **待办** |
| 26 | ts | `editor/component-templates.ts:1134` | `editor/metadata/editor-navigation-style-metadata.ts:169` | **待办**：同一组 `airflow*` 默认值 + 中文标签在「模板」与「元数据」两侧各写一遍；同一对文件另有 23/15/15 行三处，合计 **79 行** |
| 25 | py | `store api/admin/compliance.py:19` | `store api/admin/ops.py:21` | **待办**：两个 admin 路由的鉴权依赖声明同构 |
| 25 | ts | `editor/copy-backup/run-copy-backup.ts:20` | `editor/home/style/style-dialogs.ts:692` | **待办** |
| 24 | html | `features/settings/connect/connection/EventLogRecordFilterSection.vue:263` | 同文件 `:288` | **待办** |
| 23 | py | `backend api/entities.py:48` | `backend api/voice.py:32` | **待办** |
| 23 | ts | `features/device/components/DeviceStatsDashboard.vue:214` | 同文件 `:261` | **待办** |
| 23 | ts | `editor/component-templates.ts:842` | `editor-navigation-style-metadata.ts:304` | **待办**：见上（79 行同族） |
| 23 | ts | `views/auth/RegisterView.vue:75` | `views/auth/ResetPasswordView.vue:34` | **待办**：两个入户页的步骤条同构 |
| 22 | ts | `composables/ui/hub-viewport.internals.ts:101` | 同文件 `:194` | **待办** |
| 22 | ts | `renderer/panel-seams/details/entity-details.ts:14` | `renderer/panel-seams/popups/custom-popup.ts:9` | **待办** |
| 22 | ts | `views/auth/RegisterView.vue:105` | `views/auth/ResetPasswordView.vue:67` | **待办** |
| 21 | ts | `features/device/components/DeviceAnalyticsPanel.vue:316` | `.../DeviceUsageStats.vue:308` | **待办** |
| 21 | html | `features/notifications/components/ViewHero.vue:42` | `.../ViewStream.vue:30` | **待办** |
| 21 | ts | `features/security/composables/useSecuritySensors.ts:21` | `features/security/utils/zone-room.util.ts:35` | **待办** |
| 21 | py | `ops/checks/smarthome/tests/test_home_mode_conditions.py:212` | 同文件 `:265` | **保留**：测试用例之间刻意保留的并列结构，合并会降低可读性 |
| 20 | ts | `components/common/AssetPickerModal.vue:97` | `components/common/asset-manager/AssetManagerModal.vue:66` | **待办** |
| 20 | ts | `features/device/components/DeviceAnalyticsPanel.vue:168` | `.../DeviceUsageStats.vue:160` | **待办** |
| 20 | ts | `features/settings/nav.ts:58` | `shared/utils/registry/settings-header-icons.ts:63` | **待办**：设置导航的图标表两处维护 |
| 20 | py | `ops/checks/security/tests/test_arm_compensation.py:54` | `.../test_security_regressions.py:65` | **保留**：测试夹具 |

### 明确「保留不动」的两处

| 行 | 克隆 | 为什么不合并 |
|---:|---|---|
| 19 | `composables/ui/screensaver/screensaver.defaults.ts:9` ↔ `shared/utils/config/frontend-config.ts:49` | 两份默认值**故意不同**：`defaultMode` 是 `clock` vs `random`，`brandSizePx` 是 `26` vs `22`。合并需要引入「覆盖参数」，反而更绕；真正的修法是删掉 `SS_DEFAULTS` 里已被 config 覆盖的键 —— 那是行为变更，需要单独验证。 |
| 15 | `domains/app_config/defaults.py:382` ↔ `platform/core/db/retention.py:35` | `DEFAULT_RETENTION` 的键是「保留天数」的**领域模型**，`_ops_defaults()` 里的 `retention*` 是**运维行为参数**（批大小/首次延迟/间隔），两边只是前缀同名。强行合并会把两件事绑在一起。 |

### 规模分布

| 行数区间 | 重构前 | 重构后 |
|---|---:|---:|
| 10–14 | 98 | 98 |
| 15–29 | 71 | 68 |
| 30–59 | 22 | 21 |
| ≥60 | 3 | 3 |
| **合计** | **194** | **190** |

`10–14` 段一条没少，符合预期：这一段绝大多数是「一处契约的两份声明」和测试夹具，属于
**已知不会去改**的重复；真正的收益集中在 `≥15` 段。

## 5. 后续建议顺序（按收益/风险）

1. `DiagnosticsView.vue`（store 运维页）：211 行，纯前端、单文件、无跨端契约 → 最容易拿下。
2. `EditorXxxInspectors.vue` 五兄弟：约 150 行，同一份「datalist + 字段行」模板抄了 5 遍，抽一个 `<InspectorFieldRow>`。
3. `component-templates.ts ↔ editor-navigation-style-metadata.ts`：79 行，`airflow*` 默认值 + 中文标签；需要同时改「模板默认值」与「元数据渲染」，建议把默认值提成 `AIRFLOW_DEFAULTS` 常量供两侧引用。
4. `entity-multi-select` / `entity-input` / `DevicesPage` 的 SFC↔composable 同构解构：约 100 行，同一套 `{ a, b, c } = useX()` 在 SFC 与 composable 各写一遍；这块已在 M2 里排前 20。
5. `HomeModeActionsSection ↔ HomeModeTriggersSection`：109 行，收益最大但两个文件都 300–420 行，
   且涉及 `RecommendInsightCard` 与主从导航，**建议放到与 `studio` 拆分同批**做。
6. 模型脚本 `dryer.mjs ↔ washer.mjs`：46 行，低风险，可随时做。

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
