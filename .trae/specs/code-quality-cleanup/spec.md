# 工作区代码质量治理（死代码清理 / 重复代码收敛 / 业务逻辑修复） - 产品需求文档

## Overview
- **Summary**: 对工作区两个相互独立的项目（`homeos-3d`：FastAPI 后端约 2.2 万行 + Three.js/TS 前端约 17.8 万行；`homeos-store`：FastAPI 后端约 2.2 万行 + TS 前端约 1 万行）进行全量代码质量治理：修复已证实的业务逻辑缺陷、清除死代码与无用代码、收敛重复实现，并固化质量门禁防止复发。
- **Purpose**: 消除一个资损级业务缺陷（微信支付订单被误按线下退款）、一个 500 错误缺陷（设备状态未同步时控制接口崩溃）、若干资金/资源类潜伏缺陷；移除经全仓引用验证的死代码（含 studio-app.ts 约 900 行"import 坟场"）；把多处复制粘贴实现收敛为单一事实源；通过 tsconfig/pyflakes 门禁防止问题回流。
- **Target Users**: 项目维护者（部署/运营 HomeOS-3D 与 HomeOS-Store 的开发者与运营人员）。

## Goals
- 修复全部经证据链闭合的业务逻辑缺陷（高/中/低危，见 FR-1）。
- 移除两个后端 12 项已交叉验证的确认死代码，以及前端全部编译器可证的未使用声明（tsc `--noUnusedLocals --noUnusedParameters` 归零，约 700+ 处，集中在 studio-app.ts）。
- 完成约 20 组行为等价的重复代码收敛，每组要么消除要么留有书面保留理由。
- 修复 Draco 解码 Worker 无构建产物的部署缺陷并加固 Worker 池容错。
- 把未使用代码检查固化进两个 `tsconfig.json`；Python 侧以 pyflakes 作为验收门禁。
- 全程不改变任何运行时对外行为（除明确列出的缺陷修复外），不破坏构建。

## Non-Goals
- **不做架构级拆分**：不拆分 home.ts（约 2.2 万行）、studio-app.ts、selection-transform.ts 等巨型文件。
- **不做无法在本环境运行时验证的高风险深重构**，以下列入 advisory、不在本次实施：
  - `runtime-caches.ts` 三个图片加载队列类抽取 `QueuedImageLoader` 基类（约 400 行、队列/超时语义微妙）；
  - `editor/home/pickers.ts` 四个实体选择器函数工厂化（约 200 行、候选排序差异细微）；
  - admin 10 个面板约 20 个分页 loader 的工厂化、三份 fetch 封装的工厂化（触及全部 API 调用点）；
  - `selection-transform.ts` 7 组指针拖拽绑定提取 helper、`studio-render-pipeline.ts` 两处 45 行实例化循环提取（鼠标/渲染核心路径，无 UI 自动化测试不可回归验证）。
- 不新增任何功能、不改变 HTTP API 契约、不做数据库 schema 变更/迁移（短差闭环复用内存态 incidents 计数）。
- 不引入新的第三方依赖或新的 lint 工具链配置文件（仅启用 TS 编译器自带选项；pyflakes 已在环境中可用，仅作验收命令）。
- 不修改两处经确认的"有意设计"：支付宝回调无时间戳窗口（兼容性，advisory）、`net_probe` 允许内网探测（有意放行，advisory）。
- 不重写注释/文档风格，仅删除确认的残留（英文恢复注释、孤立注释、成片空行、陈旧 docstring）。

