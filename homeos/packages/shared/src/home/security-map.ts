/**
 * 家庭模式 ↔ 安防布防 名称 / 对照模块（前后端共用）
 *
 * 职责：
 *  - 维护 HA alarm_control_panel 布防模式枚举与中文名称对照。
 *  - 提供"安防布防 ↔ 家庭模式"双向推断（按名称正则匹配）。
 *  - 提供区域类型在指定布防模式下是否参与告警的判定。
 *
 * 关键依赖：
 *  - HA alarm_control_panel：布防模式与区域类型对齐 HA 既有语义；
 *  - 家庭模式触发器：安防变更时调用 resolveHomeModeLinkForSecurityChange 决策切换目标。
 *
 * 约定：
 *  - 区域类型默认为 'all'（兼容未配置 zoneType 的旧配置）；
 *  - 名称匹配优先级低于显式 linkedId；
 *  - disarmed 在无显式 link 时按"退出家庭模式"处理。
 */

/**
 * HA alarm_control_panel 布防模式枚举。
 *  - disarmed：撤防（含在家 / 外出 / 夜间之外的"无防护"状态）
 *  - armed_home：居家布防（仅外围告警）
 *  - armed_away：外出布防（全区域告警）
 *  - armed_night：夜间布防（仅外围 + 全区域，忽略纯室内）
 */
export type SecurityArmingMode = 'disarmed' | 'armed_home' | 'armed_away' | 'armed_night';

/**
 * 安防区域类型。
 *  - perimeter：外围（门窗 / 阳台）
 *  - interior：室内（动静 / 摄像头）
 *  - all：全区域（参与所有布防模式）
 */
export type SecurityZoneType = 'perimeter' | 'interior' | 'all';

/**
 * 全部布防模式（顺序用于设置页渲染与白名单校验）。
 * 注意 disarmed 排在末位，避免新建模式时默认命中撤防。
 */
export const SECURITY_ARMING_MODES: readonly SecurityArmingMode[] = [
  'armed_home',
  'armed_away',
  'armed_night',
  'disarmed',
] as const;

/**
 * 区域是否参与当前布防模式的传感器告警。
 *
 * @param mode     当前布防模式
 * @param zoneType 区域类型；缺省视为 'all'
 * @returns true 表示该区域在当前模式下触发告警
 *
 * 规则：
 *  - disarmed：一律不告警；
 *  - armed_away：所有区域告警；
 *  - armed_home / armed_night：仅外围与全区域告警，忽略纯室内（允许起夜 / 室内活动）；
 *  - 未知模式默认告警（保守策略，避免漏告）。
 */
export function shouldZoneAlarmInMode(
  mode: SecurityArmingMode | string,
  zoneType: SecurityZoneType | undefined,
): boolean {
  const zt = zoneType || 'all';
  if (mode === 'disarmed') return false;
  if (mode === 'armed_away') return true;
  // 居家 / 夜间：仅外围与全区域参与，忽略纯室内区（允许起夜 / 室内活动）
  if (mode === 'armed_home' || mode === 'armed_night') {
    return zt !== 'interior';
  }
  return true;
}

/**
 * 规范化区域类型：仅接受合法枚举值，其余回退为 'all'。
 *
 * @param raw 原始值（来自配置文件或前端表单）
 * @returns 合法的 SecurityZoneType
 */
export function normalizeZoneType(raw: unknown): SecurityZoneType {
  if (raw === 'perimeter' || raw === 'interior' || raw === 'all') return raw;
  return 'all';
}

/**
 * 安防模式 → 匹配家庭模式名称的正则（按优先级用于 find）。
 * 命中顺序：armed_away → armed_night → armed_home → disarmed（详见 inferSecurityModeFromHomeModeName）。
 */
export const SECURITY_TO_HOME_MODE_NAME_PATTERN: Record<SecurityArmingMode, RegExp> = {
  armed_away: /离家|away|外出|度假/i,
  armed_home: /回家|在家|居家|home/i,
  armed_night: /睡眠|夜间|night|晚安/i,
  disarmed: /撤防|disarm/i,
};

/**
 * 布防 ↔ 家庭模式对照表文案（设置页 / 说明书 / 关联配置说明）。
 */
