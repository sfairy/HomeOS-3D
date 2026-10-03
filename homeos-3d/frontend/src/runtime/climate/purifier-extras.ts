import { deviceStatusChoices } from "../device/device-status";
import { domElement } from "@app/utils/dom-factory";
function extraStateLabel(entityId, state) {
  const liveState = state?.newState || state;
  return !liveState ||
    liveState.available === false ||
    ["", "unknown", "unavailable"].includes(liveState.state)
    ? "不可用"
    : String(entityId).startsWith("binary_sensor.")
      ? liveState.attributes?.device_class === "running" && ["on", "off"].includes(liveState.state)
        ? liveState.state === "on"
          ? "正在运行"
          : "未在运行"
        : deviceStatusChoices(
            {
              entityId: entityId,
            },
            liveState,
          )?.options.find((choice) => choice.value === liveState.state)?.label || liveState.state
      : {
          on: "已开启",
          off: "已关闭",
        }[liveState.state] || liveState.state;
}
export function extraTypes(rawEntityId) {
  const domain = String(rawEntityId).split(".")[0],
    mapped = {
      switch: "switch",
      input_boolean: "switch",
      light: "switch",
      fan: "switch",
      select: "select",
      input_select: "select",
      number: "number",
      input_number: "number",
      button: "button",
      input_button: "button",
    }[domain];
  return mapped ? [mapped, "state"] : ["state"];
}
export const extraLabels = {
  switch: "开关",
  select: "选项",
  number: "数值",
  button: "按钮",
  state: "状态显示",
};
export function purifierRelatedEntities(entities, targetEntityId) {
  const target = entities.find((entity) => entity.entityId === targetEntityId),
    deviceId = target?.deviceId || target?.device_id;
  return deviceId
    ? entities.filter(
        (relatedEntity) =>
          relatedEntity.entityId !== targetEntityId &&
          (relatedEntity.deviceId || relatedEntity.device_id) === deviceId,
      )
    : [];
}
export function purifierDeviceChanged(deviceEntities, previousEntityId, nextEntityId) {
  if (previousEntityId === nextEntityId) return false;
  const deviceIdOf = (lookupEntityId) => {
    const found = deviceEntities.find(
      (candidateEntity) => candidateEntity.entityId === lookupEntityId,
    );
    return found?.deviceId || found?.device_id;
  };
  return !deviceIdOf(previousEntityId) || deviceIdOf(previousEntityId) !== deviceIdOf(nextEntityId);
}
function extraRanges(rangeEntityId, rangeState) {
  const attributes = (rangeState?.newState || rangeState)?.attributes || {};
  if (rangeEntityId.startsWith("fan.") && Number(attributes.supported_features) & 1)
    return [
      {
        key: "percentage",
        label: "风速",
        min: 0,
        max: 100,
        step: 1,
        value: attributes.percentage ?? 0,
      },
    ];
  if (!rangeEntityId.startsWith("light.")) return [];
  const colorModes = attributes.supported_color_modes || [],
    ranges = [];
  return (
    colorModes.some((mode) => !["onoff", "unknown"].includes(mode)) &&
      ranges.push({
        key: "brightness",
        label: "亮度",
        min: 1,
        max: 255,
        step: 1,
        value: attributes.brightness ?? 255,
      }),
    colorModes.includes("color_temp") &&
      Number.isFinite(attributes.min_color_temp_kelvin) &&
      Number.isFinite(attributes.max_color_temp_kelvin) &&
      ranges.push({
        key: "color_temp_kelvin",
        label: "色温 K",
        min: attributes.min_color_temp_kelvin,
        max: attributes.max_color_temp_kelvin,
        step: 1,
        value: attributes.color_temp_kelvin ?? attributes.min_color_temp_kelvin,
      }),
    ranges
  );
}
function extraRangeCommand(item, commandState, key, rawValue) {
  const commandLiveState = commandState?.newState || commandState,
    range = extraRanges(item.entityId, commandLiveState).find((candidate) => candidate.key === key),
    numericValue = Number(rawValue);
  if (
    !commandLiveState ||
    commandLiveState.available === false ||
    ["unknown", "unavailable"].includes(commandLiveState.state) ||
    item.type !== "switch" ||
    !range ||
    rawValue === "" ||
    !Number.isFinite(numericValue) ||
    numericValue < range.min ||
    numericValue > range.max
  )
    throw new Error("设备不支持此调节或数值超出范围");
  const entityDomain = item.entityId.split(".")[0];
  return {
    entityId: item.entityId,
    domain: entityDomain,
    service: entityDomain === "fan" ? "set_percentage" : "turn_on",
    data: {
      [key]: numericValue,
    },
    deviceKind: "purifier-extra",
  };
}
/** 命令 data 按控件类型择一携带 option/value，运行时动态挂载，故字段全部可选。 */
type PurifierCommandData = { option?: any; value?: any };
/** 面板视图模型由调用方 update() 注入：字段是运行时状态袋，按实际访问到的键显式列出并全部可选。 */
type PurifierExtrasViewModel = { item?: any; editing?: any; states?: any };
/**
 * 卡片运行时状态袋：除建卡时的固定字段外，卡片在渲染/交互过程中还会挂上
 * description/submit/menu/choices/confirm/ranges 等成员，故按实际访问到的键显式列出并全部可选。
 */
