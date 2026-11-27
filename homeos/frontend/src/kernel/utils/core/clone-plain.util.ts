/** 背景与选型： */
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
