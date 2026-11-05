import { inject, isReactive, isRef, toRef } from 'vue'
import { PROFILES_KEY } from './context'

/**
 * 从档案面板上下文里取需要的数据。
 *
 * 上下文由 ``useProfilesPanel`` 提供，值是 ref / 函数 / Pinia store 三种形态：
 * - ref：原样返回，调用方自行 `.value` 或在模板里自动解包；
 * - 函数：原样返回；
 * - **reactive 对象（Pinia store）：必须原样返回**。以前一律套 ``toRef``，store 会被
 *   包成 ``Ref<Store>``——模板里还能自动解包，但 ``<script setup>`` 里的
 *   ``store.availableProfiles`` 直接是 undefined（例如「方案流程」摘要永远显示
 *   `0 个方案 · --`，与列表里的真实数量对不上）。
 * - 其余标量：用 ``toRef`` 保持响应性。
 *
 * 取不到的键会在开发环境直接报错：这个「字符串键列表 + 解构」的写法只要漏写一个键，
 * 模板里就会退化成 ``Property "xxx" was accessed during render but is not defined``
 * 的运行时警告，而页面只是少一块内容、很难定位。宁可启动时就炸。
 *
 * @param keys 需要从上下文中取出的键
 * @returns 键到值（ref / store / 函数）的映射
 */
export function useProfilesSection(keys: string[]) {
  const ctx = inject(PROFILES_KEY)
  if (!ctx) throw new Error('缺少配置文件上下文')
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const v = (ctx as Record<string, unknown>)[key]
    if (!import.meta.env.PROD && !Object.hasOwn(ctx, key)) {
      console.error(
        `[profiles] useProfilesSection 请求了上下文中不存在的键 "${key}"：` +
          '检查 useProfilesPanel 的返回值，或本组件 keys 列表是否拼错。',
      )
    }
    out[key] = isRef(v) || isReactive(v) || typeof v === 'function' ? v : toRef(ctx as Record<string, unknown>, key)
  }
  return out
}
