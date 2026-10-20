

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
interface TitleButtonMenuDeps {
  customSelectsBySelectElement: any;
  imageAssetFolderSelectElement: any;
  ibeAssetFolderElement: any;
  imageAssetFolder: any;
  effectAssetFolder: any;
  canDeleteAssetFolder: any;
  runState: any;
  runConfig: any;
  errorPhase: any;
  value: any;
  openCustomSelect: any;
  runCopyLast: any;
  runOuter: any;
  effectVariantUrlState: any;
  requestJson: any;
  ICON_PAGE_SIZE: any;
  createIconPickerClearOptionState: any;
}

export function loadNavigationIconOptionsCore(deps: TitleButtonMenuDeps, loadTitleButtonIconOptionsElement: any) {
  const pickLightStatisticsEntity = deps.customSelectsBySelectElement.get(
    loadTitleButtonIconOptionsElement,
  );
  if (!pickLightStatisticsEntity) return;
  const element = loadTitleButtonIconOptionsElement.selectedOptions[0],
    popupEntityDisplayName =
      loadTitleButtonIconOptionsElement.id === "page-select" &&
      element?.dataset.defaultPage === "true";
  ((pickLightStatisticsEntity.button.textContent = popupEntityDisplayName
    ? "★ " + element.textContent
    : element?.textContent ||
      (loadTitleButtonIconOptionsElement.id === "project-select"
        ? "暂无仪表盘"
        : loadTitleButtonIconOptionsElement.id === "popup-select"
          ? "暂无组合弹窗"
          : loadTitleButtonIconOptionsElement.id === "image-asset-folder"
            ? "暂无图片文件夹"
            : "暂无页面")),
    (pickLightStatisticsEntity.button.disabled = loadTitleButtonIconOptionsElement.disabled));
  const positionEntityPickerMenu =
      loadTitleButtonIconOptionsElement === deps.imageAssetFolderSelectElement
        ? "image"
        : loadTitleButtonIconOptionsElement === deps.ibeAssetFolderElement
          ? "ibe"
          : "",
    Zt2 =
      positionEntityPickerMenu === "image"
        ? deps.imageAssetFolder
        : positionEntityPickerMenu === "ibe"
          ? deps.effectAssetFolder
          : "";
  (pickLightStatisticsEntity.menu.replaceChildren(
    ...[...loadTitleButtonIconOptionsElement.options].map((positionIconButtonEffectIconMenu) => {
      const positionIconButtonIconMenu = document.createElement("button");
      if (
        ((positionIconButtonIconMenu.type = "button"),
        (positionIconButtonIconMenu.className = "custom-select-option"),
        (positionIconButtonIconMenu.dataset.value = positionIconButtonEffectIconMenu.value),
        loadTitleButtonIconOptionsElement.id === "page-select" &&
          positionIconButtonEffectIconMenu.dataset.defaultPage === "true")
      ) {
        const positionImagePickerMenu = document.createElement("span");
        ((positionImagePickerMenu.className = "custom-select-default-marker"),
          (positionImagePickerMenu.textContent = "★"),
          positionImagePickerMenu.setAttribute("aria-hidden", "true"));
        const positionLightStatisticsEntityMenu = document.createElement("span");
        ((positionLightStatisticsEntityMenu.textContent =
          positionIconButtonEffectIconMenu.textContent),
          positionIconButtonIconMenu.append(
            positionImagePickerMenu,
            positionLightStatisticsEntityMenu,
          ));
      } else positionIconButtonIconMenu.textContent = positionIconButtonEffectIconMenu.textContent;
      if (
        (positionIconButtonIconMenu.classList.toggle(
          "active",
          positionIconButtonEffectIconMenu.value === loadTitleButtonIconOptionsElement.value,
        ),
        (positionIconButtonIconMenu.disabled = positionIconButtonEffectIconMenu.disabled),
        !positionEntityPickerMenu ||
          !deps.canDeleteAssetFolder(Zt2, positionIconButtonEffectIconMenu.value))
      )
        return positionIconButtonIconMenu;
      const positionLightStatisticsIconMenu = document.createElement("div");
      positionLightStatisticsIconMenu.className = "custom-select-option-row";
      const positionNavigationIconMenu = document.createElement("button");
      return (
        (positionNavigationIconMenu.type = "button"),
        (positionNavigationIconMenu.className = "custom-select-option-delete"),
        (positionNavigationIconMenu.dataset.deleteStudio3dFolder =
          positionIconButtonEffectIconMenu.value),
        (positionNavigationIconMenu.dataset.assetFolderKind = positionEntityPickerMenu),
        (positionNavigationIconMenu.title = "删除 " + positionIconButtonEffectIconMenu.textContent),
        positionNavigationIconMenu.setAttribute(
          "aria-label",
          "删除自动导图文件夹 " + positionIconButtonEffectIconMenu.textContent,
        ),
        (positionNavigationIconMenu.textContent = "×"),
        positionLightStatisticsIconMenu.append(
          positionIconButtonIconMenu,
          positionNavigationIconMenu,
        ),
        positionLightStatisticsIconMenu
      );
    }),
  ),
    loadTitleButtonIconOptionsElement.disabled
      ? deps.runState(pickLightStatisticsEntity)
      : pickLightStatisticsEntity.menu.hidden ||
        window.requestAnimationFrame(() => deps.runConfig(pickLightStatisticsEntity)));
}

