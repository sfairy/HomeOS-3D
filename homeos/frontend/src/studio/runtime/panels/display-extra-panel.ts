/**
 * 只读信息面板：空气质量 / 定位 / 事件 / 地理围栏。
 *
 * 这类实体没有可下发的服务，弹窗里只展示"当前值 + 关键属性"。
 * 属性白名单按域给出，避免把 token / 密码之类字段渲染到界面上。
 */
import { attributesOf } from "../device/entity-capabilities";
import { formatEntityNumber } from "@app/shared/util/ha-number";
import type { ExtraPanelViewModel } from "./panel-utils";

const ATTRIBUTE_LABELS: Record<string, string> = {
  air_quality_index: "空气质量指数",
  particulate_matter_2_5: "PM2.5",
  particulate_matter_10: "PM10",
  carbon_dioxide: "二氧化碳",
  carbon_monoxide: "一氧化碳",
  nitrogen_dioxide: "二氧化氮",
  ozone: "臭氧",
  sulphur_dioxide: "二氧化硫",
  volatile_organic_compounds: "挥发性有机物",
  latitude: "纬度",
  longitude: "经度",
  gps_accuracy: "定位精度",
  source_type: "定位来源",
  battery_level: "电量",
  event_type: "最近事件",
  event_types: "支持事件",
  event_data: "事件详情",
  location: "位置",
  distance: "距离",
};

const DOMAIN_ATTRIBUTES: Record<string, string[]> = {
  air_quality: [
    "air_quality_index",
    "particulate_matter_2_5",
    "particulate_matter_10",
    "carbon_dioxide",
    "carbon_monoxide",
    "nitrogen_dioxide",
    "ozone",
    "sulphur_dioxide",
    "volatile_organic_compounds",
  ],
  device_tracker: ["source_type", "latitude", "longitude", "gps_accuracy", "battery_level"],
  event: ["event_type", "event_types", "event_data"],
  geo_location: ["latitude", "longitude", "location"],
};

/** 敏感字段名：命中即整条丢弃。 */
const SENSITIVE_KEY = /token|password|passwd|secret|credential|authorization|cookie|api_key/i;
/** 通用展示时跳过的属性。 */
const IGNORED_ATTRIBUTES = new Set([
  "friendly_name",
  "icon",
  "entity_picture",
  "supported_features",
]);

function sanitizeAttributeValue(value: any, depth = 0): any {
  if (depth > 3) return "…";
  if (Array.isArray(value)) return value.map((entry) => sanitizeAttributeValue(entry, depth + 1));
  if (value && typeof value == "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, entry]) => [key, sanitizeAttributeValue(entry, depth + 1)]),
    );
  }
  return value;
}

export function displayExtraRows(entityId: string, state: any): [string, string][] {
  const domain = String(entityId).split(".")[0];
  const attributes = attributesOf(state);
  const keys =
    DOMAIN_ATTRIBUTES[domain] ||
    Object.keys(attributes).filter(
      (key) => !SENSITIVE_KEY.test(key) && !IGNORED_ATTRIBUTES.has(key),
    );
  return keys
    .filter((key) => attributes[key] != null)
    .map((key) => [
      ATTRIBUTE_LABELS[key] || key,
      typeof attributes[key] == "object"
        ? JSON.stringify(sanitizeAttributeValue(attributes[key]))
        : String(attributes[key]),
    ]);
}

export function createDisplayExtraPanel({ element: hostElement }: { element: any }) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const statusElement = ownerDocument.createElement("p");
  const rowsElement = ownerDocument.createElement("dl");
  rowsElement.className = "i3d-extra-display-rows";
  hostElement.replaceChildren(statusElement, rowsElement);

  return {
    root: hostElement,
    update({ item, state, numberFormats }: ExtraPanelViewModel) {
      const liveState = state?.newState || state;
      const attributes = attributesOf(liveState);
      const unknown = liveState?.state === "unknown";
      // 数值走 HA 显示精度（`number-formats`）；非数值实体原样返回。
      statusElement.textContent =
        !liveState || liveState.state === "unavailable" || (liveState.available === false && !unknown)
          ? "设备不可用"
          : unknown
            ? "状态未知"
            : formatEntityNumber(
                String(item?.entityId || ""),
                liveState,
                numberFormats?.[String(item?.entityId || "")],
              ) + (attributes.unit_of_measurement ? ` ${attributes.unit_of_measurement}` : "");

      if (
        String(item?.entityId).startsWith("event.") &&
        liveState?.state &&
        !["unknown", "unavailable"].includes(liveState.state)
      ) {
        const eventTime = new Date(liveState.state);
        if (Number.isFinite(eventTime.valueOf())) {
          statusElement.textContent = `最近发生 ${eventTime.toLocaleString()}`;
        }
      }

      rowsElement.replaceChildren();
      for (const [label, value] of displayExtraRows(String(item?.entityId), liveState)) {
        const term = ownerDocument.createElement("dt");
        const detail = ownerDocument.createElement("dd");
        term.textContent = label;
        detail.textContent = value;
        rowsElement.append(term, detail);
      }
    },
    dispose() {
      hostElement.replaceChildren();
    },
  };
}
