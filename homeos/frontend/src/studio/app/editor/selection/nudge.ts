// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，声明级切片）。
// 选中组件的方向键微调（nudge）。

import { airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2 } from "../../renderer/core/renderer";
import { clampNumber as clampNumber2 } from "../editor-utils";
import { findComponent as findComponent2 } from "../component-tree";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface NudgeDeps {
  removalPageEntry: any;
  selectedComponentIdsSet: any;
  mutateDocument: any;
  airConditionerLayerByComponentId: any;
}

export function nudgeDeltaXCore(deps: NudgeDeps, nudgeDeltaY: any, nudgedComponentIds: any) {
  const nl2 = deps.removalPageEntry([...deps.selectedComponentIdsSet]);
  !nl2.length ||
    (!nudgeDeltaY && !nudgedComponentIds) ||
    deps.mutateDocument((nudgeDocument: any) => {
      const nudgeComponents = nl2
        .map((nudgedComponentId: any) => findComponent2(nudgeDocument, nudgedComponentId)?.component)
        .filter(Boolean);
      if (
        !nudgeComponents.length ||
        nudgeComponents.some((nudgedComponent: any) => nudgedComponent.properties?.layoutMode === "fill")
      )
        return;
      const airflowComponent =
        nudgeComponents.length === 1 && nudgeComponents[0].type === "air-conditioner"
          ? nudgeComponents[0]
          : null;
      if (
        airflowComponent &&
        deps.airConditionerLayerByComponentId.get(airflowComponent.id) === "airflow"
      ) {
        const airflowWidth = Math.max(1, Number(airflowComponent.position?.width || 100)),
          airflowHeight = Math.max(1, Number(airflowComponent.position?.height || 100)),
          airflowOffsetBounds = airflowCanvasOffsetBounds2(airflowComponent, nudgeDocument.canvas);
        airflowComponent.properties = {
          ...(airflowComponent.properties || {}),
          airflowOffsetX: clampNumber2(
            Number(airflowComponent.properties?.airflowOffsetX ?? -75) +
              (nudgeDeltaY / airflowWidth) * 100,
            airflowOffsetBounds.minX,
            airflowOffsetBounds.maxX,
          ),
          airflowOffsetY: clampNumber2(
            Number(airflowComponent.properties?.airflowOffsetY ?? 34) +
              (nudgedComponentIds / airflowHeight) * 100,
            airflowOffsetBounds.minY,
            airflowOffsetBounds.maxY,
          ),
        };
        return;
      }
      const nudgeCanvasWidth = Number(nudgeDocument.canvas?.width || 2778),
        nudgeCanvasHeight = Number(nudgeDocument.canvas?.height || 1940),
        nudgeMinDeltaX = Math.max(
          ...nudgeComponents.map(
            (minXComponent: any) =>
              -Number(minXComponent.position?.width || 100) / 2 -
              Number(minXComponent.position?.x || 0),
          ),
        ),
        nudgeMaxDeltaX = Math.min(
          ...nudgeComponents.map(
            (maxXComponent: any) =>
              nudgeCanvasWidth -
              Number(maxXComponent.position?.width || 100) / 2 -
              Number(maxXComponent.position?.x || 0),
          ),
        ),
        nudgeMinDeltaY = Math.max(
          ...nudgeComponents.map(
            (minYComponent: any) =>
              -Number(minYComponent.position?.height || 100) / 2 -
              Number(minYComponent.position?.y || 0),
          ),
        ),
        nudgeMaxDeltaY = Math.min(
          ...nudgeComponents.map(
            (maxYComponent: any) =>
              nudgeCanvasHeight -
              Number(maxYComponent.position?.height || 100) / 2 -
              Number(maxYComponent.position?.y || 0),
          ),
        ),
        clampedNudgeDeltaX = clampNumber2(nudgeDeltaY, nudgeMinDeltaX, nudgeMaxDeltaX),
        clampedNudgeDeltaY = clampNumber2(nudgedComponentIds, nudgeMinDeltaY, nudgeMaxDeltaY);
      for (const nudgedComponentItem of nudgeComponents) {
        if (airflowComponent) {
          const nudgedComponentWidth = Math.max(
              1,
              Number(nudgedComponentItem.position?.width || 100),
            ),
            nudgedComponentHeight = Math.max(
              1,
              Number(nudgedComponentItem.position?.height || 100),
            ),
            nextNudgePosition = {
              ...(nudgedComponentItem.position || {}),
              x: Number(nudgedComponentItem.position?.x || 0) + clampedNudgeDeltaX,
              y: Number(nudgedComponentItem.position?.y || 0) + clampedNudgeDeltaY,
            },
            nudgedAirflowBounds = airflowCanvasOffsetBounds2(
              {
                ...nudgedComponentItem,
                position: nextNudgePosition,
              },
              nudgeDocument.canvas,
            );
          nudgedComponentItem.properties = {
            ...(nudgedComponentItem.properties || {}),
            airflowOffsetX: clampNumber2(
              Number(nudgedComponentItem.properties?.airflowOffsetX ?? -75) -
                (clampedNudgeDeltaX / nudgedComponentWidth) * 100,
              nudgedAirflowBounds.minX,
              nudgedAirflowBounds.maxX,
            ),
            airflowOffsetY: clampNumber2(
              Number(nudgedComponentItem.properties?.airflowOffsetY ?? 34) -
                (clampedNudgeDeltaY / nudgedComponentHeight) * 100,
              nudgedAirflowBounds.minY,
              nudgedAirflowBounds.maxY,
            ),
          };
        }
        nudgedComponentItem.position = {
          ...(nudgedComponentItem.position || {}),
          x: Number(nudgedComponentItem.position?.x || 0) + clampedNudgeDeltaX,
          y: Number(nudgedComponentItem.position?.y || 0) + clampedNudgeDeltaY,
        };
      }
    });
}
