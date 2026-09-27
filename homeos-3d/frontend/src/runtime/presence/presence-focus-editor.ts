/**
 * 「人在传感器 · 聚焦视角」配置弹窗：左侧内嵌 3D 预览（mountInteraction3d），右侧是投影方式
 */
import { mountInteraction3d } from "../core/runtime.js";
import {
  createDomFactory,
  interaction3dPreviewSize
} from "../core/static-helpers-editor.js";

type CameraState = {
  mode?: string;
  focalLength?: number;
  [key: string]: unknown;
};

type PresenceItem = {
  id: string;
  floorId?: string;
  [key: string]: unknown;
};

type ComponentProperties = {
  security?: { presenceSensors?: unknown[] };
  floorSelection?: unknown;
  floorCameras?: Record<string, CameraState | null | undefined>;
  camera?: CameraState | null;
  [key: string]: unknown;
};

type ComponentLike = {
  properties?: ComponentProperties;
  [key: string]: unknown;
};

type EditorRuntime = ((() => void) & {
  focusCommand: (
    commandName: string,
    targetId: string,
    payload?: unknown
  ) => Promise<{ camera?: CameraState } | null | undefined>;
}) | null;

type MountOptions = {
  component: ComponentLike;
  context?: { document?: unknown; editable?: boolean };
  editing?: boolean;
  editingModule?: string;
  onPresented?: () => void;
  onLoadError?: (error: Error) => void;
};

type FocusEditorOptions = {
  component: ComponentLike;
  properties: ComponentProperties;
  item: PresenceItem;
  panelDocument?: unknown;
  onSave: (camera: CameraState | null | undefined) => void;
};

const mountEditorRuntime = mountInteraction3d as (
  host: HTMLElement,
  options: MountOptions
) => NonNullable<EditorRuntime>;

const previewSizeOf = interaction3dPreviewSize as (
  component: ComponentLike,
  panelDocument: unknown,
  width: number,
  height: number
) => { width: number; height: number };

/**
 * 打开聚焦视角编辑弹窗（模态，无返回值句柄）。
 */