export function positionTitleButtonIconMenuCore(deps: TitleButtonMenuDeps, registerOverflowPreviewRow: any) {
  if (
    !registerOverflowPreviewRow ||
    deps.customSelectsBySelectElement.has(registerOverflowPreviewRow) ||
    registerOverflowPreviewRow.dataset.nativeSelect === "true"
  )
    return;
  const removeLightStatisticsEntityElement = document.createElement("span");
  ((removeLightStatisticsEntityElement.className = "custom-select"),
    registerOverflowPreviewRow.before(removeLightStatisticsEntityElement),
    removeLightStatisticsEntityElement.append(registerOverflowPreviewRow),
    registerOverflowPreviewRow.classList.add("native-select-control"));
  const renderEntityPickerOptionsElement = document.createElement("button");
  ((renderEntityPickerOptionsElement.type = "button"),
    (renderEntityPickerOptionsElement.className = "custom-select-button"),
    renderEntityPickerOptionsElement.setAttribute(
      "aria-label",
      registerOverflowPreviewRow.getAttribute("aria-label") || "打开选择菜单",
    ),
    renderEntityPickerOptionsElement.setAttribute("aria-haspopup", "listbox"),
    renderEntityPickerOptionsElement.setAttribute("aria-expanded", "false"),
    removeLightStatisticsEntityElement.append(renderEntityPickerOptionsElement));
  const renderLightStatisticsEntitiesElement = document.createElement("div");
  ((renderLightStatisticsEntitiesElement.className = "custom-select-menu"),
    (renderLightStatisticsEntitiesElement.dataset.selectId = registerOverflowPreviewRow.id),
    renderLightStatisticsEntitiesElement.setAttribute("role", "listbox"),
    (renderLightStatisticsEntitiesElement.hidden = true),
    (registerOverflowPreviewRow.closest("dialog") || document.body).append(
      renderLightStatisticsEntitiesElement,
    ));
  const options: {
    select: HTMLElement;
    wrapper: HTMLElement;
    button: HTMLElement;
    menu: HTMLElement;
    observer?: MutationObserver;
  } = {
    select: registerOverflowPreviewRow,
    wrapper: removeLightStatisticsEntityElement,
    button: renderEntityPickerOptionsElement,
    menu: renderLightStatisticsEntitiesElement,
  };
  (deps.customSelectsBySelectElement.set(registerOverflowPreviewRow, options),
    loadNavigationIconOptionsCore(deps, registerOverflowPreviewRow),
    renderEntityPickerOptionsElement.addEventListener("click", () => {
      const hidden = renderLightStatisticsEntitiesElement.hidden;
      (deps.runState(),
        deps.errorPhase(),
        deps.value(),
        hidden &&
          (loadNavigationIconOptionsCore(deps, registerOverflowPreviewRow),
          (renderLightStatisticsEntitiesElement.hidden = false),
          renderEntityPickerOptionsElement.setAttribute("aria-expanded", "true"),
          (deps.openCustomSelect = options),
          window.requestAnimationFrame(() => deps.runConfig(options))));
    }),
    renderLightStatisticsEntitiesElement.addEventListener(
      "click",
      (renderLightStatisticsEntityOptions) => {
        const closest = (renderLightStatisticsEntityOptions.target as Element).closest<HTMLElement>(
          "[data-delete-studio3d-folder]",
        );
        if (closest) {
          (renderLightStatisticsEntityOptions.preventDefault(),
            renderLightStatisticsEntityOptions.stopPropagation(),
            deps.runCopyLast(closest.dataset.assetFolderKind, closest.dataset.deleteStudio3dFolder));
          return;
        }
        const renderPopupModuleEntityOptionsElement =
          (renderLightStatisticsEntityOptions.target as Element).closest<HTMLButtonElement>(".custom-select-option");
        if (
          !renderPopupModuleEntityOptionsElement ||
          renderPopupModuleEntityOptionsElement.disabled
        )
          return;
        const resetLightStatisticsPicker = registerOverflowPreviewRow.value;
        ((registerOverflowPreviewRow.value = renderPopupModuleEntityOptionsElement.dataset.value),
          loadNavigationIconOptionsCore(deps, registerOverflowPreviewRow),
          deps.runState(options),
          registerOverflowPreviewRow.value !== resetLightStatisticsPicker &&
            registerOverflowPreviewRow.dispatchEvent(
              new Event("change", {
                bubbles: true,
              }),
            ));
      },
    ),
    registerOverflowPreviewRow.addEventListener("change", () =>
      loadNavigationIconOptionsCore(deps, registerOverflowPreviewRow),
    ),
    (options.observer = new MutationObserver(() =>
      loadNavigationIconOptionsCore(deps, registerOverflowPreviewRow),
    )),
    options.observer.observe(registerOverflowPreviewRow, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "label", "selected"],
    }));
}

