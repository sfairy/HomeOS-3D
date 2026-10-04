/**
 * 语音命令解析与执行规划工具。
 *
 * 职责：
 *   - 从自然语言文本中提取房间、匹配语音命令映射。
 *   - 将匹配到的命令展开为针对具体 HA 实体的 action 列表。
 *   - 支持 entity / homeos_scene / homeos_automation / homeos_mode 四种命令类型。
 *   - 解析 HA Assist 响应，判断是否成功处理。
 * 关键依赖：
 *   - @homeos/shared：房间目录、环境传感器映射排序。
 *   - ../types：HaEntity 类型。
 */
import type { HaEntity } from '../../shared/types';
import {
  DEFAULT_ROOM_CATALOG,
  getVoiceRoomsFromCatalog,
  sortEnvSensorMapRoomIds,
  type HaAreaRef,
  resolveVoiceRoomsFromHaAreas,
} from '@homeos/shared';

/**
 * 语音房间定义。
 * label 用于文本匹配与展示，keywords 为匹配别名列表（含中英文、slug 等）。
 */
export interface VoiceRoom {
  label: string;
  keywords: string[];
}

/** 全屋默认房间（与 envSensorMap 默认目录一致） */
const VOICE_ROOMS: VoiceRoom[] = getVoiceRoomsFromCatalog();

/**
 * 从 envSensorMap + HA 区域解析语音房间
 *
 * @param envSensorMap 环境传感器映射（slug → { label }）
 * @param haAreas HA 区域列表，提供时优先与 envSensorMap 合并
 * @returns 解析后的房间列表；无法解析时回退到 VOICE_ROOMS
 *
 * 优先级：
 * 1. 提供 haAreas 时，委托 resolveVoiceRoomsFromHaAreas 合并区域与传感器映射。
 * 2. 仅 envSensorMap 时，逐条解析并合并房间目录关键词。
 * 3. 全部缺失或解析为空时，回退到默认 VOICE_ROOMS。
 */
export function resolveVoiceRooms(
  envSensorMap?: Record<string, { label?: string } | undefined>,
  haAreas: HaAreaRef[] = [],
): VoiceRoom[] {
  // 默认回退：深拷贝 VOICE_ROOMS 避免外部修改污染
  const fallback = VOICE_ROOMS.map((r) => ({ label: r.label, keywords: [...r.keywords] }));
  if (haAreas.length) {
    return resolveVoiceRoomsFromHaAreas(haAreas, envSensorMap, DEFAULT_ROOM_CATALOG, fallback);
  }
  if (!envSensorMap || typeof envSensorMap !== 'object') {
    return fallback;
  }
  const bySlug = new Map<string, VoiceRoom>();
  for (const [slug, meta] of Object.entries(envSensorMap)) {
    // 跳过标记为隐藏的房间
    if ((meta as { _hidden?: boolean })?._hidden) continue;
    const label = String(meta?.label || '').trim();
    if (!label) continue;
    // 合并房间目录关键词 + label + slug，去重
    const catalogEntry = DEFAULT_ROOM_CATALOG.find((r) => r.id === slug);
    const keywords = catalogEntry
      ? [...new Set([...catalogEntry.voiceKeywords, label, slug])]
      : [label, slug, slug.replace(/_/g, ' ')];
    bySlug.set(slug, { label, keywords });
  }
  if (!bySlug.size) {
    return VOICE_ROOMS.map((r) => ({ label: r.label, keywords: [...r.keywords] }));
  }
  // 按 envSensorMap 排序规则输出，保持房间顺序稳定
  return sortEnvSensorMapRoomIds([...bySlug.keys()]).flatMap((slug) => {
    const entry = bySlug.get(slug);
    return entry ? [entry] : [];
  });
}

/** 语音命令类型：entity=HA 实体控制，其余三种为 HomeOS 内部目标 */
type VoiceCommandKind = 'entity' | 'homeos_scene' | 'homeos_automation' | 'homeos_mode';

/**
 * 语音命令映射：将自然语言短语映射到 HA domain/service 或 HomeOS 目标。
 */
