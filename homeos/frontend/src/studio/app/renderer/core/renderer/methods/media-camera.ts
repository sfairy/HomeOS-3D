import type { ComponentDialogElement } from "../../renderer-types";
import { cameraPopupLayout as cameraPopupLayout2, cameraPreviewRatio as cameraPreviewRatio2 } from "../../../../bridge/camera-popup-layout";
import { componentDialogTitle } from "../../renderer-helpers";
import { mountCameraMedia as mountCameraMedia2 } from "../../registry";
import { popupPlacement as popupPlacement2 } from "../../../../bridge/popup-placement";
import type { PanelRenderer } from "../../panel-renderer";

export async function browseMedia(self: PanelRenderer, mediaEntityId: any, mediaContentId = "media-source://", mediaContentType = "") {
    const mediaResponse = await fetch("/api/v1/ha/media/browse", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          entityId: mediaEntityId,
          mediaContentId: mediaContentId,
          mediaContentType: mediaContentType,
        }),
      }),
      mediaResponseBody = await mediaResponse.json().catch(() => ({}));
    if (!mediaResponse.ok) throw new Error(mediaResponseBody.detail || "媒体目录读取失败。");
    return mediaResponseBody.result || {};
  }
export function createMediaBrowserControl(self: PanelRenderer, mediaBrowserEntityId: any, { preview: isMediaPreview = false } = {}) {
    const mediaBrowserRootElement = document.createElement("section");
    mediaBrowserRootElement.className = "hb-media-browser";
    const mediaBrowserTriggerElement = document.createElement("button");
    ((mediaBrowserTriggerElement.type = "button"),
      (mediaBrowserTriggerElement.className = "hb-media-browser-trigger"),
      (mediaBrowserTriggerElement.innerHTML = '<span aria-hidden="true"></span>'),
      mediaBrowserTriggerElement.setAttribute("aria-label", "选择本地媒体"),
      mediaBrowserTriggerElement.setAttribute("title", "选择本地媒体"),
      mediaBrowserTriggerElement.setAttribute("aria-expanded", "false"),
      (mediaBrowserTriggerElement.disabled = isMediaPreview));
    const mediaBrowserPanelElement = document.createElement("div");
    ((mediaBrowserPanelElement.className = "hb-media-browser-panel"),
      (mediaBrowserPanelElement.hidden = true));
    const mediaBrowserToolbarElement = document.createElement("div");
    mediaBrowserToolbarElement.className = "hb-media-browser-toolbar";
    const mediaBrowserBackElement = document.createElement("button");
    ((mediaBrowserBackElement.type = "button"),
      (mediaBrowserBackElement.className = "hb-media-browser-back"),
      (mediaBrowserBackElement.textContent = "返回"),
      (mediaBrowserBackElement.hidden = true));
    const mediaBrowserLocationElement = document.createElement("strong");
    ((mediaBrowserLocationElement.className = "hb-media-browser-location"),
      (mediaBrowserLocationElement.textContent = "媒体库"));
    const mediaBrowserStatusElement = document.createElement("span");
    mediaBrowserStatusElement.className = "hb-media-browser-status";
    const mediaBrowserCloseElement = document.createElement("button");
    ((mediaBrowserCloseElement.type = "button"),
      (mediaBrowserCloseElement.className = "hb-media-browser-close"),
      (mediaBrowserCloseElement.textContent = "×"),
      mediaBrowserCloseElement.setAttribute("aria-label", "关闭媒体选择"),
      mediaBrowserToolbarElement.append(
        mediaBrowserBackElement,
        mediaBrowserLocationElement,
        mediaBrowserStatusElement,
        mediaBrowserCloseElement,
      ));
    const mediaBrowserListElement = document.createElement("div");
    ((mediaBrowserListElement.className = "hb-media-browser-list"),
      mediaBrowserPanelElement.append(mediaBrowserToolbarElement, mediaBrowserListElement),
      mediaBrowserRootElement.append(mediaBrowserTriggerElement));
    let currentContentId = "media-source://",
      currentContentType = "",
      mediaHistoryEntries: any = [],
      isMediaBusy = false,
      isMediaAvailable = false;
    const setMediaStatus = (mediaStatusText = "") => {
        mediaBrowserStatusElement.textContent = mediaStatusText;
      },
      closeMediaBrowser = () => {
        ((mediaBrowserPanelElement.hidden = true),
          mediaBrowserTriggerElement.setAttribute("aria-expanded", "false"));
      },
      setMediaBusy = (busyFlag: any) => {
        ((isMediaBusy = !!busyFlag),
          (mediaBrowserTriggerElement.disabled =
            isMediaPreview || isMediaBusy || !isMediaAvailable),
          (mediaBrowserBackElement.disabled = isMediaBusy),
          mediaBrowserListElement.querySelectorAll("button").forEach((mediaButtonElement) => {
            mediaButtonElement.disabled = isMediaBusy;
          }));
      },
      mediaItemTitle = (mediaEntry: any) =>
        String(
          mediaEntry?.title || mediaEntry?.name || mediaEntry?.media_content_id || "未命名媒体",
        ),
      loadMediaDirectory = async (
        targetContentId: any,
        targetContentType = "",
        { pushHistory: shouldPushHistory = true } = {},
      ) => {
        if (!(isMediaBusy || isMediaPreview || !isMediaAvailable)) {
          (setMediaBusy(true), setMediaStatus("读取中…"));
          try {
            const browseMedia = await self.browseMedia(
              mediaBrowserEntityId,
              targetContentId,
              targetContentType,
            );
            (shouldPushHistory &&
              currentContentId !== targetContentId &&
              mediaHistoryEntries.push({
                id: currentContentId,
                type: currentContentType,
                title: mediaBrowserLocationElement.textContent,
              }),
              (currentContentId = targetContentId),
              (currentContentType = targetContentType || ""),
              (mediaBrowserLocationElement.textContent = mediaItemTitle(browseMedia) || "媒体库"),
              (mediaBrowserBackElement.hidden = mediaHistoryEntries.length === 0),
              mediaBrowserListElement.replaceChildren());
            const children2 = Array.isArray(browseMedia?.children) ? browseMedia.children : [];
            if (!children2.length) {
              const mediaEmptyElement = document.createElement("p");
              ((mediaEmptyElement.className = "hb-media-browser-empty"),
                (mediaEmptyElement.textContent = "此处没有可播放的媒体。"),
                mediaBrowserListElement.append(mediaEmptyElement));
            }
            (children2.forEach((mediaChildEntry: any) => {
              const mediaItemElement = document.createElement("div");
              mediaItemElement.className = "hb-media-browser-item";
              const mediaItemTitleElement = document.createElement("span");
              ((mediaItemTitleElement.className = "hb-media-browser-item-title"),
                (mediaItemTitleElement.textContent = mediaItemTitle(mediaChildEntry)));
              const mediaItemActionElement = document.createElement("button");
              mediaItemActionElement.type = "button";
              const isMediaExpandable = !!(
                  mediaChildEntry?.can_expand || mediaChildEntry?.children
                ),
                isMediaPlayable = !!mediaChildEntry?.can_play;
              ((mediaItemActionElement.textContent = isMediaExpandable ? "打开" : "播放"),
                (mediaItemActionElement.disabled = !isMediaExpandable && !isMediaPlayable),
                mediaItemActionElement.addEventListener("click", async () => {
                  if (isMediaExpandable) {
                    await loadMediaDirectory(
                      mediaChildEntry.media_content_id,
                      mediaChildEntry.media_content_type || "",
                      {
                        pushHistory: true,
                      },
                    );
                    return;
                  }
                  if (!(!isMediaPlayable || isMediaBusy)) {
                    (setMediaBusy(true), setMediaStatus("发送播放…"));
                    try {
                      (await self.callEntityService(
                        "media_player",
                        "play_media",
                        mediaBrowserEntityId,
                        {
                          media_content_id: mediaChildEntry.media_content_id,
                          media_content_type: mediaChildEntry.media_content_type || "music",
                        },
                      ),
                        setMediaStatus(""));
                    } catch (mediaPlayError: any) {
                      (setMediaStatus(mediaPlayError.message || "播放失败"),
                        self.options.onError?.(mediaPlayError));
                    } finally {
                      setMediaBusy(false);
                    }
                  }
                }),
                mediaItemElement.append(mediaItemTitleElement, mediaItemActionElement),
                mediaBrowserListElement.append(mediaItemElement));
            }),
              (mediaBrowserPanelElement.hidden = false),
              mediaBrowserTriggerElement.setAttribute("aria-expanded", "true"),
              setMediaStatus(children2.length ? children2.length + " 项" : ""));
          } catch (mediaLoadError: any) {
            const mediaErrorMessage = String(mediaLoadError?.message || "媒体目录读取失败");
            (setMediaStatus(
              mediaErrorMessage.includes("Media directory does not exist")
                ? "此目录暂无媒体"
                : mediaErrorMessage,
            ),
              mediaBrowserListElement.replaceChildren());
            const mediaErrorElement = document.createElement("p");
            ((mediaErrorElement.className = "hb-media-browser-empty"),
              (mediaErrorElement.textContent = mediaErrorMessage.includes(
                "Media directory does not exist",
              )
                ? "此目录暂无可用媒体。"
                : mediaErrorMessage),
              mediaBrowserListElement.append(mediaErrorElement),
              (mediaBrowserPanelElement.hidden = false),
              mediaBrowserTriggerElement.setAttribute("aria-expanded", "true"));
          } finally {
            setMediaBusy(false);
          }
        }
      };
    return (
      mediaBrowserTriggerElement.addEventListener("click", () => {
        if (!mediaBrowserPanelElement.hidden) {
          closeMediaBrowser();
          return;
        }
        loadMediaDirectory(currentContentId, currentContentType, {
          pushHistory: false,
        });
      }),
      mediaBrowserCloseElement.addEventListener("click", closeMediaBrowser),
      mediaBrowserBackElement.addEventListener("click", async () => {
        const pop = mediaHistoryEntries.pop();
        pop &&
          (await loadMediaDirectory(pop.id, pop.type, {
            pushHistory: false,
          }),
          (mediaBrowserLocationElement.textContent = pop.title || "媒体库"),
          (mediaBrowserBackElement.hidden = mediaHistoryEntries.length === 0));
      }),
      {
        root: mediaBrowserRootElement,
        panel: mediaBrowserPanelElement,
        sync: (mediaSyncState: any) => {
          ((isMediaAvailable = !!(
            Number(mediaSyncState?.attributes?.supported_features || 0) & 512
          )),
            (mediaBrowserRootElement.hidden = !isMediaAvailable),
            isMediaAvailable || closeMediaBrowser(),
            (mediaBrowserTriggerElement.disabled =
              isMediaPreview || isMediaBusy || !isMediaAvailable));
        },
        cleanup: () => {
          (mediaBrowserRootElement.remove(), mediaBrowserPanelElement.remove());
        },
      }
    );
  }
