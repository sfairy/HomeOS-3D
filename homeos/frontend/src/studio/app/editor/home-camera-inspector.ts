/** Camera inspector sync */
import { clampNumber as clampNumber2, roundField as roundField2 } from "./editor-utils";
import { setInspectorToggle as setInspectorToggle2 } from "./editor-basic-inspectors";
import { normalizeGo2rtcTarget as normalizeGo2rtcTarget2 } from "../renderer/registry";

export interface CameraInspectorContext { [key: string]: any }

/**
 * go2rtc 地址的默认提示文案：校验失败时会被换成具体错误，切换摄像头或改回合法地址时复原。
 */
export const CAMERA_GO2RTC_NOTE_TEXT =
  "视频经 HA Bridge 转发，沿用现有外网入口。请填写局域网 IP 地址，保存仪表盘后播放。";

export function syncCameraInspector(ctx: CameraInspectorContext, cameraComponent: any) {
  // 每次同步都过一遍「改属性」控件的挂载（按元素自身标记幂等，见 `bindCameraInspectorControl`）。
  installCameraInspectorControls(ctx);
  const cameraProperties = cameraComponent.properties || {},
    cameraPosition = cameraComponent.position || {},
    cameraCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
    cameraCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
    cameraWidthPx = Number(cameraPosition.width || 100),
    cameraHeightPx = Number(cameraPosition.height || 100);
  ((ctx.cameraLabelElement.value = cameraProperties.label || ""),
    ctx.runExtraFallback(cameraComponent),
    setInspectorToggle2(ctx.cameraMediaVisibleElement, cameraProperties.mediaVisible !== false));
  // 视频来源：`entity` 走 HA 实体（HLS→MJPEG→快照），`go2rtc` 走局域网地址（同源 MSE 中继）。
  const cameraSource = cameraProperties.cameraSource === "go2rtc" ? "go2rtc" : "entity";
  for (const sourceButtonElement of ctx.cameraSourceOptionsElement.querySelectorAll(
    "[data-camera-source]",
  )) {
    const isSourceActive = sourceButtonElement.dataset.cameraSource === cameraSource;
    (sourceButtonElement.classList.toggle("active", isSourceActive),
      sourceButtonElement.setAttribute("aria-pressed", String(isSourceActive)));
  }
  ((ctx.cameraEntityPickerElement.hidden = cameraSource === "go2rtc"),
    (ctx.cameraGo2rtcUrlFieldElement.hidden = cameraSource !== "go2rtc"),
    (ctx.cameraGo2rtcNoteElement.hidden = cameraSource !== "go2rtc"),
    (ctx.cameraGo2rtcUrlElement.value = String(cameraProperties.go2rtcUrl || "")),
    // 每次同步都把提示文案与错误态复位，避免换一台摄像头还留着上一台的红字。
    (ctx.cameraGo2rtcNoteElement.textContent = CAMERA_GO2RTC_NOTE_TEXT),
    ctx.cameraGo2rtcUrlElement.classList.remove("is-invalid"),
    ctx.cameraGo2rtcNoteElement.classList.remove("is-invalid"));
  const displayMode = cameraProperties.displayMode === "snapshot" ? "snapshot" : "live";
  for (const displayModeButtonElement of ctx.cameraDisplayModeOptionsElement.querySelectorAll(
    "[data-camera-display-mode]",
  )) {
    const isDisplayModeActive = displayModeButtonElement.dataset.cameraDisplayMode === displayMode;
    (displayModeButtonElement.classList.toggle("active", isDisplayModeActive),
      displayModeButtonElement.setAttribute("aria-pressed", String(isDisplayModeActive)));
  }
  const refreshIntervalValue = Number(cameraProperties.refreshInterval),
    refreshIntervalSeconds = Number.isFinite(refreshIntervalValue)
      ? Math.max(6, Math.round(refreshIntervalValue))
      : 10;
  ((ctx.cameraRefreshIntervalElement.value = String(refreshIntervalSeconds)),
    (ctx.cameraRefreshIntervalFieldElement.hidden = displayMode !== "snapshot"),
    (ctx.cameraRefreshIntervalElement.disabled = displayMode !== "snapshot"));
  const fitMode = cameraProperties.fit === "contain" ? "contain" : "fill";
  for (const fitModeButtonElement of ctx.cameraFitOptionsElement.querySelectorAll(
    "[data-camera-fit]",
  )) {
    const isFitModeActive = fitModeButtonElement.dataset.cameraFit === fitMode;
    (fitModeButtonElement.classList.toggle("active", isFitModeActive),
      fitModeButtonElement.setAttribute("aria-pressed", String(isFitModeActive)));
  }
  (setInspectorToggle2(ctx.cameraFrameVisibleElement, cameraProperties.frameVisible !== false),
    (ctx.cameraFrameColorElement.value = cameraProperties.frameColor || "#d4d4d4"),
    (ctx.cameraFrameWidthElement.value = roundField2(Number(cameraProperties.frameWidth ?? 1))));
  const cornerRadiusValue = Number(cameraProperties.radius ?? 0.04);
  ((ctx.cameraRadiusElement.value = roundField2(
    clampNumber2(cornerRadiusValue > 0.5 ? cornerRadiusValue : cornerRadiusValue * 100, 0, 50),
  )),
    (ctx.cameraFrameAngleElement.value = roundField2(Number(cameraProperties.frameAngle ?? 45))),
    (ctx.cameraFrameOpacityElement.value = roundField2(
      Number(cameraProperties.frameOpacity ?? 0.9) * 100,
    )),
    (ctx.cameraLeftElement.value = roundField2(
      clampNumber2(
        ((Number(cameraPosition.x || 0) + cameraWidthPx / 2) / cameraCanvasWidthPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.cameraTopElement.value = roundField2(
      clampNumber2(
        ((Number(cameraPosition.y || 0) + cameraHeightPx / 2) / cameraCanvasHeightPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.cameraWidthElement.value = roundField2((cameraWidthPx / cameraCanvasWidthPx) * 100)),
    (ctx.cameraHeightElement.value = roundField2((cameraHeightPx / cameraCanvasHeightPx) * 100)),
    (ctx.cameraScaleElement.value = roundField2(Number(cameraComponent.style?.scale || 1) * 100)),
    (ctx.cameraRotationElement.value = roundField2(Number(cameraPosition.rotation || 0))));
  const isCameraMultiSelection = ctx.selectedComponentIdsSet.size > 1;
  ((ctx.cameraWidthElement.disabled = isCameraMultiSelection),
    (ctx.cameraHeightElement.disabled = isCameraMultiSelection),
    (ctx.cameraRotationElement.disabled = false),
    (ctx.cameraScaleElement.disabled = false));
  const cameraReplaceableCount = ctx.findReplaceableComponents(cameraComponent).length,
    cameraApplyTargetCount = ctx.runAuxLower(cameraComponent).length;
  ((ctx.cameraApplyStyleElement.disabled = !cameraReplaceableCount || !cameraApplyTargetCount),
    (ctx.cameraApplyCountElement.textContent = cameraApplyTargetCount + " 项修改"),
    (ctx.cameraApplyStyleElement.textContent = "一键应用到同类型控件"));
  const componentWithTapAction = Object.prototype.hasOwnProperty.call(
    cameraComponent.actions || {},
    "tap",
  )
    ? cameraComponent
    : {
        ...cameraComponent,
        actions: {
          tap: {
            type: "more-info",
            data: {
              popupSource: "current",
            },
          },
          ...(cameraComponent.actions || {}),
        },
      };
  ctx.syncComponentActionControls(componentWithTapAction, ctx.cameraActionControlsElement);
}

/**
 * 挂一个「改属性」控件的交互（同元素只挂一次）。
 *
 * ⚠ 去重标记必须存在**元素自己**身上，不能用模块级 `let installed = false`：`bootEditor()`
 * 每次挂载都会重跑整个引导体（见 `home.ts` 顶部说明：卸载后回到同一文档，要「每次挂载重新
 * 采集 DOM 契约」），模块级闩在第二次进编辑器时依然为 `true` → 静默跳过注册 → 所有摄像头
 * 控件失灵（仓库里 `_request_json_smoke.ts` 守的就是这类「每实例状态被提到模块作用域」）。
 * 挂在元素上则随节点重建一起消失，语义正好等价于「每次挂载重挂一遍」，且同一次挂载里
 * 反复同步也不会重复注册（重复注册会让显隐开关一次点击连翻两次，等于失效）。
 */
function bindCameraInspectorControl(
  controlElement: any,
  eventName: string,
  handler: (event: any) => void,
) {
  if (!controlElement?.dataset || controlElement.dataset.cameraInspectorBound === "1") return;
  controlElement.dataset.cameraInspectorBound = "1";
  controlElement.addEventListener(eventName, handler);
}

/**
 * 挂摄像头检查器里所有「改属性」控件的交互：来源 / go2rtc 地址 / 填充方式 / 显示方式 /
 * 刷新间隔 / 画面显隐 / 边框显隐。
 *
 * 为什么在这里挂、且由 `syncCameraInspector` 每次同步时挂：`app/editor/home.ts` 是 KPI 门禁
 * 盯着的 panel 宿主（只减不增），而这些控件与 `syncCameraInspector` 同属摄像头检查器。
 * 元素句柄仍由宿主用**页面根内查询**（`findElement`）解析后经 ctx 传进来 —— 这里不能改用全局
 * `document.getElementById`：路由 fade 期间户型页与编辑器会短暂共存，撞 id 会取到另一页的节点。
 *
 * 时序安全：这些控件只在选中摄像头、检查器显示后才点得到，而显示检查器的那条路径
 * （`home-cover-motor-inspector.ts` 里 `cameraInspectorElement.hidden = !isCamera`）紧跟着
 * 就调用同步，所以挂载一定发生在第一次点击之前。
 */
export function installCameraInspectorControls(ctx: CameraInspectorContext) {
  bindCameraInspectorControl(
    ctx.cameraSourceOptionsElement,
    "click",
    (cameraSourceClickEvent: any) => {
      const cameraSourceOptionElement =
          cameraSourceClickEvent.target.closest("[data-camera-source]"),
        cameraSourceComponentId = ctx.getSelectedComponentId();
      if (!cameraSourceOptionElement || !cameraSourceComponentId) return;
      const requestedCameraSource =
        cameraSourceOptionElement.dataset.cameraSource === "go2rtc" ? "go2rtc" : "entity";
      ctx.mutateDocument((cameraSourceDraftDocument: any) => {
        const cameraSourceComponent = ctx.findComponent(
          cameraSourceDraftDocument,
          cameraSourceComponentId,
        )?.component;
        !cameraSourceComponent ||
          cameraSourceComponent.type !== "camera" ||
          (cameraSourceComponent.properties = {
            ...(cameraSourceComponent.properties || {}),
            cameraSource: requestedCameraSource,
          });
      });
    },
  );
  bindCameraInspectorControl(ctx.cameraGo2rtcUrlElement, "change", () => {
    const go2rtcUrlComponentId = ctx.getSelectedComponentId();
    if (!go2rtcUrlComponentId) return;
    const requestedGo2rtcUrl = String(ctx.cameraGo2rtcUrlElement.value || "").trim();
    let go2rtcUrlError = "";
    try {
      // 前端只做即时反馈：地址非法就不写进文档；权威校验在后端 `normalize_go2rtc_target`。
      normalizeGo2rtcTarget2(requestedGo2rtcUrl);
    } catch (go2rtcUrlValidationError: any) {
      go2rtcUrlError = go2rtcUrlValidationError?.message || "go2rtc 地址无效";
    }
    (ctx.cameraGo2rtcUrlElement.classList.toggle("is-invalid", !!go2rtcUrlError),
      ctx.cameraGo2rtcNoteElement.classList.toggle("is-invalid", !!go2rtcUrlError),
      (ctx.cameraGo2rtcNoteElement.textContent = go2rtcUrlError || CAMERA_GO2RTC_NOTE_TEXT));
    if (go2rtcUrlError) return;
    ctx.mutateDocument((go2rtcUrlDraftDocument: any) => {
      const go2rtcUrlComponent = ctx.findComponent(
        go2rtcUrlDraftDocument,
        go2rtcUrlComponentId,
      )?.component;
      !go2rtcUrlComponent ||
        go2rtcUrlComponent.type !== "camera" ||
        (go2rtcUrlComponent.properties = {
          ...(go2rtcUrlComponent.properties || {}),
          go2rtcUrl: requestedGo2rtcUrl,
        });
    });
  });
  bindCameraInspectorControl(ctx.cameraFitOptionsElement, "click", (cameraFitClickEvent: any) => {
    const cameraFitOptionElement = cameraFitClickEvent.target.closest("[data-camera-fit]"),
      cameraFitComponentId = ctx.getSelectedComponentId();
    if (!cameraFitOptionElement || !cameraFitComponentId) return;
    const requestedCameraFit =
      cameraFitOptionElement.dataset.cameraFit === "contain" ? "contain" : "fill";
    ctx.mutateDocument((cameraFitDraftDocument: any) => {
      const cameraFitComponent = ctx.findComponent(
        cameraFitDraftDocument,
        cameraFitComponentId,
      )?.component;
      !cameraFitComponent ||
        cameraFitComponent.type !== "camera" ||
        (cameraFitComponent.properties = {
          ...(cameraFitComponent.properties || {}),
          fit: requestedCameraFit,
        });
    });
  });
  bindCameraInspectorControl(
    ctx.cameraDisplayModeOptionsElement,
    "click",
    (displayModeClickEvent: any) => {
      const displayModeOptionElement = displayModeClickEvent.target.closest(
          "[data-camera-display-mode]",
        ),
        displayModeComponentId = ctx.getSelectedComponentId();
      if (!displayModeOptionElement || !displayModeComponentId) return;
      const requestedDisplayMode =
        displayModeOptionElement.dataset.cameraDisplayMode === "snapshot" ? "snapshot" : "live";
      ctx.mutateDocument((displayModeDraftDocument: any) => {
        const displayModeComponent = ctx.findComponent(
          displayModeDraftDocument,
          displayModeComponentId,
        )?.component;
        !displayModeComponent ||
          displayModeComponent.type !== "camera" ||
          (displayModeComponent.properties = {
            ...(displayModeComponent.properties || {}),
            displayMode: requestedDisplayMode,
          });
      });
    },
  );
  bindCameraInspectorControl(ctx.cameraRefreshIntervalElement, "change", () => {
    const refreshIntervalComponentId = ctx.getSelectedComponentId();
    if (!refreshIntervalComponentId) return;
    const refreshIntervalInput = Number(ctx.cameraRefreshIntervalElement.value),
      normalizedRefreshInterval = Number.isFinite(refreshIntervalInput)
        ? Math.max(6, Math.round(refreshIntervalInput))
        : 10;
    ((ctx.cameraRefreshIntervalElement.value = String(normalizedRefreshInterval)),
      ctx.mutateDocument((refreshIntervalDraftDocument: any) => {
        const refreshIntervalComponent = ctx.findComponent(
          refreshIntervalDraftDocument,
          refreshIntervalComponentId,
        )?.component;
        !refreshIntervalComponent ||
          refreshIntervalComponent.type !== "camera" ||
          (refreshIntervalComponent.properties = {
            ...(refreshIntervalComponent.properties || {}),
            refreshInterval: normalizedRefreshInterval,
          });
      }));
  });
  bindCameraInspectorControl(ctx.cameraMediaVisibleElement, "click", () => {
    const mediaVisibleComponentId = ctx.getSelectedComponentId();
    mediaVisibleComponentId &&
      ctx.mutateDocument((mediaVisibleDraftDocument: any) => {
        const mediaVisibleComponent = ctx.findComponent(
          mediaVisibleDraftDocument,
          mediaVisibleComponentId,
        )?.component;
        !mediaVisibleComponent ||
          mediaVisibleComponent.type !== "camera" ||
          (mediaVisibleComponent.properties = {
            ...(mediaVisibleComponent.properties || {}),
            mediaVisible: mediaVisibleComponent.properties?.mediaVisible === false,
          });
      });
  });
  bindCameraInspectorControl(ctx.cameraFrameVisibleElement, "click", () => {
    const frameVisibleComponentId = ctx.getSelectedComponentId();
    frameVisibleComponentId &&
      ctx.mutateDocument((frameVisibleDraftDocument: any) => {
        const frameVisibleComponent = ctx.findComponent(
          frameVisibleDraftDocument,
          frameVisibleComponentId,
        )?.component;
        !frameVisibleComponent ||
          frameVisibleComponent.type !== "camera" ||
          (frameVisibleComponent.properties = {
            ...(frameVisibleComponent.properties || {}),
            frameVisible: frameVisibleComponent.properties?.frameVisible === false,
          });
      });
  });
}
