import { patchStudioFacadeState } from "../../../../../engine";
import { isCourtyardDrawing as isCourtyardDrawing2 } from "../../../loaders/studio-normalization";
import { lampItemTypeSet } from "../../items/item-catalog";
import type { StudioControlElement } from "../../types/studio-app-types";
import type { StudioAppContext } from "../studio-app-context";

export function refreshStepChecklist(appCtx: StudioAppContext) {
  const stepCompletionFlags = {
      background: !!appCtx.studioState.background,
      scale: !!appCtx.studioState.calibration,
      walls: appCtx.studioState.walls.length > 0 || appCtx.studioState.items.some(isCourtyardDrawing2),
      items: appCtx.studioState.items.some(
        (nonLampCheckItem) => !lampItemTypeSet.has(nonLampCheckItem.type),
      ),
      lights: appCtx.studioState.items.some((lampCheckItem) => lampItemTypeSet.has(lampCheckItem.type)),
      export: appCtx.isExporting,
    },
    activeStepName =
      ["background", "scale", "walls", "items", "lights", "export"].find(
        (stepKey) => !(stepCompletionFlags as any)[stepKey],
      ) || "export";
  for (const stepElement of document.querySelectorAll<StudioControlElement>("[data-step]"))
    (stepElement.classList.toggle("complete", (stepCompletionFlags as any)[stepElement.dataset.step!]),
      stepElement.classList.toggle("active", stepElement.dataset.step === activeStepName));
  patchStudioFacadeState({ workflowStep: activeStepName });
  // 同步 Vue 工作流按钮完成态
  for (const stepButton of document.querySelectorAll<HTMLElement>(".sc-workflow__step[data-step]")) {
    const stepId = stepButton.getAttribute("data-step") || "";
    stepButton.classList.toggle("is-complete", !!(stepCompletionFlags as any)[stepId]);
    stepButton.classList.toggle("is-active", stepId === activeStepName);
  }
}
