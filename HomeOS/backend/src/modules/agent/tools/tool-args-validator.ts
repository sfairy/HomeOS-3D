/**
 * 工具参数安全校验。
 *
 * 所属模块：backend/modules/agent/tools
 * 职责：对 LLM 返回的工具参数做基本安全校验，防止 prompt injection 诱导恶意参数。
 *  - entity_id 格式校验（必须为 domain.entity 格式）
 *  - service_data 白名单字段过滤（仅允许已知安全字段，阻止 token/password 等敏感字段注入）
 *
 * 实体级 ACL（角色 / 儿童限制）由 home-tools.service 在执行 control_* 前通过
 * assertCommandProxyAuthorized 接入，与 HTTP /services/call 对齐。
 */

/** entity_id 格式正则：domain.entity，domain 与 entity 均为小写字母/数字/下划线 */
const ENTITY_ID_PATTERN = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;

/**
 * 校验 entity_id 格式是否合法（必须为 domain.entity 格式）。
 * @param entityId 待校验的实体 ID
 * @returns valid 是否合法；error 不合法时的错误信息
 */
export function validateEntityId(entityId: string): {
  valid: boolean;
  error?: string;
} {
  const id = String(entityId || '').trim();
  if (!id) return { valid: false, error: 'entity_id 不能为空' };
  if (!ENTITY_ID_PATTERN.test(id)) {
    return { valid: false, error: `entity_id 格式非法（应为 domain.entity）: ${id}` };
  }
  return { valid: true };
}

/**
 * 从 entity_id 提取 domain（点号前的部分）。
 * 用于安全校验：以 entity_id 自身的 domain 为准，而非 LLM 传入的 domain 参数，
 * 防止 LLM 伪造 domain 绕过 isHighRisk 高危设备拦截。
 * @param entityId 实体 ID，如 light.living_room
 * @returns domain，如 light；格式不符时返回空字符串
 */
export function extractDomain(entityId: string): string {
  const id = String(entityId || '').trim();
  const idx = id.indexOf('.');
  return idx > 0 ? id.slice(0, idx) : '';
}

/**
 * service_data 白名单字段：仅允许常见的 HA 服务安全参数。
 * 危险字段（如 entity_id / service / domain / token / password 等）会被过滤，
 * 防止 LLM 通过 service_data 注入覆盖目标实体或服务，或注入敏感凭证字段。
 */
const SERVICE_DATA_ALLOWED_FIELDS = new Set([
  // 温度 / 湿度
  'temperature',
  'target_temp_high',
  'target_temp_low',
  'humidity',
  // 空调模式
  'hvac_mode',
  'fan_mode',
  'swing_mode',
  'preset_mode',
  'aux_heat',
  // 灯光
  'brightness',
  'brightness_pct',
  'color_temp',
  'rgb_color',
  'xy_color',
  'hs_color',
  'effect',
  'flash',
  'transition',
  // 窗帘 / 遮罩
  'position',
  'tilt_position',
  'current_position',
  // 媒体播放器
  'volume',
  'volume_level',
  'is_volume_muted',
  'media_content_id',
  'media_content_type',
  'media_position',
  'media_seek_position',
  // 风扇
  'percentage',
  'percentage_step',
  'direction',
  // 扫地机
  'mode',
  'fan_speed',
  // 通用
  'duration',
  'delay',
  'value',
]);

/**
 * 对 service_data 做白名单字段过滤，仅保留已知安全字段。
 * @param data 原始 service_data
 * @returns 过滤后的 service_data（仅含白名单字段）；无安全字段时返回 undefined
 */
export function sanitizeServiceData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SERVICE_DATA_ALLOWED_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
