/**
 * 统一的配置选择器（0.8.1）：
 * 「添加交互对象」「选择设备类别」「关联模型 / 灯组」原来是三套弹窗，口径各异。
 * 0.8.1 把它们收敛成一个可按分组渲染的选择器，选项可以带
 *   - 当前标记（`is-selected`）
 *   - 配置进度（`configurationSummary`）
 *   - 明细行（已配置 / 缺失 / 未配置）
 * 选择动作异步执行，执行期间禁掉所有选项，失败把错误写回弹窗。
 */

import type { ConfigurationProgress } from "./configuration-progress";

export interface ConfigurationSummaryOptions {
  document: Document;
  /** 「模型 / 灯组 / 按钮」，只影响提示文案。 */
  unit?: string;
}

const MDI_ICON_PATTERN = /^mdi:[a-z0-9-]+$/;
const MDI_SVG_ROOT = "/static/vendor/mdi/7.4.47/svg/";

export interface ConfigurationChoice {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  wrapLabel?: boolean;
  detail?: string;
  state?: "configured" | "missing" | "remaining";
  progress?: ConfigurationProgress;
  unit?: string;
}

export interface ConfigurationPickerSection {
  label?: string;
  options: readonly ConfigurationChoice[];
}

export interface ConfigurationPickerOptions {
  document: Document;
  title: string;
  kicker?: string;
  description?: string;
  sections: readonly ConfigurationPickerSection[];
  summary?: ConfigurationProgress;
  unit?: string;
  selectedId?: string;
  controls?: Node;
  emptyMessage?: string;
  onSelect: (choiceId: string) => Promise<unknown> | unknown;
  onClose?: () => void;
}

export interface ConfigurationPickerHandle {
  close(): void;
}

export function configurationSummary(
  progress: ConfigurationProgress,
  { document: ownerDocument, unit = "模型" }: ConfigurationSummaryOptions,
): HTMLElement {
  const summaryElement = ownerDocument.createElement("span");
  summaryElement.className = "i3d-configuration-counts";
  if (!progress.ready) {
    summaryElement.textContent = "加载中…";
    return summaryElement;
  }
  const entries: Array<[string, number | undefined, string]> = progress.requiresModel
    ? [
        [unit, progress.total, "total"],
        ["已配置", progress.configured, "configured"],
        ["未配置", progress.remaining, "remaining"],
      ]
    : [["已配置", progress.configured, "configured"]];
  if (progress.missing) entries.push([unit === "灯组" ? "灯组缺失" : "模型缺失", progress.missing, "missing"]);
  entries.forEach(([labelText, countValue, stateName], entryIndex) => {
    if (entryIndex) {
      const separatorElement = ownerDocument.createElement("span");
      separatorElement.textContent = " · ";
      summaryElement.append(separatorElement);
    }
    const labelElement = ownerDocument.createElement("span");
    labelElement.textContent = labelText + " ";
    const countElement = ownerDocument.createElement("b");
    const resolvedCount = countValue ?? 0;
    countElement.className =
      "i3d-configuration-number is-" + (resolvedCount === 0 ? "zero" : stateName);
    countElement.textContent = String(resolvedCount);
    labelElement.append(countElement);
    summaryElement.append(labelElement);
  });
  return summaryElement;
}

