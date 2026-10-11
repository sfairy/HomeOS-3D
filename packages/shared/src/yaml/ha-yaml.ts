/**
 * @file ha-yaml.ts
 * @module @homeos/shared/yaml
 * @brief Home Assistant YAML 解析 / 序列化统一入口（前后端单一真相源）。
 *
 * 职责：
 *  - 统一 HA YAML 的 schema（YAML 1.1，保留 !!merge 等标签）与 dump 选项；
 *  - 提供安全加载：解析失败返回 null（不抛异常），避免上层未捕获。
 *
 * 关键依赖：
 *  - js-yaml：load / dump / YAML11_SCHEMA；
 *  - 自动化 / 脚本 / 场景 YAML 解析（orchestrator/*）、家电模板（template/*）共用本模块。
 *
 * 约定：
 *  - 必须保留 YAML 1.1：HA 自身配置仍依赖 !!merge（anchor 合并）；
 *  - dump 时 lineWidth 120 与 HA 风格对齐，避免长字段被强制换行。
 */
import { dump, load, YAML11_SCHEMA } from 'js-yaml';

/**
 * Home Assistant YAML schema：保留 1.1 标签（含 !!merge）以兼容自动化 / 脚本配置。
 */
export const HA_YAML_SCHEMA = YAML11_SCHEMA;

/** 加载 YAML 时的统一选项（仅注入 schema，其余走 js-yaml 默认） */
export const HA_YAML_LOAD_OPTS = { schema: HA_YAML_SCHEMA } as const;

/**
 * 序列化 YAML 时的统一选项。
 * - schema：与 load 一致，确保往返一致；
 * - lineWidth 120：与 HA 风格对齐，避免长字段被强制换行。
 */
export const HA_YAML_DUMP_OPTS = {
  schema: HA_YAML_SCHEMA,
  lineWidth: 120,
} as const;

/**
 * 解析 YAML 字符串（不抛异常由调用方处理）。
 *
 * @param yamlStr YAML 文本
 * @returns 解析结果（可能为对象 / 数组 / 字符串 / 数字 / null）
 */
export function loadHaYaml(yamlStr: string): unknown {
  return load(yamlStr, HA_YAML_LOAD_OPTS);
}

/**
 * 安全加载 YAML 并要求顶层为对象。
 *
 * @param yamlStr YAML 文本
 * @returns 顶层对象；解析失败或非对象（数组 / 标量）时返回 null
 *
 * 调用场景：自动化 / 模板等期望根为 mapping 的 YAML 文件加载。
 */
export function loadHaYamlObject(yamlStr: string): Record<string, unknown> | null {
  try {
    const parsed = loadHaYaml(yamlStr);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 将对象序列化为 YAML 字符串。
 *
 * @param obj     待序列化对象
 * @param options 额外 dump 选项（与 HA_YAML_DUMP_OPTS 合并，调用方可覆盖）
 * @returns YAML 文本
 */
export function dumpHaYaml(obj: unknown, options?: Parameters<typeof dump>[1]): string {
  return dump(obj, { ...HA_YAML_DUMP_OPTS, ...options });
}
