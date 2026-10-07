/**
 * 功能码 → 中文名映射（授权状态面板与权益清单展示用）。
 *
 * 这是 ``ops/feature_codes.json`` 真源在前端的**只读镜像**：只取 ``code`` / ``label`` /
 * ``group`` 三个展示字段，供界面显示。`ops/check_feature_codes.py` 会校验本文件与真源
 * 逐条一致，因此不要在这里单独改文案 —— 先改真源，再同步这里。
 *
 * 依赖：无（纯静态映射）。
 */

/** 功能码分组：与真源 ``groups[].key`` 对齐。 */
export type FeatureGroup = 'base' | 'module'

/** 单个功能码的展示信息。 */
export interface FeatureLabelEntry {
  /** 中文名。 */
  label: string
  /** 所属分组。 */
  group: FeatureGroup
}

/** 功能码展示表（顺序与真源一致）。 */
export const FEATURE_LABELS: Record<string, FeatureLabelEntry> = {
  api: { label: '接口访问', group: 'base' },
  assets: { label: '素材资源', group: 'base' },
  editor: { label: '仪表盘编辑器', group: 'base' },
  display: { label: '中控展示', group: 'base' },
  'ha.sync': { label: 'Home Assistant 同步', group: 'base' },
  'ha.configure': { label: 'Home Assistant 配置', group: 'base' },
  'ha.control': { label: 'Home Assistant 控制', group: 'base' },
  'projects.write': { label: '项目写入', group: 'base' },
  'runtime.websocket': { label: '实时通道', group: 'base' },
  'module.3d_interaction': { label: '3D 交互', group: 'module' },
  'module.security': { label: '安防监控', group: 'module' },
  'module.notifications': { label: '通知中心', group: 'module' },
  'module.earthquake': { label: '地震预警', group: 'module' },
  'module.energy': { label: '能耗管理', group: 'module' },
  'module.home_mode': { label: '场景模式', group: 'module' },
  'module.voice': { label: '语音助手', group: 'module' },
  'module.agent': { label: 'AI 助手', group: 'module' },
  'module.media': { label: '影视媒体', group: 'module' },
}

/**
 * 取功能码的中文名。
 * @param code 功能码；未登记时原样返回，保证界面不会出现空白
 */
export function featureLabel(code: string): string {
  return FEATURE_LABELS[code]?.label ?? code
}
