/**
 * @file 异步请求代际守卫 Composable
 * @module composables/ui/useFetchGeneration
 *
 * 职责：
 *  - 维护一个自增的「代际」计数器，用于标识当前有效的请求批次。
 *  - 切换 profile / 实体后通过 bumpGeneration 作废旧代际，使过期响应被识别并丢弃。
 *  - 组件作用域销毁时自动作废当前代际，避免卸载后回调写入已销毁的状态。
 *
 * 依赖：
 *  - vue 的 ref 响应式引用与 onScopeDispose 作用域销毁钩子。
 */
import { ref, onScopeDispose } from 'vue'

/**
 * 异步请求代际守卫：切换 profile/实体后丢弃过期响应。
 *
 * 调用场景：在异步请求发起前获取 token，请求返回后用 isStale(token) 判断是否已过期，
 * 或直接使用 withGeneration 包装异步函数自动处理。
 *
 * @returns generation - 当前代际（响应式）；bumpGeneration - 作废当前代际并返回新 token；isStale - 判断 token 是否过期；withGeneration - 包装异步函数自动处理过期
 */
export function useFetchGeneration() {
  const generation = ref(0)

  /** 作废当前代际并返回新 token（代际自增） */
  function bumpGeneration() {
    generation.value += 1
    return generation.value
  }

  /** 判断给定 token 是否已过期（不等于当前代际即过期） */
  function isStale(token: number) {
    return token !== generation.value
  }

  /**
   * 包装异步函数：调用时获取 token，返回的新函数在结果返回后自动判断是否过期。
   * @param fn - 原始异步（或同步）函数
   * @returns 包装后的函数，返回 { stale, result }；stale 为 true 表示结果已过期（result 为 undefined）
   */
  function withGeneration<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult> | TResult,
  ) {
    const token = bumpGeneration()
    return async (...args: TArgs) => {
      const result = await fn(...args)
      // 代际已变更：丢弃过期结果
      if (isStale(token)) return { stale: true as const, result: undefined }
      return { stale: false as const, result }
    }
  }

  // 组件作用域销毁时作废当前代际，避免卸载后的回调写入已销毁状态
  onScopeDispose(() => {
    generation.value += 1
  })
  return { generation, bumpGeneration, isStale, withGeneration }
}