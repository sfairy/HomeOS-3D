/** Light statistics inspector sync */
import { clampNumber as clampNumber2, normalizedFontWeight as normalizedFontWeight2, roundField as roundField2 } from "../../editor-utils";
import { setInspectorToggle as setInspectorToggle2 } from "../basic";

interface LightStatisticsInspectorContext {
  /** 字段清单 = 本文件里出现过的袋子取值（`ctx.<key>` / 别名访问 / 解构），由
   *  `ops/studio/studio_context_bag_typing.mjs` 从**真实使用**生成，一个不多一个不少。
   *
   * 类型暂为 `any`：宿主 `home.ts` 的 `findElement()` 仍返回宽类型，控件语义（`.value` /
   * `.checked` / `.options`）由注入点保证。**但开放索引签名已去掉** —— 键名拼错、宿主漏传
   * 一个键现在会被 `tsc` 拦下。下一步是给 `findElement` 建「选择器 → 元素类型」映射，
   * 再把这批字段换成具体类型。 */
  activeProject: any;
  lightStatisticsActionControlsElement: any;
  lightStatisticsCountActiveColorElement: any;
  lightStatisticsCountColorElement: any;
  lightStatisticsCountGapElement: any;
  lightStatisticsCountSizeElement: any;
  lightStatisticsCountSpacingElement: any;
  lightStatisticsCountVisibleElement: any;
  lightStatisticsCountWeightElement: any;
  lightStatisticsEntityButtonElement: any;
  lightStatisticsEntityMenuElement: any;
  lightStatisticsEntitySearchElement: any;
  lightStatisticsHeightElement: any;
  lightStatisticsIconActiveColorElement: any;
  lightStatisticsIconColorElement: any;
  lightStatisticsIconGapElement: any;
  lightStatisticsIconSizeElement: any;
  lightStatisticsIconVisibleElement: any;
  lightStatisticsLabelElement: any;
  lightStatisticsLeftElement: any;
  lightStatisticsRotationElement: any;
  lightStatisticsScaleElement: any;
  lightStatisticsTitleColorElement: any;
  lightStatisticsTitleElement: any;
  lightStatisticsTitleSizeElement: any;
  lightStatisticsTitleSpacingElement: any;
  lightStatisticsTitleVisibleElement: any;
  lightStatisticsTitleWeightElement: any;
  lightStatisticsTopElement: any;
  lightStatisticsWidthElement: any;
  runAmount: any;
  runBackup: any;
  runExtraFallback: any;
  runLimit: any;
  runLocal: any;
  runZone: any;
  selectedComponentIdsSet: any;
  statisticsComponentId: any;
  statisticsReplaceIndex: any;
  syncComponentActionControls: any;
}

