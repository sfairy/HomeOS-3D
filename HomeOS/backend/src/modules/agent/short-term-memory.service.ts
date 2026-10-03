/**
 * Agent 短时会话记忆服务（纯内存滑窗 + 短 TTL）。
 *
 * 所属模块：backend/modules/agent
 * 职责：为「反问闭环 + 自然语言指代消解」提供极短时的上下文窗口——
 *  当管家上一轮反问「是否为您打开书房空调？」时，用户回答「打开吧 / 好 / 嗯 / 关了吧」，
 *  这些确认短语本身不含设备与房间信息，必须依赖上一轮 assistant 的提问才能消解指代。
 *
 * 与 AgentSessionStoreService 的分工（两者并存，互不替代）：
 *  - AgentSessionStoreService：10 分钟 TTL、最多 16 轮、Redis 持久化，负责长一点的连续对话上下文；
 *  - 本服务：45 秒 TTL、最多 2 轮微型滑窗、纯内存零持久化，专职「最近一次问答」的指代消解，
 *    且不做跨意图复用——快路径 / 缓存命中执行成功后由调用方 clear()，杜绝上一意图污染下一意图。
 *
 * 清理策略：
 *  - TTL：会话超过 SESSION_TTL_MS（45s）未活动即视为过期，读取 / 写入时惰性清理；
 *  - 窗口：单会话最多保留 MAX_TURNS 轮（user + assistant 各一条为 1 轮）；
 *  - 池上限：会话数达 MAX_SESSIONS 时按插入顺序批量淘汰最旧的 CLEANUP_BATCH 个。
 * 依赖：无（不注入 Redis，保持零常驻开销）。
 */
import { Injectable, Logger } from '@nestjs/common';

/** 单条短时记忆消息（与 LLM 消息结构对齐，便于直接透传） */
type ShortTermTurn = {
  role: 'user' | 'assistant';
  content: string;
};

/** 短时记忆会话条目 */
interface ShortTermSession {
  /** 微型滑窗内的消息（按时间正序） */
  messages: ShortTermTurn[];
  /** 最近一次活动时间戳（ms），用于 TTL 判定 */
  lastActive: number;
}

/** 会话有效期：45 秒内的连续对话才认为具备指代关系 */
const SESSION_TTL_MS = 45_000;
/** 单会话最多保留的轮数（1 轮 = 1 条 user + 1 条 assistant） */
const MAX_TURNS = 2;
/** 会话池上限 */
const MAX_SESSIONS = 200;
/** 池满时一次性淘汰的会话数（按插入顺序取最旧） */
const CLEANUP_BATCH = 30;

/**
 * 短时会话记忆服务（@Injectable）。
 * 通过 getHistory / appendTurn / clear 管理「sessionId → 最近 2 轮问答」的微型滑窗。
 */
@Injectable()
export class AgentShortTermMemoryService {
  private readonly logger = new Logger('ShortTermMemory');
  /** 会话表：Map 迭代顺序即插入顺序，池满时据此批量淘汰最旧会话 */
  private readonly sessions = new Map<string, ShortTermSession>();

  /**
   * 读取会话的短时历史（惰性清理过期会话）。
   * @param sessionId 会话 ID，缺省 default
   * @returns 滑窗内的消息列表（无会话或已过期时返回空数组）
   */
  getHistory(sessionId = 'default'): ShortTermTurn[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    const now = Date.now();
    if (now - session.lastActive > SESSION_TTL_MS) {
      this.logger.log(
        `短时会话超时(${Math.round((now - session.lastActive) / 1000)}s > 45s)，自动重置: session="${sessionId}"`,
      );
      this.sessions.delete(sessionId);
      return [];
    }
    // 读取也刷新 LRU 次序：长期活跃的会话不会因为「插入得早」而被批量淘汰
    this.touch(sessionId, session);
    return session.messages.map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * 把已存在的 key 移到 Map 末尾（`set` 已存在的 key 不改变迭代顺序，故需先 delete）。
   * @param sessionId 会话 ID
   * @param session 会话条目
   */
  private touch(sessionId: string, session: ShortTermSession): void {
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, session);
  }

  /**
   * 池满时腾出配额：先清过期会话，仍不足再按 LRU 淘汰最旧的一批。
   *
   * 顺序很重要——不能直接按插入顺序淘汰：Map 迭代顺序是「首次插入」而非「最近活跃」，
   * 直接 slice(0, N) 会把整轮对话里持续活跃的那个会话（例如 MCP 的 mcp:<ip>）连同窗口一起删掉，
   * 而它恰恰正是「反问 → 用户回『打开吧』」最需要保住上下文的会话。
   */
  private evictIfNeeded(): void {
    if (this.sessions.size < MAX_SESSIONS) return;
    const now = Date.now();
    let expired = 0;
    for (const [key, session] of this.sessions) {
      if (now - session.lastActive > SESSION_TTL_MS) {
        this.sessions.delete(key);
        expired += 1;
      }
    }
    if (this.sessions.size < MAX_SESSIONS) {
      this.logger.log(`短时会话池满(${MAX_SESSIONS})，清理过期会话 ${expired} 个`);
      return;
    }
    const lruKeys = Array.from(this.sessions.keys()).slice(0, CLEANUP_BATCH);
    lruKeys.forEach((k) => this.sessions.delete(k));
    this.logger.log(
      `短时会话池满(${MAX_SESSIONS})，清过期 ${expired} 个后仍不足，按 LRU 淘汰 ${CLEANUP_BATCH} 个最旧会话`,
    );
  }

  /**
   * 追加一轮问答（user + assistant 各一条），超出滑窗时截断最旧消息。
   * @param sessionId 会话 ID，缺省 default
   * @param userText 本轮用户输入
   * @param assistantText 本轮管家回复（反问句也需记录，供下一轮消解指代）
   */
  appendTurn(sessionId = 'default', userText: string, assistantText: string): void {
    const cleanUser = String(userText ?? '').trim();
    const cleanAssistant = String(assistantText ?? '').trim();
    // 空回复（如纯执行成功且不朗读）不入窗，避免污染上下文
    if (!cleanUser || !cleanAssistant) return;

    if (this.sessions.size >= MAX_SESSIONS) this.evictIfNeeded();

    const now = Date.now();
    let session = this.sessions.get(sessionId);
    if (!session || now - session.lastActive > SESSION_TTL_MS) {
      session = { messages: [], lastActive: now };
      this.sessions.set(sessionId, session);
    } else {
      // 活跃会话移到末尾，保证淘汰时优先命中真正的冷会话
      this.touch(sessionId, session);
    }
    session.lastActive = now;
    session.messages.push({ role: 'user', content: cleanUser });
    session.messages.push({ role: 'assistant', content: cleanAssistant });

    const maxMessages = MAX_TURNS * 2;
    if (session.messages.length > maxMessages) {
      session.messages = session.messages.slice(session.messages.length - maxMessages);
    }
  }

  /**
   * 清空会话短时记忆。
   * 用于「快路径 / 缓存命中执行成功」后重置上下文，以及用户主动清除记忆的场景，
   * 防止已完成的独立意图继续影响下一轮指代消解。
   * @param sessionId 会话 ID，缺省 default
   */
  clear(sessionId = 'default'): void {
    if (this.sessions.delete(sessionId)) {
      this.logger.log(`已清空短时记忆: session="${sessionId}"`);
    }
  }
}
