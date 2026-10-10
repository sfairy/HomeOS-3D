/**
 * 即时消息墙（event-log-wall）控件检查器子域。
 */
import { clampNumber as clampNumber2 } from "./editor-utils";
import { findComponent as findComponent2 } from "./component-tree";
import { setInspectorToggle as setInspectorToggle2 } from "./editor-basic-inspectors";

export interface EventLogWallContext {
  eventLogWallInspectorElement: any;
  eventLogWallTypeElement: any;
  eventLogWallLabelElement: any;
  eventLogWallEnabledElement: any;
  eventLogWallTitleElement: any;
  eventLogWallTitleVisibleElement: any;
  eventLogWallTitleSizeElement: any;
  eventLogWallTitleColorElement: any;
  eventLogWallTitleAlignElement: any;
  eventLogWallMaxEntriesElement: any;
  eventLogWallDisplayDurationElement: any;
  eventLogWallWatchScopeElement: any;
  eventLogWallEntityIdsElement: any;
  eventLogWallFontSizeElement: any;
  eventLogWallRadiusElement: any;
  eventLogWallBgOpacityElement: any;
  eventLogWallBlurElement: any;
  eventLogWallClickModeElement: any;
  eventLogWallFooterTextElement: any;
  eventLogWallShowFooterElement: any;
  eventLogWallOnColorElement: any;
  eventLogWallOffColorElement: any;
  eventLogWallAttrColorElement: any;
  eventLogWallClimateColorElement: any;
  eventLogWallAlertColorElement: any;
  eventLogWallMutedColorElement: any;
  getSelectedComponentId: () => any;
  getEditorRenderer: () => any;
  mutateDocument: (mutateDraft: (draftDocument: any) => void) => void;
  removedComponent: () => any;
}

