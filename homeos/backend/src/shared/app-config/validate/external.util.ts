/**
 * 职责：
 *  - 外部服务配置 zod 校验；
 * 关键依赖：
 *  - zod；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { numIn, validateEntityIdList, type AppConfigFieldError } from './primitives.util';

/** 校验外部服务配置段（日历同步间隔、天气回退实体、动态电价等） */
export function validateExternalSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('calendarSyncMin' in partial)
    numIn(section, 'calendarSyncMin', partial.calendarSyncMin, 1, 1440, errors);
  if ('calendarSyncShortMin' in partial)
    numIn(section, 'calendarSyncShortMin', partial.calendarSyncShortMin, 1, 60, errors);
  if ('calendarIncrementalEnabled' in partial && typeof partial.calendarIncrementalEnabled !== 'boolean') {
    errors.push({ section, key: 'calendarIncrementalEnabled', message: '须为布尔值' });
  }
  if ('weatherFallbackEntityId' in partial && partial.weatherFallbackEntityId != null && partial.weatherFallbackEntityId !== '') {
    const id = String(partial.weatherFallbackEntityId).trim();
    if (!/^[a-z0-9_]+\./i.test(id)) {
      errors.push({ section, key: 'weatherFallbackEntityId', message: '须为合法实体 ID 或留空' });
    }
  }
  if ('dynamicPricingEnabled' in partial && typeof partial.dynamicPricingEnabled !== 'boolean') {
    errors.push({ section, key: 'dynamicPricingEnabled', message: '须为布尔值' });
  }
  if ('dynamicPricingRefreshHours' in partial)
    numIn(section, 'dynamicPricingRefreshHours', partial.dynamicPricingRefreshHours, 1, 168, errors);
  if ('dynamicPricingUrl' in partial && partial.dynamicPricingUrl != null && partial.dynamicPricingUrl !== '') {
    const url = String(partial.dynamicPricingUrl).trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      errors.push({ section, key: 'dynamicPricingUrl', message: '须为 http(s) URL 或留空' });
    }
  }
  if ('weatherAlertsTtlMin' in partial)
    numIn(section, 'weatherAlertsTtlMin', partial.weatherAlertsTtlMin, 1, 1440, errors);
  if ('weatherAlertRefreshMs' in partial)
    numIn(
      section,
      'weatherAlertRefreshMs',
      partial.weatherAlertRefreshMs,
      60_000,
      3_600_000,
      errors,
    );
  if ('weatherAlertEnabled' in partial && typeof partial.weatherAlertEnabled !== 'boolean') {
    errors.push({ section, key: 'weatherAlertEnabled', message: '须为布尔值' });
  }
  if (
    'weatherAlertNotifyLevel' in partial &&
    !['red', 'orange', 'yellow'].includes(String(partial.weatherAlertNotifyLevel))
  ) {
    errors.push({ section, key: 'weatherAlertNotifyLevel', message: '须为 red / orange / yellow' });
  }
  if ('weatherAlertCooldownMin' in partial)
    numIn(section, 'weatherAlertCooldownMin', partial.weatherAlertCooldownMin, 1, 1440, errors);
  if (
    'weatherAlertSceneId' in partial &&
    partial.weatherAlertSceneId != null &&
    partial.weatherAlertSceneId !== ''
  ) {
    if (typeof partial.weatherAlertSceneId !== 'string') {
      errors.push({ section, key: 'weatherAlertSceneId', message: '须为字符串或留空' });
    }
  }
  if (
    'weatherAlertModeId' in partial &&
    partial.weatherAlertModeId != null &&
    partial.weatherAlertModeId !== ''
  ) {
    if (typeof partial.weatherAlertModeId !== 'string') {
      errors.push({ section, key: 'weatherAlertModeId', message: '须为字符串或留空' });
    }
  }
  if ('weatherLat' in partial) numIn(section, 'weatherLat', partial.weatherLat, -90, 90, errors);
  if ('weatherLon' in partial) numIn(section, 'weatherLon', partial.weatherLon, -180, 180, errors);
  if (
    'openWeatherApiKey' in partial &&
    partial.openWeatherApiKey != null &&
    partial.openWeatherApiKey !== ''
  ) {
    if (
      typeof partial.openWeatherApiKey !== 'string' ||
      !String(partial.openWeatherApiKey).trim()
    ) {
      errors.push({ section, key: 'openWeatherApiKey', message: '须为非空字符串或留空' });
    }
  }
  if ('ttsMediaPlayerIds' in partial)
    validateEntityIdList(section, 'ttsMediaPlayerIds', partial.ttsMediaPlayerIds, errors);
  if ('calendarUrl' in partial && partial.calendarUrl != null && partial.calendarUrl !== '') {
    const url = String(partial.calendarUrl).trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      errors.push({ section, key: 'calendarUrl', message: '须为 http(s) URL 或留空' });
    }
  }
}
