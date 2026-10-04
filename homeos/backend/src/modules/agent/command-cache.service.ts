/**
 * 指令缓存服务（学习式）。
 *
 * 职责：把“用户原话 → 工具调用”的映射缓存起来，下次同句直接命中执行，跳过 LLM 调用。
 *  采用“二次确认”策略：LLM 学到的指令需再次命中相同映射才标记为 confirmed；
 *  快路径学到的指令默认 confirmed（规则可信）。
 *  支持用户纠正（“不对/学错了”）删除最近一条，以及 30 秒窗口内同房间重新操作的自动纠正。
 * 依赖：RedisService（重启后恢复学过的指令）。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../shared/redis/service';
import { getErrorMessage } from '../../common/utils';

/** 缓存条目上限，超过则按 FIFO 清理一批旧条目 */
const MAX_SIZE = 500;
/** 触发清理时一次删除的条目数 */
const CLEANUP_SIZE = 50;
/** 自动纠正的时间窗口：最近一次操作后 30 秒内同房间重做视为纠正 */
const CORRECTION_WINDOW = 30_000;

/** 缓存条目：工具名 + 参数 + 命中次数 + 是否已确认 */
interface CacheEntry {
  toolName: string;
  toolArgs: Record<string, unknown>;
  hitCount: number;
  confirmed: boolean;
}

/** 最近一次操作的快照，用于纠正 / 自动纠正判定 */
interface LastAction {
  /** 操作时间戳（ms） */
  timestamp: number;
  /** 用户原话（未规范化） */
  rawText: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  /** 操作者用户 ID（纠正逻辑按用户隔离） */
  userId?: string;
}

/** 未登录 / 匿名场景的兜底缓存命名空间 */
const ANONYMOUS_SCOPE = 'global';

/**
 * 指令缓存服务（@Injectable）。
 * 通过 get / set / correctLast / tryAutoCorrect / clear 管理“原话 → 工具”映射。
 * 缓存按用户 ID 隔离：同一原话在不同用户账户下独立学习 / 命中，避免共享串号。
 */
