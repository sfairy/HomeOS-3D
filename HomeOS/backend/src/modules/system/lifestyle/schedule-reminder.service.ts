/**
 * 循环日程提醒服务
 *
 * 模块：system/lifestyle
 * 职责：
 *  - 维护 ScheduleItem 列表（CRUD + 持久化到 Prisma）
 *  - 每分钟检查今日到期提醒，通过 eventEmitter 推送 schedule.reminder 事件
 *  - 预设包管理：list / apply（跳过同名避免重复）
 *  - snooze 推迟提醒
 *
 * 预设包见 schedule-reminder-presets.ts（垃圾分类 / 家务清洁 / 设备维护）
 *
 * 依赖：
 *  - PrismaService        持久化 ScheduleItem 表
 *  - EventEmitter2        本地事件总线（schedule.reminder）
 *  - AppConfigService     读取 notification.dndStart/dndEnd（免打扰时段）
 *
 * 关键路径：calcNextDate / checkAndNotify —— 修改时务必同步测试 daily/weekly/biweekly/monthly。
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@generated/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isDndActive } from '@homeos/shared';
import { AppConfigService } from '../../../shared/app-config/service';
import { PrismaService } from '../../../shared/prisma/service';
import { JobRegistryService } from '../../../shared/jobs/registry.service';
import { loadRuntimeKv } from '../../../shared/prisma/runtime-kv.util';
import { parseJsonArray } from '../../../common/utils/json-field.util';
import { BusinessException, ErrorCode, localDateKey } from '../../../common/utils';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { RedisService } from '../../../shared/redis/service';
import { HaWsLeaderService } from '../../ha-connector/ha-ws-leader.service';
import {
  findSchedulePreset,
  formatSchedulePresetItemLabel,
  SCHEDULE_REMINDER_PRESETS,
} from './schedule-reminder-presets';

/**
 * 单条日程提醒
 */
interface ScheduleItem {
  /** 主键 ID（Prisma 生成） */
  id: string;
  /** 类型分组：recycle / cleaning / medication / maintenance / custom */
  type: string; // recycle / cleaning / medication / maintenance / custom
  /** 显示名称："可回收垃圾" / "厨余垃圾" / "其他垃圾" */
  label: string; // "可回收垃圾" / "厨余垃圾" / "其他垃圾"
  /** emoji 图标：🗑️ / 🧹 / 💊 / 🔧 */
  icon: string; // 🗑️ / 🧹 / 💊 / 🔧
  /** 频率：weekly 每周 / biweekly 每双周 / monthly 每月 / daily 每天 / custom 自定义 */
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'daily' | 'custom';
  /** 周几（0=周日 1=周一 ... 6=周六），仅 weekly / biweekly 使用 */
  dayOfWeek: number; // 0=周日 1=周一 ...
  /** 每月的日期列表（1~31），仅 monthly 模式使用 */
  customDays: number[]; // 每月的几天（仅 monthly 模式）
  /** 提醒时间 HH:MM（如 "07:00"），空/非法时回退 07:00 */
  time: string; // "HH:MM"
  /** 下次到期 ISO 日期（每次 getTodayReminders 时刷新） */
  nextDate: string; // ISO 日期
  /** UI 显示颜色（hex） */
  color: string;
  /** 优先级：normal（受 DND）| danger（绕过 DND，受冷却） */
  priority: 'normal' | 'danger';
}

/**
 * 垃圾回收日 + 循环提醒服务
 *
 * 预设包见 schedule-reminder-presets.ts（垃圾分类 / 家务清洁 / 设备维护）
 */
