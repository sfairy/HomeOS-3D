/**
 * Agent 会话上下文存储（内存 LRU + TTL）。
 *
 * 所属模块：backend/modules/agent
 * 职责：为「连续对话」提供服务端会话上下文——前端在唤醒后一段时间内免重复唤醒，
 *  后续指令携带同一 sessionId，本服务按会话保存多轮 user/assistant 历史，
 *  使 LLM 能基于上一轮的实体 / 意图补全当前指令（如「开灯」后「再调暗一点」）。
 * 清理策略：
 *  - TTL：会话超过 SESSION_TTL_MS（10 分钟）未活动即视为过期，读取 / 写入时惰性清理；
 *  - LRU：会话数超过 MAX_SESSIONS 时淘汰最久未使用的会话；
 *  - 单会话历史最多保留 MAX_TURNS 条，避免上下文无限膨胀。
 * 依赖：RedisService（重启/Leader 切换后恢复会话上下文）。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../shared/redis/service';
import { getErrorMessage } from '../../common/utils';

/** 单条会话历史（与 ChatHistoryItemDto 对齐，供 AgentService 直接透传给 LLM） */
type AgentSessionTurn = {
  role: 'user' | 'assistant';
  content: string;
};

/** 会话上下文条目 */
interface AgentSessionEntry {
  /** 多轮历史（不含当前轮） */
  history: AgentSessionTurn[];
  /** 最近一次活动时间戳（ms），用于 TTL 与 LRU 淘汰 */
  lastAt: number;
}

/** 会话数量上限，超过后按 LRU 淘汰 */
const MAX_SESSIONS = 200;
/** 会话上下文有效期（10 分钟）：免唤醒窗口结束后后端仍保留一段时间供 LLM 引用 */
const SESSION_TTL_MS = 10 * 60_000;
/** 单会话保留的历史条数上限（与 LLM 上下文截取上限一致） */
const MAX_TURNS = 16;

/**
 * Agent 会话上下文存储服务（@Injectable）。
 * 通过 get / pushTurn / clear 管理「sessionId → 多轮历史」映射。
 */
@Injectable()
export class AgentSessionStoreService implements OnModuleInit {
  private readonly logger = new Logger(AgentSessionStoreService.name);
  /** 会话表：Map 迭代顺序即插入顺序，配合 lastAt 实现 LRU 淘汰 */
  private readonly sessions = new Map<string, AgentSessionEntry>();
  /** 会话持久化 Redis 键 */
  private static readonly SESSIONS_KEY = 'homeos:agent:sessions';

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    await this.restore();
  }

  /** 从 Redis 恢复会话（过滤过期 / 无效条目） */
  private async restore(): Promise<void> {
    try {
      const raw = await this.redis.get(AgentSessionStoreService.SESSIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, AgentSessionEntry>;
      const now = Date.now();
      for (const [id, entry] of Object.entries(parsed)) {
        if (
          id &&
          entry &&
          Array.isArray(entry.history) &&
          Number.isFinite(entry.lastAt) &&
          now - entry.lastAt <= SESSION_TTL_MS
        ) {
          this.sessions.set(id, {
            history: entry.history.slice(-MAX_TURNS),
            lastAt: entry.lastAt,
          });
        }
      }
      if (this.sessions.size > 0) {
        this.logger.log(`已恢复 Agent 会话上下文: ${this.sessions.size} 个`);
      }
    } catch (err) {
      this.logger.debug(`恢复 Agent 会话上下文失败: ${getErrorMessage(err)}`);
    }
  }

  /** 将有效会话写入 Redis（TTL 48h 兜底，写入前清理过期条目） */
  private persist(): void {
    this.purgeExpired();
    void this.redis
      .set(
        AgentSessionStoreService.SESSIONS_KEY,
        JSON.stringify(Object.fromEntries(this.sessions)),
        48 * 3600,
      )
      .catch((err) => this.logger.debug(`Agent 会话持久化失败: ${getErrorMessage(err)}`));
  }

  /**
   * 读取会话历史（惰性清理过期会话）。
   * @param sessionId 会话 ID（前端连续对话生成）
   * @returns 该会话的历史（截取最近 MAX_TURNS 条），无会话时返回空数组
   */
  get(sessionId: string): AgentSessionTurn[] {
    if (!sessionId) return [];
    this.purgeExpired();
    const entry = this.sessions.get(sessionId);
    if (!entry) return [];
    entry.lastAt = Date.now();
    // 刷新 LRU 顺序：删除后重新插入，使其成为最新
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, entry);
    return entry.history.slice(-MAX_TURNS);
  }

  /**
   * 记录一轮对话（用户消息 + 管家回复摘要），并滚动更新会话时间。
   * @param sessionId 会话 ID
   * @param userMessage 用户本轮原话
   * @param assistantContent 管家回复摘要（回复文本或工具执行摘要，可为空）
   */
  pushTurn(
    sessionId: string,
    userMessage: string,
    assistantContent?: string | null,
  ): void {
    if (!sessionId) return;
    this.purgeExpired();
    let entry = this.sessions.get(sessionId);
    if (!entry) {
      // 会话数超限：淘汰最久未使用的会话（Map 首项即最早插入）
      if (this.sessions.size >= MAX_SESSIONS) {
        const oldestKey = this.sessions.keys().next().value as string | undefined;
        if (oldestKey) {
          this.sessions.delete(oldestKey);
          this.logger.log(`会话数量超限,淘汰最久未使用会话: ${oldestKey}`);
        }
      }
      entry = { history: [], lastAt: Date.now() };
      this.sessions.set(sessionId, entry);
    }
    entry.lastAt = Date.now();
    entry.history.push({ role: 'user', content: userMessage });
    if (assistantContent?.trim()) {
      entry.history.push({ role: 'assistant', content: assistantContent.trim() });
    }
    // 超限截断：仅保留最近 MAX_TURNS 条
    if (entry.history.length > MAX_TURNS) {
      entry.history = entry.history.slice(-MAX_TURNS);
    }
    this.persist();
  }

  /** 删除指定会话（对应「清除记忆」口令 / 前端结束连续对话时） */
  clear(sessionId: string): void {
    if (!sessionId) return;
    this.sessions.delete(sessionId);
    this.persist();
  }

  /** 当前会话数量 */
  get size(): number {
    return this.sessions.size;
  }

  /** 惰性清理过期会话（每次读取 / 写入前调用） */
  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessions) {
      if (now - entry.lastAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