## Background & Context
- 2026-09-28 完成两轮只读深度审计（5 个并行审计代理，覆盖全部 198 个项目 Python 文件与 386 个 TS 文件），主要发现已由主代理逐条读码复核：
  - **资损级（高置信，前后端链路闭合）**：`homeos-store/frontend/src/admin/panels/orders.ts:393` `offlineRefund = !['', 'alipay'].includes(provider)` 导致微信订单退款时前端传 `offline:true`；后端 `admin_orders.py:432` 为 OR 判定，跳过微信退款 API，客户收不到退款。文件 :389-392 保留的英文注释显示恢复者已察觉异常但保留了错误行为。后端 `_offline_refund_reason`（:631-639）已有服务端权威判定（manual/空/未知渠道才线下）。
  - **500 错误（高置信）**：`homeos-3d/backend/src/modules/interaction3d/lock.py:219/221` 与 `purifier.py:41/94` 在 `if state and ...` 守卫之后无条件 `state.get(...)`；调用方 `api.py:315/358/432` 可传 None（HA 首轮同步前/重连期）→ AttributeError → 500。`climate.py:55` 为正确写法对照。
  - **资金闭环缺口（中置信）**：`homeos-store/backend/src/commerce/referrals.py:290-325` 退款扣回邀请积分时余额不足部分（shortfall）仅写入台账"请人工追偿"文本，无 incident/后台可见性；`ops/incidents.py` 已有可扩展的 note/status 机制（KINDS 字典 + 后台/healthz 展示）。
  - **构建缺陷（高置信）**：`draco-decoder-worker.ts` 为零依赖经典 Worker，但两个 vite 配置均不产出 `/static/3d-studio/export/draco-decoder-worker.js`；内置 278 个 GLB 均未用 Draco 压缩故暂未触发，用户导入 Draco GLB 时必 404。Worker 池 `onerror` 后毒化槽位永不替换。
  - 死代码：3d 后端 6 项确认（StateHub.entity_ids、registry/live 与 service 重复的 HA 常量块、3 个死 logger）；store 后端 6 项确认（KeyRegistry.key_ids/.previous、LicenseAuthority.signer/.transport、payment_provider_from_db、site_name_error）；前端 tsc 未使用声明 3d 项目约 700 处、store 项目 15 处。
- 基线（审计前实测）：两后端 `python3 -m py_compile` 全通过、pyflakes 零确认告警；两前端 `bun run typecheck` 零错误；仓库内无测试文件（前序重构已移出，当前不存在 tests 目录），因此验证手段为：py_compile/pyflakes、tsc（含新增严格选项）、vite 构建（homeos-3d app+runtime、homeos-store）、Python 模块导入冒烟、全仓 grep 引用复核。
- 硬约束延续：两个项目必须保持独立（禁止跨项目 import）；根目录 `design/` 为唯一共享设计系统；不新增运行时数据/私钥入仓。

## Functional Requirements
- **FR-1（业务逻辑修复）**：
  - 微信订单退款必须走微信渠道退款 API；是否线下退款一律由后端 `_offline_refund_reason` 权威判定，前端仅据同口径谓词展示文案，不再向请求体传 `offline`；同时删除 :389-392 英文残留注释。
  - lock/purifier（共 3 处解引用）在 `state` 为 None/非 dict 时返回 409（语义与 climate/cover/api 既有防护一致），不得抛 AttributeError。
  - 退款扣回邀请积分存在 shortfall 时：通过 `incidents.note` 登记新 kind（含中文 KINDS 标签、订单号），审计日志体现短差；台账与 `order.referral_reward_points_centi` 现有保留短差语义不变。
  - 邀请页提现引导文案的手续费/到账金额必须与同文件 preview 及后端 `withdraw_fee_centi` 同公式（`积分×百分比/100`，不足 0.01 舍去），任何输入下不出现负数文案；settings 缺失时 NaN 有兜底。
  - 低危清单（详见各任务）：折线图空序列防御、人体感应时钟偏移负 elapsed 钳零、悬停滚动元素脱离 DOM 自停、运行时弹窗缩放观察器叠开泄漏、admin 会话 403 处理、setup token 从地址栏清理、store-orders 冗余 clearInterval、render_cache stat/unlink TOCTOU、Draco Worker 致命错误后池槽重建与解码失败路径 WASM 资源释放；store 后端 6 个低危候选项须逐一读码裁定，仅修复经证实且行为安全者，其余在任务证据中写明保留理由。
