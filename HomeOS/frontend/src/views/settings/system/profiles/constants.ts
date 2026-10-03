/**
 * 文件：constants.ts
 * 所属模块：frontend / src / views / settings / system / profiles
 * 职责：档案分区常量。定义各备份表类型的中文标签映射（告警规则/房间区域/自动化/能耗基线/家庭模式/场景/脚本/安防区/模板实体），
 *       提供 orchTableLabel 按 key 获取标签。
 * 关键依赖：无外部依赖，纯常量
 */
const PROFILE_TYPE_LABELS: Record<string, string> = {
  alertRules: '告警规则',
  areas: '房间区域',
  automations: '自动化',
  energyBaselines: '能耗基线',
  homeModes: '家庭模式',
  scenes: '场景',
  scripts: '脚本',
  securityPanel: '安防区配置',
  templateEntities: '模板实体',
}

/** orchTableLabel：函数，按签名入参返回处理结果。 */
export function orchTableLabel(key: string) {
  return PROFILE_TYPE_LABELS[key] ?? key
}
