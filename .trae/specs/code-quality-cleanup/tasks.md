# 工作区代码质量治理 - 实施计划

> 说明：任务按"高优先级业务修复 → 死代码清除（按区域）→ 同区域去重 → 门禁固化 → 全量验证"排序。
> 每个任务的文件范围互不重叠或仅在串行顺序上先后接续；标记【审】的任务完成后须保留命令输出证据。

## Task 1: 修复微信订单退款被误判为线下退款（资损级）
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Completion Evidence**:
  - orders.ts:385-408 已修改：谓词改为 `!['alipay','wechat'].includes(provider)`（与后端 _offline_refund_reason 同口径：manual/空/未知渠道才线下）；请求体精简为 `{note}` 不再传 offline（后端 schemas.py:383 `offline: bool=False` 默认值，mark-paid/fulfill/refund 共用 AdminOrderActionRequest，省略完全兼容）；英文残留注释 4 行已删除，替换为权威裁决说明；线下弹窗文案覆盖三种后端情形。
  - 全前端 grep `offline`：仅剩 settle-offline（另一功能）、本地展示变量与注释，无任何请求体 offline:true 残留。
  - `bun run typecheck`（homeos-store）exit 0。
- **Description**:
  - 修改 `homeos-store/frontend/src/admin/panels/orders.ts` 退款分支（:385-410）：线下谓词与后端 `_offline_refund_reason`（admin_orders.py:631-639）对齐——仅 manual/空/未知渠道（即不在 `['alipay','wechat']`）为线下；删除 :389-392 英文恢复残留注释。
  - 请求体不再由前端强传 `offline`（核验 admin_orders 退款 schema 中该字段可选；保留后端字段兼容），由后端 `forced_offline` 权威决策；仅在前端本地保留 `offlineRefund` 用于弹窗标题/文案/okText 与成功 toast 展示。
  - 核验 :95 `known=['alipay','wechat']` 口径与新谓词一致。
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `rule` TR-1.1: orders.ts 中不存在 `['', 'alipay']` 旧谓词；对 wechat 订单本地谓词=false；POST body 不含 offline:true；证据为修改后 file:line 与 grep 输出
  - `rule` TR-1.2: store 前端 typecheck 通过
- **Notes**: 不改后端；后端 OR 逻辑与 schema 仅做只读核验并在证据中记录。

## Task 2: 修复 3D 设备控制空状态 AttributeError（500→409）
- **Status**: `completed`
- **Completion Evidence**:
  - lock.py:213-217 守卫改为 `not isinstance(state, dict) or ...`（参照 cover.py:76 既有正确模式）；:219/:221 的 state.get 全部在守卫之后。
  - purifier.py:36-44（validate_extra_command）与 :94-95（validate_purifier_command）同款守卫，409 detail 文案与原语义保持。
  - 调用点核对：api.py:315/358/432 均传 `states[0] if states else None`；climate:55/cover:76 本就正确，五个校验器口径统一。
  - `python3 -m py_compile` 两后端通过；pyflakes lock.py/purifier.py 无告警。
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `homeos-3d/backend/src/modules/interaction3d/lock.py:208-222`：将状态可用性判断合并为统一前置守卫（参照 climate.py:55 模式）：`if not isinstance(state, dict) or state.get('available') is False or state.get('state') in {None,'','unknown','unavailable'}: raise 409`，守卫通过后再访问 :219 动作态与 :221 attributes。
  - `purifier.py`：`validate_extra_command`（:36-41）与 `validate_purifier_command`（:90-94）同样改为前置非 dict/空值守卫后再 `.get`；注意保持 `validate_extra_command` 现有 409 detail 文案与 switch/button/select/number 返回路径不变。
  - 检查 cover.py:76、api.py:264 既有防护不受影响。
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `rule` TR-2.1: 三处校验器在 state=None 时到达的都是 HTTPException(409) 而非 AttributeError；证据为修改后代码逐行说明
  - `rule` TR-2.2: `python3 -m py_compile` 两后端全部文件通过；3d 后端模块导入冒烟（.venv 可用则用，否则至少 compileall）
- **Notes**: 不改变 422 校验顺序与文案。

## Task 3: 退款扣回邀请积分短差 incident 闭环
- **Status**: `completed`
- **Completion Evidence**:
  - referrals.py:290-329 reverse_order_reward 返回值改为 `(deductible, shortfall)`（含全部早退分支），docstring 说明短差语义；唯一调用点 admin_orders.py:563 同步解包。
  - admin_orders.py:566-576 shortfall>0 时调 incidents.note("referral.reversal_shortfall", order_no, error)；审计文本 :596-601 增加"已扣回 X / 另有 Y 已登记人工追偿"两段（无奖励时整段不出现）。
  - incidents.py:17-38 KINDS 新增 referral.reversal_shortfall 中文标签；顺手为既有 8 个无标签 kind（alipay.config/wechat.config/refund.ledger/referral.reward/delivery/delivery.record/verification.delivery_record/fulfillment.retry）补中文标签（纯展示，不改键名）。
  - 额外发现待 Task 8 处理：store.py:302 incidents.note 误传不存在的 email= 形参（except 分支内潜伏 TypeError）。
  - 验证：两后端 py_compile 通过；三文件 pyflakes 零告警；.venv-store 导入冒烟通过（签名 -> tuple[int,int]，新 KINDS 标签存在）。
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `homeos-store/backend/src/commerce/referrals.py:290-325 reverse_order_reward`：在保持现有"只扣实际可扣、shortfall 留账"语义前提下，让调用方可获知短差（返回 `(deductible, shortfall)` 或返回含二者的小结构；同步更新唯一调用点 admin_orders.py:561）。
  - `ops/incidents.py` KINDS 新增如 `"referral.reversal_shortfall": "退款扣回邀请积分余额不足"`。
  - `api/admin_orders.py` 全额退款路径：shortfall>0 时 `incidents.note("referral.reversal_shortfall", order_no=..., error=f"{shortfall} 积分无法扣回")`，并在 `_audit` 退款日志中追加短差信息。
  - grep 确认 reverse_order_reward 无其他调用点（已知仅 admin_orders.py:561）。
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `rule` TR-3.1: shortfall=0 时行为与现状逐字一致（不调 note、审计文案不变）；shortfall>0 时 note 被调用且 order.referral_reward_points_centi 仍保留短差
  - `rule` TR-3.2: 新增 kind 有中文 KINDS 标签；不新增/修改任何 model 表结构（git status 无 models.py 字段变更与迁移文件）
  - `rule` TR-3.3: store 后端 py_compile + 导入冒烟通过
- **Notes**: incidents 为内存态计数，重启归零是既有设计。

## Task 4: 修复邀请页提现手续费文案算术与 NaN 兜底
- **Status**: `completed`
- **Completion Evidence**:
  - referrals.ts:55-64 新增模块级 `withdrawFeeBreakdown(pointsValue, percent)`：转厘→基点（Math.round，对应后端 ROUND_HALF_UP）→ fee=floor(cents*bps/10000)；bps>=10000 全额扣除钳制（对齐 money.py:93-95）；输入/费率 NaN 与负值按 0 钳制。
  - preview（:111-123）与 guideFee（:182-187）统一走该函数；旧的 `minPoints() - Number(percent)` 百分比直减已删除；费率展示使用本地 feePercent（缺失显示 0%，不再显示 undefined/NaN）。
  - 数值推演（函数口径，单位：积分）：50/10% → cents=5000,bps=1000,fee=500 厘=5.00 积分，net=45.00；10/20% → fee=200 厘=2.00，net=8.00（旧文案会算出 -10.00）；settings 缺失 → percent=0，fee=0，net=min。
  - 后端对照：commerce/money.py:83-95 withdraw_fee_centi 同公式 floor 舍入，bps≥10000 全额扣。
  - `cd homeos-store && bun run typecheck` exit 0。
  - `homeos-store/frontend/src/referrals.ts:173`：手续费改为与 preview（:105-107）同口径：`feePoints = floor(min×percent/100)`（积分单位，不足 0.01 舍去），到账=`max(0, min-feePoints)`；将该计算提取为本文件内可复用小函数供 preview 与 guide 共用（preview 现以厘计算，抽函数时保留其精度或统一两处口径）。
  - :100/:106 等 Number(undefined) 路径加有限数兜底（percent 缺失按 0），杜绝 "NaN" 文案。
  - 数值推演：50 积分/10%→手续费 5、到账 45.00；10 积分/20%→手续费 2、到账 8.00（不为负）；settings 缺失→手续费 0、到账=下限。
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-4.1: 三组推演结果写入 Completion Evidence；文案中不再出现 `minPoints() - Number(percent)` 直减
  - `rule` TR-4.2: store typecheck 通过
