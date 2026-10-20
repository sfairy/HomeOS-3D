/** Title button inspector sync */
import { clampNumber as clampNumber2, normalizedFontWeight as normalizedFontWeight2, roundField as roundField2 } from "./editor-utils";
import { setInspectorToggle as setInspectorToggle2 } from "./editor-basic-inspectors";

interface TitleButtonInspectorContext {
  /** 字段清单 = 本文件里出现过的袋子取值（`ctx.<key>` / 别名访问 / 解构），由
   *  `ops/studio/studio_context_bag_typing.mjs` 从**真实使用**生成，一个不多一个不少。
   *
   * 类型暂为 `any`：宿主 `home.ts` 的 `findElement()` 仍返回宽类型，控件语义（`.value` /
   * `.checked` / `.options`）由注入点保证。**但开放索引签名已去掉** —— 键名拼错、宿主漏传
   * 一个键现在会被 `tsc` 拦下。下一步是给 `findElement` 建「选择器 → 元素类型」映射，
   * 再把这批字段换成具体类型。 */
  activeProject: any;
  findReplaceableComponents: any;
  renderLightStatisticsIconPreview: any;
  runAltOuter: any;
  runExtraFallback: any;
  selectedComponentIdsSet: any;
  syncComponentActionControls: any;
  titleButtonActionControlsElement: any;
  titleButtonApplyCountElement: any;
  titleButtonApplyStyleElement: any;
  titleButtonFrameColorElement: any;
  titleButtonFrameOffsetXElement: any;
  titleButtonFrameOffsetYElement: any;
  titleButtonFrameSizeElement: any;
  titleButtonFrameSpacingElement: any;
  titleButtonFrameVisibleElement: any;
  titleButtonFrameWidthElement: any;
  titleButtonHeightElement: any;
  titleButtonIconColorElement: any;
  titleButtonIconLeftElement: any;
  titleButtonIconSizeElement: any;
  titleButtonIconTopElement: any;
  titleButtonIconVisibleElement: any;
  titleButtonLabelElement: any;
  titleButtonLeftElement: any;
  titleButtonMainColorElement: any;
  titleButtonMainLeftElement: any;
  titleButtonMainSizeElement: any;
  titleButtonMainSpacingElement: any;
  titleButtonMainTextElement: any;
  titleButtonMainTopElement: any;
  titleButtonMainVisibleElement: any;
  titleButtonMainWeightElement: any;
  titleButtonMarkerColorElement: any;
  titleButtonMarkerLeftElement: any;
  titleButtonMarkerSizeElement: any;
  titleButtonMarkerTopElement: any;
  titleButtonMarkerVisibleElement: any;
  titleButtonRotationElement: any;
  titleButtonScaleElement: any;
  titleButtonSecondaryColorElement: any;
  titleButtonSecondaryLeftElement: any;
  titleButtonSecondaryLine1Element: any;
  titleButtonSecondaryLine2Element: any;
  titleButtonSecondaryLineGapElement: any;
  titleButtonSecondarySizeElement: any;
  titleButtonSecondarySpacingElement: any;
  titleButtonSecondaryTopElement: any;
  titleButtonSecondaryVisibleElement: any;
  titleButtonSecondaryWeightElement: any;
  titleButtonTopElement: any;
  titleButtonWidthElement: any;
}

