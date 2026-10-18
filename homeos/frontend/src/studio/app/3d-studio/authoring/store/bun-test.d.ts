/**
 * 测试类型垫片：仓库生产依赖不引入 bun 类型（tsconfig types 只有 vite/client），
 * 但 src/studio/** 下的 `bun test` 测试文件要 import "bun:test"。
 * 这里只声明测试实际用到的最小面，避免为了测试给整个应用加 bun 全局类型。
 */
declare module "bun:test" {
  type TestCallback = () => void | Promise<void>;
  export interface Matchers {
    toBe(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toMatch(expected: RegExp | string): void;
    toMatchObject(expected: unknown): void;
    toHaveProperty(keyPath: string, value?: unknown): void;
    toBeOneOf(values: unknown[]): void;
    toBeInstanceOf(expected: unknown): void;
    toThrow(expected?: unknown): void;
    readonly not: Matchers;
  }
  export function describe(label: string, callback: TestCallback): void;
  export function it(label: string, callback: TestCallback): void;
  export function test(label: string, callback: TestCallback): void;
  export function beforeEach(callback: TestCallback): void;
  export function afterEach(callback: TestCallback): void;
  export function beforeAll(callback: TestCallback): void;
  export function afterAll(callback: TestCallback): void;
  export function expect(actual: unknown): Matchers;
  export interface MockFunction {
    (...args: unknown[]): any;
    module(moduleName: string, factory: () => unknown): void;
    clearAllMocks(): void;
    restoreAllMocks(): void;
  }
  export const mock: MockFunction;
}