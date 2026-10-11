/**
 * 实体反向引用模块 — 前后端 API 契约
 *
 * 职责：
 *  - 定义"哪些功能配置了某 entity_id"的查询 / 解绑契约。
 *  - 提供引用类型 / 角色的中文标签与分组排序常量。
 *
 * 关键依赖：
 *  - 后端 entity-references 路由按此类型聚合扫描结果；
 *  - 前端引用详情弹窗按此标签与顺序渲染。
 *
 * 约定：
 *  - kind 表示引用来源的功能类别（自动化 / 场景 / 组件等）；
 *  - role 表示该实体在引用中扮演的角色（触发 / 条件 / 动作等）；
 *  - LAYOUT / SYSTEM_CONFIG 两类引用在解绑后需要前端额外刷新对应模块。
 */

/** 实体反向引用（哪些功能配置了该 entity_id）— 前后端 API 契约 */

/**
 * 实体引用来源类型。
 *  - automation / scene / script / template：HA 原生配置实体
 *  - home_mode / alert_rule / security_*：HomeOS 业务功能
 *  - favorite / widget / footer：前端布局类引用
 *  - binding / system_config / env_sensor / media / whole_home_off：系统级配置
 */
export type EntityReferenceKind =
  | 'automation'
  | 'scene'
  | 'script'
  | 'template'
  | 'home_mode'
  | 'alert_rule'
  | 'favorite'
  | 'widget'
  | 'binding'
  | 'security_mode'
  | 'security_zone'
  | 'env_sensor'
  | 'system_config'
  | 'footer'
  | 'whole_home_off'
  | 'media'
  | 'other';

/**
 * 实体在引用中扮演的角色。
 *  - trigger / condition / action：自动化三要素
 *  - member / watch / binding：归属 / 监视 / 绑定关系
 *  - display / favorite / config / reference：展示 / 收藏 / 配置 / 一般引用
 */
export type EntityReferenceRole =
  | 'trigger'
  | 'condition'
  | 'action'
  | 'member'
  | 'watch'
  | 'binding'
  | 'display'
  | 'favorite'
  | 'config'
  | 'reference';

/**
 * 单条反向引用记录。
 */
export interface EntityReferenceItem {
  /** 引用来源类型 */
  kind: EntityReferenceKind;
  /** 来源功能项 ID（如自动化 ID、组件 ID） */
  id: string;
  /** 来源功能项显示名 */
  name: string;
  /** 该实体在来源中的角色 */
  role: EntityReferenceRole;
  /** 附加说明（如触发条件摘要、模板表达式等） */
  detail?: string;
  /** 前端深链路径（含 query） */
  path?: string;
  /** 该引用是否处于启用状态（自动化 / 组件可能被禁用） */
  enabled?: boolean;
}

/**
 * 反向引用查询响应。
 */
export interface EntityReferencesResponse {
  /** 查询的 entity_id */
  entityId: string;
  /** 引用总数 */
  total: number;
  /** 按 kind 分类的计数（用于分组标题） */
  counts: Partial<Record<EntityReferenceKind, number>>;
  /** 引用明细列表 */
  items: EntityReferenceItem[];
}

/**
 * 解绑请求：指定要移除的来源类型与 ID。
 */
export interface EntityReferenceUnlinkRequest {
  /** 来源类型 */
  kind: EntityReferenceKind;
  /** 来源功能项 ID */
  id: string;
  /** 附加说明（可选，用于日志） */
  detail?: string;
}

/**
 * 解绑动作类型（用于前端提示用户后续操作）。
 *  - cleared：清除了引用字段
 *  - filtered：从列表中过滤掉
 *  - removed_item：移除了列表项
 *  - deleted_rule / deleted_widget：删除了整条规则 / 组件
 *  - updated：更新了配置
 */
export type EntityReferenceUnlinkAction =
  | 'cleared'
  | 'filtered'
  | 'removed_item'
  | 'deleted_rule'
  | 'deleted_widget'
  | 'updated';

/**
 * 解绑结果：包含操作是否成功、动作类型、剩余引用快照。
 */
export interface EntityReferenceUnlinkResult {
  /** 操作的 entity_id */
  entityId: string;
  /** 是否成功 */
  ok: boolean;
  /** 实际执行的动作（用于前端 toast 提示） */
  action?: EntityReferenceUnlinkAction;
  /** 附加消息（如失败原因） */
  message?: string;
  /** 解绑后剩余的引用快照（前端可据此刷新列表而无需重新请求） */
  remaining: EntityReferencesResponse;
}

/**
 * 引用来源类型 → 中文标签映射（列表 / 分组标题用）。
 */
export const ENTITY_REFERENCE_KIND_LABELS: Record<EntityReferenceKind, string> = {
  automation: '自动化',
  scene: '场景',
  script: '脚本',
  template: '模板实体',
  home_mode: '家庭模式',
  alert_rule: '告警规则',
  favorite: '收藏',
  widget: '面板组件',
  binding: '系统绑定',
  security_mode: '安防模式',
  security_zone: '安防区域',
  env_sensor: '环境映射',
  system_config: '系统配置',
  footer: '仪表盘页脚',
  whole_home_off: '全屋关闭',
  media: '影音',
  other: '其他',
};

/**
 * 引用角色 → 中文标签映射（明细列表用）。
 */
export const ENTITY_REFERENCE_ROLE_LABELS: Record<EntityReferenceRole, string> = {
  trigger: '触发',
  condition: '条件',
  action: '动作',
  member: '成员',
  watch: '监视',
  binding: '绑定',
  display: '展示',
  favorite: '收藏',
  config: '配置',
  reference: '引用',
};

/** 前端分组展示顺序 */
export const ENTITY_REFERENCE_KIND_ORDER: EntityReferenceKind[] = [
  'automation',
  'scene',
  'script',
  'template',
  'home_mode',
  'alert_rule',
  'binding',
  'env_sensor',
  'security_mode',
  'security_zone',
  'favorite',
  'widget',
  'footer',
  'whole_home_off',
  'media',
  'system_config',
  'other',
];

/** 布局类引用（移除后需前端重载 layout） */
export const LAYOUT_ENTITY_REFERENCE_KINDS: ReadonlySet<EntityReferenceKind> = new Set([
  'favorite',
  'widget',
  'binding',
  'security_mode',
  'security_zone',
  'footer',
  'whole_home_off',
]);

/** 系统配置类引用（移除后需强制刷新 system config） */
export const SYSTEM_CONFIG_ENTITY_REFERENCE_KINDS: ReadonlySet<EntityReferenceKind> = new Set([
  'env_sensor',
  'system_config',
  'media',
]);

/** 后端 unlink 已实现的引用类型（其余仅展示，不可移除） */
export const UNLINKABLE_ENTITY_REFERENCE_KINDS: ReadonlySet<EntityReferenceKind> = new Set([
  'automation',
  'scene',
  'script',
  'template',
  'home_mode',
  'alert_rule',
  'favorite',
  'widget',
  'binding',
  'footer',
  'whole_home_off',
  'security_mode',
  'security_zone',
  'env_sensor',
  'system_config',
  'media',
]);