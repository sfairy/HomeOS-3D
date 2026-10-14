/** `config` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export type {
  SharedAuthConfig,
  SharedNotificationConfig,
  SharedStateStoreConfig,
  SharedWsPushConfig,
  SharedCommandProxyConfig,
  SharedHomeModeConfig,
  SharedEnergyConfig,
  SharedIaqConfig,
  SharedPricingConfig,
  SharedCircadianConfig,
  SharedWaterConfig,
  SharedWebrtcConfig,
  SharedFrontendConfig,
  SharedUiConfig,
  SharedScreensaverConfig,
  SharedEnvSensorMap,
  SharedEnvSensorMapEntry,
  SharedOpsConfig,
  SharedSecurityConfig,
  SharedHaConnectorConfig,
  SharedExternalConfig,
  SharedVoiceConfig,
  SharedOtherConfig,
  SharedAppConfigSections,
} from './sections';
export { DEFAULT_AUTH_SECURITY } from './sections';
export type {
  ClientPowerClient,
  ClientPowerSelfCharge,
  ClientPowerSettings,
} from './client-power';
export {
  DEFAULT_CLIENT_POWER_SELF_CHARGE,
  DEFAULT_CLIENT_POWER_SETTINGS,
} from './client-power';
export type {
  ChargerWakeResolveKind,
  ChargerWakeResolveResult,
  ClientPowerWakeClientPublic,
  ClientPowerWakePublic,
  ClientPowerWakeSource,
  ClientPowerWakeSourceClient,
} from './client-power-wake.util';
export {
  buildClientPowerWakePublic,
  isSwitchOffToOn,
  resolveChargerSwitchWakeEntityId,
  resolveChargerSwitchWakeEntityIdForDevice,
  resolveChargerSwitchWakeForDevice,
  shouldDismissScreensaverOnChargerSwitch,
} from './client-power-wake.util';
