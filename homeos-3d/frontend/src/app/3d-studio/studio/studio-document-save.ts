/**
 * 文档持久化与保存交互：场景快照、保存/冲突/交互确认流程与相关 UI 状态。
 *
 * 自 studio-app.ts 外提（依赖闭包自底向上）。对本模块之外的 studio-app.ts
 * 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { isStageViewerMode } from "./studio-architecture.js";
import { state } from "./studio-state.js";
import { selectElement } from "./studio-plan-render.js";
import { apiFetch } from "../../utils/api-fetch.js";
import {
  apiAuthChallenge,
  apiRequestError
} from "../../utils/api-request.js";
import { normalizeScene } from "./studio-scene-normalize.js";
import {
  finite,
  normalizeBaseLighting,
  normalizeCameraSettings,
  normalizeFixedCameraView,
  normalizeLabelText
} from "../loaders/studio-normalization.js";
import { createId } from "./studio-plan-geometry.js";
import { clamp } from "../plan/geometry.js";
import {
  normalizeActiveExportPresetSlot,
  normalizeExportPresetSlots
} from "../export/export-presets.js";
import { createEmptyScene } from "./studio-scene-defaults.js";
import { LIGHT_ITEM_TYPES } from "./studio-item-types.js";

export const saveStateElement = selectElement("#save-state");

export const saveConflictDialogElement = selectElement("#save-conflict-dialog");

export const saveConflictReopenButton = selectElement("#save-conflict-reopen");

export const saveInteractionDialogElement = selectElement("#save-interaction-dialog");

export const saveInteractionMessageElement = selectElement("#save-interaction-message");

export const saveInteractionProjectsElement = selectElement("#save-interaction-projects");

export const saveInteractionImpactsElement = selectElement("#save-interaction-impacts");

export const saveInteractionSummaryElement = selectElement("#save-interaction-summary");

export const saveInteractionReopenButton = selectElement("#save-interaction-reopen");

export const toastElement = selectElement("#toast");

/**
 * 按楼层序号生成默认楼层名（一层…十层，之后用「N层」）。只用于「用户没改过名字」的
 */
export function floorNameForIndex(floorNumber: any) {
  return (
    ["一层", "二层", "三层", "四层", "五层", "六层", "七层", "八层", "九层", "十层"][floorNumber] ||
    floorNumber + 1 + "层"
  );
}

/**
 * 新建楼层记录。elevation/offsetX/offsetZ/rotation 是整层相对世界原点的摆放变换；
 */
export function createFloor(newFloorIndex = 0, floorScene = createEmptyScene()) {
  const normalizedScene = normalizeScene(floorScene);
  const defaultFloorHeight = clamp(finite(state.studioDocument?.defaultFloorHeight, 3), 1.8, 8);
  return {
    id: createId("floor"),
    name: floorNameForIndex(newFloorIndex),
    elevation: newFloorIndex * defaultFloorHeight,
    offsetX: 0,
    offsetZ: 0,
    rotation: 0,
    originX: normalizedScene.background?.width ? normalizedScene.background.width / 2 : 0,
    originY: normalizedScene.background?.height ? normalizedScene.background.height / 2 : 0,
    originInitialized: !!normalizedScene.background,
    aligned: newFloorIndex === 0,
    alignmentPending: newFloorIndex > 0,
    scene: normalizedScene
  };
}

/**
 * 把服务端（或旧版本）存下的文档归一成当前结构。夹取范围是「物理上说得通」的宽松
 */
