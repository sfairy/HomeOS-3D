/**
 * geek 三域（automation/scene/script）shell 共用的还原提示合并：
 * 基础文案（陈旧图 / YAML 粗还原 / 普通还原）+ 细粒度 importHints 去重拼接。
 */

export type GeekRestoreHintInput = {
  staleGraph?: boolean
  fromStoredGraph?: boolean
  approximate?: boolean
  importHints?: string[]
}

/** GeekRestoreHintTexts：类型定义，字段语义见声明。 */
export type GeekRestoreHintTexts = {
  /** 陈旧图被忽略时的文案 */
  stale: string
  /** 非 stored 还原且 approximate 且有细粒度 hints */
  approxWithHints: string
  /** 非 stored 还原且 approximate 且无细粒度 hints */
  approxPlain: string
  /** 非 stored 还原且非 approximate 时的兜底文案（scene 域使用） */
  plainRestore?: string
  /** plainRestore 仅在还有细粒度 hints 时输出（scene 行为；默认恒输出） */
  plainRestoreOnlyWithHints?: boolean
  /** 细粒度 hints 仅在非 fromStoredGraph 时输出（automation/script 行为；scene 恒输出） */
  hintsRequireRebuilt?: boolean
}

/** mergeGeekRestoreHint：函数，按签名入参返回处理结果。 */
export function mergeGeekRestoreHint(
  result: GeekRestoreHintInput,
  texts: GeekRestoreHintTexts,
): string {
  const parts: string[] = []
  if (result.staleGraph) {
    parts.push(texts.stale)
  } else if (!result.fromStoredGraph && result.approximate) {
    parts.push(result.importHints?.length ? texts.approxWithHints : texts.approxPlain)
  } else if (
    !result.fromStoredGraph &&
    texts.plainRestore &&
    (!texts.plainRestoreOnlyWithHints || result.importHints?.length)
  ) {
    parts.push(texts.plainRestore)
  }
  const hintsAllowed = !texts.hintsRequireRebuilt || !result.fromStoredGraph
  if (hintsAllowed && result.importHints?.length) {
    for (const h of result.importHints) {
      if (h && !parts.includes(h)) parts.push(h)
    }
  }
  return parts.join('；')
}

/**
 * 将 mergeRestoreHint 的「；」拼接串拆成可扫读列表。
 */
export function splitGeekRestoreHint(hint: string | null | undefined): string[] {
  return String(hint || '')
    .split('；')
    .map((s) => s.trim())
    .filter(Boolean)
}