- **Notes**: 纯前端静态文案；实际记账以后端为准。

## Task 5: Draco Worker 构建链路接入与池容错加固
- **Status**: `completed`
- **Completion Evidence**:
  - vite.config.ts:49-53 classicEntries 新增 `3d-studio/export/draco-decoder-worker`（classicIifePlugin esbuild IIFE → dist/static/3d-studio/export/draco-decoder-worker.js），与 studio-app.ts:1056 字面量 URL 完全一致。
  - 白名单裁定：该 worker 仅登录后 studio 使用，故意**不**加入 public-static 匿名清单（非清单 = 登录+assets 能力，与 studio 其余 hashed JS 同口径）；构建后 grep dist/public-static.json 确认 NOT_IN_ANONYMOUS_MANIFEST。
  - draco-loader.ts:145-161 onerror：拒绝在途任务后清空 callbacks、indexOf+splice 出池、terminate()，毒化槽位可被后续 _getWorker 重建替代。
  - draco-decoder-worker.ts：decodeGeometry:112-181 整体 try/finally 保证 Mesh/PointCloud 在解码失败/属性/索引提取抛错时 destroy；decodeIndex:189-201 与 decodeAttribute:223-267 malloc 后 try/finally 保证 _free；成功路径消息协议与返回结构未变。
  - 验证：homeos-3d typecheck exit 0；build:app exit 0；产物 2882 字节存在，文件头 `"use strict";(()=>{...})` 经典 IIFE，grep 顶层 import/export 计数 0。
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `homeos-3d/frontend/vite.config.ts` classicEntries 增加 `"3d-studio/export/draco-decoder-worker"` 条目（源 `src/app/3d-studio/export/draco-decoder-worker.ts`，零依赖经典 worker，经现有 classicIifePlugin esbuild IIFE 产出到 `dist/static/3d-studio/export/draco-decoder-worker.js`），与 studio-app.ts:1056 及 draco-loader.ts 中 URL 字面量一致；如 public-static 白名单需要（核验 seed/manifest 机制），将该 URL 加入白名单。
  - `draco-loader.ts`：onerror 回调中除拒绝在途任务外，将该 worker 从 workerPool 移除并 terminate，使后续 `_getWorker` 可新建；选中槽位的致命错误路径保持拒绝当次任务。
  - `draco-decoder-worker.ts`：decodeGeometry 内 `_malloc` 后异常路径确保 `_free`、geometry 对象确保 `draco.destroy(...)`（try/finally 覆盖失败路径），不改变成功路径消息协议。
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `rule` TR-5.1: `bun run build:app`（homeos-3d）后产物文件存在（ls 证据），内容为非 ESM 经典脚本（无 import/export 顶层语句）
  - `rule` TR-5.2: 毒化 worker 不留在池中（代码证据：onerror 内 splice+terminate）；typecheck 通过
  - `rubric` TR-5.3: worker 资源释放；scale 1-5；anchors 1=失败路径仍泄漏；3=仅覆盖 malloc 未覆盖 geometry；5=两类失败路径均有 finally 释放且成功路径字节；threshold >=4；证据为修改后 worker 代码逐段说明
- **Notes**: 不改 loader 的消息协议与 vendor 解码器目录约定。

## Task 6: 3D 前端低危逻辑修复合集
- **Status**: `completed`
- **Completion Evidence**:
  - line-chart-runtime.ts:17-21 空/非数组序列返回 null；两个调用点加防御性 null 兜底：line-chart.ts:98-103（交回 history-loading 空骨架）、history-chart.ts:295-298（返回 detailsElement），既有 .length/早退保护保持不变。
  - presence-runtime.ts:216-222 elapsed 负值 Math.max(0) 钳制（时钟回拨/未来时间戳），:235-236 判定简化为 `===null || <= timeout`，语义=刚发生移动不再被误判超时。
  - home.ts:14007-14013 stepHoverScroll 每帧 isConnected 检查，脱离 DOM 即 stopHoverScroll（清 timer/rAF、删 map 死条目、复位 class）。
  - runtime-dialogs.ts:21-35 抽出 teardownRuntimeDialogScaleContext（cancelAnimationFrame+disconnect+取消入场动画+移除样式类），register:65-68 覆写前先拆除旧上下文，clear:202-207 复用同一函数。
  - homeos-3d typecheck exit 0。
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - `renderer/controls/line-chart-runtime.ts:17-29`：空序列入口返回 null（调用方两处已有非空保护，同步核验空值兼容）。
  - `renderer/controls/presence-runtime.ts:227-233`：elapsedSinceChangeMs 为负时按 0 钳制。
  - `editor/home.ts:14007-14014 stepHoverScroll`：每帧检测 hoveredRowElement.isConnected，脱离 DOM 立即 stopHoverScroll。
  - `renderer/core/panel-renderer/runtime-dialogs.ts:48 registerRuntimeDialogScale`：覆写 context 前先对旧 context 执行清理（复用 clearRuntimeDialogScale 的内部逻辑），防止旧 ResizeObserver/动画泄漏。
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-6.1: 四处修改的 file:line 证据；空序列/null 传播路径在两个调用点核验安全
  - `rule` TR-6.2: homeos-3d typecheck 通过
- **Notes**: 不改动这些模块的其余行为。

## Task 7: Store 前端低危逻辑修复合集
- **Status**: `completed`
- **Completion Evidence**:
  - admin/app.ts:138-141/148-151：/auth/me 与 /overview 两处 catch 的 403 与 401 同按未登录 return null，403 不再冒"无法确认登录状态"。
  - setup.ts:23-29：fragment token 预填后 history.replaceState 抹 hash（pathname+search，不刷新），try/catch 兼容隐私模式抛错；提交读 #setup-token 输入框（:74）不依赖 hash，无行为回退。
  - store-orders.ts:343-346：删除 pollTimer 上冗余 clearInterval（全文件 grep 唯一赋值点 :107 为 setTimeout）；paymentCountdownTimer 经核验确为 setInterval（:94），其 clearInterval 保留。
  - referrals.ts:69-71 新增 HISTORY_PAGE_SIZE=20 常量并注明后端来源；:253 替换硬编码。后端核验：store_catalog.py:47 HISTORY_PAGE_SIZE=20，store_referrals.py:90-91/119-120 两列表均按此 offset/limit，口径一致。
  - table.ts:135-144：pagedFetch 被代次淘汰的旧请求 catch 中 return null（静默），仅当前最新请求的错误仍 setTableState(error)+throw；快速翻页不再弹双错误 toast。
  - store typecheck exit 0。
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - `admin/app.ts:132-152 resolveAdminSession`：403 与 401 同样按未登录处理（return null），文案不再显示"无法确认登录状态"。
  - `setup.ts:9-23`：setup token 读取后 `history.replaceState` 清除 location.hash（不刷新页面）。
  - `store-orders.ts:344-345`：同一 timer 上冗余的 clearTimeout/clearInterval 收敛为正确的单一调用（先核验该 timer 全部赋值点确实是 setTimeout）。
  - `referrals.ts:235`：先核验后端历史分页页大小；确为 20 则提取与后端同源的命名常量；若后端非 20 则改为以后端返回的分页元数据判定（无元数据时保留 20 并注释）。
  - `table.ts:117-159 pagedFetch`：被取代的旧请求 reject 时标记静默，避免快速翻页弹双错误 toast（仅吞掉"被代次淘汰"的拒绝，不吞真实新错误）。
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-7.1: 每项修改的证据；分页页大小以后端代码核验结论为准并记录
  - `rule` TR-7.2: store typecheck 通过
- **Notes**: settings.ts:928-963 NaN 即时校验属体验增强、非缺陷，列入 advisory 不动。

