import { describe, expect, test } from 'bun:test';
import { resolveRuntimeKvDelegate } from '../src/shared/prisma/runtime-kv.util';

describe('resolveRuntimeKvDelegate', () => {
  test('优先使用 prisma.runtimeKv', () => {
    const direct = { findUnique: async () => null, upsert: async () => null };
    const nested = { findUnique: async () => null, upsert: async () => null };
    expect(resolveRuntimeKvDelegate({ runtimeKv: direct, client: { runtimeKv: nested } })).toBe(
      direct,
    );
  });

  test('Proxy 未转发时回退 prisma.client.runtimeKv', () => {
    const nested = { findUnique: async () => null, upsert: async () => null };
    expect(resolveRuntimeKvDelegate({ client: { runtimeKv: nested } })).toBe(nested);
  });

  test('委托缺失时返回 undefined（避免 prisma.runtimeKv.upsert TypeError）', () => {
    expect(resolveRuntimeKvDelegate({})).toBeUndefined();
    expect(resolveRuntimeKvDelegate({ client: {} })).toBeUndefined();
  });
});