export function openInteraction3dCameraPreview(self: PanelRenderer, cameraControlComponent: any,
    cameraPreviewCloseHandler: any,
    cameraPreviewOptions: Record<string, any> = {},) {
    self.showCameraPreview(
      {
        id: "camera:" + cameraControlComponent.id,
        type: "camera",
        properties: {
          label: cameraControlComponent.label,
        },
        bindings: {
          entity: {
            entityId: cameraControlComponent.entityId,
          },
        },
      },
      {
        interaction3d: cameraPreviewOptions,
      },
    );
    const detailsDialog = self.detailsDialog;
    return (
      detailsDialog?.addEventListener("close", cameraPreviewCloseHandler, {
        once: true,
      }),
      {
        updateLayout: () => detailsDialog?.resizeInteraction3d?.(),
        close: () => {
          (detailsDialog?.removeEventListener("close", cameraPreviewCloseHandler),
            detailsDialog?.close());
        },
        contains: (domTargetNode: any) => detailsDialog?.contains(domTargetNode),
      }
    );
  }
export function showCameraPreview(self: PanelRenderer, cameraComponent: any,
    { preview: isCameraPreview = false, interaction3d: cameraInteractionConfig = null }: any = {},) {
    const cameraEntityId = cameraComponent.bindings?.entity?.entityId;
    if (!cameraEntityId) throw new Error("该摄像头控件没有关联实体。");
    self.closeRuntimeDialog();
    const cameraPreviewDialog: ComponentDialogElement = document.createElement("dialog");
    ((cameraPreviewDialog.className = "hb-camera-preview-dialog fit-media-ratio"),
      (cameraPreviewDialog.dataset.componentId = cameraComponent.id || ""));
    const cameraPreviewCard = document.createElement("div");
    cameraPreviewCard.className = "hb-camera-preview-card";
    const cameraPreviewHeading = document.createElement("div");
    cameraPreviewHeading.className = "hb-camera-preview-heading";
    const cameraPreviewTitleBox = document.createElement("div"),
      cameraPreviewTitle = document.createElement("strong");
    cameraPreviewTitle.textContent = componentDialogTitle(cameraComponent, "摄像头实时预览");
    const cameraPreviewStatus = document.createElement("span");
    ((cameraPreviewStatus.className = "hb-camera-preview-status"),
      (cameraPreviewStatus.textContent = cameraInteractionConfig ? "正在加载画面" : "正在连接"),
      cameraPreviewStatus.classList.add("is-connecting"),
      cameraPreviewTitleBox.append(cameraPreviewTitle, cameraPreviewStatus));
    const cameraPreviewCloseButton = document.createElement("button");
    ((cameraPreviewCloseButton.type = "button"),
      cameraPreviewCloseButton.setAttribute("aria-label", "关闭摄像头预览"),
      (cameraPreviewCloseButton.textContent = "×"),
      cameraPreviewHeading.append(cameraPreviewTitleBox, cameraPreviewCloseButton));
    const cameraDeviceVisualSection = document.createElement("section");
    ((cameraDeviceVisualSection.className = "hb-camera-device-visual"),
      cameraDeviceVisualSection.setAttribute("aria-hidden", "true"));
    const cameraDeviceMountIcon = document.createElement("i");
    cameraDeviceMountIcon.className = "hb-camera-device-mount";
    const cameraDeviceArmIcon = document.createElement("i");
    cameraDeviceArmIcon.className = "hb-camera-device-arm";
    const cameraDeviceBody = document.createElement("div");
    cameraDeviceBody.className = "hb-camera-device-body";
    const cameraDeviceLensIcon = document.createElement("i");
    cameraDeviceLensIcon.className = "hb-camera-device-lens";
    const cameraDeviceLedIcon = document.createElement("i");
    ((cameraDeviceLedIcon.className = "hb-camera-device-led"),
      cameraDeviceBody.append(cameraDeviceLensIcon, cameraDeviceLedIcon),
      cameraDeviceVisualSection.append(
        cameraDeviceMountIcon,
        cameraDeviceArmIcon,
        cameraDeviceBody,
      ));
    let cameraMotionTimeoutId = 0,
      cameraMotionAnimation: any = null,
      cameraPreviousAngle = 0;
    const formatCameraTiltTransform = (tiltAngleDeg: any, tiltScaleFactor = 0) =>
        "translateX(-50%) perspective(260px) rotateY(" +
        tiltAngleDeg +
        "deg) rotateZ(" +
        tiltAngleDeg * 0.035 +
        "deg) translateY(" +
        tiltScaleFactor +
        "px)",
      cameraTiltTick = () => {
        if (!cameraDeviceBody.isConnected) return;
        const cameraTiltAngles = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
            (filteredAngle) => Math.abs(filteredAngle - cameraPreviousAngle) >= 7,
          ),
          cameraTargetAngle =
            cameraTiltAngles[Math.floor(Math.random() * cameraTiltAngles.length)] ?? 0,
          cameraTiltDirection = Math.sign(cameraTargetAngle - cameraPreviousAngle) || 1,
          abs = Math.abs(cameraTargetAngle - cameraPreviousAngle),
          round = Math.round(430 + abs * 18 + Math.random() * 320),
          cameraOvershootAngle =
            cameraTargetAngle + cameraTiltDirection * (1.4 + Math.random() * 2.2),
          cameraJitterAmount = Math.random() * 1.4 - 0.7;
        (cameraDeviceLensIcon.style.setProperty(
          "--hb-camera-lens-shift",
          (cameraTargetAngle / 23) * 2.5 + "px",
        ),
          cameraMotionAnimation?.cancel(),
          (cameraMotionAnimation = cameraDeviceBody.animate(
            [
              {
                transform: formatCameraTiltTransform(cameraPreviousAngle, 0),
                offset: 0,
              },
              {
                transform: formatCameraTiltTransform(cameraOvershootAngle, cameraJitterAmount),
                offset: 0.78,
              },
              {
                transform: formatCameraTiltTransform(cameraTargetAngle, cameraJitterAmount * 0.35),
                offset: 1,
              },
            ],
            {
              duration: round,
              easing: "cubic-bezier(.2,.72,.22,1)",
              fill: "forwards",
            },
          )),
          cameraMotionAnimation.addEventListener(
            "finish",
            () => {
              ((cameraPreviousAngle = cameraTargetAngle),
                (cameraDeviceBody.style.transform = formatCameraTiltTransform(
                  cameraPreviousAngle,
                  cameraJitterAmount * 0.35,
                )),
                cameraMotionAnimation?.cancel(),
                (cameraMotionAnimation = null));
              const cameraReturnDelayMs =
                Math.random() < 0.22 ? 180 + Math.random() * 260 : 680 + Math.random() * 1500;
              cameraMotionTimeoutId = window.setTimeout(cameraTiltTick, cameraReturnDelayMs);
            },
            {
              once: true,
            },
          ));
      };
    !cameraInteractionConfig &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
      (cameraMotionTimeoutId = window.setTimeout(cameraTiltTick, 620));
    const cameraPreviewStage = document.createElement("div");
    ((cameraPreviewStage.className = "hb-camera-preview-stage"),
      cameraPreviewStage.classList.add("is-connecting"));
    const cameraRevealVeilIcon = document.createElement("i");
    ((cameraRevealVeilIcon.className = "hb-camera-preview-reveal-veil"),
      cameraRevealVeilIcon.setAttribute("aria-hidden", "true"));
    const cameraScanLineIcon = document.createElement("i");
    ((cameraScanLineIcon.className = "hb-camera-preview-scan-line"),
      cameraScanLineIcon.setAttribute("aria-hidden", "true"),
      cameraPreviewStage.append(cameraRevealVeilIcon, cameraScanLineIcon));
    const hasLiveVideo = !!cameraInteractionConfig,
      isMediaVisible = cameraComponent.properties?.mediaVisible !== false;
    (cameraPreviewStage.classList.toggle("is-16-9", !hasLiveVideo),
      cameraPreviewStage.classList.toggle("media-hidden", !isMediaVisible));
    const cameraCleanupCallbacks: any = [];
    let isCameraReady = false;
    const handleCameraReady = () => {
        isCameraReady ||
          ((isCameraReady = true),
          (cameraPreviewStatus.textContent = "实时画面"),
          cameraPreviewStatus.classList.remove("is-connecting", "is-unavailable"),
          cameraPreviewStatus.classList.add("is-live"),
          cameraDeviceVisualSection.classList.remove("is-unavailable"),
          cameraDeviceVisualSection.classList.add("is-live"),
          cameraPreviewStage.classList.remove("is-connecting", "is-unavailable", "is-revealing"),
          cameraPreviewStage.classList.add("is-ready"));
      },
      handleCameraUnavailable = () => {
        ((cameraPreviewStatus.textContent = "画面不可用"),
          cameraPreviewStatus.classList.remove("is-connecting", "is-live"),
          cameraPreviewStatus.classList.add("is-unavailable"),
          cameraDeviceVisualSection.classList.remove("is-live"),
          cameraDeviceVisualSection.classList.add("is-unavailable"),
          cameraPreviewStage.classList.remove("is-connecting", "is-revealing"),
          cameraPreviewStage.classList.add("is-unavailable"));
      };
    let cameraMediaRatio = cameraInteractionConfig ? cameraPreviewRatio2(cameraEntityId) : 16 / 9;
    const layoutCameraPreview = () => {
      if (cameraInteractionConfig) {
        ((cameraPreviewStage.style.aspectRatio = String(cameraMediaRatio)),
          cameraPreviewDialog.resizeInteraction3d?.());
        return;
      }
      const cameraPreviewMaxWidth = Math.max(280, self.container.clientWidth - 32),
        cameraPreviewMaxHeight = Math.max(180, Math.min(625, self.container.clientHeight - 88)),
        cameraPanelWidth = Math.min(
          760,
          cameraPreviewMaxWidth,
          cameraPreviewMaxHeight * cameraMediaRatio,
        );
      ((cameraPreviewDialog.style.width = Math.max(280, cameraPanelWidth) + "px"),
        (cameraPreviewStage.style.aspectRatio = String(cameraMediaRatio)),
        (cameraPreviewStage.style.borderRadius = "16px"));
    };
    if (isMediaVisible && !isCameraPreview) {
      const cameraLoadingHint = document.createElement("span");
      ((cameraLoadingHint.textContent = "正在载入摄像头实时预览"),
        cameraPreviewStage.append(cameraLoadingHint));
      const cameraMediaMount = mountCameraMedia2({
          container: cameraPreviewStage,
          entityId: cameraEntityId,
          label: cameraPreviewTitle.textContent,
          objectFit: cameraInteractionConfig ? "contain" : "fill",
          placeholder: cameraLoadingHint,
          onReady: handleCameraReady,
          onUnavailable: handleCameraUnavailable,
          cleanup: (cleanupRegistration: any) => {
            cameraCleanupCallbacks.push(cleanupRegistration);
          },
        }),
        syncCameraMediaSize = (mediaWidth: any, mediaHeight: any) => {
          !hasLiveVideo ||
            !Number.isFinite(mediaWidth) ||
            !Number.isFinite(mediaHeight) ||
            mediaWidth <= 0 ||
            mediaHeight <= 0 ||
            ((cameraMediaRatio = mediaWidth / mediaHeight),
            cameraPreviewRatio2(cameraEntityId, cameraMediaRatio),
            layoutCameraPreview());
        },
        handleVideoMetadata = () =>
          syncCameraMediaSize(
            cameraMediaMount.video.videoWidth,
            cameraMediaMount.video.videoHeight,
          ),
        handleImageLoad = () =>
          syncCameraMediaSize(
            cameraMediaMount.image.naturalWidth,
            cameraMediaMount.image.naturalHeight,
          );
      (cameraMediaMount.video.addEventListener("loadedmetadata", handleVideoMetadata),
        cameraMediaMount.video.addEventListener("resize", handleVideoMetadata),
        cameraMediaMount.image.addEventListener("load", handleImageLoad),
        cameraCleanupCallbacks.push(() =>
          cameraMediaMount.video.removeEventListener("loadedmetadata", handleVideoMetadata),
        ),
        cameraCleanupCallbacks.push(() =>
          cameraMediaMount.video.removeEventListener("resize", handleVideoMetadata),
        ),
        cameraCleanupCallbacks.push(() =>
          cameraMediaMount.image.removeEventListener("load", handleImageLoad),
        ));
    } else {
      if (isCameraPreview) {
        ((cameraPreviewStatus.textContent = "预览模式"),
          cameraPreviewStatus.classList.remove("is-connecting"),
          cameraPreviewStage.classList.remove("is-connecting"),
          cameraPreviewStage.classList.add("is-ready"));
        const cameraPreviewModeHint = document.createElement("span");
        ((cameraPreviewModeHint.textContent = "预览模式不获取摄像头实时画面"),
          cameraPreviewStage.append(cameraPreviewModeHint));
      } else {
        ((cameraPreviewStatus.textContent = "画面已隐藏"),
          cameraPreviewStatus.classList.remove("is-connecting"),
          cameraPreviewStage.classList.remove("is-connecting"),
          cameraPreviewStage.classList.add("is-ready"));
        const cameraHiddenHint = document.createElement("span");
        ((cameraHiddenHint.textContent = "摄像头画面已隐藏"),
          cameraPreviewStage.append(cameraHiddenHint));
      }
    }
    (window.addEventListener("resize", layoutCameraPreview),
      cameraCleanupCallbacks.push(() => window.removeEventListener("resize", layoutCameraPreview)),
      layoutCameraPreview(),
      cameraPreviewCard.append(
        cameraPreviewHeading,
        ...(cameraInteractionConfig ? [] : [cameraDeviceVisualSection]),
        cameraPreviewStage,
      ),
      cameraPreviewDialog.append(cameraPreviewCard));
    const cameraPreviewOverlay = document.createElement("div");
    if (
      ((cameraPreviewOverlay.className =
        "hb-renderer-runtime-dialog-layer" +
        (self.options.editable ? "" : " hb-runtime-no-select")),
      (cameraPreviewOverlay.tabIndex = -1),
      cameraPreviewOverlay.append(cameraPreviewDialog),
      self.container.append(cameraPreviewOverlay),
      (self.detailsDialog = cameraPreviewDialog),
      cameraInteractionConfig)
    ) {
      (cameraPreviewOverlay.classList.add("i3d-vacuum-dialog-layer"),
        cameraPreviewDialog.classList.add("i3d-vacuum-details", "i3d-camera-details"));
      const container = cameraInteractionConfig.root || self.container;
      (container.append(cameraPreviewOverlay),
        cameraPreviewDialog.style.setProperty(
          "--i3d-panel-opacity",
          String(
            Math.max(
              0,
              Math.min(
                100,
                Number.isFinite(cameraInteractionConfig.popupOpacity)
                  ? cameraInteractionConfig.popupOpacity
                  : 74,
              ),
            ) / 100,
          ),
        ));
      const resizeCameraPreview = () => {
        const cameraPresentationLayout = cameraInteractionConfig.getPresentationLayout?.(),
          hasFixedUiLayout =
            cameraPresentationLayout?.fixedUi === true &&
            cameraPresentationLayout?.sourceWidth > 0 &&
            cameraPresentationLayout?.sourceHeight > 0,
          sourceWidth = hasFixedUiLayout
            ? cameraPresentationLayout.sourceWidth
            : cameraPresentationLayout?.width > 0
              ? cameraPresentationLayout.width
              : container.clientWidth,
          sourceHeight = hasFixedUiLayout
            ? cameraPresentationLayout.sourceHeight
            : cameraPresentationLayout?.height > 0
              ? cameraPresentationLayout.height
              : container.clientHeight,
          layoutScaleX = container.clientWidth / Math.max(1, sourceWidth),
          layoutScaleY = container.clientHeight / Math.max(1, sourceHeight),
          measureCameraPopup = () =>
            Math.ceil(
              parseFloat(window.getComputedStyle?.(cameraPreviewHeading)?.height) ||
                cameraPreviewHeading.offsetHeight ||
                58,
            );
        let cameraPopupLayout = cameraPopupLayout2(
          sourceWidth,
          sourceHeight,
          cameraMediaRatio,
          measureCameraPopup(),
        );
        ((cameraPreviewDialog.style.width = cameraPopupLayout.panelWidth + "px"),
          (cameraPopupLayout = cameraPopupLayout2(
            sourceWidth,
            sourceHeight,
            cameraMediaRatio,
            measureCameraPopup(),
          )));
        const {
            panelWidth: popupPanelWidth,
            mediaHeight: popupMediaHeight,
            top: popupTopOffset,
          } = cameraPopupLayout,
          cameraPopupPlacement = popupPlacement2({
            width: sourceWidth,
            height: sourceHeight,
            panelWidth: popupPanelWidth,
            panelHeight: popupMediaHeight + measureCameraPopup() + 26,
            defaultScale: 2,
            defaultTop: hasFixedUiLayout ? cameraPopupLayout.top : popupTopOffset,
            settings: cameraInteractionConfig.getPopupLayout?.(),
          }),
          popupTopPx = cameraPopupPlacement.top * layoutScaleY;
        ((cameraPreviewDialog.style.width = popupPanelWidth + "px"),
          (cameraPreviewStage.style.height = popupMediaHeight + "px"),
          (cameraPreviewDialog.style.top = popupTopPx + "px"),
          (cameraPreviewDialog.style.right = cameraPopupPlacement.right * layoutScaleX + "px"),
          (cameraPreviewDialog.style.transform =
            "scale(" +
            cameraPopupPlacement.scale * layoutScaleX +
            "," +
            cameraPopupPlacement.scale * layoutScaleY +
            ")"),
          (cameraPreviewDialog.style.maxHeight = "none"));
      };
      cameraPreviewDialog.resizeInteraction3d = resizeCameraPreview;
      const resizeObserver = new ResizeObserver(resizeCameraPreview);
      (resizeObserver.observe(container),
        resizeObserver.observe(cameraPreviewHeading),
        cameraCleanupCallbacks.push(() => resizeObserver.disconnect()),
        resizeCameraPreview());
    } else self.registerRuntimeDialogScale(cameraPreviewOverlay, cameraPreviewDialog, 760, 680);
    (cameraPreviewCloseButton.addEventListener("click", () => cameraPreviewDialog.close()),
      self.bindRuntimeDialogOutsideDismiss(
        cameraPreviewOverlay,
        cameraPreviewDialog,
        cameraPreviewCard,
      ),
      cameraPreviewOverlay.addEventListener("keydown", (previewKeyEvent) => {
        previewKeyEvent.key === "Escape" && cameraPreviewDialog.close();
      }),
      cameraPreviewDialog.addEventListener(
        "close",
        () => {
          (window.clearTimeout(cameraMotionTimeoutId), cameraMotionAnimation?.cancel());
          for (const cleanupFn of cameraCleanupCallbacks.splice(0)) cleanupFn();
          (self.clearRuntimeDialogScale(cameraPreviewDialog),
            self.detailsDialog === cameraPreviewDialog && (self.detailsDialog = null),
            cameraPreviewOverlay.remove());
        },
        {
          once: true,
        },
      ),
      cameraPreviewDialog.show(),
      cameraPreviewDialog.resizeInteraction3d?.());
  }