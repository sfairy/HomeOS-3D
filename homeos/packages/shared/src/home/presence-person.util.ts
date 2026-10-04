/**
 * 人员在家判定配置模块（security.presencePersons）
 *
 * 职责：
 *  - 维护"人员 → 关联实体"的映射，作为"全员离家"等家庭模式触发器的事实来源。
 *  - 提供配置归一化、ID 生成、聚合 entity_id 与"是否在家"判定。
 *
 * 关键依赖：
 *  - HA device_tracker / person 实体：通常作为 entityIds 的来源；
 *  - 家庭模式触发器、安防布防逻辑消费 computePersonAtHome 的结果。
 *
 * 约定：
 *  - 一名人员可绑定多个实体（多设备 / 手机 + 手表等），任一在家即视为在家；
 *  - 缺失 id 时按 defaultPresencePersonId 生成稳定 ID，避免配置漂移；
 *  - name 与 entityIds 任一缺失视为无效条目，归一化时直接丢弃。
 */

/**
 * 单个人员的在家判定配置。
 */
export interface PresencePerson {
  /** 人员 ID（缺省时由归一化生成稳定 ID） */
  id: string;
  /** 人员显示名（如 "张三"） */
  name: string;
  /** 关联实体 ID 列表（任一在家即视为在家） */
  entityIds: string[];
  /** 可选：绑定 HomeOS 用户（用于跨模块联动） */
  userId?: string;
}

/**
 * 默认 ID 生成器：基于 name 与首个 entity_id 拼接稳定 key。
 * 用作归一化时的回退，便于跨设备配置去重。
 */
function defaultPresencePersonId(name: string, entityIds: string[]): string {
  return `p_${name.replace(/\s+/g, '_')}_${entityIds[0]?.replace(/\./g, '_') ?? 'x'}`;
}

/**
 * 规范化人员配置条目。
 *
 * @param raw 原始配置（来自 security.presencePersons，可为任意结构）
 * @param opts 可选 ID 生成器覆盖（用于测试 / 自定义命名策略）
 * @returns 通过校验的 PresencePerson 数组；非数组或全无效时返回 []
 *
 * 校验规则：
 *  - 非对象 / 非数组 → 返回 []；
 *  - name 与 entityIds 必须同时非空；
 *  - entityIds 会被 trim 并过滤掉空串；
 *  - userId 空串会被丢弃（不写入 undefined）。
 */
export function normalizePresencePersons(
  raw: unknown,
  opts?: { generateId?: (name: string, entityIds: string[]) => string },
): PresencePerson[] {
  if (!Array.isArray(raw)) return [];
  const generateId = opts?.generateId ?? defaultPresencePersonId;
  const result: PresencePerson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? '').trim();
    const entityIds = Array.isArray(o.entityIds)
      ? o.entityIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!name || entityIds.length === 0) continue;
    let id = String(o.id ?? '').trim();
    if (!id) id = generateId(name, entityIds);
    const userId = String(o.userId ?? '').trim() || undefined;
    result.push({ id, name, entityIds, ...(userId ? { userId } : {}) });
  }
  return result;
}

/**
 * 从 security 配置分区读取人员列表（语法糖）。
 *
 * @param security 系统配置中的 security 子对象
 * @returns 归一化后的 PresencePerson 数组
 */
export function getPresencePersonsFromSecurity(
  security: { presencePersons?: unknown } = {},
): PresencePerson[] {
  return normalizePresencePersons(security.presencePersons);
}

/**
 * 聚合所有人员的追踪实体 ID（去重）。
 *
 * @param persons 已归一化的人员列表
 * @returns 去重后的 entity_id 数组（用于批量订阅 / 状态查询）
 */
export function collectPresenceEntityIds(persons: PresencePerson[]): string[] {
  const set = new Set<string>();
  for (const person of persons) {
    for (const id of person.entityIds) set.add(id);
  }
  return [...set];
}

/**
 * 计算指定人员当前是否在家。
 *
 * @param person            人员对象（仅需 entityIds）
 * @param entityAtHome      实体在家状态查询回调（返回 undefined 视为无数据）
 * @returns 任一关联实体在家即视为在家；无关联实体或全部未知视为不在家
 *
 * 约定：entityAtHome 返回 undefined 表示传感器数据缺失，按"不在家"处理，
 *  避免"数据未就绪即误判全员离家触发模式切换"。
 */
export function computePersonAtHome(
  person: { entityIds?: string[] },
  entityAtHome: (entityId: string) => boolean | undefined,
): boolean {
  const ids = Array.isArray(person?.entityIds) ? person.entityIds.filter(Boolean) : [];
  if (!ids.length) return false;
  return ids.some((id) => entityAtHome(id) === true);
}
