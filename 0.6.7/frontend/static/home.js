import {
  renderFlowLineInspector as renderFlowLineInspector2,
  previewFlowLineInspectorTransform as previewFlowLineInspectorTransform2,
} from "./flow-line-inspector.js?v=20260930-flow-line-sign-v1";
import {
  normalizeFlowLine as normalizeFlowLine2,
  FLOW_LINE_FIELDS as FLOW_LINE_FIELDS2,
  applyFlowLineStyle as applyFlowLineStyle2,
} from "./flow-line-model.js?v=20260930-flow-line-sign-v1";
import { resolveSceneControlMode as resolveSceneControlMode2 } from "./renderer/scene-mode.js?v=20260926-scene-mode-v3";
import {
  renderPercentageBarInspector as renderPercentageBarInspector2,
  previewPercentageBarInspector as previewPercentageBarInspector2,
} from "./percentage-bar-inspector.js?v=20260930-percentage-text-offset-v1";
import {
  applyPercentageBarChange as applyPercentageBarChange2,
  percentageBarDefaults as percentageBarDefaults2,
} from "./percentage-bar-model.js?v=20260930-percentage-text-offset-v1";
import { showDisplayPairingQr as showDisplayPairingQr2 } from "./display-pairing-qr.js?v=20260914-unified-v3";
import {
  PanelRenderer as PanelRenderer2,
  airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2,
  setBuiltinAssetVersions as setBuiltinAssetVersions2,
  syncedLineChartProperties as syncedLineChartProperties2,
} from "./renderer/renderer.js?v=20260918-template-controls-editable-v1-20260926-scene-mode-v3-dialog-cleanup-v1-apple-native-v1-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import {
  lightStatisticsEntityStateStatus as lightStatisticsEntityStateStatus2,
  lightStatisticsEntitySupport as lightStatisticsEntitySupport2,
} from "./renderer/registry.js?v=20260926-integration-v1-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import {
  applyUiPackToDocument as applyUiPackToDocument2,
  createComponentFromTemplate as createComponentFromTemplate2,
  dateComponentDimensions as dateComponentDimensions2,
  ensureUiPackRuntime as ensureUiPackRuntime2,
  listComponentTemplates as listComponentTemplates2,
  timeComponentDimensions as timeComponentDimensions2,
  weatherComponentDimensions as weatherComponentDimensions2,
} from "./ui-packs/loader.js?v=20260811-water-heater-popup-v44-20260815-component-thumbnails-v2-20260822-light-feedback-controls-v1-20260824-light-statistics-v6-20260828-count-statistics-v1-20260902-camera-popup-ready-v1-20260902-floorplan-auto-diagram-v12-20260904-auto-diagram-floor-v1-20260908-environment-v1-20260908-lighting-mode-v1-20260926-scene-mode-v3-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import {
  clone as clone2,
  newId as newId2,
  normalizedHexColor as normalizedHexColor2,
  hexToRgb as hexToRgb2,
  rgbToHex as rgbToHex2,
  rgbToHsv as rgbToHsv2,
  hsvToRgb as hsvToRgb2,
  roundField as roundField2,
  clampNumber as clampNumber2,
  normalizedFontWeight as normalizedFontWeight2,
} from "./editor-utils.js?v=20260831-editor-utils-v1";
import {
  packPopupModules as packPopupModules2,
  popupLayoutColumns as popupLayoutColumns2,
  popupLayoutMetrics as popupLayoutMetrics2,
} from "./popup-layout.js?v=20260821-electric-bed-combo-v2";
import {
  countComponentsOutsideCanvas as countComponentsOutsideCanvas2,
  resizeDashboardDocument as resizeDashboardDocument2,
} from "./dashboard-resize.js?v=20260916-i3d-frame-adapt-v1";
import {
  copyComponentsAcrossDocuments as copyComponentsAcrossDocuments2,
  copyComponentTargets as copyComponentTargets2,
  copyComponentsToTarget as copyComponentsToTarget2,
} from "./component-page-copy.js?v=20260916-i3d-frame-adapt-v1";
import {
  RELATED_ENTITY_DOMAIN_LABELS as RELATED_ENTITY_DOMAIN_LABELS2,
  legacyRelatedEntityIds as legacyRelatedEntityIds2,
  manualRelatedEntityConfig as manualRelatedEntityConfig2,
  relatedEntityIsAvailable as relatedEntityIsAvailable2,
  relatedEntityLabel as relatedEntityLabel2,
  relatedEntityNeedsConfirmation as relatedEntityNeedsConfirmation2,
  relatedPopupCandidates as relatedPopupCandidates2,
  relatedPopupContext as relatedPopupContext2,
  relatedPopupSelectionLimit as relatedPopupSelectionLimit2,
  selectedRelatedEntityIds as selectedRelatedEntityIds2,
} from "./related-entities.js?v=20260825-bath-heater-primary-v1";
import { createIconVisibilityVirtualEntity as createIconVisibilityVirtualEntity2 } from "./virtual-entities.js?v=20260822-icon-visibility-v1";
import { createButtonSound as createButtonSound2 } from "./sound-effects.js?v=20260826-button-sound-v2";
import {
  deferHiddenEditorDialogs as deferHiddenEditorDialogs2,
  installSettingsDialogBackdropGuard as installSettingsDialogBackdropGuard2,
} from "./editor-dialogs.js?v=20260830-editor-dialogs-v1";
import { createEditorPickerElements as createEditorPickerElements2 } from "./editor-picker-elements.js?v=20260902-asset-display-name-v1";
import {
  EDITOR_PICKER_PAGE_SIZES as EDITOR_PICKER_PAGE_SIZES2,
  editorEntityPickerInitialPage as editorEntityPickerInitialPage2,
  editorEntityPickerPage as editorEntityPickerPage2,
} from "./editor-picker-pagination.js?v=20260830-editor-picker-pagination-v1";
import { createEditorPickerQueries as createEditorPickerQueries2 } from "./editor-picker-queries.js?v=20260830-editor-picker-queries-v1-20260926-scene-mode-v3";
import { createEditorAssetMatcher as createEditorAssetMatcher2 } from "./editor-asset-queries.js?v=20260830-editor-asset-queries-v1";
import { createEditorPickerLifecycle as createEditorPickerLifecycle2 } from "./editor-picker-lifecycle.js?v=20260831-editor-picker-lifecycle-v1";
import { createInteraction3dEditorPickers as createInteraction3dEditorPickers2 } from "./modules/interaction3d/editor-pickers.js?v=20260925-lazy-catalog-v1-20260922-device-catalog-active-v1-20260921-purifier-filter-v1-20260910-presence-v9-20260906-i3d-buttons-v1-20260908-environment-v1-20260908-curtains-v1-20260908-nas-v1-20260908-devices-entry-v1-20260908-nas-status-panel-v1-television-v1-20260908-vacuum-v1-20260911-device-room-integration-v3-light-all-entities-v1-entity-picker-all-v1-20260918-review-1234-v2-20260925-contact-metadata-v1-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2";
import {
  nasProfiles as nasProfiles2,
  reconcileNasDocument as reconcileNasDocument2,
} from "./modules/interaction3d/nas-catalog.js?v=20260922-nas-registry-reconcile-v2";
import { createEditorAssetToolbar as createEditorAssetToolbar2 } from "./editor-asset-toolbar.js?v=20260902-asset-folder-delete-v1";
import {
  ACTION_TYPES as ACTION_TYPES2,
  TOGGLE_ENTITY_DOMAINS as TOGGLE_ENTITY_DOMAINS2,
  actionNeedsCurrentEntity as actionNeedsCurrentEntity2,
  actionPopupData as actionPopupData2,
  componentActionIsSupported as componentActionIsSupported2,
  entityIdSupportsToggle as entityIdSupportsToggle2,
} from "./action-rules.js?v=20260831-action-rules-v1-20260930-flow-line-sign-v1";
import {
  componentDirectLocation as componentDirectLocation2,
  findComponent as findComponent2,
  findComponentInItems as findComponentInItems2,
  findComponentLocation as findComponentLocation2,
} from "./component-tree.js?v=20260831-component-tree-v1";
import {
  applyCollectionLayerOrder as applyCollectionLayerOrder2,
  componentLabel as componentLabel2,
  copiedComponentLabel as copiedComponentLabel2,
  ensureSharedComponentReference as ensureSharedComponentReference2,
  groupNameForCollection as groupNameForCollection2,
  nextTemplateInstanceName as nextTemplateInstanceName2,
  refreshComponentIds as refreshComponentIds2,
  syncSharedComponentReferenceOrder as syncSharedComponentReferenceOrder2,
} from "./editor-component-collections.js?v=20260831-editor-component-collections-v1-20260926-scene-mode-v3-20260930-flow-line-sign-v1";
import {
  fitInspectorComponentToDimensions as fitInspectorComponentToDimensions2,
  iconButtonEffectInspectorLayer as iconButtonEffectInspectorLayer2,
  inspectorComponentMetrics as inspectorComponentMetrics2,
  setInspectorToggle as setInspectorToggle2,
} from "./editor-basic-inspectors.js?v=20260901-editor-basic-inspectors-v4";
import {
  rememberEditorProject as rememberEditorProject2,
  restoredEditorProject as restoredEditorProject2,
  clonePageWithFreshIds as clonePageWithFreshIds2,
  findCustomPopup as findCustomPopup2,
  greatestCommonDivisor as greatestCommonDivisor2,
  normalizedPopupClimateDeviceType as normalizedPopupClimateDeviceType2,
  popupModuleDropPosition as popupModuleDropPosition2,
  popupModuleEntityRecommended as popupModuleEntityRecommended2,
  popupModuleTypeLabel as popupModuleTypeLabel2,
  reorderedPopupModules as reorderedPopupModules2,
  uniquePagePath as uniquePagePath2,
} from "./editor-document-management.js?v=20260917-editor-document-management-v2";
import {
  createRecoveryWriter as createRecoveryWriter2,
  documentSignature as documentSignature2,
  editorComponentEntries as editorComponentEntries2,
  editorComponentStructure as editorComponentStructure2,
  editorDocumentFrameSignature as editorDocumentFrameSignature2,
  recoveryStorageKey as recoveryStorageKey2,
} from "./editor-history.js?v=20260909-preview-sleep-v1-edit-isolation-v1";
import {
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  normalizeBaseLighting as normalizeBaseLighting2,
} from "./3d-studio/studio-normalization.js?v=20260903-studio-normalization-v2-20260918-review-1234-v2";
import { floorplanAutoDiagramExportResolution as floorplanAutoDiagramExportResolution2 } from "./floorplan-auto-diagram-layout.js?v=20260920-preview-export-aspect-v1";
import { createLicenseCard as createLicenseCard2 } from "./license-card.js?v=20260905-custom-packages-v1-20260920-license-retry-v1";
import {
  guardInteraction3dChanges as guardInteraction3dChanges2,
  renderInteraction3dThumbnail as renderInteraction3dThumbnail2,
  updateInteraction3dCard as updateInteraction3dCard2,
  renderInteraction3dInspector as renderInteraction3dInspector2,
} from "./modules/interaction3d/editor.js?v=20260923-security-editor-cache-v1-20260918-security-access-status-v2-20260918-review-1234-v2-access-poll-30s-v1-20260926-speaker-v1-20260926-fan-v1-20260926-focus-ui-v1";
const a = (arg1) => document.querySelector(arg1);
installSettingsDialogBackdropGuard2();
const RS = 1020,
  sf = 2,
  HS = 1920,
  jS = 1080,
  qS = 1.1,
  US = a(".editor-header"),
  GS = a(".editor-shell");
function cf() {
  const max = Math.max(1, US.offsetHeight + GS.offsetHeight),
    min = Math.min(1, window.innerWidth / RS, window.innerHeight / max),
    v2 = min < 0.999;
  (document.documentElement.classList.toggle("editor-viewport-fit", v2),
    document.documentElement.style.setProperty("--editor-layout-height", max + "px"),
    document.documentElement.style.setProperty("--editor-viewport-scale", String(min)));
}
function lf() {
  const max2 = Math.max(0.1, qS * Math.min(window.innerWidth / HS, window.innerHeight / jS));
  document.documentElement.style.setProperty("--component-template-dialog-scale", String(max2));
}
(cf(), lf());
const _S = a("#logout"),
  df = a("#save"),
  mr = a("#license-open"),
  fi = a("#license-dialog"),
  fr = a("#license-dialog-retry"),
  jl = a("#license-retry-message"),
  YS = a("#license-close"),
  gi = a("#license-form"),
  Bs = a("#license-message"),
  XS = a("#license-detail-indicator"),
  KS = a("#license-detail-status"),
  JS = a("#license-detail-edition"),
  uf = a("#license-detail-error"),
  QS = createLicenseCard2({
    dialog: fi,
  }),
  $s = a("#ha-open"),
  Mn = a("#ha-dialog"),
  pf = a("#ha-close"),
  Qe = a("#ha-form"),
  ZS = a("#ha-test"),
  hi = a("#ha-message"),
  ex = a("#ha-sync-state"),
  tx = a("#ha-sync-detail"),
  nx = a("#ha-sync-overview"),
  ox = a("#ha-connection-view"),
  mf = a("#ha-detail-indicator"),
  ix = a("#ha-detail-name"),
  ff = a("#ha-detail-status"),
  gf = a("#ha-detail-url"),
  rx = a("#ha-detail-version"),
  ax = a("#ha-detail-counts"),
  hf = a("#ha-detail-error"),
  sx = a("#ha-edit"),
  cx = a("#ha-delete"),
  bf = a("#ha-edit-cancel"),
  yo = a("#delete-ha-dialog"),
  lx = a("#delete-ha-close"),
  dx = a("#delete-ha-cancel"),
  Fs = a("#delete-ha-form"),
  Ds = a("#delete-ha-message"),
  ux = a("#project-new"),
  Oe = a("#project-select"),
  zs = a("#project-actions-button"),
  Vs = a("#project-actions-menu"),
  px = a("#project-floorplan-open"),
  yf = a("#ui-pack-open"),
  mx = a("#ui-pack-current-name"),
  fx = a("#ui-pack-current-version"),
  vo = a("#ui-pack-dialog"),
  gx = a("#ui-pack-close"),
  ql = a("#ui-pack-list"),
  Ws = a("#ui-pack-message"),
  vf = a("#navigator-content"),
  hx = a(".page-control"),
  bx = a(".popup-control"),
  Ul = a("#show-page-editor"),
  Gl = a("#show-popup-editor"),
  wf = a("#page-new"),
  W = a("#page-select"),
  Rs = a("#page-actions-button"),
  Hs = a("#page-actions-menu"),
  _l = a("#default-page-action"),
  Cf = a("#popup-new"),
  Ze = a("#popup-select"),
  bi = a("#popup-list"),
  wo = a("#popup-actions-button"),
  _t = a("#popup-actions-menu"),
  Sf = a("#show-shared-components"),
  xf = a("#show-page-components"),
  js = a("#add-component-button"),
  yi = a("#component-template-dialog"),
  yx = a("#component-template-close"),
  vx = a("#component-template-scope"),
  Yl = a("#component-template-list"),
  Xl = a("#shared-component-list"),
  Kl = a("#page-component-list"),
  De = a("#component-context-menu"),
  un = a("#project-dialog"),
  wx = a("#project-dialog-kicker"),
  Cx = a("#project-dialog-title"),
  Sx = a("#project-close"),
  xx = a("#project-cancel"),
  gr = a("#project-form"),
  Jl = a("#project-submit"),
  hr = a("#project-message"),
  Nx = a("#project-template-fields"),
  Ql = a("#project-template-options"),
  vi = a("#project-preview-dialog"),
  Ex = a("#project-preview-title"),
  Lx = a("#project-preview-count"),
  Nf = a("#project-preview-image"),
  Ix = a("#project-preview-previous"),
  Tx = a("#project-preview-next"),
  Ax = a("#project-preview-close"),
  Co = a("#project-canvas-fields"),
  mt = a("#project-canvas-width"),
  ft = a("#project-canvas-height"),
  Ef = a("#project-aspect-ratio"),
  br = a("#project-aspect-lock"),
  Px = a("#project-aspect-lock-label"),
  Lf = a("#project-canvas-hint"),
  kx = a("#project-content-lock-fields"),
  If = a("#project-content-lock"),
  qs = a("#project-resize-warning-dialog"),
  Mx = a("#project-resize-warning-text"),
  Ox = a("#project-resize-warning-close"),
  Bx = a("#project-resize-warning-cancel"),
  $x = a("#project-resize-warning-confirm"),
  So = a("#page-dialog"),
  Fx = a("#page-dialog-kicker"),
  Dx = a("#page-dialog-title"),
  zx = a("#page-close"),
  Vx = a("#page-cancel"),
  Us = a("#page-form"),
  Zl = a("#page-submit"),
  ed = a("#page-message"),
  At = a("#component-group-rename-dialog"),
  Wx = a("#component-group-rename-close"),
  Rx = a("#component-group-rename-cancel"),
  Tf = a("#component-group-rename-form"),
  Af = a("#component-group-rename-input"),
  Pf = a("#component-group-rename-message"),
  Pt = a("#editor-canvas"),
  xo = a(".workspace"),
  Hx = a("#workspace-title"),
  td = a("#workspace-resolution"),
  Ve = document.createElement("button");
((Ve.id = "dashboard-sound-toggle"),
  (Ve.className = "workspace-sound-toggle"),
  (Ve.type = "button"),
  Ve.setAttribute("aria-pressed", "true"),
  Ve.setAttribute("aria-label", "关闭仪表盘音效"),
  (Ve.title = "关闭仪表盘音效"),
  (Ve.innerHTML =
    '<svg class="sound-icon sound-icon-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M18.5 7a7.5 7.5 0 0 1 0 10"/></svg><svg class="sound-icon sound-icon-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 9 5 6M22 9l-5 6"/></svg><span class="sound-label">按键音效</span>'),
  td.after(Ve));
const jx = a("#dashboard-display-hint"),
  yr = a("#dashboard-display-link"),
  qx = a("#display-devices-open"),
  nd = a("#display-devices-dialog"),
  Ux = a("#display-devices-close"),
  kf = a("#display-pairing-form"),
  Gx = a("#display-pairing-name"),
  Gs = a("#display-pairing-custom-code"),
  Mf = a("#display-pairing-generate"),
  _x = a("#display-device-count"),
  od = a("#display-device-list"),
  No = a("#display-devices-message"),
  On = a("#delete-pairing-dialog"),
  id = a("#delete-pairing-close"),
  rd = a("#delete-pairing-cancel"),
  ad = a("#delete-pairing-confirm"),
  Yx = a("#delete-pairing-name"),
  sd = a("#delete-pairing-message");
let vr = null,
  wr = false;
const Of = a("#show-editor-preview"),
  Bf = a("#show-dashboard-preview"),
  $f = a("#open-home-assistant"),
  Cr = a("#dashboard-preview"),
  Bn = a("#custom-popup-editor"),
  wi = createButtonSound2();
function cd() {
  if (!Ve) return;
  const v3 = Le === "edit";
  ((Ve.hidden = !v3),
    (Ve.disabled = !g),
    g &&
      typeof g.document?.soundEnabled == "boolean" &&
      wi.isEnabled() !== g.document.soundEnabled &&
      wi.setEnabled(g.document.soundEnabled),
    Ve.setAttribute("aria-pressed", String(wi.isEnabled())),
    (Ve.title = wi.isEnabled() ? "关闭仪表盘音效" : "开启仪表盘音效"),
    Ve.setAttribute("aria-label", Ve.title),
    Ve.classList.toggle("is-muted", !wi.isEnabled()));
}
const kt = a("#delete-project-dialog"),
  Xx = a("#delete-project-close"),
  Kx = a("#delete-project-cancel"),
  _s = a("#delete-project-form"),
  Jx = a("#delete-project-name"),
  Ys = a("#delete-project-message"),
  pn = a("#delete-page-dialog"),
  Qx = a("#delete-page-close"),
  Zx = a("#delete-page-cancel"),
  ld = a("#delete-page-confirm"),
  e1 = a("#delete-page-name"),
  Xs = a("#delete-page-message"),
  mn = a("#delete-component-dialog"),
  t1 = a("#delete-component-close"),
  n1 = a("#delete-component-cancel"),
  o1 = a("#delete-component-confirm"),
  Ff = a("#delete-component-name"),
  gt = a("#copy-component-page-dialog"),
  i1 = a("#copy-component-page-close"),
  r1 = a("#copy-component-page-cancel"),
  dd = a("#copy-component-page-form"),
  a1 = a("#copy-component-page-name"),
  $n = a("#copy-component-page-scope"),
  s1 = a("#copy-component-page-project-field"),
  Ci = a("#copy-component-page-project"),
  ZT = a("#copy-component-page-target-field"),
  c1 = a("#copy-component-page-target-label"),
  Eo = a("#copy-component-page-target"),
  Ks = a("#copy-component-scale-options"),
  Df = a("#copy-component-resolution-summary"),
  Fn = a("#copy-component-page-message"),
  Lo = a("#copy-component-page-submit"),
  Si = a("#copy-component-success-dialog"),
  l1 = a("#copy-component-success-message"),
  d1 = a("#copy-component-success-stay"),
  u1 = a("#copy-component-success-go"),
  Io = a("#error-dialog"),
  p1 = a("#error-dialog-close"),
  m1 = a("#error-dialog-confirm"),
  f1 = a("#error-dialog-message"),
  Dn = a("#recovery-dialog"),
  g1 = a("#recovery-discard"),
  h1 = a("#recovery-restore"),
  zf = a("#undo"),
  Vf = a("#redo"),
  ud = a("#inspector-empty"),
  To = a(".inspector"),
  Sr = a("#image-inspector"),
  b1 = a("#image-type"),
  Js = a("#image-label"),
  eA = a("#image-entity-picker"),
  xi = a("#image-entity-button"),
  xr = a("#image-entity-menu"),
  Nr = a("#image-entity-search"),
  Wf = a("#image-entity-options"),
  tA = a("#image-asset-picker"),
  zn = a("#image-asset-button"),
  et = a("#image-asset-menu"),
  Ao = a("#image-asset-folder"),
  Vn = a("#image-asset-search"),
  Yt = a("#image-asset-options"),
  Rf = a("#image-asset-upload"),
  Er = a("#image-asset-upload-input"),
  y1 = a("#image-asset-upload-hint"),
  fn = a("#image-asset-large-preview"),
  pd = a("#image-asset-large-preview-image"),
  v1 = a("#image-asset-large-preview-name"),
  Ct = a("#global-color-picker"),
  Ni = a("#global-color-picker-sv"),
  Hf = a("#global-color-picker-marker"),
  md = a("#global-color-picker-hue"),
  w1 = a("#global-color-picker-swatch"),
  Wn = a("#global-color-picker-hex"),
  fd = a("#global-color-picker-copy"),
  gd = a("#global-color-picker-paste"),
  hd = a("#global-color-picker-r"),
  bd = a("#global-color-picker-g"),
  yd = a("#global-color-picker-b"),
  Lr = a("#image-opacity"),
  jf = a("#image-layout-options"),
  Po = a("#image-left"),
  ko = a("#image-top"),
  Rn = a("#image-scale"),
  Mo = a("#image-rotation"),
  vd = a("#floorplan-auto-diagram-inspector"),
  Hn = a("#floorplan-auto-diagram-status"),
  Mt = a("#floorplan-auto-diagram-open-studio"),
  Ir = a("#floorplan-auto-diagram-view-toggle"),
  wd = a("#floorplan-auto-diagram-label"),
  Tr = a("#floorplan-auto-diagram-folder"),
  qf = a("#floorplan-auto-diagram-layout"),
  Ar = a("#floorplan-auto-diagram-left"),
  Pr = a("#floorplan-auto-diagram-top"),
  kr = a("#floorplan-auto-diagram-width"),
  Mr = a("#floorplan-auto-diagram-height"),
  Or = a("#floorplan-auto-diagram-scale"),
  Br = a("#floorplan-auto-diagram-rotation"),
  gn = a("#floorplan-auto-diagram-floor"),
  Uf = a("#floorplan-auto-diagram-camera-view"),
  Gf = a("#floorplan-auto-diagram-camera-mode"),
  $r = a("#floorplan-auto-diagram-focal-length"),
  _f = a("#floorplan-auto-diagram-rotate-top"),
  Yf = a("#floorplan-auto-diagram-open-base-lighting"),
  C1 = a("#floorplan-auto-diagram-bindings"),
  Xf = a("#floorplan-auto-diagram-binding-list"),
  We = a("#floorplan-auto-lighting-panel"),
  Fr = a("#floorplan-auto-lighting-handle"),
  S1 = a("#floorplan-auto-lighting-close"),
  x1 = a("#floorplan-auto-lighting-reset"),
  N1 = a("#floorplan-auto-lighting-save"),
  Ei = a("#floorplan-auto-lighting-status"),
  Cd = [...document.querySelectorAll("[data-floorplan-base-light]")];
let Dr = "",
  Sd = normalizeBaseLighting2(DEFAULT_BASE_LIGHTING2),
  Ot = null,
  zr = null;
const E1 = a("#component-action-controls"),
  St = a("#floorplan-auto-diagram-dialog"),
  L1 = a("#floorplan-auto-diagram-close"),
  Kf = a("#floorplan-auto-diagram-guide"),
  I1 = a("#floorplan-auto-diagram-later"),
  T1 = a("#floorplan-auto-diagram-continue"),
  Li = a("#icon-button-effect-inspector"),
  Jf = a("#ibe-label"),
  xd = a("#ibe-entity-button"),
  Qs = a("#ibe-entity-menu"),
  A1 = a("#ibe-entity-search"),
  P1 = a("#ibe-entity-options"),
  Nd = a("#ibe-color-temperature-realtime"),
  Ed = a("#ibe-brightness-realtime"),
  Ld = a("#ibe-preview-state"),
  Qf = a("#ibe-layer-options"),
  k1 = a("#ibe-button-section"),
  M1 = a("#ibe-effect-section"),
  Zf = a("#ibe-button-visible"),
  eg = a("#ibe-effect-visible"),
  O1 = a("#ibe-button-transform-section"),
  B1 = a("#ibe-action-section"),
  hn = a("#ibe-icon-button"),
  Vr = a("#ibe-icon-copy"),
  Bt = a("#ibe-icon-menu"),
  Wr = a("#ibe-icon-search"),
  Rr = a("#ibe-icon-options"),
  Id = a("#ibe-icon-off-color"),
  Td = a("#ibe-icon-on-color"),
  tg = a("#ibe-icon-size"),
  Ad = a("#ibe-button-off-color"),
  Pd = a("#ibe-button-on-color"),
  ng = a("#ibe-button-opacity"),
  og = a("#ibe-frame-color"),
  ig = a("#ibe-frame-width"),
  rg = a("#ibe-frame-opacity"),
  ag = a("#ibe-radius"),
  sg = a("#ibe-glow-color"),
  kd = a("#ibe-glow-off-strength"),
  Md = a("#ibe-glow-on-strength"),
  jn = a("#ibe-asset-button"),
  tt = a("#ibe-asset-menu"),
  Oo = a("#ibe-asset-folder"),
  qn = a("#ibe-asset-search"),
  bn = a("#ibe-asset-options"),
  cg = a("#ibe-asset-upload"),
  Hr = a("#ibe-asset-upload-input"),
  $1 = a("#ibe-asset-upload-hint"),
  lg = a("#ibe-effect-opacity"),
  dg = a("#ibe-effect-fade-duration"),
  ug = a("#ibe-effect-layout-options"),
  F1 = a("#ibe-effect-align-image"),
  Od = a("#ibe-effect-left"),
  Bd = a("#ibe-effect-top"),
  $d = a("#ibe-effect-scale"),
  Fd = a("#ibe-effect-rotation"),
  D1 = a("#ibe-effect-size-hint"),
  Un = a("#effect-image-align-dialog"),
  z1 = a("#effect-image-align-close"),
  V1 = a("#effect-image-align-cancel"),
  pg = a("#effect-image-align-confirm"),
  mg = a("#effect-image-align-options"),
  Zs = a("#effect-image-align-message"),
  jr = a("#ibe-left"),
  qr = a("#ibe-top"),
  Ii = a("#ibe-width"),
  Ti = a("#ibe-height"),
  Bo = a("#ibe-scale"),
  Ai = a("#ibe-rotation"),
  W1 = a("#ibe-action-controls"),
  ec = a("#ibe-apply-style"),
  R1 = a("#ibe-apply-count"),
  tc = a("#title-button-inspector"),
  fg = a("#title-button-label"),
  Dd = a("#title-button-entity-button"),
  nc = a("#title-button-entity-menu"),
  H1 = a("#title-button-entity-search"),
  j1 = a("#title-button-entity-options"),
  gg = a("#title-button-main-visible"),
  hg = a("#title-button-secondary-visible"),
  bg = a("#title-button-main-text"),
  oc = a("#title-button-secondary-line-1"),
  ic = a("#title-button-secondary-line-2"),
  yg = a("#title-button-main-color"),
  vg = a("#title-button-secondary-color"),
  wg = a("#title-button-main-size"),
  Cg = a("#title-button-secondary-size"),
  Sg = a("#title-button-main-weight"),
  xg = a("#title-button-secondary-weight"),
  Ng = a("#title-button-main-spacing"),
  Eg = a("#title-button-secondary-spacing"),
  Lg = a("#title-button-secondary-line-gap"),
  Ig = a("#title-button-main-left"),
  Tg = a("#title-button-main-top"),
  Ag = a("#title-button-secondary-left"),
  Pg = a("#title-button-secondary-top"),
  kg = a("#title-button-icon-visible"),
  yn = a("#title-button-icon-button"),
  Ur = a("#title-button-icon-copy"),
  nt = a("#title-button-icon-menu"),
  Gr = a("#title-button-icon-search"),
  _r = a("#title-button-icon-options"),
  Mg = a("#title-button-icon-color"),
  Og = a("#title-button-icon-size"),
  Bg = a("#title-button-icon-left"),
  $g = a("#title-button-icon-top"),
  Fg = a("#title-button-frame-color"),
  Dg = a("#title-button-frame-visible"),
  zg = a("#title-button-frame-width"),
  Vg = a("#title-button-frame-size"),
  Wg = a("#title-button-frame-spacing"),
  Rg = a("#title-button-frame-offset-x"),
  Hg = a("#title-button-frame-offset-y"),
  jg = a("#title-button-marker-visible"),
  qg = a("#title-button-marker-color"),
  Ug = a("#title-button-marker-size"),
  Gg = a("#title-button-marker-left"),
  _g = a("#title-button-marker-top"),
  zd = a("#title-button-left"),
  Vd = a("#title-button-top"),
  rc = a("#title-button-width"),
  ac = a("#title-button-height"),
  Yr = a("#title-button-scale"),
  sc = a("#title-button-rotation"),
  q1 = a("#title-button-action-controls"),
  cc = a("#title-button-apply-style"),
  U1 = a("#title-button-apply-count"),
  Wd = a("#light-statistics-inspector"),
  Yg = a("#light-statistics-label"),
  Xg = a("#light-statistics-title"),
  ht = a("#light-statistics-entity-button"),
  Be = a("#light-statistics-entity-menu"),
  Xr = a("#light-statistics-entity-search"),
  Kr = a("#light-statistics-entity-options"),
  Kg = a("#light-statistics-entity-pending"),
  nA = a("#light-statistics-pending-name"),
  oA = a("#light-statistics-pending-detail"),
  G1 = a("#light-statistics-entity-confirm"),
  Rd = a("#light-statistics-entity-message"),
  Jg = a("#light-statistics-entity-list"),
  _1 = a("#light-statistics-entity-count"),
  Hd = a("#light-statistics-action-entity-button"),
  lc = a("#light-statistics-action-entity-menu"),
  Y1 = a("#light-statistics-action-entity-search"),
  X1 = a("#light-statistics-action-entity-options"),
  K1 = a("#light-statistics-action-note"),
  J1 = a("#light-statistics-action-controls"),
  vn = a("#light-statistics-icon-button"),
  Jr = a("#light-statistics-icon-copy"),
  ot = a("#light-statistics-icon-menu"),
  Qr = a("#light-statistics-icon-search"),
  Zr = a("#light-statistics-icon-options"),
  Qg = a("#light-statistics-icon-visible"),
  Zg = a("#light-statistics-icon-color"),
  eh = a("#light-statistics-icon-active-color"),
  th = a("#light-statistics-icon-size"),
  nh = a("#light-statistics-title-visible"),
  oh = a("#light-statistics-title-color"),
  ih = a("#light-statistics-title-size"),
  rh = a("#light-statistics-title-weight"),
  ah = a("#light-statistics-title-spacing"),
  sh = a("#light-statistics-count-visible"),
  ch = a("#light-statistics-count-color"),
  lh = a("#light-statistics-count-active-color"),
  dh = a("#light-statistics-count-size"),
  uh = a("#light-statistics-count-weight"),
  ph = a("#light-statistics-count-spacing"),
  mh = a("#light-statistics-icon-gap"),
  fh = a("#light-statistics-count-gap"),
  jd = a("#light-statistics-left"),
  qd = a("#light-statistics-top"),
  dc = a("#light-statistics-width"),
  uc = a("#light-statistics-height"),
  ea = a("#light-statistics-scale"),
  pc = a("#light-statistics-rotation"),
  Pi = a("#icon-button-inspector"),
  Q1 = a("#icon-button-type-label"),
  Z1 = a("#icon-button-type"),
  gh = a("#icon-button-label"),
  hh = a("#presence-sensor-kind-label"),
  ta = a("#presence-sensor-kind"),
  ki = a("#icon-button-entity-button"),
  Mi = a("#icon-button-entity-menu"),
  Ud = a("#icon-button-entity-search"),
  Gd = a("#icon-button-entity-options"),
  _d = a("#cover-settings-inspector"),
  bh = a("#cover-settings-kind"),
  yh = a("#cover-settings-direction"),
  vh = a("#cover-settings-motor-direction"),
  mc = a("#icon-button-preview-state"),
  eN = a("#icon-button-preview-control"),
  $t = a("#icon-button-icon-button"),
  na = a("#icon-button-icon-copy"),
  Ft = a("#icon-button-icon-menu"),
  oa = a("#icon-button-icon-search"),
  ia = a("#icon-button-icon-options"),
  Oi = a("#icon-button-icon-color"),
  wh = a("#icon-button-icon-color-label"),
  Yd = a("#device-button-icon-visible"),
  Xd = a("#device-button-icon-on-color"),
  Ch = a("#device-button-icon-on-color-label"),
  Sh = a("#device-button-badge-color"),
  tN = a("#device-button-badge-color-label"),
  xh = a("#device-button-badge-opacity"),
  nN = a("#device-button-badge-opacity-label"),
  Nh = a("#icon-button-icon-size"),
  oN = a("#icon-button-icon-size-label"),
  Eh = a("#device-button-symbol-size"),
  iN = a("#device-button-symbol-size-label"),
  Lh = a("#device-button-badge-size"),
  rN = a("#device-button-badge-size-label"),
  fc = a("#device-button-state-precision"),
  aN = a("#device-button-state-precision-label"),
  Kd = a("#icon-button-icon-off-opacity"),
  Jd = a("#icon-button-icon-on-opacity"),
  sN = a("#icon-button-icon-off-opacity-label"),
  cN = a("#icon-button-icon-on-opacity-label"),
  Qd = a("#icon-button-icon-left"),
  Zd = a("#icon-button-icon-top"),
  eu = a("#icon-button-main-text"),
  tu = a("#icon-button-secondary-text"),
  Ih = a("#icon-button-main-heading"),
  nu = a("#device-button-main-visible"),
  lN = a("#icon-button-secondary-heading"),
  ou = a("#device-button-secondary-visible"),
  dN = a("#icon-button-main-content-label"),
  uN = a("#icon-button-secondary-content-label"),
  Th = a("#icon-button-main-color"),
  Ah = a("#icon-button-secondary-color"),
  iu = a("#icon-button-main-off-opacity"),
  ru = a("#icon-button-main-on-opacity"),
  au = a("#icon-button-secondary-off-opacity"),
  su = a("#icon-button-secondary-on-opacity"),
  pN = a("#icon-button-main-off-opacity-label"),
  mN = a("#icon-button-main-on-opacity-label"),
  fN = a("#icon-button-secondary-off-opacity-label"),
  gN = a("#icon-button-secondary-on-opacity-label"),
  Ph = a("#icon-button-main-size"),
  kh = a("#icon-button-secondary-size"),
  Mh = a("#icon-button-main-weight"),
  Oh = a("#icon-button-secondary-weight"),
  Bh = a("#icon-button-main-spacing"),
  $h = a("#icon-button-secondary-spacing"),
  Fh = a("#icon-button-main-left"),
  Dh = a("#icon-button-main-top"),
  zh = a("#icon-button-secondary-left"),
  Vh = a("#icon-button-secondary-top"),
  cu = a("#icon-button-on-fill-visible"),
  hN = a("#icon-button-fill-section"),
  lu = a("#icon-button-on-fill-color"),
  du = a("#icon-button-on-fill-strength"),
  Wh = a("#icon-button-on-fill-fade-duration"),
  Rh = a("#icon-button-frame-visible"),
  bN = a("#icon-button-frame-section"),
  Hh = a("#icon-button-frame-width"),
  jh = a("#icon-button-frame-angle"),
  uu = a("#icon-button-frame-off-opacity"),
  pu = a("#icon-button-frame-on-opacity"),
  qh = a("#icon-button-cut-corner"),
  Uh = a("#icon-button-soft-light-visible"),
  yN = a("#icon-button-soft-light-section"),
  Gh = a("#icon-button-soft-light-color"),
  _h = a("#icon-button-soft-light-strength"),
  Yh = a("#icon-button-soft-light-size"),
  Xh = a("#icon-button-soft-light-angle"),
  Kh = a("#icon-button-glow-visible"),
  vN = a("#icon-button-glow-section"),
  Jh = a("#icon-button-glow-color"),
  Qh = a("#icon-button-glow-strength"),
  Zh = a("#icon-button-glow-size"),
  eb = a("#icon-button-glow-angle"),
  mu = a("#icon-button-left"),
  fu = a("#icon-button-top"),
  gc = a("#icon-button-width"),
  hc = a("#icon-button-height"),
  ra = a("#icon-button-scale"),
  bc = a("#icon-button-rotation"),
  wN = a("#icon-button-action-controls"),
  CN = a("#icon-button-action-section"),
  tb = a("#icon-button-preview-details"),
  yc = a("#icon-button-apply-style"),
  SN = a("#icon-button-apply-count"),
  xN = a("#presence-motion-section"),
  NN = a("#door-window-perspective-section"),
  Gn = a("#door-window-perspective-edit"),
  EN = a("#door-window-perspective-reset"),
  vc = a("#door-window-perspective-save"),
  nb = a("#presence-halo-visible"),
  ob = a("#presence-halo-scale-x"),
  ib = a("#presence-halo-scale-y"),
  rb = a("#presence-halo-rotation"),
  ab = a("#presence-halo-opacity"),
  sb = a("#presence-person-visible"),
  cb = a("#presence-person-scale"),
  lb = a("#presence-person-rotation"),
  db = a("#presence-person-opacity"),
  ub = a("#presence-orbit-duration"),
  wc = a("#air-conditioner-inspector"),
  pb = a("#air-conditioner-label"),
  mb = a("#air-conditioner-device-type"),
  gu = a("#air-conditioner-entity-button"),
  Cc = a("#air-conditioner-entity-menu"),
  LN = a("#air-conditioner-entity-search"),
  IN = a("#air-conditioner-entity-options"),
  fb = a("#air-conditioner-preview-state"),
  gb = a("#air-conditioner-layer-options"),
  TN = a("#air-conditioner-button-section"),
  hb = a("#air-conditioner-airflow-section"),
  AN = a("#air-conditioner-transform-section"),
  PN = a("#air-conditioner-action-section"),
  bb = a("#air-conditioner-icon-visible"),
  yb = a("#air-conditioner-icon-off-color"),
  vb = a("#air-conditioner-icon-on-color"),
  wb = a("#air-conditioner-badge-color"),
  Cb = a("#air-conditioner-badge-opacity"),
  Sb = a("#air-conditioner-symbol-size"),
  xb = a("#air-conditioner-badge-size"),
  Nb = a("#air-conditioner-icon-left"),
  Eb = a("#air-conditioner-icon-top"),
  Lb = a("#air-conditioner-main-visible"),
  Ib = a("#air-conditioner-main-text"),
  Tb = a("#air-conditioner-main-color"),
  Ab = a("#air-conditioner-main-size"),
  Pb = a("#air-conditioner-main-weight"),
  kb = a("#air-conditioner-main-spacing"),
  Mb = a("#air-conditioner-main-left"),
  Ob = a("#air-conditioner-main-top"),
  Bb = a("#air-conditioner-secondary-visible"),
  $b = a("#air-conditioner-secondary-text"),
  Fb = a("#air-conditioner-secondary-color"),
  Db = a("#air-conditioner-secondary-size"),
  zb = a("#air-conditioner-secondary-weight"),
  Vb = a("#air-conditioner-secondary-spacing"),
  Wb = a("#air-conditioner-secondary-left"),
  Rb = a("#air-conditioner-secondary-top"),
  Hb = a("#air-conditioner-airflow-visible"),
  jb = a("#air-conditioner-airflow-motion"),
  qb = a("#air-conditioner-airflow-cool-color"),
  Ub = a("#air-conditioner-airflow-heat-color"),
  Gb = a("#air-conditioner-airflow-other-color"),
  _b = a("#air-conditioner-airflow-angle"),
  Yb = a("#air-conditioner-airflow-curve"),
  Xb = a("#air-conditioner-airflow-length"),
  Kb = a("#air-conditioner-airflow-fade"),
  Jb = a("#air-conditioner-airflow-spread"),
  Qb = a("#air-conditioner-airflow-density"),
  Zb = a("#air-conditioner-airflow-irregularity"),
  ey = a("#air-conditioner-airflow-thickness"),
  ty = a("#air-conditioner-airflow-strength"),
  ny = a("#air-conditioner-airflow-blur"),
  hu = a("#air-conditioner-airflow-speed"),
  aa = a("#air-conditioner-airflow-offset-x"),
  sa = a("#air-conditioner-airflow-offset-y"),
  oy = a("#air-conditioner-airflow-width"),
  iy = a("#air-conditioner-airflow-height"),
  bu = a("#air-conditioner-airflow-scale"),
  yu = a("#air-conditioner-airflow-rotation"),
  vu = a("#air-conditioner-left"),
  wu = a("#air-conditioner-top"),
  Sc = a("#air-conditioner-width"),
  xc = a("#air-conditioner-height"),
  ca = a("#air-conditioner-scale"),
  Nc = a("#air-conditioner-rotation"),
  kN = a("#air-conditioner-action-controls"),
  Cu = a("#air-conditioner-preview-details"),
  Su = a("#air-conditioner-apply-style"),
  MN = a("#air-conditioner-apply-count"),
  Ec = a("#vacuum-map-inspector"),
  ry = a("#vacuum-map-label"),
  xu = a("#vacuum-map-entity-button"),
  Lc = a("#vacuum-map-entity-menu"),
  ON = a("#vacuum-map-entity-search"),
  BN = a("#vacuum-map-entity-options"),
  ay = a("#vacuum-map-opacity"),
  Nu = a("#vacuum-map-left"),
  Eu = a("#vacuum-map-top"),
  la = a("#vacuum-map-scale"),
  Ic = a("#vacuum-map-rotation"),
  Tc = a("#camera-inspector"),
  sy = a("#camera-label"),
  Lu = a("#camera-entity-button"),
  Ac = a("#camera-entity-menu"),
  $N = a("#camera-entity-search"),
  FN = a("#camera-entity-options"),
  cy = a("#camera-fit-options"),
  ly = a("#camera-display-mode-options"),
  DN = a("#camera-refresh-interval-field"),
  da = a("#camera-refresh-interval"),
  dy = a("#camera-media-visible"),
  uy = a("#camera-frame-visible"),
  py = a("#camera-frame-color"),
  my = a("#camera-frame-width"),
  fy = a("#camera-radius"),
  gy = a("#camera-frame-angle"),
  hy = a("#camera-frame-opacity"),
  Iu = a("#camera-left"),
  Tu = a("#camera-top"),
  Pc = a("#camera-width"),
  kc = a("#camera-height"),
  ua = a("#camera-scale"),
  Mc = a("#camera-rotation"),
  zN = a("#camera-action-controls"),
  Oc = a("#camera-apply-style"),
  VN = a("#camera-apply-count"),
  pa = a("#time-inspector"),
  WN = a("#time-type"),
  by = a("#time-label"),
  yy = a("#time-hour-format"),
  vy = a("#time-seconds"),
  wy = a("#time-color"),
  Cy = a("#time-font-size"),
  Sy = a("#time-font-weight"),
  xy = a("#time-letter-spacing"),
  Ny = a("#time-opacity"),
  ma = a("#time-left"),
  fa = a("#time-top"),
  $o = a("#time-scale"),
  Bi = a("#time-rotation"),
  ga = a("#date-inspector"),
  RN = a("#date-type"),
  Ey = a("#date-label"),
  Ly = a("#date-weekday"),
  Iy = a("#date-lunar"),
  Ty = a("#date-primary-color"),
  Ay = a("#date-primary-size"),
  Py = a("#date-primary-weight"),
  ky = a("#date-primary-spacing"),
  My = a("#date-lunar-color"),
  Oy = a("#date-lunar-size"),
  By = a("#date-lunar-weight"),
  $y = a("#date-lunar-spacing"),
  Fy = a("#date-line-gap"),
  Dy = a("#date-opacity"),
  ha = a("#date-left"),
  ba = a("#date-top"),
  Fo = a("#date-scale"),
  $i = a("#date-rotation"),
  ya = a("#weather-inspector"),
  HN = a("#weather-type"),
  zy = a("#weather-label"),
  iA = a("#weather-entity-picker"),
  Au = a("#weather-entity-button"),
  Pu = a("#weather-entity-menu"),
  jN = a("#weather-entity-search"),
  qN = a("#weather-entity-options"),
  Vy = a("#weather-icon-visible"),
  Wy = a("#weather-temperature-visible"),
  Ry = a("#weather-condition-visible"),
  Hy = a("#weather-humidity-visible"),
  jy = a("#weather-icon-size"),
  qy = a("#weather-icon-gap"),
  Uy = a("#weather-temperature-color"),
  Gy = a("#weather-temperature-size"),
  _y = a("#weather-temperature-weight"),
  Yy = a("#weather-temperature-spacing"),
  Xy = a("#weather-secondary-color"),
  Ky = a("#weather-secondary-size"),
  Jy = a("#weather-secondary-weight"),
  Qy = a("#weather-secondary-spacing"),
  Zy = a("#weather-line-gap"),
  ev = a("#weather-opacity"),
  va = a("#weather-left"),
  wa = a("#weather-top"),
  Do = a("#weather-scale"),
  Fi = a("#weather-rotation"),
  Ca = a("#line-chart-inspector"),
  UN = a("#line-chart-type"),
  tv = a("#line-chart-label"),
  rA = a("#line-chart-entity-picker"),
  ku = a("#line-chart-entity-button"),
  Mu = a("#line-chart-entity-menu"),
  GN = a("#line-chart-entity-search"),
  _N = a("#line-chart-entity-options"),
  nv = a("#line-chart-value-visible"),
  ov = a("#line-chart-value-scale"),
  iv = a("#line-chart-value-color"),
  rv = a("#line-chart-state-precision"),
  av = a("#line-chart-value-offset-x"),
  sv = a("#line-chart-value-offset-y"),
  cv = a("#line-chart-update-interval"),
  lv = a("#line-chart-hours"),
  dv = a("#line-chart-curve-radius"),
  Ou = a("#line-chart-threshold-mode"),
  Di = [1, 2, 3, 4].map((arg2) => ({
    value: a("#line-chart-threshold-" + arg2 + "-value"),
    color: a("#line-chart-threshold-" + arg2 + "-color"),
  })),
  Sa = a("#line-chart-left"),
  xa = a("#line-chart-top"),
  zi = a("#line-chart-width"),
  Vi = a("#line-chart-height"),
  zo = a("#line-chart-scale"),
  Wi = a("#line-chart-rotation"),
  YN = a("#line-chart-action-controls"),
  Bc = a("#line-chart-apply-style"),
  XN = a("#line-chart-apply-count"),
  Na = a("#panel-frame-inspector"),
  KN = a("#panel-frame-type"),
  uv = a("#panel-frame-label"),
  pv = a("#panel-frame-main-visible"),
  mv = a("#panel-frame-main-text"),
  fv = a("#panel-frame-main-color"),
  gv = a("#panel-frame-main-size"),
  hv = a("#panel-frame-main-weight"),
  bv = a("#panel-frame-main-opacity"),
  yv = a("#panel-frame-main-spacing"),
  vv = a("#panel-frame-main-left"),
  wv = a("#panel-frame-main-top"),
  Cv = a("#panel-frame-secondary-visible"),
  Sv = a("#panel-frame-secondary-text"),
  xv = a("#panel-frame-secondary-color"),
  Nv = a("#panel-frame-secondary-size"),
  Ev = a("#panel-frame-secondary-weight"),
  Lv = a("#panel-frame-secondary-opacity"),
  Iv = a("#panel-frame-secondary-spacing"),
  Tv = a("#panel-frame-secondary-left"),
  Av = a("#panel-frame-secondary-top"),
  Pv = a("#panel-frame-edge-visible"),
  kv = a("#panel-frame-edge-color"),
  Mv = a("#panel-frame-edge-width"),
  Ov = a("#panel-frame-edge-opacity"),
  Bv = a("#panel-frame-radius"),
  $v = a("#panel-frame-edge-angle"),
  Fv = a("#panel-frame-glow-visible"),
  Dv = a("#panel-frame-glow-color"),
  zv = a("#panel-frame-glow-strength"),
  Vv = a("#panel-frame-glow-size"),
  Wv = a("#panel-frame-glow-angle"),
  Ea = a("#panel-frame-left"),
  La = a("#panel-frame-top"),
  Ri = a("#panel-frame-width"),
  Hi = a("#panel-frame-height"),
  Vo = a("#panel-frame-scale"),
  ji = a("#panel-frame-rotation"),
  $c = a("#panel-frame-apply-style"),
  JN = a("#panel-frame-apply-count"),
  Wo = a("#navigation-inspector"),
  Bu = a("#scene-mode-control"),
  QN = a("#scene-mode-hint"),
  Re = (arg3) => ["navigation-button", "scene-mode"].includes(arg3?.type),
  ZN = a("#navigation-type"),
  Fc = a("#navigation-label"),
  $u = a("#navigation-preview-state"),
  Ia = a("#navigation-entity-button"),
  Fu = a("#navigation-entity-menu"),
  eE = a("#navigation-entity-search"),
  tE = a("#navigation-entity-options"),
  Du = a("#navigation-main-text"),
  zu = a("#navigation-secondary-text"),
  Vu = a("#navigation-main-visible"),
  Wu = a("#navigation-secondary-visible"),
  Ru = a("#navigation-icon-visible"),
  Hu = a("#navigation-frame-visible"),
  ju = a("#navigation-glow-visible"),
  wn = a("#navigation-icon-button"),
  Ta = a("#navigation-icon-copy"),
  Dt = a("#navigation-icon-menu"),
  Aa = a("#navigation-icon-search"),
  Pa = a("#navigation-icon-options"),
  Rv = a("#navigation-main-color"),
  Hv = a("#navigation-secondary-color"),
  jv = a("#navigation-main-size"),
  qv = a("#navigation-secondary-size"),
  Uv = a("#navigation-main-weight"),
  Gv = a("#navigation-secondary-weight"),
  _v = a("#navigation-main-spacing"),
  Yv = a("#navigation-secondary-spacing"),
  Xv = a("#navigation-main-text-left"),
  Kv = a("#navigation-main-text-top"),
  Jv = a("#navigation-secondary-text-left"),
  Qv = a("#navigation-secondary-text-top"),
  qu = a("#navigation-text-idle-opacity"),
  Uu = a("#navigation-text-active-opacity"),
  Zv = a("#navigation-icon-color"),
  e0 = a("#navigation-icon-size"),
  t0 = a("#navigation-icon-left"),
  n0 = a("#navigation-icon-top"),
  Gu = a("#navigation-icon-idle-opacity"),
  _u = a("#navigation-icon-active-opacity"),
  o0 = a("#navigation-frame-color"),
  i0 = a("#navigation-frame-width"),
  Yu = a("#navigation-frame-idle-opacity"),
  Xu = a("#navigation-frame-active-opacity"),
  r0 = a("#navigation-frame-angle"),
  a0 = a("#navigation-glow-color"),
  s0 = a("#navigation-glow-angle"),
  Ku = a("#navigation-glow-idle-strength"),
  Ju = a("#navigation-glow-idle-size"),
  Qu = a("#navigation-glow-active-strength"),
  Zu = a("#navigation-glow-active-size"),
  c0 = a("#navigation-radius"),
  ka = a("#navigation-left"),
  Ma = a("#navigation-top"),
  Ro = a("#navigation-width"),
  Ho = a("#navigation-height"),
  _n = a("#navigation-scale"),
  jo = a("#navigation-rotation"),
  l0 = a("#navigation-action-controls"),
  Dc = a("#navigation-apply-style"),
  nE = a("#navigation-apply-count"),
  He = a("#navigation-style-apply-dialog"),
  oE = a("#navigation-style-apply-close"),
  Xt = a("#navigation-style-apply-title"),
  Kt = a("#navigation-style-apply-summary"),
  zt = a("#navigation-style-apply-properties"),
  Jt = a("#navigation-style-apply-target-heading"),
  Qt = a("#navigation-style-apply-target-scope"),
  ep = a("#navigation-style-apply-targets"),
  Ae = a("#navigation-style-apply-message"),
  iE = a("#navigation-style-apply-cancel"),
  rE = a("#navigation-style-apply-confirm"),
  zc = a("#popup-name-dialog"),
  aE = a("#popup-name-dialog-title"),
  Vc = a("#popup-name-form"),
  sE = a("#popup-name-close"),
  cE = a("#popup-name-cancel"),
  qi = a("#popup-module-dialog"),
  lE = a("#popup-module-dialog-title"),
  ye = a("#popup-module-form"),
  dE = a("#popup-module-close"),
  uE = a("#popup-module-cancel"),
  Cn = a("#popup-module-entity-button"),
  tp = a("#popup-module-entity-menu"),
  Wc = a("#popup-module-entity-search"),
  Ui = a("#popup-module-entity-options"),
  np = a("#popup-module-climate-device-type"),
  Rc = a("#delete-popup-dialog"),
  pE = a("#delete-popup-close"),
  mE = a("#delete-popup-cancel"),
  op = a("#delete-popup-confirm"),
  fE = a("#delete-popup-name"),
  qo = a("#delete-asset-dialog"),
  gE = a("#delete-asset-close"),
  hE = a("#delete-asset-cancel"),
  ip = a("#delete-asset-confirm"),
  bE = a("#delete-asset-name"),
  Yn = a("#delete-asset-folder-dialog"),
  yE = a("#delete-asset-folder-close"),
  vE = a("#delete-asset-folder-cancel"),
  Hc = a("#delete-asset-folder-confirm"),
  wE = a("#delete-asset-folder-name"),
  CE = a("#delete-asset-folder-count");
let re = null,
  Uo = null,
  x = null,
  it = null;
const d0 = new Map(),
  u0 = new Map(),
  p0 = new Map();
let Le = "edit",
  Vt = [],
  g = null,
  Go = 0,
  Ie = 0,
  jc = "shared",
  Wt = "create",
  rp = null,
  ve = "dwell-light",
  Oa = 2778,
  Ba = 1940,
  Sn = false,
  $a = 2778,
  Fa = 1940,
  _o = [],
  ap = [],
  xt = 0,
  sp = "create",
  st = false,
  Da = null,
  w = null,
  _e = null,
  qc = {
    componentId: null,
    at: 0,
  },
  ce = null,
  cp = "create",
  za = null,
  lp = null,
  Va = null,
  dp = null,
  Uc = null,
  Xn = [],
  Nt = [],
  m0 = null,
  Kn = [],
  K = [],
  Rt = [],
  up = new Map(),
  Yo = {},
  Jn = null,
  Xo = false,
  Gi = null,
  Wa = Promise.resolve(),
  xn = "",
  Nn = "",
  Zt = "builtin",
  en = "builtin",
  Gc = null,
  f0 = null,
  g0 = null,
  h0 = null,
  b0 = null,
  y0 = null,
  v0 = null,
  w0 = null,
  C0 = null,
  S0 = null,
  x0 = null,
  tn = "",
  Ko = -1,
  Ra = "",
  N0 = null,
  E0 = null,
  L0 = null,
  I0 = null,
  T0 = null,
  A0 = null,
  P0 = null,
  k0 = null,
  bt = null,
  pp = null;
const mp = new Set();
let B = new Set(),
  xe = null;
const ae = {
    undo: [],
    redo: [],
    busy: false,
  },
  fp = 10,
  _c = "ha-bridge:unsaved:";
let Qn = "",
  Ye = null,
  Zn = false,
  Ht = null,
  gp = 0,
  Ha = null,
  Jo = false,
  Ne = null,
  hp = null;
const _i = new Map(),
  En = new Map(),
  eo = new Map(),
  Yc = new Set(),
  bp = Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]),
  M0 = new Map(),
  Qo = new Map(),
  yp = new Map(),
  vp = new Map(),
  Zo = new Map(),
  Yi = new Map(),
  Xi = new Map(),
  Ki = new Map(),
  Ji = new Map(),
  Qi = new Map(),
  nn = new Map(),
  O0 = new Map(),
  B0 = new WeakSet();
let ei = null,
  he = null,
  Xc = "",
  ti = 0,
  ja = 0,
  qa = 1,
  Ua = null,
  $0 = null,
  wp = "",
  Cp = null;
async function _(arg4, v4 = {}) {
  const v5 = await fetch("/api/v1" + arg4, {
      cache: "no-store",
      ...v4,
      headers: v4.body
        ? {
            "Content-Type": "application/json",
            ...(v4.headers || {}),
          }
        : v4.headers,
    }),
    text = v5.status === 204 ? "" : await v5.text();
  let value2 = null;
  if (text)
    try {
      value2 = JSON.parse(text);
    } catch {
      if (v5.ok)
        throw new Error("接口返回格式异常：" + arg4.split("?")[0] + "（HTTP " + v5.status + "）");
    }
  if (v5.status === 401) {
    window.location.assign("/login");
    const error = new Error("登录状态已失效。");
    throw window.HABridgeLog?.linkError(error, v5) || error;
  }
  if (v5.status === 403 && value2?.detail?.code === "LICENSE_RESTRICTED") {
    window.location.replace("/license");
    const error2 = new Error("授权已失效，请重新激活。");
    throw window.HABridgeLog?.linkError(error2, v5) || error2;
  }
  if (!v5.ok) {
    const v6 = value2?.detail,
      slice = text.trim().slice(0, 240),
      error3 = new Error(
        typeof v6 == "string"
          ? v6
          : v6?.message ||
              "请求失败：" +
                arg4.split("?")[0] +
                "（HTTP " +
                v5.status +
                "）" +
                (slice ? " · " + slice : ""),
      );
    throw (
      v6 && typeof v6 == "object" && v6.code && (error3.code = v6.code),
      window.HABridgeLog?.linkError(error3, v5) || error3
    );
  }
  return value2;
}
function D(arg5, arg6, v7 = "") {
  ((arg5.hidden = !arg6),
    (arg5.textContent = arg6),
    (arg5.className = ("settings-message " + v7).trim()));
}
function $(arg7) {
  (window.HABridgeLog?.error(arg7, {
    projectId: g?.projectId || "",
    componentId: w || "",
    phase: "editor-operation",
  }),
    (f1.textContent = arg7?.message || "操作失败。"),
    Io.open || Io.showModal());
}
function to() {
  ((Vs.hidden = true), zs.setAttribute("aria-expanded", "false"));
}
function Ln() {
  ((Hs.hidden = true), Rs.setAttribute("aria-expanded", "false"));
}
function Kc() {
  ((_t.hidden = true), wo.setAttribute("aria-expanded", "false"), (lp = null));
}
function Et(v8 = ei) {
  v8 &&
    ((v8.menu.hidden = true),
    v8.button.setAttribute("aria-expanded", "false"),
    ei === v8 && (ei = null));
}
function F0(arg8) {
  if (arg8.menu.hidden) return;
  const boundingClientRect = arg8.button.getBoundingClientRect(),
    max3 = Math.max(80, Math.min(320, window.innerHeight - 16));
  ((arg8.menu.style.width = boundingClientRect.width + "px"),
    (arg8.menu.style.maxHeight = max3 + "px"));
  const min2 = Math.min(arg8.menu.scrollHeight, max3),
    max4 = Math.max(
      8,
      Math.min(window.innerWidth - boundingClientRect.width - 8, boundingClientRect.left),
    ),
    v9 = boundingClientRect.bottom + 4,
    max5 =
      v9 + min2 <= window.innerHeight - 8 ? v9 : Math.max(8, boundingClientRect.top - min2 - 4);
  ((arg8.menu.style.left = max4 + "px"), (arg8.menu.style.top = max5 + "px"));
}
function ne(arg9) {
  const v10 = nn.get(arg9);
  if (!v10) return;
  const element = arg9.selectedOptions[0],
    v11 = arg9.id === "page-select" && element?.dataset.defaultPage === "true";
  ((v10.button.textContent = v11
    ? "★ " + element.textContent
    : element?.textContent ||
      (arg9.id === "project-select"
        ? "暂无仪表盘"
        : arg9.id === "popup-select"
          ? "暂无组合弹窗"
          : arg9.id === "image-asset-folder"
            ? "暂无图片文件夹"
            : "暂无页面")),
    (v10.button.disabled = arg9.disabled));
  const text2 = arg9 === Ao ? "image" : arg9 === Oo ? "ibe" : "",
    Zt2 = text2 === "image" ? Zt : text2 === "ibe" ? en : "";
  (v10.menu.replaceChildren(
    ...[...arg9.options].map((arg10) => {
      const element2 = document.createElement("button");
      if (
        ((element2.type = "button"),
        (element2.className = "custom-select-option"),
        (element2.dataset.value = arg10.value),
        arg9.id === "page-select" && arg10.dataset.defaultPage === "true")
      ) {
        const element3 = document.createElement("span");
        ((element3.className = "custom-select-default-marker"),
          (element3.textContent = "★"),
          element3.setAttribute("aria-hidden", "true"));
        const element4 = document.createElement("span");
        ((element4.textContent = arg10.textContent), element2.append(element3, element4));
      } else element2.textContent = arg10.textContent;
      if (
        (element2.classList.toggle("active", arg10.value === arg9.value),
        (element2.disabled = arg10.disabled),
        !text2 || !Zp(Zt2, arg10.value))
      )
        return element2;
      const element5 = document.createElement("div");
      element5.className = "custom-select-option-row";
      const element6 = document.createElement("button");
      return (
        (element6.type = "button"),
        (element6.className = "custom-select-option-delete"),
        (element6.dataset.deleteStudio3dFolder = arg10.value),
        (element6.dataset.assetFolderKind = text2),
        (element6.title = "删除 " + arg10.textContent),
        element6.setAttribute("aria-label", "删除自动导图文件夹 " + arg10.textContent),
        (element6.textContent = "×"),
        element5.append(element2, element6),
        element5
      );
    }),
  ),
    arg9.disabled ? Et(v10) : v10.menu.hidden || window.requestAnimationFrame(() => F0(v10)));
}
function Sp(arg11) {
  if (!arg11 || nn.has(arg11) || arg11.dataset.nativeSelect === "true") return;
  const element7 = document.createElement("span");
  ((element7.className = "custom-select"),
    arg11.before(element7),
    element7.append(arg11),
    arg11.classList.add("native-select-control"));
  const element8 = document.createElement("button");
  ((element8.type = "button"),
    (element8.className = "custom-select-button"),
    element8.setAttribute("aria-label", arg11.getAttribute("aria-label") || "打开选择菜单"),
    element8.setAttribute("aria-haspopup", "listbox"),
    element8.setAttribute("aria-expanded", "false"),
    element7.append(element8));
  const element9 = document.createElement("div");
  ((element9.className = "custom-select-menu"),
    (element9.dataset.selectId = arg11.id),
    element9.setAttribute("role", "listbox"),
    (element9.hidden = true),
    (arg11.closest("dialog") || document.body).append(element9));
  const options = {
    select: arg11,
    wrapper: element7,
    button: element8,
    menu: element9,
  };
  (nn.set(arg11, options),
    ne(arg11),
    element8.addEventListener("click", () => {
      const hidden = element9.hidden;
      (Et(),
        to(),
        Ln(),
        hidden &&
          (ne(arg11),
          (element9.hidden = false),
          element8.setAttribute("aria-expanded", "true"),
          (ei = options),
          window.requestAnimationFrame(() => F0(options))));
    }),
    element9.addEventListener("click", (arg12) => {
      const closest = arg12.target.closest("[data-delete-studio3d-folder]");
      if (closest) {
        (arg12.preventDefault(),
          arg12.stopPropagation(),
          VC(closest.dataset.assetFolderKind, closest.dataset.deleteStudio3dFolder));
        return;
      }
      const closest2 = arg12.target.closest(".custom-select-option");
      if (!closest2 || closest2.disabled) return;
      const v12 = arg11.value;
      ((arg11.value = closest2.dataset.value),
        ne(arg11),
        Et(options),
        arg11.value !== v12 &&
          arg11.dispatchEvent(
            new Event("change", {
              bubbles: true,
            }),
          ));
    }),
    arg11.addEventListener("change", () => ne(arg11)),
    (options.observer = new MutationObserver(() => ne(arg11))),
    options.observer.observe(arg11, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "label", "selected"],
    }));
}
function Ga(v13 = document) {
  (v13 instanceof HTMLSelectElement && Sp(v13),
    v13.querySelectorAll?.("select").forEach((arg13) => Sp(arg13)));
}
function SE(arg14) {
  (Sp(arg14), (arg14.tabIndex = -1));
  const v14 = nn.get(arg14),
    { button: element10, menu: element11 } = v14;
  return {
    sync: () => ne(arg14),
    keydown(arg15) {
      if (arg15.key === "Escape" && !element11.hidden)
        return (arg15.preventDefault(), Et(v14), element10.focus(), true);
      const contains = element10.contains(arg15.target),
        contains2 = element11.contains(arg15.target);
      if (!(contains || contains2) || !["ArrowDown", "ArrowUp", "Home", "End"].includes(arg15.key))
        return false;
      (arg15.preventDefault(), element11.hidden && element10.click());
      const list = [...element11.querySelectorAll(".custom-select-option:not(:disabled)")];
      let indexOf = list.indexOf(document.activeElement);
      return (
        arg15.key === "Home"
          ? (indexOf = 0)
          : arg15.key === "End"
            ? (indexOf = list.length - 1)
            : contains
              ? (indexOf = Math.max(
                  0,
                  list.findIndex((arg16) => arg16.classList.contains("active")),
                ))
              : (indexOf =
                  (indexOf + (arg15.key === "ArrowDown" ? 1 : -1) + list.length) % list.length),
        list[indexOf]?.focus(),
        true
      );
    },
    destroy() {
      (Et(v14), v14.observer.disconnect(), element11.remove(), nn.delete(arg14));
    },
  };
}
function ni(arg17, v15 = false) {
  const v16 = normalizedHexColor2(arg17);
  if (!v16 || !he) return;
  const v17 = hexToRgb2(v16),
    v18 = rgbToHsv2(v17);
  ((ti = v18.s > 0 ? v18.h : ti),
    (ja = v18.s),
    (qa = v18.v),
    Ct.style.setProperty("--picker-hue", "hsl(" + ti + " 100% 50%)"),
    Ct.style.setProperty("--picker-color", v16),
    (Hf.style.left = ja * 100 + "%"),
    (Hf.style.top = (1 - qa) * 100 + "%"),
    (md.value = String(Math.round(ti))),
    document.activeElement !== Wn && (Wn.value = v16.toUpperCase()),
    (hd.value = String(Math.round(v17.r))),
    (bd.value = String(Math.round(v17.g))),
    (yd.value = String(Math.round(v17.b))),
    (w1.style.background = v16),
    he.value !== v16 &&
      ((he.value = v16),
      v15 &&
        he.dispatchEvent(
          new Event("input", {
            bubbles: true,
          }),
        )));
}
function D0() {
  const v19 = hsvToRgb2(ti, ja, qa);
  ni(rgbToHex2(v19.r, v19.g, v19.b), true);
}
function xp() {
  if (Ct.hidden || !he) return;
  const boundingClientRect2 = he.getBoundingClientRect(),
    boundingClientRect3 = Ct.getBoundingClientRect(),
    num = 9,
    num2 = 8,
    v20 = boundingClientRect2.left - boundingClientRect3.width - num,
    min3 =
      v20 >= num2
        ? v20
        : Math.min(
            window.innerWidth - boundingClientRect3.width - num2,
            boundingClientRect2.right + num,
          ),
    v21 = clampNumber2(
      boundingClientRect2.top,
      num2,
      Math.max(num2, window.innerHeight - boundingClientRect3.height - num2),
    );
  ((Ct.style.left = Math.max(num2, min3) + "px"), (Ct.style.top = v21 + "px"));
}
function z0(arg18) {
  if (!arg18 || arg18.disabled) return;
  (he && he !== arg18 && V0(), (he = arg18), (Xc = normalizedHexColor2(arg18.value) || "#000000"));
  const v22 = rgbToHsv2(hexToRgb2(Xc));
  ((ti = v22.h),
    (ja = v22.s),
    (qa = v22.v),
    (Ct.hidden = false),
    ni(Xc),
    window.requestAnimationFrame(xp));
}
function V0() {
  if (!he) return;
  const he2 = he,
    v23 = normalizedHexColor2(he2.value) !== Xc;
  ((Ct.hidden = true),
    (he = null),
    (Ua = null),
    v23 &&
      he2.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      ),
    iC(he2));
}
function xE() {
  !Ct.hidden && he?.isConnected && ni(he.value);
}
function _a(v24 = document) {
  (v24 instanceof HTMLInputElement && v24.type === "color"
    ? [v24]
    : [...(v24.querySelectorAll?.('input[type="color"]') || [])]
  ).forEach((arg19) => {
    O0.has(arg19) ||
      (O0.set(arg19, true),
      (arg19.title = "打开颜色选择器"),
      arg19.addEventListener("pointerdown", (arg20) => {
        (arg20.preventDefault(), z0(arg19));
      }),
      arg19.addEventListener("click", (arg21) => arg21.preventDefault()),
      arg19.addEventListener("keydown", (arg22) => {
        ["Enter", " "].includes(arg22.key) && (arg22.preventDefault(), z0(arg19));
      }));
  });
}
function Np(arg23, arg24) {
  if (!arg23 || arg23.disabled || arg23.readOnly) return false;
  const v25 = arg23.value;
  try {
    arg24 > 0 ? arg23.stepUp() : arg23.stepDown();
  } catch {
    const num3 = Number(arg23.dataset?.numberStep) || Number(arg23.step) || 1,
      num4 = Number(arg23.value) || 0,
      v26 = arg23.min === "" ? -Infinity : Number(arg23.min),
      v27 = arg23.max === "" ? Infinity : Number(arg23.max);
    arg23.value = String(clampNumber2(num4 + num3 * arg24, v26, v27));
  }
  return arg23.value === v25
    ? false
    : (arg23.dispatchEvent(
        new Event("input", {
          bubbles: true,
        }),
      ),
      true);
}
function Ya(v28 = document) {
  const list2 =
    v28 instanceof HTMLInputElement && v28.type === "number"
      ? [v28]
      : [
          ...(v28.querySelectorAll?.(
            '.inspector-form input[type="number"], .i3d-editor input[type="number"], .i3d-vacuum-map-editor input[type="number"]',
          ) || []),
        ];
  for (const element12 of list2) {
    if (B0.has(element12)) continue;
    B0.add(element12);
    const element13 = document.createElement("span");
    element13.className = "inspector-number-control";
    const element14 = document.createElement("span");
    element14.className = "inspector-number-steppers";
    const v29 = (arg25, arg26, arg27) => {
      const element15 = document.createElement("button");
      return (
        (element15.type = "button"),
        (element15.tabIndex = -1),
        (element15.className = "inspector-number-stepper"),
        element15.setAttribute("aria-label", arg26),
        (element15.innerHTML =
          '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="' + arg27 + '"></path></svg>'),
        element15.addEventListener("click", (arg28) => arg28.preventDefault()),
        element15.addEventListener("pointerdown", (arg29) => {
          if (arg29.button !== 0 || element12.disabled || element12.readOnly) return;
          (arg29.preventDefault(),
            element12.focus({
              preventScroll: true,
            }));
          let np2 = Np(element12, arg25),
            v30 = false,
            setTimeout = window.setTimeout(() => {
              setTimeout = window.setInterval(() => {
                np2 = Np(element12, arg25) || np2;
              }, 55);
            }, 320);
          const v31 = () => {
            v30 ||
              ((v30 = true),
              window.clearTimeout(setTimeout),
              window.clearInterval(setTimeout),
              element15.removeEventListener("pointerup", v31),
              element15.removeEventListener("pointercancel", v31),
              element15.removeEventListener("lostpointercapture", v31),
              np2 &&
                element12.dispatchEvent(
                  new Event("change", {
                    bubbles: true,
                  }),
                ));
          };
          (element15.addEventListener("pointerup", v31),
            element15.addEventListener("pointercancel", v31),
            element15.addEventListener("lostpointercapture", v31));
          try {
            element15.setPointerCapture(arg29.pointerId);
          } catch {}
        }),
        element15
      );
    };
    (element14.append(v29(1, "增加数值", "M1 5 5 1l4 4"), v29(-1, "减少数值", "M1 1 5 5l4-4")),
      element12.before(element13),
      element13.append(element12, element14));
    let v32 = false;
    (element12.addEventListener("keydown", (arg30) => {
      ["ArrowUp", "ArrowDown"].includes(arg30.key) &&
        (arg30.preventDefault(), (v32 = Np(element12, arg30.key === "ArrowUp" ? 1 : -1) || v32));
    }),
      element12.addEventListener("keyup", (arg31) => {
        !["ArrowUp", "ArrowDown"].includes(arg31.key) ||
          !v32 ||
          ((v32 = false),
          element12.dispatchEvent(
            new Event("change", {
              bubbles: true,
            }),
          ));
      }));
  }
}
function Ep(arg32) {
  (xo.classList.toggle("empty", !arg32),
    Pt.classList.toggle("workspace-empty-state", !arg32),
    Pt.classList.toggle("canvas-placeholder", arg32),
    (zs.disabled = !arg32),
    (yf.disabled = !arg32),
    (wf.disabled = !arg32),
    (Cf.disabled = !arg32),
    arg32 ||
      (Pt.removeAttribute("style"),
      (Pt.innerHTML = '<div class="canvas-message"><strong>请从左侧新建仪表盘。</strong></div>'),
      to(),
      Ln()),
    Ip(),
    R0(),
    cd());
}
function on(v33 = g?.document) {
  return v33?.uiPack?.id || "ui.base";
}
function Jc(v34 = on()) {
  return (
    Kn.find((arg33) => arg33.id === v34) ||
    (v34 === "ui.base"
      ? {
          id: "ui.base",
          name: "栖光",
          englishName: "DWELL LIGHT",
          version: "1.0.0",
          featureCode: "ui.base",
          description: "黑色界面与橙色高亮，包含现有控件、弹窗和示例素材。",
          includes: ["components", "popups", "assets"],
          allowed: true,
        }
      : null)
  );
}
function Lp() {
  const jc2 = Jc();
  ((mx.textContent = jc2?.name || "未知 UI"),
    (fx.textContent = jc2 ? (jc2.englishName || jc2.id) + " · " + jc2.version : on()));
}
function W0() {
  const v35 = on(),
    options2 = {
      dashboards: "仪表盘",
      components: "控件",
      popups: "弹窗",
      assets: "素材",
    };
  if (!Kn.length) {
    const element16 = document.createElement("div");
    ((element16.className = "component-template-empty"),
      (element16.textContent = "暂无可用 UI 方案。"),
      ql.replaceChildren(element16));
    return;
  }
  ql.replaceChildren(
    ...Kn.map((arg34) => {
      const element17 = document.createElement("article"),
        v36 = arg34.id === v35;
      element17.className = "ui-pack-card" + (v36 ? " current" : "");
      const element18 = document.createElement("div");
      if (((element18.className = "ui-pack-preview"), arg34.previewUrl)) {
        element18.classList.add("has-cover");
        const element19 = document.createElement("img");
        ((element19.src = arg34.previewUrl),
          (element19.alt = arg34.name + " 仪表盘预览"),
          element18.append(element19));
      }
      const element20 = document.createElement("div");
      element20.className = "ui-pack-card-copy";
      const element21 = document.createElement("span");
      element21.textContent = (arg34.englishName || arg34.id) + " · " + arg34.version;
      const element22 = document.createElement("strong");
      element22.textContent = arg34.name;
      const element23 = document.createElement("p");
      element23.textContent = arg34.description;
      const element24 = document.createElement("div");
      element24.className = "ui-pack-includes";
      for (const v37 of arg34.includes || []) {
        const element25 = document.createElement("i");
        ((element25.textContent = options2[v37] || v37), element24.append(element25));
      }
      const element26 = document.createElement("button");
      return (
        (element26.type = "button"),
        (element26.dataset.uiPackId = arg34.id),
        (element26.disabled = v36 || !arg34.allowed),
        (element26.textContent = v36
          ? "当前使用"
          : arg34.allowed
            ? "应用到当前仪表盘"
            : "尚未解锁"),
        !v36 && arg34.allowed && (element26.className = "primary"),
        element20.append(element21, element22, element23, element24, element26),
        element17.append(element18, element20),
        element17
      );
    }),
  );
}
async function Xa() {
  return ((Kn = (await _("/ui-packs?_=" + Date.now())).items || []), Lp(), vo.open && W0(), Kn);
}
function oi() {
  (it?.destroy(), (it = null));
}
function Qc(v38 = W.value) {
  if (Le !== "dashboard") {
    oi();
    return;
  }
  if (!g?.document?.pages?.length) {
    (oi(),
      (Cr.innerHTML =
        '<div class="canvas-message"><strong>' +
        (g ? "请从左侧新建页面。" : "请从左侧新建仪表盘。") +
        "</strong></div>"));
    return;
  }
  (it ||
    ((it = new PanelRenderer2(Cr, {
      editable: false,
      historySeriesCache: d0,
      runtimeStateCache: u0,
      virtualEntityStateCache: p0,
      onError: $,
      onRuntimeButtonPress() {
        wi.play();
      },
      onPageChange(arg35) {
        ((W.value = arg35.path), ne(W));
      },
    })),
    it.setEntityCatalog(K, Yo, Rt)),
    it.setDocument(g.document, v38));
}
function R0() {
  const trim = String(g?.document?.name || "").trim(),
    v39 = Le === "dashboard" && !!trim;
  if (((jx.hidden = !v39), !v39)) {
    (yr.removeAttribute("href"), (yr.textContent = ""));
    return;
  }
  const uRL = new URL("/habridge/" + encodeURIComponent(trim), window.location.origin);
  ((yr.href = uRL.href), (yr.textContent = decodeURI(uRL.href)), (yr.title = uRL.href));
}
function NE(arg36) {
  const date = new Date(arg36);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date)
    : "尚未在线";
}
async function Zc() {
  if (!g) return;
  const list3 =
    (await _("/displays/pairing-codes?projectId=" + encodeURIComponent(g.projectId))).items || [];
  if (((_x.textContent = list3.length + " 个"), od.replaceChildren(), !list3.length)) {
    const element27 = document.createElement("p");
    ((element27.textContent = "暂无配对码"), od.append(element27));
    return;
  }
  for (const v40 of list3) {
    const element28 = document.createElement("div");
    element28.className = "display-device-item" + (v40.enabled ? "" : " is-disabled");
    const element29 = document.createElement("div");
    element29.className = "display-device-copy";
    const element30 = document.createElement("strong");
    element30.textContent = v40.name;
    const element31 = document.createElement("span"),
      text3 = v40.device ? "已绑定 · 最后在线 " + NE(v40.device.lastSeenAt) : "等待设备配对";
    element31.textContent = (v40.enabled ? "已启用" : "已停用") + " · " + text3;
    const element32 = document.createElement("strong");
    ((element32.className = "display-device-code"), (element32.textContent = v40.code || "——"));
    const element33 = document.createElement("div");
    element33.className = "display-device-actions";
    const element34 = document.createElement("button");
    ((element34.type = "button"),
      (element34.textContent = v40.enabled ? "停用" : "启用"),
      element34.addEventListener("click", async () => {
        element34.disabled = true;
        try {
          (await _("/displays/pairing-codes/" + encodeURIComponent(v40.id), {
            method: "PATCH",
            body: JSON.stringify({
              enabled: !v40.enabled,
            }),
          }),
            await Zc());
        } catch (v41) {
          (D(No, v41.message, "error"), (element34.disabled = false));
        }
      }));
    const element35 = document.createElement("button");
    ((element35.type = "button"),
      (element35.className = "danger"),
      (element35.textContent = "删除"),
      element35.addEventListener("click", () => EE(v40)),
      element29.append(element30, element31));
    const element36 = document.createElement("button");
    ((element36.type = "button"),
      (element36.textContent = "扫码"),
      (element36.disabled = !v40.enabled),
      element36.addEventListener("click", () => showDisplayPairingQr2(v40)),
      element33.append(element36, element34, element35),
      element28.append(element29, element32, element33),
      od.append(element28));
  }
}
function EE(arg37) {
  wr || On.open || ((vr = arg37.id), (Yx.textContent = arg37.name), D(sd, ""), On.showModal());
}
function el() {
  wr || ((vr = null), On.close());
}
async function LE() {
  if (!(wr || !vr)) {
    ((wr = true), (ad.disabled = true), (rd.disabled = true), (id.disabled = true), D(sd, ""));
    try {
      (await _("/displays/pairing-codes/" + encodeURIComponent(vr), {
        method: "DELETE",
      }),
        (vr = null),
        On.close(),
        D(No, ""),
        await Zc());
    } catch (v42) {
      D(On.open ? sd : No, v42.message, "error");
    } finally {
      ((wr = false), (ad.disabled = false), (rd.disabled = false), (id.disabled = false));
    }
  }
}
async function IE() {
  if (g) {
    (D(No, ""), nd.open || nd.showModal());
    try {
      await Zc();
    } catch (v43) {
      D(No, v43.message, "error");
    }
  }
}
async function TE(arg38) {
  if ((arg38?.preventDefault(), !!g)) {
    ((Mf.disabled = true), D(No, ""));
    try {
      const _2 = await _("/displays/pairing-code", {
        method: "POST",
        body: JSON.stringify({
          projectId: g.projectId,
          name: Gx.value,
          code: Gs.value,
        }),
      });
      (kf.reset(), await Zc());
    } catch (v44) {
      D(No, v44.message, "error");
    } finally {
      Mf.disabled = false;
    }
  }
}
function Ip() {
  const v45 = g?.document?.canvas,
    v46 = Number(v45?.width),
    v47 = Number(v45?.height),
    finite = Le !== "popup" && Number.isFinite(v46) && v46 > 0 && Number.isFinite(v47) && v47 > 0;
  ((td.hidden = !finite),
    (td.textContent = finite ? Math.round(v46) + " × " + Math.round(v47) : ""));
}
function yt(arg39) {
  Le = ["edit", "dashboard", "popup"].includes(arg39) ? arg39 : "edit";
  const v48 = Le === "edit",
    v49 = Le === "dashboard",
    v50 = Le === "popup";
  ((hx.hidden = v50),
    (bx.hidden = !v50),
    vf.classList.toggle("popup-mode", v50),
    Ul.classList.toggle("active", !v50),
    Ul.setAttribute("aria-selected", String(!v50)),
    Gl.classList.toggle("active", v50),
    Gl.setAttribute("aria-selected", String(v50)),
    v48 || U0(),
    (Pt.hidden = !v48),
    (Cr.hidden = !v49),
    (Bn.hidden = !v50),
    xo.classList.toggle("empty", !g),
    (Hx.textContent = v49 ? "仪表盘" : v50 ? "组合弹窗" : "页面画布"),
    Ip(),
    R0(),
    cd());
  for (const [element37, v51] of [
    [Of, v48],
    [Bf, v49],
  ])
    (element37.classList.toggle("active", v51),
      element37.setAttribute("aria-selected", String(v51)));
  v48
    ? (oi(),
      g?.document?.pages?.length &&
        (ps().setDocument(g.document, W.value), x.setSelectedComponents([...B], w)),
      window.requestAnimationFrame(tl))
    : v49
      ? (x?.destroy(), (x = null), Qc(), window.requestAnimationFrame(() => it?.resize()))
      : v50 && (rn(), Xe(), J(), x?.destroy(), (x = null), oi(), cm());
}
function AE() {
  const trim2 = String(re?.baseUrl || "").trim();
  try {
    const uRL2 = new URL(trim2);
    if (!["http:", "https:"].includes(uRL2.protocol) || uRL2.username || uRL2.password)
      throw new Error();
    window.open(uRL2.href, "_blank", "noopener,noreferrer");
  } catch {
    $(new Error("请先配置有效的 Home Assistant 地址。"));
  }
}
function H0(v52 = !!g?.document?.pages?.length) {
  if (_l) {
    const ct2 = ct(),
      v53 = !!(ct2 && g?.document?.defaultPagePath === ct2.path);
    ((_l.textContent = v53 ? "已是默认首屏" : "设为默认首屏"), (_l.disabled = !v52 || v53));
  }
}
function j0(arg40) {
  ((W.disabled = !arg40), (Rs.disabled = !arg40), H0(arg40), tw(), ne(W), arg40 || Ln());
}
function tl() {
  if (!g) return;
  const computedStyle = getComputedStyle(xo),
    v54 =
      xo.clientWidth -
      Number.parseFloat(computedStyle.paddingLeft) -
      Number.parseFloat(computedStyle.paddingRight),
    v55 =
      xo.clientHeight -
      Number.parseFloat(computedStyle.paddingTop) -
      Number.parseFloat(computedStyle.paddingBottom),
    num5 = g.document.canvas.width || 2778,
    num6 = g.document.canvas.height || 1940,
    v56 = num5 / num6,
    v57 = v54 / v55 > v56,
    v58 = v57 ? v55 * v56 : v54,
    v59 = v57 ? v55 : v54 / v56;
  ((Pt.style.width = Math.max(1, v58) + "px"),
    (Pt.style.height = Math.max(1, v59) + "px"),
    (Cr.style.width = Math.max(1, v58) + "px"),
    (Cr.style.height = Math.max(1, v59) + "px"),
    window.requestAnimationFrame(() => {
      (x?.resize(), it?.resize());
    }));
}
const PE = new ResizeObserver(() => {
  (tl(), Bw(), it?.resize());
});
PE.observe(xo);
function ct() {
  return (
    g?.document?.pages?.find((arg41) => arg41.path === W.value) || g?.document?.pages?.[0] || null
  );
}
function q0(arg42, v60 = g?.document) {
  const list4 = [...new Set(arg42 || [])];
  if (list4.length < 2 || !v60) return false;
  const map = list4.map((arg43) => componentDirectLocation2(v60, arg43));
  if (map.some((arg44) => !arg44 || arg44.component.type === "group")) return false;
  const v61 = map[0];
  return map.every(
    (arg45) =>
      arg45.scope === v61.scope &&
      arg45.page?.path === v61.page?.path &&
      arg45.collection === v61.collection &&
      arg45.component.properties?.layoutMode !== "fill",
  );
}
function kE(arg46) {
  const list5 = [...new Set(arg46 || [])];
  if (!q0(list5)) {
    $(new Error("请选择同一页面或同一侧边栏中的两个或更多控件后再成组。"));
    return;
  }
  const v62 = newId2("group");
  return (
    (w = v62),
    (B = new Set([v62])),
    (xe = v62),
    (_e = null),
    E((arg47) => {
      const map2 = list5.map((arg48) => componentDirectLocation2(arg47, arg48));
      if (map2.some((arg49) => !arg49)) return;
      const collection = map2[0].collection,
        sort = map2
          .map((arg50) => arg50.component)
          .sort((arg51, arg52) => collection.indexOf(arg51) - collection.indexOf(arg52)),
        map3 = sort.map((arg53) => G0(arg53)),
        min4 = Math.min(...map3.map((arg54) => arg54.left)),
        min5 = Math.min(...map3.map((arg55) => arg55.top)),
        max6 = Math.max(...map3.map((arg56) => arg56.right)),
        max7 = Math.max(...map3.map((arg57) => arg57.bottom)),
        min6 = Math.min(...sort.map((arg58) => collection.indexOf(arg58))),
        map4 = sort.map((arg59) => ({
          ...arg59,
          position: {
            ...(arg59.position || {}),
            x: Number(arg59.position?.x || 0) - min4,
            y: Number(arg59.position?.y || 0) - min5,
          },
        })),
        options3 = {
          id: v62,
          type: "group",
          componentVersion: 1,
          position: {
            x: min4,
            y: min5,
            width: Math.max(1, max6 - min4),
            height: Math.max(1, max7 - min5),
            rotation: 0,
            zIndex: 1,
          },
          properties: {
            label: groupNameForCollection2(collection),
          },
          bindings: {},
          actions: {},
          style: {},
          children: map4,
        },
        set = new Set(list5),
        filter = collection.filter((arg60) => !set.has(arg60.id));
      if (
        (filter.splice(Math.min(min6, filter.length), 0, options3),
        collection.splice(0, collection.length, ...filter),
        applyCollectionLayerOrder2(collection),
        map2[0].scope === "shared")
      ) {
        for (const v63 of arg47.pages || []) {
          const list6 = v63.sharedComponentIds || [],
            filter2 = list6
              .map((arg61, arg62) => (set.has(arg61) ? arg62 : -1))
              .filter((arg63) => arg63 >= 0);
          if (!filter2.length) continue;
          const min7 = Math.min(...filter2),
            filter3 = list6.filter((arg64) => !set.has(arg64));
          (filter3.splice(Math.min(min7, filter3.length), 0, v62),
            (v63.sharedComponentIds = [...new Set(filter3)]));
        }
        syncSharedComponentReferenceOrder2(arg47);
      }
    })
  );
}
function ME(arg65) {
  const v64 = findComponentLocation2(g?.document, arg65);
  if (!v64 || v64.component.type !== "group") return;
  const map5 = (v64.component.children || []).map((arg66) => arg66.id);
  ((w = map5[0] || null),
    (B = new Set(map5)),
    (xe = w),
    (_e = null),
    E((arg67) => {
      const v65 = findComponentLocation2(arg67, arg65);
      if (!v65 || v65.component.type !== "group") return;
      const options4 = v65.component.position || {},
        options5 = v65.component.style || {},
        v66 = Number(options4.rotation || 0),
        max8 = Math.max(0.01, Math.min(5, Number(options5.scale || 1))),
        v67 = (v66 * Math.PI) / 180,
        cos = Math.cos(v67),
        sin = Math.sin(v67),
        v68 = Number(options4.width || 100),
        v69 = Number(options4.height || 100),
        v70 = Number(options4.x || 0) + v68 / 2,
        v71 = Number(options4.y || 0) + v69 / 2,
        map6 = (v65.component.children || []).map((arg68) => {
          const options6 = arg68.position || {},
            v72 = Number(options6.width || 100),
            v73 = Number(options6.height || 100),
            v74 = Number(options6.x || 0) + v72 / 2 - v68 / 2,
            v75 = Number(options6.y || 0) + v73 / 2 - v69 / 2,
            v76 = v74 * max8,
            v77 = v75 * max8,
            v78 = v70 + v76 * cos - v77 * sin,
            v79 = v71 + v76 * sin + v77 * cos,
            options7 = {
              ...(arg68.style || {}),
            },
            max9 = Math.max(0.01, Math.min(5, Number(options7.scale || 1) * max8));
          return (
            options5.visible === false && (options7.visible = false),
            (options7.scale = max9),
            {
              ...arg68,
              position: {
                ...options6,
                x: v78 - v72 / 2,
                y: v79 - v73 / 2,
                rotation: Number(options6.rotation || 0) + v66,
              },
              style: options7,
            }
          );
        });
      if (
        (v65.collection.splice(v65.index, 1, ...map6),
        applyCollectionLayerOrder2(v65.collection),
        v65.scope === "shared" && v65.root)
      ) {
        for (const v80 of arg67.pages || []) {
          const list7 = v80.sharedComponentIds || [],
            indexOf2 = list7.indexOf(arg65);
          indexOf2 < 0 ||
            (list7.splice(indexOf2, 1, ...map6.map((arg69) => arg69.id)),
            (v80.sharedComponentIds = [...new Set(list7)]));
        }
        syncSharedComponentReferenceOrder2(arg67);
      }
    }));
}
function OE(arg70) {
  const v81 = findComponent2(g?.document, arg70)?.component;
  !v81 ||
    v81.type !== "group" ||
    ((At.dataset.groupId = arg70),
    (Af.value = componentLabel2(v81)),
    D(Pf, ""),
    At.showModal(),
    window.setTimeout(() => Af.focus(), 0));
}
function Tp(arg71, arg72, v82 = null, v83 = false) {
  const v84 = findComponentLocation2(arg71, arg72);
  if (!v84) return null;
  const v85 = v82 ? clone2(v82) : refreshComponentIds2(clone2(v84.component));
  if (
    ((v85.properties = {
      ...(v85.properties || {}),
      label: copiedComponentLabel2(v84.component, v84.collection),
    }),
    delete v85.properties.previewState,
    v83)
  ) {
    const v86 = Number(arg71.canvas?.width || 2778),
      v87 = Number(arg71.canvas?.height || 1940),
      v88 = Number(v85.position?.width || 100),
      v89 = Number(v85.position?.height || 100);
    v85.position = {
      ...(v85.position || {}),
      x: clampNumber2(Number(v85.position?.x || 0) + 24, -v88 / 2, v86 - v88 / 2),
      y: clampNumber2(Number(v85.position?.y || 0) + 24, -v89 / 2, v87 - v89 / 2),
    };
  }
  if (
    (v84.collection.splice(v84.index, 0, v85),
    applyCollectionLayerOrder2(v84.collection),
    v84.scope === "shared" && v84.root)
  ) {
    for (const v90 of arg71.pages || []) {
      const indexOf3 = (v90.sharedComponentIds || []).indexOf(arg72);
      indexOf3 >= 0 && v90.sharedComponentIds.splice(indexOf3, 0, v85.id);
    }
    syncSharedComponentReferenceOrder2(arg71);
  }
  return v85;
}
function Ap(arg73, arg74) {
  const v91 = findComponentLocation2(arg73, arg74);
  if (!v91) return null;
  const [splice] = v91.collection.splice(v91.index, 1);
  if ((applyCollectionLayerOrder2(v91.collection), v91.scope === "shared" && v91.root)) {
    for (const v92 of arg73.pages || [])
      v92.sharedComponentIds = (v92.sharedComponentIds || []).filter((arg75) => arg75 !== arg74);
    syncSharedComponentReferenceOrder2(arg73);
  }
  return splice;
}
function Pp(arg76) {
  const lowerCase = String(arg76 || "")
    .trim()
    .toLowerCase();
  return /^#[\da-f]{6}$/.test(lowerCase) ? lowerCase : "";
}
function F() {
  return findComponent2(g?.document, w)?.component || null;
}
function nl(arg77) {
  return [...new Set(arg77 || [])].filter(
    (arg78) => !!findComponent2(g?.document, arg78)?.component,
  );
}
function BE(arg79) {
  if (_e) {
    const element38 = findComponent2(g?.document, _e)?.component;
    if (element38?.type === "group") return element38.children || [];
  }
  return arg79 === "shared" ? g?.document?.sharedComponents || [] : ct()?.components || [];
}
function kp(arg80, arg81, v93 = []) {
  for (const v94 of arg80 || [])
    (v94?.type === arg81 && v93.push(v94), kp(v94?.children, arg81, v93));
  return v93;
}
function $E(arg82) {
  return (g?.document?.pages || []).flatMap((arg83) =>
    kp(arg83.components, arg82).map((arg84) => ({
      component: arg84,
      page: arg83,
    })),
  );
}
function Pe(arg85) {
  if (!arg85) return [];
  const rr2 = rr(arg85);
  return [
    ...kp(g?.document?.sharedComponents, arg85.type).map((arg86) => ({
      component: arg86,
      scope: "shared",
    })),
    ...$E(arg85.type).map((arg87) => ({
      ...arg87,
      scope: "page",
    })),
  ].filter(
    ({ component: v95 }) =>
      v95.id !== arg85.id && (arg85.type !== "presence-sensor" || rr(v95) === rr2),
  );
}
function Ka() {
  (x?.setActiveGroup(_e), x?.setSelectedComponents([...B], w));
}
function rn() {
  (U0(), (w = null), (B = new Set()), (xe = null));
}
function U0() {
  for (const v96 of [_i, En, eo, Qo]) {
    for (const v97 of v96.keys()) x?.setComponentPreviewState(v97, "auto");
    v96.clear();
  }
}
function ol(arg88, { toggle: v98 = false, range: v99 = false, preserveGroup: v100 = false } = {}) {
  const v101 = findComponent2(g?.document, arg88);
  if (!v101) {
    (rn(), Ka(), Xe(), J());
    return;
  }
  const v102 = findComponent2(g?.document, w),
    v103 =
      v102?.scope === v101.scope && (v101.scope !== "page" || v102.page?.path === v101.page?.path);
  if (v100 && B.has(arg88)) w = arg88;
  else {
    if (v99 && v103 && xe) {
      const bE2 = BE(v101.scope),
        index = bE2.findIndex((arg89) => arg89.id === xe),
        index2 = bE2.findIndex((arg90) => arg90.id === arg88);
      if (index >= 0 && index2 >= 0) {
        const [list8, list9] = index <= index2 ? [index, index2] : [index2, index];
        ((B = new Set(bE2.slice(list8, list9 + 1).map((arg91) => arg91.id))), (w = arg88));
      } else ((B = new Set([arg88])), (w = arg88), (xe = arg88));
    } else {
      if (v98 && v103) {
        const set2 = new Set(B);
        (set2.has(arg88) ? set2.delete(arg88) : set2.add(arg88),
          (B = set2),
          (w = set2.has(arg88) ? arg88 : set2.values().next().value || null),
          (xe = arg88));
      } else
        !v98 && !v99 && B.size === 1 && B.has(arg88)
          ? rn()
          : ((B = new Set([arg88])), (w = arg88), (xe = arg88));
    }
  }
  if (v101.scope === "shared" && ct()?.path) {
    const v104 = clone2(g.document);
    ensureSharedComponentReference2(v104, arg88, ct().path) && Tt(v104, ct().path).catch($);
  }
  (w && al(v101.scope), Ka(), Xe(), J());
}
function E(arg92, v105 = W.value, { throwOnError: v106 = false } = {}) {
  const v107 = g?.projectId,
    Ie2 = Ie,
    v108 = () => Ie === Ie2 && g?.projectId === v107,
    v109 = Wa.catch(() => {})
      .then(async () => {
        if (!v108()) return;
        if (!g) throw new Error("请先选择仪表盘。");
        const v110 = documentSignature2(g.document),
          v111 = clone2(g.document),
          v112 = await arg92(v111);
        if (!(
          !v108() ||
          !(await Tt(v111, v105, {
            expectedSignature: v110,
          }))
        ))
          return v112;
      })
      .catch((arg93) => {
        if (v108()) throw arg93;
      });
  return ((Wa = v109.catch($)), v106 ? v109 : Wa);
}
function FE(arg94, arg95) {
  const nl2 = nl([...B]);
  !nl2.length ||
    (!arg94 && !arg95) ||
    E((arg96) => {
      const filter4 = nl2.map((arg97) => findComponent2(arg96, arg97)?.component).filter(Boolean);
      if (!filter4.length || filter4.some((arg98) => arg98.properties?.layoutMode === "fill"))
        return;
      const value3 =
        filter4.length === 1 && filter4[0].type === "air-conditioner" ? filter4[0] : null;
      if (value3 && vp.get(value3.id) === "airflow") {
        const max10 = Math.max(1, Number(value3.position?.width || 100)),
          max11 = Math.max(1, Number(value3.position?.height || 100)),
          v113 = airflowCanvasOffsetBounds2(value3, arg96.canvas);
        value3.properties = {
          ...(value3.properties || {}),
          airflowOffsetX: clampNumber2(
            Number(value3.properties?.airflowOffsetX ?? -75) + (arg94 / max10) * 100,
            v113.minX,
            v113.maxX,
          ),
          airflowOffsetY: clampNumber2(
            Number(value3.properties?.airflowOffsetY ?? 34) + (arg95 / max11) * 100,
            v113.minY,
            v113.maxY,
          ),
        };
        return;
      }
      const v114 = Number(arg96.canvas?.width || 2778),
        v115 = Number(arg96.canvas?.height || 1940),
        max12 = Math.max(
          ...filter4.map(
            (arg99) => -Number(arg99.position?.width || 100) / 2 - Number(arg99.position?.x || 0),
          ),
        ),
        min8 = Math.min(
          ...filter4.map(
            (arg100) =>
              v114 - Number(arg100.position?.width || 100) / 2 - Number(arg100.position?.x || 0),
          ),
        ),
        max13 = Math.max(
          ...filter4.map(
            (arg101) =>
              -Number(arg101.position?.height || 100) / 2 - Number(arg101.position?.y || 0),
          ),
        ),
        min9 = Math.min(
          ...filter4.map(
            (arg102) =>
              v115 - Number(arg102.position?.height || 100) / 2 - Number(arg102.position?.y || 0),
          ),
        ),
        v116 = clampNumber2(arg94, max12, min8),
        v117 = clampNumber2(arg95, max13, min9);
      for (const v118 of filter4) {
        if (value3) {
          const max14 = Math.max(1, Number(v118.position?.width || 100)),
            max15 = Math.max(1, Number(v118.position?.height || 100)),
            options8 = {
              ...(v118.position || {}),
              x: Number(v118.position?.x || 0) + v116,
              y: Number(v118.position?.y || 0) + v117,
            },
            v119 = airflowCanvasOffsetBounds2(
              {
                ...v118,
                position: options8,
              },
              arg96.canvas,
            );
          v118.properties = {
            ...(v118.properties || {}),
            airflowOffsetX: clampNumber2(
              Number(v118.properties?.airflowOffsetX ?? -75) - (v116 / max14) * 100,
              v119.minX,
              v119.maxX,
            ),
            airflowOffsetY: clampNumber2(
              Number(v118.properties?.airflowOffsetY ?? 34) - (v117 / max15) * 100,
              v119.minY,
              v119.maxY,
            ),
          };
        }
        v118.position = {
          ...(v118.position || {}),
          x: Number(v118.position?.x || 0) + v116,
          y: Number(v118.position?.y || 0) + v117,
        };
      }
    });
}
function G0(arg103) {
  const options9 = arg103.position || {},
    max16 = Math.max(0.01, Number(options9.width || 100)),
    max17 = Math.max(0.01, Number(options9.height || 100)),
    max18 = Math.max(0.01, Math.min(5, Number(arg103.style?.scale || 1))),
    v120 = (Number(options9.rotation || 0) * Math.PI) / 180,
    v121 =
      (Math.abs(Math.cos(v120)) * max16 * max18 + Math.abs(Math.sin(v120)) * max17 * max18) / 2,
    v122 =
      (Math.abs(Math.sin(v120)) * max16 * max18 + Math.abs(Math.cos(v120)) * max17 * max18) / 2,
    v123 = Number(options9.x || 0) + max16 / 2,
    v124 = Number(options9.y || 0) + max17 / 2;
  return {
    left: v123 - v121,
    top: v124 - v122,
    right: v123 + v121,
    bottom: v124 + v122,
  };
}
function _0(arg104) {
  if (B.size < 2 || !g || !w) return [];
  const filter5 = [...B]
      .map((arg105) => findComponent2(g.document, arg105)?.component)
      .filter(Boolean),
    v125 = filter5.find((arg106) => arg106.id === w);
  if (
    !v125 ||
    filter5.length !== B.size ||
    filter5.some((arg107) => arg107.properties?.layoutMode === "fill")
  )
    return [];
  const max19 = Math.max(0.01, Math.min(5, Number(v125.style?.scale || 1))),
    v126 = Math.max(0.01, Math.min(5, Number(arg104))) / max19,
    max20 = Math.max(
      ...filter5.map((arg108) => 0.01 / Math.max(0.01, Number(arg108.style?.scale || 1))),
    ),
    min10 = Math.min(
      ...filter5.map((arg109) => 5 / Math.max(0.01, Number(arg109.style?.scale || 1))),
    ),
    v127 = clampNumber2(v126, max20, min10),
    map7 = filter5.map(G0),
    v128 =
      (Math.min(...map7.map((arg110) => arg110.left)) +
        Math.max(...map7.map((arg111) => arg111.right))) /
      2,
    v129 =
      (Math.min(...map7.map((arg112) => arg112.top)) +
        Math.max(...map7.map((arg113) => arg113.bottom))) /
      2;
  return filter5.map((arg114) => {
    const options10 = arg114.position || {},
      v130 = Number(options10.width || 100),
      v131 = Number(options10.height || 100),
      v132 = Number(options10.x || 0) + v130 / 2,
      v133 = Number(options10.y || 0) + v131 / 2;
    return {
      componentId: arg114.id,
      x: v128 + (v132 - v128) * v127 - v130 / 2,
      y: v129 + (v133 - v129) * v127 - v131 / 2,
      scale: Math.max(0.01, Math.min(5, Number(arg114.style?.scale || 1) * v127)),
    };
  });
}
function il() {
  const filter6 = [...document.querySelectorAll(".element-item.selected[data-component-id]")]
    .map((arg115) => arg115.dataset.componentId)
    .filter(Boolean);
  return B.size > 1 ? [...B] : filter6;
}
function Lt(arg116, arg117, arg118, v134 = []) {
  const list10 = v134.length > 1 ? v134 : [arg117];
  for (const v135 of list10) {
    const v136 = findComponent2(arg116, v135)?.component;
    v136 &&
      (v136.position = {
        ...(v136.position || {}),
        rotation: arg118,
      });
  }
}
function DE(arg119) {
  return arg119
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M2.5 12s3.5-6 9.5-6c2 0 3.7.7 5.1 1.6M21.5 12s-3.5 6-9.5 6c-2 0-3.7-.7-5.1-1.6"/></svg>';
}
function Y0(arg120, arg121) {
  const nl3 = nl(arg120);
  nl3.length &&
    E((arg122) => {
      for (const v137 of nl3) {
        const element39 = findComponent2(arg122, v137)?.component;
        element39 &&
          (element39.style = {
            ...(element39.style || {}),
            visible: arg121,
          });
      }
    });
}
function Mp() {
  ((De.hidden = true), (hp = null));
}
function zE(arg123, arg124) {
  (arg123.preventDefault(), arg123.stopPropagation());
  const v138 = findComponent2(g?.document, arg124)?.component;
  (ol(arg124, {
    preserveGroup: true,
  }),
    (hp = arg124));
  const list11 = B.has(arg124) ? [...B] : [arg124],
    v139 = list11.length,
    selector = De.querySelector('[data-component-action="copy"]'),
    selector2 = De.querySelector('[data-component-action="copy-to-page"]'),
    selector3 = De.querySelector('[data-component-action="visibility"]'),
    selector4 = De.querySelector('[data-component-action="delete"]'),
    selector5 = De.querySelector('[data-component-action="group"]'),
    selector6 = De.querySelector('[data-component-action="ungroup"]'),
    selector7 = De.querySelector('[data-component-action="rename-group"]'),
    selector8 = De.querySelector(":scope > strong");
  selector.textContent = v139 > 1 ? "复制 " + v139 + " 个控件" : "复制控件";
  const v140 = findComponent2(g?.document, arg124)?.component,
    map8 = list11
      .map((arg125) => findComponent2(g?.document, arg125)?.component)
      .filter(Boolean)
      .map((arg126) => arg126.style?.visible !== false),
    every = map8.length === list11.length && map8.every((arg127) => arg127 === map8[0]);
  ((selector3.disabled = !every),
    (selector3.textContent = every
      ? map8[0]
        ? v139 > 1
          ? "批量隐藏 " + v139 + " 个"
          : "隐藏控件"
        : v139 > 1
          ? "批量显示 " + v139 + " 个"
          : "显示控件"
      : "批量隐藏/显示"),
    (selector3.title = every ? "" : "选中的控件包含隐藏和显示状态，无法批量处理"));
  const q02 = q0(list11);
  ((selector5.hidden = !q02),
    (selector6.hidden = v140?.type !== "group" || v139 !== 1),
    (selector7.hidden = v140?.type !== "group" || v139 !== 1),
    (selector2.textContent = "复制到其他区域"));
  const some = Vt.some((arg128) => arg128.id !== g?.projectId),
    x02 = X0(g?.document, list11);
  ((selector2.disabled = x02.length === 0 && !some),
    (selector2.title = selector2.disabled
      ? "当前没有可复制的目标区域"
      : v139 > 1
        ? "完整复制选中的 " + v139 + " 个控件到其他页面、侧边栏或其他仪表盘"
        : "完整复制当前控件到其他页面、侧边栏或其他仪表盘"),
    (selector4.textContent = v139 > 1 ? "删除 " + v139 + " 个控件" : "删除控件"),
    (selector8.textContent = v139 > 1 ? "颜色标签（" + v139 + " 个控件）" : "颜色标签"));
  const map9 = list11.map((arg129) => {
      const v141 = findComponent2(g?.document, arg129)?.component;
      return Pp(v141?.style?.editorLabelColor);
    }),
    value4 = map9.every((arg130) => arg130 === map9[0]) ? map9[0] : null;
  for (const element40 of De.querySelectorAll("[data-label-color]"))
    element40.classList.toggle(
      "active",
      value4 !== null && element40.dataset.labelColor === value4,
    );
  ((De.hidden = false),
    (De.style.left = "0px"),
    (De.style.top = "0px"),
    window.requestAnimationFrame(() => {
      const boundingClientRect4 = De.getBoundingClientRect(),
        v142 = clampNumber2(
          arg123.clientX,
          8,
          Math.max(8, window.innerWidth - boundingClientRect4.width - 8),
        ),
        v143 = clampNumber2(
          arg123.clientY,
          8,
          Math.max(8, window.innerHeight - boundingClientRect4.height - 8),
        );
      ((De.style.left = v142 + "px"), (De.style.top = v143 + "px"));
    }));
}
function X0(arg131, arg132) {
  const filter7 = [...new Set(arg132 || [])].filter(Boolean);
  if (!arg131 || !filter7.length) return [];
  const map10 = filter7.map(
      (arg133) => new Set(copyComponentTargets2(arg131, arg133).map((arg134) => arg134.key)),
    ),
    filter8 = [...(map10[0] || [])].filter((arg135) => map10.every((arg136) => arg136.has(arg135))),
    v144 = copyComponentTargets2(arg131, filter7[0]);
  return filter8.map((arg137) => v144.find((arg138) => arg138.key === arg137)).filter(Boolean);
}
function K0(arg139, arg140) {
  ((Ha = arg140 || null), (l1.textContent = arg139), Si.showModal());
}
async function VE() {
  const Ha2 = Ha;
  ((Ha = null),
    Si.close(),
    Ha2 &&
      (Ha2.projectId && Ha2.projectId !== g?.projectId
        ? await lm(Ha2.projectId, Ha2.pagePath)
        : Ha2.pagePath &&
          Ha2.pagePath !== W.value &&
          ((W.value = Ha2.pagePath),
          ne(W),
          x?.navigate(Ha2.pagePath),
          it?.navigate(Ha2.pagePath),
          Xe(),
          J()),
      al(Ha2.scope)));
}
function J0(arg141, v145 = w) {
  const nl4 = nl(arg141);
  nl4.length &&
    E((arg142) => {
      const map11 = new Map(nl4.map((arg143) => [arg143, findComponentLocation2(arg142, arg143)])),
        sort2 = nl4
          .filter((arg144) => map11.get(arg144))
          .sort((arg145, arg146) => {
            const v146 = map11.get(arg145),
              v147 = map11.get(arg146);
            return v146.collection === v147.collection ? v146.index - v147.index : 0;
          }),
        list12 = [],
        map12 = new Map();
      for (const v148 of sort2) {
        const tp2 = Tp(arg142, v148);
        tp2 && (list12.push(tp2.id), map12.set(v148, tp2.id));
      }
      list12.length && ((w = map12.get(v145) || list12[0]), (B = new Set(list12)), (xe = w));
    });
}
function WE(arg147, { includeShared: v149 = true, sourceComponentId: v150 = null } = {}) {
  if (!arg147) return [];
  if (v150) return copyComponentTargets2(arg147, v150);
  const map13 = (arg147.pages || []).map((arg148) => ({
    key: "page:" + arg148.path,
    name: arg148.name,
    scope: "page",
    page: arg148,
  }));
  return v149
    ? [
        {
          key: "shared",
          name: "侧边栏",
          scope: "shared",
        },
        ...map13,
      ]
    : map13;
}
function rl(arg149) {
  (Eo.replaceChildren(...arg149.map((arg150) => new Option(arg150.name, arg150.key))),
    (Eo.disabled = !arg149.length),
    (Eo.value = arg149[0]?.key || ""),
    ne(Eo));
}
function Q0(arg151) {
  return {
    width: Number(arg151?.canvas?.width || 2778),
    height: Number(arg151?.canvas?.height || 1940),
  };
}
function RE() {
  if (!($n.value === "other" && Ht)) {
    ((Ks.hidden = true), (Df.textContent = ""));
    return;
  }
  const q03 = Q0(g?.document),
    q04 = Q0(Ht.document),
    v151 = q03.width !== q04.width || q03.height !== q04.height;
  ((Ks.hidden = !v151),
    (Df.textContent = v151
      ? q03.width + " × " + q03.height + " → " + q04.width + " × " + q04.height
      : ""));
}
async function Op() {
  const v152 = $n.value === "other";
  let list13 = [];
  try {
    list13 = JSON.parse(gt.dataset.componentIds || "[]");
  } catch {
    list13 = [];
  }
  const v153 = findComponent2(g?.document, list13[0]),
    v154 = list13.length,
    selector9 = gt.querySelector("[data-copy-component-description]");
  if (
    ((s1.hidden = !v152),
    (c1.textContent = v152 ? "其他仪表盘目标页面" : "本仪表盘目标页面"),
    (Lo.textContent = v152 ? "复制到目标仪表盘" : "复制并前往"),
    (selector9.textContent = v152
      ? "将选中的 " + v154 + " 个控件完整复制到其他仪表盘的目标页面或侧边栏，源控件不受影响。"
      : v153?.scope === "shared"
        ? "将选中的 " + v154 + " 个侧边栏控件完整复制到指定主页面，复制后为该页面的独立控件。"
        : "将选中的 " +
          v154 +
          " 个控件完整复制到侧边栏或其他主页面，保留位置、尺寸、样式、实体绑定和动作配置。"),
    (Ht = null),
    (Ks.hidden = true),
    D(Fn, ""),
    !v152)
  ) {
    const x03 = X0(g?.document, list13);
    (rl(x03), (Lo.disabled = !x03.length));
    return;
  }
  const v155 = Ci.value;
  if (!v155) {
    (rl([]), (Lo.disabled = true), D(Fn, "当前没有其他仪表盘可以复制。"));
    return;
  }
  const v156 = ++gp;
  (rl([]), (Lo.disabled = true), D(Fn, "正在读取目标仪表盘…"));
  try {
    const _3 = await _("/projects/" + encodeURIComponent(v155) + "/draft");
    if (v156 !== gp || $n.value !== "other") return;
    Ht = _3;
    const wE2 = WE(_3.document);
    (rl(wE2),
      RE(),
      D(Fn, wE2.length ? "" : "目标仪表盘还没有可复制到的区域。"),
      (Lo.disabled = !wE2.length));
  } catch (v157) {
    if (v156 !== gp) return;
    D(Fn, v157.message, "error");
  }
}
function HE(arg152) {
  const v158 = g?.document,
    filter9 = [...new Set(arg152 || [])].filter((arg153) => findComponent2(v158, arg153)),
    v159 = findComponent2(v158, filter9[0]);
  if (!v159 || !filter9.length) {
    $(new Error("没有找到要复制的控件。"));
    return;
  }
  ((gt.dataset.componentIds = JSON.stringify(filter9)),
    (a1.textContent =
      filter9.length > 1
        ? "已选择 " + filter9.length + " 个控件"
        : "“" + componentLabel2(v159.component) + "”"),
    (gt.querySelector("[data-copy-component-description]").textContent =
      filter9.length > 1
        ? "将选中的 " + filter9.length + " 个控件完整复制到目标区域。"
        : v159.scope === "shared"
          ? "将侧边栏控件完整复制到指定主页面，复制后为该页面的独立控件。"
          : "将当前控件完整复制到侧边栏或其他主页面，保留位置、尺寸、样式、实体绑定和动作配置。"),
    ($n.value = "current"),
    ne($n));
  const filter10 = Vt.filter((arg154) => arg154.id !== g.projectId);
  (Ci.replaceChildren(...filter10.map((arg155) => new Option(arg155.name, arg155.id))),
    (Ci.disabled = !filter10.length),
    ne(Ci),
    (dd.elements.copyScaleMode.value = "proportional"),
    gt.showModal(),
    Op());
}
function Z0(arg156) {
  const nl5 = nl(arg156);
  if (!nl5.length) {
    $(new Error("没有找到要删除的控件。"));
    return;
  }
  if (((mn.dataset.componentIds = JSON.stringify(nl5)), nl5.length > 1))
    Ff.textContent = "“已选择的 " + nl5.length + " 个控件”";
  else {
    const v160 = findComponent2(g?.document, nl5[0])?.component;
    Ff.textContent =
      "“" +
      componentLabel2(
        v160 || {
          type: "控件",
        },
      ) +
      "”";
  }
  mn.showModal();
}
function jE(arg157, arg158) {
  const list14 = [...new Set(arg157 || [])];
  if (!list14.length) return;
  const pp2 = Pp(arg158);
  E((arg159) => {
    for (const v161 of list14) {
      const element41 = findComponent2(arg159, v161)?.component;
      element41 &&
        ((element41.style = {
          ...(element41.style || {}),
        }),
        pp2 ? (element41.style.editorLabelColor = pp2) : delete element41.style.editorLabelColor);
    }
  });
}
function ew(arg160, arg161, arg162, arg163) {
  if ((arg160.replaceChildren(), !arg161.length)) {
    const element42 = document.createElement("div");
    ((element42.className = "element-list-empty"),
      (element42.textContent = arg162),
      arg160.append(element42));
    return;
  }
  for (const element43 of arg161) {
    const element44 = document.createElement("div");
    ((element44.className = "element-item"),
      (element44.dataset.componentId = element43.id),
      (element44.dataset.scope = arg163),
      (element44.draggable = !_e),
      element44.classList.toggle("selected", B.has(element43.id)),
      element44.classList.toggle("selection-primary", element43.id === w),
      element44.classList.toggle("group-item", element43.type === "group"));
    const pp3 = Pp(element43.style?.editorLabelColor);
    (element44.classList.toggle("has-color-label", !!pp3),
      pp3 && element44.style.setProperty("--element-label-color", pp3));
    const element45 = document.createElement("i");
    ((element45.className =
      element43.type === "group" ? "element-group-icon" : "element-label-color"),
      element45.setAttribute("aria-hidden", "true"),
      element43.type === "group" &&
        (element45.innerHTML =
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3.5 7.5h6l1.8 2h9.2v9.5h-17z"/><path d="M3.5 7.5v-1h6l1.8 2"/></svg>'));
    const element46 = document.createElement("span");
    element46.textContent = componentLabel2(element43);
    const v162 = element43.style?.visible !== false,
      element47 = document.createElement("button");
    ((element47.type = "button"),
      (element47.className = "element-visibility" + (v162 ? "" : " hidden-element")),
      element47.setAttribute(
        "aria-label",
        v162 ? "隐藏" + componentLabel2(element43) : "显示" + componentLabel2(element43),
      ),
      (element47.innerHTML = DE(v162)));
    const v163 = (arg164) => {
      ((qc = {
        componentId: element43.id,
        at: Date.now(),
      }),
        arg164.stopPropagation());
    };
    (element47.addEventListener("pointerdown", v163),
      element47.addEventListener("click", (arg165) => {
        ((qc = {
          componentId: element43.id,
          at: Date.now(),
        }),
          arg165.stopPropagation(),
          ol(element43.id, {
            preserveGroup: true,
          }),
          Y0([element43.id], !v162));
      }),
      element47.addEventListener("dblclick", v163),
      element44.append(element45, element46, element47),
      element44.addEventListener("click", (arg166) => {
        ol(element43.id, {
          toggle: arg166.metaKey || arg166.ctrlKey,
          range: arg166.shiftKey,
        });
      }),
      element44.addEventListener("dblclick", (arg167) => {
        if (element43.type !== "group" || arg167.target.closest(".element-visibility")) return;
        if (qc.componentId === element43.id && Date.now() - qc.at < 600) {
          (arg167.preventDefault(), arg167.stopPropagation());
          return;
        }
        (arg167.preventDefault(),
          arg167.stopPropagation(),
          (_e = element43.id),
          rn(),
          Xe(),
          Ka(),
          J());
      }),
      element44.addEventListener("contextmenu", (arg168) => zE(arg168, element43.id)),
      element44.addEventListener("dragstart", (arg169) => {
        B.has(element43.id)
          ? (w = element43.id)
          : ((B = new Set([element43.id])), (w = element43.id), (xe = element43.id));
        const list15 = [...B];
        ((arg169.dataTransfer.effectAllowed = "move"),
          arg169.dataTransfer.setData(
            "text/plain",
            JSON.stringify({
              scope: arg163,
              sourceId: element43.id,
              movingIds: list15,
            }),
          ),
          arg160.querySelectorAll(".element-item").forEach((arg170) => {
            arg170.classList.toggle("dragging", list15.includes(arg170.dataset.componentId));
          }));
      }),
      element44.addEventListener("dragend", () => {
        (arg160
          .querySelectorAll(".dragging")
          .forEach((arg171) => arg171.classList.remove("dragging")),
          arg160
            .querySelectorAll(".drop-before, .drop-after")
            .forEach((arg172) => arg172.classList.remove("drop-before", "drop-after")));
      }),
      element44.addEventListener("dragover", (arg173) => {
        if (!arg173.dataTransfer.types.includes("text/plain")) return;
        (arg173.preventDefault(), (arg173.dataTransfer.dropEffect = "move"));
        const v164 =
          arg173.clientY >=
          element44.getBoundingClientRect().top + element44.getBoundingClientRect().height / 2;
        (element44.classList.toggle("drop-before", !v164),
          element44.classList.toggle("drop-after", v164));
      }),
      element44.addEventListener("dragleave", () =>
        element44.classList.remove("drop-before", "drop-after"),
      ),
      element44.addEventListener("drop", (arg174) => {
        arg174.preventDefault();
        let v165;
        try {
          v165 = JSON.parse(arg174.dataTransfer.getData("text/plain"));
        } catch {
          return;
        }
        const { scope: v166, sourceId: v167 } = v165,
          movingIds = Array.isArray(v165.movingIds) ? v165.movingIds : [v167],
          contains3 = element44.classList.contains("drop-after");
        (element44.classList.remove("drop-before", "drop-after"),
          !(v166 !== arg163 || !v167 || movingIds.includes(element43.id)) &&
            ((w = v167),
            (B = new Set(movingIds)),
            E((arg175) => {
              const sharedComponents =
                arg163 === "shared"
                  ? arg175.sharedComponents
                  : arg175.pages.find((arg176) => arg176.path === W.value)?.components;
              if (!sharedComponents) return;
              const set3 = new Set(movingIds),
                filter11 = sharedComponents.filter((arg177) => set3.has(arg177.id));
              if (!filter11.length) return;
              const filter12 = sharedComponents.filter((arg178) => !set3.has(arg178.id)),
                index3 = filter12.findIndex((arg179) => arg179.id === element43.id);
              index3 < 0 ||
                (filter12.splice(index3 + (contains3 ? 1 : 0), 0, ...filter11),
                sharedComponents.splice(0, sharedComponents.length, ...filter12),
                applyCollectionLayerOrder2(sharedComponents),
                arg163 === "shared" && syncSharedComponentReferenceOrder2(arg175));
            })));
      }),
      arg160.append(element44));
  }
}
function qE(arg180, arg181) {
  if (!arg181) return;
  const element48 = document.createElement("button");
  ((element48.type = "button"),
    (element48.className = "element-group-back"),
    (element48.textContent = "← 返回" + componentLabel2(arg181)),
    element48.addEventListener("click", () => {
      ((_e = null), rn(), Xe(), Ka(), J());
    }),
    arg180.prepend(element48));
}
function Xe() {
  const ct3 = ct(),
    value5 = _e ? findComponent2(g?.document, _e) : null,
    component2 = value5?.component?.type === "group" ? value5.component : null;
  _e && !component2 && (_e = null);
  const list16 =
      component2 && value5.scope === "shared"
        ? component2.children || []
        : g?.document?.sharedComponents || [],
    list17 =
      component2 && value5.scope === "page" ? component2.children || [] : ct3?.components || [];
  (ew(Xl, list16, "暂无侧边栏控件", "shared"),
    ew(Kl, list17, "暂无主页面控件", "page"),
    component2 && qE(value5.scope === "shared" ? Xl : Kl, component2));
}
function al(arg182) {
  jc = arg182 === "page" ? "page" : "shared";
  const v168 = jc === "shared";
  (Sf.classList.toggle("active", v168),
    xf.classList.toggle("active", !v168),
    (Xl.hidden = !v168),
    (Kl.hidden = v168),
    tw());
}
function tw() {
  const v169 = !!ct(),
    v170 = on(),
    some2 = ["shared", "page"].some((arg183) => listComponentTemplates2(arg183, v170).length > 0);
  ((js.disabled = !v169 || !some2),
    (js.title = v169 ? (some2 ? "从模板库添加控件" : "该区域暂无可用控件模板") : "请先新建页面"));
}
function UE() {
  const v171 = on(),
    filter13 = [
      ...listComponentTemplates2("shared", v171),
      ...listComponentTemplates2("page", v171),
    ].filter(
      (arg184, arg185, arg186) => arg186.findIndex((arg187) => arg187.id === arg184.id) === arg185,
    );
  if (
    ((vx.textContent =
      jc === "shared"
        ? "当前添加到侧边栏，添加后会在所有页面显示。"
        : "当前添加到主页面，仅在“" + (ct()?.name || "当前页面") + "”显示。"),
    !filter13.length)
  ) {
    const element49 = document.createElement("div");
    ((element49.className = "component-template-empty"),
      (element49.textContent = "当前 UI 方案暂无可用控件模板。"),
      Yl.replaceChildren(element49));
    return;
  }
  Yl.replaceChildren(
    ...filter13.map((arg188) => {
      const element50 = document.createElement("button");
      ((element50.type = "button"),
        (element50.className = "component-template-card"),
        (element50.dataset.templateId = arg188.id));
      const element51 = document.createElement("span");
      if (
        ((element51.className = "component-template-preview"),
        element51.setAttribute("aria-hidden", "true"),
        arg188.id === "interaction3d")
      )
        renderInteraction3dThumbnail2(element51);
      else {
        if (arg188.id === "flow-line")
          (element51.classList.add("flow-line-template-preview"),
            (element51.innerHTML =
              '<svg viewBox="0 0 180 100"><path d="M 15 78 H 65 Q 75 78 75 68 V 32 Q 75 22 85 22 H 165" fill="none" stroke="#42d9ef" stroke-opacity=".2" stroke-width="4"/><path d="M 15 78 H 65 Q 75 78 75 68 V 32 Q 75 22 85 22 H 165" fill="none" stroke="#42d9ef" stroke-width="3" stroke-linecap="round" stroke-dasharray="18 18"/></svg>'));
        else {
          if (arg188.id === "scene-mode")
            (element51.classList.add("scene-mode-template-preview"),
              (element51.innerHTML =
                '<span class="scene-mode-template-content"><span class="scene-mode-template-icon"></span><span class="scene-mode-template-text"><strong>情景模式</strong><small>SCENE</small></span></span>'));
          else {
            if (arg188.id === "percentage-bar")
              element51.innerHTML =
                '<svg class="percentage-template-chart" viewBox="0 0 520 260" aria-hidden="true">\n        <defs>\n          <linearGradient id="percentage-thumb-amber" x2="0" y2="1"><stop stop-color="#f2a20d" stop-opacity=".75"/><stop offset="1" stop-color="#f2a20d" stop-opacity=".08"/></linearGradient>\n          <linearGradient id="percentage-thumb-green" x2="0" y2="1"><stop stop-color="#68cc3e" stop-opacity=".75"/><stop offset="1" stop-color="#68cc3e" stop-opacity=".08"/></linearGradient>\n          <linearGradient id="percentage-thumb-gray" x2="0" y2="1"><stop stop-color="#94a5b3" stop-opacity=".75"/><stop offset="1" stop-color="#94a5b3" stop-opacity=".08"/></linearGradient>\n        </defs>\n        <g fill="#dce1e5" font-family="Helvetica Neue, sans-serif" font-size="42" text-anchor="middle" font-weight="300">\n          <text x="130" y="85">68<tspan font-size="22">%</tspan></text><text x="260" y="43">92<tspan font-size="22">%</tspan></text><text x="390" y="126">46<tspan font-size="22">%</tspan></text>\n        </g>\n        <rect x="94" y="99" width="72" height="123" rx="4" fill="url(#percentage-thumb-amber)" stroke="#f2a20d" stroke-opacity=".7" stroke-width="2"/>\n        <rect x="224" y="56" width="72" height="166" rx="4" fill="url(#percentage-thumb-green)" stroke="#68cc3e" stroke-opacity=".7" stroke-width="2"/>\n        <rect x="354" y="139" width="72" height="83" rx="4" fill="url(#percentage-thumb-gray)" stroke="#94a5b3" stroke-opacity=".7" stroke-width="2"/>\n        <g fill="#94a5b3" font-family="sans-serif" font-size="24" text-anchor="middle"><text x="130" y="251">液位</text><text x="260" y="251">电量</text><text x="390" y="251">湿度</text></g>\n      </svg>';
            else {
              const element52 = document.createElement("img"),
                thumbnailId = arg188.thumbnailId || arg188.id;
              ((element52.src =
                "/bridge-static/component-thumbnails/" +
                encodeURIComponent(thumbnailId) +
                ".jpg?v=20260902-component-thumbnails-v3"),
                (element52.alt = ""),
                element51.append(element52));
            }
          }
        }
      }
      const element53 = document.createElement("span");
      element53.className = "component-template-copy";
      const element54 = document.createElement("strong");
      element54.textContent = arg188.name;
      const element55 = document.createElement("span");
      return (
        (element55.textContent = arg188.description),
        element53.append(element54, element55),
        element50.append(element51, element53),
        arg188.id === "interaction3d" && updateInteraction3dCard2(element50),
        element50
      );
    }),
  );
}
const GE = new Set([
    "input_boolean",
    "input_button",
    "input_datetime",
    "input_number",
    "input_select",
    "input_text",
    "counter",
    "timer",
    "schedule",
  ]),
  _E = {
    alarm_control_panel: "安防",
    automation: "自动化",
    binary_sensor: "二元传感器",
    button: "按钮",
    calendar: "日历",
    camera: "摄像头",
    climate: "空调/浴霸",
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
    zone: "区域",
  };
function be(arg189) {
  return arg189?.domain || String(arg189?.entityId || "").split(".")[0];
}
function no(arg190) {
  const be2 = be(arg190);
  return arg190?.virtual ? "虚拟实体" : GE.has(be2) ? "辅助元素" : _E[be2] || be2 || "实体";
}
function Ja(arg191) {
  return String(arg191 || "")
    .replace(/\s+/g, " ")
    .trim();
}
function nw(arg192) {
  return Ja(up.get(String(arg192?.deviceId || "")));
}
function YE(arg193, v172 = nw(arg193)) {
  const ja2 = Ja(arg193?.name),
    ja3 = Ja(arg193?.originalName);
  if (!v172) return ja2 || ja3 || arg193?.entityId || "";
  const text4 =
    ja2 === v172
      ? ""
      : ja2.startsWith(v172 + " ")
        ? ja2.slice(v172.length).trim()
        : ja2.startsWith(v172 + "·")
          ? ja2.slice(v172.length + 1).trim()
          : ja2;
  return text4 && text4 !== v172 ? text4 : ja3 && ja3 !== v172 ? ja3 : "";
}
function vt(arg194, v173 = "") {
  if (arg194?.virtual) return arg194.name || arg194.entityId || "";
  const nw2 = nw(arg194),
    yE2 = Ja(v173) || YE(arg194, nw2);
  return nw2 ? (yE2 && yE2 !== nw2 ? nw2 + " · " + yE2 : nw2) : yE2 || arg194?.entityId || "";
}
function rt(arg195) {
  const vt2 = vt(arg195),
    text5 = arg195?.entityId || "";
  return "[" + no(arg195) + "] " + vt2 + (vt2 && vt2 !== text5 ? " · " + text5 : "");
}
function Qa(v174 = F()) {
  return [
    ...new Set(
      (Array.isArray(v174?.properties?.entityIds) ? v174.properties.entityIds : [])
        .map((arg196) => String(arg196 || "").trim())
        .filter(Boolean),
    ),
  ];
}
function XE(arg197, v175 = null) {
  if (!v175)
    return {
      label: "实体已删除",
      tone: "missing",
    };
  const v176 = x?.states?.get?.(arg197),
    v177 = v176?.newState || v176,
    lowerCase2 = String(v177?.state ?? "")
      .trim()
      .toLowerCase(),
    v178 = lightStatisticsEntityStateStatus2(v175, v177);
  return v178 === "on"
    ? {
        label: "已开启/运行",
        tone: "on",
      }
    : v178 === "off"
      ? {
          label: "已关闭",
          tone: "off",
        }
      : lowerCase2 === "unavailable"
        ? {
            label: "暂时不可用",
            tone: "abnormal",
          }
        : lowerCase2 === "unknown"
          ? {
              label: "状态未知",
              tone: "abnormal",
            }
          : lowerCase2
            ? {
                label: "无法判断：" + lowerCase2,
                tone: "abnormal",
              }
            : {
                label: "等待状态",
                tone: "abnormal",
              };
}
function oo(v179 = "", v180 = false) {
  ((Rd.textContent = v179), (Rd.hidden = !v179), Rd.classList.toggle("error", !!v180));
}
const sl = 100;
function Za({ clearMessage: v181 = true } = {}) {
  ((tn = ""), (Ko = -1), (Ra = ""), (Kg.hidden = true), ts(ht, "选择一个实体"), v181 && oo(""));
}
function Bp(v182 = "") {
  if (F()?.type !== "light-statistics") return;
  const localeLowerCase = v182.trim().toLocaleLowerCase("zh-CN"),
    map14 = io("light-statistics")
      .map((arg198, arg199) => ({
        entity: arg198,
        index: arg199,
        support: lightStatisticsEntitySupport2(arg198),
      }))
      .filter(
        ({ entity: v183 }) =>
          !localeLowerCase ||
          (rt(v183) + " " + be(v183)).toLocaleLowerCase("zh-CN").includes(localeLowerCase),
      )
      .sort(
        (arg200, arg201) =>
          Number(arg201.support.supported) - Number(arg200.support.supported) ||
          +(be(arg201.entity) === "light") - +(be(arg200.entity) === "light") ||
          arg200.index - arg201.index,
      )
      .map(({ entity: v184, support: v185 }) => {
        const element56 = document.createElement("button");
        ((element56.type = "button"),
          (element56.className =
            "inspector-entity-option" + (v184.entityId === tn ? " selected" : "")),
          (element56.dataset.lightStatisticsEntityId = v184.entityId),
          element56.setAttribute("role", "option"),
          element56.setAttribute("aria-selected", String(v184.entityId === tn)));
        const element57 = document.createElement("span");
        ((element57.className = "inspector-entity-option-content"), (element57.title = rt(v184)));
        const element58 = document.createElement("span");
        element58.className = "inspector-entity-option-line inspector-entity-name-line";
        const element59 = document.createElement("span");
        ((element59.className = "inspector-entity-kind"),
          (element59.textContent = "[" + no(v184) + "] "));
        const element60 = document.createElement("span");
        ((element60.className = "inspector-entity-name"),
          (element60.textContent = vt(v184)),
          element58.append(element59, element60));
        const element61 = document.createElement("span");
        return (
          (element61.className = "inspector-entity-option-line inspector-entity-id"),
          (element61.textContent = v184.entityId),
          (element61.title = v184.entityId),
          element57.append(element58, element61),
          ro(element56, element58),
          element56.append(element57),
          element56
        );
      });
  if (!map14.length) {
    const element62 = document.createElement("div");
    ((element62.className = "inspector-picker-empty"),
      (element62.textContent = "没有匹配的实体"),
      map14.push(element62));
  }
  (Kr.replaceChildren(...map14), (Kr.scrollTop = 0));
}
function KE(arg202, v186 = Ko) {
  const f = F();
  if (
    f?.type !== "light-statistics" ||
    !io("light-statistics").find((arg203) => arg203.entityId === arg202)
  )
    return;
  const indexOf4 = Qa(f).indexOf(arg202);
  if (indexOf4 >= 0 && indexOf4 !== v186) {
    oo("该实体已添加，请选择其它实体。", true);
    return;
  }
  return ((tn = arg202), (Ko = Number.isInteger(v186) ? v186 : -1), (Ra = f.id), ow());
}
function ow() {
  const w2 = w,
    tn2 = tn,
    Ko2 = Ko,
    v187 = K.find((arg204) => arg204.entityId === tn2);
  if (!w2 || !tn2 || !v187) return;
  const f2 = F();
  if (Ko2 < 0 && Qa(f2).length >= sl) {
    oo("每个统计控件最多添加 " + sl + " 个实体。", true);
    return;
  }
  return E((arg205) => {
    const v188 = findComponent2(arg205, w2)?.component;
    if (!v188 || v188.type !== "light-statistics") return "component-invalid";
    const qa2 = Qa(v188),
      indexOf5 = qa2.indexOf(tn2);
    if (indexOf5 >= 0 && indexOf5 !== Ko2) return "duplicate";
    const text6 = Ko2 >= 0 && Ko2 < qa2.length ? qa2[Ko2] : "";
    if (!text6 && qa2.length >= sl) return "limit-reached";
    if (Ko2 >= 0 && !text6) return "component-invalid";
    text6 ? qa2.splice(Ko2, 1, tn2) : qa2.push(tn2);
    const options11 = {
      ...(v188.properties?.entityLabels || {}),
    };
    return (
      text6 && text6 !== tn2 && delete options11[text6],
      (options11[tn2] = vt(v187)),
      (v188.properties = {
        ...(v188.properties || {}),
        entityIds: qa2,
        entityLabels: options11,
      }),
      text6 ? "replaced" : "added"
    );
  }).then((arg206) =>
    arg206 === "limit-reached"
      ? (oo("每个统计控件最多添加 " + sl + " 个实体。", true), arg206)
      : arg206 === "duplicate"
        ? (oo("该实体已添加，请选择其它实体。", true), arg206)
        : arg206 === "component-invalid"
          ? (oo("当前统计控件已发生变化，请重新选择。", true), arg206)
          : ((arg206 !== "added" && arg206 !== "replaced") ||
              (Za({
                clearMessage: false,
              }),
              oo(arg206 === "replaced" ? "已更换统计实体。" : "已加入统计列表。")),
            arg206),
  );
}
function JE(arg207) {
  const w3 = w;
  !w3 ||
    !Number.isInteger(arg207) ||
    arg207 < 0 ||
    (E((arg208) => {
      const v189 = findComponent2(arg208, w3)?.component;
      if (!v189 || v189.type !== "light-statistics") return;
      const qa3 = Qa(v189),
        [splice2] = qa3.splice(arg207, 1),
        options12 = {
          ...(v189.properties?.entityLabels || {}),
        };
      (splice2 && delete options12[splice2],
        (v189.properties = {
          ...(v189.properties || {}),
          entityIds: qa3,
          entityLabels: options12,
        }));
    }),
    Za());
}
function iw(v190 = F()) {
  if (v190?.type !== "light-statistics") return;
  const qa4 = Qa(v190),
    options13 = v190.properties?.entityLabels || {};
  _1.textContent = qa4.length + " 个";
  const map15 = qa4.map((arg209, arg210) => {
    const value6 = io("light-statistics").find((arg211) => arg211.entityId === arg209) || null,
      xE2 = XE(arg209, value6),
      element63 = document.createElement("div");
    element63.className = "light-statistics-entity-row " + xE2.tone + (value6 ? "" : " missing");
    const element64 = document.createElement("div"),
      element65 = document.createElement("strong");
    element65.textContent = value6 ? vt(value6) : options13[arg209] || arg209;
    const element66 = document.createElement("small");
    ((element66.textContent = arg209 + " · " + xE2.label), element64.append(element65, element66));
    const element67 = document.createElement("span");
    element67.className = "light-statistics-entity-actions";
    const element68 = document.createElement("button");
    ((element68.type = "button"),
      (element68.dataset.lightStatisticsReplaceIndex = String(arg210)),
      (element68.textContent = "更换"));
    const element69 = document.createElement("button");
    return (
      (element69.type = "button"),
      (element69.dataset.lightStatisticsRemoveIndex = String(arg210)),
      (element69.textContent = "删除"),
      element67.append(element68, element69),
      element63.append(element64, element67),
      element63
    );
  });
  Jg.replaceChildren(...map15);
}
function rw(arg212, v191 = []) {
  for (const element70 of arg212 || []) (v191.push(element70), rw(element70.children, v191));
  return v191;
}
function QE(v192 = ct()) {
  if (!v192 || !g?.document) return [];
  const map16 = new Map((g.document.sharedComponents || []).map((arg213) => [arg213.id, arg213])),
    filter14 = (v192.sharedComponentIds || []).map((arg214) => map16.get(arg214)).filter(Boolean);
  return rw([...(v192.components || []), ...filter14]);
}
function es(v193 = ct()) {
  return QE(v193).some((arg215) => arg215.type === "icon-button-effect")
    ? [createIconVisibilityVirtualEntity2(v193?.path)]
    : [];
}
function io(v194 = "image") {
  return v194 === "scene-mode" ? K : [...K, ...es()];
}
const cl = new WeakMap(),
  aw = new WeakMap(),
  ZE = "[data-overflow-scroll-preview], .inspector-picker-value, .inspector-entity-name-line";
function ro(arg216, arg217) {
  const filter15 = (Array.isArray(arg217) ? arg217 : [arg217]).filter(Boolean);
  for (const element71 of filter15) element71.dataset.overflowScrollPreview = "true";
  arg216 &&
    filter15.length &&
    ((arg216.dataset.overflowScrollPreviewRow = "true"), aw.set(arg216, filter15));
}
function sw(arg218) {
  const v195 = arg218.closest?.(ZE);
  if (v195) return v195;
  const v196 = arg218.closest?.("[data-overflow-scroll-preview-row]");
  return aw.get(v196)?.[0] || null;
}
function cw(arg219) {
  return arg219?.closest?.("[data-overflow-scroll-preview-row]") || arg219;
}
function lw(arg220) {
  const v197 = cl.get(arg220);
  (v197 &&
    (window.clearTimeout(v197.timer), window.cancelAnimationFrame(v197.frame), cl.delete(arg220)),
    (arg220.scrollLeft = 0),
    arg220.classList.remove("hover-scrolling"));
}
function dw(arg221) {
  if (!arg221) return null;
  let selector10 = arg221.querySelector(".inspector-picker-value");
  return (
    selector10 ||
      ((selector10 = document.createElement("span")),
      (selector10.className = "inspector-picker-value"),
      (selector10.textContent = arg221.textContent.trim()),
      arg221.replaceChildren(selector10)),
    ro(arg221, selector10),
    selector10
  );
}
function ts(arg222, arg223, v198 = "") {
  const dw2 = dw(arg222);
  dw2 &&
    ((dw2.textContent = arg223), (dw2.title = v198 || arg223), (arg222.title = v198 || arg223));
}
(document.addEventListener("pointerover", (arg224) => {
  const sw2 = sw(arg224.target),
    cw2 = cw(sw2),
    v199 = arg224.relatedTarget instanceof Node && cw2?.contains(arg224.relatedTarget);
  if (!sw2 || v199 || cl.has(sw2)) return;
  const max21 = Math.max(0, sw2.scrollWidth - sw2.clientWidth);
  if (max21 <= 2) return;
  const options14 = {
    timer: null,
    frame: null,
  };
  (cl.set(sw2, options14),
    (options14.timer = window.setTimeout(() => {
      if (!sw2.isConnected) {
        lw(sw2);
        return;
      }
      sw2.classList.add("hover-scrolling");
      const now = performance.now(),
        v200 = (arg225) => {
          const v201 = (arg225 - now) * 0.04;
          ((sw2.scrollLeft = Math.min(max21, v201)),
            v201 < max21 && (options14.frame = window.requestAnimationFrame(v200)));
        };
      options14.frame = window.requestAnimationFrame(v200);
    }, 350)));
}),
  document.addEventListener("pointerout", (arg226) => {
    const sw3 = sw(arg226.target),
      cw3 = cw(sw3),
      v202 = arg226.relatedTarget instanceof Node && cw3?.contains(arg226.relatedTarget);
    !sw3 || v202 || lw(sw3);
  }));
function G(arg227, arg228) {
  ((arg227.hidden = true),
    arg228.setAttribute("aria-expanded", "false"),
    arg227 === et && (dt(), Et(nn.get(Ao))),
    arg227 === tt && (dt(), Et(nn.get(Oo))));
}
function q(v203 = null) {
  if (
    (v203 !== "entity" && G(xr, xi),
    v203 !== "weather-entity" && G(Pu, Au),
    v203 !== "line-chart-entity" && G(Mu, ku),
    v203 !== "ibe-entity" && G(Qs, xd),
    v203 !== "icon-button-entity" && G(Mi, ki),
    v203 !== "vacuum-map-entity" && G(Lc, xu),
    v203 !== "camera-entity" && G(Ac, Lu),
    v203 !== "air-conditioner-entity" && G(Cc, gu),
    v203 !== "title-button-entity" && G(nc, Dd),
    v203 !== "light-statistics-entity")
  ) {
    const v204 = !Be.hidden;
    (G(Be, ht), v204 && Za());
  }
  (v203 !== "light-statistics-action-entity" && G(lc, Hd),
    v203 !== "navigation-entity" && G(Fu, Ia),
    v203 !== "asset" && G(et, zn),
    v203 !== "ibe-asset" && G(tt, jn),
    v203 !== "ibe-icon" && G(Bt, hn),
    v203 !== "icon-button-icon" && G(Ft, $t),
    v203 !== "title-button-icon" && G(nt, yn),
    v203 !== "light-statistics-icon" && G(ot, vn),
    v203 !== "navigation-icon" && G(Dt, wn));
}
function Zi(arg229) {
  const replace = String(arg229 || "")
    .trim()
    .replace(/^mdi:/, "");
  return /^[a-z0-9-]+$/.test(replace)
    ? "/bridge-static/vendor/mdi/7.4.47/svg/" + replace + ".svg"
    : "";
}
function eL(arg230) {
  const v205 = String(arg230 || ""),
    selector11 = wn.querySelector("i"),
    selector12 = wn.querySelector("span"),
    zi2 = Zi(v205);
  ((selector11.hidden = !zi2),
    (selector11.style.maskImage = zi2 ? 'url("' + zi2 + '")' : ""),
    (selector11.style.webkitMaskImage = zi2 ? 'url("' + zi2 + '")' : ""),
    (selector12.textContent = v205 || "不使用图标"),
    (Ta.disabled = !v205),
    (Ta.title = v205 ? "复制 " + v205 : "当前未使用图标"));
}
function tL(arg231) {
  const v206 = String(arg231 || ""),
    selector13 = hn.querySelector("i"),
    selector14 = hn.querySelector("span"),
    zi3 = Zi(v206);
  ((selector13.hidden = !zi3),
    (selector13.style.maskImage = zi3 ? 'url("' + zi3 + '")' : ""),
    (selector13.style.webkitMaskImage = zi3 ? 'url("' + zi3 + '")' : ""),
    (selector14.textContent = v206 || "不使用图标"),
    (Vr.disabled = !v206),
    (Vr.title = v206 ? "复制 " + v206 : "当前未使用图标"));
}
function nL(arg232) {
  const v207 = String(arg232 || ""),
    includes = ["device-button", "presence-sensor"].includes(F()?.type),
    selector15 = $t.querySelector("i"),
    selector16 = $t.querySelector("span"),
    zi4 = Zi(v207);
  ((selector15.hidden = !zi4),
    (selector15.style.maskImage = zi4 ? 'url("' + zi4 + '")' : ""),
    (selector15.style.webkitMaskImage = zi4 ? 'url("' + zi4 + '")' : ""),
    (selector16.textContent = v207 || (includes ? "跟随实体图标" : "不使用图标")),
    (na.disabled = !v207),
    (na.title = v207 ? "复制 " + v207 : "当前未使用图标"));
}
function oL(arg233) {
  const v208 = String(arg233 || ""),
    selector17 = yn.querySelector("i"),
    selector18 = yn.querySelector("span"),
    zi5 = Zi(v208);
  ((selector17.hidden = !zi5),
    (selector17.style.maskImage = zi5 ? 'url("' + zi5 + '")' : ""),
    (selector17.style.webkitMaskImage = zi5 ? 'url("' + zi5 + '")' : ""),
    (selector18.textContent = v208 || "不使用图标"),
    (Ur.disabled = !v208),
    (Ur.title = v208 ? "复制 " + v208 : "当前未使用图标"));
}
function iL(arg234) {
  const v209 = String(arg234 ?? "mdi:lightbulb-group-outline"),
    selector19 = vn.querySelector("i"),
    selector20 = vn.querySelector("span"),
    zi6 = Zi(v209);
  ((selector19.hidden = !zi6),
    (selector19.style.maskImage = zi6 ? 'url("' + zi6 + '")' : ""),
    (selector19.style.webkitMaskImage = zi6 ? 'url("' + zi6 + '")' : ""),
    (selector20.textContent = v209 || "不使用图标"),
    (Jr.disabled = !v209),
    (Jr.title = v209 ? "复制 " + v209 : "当前未使用图标"));
}
async function ii(arg235) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(arg235);
    return;
  }
  const element72 = document.createElement("textarea");
  ((element72.value = arg235),
    element72.setAttribute("readonly", ""),
    (element72.style.position = "fixed"),
    (element72.style.opacity = "0"),
    document.body.append(element72),
    element72.select());
  const execCommand = document.execCommand("copy");
  if ((element72.remove(), !execCommand)) throw new Error("复制失败。");
}
function uw(arg236, v210 = () => arg236.dataset.entityId || "") {
  if (!arg236 || arg236.dataset.entityCopyReady === "true") return arg236._entityCopySync;
  dw(arg236);
  const element73 = document.createElement("div");
  element73.className = "entity-picker-field-row";
  const element74 = document.createElement("button");
  ((element74.type = "button"),
    (element74.className = "navigation-icon-copy entity-picker-copy"),
    (element74.title = "复制实体 ID"),
    element74.setAttribute("aria-label", "复制实体 ID"),
    (element74.disabled = true),
    (element74.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.3"></rect><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5"></path></svg><span aria-hidden="true">✓</span>'));
  const v211 = () => {
    const v212 = String(v210() || "");
    ((element74.dataset.entityId = v212),
      (element74.disabled = !v212),
      (element74.title = v212 ? "复制 " + v212 : "当前未选择实体"));
  };
  return (
    element74.addEventListener("click", async (arg237) => {
      (arg237.preventDefault(), arg237.stopPropagation());
      const text7 = element74.dataset.entityId || "";
      if (text7)
        try {
          (await ii(text7),
            element74.classList.add("copied"),
            window.setTimeout(() => element74.classList.remove("copied"), 1000));
        } catch (v213) {
          $(v213);
        }
    }),
    arg236.replaceWith(element73),
    element73.append(arg236, element74),
    (arg236.dataset.entityCopyReady = "true"),
    (arg236._entityCopySync = v211),
    v211(),
    v211
  );
}
function rL() {
  for (const v214 of [
    "image-entity-button",
    "ibe-entity-button",
    "icon-button-entity-button",
    "air-conditioner-entity-button",
    "vacuum-map-entity-button",
    "camera-entity-button",
    "weather-entity-button",
    "line-chart-entity-button",
    "navigation-entity-button",
    "popup-module-entity-button",
  ]) {
    const elementById = document.getElementById(v214);
    elementById && uw(elementById);
  }
}
rL();
const aL = 160,
  pw = new WeakMap();
function sL(arg238) {
  let v215 = pw.get(arg238);
  return (
    v215 ||
      ((v215 = {
        query: "",
        offset: 0,
        total: 0,
        loading: false,
        complete: false,
        generation: 0,
      }),
      pw.set(arg238, v215)),
    v215
  );
}
let $p = null;
function Fp() {
  ($p?.remove(), ($p = null));
}
function mw(arg239, arg240) {
  Fp();
  const closest3 = arg239.closest("dialog");
  if (!closest3?.open || !arg240) return;
  const element75 = document.createElement("div");
  ((element75.className = "editor-icon-name-tooltip"),
    (element75.textContent = arg240),
    closest3.append(element75));
  const boundingClientRect5 = arg239.getBoundingClientRect(),
    boundingClientRect6 = element75.getBoundingClientRect(),
    min11 = Math.min(
      window.innerWidth - boundingClientRect6.width - 8,
      Math.max(
        8,
        boundingClientRect5.left + (boundingClientRect5.width - boundingClientRect6.width) / 2,
      ),
    );
  let v216 = boundingClientRect5.top - boundingClientRect6.height - 8;
  (v216 < 8 && (v216 = boundingClientRect5.bottom + 8),
    (element75.style.left = min11 + "px"),
    (element75.style.top = v216 + "px"),
    ($p = element75));
}
function cL(arg241, arg242) {
  (arg241.addEventListener("pointerenter", () => mw(arg241, arg242)),
    arg241.addEventListener("pointerleave", Fp),
    arg241.addEventListener("focus", () => mw(arg241, arg242)),
    arg241.addEventListener("blur", Fp));
}
async function ns({
  optionsElement: v217,
  query: v218 = "",
  currentIcon: v219 = "",
  clearLabel: v220 = "不使用图标",
  datasetKey: v221 = "iconName",
  append: v222 = false,
}) {
  const trim3 = String(v218 || "").trim(),
    sL2 = sL(v217);
  if (!v222 || sL2.query !== trim3) {
    ((sL2.query = trim3),
      (sL2.offset = 0),
      (sL2.total = 0),
      (sL2.loading = false),
      (sL2.complete = false),
      (sL2.generation += 1));
    const element76 = document.createElement("div");
    ((element76.className = "navigation-icon-load-state"),
      (element76.textContent = "正在加载图标…"),
      v217.replaceChildren(uL(v219, v220, v221), element76),
      (v217.scrollTop = 0));
  }
  if (sL2.loading || sL2.complete) return;
  const generation = sL2.generation,
    selector21 = v217.querySelector(".navigation-icon-load-state");
  ((sL2.loading = true),
    selector21 && (selector21.textContent = sL2.offset ? "正在加载更多图标…" : "正在加载图标…"));
  try {
    const _4 = await _(
      "/icons?query=" + encodeURIComponent(sL2.query) + "&limit=" + aL + "&offset=" + sL2.offset,
    );
    if (generation !== sL2.generation) return;
    const list18 = _4.items || [],
      map17 = list18.map((arg243) => Qp(arg243, v219, v221));
    (selector21 && map17.length && selector21.before(...map17),
      (sL2.offset += list18.length),
      (sL2.total = Math.max(Number(_4.total) || 0, sL2.offset)),
      (sL2.complete = !list18.length || sL2.offset >= sL2.total),
      (sL2.loading = false),
      selector21 &&
        (selector21.textContent = sL2.total
          ? sL2.complete
            ? "已显示全部 " + sL2.total + " 个图标"
            : "已加载 " + sL2.offset + " / " + sL2.total + " · 继续向下滚动"
          : "没有匹配的图标"));
  } catch (v223) {
    throw (
      generation === sL2.generation &&
        ((sL2.loading = false),
        selector21 && (selector21.textContent = "图标加载失败，请稍后重试")),
      v223
    );
  }
}
function os(arg244, arg245) {
  arg244.addEventListener("scroll", () => {
    arg244.scrollHeight - arg244.scrollTop - arg244.clientHeight > 120 || arg245().catch($);
  });
}
async function Dp(v224 = "", { append: v225 = false } = {}) {
  return ns({
    optionsElement: Pa,
    query: v224,
    currentIcon: F()?.properties?.icon || "",
    append: v225,
  });
}
async function zp(v226 = "", { append: v227 = false } = {}) {
  return ns({
    optionsElement: Rr,
    query: v226,
    currentIcon: F()?.properties?.icon || "",
    append: v227,
  });
}
async function Vp(v228 = "", { append: v229 = false } = {}) {
  const f3 = F();
  return ns({
    optionsElement: ia,
    query: v228,
    currentIcon: f3?.properties?.icon || "",
    clearLabel: f3?.type === "device-button" ? "跟随实体图标" : "不使用图标",
    append: v229,
  });
}
async function Wp(v230 = "", { append: v231 = false } = {}) {
  return ns({
    optionsElement: _r,
    query: v230,
    currentIcon: F()?.properties?.icon || "",
    append: v231,
  });
}
async function Rp(v232 = "", { append: v233 = false } = {}) {
  const options15 = F()?.properties || {},
    v234 = String(
      Object.hasOwn(options15, "icon") ? options15.icon || "" : "mdi:lightbulb-group-outline",
    );
  return ns({
    optionsElement: Zr,
    query: v232,
    currentIcon: v234,
    datasetKey: "lightStatisticsIconName",
    append: v233,
  });
}
(os(Pa, () =>
  Dp(Aa.value, {
    append: true,
  }),
),
  os(Rr, () =>
    zp(Wr.value, {
      append: true,
    }),
  ),
  os(ia, () =>
    Vp(oa.value, {
      append: true,
    }),
  ),
  os(_r, () =>
    Wp(Gr.value, {
      append: true,
    }),
  ),
  os(Zr, () =>
    Rp(Qr.value, {
      append: true,
    }),
  ));
function fw() {
  if (Dt.hidden) return;
  const boundingClientRect7 = wn.parentElement.getBoundingClientRect(),
    num7 = 5,
    num8 = 8,
    v235 = window.innerHeight - boundingClientRect7.bottom - num7 - num8,
    v236 = boundingClientRect7.top - num7 - num8,
    v237 = v235 >= 250 || v235 >= v236,
    max22 = Math.max(150, Math.min(390, v237 ? v235 : v236));
  ((Dt.style.left =
    clampNumber2(
      boundingClientRect7.left,
      num8,
      Math.max(num8, window.innerWidth - boundingClientRect7.width - num8),
    ) + "px"),
    (Dt.style.top = v237
      ? boundingClientRect7.bottom + num7 + "px"
      : Math.max(num8, boundingClientRect7.top - max22 - num7) + "px"),
    (Dt.style.width = boundingClientRect7.width + "px"),
    (Dt.style.maxHeight = max22 + "px"),
    (Pa.style.maxHeight = Math.max(90, max22 - 57) + "px"));
}
function gw() {
  if (Bt.hidden) return;
  const boundingClientRect8 = hn.parentElement.getBoundingClientRect(),
    num9 = 5,
    num10 = 8,
    v238 = window.innerHeight - boundingClientRect8.bottom - num9 - num10,
    v239 = boundingClientRect8.top - num9 - num10,
    v240 = v238 >= 250 || v238 >= v239,
    max23 = Math.max(150, Math.min(390, v240 ? v238 : v239));
  ((Bt.style.left =
    clampNumber2(
      boundingClientRect8.left,
      num10,
      Math.max(num10, window.innerWidth - boundingClientRect8.width - num10),
    ) + "px"),
    (Bt.style.top = v240
      ? boundingClientRect8.bottom + num9 + "px"
      : Math.max(num10, boundingClientRect8.top - max23 - num9) + "px"),
    (Bt.style.width = boundingClientRect8.width + "px"),
    (Bt.style.maxHeight = max23 + "px"),
    (Rr.style.maxHeight = Math.max(90, max23 - 57) + "px"));
}
function hw() {
  if (Ft.hidden) return;
  const boundingClientRect9 = $t.parentElement.getBoundingClientRect(),
    num11 = 5,
    num12 = 8,
    v241 = window.innerHeight - boundingClientRect9.bottom - num11 - num12,
    v242 = boundingClientRect9.top - num11 - num12,
    v243 = v241 >= 250 || v241 >= v242,
    max24 = Math.max(150, Math.min(390, v243 ? v241 : v242));
  ((Ft.style.left =
    clampNumber2(
      boundingClientRect9.left,
      num12,
      Math.max(num12, window.innerWidth - boundingClientRect9.width - num12),
    ) + "px"),
    (Ft.style.top = v243
      ? boundingClientRect9.bottom + num11 + "px"
      : Math.max(num12, boundingClientRect9.top - max24 - num11) + "px"),
    (Ft.style.width = boundingClientRect9.width + "px"),
    (Ft.style.maxHeight = max24 + "px"),
    (ia.style.maxHeight = Math.max(90, max24 - 57) + "px"));
}
function Hp() {
  if (nt.hidden) return;
  const boundingClientRect10 = yn.parentElement.getBoundingClientRect(),
    num13 = 5,
    num14 = 8,
    v244 = window.innerHeight - boundingClientRect10.bottom - num13 - num14,
    v245 = boundingClientRect10.top - num13 - num14,
    v246 = v244 >= 250 || v244 >= v245,
    max25 = Math.max(150, Math.min(390, v246 ? v244 : v245));
  ((nt.style.left =
    clampNumber2(
      boundingClientRect10.left,
      num14,
      Math.max(num14, window.innerWidth - boundingClientRect10.width - num14),
    ) + "px"),
    (nt.style.top = v246
      ? boundingClientRect10.bottom + num13 + "px"
      : Math.max(num14, boundingClientRect10.top - max25 - num13) + "px"),
    (nt.style.width = boundingClientRect10.width + "px"),
    (nt.style.maxHeight = max25 + "px"),
    (_r.style.maxHeight = Math.max(90, max25 - 57) + "px"));
}
function jp() {
  if (ot.hidden) return;
  const boundingClientRect11 = vn.parentElement.getBoundingClientRect(),
    num15 = 5,
    num16 = 8,
    v247 = window.innerHeight - boundingClientRect11.bottom - num15 - num16,
    v248 = boundingClientRect11.top - num15 - num16,
    v249 = v247 >= 250 || v247 >= v248,
    max26 = Math.max(150, Math.min(390, v249 ? v247 : v248));
  ((ot.style.left =
    clampNumber2(
      boundingClientRect11.left,
      num16,
      Math.max(num16, window.innerWidth - boundingClientRect11.width - num16),
    ) + "px"),
    (ot.style.top = v249
      ? boundingClientRect11.bottom + num15 + "px"
      : Math.max(num16, boundingClientRect11.top - max26 - num15) + "px"),
    (ot.style.width = boundingClientRect11.width + "px"),
    (ot.style.maxHeight = max26 + "px"),
    (Zr.style.maxHeight = Math.max(90, max26 - 57) + "px"));
}
function qp() {
  if (Be.hidden) return;
  const boundingClientRect12 = ht.getBoundingClientRect(),
    num17 = 5,
    num18 = 8,
    min12 = Math.min(boundingClientRect12.width, window.innerWidth - num18 * 2),
    v250 = window.innerHeight - boundingClientRect12.bottom - num17 - num18,
    v251 = boundingClientRect12.top - num17 - num18,
    v252 = v250 >= 250 || v250 >= v251,
    max27 = Math.max(150, Math.min(430, v252 ? v250 : v251));
  ((Be.style.left =
    clampNumber2(
      boundingClientRect12.left,
      num18,
      Math.max(num18, window.innerWidth - min12 - num18),
    ) + "px"),
    (Be.style.top = v252
      ? boundingClientRect12.bottom + num17 + "px"
      : Math.max(num18, boundingClientRect12.top - max27 - num17) + "px"),
    (Be.style.width = min12 + "px"),
    (Be.style.maxHeight = max27 + "px"),
    (Kr.style.maxHeight = Math.max(90, max27 - 58) + "px"));
}
function ao(v253 = "image") {
  return v253 === "light-statistics"
    ? {
        componentType: v253,
        button: Hd,
        menu: lc,
        search: Y1,
        options: X1,
        except: "light-statistics-action-entity",
        relatedSettings: false,
        recommended: (arg246) => (TOGGLE_ENTITY_DOMAINS2.has(be(arg246)) ? 2 : 0),
      }
    : ["navigation-button", "scene-mode"].includes(v253)
      ? {
          componentType: v253,
          button: Ia,
          menu: Fu,
          search: eE,
          options: tE,
          except: "navigation-entity",
          relatedSettings: v253 !== "scene-mode",
          recommended: (arg247) =>
            arg247?.virtual ? 3 : TOGGLE_ENTITY_DOMAINS2.has(be(arg247)) ? 2 : 0,
        }
      : v253 === "title-button"
        ? {
            componentType: v253,
            button: Dd,
            menu: nc,
            search: H1,
            options: j1,
            except: "title-button-entity",
            recommended: (arg248) =>
              arg248?.virtual ? 3 : TOGGLE_ENTITY_DOMAINS2.has(be(arg248)) ? 2 : 0,
          }
        : v253 === "vacuum-map"
          ? {
              componentType: v253,
              button: xu,
              menu: Lc,
              search: ON,
              options: BN,
              except: "vacuum-map-entity",
              recommended: (arg249) =>
                ["camera", "image"].includes(be(arg249))
                  ? /(?:^|[_.\s-])map(?:$|[_.\s-])|地图/i.test(
                      (arg249.entityId || "") + " " + (arg249.name || ""),
                    )
                    ? 2
                    : 1
                  : 0,
            }
          : v253 === "camera"
            ? {
                componentType: v253,
                button: Lu,
                menu: Ac,
                search: $N,
                options: FN,
                except: "camera-entity",
                recommended: (arg250) => be(arg250) === "camera",
              }
            : v253 === "air-conditioner"
              ? {
                  componentType: v253,
                  button: gu,
                  menu: Cc,
                  search: LN,
                  options: IN,
                  except: "air-conditioner-entity",
                  recommended: (arg251) =>
                    be(arg251) === "climate" ? 2 : be(arg251) === "fan" ? 1 : 0,
                }
              : v253 === "device-button"
                ? {
                    componentType: v253,
                    button: ki,
                    menu: Mi,
                    search: Ud,
                    options: Gd,
                    except: "icon-button-entity",
                    recommended: (arg252) => TOGGLE_ENTITY_DOMAINS2.has(be(arg252)),
                  }
                : v253 === "presence-sensor"
                  ? {
                      componentType: v253,
                      button: ki,
                      menu: Mi,
                      search: Ud,
                      options: Gd,
                      except: "icon-button-entity",
                      recommended: (arg253) => {
                        const v254 =
                            (arg253.entityId || "") +
                            " " +
                            (arg253.name || "") +
                            " " +
                            (arg253.originalName || "") +
                            " " +
                            (arg253.translationKey || ""),
                          text8 = F()?.properties?.sensorKind || "presence",
                          be3 = be(arg253);
                        return be3 === "event"
                          ? text8 === "presence" &&
                            /motion|occupancy|presence|pir|moving|移动|运动|人体|有人/i.test(v254)
                            ? 4
                            : 0
                          : be3 !== "binary_sensor"
                            ? 0
                            : text8 === "water-leak"
                              ? /moisture|water|leak|flood|wet|水浸|漏水|积水|湿/i.test(v254)
                                ? 3
                                : 1
                              : text8 === "smoke"
                                ? /smoke|fire|烟雾|烟感|火警/i.test(v254)
                                  ? 3
                                  : 1
                                : text8 === "natural-gas"
                                  ? /natural[_ -]?gas|combustible|gas|燃气|天然气|可燃气/i.test(
                                      v254,
                                    )
                                    ? 3
                                    : 1
                                  : text8 === "door-window"
                                    ? /door|window|contact|opening|门|窗|接触/i.test(v254)
                                      ? 3
                                      : 1
                                    : /presence|occupancy|人在|有人|存在|人体/i.test(v254)
                                      ? 3
                                      : /motion|移动|运动/i.test(v254)
                                        ? 1
                                        : 2;
                      },
                    }
                  : v253 === "icon-button"
                    ? {
                        componentType: v253,
                        button: ki,
                        menu: Mi,
                        search: Ud,
                        options: Gd,
                        except: "icon-button-entity",
                        recommended: (arg254) => be(arg254) === "light",
                      }
                    : v253 === "icon-button-effect"
                      ? {
                          componentType: v253,
                          button: xd,
                          menu: Qs,
                          search: A1,
                          options: P1,
                          except: "ibe-entity",
                          recommended: (arg255) => be(arg255) === "light",
                        }
                      : v253 === "weather"
                        ? {
                            componentType: v253,
                            button: Au,
                            menu: Pu,
                            search: jN,
                            options: qN,
                            except: "weather-entity",
                            recommended: (arg256) => be(arg256) === "weather",
                          }
                        : v253 === "line-chart"
                          ? {
                              componentType: v253,
                              button: ku,
                              menu: Mu,
                              search: GN,
                              options: _N,
                              except: "line-chart-entity",
                              recommended: (arg257) => be(arg257) === "sensor",
                            }
                          : {
                              componentType: "image",
                              button: xi,
                              menu: xr,
                              search: Nr,
                              options: Wf,
                              except: "entity",
                              recommended: (arg258) => ["image", "camera"].includes(be(arg258)),
                            };
}
function is(v255 = "", v256 = "image") {
  const ao2 = ao(v256),
    text9 = F()?.bindings?.entity?.entityId || "",
    localeLowerCase2 = v255.trim().toLocaleLowerCase("zh-CN"),
    map18 = io(v256)
      .map((arg259, arg260) => ({
        entity: arg259,
        index: arg260,
      }))
      .filter(
        ({ entity: v257 }) =>
          !localeLowerCase2 ||
          (rt(v257) + " " + be(v257)).toLocaleLowerCase("zh-CN").includes(localeLowerCase2),
      )
      .sort((arg261, arg262) => {
        const v258 = (arg263) => (arg263?.virtual ? 100 : Number(ao2.recommended(arg263)));
        return v258(arg262.entity) - v258(arg261.entity) || arg261.index - arg262.index;
      })
      .map(({ entity: v259 }) => v259),
    element77 = document.createElement("button");
  ((element77.type = "button"),
    (element77.className =
      "inspector-entity-option inspector-entity-clear" + (text9 ? "" : " selected")),
    (element77.dataset.entityId = ""),
    element77.setAttribute("role", "option"),
    element77.setAttribute("aria-selected", String(!text9)),
    (element77.textContent = "不使用实体"));
  const map19 = map18.map((arg264) => {
      const element78 = document.createElement("button");
      ((element78.type = "button"),
        (element78.className =
          "inspector-entity-option" + (arg264.entityId === text9 ? " selected" : "")),
        (element78.dataset.entityId = arg264.entityId),
        element78.setAttribute("role", "option"),
        element78.setAttribute("aria-selected", String(arg264.entityId === text9)));
      const element79 = document.createElement("span");
      ((element79.className = "inspector-entity-option-content"), (element79.title = rt(arg264)));
      const element80 = document.createElement("span");
      element80.className = "inspector-entity-option-line inspector-entity-name-line";
      const element81 = document.createElement("span");
      ((element81.className = "inspector-entity-kind"),
        (element81.textContent = "[" + no(arg264) + "] "));
      const element82 = document.createElement("span");
      ((element82.className = "inspector-entity-name"),
        (element82.textContent = vt(arg264)),
        element80.append(element81, element82));
      const element83 = document.createElement("span");
      return (
        (element83.className = "inspector-entity-option-line inspector-entity-id"),
        (element83.textContent = arg264.entityId),
        (element83.title = arg264.entityId),
        element79.append(element80, element83),
        ro(element78, element80),
        element78.append(element79),
        element78
      );
    }),
    element84 = document.createElement("div");
  ((element84.className = "inspector-picker-empty"),
    map18.length || (element84.textContent = "没有匹配的实体"),
    ao2.options.replaceChildren(element77, ...map19, ...(element84.textContent ? [element84] : [])),
    (ao2.options.scrollTop = 0));
}
function jt(arg265) {
  const ao3 = ao(arg265.type),
    text10 = arg265.bindings?.entity?.entityId || "",
    v260 = io(arg265.type).find((arg266) => arg266.entityId === text10),
    rt2 = v260 ? rt(v260) : text10 || "不使用实体";
  let selector22 = ao3.button.querySelector(".inspector-picker-value");
  (selector22 ||
    ((selector22 = document.createElement("span")),
    (selector22.className = "inspector-picker-value"),
    ao3.button.replaceChildren(selector22),
    ro(ao3.button, selector22)),
    (selector22.textContent = rt2),
    (selector22.title = rt2),
    (ao3.button.dataset.entityId = text10),
    ao3.button._entityCopySync?.(),
    (ao3.search.value = ""),
    ao3.menu.hidden || is("", arg265.type),
    dL(arg265, ao3.relatedSettings === false ? null : ao3.button.closest(".inspector-picker")));
}
let ri = null,
  Up = null,
  ll = null,
  Gp = null,
  ai = null,
  er = null,
  lt = null,
  _p = null,
  an = null;
function rs() {
  return new Map(
    K.map((arg267) => [String(arg267.entityId || ""), arg267]).filter(([v261]) => v261),
  );
}
function as() {
  return new Map(
    Rt.map((arg268) => [String(arg268.deviceId || ""), arg268]).filter(([v262]) => v262),
  );
}
function Yp() {
  const localeLowerCase3 = String(an?.value || "")
    .trim()
    .toLocaleLowerCase("zh-CN");
  let num19 = 0;
  for (const element85 of ai?.querySelectorAll("[data-related-entity-id]") || []) {
    const includes2 =
      !localeLowerCase3 ||
      String(element85.dataset.relatedEntitySearch || "").includes(localeLowerCase3);
    ((element85.hidden = !includes2), includes2 && (num19 += 1));
  }
  const v263 = ai?.querySelector(".popup-related-entity-filter-empty");
  v263 && (v263.hidden = num19 > 0);
}
function lL() {
  if (ri) return ri;
  ((ri = document.createElement("div")),
    (ri.id = "popup-related-entity-settings"),
    (ri.className = "popup-related-entity-settings"),
    (Up = document.createElement("strong")),
    (ll = document.createElement("span")),
    (er = document.createElement("button")),
    (er.type = "button"),
    (er.className = "popup-related-entity-open"));
  const element86 = document.createElement("i");
  (element86.setAttribute("aria-hidden", "true"),
    (element86.textContent = "›"),
    er.append(ll, element86),
    (Gp = document.createElement("p")),
    ri.append(Up, er, Gp),
    (lt = document.createElement("dialog")),
    (lt.id = "popup-related-entity-dialog"),
    (lt.className = "popup-related-entity-dialog"));
  const element87 = document.createElement("div");
  element87.className = "popup-related-entity-dialog-card";
  const element88 = document.createElement("div");
  element88.className = "popup-related-entity-dialog-heading";
  const element89 = document.createElement("div");
  _p = document.createElement("strong");
  const element90 = document.createElement("span");
  ((element90.textContent = "选择要放进设备弹窗的功能"), element89.append(_p, element90));
  const element91 = document.createElement("button");
  ((element91.type = "button"),
    element91.setAttribute("aria-label", "关闭关联功能选择"),
    (element91.textContent = "×"),
    element88.append(element89, element91));
  const element92 = document.createElement("label");
  ((element92.className = "popup-related-entity-dialog-search"),
    (an = document.createElement("input")),
    (an.type = "search"),
    (an.name = "popup-related-entity-search"),
    (an.placeholder = "搜索功能名称或实体 ID"),
    (an.autocomplete = "off"),
    element92.append(an),
    (ai = document.createElement("div")),
    (ai.className = "popup-related-entity-list"));
  const element93 = document.createElement("div");
  element93.className = "popup-related-entity-dialog-footer";
  const element94 = document.createElement("button");
  return (
    (element94.type = "button"),
    (element94.textContent = "完成"),
    element93.append(element94),
    element87.append(element88, element92, ai, element93),
    lt.append(element87),
    document.body.append(lt),
    er.addEventListener("click", () => {
      lt.open ||
        ((an.value = ""),
        Yp(),
        lt.showModal(),
        window.requestAnimationFrame(() =>
          an.focus({
            preventScroll: true,
          }),
        ));
    }),
    an.addEventListener("input", Yp),
    element91.addEventListener("click", () => lt.close()),
    element94.addEventListener("click", () => lt.close()),
    lt.addEventListener("click", (arg269) => {
      arg269.target === lt && lt.close();
    }),
    ai.addEventListener("click", (arg270) => {
      const closest4 = arg270.target.closest("[data-related-entity-id]"),
        w4 = w;
      if (!closest4 || !w4 || closest4.disabled) return;
      const v264 = String(closest4.dataset.relatedEntityId || ""),
        f4 = F(),
        rs2 = rs(),
        as2 = as();
      if (!relatedPopupContext2(f4, rs2, as2)) return;
      const v265 = selectedRelatedEntityIds2(f4),
        set4 = new Set(v265 === null ? legacyRelatedEntityIds2(f4, rs2, as2) : v265),
        v266 = relatedPopupContext2(f4, rs2, as2),
        v267 = relatedPopupSelectionLimit2(v266);
      if (set4.has(v264)) set4.delete(v264);
      else {
        if (!v267 || set4.size < v267) set4.add(v264);
        else return;
      }
      E((arg271) => {
        const v268 = findComponent2(arg271, w4)?.component;
        v268 &&
          (v268.properties = {
            ...(v268.properties || {}),
            relatedEntities: manualRelatedEntityConfig2([...set4]),
          });
      });
    }),
    ri
  );
}
function dL(arg272, arg273) {
  const lL2 = lL(),
    rs3 = rs(),
    as3 = as(),
    v269 = relatedPopupContext2(arg272, rs3, as3);
  if (!v269 || !arg273) {
    ((lL2.hidden = true), lt?.open && lt.close());
    return;
  }
  (lL2.previousElementSibling !== arg273 && arg273.insertAdjacentElement("afterend", lL2),
    (lL2.hidden = false));
  const v270 = selectedRelatedEntityIds2(arg272),
    v271 = v270 === null,
    set5 = new Set(v271 ? legacyRelatedEntityIds2(arg272, rs3, as3) : v270),
    v272 = relatedPopupSelectionLimit2(v269),
    v273 = v272 > 0 && set5.size >= v272,
    v274 = relatedPopupCandidates2(arg272, rs3, as3),
    set6 = new Set(v274.map((arg274) => arg274.entityId));
  for (const v275 of set5)
    set6.has(v275) ||
      v274.push({
        entityId: v275,
        domain: String(v275).split(".", 1)[0],
        name: v275,
        status: "missing",
      });
  ((Up.textContent = v269.deviceLabel + "弹窗功能"),
    (ll.textContent = v271 ? "自动适配" : "已选 " + set5.size + (v272 ? " / " + v272 : "") + " 项"),
    ll.classList.toggle("is-automatic", v271),
    (Gp.textContent = v271
      ? "当前沿用原来的自动适配，点击可改为手动选择。"
      : "只显示已勾选的关联功能" + (v272 ? "，最多 " + v272 + " 项" : "") + "。"),
    (_p.textContent =
      v269.deviceLabel +
      "弹窗功能 · " +
      (v271 ? "自动适配" : "已选 " + set5.size + (v272 ? " / " + v272 : "") + " 项")));
  const map20 = v274.map((arg275) => {
    const v276 = set5.has(arg275.entityId),
      v277 = relatedEntityIsAvailable2(arg275),
      element95 = document.createElement("button");
    element95.type = "button";
    const v278 = v273 && !v276;
    ((element95.className =
      "popup-related-entity-option" +
      (v276 ? " selected" : "") +
      (v277 ? "" : " unavailable") +
      (v278 ? " limit-reached" : "")),
      (element95.dataset.relatedEntityId = arg275.entityId),
      element95.setAttribute("aria-pressed", String(v276)),
      (element95.disabled = (!v277 && !v276) || v278));
    const element96 = document.createElement("i");
    element96.setAttribute("aria-hidden", "true");
    const element97 = document.createElement("span"),
      element98 = document.createElement("strong"),
      v279 = relatedEntityLabel2(v269, arg275);
    element98.textContent = vt(arg275, v279);
    const element99 = document.createElement("small"),
      list19 = [
        RELATED_ENTITY_DOMAIN_LABELS2[
          String(arg275.domain || arg275.entityId || "").split(".", 1)[0]
        ] || "实体",
        arg275.entityId,
      ];
    return (
      v277
        ? v278
          ? list19.push("最多选择 " + v272 + " 项")
          : relatedEntityNeedsConfirmation2(arg275) && list19.push("点击时需确认")
        : list19.push("暂时不可用"),
      (element99.textContent = list19.join(" · ")),
      (element95.dataset.relatedEntitySearch = (
        element98.textContent +
        " " +
        (arg275.name || "") +
        " " +
        (arg275.originalName || "") +
        " " +
        element99.textContent
      ).toLocaleLowerCase("zh-CN")),
      ro(element95, element98),
      element97.append(element98, element99),
      element95.append(element96, element97),
      element95
    );
  });
  if (map20.length) {
    const element100 = document.createElement("div");
    ((element100.className = "popup-related-entity-empty popup-related-entity-filter-empty"),
      (element100.textContent = "没有匹配的关联功能。"),
      (element100.hidden = true),
      map20.push(element100));
  } else {
    const element101 = document.createElement("div");
    ((element101.className = "popup-related-entity-empty"),
      (element101.textContent = "这个 HA 设备暂时没有可选择的关联实体。"),
      map20.push(element101));
  }
  (ai.replaceChildren(...map20), Yp());
}
function It(v280 = "image") {
  const ao4 = ao(v280);
  if (ao4.menu.hidden) return;
  const boundingClientRect13 = ao4.button.getBoundingClientRect(),
    num20 = 5,
    num21 = 8,
    min13 = Math.min(boundingClientRect13.width, window.innerWidth - num21 * 2),
    v281 = window.innerHeight - boundingClientRect13.bottom - num20 - num21,
    v282 = boundingClientRect13.top - num20 - num21,
    v283 = v281 >= 250 || v281 >= v282,
    max28 = Math.max(150, Math.min(430, v283 ? v281 : v282)),
    left2 = boundingClientRect13.left;
  ((ao4.menu.style.left =
    clampNumber2(left2, num21, Math.max(num21, window.innerWidth - min13 - num21)) + "px"),
    (ao4.menu.style.width = min13 + "px"),
    (ao4.menu.style.maxHeight = max28 + "px"),
    (ao4.options.style.maxHeight = Math.max(90, max28 - 58) + "px"),
    (ao4.menu.style.top = v283
      ? boundingClientRect13.bottom + num20 + "px"
      : Math.max(num21, boundingClientRect13.top - max28 - num20) + "px"));
}
function Xp() {
  It("image");
}
function Kp(arg276) {
  if (arg276?.url) return String(arg276.url);
  const v284 = String(arg276?.assetId || "");
  if (v284.startsWith("user:")) {
    const slice2 = v284.slice(5);
    return /^[0-9a-f]{32}$/.test(slice2) ? "/api/v1/assets/user/" + slice2 : "";
  }
  const replace2 = String(arg276?.relativePath || v284).replace(/^builtin:/, ""),
    join = (
      replace2.startsWith("v1/2D/") || replace2.startsWith("v1/3D/")
        ? replace2.replace(/^v1\//, "v1/户型图示例/")
        : replace2
    )
      .split("/")
      .filter(Boolean)
      .map((arg277) => encodeURIComponent(arg277))
      .join("/");
  if (!join) return "";
  const v285 = String(arg276?.version || "");
  return "/assets/builtin/" + join + (v285 ? "?v=" + encodeURIComponent(v285) : "");
}
function Jp(arg278) {
  const v286 = arg278?.effectVariant?.url;
  return typeof v286 == "string" && v286.startsWith("/api/v1/assets/effect-variant?")
    ? v286
    : Kp(arg278);
}
const {
    createIconPickerClearOption: uL,
    createIconPickerOption: Qp,
    createEditorPickerCurrentIcon: bw,
    createEditorEntityPickerOption: qt,
    editorPickerClearOption: aA,
    editorPickerClearAction: so,
    editorPickerEntityAction: sA,
    createEditorPickerCurrentEntity: dl,
    createEditorPickerCurrentAsset: pL,
  } = createEditorPickerElements2({
    entityKindLabel: no,
    entityPickerPrimaryName: vt,
    entityPickerText: rt,
    enableEntityTextHoverScroll: ro,
    assetDisplayName: Cw,
    assetPreviewUrl: Jp,
    bindEditorIconNameTooltip: cL,
    mdiIconUrl: Zi,
  }),
  { editorEntityMatches: yw, editorPickerComponentTypeLabel: mL } = createEditorPickerQueries2({
    entityPickerConfig: ao,
    pickerEntitiesForComponentType: io,
    entityPickerText: rt,
    entityDomain: be,
  }),
  fL = createInteraction3dEditorPickers2({
    getState: (arg279) => x?.states?.get(arg279),
    openPicker: (arg280) => kn(arg280),
    fetchIcons: (arg281, arg282, arg283) =>
      _("/icons?query=" + encodeURIComponent(arg281) + "&limit=" + arg282 + "&offset=" + arg283),
    getEntities: () => K,
    ensureEntities: () => (Xo ? Promise.resolve() : Jn || lo()),
    entityPickerText: rt,
    elements: {
      createEditorPickerCurrentIcon: bw,
      createIconPickerOption: Qp,
      createEditorPickerCurrentEntity: dl,
      createEditorEntityPickerOption: qt,
      editorPickerClearAction: so,
    },
  }),
  vw = createEditorAssetMatcher2({
    getImageSource: () => Zt,
    getImageFolder: () => xn,
    getIbeSource: () => en,
    getIbeFolder: () => Nn,
    getUserAssets: () => Nt,
    getBuiltinAssets: () => Xn,
  }),
  gL = createEditorAssetToolbar2({
    documentObject: document,
    getSource: (arg284) => (arg284 === "image" ? Zt : en),
    setSource: (arg285, arg286) => {
      arg285 === "image" ? (Zt = arg286) : (en = arg286);
    },
    getFolder: (arg287) => (arg287 === "image" ? xn : Nn),
    setFolder: (arg288, arg289) => {
      arg288 === "image" ? (xn = arg289) : (Nn = arg289);
    },
    getAssets: (arg290) => (arg290 === "user" ? Nt : Xn),
    getUploadInput: (arg291) => (arg291 === "image" ? Er : Hr),
    canDeleteFolder: (arg292, arg293) => Zp(arg292, arg293),
    onDeleteFolder: (arg294, arg295) => VC(arg294, arg295),
  });
function ul(arg296, arg297) {
  return arg296?.assetId === arg297 || (arg296?.legacyAssetIds || []).includes(arg297);
}
function ww() {
  return [...Xn, ...Nt];
}
function sn(arg298) {
  return ww().find((arg299) => ul(arg299, arg298));
}
function Cw(arg300) {
  return String(arg300?.name || arg300?.relativePath || arg300?.assetId || "").replace(
    /\.(?:png|jpe?g|webp|gif|svg)$/i,
    "",
  );
}
function hL(arg301) {
  return Nt.filter((arg302) => arg302.folder === arg301 && arg302.source === "studio3d-export");
}
function Zp(arg303, arg304) {
  if (arg303 !== "user" || !arg304) return false;
  const filter16 = Nt.filter((arg305) => arg305.folder === arg304);
  return filter16.length > 0 && filter16.every((arg306) => arg306.source === "studio3d-export");
}
function si(arg307) {
  const v287 = arg307 === "image",
    Zt3 = v287 ? Zt : en,
    et2 = v287 ? et : tt,
    Ao2 = v287 ? Ao : Oo,
    y12 = v287 ? y1 : $1,
    text11 = v287 ? "[data-image-asset-source]" : "[data-ibe-asset-source]";
  for (const element102 of et2.querySelectorAll(text11))
    element102.classList.toggle(
      "active",
      element102.dataset[v287 ? "imageAssetSource" : "ibeAssetSource"] === Zt3,
    );
  const v288 = nn.get(Ao2);
  if (v288) {
    const Nt2 = Zt3 === "user" ? Nt : Xn;
    ((v288.wrapper.hidden = !Nt2.some((arg308) => arg308.folder)), v288.wrapper.hidden && Et(v288));
  }
  y12.hidden = Zt3 !== "user";
}
function co(arg309) {
  const v289 = arg309 === "image",
    Zt4 = v289 ? Zt : en,
    Ao3 = v289 ? Ao : Oo,
    Nt3 = Zt4 === "user" ? Nt : Xn,
    sort3 = [...new Set(Nt3.map((arg310) => arg310.folder).filter(Boolean))].sort(
      (arg311, arg312) => arg311.localeCompare(arg312, "zh-CN"),
    ),
    xn2 = v289 ? xn : Nn,
    text12 = sort3.includes(xn2) ? xn2 : sort3[0] || "";
  (v289 ? (xn = text12) : (Nn = text12),
    Ao3.replaceChildren(
      ...sort3.map((arg313) => new Option(arg313 === "." ? "根目录" : arg313, arg313)),
    ),
    (Ao3.value = text12),
    ne(Ao3),
    si(arg309));
}
function em(arg314) {
  return Number(arg314?.width) > 0 && Number(arg314?.height) > 0
    ? Promise.resolve({
        width: Number(arg314.width),
        height: Number(arg314.height),
      })
    : new Promise((arg315, arg316) => {
        const image = new Image();
        ((image.decoding = "async"),
          image.addEventListener(
            "load",
            () => {
              ((arg314.width = image.naturalWidth),
                (arg314.height = image.naturalHeight),
                arg315({
                  width: arg314.width,
                  height: arg314.height,
                }));
            },
            {
              once: true,
            },
          ),
          image.addEventListener(
            "error",
            () => arg316(new Error("无法读取图片尺寸：" + (arg314?.name || ""))),
            {
              once: true,
            },
          ),
          (image.src = Kp(arg314)));
      });
}
function Sw(arg317, arg318, arg319) {
  const v290 = (arg320, arg321) => {
    const v291 = Number(arg320?.width || arg319.width),
      v292 = Number(arg320?.height || arg319.height),
      v293 = clampNumber2(Number(arg321 || 1), 0.01, 5),
      v294 = Number(arg320?.x || 0) + v291 / 2,
      v295 = Number(arg320?.y || 0) + v292 / 2;
    return {
      position: {
        ...(arg320 || {}),
        x: v294 - arg319.width / 2,
        y: v295 - arg319.height / 2,
        width: arg319.width,
        height: arg319.height,
      },
      scale: clampNumber2((v291 * v293) / arg319.width, 0.01, 5),
    };
  };
  if (
    ((arg317.properties = {
      ...(arg317.properties || {}),
    }),
    arg317.properties.layoutMode === "fill")
  ) {
    const freeLayout = arg317.properties.freeLayout;
    if (freeLayout?.position) {
      const v296 = v290(freeLayout.position, freeLayout.scale);
      arg317.properties.freeLayout = v296;
    }
  } else {
    const v297 = v290(arg317.position, arg317.style?.scale);
    ((arg317.position = v297.position),
      (arg317.style = {
        ...(arg317.style || {}),
        scale: v297.scale,
      }));
  }
  arg317.properties = {
    ...(arg317.properties || {}),
    assetId: arg318,
    fit: "contain",
    naturalWidth: arg319.width,
    naturalHeight: arg319.height,
  };
}
function bL(arg322, v298 = null) {
  const v299 = Number(arg322?.effectNaturalWidth || v298?.width || 0),
    v300 = Number(arg322?.effectNaturalHeight || v298?.height || 0);
  return v299 > 0 && v300 > 0
    ? {
        width: v299,
        height: v300,
      }
    : null;
}
function yL(arg323, arg324) {
  if (!arg323 || !arg324) return;
  const v301 = arg323.id + ":" + arg324.assetId;
  mp.has(v301) ||
    (mp.add(v301),
    em(arg324)
      .then((arg325) => {
        const v302 = findComponent2(g?.document, arg323.id)?.component;
        !v302 ||
          v302.properties?.assetId !== arg324.assetId ||
          ((v302.properties?.layoutMode === "fill" ||
            (Number(v302.position?.width) === arg325.width &&
              Number(v302.position?.height) === arg325.height)) &&
            Number(v302.properties?.naturalWidth) === arg325.width &&
            Number(v302.properties?.naturalHeight) === arg325.height) ||
          E((arg326) => {
            const v303 = findComponent2(arg326, arg323.id)?.component;
            !v303 ||
              v303.properties?.assetId !== arg324.assetId ||
              Sw(v303, arg324.assetId, arg325);
          });
      })
      .catch($)
      .finally(() => mp.delete(v301)));
}
function ss() {
  if (et.hidden) return;
  const boundingClientRect14 = zn.getBoundingClientRect(),
    num22 = 5,
    num23 = 8,
    v304 = window.innerHeight - boundingClientRect14.bottom - num22 - num23,
    v305 = boundingClientRect14.top - num22 - num23,
    v306 = v304 >= 260 || v304 >= v305,
    max29 = Math.max(150, Math.min(470, v306 ? v304 : v305));
  ((et.style.left =
    clampNumber2(
      boundingClientRect14.left,
      num23,
      Math.max(num23, window.innerWidth - boundingClientRect14.width - num23),
    ) + "px"),
    (et.style.width = boundingClientRect14.width + "px"),
    (et.style.maxHeight = max29 + "px"),
    (Yt.style.maxHeight = Math.max(80, max29 - 150) + "px"),
    (et.style.top = v306
      ? boundingClientRect14.bottom + num22 + "px"
      : Math.max(num23, boundingClientRect14.top - max29 - num22) + "px"));
}
function xw(arg327, v307 = et) {
  if (fn.hidden || !arg327?.isConnected) return;
  const boundingClientRect15 = arg327.getBoundingClientRect(),
    boundingClientRect16 = v307.getBoundingClientRect(),
    boundingClientRect17 = fn.getBoundingClientRect(),
    num24 = 18,
    v308 =
      boundingClientRect16.left < window.innerWidth / 2
        ? boundingClientRect16.right + num24
        : boundingClientRect16.left - boundingClientRect17.width - num24;
  ((fn.style.left =
    clampNumber2(v308, 12, Math.max(12, window.innerWidth - boundingClientRect17.width - 12)) +
    "px"),
    (fn.style.top =
      clampNumber2(
        boundingClientRect15.top,
        12,
        Math.max(12, window.innerHeight - boundingClientRect17.height - 12),
      ) + "px"));
}
function tm(arg328, arg329, v309 = et) {
  !arg328 ||
    !arg329 ||
    (clearTimeout(Gc),
    (Gc = window.setTimeout(() => {
      const jp2 = Jp(arg328);
      !jp2 ||
        v309.hidden ||
        !arg329.isConnected ||
        ((pd.onload = () => xw(arg329, v309)),
        (pd.src = jp2),
        (v1.textContent = arg328.name || arg328.relativePath),
        (fn.hidden = false),
        window.requestAnimationFrame(() => xw(arg329, v309)));
    }, 300)));
}
function dt() {
  (clearTimeout(Gc), (Gc = null), (fn.hidden = true), (pd.onload = null));
}
function nm(arg330, arg331) {
  const element103 = document.createElement("button");
  ((element103.type = "button"),
    (element103.className = "inspector-asset-option" + (ul(arg330, arg331) ? " selected" : "")),
    (element103.dataset.assetId = arg330.assetId),
    (element103.title = arg330.name),
    element103.setAttribute("role", "option"),
    element103.setAttribute("aria-selected", String(ul(arg330, arg331))));
  const element104 = document.createElement("img");
  ((element104.src = Jp(arg330)),
    (element104.alt = arg330.name),
    (element104.loading = "lazy"),
    element104.addEventListener("error", () => element103.classList.add("image-load-error")));
  const element105 = document.createElement("span");
  if (
    ((element105.textContent = Cw(arg330)),
    element103.append(element104, element105),
    arg330.source === "studio3d-export" || arg330.source !== "user")
  )
    return element103;
  const element106 = document.createElement("div");
  element106.className = "user-asset-option-wrap";
  const element107 = document.createElement("button");
  return (
    (element107.type = "button"),
    (element107.className = "user-asset-delete"),
    (element107.dataset.deleteUserAsset = arg330.assetId),
    (element107.title = "删除 " + arg330.name),
    element107.setAttribute("aria-label", "删除 " + arg330.name),
    (element107.textContent = "×"),
    element106.append(element103, element107),
    element106
  );
}
function cs(v310 = "") {
  dt();
  const text13 = F()?.properties?.assetId || "",
    localeLowerCase4 = v310.trim().toLocaleLowerCase("zh-CN"),
    filter17 = (Zt === "user" ? Nt : Xn).filter((arg332) => {
      const includes3 =
          !localeLowerCase4 ||
          (arg332.name + " " + arg332.relativePath)
            .toLocaleLowerCase("zh-CN")
            .includes(localeLowerCase4),
        v311 = !!localeLowerCase4 || arg332.folder === xn;
      return includes3 && v311;
    }),
    element108 = document.createElement("button");
  if (
    ((element108.type = "button"),
    (element108.className = "inspector-asset-clear" + (text13 ? "" : " selected")),
    (element108.dataset.assetId = ""),
    element108.setAttribute("role", "option"),
    element108.setAttribute("aria-selected", String(!text13)),
    (element108.textContent = "不使用图片"),
    !filter17.length)
  ) {
    const element109 = document.createElement("div");
    ((element109.className = "inspector-picker-empty"),
      (element109.textContent = "没有匹配的图片"),
      Yt.replaceChildren(element108, element109));
    return;
  }
  Yt.replaceChildren(element108, ...filter17.map((arg333) => nm(arg333, text13)));
}
function vL(arg334) {
  const text14 = arg334.properties?.assetId || "",
    sn2 = sn(text14);
  ((Zt =
    ["user", "studio3d-export"].includes(sn2?.source) || (Nt.length && !sn2) ? "user" : "builtin"),
    (xn = sn2?.folder || "" || xn),
    co("image"),
    si("image"),
    (zn.textContent = sn2?.name || text14 || "不使用图片"),
    (Vn.value = ""),
    Yt.replaceChildren(),
    yL(arg334, sn2));
}
function ls() {
  if (tt.hidden) return;
  const boundingClientRect18 = jn.getBoundingClientRect(),
    num25 = 5,
    num26 = 8,
    v312 = window.innerHeight - boundingClientRect18.bottom - num25 - num26,
    v313 = boundingClientRect18.top - num25 - num26,
    v314 = v312 >= 260 || v312 >= v313,
    max30 = Math.max(150, Math.min(470, v314 ? v312 : v313));
  ((tt.style.left =
    clampNumber2(
      boundingClientRect18.left,
      num26,
      Math.max(num26, window.innerWidth - boundingClientRect18.width - num26),
    ) + "px"),
    (tt.style.width = boundingClientRect18.width + "px"),
    (tt.style.maxHeight = max30 + "px"),
    (bn.style.maxHeight = Math.max(80, max30 - 150) + "px"),
    (tt.style.top = v314
      ? boundingClientRect18.bottom + num25 + "px"
      : Math.max(num26, boundingClientRect18.top - max30 - num25) + "px"));
}
function ds(v315 = "") {
  dt();
  const text15 = F()?.properties?.effectAssetId || "",
    localeLowerCase5 = v315.trim().toLocaleLowerCase("zh-CN"),
    filter18 = (en === "user" ? Nt : Xn).filter(
      (arg335) =>
        (!localeLowerCase5 ||
          (arg335.name + " " + arg335.relativePath)
            .toLocaleLowerCase("zh-CN")
            .includes(localeLowerCase5)) &&
        (!!localeLowerCase5 || arg335.folder === Nn),
    ),
    element110 = document.createElement("button");
  ((element110.type = "button"),
    (element110.className = "inspector-asset-clear" + (text15 ? "" : " selected")),
    (element110.dataset.assetId = ""),
    element110.setAttribute("role", "option"),
    element110.setAttribute("aria-selected", String(!text15)),
    (element110.textContent = "不使用图片"));
  const map21 = filter18.map((arg336) => nm(arg336, text15)),
    element111 = document.createElement("div");
  ((element111.className = "inspector-picker-empty"),
    map21.length || (element111.textContent = "没有匹配的图片"),
    bn.replaceChildren(element110, ...map21, ...(element111.textContent ? [element111] : [])));
}
function wL(arg337) {
  const text16 = arg337.properties?.effectAssetId || "",
    sn3 = sn(text16);
  ((en =
    ["user", "studio3d-export"].includes(sn3?.source) || (Nt.length && !sn3) ? "user" : "builtin"),
    (Nn = sn3?.folder || Nn),
    co("ibe"),
    si("ibe"),
    (jn.textContent = sn3?.name || text16 || "不使用图片"),
    (qn.value = ""),
    bn.replaceChildren());
}
function Nw(arg338) {
  const text17 = arg338.closest(".inspector-form[id]")?.id || "component-action",
    replace3 = String(arg338.dataset.actionTrigger || "action").replace(/[^a-zA-Z0-9_-]/g, "-"),
    list20 = [
      ["[data-action-target]", "target"],
      ["[data-popup-source]", "popup-source"],
      ["[data-popup-entity-search]", "popup-entity-search"],
      ["[data-popup-entity]", "popup-entity"],
      ["[data-popup-custom]", "popup-custom"],
    ];
  for (const [v316, v317] of list20) {
    const selector23 = arg338.querySelector(v316);
    selector23 &&
      !selector23.id &&
      !selector23.name &&
      (selector23.id = text17 + "-" + replace3 + "-" + v317);
  }
}
function Ew() {
  for (const element112 of document.querySelectorAll('[data-action-type="more-info"]'))
    element112.textContent = "打开弹窗";
  for (const element113 of document.querySelectorAll(
    ".component-action-control[data-action-trigger]",
  )) {
    if ((Nw(element113), element113.querySelector(".component-popup-config"))) continue;
    const element114 = document.createElement("div");
    ((element114.className = "component-popup-config"),
      (element114.hidden = true),
      (element114.innerHTML =
        '\n      <label class="component-popup-config-row"><span>弹窗来源</span><select data-popup-source><option value="current">当前实体</option><option value="entity">其它实体</option><option value="custom">组合弹窗</option></select></label>\n      <div class="component-popup-config-row" data-popup-entity-row><span>选择实体</span><div class="component-popup-entity-picker"><button class="inspector-picker-button" type="button" data-popup-entity-button aria-haspopup="listbox" aria-expanded="false">选择实体</button><div class="inspector-picker-menu component-popup-entity-menu" data-popup-entity-menu hidden><input type="search" data-popup-entity-search placeholder="搜索实体名称或 ID" autocomplete="off"><div class="inspector-entity-options" data-popup-entity-options role="listbox"></div></div><input type="hidden" data-popup-entity></div></div>\n      <label class="component-popup-config-row" data-popup-custom-row><span>选择弹窗</span><select data-popup-custom></select></label>\n      <button class="component-popup-preview" type="button" data-popup-preview>预览弹窗</button>'),
      element113.append(element114),
      Nw(element113));
    const selector24 = element114.querySelector("[data-popup-entity-button]"),
      selector25 = element114.querySelector("[data-popup-entity]");
    uw(selector24, () => selector25?.value || "");
  }
}
function pl(v318 = null) {
  for (const element115 of document.querySelectorAll("[data-popup-entity-menu]")) {
    const closest5 = element115.closest("[data-action-trigger]");
    closest5 !== v318 &&
      ((element115.hidden = true),
      closest5
        ?.querySelector("[data-popup-entity-button]")
        ?.setAttribute("aria-expanded", "false"));
  }
}
function om(arg339) {
  const text18 = arg339?.querySelector("[data-popup-entity]")?.value || "",
    v319 = K.find((arg340) => arg340.entityId === text18),
    element116 = arg339?.querySelector("[data-popup-entity-button]");
  if (!element116) return;
  const text19 = v319 ? "[" + no(v319) + "] " + vt(v319) : text18 || "选择实体";
  (ts(element116, text19, text18 || text19),
    (element116.dataset.entityId = text18),
    element116._entityCopySync?.());
}
function ml(arg341, v320 = "") {
  const v321 = arg341?.querySelector("[data-popup-entity-options]"),
    text20 = arg341?.querySelector("[data-popup-entity]")?.value || "";
  if (!v321) return;
  const localeLowerCase6 = String(v320 || "")
      .trim()
      .toLocaleLowerCase("zh-CN"),
    filter19 = K.filter(
      (arg342) =>
        !localeLowerCase6 ||
        (rt(arg342) + " " + arg342.entityId).toLocaleLowerCase("zh-CN").includes(localeLowerCase6),
    );
  if (
    (v321.replaceChildren(
      ...filter19.map((arg343) => {
        const element117 = document.createElement("button");
        ((element117.type = "button"),
          (element117.className =
            "inspector-entity-option" + (arg343.entityId === text20 ? " selected" : "")),
          (element117.dataset.popupActionEntityId = arg343.entityId),
          element117.setAttribute("role", "option"),
          element117.setAttribute("aria-selected", String(arg343.entityId === text20)));
        const element118 = document.createElement("span");
        element118.className = "inspector-entity-option-content";
        const element119 = document.createElement("span");
        ((element119.className = "inspector-entity-option-line inspector-entity-name-line"),
          (element119.textContent = "[" + no(arg343) + "] " + vt(arg343)));
        const element120 = document.createElement("span");
        return (
          (element120.className = "inspector-entity-option-line inspector-entity-id"),
          (element120.textContent = arg343.entityId),
          element118.append(element119, element120),
          ro(element117, element119),
          element117.append(element118),
          element117
        );
      }),
    ),
    !filter19.length)
  ) {
    const element121 = document.createElement("div");
    ((element121.className = "inspector-picker-empty"),
      (element121.textContent = "没有匹配的实体"),
      v321.append(element121));
  }
}
function fl(arg344) {
  const element122 = arg344?.querySelector("[data-popup-entity-button]"),
    element123 = arg344?.querySelector("[data-popup-entity-menu]");
  if (!element122 || !element123 || element123.hidden) return;
  const boundingClientRect19 = element122.getBoundingClientRect(),
    min14 = Math.min(boundingClientRect19.width, window.innerWidth - 16),
    min15 = Math.min(340, window.innerHeight - 16);
  ((element123.style.width = min14 + "px"), (element123.style.maxHeight = min15 + "px"));
  const selector26 = element123.querySelector("[data-popup-entity-options]");
  selector26 && (selector26.style.maxHeight = Math.max(120, min15 - 58) + "px");
  const v322 = clampNumber2(boundingClientRect19.left, 8, window.innerWidth - min14 - 8),
    min16 = Math.min(element123.scrollHeight, min15),
    v323 = boundingClientRect19.bottom + 5,
    max31 =
      v323 + min16 <= window.innerHeight - 8
        ? v323
        : Math.max(8, boundingClientRect19.top - min16 - 5);
  ((element123.style.left = v322 + "px"), (element123.style.top = max31 + "px"));
}
function In(arg345, arg346) {
  Ew();
  const text21 = arg345.bindings?.entity?.entityId || "",
    v324 = arg345.type === "light-statistics";
  v324 &&
    ((K1.textContent = text21
      ? "切换和“当前实体”弹窗作用于绑定实体；其它实体弹窗、组合弹窗和跳转页面无需绑定动作实体。"
      : "未绑定动作实体时仍可使用其它实体弹窗、组合弹窗和跳转页面。"),
    arg346.setAttribute("aria-disabled", "false"));
  const list21 = g.document.pages || [],
    set7 = new Set(list21.map((arg347) => arg347.path)),
    set8 = new Set((g.document.customPopups || []).map((arg348) => arg348.id)),
    selector27 = arg346.querySelector("[data-hidden-content-clickable-control]");
  if (selector27) {
    const includes4 = ["title-button", "device-button", "icon-button-effect"].includes(arg345.type);
    selector27.hidden = !includes4;
    for (const element124 of selector27.querySelectorAll("[data-hidden-content-clickable]")) {
      const v325 =
        element124.dataset.hiddenContentClickable ===
        (arg345.properties?.hiddenContentClickable === true ? "on" : "off");
      (element124.classList.toggle("active", v325),
        element124.setAttribute("aria-pressed", String(v325)));
    }
  }
  for (const element125 of arg346.querySelectorAll("[data-action-trigger]")) {
    const actionTrigger = element125.dataset.actionTrigger,
      v326 = arg345.actions?.[actionTrigger],
      text22 = componentActionIsSupported2(arg345, v326, {
        pagePaths: set7,
        popupIds: set8,
      })
        ? v326.type
        : "none";
    for (const element126 of element125.querySelectorAll("[data-action-type]")) {
      const v327 = element126.dataset.actionType === text22;
      (element126.classList.toggle("active", v327),
        element126.setAttribute("aria-pressed", String(v327)),
        (element126.disabled =
          (element126.dataset.actionType === "toggle" &&
            (!text21 || !entityIdSupportsToggle2(text21))) ||
          (v324 &&
            !["none", "toggle", "more-info", "navigate"].includes(element126.dataset.actionType))));
    }
    const selector28 = element125.querySelector(".component-action-target"),
      selector29 = element125.querySelector("[data-action-target]"),
      v328 = arg345.actions?.[actionTrigger]?.target;
    (selector29.replaceChildren(...list21.map((arg349) => new Option(arg349.name, arg349.path))),
      (selector29.value = set7.has(v328) ? v328 : W.value || list21[0]?.path || ""),
      ne(selector29),
      (selector28.hidden = text22 !== "navigate"));
    const selector30 = element125.querySelector(".component-popup-config"),
      selector31 = element125.querySelector("[data-popup-source]"),
      selector32 = element125.querySelector("[data-popup-entity]"),
      selector33 = element125.querySelector("[data-popup-custom]"),
      selector34 = element125.querySelector("[data-popup-entity-row]"),
      selector35 = element125.querySelector("[data-popup-custom-row]"),
      selector36 = element125.querySelector("[data-popup-preview]"),
      v329 = actionPopupData2(arg345.actions?.[actionTrigger]);
    selector31.value = v329.source;
    const selector37 = selector31.querySelector('option[value="current"]');
    (selector37 && (selector37.disabled = !text21),
      (selector32.value = v329.entityId || K[0]?.entityId || ""));
    const list22 = g.document.customPopups || [];
    (selector33.replaceChildren(...list22.map((arg350) => new Option(arg350.name, arg350.id))),
      (selector33.value = list22.some((arg351) => arg351.id === v329.popupId)
        ? v329.popupId
        : list22[0]?.id || ""),
      ne(selector31),
      ne(selector33),
      om(element125));
    const selector38 = element125.querySelector("[data-popup-entity-menu]");
    (selector38 &&
      !selector38.hidden &&
      (ml(element125, element125.querySelector("[data-popup-entity-search]")?.value || ""),
      window.requestAnimationFrame(() => fl(element125))),
      (selector30.hidden = text22 !== "more-info"),
      (selector34.hidden = v329.source !== "entity"),
      (selector35.hidden = v329.source !== "custom"),
      (selector36.disabled =
        v329.source === "current"
          ? !text21
          : v329.source === "entity"
            ? !selector32.value
            : !selector33.value));
  }
}
function Lw(arg352, v330 = arg352?.properties || {}) {
  fitInspectorComponentToDimensions2(arg352, v330, timeComponentDimensions2);
}
function CL(arg353) {
  const options16 = arg353.properties || {},
    {
      left: v331,
      top: v332,
      scale: v333,
      rotation: v334,
    } = inspectorComponentMetrics2(arg353, g.document);
  ((WN.value = "时间"), (by.value = options16.label || ""));
  for (const element127 of yy.querySelectorAll("[data-time-hour-format]"))
    element127.classList.toggle(
      "active",
      element127.dataset.timeHourFormat === (options16.hour12 === true ? "12" : "24"),
    );
  for (const element128 of vy.querySelectorAll("[data-time-seconds]"))
    element128.classList.toggle(
      "active",
      element128.dataset.timeSeconds === (options16.showSeconds === true ? "on" : "off"),
    );
  ((wy.value = options16.color || "#248eb2"),
    (Cy.value = roundField2(clampNumber2(Number(options16.fontSize ?? 96), 12, 500))),
    (Sy.value = roundField2(normalizedFontWeight2(options16.fontWeight))),
    (xy.value = roundField2(clampNumber2(Number(options16.letterSpacing ?? 2.2), -20, 100))),
    (Ny.value = roundField2(clampNumber2(Number(options16.opacity ?? 1) * 100, 0, 100))),
    (ma.value = v331),
    (fa.value = v332),
    ($o.value = v333),
    (Bi.value = v334),
    ($o.disabled = false),
    (Bi.disabled = false));
}
function Iw(arg354, v335 = arg354?.properties || {}) {
  fitInspectorComponentToDimensions2(arg354, v335, dateComponentDimensions2);
}
function SL(arg355) {
  const options17 = arg355.properties || {},
    {
      left: v336,
      top: v337,
      scale: v338,
      rotation: v339,
    } = inspectorComponentMetrics2(arg355, g.document);
  ((RN.value = "日期"), (Ey.value = options17.label || ""));
  for (const element129 of Ly.querySelectorAll("[data-date-weekday]"))
    element129.classList.toggle(
      "active",
      element129.dataset.dateWeekday === (options17.showWeekday === false ? "off" : "on"),
    );
  for (const element130 of Iy.querySelectorAll("[data-date-lunar]"))
    element130.classList.toggle(
      "active",
      element130.dataset.dateLunar === (options17.showLunar === true ? "on" : "off"),
    );
  ((Ty.value = options17.primaryColor || "#8d9296"),
    (Ay.value = roundField2(clampNumber2(Number(options17.primarySize ?? 36), 12, 500))),
    (Py.value = roundField2(normalizedFontWeight2(options17.primaryWeight))),
    (ky.value = roundField2(clampNumber2(Number(options17.primarySpacing ?? 1), -20, 100))),
    (My.value = options17.lunarColor || "#7f878c"),
    (Oy.value = roundField2(clampNumber2(Number(options17.lunarSize ?? 24), 10, 500))),
    (By.value = roundField2(normalizedFontWeight2(options17.lunarWeight))),
    ($y.value = roundField2(clampNumber2(Number(options17.lunarSpacing ?? 1), -20, 100))),
    (Fy.value = roundField2(clampNumber2(Number(options17.lineGap ?? 8), 0, 200))),
    (Dy.value = roundField2(clampNumber2(Number(options17.opacity ?? 1) * 100, 0, 100))),
    (ha.value = v336),
    (ba.value = v337),
    (Fo.value = v338),
    ($i.value = v339),
    (Fo.disabled = false),
    ($i.disabled = false));
}
function Tw(arg356, v340 = arg356?.properties || {}) {
  fitInspectorComponentToDimensions2(arg356, v340, weatherComponentDimensions2);
}
function xL(arg357) {
  const options18 = arg357.properties || {},
    {
      left: v341,
      top: v342,
      scale: v343,
      rotation: v344,
    } = inspectorComponentMetrics2(arg357, g.document);
  (jt(arg357), (HN.value = "天气"), (zy.value = options18.label || ""));
  const list23 = [
    [Vy, "weatherIconVisible", options18.iconVisible !== false],
    [Wy, "weatherTemperatureVisible", options18.temperatureVisible !== false],
    [Ry, "weatherConditionVisible", options18.conditionVisible !== false],
    [Hy, "weatherHumidityVisible", options18.humidityVisible !== false],
  ];
  for (const [element131, v345, v346] of list23)
    for (const element132 of element131.querySelectorAll(
      "[data-" + v345.replace(/[A-Z]/g, (arg358) => "-" + arg358.toLowerCase()) + "]",
    )) {
      const v347 = element132.dataset[v345];
      (element132.classList.toggle("active", v347 === (v346 ? "on" : "off")),
        element132.setAttribute("aria-pressed", String(v347 === (v346 ? "on" : "off"))));
    }
  ((jy.value = roundField2(clampNumber2(Number(options18.iconSize ?? 64), 12, 500))),
    (qy.value = roundField2(clampNumber2(Number(options18.iconGap ?? 22), 0, 300))),
    (Uy.value = options18.temperatureColor || "#aeb3b7"),
    (Gy.value = roundField2(clampNumber2(Number(options18.temperatureSize ?? 32), 12, 500))),
    (_y.value = roundField2(normalizedFontWeight2(options18.temperatureWeight))),
    (Yy.value = roundField2(clampNumber2(Number(options18.temperatureSpacing ?? 1), -20, 100))),
    (Xy.value = options18.secondaryColor || "#8d9296"),
    (Ky.value = roundField2(clampNumber2(Number(options18.secondarySize ?? 18), 10, 500))),
    (Jy.value = roundField2(normalizedFontWeight2(options18.secondaryWeight))),
    (Qy.value = roundField2(clampNumber2(Number(options18.secondarySpacing ?? 1), -20, 100))),
    (Zy.value = roundField2(clampNumber2(Number(options18.lineGap ?? 7), 0, 200))),
    (ev.value = roundField2(clampNumber2(Number(options18.opacity ?? 1) * 100, 0, 100))),
    (va.value = v341),
    (wa.value = v342),
    (Do.value = v343),
    (Fi.value = v344),
    (Do.disabled = false),
    (Fi.disabled = false));
}
function NL(arg359) {
  const options19 = arg359.properties || {},
    options20 = arg359.position || {},
    v348 = Number(g.document.canvas.width || 2778),
    v349 = Number(g.document.canvas.height || 1940),
    v350 = Number(options20.width || 100),
    v351 = Number(options20.height || 100);
  (jt(arg359), (UN.value = "折线图"), (tv.value = options19.label || ""));
  for (const element133 of nv.querySelectorAll("[data-line-chart-value-visible]")) {
    const v352 =
      element133.dataset.lineChartValueVisible ===
      (options19.valueVisible === false ? "off" : "on");
    (element133.classList.toggle("active", v352),
      element133.setAttribute("aria-pressed", String(v352)));
  }
  ((ov.value = roundField2(clampNumber2(Number(options19.valueScale ?? 100), 10, 500))),
    (iv.value = options19.valueColor || "#dce1e5"),
    (rv.value = ["0", "1", "2", "3", "4"].includes(String(options19.statePrecision))
      ? String(options19.statePrecision)
      : "auto"),
    (av.value = roundField2(clampNumber2(Number(options19.valueOffsetX ?? 0), -100, 100))),
    (sv.value = roundField2(clampNumber2(Number(options19.valueOffsetY ?? 0), -100, 100))),
    (cv.value = roundField2(clampNumber2(Number(options19.updateInterval ?? 600), 30, 86400))),
    (lv.value = roundField2(clampNumber2(Number(options19.hours ?? 24), 1, 168))),
    (dv.value = roundField2(clampNumber2(Number(options19.cornerRadius ?? 10), 0, 50))));
  const list24 = [
      {
        value: 0,
        color: "#ddffc2",
      },
      {
        value: 13,
        color: "#68cc3e",
      },
      {
        value: 27,
        color: "#ff8e52",
      },
      {
        value: 40,
        color: "#ff1a1a",
      },
    ],
    some3 =
      Array.isArray(options19.thresholds) &&
      options19.thresholds.some((arg360) => Number.isFinite(Number(arg360?.value))),
    text23 =
      options19.thresholdMode === "auto" || (!some3 && options19.thresholdMode !== "manual")
        ? "auto"
        : "manual";
  Ou.value = text23;
  const thresholds = some3 ? options19.thresholds : list24;
  (Di.forEach((arg361, arg362) => {
    ((arg361.value.value = roundField2(Number(thresholds[arg362]?.value ?? list24[arg362].value))),
      (arg361.color.value = thresholds[arg362]?.color || list24[arg362].color),
      (arg361.value.disabled = text23 === "auto"),
      (arg361.color.disabled = text23 === "auto"));
  }),
    (Sa.value = roundField2(
      clampNumber2(((Number(options20.x || 0) + v350 / 2) / v348) * 100, 0, 100),
    )),
    (xa.value = roundField2(
      clampNumber2(((Number(options20.y || 0) + v351 / 2) / v349) * 100, 0, 100),
    )),
    (zi.value = roundField2(clampNumber2((v350 / v348) * 100, 0.1, 100))),
    (Vi.value = roundField2(clampNumber2((v351 / v349) * 100, 0.1, 100))),
    (zo.value = roundField2(clampNumber2(Number(arg359.style?.scale || 1) * 100, 1, 500))),
    (Wi.value = roundField2(clampNumber2(Number(options20.rotation || 0), -360, 360))));
  const v353 = B.size > 1;
  ((zi.disabled = v353), (Vi.disabled = v353), (zo.disabled = false), (Wi.disabled = false));
  const v354 = Pe(arg359).length,
    v355 = yC(arg359).length;
  ((Bc.disabled = !v354 || !v355),
    (XN.textContent = v355 + " 项修改"),
    (Bc.textContent = "一键应用到同类型控件"),
    In(arg359, YN));
}
function EL(arg363) {
  const options21 = arg363.properties || {},
    options22 = arg363.position || {},
    v356 = Number(g.document.canvas.width || 2778),
    v357 = Number(g.document.canvas.height || 1940),
    v358 = Number(options22.width || 100),
    v359 = Number(options22.height || 100);
  ((KN.value = "底图框"),
    (uv.value = options21.label || ""),
    setInspectorToggle2(pv, options21.mainTextVisible !== false),
    (mv.value = options21.mainText || ""),
    (fv.value = options21.mainColor || "#ffffff"),
    (gv.value = roundField2(clampNumber2(Number(options21.mainSize ?? 30), 8, 500))),
    (hv.value = roundField2(clampNumber2(Number(options21.mainWeight ?? 0), 0, 3))),
    (bv.value = roundField2(clampNumber2(Number(options21.mainOpacity ?? 0.72) * 100, 0, 100))),
    (yv.value = roundField2(clampNumber2(Number(options21.mainSpacing ?? 2), -20, 100))));
  const v360 = Number(options21.textLeft ?? 5.2),
    v361 = Number(options21.textTop ?? 28);
  ((vv.value = roundField2(clampNumber2(Number(options21.mainTextLeft ?? v360), -100, 200))),
    (wv.value = roundField2(
      clampNumber2(
        Number(options21.mainTextTop ?? v361 - (Number(options21.lineGap ?? 24) / v359) * 100),
        -100,
        200,
      ),
    )),
    setInspectorToggle2(Cv, options21.secondaryTextVisible !== false),
    (Sv.value = options21.secondaryText || ""),
    (xv.value = options21.secondaryColor || "#ffffff"),
    (Nv.value = roundField2(clampNumber2(Number(options21.secondarySize ?? 15), 6, 500))),
    (Ev.value = roundField2(clampNumber2(Number(options21.secondaryWeight ?? 0), 0, 3))),
    (Lv.value = roundField2(
      clampNumber2(Number(options21.secondaryOpacity ?? 0.36) * 100, 0, 100),
    )),
    (Iv.value = roundField2(clampNumber2(Number(options21.secondarySpacing ?? 2.1), -20, 100))),
    (Tv.value = roundField2(clampNumber2(Number(options21.secondaryTextLeft ?? v360), -100, 200))),
    (Av.value = roundField2(clampNumber2(Number(options21.secondaryTextTop ?? v361), -100, 200))),
    setInspectorToggle2(Pv, options21.edgeVisible !== false),
    (kv.value = options21.edgeColor || "#d4d4d4"),
    (Mv.value = roundField2(clampNumber2(Number(options21.edgeWidth ?? 0.9), 0, 20))),
    (Ov.value = roundField2(clampNumber2(Number(options21.edgeOpacity ?? 1) * 100, 0, 100))),
    (Bv.value = roundField2(clampNumber2(Number(options21.radius ?? 0.195) * 100, 0, 50))),
    ($v.value = roundField2(clampNumber2(Number(options21.edgeAngle ?? 45), 0, 360))),
    setInspectorToggle2(Fv, options21.glowVisible !== false),
    (Dv.value = options21.glowColor || "#ffffff"),
    (zv.value = roundField2(clampNumber2(Number(options21.glowStrength ?? 0.5) * 100, 0, 500))),
    (Vv.value = roundField2(clampNumber2(Number(options21.glowSize ?? 1.5) * 100, 0, 300))),
    (Wv.value = roundField2(clampNumber2(Number(options21.glowAngle ?? 242), 0, 360))),
    (Ea.value = roundField2(
      clampNumber2(((Number(options22.x || 0) + v358 / 2) / v356) * 100, 0, 100),
    )),
    (La.value = roundField2(
      clampNumber2(((Number(options22.y || 0) + v359 / 2) / v357) * 100, 0, 100),
    )),
    (Ri.value = roundField2(clampNumber2((v358 / v356) * 100, 0.1, 100))),
    (Hi.value = roundField2(clampNumber2((v359 / v357) * 100, 0.1, 100))),
    (Vo.value = roundField2(clampNumber2(Number(arg363.style?.scale || 1) * 100, 1, 500))),
    (ji.value = roundField2(clampNumber2(Number(options22.rotation || 0), -360, 360))));
  const v362 = B.size > 1;
  ((Ri.disabled = v362), (Hi.disabled = v362), (Vo.disabled = false), (ji.disabled = false));
  const v363 = Pe(arg363).length,
    v364 = PC(arg363).length;
  (($c.disabled = !v363 || !v364),
    (JN.textContent = v364 + " 项修改"),
    ($c.textContent = "一键应用到同类型控件"));
}
function LL(arg364) {
  const options23 = arg364.properties || {},
    options24 = arg364.position || {},
    list25 = g.document.pages || [],
    v365 = Number(g.document.canvas.width || 2778),
    v366 = Number(g.document.canvas.height || 1940),
    v367 = Number(options24.width || 100),
    v368 = Number(options24.height || 100),
    v369 = arg364.type === "scene-mode";
  ((ZN.value = v369 ? "情景模式" : "导航按钮"),
    (Ia.closest(".inspector-picker").querySelector(".inspector-picker-title").textContent = v369
      ? "绑定实体"
      : "关联实体（可选）"),
    Wo.classList.toggle("is-scene-mode", v369),
    (Bu.closest(".inspector-section").hidden = !v369));
  const text24 = arg364.bindings?.entity?.entityId || "",
    v370 = resolveSceneControlMode2(options23.controlMode, text24);
  for (const element134 of Bu.querySelectorAll("[data-scene-control-mode]")) {
    const v371 = element134.dataset.sceneControlMode === v370;
    (element134.classList.toggle("active", v371),
      element134.setAttribute("aria-pressed", String(v371)));
  }
  ((QN.textContent = v370 === "switch" ? "点击切换，状态跟随设备。" : "点击执行，轻弹反馈。"),
    (Hu.closest(".inspector-section").hidden = v369),
    (ju.closest(".inspector-section").hidden = v369),
    (l0.closest(".inspector-section").hidden = v369));
  for (const v372 of [Vu, Wu, Ru]) v372.hidden = v369;
  ((Fc.value = options23.label || ""), jt(arg364));
  const text25 = _i.get(arg364.id) || "auto";
  for (const element135 of $u.querySelectorAll("[data-navigation-preview]"))
    (element135.classList.toggle("active", element135.dataset.navigationPreview === text25),
      (element135.textContent =
        element135.dataset.navigationPreview === "auto"
          ? "自动跟随"
          : element135.dataset.navigationPreview === "on"
            ? v369
              ? "激活"
              : "选择后"
            : v369
              ? "默认"
              : "选择前"));
  ((Du.value = options23.mainText || "页面导航"),
    (zu.value = options23.secondaryText || "NAVIGATION"),
    setInspectorToggle2(Vu, options23.mainTextVisible !== false),
    setInspectorToggle2(Wu, options23.secondaryTextVisible !== false),
    setInspectorToggle2(Ru, options23.iconVisible !== false),
    setInspectorToggle2(Hu, options23.frameVisible !== false),
    setInspectorToggle2(ju, options23.glowVisible !== false),
    eL(options23.icon || ""),
    (Rv.value = options23.mainColor || "#e9edf0"),
    (Hv.value = options23.secondaryColor || "#e9edf0"),
    (jv.value = roundField2(Number(options23.mainSize ?? 30))),
    (qv.value = roundField2(Number(options23.secondarySize ?? 11))),
    (Uv.value = roundField2(Number(options23.mainWeight ?? 0))),
    (Gv.value = roundField2(Number(options23.secondaryWeight ?? 0))),
    (_v.value = roundField2(Number(options23.mainSpacing ?? 8))),
    (Yv.value = roundField2(Number(options23.secondarySpacing ?? 3))));
  const v373 = Number(options23.textLeft ?? 27.5),
    v374 = Number(options23.textTop ?? 81.5);
  ((Xv.value = roundField2(Number(options23.mainTextLeft ?? v373))),
    (Kv.value = roundField2(Number(options23.mainTextTop ?? v374 - 1800 / 64.36))),
    (Jv.value = roundField2(Number(options23.secondaryTextLeft ?? v373))),
    (Qv.value = roundField2(Number(options23.secondaryTextTop ?? v374))),
    (qu.value = roundField2(
      clampNumber2(Number(options23.textIdleOpacity ?? options23.idleOpacity ?? 0.3) * 100, 0, 100),
    )),
    (Uu.value = roundField2(
      clampNumber2(
        Number(options23.textActiveOpacity ?? options23.activeOpacity ?? 0.96) * 100,
        0,
        100,
      ),
    )),
    (Zv.value = options23.iconColor || "#e9edf0"),
    (e0.value = roundField2(Number(options23.iconSize ?? 50))),
    (t0.value = roundField2(Number(options23.iconLeft ?? 14))),
    (n0.value = roundField2(Number(options23.iconTop ?? 50))),
    (Gu.value = roundField2(
      clampNumber2(Number(options23.iconIdleOpacity ?? options23.idleOpacity ?? 0.3) * 100, 0, 100),
    )),
    (_u.value = roundField2(
      clampNumber2(
        Number(options23.iconActiveOpacity ?? options23.activeOpacity ?? 0.96) * 100,
        0,
        100,
      ),
    )),
    (o0.value = options23.frameColor || "#d9e0e6"),
    (i0.value = roundField2(Number(options23.frameWidth ?? 2))),
    (Yu.value = roundField2(
      clampNumber2(Number(options23.frameIdleOpacity ?? 0.48) * 100, 0, 100),
    )),
    (Xu.value = roundField2(
      clampNumber2(Number(options23.frameActiveOpacity ?? 0.98) * 100, 0, 100),
    )),
    (r0.value = roundField2(clampNumber2(Number(options23.frameAngle ?? 45), 0, 360))),
    (a0.value = options23.glowColor || "#f2f6fa"),
    (s0.value = roundField2(clampNumber2(Number(options23.glowAngle ?? 45), 0, 360))),
    (Ku.value = roundField2(clampNumber2(Number(options23.glowIdleStrength ?? 0.5) * 100, 0, 500))),
    (Ju.value = roundField2(clampNumber2(Number(options23.glowIdleSize ?? 1.5) * 100, 0, 300))),
    (Qu.value = roundField2(
      clampNumber2(Number(options23.glowActiveStrength ?? 2.2) * 100, 0, 500),
    )),
    (Zu.value = roundField2(clampNumber2(Number(options23.glowActiveSize ?? 3) * 100, 0, 300))),
    (c0.value = roundField2(clampNumber2(Number(options23.radius ?? 0.5) * 100, 0, 50))),
    (ka.value = roundField2(
      clampNumber2(((Number(options24.x || 0) + v367 / 2) / v365) * 100, 0, 100),
    )),
    (Ma.value = roundField2(
      clampNumber2(((Number(options24.y || 0) + v368 / 2) / v366) * 100, 0, 100),
    )),
    (Ro.value = roundField2(clampNumber2((v367 / v365) * 100, 0.1, 100))),
    (Ho.value = roundField2(clampNumber2((v368 / v366) * 100, 0.1, 100))),
    (_n.value = roundField2(clampNumber2(Number(arg364.style?.scale || 1) * 100, 1, 500))),
    (jo.value = roundField2(Number(options24.rotation || 0))));
  const v375 = B.size > 1;
  ((Ro.disabled = v375), (Ho.disabled = v375), (_n.disabled = false), (jo.disabled = false));
  const v376 = Pe(arg364).length,
    v377 = MC(arg364).length;
  ((Dc.disabled = !v376 || !v377),
    (nE.textContent = v377 + " 项修改"),
    (Dc.textContent = "一键应用到同类型控件"),
    In(arg364, l0));
}
function IL(arg365) {
  const options25 = arg365.properties || {},
    options26 = arg365.position || {},
    v378 = Number(g.document.canvas.width || 2778),
    v379 = Number(g.document.canvas.height || 1940),
    v380 = Number(options26.width || 100),
    v381 = Number(options26.height || 100);
  ((fg.value = options25.label || ""),
    jt(arg365),
    setInspectorToggle2(gg, options25.mainTextVisible !== false),
    setInspectorToggle2(hg, options25.secondaryTextVisible !== false),
    setInspectorToggle2(Dg, options25.frameVisible !== false),
    setInspectorToggle2(kg, options25.iconVisible !== false),
    (bg.value = options25.mainText || ""));
  const slice3 = String(options25.secondaryText || "")
    .split(/\r?\n/)
    .slice(0, 2);
  ((oc.value = slice3[0] || ""),
    (ic.value = slice3[1] || ""),
    (yg.value = options25.mainColor || "#b9bbc0"),
    (vg.value = options25.secondaryColor || "#70737b"),
    (wg.value = roundField2(Number(options25.mainSize ?? 34))),
    (Cg.value = roundField2(Number(options25.secondarySize ?? 12))),
    (Sg.value = roundField2(normalizedFontWeight2(options25.mainWeight, 0.3))),
    (xg.value = roundField2(normalizedFontWeight2(options25.secondaryWeight, 0.2))),
    (Ng.value = roundField2(Number(options25.mainSpacing ?? 1))),
    (Eg.value = roundField2(Number(options25.secondarySpacing ?? 2))),
    (Lg.value = roundField2(Number(options25.secondaryLineGap ?? 2))),
    (Ig.value = roundField2(Number(options25.mainTextLeft ?? 5.5))),
    (Tg.value = roundField2(Number(options25.mainTextTop ?? 45))),
    (Ag.value = roundField2(Number(options25.secondaryTextLeft ?? 54))),
    (Pg.value = roundField2(Number(options25.secondaryTextTop ?? 43))),
    oL(options25.icon || ""),
    (Mg.value = options25.iconColor || "#b9bbc0"),
    (Og.value = roundField2(Number(options25.iconSize ?? 30))),
    (Bg.value = roundField2(Number(options25.iconLeft ?? 50))),
    ($g.value = roundField2(Number(options25.iconTop ?? 45))),
    (Fg.value = options25.frameColor || "#60636a"),
    (zg.value = roundField2(Number(options25.frameWidth ?? 1.5))),
    (Vg.value = roundField2(Number(options25.frameSize ?? 100))),
    (Wg.value = roundField2(Number(options25.frameSpacing ?? 100))),
    (Rg.value = roundField2(Number(options25.frameOffsetX ?? 0))),
    (Hg.value = roundField2(Number(options25.frameOffsetY ?? 0))),
    (qg.value = options25.markerColor || "#f2a20d"),
    (Ug.value = roundField2(Number(options25.markerSize ?? 10))),
    (Gg.value = roundField2(Number(options25.markerLeft ?? 1.8))),
    (_g.value = roundField2(Number(options25.markerTop ?? 84))));
  const v382 = options25.markerVisible !== false;
  (setInspectorToggle2(jg, v382),
    (zd.value = roundField2(
      clampNumber2(((Number(options26.x || 0) + v380 / 2) / v378) * 100, 0, 100),
    )),
    (Vd.value = roundField2(
      clampNumber2(((Number(options26.y || 0) + v381 / 2) / v379) * 100, 0, 100),
    )),
    (rc.value = roundField2((v380 / v378) * 100)),
    (ac.value = roundField2((v381 / v379) * 100)),
    (Yr.value = roundField2(Number(arg365.style?.scale || 1) * 100)),
    (sc.value = roundField2(Number(options26.rotation || 0))));
  const v383 = B.size > 1;
  for (const v384 of [rc, ac]) v384.disabled = v383;
  ((sc.disabled = false), (Yr.disabled = false));
  const v385 = Pe(arg365).length,
    v386 = wC(arg365).length;
  ((cc.disabled = !v385 || !v386),
    (U1.textContent = v386 + " 项修改"),
    (cc.textContent = "一键应用到同类型控件"),
    In(arg365, q1));
}
function TL(arg366) {
  const options27 = arg366.properties || {},
    options28 = arg366.position || {},
    v387 = Number(g.document.canvas.width || 2778),
    v388 = Number(g.document.canvas.height || 1940),
    v389 = Number(options28.width || 100),
    v390 = Number(options28.height || 100);
  (Ra && Ra !== arg366.id && Za(),
    (Yg.value = options27.label || ""),
    (Xg.value = options27.title || "数量"),
    jt(arg366),
    setInspectorToggle2(Qg, options27.iconVisible !== false),
    setInspectorToggle2(nh, options27.titleVisible !== false),
    setInspectorToggle2(sh, options27.countVisible !== false),
    iL(options27.icon ?? "mdi:lightbulb-group-outline"),
    (Zg.value = options27.iconColor || "#8b9298"),
    (eh.value = options27.iconActiveColor || "#f2a20d"),
    (th.value = roundField2(Number(options27.iconSize ?? 42))),
    (oh.value = options27.titleColor || "#b9bbc0"),
    (ih.value = roundField2(Number(options27.titleSize ?? 32))),
    (rh.value = roundField2(normalizedFontWeight2(options27.titleWeight, 0.3))),
    (ah.value = roundField2(Number(options27.titleSpacing ?? 1.2))),
    (ch.value = options27.countColor || "#b9bbc0"),
    (lh.value = options27.countActiveColor || "#f2a20d"),
    (dh.value = roundField2(Number(options27.countSize ?? 34))),
    (uh.value = roundField2(normalizedFontWeight2(options27.countWeight, 0.35))),
    (ph.value = roundField2(Number(options27.countSpacing ?? 0))),
    (mh.value = roundField2(Number(options27.iconGap ?? 4.5))),
    (fh.value = roundField2(Number(options27.countGap ?? 4.5))),
    (jd.value = roundField2(
      clampNumber2(((Number(options28.x || 0) + v389 / 2) / v387) * 100, 0, 100),
    )),
    (qd.value = roundField2(
      clampNumber2(((Number(options28.y || 0) + v390 / 2) / v388) * 100, 0, 100),
    )),
    (dc.value = roundField2((v389 / v387) * 100)),
    (uc.value = roundField2((v390 / v388) * 100)),
    (ea.value = roundField2(Number(arg366.style?.scale || 1) * 100)),
    (pc.value = roundField2(Number(options28.rotation || 0))));
  const v391 = B.size > 1;
  ((dc.disabled = v391),
    (uc.disabled = v391),
    (ea.disabled = false),
    (pc.disabled = false),
    ts(ht, Ko >= 0 ? "选择替换实体" : "选择一个实体"),
    iw(arg366),
    Be.hidden || Bp(Xr.value),
    In(arg366, J1));
}
function AL(arg367) {
  const options29 = arg367.properties || {},
    v392 = arg367.type === "presence-sensor",
    sensorKind = ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
      options29.sensorKind,
    )
      ? options29.sensorKind
      : "presence",
    v393 = {
      presence: "人体/人在传感器",
      "door-window": "门窗传感器",
      "water-leak": "水浸传感器",
      smoke: "烟雾传感器",
      "natural-gas": "天然气传感器",
    }[sensorKind],
    v394 = arg367.type === "device-button" || v392,
    options30 = arg367.position || {},
    v395 = Number(g.document.canvas.width || 2778),
    v396 = Number(g.document.canvas.height || 1940),
    v397 = Number(options30.width || 100),
    v398 = Number(options30.height || 100);
  ((Z1.value = v392 ? v393 : v394 ? "设备按钮" : "图标按钮"),
    Q1.classList.remove("inspector-full-row"),
    (hh.hidden = !v392),
    hh.classList.toggle("inspector-full-row", v392),
    (ta.value = sensorKind),
    ne(ta),
    (Ih.textContent = v394 ? "标题" : "中文标题"),
    (lN.textContent = v394 ? "状态" : "英文标题"),
    (dN.textContent = v394 ? "自定义标题" : "内容"),
    (uN.textContent = v394 ? "自定义状态" : "内容"),
    (eu.placeholder = v394 ? "留空跟随实体名称" : ""),
    (tu.placeholder = v394 ? "留空跟随实体状态" : ""),
    (eN.hidden = v394),
    (CN.hidden = v392),
    (tb.hidden = true),
    (xN.hidden = !v392 || sensorKind !== "presence"),
    (NN.hidden = !v392 || sensorKind !== "door-window"));
  const v399 = Yc.has(arg367.id);
  (Gn.classList.toggle("active", v399),
    Gn.setAttribute("aria-pressed", String(v399)),
    (Gn.textContent = "编辑透视"),
    (vc.disabled = !v399),
    (Ih.closest(".inspector-section").hidden = v392));
  const closest6 = $t.closest(".inspector-section");
  closest6.querySelector("h3").textContent = v392 ? "显示颜色" : "图标";
  const closest7 = $t.closest(".inspector-picker");
  ((closest7.hidden = v392),
    (closest7.style.display = v392 ? "none" : ""),
    (hN.hidden = v394),
    (bN.hidden = v394),
    (yN.hidden = v394),
    (vN.hidden = v394),
    (wh.hidden = v392),
    (wh.firstChild.textContent = v394 ? "关闭颜色" : "颜色"),
    (Yd.hidden = !v394 || v392),
    (nu.hidden = !v394),
    (ou.hidden = !v394),
    (Ch.hidden = !v394),
    (Ch.firstChild.textContent = v392
      ? {
          presence: "有人颜色",
          "door-window": "打开颜色",
          "water-leak": "水浸颜色",
          smoke: "烟雾颜色",
          "natural-gas": "天然气颜色",
        }[sensorKind]
      : "开启颜色"),
    (tN.hidden = !v394 || v392),
    (nN.hidden = !v394 || v392),
    (oN.hidden = v394),
    (iN.hidden = !v394 || v392),
    (rN.hidden = !v394 || v392),
    (aN.hidden = !v394 || v392),
    (Qd.closest("label").hidden = v392),
    (Zd.closest("label").hidden = v392),
    (sN.hidden = v394),
    (cN.hidden = v394),
    (pN.hidden = v394),
    (mN.hidden = v394),
    (fN.hidden = v394),
    (gN.hidden = v394),
    (gh.value = options29.label || ""),
    jt(arg367),
    nL(options29.icon || ""),
    (Oi.value =
      options29.iconColor ||
      (v392 ? options29.clearColor : "") ||
      options29.iconOffColor ||
      options29.iconOnColor ||
      "#d7d8da"),
    setInspectorToggle2(Yd, options29.iconVisible !== false),
    (Xd.value =
      sensorKind === "water-leak"
        ? options29.waterLeakColor || "#42c8ff"
        : sensorKind === "smoke"
          ? options29.smokeColor || "#ffffff"
          : sensorKind === "natural-gas"
            ? options29.naturalGasColor || "#ffb347"
            : options29.iconOnColor || (v392 ? options29.occupiedColor : "") || "#379bff"),
    (Sh.value = options29.badgeColor || "#5b5e66"),
    (xh.value = roundField2(Number(options29.badgeOpacity ?? 0.58) * 100)),
    (Lh.value = roundField2(Number(options29.badgeSize ?? options29.iconSize ?? 28))),
    (Eh.value = roundField2(
      Number(options29.symbolSize ?? Number(options29.iconSize ?? 28) * 0.5),
    )),
    (fc.value = ["0", "1", "2", "3", "4"].includes(String(options29.statePrecision))
      ? String(options29.statePrecision)
      : "auto"),
    (ob.value = roundField2(Number(options29.haloScaleX ?? options29.haloScale ?? 1) * 100)),
    (ib.value = roundField2(Number(options29.haloScaleY ?? options29.haloScale ?? 1) * 100)),
    (rb.value = roundField2(Number(options29.haloRotation ?? 0))),
    (ab.value = roundField2(Number(options29.haloOpacity ?? 1) * 100)),
    (cb.value = roundField2(Number(options29.personScale ?? 1) * 100)),
    (lb.value = roundField2(Number(options29.personRotation ?? 0))),
    (db.value = roundField2(Number(options29.personOpacity ?? 1) * 100)),
    (ub.value = roundField2(Number(options29.orbitDuration ?? 8))),
    setInspectorToggle2(nb, options29.haloVisible !== false),
    setInspectorToggle2(sb, options29.personVisible !== false),
    (Nh.value = roundField2(Number(options29.iconSize ?? 42))),
    (Kd.value = roundField2(Number(options29.iconOffOpacity ?? 1) * 100)),
    (Jd.value = roundField2(Number(options29.iconOnOpacity ?? 1) * 100)),
    (Qd.value = roundField2(Number(options29.iconLeft ?? 50))),
    (Zd.value = roundField2(Number(options29.iconTop ?? 34))),
    (eu.value = options29.mainText || ""),
    setInspectorToggle2(nu, options29.mainTextVisible !== false),
    (tu.value = options29.secondaryText || ""),
    setInspectorToggle2(ou, options29.secondaryTextVisible !== false),
    (Th.value =
      options29.mainColor || options29.mainOffColor || options29.mainOnColor || "#c7c8cb"),
    (Ah.value =
      options29.secondaryColor ||
      options29.secondaryOffColor ||
      options29.secondaryOnColor ||
      "#75777d"),
    (iu.value = roundField2(Number(options29.mainOffOpacity ?? 1) * 100)),
    (ru.value = roundField2(Number(options29.mainOnOpacity ?? 1) * 100)),
    (au.value = roundField2(Number(options29.secondaryOffOpacity ?? 1) * 100)),
    (su.value = roundField2(Number(options29.secondaryOnOpacity ?? 1) * 100)),
    (Ph.value = roundField2(Number(options29.mainSize ?? 25))),
    (kh.value = roundField2(Number(options29.secondarySize ?? 10))),
    (Mh.value = roundField2(normalizedFontWeight2(options29.mainWeight, 0.25))),
    (Oh.value = roundField2(normalizedFontWeight2(options29.secondaryWeight, 0.18))),
    (Bh.value = roundField2(Number(options29.mainSpacing ?? 1))),
    ($h.value = roundField2(Number(options29.secondarySpacing ?? 0.7))),
    (Fh.value = roundField2(Number(options29.mainTextLeft ?? 9))),
    (Dh.value = roundField2(Number(options29.mainTextTop ?? 78))),
    (zh.value = roundField2(Number(options29.secondaryTextLeft ?? 9))),
    (Vh.value = roundField2(Number(options29.secondaryTextTop ?? 91))),
    setInspectorToggle2(cu, options29.onFillVisible !== false),
    (lu.value = options29.onFillColor || "#dfb64f"),
    (du.value = roundField2(Number(options29.onFillStrength ?? 1) * 100)),
    (Wh.value = roundField2(Number(options29.onFillFadeDuration ?? 0.3))),
    setInspectorToggle2(Rh, options29.frameVisible !== false),
    (Hh.value = roundField2(Number(options29.frameWidth ?? 1))),
    (jh.value = roundField2(Number(options29.frameAngle ?? 45))),
    (uu.value = roundField2(Number(options29.frameOffOpacity ?? 0.8) * 100)),
    (pu.value = roundField2(Number(options29.frameOnOpacity ?? 1) * 100)),
    (qh.value = roundField2(Number(options29.cutCorner ?? 20))),
    setInspectorToggle2(Uh, options29.softLightVisible !== false),
    (Gh.value = options29.softLightColor || "#ffffff"),
    (_h.value = roundField2(Number(options29.softLightStrength ?? 1) * 100)),
    (Yh.value = roundField2(Number(options29.softLightSize ?? 1) * 100)),
    (Xh.value = roundField2(Number(options29.softLightAngle ?? 45))),
    setInspectorToggle2(Kh, options29.glowVisible !== false),
    (Jh.value = options29.glowColor || "#ffffff"),
    (Qh.value = roundField2(Number(options29.glowStrength ?? 1) * 100)),
    (Zh.value = roundField2(Number(options29.glowSize ?? 1) * 100)),
    (eb.value = roundField2(Number(options29.glowAngle ?? 220))),
    (mu.value = roundField2(
      clampNumber2(((Number(options30.x || 0) + v397 / 2) / v395) * 100, 0, 100),
    )),
    (fu.value = roundField2(
      clampNumber2(((Number(options30.y || 0) + v398 / 2) / v396) * 100, 0, 100),
    )),
    (gc.value = roundField2((v397 / v395) * 100)),
    (hc.value = roundField2((v398 / v396) * 100)),
    (ra.value = roundField2(Number(arg367.style?.scale || 1) * 100)),
    (bc.value = roundField2(Number(options30.rotation || 0))),
    v392 &&
      !eo.has(arg367.id) &&
      (eo.set(arg367.id, "on"), x?.setComponentPreviewState(arg367.id, "on")));
  const text26 = eo.get(arg367.id) || "auto";
  for (const element136 of mc.querySelectorAll("[data-icon-button-preview]")) {
    const v400 = element136.dataset.iconButtonPreview === text26;
    (element136.classList.toggle("active", v400),
      element136.setAttribute("aria-pressed", String(v400)));
  }
  const v401 = B.size > 1;
  for (const v402 of [gc, hc]) v402.disabled = v401;
  ((bc.disabled = false), (ra.disabled = false));
  const v403 = Pe(arg367).length,
    v404 = EC(arg367).length;
  ((yc.disabled = !v403 || !v404),
    (SN.textContent = v404 + " 项修改"),
    (yc.textContent = "一键应用到同类型控件"),
    In(arg367, wN));
}
function PL(arg368) {
  const options31 = arg368.properties || {},
    options32 = arg368.position || {},
    v405 = Number(g.document.canvas.width || 2778),
    v406 = Number(g.document.canvas.height || 1940),
    v407 = Number(options32.width || 100),
    v408 = Number(options32.height || 100);
  ((sy.value = options31.label || ""),
    jt(arg368),
    setInspectorToggle2(dy, options31.mediaVisible !== false));
  const text27 = options31.displayMode === "snapshot" ? "snapshot" : "live";
  for (const element137 of ly.querySelectorAll("[data-camera-display-mode]")) {
    const v409 = element137.dataset.cameraDisplayMode === text27;
    (element137.classList.toggle("active", v409),
      element137.setAttribute("aria-pressed", String(v409)));
  }
  const v410 = Number(options31.refreshInterval),
    max32 = Number.isFinite(v410) ? Math.max(6, Math.round(v410)) : 10;
  ((da.value = String(max32)),
    (DN.hidden = text27 !== "snapshot"),
    (da.disabled = text27 !== "snapshot"));
  const text28 = options31.fit === "contain" ? "contain" : "fill";
  for (const element138 of cy.querySelectorAll("[data-camera-fit]")) {
    const v411 = element138.dataset.cameraFit === text28;
    (element138.classList.toggle("active", v411),
      element138.setAttribute("aria-pressed", String(v411)));
  }
  (setInspectorToggle2(uy, options31.frameVisible !== false),
    (py.value = options31.frameColor || "#d4d4d4"),
    (my.value = roundField2(Number(options31.frameWidth ?? 1))));
  const v412 = Number(options31.radius ?? 0.04);
  ((fy.value = roundField2(clampNumber2(v412 > 0.5 ? v412 : v412 * 100, 0, 50))),
    (gy.value = roundField2(Number(options31.frameAngle ?? 45))),
    (hy.value = roundField2(Number(options31.frameOpacity ?? 0.9) * 100)),
    (Iu.value = roundField2(
      clampNumber2(((Number(options32.x || 0) + v407 / 2) / v405) * 100, 0, 100),
    )),
    (Tu.value = roundField2(
      clampNumber2(((Number(options32.y || 0) + v408 / 2) / v406) * 100, 0, 100),
    )),
    (Pc.value = roundField2((v407 / v405) * 100)),
    (kc.value = roundField2((v408 / v406) * 100)),
    (ua.value = roundField2(Number(arg368.style?.scale || 1) * 100)),
    (Mc.value = roundField2(Number(options32.rotation || 0))));
  const v413 = B.size > 1;
  ((Pc.disabled = v413), (kc.disabled = v413), (Mc.disabled = false), (ua.disabled = false));
  const v414 = Pe(arg368).length,
    v415 = TC(arg368).length;
  ((Oc.disabled = !v414 || !v415),
    (VN.textContent = v415 + " 项修改"),
    (Oc.textContent = "一键应用到同类型控件"));
  const options33 = Object.prototype.hasOwnProperty.call(arg368.actions || {}, "tap")
    ? arg368
    : {
        ...arg368,
        actions: {
          tap: {
            type: "more-info",
            data: {
              popupSource: "current",
            },
          },
          ...(arg368.actions || {}),
        },
      };
  In(options33, zN);
}
function kL(arg369) {
  const options34 = arg369.properties || {},
    options35 = arg369.position || {},
    v416 = Number(g.document.canvas.width || 2778),
    v417 = Number(g.document.canvas.height || 1940),
    v418 = Number(options35.width || 100),
    v419 = Number(options35.height || 100);
  pb.value = options34.label || "";
  const deviceType2 = ["air-conditioner", "bath-heater"].includes(options34.deviceType)
    ? options34.deviceType
    : "auto";
  for (const element139 of mb.querySelectorAll("[data-air-conditioner-device-type]")) {
    const v420 = element139.dataset.airConditionerDeviceType === deviceType2;
    (element139.classList.toggle("active", v420),
      element139.setAttribute("aria-pressed", String(v420)));
  }
  ((Cu.textContent = deviceType2 === "bath-heater" ? "预览浴霸详情" : "预览空调 / 浴霸详情"),
    jt(arg369),
    (Cu.disabled = !arg369.bindings?.entity?.entityId),
    (yb.value = options34.iconOffColor || "#9aa5ad"),
    (vb.value = options34.iconOnColor || "#73c8ff"),
    (wb.value = options34.badgeColor || "#5b5e66"),
    (Cb.value = roundField2(Number(options34.badgeOpacity ?? 0.58) * 100)),
    (Sb.value = roundField2(Number(options34.symbolSize ?? 14))),
    (xb.value = roundField2(Number(options34.badgeSize ?? 28))),
    (Nb.value = roundField2(Number(options34.iconLeft ?? 20))),
    (Eb.value = roundField2(Number(options34.iconTop ?? 50))),
    setInspectorToggle2(bb, options34.iconVisible !== false),
    (Ib.value = options34.mainText || ""),
    (Tb.value = options34.mainColor || "#c7c8cb"),
    (Ab.value = roundField2(Number(options34.mainSize ?? 21))),
    (Pb.value = roundField2(normalizedFontWeight2(options34.mainWeight, 0.24))),
    (kb.value = roundField2(Number(options34.mainSpacing ?? 0.5))),
    (Mb.value = roundField2(Number(options34.mainTextLeft ?? 39))),
    (Ob.value = roundField2(Number(options34.mainTextTop ?? 40))),
    setInspectorToggle2(Lb, options34.mainTextVisible !== false),
    ($b.value = options34.secondaryText || ""),
    (Fb.value = options34.secondaryColor || "#75777d"),
    (Db.value = roundField2(Number(options34.secondarySize ?? 12))),
    (zb.value = roundField2(normalizedFontWeight2(options34.secondaryWeight, 0.12))),
    (Vb.value = roundField2(Number(options34.secondarySpacing ?? 0.3))),
    (Wb.value = roundField2(Number(options34.secondaryTextLeft ?? 39))),
    (Rb.value = roundField2(Number(options34.secondaryTextTop ?? 67))),
    setInspectorToggle2(Bb, options34.secondaryTextVisible !== false),
    setInspectorToggle2(Hb, options34.airflowVisible !== false));
  const text29 = options34.airflowMotion === "static" ? "static" : "dynamic";
  for (const element140 of jb.querySelectorAll("[data-airflow-motion]")) {
    const v421 = element140.dataset.airflowMotion === text29;
    (element140.classList.toggle("active", v421),
      element140.setAttribute("aria-pressed", String(v421)));
  }
  ((qb.value = options34.airflowCoolColor || "#73c8ff"),
    (Ub.value = options34.airflowHeatColor || "#ff8a65"),
    (Gb.value = options34.airflowOtherColor || "#dce2e6"),
    (_b.value = roundField2(Number(options34.airflowAngle ?? 7))),
    (Yb.value = roundField2(Number(options34.airflowCurve ?? 20))),
    (Xb.value = roundField2(Number(options34.airflowLength ?? 200))),
    (Kb.value = roundField2(Number(options34.airflowFadePosition ?? 50))),
    (Jb.value = roundField2(Number(options34.airflowSpread ?? 100))),
    (Qb.value = roundField2(Number(options34.airflowDensity ?? 60))),
    (Zb.value = roundField2(Number(options34.airflowIrregularity ?? 50))),
    (ey.value = roundField2(Number(options34.airflowThickness ?? 40))),
    (ty.value = roundField2(Number(options34.airflowStrength ?? 200))),
    (ny.value = roundField2(Number(options34.airflowBlur ?? 6))),
    (hu.value = roundField2(Number(options34.airflowSpeed ?? 1))),
    (hu.disabled = text29 === "static"));
  const v422 = airflowCanvasOffsetBounds2(arg369, g.document.canvas);
  ((aa.min = String(roundField2(v422.minX))),
    (aa.max = String(roundField2(v422.maxX))),
    (sa.min = String(roundField2(v422.minY))),
    (sa.max = String(roundField2(v422.maxY))),
    (aa.value = roundField2(Number(options34.airflowOffsetX ?? -75))),
    (sa.value = roundField2(Number(options34.airflowOffsetY ?? 34))),
    (oy.value = roundField2(Number(options34.airflowWidth ?? 64))),
    (iy.value = roundField2(Number(options34.airflowHeight ?? 125))),
    (bu.value = roundField2(Number(options34.airflowScale ?? 1) * 100)),
    (yu.value = roundField2(Number(options34.airflowRotation ?? -3))),
    (vu.value = roundField2(
      clampNumber2(((Number(options35.x || 0) + v418 / 2) / v416) * 100, 0, 100),
    )),
    (wu.value = roundField2(
      clampNumber2(((Number(options35.y || 0) + v419 / 2) / v417) * 100, 0, 100),
    )),
    (Sc.value = roundField2((v418 / v416) * 100)),
    (xc.value = roundField2((v419 / v417) * 100)),
    (ca.value = roundField2(Number(arg369.style?.scale || 1) * 100)),
    (Nc.value = roundField2(Number(options35.rotation || 0))));
  const text30 = vp.get(arg369.id) === "airflow" ? "airflow" : "button";
  if (!Qo.has(arg369.id)) {
    const text31 = text30 === "airflow" ? "on" : "off";
    (Qo.set(arg369.id, text31), x?.setComponentPreviewState(arg369.id, text31));
  }
  const text32 = Qo.get(arg369.id) || "auto";
  for (const element141 of fb.querySelectorAll("[data-air-conditioner-preview]")) {
    const v423 = element141.dataset.airConditionerPreview === text32;
    (element141.classList.toggle("active", v423),
      element141.setAttribute("aria-pressed", String(v423)));
  }
  x?.setComponentSelectionLayer(arg369.id, text30);
  for (const element142 of gb.querySelectorAll("[data-air-conditioner-layer]")) {
    const v424 = element142.dataset.airConditionerLayer === text30;
    (element142.classList.toggle("active", v424),
      element142.setAttribute("aria-pressed", String(v424)));
  }
  const v425 = text30 === "airflow";
  ((TN.hidden = v425), (AN.hidden = v425), (PN.hidden = v425), (hb.hidden = !v425));
  const v426 = B.size > 1;
  for (const v427 of [Sc, xc]) v427.disabled = v426;
  ((Nc.disabled = false), (ca.disabled = false));
  const v428 = Pe(arg369).length,
    v429 = SC(arg369).length;
  ((Su.disabled = !v428 || !v429), (MN.textContent = v429 + " 项修改"), In(arg369, kN));
}
function ML(arg370) {
  const options36 = arg370.properties || {},
    options37 = arg370.position || {},
    v430 = Number(g.document.canvas.width || 2778),
    v431 = Number(g.document.canvas.height || 1940),
    v432 = Number(options37.width || 100),
    v433 = Number(options37.height || 100);
  ((ry.value = options36.label || ""),
    jt(arg370),
    (ay.value = roundField2(Number(options36.opacity ?? 0.5) * 100)),
    (Nu.value = roundField2(
      clampNumber2(((Number(options37.x || 0) + v432 / 2) / v430) * 100, 0, 100),
    )),
    (Eu.value = roundField2(
      clampNumber2(((Number(options37.y || 0) + v433 / 2) / v431) * 100, 0, 100),
    )),
    (la.value = roundField2(Number(arg370.style?.scale || 1) * 100)),
    (Ic.value = roundField2(Number(options37.rotation || 0))),
    (Ic.disabled = false),
    (la.disabled = false));
}
function OL(arg371) {
  const v434 = [Sr, Li, tc, Pi, Ec, Tc, wc, pa, ga, ya, Ca, Na, Wo]
    .find((arg372) => arg372 && !arg372.hidden)
    ?.querySelector(":scope > .inspector-section");
  v434 && v434.nextElementSibling !== _d && v434.insertAdjacentElement("afterend", _d);
  const options38 = arg371.properties || {},
    coverKind = ["standard", "dream", "airer"].includes(options38.coverKind)
      ? options38.coverKind
      : "auto";
  for (const element143 of bh.querySelectorAll("[data-cover-kind]")) {
    const v435 = element143.dataset.coverKind === coverKind;
    (element143.classList.toggle("active", v435),
      element143.setAttribute("aria-pressed", String(v435)));
  }
  const coverDirection = ["left", "right"].includes(options38.coverDirection)
    ? options38.coverDirection
    : "split";
  for (const element144 of yh.querySelectorAll("[data-cover-direction]")) {
    const v436 = element144.dataset.coverDirection === coverDirection;
    (element144.classList.toggle("active", v436),
      element144.setAttribute("aria-pressed", String(v436)));
  }
  const coverMotorDirection = ["normal", "reversed"].includes(options38.coverMotorDirection)
    ? options38.coverMotorDirection
    : "auto";
  for (const element145 of vh.querySelectorAll("[data-cover-motor-direction]")) {
    const v437 = element145.dataset.coverMotorDirection === coverMotorDirection;
    (element145.classList.toggle("active", v437),
      element145.setAttribute("aria-pressed", String(v437)));
  }
}
const us = new Map();
let Aw;
function im(arg373) {
  const v438 = normalizeFlowLine2(arg373?.properties);
  return [...(us.get(arg373?.id) || [])]
    .filter(([v439, v440]) => JSON.stringify(v438[v439]) !== JSON.stringify(v440))
    .map(([v441]) => v441);
}
function J() {
  window.requestAnimationFrame(xE);
  const f5 = F(),
    v442 = f5?.type === "flow-line";
  renderFlowLineInspector2(To, f5, {
    document: g?.document,
    entities: K,
    pickEntity: (arg374, arg375, arg376) => mT(arg374, f5.id, arg375, arg376),
    multipleSelected: B.size > 1,
    styleChangeCount: v442 ? im(f5).length : 0,
    hasStyleChanges: v442 && im(f5).length > 0 && Pe(f5).length > 0,
    enhanceControls: (arg377) => {
      (Ga(arg377), _a(arg377), Ya(arg377));
      for (const v443 of arg377.querySelectorAll("select")) v443.tabIndex = -1;
    },
    syncControls: (arg378) => {
      for (const v444 of arg378.querySelectorAll("select")) ne(v444);
    },
    onError: $,
    onApplyStyle: _I,
    pathEditorContext: () => (
      Le !== "edit" && yt("edit"),
      {
        canvas: x?.canvas,
        host: x?.componentHosts.get(f5.id),
        container: xo,
        states: x?.states,
        enhancePathSelect: SE,
        onLayoutChange: () => {
          (tl(), x?.resize());
        },
        lockTargets: [
          Pt,
          vf.closest("aside"),
          To,
          document.querySelector(".workspace-heading"),
          document.querySelector("body > header"),
        ],
      }
    ),
    onPreview: (arg379, arg380) => {
      (arg380.properties && x?.previewComponentProperties(arg379, arg380.properties),
        (arg380.position || arg380.style?.scale) &&
          x?.previewComponentTransform(arg379, {
            ...arg380.position,
            ...(arg380.style?.scale
              ? {
                  scale: arg380.style.scale,
                }
              : {}),
          }));
    },
    onChange: (arg381, arg382) =>
      E(
        (arg383) => {
          const v445 = findComponent2(arg383, arg381)?.component;
          if (!v445 || v445.type !== "flow-line") throw new Error("流水线条控件已不存在。");
          const v446 = normalizeFlowLine2(v445.properties);
          let map22 = us.get(arg381);
          map22 || ((map22 = new Map()), us.set(arg381, map22));
          for (const v447 of Object.keys(arg382.properties || {}))
            Object.hasOwn(FLOW_LINE_FIELDS2, v447) &&
              !map22.has(v447) &&
              map22.set(v447, v446[v447]);
          const v448 = arg382.position?.rotation;
          for (const [v449, v450] of Object.entries(arg382)) {
            const options39 = {
              ...v450,
            };
            (v449 === "position" && Number.isFinite(v448) && delete options39.rotation,
              (v445[v449] = {
                ...v445[v449],
                ...options39,
              }));
          }
          Number.isFinite(v448) && Lt(arg383, arg381, v448);
        },
        W.value,
        {
          throwOnError: true,
        },
      ),
  });
  const v451 = f5?.type === "image",
    v452 = f5?.type === "interaction3d";
  renderInteraction3dInspector2(To, f5, {
    document: g?.document,
    entities: K,
    states: x?.states,
    pickers: fL,
    enhanceControls: (arg384) => {
      (Ga(arg384), _a(arg384), Ya(arg384));
    },
    prepareCanvas: () => {
      const v453 = findComponent2(g?.document, f5.id);
      if (!v453) throw new Error("3D 控件已不存在。");
      const v454 = v453.page?.path || W.value,
        v455 = Le !== "edit" || x?.page?.path !== v454;
      ((W.value = v454), ne(W), v455 && yt("edit"), Xe(), Ka());
    },
    onError: $,
    onChange: (arg385, { replaceProperties: v456 = false } = {}) =>
      E(
        (arg386) => {
          const v457 = findComponent2(arg386, f5.id)?.component;
          if (!v457 || v457.type !== "interaction3d") throw new Error("3D 控件已不存在。");
          for (const [v458, v459] of Object.entries(arg385))
            v457[v458] =
              v458 === "properties" && v456
                ? v459
                : {
                    ...v457[v458],
                    ...v459,
                  };
        },
        W.value,
        {
          throwOnError: true,
        },
      ),
  });
  const v460 = f5?.type === "floorplan-auto-diagram",
    v461 = f5?.type === "icon-button-effect",
    v462 = f5?.type === "title-button",
    v463 = f5?.type === "light-statistics",
    includes5 = ["icon-button", "device-button", "presence-sensor"].includes(f5?.type),
    v464 = f5?.type === "vacuum-map",
    v465 = f5?.type === "camera",
    v466 = f5?.type === "air-conditioner",
    v467 = f5?.type === "time",
    v468 = f5?.type === "date",
    v469 = f5?.type === "weather",
    v470 = f5?.type === "line-chart",
    v471 = f5?.type === "percentage-bar";
  renderPercentageBarInspector2(To, f5, fT(f5));
  const v472 = f5?.type === "panel-frame",
    re2 = Re(f5),
    v473 = f5?.type === "group";
  for (const v474 of [..._i.keys()])
    (re2 && v474 === f5.id) || (_i.delete(v474), x?.setComponentPreviewState(v474, "auto"));
  for (const v475 of [...En.keys()])
    (v461 && v475 === f5.id) || (En.delete(v475), x?.setComponentPreviewState(v475, "auto"));
  for (const v476 of [...eo.keys()])
    (includes5 && v476 === f5.id) || (eo.delete(v476), x?.setComponentPreviewState(v476, "auto"));
  for (const v477 of [...Qo.keys()])
    (v466 && v477 === f5.id) || (Qo.delete(v477), x?.setComponentPreviewState(v477, "auto"));
  const v478 =
    v471 ||
    v442 ||
    v452 ||
    v473 ||
    v451 ||
    v460 ||
    v461 ||
    v462 ||
    v463 ||
    includes5 ||
    v464 ||
    v465 ||
    v466 ||
    v467 ||
    v468 ||
    v469 ||
    v470 ||
    v472 ||
    re2;
  ((ud.hidden = v478),
    v473 &&
      (ud.querySelector("p").textContent =
        "组合支持整体移动、复制、旋转和缩放；双击组合可进入组内编辑。"),
    (Sr.hidden = !v451),
    (vd.hidden = !v460),
    (Li.hidden = !v461),
    (tc.hidden = !v462),
    (Wd.hidden = !v463),
    (Pi.hidden = !includes5),
    (Ec.hidden = !v464),
    (Tc.hidden = !v465),
    (wc.hidden = !v466),
    (pa.hidden = !v467),
    (ga.hidden = !v468),
    (ya.hidden = !v469),
    (Ca.hidden = !v470),
    (Na.hidden = !v472),
    (Wo.hidden = !re2));
  const startsWith = String(f5?.bindings?.entity?.entityId || "").startsWith("cover.");
  if (((_d.hidden = !v478 || !startsWith), !v478)) {
    (q(),
      (ud.querySelector("p").textContent = f5
        ? "“" + componentLabel2(f5) + "”的专属属性尚未实现。"
        : "选择一个控件开始编辑。"));
    return;
  }
  if ((startsWith && OL(f5), v460)) {
    const options40 = f5.properties || {},
      options41 = f5.position || {},
      v479 = Number(g.document.canvas.width || 2778),
      v480 = Number(g.document.canvas.height || 1940),
      v481 = Number(options41.width || 100),
      v482 = Number(options41.height || 100),
      num27 = Array.isArray(options40.lightLayers) ? options40.lightLayers.length : 0,
      v483 =
        options40.previewReady === true &&
        (options40.generated !== true || options40.previewing === true);
    ((Hn.textContent = options40.generating
      ? "正在后台生成底图和灯组效果，请稍候…"
      : options40.generated && num27
        ? "已生成导图，包含 " + num27 + " 个灯组。"
        : v483
          ? "3D画面已置入仪表盘，请先确定位置、大小和视角。"
          : "尚未载入3D画面。"),
      (Ir.hidden = !v483));
    const v484 = options40.interactionMode === "view";
    (Ir.classList.toggle("active", v484),
      Ir.setAttribute("aria-pressed", String(v484)),
      (Ir.textContent = v484 ? "完成3D视角调整" : "调整3D视角"),
      (wd.value = options40.label || options40.instanceName || ""),
      (Tr.value = options40.exportFolder || ""));
    const text33 = options40.layoutMode === "fill" ? "fill" : "free";
    for (const element146 of qf.querySelectorAll("[data-floorplan-layout]")) {
      const v485 = element146.dataset.floorplanLayout === text33;
      (element146.classList.toggle("active", v485),
        element146.setAttribute("aria-pressed", String(v485)));
    }
    ((Ar.value = roundField2(
      clampNumber2(((Number(options41.x || 0) + v481 / 2) / v479) * 100, 0, 100),
    )),
      (Pr.value = roundField2(
        clampNumber2(((Number(options41.y || 0) + v482 / 2) / v480) * 100, 0, 100),
      )),
      (kr.value = roundField2((v481 / v479) * 100)),
      (Mr.value = roundField2((v482 / v480) * 100)),
      (Or.value = roundField2(Number(f5.style?.scale || 1) * 100)),
      (Br.value = roundField2(Number(options41.rotation || 0))));
    const v486 = yp.get(f5.id),
      floors = Array.isArray(v486?.floors) ? v486.floors : [],
      v487 = String(options40.floorSelection || "") || String(v486?.selected || "");
    if (floors.length) {
      const map23 = floors.map((arg387) =>
        Object.assign(document.createElement("option"), {
          value: arg387.id,
          textContent: arg387.name,
        }),
      );
      (floors.length > 1 &&
        map23.unshift(
          Object.assign(document.createElement("option"), {
            value: "all",
            textContent: "全楼",
          }),
        ),
        gn.replaceChildren(...map23),
        (gn.value = map23.some((arg388) => arg388.value === v487) ? v487 : map23[0].value));
    } else
      gn.replaceChildren(
        Object.assign(document.createElement("option"), {
          value: "",
          textContent: v483 ? "正在读取楼层…" : "载入3D画面后选择",
        }),
      );
    gn.disabled = !v483 || floors.length === 0 || options40.generating === true;
    const text34 = options40.cameraView === "top" ? "top" : "free",
      text35 = options40.cameraMode === "perspective" ? "perspective" : "orthographic";
    for (const element147 of Uf.querySelectorAll("[data-floorplan-camera-view]")) {
      const v488 = element147.dataset.floorplanCameraView === text34;
      (element147.classList.toggle("active", v488),
        element147.setAttribute("aria-pressed", String(v488)));
    }
    for (const element148 of Gf.querySelectorAll("[data-floorplan-camera-mode]")) {
      const v489 = element148.dataset.floorplanCameraMode === text35;
      (element148.classList.toggle("active", v489),
        element148.setAttribute("aria-pressed", String(v489)));
    }
    (($r.value = roundField2(clampNumber2(Number(options40.cameraFocalLength || 50), 18, 120))),
      ($r.disabled = text35 !== "perspective" || !v483),
      (_f.disabled = text34 !== "top" || !v483),
      (Yf.disabled = !v483));
    for (const v490 of [Ar, Pr, kr, Mr, Or, Br]) v490.disabled = text33 === "fill";
    ((Mt.disabled = options40.generating === true),
      (Mt.textContent =
        options40.generated && !options40.previewing
          ? "重新调整位置和视角"
          : options40.generating
            ? "正在后台生成…"
            : v483
              ? "确定位置大小并后台生成"
              : "载入3D画面"),
      (C1.hidden = num27 === 0));
    const filter20 = K.filter((arg389) => be(arg389) === "light"),
      map24 = (options40.lightLayers || []).map((arg390) => {
        const element149 = document.createElement("label");
        element149.textContent = arg390.note || arg390.name || "灯组";
        const element150 = document.createElement("select");
        element150.dataset.floorplanLightGroupId = arg390.id;
        const text36 = f5.bindings?.["lightGroup:" + arg390.id]?.entityId || "",
          element151 = document.createElement("option");
        ((element151.value = ""),
          (element151.textContent = "选择实体"),
          element150.append(element151));
        for (const v491 of filter20) {
          const element152 = document.createElement("option");
          ((element152.value = v491.entityId),
            (element152.textContent = rt(v491)),
            element150.append(element152));
        }
        if (text36 && !filter20.some((arg391) => arg391.entityId === text36)) {
          const element153 = document.createElement("option");
          ((element153.value = text36),
            (element153.textContent = text36),
            element150.append(element153));
        }
        return ((element150.value = text36), element149.append(element150), element149);
      });
    Xf.replaceChildren(...map24);
    return;
  }
  if (v461) {
    const value7 = Qs.hidden
      ? tt.hidden
        ? Bt.hidden
          ? null
          : "ibe-icon"
        : "ibe-asset"
      : "ibe-entity";
    q(value7);
    const options42 = f5.properties || {},
      options43 = f5.position || {},
      v492 = Number(g.document.canvas.width || 2778),
      v493 = Number(g.document.canvas.height || 1940),
      v494 = Number(options43.width || 100),
      v495 = Number(options43.height || 100);
    ((Jf.value = options42.label || ""),
      setInspectorToggle2(Zf, options42.buttonVisible !== false),
      setInspectorToggle2(eg, options42.effectVisible !== false),
      (Nd.checked = options42.effectColorTemperatureRealtime !== false),
      (Ed.checked = options42.effectBrightnessRealtime !== false));
    for (const element154 of [Nd, Ed])
      ((element154.disabled = false),
        (element154.title = ""),
        element154.closest(".check-row")?.classList.remove("is-disabled"));
    (jt(f5),
      wL(f5),
      tL(options42.icon || ""),
      (Id.value = options42.iconOffColor || "#9aa5ad"),
      (Td.value = options42.iconOnColor || "#ffffff"),
      (tg.value = roundField2(Number(options42.iconSize ?? 44))),
      (Ad.value = options42.buttonOffColor || "#17242d"),
      (Pd.value = options42.buttonOnColor || "#1f91b8"),
      (ng.value = roundField2(Number(options42.buttonOpacity ?? 0.92) * 100)),
      (og.value = options42.frameColor || "#dcebf2"),
      (ig.value = roundField2(Number(options42.frameWidth ?? 1.5))),
      (rg.value = roundField2(Number(options42.frameOpacity ?? 0.72) * 100)),
      (ag.value = roundField2(Number(options42.radius ?? 50))),
      (sg.value = options42.glowColor || "#43c8f0"),
      (kd.value = roundField2(Number(options42.glowOffStrength ?? 0) * 100)),
      (Md.value = roundField2(Number(options42.glowOnStrength ?? 1) * 100)),
      (lg.value = roundField2(Number(options42.effectOpacity ?? 1) * 100)),
      (dg.value = roundField2(Number(options42.effectFadeDuration ?? 0.52))),
      (Od.value = roundField2(Number(options42.effectLeft ?? 50))),
      (Bd.value = roundField2(Number(options42.effectTop ?? 50))),
      ($d.value = roundField2(Number(options42.effectScale ?? 1) * 100)),
      (Fd.value = roundField2(Number(options42.effectRotation ?? 0))),
      (jr.value = roundField2(
        clampNumber2(((Number(options43.x || 0) + v494 / 2) / v492) * 100, 0, 100),
      )),
      (qr.value = roundField2(
        clampNumber2(((Number(options43.y || 0) + v495 / 2) / v493) * 100, 0, 100),
      )),
      (Ii.value = roundField2((v494 / v492) * 100)),
      (Ti.value = roundField2((v495 / v493) * 100)),
      (Bo.value = roundField2(Number(f5.style?.scale || 1) * 100)),
      (Ai.value = roundField2(Number(options43.rotation || 0))));
    const v496 = B.size > 1;
    ((Ii.disabled = v496), (Ti.disabled = v496), (Bo.disabled = false), (Ai.disabled = false));
    const text37 = options42.effectLayoutMode === "fill" ? "fill" : "free";
    for (const element155 of ug.querySelectorAll("[data-ibe-layout]")) {
      const v497 = element155.dataset.ibeLayout === text37;
      (element155.classList.toggle("active", v497),
        element155.setAttribute("aria-pressed", String(v497)));
    }
    for (const v498 of [Od, Bd, $d, Fd]) v498.disabled = text37 === "fill";
    const bL2 = bL(options42);
    D1.textContent = bL2
      ? "原始尺寸：" +
        roundField2(bL2.width) +
        " × " +
        roundField2(bL2.height) +
        "；仅支持等比缩放。"
      : "效果图片将按原始尺寸等比缩放。";
    const v499 = iconButtonEffectInspectorLayer2(f5, M0.get(f5.id));
    (x?.setComponentSelectionLayer(f5.id, v499),
      En.has(f5.id) || (En.set(f5.id, "on"), x?.setComponentPreviewState(f5.id, "on")));
    const text38 = En.get(f5.id) || "auto";
    for (const element156 of Ld.querySelectorAll("[data-ibe-preview]")) {
      const v500 = element156.dataset.ibePreview === text38;
      (element156.classList.toggle("active", v500),
        element156.setAttribute("aria-pressed", String(v500)));
    }
    for (const element157 of Qf.querySelectorAll("[data-ibe-layer]")) {
      const v501 = element157.dataset.ibeLayer === v499;
      (element157.classList.toggle("active", v501),
        element157.setAttribute("aria-pressed", String(v501)));
    }
    const v502 = v499 === "effect";
    ((k1.hidden = v502), (O1.hidden = v502), (B1.hidden = v502), (M1.hidden = !v502));
    const v503 = Pe(f5).length,
      v504 = NC(f5).length;
    ((ec.disabled = !v503 || !v504),
      (R1.textContent = v504 + " 项修改"),
      (ec.textContent = "一键应用到同类型控件"),
      In(f5, W1));
    return;
  }
  if (v466) {
    (q(Cc.hidden ? null : "air-conditioner-entity"), kL(f5));
    return;
  }
  if (v462) {
    const value8 = nc.hidden ? (nt.hidden ? null : "title-button-icon") : "title-button-entity";
    (q(value8), IL(f5));
    return;
  }
  if (v463) {
    const value9 = Be.hidden
      ? lc.hidden
        ? ot.hidden
          ? null
          : "light-statistics-icon"
        : "light-statistics-action-entity"
      : "light-statistics-entity";
    (q(value9), TL(f5));
    return;
  }
  if (includes5) {
    const value10 = Mi.hidden ? (Ft.hidden ? null : "icon-button-icon") : "icon-button-entity";
    (q(value10), AL(f5));
    return;
  }
  if (v465) {
    (q(Ac.hidden ? null : "camera-entity"), PL(f5));
    return;
  }
  if (v464) {
    (q(Lc.hidden ? null : "vacuum-map-entity"), ML(f5));
    return;
  }
  if (re2) {
    (q(Dt.hidden ? null : "navigation-icon"), LL(f5));
    return;
  }
  if (v467) {
    (q(), CL(f5));
    return;
  }
  if (v468) {
    (q(), SL(f5));
    return;
  }
  if (v469) {
    (q(), xL(f5));
    return;
  }
  if (v471) {
    q();
    return;
  }
  if (v470) {
    (q(), NL(f5));
    return;
  }
  if (v472) {
    (q(), EL(f5));
    return;
  }
  const options44 = f5.properties || {},
    options45 = f5.position || {},
    v505 = Number(g.document.canvas.width || 2778),
    v506 = Number(g.document.canvas.height || 1940),
    v507 = Number(options45.width || 100),
    v508 = Number(options45.height || 100);
  ((b1.value = "图片"),
    (Js.value = options44.label || ""),
    jt(f5),
    vL(f5),
    (Lr.value = roundField2(Number(options44.opacity ?? 1) * 100)),
    (Po.value = roundField2(
      clampNumber2(((Number(options45.x || 0) + v507 / 2) / v505) * 100, 0, 100),
    )),
    (ko.value = roundField2(
      clampNumber2(((Number(options45.y || 0) + v508 / 2) / v506) * 100, 0, 100),
    )),
    (Rn.value = roundField2(clampNumber2(Number(f5.style?.scale || 1) * 100, 1, 500))),
    (Mo.value = roundField2(Number(options45.rotation || 0))));
  const text39 = options44.layoutMode === "fill" ? "fill" : "free";
  for (const element158 of jf.querySelectorAll("[data-image-layout]")) {
    const v509 = element158.dataset.imageLayout === text39;
    (element158.classList.toggle("active", v509),
      element158.setAttribute("aria-pressed", String(v509)));
  }
  const v510 = text39 === "fill",
    v511 = B.size > 1;
  ((Po.disabled = v510),
    (ko.disabled = v510),
    (Rn.disabled = v510),
    (Mo.disabled = v510),
    In(f5, E1));
}
async function Tn({ refreshInspector: v512 = true } = {}) {
  const [all, all2] = await Promise.all([
    _("/assets/builtin?_=" + Date.now()),
    _("/assets/user?_=" + Date.now()),
  ]);
  ((Xn = all.items || []),
    (Nt = all2.items || []),
    (m0 = (all.catalogVersion || "") + ":" + (all2.catalogVersion || "")));
  const v513 = setBuiltinAssetVersions2(ww());
  return (v513 && (x?.renderComponents(true), it?.renderComponents(true)), v512 && J(), v513);
}
async function Pw() {
  const _5 = await _("/assets/version"),
    v514 = (_5.builtin || "") + ":" + (_5.user || "");
  m0 !== v514 &&
    (await Tn({
      refreshInspector: true,
    }));
}
async function lo({ afterCurrent: v515 = false } = {}) {
  return Jn
    ? v515
      ? (await Jn, lo())
      : Jn
    : ((Jn = (async () => {
        const list26 = [];
        let num28 = 0,
          num29 = 0;
        do {
          const _6 = await _("/ha/entities?limit=500&offset=" + num28);
          (list26.push(...(_6.items || [])),
            (num29 = Number(_6.total || 0)),
            (num28 += Number(_6.limit || 500)));
        } while (list26.length < num29);
        K = list26.filter((arg392) => arg392.status !== "missing");
        const [all3, all4] = await Promise.all([
          _("/ha/devices").catch(() => ({
            items: [],
          })),
          _("/ha/translations").catch(() => ({
            resources: {},
          })),
        ]);
        ((Rt = all3?.items || []),
          (up = new Map(
            Rt.map((arg393) => [String(arg393.deviceId || ""), Ja(arg393.name)]).filter(
              ([v516, v517]) => v516 && v517,
            ),
          )),
          (Yo = all4?.resources || {}),
          (Xo = true));
        const map25 = new Map(nasProfiles2(K, Rt).map((arg394) => [arg394.deviceId, arg394])),
          v518 = reconcileNasDocument2(g?.document, map25),
          v519 = reconcileNasDocument2(Ye, map25);
        Qn = documentSignature2(Ye);
        for (const v520 of [...ae.undo, ...ae.redo])
          for (const v521 of ["document", "beforeSavedDocument", "afterSavedDocument"])
            reconcileNasDocument2(v520[v521], map25);
        if (Ne) {
          reconcileNasDocument2(Ne.document, map25);
          for (const v522 of [...(Ne.undo || []), ...(Ne.redo || [])])
            for (const v523 of ["document", "beforeSavedDocument", "afterSavedDocument"])
              reconcileNasDocument2(v522[v523], map25);
          documentSignature2(Ne.document) === Qn &&
            (fs(g.projectId), (Ne = null), Dn.open && Dn.close());
        }
        (x?.setEntityCatalog(K, Yo, Rt),
          it?.setEntityCatalog(K, Yo, Rt),
          kw(),
          (v518 || v519) &&
            cn({
              preserveRecovery: !!Ne,
            }),
          document.activeElement?.closest?.(".inspector-form") || J());
      })().finally(() => {
        Jn = null;
      })),
      Jn);
}
function rm(arg395, v524 = ce) {
  const list27 = arg395?.customPopups || [];
  if ((Ze.replaceChildren(), bi.replaceChildren(), !list27.length)) {
    ((ce = null),
      Ze.append(new Option("暂无组合弹窗", "")),
      (Ze.disabled = true),
      (wo.disabled = true),
      ne(Ze));
    const element159 = document.createElement("div");
    ((element159.className = "popup-list-empty"),
      (element159.textContent = "还没有组合弹窗"),
      bi.append(element159));
    return;
  }
  for (const v525 of list27) Ze.append(new Option(v525.name, v525.id));
  ((ce = list27.some((arg396) => arg396.id === v524) ? v524 : list27[0].id),
    (Ze.value = ce),
    (Ze.disabled = false),
    (wo.disabled = false),
    ne(Ze));
  for (const v526 of list27) {
    const element160 = document.createElement("button");
    ((element160.type = "button"),
      (element160.className = "popup-list-item" + (v526.id === ce ? " selected" : "")),
      (element160.dataset.popupId = v526.id),
      element160.setAttribute("role", "option"),
      element160.setAttribute("aria-selected", String(v526.id === ce)));
    const element161 = document.createElement("span");
    element161.textContent = v526.name;
    const element162 = document.createElement("small");
    ((element162.textContent = (v526.modules || []).length + " 个模块"),
      element160.append(element161, element162),
      bi.append(element160));
  }
}
function kw() {
  for (const element163 of document.querySelectorAll("[data-popup-entity]")) {
    const closest8 = element163.closest("[data-action-trigger]");
    (!element163.value && K[0]?.entityId && (element163.value = K[0].entityId), om(closest8));
    const v527 = closest8?.querySelector("[data-popup-entity-menu]");
    v527 &&
      !v527.hidden &&
      ml(closest8, closest8.querySelector("[data-popup-entity-search]")?.value || "");
  }
}
function am(v528 = ye.elements.deviceType.value) {
  const v529 = ye.elements.type.value === "climate",
    v530 = normalizedPopupClimateDeviceType2(v528);
  ((np.hidden = !v529), (ye.elements.deviceType.value = v530));
  for (const element164 of np.querySelectorAll("[data-popup-module-device-type]")) {
    const v531 = element164.dataset.popupModuleDeviceType === v530;
    (element164.classList.toggle("active", v531),
      element164.setAttribute("aria-pressed", String(v531)));
  }
}
function sm(arg397) {
  return K.find((arg398) => arg398.entityId === arg397)?.name || arg397 || "未选择实体";
}
function Mw() {
  const v532 = ye.elements.entityId.value,
    v533 = K.find((arg399) => arg399.entityId === v532),
    text40 = v533 ? "[" + no(v533) + "] " + vt(v533) : v532 || "选择实体";
  (ts(Cn, text40, v532 || text40), (Cn.dataset.entityId = v532), Cn._entityCopySync?.());
}
function Ow(v534 = Wc.value) {
  const v535 = ye.elements.entityId.value,
    localeLowerCase7 = String(v534 || "")
      .trim()
      .toLocaleLowerCase("zh-CN"),
    map26 = K.map((arg400, arg401) => ({
      entity: arg400,
      index: arg401,
    }))
      .filter(
        ({ entity: v536 }) =>
          !localeLowerCase7 ||
          (rt(v536) + " " + v536.entityId).toLocaleLowerCase("zh-CN").includes(localeLowerCase7),
      )
      .sort(
        (arg402, arg403) =>
          Number(popupModuleEntityRecommended2(arg403.entity, ye.elements.type.value)) -
            Number(popupModuleEntityRecommended2(arg402.entity, ye.elements.type.value)) ||
          arg402.index - arg403.index,
      )
      .map(({ entity: v537 }) => v537);
  if (
    (Ui.replaceChildren(
      ...map26.map((arg404) => {
        const element165 = document.createElement("button");
        ((element165.type = "button"),
          (element165.className =
            "inspector-entity-option" + (arg404.entityId === v535 ? " selected" : "")),
          (element165.dataset.popupModuleEntityId = arg404.entityId),
          element165.setAttribute("role", "option"),
          element165.setAttribute("aria-selected", String(arg404.entityId === v535)));
        const element166 = document.createElement("span");
        element166.className = "inspector-entity-option-content";
        const element167 = document.createElement("span");
        ((element167.className = "inspector-entity-option-line inspector-entity-name-line"),
          (element167.textContent = "[" + no(arg404) + "] " + vt(arg404)));
        const element168 = document.createElement("span");
        return (
          (element168.className = "inspector-entity-option-line inspector-entity-id"),
          (element168.textContent = arg404.entityId),
          element166.append(element167, element168),
          ro(element165, element167),
          element165.append(element166),
          element165
        );
      }),
    ),
    !map26.length)
  ) {
    const element169 = document.createElement("div");
    ((element169.className = "inspector-picker-empty"),
      (element169.textContent = "没有匹配的实体"),
      Ui.append(element169));
  }
}
function tr() {
  ((tp.hidden = true), Cn.setAttribute("aria-expanded", "false"));
}
function Bw() {
  if (Le !== "popup") return;
  const v538 = findCustomPopup2(g?.document, ce),
    selector39 = Bn.querySelector(".custom-popup-stage-wrap"),
    selector40 = Bn.querySelector(".custom-popup-viewport"),
    selector41 = Bn.querySelector(".custom-popup-stage"),
    selector42 = Bn.querySelector(".custom-popup-editor-toolbar");
  if (!v538 || !selector39 || !selector40 || !selector41 || !selector42) return;
  const v539 = popupLayoutMetrics2(v538.modules || [], v538.layout),
    gridWidth = v539.gridWidth,
    gridHeight = v539.gridHeight,
    max33 = Math.max(
      0.2,
      Math.min(selector39.clientWidth / gridWidth, selector39.clientHeight / gridHeight),
    ),
    max34 = Math.max(1, gridWidth * max33),
    max35 = Math.max(1, gridHeight * max33);
  ((selector40.style.width = max34 + "px"),
    (selector40.style.height = max35 + "px"),
    (selector41.style.width = gridWidth + "px"),
    (selector41.style.height = gridHeight + "px"),
    (selector41.style.transform = "scale(" + max33 + ")"),
    (selector42.style.width = selector39.clientWidth + "px"));
}
function $w(arg405, arg406, v540 = null, v541 = false) {
  const v542 = (g?.document?.customPopups || []).find((arg407) => arg407.id === arg405);
  if (!v542) return;
  const v543 = reorderedPopupModules2(v542.modules, arg406, v540, v541);
  if (!(
    v543.length === (v542.modules || []).length &&
    v543.every((arg408, arg409) => arg408.id === v542.modules[arg409]?.id)
  )) {
    if (!packPopupModules2(v543, v542.layout).fits) {
      $(new Error("这个排序会使当前布局超过 3 行。"));
      return;
    }
    E((arg410) => {
      const v544 = (arg410.customPopups || []).find((arg411) => arg411.id === arg405);
      v544 && (v544.modules = reorderedPopupModules2(v544.modules, arg406, v540, v541));
    });
  }
}
function BL(arg412, arg413) {
  const element170 = document.createElement("div");
  element170.className = "popup-cover-settings";
  const list28 = [
    {
      label: "窗帘类型",
      property: "coverKind",
      fallback: "auto",
      allowed: ["auto", "standard", "dream", "airer"],
      options: [
        ["auto", "自动识别"],
        ["standard", "普通窗帘"],
        ["dream", "梦幻帘"],
        ["airer", "晾衣机"],
      ],
    },
    {
      label: "开合方向",
      property: "coverDirection",
      fallback: "split",
      allowed: ["split", "left", "right"],
      options: [
        ["split", "双开"],
        ["left", "向左"],
        ["right", "向右"],
      ],
    },
    {
      label: "电机方向",
      property: "coverMotorDirection",
      fallback: "auto",
      allowed: ["auto", "normal", "reversed"],
      options: [
        ["auto", "跟随 HA"],
        ["normal", "正常"],
        ["reversed", "反向"],
      ],
    },
  ];
  for (const v545 of list28) {
    const element171 = document.createElement("div");
    element171.className = "popup-cover-setting-row";
    const element172 = document.createElement("span");
    element172.textContent = v545.label;
    const element173 = document.createElement("div");
    ((element173.className = "popup-cover-setting-options"),
      element173.setAttribute("role", "group"),
      element173.setAttribute("aria-label", v545.label));
    const v546 = arg413.properties?.[v545.property],
      fallback = v545.allowed.includes(v546) ? v546 : v545.fallback;
    for (const [v547, v548] of v545.options) {
      const element174 = document.createElement("button");
      ((element174.type = "button"),
        (element174.textContent = v548),
        element174.classList.toggle("active", v547 === fallback),
        element174.setAttribute("aria-pressed", String(v547 === fallback)),
        element174.addEventListener("click", (arg414) => {
          (arg414.stopPropagation(),
            v547 !== fallback &&
              E((arg415) => {
                const v549 = (arg415.customPopups || [])
                  .find((arg416) => arg416.id === arg412)
                  ?.modules?.find((arg417) => arg417.id === arg413.id);
                !v549 ||
                  v549.type !== "cover" ||
                  (v549.properties = {
                    ...(v549.properties || {}),
                    [v545.property]: v547,
                  });
              }));
        }),
        element173.append(element174));
    }
    (element171.append(element172, element173), element170.append(element171));
  }
  return element170;
}
function $L(arg418, arg419) {
  const element175 = document.createElement("div");
  element175.className = "popup-climate-settings";
  const element176 = document.createElement("div");
  element176.className = "popup-cover-setting-row";
  const element177 = document.createElement("span");
  element177.textContent = "设备类型";
  const element178 = document.createElement("div");
  ((element178.className = "popup-cover-setting-options"),
    element178.setAttribute("role", "group"),
    element178.setAttribute("aria-label", "设备类型"));
  const deviceType3 = arg419.properties?.deviceType || arg419.deviceType,
    v550 = normalizedPopupClimateDeviceType2(deviceType3);
  for (const [v551, v552] of [
    ["auto", "自动识别"],
    ["air-conditioner", "空调"],
    ["bath-heater", "浴霸"],
  ]) {
    const element179 = document.createElement("button");
    ((element179.type = "button"),
      (element179.textContent = v552),
      element179.classList.toggle("active", v551 === v550),
      element179.setAttribute("aria-pressed", String(v551 === v550)),
      element179.addEventListener("click", (arg420) => {
        (arg420.stopPropagation(),
          v551 !== v550 &&
            E((arg421) => {
              const v553 = (arg421.customPopups || [])
                .find((arg422) => arg422.id === arg418)
                ?.modules?.find((arg423) => arg423.id === arg419.id);
              !v553 ||
                v553.type !== "climate" ||
                ((v553.properties = {
                  ...(v553.properties || {}),
                  deviceType: v551,
                }),
                delete v553.deviceType);
            }));
      }),
      element178.append(element179));
  }
  return (element176.append(element177, element178), element175.append(element176), element175);
}
function gl(arg424) {
  const list29 = [
      {
        value: 0,
        color: "#ddffc2",
      },
      {
        value: 13,
        color: "#68cc3e",
      },
      {
        value: 27,
        color: "#ff8e52",
      },
      {
        value: 40,
        color: "#ff1a1a",
      },
    ],
    thresholds2 = Array.isArray(arg424.properties?.thresholds) ? arg424.properties.thresholds : [];
  return list29.map((arg425, arg426) => ({
    value: Number.isFinite(Number(thresholds2[arg426]?.value))
      ? Number(thresholds2[arg426].value)
      : arg425.value,
    color: String(thresholds2[arg426]?.color || arg425.color),
  }));
}
function FL(arg427, arg428) {
  const element180 = document.createElement("div");
  element180.className = "popup-line-chart-settings";
  const element181 = document.createElement("div");
  element181.className = "popup-line-chart-setting-row";
  const element182 = document.createElement("span");
  element182.textContent = "数值小数位";
  const element183 = document.createElement("select");
  element183.setAttribute("aria-label", "组合弹窗折线图数值小数位");
  for (const [v554, v555] of [
    ["auto", "自动"],
    ["0", "0 位"],
    ["1", "1 位"],
    ["2", "2 位"],
    ["3", "3 位"],
    ["4", "4 位"],
  ])
    element183.append(new Option(v555, v554));
  const v556 = syncedLineChartProperties2(g?.document, ct(), arg428.entityId, arg428.properties);
  ((element183.value = ["0", "1", "2", "3", "4"].includes(String(v556.statePrecision))
    ? String(v556.statePrecision)
    : "auto"),
    element183.addEventListener("pointerdown", (arg429) => arg429.stopPropagation()),
    element183.addEventListener("click", (arg430) => arg430.stopPropagation()),
    element183.addEventListener("change", (arg431) => {
      arg431.stopPropagation();
      const text41 = ["0", "1", "2", "3", "4"].includes(element183.value)
        ? element183.value
        : "auto";
      E((arg432) => {
        const v557 = (arg432.customPopups || [])
          .find((arg433) => arg433.id === arg427)
          ?.modules?.find((arg434) => arg434.id === arg428.id);
        !v557 ||
          v557.type !== "line-chart" ||
          (v557.properties = {
            ...(v557.properties || {}),
            statePrecision: text41,
          });
      });
    }),
    element181.append(element182, element183),
    element180.append(element181));
  const v558 = (arg435, arg436, arg437, v559 = false) => {
    const element184 = document.createElement("div");
    element184.className = "popup-line-chart-setting-row";
    const element185 = document.createElement("span");
    element185.textContent = arg435;
    const element186 = document.createElement("div");
    ((element186.className = "popup-line-chart-colors"),
      arg436.forEach((arg438, arg439) => {
        const element187 = document.createElement("input");
        ((element187.type = "color"),
          (element187.value = arg438),
          (element187.disabled = v559),
          element187.setAttribute(
            "aria-label",
            "" + arg435 + (arg436.length > 1 ? " " + (arg439 + 1) : ""),
          ),
          element187.addEventListener("pointerdown", (arg440) => arg440.stopPropagation()),
          element187.addEventListener("click", (arg441) => arg441.stopPropagation()),
          element187.addEventListener("change", (arg442) => {
            (arg442.stopPropagation(), arg437(element187.value, arg439));
          }),
          element186.append(element187));
      }),
      element184.append(element185, element186),
      element180.append(element184));
  };
  v558("数值颜色", [String(arg428.properties?.valueColor || "#dce1e5")], (arg443) => {
    E((arg444) => {
      const v560 = (arg444.customPopups || [])
        .find((arg445) => arg445.id === arg427)
        ?.modules?.find((arg446) => arg446.id === arg428.id);
      !v560 ||
        v560.type !== "line-chart" ||
        (v560.properties = {
          ...(v560.properties || {}),
          valueColor: arg443,
        });
    });
  });
  const element188 = document.createElement("div");
  element188.className = "popup-line-chart-setting-row";
  const element189 = document.createElement("span");
  element189.textContent = "阈值模式";
  const element190 = document.createElement("select");
  (element190.setAttribute("aria-label", "组合弹窗折线图阈值模式"),
    element190.append(new Option("自动（按历史范围）", "auto"), new Option("手动设置", "manual")));
  const some4 =
    Array.isArray(arg428.properties?.thresholds) &&
    arg428.properties.thresholds.some((arg447) => Number.isFinite(Number(arg447?.value)));
  ((element190.value =
    arg428.properties?.thresholdMode === "auto" ||
    (!some4 && arg428.properties?.thresholdMode !== "manual")
      ? "auto"
      : "manual"),
    element190.addEventListener("pointerdown", (arg448) => arg448.stopPropagation()),
    element190.addEventListener("click", (arg449) => arg449.stopPropagation()),
    element190.addEventListener("change", (arg450) => {
      arg450.stopPropagation();
      const text42 = element190.value === "manual" ? "manual" : "auto";
      E((arg451) => {
        const v561 = (arg451.customPopups || [])
          .find((arg452) => arg452.id === arg427)
          ?.modules?.find((arg453) => arg453.id === arg428.id);
        if (!v561 || v561.type !== "line-chart") return;
        const options46 = {
          ...(v561.properties || {}),
          thresholdMode: text42,
        };
        (text42 === "manual" &&
          !Array.isArray(options46.thresholds) &&
          (options46.thresholds = gl(v561)),
          (v561.properties = options46));
      });
    }),
    element188.append(element189, element190),
    element180.append(element188));
  const gl2 = gl(arg428),
    element191 = document.createElement("div");
  element191.className = "popup-line-chart-setting-row";
  const element192 = document.createElement("span");
  element192.textContent = "阈值";
  const element193 = document.createElement("div");
  return (
    (element193.className = "popup-line-chart-threshold-values"),
    gl2.forEach((arg454, arg455) => {
      const element194 = document.createElement("input");
      ((element194.type = "number"),
        (element194.step = "any"),
        (element194.value = roundField2(arg454.value)),
        (element194.disabled = element190.value === "auto"),
        element194.setAttribute("aria-label", "折线阈值 " + (arg455 + 1)),
        element194.addEventListener("pointerdown", (arg456) => arg456.stopPropagation()),
        element194.addEventListener("click", (arg457) => arg457.stopPropagation()),
        element194.addEventListener("change", (arg458) => {
          arg458.stopPropagation();
          const v562 = Number(element194.value);
          Number.isFinite(v562) &&
            ((element194.value = roundField2(v562)),
            E((arg459) => {
              const v563 = (arg459.customPopups || [])
                .find((arg460) => arg460.id === arg427)
                ?.modules?.find((arg461) => arg461.id === arg428.id);
              if (!v563 || v563.type !== "line-chart") return;
              const gl3 = gl(v563);
              ((gl3[arg455] = {
                ...gl3[arg455],
                value: v562,
              }),
                (v563.properties = {
                  ...(v563.properties || {}),
                  thresholdMode: "manual",
                  thresholds: gl3,
                }));
            }));
        }),
        element193.append(element194));
    }),
    element191.append(element192, element193),
    element180.append(element191),
    v558(
      "折线颜色",
      gl2.map((arg462) => arg462.color),
      (arg463, arg464) => {
        E((arg465) => {
          const v564 = (arg465.customPopups || [])
            .find((arg466) => arg466.id === arg427)
            ?.modules?.find((arg467) => arg467.id === arg428.id);
          if (!v564 || v564.type !== "line-chart") return;
          const gl4 = gl(v564);
          ((gl4[arg464] = {
            ...gl4[arg464],
            color: arg463,
          }),
            (v564.properties = {
              ...(v564.properties || {}),
              thresholdMode: "manual",
              thresholds: gl4,
            }));
        });
      },
      element190.value === "auto",
    ),
    element180
  );
}
function cm() {
  if (Le !== "popup") return;
  const v565 = findCustomPopup2(g?.document, ce);
  if ((Bn.replaceChildren(), !v565)) {
    const element195 = document.createElement("div");
    ((element195.className = "custom-popup-empty"),
      (element195.innerHTML =
        "<div><strong>还没有组合弹窗</strong><p>从左侧新建后，可以混合添加灯光、空调、空气净化器、窗帘、摄像头和折线图。</p></div>"),
      Bn.append(element195));
    return;
  }
  const element196 = document.createElement("div");
  element196.className = "custom-popup-editor-shell";
  const element197 = document.createElement("div");
  element197.className = "custom-popup-editor-toolbar";
  const element198 = document.createElement("div"),
    element199 = document.createElement("strong");
  element199.textContent = v565.name;
  const element200 = document.createElement("span"),
    v566 = popupLayoutMetrics2(v565.modules || [], v565.layout);
  ((element200.textContent = v566.columns + " 列 × " + v566.rows + " 行·行数自适应"),
    element198.append(element199, element200));
  const element201 = document.createElement("div");
  element201.className = "custom-popup-toolbar-actions";
  const element202 = document.createElement("span");
  element202.className = "custom-popup-layout-toggle";
  for (const v567 of [2, 3, 4]) {
    const element203 = document.createElement("button");
    ((element203.type = "button"),
      (element203.textContent = v567 + " 列"),
      element203.classList.toggle("active", popupLayoutColumns2(v565.layout) === v567),
      element203.addEventListener("click", () => {
        if (popupLayoutColumns2(v565.layout) === v567) return;
        const options47 = {
          ...(v565.layout || {}),
          columns: v567,
        };
        if (!packPopupModules2(v565.modules || [], options47).fits) {
          $(new Error("当前模块在 " + v567 + " 列布局中会超过 3 行。"));
          return;
        }
        E((arg468) => {
          const v568 = (arg468.customPopups || []).find((arg469) => arg469.id === v565.id);
          v568 &&
            (v568.layout = {
              ...(v568.layout || {}),
              columns: v567,
            });
        });
      }),
      element202.append(element203));
  }
  const element204 = document.createElement("button");
  ((element204.type = "button"),
    (element204.textContent = "＋ 添加模块"),
    element204.addEventListener("click", () => Fw()),
    element201.append(element202, element204),
    element197.append(element198, element201));
  const element205 = document.createElement("div");
  element205.className = "custom-popup-stage-wrap";
  const element206 = document.createElement("div");
  element206.className = "custom-popup-viewport";
  const element207 = document.createElement("div");
  ((element207.className = "custom-popup-stage"),
    (element207.style.width = v566.gridWidth + "px"),
    (element207.style.height = v566.gridHeight + "px"),
    element207.style.setProperty("--popup-columns", v566.columns),
    element207.style.setProperty("--popup-rows", v566.rows),
    (element207.style.gridTemplateColumns = "repeat(" + v566.columns + ", minmax(0, 1fr))"),
    (element207.style.gridTemplateRows = "repeat(" + v566.rows + ", minmax(0, 1fr))"));
  let value11 = null;
  const v569 = () => {
    element207.classList.remove("popup-module-append-target");
    for (const element208 of element207.querySelectorAll(
      ".popup-module-drop-top,.popup-module-drop-right,.popup-module-drop-bottom,.popup-module-drop-left",
    ))
      element208.classList.remove(
        "popup-module-drop-top",
        "popup-module-drop-right",
        "popup-module-drop-bottom",
        "popup-module-drop-left",
      );
  };
  (element207.addEventListener("dragover", (arg470) => {
    !value11 ||
      arg470.target.closest(".popup-module-card") ||
      (arg470.preventDefault(),
      v569(),
      element207.classList.add("popup-module-append-target"),
      arg470.dataTransfer && (arg470.dataTransfer.dropEffect = "move"));
  }),
    element207.addEventListener("drop", (arg471) => {
      if (!value11 || arg471.target.closest(".popup-module-card")) return;
      arg471.preventDefault();
      const v570 = value11;
      (v569(), $w(v565.id, v570));
    }));
  for (const [v571, element209] of (v565.modules || []).entries()) {
    const options48 = v566.placements[v571] || {
        x: 0,
        y: v571,
        width: 1,
        height: 1,
      },
      num30 = [
        "climate",
        "air-purifier",
        "water-heater",
        "media-player",
        "camera",
        "line-chart",
      ].includes(element209.type)
        ? 2
        : options48.width,
      element210 = document.createElement("article");
    ((element210.className = "popup-module-card"),
      (element210.dataset.popupModuleId = element209.id),
      (element210.draggable = true),
      element210.setAttribute(
        "aria-label",
        (element209.title || sm(element209.entityId)) + "，可拖动排序",
      ),
      (element210.style.gridColumn = options48.x + 1 + " / span " + num30),
      (element210.style.gridRow = options48.y + 1 + " / span " + options48.height));
    const element211 = document.createElement("div");
    element211.className = "popup-module-card-heading";
    const element212 = document.createElement("div"),
      element213 = document.createElement("strong");
    ((element213.textContent = element209.title || sm(element209.entityId)),
      element212.append(element213));
    const element214 = document.createElement("span");
    element214.className = "popup-module-card-actions";
    const element215 = document.createElement("button");
    ((element215.type = "button"),
      (element215.textContent = "✎"),
      (element215.title = "编辑模块"),
      element215.addEventListener("click", () => Fw(element209)));
    const element216 = document.createElement("button");
    ((element216.type = "button"),
      (element216.textContent = "⎘"),
      (element216.title = "复制模块"),
      element216.addEventListener("click", () => {
        const list30 = [
          ...(v565.modules || []),
          {
            ...clone2(element209),
            id: "candidate",
          },
        ];
        if (!packPopupModules2(list30, v565.layout).fits) {
          $(new Error("当前布局已放不下这个复制模块。"));
          return;
        }
        E((arg472) => {
          const v572 = (arg472.customPopups || []).find((arg473) => arg473.id === v565.id),
            v573 = v572?.modules?.find((arg474) => arg474.id === element209.id);
          v573 &&
            v572.modules.push({
              ...clone2(v573),
              id: newId2("popup-module"),
            });
        });
      }));
    const element217 = document.createElement("button");
    ((element217.type = "button"),
      (element217.textContent = "×"),
      (element217.title = "删除模块"),
      element217.addEventListener("click", () =>
        E((arg475) => {
          const v574 = (arg475.customPopups || []).find((arg476) => arg476.id === v565.id);
          v574 && (v574.modules = v574.modules.filter((arg477) => arg477.id !== element209.id));
        }),
      ),
      element214.append(element215, element216, element217),
      element210.addEventListener("pointerdown", (arg478) => {
        element210.dataset.dragBlocked = String(
          !!arg478.target.closest(
            ".popup-module-card-actions,.popup-cover-settings,.popup-climate-settings,.popup-line-chart-settings",
          ),
        );
      }),
      element210.addEventListener("pointerup", () => {
        delete element210.dataset.dragBlocked;
      }),
      element210.addEventListener("pointercancel", () => {
        delete element210.dataset.dragBlocked;
      }),
      element210.addEventListener("dragstart", (arg479) => {
        if (element210.dataset.dragBlocked === "true") {
          (arg479.preventDefault(), delete element210.dataset.dragBlocked);
          return;
        }
        ((value11 = element209.id),
          element210.classList.add("popup-module-dragging"),
          element210.setAttribute("aria-grabbed", "true"),
          arg479.dataTransfer &&
            ((arg479.dataTransfer.effectAllowed = "move"),
            arg479.dataTransfer.setData("text/plain", element209.id)));
      }),
      element210.addEventListener("dragover", (arg480) => {
        if (!value11 || value11 === element209.id) return;
        (arg480.preventDefault(), arg480.stopPropagation(), v569());
        const { edge: v575 } = popupModuleDropPosition2(element210, arg480);
        (element210.classList.add("popup-module-drop-" + v575),
          arg480.dataTransfer && (arg480.dataTransfer.dropEffect = "move"));
      }),
      element210.addEventListener("drop", (arg481) => {
        if (!value11 || value11 === element209.id) return;
        (arg481.preventDefault(), arg481.stopPropagation());
        const v576 = value11,
          { placeAfter: v577 } = popupModuleDropPosition2(element210, arg481);
        (v569(), $w(v565.id, v576, element209.id, v577));
      }),
      element210.addEventListener("dragend", () => {
        ((value11 = null),
          delete element210.dataset.dragBlocked,
          element210.classList.remove("popup-module-dragging"),
          element210.removeAttribute("aria-grabbed"),
          v569());
      }),
      element211.append(element212, element214));
    const element218 = document.createElement("div");
    element218.className = "popup-module-placeholder";
    const element219 = document.createElement("strong");
    element219.textContent = popupModuleTypeLabel2(element209.type) + "交互模块";
    const element220 = document.createElement("span");
    element220.textContent = sm(element209.entityId);
    const element221 = document.createElement("small");
    ((element221.textContent = element209.entityId),
      element218.append(element219, element220, element221),
      element209.type === "cover" && element218.append(BL(v565.id, element209)),
      element209.type === "climate" && element218.append($L(v565.id, element209)),
      element209.type === "line-chart" && element218.append(FL(v565.id, element209)),
      element210.append(element211, element218),
      element207.append(element210));
  }
  if (!(v565.modules || []).length) {
    const element222 = document.createElement("div");
    ((element222.className = "custom-popup-empty"),
      (element222.style.gridColumn = "1 / -1"),
      (element222.style.gridRow = "1 / -1"),
      (element222.textContent = "点击“添加模块”开始组合弹窗"),
      element207.append(element222));
  }
  (element206.append(element207),
    element205.append(element206),
    element196.append(element197, element205),
    Bn.append(element196),
    window.requestAnimationFrame(Bw));
}
function Fw(v578 = null) {
  if (!findCustomPopup2(g?.document, ce)) return;
  ((za = v578?.id || null), (lE.textContent = v578 ? "编辑弹窗模块" : "添加弹窗模块"));
  const text43 = v578?.type === "capability-device" ? "generic" : v578?.type;
  ((ye.elements.type.value = [
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
    "generic",
  ].includes(text43)
    ? text43
    : "light"),
    ne(ye.elements.type));
  const v579 =
    K.find((arg482) => popupModuleEntityRecommended2(arg482, ye.elements.type.value)) || K[0];
  ((ye.elements.entityId.value = v578?.entityId || v579?.entityId || ""),
    (ye.elements.title.value = v578?.title || ""),
    am(v578?.properties?.deviceType || v578?.deviceType || "auto"),
    (Wc.value = ""),
    Mw(),
    Ui.replaceChildren(),
    tr(),
    qi.showModal());
}
function DL(arg483, v580 = null) {
  if ((W.replaceChildren(), !arg483.pages.length))
    return (W.append(new Option("暂无页面", "")), (W.disabled = true), ne(W), false);
  const defaultPagePath = arg483.pages.some((arg484) => arg484.path === arg483.defaultPagePath)
    ? arg483.defaultPagePath
    : null;
  for (const v581 of arg483.pages) {
    const option = new Option(v581.name, v581.path);
    ((option.dataset.defaultPage = String(v581.path === defaultPagePath)), W.append(option));
  }
  return (
    (W.disabled = false),
    (W.value =
      v580 && arg483.pages.some((arg485) => arg485.path === v580)
        ? v580
        : defaultPagePath || arg483.pages[0].path),
    ne(W),
    true
  );
}
function Dw(arg486, arg487) {
  const list31 = B.size ? [...B] : w ? [w] : [];
  ((B = new Set(
    list31.filter((arg488) => {
      const v582 = findComponent2(arg486, arg488);
      return v582 && (v582.scope !== "page" || v582.page?.path === arg487);
    }),
  )),
    B.has(w) || (w = B.values().next().value || null),
    w || (xe = null));
}
const zL = new Set();
function VL(arg489, arg490, arg491) {
  if (
    Le !== "edit" ||
    !x ||
    x.page?.path !== arg491 ||
    editorDocumentFrameSignature2(arg489) !== editorDocumentFrameSignature2(arg490)
  )
    return null;
  const list32 = editorComponentEntries2(arg489),
    list33 = editorComponentEntries2(arg490);
  if (
    list32.order.length !== list33.order.length ||
    list32.order.some((arg492, arg493) => arg492 !== list33.order[arg493]) ||
    list32.entries.size !== list33.entries.size
  )
    return null;
  const list34 = [];
  for (const [v583, v584] of list32.entries) {
    const v585 = list33.entries.get(v583);
    if (
      !v585 ||
      v584.scope !== v585.scope ||
      v584.pagePath !== v585.pagePath ||
      v584.parentId !== v585.parentId ||
      zL.has(v584.component.type) ||
      editorComponentStructure2(v584.component) !== editorComponentStructure2(v585.component)
    )
      return null;
    const { children: component3, ...component4 } = v584.component,
      { children: component5, ...component6 } = v585.component;
    if (JSON.stringify(component4) !== JSON.stringify(component6)) {
      if (!x.componentHosts.has(v583)) {
        let v586 = v585;
        for (; v586.parentId;) v586 = list33.entries.get(v586.parentId);
        if (
          v585.scope === "shared"
            ? (x.page.sharedComponentIds || []).includes(v586.component.id)
            : v585.pagePath === arg491
        )
          return null;
        continue;
      }
      list34.push({
        componentId: v583,
        component: v585.component,
      });
    }
  }
  return list34;
}
function zw(arg494, arg495) {
  const v587 = findComponent2(g?.document, arg494)?.component;
  if (!v587 || arg494 !== w) return;
  if (v587.type === "flow-line") {
    previewFlowLineInspectorTransform2(To, v587, g.document.canvas, arg495);
    return;
  }
  if (v587.type === "percentage-bar") {
    previewPercentageBarInspector2(
      To,
      {
        ...v587,
        position: {
          ...v587.position,
          ...arg495,
        },
        style: {
          ...v587.style,
          ...(Number.isFinite(arg495.scale)
            ? {
                scale: arg495.scale,
              }
            : {}),
        },
      },
      g.document,
    );
    return;
  }
  const v588 = Number(g.document.canvas.width || 2778),
    v589 = Number(g.document.canvas.height || 1940),
    v590 = Number(v587.position?.width || 100),
    v591 = Number(v587.position?.height || 100),
    width2 = Number.isFinite(arg495.width) ? arg495.width : v590,
    height2 = Number.isFinite(arg495.height) ? arg495.height : v591,
    includes6 = ["icon-button", "device-button", "presence-sensor"].includes(v587.type),
    zd2 =
      v587.type === "title-button"
        ? zd
        : v587.type === "light-statistics"
          ? jd
          : includes6
            ? mu
            : v587.type === "air-conditioner"
              ? vu
              : v587.type === "vacuum-map"
                ? Nu
                : v587.type === "camera"
                  ? Iu
                  : v587.type === "icon-button-effect"
                    ? jr
                    : Re(v587)
                      ? ka
                      : v587.type === "time"
                        ? ma
                        : v587.type === "date"
                          ? ha
                          : v587.type === "weather"
                            ? va
                            : v587.type === "line-chart"
                              ? Sa
                              : v587.type === "panel-frame"
                                ? Ea
                                : Po,
    Vd2 =
      v587.type === "title-button"
        ? Vd
        : v587.type === "light-statistics"
          ? qd
          : includes6
            ? fu
            : v587.type === "air-conditioner"
              ? wu
              : v587.type === "vacuum-map"
                ? Eu
                : v587.type === "camera"
                  ? Tu
                  : v587.type === "icon-button-effect"
                    ? qr
                    : Re(v587)
                      ? Ma
                      : v587.type === "time"
                        ? fa
                        : v587.type === "date"
                          ? ba
                          : v587.type === "weather"
                            ? wa
                            : v587.type === "line-chart"
                              ? xa
                              : v587.type === "panel-frame"
                                ? La
                                : ko,
    Yr2 =
      v587.type === "title-button"
        ? Yr
        : v587.type === "light-statistics"
          ? ea
          : includes6
            ? ra
            : v587.type === "air-conditioner"
              ? ca
              : v587.type === "vacuum-map"
                ? la
                : v587.type === "camera"
                  ? ua
                  : v587.type === "icon-button-effect"
                    ? Bo
                    : Re(v587)
                      ? _n
                      : v587.type === "time"
                        ? $o
                        : v587.type === "date"
                          ? Fo
                          : v587.type === "weather"
                            ? Do
                            : v587.type === "line-chart"
                              ? zo
                              : v587.type === "panel-frame"
                                ? Vo
                                : Rn,
    sc2 =
      v587.type === "title-button"
        ? sc
        : v587.type === "light-statistics"
          ? pc
          : includes6
            ? bc
            : v587.type === "air-conditioner"
              ? Nc
              : v587.type === "vacuum-map"
                ? Ic
                : v587.type === "camera"
                  ? Mc
                  : v587.type === "icon-button-effect"
                    ? Ai
                    : Re(v587)
                      ? jo
                      : v587.type === "time"
                        ? Bi
                        : v587.type === "date"
                          ? $i
                          : v587.type === "weather"
                            ? Fi
                            : v587.type === "line-chart"
                              ? Wi
                              : v587.type === "panel-frame"
                                ? ji
                                : Mo;
  (Number.isFinite(arg495.x) &&
    (zd2.value = roundField2(clampNumber2(((arg495.x + width2 / 2) / v588) * 100, 0, 100))),
    Number.isFinite(arg495.y) &&
      (Vd2.value = roundField2(clampNumber2(((arg495.y + height2 / 2) / v589) * 100, 0, 100))),
    Re(v587) &&
      Number.isFinite(arg495.width) &&
      (Ro.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    Re(v587) &&
      Number.isFinite(arg495.height) &&
      (Ho.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    v587.type === "icon-button-effect" &&
      Number.isFinite(arg495.width) &&
      (Ii.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    v587.type === "icon-button-effect" &&
      Number.isFinite(arg495.height) &&
      (Ti.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    v587.type === "title-button" &&
      Number.isFinite(arg495.width) &&
      (rc.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    v587.type === "title-button" &&
      Number.isFinite(arg495.height) &&
      (ac.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    v587.type === "light-statistics" &&
      Number.isFinite(arg495.width) &&
      (dc.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    v587.type === "light-statistics" &&
      Number.isFinite(arg495.height) &&
      (uc.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    includes6 &&
      Number.isFinite(arg495.width) &&
      (gc.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    includes6 &&
      Number.isFinite(arg495.height) &&
      (hc.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    v587.type === "camera" &&
      Number.isFinite(arg495.width) &&
      (Pc.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    v587.type === "camera" &&
      Number.isFinite(arg495.height) &&
      (kc.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    v587.type === "air-conditioner" &&
      Number.isFinite(arg495.width) &&
      (Sc.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    v587.type === "air-conditioner" &&
      Number.isFinite(arg495.height) &&
      (xc.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    v587.type === "line-chart" &&
      Number.isFinite(arg495.width) &&
      (zi.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    v587.type === "line-chart" &&
      Number.isFinite(arg495.height) &&
      (Vi.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    v587.type === "panel-frame" &&
      Number.isFinite(arg495.width) &&
      (Ri.value = roundField2(clampNumber2((arg495.width / v588) * 100, 0.1, 100))),
    v587.type === "panel-frame" &&
      Number.isFinite(arg495.height) &&
      (Hi.value = roundField2(clampNumber2((arg495.height / v589) * 100, 0.1, 100))),
    Number.isFinite(arg495.scale) && (Yr2.value = roundField2(arg495.scale * 100)),
    Number.isFinite(arg495.rotation) && (sc2.value = roundField2(arg495.rotation)));
}
function ps() {
  return (
    x ||
    ((x = new PanelRenderer2(Pt, {
      editable: true,
      historySeriesCache: d0,
      runtimeStateCache: u0,
      virtualEntityStateCache: p0,
      onComponentTransform(arg496, arg497) {
        ((w = arg496),
          (B = new Set([arg496])),
          E((arg498) => {
            const element223 = findComponent2(arg498, arg496)?.component;
            if (!element223) return;
            const $e2 = $e(element223, "width"),
              $e3 = $e(element223, "height"),
              $e4 = $e(element223, "scale"),
              $e5 = $e(element223, "rotation"),
              { scale: v592, airflowOffsetX: v593, airflowOffsetY: v594, ...v595 } = arg497;
            ((element223.position = {
              ...(element223.position || {}),
              ...v595,
            }),
              Number.isFinite(v592) &&
                (element223.style = {
                  ...(element223.style || {}),
                  scale: v592,
                }),
              element223.type === "air-conditioner" &&
                (Number.isFinite(v593) || Number.isFinite(v594)) &&
                (element223.properties = {
                  ...(element223.properties || {}),
                  ...(Number.isFinite(v593)
                    ? {
                        airflowOffsetX: v593,
                      }
                    : {}),
                  ...(Number.isFinite(v594)
                    ? {
                        airflowOffsetY: v594,
                      }
                    : {}),
                }),
              Re(element223) &&
                Number.isFinite(arg497.width) &&
                uo(arg496, "width", $e2, $e(element223, "width")),
              Re(element223) &&
                Number.isFinite(arg497.height) &&
                uo(arg496, "height", $e3, $e(element223, "height")),
              Re(element223) &&
                Number.isFinite(arg497.scale) &&
                uo(arg496, "scale", $e4, $e(element223, "scale")),
              Re(element223) &&
                Number.isFinite(arg497.rotation) &&
                uo(arg496, "rotation", $e5, $e(element223, "rotation")));
          }));
      },
      onComponentsTransform(arg499, arg500) {
        ((w = arg500),
          E((arg501) => {
            for (const vector of arg499) {
              const element224 = findComponent2(arg501, vector.componentId)?.component;
              element224 &&
                ((element224.position = {
                  ...(element224.position || {}),
                  ...(Number.isFinite(vector.x)
                    ? {
                        x: vector.x,
                      }
                    : {}),
                  ...(Number.isFinite(vector.y)
                    ? {
                        y: vector.y,
                      }
                    : {}),
                  ...(Number.isFinite(vector.rotation)
                    ? {
                        rotation: vector.rotation,
                      }
                    : {}),
                }),
                Number.isFinite(vector.scale) &&
                  (element224.style = {
                    ...(element224.style || {}),
                    scale: vector.scale,
                  }));
            }
          }));
      },
      onComponentDuplicate(arg502, arg503) {
        ((w = arg503.id),
          (B = new Set([arg503.id])),
          (xe = arg503.id),
          E((arg504) => {
            Tp(arg504, arg502, arg503, false);
          }));
      },
      onComponentsDuplicate(arg505, arg506, arg507) {
        const map27 = arg505.map((arg508) => arg508.copiedComponent.id);
        ((w = arg507 || map27[0] || null),
          (B = new Set(map27)),
          (xe = w),
          E((arg509) => {
            for (const v596 of arg505)
              Tp(arg509, v596.sourceComponentId, v596.copiedComponent, false);
          }));
      },
      onComponentTransformPreview(arg510, arg511) {
        zw(arg510, arg511);
      },
      onComponentProperties(arg512, arg513) {
        E((arg514) => {
          const v597 = findComponent2(arg514, arg512)?.component;
          !v597 ||
            !["air-conditioner", "presence-sensor"].includes(v597.type) ||
            (v597.type === "presence-sensor" && v597.properties?.sensorKind !== "door-window") ||
            (v597.properties = {
              ...(v597.properties || {}),
              ...arg513,
            });
        });
      },
      onComponentPropertiesPreview(arg515, arg516) {
        arg515 === w &&
          (Number.isFinite(arg516.airflowScale) &&
            (bu.value = roundField2(arg516.airflowScale * 100)),
          Number.isFinite(arg516.airflowRotation) &&
            (yu.value = roundField2(arg516.airflowRotation)),
          Number.isFinite(arg516.airflowOffsetX) && (aa.value = roundField2(arg516.airflowOffsetX)),
          Number.isFinite(arg516.airflowOffsetY) &&
            (sa.value = roundField2(arg516.airflowOffsetY)));
      },
      onComponentsTransformPreview(arg517, arg518) {
        w = arg518;
        const v598 = arg517.find((arg519) => arg519.componentId === arg518);
        v598 && zw(arg518, v598);
      },
      onError: $,
      onRuntimeStateChange() {
        const f6 = F();
        f6?.type === "light-statistics" && iw(f6);
      },
      onPageChange(arg520) {
        ((W.value = arg520.path),
          ne(W),
          Dw(g?.document, arg520.path),
          x?.setSelectedComponents([...B], w),
          Xe(),
          J());
      },
    })),
    x.setEntityCatalog(K, Yo, Rt),
    x)
  );
}
function ms(v599 = null) {
  (Lp(), cd(), Ip(), rm(g.document, ce));
  const dL2 = DL(g.document, v599);
  if ((j0(dL2), tl(), !dL2)) {
    (rn(),
      x?.destroy(),
      (x = null),
      (Pt.innerHTML = '<div class="canvas-message"><strong>请从左侧新建页面。</strong></div>'),
      Xe(),
      J(),
      Qc(v599),
      Le === "popup" && cm());
    return;
  }
  (Dw(g.document, W.value),
    Le === "edit"
      ? (ps().setDocument(g.document, W.value),
        x.setActiveGroup(_e),
        x.setSelectedComponents([...B], w))
      : (x?.destroy(), (x = null)),
    Xe(),
    J(),
    Le === "dashboard" ? Qc(W.value) : Le === "popup" ? cm() : oi());
}
function An() {
  ((zf.disabled = Jo || ae.busy || !ae.undo.length || !g),
    (Vf.disabled = Jo || ae.busy || !ae.redo.length || !g));
}
function fs(v600 = g?.projectId) {
  if (v600) {
    ci.cancel(v600);
    try {
      sessionStorage.removeItem(recoveryStorageKey2(_c, v600));
    } catch {}
  }
}
function WL(arg521) {
  try {
    const item = sessionStorage.getItem(recoveryStorageKey2(_c, arg521));
    if (!item) return null;
    const v601 = JSON.parse(item);
    return !v601?.document || v601.projectId !== arg521 ? null : v601;
  } catch {
    return null;
  }
}
const ci = createRecoveryWriter2(RL);
(window.addEventListener("pagehide", ci.flush),
  window.addEventListener("beforeunload", ci.flush),
  document.addEventListener("visibilitychange", () => {
    document.hidden && ci.flush();
  }));
function Vw() {
  if (!g || !Zn) return;
  const options49 = {
    projectId: g.projectId,
    revision: g.revision,
    document: g.document,
    selectedPath: W.value,
    selectedComponentId: w,
    selectedComponentIds: [...B],
    undo: [...ae.undo],
    redo: [...ae.redo],
    savedAt: new Date().toISOString(),
  };
  ci.schedule(options49);
}
function RL(arg522) {
  try {
    sessionStorage.setItem(recoveryStorageKey2(_c, arg522.projectId), JSON.stringify(arg522));
  } catch {
    try {
      sessionStorage.setItem(
        recoveryStorageKey2(_c, arg522.projectId),
        JSON.stringify({
          projectId: arg522.projectId,
          revision: arg522.revision,
          document: arg522.document,
          selectedPath: arg522.selectedPath,
          selectedComponentId: arg522.selectedComponentId,
          selectedComponentIds: arg522.selectedComponentIds,
          undo: [],
          redo: [],
          savedAt: arg522.savedAt,
        }),
      );
    } catch {}
  }
}
function cn({ preserveRecovery: v602 = false, signature: v603 = null } = {}) {
  ((Zn = !!g && (v603 ?? documentSignature2(g.document)) !== Qn),
    (df.disabled = !g || !Zn || Jo),
    Zn ? Vw() : v602 || fs());
}
function Ww() {
  ((ae.undo = []), (ae.redo = []), (ae.busy = false), An());
}
function nr(arg523, arg524) {
  for (arg523.push(arg524); arg523.filter((arg525) => arg525.kind !== "save").length > fp;) {
    const index4 = arg523.findIndex((arg526) => arg526.kind !== "save");
    if (index4 < 0) break;
    arg523.splice(index4, 1);
  }
  arg523.length > fp * 2 && arg523.splice(0, arg523.length - fp * 2);
}
function hl() {
  return {
    kind: "edit",
    document: clone2(g.document),
    selectedPath: W.value,
    selectedComponentId: w,
    selectedComponentIds: [...B],
  };
}
async function lm(arg527, v604 = null) {
  const v605 = ++Go;
  ci.flush();
  let v606;
  try {
    if (((v606 = await _("/projects/" + arg527 + "/draft")), v605 !== Go)) return;
    let jc3 = Jc(on(v606.document));
    if (!jc3) {
      if ((await Xa(), v605 !== Go)) return;
      jc3 = Jc(on(v606.document));
    }
    if (!jc3?.allowed) throw new Error("当前授权尚未解锁该 UI 方案。");
    if ((await ensureUiPackRuntime2(jc3), v605 !== Go)) return;
  } catch (v607) {
    if (v605 !== Go) return;
    throw v607;
  }
  (ci.flush(),
    (g = v606),
    (Ie += 1),
    window.HABridgeLog?.setContext({
      projectId: arg527,
    }),
    (wp = ""),
    Zo.clear(),
    us.clear(),
    Yi.clear(),
    Xi.clear(),
    Ki.clear(),
    Ji.clear(),
    Qi.clear());
  const map28 = new Map(nasProfiles2(K, Rt).map((arg528) => [arg528.deviceId, arg528]));
  (reconcileNasDocument2(g.document, map28),
    (Ye = clone2(g.document)),
    (Qn = documentSignature2(g.document)),
    (Ne = WL(arg527)),
    Ne && reconcileNasDocument2(Ne.document, map28),
    Ne &&
      (Ne.revision !== g.revision || documentSignature2(Ne.document) === Qn) &&
      (fs(arg527), (Ne = null)),
    rn(),
    Ww(),
    cn({
      preserveRecovery: !!Ne,
    }),
    Ep(true),
    (Oe.value = arg527),
    ne(Oe),
    ms(v604),
    rememberEditorProject2(arg527),
    Ne && !Xo && (await lo().catch(() => {})),
    v605 === Go && Ne && g?.projectId === arg527 && !Dn.open && Dn.showModal());
}
async function bl(v608 = null) {
  if (((Vt = (await _("/projects")).items || []), Oe.replaceChildren(), !Vt.length)) {
    ((Go += 1),
      (Ie += 1),
      x?.destroy(),
      (x = null),
      oi(),
      (g = null),
      Lp(),
      Zo.clear(),
      us.clear(),
      Yi.clear(),
      Xi.clear(),
      Ki.clear(),
      Ji.clear(),
      Qi.clear(),
      rn(),
      (Ye = null),
      (Qn = ""),
      (Ne = null),
      Ww(),
      cn(),
      Ep(false),
      j0(false),
      Oe.append(new Option("暂无仪表盘", "")),
      W.replaceChildren(new Option("暂无页面", "")),
      Ze.replaceChildren(new Option("暂无组合弹窗", "")),
      (bi.innerHTML = '<div class="popup-list-empty">还没有组合弹窗</div>'),
      (Oe.disabled = true),
      (W.disabled = true),
      (Ze.disabled = true),
      (wo.disabled = true),
      ne(Oe),
      ne(W),
      ne(Ze),
      Xe(),
      Qc());
    return;
  }
  for (const v609 of Vt) Oe.append(new Option(v609.name, v609.id));
  ((Oe.disabled = false), ne(Oe));
  const v610 = restoredEditorProject2(Vt, v608);
  await lm(v610);
}
async function Tt(
  arg529,
  v611 = W.value,
  { recordHistory: v612 = true, expectedSignature: v613 = null } = {},
) {
  if (!g) throw new Error("请先选择仪表盘。");
  const projectId = g.projectId,
    Ie3 = Ie,
    document2 = g.document,
    v614 = v613 ?? documentSignature2(document2),
    v615 = () => {
      if (documentSignature2(g.document) !== v614)
        throw new Error("等待期间产生了新编辑，已保留最新内容，请重试刚才的操作。");
    };
  v615();
  const v616 = documentSignature2(arg529);
  if (v614 === v616) return g;
  try {
    await guardInteraction3dChanges2(document2, arg529);
  } catch (v617) {
    if (Ie !== Ie3 || g?.projectId !== projectId) return null;
    throw v617;
  }
  if (Ie !== Ie3 || g?.projectId !== projectId) return null;
  v615();
  const vL2 = VL(document2, arg529, v611),
    hl2 = hl();
  ((g = {
    ...g,
    document: clone2(arg529),
  }),
    v612 && (nr(ae.undo, hl2), (ae.redo = [])));
  const v618 = Vt.find((arg530) => arg530.id === g.projectId);
  v618 && (v618.name = g.document.name);
  const element225 = Oe.selectedOptions[0];
  return (
    element225 && (element225.textContent = g.document.name),
    ne(Oe),
    vL2 && x?.applyEditorComponentUpdates(g.document, v611, vL2) ? (Xe(), J()) : ms(v611),
    cn({
      signature: v616,
    }),
    An(),
    g
  );
}
async function dm() {
  if (!g || !Zn || Jo || ae.busy) return;
  const projectId2 = g.projectId,
    Ie4 = Ie,
    v619 = clone2(Ye),
    v620 = clone2(g.document),
    v621 = documentSignature2(v620),
    v622 =
      documentSignature2(v620.customPopups || []) !== documentSignature2(Ye.customPopups || []);
  ((Jo = true), cn(), An());
  try {
    const _7 = await _("/projects/" + projectId2 + "/draft", {
      method: "PUT",
      hbLogContext: {
        projectId: g.projectId,
        phase: "save-draft",
      },
      body: JSON.stringify({
        revision: g.revision,
        globalPopupRevision: g.globalPopupRevision,
        globalPopupsDirty: v622,
        document: v620,
      }),
    });
    if (Ie !== Ie4 || g?.projectId !== projectId2) return;
    const v623 = documentSignature2(g.document),
      v624 = v623 !== v621,
      document3 = v624 ? clone2(g.document) : _7.document;
    (v624 &&
      documentSignature2(document3.customPopups || []) ===
        documentSignature2(v620.customPopups || []) &&
      (document3.customPopups = clone2(_7.document.customPopups || [])),
      (g = {
        ..._7,
        document: document3,
      }),
      (Ye = clone2(_7.document)),
      (Qn = documentSignature2(_7.document)),
      v624 || (Yi.clear(), Xi.clear(), Ki.clear(), Ji.clear(), Qi.clear()),
      nr(ae.undo, {
        kind: "save",
        beforeSavedDocument: v619,
        afterSavedDocument: clone2(_7.document),
      }),
      (ae.redo = []));
    const v625 = Vt.find((arg531) => arg531.id === g.projectId);
    v625 && (v625.name = g.document.name);
    const element226 = Oe.selectedOptions[0];
    (element226 && (element226.textContent = g.document.name),
      ne(Oe),
      documentSignature2(g.document) !== v623 && ms(W.value));
  } catch (v626) {
    $(v626);
  } finally {
    ((Jo = false), cn(), An());
  }
}
async function HL(arg532, arg533) {
  const projectId3 = g.projectId,
    Ie5 = Ie,
    beforeSavedDocument =
      arg533 === "undo" ? arg532.beforeSavedDocument : arg532.afterSavedDocument,
    v627 =
      documentSignature2(beforeSavedDocument.customPopups || []) !==
      documentSignature2(Ye.customPopups || []),
    v628 = documentSignature2(g.document.customPopups || []),
    _8 = await _("/projects/" + projectId3 + "/draft", {
      method: "PUT",
      body: JSON.stringify({
        revision: g.revision,
        globalPopupRevision: g.globalPopupRevision,
        globalPopupsDirty: v627,
        document: beforeSavedDocument,
      }),
    });
  if (Ie !== Ie5 || g?.projectId !== projectId3) return false;
  const v629 = clone2(g.document);
  return (
    (Ye = clone2(_8.document)),
    (Qn = documentSignature2(_8.document)),
    !v627 &&
      documentSignature2(v629.customPopups || []) === v628 &&
      (v629.customPopups = clone2(_8.document.customPopups || [])),
    (g = {
      ..._8,
      document: v629,
    }),
    ms(W.value),
    cn(),
    true
  );
}
async function Rw(arg534) {
  const v630 = g?.projectId,
    Ie6 = Ie,
    v631 = () => Ie === Ie6 && g?.projectId === v630;
  if ((await Wa.catch(() => {}), !v631() || Jo || ae.busy || !g)) return;
  const undo = arg534 === "undo" ? ae.undo : ae.redo,
    text44 = arg534 === "undo" ? "redo" : "undo",
    pop = undo.pop();
  if (pop) {
    ((ae.busy = true), An(), Yi.clear(), Xi.clear(), Ki.clear(), Ji.clear(), Qi.clear());
    try {
      if (pop.kind === "save") {
        if (!(await HL(pop, arg534))) return;
        nr(ae[text44], pop);
      } else {
        const hl3 = hl(),
          filter21 = Array.isArray(pop.selectedComponentIds)
            ? pop.selectedComponentIds.filter((arg535) => findComponent2(pop.document, arg535))
            : [];
        if (
          ((w = findComponent2(pop.document, pop.selectedComponentId)
            ? pop.selectedComponentId
            : filter21[0] || null),
          (B = new Set(filter21.length ? filter21 : w ? [w] : [])),
          (xe = w),
          !(await Tt(pop.document, pop.selectedPath, {
            recordHistory: false,
          })))
        )
          return;
        nr(ae[text44], hl3);
      }
    } catch (v632) {
      v631() && (nr(arg534 === "undo" ? ae.undo : ae.redo, pop), $(v632));
    } finally {
      v631() && ((ae.busy = false), An(), Zn && Vw());
    }
  }
}
async function jL() {
  const _9 = await _("/auth/me");
}
function Hw() {
  ((Qe.elements.name.value = re?.name || "Home Assistant"),
    (Qe.elements.baseUrl.value = re?.baseUrl || ""),
    (Qe.elements.accessToken.value = ""),
    (Qe.elements.accessToken.placeholder = re?.hasToken
      ? "已加密保存，留空则保留原令牌"
      : "粘贴 Home Assistant 长期访问令牌"),
    (Qe.elements.verifyTls.checked = re?.verifyTls !== false),
    Cl());
}
async function qL({ preserveForm: v633 = false } = {}) {
  ((re = await _("/ha/connection")), !st && (!v633 || !di) && Hw());
  const v634 = !re.connected && !!re.lastError;
  ($s.classList.toggle("connected", re.connected),
    $s.classList.toggle("error", v634),
    ($s.querySelector("span").textContent = re.connected
      ? ("HA 已连接 · " + (re.version || "")).trim()
      : re.lastError
        ? "HA 连接异常"
        : re.configured
          ? "HA 重连中"
          : "HA 未配置"),
    ($f.disabled = !re.configured || !re.baseUrl),
    li());
}
async function UL() {
  const _10 = await _("/ha/sync/status");
  Uo = _10;
  const options50 = _10.counts || {
    entities: 0,
    devices: 0,
    areas: 0,
  };
  if (
    ((ex.textContent = _10.configured
      ? _10.connected
        ? "已连接并实时同步"
        : _10.status === "error"
          ? "连接异常"
          : "正在连接或同步"
      : "尚未配置"),
    (tx.textContent =
      "实体 " + options50.entities + " · 设备 " + options50.devices + " · 区域 " + options50.areas),
    li(),
    !_10.configured)
  ) {
    ((Gi = null),
      (Xo = false),
      (K.length || Rt.length || Object.keys(Yo).length) &&
        ((K = []),
        (Rt = []),
        (up = new Map()),
        (Yo = {}),
        x?.setEntityCatalog([], {}, []),
        it?.setEntityCatalog([], {}, []),
        kw(),
        document.activeElement?.closest?.(".inspector-form") || J()));
    return;
  }
  const stringify = JSON.stringify([
    Number.isFinite(Number(_10.catalogRevision))
      ? Number(_10.catalogRevision)
      : _10.lastFullSyncAt || "",
    Number(options50.entities || 0),
    Number(options50.devices || 0),
    Number(options50.areas || 0),
  ]);
  if ((_10.connected || _10.status === "connected") && stringify !== Gi) {
    const Gi2 = Gi;
    Gi = stringify;
    try {
      await lo({
        afterCurrent: true,
      });
    } catch (v635) {
      throw (Gi === stringify && (Gi = Gi2), v635);
    }
  }
}
function li() {
  const v636 = !!re?.configured;
  if (
    ((ox.hidden = !v636 || st),
    (Qe.hidden = v636 && !st),
    (nx.hidden = v636 && !st),
    (bf.hidden = !v636 || !st),
    !v636)
  )
    return;
  const options51 = Uo?.counts || {
      entities: 0,
      devices: 0,
      areas: 0,
    },
    v637 = !!(re.connected || Uo?.connected),
    v638 = !v637 && !!(re.lastError || Uo?.lastError);
  (mf.classList.toggle("connected", v637),
    mf.classList.toggle("error", v638),
    (ix.textContent = re.name || "Home Assistant"),
    (ff.textContent = v637 ? "已连接并实时同步" : v638 ? "连接异常" : "正在重连"),
    (gf.textContent = re.baseUrl || "—"),
    (gf.title = re.baseUrl || ""),
    (rx.textContent = re.version || "未知"),
    (ax.textContent =
      "实体 " + options51.entities + " · 设备 " + options51.devices + " · 区域 " + options51.areas),
    (hf.hidden = !v638),
    (hf.textContent = (v638 && (re.lastError || Uo?.lastError)) || ""));
}
function GL() {
  ((st = true), li(), D(hi, ""));
}
function _L() {
  ((st = false), li());
}
function YL(arg536) {
  return new Promise((arg537) => window.setTimeout(arg537, arg536));
}
async function or({ preserveForm: v639 = true } = {}) {
  return (
    Da ||
    ((Da = Promise.all([
      qL({
        preserveForm: v639,
      }),
      UL(),
    ]).finally(() => {
      Da = null;
    })),
    Da)
  );
}
async function XL(v640 = 30000) {
  const v641 = Date.now() + v640;
  for (; Date.now() < v641;) {
    if (
      (await or({
        preserveForm: false,
      }),
      re?.connected)
    )
      return true;
    if (re?.lastError) return false;
    await YL(500);
  }
  return !!re?.connected;
}
function jw(v642 = false) {
  const formData = new FormData(Qe),
    trim4 = String(formData.get("accessToken") || "").trim();
  if (!trim4 && !re?.hasToken) throw new Error("首次连接请输入 Home Assistant 长期访问令牌。");
  if (!String(formData.get("baseUrl") || "").trim())
    throw new Error("请填写 Home Assistant 地址。");
  return {
    name: String(formData.get("name") || "").trim(),
    baseUrl: String(formData.get("baseUrl") || "").trim(),
    accessToken: trim4 || null,
    verifyTls: formData.get("verifyTls") === "on",
  };
}
function yl(v643 = ve) {
  const list35 = Kn.find((arg538) => arg538.id === "ui.base")?.dashboardTemplates || [];
  ve = v643 === "" || list35.some((arg539) => arg539.id === v643) ? v643 : list35[0]?.id || "";
  const list36 = [
    {
      id: "",
      name: "空白仪表盘",
      description: "使用栖光 UI 创建空白画布，不预置页面、控件或弹窗。",
      previewUrls: [],
      previewLabels: [],
      canvasWidth: null,
      canvasHeight: null,
    },
    ...list35.map((arg540) => ({
      id: arg540.id,
      name: arg540.name,
      description: arg540.description + " · v" + arg540.version,
      previewUrls: arg540.previewUrls || [],
      previewLabels: arg540.previewLabels || [],
      canvasWidth: Number(arg540.canvasWidth || 2778),
      canvasHeight: Number(arg540.canvasHeight || 1940),
    })),
  ];
  if (
    (Ql.replaceChildren(
      ...list36.map((arg541) => {
        const element227 = document.createElement("div");
        ((element227.className = "project-template-option" + (arg541.id === ve ? " active" : "")),
          (element227.dataset.projectTemplateId = arg541.id),
          (element227.dataset.previewUrls = JSON.stringify(arg541.previewUrls)),
          (element227.dataset.previewLabels = JSON.stringify(arg541.previewLabels)),
          (element227.dataset.previewIndex = "0"),
          element227.setAttribute("role", "radio"),
          element227.setAttribute("aria-checked", String(arg541.id === ve)),
          (element227.tabIndex = 0));
        const element228 = document.createElement("div");
        if (
          ((element228.className =
            "project-template-carousel" + (arg541.previewUrls.length ? "" : " blank")),
          arg541.previewUrls.length)
        ) {
          const element229 = document.createElement("button");
          ((element229.type = "button"),
            (element229.className = "project-template-preview-open"),
            (element229.dataset.projectPreviewAction = "open"),
            (element229.title = "点击放大预览"));
          const element230 = document.createElement("img");
          ((element230.src = arg541.previewUrls[0]),
            (element230.alt = arg541.previewLabels[0] || arg541.name + "预览 1"),
            (element230.loading = "eager"),
            element229.append(element230));
          const element231 = document.createElement("button");
          ((element231.type = "button"),
            (element231.className = "project-template-carousel-arrow previous"),
            (element231.dataset.projectPreviewAction = "previous"),
            element231.setAttribute("aria-label", "上一张预览"),
            (element231.textContent = "‹"));
          const element232 = document.createElement("button");
          ((element232.type = "button"),
            (element232.className = "project-template-carousel-arrow next"),
            (element232.dataset.projectPreviewAction = "next"),
            element232.setAttribute("aria-label", "下一张预览"),
            (element232.textContent = "›"));
          const element233 = document.createElement("div");
          element233.className = "project-template-carousel-meta";
          const element234 = document.createElement("strong");
          element234.textContent = arg541.previewLabels[0] || "栖光预览";
          const element235 = document.createElement("span");
          ((element235.textContent = "1 / " + arg541.previewUrls.length),
            element233.append(element234, element235),
            element228.append(element229),
            arg541.previewUrls.length > 1 && element228.append(element231, element232),
            element228.append(element233));
        } else
          element228.replaceChildren(
            ...Array.from(
              {
                length: 4,
              },
              () => document.createElement("i"),
            ),
          );
        const element236 = document.createElement("strong");
        element236.textContent = arg541.name;
        const element237 = document.createElement("span");
        return (
          (element237.textContent = arg541.description),
          element227.append(element228, element236, element237),
          element227
        );
      }),
    ),
    (Co.hidden = false),
    Wt === "create")
  ) {
    const v644 = list36.find((arg542) => arg542.id === ve);
    gr.elements.name.value = v644?.id ? v644.name : "我的仪表盘";
    const v645 = !!v644?.id;
    ((mt.readOnly = v645),
      (ft.readOnly = v645),
      (mt.value = String(v645 ? v644.canvasWidth : Oa)),
      (ft.value = String(v645 ? v644.canvasHeight : Ba)),
      Co.classList.toggle("fixed", v645),
      Co.classList.remove("name-only"),
      (Lf.textContent = v645
        ? "栖光使用固定画布分辨率，创建时会完整保留页面布局与比例。"
        : "编辑器和仪表盘将共用该分辨率与比例，显示时只做等比缩放。"),
      hs(),
      pm(v645));
  }
}
function qw(arg543) {
  try {
    return {
      urls: JSON.parse(arg543.dataset.previewUrls || "[]"),
      labels: JSON.parse(arg543.dataset.previewLabels || "[]"),
    };
  } catch {
    return {
      urls: [],
      labels: [],
    };
  }
}
function KL(arg544, arg545) {
  const { urls: qw2, labels: qw3 } = qw(arg544);
  if (!qw2.length) return;
  const v646 = ((Number(arg545) % qw2.length) + qw2.length) % qw2.length;
  arg544.dataset.previewIndex = String(v646);
  const selector43 = arg544.querySelector(".project-template-preview-open img"),
    selector44 = arg544.querySelector(".project-template-carousel-meta strong"),
    selector45 = arg544.querySelector(".project-template-carousel-meta span");
  (selector43 &&
    ((selector43.src = qw2[v646]), (selector43.alt = qw3[v646] || "栖光预览 " + (v646 + 1))),
    selector44 && (selector44.textContent = qw3[v646] || "栖光预览"),
    selector45 && (selector45.textContent = v646 + 1 + " / " + qw2.length));
}
function gs() {
  _o.length &&
    ((xt = ((xt % _o.length) + _o.length) % _o.length),
    (Nf.src = _o[xt]),
    (Nf.alt = ap[xt] || "栖光预览 " + (xt + 1)),
    (Ex.textContent = ap[xt] || "栖光预览"),
    (Lx.textContent = xt + 1 + " / " + _o.length));
}
function JL(arg546) {
  const { urls: qw4, labels: qw5 } = qw(arg546);
  qw4.length &&
    ((_o = qw4), (ap = qw5), (xt = Number(arg546.dataset.previewIndex || 0)), gs(), vi.showModal());
}
function um(v647 = "create") {
  Wt = v647;
  const v648 = v647 === "edit",
    v649 = v647 === "resize";
  if (
    (gr.reset(),
    (wx.textContent = v649 ? "RESIZE DASHBOARD" : v648 ? "EDIT PROJECT" : "NEW PROJECT"),
    (Cx.textContent = v649 ? "修改仪表盘分辨率" : v648 ? "修改仪表盘" : "创建仪表盘项目"),
    (Jl.textContent = v649 ? "应用修改" : v648 ? "保存修改" : "创建项目"),
    (gr.elements.name.value = v648 || v649 ? g?.document?.name || "" : "我的仪表盘"),
    (Nx.hidden = v648 || v649),
    (mt.readOnly = false),
    (ft.readOnly = false),
    (If.checked = false),
    (kx.hidden = !v649),
    Co.classList.remove("fixed", "name-only"),
    !v648 && !v649)
  )
    ((Oa = 2778),
      (Ba = 1940),
      (Sn = false),
      ($a = 2778),
      (Fa = 1940),
      (mt.value = "2778"),
      (ft.value = "1940"),
      hs(),
      yl("dwell-light"));
  else {
    if (v648) ((Co.hidden = false), Co.classList.add("name-only"));
    else {
      ve = "";
      const v650 = Number(g?.document?.canvas?.width || 2778),
        v651 = Number(g?.document?.canvas?.height || 1940);
      ((Oa = v650),
        (Ba = v651),
        (Sn = true),
        ($a = v650),
        (Fa = v651),
        (Co.hidden = false),
        (mt.value = String(v650)),
        (ft.value = String(v651)),
        (Lf.textContent =
          "默认会同步调整所有页面、控件和弹窗；勾选“锁定控件大小及位置”后保留普通控件的位置和尺寸，3D 交互外框始终跟随画布宽高。"),
        hs(),
        pm(false));
    }
  }
  (D(hr, ""), un.showModal());
}
function hs() {
  const v652 = Number(mt.value),
    v653 = Number(ft.value);
  if (!Number.isInteger(v652) || !Number.isInteger(v653) || v652 <= 0 || v653 <= 0) {
    Ef.textContent = "等待输入有效分辨率";
    return;
  }
  const $a2 = !ve && Sn ? $a : v652,
    Fa2 = !ve && Sn ? Fa : v653,
    v654 = greatestCommonDivisor2($a2, Fa2);
  Ef.textContent = $a2 / v654 + " : " + Fa2 / v654;
}
function pm(v655 = !!ve) {
  const Sn2 = v655 || Sn;
  ((br.disabled = v655),
    br.setAttribute("aria-pressed", String(Sn2)),
    br.classList.toggle("locked", Sn2),
    (Px.textContent = v655 ? "固定" : Sn2 ? "已锁定" : "锁定"),
    (br.title = v655 ? "栖光画布使用固定比例" : Sn2 ? "点击解锁画布比例" : "锁定当前画布比例"));
}
function Uw(arg547) {
  if (ve || !Sn) return;
  const v656 = Number($a),
    v657 = Number(Fa);
  if (!(!v656 || !v657)) {
    if (arg547 === "width") {
      let v658 = Number(mt.value);
      if (!Number.isInteger(v658) || v658 < 320 || v658 > 7680) return;
      let round = Math.round((v658 * v657) / v656);
      ((round < 240 || round > 4320) &&
        ((round = Math.max(240, Math.min(4320, round))),
        (v658 = Math.max(320, Math.min(7680, Math.round((round * v656) / v657)))),
        (mt.value = String(v658))),
        (ft.value = String(round)));
    } else {
      let v659 = Number(ft.value);
      if (!Number.isInteger(v659) || v659 < 240 || v659 > 4320) return;
      let round2 = Math.round((v659 * v656) / v657);
      ((round2 < 320 || round2 > 7680) &&
        ((round2 = Math.max(320, Math.min(7680, round2))),
        (v659 = Math.max(240, Math.min(4320, Math.round((round2 * v657) / v656)))),
        (ft.value = String(v659))),
        (mt.value = String(round2)));
    }
  }
}
function QL(arg548, arg549, arg550) {
  return (
    (Mx.textContent =
      "当前分辨率为 " +
      arg549 +
      " × " +
      arg550 +
      "，预计有 " +
      arg548 +
      " 个控件会部分或全部位于画布范围之外。"),
    new Promise((arg551) => {
      ((rp = arg551), qs.showModal());
    })
  );
}
function vl(arg552) {
  const rp2 = rp;
  ((rp = null), qs.open && qs.close(), rp2?.(arg552));
}
function Gw(v660 = "create") {
  if (!g) return;
  sp = v660;
  const v661 = v660 === "rename";
  (Us.reset(),
    (Fx.textContent = v661 ? "EDIT PAGE" : "NEW PAGE"),
    (Dx.textContent = v661 ? "重命名页面" : "新建页面"),
    (Zl.textContent = v661 ? "保存修改" : "创建页面"),
    (Us.elements.name.value = (v661 && ct()?.name) || ""),
    D(ed, ""),
    So.showModal());
}
function bs() {
  return Zn ? ($(new Error("当前有未保存修改，请先点击顶部的“保存”。")), true) : false;
}
function mm(arg553) {
  const options52 = {
      UNACTIVATED: "尚未激活",
      ACTIVE: "授权有效",
      CONNECTION_WARNING: "授权连接异常",
      STARTUP_VALIDATION_REQUIRED: "等待启动校验",
      RECOVERY_RETRY: "正在恢复会话",
      RECOVERY_REQUIRED: "授权会话失效",
      REMOTE_REJECTED: "授权请求被拒绝",
      LEASE_EXPIRED: "租约已到期",
      INSTANCE_MISMATCH: "实例不匹配",
      INVALID: "租约无效",
      DEACTIVATED: "后台已释放",
      REVOKED: "授权已撤销",
      CLOCK_ROLLBACK: "系统时间异常",
    },
    text45 = arg553?.status || "UNACTIVATED",
    v662 = text45 === "ACTIVE",
    includes7 = ["CONNECTION_WARNING", "STARTUP_VALIDATION_REQUIRED"].includes(text45),
    includes8 = [
      "LEASE_EXPIRED",
      "INSTANCE_MISMATCH",
      "INVALID",
      "REVOKED",
      "CLOCK_ROLLBACK",
    ].includes(text45);
  (mr.classList.toggle("connected", v662),
    mr.classList.toggle("warning", includes7),
    mr.classList.toggle("error", includes8),
    (mr.querySelector("span").textContent =
      !arg553?.required && text45 === "UNACTIVATED"
        ? "授权 · 开发模式"
        : options52[text45] || "授权状态"),
    (XS.className = v662 ? "connected" : includes7 ? "warning" : includes8 ? "error" : ""),
    (KS.textContent = options52[text45] || text45),
    (JS.textContent = arg553?.activationCodeId
      ? "当前编辑器的授权与附加包"
      : arg553?.required
        ? "尚未激活"
        : "开发模式"),
    QS.render(arg553),
    (uf.hidden = !arg553?.lastError),
    (uf.textContent = arg553?.lastError || ""),
    (fr.hidden = !arg553?.canRetry || text45 === "ACTIVE"),
    (gi.hidden = ![
      "UNACTIVATED",
      "DEACTIVATED",
      "INVALID",
      "INSTANCE_MISMATCH",
      "REVOKED",
    ].includes(text45)));
}
async function wl() {
  const _11 = await _("/license/status");
  if (_11?.required && !_11.allowed) return (window.location.replace("/license"), _11);
  const stringify2 = JSON.stringify([...(_11?.features || [])].sort()),
    v663 = Cp !== null && Cp !== stringify2;
  Cp = stringify2;
  const jc4 = g ? Jc(on(g.document)) : null,
    set9 = new Set(Array.isArray(_11?.features) ? _11.features : []);
  if (_11?.required && jc4?.featureCode && !set9.has(jc4.featureCode)) {
    const v664 = "当前授权已不再包含“" + jc4.name + "”，该仪表盘已停止显示和编辑。";
    (x?.destroy(), (x = null), oi(), (g = null), rn(), Ep(false));
    const element238 = document.createElement("div");
    element238.className = "canvas-message";
    const element239 = document.createElement("strong");
    ((element239.textContent = v664),
      element238.append(element239),
      Pt.replaceChildren(element238),
      wp !== jc4.id && ((wp = jc4.id), $(new Error(v664))));
  }
  return (
    v663 &&
      (await Promise.all([
        Tn({
          refreshInspector: false,
        }),
        Xa(),
      ])),
    mm(_11),
    _11
  );
}
(mr.addEventListener("click", async () => {
  D(Bs, "");
  try {
    const wl2 = await wl();
    (!wl2?.required || wl2.allowed) && fi.showModal();
  } catch (v665) {
    $(v665);
  }
}),
  YS.addEventListener("click", () => fi.close()),
  fr.addEventListener("click", async () => {
    if (!fr.disabled) {
      ((fr.disabled = true), D(jl, "正在重新连接授权后台…"));
      try {
        const _12 = await _("/license/retry", {
          method: "POST",
        });
        (mm(_12),
          D(
            jl,
            _12?.allowed
              ? "已完成检查，本地有效授权可继续使用。"
              : _12?.lastError || "尚未恢复授权，请检查具体原因。",
          ),
          _12?.required && !_12.allowed && window.location.replace("/license"));
      } catch (v666) {
        D(jl, v666.message, "error");
      } finally {
        fr.disabled = false;
      }
    }
  }),
  fi.addEventListener("click", (arg554) => {
    arg554.target === fi && fi.close();
  }),
  gi.addEventListener("submit", async (arg555) => {
    arg555.preventDefault();
    const selector46 = gi.querySelector('button[type="submit"]'),
      trim5 = String(new FormData(gi).get("activationCode") || "").trim(),
      trim6 = String(new FormData(gi).get("email") || "").trim();
    ((selector46.disabled = true), D(Bs, "正在绑定实例并获取签名租约…"));
    try {
      const _13 = await _("/license/activate", {
        method: "POST",
        body: JSON.stringify({
          activationCode: trim5,
          email: trim6,
        }),
      });
      (gi.reset(), mm(_13), D(Bs, "当前实例已成功激活。", "success"));
    } catch (v667) {
      D(Bs, v667.message, "error");
    } finally {
      selector46.disabled = false;
    }
  }),
  $s.addEventListener("click", async () => {
    ((st = false), D(hi, ""), Hw(), li());
    const selector47 = Mn.querySelector("#ha-status-message");
    (D(selector47, "正在刷新连接状态…"), Mn.showModal());
    try {
      (await or(), D(selector47, ""));
    } catch {
      D(selector47, "连接状态刷新失败，请稍后关闭窗口重新打开。", "error");
    }
  }),
  pf.addEventListener("click", () => {
    di || ((st = false), Mn.close());
  }),
  Mn.addEventListener("click", (arg556) => {
    arg556.target === Mn && !di && ((st = false), Mn.close());
  }),
  Mn.addEventListener("cancel", (arg557) => {
    di && arg557.preventDefault();
  }),
  Qe.addEventListener("input", () => {
    (Qe.hidden || (st = true), Cl());
  }));
function Cl(v668 = false) {
  const selector48 = Qe.querySelector("#ha-tls-options");
  ((selector48.hidden = !v668 && !/^https:\/\//i.test(Qe.elements.baseUrl.value.trim())),
    v668 && (selector48.open = true));
}
let di = false;
function Sl(arg558) {
  ((di = arg558), (pf.disabled = arg558));
  for (const v669 of Qe.querySelectorAll("input, button")) v669.disabled = arg558;
}
function _w(arg559) {
  const message =
    /[\u4e00-\u9fff]/.test(arg559.message || "") && !/"(?:type|loc|input)":/.test(arg559.message)
      ? arg559.message
      : "无法完成连接请求，请检查 HA Bridge 是否在线及当前网络，稍后重试。";
  (message.includes("证书") && Cl(true), D(hi, message, "error"));
}
(ZS.addEventListener("click", async () => {
  if (!(di || !Qe.reportValidity()))
    try {
      const jw2 = jw(true);
      (Sl(true), D(hi, "正在识别地址并验证令牌和实时连接…"));
      const _14 = await _("/ha/test", {
        method: "POST",
        body: JSON.stringify(jw2),
      });
      (_14.baseUrl && (Qe.elements.baseUrl.value = _14.baseUrl),
        Cl(),
        D(
          hi,
          "连接成功：" +
            (_14.locationName || "Home Assistant") +
            " · " +
            (_14.version || "未知版本") +
            (_14.baseUrl ? " · " + _14.baseUrl : ""),
          "success",
        ));
    } catch (v670) {
      _w(v670);
    } finally {
      Sl(false);
    }
}),
  Qe.addEventListener("submit", async (arg560) => {
    if ((arg560.preventDefault(), !di))
      try {
        const jw3 = jw(false);
        (Sl(true),
          D(hi, "正在验证地址和实时连接，通过后保存…"),
          (re = await _("/ha/connection", {
            method: "PUT",
            body: JSON.stringify(jw3),
          })),
          (st = false),
          li(),
          !(await XL()) &&
            !re?.lastError &&
            Uo?.status !== "error" &&
            (ff.textContent = "后台仍在建立实时连接"));
      } catch (v671) {
        ((st = true), li(), _w(v671));
      } finally {
        Sl(false);
      }
  }),
  sx.addEventListener("click", GL),
  bf.addEventListener("click", _L),
  cx.addEventListener("click", () => {
    (Fs.reset(), D(Ds, ""), Mn.close(), yo.showModal());
  }),
  lx.addEventListener("click", () => yo.close()),
  dx.addEventListener("click", () => yo.close()),
  yo.addEventListener("click", (arg561) => {
    arg561.target === yo && yo.close();
  }),
  Fs.addEventListener("submit", async (arg562) => {
    if (
      (arg562.preventDefault(),
      String(new FormData(Fs).get("confirmation") || "").trim() !== "删除连接")
    ) {
      D(Ds, "请输入“删除连接”确认。", "error");
      return;
    }
    const selector49 = Fs.querySelector('button[type="submit"]');
    ((selector49.disabled = true), D(Ds, "正在断开连接并清除同步目录…"));
    try {
      (await _("/ha/connection", {
        method: "DELETE",
      }),
        yo.close(),
        (re = null),
        (Uo = null),
        (st = false),
        await or({
          preserveForm: false,
        }));
    } catch (v672) {
      D(Ds, v672.message, "error");
    } finally {
      selector49.disabled = false;
    }
  }),
  ux.addEventListener("click", async () => {
    if (!bs())
      try {
        (Kn.length || (await Xa()), um("create"));
      } catch (v673) {
        $(v673);
      }
  }),
  yf.addEventListener("click", async () => {
    if (g) {
      D(Ws, "");
      try {
        (await Xa(), W0(), vo.showModal());
      } catch (v674) {
        $(v674);
      }
    }
  }),
  gx.addEventListener("click", () => vo.close()),
  vo.addEventListener("click", (arg563) => {
    arg563.target === vo && vo.close();
  }),
  ql.addEventListener("click", async (arg564) => {
    const closest9 = arg564.target.closest("[data-ui-pack-id]");
    if (!closest9 || closest9.disabled || !g) return;
    const v675 = Kn.find((arg565) => arg565.id === closest9.dataset.uiPackId);
    if (!v675?.allowed) {
      D(Ws, "当前授权尚未解锁该 UI 方案。", "error");
      return;
    }
    ((closest9.disabled = true), D(Ws, "正在加载并应用整套 UI…"));
    try {
      (await ensureUiPackRuntime2(v675),
        await E((arg566) => applyUiPackToDocument2(arg566, v675)),
        vo.close());
    } catch (v676) {
      (D(Ws, v676.message, "error"), (closest9.disabled = false));
    }
  }),
  Sx.addEventListener("click", () => un.close()),
  xx.addEventListener("click", () => un.close()),
  un.addEventListener("click", (arg567) => {
    arg567.target === un && un.close();
  }),
  Ql.addEventListener("click", (arg568) => {
    const closest10 = arg568.target.closest("[data-project-template-id]");
    if (!closest10 || Wt !== "create") return;
    const v677 = arg568.target.closest("[data-project-preview-action]")?.dataset
      .projectPreviewAction;
    if (v677) {
      (arg568.stopPropagation(),
        v677 === "open" && (closest10.dataset.projectTemplateId || "") !== ve
          ? ((ve = closest10.dataset.projectTemplateId || ""), yl(ve))
          : v677 === "open"
            ? JL(closest10)
            : KL(
                closest10,
                Number(closest10.dataset.previewIndex || 0) + (v677 === "next" ? 1 : -1),
              ));
      return;
    }
    ((ve = closest10.dataset.projectTemplateId || ""), yl(ve));
  }),
  Ql.addEventListener("keydown", (arg569) => {
    if (!["Enter", " "].includes(arg569.key) || arg569.target.closest("button")) return;
    const closest11 = arg569.target.closest("[data-project-template-id]");
    !closest11 ||
      Wt !== "create" ||
      (arg569.preventDefault(), (ve = closest11.dataset.projectTemplateId || ""), yl(ve));
  }),
  Ax.addEventListener("click", () => vi.close()),
  Ix.addEventListener("click", () => {
    ((xt -= 1), gs());
  }),
  Tx.addEventListener("click", () => {
    ((xt += 1), gs());
  }),
  vi.addEventListener("click", (arg570) => {
    arg570.target === vi && vi.close();
  }),
  vi.addEventListener("keydown", (arg571) => {
    (arg571.key === "ArrowLeft" && ((xt -= 1), gs()),
      arg571.key === "ArrowRight" && ((xt += 1), gs()));
  }),
  mt.addEventListener("input", () => {
    (Uw("width"), ve || ((Oa = Number(mt.value) || 2778), (Ba = Number(ft.value) || 1940)), hs());
  }),
  ft.addEventListener("input", () => {
    (Uw("height"), ve || ((Oa = Number(mt.value) || 2778), (Ba = Number(ft.value) || 1940)), hs());
  }),
  br.addEventListener("click", () => {
    if (ve || !["create", "resize"].includes(Wt)) return;
    const v678 = Number(mt.value),
      v679 = Number(ft.value);
    if (
      !Number.isInteger(v678) ||
      !Number.isInteger(v679) ||
      v678 < 320 ||
      v678 > 7680 ||
      v679 < 240 ||
      v679 > 4320
    ) {
      D(hr, "请先输入有效的宽度和高度后再锁定比例。", "error");
      return;
    }
    ((Sn = !Sn), Sn && (($a = v678), (Fa = v679)), D(hr, ""), pm(false));
  }),
  Ox.addEventListener("click", () => vl(false)),
  Bx.addEventListener("click", () => vl(false)),
  $x.addEventListener("click", () => vl(true)),
  qs.addEventListener("cancel", (arg572) => {
    (arg572.preventDefault(), vl(false));
  }),
  gr.addEventListener("submit", async (arg573) => {
    arg573.preventDefault();
    const formData2 = new FormData(gr),
      trim7 = String(formData2.get("name") || "").trim(),
      v680 = Number(formData2.get("canvasWidth")),
      v681 = Number(formData2.get("canvasHeight")),
      checked = Wt === "resize" && If.checked;
    if (Wt === "resize" && checked) {
      const v682 = Number(g?.document?.canvas?.width || 2778),
        v683 = Number(g?.document?.canvas?.height || 1940),
        num31 =
          v680 !== v682 || v681 !== v683
            ? countComponentsOutsideCanvas2(
                resizeDashboardDocument2(g.document, v680, v681, {
                  lockContent: true,
                }),
                v680,
                v681,
              )
            : 0;
      if (num31 > 0 && !(await QL(num31, v680, v681))) return;
    }
    ((Jl.disabled = true),
      D(
        hr,
        Wt === "resize"
          ? "正在调整整个仪表盘…"
          : Wt === "edit"
            ? "正在保存仪表盘名称…"
            : ve
              ? "正在套用栖光整套模板…"
              : "正在创建空白仪表盘…",
      ));
    try {
      if (Wt === "resize") {
        const v684 = resizeDashboardDocument2(g.document, v680, v681, {
          lockContent: checked,
        });
        if (((v684.name = trim7), !(await Tt(v684)))) return;
        un.close();
      } else {
        if (Wt === "edit") {
          const v685 = clone2(g.document);
          if (((v685.name = trim7), !(await Tt(v685)))) return;
          un.close();
        } else {
          const options53 = {
            name: trim7,
            canvasWidth: v680,
            canvasHeight: v681,
            uiPackId: "ui.base",
          };
          ve && (options53.templateId = ve);
          const _15 = await _("/projects", {
            method: "POST",
            body: JSON.stringify(options53),
          });
          (un.close(), await bl(_15.id));
        }
      }
    } catch (v686) {
      D(hr, v686.message, "error");
    } finally {
      Jl.disabled = false;
    }
  }),
  zs.addEventListener("click", () => {
    const hidden2 = Vs.hidden;
    (Et(), to(), Ln(), (Vs.hidden = !hidden2), zs.setAttribute("aria-expanded", String(hidden2)));
  }),
  px.addEventListener("click", () => {
    bs() || window.location.assign("/3d-studio");
  }),
  Vs.addEventListener("click", async (arg574) => {
    const v687 = arg574.target.closest("[data-project-action]")?.dataset.projectAction;
    if (!(!v687 || !g) && (to(), !bs())) {
      if (v687 === "edit") {
        um("edit");
        return;
      }
      if (v687 === "resize") {
        um("resize");
        return;
      }
      if (v687 === "duplicate") {
        const v688 = g.document.name,
          set10 = new Set(Vt.map((arg575) => arg575.name));
        let v689 = v688 + " 副本",
          num32 = 2;
        for (; set10.has(v689);) v689 = v688 + " 副本 " + num32++;
        try {
          const _16 = await _("/projects/" + g.projectId + "/duplicate", {
            method: "POST",
            body: JSON.stringify({
              name: v689,
            }),
          });
          await bl(_16.id);
        } catch (v690) {
          $(v690);
        }
        return;
      }
      if (v687 === "delete") {
        const v691 = Vt.find((arg576) => arg576.id === g.projectId);
        if (!v691) return;
        (_s.reset(),
          (Jx.textContent = "“" + v691.name + "”"),
          (kt.dataset.projectId = v691.id),
          (kt.dataset.projectName = v691.name),
          D(Ys, ""),
          kt.showModal());
      }
    }
  }),
  Xx.addEventListener("click", () => kt.close()),
  Kx.addEventListener("click", () => kt.close()),
  kt.addEventListener("click", (arg577) => {
    arg577.target === kt && kt.close();
  }),
  _s.addEventListener("submit", async (arg578) => {
    arg578.preventDefault();
    const selector50 = _s.querySelector('button[type="submit"]'),
      v692 = String(new FormData(_s).get("confirmation") || ""),
      projectId4 = kt.dataset.projectId,
      projectName = kt.dataset.projectName;
    if (v692 !== projectName) {
      D(Ys, "请输入与项目名称完全一致的确认文字。", "error");
      return;
    }
    ((selector50.disabled = true), D(Ys, "正在删除项目和草稿…"));
    try {
      (await _("/projects/" + projectId4, {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: v692,
        }),
      }),
        fs(projectId4),
        kt.close(),
        x?.destroy(),
        (x = null),
        (g = null),
        rn(),
        await bl());
    } catch (v693) {
      D(Ys, v693.message, "error");
    } finally {
      selector50.disabled = false;
    }
  }),
  wf.addEventListener("click", () => Gw("create")),
  zx.addEventListener("click", () => So.close()),
  Vx.addEventListener("click", () => So.close()),
  So.addEventListener("click", (arg579) => {
    arg579.target === So && So.close();
  }),
  Us.addEventListener("submit", async (arg580) => {
    arg580.preventDefault();
    const trim8 = String(new FormData(Us).get("name") || "").trim(),
      v694 = clone2(g.document),
      v695 = W.value;
    ((Zl.disabled = true), D(ed, sp === "rename" ? "正在保存页面名称…" : "正在创建页面…"));
    try {
      if (sp === "rename") {
        const v696 = v694.pages.find((arg581) => arg581.path === v695);
        if (((v696.name = trim8), !(await Tt(v694, v695)))) return;
      } else {
        const options54 = {
            id: newId2("page"),
            name: trim8,
            path: uniquePagePath2(g?.document?.pages, trim8),
            sharedComponentIds: v694.sharedComponents.map((arg582) => arg582.id),
            components: [],
          },
          max36 = Math.max(
            0,
            v694.pages.findIndex((arg583) => arg583.path === v695),
          );
        if ((v694.pages.splice(max36 + 1, 0, options54), !(await Tt(v694, options54.path)))) return;
      }
      So.close();
    } catch (v697) {
      D(ed, v697.message, "error");
    } finally {
      Zl.disabled = false;
    }
  }),
  Wx.addEventListener("click", () => At.close()),
  Rx.addEventListener("click", () => At.close()),
  At.addEventListener("click", (arg584) => {
    arg584.target === At && At.close();
  }),
  Tf.addEventListener("submit", (arg585) => {
    arg585.preventDefault();
    const text46 = At.dataset.groupId || "",
      v698 = findComponent2(g?.document, text46)?.component;
    if (!v698 || v698.type !== "group") {
      At.close();
      return;
    }
    const v699 = componentLabel2(v698),
      slice4 = String(new FormData(Tf).get("name") || "")
        .trim()
        .slice(0, 128);
    if (!slice4) {
      D(Pf, "请输入组合名称。", "error");
      return;
    }
    if (slice4 === v699) {
      At.close();
      return;
    }
    (E((arg586) => {
      const v700 = findComponent2(arg586, text46)?.component;
      v700?.type === "group" &&
        (v700.properties = {
          ...(v700.properties || {}),
          label: slice4,
        });
    }),
      At.close());
  }),
  Rs.addEventListener("click", () => {
    const hidden3 = Hs.hidden;
    (Et(), to(), Ln(), (Hs.hidden = !hidden3), Rs.setAttribute("aria-expanded", String(hidden3)));
  }),
  Hs.addEventListener("click", async (arg587) => {
    const v701 = arg587.target.closest("[data-page-action]")?.dataset.pageAction,
      ct4 = ct();
    if (!v701 || !ct4 || !g) return;
    if ((Ln(), v701 === "rename")) {
      Gw("rename");
      return;
    }
    const v702 = clone2(g.document),
      index5 = v702.pages.findIndex((arg588) => arg588.path === ct4.path);
    if (v701 === "default") {
      if (v702.defaultPagePath === ct4.path) return;
      v702.defaultPagePath = ct4.path;
      try {
        if (!(await Tt(v702, ct4.path))) return;
        await dm();
      } catch (v703) {
        $(v703);
      }
      return;
    }
    if (v701 === "duplicate") {
      const v704 = clonePageWithFreshIds2(ct4, ct4.name + " 副本", g.document.pages);
      v702.pages.splice(index5 + 1, 0, v704);
      try {
        await Tt(v702, v704.path);
      } catch (v705) {
        $(v705);
      }
      return;
    }
    v701 === "delete" &&
      ((pn.dataset.pagePath = ct4.path),
      (e1.textContent = "“" + ct4.name + "”"),
      D(Xs, ""),
      pn.showModal());
  }),
  Qx.addEventListener("click", () => pn.close()),
  Zx.addEventListener("click", () => pn.close()),
  pn.addEventListener("click", (arg589) => {
    arg589.target === pn && pn.close();
  }),
  ld.addEventListener("click", async () => {
    const pagePath = pn.dataset.pagePath,
      v706 = clone2(g.document),
      index6 = v706.pages.findIndex((arg590) => arg590.path === pagePath);
    if (index6 < 0) {
      D(Xs, "页面已经不存在，请刷新后重试。", "error");
      return;
    }
    const v707 = v706.pages[index6];
    v706.pages.splice(index6, 1);
    const value12 = v706.pages[Math.max(0, index6 - 1)]?.path || v706.pages[0]?.path || null,
      v708 = v706.pages.find((arg591) => arg591.path === value12);
    v706.defaultPagePath === pagePath && (v706.defaultPagePath = value12);
    const v709 = (arg592) => {
      for (const element240 of arg592 || []) {
        if (
          ((element240.properties = {
            ...(element240.properties || {}),
          }),
          element240.type === "navigation-button" && element240.properties.targetPage === pagePath)
        ) {
          (!element240.properties.mainText ||
            element240.properties.mainText === "页面导航" ||
            element240.properties.mainText === v707?.name) &&
            (element240.properties.mainText = v708?.name || "页面导航");
          const upperCase = String(pagePath).replace(/[-_]+/g, " ").toUpperCase();
          ((!element240.properties.secondaryText ||
            element240.properties.secondaryText === "NAVIGATION" ||
            element240.properties.secondaryText === upperCase) &&
            (element240.properties.secondaryText = value12
              ? String(value12).replace(/[-_]+/g, " ").toUpperCase()
              : "NAVIGATION"),
            value12
              ? (element240.properties.targetPage = value12)
              : delete element240.properties.targetPage);
        }
        element240.actions = {
          ...(element240.actions || {}),
        };
        for (const v710 of ["tap", "doubleTap", "hold"])
          element240.actions[v710]?.type === "navigate" &&
            element240.actions[v710]?.target === pagePath &&
            (element240.type === "navigation-button" && value12
              ? (element240.actions[v710] = {
                  type: "navigate",
                  target: value12,
                })
              : delete element240.actions[v710]);
        v709(element240.children);
      }
    };
    v709(v706.sharedComponents);
    for (const v711 of v706.pages) v709(v711.components);
    ((ld.disabled = true), D(Xs, "正在删除页面…"));
    try {
      if (!(await Tt(v706, value12))) return;
      pn.close();
    } catch (v712) {
      D(Xs, v712.message, "error");
    } finally {
      ld.disabled = false;
    }
  }),
  De.addEventListener("click", (arg593) => {
    const hp2 = hp,
      v713 = arg593.target.closest("[data-component-action]")?.dataset.componentAction,
      closest12 = arg593.target.closest("[data-label-color]");
    if (!hp2 || (!v713 && !closest12)) return;
    const list37 = B.has(hp2) ? [...B] : [hp2];
    if ((Mp(), v713 === "copy")) {
      J0(list37, hp2);
      return;
    }
    if (v713 === "group") {
      kE(list37);
      return;
    }
    if (v713 === "ungroup") {
      ME(hp2);
      return;
    }
    if (v713 === "rename-group") {
      OE(hp2);
      return;
    }
    if (v713 === "copy-to-page") {
      HE(list37);
      return;
    }
    if (v713 === "visibility") {
      const map29 = list37
        .map((arg594) => findComponent2(g?.document, arg594)?.component)
        .filter(Boolean)
        .map((arg595) => arg595.style?.visible !== false);
      if (
        map29.length !== list37.length ||
        !map29.length ||
        !map29.every((arg596) => arg596 === map29[0])
      )
        return;
      Y0(list37, !map29[0]);
      return;
    }
    if (v713 === "delete") {
      Z0(list37);
      return;
    }
    closest12 && jE(list37, closest12.dataset.labelColor);
  }),
  t1.addEventListener("click", () => mn.close()),
  n1.addEventListener("click", () => mn.close()),
  mn.addEventListener("click", (arg597) => {
    arg597.target === mn && mn.close();
  }),
  i1.addEventListener("click", () => gt.close()),
  r1.addEventListener("click", () => gt.close()),
  gt.addEventListener("click", (arg598) => {
    arg598.target === gt && gt.close();
  }),
  d1.addEventListener("click", () => {
    ((Ha = null), Si.close());
  }),
  u1.addEventListener("click", () => {
    VE().catch($);
  }),
  Si.addEventListener("click", (arg599) => {
    arg599.target === Si && ((Ha = null), Si.close());
  }),
  $n.addEventListener("change", () => {
    Op();
  }),
  Ci.addEventListener("change", () => {
    $n.value === "other" && Op();
  }),
  dd.addEventListener("submit", async (arg600) => {
    arg600.preventDefault();
    let list38 = [];
    try {
      list38 = JSON.parse(gt.dataset.componentIds || "[]");
    } catch {
      list38 = [];
    }
    const v714 = Eo.value,
      v715 = $n.value === "other";
    if (!(!g || !list38.length || !v714)) {
      ((Lo.disabled = true), D(Fn, "正在复制控件…"));
      try {
        if (v715) {
          const v716 = Ci.value;
          if (!v716 || !Ht || Ht.projectId !== v716)
            throw new Error("目标仪表盘尚未加载完成，请稍后重试。");
          const v717 = clone2(Ht.document),
            text47 = Ks.hidden ? "none" : dd.elements.copyScaleMode.value;
          let num33 = 0;
          const v718 = copyComponentsAcrossDocuments2(g.document, v717, list38, v714, {
            cloneValue: clone2,
            createId: () => newId2("component"),
            componentLabel: componentLabel2,
            scaleMode: text47,
            onInvalidAction: () => {
              num33 += 1;
            },
          });
          if (!v718.length) throw new Error("目标页面或源控件已发生变化，请重新操作。");
          const _17 = await _("/projects/" + encodeURIComponent(v716) + "/draft", {
            method: "PUT",
            body: JSON.stringify({
              revision: Ht.revision,
              globalPopupRevision: Ht.globalPopupRevision,
              globalPopupsDirty: false,
              document: v717,
            }),
          });
          Ht = _17;
          const v719 = Vt.find((arg601) => arg601.id === v716);
          v719 && (v719.draftRevision = _17.revision);
          const text48 = v719?.name || "目标仪表盘",
            text49 = Eo.selectedOptions[0]?.textContent || "目标区域",
            text50 = num33 ? "（已清理 " + num33 + " 个目标仪表盘不存在的跳转或弹窗动作）" : "";
          (gt.close(),
            K0(
              "已复制 " +
                v718.length +
                " 个控件到“" +
                text48 +
                "”的“" +
                text49 +
                "”，并已保存" +
                text50 +
                "。",
              {
                projectId: v716,
                pagePath:
                  v714 === "shared" ? Ht.document.pages?.[0]?.path : v714.replace(/^page:/, ""),
                scope: v714 === "shared" ? "shared" : "page",
              },
            ));
          return;
        }
        const v720 = clone2(g.document),
          v721 = copyComponentsToTarget2(v720, list38, v714, {
            cloneValue: clone2,
            createId: () => newId2("component"),
            componentLabel: componentLabel2,
          });
        if (!v721.length) throw new Error("目标页面或源控件已发生变化，请重新操作。");
        ((w = v721[0].id), (B = new Set(v721.map((arg602) => arg602.id))), (xe = v721[0].id));
        const replace4 = v714 === "shared" ? W.value : v714.replace(/^page:/, ""),
          text51 = Eo.selectedOptions[0]?.textContent || "目标区域";
        if (!(await Tt(v720, replace4))) return;
        (gt.close(),
          K0("已复制 " + v721.length + " 个控件到“" + text51 + "”，并已保存。", {
            projectId: g.projectId,
            pagePath: replace4,
            scope: v714 === "shared" ? "shared" : "page",
          }));
      } catch (v722) {
        D(Fn, v722.message, "error");
      } finally {
        (!v715 || !Fn.classList.contains("success")) && (Lo.disabled = false);
      }
    }
  }),
  o1.addEventListener("click", () => {
    let list39 = [];
    try {
      list39 = JSON.parse(mn.dataset.componentIds || "[]");
    } catch {
      list39 = [];
    }
    if (!list39.length) return;
    mn.close();
    const set11 = new Set(list39);
    ((B = new Set([...B].filter((arg603) => !set11.has(arg603)))),
      set11.has(w) && (w = B.values().next().value || null),
      set11.has(xe) && (xe = w),
      E((arg604) => {
        for (const v723 of list39) Ap(arg604, v723);
      }));
  }),
  Sr.addEventListener("submit", (arg605) => arg605.preventDefault()),
  Li.addEventListener("submit", (arg606) => arg606.preventDefault()),
  tc.addEventListener("submit", (arg607) => arg607.preventDefault()),
  Wd.addEventListener("submit", (arg608) => arg608.preventDefault()),
  Pi.addEventListener("submit", (arg609) => arg609.preventDefault()),
  Ec.addEventListener("submit", (arg610) => arg610.preventDefault()),
  Tc.addEventListener("submit", (arg611) => arg611.preventDefault()),
  wc.addEventListener("submit", (arg612) => arg612.preventDefault()),
  pa.addEventListener("submit", (arg613) => arg613.preventDefault()),
  ga.addEventListener("submit", (arg614) => arg614.preventDefault()),
  ya.addEventListener("submit", (arg615) => arg615.preventDefault()),
  Ca.addEventListener("submit", (arg616) => arg616.preventDefault()),
  Na.addEventListener("submit", (arg617) => arg617.preventDefault()),
  Wo.addEventListener("submit", (arg618) => arg618.preventDefault()));
const Yw = new Map([
    [
      Js,
      {
        componentType: "image",
        property: "label",
        trim: true,
      },
    ],
    [
      Jf,
      {
        componentType: "icon-button-effect",
        property: "label",
        trim: true,
      },
    ],
    [
      fg,
      {
        componentType: "title-button",
        property: "label",
        trim: true,
      },
    ],
    [
      bg,
      {
        componentType: "title-button",
        property: "mainText",
        trim: false,
      },
    ],
    [
      oc,
      {
        componentType: "title-button",
        property: "secondaryText",
        trim: false,
        getValue: () => oc.value + "\n" + ic.value,
      },
    ],
    [
      ic,
      {
        componentType: "title-button",
        property: "secondaryText",
        trim: false,
        getValue: () => oc.value + "\n" + ic.value,
      },
    ],
    [
      Yg,
      {
        componentType: "light-statistics",
        property: "label",
        trim: true,
      },
    ],
    [
      Xg,
      {
        componentType: "light-statistics",
        property: "title",
        trim: false,
      },
    ],
    [
      gh,
      {
        componentType: "icon-button",
        componentTypes: ["icon-button", "device-button", "presence-sensor"],
        property: "label",
        trim: true,
      },
    ],
    [
      eu,
      {
        componentType: "icon-button",
        componentTypes: ["icon-button", "device-button", "presence-sensor"],
        property: "mainText",
        trim: false,
      },
    ],
    [
      tu,
      {
        componentType: "icon-button",
        componentTypes: ["icon-button", "device-button", "presence-sensor"],
        property: "secondaryText",
        trim: false,
      },
    ],
    [
      ry,
      {
        componentType: "vacuum-map",
        property: "label",
        trim: true,
      },
    ],
    [
      sy,
      {
        componentType: "camera",
        property: "label",
        trim: true,
      },
    ],
    [
      pb,
      {
        componentType: "air-conditioner",
        property: "label",
        trim: true,
      },
    ],
    [
      Ib,
      {
        componentType: "air-conditioner",
        property: "mainText",
        trim: false,
      },
    ],
    [
      $b,
      {
        componentType: "air-conditioner",
        property: "secondaryText",
        trim: false,
      },
    ],
    [
      by,
      {
        componentType: "time",
        property: "label",
        trim: true,
      },
    ],
    [
      Ey,
      {
        componentType: "date",
        property: "label",
        trim: true,
      },
    ],
    [
      zy,
      {
        componentType: "weather",
        property: "label",
        trim: true,
      },
    ],
    [
      tv,
      {
        componentType: "line-chart",
        property: "label",
        trim: true,
      },
    ],
    [
      uv,
      {
        componentType: "panel-frame",
        property: "label",
        trim: true,
      },
    ],
    [
      mv,
      {
        componentType: "panel-frame",
        property: "mainText",
        trim: false,
      },
    ],
    [
      Sv,
      {
        componentType: "panel-frame",
        property: "secondaryText",
        trim: false,
      },
    ],
    [
      Fc,
      {
        componentType: "navigation-button",
        componentTypes: ["navigation-button", "scene-mode"],
        property: "label",
        trim: true,
      },
    ],
    [
      Du,
      {
        componentType: "navigation-button",
        componentTypes: ["navigation-button", "scene-mode"],
        property: "mainText",
        trim: false,
      },
    ],
    [
      zu,
      {
        componentType: "navigation-button",
        componentTypes: ["navigation-button", "scene-mode"],
        property: "secondaryText",
        trim: false,
      },
    ],
  ]),
  xl = new WeakMap();
for (const [t, e] of Yw)
  (t.addEventListener("focus", () => {
    !g ||
      !w ||
      xl.set(t, {
        componentId: w,
        before: hl(),
        historyRecorded: false,
      });
  }),
    t.addEventListener("input", () => {
      if (!g || !w) return;
      const v724 = findComponent2(g.document, w),
        list40 = e.componentTypes || [e.componentType];
      if (!v724?.component || !list40.includes(v724.component.type)) return;
      const v725 = e.getValue ? e.getValue() : t.value,
        trim9 = e.trim ? v725.trim() : v725;
      if (String(v724.component.properties?.[e.property] || "") === trim9) return;
      let v726 = xl.get(t);
      ((!v726 || v726.componentId !== w) &&
        ((v726 = {
          componentId: w,
          before: hl(),
          historyRecorded: false,
        }),
        xl.set(t, v726)),
        v726.historyRecorded ||
          (nr(ae.undo, v726.before), (ae.redo = []), (v726.historyRecorded = true)),
        (v724.component.properties = {
          ...(v724.component.properties || {}),
          [e.property]: trim9,
        }),
        e.property === "label" &&
          (Xe(),
          x?.previewComponentProperties(v724.component.id, {
            label: trim9,
          }),
          it?.previewComponentProperties(v724.component.id, {
            label: trim9,
          })),
        e.componentType === "navigation-button" &&
          e.property !== "label" &&
          x?.previewComponentProperties(v724.component.id, {
            [e.property]: trim9,
          }),
        e.componentType === "panel-frame" &&
          e.property !== "label" &&
          x?.previewComponentProperties(v724.component.id, {
            [e.property]: trim9,
          }),
        e.componentType === "icon-button-effect" &&
          e.property !== "label" &&
          x?.previewComponentProperties(v724.component.id, {
            [e.property]: trim9,
          }),
        ["title-button", "light-statistics", "icon-button", "air-conditioner"].includes(
          e.componentType,
        ) &&
          e.property !== "label" &&
          x?.previewComponentProperties(v724.component.id, {
            [e.property]: trim9,
          }),
        cn(),
        An());
    }),
    t.addEventListener("blur", () => xl.delete(t)));
Ew();
for (const t of document.querySelectorAll(".component-action-controls"))
  (t.addEventListener("click", (arg619) => {
    const closest13 = arg619.target.closest("[data-hidden-content-clickable]");
    if (closest13 && w) {
      E((arg620) => {
        const v727 = findComponent2(arg620, w)?.component;
        !v727 ||
          !["title-button", "device-button", "icon-button-effect"].includes(v727.type) ||
          (v727.properties = {
            ...(v727.properties || {}),
            hiddenContentClickable: closest13.dataset.hiddenContentClickable === "on",
          });
      });
      return;
    }
    const closest14 = arg619.target.closest("[data-action-type]"),
      element241 = closest14?.closest("[data-action-trigger]"),
      w5 = w;
    if (!closest14 || !element241 || !w5 || closest14.disabled) return;
    const actionType = ACTION_TYPES2.includes(closest14.dataset.actionType)
        ? closest14.dataset.actionType
        : "none",
      actionTrigger2 = element241.dataset.actionTrigger;
    ["tap", "doubleTap", "hold"].includes(actionTrigger2) &&
      E((arg621) => {
        const v728 = findComponent2(arg621, w5)?.component;
        if (!v728) return;
        const v729 = v728.bindings?.entity?.entityId,
          v730 = v728.type === "light-statistics",
          v731 = actionPopupData2(v728.actions?.[actionTrigger2]),
          text52 =
            actionType === "more-info" && !v729 && v731.source === "current"
              ? (arg621.customPopups || []).length
                ? "custom"
                : "entity"
              : v731.source,
          options55 =
            actionType === "more-info"
              ? {
                  popupSource: text52,
                  ...(text52 === "entity"
                    ? {
                        entityId: v731.entityId || K[0]?.entityId || "",
                      }
                    : {}),
                  ...(text52 === "custom"
                    ? {
                        popupId: v731.popupId || arg621.customPopups?.[0]?.id || "",
                      }
                    : {}),
                }
              : {},
          v732 = v728.actions?.[actionTrigger2]?.type === "more-info",
          v733 = v728.actions?.[actionTrigger2]?.target,
          text53 = v728.type === "navigation-button" ? v728.properties?.targetPage : "",
          set12 = new Set(arg621.pages.map((arg622) => arg622.path)),
          v734 = set12.has(v733)
            ? v733
            : set12.has(text53)
              ? text53
              : W.value || arg621.pages[0]?.path,
          text54 =
            actionType === "none" ||
            componentActionIsSupported2(
              v728,
              actionType === "navigate"
                ? {
                    type: "navigate",
                    target: v734,
                  }
                : actionType === "more-info"
                  ? {
                      type: "more-info",
                      data: options55,
                    }
                  : {
                      type: actionType,
                    },
              {
                pagePaths: set12,
                popupIds: new Set((arg621.customPopups || []).map((arg623) => arg623.id)),
              },
            )
              ? actionType
              : "none";
        ((v728.actions = {
          ...(v728.actions || {}),
        }),
          text54 === "none"
            ? v728.type === "camera" && actionTrigger2 === "tap"
              ? (v728.actions[actionTrigger2] = {
                  type: "none",
                })
              : delete v728.actions[actionTrigger2]
            : text54 === "navigate"
              ? (v728.actions[actionTrigger2] = {
                  type: "navigate",
                  target: v734,
                })
              : text54 === "more-info"
                ? (v728.actions[actionTrigger2] = {
                    type: "more-info",
                    data:
                      v728.actions?.[actionTrigger2]?.type === "more-info"
                        ? {
                            ...clone2(v728.actions[actionTrigger2].data || {}),
                            ...options55,
                          }
                        : options55,
                  })
                : (v728.actions[actionTrigger2] = {
                    type: text54,
                  }),
          !v730 &&
            text54 === "more-info" &&
            !v732 &&
            !v728.properties?.relatedEntities &&
            relatedPopupContext2(v728, rs(), as()) &&
            (v728.properties = {
              ...(v728.properties || {}),
              relatedEntities: manualRelatedEntityConfig2([]),
            }));
      });
  }),
    t.addEventListener("change", (arg624) => {
      const closest15 = arg624.target.closest(
          "[data-popup-source], [data-popup-entity], [data-popup-custom]",
        ),
        element242 = closest15?.closest("[data-action-trigger]");
      if (closest15 && element242 && w) {
        const actionTrigger3 = element242.dataset.actionTrigger;
        E((arg625) => {
          const v735 = findComponent2(arg625, w)?.component;
          if (!v735 || !["tap", "doubleTap", "hold"].includes(actionTrigger3)) return;
          const v736 = element242.querySelector("[data-popup-source]").value,
            options56 = {
              popupSource: v736,
            };
          (v736 === "entity" &&
            (options56.entityId = element242.querySelector("[data-popup-entity]").value),
            v736 === "custom" &&
              (options56.popupId = element242.querySelector("[data-popup-custom]").value),
            (v735.actions = {
              ...(v735.actions || {}),
              [actionTrigger3]: {
                type: "more-info",
                data: options56,
              },
            }));
        });
        return;
      }
      const closest16 = arg624.target.closest("[data-action-target]"),
        element243 = closest16?.closest("[data-action-trigger]"),
        w6 = w;
      if (!closest16 || !element243 || !w6) return;
      const actionTrigger4 = element243.dataset.actionTrigger;
      ["tap", "doubleTap", "hold"].includes(actionTrigger4) &&
        E((arg626) => {
          const v737 = findComponent2(arg626, w6)?.component;
          !v737 ||
            !arg626.pages.some((arg627) => arg627.path === closest16.value) ||
            ((v737.actions = {
              ...(v737.actions || {}),
              [actionTrigger4]: {
                type: "navigate",
                target: closest16.value,
              },
            }),
            v737.type === "navigation-button" &&
              (v737.properties = {
                ...(v737.properties || {}),
                targetPage: closest16.value,
              }));
        });
    }),
    t.addEventListener("click", (arg628) => {
      const closest17 = arg628.target.closest("[data-popup-preview]"),
        element244 = closest17?.closest("[data-action-trigger]"),
        f7 = F();
      if (!closest17 || !element244 || !f7 || closest17.disabled) return;
      if (Le !== "edit") {
        $(new Error("请切换到编辑模式后再预览弹窗。"));
        return;
      }
      const v738 = element244.querySelector("[data-popup-source]").value,
        options57 = {
          popupSource: v738,
        };
      (v738 === "entity" &&
        (options57.entityId = element244.querySelector("[data-popup-entity]").value),
        v738 === "custom" &&
          (options57.popupId = element244.querySelector("[data-popup-custom]").value));
      try {
        ps().previewAction(f7, {
          type: "more-info",
          data: options57,
        });
      } catch (v739) {
        $(v739);
      }
    }));
(document.addEventListener("click", (arg629) => {
  const closest18 = arg629.target.closest("[data-popup-entity-button]");
  if (closest18) {
    const closest19 = closest18.closest("[data-action-trigger]"),
      element245 = closest19?.querySelector("[data-popup-entity-menu]");
    if (!closest19 || !element245) return;
    const hidden4 = element245.hidden;
    if (
      (pl(hidden4 ? closest19 : null),
      (element245.hidden = !hidden4),
      closest18.setAttribute("aria-expanded", String(hidden4)),
      hidden4)
    ) {
      const selector51 = closest19.querySelector("[data-popup-entity-search]");
      ((selector51.value = ""),
        ml(closest19, ""),
        fl(closest19),
        window.requestAnimationFrame(() =>
          selector51.focus({
            preventScroll: true,
          }),
        ));
    }
    return;
  }
  const closest20 = arg629.target.closest("[data-popup-action-entity-id]");
  if (!closest20) return;
  const closest21 = closest20.closest("[data-action-trigger]"),
    element246 = closest21?.querySelector("[data-popup-entity]");
  !closest21 ||
    !element246 ||
    ((element246.value = closest20.dataset.popupActionEntityId),
    om(closest21),
    pl(),
    element246.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    ));
}),
  document.addEventListener("input", (arg630) => {
    const closest22 = arg630.target.closest("[data-popup-entity-search]"),
      v740 = closest22?.closest("[data-action-trigger]");
    !closest22 || !v740 || (ml(v740, closest22.value), fl(v740));
  }),
  tb.addEventListener("click", () => {
    const f8 = F(),
      text55 = f8?.bindings?.entity?.entityId || "";
    if (!(f8?.type !== "icon-button" || !text55))
      try {
        ps().showEntityDetails(f8, {
          preview: true,
        });
      } catch (v741) {
        $(v741);
      }
  }),
  Cu.addEventListener("click", () => {
    const f9 = F(),
      text56 = f9?.bindings?.entity?.entityId || "";
    if (!(f9?.type !== "air-conditioner" || !text56))
      try {
        ps().showEntityDetails(f9, {
          preview: true,
        });
      } catch (v742) {
        $(v742);
      }
  }),
  jf.addEventListener("click", (arg631) => {
    const closest23 = arg631.target.closest("[data-image-layout]"),
      w7 = w;
    if (!closest23 || !w7) return;
    const text57 = closest23.dataset.imageLayout === "fill" ? "fill" : "free",
      f10 = F(),
      text58 = f10?.properties?.layoutMode === "fill" ? "fill" : "free";
    !f10 ||
      f10.type !== "image" ||
      text58 === text57 ||
      E((arg632) => {
        const element247 = findComponent2(arg632, w7)?.component;
        if (!element247 || element247.type !== "image") return;
        if (
          ((element247.properties = {
            ...(element247.properties || {}),
            fit: "contain",
          }),
          (element247.style = {
            ...(element247.style || {}),
          }),
          text57 === "fill")
        ) {
          ((element247.properties.freeLayout = {
            position: clone2(element247.position || {}),
            scale: clampNumber2(Number(element247.style.scale || 1), 0.01, 5),
          }),
            (element247.properties.layoutMode = "fill"),
            (element247.position = {
              ...(element247.position || {}),
              x: 0,
              y: 0,
              width: Number(arg632.canvas?.width || 2778),
              height: Number(arg632.canvas?.height || 1940),
              rotation: 0,
            }),
            (element247.style.scale = 1));
          return;
        }
        const freeLayout2 = element247.properties.freeLayout;
        if (((element247.properties.layoutMode = "free"), freeLayout2?.position))
          ((element247.position = clone2(freeLayout2.position)),
            (element247.style.scale = clampNumber2(Number(freeLayout2.scale || 1), 0.01, 5)));
        else {
          const v743 = Number(
              element247.properties.naturalWidth || element247.position?.width || 100,
            ),
            v744 = Number(
              element247.properties.naturalHeight || element247.position?.height || 100,
            ),
            v745 = Number(arg632.canvas?.width || 2778),
            v746 = Number(arg632.canvas?.height || 1940);
          ((element247.position = {
            ...(element247.position || {}),
            x: (v745 - v743) / 2,
            y: (v746 - v744) / 2,
            width: v743,
            height: v744,
            rotation: 0,
          }),
            (element247.style.scale = 1));
        }
        delete element247.properties.freeLayout;
      });
  }),
  Sr.addEventListener("input", (arg633) => {
    const f11 = F();
    if (!f11 || f11.type !== "image") return;
    const target2 = arg633.target;
    if (String(target2.value).trim() === "") return;
    const v747 = Number(target2.value);
    if (!Number.isFinite(v747)) return;
    const v748 = Number(g.document.canvas.width || 2778),
      v749 = Number(g.document.canvas.height || 1940),
      v750 = Number(f11.position?.width || 100),
      v751 = Number(f11.position?.height || 100);
    if (target2 === Lr) {
      const v752 = clampNumber2(v747, 0, 100);
      x?.previewComponentProperties(f11.id, {
        opacity: v752 / 100,
      });
    } else {
      if (target2 === Po) {
        const v753 = clampNumber2(v747, 0, 100);
        x?.previewComponentTransform(f11.id, {
          x: (v748 * v753) / 100 - v750 / 2,
        });
      } else {
        if (target2 === ko) {
          const v754 = clampNumber2(v747, 0, 100);
          x?.previewComponentTransform(f11.id, {
            y: (v749 * v754) / 100 - v751 / 2,
          });
        } else {
          if (target2 === Rn) {
            const v755 = clampNumber2(v747, 1, 500);
            x?.previewComponentTransform(f11.id, {
              scale: v755 / 100,
            });
          } else {
            if (target2 === Mo) {
              const v756 = clampNumber2(v747, -360, 360);
              x?.previewComponentTransform(f11.id, {
                rotation: v756,
              });
            }
          }
        }
      }
    }
  }),
  Sr.addEventListener("change", (arg634) => {
    const target3 = arg634.target,
      w8 = w;
    if (!(!w8 || ![Js, Lr, Po, ko, Rn, Mo].includes(target3))) {
      if (
        [Lr, Po, ko, Rn, Mo].includes(target3) &&
        (String(target3.value).trim() === "" || !Number.isFinite(Number(target3.value)))
      ) {
        J();
        return;
      }
      E((arg635) => {
        const element248 = findComponent2(arg635, w8)?.component;
        if (!element248 || element248.type !== "image") return;
        ((element248.properties = {
          ...(element248.properties || {}),
        }),
          (element248.position = {
            ...(element248.position || {}),
          }),
          (element248.style = {
            ...(element248.style || {}),
          }),
          (element248.bindings = {
            ...(element248.bindings || {}),
          }),
          (element248.actions = {
            ...(element248.actions || {}),
          }),
          (element248.properties.fit = "contain"));
        const v757 = Number(arg635.canvas.width || 2778),
          v758 = Number(arg635.canvas.height || 1940),
          v759 = Number(target3.value);
        target3 === Js
          ? (element248.properties.label = target3.value.trim())
          : target3 === Lr
            ? (element248.properties.opacity = clampNumber2(v759, 0, 100) / 100)
            : target3 === Po
              ? (element248.position.x =
                  (v757 * clampNumber2(v759, 0, 100)) / 100 -
                  Number(element248.position.width || 100) / 2)
              : target3 === ko
                ? (element248.position.y =
                    (v758 * clampNumber2(v759, 0, 100)) / 100 -
                    Number(element248.position.height || 100) / 2)
                : target3 === Rn
                  ? (element248.style.scale = clampNumber2(v759, 1, 500) / 100)
                  : target3 === Mo && Lt(arg635, w8, clampNumber2(v759, -360, 360));
      });
    }
  }));
const fm = new Set([Ar, Pr, kr, Mr, Or, Br]);
(vd.addEventListener("input", (arg636) => {
  const f12 = F(),
    target4 = arg636.target;
  if (!f12 || f12.type !== "floorplan-auto-diagram" || !fm.has(target4)) return;
  const v760 = Number(target4.value);
  if (!Number.isFinite(v760)) return;
  const v761 = Number(g.document.canvas.width || 2778),
    v762 = Number(g.document.canvas.height || 1940),
    v763 = Number(f12.position?.width || 100),
    v764 = Number(f12.position?.height || 100);
  target4 === Ar
    ? x?.previewComponentTransform(f12.id, {
        x: (v761 * clampNumber2(v760, 0, 100)) / 100 - v763 / 2,
      })
    : target4 === Pr
      ? x?.previewComponentTransform(f12.id, {
          y: (v762 * clampNumber2(v760, 0, 100)) / 100 - v764 / 2,
        })
      : target4 === kr
        ? x?.previewComponentTransform(f12.id, {
            width: (v761 * clampNumber2(v760, 0.1, 100)) / 100,
          })
        : target4 === Mr
          ? x?.previewComponentTransform(f12.id, {
              height: (v762 * clampNumber2(v760, 0.1, 100)) / 100,
            })
          : target4 === Or
            ? x?.previewComponentTransform(f12.id, {
                scale: clampNumber2(v760, 1, 500) / 100,
              })
            : target4 === Br &&
              x?.previewComponentTransform(f12.id, {
                rotation: clampNumber2(v760, -360, 360),
              });
}),
  vd.addEventListener("change", (arg637) => {
    const target5 = arg637.target,
      w9 = w;
    if (!(!w9 || ![wd, Tr, ...fm].includes(target5))) {
      if (fm.has(target5) && !Number.isFinite(Number(target5.value))) {
        J();
        return;
      }
      E((arg638) => {
        const element249 = findComponent2(arg638, w9)?.component;
        if (!(!element249 || element249.type !== "floorplan-auto-diagram")) {
          if (
            ((element249.properties = {
              ...(element249.properties || {}),
            }),
            (element249.position = {
              ...(element249.position || {}),
            }),
            (element249.style = {
              ...(element249.style || {}),
            }),
            target5 === wd)
          )
            element249.properties.label = target5.value.trim();
          else {
            if (target5 === Tr) element249.properties.exportFolder = target5.value.trim();
            else {
              const v765 = Number(arg638.canvas.width || 2778),
                v766 = Number(arg638.canvas.height || 1940),
                v767 = Number(target5.value);
              target5 === Ar
                ? (element249.position.x =
                    (v765 * clampNumber2(v767, 0, 100)) / 100 -
                    Number(element249.position.width || 100) / 2)
                : target5 === Pr
                  ? (element249.position.y =
                      (v766 * clampNumber2(v767, 0, 100)) / 100 -
                      Number(element249.position.height || 100) / 2)
                  : target5 === kr
                    ? (element249.position.width = (v765 * clampNumber2(v767, 0.1, 100)) / 100)
                    : target5 === Mr
                      ? (element249.position.height = (v766 * clampNumber2(v767, 0.1, 100)) / 100)
                      : target5 === Or
                        ? (element249.style.scale = clampNumber2(v767, 1, 500) / 100)
                        : target5 === Br && Lt(arg638, w9, clampNumber2(v767, -360, 360));
            }
          }
        }
      });
    }
  }),
  qf.addEventListener("click", (arg639) => {
    const closest24 = arg639.target.closest("[data-floorplan-layout]"),
      w10 = w;
    !closest24 ||
      !w10 ||
      E((arg640) => {
        const v768 = findComponent2(arg640, w10)?.component;
        v768?.type === "floorplan-auto-diagram" &&
          (v768.properties = {
            ...(v768.properties || {}),
            layoutMode: closest24.dataset.floorplanLayout === "fill" ? "fill" : "free",
          });
      });
  }));
function ys(arg641, arg642, v769 = null) {
  const selector52 = document.querySelector(
    '.hb-component[data-component-id="' +
      CSS.escape(arg641) +
      '"] .hb-floorplan-auto-diagram-preview',
  );
  return selector52?.contentWindow
    ? (selector52.contentWindow.postMessage(
        {
          type: "ha-bridge-floorplan-auto-diagram-camera",
          componentId: arg641,
          command: arg642,
          value: v769,
        },
        window.location.origin,
      ),
      true)
    : false;
}
function ZL(arg643, arg644) {
  const selector53 = document.querySelector(
    '.hb-component[data-component-id="' +
      CSS.escape(arg643) +
      '"] .hb-floorplan-auto-diagram-preview',
  );
  return selector53?.contentWindow
    ? (selector53.contentWindow.postMessage(
        {
          type: "ha-bridge-floorplan-auto-diagram-floor",
          componentId: arg643,
          command: "set-floor",
          value: arg644,
        },
        window.location.origin,
      ),
      true)
    : false;
}
function eI(arg645) {
  if (!arg645?.isConnected) return;
  const closest25 = arg645.closest(".hb-floorplan-auto-diagram");
  if (!closest25) return;
  arg645.classList.remove("is-ready");
  let selector54 = closest25.querySelector(".hb-floorplan-auto-diagram-loading");
  selector54 ||
    ((selector54 = document.createElement("div")),
    (selector54.className = "hb-floorplan-auto-diagram-loading"),
    (selector54.innerHTML = '<i aria-hidden="true"></i><strong>正在重新载入3D户型…</strong>'),
    closest25.append(selector54));
  const uRL3 = new URL(arg645.src, window.location.origin);
  (uRL3.searchParams.set("auto-diagram-refresh", String(Date.now())),
    (arg645.src = uRL3.toString()));
}
(window.addEventListener("pageshow", (arg646) => {
  if (arg646.persisted) {
    for (const v770 of document.querySelectorAll(".hb-floorplan-auto-diagram-preview")) eI(v770);
  }
}),
  Uf.addEventListener("click", (arg647) => {
    const closest26 = arg647.target.closest("[data-floorplan-camera-view]"),
      w11 = w;
    if (!closest26 || !w11) return;
    const text59 = closest26.dataset.floorplanCameraView === "top" ? "top" : "free";
    (E((arg648) => {
      const v771 = findComponent2(arg648, w11)?.component;
      v771?.type === "floorplan-auto-diagram" &&
        (v771.properties = {
          ...(v771.properties || {}),
          cameraView: text59,
        });
    }),
      ys(w11, "set-view", text59));
  }),
  gn.addEventListener("change", () => {
    const w12 = w,
      v772 = String(gn.value || ""),
      f13 = F();
    !w12 ||
      !v772 ||
      f13?.type !== "floorplan-auto-diagram" ||
      (E((arg649) => {
        const v773 = findComponent2(arg649, w12)?.component;
        v773?.type === "floorplan-auto-diagram" &&
          (v773.properties = {
            ...(v773.properties || {}),
            floorSelection: v772,
          });
      }),
      ZL(w12, v772),
      ys(w12, "restore", {
        view: f13.properties?.cameraView || "free",
        mode: f13.properties?.cameraMode || "orthographic",
        topRotation: Number(f13.properties?.cameraTopRotation || 0),
        focalLength: Number(f13.properties?.cameraFocalLength || 50),
      }));
  }),
  Gf.addEventListener("click", (arg650) => {
    const closest27 = arg650.target.closest("[data-floorplan-camera-mode]"),
      w13 = w;
    if (!closest27 || !w13) return;
    const text60 =
      closest27.dataset.floorplanCameraMode === "perspective" ? "perspective" : "orthographic";
    (E((arg651) => {
      const v774 = findComponent2(arg651, w13)?.component;
      v774?.type === "floorplan-auto-diagram" &&
        (v774.properties = {
          ...(v774.properties || {}),
          cameraMode: text60,
        });
    }),
      ys(w13, "set-mode", text60));
  }),
  $r.addEventListener("change", () => {
    const w14 = w;
    if (!w14 || String($r.value).trim() === "") return J();
    const v775 = clampNumber2(Number($r.value), 18, 120);
    (E((arg652) => {
      const v776 = findComponent2(arg652, w14)?.component;
      v776?.type === "floorplan-auto-diagram" &&
        (v776.properties = {
          ...(v776.properties || {}),
          cameraFocalLength: v775,
        });
    }),
      ys(w14, "set-focal-length", v775));
  }),
  _f.addEventListener("click", () => {
    const w15 = w;
    w15 &&
      (E((arg653) => {
        const v777 = findComponent2(arg653, w15)?.component;
        v777?.type === "floorplan-auto-diagram" &&
          (v777.properties = {
            ...(v777.properties || {}),
            cameraView: "top",
            cameraTopRotation: (Number(v777.properties?.cameraTopRotation || 0) + 90) % 360,
          });
      }),
      ys(w15, "rotate-top"));
  }));
function gm(v778 = Dr) {
  return v778
    ? document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(v778) +
          '"] .hb-floorplan-auto-diagram-preview',
      )
    : null;
}
function vs(arg654, v779 = null) {
  const gm2 = gm();
  return gm2?.contentWindow
    ? (gm2.contentWindow.postMessage(
        {
          type: "ha-bridge-floorplan-auto-diagram-base-lighting",
          componentId: Dr,
          command: arg654,
          ...(v779
            ? {
                lighting: v779,
              }
            : {}),
        },
        window.location.origin,
      ),
      true)
    : false;
}
function hm(arg655) {
  const v780 = normalizeBaseLighting2(arg655);
  for (const element250 of Cd) {
    const v781 = v780[element250.dataset.floorplanBaseLight];
    element250.value =
      element250.step === "5" ? String(Math.round(v781)) : String(Number(v781.toFixed(2)));
  }
  return v780;
}
function Xw() {
  const options58 = {};
  for (const element251 of Cd)
    options58[element251.dataset.floorplanBaseLight] = Number(element251.value);
  return normalizeBaseLighting2(options58);
}
function tI({ cancelPreview: v782 = true } = {}) {
  We.hidden ||
    (v782 && vs("cancel"),
    (We.hidden = true),
    We.setAttribute("aria-busy", "false"),
    (Dr = ""),
    (Ot = null));
}
function nI(arg656) {
  const gm3 = gm(arg656);
  if (!arg656 || !gm3?.contentWindow) return;
  ((Dr = arg656),
    gm3.classList.remove("is-position-mode"),
    gm3.classList.add("is-view-mode"),
    E((arg657) => {
      const v783 = findComponent2(arg657, arg656)?.component;
      v783?.type === "floorplan-auto-diagram" &&
        (v783.properties = {
          ...(v783.properties || {}),
          interactionMode: "view",
        });
    }),
    hm(Sd),
    (Ei.textContent = "正在读取当前光照设置…"),
    (We.hidden = false),
    We.setAttribute("aria-busy", "true"));
  const boundingClientRect20 = We.getBoundingClientRect();
  ((boundingClientRect20.right > window.innerWidth - 8 ||
    boundingClientRect20.bottom > window.innerHeight - 8 ||
    boundingClientRect20.left < 8 ||
    boundingClientRect20.top < 8) &&
    ((We.style.right = "auto"),
    (We.style.left =
      clampNumber2(
        boundingClientRect20.left,
        8,
        Math.max(8, window.innerWidth - boundingClientRect20.width - 8),
      ) + "px"),
    (We.style.top =
      clampNumber2(
        boundingClientRect20.top,
        8,
        Math.max(8, window.innerHeight - boundingClientRect20.height - 8),
      ) + "px")),
    vs("request-state"));
}
Yf.addEventListener("click", () => {
  nI(w);
});
for (const t of Cd)
  t.addEventListener("input", () => {
    We.hidden ||
      ((Ei.textContent = "修改已实时预览，保存后同步到全部3D入口。"), vs("preview", Xw()));
  });
(x1.addEventListener("click", () => {
  (hm(DEFAULT_BASE_LIGHTING2), (Ei.textContent = "已预览默认光照，点击保存后生效。"), vs("reset"));
}),
  N1.addEventListener("click", () => {
    ((Ei.textContent = "正在保存并同步…"), We.setAttribute("aria-busy", "true"), vs("save", Xw()));
  }),
  S1.addEventListener("click", () => tI()),
  Fr.addEventListener("pointerdown", (arg658) => {
    if (arg658.button !== 0 || arg658.target.closest("button")) return;
    const boundingClientRect21 = We.getBoundingClientRect();
    Ot = {
      pointerId: arg658.pointerId,
      startX: arg658.clientX,
      startY: arg658.clientY,
      startLeft: boundingClientRect21.left,
      startTop: boundingClientRect21.top,
    };
    try {
      Fr.setPointerCapture(arg658.pointerId);
    } catch {}
  }),
  Fr.addEventListener("pointermove", (arg659) => {
    if (!Ot || arg659.pointerId !== Ot.pointerId) return;
    arg659.preventDefault();
    const boundingClientRect22 = We.getBoundingClientRect(),
      max37 = Math.max(8, window.innerWidth - boundingClientRect22.width - 8),
      max38 = Math.max(8, window.innerHeight - boundingClientRect22.height - 8);
    ((We.style.right = "auto"),
      (We.style.left = clampNumber2(Ot.startLeft + arg659.clientX - Ot.startX, 8, max37) + "px"),
      (We.style.top = clampNumber2(Ot.startTop + arg659.clientY - Ot.startY, 8, max38) + "px"));
  }));
const Kw = (arg660) => {
  !Ot || arg660.pointerId !== Ot.pointerId || (Ot = null);
};
(Fr.addEventListener("pointerup", Kw), Fr.addEventListener("pointercancel", Kw));
function Jw() {
  (St.open && St.close(),
    (St.dataset.componentId = ""),
    (St.dataset.cancelRemovesComponent = "false"),
    (Kf.hidden = false));
}
function Qw(arg661, { cancelRemovesComponent: v784 = false } = {}) {
  arg661 &&
    ((St.dataset.componentId = arg661),
    (St.dataset.cancelRemovesComponent = String(v784)),
    (Kf.hidden = false),
    St.open || St.showModal());
}
function bm() {
  const componentId = St.dataset.componentId,
    v785 = St.dataset.cancelRemovesComponent === "true";
  (Jw(),
    !(!v785 || !componentId) &&
      (B.delete(componentId),
      w === componentId && (w = B.values().next().value || null),
      xe === componentId && (xe = w),
      E((arg662) => {
        Ap(arg662, componentId);
      })));
}
(Mt.addEventListener("click", () => {
  const f14 = F();
  if (f14?.type !== "floorplan-auto-diagram") return;
  if (f14.properties?.generated === true && f14.properties?.previewing !== true) {
    E((arg663) => {
      const v786 = findComponent2(arg663, f14.id)?.component;
      v786?.type === "floorplan-auto-diagram" &&
        (v786.properties = {
          ...(v786.properties || {}),
          previewReady: true,
          previewing: true,
          interactionMode: "position",
        });
    });
    return;
  }
  const selector55 = document.querySelector(
    '.hb-component[data-component-id="' +
      CSS.escape(f14.id) +
      '"] .hb-floorplan-auto-diagram-preview',
  );
  if (!selector55?.contentWindow) {
    Qw(f14.id);
    return;
  }
  const trim10 = String(f14.properties?.exportFolder || "").trim();
  if (
    !trim10 ||
    /[<>:"/\\|?*\x00-\x1f\x7f]/.test(trim10) ||
    trim10.startsWith(".") ||
    /[. ]$/.test(trim10)
  ) {
    ((Hn.textContent = "请先填写有效的导图文件夹名称。"), Tr.focus());
    return;
  }
  const options59 = f14.position || {},
    options60 = g.document.canvas || {},
    v787 = floorplanAutoDiagramExportResolution2(options59, options60);
  ((Hn.textContent = "正在后台生成底图和灯组效果，请稍候…"),
    (Mt.disabled = true),
    (gn.disabled = true),
    (Mt.textContent = "正在后台生成…"),
    selector55.contentWindow.postMessage(
      {
        type: "ha-bridge-floorplan-auto-diagram-generate",
        componentId: f14.id,
        width: v787.width,
        height: v787.height,
        folderName: trim10,
      },
      window.location.origin,
    ));
}),
  Ir.addEventListener("click", () => {
    const w16 = w;
    w16 &&
      E((arg664) => {
        const v788 = findComponent2(arg664, w16)?.component;
        v788?.type === "floorplan-auto-diagram" &&
          (v788.properties = {
            ...(v788.properties || {}),
            interactionMode: v788.properties?.interactionMode === "view" ? "position" : "view",
          });
      });
  }),
  L1.addEventListener("click", bm),
  I1.addEventListener("click", bm),
  St.addEventListener("cancel", (arg665) => {
    (arg665.preventDefault(), bm());
  }),
  T1.addEventListener("click", () => {
    const componentId2 = St.dataset.componentId;
    componentId2 &&
      (E((arg666) => {
        const v789 = findComponent2(arg666, componentId2)?.component;
        v789?.type === "floorplan-auto-diagram" &&
          (v789.properties = {
            ...(v789.properties || {}),
            previewReady: true,
            previewing: true,
            interactionMode: "position",
          });
      }),
      Jw());
  }),
  Xf.addEventListener("change", (arg667) => {
    const closest28 = arg667.target.closest("[data-floorplan-light-group-id]"),
      w17 = w;
    if (!closest28 || !w17) return;
    const floorplanLightGroupId = closest28.dataset.floorplanLightGroupId;
    E((arg668) => {
      const v790 = findComponent2(arg668, w17)?.component;
      if (!v790 || v790.type !== "floorplan-auto-diagram") return;
      v790.bindings = {
        ...(v790.bindings || {}),
      };
      const v791 = "lightGroup:" + floorplanLightGroupId;
      closest28.value
        ? (v790.bindings[v791] = {
            entityId: closest28.value,
          })
        : delete v790.bindings[v791];
    });
  }));
function oI() {
  const zr2 = zr;
  zr2 && ((zr = null), zr2.remove());
}
function iI(arg669, { buttonCount: v792 = 0, imageCount: v793 = 0 } = {}) {
  oI();
  const v794 = arg669?.overwritten === true,
    element252 = document.createElement("div");
  ((element252.className = "floorplan-auto-diagram-complete-overlay"),
    element252.setAttribute("role", "dialog"),
    element252.setAttribute("aria-modal", "true"),
    element252.setAttribute("aria-label", v794 ? "导图覆盖完成" : "导图保存完成"),
    (element252.innerHTML =
      '<section class="settings-dialog floorplan-auto-diagram-dialog floorplan-auto-diagram-complete-dialog" tabindex="-1"><div class="dialog-heading"><div><span>EXPORT COMPLETE</span><h2 data-export-complete-title></h2></div><button type="button" class="icon-button" data-export-complete-close aria-label="关闭导图完成提示">×</button></div>\n    <div class="floorplan-auto-diagram-guide">\n      <p data-export-complete-message></p>\n      <div class="export-notice-summary"><span>保存位置</span><strong data-export-complete-path></strong></div>\n      <div class="dialog-actions"><button type="button" class="primary" data-export-complete-confirm>完成</button></div>\n    </div></section>'),
    (element252.querySelector("[data-export-complete-title]").textContent = v794
      ? "导图覆盖完成"
      : "导图保存完成"),
    (element252.querySelector("[data-export-complete-message]").textContent = v794
      ? "新导图已安全替换，并更新 " + v793 + " 张图片和 " + v792 + " 个效果按钮。"
      : "导图已置入仪表盘，共生成 " + v793 + " 张图片和 " + v792 + " 个效果按钮。"),
    (element252.querySelector("[data-export-complete-path]").textContent =
      "data/" + (arg669?.relativePath || "exports")));
  let v795 = false;
  const v796 = () => {
      v795 ||
        ((v795 = true),
        window.removeEventListener("pagehide", v796),
        document.removeEventListener("keydown", v797, true),
        element252.remove(),
        zr === element252 && (zr = null));
    },
    v797 = (arg670) => {
      arg670.key === "Escape" && (arg670.preventDefault(), v796());
    };
  element252.addEventListener("click", (arg671) => {
    arg671.target === element252 && v796();
  });
  for (const element253 of element252.querySelectorAll(
    "[data-export-complete-close], [data-export-complete-confirm]",
  ))
    element253.addEventListener("click", v796);
  (window.addEventListener("pagehide", v796),
    document.addEventListener("keydown", v797, true),
    (zr = element252),
    document.body.append(element252),
    element252.querySelector("[data-export-complete-confirm]")?.focus());
}
window.addEventListener("message", (arg672) => {
  if (arg672.origin !== window.location.origin) return;
  const data = arg672.data;
  if (data?.type === "ha-bridge-floorplan-auto-diagram-base-lighting-state") {
    const v798 = String(data.componentId || ""),
      gm4 = gm(v798);
    if (!gm4 || arg672.source !== gm4.contentWindow || v798 !== Dr) return;
    ((data.status === "ready" || data.status === "saved") &&
      ((Sd = normalizeBaseLighting2(data.savedLighting || data.lighting)), hm(data.lighting || Sd)),
      We.setAttribute("aria-busy", "false"),
      data.status === "saved"
        ? (Ei.textContent = "已保存，并同步到实时预览、手动导图和自动导图。")
        : data.status === "ready" && (Ei.textContent = "修改会实时同步到当前3D预览。"));
    return;
  }
  if (data?.type === "ha-bridge-floorplan-auto-diagram-ready") {
    const v799 = String(data.componentId || ""),
      selector56 = document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(v799) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!selector56 || arg672.source !== selector56.contentWindow) return;
    (selector56.classList.add("is-ready"),
      selector56.parentElement?.querySelector(".hb-floorplan-auto-diagram-loading")?.remove());
    const v800 = findComponent2(g?.document, v799)?.component;
    if (v800?.type === "floorplan-auto-diagram") {
      const filter22 = (Array.isArray(data.floors) ? data.floors : [])
          .map((arg673) => ({
            id: String(arg673?.id || ""),
            name: String(arg673?.name || ""),
          }))
          .filter((arg674) => arg674.id),
        v801 = String(data.floorSelection || "");
      yp.set(v799, {
        floors: filter22,
        selected: v801,
      });
      const options61 = v800.properties || {};
      (Object.prototype.hasOwnProperty.call(options61, "floorSelection") &&
        v801 &&
        options61.floorSelection !== v801 &&
        E((arg675) => {
          const v802 = findComponent2(arg675, v799)?.component;
          v802?.type === "floorplan-auto-diagram" &&
            (v802.properties = {
              ...(v802.properties || {}),
              floorSelection: v801,
            });
        }),
        J(),
        selector56.contentWindow.postMessage(
          {
            type: "ha-bridge-floorplan-auto-diagram-camera",
            componentId: v799,
            command: "restore",
            value: {
              view: v800.properties?.cameraView || "free",
              mode: v800.properties?.cameraMode || "orthographic",
              topRotation: Number(v800.properties?.cameraTopRotation || 0),
              focalLength: Number(v800.properties?.cameraFocalLength || 50),
            },
          },
          window.location.origin,
        ));
    }
    return;
  }
  if (data?.type === "ha-bridge-floorplan-auto-diagram-floor-state") {
    const v803 = String(data.componentId || ""),
      selector57 = document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(v803) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!selector57 || arg672.source !== selector57.contentWindow) return;
    const filter23 = (Array.isArray(data.floors) ? data.floors : [])
        .map((arg676) => ({
          id: String(arg676?.id || ""),
          name: String(arg676?.name || ""),
        }))
        .filter((arg677) => arg677.id),
      v804 = String(data.floorSelection || "");
    yp.set(v803, {
      floors: filter23,
      selected: v804,
    });
    const v805 = findComponent2(g?.document, v803)?.component;
    (v805?.type === "floorplan-auto-diagram" &&
      v804 &&
      v805.properties?.floorSelection !== v804 &&
      E((arg678) => {
        const v806 = findComponent2(arg678, v803)?.component;
        v806?.type === "floorplan-auto-diagram" &&
          (v806.properties = {
            ...(v806.properties || {}),
            floorSelection: v804,
          });
      }),
      v803 === w && J());
    return;
  }
  if (data?.type === "ha-bridge-floorplan-auto-diagram-stopped") {
    const v807 = String(data.componentId || ""),
      selector58 = document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(v807) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!selector58 || arg672.source !== selector58.contentWindow) return;
    ((Mt.disabled = false),
      v807 === w && (gn.disabled = false),
      (Mt.textContent = "确定位置大小并后台生成"),
      (Hn.textContent = data.message || "已停止本次生成。"),
      data.reason === "rename" && Tr.focus());
    return;
  }
  if (data?.type === "ha-bridge-floorplan-auto-diagram-error") {
    const v808 = String(data.componentId || ""),
      selector59 = document.querySelector(
        '.hb-component[data-component-id="' +
          CSS.escape(v808) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!selector59 || arg672.source !== selector59.contentWindow) return;
    ((Mt.disabled = false),
      v808 === w && (gn.disabled = false),
      (Mt.textContent = "确定位置大小并后台生成"),
      (Hn.textContent = data.message || "后台生成失败，请重试。"));
    return;
  }
  if (!data || data.type !== "ha-bridge-floorplan-auto-diagram-export") return;
  const v809 = String(data.componentId || ""),
    selector60 = document.querySelector(
      '.hb-component[data-component-id="' +
        CSS.escape(v809) +
        '"] .hb-floorplan-auto-diagram-preview',
    );
  if (!selector60 || arg672.source !== selector60.contentWindow) return;
  const manifest = data.manifest,
    trim11 = String(data.folderName || manifest?.exportName || "").trim(),
    options62 = data.saved || {
      relativePath: "exports/" + trim11,
      overwritten: false,
    };
  if (!v809 || !manifest || !trim11) return;
  ((Mt.disabled = false),
    (Mt.textContent = "确定位置大小并后台生成"),
    (Hn.textContent = "已生成，正在置换到仪表盘…"));
  const closest29 = selector60.closest(".hb-component");
  (closest29 && (closest29.hidden = true),
    E(
      (arg679) => {
        let v810 = findComponentLocation2(arg679, v809);
        const v811 = v810?.component;
        if (!v811 || v811.type !== "floorplan-auto-diagram") return null;
        const scope2 = v810.scope,
          root = scope2 === "shared" && v810.root,
          sharedComponents2 =
            scope2 === "shared"
              ? arg679.sharedComponents
              : v810.page?.components || v810.collection,
          list41 = [],
          v812 = (arg680) => {
            for (const v813 of arg680 || [])
              (v813?.properties?.autoDiagramFolder === trim11 && list41.push(v813),
                v812(v813?.children));
          };
        v812(sharedComponents2);
        const map30 = new Map(
            list41
              .filter((arg681) => arg681.type === "image")
              .map((arg682) => [
                arg682.properties?.autoDiagramRole === "base"
                  ? "background-with-plan"
                  : String(arg682.properties?.autoDiagramRole || ""),
                arg682,
              ]),
          ),
          map31 = new Map(
            list41
              .filter((arg683) => arg683.type === "icon-button-effect")
              .map((arg684) => {
                const v814 = String(arg684.properties?.autoDiagramRole || "light-group"),
                  v815 = String(
                    arg684.properties?.autoDiagramLayerId ||
                      arg684.properties?.autoDiagramGroupId ||
                      "",
                  );
                return [v814 + ":" + v815, arg684];
              }),
          );
        for (const v816 of list41) Ap(arg679, v816.id);
        if (((v810 = findComponentLocation2(arg679, v809)), !v810)) return null;
        const v817 = Number(arg679.canvas?.width || 2778),
          v818 = Number(arg679.canvas?.height || 1940),
          max39 = Math.max(1, Number(manifest.resolution?.width || v811.position?.width || 1)),
          max40 = Math.max(1, Number(manifest.resolution?.height || v811.position?.height || 1)),
          text61 = v811.properties?.layoutMode === "fill" ? "fill" : "free",
          options63 = v811.position || {},
          num34 =
            text61 === "fill" ? 1 : Math.max(0.01, Math.min(5, Number(v811.style?.scale || 1))),
          v819 = text61 === "fill" ? v817 : Number(options63.width || 100),
          v820 = text61 === "fill" ? v818 : Number(options63.height || 100),
          v821 = v819 * num34,
          v822 = v820 * num34,
          num35 = text61 === "fill" ? 0 : Number(options63.x || 0) - (v821 - v819) / 2,
          num36 = text61 === "fill" ? 0 : Number(options63.y || 0) - (v822 - v820) / 2,
          num37 = text61 === "fill" ? 0 : Number(options63.rotation || 0),
          map32 = [
            {
              role: "background",
              file: manifest.backgroundImage,
              label: "00底图",
              visible: true,
            },
            {
              role: "floor-plan",
              file: manifest.floorPlanImage,
              label: "00户型图",
              visible: true,
            },
            {
              role: "background-with-plan",
              file: manifest.baseImage,
              label: "00底图带户型",
              visible: false,
            },
          ]
            .filter((arg685) => arg685.file)
            .map((arg686) => {
              const v823 = map30.get(arg686.role),
                element254 = v823
                  ? clone2(v823)
                  : createComponentFromTemplate2("image", {
                      id: newId2("component"),
                      instanceName: arg686.label,
                      canvas: arg679.canvas,
                    });
              return (
                (element254.position = {
                  ...(element254.position || {}),
                  x: num35,
                  y: num36,
                  width: v821,
                  height: v822,
                  rotation: num37,
                }),
                (element254.style = {
                  ...(element254.style || {}),
                  scale: 1,
                  visible: v823 ? v823.style?.visible !== false : arg686.visible,
                }),
                (element254.bindings = {}),
                (element254.actions = {}),
                (element254.properties = {
                  ...(element254.properties || {}),
                  instanceName: arg686.label,
                  label: arg686.label,
                  assetId: "studio3d:" + trim11 + "/" + arg686.file,
                  naturalWidth: max39,
                  naturalHeight: max40,
                  opacity: 1,
                  fit: "contain",
                  layoutMode: text61,
                  autoDiagramFolder: trim11,
                  autoDiagramRole: arg686.role,
                  autoDiagramCamera: manifest.camera || null,
                }),
                element254
              );
            }),
          v824 = map32.find((arg687) => arg687.properties?.autoDiagramRole === "background"),
          v825 = map32.find((arg688) => arg688.properties?.autoDiagramRole === "floor-plan"),
          v826 = map32.find(
            (arg689) => arg689.properties?.autoDiagramRole === "background-with-plan",
          ),
          v827 = v826 || v825 || v824,
          map33 = (Array.isArray(manifest.groups) ? manifest.groups : [])
            .filter((arg690) => String(arg690?.id || arg690?.groupId || "") && arg690?.file)
            .map((arg691) => ({
              role: "light-group",
              id: String(arg691.id || arg691.groupId || ""),
              name: String(arg691.name || arg691.note || "灯组"),
              note: String(arg691.note || arg691.name || "灯组"),
              file: arg691.file,
              icon: "mdi:lightbulb-outline",
              anchor: arg691.anchor,
            })),
          map34 = (Array.isArray(manifest.screens) ? manifest.screens : [])
            .filter((arg692) => String(arg692?.id || arg692?.itemId || "") && arg692?.file)
            .map((arg693) => ({
              role: "television",
              id: String(arg693.id || arg693.itemId || ""),
              name: String(arg693.name || "电视画面"),
              note: String(arg693.name || "电视画面"),
              file: arg693.file,
              icon: "mdi:television",
              anchor: arg693.anchor,
            })),
          map35 = (Array.isArray(manifest.vehicles) ? manifest.vehicles : [])
            .filter((arg694) => String(arg694?.id || arg694?.itemId || "") && arg694?.file)
            .map((arg695) => ({
              role: "vehicle",
              id: String(arg695.id || arg695.itemId || ""),
              name: String(arg695.name || "汽车充电"),
              note: String(arg695.name || "汽车充电"),
              file: arg695.file,
              icon: "mdi:car-electric",
              anchor: arg695.anchor,
            })),
          list42 = [...map34, ...map35, ...map33],
          v828 = num35 + v821 / 2,
          v829 = num36 + v822 / 2,
          v830 = (num37 * Math.PI) / 180,
          min17 = Math.min(v821 / max39, v822 / max40),
          v831 = max39 * min17,
          v832 = max40 * min17,
          list43 = [],
          v833 = (arg696, arg697, arg698, arg699) => {
            const v834 = Number(arg696.anchor?.x),
              v835 = Number(arg696.anchor?.y),
              options64 = {
                x: list42.length > 1 ? (arg697 + 1) / (list42.length + 1) : 0.5,
                y: 0.9,
              },
              options65 =
                Number.isFinite(v834) && Number.isFinite(v835)
                  ? {
                      x: v834,
                      y: v835,
                    }
                  : options64,
              max41 = Math.max(0.035, (arg698 / Math.max(v831, 1)) * 1.08),
              max42 = Math.max(0.045, (arg699 / Math.max(v832, 1)) * 1.08),
              list44 = [[0, 0]];
            for (let num38 = 1; num38 <= 4; num38 += 1)
              list44.push(
                [0, -max42 * num38],
                [max41 * num38, 0],
                [0, max42 * num38],
                [-max41 * num38, 0],
                [max41 * num38, -max42 * num38],
                [max41 * num38, max42 * num38],
                [-max41 * num38, max42 * num38],
                [-max41 * num38, -max42 * num38],
              );
            let value13 = null;
            for (const [v836, v837] of list44) {
              const options66 = {
                x: clampNumber2(options65.x + v836, max41 / 2, 1 - max41 / 2),
                y: clampNumber2(options65.y + v837, max42 / 2, 1 - max42 / 2),
              };
              if (
                !list43.some(
                  (arg700) =>
                    Math.abs(options66.x - arg700.x) < (max41 + arg700.spacingX) / 2 &&
                    Math.abs(options66.y - arg700.y) < (max42 + arg700.spacingY) / 2,
                )
              ) {
                value13 = options66;
                break;
              }
            }
            return (
              (value13 ||= {
                x: clampNumber2(options64.x, max41 / 2, 1 - max41 / 2),
                y: clampNumber2(options64.y, max42 / 2, 1 - max42 / 2),
              }),
              list43.push({
                ...value13,
                spacingX: max41,
                spacingY: max42,
              }),
              value13
            );
          },
          map36 = list42.map((arg701, arg702) => {
            const v838 = map31.get(arg701.role + ":" + arg701.id),
              element255 = v838
                ? clone2(v838)
                : createComponentFromTemplate2("icon-button-effect", {
                    id: newId2("component"),
                    instanceName: arg701.name,
                    canvas: arg679.canvas,
                  }),
              vector2 = v838?.properties?.autoDiagramSceneAnchor,
              v839 =
                !vector2 ||
                Math.abs(Number(vector2.x) - Number(arg701.anchor?.x)) > 0.002 ||
                Math.abs(Number(vector2.y) - Number(arg701.anchor?.y)) > 0.002,
              v840 = !!v838 && Number(v838.properties?.autoDiagramLayoutVersion || 0) < sf,
              v841 = !v838 || v840 || (arg701.role === "light-group" && v839);
            let value14 = v838?.properties?.autoDiagramButtonAnchor || null;
            if (v841) {
              const v842 = Number(element255.position?.width || v817 * 0.075),
                v843 = Number(element255.position?.height || v842),
                max43 = Math.max(0.01, Math.min(5, Number(element255.style?.scale || 1)));
              value14 = v833(arg701, arg702, v842 * max43, v843 * max43);
              const v844 = -v831 / 2 + value14.x * v831,
                v845 = -v832 / 2 + value14.y * v832,
                v846 = v844 * Math.cos(v830) - v845 * Math.sin(v830),
                v847 = v844 * Math.sin(v830) + v845 * Math.cos(v830);
              element255.position = {
                ...(element255.position || {}),
                x: v828 + v846 - v842 / 2,
                y: v829 + v847 - v843 / 2,
                rotation: num37,
              };
            } else {
              if (Number.isFinite(Number(value14?.x)) && Number.isFinite(Number(value14?.y))) {
                const v848 = Number(element255.position?.width || v817 * 0.075),
                  v849 = Number(element255.position?.height || v848),
                  max44 = Math.max(0.01, Math.min(5, Number(element255.style?.scale || 1)));
                list43.push({
                  x: Number(value14.x),
                  y: Number(value14.y),
                  spacingX: Math.max(0.035, ((v848 * max44) / Math.max(v831, 1)) * 1.08),
                  spacingY: Math.max(0.045, ((v849 * max44) / Math.max(v832, 1)) * 1.08),
                });
              }
            }
            if (
              ((element255.style = {
                ...(element255.style || {}),
                visible: true,
              }),
              (element255.bindings = {
                ...(element255.bindings || {}),
              }),
              !v838 && arg701.role === "light-group")
            ) {
              const v850 = v811.bindings?.["lightGroup:" + arg701.id];
              v850?.entityId &&
                (element255.bindings.entity = {
                  entityId: v850.entityId,
                });
            }
            return (
              (element255.actions = Object.keys(element255.actions || {}).length
                ? {
                    ...(element255.actions || {}),
                  }
                : {
                    tap: {
                      type: "toggle",
                    },
                  }),
              (element255.properties = {
                ...(element255.properties || {}),
                instanceName: arg701.name,
                label: arg701.name,
                note: arg701.note,
                icon: v838?.properties?.icon || arg701.icon,
                effectAssetId: "studio3d:" + trim11 + "/" + arg701.file,
                effectNaturalWidth: max39,
                effectNaturalHeight: max40,
                effectReferenceImageId: v827?.id || "",
                effectLayoutMode: text61,
                effectLeft: (v828 / v817) * 100,
                effectTop: (v829 / v818) * 100,
                effectScale: 1,
                effectRotation: num37,
                autoDiagramFolder: trim11,
                autoDiagramRole: arg701.role,
                autoDiagramLayerId: arg701.id,
                autoDiagramSceneAnchor: arg701.anchor || null,
                autoDiagramButtonAnchor: value14,
                autoDiagramLayoutVersion: sf,
                ...(arg701.role === "light-group"
                  ? {
                      autoDiagramGroupId: arg701.id,
                    }
                  : {}),
              }),
              element255
            );
          }),
          filter24 = [v825, v824, v826].filter(Boolean),
          list45 = [...map36, ...filter24],
          index7 = v810.index;
        if (
          (v810.collection.splice(index7, 1, ...list45),
          applyCollectionLayerOrder2(v810.collection),
          root)
        ) {
          const map37 = list45.map((arg703) => arg703.id);
          for (const v851 of arg679.pages || []) {
            const list46 = v851.sharedComponentIds || [],
              indexOf6 = list46.indexOf(v809);
            indexOf6 < 0 ||
              (list46.splice(indexOf6, 1, ...map37),
              (v851.sharedComponentIds = [...new Set(list46)]));
          }
          syncSharedComponentReferenceOrder2(arg679);
        }
        return {
          removed: true,
          selectedId: (v824 || v825 || v826 || map36[0])?.id || null,
          buttonCount: map36.length,
          imageCount: filter24.length,
        };
      },
      W.value,
      {
        throwOnError: true,
      },
    )
      .then((arg704) => {
        if (!arg704?.removed) {
          (closest29?.isConnected && (closest29.hidden = false),
            (Hn.textContent = "图片已生成，但控件置换失败，请重试。"));
          return;
        }
        const selectedId = arg704.selectedId;
        ((w = selectedId),
          (B = selectedId ? new Set([selectedId]) : new Set()),
          (xe = selectedId),
          x?.setSelectedComponents(selectedId ? [selectedId] : [], selectedId),
          Xe(),
          J(),
          iI(options62, arg704));
      })
      .catch((arg705) => {
        (closest29?.isConnected && (closest29.hidden = false),
          (Hn.textContent = "图片已生成，但控件置换失败，请重试。"),
          $(arg705));
      }));
});
const Zw = new Map([
    [
      Nd,
      {
        property: "effectColorTemperatureRealtime",
        type: "boolean",
      },
    ],
    [
      Ed,
      {
        property: "effectBrightnessRealtime",
        type: "boolean",
      },
    ],
    [
      Id,
      {
        property: "iconOffColor",
      },
    ],
    [
      Td,
      {
        property: "iconOnColor",
      },
    ],
    [
      tg,
      {
        property: "iconSize",
        min: 1,
        max: 100,
      },
    ],
    [
      Ad,
      {
        property: "buttonOffColor",
      },
    ],
    [
      Pd,
      {
        property: "buttonOnColor",
      },
    ],
    [
      ng,
      {
        property: "buttonOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      og,
      {
        property: "frameColor",
      },
    ],
    [
      ig,
      {
        property: "frameWidth",
        min: 0,
        max: 20,
      },
    ],
    [
      rg,
      {
        property: "frameOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      ag,
      {
        property: "radius",
        min: 0,
        max: 50,
      },
    ],
    [
      sg,
      {
        property: "glowColor",
      },
    ],
    [
      kd,
      {
        property: "glowOffStrength",
        min: 0,
        max: 300,
        divisor: 100,
      },
    ],
    [
      Md,
      {
        property: "glowOnStrength",
        min: 0,
        max: 300,
        divisor: 100,
      },
    ],
    [
      lg,
      {
        property: "effectOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      dg,
      {
        property: "effectFadeDuration",
        min: 0,
        max: 3,
      },
    ],
    [
      Od,
      {
        property: "effectLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Bd,
      {
        property: "effectTop",
        min: -100,
        max: 200,
      },
    ],
    [
      $d,
      {
        property: "effectScale",
        min: 1,
        max: 500,
        divisor: 100,
      },
    ],
    [
      Fd,
      {
        property: "effectRotation",
        min: -360,
        max: 360,
      },
    ],
  ]),
  rI = new Map([
    [Id, "off"],
    [Ad, "off"],
    [kd, "off"],
    [Td, "on"],
    [Pd, "on"],
    [Md, "on"],
  ]),
  eC = new Set([jr, qr, Ii, Ti, Bo, Ai]);
function tC(arg706) {
  const v852 = rI.get(arg706),
    f15 = F();
  if (!(!v852 || f15?.type !== "icon-button-effect")) {
    (En.set(f15.id, v852), x?.setComponentPreviewState(f15.id, v852));
    for (const element256 of Ld.querySelectorAll("[data-ibe-preview]")) {
      const v853 = element256.dataset.ibePreview === v852;
      (element256.classList.toggle("active", v853),
        element256.setAttribute("aria-pressed", String(v853)));
    }
  }
}
for (const t of ["focusin", "pointerdown"]) Li.addEventListener(t, (arg707) => tC(arg707.target));
(Li.addEventListener("input", (arg708) => {
  const f16 = F();
  if (!f16 || f16.type !== "icon-button-effect") return;
  tC(arg708.target);
  const v854 = Zw.get(arg708.target);
  if (v854) {
    let checked2 =
      v854.type === "boolean"
        ? arg708.target.checked
        : arg708.target.type === "color"
          ? arg708.target.value
          : Number(arg708.target.value);
    if (v854.type !== "boolean" && arg708.target.type !== "color") {
      if (!Number.isFinite(checked2)) return;
      checked2 = clampNumber2(checked2, v854.min, v854.max) / (v854.divisor || 1);
    }
    x?.previewComponentProperties(f16.id, {
      [v854.property]: checked2,
    });
    return;
  }
  if (!eC.has(arg708.target) || !Number.isFinite(Number(arg708.target.value))) return;
  const v855 = Number(arg708.target.value),
    v856 = Number(g.document.canvas.width || 2778),
    v857 = Number(g.document.canvas.height || 1940),
    v858 = Number(f16.position?.width || 100),
    v859 = Number(f16.position?.height || 100);
  arg708.target === jr
    ? x?.previewComponentTransform(f16.id, {
        x: (v856 * clampNumber2(v855, 0, 100)) / 100 - v858 / 2,
      })
    : arg708.target === qr
      ? x?.previewComponentTransform(f16.id, {
          y: (v857 * clampNumber2(v855, 0, 100)) / 100 - v859 / 2,
        })
      : arg708.target === Ii
        ? x?.previewComponentTransform(f16.id, {
            width: (v856 * clampNumber2(v855, 0.1, 100)) / 100,
          })
        : arg708.target === Ti
          ? x?.previewComponentTransform(f16.id, {
              height: (v857 * clampNumber2(v855, 0.1, 100)) / 100,
            })
          : arg708.target === Bo
            ? x?.previewComponentTransform(f16.id, {
                scale: clampNumber2(v855, 1, 500) / 100,
              })
            : arg708.target === Ai &&
              x?.previewComponentTransform(f16.id, {
                rotation: clampNumber2(v855, -360, 360),
              });
}),
  Li.addEventListener("change", (arg709) => {
    const target6 = arg709.target,
      v860 = Zw.get(target6);
    if (!v860 && !eC.has(target6)) return;
    if (target6.type === "number" && !Number.isFinite(Number(target6.value))) {
      J();
      return;
    }
    const w18 = w;
    E((arg710) => {
      const element257 = findComponent2(arg710, w18)?.component;
      if (!element257 || element257.type !== "icon-button-effect") return;
      if (
        ((element257.properties = {
          ...(element257.properties || {}),
        }),
        (element257.position = {
          ...(element257.position || {}),
        }),
        (element257.style = {
          ...(element257.style || {}),
        }),
        v860)
      ) {
        element257.properties[v860.property] =
          v860.type === "boolean"
            ? target6.checked
            : target6.type === "color"
              ? target6.value
              : clampNumber2(Number(target6.value), v860.min, v860.max) / (v860.divisor || 1);
        return;
      }
      const v861 = Number(arg710.canvas.width || 2778),
        v862 = Number(arg710.canvas.height || 1940),
        v863 = Number(target6.value);
      target6 === jr
        ? (element257.position.x =
            (v861 * clampNumber2(v863, 0, 100)) / 100 -
            Number(element257.position.width || 100) / 2)
        : target6 === qr
          ? (element257.position.y =
              (v862 * clampNumber2(v863, 0, 100)) / 100 -
              Number(element257.position.height || 100) / 2)
          : target6 === Ii
            ? (element257.position.width = (v861 * clampNumber2(v863, 0.1, 100)) / 100)
            : target6 === Ti
              ? (element257.position.height = (v862 * clampNumber2(v863, 0.1, 100)) / 100)
              : target6 === Bo
                ? (element257.style.scale = clampNumber2(v863, 1, 500) / 100)
                : target6 === Ai && Lt(arg710, w18, clampNumber2(v863, -360, 360));
    });
  }),
  ug.addEventListener("click", (arg711) => {
    const closest30 = arg711.target.closest("[data-ibe-layout]"),
      w19 = w;
    !closest30 ||
      !w19 ||
      E((arg712) => {
        const v864 = findComponent2(arg712, w19)?.component;
        !v864 ||
          v864.type !== "icon-button-effect" ||
          (v864.properties = {
            ...(v864.properties || {}),
            effectLayoutMode: closest30.dataset.ibeLayout === "fill" ? "fill" : "free",
          });
      });
  }));
function aI(arg713) {
  const list47 = [],
    v865 = (arg714) => {
      for (const element258 of arg714 || [])
        (element258.type === "image" && list47.push(element258), v865(element258.children));
    };
  return (v865(arg713?.components), list47);
}
function sI(arg715, arg716) {
  const element259 = document.createElement("label");
  element259.className = "effect-image-align-option";
  const element260 = document.createElement("input");
  ((element260.type = "radio"),
    (element260.name = "effect-image-align-target"),
    (element260.value = arg715.id),
    (element260.checked = arg716));
  const element261 = document.createElement("span");
  element261.className = "effect-image-align-option-preview";
  const sn4 = sn(arg715.properties?.assetId || ""),
    kp2 = Kp(sn4);
  if (kp2) {
    const element262 = document.createElement("img");
    ((element262.src = kp2), (element262.alt = ""), element261.append(element262));
  } else element261.textContent = "无预览";
  const element263 = document.createElement("span");
  element263.className = "effect-image-align-option-copy";
  const element264 = document.createElement("strong");
  element264.textContent = componentLabel2(arg715);
  const element265 = document.createElement("small"),
    v866 = arg715.properties?.layoutMode === "fill",
    text62 = arg715.style?.visible === false ? "隐藏" : "显示",
    v867 = Number(g?.document?.canvas?.width || 2778),
    v868 = Number(g?.document?.canvas?.height || 1940),
    options67 = arg715.position || {},
    v869 = Number(options67.width || 100),
    v870 = Number(options67.height || 100),
    v871 = roundField2(((Number(options67.x || 0) + v869 / 2) / v867) * 100),
    v872 = roundField2(((Number(options67.y || 0) + v870 / 2) / v868) * 100),
    v873 = roundField2(Number(arg715.style?.scale || 1) * 100),
    v874 = roundField2(Number(options67.rotation || 0));
  element265.textContent = v866
    ? "铺满 · 覆盖整个画布"
    : "自由 · 左 " + v871 + "% · 上 " + v872 + "%";
  const element266 = document.createElement("small");
  return (
    (element266.textContent = v866
      ? text62
      : "缩放 " + v873 + "% · 旋转 " + v874 + "° · " + text62),
    element263.append(element264, element265, element266),
    element259.append(element260, element261, element263),
    element259
  );
}
function cI() {
  const f17 = F(),
    ct5 = ct();
  if (!f17 || f17.type !== "icon-button-effect" || !ct5) return;
  const aI2 = aI(ct5),
    v875 = String(f17.properties?.effectReferenceImageId || "");
  (mg.replaceChildren(
    ...aI2.map((arg717, arg718) => sI(arg717, arg717.id === v875 || (!v875 && arg718 === 0))),
  ),
    (pp = f17.id),
    (Zs.hidden = aI2.length > 0),
    (Zs.textContent = aI2.length ? "" : "本页面没有可以对齐的普通图片。"),
    (pg.disabled = aI2.length === 0),
    Un.showModal());
}
(F1.addEventListener("click", cI),
  z1.addEventListener("click", () => Un.close()),
  V1.addEventListener("click", () => Un.close()),
  Un.addEventListener("click", (arg719) => {
    arg719.target === Un && Un.close();
  }),
  Un.addEventListener("close", () => {
    pp = null;
  }),
  pg.addEventListener("click", () => {
    const v876 = mg.querySelector('input[name="effect-image-align-target"]:checked')?.value,
      pp4 = pp;
    if (!pp4 || !v876) {
      ((Zs.textContent = "请选择一张本页面图片。"), (Zs.hidden = false));
      return;
    }
    (Un.close(),
      E((arg720) => {
        const v877 = findComponent2(arg720, pp4)?.component,
          v878 = arg720.pages?.find((arg721) => arg721.path === W.value) || arg720.pages?.[0],
          v879 = findComponentInItems2(v878?.components, v876);
        if (!v877 || v877.type !== "icon-button-effect" || !v879 || v879.type !== "image") return;
        const v880 = Number(arg720.canvas?.width || 2778),
          v881 = Number(arg720.canvas?.height || 1940),
          options68 = v879.position || {},
          v882 = Number(options68.width || 100),
          v883 = Number(options68.height || 100),
          v884 = v879.properties?.layoutMode === "fill";
        v877.properties = {
          ...(v877.properties || {}),
          effectReferenceImageId: v879.id,
          effectLayoutMode: v884 ? "fill" : "free",
          ...(v884
            ? {}
            : {
                effectLeft: ((Number(options68.x || 0) + v882 / 2) / v880) * 100,
                effectTop: ((Number(options68.y || 0) + v883 / 2) / v881) * 100,
                effectScale: clampNumber2(Number(v879.style?.scale || 1), 0.01, 5),
                effectRotation: Number(options68.rotation || 0),
              }),
        };
      }));
  }),
  Ld.addEventListener("click", (arg722) => {
    const closest31 = arg722.target.closest("[data-ibe-preview]"),
      w20 = w;
    if (!closest31 || !w20) return;
    const ibePreview = ["on", "off"].includes(closest31.dataset.ibePreview)
      ? closest31.dataset.ibePreview
      : "auto";
    (En.set(w20, ibePreview), x?.setComponentPreviewState(w20, ibePreview), J());
  }),
  Qf.addEventListener("click", (arg723) => {
    const closest32 = arg723.target.closest("[data-ibe-layer]"),
      w21 = w;
    if (!closest32 || !w21) return;
    const text63 = closest32.dataset.ibeLayer === "effect" ? "effect" : "button",
      text64 = text63 === "effect" ? "on" : "off";
    (M0.set(w21, text63),
      En.set(w21, text64),
      x?.setComponentPreviewState(w21, text64),
      x?.setComponentSelectionLayer(w21, text63),
      q(),
      J());
  }),
  Zf.addEventListener("click", () => {
    const w22 = w;
    w22 &&
      E((arg724) => {
        const v885 = findComponent2(arg724, w22)?.component;
        !v885 ||
          v885.type !== "icon-button-effect" ||
          (v885.properties = {
            ...(v885.properties || {}),
            buttonVisible: v885.properties?.buttonVisible === false,
          });
      });
  }),
  eg.addEventListener("click", () => {
    const w23 = w;
    w23 &&
      E((arg725) => {
        const v886 = findComponent2(arg725, w23)?.component;
        !v886 ||
          v886.type !== "icon-button-effect" ||
          (v886.properties = {
            ...(v886.properties || {}),
            effectVisible: v886.properties?.effectVisible === false,
          });
      });
  }));
const lI = new Map([
    [
      yg,
      {
        property: "mainColor",
      },
    ],
    [
      vg,
      {
        property: "secondaryColor",
      },
    ],
    [
      wg,
      {
        property: "mainSize",
        min: 8,
        max: 200,
      },
    ],
    [
      Cg,
      {
        property: "secondarySize",
        min: 6,
        max: 100,
      },
    ],
    [
      Sg,
      {
        property: "mainWeight",
        min: 0,
        max: 1,
      },
    ],
    [
      xg,
      {
        property: "secondaryWeight",
        min: 0,
        max: 1,
      },
    ],
    [
      Ng,
      {
        property: "mainSpacing",
        min: -20,
        max: 100,
      },
    ],
    [
      Eg,
      {
        property: "secondarySpacing",
        min: -20,
        max: 100,
      },
    ],
    [
      Lg,
      {
        property: "secondaryLineGap",
        min: 0,
        max: 100,
      },
    ],
    [
      Ig,
      {
        property: "mainTextLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Tg,
      {
        property: "mainTextTop",
        min: -100,
        max: 200,
      },
    ],
    [
      Ag,
      {
        property: "secondaryTextLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Pg,
      {
        property: "secondaryTextTop",
        min: -100,
        max: 200,
      },
    ],
    [
      Mg,
      {
        property: "iconColor",
      },
    ],
    [
      Og,
      {
        property: "iconSize",
        min: 1,
        max: 100,
      },
    ],
    [
      Bg,
      {
        property: "iconLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      $g,
      {
        property: "iconTop",
        min: -100,
        max: 200,
      },
    ],
    [
      Fg,
      {
        property: "frameColor",
      },
    ],
    [
      zg,
      {
        property: "frameWidth",
        min: 0,
        max: 12,
      },
    ],
    [
      Vg,
      {
        property: "frameSize",
        min: 10,
        max: 300,
      },
    ],
    [
      Wg,
      {
        property: "frameSpacing",
        min: 0,
        max: 300,
      },
    ],
    [
      Rg,
      {
        property: "frameOffsetX",
        min: -100,
        max: 100,
      },
    ],
    [
      Hg,
      {
        property: "frameOffsetY",
        min: -100,
        max: 100,
      },
    ],
    [
      qg,
      {
        property: "markerColor",
      },
    ],
    [
      Ug,
      {
        property: "markerSize",
        min: 2,
        max: 60,
      },
    ],
    [
      Gg,
      {
        property: "markerLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      _g,
      {
        property: "markerTop",
        min: -100,
        max: 200,
      },
    ],
  ]),
  dI = new Map([
    [zd, "left"],
    [Vd, "top"],
    [rc, "width"],
    [ac, "height"],
    [Yr, "scale"],
    [sc, "rotation"],
  ]),
  uI = new Map([
    [
      Zg,
      {
        property: "iconColor",
      },
    ],
    [
      eh,
      {
        property: "iconActiveColor",
      },
    ],
    [
      th,
      {
        property: "iconSize",
        min: 8,
        max: 100,
      },
    ],
    [
      oh,
      {
        property: "titleColor",
      },
    ],
    [
      ih,
      {
        property: "titleSize",
        min: 8,
        max: 100,
      },
    ],
    [
      rh,
      {
        property: "titleWeight",
        min: 0,
        max: 1,
      },
    ],
    [
      ah,
      {
        property: "titleSpacing",
        min: -20,
        max: 100,
      },
    ],
    [
      ch,
      {
        property: "countColor",
      },
    ],
    [
      lh,
      {
        property: "countActiveColor",
      },
    ],
    [
      dh,
      {
        property: "countSize",
        min: 8,
        max: 140,
      },
    ],
    [
      uh,
      {
        property: "countWeight",
        min: 0,
        max: 1,
      },
    ],
    [
      ph,
      {
        property: "countSpacing",
        min: -20,
        max: 100,
      },
    ],
    [
      mh,
      {
        property: "iconGap",
        min: 0,
        max: 40,
      },
    ],
    [
      fh,
      {
        property: "countGap",
        min: 0,
        max: 40,
      },
    ],
  ]),
  pI = new Map([
    [jd, "left"],
    [qd, "top"],
    [dc, "width"],
    [uc, "height"],
    [ea, "scale"],
    [pc, "rotation"],
  ]),
  mI = new Map([
    [
      ob,
      {
        property: "haloScaleX",
        min: 20,
        max: 300,
        divisor: 100,
      },
    ],
    [
      ib,
      {
        property: "haloScaleY",
        min: 20,
        max: 300,
        divisor: 100,
      },
    ],
    [
      rb,
      {
        property: "haloRotation",
        min: -360,
        max: 360,
      },
    ],
    [
      ab,
      {
        property: "haloOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      cb,
      {
        property: "personScale",
        min: 20,
        max: 300,
        divisor: 100,
      },
    ],
    [
      lb,
      {
        property: "personRotation",
        min: -360,
        max: 360,
      },
    ],
    [
      db,
      {
        property: "personOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      ub,
      {
        property: "orbitDuration",
        min: 2,
        max: 60,
      },
    ],
    [
      Oi,
      {
        property: "iconColor",
      },
    ],
    [
      Xd,
      {
        property: (arg726) =>
          arg726.type !== "presence-sensor"
            ? "iconOnColor"
            : arg726.properties?.sensorKind === "water-leak"
              ? "waterLeakColor"
              : arg726.properties?.sensorKind === "smoke"
                ? "smokeColor"
                : arg726.properties?.sensorKind === "natural-gas"
                  ? "naturalGasColor"
                  : "iconOnColor",
      },
    ],
    [
      Sh,
      {
        property: "badgeColor",
      },
    ],
    [
      xh,
      {
        property: "badgeOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      Eh,
      {
        property: "symbolSize",
        min: 1,
        max: 100,
      },
    ],
    [
      Lh,
      {
        property: "badgeSize",
        min: 1,
        max: 100,
      },
    ],
    [
      Nh,
      {
        property: "iconSize",
        min: 1,
        max: 100,
      },
    ],
    [
      Kd,
      {
        property: "iconOffOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      Jd,
      {
        property: "iconOnOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      Qd,
      {
        property: "iconLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Zd,
      {
        property: "iconTop",
        min: -100,
        max: 200,
      },
    ],
    [
      Th,
      {
        property: "mainColor",
      },
    ],
    [
      Ah,
      {
        property: "secondaryColor",
      },
    ],
    [
      iu,
      {
        property: "mainOffOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      ru,
      {
        property: "mainOnOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      au,
      {
        property: "secondaryOffOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      su,
      {
        property: "secondaryOnOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      Ph,
      {
        property: "mainSize",
        min: 6,
        max: 120,
      },
    ],
    [
      kh,
      {
        property: "secondarySize",
        min: 5,
        max: 80,
      },
    ],
    [
      Mh,
      {
        property: "mainWeight",
        min: 0,
        max: 1,
      },
    ],
    [
      Oh,
      {
        property: "secondaryWeight",
        min: 0,
        max: 1,
      },
    ],
    [
      Bh,
      {
        property: "mainSpacing",
        min: -20,
        max: 100,
      },
    ],
    [
      $h,
      {
        property: "secondarySpacing",
        min: -20,
        max: 100,
      },
    ],
    [
      Fh,
      {
        property: "mainTextLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Dh,
      {
        property: "mainTextTop",
        min: -100,
        max: 200,
      },
    ],
    [
      zh,
      {
        property: "secondaryTextLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Vh,
      {
        property: "secondaryTextTop",
        min: -100,
        max: 200,
      },
    ],
    [
      lu,
      {
        property: "onFillColor",
      },
    ],
    [
      du,
      {
        property: "onFillStrength",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      Wh,
      {
        property: "onFillFadeDuration",
        min: 0,
        max: 3,
      },
    ],
    [
      Hh,
      {
        property: "frameWidth",
        min: 0,
        max: 12,
      },
    ],
    [
      jh,
      {
        property: "frameAngle",
        min: 0,
        max: 360,
      },
    ],
    [
      uu,
      {
        property: "frameOffOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      pu,
      {
        property: "frameOnOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      qh,
      {
        property: "cutCorner",
        min: 0,
        max: 50,
      },
    ],
    [
      Gh,
      {
        property: "softLightColor",
      },
    ],
    [
      _h,
      {
        property: "softLightStrength",
        min: 0,
        max: 500,
        divisor: 100,
      },
    ],
    [
      Yh,
      {
        property: "softLightSize",
        min: 0,
        max: 300,
        divisor: 100,
      },
    ],
    [
      Xh,
      {
        property: "softLightAngle",
        min: 0,
        max: 360,
      },
    ],
    [
      Jh,
      {
        property: "glowColor",
      },
    ],
    [
      Qh,
      {
        property: "glowStrength",
        min: 0,
        max: 500,
        divisor: 100,
      },
    ],
    [
      Zh,
      {
        property: "glowSize",
        min: 0,
        max: 300,
        divisor: 100,
      },
    ],
    [
      eb,
      {
        property: "glowAngle",
        min: 0,
        max: 360,
      },
    ],
  ]),
  fI = new Map([
    [mu, "left"],
    [fu, "top"],
    [gc, "width"],
    [hc, "height"],
    [ra, "scale"],
    [bc, "rotation"],
  ]),
  nC = new Map([
    [
      yb,
      {
        property: "iconOffColor",
      },
    ],
    [
      vb,
      {
        property: "iconOnColor",
      },
    ],
    [
      wb,
      {
        property: "badgeColor",
      },
    ],
    [
      Cb,
      {
        property: "badgeOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
    [
      Sb,
      {
        property: "symbolSize",
        min: 1,
        max: 100,
      },
    ],
    [
      xb,
      {
        property: "badgeSize",
        min: 1,
        max: 100,
      },
    ],
    [
      Nb,
      {
        property: "iconLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Eb,
      {
        property: "iconTop",
        min: -100,
        max: 200,
      },
    ],
    [
      Tb,
      {
        property: "mainColor",
      },
    ],
    [
      Ab,
      {
        property: "mainSize",
        min: 6,
        max: 120,
      },
    ],
    [
      Pb,
      {
        property: "mainWeight",
        min: 0,
        max: 1,
      },
    ],
    [
      kb,
      {
        property: "mainSpacing",
        min: -20,
        max: 100,
      },
    ],
    [
      Mb,
      {
        property: "mainTextLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Ob,
      {
        property: "mainTextTop",
        min: -100,
        max: 200,
      },
    ],
    [
      Fb,
      {
        property: "secondaryColor",
      },
    ],
    [
      Db,
      {
        property: "secondarySize",
        min: 5,
        max: 80,
      },
    ],
    [
      zb,
      {
        property: "secondaryWeight",
        min: 0,
        max: 1,
      },
    ],
    [
      Vb,
      {
        property: "secondarySpacing",
        min: -20,
        max: 100,
      },
    ],
    [
      Wb,
      {
        property: "secondaryTextLeft",
        min: -100,
        max: 200,
      },
    ],
    [
      Rb,
      {
        property: "secondaryTextTop",
        min: -100,
        max: 200,
      },
    ],
    [
      qb,
      {
        property: "airflowCoolColor",
      },
    ],
    [
      Ub,
      {
        property: "airflowHeatColor",
      },
    ],
    [
      Gb,
      {
        property: "airflowOtherColor",
      },
    ],
    [
      _b,
      {
        property: "airflowAngle",
        min: -360,
        max: 360,
      },
    ],
    [
      Yb,
      {
        property: "airflowCurve",
        min: -200,
        max: 200,
      },
    ],
    [
      Xb,
      {
        property: "airflowLength",
        min: 10,
        max: 300,
      },
    ],
    [
      Kb,
      {
        property: "airflowFadePosition",
        min: 15,
        max: 100,
      },
    ],
    [
      Jb,
      {
        property: "airflowSpread",
        min: 10,
        max: 300,
      },
    ],
    [
      Qb,
      {
        property: "airflowDensity",
        min: 20,
        max: 200,
      },
    ],
    [
      Zb,
      {
        property: "airflowIrregularity",
        min: 0,
        max: 200,
      },
    ],
    [
      ey,
      {
        property: "airflowThickness",
        min: 5,
        max: 300,
      },
    ],
    [
      ty,
      {
        property: "airflowStrength",
        min: 0,
        max: 500,
      },
    ],
    [
      ny,
      {
        property: "airflowBlur",
        min: 0,
        max: 30,
      },
    ],
    [
      hu,
      {
        property: "airflowSpeed",
        min: 0.3,
        max: 12,
      },
    ],
    [
      aa,
      {
        property: "airflowOffsetX",
        limits: (arg727, arg728) => {
          const v887 = airflowCanvasOffsetBounds2(arg727, arg728.canvas);
          return {
            min: v887.minX,
            max: v887.maxX,
          };
        },
      },
    ],
    [
      sa,
      {
        property: "airflowOffsetY",
        limits: (arg729, arg730) => {
          const v888 = airflowCanvasOffsetBounds2(arg729, arg730.canvas);
          return {
            min: v888.minY,
            max: v888.maxY,
          };
        },
      },
    ],
    [
      oy,
      {
        property: "airflowWidth",
        min: 1,
        max: 500,
      },
    ],
    [
      iy,
      {
        property: "airflowHeight",
        min: 1,
        max: 500,
      },
    ],
    [
      bu,
      {
        property: "airflowScale",
        min: 1,
        max: 500,
        divisor: 100,
      },
    ],
    [
      yu,
      {
        property: "airflowRotation",
        min: -360,
        max: 360,
      },
    ],
  ]),
  gI = new Map([
    [vu, "left"],
    [wu, "top"],
    [Sc, "width"],
    [xc, "height"],
    [ca, "scale"],
    [Nc, "rotation"],
  ]),
  hI = new Map([
    [
      py,
      {
        property: "frameColor",
      },
    ],
    [
      my,
      {
        property: "frameWidth",
        min: 0,
        max: 20,
      },
    ],
    [
      fy,
      {
        property: "radius",
        min: 0,
        max: 50,
        divisor: 100,
      },
    ],
    [
      gy,
      {
        property: "frameAngle",
        min: 0,
        max: 360,
      },
    ],
    [
      hy,
      {
        property: "frameOpacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
  ]),
  bI = new Map([
    [
      ay,
      {
        property: "opacity",
        min: 0,
        max: 100,
        divisor: 100,
      },
    ],
  ]),
  yI = new Map([
    [Nu, "left"],
    [Eu, "top"],
    [la, "scale"],
    [Ic, "rotation"],
  ]),
  vI = new Map([
    [Iu, "left"],
    [Tu, "top"],
    [Pc, "width"],
    [kc, "height"],
    [ua, "scale"],
    [Mc, "rotation"],
  ]);
function ir(arg731, arg732, arg733, arg734) {
  const list48 = Array.isArray(arg732) ? arg732 : [arg732];
  (arg731.addEventListener("input", (arg735) => {
    const f18 = F();
    if (!f18 || !list48.includes(f18.type)) return;
    const v889 = arg733.get(arg735.target);
    if (v889) {
      const property = typeof v889.property == "function" ? v889.property(f18) : v889.property;
      let v890 = arg735.target.type === "color" ? arg735.target.value : Number(arg735.target.value);
      if (arg735.target.type !== "color") {
        if (!Number.isFinite(v890)) return;
        const v891 = v889.limits?.(f18, g.document) || v889;
        v890 = clampNumber2(v890, v891.min, v891.max) / (v889.divisor || 1);
      }
      x?.previewComponentProperties(f18.id, {
        [property]: v890,
      });
      return;
    }
    const v892 = arg734.get(arg735.target),
      v893 = Number(arg735.target.value);
    if (!v892 || !Number.isFinite(v893)) return;
    const v894 = Number(g.document.canvas.width || 2778),
      v895 = Number(g.document.canvas.height || 1940),
      v896 = Number(f18.position?.width || 100),
      v897 = Number(f18.position?.height || 100);
    v892 === "left"
      ? x?.previewComponentTransform(f18.id, {
          x: (v894 * clampNumber2(v893, 0, 100)) / 100 - v896 / 2,
        })
      : v892 === "top"
        ? x?.previewComponentTransform(f18.id, {
            y: (v895 * clampNumber2(v893, 0, 100)) / 100 - v897 / 2,
          })
        : v892 === "width"
          ? x?.previewComponentTransform(f18.id, {
              width: (v894 * clampNumber2(v893, 0.1, 100)) / 100,
            })
          : v892 === "height"
            ? x?.previewComponentTransform(f18.id, {
                height: (v895 * clampNumber2(v893, 0.1, 100)) / 100,
              })
            : v892 === "scale"
              ? x?.previewComponentTransform(f18.id, {
                  scale: clampNumber2(v893, 1, 500) / 100,
                })
              : v892 === "rotation" &&
                il().length < 2 &&
                x?.previewComponentTransform(f18.id, {
                  rotation: clampNumber2(v893, -360, 360),
                });
  }),
    arg731.addEventListener("change", (arg736) => {
      const v898 = arg733.get(arg736.target),
        v899 = arg734.get(arg736.target);
      if (!v898 && !v899) return;
      if (arg736.target.type === "number" && !Number.isFinite(Number(arg736.target.value))) {
        J();
        return;
      }
      const w24 = w,
        il2 = v899 === "rotation" ? il() : [];
      E((arg737) => {
        const element267 = findComponent2(arg737, w24)?.component;
        if (!element267 || !list48.includes(element267.type)) return;
        if (
          ((element267.properties = {
            ...(element267.properties || {}),
          }),
          (element267.position = {
            ...(element267.position || {}),
          }),
          (element267.style = {
            ...(element267.style || {}),
          }),
          v898)
        ) {
          const property2 =
              typeof v898.property == "function" ? v898.property(element267) : v898.property,
            v900 = v898.limits?.(element267, arg737) || v898;
          element267.properties[property2] =
            arg736.target.type === "color"
              ? arg736.target.value
              : clampNumber2(Number(arg736.target.value), v900.min, v900.max) / (v898.divisor || 1);
          return;
        }
        const v901 = Number(arg737.canvas.width || 2778),
          v902 = Number(arg737.canvas.height || 1940),
          v903 = Number(arg736.target.value);
        v899 === "left"
          ? (element267.position.x =
              (v901 * clampNumber2(v903, 0, 100)) / 100 -
              Number(element267.position.width || 100) / 2)
          : v899 === "top"
            ? (element267.position.y =
                (v902 * clampNumber2(v903, 0, 100)) / 100 -
                Number(element267.position.height || 100) / 2)
            : v899 === "width"
              ? (element267.position.width = (v901 * clampNumber2(v903, 0.1, 100)) / 100)
              : v899 === "height"
                ? (element267.position.height = (v902 * clampNumber2(v903, 0.1, 100)) / 100)
                : v899 === "scale"
                  ? (element267.style.scale = clampNumber2(v903, 1, 500) / 100)
                  : v899 === "rotation" && Lt(arg737, w24, clampNumber2(v903, -360, 360), il2);
      });
    }));
}
(ir(tc, "title-button", lI, dI),
  ir(Wd, "light-statistics", uI, pI),
  ir(Pi, ["icon-button", "device-button", "presence-sensor"], mI, fI),
  ir(wc, "air-conditioner", nC, gI),
  ir(Ec, "vacuum-map", bI, yI),
  ir(Tc, "camera", hI, vI),
  fc.addEventListener("change", () => {
    const w25 = w;
    w25 &&
      E((arg738) => {
        const v904 = findComponent2(arg738, w25)?.component;
        if (!v904 || v904.type !== "device-button") return;
        const text65 = ["0", "1", "2", "3", "4"].includes(fc.value) ? Number(fc.value) : "auto";
        v904.properties = {
          ...(v904.properties || {}),
          statePrecision: text65,
        };
      });
  }),
  ta.addEventListener("change", () => {
    const w26 = w;
    w26 &&
      E((arg739) => {
        const v905 = findComponent2(arg739, w26)?.component;
        if (!v905 || v905.type !== "presence-sensor") return;
        const text66 = ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
          ta.value,
        )
          ? ta.value
          : "presence";
        ((v905.properties = {
          ...(v905.properties || {}),
          sensorKind: text66,
        }),
          text66 !== "door-window" &&
            (Yc.delete(w26), x?.setComponentSelectionLayer(w26, "button")));
      });
  }),
  Gn.addEventListener("click", () => {
    const f19 = F();
    !f19 ||
      f19.type !== "presence-sensor" ||
      f19.properties?.sensorKind !== "door-window" ||
      (Yc.add(f19.id),
      Gn.classList.add("active"),
      Gn.setAttribute("aria-pressed", "true"),
      (vc.disabled = false),
      x?.setComponentSelectionLayer(f19.id, "perspective"));
  }),
  vc.addEventListener("click", () => {
    const f20 = F();
    !f20 ||
      f20.type !== "presence-sensor" ||
      f20.properties?.sensorKind !== "door-window" ||
      (Yc.delete(f20.id),
      Gn.classList.remove("active"),
      Gn.setAttribute("aria-pressed", "false"),
      (vc.disabled = true),
      x?.setComponentSelectionLayer(f20.id, "button"));
  }),
  EN.addEventListener("click", () => {
    const w27 = w;
    w27 &&
      E((arg740) => {
        const v906 = findComponent2(arg740, w27)?.component;
        !v906 ||
          v906.type !== "presence-sensor" ||
          v906.properties?.sensorKind !== "door-window" ||
          (v906.properties = {
            ...(v906.properties || {}),
            perspectiveCorners: [...bp],
          });
      });
  }),
  cy.addEventListener("click", (arg741) => {
    const closest33 = arg741.target.closest("[data-camera-fit]"),
      w28 = w;
    if (!closest33 || !w28) return;
    const text67 = closest33.dataset.cameraFit === "contain" ? "contain" : "fill";
    E((arg742) => {
      const v907 = findComponent2(arg742, w28)?.component;
      !v907 ||
        v907.type !== "camera" ||
        (v907.properties = {
          ...(v907.properties || {}),
          fit: text67,
        });
    });
  }),
  ly.addEventListener("click", (arg743) => {
    const closest34 = arg743.target.closest("[data-camera-display-mode]"),
      w29 = w;
    if (!closest34 || !w29) return;
    const text68 = closest34.dataset.cameraDisplayMode === "snapshot" ? "snapshot" : "live";
    E((arg744) => {
      const v908 = findComponent2(arg744, w29)?.component;
      !v908 ||
        v908.type !== "camera" ||
        (v908.properties = {
          ...(v908.properties || {}),
          displayMode: text68,
        });
    });
  }),
  da.addEventListener("change", () => {
    const w30 = w;
    if (!w30) return;
    const v909 = Number(da.value),
      max45 = Number.isFinite(v909) ? Math.max(6, Math.round(v909)) : 10;
    ((da.value = String(max45)),
      E((arg745) => {
        const v910 = findComponent2(arg745, w30)?.component;
        !v910 ||
          v910.type !== "camera" ||
          (v910.properties = {
            ...(v910.properties || {}),
            refreshInterval: max45,
          });
      }));
  }),
  dy.addEventListener("click", () => {
    const w31 = w;
    w31 &&
      E((arg746) => {
        const v911 = findComponent2(arg746, w31)?.component;
        !v911 ||
          v911.type !== "camera" ||
          (v911.properties = {
            ...(v911.properties || {}),
            mediaVisible: v911.properties?.mediaVisible === false,
          });
      });
  }),
  uy.addEventListener("click", () => {
    const w32 = w;
    w32 &&
      E((arg747) => {
        const v912 = findComponent2(arg747, w32)?.component;
        !v912 ||
          v912.type !== "camera" ||
          (v912.properties = {
            ...(v912.properties || {}),
            frameVisible: v912.properties?.frameVisible === false,
          });
      });
  }));
function ws(arg748, v913 = "auto") {
  if (!arg748) return;
  const text69 = ["on", "off"].includes(v913) ? v913 : "auto";
  (Qo.set(arg748, text69), x?.setComponentPreviewState(arg748, text69));
}
(fb.addEventListener("click", (arg749) => {
  const closest35 = arg749.target.closest("[data-air-conditioner-preview]");
  !closest35 || !w || (ws(w, closest35.dataset.airConditionerPreview), J());
}),
  mb.addEventListener("click", (arg750) => {
    const closest36 = arg750.target.closest("[data-air-conditioner-device-type]"),
      w33 = w;
    if (!closest36 || !w33) return;
    const airConditionerDeviceType = ["air-conditioner", "bath-heater"].includes(
      closest36.dataset.airConditionerDeviceType,
    )
      ? closest36.dataset.airConditionerDeviceType
      : "auto";
    E((arg751) => {
      const v914 = findComponent2(arg751, w33)?.component;
      !v914 ||
        v914.type !== "air-conditioner" ||
        (v914.properties = {
          ...(v914.properties || {}),
          deviceType: airConditionerDeviceType,
        });
    });
  }),
  gb.addEventListener("click", (arg752) => {
    const closest37 = arg752.target.closest("[data-air-conditioner-layer]");
    if (!closest37 || !w) return;
    const text70 = closest37.dataset.airConditionerLayer === "airflow" ? "airflow" : "button";
    (vp.set(w, text70),
      ws(w, text70 === "airflow" ? "on" : "off"),
      x?.setComponentSelectionLayer(w, text70),
      q(),
      J());
  }),
  Hb.addEventListener("click", () => {
    const w34 = w;
    w34 &&
      (ws(w34, "on"),
      E((arg753) => {
        const v915 = findComponent2(arg753, w34)?.component;
        !v915 ||
          v915.type !== "air-conditioner" ||
          (v915.properties = {
            ...(v915.properties || {}),
            airflowVisible: v915.properties?.airflowVisible === false,
          });
      }));
  }));
for (const [t, e] of [
  [bb, "iconVisible"],
  [Lb, "mainTextVisible"],
  [Bb, "secondaryTextVisible"],
])
  t.addEventListener("click", () => {
    const w35 = w;
    w35 &&
      E((arg754) => {
        const v916 = findComponent2(arg754, w35)?.component;
        !v916 ||
          v916.type !== "air-conditioner" ||
          (v916.properties = {
            ...(v916.properties || {}),
            [e]: v916.properties?.[e] === false,
          });
      });
  });
jb.addEventListener("click", (arg755) => {
  const closest38 = arg755.target.closest("[data-airflow-motion]"),
    w36 = w;
  !closest38 ||
    !w36 ||
    (ws(w36, "on"),
    E((arg756) => {
      const v917 = findComponent2(arg756, w36)?.component;
      !v917 ||
        v917.type !== "air-conditioner" ||
        (v917.properties = {
          ...(v917.properties || {}),
          airflowMotion: closest38.dataset.airflowMotion === "static" ? "static" : "dynamic",
        });
    }));
});
for (const t of ["focusin", "pointerdown", "input"])
  hb.addEventListener(t, (arg757) => {
    nC.has(arg757.target) && F()?.type === "air-conditioner" && ws(w, "on");
  });
const Nl = new Map([
  [Kd, "off"],
  [iu, "off"],
  [au, "off"],
  [uu, "off"],
  [cu, "on"],
  [Jd, "on"],
  [ru, "on"],
  [su, "on"],
  [lu, "on"],
  [du, "on"],
  [pu, "on"],
  [Xd, "on"],
]);
function wI(arg758) {
  for (const element268 of mc.querySelectorAll("[data-icon-button-preview]")) {
    const v918 = element268.dataset.iconButtonPreview === arg758;
    (element268.classList.toggle("active", v918),
      element268.setAttribute("aria-pressed", String(v918)));
  }
}
function ym(arg759, v919 = "auto") {
  if (!arg759) return;
  const text71 = ["on", "off"].includes(v919) ? v919 : "auto";
  (text71 === "auto" ? eo.delete(arg759) : eo.set(arg759, text71),
    x?.setComponentPreviewState(arg759, text71),
    arg759 === w && wI(text71));
}
function oC(arg760) {
  const f21 = F(),
    text72 = Nl.get(arg760) || (f21?.type === "device-button" && arg760 === Oi ? "off" : null);
  !text72 ||
    !["icon-button", "device-button", "presence-sensor"].includes(f21?.type) ||
    ym(f21.id, text72);
}
function iC(arg761) {
  const f22 = F();
  (!Nl.has(arg761) && !(f22?.type === "device-button" && arg761 === Oi)) ||
    (["icon-button", "device-button", "presence-sensor"].includes(f22?.type) && ym(f22.id, "auto"));
}
for (const t of ["focusin", "pointerdown", "input"])
  Pi.addEventListener(t, (arg762) => oC(arg762.target));
(bh.addEventListener("click", (arg763) => {
  const closest39 = arg763.target.closest("[data-cover-kind]"),
    w37 = w;
  if (!closest39 || !w37) return;
  const coverKind2 = ["standard", "dream", "airer"].includes(closest39.dataset.coverKind)
    ? closest39.dataset.coverKind
    : "auto";
  E((arg764) => {
    const v920 = findComponent2(arg764, w37)?.component;
    v920 &&
      String(v920.bindings?.entity?.entityId || "").startsWith("cover.") &&
      (v920.properties = {
        ...(v920.properties || {}),
        coverKind: coverKind2,
      });
  });
}),
  yh.addEventListener("click", (arg765) => {
    const closest40 = arg765.target.closest("[data-cover-direction]"),
      w38 = w;
    if (!closest40 || !w38) return;
    const coverDirection2 = ["left", "right"].includes(closest40.dataset.coverDirection)
      ? closest40.dataset.coverDirection
      : "split";
    E((arg766) => {
      const v921 = findComponent2(arg766, w38)?.component;
      v921 &&
        String(v921.bindings?.entity?.entityId || "").startsWith("cover.") &&
        (v921.properties = {
          ...(v921.properties || {}),
          coverDirection: coverDirection2,
        });
    });
  }),
  vh.addEventListener("click", (arg767) => {
    const closest41 = arg767.target.closest("[data-cover-motor-direction]"),
      w39 = w;
    if (!closest41 || !w39) return;
    const coverMotorDirection2 = ["normal", "reversed"].includes(
      closest41.dataset.coverMotorDirection,
    )
      ? closest41.dataset.coverMotorDirection
      : "auto";
    E((arg768) => {
      const v922 = findComponent2(arg768, w39)?.component;
      v922 &&
        String(v922.bindings?.entity?.entityId || "").startsWith("cover.") &&
        (v922.properties = {
          ...(v922.properties || {}),
          coverMotorDirection: coverMotorDirection2,
        });
    });
  }),
  Pi.addEventListener("focusout", (arg769) => {
    const f23 = F();
    (!Nl.has(arg769.target) && !(f23?.type === "device-button" && arg769.target === Oi)) ||
      (arg769.relatedTarget instanceof Node && mc.contains(arg769.relatedTarget)) ||
      window.requestAnimationFrame(() => {
        if (he === arg769.target && !Ct.hidden) return;
        Nl.get(document.activeElement) ||
        (F()?.type === "device-button" && document.activeElement === Oi ? "off" : null)
          ? oC(document.activeElement)
          : iC(arg769.target);
      });
  }));
for (const [t, e] of [
  [gg, "mainTextVisible"],
  [hg, "secondaryTextVisible"],
  [kg, "iconVisible"],
  [Dg, "frameVisible"],
  [jg, "markerVisible"],
])
  t.addEventListener("click", () => {
    const w40 = w;
    E((arg770) => {
      const v923 = findComponent2(arg770, w40)?.component;
      !v923 ||
        v923.type !== "title-button" ||
        (v923.properties = {
          ...(v923.properties || {}),
          [e]: v923.properties?.[e] === false,
        });
    });
  });
for (const [t, e] of [
  [Qg, "iconVisible"],
  [nh, "titleVisible"],
  [sh, "countVisible"],
])
  t.addEventListener("click", () => {
    const w41 = w;
    w41 &&
      E((arg771) => {
        const v924 = findComponent2(arg771, w41)?.component;
        !v924 ||
          v924.type !== "light-statistics" ||
          (v924.properties = {
            ...(v924.properties || {}),
            [e]: v924.properties?.[e] === false,
          });
      });
  });
for (const [t, e] of [
  [Yd, "iconVisible"],
  [nu, "mainTextVisible"],
  [ou, "secondaryTextVisible"],
  [cu, "onFillVisible"],
  [Rh, "frameVisible"],
  [Uh, "softLightVisible"],
  [Kh, "glowVisible"],
  [nb, "haloVisible"],
  [sb, "personVisible"],
])
  t.addEventListener("click", () => {
    const w42 = w;
    E((arg772) => {
      const v925 = findComponent2(arg772, w42)?.component;
      !v925 ||
        !["icon-button", "device-button", "presence-sensor"].includes(v925.type) ||
        (e.endsWith("Visible") &&
          ["iconVisible", "mainTextVisible", "secondaryTextVisible"].includes(e) &&
          v925.type !== "device-button") ||
        (["haloVisible", "personVisible"].includes(e) && v925.type !== "presence-sensor") ||
        (v925.properties = {
          ...(v925.properties || {}),
          [e]: v925.properties?.[e] === false,
        });
    });
  });
mc.addEventListener("click", (arg773) => {
  const closest42 = arg773.target.closest("[data-icon-button-preview]"),
    w43 = w;
  if (!closest42 || !w43) return;
  const iconButtonPreview = ["on", "off"].includes(closest42.dataset.iconButtonPreview)
    ? closest42.dataset.iconButtonPreview
    : "auto";
  ym(w43, iconButtonPreview);
});
const rC = new Map([[wy, "color"]]),
  aC = new Map([
    [
      Cy,
      {
        property: "fontSize",
        minimum: 12,
        maximum: 500,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Sy,
      {
        property: "fontWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      xy,
      {
        property: "letterSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Ny,
      {
        property: "opacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
        resizes: false,
      },
    ],
  ]),
  vm = new Set([ma, fa, $o, Bi]);
function CI(arg774, arg775) {
  const v926 = Number(arg774.position?.width || 100),
    v927 = Number(arg774.position?.height || 100),
    v928 = Number(arg774.position?.x || 0) + v926 / 2,
    v929 = Number(arg774.position?.y || 0) + v927 / 2,
    { width: v930, height: v931 } = timeComponentDimensions2(arg775);
  x?.previewComponentTransform(arg774.id, {
    x: v928 - v930 / 2,
    y: v929 - v931 / 2,
    width: v930,
    height: v931,
  });
}
(pa.addEventListener("input", (arg776) => {
  const f24 = F();
  if (!f24 || f24.type !== "time") return;
  const target7 = arg776.target,
    v932 = rC.get(target7);
  if (v932) {
    x?.previewComponentProperties(f24.id, {
      [v932]: target7.value,
    });
    return;
  }
  const v933 = aC.get(target7);
  if (v933) {
    if (String(target7.value).trim() === "" || !Number.isFinite(Number(target7.value))) return;
    const v934 = clampNumber2(Number(target7.value), v933.minimum, v933.maximum) / v933.divisor,
      options69 = {
        ...(f24.properties || {}),
        [v933.property]: v934,
      };
    (x?.previewComponentProperties(f24.id, {
      [v933.property]: v934,
    }),
      v933.resizes && CI(f24, options69));
    return;
  }
  if (
    !vm.has(target7) ||
    String(target7.value).trim() === "" ||
    !Number.isFinite(Number(target7.value))
  )
    return;
  const v935 = Number(target7.value),
    v936 = Number(g.document.canvas.width || 2778),
    v937 = Number(g.document.canvas.height || 1940),
    v938 = Number(f24.position?.width || 100),
    v939 = Number(f24.position?.height || 100);
  if (target7 === ma) {
    const v940 = clampNumber2(v935, 0, 100);
    x?.previewComponentTransform(f24.id, {
      x: (v936 * v940) / 100 - v938 / 2,
    });
  } else {
    if (target7 === fa) {
      const v941 = clampNumber2(v935, 0, 100);
      x?.previewComponentTransform(f24.id, {
        y: (v937 * v941) / 100 - v939 / 2,
      });
    } else {
      if (target7 === $o) {
        const v942 = clampNumber2(v935, 1, 500);
        x?.previewComponentTransform(f24.id, {
          scale: v942 / 100,
        });
      } else {
        if (target7 === Bi) {
          const v943 = clampNumber2(v935, -360, 360);
          x?.previewComponentTransform(f24.id, {
            rotation: v943,
          });
        }
      }
    }
  }
}),
  pa.addEventListener("change", (arg777) => {
    const target8 = arg777.target,
      w44 = w;
    if (!w44) return;
    const v944 = rC.get(target8),
      v945 = aC.get(target8);
    if (!(!v944 && !v945 && !vm.has(target8))) {
      if (
        (v945 || vm.has(target8)) &&
        (String(target8.value).trim() === "" || !Number.isFinite(Number(target8.value)))
      ) {
        J();
        return;
      }
      E((arg778) => {
        const element269 = findComponent2(arg778, w44)?.component;
        if (!element269 || element269.type !== "time") return;
        ((element269.properties = {
          ...(element269.properties || {}),
        }),
          (element269.position = {
            ...(element269.position || {}),
          }),
          (element269.style = {
            ...(element269.style || {}),
          }));
        const v946 = Number(arg778.canvas.width || 2778),
          v947 = Number(arg778.canvas.height || 1940),
          v948 = Number(target8.value);
        v944
          ? (element269.properties[v944] = target8.value)
          : v945
            ? ((element269.properties[v945.property] =
                clampNumber2(v948, v945.minimum, v945.maximum) / v945.divisor),
              v945.resizes && Lw(element269, element269.properties))
            : target8 === ma
              ? (element269.position.x =
                  (v946 * clampNumber2(v948, 0, 100)) / 100 -
                  Number(element269.position.width || 100) / 2)
              : target8 === fa
                ? (element269.position.y =
                    (v947 * clampNumber2(v948, 0, 100)) / 100 -
                    Number(element269.position.height || 100) / 2)
                : target8 === $o
                  ? (element269.style.scale = clampNumber2(v948, 1, 500) / 100)
                  : target8 === Bi && Lt(arg778, w44, clampNumber2(v948, -360, 360));
      });
    }
  }));
for (const t of [yy, vy])
  t.addEventListener("click", (arg779) => {
    const w45 = w,
      closest43 = arg779.target.closest("[data-time-hour-format]"),
      closest44 = arg779.target.closest("[data-time-seconds]");
    !w45 ||
      (!closest43 && !closest44) ||
      E((arg780) => {
        const v949 = findComponent2(arg780, w45)?.component;
        !v949 ||
          v949.type !== "time" ||
          ((v949.properties = {
            ...(v949.properties || {}),
          }),
          closest43 && (v949.properties.hour12 = closest43.dataset.timeHourFormat === "12"),
          closest44 && (v949.properties.showSeconds = closest44.dataset.timeSeconds === "on"),
          Lw(v949, v949.properties));
      });
  });
const sC = new Map([
    [Ty, "primaryColor"],
    [My, "lunarColor"],
  ]),
  cC = new Map([
    [
      Ay,
      {
        property: "primarySize",
        minimum: 12,
        maximum: 500,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Py,
      {
        property: "primaryWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      ky,
      {
        property: "primarySpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Oy,
      {
        property: "lunarSize",
        minimum: 10,
        maximum: 500,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      By,
      {
        property: "lunarWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      $y,
      {
        property: "lunarSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Fy,
      {
        property: "lineGap",
        minimum: 0,
        maximum: 200,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Dy,
      {
        property: "opacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
        resizes: false,
      },
    ],
  ]),
  wm = new Set([ha, ba, Fo, $i]);
function SI(arg781, arg782) {
  const v950 = Number(arg781.position?.width || 100),
    v951 = Number(arg781.position?.height || 100),
    v952 = Number(arg781.position?.x || 0) + v950 / 2,
    v953 = Number(arg781.position?.y || 0) + v951 / 2,
    { width: v954, height: v955 } = dateComponentDimensions2(arg782);
  x?.previewComponentTransform(arg781.id, {
    x: v952 - v954 / 2,
    y: v953 - v955 / 2,
    width: v954,
    height: v955,
  });
}
(ga.addEventListener("input", (arg783) => {
  const f25 = F();
  if (!f25 || f25.type !== "date") return;
  const target9 = arg783.target,
    v956 = sC.get(target9);
  if (v956) {
    x?.previewComponentProperties(f25.id, {
      [v956]: target9.value,
    });
    return;
  }
  const v957 = cC.get(target9);
  if (v957) {
    if (String(target9.value).trim() === "" || !Number.isFinite(Number(target9.value))) return;
    const v958 = clampNumber2(Number(target9.value), v957.minimum, v957.maximum) / v957.divisor,
      options70 = {
        ...(f25.properties || {}),
        [v957.property]: v958,
      };
    (x?.previewComponentProperties(f25.id, {
      [v957.property]: v958,
    }),
      v957.resizes && SI(f25, options70));
    return;
  }
  if (
    !wm.has(target9) ||
    String(target9.value).trim() === "" ||
    !Number.isFinite(Number(target9.value))
  )
    return;
  const v959 = Number(target9.value),
    v960 = Number(g.document.canvas.width || 2778),
    v961 = Number(g.document.canvas.height || 1940),
    v962 = Number(f25.position?.width || 100),
    v963 = Number(f25.position?.height || 100);
  if (target9 === ha) {
    const v964 = clampNumber2(v959, 0, 100);
    x?.previewComponentTransform(f25.id, {
      x: (v960 * v964) / 100 - v962 / 2,
    });
  } else {
    if (target9 === ba) {
      const v965 = clampNumber2(v959, 0, 100);
      x?.previewComponentTransform(f25.id, {
        y: (v961 * v965) / 100 - v963 / 2,
      });
    } else {
      if (target9 === Fo) {
        const v966 = clampNumber2(v959, 1, 500);
        x?.previewComponentTransform(f25.id, {
          scale: v966 / 100,
        });
      } else {
        if (target9 === $i) {
          const v967 = clampNumber2(v959, -360, 360);
          x?.previewComponentTransform(f25.id, {
            rotation: v967,
          });
        }
      }
    }
  }
}),
  ga.addEventListener("change", (arg784) => {
    const target10 = arg784.target,
      w46 = w;
    if (!w46) return;
    const v968 = sC.get(target10),
      v969 = cC.get(target10);
    if (!(!v968 && !v969 && !wm.has(target10))) {
      if (
        (v969 || wm.has(target10)) &&
        (String(target10.value).trim() === "" || !Number.isFinite(Number(target10.value)))
      ) {
        J();
        return;
      }
      E((arg785) => {
        const element270 = findComponent2(arg785, w46)?.component;
        if (!element270 || element270.type !== "date") return;
        ((element270.properties = {
          ...(element270.properties || {}),
        }),
          (element270.position = {
            ...(element270.position || {}),
          }),
          (element270.style = {
            ...(element270.style || {}),
          }));
        const v970 = Number(arg785.canvas.width || 2778),
          v971 = Number(arg785.canvas.height || 1940),
          v972 = Number(target10.value);
        v968
          ? (element270.properties[v968] = target10.value)
          : v969
            ? ((element270.properties[v969.property] =
                clampNumber2(v972, v969.minimum, v969.maximum) / v969.divisor),
              v969.resizes && Iw(element270, element270.properties))
            : target10 === ha
              ? (element270.position.x =
                  (v970 * clampNumber2(v972, 0, 100)) / 100 -
                  Number(element270.position.width || 100) / 2)
              : target10 === ba
                ? (element270.position.y =
                    (v971 * clampNumber2(v972, 0, 100)) / 100 -
                    Number(element270.position.height || 100) / 2)
                : target10 === Fo
                  ? (element270.style.scale = clampNumber2(v972, 1, 500) / 100)
                  : target10 === $i && Lt(arg785, w46, clampNumber2(v972, -360, 360));
      });
    }
  }));
for (const t of [Ly, Iy])
  t.addEventListener("click", (arg786) => {
    const w47 = w,
      closest45 = arg786.target.closest("[data-date-weekday]"),
      closest46 = arg786.target.closest("[data-date-lunar]");
    !w47 ||
      (!closest45 && !closest46) ||
      E((arg787) => {
        const v973 = findComponent2(arg787, w47)?.component;
        !v973 ||
          v973.type !== "date" ||
          ((v973.properties = {
            ...(v973.properties || {}),
          }),
          closest45 && (v973.properties.showWeekday = closest45.dataset.dateWeekday === "on"),
          closest46 && (v973.properties.showLunar = closest46.dataset.dateLunar === "on"),
          Iw(v973, v973.properties));
      });
  });
const lC = new Map([
    [Uy, "temperatureColor"],
    [Xy, "secondaryColor"],
  ]),
  dC = new Map([
    [
      jy,
      {
        property: "iconSize",
        minimum: 12,
        maximum: 500,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      qy,
      {
        property: "iconGap",
        minimum: 0,
        maximum: 300,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Gy,
      {
        property: "temperatureSize",
        minimum: 12,
        maximum: 500,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      _y,
      {
        property: "temperatureWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Yy,
      {
        property: "temperatureSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Ky,
      {
        property: "secondarySize",
        minimum: 10,
        maximum: 500,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Jy,
      {
        property: "secondaryWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Qy,
      {
        property: "secondarySpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      Zy,
      {
        property: "lineGap",
        minimum: 0,
        maximum: 200,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      ev,
      {
        property: "opacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
        resizes: false,
      },
    ],
  ]),
  Cm = new Set([va, wa, Do, Fi]);
function xI(arg788, arg789) {
  const v974 = Number(arg788.position?.width || 100),
    v975 = Number(arg788.position?.height || 100),
    v976 = Number(arg788.position?.x || 0) + v974 / 2,
    v977 = Number(arg788.position?.y || 0) + v975 / 2,
    { width: v978, height: v979 } = weatherComponentDimensions2(arg789);
  x?.previewComponentTransform(arg788.id, {
    x: v976 - v978 / 2,
    y: v977 - v979 / 2,
    width: v978,
    height: v979,
  });
}
(ya.addEventListener("input", (arg790) => {
  const f26 = F();
  if (!f26 || f26.type !== "weather") return;
  const target11 = arg790.target,
    v980 = lC.get(target11);
  if (v980) {
    x?.previewComponentProperties(f26.id, {
      [v980]: target11.value,
    });
    return;
  }
  const v981 = dC.get(target11);
  if (v981) {
    if (String(target11.value).trim() === "" || !Number.isFinite(Number(target11.value))) return;
    const v982 = clampNumber2(Number(target11.value), v981.minimum, v981.maximum) / v981.divisor,
      options71 = {
        ...(f26.properties || {}),
        [v981.property]: v982,
      };
    (x?.previewComponentProperties(f26.id, {
      [v981.property]: v982,
    }),
      v981.resizes && xI(f26, options71));
    return;
  }
  if (
    !Cm.has(target11) ||
    String(target11.value).trim() === "" ||
    !Number.isFinite(Number(target11.value))
  )
    return;
  const v983 = Number(target11.value),
    v984 = Number(g.document.canvas.width || 2778),
    v985 = Number(g.document.canvas.height || 1940),
    v986 = Number(f26.position?.width || 100),
    v987 = Number(f26.position?.height || 100);
  if (target11 === va) {
    const v988 = clampNumber2(v983, 0, 100);
    x?.previewComponentTransform(f26.id, {
      x: (v984 * v988) / 100 - v986 / 2,
    });
  } else {
    if (target11 === wa) {
      const v989 = clampNumber2(v983, 0, 100);
      x?.previewComponentTransform(f26.id, {
        y: (v985 * v989) / 100 - v987 / 2,
      });
    } else {
      if (target11 === Do) {
        const v990 = clampNumber2(v983, 1, 500);
        x?.previewComponentTransform(f26.id, {
          scale: v990 / 100,
        });
      } else {
        if (target11 === Fi) {
          const v991 = clampNumber2(v983, -360, 360);
          x?.previewComponentTransform(f26.id, {
            rotation: v991,
          });
        }
      }
    }
  }
}),
  ya.addEventListener("change", (arg791) => {
    const target12 = arg791.target,
      w48 = w;
    if (!w48) return;
    const v992 = lC.get(target12),
      v993 = dC.get(target12);
    if (!(!v992 && !v993 && !Cm.has(target12))) {
      if (
        (v993 || Cm.has(target12)) &&
        (String(target12.value).trim() === "" || !Number.isFinite(Number(target12.value)))
      ) {
        J();
        return;
      }
      E((arg792) => {
        const element271 = findComponent2(arg792, w48)?.component;
        if (!element271 || element271.type !== "weather") return;
        ((element271.properties = {
          ...(element271.properties || {}),
        }),
          (element271.position = {
            ...(element271.position || {}),
          }),
          (element271.style = {
            ...(element271.style || {}),
          }));
        const v994 = Number(arg792.canvas.width || 2778),
          v995 = Number(arg792.canvas.height || 1940),
          v996 = Number(target12.value);
        v992
          ? (element271.properties[v992] = target12.value)
          : v993
            ? ((element271.properties[v993.property] =
                clampNumber2(v996, v993.minimum, v993.maximum) / v993.divisor),
              v993.resizes && Tw(element271, element271.properties))
            : target12 === va
              ? (element271.position.x =
                  (v994 * clampNumber2(v996, 0, 100)) / 100 -
                  Number(element271.position.width || 100) / 2)
              : target12 === wa
                ? (element271.position.y =
                    (v995 * clampNumber2(v996, 0, 100)) / 100 -
                    Number(element271.position.height || 100) / 2)
                : target12 === Do
                  ? (element271.style.scale = clampNumber2(v996, 1, 500) / 100)
                  : target12 === Fi && Lt(arg792, w48, clampNumber2(v996, -360, 360));
      });
    }
  }));
for (const t of [Vy, Wy, Ry, Hy])
  t.addEventListener("click", (arg793) => {
    const w49 = w,
      closest47 = arg793.target.closest("button");
    if (!w49 || !closest47) return;
    const v997 = [
      ["weatherIconVisible", "iconVisible"],
      ["weatherTemperatureVisible", "temperatureVisible"],
      ["weatherConditionVisible", "conditionVisible"],
      ["weatherHumidityVisible", "humidityVisible"],
    ].find(([v998]) => closest47.dataset[v998] !== undefined);
    if (!v997) return;
    const [v999, v1000] = v997;
    E((arg794) => {
      const v1001 = findComponent2(arg794, w49)?.component;
      !v1001 ||
        v1001.type !== "weather" ||
        ((v1001.properties = {
          ...(v1001.properties || {}),
          [v1000]: closest47.dataset[v999] === "on",
        }),
        Tw(v1001, v1001.properties));
    });
  });
const uC = new Map([
    [iv, "valueColor"],
    [rv, "statePrecision"],
    [Ou, "thresholdMode"],
  ]),
  pC = new Map([
    [
      ov,
      {
        property: "valueScale",
        minimum: 10,
        maximum: 500,
        divisor: 1,
      },
    ],
    [
      av,
      {
        property: "valueOffsetX",
        minimum: -100,
        maximum: 100,
        divisor: 1,
      },
    ],
    [
      sv,
      {
        property: "valueOffsetY",
        minimum: -100,
        maximum: 100,
        divisor: 1,
      },
    ],
    [
      cv,
      {
        property: "updateInterval",
        minimum: 30,
        maximum: 86400,
        divisor: 1,
      },
    ],
    [
      lv,
      {
        property: "hours",
        minimum: 1,
        maximum: 168,
        divisor: 1,
      },
    ],
    [
      dv,
      {
        property: "cornerRadius",
        minimum: 0,
        maximum: 50,
        divisor: 1,
      },
    ],
  ]),
  Sm = new Set([Sa, xa, zi, Vi, zo, Wi]);
(Ca.addEventListener("input", (arg795) => {
  const f27 = F();
  if (!f27 || f27.type !== "line-chart") return;
  const target13 = arg795.target,
    v1002 = uC.get(target13),
    v1003 = pC.get(target13);
  if (v1002) {
    x?.previewComponentProperties(f27.id, {
      [v1002]: target13.value,
    });
    return;
  }
  if (v1003) {
    if (String(target13.value).trim() === "" || !Number.isFinite(Number(target13.value))) return;
    const v1004 = clampNumber2(Number(target13.value), v1003.minimum, v1003.maximum);
    ["updateInterval", "hours"].includes(v1003.property) ||
      x?.previewComponentProperties(f27.id, {
        [v1003.property]: v1004 / v1003.divisor,
      });
    return;
  }
  if (Di.findIndex((arg796) => arg796.value === target13 || arg796.color === target13) >= 0) {
    const map38 = Di.map((arg797) => ({
      value: Number(arg797.value.value),
      color: arg797.color.value,
    }));
    map38.every((arg798) => Number.isFinite(arg798.value)) &&
      x?.previewComponentProperties(f27.id, {
        thresholdMode: "manual",
        thresholds: map38,
      });
    return;
  }
  if (
    !Sm.has(target13) ||
    String(target13.value).trim() === "" ||
    !Number.isFinite(Number(target13.value))
  )
    return;
  const v1005 = Number(target13.value),
    v1006 = Number(g.document.canvas.width || 2778),
    v1007 = Number(g.document.canvas.height || 1940),
    v1008 = Number(f27.position?.width || 100),
    v1009 = Number(f27.position?.height || 100),
    v1010 = Number(f27.position?.x || 0) + v1008 / 2,
    v1011 = Number(f27.position?.y || 0) + v1009 / 2;
  if (target13 === Sa)
    x?.previewComponentTransform(f27.id, {
      x: (v1006 * clampNumber2(v1005, 0, 100)) / 100 - v1008 / 2,
    });
  else {
    if (target13 === xa)
      x?.previewComponentTransform(f27.id, {
        y: (v1007 * clampNumber2(v1005, 0, 100)) / 100 - v1009 / 2,
      });
    else {
      if (target13 === zi) {
        const v1012 = (v1006 * clampNumber2(v1005, 0.1, 100)) / 100;
        x?.previewComponentTransform(f27.id, {
          x: v1010 - v1012 / 2,
          width: v1012,
        });
      } else {
        if (target13 === Vi) {
          const v1013 = (v1007 * clampNumber2(v1005, 0.1, 100)) / 100;
          x?.previewComponentTransform(f27.id, {
            y: v1011 - v1013 / 2,
            height: v1013,
          });
        } else
          target13 === zo
            ? x?.previewComponentTransform(f27.id, {
                scale: clampNumber2(v1005, 1, 500) / 100,
              })
            : target13 === Wi &&
              x?.previewComponentTransform(f27.id, {
                rotation: clampNumber2(v1005, -360, 360),
              });
      }
    }
  }
}),
  Ca.addEventListener("change", (arg799) => {
    const target14 = arg799.target,
      w50 = w;
    if (!w50) return;
    const v1014 = uC.get(target14),
      v1015 = pC.get(target14),
      index8 = Di.findIndex((arg800) => arg800.value === target14 || arg800.color === target14);
    if (!(!v1014 && !v1015 && index8 < 0 && !Sm.has(target14))) {
      if (
        (v1015 || Sm.has(target14) || (index8 >= 0 && target14.type === "number")) &&
        (String(target14.value).trim() === "" || !Number.isFinite(Number(target14.value)))
      ) {
        J();
        return;
      }
      E((arg801) => {
        const element272 = findComponent2(arg801, w50)?.component;
        if (!element272 || element272.type !== "line-chart") return;
        ((element272.properties = {
          ...(element272.properties || {}),
        }),
          (element272.position = {
            ...(element272.position || {}),
          }),
          (element272.style = {
            ...(element272.style || {}),
          }));
        const v1016 = Number(arg801.canvas.width || 2778),
          v1017 = Number(arg801.canvas.height || 1940),
          v1018 = Number(element272.position.width || 100),
          v1019 = Number(element272.position.height || 100),
          v1020 = Number(element272.position.x || 0) + v1018 / 2,
          v1021 = Number(element272.position.y || 0) + v1019 / 2,
          v1022 = Number(target14.value);
        v1014
          ? ((element272.properties[v1014] = target14.value),
            target14 === Ou &&
              target14.value === "manual" &&
              !(
                Array.isArray(element272.properties.thresholds) &&
                element272.properties.thresholds.some((arg802) =>
                  Number.isFinite(Number(arg802?.value)),
                )
              ) &&
              (element272.properties.thresholds = Di.map((arg803) => ({
                value: Number(arg803.value.value),
                color: arg803.color.value,
              }))))
          : v1015
            ? (element272.properties[v1015.property] =
                clampNumber2(v1022, v1015.minimum, v1015.maximum) / v1015.divisor)
            : index8 >= 0
              ? ((element272.properties.thresholdMode = "manual"),
                (element272.properties.thresholds = Di.map((arg804) => ({
                  value: Number(arg804.value.value),
                  color: arg804.color.value,
                }))))
              : target14 === Sa
                ? (element272.position.x = (v1016 * clampNumber2(v1022, 0, 100)) / 100 - v1018 / 2)
                : target14 === xa
                  ? (element272.position.y =
                      (v1017 * clampNumber2(v1022, 0, 100)) / 100 - v1019 / 2)
                  : target14 === zi
                    ? ((element272.position.width = (v1016 * clampNumber2(v1022, 0.1, 100)) / 100),
                      (element272.position.x = v1020 - element272.position.width / 2))
                    : target14 === Vi
                      ? ((element272.position.height =
                          (v1017 * clampNumber2(v1022, 0.1, 100)) / 100),
                        (element272.position.y = v1021 - element272.position.height / 2))
                      : target14 === zo
                        ? (element272.style.scale = clampNumber2(v1022, 1, 500) / 100)
                        : target14 === Wi && Lt(arg801, w50, clampNumber2(v1022, -360, 360));
      });
    }
  }),
  nv.addEventListener("click", (arg805) => {
    const closest48 = arg805.target.closest("[data-line-chart-value-visible]"),
      w51 = w;
    !closest48 ||
      !w51 ||
      E((arg806) => {
        const v1023 = findComponent2(arg806, w51)?.component;
        !v1023 ||
          v1023.type !== "line-chart" ||
          (v1023.properties = {
            ...(v1023.properties || {}),
            valueVisible: closest48.dataset.lineChartValueVisible === "on",
          });
      });
  }));
const mC = new Map([
    [fv, "mainColor"],
    [xv, "secondaryColor"],
    [kv, "edgeColor"],
    [Dv, "glowColor"],
  ]),
  fC = new Map([
    [
      gv,
      {
        property: "mainSize",
        minimum: 8,
        maximum: 500,
        divisor: 1,
      },
    ],
    [
      hv,
      {
        property: "mainWeight",
        minimum: 0,
        maximum: 3,
        divisor: 1,
      },
    ],
    [
      bv,
      {
        property: "mainOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      yv,
      {
        property: "mainSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
      },
    ],
    [
      vv,
      {
        property: "mainTextLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      wv,
      {
        property: "mainTextTop",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      Nv,
      {
        property: "secondarySize",
        minimum: 6,
        maximum: 500,
        divisor: 1,
      },
    ],
    [
      Ev,
      {
        property: "secondaryWeight",
        minimum: 0,
        maximum: 3,
        divisor: 1,
      },
    ],
    [
      Lv,
      {
        property: "secondaryOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      Iv,
      {
        property: "secondarySpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
      },
    ],
    [
      Tv,
      {
        property: "secondaryTextLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      Av,
      {
        property: "secondaryTextTop",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      Mv,
      {
        property: "edgeWidth",
        minimum: 0,
        maximum: 20,
        divisor: 1,
      },
    ],
    [
      Ov,
      {
        property: "edgeOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      Bv,
      {
        property: "radius",
        minimum: 0,
        maximum: 50,
        divisor: 100,
      },
    ],
    [
      $v,
      {
        property: "edgeAngle",
        minimum: 0,
        maximum: 360,
        divisor: 1,
      },
    ],
    [
      zv,
      {
        property: "glowStrength",
        minimum: 0,
        maximum: 500,
        divisor: 100,
      },
    ],
    [
      Vv,
      {
        property: "glowSize",
        minimum: 0,
        maximum: 300,
        divisor: 100,
      },
    ],
    [
      Wv,
      {
        property: "glowAngle",
        minimum: 0,
        maximum: 360,
        divisor: 1,
      },
    ],
  ]),
  xm = new Set([Ea, La, Ri, Hi, Vo, ji]);
(Na.addEventListener("input", (arg807) => {
  const f28 = F();
  if (!f28 || f28.type !== "panel-frame") return;
  const target15 = arg807.target,
    v1024 = mC.get(target15),
    v1025 = fC.get(target15);
  if (v1024) {
    x?.previewComponentProperties(f28.id, {
      [v1024]: target15.value,
    });
    return;
  }
  if (v1025) {
    if (String(target15.value).trim() === "" || !Number.isFinite(Number(target15.value))) return;
    const v1026 = clampNumber2(Number(target15.value), v1025.minimum, v1025.maximum);
    x?.previewComponentProperties(f28.id, {
      [v1025.property]: v1026 / v1025.divisor,
    });
    return;
  }
  if (
    !xm.has(target15) ||
    String(target15.value).trim() === "" ||
    !Number.isFinite(Number(target15.value))
  )
    return;
  const v1027 = Number(target15.value),
    v1028 = Number(g.document.canvas.width || 2778),
    v1029 = Number(g.document.canvas.height || 1940),
    v1030 = Number(f28.position?.width || 100),
    v1031 = Number(f28.position?.height || 100),
    v1032 = Number(f28.position?.x || 0) + v1030 / 2,
    v1033 = Number(f28.position?.y || 0) + v1031 / 2;
  if (target15 === Ea)
    x?.previewComponentTransform(f28.id, {
      x: (v1028 * clampNumber2(v1027, 0, 100)) / 100 - v1030 / 2,
    });
  else {
    if (target15 === La)
      x?.previewComponentTransform(f28.id, {
        y: (v1029 * clampNumber2(v1027, 0, 100)) / 100 - v1031 / 2,
      });
    else {
      if (target15 === Ri) {
        const v1034 = (v1028 * clampNumber2(v1027, 0.1, 100)) / 100;
        x?.previewComponentTransform(f28.id, {
          x: v1032 - v1034 / 2,
          width: v1034,
        });
      } else {
        if (target15 === Hi) {
          const v1035 = (v1029 * clampNumber2(v1027, 0.1, 100)) / 100;
          x?.previewComponentTransform(f28.id, {
            y: v1033 - v1035 / 2,
            height: v1035,
          });
        } else
          target15 === Vo
            ? x?.previewComponentTransform(f28.id, {
                scale: clampNumber2(v1027, 1, 500) / 100,
              })
            : target15 === ji &&
              x?.previewComponentTransform(f28.id, {
                rotation: clampNumber2(v1027, -360, 360),
              });
      }
    }
  }
}),
  Na.addEventListener("change", (arg808) => {
    const target16 = arg808.target,
      w52 = w;
    if (!w52) return;
    const v1036 = mC.get(target16),
      v1037 = fC.get(target16);
    if (!(!v1036 && !v1037 && !xm.has(target16))) {
      if (
        (v1037 || xm.has(target16)) &&
        (String(target16.value).trim() === "" || !Number.isFinite(Number(target16.value)))
      ) {
        J();
        return;
      }
      E((arg809) => {
        const element273 = findComponent2(arg809, w52)?.component;
        if (!element273 || element273.type !== "panel-frame") return;
        ((element273.properties = {
          ...(element273.properties || {}),
        }),
          (element273.position = {
            ...(element273.position || {}),
          }),
          (element273.style = {
            ...(element273.style || {}),
          }));
        const v1038 = Number(arg809.canvas.width || 2778),
          v1039 = Number(arg809.canvas.height || 1940),
          v1040 = Number(element273.position.width || 100),
          v1041 = Number(element273.position.height || 100),
          v1042 = Number(element273.position.x || 0) + v1040 / 2,
          v1043 = Number(element273.position.y || 0) + v1041 / 2,
          v1044 = Number(target16.value);
        v1036
          ? (element273.properties[v1036] = target16.value)
          : v1037
            ? (element273.properties[v1037.property] =
                clampNumber2(v1044, v1037.minimum, v1037.maximum) / v1037.divisor)
            : target16 === Ea
              ? (element273.position.x = (v1038 * clampNumber2(v1044, 0, 100)) / 100 - v1040 / 2)
              : target16 === La
                ? (element273.position.y = (v1039 * clampNumber2(v1044, 0, 100)) / 100 - v1041 / 2)
                : target16 === Ri
                  ? ((element273.position.width = (v1038 * clampNumber2(v1044, 0.1, 100)) / 100),
                    (element273.position.x = v1042 - element273.position.width / 2))
                  : target16 === Hi
                    ? ((element273.position.height = (v1039 * clampNumber2(v1044, 0.1, 100)) / 100),
                      (element273.position.y = v1043 - element273.position.height / 2))
                    : target16 === Vo
                      ? (element273.style.scale = clampNumber2(v1044, 1, 500) / 100)
                      : target16 === ji && Lt(arg809, w52, clampNumber2(v1044, -360, 360));
      });
    }
  }));
for (const [t, e] of [
  [pv, "mainTextVisible"],
  [Cv, "secondaryTextVisible"],
  [Pv, "edgeVisible"],
  [Fv, "glowVisible"],
])
  t.addEventListener("click", () => {
    const w53 = w;
    w53 &&
      E((arg810) => {
        const v1045 = findComponent2(arg810, w53)?.component;
        !v1045 ||
          v1045.type !== "panel-frame" ||
          (v1045.properties = {
            ...(v1045.properties || {}),
            [e]: v1045.properties?.[e] === false,
          });
      });
  });
const Nm = new Map([
    [Du, "mainText"],
    [zu, "secondaryText"],
    [Rv, "mainColor"],
    [Hv, "secondaryColor"],
    [Zv, "iconColor"],
    [o0, "frameColor"],
    [a0, "glowColor"],
  ]),
  Em = new Map([
    [
      jv,
      {
        property: "mainSize",
        minimum: 1,
        maximum: 500,
        divisor: 1,
      },
    ],
    [
      qv,
      {
        property: "secondarySize",
        minimum: 1,
        maximum: 500,
        divisor: 1,
      },
    ],
    [
      Uv,
      {
        property: "mainWeight",
        minimum: 0,
        maximum: 3,
        divisor: 1,
      },
    ],
    [
      Gv,
      {
        property: "secondaryWeight",
        minimum: 0,
        maximum: 3,
        divisor: 1,
      },
    ],
    [
      _v,
      {
        property: "mainSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
      },
    ],
    [
      Yv,
      {
        property: "secondarySpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
      },
    ],
    [
      Xv,
      {
        property: "mainTextLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      Kv,
      {
        property: "mainTextTop",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      Jv,
      {
        property: "secondaryTextLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      Qv,
      {
        property: "secondaryTextTop",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      qu,
      {
        property: "textIdleOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      Uu,
      {
        property: "textActiveOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      e0,
      {
        property: "iconSize",
        minimum: 1,
        maximum: 500,
        divisor: 1,
      },
    ],
    [
      t0,
      {
        property: "iconLeft",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      n0,
      {
        property: "iconTop",
        minimum: -100,
        maximum: 200,
        divisor: 1,
      },
    ],
    [
      Gu,
      {
        property: "iconIdleOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      _u,
      {
        property: "iconActiveOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      i0,
      {
        property: "frameWidth",
        minimum: 0,
        maximum: 20,
        divisor: 1,
      },
    ],
    [
      Yu,
      {
        property: "frameIdleOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      Xu,
      {
        property: "frameActiveOpacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
      },
    ],
    [
      c0,
      {
        property: "radius",
        minimum: 0,
        maximum: 50,
        divisor: 100,
      },
    ],
    [
      r0,
      {
        property: "frameAngle",
        minimum: 0,
        maximum: 360,
        divisor: 1,
      },
    ],
    [
      s0,
      {
        property: "glowAngle",
        minimum: 0,
        maximum: 360,
        divisor: 1,
      },
    ],
    [
      Ku,
      {
        property: "glowIdleStrength",
        minimum: 0,
        maximum: 500,
        divisor: 100,
      },
    ],
    [
      Ju,
      {
        property: "glowIdleSize",
        minimum: 0,
        maximum: 300,
        divisor: 100,
      },
    ],
    [
      Qu,
      {
        property: "glowActiveStrength",
        minimum: 0,
        maximum: 500,
        divisor: 100,
      },
    ],
    [
      Zu,
      {
        property: "glowActiveSize",
        minimum: 0,
        maximum: 300,
        divisor: 100,
      },
    ],
  ]),
  gC = new Map([
    [qu, "off"],
    [Gu, "off"],
    [Yu, "off"],
    [Ku, "off"],
    [Ju, "off"],
    [Uu, "on"],
    [_u, "on"],
    [Xu, "on"],
    [Qu, "on"],
    [Zu, "on"],
  ]);
function NI(arg811) {
  if (arg811) {
    for (const element274 of $u.querySelectorAll("[data-navigation-preview]"))
      element274.classList.toggle("active", element274.dataset.navigationPreview === arg811);
  }
}
function hC(arg812, arg813) {
  if (!arg812) return;
  const text73 = ["on", "off"].includes(arg813) ? arg813 : "auto";
  (text73 === "auto" ? _i.delete(arg812) : _i.set(arg812, text73),
    x?.setComponentPreviewState(arg812, text73),
    arg812 === w && NI(text73));
}
function Lm(arg814) {
  const v1046 = gC.get(arg814),
    f29 = F();
  return !v1046 || !Re(f29) ? null : (hC(f29.id, v1046), v1046);
}
const Im = new Set([ka, Ma, Ro, Ho, _n, jo]);
function EI(arg815) {
  const v1047 = Nm.get(arg815);
  if (v1047 && Ss[v1047]) return v1047;
  const v1048 = Em.get(arg815)?.property;
  return v1048 && Ss[v1048]
    ? v1048
    : arg815 === Ro
      ? "width"
      : arg815 === Ho
        ? "height"
        : arg815 === _n
          ? "scale"
          : arg815 === jo
            ? "rotation"
            : "";
}
(Wo.addEventListener("input", (arg816) => {
  const f30 = F();
  if (!f30 || !Re(f30)) return;
  const target17 = arg816.target,
    v1049 = Nm.get(target17);
  if (v1049) {
    Yw.has(target17) ||
      x?.previewComponentProperties(f30.id, {
        [v1049]: target17.value,
      });
    return;
  }
  const v1050 = Em.get(target17);
  if (v1050) {
    if (String(target17.value).trim() === "" || !Number.isFinite(Number(target17.value))) return;
    const v1051 = clampNumber2(Number(target17.value), v1050.minimum, v1050.maximum);
    (Lm(target17),
      x?.previewComponentProperties(f30.id, {
        [v1050.property]: v1051 / v1050.divisor,
      }));
    return;
  }
  if (
    !Im.has(target17) ||
    String(target17.value).trim() === "" ||
    !Number.isFinite(Number(target17.value))
  )
    return;
  const v1052 = Number(target17.value),
    v1053 = Number(g.document.canvas.width || 2778),
    v1054 = Number(g.document.canvas.height || 1940),
    v1055 = Number(f30.position?.width || 100),
    v1056 = Number(f30.position?.height || 100);
  if (target17 === ka) {
    const v1057 = clampNumber2(v1052, 0, 100);
    x?.previewComponentTransform(f30.id, {
      x: (v1053 * v1057) / 100 - v1055 / 2,
    });
  } else {
    if (target17 === Ma) {
      const v1058 = clampNumber2(v1052, 0, 100);
      x?.previewComponentTransform(f30.id, {
        y: (v1054 * v1058) / 100 - v1056 / 2,
      });
    } else {
      if (target17 === Ro) {
        const v1059 = clampNumber2(v1052, 0.1, 100),
          v1060 = (v1053 * v1059) / 100,
          v1061 = Number(f30.position?.x || 0) + v1055 / 2;
        x?.previewComponentTransform(f30.id, {
          x: v1061 - v1060 / 2,
          width: v1060,
        });
      } else {
        if (target17 === Ho) {
          const v1062 = clampNumber2(v1052, 0.1, 100),
            v1063 = (v1054 * v1062) / 100,
            v1064 = Number(f30.position?.y || 0) + v1056 / 2;
          x?.previewComponentTransform(f30.id, {
            y: v1064 - v1063 / 2,
            height: v1063,
          });
        } else {
          if (target17 === _n) {
            const v1065 = clampNumber2(v1052, 1, 500);
            x?.previewComponentTransform(f30.id, {
              scale: v1065 / 100,
            });
          } else {
            if (target17 === jo) {
              const v1066 = clampNumber2(v1052, -360, 360);
              x?.previewComponentTransform(f30.id, {
                rotation: v1066,
              });
            }
          }
        }
      }
    }
  }
}),
  Wo.addEventListener("focusin", (arg817) => {
    Lm(arg817.target);
  }),
  Wo.addEventListener("change", (arg818) => {
    const target18 = arg818.target,
      w54 = w;
    if (!w54) return;
    const v1067 = Nm.get(target18),
      v1068 = Em.get(target18),
      v1069 = gC.get(target18),
      eI2 = EI(target18);
    if (!(target18 !== Fc && !v1067 && !v1068 && !Im.has(target18))) {
      if (
        (v1068 || Im.has(target18)) &&
        (String(target18.value).trim() === "" || !Number.isFinite(Number(target18.value)))
      ) {
        J();
        return;
      }
      (v1069 && Lm(target18),
        E((arg819) => {
          const element275 = findComponent2(arg819, w54)?.component;
          if (!element275 || !Re(element275)) return;
          ((element275.properties = {
            ...(element275.properties || {}),
          }),
            (element275.position = {
              ...(element275.position || {}),
            }),
            (element275.style = {
              ...(element275.style || {}),
            }),
            (element275.actions = {
              ...(element275.actions || {}),
            }));
          const $e6 = eI2 ? $e(element275, eI2) : undefined,
            v1070 = Number(arg819.canvas.width || 2778),
            v1071 = Number(arg819.canvas.height || 1940),
            v1072 = Number(target18.value);
          if (target18 === Fc) element275.properties.label = target18.value.trim();
          else {
            if (v1067) element275.properties[v1067] = target18.value;
            else {
              if (v1068)
                element275.properties[v1068.property] =
                  clampNumber2(v1072, v1068.minimum, v1068.maximum) / v1068.divisor;
              else {
                if (target18 === ka)
                  element275.position.x =
                    (v1070 * clampNumber2(v1072, 0, 100)) / 100 -
                    Number(element275.position.width || 100) / 2;
                else {
                  if (target18 === Ma)
                    element275.position.y =
                      (v1071 * clampNumber2(v1072, 0, 100)) / 100 -
                      Number(element275.position.height || 100) / 2;
                  else {
                    if (target18 === Ro) {
                      const v1073 = (v1070 * clampNumber2(v1072, 0.1, 100)) / 100,
                        v1074 =
                          Number(element275.position.x || 0) +
                          Number(element275.position.width || 100) / 2;
                      ((element275.position.x = v1074 - v1073 / 2),
                        (element275.position.width = v1073));
                    } else {
                      if (target18 === Ho) {
                        const v1075 = (v1071 * clampNumber2(v1072, 0.1, 100)) / 100,
                          v1076 =
                            Number(element275.position.y || 0) +
                            Number(element275.position.height || 100) / 2;
                        ((element275.position.y = v1076 - v1075 / 2),
                          (element275.position.height = v1075));
                      } else
                        target18 === _n
                          ? (element275.style.scale = clampNumber2(v1072, 1, 500) / 100)
                          : target18 === jo && Lt(arg819, w54, clampNumber2(v1072, -360, 360));
                    }
                  }
                }
              }
            }
          }
          eI2 && uo(w54, eI2, $e6, $e(element275, eI2));
        }));
    }
  }));
const LI = new Map([
  [Vu, "mainTextVisible"],
  [Wu, "secondaryTextVisible"],
  [Ru, "iconVisible"],
  [Hu, "frameVisible"],
  [ju, "glowVisible"],
]);
for (const [t, e] of LI)
  t.addEventListener("click", () => {
    const w55 = w;
    w55 &&
      E((arg820) => {
        const v1077 = findComponent2(arg820, w55)?.component;
        if (!v1077 || !Re(v1077)) return;
        const $e7 = $e(v1077, e);
        ((v1077.properties = {
          ...(v1077.properties || {}),
          [e]: v1077.properties?.[e] === false,
        }),
          uo(w55, e, $e7, $e(v1077, e)));
      });
  });
$u.addEventListener("click", (arg821) => {
  const closest49 = arg821.target.closest("[data-navigation-preview]"),
    w56 = w;
  if (!closest49 || !w56) return;
  const navigationPreview = ["off", "on"].includes(closest49.dataset.navigationPreview)
    ? closest49.dataset.navigationPreview
    : "auto";
  hC(w56, navigationPreview);
});
const II = {
    valueVisible: true,
    statePrecision: "auto",
    valueScale: 100,
    valueColor: "#dce1e5",
    valueOffsetX: 0,
    valueOffsetY: 0,
    updateInterval: 600,
    hours: 24,
    cornerRadius: 10,
    thresholdMode: "auto",
  },
  bC = {
    valueVisible: {
      group: "当前数值",
      label: "当前数值显示",
    },
    statePrecision: {
      group: "当前数值",
      label: "数值小数位",
    },
    valueScale: {
      group: "当前数值",
      label: "当前数值大小",
    },
    valueColor: {
      group: "当前数值",
      label: "当前数值颜色",
    },
    valueOffsetX: {
      group: "当前数值",
      label: "当前数值左右位置",
    },
    valueOffsetY: {
      group: "当前数值",
      label: "当前数值上下位置",
    },
    updateInterval: {
      group: "历史数据",
      label: "刷新间隔",
    },
    hours: {
      group: "历史数据",
      label: "历史范围",
    },
    cornerRadius: {
      group: "折线",
      label: "圆角大小",
    },
    thresholdMode: {
      group: "折线",
      label: "阈值模式",
    },
    thresholds: {
      group: "折线",
      label: "阈值与折线颜色",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };
function El(arg822, arg823) {
  if (arg822)
    return arg823 === "width" || arg823 === "height"
      ? Number(arg822.position?.[arg823] || 100)
      : arg823 === "scale"
        ? Number(arg822.style?.scale || 1)
        : arg823 === "rotation"
          ? Number(arg822.position?.rotation || 0)
          : (arg822.properties?.[arg823] ?? clone2(II[arg823]));
}
function yC(arg824) {
  if (!arg824 || arg824.type !== "line-chart") return [];
  let v1078 = Xi.get(arg824.id);
  return (
    v1078 ||
      ((v1078 = clone2(findComponent2(Ye, arg824.id)?.component || arg824)),
      Xi.set(arg824.id, v1078)),
    Object.keys(bC).filter(
      (arg825) => JSON.stringify(El(arg824, arg825)) !== JSON.stringify(El(v1078, arg825)),
    )
  );
}
function TI(arg826, arg827, v1079 = g?.document) {
  if (typeof arg827 == "boolean") return arg827 ? "显示" : "隐藏";
  if (arg826 === "width" || arg826 === "height") {
    const v1080 = Number(v1079?.canvas?.[arg826] || (arg826 === "width" ? 2778 : 1940));
    return roundField2((Number(arg827 || 0) / v1080) * 100) + "%";
  }
  return arg826 === "scale"
    ? roundField2(Number(arg827 || 0) * 100) + "%"
    : arg826 === "rotation"
      ? roundField2(Number(arg827 || 0)) + "°"
      : ["valueScale", "valueOffsetX", "valueOffsetY", "cornerRadius"].includes(arg826)
        ? roundField2(Number(arg827 || 0)) + "%"
        : arg826 === "updateInterval"
          ? roundField2(Number(arg827 || 0)) + " 秒"
          : arg826 === "hours"
            ? roundField2(Number(arg827 || 0)) + " 小时"
            : arg826 === "thresholds"
              ? (Array.isArray(arg827) ? arg827.length : 0) + " 段配色"
              : String(arg827 ?? "");
}
const AI = {
    mainTextVisible: true,
    secondaryTextVisible: true,
    mainColor: "#b9bbc0",
    secondaryColor: "#70737b",
    mainSize: 34,
    secondarySize: 12,
    mainWeight: 0.3,
    secondaryWeight: 0.2,
    mainSpacing: 1,
    secondarySpacing: 2,
    secondaryLineGap: 2,
    mainTextLeft: 5.5,
    mainTextTop: 45,
    secondaryTextLeft: 54,
    secondaryTextTop: 43,
    iconVisible: true,
    iconColor: "#b9bbc0",
    iconSize: 30,
    iconLeft: 50,
    iconTop: 45,
    frameVisible: true,
    frameColor: "#60636a",
    frameWidth: 1.5,
    frameSize: 100,
    frameSpacing: 100,
    frameOffsetX: 0,
    frameOffsetY: 0,
    markerVisible: true,
    markerColor: "#f2a20d",
    markerSize: 10,
    markerLeft: 1.8,
    markerTop: 84,
  },
  vC = {
    mainTextVisible: {
      group: "中文标题",
      label: "中文标题显示",
    },
    mainColor: {
      group: "中文标题",
      label: "中文题色",
    },
    mainSize: {
      group: "中文标题",
      label: "中文大小",
    },
    mainWeight: {
      group: "中文标题",
      label: "中文粗细",
    },
    mainSpacing: {
      group: "中文标题",
      label: "中文字间距",
    },
    mainTextLeft: {
      group: "中文标题",
      label: "中文左右位置",
    },
    mainTextTop: {
      group: "中文标题",
      label: "中文上下位置",
    },
    secondaryTextVisible: {
      group: "英文标题",
      label: "英文标题显示",
    },
    secondaryColor: {
      group: "英文标题",
      label: "英文颜色",
    },
    secondarySize: {
      group: "英文标题",
      label: "英文大小",
    },
    secondaryWeight: {
      group: "英文标题",
      label: "英文粗细",
    },
    secondarySpacing: {
      group: "英文标题",
      label: "英文字间距",
    },
    secondaryLineGap: {
      group: "英文标题",
      label: "英文行间距",
    },
    secondaryTextLeft: {
      group: "英文标题",
      label: "英文左右位置",
    },
    secondaryTextTop: {
      group: "英文标题",
      label: "英文上下位置",
    },
    iconVisible: {
      group: "图标",
      label: "图标显示",
    },
    iconColor: {
      group: "图标",
      label: "图标颜色",
    },
    iconSize: {
      group: "图标",
      label: "图标大小",
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置",
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置",
    },
    frameVisible: {
      group: "括号",
      label: "括号显示",
    },
    frameColor: {
      group: "括号",
      label: "括号颜色",
    },
    frameWidth: {
      group: "括号",
      label: "括号粗细",
    },
    frameSize: {
      group: "括号",
      label: "括号大小",
    },
    frameSpacing: {
      group: "括号",
      label: "括号间距",
    },
    frameOffsetX: {
      group: "括号",
      label: "括号左右位置",
    },
    frameOffsetY: {
      group: "括号",
      label: "括号上下位置",
    },
    markerVisible: {
      group: "三角指示",
      label: "三角指示显示",
    },
    markerColor: {
      group: "三角指示",
      label: "三角指示颜色",
    },
    markerSize: {
      group: "三角指示",
      label: "三角指示大小",
    },
    markerLeft: {
      group: "三角指示",
      label: "三角指示左右位置",
    },
    markerTop: {
      group: "三角指示",
      label: "三角指示上下位置",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };
function Ll(arg828, arg829) {
  if (arg828)
    return arg829 === "width" || arg829 === "height"
      ? Number(arg828.position?.[arg829] || 100)
      : arg829 === "scale"
        ? Number(arg828.style?.scale || 1)
        : arg829 === "rotation"
          ? Number(arg828.position?.rotation || 0)
          : (arg828.properties?.[arg829] ?? AI[arg829]);
}
function wC(arg830) {
  if (!arg830 || arg830.type !== "title-button") return [];
  const v1081 = findComponent2(Ye, arg830.id)?.component || arg830;
  return Object.keys(vC).filter(
    (arg831) => JSON.stringify(Ll(arg830, arg831)) !== JSON.stringify(Ll(v1081, arg831)),
  );
}
function PI(arg832, arg833, v1082 = g?.document) {
  if (typeof arg833 == "boolean") return arg833 ? "显示" : "隐藏";
  if (arg832 === "width" || arg832 === "height") {
    const v1083 = Number(v1082?.canvas?.[arg832] || (arg832 === "width" ? 2778 : 1940));
    return roundField2((Number(arg833 || 0) / v1083) * 100) + "%";
  }
  return arg832 === "scale"
    ? roundField2(Number(arg833 || 0) * 100) + "%"
    : arg832 === "rotation"
      ? roundField2(Number(arg833 || 0)) + "°"
      : [
            "mainSize",
            "secondarySize",
            "mainSpacing",
            "secondarySpacing",
            "secondaryLineGap",
            "mainTextLeft",
            "mainTextTop",
            "secondaryTextLeft",
            "secondaryTextTop",
            "iconSize",
            "iconLeft",
            "iconTop",
            "frameSize",
            "frameSpacing",
            "frameOffsetX",
            "frameOffsetY",
            "markerSize",
            "markerLeft",
            "markerTop",
          ].includes(arg832)
        ? roundField2(Number(arg833 || 0)) + "%"
        : String(arg833 ?? "");
}
const kI = {
    buttonVisible: true,
    effectVisible: true,
    icon: "mdi:lightbulb-outline",
    iconOffColor: "#9aa5ad",
    iconOnColor: "#ffffff",
    iconSize: 44,
    buttonOffColor: "#17242d",
    buttonOnColor: "#1f91b8",
    buttonOpacity: 0.92,
    frameColor: "#dcebf2",
    frameWidth: 1.5,
    frameOpacity: 0.72,
    radius: 50,
    glowColor: "#43c8f0",
    glowOffStrength: 0,
    glowOnStrength: 1,
    effectColorTemperatureRealtime: true,
    effectBrightnessRealtime: true,
    effectOpacity: 1,
    effectFadeDuration: 0.52,
    effectLayoutMode: "free",
    effectLeft: 50,
    effectTop: 50,
    effectScale: 1,
    effectRotation: 0,
  },
  MI = {
    iconVisible: true,
    mainTextVisible: true,
    secondaryTextVisible: true,
    iconOffColor: "#9aa5ad",
    iconOnColor: "#73c8ff",
    badgeColor: "#5b5e66",
    badgeOpacity: 0.58,
    symbolSize: 14,
    badgeSize: 28,
    iconLeft: 20,
    iconTop: 50,
    mainColor: "#c7c8cb",
    mainSize: 21,
    mainWeight: 0.24,
    mainSpacing: 0.5,
    mainTextLeft: 39,
    mainTextTop: 40,
    secondaryColor: "#75777d",
    secondarySize: 12,
    secondaryWeight: 0.12,
    secondarySpacing: 0.3,
    secondaryTextLeft: 39,
    secondaryTextTop: 67,
    airflowVisible: true,
    airflowMotion: "dynamic",
    airflowCoolColor: "#73c8ff",
    airflowHeatColor: "#ff8a65",
    airflowOtherColor: "#dce2e6",
    airflowAngle: 7,
    airflowCurve: 20,
    airflowLength: 200,
    airflowFadePosition: 50,
    airflowSpread: 100,
    airflowDensity: 60,
    airflowIrregularity: 50,
    airflowThickness: 40,
    airflowStrength: 200,
    airflowBlur: 6,
    airflowSpeed: 1,
    airflowOffsetX: -75,
    airflowOffsetY: 34,
    airflowWidth: 64,
    airflowHeight: 125,
    airflowScale: 1,
    airflowRotation: -3,
  },
  CC = {
    iconVisible: {
      group: "图标",
      label: "图标显示",
    },
    iconOffColor: {
      group: "图标",
      label: "关闭颜色",
    },
    iconOnColor: {
      group: "图标",
      label: "开启颜色",
    },
    badgeColor: {
      group: "图标",
      label: "底座颜色",
    },
    badgeOpacity: {
      group: "图标",
      label: "底座透明度",
    },
    symbolSize: {
      group: "图标",
      label: "图标大小",
    },
    badgeSize: {
      group: "图标",
      label: "底座大小",
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置",
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置",
    },
    mainTextVisible: {
      group: "标题",
      label: "标题显示",
    },
    mainColor: {
      group: "标题",
      label: "颜色",
    },
    mainSize: {
      group: "标题",
      label: "大小",
    },
    mainWeight: {
      group: "标题",
      label: "粗细",
    },
    mainSpacing: {
      group: "标题",
      label: "字间距",
    },
    mainTextLeft: {
      group: "标题",
      label: "左右位置",
    },
    mainTextTop: {
      group: "标题",
      label: "上下位置",
    },
    secondaryTextVisible: {
      group: "状态",
      label: "状态显示",
    },
    secondaryColor: {
      group: "状态",
      label: "颜色",
    },
    secondarySize: {
      group: "状态",
      label: "大小",
    },
    secondaryWeight: {
      group: "状态",
      label: "粗细",
    },
    secondarySpacing: {
      group: "状态",
      label: "字间距",
    },
    secondaryTextLeft: {
      group: "状态",
      label: "左右位置",
    },
    secondaryTextTop: {
      group: "状态",
      label: "上下位置",
    },
    airflowVisible: {
      group: "出风效果",
      label: "显示",
    },
    airflowMotion: {
      group: "出风效果",
      label: "效果模式",
    },
    airflowCoolColor: {
      group: "出风颜色",
      label: "制冷",
    },
    airflowHeatColor: {
      group: "出风颜色",
      label: "制热",
    },
    airflowOtherColor: {
      group: "出风颜色",
      label: "其它",
    },
    airflowAngle: {
      group: "出风效果",
      label: "整体方向",
    },
    airflowCurve: {
      group: "出风效果",
      label: "弯曲程度",
    },
    airflowLength: {
      group: "出风效果",
      label: "单股长度",
    },
    airflowFadePosition: {
      group: "出风效果",
      label: "渐变消失位置",
    },
    airflowSpread: {
      group: "出风效果",
      label: "扩散宽度",
    },
    airflowDensity: {
      group: "出风效果",
      label: "气流密度",
    },
    airflowIrregularity: {
      group: "出风效果",
      label: "错落程度",
    },
    airflowThickness: {
      group: "出风效果",
      label: "整体粗细",
    },
    airflowStrength: {
      group: "出风效果",
      label: "显示强度",
    },
    airflowBlur: {
      group: "出风效果",
      label: "模糊大小",
    },
    airflowSpeed: {
      group: "出风效果",
      label: "动画速度",
    },
    airflowOffsetX: {
      group: "出风位置",
      label: "左右偏移",
    },
    airflowOffsetY: {
      group: "出风位置",
      label: "上下偏移",
    },
    airflowWidth: {
      group: "出风位置",
      label: "宽度",
    },
    airflowHeight: {
      group: "出风位置",
      label: "高度",
    },
    airflowScale: {
      group: "出风位置",
      label: "缩放",
    },
    airflowRotation: {
      group: "出风位置",
      label: "旋转",
    },
    width: {
      group: "按钮尺寸",
      label: "宽度",
    },
    height: {
      group: "按钮尺寸",
      label: "高度",
    },
    scale: {
      group: "按钮变换",
      label: "缩放",
    },
    rotation: {
      group: "按钮变换",
      label: "旋转",
    },
  };
function Il(arg834, arg835) {
  if (arg834)
    return arg835 === "width" || arg835 === "height"
      ? Number(arg834.position?.[arg835] || 100)
      : arg835 === "scale"
        ? Number(arg834.style?.scale || 1)
        : arg835 === "rotation"
          ? Number(arg834.position?.rotation || 0)
          : (arg834.properties?.[arg835] ?? MI[arg835]);
}
function SC(arg836) {
  if (!arg836 || arg836.type !== "air-conditioner") return [];
  let v1084 = Qi.get(arg836.id);
  return (
    v1084 ||
      ((v1084 = clone2(findComponent2(Ye, arg836.id)?.component || arg836)),
      Qi.set(arg836.id, v1084)),
    Object.keys(CC).filter(
      (arg837) => JSON.stringify(Il(arg836, arg837)) !== JSON.stringify(Il(v1084, arg837)),
    )
  );
}
function OI(arg838, arg839, v1085 = g?.document) {
  if (typeof arg839 == "boolean") return arg839 ? "显示" : "隐藏";
  if (arg838 === "width" || arg838 === "height") {
    const v1086 = Number(v1085?.canvas?.[arg838] || (arg838 === "width" ? 2778 : 1940));
    return roundField2((Number(arg839 || 0) / v1086) * 100) + "%";
  }
  return ["scale", "airflowScale", "badgeOpacity"].includes(arg838)
    ? roundField2(Number(arg839 || 0) * 100) + "%"
    : ["rotation", "airflowRotation", "airflowAngle"].includes(arg838)
      ? roundField2(Number(arg839 || 0)) + "°"
      : arg838 === "airflowMotion"
        ? arg839 === "static"
          ? "静态"
          : "动态"
        : typeof arg839 == "number"
          ? roundField2(arg839)
          : String(arg839 ?? "");
}
const xC = {
  buttonVisible: {
    group: "图层显示",
    label: "按钮层",
  },
  effectVisible: {
    group: "图层显示",
    label: "效果图层",
  },
  icon: {
    group: "按钮图标",
    label: "图标",
  },
  iconOffColor: {
    group: "按钮图标",
    label: "关闭后颜色",
  },
  iconOnColor: {
    group: "按钮图标",
    label: "关闭前颜色",
  },
  iconSize: {
    group: "按钮图标",
    label: "图标大小",
  },
  buttonOffColor: {
    group: "按钮背景",
    label: "关闭后颜色",
  },
  buttonOnColor: {
    group: "按钮背景",
    label: "关闭前颜色",
  },
  buttonOpacity: {
    group: "按钮背景",
    label: "透明度",
  },
  frameColor: {
    group: "外框",
    label: "颜色",
  },
  frameWidth: {
    group: "外框",
    label: "粗细",
  },
  frameOpacity: {
    group: "外框",
    label: "透明度",
  },
  radius: {
    group: "外框",
    label: "圆角",
  },
  glowColor: {
    group: "光晕",
    label: "颜色",
  },
  glowOffStrength: {
    group: "光晕",
    label: "关闭后强度",
  },
  glowOnStrength: {
    group: "光晕",
    label: "关闭前强度",
  },
  effectColorTemperatureRealtime: {
    group: "灯光实时反馈",
    label: "色温实时",
  },
  effectBrightnessRealtime: {
    group: "灯光实时反馈",
    label: "亮度实时",
  },
  effectOpacity: {
    group: "效果图层",
    label: "透明度",
  },
  effectFadeDuration: {
    group: "效果图层",
    label: "淡入淡出时间",
  },
  effectLayoutMode: {
    group: "效果图层",
    label: "图片布局",
  },
  effectLeft: {
    group: "效果图层",
    label: "左右位置",
  },
  effectTop: {
    group: "效果图层",
    label: "上下位置",
  },
  effectScale: {
    group: "效果图层",
    label: "缩放",
  },
  effectRotation: {
    group: "效果图层",
    label: "旋转",
  },
  width: {
    group: "按钮尺寸",
    label: "宽度",
  },
  height: {
    group: "按钮尺寸",
    label: "高度",
  },
  scale: {
    group: "按钮变换",
    label: "缩放",
  },
  rotation: {
    group: "按钮变换",
    label: "旋转",
  },
};
function Tl(arg840, arg841) {
  if (arg840)
    return arg841 === "width" || arg841 === "height"
      ? Number(arg840.position?.[arg841] || 100)
      : arg841 === "scale"
        ? Number(arg840.style?.scale || 1)
        : arg841 === "rotation"
          ? Number(arg840.position?.rotation || 0)
          : (arg840.properties?.[arg841] ?? kI[arg841]);
}
function NC(arg842) {
  if (!arg842 || arg842.type !== "icon-button-effect") return [];
  let v1087 = Ki.get(arg842.id);
  return (
    v1087 ||
      ((v1087 = clone2(findComponent2(Ye, arg842.id)?.component || arg842)),
      Ki.set(arg842.id, v1087)),
    Object.keys(xC).filter(
      (arg843) => JSON.stringify(Tl(arg842, arg843)) !== JSON.stringify(Tl(v1087, arg843)),
    )
  );
}
function BI(arg844, arg845, v1088 = g?.document) {
  if (typeof arg845 == "boolean") return arg845 ? "显示" : "隐藏";
  if (arg844 === "width" || arg844 === "height") {
    const v1089 = Number(v1088?.canvas?.[arg844] || (arg844 === "width" ? 2778 : 1940));
    return roundField2((Number(arg845 || 0) / v1089) * 100) + "%";
  }
  return [
    "buttonOpacity",
    "frameOpacity",
    "glowOffStrength",
    "glowOnStrength",
    "effectOpacity",
    "effectScale",
    "scale",
  ].includes(arg844)
    ? roundField2(Number(arg845 || 0) * 100) + "%"
    : ["iconSize", "radius", "effectLeft", "effectTop"].includes(arg844)
      ? roundField2(Number(arg845 || 0)) + "%"
      : ["effectRotation", "rotation"].includes(arg844)
        ? roundField2(Number(arg845 || 0)) + "°"
        : ["effectFadeDuration", "onFillFadeDuration"].includes(arg844)
          ? roundField2(Number(arg845 || 0)) + " 秒"
          : arg844 === "effectLayoutMode"
            ? arg845 === "fill"
              ? "铺满"
              : "自由"
            : String(arg845 || "不使用");
}
const Cs = {
    iconColor: "#d7d8da",
    iconSize: 42,
    iconOffOpacity: 1,
    iconOnOpacity: 1,
    iconLeft: 50,
    iconTop: 34,
    iconOnColor: "#379bff",
    badgeColor: "#5b5e66",
    badgeOpacity: 0.58,
    symbolSize: 14,
    badgeSize: 28,
    mainColor: "#c7c8cb",
    mainSize: 25,
    mainWeight: 0.25,
    mainSpacing: 1,
    mainTextLeft: 9,
    mainTextTop: 78,
    mainOffOpacity: 1,
    mainOnOpacity: 1,
    secondaryColor: "#75777d",
    secondarySize: 10,
    secondaryWeight: 0.18,
    secondarySpacing: 0.7,
    secondaryTextLeft: 9,
    secondaryTextTop: 91,
    secondaryOffOpacity: 1,
    secondaryOnOpacity: 1,
    onFillVisible: true,
    onFillColor: "#dfb64f",
    onFillStrength: 1,
    onFillFadeDuration: 0.3,
    frameVisible: true,
    frameWidth: 1,
    frameAngle: 45,
    frameOffOpacity: 0.8,
    frameOnOpacity: 1,
    cutCorner: 20,
    softLightVisible: true,
    softLightColor: "#ffffff",
    softLightStrength: 1,
    softLightSize: 1,
    softLightAngle: 45,
    glowVisible: true,
    glowColor: "#ffffff",
    glowStrength: 1,
    glowSize: 1,
    glowAngle: 220,
    haloVisible: true,
    haloScaleX: 1,
    haloScaleY: 1,
    haloRotation: 0,
    haloOpacity: 1,
    personVisible: true,
    personScale: 1,
    personRotation: 0,
    personOpacity: 1,
    orbitDuration: 8,
    perspectiveCorners: bp,
    waterLeakColor: "#42c8ff",
    smokeColor: "#ffffff",
    naturalGasColor: "#ffb347",
  },
  Pn = {
    iconColor: {
      group: "图标",
      label: "图标颜色",
    },
    iconOnColor: {
      group: "图标",
      label: "开启颜色",
    },
    badgeColor: {
      group: "图标",
      label: "底座颜色",
    },
    badgeOpacity: {
      group: "图标",
      label: "底座透明度",
    },
    symbolSize: {
      group: "图标",
      label: "图标大小",
    },
    badgeSize: {
      group: "图标",
      label: "底座大小",
    },
    iconSize: {
      group: "图标",
      label: "图标大小",
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置",
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置",
    },
    iconOffOpacity: {
      group: "图标",
      label: "图标关闭后透明度",
    },
    iconOnOpacity: {
      group: "图标",
      label: "图标关闭前透明度",
    },
    mainColor: {
      group: "中文标题",
      label: "中文颜色",
    },
    mainSize: {
      group: "中文标题",
      label: "中文大小",
    },
    mainWeight: {
      group: "中文标题",
      label: "中文粗细",
    },
    mainSpacing: {
      group: "中文标题",
      label: "中文字间距",
    },
    mainTextLeft: {
      group: "中文标题",
      label: "中文左右位置",
    },
    mainTextTop: {
      group: "中文标题",
      label: "中文上下位置",
    },
    mainOffOpacity: {
      group: "中文标题",
      label: "中文关闭后透明度",
    },
    mainOnOpacity: {
      group: "中文标题",
      label: "中文关闭前透明度",
    },
    secondaryColor: {
      group: "英文标题",
      label: "英文颜色",
    },
    secondarySize: {
      group: "英文标题",
      label: "英文大小",
    },
    secondaryWeight: {
      group: "英文标题",
      label: "英文粗细",
    },
    secondarySpacing: {
      group: "英文标题",
      label: "英文字间距",
    },
    secondaryTextLeft: {
      group: "英文标题",
      label: "英文左右位置",
    },
    secondaryTextTop: {
      group: "英文标题",
      label: "英文上下位置",
    },
    secondaryOffOpacity: {
      group: "英文标题",
      label: "英文关闭后透明度",
    },
    secondaryOnOpacity: {
      group: "英文标题",
      label: "英文关闭前透明度",
    },
    onFillVisible: {
      group: "状态填充",
      label: "状态填充显示",
    },
    onFillColor: {
      group: "状态填充",
      label: "关闭前填充颜色",
    },
    onFillStrength: {
      group: "状态填充",
      label: "关闭前填充强度",
    },
    onFillFadeDuration: {
      group: "状态填充",
      label: "淡入淡出时间",
    },
    frameVisible: {
      group: "外框",
      label: "外框显示",
    },
    frameWidth: {
      group: "外框",
      label: "外框粗细",
    },
    frameAngle: {
      group: "外框",
      label: "外框渐变角度",
    },
    frameOffOpacity: {
      group: "外框",
      label: "外框关闭后透明度",
    },
    frameOnOpacity: {
      group: "外框",
      label: "外框关闭前透明度",
    },
    cutCorner: {
      group: "外框",
      label: "切角大小",
    },
    softLightVisible: {
      group: "柔光",
      label: "柔光显示",
    },
    softLightColor: {
      group: "柔光",
      label: "柔光颜色",
    },
    softLightSize: {
      group: "柔光",
      label: "柔光大小",
    },
    softLightStrength: {
      group: "柔光",
      label: "柔光强度",
    },
    softLightAngle: {
      group: "柔光",
      label: "柔光角度",
    },
    glowVisible: {
      group: "泛光",
      label: "泛光显示",
    },
    glowColor: {
      group: "泛光",
      label: "泛光颜色",
    },
    glowSize: {
      group: "泛光",
      label: "泛光大小",
    },
    glowStrength: {
      group: "泛光",
      label: "泛光强度",
    },
    glowAngle: {
      group: "泛光",
      label: "泛光角度",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  },
  $I = {
    iconColor: {
      group: "显示颜色",
      label: "无人颜色",
    },
    iconOnColor: {
      group: "显示颜色",
      label: "有人颜色",
    },
    waterLeakColor: {
      group: "显示颜色",
      label: "水浸颜色",
    },
    smokeColor: {
      group: "显示颜色",
      label: "烟雾颜色",
    },
    naturalGasColor: {
      group: "显示颜色",
      label: "天然气颜色",
    },
    haloVisible: {
      group: "运动路径",
      label: "光环显示",
    },
    haloScaleX: {
      group: "运动路径",
      label: "光环宽度",
    },
    haloScaleY: {
      group: "运动路径",
      label: "光环高度",
    },
    haloRotation: {
      group: "运动路径",
      label: "光环旋转",
    },
    haloOpacity: {
      group: "运动路径",
      label: "光环透明度",
    },
    personVisible: {
      group: "运动路径",
      label: "小人显示",
    },
    personScale: {
      group: "运动路径",
      label: "小人缩放",
    },
    personRotation: {
      group: "运动路径",
      label: "小人旋转",
    },
    personOpacity: {
      group: "运动路径",
      label: "小人透明度",
    },
    orbitDuration: {
      group: "运动路径",
      label: "循环一周",
    },
    perspectiveCorners: {
      group: "透视",
      label: "四角透视",
    },
    width: Pn.width,
    height: Pn.height,
    scale: Pn.scale,
    rotation: Pn.rotation,
  };
function rr(arg846) {
  const v1090 = arg846?.properties?.sensorKind;
  return ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(v1090)
    ? v1090
    : "presence";
}
function FI(arg847) {
  return {
    presence: "人体/人在传感器",
    "door-window": "门窗传感器",
    "water-leak": "水浸传感器",
    smoke: "烟雾传感器",
    "natural-gas": "天然气传感器",
  }[rr(arg847)];
}
function DI(arg848) {
  const list49 = ["width", "height", "scale", "rotation"],
    rr3 = rr(arg848);
  return rr3 === "presence"
    ? [
        "iconColor",
        "iconOnColor",
        "haloVisible",
        "haloScaleX",
        "haloScaleY",
        "haloRotation",
        "haloOpacity",
        "personVisible",
        "personScale",
        "personRotation",
        "personOpacity",
        "orbitDuration",
        ...list49,
      ]
    : rr3 === "door-window"
      ? ["iconOnColor", "perspectiveCorners", ...list49]
      : rr3 === "water-leak"
        ? ["waterLeakColor", ...list49]
        : rr3 === "smoke"
          ? ["smokeColor", ...list49]
          : ["naturalGasColor", ...list49];
}
function Al(arg849, arg850) {
  if (!arg849) return;
  if (arg850 === "width" || arg850 === "height") return Number(arg849.position?.[arg850] || 100);
  if (arg850 === "scale") return Number(arg849.style?.scale || 1);
  if (arg850 === "rotation") return Number(arg849.position?.rotation || 0);
  const options72 = arg849.properties || {};
  return arg850 === "iconColor"
    ? (options72.iconColor ??
        options72.clearColor ??
        options72.iconOffColor ??
        options72.iconOnColor ??
        Cs.iconColor)
    : arg850 === "iconOnColor"
      ? (options72.iconOnColor ?? options72.occupiedColor ?? Cs.iconOnColor)
      : arg850 === "mainColor"
        ? (options72.mainColor ?? options72.mainOffColor ?? options72.mainOnColor ?? Cs.mainColor)
        : arg850 === "secondaryColor"
          ? (options72.secondaryColor ??
            options72.secondaryOffColor ??
            options72.secondaryOnColor ??
            Cs.secondaryColor)
          : (options72[arg850] ?? Cs[arg850]);
}
function EC(arg851) {
  if (!arg851 || !["icon-button", "device-button", "presence-sensor"].includes(arg851.type))
    return [];
  let v1091 = Ji.get(arg851.id);
  return (
    v1091 ||
      ((v1091 = clone2(findComponent2(Ye, arg851.id)?.component || arg851)),
      Ji.set(arg851.id, v1091)),
    (arg851.type === "presence-sensor"
      ? DI(arg851)
      : arg851.type === "device-button"
        ? [
            "iconColor",
            "iconOnColor",
            "badgeColor",
            "badgeOpacity",
            "symbolSize",
            "badgeSize",
            "iconLeft",
            "iconTop",
            "mainColor",
            "mainSize",
            "mainWeight",
            "mainSpacing",
            "mainTextLeft",
            "mainTextTop",
            "secondaryColor",
            "secondarySize",
            "secondaryWeight",
            "secondarySpacing",
            "secondaryTextLeft",
            "secondaryTextTop",
            "width",
            "height",
            "scale",
            "rotation",
          ]
        : Object.keys(Pn)
    ).filter((arg852) => JSON.stringify(Al(arg851, arg852)) !== JSON.stringify(Al(v1091, arg852)))
  );
}
function zI(arg853, arg854) {
  return arg853?.type === "presence-sensor"
    ? $I[arg854]
    : arg853?.type !== "device-button"
      ? Pn[arg854]
      : arg854.startsWith("main")
        ? {
            group: "标题",
            label: arg854 === "mainOnOpacity" ? "透明度" : Pn[arg854]?.label?.replace("中文", ""),
          }
        : arg854.startsWith("secondary")
          ? {
              group: "状态",
              label:
                arg854 === "secondaryOnOpacity" ? "透明度" : Pn[arg854]?.label?.replace("英文", ""),
            }
          : Pn[arg854];
}
function VI(arg855, arg856, v1092 = g?.document) {
  if (typeof arg856 == "boolean") return arg856 ? "显示" : "隐藏";
  if (arg855 === "width" || arg855 === "height") {
    const v1093 = Number(v1092?.canvas?.[arg855] || (arg855 === "width" ? 2778 : 1940));
    return roundField2((Number(arg856 || 0) / v1093) * 100) + "%";
  }
  return arg855 === "scale"
    ? roundField2(Number(arg856 || 0) * 100) + "%"
    : arg855 === "perspectiveCorners"
      ? JSON.stringify(arg856) === JSON.stringify(bp)
        ? "默认透视"
        : "自定义透视"
      : arg855 === "orbitDuration"
        ? roundField2(Number(arg856 || 0)) + " 秒"
        : arg855 === "onFillFadeDuration"
          ? roundField2(Number(arg856 || 0)) + " 秒"
          : [
                "rotation",
                "frameAngle",
                "softLightAngle",
                "glowAngle",
                "haloRotation",
                "personRotation",
              ].includes(arg855)
            ? roundField2(Number(arg856 || 0)) + "°"
            : [
                  "iconOffOpacity",
                  "iconOnOpacity",
                  "mainOffOpacity",
                  "mainOnOpacity",
                  "secondaryOffOpacity",
                  "secondaryOnOpacity",
                  "badgeOpacity",
                  "onFillStrength",
                  "frameOffOpacity",
                  "frameOnOpacity",
                  "softLightStrength",
                  "softLightSize",
                  "glowStrength",
                  "glowSize",
                  "haloScaleX",
                  "haloScaleY",
                  "haloOpacity",
                  "personScale",
                  "personOpacity",
                ].includes(arg855)
              ? roundField2(Number(arg856 || 0) * 100) + "%"
              : [
                    "iconSize",
                    "symbolSize",
                    "badgeSize",
                    "iconLeft",
                    "iconTop",
                    "mainTextLeft",
                    "mainTextTop",
                    "secondaryTextLeft",
                    "secondaryTextTop",
                    "cutCorner",
                  ].includes(arg855)
                ? roundField2(Number(arg856 || 0)) + "%"
                : String(arg856 ?? "");
}
const LC = {
    mediaVisible: true,
    displayMode: "live",
    refreshInterval: 10,
    fit: "fill",
    frameVisible: true,
    frameColor: "#d4d4d4",
    frameWidth: 1,
    radius: 0.04,
    frameAngle: 45,
    frameOpacity: 0.9,
  },
  IC = {
    mediaVisible: {
      group: "画面",
      label: "画面显示",
    },
    displayMode: {
      group: "画面",
      label: "显示方式",
    },
    refreshInterval: {
      group: "画面",
      label: "快照更新时间",
    },
    fit: {
      group: "画面",
      label: "画面比例",
    },
    frameVisible: {
      group: "外框",
      label: "外框显示",
    },
    frameColor: {
      group: "外框",
      label: "外框颜色",
    },
    frameWidth: {
      group: "外框",
      label: "外框粗细",
    },
    radius: {
      group: "外框",
      label: "圆角大小",
    },
    frameAngle: {
      group: "外框",
      label: "渐变角度",
    },
    frameOpacity: {
      group: "外框",
      label: "外框透明度",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };
function Pl(arg857, arg858) {
  if (!arg857) return;
  if (arg858 === "width" || arg858 === "height") return Number(arg857.position?.[arg858] || 100);
  if (arg858 === "scale") return Number(arg857.style?.scale || 1);
  if (arg858 === "rotation") return Number(arg857.position?.rotation || 0);
  const options73 = arg857.properties || {};
  if (arg858 === "displayMode") return options73.displayMode === "snapshot" ? "snapshot" : "live";
  if (arg858 === "refreshInterval") {
    const v1094 = Number(options73.refreshInterval);
    return Number.isFinite(v1094) ? Math.max(6, Math.round(v1094)) : 10;
  }
  if (arg858 === "fit") return options73.fit === "contain" ? "contain" : "fill";
  if (arg858 === "radius") {
    const v1095 = Number(options73.radius ?? LC.radius);
    return Math.max(0, Math.min(0.5, v1095 > 0.5 ? v1095 / 100 : v1095));
  }
  return options73[arg858] ?? LC[arg858];
}
function TC(arg859) {
  if (!arg859 || arg859.type !== "camera") return [];
  const v1096 = findComponent2(Ye, arg859.id)?.component || arg859;
  return Object.keys(IC).filter(
    (arg860) => JSON.stringify(Pl(arg859, arg860)) !== JSON.stringify(Pl(v1096, arg860)),
  );
}
function WI(arg861, arg862, v1097 = g?.document) {
  if (typeof arg862 == "boolean") return arg862 ? "显示" : "隐藏";
  if (arg861 === "displayMode") return arg862 === "snapshot" ? "快照" : "实时";
  if (arg861 === "refreshInterval") return roundField2(Number(arg862 || 10)) + " 秒";
  if (arg861 === "fit") return arg862 === "contain" ? "原始比例" : "压缩 16:9";
  if (arg861 === "width" || arg861 === "height") {
    const v1098 = Number(v1097?.canvas?.[arg861] || (arg861 === "width" ? 2778 : 1940));
    return roundField2((Number(arg862 || 0) / v1098) * 100) + "%";
  }
  return arg861 === "scale" || arg861 === "radius" || arg861 === "frameOpacity"
    ? roundField2(Number(arg862 || 0) * 100) + "%"
    : arg861 === "rotation" || arg861 === "frameAngle"
      ? roundField2(Number(arg862 || 0)) + "°"
      : String(arg862 ?? "");
}
const Tm = {
    mainTextVisible: true,
    mainColor: "#ffffff",
    mainSize: 30,
    mainWeight: 0,
    mainOpacity: 0.72,
    mainSpacing: 2,
    mainTextLeft: 5.2,
    mainTextTop: 20,
    secondaryTextVisible: true,
    secondaryColor: "#ffffff",
    secondarySize: 15,
    secondaryWeight: 0,
    secondaryOpacity: 0.36,
    secondarySpacing: 2.1,
    secondaryTextLeft: 5.2,
    secondaryTextTop: 28,
    edgeVisible: true,
    edgeColor: "#d4d4d4",
    edgeWidth: 0.9,
    edgeOpacity: 1,
    radius: 0.195,
    edgeAngle: 45,
    glowVisible: true,
    glowColor: "#ffffff",
    glowStrength: 0.5,
    glowSize: 1.5,
    glowAngle: 242,
  },
  AC = {
    mainTextVisible: {
      group: "主文字",
      label: "主文字显示",
    },
    mainColor: {
      group: "主文字",
      label: "主文字颜色",
    },
    mainSize: {
      group: "主文字",
      label: "主文字大小",
    },
    mainWeight: {
      group: "主文字",
      label: "主文字笔画粗细",
    },
    mainOpacity: {
      group: "主文字",
      label: "主文字透明度",
    },
    mainSpacing: {
      group: "主文字",
      label: "主文字字间距",
    },
    mainTextLeft: {
      group: "主文字",
      label: "主文字左右位置",
    },
    mainTextTop: {
      group: "主文字",
      label: "主文字上下位置",
    },
    secondaryTextVisible: {
      group: "副文字",
      label: "副文字显示",
    },
    secondaryColor: {
      group: "副文字",
      label: "副文字颜色",
    },
    secondarySize: {
      group: "副文字",
      label: "副文字大小",
    },
    secondaryWeight: {
      group: "副文字",
      label: "副文字笔画粗细",
    },
    secondaryOpacity: {
      group: "副文字",
      label: "副文字透明度",
    },
    secondarySpacing: {
      group: "副文字",
      label: "副文字字间距",
    },
    secondaryTextLeft: {
      group: "副文字",
      label: "副文字左右位置",
    },
    secondaryTextTop: {
      group: "副文字",
      label: "副文字上下位置",
    },
    edgeVisible: {
      group: "外框",
      label: "外框显示",
    },
    edgeColor: {
      group: "外框",
      label: "外框颜色",
    },
    edgeWidth: {
      group: "外框",
      label: "外框粗细",
    },
    edgeOpacity: {
      group: "外框",
      label: "外框透明度",
    },
    radius: {
      group: "外框",
      label: "外框圆角",
    },
    edgeAngle: {
      group: "外框",
      label: "外框渐变角度",
    },
    glowVisible: {
      group: "柔光",
      label: "柔光显示",
    },
    glowColor: {
      group: "柔光",
      label: "柔光颜色",
    },
    glowStrength: {
      group: "柔光",
      label: "柔光强度",
    },
    glowSize: {
      group: "柔光",
      label: "柔光大小",
    },
    glowAngle: {
      group: "柔光",
      label: "柔光角度",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };
function kl(arg863, arg864) {
  if (!arg863) return;
  if (arg864 === "width" || arg864 === "height") return Number(arg863.position?.[arg864] || 100);
  if (arg864 === "scale") return Number(arg863.style?.scale || 1);
  if (arg864 === "rotation") return Number(arg863.position?.rotation || 0);
  const options74 = arg863.properties || {};
  if (arg864 === "mainTextLeft" || arg864 === "secondaryTextLeft")
    return options74[arg864] ?? options74.textLeft ?? Tm[arg864];
  if (arg864 === "mainTextTop") {
    const max46 = Math.max(1, Number(arg863.position?.height || 100));
    return (
      options74.mainTextTop ??
      Number(options74.textTop ?? 28) - (Number(options74.lineGap ?? 24) / max46) * 100
    );
  }
  return arg864 === "secondaryTextTop"
    ? (options74.secondaryTextTop ?? options74.textTop ?? Tm.secondaryTextTop)
    : (options74[arg864] ?? Tm[arg864]);
}
function PC(arg865) {
  if (!arg865 || arg865.type !== "panel-frame") return [];
  let v1099 = Yi.get(arg865.id);
  return (
    v1099 ||
      ((v1099 = clone2(findComponent2(Ye, arg865.id)?.component || arg865)),
      Yi.set(arg865.id, v1099)),
    Object.keys(AC).filter((arg866) =>
      !v1099 || v1099.type !== "panel-frame"
        ? true
        : JSON.stringify(kl(arg865, arg866)) !== JSON.stringify(kl(v1099, arg866)),
    )
  );
}
function RI(arg867, arg868, v1100 = g?.document) {
  if (typeof arg868 == "boolean") return arg868 ? "显示" : "隐藏";
  if (arg867 === "width" || arg867 === "height") {
    const v1101 = Number(v1100?.canvas?.[arg867] || (arg867 === "width" ? 2778 : 1940));
    return roundField2((Number(arg868 || 0) / v1101) * 100) + "%";
  }
  return arg867 === "scale"
    ? roundField2(Number(arg868 || 0) * 100) + "%"
    : arg867 === "rotation" || arg867 === "edgeAngle" || arg867 === "glowAngle"
      ? roundField2(Number(arg868 || 0)) + "°"
      : [
            "mainOpacity",
            "secondaryOpacity",
            "edgeOpacity",
            "radius",
            "glowStrength",
            "glowSize",
          ].includes(arg867)
        ? roundField2(Number(arg868 || 0) * 100) + "%"
        : ["mainTextLeft", "mainTextTop", "secondaryTextLeft", "secondaryTextTop"].includes(arg867)
          ? roundField2(Number(arg868 || 0)) + "%"
          : String(arg868 ?? "");
}
const HI = {
    mainTextVisible: true,
    secondaryTextVisible: true,
    iconVisible: true,
    frameVisible: true,
    glowVisible: true,
    mainColor: "#ffffff",
    secondaryColor: "#e9edf0",
    mainSize: 30,
    secondarySize: 10,
    mainWeight: 0.5,
    secondaryWeight: 0.4,
    mainSpacing: 4,
    secondarySpacing: 3,
    mainTextLeft: 29.9,
    mainTextTop: 53.83,
    secondaryTextLeft: 29.9,
    secondaryTextTop: 81.8,
    textIdleOpacity: 0.4,
    textActiveOpacity: 0.9,
    icon: "mdi:home-outline",
    iconColor: "#fcfcfc",
    iconSize: 54,
    iconLeft: 16.5,
    iconTop: 50,
    iconIdleOpacity: 0.9,
    iconActiveOpacity: 0.9,
    frameColor: "#d9e0e6",
    frameWidth: 1.5,
    frameIdleOpacity: 1,
    frameActiveOpacity: 1,
    radius: 0.5,
    frameAngle: 45,
    glowColor: "#f2f6fa",
    glowAngle: 90,
    glowIdleStrength: 1,
    glowIdleSize: 1.5,
    glowActiveStrength: 2.4,
    glowActiveSize: 2.2,
  },
  Ss = {
    mainTextVisible: {
      group: "文字",
      label: "主文字显示",
    },
    secondaryTextVisible: {
      group: "文字",
      label: "副文字显示",
    },
    mainColor: {
      group: "文字",
      label: "主文字颜色",
    },
    secondaryColor: {
      group: "文字",
      label: "副文字颜色",
    },
    mainSize: {
      group: "文字",
      label: "主文字大小",
    },
    secondarySize: {
      group: "文字",
      label: "副文字大小",
    },
    mainWeight: {
      group: "文字",
      label: "主文字笔画粗细",
    },
    secondaryWeight: {
      group: "文字",
      label: "副文字笔画粗细",
    },
    mainSpacing: {
      group: "文字",
      label: "主文字字间距",
    },
    secondarySpacing: {
      group: "文字",
      label: "副文字字间距",
    },
    mainTextLeft: {
      group: "文字",
      label: "主文字左右位置",
    },
    mainTextTop: {
      group: "文字",
      label: "主文字上下位置",
    },
    secondaryTextLeft: {
      group: "文字",
      label: "副文字左右位置",
    },
    secondaryTextTop: {
      group: "文字",
      label: "副文字上下位置",
    },
    textIdleOpacity: {
      group: "文字",
      label: "文字选择前透明度",
    },
    textActiveOpacity: {
      group: "文字",
      label: "文字选择后透明度",
    },
    iconVisible: {
      group: "图标",
      label: "图标显示",
    },
    iconColor: {
      group: "图标",
      label: "图标颜色",
    },
    iconSize: {
      group: "图标",
      label: "图标大小",
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置",
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置",
    },
    iconIdleOpacity: {
      group: "图标",
      label: "图标选择前透明度",
    },
    iconActiveOpacity: {
      group: "图标",
      label: "图标选择后透明度",
    },
    frameVisible: {
      group: "外框",
      label: "外框显示",
    },
    frameColor: {
      group: "外框",
      label: "外框颜色",
    },
    frameWidth: {
      group: "外框",
      label: "外框粗细",
    },
    frameIdleOpacity: {
      group: "外框",
      label: "外框选择前透明度",
    },
    frameActiveOpacity: {
      group: "外框",
      label: "外框选择后透明度",
    },
    radius: {
      group: "外框",
      label: "外框圆角",
    },
    frameAngle: {
      group: "外框",
      label: "外框渐变角度",
    },
    glowVisible: {
      group: "背景光晕",
      label: "背景光晕显示",
    },
    glowColor: {
      group: "背景光晕",
      label: "背景光晕颜色",
    },
    glowAngle: {
      group: "背景光晕",
      label: "背景光晕角度",
    },
    glowIdleStrength: {
      group: "背景光晕",
      label: "选择前光晕强度",
    },
    glowIdleSize: {
      group: "背景光晕",
      label: "选择前光晕大小",
    },
    glowActiveStrength: {
      group: "背景光晕",
      label: "选择后光晕强度",
    },
    glowActiveSize: {
      group: "背景光晕",
      label: "选择后光晕大小",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };
function $e(arg869, arg870) {
  if (!arg869) return;
  if (arg870 === "width" || arg870 === "height") return Number(arg869.position?.[arg870] || 100);
  if (arg870 === "scale") return Number(arg869.style?.scale || 1);
  if (arg870 === "rotation") return Number(arg869.position?.rotation || 0);
  const options75 = arg869.properties || {},
    v1102 = HI[arg870];
  return arg870 === "textIdleOpacity"
    ? (options75[arg870] ?? options75.idleOpacity ?? v1102)
    : arg870 === "textActiveOpacity"
      ? (options75[arg870] ?? options75.activeOpacity ?? v1102)
      : arg870 === "iconIdleOpacity"
        ? (options75[arg870] ?? options75.idleOpacity ?? v1102)
        : arg870 === "iconActiveOpacity"
          ? (options75[arg870] ?? options75.activeOpacity ?? v1102)
          : arg870 === "mainTextLeft" || arg870 === "secondaryTextLeft"
            ? (options75[arg870] ?? options75.textLeft ?? v1102)
            : arg870 === "mainTextTop"
              ? (options75[arg870] ?? Number(options75.textTop ?? 81.5) - 1800 / 64.36)
              : arg870 === "secondaryTextTop"
                ? (options75[arg870] ?? options75.textTop ?? v1102)
                : (options75[arg870] ?? v1102);
}
function kC(arg871, arg872) {
  return JSON.stringify(arg871) === JSON.stringify(arg872);
}
function uo(arg873, arg874, arg875, arg876) {
  if (!arg873 || !Ss[arg874]) return;
  let map39 = Zo.get(arg873);
  (!map39 && kC(arg875, arg876)) ||
    (map39 || ((map39 = new Map()), Zo.set(arg873, map39)),
    map39.has(arg874) || map39.set(arg874, clone2(arg875)));
}
function jI(arg877) {
  const v1103 = Zo.get(arg877?.id);
  if (v1103) {
    for (const v1104 of v1103.keys()) Ss[v1104] || v1103.delete(v1104);
    v1103.size || Zo.delete(arg877.id);
  }
}
function MC(arg878) {
  return (
    jI(arg878),
    [...(Zo.get(arg878?.id)?.entries() || [])]
      .filter(([v1105, v1106]) => !kC($e(arg878, v1105), v1106))
      .map(([v1107]) => v1107)
  );
}
function qI(arg879, arg880, v1108 = g?.document) {
  if (typeof arg880 == "boolean") return arg880 ? "显示" : "隐藏";
  if (arg879 === "width" || arg879 === "height") {
    const v1109 = Number(v1108?.canvas?.[arg879] || (arg879 === "width" ? 2778 : 1940));
    return roundField2((Number(arg880 || 0) / v1109) * 100) + "%";
  }
  return arg879 === "scale"
    ? roundField2(Number(arg880 || 0) * 100) + "%"
    : arg879 === "rotation"
      ? roundField2(Number(arg880 || 0)) + "°"
      : [
            "textIdleOpacity",
            "textActiveOpacity",
            "iconIdleOpacity",
            "iconActiveOpacity",
            "frameIdleOpacity",
            "frameActiveOpacity",
            "radius",
            "glowIdleStrength",
            "glowIdleSize",
            "glowActiveStrength",
            "glowActiveSize",
          ].includes(arg879)
        ? roundField2(Number(arg880 || 0) * 100) + "%"
        : [
              "mainTextLeft",
              "mainTextTop",
              "secondaryTextLeft",
              "secondaryTextTop",
              "iconLeft",
              "iconTop",
            ].includes(arg879)
          ? roundField2(Number(arg880 || 0)) + "%"
          : arg879 === "frameAngle" || arg879 === "glowAngle"
            ? roundField2(Number(arg880 || 0)) + "°"
            : String(arg880 ?? "");
}
function Ut({ value: v1110, label: v1111, detail: v1112, target: v1113 = false }) {
  const element276 = document.createElement("label");
  element276.className = "navigation-style-apply-option";
  const element277 = document.createElement("input");
  ((element277.type = "checkbox"),
    (element277.checked = true),
    v1113
      ? (element277.dataset.navigationTargetId = v1110)
      : (element277.dataset.navigationStyleProperty = v1110));
  const element278 = document.createElement("span");
  if (((element278.textContent = v1111), v1112)) {
    const element279 = document.createElement("small");
    ((element279.textContent = v1112), element278.append(element279));
  }
  return (element276.append(element277, element278), element276);
}
function ln(arg881, arg882) {
  const map40 = new Map();
  arg881.forEach(({ component: v1114, page: v1115, scope: v1116 }) => {
    const text74 = v1116 === "shared" ? "shared" : v1115;
    (map40.has(text74) ||
      map40.set(text74, {
        page: v1115,
        scope: v1116,
        components: [],
      }),
      map40.get(text74).components.push(v1114));
  });
  const map41 = new Map();
  for (const v1117 of ["shared", "page"]) {
    if (!arg881.some((arg883) => arg883.scope === v1117)) continue;
    const element280 = document.createElement("section");
    ((element280.className = "navigation-style-apply-scope"),
      (element280.dataset.styleApplyScope = v1117));
    const element281 = document.createElement("h3");
    ((element281.textContent = v1117 === "shared" ? "侧边栏" : "主页面"),
      element280.append(element281),
      map41.set(v1117, element280));
  }
  for (const { page: v1118, scope: v1119, components: v1120 } of map40.values()) {
    const element282 = document.createElement("section");
    element282.className = "navigation-style-apply-page-group";
    const element283 = document.createElement("div");
    element283.className = "navigation-style-apply-page-heading";
    const element284 = document.createElement("strong");
    element284.textContent = v1119 === "shared" ? "所有页面共享" : v1118?.name || "未命名页面";
    const text75 = v1119 === "shared" ? "侧边栏" : "主页面 · " + element284.textContent,
      element285 = document.createElement("div");
    element285.className = "navigation-style-apply-page-controls";
    const element286 = document.createElement("span"),
      element287 = document.createElement("button");
    ((element287.type = "button"), (element287.className = "navigation-style-apply-page-toggle"));
    const element288 = document.createElement("div");
    ((element288.className = "navigation-style-apply-page-options"),
      element288.replaceChildren(
        ...v1120.map((arg884) =>
          Ut({
            value: arg884.id,
            label: componentLabel2(arg884),
            detail: typeof arg882 == "function" ? arg882(arg884) : arg882,
            target: true,
          }),
        ),
      ));
    const list50 = [...element288.querySelectorAll("[data-navigation-target-id]")],
      v1121 = () => {
        const v1122 = list50.filter((arg885) => arg885.checked).length,
          v1123 = v1122 === list50.length;
        ((element286.textContent = v1122 + "/" + list50.length + " 个控件"),
          (element287.textContent = v1123 ? "取消全选" : "全选"),
          element287.setAttribute(
            "aria-label",
            (v1123 ? "取消选择" : "全选") + "“" + text75 + "”中的控件",
          ));
      };
    (element287.addEventListener("click", () => {
      const v1124 = !list50.every((arg886) => arg886.checked);
      (list50.forEach((arg887) => {
        arg887.checked = v1124;
      }),
        v1121());
    }),
      element288.addEventListener("change", v1121),
      element285.append(element286, element287),
      element283.append(element284, element285),
      element282.append(element283, element288),
      v1121(),
      map41.get(v1119).append(element282));
  }
  (ep.classList.add("grouped-by-page"), ep.replaceChildren(...map41.values()));
}
function UI() {
  const f31 = F();
  if (!Re(f31)) return;
  const mC2 = MC(f31),
    pe = Pe(f31);
  !mC2.length ||
    !pe.length ||
    ((Xt.textContent = f31.type === "scene-mode" ? "应用情景模式设置" : "应用导航按钮设置"),
    (Jt.textContent = f31.type === "scene-mode" ? "应用到情景模式" : "应用到导航按钮"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f31) +
      "”中选定的修改应用到选中的" +
      (f31.type === "scene-mode" ? "情景模式" : "导航按钮") +
      "。图标名称、文字内容、目标页面、备注和位置不会改变。"),
    zt.replaceChildren(
      ...mC2.map((arg888) => {
        const v1125 = Ss[arg888],
          $e8 = $e(f31, arg888);
        return Ut({
          value: arg888,
          label: v1125.label,
          detail: v1125.group + " · " + qI(arg888, $e8),
        });
      }),
    ),
    ln(pe, (arg889) => {
      const text76 = arg889.properties?.targetPage || arg889.actions?.tap?.target || "",
        v1126 = g.document.pages.find((arg890) => arg890.path === text76);
      return f31.type === "scene-mode"
        ? arg889.bindings?.entity?.entityId || "未绑定实体"
        : v1126
          ? "跳转到：" + v1126.name
          : "未设置目标页面";
    }),
    (Ae.hidden = true),
    (Ae.textContent = ""),
    (bt = {
      sourceId: f31.id,
      type: f31.type,
    }),
    He.showModal());
}
function GI(arg891, arg892) {
  return typeof arg892 == "boolean"
    ? arg891 === "animated"
      ? arg892
        ? "开启"
        : "关闭"
      : arg892
        ? "显示"
        : "隐藏"
    : arg891 === "effect"
      ? arg892 === "energy"
        ? "能量"
        : "水流"
      : arg891 === "shape"
        ? {
            straight: "折线",
            rounded: "圆角",
            curve: "曲线",
          }[arg892]
        : arg891 === "direction"
          ? arg892 === -1
            ? "反向"
            : "正向"
          : arg891 === "opacity" || arg891 === "baseOpacity"
            ? roundField2(arg892 * 100) + "%"
            : arg891 === "glow"
              ? arg892 + "%"
              : String(arg892);
}
function _I() {
  const f32 = F();
  if (f32?.type !== "flow-line") return;
  const im2 = im(f32),
    pe2 = Pe(f32);
  if (!im2.length || !pe2.length) return;
  const v1127 = normalizeFlowLine2(f32.properties);
  ((Xt.textContent = "应用流水线条设置"),
    (Jt.textContent = "应用到流水线条"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f32) +
      "”的选定外观修改应用到同类控件。每条线的路径、名称和位置保持各自设置。"),
    zt.replaceChildren(
      ...im2.map((arg893) =>
        Ut({
          value: arg893,
          label: FLOW_LINE_FIELDS2[arg893],
          detail: GI(arg893, v1127[arg893]),
        }),
      ),
    ),
    ln(pe2, "流水线条"),
    (Ae.hidden = true),
    (bt = {
      sourceId: f32.id,
      type: "flow-line",
    }),
    He.showModal());
}
function YI() {
  const f33 = F();
  if (!f33 || f33.type !== "panel-frame") return;
  const pC2 = PC(f33),
    pe3 = Pe(f33);
  !pC2.length ||
    !pe3.length ||
    ((Xt.textContent = "应用底图框设置"),
    (Jt.textContent = "应用到底图框"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f33) +
      "”中选定的修改应用到选中的底图框。文字内容、备注和位置不会改变。"),
    zt.replaceChildren(
      ...pC2.map((arg894) => {
        const v1128 = AC[arg894],
          kl2 = kl(f33, arg894);
        return Ut({
          value: arg894,
          label: v1128.label,
          detail: v1128.group + " · " + RI(arg894, kl2),
        });
      }),
    ),
    ln(pe3, "底图框"),
    (Ae.hidden = true),
    (Ae.textContent = ""),
    (bt = {
      sourceId: f33.id,
      type: "panel-frame",
    }),
    He.showModal());
}
function XI() {
  const f34 = F();
  if (!f34 || f34.type !== "camera") return;
  const tC2 = TC(f34),
    pe4 = Pe(f34);
  !tC2.length ||
    !pe4.length ||
    ((Xt.textContent = "应用摄像头实时预览设置"),
    (Jt.textContent = "应用到摄像头实时预览"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f34) +
      "”中选定的修改应用到选中的摄像头实时预览。实体、备注、动作和控件位置不会改变。"),
    zt.replaceChildren(
      ...tC2.map((arg895) => {
        const v1129 = IC[arg895],
          pl2 = Pl(f34, arg895);
        return Ut({
          value: arg895,
          label: v1129.label,
          detail: v1129.group + " · " + WI(arg895, pl2),
        });
      }),
    ),
    ln(pe4, "摄像头实时预览"),
    (Ae.hidden = true),
    (Ae.textContent = ""),
    (bt = {
      sourceId: f34.id,
      type: "camera",
    }),
    He.showModal());
}
function KI() {
  const f35 = F();
  if (!f35 || f35.type !== "title-button") return;
  const wC2 = wC(f35),
    pe5 = Pe(f35);
  !wC2.length ||
    !pe5.length ||
    ((Xt.textContent = "应用标题按钮设置"),
    (Jt.textContent = "应用到标题按钮"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f35) +
      "”中选定的修改应用到选中的标题按钮。文字内容、图标名称、备注、动作和控件中心位置不会改变。"),
    zt.replaceChildren(
      ...wC2.map((arg896) => {
        const v1130 = vC[arg896],
          ll2 = Ll(f35, arg896);
        return Ut({
          value: arg896,
          label: v1130.label,
          detail: v1130.group + " · " + PI(arg896, ll2),
        });
      }),
    ),
    ln(pe5, "标题按钮"),
    (Ae.hidden = true),
    (Ae.textContent = ""),
    (bt = {
      sourceId: f35.id,
      type: "title-button",
    }),
    He.showModal());
}
function JI() {
  const f36 = F();
  if (!f36 || f36.type !== "icon-button-effect") return;
  const nC2 = NC(f36),
    pe6 = Pe(f36);
  !nC2.length ||
    !pe6.length ||
    ((Xt.textContent = "应用图标按钮（效果）设置"),
    (Jt.textContent = "应用到同类型控件"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f36) +
      "”中选定的修改应用到选中的图标按钮（效果）。实体、备注、动作和按钮位置不会改变。"),
    zt.replaceChildren(
      ...nC2.map((arg897) => {
        const v1131 = xC[arg897],
          tl2 = Tl(f36, arg897);
        return Ut({
          value: arg897,
          label: v1131.label,
          detail: v1131.group + " · " + BI(arg897, tl2),
        });
      }),
    ),
    ln(pe6, "图标按钮（效果）"),
    (Ae.hidden = true),
    (Ae.textContent = ""),
    (bt = {
      sourceId: f36.id,
      type: "icon-button-effect",
    }),
    He.showModal());
}
function QI() {
  const f37 = F();
  if (!f37 || f37.type !== "air-conditioner") return;
  const sC2 = SC(f37),
    pe7 = Pe(f37);
  !sC2.length ||
    !pe7.length ||
    ((Xt.textContent = "应用空调设置"),
    (Jt.textContent = "应用到同类型控件"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f37) +
      "”中选定的修改应用到选中的空调控件。实体、备注、文字内容、动作和按钮位置不会改变。"),
    zt.replaceChildren(
      ...sC2.map((arg898) => {
        const v1132 = CC[arg898],
          il3 = Il(f37, arg898);
        return Ut({
          value: arg898,
          label: v1132.label,
          detail: v1132.group + " · " + OI(arg898, il3),
        });
      }),
    ),
    ln(pe7, "空调"),
    (Ae.hidden = true),
    (Ae.textContent = ""),
    (bt = {
      sourceId: f37.id,
      type: "air-conditioner",
    }),
    He.showModal());
}
function ZI() {
  const f38 = F();
  if (!f38 || !["icon-button", "device-button", "presence-sensor"].includes(f38.type)) return;
  const fI2 =
      f38.type === "presence-sensor"
        ? FI(f38)
        : f38.type === "device-button"
          ? "设备按钮"
          : "图标按钮",
    eC2 = EC(f38),
    pe8 = Pe(f38);
  !eC2.length ||
    !pe8.length ||
    ((Xt.textContent = "应用" + fI2 + "设置"),
    (Jt.textContent = "应用到同类型控件"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f38) +
      "”中选定的修改应用到选中的" +
      fI2 +
      "。实体、备注、图标名称、文字内容和位置不会改变。"),
    zt.replaceChildren(
      ...eC2.map((arg899) => {
        const zI2 = zI(f38, arg899),
          al2 = Al(f38, arg899);
        return Ut({
          value: arg899,
          label: zI2.label,
          detail: zI2.group + " · " + VI(arg899, al2),
        });
      }),
    ),
    ln(pe8, fI2),
    (Ae.hidden = true),
    (Ae.textContent = ""),
    (bt = {
      sourceId: f38.id,
      type: f38.type,
    }),
    He.showModal());
}
function eT() {
  const f39 = F();
  if (!f39 || f39.type !== "line-chart") return;
  const yC2 = yC(f39),
    pe9 = Pe(f39);
  !yC2.length ||
    !pe9.length ||
    ((Xt.textContent = "应用折线图设置"),
    (Jt.textContent = "应用到折线图"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent =
      "将“" +
      componentLabel2(f39) +
      "”中选定的修改应用到选中的折线图。数值实体、备注、动作和位置不会改变。"),
    zt.replaceChildren(
      ...yC2.map((arg900) => {
        const v1133 = bC[arg900],
          el2 = El(f39, arg900);
        return Ut({
          value: arg900,
          label: v1133.label,
          detail: v1133.group + " · " + TI(arg900, el2),
        });
      }),
    ),
    ln(pe9, (arg901) => arg901.bindings?.entity?.entityId || "未设置数值实体"),
    (Ae.hidden = true),
    (Ae.textContent = ""),
    (bt = {
      sourceId: f39.id,
      type: "line-chart",
    }),
    He.showModal());
}
function tT(arg902, arg903, arg904) {
  const v1134 = clone2($e(arg902, arg904));
  if (arg904 === "width") {
    const v1135 = Number(arg903.position?.x || 0) + Number(arg903.position?.width || 100) / 2;
    arg903.position = {
      ...(arg903.position || {}),
      x: v1135 - Number(v1134) / 2,
      width: Number(v1134),
    };
    return;
  }
  if (arg904 === "height") {
    const v1136 = Number(arg903.position?.y || 0) + Number(arg903.position?.height || 100) / 2;
    arg903.position = {
      ...(arg903.position || {}),
      y: v1136 - Number(v1134) / 2,
      height: Number(v1134),
    };
    return;
  }
  if (arg904 === "scale") {
    arg903.style = {
      ...(arg903.style || {}),
      scale: Number(v1134),
    };
    return;
  }
  if (arg904 === "rotation") {
    arg903.position = {
      ...(arg903.position || {}),
      rotation: Number(v1134),
    };
    return;
  }
  arg903.properties = {
    ...(arg903.properties || {}),
    [arg904]: v1134,
  };
}
function nT(arg905, arg906, arg907) {
  const v1137 = clone2(kl(arg905, arg907));
  if (arg907 === "width") {
    const v1138 = Number(arg906.position?.x || 0) + Number(arg906.position?.width || 100) / 2;
    arg906.position = {
      ...(arg906.position || {}),
      x: v1138 - Number(v1137) / 2,
      width: Number(v1137),
    };
    return;
  }
  if (arg907 === "height") {
    const v1139 = Number(arg906.position?.y || 0) + Number(arg906.position?.height || 100) / 2;
    arg906.position = {
      ...(arg906.position || {}),
      y: v1139 - Number(v1137) / 2,
      height: Number(v1137),
    };
    return;
  }
  if (arg907 === "scale") {
    arg906.style = {
      ...(arg906.style || {}),
      scale: Number(v1137),
    };
    return;
  }
  if (arg907 === "rotation") {
    arg906.position = {
      ...(arg906.position || {}),
      rotation: Number(v1137),
    };
    return;
  }
  arg906.properties = {
    ...(arg906.properties || {}),
    [arg907]: v1137,
  };
}
function oT(arg908, arg909, arg910) {
  const v1140 = clone2(Pl(arg908, arg910));
  if (arg910 === "width") {
    const v1141 = Number(arg909.position?.x || 0) + Number(arg909.position?.width || 100) / 2;
    arg909.position = {
      ...(arg909.position || {}),
      x: v1141 - Number(v1140) / 2,
      width: Number(v1140),
    };
    return;
  }
  if (arg910 === "height") {
    const v1142 = Number(arg909.position?.y || 0) + Number(arg909.position?.height || 100) / 2;
    arg909.position = {
      ...(arg909.position || {}),
      y: v1142 - Number(v1140) / 2,
      height: Number(v1140),
    };
    return;
  }
  if (arg910 === "scale") {
    arg909.style = {
      ...(arg909.style || {}),
      scale: Number(v1140),
    };
    return;
  }
  if (arg910 === "rotation") {
    arg909.position = {
      ...(arg909.position || {}),
      rotation: Number(v1140),
    };
    return;
  }
  arg909.properties = {
    ...(arg909.properties || {}),
    [arg910]: v1140,
  };
}
function iT(arg911, arg912, arg913) {
  const v1143 = clone2(El(arg911, arg913));
  if (arg913 === "width") {
    const v1144 = Number(arg912.position?.x || 0) + Number(arg912.position?.width || 100) / 2;
    arg912.position = {
      ...(arg912.position || {}),
      x: v1144 - Number(v1143) / 2,
      width: Number(v1143),
    };
    return;
  }
  if (arg913 === "height") {
    const v1145 = Number(arg912.position?.y || 0) + Number(arg912.position?.height || 100) / 2;
    arg912.position = {
      ...(arg912.position || {}),
      y: v1145 - Number(v1143) / 2,
      height: Number(v1143),
    };
    return;
  }
  if (arg913 === "scale") {
    arg912.style = {
      ...(arg912.style || {}),
      scale: Number(v1143),
    };
    return;
  }
  if (arg913 === "rotation") {
    arg912.position = {
      ...(arg912.position || {}),
      rotation: Number(v1143),
    };
    return;
  }
  arg912.properties = {
    ...(arg912.properties || {}),
    [arg913]: v1143,
  };
}
function rT(arg914, arg915, arg916) {
  const v1146 = clone2(Tl(arg914, arg916));
  if (arg916 === "width") {
    const v1147 = Number(arg915.position?.x || 0) + Number(arg915.position?.width || 100) / 2;
    arg915.position = {
      ...(arg915.position || {}),
      x: v1147 - Number(v1146) / 2,
      width: Number(v1146),
    };
    return;
  }
  if (arg916 === "height") {
    const v1148 = Number(arg915.position?.y || 0) + Number(arg915.position?.height || 100) / 2;
    arg915.position = {
      ...(arg915.position || {}),
      y: v1148 - Number(v1146) / 2,
      height: Number(v1146),
    };
    return;
  }
  if (arg916 === "scale") {
    arg915.style = {
      ...(arg915.style || {}),
      scale: Number(v1146),
    };
    return;
  }
  if (arg916 === "rotation") {
    arg915.position = {
      ...(arg915.position || {}),
      rotation: Number(v1146),
    };
    return;
  }
  arg915.properties = {
    ...(arg915.properties || {}),
    [arg916]: v1146,
  };
}
function aT(arg917, arg918, arg919) {
  const v1149 = clone2(Ll(arg917, arg919));
  if (arg919 === "width") {
    const v1150 = Number(arg918.position?.x || 0) + Number(arg918.position?.width || 100) / 2;
    arg918.position = {
      ...(arg918.position || {}),
      x: v1150 - Number(v1149) / 2,
      width: Number(v1149),
    };
    return;
  }
  if (arg919 === "height") {
    const v1151 = Number(arg918.position?.y || 0) + Number(arg918.position?.height || 100) / 2;
    arg918.position = {
      ...(arg918.position || {}),
      y: v1151 - Number(v1149) / 2,
      height: Number(v1149),
    };
    return;
  }
  if (arg919 === "scale") {
    arg918.style = {
      ...(arg918.style || {}),
      scale: Number(v1149),
    };
    return;
  }
  if (arg919 === "rotation") {
    arg918.position = {
      ...(arg918.position || {}),
      rotation: Number(v1149),
    };
    return;
  }
  arg918.properties = {
    ...(arg918.properties || {}),
    [arg919]: v1149,
  };
}
function sT(arg920, arg921, arg922) {
  const v1152 = clone2(Al(arg920, arg922));
  if (arg922 === "width") {
    const v1153 = Number(arg921.position?.x || 0) + Number(arg921.position?.width || 100) / 2;
    arg921.position = {
      ...(arg921.position || {}),
      x: v1153 - Number(v1152) / 2,
      width: Number(v1152),
    };
    return;
  }
  if (arg922 === "height") {
    const v1154 = Number(arg921.position?.y || 0) + Number(arg921.position?.height || 100) / 2;
    arg921.position = {
      ...(arg921.position || {}),
      y: v1154 - Number(v1152) / 2,
      height: Number(v1152),
    };
    return;
  }
  if (arg922 === "scale") {
    arg921.style = {
      ...(arg921.style || {}),
      scale: Number(v1152),
    };
    return;
  }
  if (arg922 === "rotation") {
    arg921.position = {
      ...(arg921.position || {}),
      rotation: Number(v1152),
    };
    return;
  }
  arg921.properties = {
    ...(arg921.properties || {}),
    [arg922]: v1152,
  };
}
function cT(arg923, arg924, arg925) {
  const v1155 = clone2(Il(arg923, arg925));
  if (arg925 === "width") {
    const v1156 = Number(arg924.position?.x || 0) + Number(arg924.position?.width || 100) / 2;
    arg924.position = {
      ...(arg924.position || {}),
      x: v1156 - Number(v1155) / 2,
      width: Number(v1155),
    };
    return;
  }
  if (arg925 === "height") {
    const v1157 = Number(arg924.position?.y || 0) + Number(arg924.position?.height || 100) / 2;
    arg924.position = {
      ...(arg924.position || {}),
      y: v1157 - Number(v1155) / 2,
      height: Number(v1155),
    };
    return;
  }
  if (arg925 === "scale") {
    arg924.style = {
      ...(arg924.style || {}),
      scale: Number(v1155),
    };
    return;
  }
  if (arg925 === "rotation") {
    arg924.position = {
      ...(arg924.position || {}),
      rotation: Number(v1155),
    };
    return;
  }
  arg924.properties = {
    ...(arg924.properties || {}),
    [arg925]: v1155,
  };
}
(Dc.addEventListener("click", UI),
  $c.addEventListener("click", YI),
  Oc.addEventListener("click", XI),
  cc.addEventListener("click", KI),
  Bc.addEventListener("click", eT),
  ec.addEventListener("click", JI),
  yc.addEventListener("click", ZI),
  Su.addEventListener("click", QI),
  oE.addEventListener("click", () => He.close()),
  iE.addEventListener("click", () => He.close()),
  He.addEventListener("click", (arg926) => {
    arg926.target === He && He.close();
  }),
  He.addEventListener("close", () => {
    bt = null;
  }),
  rE.addEventListener("click", () => {
    const v1158 = bt?.sourceId,
      v1159 = bt?.type,
      map42 = [...zt.querySelectorAll("[data-navigation-style-property]:checked")].map(
        (arg927) => arg927.dataset.navigationStyleProperty,
      ),
      map43 = [...ep.querySelectorAll("[data-navigation-target-id]:checked")].map(
        (arg928) => arg928.dataset.navigationTargetId,
      );
    if (!v1158 || !map42.length || !map43.length) {
      const text77 =
        v1159 === "percentage-bar"
          ? "百分比柱状图"
          : v1159 === "flow-line"
            ? "流水线条"
            : v1159 === "panel-frame"
              ? "底图框"
              : v1159 === "camera"
                ? "摄像头实时预览"
                : v1159 === "title-button"
                  ? "标题按钮"
                  : v1159 === "air-conditioner"
                    ? "空调"
                    : v1159 === "line-chart"
                      ? "折线图"
                      : v1159 === "icon-button-effect"
                        ? "图标按钮（效果）"
                        : v1159 === "icon-button"
                          ? "图标按钮"
                          : v1159 === "device-button"
                            ? "设备按钮"
                            : v1159 === "presence-sensor"
                              ? "传感器"
                              : v1159 === "scene-mode"
                                ? "情景模式"
                                : "导航按钮";
      ((Ae.textContent = "请至少选择一项修改和一个目标" + text77 + "。"), (Ae.hidden = false));
      return;
    }
    (He.close(),
      E((arg929) => {
        const v1160 = findComponent2(arg929, v1158)?.component;
        if (!(!v1160 || v1160.type !== v1159))
          for (const v1161 of map43) {
            const v1162 = findComponent2(arg929, v1161)?.component;
            if (
              !(!v1162 || v1162.type !== v1159) &&
              !(v1159 === "presence-sensor" && rr(v1162) !== rr(v1160))
            ) {
              for (const v1163 of map42)
                v1159 === "flow-line"
                  ? applyFlowLineStyle2(v1160, v1162, [v1163])
                  : v1159 === "panel-frame"
                    ? nT(v1160, v1162, v1163)
                    : v1159 === "camera"
                      ? oT(v1160, v1162, v1163)
                      : v1159 === "title-button"
                        ? aT(v1160, v1162, v1163)
                        : v1159 === "line-chart"
                          ? iT(v1160, v1162, v1163)
                          : v1159 === "percentage-bar"
                            ? applyPercentageBarChange2(
                                v1162,
                                {
                                  property: v1163,
                                  value: v1160.properties?.[v1163] ?? percentageBarDefaults2[v1163],
                                },
                                arg929.canvas,
                              )
                            : v1159 === "icon-button-effect"
                              ? rT(v1160, v1162, v1163)
                              : v1159 === "air-conditioner"
                                ? cT(v1160, v1162, v1163)
                                : ["icon-button", "device-button", "presence-sensor"].includes(
                                      v1159,
                                    )
                                  ? sT(v1160, v1162, v1163)
                                  : tT(v1160, v1162, v1163);
            }
          }
      }).then(() => {
        if (v1159 === "flow-line") {
          const a2 = a("#flow-line-apply-style");
          (window.clearTimeout(Aw),
            a2?.classList.add("applied"),
            (Aw = window.setTimeout(() => {
              (a2?.classList.remove("applied"), w === v1158 && J());
            }, 1800)));
          return;
        }
        if (v1159 === "percentage-bar") {
          J();
          return;
        }
        const $c2 =
          v1159 === "panel-frame"
            ? $c
            : v1159 === "camera"
              ? Oc
              : v1159 === "title-button"
                ? cc
                : v1159 === "air-conditioner"
                  ? Su
                  : v1159 === "line-chart"
                    ? Bc
                    : v1159 === "icon-button-effect"
                      ? ec
                      : ["icon-button", "device-button", "presence-sensor"].includes(v1159)
                        ? yc
                        : Dc;
        (v1159 === "panel-frame"
          ? window.clearTimeout(E0)
          : v1159 === "camera"
            ? window.clearTimeout(P0)
            : v1159 === "title-button"
              ? window.clearTimeout(T0)
              : v1159 === "air-conditioner"
                ? window.clearTimeout(k0)
                : v1159 === "line-chart"
                  ? window.clearTimeout(L0)
                  : v1159 === "icon-button-effect"
                    ? window.clearTimeout(I0)
                    : ["icon-button", "device-button", "presence-sensor"].includes(v1159)
                      ? window.clearTimeout(A0)
                      : window.clearTimeout(N0),
          $c2.classList.add("applied"));
        const setTimeout2 = window.setTimeout(() => {
          ($c2.classList.remove("applied"), w === v1158 && J());
        }, 1800);
        v1159 === "panel-frame"
          ? (E0 = setTimeout2)
          : v1159 === "camera"
            ? (P0 = setTimeout2)
            : v1159 === "title-button"
              ? (T0 = setTimeout2)
              : v1159 === "air-conditioner"
                ? (k0 = setTimeout2)
                : v1159 === "line-chart"
                  ? (L0 = setTimeout2)
                  : v1159 === "icon-button-effect"
                    ? (I0 = setTimeout2)
                    : ["icon-button", "device-button", "presence-sensor"].includes(v1159)
                      ? (A0 = setTimeout2)
                      : (N0 = setTimeout2);
      }));
  }),
  wn.addEventListener("click", () => {
    const hidden5 = Dt.hidden;
    (q(hidden5 ? "navigation-icon" : null),
      (Dt.hidden = !hidden5),
      wn.setAttribute("aria-expanded", String(hidden5)),
      hidden5 &&
        Dp(Aa.value)
          .then(() => {
            (fw(),
              Aa.focus({
                preventScroll: true,
              }));
          })
          .catch($));
  }),
  Ta.addEventListener("click", async () => {
    const text78 = F()?.properties?.icon || "";
    if (text78)
      try {
        (await ii(text78),
          window.clearTimeout(g0),
          Ta.classList.add("copied"),
          (g0 = window.setTimeout(() => Ta.classList.remove("copied"), 1200)));
      } catch (v1164) {
        $(v1164);
      }
  }),
  Aa.addEventListener("input", () => {
    (window.clearTimeout(f0),
      (f0 = window.setTimeout(() => {
        Dp(Aa.value).catch($);
      }, 160)));
  }),
  Pa.addEventListener("click", (arg930) => {
    const closest50 = arg930.target.closest("[data-icon-name]"),
      w57 = w;
    if (!closest50 || !w57) return;
    const iconName = closest50.dataset.iconName;
    (q(),
      E((arg931) => {
        const v1165 = findComponent2(arg931, w57)?.component;
        if (!v1165 || !Re(v1165)) return;
        const $e9 = $e(v1165, "icon"),
          $e10 = $e(v1165, "iconVisible");
        ((v1165.properties = {
          ...(v1165.properties || {}),
          icon: iconName,
          iconVisible: !!iconName,
        }),
          uo(w57, "icon", $e9, $e(v1165, "icon")),
          uo(w57, "iconVisible", $e10, $e(v1165, "iconVisible")));
      }));
  }),
  hn.addEventListener("click", () => {
    const hidden6 = Bt.hidden;
    (q(hidden6 ? "ibe-icon" : null),
      (Bt.hidden = !hidden6),
      hn.setAttribute("aria-expanded", String(hidden6)),
      hidden6 &&
        zp(Wr.value)
          .then(() => {
            (gw(),
              Wr.focus({
                preventScroll: true,
              }));
          })
          .catch($));
  }),
  Vr.addEventListener("click", async () => {
    const text79 = F()?.properties?.icon || "";
    if (text79)
      try {
        (await ii(text79),
          window.clearTimeout(b0),
          Vr.classList.add("copied"),
          (b0 = window.setTimeout(() => Vr.classList.remove("copied"), 1200)));
      } catch (v1166) {
        $(v1166);
      }
  }),
  Wr.addEventListener("input", () => {
    (window.clearTimeout(h0), (h0 = window.setTimeout(() => zp(Wr.value).catch($), 160)));
  }),
  Rr.addEventListener("click", (arg932) => {
    const closest51 = arg932.target.closest("[data-icon-name]"),
      w58 = w;
    if (!closest51 || !w58) return;
    const iconName2 = closest51.dataset.iconName;
    (q(),
      E((arg933) => {
        const v1167 = findComponent2(arg933, w58)?.component;
        !v1167 ||
          v1167.type !== "icon-button-effect" ||
          (v1167.properties = {
            ...(v1167.properties || {}),
            icon: iconName2,
          });
      }));
  }),
  $t.addEventListener("click", () => {
    const hidden7 = Ft.hidden;
    (q(hidden7 ? "icon-button-icon" : null),
      (Ft.hidden = !hidden7),
      $t.setAttribute("aria-expanded", String(hidden7)),
      hidden7 &&
        Vp(oa.value)
          .then(() => {
            (hw(),
              oa.focus({
                preventScroll: true,
              }));
          })
          .catch($));
  }),
  na.addEventListener("click", async () => {
    const text80 = F()?.properties?.icon || "";
    if (text80)
      try {
        (await ii(text80),
          window.clearTimeout(v0),
          na.classList.add("copied"),
          (v0 = window.setTimeout(() => na.classList.remove("copied"), 1200)));
      } catch (v1168) {
        $(v1168);
      }
  }),
  oa.addEventListener("input", () => {
    (window.clearTimeout(y0), (y0 = window.setTimeout(() => Vp(oa.value).catch($), 160)));
  }),
  ia.addEventListener("click", (arg934) => {
    const closest52 = arg934.target.closest("[data-icon-name]"),
      w59 = w;
    if (!closest52 || !w59) return;
    const iconName3 = closest52.dataset.iconName;
    (q(),
      E((arg935) => {
        const v1169 = findComponent2(arg935, w59)?.component;
        !v1169 ||
          !["icon-button", "device-button", "presence-sensor"].includes(v1169.type) ||
          (v1169.properties = {
            ...(v1169.properties || {}),
            icon: iconName3,
          });
      }));
  }),
  yn.addEventListener("click", (arg936) => {
    (arg936.preventDefault(), arg936.stopPropagation());
    const hidden8 = nt.hidden;
    (q(hidden8 ? "title-button-icon" : null),
      hidden8 && nt.parentElement !== document.body && document.body.append(nt),
      (nt.hidden = !hidden8),
      (nt.style.position = "fixed"),
      (nt.style.zIndex = "760"),
      yn.setAttribute("aria-expanded", String(hidden8)),
      hidden8 &&
        (Hp(),
        Wp(Gr.value)
          .then(() => {
            (Hp(),
              Gr.focus({
                preventScroll: true,
              }));
          })
          .catch($)));
  }),
  Ur.addEventListener("click", async () => {
    const text81 = F()?.properties?.icon || "";
    if (text81)
      try {
        (await ii(text81),
          window.clearTimeout(C0),
          Ur.classList.add("copied"),
          (C0 = window.setTimeout(() => Ur.classList.remove("copied"), 1200)));
      } catch (v1170) {
        $(v1170);
      }
  }),
  Gr.addEventListener("input", () => {
    (window.clearTimeout(w0), (w0 = window.setTimeout(() => Wp(Gr.value).catch($), 160)));
  }),
  _r.addEventListener("click", (arg937) => {
    const closest53 = arg937.target.closest("[data-icon-name]"),
      w60 = w;
    if (!closest53 || !w60) return;
    const iconName4 = closest53.dataset.iconName;
    (q(),
      E((arg938) => {
        const v1171 = findComponent2(arg938, w60)?.component;
        !v1171 ||
          v1171.type !== "title-button" ||
          (v1171.properties = {
            ...(v1171.properties || {}),
            icon: iconName4,
            iconVisible: !!iconName4,
          });
      }));
  }),
  vn.addEventListener("click", (arg939) => {
    (arg939.preventDefault(), arg939.stopPropagation());
    const hidden9 = ot.hidden;
    (q(hidden9 ? "light-statistics-icon" : null),
      hidden9 && ot.parentElement !== document.body && document.body.append(ot),
      (ot.hidden = !hidden9),
      (ot.style.position = "fixed"),
      (ot.style.zIndex = "760"),
      vn.setAttribute("aria-expanded", String(hidden9)),
      hidden9 &&
        (jp(),
        Rp(Qr.value)
          .then(() => {
            (jp(),
              Qr.focus({
                preventScroll: true,
              }));
          })
          .catch($)));
  }),
  Jr.addEventListener("click", async () => {
    const text82 = F()?.properties?.icon || "";
    if (text82)
      try {
        (await ii(text82),
          window.clearTimeout(x0),
          Jr.classList.add("copied"),
          (x0 = window.setTimeout(() => Jr.classList.remove("copied"), 1200)));
      } catch (v1172) {
        $(v1172);
      }
  }),
  Qr.addEventListener("input", () => {
    (window.clearTimeout(S0), (S0 = window.setTimeout(() => Rp(Qr.value).catch($), 160)));
  }),
  Zr.addEventListener("click", (arg940) => {
    const closest54 = arg940.target.closest("[data-light-statistics-icon-name]"),
      w61 = w;
    if (!closest54 || !w61) return;
    const lightStatisticsIconName = closest54.dataset.lightStatisticsIconName;
    (q(),
      E((arg941) => {
        const v1173 = findComponent2(arg941, w61)?.component;
        !v1173 ||
          v1173.type !== "light-statistics" ||
          (v1173.properties = {
            ...(v1173.properties || {}),
            icon: lightStatisticsIconName,
          });
      }));
  }),
  ht.addEventListener("click", (arg942) => {
    (arg942.preventDefault(), arg942.stopPropagation());
    const hidden10 = Be.hidden;
    (q(hidden10 ? "light-statistics-entity" : null),
      hidden10 && Be.parentElement !== document.body && document.body.append(Be),
      (Be.hidden = !hidden10),
      (Be.style.position = "fixed"),
      (Be.style.zIndex = "760"),
      ht.setAttribute("aria-expanded", String(hidden10)),
      hidden10 &&
        (Bp(Xr.value),
        qp(),
        window.requestAnimationFrame(() => {
          (qp(),
            Xr.focus({
              preventScroll: true,
            }));
        })));
  }),
  Xr.addEventListener("input", () => Bp(Xr.value)),
  Kr.addEventListener("click", (arg943) => {
    const closest55 = arg943.target.closest("[data-light-statistics-entity-id]");
    closest55 && (G(Be, ht), KE(closest55.dataset.lightStatisticsEntityId));
  }),
  G1.addEventListener("click", () => ow()),
  Jg.addEventListener("click", (arg944) => {
    const closest56 = arg944.target.closest("[data-light-statistics-replace-index]"),
      closest57 = arg944.target.closest("[data-light-statistics-remove-index]");
    if (closest57) {
      JE(Number(closest57.dataset.lightStatisticsRemoveIndex));
      return;
    }
    closest56 &&
      ((tn = ""),
      (Ko = Number(closest56.dataset.lightStatisticsReplaceIndex)),
      (Ra = w || ""),
      (Kg.hidden = true),
      oo("请选择新的实体。"),
      ts(ht, "选择替换实体"),
      ht.click());
  }),
  xi.addEventListener("click", () => {
    const hidden11 = xr.hidden;
    (q(hidden11 ? "entity" : null),
      (xr.hidden = !hidden11),
      xi.setAttribute("aria-expanded", String(hidden11)),
      hidden11 &&
        (is(Nr.value),
        Xp(),
        window.requestAnimationFrame(() => {
          (Xp(),
            Nr.focus({
              preventScroll: true,
            }));
        })));
  }),
  Nr.addEventListener("input", () => is(Nr.value)),
  Wf.addEventListener("click", (arg945) => {
    const closest58 = arg945.target.closest("[data-entity-id]");
    if (!closest58 || !w) return;
    const w62 = w,
      entityId = closest58.dataset.entityId;
    (q(),
      E((arg946) => {
        const v1174 = findComponent2(arg946, w62)?.component;
        if (!v1174 || v1174.type !== "image") return;
        const v1175 = String(v1174.bindings?.entity?.entityId || "");
        if (
          ((v1174.bindings = {
            ...(v1174.bindings || {}),
          }),
          (v1174.properties = {
            ...(v1174.properties || {}),
            fit: "contain",
          }),
          entityId)
        )
          v1174.bindings.entity = {
            entityId: entityId,
          };
        else {
          delete v1174.bindings.entity;
          for (const v1176 of ["tap", "doubleTap", "hold"])
            actionNeedsCurrentEntity2(v1174.actions?.[v1176]) && delete v1174.actions[v1176];
        }
        entityId !== v1175 &&
          ((entityId ? relatedPopupContext2(v1174, rs(), as()) : null)
            ? (v1174.properties.relatedEntities = manualRelatedEntityConfig2([]))
            : delete v1174.properties.relatedEntities);
      }));
  }));
function dn(arg947, v1177 = [arg947]) {
  const ao5 = ao(arg947);
  (ao5.button.addEventListener("click", () => {
    const v1178 = v1177.includes(F()?.type) ? F().type : arg947,
      ao6 = ao(v1178),
      hidden12 = ao5.menu.hidden;
    (q(hidden12 ? ao6.except : null),
      (ao5.menu.hidden = !hidden12),
      ao5.button.setAttribute("aria-expanded", String(hidden12)),
      hidden12 &&
        (is(ao5.search.value, v1178),
        It(v1178),
        window.requestAnimationFrame(() => {
          (It(v1178),
            ao5.search.focus({
              preventScroll: true,
            }));
        })));
  }),
    ao5.search.addEventListener("input", () => {
      const v1179 = v1177.includes(F()?.type) ? F().type : arg947;
      is(ao5.search.value, v1179);
    }),
    ao5.options.addEventListener("click", (arg948) => {
      const closest59 = arg948.target.closest("[data-entity-id]"),
        w63 = w;
      if (!closest59 || !w63) return;
      const entityId2 = closest59.dataset.entityId;
      (q(),
        E((arg949) => {
          const v1180 = findComponent2(arg949, w63)?.component;
          if (!v1180 || !v1177.includes(v1180.type)) return;
          const v1181 = String(v1180.bindings?.entity?.entityId || "");
          if (
            ((v1180.bindings = {
              ...(v1180.bindings || {}),
            }),
            (v1180.actions = {
              ...(v1180.actions || {}),
            }),
            entityId2)
          ) {
            if (
              ((v1180.bindings.entity = {
                entityId: entityId2,
              }),
              v1180.type === "light-statistics")
            )
              for (const v1182 of ["tap", "doubleTap", "hold"]) {
                const v1183 = v1180.actions?.[v1182];
                ((v1183?.type === "toggle" && !entityIdSupportsToggle2(entityId2)) ||
                  (v1183 && !ACTION_TYPES2.includes(v1183.type))) &&
                  delete v1180.actions[v1182];
              }
            v1180.type === "air-conditioner" &&
              !Object.keys(v1180.actions || {}).length &&
              (v1180.actions = {
                tap: {
                  type: "more-info",
                },
                doubleTap: {
                  type: "toggle",
                },
              });
          } else {
            (delete v1180.bindings.entity,
              v1180.type === "light-statistics" &&
                (v1180.actions = Object.fromEntries(
                  Object.entries(v1180.actions || {}).filter(
                    ([, v1184]) => !actionNeedsCurrentEntity2(v1184),
                  ),
                )));
            let v1185 = false;
            for (const v1186 of ["tap", "doubleTap", "hold"])
              actionNeedsCurrentEntity2(v1180.actions?.[v1186]) &&
                (delete v1180.actions[v1186], (v1185 = true));
            if (v1180.type === "navigation-button" && v1185 && !v1180.actions.tap) {
              const targetPage = new Set(arg949.pages.map((arg950) => arg950.path)).has(
                v1180.properties?.targetPage,
              )
                ? v1180.properties.targetPage
                : W.value || arg949.pages[0]?.path || "";
              targetPage &&
                (v1180.actions.tap = {
                  type: "navigate",
                  target: targetPage,
                });
            }
          }
          if (arg947 === "weather") {
            const v1187 = K.find((arg951) => arg951.entityId === "sun.sun")?.entityId;
            v1187
              ? (v1180.bindings.sun = {
                  entityId: v1187,
                })
              : delete v1180.bindings.sun;
          }
          if (v1180.type === "scene-mode") {
            ((v1180.actions = {}), delete v1180.properties.relatedEntities);
            return;
          }
          if (entityId2 !== v1181) {
            if (
              ((v1180.properties = {
                ...(v1180.properties || {}),
              }),
              v1180.type === "light-statistics")
            ) {
              delete v1180.properties.relatedEntities;
              return;
            }
            (entityId2 ? relatedPopupContext2(v1180, rs(), as()) : null)
              ? (v1180.properties.relatedEntities = manualRelatedEntityConfig2([]))
              : delete v1180.properties.relatedEntities;
          }
        }));
    }));
}
(dn("weather"),
  dn("line-chart"),
  dn("title-button"),
  dn("light-statistics"),
  dn("icon-button-effect"),
  dn("icon-button", ["icon-button", "device-button", "presence-sensor"]),
  dn("vacuum-map"),
  dn("camera"),
  dn("air-conditioner"),
  dn("navigation-button", ["navigation-button", "scene-mode"]),
  Bu.addEventListener("click", (arg952) => {
    const closest60 = arg952.target.closest("[data-scene-control-mode]");
    if (!closest60) return;
    const w64 = w,
      sceneControlMode = closest60.dataset.sceneControlMode;
    ["switch", "scene"].includes(sceneControlMode) &&
      E((arg953) => {
        const v1188 = findComponent2(arg953, w64)?.component;
        v1188?.type === "scene-mode" && (v1188.properties.controlMode = sceneControlMode);
      });
  }));
const Ml = "推荐去 HA 复制实体 ID，粘贴搜索。可精准选择。";
let ze = null;
const { deferUntilEntitiesLoaded: Ol } = createEditorPickerLifecycle2({
  getEntitiesLoaded: () => Xo,
  getEntityLoadPromise: () => Jn,
  loadEntities: lo,
  reportError: $,
});
function lT() {
  ze?.close();
}
function kn({
  kind: v1189,
  title: v1190,
  subtitle: v1191 = "",
  searchPlaceholder: v1192,
  triggerButton: v1193,
  pageSize: v1194,
  initialPage: v1195 = 1,
  selectedText: v1196 = "",
  emptyText: v1197,
  itemClass: v1198 = "",
  getPage: v1199,
  renderItem: v1200,
  renderLeadingItems: v1201 = null,
  renderTrailingItems: v1202 = null,
  buildToolbar: v1203 = null,
  onSelect: v1204,
  onDelete: v1205 = null,
  onItemHover: v1206 = null,
  closeLegacyPickers: v1207 = true,
  renderSelectedActions: v1208 = null,
  renderSelectedContent: v1209 = null,
}) {
  (lT(), v1207 && q());
  const element289 = document.createElement("dialog");
  ((element289.className = "editor-paged-picker-dialog"),
    (element289.dataset.editorPickerKind = v1189));
  const element290 = document.createElement("div");
  element290.className = "editor-paged-picker-card" + (v1203 ? " with-toolbar" : "");
  const element291 = document.createElement("div");
  element291.className = "editor-paged-picker-heading";
  const element292 = document.createElement("div");
  element292.className = v1191
    ? "editor-paged-picker-heading-copy has-subtitle"
    : "editor-paged-picker-heading-copy";
  const element293 = document.createElement("strong");
  element293.textContent = v1190;
  const element294 = document.createElement("span");
  ((element294.textContent = v1191),
    element292.append(element293),
    v1191 && element292.append(element294));
  const element295 = document.createElement("button");
  ((element295.type = "button"),
    (element295.className = "editor-paged-picker-close"),
    element295.setAttribute("aria-label", "关闭"),
    (element295.textContent = "×"),
    element291.append(element292, element295));
  const element296 = document.createElement("div");
  ((element296.className = "editor-paged-picker-toolbar"), (element296.hidden = !v1203));
  const element297 = document.createElement("label");
  element297.className = "editor-paged-picker-search";
  const element298 = document.createElement("input");
  ((element298.type = "search"),
    (element298.placeholder = v1192),
    (element298.autocomplete = "off"),
    element297.append(element298));
  const element299 = document.createElement("div");
  element299.className = "editor-paged-picker-selected";
  const text83 = v1196 || (v1189 === "entity" ? "不使用实体" : "");
  if (((element299.hidden = !text83), text83)) {
    const element300 = document.createElement("span");
    if (
      ((element300.className = "editor-paged-picker-current-label"),
      (element300.textContent = "当前选择"),
      element299.append(element300),
      v1209)
    )
      element299.append(
        ...(v1209({
          selectedText: v1196,
          selectedValueText: text83,
        }) || []),
      );
    else {
      const element301 = document.createElement("strong");
      ((element301.textContent = text83),
        (element301.title = text83),
        element299.append(element301));
    }
  }
  if (v1208) {
    const v1210 = v1208({
      controller: null,
    });
    v1210?.length &&
      (element299.classList.add("has-actions"),
      (element299.hidden = false),
      element299.append(...v1210));
  }
  const element302 = document.createElement("div");
  ((element302.className = ("editor-paged-picker-items " + v1198).trim()),
    element302.setAttribute("role", "listbox"));
  const element303 = document.createElement("div");
  element303.className = "editor-paged-picker-footer";
  const element304 = document.createElement("span");
  element304.className = "editor-paged-picker-status";
  const element305 = document.createElement("div");
  element305.className = "editor-paged-picker-pagination";
  const element306 = document.createElement("button");
  ((element306.type = "button"), (element306.textContent = "上一页"));
  const element307 = document.createElement("input");
  ((element307.type = "text"),
    (element307.inputMode = "numeric"),
    element307.setAttribute("aria-label", "页码"));
  const element308 = document.createElement("span"),
    element309 = document.createElement("button");
  ((element309.type = "button"),
    (element309.textContent = "下一页"),
    element305.append(element306, element307, element308, element309),
    element303.append(element304, element305),
    element290.append(element291, element296, element297, element299, element302, element303),
    element289.append(element290),
    document.body.append(element289));
  let value15 = null,
    num39 = 0,
    v1211 = false;
  const options76 = {
      page: Math.max(1, Number(v1195) || 1),
      total: 0,
      pageCount: 1,
      query: "",
    },
    options77 = {
      kind: v1189,
      dialog: element289,
      triggerButton: v1193,
      state: options76,
      refresh({ resetPage: v1212 = false } = {}) {
        return (v1212 && (options76.page = 1), fn2());
      },
      rebuildToolbar() {
        !v1203 ||
          v1211 ||
          (element296.replaceChildren(),
          v1203({
            toolbar: element296,
            controller: options77,
          }),
          (element296.hidden = !element296.childElementCount));
      },
      close() {
        v1211 || (element289.open ? element289.close() : fn1());
      },
    };
  function fn1() {
    v1211 ||
      ((v1211 = true),
      window.clearTimeout(value15),
      (num39 += 1),
      v1193?.setAttribute("aria-expanded", "false"),
      element302.replaceChildren(),
      element296.replaceChildren(),
      element289.contains(fn) && document.body.append(fn),
      element289.remove(),
      ze === options77 && (ze = null),
      dt());
  }
  async function fn2() {
    const v1213 = ++num39;
    (element302.setAttribute("aria-busy", "true"),
      (element304.textContent = "正在加载…"),
      (element306.disabled = true),
      (element309.disabled = true));
    try {
      const v1214 = await v1199({
        query: options76.query,
        page: options76.page,
        pageSize: v1194,
      });
      if (v1211 || v1213 !== num39) return;
      if (
        ((options76.total = Math.max(0, Number(v1214.total) || 0)),
        (options76.pageCount = Math.max(1, Math.ceil(options76.total / v1194))),
        options76.page > options76.pageCount)
      ) {
        ((options76.page = options76.pageCount), await fn2());
        return;
      }
      const list51 = v1201 ? v1201(options76) : [],
        map44 = (v1214.items || []).map((arg954) => v1200(arg954));
      if (!map44.length) {
        const element310 = document.createElement("div");
        ((element310.className = "editor-paged-picker-empty"),
          (element310.textContent = v1197),
          map44.push(element310));
      }
      (v1202 && options76.page === options76.pageCount && map44.push(...(v1202(options76) || [])),
        element302.replaceChildren(...list51, ...map44),
        (element302.scrollTop = 0),
        (element307.value = String(options76.page)),
        (element308.textContent = "/ " + options76.pageCount),
        (element304.textContent =
          "第 " +
          options76.page +
          " / " +
          options76.pageCount +
          " 页 · 共 " +
          options76.total +
          " 项"),
        (element306.disabled = options76.page <= 1),
        (element309.disabled = options76.page >= options76.pageCount));
    } catch (v1215) {
      if (v1211 || v1213 !== num39) return;
      const element311 = document.createElement("div");
      ((element311.className = "editor-paged-picker-empty error"),
        (element311.textContent = "加载失败，请稍后重试"),
        element302.replaceChildren(element311),
        (element304.textContent = "加载失败"),
        $(v1215));
    } finally {
      !v1211 && v1213 === num39 && element302.removeAttribute("aria-busy");
    }
  }
  return (
    element295.addEventListener("click", () => options77.close()),
    element289.addEventListener("cancel", (arg955) => {
      (arg955.preventDefault(), options77.close());
    }),
    element289.addEventListener("click", (arg956) => {
      arg956.target === element289 && options77.close();
    }),
    element289.addEventListener("close", fn1, {
      once: true,
    }),
    element298.addEventListener("input", () => {
      (window.clearTimeout(value15),
        (value15 = window.setTimeout(() => {
          ((options76.query = element298.value.trim()), (options76.page = 1), fn2());
        }, 160)));
    }),
    element306.addEventListener("click", () => {
      options76.page <= 1 || ((options76.page -= 1), fn2());
    }),
    element309.addEventListener("click", () => {
      options76.page >= options76.pageCount || ((options76.page += 1), fn2());
    }),
    element307.addEventListener("change", () => {
      const trunc = Math.trunc(Number(element307.value));
      ((options76.page = clampNumber2(
        Number.isFinite(trunc) ? trunc : options76.page,
        1,
        options76.pageCount,
      )),
        fn2());
    }),
    element302.addEventListener("pointerover", (arg957) => {
      const closest61 = arg957.target.closest("[data-editor-picker-value]");
      !closest61 ||
        closest61.contains(arg957.relatedTarget) ||
        v1206?.(closest61.dataset.editorPickerValue, closest61);
    }),
    element302.addEventListener("pointerleave", dt),
    element302.addEventListener("scroll", dt),
    element302.addEventListener("click", (arg958) => {
      const closest62 = arg958.target.closest("[data-delete-user-asset]");
      if (closest62 && v1205) {
        (arg958.preventDefault(), arg958.stopPropagation());
        const deleteUserAsset = closest62.dataset.deleteUserAsset;
        (options77.close(), v1205(deleteUserAsset));
        return;
      }
      const closest63 = arg958.target.closest("[data-editor-picker-value]");
      if (!closest63 || !element302.contains(closest63)) return;
      const editorPickerValue = closest63.dataset.editorPickerValue;
      (options77.close(), v1204(editorPickerValue));
    }),
    element299.addEventListener("click", (arg959) => {
      const closest64 = arg959.target.closest("[data-editor-picker-value]");
      if (!closest64 || !element299.contains(closest64)) return;
      const editorPickerValue2 = closest64.dataset.editorPickerValue;
      (options77.close(), v1204(editorPickerValue2));
    }),
    (ze = options77),
    v1193?.setAttribute("aria-expanded", "true"),
    options77.rebuildToolbar(),
    element289.showModal(),
    fn2(),
    window.requestAnimationFrame(() =>
      element298.focus({
        preventScroll: true,
      }),
    ),
    options77
  );
}
function ar(arg960, arg961, arg962) {
  const element312 = document.createElement("button");
  ((element312.type = "button"),
    (element312.dataset[arg961] = arg962),
    arg960.replaceChildren(element312),
    element312.click(),
    arg960.replaceChildren());
}
function dT(arg963) {
  const f40 = F(),
    map45 = [
      {
        button: wn,
        title: f40?.type === "scene-mode" ? "选择情景图标" : "选择导航图标",
        options: Pa,
        datasetKey: "iconName",
        current: f40?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: hn,
        title: "选择效果按钮图标",
        options: Rr,
        datasetKey: "iconName",
        current: f40?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: $t,
        title: "选择按钮图标",
        options: ia,
        datasetKey: "iconName",
        current: f40?.properties?.icon || "",
        clear: f40?.type === "device-button" ? "跟随实体图标" : "不使用图标",
      },
      {
        button: yn,
        title: "选择标题图标",
        options: _r,
        datasetKey: "iconName",
        current: f40?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: vn,
        title: "选择统计图标",
        options: Zr,
        datasetKey: "lightStatisticsIconName",
        current: String(
          Object.hasOwn(f40?.properties || {}, "icon")
            ? f40?.properties?.icon || ""
            : "mdi:lightbulb-group-outline",
        ),
        clear: "不使用图标",
      },
    ].find((arg964) => arg964.button === arg963);
  if (!map45) return false;
  const kn2 = kn({
    kind: "icon",
    title: map45.title,
    searchPlaceholder: "搜索图标名称",
    triggerButton: arg963,
    pageSize: EDITOR_PICKER_PAGE_SIZES2.icon,
    selectedText: "",
    emptyText: "没有匹配的图标",
    itemClass: "icon-grid",
    async getPage({ query: v1216, page: v1217, pageSize: v1218 }) {
      const v1219 = (v1217 - 1) * v1218,
        _18 = await _(
          "/icons?query=" + encodeURIComponent(v1216) + "&limit=" + v1218 + "&offset=" + v1219,
        );
      return {
        items: _18.items || [],
        total: Number(_18.total) || 0,
      };
    },
    renderLeadingItems: () => [],
    renderSelectedActions: () => [
      Object.assign(document.createElement("span"), {
        className: "editor-paged-picker-current-label",
        textContent: "当前选择",
      }),
      bw(map45.current, map45.clear),
      so(map45.clear, !map45.current),
    ],
    renderItem(arg965) {
      const qp2 = Qp(arg965, map45.current, "editorPickerValue");
      return ((qp2.dataset.editorPickerValue = arg965.name), qp2);
    },
    onSelect: (arg966) => ar(map45.options, map45.datasetKey, arg966),
  });
  return true;
}
function OC(arg967) {
  const f41 = F(),
    list52 = ["icon-button", "device-button", "presence-sensor"],
    text84 =
      arg967 === xi
        ? "image"
        : arg967 === Ia && f41?.type === "scene-mode"
          ? "scene-mode"
          : arg967 === ki && list52.includes(f41?.type)
            ? f41.type
            : [
                "weather",
                "line-chart",
                "title-button",
                "light-statistics",
                "icon-button-effect",
                "vacuum-map",
                "camera",
                "air-conditioner",
                "navigation-button",
              ].find((arg968) => ao(arg968).button === arg967);
  if (!text84) return false;
  const w65 = w;
  if (
    Ol(
      arg967,
      () => OC(arg967),
      () => w === w65,
    )
  )
    return true;
  const ao7 = ao(text84),
    text85 = f41?.bindings?.entity?.entityId || "",
    value16 = io(text84).find((arg969) => arg969.entityId === text85) || null,
    value17 = text84 === "scene-mode" ? null : es()[0] || null,
    index9 = yw(text84, "").findIndex((arg970) => arg970.entityId === text85);
  return (
    kn({
      kind: "entity",
      title: "选择实体",
      subtitle: mL(text84) + " · " + Ml,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: arg967,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(index9, value17),
      selectedText: text85 || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: v1220, page: v1221 }) {
        const yw2 = yw(text84, v1220);
        return editorEntityPickerPage2(yw2, v1221, value17);
      },
      renderLeadingItems: (arg971) => (arg971.page === 1 && value17 ? [qt(value17, text85)] : []),
      renderSelectedContent: () => [dl(value16)],
      renderSelectedActions: () => [so("不使用实体", !text85)],
      renderItem: (arg972) => qt(arg972, text85),
      onSelect: (arg973) => ar(ao7.options, "entityId", arg973),
    }),
    true
  );
}
function BC() {
  if (F()?.type !== "light-statistics") return false;
  const w66 = w;
  if (Ol(ht, BC, () => w === w66 && F()?.type === "light-statistics")) return true;
  const v1222 = (arg974) => {
      const localeLowerCase8 = String(arg974 || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return io("light-statistics")
        .map((arg975, arg976) => ({
          entity: arg975,
          index: arg976,
          support: lightStatisticsEntitySupport2(arg975),
        }))
        .filter(
          ({ entity: v1223 }) =>
            !localeLowerCase8 ||
            (rt(v1223) + " " + be(v1223)).toLocaleLowerCase("zh-CN").includes(localeLowerCase8),
        )
        .sort(
          (arg977, arg978) =>
            Number(arg978.support.supported) - Number(arg977.support.supported) ||
            +(be(arg978.entity) === "light") - +(be(arg977.entity) === "light") ||
            arg977.index - arg978.index,
        )
        .map(({ entity: v1224 }) => v1224);
    },
    index10 = v1222("").findIndex((arg979) => arg979.entityId === tn),
    value18 = es()[0] || null,
    kn3 = kn({
      kind: "entity",
      title: Ko >= 0 ? "选择替换实体" : "添加统计实体",
      subtitle: Ml,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: ht,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(index10, value18),
      selectedText: tn || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      closeLegacyPickers: false,
      getPage({ query: v1225, page: v1226 }) {
        const v1227 = v1222(v1225);
        return editorEntityPickerPage2(v1227, v1226, value18);
      },
      renderLeadingItems: (arg980) => (arg980.page === 1 && value18 ? [qt(value18, tn)] : []),
      renderItem: (arg981) => qt(arg981, tn),
      onSelect: (arg982) => ar(Kr, "lightStatisticsEntityId", arg982),
    });
  return true;
}
function $C(arg983) {
  const closest65 = arg983.closest("[data-action-trigger]"),
    v1228 = closest65?.querySelector("[data-popup-entity]"),
    v1229 = closest65?.querySelector("[data-popup-entity-options]");
  if (!closest65 || !v1228 || !v1229) return false;
  if (
    Ol(
      arg983,
      () => $C(arg983),
      () => closest65.isConnected,
    )
  )
    return true;
  const text86 = v1228.value || "",
    value19 = K.find((arg984) => arg984.entityId === text86) || null,
    value20 = es()[0] || null,
    v1230 = (arg985) => {
      const localeLowerCase9 = String(arg985 || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return K.filter(
        (arg986) =>
          !arg986.virtual &&
          (!localeLowerCase9 ||
            (rt(arg986) + " " + arg986.entityId)
              .toLocaleLowerCase("zh-CN")
              .includes(localeLowerCase9)),
      );
    },
    index11 = v1230("").findIndex((arg987) => arg987.entityId === text86);
  return (
    kn({
      kind: "entity",
      title: "选择弹窗实体",
      subtitle: Ml,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: arg983,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(index11, value20),
      selectedText: text86 || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: v1231, page: v1232 }) {
        const v1233 = v1230(v1231);
        return editorEntityPickerPage2(v1233, v1232, value20);
      },
      renderItem: (arg988) => qt(arg988, text86),
      renderLeadingItems: (arg989) => (arg989.page === 1 && value20 ? [qt(value20, text86)] : []),
      renderSelectedContent: () => [dl(value19)],
      renderSelectedActions: () => [so("不使用实体", !text86)],
      onSelect: (arg990) => ar(v1229, "popupActionEntityId", arg990),
    }),
    true
  );
}
function FC() {
  if (!qi.open) return false;
  if (Ol(Cn, FC, () => qi.open)) return true;
  const text87 = ye.elements.entityId.value || "",
    value21 = K.find((arg991) => arg991.entityId === text87) || null,
    value22 = es()[0] || null,
    v1234 = (arg992) => {
      const localeLowerCase10 = String(arg992 || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return K.map((arg993, arg994) => ({
        entity: arg993,
        index: arg994,
      }))
        .filter(
          ({ entity: v1235 }) =>
            !v1235.virtual &&
            (!localeLowerCase10 ||
              (rt(v1235) + " " + v1235.entityId)
                .toLocaleLowerCase("zh-CN")
                .includes(localeLowerCase10)),
        )
        .sort(
          (arg995, arg996) =>
            Number(popupModuleEntityRecommended2(arg996.entity, ye.elements.type.value)) -
              Number(popupModuleEntityRecommended2(arg995.entity, ye.elements.type.value)) ||
            arg995.index - arg996.index,
        )
        .map(({ entity: v1236 }) => v1236);
    },
    index12 = v1234("").findIndex((arg997) => arg997.entityId === text87);
  return (
    kn({
      kind: "entity",
      title: "选择模块实体",
      subtitle: Ml,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: Cn,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(index12, value22),
      selectedText: text87 || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: v1237, page: v1238 }) {
        const v1239 = v1234(v1237);
        return editorEntityPickerPage2(v1239, v1238, value22);
      },
      renderItem: (arg998) => qt(arg998, text87),
      renderLeadingItems: (arg999) => (arg999.page === 1 && value22 ? [qt(value22, text87)] : []),
      renderSelectedContent: () => [dl(value21)],
      renderSelectedActions: () => [so("不使用实体", !text87)],
      onSelect: (arg1000) => ar(Ui, "popupModuleEntityId", arg1000),
    }),
    true
  );
}
function uT(arg1001) {
  const text88 = arg1001 === zn ? "image" : arg1001 === jn ? "ibe" : "";
  if (!text88) return false;
  const v1240 = text88 === "image",
    f42 = F(),
    text89 = v1240 ? f42?.properties?.assetId || "" : f42?.properties?.effectAssetId || "",
    sn5 = sn(text89);
  Tn({
    refreshInspector: false,
  })
    .then(() => {
      ze?.triggerButton === arg1001 && (ze.syncAssetToolbar?.(), ze.refresh());
    })
    .catch($);
  const index13 = vw(text88).findIndex((arg1002) => ul(arg1002, text89));
  return (
    kn({
      kind: text88 + "-asset",
      title: v1240 ? "选择控件图片" : "选择效果图片",
      subtitle: "我的图片与栖光素材 · 固定分页加载",
      searchPlaceholder: "搜索图片名称",
      triggerButton: arg1001,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.asset,
      initialPage: index13 < 0 ? 1 : Math.floor(index13 / EDITOR_PICKER_PAGE_SIZES2.asset) + 1,
      selectedText: sn5?.name || text89 || "不使用图片",
      emptyText: "没有匹配的图片",
      itemClass: "asset-grid",
      getPage({ query: v1241, page: v1242, pageSize: v1243 }) {
        const vw2 = vw(text88, v1241),
          v1244 = (v1242 - 1) * v1243;
        return {
          items: vw2.slice(v1244, v1244 + v1243),
          total: vw2.length,
        };
      },
      renderSelectedContent: () => [pL(sn5)],
      renderSelectedActions: () => [so("不使用图片", !text89)],
      renderItem(arg1003) {
        const nm2 = nm(arg1003, text89),
          selector61 = nm2.matches?.("[data-asset-id]")
            ? nm2
            : nm2.querySelector("[data-asset-id]");
        return (selector61 && (selector61.dataset.editorPickerValue = arg1003.assetId), nm2);
      },
      buildToolbar: (arg1004) => gL(text88, arg1004),
      onItemHover: (arg1005, arg1006) => tm(sn(arg1005), arg1006, ze?.dialog),
      onDelete: zC,
      onSelect: (arg1007) => ar(v1240 ? Yt : bn, "assetId", arg1007),
    })?.dialog.append(fn),
    true
  );
}
function Am(arg1008, arg1009) {
  const text90 = arg1009 === "user" ? "user" : "builtin";
  arg1008 === "image"
    ? ((Zt = text90),
      (Vn.value = ""),
      co("image"),
      si("image"),
      ze?.kind === "image-asset"
        ? (ze.rebuildToolbar(),
          ze.refresh({
            resetPage: true,
          }))
        : (cs(), ss()))
    : ((en = text90),
      (qn.value = ""),
      co("ibe"),
      si("ibe"),
      ze?.kind === "ibe-asset"
        ? (ze.rebuildToolbar(),
          ze.refresh({
            resetPage: true,
          }))
        : (ds(), ls()));
}
async function DC(arg1010, arg1011) {
  const list53 = [...(arg1010 || [])];
  if (!list53.length) return;
  const Rf2 = arg1011 === "image" ? Rf : cg;
  Rf2.disabled = true;
  const list54 = [];
  try {
    for (const v1245 of list53) {
      if (!/\.(png|jpe?g|webp|svg)$/i.test(v1245.name)) {
        list54.push(v1245.name + "：仅支持 PNG、JPG、JPEG、WebP 和 SVG");
        continue;
      }
      try {
        await _("/assets/user", {
          method: "POST",
          body: v1245,
          headers: {
            "Content-Type": v1245.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(v1245.name),
          },
        });
      } catch (v1246) {
        list54.push(v1245.name + "：" + v1246.message);
      }
    }
    (await Tn({
      refreshInspector: false,
    }),
      Am(arg1011, "user"),
      list54.length && $(new Error(list54.join("\n"))));
  } finally {
    Rf2.disabled = false;
  }
}
function zC(arg1012) {
  const sn6 = sn(arg1012);
  if (!sn6 || sn6.source !== "user") return;
  const v1247 = (arg1013) =>
    Array.isArray(arg1013)
      ? arg1013.some(v1247)
      : arg1013 && typeof arg1013 == "object"
        ? Object.values(arg1013).some(v1247)
        : arg1013 === sn6.assetId;
  if (v1247(g?.document)) {
    (q(), $(new Error("这张图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。")));
    return;
  }
  ((dp = sn6.assetId), (bE.textContent = "“" + sn6.name + "”"), q(), qo.showModal());
}
function VC(arg1014, arg1015) {
  if (!Zp(arg1014 === "image" ? Zt : en, arg1015)) return;
  const hL2 = hL(arg1015),
    v1248 = "studio3d:" + arg1015 + "/",
    v1249 = (arg1016) =>
      Array.isArray(arg1016)
        ? arg1016.some(v1249)
        : arg1016 && typeof arg1016 == "object"
          ? Object.values(arg1016).some(v1249)
          : typeof arg1016 == "string" && arg1016.startsWith(v1248);
  if (v1249(g?.document)) {
    $(new Error("这个文件夹中的图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。"));
    return;
  }
  ((Uc = {
    kind: arg1014,
    folderName: arg1015,
  }),
    (wE.textContent = "“" + arg1015 + "”"),
    (CE.textContent = String(hL2.length)),
    Yn.showModal());
}
function pT() {
  (co("image"),
    co("ibe"),
    cs(Vn.value),
    ds(qn.value),
    (ze?.kind === "image-asset" || ze?.kind === "ibe-asset") &&
      (ze.syncAssetToolbar?.(),
      ze.refresh({
        resetPage: true,
      })),
    et.hidden || ss(),
    tt.hidden || ls());
}
(et.addEventListener("click", (arg1017) => {
  const closest66 = arg1017.target.closest("[data-image-asset-source]");
  closest66 && Am("image", closest66.dataset.imageAssetSource);
}),
  tt.addEventListener("click", (arg1018) => {
    const closest67 = arg1018.target.closest("[data-ibe-asset-source]");
    closest67 && Am("ibe", closest67.dataset.ibeAssetSource);
  }),
  Rf.addEventListener("click", () => Er.click()),
  cg.addEventListener("click", () => Hr.click()),
  Er.addEventListener("change", async () => {
    (await DC(Er.files, "image"), (Er.value = ""));
  }),
  Hr.addEventListener("change", async () => {
    (await DC(Hr.files, "ibe"), (Hr.value = ""));
  }));
for (const t of [Yt, bn])
  t.addEventListener("click", (arg1019) => {
    const closest68 = arg1019.target.closest("[data-delete-user-asset]");
    closest68 &&
      (arg1019.preventDefault(), arg1019.stopPropagation(), zC(closest68.dataset.deleteUserAsset));
  });
(gE.addEventListener("click", () => qo.close()),
  hE.addEventListener("click", () => qo.close()),
  qo.addEventListener("click", (arg1020) => {
    arg1020.target === qo && qo.close();
  }),
  ip.addEventListener("click", async () => {
    const replace5 = String(dp || "").replace(/^user:/, "");
    if (/^[0-9a-f]{32}$/.test(replace5)) {
      ip.disabled = true;
      try {
        (await _("/assets/user/" + replace5, {
          method: "DELETE",
        }),
          (dp = null),
          qo.close(),
          await Tn());
      } catch (v1250) {
        v1250?.code === "ASSET_IN_USE"
          ? $(new Error("这张图片仍被户型图绘制或仪表盘使用，请先移除引用后再删除。"))
          : $(v1250);
      } finally {
        ip.disabled = false;
      }
    }
  }),
  yE.addEventListener("click", () => Yn.close()),
  vE.addEventListener("click", () => Yn.close()),
  Yn.addEventListener("click", (arg1021) => {
    arg1021.target === Yn && Yn.close();
  }),
  Yn.addEventListener("close", () => {
    Hc.disabled || (Uc = null);
  }),
  Hc.addEventListener("click", async () => {
    const Uc2 = Uc;
    if (Uc2?.folderName) {
      Hc.disabled = true;
      try {
        (await _("/studio3d/exports", {
          method: "DELETE",
          headers: {
            "X-Export-Folder": encodeURIComponent(Uc2.folderName),
          },
        }),
          (Uc = null),
          Yn.close(),
          await Tn({
            refreshInspector: false,
          }),
          pT());
      } catch (v1251) {
        v1251?.code === "STUDIO3D_EXPORT_IN_USE"
          ? $(
              new Error(
                "这个文件夹中的图片仍被仪表盘、弹窗或户型图绘制使用，请先移除引用后再删除。",
              ),
            )
          : $(v1251);
      } finally {
        Hc.disabled = false;
      }
    }
  }),
  zn.addEventListener("click", async () => {
    const hidden13 = et.hidden;
    if (
      (q(hidden13 ? "asset" : null),
      (et.hidden = !hidden13),
      zn.setAttribute("aria-expanded", String(hidden13)),
      hidden13)
    ) {
      try {
        (await Tn({
          refreshInspector: false,
        }),
          co("image"));
      } catch (v1252) {
        $(v1252);
      }
      (cs(Vn.value),
        ss(),
        window.requestAnimationFrame(() => {
          (ss(),
            Vn.focus({
              preventScroll: true,
            }));
        }));
    }
  }),
  Ao.addEventListener("change", () => {
    ((xn = Ao.value), (Vn.value = ""), si("image"), cs());
  }),
  Vn.addEventListener("input", () => cs(Vn.value)),
  Yt.addEventListener("pointerover", (arg1022) => {
    const closest69 = arg1022.target.closest("[data-asset-id]");
    if (!closest69 || closest69.contains(arg1022.relatedTarget)) return;
    const sn7 = sn(closest69.dataset.assetId);
    tm(sn7, closest69);
  }),
  Yt.addEventListener("pointerleave", dt),
  Yt.addEventListener("scroll", dt),
  Yt.addEventListener("click", async (arg1023) => {
    const closest70 = arg1023.target.closest("[data-asset-id]");
    if (!closest70 || !w) return;
    const w67 = w,
      assetId = closest70.dataset.assetId;
    if ((dt(), q(), !assetId)) {
      E((arg1024) => {
        const v1253 = findComponent2(arg1024, w67)?.component;
        !v1253 ||
          v1253.type !== "image" ||
          ((v1253.properties = {
            ...(v1253.properties || {}),
            fit: "contain",
          }),
          delete v1253.properties.assetId,
          delete v1253.properties.naturalWidth,
          delete v1253.properties.naturalHeight);
      });
      return;
    }
    const sn8 = sn(assetId);
    if (sn8)
      try {
        const em2 = await em(sn8);
        E((arg1025) => {
          const v1254 = findComponent2(arg1025, w67)?.component;
          !v1254 || v1254.type !== "image" || Sw(v1254, assetId, em2);
        });
      } catch (v1255) {
        $(v1255);
      }
  }),
  jn.addEventListener("click", async () => {
    const hidden14 = tt.hidden;
    if (
      (q(hidden14 ? "ibe-asset" : null),
      (tt.hidden = !hidden14),
      jn.setAttribute("aria-expanded", String(hidden14)),
      !!hidden14)
    ) {
      try {
        (await Tn({
          refreshInspector: false,
        }),
          co("ibe"));
      } catch (v1256) {
        $(v1256);
      }
      (ds(qn.value),
        ls(),
        window.requestAnimationFrame(() => {
          (ls(),
            qn.focus({
              preventScroll: true,
            }));
        }));
    }
  }),
  Oo.addEventListener("change", () => {
    ((Nn = Oo.value), (qn.value = ""), si("ibe"), ds());
  }),
  qn.addEventListener("input", () => ds(qn.value)),
  bn.addEventListener("pointerover", (arg1026) => {
    const closest71 = arg1026.target.closest("[data-asset-id]");
    !closest71 ||
      closest71.contains(arg1026.relatedTarget) ||
      tm(sn(closest71.dataset.assetId), closest71, tt);
  }),
  bn.addEventListener("pointerleave", dt),
  bn.addEventListener("scroll", dt),
  bn.addEventListener("click", async (arg1027) => {
    const closest72 = arg1027.target.closest("[data-asset-id]"),
      w68 = w;
    if (!closest72 || !w68) return;
    const assetId2 = closest72.dataset.assetId;
    (dt(), q());
    const sn9 = assetId2 ? sn(assetId2) : null;
    let value23 = null;
    if (sn9)
      try {
        value23 = await em(sn9);
      } catch (v1257) {
        $(v1257);
        return;
      }
    E((arg1028) => {
      const v1258 = findComponent2(arg1028, w68)?.component;
      !v1258 ||
        v1258.type !== "icon-button-effect" ||
        ((v1258.properties = {
          ...(v1258.properties || {}),
        }),
        assetId2 && value23
          ? ((v1258.properties.effectAssetId = assetId2),
            (v1258.properties.effectNaturalWidth = value23.width),
            (v1258.properties.effectNaturalHeight = value23.height),
            delete v1258.properties.effectWidth,
            delete v1258.properties.effectHeight)
          : (delete v1258.properties.effectAssetId,
            delete v1258.properties.effectNaturalWidth,
            delete v1258.properties.effectNaturalHeight));
    });
  }),
  zf.addEventListener("click", () => Rw("undo")),
  Vf.addEventListener("click", () => Rw("redo")),
  h1.addEventListener("click", () => {
    if (!Ne || !g) {
      Dn.close();
      return;
    }
    const Ne2 = Ne;
    ((Ne = null),
      (g = {
        ...g,
        document: clone2(Ne2.document),
      }),
      (w = findComponent2(g.document, Ne2.selectedComponentId) ? Ne2.selectedComponentId : null));
    const filter25 = Array.isArray(Ne2.selectedComponentIds)
      ? Ne2.selectedComponentIds.filter((arg1029) => findComponent2(g.document, arg1029))
      : [];
    ((B = new Set(filter25.length ? filter25 : w ? [w] : [])),
      (xe = w),
      (ae.undo = Array.isArray(Ne2.undo) ? clone2(Ne2.undo) : []),
      (ae.redo = Array.isArray(Ne2.redo) ? clone2(Ne2.redo) : []),
      Dn.close(),
      ms(Ne2.selectedPath || null),
      cn(),
      An());
  }),
  g1.addEventListener("click", () => {
    (fs(g?.projectId), (Ne = null), Dn.close(), cn(), An());
  }),
  Dn.addEventListener("cancel", (arg1030) => arg1030.preventDefault()),
  p1.addEventListener("click", () => Io.close()),
  m1.addEventListener("click", () => Io.close()),
  Io.addEventListener("click", (arg1031) => {
    arg1031.target === Io && Io.close();
  }),
  Sf.addEventListener("click", () => al("shared")),
  xf.addEventListener("click", () => al("page")),
  js.addEventListener("click", () => {
    js.disabled || (UE(), yi.showModal());
  }),
  yx.addEventListener("click", () => yi.close()),
  yi.addEventListener("click", (arg1032) => {
    arg1032.target === yi && yi.close();
  }),
  Yl.addEventListener("click", (arg1033) => {
    const closest73 = arg1033.target.closest("[data-template-id]"),
      v1259 = W.value;
    if (!closest73 || closest73.disabled || !v1259) return;
    const Ie7 = Ie,
      jc5 = jc,
      value24 = _e ? findComponent2(g?.document, _e) : null,
      component7 = value24?.component?.type === "group" ? value24.component : null,
      scope3 = component7 ? value24.scope : jc5,
      v1260 = newId2("component");
    (yi.close(), (w = v1260), (B = new Set([v1260])), (xe = v1260));
    const e2 = E((arg1034) => {
      const v1261 = arg1034.pages.find((arg1035) => arg1035.path === v1259);
      if (!v1261) throw new Error("当前页面不存在。");
      const value25 = component7 ? findComponent2(arg1034, component7.id) : null,
        component8 = value25?.component?.type === "group" ? value25.component : null,
        sharedComponents3 = jc5 === "shared" ? arg1034.sharedComponents : v1261.components,
        children2 = component8
          ? component8.children || (component8.children = [])
          : sharedComponents3,
        text91 =
          closest73.dataset.templateId === "flow-line"
            ? "流水线条"
            : closest73.dataset.templateId === "scene-mode"
              ? "情景模式"
              : closest73.dataset.templateId === "navigation-button"
                ? "导航按钮"
                : closest73.dataset.templateId === "interaction3d"
                  ? "3D 交互"
                  : closest73.dataset.templateId === "floorplan-auto-diagram"
                    ? "户型图自动导图"
                    : closest73.dataset.templateId === "icon-button-effect"
                      ? "图标按钮（效果）"
                      : closest73.dataset.templateId === "title-button"
                        ? "标题按钮"
                        : closest73.dataset.templateId === "light-statistics"
                          ? "数量统计"
                          : closest73.dataset.templateId === "icon-button"
                            ? "图标按钮"
                            : closest73.dataset.templateId === "device-button"
                              ? "设备按钮"
                              : closest73.dataset.templateId === "presence-sensor"
                                ? "传感器"
                                : closest73.dataset.templateId === "air-conditioner"
                                  ? "空调 / 浴霸"
                                  : closest73.dataset.templateId === "vacuum-map"
                                    ? "扫地机器人实时地图"
                                    : closest73.dataset.templateId === "camera"
                                      ? "摄像头实时预览"
                                      : closest73.dataset.templateId === "time"
                                        ? "时间"
                                        : closest73.dataset.templateId === "date"
                                          ? "日期"
                                          : closest73.dataset.templateId === "weather"
                                            ? "天气"
                                            : closest73.dataset.templateId === "percentage-bar"
                                              ? "百分比柱状图"
                                              : closest73.dataset.templateId === "line-chart"
                                                ? "折线图"
                                                : closest73.dataset.templateId === "panel-frame"
                                                  ? "底图框"
                                                  : "图片",
        v1262 = nextTemplateInstanceName2(children2, text91),
        v1263 = createComponentFromTemplate2(closest73.dataset.templateId, {
          id: v1260,
          instanceName: v1262,
          canvas: arg1034.canvas,
          uiPackId: on(arg1034),
        });
      if (component8) {
        const v1264 = Number(component8.position?.width || 100),
          v1265 = Number(component8.position?.height || 100),
          v1266 = Number(v1263.position?.width || 100),
          v1267 = Number(v1263.position?.height || 100);
        v1263.position = {
          ...(v1263.position || {}),
          x: (v1264 - v1266) / 2,
          y: (v1265 - v1267) / 2,
        };
      }
      if (
        (children2.unshift(v1263),
        applyCollectionLayerOrder2(children2),
        scope3 === "shared" && !component8)
      ) {
        for (const v1268 of arg1034.pages)
          v1268.sharedComponentIds = [
            v1263.id,
            ...(v1268.sharedComponentIds || []).filter((arg1036) => arg1036 !== v1263.id),
          ];
        syncSharedComponentReferenceOrder2(arg1034);
      }
    }, v1259);
    closest73.dataset.templateId === "floorplan-auto-diagram" &&
      e2.then(() => {
        Ie === Ie7 &&
          findComponent2(g?.document, v1260) &&
          Qw(v1260, {
            cancelRemovesComponent: true,
          });
      });
  }),
  Of.addEventListener("click", () => yt("edit")),
  Bf.addEventListener("click", () => yt("dashboard")),
  Ve.addEventListener("click", async () => {
    if (!g) return;
    const v1269 = clone2(g.document);
    v1269.soundEnabled = g.document.soundEnabled === false;
    try {
      if (!(await Tt(v1269))) return;
      await dm();
    } catch (v1270) {
      $(v1270);
    }
  }),
  $f.addEventListener("click", AE),
  Ul.addEventListener("click", () => yt("edit")),
  Gl.addEventListener("click", () => yt("popup")),
  Oe.addEventListener("change", () => {
    if ((to(), Zn && g && Oe.value !== g.projectId)) {
      ((Oe.value = g.projectId), ne(Oe), bs());
      return;
    }
    Oe.value && lm(Oe.value).catch($);
  }),
  W.addEventListener("change", () => {
    (Ln(),
      H0(),
      (_e = null),
      Le === "popup" && yt("edit"),
      x?.navigate(W.value),
      it?.navigate(W.value));
    const v1271 = findComponent2(g?.document, w);
    (v1271?.scope === "page" && v1271.page?.path !== W.value && ol(null), Xe(), J());
  }));
function WC(arg1037) {
  cp = arg1037;
  const v1272 = findCustomPopup2(g?.document, ce);
  ((aE.textContent = arg1037 === "rename" ? "重命名组合弹窗" : "新建组合弹窗"),
    (Vc.elements.name.value = arg1037 === "rename" ? v1272?.name || "" : "新建组合弹窗"),
    zc.showModal(),
    Vc.elements.name.select());
}
(Cf.addEventListener("click", () => WC("create")),
  sE.addEventListener("click", () => zc.close()),
  cE.addEventListener("click", () => zc.close()),
  Vc.addEventListener("submit", (arg1038) => {
    arg1038.preventDefault();
    const trim12 = Vc.elements.name.value.trim();
    if (!trim12) return;
    const ce2 = cp === "create" ? newId2("custom-popup") : ce;
    (zc.close(),
      E((arg1039) => {
        if (((arg1039.customPopups = arg1039.customPopups || []), cp === "rename")) {
          const v1273 = arg1039.customPopups.find((arg1040) => arg1040.id === ce);
          v1273 && (v1273.name = trim12);
          return;
        }
        (arg1039.customPopups.push({
          id: ce2,
          name: trim12,
          templateRef: {
            uiPackId: on(arg1039),
            templateId: "custom-popup",
            version: 1,
          },
          layout: {
            columns: 3,
          },
          modules: [],
        }),
          (ce = ce2),
          yt("popup"));
      }));
  }),
  Ze.addEventListener("change", () => {
    (Kc(), (ce = Ze.value || null), yt("popup"));
  }),
  bi.addEventListener("click", (arg1041) => {
    const closest74 = arg1041.target.closest("[data-popup-id]");
    closest74 &&
      (Kc(), (ce = closest74.dataset.popupId), (Ze.value = ce), rm(g.document, ce), yt("popup"));
  }),
  bi.addEventListener("contextmenu", (arg1042) => {
    const closest75 = arg1042.target.closest("[data-popup-id]");
    if (!closest75) return;
    (arg1042.preventDefault(),
      (ce = closest75.dataset.popupId),
      (Ze.value = ce),
      rm(g.document, ce),
      yt("popup"),
      (lp = ce),
      (_t.hidden = false),
      (_t.style.left = "0px"),
      (_t.style.top = "0px"));
    const boundingClientRect23 = _t.getBoundingClientRect();
    ((_t.style.left =
      clampNumber2(arg1042.clientX, 8, window.innerWidth - boundingClientRect23.width - 8) + "px"),
      (_t.style.top =
        clampNumber2(arg1042.clientY, 8, window.innerHeight - boundingClientRect23.height - 8) +
        "px"));
  }),
  wo.addEventListener("click", () => {
    if (wo.disabled) return;
    const hidden15 = _t.hidden;
    (to(), Ln(), (_t.hidden = !hidden15), wo.setAttribute("aria-expanded", String(hidden15)));
  }),
  _t.addEventListener("click", (arg1043) => {
    const v1274 = arg1043.target.closest("[data-popup-action]")?.dataset.popupAction,
      ce3 = lp || ce;
    if ((Kc(), !(!v1274 || !ce3))) {
      if (v1274 === "rename") {
        WC("rename");
        return;
      }
      if (v1274 === "duplicate") {
        const v1275 = newId2("custom-popup");
        ((ce = v1275),
          E((arg1044) => {
            const v1276 = (arg1044.customPopups || []).find((arg1045) => arg1045.id === ce3);
            if (!v1276) return;
            const v1277 = clone2(v1276);
            ((v1277.id = v1275),
              (v1277.name = v1276.name + "_副本"),
              (v1277.modules = (v1277.modules || []).map((arg1046) => ({
                ...arg1046,
                id: newId2("popup-module"),
              }))),
              arg1044.customPopups.push(v1277));
          }));
        return;
      }
      if (v1274 === "delete") {
        const v1278 = (g?.document?.customPopups || []).find((arg1047) => arg1047.id === ce3);
        if (!v1278) return;
        ((Va = ce3), (fE.textContent = v1278.name), Rc.showModal());
      }
    }
  }));
function RC() {
  ((Va = null), Rc.close());
}
(pE.addEventListener("click", RC),
  mE.addEventListener("click", RC),
  Rc.addEventListener("close", () => {
    Va = null;
  }),
  op.addEventListener("click", () => {
    const Va2 = Va;
    Va2 &&
      ((Va = null),
      Rc.close(),
      (op.disabled = true),
      E((arg1048) => {
        arg1048.customPopups = (arg1048.customPopups || []).filter((arg1049) => arg1049.id !== Va2);
        const v1279 = (arg1050) => {
          for (const element313 of arg1050 || []) {
            for (const [v1280, v1281] of Object.entries(element313.actions || {}))
              v1281.type === "more-info" &&
                v1281.data?.popupSource === "custom" &&
                v1281.data?.popupId === Va2 &&
                (element313.actions[v1280] = {
                  type: "none",
                  data: {},
                });
            v1279(element313.children);
          }
        };
        v1279(arg1048.sharedComponents);
        for (const v1282 of arg1048.pages || []) v1279(v1282.components);
        ((ce = arg1048.customPopups[0]?.id || null), ce || yt("edit"));
      }).finally(() => {
        op.disabled = false;
      }));
  }),
  dE.addEventListener("click", () => {
    (tr(), qi.close());
  }),
  uE.addEventListener("click", () => {
    (tr(), qi.close());
  }),
  Cn.addEventListener("click", () => {
    const hidden16 = tp.hidden;
    ((tp.hidden = !hidden16),
      Cn.setAttribute("aria-expanded", String(hidden16)),
      hidden16 &&
        (Ow(),
        window.requestAnimationFrame(() =>
          Wc.focus({
            preventScroll: true,
          }),
        )));
  }),
  Wc.addEventListener("input", () => Ow()),
  Ui.addEventListener("click", (arg1051) => {
    const closest76 = arg1051.target.closest("[data-popup-module-entity-id]");
    closest76 && ((ye.elements.entityId.value = closest76.dataset.popupModuleEntityId), Mw(), tr());
  }),
  np.addEventListener("click", (arg1052) => {
    const closest77 = arg1052.target.closest("[data-popup-module-device-type]");
    !closest77 ||
      ye.elements.type.value !== "climate" ||
      am(closest77.dataset.popupModuleDeviceType);
  }),
  ye.elements.type.addEventListener("change", () => {
    (am(), Ui.replaceChildren());
  }),
  ye.addEventListener("submit", (arg1053) => {
    arg1053.preventDefault();
    const ce4 = ce,
      v1283 = ye.elements.type.value,
      v1284 = ye.elements.entityId.value,
      trim13 = ye.elements.title.value.trim(),
      v1285 = normalizedPopupClimateDeviceType2(ye.elements.deviceType.value);
    if (!ce4 || !v1284) return;
    const v1286 = findCustomPopup2(g?.document, ce),
      options78 = {
        id: za || "candidate",
        type: v1283,
        entityId: v1284,
        ...(trim13
          ? {
              title: trim13,
            }
          : {}),
        ...(v1283 === "climate"
          ? {
              properties: {
                deviceType: v1285,
              },
            }
          : {}),
      },
      map46 = za
        ? (v1286?.modules || []).map((arg1054) =>
            arg1054.id === za
              ? {
                  ...arg1054,
                  ...options78,
                }
              : arg1054,
          )
        : [...(v1286?.modules || []), options78];
    if (!v1286 || !packPopupModules2(map46, v1286.layout).fits) {
      $(new Error("当前布局已超过 3 行，可增加列数或删除其它模块。"));
      return;
    }
    (tr(),
      qi.close(),
      E((arg1055) => {
        const v1287 = (arg1055.customPopups || []).find((arg1056) => arg1056.id === ce4);
        if (!v1287) return;
        const element314 = v1287.modules.find((arg1057) => arg1057.id === za);
        if (element314) {
          if (
            ((element314.type = v1283),
            (element314.entityId = v1284),
            trim13 ? (element314.title = trim13) : delete element314.title,
            v1283 === "climate")
          )
            element314.properties = {
              ...(element314.properties || {}),
              deviceType: v1285,
            };
          else {
            if (element314.properties?.deviceType) {
              const { deviceType: properties, ...properties2 } = element314.properties;
              Object.keys(properties2).length
                ? (element314.properties = properties2)
                : delete element314.properties;
            }
          }
          delete element314.deviceType;
          return;
        }
        v1287.modules.push({
          id: newId2("popup-module"),
          type: v1283,
          entityId: v1284,
          ...(trim13
            ? {
                title: trim13,
              }
            : {}),
          ...(v1283 === "climate"
            ? {
                properties: {
                  deviceType: v1285,
                },
              }
            : {}),
        });
      }));
  }),
  document.addEventListener("pointerdown", (arg1058) => {
    const closest78 = arg1058.target.closest("#delete-asset-folder-dialog");
    (De.contains(arg1058.target) || Mp(),
      !closest78 &&
        ei &&
        !ei.button.contains(arg1058.target) &&
        !ei.menu.contains(arg1058.target) &&
        Et(),
      arg1058.target.closest(".dashboard-select-row") || to(),
      arg1058.target.closest(".page-control .page-select-row") || Ln(),
      !arg1058.target.closest("#popup-list") &&
        !arg1058.target.closest("#popup-actions-menu") &&
        Kc(),
      arg1058.target.closest("#popup-module-entity-picker") || tr(),
      arg1058.target.closest(".component-popup-entity-picker") || pl(),
      arg1058.target.closest("#image-entity-picker") || G(xr, xi),
      arg1058.target.closest("#weather-entity-picker") || G(Pu, Au),
      arg1058.target.closest("#line-chart-entity-picker") || G(Mu, ku),
      arg1058.target.closest("#ibe-entity-picker") || G(Qs, xd),
      arg1058.target.closest("#icon-button-entity-picker") || G(Mi, ki),
      arg1058.target.closest("#vacuum-map-entity-picker") || G(Lc, xu),
      arg1058.target.closest("#camera-entity-picker") || G(Ac, Lu),
      arg1058.target.closest("#air-conditioner-entity-picker") || G(Cc, gu),
      arg1058.target.closest("#title-button-entity-picker") || G(nc, Dd),
      !Be.hidden &&
        !arg1058.target.closest("#light-statistics-entity-picker") &&
        !Be.contains(arg1058.target) &&
        (G(Be, ht), Za()),
      arg1058.target.closest("#light-statistics-action-entity-picker") || G(lc, Hd),
      arg1058.target.closest("#navigation-entity-picker") || G(Fu, Ia));
    const v1288 = nn.get(Ao)?.menu;
    !closest78 &&
      !arg1058.target.closest("#image-asset-picker") &&
      !v1288?.contains(arg1058.target) &&
      G(et, zn);
    const v1289 = nn.get(Oo)?.menu;
    (!closest78 &&
      !arg1058.target.closest("#ibe-asset-picker") &&
      !v1289?.contains(arg1058.target) &&
      G(tt, jn),
      !arg1058.target.closest("#ibe-icon-picker") && !Bt.contains(arg1058.target) && G(Bt, hn),
      !arg1058.target.closest("#icon-button-icon-picker") &&
        !Ft.contains(arg1058.target) &&
        G(Ft, $t),
      !arg1058.target.closest("#title-button-icon-picker") &&
        !nt.contains(arg1058.target) &&
        G(nt, yn),
      !arg1058.target.closest("#light-statistics-icon-picker") &&
        !ot.contains(arg1058.target) &&
        G(ot, vn),
      !arg1058.target.closest("#navigation-icon-picker") &&
        !Dt.contains(arg1058.target) &&
        G(Dt, wn));
  }));
const HC = new Set([Rn, Bo, Yr, ea, ra, ca, la, ua, $o, Fo, Do, zo, Vo, _n]);
(document.addEventListener(
  "input",
  (arg1059) => {
    if (B.size < 2 || !(HC.has(arg1059.target) || arg1059.target.id === "flow-line-scale")) return;
    arg1059.stopPropagation();
    const v1290 = Number(arg1059.target.value);
    if (!Number.isFinite(v1290)) return;
    const _02 = _0(clampNumber2(v1290, 1, 500) / 100);
    _02.length && x?.previewComponentsTransform(_02, w);
  },
  true,
),
  document.addEventListener(
    "change",
    (arg1060) => {
      if (B.size < 2 || !(HC.has(arg1060.target) || arg1060.target.id === "flow-line-scale"))
        return;
      arg1060.stopPropagation();
      const v1291 = Number(arg1060.target.value);
      if (!Number.isFinite(v1291)) {
        J();
        return;
      }
      const set13 = new Set(B),
        _03 = _0(clampNumber2(v1291, 1, 500) / 100);
      _03.length &&
        E((arg1061) => {
          for (const vector3 of _03) {
            if (!set13.has(vector3.componentId)) continue;
            const element315 = findComponent2(arg1061, vector3.componentId)?.component;
            element315 &&
              ((element315.position = {
                ...(element315.position || {}),
                x: vector3.x,
                y: vector3.y,
              }),
              (element315.style = {
                ...(element315.style || {}),
                scale: vector3.scale,
              }));
          }
        });
    },
    true,
  ),
  document.addEventListener("keydown", (arg1062) => {
    const closest79 = arg1062.target.closest(
      'input, textarea, select, button, [contenteditable="true"], dialog',
    );
    if (Le === "edit" && B.size && !closest79) {
      if (
        (arg1062.metaKey || arg1062.ctrlKey) &&
        !arg1062.altKey &&
        !arg1062.shiftKey &&
        arg1062.key.toLowerCase() === "d"
      ) {
        (arg1062.preventDefault(), J0([...B], w));
        return;
      }
      if (
        !arg1062.metaKey &&
        !arg1062.ctrlKey &&
        !arg1062.altKey &&
        (arg1062.key === "Delete" || arg1062.key === "Backspace")
      ) {
        (arg1062.preventDefault(), Z0([...B]));
        return;
      }
    }
    const options79 = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (
      options79[arg1062.key] &&
      Le === "edit" &&
      B.size &&
      !arg1062.metaKey &&
      !arg1062.ctrlKey &&
      !arg1062.altKey &&
      !closest79
    ) {
      arg1062.preventDefault();
      const num40 = arg1062.shiftKey ? 10 : 1,
        [v1292, v1293] = options79[arg1062.key];
      FE(v1292 * num40, v1293 * num40);
      return;
    }
    if (arg1062.key !== "Enter" || arg1062.isComposing) return;
    const closest80 = arg1062.target.closest(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])',
    );
    closest80 && (arg1062.preventDefault(), closest80.blur());
  }),
  To.addEventListener("scroll", () => {
    (dt(),
      Xp(),
      It("weather"),
      It("line-chart"),
      It("icon-button-effect"),
      It("icon-button"),
      It("vacuum-map"),
      It("camera"),
      It("air-conditioner"),
      It("title-button"),
      It("light-statistics"),
      qp(),
      ss(),
      ls(),
      gw(),
      hw(),
      Hp(),
      jp(),
      fw(),
      xp());
    for (const element316 of document.querySelectorAll("[data-popup-entity-menu]:not([hidden])"))
      fl(element316.closest("[data-action-trigger]"));
  }),
  window.addEventListener("resize", () => {
    (cf(), lf(), Mp(), Et(), q(), pl(), xp());
  }),
  df.addEventListener("click", async () => {
    const v1294 = g?.projectId,
      Ie8 = Ie;
    (await Wa.catch(() => {}), !(Ie !== Ie8 || g?.projectId !== v1294) && (await dm()));
  }),
  qx.addEventListener("click", IE),
  Ux.addEventListener("click", () => nd.close()),
  id.addEventListener("click", el),
  rd.addEventListener("click", el),
  ad.addEventListener("click", LE),
  On.addEventListener("cancel", (arg1063) => {
    (arg1063.preventDefault(), el());
  }),
  On.addEventListener("click", (arg1064) => {
    arg1064.target === On && el();
  }),
  Gs.addEventListener("input", () => {
    Gs.value = Gs.value.replace(/\D/g, "").slice(0, 6);
  }),
  kf.addEventListener("submit", TE),
  _S.addEventListener("click", async () => {
    bs() ||
      (await _("/auth/logout", {
        method: "POST",
      }),
      window.location.assign("/login"));
  }),
  Ga(),
  _a(document),
  Ya(document));
const jC = (arg1065) => {
  const boundingClientRect24 = Ni.getBoundingClientRect();
  ((ja = clampNumber2(
    (arg1065.clientX - boundingClientRect24.left) / Math.max(1, boundingClientRect24.width),
    0,
    1,
  )),
    (qa =
      1 -
      clampNumber2(
        (arg1065.clientY - boundingClientRect24.top) / Math.max(1, boundingClientRect24.height),
        0,
        1,
      )),
    D0());
};
(Ni.addEventListener("pointerdown", (arg1066) => {
  he &&
    (arg1066.preventDefault(),
    (Ua = arg1066.pointerId),
    Ni.setPointerCapture(arg1066.pointerId),
    jC(arg1066));
}),
  Ni.addEventListener("pointermove", (arg1067) => {
    arg1067.pointerId === Ua && jC(arg1067);
  }),
  Ni.addEventListener("pointerup", (arg1068) => {
    arg1068.pointerId === Ua && ((Ua = null), Ni.releasePointerCapture(arg1068.pointerId));
  }),
  md.addEventListener("input", () => {
    he && ((ti = clampNumber2(Number(md.value), 0, 360)), D0());
  }),
  Wn.addEventListener("input", () => {
    const v1295 = normalizedHexColor2(Wn.value);
    v1295 && ni(v1295, true);
  }),
  Wn.addEventListener("change", () => {
    const v1296 = normalizedHexColor2(Wn.value);
    v1296 ? ni(v1296, true) : he && (Wn.value = String(he.value || "").toUpperCase());
  }));
const qC = () => {
  if (!he) return;
  const v1297 = clampNumber2(Number(hd.value), 0, 255),
    v1298 = clampNumber2(Number(bd.value), 0, 255),
    v1299 = clampNumber2(Number(yd.value), 0, 255);
  [v1297, v1298, v1299].every(Number.isFinite) && ni(rgbToHex2(v1297, v1298, v1299), true);
};
for (const t of [hd, bd, yd]) (t.addEventListener("input", qC), t.addEventListener("change", qC));
(fd.addEventListener("click", async () => {
  if (he)
    try {
      (await ii(String(he.value || "").toUpperCase()),
        window.clearTimeout($0),
        fd.classList.add("copied"),
        ($0 = window.setTimeout(() => fd.classList.remove("copied"), 1200)));
    } catch (v1300) {
      $(v1300);
    }
}),
  gd.addEventListener("click", async () => {
    if (he)
      try {
        const text92 = await navigator.clipboard.readText(),
          v1301 = normalizedHexColor2(text92);
        if (!v1301) throw new Error("剪贴板中没有可用的十六进制颜色值。");
        ((Wn.value = v1301.toUpperCase()),
          ni(v1301, true),
          gd.classList.add("copied"),
          window.setTimeout(() => gd.classList.remove("copied"), 1200));
      } catch (v1302) {
        $(v1302);
      }
  }),
  document.addEventListener(
    "click",
    (arg1069) => {
      const closest81 = arg1069.target.closest("button");
      if (!closest81) return;
      let v1303 = false;
      ([wn, hn, $t, yn, vn].includes(closest81)
        ? (v1303 = dT(closest81))
        : closest81 === ht
          ? (v1303 = BC())
          : closest81.matches("[data-popup-entity-button]")
            ? (v1303 = $C(closest81))
            : closest81 === Cn
              ? (v1303 = FC())
              : [zn, jn].includes(closest81)
                ? (v1303 = uT(closest81))
                : (v1303 = OC(closest81)),
        v1303 && (arg1069.preventDefault(), arg1069.stopImmediatePropagation()));
    },
    true,
  ),
  document.addEventListener("pointerdown", (arg1070) => {
    Ct.hidden || Ct.contains(arg1070.target) || arg1070.target === he || V0();
  }),
  new MutationObserver((arg1071) => {
    for (const v1304 of arg1071)
      for (const v1305 of v1304.addedNodes)
        v1305 instanceof HTMLElement && (Ga(v1305), _a(v1305), Ya(v1305));
  }).observe(document.body, {
    childList: true,
    subtree: true,
  }),
  deferHiddenEditorDialogs2(),
  yt("edit"),
  window.setInterval(() => {
    document.visibilityState === "visible" && (or().catch(() => {}), wl().catch(() => {}));
  }, 15000),
  window.setInterval(() => {
    document.visibilityState === "visible" && Pw().catch(() => {});
  }, 30000),
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "visible" &&
      (or().catch(() => {}), Pw().catch(() => {}), wl().catch(() => {}));
  }),
  Promise.all([
    jL(),
    wl(),
    Xa(),
    or({
      preserveForm: false,
    }),
    bl(),
    Tn(),
    lo(),
  ])
    .then(() => Xe())
    .catch($));
async function mT(arg1072, arg1073, arg1074, arg1075) {
  const Ie9 = Ie,
    v1306 = g?.projectId,
    v1307 = () =>
      Ie === Ie9 &&
      g?.projectId === v1306 &&
      w === arg1073 &&
      F()?.properties?.controlMode === "entity-sign";
  arg1072.disabled = true;
  try {
    if ((Xo || (await lo()), !v1307() || !arg1072.isConnected)) return;
    const _19 = await _("/ha/numeric-sources");
    if (!v1307() || !arg1072.isConnected) return;
    const map47 = new Map(K.map((arg1076) => [arg1076.entityId, arg1076])),
      map48 = (_19.items || []).map((arg1077) => ({
        ...map47.get(arg1077.entityId),
        ...arg1077,
        name: map47.get(arg1077.entityId)?.name || arg1077.name || arg1077.entityId,
      }));
    kn({
      kind: "entity",
      title: "选择流水线条数值实体",
      subtitle: "正数正向，负数反向，0 或不可用时只显示底线",
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: arg1072,
      pageSize: 20,
      selectedText: arg1074 || "未绑定",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: v1308, page: v1309, pageSize: v1310 }) {
        const split = String(v1308 || "")
            .toLowerCase()
            .trim()
            .split(/\s+/),
          filter26 = map48.filter((arg1078) =>
            split.every((arg1079) =>
              (rt(arg1078) + " " + arg1078.entityId).toLowerCase().includes(arg1079),
            ),
          );
        return {
          items: filter26.slice((v1309 - 1) * v1310, v1309 * v1310),
          total: filter26.length,
        };
      },
      renderSelectedActions: () => [so("清除绑定", !arg1074)],
      renderItem: (arg1080) => {
        const qt2 = qt(arg1080, arg1074);
        return (
          arg1080.unavailable && qt2.querySelector(".inspector-entity-name").prepend("暂不可用 · "),
          qt2
        );
      },
      onSelect: (arg1081) => {
        if (v1307()) return arg1075(arg1081);
      },
    });
  } catch (v1311) {
    v1307() && arg1072.isConnected && $(v1311);
  } finally {
    arg1072.disabled = false;
  }
}
function fT(arg1082) {
  const v1312 = arg1082?.id;
  return {
    document: g?.document,
    entities: K,
    entityName: vt,
    enhance: (arg1083) => {
      (Ga(arg1083), _a(arg1083), Ya(arg1083));
    },
    change: (arg1084) => {
      const il4 = arg1084.geometry === "rotation" ? il() : [];
      return E((arg1085) => {
        const v1313 = findComponent2(arg1085, v1312)?.component;
        v1313?.type === "percentage-bar" &&
          (arg1084.geometry === "rotation" && il4.length > 1
            ? Lt(arg1085, v1312, arg1084.value, il4)
            : applyPercentageBarChange2(v1313, arg1084, arg1085.canvas));
      });
    },
    canApplyStyle: arg1082?.type === "percentage-bar" && Pe(arg1082).length > 0,
    applyStyle: hT,
    previewProperty: (arg1086, arg1087) => {
      const v1314 = clone2(arg1082);
      (applyPercentageBarChange2(
        v1314,
        {
          property: arg1086,
          value: arg1087,
        },
        g.document.canvas,
      ),
        x?.previewComponentTransform(v1312, v1314.position),
        x?.previewComponentProperties(v1312, v1314.properties));
    },
    previewGeometry: (arg1088, arg1089) => {
      const canvas = g.document.canvas,
        position = arg1082.position;
      if (arg1088 === "rotation" && il().length > 1) return;
      const options80 =
        arg1088 === "left"
          ? {
              x: (canvas.width * arg1089) / 100 - position.width / 2,
            }
          : arg1088 === "top"
            ? {
                y: (canvas.height * arg1089) / 100 - position.height / 2,
              }
            : arg1088 === "scale"
              ? {
                  scale: arg1089 / 100,
                }
              : {
                  rotation: arg1089,
                };
      x?.previewComponentTransform(v1312, options80);
    },
    pickEntity: (arg1090, arg1091, arg1092) => gT(arg1090, v1312, arg1091, arg1092),
  };
}
async function gT(arg1093, arg1094, arg1095, arg1096) {
  const Ie10 = Ie,
    v1315 = g?.projectId,
    v1316 = () => Ie === Ie10 && g?.projectId === v1315 && w === arg1094;
  arg1093.disabled = true;
  const textContent = arg1093.textContent;
  arg1093.textContent = "正在筛选百分比实体…";
  try {
    if (!Xo) {
      if ((await lo(), !v1316())) return;
      arg1093 =
        document.querySelector('#percentage-bar-inspector button[aria-label="选择百分比实体"]') ||
        arg1093;
    }
    const _20 = await _("/ha/percentage-sources");
    if (!v1316() || !arg1093.isConnected) return;
    const map49 = new Map(K.map((arg1097) => [arg1097.entityId, arg1097])),
      map50 = (_20.items || []).map((arg1098) => ({
        ...arg1098,
        name: vt(map49.get(arg1098.entityId)) || arg1098.entityId,
      }));
    kn({
      kind: "entity",
      title: "选择百分比实体",
      subtitle: "百分比状态、窗帘开合度、风扇百分比与湿度属性",
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: arg1093,
      pageSize: 20,
      selectedText: arg1095.entityId
        ? "" + arg1095.entityId + (arg1095.attribute ? " · " + arg1095.attribute : "")
        : "未绑定",
      emptyText: "没有匹配的百分比实体",
      itemClass: "entity-list",
      getPage({ query: v1317, page: v1318, pageSize: v1319 }) {
        const split2 = String(v1317 || "")
            .toLowerCase()
            .trim()
            .split(/\s+/),
          filter27 = map50.filter((arg1099) =>
            split2.every((arg1100) =>
              (arg1099.name + " " + arg1099.entityId + " " + arg1099.sourceLabel)
                .toLowerCase()
                .includes(arg1100),
            ),
          );
        return {
          items: filter27.slice((v1318 - 1) * v1319, v1318 * v1319),
          total: filter27.length,
        };
      },
      renderSelectedActions: () => [so("清除绑定", !arg1095.entityId)],
      renderItem(arg1101) {
        const options81 = map49.get(arg1101.entityId) || {
            entityId: arg1101.entityId,
            name: arg1101.name,
          },
          qt3 = qt(
            options81,
            arg1095.entityId === arg1101.entityId && arg1095.attribute === arg1101.attribute
              ? arg1101.entityId
              : "",
          );
        return (
          (qt3.dataset.editorPickerValue = JSON.stringify([arg1101.entityId, arg1101.attribute])),
          (qt3.querySelector(".inspector-entity-name").textContent += " · " + arg1101.sourceLabel),
          qt3
        );
      },
      onSelect(arg1102) {
        if (!v1316()) return;
        const [list55, list56] = arg1102 ? JSON.parse(arg1102) : ["", ""];
        arg1096({
          entityId: list55,
          attribute: list56,
        });
      },
    });
  } catch (v1320) {
    $(v1320);
  } finally {
    ((arg1093.disabled = false), (arg1093.textContent = textContent));
  }
}
function hT() {
  const f43 = F();
  if (f43?.type !== "percentage-bar") return;
  const pe10 = Pe(f43);
  if (!pe10.length) return;
  const options82 = {
      variant: "柱体样式",
      orientation: "显示方向",
      thickness: "统一柱宽",
      length: "柱体长度",
      gap: "柱间距",
      valueOffsetX: "数值水平偏移",
      valueOffsetY: "数值垂直偏移",
      labelOffsetX: "备注水平偏移",
      labelOffsetY: "备注垂直偏移",
      valueSize: "数值字号",
      labelSize: "备注字号",
      radius: "柱顶圆角",
      fillOpacity: "填充浓度",
      precision: "小数位数",
      valueVisible: "显示数值",
      labelVisible: "显示备注",
      valueColor: "数值颜色",
      labelColor: "备注颜色",
    },
    options83 = {
      gradient: "渐变柱",
      cursor: "内嵌游标柱",
      glass: "玻璃液柱",
      vertical: "纵向",
      horizontal: "横向",
      true: "显示",
      false: "隐藏",
    };
  ((Xt.textContent = "应用百分比柱状图样式"),
    (Jt.textContent = "应用到百分比柱状图"),
    (Qt.textContent = "按区域与页面区分"),
    (Kt.textContent = "选择要应用的样式与目标控件，每根柱子的实体、备注和颜色分别保留。"),
    zt.replaceChildren(
      ...Object.entries(options82).map(([v1321, v1322]) => {
        const v1323 = f43.properties?.[v1321] ?? percentageBarDefaults2[v1321];
        return Ut({
          value: v1321,
          label: v1322,
          detail: options83[v1323] || String(v1323),
        });
      }),
    ),
    ln(pe10, "百分比柱状图"),
    (Ae.hidden = true),
    (bt = {
      sourceId: f43.id,
      type: "percentage-bar",
    }),
    He.showModal());
}
