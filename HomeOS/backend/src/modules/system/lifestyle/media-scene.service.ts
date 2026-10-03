/**
 * 影音场景服务
 *
 * 模块：system/lifestyle
 * 职责：
 *  - 预设场景（观影 / 音乐 / 派对 / 睡眠 / 关闭）一键应用：调光 + 调音量 + 多房间同步
 *  - 播放列表管理：start / next / getPlaylist，持久化到 appConfig
 *  - 多房间媒体同步：groupSync（join）/ unjoin
 *
 * 依赖：
 *  - HaConnectorService：调用 light / media_player 服务
 *  - AppConfigService：持久化 mediaPlaylists
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HaConnectorService } from '../../ha-connector/service';
import { AppConfigService } from '../../../shared/app-config/service';
import { getErrorMessage } from '../../../common/utils';

/**
 * 影音场景预设 ID：
 *  - movie  观影（灯暗 + 音量 50%）
 *  - music  音乐（灯 60% + 音量 40%）
 *  - party  派对（灯全亮 + 流光 + 音量 70% + 多房间同步）
 *  - sleep  睡眠（暂停媒体 + 关灯）
 *  - gaming / morning 预留
 *  - off    关闭所有媒体设备
 */
type MediaScenePreset = 'movie' | 'music' | 'party' | 'sleep' | 'gaming' | 'morning' | 'off';

/**
 * 播放列表条目
 */
interface PlaylistItem {
  /** 媒体资源 ID（HA play_media 的 media_content_id） */
  mediaContentId: string;
  /** 媒体类型（如 music / video） */
  mediaContentType: string;
  /** 显示标题（可选） */
  title?: string;
}

/**
 * HA 服务调用结果（用于错误聚合）
 */
interface HaActionResult {
  ok: boolean;
  domain: string;
  service: string;
  entityId: string;
  error?: string;
}

/**
 * 影音场景服务
 *
 * 由 SystemLifestyleController 调用，封装灯光 / 媒体播放器的一键场景编排。
 */
@Injectable()
export class MediaSceneService implements OnModuleInit {
  private readonly logger = new Logger(MediaSceneService.name);
  /** 播放器 entity_id → { items, index }，启动时从 appConfig 恢复 */
  private playlists = new Map<string, { items: PlaylistItem[]; index: number }>();

  /**
   * @param haConnector HA 服务调用入口
   * @param appConfig   应用配置（持久化播放列表）
   */
  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * 模块初始化时从 appConfig.mediaPlaylists 恢复播放列表到内存。
   */
  async onModuleInit() {
    const stored = this.appConfig.get('mediaPlaylists');
    for (const [player, pl] of Object.entries(stored)) {
      if (pl?.items?.length) this.playlists.set(player, { items: pl.items, index: pl.index || 0 });
    }
  }

  /**
   * 持久化当前所有播放列表到 appConfig（异步）。
   */
  private async persistPlaylists() {
    const out: Record<string, { items: PlaylistItem[]; index: number }> = {};
    for (const [player, pl] of this.playlists) {
      out[player] = { items: pl.items, index: pl.index };
    }
    await this.appConfig.update({ mediaPlaylists: out });
  }

