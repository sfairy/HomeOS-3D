/*
 * 表单控件增强。
 *
 * 原生 select 的自定义下拉包装、下拉菜单的定位与关闭，以及数字输入框的步进与按住连发。
 *
 * 由 static/editor/home.js 外提而来：这里只放函数，对 home.js 模块级状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 home.js 里的 getter/setter，读到的始终是调用时刻的值。
 */

import { capturePointer } from "../../utils/pointer-capture.js?v=2609260929";
import { positionFloatingMenu } from "../../shared/menu-positioning.js?v=2609260929";
import { stepNumberInput } from "../../shared/number-input-stepper.js?v=2609260929";

export function createFormWidgets(ctx) {

  /**
   * 把原生 select 原地包装成自定义下拉，保留原生元素作 value 真相源与 change 事件来源。
   * 只把可交互外观换成自建按钮 + 菜单：原生弹层在部分内核不受 CSS 控制、也无法显示「★ 默认页」标记。
   * 菜单挂到最近的 dialog 或 body 上，否则会被弹窗 overflow 裁掉；已有记录的元素直接跳过（幂等）。
   */
  function enhanceNativeSelect(nativeSelect) {
    if (
      !nativeSelect ||
      ctx.customSelectsBySelectElement.has(nativeSelect) ||
      nativeSelect.dataset.nativeSelect === "true"
    ) {
      return;
    }
    const selectWrapperElement = document.createElement("span");
    selectWrapperElement.className = "custom-select";
    nativeSelect.before(selectWrapperElement);
    selectWrapperElement.append(nativeSelect);
    nativeSelect.classList.add("native-select-control");
    const selectButtonElement = document.createElement("button");
    selectButtonElement.type = "button";
    selectButtonElement.className = "custom-select-button";
    selectButtonElement.setAttribute(
      "aria-label",
      nativeSelect.getAttribute("aria-label") || "打开选择菜单"
    );
    selectButtonElement.setAttribute("aria-haspopup", "listbox");
    selectButtonElement.setAttribute("aria-expanded", "false");
    selectWrapperElement.append(selectButtonElement);
    const selectMenuElement = document.createElement("div");
    selectMenuElement.className = "custom-select-menu";
    selectMenuElement.dataset.selectId = nativeSelect.id;
    selectMenuElement.setAttribute("role", "listbox");
    selectMenuElement.hidden = true;
    (nativeSelect.closest("dialog") || document.body).append(selectMenuElement);
    const customSelectRecordEntry = {
      select: nativeSelect,
      wrapper: selectWrapperElement,
      button: selectButtonElement,
      menu: selectMenuElement
    };
    ctx.customSelectsBySelectElement.set(nativeSelect, customSelectRecordEntry);
    syncCustomSelect(nativeSelect);
    selectButtonElement.addEventListener("click", () => {
      const wasMenuHidden = selectMenuElement.hidden;
      closeCustomSelectMenu();
      closeProjectActionsMenu();
      closePageActionsMenu();
      if (wasMenuHidden) {
        syncCustomSelect(nativeSelect);
        selectMenuElement.hidden = false;
        selectButtonElement.setAttribute("aria-expanded", "true");
        ctx.openCustomSelect = customSelectRecordEntry;
        window.requestAnimationFrame(() => positionCustomSelectMenu(customSelectRecordEntry));
      }
    });
    selectMenuElement.addEventListener("click", menuClickEvent => {
      const folderDeleteButtonElement = menuClickEvent.target.closest(
        "[data-delete-studio3d-folder]"
      );
      if (folderDeleteButtonElement) {
        menuClickEvent.preventDefault();
        menuClickEvent.stopPropagation();
        ctx.requestDeleteAssetFolder(
          folderDeleteButtonElement.dataset.assetFolderKind,
          folderDeleteButtonElement.dataset.deleteStudio3dFolder
        );
        return;
      }
      const clickedOptionButtonElement = menuClickEvent.target.closest(".custom-select-option");
      if (!clickedOptionButtonElement || clickedOptionButtonElement.disabled) {
        return;
      }
      const previousSelectValue = nativeSelect.value;
      nativeSelect.value = clickedOptionButtonElement.dataset.value;
      syncCustomSelect(nativeSelect);
      closeCustomSelectMenu(customSelectRecordEntry);
      if (nativeSelect.value !== previousSelectValue) {
        nativeSelect.dispatchEvent(
          new Event("change", {
            bubbles: true
          })
        );
      }
    });
    nativeSelect.addEventListener("change", () => syncCustomSelect(nativeSelect));
    new MutationObserver(() => syncCustomSelect(nativeSelect)).observe(nativeSelect, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "label", "selected"]
    });
  }

  /**
   * 批量增强某个子树（默认整页）里的原生 select。
   */
  function enhanceNativeSelectsIn(selectRootNode = document) {
    if (selectRootNode instanceof HTMLSelectElement) {
      enhanceNativeSelect(selectRootNode);
    }
    selectRootNode
      .querySelectorAll?.("select")
      .forEach(nativeSelectItem => enhanceNativeSelect(nativeSelectItem));
  }

  /**
   * 把原生 select 的选项镜像成自建菜单，并同步按钮文案与禁用态。
   * 原生 select 没有占位选项，列表为空时按钮会空白，故按 id 逐个给出中文空态文案；
   * 素材文件夹下拉额外允许删除用户文件夹，删除按钮只在 canDeleteAssetFolder 通过时挂上。
   */
  function syncCustomSelect(selectElement) {
    const customSelectForSelect = ctx.customSelectsBySelectElement.get(selectElement);
    if (!customSelectForSelect) {
      return;
    }
    const selectedNativeOption = selectElement.selectedOptions[0];
    const isDefaultPageNativeOption =
      selectElement.id === "page-select" && selectedNativeOption?.dataset.defaultPage === "true";
    customSelectForSelect.button.textContent = isDefaultPageNativeOption
      ? "★ " + selectedNativeOption.textContent
      : selectedNativeOption?.textContent ||
        (selectElement.id === "project-select"
          ? "暂无仪表盘"
          : selectElement.id === "popup-select"
            ? "暂无组合弹窗"
            : selectElement.id === "image-asset-folder"
              ? "暂无图片文件夹"
              : "暂无页面");
    customSelectForSelect.button.disabled = selectElement.disabled;
    const assetFolderKind =
      selectElement === ctx.imageAssetFolderSelectElement
        ? "image"
        : selectElement === ctx.iconButtonEffectAssetFolderSelectElement
          ? "ibe"
          : "";
    customSelectForSelect.menu.replaceChildren(
      ...[...selectElement.options].map(nativeOption => {
        const optionButtonElement = document.createElement("button");
        optionButtonElement.type = "button";
        optionButtonElement.className = "custom-select-option";
        optionButtonElement.dataset.value = nativeOption.value;
        if (selectElement.id === "page-select" && nativeOption.dataset.defaultPage === "true") {
          const defaultPageMarkerElement = document.createElement("span");
          defaultPageMarkerElement.className = "custom-select-default-marker";
          defaultPageMarkerElement.textContent = "★";
          defaultPageMarkerElement.setAttribute("aria-hidden", "true");
          const optionLabelTextElement = document.createElement("span");
          optionLabelTextElement.textContent = nativeOption.textContent;
          optionButtonElement.append(defaultPageMarkerElement, optionLabelTextElement);
        } else {
          optionButtonElement.textContent = nativeOption.textContent;
        }
        optionButtonElement.classList.toggle("active", nativeOption.value === selectElement.value);
        optionButtonElement.disabled = nativeOption.disabled;
        if (!assetFolderKind || !ctx.canDeleteAssetFolder("user", nativeOption.value)) {
          return optionButtonElement;
        }
        const optionRowElement = document.createElement("div");
        optionRowElement.className = "custom-select-option-row";
        const optionDeleteButtonElement = document.createElement("button");
        optionDeleteButtonElement.type = "button";
        optionDeleteButtonElement.className = "custom-select-option-delete";
        optionDeleteButtonElement.dataset.deleteStudio3dFolder = nativeOption.value;
        optionDeleteButtonElement.dataset.assetFolderKind = assetFolderKind;
        optionDeleteButtonElement.title = "删除 " + nativeOption.textContent;
        optionDeleteButtonElement.setAttribute(
          "aria-label",
          "删除自动导图文件夹 " + nativeOption.textContent
        );
        optionDeleteButtonElement.textContent = "×";
        optionRowElement.append(optionButtonElement, optionDeleteButtonElement);
        return optionRowElement;
      })
    );
    if (selectElement.disabled) {
      closeCustomSelectMenu(customSelectForSelect);
    } else if (!customSelectForSelect.menu.hidden) {
      window.requestAnimationFrame(() => positionCustomSelectMenu(customSelectForSelect));
    }
  }

  /**
   * 把自建下拉菜单摆到触发按钮下方或上方。
   * 与图标下拉不同：间距 4px、高度按内容（scrollHeight）取并钳在 80~320，
   * 翻转也看内容高而不是可用空间 —— 内容不多时下方空间小也能原样放下。
   */
  function positionCustomSelectMenu(openSelectRecord) {
    positionFloatingMenu({
      anchorElement: openSelectRecord.button,
      menuElement: openSelectRecord.menu,
      heightMode: "content",
      gapPx: 4,
      contentHeightCapPx: 320,
      contentHeightFloorPx: 80
    });
  }

  /**
   * 收起自建下拉菜单；不传参时按「当前打开的那一个」处理。
   */
  function closeCustomSelectMenu(customSelectRecord = ctx.openCustomSelect) {
    if (customSelectRecord) {
      customSelectRecord.menu.hidden = true;
      customSelectRecord.button.setAttribute("aria-expanded", "false");
      if (ctx.openCustomSelect === customSelectRecord) {
        ctx.openCustomSelect = null;
      }
    }
  }

  /**
   * 收起仪表盘操作菜单；三个操作菜单互相排斥，打开任意一个前都要先全部收起。
   */
  function closeProjectActionsMenu() {
    ctx.projectActionsMenuElement.hidden = true;
    ctx.projectActionsButtonElement.setAttribute("aria-expanded", "false");
  }

  /**
   * 收起页面操作菜单。
   */
  function closePageActionsMenu() {
    ctx.pageActionsMenuElement.hidden = true;
    ctx.pageActionsButtonElement.setAttribute("aria-expanded", "false");
  }

  /**
   * 收起组合弹窗操作菜单，并顺带清掉当前编辑的弹窗模块归属。
   */
  function closePopupActionsMenu() {
    ctx.popupActionsMenuElement.hidden = true;
    ctx.popupActionsButtonElement.setAttribute("aria-expanded", "false");
    ctx.moduleDialogPopupId = null;
  }

  /**
   * 关闭一个下拉菜单并复位其触发按钮的展开状态。图片素材与图标按钮效果素材这两个菜单额外挂着大图预览
   * 和分组下拉，必须一并收起，否则会出现「菜单关了预览还浮着」的残影。
   */
  function closeDropdownMenu(dropdownMenuElement, dropdownButtonElement) {
    dropdownMenuElement.hidden = true;
    dropdownButtonElement.setAttribute("aria-expanded", "false");
    if (dropdownMenuElement === ctx.imageAssetMenuElement) {
      ctx.hideAssetLargePreview();
      closeCustomSelectMenu(ctx.customSelectsBySelectElement.get(ctx.imageAssetFolderSelectElement));
    }
    if (dropdownMenuElement === ctx.iconButtonEffectAssetMenuElement) {
      ctx.hideAssetLargePreview();
      closeCustomSelectMenu(
        ctx.customSelectsBySelectElement.get(ctx.iconButtonEffectAssetFolderSelectElement)
      );
    }
  }

  /**
   * 批量关闭所有下拉菜单，可指定保留一个。按 key 逐个判断而不是从 DOM 遍历：菜单是模块级变量持有的
   * 固定集合，显式列举能保证新增菜单时不会漏关；统计实体菜单额外做了「关掉就复位选择器」的处理。
   */
  function closeAllDropdownMenus(exceptMenuKey = null) {
    if (exceptMenuKey !== "entity") {
      closeDropdownMenu(ctx.imageEntityMenuElement, ctx.imageEntityButtonElement);
    }
    if (exceptMenuKey !== "weather-entity") {
      closeDropdownMenu(ctx.weatherEntityMenuElement, ctx.weatherEntityButtonElement);
    }
    if (exceptMenuKey !== "line-chart-entity") {
      closeDropdownMenu(ctx.lineChartEntityMenuElement, ctx.lineChartEntityButtonElement);
    }
    if (exceptMenuKey !== "ibe-entity") {
      closeDropdownMenu(ctx.iconButtonEffectEntityMenuElement, ctx.iconButtonEffectEntityButtonElement);
    }
    if (exceptMenuKey !== "icon-button-entity") {
      closeDropdownMenu(ctx.iconButtonEntityMenuElement, ctx.iconButtonEntityButtonElement);
    }
    if (exceptMenuKey !== "vacuum-map-entity") {
      closeDropdownMenu(ctx.vacuumMapEntityMenuElement, ctx.vacuumMapEntityButtonElement);
    }
    if (exceptMenuKey !== "camera-entity") {
      closeDropdownMenu(ctx.cameraEntityMenuElement, ctx.cameraEntityButtonElement);
    }
    if (exceptMenuKey !== "air-conditioner-entity") {
      closeDropdownMenu(ctx.airConditionerEntityMenuElement, ctx.airConditionerEntityButtonElement);
    }
    if (exceptMenuKey !== "title-button-entity") {
      closeDropdownMenu(ctx.titleButtonEntityMenuElement, ctx.titleButtonEntityButtonElement);
    }
    if (exceptMenuKey !== "light-statistics-entity") {
      const wasStatisticsMenuOpen = !ctx.lightStatisticsEntityMenuElement.hidden;
      closeDropdownMenu(ctx.lightStatisticsEntityMenuElement, ctx.lightStatisticsEntityButtonElement);
      if (wasStatisticsMenuOpen) {
        ctx.resetLightStatisticsPicker();
      }
    }
    if (exceptMenuKey !== "light-statistics-action-entity") {
      closeDropdownMenu(
        ctx.lightStatisticsActionEntityMenuElement,
        ctx.lightStatisticsActionEntityButtonElement
      );
    }
    if (exceptMenuKey !== "navigation-entity") {
      closeDropdownMenu(ctx.navigationEntityMenuElement, ctx.navigationEntityButtonElement);
    }
    if (exceptMenuKey !== "asset") {
      closeDropdownMenu(ctx.imageAssetMenuElement, ctx.imageAssetButtonElement);
    }
    if (exceptMenuKey !== "ibe-asset") {
      closeDropdownMenu(ctx.iconButtonEffectAssetMenuElement, ctx.iconButtonEffectAssetButtonElement);
    }
    if (exceptMenuKey !== "ibe-icon") {
      closeDropdownMenu(ctx.iconButtonEffectIconMenuElement, ctx.iconButtonEffectIconButtonElement);
    }
    if (exceptMenuKey !== "icon-button-icon") {
      closeDropdownMenu(ctx.iconButtonIconMenuElement, ctx.iconButtonIconButtonElement);
    }
    if (exceptMenuKey !== "title-button-icon") {
      closeDropdownMenu(ctx.titleButtonIconMenuElement, ctx.titleButtonIconButtonElement);
    }
    if (exceptMenuKey !== "light-statistics-icon") {
      closeDropdownMenu(ctx.lightStatisticsIconMenuElement, ctx.lightStatisticsIconButtonElement);
    }
    if (exceptMenuKey !== "navigation-icon") {
      closeDropdownMenu(ctx.navigationIconMenuElement, ctx.navigationIconButtonElement);
    }
  }

  /**
   * 给检查器里的数字输入框加自绘加减按钮（原生 spinner 对滚轮与长按处理不一致）。
   * 单击步进一次；长按 320ms 后按 55ms 连发，期间只在松开时补一次 change，避免刷满撤销栈。
   * 范围限定在 .inspector-form / .i3d-editor / .i3d-vacuum-map-editor 内，弹窗里的数字框不在此列。
   */
  function enhanceNumberInputsIn(numberRootNode = document) {
    const numberInputElements =
      numberRootNode instanceof HTMLInputElement && numberRootNode.type === "number"
        ? [numberRootNode]
        : [
            ...(numberRootNode.querySelectorAll?.(
              '.inspector-form input[type="number"], .i3d-editor input[type="number"], .i3d-vacuum-map-editor input[type="number"]'
            ) || [])
          ];
    for (const numberInputElement of numberInputElements) {
      if (ctx.enhancedNumberInputs.has(numberInputElement)) {
        continue;
      }
      ctx.enhancedNumberInputs.add(numberInputElement);
      const numberControlElement = document.createElement("span");
      numberControlElement.className = "inspector-number-control";
      const numberSteppersElement = document.createElement("span");
      numberSteppersElement.className = "inspector-number-steppers";
      /**
       * 创建一个数字步进按钮（加号或减号）。单击立即步进一次；长按 320ms 后转为每 55ms 连发，
       * 松开时只补发一次 change，免得连发期间不断往撤销栈写历史。
       */
      const createNumberStepperButton = (stepAmount, stepperLabel, stepperIconPath) => {
        const stepperButtonElement = document.createElement("button");
        stepperButtonElement.type = "button";
        stepperButtonElement.tabIndex = -1;
        stepperButtonElement.className = "inspector-number-stepper";
        stepperButtonElement.setAttribute("aria-label", stepperLabel);
        stepperButtonElement.innerHTML =
          '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="' +
          stepperIconPath +
          '"></path></svg>';
        stepperButtonElement.addEventListener("click", stepperClickEvent =>
          stepperClickEvent.preventDefault()
        );
        stepperButtonElement.addEventListener("pointerdown", stepperPointerEvent => {
          if (
            stepperPointerEvent.button !== 0 ||
            numberInputElement.disabled ||
            numberInputElement.readOnly
          ) {
            return;
          }
          stepperPointerEvent.preventDefault();
          numberInputElement.focus({
            preventScroll: true
          });
          let didStepValue = stepNumberInput(numberInputElement, stepAmount);
          let isStepperReleased = false;
          let stepperTimerId = window.setTimeout(() => {
            stepperTimerId = window.setInterval(() => {
              didStepValue = stepNumberInput(numberInputElement, stepAmount) || didStepValue;
            }, 55);
          }, 320);
          /**
           * 结束长按连发并把定时器收尾。用 isStepperReleased 做幂等守卫：pointerup / pointercancel /
           * lostpointercapture 可能同时到达，只允许第一次生效；仅当确实改过值才补发 change。
           */
          const stopStepperRepeat = () => {
            if (!isStepperReleased) {
              isStepperReleased = true;
              window.clearTimeout(stepperTimerId);
              window.clearInterval(stepperTimerId);
              stepperButtonElement.removeEventListener("pointerup", stopStepperRepeat);
              stepperButtonElement.removeEventListener("pointercancel", stopStepperRepeat);
              stepperButtonElement.removeEventListener("lostpointercapture", stopStepperRepeat);
              if (didStepValue) {
                numberInputElement.dispatchEvent(
                  new Event("change", {
                    bubbles: true
                  })
                );
              }
            }
          };
          stepperButtonElement.addEventListener("pointerup", stopStepperRepeat);
          stepperButtonElement.addEventListener("pointercancel", stopStepperRepeat);
          stepperButtonElement.addEventListener("lostpointercapture", stopStepperRepeat);
          capturePointer(stepperButtonElement, stepperPointerEvent.pointerId);
        });
        return stepperButtonElement;
      };
      numberSteppersElement.append(
        createNumberStepperButton(1, "增加数值", "M1 5 5 1l4 4"),
        createNumberStepperButton(-1, "减少数值", "M1 1 5 5l4-4")
      );
      numberInputElement.before(numberControlElement);
      numberControlElement.append(numberInputElement, numberSteppersElement);
      let didStepFromKeys = false;
      numberInputElement.addEventListener("keydown", stepperKeyDownEvent => {
        if (["ArrowUp", "ArrowDown"].includes(stepperKeyDownEvent.key)) {
          stepperKeyDownEvent.preventDefault();
          didStepFromKeys =
            stepNumberInput(numberInputElement, stepperKeyDownEvent.key === "ArrowUp" ? 1 : -1) ||
            didStepFromKeys;
        }
      });
      numberInputElement.addEventListener("keyup", stepperKeyUpEvent => {
        if (!!["ArrowUp", "ArrowDown"].includes(stepperKeyUpEvent.key) && !!didStepFromKeys) {
          didStepFromKeys = false;
          numberInputElement.dispatchEvent(
            new Event("change", {
              bubbles: true
            })
          );
        }
      });
    }
  }

  return { closeAllDropdownMenus, closeCustomSelectMenu, closeDropdownMenu, closePageActionsMenu, closePopupActionsMenu, closeProjectActionsMenu, enhanceNativeSelect, enhanceNativeSelectsIn, enhanceNumberInputsIn, positionCustomSelectMenu, syncCustomSelect };
}