- **FR-2（死代码清除）**：删除两个后端 12 项确认死代码；2 项疑似（`BASE_REVISION`、panel 包门面）经引用核验后删除或保留并记录；前端全部未使用 import/局部符号/类型别名/多余 export/未使用形参（形参以删除或 `_` 前缀处理）清零；移除 `store.ts` 中只写不读的 `hb-order-${orderNo}` localStorage 残留（含隐私面）与孤立 `storeStaticVersion`。
- **FR-3（重复代码收敛，行为等价）**：完成 T15-T19 列出的约 20 组收敛（HA 常量×3、utc_now×2、管理员校验×3、oversized 闭包×2、finite_number×2、重复 future import 行×15、踢会话循环×3、优惠码名额重算双口径、提现序列化双份、函数内重复导入、20 项环境设备数组×4、shadeColor×2、祖先 userData 遍历×2、isVisibleWithin×2、活动态判定×2、errMsg×10、密码显隐×3、浮动层定位×2）。
- **FR-4（构建链路）**：Draco Worker 经 vite.config.ts 的 esbuild IIFE 条目产出到 `dist/static/3d-studio/export/draco-decoder-worker.js`，与 loader 中 URL 字面量一致；构建后人工核验产物存在。
- **FR-5（门禁固化）**：两个项目的 `tsconfig.json` 开启 `noUnusedLocals` 与 `noUnusedParameters`；验收时 pyflakes 对两个后端零确认告警（SQLAlchemy 副作用导入等 F401 须有 `# noqa: F401` 明示）。
- **FR-6（行为保持与独立性）**：除 FR-1 列明的行为修正外，所有删除/收敛不得改变运行时行为；不新增跨项目引用；不改变对外 API、DB schema、静态资源 URL 约定（新增 worker URL 本就是代码已引用的契约）。

## Non-Functional Requirements
- **NFR-1（可验证性）**：每项修改都有客观证据（tsc/pyflakes/py_compile/vite 构建输出、grep 引用结果、file:line 代码证据）；无法用工具证明的行为等价性须在任务证据中做人工语义说明。
- **NFR-2（最小变更）**：去重优先采用"同目录/就近提取"，diff 保持最小；不夹带风格重排；新增/保留注释使用中文，与所在文件既有风格一致。
- **NFR-3（可回归）**：最终状态下三个构建命令（homeos-3d `bun run build` 含 app+runtime、homeos-store `bun run build`）全部成功；两个 `bun run typecheck` 零错误；后端所有模块可导入冒烟。

## Constraints
- **Technical**：macOS 环境；包管理 bun 1.4.x；Python 3.14（系统 python3 可 py_compile，store 虚拟环境 `.venv-store` 含完整依赖可做导入冒烟）；不得新增依赖；vite 8 / tsc 5.9 / three 0.186（外部 ESM，不得打包进 chunk）。
- **Business**：项目要求前后端 100% 源码恢复，行为忠实性优先于"看起来更优雅"；资金/授权/加密相关代码的任何改动必须有前后端双侧代码证据。
- **Dependencies**：incidents 复用现有 `ops/incidents.py`；优惠码重算收口到 `commerce/coupons.py:115 recount_coupon_slots`（其 docstring 已声明为唯一收口口径）；错误文案收口到已存在的 `store-types.ts:172 errorMessage`（现零引用的超集实现）。

## Assumptions
- 仓库外不存在未入库的独立 CI 会另行构建 Draco Worker（已核实 .github/workflows/docker.yml、Dockerfile、scripts/ 无相关逻辑；若部署侧确有外部构建，本次修复仍属正确的仓库内补齐）。
- tsc 对 TS6133/TS6192/TS6196/TS6138 的诊断即为"未使用"的权威证据；运行时动态访问（prototype 字符串注入、Worker URL 字面量、HTML 脚本引用、vite glob 入口）已在审计阶段排除。
- 两个后端的 SQLAlchemy 模型/FastAPI 路由/Pydantic 校验器等"动态引用"误报已由审计代理人工排除。

## Acceptance Criteria

### AC-1: 微信订单不再误按线下退款
- **Type**: `rule`
- **Given**: 一笔 `paymentProvider='wechat'` 的已支付订单，运营在后台点击退款并确认
- **When**: 前端发出 POST `/store-admin/v1/orders/{no}/refund`
- **Then**: 请求体不含可将该订单置为线下退款的 `offline:true`；后端经 `_offline_refund_reason` 判定非线下并实际调用微信退款 API（`admin_orders.py:458` 分支）
- **Pass Condition**: orders.ts 中线下谓词与后端渠道口径一致（仅 manual/空/未知渠道为线下），请求体不再由前端强传 offline（或所传值经核验不可能对 wechat/alipay 为 true），英文残留注释已删除
- **Evidence**: orders.ts:385-410 修改后代码；admin_orders.py:431-432/458/631-639 对照；typecheck 通过

