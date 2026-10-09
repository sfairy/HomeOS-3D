/** Vacuum map inspector sync — extracted from home.ts */
import { clampNumber as clampNumber2, roundField as roundField2 } from "./editor-utils";

export interface VacuumMapInspectorContext { [key: string]: any }

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
