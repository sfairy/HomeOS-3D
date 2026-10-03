/**
 * 所属模块：backend/modules/auth
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
export const DEFAULT_USER_PREFERENCES = {
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

/** 在家感知成员引用（用于解析生效偏好） */
interface HomePresenceMemberRef {
  id: string;
  name: string;
  atHome: boolean;
  /** 配置人员上的可选 User.id */
  userId?: string;
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
 * 家庭默认偏好：优先 admin，其次最早创建的 adult；无用户时回退内置默认值。
 */
async function getHouseholdDefaultPreferences(deps: AuthPreferencesDeps) {
  try {
    const user = await deps.prisma.user.findFirst({
      where: { role: { in: ['admin', 'adult'] } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, preferences: true },
    });
    if (!user) return { ...DEFAULT_USER_PREFERENCES } as UserPreferenceSnapshot;
    const dbPrefs = (user.preferences ?? {}) as Record<string, unknown>;
    return { ...DEFAULT_USER_PREFERENCES, ...dbPrefs } as UserPreferenceSnapshot;
  } catch {
    return { ...DEFAULT_USER_PREFERENCES } as UserPreferenceSnapshot;
  }
}

/** 规范化人员 id：剥离 person: 前缀并转小写，便于跨字段匹配 */
function normalizePersonKey(id: string): string {
  return String(id || '')
    .replace(/^person:/i, '')
    .trim()
    .toLowerCase();
}

/** 聚合多名成员的数值偏好：温度/色温取平均，夜模式时间取最早，autoNight 任一启用即为启用 */
function averageNumericPrefs(rows: UserPreferenceSnapshot[]): UserPreferenceSnapshot {
  if (!rows.length) return { ...DEFAULT_USER_PREFERENCES };
  if (rows.length === 1) return { ...rows[0] };
  const sumTemp = rows.reduce((s, r) => s + (Number(r.defaultTemperature) || 24), 0);
  const sumKelvin = rows.reduce((s, r) => s + (Number(r.preferredLightKelvin) || 4000), 0);
  const autoNight = rows.some((r) => r.autoNightMode !== false);
  // 取最早的夜模式时间（更早进入夜间）
  const nightTimes = rows
    .map((r) => String(r.nightModeTime || '22:00'))
    .filter((t) => /^\d{2}:\d{2}$/.test(t))
    .sort();
  return {
    ...DEFAULT_USER_PREFERENCES,
    defaultTemperature: Math.round((sumTemp / rows.length) * 10) / 10,
    preferredLightKelvin: Math.round(sumKelvin / rows.length),
    autoNightMode: autoNight,
    nightModeTime: nightTimes[0] || '22:00',
  };
}

/** 偏好解析来源：household_default（家庭默认）/ home_members（在家成员聚合）/ fallback（无可用数据回退） */
type PreferenceResolveSource = 'household_default' | 'home_members' | 'fallback';

/** 解析后的在家偏好结果（含来源、匹配成员、可读摘要） */
export interface ResolvedHomePreferences {
  prefs: UserPreferenceSnapshot;
  source: PreferenceResolveSource;
  matchedMembers: string[];
  summary: string;
}

/**
 * 按当前在家成员解析偏好：
 * 1) presencePersons.userId / preferences.presencePersonId 精确绑定
 * 2) 姓名 ≈ username 模糊匹配
 * 3) 多名在家成人则数值取平均；无人在家或无人匹配则回退家庭默认
 */
export async function getActiveHomePreferencesDetailed(
  deps: AuthPreferencesDeps,
  homeMembers: HomePresenceMemberRef[],
): Promise<ResolvedHomePreferences> {
  const atHome = (homeMembers || []).filter((m) => m.atHome);
  if (!atHome.length) {
    const prefs = await getHouseholdDefaultPreferences(deps);
    return {
      prefs,
      source: 'household_default',
      matchedMembers: [],
      summary: '无人在家，使用家庭默认偏好',
    };
  }

  try {
    const users = await deps.prisma.user.findMany({
      where: { role: { in: ['admin', 'adult'] } },
      select: { id: true, username: true, role: true, preferences: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    if (!users.length) {
      return {
        prefs: { ...DEFAULT_USER_PREFERENCES } as UserPreferenceSnapshot,
        source: 'fallback',
        matchedMembers: [],
        summary: '无可用用户偏好，使用内置默认',
      };
    }

    const matched: UserPreferenceSnapshot[] = [];
    const matchedNames: string[] = [];
    const usedUserIds = new Set<string>();

    for (const member of atHome) {
      const personKey = normalizePersonKey(member.id);
      if (member.userId) {
        const u = users.find((x) => x.id === member.userId);
        if (u && !usedUserIds.has(u.id)) {
          usedUserIds.add(u.id);
          matched.push({
            ...DEFAULT_USER_PREFERENCES,
            ...((u.preferences ?? {}) as Record<string, unknown>),
          } as UserPreferenceSnapshot);
          matchedNames.push(member.name || u.username);
          continue;
        }
      }
      const byPref = users.find((u) => {
        const prefs = (u.preferences ?? {}) as Record<string, unknown>;
        const bind = normalizePersonKey(String(prefs.presencePersonId || ''));
        return bind && bind === personKey && !usedUserIds.has(u.id);
      });
      if (byPref) {
        usedUserIds.add(byPref.id);
        matched.push({
          ...DEFAULT_USER_PREFERENCES,
          ...((byPref.preferences ?? {}) as Record<string, unknown>),
        } as UserPreferenceSnapshot);
        matchedNames.push(member.name || byPref.username);
        continue;
      }
      const nameKey = String(member.name || '')
        .trim()
        .toLowerCase();
      if (!nameKey) continue;
      const byName = users.find(
        (u) => !usedUserIds.has(u.id) && String(u.username || '').trim().toLowerCase() === nameKey,
      );
      if (byName) {
        usedUserIds.add(byName.id);
        matched.push({
          ...DEFAULT_USER_PREFERENCES,
          ...((byName.preferences ?? {}) as Record<string, unknown>),
        } as UserPreferenceSnapshot);
        matchedNames.push(member.name || byName.username);
      }
    }

    if (matched.length) {
      const prefs = averageNumericPrefs(matched);
      return {
        prefs,
        source: 'home_members',
        matchedMembers: matchedNames,
        summary:
          matchedNames.length === 1
            ? `使用「${matchedNames[0]}」的个人偏好`
            : `综合在家成员偏好：${matchedNames.join('、')}`,
      };
    }
    const prefs = await getHouseholdDefaultPreferences(deps);
    return {
      prefs,
      source: 'household_default',
      matchedMembers: [],
      summary: '在家成员未绑定账号，使用家庭默认偏好',
    };
  } catch (err) {
    deps.logger.warn(`在家偏好解析失败: ${(err as Error).message}`);
    const prefs = await getHouseholdDefaultPreferences(deps);
    return {
      prefs,
      source: 'fallback',
      matchedMembers: [],
      summary: '偏好解析失败，已回退家庭默认',
    };
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