export function normalizeStudioDocument(rawDocument: any) {
  const rawFloors = Array.isArray(rawDocument?.floors) ? rawDocument.floors : null;
  const normalizedFloors = rawFloors?.length
    ? rawFloors.map((rawFloor: any, rawFloorIndex: any) => {
        const normalizedFloorScene = normalizeScene(rawFloor?.scene);
        const originInitialized = rawFloor?.originInitialized === true;
        const normalizedName = normalizeLabelText(
          rawFloor?.name,
          floorNameForIndex(rawFloorIndex),
          24
        );
        const floorName =
          normalizedName === rawFloorIndex + 1 + "层"
            ? floorNameForIndex(rawFloorIndex)
            : normalizedName;
        return {
          id: String(rawFloor?.id || createId("floor")),
          name: floorName,
          elevation: clamp(finite(rawFloor?.elevation, rawFloorIndex * 3), -30, 120),
          offsetX: clamp(finite(rawFloor?.offsetX, 0), -100, 100),
          offsetZ: clamp(finite(rawFloor?.offsetZ, 0), -100, 100),
          rotation: clamp(finite(rawFloor?.rotation, 0), -180, 180),
          originX: originInitialized
            ? finite(rawFloor?.originX, 0)
            : normalizedFloorScene.background?.width
              ? normalizedFloorScene.background.width / 2
              : 0,
          originY: originInitialized
            ? finite(rawFloor?.originY, 0)
            : normalizedFloorScene.background?.height
              ? normalizedFloorScene.background.height / 2
              : 0,
          originInitialized: originInitialized || !!normalizedFloorScene.background,
          aligned:
            rawFloorIndex === 0 ||
            rawFloor?.aligned === true ||
            Math.abs(finite(rawFloor?.offsetX, 0)) > 0.000001 ||
            Math.abs(finite(rawFloor?.offsetZ, 0)) > 0.000001,
          alignmentPending: rawFloor?.alignmentPending === true,
          scene: normalizedFloorScene
        };
      })
    : [createFloor(0, rawDocument)];
  const storedActiveFloorId = String(rawDocument?.activeFloorId || "");
  const activeFloor =
    normalizedFloors.find((matchedFloor: any) => matchedFloor.id === storedActiveFloorId) ||
    normalizedFloors[0];
  const storedFloorHeight = clamp(finite(rawDocument?.defaultFloorHeight, 3), 0, 20);
  const isModernSchema = finite(rawDocument?.schemaVersion, 0) >= 6;
  const normalizedExportPresets = normalizeExportPresetSlots(rawDocument?.exportPresets);
  return {
    schemaVersion: 7,
    activeFloorId: activeFloor.id,
    defaultFloorHeight: clamp(finite(rawDocument?.defaultFloorHeight, 3), 1.8, 8),
    previewFloorGap: clamp(
      isModernSchema
        ? finite(rawDocument?.previewFloorGap, 3)
        : storedFloorHeight + finite(rawDocument?.previewFloorGap, 0),
      0,
      20
    ),
    uniformOverviewStack: rawDocument?.uniformOverviewStack === true,
    exportFloorGap: clamp(
      isModernSchema
        ? finite(rawDocument?.exportFloorGap, 3)
        : storedFloorHeight + finite(rawDocument?.exportFloorGap, 0),
      0,
      20
    ),
    previewFloorMode: rawDocument?.previewFloorMode === "all" ? "all" : "active",
    combinedCameraSettings: normalizeCameraSettings(rawDocument?.combinedCameraSettings),
    combinedFixedCameraView: normalizeFixedCameraView(rawDocument?.combinedFixedCameraView),
    baseLighting: normalizeBaseLighting(rawDocument?.baseLighting),
    exportPresets: normalizedExportPresets,
    activeExportPresetSlot: normalizeActiveExportPresetSlot(
      rawDocument?.activeExportPresetSlot,
      normalizedExportPresets.length
    ),
    floors: normalizedFloors
  };
}

/**
 * 深拷贝整份文档（楼层、场景、导出预设全覆盖）。用 structuredClone 而不是 JSON 往返：
 */
export function cloneStudioDocument() {
  return structuredClone(state.studioDocument || normalizeStudioDocument(state.activeScene));
}

/**
 * 生成要提交给后端的文档快照。与 cloneStudioDocument 的差别只在导出期间：导出用的是
 */