## Task 8: 后端低危候选项裁定与 TOCTOU 修复
- **Status**: `completed`
- **Completion Evidence**:
  - TOCTOU：render_cache.py:103-122 两处 glob 后 stat 包 try/except FileNotFoundError（tmp 判定 stale、png 入列），清理竞态不再中断整轮回收。
  - 顺带修复 store.py:300-308 incidents.note 误传 email= 形参的潜伏 TypeError（Task 3 发现项），邮箱并入 error 文本。
  - 候选裁定结论表：
    1. **修复**｜0 元单退款不回收权益（高）：admin_orders.py:409-442/500/568-570——free_order 特判绕过可退余额闸口（amount=0、强制线下记账），跳过 :500「无资金变动」早退，fully_refunded 改为 cumulative>=total（付费单口径不变），免费单现在能走 _revoke_order_entitlements+release_coupon+置 refunded；邀请奖励本就 0 无资损。
    2. **保留**｜免费单渠道（高）：免费分支不碰渠道；payment_enabled 总闸为刻意设计（代码注释明示），provider 重复解析仅本地对象拼装无网络/缓存代价，不值得在行为忠实性优先的约束下改动。
    3. **修复**｜admin_cancel 不关渠道（中）：admin_orders.py:719-770 对齐 store_orders.cancel_order——resolve provider best-effort、close_payment、already_paid→409、closed 写 channel_closed_at，关单失败仅 warning 仍由巡检兜底。
    4. **修复**｜改邮箱不踢会话（高）：admin_accounts.py:154-156 加 _drop_account_sessions（与停用/重置密码/删除/用户自助改邮箱同口径；会话是不透明 token hash 查行，踢会话只能删行）。
    5. **保留**｜手工发牌无 SAVEPOINT（高）：insert_license_with_unique_code 内部已对每次尝试包 begin_nested（fulfill.py:195）；致命失败由 DbSession 外层事务整体回滚，Customer flush 不会半套残留；它没有 fulfillment_failed 状态要保，无需额外 savepoint。
    6. **部分修复**｜提现 request_key（高）：同账号顺序重试本就幂等返回（store_referrals.py:158-161）；并发跨/同账号撞唯一索引原裸 500，新增 IntegrityError 捕获（:212-227）：rollback 复查，他人键→409、自己键→幂等返回、其它完整性错误照旧抛。唯一约束全局化改复合键需 DB 迁移，受硬约束禁止，保持现状（换键即可恢复，低severity）。
  - 验证：两后端 py_compile 全过；5 个改动文件 pyflakes 零告警；.venv-store 导入冒烟通过，admin_cancel 新签名含 request: Request。
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 修复 `homeos-3d/backend/src/modules/interaction3d/render_cache.py:103-113`：glob 后 stat/unlink 包 `try/except FileNotFoundError`（清理竞态）。
  - 对 store 后端 6 个低危候选逐一读码裁定，仅修经证实且行为安全者，其余在 Completion Evidence 写明保留理由：
    1. 0 元单退款不回收权益路径（store_orders/admin_orders）；2. 免费单渠道强制校验与 provider 重复解析；3. admin_cancel 不关闭渠道侧交易；4. 后台改邮箱不踢会话；5. 手工发牌建 Customer 无 SAVEPOINT；6. 提现 request_key 全局唯一导致重试撞键。
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-8.1: render_cache 修改后 FileNotFoundError 不再中断清理流程的代码证据
  - `rule` TR-8.2: 6 个候选每项有"修复（file:line）"或"保留（理由+置信度）"结论表
  - `rule` TR-8.3: 两后端 py_compile + store 导入冒烟通过
- **Notes**: 支付宝回调时间戳窗口、net_probe rebinding 为 spec 已列 advisory，不在本任务。

## Task 9: 清除 homeos-3d 后端确认死代码
- **Status**: `completed`
- **Completion Evidence**:
  - ha/state_hub.py：删除 StateHub.entity_ids（全后端 grep `.entity_ids()`/state_hub.entity_ids 零调用；snapshot/retain 等保留）。
  - ha/registry.py、ha/live.py：删除与 service.py:25-52 逐字重复的 5 项（HA_ENDPOINT_RECHECK_SECONDS、STATE_FETCH_RETRY_DELAYS、HISTORY_FETCH_CONCURRENCY、HISTORY_CACHE_SECONDS、STATE_FETCH_REQUIRED_ATTRIBUTES）及死函数 state_requires_fetch_retry。全后端 grep 证实这 4 常量仅 service.py 内部消费（:102/:298/:332/:402）、该函数仅 service.py:289/311 调用；两 Mixin 文件本体保留（service.py:57-60 多继承使用）。
  - 死 logger ×3：license/heartbeat.py、license/contracts.py、license/transport.py 的 logger 定义及 import logging（grep 确认三文件内零 logger 使用、无外部 import logger；service.py:245 活 logger 未动；注意 ha/contracts.py 的 LOGGER 是另一模块的活导出，未误删）。
  - 疑似裁定：core/migrations.py BASE_REVISION 全 homeos-3d 仓（含 db/、alembic.ini）仅定义处一处 → 删除；panel/__init__.py 门面（PanelDocument/validate_panel_document/__all__）无 `from ..panel import` 或 `panel.PanelDocument` 属性式消费，消费方均直连 panel.schema/entity_refs → 仅保留包 docstring。
  - 验证：`python3 -m py_compile` 全 3d 后端通过；`python3 -m pyflakes homeos-3d/backend/src` 全量零输出。导入冒烟因系统 python 无 sqlalchemy（3d 无 venv，既定门禁不含此项）以编译/静态检查替代。
- **Priority**: medium
- **Depends On**: Task 2
- **Description**:
  - 删除 `ha/state_hub.py:97-100 StateHub.entity_ids`；删除 `ha/registry.py:12-40`、`ha/live.py:14-42` 中与 `ha/service.py:24-52` 重复且零引用的 HA 常量块与 `state_requires_fetch_retry`（删除前确认该常量在 service.py 为活引用源，删除后两文件其余逻辑不引用这些名字）。
  - 删除 3 个死 logger：`license/heartbeat.py:6,16`、`license/contracts.py:5,9`、`license/transport.py:6,19`（保留 service.py:245 活 logger，勿误删）。
  - 疑似项裁定：`core/migrations.py:18 BASE_REVISION` 全仓（含 db/、alembic.ini、Dockerfile）grep 后删除或保留；`panel/__init__.py:3-6` 门面确认消费方均直连 `.schema` 后删除导出。
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `rule` TR-9.1: 每个被删符号删除后全 backend grep 零代码引用；逐项清单证据
  - `rule` TR-9.2: py_compile + 导入冒烟通过；pyflakes 不新增告警
- **Notes**: 若删除常量块导致 registry/live 出现新的未使用 import，一并清理并记录。

## Task 10: 清除 homeos-store 后端确认死代码
- **Status**: `completed`
- **Completion Evidence**:
  - licensing/crypto.py：删除 KeyRegistry.previous 属性与 key_ids() 方法（全 homeos-store grep `.previous` 仅命中 config 的密钥路径语义、`key_ids(` 仅定义处；active/find 保留）。
  - licensing/service.py：删除 LicenseAuthority.signer/.transport 两个死属性，并连带删除仅它们使用的 LeaseSigner、TransportCipher import（KeyGeneration.signer 在 crypto.py:156 与 service.py:520 `active.signer` 均为活引用，未动）。
  - app.py：删除内嵌 payment_provider_from_db 函数及 app.state 挂载（全仓 grep 仅定义+挂载两处；resolve_payment_provider 保留，get_setting 仍被 :310 使用）。
  - ops/mailer.py：删除 site_name_error（全仓仅定义处；header_text_error 仍被发件人校验 :128 使用）。
  - security/schema_guard.py:18：副作用导入补 `# noqa: F401`（注册 ORM 模型到 Base.metadata，ensure_schema 依赖）；database.py:60 同款导入原本已有 noqa。pyflakes 不识别 noqa，裸跑仅剩这两条豁免输出，符合"显式 noqa 除外"口径。
  - admin_shared.py:27：核验 iso 在 :104-106 有真实使用，多余 `# noqa: F401` 移除并收成单行 import。
  - 验证：store 后端 py_compile 全过；.venv-store 导入冒烟通过（含属性存在性断言：previous/key_ids/signer/transport/site_name_error 均已消失）。
