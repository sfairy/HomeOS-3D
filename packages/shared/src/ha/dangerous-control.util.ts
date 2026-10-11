/** HA 高风险控制判定模块 */

/** HA 离线时仍应拦截的高风险控制（阀/锁/报警/警笛） */
export function isDangerousHaControl(domain: string, service: string, entityId: string): boolean {
  // 统一小写，避免大小写差异导致漏判
  const d = String(domain || '').toLowerCase();
  const s = String(service || '').toLowerCase();
  const eid = String(entityId || '').toLowerCase();
  // 阀门域：任何操作都高风险
  if (d === 'valve') return true;
  // 门锁域：仅状态变更操作高风险（查询类不算）
  if (d === 'lock') return ['lock', 'unlock', 'open'].includes(s);
  // 安防面板：布防 / 撤防 / 紧急触发均以 alarm_ 前缀
  if (d === 'alarm_control_panel') return s.startsWith('alarm_');
  // 警笛：启停均高风险（离线队列误触发会造成惊吓/误报）
  if (d === 'siren') return ['turn_on', 'turn_off', 'toggle'].includes(s);
  // 开关域：通过 entity_id 关键词识别伪装成 switch 的水/气总阀
  if (d === 'switch' && /valve|gas|water_main|water_shut|gas_shut/.test(eid)) return true;
  // 风扇域：排气扇开启可能影响燃气安全（如联动关阀后误开排风）
  if (d === 'fan' && /exhaust|vent|排风/.test(eid)) return s === 'turn_on';
  return false;
}