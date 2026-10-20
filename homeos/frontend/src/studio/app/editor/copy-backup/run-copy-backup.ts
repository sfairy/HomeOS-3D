// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，声明级切片）。
// 备份/复制对话框装配与执行。

import { clampNumber as clampNumber2 } from "../editor-utils";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
interface RunCopyBackupDeps {
  runCopyFallback: any;
  runShadow: any;
  imageAssetLargePreviewImageElement: any;
  popupBeingRenamedValue: any;
  hideAssetLargePreview: any;
  handleOperationError: any;
}

export function renderPagedPickerDialog(deps: RunCopyBackupDeps, {
  kind: popupBeingRenamedConfig,
  title: popupBeingRenamedRef,
  subtitle: popupBeingRenamedEntry = "",
  searchPlaceholder: popupBeingRenamedRecord,
  triggerButton: popupBeingRenamedName,
  pageSize: recoveredComponentIdState,
  initialPage: initialPageNumber = 1,
  selectedText: selectedTextValue = "",
  emptyText: recoveryCancelEventState,
  itemClass: itemClassName = "",
  getPage: onErrorDialogConfirmButtonClickState,
  renderItem: onErrorDialogClickState,
  renderLeadingItems: errorDialogClickEventValue = null,
  renderTrailingItems: onShowSharedComponentsButtonClickState = null,
  buildToolbar: onShowPageComponentsButtonClickState = null,
  onSelect: onAddComponentButtonClickState,
  onDelete: onPopupNewButtonClick = null,
  onItemHover: onPopupNameCloseButtonClick = null,
  closeLegacyPickers: onPopupNameCancelButtonClick = true,
  renderSelectedActions: onPopupNameFormSubmit = null,
  renderSelectedContent: popupNameSubmitEvent = null,
}: any) {
  (deps.runCopyFallback(), onPopupNameCancelButtonClick && deps.runShadow());
  const popupNameSubmitEventElement = document.createElement("dialog");
  ((popupNameSubmitEventElement.className = "editor-paged-picker-dialog"),
    (popupNameSubmitEventElement.dataset.editorPickerKind = popupBeingRenamedConfig));
  const popupNameSubmitEventElementElement = document.createElement("div");
  popupNameSubmitEventElementElement.className =
    "editor-paged-picker-card" + (onShowPageComponentsButtonClickState ? " with-toolbar" : "");
  const popupNameSubmitEventElementPanel = document.createElement("div");
  popupNameSubmitEventElementPanel.className = "editor-paged-picker-heading";
  const popupNameSubmitEventElementSection = document.createElement("div");
  popupNameSubmitEventElementSection.className = popupBeingRenamedEntry
    ? "editor-paged-picker-heading-copy has-subtitle"
    : "editor-paged-picker-heading-copy";
  const popupNameSubmitEventElementCard = document.createElement("strong");
  popupNameSubmitEventElementCard.textContent = popupBeingRenamedRef;
  const popupNameSubmitEventElementBar = document.createElement("span");
  ((popupNameSubmitEventElementBar.textContent = popupBeingRenamedEntry),
    popupNameSubmitEventElementSection.append(popupNameSubmitEventElementCard),
    popupBeingRenamedEntry &&
      popupNameSubmitEventElementSection.append(popupNameSubmitEventElementBar));
  const popupNameSubmitEventElementList = document.createElement("button");
  ((popupNameSubmitEventElementList.type = "button"),
    (popupNameSubmitEventElementList.className = "editor-paged-picker-close"),
    popupNameSubmitEventElementList.setAttribute("aria-label", "关闭"),
    (popupNameSubmitEventElementList.textContent = "×"),
    popupNameSubmitEventElementPanel.append(
      popupNameSubmitEventElementSection,
      popupNameSubmitEventElementList,
    ));
  const popupNameInputElement = document.createElement("div");
  ((popupNameInputElement.className = "editor-paged-picker-toolbar"),
    (popupNameInputElement.hidden = !onShowPageComponentsButtonClickState));
  const popupNameInputPanel = document.createElement("label");
  popupNameInputPanel.className = "editor-paged-picker-search";
  const popupNameInputSection = document.createElement("input");
  ((popupNameInputSection.type = "search"),
    (popupNameInputSection.placeholder = popupBeingRenamedRecord),
    (popupNameInputSection.autocomplete = "off"),
    popupNameInputPanel.append(popupNameInputSection));
  const templateItemElementElement = document.createElement("div");
  templateItemElementElement.className = "editor-paged-picker-selected";
  const templatePagePathValue =
    selectedTextValue || (popupBeingRenamedConfig === "entity" ? "不使用实体" : "");
  if (((templateItemElementElement.hidden = !templatePagePathValue), templatePagePathValue)) {
    const popupNameInputCard = document.createElement("span");
    if (
      ((popupNameInputCard.className = "editor-paged-picker-current-label"),
      (popupNameInputCard.textContent = "当前选择"),
      templateItemElementElement.append(popupNameInputCard),
      popupNameSubmitEvent)
    )
      templateItemElementElement.append(
        ...(popupNameSubmitEvent({
          selectedText: selectedTextValue,
          selectedValueText: templatePagePathValue,
        }) || []),
      );
    else {
      const popupNameInputBar = document.createElement("strong");
      ((popupNameInputBar.textContent = templatePagePathValue),
        (popupNameInputBar.title = templatePagePathValue),
        templateItemElementElement.append(popupNameInputBar));
    }
  }
  if (onPopupNameFormSubmit) {
    const popupNameInput = onPopupNameFormSubmit({
      controller: null as any,
    });
    popupNameInput?.length &&
      (templateItemElementElement.classList.add("has-actions"),
      (templateItemElementElement.hidden = false),
      templateItemElementElement.append(...popupNameInput));
  }
  const popupNameInputList = document.createElement("div");
  ((popupNameInputList.className = (
    "editor-paged-picker-items " + itemClassName
  ).trim()),
    popupNameInputList.setAttribute("role", "listbox"));
  const popupNameInputRow = document.createElement("div");
  popupNameInputRow.className = "editor-paged-picker-footer";
  const popupNameInputBox = document.createElement("span");
  popupNameInputBox.className = "editor-paged-picker-status";
  const popupNameInputStack = document.createElement("div");
  popupNameInputStack.className = "editor-paged-picker-pagination";
  const popupNameInputColumn = document.createElement("button");
  ((popupNameInputColumn.type = "button"), (popupNameInputColumn.textContent = "上一页"));
  const popupNameInputTrack = document.createElement("input");
  ((popupNameInputTrack.type = "text"),
    (popupNameInputTrack.inputMode = "numeric"),
    popupNameInputTrack.setAttribute("aria-label", "页码"));
  const popupNameInputHandle = document.createElement("span"),
    popupNameInputAnchor = document.createElement("button");
  ((popupNameInputAnchor.type = "button"),
    (popupNameInputAnchor.textContent = "下一页"),
    popupNameInputStack.append(
      popupNameInputColumn,
      popupNameInputTrack,
      popupNameInputHandle,
      popupNameInputAnchor,
    ),
    popupNameInputRow.append(popupNameInputBox, popupNameInputStack),
    popupNameSubmitEventElementElement.append(
      popupNameSubmitEventElementPanel,
      popupNameInputElement,
      popupNameInputPanel,
      templateItemElementElement,
      popupNameInputList,
      popupNameInputRow,
    ),
    popupNameSubmitEventElement.append(popupNameSubmitEventElementElement),
    document.body.append(popupNameSubmitEventElement));
  let popupNameInputState: any = null,
    pickerGeneration = 0,
    isPopupId = false;
  const popupIdConfig = {
      page: Math.max(1, Number(initialPageNumber) || 1),
      total: 0,
      pageCount: 1,
      query: "",
    },
    popupIdRef = {
      kind: popupBeingRenamedConfig,
      dialog: popupNameSubmitEventElement,
      triggerButton: popupBeingRenamedName,
      state: popupIdConfig,
      refresh({ resetPage: popupIdEntry = false } = {}) {
        return (popupIdEntry && (popupIdConfig.page = 1), popupIdRecord());
      },
      rebuildToolbar() {
        !onShowPageComponentsButtonClickState ||
          isPopupId ||
          (popupNameInputElement.replaceChildren(),
          onShowPageComponentsButtonClickState({
            toolbar: popupNameInputElement,
            controller: popupIdRef,
          }),
          (popupNameInputElement.hidden = !popupNameInputElement.childElementCount));
      },
      close() {
        isPopupId ||
          (popupNameSubmitEventElement.open
            ? popupNameSubmitEventElement.close()
            : closeCopyBackupDialog());
      },
    };
  function closeCopyBackupDialog() {
    isPopupId ||
      ((isPopupId = true),
      window.clearTimeout(popupNameInputState),
      (pickerGeneration += 1),
      popupBeingRenamedName?.setAttribute("aria-expanded", "false"),
      popupNameInputList.replaceChildren(),
      popupNameInputElement.replaceChildren(),
      popupNameSubmitEventElement.contains(deps.imageAssetLargePreviewImageElement) &&
        document.body.append(deps.imageAssetLargePreviewImageElement),
      popupNameSubmitEventElement.remove(),
      deps.popupBeingRenamedValue === popupIdRef && (deps.popupBeingRenamedValue = null),
      deps.hideAssetLargePreview());
  }
  async function popupIdRecord() {
    const currentComponentScopeState = ++pickerGeneration;
    (popupNameInputList.setAttribute("aria-busy", "true"),
      (popupNameInputBox.textContent = "正在加载…"),
      (popupNameInputColumn.disabled = true),
      (popupNameInputAnchor.disabled = true));
    try {
      const activeGroupEntryState = await onErrorDialogConfirmButtonClickState({
        query: popupIdConfig.query,
        page: popupIdConfig.page,
        pageSize: recoveredComponentIdState,
      });
      if (isPopupId || currentComponentScopeState !== pickerGeneration) return;
      if (
        ((popupIdConfig.total = Math.max(0, Number(activeGroupEntryState.total) || 0)),
        (popupIdConfig.pageCount = Math.max(
          1,
          Math.ceil(popupIdConfig.total / recoveredComponentIdState),
        )),
        popupIdConfig.page > popupIdConfig.pageCount)
      ) {
        ((popupIdConfig.page = popupIdConfig.pageCount), await popupIdRecord());
        return;
      }
      const activeGroupChildComponentState = errorDialogClickEventValue
          ? errorDialogClickEventValue(popupIdConfig)
          : [],
        availableItemsState = (activeGroupEntryState.items || []).map((popupNameDraftDocument: any) =>
          onErrorDialogClickState(popupNameDraftDocument),
        );
      if (!availableItemsState.length) {
        const popupToRenameElement = document.createElement("div");
        ((popupToRenameElement.className = "editor-paged-picker-empty"),
          (popupToRenameElement.textContent = recoveryCancelEventState),
          availableItemsState.push(popupToRenameElement));
      }
      (onShowSharedComponentsButtonClickState &&
        popupIdConfig.page === popupIdConfig.pageCount &&
        availableItemsState.push(...(onShowSharedComponentsButtonClickState(popupIdConfig) || [])),
        popupNameInputList.replaceChildren(
          ...activeGroupChildComponentState,
          ...availableItemsState,
        ),
        (popupNameInputList.scrollTop = 0),
        (popupNameInputTrack.value = String(popupIdConfig.page)),
        (popupNameInputHandle.textContent = "/ " + popupIdConfig.pageCount),
        (popupNameInputBox.textContent =
          "第 " +
          popupIdConfig.page +
          " / " +
          popupIdConfig.pageCount +
          " 页 · 共 " +
          popupIdConfig.total +
          " 项"),
        (popupNameInputColumn.disabled = popupIdConfig.page <= 1),
        (popupNameInputAnchor.disabled = popupIdConfig.page >= popupIdConfig.pageCount));
    } catch (caughtErrorText: any) {
      if (isPopupId || currentComponentScopeState !== pickerGeneration) return;
      const popupToRenameElementElement = document.createElement("div");
      ((popupToRenameElementElement.className = "editor-paged-picker-empty error"),
        (popupToRenameElementElement.textContent = "加载失败，请稍后重试"),
        popupNameInputList.replaceChildren(popupToRenameElementElement),
        (popupNameInputBox.textContent = "加载失败"),
        deps.handleOperationError(caughtErrorText));
    } finally {
      !isPopupId &&
        currentComponentScopeState === pickerGeneration &&
        popupNameInputList.removeAttribute("aria-busy");
    }
  }
  return (
    popupNameSubmitEventElementList.addEventListener("click", () => popupIdRef.close()),
    popupNameSubmitEventElement.addEventListener("cancel", (onPopupSelectChangeState) => {
      (onPopupSelectChangeState.preventDefault(), popupIdRef.close());
    }),
    popupNameSubmitEventElement.addEventListener("click", (popupMatch) => {
      popupMatch.target === popupNameSubmitEventElement && popupIdRef.close();
    }),
    popupNameSubmitEventElement.addEventListener("close", closeCopyBackupDialog, {
      once: true,
    }),
    popupNameInputSection.addEventListener("input", () => {
      (window.clearTimeout(popupNameInputState),
        (popupNameInputState = window.setTimeout(() => {
          ((popupIdConfig.query = popupNameInputSection.value.trim()),
            (popupIdConfig.page = 1),
            popupIdRecord());
        }, 160)));
    }),
    popupNameInputColumn.addEventListener("click", () => {
      popupIdConfig.page <= 1 || ((popupIdConfig.page -= 1), popupIdRecord());
    }),
    popupNameInputAnchor.addEventListener("click", () => {
      popupIdConfig.page >= popupIdConfig.pageCount || ((popupIdConfig.page += 1), popupIdRecord());
    }),
    popupNameInputTrack.addEventListener("change", () => {
      const trunc = Math.trunc(Number(popupNameInputTrack.value));
      ((popupIdConfig.page = clampNumber2(
        Number.isFinite(trunc) ? trunc : popupIdConfig.page,
        1,
        popupIdConfig.pageCount,
      )),
        popupIdRecord());
    }),
    popupNameInputList.addEventListener("pointerover", (onPopupSelectChange) => {
      const popupListItemElementElement = (onPopupSelectChange.target as Element).closest<HTMLElement>(
        "[data-editor-picker-value]",
      );
      !popupListItemElementElement ||
        popupListItemElementElement.contains(onPopupSelectChange.relatedTarget as Node) ||
        onPopupNameCloseButtonClick?.(
          popupListItemElementElement.dataset.editorPickerValue,
          popupListItemElementElement,
        );
    }),
    popupNameInputList.addEventListener("pointerleave", deps.hideAssetLargePreview),
    popupNameInputList.addEventListener("scroll", deps.hideAssetLargePreview),
    popupNameInputList.addEventListener("click", (onPopupListClick) => {
      const onPopupListClickElement = (onPopupListClick.target as Element).closest<HTMLElement>("[data-delete-user-asset]");
      if (onPopupListClickElement && onPopupNewButtonClick) {
        (onPopupListClick.preventDefault(), onPopupListClick.stopPropagation());
        const deleteUserAsset = onPopupListClickElement.dataset.deleteUserAsset;
        (popupIdRef.close(), onPopupNewButtonClick(deleteUserAsset));
        return;
      }
      const popupListClickEventElement = (onPopupListClick.target as Element).closest<HTMLElement>(
        "[data-editor-picker-value]",
      );
      if (!popupListClickEventElement || !popupNameInputList.contains(popupListClickEventElement))
        return;
      const editorPickerValue = popupListClickEventElement.dataset.editorPickerValue;
      (popupIdRef.close(), onAddComponentButtonClickState(editorPickerValue));
    }),
    templateItemElementElement.addEventListener("click", (popupListClickEvent) => {
      const popupListItemElement = (popupListClickEvent.target as Element).closest<HTMLElement>("[data-editor-picker-value]");
      if (!popupListItemElement || !templateItemElementElement.contains(popupListItemElement))
        return;
      const editorPickerValue2 = popupListItemElement.dataset.editorPickerValue;
      (popupIdRef.close(), onAddComponentButtonClickState(editorPickerValue2));
    }),
    (deps.popupBeingRenamedValue = popupIdRef),
    popupBeingRenamedName?.setAttribute("aria-expanded", "true"),
    popupIdRef.rebuildToolbar(),
    popupNameSubmitEventElement.showModal(),
    popupIdRecord(),
    window.requestAnimationFrame(() =>
      popupNameInputSection.focus({
        preventScroll: true,
      }),
    ),
    popupIdRef
  );
}
