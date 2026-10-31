/** Date (date) inspector sync */
import { clampNumber as clampNumber2, normalizedFontWeight as normalizedFontWeight2, roundField as roundField2 } from "../../editor-utils";
import { inspectorComponentMetrics as inspectorComponentMetrics2 } from "../basic";

interface TimeInspectorContext {
  /** 字段清单 = 本文件里出现过的袋子取值（`ctx.<key>` / 别名访问 / 解构），由
   *  `ops/studio/studio_context_bag_typing.mjs` 从**真实使用**生成，一个不多一个不少。
   *
   * 类型暂为 `any`：宿主 `home.ts` 的 `findElement()` 仍返回宽类型，控件语义（`.value` /
   * `.checked` / `.options`）由注入点保证。**但开放索引签名已去掉** —— 键名拼错、宿主漏传
   * 一个键现在会被 `tsc` 拦下。下一步是给 `findElement` 建「选择器 → 元素类型」映射，
   * 再把这批字段换成具体类型。 */
  activeProject: any;
  dateLabelElement: any;
  dateLeftElement: any;
  dateLineGapElement: any;
  dateLunarColorElement: any;
  dateLunarElement: any;
  dateLunarSizeElement: any;
  dateLunarSpacingElement: any;
  dateLunarWeightElement: any;
  dateOpacityElement: any;
  datePrimaryColorElement: any;
  datePrimarySizeElement: any;
  datePrimarySpacingElement: any;
  datePrimaryWeightElement: any;
  dateRotationElement: any;
  dateScaleElement: any;
  dateTopElement: any;
  dateTypeElement: any;
  dateWeekdayElement: any;
}

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