export function snapshotDocumentForSave() {
  const documentSnapshot = cloneStudioDocument();
  if (!state.exportRenderState) {
    return documentSnapshot;
  }
  documentSnapshot.previewFloorMode = state.exportRenderState.floorMode;
  for (const floorSnapshot of documentSnapshot.floors || []) {
    const cameraSettings = state.exportRenderState.floorCameraSettings.get(floorSnapshot.id);
    if (cameraSettings) {
      floorSnapshot.scene.settings.cameraMode = cameraSettings.mode;
      floorSnapshot.scene.settings.cameraView = cameraSettings.view;
      floorSnapshot.scene.settings.cameraTopRotation = cameraSettings.topRotation;
      floorSnapshot.scene.settings.cameraFocalLength = cameraSettings.focalLength;
    }
  }
  documentSnapshot.combinedCameraSettings = {
    ...state.exportRenderState.combinedCameraSettings
  };
  return documentSnapshot;
}

/**
 * 统一的工作室后端请求入口：拼 /api/v1 前缀、解析响应与错误。只读视图下禁止非 GET 请求并直接抛错；
 */
export async function requestStudioApi(requestPath: any, requestOptions: any = {}, prewarmedResponse: any = null) {
  if (isStageViewerMode && requestOptions.method && requestOptions.method !== "GET") {
    throw new Error("交互户型为只读视图。");
  }
  // 舞台页的场景请求可能已经被 stage-startup.js 提前发出（同一个 URL、同一份头，见其文件头）：
  const prewarmedApiResponse = prewarmedResponse ? await prewarmedResponse.catch(() => null) : null;
  const apiResponse =
    prewarmedApiResponse ||
    (await apiFetch("/api/v1" + requestPath, {
      cache: "no-store",
      ...requestOptions,
      headers: requestOptions.body
        ? {
            "Content-Type": "application/json",
            ...(requestOptions.headers || {})
          }
        : requestOptions.headers
    }));
  const apiResponseText = apiResponse.status === 204 ? "" : await apiResponse.text();
  let responsePayload = null;
  if (apiResponseText) {
    try {
      responsePayload = JSON.parse(apiResponseText);
    } catch {
      responsePayload = null;
    }
  }
  const authChallenge = apiAuthChallenge(apiResponse.status, responsePayload);
  if (authChallenge === "session-expired") {
    window.location.assign("/login?next=" + encodeURIComponent(window.location.pathname));
    throw apiRequestError(responsePayload, {
      status: apiResponse.status,
      message: "登录状态已失效。",
      response: apiResponse
    });
  }
  if (authChallenge === "license-restricted") {
    window.location.assign("/license");
    throw apiRequestError(responsePayload, {
      status: apiResponse.status,
      message: "当前授权无法使用户型图绘制。",
      response: apiResponse
    });
  }
  if (!apiResponse.ok) {
    // 文案归一交给 utils/api-error.js（它认 FastAPI 422 的数组形态）。
    throw apiRequestError(responsePayload, {
      status: apiResponse.status,
      fallback: "请求失败（HTTP " + apiResponse.status + "）",
      response: apiResponse
    });
  }
  return responsePayload;
}

/**
 * 弹出一条底部提示，并按语气决定停留时长。warning 停 4400ms、其余 2600ms：警告（如
 */
export function showToast(toastMessage: any, tone = "") {
  window.clearTimeout(state.toastTimer);
  toastElement.textContent = toastMessage;
  toastElement.className = ("toast visible " + tone).trim();
  state.toastTimer = window.setTimeout(
    () => {
      toastElement.className = "toast";
    },
    tone === "warning" ? 4400 : 2600
  );
}

/**
 * 更新顶部保存状态指示器（文案 + 语气色）。用 innerHTML 拼一个 <i> 圆点再跟文案，
 */
export function setSaveState(label: any, saveStateTone = "") {
  saveStateElement.className = ("save-state " + saveStateTone).trim();
  saveStateElement.innerHTML = "<i></i>" + label;
}

/**
 * 标记文档有未保存改动：递增版本号、更新状态条并排一次防抖自动保存。changeRevision 随 PUT 提交给
 */
export function markDocumentDirty() {
  if (!isStageViewerMode) {
    state.isExportComplete = false;
    state.changeRevision += 1;
    setSaveState("有未保存修改", "saving");
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = window.setTimeout(saveStudioDraft, 650);
    updateOnboardingSteps();
  }
}

/**
 * 打开保存冲突对话框（幂等：已经开着时不再 `showModal()`，重复调用会抛异常）。
 */