### AC-2: 设备控制空状态返回 409 而非 500
- **Type**: `rule`
- **Given**: HA 首轮同步前/重连期 StateHub 无实体状态，用户触发门锁或空气净化器（含附加实体）控制
- **When**: 校验器收到 `state=None`
- **Then**: 返回 409（"状态暂不可用"语义），不抛 AttributeError
- **Pass Condition**: lock.py:219/221、purifier.py:41/94 的所有 `state.get` 均在非空/类型守卫之后（或统一守卫提前返回）；py_compile 通过
- **Evidence**: 修改后 file:line 代码；与 climate.py:55/cover.py:76 守卫口径一致的对照说明

### AC-3: 退款扣回积分短差具备运营可见性闭环
- **Type**: `rule`
- **Given**: 邀请奖励接收方钱包余额小于退款应扣回的积分
- **When**: 订单全额退款执行 `reverse_order_reward`
- **Then**: shortfall>0 时调用 `incidents.note` 登记新 kind（KINDS 有中文标签、携带 order_no），后台 incidents 视图与 /healthz 可见；审计日志/台账包含短差金额
- **Pass Condition**: incidents.py KINDS 新增条目；admin_orders.py 退款路径在短差>0 时 note；不新增 DB 表/列
- **Evidence**: 修改后代码与调用链 grep 证据；模块导入冒烟通过

### AC-4: 邀请页提现手续费文案与真实公式一致
- **Type**: `rule`
- **Given**: 任意 `withdrawalMinPoints` 与 `withdrawalFeePercent` 配置（含费率高于下限、settings 未下发）
- **When**: 用户打开邀请页
- **Then**: 引导文案展示的手续费=minPoints×percent/100（不足 0.01 舍去口径与 preview 一致）、到账=minPoints−手续费，永不为负；无 "NaN" 文案
- **Pass Condition**: referrals.ts:173 与 :105-110 使用同一计算函数/口径且对 NaN/undefined 兜底
- **Evidence**: 修改后代码；至少 3 组数值（50/10%、10/20%、缺配置）的人工推演结果

### AC-5: 低危逻辑缺陷清单全部闭环或有保留结论
- **Type**: `rule`
- **Given**: 审计报告列出的低危项
- **When**: 实施完成
- **Then**: FR-1 列明的前端 5 项、Draco 池/Worker 2 项、后端 TOCTOU 1 项完成修复；store 后端 6 个低危候选逐项有"修复"或"保留（附理由）"结论
- **Pass Condition**: tasks.md 对应任务 Completion Evidence 逐项可查
- **Evidence**: 各 file:line 代码证据 + typecheck/py_compile

### AC-6: Draco Worker 具备构建产物且池致命错误可恢复
- **Type**: `rule`
- **Given**: 执行 homeos-3d 前端生产构建
- **When**: 构建完成
- **Then**: `homeos-3d/dist/static/3d-studio/export/draco-decoder-worker.js` 存在且为经典 Worker 脚本；Worker onerror 后该池槽被终止移除，后续解码请求可新建 Worker；解码抛错路径释放已分配的 WASM geometry/内存
- **Pass Condition**: vite.config.ts esbuild 条目产出路径与 `/static/3d-studio/export/draco-decoder-worker.js` 字面量一致；draco-loader 池选择逻辑不再永久返回毒化槽
- **Evidence**: 构建后 `ls` 产物；修改后代码；typecheck

### AC-7: 两个后端确认死代码全部移除
- **Type**: `rule`
- **Given**: 审计确认清单（3d：state_hub.entity_ids、registry/live 重复常量块与死函数、3 个死 logger；store：key_ids/.previous/.signer/.transport/payment_provider_from_db/site_name_error）
- **When**: 实施完成
- **Then**: 12 项全部删除；2 项疑似项有删除或保留的书面结论；pyflakes 不新增任何告警
- **Pass Condition**: 每项符号删除后全仓 grep 仅可能命中字符串/注释清理点；两后端 py_compile + 导入冒烟通过
- **Evidence**: grep 输出、pyflakes 输出、任务证据清单

