# 独立审查报告 — code-quality-cleanup

- **审查日期**：2026-09-28
- **审查方式**：两个全新的只读 `general_purpose_task` 代理并行独立复核（后端资金/控制路径、前端去重等价），均未参与实施；门禁由主代理在最终工作树再次复跑。
- **总体结论**：**PASS**（复验轮 2026-09-28 上调；原 4 条 nit：#1/#2/#3 已修复或类型收口，#4 经论证为正确方向维持不改）。

## AC 评分

| AC | 结论 |
|---|---|
| AC-1 … AC-11（rule 类） | **全部 PASS** |
| AC-12 行为等价与最小变更（rubric，阈值 4） | **5/5**（复验轮上调，见文末） |
| AC-13 修复工程质量（rubric，阈值 4） | **5/5** — 守卫/收口/手续费口径均与既有正确模式统一，中文注释与既有风格一致，边界完备 |

## 高风险路径核实结论（均 OK）

1. **优惠码名额重算收口（T16，资金）**：`coupons.recount_coupon_slots` 与被删的 admin_ops 旧实现 SQL 等价（同 outerjoin(Order)、同 `holds_slot_conditions()`、同 int(or 0)/flush；canonical 仅多显式 select_from，count 首参本就锚定同表）；coupon 缺失两版均返回 0 不写库；作废双击幂等（不覆盖 voided_at、不重复审计、recount 本身幂等）。
2. **退款扣回积分短差（T3，资金）**：`reverse_order_reward` 四个早退分支均返回 `(0,0)`；deductible=min(应扣,可用) 只扣到 0，shortfall≥0 留台账；仅全额退款分支且 shortfall>0 时 `incidents.note`（kind `referral.reversal_shortfall`，有中文标签、携带 order_no）。
3. **提现手续费（T4，资金）**：bps=round(p×100)、fee=floor(cents×bps/10000)（不足 0.01 舍去）、bps≥10000 时 net=0、NaN/负值/缺省钳 0，net 恒非负；preview 与引导文案共用同一函数；推演 50/10%→5.00/45.00、10/20%→2.00/8.00 正确。
4. **踢会话收口（T16，鉴权）**：keep_hash 比较 `record.id_hash == token_hash(当前 cookie)`；改密码/改邮箱保当前、重置密码全删、管理员改邮箱全删；commit 全部保留在调用点；无导入环（create_app 冒烟通过）。
5. **设备空状态守卫（T2/T15，控制）**：lock/purifier/climate 所有 `state.get` 前均有 `not isinstance(state, dict)` 短路守卫，与 cover.py:76 口径统一；正常 dict 不误判；空 dict 由旧乐观放行收敛为 409 属刻意修复。
6. **0 元单退款/取消关渠道/提现幂等（T8）**：免费单 amount=0 强制线下不触渠道、cumulative>=total 使 0 元单走权益收回；admin_cancel 含 `request: Request` 且关渠道流程与 store_orders 逐段同构（already_paid→409、仅 closed 才写 channel_closed_at）；提现 IntegrityError 先 rollback 再复查（他人键→409、自己键→幂等、无撞键→raise），冻结随回滚撤销。
7. **微信退款谓词（T1）**：`!['alipay','wechat'].includes(provider)` 与后端 `_offline_refund_reason` 同口径；请求体仅 `{note}`，全前端无 `offline:true` 残留。
8. **光照/反射可见性（T17）**：共享 `isVisibleWithin` 与 region 旧版逐行一致（可见性先于相等性、显式 null 恒 false、无边界空链 true）；6 个调用点实参全部溯源为 THREE.Object3D（light/mesh/scene），`.visible` 恒布尔；薄壳导出签名逐字不变。
9. **20 项数组/着色/祖先查询/实体视觉（T17/T18）**：STAGE_ENVIRONMENT_ITEM_TYPES 1 定义 4 引用（static 处前置 `!` 与括号结构保持）；插值版 shadeColor 与乘法版确认未合并；findUserDataInAncestors 两旧版逐行同构；isLightVisualActive/isDeviceButtonVisualActive 导出签名与 3 个消费文件零改动。
10. **错误文案/密码/浮层（T19）**：sessions '读取失败'（7 处）、8 面板 '操作失败'（55 处）、store.ts '重发失败，请稍后再试。' 经 git show 旧值对照逐字保留；setup `{ariaLabel:false}` 静态 aria-label 差异保留；浮层 GAP/MARGIN/flip/clamp 与两旧版同构，左右对齐与宽度夹档 [300,460] 参数化无掩盖。
11. **Draco worker（T5）**：onerror 清出毒化槽并 terminate；decodeGeometry 与 malloc 路径 try/finally 释放；vite classicEntries 产物路径与 `/static/3d-studio/export/draco-decoder-worker.js` 字面量一致，产物为经典 IIFE（2882 字节）。
12. **范围纪律**：两 package.json 零 diff（无新依赖）；无跨项目 import；无 db/ 路径变更（migrations.py 唯一 diff 为删死常量 BASE_REVISION）；无路由/响应字段删除改名。

## Findings 与处置

