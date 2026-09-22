/*
 * 编辑器选择器。
 *
 * 编辑器里通用的一套「弹出选择器」：下拉面板的构建、候选项的过滤与分页、选中回填，以及实体 / 图标 / 灯具实体 / 弹窗模块几个入口。
 *
 * 由 static/editor/home.js 外提而来：这里只放函数，对 home.js 模块级状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 home.js 里的 getter/setter，读到的始终是调用时刻的值。
 */

import {
  ACTION_TYPES,
  TOGGLE_ENTITY_DOMAINS,
  actionNeedsCurrentEntity,
  actionPopupData,
  componentActionIsSupported,
  entityIdSupportsToggle
} from "../../shared/action-rules.js?v=2609230040";
import {
  EDITOR_PICKER_PAGE_SIZES,
  editorEntityPickerInitialPage,
  editorEntityPickerPage
} from "../picker/editor-picker-pagination.js?v=2609230040";
import { clampNumber } from "../../utils/numbers.js?v=2609230040";
import { createEditorPickerLifecycle } from "../picker/editor-picker-lifecycle.js?v=2609230040";
import { entityDomainOf } from "../../utils/entities.js?v=2609230040";
import { findComponent } from "../component-tree.js?v=2609230040";
import { lightStatisticsEntitySupport } from "../../renderer/core/registry.js?v=2609230040";
import {
  RELATED_ENTITY_DOMAIN_LABELS,
  legacyRelatedEntityIds,
  manualRelatedEntityConfig,
  relatedEntityIsAvailable,
  relatedEntityLabel,
  relatedEntityNeedsConfirmation,
  relatedPopupCandidates,
  relatedPopupContext,
  relatedPopupSelectionLimit,
  selectedRelatedEntityIds
} from "../../shared/related-entities.js?v=2609230040";
import { popupModuleEntityRecommended } from "../editor-document-management.js?v=2609230040";

