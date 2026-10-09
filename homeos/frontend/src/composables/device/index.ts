/**
 * Device-domain hooks.
 * Group membership constants live in `@/constants/device-group`;
 * group UI helpers remain under `composables/entity/useDeviceGroup*`.
 */
export { useDevicesView } from './useDevicesView'
export { useDeviceOverview } from './useDeviceOverview'
export { useDeviceEntityReferences } from './useDeviceEntityReferences'
export { useDeviceAnalyticsCharts } from './useDeviceAnalyticsCharts'
export { useDeviceAnalyticsDashboard } from './useDeviceAnalyticsDashboard'
export { useDeviceStateHistory } from './useDeviceStateHistory'
export { DOMAIN_LIST, MONITORED_ENTITY_IDS } from '@/constants/device-group'
