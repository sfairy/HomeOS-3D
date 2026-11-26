/**
 * 导出前的装饰模型体检（对齐 0.8.9）。
 *
 * 上游在导图前会把本次要画的装饰模型全部预载一遍，任何一件拿不到就直接抛
 * `有装饰模型暂时无法载入，请检查后再导图。` —— 因为 `user-decoration` 的网格
 * **完全**来自 GLB，没有程序化兜底几何，缺模型的那件在成品里就是一片空白，
 * 而页面上不会有任何提示（编辑期它是静默不渲染的）。
 *
 * 本仓的加载失败统一记在 `previewIssues()` 里（见 `loaders/preview-diagnostics.ts`，
 * 记的是 `model:<assetId>`），所以这里只做「把两边对上」：**仅当**失败项是
 * `model:<hex>`、**且**本项目里确实摆着引用该 assetId 的装饰时才算缺失。
 * 静态件（`sofa` 等）的加载失败不拦导出 —— 那是另一个问题，不该顺手堵住导图。
 */

/** 用户装饰的动态模型键：`model:` + 32 位 hex（与 `user-decoration-models.ts` 同口径）。 */
const DECORATION_MODEL_KEY = /^model:([0-9a-f]{32})$/i

type IssueLike = { stage?: string; itemType?: string }
type FloorLike = { scene?: { items?: Array<{ type?: string; assetId?: string; name?: string }> } }

/** 从诊断列表里取出「确实是装饰、确实加载失败」的 assetId（小写）。 */
function failedDecorationAssetIds(issues: IssueLike[]): Set<string> {
  const failed = new Set<string>()
  for (const issue of issues) {
    // `fallback` = 回退成功（已画出来了），`render` = 渲染空白（不是加载问题），都不拦。
    if (issue.stage !== 'load' && issue.stage !== 'parse') continue
    const matched = DECORATION_MODEL_KEY.exec(String(issue.itemType || ''))
    if (matched) failed.add(matched[1].toLowerCase())
  }
  return failed
}

/**
 * 本项目里引用了「拿不到的装饰模型」的物件名（去重、保序）。
 *
 * 返回空数组 = 可以导出。调用方只负责把结果变成一句提示，判定留在这里以便单测。
 *
 * 写成声明式（flatMap → filter → map）而不是双层 for + continue：这条判定将来还会长出
 * 新的排除项，嵌套分支每加一条就把复杂度顶到棘轮线上（这个目录的基线是 0）。
 */
export function missingDecorationNames(floors: FloorLike[] | null | undefined, issues: IssueLike[]): string[] {
  const failed = failedDecorationAssetIds(issues)
  if (!failed.size) return []
  const items = (floors || []).flatMap((floor) => floor?.scene?.items || [])
  const names = items
    .filter((item) => item?.type === 'user-decoration' && failed.has(String(item.assetId || '').toLowerCase()))
    .map(decorationNameOf)
  return [...new Set(names)]
}

/** 物件名缺省时给一个可读占位，避免提示里出现「：。请检查」。 */
function decorationNameOf(item: { name?: string }): string {
  return String(item.name || '').trim() || '未命名装饰'
}

/**
 * 导出文件夹名校验。
 *
 * 从 `generateExportBundle` 里抽出来的：那个函数已经很复杂，
 * 再往里加一条 `||` 会让导出流程更难读。校验规则本身（控制字符 / 保留字符 / 隐藏文件 / 末尾点号）
 * 与上游一致，只是搬了个位置。
 *
 * @returns 非法时返回给用户看的文案，合法返回 `null`。
 */
export function exportFolderNameError(rawFolderName: string): string | null {
  const folderName = rawFolderName.trim()
  if (!folderName) return '请输入有效的文件夹名'
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 导出名校验：控制字符属于必须拒绝的非法文件名范围
  if (/[<>:"/\\|?*\x00-\x1f\x7f]/.test(folderName)) return '请输入有效的文件夹名'
  if (folderName.startsWith('.')) return '请输入有效的文件夹名'
  if (/[. ]$/.test(folderName)) return '请输入有效的文件夹名'
  return null
}