export function stopHoverScrollCore(deps: TitleButtonMenuDeps, syncEntityPickerValue: any) {
  (positionTitleButtonIconMenuCore(deps, syncEntityPickerValue), (syncEntityPickerValue.tabIndex = -1));
  const syncCustomSelect = deps.customSelectsBySelectElement.get(syncEntityPickerValue),
    { button: syncPopupModuleDeviceTypeElement, menu: syncPopupModuleEntityButton } =
      syncCustomSelect;
  return {
    sync: () => loadNavigationIconOptionsCore(deps, syncEntityPickerValue),
    keydown(bindEntityPicker: any) {
      if (bindEntityPicker.key === "Escape" && !syncPopupModuleEntityButton.hidden)
        return (
          bindEntityPicker.preventDefault(),
          deps.runState(syncCustomSelect),
          syncPopupModuleDeviceTypeElement.focus(),
          true
        );
      const contains = syncPopupModuleDeviceTypeElement.contains(bindEntityPicker.target),
        contains2 = syncPopupModuleEntityButton.contains(bindEntityPicker.target);
      if (
        !(contains || contains2) ||
        !["ArrowDown", "ArrowUp", "Home", "End"].includes(bindEntityPicker.key)
      )
        return false;
      (bindEntityPicker.preventDefault(),
        syncPopupModuleEntityButton.hidden && syncPopupModuleDeviceTypeElement.click());
      const list = [
        ...syncPopupModuleEntityButton.querySelectorAll(".custom-select-option:not(:disabled)"),
      ];
      let indexOf = list.indexOf(document.activeElement);
      return (
        bindEntityPicker.key === "Home"
          ? (indexOf = 0)
          : bindEntityPicker.key === "End"
            ? (indexOf = list.length - 1)
            : contains
              ? (indexOf = Math.max(
                  0,
                  list.findIndex((openEditorPickerDialog) =>
                    openEditorPickerDialog.classList.contains("active"),
                  ),
                ))
              : (indexOf =
                  (indexOf + (bindEntityPicker.key === "ArrowDown" ? 1 : -1) + list.length) %
                  list.length),
        list[indexOf]?.focus(),
        true
      );
    },
    destroy() {
      (deps.runState(syncCustomSelect),
        syncCustomSelect.observer.disconnect(),
        syncPopupModuleEntityButton.remove(),
        deps.customSelectsBySelectElement.delete(syncEntityPickerValue));
    },
  };
}

