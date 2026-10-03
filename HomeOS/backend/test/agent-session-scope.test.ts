/**
 * Agent 会话 key 按登录身份隔离的回归测试。
 *
 * 背景：`sessionId` 由调用方提供且不与用户绑定（HTTP 侧是前端 UUID，MCP 侧是 `mcp:<ip>`）。
 * 不隔离时，同一 NAT 出口下的两个账号、或复用了同一 sessionId 的两个账号会共享上下文窗口：
 * A 刚被反问「是否为您打开书房空调？」，B 随后说「打开吧」就会被消解成 A 的设备。
 * 该 key 同时用于 10 分钟会话存储与 45 秒短时记忆，两侧口径必须一致。
 *
 * 这里直接调用纯函数形式的 `scopeSessionId`（不依赖 this，也不触发 AgentService 的构造注入）。
 */
import { describe, expect, test } from 'bun:test';
import { AgentService } from '../src/modules/agent/service';
import type { AgentActor } from '../src/modules/agent/agent-actor';

/** 以纯函数方式调用私有方法，避免拉起 AgentService 的重依赖构造 */
function scope(options?: { sessionId?: string; actor?: AgentActor }): string | undefined {
  return (
    AgentService.prototype as unknown as {
      scopeSessionId: (o?: { sessionId?: string; actor?: AgentActor }) => string | undefined;
    }
  ).scopeSessionId(options);
}

describe('AgentService.scopeSessionId', () => {
  test('不同用户 + 同一 sessionId → 不同 key（核心隔离保证）', () => {
    const a = scope({ sessionId: 'ui-agent-abc', actor: { userId: 'u1' } });
    const b = scope({ sessionId: 'ui-agent-abc', actor: { userId: 'u2' } });
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
  });

  test('同一用户 + 同一 sessionId → 同一 key（连续对话不受影响）', () => {
    const first = scope({ sessionId: 'ui-agent-abc', actor: { userId: 'u1' } });
    const second = scope({ sessionId: 'ui-agent-abc', actor: { userId: 'u1' } });
    expect(first).toBe(second);
  });

  test('没有 userId 时退回 username，仍能区分不同账号', () => {
    const a = scope({ sessionId: 's', actor: { username: 'alice' } });
    const b = scope({ sessionId: 's', actor: { username: 'bob' } });
    expect(a).not.toBe(b);
  });

  test('完全无身份信息时退化为 anon，与隔离前行为等价', () => {
    expect(scope({ sessionId: 's' })).toBe('anon:s');
    expect(scope({ sessionId: 's', actor: {} })).toBe('anon:s');
  });

  test('未提供 / 空白 sessionId 时不启用会话', () => {
    expect(scope()).toBeUndefined();
    expect(scope({})).toBeUndefined();
    expect(scope({ sessionId: '   ' })).toBeUndefined();
    expect(scope({ sessionId: '', actor: { userId: 'u1' } })).toBeUndefined();
  });

  test('userId 优先于 username', () => {
    expect(scope({ sessionId: 's', actor: { userId: 'u1', username: 'alice' } })).toBe('u1:s');
  });
});