export function openConfigurationPicker({
  document: ownerDocument,
  title,
  kicker = "CONFIGURATION",
  description,
  sections,
  summary,
  unit,
  selectedId,
  controls,
  emptyMessage = "当前楼层没有可选对象。",
  onSelect,
  onClose,
}: ConfigurationPickerOptions): ConfigurationPickerHandle {
  const previouslyFocusedElement = ownerDocument.activeElement,
    create = (tagName: string, className = "", textContent = ""): HTMLElement => {
      const node = ownerDocument.createElement(tagName);
      node.className = className;
      node.textContent = textContent;
      return node;
    },
    dialogElement = create("dialog", "settings-dialog i3d-device-category-dialog") as HTMLDialogElement;
  dialogElement.setAttribute("aria-label", title);
  let isClosed = false,
    isSelecting = false;
  const close = () => {
    if (isClosed) return;
    (isClosed = true),
      dialogElement.close(),
      dialogElement.remove(),
      onClose?.(),
      previouslyFocusedElement instanceof HTMLElement && previouslyFocusedElement.focus?.();
  };
  const headingElement = create("div", "dialog-heading"),
    headingTextElement = create("div");
  headingTextElement.append(create("span", "", kicker), create("h2", "", title));
  description && headingTextElement.append(create("p", "i3d-note", description));
  summary && headingTextElement.append(configurationSummary(summary, { document: ownerDocument, unit }));
  const closeButtonElement = create("button", "icon-button", "×") as HTMLButtonElement;
  ((closeButtonElement.type = "button"), closeButtonElement.setAttribute("aria-label", "关闭" + title));
  closeButtonElement.addEventListener("click", close);
  headingElement.append(headingTextElement, closeButtonElement);
  const bodyElement = create("div", "i3d-device-category-dialog-body");
  if (controls) {
    const controlsElement = create("div", "i3d-configuration-controls");
    (controlsElement.append(controls), bodyElement.append(controlsElement));
  }
  const errorElement = create("p", "i3d-error");
  errorElement.setAttribute("role", "status");
  const optionRecords: Array<{ optionButton: HTMLButtonElement; disabled: boolean }> = [];
  for (const section of sections) {
    const sectionElement = create("section", "i3d-device-category-group");
    section.label && sectionElement.append(create("h3", "", section.label));
    const optionsElement = create("div", "i3d-device-category-options");
    for (const choice of section.options) {
      const optionButton = create(
        "button",
        "i3d-device-category-option" + (choice.id === selectedId ? " is-selected" : ""),
      ) as HTMLButtonElement;
      optionButton.type = "button";
      optionButton.disabled = Boolean(choice.disabled);
      optionButton.title = choice.label;
      optionButton.setAttribute("data-configuration-choice", choice.id);
      optionButton.setAttribute("aria-pressed", String(choice.id === selectedId));
      const topElement = create("span", "i3d-device-category-option-top");
      if (MDI_ICON_PATTERN.test(choice.icon ?? "")) {
        const iconElement = create("i", "i3d-device-category-icon");
        iconElement.setAttribute("aria-hidden", "true");
        const maskUrl = "url('" + MDI_SVG_ROOT + (choice.icon ?? "").slice(4) + ".svg')";
        (iconElement.style.maskImage = maskUrl), (iconElement.style.webkitMaskImage = maskUrl);
        topElement.append(iconElement);
      }
      topElement.append(
        create(
          "span",
          "i3d-device-category-option-label" + (choice.wrapLabel ? " is-wrapped" : ""),
          choice.label,
        ),
      );
      choice.id === selectedId &&
        topElement.append(create("span", "i3d-device-category-option-current", "当前"));
      optionButton.append(topElement);
      choice.progress &&
        optionButton.append(
          configurationSummary(choice.progress, { document: ownerDocument, unit: choice.unit }),
        );
      choice.detail &&
        optionButton.append(
          create(
            "span",
            "i3d-configuration-detail" + (choice.state ? " is-" + choice.state : ""),
            choice.detail,
          ),
        );
      optionButton.addEventListener("click", async () => {
        if (isClosed || isSelecting || choice.disabled) return;
        ((isSelecting = true),
          optionRecords.forEach((record) => {
            record.optionButton.disabled = true;
          }),
          (errorElement.textContent = ""));
        try {
          (await onSelect(choice.id), isClosed || close());
        } catch (selectError: unknown) {
          isClosed ||
            (errorElement.textContent =
              (selectError as { message?: string } | undefined)?.message || "选择失败，请重试。");
        } finally {
          ((isSelecting = false),
            isClosed ||
              optionRecords.forEach((record) => {
                record.optionButton.disabled = record.disabled;
              }));
        }
      });
      optionRecords.push({ optionButton, disabled: optionButton.disabled });
      optionsElement.append(optionButton);
    }
    (sectionElement.append(optionsElement), bodyElement.append(sectionElement));
  }
  optionRecords.length || bodyElement.append(create("p", "i3d-note", emptyMessage));
  bodyElement.append(errorElement);
  (dialogElement.append(headingElement, bodyElement),
    ownerDocument.body.append(dialogElement),
    dialogElement.addEventListener("cancel", (cancelEvent: Event) => {
      (cancelEvent.preventDefault(), cancelEvent.stopPropagation(), close());
    }),
    dialogElement.showModal());
  return { close };
}