export function syncLightStatisticsInspector(ctx: LightStatisticsInspectorContext, lightStatisticsComponent: any) {
  const statisticsProperties = lightStatisticsComponent.properties || {},
    statisticsPosition = lightStatisticsComponent.position || {},
    statisticsCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
    statisticsCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
    statisticsWidthPx = Number(statisticsPosition.width || 100),
    statisticsHeightPx = Number(statisticsPosition.height || 100);
  (ctx.statisticsComponentId && ctx.statisticsComponentId !== lightStatisticsComponent.id && ctx.runLimit(),
    (ctx.lightStatisticsLabelElement.value = statisticsProperties.label || ""),
    (ctx.lightStatisticsTitleElement.value = statisticsProperties.title || "数量"),
    ctx.runExtraFallback(lightStatisticsComponent),
    setInspectorToggle2(
      ctx.lightStatisticsIconVisibleElement,
      statisticsProperties.iconVisible !== false,
    ),
    setInspectorToggle2(
      ctx.lightStatisticsTitleVisibleElement,
      statisticsProperties.titleVisible !== false,
    ),
    setInspectorToggle2(
      ctx.lightStatisticsCountVisibleElement,
      statisticsProperties.countVisible !== false,
    ),
    ctx.runLocal(statisticsProperties.icon ?? "mdi:lightbulb-group-outline"),
    (ctx.lightStatisticsIconColorElement.value = statisticsProperties.iconColor || "#8b9298"),
    (ctx.lightStatisticsIconActiveColorElement.value =
      statisticsProperties.iconActiveColor || "#f2a20d"),
    (ctx.lightStatisticsIconSizeElement.value = roundField2(
      Number(statisticsProperties.iconSize ?? 42),
    )),
    (ctx.lightStatisticsTitleColorElement.value = statisticsProperties.titleColor || "#b9bbc0"),
    (ctx.lightStatisticsTitleSizeElement.value = roundField2(
      Number(statisticsProperties.titleSize ?? 32),
    )),
    (ctx.lightStatisticsTitleWeightElement.value = roundField2(
      normalizedFontWeight2(statisticsProperties.titleWeight, 0.3),
    )),
    (ctx.lightStatisticsTitleSpacingElement.value = roundField2(
      Number(statisticsProperties.titleSpacing ?? 1.2),
    )),
    (ctx.lightStatisticsCountColorElement.value = statisticsProperties.countColor || "#b9bbc0"),
    (ctx.lightStatisticsCountActiveColorElement.value =
      statisticsProperties.countActiveColor || "#f2a20d"),
    (ctx.lightStatisticsCountSizeElement.value = roundField2(
      Number(statisticsProperties.countSize ?? 34),
    )),
    (ctx.lightStatisticsCountWeightElement.value = roundField2(
      normalizedFontWeight2(statisticsProperties.countWeight, 0.35),
    )),
    (ctx.lightStatisticsCountSpacingElement.value = roundField2(
      Number(statisticsProperties.countSpacing ?? 0),
    )),
    (ctx.lightStatisticsIconGapElement.value = roundField2(
      Number(statisticsProperties.iconGap ?? 4.5),
    )),
    (ctx.lightStatisticsCountGapElement.value = roundField2(
      Number(statisticsProperties.countGap ?? 4.5),
    )),
    (ctx.lightStatisticsLeftElement.value = roundField2(
      clampNumber2(
        ((Number(statisticsPosition.x || 0) + statisticsWidthPx / 2) / statisticsCanvasWidthPx) *
          100,
        0,
        100,
      ),
    )),
    (ctx.lightStatisticsTopElement.value = roundField2(
      clampNumber2(
        ((Number(statisticsPosition.y || 0) + statisticsHeightPx / 2) / statisticsCanvasHeightPx) *
          100,
        0,
        100,
      ),
    )),
    (ctx.lightStatisticsWidthElement.value = roundField2(
      (statisticsWidthPx / statisticsCanvasWidthPx) * 100,
    )),
    (ctx.lightStatisticsHeightElement.value = roundField2(
      (statisticsHeightPx / statisticsCanvasHeightPx) * 100,
    )),
    (ctx.lightStatisticsScaleElement.value = roundField2(
      Number(lightStatisticsComponent.style?.scale || 1) * 100,
    )),
    (ctx.lightStatisticsRotationElement.value = roundField2(Number(statisticsPosition.rotation || 0))));
  const isStatisticsMultiSelection = ctx.selectedComponentIdsSet.size > 1;
  ((ctx.lightStatisticsWidthElement.disabled = isStatisticsMultiSelection),
    (ctx.lightStatisticsHeightElement.disabled = isStatisticsMultiSelection),
    (ctx.lightStatisticsScaleElement.disabled = false),
    (ctx.lightStatisticsRotationElement.disabled = false),
    ctx.runBackup(
      ctx.lightStatisticsEntityButtonElement,
      ctx.statisticsReplaceIndex >= 0 ? "选择替换实体" : "选择一个实体",
    ),
    ctx.runZone(lightStatisticsComponent),
    ctx.lightStatisticsEntityMenuElement.hidden || ctx.runAmount(ctx.lightStatisticsEntitySearchElement.value),
    ctx.syncComponentActionControls(lightStatisticsComponent, ctx.lightStatisticsActionControlsElement));
}