export function createPickers(ctx) {

  /**
   * 关闭当前打开的分页选择器（编辑器同一时刻只允许一个选择器）。
   *
   * @returns {void}
   */
  function closeActiveEditorPicker() {
    ctx.activeEditorPicker?.close();
  }

  /**
   * 创建一个分页选择器对话框并接管其生命周期（图标、实体、素材等共用）。先关掉已有选择器与遗留下拉菜单避免叠加，
   * 搜索输入做 160ms 防抖；所有异步加载用自增的 pickerRequestId 作令牌，回调时令牌不一致或对话框已关闭就丢弃结果，
   * 防止慢响应覆盖新页面；页码越界自动回退到最后一页；列表上的 pointerover/scroll 会隐藏素材大图预览；销毁时把大图预览节点移回 body。
   */
  function openEditorPickerDialog({
    kind: pickerKind,
    title: pickerTitle,
    subtitle: pickerSubtitle = "",
    searchPlaceholder: searchPlaceholder,
    triggerButton: triggerButton,
    pageSize: pageSize,
    initialPage: initialPage = 1,
    selectedText: selectedText = "",
    emptyText: emptyText,
    itemClass: itemClassName = "",
    getPage: getPage,
    renderItem: renderItem,
    renderLeadingItems: renderLeadingItems = null,
    renderTrailingItems: renderTrailingItems = null,
    buildToolbar: buildToolbar = null,
    onSelect: onSelect,
    onDelete: onDelete = null,
    onItemHover: onItemHover = null,
    closeLegacyPickers: shouldCloseLegacyPickers = true,
    renderSelectedActions: renderSelectedActions = null,
    renderSelectedContent: renderSelectedContent = null
  }) {
    closeActiveEditorPicker();
    if (shouldCloseLegacyPickers) {
      ctx.closeAllDropdownMenus();
    }
    const pickerDialogElement = document.createElement("dialog");
    pickerDialogElement.className = "editor-paged-picker-dialog";
    pickerDialogElement.dataset.editorPickerKind = pickerKind;
    const pickerCardElement = document.createElement("div");
    pickerCardElement.className = "editor-paged-picker-card" + (buildToolbar ? " with-toolbar" : "");
    const pickerHeadingElement = document.createElement("div");
    pickerHeadingElement.className = "editor-paged-picker-heading";
    const pickerHeadingCopyElement = document.createElement("div");
    pickerHeadingCopyElement.className = pickerSubtitle
      ? "editor-paged-picker-heading-copy has-subtitle"
      : "editor-paged-picker-heading-copy";
    const pickerTitleElement = document.createElement("strong");
    pickerTitleElement.textContent = pickerTitle;
    const pickerSubtitleElement = document.createElement("span");
    pickerSubtitleElement.textContent = pickerSubtitle;
    pickerHeadingCopyElement.append(pickerTitleElement);
    if (pickerSubtitle) {
      pickerHeadingCopyElement.append(pickerSubtitleElement);
    }
    const pickerCloseButtonElement = document.createElement("button");
    pickerCloseButtonElement.type = "button";
    pickerCloseButtonElement.className = "editor-paged-picker-close";
    pickerCloseButtonElement.setAttribute("aria-label", "关闭");
    pickerCloseButtonElement.textContent = "×";
    pickerHeadingElement.append(pickerHeadingCopyElement, pickerCloseButtonElement);
    const pickerToolbarElement = document.createElement("div");
    pickerToolbarElement.className = "editor-paged-picker-toolbar";
    pickerToolbarElement.hidden = !buildToolbar;
    const pickerSearchLabelElement = document.createElement("label");
    pickerSearchLabelElement.className = "editor-paged-picker-search";
    const pickerSearchInputElement = document.createElement("input");
    pickerSearchInputElement.type = "search";
    pickerSearchInputElement.placeholder = searchPlaceholder;
    pickerSearchInputElement.autocomplete = "off";
    pickerSearchLabelElement.append(pickerSearchInputElement);
    const pickerSelectedElement = document.createElement("div");
    pickerSelectedElement.className = "editor-paged-picker-selected";
    const pickerSelectedValueText = selectedText || (pickerKind === "entity" ? "不使用实体" : "");
    pickerSelectedElement.hidden = !pickerSelectedValueText;
    if (pickerSelectedValueText) {
      const pickerCurrentLabelElement = document.createElement("span");
      pickerCurrentLabelElement.className = "editor-paged-picker-current-label";
      pickerCurrentLabelElement.textContent = "当前选择";
      pickerSelectedElement.append(pickerCurrentLabelElement);
      if (renderSelectedContent) {
        pickerSelectedElement.append(
          ...(renderSelectedContent({
            selectedText: selectedText,
            selectedValueText: pickerSelectedValueText
          }) || [])
        );
      } else {
        const pickerSelectedValueElement = document.createElement("strong");
        pickerSelectedValueElement.textContent = pickerSelectedValueText;
        pickerSelectedValueElement.title = pickerSelectedValueText;
        pickerSelectedElement.append(pickerSelectedValueElement);
      }
    }
    if (renderSelectedActions) {
      const selectedActionElements = renderSelectedActions({
        controller: null
      });
      if (selectedActionElements?.length) {
        pickerSelectedElement.classList.add("has-actions");
        pickerSelectedElement.hidden = false;
        pickerSelectedElement.append(...selectedActionElements);
      }
    }
    const pickerItemsElement = document.createElement("div");
    pickerItemsElement.className = ("editor-paged-picker-items " + itemClassName).trim();
    pickerItemsElement.setAttribute("role", "listbox");
    const pickerFooterElement = document.createElement("div");
    pickerFooterElement.className = "editor-paged-picker-footer";
    const pickerStatusElement = document.createElement("span");
    pickerStatusElement.className = "editor-paged-picker-status";
    const pickerPaginationElement = document.createElement("div");
    pickerPaginationElement.className = "editor-paged-picker-pagination";
    const pickerPrevButtonElement = document.createElement("button");
    pickerPrevButtonElement.type = "button";
    pickerPrevButtonElement.textContent = "上一页";
    const pickerPageInputElement = document.createElement("input");
    pickerPageInputElement.type = "text";
    pickerPageInputElement.inputMode = "numeric";
    pickerPageInputElement.setAttribute("aria-label", "页码");
    const pickerPageCountElement = document.createElement("span");
    const pickerNextButtonElement = document.createElement("button");
    pickerNextButtonElement.type = "button";
    pickerNextButtonElement.textContent = "下一页";
    pickerPaginationElement.append(
      pickerPrevButtonElement,
      pickerPageInputElement,
      pickerPageCountElement,
      pickerNextButtonElement
    );
    pickerFooterElement.append(pickerStatusElement, pickerPaginationElement);
    pickerCardElement.append(
      pickerHeadingElement,
      pickerToolbarElement,
      pickerSearchLabelElement,
      pickerSelectedElement,
      pickerItemsElement,
      pickerFooterElement
    );
    pickerDialogElement.append(pickerCardElement);
    document.body.append(pickerDialogElement);
    let pickerSearchDebounceId = null;
    let pickerRequestId = 0;
    let isPickerClosed = false;
    const pickerState = {
      page: Math.max(1, Number(initialPage) || 1),
      total: 0,
      pageCount: 1,
      query: ""
    };
    const pickerController = {
      kind: pickerKind,
      dialog: pickerDialogElement,
      triggerButton: triggerButton,
      state: pickerState,
      refresh({ resetPage: resetPage = false } = {}) {
        if (resetPage) {
          pickerState.page = 1;
        }
        return loadPickerPage();
      },
      rebuildToolbar() {
        if (!!buildToolbar && !isPickerClosed) {
          pickerToolbarElement.replaceChildren();
          buildToolbar({
            toolbar: pickerToolbarElement,
            controller: pickerController
          });
          pickerToolbarElement.hidden = !pickerToolbarElement.childElementCount;
        }
      },
      close() {
        if (!isPickerClosed) {
          if (pickerDialogElement.open) {
            pickerDialogElement.close();
          } else {
            teardownPickerDialog();
          }
        }
      }
    };
    /**
     * 销毁选择器：置关闭标记、取消待触发的防抖搜索、作废进行中的请求令牌，复位触发按钮的 aria-expanded，
     * 并把素材大图预览节点搬回 body（它不在对话框子树里，但会被 close 时的清理逻辑一并影响），
     * 最后从 DOM 摘除对话框。
     */
    function teardownPickerDialog() {
      if (!isPickerClosed) {
        isPickerClosed = true;
        window.clearTimeout(pickerSearchDebounceId);
        pickerRequestId += 1;
        triggerButton?.setAttribute("aria-expanded", "false");
        pickerItemsElement.replaceChildren();
        pickerToolbarElement.replaceChildren();
        if (pickerDialogElement.contains(ctx.imageAssetLargePreviewElement)) {
          document.body.append(ctx.imageAssetLargePreviewElement);
        }
        pickerDialogElement.remove();
        if (ctx.activeEditorPicker === pickerController) {
          ctx.activeEditorPicker = null;
        }
        ctx.hideAssetLargePreview();
      }
    }
    /**
     * 拉取并渲染当前页。用自增令牌做竞态防护：await 回来后若令牌已被更新或对话框已关闭，直接丢弃结果（否则慢的旧请求会覆盖新页）。
     * 页码越界时先回退到末页再递归重载一次；加载中禁用翻页按钮并置 aria-busy，失败时用「加载失败，请稍后重试」占位并交给统一错误处理。
     */
    async function loadPickerPage() {
      const pickerRequestToken = ++pickerRequestId;
      pickerItemsElement.setAttribute("aria-busy", "true");
      pickerStatusElement.textContent = "正在加载…";
      pickerPrevButtonElement.disabled = true;
      pickerNextButtonElement.disabled = true;
      try {
        const pickerPageResult = await getPage({
          query: pickerState.query,
          page: pickerState.page,
          pageSize: pageSize
        });
        if (isPickerClosed || pickerRequestToken !== pickerRequestId) {
          return;
        }
        pickerState.total = Math.max(0, Number(pickerPageResult.total) || 0);
        pickerState.pageCount = Math.max(1, Math.ceil(pickerState.total / pageSize));
        if (pickerState.page > pickerState.pageCount) {
          pickerState.page = pickerState.pageCount;
          await loadPickerPage();
          return;
        }
        const leadingPickerItems = renderLeadingItems ? renderLeadingItems(pickerState) : [];
        /**
         * 本页渲染出的条目元素；空结果时会被塞入一个占位节点，因此不会出现
         * 「列表为空但页脚仍显示总数」的错觉。
         */
        const pickerItemElements = (pickerPageResult.items || []).map(pickerItem =>
          renderItem(pickerItem)
        );
        if (!pickerItemElements.length) {
          const pickerEmptyElement = document.createElement("div");
          pickerEmptyElement.className = "editor-paged-picker-empty";
          pickerEmptyElement.textContent = emptyText;
          pickerItemElements.push(pickerEmptyElement);
        }
        if (renderTrailingItems && pickerState.page === pickerState.pageCount) {
          pickerItemElements.push(...(renderTrailingItems(pickerState) || []));
        }
        pickerItemsElement.replaceChildren(...leadingPickerItems, ...pickerItemElements);
        pickerItemsElement.scrollTop = 0;
        pickerPageInputElement.value = String(pickerState.page);
        pickerPageCountElement.textContent = "/ " + pickerState.pageCount;
        pickerStatusElement.textContent =
          "第 " +
          pickerState.page +
          " / " +
          pickerState.pageCount +
          " 页 · 共 " +
          pickerState.total +
          " 项";
        pickerPrevButtonElement.disabled = pickerState.page <= 1;
        pickerNextButtonElement.disabled = pickerState.page >= pickerState.pageCount;
      } catch (pickerLoadError) {
        if (isPickerClosed || pickerRequestToken !== pickerRequestId) {
          return;
        }
        const pickerErrorElement = document.createElement("div");
        pickerErrorElement.className = "editor-paged-picker-empty error";
        pickerErrorElement.textContent = "加载失败，请稍后重试";
        pickerItemsElement.replaceChildren(pickerErrorElement);
        pickerStatusElement.textContent = "加载失败";
        ctx.handleOperationError(pickerLoadError);
      } finally {
        if (!isPickerClosed && pickerRequestToken === pickerRequestId) {
          pickerItemsElement.removeAttribute("aria-busy");
        }
      }
    }
    pickerCloseButtonElement.addEventListener("click", () => pickerController.close());
    pickerDialogElement.addEventListener("cancel", pickerCancelEvent => {
      pickerCancelEvent.preventDefault();
      pickerController.close();
    });
    pickerDialogElement.addEventListener("click", pickerDialogClickEvent => {
      if (pickerDialogClickEvent.target === pickerDialogElement) {
        pickerController.close();
      }
    });
    pickerDialogElement.addEventListener("close", teardownPickerDialog, {
      once: true
    });
    pickerSearchInputElement.addEventListener("input", () => {
      window.clearTimeout(pickerSearchDebounceId);
      pickerSearchDebounceId = window.setTimeout(() => {
        pickerState.query = pickerSearchInputElement.value.trim();
        pickerState.page = 1;
        loadPickerPage();
      }, 160);
    });
    pickerPrevButtonElement.addEventListener("click", () => {
      if (!(pickerState.page <= 1)) {
        pickerState.page -= 1;
        loadPickerPage();
      }
    });
    pickerNextButtonElement.addEventListener("click", () => {
      if (!(pickerState.page >= pickerState.pageCount)) {
        pickerState.page += 1;
        loadPickerPage();
      }
    });
    pickerPageInputElement.addEventListener("change", () => {
      const pickerPageInputValue = Math.trunc(Number(pickerPageInputElement.value));
      pickerState.page = clampNumber(
        Number.isFinite(pickerPageInputValue) ? pickerPageInputValue : pickerState.page,
        1,
        pickerState.pageCount
      );
      loadPickerPage();
    });
    pickerItemsElement.addEventListener("pointerover", pickerPointerOverEvent => {
      const pickerHoverItemElement = pickerPointerOverEvent.target.closest(
        "[data-editor-picker-value]"
      );
      if (
        !!pickerHoverItemElement &&
        !pickerHoverItemElement.contains(pickerPointerOverEvent.relatedTarget)
      ) {
        onItemHover?.(pickerHoverItemElement.dataset.editorPickerValue, pickerHoverItemElement);
      }
    });
    pickerItemsElement.addEventListener("pointerleave", ctx.hideAssetLargePreview);
    pickerItemsElement.addEventListener("scroll", ctx.hideAssetLargePreview);
    pickerItemsElement.addEventListener("click", pickerItemsClickEvent => {
      const pickerDeleteElement = pickerItemsClickEvent.target.closest("[data-delete-user-asset]");
      if (pickerDeleteElement && onDelete) {
        pickerItemsClickEvent.preventDefault();
        pickerItemsClickEvent.stopPropagation();
        const pickerDeleteAssetId = pickerDeleteElement.dataset.deleteUserAsset;
        pickerController.close();
        onDelete(pickerDeleteAssetId);
        return;
      }
      const pickerValueItemElement = pickerItemsClickEvent.target.closest(
        "[data-editor-picker-value]"
      );
      if (!pickerValueItemElement || !pickerItemsElement.contains(pickerValueItemElement)) {
        return;
      }
      const pickerSelectedItemValue = pickerValueItemElement.dataset.editorPickerValue;
      pickerController.close();
      onSelect(pickerSelectedItemValue);
    });
    pickerSelectedElement.addEventListener("click", pickerSelectedClickEvent => {
      const pickerSelectedActionElement = pickerSelectedClickEvent.target.closest(
        "[data-editor-picker-value]"
      );
      if (
        !pickerSelectedActionElement ||
        !pickerSelectedElement.contains(pickerSelectedActionElement)
      ) {
        return;
      }
      const pickerSelectedActionValue = pickerSelectedActionElement.dataset.editorPickerValue;
      pickerController.close();
      onSelect(pickerSelectedActionValue);
    });
    ctx.activeEditorPicker = pickerController;
    triggerButton?.setAttribute("aria-expanded", "true");
    pickerController.rebuildToolbar();
    pickerDialogElement.showModal();
    loadPickerPage();
    window.requestAnimationFrame(() =>
      pickerSearchInputElement.focus({
        preventScroll: true
      })
    );
    return pickerController;
  }

  /**
   * 以「程序点击」的方式触发某个选择器选项，复用既有的 selectionchange 链路。临时按钮只负责携带 data-* 标识，
   * 点击后立即清空容器，避免在 DOM 里残留一次性节点。
   */
  function selectPickerOption(optionsContainer, datasetKey, datasetValue) {
    const pickerTriggerButton = document.createElement("button");
    pickerTriggerButton.type = "button";
    pickerTriggerButton.dataset[datasetKey] = datasetValue;
    optionsContainer.replaceChildren(pickerTriggerButton);
    pickerTriggerButton.click();
    optionsContainer.replaceChildren();
  }

  /**
   * 打开图标选择器（分页检索 /icons）。五组「触发按钮 → 目标下拉容器」的映射是一次性查表，因为不同控件把选中结果
   * 写回不同元素：四组写 iconName，灯光统计写 lightStatisticsIconName。灯光统计的「当前值」还做了特判：属性里没显式给 icon 时
   * 按默认 mdi:lightbulb-group-outline 展示，避免显示成「不使用图标」。
   */
  function openIconPicker(iconTriggerButton) {
    const iconPickerComponent = ctx.selectedComponent();
    const iconPickerSource = [
      {
        button: ctx.navigationIconButtonElement,
        title: "选择导航图标",
        options: ctx.navigationIconOptionsElement,
        datasetKey: "iconName",
        current: iconPickerComponent?.properties?.icon || "",
        clear: "不使用图标"
      },
      {
        button: ctx.iconButtonEffectIconButtonElement,
        title: "选择效果按钮图标",
        options: ctx.iconButtonEffectIconOptionsElement,
        datasetKey: "iconName",
        current: iconPickerComponent?.properties?.icon || "",
        clear: "不使用图标"
      },
      {
        button: ctx.iconButtonIconButtonElement,
        title: "选择按钮图标",
        options: ctx.iconButtonIconOptionsElement,
        datasetKey: "iconName",
        current: iconPickerComponent?.properties?.icon || "",
        clear: iconPickerComponent?.type === "device-button" ? "跟随实体图标" : "不使用图标"
      },
      {
        button: ctx.titleButtonIconButtonElement,
        title: "选择标题图标",
        options: ctx.titleButtonIconOptionsElement,
        datasetKey: "iconName",
        current: iconPickerComponent?.properties?.icon || "",
        clear: "不使用图标"
      },
      {
        button: ctx.lightStatisticsIconButtonElement,
        title: "选择统计图标",
        options: ctx.lightStatisticsIconOptionsElement,
        datasetKey: "lightStatisticsIconName",
        current: String(
          Object.hasOwn(iconPickerComponent?.properties || {}, "icon")
            ? iconPickerComponent?.properties?.icon || ""
            : "mdi:lightbulb-group-outline"
        ),
        clear: "不使用图标"
      }
    ].find(iconPickerSourceCandidate => iconPickerSourceCandidate.button === iconTriggerButton);
    if (!iconPickerSource) {
      return false;
    }
    openEditorPickerDialog({
      kind: "icon",
      title: iconPickerSource.title,
      searchPlaceholder: "搜索图标名称",
      triggerButton: iconTriggerButton,
      pageSize: EDITOR_PICKER_PAGE_SIZES.icon,
      selectedText: "",
      emptyText: "没有匹配的图标",
      itemClass: "icon-grid",
      async getPage({ query: iconPickerQuery, page: iconPage, pageSize: iconPageSize }) {
        /**
         * 本页在图标全集里的偏移量，服务端按 offset+limit 切片。
         *
         * @type {number}
         */
        const iconPageOffset = (iconPage - 1) * iconPageSize;
        const iconResponse = await ctx.requestJson(
          "/icons?query=" +
            encodeURIComponent(iconPickerQuery) +
            "&limit=" +
            iconPageSize +
            "&offset=" +
            iconPageOffset
        );
        return {
          items: iconResponse.items || [],
          total: Number(iconResponse.total) || 0
        };
      },
      renderLeadingItems: () => [],
      renderSelectedActions: () => [
        Object.assign(document.createElement("span"), {
          className: "editor-paged-picker-current-label",
          textContent: "当前选择"
        }),
        ctx.createEditorPickerCurrentIcon(iconPickerSource.current, iconPickerSource.clear),
        ctx.editorPickerClearAction(iconPickerSource.clear, !iconPickerSource.current)
      ],
      renderItem(iconPickerItem) {
        const iconOptionElement = ctx.createIconPickerOption(
          iconPickerItem,
          iconPickerSource.current,
          "editorPickerValue"
        );
        iconOptionElement.dataset.editorPickerValue = iconPickerItem.name;
        return iconOptionElement;
      },
      onSelect: selectedIconName =>
        selectPickerOption(iconPickerSource.options, iconPickerSource.datasetKey, selectedIconName)
    });
    return true;
  }

  /**
   * 按触发按钮反查组件类型，并打开对应的实体选择器对话框。先判断按钮属于图片还是图标按钮/设备按钮等；其余类型用一个候选类型表
   * 逐个比对 entityPickerConfig(kind).button，因此新增带实体绑定的组件类型只需往那张表里加名字。虚拟实体（图标可见性伪实体）
   * 会被提到首页第一项。实体尚未加载完成时通过 deferUntilEntitiesLoaded 延后重试，并以「选中组件未变」作为回调有效条件。
   */
  function openEntityPicker(entityTriggerButton) {
    const entityPickerComponent = ctx.selectedComponent();
    const entityPickerKind =
      entityTriggerButton === ctx.imageEntityButtonElement
        ? "image"
        : entityTriggerButton === ctx.iconButtonEntityButtonElement &&
            ["icon-button", "device-button", "presence-sensor"].includes(entityPickerComponent?.type)
          ? entityPickerComponent.type
          : [
              "weather",
              "line-chart",
              "title-button",
              "light-statistics",
              "icon-button-effect",
              "vacuum-map",
              "camera",
              "air-conditioner",
              "navigation-button"
            ].find(
              entityPickerKindCandidate =>
                ctx.entityPickerConfig(entityPickerKindCandidate).button === entityTriggerButton
            );
    if (!entityPickerKind) {
      return false;
    }
    const entityPickerComponentId = ctx.selectedComponentId;
    if (
      deferUntilEntitiesLoaded(
        entityTriggerButton,
        () => openEntityPicker(entityTriggerButton),
        () => ctx.selectedComponentId === entityPickerComponentId
      )
    ) {
      return true;
    }
    const entityPickerBoundConfig = ctx.entityPickerConfig(entityPickerKind);
    const entityPickerCurrentEntityId = entityPickerComponent?.bindings?.entity?.entityId || "";
    const entityPickerCurrentEntity =
      ctx.selectableEntities(entityPickerKind).find(
        entityMatch => entityMatch.entityId === entityPickerCurrentEntityId
      ) || null;
    const virtualEntity = ctx.iconVisibilityVirtualEntities()[0] || null;
    const entityPickerInitialIndex = ctx.editorEntityMatches(entityPickerKind, "").findIndex(
      entityPickerCandidate => entityPickerCandidate.entityId === entityPickerCurrentEntityId
    );
    openEditorPickerDialog({
      kind: "entity",
      title: "选择实体",
      subtitle: ctx.editorPickerComponentTypeLabel(entityPickerKind) + " · " + ENTITY_PICKER_HINT,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: entityTriggerButton,
      pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
      initialPage: editorEntityPickerInitialPage(entityPickerInitialIndex, virtualEntity),
      selectedText: entityPickerCurrentEntityId || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: entityQuery, page: entityPage }) {
        const entityMatches = ctx.editorEntityMatches(entityPickerKind, entityQuery);
        return editorEntityPickerPage(entityMatches, entityPage, virtualEntity);
      },
      renderLeadingItems: leadingOptionsState =>
        leadingOptionsState.page === 1 && virtualEntity
          ? [ctx.createEditorEntityPickerOption(virtualEntity, entityPickerCurrentEntityId)]
          : [],
      renderSelectedContent: () => [ctx.createEditorPickerCurrentEntity(entityPickerCurrentEntity)],
      renderSelectedActions: () => [
        ctx.editorPickerClearAction("不使用实体", !entityPickerCurrentEntityId)
      ],
      renderItem: entityItem =>
        ctx.createEditorEntityPickerOption(entityItem, entityPickerCurrentEntityId),
      onSelect: pickedEntityId =>
        selectPickerOption(entityPickerBoundConfig.options, "entityId", pickedEntityId)
    });
    return true;
  }

  /**
   * 打开灯光统计的「选择/替换实体」选择器。候选集只取适宜统计的灯光类实体，并做稳定性排序：支持统计的在前，其次灯域实体，
   * 最后按原始顺序，避免同一批实体每次打开顺序抖动。这里 closeLegacyPickers 传 false，因为灯光统计面板自身就挂在一个下拉里，
   * 关掉旧下拉会把触发按钮一起收起来。
   */
  function openLightStatisticsEntityPicker() {
    if (ctx.selectedComponent()?.type !== "light-statistics") {
      return false;
    }
    const lightStatisticsComponentId = ctx.selectedComponentId;
    if (
      deferUntilEntitiesLoaded(
        ctx.lightStatisticsEntityButtonElement,
        openLightStatisticsEntityPicker,
        () =>
          ctx.selectedComponentId === lightStatisticsComponentId &&
          ctx.selectedComponent()?.type === "light-statistics"
      )
    ) {
      return true;
    }
    /**
     * 过滤并按「可统计性 → 灯域 → 原始顺序」排序灯光统计的候选实体。只保留实体名称或 domain 命中查询词的项（大小写不敏感，中文用 zh-CN 规则）；
     * 索引在排序前先记录下来作为最后一级稳定排序键，避免同一批实体每次打开顺序抖动。
     */
    const filterLightStatisticsEntities = lightStatisticsQuery => {
      const lightStatisticsQueryText = String(lightStatisticsQuery || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return ctx.selectableEntities("light-statistics")
        .map((statisticsEntityRecord, statisticsIndex) => ({
          entity: statisticsEntityRecord,
          index: statisticsIndex,
          support: lightStatisticsEntitySupport(statisticsEntityRecord)
        }))
        .filter(
          ({ entity: statisticsEntry }) =>
            !lightStatisticsQueryText ||
            (ctx.entityOptionLabel(statisticsEntry) + " " + entityDomainOf(statisticsEntry))
              .toLocaleLowerCase("zh-CN")
              .includes(lightStatisticsQueryText)
        )
        .sort(
          (firstStatisticsEntry, secondStatisticsEntry) =>
            Number(secondStatisticsEntry.support.supported) -
              Number(firstStatisticsEntry.support.supported) ||
            +(entityDomainOf(secondStatisticsEntry.entity) === "light") -
              +(entityDomainOf(firstStatisticsEntry.entity) === "light") ||
            firstStatisticsEntry.index - secondStatisticsEntry.index
        )
        .map(({ entity: statisticsMatchedEntity }) => statisticsMatchedEntity);
    };
    const lightStatisticsInitialIndex = filterLightStatisticsEntities("").findIndex(
      lightStatisticsEntityCandidate => lightStatisticsEntityCandidate.entityId === ctx.statisticsEntityId
    );
    const lightStatisticsVirtualEntity = ctx.iconVisibilityVirtualEntities()[0] || null;
    openEditorPickerDialog({
      kind: "entity",
      title: ctx.statisticsReplaceIndex >= 0 ? "选择替换实体" : "添加统计实体",
      subtitle: ENTITY_PICKER_HINT,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: ctx.lightStatisticsEntityButtonElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
      initialPage: editorEntityPickerInitialPage(
        lightStatisticsInitialIndex,
        lightStatisticsVirtualEntity
      ),
      selectedText: ctx.statisticsEntityId || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      closeLegacyPickers: false,
      getPage({ query: statisticsQuery, page: statisticsPage }) {
        const statisticsMatches = filterLightStatisticsEntities(statisticsQuery);
        return editorEntityPickerPage(
          statisticsMatches,
          statisticsPage,
          lightStatisticsVirtualEntity
        );
      },
      renderLeadingItems: statisticsLeadingState =>
        statisticsLeadingState.page === 1 && lightStatisticsVirtualEntity
          ? [ctx.createEditorEntityPickerOption(lightStatisticsVirtualEntity, ctx.statisticsEntityId)]
          : [],
      renderItem: statisticsEntityResult =>
        ctx.createEditorEntityPickerOption(statisticsEntityResult, ctx.statisticsEntityId),
      onSelect: selectedStatisticsEntityId =>
        selectPickerOption(
          ctx.lightStatisticsEntityOptionsElement,
          "lightStatisticsEntityId",
          selectedStatisticsEntityId
        )
    });
    return true;
  }

  /**
   * 打开弹窗动作编辑区的实体选择器（触发按钮由 DOM 关系定位，不用全局引用）。选择结果写回 [data-popup-entity-options] 容器，
   * 走既有的 selectionchange 链路；候选集过滤掉虚拟实体，避免把仅用于图标可见性的伪实体绑进动作。等待实体加载的回调以
   * 「触发节点仍在文档中」为有效条件（弹窗可能已被关闭）。
   */
  function openPopupEntityPicker(popupEntityTrigger) {
    const popupEntityTriggerElement = popupEntityTrigger.closest("[data-action-trigger]");
    const popupEntityValueInput = popupEntityTriggerElement?.querySelector("[data-popup-entity]");
    const popupEntityOptionsElement = popupEntityTriggerElement?.querySelector(
      "[data-popup-entity-options]"
    );
    if (!popupEntityTriggerElement || !popupEntityValueInput || !popupEntityOptionsElement) {
      return false;
    }
    if (
      deferUntilEntitiesLoaded(
        popupEntityTrigger,
        () => openPopupEntityPicker(popupEntityTrigger),
        () => popupEntityTriggerElement.isConnected
      )
    ) {
      return true;
    }
    const popupEntityCurrentId = popupEntityValueInput.value || "";
    const popupEntityCurrent =
      ctx.entities.find(popupEntityCandidate => popupEntityCandidate.entityId === popupEntityCurrentId) ||
      null;
    const popupVirtualEntity = ctx.iconVisibilityVirtualEntities()[0] || null;
    /**
     * 过滤弹窗动作可绑定的实体候选：排除 virtual 实体——它们是「图标可见性」用的伪实体、没有真实状态，绑进动作无法产生任何效果；
     * 空查询返回全部非虚拟实体。
     */
    const filterPopupEntities = popupQuery => {
      const popupQueryText = String(popupQuery || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return ctx.entities.filter(
        popupEntityMatch =>
          !popupEntityMatch.virtual &&
          (!popupQueryText ||
            (ctx.entityOptionLabel(popupEntityMatch) + " " + popupEntityMatch.entityId)
              .toLocaleLowerCase("zh-CN")
              .includes(popupQueryText))
      );
    };
    const popupEntityInitialIndex = filterPopupEntities("").findIndex(
      popupEntityRecord => popupEntityRecord.entityId === popupEntityCurrentId
    );
    openEditorPickerDialog({
      kind: "entity",
      title: "选择弹窗实体",
      subtitle: ENTITY_PICKER_HINT,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: popupEntityTrigger,
      pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
      initialPage: editorEntityPickerInitialPage(popupEntityInitialIndex, popupVirtualEntity),
      selectedText: popupEntityCurrentId || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: popupQueryValue, page: popupPickerPage }) {
        const popupMatches = filterPopupEntities(popupQueryValue);
        return editorEntityPickerPage(popupMatches, popupPickerPage, popupVirtualEntity);
      },
      renderItem: popupEntityItem =>
        ctx.createEditorEntityPickerOption(popupEntityItem, popupEntityCurrentId),
      renderLeadingItems: popupLeadingState =>
        popupLeadingState.page === 1 && popupVirtualEntity
          ? [ctx.createEditorEntityPickerOption(popupVirtualEntity, popupEntityCurrentId)]
          : [],
      renderSelectedContent: () => [ctx.createEditorPickerCurrentEntity(popupEntityCurrent)],
      renderSelectedActions: () => [ctx.editorPickerClearAction("不使用实体", !popupEntityCurrentId)],
      onSelect: selectedPopupEntityId =>
        selectPickerOption(popupEntityOptionsElement, "popupActionEntityId", selectedPopupEntityId)
    });
    return true;
  }

  /**
   * 打开「添加/编辑模块」对话框里的实体选择器。排序会参考当前模块类型做推荐（popupModuleEntityRecommended），
   * 把最可能被选中的实体排到前面；对话框关闭后回调即失效，因此等待实体加载的条件直接绑在弹窗的 open 状态上。
   */
  function openPopupModuleEntityPicker() {
    if (!ctx.popupModuleDialogElement.open) {
      return false;
    }
    if (
      deferUntilEntitiesLoaded(
        ctx.popupModuleEntityButtonElement,
        openPopupModuleEntityPicker,
        () => ctx.popupModuleDialogElement.open
      )
    ) {
      return true;
    }
    const popupModuleEntityValue = ctx.popupModuleFormElement.elements.entityId.value || "";
    const popupModuleCurrentEntity =
      ctx.entities.find(
        popupModuleEntityCandidate => popupModuleEntityCandidate.entityId === popupModuleEntityValue
      ) || null;
    const popupModuleVirtualEntity = ctx.iconVisibilityVirtualEntities()[0] || null;
    /**
     * 过滤并排序「添加/编辑模块」对话框的实体候选：同样排除 virtual 伪实体；用 popupModuleEntityRecommended 按当前模块类型
     * 做推荐度排序（推荐在前），同分时回落原始下标保证顺序稳定。实时读取表单里的 type 值，是为了让用户切换模块类型后
     * 重开选择器就能看到对应的推荐顺序。
     */
    const filterPopupModuleEntities = moduleQuery => {
      const moduleQueryText = String(moduleQuery || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return ctx.entities
        .map((moduleEntityRecord, moduleEntityIndex) => ({
          entity: moduleEntityRecord,
          index: moduleEntityIndex
        }))
        .filter(
          ({ entity: moduleEntityEntry }) =>
            !moduleEntityEntry.virtual &&
            (!moduleQueryText ||
              (ctx.entityOptionLabel(moduleEntityEntry) + " " + moduleEntityEntry.entityId)
                .toLocaleLowerCase("zh-CN")
                .includes(moduleQueryText))
        )
        .sort(
          (firstModuleEntity, secondModuleEntity) =>
            Number(
              popupModuleEntityRecommended(
                secondModuleEntity.entity,
                ctx.popupModuleFormElement.elements.type.value
              )
            ) -
              Number(
                popupModuleEntityRecommended(
                  firstModuleEntity.entity,
                  ctx.popupModuleFormElement.elements.type.value
                )
              ) || firstModuleEntity.index - secondModuleEntity.index
        )
        .map(({ entity: moduleEntityItem }) => moduleEntityItem);
    };
    const moduleEntityInitialIndex = filterPopupModuleEntities("").findIndex(
      moduleEntityLookup => moduleEntityLookup.entityId === popupModuleEntityValue
    );
    openEditorPickerDialog({
      kind: "entity",
      title: "选择模块实体",
      subtitle: ENTITY_PICKER_HINT,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: ctx.popupModuleEntityButtonElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
      initialPage: editorEntityPickerInitialPage(moduleEntityInitialIndex, popupModuleVirtualEntity),
      selectedText: popupModuleEntityValue || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: moduleQueryValue, page: modulePage }) {
        const moduleEntityMatches = filterPopupModuleEntities(moduleQueryValue);
        return editorEntityPickerPage(moduleEntityMatches, modulePage, popupModuleVirtualEntity);
      },
      renderItem: moduleEntityResult =>
        ctx.createEditorEntityPickerOption(moduleEntityResult, popupModuleEntityValue),
      renderLeadingItems: moduleLeadingState =>
        moduleLeadingState.page === 1 && popupModuleVirtualEntity
          ? [ctx.createEditorEntityPickerOption(popupModuleVirtualEntity, popupModuleEntityValue)]
          : [],
      renderSelectedContent: () => [ctx.createEditorPickerCurrentEntity(popupModuleCurrentEntity)],
      renderSelectedActions: () => [ctx.editorPickerClearAction("不使用实体", !popupModuleEntityValue)],
      onSelect: selectedModuleEntityId =>
        selectPickerOption(
          ctx.popupModuleEntityOptionsElement,
          "popupModuleEntityId",
          selectedModuleEntityId
        )
    });
    return true;
  }

  /**
   * 给某类控件的「实体选择」下拉按钮绑定开合、搜索与选中逻辑；用 pickerComponentTypes 决定当前生效的配置（一个按钮
   * 可能服务 icon-button / device-button / presence-sensor 多种类型）。选中实体后维护引用完整性：清空实体时删掉
   * bindings.entity 并清掉依赖该实体的动作；导航按钮若因此丢了 tap 动作会补一个跳转到有效页面的 navigate，天气固定绑定 sun.sun。
   */
  function bindEntityPicker(bindPickerKind, pickerComponentTypes = [bindPickerKind]) {
    const boundPickerConfig = ctx.entityPickerConfig(bindPickerKind);
    boundPickerConfig.button.addEventListener("click", () => {
      const activePickerKind = pickerComponentTypes.includes(ctx.selectedComponent()?.type)
        ? ctx.selectedComponent().type
        : bindPickerKind;
      const currentPickerConfig = ctx.entityPickerConfig(activePickerKind);
      const isPickerMenuHidden = boundPickerConfig.menu.hidden;
      ctx.closeAllDropdownMenus(isPickerMenuHidden ? currentPickerConfig.except : null);
      boundPickerConfig.menu.hidden = !isPickerMenuHidden;
      boundPickerConfig.button.setAttribute("aria-expanded", String(isPickerMenuHidden));
      if (isPickerMenuHidden) {
        ctx.renderEntityPickerOptions(boundPickerConfig.search.value, activePickerKind);
        ctx.positionEntityPickerMenu(activePickerKind);
        window.requestAnimationFrame(() => {
          ctx.positionEntityPickerMenu(activePickerKind);
          boundPickerConfig.search.focus({
            preventScroll: true
          });
        });
      }
    });
    boundPickerConfig.search.addEventListener("input", () => {
      const inputPickerKind = pickerComponentTypes.includes(ctx.selectedComponent()?.type)
        ? ctx.selectedComponent().type
        : bindPickerKind;
      ctx.renderEntityPickerOptions(boundPickerConfig.search.value, inputPickerKind);
    });
    boundPickerConfig.options.addEventListener("click", pickerOptionClickEvent => {
      const pickerOptionElement = pickerOptionClickEvent.target.closest("[data-entity-id]");
      const pickerComponentId = ctx.selectedComponentId;
      if (!pickerOptionElement || !pickerComponentId) {
        return;
      }
      const pickerEntityId = pickerOptionElement.dataset.entityId;
      ctx.closeAllDropdownMenus();
      ctx.mutateDocument(pickerDraftDocument => {
        const pickerComponent = findComponent(pickerDraftDocument, pickerComponentId)?.component;
        if (!pickerComponent || !pickerComponentTypes.includes(pickerComponent.type)) {
          return;
        }
        const pickerPreviousEntityId = String(pickerComponent.bindings?.entity?.entityId || "");
        pickerComponent.bindings = {
          ...(pickerComponent.bindings || {})
        };
        pickerComponent.actions = {
          ...(pickerComponent.actions || {})
        };
        if (pickerEntityId) {
          pickerComponent.bindings.entity = {
            entityId: pickerEntityId
          };
          if (pickerComponent.type === "light-statistics") {
            for (const entityActionKey of ["tap", "doubleTap", "hold"]) {
              const entityActionValue = pickerComponent.actions?.[entityActionKey];
              if (
                (entityActionValue?.type === "toggle" && !entityIdSupportsToggle(pickerEntityId)) ||
                (entityActionValue && !ACTION_TYPES.includes(entityActionValue.type))
              ) {
                delete pickerComponent.actions[entityActionKey];
              }
            }
          }
          if (
            pickerComponent.type === "air-conditioner" &&
            !Object.keys(pickerComponent.actions || {}).length
          ) {
            pickerComponent.actions = {
              tap: {
                type: "more-info"
              },
              doubleTap: {
                type: "toggle"
              }
            };
          }
        } else {
          delete pickerComponent.bindings.entity;
          if (pickerComponent.type === "light-statistics") {
            pickerComponent.actions = Object.fromEntries(
              Object.entries(pickerComponent.actions || {}).filter(
                ([, actionEntry]) => !actionNeedsCurrentEntity(actionEntry)
              )
            );
          }
          let needsTapAction = false;
          for (const cleanupActionKey of ["tap", "doubleTap", "hold"]) {
            if (actionNeedsCurrentEntity(pickerComponent.actions?.[cleanupActionKey])) {
              delete pickerComponent.actions[cleanupActionKey];
              needsTapAction = true;
            }
          }
          if (
            pickerComponent.type === "navigation-button" &&
            needsTapAction &&
            !pickerComponent.actions.tap
          ) {
            const navigationTargetPage = new Set(
              pickerDraftDocument.pages.map(pagePathCandidate => pagePathCandidate.path)
            ).has(pickerComponent.properties?.targetPage)
              ? pickerComponent.properties.targetPage
              : ctx.pageSelectElement.value || pickerDraftDocument.pages[0]?.path || "";
            if (navigationTargetPage) {
              pickerComponent.actions.tap = {
                type: "navigate",
                target: navigationTargetPage
              };
            }
          }
        }
        if (bindPickerKind === "weather") {
          const sunEntityId = ctx.entities.find(
            pickableEntity => pickableEntity.entityId === "sun.sun"
          )?.entityId;
          if (sunEntityId) {
            pickerComponent.bindings.sun = {
              entityId: sunEntityId
            };
          } else {
            delete pickerComponent.bindings.sun;
          }
        }
        if (pickerEntityId !== pickerPreviousEntityId) {
          pickerComponent.properties = {
            ...(pickerComponent.properties || {})
          };
          if (pickerComponent.type === "light-statistics") {
            delete pickerComponent.properties.relatedEntities;
            return;
          }
          if (
            pickerEntityId
              ? relatedPopupContext(pickerComponent, ctx.entitiesByEntityId(), ctx.devicesByDeviceId())
              : null
          ) {
            pickerComponent.properties.relatedEntities = manualRelatedEntityConfig([]);
          } else {
            delete pickerComponent.properties.relatedEntities;
          }
        }
      });
    });
  }

  const ENTITY_PICKER_HINT = "推荐去 HA 复制实体 ID，粘贴搜索。可精准选择。";

  const { deferUntilEntitiesLoaded: deferUntilEntitiesLoaded } = createEditorPickerLifecycle({
    getEntitiesLoaded: () => ctx.areEntitiesLoaded,
    getEntityLoadPromise: () => ctx.entitiesLoadPromise,
    loadEntities: ctx.ensureEntitiesLoaded,
    reportError: ctx.handleOperationError
  });

  return { ENTITY_PICKER_HINT, bindEntityPicker, closeActiveEditorPicker, deferUntilEntitiesLoaded, openEditorPickerDialog, openEntityPicker, openIconPicker, openLightStatisticsEntityPicker, openPopupEntityPicker, openPopupModuleEntityPicker, selectPickerOption };
}