### AC-8: 前端未使用代码清零并固化编译器门禁
- **Type**: `rule`
- **Given**: 两个前端项目
- **When**: 运行 `bun run typecheck`
- **Then**: 两个 `tsconfig.json` 含 `noUnusedLocals:true` 与 `noUnusedParameters:true`，且类型检查零错误（含 vite 配置文件）
- **Pass Condition**: 两个项目分别在项目根执行 tsc 零错误；studio-app.ts import 坟场清除后构建产物正常
- **Evidence**: 两个 tsc 命令输出；tsconfig.json diff

### AC-9: 重复代码收敛清单闭环
- **Type**: `rule`
- **Given**: FR-3 列出的约 20 组重复
- **When**: 实施完成
- **Then**: 每组重复要么已收敛到单一实现、所有调用方改为引用，要么在 tasks.md 中写明保留理由（仅限经核验存在真实语义差异的项）
- **Pass Condition**: 收敛后被删副本在全仓 grep 无残留定义；新增共享位置均在消费方可达的同项目内（不跨项目）
- **Evidence**: 每组的位置 A/B 与新位置 file:line、grep 结果

### AC-10: 全量构建与静态门禁全绿
- **Type**: `rule`
- **Given**: 实施完成的工作区
- **When**: 依次执行验证命令
- **Then**: ①两个后端 py_compile 全通过；②pyflakes 对两个后端零告警（显式 noqa 除外）；③homeos-3d/homeos-store 两个 typecheck 零错误；④homeos-3d `bun run build`（app+runtime）成功；⑤homeos-store `bun run build` 成功；⑥后端模块导入冒烟通过
- **Pass Condition**: 六条全部通过并留有命令输出证据
- **Evidence**: 各命令输出摘要与产物路径

### AC-11: 项目独立性与契约边界不被破坏
- **Type**: `rule`
- **Given**: 全部修改
- **When**: 全仓扫描跨项目引用与契约变更
- **Then**: homeos-3d 与 homeos-store 之间无 import/文件引用；无 DB 迁移新增；无 HTTP 路由/请求响应字段的删除或改名（offline 请求字段从前端停用属 FR-1 修复，后端字段保持兼容）；根 design/ 不变
- **Pass Condition**: grep 跨项目引用零命中（除既有的根 design/ 构建复制约定）；git status 中无 db/migrations 变更
- **Evidence**: grep 输出、git status/diff --stat

### AC-12: 行为等价与最小变更质量
- **Type**: `rubric`
- **Dimension**: 死代码删除与去重的语义保真度、diff 最小化、无夹带
- **Scale**: 1-5
- **Anchors**: 1 = 出现运行时行为变化或误删活符号；3 = 功能保持但存在无关重排/大 diff 增加审查负担；5 = 每项删除/收敛均有引用证据或逐字等价证据，diff 精简可审
- **Pass Threshold**: >= 4
- **Evidence**: 全部任务 Completion Evidence、独立审查对代表性收敛点的逐行比对

### AC-13: 缺陷修复工程质量
- **Type**: `rubric`
- **Dimension**: 修复的正确性、防御完备性、与既有代码风格/中文注释约定的一致性
- **Scale**: 1-5
- **Anchors**: 1 = 修复引入新缺陷或与周边口径不一致；3 = 修复正确但注释/边界处理粗糙；5 = 修复与既有正确模式（如 climate 守卫、coupons 收口、preview 公式）统一，边界完备，注释准确
- **Pass Threshold**: >= 4
- **Evidence**: 各修复点代码；独立审查对资金/控制路径的复核

## Open Questions
- [ ] 高风险深重构（Non-Goals 列举的图片加载队列基类、选择器工厂、分页/fetch 工厂、指针拖拽 helper、实例化循环提取）确认不在本次范围；如希望一并实施，请在审批时指出，将拆分为后续独立规格（需引入可运行时验证手段）。
- [ ] store 后端 6 个低危候选（0 元单退款收权益、免费单渠道双重校验、admin_cancel 不关渠道侧交易、改邮箱不踢会话、手工发牌 Customer 无 SAVEPOINT、提现 request_key 全局唯一）默认在实施时逐项裁定（仅修证实且安全者）；如要求"全部保持现状不动"或"尽量全部修"，请在审批时说明倾向。