@Injectable()
export class ScheduleReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleReminderService.name);
  /** RuntimeKv 中记录"是否已初始化默认预设"的行 id */
  private static readonly META_CONFIG_ID = 'schedule-reminder-meta';

  /** 提醒列表 */
  private schedules: ScheduleItem[] = [];

  /** id → 上次推送日期（YYYY-MM-DD），用于普通提醒避免同一天重复推送 */
  private lastNotified = new Map<string, string>(); // id → date
  /** id → 上次推送时间戳（ms），danger 级 60 分钟冷却，避免绕过 DND 后风暴 */
  private lastNotifiedAt = new Map<string, number>();
  private static readonly DANGER_COOLDOWN_MS = 60 * 60_000;
  /** id → snooze 截止时间戳 (ms)，snooze 期间跳过推送 */
  private snoozedUntil = new Map<string, number>();
  /** snooze 状态 Redis 键（重启后恢复，避免用户推迟被重置） */
  private static readonly SNOOZE_KEY = 'homeos:reminder:snoozedUntil';
  /** 跨副本推送游标：{ lastNotified: {id: date}, lastNotifiedAt: {id: ts} } */
  private static readonly NOTIFY_CURSOR_KEY = 'homeos:reminder:notifyCursor';
  /** 周期检查定时器句柄 */
  private checkTimer: NodeJS.Timeout | null = null;
  /**
   * @param prisma       Prisma 访问（ScheduleItem 表 + RuntimeKv 元数据）
   * @param eventEmitter 本地事件总线（推送 schedule.reminder）
   * @param appConfig    应用配置（notification 免打扰时段）
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly appConfig: AppConfigService,
    private readonly jobs: JobRegistryService,
    private readonly redis: RedisService,
    private readonly haLeader: HaWsLeaderService,
  ) {}

  /**
   * 模块初始化：
   *  - 从 DB 加载已有提醒
   *  - 启动每分钟检查定时器
   *  - 启动后 5 秒触发一次立即检查（避免冷启动延迟）
   */
  async onModuleInit() {
    await this.loadFromDb();
    await this.restoreSnooze();
    await this.restoreNotifyCursor();
    this.checkTimer = setInterval(() => {
      void this.jobs.run(
        'schedule-reminder',
        { description: '日程提醒周期检查', intervalMs: 60_000 },
        () => this.checkAndNotify(),
      );
    }, 60_000);
    setTimeout(() => void this.checkAndNotify(), 5000);
  }

  /**
   * 模块销毁时清理周期定时器。
   */
  onModuleDestroy() {
    if (this.checkTimer) clearInterval(this.checkTimer);
  }

  /**
   * 是否处于可推送时段（复用 notification.dndStart/dndEnd 免打扰配置）。
   * danger 级日程绕过 DND。语义与 @homeos/shared isDndActive 一致（含 start===end 全天）。
   */
  private canPushNow(item: ScheduleItem): boolean {
    if (item.priority === 'danger') return true;
    const { dndStart, dndEnd } = this.appConfig.get('notification');
    return !isDndActive(new Date().getHours(), dndStart, dndEnd);
  }

  /**
   * 定时检查今日到期提醒并推送通知。
   * 仅 HA-WS Leader 执行，避免多副本重复推送；游标经 Redis 共享。
   */
  private async checkAndNotify() {
    if (!this.haLeader.isHaWsLeader()) return;
    const { today } = this.getTodayReminders();
    const todayStr = localDateKey(new Date(), this.appConfig.getHomeTimezone());
    const now = Date.now();
    // snoozedUntil 过期条目惰性清理，避免 Map 只增不减
    for (const [id, until] of this.snoozedUntil) {
      if (until <= now) this.snoozedUntil.delete(id);
    }
    // lastNotified 仅保留今日条目，避免旧日期残留
    for (const [id, date] of this.lastNotified) {
      if (date !== todayStr) this.lastNotified.delete(id);
    }
    let cursorDirty = false;
    for (const item of today) {
      if (!this.canPushNow(item)) continue;
      // snooze 期间跳过
      const snoozeEnd = this.snoozedUntil.get(item.id);
      if (snoozeEnd && now < snoozeEnd) continue;

      if (item.priority === 'danger') {
        const lastAt = this.lastNotifiedAt.get(item.id);
        if (lastAt != null && now - lastAt < ScheduleReminderService.DANGER_COOLDOWN_MS) continue;
        this.lastNotifiedAt.set(item.id, now);
        cursorDirty = true;
      } else {
        // 同一天只推送一次（key=今日日期）
        if (this.lastNotified.get(item.id) === todayStr) continue;
        this.lastNotified.set(item.id, todayStr);
        cursorDirty = true;
      }

      this.eventEmitter.emit('schedule.reminder', {
        id: item.id,
        label: item.label,
        icon: item.icon,
        priority: item.priority,
        message: `${item.icon} ${item.label}`,
      });
      this.logger.log(`📅 今日提醒已推送: ${item.icon} ${item.label}`);
    }
    if (cursorDirty) this.persistNotifyCursor();
  }

  /**
   * 查询是否已初始化过默认预设（避免每次空表都重新 seed）。
   * 元数据保存在 RuntimeKv 表 schedule-reminder-meta 记录。
   */
  private async isInitialized(): Promise<boolean> {
    const data = await loadRuntimeKv<{ initialized?: boolean }>(
      this.prisma,
      ScheduleReminderService.META_CONFIG_ID,
    );
    return Boolean(data?.initialized);
  }

  /**
   * 标记已初始化（用户清空后也不再自动 seed 默认预设）。
   */
  private async markInitialized(): Promise<void> {
    await this.prisma.runtimeKv.upsert({
      where: { id: ScheduleReminderService.META_CONFIG_ID },
      create: {
        id: ScheduleReminderService.META_CONFIG_ID,
        data: { initialized: true },
      },
      update: { data: { initialized: true } },
    });
  }

  /**
   * 把 Prisma 记录映射为内存 ScheduleItem。
   * customDays 为 JSONB 数组。
   */
  private mapRecord(r: {
    id: string;
    type: string;
    label: string;
    icon: string;
    frequency: string;
    dayOfWeek: number;
    customDays: unknown;
    time?: string | null;
    color: string;
    priority?: string | null;
  }): ScheduleItem {
    return {
      id: r.id,
      type: r.type,
      label: r.label,
      icon: r.icon,
      frequency: r.frequency as ScheduleItem['frequency'],
      dayOfWeek: r.dayOfWeek,
      customDays: parseJsonArray<number>(r.customDays),
      time: r.time || '07:00',
      nextDate: '',
      color: r.color,
      priority: r.priority === 'danger' ? 'danger' : 'normal',
    };
  }
  /**
   * 首次启动时 seed 默认预设（垃圾分类 waste-sorting）。
   * 仅当 DB 无记录且未标记 initialized 时执行。
   */
  private async seedDefaultSchedules(): Promise<void> {
    const preset = findSchedulePreset('waste-sorting');
    if (!preset) return;
    for (const item of preset.items) {
      const record = await this.prisma.scheduleItem.create({
        data: {
          type: item.type,
          label: item.label,
          icon: item.icon,
          frequency: item.frequency,
          dayOfWeek: item.dayOfWeek,
          customDays: item.customDays,
          time: item.time || '07:00',
          color: item.color,
          priority: 'normal',
        },
      });
      this.schedules.push({
        id: record.id,
        ...item,
        time: item.time || '07:00',
        priority: 'normal',
        nextDate: '',
      });
    }
  }

  /**
   * 从 DB 加载提醒列表。
   * 优先用 DB 已有记录；空表且未初始化时 seed 默认预设。
   * 任何异常仅 warn 日志，不阻断模块启动。
   */
  private async loadFromDb() {
    try {
      const records = await this.prisma.scheduleItem.findMany({
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      if (records.length > 0) {
        this.schedules = records.map((r) => this.mapRecord(r));
        await this.markInitialized();
        this.logger.log(`日程提醒已加载: ${this.schedules.length} 条`);
        return;
      }

      // 空表 + 已初始化（用户主动清空过）：保持空列表
      if (await this.isInitialized()) {
        this.schedules = [];
        this.logger.log('日程提醒已加载: 0 条');
        return;
      }

      // 空表 + 未初始化：seed 默认预设
      await this.seedDefaultSchedules();
      await this.markInitialized();
      this.logger.log(`日程提醒已初始化默认: ${this.schedules.length} 条`);
    } catch (err) {
      this.logger.warn(`加载日程提醒失败: ${(err as Error).message}`);
    }
  }

  /**
   * 新增日程提醒。
   *
   * @param item 提醒数据（不含 id / nextDate）
   * @returns 已创建的提醒（含 DB 主键）
   * @throws 创建失败时向上抛出
   */
  async addSchedule(
    item: Omit<ScheduleItem, 'id' | 'nextDate' | 'priority' | 'time'> & {
      time?: string;
      priority?: ScheduleItem['priority'];
    },
  ): Promise<ScheduleItem> {
    try {
      const frequency = item.frequency;
      const priority = item.priority === 'danger' ? 'danger' : 'normal';
      const record = await this.prisma.scheduleItem.create({
        data: {
          type: item.type,
          label: item.label,
          icon: item.icon,
          frequency,
          dayOfWeek: item.dayOfWeek,
          customDays: item.customDays,
          time: item.time || '07:00',
          color: item.color,
          priority,
        },
      });
      const schedule: ScheduleItem = {
        id: record.id,
        ...item,
        time: item.time || '07:00',
        frequency,
        priority,
        nextDate: '',
      };
      this.schedules.push(schedule);
      return schedule;
    } catch (err) {
      this.logger.error(`创建日程提醒失败: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * 更新日程提醒（部分字段）。
   * 同步 DB + 内存列表；找不到记录时返回 null。
   *
   * @param id      提醒 ID
   * @param partial 待更新字段
   * @returns 更新后的提醒，或 null（DB 记录不存在）
   */
  async updateSchedule(id: string, partial: Partial<ScheduleItem>): Promise<ScheduleItem | null> {
    try {
      const data: Prisma.ScheduleItemUpdateInput = {};
      if (partial.type !== undefined) data.type = partial.type;
      if (partial.label !== undefined) data.label = partial.label;
      if (partial.icon !== undefined) data.icon = partial.icon;
      if (partial.frequency !== undefined) data.frequency = partial.frequency;
      if (partial.dayOfWeek !== undefined) data.dayOfWeek = partial.dayOfWeek;
      if (partial.customDays !== undefined) data.customDays = partial.customDays;
      if (partial.time !== undefined) data.time = partial.time || '07:00';
      if (partial.color !== undefined) data.color = partial.color;
      if (partial.priority !== undefined) {
        data.priority = partial.priority === 'danger' ? 'danger' : 'normal';
      }

      const record = await this.prisma.scheduleItem.update({ where: { id }, data });
      const updated = this.mapRecord(record);
      const idx = this.schedules.findIndex((s) => s.id === id);
      if (idx >= 0) {
        this.schedules[idx] = updated;
      } else {
        // 内存中不存在（其他实例创建）：补入列表
        this.schedules.push(updated);
      }
      return updated;
    } catch (err) {
      this.logger.warn(`更新日程提醒失败: ${(err as Error).message}`);
      return null;
    }
  }
  /**
   * 删除日程提醒。
   * 同步 DB + 内存 + snooze / lastNotified 缓存；全部清空时标记 initialized。
   *
   * @param id 提醒 ID
   * @returns success=true 成功；success=false 时 DB 删除失败
   */
  async deleteSchedule(id: string): Promise<{ success: boolean }> {
    try {
      await this.prisma.scheduleItem.delete({ where: { id } });
      this.schedules = this.schedules.filter((s) => s.id !== id);
      this.snoozedUntil.delete(id);
      this.lastNotified.delete(id);
      this.lastNotifiedAt.delete(id);
      this.persistSnooze();
      if (this.schedules.length === 0) {
        // 用户主动清空到 0 条：标记已初始化，避免下次启动又 seed 默认
        await this.markInitialized();
      }
      return { success: true };
    } catch (err) {
      this.logger.warn(`删除日程提醒失败: ${(err as Error).message}`);
      return { success: false };
    }
  }

  /**
   * 清空全部日程提醒（DB + 内存 + 缓存）。
   * 标记 initialized，避免下次启动 seed 默认。
   *
   * @returns deleted 删除条数
   */
  async clearAllSchedules(): Promise<{ deleted: number }> {
    const result = await this.prisma.scheduleItem.deleteMany({});
    this.schedules = [];
    this.snoozedUntil.clear();
    this.lastNotified.clear();
    this.lastNotifiedAt.clear();
    this.persistSnooze();
    await this.markInitialized();
    this.logger.log(`日程提醒已全部清除: ${result.count} 条`);
    return { deleted: result.count };
  }

  /**
   * 获取今天的提醒清单，按 today / tomorrow / thisWeek 三档分类。
   * 副作用：刷新每条 item.nextDate（用于 UI 展示"下次提醒"）。
   *
   * @returns today 今日 / tomorrow 明日 / thisWeek 本周内（不含今明两天）
   */
  getTodayReminders(): {
    today: ScheduleItem[];
    tomorrow: ScheduleItem[];
    thisWeek: ScheduleItem[];
  } {
    const now = new Date();
    const tz = this.appConfig.getHomeTimezone();
    const todayStr = localDateKey(now, tz);

    const todayItems: ScheduleItem[] = [];
    const tomorrowItems: ScheduleItem[] = [];
    const thisWeekItems: ScheduleItem[] = [];

    for (const item of this.schedules) {
      const nextDate = this.calcNextDate(item, now);
      item.nextDate = nextDate;
      const nextDateStr = localDateKey(new Date(nextDate), tz);

      if (nextDateStr === todayStr) {
        todayItems.push(item);
      } else {
        const nextD = new Date(nextDate);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (nextDateStr === localDateKey(tomorrow, tz)) {
          tomorrowItems.push(item);
        } else if (nextD.getTime() - now.getTime() < 7 * 24 * 3600_000) {
          // 7 天内（不含今明）归入本周
          thisWeekItems.push(item);
        }
      }
    }

    return { today: todayItems, tomorrow: tomorrowItems, thisWeek: thisWeekItems };
  }
  /**
   * 计算下一次提醒日期（关键路径）。
   *
   * 各频率策略：
   *  - daily：下一个 item.time（HH:MM，默认 07:00；若今天该时刻已过则明天）
   *  - weekly：下一个指定 dayOfWeek 的 item.time
   *  - biweekly：在 weekly 基础上 + 固定基准日（2020-01-06 周一）偶数周差判定，
   *              确保真正隔周而非每周
   *  - monthly：本月下一个 customDays 中的日期；本月无则下月第一天
   *  - custom / 默认：当前 + 24h
   *
   * 修改注意：biweekly 基准日不能随意改动，否则历史提醒的"偶数周"会错位。
   *
   * @param item 提醒条目
   * @param from 起算时刻
   * @returns ISO 日期字符串
   */
  private calcNextDate(item: ScheduleItem, from: Date): string {
    const d = new Date(from);
    const { hour, minute } = this.reminderTime(item);

    switch (this.effectiveFrequency(item)) {
      case 'daily': {
        // 每天 item.time；若已过则顺延到明天
        d.setHours(hour, minute, 0, 0);
        if (d <= from) d.setDate(d.getDate() + 1);
        return d.toISOString();
      }
      case 'weekly': {
        // 找到下一个指定星期几（含今天，但需 > from）
        while (d.getDay() !== item.dayOfWeek || d <= from) {
          d.setDate(d.getDate() + 1);
        }
        d.setHours(hour, minute, 0, 0);
        return d.toISOString();
      }
      case 'biweekly': {
        // 按固定基准日计算偶数周差，确保真正隔周（而非每周）
        // 基准 2020-01-06 为周一；以 7 天为一周划分，周差为偶数则命中
        const epoch = new Date(Date.UTC(2020, 0, 6));
        const msPerWeek = 7 * 24 * 3600_000;
        // 最多尝试 4 周（覆盖跨周场景），找到第一个偶数周差的指定星期几
        for (let i = 0; i < 4; i++) {
          while (d.getDay() !== item.dayOfWeek || d <= from) {
            d.setDate(d.getDate() + 1);
          }
          const weekDiff = Math.floor((d.getTime() - epoch.getTime()) / msPerWeek);
          if (weekDiff >= 0 && weekDiff % 2 === 0) {
            d.setHours(hour, minute, 0, 0);
            return d.toISOString();
          }
          d.setDate(d.getDate() + 1);
        }
        d.setHours(hour, minute, 0, 0);
        return d.toISOString();
      }
      case 'monthly': {
        // 每月：找本月下一个 customDays 中的日期；本月无则下月第一个
        const sorted = [...item.customDays].sort((a, b) => a - b);
        const today = from.getDate();
        // 找本月下一个日期
        const nextDay = sorted.find((day) => day > today);
        if (nextDay) {
          d.setDate(nextDay);
        } else {
          // 下个月第一个
          d.setMonth(d.getMonth() + 1);
          d.setDate(sorted[0] || 1);
        }
        d.setHours(hour, minute, 0, 0);
        return d.toISOString();
      }
      default:
        return new Date(from.getTime() + 24 * 3600_000).toISOString();
    }
  }

  /** 解析提醒时间（HH:MM → {hour, minute}），空/非法回退 07:00 */
  private reminderTime(item: ScheduleItem): { hour: number; minute: number } {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(item.time || '').trim());
    if (m) {
      const hour = Number(m[1]);
      const minute = Number(m[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute };
    }
    return { hour: 7, minute: 0 };
  }

  /** 获取完整提醒列表（按 DB 顺序） */
  getAllSchedules() {
    return [...this.schedules];
  }
  /**
   * 预设包列表（含已应用数量）。
   * 已应用 = 内存中存在同名 label 的提醒。
   * 用于 UI 展示"应用 / 已应用 N 条"。
   */
  getPresets() {
    const existingLabels = new Set(this.schedules.map((s) => s.label));
    return SCHEDULE_REMINDER_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      itemCount: preset.items.length,
      appliedCount: preset.items.filter((item) => existingLabels.has(item.label)).length,
      items: preset.items.map((item) => ({
        label: item.label,
        icon: item.icon,
        frequency: item.frequency,
        dayOfWeek: item.dayOfWeek,
        customDays: item.customDays,
        time: item.time || '07:00',
        scheduleLabel: formatSchedulePresetItemLabel(item),
        alreadyApplied: existingLabels.has(item.label),
      })),
    }));
  }

  /**
   * 应用预设包（跳过同名提醒，避免重复）。
   * 副作用：批量 addSchedule + markInitialized。
   *
   * @param presetId 预设 ID
   * @returns presetId / added 新增列表 / skipped 跳过的 label 列表
   * @throws BusinessException(NOT_FOUND) 预设不存在
   */
  async applyPreset(presetId: string): Promise<{
    presetId: string;
    added: ScheduleItem[];
    skipped: string[];
  }> {
    const preset = findSchedulePreset(presetId);
    if (!preset) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        API_ERROR.SCHEDULE_PRESET_NOT_FOUND(presetId),
      );
    }

    const existingLabels = new Set(this.schedules.map((s) => s.label));
    const added: ScheduleItem[] = [];
    const skipped: string[] = [];

    for (const item of preset.items) {
      if (existingLabels.has(item.label)) {
        // 同名提醒已存在，跳过避免重复
        skipped.push(item.label);
        continue;
      }
      const schedule = await this.addSchedule(item);
      added.push(schedule);
      existingLabels.add(item.label);
    }

    if (added.length > 0) {
      await this.markInitialized();
    }

    this.logger.log(
      `日程预设"${preset.name}"已应用: 新增 ${added.length} 条,跳过 ${skipped.length} 条`,
    );

    return { presetId, added, skipped };
  }

  /**
   * 推迟提醒（分钟）。
   * 副作用：设置 snoozedUntil，清除 lastNotified（允许到点重新推送）。
   *
   * @param id      提醒 ID
   * @param minutes 推迟分钟数，默认 60
   * @returns ok / snoozedUntil ISO / reason
   */
  snooze(id: string, minutes = 60): { ok: boolean; snoozedUntil?: string; reason?: string } {
    const item = this.schedules.find((s) => s.id === id);
    if (!item) return { ok: false, reason: '日程提醒不存在' };
    const until = Date.now() + minutes * 60_000;
    this.snoozedUntil.set(id, until);
    // 清除上次推送标记，snooze 到期后允许重新推送
    this.lastNotified.delete(id);
    this.lastNotifiedAt.delete(id);
    this.persistSnooze();
    this.persistNotifyCursor();
    return { ok: true, snoozedUntil: new Date(until).toISOString() };
  }

  /** 从 Redis 恢复推送游标（Leader 故障转移后避免同日重复提醒） */
  private async restoreNotifyCursor(): Promise<void> {
    try {
      const raw = await this.redis.get(ScheduleReminderService.NOTIFY_CURSOR_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        lastNotified?: Record<string, string>;
        lastNotifiedAt?: Record<string, number>;
      };
      const todayStr = localDateKey(new Date(), this.appConfig.getHomeTimezone());
      for (const [id, date] of Object.entries(parsed.lastNotified || {})) {
        if (date === todayStr && this.schedules.some((s) => s.id === id)) {
          this.lastNotified.set(id, date);
        }
      }
      const now = Date.now();
      for (const [id, ts] of Object.entries(parsed.lastNotifiedAt || {})) {
        if (
          typeof ts === 'number' &&
          now - ts < ScheduleReminderService.DANGER_COOLDOWN_MS &&
          this.schedules.some((s) => s.id === id)
        ) {
          this.lastNotifiedAt.set(id, ts);
        }
      }
    } catch (err) {
      this.logger.warn(`恢复提醒推送游标失败: ${(err as Error).message}`);
    }
  }

  private persistNotifyCursor(): void {
    void this.redis
      .set(
        ScheduleReminderService.NOTIFY_CURSOR_KEY,
        JSON.stringify({
          lastNotified: Object.fromEntries(this.lastNotified),
          lastNotifiedAt: Object.fromEntries(this.lastNotifiedAt),
        }),
        48 * 3600,
      )
      .catch((err) =>
        this.logger.debug(`提醒推送游标持久化失败: ${(err as Error).message}`),
      );
  }

  /** 从 Redis 恢复 snooze 状态（过滤已过期条目） */
  private async restoreSnooze(): Promise<void> {
    try {
      const raw = await this.redis.get(ScheduleReminderService.SNOOZE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      const now = Date.now();
      for (const [id, until] of Object.entries(parsed)) {
        if (until > now && this.schedules.some((s) => s.id === id)) {
          this.snoozedUntil.set(id, until);
        }
      }
      if (this.snoozedUntil.size > 0) {
        this.logger.log(`已恢复 ${this.snoozedUntil.size} 条 snooze 状态`);
      }
    } catch (err) {
      this.logger.warn(`恢复 snooze 状态失败: ${(err as Error).message}`);
    }
  }

  /** 将 snooze 状态写入 Redis（TTL 48h，覆盖最长推迟窗口） */
  private persistSnooze(): void {
    void this.redis
      .set(
        ScheduleReminderService.SNOOZE_KEY,
        JSON.stringify(Object.fromEntries(this.snoozedUntil)),
        48 * 3600,
      )
      .catch((err) => this.logger.debug(`snooze 状态持久化失败: ${(err as Error).message}`));
  }

  /** 解析有效频率（仅使用 frequency） */
  private effectiveFrequency(item: ScheduleItem): ScheduleItem['frequency'] {
    return item.frequency;
  }
}