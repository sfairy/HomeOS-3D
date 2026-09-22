/**
 * 灯光照射范围编辑器（平面 / 3D 双视图）：舞台侧通过 range-editor 消息打开，以独立浮层挂在
 * 容器的 ownerDocument 上，直接读写宿主注入的 regionLighting（区域布光系统）。
 *
 * 数据模型：覆盖以 regionKey = [区域 ID, 灯具 ID] 为键，值是光区的几何与离地参数；编辑先写本地副本
 * 并即时反馈到场景，只有 commitOverrides 才回调宿主，故「改到一半关掉」不会污染已保存配置。
 * 取值口径：宽 / 深 0.5~20 米（两位小数）；离地 0~20 米，0 表示本层地面；柔和度界面按 5%~100%
 * 展示、写入时换算成 0.05~1 的比例。对外只导出 mountRegionRangeEditor。
 */
// 夹取与换算统一走 utils/numbers.js（唯一实现，经 static-helpers 桥取用）。
import {
  capturePointer,
  clampNumber,
  coercedFiniteNumberOr,
  createDomFactory,
  paletteColor,
  positionFloatingMenu,
  releasePointer,
  stepNumberInput as sharedStepNumberInput
} from "../core/static-helpers.js?v=2609221451";
// 表单读出来的都是字符串：统一转成有限数字，非法值（NaN / 空串 / 布尔）回落到兜底值。
// 不这样做的话，一个空输入框就能把整层的光照参数变成 NaN，画面会直接黑掉。
// 「空串必须回落」是有意的：`Number("")` 是 0，直接换算会把「用户清空了输入框」当成 0 写进配置。
// 覆盖对象是纯数据（无函数 / 无循环引用），用 JSON 深拷贝最省事；
// 顺带把 undefined 兜底成空对象。
const deepCloneObject = sourceObject => JSON.parse(JSON.stringify(sourceObject || {}));
// 保留两位小数（厘米级精度）：避免把 0.30000000000000004 这类浮点噪声写进配置，
// 也保证前后端比较时不会因为尾差判定为「改过了」。
const roundToHundredth = numericInput => Math.round(numericInput * 100) / 100;

/**
 * 光区编辑器的取色。SVG 的 fill / stroke 属性和 canvas 一样读不到 CSS 变量
 * （`stroke: "var(--hos-accent)"` 会被静默忽略，画笔保持上一次的值），
 * 所以品牌色必须从调色板令牌里现取一次再派生。
 *
 * 惰性 + 记忆化：`paletteColor` 按令牌名缓存**第一次**取到的值，所以不能放在模块求值时
 * （那一刻运行期调色板可能还没挂上，会把兜底色永久缓存下来）。放到首次绘制时取，
 * 一次取齐后复用，不会被每帧重绘拖着反复算。
 *
 * 18 枚色阶全部由主控色（--hos-accent*）与传感器灰（--hos-sensor / --hos-sky-haze）派生 ——
 * 原来是一组写死的暖色十六进制，管理员换掉主控色后这层光区纹丝不动。
 */
let rangeEditorPaletteCache = null;
function rangeEditorPalette() {
  if (rangeEditorPaletteCache) return rangeEditorPaletteCache;
  const accentRgb = paletteColor("--hos-accent-rgb", "255, 196, 106");
  rangeEditorPaletteCache = {
    // 当前光区：面 + 边，以及柔和度内圈。
    regionFill: `rgba(${accentRgb}, 0.07)`,
    regionStroke: paletteColor("--hos-accent", "#ffc46a"),
    softnessStroke: paletteColor("--hos-accent-bright", "#ffd9a0"),
    // 未选中的其它光区走传感器灰，与主控暖色分开（原来是一枚 #99afc0）。
    idleStroke: paletteColor("--hos-sensor", "#9eb0c4"),
    idleMarkerFill: paletteColor("--hos-ink", "#f1f7fb"),
    idleMarkerStroke: paletteColor("--hos-sky-haze", "#536777"),
    // 三种拖拽手柄与连线。
    handleFill: paletteColor("--hos-accent-bright", "#ffd9a0"),
    handleStroke: paletteColor("--hos-accent-deep", "#e09523"),
    handleHalo: `rgba(${accentRgb}, 0.2)`,
    guideStroke: paletteColor("--hos-accent-deep", "#e09523"),
    // 保存失败时的状态文案（原来是 #ffc28d）。
    warningText: paletteColor("--hos-accent-bright", "#ffd9a0")
  };
  return rangeEditorPaletteCache;
}
// 光区键：用 JSON.stringify 序列化 [区域 ID, 灯具 ID]，而不是拼分隔符 ——
// ID 里一旦出现分隔符，拼接就会撞键。
const toRegionKey = (areaIdPart, lightIdPart) =>
  JSON.stringify([String(areaIdPart), String(lightIdPart)]);
/**
 * 按拖拽的手柄计算光区的新宽高（纯函数，便于单测）。
 * 拖南北向手柄只改深度、拖东西向只改宽度；等比模式取变化更大的那一轴作为缩放系数，
 * 并夹取到「宽深都不越界」的共同区间，最后统一保留两位小数。
 */
function resizeRegionDimensions(
  sourceRegion,
  requestedWidth,
  requestedDepth,
  handleName,
  shouldKeepAspect = false
) {
  if (["n", "s"].includes(handleName)) {
    requestedWidth = sourceRegion.width;
  }
  if (["w", "e"].includes(handleName)) {
    requestedDepth = sourceRegion.depth;
  }
  if (shouldKeepAspect) {
    const widthRatio = requestedWidth / sourceRegion.width;
    const depthRatio = requestedDepth / sourceRegion.depth;
    let uniformScale = ["w", "e"].includes(handleName)
      ? widthRatio
      : ["n", "s"].includes(handleName)
        ? depthRatio
        : Math.abs(widthRatio - 1) >= Math.abs(depthRatio - 1)
          ? widthRatio
          : depthRatio;
    uniformScale = clampNumber(
      uniformScale,
      Math.max(0.5 / sourceRegion.width, 0.5 / sourceRegion.depth),
      Math.min(20 / sourceRegion.width, 20 / sourceRegion.depth)
    );
    return {
      width: roundToHundredth(sourceRegion.width * uniformScale),
      depth: roundToHundredth(sourceRegion.depth * uniformScale)
    };
  }
  return {
    width: roundToHundredth(clampNumber(requestedWidth, 0.5, 20)),
    depth: roundToHundredth(clampNumber(requestedDepth, 0.5, 20))
  };
}
/**
 * 生成离地高度的补丁，并保证下限不高于上限。
 * 用户把下限调到上限之上时直接把另一端改成同一个值（而非拒绝输入），拖到边界时手感是「推着另一端走」；
 * heightAbove / heightBelow 是旧的自动推算字段，这里显式置 undefined，由调用方删除，避免两套字段同时存在。
 */
function regionHeightPatch(regionDescriptor, changedField, fieldValue) {
  const heightPatch = {
    heightAbove: undefined,
    heightBelow: undefined,
    heightMin:
      regionDescriptor.heightMin === undefined
        ? undefined
        : clampNumber(regionDescriptor.heightMin, 0, 20),
    heightMax:
      regionDescriptor.heightMax === undefined
        ? undefined
        : clampNumber(regionDescriptor.heightMax, 0, 20),
    [changedField]: fieldValue
  };
  if (
    heightPatch.heightMin !== undefined &&
    heightPatch.heightMax !== undefined &&
    heightPatch.heightMin > heightPatch.heightMax
  ) {
    heightPatch[changedField === "heightMin" ? "heightMax" : "heightMin"] = fieldValue;
  }
  return heightPatch;
}
/**
 * 挂载照射范围编辑器浮层。
 * 编辑器自己管一份覆盖集合，编辑时即时作用到场景，提交时通过 onChange 交回宿主；
 * 平面与 3D 预览两套相机状态各自保存，来回切换不会互相打断。
 */
