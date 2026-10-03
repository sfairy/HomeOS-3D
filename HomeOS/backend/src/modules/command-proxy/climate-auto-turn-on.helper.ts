/**
 * 温控辅助开启判定（纯函数，便于单测）
 *
 * 所属模块：command-proxy
 * 职责：判断对已关闭的 climate 下发 set_temperature / set_hvac_mode / set_fan_mode /
 *      set_swing_mode / set_preset_mode 时是否需要先 turn_on，避免 HA 对关闭设备直接
 *      调温导致的「调了但没开」体验问题。该逻辑已下沉到 HaConnector.callService，
 *      所有联动路径（命令代理 / 自动化 / 场景）共用，保证一致性。
 * 关键依赖：无（纯函数）。
 */
const CLIMATE_SERVICES_NEED_ON = new Set([
  'set_temperature',
  'set_hvac_mode',
  'set_fan_mode',
  'set_swing_mode',
  'set_preset_mode',
]);

/**
 * 判定 climate 调温类服务是否需要先 turn_on。
 *
 * 跳过场景：
 *  - 非 climate 域、或服务不在调温类集合内；
 *  - 设备 unavailable / unknown（无法开机）；
 *  - set_hvac_mode 目标模式为 off（用户主动关机，不应再开机）。
 *
 * @param domain HA 服务域。
 * @param service HA 服务名。
 * @param currentState 实体当前 state（如 off / cool / unavailable）。
 * @param serviceData 服务调用附加参数（用于读取 set_hvac_mode 的 hvac_mode）。
 * @returns true 表示需先 turn_on，false 表示无需。
 */
export function climateNeedsAutoTurnOn(
  domain: string,
  service: string,
  currentState: string | undefined,
  serviceData?: Record<string, unknown>,
): boolean {
  if (domain !== 'climate') return false;
  if (!CLIMATE_SERVICES_NEED_ON.has(service)) return false;
  const state = String(currentState || '').toLowerCase();
  if (state === 'unavailable' || state === 'unknown') return false;
  if (service === 'set_hvac_mode') {
    const mode = String(serviceData?.hvac_mode ?? '').toLowerCase();
    if (mode === 'off') return false;
  }
  return state === 'off' || state === '';
}