  /**
   * 列出可选场景预设（含标签 / 是否需要打开播放器）。
   */
  listPresets() {
    return [
      { id: 'movie' as MediaScenePreset, label: '观影', opensPlayer: true },
      { id: 'music' as MediaScenePreset, label: '音乐', opensPlayer: true },
      { id: 'party' as MediaScenePreset, label: '派对', opensPlayer: true },
      { id: 'gaming' as MediaScenePreset, label: '游戏', opensPlayer: true },
      { id: 'morning' as MediaScenePreset, label: '晨间', opensPlayer: false },
      { id: 'sleep' as MediaScenePreset, label: '睡眠', opensPlayer: false },
      { id: 'off' as MediaScenePreset, label: '关闭', opensPlayer: false },
    ];
  }
  /**
   * 应用影音场景预设。
   * 副作用：对 lights / mediaPlayers 批量调用 HA 服务；返回动作摘要与最终播放器状态快照。
   *
   * @param preset            场景 ID
   * @param opts.mediaPlayers 目标播放器（可选，未指定则取全量 media_player）
   * @param opts.lights       目标灯（可选）
   * @returns preset / players / lights / actions / playerStates / errors
   */
  async applyScene(
    preset: MediaScenePreset,
    opts: { mediaPlayers?: string[]; lights?: string[] } = {},
  ) {
    const players = opts.mediaPlayers || (await this.allPlayers());
    const lights = opts.lights || [];
    const actions: string[] = [];
    const errors: HaActionResult[] = [];

    switch (preset) {
      case 'movie':
        // 观影：灯调暗到 10%，媒体音量 50%
        for (const l of lights) {
          const r = await this.safe('light', 'turn_on', l, { brightness_pct: 10 });
          if (!r.ok) errors.push(r);
        }
        for (const p of players) {
          const r = await this.safe('media_player', 'volume_set', p, { volume_level: 0.5 });
          if (!r.ok) errors.push(r);
        }
        actions.push('灯光调暗至10%', '媒体音量50%');
        break;
      case 'music':
        // 音乐：灯 60%，媒体音量 40%
        for (const l of lights) {
          const r = await this.safe('light', 'turn_on', l, { brightness_pct: 60 });
          if (!r.ok) errors.push(r);
        }
        for (const p of players) {
          const r = await this.safe('media_player', 'volume_set', p, { volume_level: 0.4 });
          if (!r.ok) errors.push(r);
        }
        actions.push('灯光60%', '媒体音量40%');
        break;
      case 'party': {
        // 派对：灯全亮 + colorloop 流光，音量 70%，多房间同步
        for (const l of lights) {
          const r = await this.safe('light', 'turn_on', l, {
            brightness_pct: 100,
            effect: 'colorloop',
          });
          if (!r.ok) errors.push(r);
        }
        for (const p of players) {
          const r = await this.safe('media_player', 'volume_set', p, { volume_level: 0.7 });
          if (!r.ok) errors.push(r);
        }
        const sync = await this.groupSync(players);
        if (!sync.ok && sync.errors) errors.push(...sync.errors);
        actions.push('灯光全亮+流光', '媒体音量70%', '多房间同步');
        break;
      }
      case 'sleep':
        // 睡眠：暂停媒体 + 关灯
        for (const p of players) {
          const r = await this.safe('media_player', 'media_pause', p, {});
          if (!r.ok) errors.push(r);
        }
        for (const l of lights) {
          const r = await this.safe('light', 'turn_off', l, {});
          if (!r.ok) errors.push(r);
        }
        actions.push('暂停媒体', '关闭灯光');
        break;
      case 'gaming':
        // 游戏：中等亮度 + 冷色氛围光，媒体音量 60%
        for (const l of lights) {
          const r = await this.safe('light', 'turn_on', l, {
            brightness_pct: 80,
            rgb_color: [120, 90, 220],
          });
          if (!r.ok) errors.push(r);
        }
        for (const p of players) {
          const r = await this.safe('media_player', 'volume_set', p, { volume_level: 0.6 });
          if (!r.ok) errors.push(r);
        }
        actions.push('灯光80%+冷色氛围', '媒体音量60%');
        break;
      case 'morning':
        // 晨间：灯光全亮暖白唤醒，媒体音量 30%（背景音）
        for (const l of lights) {
          const r = await this.safe('light', 'turn_on', l, {
            brightness_pct: 100,
            color_temp: 400,
          });
          if (!r.ok) errors.push(r);
        }
        for (const p of players) {
          const r = await this.safe('media_player', 'volume_set', p, { volume_level: 0.3 });
          if (!r.ok) errors.push(r);
        }
        actions.push('灯光全亮暖白', '媒体音量30%');
        break;
      case 'off':
        // 关闭所有媒体设备
        for (const p of players) {
          const r = await this.safe('media_player', 'turn_off', p, {});
          if (!r.ok) errors.push(r);
        }
        actions.push('关闭所有媒体设备');
        break;
    }

    const playerStates = await this.snapshotPlayers(players);
    this.logger.log(`影音场景[${preset}]已应用: ${actions.join(',')}`);
    return {
      preset,
      players,
      lights,
      actions,
      playerStates,
      errors: errors.length ? errors : undefined,
    };
  }

