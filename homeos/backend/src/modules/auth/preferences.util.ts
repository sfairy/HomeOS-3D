/**
 * 职责：
 *  - 会话偏好（TTL/rememberMe）读取工具；
 * 关键依赖：
 *  - AppConfigService；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../shared/prisma/service';

/** 用户偏好的内置默认值（温度 24°C / 色温 4000K / 22:00 进入夜间） */
const DEFAULT_USER_PREFERENCES = {
  defaultTemperature: 24,
  preferredLightKelvin: 4000,
  autoNightMode: true,
  nightModeTime: '22:00',
  /** 绑定的在家感知人员配置 id（不含 person: 前缀） */
  presencePersonId: '',
  /** 界面温度单位 */
  temperatureUnit: 'celsius' as 'celsius' | 'fahrenheit',
};

type UserPreferenceSnapshot = typeof DEFAULT_USER_PREFERENCES & Record<string, unknown>;

interface AuthPreferencesDeps {
  prisma: PrismaService;
  logger: Pick<Logger, 'warn'>;
}


/** 读取单个用户偏好（DB 偏好与默认值合并，读取异常回退默认值） */
export async function getUserPreferences(deps: AuthPreferencesDeps, userId: string) {
  try {
    const user = await deps.prisma.user.findUnique({ where: { id: userId } });
    const dbPrefs = (user?.preferences ?? {}) as Record<string, unknown>;
    return { ...DEFAULT_USER_PREFERENCES, ...dbPrefs } as UserPreferenceSnapshot;
  } catch {
    return { ...DEFAULT_USER_PREFERENCES } as UserPreferenceSnapshot;
  }
}







/**
 * 更新用户偏好：仅写入白名单字段（DEFAULT_USER_PREFERENCES 的 key），
 * 避免客户端塞入越权字段污染 preferences JSON。更新后回读最新偏好返回。
 */
export async function updateUserPreferences(
  deps: AuthPreferencesDeps,
  userId: string,
  prefs: Record<string, unknown>,
) {
  try {
    const user = await deps.prisma.user.findUnique({ where: { id: userId } });
    const existing = (user?.preferences ?? {}) as Record<string, unknown>;
    const allowedKeys = Object.keys(DEFAULT_USER_PREFERENCES) as Array<
      keyof typeof DEFAULT_USER_PREFERENCES
    >;
    const sanitized: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in prefs) sanitized[key] = prefs[key];
    }
    const merged = { ...existing, ...sanitized };
    await deps.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as never },
    });
    return getUserPreferences(deps, userId);
  } catch (err) {
    deps.logger.warn(`更新用户偏好失败: ${(err as Error).message}`);
    throw err;
  }
}
