export function copyBatchFields(target, source, fields) {
  for (const field of fields) {
    if (field.compatible && !field.compatible(target)) continue;
    const fieldValue = field.read ? field.read(source) : (source[field.key] ?? field.fallback);
    fieldValue !== undefined &&
      (field.write
        ? field.write(target, structuredClone(fieldValue))
        : fieldValue !== undefined && (target[field.key] = structuredClone(fieldValue)));
  }
}
export function openBatchApply({
  title: title,
  source: sourceItem,
  targets: targets,
  fields: fieldDefs,
  changed: changed = [],
  onApply: onApply,
  onClose: onClose = () => {},
}) {
  const create = (tagName, text, className) => {
      const createdElement = document.createElement(tagName);
      return (
        text && (createdElement.textContent = text),
        className && (createdElement.className = className),
        createdElement
      );
    },
    dialogElement = create(
      "dialog",
      "",
      "settings-dialog navigation-style-apply-dialog i3d-batch-dialog",
    );
  dialogElement.setAttribute("aria-label", title);
  let isFinished = false;
  const finish = () => {
      ((isFinished = true), dialogElement.close(), dialogElement.remove(), onClose());
    },
    createDialogButton = (buttonText, onClick) => {
      const buttonElement = create("button", buttonText);
      return (
        (buttonElement.type = "button"),
        buttonElement.addEventListener("click", onClick),
        buttonElement
      );
    },
    dialogHeadingElement = create("div", "", "dialog-heading");
  dialogHeadingElement.append(create("h2", title), createDialogButton("关闭", finish));
  const dialogBodyElement = create("div", "", "navigation-style-apply-body"),
    columnsElement = create("div", "", "navigation-style-apply-columns"),
    settingsColumnElement = create("section"),
    targetsColumnElement = create("section"),
    fieldCheckboxEntries = [],
    targetCheckboxEntries = [],
    createOptionRow = (optionLabel, optionHint, optionChecked, bucket, entry) => {
      const optionLabelElement = create("label", "", "navigation-style-apply-option"),
        optionCheckboxElement = create("input"),
        optionHintElement = create("span", optionLabel);
      return (
        (optionCheckboxElement.type = "checkbox"),
        (optionCheckboxElement.value = entry.key || entry.id),
        (optionCheckboxElement.checked = optionChecked),
        optionCheckboxElement.setAttribute("aria-label", optionLabel),
        optionHintElement.append(create("small", optionHint)),
        optionLabelElement.append(optionCheckboxElement, optionHintElement),
        bucket.push({
          input: optionCheckboxElement,
          value: entry,
        }),
        optionLabelElement
      );
    };
  settingsColumnElement.append(create("strong", "选择设置（高度、行为默认不选）"));
  const VALUE_LABELS = {
    focus: "聚焦",
    panel: "仅显示弹窗",
    "focus-panel": "聚焦并显示弹窗",
    "turn-on": "仅开关",
    "turn-on-focus": "聚焦并开启",
    "turn-on-panel": "开启并显示弹窗",
    cloth: "布帘",
    sheer: "纱帘",
    standard: "普通窗帘",
    roller: "卷帘",
    dream: "梦幻帘",
    auto: "继承模型",
    left: "左",
    right: "右",
    split: "双向",
    horizontal: "左右布局",
    vertical: "上下布局",
    hidden: "隐藏",
    always: "常驻显示",
    open: "打开时显示",
    cyan: "青色",
    orange: "橙色",
    traveler: "旅行者",
  };
  for (const fieldItem of fieldDefs) {
    const rawValue = fieldItem.read
        ? fieldItem.read(sourceItem)
        : (sourceItem[fieldItem.key] ?? fieldItem.fallback),
      fieldHint = fieldItem.format
        ? fieldItem.format(rawValue)
        : typeof rawValue == "boolean"
          ? rawValue
            ? "开启"
            : "关闭"
          : (VALUE_LABELS[rawValue] ?? rawValue ?? "跟随各自模型");
    settingsColumnElement.append(
      createOptionRow(
        fieldItem.label,
        "" +
          fieldHint +
          (fieldItem.unit || "") +
          (changed.includes(fieldItem.key) ? " · 已修改" : "") +
          (fieldItem.compatible ? " · 仅兼容目标" : ""),
        !fieldItem.optional && changed.includes(fieldItem.key),
        fieldCheckboxEntries,
        fieldItem,
      ),
    );
  }
  const targetSelectionCountElement = create("span"),
    targetToggleButton = createDialogButton("取消全选", () => {
      const shouldSelectAllTargets = !targetCheckboxEntries.every(
        (targetEntry) => targetEntry.input.checked,
      );
      (targetCheckboxEntries.forEach((targetRow) => {
        targetRow.input.checked = shouldSelectAllTargets;
      }),
        refreshTargetSelection());
    }),
    refreshTargetSelection = () => {
      const checkedTargetCount = targetCheckboxEntries.filter(
        (checkedTargetEntry) => checkedTargetEntry.input.checked,
      ).length;
      ((targetSelectionCountElement.textContent =
        "已选 " + checkedTargetCount + "/" + targets.length),
        (targetToggleButton.textContent =
          checkedTargetCount === targets.length ? "取消全选" : "全选"));
    };
  targetsColumnElement.append(
    create("strong", "同楼层、同类型目标"),
    targetSelectionCountElement,
    targetToggleButton,
  );
  for (const targetItem of targets)
    targetsColumnElement.append(
      createOptionRow(
        targetItem.label || targetItem.deviceName || "未命名",
        "",
        true,
        targetCheckboxEntries,
        targetItem,
      ),
    );
  (targetsColumnElement.addEventListener("change", refreshTargetSelection),
    refreshTargetSelection());
  const messageElement = create(
    "p",
    targets.length
      ? "只复制勾选的设置；保留实体、模型、名称、X/Y、视角、地图与路线。"
      : "没有其他可应用的目标。",
    "navigation-style-apply-message",
  );
  messageElement.hidden = false;
  const applyButtonElement = createDialogButton("应用所选", async () => {
    if (isFinished || !dialogElement.open || !dialogElement.isConnected) return;
    const selectedFieldKeys = fieldCheckboxEntries
        .filter((fieldEntry) => fieldEntry.input.checked)
        .map((fieldRecord) => fieldRecord.value),
      selectedTargetIds = targetCheckboxEntries
        .filter((selectedTargetEntry) => selectedTargetEntry.input.checked)
        .map((selectedTargetRecord) => selectedTargetRecord.value);
    if (!selectedFieldKeys.length || !selectedTargetIds.length) {
      messageElement.textContent = "请至少选择一项设置和一个目标。";
      return;
    }
    applyButtonElement.disabled = true;
    try {
      (await onApply(selectedTargetIds, selectedFieldKeys), finish());
    } catch (applyError) {
      ((messageElement.textContent = applyError.message), (applyButtonElement.disabled = false));
    }
  });
  ((applyButtonElement.className = "primary"), (applyButtonElement.disabled = !targets.length));
  const actionsElement = create("div", "", "dialog-actions");
  return (
    actionsElement.append(createDialogButton("取消", finish), applyButtonElement),
    columnsElement.append(settingsColumnElement, targetsColumnElement),
    dialogBodyElement.append(columnsElement, messageElement, actionsElement),
    dialogElement.append(dialogHeadingElement, dialogBodyElement),
    dialogElement.addEventListener("cancel", (cancelEvent) => {
      (cancelEvent.preventDefault(), finish());
    }),
    document.body.append(dialogElement),
    dialogElement.showModal(),
    dialogElement
  );
}