  /**
   * 拉取指定播放器的当前状态快照（state / media_title / volume_level）。
   * 单台失败仅 debug 日志，跳过该实体。
   */
  private async snapshotPlayers(players: string[]) {
    const states: Array<{
      entity_id: string;
      state: string;
      media_title?: string;
      volume_level?: number;
    }> = [];
    for (const id of players) {
      try {
        const entity = await this.haConnector.fetchEntityState(id);
        if (!entity) continue;
        const attrs = (entity.attributes || {}) as Record<string, unknown>;
        states.push({
          entity_id: id,
          state: entity.state,
          media_title: attrs.media_title as string | undefined,
          volume_level: attrs.volume_level as number | undefined,
        });
      } catch (err: unknown) {
        this.logger.debug(`媒体播放器状态拉取跳过 ${id}: ${String(err)}`);
      }
    }
    return states;
  }
  /**
   * 启动播放列表：写入内存 + 持久化 + 立即播放第 0 首。
   *
   * @param player 播放器 entity_id
   * @param items  播放列表条目
   * @returns ok / player / total / error
   */
  async startPlaylist(player: string, items: PlaylistItem[]) {
    if (!items.length) return { ok: false, reason: '播放列表为空' };
    this.playlists.set(player, { items, index: 0 });
    await this.persistPlaylists();
    const playResult = await this.playCurrent(player);
    return { ok: playResult.ok, player, total: items.length, error: playResult.error };
  }

  /**
   * 切换到下一首（循环到末尾后回到第 0 首）。
   *
   * @param player 播放器 entity_id
   * @returns ok / index / current / error
   */
  async next(player: string) {
    const pl = this.playlists.get(player);
    if (!pl) return { ok: false, reason: '没有活动的播放列表' };
    pl.index = (pl.index + 1) % pl.items.length;
    await this.persistPlaylists();
    const playResult = await this.playCurrent(player);
    return {
      ok: playResult.ok,
      index: pl.index,
      current: pl.items[pl.index],
      error: playResult.error,
    };
  }

  /**
   * 获取指定播放器的当前播放列表（无则返回 null）。
   */
  getPlaylist(player: string) {
    return this.playlists.get(player) || null;
  }

  /**
   * 多房间媒体同步：将 slaves 加入 master 组。
   *
   * @param players [master, ...slaves]，至少 2 个
   * @returns ok / master / slaves / errors
   */
  async groupSync(players: string[]) {
    if (players.length < 2) return { ok: false, reason: '至少需要 2 个播放器' };
    const [master, ...slaves] = players;
    const r = await this.safe('media_player', 'join', master, { group_members: slaves });
    return { ok: r.ok, master, slaves, errors: r.ok ? undefined : [r] };
  }

  /**
   * 解除多房间同步：让每个播放器独立。
   *
   * @param players 待解组的播放器列表
   */
  async unjoin(players: string[]) {
    const errors: HaActionResult[] = [];
    for (const p of players) {
      const r = await this.safe('media_player', 'unjoin', p, {});
      if (!r.ok) errors.push(r);
    }
    return { ok: errors.length === 0, players, errors: errors.length ? errors : undefined };
  }

  /**
   * 播放当前索引指向的条目（HA media_player.play_media）。
   * 成功时记录日志（含曲目序号 / 总数）。
   */
  private async playCurrent(player: string): Promise<{ ok: boolean; error?: string }> {
    const pl = this.playlists.get(player);
    if (!pl) return { ok: false, error: '无播放列表' };
    const item = pl.items[pl.index];
    const r = await this.safe('media_player', 'play_media', player, {
      media_content_id: item.mediaContentId,
      media_content_type: item.mediaContentType,
    });
    if (r.ok) {
      this.logger.log(
        `播放列表 ${player}: ${item.title || item.mediaContentId} (${pl.index + 1}/${pl.items.length})`,
      );
    }
    return { ok: r.ok, error: r.error };
  }

  /**
   * 拉取全量 media_player 实体列表。失败时返回空数组并 warn 日志。
   */
  private async allPlayers(): Promise<string[]> {
    try {
      const list = await this.haConnector.fetchEntitiesByDomain('media_player');
      return list.map((e) => e.entity_id);
    } catch (err) {
      this.logger.warn(`获取 media_player 列表失败: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * 安全调用 HA 服务：捕获异常并转为 HaActionResult。
   * 单次失败不抛出，由调用方聚合 errors 决定是否上报。
   *
   * @param domain   HA domain（light / media_player 等）
   * @param service  HA service（turn_on / volume_set 等）
   * @param entityId 目标实体
   * @param data     服务负载
   */
  private async safe(
    domain: string,
    service: string,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<HaActionResult> {
    try {
      await this.haConnector.callService(domain, service, entityId, data);
      return { ok: true, domain, service, entityId };
    } catch (err) {
      const error = getErrorMessage(err);
      this.logger.debug(`媒体动作失败 [${domain}.${service} ${entityId}]: ${error}`);
      return { ok: false, domain, service, entityId, error };
    }
  }
}