- **Priority**: medium
- **Depends On**: Task 3
- **Description**:
  - 删除 `licensing/crypto.py:190-195 KeyRegistry.previous/key_ids`、`licensing/service.py:64-72 LicenseAuthority.signer/.transport`（注意 :520 附近 KeyGeneration.signer 字段是活符号）、`app.py:315-321 payment_provider_from_db`、`ops/mailer.py:140-142 site_name_error`。
  - 删除前逐一 grep 整个 homeos-store（含 scripts/、tests 若有）确认零引用；删除后若产生死 import/死属性赋值链，一并收敛。
  - `security/schema_guard.py:18` 的 F401 副作用导入补 `# noqa: F401`；`admin_shared.py:27` 多余 noqa 核验后移除。
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `rule` TR-10.1: 六项删除的 grep 前后对照证据
  - `rule` TR-10.2: py_compile + 导入冒烟通过；`python3 -m pyflakes homeos-store/backend/src` 零输出（显式 noqa 除外）
- **Notes**: 不删 SQLAlchemy metadata 注册用副作用导入（database.py:60）。

## Task 11: TS 未使用代码清零 — homeos-3d `app/3d-studio`
- **Status**: `completed`
- **Completion Evidence**:
  - studio-app.ts：import 块 982 行→305 行；删除未用具名绑定 494 个、整句死 import 60 句（23 句 TS6192 多行导入 + 36 句单行单绑定 + 1 句 namespace 死导入 threeModuleMin），活绑定相对顺序保持、无重排、无 side-effect 导入删除。
  - 其余文件：studio-external-models.ts 死形参 modelType（同步 3 个同文件调用点）+ Promise executor 形参 _resolveTimeout；contact-shadow-passes.ts 删 context 死形参及调用点实参；geometry.ts map 首参下划线；region-light-passes.ts 删 shouldRescanStructure 解构；studio-plan2-contact-shadows.ts 删 roundToDecimals 整句及 computeSurfaceLevels 绑定；studio-plan-geometry.ts 删中间死形参并同步 studio-architecture.ts:589 调用点；studio-render-pipeline.ts 解构 cacheLightGroup + onBeforeRender 两死参下划线。
  - 去 export 16 个（清单 15 + 连锁新增 MATERIAL_STYLE_ITEM_TYPES：该死 import 从 studio-app 移除后外部消费归零），每个全 frontend/src grep 外部消费=0 后仅去 export、声明保留文件内自用。
  - 抽样 5 个整句死 import 模块（studio-curtain-track/studio-scene-style/GLTFLoader/stage-startup/debug-log）grep 均在其他文件有活引用。
  - 共改 19 个文件；最终 tsc 过滤 app/3d-studio/ 零输出。
- **Priority**: medium
- **Depends On**: Task 5, Task 6
- **Description**:
  - studio-app.ts：清除约 900 行 import 块中的 531 个未使用绑定与 23 条整句死 import（以 tsc TS6133/TS6192 诊断为准；可用 TS LanguageService/organize-imports 或逐句手工删除，禁止依赖自动排序引入无关重排——优先"仅移除未使用"的最小改动）；完成后通读 import 块确认无活符号丢失。
  - 其余文件 12 项：studio-external-models.ts 未用形参 2 个与 Promise executor 形参、contact-shadow-passes.ts:8 未用 context 参与其 :1/:3 两个死 import（roundToDecimals/computeSurfaceLevels）、geometry.ts:1755 map 首参、region-light-passes.ts:360 解构、studio-plan-geometry.ts:405 形参、studio-render-pipeline.ts:1321/3531 两处。
  - 移除 15 个多余 export（studio-curtain-track、studio-car-finish×3、model-template-codec、scene-persistent-cache×2、stage-startup、item-builders/registry、studio-asset-palette、studio-door-materials、studio-material-styles×2、studio-scene-style 中仅文件内消费的符号）。
  - 形参无法安全删除的用 `_` 前缀；不得改变运行时逻辑。
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-11.1: 对 homeos-3d 运行 `tsc -p tsconfig.json --noUnusedLocals --noUnusedParameters`，3d-studio 目录零诊断（证据为命令输出按目录过滤结果）
  - `rule` TR-11.2: studio-app.ts 删除清单中 23 条整句 import 对应模块仍有其他活引用方（抽样 grep 5 个）
  - `rubric` TR-11.3: 语义保真；scale 1-5；anchors 1=误删活绑定致运行时缺失；3=删除正确但夹带排序重排；5=仅移除未使用符号、无无关 diff；threshold >=4；证据为 import 块 diff 抽查与构建
- **Notes**: 本任务只做删除/去 export，不做去重（去重在 Task 17）。

## Task 12: TS 未使用代码清零 — homeos-3d `app/editor` + `app/renderer`
- **Status**: `completed`
- **Completion Evidence**:
  - 共改 73 个文件、消除诊断 135 条（TS6196×60、TS6133×74、TS6192×1）：删除文件私有 AnyObj 60 个（editor 10/renderer 44/shared 6；lazy-modules/entity-options/property-descriptors 中有引用的 AnyObj 核验后保留）。
  - lazy-modules.ts 4 个去 export（DEVICE_CONTROL_LOADERS 等，全 src 含字符串名 grep 外部零命中；prototype 注入的是 prepareDeviceControls* 三个名字，所属 attachDeviceControlPreparers 保留 export）。
  - home.ts：删 3 个未用 import 绑定 + 6 个工厂解构块中 33 个未用接收名；6 个源工厂调用（createPropertyDescriptors/createStyleApplyDialogs/createEntityOptions/createPickers/createFormWidgets/createColorPicker）原样保留；36 个被删名 grep 计数删除前均恰为 1、删除后为 0（≥10 抽样已核）。
  - home/ 子模块：pickers.ts 删 11 个死 import；entity-options.ts 删整组 8 行死 import + 2 个死函数，entityQueryType 形参有 8 处跨文件位置调用→_entityQueryType；color-picker/property-descriptors 各留 1 活绑定；entity-options-pickers 删 statisticsOptionSupport 解构。
  - renderer：climate.ts 删 3 个死 import；custom-popup 删 ensureDeviceControlMethods 纯死 import + 死参下划线；electric-bed/presence 删 {preview} 死解构参（this:any 派发点不受影响）；airflow×2、camera.ts hlsEventName、floorplan 局部 _ctx、editor-basic-inspectors 首参、home.ts 两处形参（onComponentsDuplicate 同步 selection-transform.ts:1262 实参；syncAspectLockButton 同步 2 调用点）。
  - shared：popup-layout 3 个死参下划线；layout-shell 删死函数 axisKeyboardStepSize（KEYBOARD_STEP_PX 活引用保留）。
  - 最终 tsc 过滤 app/(editor|renderer|shared)/ 零输出。
- **Priority**: medium
- **Depends On**: Task 6
- **Description**:
  - 移除 lazy-modules.ts 的 4 个多余 export（DEVICE_CONTROL_LOADERS 等，外部经 prototype 字符串名注入，已核实）。
  - 删除 54 个文件私有 `type AnyObj = Record<string, any>`（TS6196；editor 10 文件、renderer 44 文件，清单以 tsc 诊断为准）。
  - 清理 home.ts 约 40 个外提重构遗留的未使用解构绑定（L80-81 起各批次，按 tsc 诊断逐条）、home/ 子模块未使用 import（entity-options.ts 整组 6 个、pickers.ts 9 个、color-picker.ts 2 个、property-descriptors.ts 2 个、entity-options-pickers.ts 解构）、renderer 侧 climate.ts 3 个、custom-popup.ts ensureDeviceControlMethods 整行。
  - 9 处未使用形参：能安全删则同步调用点，否则 `_` 前缀（home.ts 两处、editor-basic-inspectors、custom-popup、electric-bed×2、presence、camera.ts hlsEventName、airflow×2、floorplan-auto-diagram _ctx）。
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-12.1: tsc 带未使用选项对 editor/renderer 目录零诊断
  - `rule` TR-12.2: home.ts 被删解构名每个有"全文仅解构处一次"的 grep 证据（抽查不少于 10 个）
- **Notes**: 源工厂函数（被其他 home/ 模块引用者）保留，仅删 home.ts 中未用的解构接收名。

