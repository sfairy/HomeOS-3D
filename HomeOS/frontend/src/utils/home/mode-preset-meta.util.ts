/**
 * 家庭模式预设动作元数据工具。
 *
 * 职责：从预设动作列表中提取展示用标签，用于模式预设的摘要展示。
 */
import { getEntityDomain } from '@homeos/shared'

/** 从家庭模式预设动作提取展示用标签（含 notify / security） */
export function collectPresetActionTags(preset: {
  actions?: Array<{ kind?: string; domain?: string; entity_id?: string }>
}): string[] {
  const tags = new Set<string>()
  for (const action of preset?.actions || []) {
    const kind = action.kind || 'entity'
    // 按 kind 归类为中文标签；未命中时回退为 domain
    if (kind === 'notify') tags.add('通知')
    else if (kind === 'security') tags.add('安防')
    else if (kind === 'scene') tags.add('场景')
    else if (kind === 'script') tags.add('脚本')
    else {
      const domain =
        String(action.domain || '').trim() || getEntityDomain(String(action.entity_id || ''))
      if (domain) tags.add(domain)
    }
  }
  return [...tags]
}