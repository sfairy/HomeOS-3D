/**
 * `bun:test` 的最小环境声明 —— 只覆盖本目录两个 `*.test.ts` 用到的面。
 *
 * 为什么不直接装 `@types/bun`（ADR-0001 的 P3-b 原话是「加 `@types/bun`」）：
 *
 * 1. `@types/bun` 会把 `Bun` 全局、`process`、`Buffer` 等一整套运行时类型注入 `types` 数组；
 *    本仓库的 `homeos/frontend/tsconfig.json` 目前只声明 `["vite/client"]`，引入后与
 *    `@types/node`（根 `tsconfig.node.json` 用）存在全局重名风险，属于「为了两个测试文件
 *    改全局类型环境」。
 * 2. `homeos/frontend/scripts/**` **不在任何 typecheck project 里**（`tsconfig.json` 的
 *    `include` 只到 `src/**`，根 `tsconfig.node.json` 只含 vite 配置）—— 也就是说这两个文件
 *    的 `bun:test` 类型只影响**编辑器体验**，不值得为此新增依赖。
 *
 * 所以这里写一份**只声明实际用到的那部分**的本地声明：`test` / `test.each` / `expect` /
 * `beforeEach`。断言方法只声明用到的那几个（`toBe` / `toBeNull` / `toBeUndefined` / `toThrow`），
 * 缺哪个就补哪个 —— 保持「声明面 = 使用面」，而不是抄一份 expect 的 API。
 *
 * 真要让它们进类型检查，正确动作是单开 `tsconfig.scripts.json` 并把 7 个脚本式冒烟一起纳入，
 * 那是一次独立改造（会先把既有脚本的类型问题全部暴露出来），不塞进本次迁移。
 */
declare module 'bun:test' {
  /** 断言对象；第二个参数是失败时打印的说明（bun 的扩展签名）。 */
  interface Matchers {
    toBe(expected: unknown): void
    toBeNull(): void
    toBeUndefined(): void
    toThrow(): void
  }

  type Expect = (actual: unknown, message?: string) => Matchers

  /** 用例体；支持 async，返回 Promise 时 runner 会等待。 */
  type TestBody = () => void | Promise<void>

  interface TestFn {
    (name: string, body: TestBody): void
    /** 参数化：`test.each([[label, arg], …])('…%s', (label, arg) => {})`。 */
    each(cases: readonly (readonly unknown[])[]): (name: string, body: (...args: never[]) => void | Promise<void>) => void
  }

  export const test: TestFn
  export const expect: Expect
  export function beforeEach(body: TestBody): void
}
