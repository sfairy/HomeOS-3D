/**
 * 灯光统计控件的数据汇总。
 */


import {
  readFromMapOrRecord,
  resolveStateEntryIn
} from "../../utils/state-entry.js";
import { entityDomainFromId } from "../../utils/entities.js";

// 这些域的「开 / 关」语义天然成立，直接按 state 判定。
const ON_OFF_DOMAINS_SET = new Set([
  "light",
  "switch",
  "input_boolean",
  "fan",
  "humidifier",
  "siren"
]);
const RUNNING_STATE_DOMAINS_SET = new Set(["climate", "water_heater"]);
function resolveEntityDomain(entityDescriptor: any) {
  const entityId =
    typeof entityDescriptor == "string"
      ? entityDescriptor
      : String(entityDescriptor?.entityId || entityDescriptor?.entity_id || "");
  // 描述里的 domain 优先（可能带空白，故 trim）；缺失时按 ID 的点号前缀取域 ——
  return (
    String(typeof entityDescriptor == "string" ? "" : entityDescriptor?.domain || "").trim() ||
    entityDomainFromId(entityId)
  ).toLowerCase();
}
/**
 * 判断某个实体能否参与灯光统计，并给出给用户看的口径说明。
 */
export function lightStatisticsEntitySupport(entityLike: any) {
  const entityDomainName = resolveEntityDomain(entityLike);
  if (entityDomainName === "virtual" || entityLike?.virtual) {
    return {
      supported: true,
      message: "虚拟实体按当前显示状态统计。"
    };
  } else if (entityDomainName === "group") {
    return {
      supported: true,
      message: "群组将作为 1 个实体统计。"
    };
  } else if (ON_OFF_DOMAINS_SET.has(entityDomainName)) {
    return {
      supported: true,
      message: "按开启/关闭状态统计。"
    };
  } else if (RUNNING_STATE_DOMAINS_SET.has(entityDomainName)) {
    return {
      supported: true,
      message: "按关闭/运行状态统计。"
    };
  } else {
    return {
      supported: false,
      message: "该实体没有明确的开启/关闭状态。"
    };
  }
}
/**
 * 把单条状态归类成 on / off / abnormal 三态。
 */
export function lightStatisticsEntityStateStatus(entityInput: any, stateLike: any) {
  if (!lightStatisticsEntitySupport(entityInput).supported) {
    return "abnormal";
  }
  const domainName = resolveEntityDomain(entityInput);
  const normalizedState = String(stateLike?.state ?? stateLike ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedState || ["unknown", "unavailable"].includes(normalizedState)) {
    return "abnormal";
  } else if (normalizedState === "off") {
    return "off";
  } else if (normalizedState === "on" || RUNNING_STATE_DOMAINS_SET.has(domainName)) {
    return "on";
  } else {
    return "abnormal";
  }
}
/**
 * 汇总一批实体的开关统计。
 */
export function lightStatisticsSummary(
  entityIds: any,
  liveStatesByEntityId: any = new Map<any, any>(),
  descriptorsByEntityId: any = new Map<any, any>()
) {
  // 去重但保持配置顺序：统计卡片的行序应与用户在编辑器里的排布一致，因此不能用 Set 直接输出。
  const orderedEntityIds: any[] = [];
  const seenEntityIds = new Set<any>();
  for (const entityIdEntry of Array.isArray(entityIds) ? entityIds : []) {
    const normalizedEntityId = String(entityIdEntry || "").trim();
    if (!!normalizedEntityId && !seenEntityIds.has(normalizedEntityId)) {
      seenEntityIds.add(normalizedEntityId);
      orderedEntityIds.push(normalizedEntityId);
    }
  }
  const items = orderedEntityIds.map((currentEntityId: any) => {
    const descriptor: any = readFromMapOrRecord(descriptorsByEntityId, currentEntityId) || {};
    const stateChange = resolveStateEntryIn(liveStatesByEntityId, currentEntityId) as any;
    const normalizedStateEntry = String(stateChange?.state || "")
      .trim()
      .toLowerCase();
    // 描述里补上 entityId：域解析既要认 domain 字段，也要能退回 ID 前缀。
    const support = lightStatisticsEntitySupport({
      ...descriptor,
      entityId: currentEntityId
    });
    const status = lightStatisticsEntityStateStatus(
      {
        ...descriptor,
        entityId: currentEntityId
      },
      stateChange
    );
    return {
      entityId: currentEntityId,
      // 展示名优先级：HA 的 friendly_name → 本地描述名 → 原始名 → 实体 ID 兜底。
      label: String(
        stateChange?.attributes?.friendly_name ||
          descriptor.name ||
          descriptor.originalName ||
          currentEntityId
      ),
      state: normalizedStateEntry,
      // 本可统计、但当前读数不可信的实体，文案与「压根不支持统计」区分开。
      status: status,
      message: status === "abnormal" && support.supported ? "当前状态无法判断" : support.message
    };
  });
  return {
    total: items.length,
    on: items.filter((item: any) => item.status === "on").length,
    off: items.filter((entry: any) => entry.status === "off").length,
    abnormal: items.filter((candidate: any) => candidate.status === "abnormal").length,
    items: items
  };
}
