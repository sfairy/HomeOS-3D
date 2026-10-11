/**
 * energy 域（`src/shared/`）：能源/水电燃气计量的共享域 barrel。
 *
 * 本域被下层（stores / constants / composables）反向依赖，放 `features/` 会造成分层倒置，故落 `shared/`。
 * 两层访问规则：上层消费者走本 barrel；叶子/下层（stores/constants/types/utils）走深路径。
 */

export { useRelativeDateLabel, parseDateParts } from './composables/useUtilityMeter'
export { useUtilityBalanceFields } from './composables/useUtilityBalanceFields'
export { readPopupAttr, parseJsonAttr, parseNumAttr } from './composables/utility-entity-helpers'
// `useRemainingDays` 与 9 个 parse* 只被域内/叶子位置使用，按两层规则走深路径，不入 barrel。
export type { UtilityMeterParsedItem } from './composables/utility-meter-parse-helpers'