export interface VoiceCommandMapping {
  /** 触发短语列表，命中任一即匹配 */
  phrases: string[];
  /** 默认 entity：按 domain/service 批量控制 HA 实体 */
  kind?: VoiceCommandKind;
  /** HA domain（如 light / climate / cover） */
  domain: string;
  /** HA service（如 turn_on / turn_off / set_hvac_mode） */
  service: string;
  /** 实体 ID 前缀过滤，如 'light.' 匹配所有灯 */
  entityMatch?: string;
  /** 调用 service 时附带的数据（如 { hvac_mode: 'cool' }） */
  serviceData?: Record<string, unknown>;
  /** homeos_scene / homeos_automation / homeos_mode 的目标 UUID */
  targetId?: string;
}

/** 单条语音命令执行动作：已解析到具体实体或 HomeOS 目标 */
export interface VoiceCommandAction {
  kind?: VoiceCommandKind;
  domain: string;
  service: string;
  entityId: string;
  targetId?: string;
  serviceData?: Record<string, unknown>;
}

/** 语音命令规划结果：包含匹配状态、房间、动作列表与用户可见消息 */
interface VoiceCommandPlan {
  matched: boolean;
  room: VoiceRoom | null;
  phrase: string | null;
  actions: VoiceCommandAction[];
  message: string;
  count: number;
}
/**
 * 从文本中提取房间。
 *
 * @param text 用户语音转文字后的文本
 * @param rooms 候选房间列表，默认 VOICE_ROOMS
 * @returns 匹配到的房间；未匹配返回 null
 *
 * 匹配策略：
 * 1. 先用原始文本匹配 room.label（大小写敏感，保留中文精确匹配）。
 * 2. 再用小写文本匹配 room.keywords（大小写不敏感，覆盖英文别名）。
 */
export function extractRoomFromText(
  text: string,
  rooms: VoiceRoom[] = VOICE_ROOMS,
): VoiceRoom | null {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  for (const room of rooms) {
    // 优先精确匹配 label（保留中文大小写语义）
    if (raw.includes(room.label)) return room;
    // 回退到 keywords 别名匹配（小写比较）
    if (room.keywords.some((k) => lower.includes(k.toLowerCase()))) return room;
  }
  return null;
}

/**
 * 判断 HA 实体是否属于指定房间。
 *
 * @param entity HA 实体
 * @param room 目标房间
 * @returns true=实体属于该房间
 *
 * 检查范围：entity_id + friendly_name + area_id 拼接后的小写文本，
 * 匹配 room.label 或任一 keyword。
 */
function entityMatchesRoom(entity: HaEntity, room: VoiceRoom): boolean {
  const attrs = (entity.attributes || {}) as Record<string, unknown>;
  // 拼接所有可能包含房间信息的字段作为搜索空间
  const hay =
    `${entity.entity_id} ${attrs.friendly_name || ''} ${attrs.area_id || ''}`.toLowerCase();
  if (hay.includes(room.label)) return true;
  return room.keywords.some((k) => hay.includes(k.toLowerCase()));
}

/**
 * 在文本中查找匹配的语音命令映射。
 *
 * @param text 用户输入文本
 * @param mappings 语音命令映射列表
 * @returns 匹配到的映射与命中短语；未匹配返回 null
 *
 * 遍历 mappings，对每个映射检查 phrases 中是否有短语出现在文本中（小写包含匹配）。
 * 返回第一个命中的映射。
 */
function findMatchingCommand(
  text: string,
  mappings: VoiceCommandMapping[],
): { mapping: VoiceCommandMapping; phrase: string } | null {
  const lower = String(text || '').toLowerCase();
  for (const mapping of mappings) {
    for (const phrase of mapping.phrases || []) {
      const p = String(phrase).trim().toLowerCase();
      // 空短语跳过，避免误匹配
      if (p && lower.includes(p)) {
        return { mapping, phrase: String(phrase).trim() };
      }
    }
  }
  return null;
}