## Task 13: TS 未使用代码清零 — `runtime` + homeos-store 前端
- **Status**: `completed`
- **Completion Evidence**:
  - runtime（10 条全清，5 文件）：config-editor.ts 删局部死函数 deviceCatalog（deviceCatalogOf 保留）；stage.ts 仅删 6 个解构接收名，marker-layer/binding-collectors/light-state 实现体均保留（grep 确认）；binding-collectors.ts:18、marker-layer.ts:6 两个私有 AnyObj 删除；climate-state.ts:110 形参 _levelUnused。
  - store（tsc exit 0，4 文件净改）：store.ts 删 moneyAmount/fromResponse import、DeviceReleasePolicy 类型、storeStaticVersion、`hb-order-${orderNo}` localStorage 只写块；applyVerificationResponse 死参 _form（2 调用点不动）。appearance.ts 删 cssVariableName/tokensToCss/COLOR_LABELS/tokenNames/presetTokens（后两者经前后端核验：后端 ops/appearance.py:11-16 用独立硬编码正则白名单、不消费 TS 侧，注释所称"供后端白名单"属历史文档性声明）；rgbTriplet/deriveShades 去 export（仅文件内 6 处自用）；normalizeHex 经 palette.ts:10 活导入→保留 export。api-error.ts 删 DEFAULT_FALLBACK（describe 内联字面量）；store-shared.ts 删 STORE_PAGE_REVISION（storePageHref 内联）。
  - `hb-order-` 全仓仅剩 hb-order-countdown CSS 类与 dist 旧产物，localStorage 键写入消失。
  - **偏差裁定（errorMessage）**：store-types.ts:172 errorMessage 维持 export 不动。实测"去 export + 保留函数体 + noUnusedLocals 零诊断"三者互斥（去 export 即报 TS6133）；Task 19 收口 errMsg 时会新增跨文件 import，届时 export 本就必需。净 diff 为零。
- **Priority**: medium
- **Depends On**: Task 5, Task 7
- **Description**:
  - runtime：删 config-editor.ts:2513-2530 局部死函数 deviceCatalog（保留 2543 行 deviceCatalogOf）；删 stage.ts 中 6 个未用解构名（beginMarkerDrag/endMarkerDrag/moveMarkerDrag、collectOverviewBindings/collectVacuumRoomShortcuts、lightStateForBinding——只删解构名，实现体在 marker-layer/binding-collectors/light-state 内部自消费）；删 binding-collectors.ts:19、marker-layer.ts:7 两个 AnyObj；climate-state.ts:110 形参改 `_`。
  - store：删 store-types.ts:172-176 errorMessage 的 **export 保留函数本身**（Task 19 将启用它，故本任务不动函数体）；删 scene/appearance.ts 零引用 cssVariableName/tokensToCss/COLOR_LABELS；tokenNames/presetTokens 与后端白名单注释核对后决定（若仅文档性则删并在证据中说明）；删 store.ts:38 storeStaticVersion、:353-355 `hb-order-${orderNo}` 死写（含隐私残留）；清理 store.ts 3 个未用 import/类型与 applyVerificationResponse 形参；移除 api-error.ts DEFAULT_FALLBACK、store-shared.ts STORE_PAGE_REVISION、appearance.ts rgbTriplet/deriveShades/normalizeHex 的多余 export。
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-13.1: runtime 与 store 两部分 tsc 带未使用选项零诊断（分别给出命令输出）
  - `rule` TR-13.2: `hb-order-` 全仓 grep 仅剩 CSS 类 `hb-order-countdown` 等无关命中；tokenNames 删除结论附后端白名单核验证据
- **Notes**: runtime 每个 .ts 都是自动入口，不删除整文件；errorMessage 函数体留给 Task 19。

## Task 14: 两个 tsconfig 固化未使用代码门禁
- **Status**: `completed`
- **Completion Evidence**:
  - homeos-3d/tsconfig.json、homeos-store/tsconfig.json 各仅新增 `"noUnusedLocals": true, "noUnusedParameters": true` 两个选项（diff 仅此 4 行）。
  - 固化前残留 4 条无主基线诊断（app/bridge 3 + app/logging 1，不在 Task 11-13 授权目录、经比对 /tmp 基线确认非新引入）已由主代理收口：definition.ts 删 INTERACTION3D_FEATURE 声明子、focus-layout.ts/global-log-boot.ts 删私有 AnyObj、render-cache.ts replacer 首参改 _key。
  - 门禁：`cd homeos-3d && bun run typecheck` exit 0 零输出；`cd homeos-store && bun run typecheck` exit 0 零输出（含两项目 vite.config 被 include）。
  - 构建回归：homeos-3d `bun run build`（build:app+build:runtime）exit 0；homeos-store `bun run build` exit 0。Task 5 不变量回归：draco-decoder-worker.js 产物 2882 字节在位、public-static.json 白名单仍零命中。
- **Priority**: medium
- **Depends On**: Task 11, Task 12, Task 13
- **Description**:
  - 在 homeos-3d/tsconfig.json 与 homeos-store/tsconfig.json 的 compilerOptions 增加 `"noUnusedLocals": true, "noUnusedParameters": true`。
  - 两个项目根分别执行 `bun run typecheck` 确认零错误（含 vite 配置文件被 include 的情况）。
- **Acceptance Criteria Addressed**: AC-8, AC-10
- **Test Requirements**:
  - `rule` TR-14.1: 两个 typecheck 命令零错误输出
  - `rule` TR-14.2: 两个 tsconfig.json diff 仅新增两个选项
- **Notes**: 若 vite.config.ts 等因此暴露新诊断，先回到对应清理任务修，不在本任务加 exclude 回避。

## Task 15: homeos-3d 后端重复代码收敛
- **Status**: `completed`
- **Completion Evidence**:
  - HA 常量：Task 9 删除 registry/live 副本后，grep 确认 4 常量与 state_requires_fetch_retry 全后端仅 ha/service.py 一处定义+消费，无残留分叉。
  - utc_now：新增唯一实现 core/time_utils.py:26-29（与 ensure_aware 同模块）；core/models.py 删除本地定义改为 from .time_utils import utc_now（列默认值行为不变）并去掉仅它使用的 timezone import；observability/global_log.py 删除本地定义改导入（timezone import 同步去除，无导入环：time_utils 仅依赖 datetime/typing，core 不反向依赖 observability）；registry.py/live.py/service.py 三个 ha 消费方全部改从 core.time_utils 导入。grep `def utc_now` 全后端仅 time_utils 一处。
  - 管理员校验：security/dependencies.py:135-140 新增 require_admin(user, *, detail)；删除 auth.py:41 require_admin_account、ha_shared.py:20 require_admin_for_ha、displays.py:48 require_admin_for_displays 三个同构副本，12 个调用点（auth×3、ha×2、ha_connection×2、displays×7）全部改为统一 helper 并逐字保留各自 403 文案（管理登录会话/修改 HA 连接/管理中控设备）；连带清理 ha_shared 仅死函数使用的 User/HTTPException/status import。
  - _reject_oversized：http/streaming.py:16-28 新增 size_limit_guard(*limits) 工厂（按声明顺序逐档 received>ceiling→413）；assets.py 双档（单文件上限 + MAX-used 剩余配额，与原 used+received>MAX 代数等价，两档顺序与文案逐字保持）；studio3d.py 单档（413 状态码与文案逐字保持）。
  - 数值判定：删除 purifier.py:25 _finite_number（含不再需要的 import math），两处调用改为 as_finite_number(x, from_text=False) is not None——与 numbers.py:8 实现逐字等价（bool 排除、int/float 限定、float() 异常与 isfinite 口径一致）；climate._number 既已是同一包装，口径统一。
  - 守卫确认：lock.py:214/purifier.py:34/cover.py:76 为 Task 2 统一口径；climate.py:55 原 `not state`（真值判定，非 dict 真值会 .get 炸 500）收敛为同一 isinstance 口径（None/{}/非 dict 全部 409，空 dict 行为不变）；purifier.py:90 是 on/off 域谓词非可用性守卫，保持不动。
  - 验证：3d 后端全量 py_compile 通过、pyflakes 零输出（编辑中一度误删 ha.py LicensedUser 导入，已即时恢复并复检）。
