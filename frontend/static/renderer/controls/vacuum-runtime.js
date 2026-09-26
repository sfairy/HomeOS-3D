/**
 * 扫地机器人控件的状态映射。
 *
 * 职责：把 HA 的 supported_features 位掩码翻译成按钮列表；把按钮动作映射成服务名
 * （老固件只有 turn_on / turn_off，没有 start / stop）；从机器人属性或同设备电池传感器解析电量。
 *
 * 位置：纯计算模块，被 interaction3d 扫地机面板与编辑器预览共用。
 * 约定：位掩码沿用 HA 官方 vacuum 集成定义，硬编码在此以免与后端版本耦合。
 */

import { entityMetadataIsAvailable } from "../core/entity-metadata.js?v=2609260946";
// 状态条目归一统一走 utils/state-entry.js，避免各处再各抄一份签名不同的副本。
import { resolveStateEntry } from "../../utils/state-entry.js?v=2609260946";
// HA vacuum 集成的能力位定义。数值来自官方 constant，不能改；只用到其中一部分。
const VACUUM_FEATURE_FLAGS = Object.freeze({
  turn_on: 1,
  turn_off: 2,
  pause: 4,
  stop: 8,
  return_to_base: 16,
  locate: 512,
  clean_spot: 1024,
  start: 8192
});
/**
 * 由 supported_features 位掩码得出可用动作列表。
 * 属性缺失或非法时回落到最小可用集 start / pause / return_to_base：与其禁用所有按钮（用户完全无法操作），
 * 不如给出最常见的一组，由后端在调用失败时回显错误。
 */
export function vacuumSupportedActions(vacuumState) {
  const supportedFeatures = vacuumState?.attributes?.supported_features;
  if (supportedFeatures == null || supportedFeatures === "") {
    return ["start", "pause", "return_to_base"];
  }
  const numericFeatures = Number(supportedFeatures);
  if (!Number.isFinite(numericFeatures)) {
    return ["start", "pause", "return_to_base"];
  }
  const actions = [];
  // start 与 turn_on 语义等价：具备任一位都能开始清扫。
  if (
    numericFeatures & VACUUM_FEATURE_FLAGS.start ||
    numericFeatures & VACUUM_FEATURE_FLAGS.turn_on
  ) {
    actions.push("start");
  }
  if (numericFeatures & VACUUM_FEATURE_FLAGS.pause) {
    actions.push("pause");
  }
  // 同理 stop 与 turn_off 等价。
  if (
    numericFeatures & VACUUM_FEATURE_FLAGS.stop ||
    numericFeatures & VACUUM_FEATURE_FLAGS.turn_off
  ) {
    actions.push("stop");
  }
  if (numericFeatures & VACUUM_FEATURE_FLAGS.return_to_base) {
    actions.push("return_to_base");
  }
  if (numericFeatures & VACUUM_FEATURE_FLAGS.locate) {
    actions.push("locate");
  }
  if (numericFeatures & VACUUM_FEATURE_FLAGS.clean_spot) {
    actions.push("clean_spot");
  }
  return actions;
}
/**
 * 把动作名映射成实际要调用的服务名。
 * 只处理「有 turn_on 但没有 start」与「有 turn_off 但没有 stop」这两种老固件形态，其余同名直接透传；
 * 位掩码不可解析时也透传，把判断交给后端。
 */
export function vacuumActionService(vacuumEntity, actionName) {
  const featureFlags = Number(vacuumEntity?.attributes?.supported_features);
  if (Number.isFinite(featureFlags)) {
    if (
      actionName === "start" &&
      !(featureFlags & VACUUM_FEATURE_FLAGS.start) &&
      featureFlags & VACUUM_FEATURE_FLAGS.turn_on
    ) {
      return "turn_on";
    } else if (
      actionName === "stop" &&
      !(featureFlags & VACUUM_FEATURE_FLAGS.stop) &&
      featureFlags & VACUUM_FEATURE_FLAGS.turn_off
    ) {
      return "turn_off";
    } else {
      return actionName;
    }
  } else {
    return actionName;
  }
}
function parsePercent(rawPercent) {
  if (rawPercent == null || String(rawPercent).trim() === "") {
    return null;
  }
  const parsedPercent = Number.parseFloat(String(rawPercent));
  if (Number.isFinite(parsedPercent)) {
    return Math.max(0, Math.min(100, parsedPercent));
  } else {
    return null;
  }
}
/**
 * 取扫地机电量。
 * 先按 battery_level → battery_percentage → battery 读机器人自身属性（不同固件字段名不同，
 * 逐个尝试比按型号分支更稳），都没有时才回退到独立的电池传感器。
 */