export function openSaveConflictDialog() {
  if (!saveConflictDialogElement.open) {
    saveConflictDialogElement.showModal();
  }
}

/**
 * 把「有未处理冲突」这件事挂在界面上：状态栏文案 + 一颗常驻的「处理保存冲突」按钮。
 */
export function setSaveConflictPendingUi(hasPendingConflict: any) {
  saveConflictReopenButton.hidden = !hasPendingConflict;
}

/**
 * 记录 409 保存冲突，并按需弹处理对话框。saveConflict 保存服务器最新场景、本地待保存场景与本次要
 */
export function handleSaveConflict(
  conflictingServerScene: any,
  localScene: any,
  serverRevision: any,
  { reopenDialog = true } = {}
) {
  state.saveConflict = {
    latest: conflictingServerScene,
    localScene: localScene,
    targetVersion: serverRevision
  };
  setSaveState("等待处理保存冲突", "error");
  setSaveConflictPendingUi(true);
  if (reopenDialog) {
    openSaveConflictDialog();
  }
}

/**
 * 提交一次场景快照到 PUT /api/v1/studio3d，返回服务器回写的最新草稿记录（含新 revision）。
 * @param {{revision: number}} sceneRecord 服务器草稿记录，取它的 revision 做乐观并发。
 * @param {object|null} [sceneSnapshot] 覆写要提交的场景，null 表示现取当前文档快照。
 * @param {string|null} [interactionConfirmation] 删除影响确认令牌，非空时一并提交。
 */
export async function putStudioScene(sceneRecord: any, sceneSnapshot: any = null, interactionConfirmation: any = null) {
  return requestStudioApi("/studio3d", {
    method: "PUT",
    hbLogContext: {
      phase: "studio-save"
    },
    body: JSON.stringify({
      revision: sceneRecord.revision,
      scene: sceneSnapshot || snapshotDocumentForSave(),
      ...(interactionConfirmation ? {
        interactionConfirmation
      } : {})
    })
  });
}

/**
 * 打开「本次删除影响」对话框（幂等：已经开着时不再 showModal()，重复调用会抛异常）。
 */
export function openSaveInteractionDialog() {
  if (!saveInteractionDialogElement.open) {
    saveInteractionDialogElement.showModal();
  }
}

/**
 * 把「有未确认的删除影响」挂在界面上：状态栏文案 + 一颗常驻入口。与 409 的「处理保存冲突」
 */
export function setSaveInteractionPendingUi(hasPendingInteraction: any) {
  saveInteractionReopenButton.hidden = !hasPendingInteraction;
}

export function renderSaveInteractionDialog(confirmation: any) {
  const impactedProjects = Array.isArray(confirmation.projects)
    ? [...new Set(confirmation.projects)]
    : [];
  const impactedBindings = Array.isArray(confirmation.impacts) ? confirmation.impacts : [];
  saveInteractionMessageElement.textContent =
    confirmation.message || "删除的模型被 3D 控件引用，保存将一并移除这些绑定。";
  saveInteractionSummaryElement.textContent =
    "共影响 " + impactedProjects.length + " 个仪表盘、" + impactedBindings.length + " 项交互绑定。";
  saveInteractionProjectsElement.textContent = impactedProjects.join("、") || "—";
  // 没有明细时收起列表，别在弹窗里留一个空边框盒子。
  saveInteractionImpactsElement.hidden = !impactedBindings.length;
  saveInteractionImpactsElement.replaceChildren(
    ...impactedBindings.map((impact: any) => {
      const impactItem = document.createElement("li");
      impactItem.textContent = impact.label || impact.componentId || impact.projectId || "";
      return impactItem;
    })
  );
}

/**
 * 记录「删除影响未确认」，并按需弹确认对话框。record 里存的是服务端令牌与**发起这次保存时**
 * @param {object} payload 预检（PUT ?dryRun=1 的 200 响应体）或 428 的 detail（服务端 428
 * @param {number} revision 服务器草稿版本（乐观并发用）。
 * @param {object} scene 那次请求发出的场景快照。
 * @param {number} localRevision 该快照对应的本地 changeRevision，确认时据此判断场景是否已过期。
 */