export function setupEventLogWallInspector(ctx: EventLogWallContext) {
  const eventLogWallInspectorFieldSpecs = [
    { element: ctx.eventLogWallLabelElement, property: "label", kind: "text" },
    { element: ctx.eventLogWallTitleElement, property: "title", kind: "text" },
    {
      element: ctx.eventLogWallTitleSizeElement,
      property: "titleSize",
      kind: "number",
      minimum: 40,
      maximum: 300,
    },
    { element: ctx.eventLogWallTitleColorElement, property: "titleColor", kind: "color" },
    { element: ctx.eventLogWallTitleAlignElement, property: "titleAlign", kind: "text" },
    {
      element: ctx.eventLogWallMaxEntriesElement,
      property: "maxEntries",
      kind: "number",
      minimum: 1,
      maximum: 200,
    },
    {
      element: ctx.eventLogWallDisplayDurationElement,
      property: "displayDuration",
      kind: "number",
      minimum: 1,
      maximum: 120,
    },
    { element: ctx.eventLogWallClickModeElement, property: "entryClickMode", kind: "text" },
    { element: ctx.eventLogWallWatchScopeElement, property: "watchScope", kind: "text" },
    { element: ctx.eventLogWallEntityIdsElement, property: "entityIds", kind: "entityList" },
    {
      element: ctx.eventLogWallFontSizeElement,
      property: "fontSize",
      kind: "number",
      minimum: 8,
      maximum: 200,
    },
    {
      element: ctx.eventLogWallRadiusElement,
      property: "cornerRadius",
      kind: "number",
      minimum: 0,
      maximum: 50,
    },
    {
      element: ctx.eventLogWallBgOpacityElement,
      property: "panelBgOpacity",
      kind: "number",
      minimum: 0,
      maximum: 1,
    },
    {
      element: ctx.eventLogWallBlurElement,
      property: "panelBlur",
      kind: "number",
      minimum: 0,
      maximum: 40,
    },
    { element: ctx.eventLogWallFooterTextElement, property: "footerText", kind: "text" },
    { element: ctx.eventLogWallOnColorElement, property: "stateOnColor", kind: "color" },
    { element: ctx.eventLogWallOffColorElement, property: "stateOffColor", kind: "color" },
    { element: ctx.eventLogWallAttrColorElement, property: "stateAttrColor", kind: "color" },
    { element: ctx.eventLogWallClimateColorElement, property: "stateClimateColor", kind: "color" },
    { element: ctx.eventLogWallAlertColorElement, property: "stateAlertColor", kind: "color" },
    { element: ctx.eventLogWallMutedColorElement, property: "stateMutedColor", kind: "color" },
  ];
function readEventLogWallFieldValue(eventLogWallFieldSpec: any) {
  const eventLogWallFieldElement = eventLogWallFieldSpec.element;
  if (eventLogWallFieldSpec.kind === "number") {
    if (
      String(eventLogWallFieldElement.value).trim() === "" ||
      !Number.isFinite(Number(eventLogWallFieldElement.value))
    )
      return undefined;
    return clampNumber2(
      Number(eventLogWallFieldElement.value),
      eventLogWallFieldSpec.minimum ?? -1e9,
      eventLogWallFieldSpec.maximum ?? 1e9,
    );
  }
  if (eventLogWallFieldSpec.kind === "entityList")
    return String(eventLogWallFieldElement.value || "")
      .split(/[\n,]/)
      .map((eventLogWallEntityEntry) => eventLogWallEntityEntry.trim())
      .filter(Boolean);
  return eventLogWallFieldElement.value;
}
const eventLogWallPropertyFallbacks = {
  maxEntries: 20,
  displayDuration: 4,
  entryClickMode: "details",
  watchScope: "auto",
  titleAlign: "left",
  fontSize: 21,
  cornerRadius: 12,
  panelBgOpacity: 0.3,
  panelBlur: 8,
  titleSize: 72,
  titleColor: "#b8c2c8",
  stateOnColor: "#fb923c",
  stateOffColor: "#93c5fd",
  stateAttrColor: "#7dd3fc",
  stateClimateColor: "#67e8f9",
  stateAlertColor: "#f87171",
  stateMutedColor: "#9ca3af",
};
function writeEventLogWallFieldValue(eventLogWallFieldSpec: any, eventLogWallFieldValue: any) {
  const eventLogWallFieldElement = eventLogWallFieldSpec.element,
    isEventLogWallFieldUnset =
      eventLogWallFieldValue === undefined ||
      eventLogWallFieldValue === null ||
      eventLogWallFieldValue === "",
    eventLogWallResolvedValue = isEventLogWallFieldUnset
      ? (eventLogWallPropertyFallbacks as any)[eventLogWallFieldSpec.property]
      : eventLogWallFieldValue;
  if (eventLogWallFieldSpec.kind === "entityList") {
    eventLogWallFieldElement.value = Array.isArray(eventLogWallFieldValue)
      ? eventLogWallFieldValue.join("\n")
      : "";
    return;
  }
  if (eventLogWallFieldSpec.kind === "color") {
    const eventLogWallColorText = String(eventLogWallResolvedValue ?? "").trim();
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(eventLogWallColorText) &&
      (eventLogWallFieldElement.value = eventLogWallColorText);
    return;
  }
  eventLogWallFieldElement.value =
    eventLogWallResolvedValue === undefined || eventLogWallResolvedValue === null
      ? ""
      : String(eventLogWallResolvedValue);
}
function isEventLogWallManualScope(eventLogWallProperties: any) {
  return String(eventLogWallProperties?.watchScope || "auto") === "manual";
}
function syncEventLogWallEnabledSegmented(eventLogWallEnabledValue: any) {
  for (const eventLogWallSegmentButton of ctx.eventLogWallEnabledElement.querySelectorAll(
    "[data-event-log-wall-enabled]",
  )) {
    const isEventLogWallSegmentActive =
      eventLogWallSegmentButton.dataset.eventLogWallEnabled ===
      (eventLogWallEnabledValue === false ? "off" : "on");
    (eventLogWallSegmentButton.classList.toggle("active", isEventLogWallSegmentActive),
      eventLogWallSegmentButton.setAttribute("aria-pressed", String(isEventLogWallSegmentActive)));
  }
}
function syncEventLogWallTitleAlignSegmented(eventLogWallTitleAlignValue: any) {
  for (const eventLogWallTitleAlignButton of ctx.eventLogWallTitleAlignElement.querySelectorAll(
    "[data-event-log-wall-title-align]",
  )) {
    const isEventLogWallTitleAlignActive =
      eventLogWallTitleAlignButton.dataset.eventLogWallTitleAlign === eventLogWallTitleAlignValue;
    (eventLogWallTitleAlignButton.classList.toggle("active", isEventLogWallTitleAlignActive),
      eventLogWallTitleAlignButton.setAttribute(
        "aria-pressed",
        String(isEventLogWallTitleAlignActive),
      ));
  }
}
function normalizeEventLogWallTitleAlign(eventLogWallTitleAlignValue: any) {
  return ["left", "center", "right"].includes(String(eventLogWallTitleAlignValue))
    ? String(eventLogWallTitleAlignValue)
    : "left";
}
function commitEventLogWallInspectorValue(eventLogWallPropertyName: any, eventLogWallPropertyValue: any) {
  const eventLogWallComponentId = ctx.getSelectedComponentId();
  if (!eventLogWallComponentId) return;
  ctx.mutateDocument((eventLogWallDraftDocument: any) => {
    const eventLogWallDraftComponent = findComponent2(
      eventLogWallDraftDocument,
      eventLogWallComponentId,
    )?.component;
    if (!eventLogWallDraftComponent || eventLogWallDraftComponent.type !== "event-log-wall") return;
    eventLogWallDraftComponent.properties = {
      ...(eventLogWallDraftComponent.properties || {}),
      [eventLogWallPropertyName]: eventLogWallPropertyValue,
    };
  });
  ["watchScope", "entityIds"].includes(eventLogWallPropertyName) &&
    ctx.getEditorRenderer()?.connectRuntime?.();
}
(ctx.eventLogWallEnabledElement.addEventListener("click", (eventLogWallEnabledEvent: any) => {
  const eventLogWallEnabledButton = eventLogWallEnabledEvent.target.closest(
    "[data-event-log-wall-enabled]",
  );
  if (!eventLogWallEnabledButton) return;
  const eventLogWallEnabledValue = eventLogWallEnabledButton.dataset.eventLogWallEnabled === "on";
  (syncEventLogWallEnabledSegmented(eventLogWallEnabledValue),
    commitEventLogWallInspectorValue("enabled", eventLogWallEnabledValue));
}),
  ctx.eventLogWallTitleAlignElement.addEventListener("click", (eventLogWallTitleAlignEvent: any) => {
    const eventLogWallTitleAlignButton = eventLogWallTitleAlignEvent.target.closest(
      "[data-event-log-wall-title-align]",
    );
    if (!eventLogWallTitleAlignButton) return;
    const eventLogWallTitleAlignValue = normalizeEventLogWallTitleAlign(
      eventLogWallTitleAlignButton.dataset.eventLogWallTitleAlign,
    );
    (syncEventLogWallTitleAlignSegmented(eventLogWallTitleAlignValue),
      commitEventLogWallInspectorValue("titleAlign", eventLogWallTitleAlignValue));
  }),
  ctx.eventLogWallTitleVisibleElement.addEventListener("click", () => {
    const eventLogWallTitleVisibleValue =
      ctx.eventLogWallTitleVisibleElement.getAttribute("aria-pressed") !== "true";
    (setInspectorToggle2(ctx.eventLogWallTitleVisibleElement, eventLogWallTitleVisibleValue),
      commitEventLogWallInspectorValue("titleVisible", eventLogWallTitleVisibleValue));
  }),
  ctx.eventLogWallShowFooterElement.addEventListener("click", () => {
    const eventLogWallShowFooterValue =
      ctx.eventLogWallShowFooterElement.getAttribute("aria-pressed") !== "true";
    (setInspectorToggle2(ctx.eventLogWallShowFooterElement, eventLogWallShowFooterValue),
      (ctx.eventLogWallFooterTextElement.disabled = !eventLogWallShowFooterValue),
      commitEventLogWallInspectorValue("showFooter", eventLogWallShowFooterValue));
  }),
  ctx.eventLogWallInspectorElement.addEventListener("input", (eventLogWallInputEvent: any) => {
    const eventLogWallInputComponent = ctx.removedComponent();
    if (!eventLogWallInputComponent || eventLogWallInputComponent.type !== "event-log-wall")
      return;
    const eventLogWallInputFieldSpec = eventLogWallInspectorFieldSpecs.find(
      (eventLogWallFieldSpec) => eventLogWallFieldSpec.element === eventLogWallInputEvent.target,
    );
    if (!eventLogWallInputFieldSpec || eventLogWallInputFieldSpec.kind === "entityList") return;
    const eventLogWallInputValue = readEventLogWallFieldValue(eventLogWallInputFieldSpec);
    eventLogWallInputValue === undefined ||
      ctx.getEditorRenderer()?.previewComponentProperties(eventLogWallInputComponent.id, {
        [eventLogWallInputFieldSpec.property]: eventLogWallInputValue,
      });
    eventLogWallInputFieldSpec.property === "watchScope" &&
      (ctx.eventLogWallEntityIdsElement.disabled = String(eventLogWallInputValue) !== "manual");
  }),
  ctx.eventLogWallInspectorElement.addEventListener("change", (eventLogWallChangeEvent: any) => {
    const eventLogWallChangeFieldSpec = eventLogWallInspectorFieldSpecs.find(
        (eventLogWallFieldSpec) => eventLogWallFieldSpec.element === eventLogWallChangeEvent.target,
      ),
      eventLogWallChangeComponentId = ctx.getSelectedComponentId();
    if (!eventLogWallChangeFieldSpec || !eventLogWallChangeComponentId) return;
    const eventLogWallChangeValue = readEventLogWallFieldValue(eventLogWallChangeFieldSpec);
    if (eventLogWallChangeValue === undefined) return;
    commitEventLogWallInspectorValue(
      eventLogWallChangeFieldSpec.property,
      eventLogWallChangeValue,
    );
    eventLogWallChangeFieldSpec.property === "watchScope" &&
      (ctx.eventLogWallEntityIdsElement.disabled = String(eventLogWallChangeValue) !== "manual");
  }));
function syncEventLogWallInspector(eventLogWallComponent: any) {
  const eventLogWallProperties = eventLogWallComponent.properties || {};
  for (const eventLogWallFieldSpec of eventLogWallInspectorFieldSpecs)
    writeEventLogWallFieldValue(
      eventLogWallFieldSpec,
      eventLogWallProperties[eventLogWallFieldSpec.property],
    );
  ((ctx.eventLogWallTypeElement.value = "即时消息墙"),
    syncEventLogWallEnabledSegmented(eventLogWallProperties.enabled),
    syncEventLogWallTitleAlignSegmented(
      normalizeEventLogWallTitleAlign(eventLogWallProperties.titleAlign),
    ),
    setInspectorToggle2(
      ctx.eventLogWallTitleVisibleElement,
      eventLogWallProperties.titleVisible === true,
    ),
    setInspectorToggle2(
      ctx.eventLogWallShowFooterElement,
      eventLogWallProperties.showFooter === true,
    ),
    (ctx.eventLogWallEntityIdsElement.disabled = !isEventLogWallManualScope(eventLogWallProperties)),
    (ctx.eventLogWallFooterTextElement.disabled = eventLogWallProperties.showFooter !== true));
}
  return { syncEventLogWallInspector };
}