export async function iconTooltipElementValueCore(deps: TitleButtonMenuDeps, {
  optionsElement: iconTooltipElementCard,
  query: iconTooltipElementConfig = "",
  currentIcon: iconTooltipElementRef = "",
  clearLabel: iconTooltipElementEntry = "不使用图标",
  datasetKey: iconTooltipElementRecord = "iconName",
  append: iconTooltipElementName = false,
}: any) {
  const iconTooltipElementKey = String(iconTooltipElementConfig || "").trim(),
    sL2 = deps.runOuter(iconTooltipElementCard);
  if (!iconTooltipElementName || sL2.query !== iconTooltipElementKey) {
    ((sL2.query = iconTooltipElementKey),
      (sL2.offset = 0),
      (sL2.total = 0),
      (sL2.loading = false),
      (sL2.complete = false),
      (sL2.generation += 1));
    const iconTooltipElementBar = document.createElement("div");
    ((iconTooltipElementBar.className = "navigation-icon-load-state"),
      (iconTooltipElementBar.textContent = "正在加载图标…"),
      iconTooltipElementCard.replaceChildren(
        deps.effectVariantUrlState(
          iconTooltipElementRef,
          iconTooltipElementEntry,
          iconTooltipElementRecord,
        ),
        iconTooltipElementBar,
      ),
      (iconTooltipElementCard.scrollTop = 0));
  }
  if (sL2.loading || sL2.complete) return;
  const generation = sL2.generation,
    iconTooltipElementPath = iconTooltipElementCard.querySelector(".navigation-icon-load-state");
  ((sL2.loading = true),
    iconTooltipElementPath &&
      (iconTooltipElementPath.textContent = sL2.offset ? "正在加载更多图标…" : "正在加载图标…"));
  try {
    const iconTooltipElementText = await deps.requestJson(
      "/icons?query=" +
        encodeURIComponent(sL2.query) +
        "&limit=" +
        deps.ICON_PAGE_SIZE +
        "&offset=" +
        sL2.offset,
    );
    if (generation !== sL2.generation) return;
    const availableItems = iconTooltipElementText.items || [],
      mappedItemsIndex = availableItems.map((mappedItemsTotal: any) =>
        deps.createIconPickerClearOptionState(
          mappedItemsTotal,
          iconTooltipElementRef,
          iconTooltipElementRecord,
        ),
      );
    (iconTooltipElementPath &&
      mappedItemsIndex.length &&
      iconTooltipElementPath.before(...mappedItemsIndex),
      (sL2.offset += availableItems.length),
      (sL2.total = Math.max(Number(iconTooltipElementText.total) || 0, sL2.offset)),
      (sL2.complete = !availableItems.length || sL2.offset >= sL2.total),
      (sL2.loading = false),
      iconTooltipElementPath &&
        (iconTooltipElementPath.textContent = sL2.total
          ? sL2.complete
            ? "已显示全部 " + sL2.total + " 个图标"
            : "已加载 " + sL2.offset + " / " + sL2.total + " · 继续向下滚动"
          : "没有匹配的图标"));
  } catch (caughtErrorState: any) {
    throw (
      generation === sL2.generation &&
        ((sL2.loading = false),
        iconTooltipElementPath &&
          (iconTooltipElementPath.textContent = "图标加载失败，请稍后重试")),
      caughtErrorState
    );
  }
}
