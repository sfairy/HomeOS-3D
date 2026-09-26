/**
 * 灯光统计控件的数据汇总。
 *
 * 接收一组实体 ID，结合实时状态与实体描述，输出「共几个 / 开几个 / 关几个 / 几个异常」与逐
 * 条明细。纯计算模块，实时状态由调用方（控件 runtime）从状态中心取出后传入；同时兼容 Map
 * 与普通对象两种容器，以及「状态对象」与「变更对象（含 newState）」两种入参形态，后两件事
 * 收在 utils/state-entry.js 里一份。
 */

import {
  readFromMapOrRecord,
  resolveStateEntryIn
} from "../../utils/state-entry.js?v=2609262312";
// 「按 ID 取域」只有一份实现；这里保留外层 `toLowerCase()`，因为只有这个消费方需要小写域。
import { entityDomainFromId } from "../../utils/entities.js?v=2609262312";

// 这些域的「开 / 关」语义天然成立，直接按 state 判定。
const ON_OFF_DOMAINS_SET = new Set([
  "light",
  "switch",
  "input_boolean",
  "fan",
  "humidifier",
  "siren"
]);
// 这些域没有 on / off 状态，只有关 / 运行之分（climate 是 hvac_action，water_heater 是 operation_mode），
// 因此单独成组，任何非 off 的状态都算作「开」。
const RUNNING_STATE_DOMAINS_SET = new Set(["climate", "water_heater"]);
/**
 * 解析实体所属域，优先用描述里的 domain 字段，缺失时回退到实体 ID 的点号前缀。
 */
function resolveEntityDomain(entityDescriptor) {
  const entityId =
    typeof entityDescriptor == "string"
      ? entityDescriptor
      : String(entityDescriptor?.entityId || entityDescriptor?.entity_id || "");
  // 描述里的 domain 优先（可能带空白，故 trim）；缺失时按 ID 的点号前缀取域 ——
  // 两条路径都要小写：下面的域集合全是小写字面量，这里不归一就会静默判成「不支持」。
  return (
    String(typeof entityDescriptor == "string" ? "" : entityDescriptor?.domain || "").trim() ||
    entityDomainFromId(entityId)
  ).toLowerCase();
}
/**
 * 判断某个实体能否参与灯光统计，并给出给用户看的口径说明。
 * 判定顺序：虚拟实体 → 群组 → 开 / 关域 → 运行态域 → 其余不支持。虚拟实体与群组必须先判，
 * 它们的 domain 可能是 virtual / group，按域匹配会被误判成不支持。
 */
export function lightStatisticsEntitySupport(entityLike) {
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
 * 空串、unknown、unavailable 一律算 abnormal（读数不可信而非「关」，混进 off 会偏乐观）；
 * 运行态域（climate / water_heater）只要不是 off 就算 on。
 */
export function lightStatisticsEntityStateStatus(entityInput, stateLike) {
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
  entityIds,
  liveStatesByEntityId = new Map(),
  descriptorsByEntityId = new Map()
) {
  // 去重但保持配置顺序：统计卡片的行序应与用户在编辑器里的排布一致，因此不能用 Set 直接输出。
  const orderedEntityIds = [];
  const seenEntityIds = new Set();
  for (const entityIdEntry of Array.isArray(entityIds) ? entityIds : []) {
    const normalizedEntityId = String(entityIdEntry || "").trim();
    if (!!normalizedEntityId && !seenEntityIds.has(normalizedEntityId)) {
      seenEntityIds.add(normalizedEntityId);
      orderedEntityIds.push(normalizedEntityId);
    }
  }
  const items = orderedEntityIds.map(currentEntityId => {
    const descriptor = readFromMapOrRecord(descriptorsByEntityId, currentEntityId) || {};
    const stateChange = resolveStateEntryIn(liveStatesByEntityId, currentEntityId);
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
    on: items.filter(item => item.status === "on").length,
    off: items.filter(entry => entry.status === "off").length,
    abnormal: items.filter(candidate => candidate.status === "abnormal").length,
    items: items
  };
}