- **Priority**: medium
- **Depends On**: Task 9
- **Description**:
  - HA 常量：以 service.py（或下沉到 ha/contracts.py）为唯一源，registry.py/live.py 残留副本随 Task 9 删除后无重复；确认三文件引用统一。
  - utc_now：core/models.py:14 与 observability/global_log.py:62 统一引用一个实现（核验导入方向无环）。
  - 管理员校验三份（api/auth.py:41、ha_shared.py:20、displays.py:48）提取为 security 或 core 下单一 helper，三处改为调用。
  - `_reject_oversized` 两份闭包合并；`_finite_number`（purifier.py:25）与 `as_finite_number`（climate.py 邻近）统一为一个数值判定工具（注意 bool 排除口径一致）。
  - 实体状态可用性守卫多份口径借 Task 2 已统一；本任务确认 lock/purifier/climate/cover/api_support 守卫无新分叉。
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-15.1: 每组重复的旧定义位置 grep 无残留；新位置被所有原调用方引用
  - `rule` TR-15.2: py_compile + pyflakes + 导入冒烟通过
  - `rubric` TR-15.3: 行为等价；scale 1-5；anchors 1=helper 语义偏差导致鉴权/数值口径变化；3=可用但边界（bool/NaN/时区）处理不一致；5=逐字等价且边界注释保留；threshold >=4
- **Notes**: 管理员校验属安全敏感，提取后逐行比对三处原条件。

## Task 16: homeos-store 后端重复代码收敛
- **Status**: `completed`
- **Completion Evidence**（2025-07-01）：
  1. **future import 折叠**：15 个 api 文件（admin_bindings/admin_coupons/admin_settings/admin_compliance/admin_licenses/admin_shared/store_auth/admin_ops/admin_withdrawals/admin_entitlements/store_referrals/admin_orders/admin_accounts/store_orders/admin_products）重复的第二行 `from __future__ import annotations` 全部删除；折叠后 grep `from __future__ import annotations` 每文件仅 1 行（0 重复）。
  2. **踢会话收口**：`api/admin_shared.py:114-128 _drop_account_sessions(session, account_id, *, keep_hash=None) -> int` 成为唯一实现（返回实际删除条数；keep_hash 命中则保留该行）。store_auth.py 改密码（keep_hash=当前 cookie hash，只踢其它设备）、重置密码（全删）、store.py 改邮箱（keep_hash=当前）三处手写 select+delete 循环全部改为调用；store.py 的 AccountSession import 随之删除（仅该处使用），两文件新增 `from .admin_shared import _drop_account_sessions`。无导入环：admin_shared 不导入任何 api 路由模块（store_catalog 亦不反向导入 admin_shared），create_app() 冒烟通过。
  3. **名额重算收口（资金敏感，TR-16.3 自评 5/5）**：删除 admin_ops.py 原 `_recount_coupon_redemptions`（19 行），唯一调用点 admin_void_coupon_redemption 改 `coupons.recount_coupon_slots(session, record.coupon_id)`。SQL 逐行对照：两实现均为 `select(func.count(CouponRedemption.id))[.select_from(CouponRedemption)].outerjoin(Order, Order.id == CouponRedemption.order_id).where(CouponRedemption.coupon_id == <id>).where(*holds_slot_conditions())`，canonical 仅多一个显式 select_from（count 首参已锚定同表，计划等价）；count→int(or 0)、coupon.redeemed_count 赋值、session.flush()、None→0 完全一致。作废路径 record.coupon_id 必非空；coupon 缺失时两实现均返回 0 且不写库，行为不变。
  4. **提现序列化合一**：store_referrals.py 提现历史 items 删除 9 键手写字典，改为 `{**_withdrawal_payload(row), "note": ..., "resolvedAt": iso(...)}`（与 store_catalog.py:398 共享同一 7 键；键序 JSON 无语义）。admin_withdrawals.py 列表含 accountId/email/statusLabel 且 feePercent 为 float、时间 iso_z，属不同管理端契约，保留不并。
  5. **导入/注释清理**：admin_shared.py 三处模块中部导入（原 :248-249、:270-272、:365-368，含 Path/Entitlement/utcnow/iso_z/license_payload/product_payload/_license_meta/_image_map/_product_stats）全部上移合并至文件顶部导入区并删除说明注释；store_catalog.py `_product_item` 函数内 `from ..core.serializers import json_list` 删除（顶部 :40 已导入）；payments/alipay_signing.py 文件末尾孤立注释「# 通知解析结果」删除（其后无任何代码）；admin_ops.py 删除函数后孤立的 `from sqlalchemy.orm import Session` 一并移除。
  6. **门禁**：全仓 `py_compile` 通过；`python3 -m pyflakes homeos-store/backend/src` 仅剩 database.py:60、schema_guard.py:18 两条既有 noqa 豁免基线；`.venv-store/bin/python` 经 create_app() 导入冒烟 SMOKE_OK（全部路由正常挂载，无循环导入）。
- **Priority**: medium
- **Depends On**: Task 10
- **Description**:
  - 删除 15 个 api 文件中每行重复一次的 `from __future__ import annotations`（每文件保留一行）。
  - 踢会话循环三处提取为 admin_accounts 或 security 下单一函数。
  - 优惠码名额重算：删除 admin_ops.py:234-250 `_recount_coupon_redemptions`，调用点改为 `coupons.recount_coupon_slots(session, coupon_id)`（None 情形按 coupons 既有 coupon is None→0 处理），落实 coupons.py docstring 声明的唯一收口。
  - 提现序列化双份合一；admin_shared.py 中部二次导入、store_catalog.py:137 函数内重复导入删除（保留顶部导入）；alipay_signing.py:363 孤立注释核验后删除。
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-16.1: 重复 future import 行计数归零（grep 计数前后证据）；`_recount_coupon_redemptions` 定义消失且调用点全部指向 coupons 收口
  - `rule` TR-16.2: py_compile/pyflakes/导入冒烟通过
  - `rubric` TR-16.3: 名额重算口径；scale 1-5；anchors 1=两实现 SQL 条件被改导致名额漂移；3=结果相同但 join/where 有细微差；5=完全复用 holds_slot_conditions 同一查询；threshold >=4；证据为两处 SQL 逐行对照
- **Notes**: 资金敏感，重算收口任务需独立审查重点复核。

## Task 17: 3d-studio 前端重复代码收敛
- **Status**: `completed`
- **Completion Evidence**（2025-07-01，子代理实施+主代理独立复跑门禁）：
  1. **20 项数组**：studio-render-pipeline.ts :167 新增模块级 `STAGE_ENVIRONMENT_ITEM_TYPES: readonly string[]`；四处字面量改引用（:2624 instance、:2754 static 前置 `!` 保留、:3838 placed、:4026 layer），grep 常量名 = 1 定义 + 4 引用；四处元素序列脚本比对逐字一致（仅缩进不同）。
  2. **shadeColor**：新建 `app/3d-studio/studio/studio-color-utils.ts` 承载插值版唯一实现，studio-material-styles.ts、item-builders/storage-cabinets.ts 改 import（两份旧定义 MD5 相同）；surface-textures.ts:72 乘法版按要求保留，新文件注释说明两者语义区别（插值返回整数 vs 通道乘法返回 rgb() 字符串）。
  3. **祖先 userData 查找**：新建 `app/3d-studio/scene-tree-utils.ts` 承载 `findUserDataInAncestors`（含自身起步、真值终止、!== undefined 判定，与两份旧实现逐行一致）；contact-shadows 改 import，region-lights 删除 findAncestorUserData，9 处调用改名。
  4. **isVisibleWithin**：共享实现签名 `(startNode, rootNode?)`——不传=无边界（旧 reflection 行为，空链 true），传入=子树夹取（旧 region-lights 行为，含边界节点可见性先于相等性）。TR-17.3 自评 **4/5**：共享可见性谓词采用 region 版 `visible === false`（与 three.js Object3D.visible 布尔口径一致），reflection 旧版为 `!visible`；经 git diff 核实全部 6 个调用点运行时对象均为 THREE.Object3D（visible 恒布尔），实际行为等价，但类型层面 SceneNodeLike.visible 仍允许非布尔假值的理论差异存在，已在 scene-tree-utils.ts docstring 注明，留独立复核。
  5. **主代理独立门禁**：`cd homeos-3d && bun run typecheck` exit 0；`bun run build`（app+runtime）exit 0（276/181 modules）；Draco worker 产物 dist/static/3d-studio/export/draco-decoder-worker.js 2882 字节在位。
