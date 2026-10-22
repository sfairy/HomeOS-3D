/**
 * 配置编辑器「编辑会话」域：条目 → 可持久化形状（`buildItemPayload`）、
 * 与基线的字段差异（`listChangedFields`）、切换设备种类的会话重建（`switchEditorKind`）。
 *
 * `fieldDefs` / `baselineItemsById` 是 `editorSession.*` 上的可变单元（见接口注释）。
 */

import { CARD_TEXT_SIZE_PX } from "@app/bridge/presets/card-text-size";
import { DEFAULT_BUTTON_SIZE, buttonIconSize } from "@app/bridge/presets/button-icon-size";
import { GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2 } from "../../../device/generic-device-catalog";
import { readNestedPath } from "../_shared";

/**
 * 编辑会话域需要的外部句柄。
 *
 * 这一族的可变状态是**宿主每实例一份**的，所以不能提到模块级：`editorSession`（字段清单 + 条目基线）
 * 与 `kindSessionsByKind`（各设备种类的会话快照）由宿主创建后按引用注入，模块内只读写字段、不重新绑定。
 * 其余都是宿主里的兄弟函数（函数声明，提升到函数体顶部）。
 */
export interface PanelSessionDeps {
  /** 配置编辑器上下文对象（`editorHost.deviceKind` / `editorHost.usesModelBinding` / `editorHost.getItemList` 等）。 */
  editorHost: any;
  /** 编辑会话基线（**可变单元**，宿主每实例一份）。 */
  editorSession: { fieldDefs: any[][]; baselineItemsById: Map<any, any> };
  /** 按设备种类缓存的会话快照（`const Map`，模块内只增删改、不重新绑定）。 */
  kindSessionsByKind: Map<any, any>;
  /** 关闭「新增」确认弹窗。 */
  closeAddDialog: () => any;
  /** 关闭「辅助弹窗」。 */
  closeAuxDialog: () => any;
  /** 条目集合规整。 */
  ensureItemCollections: () => any;
  /** 可编辑字段清单构造器。 */
  buildEditableFieldList: () => any[][];
  /** 整面板重绘。 */
  renderPanel: () => any;
  /** 局部重绘编辑器预览。 */
  refreshEditorPreview: () => any;
  /** 新增条目弹窗。 */
  openAddDialog: (addDialogTriggerEvent?: any) => any;
}

export function buildItemPayload(deps: PanelSessionDeps, item: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost } = deps;
      return editorHost.deviceKind === "smallcar"
        ? {
            cardWidth: item.cardWidth ?? 180,
            cardFontSize: item.cardFontSize ?? CARD_TEXT_SIZE_PX,
            cardOpacity: item.cardOpacity ?? 1,
            tirePressure: item.tirePressure?.enabled
              ? item.tirePressure.mode === "named"
                ? "数值和轮位"
                : "简洁数值"
              : "关闭",
            buttonVisibility: item.buttonHidden
              ? "隐藏（不可点击）"
              : item.hiddenClickable
                ? "隐藏（可点击）"
                : "显示",
          }
        : editorHost.usesModelBinding
          ? {
              icon: item.icon || editorHost.defaultIcon,
              size: item.size ?? DEFAULT_BUTTON_SIZE,
              iconSize: item.iconSize ?? buttonIconSize(item.size ?? DEFAULT_BUTTON_SIZE),
              hitSize: item.hitSize ?? Math.max(DEFAULT_BUTTON_SIZE, item.size ?? DEFAULT_BUTTON_SIZE),
              ...(editorHost.isVacuumMode
                ? {
                    backgroundOpacity: item.backgroundOpacity ?? 1,
                  }
                : {}),
              ...(editorHost.isVacuumShortcutMode
                ? {
                    fontSize: item.fontSize ?? CARD_TEXT_SIZE_PX,
                    iconHidden: item.iconHidden === true,
                    labelHidden: item.labelHidden === true,
                  }
                : {}),
              buttonVisibility:
                item.buttonHidden === true
                  ? "隐藏（不可点击）"
                  : item.hiddenClickable === true
                    ? "隐藏（可点击）"
                    : "显示",
            }
          : {
              size: item.size ?? DEFAULT_BUTTON_SIZE,
              iconSize: item.iconSize ?? buttonIconSize(item.size ?? DEFAULT_BUTTON_SIZE),
              hitSize: item.hitSize ?? Math.max(DEFAULT_BUTTON_SIZE, item.size ?? DEFAULT_BUTTON_SIZE),
              fadeDuration: item.fadeDuration ?? 0.3,
              // 灯光专属：不入载荷时 `listChangedFields` 永远判为未改，
              // 「一键应用到其他灯光」也不会带上这一项。其它种类的条目没有这个字段，
              // 不写进去以免后端按分区白名单 422。
              ...(editorHost.deviceKind === "light"
                ? {
                    temperatureFallback:
                      item.temperatureFallback === "floorplan" ? "floorplan" : "default",
                  }
                : {}),
            };
    }

