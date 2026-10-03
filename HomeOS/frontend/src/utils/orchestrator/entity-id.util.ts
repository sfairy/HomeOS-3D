/** 场景实体 ID（HA scene.*） */
function sceneEntityId(sceneId: string | null | undefined) {
  const id = String(sceneId || '').trim()
  if (!id) return ''
  return id.includes('.') ? id : `scene.${id}`
}

/** 脚本实体 ID（HA script.*） */
function scriptEntityId(scriptId: string | null | undefined) {
  const id = String(scriptId || '').trim()
  if (!id) return ''
  return id.includes('.') ? id : `script.${id}`
}

/** 从已保存场景记录解析 entity_id */
export function sceneEntityIdFromRecord(s: {
  haConfigId?: string | null
  name?: string | null
} | null | undefined) {
  if (s?.haConfigId) return sceneEntityId(String(s.haConfigId).replace(/^homeos_/, ''))
  return s?.name ? sceneEntityId(s.name) : ''
}

/** 从已保存脚本记录解析 entity_id */
export function scriptEntityIdFromRecord(s: {
  haConfigId?: string | null
  name?: string | null
} | null | undefined) {
  if (s?.haConfigId) return scriptEntityId(String(s.haConfigId).replace(/^homeos_/, ''))
  return s?.name ? scriptEntityId(s.name) : ''
}
