/** `earthquake` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export {
  haversineDistanceKm,
  computeSWaveCountdown,
  estimateLocalIntensity,
  refineAlertCountdown,
  isInSichuanBasin,
  type IntensityEstimateOpts,
} from './geo.util';
export {
  EEW_COUNTDOWN_LEAD_OPTIONS,
  type EewCountdownLeadSec,
  normalizeEewCountdownLead,
  shouldShowEewCountdown,
  isEewSimulationEventId,
  eewCountdownLeadLabel,
} from './eew-countdown-lead.util';
export {
  type EarthquakeAlertPayload,
  type EarthquakeAlertKind,
  type EarthquakeEewSource,
  type GlobalEarthquakePeriod,
  type GlobalEarthquakeSource,
  type GlobalEarthquakeEvent,
  type GlobalEarthquakeFeedResult,
  type GlobalEarthquakeQuery,
} from './types';