type PurifierCard = {
  item?: any;
  section?: any;
  title?: any;
  status?: any;
  error?: any;
  control?: any;
  pending?: boolean;
  description?: any;
  submit?: any;
  expected?: any;
  timer?: any;
  menu?: any;
  choices?: any;
  confirm?: any;
  ranges?: any[];
  rangePending?: boolean;
  rangeExpected?: any;
  rangeTimer?: any;
};
function extraCommand(controlItem, controlState, controlValue) {
  const controlLiveState = controlState?.newState || controlState;
  if (
    !controlLiveState ||
    controlLiveState.available === false ||
    ["", "unknown", "unavailable"].includes(controlLiveState.state)
  )
    throw new Error("该实体当前不可用");
  if (!extraTypes(controlItem.entityId).includes(controlItem.type) || controlItem.type === "state")
    throw new Error("不支持此操作");
  const controlDomain = controlItem.entityId.split(".")[0],
    data: PurifierCommandData = {};
  let service;
  if (
    (controlItem.type === "switch" &&
      (service = controlLiveState.state === "on" ? "turn_off" : "turn_on"),
    controlItem.type === "button" && (service = "press"),
    controlItem.type === "select")
  ) {
    if (!controlLiveState.attributes?.options?.includes(controlValue))
      throw new Error("选项已失效");
    ((service = "select_option"), (data.option = controlValue));
  }
  if (controlItem.type === "number") {
    const { min: min, max: max, step = 1 } = controlLiveState.attributes || {},
      numeric = Number(controlValue);
    if (
      controlValue === "" ||
      !Number.isFinite(numeric) ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      !Number.isFinite(step) ||
      step <= 0 ||
      numeric < min ||
      numeric > max
    )
      throw new Error("数值超出设备范围");
    if (Math.abs((numeric - min) / step - Math.round((numeric - min) / step)) > 0.00001)
      throw new Error("数值不符合设备步长");
    ((service = "set_value"), (data.value = numeric));
  }
  return {
    entityId: controlItem.entityId,
    domain: controlDomain,
    service: service,
    data: data,
    deviceKind: "purifier-extra",
  };
}
function extraLayout(controls) {
  return controls.map(({ label: label, ...rest }) => ({
    ...rest,
    type: extraTypes(rest.entityId)[0],
    columns: [1, 2, 3, 4].includes(rest.columns)
      ? rest.columns
      : ["select", "number"].includes(extraTypes(rest.entityId)[0])
        ? 1
        : 3,
    rows: rest.rows === 2 ? 2 : 1,
  }));
}
function moveExtra(controlList, movedEntityId, targetPositionEntityId) {
  const currentLayout = extraLayout(controlList),
    fromIndex = currentLayout.findIndex((layoutItem) => layoutItem.entityId === movedEntityId),
    toIndex = currentLayout.findIndex(
      (candidateItem) => candidateItem.entityId === targetPositionEntityId,
    );
  if (fromIndex < 0 || toIndex < 0) return currentLayout;
  const [moved] = currentLayout.splice(fromIndex, 1);
  return (currentLayout.splice(toIndex, 0, moved), currentLayout);
}
export function createPurifierExtras({
  element: hostElement,
  onControl: onControl,
  onLayout = (..._args) => {},
}) {
  const doc = hostElement.ownerDocument || globalThis.document;
  let viewModel: PurifierExtrasViewModel = {},
    layoutSignature = "",
    cards = [],
    generation = 0,
    dragState = null,
    selectedEntityId = null;
  const createEl = (tag, text = "") => domElement(doc, tag, "", text);
  let openSelect = null,
    rafId = null;
  function closeSelect(restoreFocus = false) {
    if (!openSelect) return;
    const current = openSelect;
    ((openSelect = null),
      rafId != null && doc.defaultView?.cancelAnimationFrame?.(rafId),
      (rafId = null),
      current.menu.hidePopover?.(),
      (current.menu.hidden = true),
      current.portal && (current.section.append(current.menu), (current.portal = false)),
      current.control.setAttribute("aria-expanded", "false"),
      restoreFocus &&
        current.control.focus?.({
          preventScroll: true,
        }));
  }
  const onDocumentPointerDown = (event) => {
      openSelect &&
        !openSelect.section.contains?.(event.target) &&
        !openSelect.menu.contains?.(event.target) &&
        closeSelect();
    },
    onDocumentScroll = (scrollEvent) => {
      openSelect && !openSelect.menu.contains?.(scrollEvent.target) && closeSelect();
    };
  (doc.addEventListener?.("pointerdown", onDocumentPointerDown),
    doc.addEventListener?.("scroll", onDocumentScroll, true));
  function measureElement(element) {
    const nodeRect = element.getBoundingClientRect(),
      nodeStyle = doc.defaultView?.getComputedStyle?.(element),
      resolveBoxSize = (prop, fallback) => {
        let size = parseFloat(nodeStyle?.[prop]);
        if (size > 0 && nodeStyle.boxSizing === "content-box") {
          const sides = prop === "width" ? ["Left", "Right"] : ["Top", "Bottom"];
          for (const side of sides)
            size +=
              (parseFloat(nodeStyle["padding" + side]) || 0) +
              (parseFloat(nodeStyle["border" + side + "Width"]) || 0);
        }
        return size > 0 ? size : fallback;
      },
      measuredWidth = resolveBoxSize("width", element.offsetWidth || nodeRect.width || 1),
      measuredHeight = resolveBoxSize("height", element.offsetHeight || nodeRect.height || 1);
    return {
      rect: nodeRect,
      width: measuredWidth,
      height: measuredHeight,
      sx: nodeRect.width / measuredWidth || 1,
      sy: nodeRect.height / measuredHeight || 1,
    };
  }
  function positionSelectMenu() {
    if (!openSelect) return;
    const {
        rect: controlRect,
        width: controlWidth,
        sx: scaleX,
        sy: scaleY,
      } = measureElement(openSelect.control),
      menu = openSelect.menu,
      win = doc.defaultView,
      stageRect = hostElement.closest?.(".interaction3d-stage")?.getBoundingClientRect(),
      viewportLeft = Math.max(0, stageRect?.left || 0) + 8,
      viewportTop = Math.max(0, stageRect?.top || 0) + 8,
      viewportRight = Math.min(win?.innerWidth || 1024, stageRect?.right ?? Infinity) - 8,
      viewportBottom = Math.min(win?.innerHeight || 768, stageRect?.bottom ?? Infinity) - 8,
      menuWidth = Math.min(controlWidth, Math.max(0, viewportRight - viewportLeft) / scaleX);
    Object.assign(menu.style, {
      width: menuWidth + "px",
      bottom: "auto",
      transformOrigin: "0 0",
      transform: "scale(" + scaleX + "," + scaleY + ")",
    });
    const menuStyle = win?.getComputedStyle?.(menu),
      borderHeight =
        (parseFloat(menuStyle?.borderTopWidth) || 0) +
        (parseFloat(menuStyle?.borderBottomWidth) || 0),
      menuHeight =
        Math.min(260, (menu.scrollHeight || openSelect.choices.length * 42 + 12) + borderHeight) *
        scaleY,
      spaceBelow = Math.max(0, viewportBottom - controlRect.bottom - 4 * scaleY),
      spaceAbove = Math.max(0, controlRect.top - viewportTop - 4 * scaleY),
      preferAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow,
      availableHeight = Math.min(
        Math.max(0, viewportBottom - viewportTop),
        preferAbove ? spaceAbove : spaceBelow,
      ),
      maxHeight = Math.min(menuHeight, availableHeight);
    ((menu.style.maxHeight = Math.min(260, availableHeight / scaleY) + "px"),
      (menu.style.left =
        Math.max(viewportLeft, Math.min(controlRect.left, viewportRight - menuWidth * scaleX)) +
        "px"),
      (menu.style.top =
        Math.max(
          viewportTop,
          Math.min(
            preferAbove
              ? controlRect.top - 4 * scaleY - maxHeight
              : controlRect.bottom + 4 * scaleY,
            viewportBottom - maxHeight,
          ),
        ) + "px"));
  }
  function tickPosition() {
    if (((rafId = null), !!openSelect)) {
      if (doc.hidden) {
        closeSelect();
        return;
      }
      (positionSelectMenu(),
        (rafId = doc.defaultView?.requestAnimationFrame?.(tickPosition) ?? null));
    }
  }
  const defaultView = doc.defaultView;
  defaultView?.addEventListener?.("resize", positionSelectMenu);
  function openSelectMenu(record) {
    if (record.control.disabled) return;
    if (openSelect === record) {
      closeSelect(true);
      return;
    }
    (closeSelect(),
      (openSelect = record),
      !record.menu.showPopover &&
        doc.body &&
        ((record.menu.dataset.theme =
          hostElement.closest?.("[data-scene-style]")?.dataset.sceneStyle || ""),
        doc.body.append(record.menu),
        (record.portal = true)),
      (record.menu.hidden = false),
      record.control.setAttribute("aria-expanded", "true"),
      positionSelectMenu(),
      record.menu.showPopover?.(),
      tickPosition(),
      (
        record.choices.find((choiceOption) => choiceOption.value === record.control.value) ||
        record.choices[0]
      )?.focus?.({
        preventScroll: true,
      }));
  }
  const COLUMN_SPAN = {
      3: 2,
      4: 4,
      1: 3,
      2: 6,
    },
    COLUMN_ORDER = [3, 1, 4, 2];
  function fitLayout(cardParams, entry = cardParams.item) {
    const gridWidth = hostElement.clientWidth,
      minRows = cardParams.ranges?.length
        ? 1 + cardParams.ranges.length
        : ["select", "number"].includes(entry.type)
          ? 2
          : 1;
    if (!gridWidth)
      return {
        ...entry,
        rows: Math.max(entry.rows, minRows),
      };
    const cardMinWidth = 64,
      neededSpan = COLUMN_SPAN[entry.columns],
      rangeMinSpan = cardParams.ranges?.length ? 3 : 2,
      span =
        [2, 3, 4, 6].find(
          (spanCandidate) =>
            spanCandidate >= neededSpan &&
            spanCandidate >= rangeMinSpan &&
            ((gridWidth + 8) * spanCandidate) / 6 - 8 >= cardMinWidth,
        ) || 6;
    return {
      ...entry,
      columns: COLUMN_ORDER.find((columnCandidate) => COLUMN_SPAN[columnCandidate] === span),
      rows: Math.max(entry.rows, minRows, cardMinWidth > gridWidth ? 2 : 1),
    };
  }
  function measureRows(measureRecord, rowCount) {
    const rowStyle = doc.defaultView?.getComputedStyle?.(measureRecord.section);
    if (!rowStyle) return rowCount;
    const toPx = (cssValue) => Number.parseFloat(cssValue) || 0,
      measured = (fieldNode) => (fieldNode && !fieldNode.hidden && fieldNode.offsetHeight) || 0,
      gap = toPx(rowStyle.rowGap),
      descriptionHeight = measured(measureRecord.description),
      controlHeight = measured(measureRecord.control);
    let content = ["select", "number"].includes(measureRecord.item.type)
      ? descriptionHeight + controlHeight + (descriptionHeight && controlHeight ? gap : 0)
      : Math.max(descriptionHeight, controlHeight);
    for (const extraRange of measureRecord.ranges || [])
      content += measured(extraRange.label) + gap;
    for (const field of [measureRecord.confirm, measureRecord.error]) {
      const fieldHeight = measured(field);
      fieldHeight && (content += gap + fieldHeight);
    }
    return (
      (content +=
        toPx(rowStyle.paddingTop) +
        toPx(rowStyle.paddingBottom) +
        toPx(rowStyle.borderTopWidth) +
        toPx(rowStyle.borderBottomWidth)),
      Math.max(rowCount, Math.ceil((content + 8) / 44))
    );
  }
  function syncCardMetrics(metricsRecord) {
    if (dragState) return;
    const fitted = fitLayout(metricsRecord);
    (metricsRecord.section.style.setProperty("--extra-columns", COLUMN_SPAN[fitted.columns]),
      metricsRecord.section.style.setProperty(
        "--extra-rows",
        measureRows(metricsRecord, fitted.rows),
      ));
  }
  const resizeObserver =
    typeof ResizeObserver == "function"
      ? new ResizeObserver(() => {
          (cards.forEach(syncCardMetrics), positionSelectMenu());
        })
      : null;
  resizeObserver?.observe(hostElement);
  function applyLayout(layoutItems) {
    layoutItems.forEach((itemEntry, index) => {
      const matchingRecord = cards.find(
        (matchingCard) => matchingCard.item.entityId === itemEntry.entityId,
      );
      if (!matchingRecord) return;
      const itemFitted = fitLayout(matchingRecord, itemEntry);
      ((matchingRecord.section.style.order = index),
        matchingRecord.section.style.setProperty(
          "--extra-columns",
          COLUMN_SPAN[itemFitted.columns],
        ),
        matchingRecord.section.style.setProperty(
          "--extra-rows",
          measureRows(matchingRecord, itemFitted.rows),
        ));
    });
  }
  function finishDrag(cancelled = false) {
    if (!dragState) return;
    const drag = dragState;
    ((dragState = null),
      clearTimeout(drag.timer),
      drag.ghost?.remove?.(),
      drag.section.classList.toggle("is-dragging", false),
      cards.forEach((otherCard) => otherCard.section.classList.toggle("is-drop-target", false)));
    const freshLayout = extraLayout(viewModel.item.extraControls),
      appliedLayout =
        !cancelled && drag.active && !drag.resize && drag.lastTarget
          ? moveExtra(drag.layout, drag.item.entityId, drag.lastTarget)
          : drag.layout;
    (applyLayout(cancelled ? freshLayout : appliedLayout),
      (cancelled || !drag.active) && cards.forEach(syncCardMetrics),
      drag.handle.hasPointerCapture?.(drag.pointerId) &&
        drag.handle.releasePointerCapture(drag.pointerId),
      !cancelled &&
        drag.active &&
        viewModel.editing &&
        JSON.stringify(appliedLayout) !== JSON.stringify(freshLayout) &&
        onLayout(appliedLayout));
  }
  const onEscapeKeydown = (escapeEvent) => {
    escapeEvent.key === "Escape" &&
      dragState &&
      (escapeEvent.preventDefault(), escapeEvent.stopPropagation(), finishDrag(true));
  };
  doc.addEventListener?.("keydown", onEscapeKeydown, true);
  function bindDrag(handle, section, dragItem, resize) {
    (handle.addEventListener("pointerdown", (pointerEvent) => {
      if (!viewModel.editing || (pointerEvent.button != null && pointerEvent.button !== 0)) return;
      ((pointerEvent.pointerType !== "touch" || resize) && pointerEvent.preventDefault(),
        pointerEvent.stopPropagation(),
        finishDrag(true),
        (selectedEntityId = dragItem.entityId),
        cards.forEach((selectionCard) =>
          selectionCard.section.classList.toggle(
            "is-selected",
            selectionCard.item.entityId === dragItem.entityId,
          ),
        ),
        handle.focus?.({
          preventScroll: true,
        }),
        (pointerEvent.pointerType !== "touch" || resize) &&
          handle.setPointerCapture(pointerEvent.pointerId));
      const metrics = measureElement(section),
        sectionRect = metrics.rect,
        gridRect = measureElement(hostElement),
        scroller = hostElement.closest?.(".i3d-light-panel");
      ((dragState = {
        handle: handle,
        section: section,
        item: dragItem,
        resize: resize,
        pointerId: pointerEvent.pointerId,
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
        rect: sectionRect,
        grid: gridRect,
        metrics: metrics,
        scroller: scroller,
        scrollTop: scroller?.scrollTop || 0,
        active: false,
        layout: extraLayout(viewModel.item.extraControls),
        touchReady: resize || pointerEvent.pointerType !== "touch",
        targets: cards.map((targetCard) => ({
          row: targetCard,
          rect: targetCard.section.getBoundingClientRect(),
        })),
      }),
        dragState.touchReady ||
          (dragState.timer = setTimeout(() => {
            dragState?.handle === handle &&
              ((dragState.touchReady = true), section.classList.add("is-dragging"));
          }, 300)));
    }),
      handle.addEventListener(
        "touchmove",
        (touchEvent) => {
          dragState?.handle === handle && dragState.touchReady && touchEvent.preventDefault();
        },
        {
          passive: false,
        },
      ),
      handle.addEventListener("pointermove", (moveEvent) => {
        const gesture = dragState;
        if (!gesture || gesture.handle !== handle || moveEvent.pointerId !== gesture.pointerId)
          return;
        const deltaX = moveEvent.clientX - gesture.x,
          deltaY = moveEvent.clientY - gesture.y;
        if (!gesture.touchReady) {
          Math.hypot(deltaX, deltaY) > 6 && finishDrag(true);
          return;
        }
        if (
          (gesture.handle.hasPointerCapture?.(moveEvent.pointerId) ||
            gesture.handle.setPointerCapture?.(moveEvent.pointerId),
          !gesture.active && Math.hypot(deltaX, deltaY) < 6)
        )
          return;
        (moveEvent.preventDefault(),
          (gesture.active = true),
          section.classList.toggle("is-dragging", true));
        const scrollContainer = hostElement.closest?.(".i3d-light-panel");
        if (scrollContainer) {
          const scrollBounds = scrollContainer.getBoundingClientRect();
          moveEvent.clientY > scrollBounds.bottom - 32
            ? (scrollContainer.scrollTop += 12)
            : moveEvent.clientY < scrollBounds.top + 32 && (scrollContainer.scrollTop -= 12);
        }
        gesture.ghost ||
          ((gesture.ghost = createEl("div")),
          (gesture.ghost.className = "i3d-extra-gesture-hint"),
          (doc.body || hostElement).append(gesture.ghost));
        const { sx: dragScaleX, sy: dragScaleY } = gesture.metrics;
        if (
          (Object.assign(gesture.ghost.style, {
            left: moveEvent.clientX + 12 * dragScaleX + "px",
            top: moveEvent.clientY + 12 * dragScaleY + "px",
            transformOrigin: "0 0",
            transform: "scale(" + dragScaleX + "," + dragScaleY + ")",
          }),
          resize)
        ) {
          const targetWidth = gesture.metrics.width + deltaX / dragScaleX,
            snappedColumns = COLUMN_ORDER.reduce(
              (best, orderCandidate) =>
                Math.abs(
                  ((gesture.grid.width + 8) * COLUMN_SPAN[orderCandidate]) / 6 - 8 - targetWidth,
                ) < Math.abs(((gesture.grid.width + 8) * COLUMN_SPAN[best]) / 6 - 8 - targetWidth)
                  ? orderCandidate
                  : best,
              gesture.item.columns,
            ),
            snappedRows = ["select", "number"].includes(dragItem.type)
              ? 2
              : Math.abs(deltaY / dragScaleY) < 12
                ? gesture.item.rows
                : gesture.metrics.height + deltaY / dragScaleY >= 58
                  ? 2
                  : 1,
            dragRecord = cards.find((draggedCard) => draggedCard.section === section),
            snappedItem = fitLayout(dragRecord, {
              ...dragItem,
              columns: snappedColumns,
              rows: snappedRows,
            });
          ((gesture.layout = extraLayout(viewModel.item.extraControls).map((layoutCandidate) =>
            layoutCandidate.entityId === dragItem.entityId ? snappedItem : layoutCandidate,
          )),
            (gesture.ghost.textContent =
              {
                3: "1/3 行",
                4: "2/3 行",
                1: "半行",
                2: "整行",
              }[snappedItem.columns] +
              " · " +
              (snappedItem.rows === 1 ? "36" : "80") +
              "px" +
              (snappedItem.columns !== snappedColumns ? "（内容最小宽度）" : "")),
            gesture.ghost.classList.add("is-size-outline"),
            (gesture.ghost.style.left = gesture.rect.left + "px"),
            (gesture.ghost.style.top = gesture.rect.top + "px"),
            (gesture.ghost.style.width =
              ((gesture.grid.width + 8) * COLUMN_SPAN[snappedItem.columns]) / 6 - 8 + "px"),
            (gesture.ghost.style.height = 44 * snappedItem.rows - 8 + "px"));
        } else {
          const scrollDeltaY =
              ((gesture.scroller?.scrollTop || 0) - gesture.scrollTop) * dragScaleY,
            nearestTarget = gesture.targets.reduce((closestTarget, candidateTarget) => {
              const targetRect = candidateTarget.rect,
                distance = Math.hypot(
                  targetRect.left + targetRect.width / 2 - moveEvent.clientX,
                  targetRect.top - scrollDeltaY + targetRect.height / 2 - moveEvent.clientY,
                );
              return !closestTarget || distance < closestTarget.distance
                ? {
                    ...candidateTarget,
                    distance: distance,
                  }
                : closestTarget;
            }, null);
          ((gesture.lastTarget = nearestTarget?.row.item.entityId),
            cards.forEach((dropCard) =>
              dropCard.section.classList.toggle(
                "is-drop-target",
                dropCard === nearestTarget?.row && dropCard.section !== section,
              ),
            ));
          const sourceRecord = cards.find((sourceCard) => sourceCard.section === section);
          gesture.ghost.textContent =
            (sourceRecord?.title.textContent || "附加功能") +
            " → " +
            (nearestTarget?.row.title.textContent || "原位置");
        }
      }),
      handle.addEventListener("pointerup", () => finishDrag(false)),
      handle.addEventListener("pointercancel", () => finishDrag(true)),
      handle.addEventListener("lostpointercapture", () => finishDrag(true)));
  }
  function readState(trackedEntityId) {
    const stateEntry = viewModel.states?.[trackedEntityId];
    return stateEntry?.newState || stateEntry;
  }
  function refreshRows() {
    for (const row of cards) {
      const entityState = readState(row.item.entityId),
        stateAttributes = entityState?.attributes || {},
        available =
          entityState &&
          entityState.available !== false &&
          !["", "unknown", "unavailable"].includes(entityState.state);
      if (
        (row.pending &&
          row.expected != null &&
          String(entityState?.state) === String(row.expected) &&
          (clearTimeout(row.timer),
          (row.pending = false),
          (row.expected = null),
          (row.error.textContent = "")),
        row.pending &&
          !available &&
          (clearTimeout(row.timer),
          (row.pending = false),
          (row.expected = null),
          (row.error.textContent = "实体已离线，操作结果未确认")),
        (row.title.textContent =
          row.item.label || stateAttributes.friendly_name || row.item.entityId),
        (row.title.title = row.title.textContent),
        (row.status.textContent = available
          ? "" +
            extraStateLabel(row.item.entityId, entityState) +
            (stateAttributes.unit_of_measurement ? " " + stateAttributes.unit_of_measurement : "")
          : "不可用"),
        (row.status.hidden =
          !!available &&
          (row.item.type === "select" ||
            (row.item.type === "number" && !stateAttributes.unit_of_measurement))),
        !row.control)
      ) {
        syncCardMetrics(row);
        continue;
      }
      if (
        ((row.control.disabled = !!(viewModel.editing || row.pending || !available)),
        row.item.type === "switch" &&
          ((row.control.textContent = entityState?.state === "on" ? "已开启" : "已关闭"),
          row.control.setAttribute("role", "switch"),
          row.control.setAttribute("aria-checked", String(entityState?.state === "on")),
          row.control.setAttribute("aria-pressed", String(entityState?.state === "on"))),
        row.item.type === "select")
      ) {
        const options = Array.isArray(stateAttributes.options)
          ? stateAttributes.options.filter((option) => typeof option == "string")
          : [];
        (row.options !== JSON.stringify(options) &&
          (openSelect === row && closeSelect(),
          (row.options = JSON.stringify(options)),
          (row.choices = options.map((optionText) => {
            const button = createEl("button", optionText);
            return (
              (button.type = "button"),
              (button.value = optionText),
              button.setAttribute("role", "option"),
              button.addEventListener("click", () => {
                row.control.disabled ||
                  (closeSelect(true), (row.control.value = optionText), row.submit());
              }),
              button
            );
          })),
          row.menu.replaceChildren(...row.choices)),
          (row.control.value =
            row.pending && row.expected != null
              ? row.expected
              : available
                ? entityState.state
                : ""),
          (row.control.disabled ||= !options.length),
          (row.control.textContent =
            row.pending && row.expected != null
              ? String(row.expected)
              : available
                ? entityState.state
                : "不可用"));
        for (const choiceButton of row.choices)
          choiceButton.setAttribute(
            "aria-selected",
            String(choiceButton.value === row.control.value),
          );
        row.control.disabled && openSelect === row && closeSelect();
      }
      row.item.type === "number" &&
        ((row.control.min = stateAttributes.min),
        (row.control.max = stateAttributes.max),
        (row.control.step = stateAttributes.step || 1),
        doc.activeElement !== row.control &&
          (row.control.value =
            row.pending && row.expected != null
              ? row.expected
              : available
                ? entityState.state
                : ""),
        (row.control.disabled ||=
          !Number.isFinite(stateAttributes.min) || !Number.isFinite(stateAttributes.max)));
      for (const rangeEntry of row.ranges || []) {
        const rangeInfo = extraRanges(row.item.entityId, entityState).find(
          (rangeCandidate) => rangeCandidate.key === rangeEntry.key,
        );
        (row.rangeExpected?.key === rangeEntry.key &&
          (Math.abs((rangeInfo?.value ?? Infinity) - row.rangeExpected.value) < 1 || !available) &&
          (clearTimeout(row.rangeTimer),
          (row.rangePending = false),
          (row.rangeExpected = null),
          (row.error.textContent = available ? "" : "实体已离线，调节结果未确认")),
          (rangeEntry.input.disabled = !!(
            viewModel.editing ||
            row.rangePending ||
            !available ||
            !rangeInfo
          )),
          rangeInfo &&
            doc.activeElement !== rangeEntry.input &&
            (rangeEntry.input.value = String(
              row.rangeExpected?.key === rangeEntry.key ? row.rangeExpected.value : rangeInfo.value,
            )),
          (rangeEntry.output.textContent = rangeInfo
            ? rangeInfo.label + " " + rangeInfo.value
            : ""));
      }
      syncCardMetrics(row);
    }
  }
  function update(nextViewModel) {
    viewModel = nextViewModel;
    const layout = extraLayout(nextViewModel.item?.extraControls || []),
      signature = JSON.stringify([
        nextViewModel.item?.id,
        layout,
        layout.map((layoutEntry) =>
          extraRanges(layoutEntry.entityId, readState(layoutEntry.entityId)).map(
            ({ value: optionValue, ...restEntry }) => restEntry,
          ),
        ),
        !!nextViewModel.editing,
      ]);
    if (((hostElement.hidden = !layout.length), signature !== layoutSignature)) {
      (closeSelect(),
        finishDrag(true),
        resizeObserver?.disconnect(),
        resizeObserver?.observe(hostElement),
        cards.forEach((staleCard) => {
          (clearTimeout(staleCard.timer), clearTimeout(staleCard.rangeTimer));
        }),
        (layoutSignature = signature),
        generation++,
        hostElement.replaceChildren(),
        (cards = []));
      for (const control of layout) {
        const cardSection = createEl("section");
        if (
          ((cardSection.className =
            "i3d-climate-option-group i3d-extra-card i3d-extra-" + control.type),
          cardSection.style.setProperty("--extra-columns", COLUMN_SPAN[control.columns]),
          cardSection.style.setProperty("--extra-rows", control.rows),
          nextViewModel.editing)
        ) {
          const dragHandle = createEl("button", "⠿");
          ((dragHandle.type = "button"),
            (dragHandle.className = "i3d-extra-drag"),
            dragHandle.setAttribute("aria-label", "调整顺序 " + control.entityId),
            (dragHandle.title = "拖动排序，方向键移动，Esc取消"),
            cardSection.classList.toggle("is-selected", selectedEntityId === control.entityId),
            cardSection.addEventListener("click", () => {
              ((selectedEntityId = control.entityId),
                cards.forEach((listCard) =>
                  listCard.section.classList.toggle(
                    "is-selected",
                    listCard.section === cardSection,
                  ),
                ));
            }),
            bindDrag(dragHandle, cardSection, control, false),
            bindDrag(cardSection, cardSection, control, false),
            dragHandle.addEventListener("keydown", (dragKeyEvent) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(dragKeyEvent.key))
                return;
              dragKeyEvent.preventDefault();
              const controlIndex = layout.findIndex(
                  (controlEntry) => controlEntry.entityId === control.entityId,
                ),
                neighbour =
                  layout[
                    controlIndex + (["ArrowLeft", "ArrowUp"].includes(dragKeyEvent.key) ? -1 : 1)
                  ];
              neighbour && onLayout(moveExtra(layout, control.entityId, neighbour.entityId));
            }));
          const resizeHandle = createEl("button", "↘");
          ((resizeHandle.type = "button"),
            (resizeHandle.className = "i3d-extra-resize"),
            resizeHandle.setAttribute("aria-label", "调整大小 " + control.entityId),
            (resizeHandle.title =
              "拖动调整：1/3行、2/3行、半行、整行；36/80px；Esc取消，方向键调整"));
          const emitResize = (nextColumns, nextRows) => {
            viewModel.editing &&
              onLayout(
                extraLayout(
                  extraLayout(viewModel.item.extraControls).map((layoutControl) =>
                    layoutControl.entityId === control.entityId
                      ? {
                          ...layoutControl,
                          columns: nextColumns,
                          rows: nextRows,
                        }
                      : layoutControl,
                  ),
                ),
              );
          };
          (bindDrag(resizeHandle, cardSection, control, true),
            resizeHandle.addEventListener("keydown", (resizeKeyEvent) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(resizeKeyEvent.key))
                return;
              resizeKeyEvent.preventDefault();
              const columnIndex = COLUMN_ORDER.indexOf(control.columns);
              emitResize(
                resizeKeyEvent.key === "ArrowLeft"
                  ? COLUMN_ORDER[Math.max(0, columnIndex - 1)]
                  : resizeKeyEvent.key === "ArrowRight"
                    ? COLUMN_ORDER[Math.min(COLUMN_ORDER.length - 1, columnIndex + 1)]
                    : control.columns,
                resizeKeyEvent.key === "ArrowUp"
                  ? 1
                  : resizeKeyEvent.key === "ArrowDown"
                    ? 2
                    : control.rows,
              );
            }),
            cardSection.append(dragHandle, resizeHandle),
            cardSection.classList.add("is-layout-editing"));
        }
        const titleElement = createEl("h4"),
          statusElement = createEl("p"),
          errorElement = createEl("p");
        (errorElement.setAttribute("role", "status"),
          (errorElement.className = "i3d-climate-error"));
        const controlType = extraTypes(control.entityId).includes(control.type)
            ? control.type
            : "state",
          controlElement =
            controlType === "state"
              ? null
              : createEl(controlType === "number" ? "input" : "button", "执行"),
          cardState: PurifierCard = {
            item: {
              ...control,
              type: controlType,
            },
            section: cardSection,
            title: titleElement,
            status: statusElement,
            error: errorElement,
            control: controlElement,
            pending: false,
          };
        cards.push(cardState);
        const descriptionElement = createEl("div");
        if (
          ((cardState.description = descriptionElement),
          (descriptionElement.className = "i3d-extra-description"),
          descriptionElement.append(titleElement, statusElement),
          cardSection.append(descriptionElement),
          controlElement)
        ) {
          if (
            ((controlElement.className = "i3d-climate-choice"),
            controlElement.setAttribute("aria-label", control.label || control.entityId),
            controlType === "number"
              ? (controlElement.type = "number")
              : (controlElement.type = "button"),
            (cardState.submit = async () => {
              if (viewModel.editing || cardState.pending) return;
              const generationAtSend = generation;
              try {
                const command = extraCommand(
                  cardState.item,
                  readState(control.entityId),
                  controlElement.value,
                );
                if (
                  ((cardState.expected =
                    controlType === "switch"
                      ? command.service === "turn_on"
                        ? "on"
                        : "off"
                      : controlType === "select"
                        ? command.data.option
                        : controlType === "number"
                          ? command.data.value
                          : null),
                  (cardState.pending = true),
                  (errorElement.textContent = ""),
                  refreshRows(),
                  await onControl(command),
                  generationAtSend !== generation)
                )
                  return;
                controlType === "button"
                  ? ((cardState.pending = false), (errorElement.textContent = "指令已发送"))
                  : cardState.pending &&
                    ((errorElement.textContent = ""),
                    (cardState.timer = setTimeout(() => {
                      generationAtSend === generation &&
                        ((cardState.pending = false),
                        (cardState.expected = null),
                        (errorElement.textContent = "设备未响应，请重试"),
                        refreshRows());
                    }, 10000)),
                    cardState.timer.unref?.());
              } catch (error) {
                generationAtSend === generation &&
                  ((cardState.pending = false),
                  (cardState.expected = null),
                  (errorElement.textContent = error.message || "操作失败"));
              } finally {
                generationAtSend === generation && refreshRows();
              }
            }),
            controlType === "select")
          ) {
            (controlElement.classList.add("i3d-extra-select-trigger"),
              controlElement.setAttribute("aria-haspopup", "listbox"),
              controlElement.setAttribute("aria-expanded", "false"));
            const menuElement = createEl("div");
            ((cardState.menu = menuElement),
              (cardState.choices = []),
              (menuElement.className = "i3d-extra-select-menu"),
              menuElement.setAttribute("popover", "auto"),
              menuElement.setAttribute("role", "listbox"),
              menuElement.setAttribute("aria-label", (control.label || control.entityId) + " 选项"),
              (menuElement.hidden = true),
              cardSection.append(menuElement),
              controlElement.addEventListener("click", () => openSelectMenu(cardState)),
              controlElement.addEventListener("keydown", (triggerKeyEvent) => {
                ["ArrowDown", "ArrowUp"].includes(triggerKeyEvent.key) &&
                  (triggerKeyEvent.preventDefault(), openSelectMenu(cardState));
              }),
              menuElement.addEventListener("toggle", (toggleEvent) => {
                toggleEvent.newState === "closed" && openSelect === cardState && closeSelect();
              }),
              menuElement.addEventListener("keydown", (menuKeyEvent) => {
                if (menuKeyEvent.key === "Escape") {
                  (menuKeyEvent.preventDefault(),
                    menuKeyEvent.stopPropagation(),
                    closeSelect(true));
                  return;
                }
                if (menuKeyEvent.key === "Tab") {
                  closeSelect(true);
                  return;
                }
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(menuKeyEvent.key)) return;
                menuKeyEvent.preventDefault();
                const activeIndex = cardState.choices.indexOf(doc.activeElement),
                  choiceCount = cardState.choices.length,
                  nextIndex =
                    menuKeyEvent.key === "Home"
                      ? 0
                      : menuKeyEvent.key === "End"
                        ? choiceCount - 1
                        : (activeIndex +
                            (menuKeyEvent.key === "ArrowDown" ? 1 : -1) +
                            choiceCount) %
                          choiceCount;
                cardState.choices[nextIndex]?.focus?.();
              }));
          } else {
            if (controlType === "button") {
              const confirmElement = createEl("div");
              ((confirmElement.className = "i3d-extra-confirm"), (confirmElement.hidden = true));
              const confirmText = createEl("span", "确认执行此操作？"),
                confirmButton = createEl("button", "确认"),
                cancelButton = createEl("button", "取消");
              ((confirmButton.type = cancelButton.type = "button"),
                confirmButton.addEventListener("click", () => {
                  ((confirmElement.hidden = true), cardState.submit());
                }),
                cancelButton.addEventListener("click", () => {
                  ((confirmElement.hidden = true),
                    syncCardMetrics(cardState),
                    controlElement.focus?.());
                }),
                confirmElement.append(confirmText, confirmButton, cancelButton),
                (cardState.confirm = confirmElement),
                controlElement.addEventListener("click", () => {
                  !viewModel.editing &&
                    !controlElement.disabled &&
                    ((confirmElement.hidden = false), syncCardMetrics(cardState));
                }));
            } else
              controlElement.addEventListener(
                controlType === "number" ? "change" : "click",
                cardState.submit,
              );
          }
          (cardSection.append(controlElement),
            cardState.confirm && cardSection.append(cardState.confirm));
        }
        if (((cardState.ranges = []), controlType === "switch"))
          for (const rangeSpec of extraRanges(control.entityId, readState(control.entityId))) {
            const rangeLabel = createEl("label"),
              rangeOutput = createEl("span"),
              rangeInput = createEl("input");
            ((rangeLabel.className = "i3d-extra-range"),
              (rangeInput.type = "range"),
              (rangeInput.min = rangeSpec.min),
              (rangeInput.max = rangeSpec.max),
              (rangeInput.step = rangeSpec.step),
              (rangeInput.value = rangeSpec.value),
              rangeInput.setAttribute("aria-label", control.entityId + " " + rangeSpec.label),
              rangeInput.addEventListener("input", () => {
                rangeOutput.textContent = rangeSpec.label + " " + rangeInput.value;
              }),
              rangeInput.addEventListener("change", async () => {
                if (viewModel.editing || cardState.rangePending) return;
                const rangeGenerationAtSend = generation;
                try {
                  const rangeCommand = extraRangeCommand(
                    cardState.item,
                    readState(control.entityId),
                    rangeSpec.key,
                    rangeInput.value,
                  );
                  ((cardState.rangePending = true),
                    (cardState.rangeExpected = {
                      key: rangeSpec.key,
                      value: Number(rangeInput.value),
                    }),
                    (errorElement.textContent = ""),
                    refreshRows(),
                    await onControl(rangeCommand),
                    rangeGenerationAtSend === generation &&
                      cardState.rangePending &&
                      ((errorElement.textContent = ""),
                      (cardState.rangeTimer = setTimeout(() => {
                        rangeGenerationAtSend === generation &&
                          ((cardState.rangePending = false),
                          (cardState.rangeExpected = null),
                          (errorElement.textContent = "设备未响应，请重试"),
                          refreshRows());
                      }, 10000))));
                } catch (rangeError) {
                  rangeGenerationAtSend === generation &&
                    ((cardState.rangePending = false),
                    (cardState.rangeExpected = null),
                    (errorElement.textContent = rangeError.message || "调节失败"));
                } finally {
                  rangeGenerationAtSend === generation && refreshRows();
                }
              }),
              rangeLabel.append(rangeOutput, rangeInput),
              cardSection.append(rangeLabel),
              cardState.ranges.push({
                key: rangeSpec.key,
                label: rangeLabel,
                output: rangeOutput,
                input: rangeInput,
              }));
          }
        (cardSection.append(errorElement), hostElement.append(cardSection));
        for (const observedNode of [
          descriptionElement,
          controlElement,
          errorElement,
          cardState.confirm,
        ])
          observedNode && resizeObserver?.observe(observedNode);
      }
    }
    refreshRows();
  }
  return {
    update: update,
    dispose() {
      (defaultView?.removeEventListener?.("resize", positionSelectMenu),
        closeSelect(),
        finishDrag(true),
        resizeObserver?.disconnect(),
        cards.forEach((cleanupCard) => {
          (clearTimeout(cleanupCard.timer), clearTimeout(cleanupCard.rangeTimer));
        }),
        doc.removeEventListener?.("pointerdown", onDocumentPointerDown),
        doc.removeEventListener?.("scroll", onDocumentScroll, true),
        doc.removeEventListener?.("keydown", onEscapeKeydown, true),
        generation++,
        (cards = []),
        hostElement.replaceChildren());
    },
  };
}
