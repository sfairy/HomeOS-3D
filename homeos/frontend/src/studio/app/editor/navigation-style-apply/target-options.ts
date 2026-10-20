/**
 * 导航「套用到其它控件」弹窗的目标选项 —— 从 home.ts 单体切出。
 *
 * `runVariantPeer` 是纯 DOM 构件（一个选项行，零依赖）；`runVariantLower` 把目标按页面分组渲染进
 * 「应用到同类型控件」列表，需要宿主的表单元素引用，按 ctx 注入（唯一外部依赖）。
 * 调用点零改写（同名回引 + 宿主侧薄绑定）。
 */

import { componentLabel as componentLabel2 } from "../editor-component-collections";

export function runVariantPeer({
  value: runVariantLocal,
  label: runVariantInner,
  detail: runVariantOuter,
  target: runVariantUpper = false,
}: any) {
  const deleteAssetRequestIdElement = document.createElement("label");
  deleteAssetRequestIdElement.className = "navigation-style-apply-option";
  const deleteAssetRequestIdElementElement = document.createElement("input");
  ((deleteAssetRequestIdElementElement.type = "checkbox"),
    (deleteAssetRequestIdElementElement.checked = true),
    runVariantUpper
      ? (deleteAssetRequestIdElementElement.dataset.navigationTargetId = runVariantLocal)
      : (deleteAssetRequestIdElementElement.dataset.navigationStyleProperty = runVariantLocal));
  const deleteAssetErrorElement = document.createElement("span");
  if (((deleteAssetErrorElement.textContent = runVariantInner), runVariantOuter)) {
    const deleteAssetRequestIdElementPanel = document.createElement("small");
    ((deleteAssetRequestIdElementPanel.textContent = runVariantOuter),
      deleteAssetErrorElement.append(deleteAssetRequestIdElementPanel));
  }
  return (
    deleteAssetRequestIdElement.append(deleteAssetRequestIdElementElement, deleteAssetErrorElement),
    deleteAssetRequestIdElement
  );
}

interface NavigationStyleApplyTargetDeps {
  /** 「应用到同类型控件」目标列表容器（宿主 `findElement("#navigation-style-apply-targets")`）。 */
  navigationStyleApplyTargetsElement: any;
}