export function openPresenceFocusEditor({
  component: component,
  properties: properties,
  item: item,
  panelDocument: panelDocument,
  onSave: onSave
}: FocusEditorOptions) {
  const editorDocument = window.document;
  const { el, button } = createDomFactory(editorDocument) as {
    el: (tag: string, className?: string, text?: string) => HTMLElement;
    button: (label: string, onClick: () => void) => HTMLButtonElement;
  };
  const createElement = (tagName: string, initialText = "") => el(tagName, "", initialText);
  const dialogElement = createElement("dialog") as HTMLDialogElement;
  dialogElement.className = "i3d-editor";
  dialogElement.setAttribute("aria-label", "人在传感器聚焦视角");
  // 标记预览作用域：runtime.js 据此识别「哪些弹窗会遮挡 3D 预览」，被遮挡时挂起渲染。
  dialogElement.dataset.i3dPreviewScope = "presence-focus";
  const headerElement = createElement("header");
  const bodyElement = createElement("div");
  bodyElement.className = "i3d-editor-body";
  const viewElement = createElement("div");
  const panelElement = createElement("aside");
  // 初始文案就是加载态：预览挂载完成前用户看到的是这句，出错时会被错误文案覆盖。
  const statusElement = createElement("p", "正在加载户型…");
  viewElement.className = "i3d-editor-view";
  // 三层容器：view（可伸缩）→ aspect（锁定户型长宽比）→ stage（挂 three 画布）。
  const aspectBoxElement = createElement("div");
  const stageHostElement = createElement("div");
  aspectBoxElement.className = "i3d-editor-aspect";
  stageHostElement.className = "i3d-editor-stage";
  aspectBoxElement.append(stageHostElement);
  viewElement.append(aspectBoxElement);
  /**
   * 把预览容器调整到户型应有的长宽比。
   */
  const updatePreviewSize = () => {
    const previewSize = previewSizeOf(
      component,
      panelDocument,
      viewElement.clientWidth,
      viewElement.clientHeight
    );
    Object.assign(aspectBoxElement.style, {
      width: previewSize.width + "px",
      height: previewSize.height + "px"
    });
  };
  // 观察容器而不是 window：弹窗内的可用宽度还会被侧栏、滚动条影响，用元素尺寸最准。
  const previewResizeObserver = new ResizeObserver(updatePreviewSize);
  previewResizeObserver.observe(viewElement);
  let editorRuntime: EditorRuntime = null;
  let isReady = false;
  let isClosed = false;
  let isBusy = false;
  let cameraState: CameraState | null = null;
  // 命令队列的头：每条命令都把它替换成一个「等上一队列完成才放行」的 Promise，
  let commandQueue = Promise.resolve();
  // 收集所有按钮：syncControls 统一按 isReady / isBusy 置灰，省得逐个维护。
  const actionButtons: HTMLButtonElement[] = [];
  /**
   * 造一个按钮并登记到 actionButtons（登记是本文件特有的，故留在这一层）。
   */
  const createButton = (buttonLabel: string, onButtonClick: () => void) => {
    const buttonElement = button(buttonLabel, onButtonClick);
    actionButtons.push(buttonElement);
    return buttonElement;
  };
  /**
   * 关闭弹窗并释放预览运行时。
   */
  const closeEditor = () => {
    if (!isClosed) {
      isClosed = true;
      previewResizeObserver.disconnect();
      editorRuntime?.();
      dialogElement.close();
      dialogElement.remove();
      // 通知外部：遮挡已解除，其它 3D 预览可以恢复渲染。
      editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
    }
  };
  /**
   * 把控件状态对齐到当前相机与忙碌状态。
   */
  const syncControls = () => {
    actionButtons.forEach(actionButton => {
      actionButton.disabled = !isReady || isBusy;
    });
    focalLengthInputElement.disabled = !isReady || isBusy || cameraState?.mode !== "perspective";
    if (editorDocument.activeElement !== focalLengthInputElement) {
      focalLengthInputElement.value = String(Math.round(cameraState?.focalLength || 50));
    }
    for (const [projectionMode, projectionButtonElement] of projectionButtonsByMode) {
      // cameraState 为空（尚未收到快照）时按正交显示，与舞台默认投影保持一致。
      projectionButtonElement.setAttribute(
        "aria-pressed",
        String((cameraState?.mode || "orthographic") === projectionMode)
      );
    }
  };
  /**
   * 串行执行一条相机命令，并用返回的 camera 快照回填状态。
   */
  const runFocusCommand = async (commandName: string, commandPayload?: unknown) => {
    if (!isReady || isBusy || isClosed) {
      return;
    }
    // 拖焦段是高频微调，若也置忙碌态，输入框会在每次往返里闪一下禁用；
    const isFocalLengthCommand = commandName === "focus-focal-length";
    const previousQueuePromise = commandQueue;
    let releaseQueueGate!: () => void;
    commandQueue = new Promise(resolveQueueGate => {
      releaseQueueGate = resolveQueueGate;
    });
    if (!isFocalLengthCommand) {
      isBusy = true;
      syncControls();
    }
    try {
      await previousQueuePromise;
      if (isClosed) {
        return;
      }
      // 聚焦目标是 "presence:<绑定 ID>"：安防模块的存在传感器在舞台侧就是这个 ID 形式。
      const commandResult = await editorRuntime!.focusCommand(
        commandName,
        "presence:" + item.id,
        commandPayload
      );
      if (isClosed) {
        return;
      }
      // 舞台每条相机命令都会回快照；不带 camera 的响应（例如尚未进入聚焦态）不覆盖旧值。
      if (commandResult?.camera) {
        cameraState = commandResult.camera;
      }
      if (commandName === "save-light-camera") {
        // 保存即收尾：先写回编辑器草稿，再关掉弹窗。
        onSave(commandResult?.camera);
        closeEditor();
      } else {
        statusElement.textContent = "拖动旋转，滚轮缩放；调整完成后保存此视角。";
      }
    } catch (commandError) {
      if (!isClosed) {
        statusElement.textContent =
          commandError instanceof Error ? commandError.message : String(commandError);
      }
    } finally {
      releaseQueueGate();
      if (!isFocalLengthCommand) {
        isBusy = false;
      }
      if (!isClosed) {
        syncControls();
      }
    }
  };
  // 「保存此视角」走 save-light-camera：舞台在这条命令里回传相机快照并退出聚焦态。
  const saveButtonElement = createButton("保存此视角", () => {
    void runFocusCommand("save-light-camera");
  });
  saveButtonElement.className = "primary";
  headerElement.append(
    createElement("strong", "人在传感器 · 聚焦视角"),
    saveButtonElement,
    createButton("取消", closeEditor)
  );
  const projectionGroupElement = createElement("div");
  projectionGroupElement.className = "i3d-focus-actions";
  projectionGroupElement.setAttribute("role", "group");
  projectionGroupElement.setAttribute("aria-label", "聚焦投影");
  const projectionButtonsByMode = new Map<string, HTMLButtonElement>();
  // 与舞台的投影模式 ID 一一对应（stage.js 直接把它丢给 setCameraProjection）。
  for (const [modeId, modeLabel] of [
    ["orthographic", "正交"],
    ["perspective", "透视"]
  ] as const) {
    const modeButtonElement = createButton(modeLabel, () => {
      void runFocusCommand("focus-projection", modeId);
    });
    projectionButtonsByMode.set(modeId, modeButtonElement);
    projectionGroupElement.append(modeButtonElement);
  }
  const focalLengthInputElement = createElement("input") as HTMLInputElement;
  // 18~120mm 是舞台侧镜头参数的可用区间（超范围会被夹回），50mm 为标准镜头默认值。
  Object.assign(focalLengthInputElement, {
    type: "number",
    min: "18",
    max: "120",
    step: "1",
    value: "50"
  });
  focalLengthInputElement.setAttribute("aria-label", "焦段（mm）");
  // 监听 change 而不是 input：焦段每敲一个字符都发命令会刷爆队列，等失焦 / 回车更稳。
  focalLengthInputElement.addEventListener("change", () => {
    const typedFocalLength = Number(focalLengthInputElement.value);
    // 删空或非数字就回填当前相机值，不把非法值发给舞台。
    if (!focalLengthInputElement.value.trim() || !Number.isFinite(typedFocalLength)) {
      focalLengthInputElement.value = String(cameraState?.focalLength || 50);
      return;
    }
    focalLengthInputElement.value = String(Math.max(18, Math.min(120, typedFocalLength)));
    void runFocusCommand("focus-focal-length", Number(focalLengthInputElement.value));
  });
  const focalLengthFieldElement = createElement("label");
  focalLengthFieldElement.append(createElement("span", "焦段（mm）"), focalLengthInputElement);
  syncControls();
  panelElement.append(
    statusElement,
    projectionGroupElement,
    focalLengthFieldElement,
    createElement("p", "此视角用于点击小人后的聚焦展示，不弹出控制面板。")
  );
  bodyElement.append(viewElement, panelElement);
  dialogElement.append(headerElement, bodyElement);
  editorDocument.body.append(dialogElement);
  dialogElement.addEventListener("cancel", (cancelEvent: Event) => {
    // Esc 关闭也走统一的 closeEditor，保证预览与事件都清理干净。
    cancelEvent.preventDefault();
    closeEditor();
  });
  dialogElement.showModal();
  updatePreviewSize();
  // 预览只放「这一个传感器」：属性做深拷贝后替换 security.presenceSensors，
  const draftProperties = structuredClone(properties) as ComponentProperties;
  draftProperties.security = {
    presenceSensors: [structuredClone(item)]
  };
  // 相机取「传感器所在楼层」的存档视角；若当前就该楼层则退回当前相机，
  draftProperties.floorSelection = item.floorId;
  draftProperties.camera =
    draftProperties.floorCameras?.[item.floorId || ""] ||
    (properties.floorSelection === item.floorId ? properties.camera : null) ||
    null;
  editorRuntime = mountEditorRuntime(stageHostElement, {
    component: {
      ...component,
      properties: draftProperties
    },
    context: {
      document: panelDocument,
      editable: true
    },
    editing: true,
    editingModule: "security",
    onPresented: () => {
      if (!isReady && !isClosed) {
        isReady = true;
        void runFocusCommand("edit-light-camera");
      }
    },
    onLoadError: (loadError: Error) => {
      statusElement.textContent = loadError.message || String(loadError);
    }
  });
  // 打开时也派发一次：让宿主知道这块预览被弹窗遮挡，先挂起其它预览的渲染。
  editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
}