export function listChangedFields(deps: PanelSessionDeps, changedItem: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorSession } = deps;
      editorSession.baselineItemsById.has(changedItem.id) ||
        editorSession.baselineItemsById.set(changedItem.id, structuredClone(changedItem));
      const baselinePayload = buildItemPayload(deps, editorSession.baselineItemsById.get(changedItem.id)),
        currentPayload = buildItemPayload(deps, changedItem);
      return editorSession.fieldDefs.filter(
        ([payloadFieldName]) =>
          readNestedPath(baselinePayload, payloadFieldName) !==
          readNestedPath(currentPayload, payloadFieldName),
      );
    }

export async function switchEditorKind(
  deps: PanelSessionDeps,
  nextDeviceKind: any,
  shouldOpenAddDialog = false,
  selection: any = null,
) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, editorSession, kindSessionsByKind, closeAddDialog, closeAuxDialog, ensureItemCollections, buildEditableFieldList, renderPanel, refreshEditorPreview, openAddDialog } = deps;
      if (
        editorHost.isDisposed ||
        editorHost.isSaving ||
        !editorHost.isAccessAllowed ||
        editorHost.isCameraEditing ||
        editorHost.isCameraCommandPending ||
        editorHost.isRangeEditorOpen ||
        nextDeviceKind === editorHost.deviceKind ||
        !(
          editorHost.includes
            ? ["climate", "fan", "exhaust-fan", "purifier", "cover", "temperature-humidity"]
            : editorHost.isDeviceKind
              ? ["nas", "television", "speaker", "water-heater", "airer", ...GENERIC_DEVICE_KINDS2]
              : ["vacuum", "vacuum-shortcut"]
        ).includes(nextDeviceKind)
      )
        return;
      (kindSessionsByKind.set(editorHost.deviceKind, {
        selectedId: editorHost.text,
        scrollTop: editorHost.panelElement.scrollTop,
        baselines: editorSession.baselineItemsById,
      }),
        editorHost.isVacuumMode && (editorHost.vacuumId = editorHost.text || editorHost.vacuumId),
        selection?.vacuumId && (editorHost.vacuumId = selection.vacuumId),
        closeAddDialog(),
        closeAuxDialog(),
        editorHost.pickerGeneration++,
        editorHost.pickerHandle?.close(),
        (editorHost.pickerHandle = null),
        editorHost.num++,
        (editorHost.isCameraEditing = false),
        (editorHost.isCameraCommandPending = false),
        (editorHost.pendingCameraDraft = null),
        (editorHost.vacuumCameraMode = "focus"),
        editorHost.applyKindFlags(nextDeviceKind),
        ensureItemCollections());
      const savedKindSession = kindSessionsByKind.get(nextDeviceKind);
      ((editorHost.text =
        selection?.id ||
        (editorHost.isVacuumMode ? editorHost.vacuumId : savedKindSession?.selectedId || "")),
        editorHost.isVacuumMode && editorHost.findVacuumModel() && (editorHost.floorSelection = editorHost.findVacuumModel().floorId),
        (editorSession.fieldDefs = buildEditableFieldList()),
        (editorSession.baselineItemsById =
          savedKindSession?.baselines ||
          new Map(
            editorHost.getItemList().map((baselineListItem: any) => [
              baselineListItem.id,
              structuredClone(baselineListItem),
            ]),
          )),
        (editorHost.errorMessageElement.textContent = ""),
        renderPanel(),
        refreshEditorPreview(),
        (editorHost.panelElement.scrollTop = savedKindSession?.scrollTop || 0),
        shouldOpenAddDialog && openAddDialog());
    }
