const svgUrl = "http://www.w3.org/2000/svg",
  clampNumber = (numericValue, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, numericValue)),
  coercedFiniteNumberOr = (inputValue, fallback = 0) =>
    Number.isFinite(Number(inputValue)) ? Number(inputValue) : fallback,
  deepCloneObject = (sourceObject) => JSON.parse(JSON.stringify(sourceObject || {})),
  roundToHundredth = (numericInput) => Math.round(numericInput * 100) / 100,
  toRegionKey = (areaIdPart, lightIdPart) =>
    JSON.stringify([String(areaIdPart), String(lightIdPart)]);
export function resizeRegionDimensions(
  sourceRegion,
  requestedWidth,
  requestedDepth,
  handleName,
  shouldKeepAspect = false,
) {
  if (
    (["n", "s"].includes(handleName) && (requestedWidth = sourceRegion.width),
    ["w", "e"].includes(handleName) && (requestedDepth = sourceRegion.depth),
    shouldKeepAspect)
  ) {
    const widthRatio = requestedWidth / sourceRegion.width,
      depthRatio = requestedDepth / sourceRegion.depth;
    let uniformScale = ["w", "e"].includes(handleName)
      ? widthRatio
      : ["n", "s"].includes(handleName)
        ? depthRatio
        : Math.abs(widthRatio - 1) >= Math.abs(depthRatio - 1)
          ? widthRatio
          : depthRatio;
    return (
      (uniformScale = clampNumber(
        uniformScale,
        Math.max(0.5 / sourceRegion.width, 0.5 / sourceRegion.depth),
        Math.min(20 / sourceRegion.width, 20 / sourceRegion.depth),
      )),
      {
        width: roundToHundredth(sourceRegion.width * uniformScale),
        depth: roundToHundredth(sourceRegion.depth * uniformScale),
      }
    );
  }
  return {
    width: roundToHundredth(clampNumber(requestedWidth, 0.5, 20)),
    depth: roundToHundredth(clampNumber(requestedDepth, 0.5, 20)),
  };
}
export function regionHeightPatch(regionDescriptor, changedField, fieldValue) {
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
    [changedField]: fieldValue,
  };
  return (
    heightPatch.heightMin !== undefined &&
      heightPatch.heightMax !== undefined &&
      heightPatch.heightMin > heightPatch.heightMax &&
      (heightPatch[changedField === "heightMin" ? "heightMax" : "heightMin"] = fieldValue),
    heightPatch
  );
}
export function mountRegionRangeEditor(
  editorHost,
  {
    getConfig: getConfig = () => ({}),
    onChange: onChange = () => {},
    onClose: onClose = () => {},
    wake: wake = () => {},
    standalone: standalone = false,
  } = {},
) {
  const editorDocumentNode = editorHost.container.ownerDocument,
    editorWindow = editorDocumentNode.defaultView,
    three = editorHost.THREE,
    editorElement = editorDocumentNode.createElement("section");
  ((editorElement.className = "plan2-range-editor"),
    (editorElement.dataset.testid = "range-editor"),
    (editorElement.hidden = true),
    editorElement.setAttribute("aria-label", "平面光区编辑"),
    (editorElement.innerHTML =
      '\n    <svg aria-label="灯具与照射范围" role="group"></svg>\n    <header class="p2r-top"><div class="p2r-title">平面光区编辑<small>拖动边角调整范围，按住 Shift 等比例缩放</small></div><span class="p2r-compact-caption">自由拖动 · Shift 等比</span></header>\n    <div class="p2r-panel">\n      <h3>照射范围</h3>\n      <div class="p2r-view-switch" role="group" aria-label="编辑视图">\n        <button type="button" data-action="view-plan" aria-pressed="true">平面编辑</button>\n        <button type="button" data-action="view-3d" aria-pressed="false">3D 预览</button>\n      </div>\n      <div class="p2r-selectors">\n        <label class="p2r-field">楼层<select data-field="floor" aria-label="楼层"></select></label>\n        <label class="p2r-field">灯具<select data-field="fixture" aria-label="灯具"></select></label>\n      </div>\n      <div class="p2r-grid">\n        <label class="p2r-field p2r-shape">光区形状<select data-field="shape" aria-label="光区形状"><option value="circle">圆形</option><option value="square">方形</option></select></label>\n        <label class="p2r-field"><span data-width-label>宽度（米）</span><input data-field="width" aria-label="宽度（米）" type="number" min="0.5" max="20" step="0.1" inputmode="decimal"></label>\n        <label class="p2r-field"><span data-depth-label>深度（米）</span><input data-field="depth" aria-label="深度（米）" type="number" min="0.5" max="20" step="0.1" inputmode="decimal"></label>\n        <label class="p2r-field p2r-rotation">旋转（度）<input data-field="rotation" aria-label="旋转（度）" type="number" min="-180" max="180" step="1" inputmode="decimal"></label>\n        <label class="p2r-field p2r-soft-field">边缘柔和度<span class="p2r-softness"><input data-field="softness" aria-label="边缘柔和度" type="range" min="5" max="100" step="1"><output data-soft-value>35%</output></span></label>\n      </div>\n      <h3>离地照明范围</h3>\n      <div class="p2r-grid">\n        <label class="p2r-field">最低照到（米）<input data-field="heightMin" aria-label="最低照到（米）" type="number" min="0" max="20" step="0.05" placeholder="自动" inputmode="decimal"></label>\n        <label class="p2r-field">最高照到（米）<input data-field="heightMax" aria-label="最高照到（米）" type="number" min="0" max="20" step="0.05" placeholder="自动" inputmode="decimal"></label>\n      </div>\n      <p class="p2r-status" data-height-summary></p>\n      <p class="p2r-status">从本层地面算起，0 米是地面；留空自动。切到“3D 预览”可边调高度边看效果。</p>\n      <div class="p2r-options">\n        <label class="p2r-check i3d-setting-toggle"><input data-field="moveCenter" type="checkbox">允许移动范围中心</label>\n        <label class="p2r-check i3d-setting-toggle"><input data-field="group" type="checkbox">同步本组范围</label>\n        <label class="p2r-check i3d-setting-toggle"><input data-field="preview" type="checkbox"><span data-preview-label>仅预览当前灯</span></label>\n      </div>\n      <div class="p2r-actions"><button type="button" data-action="reset-center">中心回到灯位</button><button type="button" data-action="reset">恢复模型默认</button><button type="button" class="p2r-done" data-action="close">完成</button></div>\n      <p class="p2r-status" role="status" aria-live="polite"></p>\n    </div>\n    <div class="p2r-help">外边界为光照衰减到零的位置 · 范围不代表墙体挡光</div>'),
    (editorElement.querySelector("[data-action=close]").hidden = standalone),
    editorHost.container.append(editorElement));
  const svgElement = editorElement.querySelector("svg"),
    panelElement = editorElement.querySelector(".p2r-panel"),
    fieldElements = Object.fromEntries(
      [...editorElement.querySelectorAll("[data-field]")].map((fieldElement) => [
        fieldElement.dataset.field,
        fieldElement,
      ]),
    ),
    statusElement = editorElement.querySelector(".p2r-status[role=status]"),
    softnessOutputElement = editorElement.querySelector("[data-soft-value]"),
    formControls = mountRangeFormControls(editorElement),
    raycaster = new three.Raycaster(),
    pointerNdc = new three.Vector2(),
    groundPlane = new three.Plane(new three.Vector3(0, 1, 0), 0);
  let isOpen = false,
    isDisposed = false,
    overridesByRegionKey = {},
    regions = [],
    selectedRegionKey = "",
    activeFloorId = "",
    saveErrorText = "",
    openedCameraState = null,
    requestedFloorSelection = "",
    hasPreviousControlsEnabled = true,
    topViewCameraState = null,
    isThreeDPreview = false,
    savedCameraState3d = null,
    savedCameraStatePlan = null,
    dragState = null,
    animationFrameId = 0,
    isFitPending = false,
    isFittingCamera = false,
    cameraChangeUnsubscribe = null,
    lastWidthPx = 0,
    lastHeightPx = 0;
  const getRegionLighting = () => editorHost.regionLighting,
    getSelectedRegion = () =>
      regions.find((matchingRegion) => matchingRegion.key === selectedRegionKey),
    findFloorById = (floorId) =>
      (editorHost.document?.floors || []).find((floor) => String(floor.id) === String(floorId)),
    findRegionSiblings = (sourceRegionItem) =>
      sourceRegionItem
        ? regions.filter(
            (siblingCandidate) =>
              String(siblingCandidate.floorId) === String(sourceRegionItem.floorId) &&
              (sourceRegionItem.groupId
                ? siblingCandidate.groupId === sourceRegionItem.groupId
                : siblingCandidate.key === sourceRegionItem.key),
          )
        : [],
    getAffectedRegionKeys = () =>
      fieldElements.group.checked
        ? findRegionSiblings(getSelectedRegion()).map((groupRegion) => groupRegion.key)
        : getSelectedRegion()
          ? [selectedRegionKey]
          : [];
  function reloadRegionList() {
    regions = (getRegionLighting()?.listRegions?.() || []).map((rawRegion) => {
      const regionFloor = findFloorById(rawRegion.floorId),
        matchedSceneItem = regionFloor?.scene?.items?.find(
          (sceneItem) => String(sceneItem.id) === String(rawRegion.id),
        ),
        lightGroupId = matchedSceneItem?.lightGroupId || "",
        lightEntry = (getConfig()?.lights || []).find(
          (lightConfig) =>
            String(lightConfig.floorId) === String(rawRegion.floorId) &&
            lightConfig.groupId === lightGroupId,
        ),
        lightGroupEntry = regionFloor?.scene?.lightGroups?.find(
          (lightGroup) => lightGroup.id === lightGroupId,
        );
      return {
        ...rawRegion,
        key: rawRegion.key || toRegionKey(rawRegion.floorId, rawRegion.id),
        groupId: lightGroupId,
        label: lightEntry?.label || lightGroupEntry?.name || matchedSceneItem?.name || "灯具",
      };
    });
    for (const regionItem of regions) {
      const siblingRegions = findRegionSiblings(regionItem);
      regionItem.fixtureLabel =
        "" +
        regionItem.label +
        (siblingRegions.length > 1
          ? " · " +
            (siblingRegions.findIndex((siblingRegion) => siblingRegion.key === regionItem.key) +
              1) +
            "/" +
            siblingRegions.length
          : "");
    }
    const floorRegions = regions.filter(
      (floorRegion) => String(floorRegion.floorId) === activeFloorId,
    );
    floorRegions.some((regionEntry) => regionEntry.key === selectedRegionKey) ||
      (selectedRegionKey = floorRegions[0]?.key || "");
  }
  function createOptionElement(optionValue, optionLabel) {
    const optionElement = editorDocumentNode.createElement("option");
    return (
      (optionElement.value = optionValue),
      (optionElement.textContent = optionLabel),
      optionElement
    );
  }
  function syncFormState() {
    (fieldElements.floor.replaceChildren(
      ...(editorHost.document?.floors || []).map((floorEntry) =>
        createOptionElement(String(floorEntry.id), floorEntry.name || "楼层"),
      ),
    ),
      (fieldElements.floor.value = activeFloorId),
      fieldElements.fixture.replaceChildren(
        ...regions
          .filter((floorRegionEntry) => String(floorRegionEntry.floorId) === activeFloorId)
          .map((selectedFloorRegion) =>
            createOptionElement(selectedFloorRegion.key, selectedFloorRegion.fixtureLabel),
          ),
      ),
      (fieldElements.fixture.value = selectedRegionKey));
    const selectedRegion = getSelectedRegion(),
      hasSelectedRegion = !!selectedRegion,
      selectedSiblings = findRegionSiblings(selectedRegion);
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
      "heightMax",
    ])
      fieldElements[fieldToDisable].disabled = !hasSelectedRegion;
    if (
      ((fieldElements.group.disabled = selectedSiblings.length < 2),
      (editorElement.querySelector("[data-preview-label]").textContent =
        fieldElements.group.checked && selectedSiblings.length > 1
          ? "仅预览当前灯组"
          : "仅预览当前灯"),
      (editorElement.querySelector("[data-action=reset]").disabled = !hasSelectedRegion),
      (editorElement.querySelector("[data-action=reset-center]").hidden =
        !selectedRegion || (!selectedRegion.offsetX && !selectedRegion.offsetZ)),
      (fieldElements.moveCenter.checked = selectedRegion?.moveCenterEnabled === true),
      selectedRegion)
    ) {
      fieldElements.shape.value = ["square", "strip"].includes(selectedRegion.shape)
        ? "square"
        : "circle";
      for (const sizeField of ["width", "depth", "rotation"])
        editorDocumentNode.activeElement !== fieldElements[sizeField] &&
          (fieldElements[sizeField].value = roundToHundredth(selectedRegion[sizeField]));
      for (const heightField of ["heightMin", "heightMax"])
        editorDocumentNode.activeElement !== fieldElements[heightField] &&
          (fieldElements[heightField].value =
            selectedRegion[heightField] === undefined
              ? ""
              : roundToHundredth(selectedRegion[heightField]));
      const formatHeightText = (heightLevel) =>
        heightLevel === undefined
          ? "自动"
          : heightLevel <= 0
            ? "地面"
            : roundToHundredth(heightLevel) + " 米";
      ((editorElement.querySelector("[data-height-summary]").textContent =
        "灯具离地 " +
        roundToHundredth(selectedRegion.lampHeight || 0) +
        " 米 · 照明：" +
        formatHeightText(selectedRegion.heightMin) +
        " ～ " +
        formatHeightText(selectedRegion.heightMax)),
        (fieldElements.softness.value = Math.round(selectedRegion.softness * 100)),
        (softnessOutputElement.value = fieldElements.softness.value + "%"),
        (statusElement.textContent =
          fieldElements.group.checked && selectedSiblings.length > 1
            ? "本组 " + selectedSiblings.length + " 盏 · 修改会同步到各自灯位"
            : selectedSiblings.length > 1
              ? "本组 " + selectedSiblings.length + " 盏 · 当前只调整这一盏"
              : isThreeDPreview
                ? "旋转或缩放查看效果 · 修改高度实时预览"
                : selectedRegion.moveCenterEnabled
                  ? "拖动光区或中心十字移动范围 · 灯位不变"
                  : "范围中心已锁定 · 可拖动边角调整大小"));
    } else statusElement.textContent = "当前楼层暂无可编辑灯具，请切换楼层。";
    (saveErrorText
      ? ((statusElement.textContent = "本次保存未成功：" + saveErrorText + "。当前预览仍保留。"),
        (statusElement.style.color = "#ffc28d"))
      : statusElement.style.removeProperty("color"),
      formControls.sync());
  }
  function applyPreviewToScene() {
    const previewKeys = fieldElements.preview.checked ? getAffectedRegionKeys() : null;
    (getRegionLighting()?.setPreview?.(previewKeys),
      editorHost.invalidateRegionLighting?.(),
      wake());
  }
  function applyOverride(overridePatch, shouldRefreshControls = false) {
    if (getSelectedRegion()) {
      for (const affectedRegionKey of getAffectedRegionKeys()) {
        const overrideRegionEntry = regions.find(
            (overrideRegion) => overrideRegion.key === affectedRegionKey,
          ),
          patchedOverride = overridePatch.heightEdit
            ? regionHeightPatch(
                overrideRegionEntry,
                overridePatch.heightEdit.field,
                overridePatch.heightEdit.value,
              )
            : overridePatch,
          nextOverride = {
            width: overrideRegionEntry.width,
            depth: overrideRegionEntry.depth,
            rotation: overrideRegionEntry.rotation,
            softness: overrideRegionEntry.softness,
            shape: overrideRegionEntry.shape,
            offsetX: overrideRegionEntry.offsetX || 0,
            offsetZ: overrideRegionEntry.offsetZ || 0,
            moveCenterEnabled: overrideRegionEntry.moveCenterEnabled === true,
            ...(overridesByRegionKey[affectedRegionKey] || {}),
            ...patchedOverride,
          };
        overridePatch.shape &&
          (nextOverride.shape = ["square", "strip"].includes(nextOverride.shape)
            ? "square"
            : "circle");
        for (const heightKey of ["heightAbove", "heightBelow", "heightMin", "heightMax"])
          nextOverride[heightKey] === undefined && delete nextOverride[heightKey];
        overridesByRegionKey[affectedRegionKey] = nextOverride;
      }
      (getRegionLighting()?.setOverrides?.(overridesByRegionKey),
        editorHost.invalidateRegionLighting?.(),
        wake(),
        reloadRegionList(),
        syncFormState(),
        renderSvgOverlay(),
        shouldRefreshControls && commitOverrides());
    }
  }
  function commitOverrides() {
    ((overridesByRegionKey = deepCloneObject(
      getRegionLighting()?.getOverrides?.() || overridesByRegionKey,
    )),
      onChange(deepCloneObject(overridesByRegionKey)));
  }
  function projectWorldToScreen(worldX, worldY, worldZ) {
    const canvasRect = editorHost.canvas.getBoundingClientRect(),
      editorRect = editorElement.getBoundingClientRect(),
      projectedPoint = new three.Vector3(worldX, worldY, worldZ).project(editorHost.camera);
    return [
      canvasRect.left - editorRect.left + ((projectedPoint.x + 1) * canvasRect.width) / 2,
      canvasRect.top - editorRect.top + ((1 - projectedPoint.y) * canvasRect.height) / 2,
    ];
  }
  function getLampWorldHeight() {
    return coercedFiniteNumberOr(editorHost.worldPoint?.(activeFloorId, 0, 0, 0.065)?.y, 0.065);
  }
  function projectRegionOffset(region, offsetAlongX, offsetAlongZ, screenWorldY) {
    const [axisX, axisZ] = region.axis;
    return projectWorldToScreen(
      region.center[0] + offsetAlongX * axisX - offsetAlongZ * axisZ,
      screenWorldY,
      region.center[2] + offsetAlongX * axisZ + offsetAlongZ * axisX,
    );
  }
  function createSvgElement(tagName, attributes, parentElement = svgElement) {
    const createdSvgElement = editorDocumentNode.createElementNS(svgUrl, tagName);
    for (const [attributeName, attributeValue] of Object.entries(attributes || {}))
      createdSvgElement.setAttribute(attributeName, String(attributeValue));
    return (parentElement.append(createdSvgElement), createdSvgElement);
  }
  function buildRegionPath(pathRegion, pathWorldY, insetScale = 1) {
    const halfWidth = (pathRegion.width * insetScale) / 2,
      halfDepth = (pathRegion.depth * insetScale) / 2,
      pathPoints = [];
    if (pathRegion.shape === "square")
      return (
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]
          .map(([cornerSignX, cornerSignZ], cornerIndex) => {
            const cornerPoint = projectRegionOffset(
              pathRegion,
              cornerSignX * halfWidth,
              cornerSignZ * halfDepth,
              pathWorldY,
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
    for (let stepIndex = 0; stepIndex < 64; stepIndex += 1) {
      const angleRad = (stepIndex * Math.PI * 2) / 64,
        cosAngle = Math.cos(angleRad),
        sinAngle = Math.sin(angleRad),
        minHalfExtent = Math.min(halfWidth, halfDepth),
        localX =
          pathRegion.shape === "strip"
            ? Math.sign(cosAngle) * (halfWidth - minHalfExtent) + cosAngle * minHalfExtent
            : cosAngle * halfWidth,
        localZ =
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
            pathPoint[1].toFixed(2),
        )
        .join("") + "Z"
    );
  }
  function renderSvgOverlay() {
    if (!isOpen || !editorHost.camera || isThreeDPreview) return;
    editorHost.camera.updateMatrixWorld();
    const overlayRect = editorElement.getBoundingClientRect(),
      lampHeight = getLampWorldHeight();
    (svgElement.setAttribute(
      "viewBox",
      "0 0 " + (overlayRect.width || 1) + " " + (overlayRect.height || 1),
    ),
      svgElement.replaceChildren());
    const regionLayerElement = createSvgElement("g"),
      markerLayerElement = createSvgElement("g"),
      activeSelectedRegion = getSelectedRegion(),
      siblingRegionKeySet = new Set(
        findRegionSiblings(activeSelectedRegion).map((siblingRegionItem) => siblingRegionItem.key),
      ),
      orderedRegions = regions
        .filter((floorRegionItem) => String(floorRegionItem.floorId) === activeFloorId)
        .sort(
          (sortFirstRegion, sortSecondRegion) =>
            +(sortFirstRegion.key === selectedRegionKey) -
            +(sortSecondRegion.key === selectedRegionKey),
        );
    for (const overlayRegion of orderedRegions) {
      const isCurrentRegion = overlayRegion.key === selectedRegionKey,
        isSiblingSelected = siblingRegionKeySet.has(overlayRegion.key);
      ((isCurrentRegion || isSiblingSelected) &&
        createSvgElement(
          "path",
          {
            ...(isCurrentRegion && overlayRegion.moveCenterEnabled
              ? {
                  "data-range-handle": "move",
                  cursor: "move",
                }
              : {}),
            d: buildRegionPath(overlayRegion, lampHeight),
            fill: isCurrentRegion ? "#edb06012" : "none",
            stroke: isCurrentRegion ? "#f2b768" : "#99afc0",
            "stroke-width": isCurrentRegion ? 1.6 : 1,
            "stroke-dasharray": isCurrentRegion ? "none" : "4 4",
            opacity: isCurrentRegion ? 1 : 0.45,
          },
          regionLayerElement,
        ),
        isCurrentRegion &&
          createSvgElement(
            "path",
            {
              d: buildRegionPath(
                overlayRegion,
                lampHeight,
                Math.max(0.05, 1 - overlayRegion.softness),
              ),
              fill: "none",
              stroke: "#efb56f",
              "stroke-width": 1,
              "stroke-dasharray": "3 5",
              opacity: 0.42,
            },
            regionLayerElement,
          ));
      const markerWorldCenter = overlayRegion.lampCenter || overlayRegion.center,
        [markerX, markerY] = projectWorldToScreen(
          markerWorldCenter[0],
          lampHeight,
          markerWorldCenter[2],
        ),
        markerGroupElement = createSvgElement(
          "g",
          {
            "data-region-key": overlayRegion.key,
            role: "button",
            tabindex: "0",
            "aria-label": "选择" + overlayRegion.fixtureLabel,
          },
          markerLayerElement,
        );
      (createSvgElement(
        "circle",
        {
          cx: markerX,
          cy: markerY,
          r: 12,
          fill: "transparent",
        },
        markerGroupElement,
      ),
        createSvgElement(
          "circle",
          {
            cx: markerX,
            cy: markerY,
            r: isCurrentRegion ? 5 : 3.8,
            fill: isCurrentRegion ? "#ffd498" : "#e9f0f5",
            stroke: isCurrentRegion ? "#a87029" : "#536777",
            "stroke-width": 1.7,
            class: "p2r-marker",
          },
          markerGroupElement,
        ));
      const markerTitleElement = createSvgElement("title", {}, markerGroupElement);
      markerTitleElement.textContent = overlayRegion.fixtureLabel;
    }
    if (!activeSelectedRegion) return;
    const regionCenterPoint = projectRegionOffset(activeSelectedRegion, 0, 0, lampHeight),
      regionLampCenter = activeSelectedRegion.lampCenter || activeSelectedRegion.center,
      lampCenterScreen = projectWorldToScreen(regionLampCenter[0], lampHeight, regionLampCenter[2]);
    if (
      ((activeSelectedRegion.offsetX || activeSelectedRegion.offsetZ) &&
        createSvgElement("line", {
          x1: lampCenterScreen[0],
          y1: lampCenterScreen[1],
          x2: regionCenterPoint[0],
          y2: regionCenterPoint[1],
          stroke: "#e8b76e",
          "stroke-width": 1,
          "stroke-dasharray": "4 4",
          "pointer-events": "none",
        }),
      activeSelectedRegion.moveCenterEnabled)
    ) {
      const [moveHandleX, moveHandleY] = regionCenterPoint,
        moveHandleElement = createSvgElement("g", {
          "data-range-handle": "move",
          role: "button",
          tabindex: "0",
          "aria-label": "拖动光区中心",
          cursor: "move",
        });
      (createSvgElement(
        "circle",
        {
          cx: moveHandleX,
          cy: moveHandleY,
          r: 14,
          fill: "#edb06033",
          stroke: "#f2b768",
        },
        moveHandleElement,
      ),
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
            stroke: "#ffe0ad",
            "stroke-width": 2,
            fill: "none",
          },
          moveHandleElement,
        ));
    }
    const resizeHandleSpecs = [
      ["nw", -1, -1],
      ["ne", 1, -1],
      ["se", 1, 1],
      ["sw", -1, 1],
    ];
    resizeHandleSpecs.push(["w", -1, 0], ["e", 1, 0], ["n", 0, -1], ["s", 0, 1]);
    for (const [resizeHandleName, resizeDirX, resizeDirZ] of resizeHandleSpecs) {
      const [resizeHandleX, resizeHandleY] = projectRegionOffset(
          activeSelectedRegion,
          (resizeDirX * activeSelectedRegion.width) / 2,
          (resizeDirZ * activeSelectedRegion.depth) / 2,
          lampHeight,
        ),
        resizeHandleElement = createSvgElement("g", {
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
              s: "下边调整深度",
            }[resizeHandleName],
        });
      (createSvgElement(
        "circle",
        {
          cx: resizeHandleX,
          cy: resizeHandleY,
          r: 13,
          fill: "transparent",
        },
        resizeHandleElement,
      ),
        createSvgElement(
          "rect",
          {
            x: resizeHandleX - 4.5,
            y: resizeHandleY - 4.5,
            width: 9,
            height: 9,
            rx: 2,
            fill: "#ffe0ad",
            stroke: "#9f6e33",
            "stroke-width": 1.2,
            class: "p2r-handle",
          },
          resizeHandleElement,
        ));
    }
    const centerScreenPoint = projectRegionOffset(activeSelectedRegion, 0, 0, lampHeight),
      rotateAnchorPoint = projectRegionOffset(
        activeSelectedRegion,
        0,
        -activeSelectedRegion.depth / 2,
        lampHeight,
      ),
      rotateDirX = rotateAnchorPoint[0] - centerScreenPoint[0],
      rotateDirZ = rotateAnchorPoint[1] - centerScreenPoint[1],
      rotateDirLength = Math.max(1, Math.hypot(rotateDirX, rotateDirZ)),
      rotateHandlePoint = [
        rotateAnchorPoint[0] + (rotateDirX / rotateDirLength) * 27,
        rotateAnchorPoint[1] + (rotateDirZ / rotateDirLength) * 27,
      ];
    createSvgElement("line", {
      x1: rotateAnchorPoint[0],
      y1: rotateAnchorPoint[1],
      x2: rotateHandlePoint[0],
      y2: rotateHandlePoint[1],
      stroke: "#eabc7b",
      "stroke-width": 1.2,
    });
    const rotateHandleElement = createSvgElement("g", {
      "data-range-handle": "rotate",
      role: "button",
      tabindex: "0",
      "aria-label": "拖动旋转照射范围",
    });
    (createSvgElement(
      "circle",
      {
        cx: rotateHandlePoint[0],
        cy: rotateHandlePoint[1],
        r: 14,
        fill: "transparent",
      },
      rotateHandleElement,
    ),
      createSvgElement(
        "circle",
        {
          cx: rotateHandlePoint[0],
          cy: rotateHandlePoint[1],
          r: 5,
          fill: "#f3c581",
          stroke: "#956527",
          "stroke-width": 1.2,
          class: "p2r-handle",
        },
        rotateHandleElement,
      ));
  }
  function pickGroundPoint(groundPickEvent) {
    const pickCanvasRect = editorHost.canvas.getBoundingClientRect();
    return !pickCanvasRect.width || !pickCanvasRect.height
      ? null
      : (pointerNdc.set(
          ((groundPickEvent.clientX - pickCanvasRect.left) / pickCanvasRect.width) * 2 - 1,
          1 - ((groundPickEvent.clientY - pickCanvasRect.top) / pickCanvasRect.height) * 2,
        ),
        raycaster.setFromCamera(pointerNdc, editorHost.camera),
        (groundPlane.constant = -getLampWorldHeight()),
        raycaster.ray.intersectPlane(groundPlane, new three.Vector3()));
  }
  function handlePointerDown(pointerDownEvent) {
    if (pointerDownEvent.button !== 0 || !isOpen || isThreeDPreview) return;
    const grabHandleElement = pointerDownEvent.target.closest?.("[data-range-handle]");
    if (grabHandleElement && getSelectedRegion()) {
      if (
        grabHandleElement.dataset.rangeHandle === "move" &&
        !getSelectedRegion().moveCenterEnabled
      )
        return;
      (pointerDownEvent.preventDefault(),
        pointerDownEvent.stopPropagation(),
        grabHandleElement.focus?.());
      const pressedRegion = getSelectedRegion(),
        pressGroundPoint = pickGroundPoint(pointerDownEvent);
      if (!pressGroundPoint) return;
      ((dragState = {
        pointerId: pointerDownEvent.pointerId,
        handle: grabHandleElement.dataset.rangeHandle,
        region: deepCloneObject(pressedRegion),
        point: pressGroundPoint,
        initial: deepCloneObject(overridesByRegionKey),
        changed: false,
      }),
        svgElement.setPointerCapture(pointerDownEvent.pointerId));
    } else {
      const regionMarkerElement = pointerDownEvent.target.closest?.("[data-region-key]");
      regionMarkerElement &&
        (pointerDownEvent.preventDefault(),
        selectRegionByKey(regionMarkerElement.dataset.regionKey));
    }
  }
  function handlePointerMove(pointerMoveEvent) {
    if (!dragState || pointerMoveEvent.pointerId !== dragState.pointerId) return;
    const moveGroundPoint = pickGroundPoint(pointerMoveEvent);
    if (!moveGroundPoint) return;
    pointerMoveEvent.preventDefault();
    const dragRegion = dragState.region,
      [dragAxisX, dragAxisZ] = dragRegion.axis,
      deltaAlongX = moveGroundPoint.x - dragRegion.center[0],
      deltaAlongZ = moveGroundPoint.z - dragRegion.center[2];
    if (dragState.handle === "move")
      applyOverride({
        offsetX: roundToHundredth(
          clampNumber((dragRegion.offsetX || 0) + moveGroundPoint.x - dragState.point.x, -100, 100),
        ),
        offsetZ: roundToHundredth(
          clampNumber((dragRegion.offsetZ || 0) + moveGroundPoint.z - dragState.point.z, -100, 100),
        ),
      });
    else {
      if (dragState.handle === "rotate") {
        const grabAngleRad = Math.atan2(
            dragState.point.z - dragRegion.center[2],
            dragState.point.x - dragRegion.center[0],
          ),
          rotationDeltaRad = Math.atan2(deltaAlongZ, deltaAlongX) - grabAngleRad;
        let nextRotationDeg = dragRegion.rotation + (rotationDeltaRad * 180) / Math.PI;
        ((nextRotationDeg = ((((nextRotationDeg + 180) % 360) + 360) % 360) - 180),
          pointerMoveEvent.shiftKey && (nextRotationDeg = Math.round(nextRotationDeg / 15) * 15),
          applyOverride({
            rotation: roundToHundredth(nextRotationDeg),
          }));
      } else {
        const nextWidth = 2 * Math.abs(deltaAlongX * dragAxisX + deltaAlongZ * dragAxisZ),
          nextDepth = 2 * Math.abs(-deltaAlongX * dragAxisZ + deltaAlongZ * dragAxisX);
        applyOverride(
          resizeRegionDimensions(
            dragRegion,
            nextWidth,
            nextDepth,
            dragState.handle,
            pointerMoveEvent.shiftKey,
          ),
        );
      }
    }
    dragState.changed = true;
  }
  function finishDrag(endDragEvent, shouldRevert = false) {
    if (!dragState || (endDragEvent && endDragEvent.pointerId !== dragState.pointerId)) return;
    const finishedDrag = dragState;
    ((dragState = null),
      svgElement.hasPointerCapture(finishedDrag.pointerId) &&
        svgElement.releasePointerCapture(finishedDrag.pointerId),
      shouldRevert
        ? ((overridesByRegionKey = finishedDrag.initial),
          getRegionLighting()?.setOverrides?.(overridesByRegionKey),
          editorHost.invalidateRegionLighting?.(),
          reloadRegionList(),
          syncFormState(),
          renderSvgOverlay())
        : finishedDrag.changed && commitOverrides());
  }
  function selectRegionByKey(regionKey) {
    (dragState && finishDrag(null),
      (selectedRegionKey = regionKey),
      syncFormState(),
      applyPreviewToScene(),
      renderSvgOverlay());
  }
  function suspendOrbitControls() {
    editorHost.controls && (editorHost.controls.enabled = false);
  }
  function syncCameraInteraction() {
    (editorHost.setCameraInteraction?.({
      enabled: isOpen && isThreeDPreview,
      rotationMode: "free",
      panEnabled: isThreeDPreview,
      zoomEnabled: isThreeDPreview,
    }),
      isThreeDPreview || suspendOrbitControls());
  }
  function set3dPreviewEnabled(shouldUse3dPreview) {
    if (!isOpen || isThreeDPreview === shouldUse3dPreview) return;
    (finishDrag(null),
      isThreeDPreview
        ? (savedCameraState3d = deepCloneObject(editorHost.cameraState(true)))
        : (savedCameraStatePlan = deepCloneObject(editorHost.cameraState(true))),
      (isThreeDPreview = shouldUse3dPreview),
      (svgElement.style.display = isThreeDPreview ? "none" : ""),
      editorElement
        .querySelector("[data-action=view-plan]")
        .setAttribute("aria-pressed", String(!isThreeDPreview)),
      editorElement
        .querySelector("[data-action=view-3d]")
        .setAttribute("aria-pressed", String(isThreeDPreview)),
      (editorElement.querySelector(".p2r-title").textContent = isThreeDPreview
        ? "3D 高度预览 · 拖动旋转，滚轮缩放"
        : "俯视范围编辑 · 拖动边角调整"),
      (editorElement.querySelector(".p2r-compact-caption").textContent = isThreeDPreview
        ? "拖动旋转 · 双指缩放"
        : "自由拖动 · Shift 等比"));
    const cameraStateToRestore = isThreeDPreview ? savedCameraState3d : savedCameraStatePlan;
    (cameraStateToRestore ? editorHost.restoreCamera(cameraStateToRestore) : fitCameraToContent(),
      syncCameraInteraction(),
      syncFormState(),
      renderSvgOverlay(),
      editorHost.invalidateRegionLighting?.(),
      wake());
  }
  function computeGroundBounds(horizontalAxis, verticalAxis) {
    const floorScene = findFloorById(activeFloorId)?.scene,
      groundSamplePoints = [],
      addSamplePoint = (sampleWorldX, sampleWorldY, sampleRadius = 0) => {
        if (!Number.isFinite(Number(sampleWorldX)) || !Number.isFinite(Number(sampleWorldY)))
          return;
        const samplePoint = editorHost.worldPoint?.(
          activeFloorId,
          Number(sampleWorldX),
          Number(sampleWorldY),
          0.065,
        );
        samplePoint &&
          groundSamplePoints.push({
            point: samplePoint,
            radius: sampleRadius,
          });
      };
    for (const wallItem of floorScene?.walls || []) {
      const wallHalfThickness = Math.max(0, coercedFiniteNumberOr(wallItem.thickness, 0.12)) / 2;
      (addSamplePoint(wallItem.start?.x, wallItem.start?.y, wallHalfThickness),
        addSamplePoint(wallItem.end?.x, wallItem.end?.y, wallHalfThickness));
    }
    if (!groundSamplePoints.length)
      for (const floorItem of floorScene?.items || []) {
        const itemOrigin = editorHost.worldPoint?.(activeFloorId, floorItem.x, floorItem.y, 0.065);
        if (!itemOrigin) continue;
        const itemRotationRad = (coercedFiniteNumberOr(floorItem.rotation) * Math.PI) / 180,
          itemCos = Math.cos(itemRotationRad),
          itemSin = Math.sin(itemRotationRad);
        for (const extentSignX of [-1, 1])
          for (const extentSignZ of [-1, 1]) {
            const extentOffsetX =
                (extentSignX * Math.max(0.1, coercedFiniteNumberOr(floorItem.width, 0.5))) / 2,
              extentOffsetZ =
                (extentSignZ * Math.max(0.1, coercedFiniteNumberOr(floorItem.depth, 0.5))) / 2;
            groundSamplePoints.push({
              point: new three.Vector3(
                itemOrigin.x + extentOffsetX * itemCos - extentOffsetZ * itemSin,
                itemOrigin.y,
                itemOrigin.z + extentOffsetX * itemSin + extentOffsetZ * itemCos,
              ),
              radius: 0,
            });
          }
      }
    if (!groundSamplePoints.length) {
      for (const floorRegionForBounds of regions.filter(
        (groundRegionEntry) => String(groundRegionEntry.floorId) === activeFloorId,
      ))
        groundSamplePoints.push({
          point: new three.Vector3().fromArray(floorRegionForBounds.center),
          radius: 0.5,
        });
    }
    groundSamplePoints.length ||
      groundSamplePoints.push({
        point: new three.Vector3(0, 0, 0),
        radius: 2.5,
      });
    let horizontalMin = Infinity,
      horizontalMax = -Infinity,
      verticalMin = Infinity,
      verticalMax = -Infinity;
    for (const { point: boundsSamplePoint, radius: boundsSampleRadius } of groundSamplePoints) {
      const pointAlongHorizontal = boundsSamplePoint.dot(horizontalAxis),
        pointAlongVertical = boundsSamplePoint.dot(verticalAxis);
      ((horizontalMin = Math.min(horizontalMin, pointAlongHorizontal - boundsSampleRadius)),
        (horizontalMax = Math.max(horizontalMax, pointAlongHorizontal + boundsSampleRadius)),
        (verticalMin = Math.min(verticalMin, pointAlongVertical - boundsSampleRadius)),
        (verticalMax = Math.max(verticalMax, pointAlongVertical + boundsSampleRadius)));
    }
    return {
      left: horizontalMin,
      right: horizontalMax,
      bottom: verticalMin,
      top: verticalMax,
    };
  }
  function fitCameraToContent() {
    if (!isOpen || !topViewCameraState || isFittingCamera) return;
    const fitEditorRect = editorElement.getBoundingClientRect(),
      fitPanelRect = panelElement.getBoundingClientRect();
    if (!(fitEditorRect.width < 2 || fitEditorRect.height < 2)) {
      isFittingCamera = true;
      try {
        const fitViewBox =
            fitEditorRect.width <= 620
              ? {
                  x: 14,
                  y: 52,
                  width: fitEditorRect.width - 28,
                  height: Math.max(70, fitPanelRect.top - fitEditorRect.top - 62),
                }
              : {
                  x: 18,
                  y: 68,
                  width: Math.max(70, fitPanelRect.left - fitEditorRect.left - 35),
                  height: Math.max(70, fitEditorRect.height - 115),
                },
          nextCameraState = deepCloneObject(topViewCameraState);
        let upVector = new three.Vector3()
          .fromArray(topViewCameraState.up || [0, 0, -1])
          .normalize();
        const viewDirection = new three.Vector3()
          .fromArray(topViewCameraState.target)
          .sub(new three.Vector3().fromArray(topViewCameraState.position))
          .normalize();
        isThreeDPreview && (viewDirection.set(-1, -1.1, -1).normalize(), upVector.set(0, 1, 0));
        const rightVector = new three.Vector3().crossVectors(viewDirection, upVector).normalize();
        isThreeDPreview && upVector.crossVectors(rightVector, viewDirection).normalize();
        const groundBounds = computeGroundBounds(rightVector, upVector),
          contentWidthPx = Math.max(1, groundBounds.right - groundBounds.left),
          contentHeightPx =
            Math.max(1, groundBounds.top - groundBounds.bottom) + (isThreeDPreview ? 3 : 0),
          fitScale =
            Math.max(
              (contentWidthPx + 0.4) / fitViewBox.width,
              (contentHeightPx + 0.4) / fitViewBox.height,
            ) * 1.08,
          horizontalShiftPx = fitViewBox.x + fitViewBox.width / 2 - fitEditorRect.width / 2,
          verticalShiftPx = fitViewBox.y + fitViewBox.height / 2 - fitEditorRect.height / 2,
          cameraTarget = rightVector
            .clone()
            .multiplyScalar((groundBounds.left + groundBounds.right) / 2)
            .add(upVector.clone().multiplyScalar((groundBounds.bottom + groundBounds.top) / 2));
        if (isThreeDPreview) {
          const fullGroundBounds = computeGroundBounds(
            new three.Vector3(1, 0, 0),
            new three.Vector3(0, 0, 1),
          );
          cameraTarget.set(
            (fullGroundBounds.left + fullGroundBounds.right) / 2,
            0,
            (fullGroundBounds.bottom + fullGroundBounds.top) / 2,
          );
        }
        ((cameraTarget.y = getLampWorldHeight() + 0.6),
          cameraTarget
            .addScaledVector(rightVector, -horizontalShiftPx * fitScale)
            .addScaledVector(upVector, verticalShiftPx * fitScale),
          (nextCameraState.target = cameraTarget.toArray()),
          isThreeDPreview && ((nextCameraState.up = [0, 1, 0]), (nextCameraState.view = "free")),
          (nextCameraState.position = cameraTarget
            .clone()
            .addScaledVector(viewDirection, -Math.max(20, contentWidthPx * 2, contentHeightPx * 2))
            .toArray()),
          (nextCameraState.frameSize =
            fitScale * Math.min(fitEditorRect.width, fitEditorRect.height)),
          (nextCameraState.zoom = 1),
          editorHost.restoreCamera(nextCameraState),
          syncCameraInteraction(),
          editorHost.invalidateRegionLighting?.(),
          wake(),
          (lastWidthPx = fitEditorRect.width),
          (lastHeightPx = fitEditorRect.height),
          renderSvgOverlay());
      } finally {
        isFittingCamera = false;
      }
    }
  }
  function scheduleRender({ fit: shouldFit = false } = {}) {
    isOpen &&
      ((isFitPending ||= shouldFit),
      animationFrameId && editorWindow.cancelAnimationFrame(animationFrameId),
      (animationFrameId = editorWindow.requestAnimationFrame(() => {
        animationFrameId = 0;
        const fitRequested = isFitPending;
        ((isFitPending = false),
          isOpen &&
            (reloadRegionList(),
            syncFormState(),
            fitRequested && !isThreeDPreview ? fitCameraToContent() : renderSvgOverlay()));
      })));
  }
  function setActiveFloor(floorIdToSelect) {
    dragState && finishDrag(null);
    const wasIn3dPreview = isThreeDPreview;
    (wasIn3dPreview && set3dPreviewEnabled(false),
      (activeFloorId = String(floorIdToSelect)),
      (selectedRegionKey = ""),
      (savedCameraStatePlan = null),
      (savedCameraState3d = null),
      editorHost.setFloor(activeFloorId),
      editorHost.setCameraProjection("orthographic"),
      editorHost.topView(),
      (topViewCameraState = deepCloneObject(editorHost.cameraState(true))),
      suspendOrbitControls(),
      editorHost.invalidateRegionLighting?.(),
      reloadRegionList(),
      syncFormState(),
      applyPreviewToScene(),
      wasIn3dPreview
        ? (fitCameraToContent(), set3dPreviewEnabled(true))
        : scheduleRender({
            fit: true,
          }));
  }
  function handleFieldChangeEvent(fieldChangeEvent) {
    const fieldControl = fieldChangeEvent.target,
      fieldName = fieldControl.dataset.field;
    if (fieldName === "floor") return setActiveFloor(fieldControl.value);
    if (fieldName === "fixture") return selectRegionByKey(fieldControl.value);
    if (fieldName === "group" || fieldName === "preview") {
      (syncFormState(), applyPreviewToScene(), renderSvgOverlay());
      return;
    }
    if (fieldName === "moveCenter")
      return applyOverride(
        {
          moveCenterEnabled: fieldControl.checked,
        },
        true,
      );
    if (fieldName === "shape")
      return applyOverride(
        {
          shape: fieldControl.value,
        },
        true,
      );
    if (fieldName === "softness")
      return applyOverride(
        {
          softness: clampNumber(coercedFiniteNumberOr(fieldControl.value, 35) / 100, 0.05, 1),
        },
        true,
      );
    if (["heightMin", "heightMax"].includes(fieldName)) {
      const parsedHeightValue =
        fieldControl.value.trim() === ""
          ? undefined
          : roundToHundredth(clampNumber(coercedFiniteNumberOr(fieldControl.value), 0, 20));
      return (
        (fieldControl.value = parsedHeightValue ?? ""),
        applyOverride(
          {
            heightEdit: {
              field: fieldName,
              value: parsedHeightValue,
            },
          },
          true,
        )
      );
    }
    if (["width", "depth", "rotation"].includes(fieldName)) {
      const currentFieldValue = getSelectedRegion()?.[fieldName],
        nextFieldValue =
          fieldControl.value.trim() === ""
            ? currentFieldValue
            : coercedFiniteNumberOr(fieldControl.value, currentFieldValue);
      ((fieldControl.value = roundToHundredth(
        clampNumber(
          nextFieldValue,
          fieldName === "rotation" ? -180 : 0.5,
          fieldName === "rotation" ? 180 : 20,
        ),
      )),
        applyOverride(
          {
            [fieldName]: Number(fieldControl.value),
          },
          true,
        ));
    }
  }
  function handleEditorKeyDown(editorKeyEvent) {
    if (!isOpen || editorKeyEvent.defaultPrevented) return;
    if (editorKeyEvent.key === "Escape") {
      (editorKeyEvent.preventDefault(), editorKeyEvent.stopPropagation(), closeEditor());
      return;
    }
    const regionKeyElement = editorKeyEvent.target.closest?.("[data-region-key]");
    regionKeyElement &&
      ["Enter", " "].includes(editorKeyEvent.key) &&
      (editorKeyEvent.preventDefault(), selectRegionByKey(regionKeyElement.dataset.regionKey));
    const rangeHandleElement = editorKeyEvent.target.closest?.("[data-range-handle]");
    if (
      !rangeHandleElement ||
      !getSelectedRegion() ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(editorKeyEvent.key)
    )
      return;
    editorKeyEvent.preventDefault();
    const directionSign = ["ArrowUp", "ArrowRight"].includes(editorKeyEvent.key) ? 1 : -1;
    if (rangeHandleElement.dataset.rangeHandle === "move") {
      if (!getSelectedRegion().moveCenterEnabled) return;
      const offsetField = ["ArrowLeft", "ArrowRight"].includes(editorKeyEvent.key)
          ? "offsetX"
          : "offsetZ",
        offsetSign = ["ArrowRight", "ArrowDown"].includes(editorKeyEvent.key) ? 1 : -1;
      applyOverride(
        {
          [offsetField]: roundToHundredth(
            clampNumber(
              (getSelectedRegion()[offsetField] || 0) +
                offsetSign * (editorKeyEvent.shiftKey ? 0.5 : 0.1),
              -100,
              100,
            ),
          ),
        },
        true,
      );
    } else {
      if (rangeHandleElement.dataset.rangeHandle === "rotate")
        applyOverride(
          {
            rotation: clampNumber(
              getSelectedRegion().rotation + directionSign * (editorKeyEvent.shiftKey ? 15 : 1),
              -180,
              180,
            ),
          },
          true,
        );
      else {
        const handleId = rangeHandleElement.dataset.rangeHandle,
          resizedDimensionField = ["w", "e"].includes(handleId)
            ? "width"
            : ["n", "s"].includes(handleId)
              ? "depth"
              : ["ArrowLeft", "ArrowRight"].includes(editorKeyEvent.key)
                ? "width"
                : "depth",
          keyboardRegion = getSelectedRegion(),
          resizePatch = {
            width: keyboardRegion.width,
            depth: keyboardRegion.depth,
            [resizedDimensionField]: keyboardRegion[resizedDimensionField] + directionSign * 0.1,
          };
        applyOverride(
          resizeRegionDimensions(
            keyboardRegion,
            resizePatch.width,
            resizePatch.depth,
            resizedDimensionField === "width" ? "e" : "s",
            editorKeyEvent.shiftKey,
          ),
          true,
        );
      }
    }
  }
  function handleActionClick(actionClickEvent) {
    const actionName = actionClickEvent.target.closest?.("[data-action]")?.dataset.action;
    if (
      (actionName === "view-plan" && set3dPreviewEnabled(false),
      actionName === "view-3d" && set3dPreviewEnabled(true),
      actionName === "close" && closeEditor(),
      actionName === "reset-center" &&
        applyOverride(
          {
            offsetX: 0,
            offsetZ: 0,
          },
          true,
        ),
      actionName === "reset")
    ) {
      for (const resetRegionKey of getAffectedRegionKeys())
        delete overridesByRegionKey[resetRegionKey];
      (getRegionLighting()?.setOverrides?.(overridesByRegionKey),
        editorHost.invalidateRegionLighting?.(),
        wake(),
        reloadRegionList(),
        syncFormState(),
        renderSvgOverlay(),
        commitOverrides());
    }
  }
  (editorElement.addEventListener("change", handleFieldChangeEvent),
    editorElement.addEventListener("input", (fieldInputEvent) => {
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
            value: liveHeightValue,
          },
        });
      }
      fieldInputEvent.target === fieldElements.softness &&
        applyOverride({
          softness: clampNumber(
            coercedFiniteNumberOr(fieldElements.softness.value, 35) / 100,
            0.05,
            1,
          ),
        });
    }),
    editorElement.addEventListener("click", handleActionClick),
    svgElement.addEventListener("pointerdown", handlePointerDown),
    svgElement.addEventListener("pointermove", handlePointerMove),
    svgElement.addEventListener("pointerup", (pointerUpEvent) => finishDrag(pointerUpEvent)),
    svgElement.addEventListener("pointercancel", (pointerCancelEvent) =>
      finishDrag(pointerCancelEvent, true),
    ),
    svgElement.addEventListener("lostpointercapture", (lostPointerCaptureEvent) =>
      finishDrag(lostPointerCaptureEvent),
    ));
  const resizeObserver = new editorWindow.ResizeObserver(() => {
    if (!isOpen || isFittingCamera) return;
    const observedRect = editorElement.getBoundingClientRect();
    Math.abs(observedRect.width - lastWidthPx) > 1 ||
    Math.abs(observedRect.height - lastHeightPx) > 1
      ? scheduleRender({
          fit: true,
        })
      : scheduleRender();
  });
  resizeObserver.observe(editorHost.container);
  function openEditor() {
    if (!(isOpen || isDisposed)) {
      if (!getRegionLighting()?.listRegions) throw new Error("区域灯光尚未准备好，请稍后重试。");
      ((requestedFloorSelection = String(
        getConfig()?.floorSelection ||
          editorHost.document?.activeFloorId ||
          editorHost.document?.floors?.[0]?.id ||
          "",
      )),
        (isThreeDPreview = false),
        (savedCameraState3d = null),
        (savedCameraStatePlan = null),
        (svgElement.style.display = ""),
        (editorElement.querySelector(".p2r-title").textContent = "俯视范围编辑 · 拖动边角调整"),
        (editorElement.querySelector(".p2r-compact-caption").textContent = "自由拖动 · Shift 等比"),
        editorElement.querySelector("[data-action=view-plan]").setAttribute("aria-pressed", "true"),
        editorElement.querySelector("[data-action=view-3d]").setAttribute("aria-pressed", "false"),
        (hasPreviousControlsEnabled = editorHost.controls?.enabled),
        (openedCameraState = deepCloneObject(editorHost.cameraState(true))),
        (isOpen = true),
        (editorElement.hidden = false),
        (overridesByRegionKey = deepCloneObject(
          getConfig()?.lightRegionOverrides || getRegionLighting()?.getOverrides?.() || {},
        )),
        getRegionLighting().setOverrides(overridesByRegionKey),
        (activeFloorId =
          requestedFloorSelection === "all"
            ? String(
                editorHost.document?.activeFloorId || editorHost.document?.floors?.[0]?.id || "",
              )
            : requestedFloorSelection),
        editorHost.setFloor(activeFloorId),
        editorHost.setCameraProjection("orthographic"),
        editorHost.topView(),
        (topViewCameraState = deepCloneObject(editorHost.cameraState(true))),
        suspendOrbitControls(),
        editorDocumentNode.addEventListener("keydown", handleEditorKeyDown, true),
        (cameraChangeUnsubscribe = editorHost.onCameraChange?.(() => {
          !isFittingCamera && !isThreeDPreview && scheduleRender();
        })),
        editorHost.invalidateRegionLighting?.(),
        reloadRegionList(),
        syncFormState(),
        applyPreviewToScene(),
        scheduleRender({
          fit: true,
        }),
        editorElement.querySelector("[data-action=close]").focus({
          preventScroll: true,
        }));
    }
  }
  function closeEditor() {
    isOpen &&
      (formControls.close(),
      finishDrag(null),
      (isOpen = false),
      (editorElement.hidden = true),
      animationFrameId &&
        (editorWindow.cancelAnimationFrame(animationFrameId), (animationFrameId = 0)),
      cameraChangeUnsubscribe?.(),
      (cameraChangeUnsubscribe = null),
      editorDocumentNode.removeEventListener("keydown", handleEditorKeyDown, true),
      getRegionLighting()?.setPreview?.(null),
      editorHost.setFloor(requestedFloorSelection),
      editorHost.restoreCamera(openedCameraState),
      editorHost.controls && (editorHost.controls.enabled = hasPreviousControlsEnabled !== false),
      editorHost.invalidateRegionLighting?.(),
      wake(),
      (topViewCameraState = null),
      onClose());
  }
  function refreshEditor() {
    isOpen && scheduleRender();
  }
  function setSaveStatus(saveError) {
    ((saveErrorText = saveError ? String(saveError.message || saveError) : ""),
      isOpen && syncFormState());
  }
  function disposeEditor() {
    isDisposed ||
      (closeEditor(),
      (isDisposed = true),
      formControls.dispose(),
      resizeObserver.disconnect(),
      editorElement.remove());
  }
  return {
    open: openEditor,
    close: closeEditor,
    flush() {
      (formControls.close(), finishDrag(null), commitOverrides());
    },
    isOpen: () => isOpen,
    syncCameraInteraction: syncCameraInteraction,
    refresh: refreshEditor,
    dispose: disposeEditor,
    setSaveStatus: setSaveStatus,
  };
}
export function mountRangeFormControls(editorRootElement) {
  const formDocumentNode = editorRootElement.ownerDocument,
    formWindow = formDocumentNode.defaultView,
    customSelects = [],
    numberFieldEntries = [],
    eventCleanupCallbacks = [];
  let openSelect = null,
    stopStepperRepeat = null;
  const createStyledElement = (elementTagName, className) => {
      const createdElement = formDocumentNode.createElement(elementTagName);
      return ((createdElement.className = className), createdElement);
    },
    addTrackedListener = (eventTargetElement, eventType, eventListener, listenerOptions) => {
      (eventTargetElement.addEventListener(eventType, eventListener, listenerOptions),
        eventCleanupCallbacks.push(() =>
          eventTargetElement.removeEventListener(eventType, eventListener, listenerOptions),
        ));
    };
  function closeSelectMenu(shouldRestoreFocus = false) {
    if (!openSelect) return;
    const closingSelect = openSelect;
    ((openSelect = null),
      (closingSelect.menu.hidden = true),
      closingSelect.button.setAttribute("aria-expanded", "false"),
      shouldRestoreFocus &&
        closingSelect.button.focus({
          preventScroll: true,
        }));
  }
  function positionSelectMenu() {
    if (!openSelect) return;
    const { button: anchorElement, menu: menuElement } = openSelect,
      anchorRect = anchorElement.getBoundingClientRect(),
      menuHeightCapPx = Math.max(40, Math.min(320, formWindow.innerHeight - 16));
    Object.assign(menuElement.style, {
      width: anchorRect.width + "px",
      maxHeight: menuHeightCapPx + "px",
      left:
        Math.max(8, Math.min(formWindow.innerWidth - anchorRect.width - 8, anchorRect.left)) + "px",
    });
    const menuContentHeightPx = Math.min(menuElement.scrollHeight, menuHeightCapPx);
    menuElement.style.top =
      (anchorRect.bottom + menuContentHeightPx + 12 <= formWindow.innerHeight
        ? anchorRect.bottom + 4
        : Math.max(8, anchorRect.top - menuContentHeightPx - 4)) + "px";
  }
  function syncCustomSelect(selectEntry) {
    const { select: selectElement, button: selectButton, menu: selectMenu } = selectEntry;
    ((selectButton.textContent = selectElement.selectedOptions[0]?.textContent || "请选择"),
      (selectButton.disabled = selectElement.disabled),
      selectButton.setAttribute(
        "aria-label",
        selectElement.getAttribute("aria-label") || "打开选择菜单",
      ));
    const optionsSignature = JSON.stringify(
      [...selectElement.options].map((signatureOptionElement) => [
        signatureOptionElement.value,
        signatureOptionElement.textContent,
        signatureOptionElement.disabled,
        signatureOptionElement.hidden,
      ]),
    );
    optionsSignature !== selectEntry.signature &&
      ((selectEntry.signature = optionsSignature),
      selectMenu.replaceChildren(
        ...[...selectElement.options]
          .filter((visibleOptionElement) => !visibleOptionElement.hidden)
          .map((sourceOptionElement) => {
            const createdOptionButton = createStyledElement("button", "custom-select-option");
            return (
              (createdOptionButton.type = "button"),
              (createdOptionButton.dataset.value = sourceOptionElement.value),
              createdOptionButton.setAttribute("role", "option"),
              (createdOptionButton.textContent = sourceOptionElement.textContent),
              (createdOptionButton.disabled = sourceOptionElement.disabled),
              createdOptionButton
            );
          }),
      ));
    for (const existingOptionButton of selectMenu.children)
      (existingOptionButton.classList.toggle(
        "active",
        existingOptionButton.dataset.value === selectElement.value,
      ),
        existingOptionButton.setAttribute(
          "aria-selected",
          String(existingOptionButton.dataset.value === selectElement.value),
        ));
    selectElement.disabled && openSelect === selectEntry && closeSelectMenu();
  }
  function openSelectMenu(menuSelectEntry, shouldFocusActiveOption = false) {
    (closeSelectMenu(),
      syncCustomSelect(menuSelectEntry),
      !menuSelectEntry.select.disabled &&
        ((openSelect = menuSelectEntry),
        (menuSelectEntry.menu.hidden = false),
        menuSelectEntry.button.setAttribute("aria-expanded", "true"),
        positionSelectMenu(),
        shouldFocusActiveOption &&
          (
            menuSelectEntry.menu.querySelector(".active:not(:disabled)") ||
            menuSelectEntry.menu.querySelector("button:not(:disabled)")
          )?.focus({
            preventScroll: true,
          })));
  }
  function chooseSelectOption(targetSelectEntry, chosenOptionButton) {
    if (!chosenOptionButton || chosenOptionButton.disabled || targetSelectEntry.select.disabled)
      return;
    const previousSelectValue = targetSelectEntry.select.value;
    ((targetSelectEntry.select.value = chosenOptionButton.dataset.value),
      closeSelectMenu(true),
      previousSelectValue !== targetSelectEntry.select.value &&
        targetSelectEntry.select.dispatchEvent(
          new formWindow.Event("change", {
            bubbles: true,
          }),
        ),
      syncCustomSelect(targetSelectEntry));
  }
  for (const nativeSelect of editorRootElement.querySelectorAll("select")) {
    const selectWrapper = createStyledElement("span", "custom-select"),
      customSelectButton = createStyledElement("button", "custom-select-button"),
      customSelectMenu = createStyledElement("div", "custom-select-menu");
    (nativeSelect.before(selectWrapper),
      selectWrapper.append(nativeSelect, customSelectButton),
      editorRootElement.append(customSelectMenu),
      nativeSelect.classList.add("native-select-control"),
      (nativeSelect.tabIndex = -1),
      nativeSelect.setAttribute("aria-hidden", "true"),
      (customSelectButton.type = "button"),
      customSelectButton.setAttribute("aria-haspopup", "listbox"),
      customSelectButton.setAttribute("aria-expanded", "false"),
      (customSelectMenu.id = "range-select-" + nativeSelect.dataset.field + "-menu"),
      customSelectMenu.setAttribute("role", "listbox"),
      (customSelectMenu.hidden = true),
      customSelectButton.setAttribute("aria-controls", customSelectMenu.id),
      customSelectMenu.setAttribute(
        "aria-label",
        nativeSelect.getAttribute("aria-label") || "选项",
      ));
    const selectEntryModel = {
      select: nativeSelect,
      wrapper: selectWrapper,
      button: customSelectButton,
      menu: customSelectMenu,
    };
    (customSelects.push(selectEntryModel),
      syncCustomSelect(selectEntryModel),
      addTrackedListener(customSelectButton, "click", (buttonClickEvent) => {
        (buttonClickEvent.preventDefault(),
          openSelect === selectEntryModel ? closeSelectMenu() : openSelectMenu(selectEntryModel));
      }),
      addTrackedListener(customSelectMenu, "click", (menuClickEvent) => {
        (menuClickEvent.preventDefault(),
          chooseSelectOption(
            selectEntryModel,
            menuClickEvent.target.closest(".custom-select-option"),
          ));
      }),
      addTrackedListener(nativeSelect, "change", () => syncCustomSelect(selectEntryModel)));
  }
  function stepNumberInput(numberInputElement, stepDirection) {
    if (numberInputElement.disabled || numberInputElement.readOnly) return false;
    const valueBeforeStep = numberInputElement.value;
    try {
      stepDirection > 0 ? numberInputElement.stepUp() : numberInputElement.stepDown();
    } catch {
      return false;
    }
    return valueBeforeStep === numberInputElement.value
      ? false
      : (numberInputElement.dispatchEvent(
          new formWindow.Event("input", {
            bubbles: true,
          }),
        ),
        numberInputElement.dispatchEvent(
          new formWindow.Event("change", {
            bubbles: true,
          }),
        ),
        true);
  }
  for (const numberInput of editorRootElement.querySelectorAll("input[type=number]")) {
    const numberControlWrapper = createStyledElement("span", "inspector-number-control"),
      stepperContainer = createStyledElement("span", "inspector-number-steppers");
    (numberInput.before(numberControlWrapper),
      numberControlWrapper.append(numberInput, stepperContainer));
    const stepperButtons = [];
    for (const [stepperDirection, stepperLabel, stepperIconPath] of [
      [1, "增加数值", "M1 5 5 1l4 4"],
      [-1, "减少数值", "M1 1 5 5l4-4"],
    ]) {
      const stepperButton = createStyledElement("button", "inspector-number-stepper");
      ((stepperButton.type = "button"),
        (stepperButton.tabIndex = -1),
        stepperButton.setAttribute("aria-label", stepperLabel),
        (stepperButton.title = stepperLabel),
        (stepperButton.innerHTML =
          '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="' +
          stepperIconPath +
          '"></path></svg>'),
        stepperContainer.append(stepperButton),
        stepperButtons.push(stepperButton),
        addTrackedListener(stepperButton, "click", (stepperClickEvent) => {
          (stepperClickEvent.preventDefault(),
            stepperClickEvent.detail === 0 && stepNumberInput(numberInput, stepperDirection));
        }),
        addTrackedListener(stepperButton, "pointerdown", (stepperPointerDownEvent) => {
          if (stepperPointerDownEvent.button !== 0 || numberInput.disabled || numberInput.readOnly)
            return;
          (stepperPointerDownEvent.preventDefault(),
            stopStepperRepeat?.(),
            numberInput.focus({
              preventScroll: true,
            }),
            stepNumberInput(numberInput, stepperDirection));
          let holdDelayTimerId, holdIntervalId;
          ((stopStepperRepeat = () => {
            (formWindow.clearTimeout(holdDelayTimerId),
              formWindow.clearInterval(holdIntervalId),
              (stopStepperRepeat = null));
          }),
            (holdDelayTimerId = formWindow.setTimeout(() => {
              holdIntervalId = formWindow.setInterval(
                () => stepNumberInput(numberInput, stepperDirection),
                55,
              );
            }, 320)));
          try {
            stepperButton.setPointerCapture(stepperPointerDownEvent.pointerId);
          } catch {}
        }));
      for (const pointerEndEventName of ["pointerup", "pointercancel", "lostpointercapture"])
        addTrackedListener(stepperButton, pointerEndEventName, () => stopStepperRepeat?.());
    }
    (addTrackedListener(numberInput, "keydown", (numberKeyEvent) => {
      ["ArrowUp", "ArrowDown"].includes(numberKeyEvent.key) &&
        (numberKeyEvent.preventDefault(),
        stepNumberInput(numberInput, numberKeyEvent.key === "ArrowUp" ? 1 : -1));
    }),
      numberFieldEntries.push({
        field: numberInput,
        peers: stepperButtons,
      }));
  }
  function handleMenuKeyDown(menuKeyEvent) {
    const activeSelectEntry = customSelects.find(
      (selectEntryRecord) =>
        selectEntryRecord.button === menuKeyEvent.target ||
        selectEntryRecord.menu.contains(menuKeyEvent.target),
    );
    if (!activeSelectEntry) return;
    if (menuKeyEvent.key === "Escape" && openSelect) {
      (menuKeyEvent.preventDefault(),
        menuKeyEvent.stopImmediatePropagation(),
        closeSelectMenu(true));
      return;
    }
    if (menuKeyEvent.key === "Tab") {
      closeSelectMenu();
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(menuKeyEvent.key)) return;
    if (
      (menuKeyEvent.preventDefault(),
      menuKeyEvent.stopImmediatePropagation(),
      openSelect !== activeSelectEntry)
    ) {
      openSelectMenu(activeSelectEntry, true);
      return;
    }
    if (["Enter", " "].includes(menuKeyEvent.key)) {
      chooseSelectOption(
        activeSelectEntry,
        menuKeyEvent.target.closest(".custom-select-option") ||
          activeSelectEntry.menu.querySelector(".active"),
      );
      return;
    }
    const enabledOptions = [...activeSelectEntry.menu.children].filter(
        (enabledOptionButton) => !enabledOptionButton.disabled,
      ),
      focusedOptionIndex = enabledOptions.indexOf(formDocumentNode.activeElement),
      nextOptionIndex =
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
  return (
    addTrackedListener(formDocumentNode, "keydown", handleMenuKeyDown, true),
    addTrackedListener(
      formDocumentNode,
      "pointerdown",
      (documentPointerDownEvent) => {
        openSelect &&
          !openSelect.wrapper.contains(documentPointerDownEvent.target) &&
          !openSelect.menu.contains(documentPointerDownEvent.target) &&
          closeSelectMenu();
      },
      true,
    ),
    addTrackedListener(formWindow, "resize", () => closeSelectMenu()),
    addTrackedListener(formWindow, "blur", () => {
      (stopStepperRepeat?.(), closeSelectMenu());
    }),
    addTrackedListener(formDocumentNode, "visibilitychange", () => {
      formDocumentNode.hidden && (stopStepperRepeat?.(), closeSelectMenu());
    }),
    addTrackedListener(
      editorRootElement.querySelector(".p2r-panel"),
      "scroll",
      () => closeSelectMenu(),
      {
        passive: true,
      },
    ),
    {
      sync() {
        customSelects.forEach(syncCustomSelect);
        for (const { field: syncedNumberInput, peers: peerButtons } of numberFieldEntries)
          for (const peerButton of peerButtons)
            peerButton.disabled = syncedNumberInput.disabled || syncedNumberInput.readOnly;
      },
      close() {
        (closeSelectMenu(), stopStepperRepeat?.());
      },
      dispose() {
        (closeSelectMenu(),
          stopStepperRepeat?.(),
          eventCleanupCallbacks.forEach((cleanupCallback) => cleanupCallback()),
          customSelects.forEach((disposalSelectEntry) => disposalSelectEntry.menu.remove()));
      },
    }
  );
}