export function vacuumBatteryPercent(vacuumStateOrChange, batterySensor = null) {
  const attributes = resolveStateEntry(vacuumStateOrChange)?.attributes || {};
  for (const batteryAttribute of [
    attributes.battery_level,
    attributes.battery_percentage,
    attributes.battery
  ]) {
    const batteryPercent = parsePercent(batteryAttribute);
    if (batteryPercent !== null) {
      return batteryPercent;
    }
  }
  return parsePercent(resolveStateEntry(batterySensor)?.state);
}
/**
 * 在同一个设备下挑出最可能是「电量」的传感器实体：必须与扫地机同设备、sensor 域且当前可用。
 * 用打分排序而非写死命名规则，综合 device_class、翻译键、名称关键词、图标与单位：加分项如 battery（+240）、单位 %（+25），
 * 减分项如耗材词（滤芯 / 主刷 / 尘袋，-260）、解析不出百分比（-40）；只留正分，按分数降序、ID 升序取第一条。
 */
export function relatedVacuumBatteryEntity(metadataByEntityId, statesByEntityId, vacuumEntityId) {
  const vacuumMetadata = metadataByEntityId.get(vacuumEntityId);
  return (
    (vacuumMetadata?.deviceId &&
      [...metadataByEntityId.values()]
        .filter(
          sensorMetadata =>
            sensorMetadata.deviceId === vacuumMetadata.deviceId &&
            sensorMetadata.domain === "sensor" &&
            entityMetadataIsAvailable(sensorMetadata)
        )
        .map(candidateMetadata => {
          const candidateState = resolveStateEntry(
            statesByEntityId.get(candidateMetadata.entityId)
          );
          const candidateAttributes = candidateState?.attributes || {};
          // 把可用于识别的字段拼成一段文本，后面几条正则都在这上面匹配。
          const searchText = (
            (candidateMetadata.entityId || "") +
            " " +
            (candidateMetadata.name || "") +
            " " +
            (candidateMetadata.originalName || "") +
            " " +
            (candidateMetadata.translationKey || "") +
            " " +
            (candidateMetadata.icon || "")
          ).toLowerCase();
          const deviceClass = String(candidateAttributes.device_class || "").toLowerCase();
          const unit = String(candidateAttributes.unit_of_measurement || "").trim();
          let score = 0;
          if (deviceClass === "battery") {
            score += 240;
          }
          if (String(candidateMetadata.translationKey || "").toLowerCase() === "battery") {
            score += 210;
          }
          if (
            /(?:^|[._\s-])battery(?:_level|_percentage)?(?:$|[._\s-])|电池电量|剩余电量|电量/.test(
              searchText
            )
          ) {
            score += 150;
          }
          if (/mdi:battery/.test(searchText)) {
            score += 60;
          }
          if (unit === "%") {
            score += 25;
          }
          if (/filter|brush|mop|consumable|life|尘袋|滤芯|主刷|边刷|拖布|耗材/.test(searchText)) {
            score -= 260;
          }
          if (parsePercent(candidateState?.state) === null) {
            score -= 40;
          }
          return {
            item: candidateMetadata,
            score: score
          };
        })
        .filter(({ score: candidateScore }) => candidateScore > 0)
        .sort(
          (leftCandidate, rightCandidate) =>
            rightCandidate.score - leftCandidate.score ||
            String(leftCandidate.item.entityId || "").length -
              String(rightCandidate.item.entityId || "").length ||
            String(leftCandidate.item.entityId || "").localeCompare(
              String(rightCandidate.item.entityId || "")
            )
        )[0]?.item) ||
    null
  );
}
