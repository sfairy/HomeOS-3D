/** Date (date) inspector sync */
import { clampNumber as clampNumber2, normalizedFontWeight as normalizedFontWeight2, roundField as roundField2 } from "./editor-utils";
import { inspectorComponentMetrics as inspectorComponentMetrics2 } from "./editor-basic-inspectors";

export interface TimeInspectorContext { [key: string]: any }

export function syncTimeInspector(ctx: TimeInspectorContext, timeComponent: any) {
  const availablePropertiesRef = timeComponent.properties || {},
    {
      left: fitDateComponentToDimensions,
      top: fitDateComponentToDimensionsState,
      scale: dateFitComponent,
      rotation: dateFitProperties,
    }: any = inspectorComponentMetrics2(timeComponent, ctx.activeProject.document);
  ((ctx.dateTypeElement.value = "日期"), (ctx.dateLabelElement.value = availablePropertiesRef.label || ""));
  for (const syncDateInspectorElement of ctx.dateWeekdayElement.querySelectorAll("[data-date-weekday]"))
    syncDateInspectorElement.classList.toggle(
      "active",
      syncDateInspectorElement.dataset.dateWeekday ===
        (availablePropertiesRef.showWeekday === false ? "off" : "on"),
    );
  for (const dateComponentElement of ctx.dateLunarElement.querySelectorAll("[data-date-lunar]"))
    dateComponentElement.classList.toggle(
      "active",
      dateComponentElement.dataset.dateLunar ===
        (availablePropertiesRef.showLunar === true ? "on" : "off"),
    );
  ((ctx.datePrimaryColorElement.value = availablePropertiesRef.primaryColor || "#8d9296"),
    (ctx.datePrimarySizeElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRef.primarySize ?? 36), 12, 500),
    )),
    (ctx.datePrimaryWeightElement.value = roundField2(
      normalizedFontWeight2(availablePropertiesRef.primaryWeight),
    )),
    (ctx.datePrimarySpacingElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRef.primarySpacing ?? 1), -20, 100),
    )),
    (ctx.dateLunarColorElement.value = availablePropertiesRef.lunarColor || "#7f878c"),
    (ctx.dateLunarSizeElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRef.lunarSize ?? 24), 10, 500),
    )),
    (ctx.dateLunarWeightElement.value = roundField2(
      normalizedFontWeight2(availablePropertiesRef.lunarWeight),
    )),
    (ctx.dateLunarSpacingElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRef.lunarSpacing ?? 1), -20, 100),
    )),
    (ctx.dateLineGapElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRef.lineGap ?? 8), 0, 200),
    )),
    (ctx.dateOpacityElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRef.opacity ?? 1) * 100, 0, 100),
    )),
    (ctx.dateLeftElement.value = fitDateComponentToDimensions),
    (ctx.dateTopElement.value = fitDateComponentToDimensionsState),
    (ctx.dateScaleElement.value = dateFitComponent),
    (ctx.dateRotationElement.value = dateFitProperties),
    (ctx.dateScaleElement.disabled = false),
    (ctx.dateRotationElement.disabled = false));
}