- **Priority**: medium
- **Depends On**: Task 11
- **Description**:
  - studio-render-pipeline.ts 四处逐字相同的 20 项环境设备类型数组（MD5 bb382d72…，:2597/:2748/:3853/:4062）提取为模块级 `STAGE_ENVIRONMENT_ITEM_TYPES` 常量，四处引用。
  - shadeColor（studio-material-styles.ts:88-96 与 item-builders/storage-cabinets.ts:11-19 逐字相同）提取到就近共享颜色工具（如 app/utils 或 3d-studio 内 colors 模块，两引用方同项目可达）；不可与 surface-textures.ts:72-78 乘法版合并（语义不同，加注释说明）。
  - findUserDataInAncestors（studio-plan2-contact-shadows.ts:8-18）与 findAncestorUserData（studio-plan2-region-lights.ts:39-47）合一。
  - isVisibleWithin 两版（region-lights :59-69 带 rootNode 边界 vs reflection-scene-queries :54-60）合并：共享实现支持可选 rootNode 边界参数，两调用点行为不变。
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-17.1: 四组旧副本 grep 无残留定义；四处数组引用同一常量
  - `rule` TR-17.2: homeos-3d typecheck + `bun run build:app` + `build:runtime` 通过
  - `rubric` TR-17.3: 行为等价；scale 1-5；anchors 1=光照/反射判定结果变化；3=代码合并但边界参数默认值改变语义；5=两处调用点行为逐字保持；threshold >=4
- **Notes**: 45 行实例化循环提取为 spec Non-Goal，不做。

## Task 18: editor/renderer 重复代码收敛（安全项）
- **Status**: `completed`
- **Completion Evidence**（2025-07-01）：renderer/core/registry/entity-state.ts 新增文件内私有（不导出）`isBoundEntityVisualActive`（:173，previewState 两段判定+实体委托）；`isLightVisualActive`（:195）、`isDeviceButtonVisualActive`（:202）导出签名逐字不变、成为一行委托。经核对两旧函数委托目标相同（本文件 isComponentEntityActive）、字段路径一致，无需参数化；3 个外部消费文件（effect-visuals.ts、icon-button-effect.ts、button-renderer.ts）零改动。typecheck+build:app exit 0（见 Task 17 证据第 5 条同一轮主代理复跑）。
- **Priority**: low
- **Depends On**: Task 12
- **Description**:
  - `renderer/core/registry/entity-state.ts:172-211`：isLightVisualActive 与 isDeviceButtonVisualActive 18 行逐字相同，提取共享私有实现，两个导出函数保持原有签名与委托点。
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-18.1: 两导出函数签名不变、调用点 grep 不变；typecheck + build 通过
  - `rubric` TR-18.2: 行为等价 >=4（previewState 两段与实体委托逐字保持）
- **Notes**: 指针拖拽 helper、图片队列基类、选择器工厂为 Non-Goal，不做。

## Task 19: homeos-store 前端重复代码收敛
- **Status**: `completed`
- **Completion Evidence**（2025-07-01，子代理实施+主代理独立复跑门禁）：
  1. **errMsg**：十份本地 errMsg（store.ts + 9 个 admin/panels 面板）全部删除，改 `import { errorMessage } from store-types`；主代理 grep `errMsg` 全 src 零命中、errorMessage import 恰 10 个文件。**重要偏差（行为忠实）**：任务预期 fallback 均为"请求失败"，实测 sessions 面板 fallback 是「读取失败」、settings 等 8 份是「操作失败」——均按要求以显式传参逐字保留原文案；store.ts 另 1 处「重发失败，请稍后再试。」同样显式保留。store-types.ts 零改动（errorName 实际不存在于该文件，无需处理）。
  2. **密码显隐**：新建 `frontend/src/password-toggle.ts`（togglePassword 核心 + bindPasswordToggles 逐个绑定 + handlePasswordToggleClick 事件委托）。store.ts 改 bind、admin/app.ts 改委托；setup.ts 两处历史差异以 `{ ariaLabel: false }` 等参数保留（静态 aria-label 不更新、input 选择器等价性已核验）。store.ts:882 解绑弹窗按钮复位逻辑不属绑定，未动。
  3. **浮动层定位**：新建 `admin/popover-place.ts`（GAP=5/MARGIN=8、单向向上 flip、纵向 clamp 顺序与两旧版逐行同构）；placeRowMenu 默认右对齐，placeFeaturePicker 用 align:'left'+prepare 钩子承载宽度夹档 [300,460]，语义差异零掩盖。
  4. **referrals**：删除本地 `$`/ReferralApi/ToastFn，改 import store-shared；`HBReferrals.init(api,toast)` 去注入为 `init()`（唯一注入方 store.ts 传的正是 store-shared 同名实现）。
  5. **主代理独立门禁**：`cd homeos-store && bun run typecheck` exit 0；`bun run build` exit 0（store 56.15 kB / admin 121.28 kB / setup 2.01 kB）。浏览器交互未实测，等价性基于逐行比对+静态门禁，留独立复核。
- **Priority**: medium
- **Depends On**: Task 13
- **Description**:
  - errMsg 十份拷贝（store.ts:32、admin/panels 的 orders/products/licenses/accounts/coupons/content/sessions/overview/settings）统一改为引用 store-types.ts 的 errorMessage（核验各拷贝 fallback 文案一致为"请求失败"且 errorMessage 为超集；若个别文件 fallback 不同则显式传参）；启用后 errorName 导出保留（Task 13 仅去了孤立状态）。
  - 密码显隐三份（store.ts:425-434、setup.ts:42-52、admin/app.ts:90-102，同一 `[data-password-toggle]` 契约）提取到三入口均可 import 的共享小模块（如 store-shared 或新建 admin 与 store 共用的 dom 工具——必须在 homeos-store 项目内）。
  - 浮动层定位 menus.ts:35-59 placeRowMenu 与 features.ts:201-225 placeFeaturePicker：核验 GAP/MARGIN 夹取算法确属同构后提取共享定位函数；存在语义差异则保留并记录理由。
  - referrals.ts 自带的 $ 与 api/toast 重复声明核验后改为引用 store-shared（注意 referrals 是前台页入口，打包可达）。
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-19.1: `function errMsg` 全仓 grep 零定义（调用点改为 errorMessage 且十面板均覆盖）；三份密码绑定改为同一实现引用
  - `rule` TR-19.2: store typecheck + `bun run build` 通过
  - `rubric` TR-19.3: 行为等价；scale 1-5；anchors 1=错误文案/密码交互变化；3=收敛正确但 fallback 文案被改；5=全部面板提示文案与交互逐字保持；threshold >=4
- **Notes**: fetch 三份封装工厂化、分页 loader 工厂化为 Non-Goal。

## Task 20: 残留注释/陈旧文档/成片空行清理
- **Status**: `completed`
- **Completion Evidence**（2025-07-01，保守执行）：
  1. **ha_connection.py**：文件头 docstring 由错误复制来的「商店接口的 connection 资源组（从 api/store.py 拆出）」改为「Home Assistant 连接管理的 connection 资源组。」；重复的第二行 `from __future__ import annotations`（原 :3/:5）折叠为一行。
  2. **3d 后端成片空行**：tokenize 感知字符串的脚本将 7 个文件 19 处 ≥4 连续空行压缩——api/assets.py（31→2）、api/ha.py（14/8/8/4→2 四处+EOF 16→单换行）、api/ha_proxy.py（15/4/4/6/6→2 五处）、app/middleware.py（5→2）、ha/service.py（4→1，函数体内）、license/service.py（7→2、15/8/7/5→1 五处，缩进感知：函数体内保 1 行、顶层保 2 行）、modules/interaction3d/api.py（25→2）；字符串内部空行不参与压缩。压缩后 3d backend/src 全树 ≥4 空行段扫描 = **0**。
  3. **registry/live 陈旧 docstring**：核验 ha/registry.py、ha/live.py 模块/类 docstring 与当前 Mixin 职责一致（T9 删除重复常量/函数后无残留提及），grep 无「与 service.py 重复」类陈旧注释——按「拿不准保留」原则**不改**。license/contracts.py 与 ha/contracts.py 亦无空行缺陷（:34-35 为函数参数行，风格为紧凑顶格，全文件一致），不改。
  4. **store alipay.py**：核验结论——文件末尾 :713-731 `from .alipay_signing import (...)` 再导出是**有意的公开面**（api/alipay.py 经此导入 cents_from_yuan/public_key_error，且列入 __all__），保留其「再导出」注释；删除文件头 :33 的孤立注释「凭据与签名层在 alipay_signing.py；这里再导入一次，」（其后已无对应 import，属移动后残留）。
  5. **store_catalog.py**：仅在 T16 触碰相邻区域补齐顶层函数间空行（_product_stats→_image_map→_bundled_map→_product_item、对账 except→「# 邀请有礼」段、_wallet_payload→_withdrawal_payload，0 空行→2 空行），未做全文件格式化。
  6. **store 前端 admin/app.ts**：两处空注释/成片空行区（原 :33-51 的 18 空行、:452-474 的 13+5 空行）压缩；banner 前保留 1 空行与本文件 :351-353 既有惯例一致。
  7. **门禁**：两后端 py_compile 通过；pyflakes 仅剩 database.py:60、schema_guard.py:18 两条既有豁免；.venv-store create_app() 冒烟 STORE_SMOKE_OK；homeos-store typecheck/build exit 0。
