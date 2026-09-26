/**
 * 「人在传感器 · 聚焦视角」配置弹窗：左侧内嵌 3D 预览（mountInteraction3d），右侧是投影方式
 * 与焦段控件，用户拖动 / 滚轮调出的结果作为 focusCamera 保存。
 * 与舞台的协议：相机操作走 runtime 的 focusCommand，命令名与 stage.js 的 editor-command 分支
 * 一一对应（edit-light-camera / focus-projection / focus-focal-length / save-light-camera）；
 * 舞台每条命令回一份 camera 快照，本模块据此回填控件，「保存此视角」时交给 onSave 写回草稿。
 * 约定：内嵌预览尺寸由 interaction3dPreviewSize 算出，需用 ResizeObserver 跟随可视区域；
 * 打开 / 关闭时派发 hb-i3d-preview-scope 并给 dialog 打标记，让 runtime.js 挂起 / 恢复渲染；
 * 命令按队列串行执行，避免并发改相机导致回填顺序错乱。
 */
import { mountInteraction3d } from "../core/runtime.js?v=2609260946";
import {
  createDomFactory,
  interaction3dPreviewSize
} from "../core/static-helpers-editor.js?v=2609260946";
/**
 * 打开聚焦视角编辑弹窗（模态，无返回值句柄）。
 */
export function openPresenceFocusEditor({
  component: component,
  properties: properties,
  item: item,
  panelDocument: panelDocument,
  onSave: onSave
}) {
  const editorDocument = window.document;
  // 元素的唯一实现见 /static/shared/dom-factory.js；本文件的历史签名是 (标签名, 文本)。
  const { el, button } = createDomFactory(editorDocument);
  const createElement = (tagName, initialText) => el(tagName, "", initialText);
  const dialogElement = createElement("dialog");
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
   * 尺寸不是固定值：面板文档里可能写了画布比例，也可能随窗口变化，
   * 所以每次都由 interaction3dPreviewSize 现算，而不是缓存。
   */
  const updatePreviewSize = () => {
    const previewSize = interaction3dPreviewSize(
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
  let editorRuntime;
  let isReady = false;
  let isClosed = false;
  let isBusy = false;
  let cameraState = null;
  // 命令队列的头：每条命令都把它替换成一个「等上一队列完成才放行」的 Promise，
  // 从而把并发的 focusCommand 串成一条链（相机只有一份状态，必须按序应用）。
  let commandQueue = Promise.resolve();
  // 收集所有按钮：syncControls 统一按 isReady / isBusy 置灰，省得逐个维护。
  const actionButtons = [];
  /**
   * 造一个按钮并登记到 actionButtons（登记是本文件特有的，故留在这一层）。
   */
  const createButton = (buttonLabel, onButtonClick) => {
    const buttonElement = button(buttonLabel, onButtonClick);
    actionButtons.push(buttonElement);
    return buttonElement;
  };
  /**
   * 关闭弹窗并释放预览运行时。
   * 用 isClosed 做幂等：cancel 事件、保存成功后、异常路径都可能触发，
   * 重复执行会让 editorRuntime 二次销毁并抛错。
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
    // 焦段只对透视投影有意义，正交模式下直接禁用，避免用户改了却没有效果。
    focalLengthInputElement.disabled = !isReady || isBusy || cameraState?.mode !== "perspective";
    // 只在用户没在输入时才回填：否则命令往返一次就会覆盖掉正在敲的数字。
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
  const runFocusCommand = async (commandName, commandPayload) => {
    if (!isReady || isBusy || isClosed) {
      return;
    }
    // 拖焦段是高频微调，若也置忙碌态，输入框会在每次往返里闪一下禁用；
    // 但它仍要排队，保证命令按顺序落到同一份相机状态上。
    const isFocalLengthCommand = commandName === "focus-focal-length";
    const previousQueuePromise = commandQueue;
    let releaseQueueGate;
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
      const commandResult = await editorRuntime.focusCommand(
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
        onSave(commandResult.camera);
        closeEditor();
      } else {
        statusElement.textContent = "拖动旋转，滚轮缩放；调整完成后保存此视角。";
      }
    } catch (commandError) {
      // 失败不关闭弹窗：状态栏提示原因，用户可以直接重试。
      if (!isClosed) {
        statusElement.textContent = commandError.message;
      }
    } finally {
      // 先放行队列再解除忙碌态：否则下一条命令会看到 isBusy 仍为 true 而被拒绝。
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
  const saveButtonElement = createButton("保存此视角", () => runFocusCommand("save-light-camera"));
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
  const projectionButtonsByMode = new Map();
  // 与舞台的投影模式 ID 一一对应（stage.js 直接把它丢给 setCameraProjection）。
  for (const [modeId, modeLabel] of [
    ["orthographic", "正交"],
    ["perspective", "透视"]
  ]) {
    const modeButtonElement = createButton(modeLabel, () =>
      runFocusCommand("focus-projection", modeId)
    );
    projectionButtonsByMode.set(modeId, modeButtonElement);
    projectionGroupElement.append(modeButtonElement);
  }
  const focalLengthInputElement = createElement("input");
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
    runFocusCommand("focus-focal-length", Number(focalLengthInputElement.value));
  });
  const focalLengthFieldElement = createElement("label");
  focalLengthFieldElement.append(createElement("span", "焦段（mm）"), focalLengthInputElement);
  // 先跑一次同步：此时尚未就绪，所有按钮应为禁用，避免用户在预览加载完前点击。
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
  dialogElement.addEventListener("cancel", cancelEvent => {
    // Esc 关闭也走统一的 closeEditor，保证预览与事件都清理干净。
    cancelEvent.preventDefault();
    closeEditor();
  });
  dialogElement.showModal();
  updatePreviewSize();
  // 预览只放「这一个传感器」：属性做深拷贝后替换 security.presenceSensors，
  // 避免预览里出现别的角色干扰调镜头。
  const draftProperties = structuredClone(properties);
  draftProperties.security = {
    presenceSensors: [structuredClone(item)]
  };
  // 相机取「传感器所在楼层」的存档视角；若当前就该楼层则退回当前相机，
  // 都没有时交给舞台用楼层默认视角（null 即默认）。
  draftProperties.floorSelection = item.floorId;
  draftProperties.camera =
    draftProperties.floorCameras?.[item.floorId] ||
    (properties.floorSelection === item.floorId ? properties.camera : null);
  editorRuntime = mountInteraction3d(stageHostElement, {
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
    // 户型呈现完成后才可以发相机命令；只做一次，避免重复进入聚焦态。
    onPresented: () => {
      if (!isReady && !isClosed) {
        isReady = true;
        runFocusCommand("edit-light-camera");
      }
    },
    onLoadError: loadError => {
      statusElement.textContent = loadError.message || String(loadError);
    }
  });
  // 打开时也派发一次：让宿主知道这块预览被弹窗遮挡，先挂起其它预览的渲染。
  editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
}