/**
 * 规划语音命令执行计划。
 *
 * @param text 用户输入文本
 * @param mappings 语音命令映射列表
 * @param entities 当前 HA 实体列表（用于 entity 类型命令展开）
 * @param rooms 房间列表，默认 VOICE_ROOMS
 * @returns 命令执行计划（含匹配状态、动作列表、用户消息）
 *
 * 流程：
 * 1. 提取房间（可能为 null=全屋）。
 * 2. 查找匹配的命令映射；未匹配返回 matched=false。
 * 3. 非 entity 类型（场景/自动化/模式）：直接生成单条动作，需 targetId。
 * 4. entity 类型：按 entityMatch 前缀过滤实体，排除 unavailable，按房间过滤。
 * 5. 生成用户可见的中文消息。
 */
export function planVoiceCommands(
  text: string,
  mappings: VoiceCommandMapping[],
  entities: HaEntity[],
  rooms: VoiceRoom[] = VOICE_ROOMS,
): VoiceCommandPlan {
  const room = extractRoomFromText(text, rooms);
  const hit = findMatchingCommand(text, mappings);
  // 未匹配到任何命令映射
  if (!hit) {
    return {
      matched: false,
      room,
      phrase: null,
      actions: [],
      message: '未匹配到语音命令',
      count: 0,
    };
  }

  const kind = hit.mapping.kind || 'entity';
  // 非 entity 类型：场景 / 自动化 / 家庭模式
  if (kind !== 'entity') {
    const targetId = String(hit.mapping.targetId || '').trim();
    // 缺少 targetId 无法执行
    if (!targetId) {
      return {
        matched: true,
        room,
        phrase: hit.phrase,
        actions: [],
        message: '语音命令未配置 HomeOS 目标 ID',
        count: 0,
      };
    }
    // 根据类型选择中文标签
    const label =
      kind === 'homeos_scene' ? '场景' : kind === 'homeos_automation' ? '自动化' : '家庭模式';
    return {
      matched: true,
      room,
      phrase: hit.phrase,
      actions: [
        {
          kind,
          domain: hit.mapping.domain,
          service: hit.mapping.service,
          entityId: '',
          targetId,
        },
      ],
      message: `已触发 HomeOS ${label}（${hit.phrase}）`,
      count: 1,
    };
  }

  // entity 类型：展开到具体实体
  const prefix = hit.mapping.entityMatch || `${hit.mapping.domain}.`;
  const actions: VoiceCommandAction[] = [];

  for (const entity of entities) {
    // 前缀过滤：仅处理匹配 domain.entityMatch 的实体
    if (!entity?.entity_id?.startsWith(prefix)) continue;
    // 跳过不可用实体
    if (entity.state === 'unavailable') continue;
    // 房间过滤：若文本中指定了房间，仅操作该房间内的实体
    if (room && !entityMatchesRoom(entity, room)) continue;
    actions.push({
      domain: hit.mapping.domain,
      service: hit.mapping.service,
      entityId: entity.entity_id,
      serviceData: hit.mapping.serviceData,
    });
  }

  // 生成用户可见消息
  const scope = room ? `${room.label}` : '全屋';
  const message = actions.length
    ? `已执行 ${scope} ${actions.length} 个设备（${hit.phrase}）`
    : room
      ? `${room.label}未找到匹配设备`
      : '未找到匹配设备';

  return {
    matched: true,
    room,
    phrase: hit.phrase,
    actions,
    message,
    count: actions.length,
  };
}
/**
 * 从 HA Assist 响应中提取语音回复文本。
 *
 * @param response HA Assist 返回的响应对象
 * @returns 语音回复文本；无回复返回空串
 *
 * HA Assist 响应结构有两种可能位置：
 * 1. 顶层 speech.plain.speech
 * 2. 嵌套 response.speech.plain.speech
 */
export function extractHaAssistSpeech(
  response: Record<string, unknown> | null | undefined,
): string {
  if (!response) return '';
  // 尝试顶层 speech 字段
  const speech = response.speech as { plain?: { speech?: string } } | undefined;
  if (speech?.plain?.speech) return String(speech.plain.speech).trim();
  // 回退到嵌套 response.speech 字段
  const resp = response.response as { speech?: { plain?: { speech?: string } } } | undefined;
  if (resp?.speech?.plain?.speech) return String(resp.speech.plain.speech).trim();
  return '';
}

