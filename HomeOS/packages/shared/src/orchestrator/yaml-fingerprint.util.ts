/**
 * @file yaml-fingerprint.util.ts
 * @module @homeos/shared/orchestrator
 * @brief Orchestrator YAML djb2 指纹（automation/scene/script 共用算法，仅前缀不同），前后端单一真相源。
 *
 * 职责：
 *  - 对归一化后的 YAML 文本计算 djb2 指纹（32 位无符号十六进制），用于内置模板安装比对、画布 digest 校验；
 *  - 按联动类型（自动化/场景/脚本）附加不同前缀区分；
 *  - stampGeekGraphYamlDigest 为画布图对象写入 yamlDigest 字段。
 *
 * 关键依赖：
 *  - 后端模板安装服务与画布保存服务共用本指纹，避免 drift；
 *  - index.ts 从本文件再导出四个函数供 backend 与 frontend 调用。
 *
 * 约定：
 *  - YAML 先做 \r\n → \n 统一再 trim，避免跨平台换行差异导致指纹不同；
 *  - 空/undefined YAML 也会返回合法指纹（空串的 djb2 值），不抛异常。
 */

function fingerprintYaml(yaml: string | null | undefined, prefix: string): string {
  const norm = String(yaml || '')
    .replace(/\r\n/g, '\n')
    .trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = (Math.imul(h, 33) ^ norm.charCodeAt(i)) >>> 0;
  }
  return `${prefix}${h.toString(16)}`;
}

/** 自动化 YAML 指纹（前缀 v1_） */
export function fingerprintAutomationYaml(yaml: string | null | undefined): string {
  return fingerprintYaml(yaml, 'v1_');
}

/** 场景 YAML 指纹（前缀 scene_v1_） */
export function fingerprintSceneYaml(yaml: string | null | undefined): string {
  return fingerprintYaml(yaml, 'scene_v1_');
}

/** 脚本 YAML 指纹（前缀 script_v1_） */
export function fingerprintScriptYaml(yaml: string | null | undefined): string {
  return fingerprintYaml(yaml, 'script_v1_');
}

/** 为画布图写入 yamlDigest */
export function stampGeekGraphYamlDigest<T extends { yamlDigest?: string }>(
  graph: T,
  yaml: string | null | undefined,
  kind: 'automation' | 'scene' | 'script' = 'automation',
): T {
  const digest =
    kind === 'scene'
      ? fingerprintSceneYaml(yaml)
      : kind === 'script'
        ? fingerprintScriptYaml(yaml)
        : fingerprintAutomationYaml(yaml);
  return { ...graph, yamlDigest: digest };
}
