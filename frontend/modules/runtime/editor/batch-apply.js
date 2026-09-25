/**
 * 跨域批量应用对话框。
 *
 * 0.6.5 把原本内联在 config-editor.js 里的「批量应用」抽成可复用模块，
 * 让配置编辑器与安防编辑器共用同一套「选设置 + 选目标 + 应用」流程。
 *
 * 两个导出：
 *   copyBatchFields(target, source, fields) —— 把 source 上被 fields 描述的值复制到 target；
 *   openBatchApply({...})                   —— 弹出选择界面，回调里由调用方自行落库 / 刷新。
 *
 * fields 是「字段描述表」，每项：
 *   { key, label, unit?, fallback?, optional?, compatible?(target), read?(source),
 *     write?(target, value), format?(value) }
 * `compatible` 是**按目标判定**（参考实现同款）：返回 false 的字段不会写进该目标
 * （例如「门型动作」只写给同族门型的门），因此同一张字段表可对逐目标差异化应用；
 * `read` / `write` 用于值不在 `item[key]` 上、需要换算的字段（高度、图标大小等）。
 * `optional: true` 的字段即使「本次修改过」也不默认勾选（高度、行为这类容易误伤的项）。
 *
 * 本文件不接触任何 /static/ 路径，可被 runtime 侧直接 import（见 check_invariants 的 import 边界规则）。
 */

// 值 → 中文：与参考实现同表，供字段未提供 format 时兜底显示。
const VALUE_LABELS = Object.freeze({
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
  traveler: "旅行者"
});

/**
 * 把 source 上被 fields 描述的值复制到 target。
 * 与参考实现同序：先过 compatible（对 target 判定），再 read（缺省读 target[field.key] ?? fallback），
 * 值非 undefined 才写入（write 优先，否则写 target[field.key]）。
 */
export function copyBatchFields(target, source, fields) {
  for (const field of fields || []) {
    if (field.compatible && !field.compatible(target)) {
      continue;
    }
    const fieldValue = field.read
      ? field.read(source)
      : (source[field.key] ?? field.fallback);
    if (fieldValue === undefined) {
      continue;
    }
    if (field.write) {
      field.write(target, structuredClone(fieldValue));
    } else {
      target[field.key] = structuredClone(fieldValue);
    }
  }
}

/**
 * 打开批量应用对话框。
 *
 * @param {string}   title    对话框标题，同时用作 aria-label
 * @param {object}   source   被复制的源项（用于读当前值与「本次修改过」的展示）
 * @param {Array}    targets  目标项列表，每项至少含 id 与 label / deviceName
 * @param {Array}    fields   字段描述表，见文件头
 * @param {Array}    changed  本次在源项上改动过的字段 key，用于默认勾选
 * @param {Function} onApply  async (targetIds: string[], fieldKeys: string[]) => void
 * @param {Function} onClose  关闭时回调
 * @returns {HTMLDialogElement}
 */
