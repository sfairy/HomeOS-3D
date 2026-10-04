/**
 * 职责：
 *  - 跨段一致性校验；
 * 关键依赖：
 *  - 各段 validate util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { AppConfigData } from '../types';
import {
  AppConfigValidationError,
  type AppConfigFieldError,
} from './primitives.util';
import {
  validateAuthSection,
  validateOpsSection,
  validateHaConnectorSection,
  validateStateStoreSection,
  validateCommandProxySection,
  validateWsPushSection,
  validateWebrtcSection,
} from './infra.util';
import {
  validateVoiceSection,
  validateScreensaverSection,
  validateHomeModeSection,
  validateFrontendSection,
  validateUiSection,
  validateMediaPlaylistsSection,
  validateChildModeSection,
} from './lifestyle.util';
import {
  validateEnergySection,
  validatePricingSection,
} from './energy.util';
import {
  validateWaterSection,
  validateIaqSection,
  validateCircadianSection,
  validateWeatherEffectsSection,
  validateEnvSensorMapSection,
} from './environment.util';
import {
  validateSecuritySection,
  validateNotificationSection,
} from './security-intel.util';
import { validateOtherSection } from './other.util';
import { validateRetentionSection } from './retention.util';
import { validateExternalSection } from './external.util';
import { validateClientPowerSection } from './client-power.util';
import { validateProfilesSection } from './profiles.util';

type SectionKey = keyof AppConfigData;

/**
 * 按分区名称分发到对应校验函数，汇总字段错误后抛出 AppConfigValidationError。
 * context 为当前完整配置，用于跨字段一致性校验（如阶梯档/分时段联动）。
 */
export function validateAppConfigSection(
  section: SectionKey,
  partial: Record<string, unknown>,
  context?: Record<string, unknown>,
): void {
  const errors: AppConfigFieldError[] = [];

  switch (section) {
    case 'notification':
      validateNotificationSection(section, partial, errors);
      break;
    case 'security':
      validateSecuritySection(section, partial, errors, context);
      break;
    case 'water':
      validateWaterSection(section, partial, errors);
      break;
    case 'iaq':
      validateIaqSection(section, partial, errors);
      break;
    case 'circadian':
      validateCircadianSection(section, partial, errors);
      break;
    case 'energy':
      validateEnergySection(section, partial, errors);
      break;
    case 'pricing':
      validatePricingSection(section, partial, errors, context);
      break;
    case 'frontend':
      validateFrontendSection(section, partial, errors);
      break;
    case 'screensaver':
      validateScreensaverSection(section, partial, errors);
      break;
    case 'weatherEffects':
      validateWeatherEffectsSection(section, partial, errors);
      break;
    case 'voice':
      validateVoiceSection(section, partial, errors);
      break;
    case 'auth':
      validateAuthSection(section, partial, errors);
      break;
    case 'ops':
      validateOpsSection(section, partial, errors);
      break;
    case 'haConnector':
      validateHaConnectorSection(section, partial, errors);
      break;
    case 'stateStore':
      validateStateStoreSection(section, partial, errors);
      break;
    case 'homeMode':
      validateHomeModeSection(section, partial, errors);
      break;
    case 'childMode':
      validateChildModeSection(section, partial, errors);
      break;
    case 'other':
      validateOtherSection(section, partial, errors);
      break;
    case 'retention':
      validateRetentionSection(section, partial, errors);
      break;
    case 'external':
      validateExternalSection(section, partial, errors);
      break;
    case 'wsPush':
      validateWsPushSection(section, partial, errors);
      break;
    case 'commandProxy':
      validateCommandProxySection(section, partial, errors);
      break;
    case 'webrtc':
      validateWebrtcSection(section, partial, errors);
      break;
    case 'clientPower':
      validateClientPowerSection(section, partial, errors);
      break;
    case 'envSensorMap':
      validateEnvSensorMapSection(section, partial, errors);
      break;
    case 'profiles':
      validateProfilesSection(section, partial, errors);
      break;
    case 'ui':
      validateUiSection(section, partial, errors);
      break;
    case 'mediaPlaylists':
      validateMediaPlaylistsSection(section, partial, errors);
      break;
    default:
      break;
  }

  if (errors.length) throw new AppConfigValidationError(errors);
}