export function mountRegionRangeEditor(
  editorHost,
  {
    getConfig: getConfig = () => ({}),
    onChange: onChange = () => {},
    onClose: onClose = () => {},
    wake: wake = () => {},
    standalone: standalone = false
  } = {}
) {
  const editorDocument = editorHost.container.ownerDocument;
  const editorWindow = editorDocument.defaultView;
  const threeNamespace = editorHost.THREE;
  // 面板结构一次性用 innerHTML 拼出（含大量静态文案与 aria 标签），
  // 之后统一用 data-field / data-action 取控件；改界面只需改这一段字符串。
  const editorElement = editorDocument.createElement("section");
  editorElement.className = "plan2-range-editor";
  editorElement.dataset.testid = "range-editor";
  editorElement.hidden = true;
  editorElement.setAttribute("aria-label", "平面光区编辑");
  editorElement.innerHTML =
    '\n    <svg aria-label="灯具与照射范围" role="group"></svg>\n    <header class="p2r-top"><div class="p2r-title">平面光区编辑<small>拖动边角调整范围，按住 Shift 等比例缩放</small></div><span class="p2r-compact-caption">自由拖动 · Shift 等比</span></header>\n    <div class="p2r-panel">\n      <h3>照射范围</h3>\n      <div class="p2r-view-switch" role="group" aria-label="编辑视图">\n        <button type="button" data-action="view-plan" aria-pressed="true">平面编辑</button>\n        <button type="button" data-action="view-3d" aria-pressed="false">3D 预览</button>\n      </div>\n      <div class="p2r-selectors">\n        <label class="p2r-field">楼层<select data-field="floor" aria-label="楼层"></select></label>\n        <label class="p2r-field">灯具<select data-field="fixture" aria-label="灯具"></select></label>\n      </div>\n      <div class="p2r-grid">\n        <label class="p2r-field p2r-shape">光区形状<select data-field="shape" aria-label="光区形状"><option value="circle">圆形</option><option value="square">方形</option></select></label>\n        <label class="p2r-field"><span data-width-label>宽度（米）</span><input data-field="width" aria-label="宽度（米）" type="number" min="0.5" max="20" step="0.1" inputmode="decimal"></label>\n        <label class="p2r-field"><span data-depth-label>深度（米）</span><input data-field="depth" aria-label="深度（米）" type="number" min="0.5" max="20" step="0.1" inputmode="decimal"></label>\n        <label class="p2r-field p2r-rotation">旋转（度）<input data-field="rotation" aria-label="旋转（度）" type="number" min="-180" max="180" step="1" inputmode="decimal"></label>\n        <label class="p2r-field p2r-soft-field">边缘柔和度<span class="p2r-softness"><input data-field="softness" aria-label="边缘柔和度" type="range" min="5" max="100" step="1"><output data-soft-value>35%</output></span></label>\n      </div>\n      <h3>离地照明范围</h3>\n      <div class="p2r-grid">\n        <label class="p2r-field">最低照到（米）<input data-field="heightMin" aria-label="最低照到（米）" type="number" min="0" max="20" step="0.05" placeholder="自动" inputmode="decimal"></label>\n        <label class="p2r-field">最高照到（米）<input data-field="heightMax" aria-label="最高照到（米）" type="number" min="0" max="20" step="0.05" placeholder="自动" inputmode="decimal"></label>\n      </div>\n      <p class="p2r-status" data-height-summary></p>\n      <p class="p2r-status">从本层地面算起，0 米是地面；留空自动。切到“3D 预览”可边调高度边看效果。</p>\n      <div class="p2r-options">\n        <label class="p2r-check i3d-setting-toggle"><input data-field="moveCenter" type="checkbox">允许移动范围中心</label>\n        <label class="p2r-check i3d-setting-toggle"><input data-field="group" type="checkbox">同步本组范围</label>\n        <label class="p2r-check i3d-setting-toggle"><input data-field="preview" type="checkbox"><span data-preview-label>仅预览当前灯</span></label>\n      </div>\n      <div class="p2r-actions"><button type="button" data-action="reset-center">中心回到灯位</button><button type="button" data-action="reset">恢复模型默认</button><button type="button" class="p2r-done" data-action="close">完成</button></div>\n      <p class="p2r-status" role="status" aria-live="polite"></p>\n    </div>\n    <div class="p2r-help">外边界为光照衰减到零的位置 · 范围不代表墙体挡光</div>';
  // 独立会话（standalone）没有宿主弹窗可关，把「完成」按钮藏掉，
  // 关闭动作由宿主驱动。
  editorElement.querySelector("[data-action=close]").hidden = standalone;
  editorHost.container.append(editorElement);
  const svgElement = editorElement.querySelector("svg");
  const panelElement = editorElement.querySelector(".p2r-panel");
  const fieldElements = Object.fromEntries(
    [...editorElement.querySelectorAll("[data-field]")].map(fieldElement => [
      fieldElement.dataset.field,
      fieldElement
    ])
  );
  const statusElement = editorElement.querySelector(".p2r-status[role=status]");
  const softnessOutputElement = editorElement.querySelector("[data-soft-value]");
  const formControls = mountRangeFormControls(editorElement);
  const raycaster = new threeNamespace.Raycaster();
  const pointerNdc = new threeNamespace.Vector2();
  // 拾取地面用数学平面做射线求交，而不是求交场景网格：
  // 地面只是视觉平面没有实体几何，算平面交点更快、也不受地板贴图边界影响。
  const groundPlane = new threeNamespace.Plane(new threeNamespace.Vector3(0, 1, 0), 0);
  let isOpen = false;
  let isDisposed = false;
  // 本次编辑产生的覆盖集合（regionKey → 光区参数）：编辑期间先落在这里并即时生效，
  // 只有 commitOverrides 才把它交回宿主。
  let overridesByRegionKey = {};
  let regions = [];
  let selectedRegionKey = "";
  let activeFloorId = "";
  let saveErrorMessage = "";
  let openedCameraState = null;
  let requestedFloorSelection = "";
  // 进入编辑器前轨道控制的开关状态：退出时必须按原样恢复，
  // 否则用户会莫名其妙地转不动视角。
  let previousControlsEnabled = true;
  let topViewCameraState = null;
  let is3dPreview = false;
  // 平面编辑与 3D 预览各自的相机快照：来回切换时各自还原，
  // 不复用同一份 —— 两种视图的取景需求本来就不同。
  let savedCameraState3d = null;
  let savedCameraStatePlan = null;
  let dragState = null;
  let animationFrameId = 0;
  let pendingFit = false;
  let isFittingCamera = false;
  let cameraChangeUnsubscribe = null;
  let lastWidthPx = 0;
  let lastHeightPx = 0;
  // 3D 编辑器暴露的光区接口对象（listRegions、拖拽回写等能力都挂在它上面）。
  const getRegionLighting = () => editorHost.regionLighting;
  // 当前选中的光区项；列表重建后可能已不存在，调用方要容忍 undefined。
  const getSelectedRegion = () =>
    regions.find(matchingRegion => matchingRegion.key === selectedRegionKey);
  // 配置里的楼层 ID 可能是数字、场景元数据里是字符串，因此统一转成字符串比较。
  const findFloorById = floorId =>
    (editorHost.document?.floors || []).find(floor => String(floor.id) === String(floorId));
  // 取当前光区的「同组兄弟」：有 groupId 时按组匹配，否则退化成只匹配它自己。
  // 「整组一起调」的开关会用它把一次改动扩散到整组。
  const findRegionSiblings = sourceRegionItem =>
    sourceRegionItem
      ? regions.filter(
          siblingCandidate =>
            String(siblingCandidate.floorId) === String(sourceRegionItem.floorId) &&
            (sourceRegionItem.groupId
              ? siblingCandidate.groupId === sourceRegionItem.groupId
              : siblingCandidate.key === sourceRegionItem.key)
        )
      : [];
  // 本次编辑实际波及的光区键：勾了「整组」就展开为同组兄弟，否则只有当前选中的那个。
  const getAffectedRegionKeys = () =>
    fieldElements.group.checked
      ? findRegionSiblings(getSelectedRegion()).map(groupRegion => groupRegion.key)
      : getSelectedRegion()
        ? [selectedRegionKey]
        : [];
  // 重建当前楼层的光区列表（配置或楼层变化后调用）。
  function reloadRegionList() {
    regions = (getRegionLighting()?.listRegions?.() || []).map(rawRegion => {
      const regionFloor = findFloorById(rawRegion.floorId);
      const matchedSceneItem = regionFloor?.scene?.items?.find(
        sceneItem => String(sceneItem.id) === String(rawRegion.id)
      );
      const lightGroupId = matchedSceneItem?.lightGroupId || "";
      const lightEntry = (getConfig()?.lights || []).find(
        lightConfig =>
          String(lightConfig.floorId) === String(rawRegion.floorId) &&
          lightConfig.groupId === lightGroupId
      );
      const lightGroupEntry = regionFloor?.scene?.lightGroups?.find(
        lightGroup => lightGroup.id === lightGroupId
      );
      return {
        ...rawRegion,
        key: rawRegion.key || toRegionKey(rawRegion.floorId, rawRegion.id),
        groupId: lightGroupId,
        label: lightEntry?.label || lightGroupEntry?.name || matchedSceneItem?.name || "灯具"
      };
    });
    for (const regionItem of regions) {
      const siblingRegions = findRegionSiblings(regionItem);
      regionItem.fixtureLabel =
        "" +
        regionItem.label +
        (siblingRegions.length > 1
          ? " · " +
            (siblingRegions.findIndex(siblingRegion => siblingRegion.key === regionItem.key) + 1) +
            "/" +
            siblingRegions.length
          : "");
    }
    const floorRegions = regions.filter(
      floorRegion => String(floorRegion.floorId) === activeFloorId
    );
    if (!floorRegions.some(regionEntry => regionEntry.key === selectedRegionKey)) {
      selectedRegionKey = floorRegions[0]?.key || "";
    }
  }
  // 下拉选项元素，值用 value 属性承载，供后续按值回填选中项。
  function createOptionElement(optionValue, optionLabel) {
    const optionElement = editorDocument.createElement("option");
    optionElement.value = optionValue;
    optionElement.textContent = optionLabel;
    return optionElement;
  }
  // 表单 → 界面回填：面板上所有控件与状态文案都在这一个地方刷新，
  // 避免各处零散赋值造成「改了但没显示」的不一致。
  function syncFormState() {
    fieldElements.floor.replaceChildren(
      ...(editorHost.document?.floors || []).map(floorEntry =>
        createOptionElement(String(floorEntry.id), floorEntry.name || "楼层")
      )
    );
    fieldElements.floor.value = activeFloorId;
    fieldElements.fixture.replaceChildren(
      ...regions
        .filter(floorRegionEntry => String(floorRegionEntry.floorId) === activeFloorId)
        .map(selectedFloorRegion =>
          createOptionElement(selectedFloorRegion.key, selectedFloorRegion.fixtureLabel)
        )
    );
    fieldElements.fixture.value = selectedRegionKey;
    const selectedRegion = getSelectedRegion();
    const hasSelectedRegion = !!selectedRegion;
    const selectedSiblings = findRegionSiblings(selectedRegion);
    for (const fieldToDisable of [
      "fixture",
      "shape",
      "width",
      "depth",
      "rotation",
      "softness",
      "preview",
      "moveCenter",
      "heightMin",
      "heightMax"
    ]) {
      fieldElements[fieldToDisable].disabled = !hasSelectedRegion;
    }
    fieldElements.group.disabled = selectedSiblings.length < 2;
    editorElement.querySelector("[data-preview-label]").textContent =
      fieldElements.group.checked && selectedSiblings.length > 1
        ? "仅预览当前灯组"
        : "仅预览当前灯";
    editorElement.querySelector("[data-action=reset]").disabled = !hasSelectedRegion;
    editorElement.querySelector("[data-action=reset-center]").hidden =
      !selectedRegion || (!selectedRegion.offsetX && !selectedRegion.offsetZ);
    fieldElements.moveCenter.checked = selectedRegion?.moveCenterEnabled === true;
    if (selectedRegion) {
      fieldElements.shape.value = ["square", "strip"].includes(selectedRegion.shape)
        ? "square"
        : "circle";
      for (const sizeField of ["width", "depth", "rotation"]) {
        if (editorDocument.activeElement !== fieldElements[sizeField]) {
          fieldElements[sizeField].value = roundToHundredth(selectedRegion[sizeField]);
        }
      }
      for (const heightField of ["heightMin", "heightMax"]) {
        if (editorDocument.activeElement !== fieldElements[heightField]) {
          fieldElements[heightField].value =
            selectedRegion[heightField] === undefined
              ? ""
              : roundToHundredth(selectedRegion[heightField]);
        }
      }
      // 光照高度区间的显示文案：未设置（undefined）显示「自动」，0 及以下显示「地面」，
      // 其余保留两位小数加「米」——与输入框的回填精度保持一致。
      const formatHeightText = heightLevel =>
        heightLevel === undefined
          ? "自动"
          : heightLevel <= 0
            ? "地面"
            : roundToHundredth(heightLevel) + " 米";
      editorElement.querySelector("[data-height-summary]").textContent =
        "灯具离地 " +
        roundToHundredth(selectedRegion.lampHeight || 0) +
        " 米 · 照明：" +
        formatHeightText(selectedRegion.heightMin) +
        " ～ " +
        formatHeightText(selectedRegion.heightMax);
      fieldElements.softness.value = Math.round(selectedRegion.softness * 100);
      softnessOutputElement.value = fieldElements.softness.value + "%";
      statusElement.textContent =
        fieldElements.group.checked && selectedSiblings.length > 1
          ? "本组 " + selectedSiblings.length + " 盏 · 修改会同步到各自灯位"
          : selectedSiblings.length > 1
            ? "本组 " + selectedSiblings.length + " 盏 · 当前只调整这一盏"
            : is3dPreview
              ? "旋转或缩放查看效果 · 修改高度实时预览"
              : selectedRegion.moveCenterEnabled
                ? "拖动光区或中心十字移动范围 · 灯位不变"
                : "范围中心已锁定 · 可拖动边角调整大小";
    } else {
      statusElement.textContent = "当前楼层暂无可编辑灯具，请切换楼层。";
    }
    if (saveErrorMessage) {
      statusElement.textContent = "本次保存未成功：" + saveErrorMessage + "。当前预览仍保留。";
      statusElement.style.color = rangeEditorPalette().warningText;
    } else {
      statusElement.style.removeProperty("color");
    }
    formControls.sync();
  }
  // 「仅预览当前灯」：只把受影响的光区设为预览态、其余保持常态，方便对照效果。
  function applyPreviewToScene() {
    const previewKeys = fieldElements.preview.checked ? getAffectedRegionKeys() : null;
    getRegionLighting()?.setPreview?.(previewKeys);
    editorHost.invalidateRegionLighting?.();
    wake();
  }
  // 写入覆盖的核心：以场景实际光区值打底，叠加已有覆盖，再叠本次补丁（勾了「同步本组范围」时写到该组所有光区）；
  // 高度字段为 undefined 的一律删掉 —— 留着会参与序列化比较，导致脏标记误判。
  // shouldRefreshControls 用于需要立刻交回宿主的操作（例如重置）。
  function applyOverride(overridePatch, shouldRefreshControls = false) {
    if (getSelectedRegion()) {
      for (const affectedRegionKey of getAffectedRegionKeys()) {
        const overrideRegionEntry = regions.find(
          overrideRegion => overrideRegion.key === affectedRegionKey
        );
        const patchedOverride = overridePatch.heightEdit
          ? regionHeightPatch(
              overrideRegionEntry,
              overridePatch.heightEdit.field,
              overridePatch.heightEdit.value
            )
          : overridePatch;
        const nextOverride = {
          width: overrideRegionEntry.width,
          depth: overrideRegionEntry.depth,
          rotation: overrideRegionEntry.rotation,
          softness: overrideRegionEntry.softness,
          shape: overrideRegionEntry.shape,
          offsetX: overrideRegionEntry.offsetX || 0,
          offsetZ: overrideRegionEntry.offsetZ || 0,
          moveCenterEnabled: overrideRegionEntry.moveCenterEnabled === true,
          ...(overridesByRegionKey[affectedRegionKey] || {}),
          ...patchedOverride
        };
        if (overridePatch.shape) {
          nextOverride.shape = ["square", "strip"].includes(nextOverride.shape)
            ? "square"
            : "circle";
        }
        for (const heightKey of ["heightAbove", "heightBelow", "heightMin", "heightMax"]) {
          if (nextOverride[heightKey] === undefined) {
            delete nextOverride[heightKey];
          }
        }
        overridesByRegionKey[affectedRegionKey] = nextOverride;
      }
      getRegionLighting()?.setOverrides?.(overridesByRegionKey);
      editorHost.invalidateRegionLighting?.();
      wake();
      reloadRegionList();
      syncFormState();
      renderSvgOverlay();
      if (shouldRefreshControls) {
        commitOverrides();
      }
    }
  }
  // 提交覆盖：先以光照系统当前的覆盖为准（期间可能有别的入口改过），
  // 再深拷贝一份交给 onChange —— 必须给副本，否则宿主异步保存期间用户继续编辑会污染快照。
  function commitOverrides() {
    overridesByRegionKey = deepCloneObject(
      getRegionLighting()?.getOverrides?.() || overridesByRegionKey
    );
    onChange(deepCloneObject(overridesByRegionKey));
  }
  // 世界坐标 → 屏幕坐标（与舞台标记用同一套投影口径，保证叠加对齐）。
  function projectWorldToScreen(worldX, worldY, worldZ) {
    const canvasRect = editorHost.canvas.getBoundingClientRect();
    const editorRect = editorElement.getBoundingClientRect();
    const projectedPoint = new threeNamespace.Vector3(worldX, worldY, worldZ).project(
      editorHost.camera
    );
    return [
      canvasRect.left - editorRect.left + ((projectedPoint.x + 1) * canvasRect.width) / 2,
      canvasRect.top - editorRect.top + ((1 - projectedPoint.y) * canvasRect.height) / 2
    ];
  }
  // 灯位离地高度：取不到世界坐标时用 0.065 米兜底 —— 与灯具模型落在地板上的高度一致。
  function getLampWorldHeight() {
    return coercedFiniteNumberOr(editorHost.worldPoint?.(activeFloorId, 0, 0, 0.065)?.y, 0.065);
  }
  // 把光区的平面偏移投影到屏幕，用于画中心十字与偏移标注。
  function projectRegionOffset(region, offsetAlongX, offsetAlongZ, screenWorldY) {
    const [axisX, axisZ] = region.axis;
    return projectWorldToScreen(
      region.center[0] + offsetAlongX * axisX - offsetAlongZ * axisZ,
      screenWorldY,
      region.center[2] + offsetAlongX * axisZ + offsetAlongZ * axisX
    );
  }
  // SVG 元素的唯一实现见 /static/shared/dom-factory.js（必须 createElementNS + setAttribute）。
  // 本文件的调用点默认把新节点挂到 svgElement 上，故只在工厂外留一层默认父节点的适配。
  const { svg } = createDomFactory(editorDocument);
  function createSvgElement(tagName, attributes, parentElement = svgElement) {
    return svg(tagName, attributes, parentElement);
  }
  // 生成光区的屏幕路径：方形取四角、圆形按 64 段逼近圆周（足够平滑且点数可控）。
  // insetScale 用来画内缩的虚线内框，表达「外边界是衰减到零的位置」。
  function buildRegionPathData(pathRegion, pathWorldY, insetScale = 1) {
    const halfWidth = (pathRegion.width * insetScale) / 2;
    const halfDepth = (pathRegion.depth * insetScale) / 2;
    const pathPoints = [];
    if (pathRegion.shape === "square") {
      return (
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1]
        ]
          .map(([cornerSignX, cornerSignZ], cornerIndex) => {
            const cornerPoint = projectRegionOffset(
              pathRegion,
              cornerSignX * halfWidth,
              cornerSignZ * halfDepth,
              pathWorldY
            );
            return (
              "" +
              (cornerIndex ? "L" : "M") +
              cornerPoint[0].toFixed(2) +
              "," +
              cornerPoint[1].toFixed(2)
            );
          })
          .join("") + "Z"
      );
    }
    for (let stepIndex = 0; stepIndex < 64; stepIndex += 1) {
      const angleRad = (stepIndex * Math.PI * 2) / 64;
      const cosAngle = Math.cos(angleRad);
      const sinAngle = Math.sin(angleRad);
      const minHalfExtent = Math.min(halfWidth, halfDepth);
      const localX =
        pathRegion.shape === "strip"
          ? Math.sign(cosAngle) * (halfWidth - minHalfExtent) + cosAngle * minHalfExtent
          : cosAngle * halfWidth;
      const localZ =
        pathRegion.shape === "strip"
          ? Math.sign(sinAngle) * (halfDepth - minHalfExtent) + sinAngle * minHalfExtent
          : sinAngle * halfDepth;
      pathPoints.push(projectRegionOffset(pathRegion, localX, localZ, pathWorldY));
    }
    return (
      pathPoints
        .map(
          (pathPoint, pathPointIndex) =>
            "" +
            (pathPointIndex ? "L" : "M") +
            pathPoint[0].toFixed(2) +
            "," +
            pathPoint[1].toFixed(2)
        )
        .join("") + "Z"
    );
  }
  // 重绘整层 SVG 覆盖层：光区轮廓、灯位、拖拽手柄与尺寸标注都在这里生成。
  // 非当前选中的光区压到 0.45 不透明度，让编辑对象始终是视觉焦点。
  function renderSvgOverlay() {
    if (!isOpen || !editorHost.camera || is3dPreview) {
      return;
    }
    editorHost.camera.updateMatrixWorld();
    const overlayRect = editorElement.getBoundingClientRect();
    const lampHeight = getLampWorldHeight();
    // 本次绘制要用的色阶：一次取齐，循环里只读属性。
    const palette = rangeEditorPalette();
    svgElement.setAttribute(
      "viewBox",
      "0 0 " + (overlayRect.width || 1) + " " + (overlayRect.height || 1)
    );
    svgElement.replaceChildren();
    const regionLayerElement = createSvgElement("g");
    const markerLayerElement = createSvgElement("g");
    const activeSelectedRegion = getSelectedRegion();
    const siblingRegionKeys = new Set(
      findRegionSiblings(activeSelectedRegion).map(siblingRegionItem => siblingRegionItem.key)
    );
    const orderedRegions = regions
      .filter(floorRegionItem => String(floorRegionItem.floorId) === activeFloorId)
      .sort(
        (sortFirstRegion, sortSecondRegion) =>
          +(sortFirstRegion.key === selectedRegionKey) -
          +(sortSecondRegion.key === selectedRegionKey)
      );
    for (const overlayRegion of orderedRegions) {
      const isCurrentRegion = overlayRegion.key === selectedRegionKey;
      const isSiblingSelected = siblingRegionKeys.has(overlayRegion.key);
      if (isCurrentRegion || isSiblingSelected) {
        createSvgElement(
          "path",
          {
            ...(isCurrentRegion && overlayRegion.moveCenterEnabled
              ? {
                  "data-range-handle": "move",
                  cursor: "move"
                }
              : {}),
            d: buildRegionPathData(overlayRegion, lampHeight),
            fill: isCurrentRegion ? palette.regionFill : "none",
            stroke: isCurrentRegion ? palette.regionStroke : palette.idleStroke,
            "stroke-width": isCurrentRegion ? 1.6 : 1,
            "stroke-dasharray": isCurrentRegion ? "none" : "4 4",
            opacity: isCurrentRegion ? 1 : 0.45
          },
          regionLayerElement
        );
      }
      if (isCurrentRegion) {
        createSvgElement(
          "path",
          {
            d: buildRegionPathData(
              overlayRegion,
              lampHeight,
              Math.max(0.05, 1 - overlayRegion.softness)
            ),
            fill: "none",
            stroke: palette.softnessStroke,
            "stroke-width": 1,
            "stroke-dasharray": "3 5",
            opacity: 0.42
          },
          regionLayerElement
        );
      }
      const markerWorldCenter = overlayRegion.lampCenter || overlayRegion.center;
      const [markerX, markerY] = projectWorldToScreen(
        markerWorldCenter[0],
        lampHeight,
        markerWorldCenter[2]
      );
      const markerGroupElement = createSvgElement(
        "g",
        {
          "data-region-key": overlayRegion.key,
          role: "button",
          tabindex: "0",
          "aria-label": "选择" + overlayRegion.fixtureLabel
        },
        markerLayerElement
      );
      createSvgElement(
        "circle",
        {
          cx: markerX,
          cy: markerY,
          r: 12,
          fill: "transparent"
        },
        markerGroupElement
      );
      createSvgElement(
        "circle",
        {
          cx: markerX,
          cy: markerY,
          r: isCurrentRegion ? 5 : 3.8,
          fill: isCurrentRegion ? palette.handleFill : palette.idleMarkerFill,
          stroke: isCurrentRegion ? palette.handleStroke : palette.idleMarkerStroke,
          "stroke-width": 1.7,
          class: "p2r-marker"
        },
        markerGroupElement
      );
      const markerTitleElement = createSvgElement("title", {}, markerGroupElement);
      markerTitleElement.textContent = overlayRegion.fixtureLabel;
    }
    if (!activeSelectedRegion) {
      return;
    }
    const regionCenterPoint = projectRegionOffset(activeSelectedRegion, 0, 0, lampHeight);
    const regionLampCenter = activeSelectedRegion.lampCenter || activeSelectedRegion.center;
    const lampCenterScreen = projectWorldToScreen(
      regionLampCenter[0],
      lampHeight,
      regionLampCenter[2]
    );
    if (activeSelectedRegion.offsetX || activeSelectedRegion.offsetZ) {
      createSvgElement("line", {
        x1: lampCenterScreen[0],
        y1: lampCenterScreen[1],
        x2: regionCenterPoint[0],
        y2: regionCenterPoint[1],
        stroke: palette.guideStroke,
        "stroke-width": 1,
        "stroke-dasharray": "4 4",
        "pointer-events": "none"
      });
    }
    if (activeSelectedRegion.moveCenterEnabled) {
      const [moveHandleX, moveHandleY] = regionCenterPoint;
      const moveHandleElement = createSvgElement("g", {
        "data-range-handle": "move",
        role: "button",
        tabindex: "0",
        "aria-label": "拖动光区中心",
        cursor: "move"
      });
      createSvgElement(
        "circle",
        {
          cx: moveHandleX,
          cy: moveHandleY,
          r: 14,
          fill: palette.handleHalo,
          stroke: palette.regionStroke
        },
        moveHandleElement
      );
      createSvgElement(
        "path",
        {
          d:
            "M" +
            (moveHandleX - 8) +
            "," +
            moveHandleY +
            "H" +
            (moveHandleX + 8) +
            "M" +
            moveHandleX +
            "," +
            (moveHandleY - 8) +
            "V" +
            (moveHandleY + 8),
          stroke: palette.handleFill,
          "stroke-width": 2,
          fill: "none"
        },
        moveHandleElement
      );
    }
    const resizeHandleSpecs = [
      ["nw", -1, -1],
      ["ne", 1, -1],
      ["se", 1, 1],
      ["sw", -1, 1]
    ];
    resizeHandleSpecs.push(["w", -1, 0], ["e", 1, 0], ["n", 0, -1], ["s", 0, 1]);
    for (const [resizeHandleName, resizeDirX, resizeDirZ] of resizeHandleSpecs) {
      const [resizeHandleX, resizeHandleY] = projectRegionOffset(
        activeSelectedRegion,
        (resizeDirX * activeSelectedRegion.width) / 2,
        (resizeDirZ * activeSelectedRegion.depth) / 2,
        lampHeight
      );
      const resizeHandleElement = createSvgElement("g", {
        "data-range-handle": resizeHandleName,
        role: "button",
        tabindex: "0",
        "aria-label":
          "拖动" +
          {
            nw: "左上角",
            ne: "右上角",
            se: "右下角",
            sw: "左下角",
            w: "左边调整宽度",
            e: "右边调整宽度",
            n: "上边调整深度",
            s: "下边调整深度"
          }[resizeHandleName]
      });
      createSvgElement(
        "circle",
        {
          cx: resizeHandleX,
          cy: resizeHandleY,
          r: 13,
          fill: "transparent"
        },
        resizeHandleElement
      );
      createSvgElement(
        "rect",
        {
          x: resizeHandleX - 4.5,
          y: resizeHandleY - 4.5,
          width: 9,
          height: 9,
          rx: 2,
          fill: palette.handleFill,
          stroke: palette.handleStroke,
          "stroke-width": 1.2,
          class: "p2r-handle"
        },
        resizeHandleElement
      );
    }
    const centerScreenPoint = projectRegionOffset(activeSelectedRegion, 0, 0, lampHeight);
    const rotateAnchorPoint = projectRegionOffset(
      activeSelectedRegion,
      0,
      -activeSelectedRegion.depth / 2,
      lampHeight
    );
    const rotateDirX = rotateAnchorPoint[0] - centerScreenPoint[0];
    const rotateDirZ = rotateAnchorPoint[1] - centerScreenPoint[1];
    const rotateDirLength = Math.max(1, Math.hypot(rotateDirX, rotateDirZ));
    const rotateHandlePoint = [
      rotateAnchorPoint[0] + (rotateDirX / rotateDirLength) * 27,
      rotateAnchorPoint[1] + (rotateDirZ / rotateDirLength) * 27
    ];
    createSvgElement("line", {
      x1: rotateAnchorPoint[0],
      y1: rotateAnchorPoint[1],
      x2: rotateHandlePoint[0],
      y2: rotateHandlePoint[1],
      stroke: palette.guideStroke,
      "stroke-width": 1.2
    });
    const rotateHandleElement = createSvgElement("g", {
      "data-range-handle": "rotate",
      role: "button",
      tabindex: "0",
      "aria-label": "拖动旋转照射范围"
    });
    createSvgElement(
      "circle",
      {
        cx: rotateHandlePoint[0],
        cy: rotateHandlePoint[1],
        r: 14,
        fill: "transparent"
      },
      rotateHandleElement
    );
    createSvgElement(
      "circle",
      {
        cx: rotateHandlePoint[0],
        cy: rotateHandlePoint[1],
        r: 5,
        fill: palette.handleFill,
        stroke: palette.handleStroke,
        "stroke-width": 1.2,
        class: "p2r-handle"
      },
      rotateHandleElement
    );
  }
  // 指针 → 地面点：射线与 y=0 平面求交；指针朝上（射线与平面平行或反向）时无解，返回 null。
  function pickGroundPoint(groundPickEvent) {
    const pickCanvasRect = editorHost.canvas.getBoundingClientRect();
    if (!pickCanvasRect.width || !pickCanvasRect.height) {
      return null;
    } else {
      pointerNdc.set(
        ((groundPickEvent.clientX - pickCanvasRect.left) / pickCanvasRect.width) * 2 - 1,
        1 - ((groundPickEvent.clientY - pickCanvasRect.top) / pickCanvasRect.height) * 2
      );
      raycaster.setFromCamera(pointerNdc, editorHost.camera);
      groundPlane.constant = -getLampWorldHeight();
      return raycaster.ray.intersectPlane(groundPlane, new threeNamespace.Vector3());
    }
  }
  // 按下：先判命中拖拽手柄（改尺寸），再判光区内部（移中心，且必须在勾选「允许移动范围中心」时）；
  // 两者都不命中就不进入拖拽，让事件继续冒泡给轨道控制。
  function handlePointerDown(pointerDownEvent) {
    if (pointerDownEvent.button !== 0 || !isOpen || is3dPreview) {
      return;
    }
    const grabHandleElement = pointerDownEvent.target.closest?.("[data-range-handle]");
    if (grabHandleElement && getSelectedRegion()) {
      if (
        grabHandleElement.dataset.rangeHandle === "move" &&
        !getSelectedRegion().moveCenterEnabled
      ) {
        return;
      }
      pointerDownEvent.preventDefault();
      pointerDownEvent.stopPropagation();
      grabHandleElement.focus?.();
      const pressedRegion = getSelectedRegion();
      const pressGroundPoint = pickGroundPoint(pointerDownEvent);
      if (!pressGroundPoint) {
        return;
      }
      dragState = {
        pointerId: pointerDownEvent.pointerId,
        handle: grabHandleElement.dataset.rangeHandle,
        region: deepCloneObject(pressedRegion),
        point: pressGroundPoint,
        initial: deepCloneObject(overridesByRegionKey),
        changed: false
      };
      capturePointer(svgElement, pointerDownEvent.pointerId);
    } else {
      const regionMarkerElement = pointerDownEvent.target.closest?.("[data-region-key]");
      if (regionMarkerElement) {
        pointerDownEvent.preventDefault();
        selectRegionByKey(regionMarkerElement.dataset.regionKey);
      }
    }
  }
  // 拖拽中：按当前模式换算成尺寸或中心偏移，并实时重绘。
  function handlePointerMove(pointerMoveEvent) {
    if (!dragState || pointerMoveEvent.pointerId !== dragState.pointerId) {
      return;
    }
    const moveGroundPoint = pickGroundPoint(pointerMoveEvent);
    if (!moveGroundPoint) {
      return;
    }
    pointerMoveEvent.preventDefault();
    const dragRegion = dragState.region;
    const [dragAxisX, dragAxisZ] = dragRegion.axis;
    const deltaAlongX = moveGroundPoint.x - dragRegion.center[0];
    const deltaAlongZ = moveGroundPoint.z - dragRegion.center[2];
    if (dragState.handle === "move") {
      applyOverride({
        offsetX: roundToHundredth(
          clampNumber((dragRegion.offsetX || 0) + moveGroundPoint.x - dragState.point.x, -100, 100)
        ),
        offsetZ: roundToHundredth(
          clampNumber((dragRegion.offsetZ || 0) + moveGroundPoint.z - dragState.point.z, -100, 100)
        )
      });
    } else if (dragState.handle === "rotate") {
      const grabAngleRad = Math.atan2(
        dragState.point.z - dragRegion.center[2],
        dragState.point.x - dragRegion.center[0]
      );
      const rotationDeltaRad = Math.atan2(deltaAlongZ, deltaAlongX) - grabAngleRad;
      let nextRotationDeg = dragRegion.rotation + (rotationDeltaRad * 180) / Math.PI;
      nextRotationDeg = ((((nextRotationDeg + 180) % 360) + 360) % 360) - 180;
      if (pointerMoveEvent.shiftKey) {
        nextRotationDeg = Math.round(nextRotationDeg / 15) * 15;
      }
      applyOverride({
        rotation: roundToHundredth(nextRotationDeg)
      });
    } else {
      const nextWidth = Math.abs(deltaAlongX * dragAxisX + deltaAlongZ * dragAxisZ) * 2;
      const nextDepth = Math.abs(-deltaAlongX * dragAxisZ + deltaAlongZ * dragAxisX) * 2;
      applyOverride(
        resizeRegionDimensions(
          dragRegion,
          nextWidth,
          nextDepth,
          dragState.handle,
          pointerMoveEvent.shiftKey
        )
      );
    }
    dragState.changed = true;
  }
  // 结束拖拽：shouldRevert 用于 Esc 取消，丢弃本次改动而不写回覆盖；
  // 正常结束才落库到覆盖集合并提交。
  function finishDrag(endDragEvent, shouldRevert = false) {
    if (!dragState || (endDragEvent && endDragEvent.pointerId !== dragState.pointerId)) {
      return;
    }
    const finishedDrag = dragState;
    dragState = null;
    releasePointer(svgElement, finishedDrag.pointerId);
    if (shouldRevert) {
      overridesByRegionKey = finishedDrag.initial;
      getRegionLighting()?.setOverrides?.(overridesByRegionKey);
      editorHost.invalidateRegionLighting?.();
      reloadRegionList();
      syncFormState();
      renderSvgOverlay();
    } else if (finishedDrag.changed) {
      commitOverrides();
    }
  }
  // 选中某个光区：刷新表单与覆盖层，并把相机对准它。
  function selectRegionByKey(regionKey) {
    if (dragState) {
      finishDrag(null);
    }
    selectedRegionKey = regionKey;
    syncFormState();
    applyPreviewToScene();
    renderSvgOverlay();
  }
  // 编辑期间关掉轨道控制，否则拖手柄会顺带旋转视角。
  function suspendOrbitControls() {
    if (editorHost.controls) {
      editorHost.controls.enabled = false;
    }
  }
  // 相机交互的对外同步点：宿主切换编辑模式时会调用它重新判决控制权。
  function syncCameraInteraction() {
    editorHost.setCameraInteraction?.({
      enabled: isOpen && is3dPreview,
      rotationMode: "free",
      panEnabled: is3dPreview,
      zoomEnabled: is3dPreview
    });
    if (!is3dPreview) {
      suspendOrbitControls();
    }
  }
  // 平面编辑 ↔ 3D 预览切换：两边各自的相机状态先存后取，
  // 并同步面板文案与轨道控制开关。
  function set3dPreviewEnabled(shouldUse3dPreview) {
    if (!isOpen || is3dPreview === shouldUse3dPreview) {
      return;
    }
    finishDrag(null);
    if (is3dPreview) {
      savedCameraState3d = deepCloneObject(editorHost.cameraState(true));
    } else {
      savedCameraStatePlan = deepCloneObject(editorHost.cameraState(true));
    }
    is3dPreview = shouldUse3dPreview;
    svgElement.style.display = is3dPreview ? "none" : "";
    editorElement
      .querySelector("[data-action=view-plan]")
      .setAttribute("aria-pressed", String(!is3dPreview));
    editorElement
      .querySelector("[data-action=view-3d]")
      .setAttribute("aria-pressed", String(is3dPreview));
    editorElement.querySelector(".p2r-title").textContent = is3dPreview
      ? "3D 高度预览 · 拖动旋转，滚轮缩放"
      : "俯视范围编辑 · 拖动边角调整";
    editorElement.querySelector(".p2r-compact-caption").textContent = is3dPreview
      ? "拖动旋转 · 双指缩放"
      : "自由拖动 · Shift 等比";
    const cameraStateToRestore = is3dPreview ? savedCameraState3d : savedCameraStatePlan;
    if (cameraStateToRestore) {
      editorHost.restoreCamera(cameraStateToRestore);
    } else {
      fitCameraToContent();
    }
    syncCameraInteraction();
    syncFormState();
    renderSvgOverlay();
    editorHost.invalidateRegionLighting?.();
    wake();
  }
  // 算本层的平面包围盒：墙按厚度外扩、家具按旋转后的四个角展开，
  // 漏掉旋转后的角会让相机取景裁掉家具。
  function computeGroundBounds(horizontalAxis, verticalAxis) {
    const floorScene = findFloorById(activeFloorId)?.scene;
    const groundSamplePoints = [];
    // 记一个采样点（可带半径），半径用于把包围盒按物体实际尺寸外扩；
    // 坐标不是有限数就直接跳过，否则会把整层的包围盒算成无效值。
    // 采样高度固定 0.065 米，下面的兜底分支也用同一高度，两处才落在同一平面上。
    const addSamplePoint = (sampleWorldX, sampleWorldY, sampleRadius = 0) => {
      if (!Number.isFinite(Number(sampleWorldX)) || !Number.isFinite(Number(sampleWorldY))) {
        return;
      }
      const samplePoint = editorHost.worldPoint?.(
        activeFloorId,
        Number(sampleWorldX),
        Number(sampleWorldY),
        0.065
      );
      if (samplePoint) {
        groundSamplePoints.push({
          point: samplePoint,
          radius: sampleRadius
        });
      }
    };
    for (const wallItem of floorScene?.walls || []) {
      const wallHalfThickness = Math.max(0, coercedFiniteNumberOr(wallItem.thickness, 0.12)) / 2;
      addSamplePoint(wallItem.start?.x, wallItem.start?.y, wallHalfThickness);
      addSamplePoint(wallItem.end?.x, wallItem.end?.y, wallHalfThickness);
    }
    if (!groundSamplePoints.length) {
      for (const floorItem of floorScene?.items || []) {
        const itemOrigin = editorHost.worldPoint?.(activeFloorId, floorItem.x, floorItem.y, 0.065);
        if (!itemOrigin) {
          continue;
        }
        const itemRotationRad = (coercedFiniteNumberOr(floorItem.rotation, 0) * Math.PI) / 180;
        const itemCos = Math.cos(itemRotationRad);
        const itemSin = Math.sin(itemRotationRad);
        for (const extentSignX of [-1, 1]) {
          for (const extentSignZ of [-1, 1]) {
            const extentOffsetX =
              (extentSignX * Math.max(0.1, coercedFiniteNumberOr(floorItem.width, 0.5))) / 2;
            const extentOffsetZ =
              (extentSignZ * Math.max(0.1, coercedFiniteNumberOr(floorItem.depth, 0.5))) / 2;
            groundSamplePoints.push({
              point: new threeNamespace.Vector3(
                itemOrigin.x + extentOffsetX * itemCos - extentOffsetZ * itemSin,
                itemOrigin.y,
                itemOrigin.z + extentOffsetX * itemSin + extentOffsetZ * itemCos
              ),
              radius: 0
            });
          }
        }
      }
    }
    if (!groundSamplePoints.length) {
      for (const floorRegionForBounds of regions.filter(
        groundRegionEntry => String(groundRegionEntry.floorId) === activeFloorId
      )) {
        groundSamplePoints.push({
          point: new threeNamespace.Vector3().fromArray(floorRegionForBounds.center),
          radius: 0.5
        });
      }
    }
    if (!groundSamplePoints.length) {
      groundSamplePoints.push({
        point: new threeNamespace.Vector3(0, 0, 0),
        radius: 2.5
      });
    }
    let horizontalMin = Infinity;
    let horizontalMax = -Infinity;
    let verticalMin = Infinity;
    let verticalMax = -Infinity;
    for (const { point: boundsSamplePoint, radius: boundsSampleRadius } of groundSamplePoints) {
      const pointAlongHorizontal = boundsSamplePoint.dot(horizontalAxis);
      const pointAlongVertical = boundsSamplePoint.dot(verticalAxis);
      horizontalMin = Math.min(horizontalMin, pointAlongHorizontal - boundsSampleRadius);
      horizontalMax = Math.max(horizontalMax, pointAlongHorizontal + boundsSampleRadius);
      verticalMin = Math.min(verticalMin, pointAlongVertical - boundsSampleRadius);
      verticalMax = Math.max(verticalMax, pointAlongVertical + boundsSampleRadius);
    }
    return {
      left: horizontalMin,
      right: horizontalMax,
      bottom: verticalMin,
      top: verticalMax
    };
  }
  // 让相机刚好框住整层内容（留一点边距），用于首次打开与切楼层。
  function fitCameraToContent() {
    if (!isOpen || !topViewCameraState || isFittingCamera) {
      return;
    }
    const fitEditorRect = editorElement.getBoundingClientRect();
    const fitPanelRect = panelElement.getBoundingClientRect();
    if (!(fitEditorRect.width < 2) && !(fitEditorRect.height < 2)) {
      isFittingCamera = true;
      try {
        const fitViewBox =
          fitEditorRect.width <= 620
            ? {
                x: 14,
                y: 52,
                width: fitEditorRect.width - 28,
                height: Math.max(70, fitPanelRect.top - fitEditorRect.top - 62)
              }
            : {
                x: 18,
                y: 68,
                width: Math.max(70, fitPanelRect.left - fitEditorRect.left - 35),
                height: Math.max(70, fitEditorRect.height - 115)
              };
        const nextCameraState = deepCloneObject(topViewCameraState);
        let upVector = new threeNamespace.Vector3()
          .fromArray(topViewCameraState.up || [0, 0, -1])
          .normalize();
        const viewDirection = new threeNamespace.Vector3()
          .fromArray(topViewCameraState.target)
          .sub(new threeNamespace.Vector3().fromArray(topViewCameraState.position))
          .normalize();
        if (is3dPreview) {
          viewDirection.set(-1, -1.1, -1).normalize();
          upVector.set(0, 1, 0);
        }
        const rightVector = new threeNamespace.Vector3()
          .crossVectors(viewDirection, upVector)
          .normalize();
        if (is3dPreview) {
          upVector.crossVectors(rightVector, viewDirection).normalize();
        }
        const groundBounds = computeGroundBounds(rightVector, upVector);
        const contentWidthPx = Math.max(1, groundBounds.right - groundBounds.left);
        const contentHeightPx =
          Math.max(1, groundBounds.top - groundBounds.bottom) + (is3dPreview ? 3 : 0);
        const fitScale =
          Math.max(
            (contentWidthPx + 0.4) / fitViewBox.width,
            (contentHeightPx + 0.4) / fitViewBox.height
          ) * 1.08;
        const horizontalShiftPx = fitViewBox.x + fitViewBox.width / 2 - fitEditorRect.width / 2;
        const verticalShiftPx = fitViewBox.y + fitViewBox.height / 2 - fitEditorRect.height / 2;
        const cameraTarget = rightVector
          .clone()
          .multiplyScalar((groundBounds.left + groundBounds.right) / 2)
          .add(upVector.clone().multiplyScalar((groundBounds.bottom + groundBounds.top) / 2));
        if (is3dPreview) {
          const fullGroundBounds = computeGroundBounds(
            new threeNamespace.Vector3(1, 0, 0),
            new threeNamespace.Vector3(0, 0, 1)
          );
          cameraTarget.set(
            (fullGroundBounds.left + fullGroundBounds.right) / 2,
            0,
            (fullGroundBounds.bottom + fullGroundBounds.top) / 2
          );
        }
        cameraTarget.y = getLampWorldHeight() + 0.6;
        cameraTarget
          .addScaledVector(rightVector, -horizontalShiftPx * fitScale)
          .addScaledVector(upVector, verticalShiftPx * fitScale);
        nextCameraState.target = cameraTarget.toArray();
        if (is3dPreview) {
          nextCameraState.up = [0, 1, 0];
          nextCameraState.view = "free";
        }
        nextCameraState.position = cameraTarget
          .clone()
          .addScaledVector(viewDirection, -Math.max(20, contentWidthPx * 2, contentHeightPx * 2))
          .toArray();
        nextCameraState.frameSize = fitScale * Math.min(fitEditorRect.width, fitEditorRect.height);
        nextCameraState.zoom = 1;
        editorHost.restoreCamera(nextCameraState);
        syncCameraInteraction();
        editorHost.invalidateRegionLighting?.();
        wake();
        lastWidthPx = fitEditorRect.width;
        lastHeightPx = fitEditorRect.height;
        renderSvgOverlay();
      } finally {
        isFittingCamera = false;
      }
    }
  }
  // 合并同一帧内的多次重绘请求：ResizeObserver 与状态变化常常连着触发，
  // 逐次重绘会白算好几遍。
  function scheduleRender({ fit: shouldFit = false } = {}) {
    if (isOpen) {
      pendingFit ||= shouldFit;
      if (animationFrameId) {
        editorWindow.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = editorWindow.requestAnimationFrame(() => {
        animationFrameId = 0;
        const fitRequested = pendingFit;
        pendingFit = false;
        if (isOpen) {
          reloadRegionList();
          syncFormState();
          if (fitRequested && !is3dPreview) {
            fitCameraToContent();
          } else {
            renderSvgOverlay();
          }
        }
      });
    }
  }
  // 切换楼层：光区数据按楼层取值，必须重新拉列表、重算相机与覆盖集合。
  function setActiveFloor(floorIdToSelect) {
    if (dragState) {
      finishDrag(null);
    }
    const wasIn3dPreview = is3dPreview;
    if (wasIn3dPreview) {
      set3dPreviewEnabled(false);
    }
    activeFloorId = String(floorIdToSelect);
    selectedRegionKey = "";
    savedCameraStatePlan = null;
    savedCameraState3d = null;
    editorHost.setFloor(activeFloorId);
    editorHost.setCameraProjection("orthographic");
    editorHost.topView();
    topViewCameraState = deepCloneObject(editorHost.cameraState(true));
    suspendOrbitControls();
    editorHost.invalidateRegionLighting?.();
    reloadRegionList();
    syncFormState();
    applyPreviewToScene();
    if (wasIn3dPreview) {
      fitCameraToContent();
      set3dPreviewEnabled(true);
    } else {
      scheduleRender({
        fit: true
      });
    }
  }
  // 表单变更入口：按 data-field 分发。柔和度界面按百分比、写库换算成 0.05~1 的比例；
  // 宽深夹到 0.5~20 米；旋转归一化到 -180~180 度。
  function handleFieldChangeEvent(fieldChangeEvent) {
    const fieldControl = fieldChangeEvent.target;
    const fieldName = fieldControl.dataset.field;
    if (fieldName === "floor") {
      return setActiveFloor(fieldControl.value);
    }
    if (fieldName === "fixture") {
      return selectRegionByKey(fieldControl.value);
    }
    if (fieldName === "group" || fieldName === "preview") {
      syncFormState();
      applyPreviewToScene();
      renderSvgOverlay();
      return;
    }
    if (fieldName === "moveCenter") {
      return applyOverride(
        {
          moveCenterEnabled: fieldControl.checked
        },
        true
      );
    }
    if (fieldName === "shape") {
      return applyOverride(
        {
          shape: fieldControl.value
        },
        true
      );
    }
    if (fieldName === "softness") {
      return applyOverride(
        {
          softness: clampNumber(coercedFiniteNumberOr(fieldControl.value, 35) / 100, 0.05, 1)
        },
        true
      );
    }
    if (["heightMin", "heightMax"].includes(fieldName)) {
      const parsedHeightValue =
        fieldControl.value.trim() === ""
          ? undefined
          : roundToHundredth(clampNumber(coercedFiniteNumberOr(fieldControl.value, 0), 0, 20));
      fieldControl.value = parsedHeightValue ?? "";
      return applyOverride(
        {
          heightEdit: {
            field: fieldName,
            value: parsedHeightValue
          }
        },
        true
      );
    }
    if (["width", "depth", "rotation"].includes(fieldName)) {
      const currentFieldValue = getSelectedRegion()?.[fieldName];
      const nextFieldValue =
        fieldControl.value.trim() === ""
          ? currentFieldValue
          : coercedFiniteNumberOr(fieldControl.value, currentFieldValue);
      fieldControl.value = roundToHundredth(
        clampNumber(
          nextFieldValue,
          fieldName === "rotation" ? -180 : 0.5,
          fieldName === "rotation" ? 180 : 20
        )
      );
      applyOverride(
        {
          [fieldName]: Number(fieldControl.value)
        },
        true
      );
    }
  }
  // 键盘操作：方向键微调（Shift 加速）、Esc 取消当前拖拽 ——
  // 手柄拖拽要有等价的键盘路径，否则纯键盘用户改不了范围。
  function handleEditorKeyDown(editorKeyEvent) {
    if (!isOpen || editorKeyEvent.defaultPrevented) {
      return;
    }
    if (editorKeyEvent.key === "Escape") {
      editorKeyEvent.preventDefault();
      editorKeyEvent.stopPropagation();
      closeEditor();
      return;
    }
    const regionKeyElement = editorKeyEvent.target.closest?.("[data-region-key]");
    if (regionKeyElement && ["Enter", " "].includes(editorKeyEvent.key)) {
      editorKeyEvent.preventDefault();
      selectRegionByKey(regionKeyElement.dataset.regionKey);
    }
    const rangeHandleElement = editorKeyEvent.target.closest?.("[data-range-handle]");
    if (
      !rangeHandleElement ||
      !getSelectedRegion() ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(editorKeyEvent.key)
    ) {
      return;
    }
    editorKeyEvent.preventDefault();
    const directionSign = ["ArrowUp", "ArrowRight"].includes(editorKeyEvent.key) ? 1 : -1;
    if (rangeHandleElement.dataset.rangeHandle === "move") {
      if (!getSelectedRegion().moveCenterEnabled) {
        return;
      }
      const offsetField = ["ArrowLeft", "ArrowRight"].includes(editorKeyEvent.key)
        ? "offsetX"
        : "offsetZ";
      const offsetSign = ["ArrowRight", "ArrowDown"].includes(editorKeyEvent.key) ? 1 : -1;
      applyOverride(
        {
          [offsetField]: roundToHundredth(
            clampNumber(
              (getSelectedRegion()[offsetField] || 0) +
                offsetSign * (editorKeyEvent.shiftKey ? 0.5 : 0.1),
              -100,
              100
            )
          )
        },
        true
      );
    } else if (rangeHandleElement.dataset.rangeHandle === "rotate") {
      applyOverride(
        {
          rotation: clampNumber(
            getSelectedRegion().rotation + directionSign * (editorKeyEvent.shiftKey ? 15 : 1),
            -180,
            180
          )
        },
        true
      );
    } else {
      const handleId = rangeHandleElement.dataset.rangeHandle;
      const resizedDimensionField = ["w", "e"].includes(handleId)
        ? "width"
        : ["n", "s"].includes(handleId)
          ? "depth"
          : ["ArrowLeft", "ArrowRight"].includes(editorKeyEvent.key)
            ? "width"
            : "depth";
      const keyboardRegion = getSelectedRegion();
      const resizePatch = {
        width: keyboardRegion.width,
        depth: keyboardRegion.depth,
        [resizedDimensionField]: keyboardRegion[resizedDimensionField] + directionSign * 0.1
      };
      applyOverride(
        resizeRegionDimensions(
          keyboardRegion,
          resizePatch.width,
          resizePatch.depth,
          resizedDimensionField === "width" ? "e" : "s",
          editorKeyEvent.shiftKey
        ),
        true
      );
    }
  }
  // 按钮动作分发：切换视图、中心回到灯位、恢复模型默认、完成关闭。
  function handleActionClick(actionClickEvent) {
    const actionName = actionClickEvent.target.closest?.("[data-action]")?.dataset.action;
    if (actionName === "view-plan") {
      set3dPreviewEnabled(false);
    }
    if (actionName === "view-3d") {
      set3dPreviewEnabled(true);
    }
    if (actionName === "close") {
      closeEditor();
    }
    if (actionName === "reset-center") {
      applyOverride(
        {
          offsetX: 0,
          offsetZ: 0
        },
        true
      );
    }
    if (actionName === "reset") {
      for (const resetRegionKey of getAffectedRegionKeys()) {
        delete overridesByRegionKey[resetRegionKey];
      }
      getRegionLighting()?.setOverrides?.(overridesByRegionKey);
      editorHost.invalidateRegionLighting?.();
      wake();
      reloadRegionList();
      syncFormState();
      renderSvgOverlay();
      commitOverrides();
    }
  }
  editorElement.addEventListener("change", handleFieldChangeEvent);
  editorElement.addEventListener("input", fieldInputEvent => {
    if (
      ["heightMin", "heightMax"].includes(fieldInputEvent.target.dataset.field) &&
      fieldInputEvent.target.validity.valid
    ) {
      const liveHeightValue =
        fieldInputEvent.target.value.trim() === ""
          ? undefined
          : clampNumber(Number(fieldInputEvent.target.value), 0, 20);
      applyOverride({
        heightEdit: {
          field: fieldInputEvent.target.dataset.field,
          value: liveHeightValue
        }
      });
    }
    if (fieldInputEvent.target === fieldElements.softness) {
      applyOverride({
        softness: clampNumber(coercedFiniteNumberOr(fieldElements.softness.value, 35) / 100, 0.05, 1)
      });
    }
  });
  editorElement.addEventListener("click", handleActionClick);
  svgElement.addEventListener("pointerdown", handlePointerDown);
  svgElement.addEventListener("pointermove", handlePointerMove);
  svgElement.addEventListener("pointerup", pointerUpEvent => finishDrag(pointerUpEvent));
  svgElement.addEventListener("pointercancel", pointerCancelEvent =>
    finishDrag(pointerCancelEvent, true)
  );
  svgElement.addEventListener("lostpointercapture", lostPointerCaptureEvent =>
    finishDrag(lostPointerCaptureEvent)
  );
  const resizeObserver = new editorWindow.ResizeObserver(() => {
    if (!isOpen || isFittingCamera) {
      return;
    }
    const observedRect = editorElement.getBoundingClientRect();
    if (
      Math.abs(observedRect.width - lastWidthPx) > 1 ||
      Math.abs(observedRect.height - lastHeightPx) > 1
    ) {
      scheduleRender({
        fit: true
      });
    } else {
      scheduleRender();
    }
  });
  resizeObserver.observe(editorHost.container);
  // 打开编辑器：记录当前相机与轨道控制状态，切到俯视、拉取光区列表并首绘。
  function openEditor() {
    if (!isOpen && !isDisposed) {
      if (!getRegionLighting()?.listRegions) {
        throw new Error("区域灯光尚未准备好，请稍后重试。");
      }
      requestedFloorSelection = String(
        getConfig()?.floorSelection ||
          editorHost.document?.activeFloorId ||
          editorHost.document?.floors?.[0]?.id ||
          ""
      );
      is3dPreview = false;
      savedCameraState3d = null;
      savedCameraStatePlan = null;
      svgElement.style.display = "";
      editorElement.querySelector(".p2r-title").textContent = "俯视范围编辑 · 拖动边角调整";
      editorElement.querySelector(".p2r-compact-caption").textContent = "自由拖动 · Shift 等比";
      editorElement.querySelector("[data-action=view-plan]").setAttribute("aria-pressed", "true");
      editorElement.querySelector("[data-action=view-3d]").setAttribute("aria-pressed", "false");
      previousControlsEnabled = editorHost.controls?.enabled;
      openedCameraState = deepCloneObject(editorHost.cameraState(true));
      isOpen = true;
      editorElement.hidden = false;
      overridesByRegionKey = deepCloneObject(
        getConfig()?.lightRegionOverrides || getRegionLighting()?.getOverrides?.() || {}
      );
      getRegionLighting().setOverrides(overridesByRegionKey);
      activeFloorId =
        requestedFloorSelection === "all"
          ? String(editorHost.document?.activeFloorId || editorHost.document?.floors?.[0]?.id || "")
          : requestedFloorSelection;
      editorHost.setFloor(activeFloorId);
      editorHost.setCameraProjection("orthographic");
      editorHost.topView();
      topViewCameraState = deepCloneObject(editorHost.cameraState(true));
      suspendOrbitControls();
      editorDocument.addEventListener("keydown", handleEditorKeyDown, true);
      cameraChangeUnsubscribe = editorHost.onCameraChange?.(() => {
        if (!isFittingCamera && !is3dPreview) {
          scheduleRender();
        }
      });
      editorHost.invalidateRegionLighting?.();
      reloadRegionList();
      syncFormState();
      applyPreviewToScene();
      scheduleRender({
        fit: true
      });
      editorElement.querySelector("[data-action=close]").focus({
        preventScroll: true
      });
    }
  }
  // 关闭编辑器：恢复相机与轨道控制，隐藏浮层并通知宿主。
  function closeEditor() {
    if (isOpen) {
      formControls.close();
      finishDrag(null);
      isOpen = false;
      editorElement.hidden = true;
      if (animationFrameId) {
        editorWindow.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      cameraChangeUnsubscribe?.();
      cameraChangeUnsubscribe = null;
      editorDocument.removeEventListener("keydown", handleEditorKeyDown, true);
      getRegionLighting()?.setPreview?.(null);
      editorHost.setFloor(requestedFloorSelection);
      editorHost.restoreCamera(openedCameraState);
      if (editorHost.controls) {
        editorHost.controls.enabled = previousControlsEnabled !== false;
      }
      editorHost.invalidateRegionLighting?.();
      wake();
      topViewCameraState = null;
      onClose();
    }
  }
  // 外部数据变化时的刷新入口（配置更新、楼层切换等）。
  function refreshEditor() {
    if (isOpen) {
      scheduleRender();
    }
  }
  // 宿主保存结果的回显：有错误就存下文案并在表单区展示，成功则清空。
  function setSaveStatus(saveError) {
    saveErrorMessage = saveError ? String(saveError.message || saveError) : "";
    if (isOpen) {
      syncFormState();
    }
  }
  // 释放：关编辑器、解开表单控件、断开尺寸观察并移除浮层 DOM。
  function disposeEditor() {
    if (!isDisposed) {
      closeEditor();
      isDisposed = true;
      formControls.dispose();
      resizeObserver.disconnect();
      editorElement.remove();
    }
  }
  return {
    open: openEditor,
    close: closeEditor,
    flush() {
      formControls.close();
      finishDrag(null);
      commitOverrides();
    },
    isOpen: () => isOpen,
    syncCameraInteraction: syncCameraInteraction,
    refresh: refreshEditor,
    dispose: disposeEditor,
    setSaveStatus: setSaveStatus
  };
}
/**
 * 增强编辑器表单控件：原生 select 包成自定义下拉、数字输入加步进按钮与键盘支持。
 * 自己做下拉是因为原生 select 的弹出层在弹窗里样式与层级都不可控；
 * 所有监听器都登记在册，dispose 时统一注销 —— 编辑器反复开关，漏一个就会累积。
 */
function mountRangeFormControls(editorRootElement) {
  const formDocument = editorRootElement.ownerDocument;
  const formWindow = formDocument.defaultView;
  const customSelects = [];
  const numberFieldEntries = [];
  const eventCleanupCallbacks = [];
  let openSelect = null;
  let stopStepperRepeat = null;
  // 建带类名的小元素，用于下拉菜单等运行时生成的节点。
  const createStyledElement = (elementTagName, className) => {
    const createdElement = formDocument.createElement(elementTagName);
    createdElement.className = className;
    return createdElement;
  };
  // 登记监听器以便统一注销：编辑器反复打开关闭，漏掉一个就会在 window 上越积越多。
  const addTrackedListener = (eventTarget, eventType, eventListener, listenerOptions) => {
    eventTarget.addEventListener(eventType, eventListener, listenerOptions);
    eventCleanupCallbacks.push(() =>
      eventTarget.removeEventListener(eventType, eventListener, listenerOptions)
    );
  };
  // 关下拉菜单，可选把焦点还给触发它的 select（键盘操作的焦点闭环）。
  function closeSelectMenu(shouldRestoreFocus = false) {
    if (!openSelect) {
      return;
    }
    const closingSelect = openSelect;
    openSelect = null;
    closingSelect.menu.hidden = true;
    closingSelect.button.setAttribute("aria-expanded", "false");
    if (shouldRestoreFocus) {
      closingSelect.button.focus({
        preventScroll: true
      });
    }
  }
  // 菜单用 fixed 定位并现算位置：普通绝对定位会被弹窗的 overflow 裁掉。
  // 定位算法只有一份（/static/shared/menu-positioning.js，编辑器里 11 处下拉都用它），
  // 这里把本控件的手感原样传成参数：间距 4、边距 8、高度上限 320 且下限 40、按内容取高。
  // 视口取 formWindow：本编辑器可能被嵌进另一份文档，顶层 window 的尺寸不是它。
  function positionSelectMenu() {
    if (!openSelect) {
      return;
    }
    positionFloatingMenu({
      anchorElement: openSelect.button,
      menuElement: openSelect.menu,
      heightMode: "content",
      gapPx: 4,
      marginPx: 8,
      contentHeightCapPx: 320,
      contentHeightFloorPx: 40,
      viewportWindow: formWindow
    });
  }
  // 把原生 select 的选项与选中值同步到自定义控件上。
  function syncCustomSelect(selectEntry) {
    const { select: selectElement, button: selectButton, menu: selectMenu } = selectEntry;
    selectButton.textContent = selectElement.selectedOptions[0]?.textContent || "请选择";
    selectButton.disabled = selectElement.disabled;
    selectButton.setAttribute(
      "aria-label",
      selectElement.getAttribute("aria-label") || "打开选择菜单"
    );
    const optionsSignature = JSON.stringify(
      [...selectElement.options].map(nativeOption => [
        nativeOption.value,
        nativeOption.textContent,
        nativeOption.disabled,
        nativeOption.hidden
      ])
    );
    if (optionsSignature !== selectEntry.signature) {
      selectEntry.signature = optionsSignature;
      selectMenu.replaceChildren(
        ...[...selectElement.options]
          .filter(visibleOption => !visibleOption.hidden)
          .map(optionEntry => {
            const createdOptionButton = createStyledElement("button", "custom-select-option");
            createdOptionButton.type = "button";
            createdOptionButton.dataset.value = optionEntry.value;
            createdOptionButton.setAttribute("role", "option");
            createdOptionButton.textContent = optionEntry.textContent;
            createdOptionButton.disabled = optionEntry.disabled;
            return createdOptionButton;
          })
      );
    }
    for (const existingOptionButton of selectMenu.children) {
      existingOptionButton.classList.toggle(
        "active",
        existingOptionButton.dataset.value === selectElement.value
      );
      existingOptionButton.setAttribute(
        "aria-selected",
        String(existingOptionButton.dataset.value === selectElement.value)
      );
    }
    if (selectElement.disabled && openSelect === selectEntry) {
      closeSelectMenu();
    }
  }
  // 打开下拉菜单并按需把焦点落到当前选项上（键盘打开时）。
  function openSelectMenu(menuSelectEntry, shouldFocusActiveOption = false) {
    closeSelectMenu();
    syncCustomSelect(menuSelectEntry);
    if (!menuSelectEntry.select.disabled) {
      openSelect = menuSelectEntry;
      menuSelectEntry.menu.hidden = false;
      menuSelectEntry.button.setAttribute("aria-expanded", "true");
      positionSelectMenu();
      if (shouldFocusActiveOption) {
        (
          menuSelectEntry.menu.querySelector(".active:not(:disabled)") ||
          menuSelectEntry.menu.querySelector("button:not(:disabled)")
        )?.focus({
          preventScroll: true
        });
      }
    }
  }
  // 选中一项：写回原生 select 并派发 change 事件，复用同一条表单变更链路，
  // 这样自定义控件与直接改原生控件的行为完全一致。
  function chooseSelectOption(targetSelectEntry, chosenOptionButton) {
    if (!chosenOptionButton || chosenOptionButton.disabled || targetSelectEntry.select.disabled) {
      return;
    }
    const previousSelectValue = targetSelectEntry.select.value;
    targetSelectEntry.select.value = chosenOptionButton.dataset.value;
    closeSelectMenu(true);
    if (previousSelectValue !== targetSelectEntry.select.value) {
      targetSelectEntry.select.dispatchEvent(
        new formWindow.Event("change", {
          bubbles: true
        })
      );
    }
    syncCustomSelect(targetSelectEntry);
  }
  for (const nativeSelect of editorRootElement.querySelectorAll("select")) {
    const selectWrapper = createStyledElement("span", "custom-select");
    const customSelectButton = createStyledElement("button", "custom-select-button");
    const customSelectMenu = createStyledElement("div", "custom-select-menu");
    nativeSelect.before(selectWrapper);
    selectWrapper.append(nativeSelect, customSelectButton);
    editorRootElement.append(customSelectMenu);
    nativeSelect.classList.add("native-select-control");
    nativeSelect.tabIndex = -1;
    nativeSelect.setAttribute("aria-hidden", "true");
    customSelectButton.type = "button";
    customSelectButton.setAttribute("aria-haspopup", "listbox");
    customSelectButton.setAttribute("aria-expanded", "false");
    customSelectMenu.id = "range-select-" + nativeSelect.dataset.field + "-menu";
    customSelectMenu.setAttribute("role", "listbox");
    customSelectMenu.hidden = true;
    customSelectButton.setAttribute("aria-controls", customSelectMenu.id);
    customSelectMenu.setAttribute("aria-label", nativeSelect.getAttribute("aria-label") || "选项");
    const selectEntryModel = {
      select: nativeSelect,
      wrapper: selectWrapper,
      button: customSelectButton,
      menu: customSelectMenu
    };
    customSelects.push(selectEntryModel);
    syncCustomSelect(selectEntryModel);
    addTrackedListener(customSelectButton, "click", buttonClickEvent => {
      buttonClickEvent.preventDefault();
      if (openSelect === selectEntryModel) {
        closeSelectMenu();
      } else {
        openSelectMenu(selectEntryModel);
      }
    });
    addTrackedListener(customSelectMenu, "click", menuClickEvent => {
      menuClickEvent.preventDefault();
      chooseSelectOption(selectEntryModel, menuClickEvent.target.closest(".custom-select-option"));
    });
    addTrackedListener(nativeSelect, "change", () => syncCustomSelect(selectEntryModel));
  }
  // 步进实现只有一份（/static/shared/number-input-stepper.js，经 static-helpers 桥取用）。
  // 本适配层只补两件本文件特有的事：一次步进就要落配置（立刻补发 change），事件构造器取本表单
  // 文档那份（跨文档时全局 Event 与 formWindow.Event 不是同一个 realm 的构造器）。
  const stepNumberInput = (numberInputElement, stepDirection) =>
    sharedStepNumberInput(numberInputElement, stepDirection, {
      dispatchChange: true,
      EventConstructor: formWindow.Event
    });
  for (const numberInput of editorRootElement.querySelectorAll("input[type=number]")) {
    const numberControlWrapper = createStyledElement("span", "inspector-number-control");
    const stepperContainer = createStyledElement("span", "inspector-number-steppers");
    numberInput.before(numberControlWrapper);
    numberControlWrapper.append(numberInput, stepperContainer);
    const stepperButtons = [];
    for (const [stepperDirection, stepperLabel, stepperIconPath] of [
      [1, "增加数值", "M1 5 5 1l4 4"],
      [-1, "减少数值", "M1 1 5 5l4-4"]
    ]) {
      const stepperButton = createStyledElement("button", "inspector-number-stepper");
      stepperButton.type = "button";
      stepperButton.tabIndex = -1;
      stepperButton.setAttribute("aria-label", stepperLabel);
      stepperButton.title = stepperLabel;
      stepperButton.innerHTML =
        '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="' +
        stepperIconPath +
        '"></path></svg>';
      stepperContainer.append(stepperButton);
      stepperButtons.push(stepperButton);
      addTrackedListener(stepperButton, "click", stepperClickEvent => {
        stepperClickEvent.preventDefault();
        if (stepperClickEvent.detail === 0) {
          stepNumberInput(numberInput, stepperDirection);
        }
      });
      addTrackedListener(stepperButton, "pointerdown", stepperPointerDownEvent => {
        if (stepperPointerDownEvent.button !== 0 || numberInput.disabled || numberInput.readOnly) {
          return;
        }
        stepperPointerDownEvent.preventDefault();
        stopStepperRepeat?.();
        numberInput.focus({
          preventScroll: true
        });
        stepNumberInput(numberInput, stepperDirection);
        let holdDelayTimerId;
        let holdIntervalId;
        stopStepperRepeat = () => {
          formWindow.clearTimeout(holdDelayTimerId);
          formWindow.clearInterval(holdIntervalId);
          stopStepperRepeat = null;
        };
        holdDelayTimerId = formWindow.setTimeout(() => {
          holdIntervalId = formWindow.setInterval(
            () => stepNumberInput(numberInput, stepperDirection),
            55
          );
        }, 320);
        capturePointer(stepperButton, stepperPointerDownEvent.pointerId);
      });
      for (const pointerEndEventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
        addTrackedListener(stepperButton, pointerEndEventName, () => stopStepperRepeat?.());
      }
    }
    addTrackedListener(numberInput, "keydown", numberKeyEvent => {
      if (["ArrowUp", "ArrowDown"].includes(numberKeyEvent.key)) {
        numberKeyEvent.preventDefault();
        stepNumberInput(numberInput, numberKeyEvent.key === "ArrowUp" ? 1 : -1);
      }
    });
    numberFieldEntries.push({
      field: numberInput,
      peers: stepperButtons
    });
  }
  // 下拉菜单键盘导航：上下切换、回车选择、Esc 关闭并还原焦点。
  function handleMenuKeyDown(menuKeyEvent) {
    const activeSelectEntry = customSelects.find(
      selectEntryRecord =>
        selectEntryRecord.button === menuKeyEvent.target ||
        selectEntryRecord.menu.contains(menuKeyEvent.target)
    );
    if (!activeSelectEntry) {
      return;
    }
    if (menuKeyEvent.key === "Escape" && openSelect) {
      menuKeyEvent.preventDefault();
      menuKeyEvent.stopImmediatePropagation();
      closeSelectMenu(true);
      return;
    }
    if (menuKeyEvent.key === "Tab") {
      closeSelectMenu();
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(menuKeyEvent.key)) {
      return;
    }
    menuKeyEvent.preventDefault();
    menuKeyEvent.stopImmediatePropagation();
    if (openSelect !== activeSelectEntry) {
      openSelectMenu(activeSelectEntry, true);
      return;
    }
    if (["Enter", " "].includes(menuKeyEvent.key)) {
      chooseSelectOption(
        activeSelectEntry,
        menuKeyEvent.target.closest(".custom-select-option") ||
          activeSelectEntry.menu.querySelector(".active")
      );
      return;
    }
    const enabledOptions = [...activeSelectEntry.menu.children].filter(
      enabledOptionButton => !enabledOptionButton.disabled
    );
    const focusedOptionIndex = enabledOptions.indexOf(formDocument.activeElement);
    const nextOptionIndex =
      menuKeyEvent.key === "Home"
        ? 0
        : menuKeyEvent.key === "End"
          ? enabledOptions.length - 1
          : (focusedOptionIndex +
              (menuKeyEvent.key === "ArrowUp" ? -1 : 1) +
              enabledOptions.length) %
            enabledOptions.length;
    enabledOptions[nextOptionIndex]?.focus();
  }
  addTrackedListener(formDocument, "keydown", handleMenuKeyDown, true);
  addTrackedListener(
    formDocument,
    "pointerdown",
    documentPointerDownEvent => {
      if (
        openSelect &&
        !openSelect.wrapper.contains(documentPointerDownEvent.target) &&
        !openSelect.menu.contains(documentPointerDownEvent.target)
      ) {
        closeSelectMenu();
      }
    },
    true
  );
  addTrackedListener(formWindow, "resize", () => closeSelectMenu());
  addTrackedListener(formWindow, "blur", () => {
    stopStepperRepeat?.();
    closeSelectMenu();
  });
  addTrackedListener(formDocument, "visibilitychange", () => {
    if (formDocument.hidden) {
      stopStepperRepeat?.();
      closeSelectMenu();
    }
  });
  addTrackedListener(
    editorRootElement.querySelector(".p2r-panel"),
    "scroll",
    () => closeSelectMenu(),
    {
      passive: true
    }
  );
  return {
    sync() {
      customSelects.forEach(syncCustomSelect);
      for (const { field: syncedNumberInput, peers: peerButtons } of numberFieldEntries) {
        for (const peerButton of peerButtons) {
          peerButton.disabled = syncedNumberInput.disabled || syncedNumberInput.readOnly;
        }
      }
    },
    close() {
      closeSelectMenu();
      stopStepperRepeat?.();
    },
    dispose() {
      closeSelectMenu();
      stopStepperRepeat?.();
      eventCleanupCallbacks.forEach(cleanupCallback => cleanupCallback());
      customSelects.forEach(disposalSelectEntry => disposalSelectEntry.menu.remove());
    }
  };
}
