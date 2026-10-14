/** Vacuum map inspector sync */
import { clampNumber as clampNumber2, roundField as roundField2 } from "./editor-utils";

export interface VacuumMapInspectorContext {
  /** 字段清单 = 本文件里出现过的袋子取值（`ctx.<key>` / 别名访问 / 解构），由
   *  `ops/studio/studio_context_bag_typing.mjs` 从**真实使用**生成，一个不多一个不少。
   *
   * 类型暂为 `any`：宿主 `home.ts` 的 `findElement()` 仍返回宽类型，控件语义（`.value` /
   * `.checked` / `.options`）由注入点保证。**但开放索引签名已去掉** —— 键名拼错、宿主漏传
   * 一个键现在会被 `tsc` 拦下。下一步是给 `findElement` 建「选择器 → 元素类型」映射，
   * 再把这批字段换成具体类型。 */
  activeProject: any;
  runExtraFallback: any;
  vacuumMapLabelElement: any;
  vacuumMapLeftElement: any;
  vacuumMapOpacityElement: any;
  vacuumMapRotationElement: any;
  vacuumMapScaleElement: any;
  vacuumMapTopElement: any;
}

export function syncVacuumMapInspector(ctx: VacuumMapInspectorContext, vacuumMapComponent: any) {
  const vacuumMapProperties = vacuumMapComponent.properties || {},
    vacuumMapPosition = vacuumMapComponent.position || {},
    vacuumMapCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
    vacuumMapCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
    vacuumMapWidthPx = Number(vacuumMapPosition.width || 100),
    vacuumMapHeightPx = Number(vacuumMapPosition.height || 100);
  ((ctx.vacuumMapLabelElement.value = vacuumMapProperties.label || ""),
    ctx.runExtraFallback(vacuumMapComponent),
    (ctx.vacuumMapOpacityElement.value = roundField2(Number(vacuumMapProperties.opacity ?? 0.5) * 100)),
    (ctx.vacuumMapLeftElement.value = roundField2(
      clampNumber2(
        ((Number(vacuumMapPosition.x || 0) + vacuumMapWidthPx / 2) / vacuumMapCanvasWidthPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.vacuumMapTopElement.value = roundField2(
      clampNumber2(
        ((Number(vacuumMapPosition.y || 0) + vacuumMapHeightPx / 2) / vacuumMapCanvasHeightPx) *
          100,
        0,
        100,
      ),
    )),
    (ctx.vacuumMapScaleElement.value = roundField2(Number(vacuumMapComponent.style?.scale || 1) * 100)),
    (ctx.vacuumMapRotationElement.value = roundField2(Number(vacuumMapPosition.rotation || 0))),
    (ctx.vacuumMapRotationElement.disabled = false),
    (ctx.vacuumMapScaleElement.disabled = false));
}
