/**
 * 授权激活端到端冒烟（`bun run verify:smoke:license`）。
 *
 * 跑的是**夹具**而不是直接跑 `_license_activation_e2e_smoke.py`：
 *
 * - 直接跑那条脚本需要「本机已有商店 + 库里能挑到一条可安全占用的授权」，CI 里两条都不
 *   成立 → 整条 SKIP。SKIP 不是覆盖：这是全仓最关键的授权闭环，此前在 CI 从未真跑过。
 * - `_license_e2e_fixture.py` 用临时 data/密钥目录 + 随机端口现起一个商店、走 HTTP 建
 *   管理员与顾客、后台签发一条真授权，再驱动主应用侧 e2e，并**断言日志里没有 SKIP**。
 *
 * 本机若已有商店在跑，直接跑 `python homeos/backend/scripts/_license_activation_e2e_smoke.py`
 * 依然可用（脚本自身支持 `LICENSE_E2E_CODE/EMAIL` 与 `LICENSE_E2E_STORE_URL`）。
 */
import { py } from './common.mjs'

export default [
  py('homeos-store/scripts/_license_e2e_fixture.py', '授权激活端到端（临时商店夹具 → 主应用激活闭环）'),
]
