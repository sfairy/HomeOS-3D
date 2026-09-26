/**
 * 仪表盘编辑器主体脚本（页面 /，模板 frontend/index.html）：把一张仪表盘文档渲染成可编辑画布，
 * 并负责草稿、编辑、保存、撤销到展示的全部交互。后端只把文档当 JSON 存取，字段口径见 backend/panel/schema.py。
 *
 * 全局约定：本文件所有 import 必须与 renderer/core/registry.js 引用 registry.js 的同一条 ?v= 版本戳，
 * 否则会加载出两份控件注册表；文档改动先进内存的 activeProject.document，只有点「保存」才写回后端；
 * 所有后端写请求串在 writeQueuePromise 上，草稿用 revision 乐观锁（409 走冲突分支）；
 * 未保存内容另存一份到 sessionStorage（前缀 homeos:unsaved:）供刷新后恢复。
 */

import { showDisplayPairingQr } from "../display/display-pairing-qr.js?v=2609260946";
// 所有接口调用的超时预算由 utils/api-fetch.js 统一持有（requestJson 是唯一出入口）。
import { apiFetch } from "../utils/api-fetch.js?v=2609260946";
import { apiAuthChallenge, apiRequestError } from "../utils/api-request.js?v=2609260946";
import { capturePointer, releasePointer } from "../utils/pointer-capture.js?v=2609260946";
import {
  PanelRenderer,
  airflowCanvasOffsetBounds,
  setBuiltinAssetVersions,
  syncedLineChartProperties
} from "../renderer/core/renderer.js?v=2609260946";

import {
  createComponentFromTemplate,
  dateComponentDimensions,
  listComponentTemplates,
  normalizeDashboardDocument,
  timeComponentDimensions,
  weatherComponentDimensions
} from "../templates/component-templates.js?v=2609260946";
import { clone, newId, roundField, normalizedFontWeight } from "./editor-utils.js?v=2609260946";
import { clampNumber } from "../utils/numbers.js?v=2609260946";
import { AIRFLOW_OTHER_COLOR } from "../utils/airflow-colors.js?v=2609260946";
// 数字输入的步进实现（含 step 非法时的兜底步长）只有一份，策略参数见该模块头部。

import { mdiIconUrl } from "../utils/icon-url.js?v=2609260946";
import { formatZhDateTime } from "../utils/datetime.js?v=2609260946";
import { entityDomainFromId, entityDomainOf } from "../utils/entities.js?v=2609260946";
// 状态条目归一与小写状态文本（变更对象 / 状态对象两种形态）走 `utils/state-entry.js`：
// 本文件原先在这里内联了 `statisticsStateEntry?.newState || statisticsStateEntry`（P12 收口）。

import {
  hexColorOrEmpty,
  paletteColor,
  strictHexColorOrEmpty
} from "../utils/colors.js?v=2609260946";
import { positionFloatingMenu } from "../shared/menu-positioning.js?v=2609260946";
import {
  packPopupModules,
  popupLayoutColumns,
  popupLayoutMetrics
} from "../shared/popup-layout.js?v=2609260946";
import {
  countComponentsOutsideCanvas,
  resizeDashboardDocument
} from "./dashboard-resize.js?v=2609260946";
// 导图底图分辨率必须与控件宽高比一致，否则底图在预览里会被拉伸、位置对不上（见模块注释）。
import { floorplanAutoDiagramExportResolution } from "./floorplan-auto-diagram-layout.js?v=2609260946";
import {
  copyComponentsAcrossDocuments,
  copyComponentTargets,
  copyComponentsToTarget
} from "./component-page-copy.js?v=2609260946";
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
} from "../shared/related-entities.js?v=2609260946";

import { createButtonSound } from "../shared/sound-effects.js?v=2609260946";
import {
  deferHiddenEditorDialogs,
  installSettingsDialogBackdropGuard
} from "./editor-dialogs.js?v=2609260946";
import { confirmAction } from "../shared/ui-confirm.js?v=2609260946";
// 授权状态文案与授权页、连接状态页共用同一份：状态码与文案的对应关系分散在
// 三处必然漂移，用户在编辑器、授权页、恢复页看到对同一状态的不同解释就不知道该信哪个。
// 该模块只在页面里存在 #license-recovery 时自举定时器（编辑器里没有这个节点，不会挂上轮询）。
import { licenseMessage } from "../auth/license-recovery.js?v=2609260946";
import { createEditorPickerElements } from "./picker/editor-picker-elements.js?v=2609260946";
import {
  EDITOR_PICKER_PAGE_SIZES,
  editorEntityPickerInitialPage,
  editorEntityPickerPage
} from "./picker/editor-picker-pagination.js?v=2609260946";
import { createEditorPickerQueries } from "./picker/editor-picker-queries.js?v=2609260946";
import { createEditorAssetMatcher } from "./picker/editor-asset-queries.js?v=2609260946";

import { createInteraction3dEditorPickers } from "../bridge/editor-pickers.js?v=2609260946";
import { createEditorAssetToolbar } from "./picker/editor-asset-toolbar.js?v=2609260946";
import {
  ACTION_TYPES,
  TOGGLE_ENTITY_DOMAINS,
  actionNeedsCurrentEntity,
  actionPopupData,
  componentActionIsSupported,
  entityIdSupportsToggle
} from "../shared/action-rules.js?v=2609260946";
import {
  componentDirectLocation,
  findComponent,
  findComponentInItems,
  findComponentLocation
} from "./component-tree.js?v=2609260946";
import {
  applyCollectionLayerOrder,
  componentLabel,
  copiedComponentLabel,
  ensureSharedComponentReference,
  groupNameForCollection,
  nextTemplateInstanceName,
  refreshComponentIds,
  syncSharedComponentReferenceOrder
} from "./editor-component-collections.js?v=2609260946";
import {
  applyInspectorFields,
  applyInspectorToggles,
  fitInspectorComponentToDimensions,
  iconButtonEffectInspectorLayer,
  inspectorComponentMetrics,
  setInspectorToggle
} from "./editor-basic-inspectors.js?v=2609260946";
import {
  clonePageWithFreshIds,
  findCustomPopup,
  greatestCommonDivisor,
  normalizedPopupClimateDeviceType,
  popupModuleDropPosition,
  popupModuleEntityRecommended,
  popupModuleTypeLabel,
  rememberEditorProject,
  reorderedPopupModules,
  restoredEditorProject,
  uniquePagePath
} from "./editor-document-management.js?v=2609260946";
import {
  createRecoveryWriter,
  documentSignature,
  editorComponentEntries,
  editorComponentStructure,
  editorDocumentFrameSignature,
  recoveryStorageKey
} from "./editor-history.js?v=2609260946";
import {
  DEFAULT_BASE_LIGHTING,
  normalizeBaseLighting
} from "../3d-studio/loaders/studio-normalization.js?v=2609260946";
import { createLicenseCard } from "./license-card.js?v=2609260946";
import {
  guardInteraction3dChanges,
  renderInteraction3dThumbnail,
  updateInteraction3dCard,
  renderInteraction3dInspector
} from "../bridge/editor.js?v=2609260946";
import { createPropertyDescriptors } from "./home/property-descriptors.js?v=2609260946";
import { createStyleApplyDialogs } from "./home/style-apply.js?v=2609260946";
import { createEntityOptions } from "./home/entity-options.js?v=2609260946";
import { createPickers } from "./home/pickers.js?v=2609260946";
import { createFormWidgets } from "./home/form-widgets.js?v=2609260946";
import { createColorPicker } from "./home/color-picker.js?v=2609260946";
import { createSectionRegistry } from "./home/sections.js?v=2609260946";
// 布局层（折叠 / 拖拽调宽 / 状态记忆）与折叠快捷键都在 shared/ 下，与 /3d-studio 工作室
// 共用同一份实现：两页的三栏骨架、分隔条交互、状态记忆是同一套需求，各写一份必然漂移。
import {
  createLayoutController,
  bindLayoutControls
} from "../shared/layout-shell.js?v=2609260946";
import { bindLayoutShortcuts } from "../shared/layout-shortcuts.js?v=2609260946";

// 分节绑定的注册器：每个 bindXxxSection() 都从它拿 on(...)，同名重复绑定会先撤销上一次
// （编辑器被重新初始化时不会再叠加监听）。见 home/sections.js。
const sections = createSectionRegistry();

/**
 * 按选择器取单个 DOM 节点的简写。不做缓存与空值兜底：调用处只在模块加载时一次性缓存静态节点，
 * querySelector 找不到说明模板出错，返回 null 由使用处自行判断。
 */
const findElement = selector => document.querySelector(selector);
installSettingsDialogBackdropGuard();
// 编辑器按这个逻辑宽度排版，装不下时整页等比缩放（而不是重排）。它是 CSS 的
// --editor-design-width（app.css 的 :root）与 index.html 的 <meta name="viewport"> 里
// 那个 width 的同源值：三处都吃不下 var()，所以只能各写一份，改一处就要同手改另两处。
const EDITOR_DESIGN_WIDTH = 1020;
const AUTO_DIAGRAM_LAYOUT_VERSION = 2;
const COMPONENT_DIALOG_DESIGN_WIDTH = 1920;
const COMPONENT_DIALOG_DESIGN_HEIGHT = 1080;
const COMPONENT_DIALOG_SCALE_MULTIPLIER = 1.1;
const editorHeaderElement = findElement(".editor-header");
const editorShellElement = findElement(".editor-shell");
/**
 * 按视口尺寸整体缩放编辑器外壳，避免小屏上出现横向滚动。
 */
function refreshEditorViewportFit() {
  const layoutHeightPx = Math.max(
    1,
    editorHeaderElement.offsetHeight + editorShellElement.offsetHeight
  );
  const viewportScaleRatio = Math.min(
    1,
    window.innerWidth / EDITOR_DESIGN_WIDTH,
    window.innerHeight / layoutHeightPx
  );
  const shouldScaleEditor = viewportScaleRatio < 0.999;
  document.documentElement.classList.toggle("editor-viewport-fit", shouldScaleEditor);
  document.documentElement.style.setProperty("--editor-layout-height", layoutHeightPx + "px");
  document.documentElement.style.setProperty("--editor-viewport-scale", String(viewportScaleRatio));
}
/**
 * 计算并写入组件对话框的 CSS 缩放变量。对话框按 1920×1080 设计再乘 1.1 放大系数；
 * 下限 0.1 是刻意兜底，避免窗口极小或 resize 过程中算出 0 导致内容不可见。
 */
function refreshComponentDialogScale() {
  const componentDialogScale = Math.max(
    0.1,
    COMPONENT_DIALOG_SCALE_MULTIPLIER *
      Math.min(
        window.innerWidth / COMPONENT_DIALOG_DESIGN_WIDTH,
        window.innerHeight / COMPONENT_DIALOG_DESIGN_HEIGHT
      )
  );
  document.documentElement.style.setProperty(
    "--component-template-dialog-scale",
    String(componentDialogScale)
  );
}
refreshEditorViewportFit();
refreshComponentDialogScale();
const logoutButtonElement = findElement("#logout");
const saveButtonElement = findElement("#save");
const licenseOpenButtonElement = findElement("#license-open");
const licenseDialogElement = findElement("#license-dialog");
const licenseCloseButtonElement = findElement("#license-close");
const licenseReactivateButtonElement = findElement("#license-reactivate");
const licenseDialogRetryButtonElement = findElement("#license-dialog-retry");
const licenseRetryMessageElement = findElement("#license-retry-message");
const licenseFormElement = findElement("#license-form");
const licenseMessageElement = findElement("#license-message");
const licenseDetailIndicatorElement = findElement("#license-detail-indicator");
const licenseDetailStatusElement = findElement("#license-detail-status");
const licenseDetailEditionElement = findElement("#license-detail-edition");
const licenseDetailErrorElement = findElement("#license-detail-error");
const licenseCardController = createLicenseCard({
  dialog: licenseDialogElement
});
const haOpenButtonElement = findElement("#ha-open");
const haDialogElement = findElement("#ha-dialog");
const haCloseButtonElement = findElement("#ha-close");
const haFormElement = findElement("#ha-form");
const haTestButtonElement = findElement("#ha-test");
const haMessageElement = findElement("#ha-message");
const haSyncStateElement = findElement("#ha-sync-state");
const haSyncDetailElement = findElement("#ha-sync-detail");
const haSyncOverviewElement = findElement("#ha-sync-overview");
const haConnectionViewElement = findElement("#ha-connection-view");
const haDetailIndicatorElement = findElement("#ha-detail-indicator");
const haDetailNameElement = findElement("#ha-detail-name");
const haDetailStatusElement = findElement("#ha-detail-status");
const haDetailUrlElement = findElement("#ha-detail-url");
const haDetailVersionElement = findElement("#ha-detail-version");
const haDetailCountsElement = findElement("#ha-detail-counts");
const haDetailErrorElement = findElement("#ha-detail-error");
const haEditButtonElement = findElement("#ha-edit");
const haDeleteButtonElement = findElement("#ha-delete");
const haEditCancelButtonElement = findElement("#ha-edit-cancel");
const deleteHaDialogElement = findElement("#delete-ha-dialog");
const deleteHaCloseButtonElement = findElement("#delete-ha-close");
const deleteHaCancelButtonElement = findElement("#delete-ha-cancel");
const deleteHaFormElement = findElement("#delete-ha-form");
const deleteHaMessageElement = findElement("#delete-ha-message");
const projectNewButtonElement = findElement("#project-new");
const projectSelectElement = findElement("#project-select");
const projectActionsButtonElement = findElement("#project-actions-button");
const projectActionsMenuElement = findElement("#project-actions-menu");
const projectFloorplanOpenButtonElement = findElement("#project-floorplan-open");
const navigatorContentElement = findElement("#navigator-content");
const pageControlElement = findElement(".page-control");
const popupControlElement = findElement(".popup-control");
const showPageEditorButtonElement = findElement("#show-page-editor");
const showPopupEditorButtonElement = findElement("#show-popup-editor");
const pageNewButtonElement = findElement("#page-new");
const pageSelectElement = findElement("#page-select");
const pageActionsButtonElement = findElement("#page-actions-button");
const pageActionsMenuElement = findElement("#page-actions-menu");
const defaultPageActionButtonElement = findElement("#default-page-action");
const popupNewButtonElement = findElement("#popup-new");
const popupSelectElement = findElement("#popup-select");
const popupListElement = findElement("#popup-list");
const popupActionsButtonElement = findElement("#popup-actions-button");
const popupActionsMenuElement = findElement("#popup-actions-menu");
const showSharedComponentsButtonElement = findElement("#show-shared-components");
const showPageComponentsButtonElement = findElement("#show-page-components");
const addComponentButtonElement = findElement("#add-component-button");
const componentTemplateDialogElement = findElement("#component-template-dialog");
const componentTemplateCloseButtonElement = findElement("#component-template-close");
const componentTemplateScopeElement = findElement("#component-template-scope");
const componentTemplateListElement = findElement("#component-template-list");
const sharedComponentListElement = findElement("#shared-component-list");
const pageComponentListElement = findElement("#page-component-list");
const componentContextMenuElement = findElement("#component-context-menu");
const projectDialogElement = findElement("#project-dialog");
const projectDialogKickerElement = findElement("#project-dialog-kicker");
const projectDialogTitleElement = findElement("#project-dialog-title");
const projectCloseButtonElement = findElement("#project-close");
const projectCancelButtonElement = findElement("#project-cancel");
const projectFormElement = findElement("#project-form");
const projectSubmitButtonElement = findElement("#project-submit");
const projectMessageElement = findElement("#project-message");
const projectCanvasFieldsElement = findElement("#project-canvas-fields");
const projectCanvasWidthInputElement = findElement("#project-canvas-width");
const projectCanvasHeightInputElement = findElement("#project-canvas-height");
const projectAspectRatioElement = findElement("#project-aspect-ratio");
const projectAspectLockButtonElement = findElement("#project-aspect-lock");
const projectAspectLockLabelElement = findElement("#project-aspect-lock-label");
const projectCanvasHintElement = findElement("#project-canvas-hint");
const projectContentLockFieldsElement = findElement("#project-content-lock-fields");
const projectContentLockCheckboxElement = findElement("#project-content-lock");
const projectResizeWarningDialogElement = findElement("#project-resize-warning-dialog");
const projectResizeWarningTextElement = findElement("#project-resize-warning-text");
const projectResizeWarningCloseButtonElement = findElement("#project-resize-warning-close");
const projectResizeWarningCancelButtonElement = findElement("#project-resize-warning-cancel");
const projectResizeWarningConfirmButtonElement = findElement("#project-resize-warning-confirm");
const pageDialogElement = findElement("#page-dialog");
const pageDialogKickerElement = findElement("#page-dialog-kicker");
const pageDialogTitleElement = findElement("#page-dialog-title");
const pageCloseButtonElement = findElement("#page-close");
const pageCancelButtonElement = findElement("#page-cancel");
const pageFormElement = findElement("#page-form");
const pageSubmitButtonElement = findElement("#page-submit");
const pageMessageElement = findElement("#page-message");
const componentGroupRenameDialogElement = findElement("#component-group-rename-dialog");
const componentGroupRenameCloseButtonElement = findElement("#component-group-rename-close");
const componentGroupRenameCancelButtonElement = findElement("#component-group-rename-cancel");
const componentGroupRenameFormElement = findElement("#component-group-rename-form");
const componentGroupRenameInputElement = findElement("#component-group-rename-input");
const componentGroupRenameMessageElement = findElement("#component-group-rename-message");
const editorCanvasElement = findElement("#editor-canvas");
const workspaceElement = findElement(".workspace");
const workspaceTitleElement = findElement("#workspace-title");
const workspaceResolutionElement = findElement("#workspace-resolution");
const soundToggleButtonElement = document.createElement("button");
soundToggleButtonElement.id = "dashboard-sound-toggle";
soundToggleButtonElement.className = "workspace-sound-toggle";
soundToggleButtonElement.type = "button";
soundToggleButtonElement.setAttribute("aria-pressed", "true");
soundToggleButtonElement.setAttribute("aria-label", "关闭仪表盘音效");
soundToggleButtonElement.title = "关闭仪表盘音效";
soundToggleButtonElement.innerHTML =
  '<svg class="sound-icon sound-icon-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M18.5 7a7.5 7.5 0 0 1 0 10"/></svg><svg class="sound-icon sound-icon-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 9 5 6M22 9l-5 6"/></svg><span class="sound-label">按键音效</span>';
workspaceResolutionElement.after(soundToggleButtonElement);
const dashboardDisplayHintElement = findElement("#dashboard-display-hint");
const dashboardDisplayLinkElement = findElement("#dashboard-display-link");
const displayDevicesOpenButtonElement = findElement("#display-devices-open");
const displayDevicesDialogElement = findElement("#display-devices-dialog");
const displayDevicesCloseButtonElement = findElement("#display-devices-close");
const displayPairingFormElement = findElement("#display-pairing-form");
const displayPairingNameTextInputElement = findElement("#display-pairing-name");
const displayPairingCustomCodeTextInputElement = findElement("#display-pairing-custom-code");
const displayPairingGenerateButtonElement = findElement("#display-pairing-generate");
const displayDeviceCountElement = findElement("#display-device-count");
const displayDeviceListElement = findElement("#display-device-list");
const displayDevicesMessageElement = findElement("#display-devices-message");
const sessionsOpenButtonElement = findElement("#sessions-open");
const sessionsDialogElement = findElement("#sessions-dialog");
const sessionsCloseButtonElement = findElement("#sessions-close");
const sessionsRevokeOthersButtonElement = findElement("#sessions-revoke-others");
const sessionsRevokeOthersDialogElement = findElement("#sessions-revoke-others-dialog");
const sessionsRevokeOthersCloseButtonElement = findElement("#sessions-revoke-others-close");
const sessionsRevokeOthersCancelButtonElement = findElement("#sessions-revoke-others-cancel");
const sessionsRevokeOthersConfirmButtonElement = findElement("#sessions-revoke-others-confirm");
const sessionsRevokeOthersMessageElement = findElement("#sessions-revoke-others-message");
const sessionsRevokeDialogElement = findElement("#sessions-revoke-dialog");
const sessionsRevokeCloseButtonElement = findElement("#sessions-revoke-close");
const sessionsRevokeCancelButtonElement = findElement("#sessions-revoke-cancel");
const sessionsRevokeConfirmButtonElement = findElement("#sessions-revoke-confirm");
const sessionsRevokeLabelElement = findElement("#sessions-revoke-label");
const sessionsRevokeMessageElement = findElement("#sessions-revoke-message");
const sessionCountElement = findElement("#session-count");
const sessionListElement = findElement("#session-list");
const sessionsMessageElement = findElement("#sessions-message");
const showEditorPreviewButtonElement = findElement("#show-editor-preview");
const showDashboardPreviewButtonElement = findElement("#show-dashboard-preview");
const openHomeAssistantButtonElement = findElement("#open-home-assistant");
const dashboardPreviewElement = findElement("#dashboard-preview");
const customPopupEditorElement = findElement("#custom-popup-editor");
const buttonSoundController = createButtonSound();
/**
 * 同步「按键音效」开关的可见性、禁用态与文案。只在编辑模式显示；开关以文档里的 soundEnabled
 * 为准回灌给播放器，避免刷新后播放器状态与文档记录不一致。
 */
function refreshSoundToggle() {
  if (!soundToggleButtonElement) {
    return;
  }
  const isEditMode = editorMode === "edit";
  soundToggleButtonElement.hidden = !isEditMode;
  soundToggleButtonElement.disabled = !activeProject;
  if (
    activeProject &&
    typeof activeProject.document?.soundEnabled == "boolean" &&
    buttonSoundController.isEnabled() !== activeProject.document.soundEnabled
  ) {
    buttonSoundController.setEnabled(activeProject.document.soundEnabled);
  }
  soundToggleButtonElement.setAttribute("aria-pressed", String(buttonSoundController.isEnabled()));
  soundToggleButtonElement.title = buttonSoundController.isEnabled()
    ? "关闭仪表盘音效"
    : "开启仪表盘音效";
  soundToggleButtonElement.setAttribute("aria-label", soundToggleButtonElement.title);
  soundToggleButtonElement.classList.toggle("is-muted", !buttonSoundController.isEnabled());
}
const deleteProjectDialogElement = findElement("#delete-project-dialog");
const deleteProjectCloseButtonElement = findElement("#delete-project-close");
const deleteProjectCancelButtonElement = findElement("#delete-project-cancel");
const deleteProjectFormElement = findElement("#delete-project-form");
const deleteProjectNameElement = findElement("#delete-project-name");
const deleteProjectMessageElement = findElement("#delete-project-message");
const deletePageDialogElement = findElement("#delete-page-dialog");
const deletePageCloseButtonElement = findElement("#delete-page-close");
const deletePageCancelButtonElement = findElement("#delete-page-cancel");
const deletePageConfirmButtonElement = findElement("#delete-page-confirm");
const deletePageNameElement = findElement("#delete-page-name");
const deletePageMessageElement = findElement("#delete-page-message");
const deleteComponentDialogElement = findElement("#delete-component-dialog");
const deleteComponentCloseButtonElement = findElement("#delete-component-close");
const deleteComponentCancelButtonElement = findElement("#delete-component-cancel");
const deleteComponentConfirmButtonElement = findElement("#delete-component-confirm");
const deleteComponentNameElement = findElement("#delete-component-name");
const copyComponentPageDialogElement = findElement("#copy-component-page-dialog");
const copyComponentPageCloseButtonElement = findElement("#copy-component-page-close");
const copyComponentPageCancelButtonElement = findElement("#copy-component-page-cancel");
const copyComponentPageFormElement = findElement("#copy-component-page-form");
const copyComponentPageNameElement = findElement("#copy-component-page-name");
const copyComponentPageScopeSelectElement = findElement("#copy-component-page-scope");
const copyComponentPageProjectFieldElement = findElement("#copy-component-page-project-field");
const copyComponentPageProjectSelectElement = findElement("#copy-component-page-project");
const copyComponentPageTargetLabelElement = findElement("#copy-component-page-target-label");
const copyComponentPageTargetSelectElement = findElement("#copy-component-page-target");
const copyComponentScaleOptionsElement = findElement("#copy-component-scale-options");
const copyComponentResolutionSummaryElement = findElement("#copy-component-resolution-summary");
const copyComponentPageMessageElement = findElement("#copy-component-page-message");
const copyComponentPageSubmitButtonElement = findElement("#copy-component-page-submit");
const copyComponentSuccessDialogElement = findElement("#copy-component-success-dialog");
const copyComponentSuccessMessageElement = findElement("#copy-component-success-message");
const copyComponentSuccessStayButtonElement = findElement("#copy-component-success-stay");
const copyComponentSuccessGoButtonElement = findElement("#copy-component-success-go");
const errorDialogElement = findElement("#error-dialog");
const errorDialogCloseButtonElement = findElement("#error-dialog-close");
const errorDialogConfirmButtonElement = findElement("#error-dialog-confirm");
const errorDialogMessageElement = findElement("#error-dialog-message");
const recoveryDialogElement = findElement("#recovery-dialog");
const recoveryDiscardButtonElement = findElement("#recovery-discard");
const recoveryRestoreButtonElement = findElement("#recovery-restore");
const undoButtonElement = findElement("#undo");
const redoButtonElement = findElement("#redo");
const inspectorEmptyElement = findElement("#inspector-empty");
const inspectorElement = findElement(".inspector");
// 布局层要量左右两栏的实际宽度来决定「另一栏还能伸多宽」，所以三栏容器都要留引用。
const navigatorElement = findElement(".navigator");
const navigatorResizerElement = findElement("#nav-resizer");
const inspectorResizerElement = findElement("#inspector-resizer");
const imageInspectorFormElement = findElement("#image-inspector");
const imageTypeTextInputElement = findElement("#image-type");
const imageLabelTextInputElement = findElement("#image-label");
const imageEntityButtonElement = findElement("#image-entity-button");
const imageEntityMenuElement = findElement("#image-entity-menu");
const imageEntitySearchInputElement = findElement("#image-entity-search");
const imageEntityOptionsElement = findElement("#image-entity-options");
const imageAssetButtonElement = findElement("#image-asset-button");
const imageAssetMenuElement = findElement("#image-asset-menu");
const imageAssetFolderSelectElement = findElement("#image-asset-folder");
const imageAssetSearchInputElement = findElement("#image-asset-search");
const imageAssetOptionsElement = findElement("#image-asset-options");
const imageAssetUploadButtonElement = findElement("#image-asset-upload");
const imageAssetUploadInputElement = findElement("#image-asset-upload-input");
const imageAssetLargePreviewElement = findElement("#image-asset-large-preview");
const imageAssetLargePreviewImageElement = findElement("#image-asset-large-preview-image");
const imageAssetLargePreviewNameElement = findElement("#image-asset-large-preview-name");
const globalColorPickerElement = findElement("#global-color-picker");
/**
 * 取色器在 body 里的原位（它下面那个兄弟）。打开时它会被挂进 dialog（见 colorPickerHostFor），
 * 收起时必须按原位插回去而不是 append 到末尾 —— body 下还有别的 fixed 覆盖层，末尾会改掉同层级的先后。
 */
const globalColorPickerHomeNextSibling = globalColorPickerElement?.nextElementSibling || null;
const globalColorPickerSaturationValueElement = findElement("#global-color-picker-sv");
const globalColorPickerMarkerElement = findElement("#global-color-picker-marker");
const globalColorPickerHueRangeInputElement = findElement("#global-color-picker-hue");
const globalColorPickerSwatchElement = findElement("#global-color-picker-swatch");
const globalColorPickerHexTextInputElement = findElement("#global-color-picker-hex");
const globalColorPickerCopyButtonElement = findElement("#global-color-picker-copy");
const globalColorPickerPasteButtonElement = findElement("#global-color-picker-paste");
const globalColorPickerRedInputElement = findElement("#global-color-picker-r");
const globalColorPickerGreenInputElement = findElement("#global-color-picker-g");
const globalColorPickerBlueInputElement = findElement("#global-color-picker-b");
const imageOpacityInputElement = findElement("#image-opacity");
const imageLayoutOptionsElement = findElement("#image-layout-options");
const imageLeftInputElement = findElement("#image-left");
const imageTopInputElement = findElement("#image-top");
const imageScaleInputElement = findElement("#image-scale");
const imageRotationInputElement = findElement("#image-rotation");
const floorplanAutoDiagramInspectorFormElement = findElement("#floorplan-auto-diagram-inspector");
const floorplanAutoDiagramStatusElement = findElement("#floorplan-auto-diagram-status");
const floorplanAutoDiagramOpenStudioButtonElement = findElement(
  "#floorplan-auto-diagram-open-studio"
);
const floorplanAutoDiagramViewToggleButtonElement = findElement(
  "#floorplan-auto-diagram-view-toggle"
);
const floorplanAutoDiagramLabelTextInputElement = findElement("#floorplan-auto-diagram-label");
const floorplanAutoDiagramFolderTextInputElement = findElement("#floorplan-auto-diagram-folder");
const floorplanAutoDiagramLayoutElement = findElement("#floorplan-auto-diagram-layout");
const floorplanAutoDiagramLeftInputElement = findElement("#floorplan-auto-diagram-left");
const floorplanAutoDiagramTopInputElement = findElement("#floorplan-auto-diagram-top");
const floorplanAutoDiagramWidthInputElement = findElement("#floorplan-auto-diagram-width");
const floorplanAutoDiagramHeightInputElement = findElement("#floorplan-auto-diagram-height");
const floorplanAutoDiagramScaleInputElement = findElement("#floorplan-auto-diagram-scale");
const floorplanAutoDiagramRotationInputElement = findElement("#floorplan-auto-diagram-rotation");
const floorplanAutoDiagramFloorSelectElement = findElement("#floorplan-auto-diagram-floor");
const floorplanAutoDiagramCameraViewElement = findElement("#floorplan-auto-diagram-camera-view");
const floorplanAutoDiagramCameraModeElement = findElement("#floorplan-auto-diagram-camera-mode");
const floorplanAutoDiagramFocalLengthInputElement = findElement(
  "#floorplan-auto-diagram-focal-length"
);
const floorplanAutoDiagramRotateTopButtonElement = findElement(
  "#floorplan-auto-diagram-rotate-top"
);
const floorplanAutoDiagramOpenBaseLightingButtonElement = findElement(
  "#floorplan-auto-diagram-open-base-lighting"
);
const floorplanAutoDiagramBindingsElement = findElement("#floorplan-auto-diagram-bindings");
const floorplanAutoDiagramBindingListElement = findElement("#floorplan-auto-diagram-binding-list");
const floorplanAutoLightingPanelElement = findElement("#floorplan-auto-lighting-panel");
const floorplanAutoLightingHandleElement = findElement("#floorplan-auto-lighting-handle");
const floorplanAutoLightingCloseButtonElement = findElement("#floorplan-auto-lighting-close");
const floorplanAutoLightingResetButtonElement = findElement("#floorplan-auto-lighting-reset");
const floorplanAutoLightingSaveButtonElement = findElement("#floorplan-auto-lighting-save");
const floorplanAutoLightingStatusElement = findElement("#floorplan-auto-lighting-status");
const floorplanBaseLightElements = [...document.querySelectorAll("[data-floorplan-base-light]")];
let baseLightingComponentId = "";
let baseLightingSettings = normalizeBaseLighting(DEFAULT_BASE_LIGHTING);
let lightingPanelDragState = null;
const componentActionControlsElement = findElement("#component-action-controls");
const floorplanAutoDiagramDialogElement = findElement("#floorplan-auto-diagram-dialog");
const floorplanAutoDiagramCloseButtonElement = findElement("#floorplan-auto-diagram-close");
const floorplanAutoDiagramGuideElement = findElement("#floorplan-auto-diagram-guide");
const floorplanAutoDiagramLaterButtonElement = findElement("#floorplan-auto-diagram-later");
const floorplanAutoDiagramContinueButtonElement = findElement("#floorplan-auto-diagram-continue");
const iconButtonEffectInspectorFormElement = findElement("#icon-button-effect-inspector");
const iconButtonEffectLabelTextInputElement = findElement("#ibe-label");
const iconButtonEffectEntityButtonElement = findElement("#ibe-entity-button");
const iconButtonEffectEntityMenuElement = findElement("#ibe-entity-menu");
const iconButtonEffectEntitySearchInputElement = findElement("#ibe-entity-search");
const iconButtonEffectEntityOptionsElement = findElement("#ibe-entity-options");
const iconButtonEffectColorTemperatureRealtimeCheckboxElement = findElement(
  "#ibe-color-temperature-realtime"
);
const iconButtonEffectBrightnessRealtimeCheckboxElement = findElement("#ibe-brightness-realtime");
const iconButtonEffectPreviewStateElement = findElement("#ibe-preview-state");
const iconButtonEffectLayerOptionsElement = findElement("#ibe-layer-options");
const iconButtonEffectButtonSectionElement = findElement("#ibe-button-section");
const iconButtonEffectEffectSectionElement = findElement("#ibe-effect-section");
const iconButtonEffectButtonVisibleButtonElement = findElement("#ibe-button-visible");
const iconButtonEffectEffectVisibleButtonElement = findElement("#ibe-effect-visible");
const iconButtonEffectButtonTransformSectionElement = findElement("#ibe-button-transform-section");
const iconButtonEffectActionSectionElement = findElement("#ibe-action-section");
const iconButtonEffectIconButtonElement = findElement("#ibe-icon-button");
const iconButtonEffectIconCopyButtonElement = findElement("#ibe-icon-copy");
const iconButtonEffectIconMenuElement = findElement("#ibe-icon-menu");
const iconButtonEffectIconSearchInputElement = findElement("#ibe-icon-search");
const iconButtonEffectIconOptionsElement = findElement("#ibe-icon-options");
const iconButtonEffectIconOffColorInputElement = findElement("#ibe-icon-off-color");
const iconButtonEffectIconOnColorInputElement = findElement("#ibe-icon-on-color");
const iconButtonEffectIconSizeInputElement = findElement("#ibe-icon-size");
const iconButtonEffectButtonOffColorInputElement = findElement("#ibe-button-off-color");
const iconButtonEffectButtonOnColorInputElement = findElement("#ibe-button-on-color");
const iconButtonEffectButtonOpacityInputElement = findElement("#ibe-button-opacity");
const iconButtonEffectFrameColorInputElement = findElement("#ibe-frame-color");
const iconButtonEffectFrameWidthInputElement = findElement("#ibe-frame-width");
const iconButtonEffectFrameOpacityInputElement = findElement("#ibe-frame-opacity");
const iconButtonEffectRadiusInputElement = findElement("#ibe-radius");
const iconButtonEffectGlowColorInputElement = findElement("#ibe-glow-color");
const iconButtonEffectGlowOffStrengthInputElement = findElement("#ibe-glow-off-strength");
const iconButtonEffectGlowOnStrengthInputElement = findElement("#ibe-glow-on-strength");
const iconButtonEffectAssetButtonElement = findElement("#ibe-asset-button");
const iconButtonEffectAssetMenuElement = findElement("#ibe-asset-menu");
const iconButtonEffectAssetFolderSelectElement = findElement("#ibe-asset-folder");
const iconButtonEffectAssetSearchInputElement = findElement("#ibe-asset-search");
const iconButtonEffectAssetOptionsElement = findElement("#ibe-asset-options");
const iconButtonEffectAssetUploadButtonElement = findElement("#ibe-asset-upload");
const iconButtonEffectAssetUploadInputElement = findElement("#ibe-asset-upload-input");
const iconButtonEffectEffectOpacityInputElement = findElement("#ibe-effect-opacity");
const iconButtonEffectEffectFadeDurationInputElement = findElement("#ibe-effect-fade-duration");
const iconButtonEffectEffectLayoutOptionsElement = findElement("#ibe-effect-layout-options");
const iconButtonEffectEffectAlignImageButtonElement = findElement("#ibe-effect-align-image");
const iconButtonEffectEffectLeftInputElement = findElement("#ibe-effect-left");
const iconButtonEffectEffectTopInputElement = findElement("#ibe-effect-top");
const iconButtonEffectEffectScaleInputElement = findElement("#ibe-effect-scale");
const iconButtonEffectEffectRotationInputElement = findElement("#ibe-effect-rotation");
const iconButtonEffectEffectSizeHintElement = findElement("#ibe-effect-size-hint");
const effectImageAlignDialogElement = findElement("#effect-image-align-dialog");
const effectImageAlignCloseButtonElement = findElement("#effect-image-align-close");
const effectImageAlignCancelButtonElement = findElement("#effect-image-align-cancel");
const effectImageAlignConfirmButtonElement = findElement("#effect-image-align-confirm");
const effectImageAlignOptionsElement = findElement("#effect-image-align-options");
const effectImageAlignMessageElement = findElement("#effect-image-align-message");
const iconButtonEffectLeftInputElement = findElement("#ibe-left");
const iconButtonEffectTopInputElement = findElement("#ibe-top");
const iconButtonEffectWidthInputElement = findElement("#ibe-width");
const iconButtonEffectHeightInputElement = findElement("#ibe-height");
const iconButtonEffectScaleInputElement = findElement("#ibe-scale");
const iconButtonEffectRotationInputElement = findElement("#ibe-rotation");
const iconButtonEffectActionControlsElement = findElement("#ibe-action-controls");
const iconButtonEffectApplyStyleButtonElement = findElement("#ibe-apply-style");
const iconButtonEffectApplyCountElement = findElement("#ibe-apply-count");
const titleButtonInspectorFormElement = findElement("#title-button-inspector");
const titleButtonLabelTextInputElement = findElement("#title-button-label");
const titleButtonEntityButtonElement = findElement("#title-button-entity-button");
const titleButtonEntityMenuElement = findElement("#title-button-entity-menu");
const titleButtonEntitySearchInputElement = findElement("#title-button-entity-search");
const titleButtonEntityOptionsElement = findElement("#title-button-entity-options");
const titleButtonMainVisibleButtonElement = findElement("#title-button-main-visible");
const titleButtonSecondaryVisibleButtonElement = findElement("#title-button-secondary-visible");
const titleButtonMainTextInputElement = findElement("#title-button-main-text");
const titleButtonSecondaryLine1TextInputElement = findElement("#title-button-secondary-line-1");
const titleButtonSecondaryLine2TextInputElement = findElement("#title-button-secondary-line-2");
const titleButtonMainColorInputElement = findElement("#title-button-main-color");
const titleButtonSecondaryColorInputElement = findElement("#title-button-secondary-color");
const titleButtonMainSizeInputElement = findElement("#title-button-main-size");
const titleButtonSecondarySizeInputElement = findElement("#title-button-secondary-size");
const titleButtonMainWeightInputElement = findElement("#title-button-main-weight");
const titleButtonSecondaryWeightInputElement = findElement("#title-button-secondary-weight");
const titleButtonMainSpacingInputElement = findElement("#title-button-main-spacing");
const titleButtonSecondarySpacingInputElement = findElement("#title-button-secondary-spacing");
const titleButtonSecondaryLineGapInputElement = findElement("#title-button-secondary-line-gap");
const titleButtonMainLeftInputElement = findElement("#title-button-main-left");
const titleButtonMainTopInputElement = findElement("#title-button-main-top");
const titleButtonSecondaryLeftInputElement = findElement("#title-button-secondary-left");
const titleButtonSecondaryTopInputElement = findElement("#title-button-secondary-top");
const titleButtonIconVisibleButtonElement = findElement("#title-button-icon-visible");
const titleButtonIconButtonElement = findElement("#title-button-icon-button");
const titleButtonIconCopyButtonElement = findElement("#title-button-icon-copy");
const titleButtonIconMenuElement = findElement("#title-button-icon-menu");
const titleButtonIconSearchInputElement = findElement("#title-button-icon-search");
const titleButtonIconOptionsElement = findElement("#title-button-icon-options");
const titleButtonIconColorInputElement = findElement("#title-button-icon-color");
const titleButtonIconSizeInputElement = findElement("#title-button-icon-size");
const titleButtonIconLeftInputElement = findElement("#title-button-icon-left");
const titleButtonIconTopInputElement = findElement("#title-button-icon-top");
const titleButtonFrameColorInputElement = findElement("#title-button-frame-color");
const titleButtonFrameVisibleButtonElement = findElement("#title-button-frame-visible");
const titleButtonFrameWidthInputElement = findElement("#title-button-frame-width");
const titleButtonFrameSizeInputElement = findElement("#title-button-frame-size");
const titleButtonFrameSpacingInputElement = findElement("#title-button-frame-spacing");
const titleButtonFrameOffsetXInputElement = findElement("#title-button-frame-offset-x");
const titleButtonFrameOffsetYInputElement = findElement("#title-button-frame-offset-y");
const titleButtonMarkerVisibleButtonElement = findElement("#title-button-marker-visible");
const titleButtonMarkerColorInputElement = findElement("#title-button-marker-color");
const titleButtonMarkerSizeInputElement = findElement("#title-button-marker-size");
const titleButtonMarkerLeftInputElement = findElement("#title-button-marker-left");
const titleButtonMarkerTopInputElement = findElement("#title-button-marker-top");
const titleButtonLeftInputElement = findElement("#title-button-left");
const titleButtonTopInputElement = findElement("#title-button-top");
const titleButtonWidthInputElement = findElement("#title-button-width");
const titleButtonHeightInputElement = findElement("#title-button-height");
const titleButtonScaleInputElement = findElement("#title-button-scale");
const titleButtonRotationInputElement = findElement("#title-button-rotation");
const titleButtonActionControlsElement = findElement("#title-button-action-controls");
const titleButtonApplyStyleButtonElement = findElement("#title-button-apply-style");
const titleButtonApplyCountElement = findElement("#title-button-apply-count");
const lightStatisticsInspectorFormElement = findElement("#light-statistics-inspector");
const lightStatisticsLabelTextInputElement = findElement("#light-statistics-label");
const lightStatisticsTitleTextInputElement = findElement("#light-statistics-title");
const lightStatisticsEntityButtonElement = findElement("#light-statistics-entity-button");
const lightStatisticsEntityMenuElement = findElement("#light-statistics-entity-menu");
const lightStatisticsEntitySearchInputElement = findElement("#light-statistics-entity-search");
const lightStatisticsEntityOptionsElement = findElement("#light-statistics-entity-options");
const lightStatisticsEntityPendingElement = findElement("#light-statistics-entity-pending");
const lightStatisticsEntityConfirmButtonElement = findElement("#light-statistics-entity-confirm");
const lightStatisticsEntityMessageElement = findElement("#light-statistics-entity-message");
const lightStatisticsEntityListElement = findElement("#light-statistics-entity-list");
const lightStatisticsEntityCountElement = findElement("#light-statistics-entity-count");
const lightStatisticsActionEntityButtonElement = findElement(
  "#light-statistics-action-entity-button"
);
const lightStatisticsActionEntityMenuElement = findElement("#light-statistics-action-entity-menu");
const lightStatisticsActionEntitySearchInputElement = findElement(
  "#light-statistics-action-entity-search"
);
const lightStatisticsActionEntityOptionsElement = findElement(
  "#light-statistics-action-entity-options"
);
const lightStatisticsActionNoteElement = findElement("#light-statistics-action-note");
const lightStatisticsActionControlsElement = findElement("#light-statistics-action-controls");
const lightStatisticsIconButtonElement = findElement("#light-statistics-icon-button");
const lightStatisticsIconCopyButtonElement = findElement("#light-statistics-icon-copy");
const lightStatisticsIconMenuElement = findElement("#light-statistics-icon-menu");
const lightStatisticsIconSearchInputElement = findElement("#light-statistics-icon-search");
const lightStatisticsIconOptionsElement = findElement("#light-statistics-icon-options");
const lightStatisticsIconVisibleButtonElement = findElement("#light-statistics-icon-visible");
const lightStatisticsIconColorInputElement = findElement("#light-statistics-icon-color");
const lightStatisticsIconActiveColorInputElement = findElement(
  "#light-statistics-icon-active-color"
);
const lightStatisticsIconSizeInputElement = findElement("#light-statistics-icon-size");
const lightStatisticsTitleVisibleButtonElement = findElement("#light-statistics-title-visible");
const lightStatisticsTitleColorInputElement = findElement("#light-statistics-title-color");
const lightStatisticsTitleSizeInputElement = findElement("#light-statistics-title-size");
const lightStatisticsTitleWeightInputElement = findElement("#light-statistics-title-weight");
const lightStatisticsTitleSpacingInputElement = findElement("#light-statistics-title-spacing");
const lightStatisticsCountVisibleButtonElement = findElement("#light-statistics-count-visible");
const lightStatisticsCountColorInputElement = findElement("#light-statistics-count-color");
const lightStatisticsCountActiveColorInputElement = findElement(
  "#light-statistics-count-active-color"
);
const lightStatisticsCountSizeInputElement = findElement("#light-statistics-count-size");
const lightStatisticsCountWeightInputElement = findElement("#light-statistics-count-weight");
const lightStatisticsCountSpacingInputElement = findElement("#light-statistics-count-spacing");
const lightStatisticsIconGapInputElement = findElement("#light-statistics-icon-gap");
const lightStatisticsCountGapInputElement = findElement("#light-statistics-count-gap");
const lightStatisticsLeftInputElement = findElement("#light-statistics-left");
const lightStatisticsTopInputElement = findElement("#light-statistics-top");
const lightStatisticsWidthInputElement = findElement("#light-statistics-width");
const lightStatisticsHeightInputElement = findElement("#light-statistics-height");
const lightStatisticsScaleInputElement = findElement("#light-statistics-scale");
const lightStatisticsRotationInputElement = findElement("#light-statistics-rotation");
const iconButtonInspectorFormElement = findElement("#icon-button-inspector");
const iconButtonTypeLabelElement = findElement("#icon-button-type-label");
const iconButtonTypeTextInputElement = findElement("#icon-button-type");
const iconButtonLabelTextInputElement = findElement("#icon-button-label");
const presenceSensorKindLabelElement = findElement("#presence-sensor-kind-label");
const presenceSensorKindSelectElement = findElement("#presence-sensor-kind");
const iconButtonEntityButtonElement = findElement("#icon-button-entity-button");
const iconButtonEntityMenuElement = findElement("#icon-button-entity-menu");
const iconButtonEntitySearchInputElement = findElement("#icon-button-entity-search");
const iconButtonEntityOptionsElement = findElement("#icon-button-entity-options");
const coverSettingsInspectorElement = findElement("#cover-settings-inspector");
const coverSettingsKindElement = findElement("#cover-settings-kind");
const coverSettingsDirectionElement = findElement("#cover-settings-direction");
const coverSettingsMotorDirectionElement = findElement("#cover-settings-motor-direction");
const iconButtonPreviewStateElement = findElement("#icon-button-preview-state");
const iconButtonPreviewControlElement = findElement("#icon-button-preview-control");
const iconButtonIconButtonElement = findElement("#icon-button-icon-button");
const iconButtonIconCopyButtonElement = findElement("#icon-button-icon-copy");
const iconButtonIconMenuElement = findElement("#icon-button-icon-menu");
const iconButtonIconSearchInputElement = findElement("#icon-button-icon-search");
const iconButtonIconOptionsElement = findElement("#icon-button-icon-options");
const iconButtonIconColorInputElement = findElement("#icon-button-icon-color");
const iconButtonIconColorLabelElement = findElement("#icon-button-icon-color-label");
const deviceButtonIconVisibleButtonElement = findElement("#device-button-icon-visible");
const deviceButtonIconOnColorInputElement = findElement("#device-button-icon-on-color");
const deviceButtonIconOnColorLabelElement = findElement("#device-button-icon-on-color-label");
const deviceButtonBadgeColorInputElement = findElement("#device-button-badge-color");
const deviceButtonBadgeColorLabelElement = findElement("#device-button-badge-color-label");
const deviceButtonBadgeOpacityInputElement = findElement("#device-button-badge-opacity");
const deviceButtonBadgeOpacityLabelElement = findElement("#device-button-badge-opacity-label");
const iconButtonIconSizeInputElement = findElement("#icon-button-icon-size");
const iconButtonIconSizeLabelElement = findElement("#icon-button-icon-size-label");
const deviceButtonSymbolSizeInputElement = findElement("#device-button-symbol-size");
const deviceButtonSymbolSizeLabelElement = findElement("#device-button-symbol-size-label");
const deviceButtonBadgeSizeInputElement = findElement("#device-button-badge-size");
const deviceButtonBadgeSizeLabelElement = findElement("#device-button-badge-size-label");
const deviceButtonStatePrecisionSelectElement = findElement("#device-button-state-precision");
const deviceButtonStatePrecisionLabelElement = findElement("#device-button-state-precision-label");
const iconButtonIconOffOpacityInputElement = findElement("#icon-button-icon-off-opacity");
const iconButtonIconOnOpacityInputElement = findElement("#icon-button-icon-on-opacity");
const iconButtonIconOffOpacityLabelElement = findElement("#icon-button-icon-off-opacity-label");
const iconButtonIconOnOpacityLabelElement = findElement("#icon-button-icon-on-opacity-label");
const iconButtonIconLeftInputElement = findElement("#icon-button-icon-left");
const iconButtonIconTopInputElement = findElement("#icon-button-icon-top");
const iconButtonMainTextInputElement = findElement("#icon-button-main-text");
const iconButtonSecondaryTextInputElement = findElement("#icon-button-secondary-text");
const iconButtonMainHeadingElement = findElement("#icon-button-main-heading");
const deviceButtonMainVisibleButtonElement = findElement("#device-button-main-visible");
const iconButtonSecondaryHeadingElement = findElement("#icon-button-secondary-heading");
const deviceButtonSecondaryVisibleButtonElement = findElement("#device-button-secondary-visible");
const iconButtonMainContentLabelElement = findElement("#icon-button-main-content-label");
const iconButtonSecondaryContentLabelElement = findElement("#icon-button-secondary-content-label");
const iconButtonMainColorInputElement = findElement("#icon-button-main-color");
const iconButtonSecondaryColorInputElement = findElement("#icon-button-secondary-color");
const iconButtonMainOffOpacityInputElement = findElement("#icon-button-main-off-opacity");
const iconButtonMainOnOpacityInputElement = findElement("#icon-button-main-on-opacity");
const iconButtonSecondaryOffOpacityInputElement = findElement("#icon-button-secondary-off-opacity");
const iconButtonSecondaryOnOpacityInputElement = findElement("#icon-button-secondary-on-opacity");
const iconButtonMainOffOpacityLabelElement = findElement("#icon-button-main-off-opacity-label");
const iconButtonMainOnOpacityLabelElement = findElement("#icon-button-main-on-opacity-label");
const iconButtonSecondaryOffOpacityLabelElement = findElement(
  "#icon-button-secondary-off-opacity-label"
);
const iconButtonSecondaryOnOpacityLabelElement = findElement(
  "#icon-button-secondary-on-opacity-label"
);
const iconButtonMainSizeInputElement = findElement("#icon-button-main-size");
const iconButtonSecondarySizeInputElement = findElement("#icon-button-secondary-size");
const iconButtonMainWeightInputElement = findElement("#icon-button-main-weight");
const iconButtonSecondaryWeightInputElement = findElement("#icon-button-secondary-weight");
const iconButtonMainSpacingInputElement = findElement("#icon-button-main-spacing");
const iconButtonSecondarySpacingInputElement = findElement("#icon-button-secondary-spacing");
const iconButtonMainLeftInputElement = findElement("#icon-button-main-left");
const iconButtonMainTopInputElement = findElement("#icon-button-main-top");
const iconButtonSecondaryLeftInputElement = findElement("#icon-button-secondary-left");
const iconButtonSecondaryTopInputElement = findElement("#icon-button-secondary-top");
const iconButtonOnFillVisibleButtonElement = findElement("#icon-button-on-fill-visible");
const iconButtonFillSectionElement = findElement("#icon-button-fill-section");
const iconButtonOnFillColorInputElement = findElement("#icon-button-on-fill-color");
const iconButtonOnFillStrengthInputElement = findElement("#icon-button-on-fill-strength");
const iconButtonOnFillFadeDurationInputElement = findElement("#icon-button-on-fill-fade-duration");
const iconButtonFrameVisibleButtonElement = findElement("#icon-button-frame-visible");
const iconButtonFrameSectionElement = findElement("#icon-button-frame-section");
const iconButtonFrameWidthInputElement = findElement("#icon-button-frame-width");
const iconButtonFrameAngleInputElement = findElement("#icon-button-frame-angle");
const iconButtonFrameOffOpacityInputElement = findElement("#icon-button-frame-off-opacity");
const iconButtonFrameOnOpacityInputElement = findElement("#icon-button-frame-on-opacity");
const iconButtonCutCornerInputElement = findElement("#icon-button-cut-corner");
const iconButtonSoftLightVisibleButtonElement = findElement("#icon-button-soft-light-visible");
const iconButtonSoftLightSectionElement = findElement("#icon-button-soft-light-section");
const iconButtonSoftLightColorInputElement = findElement("#icon-button-soft-light-color");
const iconButtonSoftLightStrengthInputElement = findElement("#icon-button-soft-light-strength");
const iconButtonSoftLightSizeInputElement = findElement("#icon-button-soft-light-size");
const iconButtonSoftLightAngleInputElement = findElement("#icon-button-soft-light-angle");
const iconButtonGlowVisibleButtonElement = findElement("#icon-button-glow-visible");
const iconButtonGlowSectionElement = findElement("#icon-button-glow-section");
const iconButtonGlowColorInputElement = findElement("#icon-button-glow-color");
const iconButtonGlowStrengthInputElement = findElement("#icon-button-glow-strength");
const iconButtonGlowSizeInputElement = findElement("#icon-button-glow-size");
const iconButtonGlowAngleInputElement = findElement("#icon-button-glow-angle");
const iconButtonLeftInputElement = findElement("#icon-button-left");
const iconButtonTopInputElement = findElement("#icon-button-top");
const iconButtonWidthInputElement = findElement("#icon-button-width");
const iconButtonHeightInputElement = findElement("#icon-button-height");
const iconButtonScaleInputElement = findElement("#icon-button-scale");
const iconButtonRotationInputElement = findElement("#icon-button-rotation");
const iconButtonActionControlsElement = findElement("#icon-button-action-controls");
const iconButtonActionSectionElement = findElement("#icon-button-action-section");
const iconButtonPreviewDetailsButtonElement = findElement("#icon-button-preview-details");
const iconButtonApplyStyleButtonElement = findElement("#icon-button-apply-style");
const iconButtonApplyCountElement = findElement("#icon-button-apply-count");
const presenceMotionSectionElement = findElement("#presence-motion-section");
const doorWindowPerspectiveSectionElement = findElement("#door-window-perspective-section");
const doorWindowPerspectiveEditButtonElement = findElement("#door-window-perspective-edit");
const doorWindowPerspectiveResetButtonElement = findElement("#door-window-perspective-reset");
const doorWindowPerspectiveSaveButtonElement = findElement("#door-window-perspective-save");
const presenceHaloVisibleButtonElement = findElement("#presence-halo-visible");
const presenceHaloScaleXInputElement = findElement("#presence-halo-scale-x");
const presenceHaloScaleYInputElement = findElement("#presence-halo-scale-y");
const presenceHaloRotationInputElement = findElement("#presence-halo-rotation");
const presenceHaloOpacityInputElement = findElement("#presence-halo-opacity");
const presencePersonVisibleButtonElement = findElement("#presence-person-visible");
const presencePersonScaleInputElement = findElement("#presence-person-scale");
const presencePersonRotationInputElement = findElement("#presence-person-rotation");
const presencePersonOpacityInputElement = findElement("#presence-person-opacity");
const presenceOrbitDurationInputElement = findElement("#presence-orbit-duration");
const airConditionerInspectorFormElement = findElement("#air-conditioner-inspector");
const airConditionerLabelTextInputElement = findElement("#air-conditioner-label");
const airConditionerDeviceTypeElement = findElement("#air-conditioner-device-type");
const airConditionerEntityButtonElement = findElement("#air-conditioner-entity-button");
const airConditionerEntityMenuElement = findElement("#air-conditioner-entity-menu");
const airConditionerEntitySearchInputElement = findElement("#air-conditioner-entity-search");
const airConditionerEntityOptionsElement = findElement("#air-conditioner-entity-options");
const airConditionerPreviewStateElement = findElement("#air-conditioner-preview-state");
const airConditionerLayerOptionsElement = findElement("#air-conditioner-layer-options");
const airConditionerButtonSectionElement = findElement("#air-conditioner-button-section");
const airConditionerAirflowSectionElement = findElement("#air-conditioner-airflow-section");
const airConditionerTransformSectionElement = findElement("#air-conditioner-transform-section");
const airConditionerActionSectionElement = findElement("#air-conditioner-action-section");
const airConditionerIconVisibleButtonElement = findElement("#air-conditioner-icon-visible");
const airConditionerIconOffColorInputElement = findElement("#air-conditioner-icon-off-color");
const airConditionerIconOnColorInputElement = findElement("#air-conditioner-icon-on-color");
const airConditionerBadgeColorInputElement = findElement("#air-conditioner-badge-color");
const airConditionerBadgeOpacityInputElement = findElement("#air-conditioner-badge-opacity");
const airConditionerSymbolSizeInputElement = findElement("#air-conditioner-symbol-size");
const airConditionerBadgeSizeInputElement = findElement("#air-conditioner-badge-size");
const airConditionerIconLeftInputElement = findElement("#air-conditioner-icon-left");
const airConditionerIconTopInputElement = findElement("#air-conditioner-icon-top");
const airConditionerMainVisibleButtonElement = findElement("#air-conditioner-main-visible");
const airConditionerMainTextInputElement = findElement("#air-conditioner-main-text");
const airConditionerMainColorInputElement = findElement("#air-conditioner-main-color");
const airConditionerMainSizeInputElement = findElement("#air-conditioner-main-size");
const airConditionerMainWeightInputElement = findElement("#air-conditioner-main-weight");
const airConditionerMainSpacingInputElement = findElement("#air-conditioner-main-spacing");
const airConditionerMainLeftInputElement = findElement("#air-conditioner-main-left");
const airConditionerMainTopInputElement = findElement("#air-conditioner-main-top");
const airConditionerSecondaryVisibleButtonElement = findElement(
  "#air-conditioner-secondary-visible"
);
const airConditionerSecondaryTextInputElement = findElement("#air-conditioner-secondary-text");
const airConditionerSecondaryColorInputElement = findElement("#air-conditioner-secondary-color");
const airConditionerSecondarySizeInputElement = findElement("#air-conditioner-secondary-size");
const airConditionerSecondaryWeightInputElement = findElement("#air-conditioner-secondary-weight");
const airConditionerSecondarySpacingInputElement = findElement(
  "#air-conditioner-secondary-spacing"
);
const airConditionerSecondaryLeftInputElement = findElement("#air-conditioner-secondary-left");
const airConditionerSecondaryTopInputElement = findElement("#air-conditioner-secondary-top");
const airConditionerAirflowVisibleButtonElement = findElement("#air-conditioner-airflow-visible");
const airConditionerAirflowMotionElement = findElement("#air-conditioner-airflow-motion");
const airConditionerAirflowCoolColorInputElement = findElement(
  "#air-conditioner-airflow-cool-color"
);
const airConditionerAirflowHeatColorInputElement = findElement(
  "#air-conditioner-airflow-heat-color"
);
const airConditionerAirflowOtherColorInputElement = findElement(
  "#air-conditioner-airflow-other-color"
);
const airConditionerAirflowAngleInputElement = findElement("#air-conditioner-airflow-angle");
const airConditionerAirflowCurveInputElement = findElement("#air-conditioner-airflow-curve");
const airConditionerAirflowLengthInputElement = findElement("#air-conditioner-airflow-length");
const airConditionerAirflowFadeInputElement = findElement("#air-conditioner-airflow-fade");
const airConditionerAirflowSpreadInputElement = findElement("#air-conditioner-airflow-spread");
const airConditionerAirflowDensityInputElement = findElement("#air-conditioner-airflow-density");
const airConditionerAirflowIrregularityInputElement = findElement(
  "#air-conditioner-airflow-irregularity"
);
const airConditionerAirflowThicknessInputElement = findElement(
  "#air-conditioner-airflow-thickness"
);
const airConditionerAirflowStrengthInputElement = findElement("#air-conditioner-airflow-strength");
const airConditionerAirflowBlurInputElement = findElement("#air-conditioner-airflow-blur");
const airConditionerAirflowSpeedInputElement = findElement("#air-conditioner-airflow-speed");
const airConditionerAirflowOffsetXInputElement = findElement("#air-conditioner-airflow-offset-x");
const airConditionerAirflowOffsetYInputElement = findElement("#air-conditioner-airflow-offset-y");
const airConditionerAirflowWidthInputElement = findElement("#air-conditioner-airflow-width");
const airConditionerAirflowHeightInputElement = findElement("#air-conditioner-airflow-height");
const airConditionerAirflowScaleInputElement = findElement("#air-conditioner-airflow-scale");
const airConditionerAirflowRotationInputElement = findElement("#air-conditioner-airflow-rotation");
const airConditionerLeftInputElement = findElement("#air-conditioner-left");
const airConditionerTopInputElement = findElement("#air-conditioner-top");
const airConditionerWidthInputElement = findElement("#air-conditioner-width");
const airConditionerHeightInputElement = findElement("#air-conditioner-height");
const airConditionerScaleInputElement = findElement("#air-conditioner-scale");
const airConditionerRotationInputElement = findElement("#air-conditioner-rotation");
const airConditionerActionControlsElement = findElement("#air-conditioner-action-controls");
const airConditionerPreviewDetailsButtonElement = findElement("#air-conditioner-preview-details");
const airConditionerApplyStyleButtonElement = findElement("#air-conditioner-apply-style");
const airConditionerApplyCountElement = findElement("#air-conditioner-apply-count");
const vacuumMapInspectorFormElement = findElement("#vacuum-map-inspector");
const vacuumMapLabelTextInputElement = findElement("#vacuum-map-label");
const vacuumMapEntityButtonElement = findElement("#vacuum-map-entity-button");
const vacuumMapEntityMenuElement = findElement("#vacuum-map-entity-menu");
const vacuumMapEntitySearchInputElement = findElement("#vacuum-map-entity-search");
const vacuumMapEntityOptionsElement = findElement("#vacuum-map-entity-options");
const vacuumMapOpacityInputElement = findElement("#vacuum-map-opacity");
const vacuumMapLeftInputElement = findElement("#vacuum-map-left");
const vacuumMapTopInputElement = findElement("#vacuum-map-top");
const vacuumMapScaleInputElement = findElement("#vacuum-map-scale");
const vacuumMapRotationInputElement = findElement("#vacuum-map-rotation");
const cameraInspectorFormElement = findElement("#camera-inspector");
const cameraLabelTextInputElement = findElement("#camera-label");
const cameraEntityButtonElement = findElement("#camera-entity-button");
const cameraEntityMenuElement = findElement("#camera-entity-menu");
const cameraEntitySearchInputElement = findElement("#camera-entity-search");
const cameraEntityOptionsElement = findElement("#camera-entity-options");
const cameraFitOptionsElement = findElement("#camera-fit-options");
const cameraDisplayModeOptionsElement = findElement("#camera-display-mode-options");
const cameraRefreshIntervalFieldElement = findElement("#camera-refresh-interval-field");
const cameraRefreshIntervalInputElement = findElement("#camera-refresh-interval");
const cameraMediaVisibleButtonElement = findElement("#camera-media-visible");
const cameraFrameVisibleButtonElement = findElement("#camera-frame-visible");
const cameraFrameColorInputElement = findElement("#camera-frame-color");
const cameraFrameWidthInputElement = findElement("#camera-frame-width");
const cameraRadiusInputElement = findElement("#camera-radius");
const cameraFrameAngleInputElement = findElement("#camera-frame-angle");
const cameraFrameOpacityInputElement = findElement("#camera-frame-opacity");
const cameraLeftInputElement = findElement("#camera-left");
const cameraTopInputElement = findElement("#camera-top");
const cameraWidthInputElement = findElement("#camera-width");
const cameraHeightInputElement = findElement("#camera-height");
const cameraScaleInputElement = findElement("#camera-scale");
const cameraRotationInputElement = findElement("#camera-rotation");
const cameraActionControlsElement = findElement("#camera-action-controls");
const cameraApplyStyleButtonElement = findElement("#camera-apply-style");
const cameraApplyCountElement = findElement("#camera-apply-count");
const timeInspectorFormElement = findElement("#time-inspector");
const timeTypeTextInputElement = findElement("#time-type");
const timeLabelTextInputElement = findElement("#time-label");
const timeHourFormatElement = findElement("#time-hour-format");
const timeSecondsElement = findElement("#time-seconds");
const timeColorInputElement = findElement("#time-color");
const timeFontSizeInputElement = findElement("#time-font-size");
const timeFontWeightInputElement = findElement("#time-font-weight");
const timeLetterSpacingInputElement = findElement("#time-letter-spacing");
const timeOpacityInputElement = findElement("#time-opacity");
const timeLeftInputElement = findElement("#time-left");
const timeTopInputElement = findElement("#time-top");
const timeScaleInputElement = findElement("#time-scale");
const timeRotationInputElement = findElement("#time-rotation");
const dateInspectorFormElement = findElement("#date-inspector");
const dateTypeTextInputElement = findElement("#date-type");
const dateLabelTextInputElement = findElement("#date-label");
const dateWeekdayElement = findElement("#date-weekday");
const dateLunarElement = findElement("#date-lunar");
const datePrimaryColorInputElement = findElement("#date-primary-color");
const datePrimarySizeInputElement = findElement("#date-primary-size");
const datePrimaryWeightInputElement = findElement("#date-primary-weight");
const datePrimarySpacingInputElement = findElement("#date-primary-spacing");
const dateLunarColorInputElement = findElement("#date-lunar-color");
const dateLunarSizeInputElement = findElement("#date-lunar-size");
const dateLunarWeightInputElement = findElement("#date-lunar-weight");
const dateLunarSpacingInputElement = findElement("#date-lunar-spacing");
const dateLineGapInputElement = findElement("#date-line-gap");
const dateOpacityInputElement = findElement("#date-opacity");
const dateLeftInputElement = findElement("#date-left");
const dateTopInputElement = findElement("#date-top");
const dateScaleInputElement = findElement("#date-scale");
const dateRotationInputElement = findElement("#date-rotation");
const weatherInspectorFormElement = findElement("#weather-inspector");
const weatherTypeTextInputElement = findElement("#weather-type");
const weatherLabelTextInputElement = findElement("#weather-label");
const weatherEntityButtonElement = findElement("#weather-entity-button");
const weatherEntityMenuElement = findElement("#weather-entity-menu");
const weatherEntitySearchInputElement = findElement("#weather-entity-search");
const weatherEntityOptionsElement = findElement("#weather-entity-options");
const weatherIconVisibleElement = findElement("#weather-icon-visible");
const weatherTemperatureVisibleElement = findElement("#weather-temperature-visible");
const weatherConditionVisibleElement = findElement("#weather-condition-visible");
const weatherHumidityVisibleElement = findElement("#weather-humidity-visible");
const weatherIconSizeInputElement = findElement("#weather-icon-size");
const weatherIconGapInputElement = findElement("#weather-icon-gap");
const weatherTemperatureColorInputElement = findElement("#weather-temperature-color");
const weatherTemperatureSizeInputElement = findElement("#weather-temperature-size");
const weatherTemperatureWeightInputElement = findElement("#weather-temperature-weight");
const weatherTemperatureSpacingInputElement = findElement("#weather-temperature-spacing");
const weatherSecondaryColorInputElement = findElement("#weather-secondary-color");
const weatherSecondarySizeInputElement = findElement("#weather-secondary-size");
const weatherSecondaryWeightInputElement = findElement("#weather-secondary-weight");
const weatherSecondarySpacingInputElement = findElement("#weather-secondary-spacing");
const weatherLineGapInputElement = findElement("#weather-line-gap");
const weatherOpacityInputElement = findElement("#weather-opacity");
const weatherLeftInputElement = findElement("#weather-left");
const weatherTopInputElement = findElement("#weather-top");
const weatherScaleInputElement = findElement("#weather-scale");
const weatherRotationInputElement = findElement("#weather-rotation");
const lineChartInspectorFormElement = findElement("#line-chart-inspector");
const lineChartTypeTextInputElement = findElement("#line-chart-type");
const lineChartLabelTextInputElement = findElement("#line-chart-label");
const lineChartEntityButtonElement = findElement("#line-chart-entity-button");
const lineChartEntityMenuElement = findElement("#line-chart-entity-menu");
const lineChartEntitySearchInputElement = findElement("#line-chart-entity-search");
const lineChartEntityOptionsElement = findElement("#line-chart-entity-options");
const lineChartValueVisibleElement = findElement("#line-chart-value-visible");
const lineChartValueScaleInputElement = findElement("#line-chart-value-scale");
const lineChartValueColorInputElement = findElement("#line-chart-value-color");
const lineChartStatePrecisionSelectElement = findElement("#line-chart-state-precision");
const lineChartValueOffsetXInputElement = findElement("#line-chart-value-offset-x");
const lineChartValueOffsetYInputElement = findElement("#line-chart-value-offset-y");
const lineChartUpdateIntervalInputElement = findElement("#line-chart-update-interval");
const lineChartHoursInputElement = findElement("#line-chart-hours");
const lineChartCurveRadiusInputElement = findElement("#line-chart-curve-radius");
const lineChartThresholdModeSelectElement = findElement("#line-chart-threshold-mode");
const lineChartThresholdInputs = [1, 2, 3, 4].map(thresholdIndex => ({
  value: findElement("#line-chart-threshold-" + thresholdIndex + "-value"),
  color: findElement("#line-chart-threshold-" + thresholdIndex + "-color")
}));
const lineChartLeftInputElement = findElement("#line-chart-left");
const lineChartTopInputElement = findElement("#line-chart-top");
const lineChartWidthInputElement = findElement("#line-chart-width");
const lineChartHeightInputElement = findElement("#line-chart-height");
const lineChartScaleInputElement = findElement("#line-chart-scale");
const lineChartRotationInputElement = findElement("#line-chart-rotation");
const lineChartActionControlsElement = findElement("#line-chart-action-controls");
const lineChartApplyStyleButtonElement = findElement("#line-chart-apply-style");
const lineChartApplyCountElement = findElement("#line-chart-apply-count");
const panelFrameInspectorFormElement = findElement("#panel-frame-inspector");
const panelFrameTypeTextInputElement = findElement("#panel-frame-type");
const panelFrameLabelTextInputElement = findElement("#panel-frame-label");
const panelFrameMainVisibleButtonElement = findElement("#panel-frame-main-visible");
const panelFrameMainTextInputElement = findElement("#panel-frame-main-text");
const panelFrameMainColorInputElement = findElement("#panel-frame-main-color");
const panelFrameMainSizeInputElement = findElement("#panel-frame-main-size");
const panelFrameMainWeightInputElement = findElement("#panel-frame-main-weight");
const panelFrameMainOpacityInputElement = findElement("#panel-frame-main-opacity");
const panelFrameMainSpacingInputElement = findElement("#panel-frame-main-spacing");
const panelFrameMainLeftInputElement = findElement("#panel-frame-main-left");
const panelFrameMainTopInputElement = findElement("#panel-frame-main-top");
const panelFrameSecondaryVisibleButtonElement = findElement("#panel-frame-secondary-visible");
const panelFrameSecondaryTextInputElement = findElement("#panel-frame-secondary-text");
const panelFrameSecondaryColorInputElement = findElement("#panel-frame-secondary-color");
const panelFrameSecondarySizeInputElement = findElement("#panel-frame-secondary-size");
const panelFrameSecondaryWeightInputElement = findElement("#panel-frame-secondary-weight");
const panelFrameSecondaryOpacityInputElement = findElement("#panel-frame-secondary-opacity");
const panelFrameSecondarySpacingInputElement = findElement("#panel-frame-secondary-spacing");
const panelFrameSecondaryLeftInputElement = findElement("#panel-frame-secondary-left");
const panelFrameSecondaryTopInputElement = findElement("#panel-frame-secondary-top");
const panelFrameEdgeVisibleButtonElement = findElement("#panel-frame-edge-visible");
const panelFrameEdgeColorInputElement = findElement("#panel-frame-edge-color");
const panelFrameEdgeWidthInputElement = findElement("#panel-frame-edge-width");
const panelFrameEdgeOpacityInputElement = findElement("#panel-frame-edge-opacity");
const panelFrameRadiusInputElement = findElement("#panel-frame-radius");
const panelFrameEdgeAngleInputElement = findElement("#panel-frame-edge-angle");
const panelFrameGlowVisibleButtonElement = findElement("#panel-frame-glow-visible");
const panelFrameGlowColorInputElement = findElement("#panel-frame-glow-color");
const panelFrameGlowStrengthInputElement = findElement("#panel-frame-glow-strength");
const panelFrameGlowSizeInputElement = findElement("#panel-frame-glow-size");
const panelFrameGlowAngleInputElement = findElement("#panel-frame-glow-angle");
const panelFrameLeftInputElement = findElement("#panel-frame-left");
const panelFrameTopInputElement = findElement("#panel-frame-top");
const panelFrameWidthInputElement = findElement("#panel-frame-width");
const panelFrameHeightInputElement = findElement("#panel-frame-height");
const panelFrameScaleInputElement = findElement("#panel-frame-scale");
const panelFrameRotationInputElement = findElement("#panel-frame-rotation");
const panelFrameApplyStyleButtonElement = findElement("#panel-frame-apply-style");
const panelFrameApplyCountElement = findElement("#panel-frame-apply-count");
const navigationInspectorFormElement = findElement("#navigation-inspector");
const navigationTypeTextInputElement = findElement("#navigation-type");
const navigationLabelTextInputElement = findElement("#navigation-label");
const navigationPreviewStateElement = findElement("#navigation-preview-state");
const navigationEntityButtonElement = findElement("#navigation-entity-button");
const navigationEntityMenuElement = findElement("#navigation-entity-menu");
const navigationEntitySearchInputElement = findElement("#navigation-entity-search");
const navigationEntityOptionsElement = findElement("#navigation-entity-options");
const navigationMainTextInputElement = findElement("#navigation-main-text");
const navigationSecondaryTextInputElement = findElement("#navigation-secondary-text");
const navigationMainVisibleButtonElement = findElement("#navigation-main-visible");
const navigationSecondaryVisibleButtonElement = findElement("#navigation-secondary-visible");
const navigationIconVisibleButtonElement = findElement("#navigation-icon-visible");
const navigationFrameVisibleButtonElement = findElement("#navigation-frame-visible");
const navigationGlowVisibleButtonElement = findElement("#navigation-glow-visible");
const navigationIconButtonElement = findElement("#navigation-icon-button");
const navigationIconCopyButtonElement = findElement("#navigation-icon-copy");
const navigationIconMenuElement = findElement("#navigation-icon-menu");
const navigationIconSearchInputElement = findElement("#navigation-icon-search");
const navigationIconOptionsElement = findElement("#navigation-icon-options");
const navigationMainColorInputElement = findElement("#navigation-main-color");
const navigationSecondaryColorInputElement = findElement("#navigation-secondary-color");
const navigationMainSizeInputElement = findElement("#navigation-main-size");
const navigationSecondarySizeInputElement = findElement("#navigation-secondary-size");
const navigationMainWeightInputElement = findElement("#navigation-main-weight");
const navigationSecondaryWeightInputElement = findElement("#navigation-secondary-weight");
const navigationMainSpacingInputElement = findElement("#navigation-main-spacing");
const navigationSecondarySpacingInputElement = findElement("#navigation-secondary-spacing");
const navigationMainTextLeftInputElement = findElement("#navigation-main-text-left");
const navigationMainTextTopInputElement = findElement("#navigation-main-text-top");
const navigationSecondaryTextLeftInputElement = findElement("#navigation-secondary-text-left");
const navigationSecondaryTextTopInputElement = findElement("#navigation-secondary-text-top");
const navigationTextIdleOpacityInputElement = findElement("#navigation-text-idle-opacity");
const navigationTextActiveOpacityInputElement = findElement("#navigation-text-active-opacity");
const navigationIconColorInputElement = findElement("#navigation-icon-color");
const navigationIconSizeInputElement = findElement("#navigation-icon-size");
const navigationIconLeftInputElement = findElement("#navigation-icon-left");
const navigationIconTopInputElement = findElement("#navigation-icon-top");
const navigationIconIdleOpacityInputElement = findElement("#navigation-icon-idle-opacity");
const navigationIconActiveOpacityInputElement = findElement("#navigation-icon-active-opacity");
const navigationFrameColorInputElement = findElement("#navigation-frame-color");
const navigationFrameWidthInputElement = findElement("#navigation-frame-width");
const navigationFrameIdleOpacityInputElement = findElement("#navigation-frame-idle-opacity");
const navigationFrameActiveOpacityInputElement = findElement("#navigation-frame-active-opacity");
const navigationFrameAngleInputElement = findElement("#navigation-frame-angle");
const navigationGlowColorInputElement = findElement("#navigation-glow-color");
const navigationGlowAngleInputElement = findElement("#navigation-glow-angle");
const navigationGlowIdleStrengthInputElement = findElement("#navigation-glow-idle-strength");
const navigationGlowIdleSizeInputElement = findElement("#navigation-glow-idle-size");
const navigationGlowActiveStrengthInputElement = findElement("#navigation-glow-active-strength");
const navigationGlowActiveSizeInputElement = findElement("#navigation-glow-active-size");
const navigationRadiusInputElement = findElement("#navigation-radius");
const navigationLeftInputElement = findElement("#navigation-left");
const navigationTopInputElement = findElement("#navigation-top");
const navigationWidthInputElement = findElement("#navigation-width");
const navigationHeightInputElement = findElement("#navigation-height");
const navigationScaleInputElement = findElement("#navigation-scale");
const navigationRotationInputElement = findElement("#navigation-rotation");
const navigationActionControlsElement = findElement("#navigation-action-controls");
const navigationApplyStyleButtonElement = findElement("#navigation-apply-style");
const navigationApplyCountElement = findElement("#navigation-apply-count");
const navigationStyleApplyDialogElement = findElement("#navigation-style-apply-dialog");
const navigationStyleApplyCloseButtonElement = findElement("#navigation-style-apply-close");
const navigationStyleApplyTitleElement = findElement("#navigation-style-apply-title");
const navigationStyleApplySummaryElement = findElement("#navigation-style-apply-summary");
const navigationStyleApplyPropertiesElement = findElement("#navigation-style-apply-properties");
const navigationStyleApplyTargetHeadingElement = findElement(
  "#navigation-style-apply-target-heading"
);
const navigationStyleApplyTargetScopeElement = findElement("#navigation-style-apply-target-scope");
const navigationStyleApplyTargetsElement = findElement("#navigation-style-apply-targets");
const navigationStyleApplyMessageElement = findElement("#navigation-style-apply-message");
const navigationStyleApplyCancelButtonElement = findElement("#navigation-style-apply-cancel");
const navigationStyleApplyConfirmButtonElement = findElement("#navigation-style-apply-confirm");
const popupNameDialogElement = findElement("#popup-name-dialog");
const popupNameDialogTitleElement = findElement("#popup-name-dialog-title");
const popupNameFormElement = findElement("#popup-name-form");
const popupNameCloseButtonElement = findElement("#popup-name-close");
const popupNameCancelButtonElement = findElement("#popup-name-cancel");
const popupModuleDialogElement = findElement("#popup-module-dialog");
const popupModuleDialogTitleElement = findElement("#popup-module-dialog-title");
const popupModuleFormElement = findElement("#popup-module-form");
const popupModuleCloseButtonElement = findElement("#popup-module-close");
const popupModuleCancelButtonElement = findElement("#popup-module-cancel");
const popupModuleEntityButtonElement = findElement("#popup-module-entity-button");
const popupModuleEntityMenuElement = findElement("#popup-module-entity-menu");
const popupModuleEntitySearchInputElement = findElement("#popup-module-entity-search");
const popupModuleEntityOptionsElement = findElement("#popup-module-entity-options");
const popupModuleClimateDeviceTypeElement = findElement("#popup-module-climate-device-type");
const deletePopupDialogElement = findElement("#delete-popup-dialog");
const deletePopupCloseButtonElement = findElement("#delete-popup-close");
const deletePopupCancelButtonElement = findElement("#delete-popup-cancel");
const deletePopupConfirmButtonElement = findElement("#delete-popup-confirm");
const deletePopupNameElement = findElement("#delete-popup-name");
const deletePopupUsageSummaryElement = findElement("#delete-popup-usage-summary");
const deletePopupUsageListElement = findElement("#delete-popup-usage-list");
const deleteAssetDialogElement = findElement("#delete-asset-dialog");
const deleteAssetCloseButtonElement = findElement("#delete-asset-close");
const deleteAssetCancelButtonElement = findElement("#delete-asset-cancel");
const deleteAssetConfirmButtonElement = findElement("#delete-asset-confirm");
const deleteAssetNameElement = findElement("#delete-asset-name");
const deleteAssetFolderDialogElement = findElement("#delete-asset-folder-dialog");
const deleteAssetFolderCloseButtonElement = findElement("#delete-asset-folder-close");
const deleteAssetFolderCancelButtonElement = findElement("#delete-asset-folder-cancel");
const deleteAssetFolderConfirmButtonElement = findElement("#delete-asset-folder-confirm");
const deleteAssetFolderNameElement = findElement("#delete-asset-folder-name");
const deleteAssetFolderCountElement = findElement("#delete-asset-folder-count");
// ===== 模块级状态：整份编辑器状态就散在这些变量里，没有集中式 store =====

// HA 连接信息与状态缓存，仅用于设置弹窗展示，缺失时按「未配置」处理。
let haConnectionInfo = null;
let haConnectionStatus = null;
// 编辑画布与预览画布各持一个渲染器实例：两者必须分开，
// 否则预览里的运行态（开关、图表历史）会污染编辑视图。
let editorRenderer = null;
let dashboardPreviewRenderer = null;
// 图表历史与实体运行态按「页面 + 组件」缓存，切换页面时复用，避免重新拉一遍数据。
const historySeriesCache = new Map();
const runtimeStateCache = new Map();
const virtualEntityStateCache = new Map();
// edit 为编辑模式，preview 为展示预览模式；由 setEditorMode 统一切换。
let editorMode = "edit";
let projects = [];
let activeProject = null;
let componentScope = "shared";
let projectDialogMode = "create";
let resizeWarningResolve = null;
let isAspectLocked = false;
let lockedCanvasWidth = 2778;
let lockedCanvasHeight = 1940;
let pageDialogMode = "create";
let isEditingHaConnection = false;
let haTestPromise = null;
let selectedComponentId = null;
let activeGroupId = null;
let lastComponentClick = {
  componentId: null,
  at: 0
};
let selectedPopupId = null;
let popupDialogMode = "create";
let selectedPopupModuleId = null;
let moduleDialogPopupId = null;
let popupModuleDraft = null;
let pendingDeleteAssetId = null;
let pendingDeleteAssetFolder = null;
// 素材目录：userAssets 是后端返回的全量素材，catalogVersionSignature 是目录版本签名，
// 轮询到签名变化才重建（见 pollAssetCatalogVersion），避免每次轮询都重排列表。
let userAssets = [];
let catalogVersionSignature = null;
// 实体与设备目录：按 deviceId 建索引是为了把实体归到设备名下做「设备名 · 实体名」的展示，
// 索引在 ensureEntitiesLoaded 一次性重建，之后只读。
let entities = [];
let devices = [];
let deviceNamesByDeviceId = new Map();
let entityResourcesByDeviceId = {};
// 并发拉取合并用的在途 Promise；多个入口同时请求实体时复用同一次网络往返。
let entitiesLoadPromise = null;
let areEntitiesLoaded = false;
let lastConnectedSignature = null;
// 所有写请求的串行队列：新写入排在上一次之后，避免同一文档并发 PUT 造成旧版本覆盖新版本。
let writeQueuePromise = Promise.resolve();
let imageAssetFolder = "";
let effectAssetFolder = "";
let assetPreviewTimeoutId = null;
// 各选择器的搜索防抖与「已复制」提示定时器：每个控件各自持有一套，
// 互相不干扰——同时打开两个图标选择器时，一个的定时器不应关掉另一个的提示。
let navigationIconSearchDebounceTimeoutId = null;
let navigationIconCopiedTimeoutId = null;
let effectIconSearchDebounceTimeoutId = null;
let effectIconCopiedTimeoutId = null;
let deviceIconSearchDebounceTimeoutId = null;
let deviceIconCopiedTimeoutId = null;
let titleButtonIconSearchDebounceTimeoutId = null;
let titleButtonIconCopiedTimeoutId = null;
let lightStatisticsIconSearchDebounceTimeoutId = null;
let lightStatisticsIconCopiedTimeoutId = null;
let statisticsEntityId = "";
let statisticsReplaceIndex = -1;
let statisticsComponentId = "";
let navigationApplyFeedbackTimeoutId = null;
let panelFrameApplyFeedbackTimeoutId = null;
let lineChartApplyFeedbackTimeoutId = null;
let effectApplyFeedbackTimeoutId = null;
let titleButtonApplyFeedbackTimeoutId = null;
let deviceButtonApplyFeedbackTimeoutId = null;
let cameraApplyFeedbackTimeoutId = null;
let airConditionerApplyFeedbackTimeoutId = null;
let appliedStyleRecord = null;
let imageAlignSourceComponentId = null;
const pendingAssetProbeKeys = new Set();
// 多选集合与「锚点」：Shift 连选时以锚点为准圈定区间，锚点本身不随框选变化。
let selectedComponentIds = new Set();
let selectionAnchorComponentId = null;
// 撤销 / 重做栈。历史条目是文档快照而不是操作指令，撤销即整体回填一份旧文档；
// busy 用于拦截重放历史期间用户再次点击撤销造成的重入。
const historyState = {
  undo: [],
  redo: [],
  busy: false
};
// 上限刻意取较小值：历史存的是整份文档快照，条目过多会让内存与复制开销明显上升。
const MAX_HISTORY_ENTRIES = 10;
// 未保存内容的会话级备份前缀；用 sessionStorage 而非 localStorage，
// 关掉标签页即失效，避免旧快照在下一次打开时被误当成新编辑内容。
const RECOVERY_STORAGE_PREFIX = "homeos:unsaved:";
// 「是否有未保存改动」不靠布尔标记维护，而是实时比较当前文档与上次保存时的签名，
// 这样任何一条漏掉标记的编辑路径都不会让脏标记失真。
let savedDocumentSignature = "";
// 进页面或保存成功时留下的基线文档，仅用于差异展示与结构比较。
let baselineDocument = null;
let hasUnsavedChanges = false;
let copyTargetDraft = null;
let copyTargetLoadToken = 0;
let copySuccessNavigationTarget = null;
let isSaving = false;
let recoverySnapshot = null;
let contextMenuComponentId = null;
const navigationPreviewStateByComponentId = new Map();
const iconButtonEffectPreviewStateByComponentId = new Map();
const iconButtonPreviewStateByComponentId = new Map();
const doorWindowPerspectiveEditIds = new Set();
const DEFAULT_PERSPECTIVE_CORNERS = Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]);
const iconButtonEffectLayerByComponentId = new Map();
const airConditionerPreviewStateByComponentId = new Map();
const floorplanAutoDiagramStateByComponentId = new Map();
const airConditionerLayerByComponentId = new Map();
const navigationButtonSavedSettingsByComponentId = new Map();
const panelFrameBaselineByComponentId = new Map();
const lineChartBaselineByComponentId = new Map();
const iconButtonEffectBaselineByComponentId = new Map();
const iconButtonBaselineByComponentId = new Map();
const airConditionerBaselineByComponentId = new Map();
const customSelectsBySelectElement = new Map();
const colorPickerBoundInputs = new Map();
const enhancedNumberInputs = new WeakSet();
let openCustomSelect = null;
let activeColorInputElement = null;
let activeColorHex = "";
let colorPickerHue = 0;
let colorPickerSaturation = 0;
let colorPickerBrightness = 1;
let colorPickerDragPointerId = null;
let colorPickerCopyResetTimer = null;
let lastLicenseFeatureSignature = null;
let isLicenseActivationFormRequested = false;
/**
 * 后端 API 的唯一出入口：统一 /api/v1 前缀、禁用缓存、统一鉴权重定向与错误形态。
 * 401 跳登录、403 + LICENSE_RESTRICTED 跳授权页，均抛错中断调用方；判定口径与错误形态见
 * utils/api-request.js（五处请求入口共用一份，后端新增受限码时不会漏跟）。其余非 2xx 把
 * detail.code 透传到 Error.code。请求悬挂必须抛错，否则「正在保存」闩不会复位。
 *
 * 与 logging/global-log-boot.js 里同名的 requestJson 是**有意分叉**，别合并：那一份是日志桥
 * 自己的传输层，构造时不挂日志桥（否则上报失败时回头关联「已上报」标记没有意义），也刻意
 * 不带授权受限分支。改这里时不必同步改那一份。
 */
async function requestJson(requestPath, requestOptions = {}) {
  const apiResponse = await apiFetch("/api/v1" + requestPath, {
    cache: "no-store",
    ...requestOptions,
    headers: requestOptions.body
      ? {
          "Content-Type": "application/json",
          ...(requestOptions.headers || {})
        }
      : requestOptions.headers
  });
  const responseText = apiResponse.status === 204 ? "" : await apiResponse.text();
  let responseBody = null;
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      if (apiResponse.ok) {
        throw new Error(
          "接口返回格式异常：" + requestPath.split("?")[0] + "（HTTP " + apiResponse.status + "）"
        );
      }
    }
  }
  const authChallenge = apiAuthChallenge(apiResponse.status, responseBody);
  if (authChallenge === "session-expired") {
    window.location.assign("/login");
    throw apiRequestError(responseBody, {
      status: apiResponse.status,
      message: "登录状态已失效。",
      response: apiResponse
    });
  }
  if (authChallenge === "license-restricted") {
    window.location.replace("/license");
    throw apiRequestError(responseBody, {
      status: apiResponse.status,
      message: "授权已失效，请重新激活。",
      response: apiResponse
    });
  }
  if (!apiResponse.ok) {
    const responseExcerpt = responseText.trim().slice(0, 240);
    // 文案归一交给 utils/api-error.js（原先这里自己判形态，只认字符串与 `detail.message`，
    // 于是 FastAPI 422 的「detail 是数组」在本接口上一律退成下面这句通用文案）。
    throw apiRequestError(responseBody, {
      status: apiResponse.status,
      fallback:
        "请求失败：" +
        requestPath.split("?")[0] +
        "（HTTP " +
        apiResponse.status +
        "）" +
        (responseExcerpt ? " · " + responseExcerpt : ""),
      response: apiResponse
    });
  }
  return responseBody;
}
/**
 * 给设置类弹窗写入提示文案，空文案表示隐藏提示区。
 */
function setSettingsMessage(messageElement, messageText, toneClass = "") {
  messageElement.hidden = !messageText;
  messageElement.textContent = messageText;
  messageElement.className = ("settings-message " + toneClass).trim();
}
/**
 * 编辑期操作的统一兜底错误处理：优先走全局日志桥，再退回控制台。
 */
function handleOperationError(operationError, { phase: errorPhase = "editor-operation" } = {}) {
  window.HABridgeLog?.error(operationError, {
    projectId: activeProject?.projectId || "",
    componentId: selectedComponentId || "",
    phase: errorPhase
  });
  errorDialogMessageElement.textContent = operationError?.message || "操作失败。";
  if (!errorDialogElement.open) {
    errorDialogElement.showModal();
  }
}

// ── 外提到 static/editor/home/*.js 的模块 ────────────────────────────────────
// 下面这些函数已经搬到子目录，通过工厂注入依赖。ctx 的每一项都是 getter：读到的始终是
// 调用时刻的值，所以这段可以放在各依赖声明之前 —— getter 体只在被读时求值，不存在
// 「用到未初始化绑定」的时序问题。被外提代码写回的那几项另配 setter，写的就是同一个 let。
const homeParts = {
    get DEFAULT_PERSPECTIVE_CORNERS() {
      return DEFAULT_PERSPECTIVE_CORNERS;
    },
    get ENTITY_DOMAIN_LABELS() {
      return ENTITY_DOMAIN_LABELS;
    },
    get HELPER_ENTITY_DOMAINS() {
      return HELPER_ENTITY_DOMAINS;
    },
    get ICON_PAGE_SIZE() {
      return ICON_PAGE_SIZE;
    },
    get MAX_LIGHT_STATISTICS_ENTITIES() {
      return MAX_LIGHT_STATISTICS_ENTITIES;
    },
    get activeColorHex() {
      return activeColorHex;
    },
    set activeColorHex(value) {
      activeColorHex = value;
    },
    get activeColorInputElement() {
      return activeColorInputElement;
    },
    set activeColorInputElement(value) {
      activeColorInputElement = value;
    },
    get activeEditorPicker() {
      return activeEditorPicker;
    },
    set activeEditorPicker(value) {
      activeEditorPicker = value;
    },
    get activeProject() {
      return activeProject;
    },
    get airConditionerBaselineByComponentId() {
      return airConditionerBaselineByComponentId;
    },
    get airConditionerEntityButtonElement() {
      return airConditionerEntityButtonElement;
    },
    get airConditionerEntityMenuElement() {
      return airConditionerEntityMenuElement;
    },
    get airConditionerEntityOptionsElement() {
      return airConditionerEntityOptionsElement;
    },
    get airConditionerEntitySearchInputElement() {
      return airConditionerEntitySearchInputElement;
    },
    get airConditionerPropertyDefinitions() {
      return airConditionerPropertyDefinitions;
    },
    get appliedStyleRecord() {
      return appliedStyleRecord;
    },
    set appliedStyleRecord(value) {
      appliedStyleRecord = value;
    },
    get areComponentValuesEqual() {
      return areComponentValuesEqual;
    },
    get areEntitiesLoaded() {
      return areEntitiesLoaded;
    },
    get baselineDocument() {
      return baselineDocument;
    },
    get cameraEntityButtonElement() {
      return cameraEntityButtonElement;
    },
    get cameraEntityMenuElement() {
      return cameraEntityMenuElement;
    },
    get cameraEntityOptionsElement() {
      return cameraEntityOptionsElement;
    },
    get cameraEntitySearchInputElement() {
      return cameraEntitySearchInputElement;
    },
    get cameraPropertyDefinitions() {
      return cameraPropertyDefinitions;
    },
    get canDeleteAssetFolder() {
      return canDeleteAssetFolder;
    },
    get closeAllDropdownMenus() {
      return closeAllDropdownMenus;
    },
    get collectAirConditionerChangedProperties() {
      return collectAirConditionerChangedProperties;
    },
    get collectCameraChangedProperties() {
      return collectCameraChangedProperties;
    },
    get collectIconButtonChangedProperties() {
      return collectIconButtonChangedProperties;
    },
    get collectIconButtonEffectChangedProperties() {
      return collectIconButtonEffectChangedProperties;
    },
    get collectLineChartChangedProperties() {
      return collectLineChartChangedProperties;
    },
    get collectNavigationStyleChanges() {
      return collectNavigationStyleChanges;
    },
    get collectPanelFrameStyleChanges() {
      return collectPanelFrameStyleChanges;
    },
    get collectTitleButtonChangedProperties() {
      return collectTitleButtonChangedProperties;
    },
    get colorPickerBoundInputs() {
      return colorPickerBoundInputs;
    },
    get colorPickerBrightness() {
      return colorPickerBrightness;
    },
    set colorPickerBrightness(value) {
      colorPickerBrightness = value;
    },
    get colorPickerDragPointerId() {
      return colorPickerDragPointerId;
    },
    set colorPickerDragPointerId(value) {
      colorPickerDragPointerId = value;
    },
    get colorPickerHue() {
      return colorPickerHue;
    },
    set colorPickerHue(value) {
      colorPickerHue = value;
    },
    get colorPickerSaturation() {
      return colorPickerSaturation;
    },
    set colorPickerSaturation(value) {
      colorPickerSaturation = value;
    },
    get createEditorEntityPickerOption() {
      return createEditorEntityPickerOption;
    },
    get createEditorPickerCurrentEntity() {
      return createEditorPickerCurrentEntity;
    },
    get createEditorPickerCurrentIcon() {
      return createEditorPickerCurrentIcon;
    },
    get createIconPickerClearOption() {
      return createIconPickerClearOption;
    },
    get createIconPickerOption() {
      return createIconPickerOption;
    },
    get currentPage() {
      return currentPage;
    },
    get customSelectsBySelectElement() {
      return customSelectsBySelectElement;
    },
    get deviceNamesByDeviceId() {
      return deviceNamesByDeviceId;
    },
    get devicesByDeviceId() {
      return devicesByDeviceId;
    },
    get editorEntityMatches() {
      return editorEntityMatches;
    },
    get editorPickerClearAction() {
      return editorPickerClearAction;
    },
    get editorPickerComponentTypeLabel() {
      return editorPickerComponentTypeLabel;
    },
    get editorRenderer() {
      return editorRenderer;
    },
    get enhancedNumberInputs() {
      return enhancedNumberInputs;
    },
    get ensureEntitiesLoaded() {
      return ensureEntitiesLoaded;
    },
    get entities() {
      return entities;
    },
    get entitiesByEntityId() {
      return entitiesByEntityId;
    },
    get entitiesLoadPromise() {
      return entitiesLoadPromise;
    },
    get entityOptionLabel() {
      return entityOptionLabel;
    },
    get entityPickerConfig() {
      return entityPickerConfig;
    },
    get findReplaceableComponents() {
      return findReplaceableComponents;
    },
    get formatAirConditionerPropertyValue() {
      return formatAirConditionerPropertyValue;
    },
    get formatCameraPropertyValue() {
      return formatCameraPropertyValue;
    },
    get formatIconButtonEffectPropertyValue() {
      return formatIconButtonEffectPropertyValue;
    },
    get formatIconButtonPropertyValue() {
      return formatIconButtonPropertyValue;
    },
    get formatLineChartPropertyValue() {
      return formatLineChartPropertyValue;
    },
    get formatNavigationStyleValue() {
      return formatNavigationStyleValue;
    },
    get formatPanelFrameStyleValue() {
      return formatPanelFrameStyleValue;
    },
    get formatTitleButtonPropertyValue() {
      return formatTitleButtonPropertyValue;
    },
    get getAirConditionerPropertyValue() {
      return getAirConditionerPropertyValue;
    },
    get getCameraPropertyValue() {
      return getCameraPropertyValue;
    },
    get getIconButtonEffectPropertyValue() {
      return getIconButtonEffectPropertyValue;
    },
    get getIconButtonPropertyValue() {
      return getIconButtonPropertyValue;
    },
    get getLineChartPropertyValue() {
      return getLineChartPropertyValue;
    },
    get getNavigationStyleValue() {
      return getNavigationStyleValue;
    },
    get getPanelFrameStyleValue() {
      return getPanelFrameStyleValue;
    },
    get getTitleButtonPropertyValue() {
      return getTitleButtonPropertyValue;
    },
    get globalColorPickerBlueInputElement() {
      return globalColorPickerBlueInputElement;
    },
    get globalColorPickerElement() {
      return globalColorPickerElement;
    },
    get globalColorPickerGreenInputElement() {
      return globalColorPickerGreenInputElement;
    },
    get globalColorPickerHexTextInputElement() {
      return globalColorPickerHexTextInputElement;
    },
    get globalColorPickerHomeNextSibling() {
      return globalColorPickerHomeNextSibling;
    },
    get globalColorPickerHueRangeInputElement() {
      return globalColorPickerHueRangeInputElement;
    },
    get globalColorPickerMarkerElement() {
      return globalColorPickerMarkerElement;
    },
    get globalColorPickerRedInputElement() {
      return globalColorPickerRedInputElement;
    },
    get globalColorPickerSaturationValueElement() {
      return globalColorPickerSaturationValueElement;
    },
    get globalColorPickerSwatchElement() {
      return globalColorPickerSwatchElement;
    },
    get handleOperationError() {
      return handleOperationError;
    },
    get hideAssetLargePreview() {
      return hideAssetLargePreview;
    },
    get iconButtonBaselineByComponentId() {
      return iconButtonBaselineByComponentId;
    },
    get iconButtonEffectAssetButtonElement() {
      return iconButtonEffectAssetButtonElement;
    },
    get iconButtonEffectAssetFolderSelectElement() {
      return iconButtonEffectAssetFolderSelectElement;
    },
    get iconButtonEffectAssetMenuElement() {
      return iconButtonEffectAssetMenuElement;
    },
    get iconButtonEffectBaselineByComponentId() {
      return iconButtonEffectBaselineByComponentId;
    },
    get iconButtonEffectEntityButtonElement() {
      return iconButtonEffectEntityButtonElement;
    },
    get iconButtonEffectEntityMenuElement() {
      return iconButtonEffectEntityMenuElement;
    },
    get iconButtonEffectEntityOptionsElement() {
      return iconButtonEffectEntityOptionsElement;
    },
    get iconButtonEffectEntitySearchInputElement() {
      return iconButtonEffectEntitySearchInputElement;
    },
    get iconButtonEffectIconButtonElement() {
      return iconButtonEffectIconButtonElement;
    },
    get iconButtonEffectIconMenuElement() {
      return iconButtonEffectIconMenuElement;
    },
    get iconButtonEffectIconOptionsElement() {
      return iconButtonEffectIconOptionsElement;
    },
    get iconButtonEffectPropertyDefinitions() {
      return iconButtonEffectPropertyDefinitions;
    },
    get iconButtonEntityButtonElement() {
      return iconButtonEntityButtonElement;
    },
    get iconButtonEntityMenuElement() {
      return iconButtonEntityMenuElement;
    },
    get iconButtonEntityOptionsElement() {
      return iconButtonEntityOptionsElement;
    },
    get iconButtonEntitySearchInputElement() {
      return iconButtonEntitySearchInputElement;
    },
    get iconButtonIconButtonElement() {
      return iconButtonIconButtonElement;
    },
    get iconButtonIconMenuElement() {
      return iconButtonIconMenuElement;
    },
    get iconButtonIconOptionsElement() {
      return iconButtonIconOptionsElement;
    },
    get iconListStateByElement() {
      return iconListStateByElement;
    },
    get iconTooltipElement() {
      return iconTooltipElement;
    },
    set iconTooltipElement(value) {
      iconTooltipElement = value;
    },
    get iconVisibilityVirtualEntities() {
      return iconVisibilityVirtualEntities;
    },
    get imageAssetButtonElement() {
      return imageAssetButtonElement;
    },
    get imageAssetFolderSelectElement() {
      return imageAssetFolderSelectElement;
    },
    get imageAssetLargePreviewElement() {
      return imageAssetLargePreviewElement;
    },
    get imageAssetMenuElement() {
      return imageAssetMenuElement;
    },
    get imageEntityButtonElement() {
      return imageEntityButtonElement;
    },
    get imageEntityMenuElement() {
      return imageEntityMenuElement;
    },
    get imageEntityOptionsElement() {
      return imageEntityOptionsElement;
    },
    get imageEntitySearchInputElement() {
      return imageEntitySearchInputElement;
    },
    get lightStatisticsActionEntityButtonElement() {
      return lightStatisticsActionEntityButtonElement;
    },
    get lightStatisticsActionEntityMenuElement() {
      return lightStatisticsActionEntityMenuElement;
    },
    get lightStatisticsActionEntityOptionsElement() {
      return lightStatisticsActionEntityOptionsElement;
    },
    get lightStatisticsActionEntitySearchInputElement() {
      return lightStatisticsActionEntitySearchInputElement;
    },
    get lightStatisticsEntityButtonElement() {
      return lightStatisticsEntityButtonElement;
    },
    get lightStatisticsEntityCountElement() {
      return lightStatisticsEntityCountElement;
    },
    get lightStatisticsEntityListElement() {
      return lightStatisticsEntityListElement;
    },
    get lightStatisticsEntityMenuElement() {
      return lightStatisticsEntityMenuElement;
    },
    get lightStatisticsEntityMessageElement() {
      return lightStatisticsEntityMessageElement;
    },
    get lightStatisticsEntityOptionsElement() {
      return lightStatisticsEntityOptionsElement;
    },
    get lightStatisticsEntityPendingElement() {
      return lightStatisticsEntityPendingElement;
    },
    get lightStatisticsIconButtonElement() {
      return lightStatisticsIconButtonElement;
    },
    get lightStatisticsIconMenuElement() {
      return lightStatisticsIconMenuElement;
    },
    get lightStatisticsIconOptionsElement() {
      return lightStatisticsIconOptionsElement;
    },
    get lineChartBaselineByComponentId() {
      return lineChartBaselineByComponentId;
    },
    get lineChartEntityButtonElement() {
      return lineChartEntityButtonElement;
    },
    get lineChartEntityMenuElement() {
      return lineChartEntityMenuElement;
    },
    get lineChartEntityOptionsElement() {
      return lineChartEntityOptionsElement;
    },
    get lineChartEntitySearchInputElement() {
      return lineChartEntitySearchInputElement;
    },
    get lineChartPropertyDefinitions() {
      return lineChartPropertyDefinitions;
    },
    get moduleDialogPopupId() {
      return moduleDialogPopupId;
    },
    set moduleDialogPopupId(value) {
      moduleDialogPopupId = value;
    },
    get mutateDocument() {
      return mutateDocument;
    },
    get navigationButtonSavedSettingsByComponentId() {
      return navigationButtonSavedSettingsByComponentId;
    },
    get navigationEntityButtonElement() {
      return navigationEntityButtonElement;
    },
    get navigationEntityMenuElement() {
      return navigationEntityMenuElement;
    },
    get navigationEntityOptionsElement() {
      return navigationEntityOptionsElement;
    },
    get navigationEntitySearchInputElement() {
      return navigationEntitySearchInputElement;
    },
    get navigationIconButtonElement() {
      return navigationIconButtonElement;
    },
    get navigationIconMenuElement() {
      return navigationIconMenuElement;
    },
    get navigationIconOptionsElement() {
      return navigationIconOptionsElement;
    },
    get navigationStyleApplyDialogElement() {
      return navigationStyleApplyDialogElement;
    },
    get navigationStyleApplyMessageElement() {
      return navigationStyleApplyMessageElement;
    },
    get navigationStyleApplyPropertiesElement() {
      return navigationStyleApplyPropertiesElement;
    },
    get navigationStyleApplySummaryElement() {
      return navigationStyleApplySummaryElement;
    },
    get navigationStyleApplyTargetHeadingElement() {
      return navigationStyleApplyTargetHeadingElement;
    },
    get navigationStyleApplyTargetScopeElement() {
      return navigationStyleApplyTargetScopeElement;
    },
    get navigationStyleApplyTargetsElement() {
      return navigationStyleApplyTargetsElement;
    },
    get navigationStyleApplyTitleElement() {
      return navigationStyleApplyTitleElement;
    },
    get navigationStylePropertyDefinitions() {
      return navigationStylePropertyDefinitions;
    },
    get openCustomSelect() {
      return openCustomSelect;
    },
    set openCustomSelect(value) {
      openCustomSelect = value;
    },
    get pageActionsButtonElement() {
      return pageActionsButtonElement;
    },
    get pageActionsMenuElement() {
      return pageActionsMenuElement;
    },
    get pageSelectElement() {
      return pageSelectElement;
    },
    get panelFrameBaselineByComponentId() {
      return panelFrameBaselineByComponentId;
    },
    get panelFrameStylePropertyDefinitions() {
      return panelFrameStylePropertyDefinitions;
    },
    get popupActionsButtonElement() {
      return popupActionsButtonElement;
    },
    get popupActionsMenuElement() {
      return popupActionsMenuElement;
    },
    get popupModuleClimateDeviceTypeElement() {
      return popupModuleClimateDeviceTypeElement;
    },
    get popupModuleDialogElement() {
      return popupModuleDialogElement;
    },
    get popupModuleEntityButtonElement() {
      return popupModuleEntityButtonElement;
    },
    get popupModuleEntityOptionsElement() {
      return popupModuleEntityOptionsElement;
    },
    get popupModuleEntitySearchInputElement() {
      return popupModuleEntitySearchInputElement;
    },
    get popupModuleFormElement() {
      return popupModuleFormElement;
    },
    get positionEntityPickerMenu() {
      return positionEntityPickerMenu;
    },
    get projectActionsButtonElement() {
      return projectActionsButtonElement;
    },
    get projectActionsMenuElement() {
      return projectActionsMenuElement;
    },
    get pruneNavigationSavedSettings() {
      return pruneNavigationSavedSettings;
    },
    get renderEntityPickerOptions() {
      return renderEntityPickerOptions;
    },
    get renderPopupEntityOptions() {
      return renderPopupEntityOptions;
    },
    get requestDeleteAssetFolder() {
      return requestDeleteAssetFolder;
    },
    get requestJson() {
      return requestJson;
    },
    get resetLightStatisticsPicker() {
      return resetLightStatisticsPicker;
    },
    get resetPreviewForInput() {
      return resetPreviewForInput;
    },
    get resolveIconButtonPropertyDefinition() {
      return resolveIconButtonPropertyDefinition;
    },
    get resolveSensorKindLabel() {
      return resolveSensorKindLabel;
    },
    get selectableEntities() {
      return selectableEntities;
    },
    get selectedComponent() {
      return selectedComponent;
    },
    get selectedComponentId() {
      return selectedComponentId;
    },
    get statisticsComponentId() {
      return statisticsComponentId;
    },
    set statisticsComponentId(value) {
      statisticsComponentId = value;
    },
    get statisticsEntityId() {
      return statisticsEntityId;
    },
    set statisticsEntityId(value) {
      statisticsEntityId = value;
    },
    get statisticsReplaceIndex() {
      return statisticsReplaceIndex;
    },
    set statisticsReplaceIndex(value) {
      statisticsReplaceIndex = value;
    },
    get syncPopupEntityButton() {
      return syncPopupEntityButton;
    },
    get titleButtonEntityButtonElement() {
      return titleButtonEntityButtonElement;
    },
    get titleButtonEntityMenuElement() {
      return titleButtonEntityMenuElement;
    },
    get titleButtonEntityOptionsElement() {
      return titleButtonEntityOptionsElement;
    },
    get titleButtonEntitySearchInputElement() {
      return titleButtonEntitySearchInputElement;
    },
    get titleButtonIconButtonElement() {
      return titleButtonIconButtonElement;
    },
    get titleButtonIconMenuElement() {
      return titleButtonIconMenuElement;
    },
    get titleButtonIconOptionsElement() {
      return titleButtonIconOptionsElement;
    },
    get titleButtonPropertyDefinitions() {
      return titleButtonPropertyDefinitions;
    },
    get updateRelatedPopup() {
      return updateRelatedPopup;
    },
    get vacuumMapEntityButtonElement() {
      return vacuumMapEntityButtonElement;
    },
    get vacuumMapEntityMenuElement() {
      return vacuumMapEntityMenuElement;
    },
    get vacuumMapEntityOptionsElement() {
      return vacuumMapEntityOptionsElement;
    },
    get vacuumMapEntitySearchInputElement() {
      return vacuumMapEntitySearchInputElement;
    },
    get weatherEntityButtonElement() {
      return weatherEntityButtonElement;
    },
    get weatherEntityMenuElement() {
      return weatherEntityMenuElement;
    },
    get weatherEntityOptionsElement() {
      return weatherEntityOptionsElement;
    },
    get weatherEntitySearchInputElement() {
      return weatherEntitySearchInputElement;
    }
};
const {
  airConditionerDefaults,
  airConditionerPropertyDefinitions,
  cameraDefaults,
  cameraPropertyDefinitions,
  collectAirConditionerChangedProperties,
  collectCameraChangedProperties,
  collectIconButtonChangedProperties,
  collectIconButtonEffectChangedProperties,
  collectLineChartChangedProperties,
  collectNavigationStyleChanges,
  collectPanelFrameStyleChanges,
  collectTitleButtonChangedProperties,
  formatAirConditionerPropertyValue,
  formatCameraPropertyValue,
  formatIconButtonEffectPropertyValue,
  formatIconButtonPropertyValue,
  formatLineChartPropertyValue,
  formatNavigationStyleValue,
  formatPanelFrameStyleValue,
  formatTitleButtonPropertyValue,
  getAirConditionerPropertyValue,
  getCameraPropertyValue,
  getIconButtonEffectPropertyValue,
  getIconButtonPropertyValue,
  getLineChartPropertyValue,
  getNavigationStyleValue,
  getPanelFrameStyleValue,
  getTitleButtonPropertyValue,
  iconButtonDefaults,
  iconButtonEffectDefaults,
  iconButtonEffectPropertyDefinitions,
  iconButtonPropertyDefinitions,
  lineChartDefaults,
  lineChartPropertyDefinitions,
  navigationStyleDefaults,
  panelFrameStyleDefaults,
  panelFrameStylePropertyDefinitions,
  presenceSensorPropertyDefinitions,
  presenceSensorPropertyKeys,
  resolveIconButtonPropertyDefinition,
  resolveSensorKind,
  resolveSensorKindLabel,
  titleButtonDefaults,
  titleButtonPropertyDefinitions
} = createPropertyDescriptors(homeParts);
const {
  applyAirConditionerStyleChange,
  applyCameraStyleChange,
  applyIconButtonEffectStyleChange,
  applyIconButtonStyleChange,
  applyLineChartStyleChange,
  applyPanelFrameStyleChange,
  applyStyleChangeToComponent,
  applyTitleButtonStyleChange,
  createStyleApplyOption,
  openAirConditionerStyleApplyDialog,
  openCameraStyleApplyDialog,
  openIconButtonEffectStyleApplyDialog,
  openIconButtonStyleApplyDialog,
  openLineChartStyleApplyDialog,
  openNavigationStyleApplyDialog,
  openPanelFrameStyleApplyDialog,
  openTitleButtonStyleApplyDialog,
  renderStyleApplyTargets
} = createStyleApplyDialogs(homeParts);
const {
  HOVER_SCROLL_TARGET_SELECTOR,
  addLightStatisticsEntity,
  attachIconTooltip,
  attachInfiniteScroll,
  collapseWhitespace,
  componentEntityIds,
  componentsInPage,
  deviceNameForEntity,
  ensurePickerValueElement,
  entityDisplayName,
  entityDisplaySubtitle,
  entityKindLabel,
  entityOptionLabel,
  entityPickerConfig,
  findOverflowPreviewTarget,
  findOverflowRow,
  flattenComponents,
  hideIconTooltip,
  hoverScrollStateByRow,
  iconListState,
  iconVisibilityVirtualEntities,
  lightStatisticsEntityStatus,
  loadIconButtonEffectIconOptions,
  loadIconButtonIconOptions,
  loadLightStatisticsIconOptions,
  loadNavigationIconOptions,
  loadTitleButtonIconOptions,
  pickLightStatisticsEntity,
  popupEntityDisplayName,
  positionEntityPickerMenu,
  positionIconButtonEffectIconMenu,
  positionIconButtonIconMenu,
  positionImagePickerMenu,
  positionLightStatisticsEntityMenu,
  positionLightStatisticsIconMenu,
  positionNavigationIconMenu,
  positionTitleButtonIconMenu,
  previewTargetsByRow,
  registerOverflowPreviewRow,
  removeLightStatisticsEntity,
  renderEntityPickerOptions,
  renderIconOptions,
  renderLightStatisticsEntities,
  renderLightStatisticsEntityOptions,
  renderPopupModuleEntityOptions,
  resetLightStatisticsPicker,
  selectableEntities,
  setLightStatisticsMessage,
  setPickerButtonLabel,
  showIconTooltip,
  stopHoverScroll,
  syncEntityPickerValue,
  syncPopupEntityInputs,
  syncPopupModuleDeviceType,
  syncPopupModuleEntityButton
} = createEntityOptions(homeParts);
const {
  ENTITY_PICKER_HINT,
  bindEntityPicker,
  closeActiveEditorPicker,
  deferUntilEntitiesLoaded,
  openEditorPickerDialog,
  openEntityPicker,
  openIconPicker,
  openLightStatisticsEntityPicker,
  openPopupEntityPicker,
  openPopupModuleEntityPicker,
  selectPickerOption
} = createPickers(homeParts);
const {
  closeAllDropdownMenus,
  closeCustomSelectMenu,
  closeDropdownMenu,
  closePageActionsMenu,
  closePopupActionsMenu,
  closeProjectActionsMenu,
  enhanceNativeSelect,
  enhanceNativeSelectsIn,
  enhanceNumberInputsIn,
  positionCustomSelectMenu,
  syncCustomSelect
} = createFormWidgets(homeParts);
const {
  closeColorPicker,
  colorPickerHostFor,
  commitColorPickerFromRgb,
  commitColorPickerHsv,
  enhanceColorInputsIn,
  openColorPickerForInput,
  positionColorPicker,
  returnColorPickerToBody,
  syncColorPickerFromHex,
  syncOpenColorPicker,
  updateColorPickerFromPointer
} = createColorPicker(homeParts);

/**
 * 切换「有/无仪表盘」两套外壳状态。
 */
function setWorkspaceHasProject(hasActiveProject) {
  workspaceElement.classList.toggle("empty", !hasActiveProject);
  editorCanvasElement.classList.toggle("workspace-empty-state", !hasActiveProject);
  editorCanvasElement.classList.toggle("canvas-placeholder", hasActiveProject);
  projectActionsButtonElement.disabled = !hasActiveProject;
  pageNewButtonElement.disabled = !hasActiveProject;
  popupNewButtonElement.disabled = !hasActiveProject;
  if (!hasActiveProject) {
    editorCanvasElement.removeAttribute("style");
    editorCanvasElement.innerHTML =
      '<div class="canvas-message"><strong>请从左侧新建仪表盘。</strong></div>';
    closeProjectActionsMenu();
    closePageActionsMenu();
  }
  renderWorkspaceResolution();
  renderDashboardDisplayLink();
  refreshSoundToggle();
}
/**
 * 销毁展示预览渲染器并置空引用。
 */
function destroyDashboardPreview() {
  dashboardPreviewRenderer?.destroy();
  dashboardPreviewRenderer = null;
}
/**
 * 渲染展示预览：与展示页共用 PanelRenderer，并共享三份运行态缓存（图表历史、实体运行态、虚拟实体状态），
 * 使预览里的开关状态与图表曲线跟真实展示页一致；editable:false 保证预览操作不写回文档。
 * 非 dashboard 模式一律销毁预览，避免它在后台继续订阅实体更新。
 */
function renderDashboardPreview(previewPagePath = pageSelectElement.value) {
  if (editorMode !== "dashboard") {
    destroyDashboardPreview();
    return;
  }
  if (!activeProject?.document?.pages?.length) {
    destroyDashboardPreview();
    dashboardPreviewElement.innerHTML =
      '<div class="canvas-message"><strong>' +
      (activeProject ? "请从左侧新建页面。" : "请从左侧新建仪表盘。") +
      "</strong></div>";
    return;
  }
  if (!dashboardPreviewRenderer) {
    dashboardPreviewRenderer = new PanelRenderer(dashboardPreviewElement, {
      editable: false,
      historySeriesCache: historySeriesCache,
      runtimeStateCache: runtimeStateCache,
      virtualEntityStateCache: virtualEntityStateCache,
      onError: handleOperationError,
      onRuntimeButtonPress() {
        buttonSoundController.play();
      },
      onPageChange(changedPagePath) {
        pageSelectElement.value = changedPagePath.path;
        syncCustomSelect(pageSelectElement);
      }
    });
    dashboardPreviewRenderer.setEntityCatalog(entities, entityResourcesByDeviceId, devices);
  }
  dashboardPreviewRenderer.setDocument(activeProject.document, previewPagePath);
}
/**
 * 在展示预览模式下渲染「打开展示页」的链接与提示。
 *
 * 链接按仪表盘名称拼成 /display/{name}，与展示页的后端路由约定一致。
 */
function renderDashboardDisplayLink() {
  const dashboardName = String(activeProject?.document?.name || "").trim();
  const shouldShowDisplayLink = editorMode === "dashboard" && !!dashboardName;
  dashboardDisplayHintElement.hidden = !shouldShowDisplayLink;
  if (!shouldShowDisplayLink) {
    dashboardDisplayLinkElement.removeAttribute("href");
    dashboardDisplayLinkElement.textContent = "";
    return;
  }
  const dashboardDisplayUrl = new URL(
    "/display/" + encodeURIComponent(dashboardName),
    window.location.origin
  );
  dashboardDisplayLinkElement.href = dashboardDisplayUrl.href;
  dashboardDisplayLinkElement.textContent = decodeURI(dashboardDisplayUrl.href);
  dashboardDisplayLinkElement.title = dashboardDisplayUrl.href;
}
/**
 * 把设备最后在线时间格式化成月-日 时:分。
 */
function formatLastSeen(lastSeenTimestamp) {
  const lastSeenDate = new Date(lastSeenTimestamp);
  if (Number.isFinite(lastSeenDate.getTime())) {
    return formatZhDateTime(lastSeenDate);
  } else {
    return "尚未在线";
  }
}
/**
 * 把中控设备的令牌有效期整理成可读文案（拼在设备状态后面）。已过期的设备（expired=true）明确写出
 * 「已过期」—— 它此时已无法访问任何接口，墙上那块屏会跳回配对页，这种状态必须在管理端一眼可见。
 */
function formatDisplayTokenExpiry(displayDevice) {
  if (!displayDevice) {
    return "";
  }
  if (displayDevice.expired) {
    return " · 令牌已过期，需重新配对";
  }
  const expiresAtDate = new Date(displayDevice.expiresAt);
  if (!Number.isFinite(expiresAtDate.getTime())) {
    return "";
  }
  return " · 有效期至 " + formatLastSeen(displayDevice.expiresAt);
}
/**
 * 拉取当前仪表盘的展示设备配对码并重建列表。配对码归属于仪表盘（projectId），不是全局资源；
 * 启用/停用与删除成功后整体重拉，保证 device.lastSeenAt 等设备绑定状态也是新的。
 */
async function loadDisplayPairingCodes() {
  if (!activeProject) {
    return;
  }
  const pairingCodes =
    (
      await requestJson(
        "/displays/pairing-codes?projectId=" + encodeURIComponent(activeProject.projectId)
      )
    ).items || [];
  displayDeviceCountElement.textContent = pairingCodes.length + " 个";
  displayDeviceListElement.replaceChildren();
  if (!pairingCodes.length) {
    const pairingsEmptyElement = document.createElement("p");
    pairingsEmptyElement.textContent = "暂无配对码";
    displayDeviceListElement.append(pairingsEmptyElement);
    return;
  }
  for (const pairingCodeEntry of pairingCodes) {
    const displayDeviceItemElement = document.createElement("div");
    displayDeviceItemElement.className =
      "display-device-item" + (pairingCodeEntry.enabled ? "" : " is-disabled");
    const displayDeviceCopyElement = document.createElement("div");
    displayDeviceCopyElement.className = "display-device-copy";
    const displayDeviceNameElement = document.createElement("strong");
    displayDeviceNameElement.textContent = pairingCodeEntry.name;
    const displayDeviceMetaElement = document.createElement("span");
    const deviceStatusText = pairingCodeEntry.device
      ? "已绑定 · 最后在线 " + formatLastSeen(pairingCodeEntry.device.lastSeenAt)
      : "等待设备配对";
    // 令牌过期时间也要显示：长期不活跃的设备会自己失效，墙上那块屏会跳回配对页，
    // 提前看到「有效期至 …」才能在它真的掉线前重新配对。
    const deviceExpiryText = formatDisplayTokenExpiry(pairingCodeEntry.device);
    displayDeviceMetaElement.textContent =
      (pairingCodeEntry.enabled ? "已启用" : "已停用") +
      " · " +
      deviceStatusText +
      deviceExpiryText;
    const displayDeviceCodeElement = document.createElement("strong");
    displayDeviceCodeElement.className = "display-device-code";
    displayDeviceCodeElement.textContent = pairingCodeEntry.code || "——";
    const displayDeviceActionsElement = document.createElement("div");
    displayDeviceActionsElement.className = "display-device-actions";
    const displayDeviceToggleButtonElement = document.createElement("button");
    displayDeviceToggleButtonElement.type = "button";
    displayDeviceToggleButtonElement.textContent = pairingCodeEntry.enabled ? "停用" : "启用";
    displayDeviceToggleButtonElement.addEventListener("click", async () => {
      displayDeviceToggleButtonElement.disabled = true;
      try {
        await requestJson("/displays/pairing-codes/" + encodeURIComponent(pairingCodeEntry.id), {
          method: "PATCH",
          body: JSON.stringify({
            enabled: !pairingCodeEntry.enabled
          })
        });
        await loadDisplayPairingCodes();
      } catch (togglePairingCodeError) {
        setSettingsMessage(displayDevicesMessageElement, togglePairingCodeError.message, "error");
        displayDeviceToggleButtonElement.disabled = false;
      }
    });
    const displayDeviceDeleteButtonElement = document.createElement("button");
    displayDeviceDeleteButtonElement.type = "button";
    displayDeviceDeleteButtonElement.className = "danger";
    displayDeviceDeleteButtonElement.textContent = "删除";
    displayDeviceDeleteButtonElement.addEventListener("click", async () => {
      const confirmedDelete = await confirmAction({
        kicker: "DANGER ZONE",
        title: "删除配对码",
        message: "确认删除「" + pairingCodeEntry.name + "」的固定配对码？",
        detail: "绑定设备会立即失效。",
        confirmLabel: "确认删除",
        tone: "danger"
      });
      if (!confirmedDelete) {
        return;
      }
      displayDeviceDeleteButtonElement.disabled = true;
      try {
        await requestJson("/displays/pairing-codes/" + encodeURIComponent(pairingCodeEntry.id), {
          method: "DELETE"
        });
        await loadDisplayPairingCodes();
      } catch (deletePairingCodeError) {
        setSettingsMessage(displayDevicesMessageElement, deletePairingCodeError.message, "error");
        displayDeviceDeleteButtonElement.disabled = false;
      }
    });
    displayDeviceCopyElement.append(displayDeviceNameElement, displayDeviceMetaElement);
    const displayDeviceQrButtonElement = document.createElement("button");
    displayDeviceQrButtonElement.type = "button";
    displayDeviceQrButtonElement.textContent = "扫码";
    displayDeviceQrButtonElement.disabled = !pairingCodeEntry.enabled;
    displayDeviceQrButtonElement.addEventListener("click", () =>
      showDisplayPairingQr(pairingCodeEntry)
    );
    // 「解绑」只在已经绑定了设备时出现：配对码是固定的（可能贴在墙上、印在二维码里
    // 被拍照留存），所以换设备必须在这里显式解绑，不能让后来者凭码把原设备顶掉
    // —— 后端在设备仍在用时直接 409，这条路就是那条提示对应的动作。
    let displayDeviceUnbindButtonElement = null;
    if (pairingCodeEntry.device) {
      displayDeviceUnbindButtonElement = document.createElement("button");
      displayDeviceUnbindButtonElement.type = "button";
      displayDeviceUnbindButtonElement.textContent = "解绑";
      displayDeviceUnbindButtonElement.addEventListener("click", async () => {
        const confirmedUnbind = await confirmAction({
          kicker: "DANGER ZONE",
          title: "解绑中控设备",
          message: "确认解绑「" + pairingCodeEntry.name + "」？",
          detail:
            "该设备会立即失去控制权；要重新配对，请在那台设备上再输入一次配对码。",
          confirmLabel: "确认解绑",
          tone: "danger"
        });
        if (!confirmedUnbind) {
          return;
        }
        displayDeviceUnbindButtonElement.disabled = true;
        try {
          await requestJson("/displays/" + encodeURIComponent(pairingCodeEntry.device.id), {
            method: "DELETE"
          });
          await loadDisplayPairingCodes();
        } catch (unbindDisplayDeviceError) {
          setSettingsMessage(
            displayDevicesMessageElement,
            unbindDisplayDeviceError.message,
            "error"
          );
          displayDeviceUnbindButtonElement.disabled = false;
        }
      });
    }
    displayDeviceActionsElement.append(
      displayDeviceQrButtonElement,
      displayDeviceToggleButtonElement,
      ...(displayDeviceUnbindButtonElement ? [displayDeviceUnbindButtonElement] : []),
      displayDeviceDeleteButtonElement
    );
    displayDeviceItemElement.append(
      displayDeviceCopyElement,
      displayDeviceCodeElement,
      displayDeviceActionsElement
    );
    displayDeviceListElement.append(displayDeviceItemElement);
  }
}
/**
 * 打开展示设备弹窗并刷新配对码列表。
 */
async function openDisplayDevicesDialog() {
  if (activeProject) {
    setSettingsMessage(displayDevicesMessageElement, "");
    if (!displayDevicesDialogElement.open) {
      displayDevicesDialogElement.showModal();
    }
    try {
      await loadDisplayPairingCodes();
    } catch (displayDevicesLoadError) {
      setSettingsMessage(displayDevicesMessageElement, displayDevicesLoadError.message, "error");
    }
  }
}
/**
 * 拉取并渲染当前管理员的登录会话列表：每条三行（来源、各类有效期、User-Agent），单行省略、完整值挂 title。
 * 当前这条会话整条标亮且不给撤销按钮，避免手一抖把自己踢下线（退出本机请用右上角「退出」）。
 */
async function loadLoginSessions() {
  const sessions = (await requestJson("/auth/sessions")).items || [];
  sessionCountElement.textContent = sessions.length + " 个";
  sessionListElement.replaceChildren();
  if (!sessions.length) {
    const sessionsEmptyElement = document.createElement("p");
    sessionsEmptyElement.textContent = "暂无登录会话";
    sessionListElement.append(sessionsEmptyElement);
    return;
  }
  for (const sessionEntry of sessions) {
    const sessionItemElement = document.createElement("div");
    // 当前这条单独高亮：它是「自己」，视觉上必须和陌生来源区分开。
    sessionItemElement.className = sessionEntry.current
      ? "session-item is-current"
      : "session-item";
    const sessionCopyElement = document.createElement("div");
    sessionCopyElement.className = "session-copy";
    const sessionTitleElement = document.createElement("strong");
    sessionTitleElement.textContent = sessionEntry.current
      ? "本机（当前会话）"
      : sessionEntry.ipAddress || "未知来源";
    const sessionMetaElement = document.createElement("span");
    sessionMetaElement.className = "session-meta";
    const sessionMetaParts = [
      "最近活跃 " + formatLastSeen(sessionEntry.lastSeenAt),
      "有效期至 " + formatLastSeen(sessionEntry.expiresAt)
    ];
    if (sessionEntry.absoluteExpiresAt) {
      sessionMetaParts.push("最迟 " + formatLastSeen(sessionEntry.absoluteExpiresAt));
    }
    sessionMetaElement.textContent = sessionMetaParts.join(" · ");
    // 窄行宽下这两行都会触发省略号，title 保证鼠标悬停仍能读到完整值。
    sessionMetaElement.title = sessionMetaElement.textContent;
    sessionCopyElement.append(sessionTitleElement, sessionMetaElement);
    // UA 另起一行：拼进上面那行会把时间一起挤掉，而它本身长到必然显示不全。
    if (sessionEntry.userAgent) {
      const sessionAgentElement = document.createElement("span");
      sessionAgentElement.className = "session-agent";
      sessionAgentElement.textContent = sessionEntry.userAgent;
      sessionAgentElement.title = sessionEntry.userAgent;
      sessionCopyElement.append(sessionAgentElement);
    }
    sessionItemElement.append(sessionCopyElement);
    if (!sessionEntry.current) {
      const sessionActionsElement = document.createElement("div");
      sessionActionsElement.className = "session-actions";
      const sessionRevokeButtonElement = document.createElement("button");
      sessionRevokeButtonElement.type = "button";
      sessionRevokeButtonElement.className = "danger";
      sessionRevokeButtonElement.textContent = "撤销";
      sessionRevokeButtonElement.addEventListener("click", () => {
        openSessionsRevokeDialog(sessionEntry);
      });
      sessionActionsElement.append(sessionRevokeButtonElement);
      sessionItemElement.append(sessionActionsElement);
    }
    sessionListElement.append(sessionItemElement);
  }
}
/**
 * 打开「登录会话」弹窗并刷新列表。
 */
async function openSessionsDialog() {
  setSettingsMessage(sessionsMessageElement, "");
  sessionListElement.replaceChildren();
  const sessionsLoadingElement = document.createElement("p");
  sessionsLoadingElement.textContent = "加载中…";
  sessionListElement.append(sessionsLoadingElement);
  if (!sessionsDialogElement.open) {
    sessionsDialogElement.showModal();
  }
  try {
    await loadLoginSessions();
  } catch (sessionsLoadError) {
    setSettingsMessage(sessionsMessageElement, sessionsLoadError.message, "error");
  }
}
/**
 * 打开「撤销单条登录会话」确认弹窗。叠在登录会话列表之上；确认按钮把会话 id 存在 dataset 里，
 * 避免闭包持有整份条目。
 */
function openSessionsRevokeDialog(sessionEntry) {
  if (!sessionEntry?.id || sessionEntry.current) {
    return;
  }
  sessionsRevokeDialogElement.dataset.sessionId = sessionEntry.id;
  sessionsRevokeLabelElement.textContent = sessionEntry.ipAddress || "未知来源";
  setSettingsMessage(sessionsRevokeMessageElement, "");
  sessionsRevokeConfirmButtonElement.disabled = false;
  if (!sessionsRevokeDialogElement.open) {
    sessionsRevokeDialogElement.showModal();
  }
}
/**
 * 打开「退出其他所有设备」确认弹窗。
 */
function openSessionsRevokeOthersDialog() {
  setSettingsMessage(sessionsRevokeOthersMessageElement, "");
  sessionsRevokeOthersConfirmButtonElement.disabled = false;
  if (!sessionsRevokeOthersDialogElement.open) {
    sessionsRevokeOthersDialogElement.showModal();
  }
}
/**
 * 提交「生成配对码」表单。自定义码留空时由后端生成，前端不做格式校验以免与后端规则不一致；
 * 失败时把后端文案原样显示在弹窗里，并恢复按钮可用。
 */
async function createDisplayPairingCode(submitEvent) {
  submitEvent?.preventDefault();
  if (activeProject) {
    displayPairingGenerateButtonElement.disabled = true;
    setSettingsMessage(displayDevicesMessageElement, "");
    try {
      await requestJson("/displays/pairing-code", {
        method: "POST",
        body: JSON.stringify({
          projectId: activeProject.projectId,
          name: displayPairingNameTextInputElement.value,
          code: displayPairingCustomCodeTextInputElement.value
        })
      });
      displayPairingFormElement.reset();
      await loadDisplayPairingCodes();
    } catch (createPairingCodeError) {
      setSettingsMessage(displayDevicesMessageElement, createPairingCodeError.message, "error");
    } finally {
      displayPairingGenerateButtonElement.disabled = false;
    }
  }
}
/**
 * 把文档画布尺寸显示在标题栏；弹窗编辑模式下不显示。
 */
function renderWorkspaceResolution() {
  const documentCanvas = activeProject?.document?.canvas;
  const canvasWidthValue = Number(documentCanvas?.width);
  const canvasHeightValue = Number(documentCanvas?.height);
  const shouldShowResolution =
    editorMode !== "popup" &&
    Number.isFinite(canvasWidthValue) &&
    canvasWidthValue > 0 &&
    Number.isFinite(canvasHeightValue) &&
    canvasHeightValue > 0;
  workspaceResolutionElement.hidden = !shouldShowResolution;
  workspaceResolutionElement.textContent = shouldShowResolution
    ? Math.round(canvasWidthValue) + " × " + Math.round(canvasHeightValue)
    : "";
}
/**
 * 切换编辑器的三种模式：页面画布 / 展示预览 / 组合弹窗编辑。三种模式共用同一份 DOM 容器，靠 hidden 互斥，
 * 并在切换时销毁不再使用的渲染器 —— 渲染器会订阅实体状态，留着会让学生页面在后台持续重绘。
 * 非法值一律回落到 "edit"，避免调用方传错字符串时整个界面失去可见容器。
 */
function setEditorMode(editorModeValue) {
  editorMode = ["edit", "dashboard", "popup"].includes(editorModeValue) ? editorModeValue : "edit";
  const isEditingPage = editorMode === "edit";
  const isDashboardMode = editorMode === "dashboard";
  const isPopupMode = editorMode === "popup";
  pageControlElement.hidden = isPopupMode;
  popupControlElement.hidden = !isPopupMode;
  navigatorContentElement.classList.toggle("popup-mode", isPopupMode);
  showPageEditorButtonElement.classList.toggle("active", !isPopupMode);
  showPageEditorButtonElement.setAttribute("aria-selected", String(!isPopupMode));
  showPopupEditorButtonElement.classList.toggle("active", isPopupMode);
  showPopupEditorButtonElement.setAttribute("aria-selected", String(isPopupMode));
  if (!isEditingPage) {
    resetPreviewStates();
  }
  editorCanvasElement.hidden = !isEditingPage;
  dashboardPreviewElement.hidden = !isDashboardMode;
  customPopupEditorElement.hidden = !isPopupMode;
  workspaceElement.classList.toggle("empty", !activeProject);
  workspaceTitleElement.textContent = isDashboardMode
    ? "仪表盘"
    : isPopupMode
      ? "组合弹窗"
      : "页面画布";
  renderWorkspaceResolution();
  renderDashboardDisplayLink();
  refreshSoundToggle();
  for (const [modeToggleButton, modeToggleActive] of [
    [showEditorPreviewButtonElement, isEditingPage],
    [showDashboardPreviewButtonElement, isDashboardMode]
  ]) {
    modeToggleButton.classList.toggle("active", modeToggleActive);
    modeToggleButton.setAttribute("aria-selected", String(modeToggleActive));
  }
  if (isEditingPage) {
    destroyDashboardPreview();
    if (activeProject?.document?.pages?.length) {
      ensureEditorRenderer().setDocument(activeProject.document, pageSelectElement.value);
      editorRenderer.setSelectedComponents([...selectedComponentIds], selectedComponentId);
    }
    window.requestAnimationFrame(resizeWorkspaceCanvas);
  } else if (isDashboardMode) {
    editorRenderer?.destroy();
    editorRenderer = null;
    renderDashboardPreview();
    window.requestAnimationFrame(() => dashboardPreviewRenderer?.resize());
  } else if (isPopupMode) {
    clearComponentSelection();
    renderComponentLists();
    syncInspector();
    editorRenderer?.destroy();
    editorRenderer = null;
    destroyDashboardPreview();
    renderCustomPopupEditor();
  }
}
/**
 * 在新标签打开已配置的 Home Assistant 地址。只接受 http/https 且不允许内嵌用户名密码：
 * 地址来自用户配置，若放行 file: 之类的协议会成为跳转注入点。
 */
function openHomeAssistantDashboard() {
  const haBaseUrl = String(haConnectionInfo?.baseUrl || "").trim();
  try {
    const haBaseUrlObject = new URL(haBaseUrl);
    if (
      !["http:", "https:"].includes(haBaseUrlObject.protocol) ||
      haBaseUrlObject.username ||
      haBaseUrlObject.password
    ) {
      throw new Error();
    }
    window.open(haBaseUrlObject.href, "_blank", "noopener,noreferrer");
  } catch {
    handleOperationError(new Error("请先配置有效的 Home Assistant 地址。"));
  }
}
/**
 * 同步「设为默认首屏」按钮的文案与禁用态。
 */
function syncDefaultPageAction(hasPages = !!activeProject?.document?.pages?.length) {
  if (defaultPageActionButtonElement) {
    const currentPageEntry = currentPage();
    const isCurrentDefaultPage =
      !!currentPageEntry && activeProject?.document?.defaultPagePath === currentPageEntry.path;
    defaultPageActionButtonElement.textContent = isCurrentDefaultPage
      ? "已是默认首屏"
      : "设为默认首屏";
    defaultPageActionButtonElement.disabled = !hasPages || isCurrentDefaultPage;
  }
}
/**
 * 统一开关页面相关控件的可用性（下拉、操作菜单、新增按钮等）。
 */
function setPageControlsEnabled(controlsEnabled) {
  pageSelectElement.disabled = !controlsEnabled;
  pageActionsButtonElement.disabled = !controlsEnabled;
  syncDefaultPageAction(controlsEnabled);
  syncAddComponentButton();
  syncCustomSelect(pageSelectElement);
  if (!controlsEnabled) {
    closePageActionsMenu();
  }
}
/**
 * 按工作区可用空间等比缩放画布容器。以「容器可用宽高比 vs 画布宽高比」判断是宽度还是高度受限，
 * 再取较小的一边，保证整块画布始终完整可见（不裁切、不出现滚动条）；宽高各自兜底 1px，
 * 避免 ResizeObserver 在容器暂时为 0 时写入非法尺寸。
 *
 * 画布尺寸只有这一个所有者：CSS 在 .workspace-mode-surface / .workspace-empty-state 上写的
 * width/height: 100% 会被这里的行内值盖过，渲染器则按 clientWidth/clientHeight 缩放。
 * 两者唯一的差是 #dashboard-preview 的 1px 描边：全局 box-sizing: border-box 下，行内 width
 * 量的是**边框盒**，而渲染器读到的是**内容盒**，于是画布每轴比占位框小 2px、长宽比也被轻微压扁
 * （2778×1940 的设计压出约 0.1% 的偏差）。所以这里把描边算进可用空间、写出尺寸时再补回去 ——
 * 外壳尺寸与今天一致，内容盒则正好等于算出来的 render 尺寸，JS 与渲染器看的是同一个盒子。
 */
function resizeWorkspaceCanvas() {
  if (!activeProject) {
    return;
  }
  const workspaceComputedStyle = getComputedStyle(workspaceElement);
  const canvasComputedStyle = getComputedStyle(dashboardPreviewElement);
  // border-style 为 none 时计算值是 0px，所以这两个值在空状态 / 无描边元素上天然为 0。
  const canvasBorderWidthPx =
    Number.parseFloat(canvasComputedStyle.borderLeftWidth) +
    Number.parseFloat(canvasComputedStyle.borderRightWidth);
  const canvasBorderHeightPx =
    Number.parseFloat(canvasComputedStyle.borderTopWidth) +
    Number.parseFloat(canvasComputedStyle.borderBottomWidth);
  const availableWidthPx =
    workspaceElement.clientWidth -
    Number.parseFloat(workspaceComputedStyle.paddingLeft) -
    Number.parseFloat(workspaceComputedStyle.paddingRight) -
    canvasBorderWidthPx;
  const availableHeightPx =
    workspaceElement.clientHeight -
    Number.parseFloat(workspaceComputedStyle.paddingTop) -
    Number.parseFloat(workspaceComputedStyle.paddingBottom) -
    canvasBorderHeightPx;
  const canvasWidthPx = activeProject.document.canvas.width || 2778;
  const canvasHeightPx = activeProject.document.canvas.height || 1940;
  const canvasAspectRatio = canvasWidthPx / canvasHeightPx;
  const isHeightLimited = availableWidthPx / availableHeightPx > canvasAspectRatio;
  const renderWidthPx = isHeightLimited ? availableHeightPx * canvasAspectRatio : availableWidthPx;
  const renderHeightPx = isHeightLimited ? availableHeightPx : availableWidthPx / canvasAspectRatio;
  editorCanvasElement.style.width = Math.max(1, renderWidthPx) + "px";
  editorCanvasElement.style.height = Math.max(1, renderHeightPx) + "px";
  dashboardPreviewElement.style.width = Math.max(1, renderWidthPx + canvasBorderWidthPx) + "px";
  dashboardPreviewElement.style.height = Math.max(1, renderHeightPx + canvasBorderHeightPx) + "px";
  window.requestAnimationFrame(() => {
    editorRenderer?.resize();
    dashboardPreviewRenderer?.resize();
  });
}
// 已排程的帧句柄，非 0 时同时充当「本帧已排过」标记。
let workspaceLayoutFrameId = 0;
/**
 * 同步工作区布局：把 ResizeObserver 通知合并到下一帧执行一次。
 * 观察目标 .workspace 的尺寸由外层 grid 决定，这里写子元素尺寸不会反过来改变它，不会自激成循环；
 * 批处理既减少「读—写—读」交替造成的强制布局，也让连续 resize 通知同帧只执行一次。
 */
function syncWorkspaceLayout() {
  if (workspaceLayoutFrameId) {
    return;
  }
  workspaceLayoutFrameId = requestAnimationFrame(() => {
    workspaceLayoutFrameId = 0;
    resizeWorkspaceCanvas();
    syncCustomPopupStage();
    dashboardPreviewRenderer?.resize();
  });
}
const workspaceResizeObserver = new ResizeObserver(syncWorkspaceLayout);
workspaceResizeObserver.observe(workspaceElement);
/**
 * 取当前编辑的页面对象。下拉框里的路径可能已失效（页面被删或文档刚切换），此时回落到第一页，
 * 保证调用方拿到的一定是一个存在的页面或 null。
 */
function currentPage() {
  return (
    activeProject?.document?.pages?.find(
      pageEntryCandidate => pageEntryCandidate.path === pageSelectElement.value
    ) ||
    activeProject?.document?.pages?.[0] ||
    null
  );
}
/**
 * 判断这组控件能否成组。规则：至少两个、成员都不能是已有分组（不支持嵌套分组），必须落在同一个
 * 集合与同一个页面作用域里，并且不能是 fill 布局的控件 —— fill 控件尺寸由父容器决定，成组后会造成循环依赖。
 */
function canGroupComponents(componentIdList, groupingDocument = activeProject?.document) {
  const uniqueComponentIds = [...new Set(componentIdList || [])];
  if (uniqueComponentIds.length < 2 || !groupingDocument) {
    return false;
  }
  const componentLocations = uniqueComponentIds.map(componentIdItem =>
    componentDirectLocation(groupingDocument, componentIdItem)
  );
  if (
    componentLocations.some(
      locationEntry => !locationEntry || locationEntry.component.type === "group"
    )
  ) {
    return false;
  }
  const firstComponentLocation = componentLocations[0];
  return componentLocations.every(
    sameScopeLocation =>
      sameScopeLocation.scope === firstComponentLocation.scope &&
      sameScopeLocation.page?.path === firstComponentLocation.page?.path &&
      sameScopeLocation.collection === firstComponentLocation.collection &&
      sameScopeLocation.component.properties?.layoutMode !== "fill"
  );
}
/**
 * 把选中的多个控件合成一个 group 组件。分组用「外接矩形」而不是各自的原始位置：新组的 position 取成员的
 * 最小/最大边界，成员坐标改为相对组内偏移，这样之后移动或缩放整组时子元素会自然跟随。
 * 共享作用域下还要同步各页的 sharedComponentIds 引用顺序，否则共享控件在别的页面会散架。
 */
function groupSelectedComponents(requestedComponentIds) {
  const groupedComponentIds = [...new Set(requestedComponentIds || [])];
  if (!canGroupComponents(groupedComponentIds)) {
    handleOperationError(new Error("请选择同一页面或同一侧边栏中的两个或更多控件后再成组。"));
    return;
  }
  const newGroupId = newId("group");
  selectedComponentId = newGroupId;
  selectedComponentIds = new Set([newGroupId]);
  selectionAnchorComponentId = newGroupId;
  activeGroupId = null;
  return mutateDocument(groupDocument => {
    const groupComponentLocations = groupedComponentIds.map(groupIdItem =>
      componentDirectLocation(groupDocument, groupIdItem)
    );
    if (groupComponentLocations.some(resolvedLocation => !resolvedLocation)) {
      return;
    }
    const targetCollection = groupComponentLocations[0].collection;
    const groupMemberComponents = groupComponentLocations
      .map(componentLocationItem => componentLocationItem.component)
      .sort(
        (componentA, componentB) =>
          targetCollection.indexOf(componentA) - targetCollection.indexOf(componentB)
      );
    const memberBounds = groupMemberComponents.map(boundsMemberComponent =>
      componentBounds(boundsMemberComponent)
    );
    const groupMinLeft = Math.min(...memberBounds.map(minLeftBounds => minLeftBounds.left));
    const groupMinTop = Math.min(...memberBounds.map(minTopBounds => minTopBounds.top));
    const groupMaxRight = Math.max(...memberBounds.map(maxRightBounds => maxRightBounds.right));
    const groupMaxBottom = Math.max(...memberBounds.map(maxBottomBounds => maxBottomBounds.bottom));
    const groupInsertIndex = Math.min(
      ...groupMemberComponents.map(insertMemberComponent =>
        targetCollection.indexOf(insertMemberComponent)
      )
    );
    const groupChildComponents = groupMemberComponents.map(childSourceComponent => ({
      ...childSourceComponent,
      position: {
        ...(childSourceComponent.position || {}),
        x: Number(childSourceComponent.position?.x || 0) - groupMinLeft,
        y: Number(childSourceComponent.position?.y || 0) - groupMinTop
      }
    }));
    const groupComponent = {
      id: newGroupId,
      type: "group",
      componentVersion: 1,
      position: {
        x: groupMinLeft,
        y: groupMinTop,
        width: Math.max(1, groupMaxRight - groupMinLeft),
        height: Math.max(1, groupMaxBottom - groupMinTop),
        rotation: 0,
        zIndex: 1
      },
      properties: {
        label: groupNameForCollection(targetCollection)
      },
      bindings: {},
      actions: {},
      style: {},
      children: groupChildComponents
    };
    const groupedIdSet = new Set(groupedComponentIds);
    const reorderedCollection = targetCollection.filter(
      collectionComponent => !groupedIdSet.has(collectionComponent.id)
    );
    reorderedCollection.splice(
      Math.min(groupInsertIndex, reorderedCollection.length),
      0,
      groupComponent
    );
    targetCollection.splice(0, targetCollection.length, ...reorderedCollection);
    applyCollectionLayerOrder(targetCollection);
    if (groupComponentLocations[0].scope === "shared") {
      for (const sharedSyncPageEntry of groupDocument.pages || []) {
        const pageSharedIds = sharedSyncPageEntry.sharedComponentIds || [];
        const matchedSharedIndexes = pageSharedIds
          .map((sharedIdEntry, sharedIdIndex) =>
            groupedIdSet.has(sharedIdEntry) ? sharedIdIndex : -1
          )
          .filter(sharedIndex => sharedIndex >= 0);
        if (!matchedSharedIndexes.length) {
          continue;
        }
        const firstSharedIndex = Math.min(...matchedSharedIndexes);
        const remainingSharedIds = pageSharedIds.filter(
          remainingSharedIdEntry => !groupedIdSet.has(remainingSharedIdEntry)
        );
        remainingSharedIds.splice(
          Math.min(firstSharedIndex, remainingSharedIds.length),
          0,
          newGroupId
        );
        sharedSyncPageEntry.sharedComponentIds = [...new Set(remainingSharedIds)];
      }
      syncSharedComponentReferenceOrder(groupDocument);
    }
  });
}
/**
 * 拆散分组，把子控件还原到顶层：按组的旋转与缩放做一次逆变换，把中心点搬回画布坐标系、把组 scale 乘进子元素，
 * scale 钳在 [0.01, 5]（编辑器统一缩放上下限）。组不可见时子元素保持不可见，避免拆组后凭空出现。
 */
function ungroupComponent(groupIdToUngroup) {
  const groupLocationEntry = findComponentLocation(activeProject?.document, groupIdToUngroup);
  if (!groupLocationEntry || groupLocationEntry.component.type !== "group") {
    return;
  }
  /**
   * 原分组内子控件的 ID 列表；拆散后这批控件成为新的选择集。
   */
  const groupChildIds = (groupLocationEntry.component.children || []).map(
    groupChildComponent => groupChildComponent.id
  );
  selectedComponentId = groupChildIds[0] || null;
  selectedComponentIds = new Set(groupChildIds);
  selectionAnchorComponentId = selectedComponentId;
  activeGroupId = null;
  mutateDocument(ungroupDocument => {
    const ungroupLocation = findComponentLocation(ungroupDocument, groupIdToUngroup);
    if (!ungroupLocation || ungroupLocation.component.type !== "group") {
      return;
    }
    const groupPosition = ungroupLocation.component.position || {};
    const groupStyle = ungroupLocation.component.style || {};
    const groupRotationDeg = Number(groupPosition.rotation || 0);
    const groupScale = Math.max(0.01, Math.min(5, Number(groupStyle.scale || 1)));
    const groupRotationRad = (groupRotationDeg * Math.PI) / 180;
    const groupCosRotation = Math.cos(groupRotationRad);
    const groupSinRotation = Math.sin(groupRotationRad);
    const groupWidthPx = Number(groupPosition.width || 100);
    const groupHeightPx = Number(groupPosition.height || 100);
    const groupCenterX = Number(groupPosition.x || 0) + groupWidthPx / 2;
    const groupCenterY = Number(groupPosition.y || 0) + groupHeightPx / 2;
    /**
     * 拆散后的子控件：中心点绕分组中心旋转 groupRotationRad，缩放再乘上分组 scale。
     */
    const ungroupedChildren = (ungroupLocation.component.children || []).map(
      ungroupChildComponent => {
        const childPosition = ungroupChildComponent.position || {};
        const childWidthPx = Number(childPosition.width || 100);
        const childHeightPx = Number(childPosition.height || 100);
        const childOffsetX = Number(childPosition.x || 0) + childWidthPx / 2 - groupWidthPx / 2;
        const childOffsetY = Number(childPosition.y || 0) + childHeightPx / 2 - groupHeightPx / 2;
        const childScaledOffsetX = childOffsetX * groupScale;
        const childScaledOffsetY = childOffsetY * groupScale;
        const childRotatedX =
          groupCenterX +
          childScaledOffsetX * groupCosRotation -
          childScaledOffsetY * groupSinRotation;
        const childRotatedY =
          groupCenterY +
          childScaledOffsetX * groupSinRotation +
          childScaledOffsetY * groupCosRotation;
        const childStyle = {
          ...(ungroupChildComponent.style || {})
        };
        const childNextScale = Math.max(
          0.01,
          Math.min(5, Number(childStyle.scale || 1) * groupScale)
        );
        if (groupStyle.visible === false) {
          childStyle.visible = false;
        }
        childStyle.scale = childNextScale;
        return {
          ...ungroupChildComponent,
          position: {
            ...childPosition,
            x: childRotatedX - childWidthPx / 2,
            y: childRotatedY - childHeightPx / 2,
            rotation: Number(childPosition.rotation || 0) + groupRotationDeg
          },
          style: childStyle
        };
      }
    );
    ungroupLocation.collection.splice(ungroupLocation.index, 1, ...ungroupedChildren);
    applyCollectionLayerOrder(ungroupLocation.collection);
    if (ungroupLocation.scope === "shared" && ungroupLocation.root) {
      for (const ungroupPageEntry of ungroupDocument.pages || []) {
        const ungroupPageSharedIds = ungroupPageEntry.sharedComponentIds || [];
        const groupSharedIndex = ungroupPageSharedIds.indexOf(groupIdToUngroup);
        if (!(groupSharedIndex < 0)) {
          ungroupPageSharedIds.splice(
            groupSharedIndex,
            1,
            ...ungroupedChildren.map(ungroupedChild => ungroupedChild.id)
          );
          ungroupPageEntry.sharedComponentIds = [...new Set(ungroupPageSharedIds)];
        }
      }
      syncSharedComponentReferenceOrder(ungroupDocument);
    }
  });
}
/**
 * 打开分组重命名弹窗，并以当前组名预填输入框。
 */
function openGroupRenameDialog(renameGroupId) {
  const groupComponentForRename = findComponent(activeProject?.document, renameGroupId)?.component;
  if (!!groupComponentForRename && groupComponentForRename.type === "group") {
    componentGroupRenameDialogElement.dataset.groupId = renameGroupId;
    componentGroupRenameInputElement.value = componentLabel(groupComponentForRename);
    setSettingsMessage(componentGroupRenameMessageElement, "");
    componentGroupRenameDialogElement.showModal();
    window.setTimeout(() => componentGroupRenameInputElement.focus(), 0);
  }
}
/**
 * 在指定文档里复制控件并插回原位置后面。副本重新生成全部内部 ID（refreshComponentIds），
 * 否则父子引用会指向原控件；副本一律清掉 previewState，那是运行期状态，带过去会让新控件看起来已是「开」。
 * offsetDuplicate 用于「复制并错开」：偏移 24px、按画布边界钳制，允许半个控件出界（下界 -宽/2）。
 */
function duplicateComponent(
  targetDocument,
  copiedComponentId,
  sourceComponentOverride = null,
  offsetDuplicate = false
) {
  const sourceLocation = findComponentLocation(targetDocument, copiedComponentId);
  if (!sourceLocation) {
    return null;
  }
  const duplicatedComponent = sourceComponentOverride
    ? clone(sourceComponentOverride)
    : refreshComponentIds(clone(sourceLocation.component));
  duplicatedComponent.properties = {
    ...(duplicatedComponent.properties || {}),
    label: copiedComponentLabel(sourceLocation.component, sourceLocation.collection)
  };
  delete duplicatedComponent.properties.previewState;
  if (offsetDuplicate) {
    const duplicateCanvasWidth = Number(targetDocument.canvas?.width || 2778);
    const duplicateCanvasHeight = Number(targetDocument.canvas?.height || 1940);
    const duplicateWidth = Number(duplicatedComponent.position?.width || 100);
    const duplicateHeight = Number(duplicatedComponent.position?.height || 100);
    duplicatedComponent.position = {
      ...(duplicatedComponent.position || {}),
      x: clampNumber(
        Number(duplicatedComponent.position?.x || 0) + 24,
        -duplicateWidth / 2,
        duplicateCanvasWidth - duplicateWidth / 2
      ),
      y: clampNumber(
        Number(duplicatedComponent.position?.y || 0) + 24,
        -duplicateHeight / 2,
        duplicateCanvasHeight - duplicateHeight / 2
      )
    };
  }
  sourceLocation.collection.splice(sourceLocation.index, 0, duplicatedComponent);
  applyCollectionLayerOrder(sourceLocation.collection);
  if (sourceLocation.scope === "shared" && sourceLocation.root) {
    for (const duplicatePageEntry of targetDocument.pages || []) {
      const duplicatedSharedIndex = (duplicatePageEntry.sharedComponentIds || []).indexOf(
        copiedComponentId
      );
      if (duplicatedSharedIndex >= 0) {
        duplicatePageEntry.sharedComponentIds.splice(
          duplicatedSharedIndex,
          0,
          duplicatedComponent.id
        );
      }
    }
    syncSharedComponentReferenceOrder(targetDocument);
  }
  return duplicatedComponent;
}
/**
 * 从文档里彻底移除一个控件，并清理共享引用。共享控件被删后，各页 sharedComponentIds 里的对应 ID
 * 必须一并摘掉，否则下次渲染会按孤立的引用 ID 找不到控件。
 */
function removeComponent(removalDocument, removedComponentId) {
  const removalLocation = findComponentLocation(removalDocument, removedComponentId);
  if (!removalLocation) {
    return null;
  }
  const [removedComponent] = removalLocation.collection.splice(removalLocation.index, 1);
  applyCollectionLayerOrder(removalLocation.collection);
  if (removalLocation.scope === "shared" && removalLocation.root) {
    for (const removalPageEntry of removalDocument.pages || []) {
      removalPageEntry.sharedComponentIds = (removalPageEntry.sharedComponentIds || []).filter(
        remainingSharedId => remainingSharedId !== removedComponentId
      );
    }
    syncSharedComponentReferenceOrder(removalDocument);
  }
  return removedComponent;
}
/**
 * 取当前单选中的控件对象。
 */
function selectedComponent() {
  return findComponent(activeProject?.document, selectedComponentId)?.component || null;
}
/**
 * 取当前图层列表应展示的控件数组。进入分组编辑态（activeGroupId）时展示该组的子控件，否则按作用域
 * 取共享控件或当前页控件 —— 三类列表共用同一套渲染逻辑。
 */
function componentListForScope(groupListScope) {
  if (activeGroupId) {
    const groupScopeComponent = findComponent(activeProject?.document, activeGroupId)?.component;
    if (groupScopeComponent?.type === "group") {
      return groupScopeComponent.children || [];
    }
  }
  if (groupListScope === "shared") {
    return activeProject?.document?.sharedComponents || [];
  } else {
    return currentPage()?.components || [];
  }
}
/**
 * 深度优先收集组件树中指定类型的控件。
 */
function collectComponentsByType(componentTreeNode, componentTypeFilter, collectedComponents = []) {
  for (const treeComponent of componentTreeNode || []) {
    if (treeComponent?.type === componentTypeFilter) {
      collectedComponents.push(treeComponent);
    }
    collectComponentsByType(treeComponent?.children, componentTypeFilter, collectedComponents);
  }
  return collectedComponents;
}
/**
 * 在所有页面里收集指定类型的控件，并带上所属页面。
 */
function findPageComponentsByType(typeFilter) {
  return (activeProject?.document?.pages || []).flatMap(typeMatchPage =>
    collectComponentsByType(typeMatchPage.components, typeFilter).map(matchedComponent => ({
      component: matchedComponent,
      page: typeMatchPage
    }))
  );
}
/**
 * 找出可以被某控件「替换」的同类型控件（共享与页面两类都算）。presence-sensor 额外按 resolveSensorKind
 * 分组：同类型下还细分了传感器种类，只列同种类的控件，否则替换后语义会变；自身被排除。
 */
function findReplaceableComponents(sourceComponent) {
  if (!sourceComponent) {
    return [];
  }
  const sourceGroupName = resolveSensorKind(sourceComponent);
  return [
    ...collectComponentsByType(activeProject?.document?.sharedComponents, sourceComponent.type).map(
      sharedComponent => ({
        component: sharedComponent,
        scope: "shared"
      })
    ),
    ...findPageComponentsByType(sourceComponent.type).map(pageMatch => ({
      ...pageMatch,
      scope: "page"
    }))
  ].filter(
    ({ component: filterMatch }) =>
      filterMatch.id !== sourceComponent.id &&
      (sourceComponent.type !== "presence-sensor" ||
        resolveSensorKind(filterMatch) === sourceGroupName)
  );
}
/**
 * 把当前选择集推给渲染器，让画布上的选中框与分组高亮跟上。
 */
function syncRendererSelection() {
  editorRenderer?.setActiveGroup(activeGroupId);
  editorRenderer?.setSelectedComponents([...selectedComponentIds], selectedComponentId);
}
/**
 * 清空选择集与全部预览态。
 */
function clearComponentSelection() {
  resetPreviewStates();
  selectedComponentId = null;
  selectedComponentIds = new Set();
  selectionAnchorComponentId = null;
}
/**
 * 把所有控件的临时预览态复位成 auto。这些预览态是编辑期的「强制显示某层/某状态」开关（如空调出风层、
 * 图标发光效果），不属于文档内容，取消选中或切页时必须逐个还原，否则画布会残留预览效果。
 */
function resetPreviewStates() {
  for (const previewStateMap of [
    navigationPreviewStateByComponentId,
    iconButtonEffectPreviewStateByComponentId,
    iconButtonPreviewStateByComponentId,
    airConditionerPreviewStateByComponentId
  ]) {
    for (const previewStateComponentId of previewStateMap.keys()) {
      editorRenderer?.setComponentPreviewState(previewStateComponentId, "auto");
    }
    previewStateMap.clear();
  }
}
/**
 * 处理画布点选，更新单选 / 多选 / 区间选择：preserveGroup 组内点击不破坏已有多选；range（Shift）以锚点圈定
 * 同作用域连续区间，跨页退化为单选（跨页区间在图层列表里没有对应行）；toggle（Ctrl/Cmd）切换单个；
 * 都不带时点击已唯一选中的控件视为取消选中。选中共享控件时顺带把它补进当前页引用列表，否则无引用就不可见。
 */
function selectComponent(
  clickedComponentId,
  {
    toggle: toggleSelection = false,
    range: rangeSelection = false,
    preserveGroup: preserveGroupSelection = false
  } = {}
) {
  const clickedLocation = findComponent(activeProject?.document, clickedComponentId);
  if (!clickedLocation) {
    clearComponentSelection();
    syncRendererSelection();
    renderComponentLists();
    syncInspector();
    return;
  }
  const anchorComponentLocation = findComponent(activeProject?.document, selectedComponentId);
  const isSameComponentScope =
    anchorComponentLocation?.scope === clickedLocation.scope &&
    (clickedLocation.scope !== "page" ||
      anchorComponentLocation.page?.path === clickedLocation.page?.path);
  if (preserveGroupSelection && selectedComponentIds.has(clickedComponentId)) {
    selectedComponentId = clickedComponentId;
  } else if (rangeSelection && isSameComponentScope && selectionAnchorComponentId) {
    const scopeComponentList = componentListForScope(clickedLocation.scope);
    const anchorIndexInList = scopeComponentList.findIndex(
      anchorListComponent => anchorListComponent.id === selectionAnchorComponentId
    );
    const clickedIndexInList = scopeComponentList.findIndex(
      clickedListComponent => clickedListComponent.id === clickedComponentId
    );
    if (anchorIndexInList >= 0 && clickedIndexInList >= 0) {
      const [rangeStartIndex, rangeEndIndex] =
        anchorIndexInList <= clickedIndexInList
          ? [anchorIndexInList, clickedIndexInList]
          : [clickedIndexInList, anchorIndexInList];
      selectedComponentIds = new Set(
        scopeComponentList
          .slice(rangeStartIndex, rangeEndIndex + 1)
          .map(rangedComponent => rangedComponent.id)
      );
      selectedComponentId = clickedComponentId;
    } else {
      selectedComponentIds = new Set([clickedComponentId]);
      selectedComponentId = clickedComponentId;
      selectionAnchorComponentId = clickedComponentId;
    }
  } else if (toggleSelection && isSameComponentScope) {
    const toggledSelection = new Set(selectedComponentIds);
    if (toggledSelection.has(clickedComponentId)) {
      toggledSelection.delete(clickedComponentId);
    } else {
      toggledSelection.add(clickedComponentId);
    }
    selectedComponentIds = toggledSelection;
    selectedComponentId = toggledSelection.has(clickedComponentId)
      ? clickedComponentId
      : toggledSelection.values().next().value || null;
    selectionAnchorComponentId = clickedComponentId;
  } else if (
    !toggleSelection &&
    !rangeSelection &&
    selectedComponentIds.size === 1 &&
    selectedComponentIds.has(clickedComponentId)
  ) {
    clearComponentSelection();
  } else {
    selectedComponentIds = new Set([clickedComponentId]);
    selectedComponentId = clickedComponentId;
    selectionAnchorComponentId = clickedComponentId;
  }
  if (clickedLocation.scope === "shared" && currentPage()?.path) {
    const pendingDocument = clone(activeProject.document);
    if (ensureSharedComponentReference(pendingDocument, clickedComponentId, currentPage().path)) {
      applyDocumentChange(pendingDocument, currentPage().path).catch(handleOperationError);
    }
  }
  if (selectedComponentId) {
    setComponentScope(clickedLocation.scope);
  }
  syncRendererSelection();
  renderComponentLists();
  syncInspector();
}
/**
 * 文档修改的唯一入口：克隆 → 改副本 → 提交。文档是唯一真相源，原地改会让撤销/脏标记无法判断改了什么，
 * 故统一走 clone + applyDocumentChange 得到新对象；写入串在 writeQueuePromise 上并先 catch 上次错误，
 * 避免上次失败拖死后续所有编辑；options.throwOnError 为真时返回会抛错的 Promise，否则返回已吞错的队列。
 */
function mutateDocument(
  documentMutator,
  writePagePath = pageSelectElement.value,
  { throwOnError: throwOnWriteError = false } = {}
) {
  const queuedWrite = writeQueuePromise
    .catch(() => {})
    .then(async () => {
      if (!activeProject) {
        throw new Error("请先选择仪表盘。");
      }
      const workingDocument = clone(activeProject.document);
      const mutatorResult = await documentMutator(workingDocument);
      await applyDocumentChange(workingDocument, writePagePath);
      return mutatorResult;
    });
  writeQueuePromise = queuedWrite.catch(handleOperationError);
  if (throwOnWriteError) {
    return queuedWrite;
  } else {
    return writeQueuePromise;
  }
}
/**
 * 用方向键平移选中的控件（或空调出风层）：普通控件改 position，出风层改 properties.airflowOffsetX/Y
 * （那是相对控件宽高的百分比，需把像素位移换算成百分比）。多选时先求整组公共可行区间而非逐个钳制：
 * 保持相对间距，有成员贴边就整组停在原地，避免被拖散相对位置。
 */
function nudgeSelectedComponents(nudgeDeltaX, nudgeDeltaY) {
  const nudgedComponentIds = [...selectedComponentIds];
  if (!!nudgedComponentIds.length && (!!nudgeDeltaX || !!nudgeDeltaY)) {
    mutateDocument(nudgeDocument => {
      const nudgeComponents = nudgedComponentIds
        .map(nudgedComponentId => findComponent(nudgeDocument, nudgedComponentId)?.component)
        .filter(Boolean);
      if (
        !nudgeComponents.length ||
        nudgeComponents.some(nudgedComponent => nudgedComponent.properties?.layoutMode === "fill")
      ) {
        return;
      }
      const airflowComponent =
        nudgeComponents.length === 1 && nudgeComponents[0].type === "air-conditioner"
          ? nudgeComponents[0]
          : null;
      if (
        airflowComponent &&
        airConditionerLayerByComponentId.get(airflowComponent.id) === "airflow"
      ) {
        const airflowWidth = Math.max(1, Number(airflowComponent.position?.width || 100));
        const airflowHeight = Math.max(1, Number(airflowComponent.position?.height || 100));
        const airflowOffsetBounds = airflowCanvasOffsetBounds(
          airflowComponent,
          nudgeDocument.canvas
        );
        airflowComponent.properties = {
          ...(airflowComponent.properties || {}),
          airflowOffsetX: clampNumber(
            Number(airflowComponent.properties?.airflowOffsetX ?? -75) +
              (nudgeDeltaX / airflowWidth) * 100,
            airflowOffsetBounds.minX,
            airflowOffsetBounds.maxX
          ),
          airflowOffsetY: clampNumber(
            Number(airflowComponent.properties?.airflowOffsetY ?? 34) +
              (nudgeDeltaY / airflowHeight) * 100,
            airflowOffsetBounds.minY,
            airflowOffsetBounds.maxY
          )
        };
        return;
      }
      const nudgeCanvasWidth = Number(nudgeDocument.canvas?.width || 2778);
      const nudgeCanvasHeight = Number(nudgeDocument.canvas?.height || 1940);
      const nudgeMinDeltaX = Math.max(
        ...nudgeComponents.map(
          minXComponent =>
            -Number(minXComponent.position?.width || 100) / 2 -
            Number(minXComponent.position?.x || 0)
        )
      );
      const nudgeMaxDeltaX = Math.min(
        ...nudgeComponents.map(
          maxXComponent =>
            nudgeCanvasWidth -
            Number(maxXComponent.position?.width || 100) / 2 -
            Number(maxXComponent.position?.x || 0)
        )
      );
      const nudgeMinDeltaY = Math.max(
        ...nudgeComponents.map(
          minYComponent =>
            -Number(minYComponent.position?.height || 100) / 2 -
            Number(minYComponent.position?.y || 0)
        )
      );
      const nudgeMaxDeltaY = Math.min(
        ...nudgeComponents.map(
          maxYComponent =>
            nudgeCanvasHeight -
            Number(maxYComponent.position?.height || 100) / 2 -
            Number(maxYComponent.position?.y || 0)
        )
      );
      const clampedNudgeDeltaX = clampNumber(nudgeDeltaX, nudgeMinDeltaX, nudgeMaxDeltaX);
      const clampedNudgeDeltaY = clampNumber(nudgeDeltaY, nudgeMinDeltaY, nudgeMaxDeltaY);
      for (const nudgedComponentItem of nudgeComponents) {
        if (airflowComponent) {
          const nudgedComponentWidth = Math.max(
            1,
            Number(nudgedComponentItem.position?.width || 100)
          );
          const nudgedComponentHeight = Math.max(
            1,
            Number(nudgedComponentItem.position?.height || 100)
          );
          const nextNudgePosition = {
            ...(nudgedComponentItem.position || {}),
            x: Number(nudgedComponentItem.position?.x || 0) + clampedNudgeDeltaX,
            y: Number(nudgedComponentItem.position?.y || 0) + clampedNudgeDeltaY
          };
          const nudgedAirflowBounds = airflowCanvasOffsetBounds(
            {
              ...nudgedComponentItem,
              position: nextNudgePosition
            },
            nudgeDocument.canvas
          );
          nudgedComponentItem.properties = {
            ...(nudgedComponentItem.properties || {}),
            airflowOffsetX: clampNumber(
              Number(nudgedComponentItem.properties?.airflowOffsetX ?? -75) -
                (clampedNudgeDeltaX / nudgedComponentWidth) * 100,
              nudgedAirflowBounds.minX,
              nudgedAirflowBounds.maxX
            ),
            airflowOffsetY: clampNumber(
              Number(nudgedComponentItem.properties?.airflowOffsetY ?? 34) -
                (clampedNudgeDeltaY / nudgedComponentHeight) * 100,
              nudgedAirflowBounds.minY,
              nudgedAirflowBounds.maxY
            )
          };
        }
        nudgedComponentItem.position = {
          ...(nudgedComponentItem.position || {}),
          x: Number(nudgedComponentItem.position?.x || 0) + clampedNudgeDeltaX,
          y: Number(nudgedComponentItem.position?.y || 0) + clampedNudgeDeltaY
        };
      }
    });
  }
}
/**
 * 计算控件在画布坐标系下的轴对齐包围盒（已计入旋转与缩放）。用旋转后矩形的投影半宽半高
 * （|cos|·w + |sin|·h）而不是直接用 w/h，这样多选对齐、成组外接矩形在控件被旋转后依然正确；
 * scale 与尺寸下限 0.01 是为了避免零尺寸控件让包围盒退化成一条线。
 */
function componentBounds(boundsComponent) {
  const boundsPosition = boundsComponent.position || {};
  const boundsWidth = Math.max(0.01, Number(boundsPosition.width || 100));
  const boundsHeight = Math.max(0.01, Number(boundsPosition.height || 100));
  const boundsScale = Math.max(0.01, Math.min(5, Number(boundsComponent.style?.scale || 1)));
  const boundsRotationRad = (Number(boundsPosition.rotation || 0) * Math.PI) / 180;
  const boundsHalfWidth =
    (Math.abs(Math.cos(boundsRotationRad)) * boundsWidth * boundsScale +
      Math.abs(Math.sin(boundsRotationRad)) * boundsHeight * boundsScale) /
    2;
  const boundsHalfHeight =
    (Math.abs(Math.sin(boundsRotationRad)) * boundsWidth * boundsScale +
      Math.abs(Math.cos(boundsRotationRad)) * boundsHeight * boundsScale) /
    2;
  const boundsCenterX = Number(boundsPosition.x || 0) + boundsWidth / 2;
  const boundsCenterY = Number(boundsPosition.y || 0) + boundsHeight / 2;
  return {
    left: boundsCenterX - boundsHalfWidth,
    top: boundsCenterY - boundsHalfHeight,
    right: boundsCenterX + boundsHalfWidth,
    bottom: boundsCenterY + boundsHalfHeight
  };
}
/**
 * 计算「多选整体缩放」后每个控件的新位置与新缩放：以选择集包围盒中心为不动点做等比缩放，相对布局保持不变；
 * 比例钳到所有成员 [0.01, 5] 的公共区间，否则某成员会越界、单边钳制又会破坏等比例关系。
 * 少于两个成员、成员缺失或为 fill 布局时返回空数组，调用方据此不做批量缩放。
 */
function scaledSelectionPlacements(targetSelectionScale) {
  if (selectedComponentIds.size < 2 || !activeProject || !selectedComponentId) {
    return [];
  }
  const selectedComponentsList = [...selectedComponentIds]
    .map(
      selectedComponentIdItem =>
        findComponent(activeProject.document, selectedComponentIdItem)?.component
    )
    .filter(Boolean);
  const primarySelectedComponent = selectedComponentsList.find(
    primaryCandidateComponent => primaryCandidateComponent.id === selectedComponentId
  );
  if (
    !primarySelectedComponent ||
    selectedComponentsList.length !== selectedComponentIds.size ||
    selectedComponentsList.some(
      fillModeComponent => fillModeComponent.properties?.layoutMode === "fill"
    )
  ) {
    return [];
  }
  const primaryComponentScale = Math.max(
    0.01,
    Math.min(5, Number(primarySelectedComponent.style?.scale || 1))
  );
  const requestedScaleRatio =
    Math.max(0.01, Math.min(5, Number(targetSelectionScale))) / primaryComponentScale;
  const minAllowedRatio = Math.max(
    ...selectedComponentsList.map(
      minRatioComponent => 0.01 / Math.max(0.01, Number(minRatioComponent.style?.scale || 1))
    )
  );
  const maxAllowedRatio = Math.min(
    ...selectedComponentsList.map(
      maxRatioComponent => 5 / Math.max(0.01, Number(maxRatioComponent.style?.scale || 1))
    )
  );
  const appliedScaleRatio = clampNumber(requestedScaleRatio, minAllowedRatio, maxAllowedRatio);
  const selectionBoundsList = selectedComponentsList.map(componentBounds);
  const selectionAnchorX =
    (Math.min(...selectionBoundsList.map(leftBoundsItem => leftBoundsItem.left)) +
      Math.max(...selectionBoundsList.map(rightBoundsItem => rightBoundsItem.right))) /
    2;
  const selectionAnchorY =
    (Math.min(...selectionBoundsList.map(topBoundsItem => topBoundsItem.top)) +
      Math.max(...selectionBoundsList.map(bottomBoundsItem => bottomBoundsItem.bottom))) /
    2;
  return selectedComponentsList.map(scaledComponent => {
    const scaledComponentPosition = scaledComponent.position || {};
    const scaledComponentWidth = Number(scaledComponentPosition.width || 100);
    const scaledComponentHeight = Number(scaledComponentPosition.height || 100);
    const scaledComponentCenterX =
      Number(scaledComponentPosition.x || 0) + scaledComponentWidth / 2;
    const scaledComponentCenterY =
      Number(scaledComponentPosition.y || 0) + scaledComponentHeight / 2;
    return {
      componentId: scaledComponent.id,
      x:
        selectionAnchorX +
        (scaledComponentCenterX - selectionAnchorX) * appliedScaleRatio -
        scaledComponentWidth / 2,
      y:
        selectionAnchorY +
        (scaledComponentCenterY - selectionAnchorY) * appliedScaleRatio -
        scaledComponentHeight / 2,
      scale: Math.max(
        0.01,
        Math.min(5, Number(scaledComponent.style?.scale || 1) * appliedScaleRatio)
      )
    };
  });
}
/**
 * 从图层列表 DOM 读取当前高亮的控件 ID。多选时以内存中的选择集为准（列表可能只渲染了其中一部分），
 * 单选时反而以 DOM 为准，因为列表点击会先更新 DOM 类名。
 */
function selectedComponentIdsFromDom() {
  const domSelectedIds = [...document.querySelectorAll(".element-item.selected[data-component-id]")]
    .map(elementItem => elementItem.dataset.componentId)
    .filter(Boolean);
  if (selectedComponentIds.size > 1) {
    return [...selectedComponentIds];
  } else {
    return domSelectedIds;
  }
}
/**
 * 给若干控件设置同一个旋转角度（度）。
 */
function setComponentsRotation(
  rotationDocument,
  rotationComponentId,
  rotationDegrees,
  rotationComponentIds = []
) {
  const rotationTargetIds =
    rotationComponentIds.length > 1 ? rotationComponentIds : [rotationComponentId];
  for (const rotationTargetId of rotationTargetIds) {
    const rotationComponent = findComponent(rotationDocument, rotationTargetId)?.component;
    if (rotationComponent) {
      rotationComponent.position = {
        ...(rotationComponent.position || {}),
        rotation: rotationDegrees
      };
    }
  }
}
/**
 * 返回图层列表「显示/隐藏」按钮用的内联 SVG。
 */
function visibilityIconSvg(visibilityIconVisible) {
  if (visibilityIconVisible) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>';
  } else {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M2.5 12s3.5-6 9.5-6c2 0 3.7.7 5.1 1.6M21.5 12s-3.5 6-9.5 6c-2 0-3.7-.7-5.1-1.6"/></svg>';
  }
}
/**
 * 批量设置控件的可见性。可见性写在 style.visible 上（false 才隐藏，缺省视为可见），
 * 与后端 schema 的组件样式字段一致。
 */
function setComponentsVisibility(visibilityComponentIds, visibilityTarget) {
  const visibilityTargetIds = [...new Set(visibilityComponentIds || [])];
  if (visibilityTargetIds.length) {
    mutateDocument(visibilityDocument => {
      for (const visibilityComponentId of visibilityTargetIds) {
        const visibilityComponent = findComponent(
          visibilityDocument,
          visibilityComponentId
        )?.component;
        if (visibilityComponent) {
          visibilityComponent.style = {
            ...(visibilityComponent.style || {}),
            visible: visibilityTarget
          };
        }
      }
    });
  }
}
/**
 * 关闭控件右键菜单并清空其绑定的控件 ID。
 */
function closeComponentContextMenu() {
  componentContextMenuElement.hidden = true;
  contextMenuComponentId = null;
}
/**
 * 在鼠标位置打开控件右键菜单并按当前选择集刷新菜单项：多选显示「N 个控件」；可见性不一致时禁用批量隐藏/显示
 * （否则会把一半控件设成相反状态）；分组项仅在 canGroupComponents 通过时出现，重命名项仅单选分组时出现。
 * 弹层位置在下一帧按实际尺寸计算，因为此刻菜单内容刚重建、量到的尺寸才有效。
 */
function openComponentContextMenu(contextMenuEvent, openedContextMenuComponentId) {
  contextMenuEvent.preventDefault();
  contextMenuEvent.stopPropagation();
  selectComponent(openedContextMenuComponentId, {
    preserveGroup: true
  });
  contextMenuComponentId = openedContextMenuComponentId;
  const contextMenuIds = selectedComponentIds.has(openedContextMenuComponentId)
    ? [...selectedComponentIds]
    : [openedContextMenuComponentId];
  const contextMenuCount = contextMenuIds.length;
  const copyMenuButtonElement = componentContextMenuElement.querySelector(
    '[data-component-action="copy"]'
  );
  const copyToPageMenuButtonElement = componentContextMenuElement.querySelector(
    '[data-component-action="copy-to-page"]'
  );
  const visibilityMenuButtonElement = componentContextMenuElement.querySelector(
    '[data-component-action="visibility"]'
  );
  const deleteMenuButtonElement = componentContextMenuElement.querySelector(
    '[data-component-action="delete"]'
  );
  const groupMenuButtonElement = componentContextMenuElement.querySelector(
    '[data-component-action="group"]'
  );
  const ungroupMenuButtonElement = componentContextMenuElement.querySelector(
    '[data-component-action="ungroup"]'
  );
  const renameGroupMenuButtonElement = componentContextMenuElement.querySelector(
    '[data-component-action="rename-group"]'
  );
  const menuTitleTextElement = componentContextMenuElement.querySelector(":scope > strong");
  copyMenuButtonElement.textContent =
    contextMenuCount > 1 ? "复制 " + contextMenuCount + " 个控件" : "复制控件";
  const contextMenuComponent = findComponent(
    activeProject?.document,
    openedContextMenuComponentId
  )?.component;
  const contextMenuVisibilityList = contextMenuIds
    .map(
      contextMenuComponentIdItem =>
        findComponent(activeProject?.document, contextMenuComponentIdItem)?.component
    )
    .filter(Boolean)
    .map(contextMenuComponentItem => contextMenuComponentItem.style?.visible !== false);
  const hasUniformContextVisibility =
    contextMenuVisibilityList.length === contextMenuIds.length &&
    contextMenuVisibilityList.every(
      contextVisibility => contextVisibility === contextMenuVisibilityList[0]
    );
  visibilityMenuButtonElement.disabled = !hasUniformContextVisibility;
  visibilityMenuButtonElement.textContent = hasUniformContextVisibility
    ? contextMenuVisibilityList[0]
      ? contextMenuCount > 1
        ? "批量隐藏 " + contextMenuCount + " 个"
        : "隐藏控件"
      : contextMenuCount > 1
        ? "批量显示 " + contextMenuCount + " 个"
        : "显示控件"
    : "批量隐藏/显示";
  visibilityMenuButtonElement.title = hasUniformContextVisibility
    ? ""
    : "选中的控件包含隐藏和显示状态，无法批量处理";
  const canGroupContextSelection = canGroupComponents(contextMenuIds);
  groupMenuButtonElement.hidden = !canGroupContextSelection;
  ungroupMenuButtonElement.hidden =
    contextMenuComponent?.type !== "group" || contextMenuCount !== 1;
  renameGroupMenuButtonElement.hidden =
    contextMenuComponent?.type !== "group" || contextMenuCount !== 1;
  copyToPageMenuButtonElement.textContent = "复制到其他区域";
  const hasOtherProject = projects.some(
    contextMenuProjectEntry => contextMenuProjectEntry.id !== activeProject?.projectId
  );
  const contextCopyTargets = findCommonCopyTargets(activeProject?.document, contextMenuIds);
  copyToPageMenuButtonElement.disabled = contextCopyTargets.length === 0 && !hasOtherProject;
  copyToPageMenuButtonElement.title = copyToPageMenuButtonElement.disabled
    ? "当前没有可复制的目标区域"
    : contextMenuCount > 1
      ? "完整复制选中的 " + contextMenuCount + " 个控件到其他页面、侧边栏或其他仪表盘"
      : "完整复制当前控件到其他页面、侧边栏或其他仪表盘";
  deleteMenuButtonElement.textContent =
    contextMenuCount > 1 ? "删除 " + contextMenuCount + " 个控件" : "删除控件";
  menuTitleTextElement.textContent =
    contextMenuCount > 1 ? "颜色标签（" + contextMenuCount + " 个控件）" : "颜色标签";
  const labelColorValues = contextMenuIds.map(labelColorComponentId => {
    const labelColorComponent = findComponent(
      activeProject?.document,
      labelColorComponentId
    )?.component;
    return strictHexColorOrEmpty(labelColorComponent?.style?.editorLabelColor);
  });
  const sharedLabelColor = labelColorValues.every(
    labelColorValue => labelColorValue === labelColorValues[0]
  )
    ? labelColorValues[0]
    : null;
  for (const labelColorButton of componentContextMenuElement.querySelectorAll(
    "[data-label-color]"
  )) {
    labelColorButton.classList.toggle(
      "active",
      sharedLabelColor !== null && labelColorButton.dataset.labelColor === sharedLabelColor
    );
  }
  componentContextMenuElement.hidden = false;
  componentContextMenuElement.style.left = "0px";
  componentContextMenuElement.style.top = "0px";
  window.requestAnimationFrame(() => {
    const contextMenuRect = componentContextMenuElement.getBoundingClientRect();
    const contextMenuLeftPx = clampNumber(
      contextMenuEvent.clientX,
      8,
      Math.max(8, window.innerWidth - contextMenuRect.width - 8)
    );
    const contextMenuTopPx = clampNumber(
      contextMenuEvent.clientY,
      8,
      Math.max(8, window.innerHeight - contextMenuRect.height - 8)
    );
    componentContextMenuElement.style.left = contextMenuLeftPx + "px";
    componentContextMenuElement.style.top = contextMenuTopPx + "px";
  });
}
/**
 * 取一组控件的「共同可复制目标」。多选复制只允许落到所有成员都支持的目标上（取各自目标 key 的交集），
 * 否则会出现部分控件复制不进去、部分成功的半成品状态。
 */
function findCommonCopyTargets(copyTargetDocument, copySourceComponentIds) {
  const copySourceIds = [...new Set(copySourceComponentIds || [])].filter(Boolean);
  if (!copyTargetDocument || !copySourceIds.length) {
    return [];
  }
  const copyTargetKeysBySource = copySourceIds.map(
    copySourceId =>
      new Set(
        copyComponentTargets(copyTargetDocument, copySourceId).map(
          copyTargetEntry => copyTargetEntry.key
        )
      )
  );
  const commonCopyTargetKeys = [...(copyTargetKeysBySource[0] || [])].filter(copyTargetKey =>
    copyTargetKeysBySource.every(copyTargetKeySet => copyTargetKeySet.has(copyTargetKey))
  );
  const copyTargetsOfFirst = copyComponentTargets(copyTargetDocument, copySourceIds[0]);
  return commonCopyTargetKeys
    .map(matchedCopyTargetKey =>
      copyTargetsOfFirst.find(
        matchedCopyTargetEntry => matchedCopyTargetEntry.key === matchedCopyTargetKey
      )
    )
    .filter(Boolean);
}
/**
 * 弹出「复制成功」对话框，并记住可跳转的目标。
 */
function showCopySuccessDialog(copySuccessMessage, copySuccessTarget) {
  copySuccessNavigationTarget = copySuccessTarget || null;
  copyComponentSuccessMessageElement.textContent = copySuccessMessage;
  copyComponentSuccessDialogElement.showModal();
}
/**
 * 处理「复制成功」对话框的确认：跳到复制目标所在的仪表盘或页面。
 *
 * 目标可能跨仪表盘，所以先判断 projectId；同仪表盘内再切页并同步渲染器与图层列表。
 */
async function handleCopySuccessConfirm() {
  const pendingCopyNavigationTarget = copySuccessNavigationTarget;
  copySuccessNavigationTarget = null;
  copyComponentSuccessDialogElement.close();
  if (pendingCopyNavigationTarget) {
    if (
      pendingCopyNavigationTarget.projectId &&
      pendingCopyNavigationTarget.projectId !== activeProject?.projectId
    ) {
      await openProjectDraft(
        pendingCopyNavigationTarget.projectId,
        pendingCopyNavigationTarget.pagePath
      );
    } else if (
      pendingCopyNavigationTarget.pagePath &&
      pendingCopyNavigationTarget.pagePath !== pageSelectElement.value
    ) {
      pageSelectElement.value = pendingCopyNavigationTarget.pagePath;
      syncCustomSelect(pageSelectElement);
      editorRenderer?.navigate(pendingCopyNavigationTarget.pagePath);
      dashboardPreviewRenderer?.navigate(pendingCopyNavigationTarget.pagePath);
      renderComponentLists();
      syncInspector();
    }
    setComponentScope(pendingCopyNavigationTarget.scope);
  }
}
/**
 * 批量复制控件（编辑器内的「复制」）。先按原图层顺序排序再复制，保证复制后新控件的相对层级与原顺序一致；
 * 同集合内按 index 排序，跨集合保持入参顺序（此时 index 不可比）。复制完成后把选择集切到副本上。
 */
function duplicateComponents(
  duplicatedComponentIds,
  duplicateFocusComponentId = selectedComponentId
) {
  const duplicateRequestIds = [...new Set(duplicatedComponentIds || [])];
  if (duplicateRequestIds.length) {
    mutateDocument(duplicateDocument => {
      const copyLocationByComponentId = new Map(
        duplicateRequestIds.map(duplicateComponentId => [
          duplicateComponentId,
          findComponentLocation(duplicateDocument, duplicateComponentId)
        ])
      );
      const orderedDuplicateIds = duplicateRequestIds
        .filter(sortedDuplicateComponentId =>
          copyLocationByComponentId.get(sortedDuplicateComponentId)
        )
        .sort((duplicateIdA, duplicateIdB) => {
          const locationOfA = copyLocationByComponentId.get(duplicateIdA);
          const locationOfB = copyLocationByComponentId.get(duplicateIdB);
          if (locationOfA.collection === locationOfB.collection) {
            return locationOfA.index - locationOfB.index;
          } else {
            return 0;
          }
        });
      const createdDuplicateIds = [];
      const newIdBySourceId = new Map();
      for (const duplicateSourceId of orderedDuplicateIds) {
        const duplicatedComponentEntry = duplicateComponent(duplicateDocument, duplicateSourceId);
        if (duplicatedComponentEntry) {
          createdDuplicateIds.push(duplicatedComponentEntry.id);
          newIdBySourceId.set(duplicateSourceId, duplicatedComponentEntry.id);
        }
      }
      if (createdDuplicateIds.length) {
        selectedComponentId =
          newIdBySourceId.get(duplicateFocusComponentId) || createdDuplicateIds[0];
        selectedComponentIds = new Set(createdDuplicateIds);
        selectionAnchorComponentId = selectedComponentId;
      }
    });
  }
}
/**
 * 列出某文档内可作为复制落点的目标：侧边栏（共享区）唯一，排在页面之前，与复制对话框里的选项顺序一致。
 * 传入 options.sourceComponentId 时改为查询该控件的专属目标（目标依赖控件类型与作用域）。
 */
function copyTargetsForDocument(
  copyTargetSourceDocument,
  {
    includeShared: includeSharedTargets = true,
    sourceComponentId: explicitSourceComponentId = null
  } = {}
) {
  if (!copyTargetSourceDocument) {
    return [];
  }
  if (explicitSourceComponentId) {
    return copyComponentTargets(copyTargetSourceDocument, explicitSourceComponentId);
  }
  const pageCopyTargets = (copyTargetSourceDocument.pages || []).map(copyTargetPage => ({
    key: "page:" + copyTargetPage.path,
    name: copyTargetPage.name,
    scope: "page",
    page: copyTargetPage
  }));
  if (includeSharedTargets) {
    return [
      {
        key: "shared",
        name: "侧边栏",
        scope: "shared"
      },
      ...pageCopyTargets
    ];
  } else {
    return pageCopyTargets;
  }
}
/**
 * 渲染复制对话框里的目标下拉选项，并默认选中第一项。
 */
function renderCopyTargetOptions(copyTargetOptionList) {
  copyComponentPageTargetSelectElement.replaceChildren(
    ...copyTargetOptionList.map(
      copyTargetOption => new Option(copyTargetOption.name, copyTargetOption.key)
    )
  );
  copyComponentPageTargetSelectElement.disabled = !copyTargetOptionList.length;
  copyComponentPageTargetSelectElement.value = copyTargetOptionList[0]?.key || "";
  syncCustomSelect(copyComponentPageTargetSelectElement);
}
/**
 * 取文档的画布尺寸，缺失时回落到编辑器默认分辨率 2778×1940。
 */
function getDocumentCanvasSize(canvasSizeDocument) {
  return {
    width: Number(canvasSizeDocument?.canvas?.width || 2778),
    height: Number(canvasSizeDocument?.canvas?.height || 1940)
  };
}
/**
 * 显示跨仪表盘复制时的分辨率差异与「按比例缩放」选项。
 *
 * 只有目标仪表盘画布尺寸与当前不同才需要选缩放，否则缩放选项恒等、隐藏即可。
 */
function renderCopyScaleOptions() {
  if (copyComponentPageScopeSelectElement.value !== "other" || !copyTargetDraft) {
    copyComponentScaleOptionsElement.hidden = true;
    copyComponentResolutionSummaryElement.textContent = "";
    return;
  }
  const sourceCanvasSize = getDocumentCanvasSize(activeProject?.document);
  const targetCanvasSize = getDocumentCanvasSize(copyTargetDraft.document);
  const canvasSizeMismatch =
    sourceCanvasSize.width !== targetCanvasSize.width ||
    sourceCanvasSize.height !== targetCanvasSize.height;
  copyComponentScaleOptionsElement.hidden = !canvasSizeMismatch;
  copyComponentResolutionSummaryElement.textContent = canvasSizeMismatch
    ? sourceCanvasSize.width +
      " × " +
      sourceCanvasSize.height +
      " → " +
      targetCanvasSize.width +
      " × " +
      targetCanvasSize.height
    : "";
}
/**
 * 重建复制对话框：按「本仪表盘 / 其他仪表盘」两种目标刷新文案与可用选项。控件 ID 列表从弹窗的
 * data-component-ids 里取（JSON 串），解析失败按空列表处理，避免一次脏数据让整个弹窗打不开；
 * 跨仪表盘目标需要先拉草稿才能算目标页面，所以这里只负责置空并等用户选择。
 */
async function renderCopyComponentDialog() {
  const isOtherProjectTarget = copyComponentPageScopeSelectElement.value === "other";
  let copyDialogComponentIds = [];
  try {
    copyDialogComponentIds = JSON.parse(
      copyComponentPageDialogElement.dataset.componentIds || "[]"
    );
  } catch {
    copyDialogComponentIds = [];
  }
  const copyDialogFirstLocation = findComponent(activeProject?.document, copyDialogComponentIds[0]);
  const copyDialogComponentCount = copyDialogComponentIds.length;
  const copyDialogDescriptionElement = copyComponentPageDialogElement.querySelector(
    "[data-copy-component-description]"
  );
  copyComponentPageProjectFieldElement.hidden = !isOtherProjectTarget;
  copyComponentPageTargetLabelElement.textContent = isOtherProjectTarget
    ? "其他仪表盘目标页面"
    : "本仪表盘目标页面";
  copyComponentPageSubmitButtonElement.textContent = isOtherProjectTarget
    ? "复制到目标仪表盘"
    : "复制并前往";
  copyDialogDescriptionElement.textContent = isOtherProjectTarget
    ? "将选中的 " +
      copyDialogComponentCount +
      " 个控件完整复制到其他仪表盘的目标页面或侧边栏，源控件不受影响。"
    : copyDialogFirstLocation?.scope === "shared"
      ? "将选中的 " +
        copyDialogComponentCount +
        " 个侧边栏控件完整复制到指定主页面，复制后为该页面的独立控件。"
      : "将选中的 " +
        copyDialogComponentCount +
        " 个控件完整复制到侧边栏或其他主页面，保留位置、尺寸、样式、实体绑定和动作配置。";
  copyTargetDraft = null;
  copyComponentScaleOptionsElement.hidden = true;
  setSettingsMessage(copyComponentPageMessageElement, "");
  if (!isOtherProjectTarget) {
    const localCopyTargets = findCommonCopyTargets(activeProject?.document, copyDialogComponentIds);
    renderCopyTargetOptions(localCopyTargets);
    copyComponentPageSubmitButtonElement.disabled = !localCopyTargets.length;
    return;
  }
  const targetProjectId = copyComponentPageProjectSelectElement.value;
  if (!targetProjectId) {
    renderCopyTargetOptions([]);
    copyComponentPageSubmitButtonElement.disabled = true;
    setSettingsMessage(copyComponentPageMessageElement, "当前没有其他仪表盘可以复制。");
    return;
  }
  const copyTargetLoadTokenSnapshot = ++copyTargetLoadToken;
  renderCopyTargetOptions([]);
  copyComponentPageSubmitButtonElement.disabled = true;
  setSettingsMessage(copyComponentPageMessageElement, "正在读取目标仪表盘…");
  try {
    const targetDraftResponse = await requestJson(
      "/projects/" + encodeURIComponent(targetProjectId) + "/draft"
    );
    if (
      copyTargetLoadTokenSnapshot !== copyTargetLoadToken ||
      copyComponentPageScopeSelectElement.value !== "other"
    ) {
      return;
    }
    copyTargetDraft = targetDraftResponse;
    const targetCopyTargets = copyTargetsForDocument(targetDraftResponse.document);
    renderCopyTargetOptions(targetCopyTargets);
    renderCopyScaleOptions();
    setSettingsMessage(
      copyComponentPageMessageElement,
      targetCopyTargets.length ? "" : "目标仪表盘还没有可复制到的区域。"
    );
    copyComponentPageSubmitButtonElement.disabled = !targetCopyTargets.length;
  } catch (copyTargetLoadError) {
    if (copyTargetLoadTokenSnapshot !== copyTargetLoadToken) {
      return;
    }
    setSettingsMessage(copyComponentPageMessageElement, copyTargetLoadError.message, "error");
  }
}
/**
 * 打开「复制到其他区域」对话框，并把选中的控件 ID 记进弹窗 dataset。
 *
 * 先把无效 ID（已被删除的）过滤掉：右键菜单可能在控件被并发删除后才打开。
 */
function openCopyComponentDialog(copyComponentSelectionIds) {
  const copySourceDocument = activeProject?.document;
  const validCopyComponentIds = [...new Set(copyComponentSelectionIds || [])].filter(
    copyComponentId => findComponent(copySourceDocument, copyComponentId)
  );
  const copyAnchorLocation = findComponent(copySourceDocument, validCopyComponentIds[0]);
  if (!copyAnchorLocation || !validCopyComponentIds.length) {
    handleOperationError(new Error("没有找到要复制的控件。"));
    return;
  }
  copyComponentPageDialogElement.dataset.componentIds = JSON.stringify(validCopyComponentIds);
  copyComponentPageNameElement.textContent =
    validCopyComponentIds.length > 1
      ? "已选择 " + validCopyComponentIds.length + " 个控件"
      : "“" + componentLabel(copyAnchorLocation.component) + "”";
  copyComponentPageDialogElement.querySelector("[data-copy-component-description]").textContent =
    validCopyComponentIds.length > 1
      ? "将选中的 " + validCopyComponentIds.length + " 个控件完整复制到目标区域。"
      : copyAnchorLocation.scope === "shared"
        ? "将侧边栏控件完整复制到指定主页面，复制后为该页面的独立控件。"
        : "将当前控件完整复制到侧边栏或其他主页面，保留位置、尺寸、样式、实体绑定和动作配置。";
  copyComponentPageScopeSelectElement.value = "current";
  syncCustomSelect(copyComponentPageScopeSelectElement);
  const otherProjectList = projects.filter(
    otherProjectItem => otherProjectItem.id !== activeProject.projectId
  );
  copyComponentPageProjectSelectElement.replaceChildren(
    ...otherProjectList.map(
      otherProjectOption => new Option(otherProjectOption.name, otherProjectOption.id)
    )
  );
  copyComponentPageProjectSelectElement.disabled = !otherProjectList.length;
  syncCustomSelect(copyComponentPageProjectSelectElement);
  copyComponentPageFormElement.elements.copyScaleMode.value = "proportional";
  copyComponentPageDialogElement.showModal();
  renderCopyComponentDialog();
}
/**
 * 打开删除控件确认框；文案随选择数量变化。
 */
function openDeleteComponentDialog(deleteComponentIds) {
  const validDeleteComponentIds = [...new Set(deleteComponentIds || [])].filter(deleteComponentId =>
    findComponent(activeProject?.document, deleteComponentId)
  );
  if (validDeleteComponentIds.length) {
    deleteComponentDialogElement.dataset.componentIds = JSON.stringify(validDeleteComponentIds);
    if (validDeleteComponentIds.length > 1) {
      deleteComponentNameElement.textContent =
        "“已选择的 " + validDeleteComponentIds.length + " 个控件”";
    } else {
      const deleteAnchorComponent = findComponent(
        activeProject?.document,
        validDeleteComponentIds[0]
      )?.component;
      deleteComponentNameElement.textContent =
        "“" +
        componentLabel(
          deleteAnchorComponent || {
            type: "控件"
          }
        ) +
        "”";
    }
    deleteComponentDialogElement.showModal();
  }
}
/**
 * 批量设置控件的图层颜色标签。取消标签用 delete 而不是写空串：后端 schema 里该字段缺省表示「无标签」，
 * 留空串会让「取消」与「选了透明色」无法区分。
 */
function setComponentsLabelColor(labelColorComponentIds, newLabelColorValue) {
  const labelColorTargetIds = [...new Set(labelColorComponentIds || [])];
  if (!labelColorTargetIds.length) {
    return;
  }
  const normalizedLabelColor = strictHexColorOrEmpty(newLabelColorValue);
  mutateDocument(labelColorDocument => {
    for (const sortedLabelColorComponentId of labelColorTargetIds) {
      const targetLabelColorComponent = findComponent(
        labelColorDocument,
        sortedLabelColorComponentId
      )?.component;
      if (targetLabelColorComponent) {
        targetLabelColorComponent.style = {
          ...(targetLabelColorComponent.style || {})
        };
        if (normalizedLabelColor) {
          targetLabelColorComponent.style.editorLabelColor = normalizedLabelColor;
        } else {
          delete targetLabelColorComponent.style.editorLabelColor;
        }
      }
    }
  });
}
/**
 * 渲染图层列表（侧边栏或主页面）并挂上点选、拖拽排序：单击选择（Ctrl/Cmd 切换、Shift 区间），
 * 双击分组项下钻，右键打开控件菜单。拖拽数据用 text/plain 传 JSON（scope/sourceId/movingIds），
 * 仅同作用域生效；插入位置按鼠标是否过条目中线判定，用 CSS 类而非 DOM 占位画指示；组编辑态关闭 draggable。
 */
function renderComponentList(componentListElement, listComponents, listEmptyText, listScope) {
  componentListElement.replaceChildren();
  if (!listComponents.length) {
    const listEmptyElement = document.createElement("div");
    listEmptyElement.className = "element-list-empty";
    listEmptyElement.textContent = listEmptyText;
    componentListElement.append(listEmptyElement);
    return;
  }
  for (const listComponent of listComponents) {
    const componentItemElement = document.createElement("div");
    componentItemElement.className = "element-item";
    componentItemElement.dataset.componentId = listComponent.id;
    componentItemElement.dataset.scope = listScope;
    componentItemElement.draggable = !activeGroupId;
    componentItemElement.classList.toggle("selected", selectedComponentIds.has(listComponent.id));
    componentItemElement.classList.toggle(
      "selection-primary",
      listComponent.id === selectedComponentId
    );
    componentItemElement.classList.toggle("group-item", listComponent.type === "group");
    const itemLabelColor = strictHexColorOrEmpty(listComponent.style?.editorLabelColor);
    componentItemElement.classList.toggle("has-color-label", !!itemLabelColor);
    if (itemLabelColor) {
      componentItemElement.style.setProperty("--element-label-color", itemLabelColor);
    }
    const itemIconElement = document.createElement("i");
    itemIconElement.className =
      listComponent.type === "group" ? "element-group-icon" : "element-label-color";
    itemIconElement.setAttribute("aria-hidden", "true");
    if (listComponent.type === "group") {
      itemIconElement.innerHTML =
        '<svg viewBox="0 0 24 24" focusable="false"><path d="M3.5 7.5h6l1.8 2h9.2v9.5h-17z"/><path d="M3.5 7.5v-1h6l1.8 2"/></svg>';
    }
    const itemLabelElement = document.createElement("span");
    itemLabelElement.textContent = componentLabel(listComponent);
    const itemIsVisible = listComponent.style?.visible !== false;
    const itemVisibilityButtonElement = document.createElement("button");
    itemVisibilityButtonElement.type = "button";
    itemVisibilityButtonElement.className =
      "element-visibility" + (itemIsVisible ? "" : " hidden-element");
    itemVisibilityButtonElement.setAttribute(
      "aria-label",
      itemIsVisible
        ? "隐藏" + componentLabel(listComponent)
        : "显示" + componentLabel(listComponent)
    );
    itemVisibilityButtonElement.innerHTML = visibilityIconSvg(itemIsVisible);
    /**
     * 显示/隐藏按钮的 pointerdown：拦住冒泡并记下「刚点过这一项」，否则点按钮会顺带触发列表项选中与拖拽起手，
     * 用户想切可见性却把组件拖走了。lastComponentClick（组件 ID + 时间戳）让随后的 click 在 600ms 内认出同一次点击，
     * 从而当成一次选中而不是两次独立操作。
     */
    const stopItemEventPropagation = itemEvent => {
      lastComponentClick = {
        componentId: listComponent.id,
        at: Date.now()
      };
      itemEvent.stopPropagation();
    };
    itemVisibilityButtonElement.addEventListener("pointerdown", stopItemEventPropagation);
    itemVisibilityButtonElement.addEventListener("click", visibilityClickEvent => {
      lastComponentClick = {
        componentId: listComponent.id,
        at: Date.now()
      };
      visibilityClickEvent.stopPropagation();
      selectComponent(listComponent.id, {
        preserveGroup: true
      });
      setComponentsVisibility([listComponent.id], !itemIsVisible);
    });
    itemVisibilityButtonElement.addEventListener("dblclick", stopItemEventPropagation);
    componentItemElement.append(itemIconElement, itemLabelElement, itemVisibilityButtonElement);
    componentItemElement.addEventListener("click", itemClickEvent => {
      selectComponent(listComponent.id, {
        toggle: itemClickEvent.metaKey || itemClickEvent.ctrlKey,
        range: itemClickEvent.shiftKey
      });
    });
    componentItemElement.addEventListener("dblclick", itemDoubleClickEvent => {
      if (
        listComponent.type !== "group" ||
        itemDoubleClickEvent.target.closest(".element-visibility")
      ) {
        return;
      }
      if (
        lastComponentClick.componentId === listComponent.id &&
        Date.now() - lastComponentClick.at < 600
      ) {
        itemDoubleClickEvent.preventDefault();
        itemDoubleClickEvent.stopPropagation();
        return;
      }
      itemDoubleClickEvent.preventDefault();
      itemDoubleClickEvent.stopPropagation();
      activeGroupId = listComponent.id;
      clearComponentSelection();
      renderComponentLists();
      syncRendererSelection();
      syncInspector();
    });
    componentItemElement.addEventListener("contextmenu", itemContextMenuEvent =>
      openComponentContextMenu(itemContextMenuEvent, listComponent.id)
    );
    componentItemElement.addEventListener("dragstart", itemDragStartEvent => {
      if (selectedComponentIds.has(listComponent.id)) {
        selectedComponentId = listComponent.id;
      } else {
        selectedComponentIds = new Set([listComponent.id]);
        selectedComponentId = listComponent.id;
        selectionAnchorComponentId = listComponent.id;
      }
      const draggingComponentIds = [...selectedComponentIds];
      itemDragStartEvent.dataTransfer.effectAllowed = "move";
      itemDragStartEvent.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          scope: listScope,
          sourceId: listComponent.id,
          movingIds: draggingComponentIds
        })
      );
      componentListElement.querySelectorAll(".element-item").forEach(listItemElement => {
        listItemElement.classList.toggle(
          "dragging",
          draggingComponentIds.includes(listItemElement.dataset.componentId)
        );
      });
    });
    componentItemElement.addEventListener("dragend", () => {
      componentListElement
        .querySelectorAll(".dragging")
        .forEach(draggingElement => draggingElement.classList.remove("dragging"));
      componentListElement
        .querySelectorAll(".drop-before, .drop-after")
        .forEach(dropMarkerElement =>
          dropMarkerElement.classList.remove("drop-before", "drop-after")
        );
    });
    componentItemElement.addEventListener("dragover", itemDragOverEvent => {
      if (!itemDragOverEvent.dataTransfer.types.includes("text/plain")) {
        return;
      }
      itemDragOverEvent.preventDefault();
      itemDragOverEvent.dataTransfer.dropEffect = "move";
      const isDropAfter =
        itemDragOverEvent.clientY >=
        componentItemElement.getBoundingClientRect().top +
          componentItemElement.getBoundingClientRect().height / 2;
      componentItemElement.classList.toggle("drop-before", !isDropAfter);
      componentItemElement.classList.toggle("drop-after", isDropAfter);
    });
    componentItemElement.addEventListener("dragleave", () =>
      componentItemElement.classList.remove("drop-before", "drop-after")
    );
    componentItemElement.addEventListener("drop", itemDropEvent => {
      itemDropEvent.preventDefault();
      let dragPayload;
      try {
        dragPayload = JSON.parse(itemDropEvent.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
      const { scope: payloadScope, sourceId: payloadSourceId } = dragPayload;
      const payloadMovingIds = Array.isArray(dragPayload.movingIds)
        ? dragPayload.movingIds
        : [payloadSourceId];
      const isDropAfterTarget = componentItemElement.classList.contains("drop-after");
      componentItemElement.classList.remove("drop-before", "drop-after");
      if (
        payloadScope === listScope &&
        !!payloadSourceId &&
        !payloadMovingIds.includes(listComponent.id)
      ) {
        selectedComponentId = payloadSourceId;
        selectedComponentIds = new Set(payloadMovingIds);
        mutateDocument(dropDocument => {
          const dropCollection =
            listScope === "shared"
              ? dropDocument.sharedComponents
              : dropDocument.pages.find(
                  dropPageEntry => dropPageEntry.path === pageSelectElement.value
                )?.components;
          if (!dropCollection) {
            return;
          }
          const payloadMovingIdSet = new Set(payloadMovingIds);
          const movedDropComponents = dropCollection.filter(movedDropCollectionComponent =>
            payloadMovingIdSet.has(movedDropCollectionComponent.id)
          );
          if (!movedDropComponents.length) {
            return;
          }
          const remainingDropComponents = dropCollection.filter(
            remainingDropCollectionComponent =>
              !payloadMovingIdSet.has(remainingDropCollectionComponent.id)
          );
          const dropTargetIndex = remainingDropComponents.findIndex(
            dropIndexCollectionComponent => dropIndexCollectionComponent.id === listComponent.id
          );
          if (!(dropTargetIndex < 0)) {
            remainingDropComponents.splice(
              dropTargetIndex + (isDropAfterTarget ? 1 : 0),
              0,
              ...movedDropComponents
            );
            dropCollection.splice(0, dropCollection.length, ...remainingDropComponents);
            applyCollectionLayerOrder(dropCollection);
            if (listScope === "shared") {
              syncSharedComponentReferenceOrder(dropDocument);
            }
          }
        });
      }
    });
    componentListElement.append(componentItemElement);
  }
}
/**
 * 在图层列表顶部插入「返回上层」按钮，用于退出分组编辑态。
 */
function prependGroupBackButton(groupBackListElement, groupBackComponent) {
  if (!groupBackComponent) {
    return;
  }
  const groupBackButtonElement = document.createElement("button");
  groupBackButtonElement.type = "button";
  groupBackButtonElement.className = "element-group-back";
  groupBackButtonElement.textContent = "← 返回" + componentLabel(groupBackComponent);
  groupBackButtonElement.addEventListener("click", () => {
    activeGroupId = null;
    clearComponentSelection();
    renderComponentLists();
    syncRendererSelection();
    syncInspector();
  });
  groupBackListElement.prepend(groupBackButtonElement);
}
/**
 * 重建侧边栏与主页面两个图层列表。组编辑态下两个列表各自展示该组的子控件；若组已被删除
 * （例如撤销后回到没有该组的状态）则自动退出组编辑态，避免停留在空列表里。
 */
function renderComponentLists() {
  const activePageEntry = currentPage();
  const activeGroupLocation = activeGroupId
    ? findComponent(activeProject?.document, activeGroupId)
    : null;
  const activeGroupComponent =
    activeGroupLocation?.component?.type === "group" ? activeGroupLocation.component : null;
  if (activeGroupId && !activeGroupComponent) {
    activeGroupId = null;
  }
  const sharedListComponents =
    activeGroupComponent && activeGroupLocation.scope === "shared"
      ? activeGroupComponent.children || []
      : activeProject?.document?.sharedComponents || [];
  const pageListComponents =
    activeGroupComponent && activeGroupLocation.scope === "page"
      ? activeGroupComponent.children || []
      : activePageEntry?.components || [];
  renderComponentList(sharedComponentListElement, sharedListComponents, "暂无侧边栏控件", "shared");
  renderComponentList(pageComponentListElement, pageListComponents, "暂无主页面控件", "page");
  if (activeGroupComponent) {
    prependGroupBackButton(
      activeGroupLocation.scope === "shared"
        ? sharedComponentListElement
        : pageComponentListElement,
      activeGroupComponent
    );
  }
}
/**
 * 切换图层面板的当前作用域（侧边栏 / 主页面）。
 */
function setComponentScope(componentScopeName) {
  componentScope = componentScopeName === "page" ? "page" : "shared";
  const isSharedScope = componentScope === "shared";
  showSharedComponentsButtonElement.classList.toggle("active", isSharedScope);
  showPageComponentsButtonElement.classList.toggle("active", !isSharedScope);
  sharedComponentListElement.hidden = !isSharedScope;
  pageComponentListElement.hidden = isSharedScope;
  syncAddComponentButton();
}
/**
 * 同步「添加控件」按钮的可用性与提示文案。
 */
function syncAddComponentButton() {
  const hasCurrentPage = !!currentPage();
  const hasComponentTemplates = ["shared", "page"].some(
    templateScope => listComponentTemplates(templateScope).length > 0
  );
  addComponentButtonElement.disabled = !hasCurrentPage || !hasComponentTemplates;
  addComponentButtonElement.title = hasCurrentPage
    ? hasComponentTemplates
      ? "从模板库添加控件"
      : "该区域暂无可用控件模板"
    : "请先新建页面";
}
/**
 * 渲染控件模板库弹窗。两类模板（侧边栏 / 主页面）合并后按 id 去重，重复的模板只出现一次；
 * interaction3d 没有静态缩略图，走 renderInteraction3dThumbnail 实时渲染。
 */
function renderComponentTemplates() {
  const componentTemplates = [
    ...listComponentTemplates("shared"),
    ...listComponentTemplates("page")
  ].filter(
    (templateEntry, templateIndex, templateList) =>
      templateList.findIndex(templateEntryItem => templateEntryItem.id === templateEntry.id) ===
      templateIndex
  );
  componentTemplateScopeElement.textContent =
    componentScope === "shared"
      ? "当前添加到侧边栏，添加后会在所有页面显示。"
      : "当前添加到主页面，仅在“" + (currentPage()?.name || "当前页面") + "”显示。";
  if (!componentTemplates.length) {
    const templateEmptyElement = document.createElement("div");
    templateEmptyElement.className = "component-template-empty";
    templateEmptyElement.textContent = "当前 UI 方案暂无可用控件模板。";
    componentTemplateListElement.replaceChildren(templateEmptyElement);
    return;
  }
  componentTemplateListElement.replaceChildren(
    ...componentTemplates.map(componentTemplate => {
      const templateCardElement = document.createElement("button");
      templateCardElement.type = "button";
      templateCardElement.className = "component-template-card";
      templateCardElement.dataset.templateId = componentTemplate.id;
      const templatePreviewElement = document.createElement("span");
      templatePreviewElement.className = "component-template-preview";
      templatePreviewElement.setAttribute("aria-hidden", "true");
      if (componentTemplate.id === "interaction3d") {
        renderInteraction3dThumbnail(templatePreviewElement);
      } else {
        const templateThumbnailElement = document.createElement("img");
        const templateThumbnailId = componentTemplate.thumbnailId || componentTemplate.id;
        templateThumbnailElement.src =
          "/static/component-thumbnails/" +
          encodeURIComponent(templateThumbnailId) +
          ".jpg?v=2609260946";
        templateThumbnailElement.alt = "";
        templatePreviewElement.append(templateThumbnailElement);
      }
      const templateCopyElement = document.createElement("span");
      templateCopyElement.className = "component-template-copy";
      const templateNameElement = document.createElement("strong");
      templateNameElement.textContent = componentTemplate.name;
      const templateDescriptionElement = document.createElement("span");
      templateDescriptionElement.textContent = componentTemplate.description;
      templateCopyElement.append(templateNameElement, templateDescriptionElement);
      templateCardElement.append(templatePreviewElement, templateCopyElement);
      if (componentTemplate.id === "interaction3d") {
        updateInteraction3dCard(templateCardElement);
      }
      return templateCardElement;
    })
  );
}
// input_* 系列与 counter/timer/schedule 在 HA 里都是「辅助元素」，不是真实设备，
// 实体选择器上统一标成「辅助元素」而不是各自的域中文名。
const HELPER_ENTITY_DOMAINS = new Set([
  "input_boolean",
  "input_button",
  "input_datetime",
  "input_number",
  "input_select",
  "input_text",
  "counter",
  "timer",
  "schedule"
]);
// 实体域到中文名。未收录的域在界面上直接回落显示分域自身（见 entityKindLabel）。
const ENTITY_DOMAIN_LABELS = {
  alarm_control_panel: "安防",
  automation: "自动化",
  binary_sensor: "二元传感器",
  button: "按钮",
  calendar: "日历",
  camera: "摄像头",
  climate: "空调",
  cover: "窗帘",
  device_tracker: "设备追踪",
  event: "事件",
  fan: "风扇",
  image: "图像",
  light: "灯光",
  lock: "门锁",
  media_player: "媒体播放器",
  number: "数值",
  person: "人员",
  remote: "遥控器",
  scene: "场景",
  script: "脚本",
  select: "选择器",
  sensor: "传感器",
  sun: "太阳",
  switch: "开关",
  text: "文本",
  update: "更新",
  vacuum: "扫地机",
  weather: "天气",
  zone: "区域"
};

const MAX_LIGHT_STATISTICS_ENTITIES = 100;

bindPointerSection();

/**
 * 渲染导航按钮的图标预览与复制按钮状态。图标用 CSS mask + 背景色实现，所以同一张 SVG 能跟随主题色
 * 变化；hidden 与 maskImage 必须同时设置，否则旧图标的遮罩会残留；未选图标时禁用复制按钮，避免复制到空串。
 */
function renderNavigationIconPreview(navigationIconName) {
  const navigationIconValue = String(navigationIconName || "");
  const navigationIconPreviewElement = navigationIconButtonElement.querySelector("i");
  const navigationIconLabelElement = navigationIconButtonElement.querySelector("span");
  const navigationIconUrl = mdiIconUrl(navigationIconValue);
  navigationIconPreviewElement.hidden = !navigationIconUrl;
  navigationIconPreviewElement.style.maskImage = navigationIconUrl
    ? 'url("' + navigationIconUrl + '")'
    : "";
  navigationIconPreviewElement.style.webkitMaskImage = navigationIconUrl
    ? 'url("' + navigationIconUrl + '")'
    : "";
  navigationIconLabelElement.textContent = navigationIconValue || "不使用图标";
  navigationIconCopyButtonElement.disabled = !navigationIconValue;
  navigationIconCopyButtonElement.title = navigationIconValue
    ? "复制 " + navigationIconValue
    : "当前未使用图标";
}
/**
 * 回填图标按钮「效果图标」的预览与复制按钮状态。
 */
function renderIconButtonEffectIconPreview(effectIconName) {
  const effectIconValue = String(effectIconName || "");
  const effectIconPreviewElement = iconButtonEffectIconButtonElement.querySelector("i");
  const effectIconLabelElement = iconButtonEffectIconButtonElement.querySelector("span");
  const effectIconUrl = mdiIconUrl(effectIconValue);
  effectIconPreviewElement.hidden = !effectIconUrl;
  effectIconPreviewElement.style.maskImage = effectIconUrl ? 'url("' + effectIconUrl + '")' : "";
  effectIconPreviewElement.style.webkitMaskImage = effectIconUrl
    ? 'url("' + effectIconUrl + '")'
    : "";
  effectIconLabelElement.textContent = effectIconValue || "不使用图标";
  iconButtonEffectIconCopyButtonElement.disabled = !effectIconValue;
  iconButtonEffectIconCopyButtonElement.title = effectIconValue
    ? "复制 " + effectIconValue
    : "当前未使用图标";
}
/**
 * 回填图标按钮「常态图标」的预览与复制按钮状态。设备按钮允许不指定图标，此时按钮上显示「跟随实体图标」，
 * 提示图标来自实体绑定而不是这里选的。
 */
function renderIconButtonIconPreview(iconButtonIconName) {
  const iconButtonIconValue = String(iconButtonIconName || "");
  const iconButtonFollowsEntity = ["device-button", "presence-sensor"].includes(
    selectedComponent()?.type
  );
  const iconButtonIconPreviewElement = iconButtonIconButtonElement.querySelector("i");
  const iconButtonIconLabelElement = iconButtonIconButtonElement.querySelector("span");
  const iconButtonIconUrl = mdiIconUrl(iconButtonIconValue);
  iconButtonIconPreviewElement.hidden = !iconButtonIconUrl;
  iconButtonIconPreviewElement.style.maskImage = iconButtonIconUrl
    ? 'url("' + iconButtonIconUrl + '")'
    : "";
  iconButtonIconPreviewElement.style.webkitMaskImage = iconButtonIconUrl
    ? 'url("' + iconButtonIconUrl + '")'
    : "";
  iconButtonIconLabelElement.textContent =
    iconButtonIconValue || (iconButtonFollowsEntity ? "跟随实体图标" : "不使用图标");
  iconButtonIconCopyButtonElement.disabled = !iconButtonIconValue;
  iconButtonIconCopyButtonElement.title = iconButtonIconValue
    ? "复制 " + iconButtonIconValue
    : "当前未使用图标";
}
/**
 * 回填标题按钮图标的预览与复制按钮状态。
 */
function renderTitleButtonIconPreview(titleButtonIconName) {
  const titleButtonIconValue = String(titleButtonIconName || "");
  const titleIconPreviewElement = titleButtonIconButtonElement.querySelector("i");
  const titleIconLabelElement = titleButtonIconButtonElement.querySelector("span");
  const titleIconUrl = mdiIconUrl(titleButtonIconValue);
  titleIconPreviewElement.hidden = !titleIconUrl;
  titleIconPreviewElement.style.maskImage = titleIconUrl ? 'url("' + titleIconUrl + '")' : "";
  titleIconPreviewElement.style.webkitMaskImage = titleIconUrl ? 'url("' + titleIconUrl + '")' : "";
  titleIconLabelElement.textContent = titleButtonIconValue || "不使用图标";
  titleButtonIconCopyButtonElement.disabled = !titleButtonIconValue;
  titleButtonIconCopyButtonElement.title = titleButtonIconValue
    ? "复制 " + titleButtonIconValue
    : "当前未使用图标";
}
/**
 * 回填统计控件图标的预览与复制按钮状态。
 */
function renderLightStatisticsIconPreview(lightStatisticsIconName) {
  const statisticsIconValue = String(lightStatisticsIconName ?? "mdi:lightbulb-group-outline");
  const statisticsIconPreviewElement = lightStatisticsIconButtonElement.querySelector("i");
  const statisticsIconLabelElement = lightStatisticsIconButtonElement.querySelector("span");
  const statisticsIconUrl = mdiIconUrl(statisticsIconValue);
  statisticsIconPreviewElement.hidden = !statisticsIconUrl;
  statisticsIconPreviewElement.style.maskImage = statisticsIconUrl
    ? 'url("' + statisticsIconUrl + '")'
    : "";
  statisticsIconPreviewElement.style.webkitMaskImage = statisticsIconUrl
    ? 'url("' + statisticsIconUrl + '")'
    : "";
  statisticsIconLabelElement.textContent = statisticsIconValue || "不使用图标";
  lightStatisticsIconCopyButtonElement.disabled = !statisticsIconValue;
  lightStatisticsIconCopyButtonElement.title = statisticsIconValue
    ? "复制 " + statisticsIconValue
    : "当前未使用图标";
}
/**
 * 复制文本到剪贴板：优先异步剪贴板 API（需安全上下文），不可用时退回临时 textarea + execCommand("copy")，
 * 覆盖 http 内网部署的场景。两种方式都没复制成功时抛「复制失败。」。
 */
async function copyTextToClipboard(clipboardText) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(clipboardText);
    return;
  }
  const clipboardTextAreaElement = document.createElement("textarea");
  clipboardTextAreaElement.value = clipboardText;
  clipboardTextAreaElement.setAttribute("readonly", "");
  clipboardTextAreaElement.style.position = "fixed";
  clipboardTextAreaElement.style.opacity = "0";
  document.body.append(clipboardTextAreaElement);
  clipboardTextAreaElement.select();
  const didCopyText = document.execCommand("copy");
  clipboardTextAreaElement.remove();
  if (!didCopyText) {
    throw new Error("复制失败。");
  }
}
/**
 * 给实体选择按钮旁挂一个「复制实体 ID」的小按钮。幂等：重复调用直接返回缓存在元素 _entityCopySync 上的
 * 同步函数，因为检查器每次回填都会走到这里。宿主按钮会被包进一行 flex 容器（replaceWith 后重新 append），
 * 所以刷新文案必须作用在包好的新结构上。
 */
function enhanceEntityCopyButton(
  copyButtonHostElement,
  entityIdGetter = () => copyButtonHostElement.dataset.entityId || ""
) {
  if (!copyButtonHostElement || copyButtonHostElement.dataset.entityCopyReady === "true") {
    return copyButtonHostElement._entityCopySync;
  }
  ensurePickerValueElement(copyButtonHostElement);
  const entityCopyRowElement = document.createElement("div");
  entityCopyRowElement.className = "entity-picker-field-row";
  const entityCopyButtonElement = document.createElement("button");
  entityCopyButtonElement.type = "button";
  entityCopyButtonElement.className = "navigation-icon-copy entity-picker-copy";
  entityCopyButtonElement.title = "复制实体 ID";
  entityCopyButtonElement.setAttribute("aria-label", "复制实体 ID");
  entityCopyButtonElement.disabled = true;
  entityCopyButtonElement.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.3"></rect><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5"></path></svg><span aria-hidden="true">✓</span>';
  /**
   * 按当前实体 ID 刷新复制按钮的可用状态与提示文案。
   */
  const syncEntityCopyButton = () => {
    const currentEntityId = String(entityIdGetter() || "");
    entityCopyButtonElement.dataset.entityId = currentEntityId;
    entityCopyButtonElement.disabled = !currentEntityId;
    entityCopyButtonElement.title = currentEntityId ? "复制 " + currentEntityId : "当前未选择实体";
  };
  entityCopyButtonElement.addEventListener("click", async entityCopyClickEvent => {
    entityCopyClickEvent.preventDefault();
    entityCopyClickEvent.stopPropagation();
    const clickedEntityId = entityCopyButtonElement.dataset.entityId || "";
    if (clickedEntityId) {
      try {
        await copyTextToClipboard(clickedEntityId);
        entityCopyButtonElement.classList.add("copied");
        window.setTimeout(() => entityCopyButtonElement.classList.remove("copied"), 1000);
      } catch (entityCopyError) {
        handleOperationError(entityCopyError);
      }
    }
  });
  copyButtonHostElement.replaceWith(entityCopyRowElement);
  entityCopyRowElement.append(copyButtonHostElement, entityCopyButtonElement);
  copyButtonHostElement.dataset.entityCopyReady = "true";
  copyButtonHostElement._entityCopySync = syncEntityCopyButton;
  syncEntityCopyButton();
  return syncEntityCopyButton;
}
/**
 * 为所有带实体选择的按钮补上「复制实体 ID」按钮。按钮是写死在 HTML 里的固定清单（id 枚举），
 * 逐个 getElementById 后再增强，找不到的跳过，这样某个检查器被移除时不会连带报错；函数在模块初始化时立即执行一次。
 */
function enhanceEntityCopyButtons() {
  for (const entityButtonId of [
    "image-entity-button",
    "ibe-entity-button",
    "icon-button-entity-button",
    "air-conditioner-entity-button",
    "vacuum-map-entity-button",
    "camera-entity-button",
    "weather-entity-button",
    "line-chart-entity-button",
    "navigation-entity-button",
    "popup-module-entity-button"
  ]) {
    const entityButtonElement = document.getElementById(entityButtonId);
    if (entityButtonElement) {
      enhanceEntityCopyButton(entityButtonElement);
    }
  }
}
enhanceEntityCopyButtons();
const ICON_PAGE_SIZE = 160;
const iconListStateByElement = new WeakMap();

let iconTooltipElement = null;

attachInfiniteScroll(navigationIconOptionsElement, () =>
  loadNavigationIconOptions(navigationIconSearchInputElement.value, {
    append: true
  })
);
attachInfiniteScroll(iconButtonEffectIconOptionsElement, () =>
  loadIconButtonEffectIconOptions(iconButtonEffectIconSearchInputElement.value, {
    append: true
  })
);
attachInfiniteScroll(iconButtonIconOptionsElement, () =>
  loadIconButtonIconOptions(iconButtonIconSearchInputElement.value, {
    append: true
  })
);
attachInfiniteScroll(titleButtonIconOptionsElement, () =>
  loadTitleButtonIconOptions(titleButtonIconSearchInputElement.value, {
    append: true
  })
);
attachInfiniteScroll(lightStatisticsIconOptionsElement, () =>
  loadLightStatisticsIconOptions(lightStatisticsIconSearchInputElement.value, {
    append: true
  })
);

let relatedPopupElement = null;
let relatedPopupTitleElement = null;
let relatedPopupSummaryElement = null;
let relatedPopupHintElement = null;
let relatedPopupListElement = null;
let relatedPopupOpenButtonElement = null;
let relatedPopupDialogElement = null;
let relatedPopupDialogTitleElement = null;
let relatedPopupSearchInputElement = null;
/**
 * 建立 entityId → 实体 的索引表。每次调用都重建而不缓存：实体列表来自轮询 / 推送，缓存反而要额外
 * 处理失效；过滤空 ID 是为了避免多个「没有 ID」的记录互相覆盖。
 */
function entitiesByEntityId() {
  return new Map(
    entities
      .map(entityRecord => [String(entityRecord.entityId || ""), entityRecord])
      .filter(([entityValue]) => entityValue)
  );
}
/**
 * 建立 deviceId → 设备 的索引表。
 */
function devicesByDeviceId() {
  return new Map(
    devices
      .map(deviceRecord => [String(deviceRecord.deviceId || ""), deviceRecord])
      .filter(([deviceValue]) => deviceValue)
  );
}
/**
 * 按搜索词过滤「关联实体」弹窗里的候选项，并切换空结果提示。匹配用预先拼在 data-related-entity-search
 * 上的可搜索文本（ID + 名称 + 域），这样每次输入只做子串比较，不必重新归一化全部候选。
 */
function filterRelatedEntityOptions() {
  const searchTerm = String(relatedPopupSearchInputElement?.value || "")
    .trim()
    .toLocaleLowerCase("zh-CN");
  let visibleCount = 0;
  for (const optionElement of relatedPopupListElement?.querySelectorAll(
    "[data-related-entity-id]"
  ) || []) {
    const isVisible =
      !searchTerm || String(optionElement.dataset.relatedEntitySearch || "").includes(searchTerm);
    optionElement.hidden = !isVisible;
    if (isVisible) {
      visibleCount += 1;
    }
  }
  const filterEmptyElement = relatedPopupListElement?.querySelector(
    ".popup-related-entity-filter-empty"
  );
  if (filterEmptyElement) {
    filterEmptyElement.hidden = visibleCount > 0;
  }
}
/**
 * 取（必要时创建）「关联设备弹窗功能」设置区的 DOM。懒创建 + 幂等：这组节点只在需要展示关联弹窗设置
 * 时才存在，若已创建则直接返回，避免重复插入；相关节点统一挂到模块级变量上，后续同步逻辑直接引用，
 * 不必每次 querySelector。
 */
function ensureRelatedPopupElement() {
  if (relatedPopupElement) {
    return relatedPopupElement;
  }
  relatedPopupElement = document.createElement("div");
  relatedPopupElement.id = "popup-related-entity-settings";
  relatedPopupElement.className = "popup-related-entity-settings";
  relatedPopupTitleElement = document.createElement("strong");
  relatedPopupSummaryElement = document.createElement("span");
  relatedPopupOpenButtonElement = document.createElement("button");
  relatedPopupOpenButtonElement.type = "button";
  relatedPopupOpenButtonElement.className = "popup-related-entity-open";
  const arrowIconElement = document.createElement("i");
  arrowIconElement.setAttribute("aria-hidden", "true");
  arrowIconElement.textContent = "›";
  relatedPopupOpenButtonElement.append(relatedPopupSummaryElement, arrowIconElement);
  relatedPopupHintElement = document.createElement("p");
  relatedPopupElement.append(
    relatedPopupTitleElement,
    relatedPopupOpenButtonElement,
    relatedPopupHintElement
  );
  relatedPopupDialogElement = document.createElement("dialog");
  relatedPopupDialogElement.id = "popup-related-entity-dialog";
  relatedPopupDialogElement.className = "popup-related-entity-dialog";
  const dialogCardElement = document.createElement("div");
  dialogCardElement.className = "popup-related-entity-dialog-card";
  const dialogHeadingElement = document.createElement("div");
  dialogHeadingElement.className = "popup-related-entity-dialog-heading";
  const headingTextElement = document.createElement("div");
  relatedPopupDialogTitleElement = document.createElement("strong");
  const headingHintElement = document.createElement("span");
  headingHintElement.textContent = "选择要放进设备弹窗的功能";
  headingTextElement.append(relatedPopupDialogTitleElement, headingHintElement);
  const closeButtonElement = document.createElement("button");
  closeButtonElement.type = "button";
  closeButtonElement.setAttribute("aria-label", "关闭关联功能选择");
  closeButtonElement.textContent = "×";
  dialogHeadingElement.append(headingTextElement, closeButtonElement);
  const searchLabelElement = document.createElement("label");
  searchLabelElement.className = "popup-related-entity-dialog-search";
  relatedPopupSearchInputElement = document.createElement("input");
  relatedPopupSearchInputElement.type = "search";
  relatedPopupSearchInputElement.name = "popup-related-entity-search";
  relatedPopupSearchInputElement.placeholder = "搜索功能名称或实体 ID";
  relatedPopupSearchInputElement.autocomplete = "off";
  searchLabelElement.append(relatedPopupSearchInputElement);
  relatedPopupListElement = document.createElement("div");
  relatedPopupListElement.className = "popup-related-entity-list";
  const dialogFooterElement = document.createElement("div");
  dialogFooterElement.className = "popup-related-entity-dialog-footer";
  const doneButtonElement = document.createElement("button");
  doneButtonElement.type = "button";
  doneButtonElement.textContent = "完成";
  dialogFooterElement.append(doneButtonElement);
  dialogCardElement.append(
    dialogHeadingElement,
    searchLabelElement,
    relatedPopupListElement,
    dialogFooterElement
  );
  relatedPopupDialogElement.append(dialogCardElement);
  document.body.append(relatedPopupDialogElement);
  relatedPopupOpenButtonElement.addEventListener("click", () => {
    if (!relatedPopupDialogElement.open) {
      relatedPopupSearchInputElement.value = "";
      filterRelatedEntityOptions();
      relatedPopupDialogElement.showModal();
      window.requestAnimationFrame(() =>
        relatedPopupSearchInputElement.focus({
          preventScroll: true
        })
      );
    }
  });
  relatedPopupSearchInputElement.addEventListener("input", filterRelatedEntityOptions);
  closeButtonElement.addEventListener("click", () => relatedPopupDialogElement.close());
  doneButtonElement.addEventListener("click", () => relatedPopupDialogElement.close());
  relatedPopupDialogElement.addEventListener("click", dialogClickEvent => {
    if (dialogClickEvent.target === relatedPopupDialogElement) {
      relatedPopupDialogElement.close();
    }
  });
  relatedPopupListElement.addEventListener("click", listClickEvent => {
    const relatedOptionElement = listClickEvent.target.closest("[data-related-entity-id]");
    const activeComponentId = selectedComponentId;
    if (!relatedOptionElement || !activeComponentId || relatedOptionElement.disabled) {
      return;
    }
    const toggledEntityId = String(relatedOptionElement.dataset.relatedEntityId || "");
    const currentComponent = selectedComponent();
    const entityMap = entitiesByEntityId();
    const deviceMap = devicesByDeviceId();
    if (!relatedPopupContext(currentComponent, entityMap, deviceMap)) {
      return;
    }
    const configuredRelatedIds = selectedRelatedEntityIds(currentComponent);
    const selectedIdSet = new Set(
      configuredRelatedIds === null
        ? legacyRelatedEntityIds(currentComponent, entityMap, deviceMap)
        : configuredRelatedIds
    );
    const popupContext = relatedPopupContext(currentComponent, entityMap, deviceMap);
    const selectionLimit = relatedPopupSelectionLimit(popupContext);
    if (selectedIdSet.has(toggledEntityId)) {
      selectedIdSet.delete(toggledEntityId);
    } else if (!selectionLimit || selectedIdSet.size < selectionLimit) {
      selectedIdSet.add(toggledEntityId);
    } else {
      return;
    }
    mutateDocument(draftDocument => {
      const targetComponent = findComponent(draftDocument, activeComponentId)?.component;
      if (targetComponent) {
        targetComponent.properties = {
          ...(targetComponent.properties || {}),
          relatedEntities: manualRelatedEntityConfig([...selectedIdSet])
        };
      }
    });
  });
  return relatedPopupElement;
}
/**
 * 在指定锚点后显示「关联实体」配置块，并回填当前的关联配置摘要。anchorElement 为 null、或该控件不支持
 * 关联功能时整体隐藏，并关掉可能开着的选择弹窗（弹窗是单例，切换控件后留着会指向错误的控件）；
 * 配置块随锚点搬动而不是重建，所以用 insertAdjacentElement。
 */
function updateRelatedPopup(editedComponent, anchorElement) {
  const popupElement = ensureRelatedPopupElement();
  const entityMapSnapshot = entitiesByEntityId();
  const deviceMapSnapshot = devicesByDeviceId();
  const relatedContext = relatedPopupContext(editedComponent, entityMapSnapshot, deviceMapSnapshot);
  if (!relatedContext || !anchorElement) {
    popupElement.hidden = true;
    if (relatedPopupDialogElement?.open) {
      relatedPopupDialogElement.close();
    }
    return;
  }
  if (popupElement.previousElementSibling !== anchorElement) {
    anchorElement.insertAdjacentElement("afterend", popupElement);
  }
  popupElement.hidden = false;
  const storedRelatedIds = selectedRelatedEntityIds(editedComponent);
  const isAutomaticSelection = storedRelatedIds === null;
  const currentRelatedIdSet = new Set(
    isAutomaticSelection
      ? legacyRelatedEntityIds(editedComponent, entityMapSnapshot, deviceMapSnapshot)
      : storedRelatedIds
  );
  const popupSelectionLimit = relatedPopupSelectionLimit(relatedContext);
  const isLimitReached = popupSelectionLimit > 0 && currentRelatedIdSet.size >= popupSelectionLimit;
  const candidateEntities = relatedPopupCandidates(
    editedComponent,
    entityMapSnapshot,
    deviceMapSnapshot
  );
  const knownEntityIdSet = new Set(
    candidateEntities.map(candidateEntityRecord => candidateEntityRecord.entityId)
  );
  for (const relatedEntityId of currentRelatedIdSet) {
    if (!knownEntityIdSet.has(relatedEntityId)) {
      candidateEntities.push({
        entityId: relatedEntityId,
        domain: entityDomainFromId(relatedEntityId),
        name: relatedEntityId,
        status: "missing"
      });
    }
  }
  relatedPopupTitleElement.textContent = relatedContext.deviceLabel + "弹窗功能";
  relatedPopupSummaryElement.textContent = isAutomaticSelection
    ? "自动适配"
    : "已选 " +
      currentRelatedIdSet.size +
      (popupSelectionLimit ? " / " + popupSelectionLimit : "") +
      " 项";
  relatedPopupSummaryElement.classList.toggle("is-automatic", isAutomaticSelection);
  relatedPopupHintElement.textContent = isAutomaticSelection
    ? "当前沿用原来的自动适配，点击可改为手动选择。"
    : "只显示已勾选的关联功能" +
      (popupSelectionLimit ? "，最多 " + popupSelectionLimit + " 项" : "") +
      "。";
  relatedPopupDialogTitleElement.textContent =
    relatedContext.deviceLabel +
    "弹窗功能 · " +
    (isAutomaticSelection
      ? "自动适配"
      : "已选 " +
        currentRelatedIdSet.size +
        (popupSelectionLimit ? " / " + popupSelectionLimit : "") +
        " 项");
  const optionButtons = candidateEntities.map(candidate => {
    const isSelected = currentRelatedIdSet.has(candidate.entityId);
    const isAvailable = relatedEntityIsAvailable(candidate);
    const candidateButton = document.createElement("button");
    candidateButton.type = "button";
    const isDisabledByLimit = isLimitReached && !isSelected;
    candidateButton.className =
      "popup-related-entity-option" +
      (isSelected ? " selected" : "") +
      (isAvailable ? "" : " unavailable") +
      (isDisabledByLimit ? " limit-reached" : "");
    candidateButton.dataset.relatedEntityId = candidate.entityId;
    candidateButton.setAttribute("aria-pressed", String(isSelected));
    candidateButton.disabled = (!isAvailable && !isSelected) || isDisabledByLimit;
    const iconElement = document.createElement("i");
    iconElement.setAttribute("aria-hidden", "true");
    const labelElement = document.createElement("span");
    const entityNameElement = document.createElement("strong");
    const entityLabel = relatedEntityLabel(relatedContext, candidate);
    entityNameElement.textContent = entityDisplayName(candidate, entityLabel);
    const metaElement = document.createElement("small");
    const metaParts = [
      RELATED_ENTITY_DOMAIN_LABELS[entityDomainOf(candidate)] || "实体",
      candidate.entityId
    ];
    if (isAvailable) {
      if (isDisabledByLimit) {
        metaParts.push("最多选择 " + popupSelectionLimit + " 项");
      } else if (relatedEntityNeedsConfirmation(candidate)) {
        metaParts.push("点击时需确认");
      }
    } else {
      metaParts.push("暂时不可用");
    }
    metaElement.textContent = metaParts.join(" · ");
    candidateButton.dataset.relatedEntitySearch = (
      entityNameElement.textContent +
      " " +
      (candidate.name || "") +
      " " +
      (candidate.originalName || "") +
      " " +
      metaElement.textContent
    ).toLocaleLowerCase("zh-CN");
    registerOverflowPreviewRow(candidateButton, entityNameElement);
    labelElement.append(entityNameElement, metaElement);
    candidateButton.append(iconElement, labelElement);
    return candidateButton;
  });
  if (optionButtons.length) {
    const noMatchElement = document.createElement("div");
    noMatchElement.className = "popup-related-entity-empty popup-related-entity-filter-empty";
    noMatchElement.textContent = "没有匹配的关联功能。";
    noMatchElement.hidden = true;
    optionButtons.push(noMatchElement);
  } else {
    const emptyMessageElement = document.createElement("div");
    emptyMessageElement.className = "popup-related-entity-empty";
    emptyMessageElement.textContent = "这个 HA 设备暂时没有可选择的关联实体。";
    optionButtons.push(emptyMessageElement);
  }
  relatedPopupListElement.replaceChildren(...optionButtons);
  filterRelatedEntityOptions();
}

/**
 * 把素材记录解析成可直接用于 img / 背景图的 URL：自带 url 的直用；assetId 以 user: 开头的走
 * /api/v1/assets/user/{32 位 hex}，ID 不是 32 位十六进制就返回空串，避免把任意字符串拼进接口路径；
 * 其余按内置素材处理：去掉 builtin: 前缀后逐段 encodeURIComponent，再附 version 作缓存失效参数。
 */
function resolveAssetPreviewUrl(asset) {
  if (asset?.url) {
    return String(asset.url);
  }
  const assetIdText = String(asset?.assetId || "");
  if (assetIdText.startsWith("user:")) {
    const userAssetId = assetIdText.slice(5);
    if (/^[0-9a-f]{32}$/.test(userAssetId)) {
      return "/api/v1/assets/user/" + userAssetId;
    } else {
      return "";
    }
  }
  const assetRelativePath = String(asset?.relativePath || assetIdText).replace(/^builtin:/, "");
  const encodedAssetPath = assetRelativePath
    .split("/")
    .filter(Boolean)
    .map(pathSegment => encodeURIComponent(pathSegment))
    .join("/");
  if (!encodedAssetPath) {
    return "";
  }
  const assetVersion = String(asset?.version || "");
  return (
    "/assets/builtin/" +
    encodedAssetPath +
    (assetVersion ? "?v=" + encodeURIComponent(assetVersion) : "")
  );
}
/**
 * 解析图标按钮「效果」素材的地址。效果素材可能带一个独立的效果变体（effectVariant.url，指向
 * /api/v1/assets/effect-variant?...）。只有它确实以该接口路径开头时才采用，否则退回普通素材地址 ——
 * 相当于对素材里携带的 URL 做一次白名单校验。
 */
function resolveEffectAssetUrl(effectAsset) {
  const effectVariantUrl = effectAsset?.effectVariant?.url;
  if (
    typeof effectVariantUrl == "string" &&
    effectVariantUrl.startsWith("/api/v1/assets/effect-variant?")
  ) {
    return effectVariantUrl;
  } else {
    return resolveAssetPreviewUrl(effectAsset);
  }
}
const {
  createIconPickerClearOption: createIconPickerClearOption,
  createIconPickerOption: createIconPickerOption,
  createEditorPickerCurrentIcon: createEditorPickerCurrentIcon,
  createEditorEntityPickerOption: createEditorEntityPickerOption,
  editorPickerClearAction: editorPickerClearAction,
  createEditorPickerCurrentEntity: createEditorPickerCurrentEntity,
  createEditorPickerCurrentAsset: createEditorPickerCurrentAsset
} = createEditorPickerElements({
  entityKindLabel: entityKindLabel,
  entityPickerPrimaryName: entityDisplayName,
  entityPickerText: entityOptionLabel,
  enableEntityTextHoverScroll: registerOverflowPreviewRow,
  assetDisplayName: assetDisplayName,
  assetPreviewUrl: resolveEffectAssetUrl,
  bindEditorIconNameTooltip: attachIconTooltip,
  mdiIconUrl: mdiIconUrl
});
const {
  editorEntityMatches: editorEntityMatches,
  editorPickerComponentTypeLabel: editorPickerComponentTypeLabel
} = createEditorPickerQueries({
  entityPickerConfig: entityPickerConfig,
  pickerEntitiesForComponentType: selectableEntities,
  entityPickerText: entityOptionLabel,
  // 注入键写成 entityDomainResolver、且形参名不与助手同名：否则「本文件没 import 它、
  // 它是形参」这件事在调用处看不出来，而模块顶层求值一个名字写错就整个脚本一行都不执行。
  entityDomainResolver: entityDomainOf
});
const editorPickers = createInteraction3dEditorPickers({
  getState: stateEntityId => editorRenderer?.states?.get(stateEntityId),
  openPicker: pickerPayload => openEditorPickerDialog(pickerPayload),
  fetchIcons: (iconQuery, iconLimit, iconOffset) =>
    requestJson(
      "/icons?query=" +
        encodeURIComponent(iconQuery) +
        "&limit=" +
        iconLimit +
        "&offset=" +
        iconOffset
    ),
  getEntities: () => entities,
  ensureEntities: () =>
    areEntitiesLoaded ? Promise.resolve() : entitiesLoadPromise || ensureEntitiesLoaded(),
  entityPickerText: entityOptionLabel,
  elements: {
    createEditorPickerCurrentIcon: createEditorPickerCurrentIcon,
    createIconPickerOption: createIconPickerOption,
    createEditorPickerCurrentEntity: createEditorPickerCurrentEntity,
    createEditorEntityPickerOption: createEditorEntityPickerOption,
    editorPickerClearAction: editorPickerClearAction
  }
});
const editorAssetMatcher = createEditorAssetMatcher({
  getImageFolder: () => imageAssetFolder,
  getIbeFolder: () => effectAssetFolder,
  getUserAssets: () => userAssets
});
const editorAssetToolbar = createEditorAssetToolbar({
  documentObject: document,
  getFolder: folderKey => (folderKey === "image" ? imageAssetFolder : effectAssetFolder),
  setFolder: (nextFolderKey, folderValue) => {
    if (nextFolderKey === "image") {
      imageAssetFolder = folderValue;
    } else {
      effectAssetFolder = folderValue;
    }
  },
  getAssets: () => userAssets,
  getUploadInput: uploadSourceKey =>
    uploadSourceKey === "image"
      ? imageAssetUploadInputElement
      : iconButtonEffectAssetUploadInputElement,
  canDeleteFolder: (deleteSourceKey, folderToDelete) =>
    canDeleteAssetFolder(deleteSourceKey, folderToDelete),
  onDeleteFolder: (removedSourceKey, removedFolderName) =>
    requestDeleteAssetFolder(removedSourceKey, removedFolderName)
});
/**
 * 判断素材记录是否就是目标 ID。
 */
function assetMatchesId(assetRecord, targetAssetId) {
  return assetRecord?.assetId === targetAssetId;
}
/**
 * 取后端返回的全量素材目录（内置 + 用户上传）。变量名叫 userAssets 是历史原因（接口路径是 /assets/user），
 * 但内容确实是全量素材，内置素材的版本戳也在这份数据里。
 */
function allAssets() {
  return userAssets;
}
/**
 * 按素材 ID 在目录中查找素材。
 */
function findAssetById(wantedAssetId) {
  return allAssets().find(assetCandidate => assetMatchesId(assetCandidate, wantedAssetId));
}
/**
 * 取素材的展示名（去掉图片扩展名）。依次回落到 name → relativePath → assetId，保证任何素材都有可显示
 * 的名字；去掉 .png/.jpg/.jpeg/.webp/.gif/.svg 后缀，因为界面上显示「客厅」比「客厅.png」干净。
 */
function assetDisplayName(namedAsset) {
  return String(namedAsset?.name || namedAsset?.relativePath || namedAsset?.assetId || "").replace(
    /\.(?:png|jpe?g|webp|gif|svg)$/i,
    ""
  );
}
/**
 * 列出某个文件夹里由 3D 工作台导出的素材。
 */
function exportedAssetsInFolder(targetFolderName) {
  return userAssets.filter(
    folderAsset =>
      folderAsset.folder === targetFolderName && folderAsset.source === "studio3d-export"
  );
}
/**
 * 判断某个素材文件夹能否被删除。只允许删「用户来源」且夹内全部素材都出自 3D 工作台导出的文件夹：
 * 只要夹着一个手工上传的素材就拒删，避免误删用户自己的图；空文件夹也不给删（长度必须大于 0）。
 */
function canDeleteAssetFolder(folderSource, assetFolderName) {
  if (folderSource !== "user" || !assetFolderName) {
    return false;
  }
  const folderAssets = userAssets.filter(
    folderAssetRecord => folderAssetRecord.folder === assetFolderName
  );
  return (
    folderAssets.length > 0 &&
    folderAssets.every(checkedAsset => checkedAsset.source === "studio3d-export")
  );
}
/**
 * 重建素材文件夹下拉的选项，并把当前文件夹纠正到有效值。文件夹清单由当前素材列表去重得出并按中文排序；
 * 若当前选中的文件夹已不存在（素材被删或移走），回落到排序后的第一项，避免下拉停在空值上。
 * "." 代表根目录，展示为「根目录」。
 */
function syncAssetFolderOptions(assetSourceKind) {
  const isImageKind = assetSourceKind === "image";
  const folderSelectInput = isImageKind
    ? imageAssetFolderSelectElement
    : iconButtonEffectAssetFolderSelectElement;
  const folderNames = [
    ...new Set(userAssets.map(sourceAssetItem => sourceAssetItem.folder).filter(Boolean))
  ].sort((leftFolderName, rightFolderName) =>
    leftFolderName.localeCompare(rightFolderName, "zh-CN")
  );
  const currentFolder = isImageKind ? imageAssetFolder : effectAssetFolder;
  const nextFolder = folderNames.includes(currentFolder) ? currentFolder : folderNames[0] || "";
  if (isImageKind) {
    imageAssetFolder = nextFolder;
  } else {
    effectAssetFolder = nextFolder;
  }
  folderSelectInput.replaceChildren(
    ...folderNames.map(
      folderNameToOption =>
        new Option(folderNameToOption === "." ? "根目录" : folderNameToOption, folderNameToOption)
    )
  );
  folderSelectInput.value = nextFolder;
  syncCustomSelect(folderSelectInput);
}
/**
 * 取素材图片的原始像素尺寸：记录里已有 width/height（导入时后端解析过一次）就同步返回，省掉一次网络加载；
 * 未缓存时才 new Image 异步量一次并写回记录作为缓存，因此返回的 Promise 可能 reject（图片加载失败），
 * 由调用方或上游 handleOperationError 统一提示。decoding = "async" 避免解码阻塞主线程。
 */
function measureAssetImageSize(measuredAsset) {
  if (Number(measuredAsset?.width) > 0 && Number(measuredAsset?.height) > 0) {
    return Promise.resolve({
      width: Number(measuredAsset.width),
      height: Number(measuredAsset.height)
    });
  } else {
    return new Promise((resolveImageSize, rejectImageSize) => {
      const imageElement = new Image();
      imageElement.decoding = "async";
      imageElement.addEventListener(
        "load",
        () => {
          measuredAsset.width = imageElement.naturalWidth;
          measuredAsset.height = imageElement.naturalHeight;
          resolveImageSize({
            width: measuredAsset.width,
            height: measuredAsset.height
          });
        },
        {
          once: true
        }
      );
      imageElement.addEventListener(
        "error",
        () => rejectImageSize(new Error("无法读取图片尺寸：" + (measuredAsset?.name || ""))),
        {
          once: true
        }
      );
      imageElement.src = resolveAssetPreviewUrl(measuredAsset);
    });
  }
}
/**
 * 按图片原始尺寸重算布局，使其以「1:1 像素」比例显示。铺满模式（layoutMode === "fill"）下位置由画布决定，
 * 只重算 properties.freeLayout 里的自由布局快照（切回自由模式时要还原）；自由模式直接把算好的布局写到组件上。
 * 完全没有 freeLayout 快照时不动，因为铺满模式下组件自身的位置是无意义的中间值。
 */
function applyAssetNaturalSize(assetComponent, appliedAssetId, naturalSize) {
  /**
   * 以「保持中心点不动」为原则，把当前布局换算成自然尺寸下的布局与缩放。scale 的换算是
   * 「当前显示宽 × 当前缩放 ÷ 自然宽」，因此放大过的图片套用自然尺寸后视觉大小不变，只是内部数值改成 1:1 基准；
   * 缩放夹到 0.01~5（对应界面的 1%~500%），防止极端值把图片缩成一个点或撑爆画布。
   */
  const buildAssetLayout = (layoutPosition, layoutScale) => {
    const naturalWidth = Number(layoutPosition?.width || naturalSize.width);
    const naturalHeight = Number(layoutPosition?.height || naturalSize.height);
    const scaleFactor = clampNumber(Number(layoutScale || 1), 0.01, 5);
    const centerX = Number(layoutPosition?.x || 0) + naturalWidth / 2;
    const centerY = Number(layoutPosition?.y || 0) + naturalHeight / 2;
    return {
      position: {
        ...(layoutPosition || {}),
        x: centerX - naturalSize.width / 2,
        y: centerY - naturalSize.height / 2,
        width: naturalSize.width,
        height: naturalSize.height
      },
      scale: clampNumber((naturalWidth * scaleFactor) / naturalSize.width, 0.01, 5)
    };
  };
  assetComponent.properties = {
    ...(assetComponent.properties || {})
  };
  if (assetComponent.properties.layoutMode === "fill") {
    const freeLayout = assetComponent.properties.freeLayout;
    if (freeLayout?.position) {
      const filledLayout = buildAssetLayout(freeLayout.position, freeLayout.scale);
      assetComponent.properties.freeLayout = filledLayout;
    }
  } else {
    const computedLayout = buildAssetLayout(assetComponent.position, assetComponent.style?.scale);
    assetComponent.position = computedLayout.position;
    assetComponent.style = {
      ...(assetComponent.style || {}),
      scale: computedLayout.scale
    };
  }
  assetComponent.properties = {
    ...(assetComponent.properties || {}),
    assetId: appliedAssetId,
    fit: "contain",
    naturalWidth: naturalSize.width,
    naturalHeight: naturalSize.height
  };
}
/**
 * 读控件上记录的效果素材原始尺寸。
 */
function readEffectNaturalSize(effectSourceComponent, fallbackSize = null) {
  const effectNaturalWidth = Number(
    effectSourceComponent?.effectNaturalWidth || fallbackSize?.width || 0
  );
  const effectNaturalHeight = Number(
    effectSourceComponent?.effectNaturalHeight || fallbackSize?.height || 0
  );
  if (effectNaturalWidth > 0 && effectNaturalHeight > 0) {
    return {
      width: effectNaturalWidth,
      height: effectNaturalHeight
    };
  } else {
    return null;
  }
}
/**
 * 探测素材原始尺寸，必要时把结果补写回控件。以「控件 ID + 素材 ID」为键登记防重入，同一素材不会被并发测量多次
 * （滚动素材列表会反复触发）。异步回来后必须重新按 ID 找一次控件：等待期间文档可能已被替换或撤销，
 * 只有 assetId 仍是同一个、且尺寸确实不同才写回，避免覆盖用户这期间的修改。
 */
function probeAssetNaturalSize(probedComponent, probedAsset) {
  if (!probedComponent || !probedAsset) {
    return;
  }
  const probeKey = probedComponent.id + ":" + probedAsset.assetId;
  if (!pendingAssetProbeKeys.has(probeKey)) {
    pendingAssetProbeKeys.add(probeKey);
    measureAssetImageSize(probedAsset)
      .then(measuredSize => {
        const liveComponent = findComponent(activeProject?.document, probedComponent.id)?.component;
        if (
          !!liveComponent &&
          liveComponent.properties?.assetId === probedAsset.assetId &&
          ((liveComponent.properties?.layoutMode !== "fill" &&
            (Number(liveComponent.position?.width) !== measuredSize.width ||
              Number(liveComponent.position?.height) !== measuredSize.height)) ||
            Number(liveComponent.properties?.naturalWidth) !== measuredSize.width ||
            Number(liveComponent.properties?.naturalHeight) !== measuredSize.height)
        ) {
          mutateDocument(mutatedDocument => {
            const matchedDocumentComponent = findComponent(
              mutatedDocument,
              probedComponent.id
            )?.component;
            if (
              !!matchedDocumentComponent &&
              matchedDocumentComponent.properties?.assetId === probedAsset.assetId
            ) {
              applyAssetNaturalSize(matchedDocumentComponent, probedAsset.assetId, measuredSize);
            }
          });
        }
      })
      .catch(handleOperationError)
      .finally(() => pendingAssetProbeKeys.delete(probeKey));
  }
}
/**
 * 把图片素材下拉摆到按钮下方（空间不足则翻到上方）。
 * 素材菜单头部更高：优先向下阈值 260、高度上限 470、列表扣 150px 保底 80px。
 */
function positionImageAssetMenu() {
  positionFloatingMenu({
    anchorElement: imageAssetButtonElement,
    menuElement: imageAssetMenuElement,
    optionsElement: imageAssetOptionsElement,
    preferBelowPx: 260,
    maxHeightPx: 470,
    listTrimPx: 150,
    listMinHeightPx: 80
  });
}
/**
 * 把素材大图预览摆在菜单的左侧或右侧。菜单位于屏幕左半边时预览放右边，否则放左边 —— 尽量不遮住正在
 * 浏览的菜单；选项已被卸载（isConnected 为 false）时直接跳过，避免量到 0 尺寸后乱摆。
 */
function positionAssetLargePreview(hoveredOptionElement, assetMenuElement = imageAssetMenuElement) {
  if (imageAssetLargePreviewElement.hidden || !hoveredOptionElement?.isConnected) {
    return;
  }
  const optionRect = hoveredOptionElement.getBoundingClientRect();
  const menuRect = assetMenuElement.getBoundingClientRect();
  const previewRect = imageAssetLargePreviewElement.getBoundingClientRect();
  const previewGapPx = 18;
  const previewLeftPx =
    menuRect.left < window.innerWidth / 2
      ? menuRect.right + previewGapPx
      : menuRect.left - previewRect.width - previewGapPx;
  imageAssetLargePreviewElement.style.left =
    clampNumber(previewLeftPx, 12, Math.max(12, window.innerWidth - previewRect.width - 12)) + "px";
  imageAssetLargePreviewElement.style.top =
    clampNumber(optionRect.top, 12, Math.max(12, window.innerHeight - previewRect.height - 12)) +
    "px";
}
/**
 * 延迟 300ms 后弹出素材大图预览（悬停意图判断，鼠标快速划过不弹，否则预览连续闪烁）。定时器句柄存模块级变量，
 * 新悬停会 clearTimeout 上一次，保证同时最多只有一个待弹预览。回调里重新校验 URL 有效、菜单仍打开、锚点仍在文档中，
 * 因为 300ms 内用户可能已关掉菜单或滚动换掉了那一项；图片 onload 时与下一帧各定位一次，onload 后才能拿到真实尺寸。
 */
function scheduleAssetPreview(
  previewAsset,
  previewAnchorElement,
  previewMenuElement = imageAssetMenuElement
) {
  if (!!previewAsset && !!previewAnchorElement) {
    clearTimeout(assetPreviewTimeoutId);
    assetPreviewTimeoutId = window.setTimeout(() => {
      const previewUrl = resolveEffectAssetUrl(previewAsset);
      if (!!previewUrl && !previewMenuElement.hidden && !!previewAnchorElement.isConnected) {
        imageAssetLargePreviewImageElement.onload = () =>
          positionAssetLargePreview(previewAnchorElement, previewMenuElement);
        imageAssetLargePreviewImageElement.src = previewUrl;
        imageAssetLargePreviewNameElement.textContent =
          previewAsset.name || previewAsset.relativePath;
        imageAssetLargePreviewElement.hidden = false;
        window.requestAnimationFrame(() =>
          positionAssetLargePreview(previewAnchorElement, previewMenuElement)
        );
      }
    }, 300);
  }
}
/**
 * 立即隐藏素材大图预览并清掉待弹定时器。必须同时解绑 img.onload：否则某张图片在预览关闭后才加载完，
 * 会触发一个「给旧锚点定位」的回调，把已经隐藏的预览重新摆到过期位置。
 */
function hideAssetLargePreview() {
  clearTimeout(assetPreviewTimeoutId);
  assetPreviewTimeoutId = null;
  imageAssetLargePreviewElement.hidden = true;
  imageAssetLargePreviewImageElement.onload = null;
}
/**
 * 构造素材下拉里的一个选项（缩略图 + 名称，用户素材额外带删除按钮）。只有 source === "user" 的素材可删；
 * 内置素材与 3D 工作台导出的素材直接返回按钮本身（导出素材会被重新生成，删掉反而让自动图示失效）。
 * 缩略图 loading="lazy" 避免一次渲染上百张图；加载失败时加 image-load-error 类由 CSS 显示占位，而不是留破图。
 */
function createAssetOptionButton(optionAsset, selectedAssetId) {
  const assetOptionButton = document.createElement("button");
  assetOptionButton.type = "button";
  assetOptionButton.className =
    "inspector-asset-option" + (assetMatchesId(optionAsset, selectedAssetId) ? " selected" : "");
  assetOptionButton.dataset.assetId = optionAsset.assetId;
  assetOptionButton.title = optionAsset.name;
  assetOptionButton.setAttribute("role", "option");
  assetOptionButton.setAttribute(
    "aria-selected",
    String(assetMatchesId(optionAsset, selectedAssetId))
  );
  const previewImageElement = document.createElement("img");
  previewImageElement.src = resolveEffectAssetUrl(optionAsset);
  previewImageElement.alt = optionAsset.name;
  previewImageElement.loading = "lazy";
  previewImageElement.addEventListener("error", () =>
    assetOptionButton.classList.add("image-load-error")
  );
  const assetNameElement = document.createElement("span");
  assetNameElement.textContent = assetDisplayName(optionAsset);
  assetOptionButton.append(previewImageElement, assetNameElement);
  if (optionAsset.source === "studio3d-export" || optionAsset.source !== "user") {
    return assetOptionButton;
  }
  const deleteWrapElement = document.createElement("div");
  deleteWrapElement.className = "user-asset-option-wrap";
  const deleteButtonElement = document.createElement("button");
  deleteButtonElement.type = "button";
  deleteButtonElement.className = "user-asset-delete";
  deleteButtonElement.dataset.deleteUserAsset = optionAsset.assetId;
  deleteButtonElement.title = "删除 " + optionAsset.name;
  deleteButtonElement.setAttribute("aria-label", "删除 " + optionAsset.name);
  deleteButtonElement.textContent = "×";
  deleteWrapElement.append(assetOptionButton, deleteButtonElement);
  return deleteWrapElement;
}
/**
 * 渲染图片素材下拉（清空项 + 当前文件夹或搜索命中的素材）。有搜索词时忽略文件夹过滤，可以跨文件夹找图；
 * 没有搜索词才按当前文件夹过滤，保持列表短一点。首项固定「不使用图片」用于解绑。
 */
function renderImageAssetOptions(assetSearchQuery = "") {
  hideAssetLargePreview();
  const boundAssetId = selectedComponent()?.properties?.assetId || "";
  const normalizedAssetQuery = assetSearchQuery.trim().toLocaleLowerCase("zh-CN");
  const filteredAssets = userAssets.filter(matchingAsset => {
    const matchesQuery =
      !normalizedAssetQuery ||
      (matchingAsset.name + " " + matchingAsset.relativePath)
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedAssetQuery);
    const matchesFolder = !!normalizedAssetQuery || matchingAsset.folder === imageAssetFolder;
    return matchesQuery && matchesFolder;
  });
  const clearAssetButton = document.createElement("button");
  clearAssetButton.type = "button";
  clearAssetButton.className = "inspector-asset-clear" + (boundAssetId ? "" : " selected");
  clearAssetButton.dataset.assetId = "";
  clearAssetButton.setAttribute("role", "option");
  clearAssetButton.setAttribute("aria-selected", String(!boundAssetId));
  clearAssetButton.textContent = "不使用图片";
  if (!filteredAssets.length) {
    const assetNoMatchElement = document.createElement("div");
    assetNoMatchElement.className = "inspector-picker-empty";
    assetNoMatchElement.textContent = "没有匹配的图片";
    imageAssetOptionsElement.replaceChildren(clearAssetButton, assetNoMatchElement);
    return;
  }
  imageAssetOptionsElement.replaceChildren(
    clearAssetButton,
    ...filteredAssets.map(assetForOption => createAssetOptionButton(assetForOption, boundAssetId))
  );
}
/**
 * 把图片组件的当前素材同步到素材下拉（按钮文案、文件夹下拉、搜索框与选项列表）。组件引用的素材可能
 * 已被删：matchedAsset 为空时按钮回落到显示原始 assetId，让用户知道当前绑定的是个失效 ID 而不是「没选图片」；
 * 文件夹沿用原选择，避免每次同步都把用户切到的文件夹重置掉。最后 probeAssetNaturalSize 会在后台补测图片尺寸。
 */
function syncImageAssetSelection(imageComponent) {
  const currentAssetId = imageComponent.properties?.assetId || "";
  const matchedAsset = findAssetById(currentAssetId);
  imageAssetFolder = matchedAsset?.folder || "" || imageAssetFolder;
  syncAssetFolderOptions("image");
  imageAssetButtonElement.textContent = matchedAsset?.name || currentAssetId || "不使用图片";
  imageAssetSearchInputElement.value = "";
  imageAssetOptionsElement.replaceChildren();
  probeAssetNaturalSize(imageComponent, matchedAsset);
}
/**
 * 把效果素材下拉摆到按钮下方（空间不足则翻到上方）。
 *
 * 阈值与 positionImageAssetMenu 相同（阈值 260 / 上限 470 / 列表扣 150px 保底 80px）。
 */
function positionEffectAssetMenu() {
  positionFloatingMenu({
    anchorElement: iconButtonEffectAssetButtonElement,
    menuElement: iconButtonEffectAssetMenuElement,
    optionsElement: iconButtonEffectAssetOptionsElement,
    preferBelowPx: 260,
    maxHeightPx: 470,
    listTrimPx: 150,
    listMinHeightPx: 80
  });
}
/**
 * 渲染「图标按钮效果」的素材下拉（清空项 + 当前文件夹或搜索命中的素材）。
 *
 * 过滤规则与图片素材下拉一致：有搜索词时跨文件夹搜索，无搜索词时限定当前文件夹。
 */
function renderEffectAssetOptions(effectAssetSearchQuery = "") {
  hideAssetLargePreview();
  const boundEffectAssetId = selectedComponent()?.properties?.effectAssetId || "";
  const normalizedEffectQuery = effectAssetSearchQuery.trim().toLocaleLowerCase("zh-CN");
  const filteredEffectAssets = userAssets.filter(
    effectMatchingAsset =>
      (!normalizedEffectQuery ||
        (effectMatchingAsset.name + " " + effectMatchingAsset.relativePath)
          .toLocaleLowerCase("zh-CN")
          .includes(normalizedEffectQuery)) &&
      (!!normalizedEffectQuery || effectMatchingAsset.folder === effectAssetFolder)
  );
  const effectClearAssetButton = document.createElement("button");
  effectClearAssetButton.type = "button";
  effectClearAssetButton.className =
    "inspector-asset-clear" + (boundEffectAssetId ? "" : " selected");
  effectClearAssetButton.dataset.assetId = "";
  effectClearAssetButton.setAttribute("role", "option");
  effectClearAssetButton.setAttribute("aria-selected", String(!boundEffectAssetId));
  effectClearAssetButton.textContent = "不使用图片";
  const effectAssetOptionButtons = filteredEffectAssets.map(effectOptionAsset =>
    createAssetOptionButton(effectOptionAsset, boundEffectAssetId)
  );
  const effectNoMatchElement = document.createElement("div");
  effectNoMatchElement.className = "inspector-picker-empty";
  if (!effectAssetOptionButtons.length) {
    effectNoMatchElement.textContent = "没有匹配的图片";
  }
  iconButtonEffectAssetOptionsElement.replaceChildren(
    effectClearAssetButton,
    ...effectAssetOptionButtons,
    ...(effectNoMatchElement.textContent ? [effectNoMatchElement] : [])
  );
}
/**
 * 把效果组件当前使用的素材同步到效果素材下拉。逻辑与 syncImageAssetSelection 平行：把素材所在文件夹
 * 同步到文件夹下拉，按钮文案回落到原始 assetId（素材可能已被删），并清空搜索框与选项列表，
 * 让下拉下次打开时按新的文件夹重新渲染。
 */
function syncEffectAssetSelection(effectOwnerComponent) {
  const currentEffectAssetId = effectOwnerComponent.properties?.effectAssetId || "";
  const matchedEffectAsset = findAssetById(currentEffectAssetId);
  effectAssetFolder = matchedEffectAsset?.folder || effectAssetFolder;
  syncAssetFolderOptions("ibe");
  iconButtonEffectAssetButtonElement.textContent =
    matchedEffectAsset?.name || currentEffectAssetId || "不使用图片";
  iconButtonEffectAssetSearchInputElement.value = "";
  iconButtonEffectAssetOptionsElement.replaceChildren();
}
/**
 * 给动作区块内的表单控件补上唯一 id 供 <label for> 关联。id 由「表单 id + 动作触发键 + 字段后缀」拼成，
 * 因此同一表单里 tap / doubleTap / hold 三块的同名控件不会撞 id。只补没有 id 且没有 name 的控件
 * （已有 id/name 说明已被别处命名，覆盖会打断关联）；触发键里的非法字符先替换成短横线。
 */
function assignActionControlIds(controlElement) {
  const formId = controlElement.closest(".inspector-form[id]")?.id || "component-action";
  const triggerKey = String(controlElement.dataset.actionTrigger || "action").replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  );
  const idSelectorPairs = [
    ["[data-action-target]", "target"],
    ["[data-popup-source]", "popup-source"],
    ["[data-popup-entity-search]", "popup-entity-search"],
    ["[data-popup-entity]", "popup-entity"],
    ["[data-popup-custom]", "popup-custom"]
  ];
  for (const [selectorKey, idSuffix] of idSelectorPairs) {
    const targetControlElement = controlElement.querySelector(selectorKey);
    if (targetControlElement && !targetControlElement.id && !targetControlElement.name) {
      targetControlElement.id = formId + "-" + triggerKey + "-" + idSuffix;
    }
  }
}
/**
 * 为所有动作区块补齐「弹窗来源」配置界面（仅初始化一次）。DOM 用 innerHTML 一次生成后再
 * assignActionControlIds 补 name/id 关联；已存在 .component-popup-config 的区块跳过，保证每次
 * syncComponentActionControls 调用都不出重复界面。「打开弹窗」文案也在这里统一改写。
 */
function initActionPopupConfig() {
  for (const moreInfoElement of document.querySelectorAll('[data-action-type="more-info"]')) {
    moreInfoElement.textContent = "打开弹窗";
  }
  for (const actionControlElement of document.querySelectorAll(
    ".component-action-control[data-action-trigger]"
  )) {
    assignActionControlIds(actionControlElement);
    if (actionControlElement.querySelector(".component-popup-config")) {
      continue;
    }
    const popupSettingsElement = document.createElement("div");
    popupSettingsElement.className = "component-popup-config";
    popupSettingsElement.hidden = true;
    popupSettingsElement.innerHTML =
      '\n      <label class="component-popup-config-row"><span>弹窗来源</span><select data-popup-source><option value="current">当前实体</option><option value="entity">其它实体</option><option value="custom">组合弹窗</option></select></label>\n      <div class="component-popup-config-row" data-popup-entity-row><span>选择实体</span><div class="component-popup-entity-picker"><button class="inspector-picker-button" type="button" data-popup-entity-button aria-haspopup="listbox" aria-expanded="false">选择实体</button><div class="inspector-picker-menu component-popup-entity-menu" data-popup-entity-menu hidden><input type="search" data-popup-entity-search placeholder="搜索实体名称或 ID" autocomplete="off"><div class="inspector-entity-options" data-popup-entity-options role="listbox"></div></div><input type="hidden" data-popup-entity></div></div>\n      <label class="component-popup-config-row" data-popup-custom-row><span>选择弹窗</span><select data-popup-custom></select></label>\n      <button class="component-popup-preview" type="button" data-popup-preview>预览弹窗</button>';
    actionControlElement.append(popupSettingsElement);
    assignActionControlIds(actionControlElement);
    const popupEntityButtonElement = popupSettingsElement.querySelector(
      "[data-popup-entity-button]"
    );
    const popupEntityInputElement = popupSettingsElement.querySelector("[data-popup-entity]");
    enhanceEntityCopyButton(popupEntityButtonElement, () => popupEntityInputElement?.value || "");
  }
}
/**
 * 收起所有弹窗实体下拉，可选择保留当前正在操作的那一个。遍历文档而不是只关模块级变量持有的那一个：
 * 动作区块是动态生成的，数量不定，必须按 data 属性全量扫描；保留项用「最近的 [data-action-trigger]」比较，
 * 因为一个区块内可能有多个下拉，按元素本身比较会误关同区块的其它下拉。
 */
function closePopupEntityMenus(activeTriggerElement = null) {
  for (const popupMenuElement of document.querySelectorAll("[data-popup-entity-menu]")) {
    const triggerElement = popupMenuElement.closest("[data-action-trigger]");
    if (triggerElement !== activeTriggerElement) {
      popupMenuElement.hidden = true;
      triggerElement
        ?.querySelector("[data-popup-entity-button]")
        ?.setAttribute("aria-expanded", "false");
    }
  }
}
/**
 * 刷新某个动作区块的实体选择按钮文案与状态。从隐藏输入框读出当前 entityId 再反查实体；找不到实体
 * （如 HA 里已删除）时回落到显示原始 ID，让用户能看出绑定失效而不是空按钮。
 */
function syncPopupEntityButton(configElement) {
  const popupEntityId = configElement?.querySelector("[data-popup-entity]")?.value || "";
  const popupEntity = entities.find(
    popupCandidateEntity => popupCandidateEntity.entityId === popupEntityId
  );
  const popupPickerButtonElement = configElement?.querySelector("[data-popup-entity-button]");
  if (!popupPickerButtonElement) {
    return;
  }
  const buttonLabel = popupEntity
    ? "[" + entityKindLabel(popupEntity) + "] " + entityDisplayName(popupEntity)
    : popupEntityId || "选择实体";
  setPickerButtonLabel(popupPickerButtonElement, buttonLabel, popupEntityId || buttonLabel);
  popupPickerButtonElement.dataset.entityId = popupEntityId;
  popupPickerButtonElement._entityCopySync?.();
}
/**
 * 渲染弹窗动作的实体候选（按搜索词过滤，当前绑定项标选中）。与其它实体列表不同，这里包含虚拟实体
 * ——弹窗动作可以绑到虚拟实体上（状态由图标可见性驱动），所以不做 virtual 过滤。
 * 名称行登记为「溢出可滚动预览」目标，长实体名悬停时能横向滚动看全；无匹配时补一条空态提示。
 */
function renderPopupEntityOptions(popupConfigElement, popupSearchQuery = "") {
  const optionsElement = popupConfigElement?.querySelector("[data-popup-entity-options]");
  const popupSelectedEntityId =
    popupConfigElement?.querySelector("[data-popup-entity]")?.value || "";
  if (!optionsElement) {
    return;
  }
  const normalizedPopupQuery = String(popupSearchQuery || "")
    .trim()
    .toLocaleLowerCase("zh-CN");
  const filteredEntities = entities.filter(
    listedPopupEntity =>
      !normalizedPopupQuery ||
      (entityOptionLabel(listedPopupEntity) + " " + listedPopupEntity.entityId)
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedPopupQuery)
  );
  optionsElement.replaceChildren(
    ...filteredEntities.map(optionEntity => {
      const popupOptionButton = document.createElement("button");
      popupOptionButton.type = "button";
      popupOptionButton.className =
        "inspector-entity-option" +
        (optionEntity.entityId === popupSelectedEntityId ? " selected" : "");
      popupOptionButton.dataset.popupActionEntityId = optionEntity.entityId;
      popupOptionButton.setAttribute("role", "option");
      popupOptionButton.setAttribute(
        "aria-selected",
        String(optionEntity.entityId === popupSelectedEntityId)
      );
      const popupOptionContentElement = document.createElement("span");
      popupOptionContentElement.className = "inspector-entity-option-content";
      const popupNameLineElement = document.createElement("span");
      popupNameLineElement.className = "inspector-entity-option-line inspector-entity-name-line";
      popupNameLineElement.textContent =
        "[" + entityKindLabel(optionEntity) + "] " + entityDisplayName(optionEntity);
      const popupIdElement = document.createElement("span");
      popupIdElement.className = "inspector-entity-option-line inspector-entity-id";
      popupIdElement.textContent = optionEntity.entityId;
      popupOptionContentElement.append(popupNameLineElement, popupIdElement);
      registerOverflowPreviewRow(popupOptionButton, popupNameLineElement);
      popupOptionButton.append(popupOptionContentElement);
      return popupOptionButton;
    })
  );
  if (!filteredEntities.length) {
    const popupNoMatchElement = document.createElement("div");
    popupNoMatchElement.className = "inspector-picker-empty";
    popupNoMatchElement.textContent = "没有匹配的实体";
    optionsElement.append(popupNoMatchElement);
  }
}
/**
 * 把弹窗实体下拉摆到按钮下方（下方放不下则翻到上方）。宽度取 min(按钮宽, 视口宽 - 16)、
 * 高度上限 min(340, 视口高 - 16)；列表扣 58px 保底 120px，翻转用实际内容高。
 */
function positionPopupEntityMenu(triggerConfigElement) {
  const popupEntityButton = triggerConfigElement?.querySelector("[data-popup-entity-button]");
  const entityMenuElement = triggerConfigElement?.querySelector("[data-popup-entity-menu]");
  if (!popupEntityButton || !entityMenuElement) {
    return;
  }
  positionFloatingMenu({
    anchorElement: popupEntityButton,
    menuElement: entityMenuElement,
    optionsElement: entityMenuElement.querySelector("[data-popup-entity-options]"),
    widthMode: "clamped",
    heightMode: "content",
    contentHeightCapPx: 340,
    listTrimPx: 58,
    listMinHeightPx: 120
  });
}
/**
 * 把组件的动作配置同步到 tap / doubleTap / hold 三块动作控件区（先幂等 initActionPopupConfig 补齐弹窗
 * 配置）。动作合法性经 componentActionIsSupported 校验（目标页面/弹窗可能已被删），不合法就降级成 "none"；
 * 类型按钮按绑定实体与组件类型裁剪；跳转页与 popupId 均回落有效值；实体下拉正开着时重渲选项并在下一帧重新定位。
 */
function syncComponentActionControls(editedActionComponent, actionControlsRoot) {
  initActionPopupConfig();
  const boundActionEntityId = editedActionComponent.bindings?.entity?.entityId || "";
  const isLightStatistics = editedActionComponent.type === "light-statistics";
  if (isLightStatistics) {
    lightStatisticsActionNoteElement.textContent = boundActionEntityId
      ? "切换和“当前实体”弹窗作用于绑定实体；其它实体弹窗、组合弹窗和跳转页面无需绑定动作实体。"
      : "未绑定动作实体时仍可使用其它实体弹窗、组合弹窗和跳转页面。";
    actionControlsRoot.setAttribute("aria-disabled", "false");
  }
  const pages = activeProject.document.pages || [];
  const pagePathSet = new Set(pages.map(page => page.path));
  const popupIdSet = new Set(
    (activeProject.document.customPopups || []).map(popupRecord => popupRecord.id)
  );
  const hiddenContentControlElement = actionControlsRoot.querySelector(
    "[data-hidden-content-clickable-control]"
  );
  if (hiddenContentControlElement) {
    const supportsHiddenContent = ["title-button", "device-button", "icon-button-effect"].includes(
      editedActionComponent.type
    );
    hiddenContentControlElement.hidden = !supportsHiddenContent;
    for (const hiddenContentToggleElement of hiddenContentControlElement.querySelectorAll(
      "[data-hidden-content-clickable]"
    )) {
      const isHiddenContentActive =
        hiddenContentToggleElement.dataset.hiddenContentClickable ===
        (editedActionComponent.properties?.hiddenContentClickable === true ? "on" : "off");
      hiddenContentToggleElement.classList.toggle("active", isHiddenContentActive);
      hiddenContentToggleElement.setAttribute("aria-pressed", String(isHiddenContentActive));
    }
  }
  for (const actionTriggerElement of actionControlsRoot.querySelectorAll("[data-action-trigger]")) {
    const actionKey = actionTriggerElement.dataset.actionTrigger;
    const actionConfig = editedActionComponent.actions?.[actionKey];
    const activeActionType = componentActionIsSupported(editedActionComponent, actionConfig, {
      pagePaths: pagePathSet,
      popupIds: popupIdSet
    })
      ? actionConfig.type
      : "none";
    for (const actionTypeElement of actionTriggerElement.querySelectorAll("[data-action-type]")) {
      const isActionTypeActive = actionTypeElement.dataset.actionType === activeActionType;
      actionTypeElement.classList.toggle("active", isActionTypeActive);
      actionTypeElement.setAttribute("aria-pressed", String(isActionTypeActive));
      actionTypeElement.disabled =
        (actionTypeElement.dataset.actionType === "toggle" &&
          (!boundActionEntityId || !entityIdSupportsToggle(boundActionEntityId))) ||
        (isLightStatistics &&
          !["none", "toggle", "more-info", "navigate"].includes(
            actionTypeElement.dataset.actionType
          ));
    }
    const actionTargetRowElement = actionTriggerElement.querySelector(".component-action-target");
    const actionTargetSelectElement = actionTriggerElement.querySelector("[data-action-target]");
    const storedTargetPath = editedActionComponent.actions?.[actionKey]?.target;
    actionTargetSelectElement.replaceChildren(
      ...pages.map(pageOption => new Option(pageOption.name, pageOption.path))
    );
    actionTargetSelectElement.value = pagePathSet.has(storedTargetPath)
      ? storedTargetPath
      : pageSelectElement.value || pages[0]?.path || "";
    syncCustomSelect(actionTargetSelectElement);
    actionTargetRowElement.hidden = activeActionType !== "navigate";
    const popupConfigSectionElement = actionTriggerElement.querySelector(".component-popup-config");
    const popupSourceSelectElement = actionTriggerElement.querySelector("[data-popup-source]");
    const popupEntityHiddenInputElement = actionTriggerElement.querySelector("[data-popup-entity]");
    const popupCustomSelectElement = actionTriggerElement.querySelector("[data-popup-custom]");
    const popupEntityRowElement = actionTriggerElement.querySelector("[data-popup-entity-row]");
    const popupCustomRowElement = actionTriggerElement.querySelector("[data-popup-custom-row]");
    const popupPreviewButtonElement = actionTriggerElement.querySelector("[data-popup-preview]");
    const popupData = actionPopupData(editedActionComponent.actions?.[actionKey]);
    popupSourceSelectElement.value = popupData.source;
    const currentSourceOptionElement =
      popupSourceSelectElement.querySelector('option[value="current"]');
    if (currentSourceOptionElement) {
      currentSourceOptionElement.disabled = !boundActionEntityId;
    }
    popupEntityHiddenInputElement.value = popupData.entityId || entities[0]?.entityId || "";
    const customPopups = activeProject.document.customPopups || [];
    popupCustomSelectElement.replaceChildren(
      ...customPopups.map(popupOption => new Option(popupOption.name, popupOption.id))
    );
    popupCustomSelectElement.value = customPopups.some(
      popupCandidate => popupCandidate.id === popupData.popupId
    )
      ? popupData.popupId
      : customPopups[0]?.id || "";
    syncCustomSelect(popupSourceSelectElement);
    syncCustomSelect(popupCustomSelectElement);
    syncPopupEntityButton(actionTriggerElement);
    const popupEntityMenuElement = actionTriggerElement.querySelector("[data-popup-entity-menu]");
    if (popupEntityMenuElement && !popupEntityMenuElement.hidden) {
      renderPopupEntityOptions(
        actionTriggerElement,
        actionTriggerElement.querySelector("[data-popup-entity-search]")?.value || ""
      );
      window.requestAnimationFrame(() => positionPopupEntityMenu(actionTriggerElement));
    }
    popupConfigSectionElement.hidden = activeActionType !== "more-info";
    popupEntityRowElement.hidden = popupData.source !== "entity";
    popupCustomRowElement.hidden = popupData.source !== "custom";
    popupPreviewButtonElement.disabled =
      popupData.source === "current"
        ? !boundActionEntityId
        : popupData.source === "entity"
          ? !popupEntityHiddenInputElement.value
          : !popupCustomSelectElement.value;
  }
}
/**
 * 按属性重算时间组件的目标宽高（文字尺寸变化后自动贴合内容）。委托 fitInspectorComponentToDimensions
 * 完成，实际行为是保持中心点不动、只改宽高与左上角坐标，视觉上等价于以中心缩放；
 * 默认参数用组件自带的 properties，方便调用方直接传组件。
 */
function fitTimeComponentToDimensions(
  timeFitComponent,
  timeFitProperties = timeFitComponent?.properties || {}
) {
  fitInspectorComponentToDimensions(timeFitComponent, timeFitProperties, timeComponentDimensions);
}
// 时间 / 日期 / 天气三个面板的回填描述表（其余组件仍手写，逐个换成表即可）。
// 每行 = 一个控件 ← 一个来源，取值形状见 editor-basic-inspectors.js 的 applyInspectorFields：
//   { constant }                  固定文案（组件类型标题）
//   { metric: "left" }            度量值（位置百分比 / 缩放 / 旋转）
//   { property, fallback }        文本或颜色：空值与缺字段都回落
//   { property, fallback, clamp/multiply/transform }  数值：默认值、夹取、倍率、归一
const TIME_INSPECTOR_FIELDS = [
  { element: timeTypeTextInputElement, constant: "时间" },
  { element: timeLabelTextInputElement, property: "label", fallback: "" },
  { element: timeColorInputElement, property: "color", fallback: "#248eb2" },
  { element: timeFontSizeInputElement, property: "fontSize", fallback: 96, clamp: [12, 500] },
  { element: timeFontWeightInputElement, property: "fontWeight", transform: normalizedFontWeight },
  { element: timeLetterSpacingInputElement, property: "letterSpacing", fallback: 2.2, clamp: [-20, 100] },
  // opacity 存 0~1，面板按百分比显示。
  { element: timeOpacityInputElement, property: "opacity", fallback: 1, multiply: 100, clamp: [0, 100] },
  { element: timeLeftInputElement, metric: "left" },
  { element: timeTopInputElement, metric: "top" },
  { element: timeScaleInputElement, metric: "scale" },
  { element: timeRotationInputElement, metric: "rotation" }
];
const TIME_INSPECTOR_TOGGLES = [
  {
    container: timeHourFormatElement,
    dataset: "timeHourFormat",
    attribute: "time-hour-format",
    // 时分制只在显式 true 时算 12 小时制，老文档缺字段走 24 小时制。
    active: timeProperties => (timeProperties.hour12 === true ? "12" : "24")
  },
  {
    container: timeSecondsElement,
    dataset: "timeSeconds",
    attribute: "time-seconds",
    active: timeProperties => (timeProperties.showSeconds === true ? "on" : "off")
  }
];
const DATE_INSPECTOR_FIELDS = [
  { element: dateTypeTextInputElement, constant: "日期" },
  { element: dateLabelTextInputElement, property: "label", fallback: "" },
  { element: datePrimaryColorInputElement, property: "primaryColor", fallback: "#8d9296" },
  { element: datePrimarySizeInputElement, property: "primarySize", fallback: 36, clamp: [12, 500] },
  { element: datePrimaryWeightInputElement, property: "primaryWeight", transform: normalizedFontWeight },
  { element: datePrimarySpacingInputElement, property: "primarySpacing", fallback: 1, clamp: [-20, 100] },
  { element: dateLunarColorInputElement, property: "lunarColor", fallback: "#7f878c" },
  // 农历字号下限比主文案低 2：副行字号本来就小。
  { element: dateLunarSizeInputElement, property: "lunarSize", fallback: 24, clamp: [10, 500] },
  { element: dateLunarWeightInputElement, property: "lunarWeight", transform: normalizedFontWeight },
  { element: dateLunarSpacingInputElement, property: "lunarSpacing", fallback: 1, clamp: [-20, 100] },
  { element: dateLineGapInputElement, property: "lineGap", fallback: 8, clamp: [0, 200] },
  { element: dateOpacityInputElement, property: "opacity", fallback: 1, multiply: 100, clamp: [0, 100] },
  { element: dateLeftInputElement, metric: "left" },
  { element: dateTopInputElement, metric: "top" },
  { element: dateScaleInputElement, metric: "scale" },
  { element: dateRotationInputElement, metric: "rotation" }
];
const DATE_INSPECTOR_TOGGLES = [
  {
    container: dateWeekdayElement,
    dataset: "dateWeekday",
    attribute: "date-weekday",
    // 「显示星期」默认开（只在显式 false 时算关），「显示农历」默认关（只在显式 true 时算开）：
    // 用严格比较而非取反，避免 undefined 被误判成另一档。
    active: dateProperties => (dateProperties.showWeekday === false ? "off" : "on")
  },
  {
    container: dateLunarElement,
    dataset: "dateLunar",
    attribute: "date-lunar",
    active: dateProperties => (dateProperties.showLunar === true ? "on" : "off")
  }
];
const WEATHER_INSPECTOR_FIELDS = [
  { element: weatherTypeTextInputElement, constant: "天气" },
  { element: weatherLabelTextInputElement, property: "label", fallback: "" },
  { element: weatherIconSizeInputElement, property: "iconSize", fallback: 64, clamp: [12, 500] },
  { element: weatherIconGapInputElement, property: "iconGap", fallback: 22, clamp: [0, 300] },
  { element: weatherTemperatureColorInputElement, property: "temperatureColor", fallback: "#aeb3b7" },
  { element: weatherTemperatureSizeInputElement, property: "temperatureSize", fallback: 32, clamp: [12, 500] },
  { element: weatherTemperatureWeightInputElement, property: "temperatureWeight", transform: normalizedFontWeight },
  { element: weatherTemperatureSpacingInputElement, property: "temperatureSpacing", fallback: 1, clamp: [-20, 100] },
  { element: weatherSecondaryColorInputElement, property: "secondaryColor", fallback: "#8d9296" },
  { element: weatherSecondarySizeInputElement, property: "secondarySize", fallback: 18, clamp: [10, 500] },
  { element: weatherSecondaryWeightInputElement, property: "secondaryWeight", transform: normalizedFontWeight },
  { element: weatherSecondarySpacingInputElement, property: "secondarySpacing", fallback: 1, clamp: [-20, 100] },
  { element: weatherLineGapInputElement, property: "lineGap", fallback: 7, clamp: [0, 200] },
  { element: weatherOpacityInputElement, property: "opacity", fallback: 1, multiply: 100, clamp: [0, 100] },
  { element: weatherLeftInputElement, metric: "left" },
  { element: weatherTopInputElement, metric: "top" },
  { element: weatherScaleInputElement, metric: "scale" },
  { element: weatherRotationInputElement, metric: "rotation" }
];
const WEATHER_VISIBILITY_TOGGLES = [
  // dataset 键 = 按钮的 data-weather-*-visible，判读的却是 properties 里的短名（iconVisible 等）：
  // 两者不同名，所以 dataset 与 active 都要写全。
  { container: weatherIconVisibleElement, dataset: "weatherIconVisible", active: weatherProperties => (weatherProperties.iconVisible !== false), ariaPressed: true },
  { container: weatherTemperatureVisibleElement, dataset: "weatherTemperatureVisible", active: weatherProperties => (weatherProperties.temperatureVisible !== false), ariaPressed: true },
  { container: weatherConditionVisibleElement, dataset: "weatherConditionVisible", active: weatherProperties => (weatherProperties.conditionVisible !== false), ariaPressed: true },
  { container: weatherHumidityVisibleElement, dataset: "weatherHumidityVisible", active: weatherProperties => (weatherProperties.humidityVisible !== false), ariaPressed: true }
];
/**
 * 把时间组件的当前值回填到检查器。12/24 小时制与「显示秒」用 active class 表示选中（未写 aria-pressed，
 * 与天气/日期的分段控件写法保持历史一致）。字号、字距、透明度都做边界夹取：12~500、-20~100（允许负值做紧凑排版）、
 * 0~100；最后强制解除缩放与旋转的禁用态，避免沿用上一个组件类型的禁用状态。
 */
function syncTimeInspector(timeComponent) {
  const timeProperties = timeComponent.properties || {};
  applyInspectorFields(TIME_INSPECTOR_FIELDS, {
    properties: timeProperties,
    metrics: inspectorComponentMetrics(timeComponent, activeProject.document)
  });
  applyInspectorToggles(TIME_INSPECTOR_TOGGLES, timeProperties);
  timeScaleInputElement.disabled = false;
  timeRotationInputElement.disabled = false;
}
/**
 * 按属性重算日期组件的目标宽高（文字尺寸/行距变化后自动贴合内容）。
 *
 * 与时间组件同源，委托 fitInspectorComponentToDimensions 保持中心点不变地缩放外框。
 */
function fitDateComponentToDimensions(
  dateFitComponent,
  dateFitProperties = dateFitComponent?.properties || {}
) {
  fitInspectorComponentToDimensions(dateFitComponent, dateFitProperties, dateComponentDimensions);
}
/**
 * 把日期组件的当前值回填到检查器。主副文案各有字号、字重、字距、行距与颜色，见上面的描述表。
 */
function syncDateInspector(dateComponent) {
  const dateProperties = dateComponent.properties || {};
  applyInspectorFields(DATE_INSPECTOR_FIELDS, {
    properties: dateProperties,
    metrics: inspectorComponentMetrics(dateComponent, activeProject.document)
  });
  applyInspectorToggles(DATE_INSPECTOR_TOGGLES, dateProperties);
  dateScaleInputElement.disabled = false;
  dateRotationInputElement.disabled = false;
}
/**
 * 按属性重算天气组件的目标宽高（图标/文字尺寸变化后自动贴合内容）。
 *
 * 与时间、日期组件同源，委托 fitInspectorComponentToDimensions 以中心为基准缩放。
 */
function fitWeatherComponentToDimensions(
  weatherFitComponent,
  weatherFitProperties = weatherFitComponent?.properties || {}
) {
  fitInspectorComponentToDimensions(
    weatherFitComponent,
    weatherFitProperties,
    weatherComponentDimensions
  );
}
/**
 * 把天气组件的当前值回填到检查器。四个显示开关（图标 / 温度 / 描述 / 湿度）在描述表里，
 * data 属性名由 dataset 键推导（weatherIconVisible → data-weather-icon-visible）。
 * 所有可选项默认都是「显示」（!== false），老文档缺字段时不会出现空白组件。
 */
function syncWeatherInspector(weatherComponent) {
  const weatherProperties = weatherComponent.properties || {};
  syncEntityPickerValue(weatherComponent);
  applyInspectorFields(WEATHER_INSPECTOR_FIELDS, {
    properties: weatherProperties,
    metrics: inspectorComponentMetrics(weatherComponent, activeProject.document)
  });
  applyInspectorToggles(WEATHER_VISIBILITY_TOGGLES, weatherProperties);
  weatherScaleInputElement.disabled = false;
  weatherRotationInputElement.disabled = false;
}
/* 折线图出厂四档阈值。这两处（检查器回填 + 阈值解析）原本各抄了一份写死的
   #ddffc2 / #68cc3e / #ff8e52 / #ff1a1a，与 weather-chart-runtime 的色带是第三次抄写 ——
   换配色时三份都得改，而实际上一份都没跟着改。
   四档令牌与 weather-chart-runtime 的 CHART_THRESHOLD_FALLBACK_COLORS 逐档对应（低 → 高）。 */
const LINE_CHART_DEFAULT_THRESHOLD_VALUES = [0, 13, 27, 40];
const LINE_CHART_DEFAULT_THRESHOLD_TOKENS = [
  "--hos-eco-bright",
  "--hos-eco",
  "--hos-heat",
  "--hos-alert"
];
const LINE_CHART_DEFAULT_THRESHOLD_FALLBACKS = ["#88dcbf", "#5fd0a8", "#ff8a65", "#f07a7e"];
/**
 * 生成折线图出厂阈值。颜色必须在这一步就解析成 `#rrggbb`：
 * 下游把它们填进颜色输入框与色块，`var(--hos-eco)` 那种写法在 `<input type="color">` 里会被判非法。
 */
function defaultLineChartThresholds() {
  return LINE_CHART_DEFAULT_THRESHOLD_VALUES.map((thresholdValue, thresholdIndex) => ({
    value: thresholdValue,
    color: paletteColor(
      LINE_CHART_DEFAULT_THRESHOLD_TOKENS[thresholdIndex],
      LINE_CHART_DEFAULT_THRESHOLD_FALLBACKS[thresholdIndex]
    )
  }));
}
/**
 * 把折线图组件的当前值回填到检查器。位置按中心点百分比展示（position 存左上角像素，故 x/y 各加半个自身尺寸）；
 * 宽高下限 0.1 防回填 0、缩放夹到 1~500（即 0.01~5 倍）、旋转夹到 ±360。多选时禁用宽高输入但缩放与旋转仍可批量设置；
 * 「一键应用」按钮的可点性同时取决于可替换目标数与净变更数，任一为 0 都没有可应用的内容。
 */
function syncLineChartInspector(lineChartComponent) {
  const chartProperties = lineChartComponent.properties || {};
  const chartPosition = lineChartComponent.position || {};
  const chartCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const chartCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const chartWidthPx = Number(chartPosition.width || 100);
  const chartHeightPx = Number(chartPosition.height || 100);
  syncEntityPickerValue(lineChartComponent);
  lineChartTypeTextInputElement.value = "折线图";
  lineChartLabelTextInputElement.value = chartProperties.label || "";
  for (const valueVisibleToggleElement of lineChartValueVisibleElement.querySelectorAll(
    "[data-line-chart-value-visible]"
  )) {
    const isValueVisible =
      valueVisibleToggleElement.dataset.lineChartValueVisible ===
      (chartProperties.valueVisible === false ? "off" : "on");
    valueVisibleToggleElement.classList.toggle("active", isValueVisible);
    valueVisibleToggleElement.setAttribute("aria-pressed", String(isValueVisible));
  }
  lineChartValueScaleInputElement.value = roundField(
    clampNumber(Number(chartProperties.valueScale ?? 100), 10, 500)
  );
  lineChartValueColorInputElement.value = chartProperties.valueColor || "#dce1e5";
  lineChartStatePrecisionSelectElement.value = ["0", "1", "2", "3", "4"].includes(
    String(chartProperties.statePrecision)
  )
    ? String(chartProperties.statePrecision)
    : "auto";
  lineChartValueOffsetXInputElement.value = roundField(
    clampNumber(Number(chartProperties.valueOffsetX ?? 0), -100, 100)
  );
  lineChartValueOffsetYInputElement.value = roundField(
    clampNumber(Number(chartProperties.valueOffsetY ?? 0), -100, 100)
  );
  lineChartUpdateIntervalInputElement.value = roundField(
    clampNumber(Number(chartProperties.updateInterval ?? 600), 30, 86400)
  );
  lineChartHoursInputElement.value = roundField(
    clampNumber(Number(chartProperties.hours ?? 24), 1, 168)
  );
  lineChartCurveRadiusInputElement.value = roundField(
    clampNumber(Number(chartProperties.cornerRadius ?? 10), 0, 50)
  );
  const defaultThresholds = defaultLineChartThresholds();
  const hasCustomThresholds =
    Array.isArray(chartProperties.thresholds) &&
    chartProperties.thresholds.some(threshold => Number.isFinite(Number(threshold?.value)));
  const thresholdMode =
    chartProperties.thresholdMode === "auto" ||
    (!hasCustomThresholds && chartProperties.thresholdMode !== "manual")
      ? "auto"
      : "manual";
  lineChartThresholdModeSelectElement.value = thresholdMode;
  const thresholds = hasCustomThresholds ? chartProperties.thresholds : defaultThresholds;
  lineChartThresholdInputs.forEach((thresholdInput, thresholdSlotIndex) => {
    thresholdInput.value.value = roundField(
      Number(thresholds[thresholdSlotIndex]?.value ?? defaultThresholds[thresholdSlotIndex].value)
    );
    thresholdInput.color.value =
      thresholds[thresholdSlotIndex]?.color || defaultThresholds[thresholdSlotIndex].color;
    thresholdInput.value.disabled = thresholdMode === "auto";
    thresholdInput.color.disabled = thresholdMode === "auto";
  });
  lineChartLeftInputElement.value = roundField(
    clampNumber(
      ((Number(chartPosition.x || 0) + chartWidthPx / 2) / chartCanvasWidthPx) * 100,
      0,
      100
    )
  );
  lineChartTopInputElement.value = roundField(
    clampNumber(
      ((Number(chartPosition.y || 0) + chartHeightPx / 2) / chartCanvasHeightPx) * 100,
      0,
      100
    )
  );
  lineChartWidthInputElement.value = roundField(
    clampNumber((chartWidthPx / chartCanvasWidthPx) * 100, 0.1, 100)
  );
  lineChartHeightInputElement.value = roundField(
    clampNumber((chartHeightPx / chartCanvasHeightPx) * 100, 0.1, 100)
  );
  lineChartScaleInputElement.value = roundField(
    clampNumber(Number(lineChartComponent.style?.scale || 1) * 100, 1, 500)
  );
  lineChartRotationInputElement.value = roundField(
    clampNumber(Number(chartPosition.rotation || 0), -360, 360)
  );
  const isMultiSelection = selectedComponentIds.size > 1;
  lineChartWidthInputElement.disabled = isMultiSelection;
  lineChartHeightInputElement.disabled = isMultiSelection;
  lineChartScaleInputElement.disabled = false;
  lineChartRotationInputElement.disabled = false;
  const replaceableCount = findReplaceableComponents(lineChartComponent).length;
  const applyTargetCount = collectLineChartChangedProperties(lineChartComponent).length;
  lineChartApplyStyleButtonElement.disabled = !replaceableCount || !applyTargetCount;
  lineChartApplyCountElement.textContent = applyTargetCount + " 项修改";
  lineChartApplyStyleButtonElement.textContent = "一键应用到同类型控件";
  syncComponentActionControls(lineChartComponent, lineChartActionControlsElement);
}
/**
 * 把底图框组件的当前值回填到检查器。与折线图同构：位置按中心点百分比、宽高按画布百分比、字号等做
 * 边界夹取；主文案默认可见（!== false 兼容缺字段的老文档）。
 */
function syncPanelFrameInspector(panelFrameComponent) {
  const frameProperties = panelFrameComponent.properties || {};
  const framePosition = panelFrameComponent.position || {};
  const frameCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const frameCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const frameWidthPx = Number(framePosition.width || 100);
  const frameHeightPx = Number(framePosition.height || 100);
  panelFrameTypeTextInputElement.value = "底图框";
  panelFrameLabelTextInputElement.value = frameProperties.label || "";
  setInspectorToggle(panelFrameMainVisibleButtonElement, frameProperties.mainTextVisible !== false);
  panelFrameMainTextInputElement.value = frameProperties.mainText || "";
  panelFrameMainColorInputElement.value = frameProperties.mainColor || "#ffffff";
  panelFrameMainSizeInputElement.value = roundField(
    clampNumber(Number(frameProperties.mainSize ?? 30), 8, 500)
  );
  panelFrameMainWeightInputElement.value = roundField(
    clampNumber(Number(frameProperties.mainWeight ?? 0), 0, 3)
  );
  panelFrameMainOpacityInputElement.value = roundField(
    clampNumber(Number(frameProperties.mainOpacity ?? 0.72) * 100, 0, 100)
  );
  panelFrameMainSpacingInputElement.value = roundField(
    clampNumber(Number(frameProperties.mainSpacing ?? 2), -20, 100)
  );
  const defaultTextLeft = Number(frameProperties.textLeft ?? 5.2);
  const defaultTextTop = Number(frameProperties.textTop ?? 28);
  panelFrameMainLeftInputElement.value = roundField(
    clampNumber(Number(frameProperties.mainTextLeft ?? defaultTextLeft), -100, 200)
  );
  panelFrameMainTopInputElement.value = roundField(
    clampNumber(
      Number(
        frameProperties.mainTextTop ??
          defaultTextTop - (Number(frameProperties.lineGap ?? 24) / frameHeightPx) * 100
      ),
      -100,
      200
    )
  );
  setInspectorToggle(
    panelFrameSecondaryVisibleButtonElement,
    frameProperties.secondaryTextVisible !== false
  );
  panelFrameSecondaryTextInputElement.value = frameProperties.secondaryText || "";
  panelFrameSecondaryColorInputElement.value = frameProperties.secondaryColor || "#ffffff";
  panelFrameSecondarySizeInputElement.value = roundField(
    clampNumber(Number(frameProperties.secondarySize ?? 15), 6, 500)
  );
  panelFrameSecondaryWeightInputElement.value = roundField(
    clampNumber(Number(frameProperties.secondaryWeight ?? 0), 0, 3)
  );
  panelFrameSecondaryOpacityInputElement.value = roundField(
    clampNumber(Number(frameProperties.secondaryOpacity ?? 0.36) * 100, 0, 100)
  );
  panelFrameSecondarySpacingInputElement.value = roundField(
    clampNumber(Number(frameProperties.secondarySpacing ?? 2.1), -20, 100)
  );
  panelFrameSecondaryLeftInputElement.value = roundField(
    clampNumber(Number(frameProperties.secondaryTextLeft ?? defaultTextLeft), -100, 200)
  );
  panelFrameSecondaryTopInputElement.value = roundField(
    clampNumber(Number(frameProperties.secondaryTextTop ?? defaultTextTop), -100, 200)
  );
  setInspectorToggle(panelFrameEdgeVisibleButtonElement, frameProperties.edgeVisible !== false);
  panelFrameEdgeColorInputElement.value = frameProperties.edgeColor || "#d4d4d4";
  panelFrameEdgeWidthInputElement.value = roundField(
    clampNumber(Number(frameProperties.edgeWidth ?? 0.9), 0, 20)
  );
  panelFrameEdgeOpacityInputElement.value = roundField(
    clampNumber(Number(frameProperties.edgeOpacity ?? 1) * 100, 0, 100)
  );
  panelFrameRadiusInputElement.value = roundField(
    clampNumber(Number(frameProperties.radius ?? 0.195) * 100, 0, 50)
  );
  panelFrameEdgeAngleInputElement.value = roundField(
    clampNumber(Number(frameProperties.edgeAngle ?? 45), 0, 360)
  );
  setInspectorToggle(panelFrameGlowVisibleButtonElement, frameProperties.glowVisible !== false);
  panelFrameGlowColorInputElement.value = frameProperties.glowColor || "#ffffff";
  panelFrameGlowStrengthInputElement.value = roundField(
    clampNumber(Number(frameProperties.glowStrength ?? 0.5) * 100, 0, 500)
  );
  panelFrameGlowSizeInputElement.value = roundField(
    clampNumber(Number(frameProperties.glowSize ?? 1.5) * 100, 0, 300)
  );
  panelFrameGlowAngleInputElement.value = roundField(
    clampNumber(Number(frameProperties.glowAngle ?? 242), 0, 360)
  );
  panelFrameLeftInputElement.value = roundField(
    clampNumber(
      ((Number(framePosition.x || 0) + frameWidthPx / 2) / frameCanvasWidthPx) * 100,
      0,
      100
    )
  );
  panelFrameTopInputElement.value = roundField(
    clampNumber(
      ((Number(framePosition.y || 0) + frameHeightPx / 2) / frameCanvasHeightPx) * 100,
      0,
      100
    )
  );
  panelFrameWidthInputElement.value = roundField(
    clampNumber((frameWidthPx / frameCanvasWidthPx) * 100, 0.1, 100)
  );
  panelFrameHeightInputElement.value = roundField(
    clampNumber((frameHeightPx / frameCanvasHeightPx) * 100, 0.1, 100)
  );
  panelFrameScaleInputElement.value = roundField(
    clampNumber(Number(panelFrameComponent.style?.scale || 1) * 100, 1, 500)
  );
  panelFrameRotationInputElement.value = roundField(
    clampNumber(Number(framePosition.rotation || 0), -360, 360)
  );
  const isFrameMultiSelection = selectedComponentIds.size > 1;
  panelFrameWidthInputElement.disabled = isFrameMultiSelection;
  panelFrameHeightInputElement.disabled = isFrameMultiSelection;
  panelFrameScaleInputElement.disabled = false;
  panelFrameRotationInputElement.disabled = false;
  const frameReplaceableCount = findReplaceableComponents(panelFrameComponent).length;
  const frameApplyTargetCount = collectPanelFrameStyleChanges(panelFrameComponent).length;
  panelFrameApplyStyleButtonElement.disabled = !frameReplaceableCount || !frameApplyTargetCount;
  panelFrameApplyCountElement.textContent = frameApplyTargetCount + " 项修改";
  panelFrameApplyStyleButtonElement.textContent = "一键应用到同类型控件";
}
/**
 * 把导航按钮组件的当前值回填到检查器。预览态优先读 navigationPreviewStateByComponentId（编辑期临时值），无则 "auto"。
 * 文案与副标题给了默认值，因为空字符串会让按钮在画布上完全看不见；透明度字段内部是 0~1 小数、界面乘 100 显示成百分比；
 * 发光强度上限放宽到 500，是为了允许过曝的高光效果。
 */
function syncNavigationInspector(navigationComponent) {
  const navigationProperties = navigationComponent.properties || {};
  const navigationPosition = navigationComponent.position || {};
  const navigationCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const navigationCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const navigationWidthPx = Number(navigationPosition.width || 100);
  const navigationHeightPx = Number(navigationPosition.height || 100);
  navigationTypeTextInputElement.value = "导航按钮";
  navigationLabelTextInputElement.value = navigationProperties.label || "";
  syncEntityPickerValue(navigationComponent);
  const previewState = navigationPreviewStateByComponentId.get(navigationComponent.id) || "auto";
  for (const previewStateButtonElement of navigationPreviewStateElement.querySelectorAll(
    "[data-navigation-preview]"
  )) {
    previewStateButtonElement.classList.toggle(
      "active",
      previewStateButtonElement.dataset.navigationPreview === previewState
    );
  }
  navigationMainTextInputElement.value = navigationProperties.mainText || "页面导航";
  navigationSecondaryTextInputElement.value = navigationProperties.secondaryText || "NAVIGATION";
  setInspectorToggle(
    navigationMainVisibleButtonElement,
    navigationProperties.mainTextVisible !== false
  );
  setInspectorToggle(
    navigationSecondaryVisibleButtonElement,
    navigationProperties.secondaryTextVisible !== false
  );
  setInspectorToggle(
    navigationIconVisibleButtonElement,
    navigationProperties.iconVisible !== false
  );
  setInspectorToggle(
    navigationFrameVisibleButtonElement,
    navigationProperties.frameVisible !== false
  );
  setInspectorToggle(
    navigationGlowVisibleButtonElement,
    navigationProperties.glowVisible !== false
  );
  renderNavigationIconPreview(navigationProperties.icon || "");
  navigationMainColorInputElement.value = navigationProperties.mainColor || "#e9edf0";
  navigationSecondaryColorInputElement.value = navigationProperties.secondaryColor || "#e9edf0";
  navigationMainSizeInputElement.value = roundField(Number(navigationProperties.mainSize ?? 30));
  navigationSecondarySizeInputElement.value = roundField(
    Number(navigationProperties.secondarySize ?? 11)
  );
  navigationMainWeightInputElement.value = roundField(Number(navigationProperties.mainWeight ?? 0));
  navigationSecondaryWeightInputElement.value = roundField(
    Number(navigationProperties.secondaryWeight ?? 0)
  );
  navigationMainSpacingInputElement.value = roundField(
    Number(navigationProperties.mainSpacing ?? 8)
  );
  navigationSecondarySpacingInputElement.value = roundField(
    Number(navigationProperties.secondarySpacing ?? 3)
  );
  const navigationTextLeft = Number(navigationProperties.textLeft ?? 27.5);
  const navigationTextTop = Number(navigationProperties.textTop ?? 81.5);
  navigationMainTextLeftInputElement.value = roundField(
    Number(navigationProperties.mainTextLeft ?? navigationTextLeft)
  );
  navigationMainTextTopInputElement.value = roundField(
    Number(navigationProperties.mainTextTop ?? navigationTextTop - 1800 / 64.36)
  );
  navigationSecondaryTextLeftInputElement.value = roundField(
    Number(navigationProperties.secondaryTextLeft ?? navigationTextLeft)
  );
  navigationSecondaryTextTopInputElement.value = roundField(
    Number(navigationProperties.secondaryTextTop ?? navigationTextTop)
  );
  navigationTextIdleOpacityInputElement.value = roundField(
    clampNumber(
      Number(navigationProperties.textIdleOpacity ?? navigationProperties.idleOpacity ?? 0.3) * 100,
      0,
      100
    )
  );
  navigationTextActiveOpacityInputElement.value = roundField(
    clampNumber(
      Number(navigationProperties.textActiveOpacity ?? navigationProperties.activeOpacity ?? 0.96) *
        100,
      0,
      100
    )
  );
  navigationIconColorInputElement.value = navigationProperties.iconColor || "#e9edf0";
  navigationIconSizeInputElement.value = roundField(Number(navigationProperties.iconSize ?? 50));
  navigationIconLeftInputElement.value = roundField(Number(navigationProperties.iconLeft ?? 14));
  navigationIconTopInputElement.value = roundField(Number(navigationProperties.iconTop ?? 50));
  navigationIconIdleOpacityInputElement.value = roundField(
    clampNumber(
      Number(navigationProperties.iconIdleOpacity ?? navigationProperties.idleOpacity ?? 0.3) * 100,
      0,
      100
    )
  );
  navigationIconActiveOpacityInputElement.value = roundField(
    clampNumber(
      Number(navigationProperties.iconActiveOpacity ?? navigationProperties.activeOpacity ?? 0.96) *
        100,
      0,
      100
    )
  );
  navigationFrameColorInputElement.value = navigationProperties.frameColor || "#d9e0e6";
  navigationFrameWidthInputElement.value = roundField(Number(navigationProperties.frameWidth ?? 2));
  navigationFrameIdleOpacityInputElement.value = roundField(
    clampNumber(Number(navigationProperties.frameIdleOpacity ?? 0.48) * 100, 0, 100)
  );
  navigationFrameActiveOpacityInputElement.value = roundField(
    clampNumber(Number(navigationProperties.frameActiveOpacity ?? 0.98) * 100, 0, 100)
  );
  navigationFrameAngleInputElement.value = roundField(
    clampNumber(Number(navigationProperties.frameAngle ?? 45), 0, 360)
  );
  navigationGlowColorInputElement.value = navigationProperties.glowColor || "#f2f6fa";
  navigationGlowAngleInputElement.value = roundField(
    clampNumber(Number(navigationProperties.glowAngle ?? 45), 0, 360)
  );
  navigationGlowIdleStrengthInputElement.value = roundField(
    clampNumber(Number(navigationProperties.glowIdleStrength ?? 0.5) * 100, 0, 500)
  );
  navigationGlowIdleSizeInputElement.value = roundField(
    clampNumber(Number(navigationProperties.glowIdleSize ?? 1.5) * 100, 0, 300)
  );
  navigationGlowActiveStrengthInputElement.value = roundField(
    clampNumber(Number(navigationProperties.glowActiveStrength ?? 2.2) * 100, 0, 500)
  );
  navigationGlowActiveSizeInputElement.value = roundField(
    clampNumber(Number(navigationProperties.glowActiveSize ?? 3) * 100, 0, 300)
  );
  navigationRadiusInputElement.value = roundField(
    clampNumber(Number(navigationProperties.radius ?? 0.5) * 100, 0, 50)
  );
  navigationLeftInputElement.value = roundField(
    clampNumber(
      ((Number(navigationPosition.x || 0) + navigationWidthPx / 2) / navigationCanvasWidthPx) * 100,
      0,
      100
    )
  );
  navigationTopInputElement.value = roundField(
    clampNumber(
      ((Number(navigationPosition.y || 0) + navigationHeightPx / 2) / navigationCanvasHeightPx) *
        100,
      0,
      100
    )
  );
  navigationWidthInputElement.value = roundField(
    clampNumber((navigationWidthPx / navigationCanvasWidthPx) * 100, 0.1, 100)
  );
  navigationHeightInputElement.value = roundField(
    clampNumber((navigationHeightPx / navigationCanvasHeightPx) * 100, 0.1, 100)
  );
  navigationScaleInputElement.value = roundField(
    clampNumber(Number(navigationComponent.style?.scale || 1) * 100, 1, 500)
  );
  navigationRotationInputElement.value = roundField(Number(navigationPosition.rotation || 0));
  const isNavigationMultiSelection = selectedComponentIds.size > 1;
  navigationWidthInputElement.disabled = isNavigationMultiSelection;
  navigationHeightInputElement.disabled = isNavigationMultiSelection;
  navigationScaleInputElement.disabled = false;
  navigationRotationInputElement.disabled = false;
  const navigationReplaceableCount = findReplaceableComponents(navigationComponent).length;
  const navigationApplyTargetCount = collectNavigationStyleChanges(navigationComponent).length;
  navigationApplyStyleButtonElement.disabled =
    !navigationReplaceableCount || !navigationApplyTargetCount;
  navigationApplyCountElement.textContent = navigationApplyTargetCount + " 项修改";
  navigationApplyStyleButtonElement.textContent = "一键应用到同类型控件";
  syncComponentActionControls(navigationComponent, navigationActionControlsElement);
}
/**
 * 把标题按钮组件的当前值回填到检查器。副标题是「最多两行」的语义，故把 secondaryText 按换行拆开填进两个输入框，
 * 用 slice(0, 2) 丢弃多余行——面板只有两个输入框，原样保留第三行会让用户一改就把它静默删掉。
 * 字重经 normalizedFontWeight 归一（历史数据可能是 100~900 数值或关键字）；主副文案都给了默认字重，避免缺字段时看不见。
 */
function syncTitleButtonInspector(titleButtonComponent) {
  const titleProperties = titleButtonComponent.properties || {};
  const titlePosition = titleButtonComponent.position || {};
  const titleCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const titleCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const titleWidthPx = Number(titlePosition.width || 100);
  const titleHeightPx = Number(titlePosition.height || 100);
  titleButtonLabelTextInputElement.value = titleProperties.label || "";
  syncEntityPickerValue(titleButtonComponent);
  setInspectorToggle(
    titleButtonMainVisibleButtonElement,
    titleProperties.mainTextVisible !== false
  );
  setInspectorToggle(
    titleButtonSecondaryVisibleButtonElement,
    titleProperties.secondaryTextVisible !== false
  );
  setInspectorToggle(titleButtonFrameVisibleButtonElement, titleProperties.frameVisible !== false);
  setInspectorToggle(titleButtonIconVisibleButtonElement, titleProperties.iconVisible !== false);
  titleButtonMainTextInputElement.value = titleProperties.mainText || "";
  const secondaryLines = String(titleProperties.secondaryText || "")
    .split(/\r?\n/)
    .slice(0, 2);
  titleButtonSecondaryLine1TextInputElement.value = secondaryLines[0] || "";
  titleButtonSecondaryLine2TextInputElement.value = secondaryLines[1] || "";
  titleButtonMainColorInputElement.value = titleProperties.mainColor || "#b9bbc0";
  titleButtonSecondaryColorInputElement.value = titleProperties.secondaryColor || "#70737b";
  titleButtonMainSizeInputElement.value = roundField(Number(titleProperties.mainSize ?? 34));
  titleButtonSecondarySizeInputElement.value = roundField(
    Number(titleProperties.secondarySize ?? 12)
  );
  titleButtonMainWeightInputElement.value = roundField(
    normalizedFontWeight(titleProperties.mainWeight, 0.3)
  );
  titleButtonSecondaryWeightInputElement.value = roundField(
    normalizedFontWeight(titleProperties.secondaryWeight, 0.2)
  );
  titleButtonMainSpacingInputElement.value = roundField(Number(titleProperties.mainSpacing ?? 1));
  titleButtonSecondarySpacingInputElement.value = roundField(
    Number(titleProperties.secondarySpacing ?? 2)
  );
  titleButtonSecondaryLineGapInputElement.value = roundField(
    Number(titleProperties.secondaryLineGap ?? 2)
  );
  titleButtonMainLeftInputElement.value = roundField(Number(titleProperties.mainTextLeft ?? 5.5));
  titleButtonMainTopInputElement.value = roundField(Number(titleProperties.mainTextTop ?? 45));
  titleButtonSecondaryLeftInputElement.value = roundField(
    Number(titleProperties.secondaryTextLeft ?? 54)
  );
  titleButtonSecondaryTopInputElement.value = roundField(
    Number(titleProperties.secondaryTextTop ?? 43)
  );
  renderTitleButtonIconPreview(titleProperties.icon || "");
  titleButtonIconColorInputElement.value = titleProperties.iconColor || "#b9bbc0";
  titleButtonIconSizeInputElement.value = roundField(Number(titleProperties.iconSize ?? 30));
  titleButtonIconLeftInputElement.value = roundField(Number(titleProperties.iconLeft ?? 50));
  titleButtonIconTopInputElement.value = roundField(Number(titleProperties.iconTop ?? 45));
  titleButtonFrameColorInputElement.value = titleProperties.frameColor || "#60636a";
  titleButtonFrameWidthInputElement.value = roundField(Number(titleProperties.frameWidth ?? 1.5));
  titleButtonFrameSizeInputElement.value = roundField(Number(titleProperties.frameSize ?? 100));
  titleButtonFrameSpacingInputElement.value = roundField(
    Number(titleProperties.frameSpacing ?? 100)
  );
  titleButtonFrameOffsetXInputElement.value = roundField(Number(titleProperties.frameOffsetX ?? 0));
  titleButtonFrameOffsetYInputElement.value = roundField(Number(titleProperties.frameOffsetY ?? 0));
  titleButtonMarkerColorInputElement.value =
    titleProperties.markerColor || paletteColor("--hos-accent", "#ffc46a");
  titleButtonMarkerSizeInputElement.value = roundField(Number(titleProperties.markerSize ?? 10));
  titleButtonMarkerLeftInputElement.value = roundField(Number(titleProperties.markerLeft ?? 1.8));
  titleButtonMarkerTopInputElement.value = roundField(Number(titleProperties.markerTop ?? 84));
  const isMarkerVisible = titleProperties.markerVisible !== false;
  setInspectorToggle(titleButtonMarkerVisibleButtonElement, isMarkerVisible);
  titleButtonLeftInputElement.value = roundField(
    clampNumber(
      ((Number(titlePosition.x || 0) + titleWidthPx / 2) / titleCanvasWidthPx) * 100,
      0,
      100
    )
  );
  titleButtonTopInputElement.value = roundField(
    clampNumber(
      ((Number(titlePosition.y || 0) + titleHeightPx / 2) / titleCanvasHeightPx) * 100,
      0,
      100
    )
  );
  titleButtonWidthInputElement.value = roundField((titleWidthPx / titleCanvasWidthPx) * 100);
  titleButtonHeightInputElement.value = roundField((titleHeightPx / titleCanvasHeightPx) * 100);
  titleButtonScaleInputElement.value = roundField(
    Number(titleButtonComponent.style?.scale || 1) * 100
  );
  titleButtonRotationInputElement.value = roundField(Number(titlePosition.rotation || 0));
  const isTitleMultiSelection = selectedComponentIds.size > 1;
  for (const titleSizeInputElement of [
    titleButtonWidthInputElement,
    titleButtonHeightInputElement
  ]) {
    titleSizeInputElement.disabled = isTitleMultiSelection;
  }
  titleButtonRotationInputElement.disabled = false;
  titleButtonScaleInputElement.disabled = false;
  const titleReplaceableCount = findReplaceableComponents(titleButtonComponent).length;
  const titleApplyTargetCount = collectTitleButtonChangedProperties(titleButtonComponent).length;
  titleButtonApplyStyleButtonElement.disabled = !titleReplaceableCount || !titleApplyTargetCount;
  titleButtonApplyCountElement.textContent = titleApplyTargetCount + " 项修改";
  titleButtonApplyStyleButtonElement.textContent = "一键应用到同类型控件";
  syncComponentActionControls(titleButtonComponent, titleButtonActionControlsElement);
}
/**
 * 把灯光统计组件的当前值回填到检查器。组件 ID 变化时先 resetLightStatisticsPicker：统计面板的
 * 「添加/替换实体」是按下标操作的，换组件后旧下标会指向错误的实体，必须先复位。图标与数量标题都有
 * 可见性开关与配色（普通色 + 激活色，后者用于亮灯时的强调）。
 */
function syncLightStatisticsInspector(lightStatisticsComponent) {
  const statisticsProperties = lightStatisticsComponent.properties || {};
  const statisticsPosition = lightStatisticsComponent.position || {};
  const statisticsCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const statisticsCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const statisticsWidthPx = Number(statisticsPosition.width || 100);
  const statisticsHeightPx = Number(statisticsPosition.height || 100);
  if (statisticsComponentId && statisticsComponentId !== lightStatisticsComponent.id) {
    resetLightStatisticsPicker();
  }
  lightStatisticsLabelTextInputElement.value = statisticsProperties.label || "";
  lightStatisticsTitleTextInputElement.value = statisticsProperties.title || "数量";
  syncEntityPickerValue(lightStatisticsComponent);
  setInspectorToggle(
    lightStatisticsIconVisibleButtonElement,
    statisticsProperties.iconVisible !== false
  );
  setInspectorToggle(
    lightStatisticsTitleVisibleButtonElement,
    statisticsProperties.titleVisible !== false
  );
  setInspectorToggle(
    lightStatisticsCountVisibleButtonElement,
    statisticsProperties.countVisible !== false
  );
  renderLightStatisticsIconPreview(statisticsProperties.icon ?? "mdi:lightbulb-group-outline");
  lightStatisticsIconColorInputElement.value = statisticsProperties.iconColor || "#8b9298";
  lightStatisticsIconActiveColorInputElement.value =
    statisticsProperties.iconActiveColor || paletteColor("--hos-accent", "#ffc46a");
  lightStatisticsIconSizeInputElement.value = roundField(
    Number(statisticsProperties.iconSize ?? 42)
  );
  lightStatisticsTitleColorInputElement.value = statisticsProperties.titleColor || "#b9bbc0";
  lightStatisticsTitleSizeInputElement.value = roundField(
    Number(statisticsProperties.titleSize ?? 32)
  );
  lightStatisticsTitleWeightInputElement.value = roundField(
    normalizedFontWeight(statisticsProperties.titleWeight, 0.3)
  );
  lightStatisticsTitleSpacingInputElement.value = roundField(
    Number(statisticsProperties.titleSpacing ?? 1.2)
  );
  lightStatisticsCountColorInputElement.value = statisticsProperties.countColor || "#b9bbc0";
  lightStatisticsCountActiveColorInputElement.value =
    statisticsProperties.countActiveColor || paletteColor("--hos-accent", "#ffc46a");
  lightStatisticsCountSizeInputElement.value = roundField(
    Number(statisticsProperties.countSize ?? 34)
  );
  lightStatisticsCountWeightInputElement.value = roundField(
    normalizedFontWeight(statisticsProperties.countWeight, 0.35)
  );
  lightStatisticsCountSpacingInputElement.value = roundField(
    Number(statisticsProperties.countSpacing ?? 0)
  );
  lightStatisticsIconGapInputElement.value = roundField(
    Number(statisticsProperties.iconGap ?? 4.5)
  );
  lightStatisticsCountGapInputElement.value = roundField(
    Number(statisticsProperties.countGap ?? 4.5)
  );
  lightStatisticsLeftInputElement.value = roundField(
    clampNumber(
      ((Number(statisticsPosition.x || 0) + statisticsWidthPx / 2) / statisticsCanvasWidthPx) * 100,
      0,
      100
    )
  );
  lightStatisticsTopInputElement.value = roundField(
    clampNumber(
      ((Number(statisticsPosition.y || 0) + statisticsHeightPx / 2) / statisticsCanvasHeightPx) *
        100,
      0,
      100
    )
  );
  lightStatisticsWidthInputElement.value = roundField(
    (statisticsWidthPx / statisticsCanvasWidthPx) * 100
  );
  lightStatisticsHeightInputElement.value = roundField(
    (statisticsHeightPx / statisticsCanvasHeightPx) * 100
  );
  lightStatisticsScaleInputElement.value = roundField(
    Number(lightStatisticsComponent.style?.scale || 1) * 100
  );
  lightStatisticsRotationInputElement.value = roundField(Number(statisticsPosition.rotation || 0));
  const isStatisticsMultiSelection = selectedComponentIds.size > 1;
  lightStatisticsWidthInputElement.disabled = isStatisticsMultiSelection;
  lightStatisticsHeightInputElement.disabled = isStatisticsMultiSelection;
  lightStatisticsScaleInputElement.disabled = false;
  lightStatisticsRotationInputElement.disabled = false;
  setPickerButtonLabel(
    lightStatisticsEntityButtonElement,
    statisticsReplaceIndex >= 0 ? "选择替换实体" : "选择一个实体"
  );
  renderLightStatisticsEntities(lightStatisticsComponent);
  if (!lightStatisticsEntityMenuElement.hidden) {
    renderLightStatisticsEntityOptions(lightStatisticsEntitySearchInputElement.value);
  }
  syncComponentActionControls(lightStatisticsComponent, lightStatisticsActionControlsElement);
}
/**
 * 把图标按钮类组件（图标按钮 / 设备按钮 / 传感器）的当前值回填到检查器。一个函数覆盖三种类型：先用
 * type 派生 isPresenceSensor / isDeviceButton / isIconButton，后续按类型分支显示不同的属性分组；
 * 传感器品类用白名单过滤并映射成中文标签，非法值回落 "presence"，与 resolveSensorKind 的归一规则一致。
 */
function syncIconButtonInspector(iconButtonComponent) {
  const iconButtonProperties = iconButtonComponent.properties || {};
  const isPresenceSensor = iconButtonComponent.type === "presence-sensor";
  const sensorKindValue = [
    "presence",
    "door-window",
    "water-leak",
    "smoke",
    "natural-gas"
  ].includes(iconButtonProperties.sensorKind)
    ? iconButtonProperties.sensorKind
    : "presence";
  const sensorKindLabel = {
    presence: "人体/人在传感器",
    "door-window": "门窗传感器",
    "water-leak": "水浸传感器",
    smoke: "烟雾传感器",
    "natural-gas": "天然气传感器"
  }[sensorKindValue];
  const isDeviceButton = iconButtonComponent.type === "device-button" || isPresenceSensor;
  const iconButtonPosition = iconButtonComponent.position || {};
  const iconButtonCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const iconButtonCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const iconButtonWidthPx = Number(iconButtonPosition.width || 100);
  const iconButtonHeightPx = Number(iconButtonPosition.height || 100);
  iconButtonTypeTextInputElement.value = isPresenceSensor
    ? sensorKindLabel
    : isDeviceButton
      ? "设备按钮"
      : "图标按钮";
  iconButtonTypeLabelElement.classList.remove("inspector-full-row");
  presenceSensorKindLabelElement.hidden = !isPresenceSensor;
  presenceSensorKindLabelElement.classList.toggle("inspector-full-row", isPresenceSensor);
  presenceSensorKindSelectElement.value = sensorKindValue;
  syncCustomSelect(presenceSensorKindSelectElement);
  iconButtonMainHeadingElement.textContent = isDeviceButton ? "标题" : "中文标题";
  iconButtonSecondaryHeadingElement.textContent = isDeviceButton ? "状态" : "英文标题";
  iconButtonMainContentLabelElement.textContent = isDeviceButton ? "自定义标题" : "内容";
  iconButtonSecondaryContentLabelElement.textContent = isDeviceButton ? "自定义状态" : "内容";
  iconButtonMainTextInputElement.placeholder = isDeviceButton ? "留空跟随实体名称" : "";
  iconButtonSecondaryTextInputElement.placeholder = isDeviceButton ? "留空跟随实体状态" : "";
  iconButtonPreviewControlElement.hidden = isDeviceButton;
  iconButtonActionSectionElement.hidden = isPresenceSensor;
  iconButtonPreviewDetailsButtonElement.hidden = true;
  presenceMotionSectionElement.hidden = !isPresenceSensor || sensorKindValue !== "presence";
  doorWindowPerspectiveSectionElement.hidden =
    !isPresenceSensor || sensorKindValue !== "door-window";
  const isEditingPerspective = doorWindowPerspectiveEditIds.has(iconButtonComponent.id);
  doorWindowPerspectiveEditButtonElement.classList.toggle("active", isEditingPerspective);
  doorWindowPerspectiveEditButtonElement.setAttribute("aria-pressed", String(isEditingPerspective));
  doorWindowPerspectiveEditButtonElement.textContent = "编辑透视";
  doorWindowPerspectiveSaveButtonElement.disabled = !isEditingPerspective;
  iconButtonMainHeadingElement.closest(".inspector-section").hidden = isPresenceSensor;
  const iconButtonSectionElement = iconButtonIconButtonElement.closest(".inspector-section");
  iconButtonSectionElement.querySelector("h3").textContent = isPresenceSensor ? "显示颜色" : "图标";
  const iconPickerElement = iconButtonIconButtonElement.closest(".inspector-picker");
  iconPickerElement.hidden = isPresenceSensor;
  iconPickerElement.style.display = isPresenceSensor ? "none" : "";
  iconButtonFillSectionElement.hidden = isDeviceButton;
  iconButtonFrameSectionElement.hidden = isDeviceButton;
  iconButtonSoftLightSectionElement.hidden = isDeviceButton;
  iconButtonGlowSectionElement.hidden = isDeviceButton;
  iconButtonIconColorLabelElement.hidden = isPresenceSensor;
  iconButtonIconColorLabelElement.firstChild.textContent = isDeviceButton ? "关闭颜色" : "颜色";
  deviceButtonIconVisibleButtonElement.hidden = !isDeviceButton || isPresenceSensor;
  deviceButtonMainVisibleButtonElement.hidden = !isDeviceButton;
  deviceButtonSecondaryVisibleButtonElement.hidden = !isDeviceButton;
  deviceButtonIconOnColorLabelElement.hidden = !isDeviceButton;
  deviceButtonIconOnColorLabelElement.firstChild.textContent = isPresenceSensor
    ? {
        presence: "有人颜色",
        "door-window": "打开颜色",
        "water-leak": "水浸颜色",
        smoke: "烟雾颜色",
        "natural-gas": "天然气颜色"
      }[sensorKindValue]
    : "开启颜色";
  deviceButtonBadgeColorLabelElement.hidden = !isDeviceButton || isPresenceSensor;
  deviceButtonBadgeOpacityLabelElement.hidden = !isDeviceButton || isPresenceSensor;
  iconButtonIconSizeLabelElement.hidden = isDeviceButton;
  deviceButtonSymbolSizeLabelElement.hidden = !isDeviceButton || isPresenceSensor;
  deviceButtonBadgeSizeLabelElement.hidden = !isDeviceButton || isPresenceSensor;
  deviceButtonStatePrecisionLabelElement.hidden = !isDeviceButton || isPresenceSensor;
  iconButtonIconLeftInputElement.closest("label").hidden = isPresenceSensor;
  iconButtonIconTopInputElement.closest("label").hidden = isPresenceSensor;
  iconButtonIconOffOpacityLabelElement.hidden = isDeviceButton;
  iconButtonIconOnOpacityLabelElement.hidden = isDeviceButton;
  iconButtonMainOffOpacityLabelElement.hidden = isDeviceButton;
  iconButtonMainOnOpacityLabelElement.hidden = isDeviceButton;
  iconButtonSecondaryOffOpacityLabelElement.hidden = isDeviceButton;
  iconButtonSecondaryOnOpacityLabelElement.hidden = isDeviceButton;
  iconButtonLabelTextInputElement.value = iconButtonProperties.label || "";
  syncEntityPickerValue(iconButtonComponent);
  renderIconButtonIconPreview(iconButtonProperties.icon || "");
  iconButtonIconColorInputElement.value =
    iconButtonProperties.iconColor ||
    (isPresenceSensor ? iconButtonProperties.clearColor : "") ||
    iconButtonProperties.iconOffColor ||
    iconButtonProperties.iconOnColor ||
    "#d7d8da";
  setInspectorToggle(
    deviceButtonIconVisibleButtonElement,
    iconButtonProperties.iconVisible !== false
  );
  deviceButtonIconOnColorInputElement.value =
    sensorKindValue === "water-leak"
      ? iconButtonProperties.waterLeakColor || "#42c8ff"
      : sensorKindValue === "smoke"
        ? iconButtonProperties.smokeColor || "#ffffff"
        : sensorKindValue === "natural-gas"
          ? iconButtonProperties.naturalGasColor || "#ffb347"
          : iconButtonProperties.iconOnColor ||
            (isPresenceSensor ? iconButtonProperties.occupiedColor : "") ||
            "#379bff";
  deviceButtonBadgeColorInputElement.value = iconButtonProperties.badgeColor || "#5b5e66";
  deviceButtonBadgeOpacityInputElement.value = roundField(
    Number(iconButtonProperties.badgeOpacity ?? 0.58) * 100
  );
  deviceButtonBadgeSizeInputElement.value = roundField(
    Number(iconButtonProperties.badgeSize ?? iconButtonProperties.iconSize ?? 28)
  );
  deviceButtonSymbolSizeInputElement.value = roundField(
    Number(iconButtonProperties.symbolSize ?? Number(iconButtonProperties.iconSize ?? 28) * 0.5)
  );
  deviceButtonStatePrecisionSelectElement.value = ["0", "1", "2", "3", "4"].includes(
    String(iconButtonProperties.statePrecision)
  )
    ? String(iconButtonProperties.statePrecision)
    : "auto";
  presenceHaloScaleXInputElement.value = roundField(
    Number(iconButtonProperties.haloScaleX ?? iconButtonProperties.haloScale ?? 1) * 100
  );
  presenceHaloScaleYInputElement.value = roundField(
    Number(iconButtonProperties.haloScaleY ?? iconButtonProperties.haloScale ?? 1) * 100
  );
  presenceHaloRotationInputElement.value = roundField(
    Number(iconButtonProperties.haloRotation ?? 0)
  );
  presenceHaloOpacityInputElement.value = roundField(
    Number(iconButtonProperties.haloOpacity ?? 1) * 100
  );
  presencePersonScaleInputElement.value = roundField(
    Number(iconButtonProperties.personScale ?? 1) * 100
  );
  presencePersonRotationInputElement.value = roundField(
    Number(iconButtonProperties.personRotation ?? 0)
  );
  presencePersonOpacityInputElement.value = roundField(
    Number(iconButtonProperties.personOpacity ?? 1) * 100
  );
  presenceOrbitDurationInputElement.value = roundField(
    Number(iconButtonProperties.orbitDuration ?? 8)
  );
  setInspectorToggle(presenceHaloVisibleButtonElement, iconButtonProperties.haloVisible !== false);
  setInspectorToggle(
    presencePersonVisibleButtonElement,
    iconButtonProperties.personVisible !== false
  );
  iconButtonIconSizeInputElement.value = roundField(Number(iconButtonProperties.iconSize ?? 42));
  iconButtonIconOffOpacityInputElement.value = roundField(
    Number(iconButtonProperties.iconOffOpacity ?? 1) * 100
  );
  iconButtonIconOnOpacityInputElement.value = roundField(
    Number(iconButtonProperties.iconOnOpacity ?? 1) * 100
  );
  iconButtonIconLeftInputElement.value = roundField(Number(iconButtonProperties.iconLeft ?? 50));
  iconButtonIconTopInputElement.value = roundField(Number(iconButtonProperties.iconTop ?? 34));
  iconButtonMainTextInputElement.value = iconButtonProperties.mainText || "";
  setInspectorToggle(
    deviceButtonMainVisibleButtonElement,
    iconButtonProperties.mainTextVisible !== false
  );
  iconButtonSecondaryTextInputElement.value = iconButtonProperties.secondaryText || "";
  setInspectorToggle(
    deviceButtonSecondaryVisibleButtonElement,
    iconButtonProperties.secondaryTextVisible !== false
  );
  iconButtonMainColorInputElement.value =
    iconButtonProperties.mainColor ||
    iconButtonProperties.mainOffColor ||
    iconButtonProperties.mainOnColor ||
    "#c7c8cb";
  iconButtonSecondaryColorInputElement.value =
    iconButtonProperties.secondaryColor ||
    iconButtonProperties.secondaryOffColor ||
    iconButtonProperties.secondaryOnColor ||
    "#75777d";
  iconButtonMainOffOpacityInputElement.value = roundField(
    Number(iconButtonProperties.mainOffOpacity ?? 1) * 100
  );
  iconButtonMainOnOpacityInputElement.value = roundField(
    Number(iconButtonProperties.mainOnOpacity ?? 1) * 100
  );
  iconButtonSecondaryOffOpacityInputElement.value = roundField(
    Number(iconButtonProperties.secondaryOffOpacity ?? 1) * 100
  );
  iconButtonSecondaryOnOpacityInputElement.value = roundField(
    Number(iconButtonProperties.secondaryOnOpacity ?? 1) * 100
  );
  iconButtonMainSizeInputElement.value = roundField(Number(iconButtonProperties.mainSize ?? 25));
  iconButtonSecondarySizeInputElement.value = roundField(
    Number(iconButtonProperties.secondarySize ?? 10)
  );
  iconButtonMainWeightInputElement.value = roundField(
    normalizedFontWeight(iconButtonProperties.mainWeight, 0.25)
  );
  iconButtonSecondaryWeightInputElement.value = roundField(
    normalizedFontWeight(iconButtonProperties.secondaryWeight, 0.18)
  );
  iconButtonMainSpacingInputElement.value = roundField(
    Number(iconButtonProperties.mainSpacing ?? 1)
  );
  iconButtonSecondarySpacingInputElement.value = roundField(
    Number(iconButtonProperties.secondarySpacing ?? 0.7)
  );
  iconButtonMainLeftInputElement.value = roundField(Number(iconButtonProperties.mainTextLeft ?? 9));
  iconButtonMainTopInputElement.value = roundField(Number(iconButtonProperties.mainTextTop ?? 78));
  iconButtonSecondaryLeftInputElement.value = roundField(
    Number(iconButtonProperties.secondaryTextLeft ?? 9)
  );
  iconButtonSecondaryTopInputElement.value = roundField(
    Number(iconButtonProperties.secondaryTextTop ?? 91)
  );
  setInspectorToggle(
    iconButtonOnFillVisibleButtonElement,
    iconButtonProperties.onFillVisible !== false
  );
  iconButtonOnFillColorInputElement.value = iconButtonProperties.onFillColor || "#dfb64f";
  iconButtonOnFillStrengthInputElement.value = roundField(
    Number(iconButtonProperties.onFillStrength ?? 1) * 100
  );
  iconButtonOnFillFadeDurationInputElement.value = roundField(
    Number(iconButtonProperties.onFillFadeDuration ?? 0.3)
  );
  setInspectorToggle(
    iconButtonFrameVisibleButtonElement,
    iconButtonProperties.frameVisible !== false
  );
  iconButtonFrameWidthInputElement.value = roundField(Number(iconButtonProperties.frameWidth ?? 1));
  iconButtonFrameAngleInputElement.value = roundField(
    Number(iconButtonProperties.frameAngle ?? 45)
  );
  iconButtonFrameOffOpacityInputElement.value = roundField(
    Number(iconButtonProperties.frameOffOpacity ?? 0.8) * 100
  );
  iconButtonFrameOnOpacityInputElement.value = roundField(
    Number(iconButtonProperties.frameOnOpacity ?? 1) * 100
  );
  iconButtonCutCornerInputElement.value = roundField(Number(iconButtonProperties.cutCorner ?? 20));
  setInspectorToggle(
    iconButtonSoftLightVisibleButtonElement,
    iconButtonProperties.softLightVisible !== false
  );
  iconButtonSoftLightColorInputElement.value = iconButtonProperties.softLightColor || "#ffffff";
  iconButtonSoftLightStrengthInputElement.value = roundField(
    Number(iconButtonProperties.softLightStrength ?? 1) * 100
  );
  iconButtonSoftLightSizeInputElement.value = roundField(
    Number(iconButtonProperties.softLightSize ?? 1) * 100
  );
  iconButtonSoftLightAngleInputElement.value = roundField(
    Number(iconButtonProperties.softLightAngle ?? 45)
  );
  setInspectorToggle(
    iconButtonGlowVisibleButtonElement,
    iconButtonProperties.glowVisible !== false
  );
  iconButtonGlowColorInputElement.value = iconButtonProperties.glowColor || "#ffffff";
  iconButtonGlowStrengthInputElement.value = roundField(
    Number(iconButtonProperties.glowStrength ?? 1) * 100
  );
  iconButtonGlowSizeInputElement.value = roundField(
    Number(iconButtonProperties.glowSize ?? 1) * 100
  );
  iconButtonGlowAngleInputElement.value = roundField(Number(iconButtonProperties.glowAngle ?? 220));
  iconButtonLeftInputElement.value = roundField(
    clampNumber(
      ((Number(iconButtonPosition.x || 0) + iconButtonWidthPx / 2) / iconButtonCanvasWidthPx) * 100,
      0,
      100
    )
  );
  iconButtonTopInputElement.value = roundField(
    clampNumber(
      ((Number(iconButtonPosition.y || 0) + iconButtonHeightPx / 2) / iconButtonCanvasHeightPx) *
        100,
      0,
      100
    )
  );
  iconButtonWidthInputElement.value = roundField(
    (iconButtonWidthPx / iconButtonCanvasWidthPx) * 100
  );
  iconButtonHeightInputElement.value = roundField(
    (iconButtonHeightPx / iconButtonCanvasHeightPx) * 100
  );
  iconButtonScaleInputElement.value = roundField(
    Number(iconButtonComponent.style?.scale || 1) * 100
  );
  iconButtonRotationInputElement.value = roundField(Number(iconButtonPosition.rotation || 0));
  if (isPresenceSensor && !iconButtonPreviewStateByComponentId.has(iconButtonComponent.id)) {
    iconButtonPreviewStateByComponentId.set(iconButtonComponent.id, "on");
    editorRenderer?.setComponentPreviewState(iconButtonComponent.id, "on");
  }
  const iconPreviewState =
    iconButtonPreviewStateByComponentId.get(iconButtonComponent.id) || "auto";
  for (const iconPreviewStateButtonElement of iconButtonPreviewStateElement.querySelectorAll(
    "[data-icon-button-preview]"
  )) {
    const isPreviewStateActive =
      iconPreviewStateButtonElement.dataset.iconButtonPreview === iconPreviewState;
    iconPreviewStateButtonElement.classList.toggle("active", isPreviewStateActive);
    iconPreviewStateButtonElement.setAttribute("aria-pressed", String(isPreviewStateActive));
  }
  const isIconButtonMultiSelection = selectedComponentIds.size > 1;
  for (const iconSizeInputElement of [iconButtonWidthInputElement, iconButtonHeightInputElement]) {
    iconSizeInputElement.disabled = isIconButtonMultiSelection;
  }
  iconButtonRotationInputElement.disabled = false;
  iconButtonScaleInputElement.disabled = false;
  const iconButtonReplaceableCount = findReplaceableComponents(iconButtonComponent).length;
  const iconButtonApplyTargetCount = collectIconButtonChangedProperties(iconButtonComponent).length;
  iconButtonApplyStyleButtonElement.disabled =
    !iconButtonReplaceableCount || !iconButtonApplyTargetCount;
  iconButtonApplyCountElement.textContent = iconButtonApplyTargetCount + " 项修改";
  iconButtonApplyStyleButtonElement.textContent = "一键应用到同类型控件";
  syncComponentActionControls(iconButtonComponent, iconButtonActionControlsElement);
}
/**
 * 把摄像头组件的当前值回填到检查器。刷新间隔下限取 6 秒（抓图请求会打到 HA，间隔再短容易把 HA 打满），
 * 非法值回落到默认 10 秒，该字段只在「快照」模式下显示并可用。圆角历史上有 0~0.5 比例与 0~50 百分比两种存法，
 * 用 > 0.5 猜测换算；位置按中心点百分比展示（position 存左上角像素），宽高与缩放按画布换算。
 */
function syncCameraInspector(cameraComponent) {
  const cameraProperties = cameraComponent.properties || {};
  const cameraPosition = cameraComponent.position || {};
  const cameraCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const cameraCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const cameraWidthPx = Number(cameraPosition.width || 100);
  const cameraHeightPx = Number(cameraPosition.height || 100);
  cameraLabelTextInputElement.value = cameraProperties.label || "";
  syncEntityPickerValue(cameraComponent);
  setInspectorToggle(cameraMediaVisibleButtonElement, cameraProperties.mediaVisible !== false);
  const displayMode = cameraProperties.displayMode === "snapshot" ? "snapshot" : "live";
  for (const displayModeButtonElement of cameraDisplayModeOptionsElement.querySelectorAll(
    "[data-camera-display-mode]"
  )) {
    const isDisplayModeActive = displayModeButtonElement.dataset.cameraDisplayMode === displayMode;
    displayModeButtonElement.classList.toggle("active", isDisplayModeActive);
    displayModeButtonElement.setAttribute("aria-pressed", String(isDisplayModeActive));
  }
  const refreshIntervalValue = Number(cameraProperties.refreshInterval);
  const refreshIntervalSeconds = Number.isFinite(refreshIntervalValue)
    ? Math.max(6, Math.round(refreshIntervalValue))
    : 10;
  cameraRefreshIntervalInputElement.value = String(refreshIntervalSeconds);
  cameraRefreshIntervalFieldElement.hidden = displayMode !== "snapshot";
  cameraRefreshIntervalInputElement.disabled = displayMode !== "snapshot";
  const fitMode = cameraProperties.fit === "contain" ? "contain" : "fill";
  for (const fitModeButtonElement of cameraFitOptionsElement.querySelectorAll(
    "[data-camera-fit]"
  )) {
    const isFitModeActive = fitModeButtonElement.dataset.cameraFit === fitMode;
    fitModeButtonElement.classList.toggle("active", isFitModeActive);
    fitModeButtonElement.setAttribute("aria-pressed", String(isFitModeActive));
  }
  setInspectorToggle(cameraFrameVisibleButtonElement, cameraProperties.frameVisible !== false);
  cameraFrameColorInputElement.value = cameraProperties.frameColor || "#d4d4d4";
  cameraFrameWidthInputElement.value = roundField(Number(cameraProperties.frameWidth ?? 1));
  const cornerRadiusValue = Number(cameraProperties.radius ?? 0.04);
  cameraRadiusInputElement.value = roundField(
    clampNumber(cornerRadiusValue > 0.5 ? cornerRadiusValue : cornerRadiusValue * 100, 0, 50)
  );
  cameraFrameAngleInputElement.value = roundField(Number(cameraProperties.frameAngle ?? 45));
  cameraFrameOpacityInputElement.value = roundField(
    Number(cameraProperties.frameOpacity ?? 0.9) * 100
  );
  cameraLeftInputElement.value = roundField(
    clampNumber(
      ((Number(cameraPosition.x || 0) + cameraWidthPx / 2) / cameraCanvasWidthPx) * 100,
      0,
      100
    )
  );
  cameraTopInputElement.value = roundField(
    clampNumber(
      ((Number(cameraPosition.y || 0) + cameraHeightPx / 2) / cameraCanvasHeightPx) * 100,
      0,
      100
    )
  );
  cameraWidthInputElement.value = roundField((cameraWidthPx / cameraCanvasWidthPx) * 100);
  cameraHeightInputElement.value = roundField((cameraHeightPx / cameraCanvasHeightPx) * 100);
  cameraScaleInputElement.value = roundField(Number(cameraComponent.style?.scale || 1) * 100);
  cameraRotationInputElement.value = roundField(Number(cameraPosition.rotation || 0));
  const isCameraMultiSelection = selectedComponentIds.size > 1;
  cameraWidthInputElement.disabled = isCameraMultiSelection;
  cameraHeightInputElement.disabled = isCameraMultiSelection;
  cameraRotationInputElement.disabled = false;
  cameraScaleInputElement.disabled = false;
  const cameraReplaceableCount = findReplaceableComponents(cameraComponent).length;
  const cameraApplyTargetCount = collectCameraChangedProperties(cameraComponent).length;
  cameraApplyStyleButtonElement.disabled = !cameraReplaceableCount || !cameraApplyTargetCount;
  cameraApplyCountElement.textContent = cameraApplyTargetCount + " 项修改";
  cameraApplyStyleButtonElement.textContent = "一键应用到同类型控件";
  const componentWithTapAction = Object.prototype.hasOwnProperty.call(
    cameraComponent.actions || {},
    "tap"
  )
    ? cameraComponent
    : {
        ...cameraComponent,
        actions: {
          tap: {
            type: "more-info",
            data: {
              popupSource: "current"
            }
          },
          ...(cameraComponent.actions || {})
        }
      };
  syncComponentActionControls(componentWithTapAction, cameraActionControlsElement);
}
/**
 * 把空调组件的当前值回填到检查器。设备类型只认 air-conditioner / bath-heater 两种，其余（含历史文档缺失）回落 "auto"；
 * 预览按钮文案随类型变化，未绑定实体时禁用（取不到实时状态，预览无意义）。颜色字段都给了内置默认色保证老文档也可见；
 * 透明度、徽标尺寸等内部为小数/像素，界面按百分比或原值显示。
 */
function syncAirConditionerInspector(airConditionerComponent) {
  const airConditionerProperties = airConditionerComponent.properties || {};
  const airConditionerPosition = airConditionerComponent.position || {};
  const airConditionerCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const airConditionerCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const airConditionerWidthPx = Number(airConditionerPosition.width || 100);
  const airConditionerHeightPx = Number(airConditionerPosition.height || 100);
  airConditionerLabelTextInputElement.value = airConditionerProperties.label || "";
  const deviceTypeValue = ["air-conditioner", "bath-heater"].includes(
    airConditionerProperties.deviceType
  )
    ? airConditionerProperties.deviceType
    : "auto";
  for (const deviceTypeButtonElement of airConditionerDeviceTypeElement.querySelectorAll(
    "[data-air-conditioner-device-type]"
  )) {
    const isDeviceTypeActive =
      deviceTypeButtonElement.dataset.airConditionerDeviceType === deviceTypeValue;
    deviceTypeButtonElement.classList.toggle("active", isDeviceTypeActive);
    deviceTypeButtonElement.setAttribute("aria-pressed", String(isDeviceTypeActive));
  }
  airConditionerPreviewDetailsButtonElement.textContent =
    deviceTypeValue === "bath-heater" ? "预览浴霸详情" : "预览空调 / 浴霸详情";
  syncEntityPickerValue(airConditionerComponent);
  airConditionerPreviewDetailsButtonElement.disabled =
    !airConditionerComponent.bindings?.entity?.entityId;
  airConditionerIconOffColorInputElement.value = airConditionerProperties.iconOffColor || "#9aa5ad";
  airConditionerIconOnColorInputElement.value =
    airConditionerProperties.iconOnColor || paletteColor("--hos-cool", "#58c4ff");
  airConditionerBadgeColorInputElement.value = airConditionerProperties.badgeColor || "#5b5e66";
  airConditionerBadgeOpacityInputElement.value = roundField(
    Number(airConditionerProperties.badgeOpacity ?? 0.58) * 100
  );
  airConditionerSymbolSizeInputElement.value = roundField(
    Number(airConditionerProperties.symbolSize ?? 14)
  );
  airConditionerBadgeSizeInputElement.value = roundField(
    Number(airConditionerProperties.badgeSize ?? 28)
  );
  airConditionerIconLeftInputElement.value = roundField(
    Number(airConditionerProperties.iconLeft ?? 20)
  );
  airConditionerIconTopInputElement.value = roundField(
    Number(airConditionerProperties.iconTop ?? 50)
  );
  setInspectorToggle(
    airConditionerIconVisibleButtonElement,
    airConditionerProperties.iconVisible !== false
  );
  airConditionerMainTextInputElement.value = airConditionerProperties.mainText || "";
  airConditionerMainColorInputElement.value = airConditionerProperties.mainColor || "#c7c8cb";
  airConditionerMainSizeInputElement.value = roundField(
    Number(airConditionerProperties.mainSize ?? 21)
  );
  airConditionerMainWeightInputElement.value = roundField(
    normalizedFontWeight(airConditionerProperties.mainWeight, 0.24)
  );
  airConditionerMainSpacingInputElement.value = roundField(
    Number(airConditionerProperties.mainSpacing ?? 0.5)
  );
  airConditionerMainLeftInputElement.value = roundField(
    Number(airConditionerProperties.mainTextLeft ?? 39)
  );
  airConditionerMainTopInputElement.value = roundField(
    Number(airConditionerProperties.mainTextTop ?? 40)
  );
  setInspectorToggle(
    airConditionerMainVisibleButtonElement,
    airConditionerProperties.mainTextVisible !== false
  );
  airConditionerSecondaryTextInputElement.value = airConditionerProperties.secondaryText || "";
  airConditionerSecondaryColorInputElement.value =
    airConditionerProperties.secondaryColor || "#75777d";
  airConditionerSecondarySizeInputElement.value = roundField(
    Number(airConditionerProperties.secondarySize ?? 12)
  );
  airConditionerSecondaryWeightInputElement.value = roundField(
    normalizedFontWeight(airConditionerProperties.secondaryWeight, 0.12)
  );
  airConditionerSecondarySpacingInputElement.value = roundField(
    Number(airConditionerProperties.secondarySpacing ?? 0.3)
  );
  airConditionerSecondaryLeftInputElement.value = roundField(
    Number(airConditionerProperties.secondaryTextLeft ?? 39)
  );
  airConditionerSecondaryTopInputElement.value = roundField(
    Number(airConditionerProperties.secondaryTextTop ?? 67)
  );
  setInspectorToggle(
    airConditionerSecondaryVisibleButtonElement,
    airConditionerProperties.secondaryTextVisible !== false
  );
  setInspectorToggle(
    airConditionerAirflowVisibleButtonElement,
    airConditionerProperties.airflowVisible !== false
  );
  const airflowMotionMode =
    airConditionerProperties.airflowMotion === "static" ? "static" : "dynamic";
  for (const airflowMotionButtonElement of airConditionerAirflowMotionElement.querySelectorAll(
    "[data-airflow-motion]"
  )) {
    const isAirflowMotionActive =
      airflowMotionButtonElement.dataset.airflowMotion === airflowMotionMode;
    airflowMotionButtonElement.classList.toggle("active", isAirflowMotionActive);
    airflowMotionButtonElement.setAttribute("aria-pressed", String(isAirflowMotionActive));
  }
  airConditionerAirflowCoolColorInputElement.value =
    airConditionerProperties.airflowCoolColor || paletteColor("--hos-cool", "#58c4ff");
  airConditionerAirflowHeatColorInputElement.value =
    airConditionerProperties.airflowHeatColor || paletteColor("--hos-heat", "#ff8a65");
  airConditionerAirflowOtherColorInputElement.value =
    airConditionerProperties.airflowOtherColor || AIRFLOW_OTHER_COLOR;
  airConditionerAirflowAngleInputElement.value = roundField(
    Number(airConditionerProperties.airflowAngle ?? 7)
  );
  airConditionerAirflowCurveInputElement.value = roundField(
    Number(airConditionerProperties.airflowCurve ?? 20)
  );
  airConditionerAirflowLengthInputElement.value = roundField(
    Number(airConditionerProperties.airflowLength ?? 200)
  );
  airConditionerAirflowFadeInputElement.value = roundField(
    Number(airConditionerProperties.airflowFadePosition ?? 50)
  );
  airConditionerAirflowSpreadInputElement.value = roundField(
    Number(airConditionerProperties.airflowSpread ?? 100)
  );
  airConditionerAirflowDensityInputElement.value = roundField(
    Number(airConditionerProperties.airflowDensity ?? 60)
  );
  airConditionerAirflowIrregularityInputElement.value = roundField(
    Number(airConditionerProperties.airflowIrregularity ?? 50)
  );
  airConditionerAirflowThicknessInputElement.value = roundField(
    Number(airConditionerProperties.airflowThickness ?? 40)
  );
  airConditionerAirflowStrengthInputElement.value = roundField(
    Number(airConditionerProperties.airflowStrength ?? 200)
  );
  airConditionerAirflowBlurInputElement.value = roundField(
    Number(airConditionerProperties.airflowBlur ?? 6)
  );
  airConditionerAirflowSpeedInputElement.value = roundField(
    Number(airConditionerProperties.airflowSpeed ?? 1)
  );
  airConditionerAirflowSpeedInputElement.disabled = airflowMotionMode === "static";
  const airflowOffsetLimits = airflowCanvasOffsetBounds(
    airConditionerComponent,
    activeProject.document.canvas
  );
  airConditionerAirflowOffsetXInputElement.min = String(roundField(airflowOffsetLimits.minX));
  airConditionerAirflowOffsetXInputElement.max = String(roundField(airflowOffsetLimits.maxX));
  airConditionerAirflowOffsetYInputElement.min = String(roundField(airflowOffsetLimits.minY));
  airConditionerAirflowOffsetYInputElement.max = String(roundField(airflowOffsetLimits.maxY));
  airConditionerAirflowOffsetXInputElement.value = roundField(
    Number(airConditionerProperties.airflowOffsetX ?? -75)
  );
  airConditionerAirflowOffsetYInputElement.value = roundField(
    Number(airConditionerProperties.airflowOffsetY ?? 34)
  );
  airConditionerAirflowWidthInputElement.value = roundField(
    Number(airConditionerProperties.airflowWidth ?? 64)
  );
  airConditionerAirflowHeightInputElement.value = roundField(
    Number(airConditionerProperties.airflowHeight ?? 125)
  );
  airConditionerAirflowScaleInputElement.value = roundField(
    Number(airConditionerProperties.airflowScale ?? 1) * 100
  );
  airConditionerAirflowRotationInputElement.value = roundField(
    Number(airConditionerProperties.airflowRotation ?? -3)
  );
  airConditionerLeftInputElement.value = roundField(
    clampNumber(
      ((Number(airConditionerPosition.x || 0) + airConditionerWidthPx / 2) /
        airConditionerCanvasWidthPx) *
        100,
      0,
      100
    )
  );
  airConditionerTopInputElement.value = roundField(
    clampNumber(
      ((Number(airConditionerPosition.y || 0) + airConditionerHeightPx / 2) /
        airConditionerCanvasHeightPx) *
        100,
      0,
      100
    )
  );
  airConditionerWidthInputElement.value = roundField(
    (airConditionerWidthPx / airConditionerCanvasWidthPx) * 100
  );
  airConditionerHeightInputElement.value = roundField(
    (airConditionerHeightPx / airConditionerCanvasHeightPx) * 100
  );
  airConditionerScaleInputElement.value = roundField(
    Number(airConditionerComponent.style?.scale || 1) * 100
  );
  airConditionerRotationInputElement.value = roundField(
    Number(airConditionerPosition.rotation || 0)
  );
  const activeLayerName =
    airConditionerLayerByComponentId.get(airConditionerComponent.id) === "airflow"
      ? "airflow"
      : "button";
  if (!airConditionerPreviewStateByComponentId.has(airConditionerComponent.id)) {
    const layerPreviewState = activeLayerName === "airflow" ? "on" : "off";
    airConditionerPreviewStateByComponentId.set(airConditionerComponent.id, layerPreviewState);
    editorRenderer?.setComponentPreviewState(airConditionerComponent.id, layerPreviewState);
  }
  const airConditionerPreviewState =
    airConditionerPreviewStateByComponentId.get(airConditionerComponent.id) || "auto";
  for (const acPreviewStateButtonElement of airConditionerPreviewStateElement.querySelectorAll(
    "[data-air-conditioner-preview]"
  )) {
    const isAcPreviewStateActive =
      acPreviewStateButtonElement.dataset.airConditionerPreview === airConditionerPreviewState;
    acPreviewStateButtonElement.classList.toggle("active", isAcPreviewStateActive);
    acPreviewStateButtonElement.setAttribute("aria-pressed", String(isAcPreviewStateActive));
  }
  editorRenderer?.setComponentSelectionLayer(airConditionerComponent.id, activeLayerName);
  for (const layerOptionElement of airConditionerLayerOptionsElement.querySelectorAll(
    "[data-air-conditioner-layer]"
  )) {
    const isLayerSelected = layerOptionElement.dataset.airConditionerLayer === activeLayerName;
    layerOptionElement.classList.toggle("active", isLayerSelected);
    layerOptionElement.setAttribute("aria-pressed", String(isLayerSelected));
  }
  const isAirflowLayer = activeLayerName === "airflow";
  airConditionerButtonSectionElement.hidden = isAirflowLayer;
  airConditionerTransformSectionElement.hidden = isAirflowLayer;
  airConditionerActionSectionElement.hidden = isAirflowLayer;
  airConditionerAirflowSectionElement.hidden = !isAirflowLayer;
  const isAirConditionerMultiSelection = selectedComponentIds.size > 1;
  for (const acSizeInputElement of [
    airConditionerWidthInputElement,
    airConditionerHeightInputElement
  ]) {
    acSizeInputElement.disabled = isAirConditionerMultiSelection;
  }
  airConditionerRotationInputElement.disabled = false;
  airConditionerScaleInputElement.disabled = false;
  const airConditionerReplaceableCount = findReplaceableComponents(airConditionerComponent).length;
  const airConditionerApplyTargetCount =
    collectAirConditionerChangedProperties(airConditionerComponent).length;
  airConditionerApplyStyleButtonElement.disabled =
    !airConditionerReplaceableCount || !airConditionerApplyTargetCount;
  airConditionerApplyCountElement.textContent = airConditionerApplyTargetCount + " 项修改";
  syncComponentActionControls(airConditionerComponent, airConditionerActionControlsElement);
}
/**
 * 把扫地机地图组件的当前值回填到检查器（文案 / 透明度 / 中心位置 / 缩放 / 旋转）。位置存左上角像素而检查器展示中心点百分比，
 * 故 x/y 各加半个自身尺寸后再除以画布尺寸；透明度与缩放内部是 0~1 小数，界面乘 100 显示。最后两行强制解除缩放与旋转
 * 输入框的禁用——真空地图这两项始终可编辑，而上一轮同步别的组件类型时可能把它们锁上了。
 */
function syncVacuumMapInspector(vacuumMapComponent) {
  const vacuumMapProperties = vacuumMapComponent.properties || {};
  const vacuumMapPosition = vacuumMapComponent.position || {};
  const vacuumMapCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const vacuumMapCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const vacuumMapWidthPx = Number(vacuumMapPosition.width || 100);
  const vacuumMapHeightPx = Number(vacuumMapPosition.height || 100);
  vacuumMapLabelTextInputElement.value = vacuumMapProperties.label || "";
  syncEntityPickerValue(vacuumMapComponent);
  vacuumMapOpacityInputElement.value = roundField(Number(vacuumMapProperties.opacity ?? 0.5) * 100);
  vacuumMapLeftInputElement.value = roundField(
    clampNumber(
      ((Number(vacuumMapPosition.x || 0) + vacuumMapWidthPx / 2) / vacuumMapCanvasWidthPx) * 100,
      0,
      100
    )
  );
  vacuumMapTopInputElement.value = roundField(
    clampNumber(
      ((Number(vacuumMapPosition.y || 0) + vacuumMapHeightPx / 2) / vacuumMapCanvasHeightPx) * 100,
      0,
      100
    )
  );
  vacuumMapScaleInputElement.value = roundField(Number(vacuumMapComponent.style?.scale || 1) * 100);
  vacuumMapRotationInputElement.value = roundField(Number(vacuumMapPosition.rotation || 0));
  vacuumMapRotationInputElement.disabled = false;
  vacuumMapScaleInputElement.disabled = false;
}
/**
 * 同步窗帘设置区（类型 / 开合方向 / 电机方向）。三组枚举一律先做白名单过滤，非法或缺失值回落 "auto"
 * （历史文档里可能没有这些字段）。该区是独立于各检查器表单的复用 DOM，所以每次同步都要 insertAdjacentElement
 * 把它挪到当前可见检查器小节的后面，否则切换组件类型后它会停留在上一个组件的位置、甚至跑进隐藏表单里。
 */
function syncCoverSettingsInspector(coverComponent) {
  const visibleInspectorSection = [
    imageInspectorFormElement,
    iconButtonEffectInspectorFormElement,
    titleButtonInspectorFormElement,
    iconButtonInspectorFormElement,
    vacuumMapInspectorFormElement,
    cameraInspectorFormElement,
    airConditionerInspectorFormElement,
    timeInspectorFormElement,
    dateInspectorFormElement,
    weatherInspectorFormElement,
    lineChartInspectorFormElement,
    panelFrameInspectorFormElement,
    navigationInspectorFormElement
  ]
    .find(inspectorForm => inspectorForm && !inspectorForm.hidden)
    ?.querySelector(":scope > .inspector-section");
  if (
    visibleInspectorSection &&
    visibleInspectorSection.nextElementSibling !== coverSettingsInspectorElement
  ) {
    visibleInspectorSection.insertAdjacentElement("afterend", coverSettingsInspectorElement);
  }
  const coverProperties = coverComponent.properties || {};
  const coverKindValue = ["standard", "dream", "airer"].includes(coverProperties.coverKind)
    ? coverProperties.coverKind
    : "auto";
  for (const coverKindButtonElement of coverSettingsKindElement.querySelectorAll(
    "[data-cover-kind]"
  )) {
    const isCoverKindActive = coverKindButtonElement.dataset.coverKind === coverKindValue;
    coverKindButtonElement.classList.toggle("active", isCoverKindActive);
    coverKindButtonElement.setAttribute("aria-pressed", String(isCoverKindActive));
  }
  const coverDirectionValue = ["left", "right"].includes(coverProperties.coverDirection)
    ? coverProperties.coverDirection
    : "split";
  for (const coverDirectionButtonElement of coverSettingsDirectionElement.querySelectorAll(
    "[data-cover-direction]"
  )) {
    const isCoverDirectionActive =
      coverDirectionButtonElement.dataset.coverDirection === coverDirectionValue;
    coverDirectionButtonElement.classList.toggle("active", isCoverDirectionActive);
    coverDirectionButtonElement.setAttribute("aria-pressed", String(isCoverDirectionActive));
  }
  const coverMotorDirectionValue = ["normal", "reversed"].includes(
    coverProperties.coverMotorDirection
  )
    ? coverProperties.coverMotorDirection
    : "auto";
  for (const coverMotorButtonElement of coverSettingsMotorDirectionElement.querySelectorAll(
    "[data-cover-motor-direction]"
  )) {
    const isCoverMotorActive =
      coverMotorButtonElement.dataset.coverMotorDirection === coverMotorDirectionValue;
    coverMotorButtonElement.classList.toggle("active", isCoverMotorActive);
    coverMotorButtonElement.setAttribute("aria-pressed", String(isCoverMotorActive));
  }
}
/**
 * 把当前选中组件的全部状态同步到右侧检查器（编辑器核心刷新入口）：按类型分发到各 sync*Inspector 回填，
 * 对未选中类型清掉它的预览态（否则切走后画布上还留着临时预览），再统一处理只读属性、动作区与多选态。
 * 开头用 requestAnimationFrame 安排 syncOpenColorPicker（取色器定位依赖布局完成后的坐标）；3D 交互组件走 renderInteraction3dInspector。
 */
function syncInspector() {
  window.requestAnimationFrame(syncOpenColorPicker);
  const inspectedComponent = selectedComponent();
  const isImageComponent = inspectedComponent?.type === "image";
  const isInteraction3dComponent = inspectedComponent?.type === "interaction3d";
  renderInteraction3dInspector(inspectorElement, inspectedComponent, {
    document: activeProject?.document,
    entities: entities,
    states: editorRenderer?.states,
    pickers: editorPickers,
    enhanceControls: controlsRoot => {
      enhanceNativeSelectsIn(controlsRoot);
      enhanceColorInputsIn(controlsRoot);
      enhanceNumberInputsIn(controlsRoot);
    },
    prepareCanvas: () => {
      const activeProjectComponent = findComponent(activeProject?.document, inspectedComponent.id);
      if (!activeProjectComponent) {
        throw new Error("3D 控件已不存在。");
      }
      const componentPagePath = activeProjectComponent.page?.path || pageSelectElement.value;
      const needsEditMode =
        editorMode !== "edit" || editorRenderer?.page?.path !== componentPagePath;
      pageSelectElement.value = componentPagePath;
      syncCustomSelect(pageSelectElement);
      if (needsEditMode) {
        setEditorMode("edit");
      }
      renderComponentLists();
      syncRendererSelection();
    },
    onError: handleOperationError,
    onChange: (changes, { replaceProperties: shouldReplaceProperties = false } = {}) =>
      mutateDocument(
        inspectorDraft => {
          const updatedComponent = findComponent(inspectorDraft, inspectedComponent.id)?.component;
          if (!updatedComponent || updatedComponent.type !== "interaction3d") {
            throw new Error("3D 控件已不存在。");
          }
          for (const [changedPropertyKey, propertyValue] of Object.entries(changes)) {
            updatedComponent[changedPropertyKey] =
              changedPropertyKey === "properties" && shouldReplaceProperties
                ? propertyValue
                : {
                    ...updatedComponent[changedPropertyKey],
                    ...propertyValue
                  };
          }
        },
        pageSelectElement.value,
        {
          throwOnError: true
        }
      )
  });
  const isFloorplanAutoDiagram = inspectedComponent?.type === "floorplan-auto-diagram";
  const isIconButtonEffect = inspectedComponent?.type === "icon-button-effect";
  const isTitleButton = inspectedComponent?.type === "title-button";
  const isLightStatisticsComponent = inspectedComponent?.type === "light-statistics";
  const isIconButtonLike = ["icon-button", "device-button", "presence-sensor"].includes(
    inspectedComponent?.type
  );
  const isVacuumMap = inspectedComponent?.type === "vacuum-map";
  const isCamera = inspectedComponent?.type === "camera";
  const isAirConditioner = inspectedComponent?.type === "air-conditioner";
  const isTime = inspectedComponent?.type === "time";
  const isDate = inspectedComponent?.type === "date";
  const isWeather = inspectedComponent?.type === "weather";
  const isLineChart = inspectedComponent?.type === "line-chart";
  const isPanelFrame = inspectedComponent?.type === "panel-frame";
  const isNavigationButton = inspectedComponent?.type === "navigation-button";
  const isGroup = inspectedComponent?.type === "group";
  for (const staleNavigationPreviewId of [...navigationPreviewStateByComponentId.keys()]) {
    if (!isNavigationButton || staleNavigationPreviewId !== inspectedComponent.id) {
      navigationPreviewStateByComponentId.delete(staleNavigationPreviewId);
      editorRenderer?.setComponentPreviewState(staleNavigationPreviewId, "auto");
    }
  }
  for (const staleEffectPreviewId of [...iconButtonEffectPreviewStateByComponentId.keys()]) {
    if (!isIconButtonEffect || staleEffectPreviewId !== inspectedComponent.id) {
      iconButtonEffectPreviewStateByComponentId.delete(staleEffectPreviewId);
      editorRenderer?.setComponentPreviewState(staleEffectPreviewId, "auto");
    }
  }
  for (const staleIconPreviewId of [...iconButtonPreviewStateByComponentId.keys()]) {
    if (!isIconButtonLike || staleIconPreviewId !== inspectedComponent.id) {
      iconButtonPreviewStateByComponentId.delete(staleIconPreviewId);
      editorRenderer?.setComponentPreviewState(staleIconPreviewId, "auto");
    }
  }
  for (const staleAirConditionerPreviewId of [...airConditionerPreviewStateByComponentId.keys()]) {
    if (!isAirConditioner || staleAirConditionerPreviewId !== inspectedComponent.id) {
      airConditionerPreviewStateByComponentId.delete(staleAirConditionerPreviewId);
      editorRenderer?.setComponentPreviewState(staleAirConditionerPreviewId, "auto");
    }
  }
  const hasInspector =
    isInteraction3dComponent ||
    isGroup ||
    isImageComponent ||
    isFloorplanAutoDiagram ||
    isIconButtonEffect ||
    isTitleButton ||
    isLightStatisticsComponent ||
    isIconButtonLike ||
    isVacuumMap ||
    isCamera ||
    isAirConditioner ||
    isTime ||
    isDate ||
    isWeather ||
    isLineChart ||
    isPanelFrame ||
    isNavigationButton;
  inspectorEmptyElement.hidden = hasInspector;
  if (isGroup) {
    inspectorEmptyElement.querySelector("p").textContent =
      "组合支持整体移动、复制、旋转和缩放；双击组合可进入组内编辑。";
  }
  imageInspectorFormElement.hidden = !isImageComponent;
  floorplanAutoDiagramInspectorFormElement.hidden = !isFloorplanAutoDiagram;
  iconButtonEffectInspectorFormElement.hidden = !isIconButtonEffect;
  titleButtonInspectorFormElement.hidden = !isTitleButton;
  lightStatisticsInspectorFormElement.hidden = !isLightStatisticsComponent;
  iconButtonInspectorFormElement.hidden = !isIconButtonLike;
  vacuumMapInspectorFormElement.hidden = !isVacuumMap;
  cameraInspectorFormElement.hidden = !isCamera;
  airConditionerInspectorFormElement.hidden = !isAirConditioner;
  timeInspectorFormElement.hidden = !isTime;
  dateInspectorFormElement.hidden = !isDate;
  weatherInspectorFormElement.hidden = !isWeather;
  lineChartInspectorFormElement.hidden = !isLineChart;
  panelFrameInspectorFormElement.hidden = !isPanelFrame;
  navigationInspectorFormElement.hidden = !isNavigationButton;
  const isCoverEntity = String(inspectedComponent?.bindings?.entity?.entityId || "").startsWith(
    "cover."
  );
  coverSettingsInspectorElement.hidden = !hasInspector || !isCoverEntity;
  if (!hasInspector) {
    closeAllDropdownMenus();
    inspectorEmptyElement.querySelector("p").textContent = inspectedComponent
      ? "“" + componentLabel(inspectedComponent) + "”的专属属性尚未实现。"
      : "选择一个控件开始编辑。";
    return;
  }
  if (isCoverEntity) {
    syncCoverSettingsInspector(inspectedComponent);
  }
  if (isFloorplanAutoDiagram) {
    const diagramProperties = inspectedComponent.properties || {};
    const diagramPosition = inspectedComponent.position || {};
    const diagramCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
    const diagramCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
    const diagramWidthPx = Number(diagramPosition.width || 100);
    const diagramHeightPx = Number(diagramPosition.height || 100);
    const lightLayerCount = Array.isArray(diagramProperties.lightLayers)
      ? diagramProperties.lightLayers.length
      : 0;
    const isPreviewReady =
      diagramProperties.previewReady === true &&
      (diagramProperties.generated !== true || diagramProperties.previewing === true);
    floorplanAutoDiagramStatusElement.textContent = diagramProperties.generating
      ? "正在后台生成底图和灯组效果，请稍候…"
      : diagramProperties.generated && lightLayerCount
        ? "已生成导图，包含 " + lightLayerCount + " 个灯组。"
        : isPreviewReady
          ? "3D画面已置入仪表盘，请先确定位置、大小和视角。"
          : "尚未载入3D画面。";
    floorplanAutoDiagramViewToggleButtonElement.hidden = !isPreviewReady;
    const isViewMode = diagramProperties.interactionMode === "view";
    floorplanAutoDiagramViewToggleButtonElement.classList.toggle("active", isViewMode);
    floorplanAutoDiagramViewToggleButtonElement.setAttribute("aria-pressed", String(isViewMode));
    floorplanAutoDiagramViewToggleButtonElement.textContent = isViewMode
      ? "完成3D视角调整"
      : "调整3D视角";
    floorplanAutoDiagramLabelTextInputElement.value =
      diagramProperties.label || diagramProperties.instanceName || "";
    floorplanAutoDiagramFolderTextInputElement.value = diagramProperties.exportFolder || "";
    const diagramLayoutMode = diagramProperties.layoutMode === "fill" ? "fill" : "free";
    for (const layoutOptionElement of floorplanAutoDiagramLayoutElement.querySelectorAll(
      "[data-floorplan-layout]"
    )) {
      const isLayoutOptionActive =
        layoutOptionElement.dataset.floorplanLayout === diagramLayoutMode;
      layoutOptionElement.classList.toggle("active", isLayoutOptionActive);
      layoutOptionElement.setAttribute("aria-pressed", String(isLayoutOptionActive));
    }
    floorplanAutoDiagramLeftInputElement.value = roundField(
      clampNumber(
        ((Number(diagramPosition.x || 0) + diagramWidthPx / 2) / diagramCanvasWidthPx) * 100,
        0,
        100
      )
    );
    floorplanAutoDiagramTopInputElement.value = roundField(
      clampNumber(
        ((Number(diagramPosition.y || 0) + diagramHeightPx / 2) / diagramCanvasHeightPx) * 100,
        0,
        100
      )
    );
    floorplanAutoDiagramWidthInputElement.value = roundField(
      (diagramWidthPx / diagramCanvasWidthPx) * 100
    );
    floorplanAutoDiagramHeightInputElement.value = roundField(
      (diagramHeightPx / diagramCanvasHeightPx) * 100
    );
    floorplanAutoDiagramScaleInputElement.value = roundField(
      Number(inspectedComponent.style?.scale || 1) * 100
    );
    floorplanAutoDiagramRotationInputElement.value = roundField(
      Number(diagramPosition.rotation || 0)
    );
    const diagramState = floorplanAutoDiagramStateByComponentId.get(inspectedComponent.id);
    const diagramFloors = Array.isArray(diagramState?.floors) ? diagramState.floors : [];
    const selectedFloorId =
      String(diagramProperties.floorSelection || "") || String(diagramState?.selected || "");
    if (diagramFloors.length) {
      const floorOptionElements = diagramFloors.map(floor =>
        Object.assign(document.createElement("option"), {
          value: floor.id,
          textContent: floor.name
        })
      );
      if (diagramFloors.length > 1) {
        floorOptionElements.unshift(
          Object.assign(document.createElement("option"), {
            value: "all",
            textContent: "全楼"
          })
        );
      }
      floorplanAutoDiagramFloorSelectElement.replaceChildren(...floorOptionElements);
      floorplanAutoDiagramFloorSelectElement.value = floorOptionElements.some(
        floorOption => floorOption.value === selectedFloorId
      )
        ? selectedFloorId
        : floorOptionElements[0].value;
    } else {
      floorplanAutoDiagramFloorSelectElement.replaceChildren(
        Object.assign(document.createElement("option"), {
          value: "",
          textContent: isPreviewReady ? "正在读取楼层…" : "载入3D画面后选择"
        })
      );
    }
    floorplanAutoDiagramFloorSelectElement.disabled =
      !isPreviewReady || diagramFloors.length === 0 || diagramProperties.generating === true;
    const cameraViewMode = diagramProperties.cameraView === "top" ? "top" : "free";
    const cameraModeValue =
      diagramProperties.cameraMode === "perspective" ? "perspective" : "orthographic";
    for (const cameraViewButtonElement of floorplanAutoDiagramCameraViewElement.querySelectorAll(
      "[data-floorplan-camera-view]"
    )) {
      const isCameraViewActive =
        cameraViewButtonElement.dataset.floorplanCameraView === cameraViewMode;
      cameraViewButtonElement.classList.toggle("active", isCameraViewActive);
      cameraViewButtonElement.setAttribute("aria-pressed", String(isCameraViewActive));
    }
    for (const cameraModeButtonElement of floorplanAutoDiagramCameraModeElement.querySelectorAll(
      "[data-floorplan-camera-mode]"
    )) {
      const isCameraModeActive =
        cameraModeButtonElement.dataset.floorplanCameraMode === cameraModeValue;
      cameraModeButtonElement.classList.toggle("active", isCameraModeActive);
      cameraModeButtonElement.setAttribute("aria-pressed", String(isCameraModeActive));
    }
    floorplanAutoDiagramFocalLengthInputElement.value = roundField(
      clampNumber(Number(diagramProperties.cameraFocalLength || 50), 18, 120)
    );
    floorplanAutoDiagramFocalLengthInputElement.disabled =
      cameraModeValue !== "perspective" || !isPreviewReady;
    floorplanAutoDiagramRotateTopButtonElement.disabled =
      cameraViewMode !== "top" || !isPreviewReady;
    floorplanAutoDiagramOpenBaseLightingButtonElement.disabled = !isPreviewReady;
    for (const diagramInputElement of [
      floorplanAutoDiagramLeftInputElement,
      floorplanAutoDiagramTopInputElement,
      floorplanAutoDiagramWidthInputElement,
      floorplanAutoDiagramHeightInputElement,
      floorplanAutoDiagramScaleInputElement,
      floorplanAutoDiagramRotationInputElement
    ]) {
      diagramInputElement.disabled = diagramLayoutMode === "fill";
    }
    floorplanAutoDiagramOpenStudioButtonElement.disabled = diagramProperties.generating === true;
    floorplanAutoDiagramOpenStudioButtonElement.textContent =
      diagramProperties.generated && !diagramProperties.previewing
        ? "重新调整位置和视角"
        : diagramProperties.generating
          ? "正在后台生成…"
          : isPreviewReady
            ? "确定位置大小并后台生成"
            : "载入3D画面";
    floorplanAutoDiagramBindingsElement.hidden = lightLayerCount === 0;
    const lightEntities = entities.filter(
      lightEntityRecord => entityDomainOf(lightEntityRecord) === "light"
    );
    /**
     * 为 3D 导图的每个灯组生成一行「灯组 → 灯实体」绑定下拉框。绑定键固定为 `lightGroup:<灯组 id>`，
     * 与文档 bindings 的键名约定一致；已绑定但当前目录里查不到的实体也补一个同名选项，避免回填时把绑定清掉。
     */
    const lightGroupRows = (diagramProperties.lightLayers || []).map(lightLayer => {
      const layerLabelElement = document.createElement("label");
      layerLabelElement.textContent = lightLayer.note || lightLayer.name || "灯组";
      const entitySelectElement = document.createElement("select");
      entitySelectElement.dataset.floorplanLightGroupId = lightLayer.id;
      const boundLightEntityId =
        inspectedComponent.bindings?.["lightGroup:" + lightLayer.id]?.entityId || "";
      const placeholderOptionElement = document.createElement("option");
      placeholderOptionElement.value = "";
      placeholderOptionElement.textContent = "选择实体";
      entitySelectElement.append(placeholderOptionElement);
      for (const lightEntity of lightEntities) {
        const entityOptionElement = document.createElement("option");
        entityOptionElement.value = lightEntity.entityId;
        entityOptionElement.textContent = entityOptionLabel(lightEntity);
        entitySelectElement.append(entityOptionElement);
      }
      if (
        boundLightEntityId &&
        !lightEntities.some(lightEntityOption => lightEntityOption.entityId === boundLightEntityId)
      ) {
        const missingEntityOptionElement = document.createElement("option");
        missingEntityOptionElement.value = boundLightEntityId;
        missingEntityOptionElement.textContent = boundLightEntityId;
        entitySelectElement.append(missingEntityOptionElement);
      }
      entitySelectElement.value = boundLightEntityId;
      layerLabelElement.append(entitySelectElement);
      return layerLabelElement;
    });
    floorplanAutoDiagramBindingListElement.replaceChildren(...lightGroupRows);
    return;
  }
  if (isIconButtonEffect) {
    const openMenuName = iconButtonEffectEntityMenuElement.hidden
      ? iconButtonEffectAssetMenuElement.hidden
        ? iconButtonEffectIconMenuElement.hidden
          ? null
          : "ibe-icon"
        : "ibe-asset"
      : "ibe-entity";
    closeAllDropdownMenus(openMenuName);
    const effectProperties = inspectedComponent.properties || {};
    const effectPosition = inspectedComponent.position || {};
    const effectCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
    const effectCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
    const effectWidthPx = Number(effectPosition.width || 100);
    const effectHeightPx = Number(effectPosition.height || 100);
    iconButtonEffectLabelTextInputElement.value = effectProperties.label || "";
    setInspectorToggle(
      iconButtonEffectButtonVisibleButtonElement,
      effectProperties.buttonVisible !== false
    );
    setInspectorToggle(
      iconButtonEffectEffectVisibleButtonElement,
      effectProperties.effectVisible !== false
    );
    iconButtonEffectColorTemperatureRealtimeCheckboxElement.checked =
      effectProperties.effectColorTemperatureRealtime !== false;
    iconButtonEffectBrightnessRealtimeCheckboxElement.checked =
      effectProperties.effectBrightnessRealtime !== false;
    for (const realtimeCheckboxElement of [
      iconButtonEffectColorTemperatureRealtimeCheckboxElement,
      iconButtonEffectBrightnessRealtimeCheckboxElement
    ]) {
      realtimeCheckboxElement.disabled = false;
      realtimeCheckboxElement.title = "";
      realtimeCheckboxElement.closest(".check-row")?.classList.remove("is-disabled");
    }
    syncEntityPickerValue(inspectedComponent);
    syncEffectAssetSelection(inspectedComponent);
    renderIconButtonEffectIconPreview(effectProperties.icon || "");
    iconButtonEffectIconOffColorInputElement.value = effectProperties.iconOffColor || "#9aa5ad";
    iconButtonEffectIconOnColorInputElement.value = effectProperties.iconOnColor || "#ffffff";
    iconButtonEffectIconSizeInputElement.value = roundField(
      Number(effectProperties.iconSize ?? 44)
    );
    iconButtonEffectButtonOffColorInputElement.value = effectProperties.buttonOffColor || "#17242d";
    iconButtonEffectButtonOnColorInputElement.value = effectProperties.buttonOnColor || "#1f91b8";
    iconButtonEffectButtonOpacityInputElement.value = roundField(
      Number(effectProperties.buttonOpacity ?? 0.92) * 100
    );
    iconButtonEffectFrameColorInputElement.value = effectProperties.frameColor || "#dcebf2";
    iconButtonEffectFrameWidthInputElement.value = roundField(
      Number(effectProperties.frameWidth ?? 1.5)
    );
    iconButtonEffectFrameOpacityInputElement.value = roundField(
      Number(effectProperties.frameOpacity ?? 0.72) * 100
    );
    iconButtonEffectRadiusInputElement.value = roundField(Number(effectProperties.radius ?? 50));
    iconButtonEffectGlowColorInputElement.value = effectProperties.glowColor || "#43c8f0";
    iconButtonEffectGlowOffStrengthInputElement.value = roundField(
      Number(effectProperties.glowOffStrength ?? 0) * 100
    );
    iconButtonEffectGlowOnStrengthInputElement.value = roundField(
      Number(effectProperties.glowOnStrength ?? 1) * 100
    );
    iconButtonEffectEffectOpacityInputElement.value = roundField(
      Number(effectProperties.effectOpacity ?? 1) * 100
    );
    iconButtonEffectEffectFadeDurationInputElement.value = roundField(
      Number(effectProperties.effectFadeDuration ?? 0.52)
    );
    iconButtonEffectEffectLeftInputElement.value = roundField(
      Number(effectProperties.effectLeft ?? 50)
    );
    iconButtonEffectEffectTopInputElement.value = roundField(
      Number(effectProperties.effectTop ?? 50)
    );
    iconButtonEffectEffectScaleInputElement.value = roundField(
      Number(effectProperties.effectScale ?? 1) * 100
    );
    iconButtonEffectEffectRotationInputElement.value = roundField(
      Number(effectProperties.effectRotation ?? 0)
    );
    iconButtonEffectLeftInputElement.value = roundField(
      clampNumber(
        ((Number(effectPosition.x || 0) + effectWidthPx / 2) / effectCanvasWidthPx) * 100,
        0,
        100
      )
    );
    iconButtonEffectTopInputElement.value = roundField(
      clampNumber(
        ((Number(effectPosition.y || 0) + effectHeightPx / 2) / effectCanvasHeightPx) * 100,
        0,
        100
      )
    );
    iconButtonEffectWidthInputElement.value = roundField(
      (effectWidthPx / effectCanvasWidthPx) * 100
    );
    iconButtonEffectHeightInputElement.value = roundField(
      (effectHeightPx / effectCanvasHeightPx) * 100
    );
    iconButtonEffectScaleInputElement.value = roundField(
      Number(inspectedComponent.style?.scale || 1) * 100
    );
    iconButtonEffectRotationInputElement.value = roundField(Number(effectPosition.rotation || 0));
    const isEffectMultiSelection = selectedComponentIds.size > 1;
    iconButtonEffectWidthInputElement.disabled = isEffectMultiSelection;
    iconButtonEffectHeightInputElement.disabled = isEffectMultiSelection;
    iconButtonEffectScaleInputElement.disabled = false;
    iconButtonEffectRotationInputElement.disabled = false;
    const effectLayoutMode = effectProperties.effectLayoutMode === "fill" ? "fill" : "free";
    for (const effectLayoutOptionElement of iconButtonEffectEffectLayoutOptionsElement.querySelectorAll(
      "[data-ibe-layout]"
    )) {
      const isEffectLayoutActive = effectLayoutOptionElement.dataset.ibeLayout === effectLayoutMode;
      effectLayoutOptionElement.classList.toggle("active", isEffectLayoutActive);
      effectLayoutOptionElement.setAttribute("aria-pressed", String(isEffectLayoutActive));
    }
    for (const effectSizeInputElement of [
      iconButtonEffectEffectLeftInputElement,
      iconButtonEffectEffectTopInputElement,
      iconButtonEffectEffectScaleInputElement,
      iconButtonEffectEffectRotationInputElement
    ]) {
      effectSizeInputElement.disabled = effectLayoutMode === "fill";
    }
    const effectNaturalSize = readEffectNaturalSize(effectProperties);
    iconButtonEffectEffectSizeHintElement.textContent = effectNaturalSize
      ? "原始尺寸：" +
        roundField(effectNaturalSize.width) +
        " × " +
        roundField(effectNaturalSize.height) +
        "；仅支持等比缩放。"
      : "效果图片将按原始尺寸等比缩放。";
    const effectLayerName = iconButtonEffectInspectorLayer(
      inspectedComponent,
      iconButtonEffectLayerByComponentId.get(inspectedComponent.id)
    );
    editorRenderer?.setComponentSelectionLayer(inspectedComponent.id, effectLayerName);
    if (!iconButtonEffectPreviewStateByComponentId.has(inspectedComponent.id)) {
      iconButtonEffectPreviewStateByComponentId.set(inspectedComponent.id, "on");
      editorRenderer?.setComponentPreviewState(inspectedComponent.id, "on");
    }
    const effectPreviewState =
      iconButtonEffectPreviewStateByComponentId.get(inspectedComponent.id) || "auto";
    for (const effectPreviewStateButtonElement of iconButtonEffectPreviewStateElement.querySelectorAll(
      "[data-ibe-preview]"
    )) {
      const isEffectPreviewActive =
        effectPreviewStateButtonElement.dataset.ibePreview === effectPreviewState;
      effectPreviewStateButtonElement.classList.toggle("active", isEffectPreviewActive);
      effectPreviewStateButtonElement.setAttribute("aria-pressed", String(isEffectPreviewActive));
    }
    for (const effectLayerOptionElement of iconButtonEffectLayerOptionsElement.querySelectorAll(
      "[data-ibe-layer]"
    )) {
      const isEffectLayerSelected = effectLayerOptionElement.dataset.ibeLayer === effectLayerName;
      effectLayerOptionElement.classList.toggle("active", isEffectLayerSelected);
      effectLayerOptionElement.setAttribute("aria-pressed", String(isEffectLayerSelected));
    }
    const isEffectLayer = effectLayerName === "effect";
    iconButtonEffectButtonSectionElement.hidden = isEffectLayer;
    iconButtonEffectButtonTransformSectionElement.hidden = isEffectLayer;
    iconButtonEffectActionSectionElement.hidden = isEffectLayer;
    iconButtonEffectEffectSectionElement.hidden = !isEffectLayer;
    const effectReplaceableCount = findReplaceableComponents(inspectedComponent).length;
    const effectApplyTargetCount =
      collectIconButtonEffectChangedProperties(inspectedComponent).length;
    iconButtonEffectApplyStyleButtonElement.disabled =
      !effectReplaceableCount || !effectApplyTargetCount;
    iconButtonEffectApplyCountElement.textContent = effectApplyTargetCount + " 项修改";
    iconButtonEffectApplyStyleButtonElement.textContent = "一键应用到同类型控件";
    syncComponentActionControls(inspectedComponent, iconButtonEffectActionControlsElement);
    return;
  }
  if (isAirConditioner) {
    closeAllDropdownMenus(airConditionerEntityMenuElement.hidden ? null : "air-conditioner-entity");
    syncAirConditionerInspector(inspectedComponent);
    return;
  }
  if (isTitleButton) {
    const titleMenuName = titleButtonEntityMenuElement.hidden
      ? titleButtonIconMenuElement.hidden
        ? null
        : "title-button-icon"
      : "title-button-entity";
    closeAllDropdownMenus(titleMenuName);
    syncTitleButtonInspector(inspectedComponent);
    return;
  }
  if (isLightStatisticsComponent) {
    const statisticsMenuName = lightStatisticsEntityMenuElement.hidden
      ? lightStatisticsActionEntityMenuElement.hidden
        ? lightStatisticsIconMenuElement.hidden
          ? null
          : "light-statistics-icon"
        : "light-statistics-action-entity"
      : "light-statistics-entity";
    closeAllDropdownMenus(statisticsMenuName);
    syncLightStatisticsInspector(inspectedComponent);
    return;
  }
  if (isIconButtonLike) {
    const iconButtonMenuName = iconButtonEntityMenuElement.hidden
      ? iconButtonIconMenuElement.hidden
        ? null
        : "icon-button-icon"
      : "icon-button-entity";
    closeAllDropdownMenus(iconButtonMenuName);
    syncIconButtonInspector(inspectedComponent);
    return;
  }
  if (isCamera) {
    closeAllDropdownMenus(cameraEntityMenuElement.hidden ? null : "camera-entity");
    syncCameraInspector(inspectedComponent);
    return;
  }
  if (isVacuumMap) {
    closeAllDropdownMenus(vacuumMapEntityMenuElement.hidden ? null : "vacuum-map-entity");
    syncVacuumMapInspector(inspectedComponent);
    return;
  }
  if (isNavigationButton) {
    closeAllDropdownMenus(navigationIconMenuElement.hidden ? null : "navigation-icon");
    syncNavigationInspector(inspectedComponent);
    return;
  }
  if (isTime) {
    closeAllDropdownMenus();
    syncTimeInspector(inspectedComponent);
    return;
  }
  if (isDate) {
    closeAllDropdownMenus();
    syncDateInspector(inspectedComponent);
    return;
  }
  if (isWeather) {
    closeAllDropdownMenus();
    syncWeatherInspector(inspectedComponent);
    return;
  }
  if (isLineChart) {
    closeAllDropdownMenus();
    syncLineChartInspector(inspectedComponent);
    return;
  }
  if (isPanelFrame) {
    closeAllDropdownMenus();
    syncPanelFrameInspector(inspectedComponent);
    return;
  }
  const imageProperties = inspectedComponent.properties || {};
  const imagePosition = inspectedComponent.position || {};
  const imageCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const imageCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const imageWidthPx = Number(imagePosition.width || 100);
  const imageHeightPx = Number(imagePosition.height || 100);
  imageTypeTextInputElement.value = "图片";
  imageLabelTextInputElement.value = imageProperties.label || "";
  syncEntityPickerValue(inspectedComponent);
  syncImageAssetSelection(inspectedComponent);
  imageOpacityInputElement.value = roundField(Number(imageProperties.opacity ?? 1) * 100);
  imageLeftInputElement.value = roundField(
    clampNumber(
      ((Number(imagePosition.x || 0) + imageWidthPx / 2) / imageCanvasWidthPx) * 100,
      0,
      100
    )
  );
  imageTopInputElement.value = roundField(
    clampNumber(
      ((Number(imagePosition.y || 0) + imageHeightPx / 2) / imageCanvasHeightPx) * 100,
      0,
      100
    )
  );
  imageScaleInputElement.value = roundField(
    clampNumber(Number(inspectedComponent.style?.scale || 1) * 100, 1, 500)
  );
  imageRotationInputElement.value = roundField(Number(imagePosition.rotation || 0));
  const imageLayoutMode = imageProperties.layoutMode === "fill" ? "fill" : "free";
  for (const imageLayoutOptionElement of imageLayoutOptionsElement.querySelectorAll(
    "[data-image-layout]"
  )) {
    const isImageLayoutActive = imageLayoutOptionElement.dataset.imageLayout === imageLayoutMode;
    imageLayoutOptionElement.classList.toggle("active", isImageLayoutActive);
    imageLayoutOptionElement.setAttribute("aria-pressed", String(isImageLayoutActive));
  }
  const isImageFillLayout = imageLayoutMode === "fill";
  imageLeftInputElement.disabled = isImageFillLayout;
  imageTopInputElement.disabled = isImageFillLayout;
  imageScaleInputElement.disabled = isImageFillLayout;
  imageRotationInputElement.disabled = isImageFillLayout;
  syncComponentActionControls(inspectedComponent, componentActionControlsElement);
}
/**
 * 重新拉取素材目录（用户素材 + 内置素材版本），必要时重渲染并刷新检查器。加 _ 时间戳参数绕过 HTTP 缓存，
 * 确保拿到最新 catalogVersion；内置素材版本变化会触发两个渲染器整表重渲（缓存图片资源作废）；refreshInspector 可选，
 * 让轮询路径复用本函数又不打断用户正在编辑的表单。返回值告知是否有版本变化，供轮询决定是否提示。
 */
async function reloadAssetCatalog({ refreshInspector: refreshInspector = true } = {}) {
  const userAssetsResponse = await requestJson("/assets/user?_=" + Date.now());
  userAssets = userAssetsResponse.items || [];
  catalogVersionSignature = userAssetsResponse.catalogVersion || "";
  const didVersionsChange = setBuiltinAssetVersions(allAssets());
  if (didVersionsChange) {
    editorRenderer?.renderComponents(true);
    dashboardPreviewRenderer?.renderComponents(true);
  }
  if (refreshInspector) {
    syncInspector();
  }
  return didVersionsChange;
}
/**
 * 轮询素材目录版本号，发现变化就整表重载。
 */
async function pollAssetCatalogVersion() {
  const versionResponse = await requestJson("/assets/version");
  const versionSignature = versionResponse.user || "";
  if (catalogVersionSignature !== versionSignature) {
    await reloadAssetCatalog({
      refreshInspector: true
    });
  }
}
/**
 * 确保实体目录（实体 / 设备 / 翻译资源）已加载并按需刷新 UI。用单个 Promise 做并发去重；afterCurrent 为 true 表示
 * 「等本轮加载完再重新调用一次」—— 加载期间又打开新选择器时需拿到完成后的最新列表，共享同一 Promise 会读到未赋值
 * 快照，故这里递归重入。分页用 limit/offset；status 为 missing 的实体被过滤；设备与翻译失败时降级为空数据。
 */
async function ensureEntitiesLoaded({ afterCurrent: waitForCurrent = false } = {}) {
  if (entitiesLoadPromise) {
    if (waitForCurrent) {
      await entitiesLoadPromise;
      return ensureEntitiesLoaded();
    } else {
      return entitiesLoadPromise;
    }
  } else {
    entitiesLoadPromise = (async () => {
      const collectedEntities = [];
      let entityOffset = 0;
      let entityTotal = 0;
      do {
        const entitiesResponse = await requestJson("/ha/entities?limit=500&offset=" + entityOffset);
        collectedEntities.push(...(entitiesResponse.items || []));
        entityTotal = Number(entitiesResponse.total || 0);
        entityOffset += Number(entitiesResponse.limit || 500);
      } while (collectedEntities.length < entityTotal);
      entities = collectedEntities.filter(
        catalogEntityRecord => catalogEntityRecord.status !== "missing"
      );
      const [devicesResponse, translationsResponse] = await Promise.all([
        requestJson("/ha/devices").catch(() => ({
          items: []
        })),
        requestJson("/ha/translations").catch(() => ({
          resources: {}
        }))
      ]);
      devices = devicesResponse?.items || [];
      deviceNamesByDeviceId = new Map(
        devices
          .map(device => [String(device.deviceId || ""), collapseWhitespace(device.name)])
          .filter(([deviceIdKey, deviceNameValue]) => deviceIdKey && deviceNameValue)
      );
      entityResourcesByDeviceId = translationsResponse?.resources || {};
      areEntitiesLoaded = true;
      editorRenderer?.setEntityCatalog(entities, entityResourcesByDeviceId, devices);
      dashboardPreviewRenderer?.setEntityCatalog(entities, entityResourcesByDeviceId, devices);
      syncPopupEntityInputs();
      if (!document.activeElement?.closest?.(".inspector-form")) {
        syncInspector();
      }
    })().finally(() => {
      entitiesLoadPromise = null;
    });
    return entitiesLoadPromise;
  }
}
/**
 * 渲染组合弹窗的下拉选择器与左侧列表。当 initialPopupId 已不存在（弹窗被删或文档被替换）时回退到第一个
 * 弹窗，保证 selectedPopupId 始终指向有效项，否则后续编辑会写空。
 */
function renderPopupList(sourceDocument, initialPopupId = selectedPopupId) {
  const customPopupList = sourceDocument?.customPopups || [];
  popupSelectElement.replaceChildren();
  popupListElement.replaceChildren();
  if (!customPopupList.length) {
    selectedPopupId = null;
    popupSelectElement.append(new Option("暂无组合弹窗", ""));
    popupSelectElement.disabled = true;
    popupActionsButtonElement.disabled = true;
    syncCustomSelect(popupSelectElement);
    const popupEmptyElement = document.createElement("div");
    popupEmptyElement.className = "popup-list-empty";
    popupEmptyElement.textContent = "还没有组合弹窗";
    popupListElement.append(popupEmptyElement);
    return;
  }
  for (const popupEntry of customPopupList) {
    popupSelectElement.append(new Option(popupEntry.name, popupEntry.id));
  }
  selectedPopupId = customPopupList.some(candidatePopup => candidatePopup.id === initialPopupId)
    ? initialPopupId
    : customPopupList[0].id;
  popupSelectElement.value = selectedPopupId;
  popupSelectElement.disabled = false;
  popupActionsButtonElement.disabled = false;
  syncCustomSelect(popupSelectElement);
  for (const popupItem of customPopupList) {
    const popupItemButton = document.createElement("button");
    popupItemButton.type = "button";
    popupItemButton.className =
      "popup-list-item" + (popupItem.id === selectedPopupId ? " selected" : "");
    popupItemButton.dataset.popupId = popupItem.id;
    popupItemButton.setAttribute("role", "option");
    popupItemButton.setAttribute("aria-selected", String(popupItem.id === selectedPopupId));
    const popupItemNameElement = document.createElement("span");
    popupItemNameElement.textContent = popupItem.name;
    const popupItemMetaElement = document.createElement("small");
    popupItemMetaElement.textContent = (popupItem.modules || []).length + " 个模块";
    popupItemButton.append(popupItemNameElement, popupItemMetaElement);
    popupListElement.append(popupItemButton);
  }
}

/**
 * 收起组合弹窗模块的实体候选菜单，并同步 aria-expanded。
 */
function closePopupModuleEntityMenu() {
  popupModuleEntityMenuElement.hidden = true;
  popupModuleEntityButtonElement.setAttribute("aria-expanded", "false");
}
/**
 * 按可用空间缩放组合弹窗的舞台，使其完整适应编辑区（仅弹窗编辑模式）。用 CSS transform: scale 而非改宽高，
 * 这样模块内部的像素坐标（拖拽、吸附都基于设计像素）不必换算；缩放系数下限 0.2，再小就点不中模块了，宁可溢出滚动。
 * 视口宽高用 max(1, …) 兜底，防止布局未完成时算出 0 把子元素压扁。
 */
function syncCustomPopupStage() {
  if (editorMode !== "popup") {
    return;
  }
  const editedPopup = findCustomPopup(activeProject?.document, selectedPopupId);
  const stageWrapElement = customPopupEditorElement.querySelector(".custom-popup-stage-wrap");
  const viewportElement = customPopupEditorElement.querySelector(".custom-popup-viewport");
  const stageElement = customPopupEditorElement.querySelector(".custom-popup-stage");
  const editorToolbarElement = customPopupEditorElement.querySelector(
    ".custom-popup-editor-toolbar"
  );
  if (
    !editedPopup ||
    !stageWrapElement ||
    !viewportElement ||
    !stageElement ||
    !editorToolbarElement
  ) {
    return;
  }
  const layoutMetrics = popupLayoutMetrics(editedPopup.modules || [], editedPopup.layout);
  const gridWidthPx = layoutMetrics.gridWidth;
  const gridHeightPx = layoutMetrics.gridHeight;
  const stageScale = Math.max(
    0.2,
    Math.min(
      stageWrapElement.clientWidth / gridWidthPx,
      stageWrapElement.clientHeight / gridHeightPx
    )
  );
  const viewportWidthPx = Math.max(1, gridWidthPx * stageScale);
  const viewportHeightPx = Math.max(1, gridHeightPx * stageScale);
  viewportElement.style.width = viewportWidthPx + "px";
  viewportElement.style.height = viewportHeightPx + "px";
  stageElement.style.width = gridWidthPx + "px";
  stageElement.style.height = gridHeightPx + "px";
  stageElement.style.transform = "scale(" + stageScale + ")";
  editorToolbarElement.style.width = stageWrapElement.clientWidth + "px";
}
/**
 * 把组合弹窗中的某个模块移动到 beforeModuleId 之前（placeAfter 为 true 时移到其后）。组合弹窗最多 3 行，
 * 所以先试排一次，若新顺序装不下就报错返回、不写入文档，保证「拖拽结果不可行」与「拖拽被取消」对文档是同一效果。
 */
function applyPopupModuleReorder(
  popupIdValue,
  moduleId,
  beforeModuleId = null,
  placeAfter = false
) {
  /** 命中的弹窗定义；为 undefined 时说明选中项已失效，直接放弃本次排序。 */
  const popupDefinition = (activeProject?.document?.customPopups || []).find(
    candidatePopupModule => candidatePopupModule.id === popupIdValue
  );
  if (!popupDefinition) {
    return;
  }
  const reorderedModules = reorderedPopupModules(
    popupDefinition.modules,
    moduleId,
    beforeModuleId,
    placeAfter
  );
  if (
    reorderedModules.length !== (popupDefinition.modules || []).length ||
    !reorderedModules.every(
      (moduleEntry, moduleIndex) => moduleEntry.id === popupDefinition.modules[moduleIndex]?.id
    )
  ) {
    if (!packPopupModules(reorderedModules, popupDefinition.layout).fits) {
      handleOperationError(new Error("这个排序会使当前布局超过 3 行。"));
      return;
    }
    mutateDocument(reorderDraft => {
      /** 在草稿里重新定位同一个弹窗，避免直接改原始文档对象绕过变更记录。 */
      const draftPopup = (reorderDraft.customPopups || []).find(
        draftPopupCandidate => draftPopupCandidate.id === popupIdValue
      );
      if (draftPopup) {
        draftPopup.modules = reorderedPopupModules(
          draftPopup.modules,
          moduleId,
          beforeModuleId,
          placeAfter
        );
      }
    });
  }
}
/**
 * 构造窗帘模块的设置区：窗帘类型 / 开合方向 / 电机方向 三组枚举按钮。三组取值都用白名单过滤，
 * 历史文档里的非法值回落到 fallback，这样旧数据不会把渲染器带进未定义分支。
 */
function createPopupCoverSettings(popupIdentifier, coverModule) {
  const containerElement = document.createElement("div");
  containerElement.className = "popup-cover-settings";
  const coverSettings = [
    {
      label: "窗帘类型",
      property: "coverKind",
      fallback: "auto",
      allowed: ["auto", "standard", "dream", "airer"],
      options: [
        ["auto", "自动识别"],
        ["standard", "普通窗帘"],
        ["dream", "梦幻帘"],
        ["airer", "晾衣机"]
      ]
    },
    {
      label: "开合方向",
      property: "coverDirection",
      fallback: "split",
      allowed: ["split", "left", "right"],
      options: [
        ["split", "双开"],
        ["left", "向左"],
        ["right", "向右"]
      ]
    },
    {
      label: "电机方向",
      property: "coverMotorDirection",
      fallback: "auto",
      allowed: ["auto", "normal", "reversed"],
      options: [
        ["auto", "跟随 HA"],
        ["normal", "正常"],
        ["reversed", "反向"]
      ]
    }
  ];
  for (const settingRow of coverSettings) {
    const rowElement = document.createElement("div");
    rowElement.className = "popup-cover-setting-row";
    const rowLabelElement = document.createElement("span");
    rowLabelElement.textContent = settingRow.label;
    const optionsGroupElement = document.createElement("div");
    optionsGroupElement.className = "popup-cover-setting-options";
    optionsGroupElement.setAttribute("role", "group");
    optionsGroupElement.setAttribute("aria-label", settingRow.label);
    const storedValue = coverModule.properties?.[settingRow.property];
    const activeValue = settingRow.allowed.includes(storedValue)
      ? storedValue
      : settingRow.fallback;
    for (const [optionValue, optionLabel] of settingRow.options) {
      const settingOptionButton = document.createElement("button");
      settingOptionButton.type = "button";
      settingOptionButton.textContent = optionLabel;
      settingOptionButton.classList.toggle("active", optionValue === activeValue);
      settingOptionButton.setAttribute("aria-pressed", String(optionValue === activeValue));
      settingOptionButton.addEventListener("click", optionClickEvent => {
        optionClickEvent.stopPropagation();
        if (optionValue !== activeValue) {
          mutateDocument(popupDraft => {
            /** 草稿中对应的窗帘模块；!! 判定同时兜住 undefined 与 null 两种缺失。 */
            const updatedModule = (popupDraft.customPopups || [])
              .find(popupEntryCandidate => popupEntryCandidate.id === popupIdentifier)
              ?.modules?.find(moduleCandidate => moduleCandidate.id === coverModule.id);
            if (!!updatedModule && updatedModule.type === "cover") {
              updatedModule.properties = {
                ...(updatedModule.properties || {}),
                [settingRow.property]: optionValue
              };
            }
          });
        }
      });
      optionsGroupElement.append(settingOptionButton);
    }
    rowElement.append(rowLabelElement, optionsGroupElement);
    containerElement.append(rowElement);
  }
  return containerElement;
}
/**
 * 构造空调模块（climate）的设置区：设备类型三选一（自动识别 / 空调 / 浴霸）。读取时同时看
 * properties.deviceType 与历史遗留的顶层 deviceType 字段；写入时统一写进 properties 并 delete 顶层字段，
 * 避免两份值不一致时行为不可预期。按钮加上 aria-pressed 是为了让状态不依赖颜色也能被读出来。
 */
function createPopupClimateSettings(popupKey, climateModule) {
  const climateContainerElement = document.createElement("div");
  climateContainerElement.className = "popup-climate-settings";
  const deviceTypeRowElement = document.createElement("div");
  deviceTypeRowElement.className = "popup-cover-setting-row";
  const deviceTypeLabelElement = document.createElement("span");
  deviceTypeLabelElement.textContent = "设备类型";
  const deviceTypeOptionsElement = document.createElement("div");
  deviceTypeOptionsElement.className = "popup-cover-setting-options";
  deviceTypeOptionsElement.setAttribute("role", "group");
  deviceTypeOptionsElement.setAttribute("aria-label", "设备类型");
  const deviceTypeSetting = climateModule.properties?.deviceType || climateModule.deviceType;
  const normalizedClimateType = normalizedPopupClimateDeviceType(deviceTypeSetting);
  for (const [deviceTypeOption, deviceTypeOptionLabel] of [
    ["auto", "自动识别"],
    ["air-conditioner", "空调"],
    ["bath-heater", "浴霸"]
  ]) {
    const deviceTypeOptionButton = document.createElement("button");
    deviceTypeOptionButton.type = "button";
    deviceTypeOptionButton.textContent = deviceTypeOptionLabel;
    deviceTypeOptionButton.classList.toggle("active", deviceTypeOption === normalizedClimateType);
    deviceTypeOptionButton.setAttribute(
      "aria-pressed",
      String(deviceTypeOption === normalizedClimateType)
    );
    deviceTypeOptionButton.addEventListener("click", deviceTypeClickEvent => {
      deviceTypeClickEvent.stopPropagation();
      if (deviceTypeOption !== normalizedClimateType) {
        mutateDocument(climateDraft => {
          /** 草稿中对应的 climate 模块；类型校验防止模块被改成别的类型后写错字段。 */
          const updatedClimateModule = (climateDraft.customPopups || [])
            .find(climatePopupCandidate => climatePopupCandidate.id === popupKey)
            ?.modules?.find(
              climateModuleCandidate => climateModuleCandidate.id === climateModule.id
            );
          if (!!updatedClimateModule && updatedClimateModule.type === "climate") {
            updatedClimateModule.properties = {
              ...(updatedClimateModule.properties || {}),
              deviceType: deviceTypeOption
            };
            delete updatedClimateModule.deviceType;
          }
        });
      }
    });
    deviceTypeOptionsElement.append(deviceTypeOptionButton);
  }
  deviceTypeRowElement.append(deviceTypeLabelElement, deviceTypeOptionsElement);
  climateContainerElement.append(deviceTypeRowElement);
  return climateContainerElement;
}
/**
 * 归一化折线图阈值：固定 4 档，缺项用默认温度分段补齐。默认档位 0 / 13 / 27 / 40 与 renderer 里折线图的
 * 自适应分段一致，因此这里直接以它为骨架，只覆盖文档里已显式配置的档位。
 */
function resolveLineChartThresholds(thresholdSourceModule) {
  const defaultChartThresholds = defaultLineChartThresholds();
  const configuredThresholds = Array.isArray(thresholdSourceModule.properties?.thresholds)
    ? thresholdSourceModule.properties.thresholds
    : [];
  return defaultChartThresholds.map((defaultThreshold, thresholdPosition) => ({
    value: Number.isFinite(Number(configuredThresholds[thresholdPosition]?.value))
      ? Number(configuredThresholds[thresholdPosition].value)
      : defaultThreshold.value,
    color: String(configuredThresholds[thresholdPosition]?.color || defaultThreshold.color)
  }));
}
/**
 * 构造折线图模块的设置区：小数位、数值颜色、阈值模式、阈值输入与折线颜色。小数位从
 * syncedLineChartProperties 取「页面组件级」的有效属性（弹窗模块会与同实体的页面组件共享该设置），
 * 阈值与颜色则写回模块自身的 properties。
 */
function createPopupLineChartSettings(lineChartPopupId, lineChartModule) {
  const chartSettingsElement = document.createElement("div");
  chartSettingsElement.className = "popup-line-chart-settings";
  const precisionRowElement = document.createElement("div");
  precisionRowElement.className = "popup-line-chart-setting-row";
  const precisionLabelElement = document.createElement("span");
  precisionLabelElement.textContent = "数值小数位";
  const precisionSelectElement = document.createElement("select");
  precisionSelectElement.setAttribute("aria-label", "组合弹窗折线图数值小数位");
  for (const [precisionOptionValue, precisionOptionLabel] of [
    ["auto", "自动"],
    ["0", "0 位"],
    ["1", "1 位"],
    ["2", "2 位"],
    ["3", "3 位"],
    ["4", "4 位"]
  ]) {
    precisionSelectElement.append(new Option(precisionOptionLabel, precisionOptionValue));
  }
  const syncedProperties = syncedLineChartProperties(
    activeProject?.document,
    currentPage(),
    lineChartModule.entityId,
    lineChartModule.properties
  );
  precisionSelectElement.value = ["0", "1", "2", "3", "4"].includes(
    String(syncedProperties.statePrecision)
  )
    ? String(syncedProperties.statePrecision)
    : "auto";
  precisionSelectElement.addEventListener("pointerdown", pointerEvent =>
    pointerEvent.stopPropagation()
  );
  precisionSelectElement.addEventListener("click", selectClickEvent =>
    selectClickEvent.stopPropagation()
  );
  precisionSelectElement.addEventListener("change", precisionChangeEvent => {
    precisionChangeEvent.stopPropagation();
    const precisionValue = ["0", "1", "2", "3", "4"].includes(precisionSelectElement.value)
      ? precisionSelectElement.value
      : "auto";
    mutateDocument(precisionDraft => {
      const updatedChartModule = (precisionDraft.customPopups || [])
        .find(chartPopupCandidate => chartPopupCandidate.id === lineChartPopupId)
        ?.modules?.find(chartModuleCandidate => chartModuleCandidate.id === lineChartModule.id);
      if (!!updatedChartModule && updatedChartModule.type === "line-chart") {
        updatedChartModule.properties = {
          ...(updatedChartModule.properties || {}),
          statePrecision: precisionValue
        };
      }
    });
  });
  precisionRowElement.append(precisionLabelElement, precisionSelectElement);
  chartSettingsElement.append(precisionRowElement);
  /**
   * 往设置区追加一行「标题 + 一组取色器」。抽成局部函数是因为折线图有多行同类设置（数值颜色、各档阈值颜色、
   * 折线颜色），行结构完全相同，只有标题、初始色值、回调与禁用态不同。
   */
  const addColorRow = (rowTitle, colorValues, onColorChange, isDisabled = false) => {
    const colorRowElement = document.createElement("div");
    colorRowElement.className = "popup-line-chart-setting-row";
    const rowTitleElement = document.createElement("span");
    rowTitleElement.textContent = rowTitle;
    const colorInputsElement = document.createElement("div");
    colorInputsElement.className = "popup-line-chart-colors";
    colorValues.forEach((colorValue, colorIndex) => {
      const colorPickerInput = document.createElement("input");
      colorPickerInput.type = "color";
      colorPickerInput.value = colorValue;
      colorPickerInput.disabled = isDisabled;
      colorPickerInput.setAttribute(
        "aria-label",
        "" + rowTitle + (colorValues.length > 1 ? " " + (colorIndex + 1) : "")
      );
      colorPickerInput.addEventListener("pointerdown", inputPointerEvent =>
        inputPointerEvent.stopPropagation()
      );
      colorPickerInput.addEventListener("click", inputClickEvent =>
        inputClickEvent.stopPropagation()
      );
      colorPickerInput.addEventListener("change", colorChangeEvent => {
        colorChangeEvent.stopPropagation();
        onColorChange(colorPickerInput.value, colorIndex);
      });
      colorInputsElement.append(colorPickerInput);
    });
    colorRowElement.append(rowTitleElement, colorInputsElement);
    chartSettingsElement.append(colorRowElement);
  };
  addColorRow(
    "数值颜色",
    [String(lineChartModule.properties?.valueColor || "#dce1e5")],
    nextColor => {
      mutateDocument(colorDraft => {
        /** 草稿中对应的折线图模块，仅在其类型仍为 line-chart 时写回颜色。 */
        const updatedColorRowModule = (colorDraft.customPopups || [])
          .find(colorRowPopupCandidate => colorRowPopupCandidate.id === lineChartPopupId)
          ?.modules?.find(
            colorRowModuleCandidate => colorRowModuleCandidate.id === lineChartModule.id
          );
        if (!!updatedColorRowModule && updatedColorRowModule.type === "line-chart") {
          updatedColorRowModule.properties = {
            ...(updatedColorRowModule.properties || {}),
            valueColor: nextColor
          };
        }
      });
    }
  );
  const thresholdModeRowElement = document.createElement("div");
  thresholdModeRowElement.className = "popup-line-chart-setting-row";
  const thresholdModeLabelElement = document.createElement("span");
  thresholdModeLabelElement.textContent = "阈值模式";
  const thresholdModeSelectElement = document.createElement("select");
  thresholdModeSelectElement.setAttribute("aria-label", "组合弹窗折线图阈值模式");
  thresholdModeSelectElement.append(
    new Option("自动（按历史范围）", "auto"),
    new Option("手动设置", "manual")
  );
  const hasConfiguredThresholds =
    Array.isArray(lineChartModule.properties?.thresholds) &&
    lineChartModule.properties.thresholds.some(thresholdEntry =>
      Number.isFinite(Number(thresholdEntry?.value))
    );
  thresholdModeSelectElement.value =
    lineChartModule.properties?.thresholdMode === "auto" ||
    (!hasConfiguredThresholds && lineChartModule.properties?.thresholdMode !== "manual")
      ? "auto"
      : "manual";
  thresholdModeSelectElement.addEventListener("pointerdown", selectPointerEvent =>
    selectPointerEvent.stopPropagation()
  );
  thresholdModeSelectElement.addEventListener("click", modeClickEvent =>
    modeClickEvent.stopPropagation()
  );
  thresholdModeSelectElement.addEventListener("change", modeChangeEvent => {
    modeChangeEvent.stopPropagation();
    const nextThresholdMode = thresholdModeSelectElement.value === "manual" ? "manual" : "auto";
    mutateDocument(modeDraft => {
      /** 草稿中对应的折线图模块；切到手动模式时若还没有阈值数组，就用默认 4 档初始化。 */
      const updatedModeModule = (modeDraft.customPopups || [])
        .find(modePopupCandidate => modePopupCandidate.id === lineChartPopupId)
        ?.modules?.find(modeModuleCandidate => modeModuleCandidate.id === lineChartModule.id);
      if (!updatedModeModule || updatedModeModule.type !== "line-chart") {
        return;
      }
      const nextProperties = {
        ...(updatedModeModule.properties || {}),
        thresholdMode: nextThresholdMode
      };
      if (nextThresholdMode === "manual" && !Array.isArray(nextProperties.thresholds)) {
        nextProperties.thresholds = resolveLineChartThresholds(updatedModeModule);
      }
      updatedModeModule.properties = nextProperties;
    });
  });
  thresholdModeRowElement.append(thresholdModeLabelElement, thresholdModeSelectElement);
  chartSettingsElement.append(thresholdModeRowElement);
  const thresholdRows = resolveLineChartThresholds(lineChartModule);
  const thresholdRowElement = document.createElement("div");
  thresholdRowElement.className = "popup-line-chart-setting-row";
  const thresholdLabelElement = document.createElement("span");
  thresholdLabelElement.textContent = "阈值";
  const thresholdValuesElement = document.createElement("div");
  thresholdValuesElement.className = "popup-line-chart-threshold-values";
  thresholdRows.forEach((thresholdRow, thresholdSlot) => {
    const thresholdInputElement = document.createElement("input");
    thresholdInputElement.type = "number";
    thresholdInputElement.step = "any";
    thresholdInputElement.value = roundField(thresholdRow.value);
    thresholdInputElement.disabled = thresholdModeSelectElement.value === "auto";
    thresholdInputElement.setAttribute("aria-label", "折线阈值 " + (thresholdSlot + 1));
    thresholdInputElement.addEventListener("pointerdown", valuePointerEvent =>
      valuePointerEvent.stopPropagation()
    );
    thresholdInputElement.addEventListener("click", valueClickEvent =>
      valueClickEvent.stopPropagation()
    );
    thresholdInputElement.addEventListener("change", valueChangeEvent => {
      valueChangeEvent.stopPropagation();
      const nextThresholdValue = Number(thresholdInputElement.value);
      if (Number.isFinite(nextThresholdValue)) {
        thresholdInputElement.value = roundField(nextThresholdValue);
        mutateDocument(thresholdDraft => {
          /** 草稿中对应的折线图模块；改单个阈值会自动切到 manual 模式。 */
          const updatedThresholdModule = (thresholdDraft.customPopups || [])
            .find(thresholdPopupCandidate => thresholdPopupCandidate.id === lineChartPopupId)
            ?.modules?.find(
              thresholdModuleCandidate => thresholdModuleCandidate.id === lineChartModule.id
            );
          if (!updatedThresholdModule || updatedThresholdModule.type !== "line-chart") {
            return;
          }
          const updatedThresholds = resolveLineChartThresholds(updatedThresholdModule);
          updatedThresholds[thresholdSlot] = {
            ...updatedThresholds[thresholdSlot],
            value: nextThresholdValue
          };
          updatedThresholdModule.properties = {
            ...(updatedThresholdModule.properties || {}),
            thresholdMode: "manual",
            thresholds: updatedThresholds
          };
        });
      }
    });
    thresholdValuesElement.append(thresholdInputElement);
  });
  thresholdRowElement.append(thresholdLabelElement, thresholdValuesElement);
  chartSettingsElement.append(thresholdRowElement);
  addColorRow(
    "折线颜色",
    thresholdRows.map(colorThresholdRow => colorThresholdRow.color),
    (nextColorValue, colorSlot) => {
      mutateDocument(colorRowDraft => {
        /** 草稿中对应的折线图模块；改颜色同样会把阈值模式固定为 manual。 */
        const updatedColorThresholdModule = (colorRowDraft.customPopups || [])
          .find(
            colorThresholdPopupCandidate => colorThresholdPopupCandidate.id === lineChartPopupId
          )
          ?.modules?.find(
            colorThresholdModuleCandidate => colorThresholdModuleCandidate.id === lineChartModule.id
          );
        if (!updatedColorThresholdModule || updatedColorThresholdModule.type !== "line-chart") {
          return;
        }
        const colorThresholds = resolveLineChartThresholds(updatedColorThresholdModule);
        colorThresholds[colorSlot] = {
          ...colorThresholds[colorSlot],
          color: nextColorValue
        };
        updatedColorThresholdModule.properties = {
          ...(updatedColorThresholdModule.properties || {}),
          thresholdMode: "manual",
          thresholds: colorThresholds
        };
      });
    },
    thresholdModeSelectElement.value === "auto"
  );
  return chartSettingsElement;
}
/**
 * 重建组合弹窗编辑器（工具栏 + 网格舞台 + 模块卡片）。采用整体重建而非增量更新：结构变化（增删模块、
 * 改列数）会连带影响布局与拖拽目标，重建最不容易留下过期状态；非弹窗编辑模式直接返回，避免白跑一遍 DOM 构建。
 * 列数按钮先试排 packPopupModules，装不下就报错不改文档（与拖拽排序同一套「不可行即不写入」的约定）。
 */
function renderCustomPopupEditor() {
  if (editorMode !== "popup") {
    return;
  }
  const activePopup = findCustomPopup(activeProject?.document, selectedPopupId);
  customPopupEditorElement.replaceChildren();
  if (!activePopup) {
    const popupEmptyStateElement = document.createElement("div");
    popupEmptyStateElement.className = "custom-popup-empty";
    popupEmptyStateElement.innerHTML =
      "<div><strong>还没有组合弹窗</strong><p>从左侧新建后，可以混合添加灯光、空调、空气净化器、窗帘、摄像头和折线图。</p></div>";
    customPopupEditorElement.append(popupEmptyStateElement);
    return;
  }
  const popupEditorShellElement = document.createElement("div");
  popupEditorShellElement.className = "custom-popup-editor-shell";
  const toolbarElement = document.createElement("div");
  toolbarElement.className = "custom-popup-editor-toolbar";
  const titleGroupElement = document.createElement("div");
  const popupNameElement = document.createElement("strong");
  popupNameElement.textContent = activePopup.name;
  const layoutSummaryElement = document.createElement("span");
  const metrics = popupLayoutMetrics(activePopup.modules || [], activePopup.layout);
  layoutSummaryElement.textContent = metrics.columns + " 列 × " + metrics.rows + " 行·行数自适应";
  titleGroupElement.append(popupNameElement, layoutSummaryElement);
  const toolbarActionsElement = document.createElement("div");
  toolbarActionsElement.className = "custom-popup-toolbar-actions";
  const columnToggleElement = document.createElement("span");
  columnToggleElement.className = "custom-popup-layout-toggle";
  for (const columnCount of [2, 3, 4]) {
    const columnButtonElement = document.createElement("button");
    columnButtonElement.type = "button";
    columnButtonElement.textContent = columnCount + " 列";
    columnButtonElement.classList.toggle(
      "active",
      popupLayoutColumns(activePopup.layout) === columnCount
    );
    columnButtonElement.addEventListener("click", () => {
      if (popupLayoutColumns(activePopup.layout) === columnCount) {
        return;
      }
      const nextLayout = {
        ...(activePopup.layout || {}),
        columns: columnCount
      };
      if (!packPopupModules(activePopup.modules || [], nextLayout).fits) {
        handleOperationError(new Error("当前模块在 " + columnCount + " 列布局中会超过 3 行。"));
        return;
      }
      mutateDocument(layoutDraft => {
        const layoutPopup = (layoutDraft.customPopups || []).find(
          layoutPopupCandidate => layoutPopupCandidate.id === activePopup.id
        );
        if (layoutPopup) {
          layoutPopup.layout = {
            ...(layoutPopup.layout || {}),
            columns: columnCount
          };
        }
      });
    });
    columnToggleElement.append(columnButtonElement);
  }
  const addModuleButtonElement = document.createElement("button");
  addModuleButtonElement.type = "button";
  addModuleButtonElement.textContent = "＋ 添加模块";
  addModuleButtonElement.addEventListener("click", () => openPopupModuleDialog());
  toolbarActionsElement.append(columnToggleElement, addModuleButtonElement);
  toolbarElement.append(titleGroupElement, toolbarActionsElement);
  const editorStageWrapElement = document.createElement("div");
  editorStageWrapElement.className = "custom-popup-stage-wrap";
  const viewportWrapElement = document.createElement("div");
  viewportWrapElement.className = "custom-popup-viewport";
  const stageGridElement = document.createElement("div");
  stageGridElement.className = "custom-popup-stage";
  stageGridElement.style.width = metrics.gridWidth + "px";
  stageGridElement.style.height = metrics.gridHeight + "px";
  stageGridElement.style.setProperty("--popup-columns", metrics.columns);
  stageGridElement.style.setProperty("--popup-rows", metrics.rows);
  stageGridElement.style.gridTemplateColumns = "repeat(" + metrics.columns + ", minmax(0, 1fr))";
  stageGridElement.style.gridTemplateRows = "repeat(" + metrics.rows + ", minmax(0, 1fr))";
  let draggedModuleId = null;
  /**
   * 清除舞台与模块卡片上的所有拖放指示样式（追加目标高亮与四边插入标记）。
   */
  const clearDropIndicators = () => {
    stageGridElement.classList.remove("popup-module-append-target");
    for (const dropIndicatorElement of stageGridElement.querySelectorAll(
      ".popup-module-drop-top,.popup-module-drop-right,.popup-module-drop-bottom,.popup-module-drop-left"
    )) {
      dropIndicatorElement.classList.remove(
        "popup-module-drop-top",
        "popup-module-drop-right",
        "popup-module-drop-bottom",
        "popup-module-drop-left"
      );
    }
  };
  stageGridElement.addEventListener("dragover", dragEvent => {
    if (!!draggedModuleId && !dragEvent.target.closest(".popup-module-card")) {
      dragEvent.preventDefault();
      clearDropIndicators();
      stageGridElement.classList.add("popup-module-append-target");
      if (dragEvent.dataTransfer) {
        dragEvent.dataTransfer.dropEffect = "move";
      }
    }
  });
  stageGridElement.addEventListener("drop", dropEvent => {
    if (!draggedModuleId || dropEvent.target.closest(".popup-module-card")) {
      return;
    }
    dropEvent.preventDefault();
    const movedModuleId = draggedModuleId;
    clearDropIndicators();
    applyPopupModuleReorder(activePopup.id, movedModuleId);
  });
  for (const [moduleSlotIndex, popupModuleEntry] of (activePopup.modules || []).entries()) {
    const placement = metrics.placements[moduleSlotIndex] || {
      x: 0,
      y: moduleSlotIndex,
      width: 1,
      height: 1
    };
    const columnSpan = [
      "climate",
      "air-purifier",
      "water-heater",
      "media-player",
      "camera",
      "line-chart"
    ].includes(popupModuleEntry.type)
      ? 2
      : placement.width;
    const moduleCardElement = document.createElement("article");
    moduleCardElement.className = "popup-module-card";
    moduleCardElement.dataset.popupModuleId = popupModuleEntry.id;
    moduleCardElement.draggable = true;
    moduleCardElement.setAttribute(
      "aria-label",
      (popupModuleEntry.title || popupEntityDisplayName(popupModuleEntry.entityId)) + "，可拖动排序"
    );
    moduleCardElement.style.gridColumn = placement.x + 1 + " / span " + columnSpan;
    moduleCardElement.style.gridRow = placement.y + 1 + " / span " + placement.height;
    const cardHeadingElement = document.createElement("div");
    cardHeadingElement.className = "popup-module-card-heading";
    const cardTitleWrapElement = document.createElement("div");
    const cardTitleElement = document.createElement("strong");
    cardTitleElement.textContent =
      popupModuleEntry.title || popupEntityDisplayName(popupModuleEntry.entityId);
    cardTitleWrapElement.append(cardTitleElement);
    const cardActionsElement = document.createElement("span");
    cardActionsElement.className = "popup-module-card-actions";
    const editModuleButtonElement = document.createElement("button");
    editModuleButtonElement.type = "button";
    editModuleButtonElement.textContent = "✎";
    editModuleButtonElement.title = "编辑模块";
    editModuleButtonElement.addEventListener("click", () =>
      openPopupModuleDialog(popupModuleEntry)
    );
    const duplicateModuleButtonElement = document.createElement("button");
    duplicateModuleButtonElement.type = "button";
    duplicateModuleButtonElement.textContent = "⎘";
    duplicateModuleButtonElement.title = "复制模块";
    duplicateModuleButtonElement.addEventListener("click", () => {
      const duplicatedModules = [
        ...(activePopup.modules || []),
        {
          ...clone(popupModuleEntry),
          id: "candidate"
        }
      ];
      if (!packPopupModules(duplicatedModules, activePopup.layout).fits) {
        handleOperationError(new Error("当前布局已放不下这个复制模块。"));
        return;
      }
      mutateDocument(duplicateDraft => {
        const duplicatePopup = (duplicateDraft.customPopups || []).find(
          duplicatePopupCandidate => duplicatePopupCandidate.id === activePopup.id
        );
        const sourceModule = duplicatePopup?.modules?.find(
          duplicatedModuleCandidate => duplicatedModuleCandidate.id === popupModuleEntry.id
        );
        if (sourceModule) {
          duplicatePopup.modules.push({
            ...clone(sourceModule),
            id: newId("popup-module")
          });
        }
      });
    });
    const deleteModuleButtonElement = document.createElement("button");
    deleteModuleButtonElement.type = "button";
    deleteModuleButtonElement.textContent = "×";
    deleteModuleButtonElement.title = "删除模块";
    deleteModuleButtonElement.addEventListener("click", () =>
      mutateDocument(deleteDraft => {
        /** 草稿中对应的弹窗；为 undefined 时没有可删的模块。 */
        const deletePopup = (deleteDraft.customPopups || []).find(
          deletePopupCandidate => deletePopupCandidate.id === activePopup.id
        );
        if (deletePopup) {
          deletePopup.modules = deletePopup.modules.filter(
            moduleToRemove => moduleToRemove.id !== popupModuleEntry.id
          );
        }
      })
    );
    cardActionsElement.append(
      editModuleButtonElement,
      duplicateModuleButtonElement,
      deleteModuleButtonElement
    );
    moduleCardElement.addEventListener("pointerdown", pointerDownEvent => {
      moduleCardElement.dataset.dragBlocked = String(
        !!pointerDownEvent.target.closest(
          ".popup-module-card-actions,.popup-cover-settings,.popup-climate-settings,.popup-line-chart-settings"
        )
      );
    });
    moduleCardElement.addEventListener("pointerup", () => {
      delete moduleCardElement.dataset.dragBlocked;
    });
    moduleCardElement.addEventListener("pointercancel", () => {
      delete moduleCardElement.dataset.dragBlocked;
    });
    moduleCardElement.addEventListener("dragstart", dragStartEvent => {
      if (moduleCardElement.dataset.dragBlocked === "true") {
        dragStartEvent.preventDefault();
        delete moduleCardElement.dataset.dragBlocked;
        return;
      }
      draggedModuleId = popupModuleEntry.id;
      moduleCardElement.classList.add("popup-module-dragging");
      moduleCardElement.setAttribute("aria-grabbed", "true");
      if (dragStartEvent.dataTransfer) {
        dragStartEvent.dataTransfer.effectAllowed = "move";
        dragStartEvent.dataTransfer.setData("text/plain", popupModuleEntry.id);
      }
    });
    moduleCardElement.addEventListener("dragover", cardDragOverEvent => {
      if (!draggedModuleId || draggedModuleId === popupModuleEntry.id) {
        return;
      }
      cardDragOverEvent.preventDefault();
      cardDragOverEvent.stopPropagation();
      clearDropIndicators();
      const { edge: dropEdge } = popupModuleDropPosition(moduleCardElement, cardDragOverEvent);
      moduleCardElement.classList.add("popup-module-drop-" + dropEdge);
      if (cardDragOverEvent.dataTransfer) {
        cardDragOverEvent.dataTransfer.dropEffect = "move";
      }
    });
    moduleCardElement.addEventListener("drop", cardDropEvent => {
      if (!draggedModuleId || draggedModuleId === popupModuleEntry.id) {
        return;
      }
      cardDropEvent.preventDefault();
      cardDropEvent.stopPropagation();
      const sourceModuleId = draggedModuleId;
      const { placeAfter: placeAfterModule } = popupModuleDropPosition(
        moduleCardElement,
        cardDropEvent
      );
      clearDropIndicators();
      applyPopupModuleReorder(
        activePopup.id,
        sourceModuleId,
        popupModuleEntry.id,
        placeAfterModule
      );
    });
    moduleCardElement.addEventListener("dragend", () => {
      draggedModuleId = null;
      delete moduleCardElement.dataset.dragBlocked;
      moduleCardElement.classList.remove("popup-module-dragging");
      moduleCardElement.removeAttribute("aria-grabbed");
      clearDropIndicators();
    });
    cardHeadingElement.append(cardTitleWrapElement, cardActionsElement);
    const placeholderElement = document.createElement("div");
    placeholderElement.className = "popup-module-placeholder";
    const placeholderTitleElement = document.createElement("strong");
    placeholderTitleElement.textContent = popupModuleTypeLabel(popupModuleEntry.type) + "交互模块";
    const placeholderEntityElement = document.createElement("span");
    placeholderEntityElement.textContent = popupEntityDisplayName(popupModuleEntry.entityId);
    const placeholderIdElement = document.createElement("small");
    placeholderIdElement.textContent = popupModuleEntry.entityId;
    placeholderElement.append(
      placeholderTitleElement,
      placeholderEntityElement,
      placeholderIdElement
    );
    if (popupModuleEntry.type === "cover") {
      placeholderElement.append(createPopupCoverSettings(activePopup.id, popupModuleEntry));
    }
    if (popupModuleEntry.type === "climate") {
      placeholderElement.append(createPopupClimateSettings(activePopup.id, popupModuleEntry));
    }
    if (popupModuleEntry.type === "line-chart") {
      placeholderElement.append(createPopupLineChartSettings(activePopup.id, popupModuleEntry));
    }
    moduleCardElement.append(cardHeadingElement, placeholderElement);
    stageGridElement.append(moduleCardElement);
  }
  if (!(activePopup.modules || []).length) {
    const stageEmptyElement = document.createElement("div");
    stageEmptyElement.className = "custom-popup-empty";
    stageEmptyElement.style.gridColumn = "1 / -1";
    stageEmptyElement.style.gridRow = "1 / -1";
    stageEmptyElement.textContent = "点击“添加模块”开始组合弹窗";
    stageGridElement.append(stageEmptyElement);
  }
  viewportWrapElement.append(stageGridElement);
  editorStageWrapElement.append(viewportWrapElement);
  popupEditorShellElement.append(toolbarElement, editorStageWrapElement);
  customPopupEditorElement.append(popupEditorShellElement);
  window.requestAnimationFrame(syncCustomPopupStage);
}
/**
 * 打开「添加 / 编辑弹窗模块」对话框，并把模块数据回填到表单。模块类型用白名单收敛，未知类型（含旧版
 * capability-device）统一落到 light 或 generic；默认实体优先取与模块类型匹配的推荐实体，没有推荐才退回实体目录第一项。
 */
function openPopupModuleDialog(popupModule = null) {
  if (!findCustomPopup(activeProject?.document, selectedPopupId)) {
    return;
  }
  selectedPopupModuleId = popupModule?.id || null;
  popupModuleDialogTitleElement.textContent = popupModule ? "编辑弹窗模块" : "添加弹窗模块";
  const moduleTypeName = popupModule?.type === "capability-device" ? "generic" : popupModule?.type;
  popupModuleFormElement.elements.type.value = [
    "light",
    "climate",
    "air-purifier",
    "water-heater",
    "media-player",
    "electric-bed",
    "switch",
    "cover",
    "camera",
    "line-chart",
    "generic"
  ].includes(moduleTypeName)
    ? moduleTypeName
    : "light";
  syncCustomSelect(popupModuleFormElement.elements.type);
  const defaultEntity =
    entities.find(entityCandidate =>
      popupModuleEntityRecommended(entityCandidate, popupModuleFormElement.elements.type.value)
    ) || entities[0];
  popupModuleFormElement.elements.entityId.value =
    popupModule?.entityId || defaultEntity?.entityId || "";
  popupModuleFormElement.elements.title.value = popupModule?.title || "";
  syncPopupModuleDeviceType(
    popupModule?.properties?.deviceType || popupModule?.deviceType || "auto"
  );
  popupModuleEntitySearchInputElement.value = "";
  syncPopupModuleEntityButton();
  popupModuleEntityOptionsElement.replaceChildren();
  closePopupModuleEntityMenu();
  popupModuleDialogElement.showModal();
}
/**
 * 重建页面下拉选择器并尽量保留用户的当前选择：优先用 preferredPagePath（例如刚切换过来的页面，但可能已不在文档里，
 * 需先校验存在性），其次回落到文档标记的默认页，最后才取第一页。默认页信息写进 option 的 dataset 供增强型下拉
 * （syncCustomSelect）与「设为默认页」读取；没有页面时禁用下拉并返回 false。
 */
function renderPageSelect(projectDocumentData, preferredPagePath = null) {
  pageSelectElement.replaceChildren();
  if (!projectDocumentData.pages.length) {
    pageSelectElement.append(new Option("暂无页面", ""));
    pageSelectElement.disabled = true;
    syncCustomSelect(pageSelectElement);
    return false;
  }
  const defaultPagePath = projectDocumentData.pages.some(
    pageRecord => pageRecord.path === projectDocumentData.defaultPagePath
  )
    ? projectDocumentData.defaultPagePath
    : null;
  for (const pageEntry of projectDocumentData.pages) {
    const pageSelectOption = new Option(pageEntry.name, pageEntry.path);
    pageSelectOption.dataset.defaultPage = String(pageEntry.path === defaultPagePath);
    pageSelectElement.append(pageSelectOption);
  }
  pageSelectElement.disabled = false;
  pageSelectElement.value =
    preferredPagePath &&
    projectDocumentData.pages.some(pageCheck => pageCheck.path === preferredPagePath)
      ? preferredPagePath
      : defaultPagePath || projectDocumentData.pages[0].path;
  syncCustomSelect(pageSelectElement);
  return true;
}
/**
 * 文档或页面切换后收敛选择集：丢掉已被删除的组件，以及不属于当前页的页面级组件。
 *
 * 共享组件（scope 非 page）在任何页面都保留，因为它们的宿主在页面之外。
 */
function retainExistingSelection(documentToCheck, pagePathFilter) {
  const candidateSelectionIds = selectedComponentIds.size
    ? [...selectedComponentIds]
    : selectedComponentId
      ? [selectedComponentId]
      : [];
  selectedComponentIds = new Set(
    candidateSelectionIds.filter(componentIdCandidate => {
      const candidateComponent = findComponent(documentToCheck, componentIdCandidate);
      return (
        candidateComponent &&
        (candidateComponent.scope !== "page" || candidateComponent.page?.path === pagePathFilter)
      );
    })
  );
  if (!selectedComponentIds.has(selectedComponentId)) {
    selectedComponentId = selectedComponentIds.values().next().value || null;
  }
  if (!selectedComponentId) {
    selectionAnchorComponentId = null;
  }
}
const structureVolatileTypes = new Set();
/**
 * 比对前后两份文档，收集「可以只重绘自己」的组件。只要出现下列任一情况就返回 null，让调用方老老实实
 * 整页重绘：组件顺序或数量变了、组件换了宿主/页面/父级、类型在 structureVolatileTypes 里、结构签名不同、
 * 组件在当前渲染器里没有宿主节点。宁可多绘也不能画错。
 */
function collectChangedComponents(previousDocument, nextDocument, pagePath) {
  if (
    editorMode !== "edit" ||
    !editorRenderer ||
    editorRenderer.page?.path !== pagePath ||
    editorDocumentFrameSignature(previousDocument) !== editorDocumentFrameSignature(nextDocument)
  ) {
    return null;
  }
  const previousEntries = editorComponentEntries(previousDocument);
  const nextEntries = editorComponentEntries(nextDocument);
  if (
    previousEntries.order.length !== nextEntries.order.length ||
    previousEntries.order.some(
      (orderComponentId, orderIndex) => orderComponentId !== nextEntries.order[orderIndex]
    ) ||
    previousEntries.entries.size !== nextEntries.entries.size
  ) {
    return null;
  }
  const changedComponents = [];
  for (const [componentIdKey, previousEntry] of previousEntries.entries) {
    const nextEntry = nextEntries.entries.get(componentIdKey);
    if (
      !nextEntry ||
      previousEntry.scope !== nextEntry.scope ||
      previousEntry.pagePath !== nextEntry.pagePath ||
      previousEntry.parentId !== nextEntry.parentId ||
      structureVolatileTypes.has(previousEntry.component.type) ||
      editorComponentStructure(previousEntry.component) !==
        editorComponentStructure(nextEntry.component)
    ) {
      return null;
    }
    const { children: previousChildren, ...previousComponentData } = previousEntry.component;
    const { children: nextChildren, ...nextComponentData } = nextEntry.component;
    if (JSON.stringify(previousComponentData) !== JSON.stringify(nextComponentData)) {
      if (!editorRenderer.componentHosts.has(componentIdKey)) {
        let ancestorEntry = nextEntry;
        while (ancestorEntry.parentId) {
          ancestorEntry = nextEntries.entries.get(ancestorEntry.parentId);
        }
        if (
          nextEntry.scope === "shared"
            ? (editorRenderer.page.sharedComponentIds || []).includes(ancestorEntry.component.id)
            : nextEntry.pagePath === pagePath
        ) {
          return null;
        }
        continue;
      }
      changedComponents.push({
        componentId: componentIdKey,
        component: nextEntry.component
      });
    }
  }
  return changedComponents;
}
/**
 * 把画布上拖拽/缩放产生的变换回写到检查器的数值输入框。画布用像素存 position、检查器显示百分比，故要除以画布
 * 尺寸（缺省 2778×1940）；宽高下限夹到 0.1 而非 0，避免回写 0 后组件不可选中；scale 内部以 1 为基准、界面乘 100。
 * 只更新 transform 里真正带值的字段（Number.isFinite），并要求组件仍是当前选中项，避免异步回调写到错误的输入框上。
 */
function applyTransformToInspector(syncedComponentId, transform) {
  const inspectorComponent = findComponent(activeProject?.document, syncedComponentId)?.component;
  if (!inspectorComponent || syncedComponentId !== selectedComponentId) {
    return;
  }
  const stageCanvasWidthPx = Number(activeProject.document.canvas.width || 2778);
  const stageCanvasHeightPx = Number(activeProject.document.canvas.height || 1940);
  const currentWidthPx = Number(inspectorComponent.position?.width || 100);
  const currentHeightPx = Number(inspectorComponent.position?.height || 100);
  const nextWidthPx = Number.isFinite(transform.width) ? transform.width : currentWidthPx;
  const nextHeightPx = Number.isFinite(transform.height) ? transform.height : currentHeightPx;
  const isIconButtonKind = ["icon-button", "device-button", "presence-sensor"].includes(
    inspectorComponent.type
  );
  const leftInputElement =
    inspectorComponent.type === "title-button"
      ? titleButtonLeftInputElement
      : inspectorComponent.type === "light-statistics"
        ? lightStatisticsLeftInputElement
        : isIconButtonKind
          ? iconButtonLeftInputElement
          : inspectorComponent.type === "air-conditioner"
            ? airConditionerLeftInputElement
            : inspectorComponent.type === "vacuum-map"
              ? vacuumMapLeftInputElement
              : inspectorComponent.type === "camera"
                ? cameraLeftInputElement
                : inspectorComponent.type === "icon-button-effect"
                  ? iconButtonEffectLeftInputElement
                  : inspectorComponent.type === "navigation-button"
                    ? navigationLeftInputElement
                    : inspectorComponent.type === "time"
                      ? timeLeftInputElement
                      : inspectorComponent.type === "date"
                        ? dateLeftInputElement
                        : inspectorComponent.type === "weather"
                          ? weatherLeftInputElement
                          : inspectorComponent.type === "line-chart"
                            ? lineChartLeftInputElement
                            : inspectorComponent.type === "panel-frame"
                              ? panelFrameLeftInputElement
                              : imageLeftInputElement;
  const topInputElement =
    inspectorComponent.type === "title-button"
      ? titleButtonTopInputElement
      : inspectorComponent.type === "light-statistics"
        ? lightStatisticsTopInputElement
        : isIconButtonKind
          ? iconButtonTopInputElement
          : inspectorComponent.type === "air-conditioner"
            ? airConditionerTopInputElement
            : inspectorComponent.type === "vacuum-map"
              ? vacuumMapTopInputElement
              : inspectorComponent.type === "camera"
                ? cameraTopInputElement
                : inspectorComponent.type === "icon-button-effect"
                  ? iconButtonEffectTopInputElement
                  : inspectorComponent.type === "navigation-button"
                    ? navigationTopInputElement
                    : inspectorComponent.type === "time"
                      ? timeTopInputElement
                      : inspectorComponent.type === "date"
                        ? dateTopInputElement
                        : inspectorComponent.type === "weather"
                          ? weatherTopInputElement
                          : inspectorComponent.type === "line-chart"
                            ? lineChartTopInputElement
                            : inspectorComponent.type === "panel-frame"
                              ? panelFrameTopInputElement
                              : imageTopInputElement;
  const scaleInputElement =
    inspectorComponent.type === "title-button"
      ? titleButtonScaleInputElement
      : inspectorComponent.type === "light-statistics"
        ? lightStatisticsScaleInputElement
        : isIconButtonKind
          ? iconButtonScaleInputElement
          : inspectorComponent.type === "air-conditioner"
            ? airConditionerScaleInputElement
            : inspectorComponent.type === "vacuum-map"
              ? vacuumMapScaleInputElement
              : inspectorComponent.type === "camera"
                ? cameraScaleInputElement
                : inspectorComponent.type === "icon-button-effect"
                  ? iconButtonEffectScaleInputElement
                  : inspectorComponent.type === "navigation-button"
                    ? navigationScaleInputElement
                    : inspectorComponent.type === "time"
                      ? timeScaleInputElement
                      : inspectorComponent.type === "date"
                        ? dateScaleInputElement
                        : inspectorComponent.type === "weather"
                          ? weatherScaleInputElement
                          : inspectorComponent.type === "line-chart"
                            ? lineChartScaleInputElement
                            : inspectorComponent.type === "panel-frame"
                              ? panelFrameScaleInputElement
                              : imageScaleInputElement;
  const rotationInputElement =
    inspectorComponent.type === "title-button"
      ? titleButtonRotationInputElement
      : inspectorComponent.type === "light-statistics"
        ? lightStatisticsRotationInputElement
        : isIconButtonKind
          ? iconButtonRotationInputElement
          : inspectorComponent.type === "air-conditioner"
            ? airConditionerRotationInputElement
            : inspectorComponent.type === "vacuum-map"
              ? vacuumMapRotationInputElement
              : inspectorComponent.type === "camera"
                ? cameraRotationInputElement
                : inspectorComponent.type === "icon-button-effect"
                  ? iconButtonEffectRotationInputElement
                  : inspectorComponent.type === "navigation-button"
                    ? navigationRotationInputElement
                    : inspectorComponent.type === "time"
                      ? timeRotationInputElement
                      : inspectorComponent.type === "date"
                        ? dateRotationInputElement
                        : inspectorComponent.type === "weather"
                          ? weatherRotationInputElement
                          : inspectorComponent.type === "line-chart"
                            ? lineChartRotationInputElement
                            : inspectorComponent.type === "panel-frame"
                              ? panelFrameRotationInputElement
                              : imageRotationInputElement;
  if (Number.isFinite(transform.x)) {
    leftInputElement.value = roundField(
      clampNumber(((transform.x + nextWidthPx / 2) / stageCanvasWidthPx) * 100, 0, 100)
    );
  }
  if (Number.isFinite(transform.y)) {
    topInputElement.value = roundField(
      clampNumber(((transform.y + nextHeightPx / 2) / stageCanvasHeightPx) * 100, 0, 100)
    );
  }
  if (inspectorComponent.type === "navigation-button" && Number.isFinite(transform.width)) {
    navigationWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "navigation-button" && Number.isFinite(transform.height)) {
    navigationHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "icon-button-effect" && Number.isFinite(transform.width)) {
    iconButtonEffectWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "icon-button-effect" && Number.isFinite(transform.height)) {
    iconButtonEffectHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "title-button" && Number.isFinite(transform.width)) {
    titleButtonWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "title-button" && Number.isFinite(transform.height)) {
    titleButtonHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "light-statistics" && Number.isFinite(transform.width)) {
    lightStatisticsWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "light-statistics" && Number.isFinite(transform.height)) {
    lightStatisticsHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (isIconButtonKind && Number.isFinite(transform.width)) {
    iconButtonWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (isIconButtonKind && Number.isFinite(transform.height)) {
    iconButtonHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "camera" && Number.isFinite(transform.width)) {
    cameraWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "camera" && Number.isFinite(transform.height)) {
    cameraHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "air-conditioner" && Number.isFinite(transform.width)) {
    airConditionerWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "air-conditioner" && Number.isFinite(transform.height)) {
    airConditionerHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "line-chart" && Number.isFinite(transform.width)) {
    lineChartWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "line-chart" && Number.isFinite(transform.height)) {
    lineChartHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "panel-frame" && Number.isFinite(transform.width)) {
    panelFrameWidthInputElement.value = roundField(
      clampNumber((transform.width / stageCanvasWidthPx) * 100, 0.1, 100)
    );
  }
  if (inspectorComponent.type === "panel-frame" && Number.isFinite(transform.height)) {
    panelFrameHeightInputElement.value = roundField(
      clampNumber((transform.height / stageCanvasHeightPx) * 100, 0.1, 100)
    );
  }
  if (Number.isFinite(transform.scale)) {
    scaleInputElement.value = roundField(transform.scale * 100);
  }
  if (Number.isFinite(transform.rotation)) {
    rotationInputElement.value = roundField(transform.rotation);
  }
}
/**
 * 创建（或复用）编辑器画布渲染器并把实体目录挂上去。渲染器是单例，只创建一次：重建会丢掉缩放状态、选中态
 * 与已缓存的运行时数据。创建时注入 onComponentTransform、onPreviewTransform 等回调，让画布上的拖拽/预览能反向更新
 * 文档与检查器；首次调用还会把历史序列、运行时状态、虚拟实体状态等缓存与实体目录一并初始化，并在页面上创建画布 DOM。
 */
function ensureEditorRenderer() {
  return (
    editorRenderer ||
    ((editorRenderer = new PanelRenderer(editorCanvasElement, {
      editable: true,
      historySeriesCache: historySeriesCache,
      runtimeStateCache: runtimeStateCache,
      virtualEntityStateCache: virtualEntityStateCache,
      onComponentTransform(transformedComponentId, componentTransform) {
        selectedComponentId = transformedComponentId;
        selectedComponentIds = new Set([transformedComponentId]);
        mutateDocument(transformDocument => {
          const draftComponent = findComponent(
            transformDocument,
            transformedComponentId
          )?.component;
          if (!draftComponent) {
            return;
          }
          const previousWidth = getNavigationStyleValue(draftComponent, "width");
          const previousHeight = getNavigationStyleValue(draftComponent, "height");
          const previousScale = getNavigationStyleValue(draftComponent, "scale");
          const previousRotation = getNavigationStyleValue(draftComponent, "rotation");
          const {
            scale: nextScale,
            airflowOffsetX: nextAirflowOffsetX,
            airflowOffsetY: nextAirflowOffsetY,
            ...positionPatch
          } = componentTransform;
          draftComponent.position = {
            ...(draftComponent.position || {}),
            ...positionPatch
          };
          if (Number.isFinite(nextScale)) {
            draftComponent.style = {
              ...(draftComponent.style || {}),
              scale: nextScale
            };
          }
          if (
            draftComponent.type === "air-conditioner" &&
            (Number.isFinite(nextAirflowOffsetX) || Number.isFinite(nextAirflowOffsetY))
          ) {
            draftComponent.properties = {
              ...(draftComponent.properties || {}),
              ...(Number.isFinite(nextAirflowOffsetX)
                ? {
                    airflowOffsetX: nextAirflowOffsetX
                  }
                : {}),
              ...(Number.isFinite(nextAirflowOffsetY)
                ? {
                    airflowOffsetY: nextAirflowOffsetY
                  }
                : {})
            };
          }
          if (
            draftComponent.type === "navigation-button" &&
            Number.isFinite(componentTransform.width)
          ) {
            rememberNavigationStyleChange(
              transformedComponentId,
              "width",
              previousWidth,
              getNavigationStyleValue(draftComponent, "width")
            );
          }
          if (
            draftComponent.type === "navigation-button" &&
            Number.isFinite(componentTransform.height)
          ) {
            rememberNavigationStyleChange(
              transformedComponentId,
              "height",
              previousHeight,
              getNavigationStyleValue(draftComponent, "height")
            );
          }
          if (
            draftComponent.type === "navigation-button" &&
            Number.isFinite(componentTransform.scale)
          ) {
            rememberNavigationStyleChange(
              transformedComponentId,
              "scale",
              previousScale,
              getNavigationStyleValue(draftComponent, "scale")
            );
          }
          if (
            draftComponent.type === "navigation-button" &&
            Number.isFinite(componentTransform.rotation)
          ) {
            rememberNavigationStyleChange(
              transformedComponentId,
              "rotation",
              previousRotation,
              getNavigationStyleValue(draftComponent, "rotation")
            );
          }
        });
      },
      onComponentsTransform(transformList, leadComponentId) {
        selectedComponentId = leadComponentId;
        mutateDocument(transformDraftDocument => {
          for (const transformEntry of transformList) {
            const entryComponent = findComponent(
              transformDraftDocument,
              transformEntry.componentId
            )?.component;
            if (entryComponent) {
              entryComponent.position = {
                ...(entryComponent.position || {}),
                ...(Number.isFinite(transformEntry.x)
                  ? {
                      x: transformEntry.x
                    }
                  : {}),
                ...(Number.isFinite(transformEntry.y)
                  ? {
                      y: transformEntry.y
                    }
                  : {}),
                ...(Number.isFinite(transformEntry.rotation)
                  ? {
                      rotation: transformEntry.rotation
                    }
                  : {})
              };
              if (Number.isFinite(transformEntry.scale)) {
                entryComponent.style = {
                  ...(entryComponent.style || {}),
                  scale: transformEntry.scale
                };
              }
            }
          }
        });
      },
      onComponentDuplicate(sourceComponentId, copiedComponent) {
        selectedComponentId = copiedComponent.id;
        selectedComponentIds = new Set([copiedComponent.id]);
        selectionAnchorComponentId = copiedComponent.id;
        mutateDocument(duplicateDraftDocument => {
          duplicateComponent(duplicateDraftDocument, sourceComponentId, copiedComponent, false);
        });
      },
      onComponentsDuplicate(copiedComponentEntries, draggedComponentId, draggedCopyId) {
        const copiedComponentIds = copiedComponentEntries.map(
          copiedComponentEntry => copiedComponentEntry.copiedComponent.id
        );
        selectedComponentId = draggedCopyId || copiedComponentIds[0] || null;
        selectedComponentIds = new Set(copiedComponentIds);
        selectionAnchorComponentId = selectedComponentId;
        mutateDocument(duplicateApplyDocument => {
          for (const duplicateEntry of copiedComponentEntries) {
            duplicateComponent(
              duplicateApplyDocument,
              duplicateEntry.sourceComponentId,
              duplicateEntry.copiedComponent,
              false
            );
          }
        });
      },
      onComponentTransformPreview(previewedComponentId, previewedTransformPatch) {
        applyTransformToInspector(previewedComponentId, previewedTransformPatch);
      },
      onComponentProperties(propertyComponentId, propertyPatch) {
        mutateDocument(propertyDraftDocument => {
          const propertyComponent = findComponent(
            propertyDraftDocument,
            propertyComponentId
          )?.component;
          if (
            !!propertyComponent &&
            !!["air-conditioner", "presence-sensor"].includes(propertyComponent.type) &&
            (propertyComponent.type !== "presence-sensor" ||
              propertyComponent.properties?.sensorKind === "door-window")
          ) {
            propertyComponent.properties = {
              ...(propertyComponent.properties || {}),
              ...propertyPatch
            };
          }
        });
      },
      onComponentPropertiesPreview(previewPropertyComponentId, previewPropertyPatch) {
        if (previewPropertyComponentId === selectedComponentId) {
          if (Number.isFinite(previewPropertyPatch.airflowScale)) {
            airConditionerAirflowScaleInputElement.value = roundField(
              previewPropertyPatch.airflowScale * 100
            );
          }
          if (Number.isFinite(previewPropertyPatch.airflowRotation)) {
            airConditionerAirflowRotationInputElement.value = roundField(
              previewPropertyPatch.airflowRotation
            );
          }
          if (Number.isFinite(previewPropertyPatch.airflowOffsetX)) {
            airConditionerAirflowOffsetXInputElement.value = roundField(
              previewPropertyPatch.airflowOffsetX
            );
          }
          if (Number.isFinite(previewPropertyPatch.airflowOffsetY)) {
            airConditionerAirflowOffsetYInputElement.value = roundField(
              previewPropertyPatch.airflowOffsetY
            );
          }
        }
      },
      onComponentsTransformPreview(previewTransformList, previewLeadComponentId) {
        selectedComponentId = previewLeadComponentId;
        const matchedTransformPreview = previewTransformList.find(
          candidateTransformEntry => candidateTransformEntry.componentId === previewLeadComponentId
        );
        if (matchedTransformPreview) {
          applyTransformToInspector(previewLeadComponentId, matchedTransformPreview);
        }
      },
      onError: handleOperationError,
      onRuntimeStateChange() {
        const runtimeSelectedComponent = selectedComponent();
        if (runtimeSelectedComponent?.type === "light-statistics") {
          renderLightStatisticsEntities(runtimeSelectedComponent);
        }
      },
      onPageChange(pageSelection) {
        pageSelectElement.value = pageSelection.path;
        syncCustomSelect(pageSelectElement);
        retainExistingSelection(activeProject?.document, pageSelection.path);
        editorRenderer?.setSelectedComponents([...selectedComponentIds], selectedComponentId);
        renderComponentLists();
        syncInspector();
      }
    })),
    editorRenderer.setEntityCatalog(entities, entityResourcesByDeviceId, devices),
    editorRenderer)
  );
}
/**
 * 重建整个编辑器工作区（页面下拉、画布、组件列表、检查器、预览），在文档被整体替换或结构变化过大时调用。
 * 没有可用页面时会销毁渲染器并显示提示文案，避免残留画布上的旧组件；同时仍同步页面下拉与仪表盘预览，
 * 保证各区域状态一致，并可能销毁重建 editorRenderer。
 */
function renderEditorWorkspace(activePagePath = null) {
  refreshSoundToggle();
  renderWorkspaceResolution();
  renderPopupList(activeProject.document, selectedPopupId);
  const pageAvailable = renderPageSelect(activeProject.document, activePagePath);
  setPageControlsEnabled(pageAvailable);
  resizeWorkspaceCanvas();
  if (!pageAvailable) {
    clearComponentSelection();
    editorRenderer?.destroy();
    editorRenderer = null;
    editorCanvasElement.innerHTML =
      '<div class="canvas-message"><strong>请从左侧新建页面。</strong></div>';
    renderComponentLists();
    syncInspector();
    renderDashboardPreview(activePagePath);
    if (editorMode === "popup") {
      renderCustomPopupEditor();
    }
    return;
  }
  retainExistingSelection(activeProject.document, pageSelectElement.value);
  if (editorMode === "edit") {
    ensureEditorRenderer().setDocument(activeProject.document, pageSelectElement.value);
    editorRenderer.setActiveGroup(activeGroupId);
    editorRenderer.setSelectedComponents([...selectedComponentIds], selectedComponentId);
  } else {
    editorRenderer?.destroy();
    editorRenderer = null;
  }
  renderComponentLists();
  syncInspector();
  if (editorMode === "dashboard") {
    renderDashboardPreview(pageSelectElement.value);
  } else if (editorMode === "popup") {
    renderCustomPopupEditor();
  } else {
    destroyDashboardPreview();
  }
}
/**
 * 按撤销/重做栈与忙碌标记刷新两个历史按钮的可用性。
 */
function syncHistoryButtons() {
  undoButtonElement.disabled = historyState.busy || !historyState.undo.length || !activeProject;
  redoButtonElement.disabled = historyState.busy || !historyState.redo.length || !activeProject;
}
/**
 * 丢弃指定项目的崩溃恢复快照：取消尚未落地的写入，并清掉 sessionStorage。
 */
function discardRecoverySnapshot(recoveryProjectId = activeProject?.projectId) {
  if (recoveryProjectId) {
    recoveryWriter.cancel(recoveryProjectId);
    try {
      // 存储不可用时删不掉快照：读取侧同样进不来（readRecoverySnapshot 也整段兜错），
      // 所以不存在「丢弃过的快照又被恢复回来」的路径。
      sessionStorage.removeItem(recoveryStorageKey(RECOVERY_STORAGE_PREFIX, recoveryProjectId));
    } catch {
      // 见上：删不掉时读取侧同样进不来（readRecoverySnapshot 也整段兜错），
      // 不存在「丢弃过的快照又被恢复回来」的路径。
    }
  }
}
/**
 * 读取并校验 sessionStorage 中的崩溃恢复快照。项目 ID 与调用方不一致的快照一律丢弃：同一浏览器
 * 可能同时开着多个项目页，复用了同一个 sessionStorage。
 */
function readRecoverySnapshot(snapshotProjectId) {
  try {
    const storedSnapshotJson = sessionStorage.getItem(
      recoveryStorageKey(RECOVERY_STORAGE_PREFIX, snapshotProjectId)
    );
    if (!storedSnapshotJson) {
      return null;
    }
    const parsedRecoverySnapshot = JSON.parse(storedSnapshotJson);
    if (
      !parsedRecoverySnapshot?.document ||
      parsedRecoverySnapshot.projectId !== snapshotProjectId
    ) {
      return null;
    } else {
      return parsedRecoverySnapshot;
    }
  } catch {
    return null;
  }
}
const recoveryWriter = createRecoveryWriter(persistRecoverySnapshot);
bindLifecycleSection();

/**
 * 把当前未保存状态排入恢复快照写队列（真正的防抖与合并由 recoveryWriter 负责）；没有未保存改动时不写，避免用
 * 「等于已保存内容」的快照覆盖掉更有价值的旧快照。快照刻意不带撤销 / 重做栈：那两个栈各自是「最多 MAX_HISTORY_ENTRIES
 * 份完整文档快照」，一次序列化就是几百 KB 到几 MB，而写入是 200ms 一节流的，大文档下就是「拖控件时一顿一顿」的来源。
 */
function scheduleRecoverySnapshot() {
  if (!activeProject || !hasUnsavedChanges) {
    return;
  }
  recoveryWriter.schedule({
    projectId: activeProject.projectId,
    revision: activeProject.revision,
    document: activeProject.document,
    selectedPath: pageSelectElement.value,
    selectedComponentId: selectedComponentId,
    selectedComponentIds: [...selectedComponentIds],
    savedAt: new Date().toISOString()
  });
}

//: 已经为哪个项目提醒过「快照写不进去」。每次页面加载、每个项目只提醒一次 ——
//: 不去重就是在用户编辑时每 200 毫秒弹一次同一个对话框，比不提示更糟。
let recoveryFailureNotifiedProjectId = null;

/**
 * 真正把恢复快照写进 sessionStorage。只有一次写入：不再「失败后降级为去栈的快照重试」，
 * 因为去栈后的内容本来就是唯一会写的那份。写不进去（配额满、隐私模式）时唯一有意义的事
 * 是让用户知道（见 notifyRecoveryWriteFailure），而不是悄悄放弃。
 */
function persistRecoverySnapshot(recoveryState) {
  try {
    sessionStorage.setItem(
      recoveryStorageKey(RECOVERY_STORAGE_PREFIX, recoveryState.projectId),
      JSON.stringify(recoveryState)
    );
    // 写成功即解除「已提醒」：空间被腾出来之后，下一次失败要能重新提醒。
    recoveryFailureNotifiedProjectId = null;
  } catch (writeError) {
    notifyRecoveryWriteFailure(recoveryState, writeError);
  }
}

/**
 * 恢复快照写不进去时给用户一次可见告警。必须说出来：草稿恢复是「崩溃 / 误关页面之后唯一能找回未保存内容」的通道，
 * 它失效时页面本身毫无异样，用户会一直以为有兜底。两处克制：同一项目每次页面加载只提醒一次（200ms 一节流，
 * 配额满时每次都会失败）；页面不可见时不弹对话框（pagehide / beforeunload 也走这条写入路径），但日志照记。
 */
function notifyRecoveryWriteFailure(recoveryState, writeError) {
  window.HABridgeLog?.error(writeError, {
    projectId: recoveryState.projectId,
    phase: "recovery-snapshot"
  });
  if (recoveryFailureNotifiedProjectId === recoveryState.projectId) {
    return;
  }
  recoveryFailureNotifiedProjectId = recoveryState.projectId;
  if (document.visibilityState !== "visible") {
    return;
  }
  const snapshotWriteError = new Error(
    "无法保存草稿恢复快照（浏览器存储空间不足或处于隐私模式）：" +
      (writeError?.message || "写入失败") +
      "。请先手动保存，避免刷新或崩溃后丢失未保存的改动。"
  );
  snapshotWriteError.name = "RecoverySnapshotError";
  handleOperationError(snapshotWriteError, { phase: "recovery-snapshot" });
}
/**
 * 重新计算「是否有未保存改动」，并联动保存按钮与恢复快照。
 *
 * @param {string|null} [options.signature=null] 直接传入当前文档签名，省掉一次序列化。
 */
function refreshDirtyState({
  preserveRecovery: keepRecovery = false,
  signature: signatureOverride = null
} = {}) {
  hasUnsavedChanges =
    !!activeProject &&
    (signatureOverride ?? documentSignature(activeProject.document)) !== savedDocumentSignature;
  saveButtonElement.disabled = !activeProject || !hasUnsavedChanges || isSaving;
  if (hasUnsavedChanges) {
    scheduleRecoverySnapshot();
  } else if (!keepRecovery) {
    discardRecoverySnapshot();
  }
}
/**
 * 清空撤销/重做栈并解除「历史操作进行中」标记。切项目、载入新文档后必须调用：旧文档的历史记录里带着
 * 旧文档快照，直接撤销会把另一个项目的内容写回当前项目。
 */
function resetHistoryState() {
  historyState.undo = [];
  historyState.redo = [];
  historyState.busy = false;
  syncHistoryButtons();
}
/**
 * 压入一条历史记录，并按上限修剪。修剪对非 save 记录生效（从最早的一条开始删），save 记录始终保留：
 * 它们标记了「已保存到后端」的锚点，撤销到锚点才能正确判断脏状态。
 */
function pushHistoryEntry(historyEntries, historyEntry) {
  for (
    historyEntries.push(historyEntry);
    historyEntries.filter(prunedEntry => prunedEntry.kind !== "save").length > MAX_HISTORY_ENTRIES;
  ) {
    const pruneIndex = historyEntries.findIndex(pruneCandidate => pruneCandidate.kind !== "save");
    if (pruneIndex < 0) {
      break;
    }
    historyEntries.splice(pruneIndex, 1);
  }
  if (historyEntries.length > MAX_HISTORY_ENTRIES * 2) {
    historyEntries.splice(0, historyEntries.length - MAX_HISTORY_ENTRIES * 2);
  }
}
/**
 * 生成一条「编辑」历史记录：当前文档快照加选择集。
 *
 * 记录里存快照而非 diff，撤销就是整体换回文档；文档体量可控，这样最不容易出错。
 */
function createEditHistoryEntry() {
  return {
    kind: "edit",
    document: clone(activeProject.document),
    selectedPath: pageSelectElement.value,
    selectedComponentId: selectedComponentId,
    selectedComponentIds: [...selectedComponentIds]
  };
}
/**
 * 打开指定项目的草稿：拉取草稿、归一化文档、重置历史，并尝试恢复崩溃快照。两种恢复快照会被丢弃：
 * revision 与后端不一致（后端已有更新，快照已过期），或快照内容与已保存文档一致（没有需要恢复的东西）。
 */
async function openProjectDraft(requestedProjectId, initialPagePath = null) {
  recoveryWriter.flush();
  window.HABridgeLog?.setContext({
    projectId: requestedProjectId
  });
  activeProject = await requestJson("/projects/" + requestedProjectId + "/draft");
  normalizeDashboardDocument(activeProject.document);
  navigationButtonSavedSettingsByComponentId.clear();
  panelFrameBaselineByComponentId.clear();
  lineChartBaselineByComponentId.clear();
  iconButtonEffectBaselineByComponentId.clear();
  iconButtonBaselineByComponentId.clear();
  airConditionerBaselineByComponentId.clear();
  baselineDocument = clone(activeProject.document);
  savedDocumentSignature = documentSignature(activeProject.document);
  recoverySnapshot = readRecoverySnapshot(requestedProjectId);
  if (
    recoverySnapshot &&
    (recoverySnapshot.revision !== activeProject.revision ||
      documentSignature(recoverySnapshot.document) === savedDocumentSignature)
  ) {
    discardRecoverySnapshot(requestedProjectId);
    recoverySnapshot = null;
  }
  clearComponentSelection();
  resetHistoryState();
  refreshDirtyState({
    preserveRecovery: !!recoverySnapshot
  });
  setWorkspaceHasProject(true);
  projectSelectElement.value = requestedProjectId;
  syncCustomSelect(projectSelectElement);
  rememberEditorProject(requestedProjectId);
  renderEditorWorkspace(initialPagePath);
  if (recoverySnapshot && !recoveryDialogElement.open) {
    recoveryDialogElement.showModal();
  }
}
/**
 * 加载仪表盘列表并打开其中一个（默认第一个，或指定的那个）。列表为空时走「无仪表盘」分支：销毁渲染器、
 * 清空所有按组件 ID 缓存的改动前基线、复位脏状态与历史栈、禁用相关下拉 —— 这些缓存都以组件 ID 为键，
 * 不清会串到下一个项目的同 ID 组件上，导致检查器显示错误的「改动前」值。
 */
async function loadProjects(preferredProjectId = null) {
  projects = (await requestJson("/projects")).items || [];
  projectSelectElement.replaceChildren();
  if (!projects.length) {
    editorRenderer?.destroy();
    editorRenderer = null;
    destroyDashboardPreview();
    activeProject = null;
    navigationButtonSavedSettingsByComponentId.clear();
    panelFrameBaselineByComponentId.clear();
    lineChartBaselineByComponentId.clear();
    iconButtonEffectBaselineByComponentId.clear();
    iconButtonBaselineByComponentId.clear();
    airConditionerBaselineByComponentId.clear();
    clearComponentSelection();
    baselineDocument = null;
    savedDocumentSignature = "";
    recoverySnapshot = null;
    resetHistoryState();
    refreshDirtyState();
    setWorkspaceHasProject(false);
    setPageControlsEnabled(false);
    projectSelectElement.append(new Option("暂无仪表盘", ""));
    pageSelectElement.replaceChildren(new Option("暂无页面", ""));
    popupSelectElement.replaceChildren(new Option("暂无组合弹窗", ""));
    popupListElement.innerHTML = '<div class="popup-list-empty">还没有组合弹窗</div>';
    projectSelectElement.disabled = true;
    pageSelectElement.disabled = true;
    popupSelectElement.disabled = true;
    popupActionsButtonElement.disabled = true;
    syncCustomSelect(projectSelectElement);
    syncCustomSelect(pageSelectElement);
    syncCustomSelect(popupSelectElement);
    renderComponentLists();
    renderDashboardPreview();
    return;
  }
  for (const projectSummary of projects) {
    projectSelectElement.append(new Option(projectSummary.name, projectSummary.id));
  }
  projectSelectElement.disabled = false;
  syncCustomSelect(projectSelectElement);
  await openProjectDraft(restoredEditorProject(projects, preferredProjectId));
}
/**
 * 用一份新文档替换当前草稿，并负责历史记录与局部重绘。文档签名相同直接返回；写库前先 await guardInteraction3dChanges：
 * 3D 交互模块有自己的异步保存流程，不等它完成就替换文档会造成两边数据互相覆盖。重绘走两条路 —— 结构未变时用
 * applyEditorComponentUpdates 只更新受影响的组件（结构变化过大才整体重建）；changedComponentList 为空数组是「无变化但有历史」，走局部更新。
 */
async function applyDocumentChange(
  updatedDocument,
  targetPagePath = pageSelectElement.value,
  { recordHistory: shouldRecordHistory = true } = {}
) {
  if (!activeProject) {
    throw new Error("请先选择仪表盘。");
  }
  const currentDocument = activeProject.document;
  const updatedSignature = documentSignature(updatedDocument);
  if (documentSignature(currentDocument) === updatedSignature) {
    return activeProject;
  }
  await guardInteraction3dChanges(currentDocument, updatedDocument);
  const changedComponentList = collectChangedComponents(
    currentDocument,
    updatedDocument,
    targetPagePath
  );
  const editHistoryEntry = createEditHistoryEntry();
  activeProject = {
    ...activeProject,
    document: clone(updatedDocument)
  };
  if (shouldRecordHistory) {
    pushHistoryEntry(historyState.undo, editHistoryEntry);
    historyState.redo = [];
  }
  const matchingProject = projects.find(
    candidateProject => candidateProject.id === activeProject.projectId
  );
  if (matchingProject) {
    matchingProject.name = activeProject.document.name;
  }
  const selectedProjectOption = projectSelectElement.selectedOptions[0];
  if (selectedProjectOption) {
    selectedProjectOption.textContent = activeProject.document.name;
  }
  syncCustomSelect(projectSelectElement);
  if (
    changedComponentList &&
    editorRenderer?.applyEditorComponentUpdates(
      activeProject.document,
      targetPagePath,
      changedComponentList
    )
  ) {
    renderComponentLists();
    syncInspector();
  } else {
    renderEditorWorkspace(targetPagePath);
  }
  refreshDirtyState({
    signature: updatedSignature
  });
  syncHistoryButtons();
  return activeProject;
}
/**
 * 把当前草稿写回后端（PUT /projects/{id}/draft）。请求体带 revision 做乐观锁：后端发现版本落后返回 409，
 * 由 handleOperationError 走冲突提示。globalPopupsDirty 只在弹窗定义真的变了时才置位，避免无谓抬升全局
 * 弹窗版本导致其它页面重绘；保存成功后清空各类「改动前基线」缓存。
 */
async function saveDraft() {
  if (!activeProject || !hasUnsavedChanges || isSaving) {
    return;
  }
  const baselineBeforeSave = clone(baselineDocument);
  const draftBeforeSave = clone(activeProject.document);
  const draftSignatureBeforeSave = documentSignature(draftBeforeSave);
  const popupsDirty =
    documentSignature(draftBeforeSave.customPopups || []) !==
    documentSignature(baselineDocument.customPopups || []);
  isSaving = true;
  refreshDirtyState();
  try {
    const saveResponse = await requestJson("/projects/" + activeProject.projectId + "/draft", {
      method: "PUT",
      hbLogContext: {
        projectId: activeProject.projectId,
        phase: "save-draft"
      },
      body: JSON.stringify({
        revision: activeProject.revision,
        globalPopupRevision: activeProject.globalPopupRevision,
        globalPopupsDirty: popupsDirty,
        document: activeProject.document
      })
    });
    activeProject = saveResponse;
    baselineDocument = clone(saveResponse.document);
    savedDocumentSignature = documentSignature(saveResponse.document);
    panelFrameBaselineByComponentId.clear();
    lineChartBaselineByComponentId.clear();
    iconButtonEffectBaselineByComponentId.clear();
    iconButtonBaselineByComponentId.clear();
    airConditionerBaselineByComponentId.clear();
    pushHistoryEntry(historyState.undo, {
      kind: "save",
      beforeSavedDocument: baselineBeforeSave,
      afterSavedDocument: clone(saveResponse.document)
    });
    historyState.redo = [];
    const savedProjectSummary = projects.find(
      listedProjectAfterSave => listedProjectAfterSave.id === activeProject.projectId
    );
    if (savedProjectSummary) {
      savedProjectSummary.name = activeProject.document.name;
    }
    const selectedOptionAfterSave = projectSelectElement.selectedOptions[0];
    if (selectedOptionAfterSave) {
      selectedOptionAfterSave.textContent = activeProject.document.name;
    }
    syncCustomSelect(projectSelectElement);
    if (documentSignature(saveResponse.document) !== draftSignatureBeforeSave) {
      renderEditorWorkspace(pageSelectElement.value);
    }
  } catch (saveError) {
    handleOperationError(saveError);
  } finally {
    isSaving = false;
    refreshDirtyState();
    syncHistoryButtons();
  }
}
/**
 * 撤销/重做跨越「保存锚点」时，把后端草稿回滚到该锚点的已保存版本。save 型历史记录保存的是保存前后的两份文档，
 * 撤销用 beforeSavedDocument、重做用 afterSavedDocument；回滚必须请求后端（后端持有「已保存」状态的 revision）。
 * 回滚后仍把用户当前未保存的改动放回 activeProject；只有当弹窗定义也变了才采用服务端返回的弹窗，避免本地较新的定义被覆盖。
 */
async function restoreSavedDocument(saveHistoryEntry, historyDirection) {
  const targetSavedDocument =
    historyDirection === "undo"
      ? saveHistoryEntry.beforeSavedDocument
      : saveHistoryEntry.afterSavedDocument;
  const popupsChanged =
    documentSignature(targetSavedDocument.customPopups || []) !==
    documentSignature(baselineDocument.customPopups || []);
  const currentDraftDocument = clone(activeProject.document);
  const currentPagePath = pageSelectElement.value;
  const restoreResponse = await requestJson("/projects/" + activeProject.projectId + "/draft", {
    method: "PUT",
    body: JSON.stringify({
      revision: activeProject.revision,
      globalPopupRevision: activeProject.globalPopupRevision,
      globalPopupsDirty: popupsChanged,
      document: targetSavedDocument
    })
  });
  baselineDocument = clone(restoreResponse.document);
  savedDocumentSignature = documentSignature(restoreResponse.document);
  if (!popupsChanged) {
    currentDraftDocument.customPopups = clone(restoreResponse.document.customPopups || []);
  }
  activeProject = {
    ...restoreResponse,
    document: currentDraftDocument
  };
  renderEditorWorkspace(currentPagePath);
  refreshDirtyState();
}
/**
 * 执行一步撤销或重做。先 await writeQueuePromise：写文档是串行的，若还有排队的写入没落盘就撤销，会把「撤销前的文档」
 * 又写回去，故必须等队列排空；historyState.busy 防止连点（撤销中途再触发会用错栈）。普通编辑记录会先把「当前状态」压到
 * 反向栈再应用目标文档，应用时过滤掉已不存在的组件 ID，否则选中集里会留下幽灵 ID 让检查器空白；失败时把记录压回原栈。
 */
async function applyHistoryStep(historyStepDirection) {
  // 等上一次写落定再走：它成功与否不影响本次操作（失败已由那一环的调用方报过）。
  await writeQueuePromise.catch(() => {});
  if (historyState.busy || !activeProject) {
    return;
  }
  const sourceStack = historyStepDirection === "undo" ? historyState.undo : historyState.redo;
  const targetStack = historyStepDirection === "undo" ? historyState.redo : historyState.undo;
  const historyStepEntry = sourceStack.pop();
  if (historyStepEntry) {
    historyState.busy = true;
    syncHistoryButtons();
    panelFrameBaselineByComponentId.clear();
    lineChartBaselineByComponentId.clear();
    iconButtonEffectBaselineByComponentId.clear();
    iconButtonBaselineByComponentId.clear();
    airConditionerBaselineByComponentId.clear();
    try {
      if (historyStepEntry.kind === "save") {
        await restoreSavedDocument(historyStepEntry, historyStepDirection);
        pushHistoryEntry(targetStack, historyStepEntry);
      } else {
        const redoHistoryEntry = createEditHistoryEntry();
        const validComponentIds = Array.isArray(historyStepEntry.selectedComponentIds)
          ? historyStepEntry.selectedComponentIds.filter(candidateComponentId =>
              findComponent(historyStepEntry.document, candidateComponentId)
            )
          : [];
        selectedComponentId = findComponent(
          historyStepEntry.document,
          historyStepEntry.selectedComponentId
        )
          ? historyStepEntry.selectedComponentId
          : validComponentIds[0] || null;
        selectedComponentIds = new Set(
          validComponentIds.length
            ? validComponentIds
            : selectedComponentId
              ? [selectedComponentId]
              : []
        );
        selectionAnchorComponentId = selectedComponentId;
        await applyDocumentChange(historyStepEntry.document, historyStepEntry.selectedPath, {
          recordHistory: false
        });
        pushHistoryEntry(targetStack, redoHistoryEntry);
      }
    } catch (historyError) {
      pushHistoryEntry(sourceStack, historyStepEntry);
      handleOperationError(historyError);
    } finally {
      historyState.busy = false;
      syncHistoryButtons();
      if (hasUnsavedChanges) {
        scheduleRecoverySnapshot();
      }
    }
  }
}
/**
 * 刷新登录态（GET /auth/me）。
 *
 * 主要靠副作用：会话失效时 requestJson 的 401 分支会直接跳登录页。
 */
async function refreshAuthSession() {
  await requestJson("/auth/me");
}
/**
 * 加载 Home Assistant 连接信息，回填表单与顶部状态文案。
 */
async function loadHaConnection({ preserveForm: keepHaForm = false } = {}) {
  haConnectionInfo = await requestJson("/ha/connection");
  const haFormVisible = haDialogElement.open && !haFormElement.hidden;
  if (!keepHaForm || (!isEditingHaConnection && !haFormVisible)) {
    haFormElement.elements.name.value = haConnectionInfo.name || "Home Assistant";
    haFormElement.elements.baseUrl.value = haConnectionInfo.baseUrl || "";
    haFormElement.elements.accessToken.value = "";
    haFormElement.elements.accessToken.placeholder = haConnectionInfo.hasToken
      ? "已加密保存，留空则保留原 Token"
      : "输入 Long-Lived Access Token";
    haFormElement.elements.verifyTls.checked = haConnectionInfo.verifyTls !== false;
  }
  const haConnectionHasError = !haConnectionInfo.connected && !!haConnectionInfo.lastError;
  haOpenButtonElement.classList.toggle("connected", haConnectionInfo.connected);
  haOpenButtonElement.classList.toggle("error", haConnectionHasError);
  haOpenButtonElement.querySelector("span").textContent = haConnectionInfo.connected
    ? ("HA 已连接 · " + (haConnectionInfo.version || "")).trim()
    : haConnectionInfo.lastError
      ? "HA 连接异常"
      : haConnectionInfo.configured
        ? "HA 重连中"
        : "HA 未配置";
  openHomeAssistantButtonElement.disabled =
    !haConnectionInfo.configured || !haConnectionInfo.baseUrl;
  syncHaConnectionUi();
}
/**
 * 拉取 HA 同步状态，必要时重载实体目录。用「目录版本 + 实体/设备/区域数量」拼出的签名判断是否重拉：只在首次连上
 * 或目录确实变化时才全量拉实体，避免每轮轮询都刷一遍；重载失败会把签名回滚，让下一轮还能重试（异常原样抛出）。
 */
async function refreshHaSyncStatus() {
  const haSyncStatus = await requestJson("/ha/sync/status");
  haConnectionStatus = haSyncStatus;
  const haSyncCounts = haSyncStatus.counts || {
    entities: 0,
    devices: 0,
    areas: 0
  };
  haSyncStateElement.textContent = haSyncStatus.configured
    ? haSyncStatus.connected
      ? "已连接并实时同步"
      : haSyncStatus.status === "error"
        ? "连接异常"
        : "正在连接或同步"
    : "尚未配置";
  haSyncDetailElement.textContent =
    "实体 " +
    haSyncCounts.entities +
    " · 设备 " +
    haSyncCounts.devices +
    " · 区域 " +
    haSyncCounts.areas;
  syncHaConnectionUi();
  if (!haSyncStatus.configured) {
    lastConnectedSignature = null;
    areEntitiesLoaded = false;
    if (entities.length || devices.length || Object.keys(entityResourcesByDeviceId).length) {
      entities = [];
      devices = [];
      deviceNamesByDeviceId = new Map();
      entityResourcesByDeviceId = {};
      editorRenderer?.setEntityCatalog([], {}, []);
      dashboardPreviewRenderer?.setEntityCatalog([], {}, []);
      syncPopupEntityInputs();
      if (!document.activeElement?.closest?.(".inspector-form")) {
        syncInspector();
      }
    }
    return;
  }
  const connectedSignature = JSON.stringify([
    Number.isFinite(Number(haSyncStatus.catalogRevision))
      ? Number(haSyncStatus.catalogRevision)
      : haSyncStatus.lastFullSyncAt || "",
    Number(haSyncCounts.entities || 0),
    Number(haSyncCounts.devices || 0),
    Number(haSyncCounts.areas || 0)
  ]);
  if (
    (haSyncStatus.connected || haSyncStatus.status === "connected") &&
    connectedSignature !== lastConnectedSignature
  ) {
    const previousConnectedSignature = lastConnectedSignature;
    lastConnectedSignature = connectedSignature;
    try {
      await ensureEntitiesLoaded({
        afterCurrent: true
      });
    } catch (entityLoadError) {
      if (lastConnectedSignature === connectedSignature) {
        lastConnectedSignature = previousConnectedSignature;
      }
      throw entityLoadError;
    }
  }
}
/**
 * 按 HA 配置状态在「查看态」与「编辑态」之间切换面板，并回填连接详情。
 */
function syncHaConnectionUi() {
  const haConfigured = !!haConnectionInfo?.configured;
  haConnectionViewElement.hidden = !haConfigured || isEditingHaConnection;
  haFormElement.hidden = haConfigured && !isEditingHaConnection;
  haSyncOverviewElement.hidden = haConfigured && !isEditingHaConnection;
  haEditCancelButtonElement.hidden = !haConfigured || !isEditingHaConnection;
  if (!haConfigured) {
    return;
  }
  const haDetailCounts = haConnectionStatus?.counts || {
    entities: 0,
    devices: 0,
    areas: 0
  };
  const isHaConnected = !!haConnectionInfo.connected || !!haConnectionStatus?.connected;
  const haDetailHasError =
    !isHaConnected && (!!haConnectionInfo.lastError || !!haConnectionStatus?.lastError);
  haDetailIndicatorElement.classList.toggle("connected", isHaConnected);
  haDetailIndicatorElement.classList.toggle("error", haDetailHasError);
  haDetailNameElement.textContent = haConnectionInfo.name || "Home Assistant";
  haDetailStatusElement.textContent = isHaConnected
    ? "已连接并实时同步"
    : haDetailHasError
      ? "连接异常"
      : "正在重连";
  haDetailUrlElement.textContent = haConnectionInfo.baseUrl || "—";
  haDetailUrlElement.title = haConnectionInfo.baseUrl || "";
  haDetailVersionElement.textContent = haConnectionInfo.version || "未知";
  haDetailCountsElement.textContent =
    "实体 " +
    haDetailCounts.entities +
    " · 设备 " +
    haDetailCounts.devices +
    " · 区域 " +
    haDetailCounts.areas;
  haDetailErrorElement.hidden = !haDetailHasError;
  haDetailErrorElement.textContent =
    (haDetailHasError && (haConnectionInfo.lastError || haConnectionStatus?.lastError)) || "";
}
/**
 * 进入 Home Assistant 连接信息的编辑态。用独立布尔量而不是直接看表单可见性：表单可见但处于只读展示时
 * 不能算编辑中，而 loadHaConnection 的 preserveForm 判断依赖这个标志。
 */
function startHaEditing() {
  isEditingHaConnection = true;
  syncHaConnectionUi();
  setSettingsMessage(haMessageElement, "");
}
/**
 * 退出 Home Assistant 连接信息的编辑态（不保存，也不主动还原表单）。表单内容会在下次 loadHaConnection
 * 时不带 preserveForm 重新拉取覆盖，所以这里只切状态。
 */
function cancelHaEditing() {
  isEditingHaConnection = false;
  syncHaConnectionUi();
}
/**
 * 等待若干毫秒。
 */
function waitForMs(delayMs) {
  return new Promise(resolveDelay => window.setTimeout(resolveDelay, delayMs));
}
/**
 * 刷新 HA 连接信息与同步状态。用共享的 haTestPromise 去重：并发调用只会发一轮请求，
 * 测试连接期间的轮询也不会叠加。
 */
async function refreshHaConnection({ preserveForm: keepRefreshForm = true } = {}) {
  return (
    haTestPromise ||
    ((haTestPromise = Promise.all([
      loadHaConnection({
        preserveForm: keepRefreshForm
      }),
      refreshHaSyncStatus()
    ]).finally(() => {
      haTestPromise = null;
    })),
    haTestPromise)
  );
}
/**
 * 轮询等待 HA 连接成功。每 500ms 重试一次；一旦出现 lastError 立即返回 false，不必空等到超时。
 *
 * @param {number} [timeoutMs=30000] 超时毫秒数。
 */
async function waitForHaConnection(timeoutMs = 30000) {
  const deadlineTime = Date.now() + timeoutMs;
  while (Date.now() < deadlineTime) {
    await refreshHaConnection({
      preserveForm: false
    });
    if (haConnectionInfo?.connected) {
      return true;
    }
    if (haConnectionInfo?.lastError) {
      return false;
    }
    await waitForMs(500);
  }
  return !!haConnectionInfo?.connected;
}
/**
 * 从 HA 连接表单收集配置值。
 *
 * @throws {Error} 要求 Token 但未填写时抛出中文提示。
 */
function collectHaConnectionInput(requireToken = false, reuseTokenForNewUrl = false) {
  const haFormData = new FormData(haFormElement);
  const accessTokenInput = String(haFormData.get("accessToken") || "").trim();
  if (requireToken && !accessTokenInput) {
    throw new Error("测试连接时请输入 Home Assistant Token。");
  }
  return {
    name: String(haFormData.get("name") || "").trim(),
    baseUrl: String(haFormData.get("baseUrl") || "").trim(),
    accessToken: accessTokenInput || null,
    verifyTls: haFormData.get("verifyTls") === "on",
    /**
     * 换地址时是否确认「继续复用已保存的令牌」。
     * 后端默认拒绝：地址可以被随手改掉，而旧令牌会被发到新地址去试连，
     * 因此必须由用户显式确认（见下方 409 分支）。
     */
    reuseTokenForNewUrl
  };
}
/**
 * 打开项目对话框，按模式（新建 / 编辑 / 改分辨率）回填表单与按钮文案。
 */
function openProjectDialog(dialogMode = "create") {
  projectDialogMode = dialogMode;
  const isEditDialogMode = dialogMode === "edit";
  const isResizeMode = dialogMode === "resize";
  projectFormElement.reset();
  projectDialogKickerElement.textContent = isResizeMode
    ? "RESIZE DASHBOARD"
    : isEditDialogMode
      ? "EDIT PROJECT"
      : "NEW PROJECT";
  projectDialogTitleElement.textContent = isResizeMode
    ? "修改仪表盘分辨率"
    : isEditDialogMode
      ? "修改仪表盘"
      : "创建仪表盘项目";
  projectSubmitButtonElement.textContent = isResizeMode
    ? "应用修改"
    : isEditDialogMode
      ? "保存修改"
      : "创建项目";
  projectFormElement.elements.name.value =
    isEditDialogMode || isResizeMode ? activeProject?.document?.name || "" : "我的仪表盘";
  projectCanvasWidthInputElement.readOnly = false;
  projectCanvasHeightInputElement.readOnly = false;
  projectContentLockCheckboxElement.checked = false;
  projectContentLockFieldsElement.hidden = !isResizeMode;
  projectCanvasFieldsElement.classList.remove("fixed", "name-only");
  if (!isEditDialogMode && !isResizeMode) {
    isAspectLocked = false;
    lockedCanvasWidth = 2778;
    lockedCanvasHeight = 1940;
    projectCanvasWidthInputElement.value = "2778";
    projectCanvasHeightInputElement.value = "1940";
    renderAspectRatio();
  } else if (isEditDialogMode) {
    projectCanvasFieldsElement.hidden = false;
    projectCanvasFieldsElement.classList.add("name-only");
  } else {
    const resizeWidth = Number(activeProject?.document?.canvas?.width || 2778);
    const resizeHeight = Number(activeProject?.document?.canvas?.height || 1940);
    isAspectLocked = true;
    lockedCanvasWidth = resizeWidth;
    lockedCanvasHeight = resizeHeight;
    projectCanvasFieldsElement.hidden = false;
    projectCanvasWidthInputElement.value = String(resizeWidth);
    projectCanvasHeightInputElement.value = String(resizeHeight);
    projectCanvasHintElement.textContent =
      "默认会同步调整所有页面、控件和弹窗；勾选“锁定控件大小及位置”后只改变画布，内容本身不会缩放或重新定位。";
    renderAspectRatio();
    syncAspectLockButton(false);
  }
  setSettingsMessage(projectMessageElement, "");
  projectDialogElement.showModal();
}
/**
 * 计算并显示画布宽高的最简比例。未锁定时按输入框里的实时值算，锁定时按锁定基准算，这样锁定后比例
 * 读数不会因中间的取整来回跳动；输入非法时显示占位文案而不是算出错误比例。
 */
function renderAspectRatio() {
  const widthInput = Number(projectCanvasWidthInputElement.value);
  const heightInput = Number(projectCanvasHeightInputElement.value);
  if (
    !Number.isInteger(widthInput) ||
    !Number.isInteger(heightInput) ||
    widthInput <= 0 ||
    heightInput <= 0
  ) {
    projectAspectRatioElement.textContent = "等待输入有效分辨率";
    return;
  }
  const ratioWidthBase = isAspectLocked ? lockedCanvasWidth : widthInput;
  const ratioHeightBase = isAspectLocked ? lockedCanvasHeight : heightInput;
  const ratioDivisor = greatestCommonDivisor(ratioWidthBase, ratioHeightBase);
  projectAspectRatioElement.textContent =
    ratioWidthBase / ratioDivisor + " : " + ratioHeightBase / ratioDivisor;
}
/**
 * 同步画布比例锁定按钮的选中态、文案与 aria-pressed。锁定状态是三处一致的：class 管样式、aria-pressed
 * 管无障碍、label/title 管用户可读文案，缺一处就会出现「看起来锁了但读屏说没锁」这类不一致。
 */
function syncAspectLockButton() {
  const isAspectLockActive = isAspectLocked;
  projectAspectLockButtonElement.disabled = false;
  projectAspectLockButtonElement.setAttribute("aria-pressed", String(isAspectLockActive));
  projectAspectLockButtonElement.classList.toggle("locked", isAspectLockActive);
  projectAspectLockLabelElement.textContent = isAspectLockActive ? "已锁定" : "锁定";
  projectAspectLockButtonElement.title = isAspectLockActive
    ? "点击解锁画布比例"
    : "锁定当前画布比例";
}
/**
 * 锁定比例时，按被改动的一侧自动换算另一侧。换算结果若越过画布尺寸上下限（宽 320–7680、高 240–4320），
 * 先把越界那侧夹到边界，再反推被改动侧，保证两侧同时合法而不是只夹一侧。
 */
function syncLockedCanvasDimension(changedDimension) {
  if (!isAspectLocked) {
    return;
  }
  const lockedWidthValue = Number(lockedCanvasWidth);
  const lockedHeightValue = Number(lockedCanvasHeight);
  if (!!lockedWidthValue && !!lockedHeightValue) {
    if (changedDimension === "width") {
      let nextWidthValue = Number(projectCanvasWidthInputElement.value);
      if (!Number.isInteger(nextWidthValue) || nextWidthValue < 320 || nextWidthValue > 7680) {
        return;
      }
      let correctedHeightValue = Math.round(
        (nextWidthValue * lockedHeightValue) / lockedWidthValue
      );
      if (correctedHeightValue < 240 || correctedHeightValue > 4320) {
        correctedHeightValue = Math.max(240, Math.min(4320, correctedHeightValue));
        nextWidthValue = Math.max(
          320,
          Math.min(7680, Math.round((correctedHeightValue * lockedWidthValue) / lockedHeightValue))
        );
        projectCanvasWidthInputElement.value = String(nextWidthValue);
      }
      projectCanvasHeightInputElement.value = String(correctedHeightValue);
    } else {
      let nextHeightValue = Number(projectCanvasHeightInputElement.value);
      if (!Number.isInteger(nextHeightValue) || nextHeightValue < 240 || nextHeightValue > 4320) {
        return;
      }
      let correctedWidthValue = Math.round(
        (nextHeightValue * lockedWidthValue) / lockedHeightValue
      );
      if (correctedWidthValue < 320 || correctedWidthValue > 7680) {
        correctedWidthValue = Math.max(320, Math.min(7680, correctedWidthValue));
        nextHeightValue = Math.max(
          240,
          Math.min(4320, Math.round((correctedWidthValue * lockedHeightValue) / lockedWidthValue))
        );
        projectCanvasHeightInputElement.value = String(nextHeightValue);
      }
      projectCanvasWidthInputElement.value = String(correctedWidthValue);
    }
  }
}
/**
 * 弹出画布尺寸变更警告：告知会有多少控件落在画布外，等用户决定是否继续。返回的是挂起的 Promise，
 * 由 settleCanvasResizeWarning 在用户点击时兑现，因此调用方可以用 await 把对话框当成同步确认来写。
 */
function confirmCanvasResize(overflowComponentCount, targetWidth, targetHeight) {
  projectResizeWarningTextElement.textContent =
    "当前分辨率为 " +
    targetWidth +
    " × " +
    targetHeight +
    "，预计有 " +
    overflowComponentCount +
    " 个控件会部分或全部位于画布范围之外。";
  return new Promise(resolveResizeWarning => {
    resizeWarningResolve = resolveResizeWarning;
    projectResizeWarningDialogElement.showModal();
  });
}
/**
 * 关闭画布缩放警告框并兑现 confirmCanvasResize 挂起的 Promise。
 */
function settleCanvasResizeWarning(resizeChoice) {
  const pendingResizeResolve = resizeWarningResolve;
  resizeWarningResolve = null;
  if (projectResizeWarningDialogElement.open) {
    projectResizeWarningDialogElement.close();
  }
  pendingResizeResolve?.(resizeChoice);
}
/**
 * 打开页面对话框（新建或重命名）。
 */
function openPageDialog(requestedPageMode = "create") {
  if (!activeProject) {
    return;
  }
  pageDialogMode = requestedPageMode;
  const isRenameMode = requestedPageMode === "rename";
  pageFormElement.reset();
  pageDialogKickerElement.textContent = isRenameMode ? "EDIT PAGE" : "NEW PAGE";
  pageDialogTitleElement.textContent = isRenameMode ? "重命名页面" : "新建页面";
  pageSubmitButtonElement.textContent = isRenameMode ? "保存修改" : "创建页面";
  pageFormElement.elements.name.value = (isRenameMode && currentPage()?.name) || "";
  setSettingsMessage(pageMessageElement, "");
  pageDialogElement.showModal();
}
/**
 * 守卫「会丢弃当前编辑」的操作：有未保存改动就提示并阻止。
 */
function guardUnsavedChanges() {
  if (hasUnsavedChanges) {
    handleOperationError(new Error("当前有未保存修改，请先点击顶部的“保存”。"));
    return true;
  } else {
    return false;
  }
}
/**
 * 渲染授权状态：顶部按钮、详情面板与激活表单的显示规则。状态码分三档配色：ACTIVE 为正常，
 * CONNECTION_WARNING / STARTUP_VALIDATION_REQUIRED 为警告，其余（租约到期、实例不匹配、无效、
 * 被撤销、时间回拨）为错误。
 */
function renderLicenseStatus(licenseState) {
  const licenseStatusLabelByCode = {
    UNACTIVATED: "尚未激活",
    ACTIVE: "授权有效",
    CONNECTION_WARNING: "授权连接异常",
    STARTUP_VALIDATION_REQUIRED: "等待启动校验",
    LEASE_EXPIRED: "租约已到期",
    INSTANCE_MISMATCH: "硬件绑定不匹配",
    INVALID: "租约无效",
    DEACTIVATED: "授权已停用",
    REVOKED: "授权已撤销",
    CLOCK_ROLLBACK: "系统时间异常"
  };
  const licenseStatusCode = licenseState?.status || "UNACTIVATED";
  const licenseActive = licenseStatusCode === "ACTIVE";
  const licenseWarning = ["CONNECTION_WARNING", "STARTUP_VALIDATION_REQUIRED"].includes(
    licenseStatusCode
  );
  const licenseError = [
    "LEASE_EXPIRED",
    "INSTANCE_MISMATCH",
    "INVALID",
    "DEACTIVATED",
    "REVOKED",
    "CLOCK_ROLLBACK"
  ].includes(licenseStatusCode);
  const hideReactivate = [
    "UNACTIVATED",
    "INSTANCE_MISMATCH",
    "REVOKED",
    "DEACTIVATED"
  ].includes(licenseStatusCode);
  licenseOpenButtonElement.classList.toggle("connected", licenseActive);
  licenseOpenButtonElement.classList.toggle("warning", licenseWarning);
  licenseOpenButtonElement.classList.toggle("error", licenseError);
  licenseOpenButtonElement.querySelector("span").textContent =
    !licenseState?.required && licenseStatusCode === "UNACTIVATED"
      ? "授权 · 开发模式"
      : licenseStatusLabelByCode[licenseStatusCode] || "授权状态";
  licenseDetailIndicatorElement.className = licenseActive
    ? "connected"
    : licenseWarning
      ? "warning"
      : licenseError
        ? "error"
        : "";
  licenseDetailStatusElement.textContent =
    licenseStatusLabelByCode[licenseStatusCode] || licenseStatusCode;
  licenseDetailEditionElement.textContent = licenseState?.activationCodeId
    ? "当前编辑器的授权与附加包"
    : licenseState?.required
      ? "尚未激活"
      : "开发模式";
  licenseCardController.render(licenseState);
  licenseDetailErrorElement.hidden = !licenseState?.lastError;
  licenseDetailErrorElement.textContent = licenseState?.lastError || "";
  // 重试入口与其说明，露出与否由后端 canRetry 决定：终态（未激活 / 已撤销）下留一个
  // 必然失败的重试按钮，只会让用户反复点，而真正该做的是填激活码。
  // 文案复用共用表且不传 lastError —— 那句话已经由上面的错误行显示过一次了。
  licenseDialogRetryButtonElement.hidden = !licenseState?.canRetry;
  setSettingsMessage(
    licenseRetryMessageElement,
    licenseState?.canRetry || licenseState?.retrying || licenseState?.retryable
      ? licenseMessage(licenseState || {})
      : "",
    licenseError ? "error" : ""
  );
  const recoveryHintElement = document.querySelector("#license-recovery-hint");
  if (recoveryHintElement) {
    if (licenseStatusCode === "INSTANCE_MISMATCH") {
      recoveryHintElement.hidden = false;
      recoveryHintElement.textContent =
        "换机、升级或硬件变更后会出现此状态。请到商店账号中心解除设备绑定，冷却结束后用商店购买邮箱与激活码重新激活。";
    } else {
      recoveryHintElement.hidden = true;
      recoveryHintElement.textContent = "";
    }
  }
  licenseReactivateButtonElement.hidden = hideReactivate;
  // 「重新激活」失败会要求用户自己填激活码，此时即使状态允许无感续租也必须留着表单，
  // 否则 15 秒一次的状态轮询会在用户输到一半时把它收回去。
  licenseFormElement.hidden = !(
    isLicenseActivationFormRequested ||
    [
      "UNACTIVATED",
      "DEACTIVATED",
      "INVALID",
      "INSTANCE_MISMATCH",
      "REVOKED"
    ].includes(licenseStatusCode)
  );
}
/**
 * 强制展开授权激活表单并显示错误提示（「重新激活」失败后调用）。
 */
function revealLicenseActivationForm(message) {
  isLicenseActivationFormRequested = true;
  licenseFormElement.hidden = false;
  setSettingsMessage(licenseMessageElement, message, "error");
  licenseFormElement.querySelector('input[name="email"]')?.focus();
}
/**
 * 查询授权状态；未授权且为强制授权模式时直接跳转 /license 页。features 变化会重载素材目录（可用素材与部分功能按授权特性
 * 下发，特性变化意味着目录也可能变化），这里 reloadAssetCatalog 传 refreshInspector: false，因为本函数常由定时器调用，
 * 不该打断用户正在编辑的表单。返回响应体，供调用方判断是否需要弹出。
 */
async function refreshLicenseStatus() {
  const licenseResponse = await requestJson("/license/status");
  if (licenseResponse?.required && !licenseResponse.allowed) {
    window.location.replace("/license");
    return licenseResponse;
  }
  const featureSignature = JSON.stringify([...(licenseResponse?.features || [])].sort());
  const featuresChanged =
    lastLicenseFeatureSignature !== null && lastLicenseFeatureSignature !== featureSignature;
  lastLicenseFeatureSignature = featureSignature;
  if (featuresChanged) {
    await reloadAssetCatalog({
      refreshInspector: false
    });
  }
  renderLicenseStatus(licenseResponse);
  return licenseResponse;
}
bindLicenseSection();

bindProjectSection();

bindDialogSection();

const textInputConfigsByElement = new Map([
  [
    imageLabelTextInputElement,
    {
      componentType: "image",
      property: "label",
      trim: true
    }
  ],
  [
    iconButtonEffectLabelTextInputElement,
    {
      componentType: "icon-button-effect",
      property: "label",
      trim: true
    }
  ],
  [
    titleButtonLabelTextInputElement,
    {
      componentType: "title-button",
      property: "label",
      trim: true
    }
  ],
  [
    titleButtonMainTextInputElement,
    {
      componentType: "title-button",
      property: "mainText",
      trim: false
    }
  ],
  [
    titleButtonSecondaryLine1TextInputElement,
    {
      componentType: "title-button",
      property: "secondaryText",
      trim: false,
      getValue: () =>
        titleButtonSecondaryLine1TextInputElement.value +
        "\n" +
        titleButtonSecondaryLine2TextInputElement.value
    }
  ],
  [
    titleButtonSecondaryLine2TextInputElement,
    {
      componentType: "title-button",
      property: "secondaryText",
      trim: false,
      getValue: () =>
        titleButtonSecondaryLine1TextInputElement.value +
        "\n" +
        titleButtonSecondaryLine2TextInputElement.value
    }
  ],
  [
    lightStatisticsLabelTextInputElement,
    {
      componentType: "light-statistics",
      property: "label",
      trim: true
    }
  ],
  [
    lightStatisticsTitleTextInputElement,
    {
      componentType: "light-statistics",
      property: "title",
      trim: false
    }
  ],
  [
    iconButtonLabelTextInputElement,
    {
      componentType: "icon-button",
      componentTypes: ["icon-button", "device-button", "presence-sensor"],
      property: "label",
      trim: true
    }
  ],
  [
    iconButtonMainTextInputElement,
    {
      componentType: "icon-button",
      componentTypes: ["icon-button", "device-button", "presence-sensor"],
      property: "mainText",
      trim: false
    }
  ],
  [
    iconButtonSecondaryTextInputElement,
    {
      componentType: "icon-button",
      componentTypes: ["icon-button", "device-button", "presence-sensor"],
      property: "secondaryText",
      trim: false
    }
  ],
  [
    vacuumMapLabelTextInputElement,
    {
      componentType: "vacuum-map",
      property: "label",
      trim: true
    }
  ],
  [
    cameraLabelTextInputElement,
    {
      componentType: "camera",
      property: "label",
      trim: true
    }
  ],
  [
    airConditionerLabelTextInputElement,
    {
      componentType: "air-conditioner",
      property: "label",
      trim: true
    }
  ],
  [
    airConditionerMainTextInputElement,
    {
      componentType: "air-conditioner",
      property: "mainText",
      trim: false
    }
  ],
  [
    airConditionerSecondaryTextInputElement,
    {
      componentType: "air-conditioner",
      property: "secondaryText",
      trim: false
    }
  ],
  [
    timeLabelTextInputElement,
    {
      componentType: "time",
      property: "label",
      trim: true
    }
  ],
  [
    dateLabelTextInputElement,
    {
      componentType: "date",
      property: "label",
      trim: true
    }
  ],
  [
    weatherLabelTextInputElement,
    {
      componentType: "weather",
      property: "label",
      trim: true
    }
  ],
  [
    lineChartLabelTextInputElement,
    {
      componentType: "line-chart",
      property: "label",
      trim: true
    }
  ],
  [
    panelFrameLabelTextInputElement,
    {
      componentType: "panel-frame",
      property: "label",
      trim: true
    }
  ],
  [
    panelFrameMainTextInputElement,
    {
      componentType: "panel-frame",
      property: "mainText",
      trim: false
    }
  ],
  [
    panelFrameSecondaryTextInputElement,
    {
      componentType: "panel-frame",
      property: "secondaryText",
      trim: false
    }
  ],
  [
    navigationLabelTextInputElement,
    {
      componentType: "navigation-button",
      property: "label",
      trim: true
    }
  ],
  [
    navigationMainTextInputElement,
    {
      componentType: "navigation-button",
      property: "mainText",
      trim: false
    }
  ],
  [
    navigationSecondaryTextInputElement,
    {
      componentType: "navigation-button",
      property: "secondaryText",
      trim: false
    }
  ]
]);
const inputEditStateByElement = new WeakMap();
for (const [textInputElement, fieldConfig] of textInputConfigsByElement) {
  textInputElement.addEventListener("focus", () => {
    if (!!activeProject && !!selectedComponentId) {
      inputEditStateByElement.set(textInputElement, {
        componentId: selectedComponentId,
        before: createEditHistoryEntry(),
        historyRecorded: false
      });
    }
  });
  textInputElement.addEventListener("input", () => {
    if (!activeProject || !selectedComponentId) {
      return;
    }
    const focusedComponentRecord = findComponent(activeProject.document, selectedComponentId);
    const allowedComponentTypes = fieldConfig.componentTypes || [fieldConfig.componentType];
    if (
      !focusedComponentRecord?.component ||
      !allowedComponentTypes.includes(focusedComponentRecord.component.type)
    ) {
      return;
    }
    const rawFieldValue = fieldConfig.getValue ? fieldConfig.getValue() : textInputElement.value;
    const fieldValue = fieldConfig.trim ? rawFieldValue.trim() : rawFieldValue;
    if (
      String(focusedComponentRecord.component.properties?.[fieldConfig.property] || "") ===
      fieldValue
    ) {
      return;
    }
    let editState = inputEditStateByElement.get(textInputElement);
    if (!editState || editState.componentId !== selectedComponentId) {
      editState = {
        componentId: selectedComponentId,
        before: createEditHistoryEntry(),
        historyRecorded: false
      };
      inputEditStateByElement.set(textInputElement, editState);
    }
    if (!editState.historyRecorded) {
      pushHistoryEntry(historyState.undo, editState.before);
      historyState.redo = [];
      editState.historyRecorded = true;
    }
    focusedComponentRecord.component.properties = {
      ...(focusedComponentRecord.component.properties || {}),
      [fieldConfig.property]: fieldValue
    };
    if (fieldConfig.property === "label") {
      renderComponentLists();
      editorRenderer?.previewComponentProperties(focusedComponentRecord.component.id, {
        label: fieldValue
      });
      dashboardPreviewRenderer?.previewComponentProperties(focusedComponentRecord.component.id, {
        label: fieldValue
      });
    }
    if (fieldConfig.componentType === "navigation-button" && fieldConfig.property !== "label") {
      editorRenderer?.previewComponentProperties(focusedComponentRecord.component.id, {
        [fieldConfig.property]: fieldValue
      });
    }
    if (fieldConfig.componentType === "panel-frame" && fieldConfig.property !== "label") {
      editorRenderer?.previewComponentProperties(focusedComponentRecord.component.id, {
        [fieldConfig.property]: fieldValue
      });
    }
    if (fieldConfig.componentType === "icon-button-effect" && fieldConfig.property !== "label") {
      editorRenderer?.previewComponentProperties(focusedComponentRecord.component.id, {
        [fieldConfig.property]: fieldValue
      });
    }
    if (
      ["title-button", "light-statistics", "icon-button", "air-conditioner"].includes(
        fieldConfig.componentType
      ) &&
      fieldConfig.property !== "label"
    ) {
      editorRenderer?.previewComponentProperties(focusedComponentRecord.component.id, {
        [fieldConfig.property]: fieldValue
      });
    }
    refreshDirtyState();
    syncHistoryButtons();
  });
  textInputElement.addEventListener("blur", () => inputEditStateByElement.delete(textInputElement));
}
initActionPopupConfig();
for (const actionControlNode of document.querySelectorAll(".component-action-controls")) {
  actionControlNode.addEventListener("click", actionControlClickEvent => {
    const hiddenContentElement = actionControlClickEvent.target.closest(
      "[data-hidden-content-clickable]"
    );
    if (hiddenContentElement && selectedComponentId) {
      mutateDocument(hiddenContentDraftDocument => {
        const hiddenContentComponent = findComponent(
          hiddenContentDraftDocument,
          selectedComponentId
        )?.component;
        if (
          !!hiddenContentComponent &&
          !!["title-button", "device-button", "icon-button-effect"].includes(
            hiddenContentComponent.type
          )
        ) {
          hiddenContentComponent.properties = {
            ...(hiddenContentComponent.properties || {}),
            hiddenContentClickable: hiddenContentElement.dataset.hiddenContentClickable === "on"
          };
        }
      });
      return;
    }
    const actionTypeButton = actionControlClickEvent.target.closest("[data-action-type]");
    const actionTriggerHost = actionTypeButton?.closest("[data-action-trigger]");
    const actionComponentId = selectedComponentId;
    if (
      !actionTypeButton ||
      !actionTriggerHost ||
      !actionComponentId ||
      actionTypeButton.disabled
    ) {
      return;
    }
    const actionType = ACTION_TYPES.includes(actionTypeButton.dataset.actionType)
      ? actionTypeButton.dataset.actionType
      : "none";
    const actionTrigger = actionTriggerHost.dataset.actionTrigger;
    if (["tap", "doubleTap", "hold"].includes(actionTrigger)) {
      mutateDocument(actionDraftDocument => {
        const actionComponent = findComponent(actionDraftDocument, actionComponentId)?.component;
        if (!actionComponent) {
          return;
        }
        const actionBoundEntityId = actionComponent.bindings?.entity?.entityId;
        const isLightStatisticsAction = actionComponent.type === "light-statistics";
        const actionPopupConfig = actionPopupData(actionComponent.actions?.[actionTrigger]);
        const popupSource =
          actionType === "more-info" &&
          !actionBoundEntityId &&
          actionPopupConfig.source === "current"
            ? (actionDraftDocument.customPopups || []).length
              ? "custom"
              : "entity"
            : actionPopupConfig.source;
        const moreInfoData =
          actionType === "more-info"
            ? {
                popupSource: popupSource,
                ...(popupSource === "entity"
                  ? {
                      entityId: actionPopupConfig.entityId || entities[0]?.entityId || ""
                    }
                  : {}),
                ...(popupSource === "custom"
                  ? {
                      popupId:
                        actionPopupConfig.popupId || actionDraftDocument.customPopups?.[0]?.id || ""
                    }
                  : {})
              }
            : {};
        const hadMoreInfoAction = actionComponent.actions?.[actionTrigger]?.type === "more-info";
        const existingTarget = actionComponent.actions?.[actionTrigger]?.target;
        const targetPageValue =
          actionComponent.type === "navigation-button"
            ? actionComponent.properties?.targetPage
            : "";
        const documentPagePaths = new Set(
          actionDraftDocument.pages.map(documentPage => documentPage.path)
        );
        const navigateTarget = documentPagePaths.has(existingTarget)
          ? existingTarget
          : documentPagePaths.has(targetPageValue)
            ? targetPageValue
            : pageSelectElement.value || actionDraftDocument.pages[0]?.path;
        const resolvedActionType =
          actionType === "none" ||
          componentActionIsSupported(
            actionComponent,
            actionType === "navigate"
              ? {
                  type: "navigate",
                  target: navigateTarget
                }
              : actionType === "more-info"
                ? {
                    type: "more-info",
                    data: moreInfoData
                  }
                : {
                    type: actionType
                  },
            {
              pagePaths: documentPagePaths,
              popupIds: new Set(
                (actionDraftDocument.customPopups || []).map(customPopup => customPopup.id)
              )
            }
          )
            ? actionType
            : "none";
        actionComponent.actions = {
          ...(actionComponent.actions || {})
        };
        if (resolvedActionType === "none") {
          if (actionComponent.type === "camera" && actionTrigger === "tap") {
            actionComponent.actions[actionTrigger] = {
              type: "none"
            };
          } else {
            delete actionComponent.actions[actionTrigger];
          }
        } else if (resolvedActionType === "navigate") {
          actionComponent.actions[actionTrigger] = {
            type: "navigate",
            target: navigateTarget
          };
        } else if (resolvedActionType === "more-info") {
          actionComponent.actions[actionTrigger] = {
            type: "more-info",
            data:
              actionComponent.actions?.[actionTrigger]?.type === "more-info"
                ? {
                    ...clone(actionComponent.actions[actionTrigger].data || {}),
                    ...moreInfoData
                  }
                : moreInfoData
          };
        } else {
          actionComponent.actions[actionTrigger] = {
            type: resolvedActionType
          };
        }
        if (
          !isLightStatisticsAction &&
          resolvedActionType === "more-info" &&
          !hadMoreInfoAction &&
          !actionComponent.properties?.relatedEntities &&
          relatedPopupContext(actionComponent, entitiesByEntityId(), devicesByDeviceId())
        ) {
          actionComponent.properties = {
            ...(actionComponent.properties || {}),
            relatedEntities: manualRelatedEntityConfig([])
          };
        }
      });
    }
  });
  actionControlNode.addEventListener("change", actionControlChangeEvent => {
    const popupSourceElement = actionControlChangeEvent.target.closest(
      "[data-popup-source], [data-popup-entity], [data-popup-custom]"
    );
    const popupTriggerHost = popupSourceElement?.closest("[data-action-trigger]");
    if (popupSourceElement && popupTriggerHost && selectedComponentId) {
      const popupTrigger = popupTriggerHost.dataset.actionTrigger;
      mutateDocument(popupDraftDocument => {
        const popupComponent = findComponent(popupDraftDocument, selectedComponentId)?.component;
        if (!popupComponent || !["tap", "doubleTap", "hold"].includes(popupTrigger)) {
          return;
        }
        const selectedPopupSource = popupTriggerHost.querySelector("[data-popup-source]").value;
        const popupDataPatch = {
          popupSource: selectedPopupSource
        };
        if (selectedPopupSource === "entity") {
          popupDataPatch.entityId = popupTriggerHost.querySelector("[data-popup-entity]").value;
        }
        if (selectedPopupSource === "custom") {
          popupDataPatch.popupId = popupTriggerHost.querySelector("[data-popup-custom]").value;
        }
        popupComponent.actions = {
          ...(popupComponent.actions || {}),
          [popupTrigger]: {
            type: "more-info",
            data: popupDataPatch
          }
        };
      });
      return;
    }
    const actionTargetSelect = actionControlChangeEvent.target.closest("[data-action-target]");
    const targetTriggerHost = actionTargetSelect?.closest("[data-action-trigger]");
    const targetComponentId = selectedComponentId;
    if (!actionTargetSelect || !targetTriggerHost || !targetComponentId) {
      return;
    }
    const targetTrigger = targetTriggerHost.dataset.actionTrigger;
    if (["tap", "doubleTap", "hold"].includes(targetTrigger)) {
      mutateDocument(navigateDraftDocument => {
        const navigateComponent = findComponent(
          navigateDraftDocument,
          targetComponentId
        )?.component;
        if (
          !!navigateComponent &&
          !!navigateDraftDocument.pages.some(
            targetPageCandidate => targetPageCandidate.path === actionTargetSelect.value
          )
        ) {
          navigateComponent.actions = {
            ...(navigateComponent.actions || {}),
            [targetTrigger]: {
              type: "navigate",
              target: actionTargetSelect.value
            }
          };
          if (navigateComponent.type === "navigation-button") {
            navigateComponent.properties = {
              ...(navigateComponent.properties || {}),
              targetPage: actionTargetSelect.value
            };
          }
        }
      });
    }
  });
  actionControlNode.addEventListener("click", popupPreviewClickEvent => {
    const popupPreviewElement = popupPreviewClickEvent.target.closest("[data-popup-preview]");
    const previewTriggerHost = popupPreviewElement?.closest("[data-action-trigger]");
    const previewComponent = selectedComponent();
    if (
      !popupPreviewElement ||
      !previewTriggerHost ||
      !previewComponent ||
      popupPreviewElement.disabled
    ) {
      return;
    }
    if (editorMode !== "edit") {
      handleOperationError(new Error("请切换到编辑模式后再预览弹窗。"));
      return;
    }
    const previewPopupSource = previewTriggerHost.querySelector("[data-popup-source]").value;
    const previewPopupData = {
      popupSource: previewPopupSource
    };
    if (previewPopupSource === "entity") {
      previewPopupData.entityId = previewTriggerHost.querySelector("[data-popup-entity]").value;
    }
    if (previewPopupSource === "custom") {
      previewPopupData.popupId = previewTriggerHost.querySelector("[data-popup-custom]").value;
    }
    try {
      ensureEditorRenderer().previewAction(previewComponent, {
        type: "more-info",
        data: previewPopupData
      });
    } catch (popupPreviewError) {
      handleOperationError(popupPreviewError);
    }
  });
}
bindDocumentSection();

/**
 * 向指定 3D 导图预览 iframe 发送相机指令。预览跑在 iframe 里，跨文档只能走 postMessage；
 * targetOrigin 固定用同源 window.location.origin，而不是通配的 "*"。
 */
function postDiagramCameraCommand(iframeComponentId, cameraCommand, cameraCommandValue = null) {
  const diagramPreviewFrame = document.querySelector(
    '.hb-component[data-component-id="' +
      CSS.escape(iframeComponentId) +
      '"] .hb-floorplan-auto-diagram-preview'
  );
  if (diagramPreviewFrame?.contentWindow) {
    diagramPreviewFrame.contentWindow.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-camera",
        componentId: iframeComponentId,
        command: cameraCommand,
        value: cameraCommandValue
      },
      window.location.origin
    );
    return true;
  } else {
    return false;
  }
}
/**
 * 向户型预览 iframe 下发「切换楼层」命令。通过 postMessage 与内嵌的 3D 预览通信，targetOrigin 固定为
 * 当前站点源，避免消息泄露给第三方页面；iframe 尚未就绪（没有 contentWindow）时返回 false，由调用方
 * 决定是否忽略（文档里的值已经写好了，刷新后仍会生效）。
 */
function postDiagramFloorCommand(floorDiagramComponentId, floorLevelValue) {
  const floorDiagramFrame = document.querySelector(
    '.hb-component[data-component-id="' +
      CSS.escape(floorDiagramComponentId) +
      '"] .hb-floorplan-auto-diagram-preview'
  );
  if (floorDiagramFrame?.contentWindow) {
    floorDiagramFrame.contentWindow.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-floor",
        componentId: floorDiagramComponentId,
        command: "set-floor",
        value: floorLevelValue
      },
      window.location.origin
    );
    return true;
  } else {
    return false;
  }
}
/**
 * 强制重载一个户型预览 iframe（清掉 is-ready 并加回加载提示）。用时间戳查询参数（auto-diagram-refresh）
 * 绕开浏览器缓存，因为 iframe 的 src 不变时浏览器不会重新请求，而重新载入必须拿到新的 HTML。
 */
function reloadDiagramPreview(diagramPreviewElement) {
  if (!diagramPreviewElement?.isConnected) {
    return;
  }
  const diagramHostElement = diagramPreviewElement.closest(".hb-floorplan-auto-diagram");
  if (!diagramHostElement) {
    return;
  }
  diagramPreviewElement.classList.remove("is-ready");
  let diagramLoadingElement = diagramHostElement.querySelector(
    ".hb-floorplan-auto-diagram-loading"
  );
  if (!diagramLoadingElement) {
    diagramLoadingElement = document.createElement("div");
    diagramLoadingElement.className = "hb-floorplan-auto-diagram-loading";
    diagramLoadingElement.innerHTML =
      '<i aria-hidden="true"></i><strong>正在重新载入3D户型…</strong>';
    diagramHostElement.append(diagramLoadingElement);
  }
  const diagramUrl = new URL(diagramPreviewElement.src, window.location.origin);
  diagramUrl.searchParams.set("auto-diagram-refresh", String(Date.now()));
  diagramPreviewElement.src = diagramUrl.toString();
}
bindFloorplanSection();

/**
 * 「导图保存完成」浮层的当前实例；同一时刻只允许存在一个。
 */
let autoDiagramCompleteOverlay = null;
/**
 * 移除导图完成浮层（没有时是空操作）。
 * 先取出引用再置空：移除过程中若抛错，也不会留下一个指向已移除节点的「伪存在」状态。
 */
function closeAutoDiagramCompleteDialog() {
  const overlayElement = autoDiagramCompleteOverlay;
  overlayElement && ((autoDiagramCompleteOverlay = null), overlayElement.remove());
}
/**
 * 提示「导图已生成并置入仪表盘」。
 *
 * 「点得掉」是这个浮层唯一不能出错的属性：它铺满整个编辑区，只要有一个出口失效
 * （完成按钮 / 关闭按钮 / 背景点击 / Esc）就等于把编辑器锁死。所以四个出口都显式接上，
 * 并在 pagehide 时兜底移除 —— 浮层挂在 body 上，页面被隐藏后残留的监听会一直引用旧 DOM。
 *
 * 参数:
 *   manifest: 后台导出清单，用 overwritten 决定文案、relativePath 显示保存位置。
 *   counts: 本次置换掉的图片数与效果按钮数，来自文档变更的返回值。
 */
function showAutoDiagramCompleteDialog(manifest, { buttonCount = 0, imageCount = 0 } = {}) {
  closeAutoDiagramCompleteDialog();
  const isOverwritten = manifest?.overwritten === true;
  const overlayElement = document.createElement("div");
  overlayElement.className = "floorplan-auto-diagram-complete-overlay";
  overlayElement.setAttribute("role", "dialog");
  overlayElement.setAttribute("aria-modal", "true");
  overlayElement.setAttribute("aria-label", isOverwritten ? "导图覆盖完成" : "导图保存完成");
  // 结构用静态字符串：动态内容一律事后 textContent 写入，避免把后台字段当 HTML 拼。
  overlayElement.innerHTML = [
    '<section class="settings-dialog floorplan-auto-diagram-dialog floorplan-auto-diagram-complete-dialog" tabindex="-1">',
    '<div class="dialog-heading"><div><span>EXPORT COMPLETE</span><h2 data-export-complete-title></h2></div>',
    '<button type="button" class="icon-button" data-export-complete-close aria-label="关闭导图完成提示">×</button></div>',
    '<div class="floorplan-auto-diagram-guide">',
    "<p data-export-complete-message></p>",
    '<div class="export-notice-summary"><span>保存位置</span><strong data-export-complete-path></strong></div>',
    '<div class="dialog-actions"><button type="button" class="primary" data-export-complete-confirm>完成</button></div>',
    "</div></section>"
  ].join("");
  overlayElement.querySelector("[data-export-complete-title]").textContent = isOverwritten
    ? "导图覆盖完成"
    : "导图保存完成";
  overlayElement.querySelector("[data-export-complete-message]").textContent = isOverwritten
    ? "新导图已安全替换，并更新 " + imageCount + " 张图片和 " + buttonCount + " 个效果按钮。"
    : "导图已置入仪表盘，共生成 " +
      imageCount +
      " 张图片和 " +
      buttonCount +
      " 个效果按钮。";
  overlayElement.querySelector("[data-export-complete-path]").textContent =
    "data/" + (manifest?.relativePath || "exports");
  // isClosed 保证四个出口重复触发时只关一次（Esc 与 point 事件常会连着来）。
  let isClosed = false;
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    // 两个全局监听必须显式摘掉：它们挂在 window / document 上，浮层移除后仍会存活。
    window.removeEventListener("pagehide", close);
    document.removeEventListener("keydown", handleKeydown, true);
    closeAutoDiagramCompleteDialog();
  };
  const handleKeydown = keydownEvent => {
    keydownEvent.key === "Escape" && (keydownEvent.preventDefault(), close());
  };
  // 只有点在浮层本体（背景）上才算「点外部关闭」；点在对话框内部不该关。
  overlayElement.addEventListener("click", clickEvent => {
    clickEvent.target === overlayElement && close();
  });
  for (const dismissElement of overlayElement.querySelectorAll(
    "[data-export-complete-close], [data-export-complete-confirm]"
  )) {
    dismissElement.addEventListener("click", close);
  }
  window.addEventListener("pagehide", close);
  // 捕获阶段监听 Esc：编辑器内部监听器密集，冒泡阶段可能先被它们吞掉。
  document.addEventListener("keydown", handleKeydown, true);
  autoDiagramCompleteOverlay = overlayElement;
  document.body.appendChild(overlayElement);
  // 焦点交给主按钮：键盘用户回车即可关闭，读屏也会播报对话框标签。
  overlayElement.querySelector("[data-export-complete-confirm]")?.focus();
}
bindMessageSection();

const effectPropertyConfigsByElement = new Map([
  [
    iconButtonEffectColorTemperatureRealtimeCheckboxElement,
    {
      property: "effectColorTemperatureRealtime",
      type: "boolean"
    }
  ],
  [
    iconButtonEffectBrightnessRealtimeCheckboxElement,
    {
      property: "effectBrightnessRealtime",
      type: "boolean"
    }
  ],
  [
    iconButtonEffectIconOffColorInputElement,
    {
      property: "iconOffColor"
    }
  ],
  [
    iconButtonEffectIconOnColorInputElement,
    {
      property: "iconOnColor"
    }
  ],
  [
    iconButtonEffectIconSizeInputElement,
    {
      property: "iconSize",
      min: 1,
      max: 100
    }
  ],
  [
    iconButtonEffectButtonOffColorInputElement,
    {
      property: "buttonOffColor"
    }
  ],
  [
    iconButtonEffectButtonOnColorInputElement,
    {
      property: "buttonOnColor"
    }
  ],
  [
    iconButtonEffectButtonOpacityInputElement,
    {
      property: "buttonOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonEffectFrameColorInputElement,
    {
      property: "frameColor"
    }
  ],
  [
    iconButtonEffectFrameWidthInputElement,
    {
      property: "frameWidth",
      min: 0,
      max: 20
    }
  ],
  [
    iconButtonEffectFrameOpacityInputElement,
    {
      property: "frameOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonEffectRadiusInputElement,
    {
      property: "radius",
      min: 0,
      max: 50
    }
  ],
  [
    iconButtonEffectGlowColorInputElement,
    {
      property: "glowColor"
    }
  ],
  [
    iconButtonEffectGlowOffStrengthInputElement,
    {
      property: "glowOffStrength",
      min: 0,
      max: 300,
      divisor: 100
    }
  ],
  [
    iconButtonEffectGlowOnStrengthInputElement,
    {
      property: "glowOnStrength",
      min: 0,
      max: 300,
      divisor: 100
    }
  ],
  [
    iconButtonEffectEffectOpacityInputElement,
    {
      property: "effectOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonEffectEffectFadeDurationInputElement,
    {
      property: "effectFadeDuration",
      min: 0,
      max: 3
    }
  ],
  [
    iconButtonEffectEffectLeftInputElement,
    {
      property: "effectLeft",
      min: -100,
      max: 200
    }
  ],
  [
    iconButtonEffectEffectTopInputElement,
    {
      property: "effectTop",
      min: -100,
      max: 200
    }
  ],
  [
    iconButtonEffectEffectScaleInputElement,
    {
      property: "effectScale",
      min: 1,
      max: 500,
      divisor: 100
    }
  ],
  [
    iconButtonEffectEffectRotationInputElement,
    {
      property: "effectRotation",
      min: -360,
      max: 360
    }
  ]
]);
const effectPreviewStateByElement = new Map([
  [iconButtonEffectIconOffColorInputElement, "off"],
  [iconButtonEffectButtonOffColorInputElement, "off"],
  [iconButtonEffectGlowOffStrengthInputElement, "off"],
  [iconButtonEffectIconOnColorInputElement, "on"],
  [iconButtonEffectButtonOnColorInputElement, "on"],
  [iconButtonEffectGlowOnStrengthInputElement, "on"]
]);
const effectTransformInputSet = new Set([
  iconButtonEffectLeftInputElement,
  iconButtonEffectTopInputElement,
  iconButtonEffectWidthInputElement,
  iconButtonEffectHeightInputElement,
  iconButtonEffectScaleInputElement,
  iconButtonEffectRotationInputElement
]);
/**
 * 根据获得焦点的输入框，把图标按钮效果的预览切到对应的开/关态：效果组件的属性成对出现（Off 组与 On 组），
 * 聚焦哪一组就预览哪一组，这样用户调「关闭态」的颜色时看到的就是关闭态效果。
 * 预览状态记录在 iconButtonEffectPreviewStateByComponentId 里，不写入文档。
 */
function applyEffectPreviewState(eventTarget) {
  const previewButtonState = effectPreviewStateByElement.get(eventTarget);
  const effectPreviewComponent = selectedComponent();
  if (!!previewButtonState && effectPreviewComponent?.type === "icon-button-effect") {
    iconButtonEffectPreviewStateByComponentId.set(effectPreviewComponent.id, previewButtonState);
    editorRenderer?.setComponentPreviewState(effectPreviewComponent.id, previewButtonState);
    for (const previewToggleElement of iconButtonEffectPreviewStateElement.querySelectorAll(
      "[data-ibe-preview]"
    )) {
      const isPreviewActive = previewToggleElement.dataset.ibePreview === previewButtonState;
      previewToggleElement.classList.toggle("active", isPreviewActive);
      previewToggleElement.setAttribute("aria-pressed", String(isPreviewActive));
    }
  }
}
for (const previewEventName of ["focusin", "pointerdown"]) {
  iconButtonEffectInspectorFormElement.addEventListener(previewEventName, focusEvent =>
    applyEffectPreviewState(focusEvent.target)
  );
}
bindIconButtonEffectSection();

const titleButtonConfigsByElement = new Map([
  [
    titleButtonMainColorInputElement,
    {
      property: "mainColor"
    }
  ],
  [
    titleButtonSecondaryColorInputElement,
    {
      property: "secondaryColor"
    }
  ],
  [
    titleButtonMainSizeInputElement,
    {
      property: "mainSize",
      min: 8,
      max: 200
    }
  ],
  [
    titleButtonSecondarySizeInputElement,
    {
      property: "secondarySize",
      min: 6,
      max: 100
    }
  ],
  [
    titleButtonMainWeightInputElement,
    {
      property: "mainWeight",
      min: 0,
      max: 1
    }
  ],
  [
    titleButtonSecondaryWeightInputElement,
    {
      property: "secondaryWeight",
      min: 0,
      max: 1
    }
  ],
  [
    titleButtonMainSpacingInputElement,
    {
      property: "mainSpacing",
      min: -20,
      max: 100
    }
  ],
  [
    titleButtonSecondarySpacingInputElement,
    {
      property: "secondarySpacing",
      min: -20,
      max: 100
    }
  ],
  [
    titleButtonSecondaryLineGapInputElement,
    {
      property: "secondaryLineGap",
      min: 0,
      max: 100
    }
  ],
  [
    titleButtonMainLeftInputElement,
    {
      property: "mainTextLeft",
      min: -100,
      max: 200
    }
  ],
  [
    titleButtonMainTopInputElement,
    {
      property: "mainTextTop",
      min: -100,
      max: 200
    }
  ],
  [
    titleButtonSecondaryLeftInputElement,
    {
      property: "secondaryTextLeft",
      min: -100,
      max: 200
    }
  ],
  [
    titleButtonSecondaryTopInputElement,
    {
      property: "secondaryTextTop",
      min: -100,
      max: 200
    }
  ],
  [
    titleButtonIconColorInputElement,
    {
      property: "iconColor"
    }
  ],
  [
    titleButtonIconSizeInputElement,
    {
      property: "iconSize",
      min: 1,
      max: 100
    }
  ],
  [
    titleButtonIconLeftInputElement,
    {
      property: "iconLeft",
      min: -100,
      max: 200
    }
  ],
  [
    titleButtonIconTopInputElement,
    {
      property: "iconTop",
      min: -100,
      max: 200
    }
  ],
  [
    titleButtonFrameColorInputElement,
    {
      property: "frameColor"
    }
  ],
  [
    titleButtonFrameWidthInputElement,
    {
      property: "frameWidth",
      min: 0,
      max: 12
    }
  ],
  [
    titleButtonFrameSizeInputElement,
    {
      property: "frameSize",
      min: 10,
      max: 300
    }
  ],
  [
    titleButtonFrameSpacingInputElement,
    {
      property: "frameSpacing",
      min: 0,
      max: 300
    }
  ],
  [
    titleButtonFrameOffsetXInputElement,
    {
      property: "frameOffsetX",
      min: -100,
      max: 100
    }
  ],
  [
    titleButtonFrameOffsetYInputElement,
    {
      property: "frameOffsetY",
      min: -100,
      max: 100
    }
  ],
  [
    titleButtonMarkerColorInputElement,
    {
      property: "markerColor"
    }
  ],
  [
    titleButtonMarkerSizeInputElement,
    {
      property: "markerSize",
      min: 2,
      max: 60
    }
  ],
  [
    titleButtonMarkerLeftInputElement,
    {
      property: "markerLeft",
      min: -100,
      max: 200
    }
  ],
  [
    titleButtonMarkerTopInputElement,
    {
      property: "markerTop",
      min: -100,
      max: 200
    }
  ]
]);
const titleButtonTransformKeyByElement = new Map([
  [titleButtonLeftInputElement, "left"],
  [titleButtonTopInputElement, "top"],
  [titleButtonWidthInputElement, "width"],
  [titleButtonHeightInputElement, "height"],
  [titleButtonScaleInputElement, "scale"],
  [titleButtonRotationInputElement, "rotation"]
]);
const lightStatisticsConfigsByElement = new Map([
  [
    lightStatisticsIconColorInputElement,
    {
      property: "iconColor"
    }
  ],
  [
    lightStatisticsIconActiveColorInputElement,
    {
      property: "iconActiveColor"
    }
  ],
  [
    lightStatisticsIconSizeInputElement,
    {
      property: "iconSize",
      min: 8,
      max: 100
    }
  ],
  [
    lightStatisticsTitleColorInputElement,
    {
      property: "titleColor"
    }
  ],
  [
    lightStatisticsTitleSizeInputElement,
    {
      property: "titleSize",
      min: 8,
      max: 100
    }
  ],
  [
    lightStatisticsTitleWeightInputElement,
    {
      property: "titleWeight",
      min: 0,
      max: 1
    }
  ],
  [
    lightStatisticsTitleSpacingInputElement,
    {
      property: "titleSpacing",
      min: -20,
      max: 100
    }
  ],
  [
    lightStatisticsCountColorInputElement,
    {
      property: "countColor"
    }
  ],
  [
    lightStatisticsCountActiveColorInputElement,
    {
      property: "countActiveColor"
    }
  ],
  [
    lightStatisticsCountSizeInputElement,
    {
      property: "countSize",
      min: 8,
      max: 140
    }
  ],
  [
    lightStatisticsCountWeightInputElement,
    {
      property: "countWeight",
      min: 0,
      max: 1
    }
  ],
  [
    lightStatisticsCountSpacingInputElement,
    {
      property: "countSpacing",
      min: -20,
      max: 100
    }
  ],
  [
    lightStatisticsIconGapInputElement,
    {
      property: "iconGap",
      min: 0,
      max: 40
    }
  ],
  [
    lightStatisticsCountGapInputElement,
    {
      property: "countGap",
      min: 0,
      max: 40
    }
  ]
]);
const lightStatisticsTransformKeyByElement = new Map([
  [lightStatisticsLeftInputElement, "left"],
  [lightStatisticsTopInputElement, "top"],
  [lightStatisticsWidthInputElement, "width"],
  [lightStatisticsHeightInputElement, "height"],
  [lightStatisticsScaleInputElement, "scale"],
  [lightStatisticsRotationInputElement, "rotation"]
]);
const presenceConfigsByElement = new Map([
  [
    presenceHaloScaleXInputElement,
    {
      property: "haloScaleX",
      min: 20,
      max: 300,
      divisor: 100
    }
  ],
  [
    presenceHaloScaleYInputElement,
    {
      property: "haloScaleY",
      min: 20,
      max: 300,
      divisor: 100
    }
  ],
  [
    presenceHaloRotationInputElement,
    {
      property: "haloRotation",
      min: -360,
      max: 360
    }
  ],
  [
    presenceHaloOpacityInputElement,
    {
      property: "haloOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    presencePersonScaleInputElement,
    {
      property: "personScale",
      min: 20,
      max: 300,
      divisor: 100
    }
  ],
  [
    presencePersonRotationInputElement,
    {
      property: "personRotation",
      min: -360,
      max: 360
    }
  ],
  [
    presencePersonOpacityInputElement,
    {
      property: "personOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    presenceOrbitDurationInputElement,
    {
      property: "orbitDuration",
      min: 2,
      max: 60
    }
  ],
  [
    iconButtonIconColorInputElement,
    {
      property: "iconColor"
    }
  ],
  [
    deviceButtonIconOnColorInputElement,
    {
      property: deviceComponent =>
        deviceComponent.type !== "presence-sensor"
          ? "iconOnColor"
          : deviceComponent.properties?.sensorKind === "water-leak"
            ? "waterLeakColor"
            : deviceComponent.properties?.sensorKind === "smoke"
              ? "smokeColor"
              : deviceComponent.properties?.sensorKind === "natural-gas"
                ? "naturalGasColor"
                : "iconOnColor"
    }
  ],
  [
    deviceButtonBadgeColorInputElement,
    {
      property: "badgeColor"
    }
  ],
  [
    deviceButtonBadgeOpacityInputElement,
    {
      property: "badgeOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    deviceButtonSymbolSizeInputElement,
    {
      property: "symbolSize",
      min: 1,
      max: 100
    }
  ],
  [
    deviceButtonBadgeSizeInputElement,
    {
      property: "badgeSize",
      min: 1,
      max: 100
    }
  ],
  [
    iconButtonIconSizeInputElement,
    {
      property: "iconSize",
      min: 1,
      max: 100
    }
  ],
  [
    iconButtonIconOffOpacityInputElement,
    {
      property: "iconOffOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonIconOnOpacityInputElement,
    {
      property: "iconOnOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonIconLeftInputElement,
    {
      property: "iconLeft",
      min: -100,
      max: 200
    }
  ],
  [
    iconButtonIconTopInputElement,
    {
      property: "iconTop",
      min: -100,
      max: 200
    }
  ],
  [
    iconButtonMainColorInputElement,
    {
      property: "mainColor"
    }
  ],
  [
    iconButtonSecondaryColorInputElement,
    {
      property: "secondaryColor"
    }
  ],
  [
    iconButtonMainOffOpacityInputElement,
    {
      property: "mainOffOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonMainOnOpacityInputElement,
    {
      property: "mainOnOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonSecondaryOffOpacityInputElement,
    {
      property: "secondaryOffOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonSecondaryOnOpacityInputElement,
    {
      property: "secondaryOnOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonMainSizeInputElement,
    {
      property: "mainSize",
      min: 6,
      max: 120
    }
  ],
  [
    iconButtonSecondarySizeInputElement,
    {
      property: "secondarySize",
      min: 5,
      max: 80
    }
  ],
  [
    iconButtonMainWeightInputElement,
    {
      property: "mainWeight",
      min: 0,
      max: 1
    }
  ],
  [
    iconButtonSecondaryWeightInputElement,
    {
      property: "secondaryWeight",
      min: 0,
      max: 1
    }
  ],
  [
    iconButtonMainSpacingInputElement,
    {
      property: "mainSpacing",
      min: -20,
      max: 100
    }
  ],
  [
    iconButtonSecondarySpacingInputElement,
    {
      property: "secondarySpacing",
      min: -20,
      max: 100
    }
  ],
  [
    iconButtonMainLeftInputElement,
    {
      property: "mainTextLeft",
      min: -100,
      max: 200
    }
  ],
  [
    iconButtonMainTopInputElement,
    {
      property: "mainTextTop",
      min: -100,
      max: 200
    }
  ],
  [
    iconButtonSecondaryLeftInputElement,
    {
      property: "secondaryTextLeft",
      min: -100,
      max: 200
    }
  ],
  [
    iconButtonSecondaryTopInputElement,
    {
      property: "secondaryTextTop",
      min: -100,
      max: 200
    }
  ],
  [
    iconButtonOnFillColorInputElement,
    {
      property: "onFillColor"
    }
  ],
  [
    iconButtonOnFillStrengthInputElement,
    {
      property: "onFillStrength",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonOnFillFadeDurationInputElement,
    {
      property: "onFillFadeDuration",
      min: 0,
      max: 3
    }
  ],
  [
    iconButtonFrameWidthInputElement,
    {
      property: "frameWidth",
      min: 0,
      max: 12
    }
  ],
  [
    iconButtonFrameAngleInputElement,
    {
      property: "frameAngle",
      min: 0,
      max: 360
    }
  ],
  [
    iconButtonFrameOffOpacityInputElement,
    {
      property: "frameOffOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonFrameOnOpacityInputElement,
    {
      property: "frameOnOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    iconButtonCutCornerInputElement,
    {
      property: "cutCorner",
      min: 0,
      max: 50
    }
  ],
  [
    iconButtonSoftLightColorInputElement,
    {
      property: "softLightColor"
    }
  ],
  [
    iconButtonSoftLightStrengthInputElement,
    {
      property: "softLightStrength",
      min: 0,
      max: 500,
      divisor: 100
    }
  ],
  [
    iconButtonSoftLightSizeInputElement,
    {
      property: "softLightSize",
      min: 0,
      max: 300,
      divisor: 100
    }
  ],
  [
    iconButtonSoftLightAngleInputElement,
    {
      property: "softLightAngle",
      min: 0,
      max: 360
    }
  ],
  [
    iconButtonGlowColorInputElement,
    {
      property: "glowColor"
    }
  ],
  [
    iconButtonGlowStrengthInputElement,
    {
      property: "glowStrength",
      min: 0,
      max: 500,
      divisor: 100
    }
  ],
  [
    iconButtonGlowSizeInputElement,
    {
      property: "glowSize",
      min: 0,
      max: 300,
      divisor: 100
    }
  ],
  [
    iconButtonGlowAngleInputElement,
    {
      property: "glowAngle",
      min: 0,
      max: 360
    }
  ]
]);
const iconButtonTransformKeyByElement = new Map([
  [iconButtonLeftInputElement, "left"],
  [iconButtonTopInputElement, "top"],
  [iconButtonWidthInputElement, "width"],
  [iconButtonHeightInputElement, "height"],
  [iconButtonScaleInputElement, "scale"],
  [iconButtonRotationInputElement, "rotation"]
]);
const airConditionerConfigsByElement = new Map([
  [
    airConditionerIconOffColorInputElement,
    {
      property: "iconOffColor"
    }
  ],
  [
    airConditionerIconOnColorInputElement,
    {
      property: "iconOnColor"
    }
  ],
  [
    airConditionerBadgeColorInputElement,
    {
      property: "badgeColor"
    }
  ],
  [
    airConditionerBadgeOpacityInputElement,
    {
      property: "badgeOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ],
  [
    airConditionerSymbolSizeInputElement,
    {
      property: "symbolSize",
      min: 1,
      max: 100
    }
  ],
  [
    airConditionerBadgeSizeInputElement,
    {
      property: "badgeSize",
      min: 1,
      max: 100
    }
  ],
  [
    airConditionerIconLeftInputElement,
    {
      property: "iconLeft",
      min: -100,
      max: 200
    }
  ],
  [
    airConditionerIconTopInputElement,
    {
      property: "iconTop",
      min: -100,
      max: 200
    }
  ],
  [
    airConditionerMainColorInputElement,
    {
      property: "mainColor"
    }
  ],
  [
    airConditionerMainSizeInputElement,
    {
      property: "mainSize",
      min: 6,
      max: 120
    }
  ],
  [
    airConditionerMainWeightInputElement,
    {
      property: "mainWeight",
      min: 0,
      max: 1
    }
  ],
  [
    airConditionerMainSpacingInputElement,
    {
      property: "mainSpacing",
      min: -20,
      max: 100
    }
  ],
  [
    airConditionerMainLeftInputElement,
    {
      property: "mainTextLeft",
      min: -100,
      max: 200
    }
  ],
  [
    airConditionerMainTopInputElement,
    {
      property: "mainTextTop",
      min: -100,
      max: 200
    }
  ],
  [
    airConditionerSecondaryColorInputElement,
    {
      property: "secondaryColor"
    }
  ],
  [
    airConditionerSecondarySizeInputElement,
    {
      property: "secondarySize",
      min: 5,
      max: 80
    }
  ],
  [
    airConditionerSecondaryWeightInputElement,
    {
      property: "secondaryWeight",
      min: 0,
      max: 1
    }
  ],
  [
    airConditionerSecondarySpacingInputElement,
    {
      property: "secondarySpacing",
      min: -20,
      max: 100
    }
  ],
  [
    airConditionerSecondaryLeftInputElement,
    {
      property: "secondaryTextLeft",
      min: -100,
      max: 200
    }
  ],
  [
    airConditionerSecondaryTopInputElement,
    {
      property: "secondaryTextTop",
      min: -100,
      max: 200
    }
  ],
  [
    airConditionerAirflowCoolColorInputElement,
    {
      property: "airflowCoolColor"
    }
  ],
  [
    airConditionerAirflowHeatColorInputElement,
    {
      property: "airflowHeatColor"
    }
  ],
  [
    airConditionerAirflowOtherColorInputElement,
    {
      property: "airflowOtherColor"
    }
  ],
  [
    airConditionerAirflowAngleInputElement,
    {
      property: "airflowAngle",
      min: -360,
      max: 360
    }
  ],
  [
    airConditionerAirflowCurveInputElement,
    {
      property: "airflowCurve",
      min: -200,
      max: 200
    }
  ],
  [
    airConditionerAirflowLengthInputElement,
    {
      property: "airflowLength",
      min: 10,
      max: 300
    }
  ],
  [
    airConditionerAirflowFadeInputElement,
    {
      property: "airflowFadePosition",
      min: 15,
      max: 100
    }
  ],
  [
    airConditionerAirflowSpreadInputElement,
    {
      property: "airflowSpread",
      min: 10,
      max: 300
    }
  ],
  [
    airConditionerAirflowDensityInputElement,
    {
      property: "airflowDensity",
      min: 20,
      max: 200
    }
  ],
  [
    airConditionerAirflowIrregularityInputElement,
    {
      property: "airflowIrregularity",
      min: 0,
      max: 200
    }
  ],
  [
    airConditionerAirflowThicknessInputElement,
    {
      property: "airflowThickness",
      min: 5,
      max: 300
    }
  ],
  [
    airConditionerAirflowStrengthInputElement,
    {
      property: "airflowStrength",
      min: 0,
      max: 500
    }
  ],
  [
    airConditionerAirflowBlurInputElement,
    {
      property: "airflowBlur",
      min: 0,
      max: 30
    }
  ],
  [
    airConditionerAirflowSpeedInputElement,
    {
      property: "airflowSpeed",
      min: 0.3,
      max: 12
    }
  ],
  [
    airConditionerAirflowOffsetXInputElement,
    {
      property: "airflowOffsetX",
      limits: (offsetLimitsComponent, offsetLimitsDocument) => {
        const offsetBoundsX = airflowCanvasOffsetBounds(
          offsetLimitsComponent,
          offsetLimitsDocument.canvas
        );
        return {
          min: offsetBoundsX.minX,
          max: offsetBoundsX.maxX
        };
      }
    }
  ],
  [
    airConditionerAirflowOffsetYInputElement,
    {
      property: "airflowOffsetY",
      limits: (offsetLimitsComponentY, offsetLimitsDocumentY) => {
        const offsetBoundsY = airflowCanvasOffsetBounds(
          offsetLimitsComponentY,
          offsetLimitsDocumentY.canvas
        );
        return {
          min: offsetBoundsY.minY,
          max: offsetBoundsY.maxY
        };
      }
    }
  ],
  [
    airConditionerAirflowWidthInputElement,
    {
      property: "airflowWidth",
      min: 1,
      max: 500
    }
  ],
  [
    airConditionerAirflowHeightInputElement,
    {
      property: "airflowHeight",
      min: 1,
      max: 500
    }
  ],
  [
    airConditionerAirflowScaleInputElement,
    {
      property: "airflowScale",
      min: 1,
      max: 500,
      divisor: 100
    }
  ],
  [
    airConditionerAirflowRotationInputElement,
    {
      property: "airflowRotation",
      min: -360,
      max: 360
    }
  ]
]);
const airConditionerTransformKeyByElement = new Map([
  [airConditionerLeftInputElement, "left"],
  [airConditionerTopInputElement, "top"],
  [airConditionerWidthInputElement, "width"],
  [airConditionerHeightInputElement, "height"],
  [airConditionerScaleInputElement, "scale"],
  [airConditionerRotationInputElement, "rotation"]
]);
const cameraConfigsByElement = new Map([
  [
    cameraFrameColorInputElement,
    {
      property: "frameColor"
    }
  ],
  [
    cameraFrameWidthInputElement,
    {
      property: "frameWidth",
      min: 0,
      max: 20
    }
  ],
  [
    cameraRadiusInputElement,
    {
      property: "radius",
      min: 0,
      max: 50,
      divisor: 100
    }
  ],
  [
    cameraFrameAngleInputElement,
    {
      property: "frameAngle",
      min: 0,
      max: 360
    }
  ],
  [
    cameraFrameOpacityInputElement,
    {
      property: "frameOpacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ]
]);
const vacuumMapConfigsByElement = new Map([
  [
    vacuumMapOpacityInputElement,
    {
      property: "opacity",
      min: 0,
      max: 100,
      divisor: 100
    }
  ]
]);
const vacuumMapTransformKeyByElement = new Map([
  [vacuumMapLeftInputElement, "left"],
  [vacuumMapTopInputElement, "top"],
  [vacuumMapScaleInputElement, "scale"],
  [vacuumMapRotationInputElement, "rotation"]
]);
const cameraTransformKeyByElement = new Map([
  [cameraLeftInputElement, "left"],
  [cameraTopInputElement, "top"],
  [cameraWidthInputElement, "width"],
  [cameraHeightInputElement, "height"],
  [cameraScaleInputElement, "scale"],
  [cameraRotationInputElement, "rotation"]
]);
/**
 * 给一个检查器表单挂上 input（实时预览）与 change（提交文档）两套字段处理：input 只调 editorRenderer.preview* 做
 * 无副作用的即时预览，change 才走 mutateDocument 落盘，这样拖动输入框时不会把每一步中间值都写进历史。几何字段存的是
 * 画布百分比：位置按「画布尺寸 × 百分比 − 自身尺寸 ÷ 2」换算成左上角坐标；宽高下限取 0.1 而不是 0；scale 以 1~500 表示 0.01~5 倍；多选跳过 rotation。
 */
function bindInspectorFieldHandlers(
  inspectorFormElement,
  componentTypes,
  propertyConfigsByElement,
  transformKeyByElement
) {
  const acceptedComponentTypes = Array.isArray(componentTypes) ? componentTypes : [componentTypes];
  inspectorFormElement.addEventListener("input", inspectorInputEvent => {
    const inspectedFieldComponent = selectedComponent();
    if (
      !inspectedFieldComponent ||
      !acceptedComponentTypes.includes(inspectedFieldComponent.type)
    ) {
      return;
    }
    const configEntry = propertyConfigsByElement.get(inspectorInputEvent.target);
    if (configEntry) {
      const resolvedPropertyKey =
        typeof configEntry.property == "function"
          ? configEntry.property(inspectedFieldComponent)
          : configEntry.property;
      let previewFieldValue =
        inspectorInputEvent.target.type === "color"
          ? inspectorInputEvent.target.value
          : Number(inspectorInputEvent.target.value);
      if (inspectorInputEvent.target.type !== "color") {
        if (!Number.isFinite(previewFieldValue)) {
          return;
        }
        const effectiveLimits =
          configEntry.limits?.(inspectedFieldComponent, activeProject.document) || configEntry;
        previewFieldValue =
          clampNumber(previewFieldValue, effectiveLimits.min, effectiveLimits.max) /
          (configEntry.divisor || 1);
      }
      editorRenderer?.previewComponentProperties(inspectedFieldComponent.id, {
        [resolvedPropertyKey]: previewFieldValue
      });
      return;
    }
    const transformFieldKey = transformKeyByElement.get(inspectorInputEvent.target);
    const transformFieldValue = Number(inspectorInputEvent.target.value);
    if (!transformFieldKey || !Number.isFinite(transformFieldValue)) {
      return;
    }
    const inspectorCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const inspectorCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const inspectorPositionWidth = Number(inspectedFieldComponent.position?.width || 100);
    const inspectorPositionHeight = Number(inspectedFieldComponent.position?.height || 100);
    if (transformFieldKey === "left") {
      editorRenderer?.previewComponentTransform(inspectedFieldComponent.id, {
        x:
          (inspectorCanvasWidth * clampNumber(transformFieldValue, 0, 100)) / 100 -
          inspectorPositionWidth / 2
      });
    } else if (transformFieldKey === "top") {
      editorRenderer?.previewComponentTransform(inspectedFieldComponent.id, {
        y:
          (inspectorCanvasHeight * clampNumber(transformFieldValue, 0, 100)) / 100 -
          inspectorPositionHeight / 2
      });
    } else if (transformFieldKey === "width") {
      editorRenderer?.previewComponentTransform(inspectedFieldComponent.id, {
        width: (inspectorCanvasWidth * clampNumber(transformFieldValue, 0.1, 100)) / 100
      });
    } else if (transformFieldKey === "height") {
      editorRenderer?.previewComponentTransform(inspectedFieldComponent.id, {
        height: (inspectorCanvasHeight * clampNumber(transformFieldValue, 0.1, 100)) / 100
      });
    } else if (transformFieldKey === "scale") {
      editorRenderer?.previewComponentTransform(inspectedFieldComponent.id, {
        scale: clampNumber(transformFieldValue, 1, 500) / 100
      });
    } else if (transformFieldKey === "rotation" && selectedComponentIdsFromDom().length < 2) {
      editorRenderer?.previewComponentTransform(inspectedFieldComponent.id, {
        rotation: clampNumber(transformFieldValue, -360, 360)
      });
    }
  });
  inspectorFormElement.addEventListener("change", inspectorChangeEvent => {
    const changeConfigEntry = propertyConfigsByElement.get(inspectorChangeEvent.target);
    const changeTransformKey = transformKeyByElement.get(inspectorChangeEvent.target);
    if (!changeConfigEntry && !changeTransformKey) {
      return;
    }
    if (
      inspectorChangeEvent.target.type === "number" &&
      !Number.isFinite(Number(inspectorChangeEvent.target.value))
    ) {
      syncInspector();
      return;
    }
    const changeComponentId = selectedComponentId;
    const rotationSelectionIds =
      changeTransformKey === "rotation" ? selectedComponentIdsFromDom() : [];
    mutateDocument(changeDraftDocument => {
      const changeComponent = findComponent(changeDraftDocument, changeComponentId)?.component;
      if (!changeComponent || !acceptedComponentTypes.includes(changeComponent.type)) {
        return;
      }
      changeComponent.properties = {
        ...(changeComponent.properties || {})
      };
      changeComponent.position = {
        ...(changeComponent.position || {})
      };
      changeComponent.style = {
        ...(changeComponent.style || {})
      };
      if (changeConfigEntry) {
        const appliedPropertyKey =
          typeof changeConfigEntry.property == "function"
            ? changeConfigEntry.property(changeComponent)
            : changeConfigEntry.property;
        const appliedLimits =
          changeConfigEntry.limits?.(changeComponent, changeDraftDocument) || changeConfigEntry;
        changeComponent.properties[appliedPropertyKey] =
          inspectorChangeEvent.target.type === "color"
            ? inspectorChangeEvent.target.value
            : clampNumber(
                Number(inspectorChangeEvent.target.value),
                appliedLimits.min,
                appliedLimits.max
              ) / (changeConfigEntry.divisor || 1);
        return;
      }
      const changeCanvasWidth = Number(changeDraftDocument.canvas.width || 2778);
      const changeCanvasHeight = Number(changeDraftDocument.canvas.height || 1940);
      const changeFieldValue = Number(inspectorChangeEvent.target.value);
      if (changeTransformKey === "left") {
        changeComponent.position.x =
          (changeCanvasWidth * clampNumber(changeFieldValue, 0, 100)) / 100 -
          Number(changeComponent.position.width || 100) / 2;
      } else if (changeTransformKey === "top") {
        changeComponent.position.y =
          (changeCanvasHeight * clampNumber(changeFieldValue, 0, 100)) / 100 -
          Number(changeComponent.position.height || 100) / 2;
      } else if (changeTransformKey === "width") {
        changeComponent.position.width =
          (changeCanvasWidth * clampNumber(changeFieldValue, 0.1, 100)) / 100;
      } else if (changeTransformKey === "height") {
        changeComponent.position.height =
          (changeCanvasHeight * clampNumber(changeFieldValue, 0.1, 100)) / 100;
      } else if (changeTransformKey === "scale") {
        changeComponent.style.scale = clampNumber(changeFieldValue, 1, 500) / 100;
      } else if (changeTransformKey === "rotation") {
        setComponentsRotation(
          changeDraftDocument,
          changeComponentId,
          clampNumber(changeFieldValue, -360, 360),
          rotationSelectionIds
        );
      }
    });
  });
}
bindInspectorFieldHandlers(
  titleButtonInspectorFormElement,
  "title-button",
  titleButtonConfigsByElement,
  titleButtonTransformKeyByElement
);
bindInspectorFieldHandlers(
  lightStatisticsInspectorFormElement,
  "light-statistics",
  lightStatisticsConfigsByElement,
  lightStatisticsTransformKeyByElement
);
bindInspectorFieldHandlers(
  iconButtonInspectorFormElement,
  ["icon-button", "device-button", "presence-sensor"],
  presenceConfigsByElement,
  iconButtonTransformKeyByElement
);
bindInspectorFieldHandlers(
  airConditionerInspectorFormElement,
  "air-conditioner",
  airConditionerConfigsByElement,
  airConditionerTransformKeyByElement
);
bindInspectorFieldHandlers(
  vacuumMapInspectorFormElement,
  "vacuum-map",
  vacuumMapConfigsByElement,
  vacuumMapTransformKeyByElement
);
bindInspectorFieldHandlers(
  cameraInspectorFormElement,
  "camera",
  cameraConfigsByElement,
  cameraTransformKeyByElement
);
bindDeviceSection();

for (const [titleVisibilityElement, titleVisibilityKey] of [
  [titleButtonMainVisibleButtonElement, "mainTextVisible"],
  [titleButtonSecondaryVisibleButtonElement, "secondaryTextVisible"],
  [titleButtonIconVisibleButtonElement, "iconVisible"],
  [titleButtonFrameVisibleButtonElement, "frameVisible"],
  [titleButtonMarkerVisibleButtonElement, "markerVisible"]
]) {
  titleVisibilityElement.addEventListener("click", () => {
    const titleVisibilityComponentId = selectedComponentId;
    mutateDocument(titleVisibilityDraftDocument => {
      const titleVisibilityComponent = findComponent(
        titleVisibilityDraftDocument,
        titleVisibilityComponentId
      )?.component;
      if (!!titleVisibilityComponent && titleVisibilityComponent.type === "title-button") {
        titleVisibilityComponent.properties = {
          ...(titleVisibilityComponent.properties || {}),
          [titleVisibilityKey]: titleVisibilityComponent.properties?.[titleVisibilityKey] === false
        };
      }
    });
  });
}
for (const [statisticsVisibilityElement, statisticsVisibilityKey] of [
  [lightStatisticsIconVisibleButtonElement, "iconVisible"],
  [lightStatisticsTitleVisibleButtonElement, "titleVisible"],
  [lightStatisticsCountVisibleButtonElement, "countVisible"]
]) {
  statisticsVisibilityElement.addEventListener("click", () => {
    const statisticsVisibilityComponentId = selectedComponentId;
    if (statisticsVisibilityComponentId) {
      mutateDocument(statisticsVisibilityDraftDocument => {
        const statisticsVisibilityComponent = findComponent(
          statisticsVisibilityDraftDocument,
          statisticsVisibilityComponentId
        )?.component;
        if (
          !!statisticsVisibilityComponent &&
          statisticsVisibilityComponent.type === "light-statistics"
        ) {
          statisticsVisibilityComponent.properties = {
            ...(statisticsVisibilityComponent.properties || {}),
            [statisticsVisibilityKey]:
              statisticsVisibilityComponent.properties?.[statisticsVisibilityKey] === false
          };
        }
      });
    }
  });
}
for (const [buttonVisibilityElement, buttonVisibilityKey] of [
  [deviceButtonIconVisibleButtonElement, "iconVisible"],
  [deviceButtonMainVisibleButtonElement, "mainTextVisible"],
  [deviceButtonSecondaryVisibleButtonElement, "secondaryTextVisible"],
  [iconButtonOnFillVisibleButtonElement, "onFillVisible"],
  [iconButtonFrameVisibleButtonElement, "frameVisible"],
  [iconButtonSoftLightVisibleButtonElement, "softLightVisible"],
  [iconButtonGlowVisibleButtonElement, "glowVisible"],
  [presenceHaloVisibleButtonElement, "haloVisible"],
  [presencePersonVisibleButtonElement, "personVisible"]
]) {
  buttonVisibilityElement.addEventListener("click", () => {
    const buttonVisibilityComponentId = selectedComponentId;
    mutateDocument(buttonVisibilityDraftDocument => {
      const buttonVisibilityComponent = findComponent(
        buttonVisibilityDraftDocument,
        buttonVisibilityComponentId
      )?.component;
      if (
        !!buttonVisibilityComponent &&
        !!["icon-button", "device-button", "presence-sensor"].includes(
          buttonVisibilityComponent.type
        ) &&
        (!buttonVisibilityKey.endsWith("Visible") ||
          !["iconVisible", "mainTextVisible", "secondaryTextVisible"].includes(
            buttonVisibilityKey
          ) ||
          buttonVisibilityComponent.type === "device-button") &&
        (!["haloVisible", "personVisible"].includes(buttonVisibilityKey) ||
          buttonVisibilityComponent.type === "presence-sensor")
      ) {
        buttonVisibilityComponent.properties = {
          ...(buttonVisibilityComponent.properties || {}),
          [buttonVisibilityKey]:
            buttonVisibilityComponent.properties?.[buttonVisibilityKey] === false
        };
      }
    });
  });
}
iconButtonPreviewStateElement.addEventListener("click", iconPreviewStateClickEvent => {
  const iconPreviewStateOption = iconPreviewStateClickEvent.target.closest(
    "[data-icon-button-preview]"
  );
  const iconPreviewComponentId = selectedComponentId;
  if (!iconPreviewStateOption || !iconPreviewComponentId) {
    return;
  }
  const requestedIconPreviewState = ["on", "off"].includes(
    iconPreviewStateOption.dataset.iconButtonPreview
  )
    ? iconPreviewStateOption.dataset.iconButtonPreview
    : "auto";
  applyIconButtonPreviewState(iconPreviewComponentId, requestedIconPreviewState);
});
const timeColorPropertyByElement = new Map([[timeColorInputElement, "color"]]);
const timePropertyConfigsByElement = new Map([
  [
    timeFontSizeInputElement,
    {
      property: "fontSize",
      minimum: 12,
      maximum: 500,
      divisor: 1,
      resizes: true
    }
  ],
  [
    timeFontWeightInputElement,
    {
      property: "fontWeight",
      minimum: 0,
      maximum: 1,
      divisor: 1,
      resizes: true
    }
  ],
  [
    timeLetterSpacingInputElement,
    {
      property: "letterSpacing",
      minimum: -20,
      maximum: 100,
      divisor: 1,
      resizes: true
    }
  ],
  [
    timeOpacityInputElement,
    {
      property: "opacity",
      minimum: 0,
      maximum: 100,
      divisor: 100,
      resizes: false
    }
  ]
]);
const timeTransformInputSet = new Set([
  timeLeftInputElement,
  timeTopInputElement,
  timeScaleInputElement,
  timeRotationInputElement
]);
/**
 * 时间组件尺寸预览：按新属性算出目标宽高，保持中心不动反推左上角坐标，只推给渲染器做临时变换，落盘仍由 change 里的 mutateDocument 负责。
 */
function previewTimeResize(resizedTimeComponent, timeDimensionProperties) {
  const timeWidth = Number(resizedTimeComponent.position?.width || 100);
  const timeHeight = Number(resizedTimeComponent.position?.height || 100);
  const timeCenterX = Number(resizedTimeComponent.position?.x || 0) + timeWidth / 2;
  const timeCenterY = Number(resizedTimeComponent.position?.y || 0) + timeHeight / 2;
  const { width: nextTimeWidth, height: nextTimeHeight } =
    timeComponentDimensions(timeDimensionProperties);
  editorRenderer?.previewComponentTransform(resizedTimeComponent.id, {
    x: timeCenterX - nextTimeWidth / 2,
    y: timeCenterY - nextTimeHeight / 2,
    width: nextTimeWidth,
    height: nextTimeHeight
  });
}
bindInspectorSection();

iconButtonEffectIconButtonElement.addEventListener("click", () => {
  const isEffectIconMenuHidden = iconButtonEffectIconMenuElement.hidden;
  closeAllDropdownMenus(isEffectIconMenuHidden ? "ibe-icon" : null);
  iconButtonEffectIconMenuElement.hidden = !isEffectIconMenuHidden;
  iconButtonEffectIconButtonElement.setAttribute("aria-expanded", String(isEffectIconMenuHidden));
  if (isEffectIconMenuHidden) {
    loadIconButtonEffectIconOptions(iconButtonEffectIconSearchInputElement.value)
      .then(() => {
        positionIconButtonEffectIconMenu();
        iconButtonEffectIconSearchInputElement.focus({
          preventScroll: true
        });
      })
      .catch(handleOperationError);
  }
});
iconButtonEffectIconCopyButtonElement.addEventListener("click", async () => {
  const effectSelectedIconName = selectedComponent()?.properties?.icon || "";
  if (effectSelectedIconName) {
    try {
      await copyTextToClipboard(effectSelectedIconName);
      window.clearTimeout(effectIconCopiedTimeoutId);
      iconButtonEffectIconCopyButtonElement.classList.add("copied");
      effectIconCopiedTimeoutId = window.setTimeout(
        () => iconButtonEffectIconCopyButtonElement.classList.remove("copied"),
        1200
      );
    } catch (effectIconCopyError) {
      handleOperationError(effectIconCopyError);
    }
  }
});
iconButtonEffectIconSearchInputElement.addEventListener("input", () => {
  window.clearTimeout(effectIconSearchDebounceTimeoutId);
  effectIconSearchDebounceTimeoutId = window.setTimeout(
    () =>
      loadIconButtonEffectIconOptions(iconButtonEffectIconSearchInputElement.value).catch(
        handleOperationError
      ),
    160
  );
});
iconButtonEffectIconOptionsElement.addEventListener("click", effectIconOptionClickEvent => {
  const effectIconOptionElement = effectIconOptionClickEvent.target.closest("[data-icon-name]");
  const effectIconComponentId = selectedComponentId;
  if (!effectIconOptionElement || !effectIconComponentId) {
    return;
  }
  const effectIconDatasetName = effectIconOptionElement.dataset.iconName;
  closeAllDropdownMenus();
  mutateDocument(effectIconDraftDocument => {
    const effectIconComponent = findComponent(
      effectIconDraftDocument,
      effectIconComponentId
    )?.component;
    if (!!effectIconComponent && effectIconComponent.type === "icon-button-effect") {
      effectIconComponent.properties = {
        ...(effectIconComponent.properties || {}),
        icon: effectIconDatasetName
      };
    }
  });
});
iconButtonIconButtonElement.addEventListener("click", () => {
  const isIconButtonIconMenuHidden = iconButtonIconMenuElement.hidden;
  closeAllDropdownMenus(isIconButtonIconMenuHidden ? "icon-button-icon" : null);
  iconButtonIconMenuElement.hidden = !isIconButtonIconMenuHidden;
  iconButtonIconButtonElement.setAttribute("aria-expanded", String(isIconButtonIconMenuHidden));
  if (isIconButtonIconMenuHidden) {
    loadIconButtonIconOptions(iconButtonIconSearchInputElement.value)
      .then(() => {
        positionIconButtonIconMenu();
        iconButtonIconSearchInputElement.focus({
          preventScroll: true
        });
      })
      .catch(handleOperationError);
  }
});
iconButtonIconCopyButtonElement.addEventListener("click", async () => {
  const iconButtonSelectedIconName = selectedComponent()?.properties?.icon || "";
  if (iconButtonSelectedIconName) {
    try {
      await copyTextToClipboard(iconButtonSelectedIconName);
      window.clearTimeout(deviceIconCopiedTimeoutId);
      iconButtonIconCopyButtonElement.classList.add("copied");
      deviceIconCopiedTimeoutId = window.setTimeout(
        () => iconButtonIconCopyButtonElement.classList.remove("copied"),
        1200
      );
    } catch (iconButtonIconCopyError) {
      handleOperationError(iconButtonIconCopyError);
    }
  }
});
iconButtonIconSearchInputElement.addEventListener("input", () => {
  window.clearTimeout(deviceIconSearchDebounceTimeoutId);
  deviceIconSearchDebounceTimeoutId = window.setTimeout(
    () =>
      loadIconButtonIconOptions(iconButtonIconSearchInputElement.value).catch(handleOperationError),
    160
  );
});
iconButtonIconOptionsElement.addEventListener("click", iconButtonIconOptionClickEvent => {
  const iconButtonIconOptionElement =
    iconButtonIconOptionClickEvent.target.closest("[data-icon-name]");
  const iconButtonIconComponentId = selectedComponentId;
  if (!iconButtonIconOptionElement || !iconButtonIconComponentId) {
    return;
  }
  const iconButtonIconDatasetName = iconButtonIconOptionElement.dataset.iconName;
  closeAllDropdownMenus();
  mutateDocument(iconButtonIconDraftDocument => {
    const iconButtonIconDraftComponent = findComponent(
      iconButtonIconDraftDocument,
      iconButtonIconComponentId
    )?.component;
    if (
      !!iconButtonIconDraftComponent &&
      !!["icon-button", "device-button", "presence-sensor"].includes(
        iconButtonIconDraftComponent.type
      )
    ) {
      iconButtonIconDraftComponent.properties = {
        ...(iconButtonIconDraftComponent.properties || {}),
        icon: iconButtonIconDatasetName
      };
    }
  });
});
titleButtonIconButtonElement.addEventListener("click", titleButtonIconClickEvent => {
  titleButtonIconClickEvent.preventDefault();
  titleButtonIconClickEvent.stopPropagation();
  const isTitleButtonIconMenuHidden = titleButtonIconMenuElement.hidden;
  closeAllDropdownMenus(isTitleButtonIconMenuHidden ? "title-button-icon" : null);
  if (isTitleButtonIconMenuHidden && titleButtonIconMenuElement.parentElement !== document.body) {
    document.body.append(titleButtonIconMenuElement);
  }
  titleButtonIconMenuElement.hidden = !isTitleButtonIconMenuHidden;
  titleButtonIconMenuElement.style.position = "fixed";
  titleButtonIconMenuElement.style.zIndex = "760";
  titleButtonIconButtonElement.setAttribute("aria-expanded", String(isTitleButtonIconMenuHidden));
  if (isTitleButtonIconMenuHidden) {
    positionTitleButtonIconMenu();
    loadTitleButtonIconOptions(titleButtonIconSearchInputElement.value)
      .then(() => {
        positionTitleButtonIconMenu();
        titleButtonIconSearchInputElement.focus({
          preventScroll: true
        });
      })
      .catch(handleOperationError);
  }
});
titleButtonIconCopyButtonElement.addEventListener("click", async () => {
  const titleButtonSelectedIconName = selectedComponent()?.properties?.icon || "";
  if (titleButtonSelectedIconName) {
    try {
      await copyTextToClipboard(titleButtonSelectedIconName);
      window.clearTimeout(titleButtonIconCopiedTimeoutId);
      titleButtonIconCopyButtonElement.classList.add("copied");
      titleButtonIconCopiedTimeoutId = window.setTimeout(
        () => titleButtonIconCopyButtonElement.classList.remove("copied"),
        1200
      );
    } catch (titleButtonIconCopyError) {
      handleOperationError(titleButtonIconCopyError);
    }
  }
});
titleButtonIconSearchInputElement.addEventListener("input", () => {
  window.clearTimeout(titleButtonIconSearchDebounceTimeoutId);
  titleButtonIconSearchDebounceTimeoutId = window.setTimeout(
    () =>
      loadTitleButtonIconOptions(titleButtonIconSearchInputElement.value).catch(
        handleOperationError
      ),
    160
  );
});
titleButtonIconOptionsElement.addEventListener("click", titleButtonIconOptionClickEvent => {
  const titleButtonIconOptionElement =
    titleButtonIconOptionClickEvent.target.closest("[data-icon-name]");
  const titleButtonIconComponentId = selectedComponentId;
  if (!titleButtonIconOptionElement || !titleButtonIconComponentId) {
    return;
  }
  const titleButtonIconDatasetName = titleButtonIconOptionElement.dataset.iconName;
  closeAllDropdownMenus();
  mutateDocument(titleButtonIconDraftDocument => {
    const titleButtonIconComponent = findComponent(
      titleButtonIconDraftDocument,
      titleButtonIconComponentId
    )?.component;
    if (!!titleButtonIconComponent && titleButtonIconComponent.type === "title-button") {
      titleButtonIconComponent.properties = {
        ...(titleButtonIconComponent.properties || {}),
        icon: titleButtonIconDatasetName,
        iconVisible: !!titleButtonIconDatasetName
      };
    }
  });
});
lightStatisticsIconButtonElement.addEventListener("click", lightStatisticsIconClickEvent => {
  lightStatisticsIconClickEvent.preventDefault();
  lightStatisticsIconClickEvent.stopPropagation();
  const isLightStatisticsIconMenuHidden = lightStatisticsIconMenuElement.hidden;
  closeAllDropdownMenus(isLightStatisticsIconMenuHidden ? "light-statistics-icon" : null);
  if (
    isLightStatisticsIconMenuHidden &&
    lightStatisticsIconMenuElement.parentElement !== document.body
  ) {
    document.body.append(lightStatisticsIconMenuElement);
  }
  lightStatisticsIconMenuElement.hidden = !isLightStatisticsIconMenuHidden;
  lightStatisticsIconMenuElement.style.position = "fixed";
  lightStatisticsIconMenuElement.style.zIndex = "760";
  lightStatisticsIconButtonElement.setAttribute(
    "aria-expanded",
    String(isLightStatisticsIconMenuHidden)
  );
  if (isLightStatisticsIconMenuHidden) {
    positionLightStatisticsIconMenu();
    loadLightStatisticsIconOptions(lightStatisticsIconSearchInputElement.value)
      .then(() => {
        positionLightStatisticsIconMenu();
        lightStatisticsIconSearchInputElement.focus({
          preventScroll: true
        });
      })
      .catch(handleOperationError);
  }
});
lightStatisticsIconCopyButtonElement.addEventListener("click", async () => {
  const lightStatisticsSelectedIconName = selectedComponent()?.properties?.icon || "";
  if (lightStatisticsSelectedIconName) {
    try {
      await copyTextToClipboard(lightStatisticsSelectedIconName);
      window.clearTimeout(lightStatisticsIconCopiedTimeoutId);
      lightStatisticsIconCopyButtonElement.classList.add("copied");
      lightStatisticsIconCopiedTimeoutId = window.setTimeout(
        () => lightStatisticsIconCopyButtonElement.classList.remove("copied"),
        1200
      );
    } catch (lightStatisticsIconCopyError) {
      handleOperationError(lightStatisticsIconCopyError);
    }
  }
});
lightStatisticsIconSearchInputElement.addEventListener("input", () => {
  window.clearTimeout(lightStatisticsIconSearchDebounceTimeoutId);
  lightStatisticsIconSearchDebounceTimeoutId = window.setTimeout(
    () =>
      loadLightStatisticsIconOptions(lightStatisticsIconSearchInputElement.value).catch(
        handleOperationError
      ),
    160
  );
});
lightStatisticsIconOptionsElement.addEventListener("click", lightStatisticsIconOptionClickEvent => {
  const lightStatisticsIconOptionElement = lightStatisticsIconOptionClickEvent.target.closest(
    "[data-light-statistics-icon-name]"
  );
  const lightStatisticsIconComponentId = selectedComponentId;
  if (!lightStatisticsIconOptionElement || !lightStatisticsIconComponentId) {
    return;
  }
  const lightStatisticsIconDatasetName =
    lightStatisticsIconOptionElement.dataset.lightStatisticsIconName;
  closeAllDropdownMenus();
  mutateDocument(lightStatisticsIconDraftDocument => {
    const lightStatisticsIconComponent = findComponent(
      lightStatisticsIconDraftDocument,
      lightStatisticsIconComponentId
    )?.component;
    if (
      !!lightStatisticsIconComponent &&
      lightStatisticsIconComponent.type === "light-statistics"
    ) {
      lightStatisticsIconComponent.properties = {
        ...(lightStatisticsIconComponent.properties || {}),
        icon: lightStatisticsIconDatasetName
      };
    }
  });
});
lightStatisticsEntityButtonElement.addEventListener("click", lightStatisticsEntityClickEvent => {
  lightStatisticsEntityClickEvent.preventDefault();
  lightStatisticsEntityClickEvent.stopPropagation();
  const isLightStatisticsEntityMenuHidden = lightStatisticsEntityMenuElement.hidden;
  closeAllDropdownMenus(isLightStatisticsEntityMenuHidden ? "light-statistics-entity" : null);
  if (
    isLightStatisticsEntityMenuHidden &&
    lightStatisticsEntityMenuElement.parentElement !== document.body
  ) {
    document.body.append(lightStatisticsEntityMenuElement);
  }
  lightStatisticsEntityMenuElement.hidden = !isLightStatisticsEntityMenuHidden;
  lightStatisticsEntityMenuElement.style.position = "fixed";
  lightStatisticsEntityMenuElement.style.zIndex = "760";
  lightStatisticsEntityButtonElement.setAttribute(
    "aria-expanded",
    String(isLightStatisticsEntityMenuHidden)
  );
  if (isLightStatisticsEntityMenuHidden) {
    renderLightStatisticsEntityOptions(lightStatisticsEntitySearchInputElement.value);
    positionLightStatisticsEntityMenu();
    window.requestAnimationFrame(() => {
      positionLightStatisticsEntityMenu();
      lightStatisticsEntitySearchInputElement.focus({
        preventScroll: true
      });
    });
  }
});
lightStatisticsEntitySearchInputElement.addEventListener("input", () =>
  renderLightStatisticsEntityOptions(lightStatisticsEntitySearchInputElement.value)
);
lightStatisticsEntityOptionsElement.addEventListener(
  "click",
  lightStatisticsEntityOptionClickEvent => {
    const lightStatisticsEntityOptionElement = lightStatisticsEntityOptionClickEvent.target.closest(
      "[data-light-statistics-entity-id]"
    );
    if (lightStatisticsEntityOptionElement) {
      closeDropdownMenu(lightStatisticsEntityMenuElement, lightStatisticsEntityButtonElement);
      pickLightStatisticsEntity(lightStatisticsEntityOptionElement.dataset.lightStatisticsEntityId);
    }
  }
);
lightStatisticsEntityConfirmButtonElement.addEventListener("click", () =>
  addLightStatisticsEntity()
);
lightStatisticsEntityListElement.addEventListener("click", lightStatisticsEntityListClickEvent => {
  const statisticsReplaceElement = lightStatisticsEntityListClickEvent.target.closest(
    "[data-light-statistics-replace-index]"
  );
  const statisticsRemoveElement = lightStatisticsEntityListClickEvent.target.closest(
    "[data-light-statistics-remove-index]"
  );
  if (statisticsRemoveElement) {
    removeLightStatisticsEntity(Number(statisticsRemoveElement.dataset.lightStatisticsRemoveIndex));
    return;
  }
  if (statisticsReplaceElement) {
    statisticsEntityId = "";
    statisticsReplaceIndex = Number(statisticsReplaceElement.dataset.lightStatisticsReplaceIndex);
    statisticsComponentId = selectedComponentId || "";
    lightStatisticsEntityPendingElement.hidden = true;
    setLightStatisticsMessage("请选择新的实体。");
    setPickerButtonLabel(lightStatisticsEntityButtonElement, "选择替换实体");
    lightStatisticsEntityButtonElement.click();
  }
});
imageEntityButtonElement.addEventListener("click", () => {
  const isImageEntityMenuHidden = imageEntityMenuElement.hidden;
  closeAllDropdownMenus(isImageEntityMenuHidden ? "entity" : null);
  imageEntityMenuElement.hidden = !isImageEntityMenuHidden;
  imageEntityButtonElement.setAttribute("aria-expanded", String(isImageEntityMenuHidden));
  if (isImageEntityMenuHidden) {
    renderEntityPickerOptions(imageEntitySearchInputElement.value);
    positionImagePickerMenu();
    window.requestAnimationFrame(() => {
      positionImagePickerMenu();
      imageEntitySearchInputElement.focus({
        preventScroll: true
      });
    });
  }
});
imageEntitySearchInputElement.addEventListener("input", () =>
  renderEntityPickerOptions(imageEntitySearchInputElement.value)
);
imageEntityOptionsElement.addEventListener("click", imageEntityOptionClickEvent => {
  const imageEntityOptionElement = imageEntityOptionClickEvent.target.closest("[data-entity-id]");
  if (!imageEntityOptionElement || !selectedComponentId) {
    return;
  }
  const imageEntityComponentId = selectedComponentId;
  const imageEntitySelectedId = imageEntityOptionElement.dataset.entityId;
  closeAllDropdownMenus();
  mutateDocument(imageEntityDraftDocument => {
    const imageEntityComponent = findComponent(
      imageEntityDraftDocument,
      imageEntityComponentId
    )?.component;
    if (!imageEntityComponent || imageEntityComponent.type !== "image") {
      return;
    }
    const imageEntityPreviousId = String(imageEntityComponent.bindings?.entity?.entityId || "");
    imageEntityComponent.bindings = {
      ...(imageEntityComponent.bindings || {})
    };
    imageEntityComponent.properties = {
      ...(imageEntityComponent.properties || {}),
      fit: "contain"
    };
    if (imageEntitySelectedId) {
      imageEntityComponent.bindings.entity = {
        entityId: imageEntitySelectedId
      };
    } else {
      delete imageEntityComponent.bindings.entity;
      for (const imageActionKey of ["tap", "doubleTap", "hold"]) {
        if (actionNeedsCurrentEntity(imageEntityComponent.actions?.[imageActionKey])) {
          delete imageEntityComponent.actions[imageActionKey];
        }
      }
    }
    if (imageEntitySelectedId !== imageEntityPreviousId) {
      if (
        imageEntitySelectedId
          ? relatedPopupContext(imageEntityComponent, entitiesByEntityId(), devicesByDeviceId())
          : null
      ) {
        imageEntityComponent.properties.relatedEntities = manualRelatedEntityConfig([]);
      } else {
        delete imageEntityComponent.properties.relatedEntities;
      }
    }
  });
});

bindEntityPicker("weather");
bindEntityPicker("line-chart");
bindEntityPicker("title-button");
bindEntityPicker("light-statistics");
bindEntityPicker("icon-button-effect");
bindEntityPicker("icon-button", ["icon-button", "device-button", "presence-sensor"]);
bindEntityPicker("vacuum-map");
bindEntityPicker("camera");
bindEntityPicker("air-conditioner");
bindEntityPicker("navigation-button");

let activeEditorPicker = null;

/**
 * 打开图片素材选择器（控件图片 image / 效果图片 ibe 两种用途）。打开前先静默重载素材目录保证列表最新；重载完成时只有本次
 * 活动的选择器仍用同一个触发按钮才刷新，避免用户已切到别处还去改它的状态。素材分页走本地切片（目录已整体在内存），
 * 初始页由当前素材下标推算；悬停条目会调度大图预览，预览节点最终挂在选择器对话框上，故把返回值链式 append 进去。
 */
function openAssetPicker(assetTriggerButton) {
  const assetPickerKind =
    assetTriggerButton === imageAssetButtonElement
      ? "image"
      : assetTriggerButton === iconButtonEffectAssetButtonElement
        ? "ibe"
        : "";
  if (!assetPickerKind) {
    return false;
  }
  const isImageAssetPicker = assetPickerKind === "image";
  const assetPickerComponent = selectedComponent();
  const assetCurrentId = isImageAssetPicker
    ? assetPickerComponent?.properties?.assetId || ""
    : assetPickerComponent?.properties?.effectAssetId || "";
  const assetCurrentRecord = findAssetById(assetCurrentId);
  reloadAssetCatalog({
    refreshInspector: false
  })
    .then(() => {
      if (activeEditorPicker?.triggerButton === assetTriggerButton) {
        activeEditorPicker.syncAssetToolbar?.();
        activeEditorPicker.refresh();
      }
    })
    .catch(handleOperationError);
  const assetInitialIndex = editorAssetMatcher(assetPickerKind).findIndex(assetPickerCandidate =>
    assetMatchesId(assetPickerCandidate, assetCurrentId)
  );
  openEditorPickerDialog({
    kind: assetPickerKind + "-asset",
    title: isImageAssetPicker ? "选择控件图片" : "选择效果图片",
    subtitle: "我的图片 · 固定分页加载",
    searchPlaceholder: "搜索图片名称",
    triggerButton: assetTriggerButton,
    pageSize: EDITOR_PICKER_PAGE_SIZES.asset,
    initialPage:
      assetInitialIndex < 0
        ? 1
        : Math.floor(assetInitialIndex / EDITOR_PICKER_PAGE_SIZES.asset) + 1,
    selectedText: assetCurrentRecord?.name || assetCurrentId || "不使用图片",
    emptyText: "没有匹配的图片",
    itemClass: "asset-grid",
    getPage({ query: assetQuery, page: assetPage, pageSize: assetPageSize }) {
      const assetMatches = editorAssetMatcher(assetPickerKind, assetQuery);
      /**
       * 本页素材在匹配结果里的起始下标（素材目录已在内存，直接切片）。
       *
       * @type {number}
       */
      const assetOffset = (assetPage - 1) * assetPageSize;
      return {
        items: assetMatches.slice(assetOffset, assetOffset + assetPageSize),
        total: assetMatches.length
      };
    },
    renderSelectedContent: () => [createEditorPickerCurrentAsset(assetCurrentRecord)],
    renderSelectedActions: () => [editorPickerClearAction("不使用图片", !assetCurrentId)],
    renderItem(assetItem) {
      const assetOptionButtonElement = createAssetOptionButton(assetItem, assetCurrentId);
      const assetOptionValueElement = assetOptionButtonElement.matches?.("[data-asset-id]")
        ? assetOptionButtonElement
        : assetOptionButtonElement.querySelector("[data-asset-id]");
      if (assetOptionValueElement) {
        assetOptionValueElement.dataset.editorPickerValue = assetItem.assetId;
      }
      return assetOptionButtonElement;
    },
    buildToolbar: assetToolbarState => editorAssetToolbar(assetPickerKind, assetToolbarState),
    onItemHover: (assetHoverId, assetHoverElement) =>
      scheduleAssetPreview(
        findAssetById(assetHoverId),
        assetHoverElement,
        activeEditorPicker?.dialog
      ),
    onDelete: requestDeleteAsset,
    onSelect: pickedAssetId =>
      selectPickerOption(
        isImageAssetPicker ? imageAssetOptionsElement : iconButtonEffectAssetOptionsElement,
        "assetId",
        pickedAssetId
      )
  })?.dialog.append(imageAssetLargePreviewElement);
  return true;
}
/**
 * 批量上传用户素材，并同步两条展示路径（旧下拉菜单与新版分页选择器）。逐张上传而非打包，是为了拿到「哪个文件为什么失败」
 * 的细粒度错误：扩展名先在前端过滤（与后端白名单一致：PNG/JPG/JPEG/WebP/SVG），单张失败只记错误继续传下一张，
 * 最后把汇总错误一次性抛出提示。文件名走 X-File-Name 头（URL 编码），因为请求体就是文件本身。
 */
async function uploadAssetFiles(assetFileList, uploadAssetKind) {
  const uploadFiles = [...(assetFileList || [])];
  if (!uploadFiles.length) {
    return;
  }
  const uploadButton =
    uploadAssetKind === "image"
      ? imageAssetUploadButtonElement
      : iconButtonEffectAssetUploadButtonElement;
  uploadButton.disabled = true;
  const uploadErrors = [];
  try {
    for (const uploadFile of uploadFiles) {
      if (!/\.(png|jpe?g|webp|svg)$/i.test(uploadFile.name)) {
        uploadErrors.push(uploadFile.name + "：仅支持 PNG、JPG、JPEG、WebP 和 SVG");
        continue;
      }
      try {
        await requestJson("/assets/user", {
          method: "POST",
          body: uploadFile,
          headers: {
            "Content-Type": uploadFile.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(uploadFile.name)
          }
        });
      } catch (uploadFileError) {
        uploadErrors.push(uploadFile.name + "：" + uploadFileError.message);
      }
    }
    await reloadAssetCatalog({
      refreshInspector: false
    });
    if (uploadAssetKind === "image") {
      imageAssetSearchInputElement.value = "";
      syncAssetFolderOptions("image");
      if (activeEditorPicker?.kind === "image-asset") {
        activeEditorPicker.rebuildToolbar();
        activeEditorPicker.refresh({
          resetPage: true
        });
      } else {
        renderImageAssetOptions();
        positionImageAssetMenu();
      }
    } else {
      iconButtonEffectAssetSearchInputElement.value = "";
      syncAssetFolderOptions("ibe");
      if (activeEditorPicker?.kind === "ibe-asset") {
        activeEditorPicker.rebuildToolbar();
        activeEditorPicker.refresh({
          resetPage: true
        });
      } else {
        renderEffectAssetOptions();
        positionEffectAssetMenu();
      }
    }
    if (uploadErrors.length) {
      handleOperationError(new Error(uploadErrors.join("\n")));
    }
  } finally {
    uploadButton.disabled = false;
  }
}
/**
 * 请求删除一张用户素材（先做引用完整性检查，再弹确认框）。只允许删 source === "user" 的素材；随后递归遍历当前文档的所有值，
 * 只要有任何字段等于该 assetId 就拒绝删除并提示先替换——删除被引用的素材会让控件渲染回退或报错。通过检查后把待删 ID
 * 暂存到 pendingDeleteAssetId，等确认框里再执行。
 */
function requestDeleteAsset(assetIdToDelete) {
  const assetToDelete = findAssetById(assetIdToDelete);
  if (!assetToDelete || assetToDelete.source !== "user") {
    return;
  }
  /**
   * 递归判断整份文档里是否还有字段引用了这张待删素材。文档是任意嵌套的 JSON 结构，素材 ID 可能出现在任意层级的字符串值里，
   * 故对数组/对象逐层下钻、对字符串做等值比较，命中即短路返回 true。
   */
  const documentUsesAsset = assetDocumentNode =>
    Array.isArray(assetDocumentNode)
      ? assetDocumentNode.some(documentUsesAsset)
      : assetDocumentNode && typeof assetDocumentNode == "object"
        ? Object.values(assetDocumentNode).some(documentUsesAsset)
        : assetDocumentNode === assetToDelete.assetId;
  if (documentUsesAsset(activeProject?.document)) {
    closeAllDropdownMenus();
    handleOperationError(new Error("这张图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。"));
    return;
  }
  pendingDeleteAssetId = assetToDelete.assetId;
  deleteAssetNameElement.textContent = "“" + assetToDelete.name + "”";
  closeAllDropdownMenus();
  deleteAssetDialogElement.showModal();
}
/**
 * 请求删除一个用户素材文件夹（同样先检查引用完整性）。用户素材的 ID 约定为 "studio3d:<文件夹>/<文件名>"，故靠前缀匹配判断
 * 文档里是否还引用了该文件夹里的图片；canDeleteAssetFolder 负责拒绝内置/不可删的目录；通过检查后暂存待删文件夹，等确认框执行，
 * 确认框会顺带显示文件夹内的图片数量。
 */
function requestDeleteAssetFolder(folderKind, folderName) {
  if (!canDeleteAssetFolder("user", folderName)) {
    return;
  }
  const folderAssetRecords = exportedAssetsInFolder(folderName);
  const folderAssetPrefix = "studio3d:" + folderName + "/";
  /**
   * 递归判断整份文档里是否还有字段引用了该用户素材文件夹下的图片。用户素材 ID 约定为 "studio3d:<文件夹>/<文件名>"，
   * 无法逐个枚举文件名，故对所有字符串值做前缀匹配；数组/对象逐层下钻，命中即短路返回 true。
   */
  const documentUsesFolder = folderDocumentNode =>
    Array.isArray(folderDocumentNode)
      ? folderDocumentNode.some(documentUsesFolder)
      : folderDocumentNode && typeof folderDocumentNode == "object"
        ? Object.values(folderDocumentNode).some(documentUsesFolder)
        : typeof folderDocumentNode == "string" && folderDocumentNode.startsWith(folderAssetPrefix);
  if (documentUsesFolder(activeProject?.document)) {
    handleOperationError(
      new Error("这个文件夹中的图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。")
    );
    return;
  }
  pendingDeleteAssetFolder = {
    kind: folderKind,
    folderName: folderName
  };
  deleteAssetFolderNameElement.textContent = "“" + folderName + "”";
  deleteAssetFolderCountElement.textContent = String(folderAssetRecords.length);
  deleteAssetFolderDialogElement.showModal();
}
/**
 * 素材变更后统一刷新两条展示路径：两类素材各自同步文件夹下拉、重渲染旧版下拉列表；若当前正开着新版分页选择器则重建工具栏
 * 并回到第一页（删除/新增后会改变分页总量），最后对仍可见的浮层重算定位，避免列表内容变化后浮层错位。
 */
function refreshAssetPickerViews() {
  syncAssetFolderOptions("image");
  syncAssetFolderOptions("ibe");
  renderImageAssetOptions(imageAssetSearchInputElement.value);
  renderEffectAssetOptions(iconButtonEffectAssetSearchInputElement.value);
  if (activeEditorPicker?.kind === "image-asset" || activeEditorPicker?.kind === "ibe-asset") {
    activeEditorPicker.syncAssetToolbar?.();
    activeEditorPicker.refresh({
      resetPage: true
    });
  }
  if (!imageAssetMenuElement.hidden) {
    positionImageAssetMenu();
  }
  if (!iconButtonEffectAssetMenuElement.hidden) {
    positionEffectAssetMenu();
  }
}
bindAssetSection();

/**
 * 关闭「删除组合弹窗」确认框，并清掉暂存的待删弹窗 ID。不用等 `close` 事件，
 * 因为点确认时也会走 close，两条路径都要清空暂存值。
 */
function closeDeletePopupDialog() {
  popupModuleDraft = null;
  deletePopupDialogElement.close();
}

/**
 * 删除确认框里逐条列出的上限（超出只报个数）。一个弹窗可能被几十个控件打开（例如整页都是同一个详情弹窗），
 * 逐条列出来会把确认框撑成一面墙，反而看不见「确认删除」按钮；数字取得小是有意的：这里的用途是
 * 「让用户认出自己配过的那几处」，认出之后剩下的看总述就够了。
 */
const DELETE_POPUP_USAGE_LIMIT = 6;

/**
 * 算出当前文档里哪些控件会因为删掉这个弹窗而失去动作。组合弹窗是全局的（所有项目共享一份），删掉会级联把每份
 * 草稿里指向它的动作改成 type:"none"；这里逐条列出「谁会变」。走法与后端级联清理同一套口子：sharedComponents +
 * 每页 components 沿 children 递归，只认 type:"more-info" 且 data.popupSource === "custom" 且 popupId 相同的动作。
 */
function popupDeleteUsageEntries(documentSource, popupId, entityLabelFor) {
  const triggerLabels = { tap: "单击", doubleTap: "双击", hold: "长按" };
  const labelForComponent = componentSource => {
    const boundEntityLabels = Object.values(componentSource?.bindings || {})
      .map(bindingEntry => String(bindingEntry?.entityId || ""))
      .filter(Boolean)
      .map(boundEntityId => entityLabelFor?.(boundEntityId) || boundEntityId);
    return boundEntityLabels.join("、") || componentSource?.type || "控件";
  };
  const collectUsages = (componentNodes, containerLabel) => {
    const collected = [];
    for (const componentNode of componentNodes || []) {
      const usageComponentLabel = containerLabel
        ? containerLabel + " 内 " + labelForComponent(componentNode)
        : labelForComponent(componentNode);
      const matchedTriggers = Object.entries(componentNode?.actions || {})
        .filter(
          ([, actionValue]) =>
            actionValue?.type === "more-info" &&
            actionValue?.data?.popupSource === "custom" &&
            actionValue?.data?.popupId === popupId
        )
        .map(([triggerKey]) => triggerLabels[triggerKey] || triggerKey);
      if (matchedTriggers.length) {
        collected.push({ label: usageComponentLabel, triggers: matchedTriggers });
      }
      collected.push(...collectUsages(componentNode?.children, usageComponentLabel));
    }
    return collected;
  };
  const entries = [];
  const documentPages = documentSource?.pages || [];
  for (const sharedComponent of documentSource?.sharedComponents || []) {
    const sharedUsages = collectUsages([sharedComponent], "");
    if (!sharedUsages.length) {
      continue;
    }
    const referencingPageNames = documentPages
      .filter(pageEntry => (pageEntry?.sharedComponentIds || []).includes(sharedComponent?.id))
      .map(pageEntry => pageEntry?.name || pageEntry?.path || "未命名页面");
    const sharedScopeText = referencingPageNames.length
      ? "（" + referencingPageNames.join("、") + " 在用）"
      : "（没有被任何页面引用）";
    for (const sharedUsage of sharedUsages) {
      entries.push({
        label: "共享组件 · " + sharedUsage.label + sharedScopeText,
        triggers: sharedUsage.triggers
      });
    }
  }
  for (const pageEntry of documentPages) {
    const pageName = pageEntry?.name || pageEntry?.path || "未命名页面";
    for (const pageUsage of collectUsages(pageEntry?.components, "")) {
      entries.push({ label: pageName + " · " + pageUsage.label, triggers: pageUsage.triggers });
    }
  }
  return entries;
}

/**
 * 把「本仪表盘的影响面」写进删除确认框（文案 + 逐条清单）。
 *
 * @param {?object} documentSource 当前文档。
 */
function renderPopupDeleteUsage(documentSource, popupId) {
  const entityRecords = entitiesByEntityId();
  const usageEntries = popupDeleteUsageEntries(documentSource, popupId, usageEntityId => {
    const usageEntityRecord = entityRecords.get(usageEntityId);
    return usageEntityRecord ? entityDisplayName(usageEntityRecord) : "";
  });
  deletePopupUsageSummaryElement.textContent = usageEntries.length
    ? "当前仪表盘有 " + usageEntries.length + " 处会受影响："
    : "当前仪表盘没有控件的动作指向这个弹窗。";
  const listedEntries = usageEntries.slice(0, DELETE_POPUP_USAGE_LIMIT);
  const usageListItems = listedEntries.map(usageEntry => {
    const usageListItem = document.createElement("li");
    usageListItem.textContent = usageEntry.label + " · " + usageEntry.triggers.join("、");
    return usageListItem;
  });
  if (usageEntries.length > listedEntries.length) {
    const usageRestItem = document.createElement("li");
    usageRestItem.textContent =
      "…另有 " + (usageEntries.length - listedEntries.length) + " 处（此处不逐条列出）";
    usageListItems.push(usageRestItem);
  }
  deletePopupUsageListElement.replaceChildren(...usageListItems);
}
bindPopupModuleSection();

bindDocumentPointerSection();

bindInspectorScrollSection();

/**
 * 启动阶段的分片加载清单：每一项是「一个可以独立失败的加载动作 + 它在报错里的名字」。名字不是装饰：Promise.allSettled 只会说
 * 「第 3 片失败了」，而用户看到的必须是「实体清单没读出来」。写成函数而不是常量，是为了让这份清单能被整份取出来（按源码文本
 * 取函数，不去解析数组字面量），同时保证「谁属于启动阶段」只有这一个出处。
 */
function editorBootSlices() {
  return [
    ["会话", () => refreshAuthSession()],
    ["授权状态", () => refreshLicenseStatus()],
    ["Home Assistant 连接", () => refreshHaConnection({ preserveForm: false })],
    ["项目列表", () => loadProjects()],
    ["素材目录", () => reloadAssetCatalog()],
    ["实体清单", () => ensureEntitiesLoaded()]
  ];
}

/**
 * 汇总启动分片的失败：逐片进日志，再一次性给用户一句能指认的提示。不逐片弹是因为六片同源失败（后端刚起来、网关没就绪、断网）
 * 时弹六次等于什么都没说；这里合成一条并带上失败片的名字，用户截图就能定位，日志里每片各有一条带 slice 上下文的记录。
 */
function reportBootFailures(bootResults) {
  const failedSliceNames = [];
  let firstFailureReason = null;
  const bootSlices = editorBootSlices();
  bootResults.forEach((sliceResult, sliceIndex) => {
    if (sliceResult.status !== "rejected") return;
    const [sliceName] = bootSlices[sliceIndex];
    failedSliceNames.push(sliceName);
    firstFailureReason ??= sliceResult.reason;
    window.HABridgeLog?.error(sliceResult.reason, {
      projectId: activeProject?.projectId || "",
      phase: "editor-boot",
      slice: sliceName
    });
  });
  if (!failedSliceNames.length) return;
  const bootFailureError = new Error(
    "以下内容没能加载：" +
      failedSliceNames.join("、") +
      "。" +
      (firstFailureReason?.message ? "（" + firstFailureReason.message + "）" : "") +
      "其余功能仍可使用，可刷新页面重试。"
  );
  bootFailureError.name = "EditorBootSliceError";
  handleOperationError(bootFailureError, { phase: "editor-boot" });
}

/**
 * 逐个加载启动分片：一片失败不影响其它片，也不影响面板渲染。不用 Promise.all 是因为这六片互相独立（会话 / 授权 / HA 连接 /
 * 项目 / 素材 / 实体），一片失败没有理由让另外五片的结果作废——而 all 的第一个 rejection 会把 renderComponentLists() 整段跳过，
 * 表现是左侧组件面板一片空白、右下角只留一句「操作失败」；allSettled 之后面板照画，失败的片各自进日志再一次性摆给用户。
 */
async function loadEditorBootSlices() {
  const bootResults = await Promise.allSettled(
    editorBootSlices().map(([, loadSlice]) => loadSlice())
  );
  // 先画面板：能让用户操作的部分要尽快可用；渲染本身崩了由外层 catch 报（那比
  // 「某一片没读到」严重得多，也更该被看见）。
  renderComponentLists();
  reportBootFailures(bootResults);
  return bootResults;
}

loadEditorBootSlices().catch(handleOperationError);

// --------------------------- 分节绑定 --------------------------- //
// 绑定收进各节后仍在上面的原位置调用，顺序不变；分节的意义见 home/sections.js 的注释。
/**
 * 画布指针悬停。
 *
 * 指针进出画布时的悬停提示与光标。
 */
function bindPointerSection() {
  const on = sections.section("pointer");
  on(document, "pointerover", function onDocumentPointerover(pointerOverEvent) {
    const hoveredRowElement = findOverflowPreviewTarget(pointerOverEvent.target);
    const hoveredRow = findOverflowRow(hoveredRowElement);
    const isPointerInsideRow =
      pointerOverEvent.relatedTarget instanceof Node &&
      hoveredRow?.contains(pointerOverEvent.relatedTarget);
    if (!hoveredRowElement || isPointerInsideRow || hoverScrollStateByRow.has(hoveredRowElement)) {
      return;
    }
    const overflowScrollDistance = Math.max(
      0,
      hoveredRowElement.scrollWidth - hoveredRowElement.clientWidth
    );
    if (overflowScrollDistance <= 2) {
      return;
    }
    const hoverScrollEntry = {
      timer: null,
      frame: null
    };
    hoverScrollStateByRow.set(hoveredRowElement, hoverScrollEntry);
    hoverScrollEntry.timer = window.setTimeout(() => {
      if (!hoveredRowElement.isConnected) {
        stopHoverScroll(hoveredRowElement);
        return;
      }
      hoveredRowElement.classList.add("hover-scrolling");
      const hoverScrollStartTime = performance.now();
      /**
       * 逐帧推进悬停横向滚动。用 requestAnimationFrame 而非 CSS transition/定时器，使滚动与刷新同步、指针移出能立刻停住。
       * 速度系数 0.04（像素/毫秒，约 40px/秒）在「看得清实体名」与「不用久等」之间取平衡；
       * 滚动距离夹到 overflowScrollDistance，避免滚出边界留下空白。
       */
      const stepHoverScroll = hoverScrollTimestamp => {
        const elapsedScrollPx = (hoverScrollTimestamp - hoverScrollStartTime) * 0.04;
        hoveredRowElement.scrollLeft = Math.min(overflowScrollDistance, elapsedScrollPx);
        if (elapsedScrollPx < overflowScrollDistance) {
          hoverScrollEntry.frame = window.requestAnimationFrame(stepHoverScroll);
        }
      };
      hoverScrollEntry.frame = window.requestAnimationFrame(stepHoverScroll);
    }, 350);
  });
  on(document, "pointerout", function onDocumentPointerout(pointerOutEvent) {
    const leftRowElement = findOverflowPreviewTarget(pointerOutEvent.target);
    const leftRow = findOverflowRow(leftRowElement);
    const isPointerStillInsideRow =
      pointerOutEvent.relatedTarget instanceof Node &&
      leftRow?.contains(pointerOutEvent.relatedTarget);
    if (!!leftRowElement && !isPointerStillInsideRow) {
      stopHoverScroll(leftRowElement);
    }
  });
}

/**
 * 页面生命周期。
 *
 * pagehide 时把未保存草稿刷进 sessionStorage，以及同一处的收尾。
 */
function bindLifecycleSection() {
  const on = sections.section("lifecycle");
  on(window, "pagehide", recoveryWriter.flush);
  on(window, "beforeunload", recoveryWriter.flush);
  on(document, "visibilitychange", function onDocumentVisibilitychange() {
    if (document.hidden) {
      recoveryWriter.flush();
    }
  });
}

/**
 * 授权弹窗。
 *
 * 授权状态、激活码提交与续租按钮。激活流程整段走一个 async 回调，出错要给出可操作提示。
 */
function bindLicenseSection() {
  const on = sections.section("license");
  on(licenseOpenButtonElement, "click", async function onLicenseOpenButtonClick() {
    setSettingsMessage(licenseMessageElement, "");
    isLicenseActivationFormRequested = false;
    try {
      const licenseStateForDialog = await refreshLicenseStatus();
      if (!licenseStateForDialog?.required || licenseStateForDialog.allowed) {
        licenseDialogElement.showModal();
      }
    } catch (licenseDialogError) {
      handleOperationError(licenseDialogError);
    }
  });
  on(licenseCloseButtonElement, "click", function onLicenseCloseButtonClick() { return licenseDialogElement.close(); });
  on(licenseDialogElement, "click", function onLicenseDialogClick(licenseBackdropEvent) {
    if (licenseBackdropEvent.target === licenseDialogElement) {
      licenseDialogElement.close();
    }
  });
  on(licenseFormElement, "submit", async function onLicenseFormSubmit(licenseSubmitEvent) {
    licenseSubmitEvent.preventDefault();
    const licenseSubmitButton = licenseFormElement.querySelector('button[type="submit"]');
    const activationCodeInput = String(
      new FormData(licenseFormElement).get("activationCode") || ""
    ).trim();
    const licenseEmailInput = String(new FormData(licenseFormElement).get("email") || "").trim();
    licenseSubmitButton.disabled = true;
    setSettingsMessage(licenseMessageElement, "正在绑定实例并获取签名租约…");
    try {
      const activateResponse = await requestJson("/license/activate", {
        method: "POST",
        body: JSON.stringify({
          activationCode: activationCodeInput,
          email: licenseEmailInput
        })
      });
      licenseFormElement.reset();
      isLicenseActivationFormRequested = false;
      renderLicenseStatus(activateResponse);
      setSettingsMessage(licenseMessageElement, "当前实例已成功激活。", "success");
    } catch (licenseActivateError) {
      setSettingsMessage(licenseMessageElement, licenseActivateError.message, "error");
    } finally {
      licenseSubmitButton.disabled = false;
    }
  });
  // 「重新连接授权后台」：轻量续租，只走本地恢复凭证，不等下一次状态轮询。
  // 与「重新激活」的分工：本按钮不要求用户重新输入激活码，因此可以先试；它失败后再由用户
  // 决定是否走完整的重新激活流程（那个路径可能要求补填激活码）。
  on(licenseDialogRetryButtonElement, "click", async function onLicenseDialogRetryButtonClick() {
    licenseDialogRetryButtonElement.disabled = true;
    setSettingsMessage(licenseRetryMessageElement, "正在重新连接授权后台…");
    try {
      await requestJson("/license/retry", { method: "POST" });
      setSettingsMessage(licenseRetryMessageElement, "已重新连接授权后台。", "success");
    } catch (licenseRetryError) {
      // 失败文案由后端 detail 翻好（是否可重试也由后端给结论），这里不再自行分类。
      setSettingsMessage(licenseRetryMessageElement, licenseRetryError.message, "error");
    } finally {
      licenseDialogRetryButtonElement.disabled = false;
      // 无论成败都读一次最新状态：重试可能已经成功（按钮随之隐藏），也可能带回新的错误码。
      await refreshLicenseStatus().catch(() => {});
    }
  });
  on(licenseReactivateButtonElement, "click", async function onLicenseReactivateButtonClick() {
    licenseReactivateButtonElement.disabled = true;
    setSettingsMessage(licenseMessageElement, "正在重新激活并获取签名租约…");
    try {
      const reactivateResponse = await requestJson("/license/reactivate", {
        method: "POST"
      });
      licenseFormElement.reset();
      isLicenseActivationFormRequested = false;
      renderLicenseStatus(reactivateResponse);
      setSettingsMessage(licenseMessageElement, "已重新激活，授权租约与恢复凭证均已更新。", "success");
    } catch (licenseReactivateError) {
      // 任何失败都把激活表单交给用户：无凭证可复用时要用户补输入，网络类故障时
      // 手动激活也是唯一还能推进的路径。
      revealLicenseActivationForm(licenseReactivateError.message);
      await refreshLicenseStatus().catch(() => {});
    } finally {
      licenseReactivateButtonElement.disabled = false;
    }
  });
  on(haOpenButtonElement, "click", async function onHaOpenButtonClick() {
    isEditingHaConnection = false;
    setSettingsMessage(haMessageElement, "");
    await refreshHaConnection({
      preserveForm: false
    });
    haDialogElement.showModal();
  });
  on(haCloseButtonElement, "click", function onHaCloseButtonClick() {
    isEditingHaConnection = false;
    haDialogElement.close();
  });
  on(haDialogElement, "click", function onHaDialogClick(haBackdropEvent) {
    if (haBackdropEvent.target === haDialogElement) {
      isEditingHaConnection = false;
      haDialogElement.close();
    }
  });
  on(haFormElement, "input", function onHaFormInput() {
    if (!haFormElement.hidden) {
      isEditingHaConnection = true;
    }
  });
  on(haTestButtonElement, "click", async function onHaTestButtonClick() {
    setSettingsMessage(haMessageElement, "正在测试地址、Token 和版本…");
    haTestButtonElement.disabled = true;
    try {
      const haTestResult = await requestJson("/ha/test", {
        method: "POST",
        body: JSON.stringify(collectHaConnectionInput(true))
      });
      setSettingsMessage(
        haMessageElement,
        "连接成功：" +
          (haTestResult.locationName || "Home Assistant") +
          " · " +
          (haTestResult.version || "未知版本"),
        "success"
      );
    } catch (haTestError) {
      setSettingsMessage(haMessageElement, haTestError.message, "error");
    } finally {
      haTestButtonElement.disabled = false;
    }
  });
  on(haFormElement, "submit", async function onHaFormSubmit(haSubmitEvent) {
    haSubmitEvent.preventDefault();
    const haSubmitButton = haFormElement.querySelector('button[type="submit"]');
    haSubmitButton.disabled = true;
    setSettingsMessage(haMessageElement, "正在验证并加密保存连接…");
    try {
      try {
        haConnectionInfo = await requestJson("/ha/connection", {
          method: "PUT",
          body: JSON.stringify(collectHaConnectionInput(false))
        });
      } catch (haUrlChangeError) {
        // 409 + HA_URL_CHANGED_TOKEN_REUSE = 换了地址但要复用旧令牌：必须由用户确认
        // 新地址可信，不能静默把令牌发过去（后端拒绝的正是这种「静默复用」）。
        if (haUrlChangeError.code !== "HA_URL_CHANGED_TOKEN_REUSE") {
          throw haUrlChangeError;
        }
        const confirmedUrlReuse = await confirmAction({
          kicker: "CAUTION",
          title: "确认新的 Home Assistant 地址",
          message: "你改了 Home Assistant 地址，但仍使用已保存的令牌。",
          detail:
            "继续保存会把旧令牌发送到新的地址去验证。只有在新地址确实是你自己的 Home Assistant 时才确认。\n也可以直接在上面的 Token 输入框里重新输入令牌。",
          confirmLabel: "确认继续",
          tone: "warning"
        });
        if (!confirmedUrlReuse) {
          throw new Error("已取消：请确认新地址可信，或重新输入 Token。");
        }
        haConnectionInfo = await requestJson("/ha/connection", {
          method: "PUT",
          body: JSON.stringify(collectHaConnectionInput(false, true))
        });
      }
      isEditingHaConnection = false;
      syncHaConnectionUi();
      if (
        !(await waitForHaConnection()) &&
        !haConnectionInfo?.lastError &&
        haConnectionStatus?.status !== "error"
      ) {
        haDetailStatusElement.textContent = "后台仍在建立实时连接";
      }
    } catch (haSaveError) {
      isEditingHaConnection = true;
      syncHaConnectionUi();
      setSettingsMessage(haMessageElement, haSaveError.message, "error");
    } finally {
      haSubmitButton.disabled = false;
    }
  });
}

/**
 * 项目与安防编辑入口。
 *
 * 项目菜单、安防（HA）编辑开关、删除项目确认。
 */
function bindProjectSection() {
  const on = sections.section("project");
  on(haEditButtonElement, "click", startHaEditing);
  on(haEditCancelButtonElement, "click", cancelHaEditing);
  on(haDeleteButtonElement, "click", function onHaDeleteButtonClick() {
    deleteHaFormElement.reset();
    setSettingsMessage(deleteHaMessageElement, "");
    haDialogElement.close();
    deleteHaDialogElement.showModal();
  });
  on(deleteHaCloseButtonElement, "click", function onDeleteHaCloseButtonClick() { return deleteHaDialogElement.close(); });
  on(deleteHaCancelButtonElement, "click", function onDeleteHaCancelButtonClick() { return deleteHaDialogElement.close(); });
  on(deleteHaDialogElement, "click", function onDeleteHaDialogClick(deleteHaBackdropEvent) {
    if (deleteHaBackdropEvent.target === deleteHaDialogElement) {
      deleteHaDialogElement.close();
    }
  });
  on(deleteHaFormElement, "submit", async function onDeleteHaFormSubmit(deleteHaSubmitEvent) {
    deleteHaSubmitEvent.preventDefault();
    if (String(new FormData(deleteHaFormElement).get("confirmation") || "").trim() !== "删除连接") {
      setSettingsMessage(deleteHaMessageElement, "请输入“删除连接”确认。", "error");
      return;
    }
    const deleteHaSubmitButton = deleteHaFormElement.querySelector('button[type="submit"]');
    deleteHaSubmitButton.disabled = true;
    setSettingsMessage(deleteHaMessageElement, "正在断开连接并清除同步目录…");
    try {
      await requestJson("/ha/connection", {
        method: "DELETE"
      });
      deleteHaDialogElement.close();
      haConnectionInfo = null;
      haConnectionStatus = null;
      isEditingHaConnection = false;
      await refreshHaConnection({
        preserveForm: false
      });
    } catch (deleteHaError) {
      setSettingsMessage(deleteHaMessageElement, deleteHaError.message, "error");
    } finally {
      deleteHaSubmitButton.disabled = false;
    }
  });
  on(projectNewButtonElement, "click", async function onProjectNewButtonClick() {
    if (!guardUnsavedChanges()) {
      openProjectDialog("create");
    }
  });
  on(projectCloseButtonElement, "click", function onProjectCloseButtonClick() { return projectDialogElement.close(); });
  on(projectCancelButtonElement, "click", function onProjectCancelButtonClick() { return projectDialogElement.close(); });
  on(projectDialogElement, "click", function onProjectDialogClick(projectBackdropEvent) {
    if (projectBackdropEvent.target === projectDialogElement) {
      projectDialogElement.close();
    }
  });
  on(projectCanvasWidthInputElement, "input", function onProjectCanvasWidthInputInput() {
    syncLockedCanvasDimension("width");
    renderAspectRatio();
  });
  on(projectCanvasHeightInputElement, "input", function onProjectCanvasHeightInputInput() {
    syncLockedCanvasDimension("height");
    renderAspectRatio();
  });
  on(projectAspectLockButtonElement, "click", function onProjectAspectLockButtonClick() {
    if (!["create", "resize"].includes(projectDialogMode)) {
      return;
    }
    const inputWidthValue = Number(projectCanvasWidthInputElement.value);
    const inputHeightValue = Number(projectCanvasHeightInputElement.value);
    if (
      !Number.isInteger(inputWidthValue) ||
      !Number.isInteger(inputHeightValue) ||
      inputWidthValue < 320 ||
      inputWidthValue > 7680 ||
      inputHeightValue < 240 ||
      inputHeightValue > 4320
    ) {
      setSettingsMessage(projectMessageElement, "请先输入有效的宽度和高度后再锁定比例。", "error");
      return;
    }
    isAspectLocked = !isAspectLocked;
    if (isAspectLocked) {
      lockedCanvasWidth = inputWidthValue;
      lockedCanvasHeight = inputHeightValue;
    }
    setSettingsMessage(projectMessageElement, "");
    syncAspectLockButton(false);
  });
  on(projectResizeWarningCloseButtonElement, "click", function onProjectResizeWarningCloseButtonClick() { return settleCanvasResizeWarning(false); }
  );
  on(projectResizeWarningCancelButtonElement, "click", function onProjectResizeWarningCancelButtonClick() { return settleCanvasResizeWarning(false); }
  );
  on(projectResizeWarningConfirmButtonElement, "click", function onProjectResizeWarningConfirmButtonClick() { return settleCanvasResizeWarning(true); }
  );
  on(projectResizeWarningDialogElement, "cancel", function onProjectResizeWarningDialogCancel(resizeWarningCancelEvent) {
    resizeWarningCancelEvent.preventDefault();
    settleCanvasResizeWarning(false);
  });
  on(projectFormElement, "submit", async function onProjectFormSubmit(projectSubmitEvent) {
    projectSubmitEvent.preventDefault();
    const projectFormData = new FormData(projectFormElement);
    const projectNameInput = String(projectFormData.get("name") || "").trim();
    const formCanvasWidth = Number(projectFormData.get("canvasWidth"));
    const formCanvasHeight = Number(projectFormData.get("canvasHeight"));
    const lockContentChecked =
      projectDialogMode === "resize" && projectContentLockCheckboxElement.checked;
    if (projectDialogMode === "resize" && lockContentChecked) {
      const currentCanvasWidth = Number(activeProject?.document?.canvas?.width || 2778);
      const currentCanvasHeight = Number(activeProject?.document?.canvas?.height || 1940);
      const outsideComponentCount =
        formCanvasWidth !== currentCanvasWidth || formCanvasHeight !== currentCanvasHeight
          ? // 先在「已按 lockContent 预演过」的文档上统计：外框尺寸与最终落盘的
            // 完全一致，铺满型 3D 也就不会被误判成越界。
            countComponentsOutsideCanvas(
              resizeDashboardDocument(
                activeProject.document,
                formCanvasWidth,
                formCanvasHeight,
                {
                  lockContent: true
                }
              ),
              formCanvasWidth,
              formCanvasHeight
            )
          : 0;
      if (
        outsideComponentCount > 0 &&
        !(await confirmCanvasResize(outsideComponentCount, formCanvasWidth, formCanvasHeight))
      ) {
        return;
      }
    }
    projectSubmitButtonElement.disabled = true;
    setSettingsMessage(
      projectMessageElement,
      projectDialogMode === "resize"
        ? "正在调整整个仪表盘…"
        : projectDialogMode === "edit"
          ? "正在保存仪表盘名称…"
          : "正在创建空白仪表盘…"
    );
    try {
      if (projectDialogMode === "resize") {
        const resizedDocument = resizeDashboardDocument(
          activeProject.document,
          formCanvasWidth,
          formCanvasHeight,
          {
            lockContent: lockContentChecked
          }
        );
        resizedDocument.name = projectNameInput;
        await applyDocumentChange(resizedDocument);
        projectDialogElement.close();
      } else if (projectDialogMode === "edit") {
        const renamedDocument = clone(activeProject.document);
        renamedDocument.name = projectNameInput;
        await applyDocumentChange(renamedDocument);
        projectDialogElement.close();
      } else {
        const createProjectPayload = {
          name: projectNameInput,
          canvasWidth: formCanvasWidth,
          canvasHeight: formCanvasHeight
        };
        const createdProject = await requestJson("/projects", {
          method: "POST",
          body: JSON.stringify(createProjectPayload)
        });
        projectDialogElement.close();
        await loadProjects(createdProject.id);
      }
    } catch (projectDialogError) {
      setSettingsMessage(projectMessageElement, projectDialogError.message, "error");
    } finally {
      projectSubmitButtonElement.disabled = false;
    }
  });
  on(projectActionsButtonElement, "click", function onProjectActionsButtonClick() {
    const menuWasHidden = projectActionsMenuElement.hidden;
    closeCustomSelectMenu();
    closeProjectActionsMenu();
    closePageActionsMenu();
    projectActionsMenuElement.hidden = !menuWasHidden;
    projectActionsButtonElement.setAttribute("aria-expanded", String(menuWasHidden));
  });
  on(projectFloorplanOpenButtonElement, "click", function onProjectFloorplanOpenButtonClick() {
    if (!guardUnsavedChanges()) {
      window.location.assign("/3d-studio");
    }
  });
  on(projectActionsMenuElement, "click", async function onProjectActionsMenuClick(projectActionsClickEvent) {
    const projectAction =
      projectActionsClickEvent.target.closest("[data-project-action]")?.dataset.projectAction;
    if (!!projectAction && !!activeProject && (closeProjectActionsMenu(), !guardUnsavedChanges())) {
      if (projectAction === "edit") {
        openProjectDialog("edit");
        return;
      }
      if (projectAction === "resize") {
        openProjectDialog("resize");
        return;
      }
      if (projectAction === "duplicate") {
        const sourceProjectName = activeProject.document.name;
        const existingProjectNames = new Set(
          projects.map(projectNameCandidate => projectNameCandidate.name)
        );
        let copyName = sourceProjectName + " 副本";
        let copyIndex = 2;
        while (existingProjectNames.has(copyName)) {
          copyName = sourceProjectName + " 副本 " + copyIndex++;
        }
        try {
          const duplicatedProject = await requestJson(
            "/projects/" + activeProject.projectId + "/duplicate",
            {
              method: "POST",
              body: JSON.stringify({
                name: copyName
              })
            }
          );
          await loadProjects(duplicatedProject.id);
        } catch (duplicateProjectError) {
          handleOperationError(duplicateProjectError);
        }
        return;
      }
      if (projectAction === "delete") {
        const projectToDelete = projects.find(
          deleteCandidateProject => deleteCandidateProject.id === activeProject.projectId
        );
        if (!projectToDelete) {
          return;
        }
        deleteProjectFormElement.reset();
        deleteProjectNameElement.textContent = "“" + projectToDelete.name + "”";
        deleteProjectDialogElement.dataset.projectId = projectToDelete.id;
        deleteProjectDialogElement.dataset.projectName = projectToDelete.name;
        setSettingsMessage(deleteProjectMessageElement, "");
        deleteProjectDialogElement.showModal();
      }
    }
  });
  on(deleteProjectCloseButtonElement, "click", function onDeleteProjectCloseButtonClick() { return deleteProjectDialogElement.close(); });
  on(deleteProjectCancelButtonElement, "click", function onDeleteProjectCancelButtonClick() { return deleteProjectDialogElement.close(); }
  );
  on(deleteProjectDialogElement, "click", function onDeleteProjectDialogClick(deleteProjectBackdropEvent) {
    if (deleteProjectBackdropEvent.target === deleteProjectDialogElement) {
      deleteProjectDialogElement.close();
    }
  });
  on(deleteProjectFormElement, "submit", async function onDeleteProjectFormSubmit(deleteProjectSubmitEvent) {
    deleteProjectSubmitEvent.preventDefault();
    const deleteProjectSubmitButton = deleteProjectFormElement.querySelector('button[type="submit"]');
    const deleteProjectConfirmText = String(
      new FormData(deleteProjectFormElement).get("confirmation") || ""
    );
    const deleteProjectTargetId = deleteProjectDialogElement.dataset.projectId;
    const deleteProjectTargetName = deleteProjectDialogElement.dataset.projectName;
    if (deleteProjectConfirmText !== deleteProjectTargetName) {
      setSettingsMessage(
        deleteProjectMessageElement,
        "请输入与项目名称完全一致的确认文字。",
        "error"
      );
      return;
    }
    deleteProjectSubmitButton.disabled = true;
    setSettingsMessage(deleteProjectMessageElement, "正在删除项目和草稿…");
    try {
      await requestJson("/projects/" + deleteProjectTargetId, {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: deleteProjectConfirmText
        })
      });
      discardRecoverySnapshot(deleteProjectTargetId);
      deleteProjectDialogElement.close();
      editorRenderer?.destroy();
      editorRenderer = null;
      activeProject = null;
      clearComponentSelection();
      await loadProjects();
    } catch (deleteProjectError) {
      setSettingsMessage(deleteProjectMessageElement, deleteProjectError.message, "error");
    } finally {
      deleteProjectSubmitButton.disabled = false;
    }
  });
  on(pageNewButtonElement, "click", function onPageNewButtonClick() { return openPageDialog("create"); });
  on(pageCloseButtonElement, "click", function onPageCloseButtonClick() { return pageDialogElement.close(); });
  on(pageCancelButtonElement, "click", function onPageCancelButtonClick() { return pageDialogElement.close(); });
  on(pageDialogElement, "click", function onPageDialogClick(pageBackdropEvent) {
    if (pageBackdropEvent.target === pageDialogElement) {
      pageDialogElement.close();
    }
  });
  on(pageFormElement, "submit", async function onPageFormSubmit(pageSubmitEvent) {
    pageSubmitEvent.preventDefault();
    const pageNameInput = String(new FormData(pageFormElement).get("name") || "").trim();
    const pageDraftDocument = clone(activeProject.document);
    const pageSelectPath = pageSelectElement.value;
    pageSubmitButtonElement.disabled = true;
    setSettingsMessage(
      pageMessageElement,
      pageDialogMode === "rename" ? "正在保存页面名称…" : "正在创建页面…"
    );
    try {
      if (pageDialogMode === "rename") {
        const renamedPage = pageDraftDocument.pages.find(
          pageCandidate => pageCandidate.path === pageSelectPath
        );
        renamedPage.name = pageNameInput;
        await applyDocumentChange(pageDraftDocument, pageSelectPath);
      } else {
        const newPageObject = {
          id: newId("page"),
          name: pageNameInput,
          path: uniquePagePath(activeProject?.document?.pages, pageNameInput),
          sharedComponentIds: pageDraftDocument.sharedComponents.map(
            sharedComponentCandidate => sharedComponentCandidate.id
          ),
          components: []
        };
        const insertIndex = Math.max(
          0,
          pageDraftDocument.pages.findIndex(existingPage => existingPage.path === pageSelectPath)
        );
        pageDraftDocument.pages.splice(insertIndex + 1, 0, newPageObject);
        await applyDocumentChange(pageDraftDocument, newPageObject.path);
      }
      pageDialogElement.close();
    } catch (pageDialogError) {
      setSettingsMessage(pageMessageElement, pageDialogError.message, "error");
    } finally {
      pageSubmitButtonElement.disabled = false;
    }
  });
}

/**
 * 组件分组、页面与组件删除。
 *
 * 重命名分组、删除页面/组件、行内右键菜单与二次确认。这一片原本是 500 行顶层匿名回调。
 */
function bindDialogSection() {
  const on = sections.section("dialogs");
  on(componentGroupRenameCloseButtonElement, "click", function onComponentGroupRenameCloseButtonClick() { return componentGroupRenameDialogElement.close(); }
  );
  on(componentGroupRenameCancelButtonElement, "click", function onComponentGroupRenameCancelButtonClick() { return componentGroupRenameDialogElement.close(); }
  );
  on(componentGroupRenameDialogElement, "click", function onComponentGroupRenameDialogClick(groupRenameBackdropEvent) {
    if (groupRenameBackdropEvent.target === componentGroupRenameDialogElement) {
      componentGroupRenameDialogElement.close();
    }
  });
  on(componentGroupRenameFormElement, "submit", function onComponentGroupRenameFormSubmit(groupRenameSubmitEvent) {
    groupRenameSubmitEvent.preventDefault();
    const groupComponentId = componentGroupRenameDialogElement.dataset.groupId || "";
    const renamedGroupComponent = findComponent(activeProject?.document, groupComponentId)?.component;
    if (!renamedGroupComponent || renamedGroupComponent.type !== "group") {
      componentGroupRenameDialogElement.close();
      return;
    }
    const currentGroupLabel = componentLabel(renamedGroupComponent);
    const groupNameInput = String(new FormData(componentGroupRenameFormElement).get("name") || "")
      .trim()
      .slice(0, 128);
    if (!groupNameInput) {
      setSettingsMessage(componentGroupRenameMessageElement, "请输入组合名称。", "error");
      return;
    }
    if (groupNameInput === currentGroupLabel) {
      componentGroupRenameDialogElement.close();
      return;
    }
    mutateDocument(groupRenameDraftDocument => {
      const groupComponentInDraft = findComponent(
        groupRenameDraftDocument,
        groupComponentId
      )?.component;
      if (groupComponentInDraft?.type === "group") {
        groupComponentInDraft.properties = {
          ...(groupComponentInDraft.properties || {}),
          label: groupNameInput
        };
      }
    });
    componentGroupRenameDialogElement.close();
  });
  on(pageActionsButtonElement, "click", function onPageActionsButtonClick() {
    const pageMenuWasHidden = pageActionsMenuElement.hidden;
    closeCustomSelectMenu();
    closeProjectActionsMenu();
    closePageActionsMenu();
    pageActionsMenuElement.hidden = !pageMenuWasHidden;
    pageActionsButtonElement.setAttribute("aria-expanded", String(pageMenuWasHidden));
  });
  on(pageActionsMenuElement, "click", async function onPageActionsMenuClick(pageActionsClickEvent) {
    const pageAction = pageActionsClickEvent.target.closest("[data-page-action]")?.dataset.pageAction;
    const pageForAction = currentPage();
    if (!pageAction || !pageForAction || !activeProject) {
      return;
    }
    closePageActionsMenu();
    if (pageAction === "rename") {
      openPageDialog("rename");
      return;
    }
    const pageActionDocument = clone(activeProject.document);
    const pageIndex = pageActionDocument.pages.findIndex(
      pageIndexCandidate => pageIndexCandidate.path === pageForAction.path
    );
    if (pageAction === "default") {
      if (pageActionDocument.defaultPagePath === pageForAction.path) {
        return;
      }
      pageActionDocument.defaultPagePath = pageForAction.path;
      try {
        await applyDocumentChange(pageActionDocument, pageForAction.path);
        await saveDraft();
      } catch (defaultPageError) {
        handleOperationError(defaultPageError);
      }
      return;
    }
    if (pageAction === "duplicate") {
      const duplicatedPage = clonePageWithFreshIds(
        pageForAction,
        pageForAction.name + " 副本",
        activeProject.document.pages
      );
      pageActionDocument.pages.splice(pageIndex + 1, 0, duplicatedPage);
      try {
        await applyDocumentChange(pageActionDocument, duplicatedPage.path);
      } catch (duplicatePageError) {
        handleOperationError(duplicatePageError);
      }
      return;
    }
    if (pageAction === "delete") {
      deletePageDialogElement.dataset.pagePath = pageForAction.path;
      deletePageNameElement.textContent = "“" + pageForAction.name + "”";
      setSettingsMessage(deletePageMessageElement, "");
      deletePageDialogElement.showModal();
    }
  });
  on(deletePageCloseButtonElement, "click", function onDeletePageCloseButtonClick() { return deletePageDialogElement.close(); });
  on(deletePageCancelButtonElement, "click", function onDeletePageCancelButtonClick() { return deletePageDialogElement.close(); });
  on(deletePageDialogElement, "click", function onDeletePageDialogClick(deletePageBackdropEvent) {
    if (deletePageBackdropEvent.target === deletePageDialogElement) {
      deletePageDialogElement.close();
    }
  });
  on(deletePageConfirmButtonElement, "click", async function onDeletePageConfirmButtonClick() {
    const deletedPagePath = deletePageDialogElement.dataset.pagePath;
    const deletePageDocument = clone(activeProject.document);
    const deletedPageIndex = deletePageDocument.pages.findIndex(
      deletedPageCandidate => deletedPageCandidate.path === deletedPagePath
    );
    if (deletedPageIndex < 0) {
      setSettingsMessage(deletePageMessageElement, "页面已经不存在，请刷新后重试。", "error");
      return;
    }
    const deletedPage = deletePageDocument.pages[deletedPageIndex];
    deletePageDocument.pages.splice(deletedPageIndex, 1);
    const fallbackPagePath =
      deletePageDocument.pages[Math.max(0, deletedPageIndex - 1)]?.path ||
      deletePageDocument.pages[0]?.path ||
      null;
    const fallbackPage = deletePageDocument.pages.find(
      fallbackCandidate => fallbackCandidate.path === fallbackPagePath
    );
    if (deletePageDocument.defaultPagePath === deletedPagePath) {
      deletePageDocument.defaultPagePath = fallbackPagePath;
    }
    /**
     * 把组件树里所有指向被删页面的引用改写到回退页面：导航按钮的 properties.targetPage（同时改写主/副标题，
     * 但只在标题还是默认值时才改，避免覆盖用户自定义文案），以及 tap/doubleTap/hold 三种动作里 type === "navigate" 的 target。
     * 没有回退页面时（删掉的是最后一个页面）删除引用字段而非留一个空串目标，让渲染器走「未设置跳转」分支。
     */
    const remapPageReferences = componentList => {
      for (const scannedComponent of componentList || []) {
        scannedComponent.properties = {
          ...(scannedComponent.properties || {})
        };
        if (
          scannedComponent.type === "navigation-button" &&
          scannedComponent.properties.targetPage === deletedPagePath
        ) {
          if (
            !scannedComponent.properties.mainText ||
            scannedComponent.properties.mainText === "页面导航" ||
            scannedComponent.properties.mainText === deletedPage?.name
          ) {
            scannedComponent.properties.mainText = fallbackPage?.name || "页面导航";
          }
          const deletedPageLabelUpper = String(deletedPagePath).replace(/[-_]+/g, " ").toUpperCase();
          if (
            !scannedComponent.properties.secondaryText ||
            scannedComponent.properties.secondaryText === "NAVIGATION" ||
            scannedComponent.properties.secondaryText === deletedPageLabelUpper
          ) {
            scannedComponent.properties.secondaryText = fallbackPagePath
              ? String(fallbackPagePath).replace(/[-_]+/g, " ").toUpperCase()
              : "NAVIGATION";
          }
          if (fallbackPagePath) {
            scannedComponent.properties.targetPage = fallbackPagePath;
          } else {
            delete scannedComponent.properties.targetPage;
          }
        }
        scannedComponent.actions = {
          ...(scannedComponent.actions || {})
        };
        for (const actionKind of ["tap", "doubleTap", "hold"]) {
          if (
            scannedComponent.actions[actionKind]?.type === "navigate" &&
            scannedComponent.actions[actionKind]?.target === deletedPagePath
          ) {
            if (scannedComponent.type === "navigation-button" && fallbackPagePath) {
              scannedComponent.actions[actionKind] = {
                type: "navigate",
                target: fallbackPagePath
              };
            } else {
              delete scannedComponent.actions[actionKind];
            }
          }
        }
        remapPageReferences(scannedComponent.children);
      }
    };
    remapPageReferences(deletePageDocument.sharedComponents);
    for (const scannedPage of deletePageDocument.pages) {
      remapPageReferences(scannedPage.components);
    }
    deletePageConfirmButtonElement.disabled = true;
    setSettingsMessage(deletePageMessageElement, "正在删除页面…");
    try {
      await applyDocumentChange(deletePageDocument, fallbackPagePath);
      deletePageDialogElement.close();
    } catch (deletePageError) {
      setSettingsMessage(deletePageMessageElement, deletePageError.message, "error");
    } finally {
      deletePageConfirmButtonElement.disabled = false;
    }
  });
  on(componentContextMenuElement, "click", function onComponentContextMenuClick(contextMenuClickEvent) {
    const menuComponentId = contextMenuComponentId;
    const componentAction =
      contextMenuClickEvent.target.closest("[data-component-action]")?.dataset.componentAction;
    const labelColorElement = contextMenuClickEvent.target.closest("[data-label-color]");
    if (!menuComponentId || (!componentAction && !labelColorElement)) {
      return;
    }
    const actionComponentIds = selectedComponentIds.has(menuComponentId)
      ? [...selectedComponentIds]
      : [menuComponentId];
    closeComponentContextMenu();
    if (componentAction === "copy") {
      duplicateComponents(actionComponentIds, menuComponentId);
      return;
    }
    if (componentAction === "group") {
      groupSelectedComponents(actionComponentIds);
      return;
    }
    if (componentAction === "ungroup") {
      ungroupComponent(menuComponentId);
      return;
    }
    if (componentAction === "rename-group") {
      openGroupRenameDialog(menuComponentId);
      return;
    }
    if (componentAction === "copy-to-page") {
      openCopyComponentDialog(actionComponentIds);
      return;
    }
    if (componentAction === "visibility") {
      const visibilityFlags = actionComponentIds
        .map(
          scannedVisibilityId =>
            findComponent(activeProject?.document, scannedVisibilityId)?.component
        )
        .filter(Boolean)
        .map(scannedVisibilityComponent => scannedVisibilityComponent.style?.visible !== false);
      if (
        visibilityFlags.length !== actionComponentIds.length ||
        !visibilityFlags.length ||
        !visibilityFlags.every(visibilityFlag => visibilityFlag === visibilityFlags[0])
      ) {
        return;
      }
      setComponentsVisibility(actionComponentIds, !visibilityFlags[0]);
      return;
    }
    if (componentAction === "delete") {
      openDeleteComponentDialog(actionComponentIds);
      return;
    }
    if (labelColorElement) {
      setComponentsLabelColor(actionComponentIds, labelColorElement.dataset.labelColor);
    }
  });
  on(deleteComponentCloseButtonElement, "click", function onDeleteComponentCloseButtonClick() { return deleteComponentDialogElement.close(); }
  );
  on(deleteComponentCancelButtonElement, "click", function onDeleteComponentCancelButtonClick() { return deleteComponentDialogElement.close(); }
  );
  on(deleteComponentDialogElement, "click", function onDeleteComponentDialogClick(deleteComponentBackdropEvent) {
    if (deleteComponentBackdropEvent.target === deleteComponentDialogElement) {
      deleteComponentDialogElement.close();
    }
  });
  on(copyComponentPageCloseButtonElement, "click", function onCopyComponentPageCloseButtonClick() { return copyComponentPageDialogElement.close(); }
  );
  on(copyComponentPageCancelButtonElement, "click", function onCopyComponentPageCancelButtonClick() { return copyComponentPageDialogElement.close(); }
  );
  on(copyComponentPageDialogElement, "click", function onCopyComponentPageDialogClick(copyPageBackdropEvent) {
    if (copyPageBackdropEvent.target === copyComponentPageDialogElement) {
      copyComponentPageDialogElement.close();
    }
  });
  on(copyComponentSuccessStayButtonElement, "click", function onCopyComponentSuccessStayButtonClick() {
    copySuccessNavigationTarget = null;
    copyComponentSuccessDialogElement.close();
  });
  on(copyComponentSuccessGoButtonElement, "click", function onCopyComponentSuccessGoButtonClick() {
    handleCopySuccessConfirm().catch(handleOperationError);
  });
  on(copyComponentSuccessDialogElement, "click", function onCopyComponentSuccessDialogClick(copySuccessBackdropEvent) {
    if (copySuccessBackdropEvent.target === copyComponentSuccessDialogElement) {
      copySuccessNavigationTarget = null;
      copyComponentSuccessDialogElement.close();
    }
  });
  on(copyComponentPageScopeSelectElement, "change", function onCopyComponentPageScopeSelectChange() {
    renderCopyComponentDialog();
  });
  on(copyComponentPageProjectSelectElement, "change", function onCopyComponentPageProjectSelectChange() {
    if (copyComponentPageScopeSelectElement.value === "other") {
      renderCopyComponentDialog();
    }
  });
  on(copyComponentPageFormElement, "submit", async function onCopyComponentPageFormSubmit(copyComponentSubmitEvent) {
    copyComponentSubmitEvent.preventDefault();
    let componentIdsToCopy = [];
    try {
      componentIdsToCopy = JSON.parse(copyComponentPageDialogElement.dataset.componentIds || "[]");
    } catch {
      componentIdsToCopy = [];
    }
    const copyTargetValue = copyComponentPageTargetSelectElement.value;
    const isCrossProjectCopy = copyComponentPageScopeSelectElement.value === "other";
    if (!!activeProject && !!componentIdsToCopy.length && !!copyTargetValue) {
      copyComponentPageSubmitButtonElement.disabled = true;
      setSettingsMessage(copyComponentPageMessageElement, "正在复制控件…");
      try {
        if (isCrossProjectCopy) {
          const copyTargetProjectId = copyComponentPageProjectSelectElement.value;
          if (
            !copyTargetProjectId ||
            !copyTargetDraft ||
            copyTargetDraft.projectId !== copyTargetProjectId
          ) {
            throw new Error("目标仪表盘尚未加载完成，请稍后重试。");
          }
          const targetProjectDraftDocument = clone(copyTargetDraft.document);
          const copyScaleMode = copyComponentScaleOptionsElement.hidden
            ? "none"
            : copyComponentPageFormElement.elements.copyScaleMode.value;
          let droppedActionCount = 0;
          const copiedComponents = copyComponentsAcrossDocuments(
            activeProject.document,
            targetProjectDraftDocument,
            componentIdsToCopy,
            copyTargetValue,
            {
              cloneValue: clone,
              createId: () => newId("component"),
              componentLabel: componentLabel,
              scaleMode: copyScaleMode,
              onInvalidAction: () => {
                droppedActionCount += 1;
              }
            }
          );
          if (!copiedComponents.length) {
            throw new Error("目标页面或源控件已发生变化，请重新操作。");
          }
          const copyDraftResponse = await requestJson(
            "/projects/" + encodeURIComponent(copyTargetProjectId) + "/draft",
            {
              method: "PUT",
              body: JSON.stringify({
                revision: copyTargetDraft.revision,
                globalPopupRevision: copyTargetDraft.globalPopupRevision,
                globalPopupsDirty: false,
                document: targetProjectDraftDocument
              })
            }
          );
          copyTargetDraft = copyDraftResponse;
          const copyTargetProject = projects.find(
            copyTargetCandidate => copyTargetCandidate.id === copyTargetProjectId
          );
          if (copyTargetProject) {
            copyTargetProject.draftRevision = copyDraftResponse.revision;
          }
          const copyTargetProjectName = copyTargetProject?.name || "目标仪表盘";
          const copyTargetPageLabel =
            copyComponentPageTargetSelectElement.selectedOptions[0]?.textContent || "目标区域";
          const cleanupNotice = droppedActionCount
            ? "（已清理 " + droppedActionCount + " 个目标仪表盘不存在的跳转或弹窗动作）"
            : "";
          copyComponentPageDialogElement.close();
          showCopySuccessDialog(
            "已复制 " +
              copiedComponents.length +
              " 个控件到“" +
              copyTargetProjectName +
              "”的“" +
              copyTargetPageLabel +
              "”，并已保存" +
              cleanupNotice +
              "。",
            {
              projectId: copyTargetProjectId,
              pagePath:
                copyTargetValue === "shared"
                  ? copyTargetDraft.document.pages?.[0]?.path
                  : copyTargetValue.replace(/^page:/, ""),
              scope: copyTargetValue === "shared" ? "shared" : "page"
            }
          );
          return;
        }
        const localDraftDocument = clone(activeProject.document);
        const copiedLocalComponents = copyComponentsToTarget(
          localDraftDocument,
          componentIdsToCopy,
          copyTargetValue,
          {
            cloneValue: clone,
            createId: () => newId("component"),
            componentLabel: componentLabel
          }
        );
        if (!copiedLocalComponents.length) {
          throw new Error("目标页面或源控件已发生变化，请重新操作。");
        }
        selectedComponentId = copiedLocalComponents[0].id;
        selectedComponentIds = new Set(
          copiedLocalComponents.map(copiedComponentItem => copiedComponentItem.id)
        );
        selectionAnchorComponentId = copiedLocalComponents[0].id;
        const localCopyPagePath =
          copyTargetValue === "shared"
            ? pageSelectElement.value
            : copyTargetValue.replace(/^page:/, "");
        const localCopyTargetLabel =
          copyComponentPageTargetSelectElement.selectedOptions[0]?.textContent || "目标区域";
        await applyDocumentChange(localDraftDocument, localCopyPagePath);
        copyComponentPageDialogElement.close();
        showCopySuccessDialog(
          "已复制 " +
            copiedLocalComponents.length +
            " 个控件到“" +
            localCopyTargetLabel +
            "”，并已保存。",
          {
            projectId: activeProject.projectId,
            pagePath: localCopyPagePath,
            scope: copyTargetValue === "shared" ? "shared" : "page"
          }
        );
      } catch (copyComponentError) {
        setSettingsMessage(copyComponentPageMessageElement, copyComponentError.message, "error");
      } finally {
        if (!isCrossProjectCopy || !copyComponentPageMessageElement.classList.contains("success")) {
          copyComponentPageSubmitButtonElement.disabled = false;
        }
      }
    }
  });
  on(deleteComponentConfirmButtonElement, "click", function onDeleteComponentConfirmButtonClick() {
    let pendingDeleteComponentIds = [];
    try {
      pendingDeleteComponentIds = JSON.parse(
        deleteComponentDialogElement.dataset.componentIds || "[]"
      );
    } catch {
      pendingDeleteComponentIds = [];
    }
    if (!pendingDeleteComponentIds.length) {
      return;
    }
    deleteComponentDialogElement.close();
    const deleteIdSet = new Set(pendingDeleteComponentIds);
    selectedComponentIds = new Set(
      [...selectedComponentIds].filter(
        selectedComponentIdCandidate => !deleteIdSet.has(selectedComponentIdCandidate)
      )
    );
    if (deleteIdSet.has(selectedComponentId)) {
      selectedComponentId = selectedComponentIds.values().next().value || null;
    }
    if (deleteIdSet.has(selectionAnchorComponentId)) {
      selectionAnchorComponentId = selectedComponentId;
    }
    mutateDocument(deleteDraftDocument => {
      for (const deletedComponentId of pendingDeleteComponentIds) {
        removeComponent(deleteDraftDocument, deletedComponentId);
      }
    });
  });
  on(imageInspectorFormElement, "submit", function onImageInspectorFormSubmit(imageInspectorSubmitEvent) { return imageInspectorSubmitEvent.preventDefault(); }
  );
  on(iconButtonEffectInspectorFormElement, "submit",
    function onIconButtonEffectInspectorFormSubmit(iconButtonEffectInspectorSubmitEvent) { return iconButtonEffectInspectorSubmitEvent.preventDefault(); }
  );
  on(titleButtonInspectorFormElement, "submit", function onTitleButtonInspectorFormSubmit(titleButtonInspectorSubmitEvent) { return titleButtonInspectorSubmitEvent.preventDefault(); }
  );
  on(lightStatisticsInspectorFormElement, "submit",
    function onLightStatisticsInspectorFormSubmit(lightStatisticsInspectorSubmitEvent) { return lightStatisticsInspectorSubmitEvent.preventDefault(); }
  );
  on(iconButtonInspectorFormElement, "submit", function onIconButtonInspectorFormSubmit(iconButtonInspectorSubmitEvent) { return iconButtonInspectorSubmitEvent.preventDefault(); }
  );
  on(vacuumMapInspectorFormElement, "submit", function onVacuumMapInspectorFormSubmit(vacuumMapInspectorSubmitEvent) { return vacuumMapInspectorSubmitEvent.preventDefault(); }
  );
  on(cameraInspectorFormElement, "submit", function onCameraInspectorFormSubmit(cameraInspectorSubmitEvent) { return cameraInspectorSubmitEvent.preventDefault(); }
  );
  on(airConditionerInspectorFormElement, "submit", function onAirConditionerInspectorFormSubmit(airConditionerInspectorSubmitEvent) { return airConditionerInspectorSubmitEvent.preventDefault(); }
  );
  on(timeInspectorFormElement, "submit", function onTimeInspectorFormSubmit(timeInspectorSubmitEvent) { return timeInspectorSubmitEvent.preventDefault(); }
  );
  on(dateInspectorFormElement, "submit", function onDateInspectorFormSubmit(dateInspectorSubmitEvent) { return dateInspectorSubmitEvent.preventDefault(); }
  );
  on(weatherInspectorFormElement, "submit", function onWeatherInspectorFormSubmit(weatherInspectorSubmitEvent) { return weatherInspectorSubmitEvent.preventDefault(); }
  );
  on(lineChartInspectorFormElement, "submit", function onLineChartInspectorFormSubmit(lineChartInspectorSubmitEvent) { return lineChartInspectorSubmitEvent.preventDefault(); }
  );
  on(panelFrameInspectorFormElement, "submit", function onPanelFrameInspectorFormSubmit(panelFrameInspectorSubmitEvent) { return panelFrameInspectorSubmitEvent.preventDefault(); }
  );
  on(navigationInspectorFormElement, "submit", function onNavigationInspectorFormSubmit(navigationInspectorSubmitEvent) { return navigationInspectorSubmitEvent.preventDefault(); }
  );
}

/**
 * 文档级事件与图片/平面图检查器。
 *
 * 挂在 document 上的 click / input / change 兜底，以及图片检查器与平面图自动图检查器的回填。
 */
function bindDocumentSection() {
  const on = sections.section("document");
  on(document, "click", function onDocumentClick(documentClickEvent) {
    const entityPickerButton = documentClickEvent.target.closest("[data-popup-entity-button]");
    if (entityPickerButton) {
      const entityTriggerHost = entityPickerButton.closest("[data-action-trigger]");
      const entityOptionsMenuElement = entityTriggerHost?.querySelector("[data-popup-entity-menu]");
      if (!entityTriggerHost || !entityOptionsMenuElement) {
        return;
      }
      const entityMenuWasHidden = entityOptionsMenuElement.hidden;
      closePopupEntityMenus(entityMenuWasHidden ? entityTriggerHost : null);
      entityOptionsMenuElement.hidden = !entityMenuWasHidden;
      entityPickerButton.setAttribute("aria-expanded", String(entityMenuWasHidden));
      if (entityMenuWasHidden) {
        const entitySearchInput = entityTriggerHost.querySelector("[data-popup-entity-search]");
        entitySearchInput.value = "";
        renderPopupEntityOptions(entityTriggerHost, "");
        positionPopupEntityMenu(entityTriggerHost);
        window.requestAnimationFrame(() =>
          entitySearchInput.focus({
            preventScroll: true
          })
        );
      }
      return;
    }
    const popupActionEntityOption = documentClickEvent.target.closest(
      "[data-popup-action-entity-id]"
    );
    if (!popupActionEntityOption) {
      return;
    }
    const entityActionTriggerHost = popupActionEntityOption.closest("[data-action-trigger]");
    const popupEntityIdInput = entityActionTriggerHost?.querySelector("[data-popup-entity]");
    if (!!entityActionTriggerHost && !!popupEntityIdInput) {
      popupEntityIdInput.value = popupActionEntityOption.dataset.popupActionEntityId;
      syncPopupEntityButton(entityActionTriggerHost);
      closePopupEntityMenus();
      popupEntityIdInput.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    }
  });
  on(document, "input", function onDocumentInput(documentInputEvent) {
    const entitySearchField = documentInputEvent.target.closest("[data-popup-entity-search]");
    const searchTriggerHost = entitySearchField?.closest("[data-action-trigger]");
    if (!!entitySearchField && !!searchTriggerHost) {
      renderPopupEntityOptions(searchTriggerHost, entitySearchField.value);
      positionPopupEntityMenu(searchTriggerHost);
    }
  });
  on(iconButtonPreviewDetailsButtonElement, "click", function onIconButtonPreviewDetailsButtonClick() {
    const previewIconComponent = selectedComponent();
    const previewIconEntityId = previewIconComponent?.bindings?.entity?.entityId || "";
    if (previewIconComponent?.type === "icon-button" && !!previewIconEntityId) {
      try {
        ensureEditorRenderer().showEntityDetails(previewIconComponent, {
          preview: true
        });
      } catch (iconPreviewError) {
        handleOperationError(iconPreviewError);
      }
    }
  });
  on(airConditionerPreviewDetailsButtonElement, "click", function onAirConditionerPreviewDetailsButtonClick() {
    const previewAirConditioner = selectedComponent();
    const previewAcEntityId = previewAirConditioner?.bindings?.entity?.entityId || "";
    if (previewAirConditioner?.type === "air-conditioner" && !!previewAcEntityId) {
      try {
        ensureEditorRenderer().showEntityDetails(previewAirConditioner, {
          preview: true
        });
      } catch (acPreviewError) {
        handleOperationError(acPreviewError);
      }
    }
  });
  on(imageLayoutOptionsElement, "click", function onImageLayoutOptionsClick(imageLayoutClickEvent) {
    const imageLayoutOption = imageLayoutClickEvent.target.closest("[data-image-layout]");
    const layoutComponentId = selectedComponentId;
    if (!imageLayoutOption || !layoutComponentId) {
      return;
    }
    const requestedLayout = imageLayoutOption.dataset.imageLayout === "fill" ? "fill" : "free";
    const layoutComponent = selectedComponent();
    const currentLayout = layoutComponent?.properties?.layoutMode === "fill" ? "fill" : "free";
    if (!!layoutComponent && layoutComponent.type === "image" && currentLayout !== requestedLayout) {
      mutateDocument(layoutDraftDocument => {
        const layoutComponentInDraft = findComponent(
          layoutDraftDocument,
          layoutComponentId
        )?.component;
        if (!layoutComponentInDraft || layoutComponentInDraft.type !== "image") {
          return;
        }
        layoutComponentInDraft.properties = {
          ...(layoutComponentInDraft.properties || {}),
          fit: "contain"
        };
        layoutComponentInDraft.style = {
          ...(layoutComponentInDraft.style || {})
        };
        if (requestedLayout === "fill") {
          layoutComponentInDraft.properties.freeLayout = {
            position: clone(layoutComponentInDraft.position || {}),
            scale: clampNumber(Number(layoutComponentInDraft.style.scale || 1), 0.01, 5)
          };
          layoutComponentInDraft.properties.layoutMode = "fill";
          layoutComponentInDraft.position = {
            ...(layoutComponentInDraft.position || {}),
            x: 0,
            y: 0,
            width: Number(layoutDraftDocument.canvas?.width || 2778),
            height: Number(layoutDraftDocument.canvas?.height || 1940),
            rotation: 0
          };
          layoutComponentInDraft.style.scale = 1;
          return;
        }
        const savedFreeLayout = layoutComponentInDraft.properties.freeLayout;
        layoutComponentInDraft.properties.layoutMode = "free";
        if (savedFreeLayout?.position) {
          layoutComponentInDraft.position = clone(savedFreeLayout.position);
          layoutComponentInDraft.style.scale = clampNumber(
            Number(savedFreeLayout.scale || 1),
            0.01,
            5
          );
        } else {
          const naturalImageWidth = Number(
            layoutComponentInDraft.properties.naturalWidth ||
              layoutComponentInDraft.position?.width ||
              100
          );
          const naturalImageHeight = Number(
            layoutComponentInDraft.properties.naturalHeight ||
              layoutComponentInDraft.position?.height ||
              100
          );
          const imageCanvasWidth = Number(layoutDraftDocument.canvas?.width || 2778);
          const imageCanvasHeight = Number(layoutDraftDocument.canvas?.height || 1940);
          layoutComponentInDraft.position = {
            ...(layoutComponentInDraft.position || {}),
            x: (imageCanvasWidth - naturalImageWidth) / 2,
            y: (imageCanvasHeight - naturalImageHeight) / 2,
            width: naturalImageWidth,
            height: naturalImageHeight,
            rotation: 0
          };
          layoutComponentInDraft.style.scale = 1;
        }
        delete layoutComponentInDraft.properties.freeLayout;
      });
    }
  });
  on(imageInspectorFormElement, "input", function onImageInspectorFormInput(imageInspectorInputEvent) {
    const inspectedImage = selectedComponent();
    if (!inspectedImage || inspectedImage.type !== "image") {
      return;
    }
    const editedFieldInput = imageInspectorInputEvent.target;
    if (String(editedFieldInput.value).trim() === "") {
      return;
    }
    const fieldNumberValue = Number(editedFieldInput.value);
    if (!Number.isFinite(fieldNumberValue)) {
      return;
    }
    const canvasPixelWidth = Number(activeProject.document.canvas.width || 2778);
    const canvasPixelHeight = Number(activeProject.document.canvas.height || 1940);
    const imagePositionWidth = Number(inspectedImage.position?.width || 100);
    const imagePositionHeight = Number(inspectedImage.position?.height || 100);
    if (editedFieldInput === imageOpacityInputElement) {
      const clampedOpacity = clampNumber(fieldNumberValue, 0, 100);
      editorRenderer?.previewComponentProperties(inspectedImage.id, {
        opacity: clampedOpacity / 100
      });
    } else if (editedFieldInput === imageLeftInputElement) {
      const leftPercent = clampNumber(fieldNumberValue, 0, 100);
      editorRenderer?.previewComponentTransform(inspectedImage.id, {
        x: (canvasPixelWidth * leftPercent) / 100 - imagePositionWidth / 2
      });
    } else if (editedFieldInput === imageTopInputElement) {
      const topPercent = clampNumber(fieldNumberValue, 0, 100);
      editorRenderer?.previewComponentTransform(inspectedImage.id, {
        y: (canvasPixelHeight * topPercent) / 100 - imagePositionHeight / 2
      });
    } else if (editedFieldInput === imageScaleInputElement) {
      const scalePercent = clampNumber(fieldNumberValue, 1, 500);
      editorRenderer?.previewComponentTransform(inspectedImage.id, {
        scale: scalePercent / 100
      });
    } else if (editedFieldInput === imageRotationInputElement) {
      const rotationDeg = clampNumber(fieldNumberValue, -360, 360);
      editorRenderer?.previewComponentTransform(inspectedImage.id, {
        rotation: rotationDeg
      });
    }
  });
  on(imageInspectorFormElement, "change", function onImageInspectorFormChange(imageInspectorChangeEvent) {
    const changedInputElement = imageInspectorChangeEvent.target;
    const imageComponentId = selectedComponentId;
    if (
      !!imageComponentId &&
      !![
        imageLabelTextInputElement,
        imageOpacityInputElement,
        imageLeftInputElement,
        imageTopInputElement,
        imageScaleInputElement,
        imageRotationInputElement
      ].includes(changedInputElement)
    ) {
      if (
        [
          imageOpacityInputElement,
          imageLeftInputElement,
          imageTopInputElement,
          imageScaleInputElement,
          imageRotationInputElement
        ].includes(changedInputElement) &&
        (String(changedInputElement.value).trim() === "" ||
          !Number.isFinite(Number(changedInputElement.value)))
      ) {
        syncInspector();
        return;
      }
      mutateDocument(imageChangeDraftDocument => {
        const imageComponentInDraft = findComponent(
          imageChangeDraftDocument,
          imageComponentId
        )?.component;
        if (!imageComponentInDraft || imageComponentInDraft.type !== "image") {
          return;
        }
        imageComponentInDraft.properties = {
          ...(imageComponentInDraft.properties || {})
        };
        imageComponentInDraft.position = {
          ...(imageComponentInDraft.position || {})
        };
        imageComponentInDraft.style = {
          ...(imageComponentInDraft.style || {})
        };
        imageComponentInDraft.bindings = {
          ...(imageComponentInDraft.bindings || {})
        };
        imageComponentInDraft.actions = {
          ...(imageComponentInDraft.actions || {})
        };
        imageComponentInDraft.properties.fit = "contain";
        const canvasWidthForImage = Number(imageChangeDraftDocument.canvas.width || 2778);
        const canvasHeightForImage = Number(imageChangeDraftDocument.canvas.height || 1940);
        const imageInputNumber = Number(changedInputElement.value);
        if (changedInputElement === imageLabelTextInputElement) {
          imageComponentInDraft.properties.label = changedInputElement.value.trim();
        } else if (changedInputElement === imageOpacityInputElement) {
          imageComponentInDraft.properties.opacity = clampNumber(imageInputNumber, 0, 100) / 100;
        } else if (changedInputElement === imageLeftInputElement) {
          imageComponentInDraft.position.x =
            (canvasWidthForImage * clampNumber(imageInputNumber, 0, 100)) / 100 -
            Number(imageComponentInDraft.position.width || 100) / 2;
        } else if (changedInputElement === imageTopInputElement) {
          imageComponentInDraft.position.y =
            (canvasHeightForImage * clampNumber(imageInputNumber, 0, 100)) / 100 -
            Number(imageComponentInDraft.position.height || 100) / 2;
        } else if (changedInputElement === imageScaleInputElement) {
          imageComponentInDraft.style.scale = clampNumber(imageInputNumber, 1, 500) / 100;
        } else if (changedInputElement === imageRotationInputElement) {
          setComponentsRotation(
            imageChangeDraftDocument,
            imageComponentId,
            clampNumber(imageInputNumber, -360, 360)
          );
        }
      });
    }
  });
  const floorplanDiagramInputSet = new Set([
    floorplanAutoDiagramLeftInputElement,
    floorplanAutoDiagramTopInputElement,
    floorplanAutoDiagramWidthInputElement,
    floorplanAutoDiagramHeightInputElement,
    floorplanAutoDiagramScaleInputElement,
    floorplanAutoDiagramRotationInputElement
  ]);
  on(floorplanAutoDiagramInspectorFormElement, "input", function onFloorplanAutoDiagramInspectorFormInput(floorplanInputEvent) {
    const inspectedDiagram = selectedComponent();
    const diagramFieldInput = floorplanInputEvent.target;
    if (
      !inspectedDiagram ||
      inspectedDiagram.type !== "floorplan-auto-diagram" ||
      !floorplanDiagramInputSet.has(diagramFieldInput)
    ) {
      return;
    }
    const diagramNumberValue = Number(diagramFieldInput.value);
    if (!Number.isFinite(diagramNumberValue)) {
      return;
    }
    const diagramCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const diagramCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const diagramPositionWidth = Number(inspectedDiagram.position?.width || 100);
    const diagramPositionHeight = Number(inspectedDiagram.position?.height || 100);
    if (diagramFieldInput === floorplanAutoDiagramLeftInputElement) {
      editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
        x:
          (diagramCanvasWidth * clampNumber(diagramNumberValue, 0, 100)) / 100 -
          diagramPositionWidth / 2
      });
    } else if (diagramFieldInput === floorplanAutoDiagramTopInputElement) {
      editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
        y:
          (diagramCanvasHeight * clampNumber(diagramNumberValue, 0, 100)) / 100 -
          diagramPositionHeight / 2
      });
    } else if (diagramFieldInput === floorplanAutoDiagramWidthInputElement) {
      editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
        width: (diagramCanvasWidth * clampNumber(diagramNumberValue, 0.1, 100)) / 100
      });
    } else if (diagramFieldInput === floorplanAutoDiagramHeightInputElement) {
      editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
        height: (diagramCanvasHeight * clampNumber(diagramNumberValue, 0.1, 100)) / 100
      });
    } else if (diagramFieldInput === floorplanAutoDiagramScaleInputElement) {
      editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
        scale: clampNumber(diagramNumberValue, 1, 500) / 100
      });
    } else if (diagramFieldInput === floorplanAutoDiagramRotationInputElement) {
      editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
        rotation: clampNumber(diagramNumberValue, -360, 360)
      });
    }
  });
  on(floorplanAutoDiagramInspectorFormElement, "change", function onFloorplanAutoDiagramInspectorFormChange(floorplanChangeEvent) {
    const changedDiagramInput = floorplanChangeEvent.target;
    const diagramComponentId = selectedComponentId;
    if (
      !!diagramComponentId &&
      !![
        floorplanAutoDiagramLabelTextInputElement,
        floorplanAutoDiagramFolderTextInputElement,
        ...floorplanDiagramInputSet
      ].includes(changedDiagramInput)
    ) {
      if (
        floorplanDiagramInputSet.has(changedDiagramInput) &&
        !Number.isFinite(Number(changedDiagramInput.value))
      ) {
        syncInspector();
        return;
      }
      mutateDocument(diagramDraftDocument => {
        const diagramComponent = findComponent(diagramDraftDocument, diagramComponentId)?.component;
        if (!!diagramComponent && diagramComponent.type === "floorplan-auto-diagram") {
          diagramComponent.properties = {
            ...(diagramComponent.properties || {})
          };
          diagramComponent.position = {
            ...(diagramComponent.position || {})
          };
          diagramComponent.style = {
            ...(diagramComponent.style || {})
          };
          if (changedDiagramInput === floorplanAutoDiagramLabelTextInputElement) {
            diagramComponent.properties.label = changedDiagramInput.value.trim();
          } else if (changedDiagramInput === floorplanAutoDiagramFolderTextInputElement) {
            diagramComponent.properties.exportFolder = changedDiagramInput.value.trim();
          } else {
            const diagramDocumentWidth = Number(diagramDraftDocument.canvas.width || 2778);
            const diagramDocumentHeight = Number(diagramDraftDocument.canvas.height || 1940);
            const diagramFieldValue = Number(changedDiagramInput.value);
            if (changedDiagramInput === floorplanAutoDiagramLeftInputElement) {
              diagramComponent.position.x =
                (diagramDocumentWidth * clampNumber(diagramFieldValue, 0, 100)) / 100 -
                Number(diagramComponent.position.width || 100) / 2;
            } else if (changedDiagramInput === floorplanAutoDiagramTopInputElement) {
              diagramComponent.position.y =
                (diagramDocumentHeight * clampNumber(diagramFieldValue, 0, 100)) / 100 -
                Number(diagramComponent.position.height || 100) / 2;
            } else if (changedDiagramInput === floorplanAutoDiagramWidthInputElement) {
              diagramComponent.position.width =
                (diagramDocumentWidth * clampNumber(diagramFieldValue, 0.1, 100)) / 100;
            } else if (changedDiagramInput === floorplanAutoDiagramHeightInputElement) {
              diagramComponent.position.height =
                (diagramDocumentHeight * clampNumber(diagramFieldValue, 0.1, 100)) / 100;
            } else if (changedDiagramInput === floorplanAutoDiagramScaleInputElement) {
              diagramComponent.style.scale = clampNumber(diagramFieldValue, 1, 500) / 100;
            } else if (changedDiagramInput === floorplanAutoDiagramRotationInputElement) {
              setComponentsRotation(
                diagramDraftDocument,
                diagramComponentId,
                clampNumber(diagramFieldValue, -360, 360)
              );
            }
          }
        }
      });
    }
  });
  on(floorplanAutoDiagramLayoutElement, "click", function onFloorplanAutoDiagramLayoutClick(floorplanLayoutClickEvent) {
    const floorplanLayoutOption = floorplanLayoutClickEvent.target.closest("[data-floorplan-layout]");
    const floorplanComponentId = selectedComponentId;
    if (!!floorplanLayoutOption && !!floorplanComponentId) {
      mutateDocument(floorplanLayoutDraftDocument => {
        const floorplanComponent = findComponent(
          floorplanLayoutDraftDocument,
          floorplanComponentId
        )?.component;
        if (floorplanComponent?.type === "floorplan-auto-diagram") {
          floorplanComponent.properties = {
            ...(floorplanComponent.properties || {}),
            layoutMode: floorplanLayoutOption.dataset.floorplanLayout === "fill" ? "fill" : "free"
          };
        }
      });
    }
  });
}

/**
 * 找到某个户型图组件对应的预览 iframe。iframe 藏在组件 DOM 内部，用 CSS.escape 转义组件 ID 后再拼选择器，
 * 避免 ID 里的特殊字符把选择器写坏。默认参数取当前正在编辑光照的组件。
 */
function findDiagramPreviewFrame(lightingComponentId = baseLightingComponentId) {
  if (lightingComponentId) {
    return document.querySelector(
      '.hb-component[data-component-id="' +
        CSS.escape(lightingComponentId) +
        '"] .hb-floorplan-auto-diagram-preview'
    );
  } else {
    return null;
  }
}

/**
 * 把光照参数写进光照面板的各输入框并返回归一化结果。先归一化再回填，保证面板显示的值与真正下发给 iframe
 * 的一致。整数滑块（step === "5"）显示取整值，其余通道保留两位小数 —— 浮点运算会产生 0.30000000000000004
 * 这类尾数，直接回填会让输入框显示得很脏。
 */
function applyBaseLightingToPanel(baseLighting) {
  const normalizedLighting = normalizeBaseLighting(baseLighting);
  for (const lightInputElement of floorplanBaseLightElements) {
    const lightChannelValue = normalizedLighting[lightInputElement.dataset.floorplanBaseLight];
    lightInputElement.value =
      lightInputElement.step === "5"
        ? String(Math.round(lightChannelValue))
        : String(Number(lightChannelValue.toFixed(2)));
  }
  return normalizedLighting;
}

/**
 * 打开自动图示对话框并记录它正在编辑哪个组件。对话框 DOM 复用，所以组件 ID 与「取消时是否删除该组件」
 * 都暂存在 dataset 上，由 settleAutoDiagramDialog 在收尾时读取。cancelRemovesComponent 用于「刚新建就取消」
 * 的场景，避免留下一个空组件。
 */
function openAutoDiagramDialog(
  dialogComponentId,
  { cancelRemovesComponent: cancelRemovesComponent = false } = {}
) {
  if (dialogComponentId) {
    floorplanAutoDiagramDialogElement.dataset.componentId = dialogComponentId;
    floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent =
      String(cancelRemovesComponent);
    floorplanAutoDiagramGuideElement.hidden = false;
    if (!floorplanAutoDiagramDialogElement.open) {
      floorplanAutoDiagramDialogElement.showModal();
    }
  }
}

/**
 * 平面图面板入口。
 *
 * pageshow 恢复、打开基础照明/工作室、视图切换等平面图侧入口。
 */
function bindFloorplanSection() {
  const on = sections.section("floorplan");
  on(window, "pageshow", function onWindowPageshow(pageshowEvent) {
    if (pageshowEvent.persisted) {
      for (const restoredDiagramPreview of document.querySelectorAll(
        ".hb-floorplan-auto-diagram-preview"
      )) {
        reloadDiagramPreview(restoredDiagramPreview);
      }
    }
  });
  on(floorplanAutoDiagramCameraViewElement, "click", function onFloorplanAutoDiagramCameraViewClick(cameraViewClickEvent) {
    const cameraViewOption = cameraViewClickEvent.target.closest("[data-floorplan-camera-view]");
    const cameraViewComponentId = selectedComponentId;
    if (!cameraViewOption || !cameraViewComponentId) {
      return;
    }
    const requestedCameraView =
      cameraViewOption.dataset.floorplanCameraView === "top" ? "top" : "free";
    mutateDocument(cameraViewDraftDocument => {
      const cameraViewComponent = findComponent(
        cameraViewDraftDocument,
        cameraViewComponentId
      )?.component;
      if (cameraViewComponent?.type === "floorplan-auto-diagram") {
        cameraViewComponent.properties = {
          ...(cameraViewComponent.properties || {}),
          cameraView: requestedCameraView
        };
      }
    });
    postDiagramCameraCommand(cameraViewComponentId, "set-view", requestedCameraView);
  });
  on(floorplanAutoDiagramFloorSelectElement, "change", function onFloorplanAutoDiagramFloorSelectChange() {
    const floorSelectComponentId = selectedComponentId;
    const selectedFloorValue = String(floorplanAutoDiagramFloorSelectElement.value || "");
    const floorSelectComponent = selectedComponent();
    if (
      !!floorSelectComponentId &&
      !!selectedFloorValue &&
      floorSelectComponent?.type === "floorplan-auto-diagram"
    ) {
      mutateDocument(floorSelectDraftDocument => {
        const floorSelectComponentInDraft = findComponent(
          floorSelectDraftDocument,
          floorSelectComponentId
        )?.component;
        if (floorSelectComponentInDraft?.type === "floorplan-auto-diagram") {
          floorSelectComponentInDraft.properties = {
            ...(floorSelectComponentInDraft.properties || {}),
            floorSelection: selectedFloorValue
          };
        }
      });
      postDiagramFloorCommand(floorSelectComponentId, selectedFloorValue);
      postDiagramCameraCommand(floorSelectComponentId, "restore", {
        view: floorSelectComponent.properties?.cameraView || "free",
        mode: floorSelectComponent.properties?.cameraMode || "orthographic",
        topRotation: Number(floorSelectComponent.properties?.cameraTopRotation || 0),
        focalLength: Number(floorSelectComponent.properties?.cameraFocalLength || 50)
      });
    }
  });
  on(floorplanAutoDiagramCameraModeElement, "click", function onFloorplanAutoDiagramCameraModeClick(cameraModeClickEvent) {
    const cameraModeOption = cameraModeClickEvent.target.closest("[data-floorplan-camera-mode]");
    const cameraModeComponentId = selectedComponentId;
    if (!cameraModeOption || !cameraModeComponentId) {
      return;
    }
    const requestedCameraMode =
      cameraModeOption.dataset.floorplanCameraMode === "perspective" ? "perspective" : "orthographic";
    mutateDocument(cameraModeDraftDocument => {
      const cameraModeComponent = findComponent(
        cameraModeDraftDocument,
        cameraModeComponentId
      )?.component;
      if (cameraModeComponent?.type === "floorplan-auto-diagram") {
        cameraModeComponent.properties = {
          ...(cameraModeComponent.properties || {}),
          cameraMode: requestedCameraMode
        };
      }
    });
    postDiagramCameraCommand(cameraModeComponentId, "set-mode", requestedCameraMode);
  });
  on(floorplanAutoDiagramFocalLengthInputElement, "change", function onFloorplanAutoDiagramFocalLengthInputChange() {
    const focalLengthComponentId = selectedComponentId;
    if (
      !focalLengthComponentId ||
      String(floorplanAutoDiagramFocalLengthInputElement.value).trim() === ""
    ) {
      return syncInspector();
    }
    const clampedFocalLength = clampNumber(
      Number(floorplanAutoDiagramFocalLengthInputElement.value),
      18,
      120
    );
    mutateDocument(focalLengthDraftDocument => {
      const focalLengthComponent = findComponent(
        focalLengthDraftDocument,
        focalLengthComponentId
      )?.component;
      if (focalLengthComponent?.type === "floorplan-auto-diagram") {
        focalLengthComponent.properties = {
          ...(focalLengthComponent.properties || {}),
          cameraFocalLength: clampedFocalLength
        };
      }
    });
    postDiagramCameraCommand(focalLengthComponentId, "set-focal-length", clampedFocalLength);
  });
  on(floorplanAutoDiagramRotateTopButtonElement, "click", function onFloorplanAutoDiagramRotateTopButtonClick() {
    const rotateTopComponentId = selectedComponentId;
    if (rotateTopComponentId) {
      mutateDocument(rotateTopDraftDocument => {
        const rotateTopComponent = findComponent(
          rotateTopDraftDocument,
          rotateTopComponentId
        )?.component;
        if (rotateTopComponent?.type === "floorplan-auto-diagram") {
          rotateTopComponent.properties = {
            ...(rotateTopComponent.properties || {}),
            cameraView: "top",
            cameraTopRotation:
              (Number(rotateTopComponent.properties?.cameraTopRotation || 0) + 90) % 360
          };
        }
      });
      postDiagramCameraCommand(rotateTopComponentId, "rotate-top");
    }
  });
  /**
   * 向户型预览 iframe 下发「基础光照」命令。命令共有 request-state / preview / reset / save / cancel 几种；
   * payload 为空时不发送 lighting 字段，让 iframe 侧区分「不改光照只下命令」与「带新光照下发」。
   */
  function postBaseLightingCommand(lightingCommand, lightingPayload = null) {
    const lightingFrame = findDiagramPreviewFrame();
    if (lightingFrame?.contentWindow) {
      lightingFrame.contentWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-base-lighting",
          componentId: baseLightingComponentId,
          command: lightingCommand,
          ...(lightingPayload
            ? {
                lighting: lightingPayload
              }
            : {})
        },
        window.location.origin
      );
      return true;
    } else {
      return false;
    }
  }
  /**
   * 从光照面板的各输入框读出光照参数并归一化。输入框的通道名写在 data-floorplan-base-light 上，靠它组装对象，
   * 因此新增光照通道只要加 DOM 并登记进 floorplanBaseLightElements 即可。
   */
  function readBaseLightingFromPanel() {
    const lightingInputValues = {};
    for (const lightFieldElement of floorplanBaseLightElements) {
      lightingInputValues[lightFieldElement.dataset.floorplanBaseLight] = Number(
        lightFieldElement.value
      );
    }
    return normalizeBaseLighting(lightingInputValues);
  }
  /**
   * 关闭基础光照面板并清空编辑态。cancelPreview 默认为 true：面板关闭意味着放弃未保存的调整，需要通知
   * iframe 还原到保存过的光照，否则预览会停留在临时值上。取消预览时同步下发 cancel 并清掉 baseLightingComponentId
   * 与拖拽状态，防止下次打开串到别的组件上。
   */
  function closeLightingPanel({ cancelPreview: cancelLightingPreview = true } = {}) {
    if (!floorplanAutoLightingPanelElement.hidden) {
      if (cancelLightingPreview) {
        postBaseLightingCommand("cancel");
      }
      floorplanAutoLightingPanelElement.hidden = true;
      floorplanAutoLightingPanelElement.setAttribute("aria-busy", "false");
      baseLightingComponentId = "";
      lightingPanelDragState = null;
    }
  }
  /**
   * 打开基础光照面板并把该户型图切到「浏览」交互模式：必须切到 view，否则用户调光照时拖动鼠标会移动组件而不是旋转视角；
   * 同时把 iframe 的 is-position-mode 换成 is-view-mode，让内部 3D 端同步切换。面板默认靠右对齐，超出视口或太靠边就改为
   * 按 left/top 定位并夹到距边 8px 内（给面板阴影与圆角留量）。打开后先 request-state 拉取当前光照，等 iframe 回包再填充面板。
   */
  function openLightingPanel(lightingHostComponentId) {
    const lightingPreviewFrame = findDiagramPreviewFrame(lightingHostComponentId);
    if (!lightingHostComponentId || !lightingPreviewFrame?.contentWindow) {
      return;
    }
    baseLightingComponentId = lightingHostComponentId;
    lightingPreviewFrame.classList.remove("is-position-mode");
    lightingPreviewFrame.classList.add("is-view-mode");
    mutateDocument(interactionModeDraftDocument => {
      const interactionModeComponent = findComponent(
        interactionModeDraftDocument,
        lightingHostComponentId
      )?.component;
      if (interactionModeComponent?.type === "floorplan-auto-diagram") {
        interactionModeComponent.properties = {
          ...(interactionModeComponent.properties || {}),
          interactionMode: "view"
        };
      }
    });
    applyBaseLightingToPanel(baseLightingSettings);
    floorplanAutoLightingStatusElement.textContent = "正在读取当前光照设置…";
    floorplanAutoLightingPanelElement.hidden = false;
    floorplanAutoLightingPanelElement.setAttribute("aria-busy", "true");
    const lightingPanelRect = floorplanAutoLightingPanelElement.getBoundingClientRect();
    if (
      lightingPanelRect.right > window.innerWidth - 8 ||
      lightingPanelRect.bottom > window.innerHeight - 8 ||
      lightingPanelRect.left < 8 ||
      lightingPanelRect.top < 8
    ) {
      floorplanAutoLightingPanelElement.style.right = "auto";
      floorplanAutoLightingPanelElement.style.left =
        clampNumber(
          lightingPanelRect.left,
          8,
          Math.max(8, window.innerWidth - lightingPanelRect.width - 8)
        ) + "px";
      floorplanAutoLightingPanelElement.style.top =
        clampNumber(
          lightingPanelRect.top,
          8,
          Math.max(8, window.innerHeight - lightingPanelRect.height - 8)
        ) + "px";
    }
    postBaseLightingCommand("request-state");
  }
  on(floorplanAutoDiagramOpenBaseLightingButtonElement, "click", function onFloorplanAutoDiagramOpenBaseLightingButtonClick() {
    openLightingPanel(selectedComponentId);
  });
  for (const lightInputNode of floorplanBaseLightElements) {
    on(lightInputNode, "input", function onLightInputNodeInput() {
      if (!floorplanAutoLightingPanelElement.hidden) {
        floorplanAutoLightingStatusElement.textContent = "修改已实时预览，保存后同步到全部3D入口。";
        postBaseLightingCommand("preview", readBaseLightingFromPanel());
      }
    });
  }
  on(floorplanAutoLightingResetButtonElement, "click", function onFloorplanAutoLightingResetButtonClick() {
    applyBaseLightingToPanel(DEFAULT_BASE_LIGHTING);
    floorplanAutoLightingStatusElement.textContent = "已预览默认光照，点击保存后生效。";
    postBaseLightingCommand("reset");
  });
  on(floorplanAutoLightingSaveButtonElement, "click", function onFloorplanAutoLightingSaveButtonClick() {
    floorplanAutoLightingStatusElement.textContent = "正在保存并同步…";
    floorplanAutoLightingPanelElement.setAttribute("aria-busy", "true");
    postBaseLightingCommand("save", readBaseLightingFromPanel());
  });
  on(floorplanAutoLightingCloseButtonElement, "click", function onFloorplanAutoLightingCloseButtonClick() { return closeLightingPanel(); });
  on(floorplanAutoLightingHandleElement, "pointerdown", function onFloorplanAutoLightingHandlePointerdown(lightingDragEvent) {
    if (lightingDragEvent.button !== 0 || lightingDragEvent.target.closest("button")) {
      return;
    }
    const lightingPanelBounds = floorplanAutoLightingPanelElement.getBoundingClientRect();
    lightingPanelDragState = {
      pointerId: lightingDragEvent.pointerId,
      startX: lightingDragEvent.clientX,
      startY: lightingDragEvent.clientY,
      startLeft: lightingPanelBounds.left,
      startTop: lightingPanelBounds.top
    };
    capturePointer(floorplanAutoLightingHandleElement, lightingDragEvent.pointerId);
  });
  on(floorplanAutoLightingHandleElement, "pointermove", function onFloorplanAutoLightingHandlePointermove(lightingDragMoveEvent) {
    if (
      !lightingPanelDragState ||
      lightingDragMoveEvent.pointerId !== lightingPanelDragState.pointerId
    ) {
      return;
    }
    lightingDragMoveEvent.preventDefault();
    const movedPanelBounds = floorplanAutoLightingPanelElement.getBoundingClientRect();
    const maxPanelLeft = Math.max(8, window.innerWidth - movedPanelBounds.width - 8);
    const maxPanelTop = Math.max(8, window.innerHeight - movedPanelBounds.height - 8);
    floorplanAutoLightingPanelElement.style.right = "auto";
    floorplanAutoLightingPanelElement.style.left =
      clampNumber(
        lightingPanelDragState.startLeft +
          lightingDragMoveEvent.clientX -
          lightingPanelDragState.startX,
        8,
        maxPanelLeft
      ) + "px";
    floorplanAutoLightingPanelElement.style.top =
      clampNumber(
        lightingPanelDragState.startTop +
          lightingDragMoveEvent.clientY -
          lightingPanelDragState.startY,
        8,
        maxPanelTop
      ) + "px";
  });
  /**
   * 结束光照面板拖拽，清空拖拽状态。同时挂到 pointerup 与 pointercancel 上：指针被系统夺走（如触控被取消）
   * 时也要复位，否则状态残留会让下次 pointermove 用旧的起点继续拖动。
   */
  const endLightingPanelDrag = dragEndEvent => {
    if (!!lightingPanelDragState && dragEndEvent.pointerId === lightingPanelDragState.pointerId) {
      lightingPanelDragState = null;
    }
  };
  on(floorplanAutoLightingHandleElement, "pointerup", endLightingPanelDrag);
  on(floorplanAutoLightingHandleElement, "pointercancel", endLightingPanelDrag);
  /**
   * 关闭自动图示对话框并清掉挂在 dataset 上的临时状态。componentId 与 cancelRemovesComponent 用 dataset
   * 传递，是因为对话框 DOM 是复用的，必须在关闭时清空，否则下次打开会误用上一次的组件 ID。
   */
  function closeAutoDiagramDialog() {
    if (floorplanAutoDiagramDialogElement.open) {
      floorplanAutoDiagramDialogElement.close();
    }
    floorplanAutoDiagramDialogElement.dataset.componentId = "";
    floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent = "false";
    floorplanAutoDiagramGuideElement.hidden = false;
  }
  /**
   * 收尾自动图示对话框：按需删除「新建后又被取消」的组件。先读出 dataset 再 closeAutoDiagramDialog
   * （它会把 dataset 清空），顺序不能反。删除时同步修正选中集与锚点，避免选中态指向已不存在的组件；
   * 最后走 mutateDocument 落盘，保证这次删除进入历史记录、可以撤销。
   */
  function settleAutoDiagramDialog() {
    const pendingDialogComponentId = floorplanAutoDiagramDialogElement.dataset.componentId;
    const shouldRemoveOnCancel =
      floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent === "true";
    closeAutoDiagramDialog();
    if (!!shouldRemoveOnCancel && !!pendingDialogComponentId) {
      selectedComponentIds.delete(pendingDialogComponentId);
      if (selectedComponentId === pendingDialogComponentId) {
        selectedComponentId = selectedComponentIds.values().next().value || null;
      }
      if (selectionAnchorComponentId === pendingDialogComponentId) {
        selectionAnchorComponentId = selectedComponentId;
      }
      mutateDocument(cancelRemoveDraftDocument => {
        removeComponent(cancelRemoveDraftDocument, pendingDialogComponentId);
      });
    }
  }
  on(floorplanAutoDiagramOpenStudioButtonElement, "click", function onFloorplanAutoDiagramOpenStudioButtonClick() {
    const diagramStudioComponent = selectedComponent();
    if (diagramStudioComponent?.type !== "floorplan-auto-diagram") {
      return;
    }
    if (
      diagramStudioComponent.properties?.generated === true &&
      diagramStudioComponent.properties?.previewing !== true
    ) {
      mutateDocument(previewingDraftDocument => {
        const previewingComponent = findComponent(
          previewingDraftDocument,
          diagramStudioComponent.id
        )?.component;
        if (previewingComponent?.type === "floorplan-auto-diagram") {
          previewingComponent.properties = {
            ...(previewingComponent.properties || {}),
            previewReady: true,
            previewing: true,
            interactionMode: "position"
          };
        }
      });
      return;
    }
    const studioDialogFrame = document.querySelector(
      '.hb-component[data-component-id="' +
        CSS.escape(diagramStudioComponent.id) +
        '"] .hb-floorplan-auto-diagram-preview'
    );
    if (!studioDialogFrame?.contentWindow) {
      openAutoDiagramDialog(diagramStudioComponent.id);
      return;
    }
    const exportFolderName = String(diagramStudioComponent.properties?.exportFolder || "").trim();
    if (
      !exportFolderName ||
      /[<>:"/\\|?*\x00-\x1f\x7f]/.test(exportFolderName) ||
      exportFolderName.startsWith(".") ||
      /[. ]$/.test(exportFolderName)
    ) {
      floorplanAutoDiagramStatusElement.textContent = "请先填写有效的导图文件夹名称。";
      floorplanAutoDiagramFolderTextInputElement.focus();
      return;
    }
    const sourceComponentPosition = diagramStudioComponent.position || {};
    const projectCanvas = activeProject.document.canvas || {};
    // 保留控件宽高比、面积对齐画布：底图与预览同比例才不会产生位置偏移。
    const exportResolution = floorplanAutoDiagramExportResolution(sourceComponentPosition, projectCanvas);
    floorplanAutoDiagramStatusElement.textContent = "正在后台生成底图和灯组效果，请稍候…";
    floorplanAutoDiagramOpenStudioButtonElement.disabled = true;
    floorplanAutoDiagramFloorSelectElement.disabled = true;
    floorplanAutoDiagramOpenStudioButtonElement.textContent = "正在后台生成…";
    studioDialogFrame.contentWindow.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-generate",
        componentId: diagramStudioComponent.id,
        width: exportResolution.width,
        height: exportResolution.height,
        folderName: exportFolderName
      },
      window.location.origin
    );
  });
  on(floorplanAutoDiagramViewToggleButtonElement, "click", function onFloorplanAutoDiagramViewToggleButtonClick() {
    const interactionModeComponentId = selectedComponentId;
    if (interactionModeComponentId) {
      mutateDocument(toggleModeDraftDocument => {
        const toggleModeComponent = findComponent(
          toggleModeDraftDocument,
          interactionModeComponentId
        )?.component;
        if (toggleModeComponent?.type === "floorplan-auto-diagram") {
          toggleModeComponent.properties = {
            ...(toggleModeComponent.properties || {}),
            interactionMode:
              toggleModeComponent.properties?.interactionMode === "view" ? "position" : "view"
          };
        }
      });
    }
  });
  on(floorplanAutoDiagramCloseButtonElement, "click", settleAutoDiagramDialog);
  on(floorplanAutoDiagramLaterButtonElement, "click", settleAutoDiagramDialog);
  on(floorplanAutoDiagramDialogElement, "cancel", function onFloorplanAutoDiagramDialogCancel(dialogCancelEvent) {
    dialogCancelEvent.preventDefault();
    settleAutoDiagramDialog();
  });
  on(floorplanAutoDiagramContinueButtonElement, "click", function onFloorplanAutoDiagramContinueButtonClick() {
    const continuedComponentId = floorplanAutoDiagramDialogElement.dataset.componentId;
    if (continuedComponentId) {
      mutateDocument(continueDraftDocument => {
        const continueComponent = findComponent(
          continueDraftDocument,
          continuedComponentId
        )?.component;
        if (continueComponent?.type === "floorplan-auto-diagram") {
          continueComponent.properties = {
            ...(continueComponent.properties || {}),
            previewReady: true,
            previewing: true,
            interactionMode: "position"
          };
        }
      });
      closeAutoDiagramDialog();
    }
  });
  on(floorplanAutoDiagramBindingListElement, "change", function onFloorplanAutoDiagramBindingListChange(lightGroupChangeEvent) {
    const lightGroupSelect = lightGroupChangeEvent.target.closest("[data-floorplan-light-group-id]");
    const lightGroupComponentId = selectedComponentId;
    if (!lightGroupSelect || !lightGroupComponentId) {
      return;
    }
    const lightGroupId = lightGroupSelect.dataset.floorplanLightGroupId;
    mutateDocument(lightGroupDraftDocument => {
      const lightGroupComponent = findComponent(
        lightGroupDraftDocument,
        lightGroupComponentId
      )?.component;
      if (!lightGroupComponent || lightGroupComponent.type !== "floorplan-auto-diagram") {
        return;
      }
      lightGroupComponent.bindings = {
        ...(lightGroupComponent.bindings || {})
      };
      const lightGroupBindingKey = "lightGroup:" + lightGroupId;
      if (lightGroupSelect.value) {
        lightGroupComponent.bindings[lightGroupBindingKey] = {
          entityId: lightGroupSelect.value
        };
      } else {
        delete lightGroupComponent.bindings[lightGroupBindingKey];
      }
    });
  });
}

/**
 * 宿主消息处理。
 *
 * window message 一个 670 行的分支处理：宿主下发的场景/状态/偏好都从这里进。
 */
function bindMessageSection() {
  const on = sections.section("message");
  on(window, "message", function onWindowMessage(messageEvent) {
    if (messageEvent.origin !== window.location.origin) {
      return;
    }
    const messageData = messageEvent.data;
    if (messageData?.type === "homeos-floorplan-auto-diagram-base-lighting-state") {
      const lightingStateComponentId = String(messageData.componentId || "");
      const lightingStateFrame = findDiagramPreviewFrame(lightingStateComponentId);
      if (
        !lightingStateFrame ||
        messageEvent.source !== lightingStateFrame.contentWindow ||
        lightingStateComponentId !== baseLightingComponentId
      ) {
        return;
      }
      if (messageData.status === "ready" || messageData.status === "saved") {
        baseLightingSettings = normalizeBaseLighting(
          messageData.savedLighting || messageData.lighting
        );
        applyBaseLightingToPanel(messageData.lighting || baseLightingSettings);
      }
      floorplanAutoLightingPanelElement.setAttribute("aria-busy", "false");
      if (messageData.status === "saved") {
        floorplanAutoLightingStatusElement.textContent =
          "已保存，并同步到实时预览、手动导图和自动导图。";
      } else if (messageData.status === "ready") {
        floorplanAutoLightingStatusElement.textContent = "修改会实时同步到当前3D预览。";
      }
      return;
    }
    if (messageData?.type === "homeos-floorplan-auto-diagram-ready") {
      const readyComponentId = String(messageData.componentId || "");
      const readyFrame = document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(readyComponentId) +
          '"] .hb-floorplan-auto-diagram-preview'
      );
      if (!readyFrame || messageEvent.source !== readyFrame.contentWindow) {
        return;
      }
      readyFrame.classList.add("is-ready");
      readyFrame.parentElement?.querySelector(".hb-floorplan-auto-diagram-loading")?.remove();
      const readyComponent = findComponent(activeProject?.document, readyComponentId)?.component;
      if (readyComponent?.type === "floorplan-auto-diagram") {
        const reportedFloors = (Array.isArray(messageData.floors) ? messageData.floors : [])
          .map(floorEntry => ({
            id: String(floorEntry?.id || ""),
            name: String(floorEntry?.name || "")
          }))
          .filter(validFloor => validFloor.id);
        const reportedFloorSelection = String(messageData.floorSelection || "");
        floorplanAutoDiagramStateByComponentId.set(readyComponentId, {
          floors: reportedFloors,
          selected: reportedFloorSelection
        });
        const readyProperties = readyComponent.properties || {};
        if (
          Object.prototype.hasOwnProperty.call(readyProperties, "floorSelection") &&
          reportedFloorSelection &&
          readyProperties.floorSelection !== reportedFloorSelection
        ) {
          mutateDocument(floorSyncDraftDocument => {
            const floorSyncComponent = findComponent(
              floorSyncDraftDocument,
              readyComponentId
            )?.component;
            if (floorSyncComponent?.type === "floorplan-auto-diagram") {
              floorSyncComponent.properties = {
                ...(floorSyncComponent.properties || {}),
                floorSelection: reportedFloorSelection
              };
            }
          });
        }
        syncInspector();
        readyFrame.contentWindow.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-camera",
            componentId: readyComponentId,
            command: "restore",
            value: {
              view: readyComponent.properties?.cameraView || "free",
              mode: readyComponent.properties?.cameraMode || "orthographic",
              topRotation: Number(readyComponent.properties?.cameraTopRotation || 0),
              focalLength: Number(readyComponent.properties?.cameraFocalLength || 50)
            }
          },
          window.location.origin
        );
      }
      return;
    }
    if (messageData?.type === "homeos-floorplan-auto-diagram-floor-state") {
      const floorStateComponentId = String(messageData.componentId || "");
      const floorStateFrame = document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(floorStateComponentId) +
          '"] .hb-floorplan-auto-diagram-preview'
      );
      if (!floorStateFrame || messageEvent.source !== floorStateFrame.contentWindow) {
        return;
      }
      const floorStateFloors = (Array.isArray(messageData.floors) ? messageData.floors : [])
        .map(floorStateEntry => ({
          id: String(floorStateEntry?.id || ""),
          name: String(floorStateEntry?.name || "")
        }))
        .filter(validFloorState => validFloorState.id);
      const floorStateSelection = String(messageData.floorSelection || "");
      floorplanAutoDiagramStateByComponentId.set(floorStateComponentId, {
        floors: floorStateFloors,
        selected: floorStateSelection
      });
      const floorStateComponent = findComponent(
        activeProject?.document,
        floorStateComponentId
      )?.component;
      if (
        floorStateComponent?.type === "floorplan-auto-diagram" &&
        floorStateSelection &&
        floorStateComponent.properties?.floorSelection !== floorStateSelection
      ) {
        mutateDocument(floorStateDraftDocument => {
          const floorStateComponentInDraft = findComponent(
            floorStateDraftDocument,
            floorStateComponentId
          )?.component;
          if (floorStateComponentInDraft?.type === "floorplan-auto-diagram") {
            floorStateComponentInDraft.properties = {
              ...(floorStateComponentInDraft.properties || {}),
              floorSelection: floorStateSelection
            };
          }
        });
      }
      if (floorStateComponentId === selectedComponentId) {
        syncInspector();
      }
      return;
    }
    if (messageData?.type === "homeos-floorplan-auto-diagram-stopped") {
      const stoppedComponentId = String(messageData.componentId || "");
      const stoppedFrame = document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(stoppedComponentId) +
          '"] .hb-floorplan-auto-diagram-preview'
      );
      if (!stoppedFrame || messageEvent.source !== stoppedFrame.contentWindow) {
        return;
      }
      floorplanAutoDiagramOpenStudioButtonElement.disabled = false;
      if (stoppedComponentId === selectedComponentId) {
        floorplanAutoDiagramFloorSelectElement.disabled = false;
      }
      floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成";
      floorplanAutoDiagramStatusElement.textContent = messageData.message || "已停止本次生成。";
      if (messageData.reason === "rename") {
        floorplanAutoDiagramFolderTextInputElement.focus();
      }
      return;
    }
    if (messageData?.type === "homeos-floorplan-auto-diagram-error") {
      const errorComponentId = String(messageData.componentId || "");
      const errorFrame = document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(errorComponentId) +
          '"] .hb-floorplan-auto-diagram-preview'
      );
      if (!errorFrame || messageEvent.source !== errorFrame.contentWindow) {
        return;
      }
      floorplanAutoDiagramOpenStudioButtonElement.disabled = false;
      if (errorComponentId === selectedComponentId) {
        floorplanAutoDiagramFloorSelectElement.disabled = false;
      }
      floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成";
      floorplanAutoDiagramStatusElement.textContent = messageData.message || "后台生成失败，请重试。";
      return;
    }
    if (!messageData || messageData.type !== "homeos-floorplan-auto-diagram-export") {
      return;
    }
    const exportComponentId = String(messageData.componentId || "");
    const exportFrame = document.querySelector(
      '.hb-component[data-component-id="' +
        CSS.escape(exportComponentId) +
        '"] .hb-floorplan-auto-diagram-preview'
    );
    if (!exportFrame || messageEvent.source !== exportFrame.contentWindow) {
      return;
    }
    const exportManifest = messageData.manifest;
    const exportFolderId = String(messageData.folderName || exportManifest?.exportName || "").trim();
    if (!exportComponentId || !exportManifest || !exportFolderId) {
      return;
    }
    floorplanAutoDiagramOpenStudioButtonElement.disabled = false;
    floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成";
    floorplanAutoDiagramStatusElement.textContent = "已生成，正在置换到仪表盘…";
    const exportComponentElement = exportFrame.closest(".hb-component");
    if (exportComponentElement) {
      exportComponentElement.hidden = true;
    }
    // 置换失败时把预览图元放回来：底图其实已经生成好了，继续用 hidden 遮着它，
    // 用户看到的就只是「图元消失了」而不是「哪一步失败了」。
    const restoreAutoDiagramPreview = () => {
      exportComponentElement?.isConnected && (exportComponentElement.hidden = false);
    };
    mutateDocument(exportDraftDocument => {
      let componentLocation = findComponentLocation(exportDraftDocument, exportComponentId);
      const diagramSourceComponent = componentLocation?.component;
      if (
        !diagramSourceComponent ||
        diagramSourceComponent.type !== "floorplan-auto-diagram" ||
        !componentLocation.page
      ) {
        return null;
      }
      const diagramPage = componentLocation.page;
      const autoDiagramComponents = [];
      /**
       * 递归收集属于本次自动图示导出文件夹的所有组件：用 autoDiagramFolder 标记归属（等于导出文件夹 ID），
       * 因为同一页面里可能同时存在多组自动图示，只能靠标记区分；沿 children 递归保证嵌套布局里的图元也被回收替换。
       */
      const collectAutoDiagramComponents = componentBranch => {
        for (const branchComponent of componentBranch || []) {
          if (branchComponent?.properties?.autoDiagramFolder === exportFolderId) {
            autoDiagramComponents.push(branchComponent);
          }
          collectAutoDiagramComponents(branchComponent?.children);
        }
      };
      collectAutoDiagramComponents(diagramPage.components);
      const baseImagesByRole = new Map(
        autoDiagramComponents
          .filter(imageCandidate => imageCandidate.type === "image")
          .map(imageComponentEntry => [
            imageComponentEntry.properties?.autoDiagramRole === "base"
              ? "background-with-plan"
              : String(imageComponentEntry.properties?.autoDiagramRole || ""),
            imageComponentEntry
          ])
      );
      const lightEffectsByKey = new Map(
        autoDiagramComponents
          .filter(effectCandidate => effectCandidate.type === "icon-button-effect")
          .map(lightEffectComponent => {
            const effectRoleKey = String(
              lightEffectComponent.properties?.autoDiagramRole || "light-group"
            );
            const effectLayerId = String(
              lightEffectComponent.properties?.autoDiagramLayerId ||
                lightEffectComponent.properties?.autoDiagramGroupId ||
                ""
            );
            return [effectRoleKey + ":" + effectLayerId, lightEffectComponent];
          })
      );
      for (const staleComponent of autoDiagramComponents) {
        removeComponent(exportDraftDocument, staleComponent.id);
      }
      componentLocation = findComponentLocation(exportDraftDocument, exportComponentId);
      if (!componentLocation) {
        return null;
      }
      const documentWidthPx = Number(exportDraftDocument.canvas?.width || 2778);
      const documentHeightPx = Number(exportDraftDocument.canvas?.height || 1940);
      const resolutionWidth = Math.max(
        1,
        Number(exportManifest.resolution?.width || diagramSourceComponent.position?.width || 1)
      );
      const resolutionHeight = Math.max(
        1,
        Number(exportManifest.resolution?.height || diagramSourceComponent.position?.height || 1)
      );
      const sourceLayoutMode =
        diagramSourceComponent.properties?.layoutMode === "fill" ? "fill" : "free";
      const diagramPositionValue = diagramSourceComponent.position || {};
      const diagramScale =
        sourceLayoutMode === "fill"
          ? 1
          : Math.max(0.01, Math.min(5, Number(diagramSourceComponent.style?.scale || 1)));
      const sourceWidth =
        sourceLayoutMode === "fill" ? documentWidthPx : Number(diagramPositionValue.width || 100);
      const sourceHeight =
        sourceLayoutMode === "fill" ? documentHeightPx : Number(diagramPositionValue.height || 100);
      const scaledWidth = sourceWidth * diagramScale;
      const scaledHeight = sourceHeight * diagramScale;
      const diagramX =
        sourceLayoutMode === "fill"
          ? 0
          : Number(diagramPositionValue.x || 0) - (scaledWidth - sourceWidth) / 2;
      const diagramY =
        sourceLayoutMode === "fill"
          ? 0
          : Number(diagramPositionValue.y || 0) - (scaledHeight - sourceHeight) / 2;
      const diagramRotation =
        sourceLayoutMode === "fill" ? 0 : Number(diagramPositionValue.rotation || 0);
      const imageLayerComponents = [
        {
          role: "background",
          file: exportManifest.backgroundImage,
          label: "00底图",
          visible: true
        },
        {
          role: "floor-plan",
          file: exportManifest.floorPlanImage,
          label: "00户型图",
          visible: true
        },
        {
          role: "background-with-plan",
          file: exportManifest.baseImage,
          label: "00底图带户型",
          visible: false
        }
      ]
        .filter(imageSpec => imageSpec.file)
        .map(layerSpec => {
          const existingLayerComponent = baseImagesByRole.get(layerSpec.role);
          const layerComponent = existingLayerComponent
            ? clone(existingLayerComponent)
            : createComponentFromTemplate("image", {
                id: newId("component"),
                instanceName: layerSpec.label,
                canvas: exportDraftDocument.canvas
              });
          layerComponent.position = {
            ...(layerComponent.position || {}),
            x: diagramX,
            y: diagramY,
            width: scaledWidth,
            height: scaledHeight,
            rotation: diagramRotation
          };
          layerComponent.style = {
            ...(layerComponent.style || {}),
            scale: 1,
            visible: existingLayerComponent
              ? existingLayerComponent.style?.visible !== false
              : layerSpec.visible
          };
          layerComponent.bindings = {};
          layerComponent.actions = {};
          layerComponent.properties = {
            ...(layerComponent.properties || {}),
            instanceName: layerSpec.label,
            label: layerSpec.label,
            assetId: "studio3d:" + exportFolderId + "/" + layerSpec.file,
            naturalWidth: resolutionWidth,
            naturalHeight: resolutionHeight,
            opacity: 1,
            fit: "contain",
            layoutMode: sourceLayoutMode,
            autoDiagramFolder: exportFolderId,
            autoDiagramRole: layerSpec.role,
            autoDiagramCamera: exportManifest.camera || null
          };
          return layerComponent;
        });
      const backgroundLayer = imageLayerComponents.find(
        backgroundCandidate => backgroundCandidate.properties?.autoDiagramRole === "background"
      );
      const floorPlanLayer = imageLayerComponents.find(
        floorPlanCandidate => floorPlanCandidate.properties?.autoDiagramRole === "floor-plan"
      );
      const baseWithPlanLayer = imageLayerComponents.find(
        baseWithPlanCandidate =>
          baseWithPlanCandidate.properties?.autoDiagramRole === "background-with-plan"
      );
      const preferredBaseLayer = baseWithPlanLayer || floorPlanLayer || backgroundLayer;
      const lightGroupSpecs = (Array.isArray(exportManifest.groups) ? exportManifest.groups : [])
        .filter(groupEntry => String(groupEntry?.id || groupEntry?.groupId || "") && groupEntry?.file)
        .map(groupSpec => ({
          role: "light-group",
          id: String(groupSpec.id || groupSpec.groupId || ""),
          name: String(groupSpec.name || groupSpec.note || "灯组"),
          note: String(groupSpec.note || groupSpec.name || "灯组"),
          file: groupSpec.file,
          icon: "mdi:lightbulb-outline",
          anchor: groupSpec.anchor
        }));
      const screenSpecs = (Array.isArray(exportManifest.screens) ? exportManifest.screens : [])
        .filter(
          screenEntry => String(screenEntry?.id || screenEntry?.itemId || "") && screenEntry?.file
        )
        .map(screenSpec => ({
          role: "television",
          id: String(screenSpec.id || screenSpec.itemId || ""),
          name: String(screenSpec.name || "电视画面"),
          note: String(screenSpec.name || "电视画面"),
          file: screenSpec.file,
          icon: "mdi:television",
          anchor: screenSpec.anchor
        }));
      const vehicleSpecs = (Array.isArray(exportManifest.vehicles) ? exportManifest.vehicles : [])
        .filter(
          vehicleEntry => String(vehicleEntry?.id || vehicleEntry?.itemId || "") && vehicleEntry?.file
        )
        .map(vehicleSpec => ({
          role: "vehicle",
          id: String(vehicleSpec.id || vehicleSpec.itemId || ""),
          name: String(vehicleSpec.name || "汽车充电"),
          note: String(vehicleSpec.name || "汽车充电"),
          file: vehicleSpec.file,
          icon: "mdi:car-electric",
          anchor: vehicleSpec.anchor
        }));
      const overlaySpecs = [...screenSpecs, ...vehicleSpecs, ...lightGroupSpecs];
      const diagramCenterX = diagramX + scaledWidth / 2;
      const diagramCenterY = diagramY + scaledHeight / 2;
      const diagramRotationRad = (diagramRotation * Math.PI) / 180;
      const overlayScale = Math.min(scaledWidth / resolutionWidth, scaledHeight / resolutionHeight);
      const overlaySourceWidth = resolutionWidth * overlayScale;
      const overlaySourceHeight = resolutionHeight * overlayScale;
      const placedOverlayAnchors = [];
      /**
       * 为自动生成的图元挑选互不重叠的归一化锚点（0~1）：优先用图元自带 anchor；缺失时按序号均分横向位置、纵向固定
       * 在 0.9（画面底部），避免多个新图元叠在正中。以「图元在底图上的相对尺寸 × 1.08」作为锚点最小间距并设下限
       * 0.035/0.045 —— 底图很小时相对尺寸会退化成 0，没有下限会让所有候选点重合；候选点按同心环由内向外枚举取第一个足够远的点。
       */
      const placeOverlayAnchor = (overlaySpecItem, overlayIndex, overlayWidthPx, overlayHeightPx) => {
        const anchorX = Number(overlaySpecItem.anchor?.x);
        const anchorY = Number(overlaySpecItem.anchor?.y);
        const defaultAnchor = {
          x: overlaySpecs.length > 1 ? (overlayIndex + 1) / (overlaySpecs.length + 1) : 0.5,
          y: 0.9
        };
        const preferredAnchor =
          Number.isFinite(anchorX) && Number.isFinite(anchorY)
            ? {
                x: anchorX,
                y: anchorY
              }
            : defaultAnchor;
        const anchorSpacingX = Math.max(
          0.035,
          (overlayWidthPx / Math.max(overlaySourceWidth, 1)) * 1.08
        );
        const anchorSpacingY = Math.max(
          0.045,
          (overlayHeightPx / Math.max(overlaySourceHeight, 1)) * 1.08
        );
        const anchorCandidates = [[0, 0]];
        for (let ringIndex = 1; ringIndex <= 4; ringIndex += 1) {
          anchorCandidates.push(
            [0, -anchorSpacingY * ringIndex],
            [anchorSpacingX * ringIndex, 0],
            [0, anchorSpacingY * ringIndex],
            [-anchorSpacingX * ringIndex, 0],
            [anchorSpacingX * ringIndex, -anchorSpacingY * ringIndex],
            [anchorSpacingX * ringIndex, anchorSpacingY * ringIndex],
            [-anchorSpacingX * ringIndex, anchorSpacingY * ringIndex],
            [-anchorSpacingX * ringIndex, -anchorSpacingY * ringIndex]
          );
        }
        let chosenAnchor = null;
        for (const [offsetX, offsetY] of anchorCandidates) {
          const candidateAnchor = {
            x: clampNumber(preferredAnchor.x + offsetX, anchorSpacingX / 2, 1 - anchorSpacingX / 2),
            y: clampNumber(preferredAnchor.y + offsetY, anchorSpacingY / 2, 1 - anchorSpacingY / 2)
          };
          if (
            !placedOverlayAnchors.some(
              placedAnchor =>
                Math.abs(candidateAnchor.x - placedAnchor.x) <
                  (anchorSpacingX + placedAnchor.spacingX) / 2 &&
                Math.abs(candidateAnchor.y - placedAnchor.y) <
                  (anchorSpacingY + placedAnchor.spacingY) / 2
            )
          ) {
            chosenAnchor = candidateAnchor;
            break;
          }
        }
        chosenAnchor ||= {
          x: clampNumber(defaultAnchor.x, anchorSpacingX / 2, 1 - anchorSpacingX / 2),
          y: clampNumber(defaultAnchor.y, anchorSpacingY / 2, 1 - anchorSpacingY / 2)
        };
        placedOverlayAnchors.push({
          ...chosenAnchor,
          spacingX: anchorSpacingX,
          spacingY: anchorSpacingY
        });
        return chosenAnchor;
      };
      const placedEffectComponents = overlaySpecs.map((overlaySpec, overlaySpecIndex) => {
        const existingEffectComponent = lightEffectsByKey.get(
          overlaySpec.role + ":" + overlaySpec.id
        );
        const effectComponentToPlace = existingEffectComponent
          ? clone(existingEffectComponent)
          : createComponentFromTemplate("icon-button-effect", {
              id: newId("component"),
              instanceName: overlaySpec.name,
              canvas: exportDraftDocument.canvas
            });
        const savedSceneAnchor = existingEffectComponent?.properties?.autoDiagramSceneAnchor;
        const sceneAnchorChanged =
          !savedSceneAnchor ||
          Math.abs(Number(savedSceneAnchor.x) - Number(overlaySpec.anchor?.x)) > 0.002 ||
          Math.abs(Number(savedSceneAnchor.y) - Number(overlaySpec.anchor?.y)) > 0.002;
        const layoutVersionStale =
          !!existingEffectComponent &&
          Number(existingEffectComponent.properties?.autoDiagramLayoutVersion || 0) <
            AUTO_DIAGRAM_LAYOUT_VERSION;
        const needsLayoutRefresh =
          !existingEffectComponent ||
          layoutVersionStale ||
          (overlaySpec.role === "light-group" && sceneAnchorChanged);
        let buttonAnchor = existingEffectComponent?.properties?.autoDiagramButtonAnchor || null;
        if (needsLayoutRefresh) {
          const placedEffectWidth = Number(
            effectComponentToPlace.position?.width || documentWidthPx * 0.075
          );
          const placedEffectHeight = Number(
            effectComponentToPlace.position?.height || placedEffectWidth
          );
          const effectScale = Math.max(
            0.01,
            Math.min(5, Number(effectComponentToPlace.style?.scale || 1))
          );
          buttonAnchor = placeOverlayAnchor(
            overlaySpec,
            overlaySpecIndex,
            placedEffectWidth * effectScale,
            placedEffectHeight * effectScale
          );
          const sourceAnchorX = -overlaySourceWidth / 2 + buttonAnchor.x * overlaySourceWidth;
          const sourceAnchorY = -overlaySourceHeight / 2 + buttonAnchor.y * overlaySourceHeight;
          const rotatedAnchorX =
            sourceAnchorX * Math.cos(diagramRotationRad) -
            sourceAnchorY * Math.sin(diagramRotationRad);
          const rotatedAnchorY =
            sourceAnchorX * Math.sin(diagramRotationRad) +
            sourceAnchorY * Math.cos(diagramRotationRad);
          effectComponentToPlace.position = {
            ...(effectComponentToPlace.position || {}),
            x: diagramCenterX + rotatedAnchorX - placedEffectWidth / 2,
            y: diagramCenterY + rotatedAnchorY - placedEffectHeight / 2,
            rotation: diagramRotation
          };
        } else if (
          Number.isFinite(Number(buttonAnchor?.x)) &&
          Number.isFinite(Number(buttonAnchor?.y))
        ) {
          const existingEffectWidth = Number(
            effectComponentToPlace.position?.width || documentWidthPx * 0.075
          );
          const existingEffectHeight = Number(
            effectComponentToPlace.position?.height || existingEffectWidth
          );
          const existingEffectScale = Math.max(
            0.01,
            Math.min(5, Number(effectComponentToPlace.style?.scale || 1))
          );
          placedOverlayAnchors.push({
            x: Number(buttonAnchor.x),
            y: Number(buttonAnchor.y),
            spacingX: Math.max(
              0.035,
              ((existingEffectWidth * existingEffectScale) / Math.max(overlaySourceWidth, 1)) * 1.08
            ),
            spacingY: Math.max(
              0.045,
              ((existingEffectHeight * existingEffectScale) / Math.max(overlaySourceHeight, 1)) * 1.08
            )
          });
        }
        effectComponentToPlace.style = {
          ...(effectComponentToPlace.style || {}),
          visible: true
        };
        effectComponentToPlace.bindings = {
          ...(effectComponentToPlace.bindings || {})
        };
        if (!existingEffectComponent && overlaySpec.role === "light-group") {
          const lightGroupBinding = diagramSourceComponent.bindings?.["lightGroup:" + overlaySpec.id];
          if (lightGroupBinding?.entityId) {
            effectComponentToPlace.bindings.entity = {
              entityId: lightGroupBinding.entityId
            };
          }
        }
        effectComponentToPlace.actions = Object.keys(effectComponentToPlace.actions || {}).length
          ? {
              ...(effectComponentToPlace.actions || {})
            }
          : {
              tap: {
                type: "toggle"
              }
            };
        effectComponentToPlace.properties = {
          ...(effectComponentToPlace.properties || {}),
          instanceName: overlaySpec.name,
          label: overlaySpec.name,
          note: overlaySpec.note,
          icon: existingEffectComponent?.properties?.icon || overlaySpec.icon,
          effectAssetId: "studio3d:" + exportFolderId + "/" + overlaySpec.file,
          effectNaturalWidth: resolutionWidth,
          effectNaturalHeight: resolutionHeight,
          effectReferenceImageId: preferredBaseLayer?.id || "",
          effectLayoutMode: sourceLayoutMode,
          effectLeft: (diagramCenterX / documentWidthPx) * 100,
          effectTop: (diagramCenterY / documentHeightPx) * 100,
          effectScale: 1,
          effectRotation: diagramRotation,
          autoDiagramFolder: exportFolderId,
          autoDiagramRole: overlaySpec.role,
          autoDiagramLayerId: overlaySpec.id,
          autoDiagramSceneAnchor: overlaySpec.anchor || null,
          autoDiagramButtonAnchor: buttonAnchor,
          autoDiagramLayoutVersion: AUTO_DIAGRAM_LAYOUT_VERSION,
          ...(overlaySpec.role === "light-group"
            ? {
                autoDiagramGroupId: overlaySpec.id
              }
            : {})
        };
        return effectComponentToPlace;
      });
      const baseLayerComponents = [floorPlanLayer, backgroundLayer, baseWithPlanLayer].filter(
        Boolean
      );
      const removedComponentIndex = componentLocation.index;
      removeComponent(exportDraftDocument, exportComponentId);
      componentLocation.collection.splice(
        removedComponentIndex,
        0,
        ...placedEffectComponents,
        ...baseLayerComponents
      );
      applyCollectionLayerOrder(componentLocation.collection);
      return {
        removed: true,
        selectedId:
          (backgroundLayer || floorPlanLayer || baseWithPlanLayer || placedEffectComponents[0])?.id ||
          null,
        // 完成提示要报「生成了几张图片、几个效果按钮」。这两个数只有在这里是现成的：
        // 事后从文档里按 autoDiagramFolder 反查会把上一次导图的组件也算进来。
        buttonCount: placedEffectComponents.length,
        imageCount: baseLayerComponents.length
      };
    })
      .then(spliceResult => {
        if (!spliceResult?.removed) {
          restoreAutoDiagramPreview();
          floorplanAutoDiagramStatusElement.textContent = "图片已生成，但控件置换失败，请重试。";
          return;
        }
        const selectedPlacedId = spliceResult.selectedId;
        selectedComponentId = selectedPlacedId;
        selectedComponentIds = selectedPlacedId ? new Set([selectedPlacedId]) : new Set();
        selectionAnchorComponentId = selectedPlacedId;
        editorRenderer?.setSelectedComponents(
          selectedPlacedId ? [selectedPlacedId] : [],
          selectedPlacedId
        );
        renderComponentLists();
        syncInspector();
        // 置换成功才提示：失败时给「重试」，成功时给「完成」，两者不能同时出现。
        showAutoDiagramCompleteDialog(exportManifest, spliceResult);
      })
      .catch(exportSpliceError => {
        restoreAutoDiagramPreview();
        floorplanAutoDiagramStatusElement.textContent = "图片已生成，但控件置换失败，请重试。";
        handleOperationError(exportSpliceError);
      });
  });
}

/**
 * 按钮图标效果检查器。
 *
 * 图标效果表单的回填、对齐方式与预览状态。
 */
function bindIconButtonEffectSection() {
  const on = sections.section("icon-button-effect");
  on(iconButtonEffectInspectorFormElement, "input", function onIconButtonEffectInspectorFormInput(effectInputEvent) {
    const inspectedEffectComponent = selectedComponent();
    if (!inspectedEffectComponent || inspectedEffectComponent.type !== "icon-button-effect") {
      return;
    }
    applyEffectPreviewState(effectInputEvent.target);
    const propertyConfig = effectPropertyConfigsByElement.get(effectInputEvent.target);
    if (propertyConfig) {
      let nextPropertyValue =
        propertyConfig.type === "boolean"
          ? effectInputEvent.target.checked
          : effectInputEvent.target.type === "color"
            ? effectInputEvent.target.value
            : Number(effectInputEvent.target.value);
      if (propertyConfig.type !== "boolean" && effectInputEvent.target.type !== "color") {
        if (!Number.isFinite(nextPropertyValue)) {
          return;
        }
        nextPropertyValue =
          clampNumber(nextPropertyValue, propertyConfig.min, propertyConfig.max) /
          (propertyConfig.divisor || 1);
      }
      editorRenderer?.previewComponentProperties(inspectedEffectComponent.id, {
        [propertyConfig.property]: nextPropertyValue
      });
      return;
    }
    if (
      !effectTransformInputSet.has(effectInputEvent.target) ||
      !Number.isFinite(Number(effectInputEvent.target.value))
    ) {
      return;
    }
    const transformInputValue = Number(effectInputEvent.target.value);
    const effectCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const effectCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const effectPositionWidth = Number(inspectedEffectComponent.position?.width || 100);
    const effectPositionHeight = Number(inspectedEffectComponent.position?.height || 100);
    if (effectInputEvent.target === iconButtonEffectLeftInputElement) {
      editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
        x:
          (effectCanvasWidth * clampNumber(transformInputValue, 0, 100)) / 100 -
          effectPositionWidth / 2
      });
    } else if (effectInputEvent.target === iconButtonEffectTopInputElement) {
      editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
        y:
          (effectCanvasHeight * clampNumber(transformInputValue, 0, 100)) / 100 -
          effectPositionHeight / 2
      });
    } else if (effectInputEvent.target === iconButtonEffectWidthInputElement) {
      editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
        width: (effectCanvasWidth * clampNumber(transformInputValue, 0.1, 100)) / 100
      });
    } else if (effectInputEvent.target === iconButtonEffectHeightInputElement) {
      editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
        height: (effectCanvasHeight * clampNumber(transformInputValue, 0.1, 100)) / 100
      });
    } else if (effectInputEvent.target === iconButtonEffectScaleInputElement) {
      editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
        scale: clampNumber(transformInputValue, 1, 500) / 100
      });
    } else if (effectInputEvent.target === iconButtonEffectRotationInputElement) {
      editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
        rotation: clampNumber(transformInputValue, -360, 360)
      });
    }
  });
  on(iconButtonEffectInspectorFormElement, "change", function onIconButtonEffectInspectorFormChange(effectChangeEvent) {
    const changedEffectInput = effectChangeEvent.target;
    const changedPropertyConfig = effectPropertyConfigsByElement.get(changedEffectInput);
    if (!changedPropertyConfig && !effectTransformInputSet.has(changedEffectInput)) {
      return;
    }
    if (changedEffectInput.type === "number" && !Number.isFinite(Number(changedEffectInput.value))) {
      syncInspector();
      return;
    }
    const effectComponentId = selectedComponentId;
    mutateDocument(effectChangeDraftDocument => {
      const effectComponentInDraft = findComponent(
        effectChangeDraftDocument,
        effectComponentId
      )?.component;
      if (!effectComponentInDraft || effectComponentInDraft.type !== "icon-button-effect") {
        return;
      }
      effectComponentInDraft.properties = {
        ...(effectComponentInDraft.properties || {})
      };
      effectComponentInDraft.position = {
        ...(effectComponentInDraft.position || {})
      };
      effectComponentInDraft.style = {
        ...(effectComponentInDraft.style || {})
      };
      if (changedPropertyConfig) {
        effectComponentInDraft.properties[changedPropertyConfig.property] =
          changedPropertyConfig.type === "boolean"
            ? changedEffectInput.checked
            : changedEffectInput.type === "color"
              ? changedEffectInput.value
              : clampNumber(
                  Number(changedEffectInput.value),
                  changedPropertyConfig.min,
                  changedPropertyConfig.max
                ) / (changedPropertyConfig.divisor || 1);
        return;
      }
      const effectDocCanvasWidth = Number(effectChangeDraftDocument.canvas.width || 2778);
      const effectDocCanvasHeight = Number(effectChangeDraftDocument.canvas.height || 1940);
      const effectNumericValue = Number(changedEffectInput.value);
      if (changedEffectInput === iconButtonEffectLeftInputElement) {
        effectComponentInDraft.position.x =
          (effectDocCanvasWidth * clampNumber(effectNumericValue, 0, 100)) / 100 -
          Number(effectComponentInDraft.position.width || 100) / 2;
      } else if (changedEffectInput === iconButtonEffectTopInputElement) {
        effectComponentInDraft.position.y =
          (effectDocCanvasHeight * clampNumber(effectNumericValue, 0, 100)) / 100 -
          Number(effectComponentInDraft.position.height || 100) / 2;
      } else if (changedEffectInput === iconButtonEffectWidthInputElement) {
        effectComponentInDraft.position.width =
          (effectDocCanvasWidth * clampNumber(effectNumericValue, 0.1, 100)) / 100;
      } else if (changedEffectInput === iconButtonEffectHeightInputElement) {
        effectComponentInDraft.position.height =
          (effectDocCanvasHeight * clampNumber(effectNumericValue, 0.1, 100)) / 100;
      } else if (changedEffectInput === iconButtonEffectScaleInputElement) {
        effectComponentInDraft.style.scale = clampNumber(effectNumericValue, 1, 500) / 100;
      } else if (changedEffectInput === iconButtonEffectRotationInputElement) {
        setComponentsRotation(
          effectChangeDraftDocument,
          effectComponentId,
          clampNumber(effectNumericValue, -360, 360)
        );
      }
    });
  });
  on(iconButtonEffectEffectLayoutOptionsElement, "click", function onIconButtonEffectEffectLayoutOptionsClick(effectLayoutClickEvent) {
    const effectLayoutOption = effectLayoutClickEvent.target.closest("[data-ibe-layout]");
    const effectLayoutComponentId = selectedComponentId;
    if (!!effectLayoutOption && !!effectLayoutComponentId) {
      mutateDocument(effectLayoutDraftDocument => {
        const effectLayoutComponent = findComponent(
          effectLayoutDraftDocument,
          effectLayoutComponentId
        )?.component;
        if (!!effectLayoutComponent && effectLayoutComponent.type === "icon-button-effect") {
          effectLayoutComponent.properties = {
            ...(effectLayoutComponent.properties || {}),
            effectLayoutMode: effectLayoutOption.dataset.ibeLayout === "fill" ? "fill" : "free"
          };
        }
      });
    }
  });
  /**
   * 收集一个页面下所有普通图片组件（含深层子组件）。只认 type === "image"：图标按钮的图片效果、自动图示的分层底图等
   * 都不是「普通图片」，不能参与图片对齐。pageSource 缺失时返回空数组。
   */
  function collectPageImages(pageSource) {
    const pageImages = [];
    /**
     * 递归把组件树里的图片组件推进外层 pageImages 结果数组。
     */
    const collectImageComponents = componentItems => {
      for (const imageItem of componentItems || []) {
        if (imageItem.type === "image") {
          pageImages.push(imageItem);
        }
        collectImageComponents(imageItem.children);
      }
    };
    collectImageComponents(pageSource?.components);
    return pageImages;
  }
  /**
   * 构造「图片对齐」对话框里的一张可选图片行（单选按钮 + 缩略图 + 摘要）。摘要里的位置与尺寸换算成画布百分比展示：
   * position 存的是左上角坐标与尺寸，用户更易懂中心点位置，故 x/y 各加半个自身尺寸后再除以画布尺寸（缺省 2778×1940）。
   * scale 以 1 为基准、显示成百分比；铺满模式（layoutMode === "fill"）下位置没有意义，改为只显示可见性。
   */
  function createImageAlignOption(imageComponentOption, isChosenImage) {
    const optionLabelElement = document.createElement("label");
    optionLabelElement.className = "effect-image-align-option";
    const optionRadioElement = document.createElement("input");
    optionRadioElement.type = "radio";
    optionRadioElement.name = "effect-image-align-target";
    optionRadioElement.value = imageComponentOption.id;
    optionRadioElement.checked = isChosenImage;
    const optionPreviewElement = document.createElement("span");
    optionPreviewElement.className = "effect-image-align-option-preview";
    const foundAsset = findAssetById(imageComponentOption.properties?.assetId || "");
    const previewAssetUrl = resolveAssetPreviewUrl(foundAsset);
    if (previewAssetUrl) {
      const optionPreviewImage = document.createElement("img");
      optionPreviewImage.src = previewAssetUrl;
      optionPreviewImage.alt = "";
      optionPreviewElement.append(optionPreviewImage);
    } else {
      optionPreviewElement.textContent = "无预览";
    }
    const optionCopyElement = document.createElement("span");
    optionCopyElement.className = "effect-image-align-option-copy";
    const optionTitleElement = document.createElement("strong");
    optionTitleElement.textContent = componentLabel(imageComponentOption);
    const optionLayoutElement = document.createElement("small");
    const isFillLayout = imageComponentOption.properties?.layoutMode === "fill";
    const visibilityLabel = imageComponentOption.style?.visible === false ? "隐藏" : "显示";
    const optionCanvasWidth = Number(activeProject?.document?.canvas?.width || 2778);
    const optionCanvasHeight = Number(activeProject?.document?.canvas?.height || 1940);
    const optionPosition = imageComponentOption.position || {};
    const optionWidth = Number(optionPosition.width || 100);
    const optionHeight = Number(optionPosition.height || 100);
    const centerLeftPercent = roundField(
      ((Number(optionPosition.x || 0) + optionWidth / 2) / optionCanvasWidth) * 100
    );
    const centerTopPercent = roundField(
      ((Number(optionPosition.y || 0) + optionHeight / 2) / optionCanvasHeight) * 100
    );
    const optionScalePercent = roundField(Number(imageComponentOption.style?.scale || 1) * 100);
    const optionRotationDeg = roundField(Number(optionPosition.rotation || 0));
    optionLayoutElement.textContent = isFillLayout
      ? "铺满 · 覆盖整个画布"
      : "自由 · 左 " + centerLeftPercent + "% · 上 " + centerTopPercent + "%";
    const optionDetailElement = document.createElement("small");
    optionDetailElement.textContent = isFillLayout
      ? visibilityLabel
      : "缩放 " + optionScalePercent + "% · 旋转 " + optionRotationDeg + "° · " + visibilityLabel;
    optionCopyElement.append(optionTitleElement, optionLayoutElement, optionDetailElement);
    optionLabelElement.append(optionRadioElement, optionPreviewElement, optionCopyElement);
    return optionLabelElement;
  }
  /**
   * 打开「选择图片对齐基准」对话框，仅对 icon-button-effect 组件可用（只有效果组件需要跟随某张参考图排版）。
   * 默认选中已保存的 effectReferenceImageId，没有保存过时默认选本页第一张图片（alignableIndex === 0），让用户少点一次；
   * 本页没有普通图片时禁用确认按钮并给出提示文案。确认后由对话框的确认回调写回 properties 并触发重新布局。
   */
  function openImageAlignDialog() {
    const alignEffectComponent = selectedComponent();
    const alignSourcePage = currentPage();
    if (
      !alignEffectComponent ||
      alignEffectComponent.type !== "icon-button-effect" ||
      !alignSourcePage
    ) {
      return;
    }
    const alignableImages = collectPageImages(alignSourcePage);
    const referenceImageId = String(alignEffectComponent.properties?.effectReferenceImageId || "");
    effectImageAlignOptionsElement.replaceChildren(
      ...alignableImages.map((alignableImage, alignableIndex) =>
        createImageAlignOption(
          alignableImage,
          alignableImage.id === referenceImageId || (!referenceImageId && alignableIndex === 0)
        )
      )
    );
    imageAlignSourceComponentId = alignEffectComponent.id;
    effectImageAlignMessageElement.hidden = alignableImages.length > 0;
    effectImageAlignMessageElement.textContent = alignableImages.length
      ? ""
      : "本页面没有可以对齐的普通图片。";
    effectImageAlignConfirmButtonElement.disabled = alignableImages.length === 0;
    effectImageAlignDialogElement.showModal();
  }
  on(iconButtonEffectEffectAlignImageButtonElement, "click", openImageAlignDialog);
  on(effectImageAlignCloseButtonElement, "click", function onEffectImageAlignCloseButtonClick() { return effectImageAlignDialogElement.close(); }
  );
  on(effectImageAlignCancelButtonElement, "click", function onEffectImageAlignCancelButtonClick() { return effectImageAlignDialogElement.close(); }
  );
  on(effectImageAlignDialogElement, "click", function onEffectImageAlignDialogClick(alignDialogBackdropEvent) {
    if (alignDialogBackdropEvent.target === effectImageAlignDialogElement) {
      effectImageAlignDialogElement.close();
    }
  });
  on(effectImageAlignDialogElement, "close", function onEffectImageAlignDialogClose() {
    imageAlignSourceComponentId = null;
  });
  on(effectImageAlignConfirmButtonElement, "click", function onEffectImageAlignConfirmButtonClick() {
    const chosenImageId = effectImageAlignOptionsElement.querySelector(
      'input[name="effect-image-align-target"]:checked'
    )?.value;
    const pendingAlignComponentId = imageAlignSourceComponentId;
    if (!pendingAlignComponentId || !chosenImageId) {
      effectImageAlignMessageElement.textContent = "请选择一张本页面图片。";
      effectImageAlignMessageElement.hidden = false;
      return;
    }
    effectImageAlignDialogElement.close();
    mutateDocument(alignDraftDocument => {
      const alignComponent = findComponent(alignDraftDocument, pendingAlignComponentId)?.component;
      const currentAlignPage =
        alignDraftDocument.pages?.find(
          alignPageCandidate => alignPageCandidate.path === pageSelectElement.value
        ) || alignDraftDocument.pages?.[0];
      const referenceImageComponent = findComponentInItems(
        currentAlignPage?.components,
        chosenImageId
      );
      if (
        !alignComponent ||
        alignComponent.type !== "icon-button-effect" ||
        !referenceImageComponent ||
        referenceImageComponent.type !== "image"
      ) {
        return;
      }
      const alignCanvasWidth = Number(alignDraftDocument.canvas?.width || 2778);
      const alignCanvasHeight = Number(alignDraftDocument.canvas?.height || 1940);
      const referencePosition = referenceImageComponent.position || {};
      const referenceWidth = Number(referencePosition.width || 100);
      const referenceHeight = Number(referencePosition.height || 100);
      const referenceIsFill = referenceImageComponent.properties?.layoutMode === "fill";
      alignComponent.properties = {
        ...(alignComponent.properties || {}),
        effectReferenceImageId: referenceImageComponent.id,
        effectLayoutMode: referenceIsFill ? "fill" : "free",
        ...(referenceIsFill
          ? {}
          : {
              effectLeft:
                ((Number(referencePosition.x || 0) + referenceWidth / 2) / alignCanvasWidth) * 100,
              effectTop:
                ((Number(referencePosition.y || 0) + referenceHeight / 2) / alignCanvasHeight) * 100,
              effectScale: clampNumber(Number(referenceImageComponent.style?.scale || 1), 0.01, 5),
              effectRotation: Number(referencePosition.rotation || 0)
            })
      };
    });
  });
  on(iconButtonEffectPreviewStateElement, "click", function onIconButtonEffectPreviewStateClick(previewStateClickEvent) {
    const previewStateOption = previewStateClickEvent.target.closest("[data-ibe-preview]");
    const previewToggleComponentId = selectedComponentId;
    if (!previewStateOption || !previewToggleComponentId) {
      return;
    }
    const requestedPreviewState = ["on", "off"].includes(previewStateOption.dataset.ibePreview)
      ? previewStateOption.dataset.ibePreview
      : "auto";
    iconButtonEffectPreviewStateByComponentId.set(previewToggleComponentId, requestedPreviewState);
    editorRenderer?.setComponentPreviewState(previewToggleComponentId, requestedPreviewState);
    syncInspector();
  });
  on(iconButtonEffectLayerOptionsElement, "click", function onIconButtonEffectLayerOptionsClick(layerOptionsClickEvent) {
    const effectLayerOption = layerOptionsClickEvent.target.closest("[data-ibe-layer]");
    const layerComponentId = selectedComponentId;
    if (!effectLayerOption || !layerComponentId) {
      return;
    }
    const requestedLayer = effectLayerOption.dataset.ibeLayer === "effect" ? "effect" : "button";
    const layerPreviewStatus = requestedLayer === "effect" ? "on" : "off";
    iconButtonEffectLayerByComponentId.set(layerComponentId, requestedLayer);
    iconButtonEffectPreviewStateByComponentId.set(layerComponentId, layerPreviewStatus);
    editorRenderer?.setComponentPreviewState(layerComponentId, layerPreviewStatus);
    editorRenderer?.setComponentSelectionLayer(layerComponentId, requestedLayer);
    closeAllDropdownMenus();
    syncInspector();
  });
  on(iconButtonEffectButtonVisibleButtonElement, "click", function onIconButtonEffectButtonVisibleButtonClick() {
    const buttonVisibleComponentId = selectedComponentId;
    if (buttonVisibleComponentId) {
      mutateDocument(buttonVisibleDraftDocument => {
        const buttonVisibleComponent = findComponent(
          buttonVisibleDraftDocument,
          buttonVisibleComponentId
        )?.component;
        if (!!buttonVisibleComponent && buttonVisibleComponent.type === "icon-button-effect") {
          buttonVisibleComponent.properties = {
            ...(buttonVisibleComponent.properties || {}),
            buttonVisible: buttonVisibleComponent.properties?.buttonVisible === false
          };
        }
      });
    }
  });
  on(iconButtonEffectEffectVisibleButtonElement, "click", function onIconButtonEffectEffectVisibleButtonClick() {
    const effectVisibleComponentId = selectedComponentId;
    if (effectVisibleComponentId) {
      mutateDocument(effectVisibleDraftDocument => {
        const effectVisibleComponent = findComponent(
          effectVisibleDraftDocument,
          effectVisibleComponentId
        )?.component;
        if (!!effectVisibleComponent && effectVisibleComponent.type === "icon-button-effect") {
          effectVisibleComponent.properties = {
            ...(effectVisibleComponent.properties || {}),
            effectVisible: effectVisibleComponent.properties?.effectVisible === false
          };
        }
      });
    }
  });
}

const previewStateByInputElement = new Map([
  [iconButtonIconOffOpacityInputElement, "off"],
  [iconButtonMainOffOpacityInputElement, "off"],
  [iconButtonSecondaryOffOpacityInputElement, "off"],
  [iconButtonFrameOffOpacityInputElement, "off"],
  [iconButtonOnFillVisibleButtonElement, "on"],
  [iconButtonIconOnOpacityInputElement, "on"],
  [iconButtonMainOnOpacityInputElement, "on"],
  [iconButtonSecondaryOnOpacityInputElement, "on"],
  [iconButtonOnFillColorInputElement, "on"],
  [iconButtonOnFillStrengthInputElement, "on"],
  [iconButtonFrameOnOpacityInputElement, "on"],
  [deviceButtonIconOnColorInputElement, "on"]
]);

/**
 * 同步图标按钮预览切换按钮的选中态。用 class 与 aria-pressed 双写：class 负责样式、aria-pressed 负责无障碍朗读，
 * 只改 class 会让屏幕阅读器读不出当前是开还是关。
 */
function syncIconButtonPreviewButtons(previewStateValue) {
  for (const previewButtonNode of iconButtonPreviewStateElement.querySelectorAll(
    "[data-icon-button-preview]"
  )) {
    const isButtonActive = previewButtonNode.dataset.iconButtonPreview === previewStateValue;
    previewButtonNode.classList.toggle("active", isButtonActive);
    previewButtonNode.setAttribute("aria-pressed", String(isButtonActive));
  }
}

/**
 * 记录并应用图标按钮/设备按钮/传感器的预览状态（开/关/自动），与空调预览同理，状态存在模块级 Map、仅用于编辑期预览。
 * "auto" 表示解除强制预览（从 Map 里删除），以按键值不同区分是「显式置 auto」还是「保留上次的开关预览」。
 */
function applyIconButtonPreviewState(previewComponentIdForIcon, previewModeForIcon = "auto") {
  if (!previewComponentIdForIcon) {
    return;
  }
  const resolvedIconPreviewMode = ["on", "off"].includes(previewModeForIcon)
    ? previewModeForIcon
    : "auto";
  if (resolvedIconPreviewMode === "auto") {
    iconButtonPreviewStateByComponentId.delete(previewComponentIdForIcon);
  } else {
    iconButtonPreviewStateByComponentId.set(previewComponentIdForIcon, resolvedIconPreviewMode);
  }
  editorRenderer?.setComponentPreviewState(previewComponentIdForIcon, resolvedIconPreviewMode);
  if (previewComponentIdForIcon === selectedComponentId) {
    syncIconButtonPreviewButtons(resolvedIconPreviewMode);
  }
}

/**
 * 输入框失焦后把预览恢复为自动，避免强制预览一直粘着。只对登记过预览态（或设备按钮 iconColor 特例）的输入框生效，
 * 并限定组件类型，逻辑与 activatePreviewForInput 对称。
 */
function resetPreviewForInput(resetInputElement) {
  const resetOwnerComponent = selectedComponent();
  if (
    !!previewStateByInputElement.has(resetInputElement) ||
    (resetOwnerComponent?.type === "device-button" &&
      resetInputElement === iconButtonIconColorInputElement)
  ) {
    if (["icon-button", "device-button", "presence-sensor"].includes(resetOwnerComponent?.type)) {
      applyIconButtonPreviewState(resetOwnerComponent.id, "auto");
    }
  }
}

/**
 * 设备类控件。
 *
 * 设备状态精度、空调送风动效、窗帘设置等设备面板控件。
 */
function bindDeviceSection() {
  const on = sections.section("device");
  on(deviceButtonStatePrecisionSelectElement, "change", function onDeviceButtonStatePrecisionSelectChange() {
    const statePrecisionComponentId = selectedComponentId;
    if (statePrecisionComponentId) {
      mutateDocument(statePrecisionDraftDocument => {
        const statePrecisionComponent = findComponent(
          statePrecisionDraftDocument,
          statePrecisionComponentId
        )?.component;
        if (!statePrecisionComponent || statePrecisionComponent.type !== "device-button") {
          return;
        }
        const statePrecisionValue = ["0", "1", "2", "3", "4"].includes(
          deviceButtonStatePrecisionSelectElement.value
        )
          ? Number(deviceButtonStatePrecisionSelectElement.value)
          : "auto";
        statePrecisionComponent.properties = {
          ...(statePrecisionComponent.properties || {}),
          statePrecision: statePrecisionValue
        };
      });
    }
  });
  on(presenceSensorKindSelectElement, "change", function onPresenceSensorKindSelectChange() {
    const sensorKindComponentId = selectedComponentId;
    if (sensorKindComponentId) {
      mutateDocument(sensorKindDraftDocument => {
        const sensorKindComponent = findComponent(
          sensorKindDraftDocument,
          sensorKindComponentId
        )?.component;
        if (!sensorKindComponent || sensorKindComponent.type !== "presence-sensor") {
          return;
        }
        const requestedSensorKind = [
          "presence",
          "door-window",
          "water-leak",
          "smoke",
          "natural-gas"
        ].includes(presenceSensorKindSelectElement.value)
          ? presenceSensorKindSelectElement.value
          : "presence";
        sensorKindComponent.properties = {
          ...(sensorKindComponent.properties || {}),
          sensorKind: requestedSensorKind
        };
        if (requestedSensorKind !== "door-window") {
          doorWindowPerspectiveEditIds.delete(sensorKindComponentId);
          editorRenderer?.setComponentSelectionLayer(sensorKindComponentId, "button");
        }
      });
    }
  });
  on(doorWindowPerspectiveEditButtonElement, "click", function onDoorWindowPerspectiveEditButtonClick() {
    const perspectiveEditComponent = selectedComponent();
    if (
      !!perspectiveEditComponent &&
      perspectiveEditComponent.type === "presence-sensor" &&
      perspectiveEditComponent.properties?.sensorKind === "door-window"
    ) {
      doorWindowPerspectiveEditIds.add(perspectiveEditComponent.id);
      doorWindowPerspectiveEditButtonElement.classList.add("active");
      doorWindowPerspectiveEditButtonElement.setAttribute("aria-pressed", "true");
      doorWindowPerspectiveSaveButtonElement.disabled = false;
      editorRenderer?.setComponentSelectionLayer(perspectiveEditComponent.id, "perspective");
    }
  });
  on(doorWindowPerspectiveSaveButtonElement, "click", function onDoorWindowPerspectiveSaveButtonClick() {
    const perspectiveSaveComponent = selectedComponent();
    if (
      !!perspectiveSaveComponent &&
      perspectiveSaveComponent.type === "presence-sensor" &&
      perspectiveSaveComponent.properties?.sensorKind === "door-window"
    ) {
      doorWindowPerspectiveEditIds.delete(perspectiveSaveComponent.id);
      doorWindowPerspectiveEditButtonElement.classList.remove("active");
      doorWindowPerspectiveEditButtonElement.setAttribute("aria-pressed", "false");
      doorWindowPerspectiveSaveButtonElement.disabled = true;
      editorRenderer?.setComponentSelectionLayer(perspectiveSaveComponent.id, "button");
    }
  });
  on(doorWindowPerspectiveResetButtonElement, "click", function onDoorWindowPerspectiveResetButtonClick() {
    const perspectiveResetComponentId = selectedComponentId;
    if (perspectiveResetComponentId) {
      mutateDocument(perspectiveResetDraftDocument => {
        const perspectiveResetComponent = findComponent(
          perspectiveResetDraftDocument,
          perspectiveResetComponentId
        )?.component;
        if (
          !!perspectiveResetComponent &&
          perspectiveResetComponent.type === "presence-sensor" &&
          perspectiveResetComponent.properties?.sensorKind === "door-window"
        ) {
          perspectiveResetComponent.properties = {
            ...(perspectiveResetComponent.properties || {}),
            perspectiveCorners: [...DEFAULT_PERSPECTIVE_CORNERS]
          };
        }
      });
    }
  });
  on(cameraFitOptionsElement, "click", function onCameraFitOptionsClick(cameraFitClickEvent) {
    const cameraFitOption = cameraFitClickEvent.target.closest("[data-camera-fit]");
    const cameraFitComponentId = selectedComponentId;
    if (!cameraFitOption || !cameraFitComponentId) {
      return;
    }
    const requestedCameraFit = cameraFitOption.dataset.cameraFit === "contain" ? "contain" : "fill";
    mutateDocument(cameraFitDraftDocument => {
      const cameraFitComponent = findComponent(
        cameraFitDraftDocument,
        cameraFitComponentId
      )?.component;
      if (!!cameraFitComponent && cameraFitComponent.type === "camera") {
        cameraFitComponent.properties = {
          ...(cameraFitComponent.properties || {}),
          fit: requestedCameraFit
        };
      }
    });
  });
  on(cameraDisplayModeOptionsElement, "click", function onCameraDisplayModeOptionsClick(displayModeClickEvent) {
    const displayModeOption = displayModeClickEvent.target.closest("[data-camera-display-mode]");
    const displayModeComponentId = selectedComponentId;
    if (!displayModeOption || !displayModeComponentId) {
      return;
    }
    const requestedDisplayMode =
      displayModeOption.dataset.cameraDisplayMode === "snapshot" ? "snapshot" : "live";
    mutateDocument(displayModeDraftDocument => {
      const displayModeComponent = findComponent(
        displayModeDraftDocument,
        displayModeComponentId
      )?.component;
      if (!!displayModeComponent && displayModeComponent.type === "camera") {
        displayModeComponent.properties = {
          ...(displayModeComponent.properties || {}),
          displayMode: requestedDisplayMode
        };
      }
    });
  });
  on(cameraRefreshIntervalInputElement, "change", function onCameraRefreshIntervalInputChange() {
    const refreshIntervalComponentId = selectedComponentId;
    if (!refreshIntervalComponentId) {
      return;
    }
    const refreshIntervalInput = Number(cameraRefreshIntervalInputElement.value);
    const normalizedRefreshInterval = Number.isFinite(refreshIntervalInput)
      ? Math.max(6, Math.round(refreshIntervalInput))
      : 10;
    cameraRefreshIntervalInputElement.value = String(normalizedRefreshInterval);
    mutateDocument(refreshIntervalDraftDocument => {
      const refreshIntervalComponent = findComponent(
        refreshIntervalDraftDocument,
        refreshIntervalComponentId
      )?.component;
      if (!!refreshIntervalComponent && refreshIntervalComponent.type === "camera") {
        refreshIntervalComponent.properties = {
          ...(refreshIntervalComponent.properties || {}),
          refreshInterval: normalizedRefreshInterval
        };
      }
    });
  });
  on(cameraMediaVisibleButtonElement, "click", function onCameraMediaVisibleButtonClick() {
    const mediaVisibleComponentId = selectedComponentId;
    if (mediaVisibleComponentId) {
      mutateDocument(mediaVisibleDraftDocument => {
        const mediaVisibleComponent = findComponent(
          mediaVisibleDraftDocument,
          mediaVisibleComponentId
        )?.component;
        if (!!mediaVisibleComponent && mediaVisibleComponent.type === "camera") {
          mediaVisibleComponent.properties = {
            ...(mediaVisibleComponent.properties || {}),
            mediaVisible: mediaVisibleComponent.properties?.mediaVisible === false
          };
        }
      });
    }
  });
  on(cameraFrameVisibleButtonElement, "click", function onCameraFrameVisibleButtonClick() {
    const frameVisibleComponentId = selectedComponentId;
    if (frameVisibleComponentId) {
      mutateDocument(frameVisibleDraftDocument => {
        const frameVisibleComponent = findComponent(
          frameVisibleDraftDocument,
          frameVisibleComponentId
        )?.component;
        if (!!frameVisibleComponent && frameVisibleComponent.type === "camera") {
          frameVisibleComponent.properties = {
            ...(frameVisibleComponent.properties || {}),
            frameVisible: frameVisibleComponent.properties?.frameVisible === false
          };
        }
      });
    }
  });
  /**
   * 记录并应用空调组件在编辑器里的预览状态（开/关/自动）。状态存放在模块级 Map 里而不是写进文档，
   * 因为它只是编辑期的可视化辅助，不该进入历史记录或被保存；非 "on"/"off" 的输入统一归一为 "auto"。
   */
  function applyAirConditionerPreviewState(previewTargetComponentId, previewModeRequest = "auto") {
    if (!previewTargetComponentId) {
      return;
    }
    const resolvedPreviewMode = ["on", "off"].includes(previewModeRequest)
      ? previewModeRequest
      : "auto";
    airConditionerPreviewStateByComponentId.set(previewTargetComponentId, resolvedPreviewMode);
    editorRenderer?.setComponentPreviewState(previewTargetComponentId, resolvedPreviewMode);
  }
  on(airConditionerPreviewStateElement, "click", function onAirConditionerPreviewStateClick(acPreviewStateClickEvent) {
    const acPreviewStateOption = acPreviewStateClickEvent.target.closest(
      "[data-air-conditioner-preview]"
    );
    if (!!acPreviewStateOption && !!selectedComponentId) {
      applyAirConditionerPreviewState(
        selectedComponentId,
        acPreviewStateOption.dataset.airConditionerPreview
      );
      syncInspector();
    }
  });
  on(airConditionerDeviceTypeElement, "click", function onAirConditionerDeviceTypeClick(acDeviceTypeClickEvent) {
    const acDeviceTypeOption = acDeviceTypeClickEvent.target.closest(
      "[data-air-conditioner-device-type]"
    );
    const acDeviceTypeComponentId = selectedComponentId;
    if (!acDeviceTypeOption || !acDeviceTypeComponentId) {
      return;
    }
    const requestedAcDeviceType = ["air-conditioner", "bath-heater"].includes(
      acDeviceTypeOption.dataset.airConditionerDeviceType
    )
      ? acDeviceTypeOption.dataset.airConditionerDeviceType
      : "auto";
    mutateDocument(acDeviceTypeDraftDocument => {
      const acDeviceTypeComponent = findComponent(
        acDeviceTypeDraftDocument,
        acDeviceTypeComponentId
      )?.component;
      if (!!acDeviceTypeComponent && acDeviceTypeComponent.type === "air-conditioner") {
        acDeviceTypeComponent.properties = {
          ...(acDeviceTypeComponent.properties || {}),
          deviceType: requestedAcDeviceType
        };
      }
    });
  });
  on(airConditionerLayerOptionsElement, "click", function onAirConditionerLayerOptionsClick(acLayerClickEvent) {
    const acLayerOption = acLayerClickEvent.target.closest("[data-air-conditioner-layer]");
    if (!acLayerOption || !selectedComponentId) {
      return;
    }
    const requestedAcLayer =
      acLayerOption.dataset.airConditionerLayer === "airflow" ? "airflow" : "button";
    airConditionerLayerByComponentId.set(selectedComponentId, requestedAcLayer);
    applyAirConditionerPreviewState(
      selectedComponentId,
      requestedAcLayer === "airflow" ? "on" : "off"
    );
    editorRenderer?.setComponentSelectionLayer(selectedComponentId, requestedAcLayer);
    closeAllDropdownMenus();
    syncInspector();
  });
  on(airConditionerAirflowVisibleButtonElement, "click", function onAirConditionerAirflowVisibleButtonClick() {
    const airflowVisibleComponentId = selectedComponentId;
    if (airflowVisibleComponentId) {
      applyAirConditionerPreviewState(airflowVisibleComponentId, "on");
      mutateDocument(airflowVisibleDraftDocument => {
        const airflowVisibleComponent = findComponent(
          airflowVisibleDraftDocument,
          airflowVisibleComponentId
        )?.component;
        if (!!airflowVisibleComponent && airflowVisibleComponent.type === "air-conditioner") {
          airflowVisibleComponent.properties = {
            ...(airflowVisibleComponent.properties || {}),
            airflowVisible: airflowVisibleComponent.properties?.airflowVisible === false
          };
        }
      });
    }
  });
  for (const [visibilityToggleElement, visibilityPropertyKey] of [
    [airConditionerIconVisibleButtonElement, "iconVisible"],
    [airConditionerMainVisibleButtonElement, "mainTextVisible"],
    [airConditionerSecondaryVisibleButtonElement, "secondaryTextVisible"]
  ]) {
    on(visibilityToggleElement, "click", function onVisibilityToggleClick() {
      const visibilityToggleComponentId = selectedComponentId;
      if (visibilityToggleComponentId) {
        mutateDocument(acVisibilityDraftDocument => {
          const acVisibilityComponent = findComponent(
            acVisibilityDraftDocument,
            visibilityToggleComponentId
          )?.component;
          if (!!acVisibilityComponent && acVisibilityComponent.type === "air-conditioner") {
            acVisibilityComponent.properties = {
              ...(acVisibilityComponent.properties || {}),
              [visibilityPropertyKey]:
                acVisibilityComponent.properties?.[visibilityPropertyKey] === false
            };
          }
        });
      }
    });
  }
  on(airConditionerAirflowMotionElement, "click", function onAirConditionerAirflowMotionClick(airflowMotionClickEvent) {
    const airflowMotionOption = airflowMotionClickEvent.target.closest("[data-airflow-motion]");
    const airflowMotionComponentId = selectedComponentId;
    if (!!airflowMotionOption && !!airflowMotionComponentId) {
      applyAirConditionerPreviewState(airflowMotionComponentId, "on");
      mutateDocument(airflowMotionDraftDocument => {
        const airflowMotionComponent = findComponent(
          airflowMotionDraftDocument,
          airflowMotionComponentId
        )?.component;
        if (!!airflowMotionComponent && airflowMotionComponent.type === "air-conditioner") {
          airflowMotionComponent.properties = {
            ...(airflowMotionComponent.properties || {}),
            airflowMotion:
              airflowMotionOption.dataset.airflowMotion === "static" ? "static" : "dynamic"
          };
        }
      });
    }
  });
  for (const airflowSectionEventName of ["focusin", "pointerdown", "input"]) {
    on(airConditionerAirflowSectionElement, airflowSectionEventName,
      function onAirConditionerAirflowSection(airflowSectionEvent) {
        if (
          airConditionerConfigsByElement.has(airflowSectionEvent.target) &&
          selectedComponent()?.type === "air-conditioner"
        ) {
          applyAirConditionerPreviewState(selectedComponentId, "on");
        }
      }
    );
  }
  /**
   * 聚焦/编辑某个输入框时，把预览切到它能体现的开关态。previewStateByInputElement 只登记了「Off 类」与「On 类」输入框；
   * 特例：设备按钮的 iconColor 未登记但语义上属于「未激活」态，故单独判一次并回落到 "off"。不适用于图标按钮类组件时不做任何事。
   */
  function activatePreviewForInput(previewInputElement) {
    const previewOwnerComponent = selectedComponent();
    const previewStateToApply =
      previewStateByInputElement.get(previewInputElement) ||
      (previewOwnerComponent?.type === "device-button" &&
      previewInputElement === iconButtonIconColorInputElement
        ? "off"
        : null);
    if (
      !!previewStateToApply &&
      !!["icon-button", "device-button", "presence-sensor"].includes(previewOwnerComponent?.type)
    ) {
      applyIconButtonPreviewState(previewOwnerComponent.id, previewStateToApply);
    }
  }
  for (const previewSyncEventName of ["focusin", "pointerdown", "input"]) {
    on(iconButtonInspectorFormElement, previewSyncEventName, function onIconButtonInspectorForm(previewSyncEvent) { return activatePreviewForInput(previewSyncEvent.target); }
    );
  }
  on(coverSettingsKindElement, "click", function onCoverSettingsKindClick(coverKindClickEvent) {
    const coverKindOption = coverKindClickEvent.target.closest("[data-cover-kind]");
    const coverKindComponentId = selectedComponentId;
    if (!coverKindOption || !coverKindComponentId) {
      return;
    }
    const requestedCoverKind = ["standard", "dream", "airer"].includes(
      coverKindOption.dataset.coverKind
    )
      ? coverKindOption.dataset.coverKind
      : "auto";
    mutateDocument(coverKindDraftDocument => {
      const coverKindComponent = findComponent(
        coverKindDraftDocument,
        coverKindComponentId
      )?.component;
      if (
        coverKindComponent &&
        String(coverKindComponent.bindings?.entity?.entityId || "").startsWith("cover.")
      ) {
        coverKindComponent.properties = {
          ...(coverKindComponent.properties || {}),
          coverKind: requestedCoverKind
        };
      }
    });
  });
  on(coverSettingsDirectionElement, "click", function onCoverSettingsDirectionClick(coverDirectionClickEvent) {
    const coverDirectionOption = coverDirectionClickEvent.target.closest("[data-cover-direction]");
    const coverDirectionComponentId = selectedComponentId;
    if (!coverDirectionOption || !coverDirectionComponentId) {
      return;
    }
    const requestedCoverDirection = ["left", "right"].includes(
      coverDirectionOption.dataset.coverDirection
    )
      ? coverDirectionOption.dataset.coverDirection
      : "split";
    mutateDocument(coverDirectionDraftDocument => {
      const coverDirectionComponent = findComponent(
        coverDirectionDraftDocument,
        coverDirectionComponentId
      )?.component;
      if (
        coverDirectionComponent &&
        String(coverDirectionComponent.bindings?.entity?.entityId || "").startsWith("cover.")
      ) {
        coverDirectionComponent.properties = {
          ...(coverDirectionComponent.properties || {}),
          coverDirection: requestedCoverDirection
        };
      }
    });
  });
  on(coverSettingsMotorDirectionElement, "click", function onCoverSettingsMotorDirectionClick(motorDirectionClickEvent) {
    const motorDirectionOption = motorDirectionClickEvent.target.closest(
      "[data-cover-motor-direction]"
    );
    const motorDirectionComponentId = selectedComponentId;
    if (!motorDirectionOption || !motorDirectionComponentId) {
      return;
    }
    const requestedMotorDirection = ["normal", "reversed"].includes(
      motorDirectionOption.dataset.coverMotorDirection
    )
      ? motorDirectionOption.dataset.coverMotorDirection
      : "auto";
    mutateDocument(motorDirectionDraftDocument => {
      const motorDirectionComponent = findComponent(
        motorDirectionDraftDocument,
        motorDirectionComponentId
      )?.component;
      if (
        motorDirectionComponent &&
        String(motorDirectionComponent.bindings?.entity?.entityId || "").startsWith("cover.")
      ) {
        motorDirectionComponent.properties = {
          ...(motorDirectionComponent.properties || {}),
          coverMotorDirection: requestedMotorDirection
        };
      }
    });
  });
  on(iconButtonInspectorFormElement, "focusout", function onIconButtonInspectorFormFocusout(previewFocusOutEvent) {
    const focusOutComponent = selectedComponent();
    if (
      (!!previewStateByInputElement.has(previewFocusOutEvent.target) ||
        (focusOutComponent?.type === "device-button" &&
          previewFocusOutEvent.target === iconButtonIconColorInputElement)) &&
      (!(previewFocusOutEvent.relatedTarget instanceof Node) ||
        !iconButtonPreviewStateElement.contains(previewFocusOutEvent.relatedTarget))
    ) {
      window.requestAnimationFrame(() => {
        if (
          activeColorInputElement === previewFocusOutEvent.target &&
          !globalColorPickerElement.hidden
        ) {
          return;
        }
        if (
          previewStateByInputElement.get(document.activeElement) ||
          (selectedComponent()?.type === "device-button" &&
          document.activeElement === iconButtonIconColorInputElement
            ? "off"
            : null)
        ) {
          activatePreviewForInput(document.activeElement);
        } else {
          resetPreviewForInput(previewFocusOutEvent.target);
        }
      });
    }
  });
}

const navigationStylePropertyDefinitions = {
  mainTextVisible: {
    group: "文字",
    label: "主文字显示"
  },
  secondaryTextVisible: {
    group: "文字",
    label: "副文字显示"
  },
  mainColor: {
    group: "文字",
    label: "主文字颜色"
  },
  secondaryColor: {
    group: "文字",
    label: "副文字颜色"
  },
  mainSize: {
    group: "文字",
    label: "主文字大小"
  },
  secondarySize: {
    group: "文字",
    label: "副文字大小"
  },
  mainWeight: {
    group: "文字",
    label: "主文字笔画粗细"
  },
  secondaryWeight: {
    group: "文字",
    label: "副文字笔画粗细"
  },
  mainSpacing: {
    group: "文字",
    label: "主文字字间距"
  },
  secondarySpacing: {
    group: "文字",
    label: "副文字字间距"
  },
  mainTextLeft: {
    group: "文字",
    label: "主文字左右位置"
  },
  mainTextTop: {
    group: "文字",
    label: "主文字上下位置"
  },
  secondaryTextLeft: {
    group: "文字",
    label: "副文字左右位置"
  },
  secondaryTextTop: {
    group: "文字",
    label: "副文字上下位置"
  },
  textIdleOpacity: {
    group: "文字",
    label: "文字选择前透明度"
  },
  textActiveOpacity: {
    group: "文字",
    label: "文字选择后透明度"
  },
  iconVisible: {
    group: "图标",
    label: "图标显示"
  },
  iconColor: {
    group: "图标",
    label: "图标颜色"
  },
  iconSize: {
    group: "图标",
    label: "图标大小"
  },
  iconLeft: {
    group: "图标",
    label: "图标左右位置"
  },
  iconTop: {
    group: "图标",
    label: "图标上下位置"
  },
  iconIdleOpacity: {
    group: "图标",
    label: "图标选择前透明度"
  },
  iconActiveOpacity: {
    group: "图标",
    label: "图标选择后透明度"
  },
  frameVisible: {
    group: "外框",
    label: "外框显示"
  },
  frameColor: {
    group: "外框",
    label: "外框颜色"
  },
  frameWidth: {
    group: "外框",
    label: "外框粗细"
  },
  frameIdleOpacity: {
    group: "外框",
    label: "外框选择前透明度"
  },
  frameActiveOpacity: {
    group: "外框",
    label: "外框选择后透明度"
  },
  radius: {
    group: "外框",
    label: "外框圆角"
  },
  frameAngle: {
    group: "外框",
    label: "外框渐变角度"
  },
  glowVisible: {
    group: "背景光晕",
    label: "背景光晕显示"
  },
  glowColor: {
    group: "背景光晕",
    label: "背景光晕颜色"
  },
  glowAngle: {
    group: "背景光晕",
    label: "背景光晕角度"
  },
  glowIdleStrength: {
    group: "背景光晕",
    label: "选择前光晕强度"
  },
  glowIdleSize: {
    group: "背景光晕",
    label: "选择前光晕大小"
  },
  glowActiveStrength: {
    group: "背景光晕",
    label: "选择后光晕强度"
  },
  glowActiveSize: {
    group: "背景光晕",
    label: "选择后光晕大小"
  },
  width: {
    group: "尺寸与变换",
    label: "控件宽度"
  },
  height: {
    group: "尺寸与变换",
    label: "控件高度"
  },
  scale: {
    group: "尺寸与变换",
    label: "控件缩放"
  },
  rotation: {
    group: "尺寸与变换",
    label: "控件旋转"
  }
};

/**
 * 用 JSON 序列化结果判断两个属性值是否相等：属性值可能是数组或对象（如透视四角），直接用 === 比不出内容相等；
 * 属性值体量都很小，序列化的开销可以接受。
 */
function areComponentValuesEqual(firstComponentValue, secondComponentValue) {
  return JSON.stringify(firstComponentValue) === JSON.stringify(secondComponentValue);
}
/**
 * 记录导航按钮某个属性「本次编辑前的值」，供退出编辑时生成变更摘要。只记第一笔：同一属性被连续改动时保留最早的那次旧值，
 * 这样摘要里展示的是会话开始前的状态而非中间态；属性不在已知样式表内、或新旧值本就相等时直接忽略，避免把噪声写进摘要。
 */
function rememberNavigationStyleChange(
  navigationComponentId,
  navigationPropertyKey,
  previousPropertyValue,
  updatedPropertyValue
) {
  if (!navigationComponentId || !navigationStylePropertyDefinitions[navigationPropertyKey]) {
    return;
  }
  let navigationSavedPropertyValues =
    navigationButtonSavedSettingsByComponentId.get(navigationComponentId);
  if (
    !!navigationSavedPropertyValues ||
    !areComponentValuesEqual(previousPropertyValue, updatedPropertyValue)
  ) {
    if (!navigationSavedPropertyValues) {
      navigationSavedPropertyValues = new Map();
      navigationButtonSavedSettingsByComponentId.set(
        navigationComponentId,
        navigationSavedPropertyValues
      );
    }
    if (!navigationSavedPropertyValues.has(navigationPropertyKey)) {
      navigationSavedPropertyValues.set(navigationPropertyKey, clone(previousPropertyValue));
    }
  }
}
/**
 * 清理某导航按钮已记录变更中「属性键已废弃」的条目：旧版本记录下的键可能已从 navigationStylePropertyDefinitions 移除，
 * 留着会让摘要显示不出来的属性；顺带在表为空时删掉整个 Map 项，防止泄漏。
 */
function pruneNavigationSavedSettings(navigationSettingsComponent) {
  const navigationSavedSettings = navigationButtonSavedSettingsByComponentId.get(
    navigationSettingsComponent?.id
  );
  if (navigationSavedSettings) {
    for (const navigationSavedPropertyKey of navigationSavedSettings.keys()) {
      if (!navigationStylePropertyDefinitions[navigationSavedPropertyKey]) {
        navigationSavedSettings.delete(navigationSavedPropertyKey);
      }
    }
    if (!navigationSavedSettings.size) {
      navigationButtonSavedSettingsByComponentId.delete(navigationSettingsComponent.id);
    }
  }
}

/**
 * 各组件检查器。
 *
 * 时间、日期、天气、折线图、面板框、导航等检查器的 input / change / focusin 回填与样式应用。
 */
function bindInspectorSection() {
  const on = sections.section("inspector");
  on(timeInspectorFormElement, "input", function onTimeInspectorFormInput(timeInputEvent) {
    const timeInspectorComponent = selectedComponent();
    if (!timeInspectorComponent || timeInspectorComponent.type !== "time") {
      return;
    }
    const timeInputElement = timeInputEvent.target;
    const colorPropertyKey = timeColorPropertyByElement.get(timeInputElement);
    if (colorPropertyKey) {
      editorRenderer?.previewComponentProperties(timeInspectorComponent.id, {
        [colorPropertyKey]: timeInputElement.value
      });
      return;
    }
    const timeConfig = timePropertyConfigsByElement.get(timeInputElement);
    if (timeConfig) {
      if (
        String(timeInputElement.value).trim() === "" ||
        !Number.isFinite(Number(timeInputElement.value))
      ) {
        return;
      }
      const timePropertyValue =
        clampNumber(Number(timeInputElement.value), timeConfig.minimum, timeConfig.maximum) /
        timeConfig.divisor;
      const nextTimeProperties = {
        ...(timeInspectorComponent.properties || {}),
        [timeConfig.property]: timePropertyValue
      };
      editorRenderer?.previewComponentProperties(timeInspectorComponent.id, {
        [timeConfig.property]: timePropertyValue
      });
      if (timeConfig.resizes) {
        previewTimeResize(timeInspectorComponent, nextTimeProperties);
      }
      return;
    }
    if (
      !timeTransformInputSet.has(timeInputElement) ||
      String(timeInputElement.value).trim() === "" ||
      !Number.isFinite(Number(timeInputElement.value))
    ) {
      return;
    }
    const timeNumericValue = Number(timeInputElement.value);
    const timeCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const timeCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const timePositionWidth = Number(timeInspectorComponent.position?.width || 100);
    const timePositionHeight = Number(timeInspectorComponent.position?.height || 100);
    if (timeInputElement === timeLeftInputElement) {
      const clampedTimeLeft = clampNumber(timeNumericValue, 0, 100);
      editorRenderer?.previewComponentTransform(timeInspectorComponent.id, {
        x: (timeCanvasWidth * clampedTimeLeft) / 100 - timePositionWidth / 2
      });
    } else if (timeInputElement === timeTopInputElement) {
      const clampedTimeTop = clampNumber(timeNumericValue, 0, 100);
      editorRenderer?.previewComponentTransform(timeInspectorComponent.id, {
        y: (timeCanvasHeight * clampedTimeTop) / 100 - timePositionHeight / 2
      });
    } else if (timeInputElement === timeScaleInputElement) {
      const clampedTimeScale = clampNumber(timeNumericValue, 1, 500);
      editorRenderer?.previewComponentTransform(timeInspectorComponent.id, {
        scale: clampedTimeScale / 100
      });
    } else if (timeInputElement === timeRotationInputElement) {
      const clampedTimeRotation = clampNumber(timeNumericValue, -360, 360);
      editorRenderer?.previewComponentTransform(timeInspectorComponent.id, {
        rotation: clampedTimeRotation
      });
    }
  });
  on(timeInspectorFormElement, "change", function onTimeInspectorFormChange(timeChangeEvent) {
    const changedTimeInput = timeChangeEvent.target;
    const timeChangeComponentId = selectedComponentId;
    if (!timeChangeComponentId) {
      return;
    }
    const timeColorKey = timeColorPropertyByElement.get(changedTimeInput);
    const timeChangeConfig = timePropertyConfigsByElement.get(changedTimeInput);
    if (!!timeColorKey || !!timeChangeConfig || !!timeTransformInputSet.has(changedTimeInput)) {
      if (
        (timeChangeConfig || timeTransformInputSet.has(changedTimeInput)) &&
        (String(changedTimeInput.value).trim() === "" ||
          !Number.isFinite(Number(changedTimeInput.value)))
      ) {
        syncInspector();
        return;
      }
      mutateDocument(timeChangeDraftDocument => {
        const timeChangeComponent = findComponent(
          timeChangeDraftDocument,
          timeChangeComponentId
        )?.component;
        if (!timeChangeComponent || timeChangeComponent.type !== "time") {
          return;
        }
        timeChangeComponent.properties = {
          ...(timeChangeComponent.properties || {})
        };
        timeChangeComponent.position = {
          ...(timeChangeComponent.position || {})
        };
        timeChangeComponent.style = {
          ...(timeChangeComponent.style || {})
        };
        const timeDocCanvasWidth = Number(timeChangeDraftDocument.canvas.width || 2778);
        const timeDocCanvasHeight = Number(timeChangeDraftDocument.canvas.height || 1940);
        const timeChangeValue = Number(changedTimeInput.value);
        if (timeColorKey) {
          timeChangeComponent.properties[timeColorKey] = changedTimeInput.value;
        } else if (timeChangeConfig) {
          timeChangeComponent.properties[timeChangeConfig.property] =
            clampNumber(timeChangeValue, timeChangeConfig.minimum, timeChangeConfig.maximum) /
            timeChangeConfig.divisor;
          if (timeChangeConfig.resizes) {
            fitTimeComponentToDimensions(timeChangeComponent, timeChangeComponent.properties);
          }
        } else if (changedTimeInput === timeLeftInputElement) {
          timeChangeComponent.position.x =
            (timeDocCanvasWidth * clampNumber(timeChangeValue, 0, 100)) / 100 -
            Number(timeChangeComponent.position.width || 100) / 2;
        } else if (changedTimeInput === timeTopInputElement) {
          timeChangeComponent.position.y =
            (timeDocCanvasHeight * clampNumber(timeChangeValue, 0, 100)) / 100 -
            Number(timeChangeComponent.position.height || 100) / 2;
        } else if (changedTimeInput === timeScaleInputElement) {
          timeChangeComponent.style.scale = clampNumber(timeChangeValue, 1, 500) / 100;
        } else if (changedTimeInput === timeRotationInputElement) {
          setComponentsRotation(
            timeChangeDraftDocument,
            timeChangeComponentId,
            clampNumber(timeChangeValue, -360, 360)
          );
        }
      });
    }
  });
  for (const timeToggleElement of [timeHourFormatElement, timeSecondsElement]) {
    on(timeToggleElement, "click", function onTimeToggleClick(timeToggleClickEvent) {
      const timeToggleComponentId = selectedComponentId;
      const hourFormatOption = timeToggleClickEvent.target.closest("[data-time-hour-format]");
      const secondsOption = timeToggleClickEvent.target.closest("[data-time-seconds]");
      if (!!timeToggleComponentId && (!!hourFormatOption || !!secondsOption)) {
        mutateDocument(timeToggleDraftDocument => {
          const timeToggleComponent = findComponent(
            timeToggleDraftDocument,
            timeToggleComponentId
          )?.component;
          if (!!timeToggleComponent && timeToggleComponent.type === "time") {
            timeToggleComponent.properties = {
              ...(timeToggleComponent.properties || {})
            };
            if (hourFormatOption) {
              timeToggleComponent.properties.hour12 =
                hourFormatOption.dataset.timeHourFormat === "12";
            }
            if (secondsOption) {
              timeToggleComponent.properties.showSeconds = secondsOption.dataset.timeSeconds === "on";
            }
            fitTimeComponentToDimensions(timeToggleComponent, timeToggleComponent.properties);
          }
        });
      }
    });
  }
  const dateColorPropertyByElement = new Map([
    [datePrimaryColorInputElement, "primaryColor"],
    [dateLunarColorInputElement, "lunarColor"]
  ]);
  const datePropertyConfigsByElement = new Map([
    [
      datePrimarySizeInputElement,
      {
        property: "primarySize",
        minimum: 12,
        maximum: 500,
        divisor: 1,
        resizes: true
      }
    ],
    [
      datePrimaryWeightInputElement,
      {
        property: "primaryWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true
      }
    ],
    [
      datePrimarySpacingInputElement,
      {
        property: "primarySpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true
      }
    ],
    [
      dateLunarSizeInputElement,
      {
        property: "lunarSize",
        minimum: 10,
        maximum: 500,
        divisor: 1,
        resizes: true
      }
    ],
    [
      dateLunarWeightInputElement,
      {
        property: "lunarWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true
      }
    ],
    [
      dateLunarSpacingInputElement,
      {
        property: "lunarSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true
      }
    ],
    [
      dateLineGapInputElement,
      {
        property: "lineGap",
        minimum: 0,
        maximum: 200,
        divisor: 1,
        resizes: true
      }
    ],
    [
      dateOpacityInputElement,
      {
        property: "opacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
        resizes: false
      }
    ]
  ]);
  const dateTransformInputSet = new Set([
    dateLeftInputElement,
    dateTopInputElement,
    dateScaleInputElement,
    dateRotationInputElement
  ]);
  /**
   * 日期组件尺寸类属性变更的即时预览：按新属性算出目标宽高，保持组件中心不动重置左上角坐标，只推给渲染器做临时变换，不写回文档。
   */
  function previewDateResize(resizedDateComponent, dateDimensionProperties) {
    const dateWidth = Number(resizedDateComponent.position?.width || 100);
    const dateHeight = Number(resizedDateComponent.position?.height || 100);
    const dateCenterX = Number(resizedDateComponent.position?.x || 0) + dateWidth / 2;
    const dateCenterY = Number(resizedDateComponent.position?.y || 0) + dateHeight / 2;
    const { width: nextDateWidth, height: nextDateHeight } =
      dateComponentDimensions(dateDimensionProperties);
    editorRenderer?.previewComponentTransform(resizedDateComponent.id, {
      x: dateCenterX - nextDateWidth / 2,
      y: dateCenterY - nextDateHeight / 2,
      width: nextDateWidth,
      height: nextDateHeight
    });
  }
  on(dateInspectorFormElement, "input", function onDateInspectorFormInput(dateInputEvent) {
    const dateInspectorComponent = selectedComponent();
    if (!dateInspectorComponent || dateInspectorComponent.type !== "date") {
      return;
    }
    const dateInputElement = dateInputEvent.target;
    const dateColorKey = dateColorPropertyByElement.get(dateInputElement);
    if (dateColorKey) {
      editorRenderer?.previewComponentProperties(dateInspectorComponent.id, {
        [dateColorKey]: dateInputElement.value
      });
      return;
    }
    const dateConfig = datePropertyConfigsByElement.get(dateInputElement);
    if (dateConfig) {
      if (
        String(dateInputElement.value).trim() === "" ||
        !Number.isFinite(Number(dateInputElement.value))
      ) {
        return;
      }
      const dateColorClampedValue =
        clampNumber(Number(dateInputElement.value), dateConfig.minimum, dateConfig.maximum) /
        dateConfig.divisor;
      const dateColorPropertyPatch = {
        ...(dateInspectorComponent.properties || {}),
        [dateConfig.property]: dateColorClampedValue
      };
      editorRenderer?.previewComponentProperties(dateInspectorComponent.id, {
        [dateConfig.property]: dateColorClampedValue
      });
      if (dateConfig.resizes) {
        previewDateResize(dateInspectorComponent, dateColorPropertyPatch);
      }
      return;
    }
    if (
      !dateTransformInputSet.has(dateInputElement) ||
      String(dateInputElement.value).trim() === "" ||
      !Number.isFinite(Number(dateInputElement.value))
    ) {
      return;
    }
    const dateTransformInputNumber = Number(dateInputElement.value);
    const dateTransformCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const dateTransformCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const dateTransformComponentWidth = Number(dateInspectorComponent.position?.width || 100);
    const dateTransformComponentHeight = Number(dateInspectorComponent.position?.height || 100);
    if (dateInputElement === dateLeftInputElement) {
      const dateLeftPercent = clampNumber(dateTransformInputNumber, 0, 100);
      editorRenderer?.previewComponentTransform(dateInspectorComponent.id, {
        x: (dateTransformCanvasWidth * dateLeftPercent) / 100 - dateTransformComponentWidth / 2
      });
    } else if (dateInputElement === dateTopInputElement) {
      const dateTopPercent = clampNumber(dateTransformInputNumber, 0, 100);
      editorRenderer?.previewComponentTransform(dateInspectorComponent.id, {
        y: (dateTransformCanvasHeight * dateTopPercent) / 100 - dateTransformComponentHeight / 2
      });
    } else if (dateInputElement === dateScaleInputElement) {
      const dateScalePercent = clampNumber(dateTransformInputNumber, 1, 500);
      editorRenderer?.previewComponentTransform(dateInspectorComponent.id, {
        scale: dateScalePercent / 100
      });
    } else if (dateInputElement === dateRotationInputElement) {
      const dateRotationDegrees = clampNumber(dateTransformInputNumber, -360, 360);
      editorRenderer?.previewComponentTransform(dateInspectorComponent.id, {
        rotation: dateRotationDegrees
      });
    }
  });
  on(dateInspectorFormElement, "change", function onDateInspectorFormChange(dateChangeEvent) {
    const dateChangeInputElement = dateChangeEvent.target;
    const dateChangeComponentId = selectedComponentId;
    if (!dateChangeComponentId) {
      return;
    }
    const dateChangeColorProperty = dateColorPropertyByElement.get(dateChangeInputElement);
    const dateChangePropertyConfig = datePropertyConfigsByElement.get(dateChangeInputElement);
    if (
      !!dateChangeColorProperty ||
      !!dateChangePropertyConfig ||
      !!dateTransformInputSet.has(dateChangeInputElement)
    ) {
      if (
        (dateChangePropertyConfig || dateTransformInputSet.has(dateChangeInputElement)) &&
        (String(dateChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(dateChangeInputElement.value)))
      ) {
        syncInspector();
        return;
      }
      mutateDocument(dateChangeDraftDocument => {
        const dateChangeComponent = findComponent(
          dateChangeDraftDocument,
          dateChangeComponentId
        )?.component;
        if (!dateChangeComponent || dateChangeComponent.type !== "date") {
          return;
        }
        dateChangeComponent.properties = {
          ...(dateChangeComponent.properties || {})
        };
        dateChangeComponent.position = {
          ...(dateChangeComponent.position || {})
        };
        dateChangeComponent.style = {
          ...(dateChangeComponent.style || {})
        };
        const dateChangeCanvasWidth = Number(dateChangeDraftDocument.canvas.width || 2778);
        const dateChangeCanvasHeight = Number(dateChangeDraftDocument.canvas.height || 1940);
        const dateChangeInputNumber = Number(dateChangeInputElement.value);
        if (dateChangeColorProperty) {
          dateChangeComponent.properties[dateChangeColorProperty] = dateChangeInputElement.value;
        } else if (dateChangePropertyConfig) {
          dateChangeComponent.properties[dateChangePropertyConfig.property] =
            clampNumber(
              dateChangeInputNumber,
              dateChangePropertyConfig.minimum,
              dateChangePropertyConfig.maximum
            ) / dateChangePropertyConfig.divisor;
          if (dateChangePropertyConfig.resizes) {
            fitDateComponentToDimensions(dateChangeComponent, dateChangeComponent.properties);
          }
        } else if (dateChangeInputElement === dateLeftInputElement) {
          dateChangeComponent.position.x =
            (dateChangeCanvasWidth * clampNumber(dateChangeInputNumber, 0, 100)) / 100 -
            Number(dateChangeComponent.position.width || 100) / 2;
        } else if (dateChangeInputElement === dateTopInputElement) {
          dateChangeComponent.position.y =
            (dateChangeCanvasHeight * clampNumber(dateChangeInputNumber, 0, 100)) / 100 -
            Number(dateChangeComponent.position.height || 100) / 2;
        } else if (dateChangeInputElement === dateScaleInputElement) {
          dateChangeComponent.style.scale = clampNumber(dateChangeInputNumber, 1, 500) / 100;
        } else if (dateChangeInputElement === dateRotationInputElement) {
          setComponentsRotation(
            dateChangeDraftDocument,
            dateChangeComponentId,
            clampNumber(dateChangeInputNumber, -360, 360)
          );
        }
      });
    }
  });
  for (const dateVisibilityElement of [dateWeekdayElement, dateLunarElement]) {
    on(dateVisibilityElement, "click", function onDateVisibilityClick(dateVisibilityEvent) {
      const dateVisibilityComponentId = selectedComponentId;
      const weekdayToggleElement = dateVisibilityEvent.target.closest("[data-date-weekday]");
      const dateLunarToggleElement = dateVisibilityEvent.target.closest("[data-date-lunar]");
      if (!!dateVisibilityComponentId && (!!weekdayToggleElement || !!dateLunarToggleElement)) {
        mutateDocument(dateVisibilityDraftDocument => {
          const dateVisibilityComponent = findComponent(
            dateVisibilityDraftDocument,
            dateVisibilityComponentId
          )?.component;
          if (!!dateVisibilityComponent && dateVisibilityComponent.type === "date") {
            dateVisibilityComponent.properties = {
              ...(dateVisibilityComponent.properties || {})
            };
            if (weekdayToggleElement) {
              dateVisibilityComponent.properties.showWeekday =
                weekdayToggleElement.dataset.dateWeekday === "on";
            }
            if (dateLunarToggleElement) {
              dateVisibilityComponent.properties.showLunar =
                dateLunarToggleElement.dataset.dateLunar === "on";
            }
            fitDateComponentToDimensions(dateVisibilityComponent, dateVisibilityComponent.properties);
          }
        });
      }
    });
  }
  const weatherColorPropertiesByElement = new Map([
    [weatherTemperatureColorInputElement, "temperatureColor"],
    [weatherSecondaryColorInputElement, "secondaryColor"]
  ]);
  const weatherPropertyConfigsByElement = new Map([
    [
      weatherIconSizeInputElement,
      {
        property: "iconSize",
        minimum: 12,
        maximum: 500,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherIconGapInputElement,
      {
        property: "iconGap",
        minimum: 0,
        maximum: 300,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherTemperatureSizeInputElement,
      {
        property: "temperatureSize",
        minimum: 12,
        maximum: 500,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherTemperatureWeightInputElement,
      {
        property: "temperatureWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherTemperatureSpacingInputElement,
      {
        property: "temperatureSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherSecondarySizeInputElement,
      {
        property: "secondarySize",
        minimum: 10,
        maximum: 500,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherSecondaryWeightInputElement,
      {
        property: "secondaryWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherSecondarySpacingInputElement,
      {
        property: "secondarySpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherLineGapInputElement,
      {
        property: "lineGap",
        minimum: 0,
        maximum: 200,
        divisor: 1,
        resizes: true
      }
    ],
    [
      weatherOpacityInputElement,
      {
        property: "opacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
        resizes: false
      }
    ]
  ]);
  const weatherTransformInputSet = new Set([
    weatherLeftInputElement,
    weatherTopInputElement,
    weatherScaleInputElement,
    weatherRotationInputElement
  ]);
  /**
   * 天气组件尺寸预览：按新属性算出目标宽高，以中心为锚点反推新的左上角坐标，仅通知渲染器做临时变换，最终值仍由 change 里的 mutateDocument 落盘。
   */
  function previewWeatherComponentResize(weatherResizeComponent, weatherResizeProperties) {
    const weatherResizeWidth = Number(weatherResizeComponent.position?.width || 100);
    const weatherResizeHeight = Number(weatherResizeComponent.position?.height || 100);
    const weatherResizeCenterX =
      Number(weatherResizeComponent.position?.x || 0) + weatherResizeWidth / 2;
    const weatherResizeCenterY =
      Number(weatherResizeComponent.position?.y || 0) + weatherResizeHeight / 2;
    const { width: weatherResizeTargetWidth, height: weatherResizeTargetHeight } =
      weatherComponentDimensions(weatherResizeProperties);
    editorRenderer?.previewComponentTransform(weatherResizeComponent.id, {
      x: weatherResizeCenterX - weatherResizeTargetWidth / 2,
      y: weatherResizeCenterY - weatherResizeTargetHeight / 2,
      width: weatherResizeTargetWidth,
      height: weatherResizeTargetHeight
    });
  }
  on(weatherInspectorFormElement, "input", function onWeatherInspectorFormInput(weatherInputEvent) {
    const weatherInputComponent = selectedComponent();
    if (!weatherInputComponent || weatherInputComponent.type !== "weather") {
      return;
    }
    const weatherInputElement = weatherInputEvent.target;
    const weatherInputColorProperty = weatherColorPropertiesByElement.get(weatherInputElement);
    if (weatherInputColorProperty) {
      editorRenderer?.previewComponentProperties(weatherInputComponent.id, {
        [weatherInputColorProperty]: weatherInputElement.value
      });
      return;
    }
    const weatherInputPropertyConfig = weatherPropertyConfigsByElement.get(weatherInputElement);
    if (weatherInputPropertyConfig) {
      if (
        String(weatherInputElement.value).trim() === "" ||
        !Number.isFinite(Number(weatherInputElement.value))
      ) {
        return;
      }
      const weatherInputPropertyValue =
        clampNumber(
          Number(weatherInputElement.value),
          weatherInputPropertyConfig.minimum,
          weatherInputPropertyConfig.maximum
        ) / weatherInputPropertyConfig.divisor;
      const weatherResizePropertiesPatch = {
        ...(weatherInputComponent.properties || {}),
        [weatherInputPropertyConfig.property]: weatherInputPropertyValue
      };
      editorRenderer?.previewComponentProperties(weatherInputComponent.id, {
        [weatherInputPropertyConfig.property]: weatherInputPropertyValue
      });
      if (weatherInputPropertyConfig.resizes) {
        previewWeatherComponentResize(weatherInputComponent, weatherResizePropertiesPatch);
      }
      return;
    }
    if (
      !weatherTransformInputSet.has(weatherInputElement) ||
      String(weatherInputElement.value).trim() === "" ||
      !Number.isFinite(Number(weatherInputElement.value))
    ) {
      return;
    }
    const weatherTransformInputNumber = Number(weatherInputElement.value);
    const weatherTransformCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const weatherTransformCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const weatherTransformComponentWidth = Number(weatherInputComponent.position?.width || 100);
    const weatherTransformComponentHeight = Number(weatherInputComponent.position?.height || 100);
    if (weatherInputElement === weatherLeftInputElement) {
      const weatherLeftPercent = clampNumber(weatherTransformInputNumber, 0, 100);
      editorRenderer?.previewComponentTransform(weatherInputComponent.id, {
        x:
          (weatherTransformCanvasWidth * weatherLeftPercent) / 100 -
          weatherTransformComponentWidth / 2
      });
    } else if (weatherInputElement === weatherTopInputElement) {
      const weatherTopPercent = clampNumber(weatherTransformInputNumber, 0, 100);
      editorRenderer?.previewComponentTransform(weatherInputComponent.id, {
        y:
          (weatherTransformCanvasHeight * weatherTopPercent) / 100 -
          weatherTransformComponentHeight / 2
      });
    } else if (weatherInputElement === weatherScaleInputElement) {
      const weatherScalePercent = clampNumber(weatherTransformInputNumber, 1, 500);
      editorRenderer?.previewComponentTransform(weatherInputComponent.id, {
        scale: weatherScalePercent / 100
      });
    } else if (weatherInputElement === weatherRotationInputElement) {
      const weatherRotationDegrees = clampNumber(weatherTransformInputNumber, -360, 360);
      editorRenderer?.previewComponentTransform(weatherInputComponent.id, {
        rotation: weatherRotationDegrees
      });
    }
  });
  on(weatherInspectorFormElement, "change", function onWeatherInspectorFormChange(weatherChangeEvent) {
    const weatherChangeInputElement = weatherChangeEvent.target;
    const weatherChangeComponentId = selectedComponentId;
    if (!weatherChangeComponentId) {
      return;
    }
    const weatherChangeColorProperty = weatherColorPropertiesByElement.get(weatherChangeInputElement);
    const weatherChangePropertyConfig =
      weatherPropertyConfigsByElement.get(weatherChangeInputElement);
    if (
      !!weatherChangeColorProperty ||
      !!weatherChangePropertyConfig ||
      !!weatherTransformInputSet.has(weatherChangeInputElement)
    ) {
      if (
        (weatherChangePropertyConfig || weatherTransformInputSet.has(weatherChangeInputElement)) &&
        (String(weatherChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(weatherChangeInputElement.value)))
      ) {
        syncInspector();
        return;
      }
      mutateDocument(weatherChangeDraftDocument => {
        const weatherChangeComponent = findComponent(
          weatherChangeDraftDocument,
          weatherChangeComponentId
        )?.component;
        if (!weatherChangeComponent || weatherChangeComponent.type !== "weather") {
          return;
        }
        weatherChangeComponent.properties = {
          ...(weatherChangeComponent.properties || {})
        };
        weatherChangeComponent.position = {
          ...(weatherChangeComponent.position || {})
        };
        weatherChangeComponent.style = {
          ...(weatherChangeComponent.style || {})
        };
        const weatherChangeCanvasWidth = Number(weatherChangeDraftDocument.canvas.width || 2778);
        const weatherChangeCanvasHeight = Number(weatherChangeDraftDocument.canvas.height || 1940);
        const weatherChangeInputNumber = Number(weatherChangeInputElement.value);
        if (weatherChangeColorProperty) {
          weatherChangeComponent.properties[weatherChangeColorProperty] =
            weatherChangeInputElement.value;
        } else if (weatherChangePropertyConfig) {
          weatherChangeComponent.properties[weatherChangePropertyConfig.property] =
            clampNumber(
              weatherChangeInputNumber,
              weatherChangePropertyConfig.minimum,
              weatherChangePropertyConfig.maximum
            ) / weatherChangePropertyConfig.divisor;
          if (weatherChangePropertyConfig.resizes) {
            fitWeatherComponentToDimensions(
              weatherChangeComponent,
              weatherChangeComponent.properties
            );
          }
        } else if (weatherChangeInputElement === weatherLeftInputElement) {
          weatherChangeComponent.position.x =
            (weatherChangeCanvasWidth * clampNumber(weatherChangeInputNumber, 0, 100)) / 100 -
            Number(weatherChangeComponent.position.width || 100) / 2;
        } else if (weatherChangeInputElement === weatherTopInputElement) {
          weatherChangeComponent.position.y =
            (weatherChangeCanvasHeight * clampNumber(weatherChangeInputNumber, 0, 100)) / 100 -
            Number(weatherChangeComponent.position.height || 100) / 2;
        } else if (weatherChangeInputElement === weatherScaleInputElement) {
          weatherChangeComponent.style.scale = clampNumber(weatherChangeInputNumber, 1, 500) / 100;
        } else if (weatherChangeInputElement === weatherRotationInputElement) {
          setComponentsRotation(
            weatherChangeDraftDocument,
            weatherChangeComponentId,
            clampNumber(weatherChangeInputNumber, -360, 360)
          );
        }
      });
    }
  });
  for (const weatherVisibilityElement of [
    weatherIconVisibleElement,
    weatherTemperatureVisibleElement,
    weatherConditionVisibleElement,
    weatherHumidityVisibleElement
  ]) {
    on(weatherVisibilityElement, "click", function onWeatherVisibilityClick(weatherVisibilityEvent) {
      const weatherVisibilityComponentId = selectedComponentId;
      const weatherVisibilityButtonElement = weatherVisibilityEvent.target.closest("button");
      if (!weatherVisibilityComponentId || !weatherVisibilityButtonElement) {
        return;
      }
      const weatherVisibilityEntry = [
        ["weatherIconVisible", "iconVisible"],
        ["weatherTemperatureVisible", "temperatureVisible"],
        ["weatherConditionVisible", "conditionVisible"],
        ["weatherHumidityVisible", "humidityVisible"]
      ].find(
        ([weatherVisibilityDatasetKey]) =>
          weatherVisibilityButtonElement.dataset[weatherVisibilityDatasetKey] !== undefined
      );
      if (!weatherVisibilityEntry) {
        return;
      }
      const [weatherVisibilityDatasetKeyName, weatherVisibilityPropertyName] = weatherVisibilityEntry;
      mutateDocument(weatherVisibilityDraftDocument => {
        const weatherVisibilityComponent = findComponent(
          weatherVisibilityDraftDocument,
          weatherVisibilityComponentId
        )?.component;
        if (!!weatherVisibilityComponent && weatherVisibilityComponent.type === "weather") {
          weatherVisibilityComponent.properties = {
            ...(weatherVisibilityComponent.properties || {}),
            [weatherVisibilityPropertyName]:
              weatherVisibilityButtonElement.dataset[weatherVisibilityDatasetKeyName] === "on"
          };
          fitWeatherComponentToDimensions(
            weatherVisibilityComponent,
            weatherVisibilityComponent.properties
          );
        }
      });
    });
  }
  const lineChartColorPropertiesByElement = new Map([
    [lineChartValueColorInputElement, "valueColor"],
    [lineChartStatePrecisionSelectElement, "statePrecision"],
    [lineChartThresholdModeSelectElement, "thresholdMode"]
  ]);
  const lineChartPropertyConfigsByElement = new Map([
    [
      lineChartValueScaleInputElement,
      {
        property: "valueScale",
        minimum: 10,
        maximum: 500,
        divisor: 1
      }
    ],
    [
      lineChartValueOffsetXInputElement,
      {
        property: "valueOffsetX",
        minimum: -100,
        maximum: 100,
        divisor: 1
      }
    ],
    [
      lineChartValueOffsetYInputElement,
      {
        property: "valueOffsetY",
        minimum: -100,
        maximum: 100,
        divisor: 1
      }
    ],
    [
      lineChartUpdateIntervalInputElement,
      {
        property: "updateInterval",
        minimum: 30,
        maximum: 86400,
        divisor: 1
      }
    ],
    [
      lineChartHoursInputElement,
      {
        property: "hours",
        minimum: 1,
        maximum: 168,
        divisor: 1
      }
    ],
    [
      lineChartCurveRadiusInputElement,
      {
        property: "cornerRadius",
        minimum: 0,
        maximum: 50,
        divisor: 1
      }
    ]
  ]);
  const lineChartTransformInputSet = new Set([
    lineChartLeftInputElement,
    lineChartTopInputElement,
    lineChartWidthInputElement,
    lineChartHeightInputElement,
    lineChartScaleInputElement,
    lineChartRotationInputElement
  ]);
  on(lineChartInspectorFormElement, "input", function onLineChartInspectorFormInput(lineChartInputEvent) {
    const lineChartInputComponent = selectedComponent();
    if (!lineChartInputComponent || lineChartInputComponent.type !== "line-chart") {
      return;
    }
    const lineChartInputElement = lineChartInputEvent.target;
    const lineChartInputColorProperty = lineChartColorPropertiesByElement.get(lineChartInputElement);
    const lineChartInputPropertyConfig = lineChartPropertyConfigsByElement.get(lineChartInputElement);
    if (lineChartInputColorProperty) {
      editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
        [lineChartInputColorProperty]: lineChartInputElement.value
      });
      return;
    }
    if (lineChartInputPropertyConfig) {
      if (
        String(lineChartInputElement.value).trim() === "" ||
        !Number.isFinite(Number(lineChartInputElement.value))
      ) {
        return;
      }
      const lineChartInputPropertyValue = clampNumber(
        Number(lineChartInputElement.value),
        lineChartInputPropertyConfig.minimum,
        lineChartInputPropertyConfig.maximum
      );
      if (!["updateInterval", "hours"].includes(lineChartInputPropertyConfig.property)) {
        editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
          [lineChartInputPropertyConfig.property]:
            lineChartInputPropertyValue / lineChartInputPropertyConfig.divisor
        });
      }
      return;
    }
    if (
      lineChartThresholdInputs.findIndex(
        lineChartThresholdProbeItem =>
          lineChartThresholdProbeItem.value === lineChartInputElement ||
          lineChartThresholdProbeItem.color === lineChartInputElement
      ) >= 0
    ) {
      const lineChartThresholdValues = lineChartThresholdInputs.map(lineChartThresholdSourceItem => ({
        value: Number(lineChartThresholdSourceItem.value.value),
        color: lineChartThresholdSourceItem.color.value
      }));
      if (
        lineChartThresholdValues.every(lineChartThresholdValueItem =>
          Number.isFinite(lineChartThresholdValueItem.value)
        )
      ) {
        editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
          thresholdMode: "manual",
          thresholds: lineChartThresholdValues
        });
      }
      return;
    }
    if (
      !lineChartTransformInputSet.has(lineChartInputElement) ||
      String(lineChartInputElement.value).trim() === "" ||
      !Number.isFinite(Number(lineChartInputElement.value))
    ) {
      return;
    }
    const lineChartTransformInputNumber = Number(lineChartInputElement.value);
    const lineChartTransformCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const lineChartTransformCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const lineChartTransformComponentWidth = Number(lineChartInputComponent.position?.width || 100);
    const lineChartTransformComponentHeight = Number(lineChartInputComponent.position?.height || 100);
    const lineChartTransformCenterX =
      Number(lineChartInputComponent.position?.x || 0) + lineChartTransformComponentWidth / 2;
    const lineChartTransformCenterY =
      Number(lineChartInputComponent.position?.y || 0) + lineChartTransformComponentHeight / 2;
    if (lineChartInputElement === lineChartLeftInputElement) {
      editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
        x:
          (lineChartTransformCanvasWidth * clampNumber(lineChartTransformInputNumber, 0, 100)) / 100 -
          lineChartTransformComponentWidth / 2
      });
    } else if (lineChartInputElement === lineChartTopInputElement) {
      editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
        y:
          (lineChartTransformCanvasHeight * clampNumber(lineChartTransformInputNumber, 0, 100)) /
            100 -
          lineChartTransformComponentHeight / 2
      });
    } else if (lineChartInputElement === lineChartWidthInputElement) {
      const lineChartTransformWidthPx =
        (lineChartTransformCanvasWidth * clampNumber(lineChartTransformInputNumber, 0.1, 100)) / 100;
      editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
        x: lineChartTransformCenterX - lineChartTransformWidthPx / 2,
        width: lineChartTransformWidthPx
      });
    } else if (lineChartInputElement === lineChartHeightInputElement) {
      const lineChartTransformHeightPx =
        (lineChartTransformCanvasHeight * clampNumber(lineChartTransformInputNumber, 0.1, 100)) / 100;
      editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
        y: lineChartTransformCenterY - lineChartTransformHeightPx / 2,
        height: lineChartTransformHeightPx
      });
    } else if (lineChartInputElement === lineChartScaleInputElement) {
      editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
        scale: clampNumber(lineChartTransformInputNumber, 1, 500) / 100
      });
    } else if (lineChartInputElement === lineChartRotationInputElement) {
      editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
        rotation: clampNumber(lineChartTransformInputNumber, -360, 360)
      });
    }
  });
  on(lineChartInspectorFormElement, "change", function onLineChartInspectorFormChange(lineChartChangeEvent) {
    const lineChartChangeInputElement = lineChartChangeEvent.target;
    const lineChartChangeComponentId = selectedComponentId;
    if (!lineChartChangeComponentId) {
      return;
    }
    const lineChartChangeColorProperty = lineChartColorPropertiesByElement.get(
      lineChartChangeInputElement
    );
    const lineChartChangePropertyConfig = lineChartPropertyConfigsByElement.get(
      lineChartChangeInputElement
    );
    const lineChartChangeThresholdIndex = lineChartThresholdInputs.findIndex(
      lineChartThresholdProbeEntry =>
        lineChartThresholdProbeEntry.value === lineChartChangeInputElement ||
        lineChartThresholdProbeEntry.color === lineChartChangeInputElement
    );
    if (
      !!lineChartChangeColorProperty ||
      !!lineChartChangePropertyConfig ||
      !(lineChartChangeThresholdIndex < 0) ||
      !!lineChartTransformInputSet.has(lineChartChangeInputElement)
    ) {
      if (
        (lineChartChangePropertyConfig ||
          lineChartTransformInputSet.has(lineChartChangeInputElement) ||
          (lineChartChangeThresholdIndex >= 0 && lineChartChangeInputElement.type === "number")) &&
        (String(lineChartChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(lineChartChangeInputElement.value)))
      ) {
        syncInspector();
        return;
      }
      mutateDocument(lineChartChangeDraftDocument => {
        const lineChartChangeComponent = findComponent(
          lineChartChangeDraftDocument,
          lineChartChangeComponentId
        )?.component;
        if (!lineChartChangeComponent || lineChartChangeComponent.type !== "line-chart") {
          return;
        }
        lineChartChangeComponent.properties = {
          ...(lineChartChangeComponent.properties || {})
        };
        lineChartChangeComponent.position = {
          ...(lineChartChangeComponent.position || {})
        };
        lineChartChangeComponent.style = {
          ...(lineChartChangeComponent.style || {})
        };
        const lineChartChangeCanvasWidth = Number(lineChartChangeDraftDocument.canvas.width || 2778);
        const lineChartChangeCanvasHeight = Number(
          lineChartChangeDraftDocument.canvas.height || 1940
        );
        const lineChartChangeComponentWidth = Number(lineChartChangeComponent.position.width || 100);
        const lineChartChangeComponentHeight = Number(
          lineChartChangeComponent.position.height || 100
        );
        const lineChartChangeCenterX =
          Number(lineChartChangeComponent.position.x || 0) + lineChartChangeComponentWidth / 2;
        const lineChartChangeCenterY =
          Number(lineChartChangeComponent.position.y || 0) + lineChartChangeComponentHeight / 2;
        const lineChartChangeInputNumber = Number(lineChartChangeInputElement.value);
        if (lineChartChangeColorProperty) {
          lineChartChangeComponent.properties[lineChartChangeColorProperty] =
            lineChartChangeInputElement.value;
          if (
            lineChartChangeInputElement === lineChartThresholdModeSelectElement &&
            lineChartChangeInputElement.value === "manual" &&
            (!Array.isArray(lineChartChangeComponent.properties.thresholds) ||
              !lineChartChangeComponent.properties.thresholds.some(lineChartThresholdValueProbe =>
                Number.isFinite(Number(lineChartThresholdValueProbe?.value))
              ))
          ) {
            lineChartChangeComponent.properties.thresholds = lineChartThresholdInputs.map(
              lineChartThresholdSourceEntry => ({
                value: Number(lineChartThresholdSourceEntry.value.value),
                color: lineChartThresholdSourceEntry.color.value
              })
            );
          }
        } else if (lineChartChangePropertyConfig) {
          lineChartChangeComponent.properties[lineChartChangePropertyConfig.property] =
            clampNumber(
              lineChartChangeInputNumber,
              lineChartChangePropertyConfig.minimum,
              lineChartChangePropertyConfig.maximum
            ) / lineChartChangePropertyConfig.divisor;
        } else if (lineChartChangeThresholdIndex >= 0) {
          lineChartChangeComponent.properties.thresholdMode = "manual";
          lineChartChangeComponent.properties.thresholds = lineChartThresholdInputs.map(
            lineChartThresholdSourceRecord => ({
              value: Number(lineChartThresholdSourceRecord.value.value),
              color: lineChartThresholdSourceRecord.color.value
            })
          );
        } else if (lineChartChangeInputElement === lineChartLeftInputElement) {
          lineChartChangeComponent.position.x =
            (lineChartChangeCanvasWidth * clampNumber(lineChartChangeInputNumber, 0, 100)) / 100 -
            lineChartChangeComponentWidth / 2;
        } else if (lineChartChangeInputElement === lineChartTopInputElement) {
          lineChartChangeComponent.position.y =
            (lineChartChangeCanvasHeight * clampNumber(lineChartChangeInputNumber, 0, 100)) / 100 -
            lineChartChangeComponentHeight / 2;
        } else if (lineChartChangeInputElement === lineChartWidthInputElement) {
          lineChartChangeComponent.position.width =
            (lineChartChangeCanvasWidth * clampNumber(lineChartChangeInputNumber, 0.1, 100)) / 100;
          lineChartChangeComponent.position.x =
            lineChartChangeCenterX - lineChartChangeComponent.position.width / 2;
        } else if (lineChartChangeInputElement === lineChartHeightInputElement) {
          lineChartChangeComponent.position.height =
            (lineChartChangeCanvasHeight * clampNumber(lineChartChangeInputNumber, 0.1, 100)) / 100;
          lineChartChangeComponent.position.y =
            lineChartChangeCenterY - lineChartChangeComponent.position.height / 2;
        } else if (lineChartChangeInputElement === lineChartScaleInputElement) {
          lineChartChangeComponent.style.scale =
            clampNumber(lineChartChangeInputNumber, 1, 500) / 100;
        } else if (lineChartChangeInputElement === lineChartRotationInputElement) {
          setComponentsRotation(
            lineChartChangeDraftDocument,
            lineChartChangeComponentId,
            clampNumber(lineChartChangeInputNumber, -360, 360)
          );
        }
      });
    }
  });
  on(lineChartValueVisibleElement, "click", function onLineChartValueVisibleClick(lineChartValueVisibleEvent) {
    const lineChartValueVisibleButtonElement = lineChartValueVisibleEvent.target.closest(
      "[data-line-chart-value-visible]"
    );
    const lineChartValueVisibleComponentId = selectedComponentId;
    if (!!lineChartValueVisibleButtonElement && !!lineChartValueVisibleComponentId) {
      mutateDocument(lineChartValueVisibleDraftDocument => {
        const lineChartValueVisibleComponent = findComponent(
          lineChartValueVisibleDraftDocument,
          lineChartValueVisibleComponentId
        )?.component;
        if (
          !!lineChartValueVisibleComponent &&
          lineChartValueVisibleComponent.type === "line-chart"
        ) {
          lineChartValueVisibleComponent.properties = {
            ...(lineChartValueVisibleComponent.properties || {}),
            valueVisible: lineChartValueVisibleButtonElement.dataset.lineChartValueVisible === "on"
          };
        }
      });
    }
  });
  const panelFrameColorPropertiesByElement = new Map([
    [panelFrameMainColorInputElement, "mainColor"],
    [panelFrameSecondaryColorInputElement, "secondaryColor"],
    [panelFrameEdgeColorInputElement, "edgeColor"],
    [panelFrameGlowColorInputElement, "glowColor"]
  ]);
  const panelFramePropertyConfigsByElement = new Map([
    [
      panelFrameMainSizeInputElement,
      {
        property: "mainSize",
        minimum: 8,
        maximum: 500,
        divisor: 1
      }
    ],
    [
      panelFrameMainWeightInputElement,
      {
        property: "mainWeight",
        minimum: 0,
        maximum: 3,
        divisor: 1
      }
    ],
    [
      panelFrameMainOpacityInputElement,
      {
        property: "mainOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      panelFrameMainSpacingInputElement,
      {
        property: "mainSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1
      }
    ],
    [
      panelFrameMainLeftInputElement,
      {
        property: "mainTextLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      panelFrameMainTopInputElement,
      {
        property: "mainTextTop",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      panelFrameSecondarySizeInputElement,
      {
        property: "secondarySize",
        minimum: 6,
        maximum: 500,
        divisor: 1
      }
    ],
    [
      panelFrameSecondaryWeightInputElement,
      {
        property: "secondaryWeight",
        minimum: 0,
        maximum: 3,
        divisor: 1
      }
    ],
    [
      panelFrameSecondaryOpacityInputElement,
      {
        property: "secondaryOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      panelFrameSecondarySpacingInputElement,
      {
        property: "secondarySpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1
      }
    ],
    [
      panelFrameSecondaryLeftInputElement,
      {
        property: "secondaryTextLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      panelFrameSecondaryTopInputElement,
      {
        property: "secondaryTextTop",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      panelFrameEdgeWidthInputElement,
      {
        property: "edgeWidth",
        minimum: 0,
        maximum: 20,
        divisor: 1
      }
    ],
    [
      panelFrameEdgeOpacityInputElement,
      {
        property: "edgeOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      panelFrameRadiusInputElement,
      {
        property: "radius",
        minimum: 0,
        maximum: 50,
        divisor: 100
      }
    ],
    [
      panelFrameEdgeAngleInputElement,
      {
        property: "edgeAngle",
        minimum: 0,
        maximum: 360,
        divisor: 1
      }
    ],
    [
      panelFrameGlowStrengthInputElement,
      {
        property: "glowStrength",
        minimum: 0,
        maximum: 500,
        divisor: 100
      }
    ],
    [
      panelFrameGlowSizeInputElement,
      {
        property: "glowSize",
        minimum: 0,
        maximum: 300,
        divisor: 100
      }
    ],
    [
      panelFrameGlowAngleInputElement,
      {
        property: "glowAngle",
        minimum: 0,
        maximum: 360,
        divisor: 1
      }
    ]
  ]);
  const panelFrameTransformInputSet = new Set([
    panelFrameLeftInputElement,
    panelFrameTopInputElement,
    panelFrameWidthInputElement,
    panelFrameHeightInputElement,
    panelFrameScaleInputElement,
    panelFrameRotationInputElement
  ]);
  on(panelFrameInspectorFormElement, "input", function onPanelFrameInspectorFormInput(panelFrameInputEvent) {
    const panelFrameInputComponent = selectedComponent();
    if (!panelFrameInputComponent || panelFrameInputComponent.type !== "panel-frame") {
      return;
    }
    const panelFrameInputElement = panelFrameInputEvent.target;
    const panelFrameInputColorProperty =
      panelFrameColorPropertiesByElement.get(panelFrameInputElement);
    const panelFrameInputPropertyConfig =
      panelFramePropertyConfigsByElement.get(panelFrameInputElement);
    if (panelFrameInputColorProperty) {
      editorRenderer?.previewComponentProperties(panelFrameInputComponent.id, {
        [panelFrameInputColorProperty]: panelFrameInputElement.value
      });
      return;
    }
    if (panelFrameInputPropertyConfig) {
      if (
        String(panelFrameInputElement.value).trim() === "" ||
        !Number.isFinite(Number(panelFrameInputElement.value))
      ) {
        return;
      }
      const panelFrameInputPropertyValue = clampNumber(
        Number(panelFrameInputElement.value),
        panelFrameInputPropertyConfig.minimum,
        panelFrameInputPropertyConfig.maximum
      );
      editorRenderer?.previewComponentProperties(panelFrameInputComponent.id, {
        [panelFrameInputPropertyConfig.property]:
          panelFrameInputPropertyValue / panelFrameInputPropertyConfig.divisor
      });
      return;
    }
    if (
      !panelFrameTransformInputSet.has(panelFrameInputElement) ||
      String(panelFrameInputElement.value).trim() === "" ||
      !Number.isFinite(Number(panelFrameInputElement.value))
    ) {
      return;
    }
    const panelFrameTransformInputNumber = Number(panelFrameInputElement.value);
    const panelFrameTransformCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const panelFrameTransformCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const panelFrameTransformComponentWidth = Number(panelFrameInputComponent.position?.width || 100);
    const panelFrameTransformComponentHeight = Number(
      panelFrameInputComponent.position?.height || 100
    );
    const panelFrameTransformCenterX =
      Number(panelFrameInputComponent.position?.x || 0) + panelFrameTransformComponentWidth / 2;
    const panelFrameTransformCenterY =
      Number(panelFrameInputComponent.position?.y || 0) + panelFrameTransformComponentHeight / 2;
    if (panelFrameInputElement === panelFrameLeftInputElement) {
      editorRenderer?.previewComponentTransform(panelFrameInputComponent.id, {
        x:
          (panelFrameTransformCanvasWidth * clampNumber(panelFrameTransformInputNumber, 0, 100)) /
            100 -
          panelFrameTransformComponentWidth / 2
      });
    } else if (panelFrameInputElement === panelFrameTopInputElement) {
      editorRenderer?.previewComponentTransform(panelFrameInputComponent.id, {
        y:
          (panelFrameTransformCanvasHeight * clampNumber(panelFrameTransformInputNumber, 0, 100)) /
            100 -
          panelFrameTransformComponentHeight / 2
      });
    } else if (panelFrameInputElement === panelFrameWidthInputElement) {
      const panelFrameTransformWidthPx =
        (panelFrameTransformCanvasWidth * clampNumber(panelFrameTransformInputNumber, 0.1, 100)) /
        100;
      editorRenderer?.previewComponentTransform(panelFrameInputComponent.id, {
        x: panelFrameTransformCenterX - panelFrameTransformWidthPx / 2,
        width: panelFrameTransformWidthPx
      });
    } else if (panelFrameInputElement === panelFrameHeightInputElement) {
      const panelFrameTransformHeightPx =
        (panelFrameTransformCanvasHeight * clampNumber(panelFrameTransformInputNumber, 0.1, 100)) /
        100;
      editorRenderer?.previewComponentTransform(panelFrameInputComponent.id, {
        y: panelFrameTransformCenterY - panelFrameTransformHeightPx / 2,
        height: panelFrameTransformHeightPx
      });
    } else if (panelFrameInputElement === panelFrameScaleInputElement) {
      editorRenderer?.previewComponentTransform(panelFrameInputComponent.id, {
        scale: clampNumber(panelFrameTransformInputNumber, 1, 500) / 100
      });
    } else if (panelFrameInputElement === panelFrameRotationInputElement) {
      editorRenderer?.previewComponentTransform(panelFrameInputComponent.id, {
        rotation: clampNumber(panelFrameTransformInputNumber, -360, 360)
      });
    }
  });
  on(panelFrameInspectorFormElement, "change", function onPanelFrameInspectorFormChange(panelFrameChangeEvent) {
    const panelFrameChangeInputElement = panelFrameChangeEvent.target;
    const panelFrameChangeComponentId = selectedComponentId;
    if (!panelFrameChangeComponentId) {
      return;
    }
    const panelFrameChangeColorProperty = panelFrameColorPropertiesByElement.get(
      panelFrameChangeInputElement
    );
    const panelFrameChangePropertyConfig = panelFramePropertyConfigsByElement.get(
      panelFrameChangeInputElement
    );
    if (
      !!panelFrameChangeColorProperty ||
      !!panelFrameChangePropertyConfig ||
      !!panelFrameTransformInputSet.has(panelFrameChangeInputElement)
    ) {
      if (
        (panelFrameChangePropertyConfig ||
          panelFrameTransformInputSet.has(panelFrameChangeInputElement)) &&
        (String(panelFrameChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(panelFrameChangeInputElement.value)))
      ) {
        syncInspector();
        return;
      }
      mutateDocument(panelFrameChangeDraftDocument => {
        const panelFrameChangeComponent = findComponent(
          panelFrameChangeDraftDocument,
          panelFrameChangeComponentId
        )?.component;
        if (!panelFrameChangeComponent || panelFrameChangeComponent.type !== "panel-frame") {
          return;
        }
        panelFrameChangeComponent.properties = {
          ...(panelFrameChangeComponent.properties || {})
        };
        panelFrameChangeComponent.position = {
          ...(panelFrameChangeComponent.position || {})
        };
        panelFrameChangeComponent.style = {
          ...(panelFrameChangeComponent.style || {})
        };
        const panelFrameChangeCanvasWidth = Number(
          panelFrameChangeDraftDocument.canvas.width || 2778
        );
        const panelFrameChangeCanvasHeight = Number(
          panelFrameChangeDraftDocument.canvas.height || 1940
        );
        const panelFrameChangeComponentWidth = Number(
          panelFrameChangeComponent.position.width || 100
        );
        const panelFrameChangeComponentHeight = Number(
          panelFrameChangeComponent.position.height || 100
        );
        const panelFrameChangeCenterX =
          Number(panelFrameChangeComponent.position.x || 0) + panelFrameChangeComponentWidth / 2;
        const panelFrameChangeCenterY =
          Number(panelFrameChangeComponent.position.y || 0) + panelFrameChangeComponentHeight / 2;
        const panelFrameChangeInputNumber = Number(panelFrameChangeInputElement.value);
        if (panelFrameChangeColorProperty) {
          panelFrameChangeComponent.properties[panelFrameChangeColorProperty] =
            panelFrameChangeInputElement.value;
        } else if (panelFrameChangePropertyConfig) {
          panelFrameChangeComponent.properties[panelFrameChangePropertyConfig.property] =
            clampNumber(
              panelFrameChangeInputNumber,
              panelFrameChangePropertyConfig.minimum,
              panelFrameChangePropertyConfig.maximum
            ) / panelFrameChangePropertyConfig.divisor;
        } else if (panelFrameChangeInputElement === panelFrameLeftInputElement) {
          panelFrameChangeComponent.position.x =
            (panelFrameChangeCanvasWidth * clampNumber(panelFrameChangeInputNumber, 0, 100)) / 100 -
            panelFrameChangeComponentWidth / 2;
        } else if (panelFrameChangeInputElement === panelFrameTopInputElement) {
          panelFrameChangeComponent.position.y =
            (panelFrameChangeCanvasHeight * clampNumber(panelFrameChangeInputNumber, 0, 100)) / 100 -
            panelFrameChangeComponentHeight / 2;
        } else if (panelFrameChangeInputElement === panelFrameWidthInputElement) {
          panelFrameChangeComponent.position.width =
            (panelFrameChangeCanvasWidth * clampNumber(panelFrameChangeInputNumber, 0.1, 100)) / 100;
          panelFrameChangeComponent.position.x =
            panelFrameChangeCenterX - panelFrameChangeComponent.position.width / 2;
        } else if (panelFrameChangeInputElement === panelFrameHeightInputElement) {
          panelFrameChangeComponent.position.height =
            (panelFrameChangeCanvasHeight * clampNumber(panelFrameChangeInputNumber, 0.1, 100)) / 100;
          panelFrameChangeComponent.position.y =
            panelFrameChangeCenterY - panelFrameChangeComponent.position.height / 2;
        } else if (panelFrameChangeInputElement === panelFrameScaleInputElement) {
          panelFrameChangeComponent.style.scale =
            clampNumber(panelFrameChangeInputNumber, 1, 500) / 100;
        } else if (panelFrameChangeInputElement === panelFrameRotationInputElement) {
          setComponentsRotation(
            panelFrameChangeDraftDocument,
            panelFrameChangeComponentId,
            clampNumber(panelFrameChangeInputNumber, -360, 360)
          );
        }
      });
    }
  });
  for (const [panelFrameVisibilityButton, panelFrameVisibilityProperty] of [
    [panelFrameMainVisibleButtonElement, "mainTextVisible"],
    [panelFrameSecondaryVisibleButtonElement, "secondaryTextVisible"],
    [panelFrameEdgeVisibleButtonElement, "edgeVisible"],
    [panelFrameGlowVisibleButtonElement, "glowVisible"]
  ]) {
    on(panelFrameVisibilityButton, "click", function onPanelFrameVisibilityButtonClick() {
      const panelFrameVisibilityComponentId = selectedComponentId;
      if (panelFrameVisibilityComponentId) {
        mutateDocument(panelFrameVisibilityDraftDocument => {
          const panelFrameVisibilityComponent = findComponent(
            panelFrameVisibilityDraftDocument,
            panelFrameVisibilityComponentId
          )?.component;
          if (
            !!panelFrameVisibilityComponent &&
            panelFrameVisibilityComponent.type === "panel-frame"
          ) {
            panelFrameVisibilityComponent.properties = {
              ...(panelFrameVisibilityComponent.properties || {}),
              [panelFrameVisibilityProperty]:
                panelFrameVisibilityComponent.properties?.[panelFrameVisibilityProperty] === false
            };
          }
        });
      }
    });
  }
  const navigationColorPropertiesByElement = new Map([
    [navigationMainTextInputElement, "mainText"],
    [navigationSecondaryTextInputElement, "secondaryText"],
    [navigationMainColorInputElement, "mainColor"],
    [navigationSecondaryColorInputElement, "secondaryColor"],
    [navigationIconColorInputElement, "iconColor"],
    [navigationFrameColorInputElement, "frameColor"],
    [navigationGlowColorInputElement, "glowColor"]
  ]);
  const navigationPropertyConfigsByElement = new Map([
    [
      navigationMainSizeInputElement,
      {
        property: "mainSize",
        minimum: 1,
        maximum: 500,
        divisor: 1
      }
    ],
    [
      navigationSecondarySizeInputElement,
      {
        property: "secondarySize",
        minimum: 1,
        maximum: 500,
        divisor: 1
      }
    ],
    [
      navigationMainWeightInputElement,
      {
        property: "mainWeight",
        minimum: 0,
        maximum: 3,
        divisor: 1
      }
    ],
    [
      navigationSecondaryWeightInputElement,
      {
        property: "secondaryWeight",
        minimum: 0,
        maximum: 3,
        divisor: 1
      }
    ],
    [
      navigationMainSpacingInputElement,
      {
        property: "mainSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1
      }
    ],
    [
      navigationSecondarySpacingInputElement,
      {
        property: "secondarySpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1
      }
    ],
    [
      navigationMainTextLeftInputElement,
      {
        property: "mainTextLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      navigationMainTextTopInputElement,
      {
        property: "mainTextTop",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      navigationSecondaryTextLeftInputElement,
      {
        property: "secondaryTextLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      navigationSecondaryTextTopInputElement,
      {
        property: "secondaryTextTop",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      navigationTextIdleOpacityInputElement,
      {
        property: "textIdleOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      navigationTextActiveOpacityInputElement,
      {
        property: "textActiveOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      navigationIconSizeInputElement,
      {
        property: "iconSize",
        minimum: 1,
        maximum: 500,
        divisor: 1
      }
    ],
    [
      navigationIconLeftInputElement,
      {
        property: "iconLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      navigationIconTopInputElement,
      {
        property: "iconTop",
        minimum: -100,
        maximum: 200,
        divisor: 1
      }
    ],
    [
      navigationIconIdleOpacityInputElement,
      {
        property: "iconIdleOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      navigationIconActiveOpacityInputElement,
      {
        property: "iconActiveOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      navigationFrameWidthInputElement,
      {
        property: "frameWidth",
        minimum: 0,
        maximum: 20,
        divisor: 1
      }
    ],
    [
      navigationFrameIdleOpacityInputElement,
      {
        property: "frameIdleOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      navigationFrameActiveOpacityInputElement,
      {
        property: "frameActiveOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100
      }
    ],
    [
      navigationRadiusInputElement,
      {
        property: "radius",
        minimum: 0,
        maximum: 50,
        divisor: 100
      }
    ],
    [
      navigationFrameAngleInputElement,
      {
        property: "frameAngle",
        minimum: 0,
        maximum: 360,
        divisor: 1
      }
    ],
    [
      navigationGlowAngleInputElement,
      {
        property: "glowAngle",
        minimum: 0,
        maximum: 360,
        divisor: 1
      }
    ],
    [
      navigationGlowIdleStrengthInputElement,
      {
        property: "glowIdleStrength",
        minimum: 0,
        maximum: 500,
        divisor: 100
      }
    ],
    [
      navigationGlowIdleSizeInputElement,
      {
        property: "glowIdleSize",
        minimum: 0,
        maximum: 300,
        divisor: 100
      }
    ],
    [
      navigationGlowActiveStrengthInputElement,
      {
        property: "glowActiveStrength",
        minimum: 0,
        maximum: 500,
        divisor: 100
      }
    ],
    [
      navigationGlowActiveSizeInputElement,
      {
        property: "glowActiveSize",
        minimum: 0,
        maximum: 300,
        divisor: 100
      }
    ]
  ]);
  const navigationToggleStateByElement = new Map([
    [navigationTextIdleOpacityInputElement, "off"],
    [navigationIconIdleOpacityInputElement, "off"],
    [navigationFrameIdleOpacityInputElement, "off"],
    [navigationGlowIdleStrengthInputElement, "off"],
    [navigationGlowIdleSizeInputElement, "off"],
    [navigationTextActiveOpacityInputElement, "on"],
    [navigationIconActiveOpacityInputElement, "on"],
    [navigationFrameActiveOpacityInputElement, "on"],
    [navigationGlowActiveStrengthInputElement, "on"],
    [navigationGlowActiveSizeInputElement, "on"]
  ]);
  /**
   * 把导航按钮检查器里的「预览状态」分段控件切到指定档位（on / off）。
   *
   * @param {string} navigationPreviewState 目标档位；传空值时不做任何切换。
   */
  function setNavigationPreviewState(navigationPreviewState) {
    if (navigationPreviewState) {
      for (const navigationPreviewButton of navigationPreviewStateElement.querySelectorAll(
        "[data-navigation-preview]"
      )) {
        navigationPreviewButton.classList.toggle(
          "active",
          navigationPreviewButton.dataset.navigationPreview === navigationPreviewState
        );
      }
    }
  }
  /**
   * 应用导航按钮的预览状态：写入按组件 ID 索引的临时状态表并通知渲染器，若该组件正处于选中态则同步顶部按钮的 active 样式。
   */
  function applyNavigationPreviewState(navigationPreviewComponentId, navigationPreviewStateValue) {
    if (!navigationPreviewComponentId) {
      return;
    }
    const navigationNormalizedPreviewState = ["on", "off"].includes(navigationPreviewStateValue)
      ? navigationPreviewStateValue
      : "auto";
    if (navigationNormalizedPreviewState === "auto") {
      navigationPreviewStateByComponentId.delete(navigationPreviewComponentId);
    } else {
      navigationPreviewStateByComponentId.set(
        navigationPreviewComponentId,
        navigationNormalizedPreviewState
      );
    }
    editorRenderer?.setComponentPreviewState(
      navigationPreviewComponentId,
      navigationNormalizedPreviewState
    );
    if (navigationPreviewComponentId === selectedComponentId) {
      setNavigationPreviewState(navigationNormalizedPreviewState);
    }
  }
  /**
   * 从点击的分段控件反查它代表的预览档位，并把该档位应用到当前选中的导航按钮。
   *
   * @returns {?string} 应用的档位文案；元素无法识别或选中项不是导航按钮时返回 null。
   */
  function syncNavigationPreviewFromElement(navigationPreviewInputElement) {
    const navigationToggleState = navigationToggleStateByElement.get(navigationPreviewInputElement);
    const navigationPreviewComponent = selectedComponent();
    if (!navigationToggleState || navigationPreviewComponent?.type !== "navigation-button") {
      return null;
    } else {
      applyNavigationPreviewState(navigationPreviewComponent.id, navigationToggleState);
      return navigationToggleState;
    }
  }
  const navigationTransformInputSet = new Set([
    navigationLeftInputElement,
    navigationTopInputElement,
    navigationWidthInputElement,
    navigationHeightInputElement,
    navigationScaleInputElement,
    navigationRotationInputElement
  ]);
  /**
   * 把导航按钮检查器的某个输入框映射到它负责的样式属性名：颜色/数值配置表优先，随后是宽高等几何输入；
   * 返回空串表示该输入框不参与样式变更（调用方据此跳过）。
   */
  function navigationPropertyNameFromElement(navigationPropertyInputElement) {
    const navigationColorPropertyName = navigationColorPropertiesByElement.get(
      navigationPropertyInputElement
    );
    if (
      navigationColorPropertyName &&
      navigationStylePropertyDefinitions[navigationColorPropertyName]
    ) {
      return navigationColorPropertyName;
    }
    const navigationConfigPropertyName = navigationPropertyConfigsByElement.get(
      navigationPropertyInputElement
    )?.property;
    if (
      navigationConfigPropertyName &&
      navigationStylePropertyDefinitions[navigationConfigPropertyName]
    ) {
      return navigationConfigPropertyName;
    } else if (navigationPropertyInputElement === navigationWidthInputElement) {
      return "width";
    } else if (navigationPropertyInputElement === navigationHeightInputElement) {
      return "height";
    } else if (navigationPropertyInputElement === navigationScaleInputElement) {
      return "scale";
    } else if (navigationPropertyInputElement === navigationRotationInputElement) {
      return "rotation";
    } else {
      return "";
    }
  }
  on(navigationInspectorFormElement, "input", function onNavigationInspectorFormInput(navigationInputEvent) {
    const navigationInputComponent = selectedComponent();
    if (!navigationInputComponent || navigationInputComponent.type !== "navigation-button") {
      return;
    }
    const navigationInputElement = navigationInputEvent.target;
    const navigationInputColorProperty =
      navigationColorPropertiesByElement.get(navigationInputElement);
    if (navigationInputColorProperty) {
      if (!textInputConfigsByElement.has(navigationInputElement)) {
        editorRenderer?.previewComponentProperties(navigationInputComponent.id, {
          [navigationInputColorProperty]: navigationInputElement.value
        });
      }
      return;
    }
    const navigationInputPropertyConfig =
      navigationPropertyConfigsByElement.get(navigationInputElement);
    if (navigationInputPropertyConfig) {
      if (
        String(navigationInputElement.value).trim() === "" ||
        !Number.isFinite(Number(navigationInputElement.value))
      ) {
        return;
      }
      const navigationInputPropertyValue = clampNumber(
        Number(navigationInputElement.value),
        navigationInputPropertyConfig.minimum,
        navigationInputPropertyConfig.maximum
      );
      syncNavigationPreviewFromElement(navigationInputElement);
      editorRenderer?.previewComponentProperties(navigationInputComponent.id, {
        [navigationInputPropertyConfig.property]:
          navigationInputPropertyValue / navigationInputPropertyConfig.divisor
      });
      return;
    }
    if (
      !navigationTransformInputSet.has(navigationInputElement) ||
      String(navigationInputElement.value).trim() === "" ||
      !Number.isFinite(Number(navigationInputElement.value))
    ) {
      return;
    }
    const navigationTransformInputNumber = Number(navigationInputElement.value);
    const navigationTransformCanvasWidth = Number(activeProject.document.canvas.width || 2778);
    const navigationTransformCanvasHeight = Number(activeProject.document.canvas.height || 1940);
    const navigationTransformComponentWidth = Number(navigationInputComponent.position?.width || 100);
    const navigationTransformComponentHeight = Number(
      navigationInputComponent.position?.height || 100
    );
    if (navigationInputElement === navigationLeftInputElement) {
      const navigationLeftPercent = clampNumber(navigationTransformInputNumber, 0, 100);
      editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
        x:
          (navigationTransformCanvasWidth * navigationLeftPercent) / 100 -
          navigationTransformComponentWidth / 2
      });
    } else if (navigationInputElement === navigationTopInputElement) {
      const navigationTopPercent = clampNumber(navigationTransformInputNumber, 0, 100);
      editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
        y:
          (navigationTransformCanvasHeight * navigationTopPercent) / 100 -
          navigationTransformComponentHeight / 2
      });
    } else if (navigationInputElement === navigationWidthInputElement) {
      const navigationWidthPercent = clampNumber(navigationTransformInputNumber, 0.1, 100);
      const navigationPreviewWidthPx =
        (navigationTransformCanvasWidth * navigationWidthPercent) / 100;
      const navigationCenterX =
        Number(navigationInputComponent.position?.x || 0) + navigationTransformComponentWidth / 2;
      editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
        x: navigationCenterX - navigationPreviewWidthPx / 2,
        width: navigationPreviewWidthPx
      });
    } else if (navigationInputElement === navigationHeightInputElement) {
      const navigationHeightPercent = clampNumber(navigationTransformInputNumber, 0.1, 100);
      const navigationPreviewHeightPx =
        (navigationTransformCanvasHeight * navigationHeightPercent) / 100;
      const navigationCenterY =
        Number(navigationInputComponent.position?.y || 0) + navigationTransformComponentHeight / 2;
      editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
        y: navigationCenterY - navigationPreviewHeightPx / 2,
        height: navigationPreviewHeightPx
      });
    } else if (navigationInputElement === navigationScaleInputElement) {
      const navigationScalePercent = clampNumber(navigationTransformInputNumber, 1, 500);
      editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
        scale: navigationScalePercent / 100
      });
    } else if (navigationInputElement === navigationRotationInputElement) {
      const navigationRotationDegrees = clampNumber(navigationTransformInputNumber, -360, 360);
      editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
        rotation: navigationRotationDegrees
      });
    }
  });
  on(navigationInspectorFormElement, "focusin", function onNavigationInspectorFormFocusin(navigationFocusEvent) {
    syncNavigationPreviewFromElement(navigationFocusEvent.target);
  });
  on(navigationInspectorFormElement, "change", function onNavigationInspectorFormChange(navigationChangeEvent) {
    const navigationChangeInputElement = navigationChangeEvent.target;
    const navigationChangeComponentId = selectedComponentId;
    if (!navigationChangeComponentId) {
      return;
    }
    const navigationChangeColorProperty = navigationColorPropertiesByElement.get(
      navigationChangeInputElement
    );
    const navigationChangePropertyConfig = navigationPropertyConfigsByElement.get(
      navigationChangeInputElement
    );
    const navigationChangeToggleState = navigationToggleStateByElement.get(
      navigationChangeInputElement
    );
    const navigationChangePropertyName = navigationPropertyNameFromElement(
      navigationChangeInputElement
    );
    if (
      navigationChangeInputElement === navigationLabelTextInputElement ||
      !!navigationChangeColorProperty ||
      !!navigationChangePropertyConfig ||
      !!navigationTransformInputSet.has(navigationChangeInputElement)
    ) {
      if (
        (navigationChangePropertyConfig ||
          navigationTransformInputSet.has(navigationChangeInputElement)) &&
        (String(navigationChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(navigationChangeInputElement.value)))
      ) {
        syncInspector();
        return;
      }
      if (navigationChangeToggleState) {
        syncNavigationPreviewFromElement(navigationChangeInputElement);
      }
      mutateDocument(navigationChangeDraftDocument => {
        const navigationChangeComponent = findComponent(
          navigationChangeDraftDocument,
          navigationChangeComponentId
        )?.component;
        if (!navigationChangeComponent || navigationChangeComponent.type !== "navigation-button") {
          return;
        }
        navigationChangeComponent.properties = {
          ...(navigationChangeComponent.properties || {})
        };
        navigationChangeComponent.position = {
          ...(navigationChangeComponent.position || {})
        };
        navigationChangeComponent.style = {
          ...(navigationChangeComponent.style || {})
        };
        navigationChangeComponent.actions = {
          ...(navigationChangeComponent.actions || {})
        };
        const navigationPreviousActionValue = navigationChangePropertyName
          ? getNavigationStyleValue(navigationChangeComponent, navigationChangePropertyName)
          : undefined;
        const navigationChangeCanvasWidth = Number(
          navigationChangeDraftDocument.canvas.width || 2778
        );
        const navigationChangeCanvasHeight = Number(
          navigationChangeDraftDocument.canvas.height || 1940
        );
        const navigationChangeInputNumber = Number(navigationChangeInputElement.value);
        if (navigationChangeInputElement === navigationLabelTextInputElement) {
          navigationChangeComponent.properties.label = navigationChangeInputElement.value.trim();
        } else if (navigationChangeColorProperty) {
          navigationChangeComponent.properties[navigationChangeColorProperty] =
            navigationChangeInputElement.value;
        } else if (navigationChangePropertyConfig) {
          navigationChangeComponent.properties[navigationChangePropertyConfig.property] =
            clampNumber(
              navigationChangeInputNumber,
              navigationChangePropertyConfig.minimum,
              navigationChangePropertyConfig.maximum
            ) / navigationChangePropertyConfig.divisor;
        } else if (navigationChangeInputElement === navigationLeftInputElement) {
          navigationChangeComponent.position.x =
            (navigationChangeCanvasWidth * clampNumber(navigationChangeInputNumber, 0, 100)) / 100 -
            Number(navigationChangeComponent.position.width || 100) / 2;
        } else if (navigationChangeInputElement === navigationTopInputElement) {
          navigationChangeComponent.position.y =
            (navigationChangeCanvasHeight * clampNumber(navigationChangeInputNumber, 0, 100)) / 100 -
            Number(navigationChangeComponent.position.height || 100) / 2;
        } else if (navigationChangeInputElement === navigationWidthInputElement) {
          const navigationChangeWidthPx =
            (navigationChangeCanvasWidth * clampNumber(navigationChangeInputNumber, 0.1, 100)) / 100;
          const navigationChangeCenterX =
            Number(navigationChangeComponent.position.x || 0) +
            Number(navigationChangeComponent.position.width || 100) / 2;
          navigationChangeComponent.position.x =
            navigationChangeCenterX - navigationChangeWidthPx / 2;
          navigationChangeComponent.position.width = navigationChangeWidthPx;
        } else if (navigationChangeInputElement === navigationHeightInputElement) {
          const navigationChangeHeightPx =
            (navigationChangeCanvasHeight * clampNumber(navigationChangeInputNumber, 0.1, 100)) / 100;
          const navigationChangeCenterY =
            Number(navigationChangeComponent.position.y || 0) +
            Number(navigationChangeComponent.position.height || 100) / 2;
          navigationChangeComponent.position.y =
            navigationChangeCenterY - navigationChangeHeightPx / 2;
          navigationChangeComponent.position.height = navigationChangeHeightPx;
        } else if (navigationChangeInputElement === navigationScaleInputElement) {
          navigationChangeComponent.style.scale =
            clampNumber(navigationChangeInputNumber, 1, 500) / 100;
        } else if (navigationChangeInputElement === navigationRotationInputElement) {
          setComponentsRotation(
            navigationChangeDraftDocument,
            navigationChangeComponentId,
            clampNumber(navigationChangeInputNumber, -360, 360)
          );
        }
        if (navigationChangePropertyName) {
          rememberNavigationStyleChange(
            navigationChangeComponentId,
            navigationChangePropertyName,
            navigationPreviousActionValue,
            getNavigationStyleValue(navigationChangeComponent, navigationChangePropertyName)
          );
        }
      });
    }
  });
  const navigationVisibilityPropertiesByButton = new Map([
    [navigationMainVisibleButtonElement, "mainTextVisible"],
    [navigationSecondaryVisibleButtonElement, "secondaryTextVisible"],
    [navigationIconVisibleButtonElement, "iconVisible"],
    [navigationFrameVisibleButtonElement, "frameVisible"],
    [navigationGlowVisibleButtonElement, "glowVisible"]
  ]);
  for (const [
    navigationVisibilityButton,
    navigationVisibilityProperty
  ] of navigationVisibilityPropertiesByButton) {
    on(navigationVisibilityButton, "click", function onNavigationVisibilityButtonClick() {
      const navigationVisibilityComponentId = selectedComponentId;
      if (navigationVisibilityComponentId) {
        mutateDocument(navigationVisibilityDraftDocument => {
          const navigationVisibilityComponent = findComponent(
            navigationVisibilityDraftDocument,
            navigationVisibilityComponentId
          )?.component;
          if (
            !navigationVisibilityComponent ||
            navigationVisibilityComponent.type !== "navigation-button"
          ) {
            return;
          }
          const navigationPreviousVisibility = getNavigationStyleValue(
            navigationVisibilityComponent,
            navigationVisibilityProperty
          );
          navigationVisibilityComponent.properties = {
            ...(navigationVisibilityComponent.properties || {}),
            [navigationVisibilityProperty]:
              navigationVisibilityComponent.properties?.[navigationVisibilityProperty] === false
          };
          rememberNavigationStyleChange(
            navigationVisibilityComponentId,
            navigationVisibilityProperty,
            navigationPreviousVisibility,
            getNavigationStyleValue(navigationVisibilityComponent, navigationVisibilityProperty)
          );
        });
      }
    });
  }
  on(navigationPreviewStateElement, "click", function onNavigationPreviewStateClick(navigationPreviewClickEvent) {
    const navigationPreviewButtonElement = navigationPreviewClickEvent.target.closest(
      "[data-navigation-preview]"
    );
    const navigationPreviewClickComponentId = selectedComponentId;
    if (!navigationPreviewButtonElement || !navigationPreviewClickComponentId) {
      return;
    }
    const navigationPreviewDatasetState = ["off", "on"].includes(
      navigationPreviewButtonElement.dataset.navigationPreview
    )
      ? navigationPreviewButtonElement.dataset.navigationPreview
      : "auto";
    applyNavigationPreviewState(navigationPreviewClickComponentId, navigationPreviewDatasetState);
  });

  on(navigationApplyStyleButtonElement, "click", openNavigationStyleApplyDialog);
  on(panelFrameApplyStyleButtonElement, "click", openPanelFrameStyleApplyDialog);
  on(cameraApplyStyleButtonElement, "click", openCameraStyleApplyDialog);
  on(titleButtonApplyStyleButtonElement, "click", openTitleButtonStyleApplyDialog);
  on(lineChartApplyStyleButtonElement, "click", openLineChartStyleApplyDialog);
  on(iconButtonEffectApplyStyleButtonElement, "click",
    openIconButtonEffectStyleApplyDialog
  );
  on(iconButtonApplyStyleButtonElement, "click", openIconButtonStyleApplyDialog);
  on(airConditionerApplyStyleButtonElement, "click", openAirConditionerStyleApplyDialog);
  on(navigationStyleApplyCloseButtonElement, "click", function onNavigationStyleApplyCloseButtonClick() { return navigationStyleApplyDialogElement.close(); }
  );
  on(navigationStyleApplyCancelButtonElement, "click", function onNavigationStyleApplyCancelButtonClick() { return navigationStyleApplyDialogElement.close(); }
  );
  on(navigationStyleApplyDialogElement, "click", function onNavigationStyleApplyDialogClick(styleDialogClickEvent) {
    if (styleDialogClickEvent.target === navigationStyleApplyDialogElement) {
      navigationStyleApplyDialogElement.close();
    }
  });
  on(navigationStyleApplyDialogElement, "close", function onNavigationStyleApplyDialogClose() {
    appliedStyleRecord = null;
  });
  on(navigationStyleApplyConfirmButtonElement, "click", function onNavigationStyleApplyConfirmButtonClick() {
    const styleSourceComponentId = appliedStyleRecord?.sourceId;
    const styleComponentType = appliedStyleRecord?.type;
    const selectedStylePropertyKeys = [
      ...navigationStyleApplyPropertiesElement.querySelectorAll(
        "[data-navigation-style-property]:checked"
      )
    ].map(stylePropertyCheckbox => stylePropertyCheckbox.dataset.navigationStyleProperty);
    const selectedTargetComponentIds = [
      ...navigationStyleApplyTargetsElement.querySelectorAll("[data-navigation-target-id]:checked")
    ].map(styleTargetCheckbox => styleTargetCheckbox.dataset.navigationTargetId);
    if (
      !styleSourceComponentId ||
      !selectedStylePropertyKeys.length ||
      !selectedTargetComponentIds.length
    ) {
      const styleTypeLabel =
        styleComponentType === "panel-frame"
          ? "底图框"
          : styleComponentType === "camera"
            ? "摄像头实时预览"
            : styleComponentType === "title-button"
              ? "标题按钮"
              : styleComponentType === "air-conditioner"
                ? "空调"
                : styleComponentType === "line-chart"
                  ? "折线图"
                  : styleComponentType === "icon-button-effect"
                    ? "图标按钮（效果）"
                    : styleComponentType === "icon-button"
                      ? "图标按钮"
                      : styleComponentType === "device-button"
                        ? "设备按钮"
                        : styleComponentType === "presence-sensor"
                          ? "传感器"
                          : "导航按钮";
      navigationStyleApplyMessageElement.textContent =
        "请至少选择一项修改和一个目标" + styleTypeLabel + "。";
      navigationStyleApplyMessageElement.hidden = false;
      return;
    }
    navigationStyleApplyDialogElement.close();
    mutateDocument(styleApplyDraftDocument => {
      const styleSourceComponentDraft = findComponent(
        styleApplyDraftDocument,
        styleSourceComponentId
      )?.component;
      if (!!styleSourceComponentDraft && styleSourceComponentDraft.type === styleComponentType) {
        for (const styleTargetComponentId of selectedTargetComponentIds) {
          const styleTargetComponentDraft = findComponent(
            styleApplyDraftDocument,
            styleTargetComponentId
          )?.component;
          if (
            !!styleTargetComponentDraft &&
            styleTargetComponentDraft.type === styleComponentType &&
            (styleComponentType !== "presence-sensor" ||
              resolveSensorKind(styleTargetComponentDraft) ===
                resolveSensorKind(styleSourceComponentDraft))
          ) {
            for (const appliedStylePropertyKey of selectedStylePropertyKeys) {
              if (styleComponentType === "panel-frame") {
                applyPanelFrameStyleChange(
                  styleSourceComponentDraft,
                  styleTargetComponentDraft,
                  appliedStylePropertyKey
                );
              } else if (styleComponentType === "camera") {
                applyCameraStyleChange(
                  styleSourceComponentDraft,
                  styleTargetComponentDraft,
                  appliedStylePropertyKey
                );
              } else if (styleComponentType === "title-button") {
                applyTitleButtonStyleChange(
                  styleSourceComponentDraft,
                  styleTargetComponentDraft,
                  appliedStylePropertyKey
                );
              } else if (styleComponentType === "line-chart") {
                applyLineChartStyleChange(
                  styleSourceComponentDraft,
                  styleTargetComponentDraft,
                  appliedStylePropertyKey
                );
              } else if (styleComponentType === "icon-button-effect") {
                applyIconButtonEffectStyleChange(
                  styleSourceComponentDraft,
                  styleTargetComponentDraft,
                  appliedStylePropertyKey
                );
              } else if (styleComponentType === "air-conditioner") {
                applyAirConditionerStyleChange(
                  styleSourceComponentDraft,
                  styleTargetComponentDraft,
                  appliedStylePropertyKey
                );
              } else if (
                ["icon-button", "device-button", "presence-sensor"].includes(styleComponentType)
              ) {
                applyIconButtonStyleChange(
                  styleSourceComponentDraft,
                  styleTargetComponentDraft,
                  appliedStylePropertyKey
                );
              } else {
                applyStyleChangeToComponent(
                  styleSourceComponentDraft,
                  styleTargetComponentDraft,
                  appliedStylePropertyKey
                );
              }
            }
          }
        }
      }
    }).then(() => {
      const styleApplyButton =
        styleComponentType === "panel-frame"
          ? panelFrameApplyStyleButtonElement
          : styleComponentType === "camera"
            ? cameraApplyStyleButtonElement
            : styleComponentType === "title-button"
              ? titleButtonApplyStyleButtonElement
              : styleComponentType === "air-conditioner"
                ? airConditionerApplyStyleButtonElement
                : styleComponentType === "line-chart"
                  ? lineChartApplyStyleButtonElement
                  : styleComponentType === "icon-button-effect"
                    ? iconButtonEffectApplyStyleButtonElement
                    : ["icon-button", "device-button", "presence-sensor"].includes(styleComponentType)
                      ? iconButtonApplyStyleButtonElement
                      : navigationApplyStyleButtonElement;
      if (styleComponentType === "panel-frame") {
        window.clearTimeout(panelFrameApplyFeedbackTimeoutId);
      } else if (styleComponentType === "camera") {
        window.clearTimeout(cameraApplyFeedbackTimeoutId);
      } else if (styleComponentType === "title-button") {
        window.clearTimeout(titleButtonApplyFeedbackTimeoutId);
      } else if (styleComponentType === "air-conditioner") {
        window.clearTimeout(airConditionerApplyFeedbackTimeoutId);
      } else if (styleComponentType === "line-chart") {
        window.clearTimeout(lineChartApplyFeedbackTimeoutId);
      } else if (styleComponentType === "icon-button-effect") {
        window.clearTimeout(effectApplyFeedbackTimeoutId);
      } else if (["icon-button", "device-button", "presence-sensor"].includes(styleComponentType)) {
        window.clearTimeout(deviceButtonApplyFeedbackTimeoutId);
      } else {
        window.clearTimeout(navigationApplyFeedbackTimeoutId);
      }
      styleApplyButton.classList.add("applied");
      const styleFeedbackTimeoutId = window.setTimeout(() => {
        styleApplyButton.classList.remove("applied");
        if (selectedComponentId === styleSourceComponentId) {
          syncInspector();
        }
      }, 1800);
      if (styleComponentType === "panel-frame") {
        panelFrameApplyFeedbackTimeoutId = styleFeedbackTimeoutId;
      } else if (styleComponentType === "camera") {
        cameraApplyFeedbackTimeoutId = styleFeedbackTimeoutId;
      } else if (styleComponentType === "title-button") {
        titleButtonApplyFeedbackTimeoutId = styleFeedbackTimeoutId;
      } else if (styleComponentType === "air-conditioner") {
        airConditionerApplyFeedbackTimeoutId = styleFeedbackTimeoutId;
      } else if (styleComponentType === "line-chart") {
        lineChartApplyFeedbackTimeoutId = styleFeedbackTimeoutId;
      } else if (styleComponentType === "icon-button-effect") {
        effectApplyFeedbackTimeoutId = styleFeedbackTimeoutId;
      } else if (["icon-button", "device-button", "presence-sensor"].includes(styleComponentType)) {
        deviceButtonApplyFeedbackTimeoutId = styleFeedbackTimeoutId;
      } else {
        navigationApplyFeedbackTimeoutId = styleFeedbackTimeoutId;
      }
    });
  });
  on(navigationIconButtonElement, "click", function onNavigationIconButtonClick() {
    const isNavigationIconMenuHidden = navigationIconMenuElement.hidden;
    closeAllDropdownMenus(isNavigationIconMenuHidden ? "navigation-icon" : null);
    navigationIconMenuElement.hidden = !isNavigationIconMenuHidden;
    navigationIconButtonElement.setAttribute("aria-expanded", String(isNavigationIconMenuHidden));
    if (isNavigationIconMenuHidden) {
      loadNavigationIconOptions(navigationIconSearchInputElement.value)
        .then(() => {
          positionNavigationIconMenu();
          navigationIconSearchInputElement.focus({
            preventScroll: true
          });
        })
        .catch(handleOperationError);
    }
  });
  on(navigationIconCopyButtonElement, "click", async function onNavigationIconCopyButtonClick() {
    const navigationSelectedIconName = selectedComponent()?.properties?.icon || "";
    if (navigationSelectedIconName) {
      try {
        await copyTextToClipboard(navigationSelectedIconName);
        window.clearTimeout(navigationIconCopiedTimeoutId);
        navigationIconCopyButtonElement.classList.add("copied");
        navigationIconCopiedTimeoutId = window.setTimeout(
          () => navigationIconCopyButtonElement.classList.remove("copied"),
          1200
        );
      } catch (navigationIconCopyError) {
        handleOperationError(navigationIconCopyError);
      }
    }
  });
  on(navigationIconSearchInputElement, "input", function onNavigationIconSearchInputInput() {
    window.clearTimeout(navigationIconSearchDebounceTimeoutId);
    navigationIconSearchDebounceTimeoutId = window.setTimeout(() => {
      loadNavigationIconOptions(navigationIconSearchInputElement.value).catch(handleOperationError);
    }, 160);
  });
  on(navigationIconOptionsElement, "click", function onNavigationIconOptionsClick(navigationIconOptionClickEvent) {
    const navigationIconOptionElement =
      navigationIconOptionClickEvent.target.closest("[data-icon-name]");
    const navigationIconComponentId = selectedComponentId;
    if (!navigationIconOptionElement || !navigationIconComponentId) {
      return;
    }
    const navigationIconDatasetName = navigationIconOptionElement.dataset.iconName;
    closeAllDropdownMenus();
    mutateDocument(navigationIconDraftDocument => {
      const navigationIconComponent = findComponent(
        navigationIconDraftDocument,
        navigationIconComponentId
      )?.component;
      if (!navigationIconComponent || navigationIconComponent.type !== "navigation-button") {
        return;
      }
      const navigationIconPreviousValue = getNavigationStyleValue(navigationIconComponent, "icon");
      const navigationIconVisiblePreviousValue = getNavigationStyleValue(
        navigationIconComponent,
        "iconVisible"
      );
      navigationIconComponent.properties = {
        ...(navigationIconComponent.properties || {}),
        icon: navigationIconDatasetName,
        iconVisible: !!navigationIconDatasetName
      };
      rememberNavigationStyleChange(
        navigationIconComponentId,
        "icon",
        navigationIconPreviousValue,
        getNavigationStyleValue(navigationIconComponent, "icon")
      );
      rememberNavigationStyleChange(
        navigationIconComponentId,
        "iconVisible",
        navigationIconVisiblePreviousValue,
        getNavigationStyleValue(navigationIconComponent, "iconVisible")
      );
    });
  });
}

/**
 * 素材、撤销与预览。
 *
 * 素材上传与效果素材、撤销/重做、编辑器预览开关。
 */
function bindAssetSection() {
  const on = sections.section("asset");
  on(imageAssetUploadButtonElement, "click", function onImageAssetUploadButtonClick() { return imageAssetUploadInputElement.click(); });
  on(iconButtonEffectAssetUploadButtonElement, "click", function onIconButtonEffectAssetUploadButtonClick() { return iconButtonEffectAssetUploadInputElement.click(); }
  );
  on(imageAssetUploadInputElement, "change", async function onImageAssetUploadInputChange() {
    await uploadAssetFiles(imageAssetUploadInputElement.files, "image");
    imageAssetUploadInputElement.value = "";
  });
  on(iconButtonEffectAssetUploadInputElement, "change", async function onIconButtonEffectAssetUploadInputChange() {
    await uploadAssetFiles(iconButtonEffectAssetUploadInputElement.files, "ibe");
    iconButtonEffectAssetUploadInputElement.value = "";
  });
  for (const assetOptionsElement of [imageAssetOptionsElement, iconButtonEffectAssetOptionsElement]) {
    on(assetOptionsElement, "click", function onAssetOptionsClick(assetOptionsClickEvent) {
      const deleteUserAssetElement = assetOptionsClickEvent.target.closest(
        "[data-delete-user-asset]"
      );
      if (deleteUserAssetElement) {
        assetOptionsClickEvent.preventDefault();
        assetOptionsClickEvent.stopPropagation();
        requestDeleteAsset(deleteUserAssetElement.dataset.deleteUserAsset);
      }
    });
  }
  on(deleteAssetCloseButtonElement, "click", function onDeleteAssetCloseButtonClick() { return deleteAssetDialogElement.close(); });
  on(deleteAssetCancelButtonElement, "click", function onDeleteAssetCancelButtonClick() { return deleteAssetDialogElement.close(); });
  on(deleteAssetDialogElement, "click", function onDeleteAssetDialogClick(deleteAssetDialogClickEvent) {
    if (deleteAssetDialogClickEvent.target === deleteAssetDialogElement) {
      deleteAssetDialogElement.close();
    }
  });
  on(deleteAssetConfirmButtonElement, "click", async function onDeleteAssetConfirmButtonClick() {
    const deleteAssetRequestId = String(pendingDeleteAssetId || "").replace(/^user:/, "");
    if (/^[0-9a-f]{32}$/.test(deleteAssetRequestId)) {
      deleteAssetConfirmButtonElement.disabled = true;
      try {
        await requestJson("/assets/user/" + deleteAssetRequestId, {
          method: "DELETE"
        });
        pendingDeleteAssetId = null;
        deleteAssetDialogElement.close();
        await reloadAssetCatalog();
      } catch (deleteAssetError) {
        if (deleteAssetError?.code === "ASSET_IN_USE") {
          handleOperationError(
            new Error("这张图片仍被户型图绘制或仪表盘使用，请先移除引用后再删除。")
          );
        } else {
          handleOperationError(deleteAssetError);
        }
      } finally {
        deleteAssetConfirmButtonElement.disabled = false;
      }
    }
  });
  on(deleteAssetFolderCloseButtonElement, "click", function onDeleteAssetFolderCloseButtonClick() { return deleteAssetFolderDialogElement.close(); }
  );
  on(deleteAssetFolderCancelButtonElement, "click", function onDeleteAssetFolderCancelButtonClick() { return deleteAssetFolderDialogElement.close(); }
  );
  on(deleteAssetFolderDialogElement, "click", function onDeleteAssetFolderDialogClick(deleteAssetFolderClickEvent) {
    if (deleteAssetFolderClickEvent.target === deleteAssetFolderDialogElement) {
      deleteAssetFolderDialogElement.close();
    }
  });
  on(deleteAssetFolderDialogElement, "close", function onDeleteAssetFolderDialogClose() {
    if (!deleteAssetFolderConfirmButtonElement.disabled) {
      pendingDeleteAssetFolder = null;
    }
  });
  on(deleteAssetFolderConfirmButtonElement, "click", async function onDeleteAssetFolderConfirmButtonClick() {
    const deleteAssetFolderRequest = pendingDeleteAssetFolder;
    if (deleteAssetFolderRequest?.folderName) {
      deleteAssetFolderConfirmButtonElement.disabled = true;
      try {
        await requestJson("/studio3d/exports", {
          method: "DELETE",
          headers: {
            "X-Export-Folder": encodeURIComponent(deleteAssetFolderRequest.folderName)
          }
        });
        pendingDeleteAssetFolder = null;
        deleteAssetFolderDialogElement.close();
        await reloadAssetCatalog({
          refreshInspector: false
        });
        refreshAssetPickerViews();
      } catch (deleteAssetFolderError) {
        if (deleteAssetFolderError?.code === "STUDIO3D_EXPORT_IN_USE") {
          handleOperationError(
            new Error("这个文件夹中的图片仍被仪表盘、弹窗或户型图绘制使用，请先移除引用后再删除。")
          );
        } else {
          handleOperationError(deleteAssetFolderError);
        }
      } finally {
        deleteAssetFolderConfirmButtonElement.disabled = false;
      }
    }
  });
  on(imageAssetButtonElement, "click", async function onImageAssetButtonClick() {
    const isImageAssetMenuHidden = imageAssetMenuElement.hidden;
    closeAllDropdownMenus(isImageAssetMenuHidden ? "asset" : null);
    imageAssetMenuElement.hidden = !isImageAssetMenuHidden;
    imageAssetButtonElement.setAttribute("aria-expanded", String(isImageAssetMenuHidden));
    if (isImageAssetMenuHidden) {
      try {
        await reloadAssetCatalog({
          refreshInspector: false
        });
        syncAssetFolderOptions("image");
      } catch (imageAssetCatalogError) {
        handleOperationError(imageAssetCatalogError);
      }
      renderImageAssetOptions(imageAssetSearchInputElement.value);
      positionImageAssetMenu();
      window.requestAnimationFrame(() => {
        positionImageAssetMenu();
        imageAssetSearchInputElement.focus({
          preventScroll: true
        });
      });
    }
  });
  on(imageAssetFolderSelectElement, "change", function onImageAssetFolderSelectChange() {
    imageAssetFolder = imageAssetFolderSelectElement.value;
    imageAssetSearchInputElement.value = "";
    renderImageAssetOptions();
  });
  on(imageAssetSearchInputElement, "input", function onImageAssetSearchInputInput() { return renderImageAssetOptions(imageAssetSearchInputElement.value); }
  );
  on(imageAssetOptionsElement, "pointerover", function onImageAssetOptionsPointerover(imageAssetPointerOverEvent) {
    const imageAssetHoverElement = imageAssetPointerOverEvent.target.closest("[data-asset-id]");
    if (
      !imageAssetHoverElement ||
      imageAssetHoverElement.contains(imageAssetPointerOverEvent.relatedTarget)
    ) {
      return;
    }
    const hoveredAsset = findAssetById(imageAssetHoverElement.dataset.assetId);
    scheduleAssetPreview(hoveredAsset, imageAssetHoverElement);
  });
  on(imageAssetOptionsElement, "pointerleave", hideAssetLargePreview);
  on(imageAssetOptionsElement, "scroll", hideAssetLargePreview);
  on(imageAssetOptionsElement, "click", async function onImageAssetOptionsClick(imageAssetClickEvent) {
    const imageAssetElement = imageAssetClickEvent.target.closest("[data-asset-id]");
    if (!imageAssetElement || !selectedComponentId) {
      return;
    }
    const imageAssetComponentId = selectedComponentId;
    const imageAssetId = imageAssetElement.dataset.assetId;
    hideAssetLargePreview();
    closeAllDropdownMenus();
    if (!imageAssetId) {
      mutateDocument(imageAssetDraftDocument => {
        const imageAssetComponent = findComponent(
          imageAssetDraftDocument,
          imageAssetComponentId
        )?.component;
        if (!!imageAssetComponent && imageAssetComponent.type === "image") {
          imageAssetComponent.properties = {
            ...(imageAssetComponent.properties || {}),
            fit: "contain"
          };
          delete imageAssetComponent.properties.assetId;
          delete imageAssetComponent.properties.naturalWidth;
          delete imageAssetComponent.properties.naturalHeight;
        }
      });
      return;
    }
    const imageAssetRecord = findAssetById(imageAssetId);
    if (imageAssetRecord) {
      try {
        const imageAssetSize = await measureAssetImageSize(imageAssetRecord);
        mutateDocument(imageAssetSizeDraftDocument => {
          const imageAssetSizeComponent = findComponent(
            imageAssetSizeDraftDocument,
            imageAssetComponentId
          )?.component;
          if (!!imageAssetSizeComponent && imageAssetSizeComponent.type === "image") {
            applyAssetNaturalSize(imageAssetSizeComponent, imageAssetId, imageAssetSize);
          }
        });
      } catch (imageAssetMeasureError) {
        handleOperationError(imageAssetMeasureError);
      }
    }
  });
  on(iconButtonEffectAssetButtonElement, "click", async function onIconButtonEffectAssetButtonClick() {
    const isEffectAssetMenuHidden = iconButtonEffectAssetMenuElement.hidden;
    closeAllDropdownMenus(isEffectAssetMenuHidden ? "ibe-asset" : null);
    iconButtonEffectAssetMenuElement.hidden = !isEffectAssetMenuHidden;
    iconButtonEffectAssetButtonElement.setAttribute("aria-expanded", String(isEffectAssetMenuHidden));
    if (isEffectAssetMenuHidden) {
      try {
        await reloadAssetCatalog({
          refreshInspector: false
        });
        syncAssetFolderOptions("ibe");
      } catch (effectAssetCatalogError) {
        handleOperationError(effectAssetCatalogError);
      }
      renderEffectAssetOptions(iconButtonEffectAssetSearchInputElement.value);
      positionEffectAssetMenu();
      window.requestAnimationFrame(() => {
        positionEffectAssetMenu();
        iconButtonEffectAssetSearchInputElement.focus({
          preventScroll: true
        });
      });
    }
  });
  on(iconButtonEffectAssetFolderSelectElement, "change", function onIconButtonEffectAssetFolderSelectChange() {
    effectAssetFolder = iconButtonEffectAssetFolderSelectElement.value;
    iconButtonEffectAssetSearchInputElement.value = "";
    renderEffectAssetOptions();
  });
  on(iconButtonEffectAssetSearchInputElement, "input", function onIconButtonEffectAssetSearchInputInput() { return renderEffectAssetOptions(iconButtonEffectAssetSearchInputElement.value); }
  );
  on(iconButtonEffectAssetOptionsElement, "pointerover", function onIconButtonEffectAssetOptionsPointerover(effectAssetPointerOverEvent) {
    const effectAssetHoverElement = effectAssetPointerOverEvent.target.closest("[data-asset-id]");
    if (
      !!effectAssetHoverElement &&
      !effectAssetHoverElement.contains(effectAssetPointerOverEvent.relatedTarget)
    ) {
      scheduleAssetPreview(
        findAssetById(effectAssetHoverElement.dataset.assetId),
        effectAssetHoverElement,
        iconButtonEffectAssetMenuElement
      );
    }
  });
  on(iconButtonEffectAssetOptionsElement, "pointerleave", hideAssetLargePreview);
  on(iconButtonEffectAssetOptionsElement, "scroll", hideAssetLargePreview);
  on(iconButtonEffectAssetOptionsElement, "click", async function onIconButtonEffectAssetOptionsClick(effectAssetClickEvent) {
    const effectAssetElement = effectAssetClickEvent.target.closest("[data-asset-id]");
    const effectAssetComponentId = selectedComponentId;
    if (!effectAssetElement || !effectAssetComponentId) {
      return;
    }
    const effectAssetId = effectAssetElement.dataset.assetId;
    hideAssetLargePreview();
    closeAllDropdownMenus();
    const effectAssetRecord = effectAssetId ? findAssetById(effectAssetId) : null;
    let effectAssetSize = null;
    if (effectAssetRecord) {
      try {
        effectAssetSize = await measureAssetImageSize(effectAssetRecord);
      } catch (effectAssetMeasureError) {
        handleOperationError(effectAssetMeasureError);
        return;
      }
    }
    mutateDocument(effectAssetDraftDocument => {
      const effectAssetComponent = findComponent(
        effectAssetDraftDocument,
        effectAssetComponentId
      )?.component;
      if (!!effectAssetComponent && effectAssetComponent.type === "icon-button-effect") {
        effectAssetComponent.properties = {
          ...(effectAssetComponent.properties || {})
        };
        if (effectAssetId && effectAssetSize) {
          effectAssetComponent.properties.effectAssetId = effectAssetId;
          effectAssetComponent.properties.effectNaturalWidth = effectAssetSize.width;
          effectAssetComponent.properties.effectNaturalHeight = effectAssetSize.height;
          delete effectAssetComponent.properties.effectWidth;
          delete effectAssetComponent.properties.effectHeight;
        } else {
          delete effectAssetComponent.properties.effectAssetId;
          delete effectAssetComponent.properties.effectNaturalWidth;
          delete effectAssetComponent.properties.effectNaturalHeight;
        }
      }
    });
  });
  on(undoButtonElement, "click", function onUndoButtonClick() { return applyHistoryStep("undo"); });
  on(redoButtonElement, "click", function onRedoButtonClick() { return applyHistoryStep("redo"); });
  on(recoveryRestoreButtonElement, "click", function onRecoveryRestoreButtonClick() {
    if (!recoverySnapshot || !activeProject) {
      recoveryDialogElement.close();
      return;
    }
    const recoveredSnapshot = recoverySnapshot;
    recoverySnapshot = null;
    activeProject = {
      ...activeProject,
      document: clone(recoveredSnapshot.document)
    };
    selectedComponentId = findComponent(activeProject.document, recoveredSnapshot.selectedComponentId)
      ? recoveredSnapshot.selectedComponentId
      : null;
    const recoveredComponentIds = Array.isArray(recoveredSnapshot.selectedComponentIds)
      ? recoveredSnapshot.selectedComponentIds.filter(recoveredComponentId =>
          findComponent(activeProject.document, recoveredComponentId)
        )
      : [];
    selectedComponentIds = new Set(
      recoveredComponentIds.length
        ? recoveredComponentIds
        : selectedComponentId
          ? [selectedComponentId]
          : []
    );
    selectionAnchorComponentId = selectedComponentId;
    // 现在的快照不带历史栈（见 scheduleRecoverySnapshot），所以这里通常拿到 undefined
    // 并落成空栈；老快照（带 undo / redo）也仍然按原样恢复。
    historyState.undo = Array.isArray(recoveredSnapshot.undo) ? clone(recoveredSnapshot.undo) : [];
    historyState.redo = Array.isArray(recoveredSnapshot.redo) ? clone(recoveredSnapshot.redo) : [];
    recoveryDialogElement.close();
    renderEditorWorkspace(recoveredSnapshot.selectedPath || null);
    refreshDirtyState();
    syncHistoryButtons();
  });
  on(recoveryDiscardButtonElement, "click", function onRecoveryDiscardButtonClick() {
    discardRecoverySnapshot(activeProject?.projectId);
    recoverySnapshot = null;
    recoveryDialogElement.close();
    refreshDirtyState();
    syncHistoryButtons();
  });
  on(recoveryDialogElement, "cancel", function onRecoveryDialogCancel(recoveryCancelEvent) { return recoveryCancelEvent.preventDefault(); }
  );
  on(errorDialogCloseButtonElement, "click", function onErrorDialogCloseButtonClick() { return errorDialogElement.close(); });
  on(errorDialogConfirmButtonElement, "click", function onErrorDialogConfirmButtonClick() { return errorDialogElement.close(); });
  on(errorDialogElement, "click", function onErrorDialogClick(errorDialogClickEvent) {
    if (errorDialogClickEvent.target === errorDialogElement) {
      errorDialogElement.close();
    }
  });
  on(showSharedComponentsButtonElement, "click", function onShowSharedComponentsButtonClick() { return setComponentScope("shared"); });
  on(showPageComponentsButtonElement, "click", function onShowPageComponentsButtonClick() { return setComponentScope("page"); });
  on(addComponentButtonElement, "click", function onAddComponentButtonClick() {
    if (!addComponentButtonElement.disabled) {
      renderComponentTemplates();
      componentTemplateDialogElement.showModal();
    }
  });
  on(componentTemplateCloseButtonElement, "click", function onComponentTemplateCloseButtonClick() { return componentTemplateDialogElement.close(); }
  );
  on(componentTemplateDialogElement, "click", function onComponentTemplateDialogClick(templateDialogClickEvent) {
    if (templateDialogClickEvent.target === componentTemplateDialogElement) {
      componentTemplateDialogElement.close();
    }
  });
  on(componentTemplateListElement, "click", function onComponentTemplateListClick(templateListClickEvent) {
    const templateItemElement = templateListClickEvent.target.closest("[data-template-id]");
    const templatePagePath = pageSelectElement.value;
    if (!templateItemElement || templateItemElement.disabled || !templatePagePath) {
      return;
    }
    const currentComponentScope = componentScope;
    const activeGroupEntry = activeGroupId
      ? findComponent(activeProject?.document, activeGroupId)
      : null;
    const activeGroupChildComponent =
      activeGroupEntry?.component?.type === "group" ? activeGroupEntry.component : null;
    const templateTargetScope = activeGroupChildComponent
      ? activeGroupEntry.scope
      : currentComponentScope;
    const newComponentId = newId("component");
    componentTemplateDialogElement.close();
    selectedComponentId = newComponentId;
    selectedComponentIds = new Set([newComponentId]);
    selectionAnchorComponentId = newComponentId;
    const createComponentPromise = mutateDocument(templateDraftDocument => {
      const templateTargetPage = templateDraftDocument.pages.find(
        templatePageMatch => templatePageMatch.path === templatePagePath
      );
      if (!templateTargetPage) {
        throw new Error("当前页面不存在。");
      }
      const draftGroupEntry = activeGroupChildComponent
        ? findComponent(templateDraftDocument, activeGroupChildComponent.id)
        : null;
      const draftGroupComponent =
        draftGroupEntry?.component?.type === "group" ? draftGroupEntry.component : null;
      const targetComponentCollection =
        currentComponentScope === "shared"
          ? templateDraftDocument.sharedComponents
          : templateTargetPage.components;
      const insertionCollection = draftGroupComponent
        ? (draftGroupComponent.children ||= [])
        : targetComponentCollection;
      const templateLabel =
        templateItemElement.dataset.templateId === "navigation-button"
          ? "导航按钮"
          : templateItemElement.dataset.templateId === "interaction3d"
            ? "3D 交互"
            : templateItemElement.dataset.templateId === "floorplan-auto-diagram"
              ? "户型图自动导图"
              : templateItemElement.dataset.templateId === "icon-button-effect"
                ? "图标按钮（效果）"
                : templateItemElement.dataset.templateId === "title-button"
                  ? "标题按钮"
                  : templateItemElement.dataset.templateId === "light-statistics"
                    ? "数量统计"
                    : templateItemElement.dataset.templateId === "icon-button"
                      ? "图标按钮"
                      : templateItemElement.dataset.templateId === "device-button"
                        ? "设备按钮"
                        : templateItemElement.dataset.templateId === "presence-sensor"
                          ? "传感器"
                          : templateItemElement.dataset.templateId === "air-conditioner"
                            ? "空调 / 浴霸"
                            : templateItemElement.dataset.templateId === "vacuum-map"
                              ? "扫地机器人实时地图"
                              : templateItemElement.dataset.templateId === "camera"
                                ? "摄像头实时预览"
                                : templateItemElement.dataset.templateId === "time"
                                  ? "时间"
                                  : templateItemElement.dataset.templateId === "date"
                                    ? "日期"
                                    : templateItemElement.dataset.templateId === "weather"
                                      ? "天气"
                                      : templateItemElement.dataset.templateId === "line-chart"
                                        ? "折线图"
                                        : templateItemElement.dataset.templateId === "panel-frame"
                                          ? "底图框"
                                          : "图片";
      const templateInstanceName = nextTemplateInstanceName(insertionCollection, templateLabel);
      const createdComponent = createComponentFromTemplate(templateItemElement.dataset.templateId, {
        id: newComponentId,
        instanceName: templateInstanceName,
        canvas: templateDraftDocument.canvas
      });
      if (draftGroupComponent) {
        const groupWidth = Number(draftGroupComponent.position?.width || 100);
        const groupHeight = Number(draftGroupComponent.position?.height || 100);
        const createdWidth = Number(createdComponent.position?.width || 100);
        const createdHeight = Number(createdComponent.position?.height || 100);
        createdComponent.position = {
          ...(createdComponent.position || {}),
          x: (groupWidth - createdWidth) / 2,
          y: (groupHeight - createdHeight) / 2
        };
      }
      insertionCollection.unshift(createdComponent);
      applyCollectionLayerOrder(insertionCollection);
      if (templateTargetScope === "shared" && !draftGroupComponent) {
        for (const sharedReferencePage of templateDraftDocument.pages) {
          sharedReferencePage.sharedComponentIds = [
            createdComponent.id,
            ...(sharedReferencePage.sharedComponentIds || []).filter(
              sharedReferenceId => sharedReferenceId !== createdComponent.id
            )
          ];
        }
        syncSharedComponentReferenceOrder(templateDraftDocument);
      }
    }, templatePagePath);
    if (templateItemElement.dataset.templateId === "floorplan-auto-diagram") {
      createComponentPromise.then(() =>
        openAutoDiagramDialog(newComponentId, {
          cancelRemovesComponent: true
        })
      );
    }
  });
  on(showEditorPreviewButtonElement, "click", function onShowEditorPreviewButtonClick() { return setEditorMode("edit"); });
  on(showDashboardPreviewButtonElement, "click", function onShowDashboardPreviewButtonClick() { return setEditorMode("dashboard"); });
  on(soundToggleButtonElement, "click", async function onSoundToggleButtonClick() {
    if (!activeProject) {
      return;
    }
    const soundToggleDocument = clone(activeProject.document);
    soundToggleDocument.soundEnabled = activeProject.document.soundEnabled === false;
    try {
      await applyDocumentChange(soundToggleDocument);
      await saveDraft();
    } catch (soundToggleError) {
      handleOperationError(soundToggleError);
    }
  });
  on(openHomeAssistantButtonElement, "click", openHomeAssistantDashboard);
  on(showPageEditorButtonElement, "click", function onShowPageEditorButtonClick() { return setEditorMode("edit"); });
  on(showPopupEditorButtonElement, "click", function onShowPopupEditorButtonClick() { return setEditorMode("popup"); });
  on(projectSelectElement, "change", function onProjectSelectChange() {
    closeProjectActionsMenu();
    if (
      hasUnsavedChanges &&
      activeProject &&
      projectSelectElement.value !== activeProject.projectId
    ) {
      projectSelectElement.value = activeProject.projectId;
      syncCustomSelect(projectSelectElement);
      guardUnsavedChanges();
      return;
    }
    if (projectSelectElement.value) {
      openProjectDraft(projectSelectElement.value).catch(handleOperationError);
    }
  });
  on(pageSelectElement, "change", function onPageSelectChange() {
    closePageActionsMenu();
    syncDefaultPageAction();
    activeGroupId = null;
    if (editorMode === "popup") {
      setEditorMode("edit");
    }
    editorRenderer?.navigate(pageSelectElement.value);
    dashboardPreviewRenderer?.navigate(pageSelectElement.value);
    const selectedPageComponent = findComponent(activeProject?.document, selectedComponentId);
    if (
      selectedPageComponent?.scope === "page" &&
      selectedPageComponent.page?.path !== pageSelectElement.value
    ) {
      selectComponent(null);
    }
    renderComponentLists();
    syncInspector();
  });
  /**
   * 打开组合弹窗的「新建 / 重命名」对话框。两种用途共用同一个表单，靠 popupDialogMode 区分：重命名时回填现有名称，
   * 新建时预置「新建组合弹窗」并全选，便于直接改写。
   */
  function openPopupNameDialog(popupNameMode) {
    popupDialogMode = popupNameMode;
    const popupBeingRenamed = findCustomPopup(activeProject?.document, selectedPopupId);
    popupNameDialogTitleElement.textContent =
      popupNameMode === "rename" ? "重命名组合弹窗" : "新建组合弹窗";
    popupNameFormElement.elements.name.value =
      popupNameMode === "rename" ? popupBeingRenamed?.name || "" : "新建组合弹窗";
    popupNameDialogElement.showModal();
    popupNameFormElement.elements.name.select();
  }
  on(popupNewButtonElement, "click", function onPopupNewButtonClick() { return openPopupNameDialog("create"); });
  on(popupNameCloseButtonElement, "click", function onPopupNameCloseButtonClick() { return popupNameDialogElement.close(); });
  on(popupNameCancelButtonElement, "click", function onPopupNameCancelButtonClick() { return popupNameDialogElement.close(); });
  on(popupNameFormElement, "submit", function onPopupNameFormSubmit(popupNameSubmitEvent) {
    popupNameSubmitEvent.preventDefault();
    const popupNameInput = popupNameFormElement.elements.name.value.trim();
    if (!popupNameInput) {
      return;
    }
    const popupId = popupDialogMode === "create" ? newId("custom-popup") : selectedPopupId;
    popupNameDialogElement.close();
    mutateDocument(popupNameDraftDocument => {
      popupNameDraftDocument.customPopups = popupNameDraftDocument.customPopups || [];
      if (popupDialogMode === "rename") {
        const popupToRename = popupNameDraftDocument.customPopups.find(
          popupMatch => popupMatch.id === selectedPopupId
        );
        if (popupToRename) {
          popupToRename.name = popupNameInput;
        }
        return;
      }
      popupNameDraftDocument.customPopups.push({
        id: popupId,
        name: popupNameInput,
        templateRef: {
          templateId: "custom-popup",
          version: 1
        },
        layout: {
          columns: 3
        },
        modules: []
      });
      selectedPopupId = popupId;
      setEditorMode("popup");
    });
  });
  on(popupSelectElement, "change", function onPopupSelectChange() {
    closePopupActionsMenu();
    selectedPopupId = popupSelectElement.value || null;
    setEditorMode("popup");
  });
  on(popupListElement, "click", function onPopupListClick(popupListClickEvent) {
    const popupListItemElement = popupListClickEvent.target.closest("[data-popup-id]");
    if (popupListItemElement) {
      closePopupActionsMenu();
      selectedPopupId = popupListItemElement.dataset.popupId;
      popupSelectElement.value = selectedPopupId;
      renderPopupList(activeProject.document, selectedPopupId);
      setEditorMode("popup");
    }
  });
  on(popupListElement, "contextmenu", function onPopupListContextmenu(popupListContextMenuEvent) {
    const popupContextItemElement = popupListContextMenuEvent.target.closest("[data-popup-id]");
    if (!popupContextItemElement) {
      return;
    }
    popupListContextMenuEvent.preventDefault();
    selectedPopupId = popupContextItemElement.dataset.popupId;
    popupSelectElement.value = selectedPopupId;
    renderPopupList(activeProject.document, selectedPopupId);
    setEditorMode("popup");
    moduleDialogPopupId = selectedPopupId;
    popupActionsMenuElement.hidden = false;
    popupActionsMenuElement.style.left = "0px";
    popupActionsMenuElement.style.top = "0px";
    const popupMenuRect = popupActionsMenuElement.getBoundingClientRect();
    popupActionsMenuElement.style.left =
      clampNumber(popupListContextMenuEvent.clientX, 8, window.innerWidth - popupMenuRect.width - 8) +
      "px";
    popupActionsMenuElement.style.top =
      clampNumber(
        popupListContextMenuEvent.clientY,
        8,
        window.innerHeight - popupMenuRect.height - 8
      ) + "px";
  });
  on(popupActionsButtonElement, "click", function onPopupActionsButtonClick() {
    if (popupActionsButtonElement.disabled) {
      return;
    }
    const isPopupActionsMenuHidden = popupActionsMenuElement.hidden;
    closeProjectActionsMenu();
    closePageActionsMenu();
    popupActionsMenuElement.hidden = !isPopupActionsMenuHidden;
    popupActionsButtonElement.setAttribute("aria-expanded", String(isPopupActionsMenuHidden));
  });
  on(popupActionsMenuElement, "click", function onPopupActionsMenuClick(popupActionsClickEvent) {
    const popupActionName =
      popupActionsClickEvent.target.closest("[data-popup-action]")?.dataset.popupAction;
    const popupActionTargetId = moduleDialogPopupId || selectedPopupId;
    closePopupActionsMenu();
    if (!!popupActionName && !!popupActionTargetId) {
      if (popupActionName === "rename") {
        openPopupNameDialog("rename");
        return;
      }
      if (popupActionName === "duplicate") {
        const duplicatedPopupId = newId("custom-popup");
        selectedPopupId = duplicatedPopupId;
        mutateDocument(popupDuplicateDraftDocument => {
          /**
           * 草稿文档里被复制的原弹窗；逐层深拷贝并重新生成各模块 ID，
           * 否则副本与原弹窗会指向同一个模块对象。
           */
          const popupToDuplicate = (popupDuplicateDraftDocument.customPopups || []).find(
            popupDuplicateMatch => popupDuplicateMatch.id === popupActionTargetId
          );
          if (!popupToDuplicate) {
            return;
          }
          const duplicatedPopup = clone(popupToDuplicate);
          duplicatedPopup.id = duplicatedPopupId;
          duplicatedPopup.name = popupToDuplicate.name + "_副本";
          duplicatedPopup.modules = (duplicatedPopup.modules || []).map(popupModuleCopy => ({
            ...popupModuleCopy,
            id: newId("popup-module")
          }));
          popupDuplicateDraftDocument.customPopups.push(duplicatedPopup);
        });
        return;
      }
      if (popupActionName === "delete") {
        /**
         * 待删除的弹窗记录（读当前文档即可，确认框里还要展示它的名字）。
         *
         * @type {?object}
         */
        const popupToDelete = (activeProject?.document?.customPopups || []).find(
          popupDeleteCandidate => popupDeleteCandidate.id === popupActionTargetId
        );
        if (!popupToDelete) {
          return;
        }
        popupModuleDraft = popupActionTargetId;
        deletePopupNameElement.textContent = popupToDelete.name;
        // 影响面必须在 showModal 之前填好：确认框是模态的，弹出来之后前端没机会再改内容。
        renderPopupDeleteUsage(activeProject?.document, popupToDelete.id);
        deletePopupDialogElement.showModal();
      }
    }
  });
}

/**
 * 弹层模块编辑。
 *
 * 弹层模块的关闭与选择。
 */
function bindPopupModuleSection() {
  const on = sections.section("popup-module");
  on(deletePopupCloseButtonElement, "click", closeDeletePopupDialog);
  on(deletePopupCancelButtonElement, "click", closeDeletePopupDialog);
  on(deletePopupDialogElement, "close", function onDeletePopupDialogClose() {
    popupModuleDraft = null;
    // 清掉上一次的影响面：确认框是同一个 DOM，留着旧清单会让下一次删除显示上一个弹窗的控件。
    deletePopupUsageSummaryElement.textContent = "";
    deletePopupUsageListElement.replaceChildren();
  });
  on(deletePopupConfirmButtonElement, "click", function onDeletePopupConfirmButtonClick() {
    const popupIdToDelete = popupModuleDraft;
    if (popupIdToDelete) {
      popupModuleDraft = null;
      deletePopupDialogElement.close();
      deletePopupConfirmButtonElement.disabled = true;
      mutateDocument(popupDeleteDraftDocument => {
        popupDeleteDraftDocument.customPopups = (popupDeleteDraftDocument.customPopups || []).filter(
          popupIdMatch => popupIdMatch.id !== popupIdToDelete
        );
        /**
         * 递归清理组件树中所有指向待删弹窗的 more-info 动作。一个弹窗可能被多个组件（含子组件）的 more-info 动作引用，
         * 删掉弹窗后这些动作会变成悬空引用、点击无反应，因此统一重置为 type:"none"；沿 children 递归，保证深层布局里的引用也一起清掉。
         */
        const clearPopupModuleReferences = componentNodes => {
          for (const componentNode of componentNodes || []) {
            for (const [componentActionKey, componentActionValue] of Object.entries(
              componentNode.actions || {}
            )) {
              if (
                componentActionValue.type === "more-info" &&
                componentActionValue.data?.popupSource === "custom" &&
                componentActionValue.data?.popupId === popupIdToDelete
              ) {
                componentNode.actions[componentActionKey] = {
                  type: "none",
                  data: {}
                };
              }
            }
            clearPopupModuleReferences(componentNode.children);
          }
        };
        clearPopupModuleReferences(popupDeleteDraftDocument.sharedComponents);
        for (const popupPage of popupDeleteDraftDocument.pages || []) {
          clearPopupModuleReferences(popupPage.components);
        }
        selectedPopupId = popupDeleteDraftDocument.customPopups[0]?.id || null;
        if (!selectedPopupId) {
          setEditorMode("edit");
        }
      }).finally(() => {
        deletePopupConfirmButtonElement.disabled = false;
      });
    }
  });
  on(popupModuleCloseButtonElement, "click", function onPopupModuleCloseButtonClick() {
    closePopupModuleEntityMenu();
    popupModuleDialogElement.close();
  });
  on(popupModuleCancelButtonElement, "click", function onPopupModuleCancelButtonClick() {
    closePopupModuleEntityMenu();
    popupModuleDialogElement.close();
  });
  on(popupModuleEntityButtonElement, "click", function onPopupModuleEntityButtonClick() {
    const isPopupModuleEntityMenuHidden = popupModuleEntityMenuElement.hidden;
    popupModuleEntityMenuElement.hidden = !isPopupModuleEntityMenuHidden;
    popupModuleEntityButtonElement.setAttribute(
      "aria-expanded",
      String(isPopupModuleEntityMenuHidden)
    );
    if (isPopupModuleEntityMenuHidden) {
      renderPopupModuleEntityOptions();
      window.requestAnimationFrame(() =>
        popupModuleEntitySearchInputElement.focus({
          preventScroll: true
        })
      );
    }
  });
  on(popupModuleEntitySearchInputElement, "input", function onPopupModuleEntitySearchInputInput() { return renderPopupModuleEntityOptions(); }
  );
  on(popupModuleEntityOptionsElement, "click", function onPopupModuleEntityOptionsClick(popupModuleEntityClickEvent) {
    const popupModuleEntityElement = popupModuleEntityClickEvent.target.closest(
      "[data-popup-module-entity-id]"
    );
    if (popupModuleEntityElement) {
      popupModuleFormElement.elements.entityId.value =
        popupModuleEntityElement.dataset.popupModuleEntityId;
      syncPopupModuleEntityButton();
      closePopupModuleEntityMenu();
    }
  });
  on(popupModuleClimateDeviceTypeElement, "click", function onPopupModuleClimateDeviceTypeClick(climateDeviceTypeClickEvent) {
    const climateDeviceTypeElement = climateDeviceTypeClickEvent.target.closest(
      "[data-popup-module-device-type]"
    );
    if (!!climateDeviceTypeElement && popupModuleFormElement.elements.type.value === "climate") {
      syncPopupModuleDeviceType(climateDeviceTypeElement.dataset.popupModuleDeviceType);
    }
  });
  on(popupModuleFormElement.elements.type, "change", function onTargetChange() {
    syncPopupModuleDeviceType();
    popupModuleEntityOptionsElement.replaceChildren();
  });
  on(popupModuleFormElement, "submit", function onPopupModuleFormSubmit(popupModuleSubmitEvent) {
    popupModuleSubmitEvent.preventDefault();
    const popupModuleTargetPopupId = selectedPopupId;
    const popupModuleType = popupModuleFormElement.elements.type.value;
    const popupModuleSubmitEntityId = popupModuleFormElement.elements.entityId.value;
    const popupModuleTitle = popupModuleFormElement.elements.title.value.trim();
    const popupModuleDeviceType = normalizedPopupClimateDeviceType(
      popupModuleFormElement.elements.deviceType.value
    );
    if (!popupModuleTargetPopupId || !popupModuleSubmitEntityId) {
      return;
    }
    const popupModulePopup = findCustomPopup(activeProject?.document, selectedPopupId);
    const popupModuleDraftEntry = {
      id: selectedPopupModuleId || "candidate",
      type: popupModuleType,
      entityId: popupModuleSubmitEntityId,
      ...(popupModuleTitle
        ? {
            title: popupModuleTitle
          }
        : {}),
      ...(popupModuleType === "climate"
        ? {
            properties: {
              deviceType: popupModuleDeviceType
            }
          }
        : {})
    };
    const nextPopupModules = selectedPopupModuleId
      ? (popupModulePopup?.modules || []).map(existingPopupModule =>
          existingPopupModule.id === selectedPopupModuleId
            ? {
                ...existingPopupModule,
                ...popupModuleDraftEntry
              }
            : existingPopupModule
        )
      : [...(popupModulePopup?.modules || []), popupModuleDraftEntry];
    if (!popupModulePopup || !packPopupModules(nextPopupModules, popupModulePopup.layout).fits) {
      handleOperationError(new Error("当前布局已超过 3 行，可增加列数或删除其它模块。"));
      return;
    }
    closePopupModuleEntityMenu();
    popupModuleDialogElement.close();
    mutateDocument(popupModuleDraftDocument => {
      /**
       * 草稿文档里承载本次模块编辑的弹窗；找不到说明弹窗已被删除，
       * 直接放弃这次写入（例如对话框打开期间在别处删掉了它）。
       */
      const popupModuleDraftPopup = (popupModuleDraftDocument.customPopups || []).find(
        popupModulePopupMatch => popupModulePopupMatch.id === popupModuleTargetPopupId
      );
      if (!popupModuleDraftPopup) {
        return;
      }
      const popupModuleExisting = popupModuleDraftPopup.modules.find(
        popupModuleMatch => popupModuleMatch.id === selectedPopupModuleId
      );
      if (popupModuleExisting) {
        popupModuleExisting.type = popupModuleType;
        popupModuleExisting.entityId = popupModuleSubmitEntityId;
        if (popupModuleTitle) {
          popupModuleExisting.title = popupModuleTitle;
        } else {
          delete popupModuleExisting.title;
        }
        if (popupModuleType === "climate") {
          popupModuleExisting.properties = {
            ...(popupModuleExisting.properties || {}),
            deviceType: popupModuleDeviceType
          };
        } else if (popupModuleExisting.properties?.deviceType) {
          const { deviceType: removedDeviceType, ...remainingPopupProperties } =
            popupModuleExisting.properties;
          if (Object.keys(remainingPopupProperties).length) {
            popupModuleExisting.properties = remainingPopupProperties;
          } else {
            delete popupModuleExisting.properties;
          }
        }
        delete popupModuleExisting.deviceType;
        return;
      }
      popupModuleDraftPopup.modules.push({
        id: newId("popup-module"),
        type: popupModuleType,
        entityId: popupModuleSubmitEntityId,
        ...(popupModuleTitle
          ? {
              title: popupModuleTitle
            }
          : {}),
        ...(popupModuleType === "climate"
          ? {
              properties: {
                deviceType: popupModuleDeviceType
              }
            }
          : {})
      });
    });
  });
}

/**
 * 文档级指针与按键。
 *
 * 挂在 document 上的 pointerdown / input / keydown：关下拉、抓输入、快捷键。
 */
function bindDocumentPointerSection() {
  const on = sections.section("document-pointer");
  on(document, "pointerdown", function onDocumentPointerdown(documentPointerDownEvent) {
    const deleteAssetFolderClosestElement = documentPointerDownEvent.target.closest(
      "#delete-asset-folder-dialog"
    );
    if (!componentContextMenuElement.contains(documentPointerDownEvent.target)) {
      closeComponentContextMenu();
    }
    if (
      !deleteAssetFolderClosestElement &&
      openCustomSelect &&
      !openCustomSelect.button.contains(documentPointerDownEvent.target) &&
      !openCustomSelect.menu.contains(documentPointerDownEvent.target)
    ) {
      closeCustomSelectMenu();
    }
    if (!documentPointerDownEvent.target.closest(".dashboard-select-row")) {
      closeProjectActionsMenu();
    }
    if (!documentPointerDownEvent.target.closest(".page-control .page-select-row")) {
      closePageActionsMenu();
    }
    if (
      !documentPointerDownEvent.target.closest("#popup-list") &&
      !documentPointerDownEvent.target.closest("#popup-actions-menu")
    ) {
      closePopupActionsMenu();
    }
    if (!documentPointerDownEvent.target.closest("#popup-module-entity-picker")) {
      closePopupModuleEntityMenu();
    }
    if (!documentPointerDownEvent.target.closest(".component-popup-entity-picker")) {
      closePopupEntityMenus();
    }
    if (!documentPointerDownEvent.target.closest("#image-entity-picker")) {
      closeDropdownMenu(imageEntityMenuElement, imageEntityButtonElement);
    }
    if (!documentPointerDownEvent.target.closest("#weather-entity-picker")) {
      closeDropdownMenu(weatherEntityMenuElement, weatherEntityButtonElement);
    }
    if (!documentPointerDownEvent.target.closest("#line-chart-entity-picker")) {
      closeDropdownMenu(lineChartEntityMenuElement, lineChartEntityButtonElement);
    }
    if (!documentPointerDownEvent.target.closest("#ibe-entity-picker")) {
      closeDropdownMenu(iconButtonEffectEntityMenuElement, iconButtonEffectEntityButtonElement);
    }
    if (!documentPointerDownEvent.target.closest("#icon-button-entity-picker")) {
      closeDropdownMenu(iconButtonEntityMenuElement, iconButtonEntityButtonElement);
    }
    if (!documentPointerDownEvent.target.closest("#vacuum-map-entity-picker")) {
      closeDropdownMenu(vacuumMapEntityMenuElement, vacuumMapEntityButtonElement);
    }
    if (!documentPointerDownEvent.target.closest("#camera-entity-picker")) {
      closeDropdownMenu(cameraEntityMenuElement, cameraEntityButtonElement);
    }
    if (!documentPointerDownEvent.target.closest("#air-conditioner-entity-picker")) {
      closeDropdownMenu(airConditionerEntityMenuElement, airConditionerEntityButtonElement);
    }
    if (!documentPointerDownEvent.target.closest("#title-button-entity-picker")) {
      closeDropdownMenu(titleButtonEntityMenuElement, titleButtonEntityButtonElement);
    }
    if (
      !lightStatisticsEntityMenuElement.hidden &&
      !documentPointerDownEvent.target.closest("#light-statistics-entity-picker") &&
      !lightStatisticsEntityMenuElement.contains(documentPointerDownEvent.target)
    ) {
      closeDropdownMenu(lightStatisticsEntityMenuElement, lightStatisticsEntityButtonElement);
      resetLightStatisticsPicker();
    }
    if (!documentPointerDownEvent.target.closest("#light-statistics-action-entity-picker")) {
      closeDropdownMenu(
        lightStatisticsActionEntityMenuElement,
        lightStatisticsActionEntityButtonElement
      );
    }
    if (!documentPointerDownEvent.target.closest("#navigation-entity-picker")) {
      closeDropdownMenu(navigationEntityMenuElement, navigationEntityButtonElement);
    }
    const imageAssetFolderMenuElement = customSelectsBySelectElement.get(
      imageAssetFolderSelectElement
    )?.menu;
    if (
      !deleteAssetFolderClosestElement &&
      !documentPointerDownEvent.target.closest("#image-asset-picker") &&
      !imageAssetFolderMenuElement?.contains(documentPointerDownEvent.target)
    ) {
      closeDropdownMenu(imageAssetMenuElement, imageAssetButtonElement);
    }
    const effectAssetFolderMenuElement = customSelectsBySelectElement.get(
      iconButtonEffectAssetFolderSelectElement
    )?.menu;
    if (
      !deleteAssetFolderClosestElement &&
      !documentPointerDownEvent.target.closest("#ibe-asset-picker") &&
      !effectAssetFolderMenuElement?.contains(documentPointerDownEvent.target)
    ) {
      closeDropdownMenu(iconButtonEffectAssetMenuElement, iconButtonEffectAssetButtonElement);
    }
    if (
      !documentPointerDownEvent.target.closest("#ibe-icon-picker") &&
      !iconButtonEffectIconMenuElement.contains(documentPointerDownEvent.target)
    ) {
      closeDropdownMenu(iconButtonEffectIconMenuElement, iconButtonEffectIconButtonElement);
    }
    if (
      !documentPointerDownEvent.target.closest("#icon-button-icon-picker") &&
      !iconButtonIconMenuElement.contains(documentPointerDownEvent.target)
    ) {
      closeDropdownMenu(iconButtonIconMenuElement, iconButtonIconButtonElement);
    }
    if (
      !documentPointerDownEvent.target.closest("#title-button-icon-picker") &&
      !titleButtonIconMenuElement.contains(documentPointerDownEvent.target)
    ) {
      closeDropdownMenu(titleButtonIconMenuElement, titleButtonIconButtonElement);
    }
    if (
      !documentPointerDownEvent.target.closest("#light-statistics-icon-picker") &&
      !lightStatisticsIconMenuElement.contains(documentPointerDownEvent.target)
    ) {
      closeDropdownMenu(lightStatisticsIconMenuElement, lightStatisticsIconButtonElement);
    }
    if (
      !documentPointerDownEvent.target.closest("#navigation-icon-picker") &&
      !navigationIconMenuElement.contains(documentPointerDownEvent.target)
    ) {
      closeDropdownMenu(navigationIconMenuElement, navigationIconButtonElement);
    }
  });
  const scaleInputElements = new Set([
    imageScaleInputElement,
    iconButtonEffectScaleInputElement,
    titleButtonScaleInputElement,
    lightStatisticsScaleInputElement,
    iconButtonScaleInputElement,
    airConditionerScaleInputElement,
    vacuumMapScaleInputElement,
    cameraScaleInputElement,
    timeScaleInputElement,
    dateScaleInputElement,
    weatherScaleInputElement,
    lineChartScaleInputElement,
    panelFrameScaleInputElement,
    navigationScaleInputElement
  ]);
  on(document, "input",
    scaleInputCaptureEvent => {
      if (selectedComponentIds.size < 2 || !scaleInputElements.has(scaleInputCaptureEvent.target)) {
        return;
      }
      scaleInputCaptureEvent.stopPropagation();
      const scaleInputValue = Number(scaleInputCaptureEvent.target.value);
      if (!Number.isFinite(scaleInputValue)) {
        return;
      }
      const scaledPlacements = scaledSelectionPlacements(clampNumber(scaleInputValue, 1, 500) / 100);
      if (scaledPlacements.length) {
        editorRenderer?.previewComponentsTransform(scaledPlacements, selectedComponentId);
      }
    },
    true
  );
  on(document, "change",
    documentChangeEvent => {
      if (selectedComponentIds.size < 2 || !scaleInputElements.has(documentChangeEvent.target)) {
        return;
      }
      documentChangeEvent.stopPropagation();
      const changeInputValue = Number(documentChangeEvent.target.value);
      if (!Number.isFinite(changeInputValue)) {
        syncInspector();
        return;
      }
      const selectedComponentIdSet = new Set(selectedComponentIds);
      const changedScaledPlacements = scaledSelectionPlacements(
        clampNumber(changeInputValue, 1, 500) / 100
      );
      if (changedScaledPlacements.length) {
        mutateDocument(scaleDraftDocument => {
          for (const scaledPlacement of changedScaledPlacements) {
            if (!selectedComponentIdSet.has(scaledPlacement.componentId)) {
              continue;
            }
            const scaledComponentRecord = findComponent(
              scaleDraftDocument,
              scaledPlacement.componentId
            )?.component;
            if (scaledComponentRecord) {
              scaledComponentRecord.position = {
                ...(scaledComponentRecord.position || {}),
                x: scaledPlacement.x,
                y: scaledPlacement.y
              };
              scaledComponentRecord.style = {
                ...(scaledComponentRecord.style || {}),
                scale: scaledPlacement.scale
              };
            }
          }
        });
      }
    },
    true
  );
  on(document, "keydown", function onDocumentKeydown(documentKeydownEvent) {
    const keyboardTargetElement = documentKeydownEvent.target.closest(
      'input, textarea, select, button, [contenteditable="true"], dialog'
    );
    if (editorMode === "edit" && selectedComponentIds.size && !keyboardTargetElement) {
      if (
        (documentKeydownEvent.metaKey || documentKeydownEvent.ctrlKey) &&
        !documentKeydownEvent.altKey &&
        !documentKeydownEvent.shiftKey &&
        documentKeydownEvent.key.toLowerCase() === "d"
      ) {
        documentKeydownEvent.preventDefault();
        duplicateComponents([...selectedComponentIds], selectedComponentId);
        return;
      }
      if (
        !documentKeydownEvent.metaKey &&
        !documentKeydownEvent.ctrlKey &&
        !documentKeydownEvent.altKey &&
        (documentKeydownEvent.key === "Delete" || documentKeydownEvent.key === "Backspace")
      ) {
        documentKeydownEvent.preventDefault();
        openDeleteComponentDialog([...selectedComponentIds]);
        return;
      }
    }
    const arrowKeyDeltas = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
    if (
      arrowKeyDeltas[documentKeydownEvent.key] &&
      editorMode === "edit" &&
      selectedComponentIds.size &&
      !documentKeydownEvent.metaKey &&
      !documentKeydownEvent.ctrlKey &&
      !documentKeydownEvent.altKey &&
      !keyboardTargetElement
    ) {
      documentKeydownEvent.preventDefault();
      const nudgeStep = documentKeydownEvent.shiftKey ? 10 : 1;
      const [nudgeOffsetX, nudgeOffsetY] = arrowKeyDeltas[documentKeydownEvent.key];
      nudgeSelectedComponents(nudgeOffsetX * nudgeStep, nudgeOffsetY * nudgeStep);
      return;
    }
    if (documentKeydownEvent.key !== "Enter" || documentKeydownEvent.isComposing) {
      return;
    }
    const enterTargetElement = documentKeydownEvent.target.closest(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])'
    );
    if (enterTargetElement) {
      documentKeydownEvent.preventDefault();
      enterTargetElement.blur();
    }
  });
}

/**
 * 布局交互层。
 *
 * 编辑器是「定宽 + 整页缩放」的：`html.editor-viewport-fit` 下 body 被钉在 1020px 宽、
 * 高度由 JS 写成 --editor-layout-height，然后整页 transform: scale() 铺满视口。
 * 所以这里**只动 CSS 变量**（左右栏宽度），从不改网格轨道条数、也不碰 min-width。
 * body 的宽度一旦被改，缩放算术就全错位；宽度写死在 CSS 里（html.editor-viewport-fit body），
 * 面板再宽也只在页面内部挤中栏，中栏由 --layout-center-min-w 兜底。
 *
 * 状态存 localStorage：布局是纯 UI 偏好，不属于仪表盘文档。进文档会污染保存请求，
 * 拖一下分隔条就把文档标脏、触发自动保存并可能撞上 409 —— 这是迁移前的老毛病。
 */
const EDITOR_LAYOUT_STORAGE_KEY = "homeos.layout.v1.index";

// 布局常量（各栏上下限、列间距、把手条宽）来自 CSS 变量，拖动一帧要读一次，所以缓存。
// 槽位是对象不是数字：一次 refresh 里要复用同一批读数，且要能整体丢弃。
let editorLayoutMetrics = null;
let editorLayoutController = null;
// 共享控件句柄：快捷键入口要显式同步它的可视态（见 runEditorLayoutAction）。
let editorLayoutControls = null;
// 记得「本文件里已不存在预设与沉浸模式」：那一层由用户判定没有实际价值后整层删除，
// 折叠与调宽是唯二留下的能力。再加回「整体切换布局」之前先读 shared/layout-shell.js 的文件头。

/** 丢弃缓存。窗口尺寸变化、或 CSS 变量被别的代码改动后必须调用，否则上下限停在旧值。 */
function invalidateEditorLayoutMetrics() {
  editorLayoutMetrics = null;
}

/**
 * 读一个布局常量。
 *
 * 只认 px 字面量：这几个变量都声明在 app.css 的 .editor-shell 上、且全是 px，值又是静态的，
 * 所以 parseFloat 拿到的就是最终像素值。刻意不用「探针元素 + getBoundingClientRect」换算 ——
 * 探针要挂进网格容器并强制一次布局，而本函数在拖拽热路径上会被反复调用。若将来真要把某个
 * 常量改成 vw/百分比，必须同时把这里换回探针写法，否则读到的数字会是错的（而不是 0）。
 */
function readEditorLayoutPx(cssVarName, fallbackPx) {
  const rawValue = getComputedStyle(editorShellElement).getPropertyValue(cssVarName).trim();
  const numericValue = Number.parseFloat(rawValue);
  return Number.isFinite(numericValue) ? numericValue : fallbackPx;
}

/**
 * 整页缩放系数（`transform: scale()`），由 refreshEditorViewportFit 写在 <html> 上。
 *
 * 分隔条拖动要用它把「屏幕像素」换算回「逻辑像素」：外壳在缩放变换之内，拖动 100 屏幕像素
 * 只等于 100/scale 逻辑像素。读不到（首次渲染前 / 值被写坏）时返回 1，也就是「不缩放」——
 * 这时拖拽与光标严格同步，是最安全的退化。
 */
function readEditorViewportScale() {
  const rawValue = getComputedStyle(document.documentElement)
    .getPropertyValue("--editor-viewport-scale")
    .trim();
  const numericValue = Number.parseFloat(rawValue);
  return numericValue > 0 ? numericValue : 1;
}

/**
 * 读齐一次布局常量并缓存。缓存不随拖拽失效（这几枚变量在窗口尺寸不变时就是常量），
 * 只在窗口 resize 与布局变更后由 invalidateEditorLayoutMetrics() 丢弃。
 */
function readEditorLayoutMetrics() {
  if (editorLayoutMetrics) {
    return editorLayoutMetrics;
  }
  if (!editorShellElement) {
    return null;
  }
  const shellWidth = editorShellElement.getBoundingClientRect().width;
  if (!(shellWidth > 0)) {
    return null;
  }
  const columnGapWidth = readEditorLayoutPx("--layout-column-gap", 0);
  // 「两栏共享的预算」= 外壳宽 - 中栏最小宽 - 两条列间距。左右栏的宽度之和一旦超过它，
  // 中栏就会被压到最小宽以下；更糟的是，网格三轨之和超过外壳宽时 .editor-shell 的
  // overflow:hidden 会把溢出的那一栏直接裁掉 —— 没有任何报错，只是「拖不动了」。
  // 兜底 360 与 app.css 的 --layout-center-min-w 一致（两边都是吃不下 var() 的位置）。
  const overheadWidth = readEditorLayoutPx("--layout-center-min-w", 360) + columnGapWidth * 2;
  editorLayoutMetrics = {
    shellWidth,
    overheadWidth,
    sharedBudgetWidth: Math.max(0, shellWidth - overheadWidth),
    navigatorMinWidth: readEditorLayoutPx("--layout-nav-min-w", 180),
    navigatorMaxWidth: readEditorLayoutPx("--layout-nav-max-w", 520),
    inspectorMinWidth: readEditorLayoutPx("--layout-inspector-min-w", 200),
    inspectorMaxWidth: readEditorLayoutPx("--layout-inspector-max-w", 620)
  };
  return editorLayoutMetrics;
}

/** 某一栏此刻实际渲染出来的宽度（含折叠态）。读不到返回 null，调用方按「最小宽」兜底。 */
function editorRenderedPanelWidth(panelId) {
  const panelElement = panelId === "navigator" ? navigatorElement : inspectorElement;
  const panelWidth = panelElement?.getBoundingClientRect().width;
  return Number.isFinite(panelWidth) && panelWidth > 0 ? panelWidth : null;
}

/**
 * 一栏的上下限。上限随**另一栏当前的实际宽度**浮动：两栏合计不能超过共享预算。
 *
 * 用「另一栏此刻的渲染宽度」而不是它的状态值，是为了避免控制器里的循环依赖 ——
 * 归一化一栏需要它的上下限，而上下限又需要另一栏归一化后的尺寸。渲染宽度没有这个问题：
 * 它要么是初始的 CSS 默认值，要么是控制器上一次写下的值，永远是「已经生效的那个」。
 * 副作用：视口窄于 1020px 时整页被钉在 1020px 逻辑宽，预算恒为 1020 − 中栏最小宽；
 * 默认 250/250 占去 500px，剩下的余量（360px 下限时是 160px）才是两栏能自行长出去的空间。
 * 余量用完后再拖，表现就是「把预算从一栏挪到另一栏」—— 这是「三轨之和必须塞进 1020px」的
 * 必然结果，窗口更宽时预算随外壳宽增长，两栏都能明显变宽。
 */
function editorPanelLimits(panelId) {
  const metrics = readEditorLayoutMetrics();
  if (!metrics) {
    // 拿不到常量时返回 null，控制器会退回 CSS 变量声明的静态上下限，行为与不启用本层一致。
    return null;
  }
  const isNavigator = panelId === "navigator";
  const otherPanelId = isNavigator ? "inspector" : "navigator";
  const cssMinWidth = isNavigator ? metrics.navigatorMinWidth : metrics.inspectorMinWidth;
  const cssMaxWidth = isNavigator ? metrics.navigatorMaxWidth : metrics.inspectorMaxWidth;
  const otherMinWidth = isNavigator ? metrics.inspectorMinWidth : metrics.navigatorMinWidth;
  // 另一栏还没渲染出来时按它的最小宽扣减：宁可这一栏少伸一点，也不要让网格溢出。
  const otherWidth = editorRenderedPanelWidth(otherPanelId) ?? otherMinWidth;
  return {
    min: cssMinWidth,
    max: Math.max(cssMinWidth, Math.min(cssMaxWidth, metrics.sharedBudgetWidth - otherWidth))
  };
}

/** 中栏变化后让画布重新贴一次视口（整页缩放的换算要靠这一步）。 */
function syncEditorLayoutChange() {
  invalidateEditorLayoutMetrics();
  refreshEditorViewportFit();
}

/**
 * 接线布局层：控制器 + 把手条/分隔条/快捷键。
 *
 * 单独成节而不是塞进别的 bind：这里的所有元素都只服务布局，且必须一起存在或一起缺席
 * （HTML 里少一个分隔条就会让另一条拖动失灵），拆开反而看不出这个整体约束。
 */
function bindLayoutSection() {
  if (!editorShellElement) {
    return;
  }
  const on = sections.section("layout");

  editorLayoutController = createLayoutController({
    storageKey: EDITOR_LAYOUT_STORAGE_KEY,
    shell: editorShellElement,
    panels: [
      {
        id: "navigator",
        sizeVar: "--layout-nav-w",
        // 写 <html> 而不是 .editor-shell：编辑器里有几个按列宽推导偏移量的浮层挂在 <body> 下，
        // 变量只有落在 <html> 上它们才继承得到。.editor-shell 是 <html> 的后代，
        // grid-template-columns 读到的仍是同一个值。
        varTarget: document.documentElement,
        element: navigatorElement,
        unit: "px",
        def: 250,
        // 上下限只有一份来源：CSS 变量。JS 再抄一遍数字必然与 app.css 漂移。
        // limits() 覆盖上面两个静态值，因为上限还要扣掉另一栏当前占的宽度（见 editorPanelLimits）。
        limits: () => editorPanelLimits("navigator"),
        collapsible: true
      },
      {
        id: "inspector",
        sizeVar: "--layout-inspector-w",
        varTarget: document.documentElement,
        element: inspectorElement,
        unit: "px",
        def: 250,
        limits: () => editorPanelLimits("inspector"),
        collapsible: true
      }
    ],
    separators: [
      {
        // 左栏与画布之间：贴着中栏左边界（justify-self: start），往右拖 = 左栏变宽。
        element: navigatorResizerElement,
        orientation: "vertical",
        label: "拖动调整控件图层栏宽度，双击复位",
        axes: [
          { panelId: "navigator", axis: "x", sign: 1, viewportScale: readEditorViewportScale }
        ]
      },
      {
        // 画布与右栏之间：贴着中栏右边界（justify-self: end），往右拖 = 右栏变窄，故 sign 取 -1。
        element: inspectorResizerElement,
        orientation: "vertical",
        label: "拖动调整属性栏宽度，双击复位",
        // viewportScale 见 readEditorViewportScale：整页缩放之下，屏幕位移要换算回逻辑像素，
        // 否则分隔条会以 (1 − scale) 的比例落后于光标（视口 932px 时约 8.6%）。
        axes: [
          { panelId: "inspector", axis: "x", sign: -1, viewportScale: readEditorViewportScale }
        ]
      }
    ],
    onChange: syncEditorLayoutChange
  });

  editorLayoutControls = bindLayoutControls({
    controller: editorLayoutController,
    root: document
  });

  /**
   * 执行一个布局动作并同步共享控件的可视态。快捷键入口不经过 bindLayoutControls 的点击处理，
   * 所以每条快捷键都要显式同步一次（否则按了 ⌘B 侧栏收起了，把手条的 aria-expanded 却还停在旧值）。
   */
  function runEditorLayoutAction(layoutAction) {
    layoutAction();
    editorLayoutControls.sync();
  }

  // 键位与 /3d-studio 逐条对齐（同一套肌肉记忆），且都避开了两页既有的绑定：
  // 编辑器的 ⌘D 复制、方向键微调、Delete、Enter、Esc 一个都不撞（见 layout-shortcuts.js 的文件头）。
  bindLayoutShortcuts({
    bindings: [
      {
        id: "toggle-navigator",
        combo: "Mod+B",
        run: () => runEditorLayoutAction(() => editorLayoutController.togglePanel("navigator"))
      },
      {
        id: "toggle-inspector",
        combo: "Mod+Shift+B",
        run: () => runEditorLayoutAction(() => editorLayoutController.togglePanel("inspector"))
      }
    ]
  });

  // 中栏（画布）变了要重算整页缩放。控制器是在「提交」时才调 onChange 的（拖拽中的每一帧只
  // 改 CSS 变量、不落盘也不通知），所以拖动过程中画布不会跟着逐帧重排 —— 这是有意的：
  // refreshEditorViewportFit 会读 offsetHeight、算 scale、再写 <html> 的类与变量，
  // 逐帧跑它比拖动本身贵得多，而拖拽结束后补一次的结果是一样的。
  on(window, "resize", function onEditorLayoutWindowResize() {
    invalidateEditorLayoutMetrics();
    editorLayoutController?.refresh();
  });
}

// 接线放在本节**末尾**，而不是上面的分节绑定调用区：本节的状态（EDITOR_LAYOUT_* / editorLayoutController）
// 是 const / let，不像函数那样提升，调用点写在本文件靠前的调用区会在求值那一刻落进 TDZ
// （Uncaught ReferenceError: Cannot access 'EDITOR_LAYOUT_STORAGE_KEY' before initialization）。
// 放在这里同样是「最后接线」——全部分节绑定的调用都排在模块求值的前半段，早于本行。
bindLayoutSection();

/**
 * 检查器滚动收尾。
 *
 * 检查器滚动时收起浮层，以及挂在末尾的一批控件绑定。
 */
function bindInspectorScrollSection() {
  const on = sections.section("inspector-scroll");
  on(inspectorElement, "scroll", function onInspectorScroll() {
    hideAssetLargePreview();
    positionImagePickerMenu();
    positionEntityPickerMenu("weather");
    positionEntityPickerMenu("line-chart");
    positionEntityPickerMenu("icon-button-effect");
    positionEntityPickerMenu("icon-button");
    positionEntityPickerMenu("vacuum-map");
    positionEntityPickerMenu("camera");
    positionEntityPickerMenu("air-conditioner");
    positionEntityPickerMenu("title-button");
    positionEntityPickerMenu("light-statistics");
    positionLightStatisticsEntityMenu();
    positionImageAssetMenu();
    positionEffectAssetMenu();
    positionIconButtonEffectIconMenu();
    positionIconButtonIconMenu();
    positionTitleButtonIconMenu();
    positionLightStatisticsIconMenu();
    positionNavigationIconMenu();
    positionColorPicker();
    for (const popupEntityScrollMenuElement of document.querySelectorAll(
      "[data-popup-entity-menu]:not([hidden])"
    )) {
      positionPopupEntityMenu(popupEntityScrollMenuElement.closest("[data-action-trigger]"));
    }
  });
  on(window, "resize", function onWindowResize() {
    refreshEditorViewportFit();
    refreshComponentDialogScale();
    closeComponentContextMenu();
    closeCustomSelectMenu();
    closeAllDropdownMenus();
    closePopupEntityMenus();
    positionColorPicker();
  });
  on(saveButtonElement, "click", async function onSaveButtonClick() {
    // 等上一次写落定再走：它成功与否不影响本次操作（失败已由那一环的调用方报过）。
    await writeQueuePromise.catch(() => {});
    await saveDraft();
  });
  on(displayDevicesOpenButtonElement, "click", openDisplayDevicesDialog);
  on(displayDevicesCloseButtonElement, "click", function onDisplayDevicesCloseButtonClick() { return displayDevicesDialogElement.close(); }
  );
  on(sessionsOpenButtonElement, "click", openSessionsDialog);
  on(sessionsCloseButtonElement, "click", function onSessionsCloseButtonClick() { return sessionsDialogElement.close(); });
  on(sessionsRevokeOthersButtonElement, "click", openSessionsRevokeOthersDialog);
  on(sessionsRevokeOthersCloseButtonElement, "click", function onSessionsRevokeOthersCloseButtonClick() { return sessionsRevokeOthersDialogElement.close(); }
  );
  on(sessionsRevokeOthersCancelButtonElement, "click", function onSessionsRevokeOthersCancelButtonClick() { return sessionsRevokeOthersDialogElement.close(); }
  );
  on(sessionsRevokeOthersConfirmButtonElement, "click", async function onSessionsRevokeOthersConfirmButtonClick() {
    sessionsRevokeOthersConfirmButtonElement.disabled = true;
    setSettingsMessage(sessionsRevokeOthersMessageElement, "");
    setSettingsMessage(sessionsMessageElement, "");
    try {
      await requestJson("/auth/sessions", { method: "DELETE" });
      sessionsRevokeOthersDialogElement.close();
      await loadLoginSessions();
      setSettingsMessage(
        sessionsMessageElement,
        "已退出其他所有设备的登录会话。",
        "success"
      );
    } catch (revokeOtherSessionsError) {
      setSettingsMessage(
        sessionsRevokeOthersMessageElement,
        revokeOtherSessionsError.message,
        "error"
      );
      sessionsRevokeOthersConfirmButtonElement.disabled = false;
    }
  });
  on(sessionsRevokeCloseButtonElement, "click", function onSessionsRevokeCloseButtonClick() { return sessionsRevokeDialogElement.close(); }
  );
  on(sessionsRevokeCancelButtonElement, "click", function onSessionsRevokeCancelButtonClick() { return sessionsRevokeDialogElement.close(); }
  );
  on(sessionsRevokeConfirmButtonElement, "click", async function onSessionsRevokeConfirmButtonClick() {
    const revokedSessionId = sessionsRevokeDialogElement.dataset.sessionId;
    if (!revokedSessionId) {
      setSettingsMessage(
        sessionsRevokeMessageElement,
        "会话已经不存在，请刷新后重试。",
        "error"
      );
      return;
    }
    sessionsRevokeConfirmButtonElement.disabled = true;
    setSettingsMessage(sessionsRevokeMessageElement, "");
    setSettingsMessage(sessionsMessageElement, "");
    try {
      await requestJson("/auth/sessions/" + encodeURIComponent(revokedSessionId), {
        method: "DELETE"
      });
      sessionsRevokeDialogElement.close();
      delete sessionsRevokeDialogElement.dataset.sessionId;
      await loadLoginSessions();
    } catch (revokeSessionError) {
      setSettingsMessage(sessionsRevokeMessageElement, revokeSessionError.message, "error");
      sessionsRevokeConfirmButtonElement.disabled = false;
    }
  });
  on(displayPairingCustomCodeTextInputElement, "input", function onDisplayPairingCustomCodeTextInputInput() {
    displayPairingCustomCodeTextInputElement.value = displayPairingCustomCodeTextInputElement.value
      .replace(/\D/g, "")
      .slice(0, 6);
  });
  on(displayPairingFormElement, "submit", createDisplayPairingCode);
  on(logoutButtonElement, "click", async function onLogoutButtonClick() {
    if (!guardUnsavedChanges()) {
      await requestJson("/auth/logout", {
        method: "POST"
      });
      window.location.assign("/login");
    }
  });
  enhanceNativeSelectsIn();
  enhanceColorInputsIn(document);
  enhanceNumberInputsIn(document);

  on(globalColorPickerSaturationValueElement, "pointerdown",
    function onGlobalColorPickerSaturationValuePointerdown(saturationPointerDownEvent) {
      if (activeColorInputElement) {
        saturationPointerDownEvent.preventDefault();
        colorPickerDragPointerId = saturationPointerDownEvent.pointerId;
        capturePointer(globalColorPickerSaturationValueElement, saturationPointerDownEvent.pointerId);
        updateColorPickerFromPointer(saturationPointerDownEvent);
      }
    }
  );
  on(globalColorPickerSaturationValueElement, "pointermove",
    function onGlobalColorPickerSaturationValuePointermove(saturationPointerMoveEvent) {
      if (saturationPointerMoveEvent.pointerId === colorPickerDragPointerId) {
        updateColorPickerFromPointer(saturationPointerMoveEvent);
      }
    }
  );
  on(globalColorPickerSaturationValueElement, "pointerup", function onGlobalColorPickerSaturationValuePointerup(saturationPointerUpEvent) {
    if (saturationPointerUpEvent.pointerId === colorPickerDragPointerId) {
      colorPickerDragPointerId = null;
      releasePointer(globalColorPickerSaturationValueElement, saturationPointerUpEvent.pointerId);
    }
  });
  on(globalColorPickerHueRangeInputElement, "input", function onGlobalColorPickerHueRangeInputInput() {
    if (activeColorInputElement) {
      colorPickerHue = clampNumber(Number(globalColorPickerHueRangeInputElement.value), 0, 360);
      commitColorPickerHsv();
    }
  });
  on(globalColorPickerHexTextInputElement, "input", function onGlobalColorPickerHexTextInputInput() {
    const hexColorInputValue = hexColorOrEmpty(globalColorPickerHexTextInputElement.value);
    if (hexColorInputValue) {
      syncColorPickerFromHex(hexColorInputValue, true);
    }
  });
  on(globalColorPickerHexTextInputElement, "change", function onGlobalColorPickerHexTextInputChange() {
    const hexColorChangeInput = hexColorOrEmpty(globalColorPickerHexTextInputElement.value);
    if (hexColorChangeInput) {
      syncColorPickerFromHex(hexColorChangeInput, true);
    } else if (activeColorInputElement) {
      globalColorPickerHexTextInputElement.value = String(
        activeColorInputElement.value || ""
      ).toUpperCase();
    }
  });

  for (const colorChannelInput of [
    globalColorPickerRedInputElement,
    globalColorPickerGreenInputElement,
    globalColorPickerBlueInputElement
  ]) {
    on(colorChannelInput, "input", commitColorPickerFromRgb);
    on(colorChannelInput, "change", commitColorPickerFromRgb);
  }
  on(globalColorPickerCopyButtonElement, "click", async function onGlobalColorPickerCopyButtonClick() {
    if (activeColorInputElement) {
      try {
        await copyTextToClipboard(String(activeColorInputElement.value || "").toUpperCase());
        window.clearTimeout(colorPickerCopyResetTimer);
        globalColorPickerCopyButtonElement.classList.add("copied");
        colorPickerCopyResetTimer = window.setTimeout(
          () => globalColorPickerCopyButtonElement.classList.remove("copied"),
          1200
        );
      } catch (copyColorError) {
        handleOperationError(copyColorError);
      }
    }
  });
  on(globalColorPickerPasteButtonElement, "click", async function onGlobalColorPickerPasteButtonClick() {
    if (activeColorInputElement) {
      try {
        const clipboardRawText = await navigator.clipboard.readText();
        const clipboardHexColor = hexColorOrEmpty(clipboardRawText);
        if (!clipboardHexColor) {
          throw new Error("剪贴板中没有可用的十六进制颜色值。");
        }
        globalColorPickerHexTextInputElement.value = clipboardHexColor.toUpperCase();
        syncColorPickerFromHex(clipboardHexColor, true);
        globalColorPickerPasteButtonElement.classList.add("copied");
        window.setTimeout(() => globalColorPickerPasteButtonElement.classList.remove("copied"), 1200);
      } catch (pasteColorError) {
        handleOperationError(pasteColorError);
      }
    }
  });
  on(document, "click",
    pickerGuardClickEvent => {
      const clickedButtonElement = pickerGuardClickEvent.target.closest("button");
      if (!clickedButtonElement) {
        return;
      }
      let isPickerHandled = false;
      if (
        [
          navigationIconButtonElement,
          iconButtonEffectIconButtonElement,
          iconButtonIconButtonElement,
          titleButtonIconButtonElement,
          lightStatisticsIconButtonElement
        ].includes(clickedButtonElement)
      ) {
        isPickerHandled = openIconPicker(clickedButtonElement);
      } else if (clickedButtonElement === lightStatisticsEntityButtonElement) {
        isPickerHandled = openLightStatisticsEntityPicker();
      } else if (clickedButtonElement.matches("[data-popup-entity-button]")) {
        isPickerHandled = openPopupEntityPicker(clickedButtonElement);
      } else if (clickedButtonElement === popupModuleEntityButtonElement) {
        isPickerHandled = openPopupModuleEntityPicker();
      } else if (
        [imageAssetButtonElement, iconButtonEffectAssetButtonElement].includes(clickedButtonElement)
      ) {
        isPickerHandled = openAssetPicker(clickedButtonElement);
      } else {
        isPickerHandled = openEntityPicker(clickedButtonElement);
      }
      if (isPickerHandled) {
        pickerGuardClickEvent.preventDefault();
        pickerGuardClickEvent.stopImmediatePropagation();
      }
    },
    true
  );
  on(document, "pointerdown", function onDocumentPointerdown(documentPointerDownCaptureEvent) {
    if (
      !globalColorPickerElement.hidden &&
      !globalColorPickerElement.contains(documentPointerDownCaptureEvent.target) &&
      documentPointerDownCaptureEvent.target !== activeColorInputElement
    ) {
      closeColorPicker();
    }
  });
  // dialog 以任何方式关闭时取色器都要收拾干净：它可能正挂在那只 dialog 里（见 colorPickerHostFor），
  // 而 dialog 关闭一帧后会被惰性卸载（editor-dialogs.js）—— 留在里面的取色器会连着被摘离文档。
  // Esc 关闭不会有 pointerdown，所以不能只靠上面那条兜。close 事件不冒泡，只能在捕获阶段听。
  //
  // 这里必须走完整的 closeColorPicker（它会隐藏面板并补发 change），不能只把活跃输入框清掉：
  // activeColorInputElement 的 isConnected 判据**认不出已脱离文档的取色器**，于是面板会一直
  // 保持可见；等 dialog 被摘走，那个还亮着的面板连同 hidden=false 的状态一起消失，下次打开
  // 同一只 dialog 时又原样冒出来。判据收紧到「取色器就挂在这只正在关闭的 dialog 里」：
  // 文档里别的元素也会发 close，无差别收起会把侧栏输入框刚打开的面板一起关掉。
  on(document, "close",
    closeEvent => {
      if (closeEvent.target?.contains?.(globalColorPickerElement)) {
        closeColorPicker();
      }
    },
    true
  );
  new MutationObserver(mutationRecords => {
    for (const mutationRecord of mutationRecords) {
      for (const addedNode of mutationRecord.addedNodes) {
        if (addedNode instanceof HTMLElement) {
          enhanceNativeSelectsIn(addedNode);
          enhanceColorInputsIn(addedNode);
          enhanceNumberInputsIn(addedNode);
        }
      }
    }
  }).observe(document.body, {
    childList: true,
    subtree: true
  });
  deferHiddenEditorDialogs();
  setEditorMode("edit");
  // 下面这一组轮询 / 可见性刷新统一吞掉失败：它们每 15 / 30 秒重试一次，
  // 单次失败弹提示只会刷屏，真实状态下一轮就会回来。
  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      refreshHaConnection().catch(() => {});
      refreshLicenseStatus().catch(() => {});
    }
  }, 15000);
  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      pollAssetCatalogVersion().catch(() => {});
    }
  }, 30000);
  on(document, "visibilitychange", function onDocumentVisibilitychange() {
    if (document.visibilityState === "visible") {
      refreshHaConnection().catch(() => {});
      pollAssetCatalogVersion().catch(() => {});
      refreshLicenseStatus().catch(() => {});
    }
  });
}
