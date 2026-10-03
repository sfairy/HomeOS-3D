/**
 * 所属模块：backend/modules/notification
 * 职责：
 *  - 通知偏好解析助手；
 * 关键依赖：
 *  - shared/app-config；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { AppConfigData } from '../../shared/app-config/service';
import { AppConfigService } from '../../shared/app-config/service';
import { DEFAULT_DND_END, DEFAULT_DND_START, isDndActive } from '@homeos/shared';
import { PrismaService } from '../../shared/prisma/service';
import type { NotificationPreferenceToggles, NotificationSettingsView } from './service';

/** NotificationSettingsHelper 的依赖注入接口 */
interface NotificationSettingsDeps {
  prisma: PrismaService;
  appConfig: AppConfigService;
  getCfg: () => {
    dndStart?: number;
    dndEnd?: number;
    globalNotifyEnabled?: boolean;
    importantNotifyEnabled?: boolean;
    offlineNotifyEnabled?: boolean;
    lowBatteryNotifyEnabled?: boolean;
  };
  isDndActive: () => boolean;
  invalidateUserAuth?: (userId: string) => void;
}

/**
 * 通知设置 Helper。
 * 管理全屋级别（系统配置）与用户级别（User.preferences）的通知偏好。
 * 用户偏好覆盖全屋偏好，DND 时段缺省为 shared DEFAULT_DND_*。
 */
export class NotificationSettingsHelper {
  constructor(private readonly deps: NotificationSettingsDeps) {}

  /** 获取全屋级别的通知设置视图（不含用户偏好覆盖）。 */
  private getGlobalSettings(): NotificationSettingsView {
    const cfg = this.deps.getCfg();
    return {
      dndStart: cfg.dndStart,
      dndEnd: cfg.dndEnd,
      dndActive: this.deps.isDndActive(),
      globalNotifyEnabled: cfg.globalNotifyEnabled !== false,
      importantNotifyEnabled: cfg.importantNotifyEnabled !== false,
      offlineNotifyEnabled: cfg.offlineNotifyEnabled !== false,
      lowBatteryNotifyEnabled: cfg.lowBatteryNotifyEnabled !== false,
    };
  }

  /**
   * 从数据库读取用户通知偏好。
   * 读取失败时回退为空对象（不影响全屋设置）。
   */
  private async getUserNotificationPrefs(userId: string): Promise<NotificationPreferenceToggles> {
    try {
      const user = await this.deps.prisma.user.findUnique({ where: { id: userId } });
      const prefs = (user?.preferences || {}) as Record<string, unknown>;
      const n = (prefs.notification || {}) as NotificationPreferenceToggles;
      return n;
    } catch {
      return {};
    }
  }

  /**
   * 合并全屋设置与用户偏好（用户优先）。
   * DND 时段缺省：用户 > 全屋 > DEFAULT_DND_*。
   */
  private mergeSettings(
    global: NotificationSettingsView,
    userPrefs: NotificationPreferenceToggles,
  ): NotificationSettingsView {
    const dndStart = userPrefs.dndStart ?? global.dndStart ?? DEFAULT_DND_START;
    const dndEnd = userPrefs.dndEnd ?? global.dndEnd ?? DEFAULT_DND_END;
    return {
      dndStart,
      dndEnd,
      dndActive: isDndActive(new Date().getHours(), dndStart, dndEnd),
      globalNotifyEnabled: userPrefs.globalNotifyEnabled ?? global.globalNotifyEnabled,
      importantNotifyEnabled: userPrefs.importantNotifyEnabled ?? global.importantNotifyEnabled,
      offlineNotifyEnabled: userPrefs.offlineNotifyEnabled ?? global.offlineNotifyEnabled,
      lowBatteryNotifyEnabled: userPrefs.lowBatteryNotifyEnabled ?? global.lowBatteryNotifyEnabled,
    };
  }

  /**
   * 获取通知设置视图。
   * 有 userId 时合并用户偏好，否则返回全屋设置。
   */
  async getSettings(
    userId?: string,
    preloadedPrefs?: NotificationPreferenceToggles,
  ): Promise<NotificationSettingsView> {
    const global = this.getGlobalSettings();
    if (!userId) return global;
    const userPrefs = preloadedPrefs ?? (await this.getUserNotificationPrefs(userId));
    return this.mergeSettings(global, userPrefs);
  }

  /**
   * 更新通知设置。
   * - admin：始终写入全屋系统配置（appConfig.notification）
   * - 非 admin：仅改 toggle 且不涉及 DND → 写用户偏好；含 DND 或无 userId → 写全屋
   */
  async updateSettings(
    settings: NotificationPreferenceToggles,
    userId?: string,
    role?: string,
  ) {
    const isAdmin = role === 'admin';
    const hasToggles =
      settings.globalNotifyEnabled != null ||
      settings.importantNotifyEnabled != null ||
      settings.offlineNotifyEnabled != null ||
      settings.lowBatteryNotifyEnabled != null;
    const touchesGlobalDnd = settings.dndStart != null || settings.dndEnd != null;

    // 成人等非 admin：仅个人开关走 prefs，避免误改全屋默认值
    if (!isAdmin && userId && hasToggles && !touchesGlobalDnd) {
      return this.updateUserPreferences(userId, settings);
    }

    const partial: Record<string, number | boolean> = {};
    if (settings.dndStart != null) partial.dndStart = settings.dndStart;
    if (settings.dndEnd != null) partial.dndEnd = settings.dndEnd;
    if (settings.globalNotifyEnabled != null)
      partial.globalNotifyEnabled = settings.globalNotifyEnabled;
    if (settings.importantNotifyEnabled != null)
      partial.importantNotifyEnabled = settings.importantNotifyEnabled;
    if (settings.offlineNotifyEnabled != null)
      partial.offlineNotifyEnabled = settings.offlineNotifyEnabled;
    if (settings.lowBatteryNotifyEnabled != null)
      partial.lowBatteryNotifyEnabled = settings.lowBatteryNotifyEnabled;
    if (Object.keys(partial).length > 0) {
      await this.deps.appConfig.update({
        notification: partial,
      } as unknown as Partial<AppConfigData>);
    }
    return this.getSettings(userId);
  }

  /**
   * 更新用户级通知偏好（写入 User.preferences.notification）。
   * 修改后作废该用户的 JWT 缓存以使新偏好立即生效。
   */
  async updateUserPreferences(userId: string, settings: NotificationPreferenceToggles) {
    const user = await this.deps.prisma.user.findUnique({ where: { id: userId } });
    const existing = (user?.preferences || {}) as Record<string, unknown>;
    const prev = (existing.notification || {}) as NotificationPreferenceToggles;
    const next: NotificationPreferenceToggles = { ...prev };
    if (settings.globalNotifyEnabled != null)
      next.globalNotifyEnabled = settings.globalNotifyEnabled;
    if (settings.importantNotifyEnabled != null)
      next.importantNotifyEnabled = settings.importantNotifyEnabled;
    if (settings.offlineNotifyEnabled != null)
      next.offlineNotifyEnabled = settings.offlineNotifyEnabled;
    if (settings.lowBatteryNotifyEnabled != null)
      next.lowBatteryNotifyEnabled = settings.lowBatteryNotifyEnabled;
    if (settings.dndStart != null) next.dndStart = settings.dndStart;
    if (settings.dndEnd != null) next.dndEnd = settings.dndEnd;
    await this.deps.prisma.user.update({
      where: { id: userId },
      data: { preferences: { ...existing, notification: next } as never },
    });
    this.deps.invalidateUserAuth?.(userId);
    return this.getSettings(userId);
  }
}