export const HOME_SECURITY_LINK_ROWS: ReadonlyArray<{
  arming: SecurityArmingMode;
  armingLabel: string;
  homeModeHint: string;
}> = [
  { arming: 'armed_home', armingLabel: '居家', homeModeHint: '回家 / 居家 / 在家' },
  { arming: 'armed_away', armingLabel: '离家', homeModeHint: '离家 / 外出 / 度假' },
  { arming: 'armed_night', armingLabel: '夜间', homeModeHint: '睡眠 / 夜间' },
  { arming: 'disarmed', armingLabel: '撤防', homeModeHint: '撤防（留空则退出家庭模式）' },
];

/**
 * 家庭模式名称 → 建议安防模式（回家→居家，离家→外出）。
 *
 * @param name 家庭模式名称
 * @returns 推荐的 SecurityArmingMode；无法识别返回 null
 *
 * 匹配优先级：离家 → 夜间 → 回家 → 撤防。
 * 离家优先于回家，避免"回家度假"等歧义名称误判。
 */
export function inferSecurityModeFromHomeModeName(name: string): SecurityArmingMode | null {
  const n = String(name || '').trim();
  if (!n) return null;
  if (/离家|away|外出|度假/i.test(n)) return 'armed_away';
  if (/睡眠|夜间|night|晚安/i.test(n)) return 'armed_night';
  if (/回家|居家|在家|(^|[^a-z])home([^a-z]|$)/i.test(n)) return 'armed_home';
  if (/撤防|disarm/i.test(n)) return 'disarmed';
  return null;
}

/**
 * 构造家庭模式的"安防动作"描述（用于触发器动作序列化）。
 *
 * @param mode 目标布防模式
 * @returns 形如 { kind: 'security', entity_id: <mode>, service: 'arm' | 'disarm' } 的动作对象
 */
export function buildHomeModeSecurityAction(mode: SecurityArmingMode) {
  return {
    kind: 'security' as const,
    entity_id: mode,
    domain: 'security',
    service: mode === 'disarmed' ? 'disarm' : 'arm',
  };
}

/**
 * 判断某个 entity_id 是否为安防布防模式值（用于过滤 HA 实体列表中的"伪实体"）。
 *
 * @param id 待判定的 entity_id
 * @returns true 表示该 id 是合法的 SecurityArmingMode
 */
export function isSecurityArmingEntityId(id: string): boolean {
  return (SECURITY_ARMING_MODES as readonly string[]).includes(id);
}

/**
 * 从家庭模式列表中解析安防变更的目标家庭模式。
 *
 * 决策顺序：
 *  1. 显式 linkedId 命中 → activate 该模式；
 *  2. linkedId 非空但未命中且当前为 disarmed → deactivate（退出家庭模式）；
 *  3. allowNameFallback 关闭 → none；
 *  4. disarmed → deactivate；
 *  5. 按名称正则匹配 → activate；
 *  6. 均未命中 → none。
 *
 * disarmed 且无有效 link 时返回 { action: 'deactivate' }
 * （需 allowNameFallback / 总开关开启）。
 *
 * @param input.mode             当前布防模式
 * @param input.linkedId         用户显式绑定的家庭模式 ID（优先级最高）
 * @param input.modes            全部家庭模式列表（用于按名称匹配）
 * @param input.allowNameFallback 是否允许按名称正则匹配；默认 true
 * @returns activate / deactivate / none 三态决策
 */
export function resolveHomeModeLinkForSecurityChange(input: {
  mode: SecurityArmingMode;
  linkedId?: string | null;
  modes: Array<{ id: string; name: string }>;
  /** 是否允许按名称正则匹配；显式 linkedId 始终优先。默认 true */
  allowNameFallback?: boolean;
}): { action: 'activate'; modeId: string } | { action: 'deactivate' } | { action: 'none' } {
  const { mode, linkedId, modes, allowNameFallback = true } = input;
  const linked = linkedId?.trim();
  if (linked) {
    const target = modes.find((m) => m.id === linked);
    if (target) {
      return { action: 'activate', modeId: target.id };
    }
    if (mode === 'disarmed' && allowNameFallback) {
      return { action: 'deactivate' };
    }
    return { action: 'none' };
  }

  if (!allowNameFallback) return { action: 'none' };

  if (mode === 'disarmed') {
    return { action: 'deactivate' };
  }

  const pattern = SECURITY_TO_HOME_MODE_NAME_PATTERN[mode];
  const target = modes.find((m) => pattern.test(m.name));
  if (!target) return { action: 'none' };
  return { action: 'activate', modeId: target.id };
}
