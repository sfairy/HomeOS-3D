/**
 * geek 三域（automation/scene/script）decompile 共用的「已存图指纹校验」骨架。
 * 三分支：digest 命中 / 无 yaml 沿用 / 无 digest 时 compile 反推指纹匹配；
 * 均未命中返回 null，由调用方落入 YAML 还原路径。
 */

export type GeekStoredGraphResolverArgs<G, R> = {
  /** normalize 后的已存图；null 直接落入 YAML 还原 */
  stored: G | null
  /** trim 后的 yaml 文本 */
  yamlText: string
  /** yaml 指纹函数（域各自注入） */
  fingerprint: (yaml: string) => string
  readDigest: (graph: G) => string
  writeDigest: (graph: G, digest: string) => void
  /** digest 命中时构建返回结果（域附加 meta/entities 合并等在此做） */
  onDigestMatch: (stored: G) => R
  /** 无 yaml 时构建返回结果；返回 undefined 视为不匹配（如 scene entities 指纹不符） */
  onNoYamlMatch: (stored: G) => R | undefined
  /** 无 digest 且有 yaml 时 compile 反推；不传则该分支直接落入 YAML 还原（automation） */
  compileStoredToYaml?: (stored: G) => string
  /** compile 反推指纹命中时构建返回结果（骨架已先写回 digest）；与 compileStoredToYaml 成对传入 */
  onCompiledMatch?: (stored: G) => R
}

/** resolveStoredGeekGraph：函数，按签名入参返回处理结果。 */
export function resolveStoredGeekGraph<G, R>(args: GeekStoredGraphResolverArgs<G, R>): R | null {
  const { stored, yamlText, fingerprint } = args
  if (!stored) return null

  const digest = args.readDigest(stored)
  if (digest && yamlText) {
    if (fingerprint(yamlText) === digest) return args.onDigestMatch(stored)
    // 陈旧图：落入 YAML 还原
    return null
  }
  if (!yamlText) {
    // 无 yaml：只能沿用已存图（域可校验附加指纹，不匹配则返回 undefined）
    return args.onNoYamlMatch(stored) ?? null
  }
  // 无 digest 且有 yaml：compile 反推指纹校验（compile 与命中回调需成对传入）
  if (!args.compileStoredToYaml || !args.onCompiledMatch) return null
  try {
    const compiled = args.compileStoredToYaml(stored)
    if (fingerprint(compiled) === fingerprint(yamlText)) {
      args.writeDigest(stored, fingerprint(yamlText))
      return args.onCompiledMatch(stored)
    }
  } catch {
    /* 落入 YAML 还原 */
  }
  return null
}
