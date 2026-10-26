/**
 * 依赖容器绑定器：把「第一参数是 deps 的实现函数」绑定成对外同形的函数。
 *
 * 编辑器早期把整个引导脚本塞进 `home.ts`，实现搬到 `home/functions/*` 之后，每一项都留下了
 * 一行手写转发包装：
 *
 * ```ts
 * function refreshEditorViewportFit(...args: any[]): ReturnType<typeof refreshEditorViewportFitImpl> {
 *   return (refreshEditorViewportFitImpl as any)(shellControlsDeps(), ...args);
 * }
 * ```
 *
 * 355 条这种东西的问题不是行数，而是 `as any`：它把「实现函数的首参到底是不是这个 deps」
 * 和「后面还能收几个参数」全盖住了 —— 参数顺序写错、deps 类型对不上，编译器都不会说话。
 *
 * 改成 `bindDeps(depsFactory)({ name: nameImpl })` 之后：
 * - deps 容器在引导时构造一次（每次调用仍延迟求值，读到的永远是当前状态）；
 * - 对外函数的名字 / 参数 / 返回值全部由实现函数推导，`as any` 消失；
 * - 绑定表本身就是「哪个函数属于哪个 deps 域」的清单，拆分时可以直接搬走。
 *
 * 注意：绑定结果是**箭头函数**（没有 `this`），与原来的转发包装语义一致 —— 旧包装也是转发，
 * 从来没有把 `this` 透传给实现。
 */

/** 把 M 里每个「deps 首参实现」映射成「去掉 deps 的同形函数」。 */
type BoundDeps<M> = {
  [K in keyof M]: M[K] extends (deps: never, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
}

/** 运行期只关心「能接收 deps + 任意实参」，具体形状由 `BoundDeps` 在类型层给出。 */
type LooseImpl<D> = (deps: D, ...args: never[]) => unknown

/**
 * 生成一个「deps 域绑定器」。
 *
 * @param getDeps 每次调用时取当前 deps 快照的工厂（保持旧包装的「延迟读取」语义）
 * @returns 接受实现表、返回同形绑定函数的函数
 */
export function bindDeps<D>(getDeps: () => D) {
  return <M extends Record<string, (deps: D, ...args: never[]) => unknown>>(
    impls: M,
  ): BoundDeps<M> => {
    const bound: Record<string, (...args: never[]) => unknown> = {}
    for (const key of Object.keys(impls) as (keyof M & string)[]) {
      const impl = impls[key] as unknown as LooseImpl<D>
      bound[key] = (...args: never[]) => impl(getDeps(), ...args)
    }
    return bound as unknown as BoundDeps<M>
  }
}