| # | 级别 | 位置 | 问题 | 处置 |
|---|---|---|---|---|
| 1 | nit | homeos-store `api/admin_ops.py`（原 :31） | 残句注释「# 共享助手在 admin_shared.py；这里再导入一次，」句意不完整且误导 | **已修复**：删除残句 |
| 2 | nit | homeos-store `api/admin_ops.py`（原 :23-26） | `iso, utcnow` 挂 `# noqa: F401` 但两者均有活使用（10 处），noqa 冗余 | **已修复**：去掉 noqa；pyflakes 仍仅余两条既定基线 |
| 3 | nit | homeos-3d `scene-tree-utils.ts:31` | 共享谓词 `visible === false` 与 reflection 旧版 `!visible` 对非布尔假值理论不同 | **已收口（2026-09-28 复验轮）**：reflection-scene-queries.ts 的 SceneNodeLike.visible 由可选收紧为必填 `boolean`（与 THREE.Object3D 同构），boolean 二值域内 `!visible` 与 `visible === false` 真值表严格一致，差异在类型域消除；typecheck+build exit 0。docstring 注释保留 |
| 4 | nit | homeos-store `store-types.ts:172` | errorMessage 相对旧本地 errMsg 为严格超集（字符串 rejection/空 message/非 Error 真值三处边界） | **维持不改**：全仓 reject 均为 ApiError/Error 子类（message 非空），边界不可达；且旧版对非 Error 真值输出 `[object Object]` 属病态行为，统一实现是正确方向；store-types.ts 零 diff |

修复 #1/#2 后复跑：py_compile exit 0、pyflakes 仅 database.py:60 与 schema_guard.py:18 两条带 noqa 的既定基线、create_app() 冒烟 SMOKE_OK。

## 门禁结果（主代理最终复跑）

| 门禁 | 结果 |
|---|---|
| 两后端 py_compile | exit 0 |
| pyflakes homeos-3d/backend/src | exit 0（零告警） |
| pyflakes homeos-store/backend/src | 仅 2 条 noqa 基线（副作用导入） |
| homeos-3d `bun run typecheck` | exit 0 |
| homeos-3d `bun run build`（app+runtime） | exit 0 |
| homeos-store `bun run typecheck` | exit 0 |
| homeos-store `bun run build` | exit 0 |
| Draco worker 产物 | 存在，2882 字节，经典 IIFE |
| .venv-store create_app() 冒烟 | SMOKE_OK |
| git status | 184 M + 5 新增（.trae/specs 与 4 个共享模块）；无 db/ 变更；跨项目 import grep 零命中 |

## 未覆盖项

- 纯静态复核，未做浏览器运行时/并发实测（规格未要求；两条保留 nit 的不可达结论基于调用面全量归纳 + typecheck/build）。
- 规格列明的 Non-Goals（图片队列基类、选择器/分页/fetch 工厂、指针拖拽 helper、45 行实例化循环）未实施，需运行时验证手段，建议后续独立规格处理。

## 复验轮补充（2026-09-28，用户要求"全能核查"后）

### 门禁全新复跑：全绿（结论同首次，不再列表）
另确认：21/21 Task 均 completed 且有 Evidence；已删符号 grep 零残留；4 个新共享模块在位；无 __pycache__/db/design/依赖清单污染。

### 浏览器运行时冒烟：PASS（真实 store 后端 + 构建产物 + 无头 Edge 154 CDP）
隔离环境：STORE_DATA_DIR=/tmp 临时库（不触真实数据），POST /setup 创建临时管理员后测真实后台，测完全部进程/文件已清理。

| 用例 | 结果 | 关键观测 |
|---|---|---|
| /setup 密码显隐（逐元素绑定 + `{ariaLabel:false}`） | **PASS** | 两字段独立切换 password↔text、按钮文案 显示↔隐藏；aria-label/title 始终冻结「显示密码」（setup 静态契约） |
| /admin 登录页密码显隐（表单委托 + 默认 ariaLabel） | **PASS** | type/文案/aria-label 同步切换；**title 不随切**——经 git diff 核实旧 admin/app.ts 从未更新 title，属逐字保留（脚本初版误期望 title 随切，已按旧实现修正判定） |
| 管理员登录闭环 | **PASS** | 表单提交后登录卡隐藏、后台导航与概览渲染 |
| 功能码浮层 placeFeaturePicker（商品→新增商品编辑器） | **PASS** | 左对齐 Δ=0px；宽 460px（命中夹档上界）；fixed；视口内无溢出；aria-expanded true→Esc 后 false |
| 行菜单 placeRowMenu（商品列表行内 ⋯） | **PASS** | 右对齐 Δ=0.42px（亚像素舍入）；向下展开；fixed；视口内；Esc 关闭 |

绑定方式×选项矩阵：逐元素+ariaLabel:false（setup）与委托+默认（admin）两轴均已实测；store.ts 为逐元素+默认（两轴的交叉组合，同一 togglePassword 实现），未单独实测。

### 复验轮结论
AC-12 由 4/5 上调为 **5/5**（唯一扣分的可见性谓词理论差异已在类型域消除，且 store 侧三类重构交互完成真实浏览器验证）。最终结论维持 **PASS**（无 blocker/major/minor；nit #4 按记录维持）。
