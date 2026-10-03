/**
 * Agent 短时会话记忆（45s TTL / 2 轮滑窗 / 200 会话池）的回归测试。
 *
 * 重点锁死淘汰策略：Map 的迭代顺序是「首次插入」而不是「最近活跃」，
 * 若直接 `keys().slice(0, N)` 淘汰，长期活跃的那个会话（例如 MCP 的 `mcp:<ip>`，
 * 一直待在索引 0）会在池满时被连窗口一起删掉——而它正是「管家反问 → 用户回『打开吧』」
 * 最需要保住上下文的会话。本测试用「交错使用」复现该场景。
 *
 * 同时确认淘汰仍然有界：真正空闲的会话必须被淘汰，不能变成永不回收的内存泄漏。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AgentShortTermMemoryService } from '../src/modules/agent/short-term-memory.service';

const MAX_SESSIONS = 200;
const TTL_MS = 45_000;

const realNow = Date.now.bind(Date);
let clock = realNow();

beforeEach(() => {
  clock = realNow();
  Date.now = () => clock;
});

afterEach(() => {
  Date.now = realNow;
});

describe('AgentShortTermMemoryService', () => {
  test('窗口为 2 轮：超出后只保留最近 4 条消息', () => {
    const svc = new AgentShortTermMemoryService();
    svc.appendTurn('s', '第一问', '第一答');
    svc.appendTurn('s', '第二问', '第二答');
    svc.appendTurn('s', '第三问', '第三答');
    const history = svc.getHistory('s');
    expect(history).toHaveLength(4);
    expect(history.map((m) => m.content)).toEqual(['第二问', '第二答', '第三问', '第三答']);
  });

  test('反问闭环：assistant 的反问句留在窗口里供下一轮消解指代', () => {
    const svc = new AgentShortTermMemoryService();
    svc.appendTurn('s', '打开书房空调', '是否为您打开书房空调？');
    const history = svc.getHistory('s');
    expect(history).toHaveLength(2);
    expect(history[1]).toEqual({ role: 'assistant', content: '是否为您打开书房空调？' });
  });

  test('45s TTL 过期后重置为空', () => {
    const svc = new AgentShortTermMemoryService();
    svc.appendTurn('s', '问', '答');
    expect(svc.getHistory('s')).toHaveLength(2);
    clock += TTL_MS + 1_000;
    expect(svc.getHistory('s')).toHaveLength(0);
  });

  test('空 user / 空 assistant 不入窗', () => {
    const svc = new AgentShortTermMemoryService();
    svc.appendTurn('s', '  ', '答');
    svc.appendTurn('s', '问', '   ');
    expect(svc.getHistory('s')).toHaveLength(0);
  });

  test('clear 后窗口为空', () => {
    const svc = new AgentShortTermMemoryService();
    svc.appendTurn('s', '问', '答');
    svc.clear('s');
    expect(svc.getHistory('s')).toHaveLength(0);
  });

  test('池满后持续活跃的会话仍存活（旧淘汰策略在此失败）', () => {
    const svc = new AgentShortTermMemoryService();
    const active = 'mcp:192.168.31.242';
    svc.appendTurn(active, '打开书房空调', '是否为您打开书房空调？');

    // 活跃会话与大量一次性会话交错，模拟真实使用
    for (let i = 0; i < MAX_SESSIONS * 2; i++) {
      if (i % 50 === 0) svc.appendTurn(active, '打开吧', '好的，已为您打开书房空调。');
      svc.appendTurn(`filler-${i}`, `问${i}`, `答${i}`);
    }

    const history = svc.getHistory(active);
    expect(history.length).toBeGreaterThan(0);
    // 窗口里应保留最近一轮的问答，指代仍可消解
    expect(history[history.length - 2]?.content).toBe('打开吧');
    expect(history[history.length - 1]?.content).toBe('好的，已为您打开书房空调。');
  });

  test('真正空闲的会话会被淘汰（内存有界，不是永不回收）', () => {
    const svc = new AgentShortTermMemoryService();
    svc.appendTurn('idle', '你好', '您好');
    for (let i = 0; i < MAX_SESSIONS * 2; i++) {
      svc.appendTurn(`filler-${i}`, '问', '答');
    }
    expect(svc.getHistory('idle')).toHaveLength(0);
  });

  test('池满时优先清理过期会话，不误伤新会话', () => {
    const svc = new AgentShortTermMemoryService();
    for (let i = 0; i < MAX_SESSIONS; i++) svc.appendTurn(`stale-${i}`, '问', '答');
    // 让已存在的会话全部过期，再写入一个新会话触发池满逻辑
    clock += TTL_MS + 1_000;
    svc.appendTurn('fresh', '新会话', '新回复');

    const history = svc.getHistory('fresh');
    expect(history.map((m) => m.content)).toEqual(['新会话', '新回复']);
  });

  test('会话隔离：一个会话的窗口不会泄漏到另一个会话', () => {
    const svc = new AgentShortTermMemoryService();
    svc.appendTurn('user-a', '开客厅灯', '已打开客厅灯');
    expect(svc.getHistory('user-b')).toHaveLength(0);
    expect(svc.getHistory('user-a')).toHaveLength(2);
  });
});