- **Priority**: low
- **Depends On**: Task 15, Task 16, Task 17, Task 18, Task 19
- **Description**:
  - 3d 后端：ha_connection.py:1 docstring 中不存在的 api/store.py 描述修正、:3/:5 重复 future import 去重；assets.py:46-76（31 行）、interaction3d/api.py:53-77（25 行）等约 20 处 ≥4 行成片空行压缩；registry/live 陈旧 docstring、contracts.py:34-35 空行修正。
  - store 后端：alipay.py:55 冗余别名（核验为有意则保留并注释，否则删）；store_catalog 函数间空行风格修正（仅限被触碰文件的相邻区域，不做全库格式化）。
  - store 前端：admin/app.ts:33-50/:462-483 空注释区与成片空行清理。
- **Acceptance Criteria Addressed**: AC-12
- **Test Requirements**:
  - `rule` TR-20.1: 清理点清单与 diff 证据；不删除任何有效代码/注释（删除前确认空行与残留性质）
  - `rule` TR-20.2: 三个项目 typecheck/编译/构建不受影响
- **Notes**: 保守执行，拿不准的注释保留。

## Task 21: 全量门禁验证与收尾
- **Status**: `completed`
- **Completion Evidence**（2025-07-01，主代理在最终工作树上逐项复跑）：
  1. **①两后端 py_compile**：`python3 -m py_compile $(find homeos-3d/backend/src homeos-store/backend/src -name "*.py")` → PYCOMPILE_EXIT=0。
  2. **②pyflakes**：3d 后端 exit 0（零告警）；store 后端仅 core/database.py:60、security/schema_guard.py:18 两条 F401，均带 `# noqa: F401`（模型注册副作用导入，pyflakes 不识别 noqa），为既定基线，无新增。
  3. **③typecheck**：`(cd homeos-3d && bun run typecheck)` exit 0；`(cd homeos-store && bun run typecheck)` exit 0（两 tsconfig 均含 noUnusedLocals/noUnusedParameters）。
  4. **④3d 构建**：`(cd homeos-3d && bun run build)` exit 0（build:app + build:runtime，276/181 modules）。
  5. **⑤store 构建**：`(cd homeos-store && bun run build)` exit 0（store 56.15 kB / admin 121.28 kB / setup 2.01 kB）。
  6. **⑥Draco worker**：homeos-3d/dist/static/3d-studio/export/draco-decoder-worker.js 存在，2882 字节，构建时间戳为本次构建。
  7. **⑦导入冒烟**：`.venv-store/bin/python` → create_app() 成功（STORE_APP_OK），coupons.recount_coupon_slots、admin_shared._drop_account_sessions 均可导入（SHARED_HELPERS_OK）；3d 后端系统 python3 无 sqlalchemy/fastapi（既定门禁=py_compile+pyflakes），无三方依赖的叶子模块 src.core.time_utils 导入成功且 utc_now() 带 tzinfo。
  8. **⑧独立性/迁移**：`git status --short` 189 条（184 M + 5 ??：.trae/specs 目录与 4 个新增共享模块 scene-tree-utils.ts、studio-color-utils.ts、password-toggle.ts、popover-place.ts）；无任何 db/ 路径变更（NO_DB_PATH_CHANGES），migrations.py 唯一 diff 为 T9 删除死常量 BASE_REVISION；跨项目 grep（import/from/require 含 homeos-store/homeos-3d、3d 侧 @store 别名）零命中。
- **AC-1…AC-13 对照矩阵**：
  | AC | 结论 | 主要证据位置 |
  |---|---|---|
  | AC-1 微信退款误判 | PASS | T1：orders.ts provider 谓词 `!['alipay','wechat'].includes`；admin_orders 渠道分支未改契约 |
  | AC-2 空状态 409 | PASS | T2：lock.py/purifier.py 守卫与 cover.py:76、climate.py 同构；py_compile |
  | AC-3 积分短差闭环 | PASS | T3：reverse_order_reward 返回 (deductible, shortfall)+incidents.note（KINDS 中文标签），无表/列变更 |
  | AC-4 提现手续费文案 | PASS | T4：withdrawFeeBreakdown 单一口径，NaN/缺配置兜底；store 前端 T19 后构建通过 |
  | AC-5 低危清单闭环 | PASS | T5-T8：前端 5 项、Draco 2 项、TOCTOU 2 处、store 6 候选（修 #1/#3/#4/#6，保留 #2/#5 附理由），证据在各任务 |
  | AC-6 Draco worker | PASS | T5 + 本任务门禁⑥：vite classicEntries 产物 2882 B、onerror 清槽、decodeGeometry try/finally |
  | AC-7 后端死代码 | PASS | T9/T10：12 项清单全删，2 疑似项有结论；pyflakes 3d=0、store 仅 2 条 noqa 基线 |
  | AC-8 TS 清零+门禁 | PASS | T11-T14：两 tsconfig noUnusedLocals/noUnusedParameters；两 typecheck exit 0 |
  | AC-9 重复收敛 | PASS | T15-T19：utc_now/管理员 helper/size_limit_guard（3d 后端）、_drop_account_sessions/recount_coupon_slots/提现 payload（store 后端）、STAGE_ENVIRONMENT_ITEM_TYPES/shadeColor/祖先查询/isVisibleWithin（3d 前端）、errorMessage/密码绑定/浮层定位（store 前端）；保留项均附理由（乘法版 shadeColor、admin 提现契约、45 行循环等） |
  | AC-10 全量门禁 | PASS | 本证据 1-7：六项全绿 |
  | AC-11 独立性/契约 | PASS | 本证据 8：跨项目 grep 零命中、无 db/ 变更、无路由/字段删除改名、design/ 未触碰 |
  | AC-12 行为等价（rubric≥4） | 待独立评 | 自评 4：资金重算 SQL 逐行等价 5/5；isVisibleWithin 对 SceneNodeLike 非布尔假值存在理论差异（运行时调用点全为 Object3D，布尔），已在 docstring 与 T17 证据标注，提交独立复核重点 |
  | AC-13 修复工程质量（rubric≥4） | 待独立评 | 守卫/收口/手续费口径均与既有正确模式统一，中文注释风格保持；提交独立复核 |
- **Priority**: high
- **Depends On**: Task 14, Task 20
- **Description**:
  - 依次执行并留存证据：①两个后端全量 py_compile；②pyflakes 两个后端（零确认告警）；③homeos-3d 与 homeos-store `bun run typecheck`；④homeos-3d `bun run build`（app+runtime）；⑤homeos-store `bun run build`；⑥Draco worker 产物存在性；⑦后端导入冒烟（.venv-store python 导入 store app；3d 后端以可用解释器导入 main 包）；⑧跨项目引用 grep 与 git status 确认无迁移/无跨项目依赖。
  - 更新 tasks.md 全部任务证据；汇总 spec AC-1…AC-13 对照矩阵，提交独立审查。
- **Acceptance Criteria Addressed**: AC-10, AC-11, AC-12, AC-13
- **Test Requirements**:
  - `rule` TR-21.1: 上述 ⑧ 项每项有命令输出摘要；构建命令 exit 0
  - `rule` TR-21.2: `git status --short` 中无 db/migrations 新文件、无跨项目 import 新增（grep 证据）
- **Notes**: 任何一项失败即回到对应任务修复，不在本任务内掩盖。
