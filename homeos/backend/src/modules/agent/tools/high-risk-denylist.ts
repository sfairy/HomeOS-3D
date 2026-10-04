/**
 * 高危设备拦截规则。
 *
 * 职责：定义语音控制场景下严禁直接操作的设备域 / 服务 / 实体特征，
 *  供 HomeToolsService 在 control_device / control_room 前做安全校验。
 * 设计原则：门锁、安防撤防、燃气阀、车库门/大门等不应被一句话直接控制，
 *  需引导用户在手机 App 上二次确认。
 */

/** 按域 + 服务匹配的高危规则；services 为空数组表示该域下所有服务都禁 */
const HIGH_RISK_RULES = [
  { domain: 'lock', services: [] as string[], reason: '门锁操作' },
  {
    domain: 'alarm_control_panel',
    services: ['alarm_disarm', 'alarm_trigger'],
    reason: '安防撤防 / 紧急触发',
  },
  // scene / script / automation 内部动作无法静态审计（可能包含撤防、开阀、开门等危险联动），
  // 语音 / LLM 链路一律拦截，引导用户在 App 二次确认。
  //
  // 注意：这三条必须用「空 services」按**整个域**拦截，不能只列 turn_on / activate / run。
  // 否则同域的其它服务会绕过闸门：例如 script.toggle（脚本关闭时 toggle 即执行）、
  // script.turn_off、script.reload、scene.apply，实测全部返回 blocked=false，
  // 等于把「默认全禁」的白名单策略打穿。
  { domain: 'scene', services: [] as string[], reason: '场景触发（可能含任意联动动作）' },
  { domain: 'script', services: [] as string[], reason: '脚本执行（可能含任意联动动作）' },
  { domain: 'automation', services: [] as string[], reason: '自动化触发（可能含任意联动动作）' },
  { domain: 'siren', services: [] as string[], reason: '警笛控制' },
];

/** 实体 ID 含这些关键词时视为高危（燃气阀、总闸等） */
const HIGH_RISK_ENTITY_HINTS = ['gas', 'valve', '燃气', '阀门', '总闸'];

/**
 * 场景 / 脚本的语音控制白名单闸门。
 * 由 AgentConfigService.getSceneVoiceControl() 读取（layout.agentConfig.sceneVoiceControl），
 * 默认为「未启用 + 空清单」，即 fail-closed。
 */
export interface SceneVoiceControlGate {
  /** 是否启用场景语音控制总开关 */
  enabled: boolean;
  /** 允许语音触发的实体 ID 白名单（已统一小写，便于比对） */
  allow: ReadonlySet<string>;
}

/** 会被白名单闸门接管的域：automation 不在其中，保持永久拦截 */
const SCENE_VOICE_DOMAINS = new Set(['scene', 'script']);

/**
 * 判断某个场景 / 脚本是否被用户显式授权语音触发。
 * 仅当域为 scene / script、总开关已启用、且实体 ID 命中白名单时才放行。
 * @param domain 实体域
 * @param entityId 实体 ID
 * @param gate 白名单闸门（未提供视为全禁）
 * @returns 是否放行
 */
export function isSceneVoiceAllowed(
  domain: string,
  entityId: string,
  gate?: SceneVoiceControlGate,
): boolean {
  if (!SCENE_VOICE_DOMAINS.has(domain)) return false;
  if (!gate?.enabled) return false;
  const id = String(entityId || '').trim().toLowerCase();
  return id.length > 0 && gate.allow.has(id);
}

/** control_room 空 domain（“打开全屋设备”）时允许批量控制的“安全”域白名单 */
export const SAFE_BULK_CONTROL_DOMAINS = new Set([
  'light',
  'fan',
  'climate',
  'media_player',
  'vacuum',
  'humidifier',
  'air_purifier',
  'dehumidifier',
  'fan_fresh_air',
]);

/** cover 域下疑似车库门 / 大门的关键词（中英文 + 拼音） */
const GARAGE_GATE_HINTS = [
  'garage',
  'che_ku',
  '车库',
  'gate',
  'da_men',
  '大门',
  'yuan_men',
  '院门',
  'men_kai',
];

/** cover 域下会被判定为“开门”的服务名 */
const COVER_OPEN_SERVICES = ['open_cover', 'open'];

/**
 * 判定一次控制是否命中高危规则。
 * @param domain 设备域，如 light / lock / cover
 * @param service 服务名，如 turn_on / open_cover / alarm_disarm
 * @param entityId 实体 ID，用于关键词匹配（如含 gas / garage）
 * @param serviceData 附加服务参数（如 set_cover_position 的 position）
 * @param sceneVoice 场景 / 脚本语音控制白名单闸门；仅对 scene / script 生效，
 *   用户显式启用并勾选后才放行，automation 不受其影响、保持永久拦截
 * @returns blocked 是否拦截，reason 拦截原因（命中时返回，供前端提示用户）
 */
export function isHighRisk(
  domain: string,
  service: string,
  entityId: string,
  serviceData?: Record<string, unknown>,
  sceneVoice?: SceneVoiceControlGate,
): { blocked: boolean; reason?: string } {
  const id = (entityId || '').toLowerCase();
  // 1) 命中域 + 服务规则（如 lock 全禁、alarm_control_panel.alarm_disarm/alarm_trigger）
  for (const rule of HIGH_RISK_RULES) {
    if (
      rule.domain === domain &&
      (rule.services.length === 0 || rule.services.includes(service))
    ) {
      // scene / script：仅在用户白名单内放行；automation 一律拦截
      if (isSceneVoiceAllowed(domain, entityId, sceneVoice)) continue;
      return { blocked: true, reason: rule.reason };
    }
  }
  // 2) cover 域开门/开到位服务 + 实体名疑似车库门/大门
  //    set_cover_position 的 position≈100 等效开门，也须拦截
  const coverOpensFully =
    COVER_OPEN_SERVICES.includes(service) ||
    (service === 'set_cover_position' && Number(serviceData?.position) >= 95);
  if (domain === 'cover' && coverOpensFully) {
    if (GARAGE_GATE_HINTS.some((h) => id.includes(h.toLowerCase()))) {
      return { blocked: true, reason: '车库门/大门开启' };
    }
  }
  // 3) 实体 ID 含燃气/阀门/总闸等高危关键词
  if (HIGH_RISK_ENTITY_HINTS.some((h) => id.includes(h.toLowerCase()))) {
    return { blocked: true, reason: '疑似燃气阀/总闸等高危设备' };
  }
  return { blocked: false };
}