export function runVariantLower(deps: NavigationStyleApplyTargetDeps, runVariantLeft: any, runVariantRight: any) {
  const { navigationStyleApplyTargetsElement } = deps;
  const deleteAssetErrorById = new Map();
  runVariantLeft.forEach(
    ({
      component: deleteAssetErrorState,
      page: deleteAssetErrorValue,
      scope: deleteAssetError,
    }: any) => {
      const styleSourceComponentDraft =
        deleteAssetError === "shared" ? "shared" : deleteAssetErrorValue;
      (deleteAssetErrorById.has(styleSourceComponentDraft) ||
        deleteAssetErrorById.set(styleSourceComponentDraft, {
          page: deleteAssetErrorValue,
          scope: deleteAssetError,
          components: [] as any[],
        }),
        deleteAssetErrorById.get(styleSourceComponentDraft).components.push(deleteAssetErrorState));
    },
  );
  const onDeleteAssetFolderCloseButtonClickById = new Map();
  for (const onDeleteAssetFolderCloseButtonClick of ["shared", "page"]) {
    if (
      !runVariantLeft.some(
        (onDeleteAssetFolderCancelButtonClick: any) =>
          onDeleteAssetFolderCancelButtonClick.scope === onDeleteAssetFolderCloseButtonClick,
      )
    )
      continue;
    const onDeleteAssetFolderCancelButtonClickElement = document.createElement("section");
    ((onDeleteAssetFolderCancelButtonClickElement.className = "navigation-style-apply-scope"),
      (onDeleteAssetFolderCancelButtonClickElement.dataset.styleApplyScope =
        onDeleteAssetFolderCloseButtonClick));
    const onDeleteAssetFolderDialogClickElement = document.createElement("h3");
    ((onDeleteAssetFolderDialogClickElement.textContent =
      onDeleteAssetFolderCloseButtonClick === "shared" ? "侧边栏" : "主页面"),
      onDeleteAssetFolderCancelButtonClickElement.append(onDeleteAssetFolderDialogClickElement),
      onDeleteAssetFolderCloseButtonClickById.set(
        onDeleteAssetFolderCloseButtonClick,
        onDeleteAssetFolderCancelButtonClickElement,
      ));
  }
  for (const {
    page: onDeleteAssetFolderDialogClick,
    scope: deleteAssetFolderClickEvent,
    components: onDeleteAssetFolderDialogClose,
  } of deleteAssetErrorById.values()) {
    const onDeleteAssetFolderDialogCloseElement = document.createElement("section");
    onDeleteAssetFolderDialogCloseElement.className = "navigation-style-apply-page-group";
    const onDeleteAssetFolderDialogCloseElementElement = document.createElement("div");
    onDeleteAssetFolderDialogCloseElementElement.className = "navigation-style-apply-page-heading";
    const onDeleteAssetFolderDialogCloseElementPanel = document.createElement("strong");
    onDeleteAssetFolderDialogCloseElementPanel.textContent =
      deleteAssetFolderClickEvent === "shared"
        ? "所有页面共享"
        : onDeleteAssetFolderDialogClick?.name || "未命名页面";
    const styleTargetComponentDraftState =
        deleteAssetFolderClickEvent === "shared"
          ? "侧边栏"
          : "主页面 · " + onDeleteAssetFolderDialogCloseElementPanel.textContent,
      onDeleteAssetFolderConfirmButtonClickElement = document.createElement("div");
    onDeleteAssetFolderConfirmButtonClickElement.className = "navigation-style-apply-page-controls";
    const onDeleteAssetFolderConfirmButtonClickElementElement = document.createElement("span"),
      onDeleteAssetFolderConfirmButtonClickElementPanel = document.createElement("button");
    ((onDeleteAssetFolderConfirmButtonClickElementPanel.type = "button"),
      (onDeleteAssetFolderConfirmButtonClickElementPanel.className =
        "navigation-style-apply-page-toggle"));
    const onDeleteAssetFolderConfirmButtonClickElementSection = document.createElement("div");
    ((onDeleteAssetFolderConfirmButtonClickElementSection.className =
      "navigation-style-apply-page-options"),
      onDeleteAssetFolderConfirmButtonClickElementSection.replaceChildren(
        ...onDeleteAssetFolderDialogClose.map((onDeleteAssetFolderConfirmButtonClick: any) =>
          runVariantPeer({
            value: onDeleteAssetFolderConfirmButtonClick.id,
            label: componentLabel2(onDeleteAssetFolderConfirmButtonClick),
            detail:
              typeof runVariantRight == "function"
                ? runVariantRight(onDeleteAssetFolderConfirmButtonClick)
                : runVariantRight,
            target: true,
          }),
        ),
      ));
    const onDeleteAssetFolderConfirmButtonClickState = [
        ...onDeleteAssetFolderConfirmButtonClickElementSection.querySelectorAll<HTMLInputElement>(
          "[data-navigation-target-id]",
        ),
      ],
      deleteAssetFolderRequestHandler = () => {
        const deleteAssetFolderRequest = onDeleteAssetFolderConfirmButtonClickState.filter(
            (deleteAssetFolderRequestElement) => deleteAssetFolderRequestElement.checked,
          ).length,
          isDeleteAssetFolderRequest =
            deleteAssetFolderRequest === onDeleteAssetFolderConfirmButtonClickState.length;
        ((onDeleteAssetFolderConfirmButtonClickElementElement.textContent =
          deleteAssetFolderRequest +
          "/" +
          onDeleteAssetFolderConfirmButtonClickState.length +
          " 个控件"),
          (onDeleteAssetFolderConfirmButtonClickElementPanel.textContent =
            isDeleteAssetFolderRequest ? "取消全选" : "全选"),
          onDeleteAssetFolderConfirmButtonClickElementPanel.setAttribute(
            "aria-label",
            (isDeleteAssetFolderRequest ? "取消选择" : "全选") +
              "“" +
              styleTargetComponentDraftState +
              "”中的控件",
          ));
      };
    (onDeleteAssetFolderConfirmButtonClickElementPanel.addEventListener("click", () => {
      const isDeleteAssetFolderRequestActive = !onDeleteAssetFolderConfirmButtonClickState.every(
        (deleteAssetFolderRequestElementElement) => deleteAssetFolderRequestElementElement.checked,
      );
      (onDeleteAssetFolderConfirmButtonClickState.forEach((deleteAssetFolderErrorElement) => {
        deleteAssetFolderErrorElement.checked = isDeleteAssetFolderRequestActive;
      }),
        deleteAssetFolderRequestHandler());
    }),
      onDeleteAssetFolderConfirmButtonClickElementSection.addEventListener(
        "change",
        deleteAssetFolderRequestHandler,
      ),
      onDeleteAssetFolderConfirmButtonClickElement.append(
        onDeleteAssetFolderConfirmButtonClickElementElement,
        onDeleteAssetFolderConfirmButtonClickElementPanel,
      ),
      onDeleteAssetFolderDialogCloseElementElement.append(
        onDeleteAssetFolderDialogCloseElementPanel,
        onDeleteAssetFolderConfirmButtonClickElement,
      ),
      onDeleteAssetFolderDialogCloseElement.append(
        onDeleteAssetFolderDialogCloseElementElement,
        onDeleteAssetFolderConfirmButtonClickElementSection,
      ),
      deleteAssetFolderRequestHandler(),
      onDeleteAssetFolderCloseButtonClickById
        .get(deleteAssetFolderClickEvent)
        .append(onDeleteAssetFolderDialogCloseElement));
  }
  (navigationStyleApplyTargetsElement.classList.add("grouped-by-page"),
    navigationStyleApplyTargetsElement.replaceChildren(
      ...onDeleteAssetFolderCloseButtonClickById.values(),
    ));
}