export function openBatchApply({
  title,
  source,
  targets,
  fields,
  changed = [],
  onApply,
  onClose = () => {}
}) {
  const create = (tagName, text, className) => {
    const element = document.createElement(tagName);
    if (text) {
      element.textContent = text;
    }
    if (className) {
      element.className = className;
    }
    return element;
  };
  const dialogElement = create(
    "dialog",
    "",
    "settings-dialog navigation-style-apply-dialog i3d-batch-dialog"
  );
  dialogElement.setAttribute("aria-label", title);

  let isFinished = false;
  const finish = () => {
    if (isFinished) {
      return;
    }
    isFinished = true;
    dialogElement.close();
    dialogElement.remove();
    onClose();
  };
  const createDialogButton = (text, onClick) => {
    const buttonElement = create("button", text);
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onClick);
    return buttonElement;
  };

  // 把字段描述里的原始值渲染成一句可读的当前值文案。
  const formatFieldValue = field => {
    const rawValue = field.read ? field.read(source) : (source[field.key] ?? field.fallback);
    if (field.format) {
      return field.format(rawValue);
    }
    if (typeof rawValue === "boolean") {
      return rawValue ? "开启" : "关闭";
    }
    return VALUE_LABELS[rawValue] ?? rawValue ?? "跟随各自模型";
  };

  const dialogHeadingElement = create("div", "", "dialog-heading");
  dialogHeadingElement.append(
    create("h2", title),
    createDialogButton("关闭", finish)
  );

  const dialogBodyElement = create("div", "", "navigation-style-apply-body");
  const columnsElement = create("div", "", "navigation-style-apply-columns");
  const settingsColumnElement = create("section");
  const targetsColumnElement = create("section");
  const fieldCheckboxEntries = [];
  const targetCheckboxEntries = [];

  // 一行复选框：label 是主文案，hint 是「当前值 + 修饰」的小字。
  const createOptionRow = (optionLabel, optionHint, optionChecked, bucket, entry) => {
    const optionLabelElement = create("label", "", "navigation-style-apply-option");
    const optionCheckboxElement = create("input");
    optionCheckboxElement.type = "checkbox";
    optionCheckboxElement.value = entry.key || entry.id;
    optionCheckboxElement.checked = optionChecked;
    optionCheckboxElement.setAttribute("aria-label", optionLabel);
    const optionHintElement = create("span", optionLabel);
    optionHintElement.append(create("small", optionHint));
    optionLabelElement.append(optionCheckboxElement, optionHintElement);
    bucket.push({ input: optionCheckboxElement, value: entry });
    return optionLabelElement;
  };

  settingsColumnElement.append(
    create("strong", "选择设置（高度、行为默认不选）")
  );
  for (const field of fields || []) {
    const fieldHint =
      formatFieldValue(field) +
      (field.unit || "") +
      (changed.includes(field.key) ? " · 已修改" : "") +
      (field.compatible ? " · 仅兼容目标" : "");
    settingsColumnElement.append(
      createOptionRow(
        field.label,
        fieldHint,
        !field.optional && changed.includes(field.key),
        fieldCheckboxEntries,
        field
      )
    );
  }

  const targetSelectionCountElement = create("span");
  const targetToggleButton = createDialogButton("全选", () => {
    const shouldSelectAllTargets = !targetCheckboxEntries.every(
      targetEntry => targetEntry.input.checked
    );
    targetCheckboxEntries.forEach(targetEntry => {
      targetEntry.input.checked = shouldSelectAllTargets;
    });
    refreshTargetSelection();
  });
  const refreshTargetSelection = () => {
    const checkedTargetCount = targetCheckboxEntries.filter(
      targetEntry => targetEntry.input.checked
    ).length;
    targetSelectionCountElement.textContent =
      "已选 " + checkedTargetCount + "/" + (targets || []).length;
    targetToggleButton.textContent =
      checkedTargetCount === (targets || []).length ? "取消全选" : "全选";
  };
  targetsColumnElement.append(
    create("strong", "同楼层、同类型目标"),
    targetSelectionCountElement,
    targetToggleButton
  );
  for (const target of targets || []) {
    targetsColumnElement.append(
      createOptionRow(
        target.label || target.deviceName || "未命名",
        "",
        true,
        targetCheckboxEntries,
        target
      )
    );
  }
  targetsColumnElement.addEventListener("change", refreshTargetSelection);
  refreshTargetSelection();

  const messageElement = create(
    "p",
    (targets || []).length
      ? "只复制勾选的设置；保留实体、模型、名称、X/Y、视角、地图与路线。"
      : "没有其他可应用的目标。",
    "navigation-style-apply-message"
  );
  messageElement.setAttribute("role", "status");
  messageElement.hidden = false;

  const applyButtonElement = createDialogButton("应用所选", async () => {
    if (isFinished || !dialogElement.open || !dialogElement.isConnected) {
      return;
    }
    const selectedFieldKeys = fieldCheckboxEntries
      .filter(fieldEntry => fieldEntry.input.checked)
      .map(fieldEntry => fieldEntry.value);
    const selectedTargetIds = targetCheckboxEntries
      .filter(targetEntry => targetEntry.input.checked)
      .map(targetEntry => targetEntry.value);
    if (!selectedFieldKeys.length || !selectedTargetIds.length) {
      messageElement.textContent = "请至少选择一项设置和一个目标。";
      messageElement.hidden = false;
      return;
    }
    applyButtonElement.disabled = true;
    try {
      await onApply(selectedTargetIds, selectedFieldKeys);
      finish();
    } catch (applyError) {
      messageElement.textContent = applyError.message;
      messageElement.hidden = false;
      applyButtonElement.disabled = false;
    }
  });
  applyButtonElement.className = "primary";
  applyButtonElement.disabled = !(targets || []).length;

  const actionsElement = create("div", "", "dialog-actions");
  actionsElement.append(createDialogButton("取消", finish), applyButtonElement);

  columnsElement.append(settingsColumnElement, targetsColumnElement);
  dialogBodyElement.append(columnsElement, messageElement, actionsElement);
  dialogElement.append(dialogHeadingElement, dialogBodyElement);
  dialogElement.addEventListener("cancel", cancelEvent => {
    cancelEvent.preventDefault();
    finish();
  });
  document.body.append(dialogElement);
  dialogElement.showModal();
  return dialogElement;
}