export function handleSaveInteractionConfirmation(payload: any, revision: any, scene: any, localRevision: any, { reopenDialog = true } = {}) {
  // 容一次「调用方误传整包响应体」：真传错时 token 会被读成空串，确认重发永远撞回 428 —— 正是
  const detail = payload?.detail && typeof payload.detail === "object" ? payload.detail : payload;
  state.saveInteractionConfirmation = {
    token: detail?.token || "",
    message: detail?.message || "",
    impacts: Array.isArray(detail?.impacts) ? detail.impacts : [],
    projects: Array.isArray(detail?.projects) ? detail.projects : [],
    revision: revision,
    scene: scene,
    localRevision: localRevision
  };
  renderSaveInteractionDialog(state.saveInteractionConfirmation);
  setSaveState("等待处理删除影响", "error");
  setSaveInteractionPendingUi(true);
  if (reopenDialog) {
    openSaveInteractionDialog();
  }
}

/**
 * 删除影响已按用户选择处理掉（确认保存成功）：清记录、撤掉常驻入口、关对话框。
 */
export function resolveSaveInteraction() {
  state.saveInteractionConfirmation = null;
  state.saveInteractionDeferred = false;
  setSaveInteractionPendingUi(false);
  saveInteractionDialogElement.close();
}

/**
 * 取出一份文档快照里「可能被 3D 控件绑定指向」的物件身份集合。口径与服务端
 */
export function documentBindingIdentities(documentSnapshot: any) {
  const identities = new Set();
  for (const floorRecord of documentSnapshot?.floors || []) {
    const floorId = floorRecord?.id;
    const floorScene = floorRecord?.scene;
    if (!floorId || !floorScene) {
      continue;
    }
    for (const [identityKind, collectionField] of [["model", "items"], ["light", "lightGroups"]]) {
      for (const listedItem of floorScene[collectionField] || []) {
        if (listedItem?.id) {
          identities.add(floorId + "|" + identityKind + "|" + listedItem.id);
        }
      }
    }
    for (const listedDoor of floorScene.doors || []) {
      if (listedDoor?.id) {
        identities.add(floorId + "|door|door:" + listedDoor.id);
      }
    }
  }
  return identities;
}

/**
 * 这次保存相对上一次成功保存的场景，是否删掉了物件。只有删过才可能撞上「删除影响确认」，
 */
export function sceneRemovedBindingTargets(previousSnapshot: any, nextSnapshot: any) {
  const nextIdentities = documentBindingIdentities(nextSnapshot);
  for (const previousIdentity of documentBindingIdentities(previousSnapshot)) {
    if (!nextIdentities.has(previousIdentity)) {
      return true;
    }
  }
  return false;
}

/**
 * 删除影响预检：先问出「这次保存会撞哪些绑定」（PUT ?dryRun=1，服务端只算不写），有影响就直接
 * @returns {Promise<boolean>} true 表示确认框已挂上、本次不应再提交。
 */
export async function requestInteractionConfirmationIfNeeded(sceneRecord: any, sceneSnapshot: any, localRevision: any) {
  if (!sceneRecord?.scene || !sceneRemovedBindingTargets(sceneRecord.scene, sceneSnapshot)) {
    return false;
  }
  const interactionPlan = await requestStudioApi("/studio3d?dryRun=1", {
    method: "PUT",
    hbLogContext: {
      phase: "studio-save"
    },
    body: JSON.stringify({
      revision: sceneRecord.revision,
      scene: sceneSnapshot
    })
  });
  if (!interactionPlan?.confirmationRequired) {
    return false;
  }
  handleSaveInteractionConfirmation(interactionPlan, sceneRecord.revision, sceneSnapshot, localRevision, {
    reopenDialog: !state.saveInteractionDeferred
  });
  return true;
}

