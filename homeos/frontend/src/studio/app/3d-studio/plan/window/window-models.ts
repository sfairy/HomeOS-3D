/**
 * 窗扇「模型」列表（0.8.4）：给开窗器 / 窗磁的选择器提供可选窗扇。
 *
 * 一扇自定义窗可能同时是：
 * - 一个推拉组（整组一起滑）→ 一条正式模型 + 每条面板一条 `legacyModels`；
 * - 若干个平开 / 上悬 / 下悬窗格 → 每格一条模型；
 * - 固定扇 → 不产生模型（选了也动不了）。
 *
 * `x` / `y` 是**平面图坐标**（厘米），`height` 是窗格中心离地高度（米），
 * 用于在 3D 配置面板里把控件摆到对应窗格上。
 */

import { normalizeModelRemark } from "@app/shared/model-remarks";

import { entries, isCustomWindow, type WindowLeaf, type WindowRecord } from "./layout";

/** 窗扇的模型身份：两段都做 URL 转义，和后端 `window_model_id` 完全一致。 */
export const windowModelId = (windowId: unknown, sashId: unknown): string =>
  "window:" + encodeURIComponent(String(windowId)) + ":" + encodeURIComponent(String(sashId));

/**
 * 选择器上的提示文案：这个窗扇是否已经被开窗器 / 窗磁占用。
 *
 * `kind` 取 `window-opener`（开窗器）或 `window`（安防窗户传感器）。
 */
export function windowBindingHint(
  model: any,
  floorId: unknown,
  kind: string,
  floorConfig: any,
): string {
  if (!model || !["window-opener", "window"].includes(kind)) return "";
  const modelIds = new Set<string>([
    model.modelId || model.id,
    ...(model.legacyModels || []).map((legacyModel: any) => legacyModel.modelId || legacyModel.id),
  ]);
  const isOpener = kind === "window-opener";
  const bindings: any[] =
    (isOpener ? floorConfig?.security?.windows : floorConfig?.environment?.windowOpeners) || [];
  return bindings.some(
    (binding) =>
      binding.floorId === floorId &&
      modelIds.has(binding.modelId) &&
      (isOpener ? binding.doorEntityId : binding.entityId),
  )
    ? isOpener
      ? "已配安防窗户传感器"
      : "已配开窗器"
    : "";
}

/**
 * 列出一层楼里所有可绑定的窗扇。
 *
 * `includeLegacy` 为真时把推拉组的历史面板模型也摊平进结果（老配置需要它们才能显示名字），
 * 新配置只用组模型。
 */
export function windowModels(
  floor: any,
  { includeLegacy = true }: { includeLegacy?: boolean } = {},
): any[] {
  const expand = (models: any[]) =>
    includeLegacy ? models.flatMap((model) => [model, ...(model.legacyModels || [])]) : models;
  if (!floor?.scene) return expand((floor?.windowSashes || []).map((sash: any) => ({ ...sash, modelId: sash.modelId || sash.id })));

  const scene = floor.scene;
  const pixelsPerMeter = scene.calibration?.pixelsPerMeter || 100;
  return expand(
    (scene.windows || []).flatMap((window: WindowRecord, windowIndex: number) => {
      const wall = scene.walls?.find((candidate: any) => candidate.id === window.wallId);
      if (!wall || !isCustomWindow(window)) return [];
      const deltaX = wall.end.x - wall.start.x;
      const deltaY = wall.end.y - wall.start.y;
      const wallLength = Math.hypot(deltaX, deltaY);
      if (!wallLength) return [];
      const wallDirection = window.windowDesign?.wallDirection ?? 1;
      return expand(
        entries(window)
          .filter((entry) => !entry.node.children)
          .flatMap((entry, entryIndex) => {
            const node = entry.node;
            if ((node as WindowLeaf).kind === "fixed") return [];
            const buildModel = (
              sashId: string,
              positionRatio: number,
              suffix: string,
              remark: unknown,
            ) => {
              // 窗格中心到整窗中心的偏移（厘米），再沿墙方向投影出平面坐标。
              const offset =
                (entry.x + entry.width * positionRatio - window.width / 2) *
                pixelsPerMeter *
                wallDirection;
              const baseName = normalizeModelRemark(window.remark) || "窗户 " + (windowIndex + 1);
              return {
                id: windowModelId(window.id, sashId),
                modelId: windowModelId(window.id, sashId),
                windowId: window.id,
                sashId,
                name: baseName + " · 窗格 " + (entryIndex + 1) + suffix,
                remark: normalizeModelRemark(remark),
                kind: (node as WindowLeaf).kind,
                x: wall.start.x + deltaX * (window.t ?? 0) + (offset * deltaX) / wallLength,
                y: wall.start.y + deltaY * (window.t ?? 0) + (offset * deltaY) / wallLength,
                height: (window.sill || 0) + window.height - entry.y - entry.height / 2,
              };
            };
            const leaf = node as WindowLeaf;
            const groupModel = buildModel(
              leaf.id,
              0.5,
              leaf.kind === "sliding" ? " 推拉窗组" : "",
              (window.windowDesign?.sashRemarks || {})[leaf.id],
            ) as any;
            if (leaf.kind === "sliding" && leaf.panelIds?.length)
              groupModel.legacyModels = leaf.panelIds.map((panelId, panelIndex) =>
                buildModel(
                  panelId,
                  (panelIndex + 0.5) / leaf.panelIds.length,
                  " 第 " + (panelIndex + 1) + " 扇",
                  window.windowDesign?.sashRemarks?.[panelId],
                ),
              );
            return [groupModel];
          }),
      );
    }),
  );
}
