/**
 * 主应用端到端冒烟链清单（`bun run verify:smoke:app`）。
 *
 * 由 `ops/lib/run-chain.mjs` 并发执行：所有步骤都会跑完，失败项在结尾一起汇总
 * （原先是 `&&` 长链，第一个失败就吞掉后面全部结果）。
 *
 * 每一步都能单独跑（`homeos/backend/scripts/_x_smoke.py`）—— 排障时不必跑全链。
 * 加步/删步只改这里，别再回去写 `&&` 长链。
 */
import { py } from './common.mjs'

export default [
  py('homeos/backend/scripts/_auth_contract_smoke.py', '认证契约'),
  py('homeos/backend/scripts/_register_login_activate_smoke.py', '注册 → 登录 → 激活契约'),
  py('homeos/backend/scripts/_mcp_gateway_auth_smoke.py', 'MCP 网关鉴权（伪造 XFF / fail-closed / 校验顺序）'),
  py('homeos/backend/scripts/_rate_limit_bounded_smoke.py', '限流器有界化与分桶'),
  py('homeos/backend/scripts/_p51_ha_whitelist_smoke.py', 'HA 服务白名单'),
  py('homeos/backend/scripts/_ha_fetch_resilience_smoke.py', 'HA 请求韧性'),
  py('homeos/backend/scripts/_schema_drift_guard_smoke.py', '结构漂移护栏'),
  py('homeos/backend/scripts/_module_feature_gate_smoke.py', '模块功能开关'),
  py('homeos/backend/scripts/_home_mode_validation_smoke.py', '家居模式写前校验（400 而非 500）'),
  py('homeos/backend/scripts/_ws_broadcast_smoke.py', 'WebSocket 广播'),
  py('homeos/backend/scripts/full_backup_smoke.py', '全量备份'),
  py('homeos/backend/scripts/_go2rtc_relay_smoke.py', 'go2rtc 中继'),
]