@Injectable()
export class CommandCacheService implements OnModuleInit {
  private readonly logger = new Logger('CmdCache');
  /** 原话规范化后的缓存表 */
  private readonly cache = new Map<string, CacheEntry>();
  /** 最近一次操作，用于纠正逻辑 */
  private lastAction: LastAction | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly REDIS_KEY = 'homeos:agent:cmd-cache';

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    await this.restore();
  }

  private async restore(): Promise<void> {
    try {
      const raw = await this.redis.get(CommandCacheService.REDIS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        entries?: Record<string, CacheEntry>;
        lastAction?: LastAction | null;
      };
      if (parsed.entries && typeof parsed.entries === 'object') {
        for (const [key, entry] of Object.entries(parsed.entries)) {
          if (key && entry?.toolName) this.cache.set(key, entry);
        }
      }
      if (parsed.lastAction?.rawText) this.lastAction = parsed.lastAction;
      if (this.cache.size > 0) {
        this.logger.log(`已恢复指令缓存: ${this.cache.size} 条`);
      }
    } catch (err) {
      this.logger.debug(`恢复指令缓存失败: ${getErrorMessage(err)}`);
    }
  }

  private persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.redis
        .set(
          CommandCacheService.REDIS_KEY,
          JSON.stringify({
            entries: Object.fromEntries(this.cache),
            lastAction: this.lastAction,
          }),
          7 * 24 * 3600,
        )
        .catch((err) => this.logger.debug(`指令缓存持久化失败: ${getErrorMessage(err)}`));
    }, 200);
  }

  /** 用户级缓存 key：scope::原话，未提供用户时退化为全局命名空间 */
  private keyOf(text: string, userId?: string): string {
    const scope = userId?.trim() || ANONYMOUS_SCOPE;
    return `${scope}::${this.normalize(text)}`;
  }

  /**
   * 查询缓存。返回命中的条目（含未确认），由调用方检查 confirmed 字段决定是否执行。
   * - 已确认条目：递增 hitCount 并返回。
   * - 未确认条目：原样返回（不递增 hitCount），调用方应提示用户确认而非直接执行。
   * @param text 用户原话
   * @param userId 用户 ID（缓存按用户隔离，缺省用全局命名空间）
   * @returns 命中的缓存条目，或 null
   */
  get(text: string, userId?: string): CacheEntry | null {
    const key = this.keyOf(text, userId);
    const entry = this.cache.get(key);
    if (entry) {
      if (!entry.confirmed) {
        this.logger.log(`缓存命中(待确认): "${key}" → ${entry.toolName}`);
        return entry;
      }
      entry.hitCount++;
      this.logger.log(
        `缓存命中(已确认,第${entry.hitCount}次): "${key}" → ${entry.toolName}(${JSON.stringify(entry.toolArgs)})`,
      );
      this.persist();
    }
    return entry ?? null;
  }

  /**
   * 将指定原话对应的缓存条目提升为已确认状态。
   * 用于缓存命中待确认条目后，经用户确认（再说一次）时提升为已确认，下次相同指令直接执行。
   * @param text 用户原话
   * @param userId 用户 ID
   * @returns true 表示成功提升；false 表示条目不存在或已确认
   */
  confirm(text: string, userId?: string): boolean {
    const key = this.keyOf(text, userId);
    const entry = this.cache.get(key);
    if (entry && !entry.confirmed) {
      entry.confirmed = true;
      this.logger.log(`缓存已确认(用户再说一次确认): "${key}"`);
      this.persist();
      return true;
    }
    return false;
  }

  /**
   * 写入缓存。若与已有条目完全一致且未确认，则提升为 confirmed（二次验证通过）。
   * @param text 用户原话
   * @param toolName 工具名
   * @param toolArgs 工具参数
   * @param fromFastPath 是否来自快路径（快路径默认 confirmed）
   * @param userId 用户 ID（按用户隔离学习）
   */
  set(
    text: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    fromFastPath: boolean,
    userId?: string,
  ): void {
    if (this.cache.size >= MAX_SIZE) {
      const keys = Array.from(this.cache.keys()).slice(0, CLEANUP_SIZE);
      keys.forEach((k) => this.cache.delete(k));
      this.logger.log(`缓存满(${MAX_SIZE}),清理了${CLEANUP_SIZE}条`);
    }
    const key = this.keyOf(text, userId);
    const existing = this.cache.get(key);
    const isSame =
      existing &&
      existing.toolName === toolName &&
      JSON.stringify(existing.toolArgs) === JSON.stringify(toolArgs);

    if (existing && isSame && !existing.confirmed) {
      existing.confirmed = true;
      existing.hitCount++;
      this.logger.log(`缓存自动确认(二次验证通过): "${key}"`);
    } else {
      this.cache.set(key, {
        toolName,
        toolArgs,
        hitCount: existing && isSame ? existing.hitCount + 1 : 0,
        confirmed: fromFastPath,
      });
      if (!existing) {
        this.logger.log(
          `缓存学习(${fromFastPath ? '快路径·已确认' : 'LLM·待确认'}): "${key}" → ${toolName}`,
        );
      }
    }

    this.lastAction = {
      timestamp: Date.now(),
      rawText: text,
      toolName,
      toolArgs: { ...toolArgs },
      userId: userId?.trim() || undefined,
    };
    this.persist();
  }

  /**
   * 用户主动纠正：删除最近一条缓存并返回其原话，供上层用新指令重新执行。
   * 仅影响当前用户最近的缓存条目，避免误删其他用户的记录。
   * @param userId 用户 ID
   * @returns 被删除条目的原话，或 null（无最近操作 / 未命中缓存）
   */
  correctLast(userId?: string): string | null {
    if (!this.lastAction) return null;
    if (userId?.trim() && this.lastAction.userId && this.lastAction.userId !== userId.trim()) {
      return null;
    }
    const rawText = this.lastAction.rawText;
    const key = this.keyOf(rawText, this.lastAction.userId);
    const deleted = this.cache.delete(key);
    this.logger.log(`用户纠正: ${deleted ? '已删除' : '无缓存'} "${key}"`);
    this.lastAction = null;
    this.persist();
    return deleted ? rawText : null;
  }

  /**
   * 自动纠正：30 秒内对同房间 / 同类型重新操作时，删除旧的错误缓存。
   * 触发条件：在 CORRECTION_WINDOW 内、同工具名、但参数不同。
   * @param text 当前用户原话
   * @param toolName 当前工具名
   * @param toolArgs 当前工具参数
   * @param userId 用户 ID（纠正限定在同一用户）
   * @returns true 表示触发了自动纠正
   */
  tryAutoCorrect(
    text: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    userId?: string,
  ): boolean {
    if (!this.lastAction) return false;
    if (userId?.trim() && this.lastAction.userId && this.lastAction.userId !== userId.trim()) {
      return false;
    }
    if (Date.now() - this.lastAction.timestamp > CORRECTION_WINDOW) return false;
    if (toolName !== this.lastAction.toolName) return false;
    const same = JSON.stringify(toolArgs) === JSON.stringify(this.lastAction.toolArgs);
    if (!same) {
      const prevKey = this.keyOf(this.lastAction.rawText, this.lastAction.userId);
      this.cache.delete(prevKey);
      this.logger.log(`自动纠正: 30s内重新操作同房间/同类型,删除旧缓存 "${prevKey}"`);
      this.persist();
      return true;
    }
    return false;
  }

  /** 删除指定原话对应的缓存（用于缓存执行失败后清理），按用户隔离 */
  delete(text: string, userId?: string): void {
    this.cache.delete(this.keyOf(text, userId));
    this.persist();
  }

  /** 当前缓存条目数 */
  get size(): number {
    return this.cache.size;
  }

  /** 清空指定用户（或全部）缓存与最近操作记录（对应“清除记忆”口令） */
  clear(userId?: string): void {
    const scope = userId?.trim() || ANONYMOUS_SCOPE;
    if (scope === ANONYMOUS_SCOPE) {
      const count = this.cache.size;
      this.cache.clear();
      this.lastAction = null;
      this.logger.log(`缓存已清空(${count}条)`);
      this.persist();
      return;
    }
    let removed = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(`${scope}::`)) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (this.lastAction?.userId === scope) this.lastAction = null;
    this.logger.log(`用户 [${scope}] 缓存已清空(${removed}条)`);
    this.persist();
  }

  /**
   * 规范化原话为缓存 key：去空白 / 去语气词 / 去修饰词，
   *  让“帮我把客厅的灯打开一下”与“客厅灯打开”命中同一缓存。
   */
  private normalize(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[的吗了呢啊哦呀呗]+/g, '')
      .replace(/一下|一点|所有|全部|整个|都|掉/g, '');
  }
}