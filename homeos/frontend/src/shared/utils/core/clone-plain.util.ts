/**
 * @module core/clone-plain
 * @description 深拷贝可序列化纯数据工具。
 *
 * 背景与选型：
 *  - 优先 structuredClone(toRaw())，避免 Proxy / 大图 JSON 往返开销；
 *  - 失败时回退 JSON 序列化（兼容不可 clone 的边角值）。
 *  - 仅适用于可被结构化克隆 / JSON 表达的数据（无函数 / Symbol / 循环引用等）。
 *
 * 依赖：vue（toRaw）。
 */
import { toRaw } from 'vue'

/**
 * 深拷贝可序列化纯数据。
 *
 * @param value 待拷贝数据（建议为纯数据 / Vue ref 内部值）
 * @returns 与原值无引用关联的深拷贝；structuredClone 失败时回退 JSON 拷贝
 */
export function clonePlain<T>(value: T): T {
  try {
    return structuredClone(toRaw(value)) as T
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}