export async function saveStudioDraft() {
  if (isStageViewerMode || !state.savedSceneRecord) {
    return "skipped";
  }
  if (state.isSaving) {
    return "skipped";
  }
  if (state.saveConflict && !state.saveConflictDeferred) {
    return "blocked-by-conflict";
  }
  if (state.saveInteractionConfirmation && !state.saveInteractionDeferred) {
    return "blocked-by-interaction-confirmation";
  }
  if (state.changeRevision === state.savedRevision) {
    return "no-changes";
  }
  state.isSaving = true;
  const revision = state.changeRevision;
  // 本次要提交的场景快照只取一次：428 的令牌是服务端对**这份请求体**算的哈希，确认重发必须原样
  const sceneSnapshot = snapshotDocumentForSave();
  setSaveState("正在保存…", "saving");
  try {
    try {
      // 先做删除影响预检：命中就把确认框挂上、本次不再提交（服务端不落盘）。
      if (await requestInteractionConfirmationIfNeeded(state.savedSceneRecord, sceneSnapshot, revision)) {
        return "blocked-by-interaction-confirmation";
      }
      state.savedSceneRecord = await putStudioScene(state.savedSceneRecord, sceneSnapshot);
    } catch (saveRequestError: any) {
      // 428：本次删除会让控件绑定悬空，服务端什么都没写、只回了令牌与影响清单。把「当时」的
      if (saveRequestError.status === 428 && saveRequestError.code === "STUDIO3D_INTERACTION_CONFIRMATION") {
        handleSaveInteractionConfirmation(
          saveRequestError.payload?.detail,
          state.savedSceneRecord.revision,
          sceneSnapshot,
          revision,
          {
            reopenDialog: !state.saveInteractionDeferred
          }
        );
        return "blocked-by-interaction-confirmation";
      }
      if (saveRequestError.status !== 409 || saveRequestError.code === "PROJECT_REVISION_CONFLICT") {
        throw saveRequestError;
      }
      const remoteScene = await requestStudioApi("/studio3d");
      handleSaveConflict(remoteScene, snapshotDocumentForSave(), revision, {
        // 用户已经选了「稍后处理」时不再弹窗：记录照样刷新（latest 跟得上服务器），
        reopenDialog: !state.saveConflictDeferred
      });
      return "blocked-by-conflict";
    }
    state.savedRevision = revision;
    // 这次能保存成功就说明服务端已找不到悬空引用：之前挂着的「删除影响」确认已经过时，
    if (state.saveInteractionConfirmation) {
      resolveSaveInteraction();
    }
    if (state.changeRevision === state.savedRevision) {
      setSaveState("已自动保存", "saved");
    }
    return "saved";
  } catch (saveFailureError: any) {
    window.HABridgeLog?.error?.(saveFailureError, {
      phase: "studio-save"
    });
    setSaveState("保存失败", "error");
    showToast(saveFailureError.message || "3D 草稿保存失败。", "error");
    return "failed";
  } finally {
    state.isSaving = false;
    // 冲突或未确认的删除影响挂着时不再重排：等用户处理完（或者他改了下一笔，由 markDocumentDirty
    if (!state.saveConflict && !state.saveInteractionConfirmation && state.changeRevision !== state.savedRevision) {
      window.clearTimeout(state.autosaveTimer);
      state.autosaveTimer = window.setTimeout(saveStudioDraft, 500);
    }
  }
}

/**
 * 刷新新手引导清单的完成态与当前高亮步骤。六步按固定顺序判定（底图 / 标定 / 墙体 / 物件 / 灯具 /
 */
export function updateOnboardingSteps() {
  const completedSteps = {
    background: !!state.activeScene.background,
    scale: !!state.activeScene.calibration,
    walls: state.activeScene.walls.length > 0,
    items: state.activeScene.items.some((onboardingItem: any) => !LIGHT_ITEM_TYPES.has(onboardingItem.type)),
    lights: state.activeScene.items.some((onboardingLightItem: any) =>
      LIGHT_ITEM_TYPES.has(onboardingLightItem.type)
    ),
    export: state.isExportComplete
  };
  const currentStepName =
    ["background", "scale", "walls", "items", "lights", "export"].find(
      stepName => !(completedSteps as any)[stepName]
    ) || "export";
  for (const stepElement of document.querySelectorAll("[data-step]")) {
    stepElement.classList.toggle("complete", (completedSteps as any)[(stepElement as any).dataset.step]);
    stepElement.classList.toggle("active", (stepElement as any).dataset.step === currentStepName);
  }
}
