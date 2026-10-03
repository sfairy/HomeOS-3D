/**
 * 联动器模板「安装中」匹配：两侧非空才相等，避免 '' === '' 导致整表禁用。
 */
export function isOrchestratorTemplateInstalling(
  tpl: {
    id?: string
    filename?: string
    _groupId?: string
    _raw?: { filename?: string; id?: string }
  } | null | undefined,
  opts: {
    installingId?: string | null
    installingSecondaryId?: string | null
  } = {},
): boolean {
  const installing = String(opts.installingId || '').trim()
  const installingSecondary = String(opts.installingSecondaryId || '').trim()
  const id = String(tpl?.id || tpl?._raw?.id || '').trim()
  const filename = String(tpl?._raw?.filename || tpl?.filename || '').trim()

  if (tpl?._groupId === 'blueprint') {
    return Boolean(installingSecondary && filename && installingSecondary === filename)
  }
  if (installing && id && installing === id) return true
  if (installingSecondary && filename && installingSecondary === filename) return true
  return false
}