export function syncTitleButtonInspector(ctx: TitleButtonInspectorContext, titleButtonComponent: any) {
  const titleProperties = titleButtonComponent.properties || {},
    titlePosition = titleButtonComponent.position || {},
    titleCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
    titleCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
    titleWidthPx = Number(titlePosition.width || 100),
    titleHeightPx = Number(titlePosition.height || 100);
  ((ctx.titleButtonLabelElement.value = titleProperties.label || ""),
    ctx.runExtraFallback(titleButtonComponent),
    setInspectorToggle2(ctx.titleButtonMainVisibleElement, titleProperties.mainTextVisible !== false),
    setInspectorToggle2(
      ctx.titleButtonSecondaryVisibleElement,
      titleProperties.secondaryTextVisible !== false,
    ),
    setInspectorToggle2(ctx.titleButtonFrameVisibleElement, titleProperties.frameVisible !== false),
    setInspectorToggle2(ctx.titleButtonIconVisibleElement, titleProperties.iconVisible !== false),
    (ctx.titleButtonMainTextElement.value = titleProperties.mainText || ""));
  const slice3 = String(titleProperties.secondaryText || "")
    .split(/\r?\n/)
    .slice(0, 2);
  ((ctx.titleButtonSecondaryLine1Element.value = slice3[0] || ""),
    (ctx.titleButtonSecondaryLine2Element.value = slice3[1] || ""),
    (ctx.titleButtonMainColorElement.value = titleProperties.mainColor || "#b9bbc0"),
    (ctx.titleButtonSecondaryColorElement.value = titleProperties.secondaryColor || "#70737b"),
    (ctx.titleButtonMainSizeElement.value = roundField2(Number(titleProperties.mainSize ?? 34))),
    (ctx.titleButtonSecondarySizeElement.value = roundField2(
      Number(titleProperties.secondarySize ?? 12),
    )),
    (ctx.titleButtonMainWeightElement.value = roundField2(
      normalizedFontWeight2(titleProperties.mainWeight, 0.3),
    )),
    (ctx.titleButtonSecondaryWeightElement.value = roundField2(
      normalizedFontWeight2(titleProperties.secondaryWeight, 0.2),
    )),
    (ctx.titleButtonMainSpacingElement.value = roundField2(Number(titleProperties.mainSpacing ?? 1))),
    (ctx.titleButtonSecondarySpacingElement.value = roundField2(
      Number(titleProperties.secondarySpacing ?? 2),
    )),
    (ctx.titleButtonSecondaryLineGapElement.value = roundField2(
      Number(titleProperties.secondaryLineGap ?? 2),
    )),
    (ctx.titleButtonMainLeftElement.value = roundField2(Number(titleProperties.mainTextLeft ?? 5.5))),
    (ctx.titleButtonMainTopElement.value = roundField2(Number(titleProperties.mainTextTop ?? 45))),
    (ctx.titleButtonSecondaryLeftElement.value = roundField2(
      Number(titleProperties.secondaryTextLeft ?? 54),
    )),
    (ctx.titleButtonSecondaryTopElement.value = roundField2(
      Number(titleProperties.secondaryTextTop ?? 43),
    )),
    ctx.renderLightStatisticsIconPreview(titleProperties.icon || ""),
    (ctx.titleButtonIconColorElement.value = titleProperties.iconColor || "#b9bbc0"),
    (ctx.titleButtonIconSizeElement.value = roundField2(Number(titleProperties.iconSize ?? 30))),
    (ctx.titleButtonIconLeftElement.value = roundField2(Number(titleProperties.iconLeft ?? 50))),
    (ctx.titleButtonIconTopElement.value = roundField2(Number(titleProperties.iconTop ?? 45))),
    (ctx.titleButtonFrameColorElement.value = titleProperties.frameColor || "#60636a"),
    (ctx.titleButtonFrameWidthElement.value = roundField2(Number(titleProperties.frameWidth ?? 1.5))),
    (ctx.titleButtonFrameSizeElement.value = roundField2(Number(titleProperties.frameSize ?? 100))),
    (ctx.titleButtonFrameSpacingElement.value = roundField2(
      Number(titleProperties.frameSpacing ?? 100),
    )),
    (ctx.titleButtonFrameOffsetXElement.value = roundField2(Number(titleProperties.frameOffsetX ?? 0))),
    (ctx.titleButtonFrameOffsetYElement.value = roundField2(Number(titleProperties.frameOffsetY ?? 0))),
    (ctx.titleButtonMarkerColorElement.value = titleProperties.markerColor || "#f2a20d"),
    (ctx.titleButtonMarkerSizeElement.value = roundField2(Number(titleProperties.markerSize ?? 10))),
    (ctx.titleButtonMarkerLeftElement.value = roundField2(Number(titleProperties.markerLeft ?? 1.8))),
    (ctx.titleButtonMarkerTopElement.value = roundField2(Number(titleProperties.markerTop ?? 84))));
  const isMarkerVisible = titleProperties.markerVisible !== false;
  (setInspectorToggle2(ctx.titleButtonMarkerVisibleElement, isMarkerVisible),
    (ctx.titleButtonLeftElement.value = roundField2(
      clampNumber2(
        ((Number(titlePosition.x || 0) + titleWidthPx / 2) / titleCanvasWidthPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.titleButtonTopElement.value = roundField2(
      clampNumber2(
        ((Number(titlePosition.y || 0) + titleHeightPx / 2) / titleCanvasHeightPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.titleButtonWidthElement.value = roundField2((titleWidthPx / titleCanvasWidthPx) * 100)),
    (ctx.titleButtonHeightElement.value = roundField2((titleHeightPx / titleCanvasHeightPx) * 100)),
    (ctx.titleButtonScaleElement.value = roundField2(
      Number(titleButtonComponent.style?.scale || 1) * 100,
    )),
    (ctx.titleButtonRotationElement.value = roundField2(Number(titlePosition.rotation || 0))));
  const isTitleMultiSelection = ctx.selectedComponentIdsSet.size > 1;
  for (const titleSizeInputElement of [ctx.titleButtonWidthElement, ctx.titleButtonHeightElement])
    titleSizeInputElement.disabled = isTitleMultiSelection;
  ((ctx.titleButtonRotationElement.disabled = false), (ctx.titleButtonScaleElement.disabled = false));
  const titleReplaceableCount = ctx.findReplaceableComponents(titleButtonComponent).length,
    titleApplyTargetCount = ctx.runAltOuter(titleButtonComponent).length;
  ((ctx.titleButtonApplyStyleElement.disabled = !titleReplaceableCount || !titleApplyTargetCount),
    (ctx.titleButtonApplyCountElement.textContent = titleApplyTargetCount + " 项修改"),
    (ctx.titleButtonApplyStyleElement.textContent = "一键应用到同类型控件"),
    ctx.syncComponentActionControls(titleButtonComponent, ctx.titleButtonActionControlsElement));
}