/** Assist 兜底话术（未理解意图）不当作成功，以便回落短语 / 智能管家 */
function isHaAssistFallbackSpeech(speech: string): boolean {
  const s = speech.trim().toLowerCase();
  if (!s) return true;
  return (
    /sorry|don'?t understand|didn'?t understand|no intent|not sure|can you rephrase/.test(s) ||
    /抱歉|没有理解|听不懂|无法处理|没听清|再说一遍|不太明白/.test(s)
  );
}

/**
 * HA Assistant 是否已成功处理（执行动作或明确问答）
 *
 * @param response HA Assist 返回的响应对象
 * @returns true=已成功处理（action_done 或 query_answer 带语音回复）
 *
 * 判定逻辑：
 * - response_type=error / no_intent_matched → 失败
 * - response_type=action_done → 成功
 * - response_type=query_answer 且有语音回复 → 成功
 * - data.code=no_intent 或 data.failed=true → 失败
 * - 其余情况 → 失败（保守判定，避免误报成功）
 */
export function haAssistSucceeded(response: Record<string, unknown> | null | undefined): boolean {
  if (!response) return false;
  const type = String(response.response_type || '');
  // 明确失败类型
  if (type === 'error' || type === 'no_intent_matched') return false;
  // 明确成功：动作已执行
  if (type === 'action_done') return true;
  // 查询类回复须有语音内容才算成功
  if (type === 'query_answer') {
    const speech = extractHaAssistSpeech(response);
    if (!speech) return false;
    if (isHaAssistFallbackSpeech(speech)) return false;
    return true;
  }
  // 检查 data 中的失败标记
  const data = response.data as Record<string, unknown> | undefined;
  if (data && typeof data === 'object') {
    if (data.code === 'no_intent' || data.failed === true) return false;
  }
  // 默认保守判定为失败
  return false;
}

/**
 * 全屋智能默认语音命令（设置页可一键导入）
 *
 * 涵盖灯光、空调、窗帘、风扇、插座、媒体播放器等常见设备控制。
 * 短语使用中文自然语言，domain/service 对应 HA 标准服务调用。
 */
export const DEFAULT_WHOLE_HOME_VOICE_COMMANDS: VoiceCommandMapping[] = [
  {
    phrases: ['开灯', '打开灯', '亮灯'],
    domain: 'light',
    service: 'turn_on',
    entityMatch: 'light.',
  },
  {
    phrases: ['关灯', '关闭灯', '关掉灯'],
    domain: 'light',
    service: 'turn_off',
    entityMatch: 'light.',
  },
  {
    phrases: ['打开空调', '开空调'],
    domain: 'climate',
    service: 'set_hvac_mode',
    entityMatch: 'climate.',
    serviceData: { hvac_mode: 'cool' },
  },
  {
    phrases: ['关闭空调', '关空调'],
    domain: 'climate',
    service: 'set_hvac_mode',
    entityMatch: 'climate.',
    serviceData: { hvac_mode: 'off' },
  },
  {
    phrases: ['打开窗帘', '拉开窗帘'],
    domain: 'cover',
    service: 'open_cover',
    entityMatch: 'cover.',
  },
  {
    phrases: ['关闭窗帘', '拉上窗帘', '关窗帘'],
    domain: 'cover',
    service: 'close_cover',
    entityMatch: 'cover.',
  },
  { phrases: ['打开风扇', '开风扇'], domain: 'fan', service: 'turn_on', entityMatch: 'fan.' },
  { phrases: ['关闭风扇', '关风扇'], domain: 'fan', service: 'turn_off', entityMatch: 'fan.' },
  { phrases: ['打开插座', '开插座'], domain: 'switch', service: 'turn_on', entityMatch: 'switch.' },
  {
    phrases: ['关闭插座', '关插座'],
    domain: 'switch',
    service: 'turn_off',
    entityMatch: 'switch.',
  },
  {
    phrases: ['暂停音乐', '停止播放'],
    domain: 'media_player',
    service: 'media_pause',
    entityMatch: 'media_player.',
  },
];