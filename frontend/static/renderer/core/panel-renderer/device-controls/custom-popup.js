/*
 * 设备控件区块：组合弹窗（用户在编辑器里自己拼的弹窗）。
 *
 * showCustomPopup 按弹窗模板把若干控件排进一个弹窗里，是所有弹窗里最通用的一支：
 * 布局（网格/横排）、缩略模式、内嵌图表与相机预览都在这里分发。
 */

import {
  COVER_POSITION_EPSILON_PERCENT,
  formatLineChartValue,
  mountCameraMedia,
  renderLineChartDetails
} from "../../registry.js?v=2609221226";
import { paletteColor } from "../../../../utils/colors.js?v=2609221226";
import { entityDomainFromId } from "../../../../utils/entities.js?v=2609221226";
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609221226";
import { popupLayoutMetrics } from "../../../../shared/popup-layout.js?v=2609221226";
import {
  bathHeaterModeUsesAirflow,
  climateIsPoweredOn,
  climateModeLabel,
  climatePowerCommand,
  resolveClimateDeviceType
} from "../../../controls/climate.js?v=2609221226";
import { applyXiaomiDeviceProfile } from "../../device-profiles.js?v=2609221226";
import { hsToRgbColor, lightSupportsColor } from "../../../controls/light-runtime.js?v=2609221226";
import {
  airerPositionCalibration,
  airerVisualDrop,
  coverComponentIsAirer,
  coverPresentationState,
  dreamCurtainStatusFromRetraction,
  dreamCurtainStatusText,
  dreamCurtainToggleService,
  physicalCoverState,
  relatedAirerCurrentPositionSensor,
  relatedAirerLightEntity,
  relatedAirerMotorActionEntities,
  relatedAirerMotorSpeedSensor,
  relatedAirerPositionNumberEntity,
  relatedDeviceDomainEntity
} from "../../../controls/cover-runtime.js?v=2609221226";
import {
  coverMotorIsReversedForComponent
} from "../../../controls/cover-direction.js?v=2609221226";
import {
  playFixedDeviceDropEntrance,
  playMediaSpeakerEntrance
} from "../../runtime-dialog-motion.js?v=2609221226";
import { syncedLineChartProperties } from "../../runtime-document.js?v=2609221226";
import {
  airQualityAccent,
  airQualityAccentSoft,
  airerPositionLabel,
  appendAirerVisual,
  createSwitchVisual,
  popupModuleDialogTitle
} from "../primitives.js?v=2609221226";

export const customPopupMethods = {
  /**
   * 打开文档里定义的组合弹窗（customPopup）。
   * 打开时递增弹窗代数并重新订阅运行期状态：弹窗内可能引用当前页没有的实体，
   * 订阅集合必须覆盖它们，否则弹窗控件拿不到状态推送。
   */
  showCustomPopup(popupDefinition, { preview: popupPreviewMode = false } = {}) {
    this.closeRuntimeDialog();
    // 代数 +1 让弹窗内上一轮发出的历史曲线请求作废：
    // 关闭或重开弹窗后，旧请求的结果不能写回新弹窗的图表。
    this.historyPopupGeneration += 1;
    this.activePopupId = String(popupDefinition?.id || "");
    // 弹窗里的控件可能引用本页未出现的实体，必须先补订阅再渲染。
    this.connectRuntime();
    const popupDialogElement = document.createElement("dialog");
    popupDialogElement.className = "hb-custom-popup-dialog";
    const popupCardElement = document.createElement("div");
    popupCardElement.className = "hb-custom-popup-card";
    const popupModules = popupDefinition.modules || [];
    const popupMetrics = popupLayoutMetrics(popupModules, popupDefinition.layout);
    const popupWidthPx = popupMetrics.popupWidth;
    const popupHeightPx = popupMetrics.popupHeight;
    popupDialogElement.dataset.runtimeDialogLayout =
      popupMetrics.rows === 1 && popupMetrics.columns === 2 ? "compact" : "fill";
    popupCardElement.style.width = popupWidthPx + "px";
    popupCardElement.style.height = popupHeightPx + "px";
    popupCardElement.style.maxHeight = "none";
    const popupHeadingElement = document.createElement("div");
    popupHeadingElement.className = "hb-custom-popup-heading";
    const popupTitleRowElement = document.createElement("div");
    const popupTitleElement = document.createElement("strong");
    popupTitleElement.textContent = popupDefinition.name || "组合弹窗";
    popupTitleRowElement.append(popupTitleElement);
    const popupCloseButton = document.createElement("button");
    popupCloseButton.type = "button";
    popupCloseButton.textContent = "×";
    popupCloseButton.setAttribute("aria-label", "关闭组合弹窗");
    popupHeadingElement.append(popupTitleRowElement, popupCloseButton);
    const popupGridElement = document.createElement("div");
    popupGridElement.className = "hb-custom-popup-grid";
    popupGridElement.style.gridTemplateColumns =
      "repeat(" + popupMetrics.columns + ", minmax(0, 1fr))";
    popupGridElement.style.gridTemplateRows = "repeat(" + popupMetrics.rows + ", minmax(0, 1fr))";
    const popupCleanupCallbacks = [];
    const mediaSpeakerVisuals = [];
    const mediaBrowserPanels = [];
    const deviceDropEntries = [];
    const chartRefreshCleanups = [];
    const popupHandlersByEntityId = new Map();
    /**
     * 注册组合弹窗内的状态回调。
     *
     * 与净化器弹窗同理：同一实体可能被多个模块订阅，按实体 ID 聚合成数组。
     */
    const registerPopupStateHandler = (popupHandlerEntityId, popupStateHandler) => {
      if (!popupHandlersByEntityId.has(popupHandlerEntityId)) {
        popupHandlersByEntityId.set(popupHandlerEntityId, []);
      }
      popupHandlersByEntityId.get(popupHandlerEntityId).push(popupStateHandler);
    };
    for (const [moduleIndex, popupModule] of popupModules.entries()) {
      const normalizedPopupModule =
        popupModule.type === "capability-device"
          ? {
              ...popupModule,
              type: "generic"
            }
          : popupModule;
      const moduleEntityId = String(normalizedPopupModule.entityId || "");
      const moduleDeviceProfile = this.deviceProfile(moduleEntityId);
      const profiledPopupModule = applyXiaomiDeviceProfile(
        {
          bindings: {
            entity: {
              entityId: normalizedPopupModule.entityId
            }
          },
          properties: {
            ...(normalizedPopupModule.properties || {}),
            deviceType:
              normalizedPopupModule.deviceType ||
              normalizedPopupModule.properties?.deviceType ||
              "auto"
          }
        },
        moduleDeviceProfile
      );
      const resolvedPopupModule = moduleDeviceProfile
        ? {
            ...normalizedPopupModule,
            properties: profiledPopupModule.properties,
            deviceType:
              profiledPopupModule.properties?.deviceType || normalizedPopupModule.deviceType
          }
        : normalizedPopupModule;
      const moduleGridPlacement = popupMetrics.placements[moduleIndex] || {
        x: 0,
        y: moduleIndex,
        width: 1,
        height: 1
      };
      const moduleColumnSpan = [
        "climate",
        "air-purifier",
        "water-heater",
        "media-player",
        "camera",
        "line-chart"
      ].includes(resolvedPopupModule.type)
        ? 2
        : moduleGridPlacement.width;
      const moduleResolvedEntityId = moduleEntityId || resolvedPopupModule.entityId;
      const moduleEntityState = this.states.get(moduleResolvedEntityId);
      const moduleCurrentState = resolveStateEntry(moduleEntityState);
      const popupModuleElement = document.createElement("section");
      popupModuleElement.className =
        "hb-custom-popup-module hb-custom-popup-module--" + (resolvedPopupModule.type || "generic");
      popupModuleElement.style.gridColumn =
        moduleGridPlacement.x + 1 + " / span " + moduleColumnSpan;
      popupModuleElement.style.gridRow =
        moduleGridPlacement.y + 1 + " / span " + moduleGridPlacement.height;
      const popupModuleHeadingElement = document.createElement("div");
      popupModuleHeadingElement.className = "hb-custom-popup-module-heading";
      const popupModuleTitleElement = document.createElement("strong");
      popupModuleTitleElement.textContent = popupModuleDialogTitle(
        resolvedPopupModule,
        moduleCurrentState
      );
      const popupModuleStatusElement = document.createElement("span");
      popupModuleStatusElement.className =
        "hb-custom-popup-module-status type-" + (resolvedPopupModule.type || "generic");
      const popupModuleTypeLabels = {
        light: "灯光",
        climate: "空调 / 浴霸",
        "air-purifier": "空气净化器",
        "water-heater": "热水器",
        "media-player": "媒体",
        "electric-bed": "电动床",
        switch: "开关",
        cover: "窗帘",
        camera: "摄像头",
        "line-chart": "实时数据",
        generic: "设备"
      };
      popupModuleStatusElement.textContent =
        popupModuleTypeLabels[resolvedPopupModule.type] || popupModuleTypeLabels.generic;
      popupModuleHeadingElement.append(popupModuleTitleElement, popupModuleStatusElement);
      popupModuleElement.append(popupModuleHeadingElement);
      if (
        resolvedPopupModule.type === "electric-bed" &&
        moduleDeviceProfile?.deviceType !== "electric-bed"
      ) {
        popupModuleElement.classList.add("hb-custom-popup-module--electric-bed");
        const popupLoadingElement = document.createElement("section");
        popupLoadingElement.className =
          "hb-custom-electric-bed-loading hb-climate-details-loading is-loading";
        const popupLoadingSpinnerElement = document.createElement("i");
        popupLoadingSpinnerElement.setAttribute("aria-hidden", "true");
        const popupLoadingTextElement = document.createElement("strong");
        popupLoadingTextElement.textContent = "正在加载设备状态…";
        popupLoadingElement.append(popupLoadingSpinnerElement, popupLoadingTextElement);
        popupModuleElement.append(popupLoadingElement);
      } else if (resolvedPopupModule.type === "electric-bed") {
        popupModuleElement.classList.add("hb-custom-popup-module--electric-bed");
        const popupDeviceRoles =
          (moduleDeviceProfile || this.deviceProfile(moduleResolvedEntityId))?.roles || {};
        /**
         * 取弹窗内某个实体用于首帧渲染的状态，从未收到过状态时返回 unknown 占位。
         * 控件创建时就需要一份状态渲染首帧，但推送可能还没到；占位对象带齐
         * entityId/state/attributes，省去控件内部到处判空。
         */
        const stateForPopupEntity = popupStateEntityId => {
          const popupEntityStateValue = this.states.get(popupStateEntityId);
          return (
            resolveStateEntry(popupEntityStateValue, {
              entityId: popupStateEntityId,
              state: "unknown",
              attributes: {}
            })
          );
        };
        const bedBodyElement = document.createElement("div");
        bedBodyElement.className = "hb-custom-electric-bed-body";
        const bedVisualElement = document.createElement("section");
        bedVisualElement.className = "hb-electric-bed-visual";
        const bedModelElement = document.createElement("div");
        bedModelElement.className = "hb-electric-bed-model";
        for (const bedPartName of ["mattress", "back", "waist", "legs", "base"]) {
          const bedPartElement = document.createElement("i");
          bedPartElement.className = "hb-electric-bed-" + bedPartName;
          bedModelElement.append(bedPartElement);
        }
        /**
         * 创建电动床的一个角度读数行（数值 + 标签）。
         */
        const createBedAngleReadout = (readoutClassName, readoutLabelText) => {
          const bedReadoutElement = document.createElement("span");
          bedReadoutElement.className = "hb-electric-bed-angle-readout " + readoutClassName;
          const bedReadoutValueElement = document.createElement("strong");
          const bedReadoutLabelElement = document.createElement("small");
          bedReadoutLabelElement.textContent = readoutLabelText;
          bedReadoutElement.append(bedReadoutValueElement, bedReadoutLabelElement);
          return {
            item: bedReadoutElement,
            value: bedReadoutValueElement
          };
        };
        const bedBackReadout = createBedAngleReadout("back", "靠背");
        const bedWaistReadout = createBedAngleReadout("waist", "腰部");
        const bedLegsReadout = createBedAngleReadout("legs", "腿部");
        bedVisualElement.append(
          bedModelElement,
          bedBackReadout.item,
          bedWaistReadout.item,
          bedLegsReadout.item
        );
        const bedModeSectionElement = document.createElement("section");
        bedModeSectionElement.className = "hb-electric-bed-control hb-electric-bed-mode";
        const bedMemorySectionElement = document.createElement("section");
        bedMemorySectionElement.className = "hb-electric-bed-memory";
        const bedAngleControlsSectionElement = document.createElement("section");
        bedAngleControlsSectionElement.className = "hb-electric-bed-angle-controls";
        const bedModeEntityId = String(popupDeviceRoles.mode || "");
        const bedMemoryEntityIds = [popupDeviceRoles.memory1, popupDeviceRoles.memory2]
          .filter(Boolean)
          .slice(0, 2);
        const bedAngleControls = [
          ["backrest", "靠背角度", "back"],
          ["leg", "腿部角度", "legs"],
          ["waist", "腰部角度", "waist"]
        ]
          .map(([angleControlRole, angleControlLabel, angleControlVisualClass]) => ({
            role: angleControlRole,
            label: angleControlLabel,
            visualClass: angleControlVisualClass,
            entityId: String(popupDeviceRoles[angleControlRole] || "")
          }))
          .filter(angleControlEntry => angleControlEntry.entityId);
        /**
         * 往电动床弹窗的某个区块追加一个通用能力控件。
         * 控件同时登记到弹窗清理表与状态回调表：前者保证关闭时解绑内部监听，后者让该实体
         * 后续的状态推送能直接同步到这个控件。
         */
        const appendBedCapabilityControl = (
          sectionContainer,
          controlLabel,
          controlEntityId,
          controlVariant = ""
        ) => {
          const bedControlSectionElement = document.createElement("section");
          bedControlSectionElement.className = "hb-electric-bed-control";
          const bedControlTitleElement = document.createElement("strong");
          bedControlTitleElement.textContent = controlLabel;
          const bedCapabilityControls = this.createCapabilityDetailsControls(
            controlEntityId,
            stateForPopupEntity(controlEntityId),
            {
              interactive: !popupPreviewMode,
              variant: controlVariant
            }
          );
          bedCapabilityControls.classList.add("hb-electric-bed-capability");
          bedControlSectionElement.append(bedControlTitleElement, bedCapabilityControls);
          sectionContainer.append(bedControlSectionElement);
          popupCleanupCallbacks.push(() => bedCapabilityControls.cleanupCapabilityDetails?.());
          registerPopupStateHandler(controlEntityId, nextControlState =>
            bedCapabilityControls.syncCapabilityState?.(nextControlState)
          );
        };
        if (bedModeEntityId) {
          appendBedCapabilityControl(
            bedModeSectionElement,
            "模式",
            bedModeEntityId,
            "electric-bed"
          );
        } else {
          const bedModeTitleElement = document.createElement("strong");
          bedModeTitleElement.textContent = "模式";
          const bedModeSelectElement = document.createElement("select");
          bedModeSelectElement.className = "hb-capability-select";
          bedModeSelectElement.disabled = true;
          bedModeSelectElement.append(new Option("未识别到模式实体"));
          bedModeSectionElement.append(bedModeTitleElement, bedModeSelectElement);
        }
        const bedMemoryTitleElement = document.createElement("strong");
        bedMemoryTitleElement.textContent = "记忆姿势";
        const bedMemoryListElement = document.createElement("div");
        bedMemoryListElement.className = "hb-electric-bed-memory-list";
        for (let bedMemoryIndex = 0; bedMemoryIndex < 2; bedMemoryIndex += 1) {
          const bedMemoryEntityId = String(bedMemoryEntityIds[bedMemoryIndex] || "");
          const bedMemoryMetadata = bedMemoryEntityId
            ? this.entityMetadata.get(bedMemoryEntityId)
            : null;
          if (entityDomainFromId(bedMemoryEntityId) === "select") {
            appendBedCapabilityControl(
              bedMemoryListElement,
              "记忆姿势 " + (bedMemoryIndex + 1),
              bedMemoryEntityId,
              "electric-bed-memory"
            );
            continue;
          }
          const bedMemoryButton = document.createElement("button");
          bedMemoryButton.type = "button";
          bedMemoryButton.className = "hb-electric-bed-memory-button";
          bedMemoryButton.textContent =
            bedMemoryMetadata?.name ||
            bedMemoryMetadata?.originalName ||
            "记忆姿势 " + (bedMemoryIndex + 1);
          bedMemoryButton.disabled = popupPreviewMode || !bedMemoryEntityId;
          bedMemoryButton.addEventListener("click", async () => {
            if (!popupPreviewMode && !!bedMemoryEntityId && !bedMemoryButton.disabled) {
              bedMemoryButton.disabled = true;
              try {
                await this.callEntityService("button", "press", bedMemoryEntityId);
                bedMemoryButton.classList.add("is-success");
                window.setTimeout(() => bedMemoryButton.classList.remove("is-success"), 900);
              } catch (bedMemoryPressError) {
                this.options.onError?.(bedMemoryPressError);
              } finally {
                bedMemoryButton.disabled = popupPreviewMode || !bedMemoryEntityId;
              }
            }
          });
          bedMemoryListElement.append(bedMemoryButton);
        }
        bedMemorySectionElement.append(bedMemoryTitleElement, bedMemoryListElement);
        for (const bedAngleControl of bedAngleControls) {
          appendBedCapabilityControl(
            bedAngleControlsSectionElement,
            bedAngleControl.label,
            bedAngleControl.entityId
          );
        }
        /**
         * 从三个角度实体当前的状态重算并刷新电动床的角度读数与模型倾角。
         * 三个角色共用同一套渲染逻辑，故按角色逐个取状态后调用同一渲染函数；取不到值显示
         * "--"，模型保持上一次姿态。
         */
        const syncBedAngleState = () => {
          const bedAngleStates = {
            backrest: stateForPopupEntity(popupDeviceRoles.backrest),
            leg: stateForPopupEntity(popupDeviceRoles.leg),
            waist: stateForPopupEntity(popupDeviceRoles.waist)
          };
          /**
           * 从角度实体状态里解析出角度数值；不是有限数时返回 null。
           *
           * @returns {number|null} 角度值（单位：度）；不可用时为 null。
           */
          const bedAngleValueFor = bedAngleEntityState => {
            const bedAngleValue = Number(bedAngleEntityState?.state);
            if (Number.isFinite(bedAngleValue)) {
              return bedAngleValue;
            } else {
              return null;
            }
          };
          /**
           * 渲染单个角度角色的读数文本，并同步床模型对应部位的倾角。
           * 倾角通过 CSS 变量 --hb-bed-<role>-angle 下发，让模型姿态与读数共用同一角度值，
           * 避免两处各算一遍导致不同步。
           */
          const renderBedAngleReadout = (
            bedAngleRole,
            bedAngleModelElement,
            bedAngleReadoutValueElement
          ) => {
            const bedAngleDegrees = bedAngleValueFor(bedAngleStates[bedAngleRole]);
            bedAngleReadoutValueElement.textContent =
              bedAngleDegrees === null ? "--" : Math.round(bedAngleDegrees) + "°";
            if (bedAngleDegrees !== null) {
              bedModelElement.style.setProperty(
                "--hb-bed-" + (bedAngleRole === "backrest" ? "backrest" : bedAngleRole) + "-angle",
                bedAngleDegrees + "deg"
              );
            }
          };
          renderBedAngleReadout("backrest", bedModelElement, bedBackReadout.value);
          renderBedAngleReadout("waist", bedModelElement, bedWaistReadout.value);
          renderBedAngleReadout("leg", bedModelElement, bedLegsReadout.value);
          popupModuleStatusElement.textContent = "已连接";
        };
        for (const bedAngleEntityId of [
          popupDeviceRoles.backrest,
          popupDeviceRoles.leg,
          popupDeviceRoles.waist
        ].filter(Boolean)) {
          registerPopupStateHandler(bedAngleEntityId, syncBedAngleState);
        }
        syncBedAngleState();
        bedBodyElement.append(
          bedModeSectionElement,
          bedVisualElement,
          bedMemorySectionElement,
          bedAngleControlsSectionElement
        );
        popupModuleElement.append(bedBodyElement);
      } else if (resolvedPopupModule.type === "camera") {
        const popupCameraVisualElement = document.createElement("section");
        popupCameraVisualElement.className =
          "hb-camera-device-visual hb-custom-camera-device-visual";
        popupCameraVisualElement.setAttribute("aria-hidden", "true");
        const popupCameraMountElement = document.createElement("i");
        popupCameraMountElement.className = "hb-camera-device-mount";
        const popupCameraArmElement = document.createElement("i");
        popupCameraArmElement.className = "hb-camera-device-arm";
        const popupCameraBodyElement = document.createElement("div");
        popupCameraBodyElement.className = "hb-camera-device-body";
        const popupCameraLensElement = document.createElement("i");
        popupCameraLensElement.className = "hb-camera-device-lens";
        const popupCameraLedElement = document.createElement("i");
        popupCameraLedElement.className = "hb-camera-device-led";
        popupCameraBodyElement.append(popupCameraLensElement, popupCameraLedElement);
        popupCameraVisualElement.append(
          popupCameraMountElement,
          popupCameraArmElement,
          popupCameraBodyElement
        );
        popupModuleHeadingElement.append(popupCameraVisualElement);
        let popupCameraLensTimer = 0;
        let popupCameraLensAnimation = null;
        let popupCameraLensOffset = 0;
        /**
         * 生成摄像头镜头的 3D 变换串（水平摇头 + 极轻微的 Z 轴倾斜）。
         * rotateZ 取 rotateY 的 0.035 倍，让摇头带一点真实云台的不规则感而非塑料感的纯水平滑动。
         */
        const popupCameraLensTransform = (
          popupCameraLensRotationDeg,
          popupCameraLensOffsetYPx = 0
        ) =>
          "translateX(-50%) perspective(260px) rotateY(" +
          popupCameraLensRotationDeg +
          "deg) rotateZ(" +
          popupCameraLensRotationDeg * 0.035 +
          "deg) translateY(" +
          popupCameraLensOffsetYPx +
          "px)";
        /**
         * 启动一次镜头摇头动画，结束后随机延时递归调度下一次。
         * 候选角度先按「与当前位置至少差 7 度」过滤，避免只挪一点点看不出动作；时长与过冲量
         * 掺随机数防止循环机械；节点已卸载直接返回，命中 prefers-reduced-motion 则不启动。
         */
        const startPopupCameraLensAnimation = () => {
          if (!popupCameraBodyElement.isConnected) {
            return;
          }
          const popupCameraLensCandidates = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
            popupCameraLensOffsetCandidate =>
              Math.abs(popupCameraLensOffsetCandidate - popupCameraLensOffset) >= 7
          );
          const nextPopupCameraLensOffset =
            popupCameraLensCandidates[
              Math.floor(Math.random() * popupCameraLensCandidates.length)
            ] ?? 0;
          const popupCameraLensDirection =
            Math.sign(nextPopupCameraLensOffset - popupCameraLensOffset) || 1;
          const popupCameraLensDistance = Math.abs(
            nextPopupCameraLensOffset - popupCameraLensOffset
          );
          const popupCameraLensDurationMs = Math.round(
            430 + popupCameraLensDistance * 18 + Math.random() * 320
          );
          const popupCameraLensOvershootOffset =
            nextPopupCameraLensOffset + popupCameraLensDirection * (1.4 + Math.random() * 2.2);
          const popupCameraLensOffsetY = Math.random() * 1.4 - 0.7;
          popupCameraLensElement.style.setProperty(
            "--hb-camera-lens-shift",
            (nextPopupCameraLensOffset / 23) * 2.5 + "px"
          );
          popupCameraLensAnimation?.cancel();
          popupCameraLensAnimation = popupCameraBodyElement.animate(
            [
              {
                transform: popupCameraLensTransform(popupCameraLensOffset, 0),
                offset: 0
              },
              {
                transform: popupCameraLensTransform(
                  popupCameraLensOvershootOffset,
                  popupCameraLensOffsetY
                ),
                offset: 0.78
              },
              {
                transform: popupCameraLensTransform(
                  nextPopupCameraLensOffset,
                  popupCameraLensOffsetY * 0.35
                ),
                offset: 1
              }
            ],
            {
              duration: popupCameraLensDurationMs,
              easing: "cubic-bezier(.2,.72,.22,1)",
              fill: "forwards"
            }
          );
          popupCameraLensAnimation.addEventListener(
            "finish",
            () => {
              popupCameraLensOffset = nextPopupCameraLensOffset;
              popupCameraBodyElement.style.transform = popupCameraLensTransform(
                popupCameraLensOffset,
                popupCameraLensOffsetY * 0.35
              );
              popupCameraLensAnimation?.cancel();
              popupCameraLensAnimation = null;
              const popupCameraLensDelayMs =
                Math.random() < 0.22 ? 180 + Math.random() * 260 : 680 + Math.random() * 1500;
              popupCameraLensTimer = window.setTimeout(
                startPopupCameraLensAnimation,
                popupCameraLensDelayMs
              );
            },
            {
              once: true
            }
          );
        };
        if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          popupCameraLensTimer = window.setTimeout(startPopupCameraLensAnimation, 620);
        }
        popupCleanupCallbacks.push(() => {
          window.clearTimeout(popupCameraLensTimer);
          popupCameraLensAnimation?.cancel();
        });
        const popupCameraStageElement = document.createElement("div");
        popupCameraStageElement.className = "hb-custom-popup-camera-stage is-connecting";
        popupModuleStatusElement.textContent = popupPreviewMode ? "预览模式" : "正在连接";
        popupModuleStatusElement.classList.add("is-connecting");
        const popupCameraRevealVeilElement = document.createElement("i");
        popupCameraRevealVeilElement.className = "hb-camera-preview-reveal-veil";
        const popupCameraScanLineElement = document.createElement("i");
        popupCameraScanLineElement.className = "hb-camera-preview-scan-line";
        popupCameraStageElement.append(popupCameraRevealVeilElement, popupCameraScanLineElement);
        const popupCameraPlaceholderElement = document.createElement("span");
        popupCameraPlaceholderElement.textContent = popupPreviewMode
          ? "预览模式不获取实时画面"
          : "正在载入摄像头实时预览";
        popupCameraStageElement.append(popupCameraPlaceholderElement);
        if (popupPreviewMode) {
          popupModuleStatusElement.classList.remove("is-connecting");
          popupCameraStageElement.classList.remove("is-connecting");
          popupCameraStageElement.classList.add("is-ready");
        } else {
          mountCameraMedia({
            container: popupCameraStageElement,
            entityId: moduleResolvedEntityId,
            label: popupModuleTitleElement.textContent,
            objectFit: "fill",
            placeholder: popupCameraPlaceholderElement,
            onReady: () => {
              popupModuleStatusElement.textContent = "实时画面";
              popupModuleStatusElement.classList.remove("is-connecting", "is-unavailable");
              popupModuleStatusElement.classList.add("is-live");
              popupCameraVisualElement.classList.remove("is-unavailable");
              popupCameraVisualElement.classList.add("is-live");
              popupCameraStageElement.classList.remove(
                "is-connecting",
                "is-unavailable",
                "is-revealing"
              );
              popupCameraStageElement.classList.add("is-ready");
            },
            onUnavailable: () => {
              popupModuleStatusElement.textContent = "画面不可用";
              popupModuleStatusElement.classList.remove("is-connecting", "is-live");
              popupModuleStatusElement.classList.add("is-unavailable");
              popupCameraVisualElement.classList.remove("is-live");
              popupCameraVisualElement.classList.add("is-unavailable");
              popupCameraStageElement.classList.remove("is-connecting", "is-revealing");
              popupCameraStageElement.classList.add("is-unavailable");
            },
            cleanup: popupCameraCleanup => popupCleanupCallbacks.push(popupCameraCleanup)
          });
        }
        popupModuleElement.append(popupCameraStageElement);
      } else if (resolvedPopupModule.type === "line-chart") {
        const popupLineChartComponent = {
          type: "line-chart",
          bindings: {
            entity: {
              entityId: moduleResolvedEntityId
            }
          },
          properties: {
            ...syncedLineChartProperties(
              this.document,
              this.page,
              moduleResolvedEntityId,
              resolvedPopupModule.properties
            ),
            compactDetailsHorizontal: true
          }
        };
        const popupChartOutputElement = document.createElement("output");
        popupChartOutputElement.className = "hb-custom-line-chart-current";
        const popupChartValueElement = document.createElement("strong");
        const popupChartUnitElement = document.createElement("small");
        const popupChartColor = String(popupLineChartComponent.properties?.valueColor || "#dce1e5");
        popupChartValueElement.style.color = popupChartColor;
        popupChartUnitElement.style.color = popupChartColor;
        popupChartOutputElement.append(popupChartValueElement, popupChartUnitElement);
        popupModuleHeadingElement.append(popupChartOutputElement);
        /**
         * 把折线图模块当前实体的状态渲染成标题旁的大号数值与单位。
         * 数值可解析时按组件声明的 statePrecision 格式化，否则原样显示 state（如 "unknown"），
         * 保证任何状态下都有可读文本；aria-label 同步更新。
         */
        const renderPopupChartValue = popupChartState => {
          const popupChartNumericValue = Number.parseFloat(popupChartState?.state);
          popupChartValueElement.textContent = Number.isFinite(popupChartNumericValue)
            ? formatLineChartValue(
                popupChartNumericValue,
                popupLineChartComponent.properties?.statePrecision
              )
            : popupChartState?.state || "--";
          popupChartUnitElement.textContent = String(
            popupChartState?.attributes?.unit_of_measurement || ""
          );
          popupChartOutputElement.setAttribute(
            "aria-label",
            "当前数值 " + popupChartValueElement.textContent + popupChartUnitElement.textContent
          );
        };
        const popupChartRenderOptions = {
          states: this.states,
          history: this.historySeries,
          renderNamespace: this.renderNamespace + "-" + resolvedPopupModule.id,
          interactive: true,
          animate: false
        };
        let popupChartElement = renderLineChartDetails(
          popupLineChartComponent,
          popupChartRenderOptions
        );
        let popupChartRefreshTimer = 0;
        /**
         * 重建弹窗里的折线图：渲染新实例、接替旧实例并同步线色。
         * 折线图尺寸依赖挂载后的实际布局，无法原地更新只能整体替换，故先解绑旧实例的悬浮监听
         * 再 replaceWith；弹窗已关闭或图表已脱离文档时直接返回，避免在已销毁 DOM 上替换。
         */
        const refreshPopupChart = () => {
          popupChartRefreshTimer = 0;
          if (
            !popupChartElement?.isConnected ||
            this.detailsStateSync?.dialog !== popupDialogElement
          ) {
            return;
          }
          const nextPopupChartElement = renderLineChartDetails(
            popupLineChartComponent,
            popupChartRenderOptions
          );
          popupChartElement.cleanupLineChartHover?.();
          popupChartElement.replaceWith(nextPopupChartElement);
          popupChartElement = nextPopupChartElement;
          syncPopupChartAccent();
        };
        /**
         * 安排一次折线图重建（默认 700ms 防抖）。
         *
         * 用 `||=` 保证同一时刻只有一个待执行定时器：连续状态推送只换来一次重建。
         */
        const schedulePopupChartRefresh = (refreshDelayMs = 700) => {
          popupChartRefreshTimer ||= window.setTimeout(
            refreshPopupChart,
            Math.max(0, Number(refreshDelayMs) || 0)
          );
        };
        chartRefreshCleanups.push(() => schedulePopupChartRefresh(0));
        /**
         * 把折线图的当前线色同步给标题旁的数值文本，保证两处配色一致。
         */
        const syncPopupChartAccent = () => {
          popupChartOutputElement.style.setProperty(
            "--hb-custom-chart-accent",
            popupChartElement.style.getPropertyValue("--hb-chart-current-color") || paletteColor("--hos-eco", "#5fd0a8")
          );
        };
        renderPopupChartValue(moduleCurrentState);
        syncPopupChartAccent();
        registerPopupStateHandler(moduleResolvedEntityId, popupStateUpdate => {
          renderPopupChartValue(popupStateUpdate);
          popupChartElement.syncLineChartState?.(popupStateUpdate);
          syncPopupChartAccent();
        });
        popupCleanupCallbacks.push(() => {
          window.clearTimeout(popupChartRefreshTimer);
          popupChartElement.cleanupLineChartHover?.();
        });
        popupModuleElement.append(popupChartElement);
      } else if (resolvedPopupModule.type === "switch") {
        let switchPopupState = moduleCurrentState;
        let isSwitchPopupPending = false;
        let switchPopupActionStatus = "idle";
        let switchPopupToggleHandler = null;
        const isSwitchMomentaryButton = entityDomainFromId(moduleResolvedEntityId) === "button";
        const switchPopupVisual = createSwitchVisual({
          label: popupModuleTitleElement.textContent,
          interactive: !popupPreviewMode,
          momentary: isSwitchMomentaryButton,
          onToggle: () => switchPopupToggleHandler?.()
        });
        switchPopupVisual.visual.classList.add("hb-custom-switch-visual");
        /**
         * 把开关实体的状态渲染到开关视觉与状态文案上。
         * button 实体是瞬时动作（按一下执行一次），没有开/关概念，因此用 pending / success
         * 两个动作态驱动文案与高亮，而不是用 state 判断。
         */
        const renderSwitchPopupState = nextState => {
          switchPopupState = nextState;
          const isSwitchUnavailable =
            !nextState?.state || ["unknown", "unavailable"].includes(nextState.state);
          const isSwitchOn = !isSwitchMomentaryButton && nextState?.state === "on";
          switchPopupVisual.sync(isSwitchOn, {
            unavailable: isSwitchUnavailable,
            pending: isSwitchPopupPending && switchPopupActionStatus !== "success",
            success: switchPopupActionStatus === "success"
          });
          popupModuleStatusElement.textContent = isSwitchUnavailable
            ? "当前不可用"
            : isSwitchMomentaryButton
              ? switchPopupActionStatus === "success"
                ? "执行成功"
                : isSwitchPopupPending
                  ? "正在执行"
                  : "按下执行"
              : isSwitchOn
                ? "已开启"
                : "已关闭";
          popupModuleStatusElement.classList.toggle(
            "is-live",
            (isSwitchMomentaryButton
              ? isSwitchPopupPending || switchPopupActionStatus === "success"
              : isSwitchOn) && !isSwitchUnavailable
          );
        };
        switchPopupToggleHandler = async () => {
          if (
            popupPreviewMode ||
            isSwitchPopupPending ||
            ["unknown", "unavailable"].includes(switchPopupState?.state)
          ) {
            return;
          }
          const previousSwitchState = switchPopupState;
          isSwitchPopupPending = true;
          switchPopupActionStatus = "idle";
          renderSwitchPopupState(
            isSwitchMomentaryButton
              ? previousSwitchState
              : {
                  ...previousSwitchState,
                  state: previousSwitchState?.state === "on" ? "off" : "on"
                }
          );
          try {
            if (isSwitchMomentaryButton) {
              await this.callEntityService("button", "press", moduleResolvedEntityId);
              switchPopupActionStatus = "success";
              renderSwitchPopupState(switchPopupState);
              await new Promise(resolveDelayedToggle =>
                window.setTimeout(resolveDelayedToggle, 900)
              );
            } else {
              await this.callEntityService("homeassistant", "toggle", moduleResolvedEntityId);
            }
          } catch (switchToggleError) {
            switchPopupActionStatus = "idle";
            renderSwitchPopupState(previousSwitchState);
            this.options.onError?.(switchToggleError);
          } finally {
            isSwitchPopupPending = false;
            switchPopupActionStatus = "idle";
            renderSwitchPopupState(switchPopupState);
          }
        };
        renderSwitchPopupState(moduleCurrentState);
        registerPopupStateHandler(moduleResolvedEntityId, renderSwitchPopupState);
        popupModuleElement.append(switchPopupVisual.visual);
      } else if (resolvedPopupModule.type === "light") {
        let lightDetailsControls = null;
        popupModuleHeadingElement.classList.add("has-light-visual");
        const lightVisualButton = document.createElement("button");
        lightVisualButton.type = "button";
        lightVisualButton.className = "hb-light-visual hb-custom-light-visual";
        lightVisualButton.style.animationDelay = 0.08 + moduleIndex * 0.07 + "s";
        lightVisualButton.inert = popupPreviewMode;
        lightVisualButton.setAttribute("aria-disabled", String(popupPreviewMode));
        const lightAuraElement = document.createElement("div");
        lightAuraElement.className = "hb-light-visual-aura";
        const lightLampElement = document.createElement("div");
        lightLampElement.className = "hb-light-visual-lamp";
        for (const lightPartName of ["cord", "shade", "bulb", "filament"]) {
          const lightPartElement = document.createElement("i");
          lightPartElement.className = "hb-light-visual-" + lightPartName;
          lightLampElement.append(lightPartElement);
        }
        lightVisualButton.append(lightAuraElement, lightLampElement);
        popupModuleHeadingElement.append(lightVisualButton);
        const lightAttributes = moduleCurrentState?.attributes || {};
        const isLightColorSupported = lightSupportsColor(lightAttributes);
        const lightMinKelvin =
          Number(lightAttributes.min_color_temp_kelvin) ||
          (Number.isFinite(Number(lightAttributes.max_mireds))
            ? 1000000 / Number(lightAttributes.max_mireds)
            : 2000);
        const lightMaxKelvin =
          Number(lightAttributes.max_color_temp_kelvin) ||
          (Number.isFinite(Number(lightAttributes.min_mireds))
            ? 1000000 / Number(lightAttributes.min_mireds)
            : 6500);
        const lightCurrentKelvin =
          Number(lightAttributes.color_temp_kelvin) ||
          (Number.isFinite(Number(lightAttributes.color_temp))
            ? 1000000 / Number(lightAttributes.color_temp)
            : NaN);
        const popupLightVisualState = {
          isOn: moduleCurrentState?.state === "on",
          brightnessPercent: Number.isFinite(Number(lightAttributes.brightness))
            ? (Number(lightAttributes.brightness) / 255) * 100
            : 100,
          colorTemperatureKelvin: Number.isFinite(lightCurrentKelvin)
            ? lightCurrentKelvin
            : (lightMinKelvin + lightMaxKelvin) / 2,
          colorRgb:
            isLightColorSupported && Array.isArray(lightAttributes.rgb_color)
              ? lightAttributes.rgb_color
                  .slice(0, 3)
                  .map(rgbChannelValue => Number(rgbChannelValue) || 0)
              : isLightColorSupported && Array.isArray(lightAttributes.hs_color)
                ? hsToRgbColor(lightAttributes.hs_color)
                : null
        };
        /**
         * 渲染灯光可视化（灯泡光色、亮度、光晕范围）并同步状态文案与无障碍属性。
         * 入参既可能是实体状态（state / attributes），也可能是内部轻量对象（isOn / brightnessPercent / colorTemperatureKelvin / colorRgb），因此每个字段都先看顶层再退回 attributes。亮度按 HA 约定的 0~255 归一成
         * 百分比；色温缺失时按 2000~6500K 在暖 / 冷色间线性插值；只有设备声明支持彩色才采信 rgb/hs 上报值。
         */
        const renderLightVisual = (nextLightState = {}) => {
          const nextLightAttributes = nextLightState.attributes || {};
          if (typeof nextLightState.isOn == "boolean") {
            popupLightVisualState.isOn = nextLightState.isOn;
          } else if (typeof nextLightState.state == "string") {
            popupLightVisualState.isOn = nextLightState.state === "on";
          }
          if (Number.isFinite(Number(nextLightState.brightnessPercent))) {
            popupLightVisualState.brightnessPercent = Number(nextLightState.brightnessPercent);
          } else if (Number.isFinite(Number(nextLightAttributes.brightness))) {
            popupLightVisualState.brightnessPercent =
              (Number(nextLightAttributes.brightness) / 255) * 100;
          }
          if (Number.isFinite(Number(nextLightState.colorTemperatureKelvin))) {
            popupLightVisualState.colorTemperatureKelvin = Number(
              nextLightState.colorTemperatureKelvin
            );
          } else if (Number.isFinite(Number(nextLightAttributes.color_temp_kelvin))) {
            popupLightVisualState.colorTemperatureKelvin = Number(
              nextLightAttributes.color_temp_kelvin
            );
          } else if (Number.isFinite(Number(nextLightAttributes.color_temp))) {
            popupLightVisualState.colorTemperatureKelvin =
              1000000 / Number(nextLightAttributes.color_temp);
          }
          if (isLightColorSupported && Array.isArray(nextLightState.colorRgb)) {
            popupLightVisualState.colorRgb = nextLightState.colorRgb
              .slice(0, 3)
              .map(nextRgbChannel => Number(nextRgbChannel) || 0);
          } else if (isLightColorSupported && Array.isArray(nextLightAttributes.rgb_color)) {
            popupLightVisualState.colorRgb = nextLightAttributes.rgb_color
              .slice(0, 3)
              .map(stateRgbChannel => Number(stateRgbChannel) || 0);
          } else if (isLightColorSupported && Array.isArray(nextLightAttributes.hs_color)) {
            popupLightVisualState.colorRgb = hsToRgbColor(nextLightAttributes.hs_color);
          }
          const lightBrightnessPercent = Math.max(
            1,
            Math.min(100, Number(popupLightVisualState.brightnessPercent) || 1)
          );
          const lightTemperatureRatio =
            (Math.max(
              2000,
              Math.min(6500, Number(popupLightVisualState.colorTemperatureKelvin) || 4250)
            ) -
              2000) /
            4500;
          const warmLightRgb = [255, 132, 42];
          const coolLightRgb = [172, 225, 255];
          const lightRgbComponents =
            popupLightVisualState.colorRgb ||
            warmLightRgb.map((warmChannelValue, rgbChannelIndex) =>
              Math.round(
                warmChannelValue +
                  (coolLightRgb[rgbChannelIndex] - warmChannelValue) * lightTemperatureRatio
              )
            );
          lightVisualButton.classList.toggle("is-on", popupLightVisualState.isOn);
          lightVisualButton.style.setProperty(
            "--hb-light-visual-color",
            "rgb(" + lightRgbComponents.join(",") + ")"
          );
          lightVisualButton.style.setProperty(
            "--hb-light-visual-opacity",
            popupLightVisualState.isOn ? String(0.08 + (lightBrightnessPercent / 100) * 0.92) : "0"
          );
          lightVisualButton.style.setProperty(
            "--hb-light-visual-blur",
            Math.round(15 + lightBrightnessPercent * 1.14) + "px"
          );
          lightVisualButton.style.setProperty(
            "--hb-light-visual-scale",
            String(0.62 + (lightBrightnessPercent / 100) * 1.05)
          );
          lightVisualButton.setAttribute("aria-pressed", String(popupLightVisualState.isOn));
          lightVisualButton.setAttribute(
            "aria-label",
            "" +
              popupModuleTitleElement.textContent +
              (popupLightVisualState.isOn ? "已开启，点击关闭" : "已关闭，点击开启")
          );
          popupModuleStatusElement.textContent = popupLightVisualState.isOn ? "已开启" : "已关闭";
          popupModuleStatusElement.classList.toggle("is-live", popupLightVisualState.isOn);
        };
        renderLightVisual();
        let isLightTogglePending = false;
        lightVisualButton.addEventListener("click", async () => {
          if (popupPreviewMode || isLightTogglePending) {
            return;
          }
          isLightTogglePending = true;
          lightVisualButton.setAttribute("aria-busy", "true");
          const previousLightIsOn = popupLightVisualState.isOn;
          renderLightVisual({
            isOn: !previousLightIsOn
          });
          try {
            await this.callEntityService("homeassistant", "toggle", moduleResolvedEntityId);
          } catch (lightToggleError) {
            renderLightVisual({
              isOn: previousLightIsOn
            });
            this.options.onError?.(lightToggleError);
          } finally {
            isLightTogglePending = false;
            lightVisualButton.removeAttribute("aria-busy");
          }
        });
        lightDetailsControls = this.createLightDetailsControls(
          moduleResolvedEntityId,
          moduleCurrentState,
          {
            interactive: !popupPreviewMode,
            onTurnOn: () => {
              renderLightVisual({
                isOn: true
              });
            },
            onVisualChange: renderLightVisual
          }
        );
        popupCleanupCallbacks.push(() => lightDetailsControls?.cleanupLightDetails?.());
        registerPopupStateHandler(moduleResolvedEntityId, lightStateUpdate => {
          renderLightVisual(lightStateUpdate);
          lightDetailsControls?.syncLightState?.(lightStateUpdate);
        });
        popupModuleElement.append(lightDetailsControls);
      } else if (
        resolvedPopupModule.type === "climate" ||
        resolvedPopupModule.type === "water-heater"
      ) {
        popupModuleElement.classList.add("hb-custom-popup-module--climate");
        const popupClimateDeviceType =
          resolvedPopupModule.type === "water-heater"
            ? "water-heater"
            : resolveClimateDeviceType(
                {
                  properties: {
                    deviceType:
                      resolvedPopupModule.deviceType ||
                      resolvedPopupModule.properties?.deviceType ||
                      "auto",
                    label: resolvedPopupModule.title || ""
                  }
                },
                moduleCurrentState,
                moduleResolvedEntityId
              );
        let popupClimateState = moduleCurrentState;
        const popupClimateLabelContext = {
          entityId: moduleResolvedEntityId,
          entityMetadata: this.entityMetadata,
          entityTranslations: this.entityTranslations
        };
        const climateVisualButton = document.createElement("button");
        climateVisualButton.type = "button";
        climateVisualButton.className = "hb-climate-visual hb-custom-climate-visual";
        climateVisualButton.classList.toggle(
          "is-bath-heater",
          popupClimateDeviceType === "bath-heater"
        );
        climateVisualButton.classList.toggle(
          "is-water-heater",
          popupClimateDeviceType === "water-heater"
        );
        if (popupClimateDeviceType === "water-heater") {
          deviceDropEntries.push({
            visual: climateVisualButton,
            distance: 168,
            delay: 100 + moduleIndex * 45
          });
        }
        climateVisualButton.inert = popupPreviewMode;
        climateVisualButton.setAttribute("aria-disabled", String(popupPreviewMode));
        const climateUnitElement = document.createElement("div");
        climateUnitElement.className = "hb-climate-visual-unit";
        const climateBrandElement = document.createElement("span");
        climateBrandElement.className = "hb-climate-visual-brand";
        climateBrandElement.textContent =
          popupClimateDeviceType === "bath-heater"
            ? "BATH HEATER"
            : popupClimateDeviceType === "water-heater"
              ? "SMART WATER"
              : "SMART AIR";
        const climateDisplayElement = document.createElement("strong");
        climateDisplayElement.className = "hb-climate-visual-display";
        const climateVentElement = document.createElement("div");
        climateVentElement.className = "hb-climate-visual-vent";
        for (let climateVentIndex = 0; climateVentIndex < 5; climateVentIndex += 1) {
          climateVentElement.append(document.createElement("i"));
        }
        climateUnitElement.append(climateBrandElement, climateDisplayElement, climateVentElement);
        const climateAirflowElement = document.createElement("div");
        climateAirflowElement.className = "hb-climate-visual-airflow";
        for (let climateAirflowIndex = 0; climateAirflowIndex < 3; climateAirflowIndex += 1) {
          climateAirflowElement.append(document.createElement("i"));
        }
        climateVisualButton.append(climateUnitElement, climateAirflowElement);
        /**
         * 渲染弹窗里气候控件的可视化状态（开关态、运行态、目标温度与主题色）。
         * 参数用对象解构并带默认值：调用方（能力控件的 onVisualChange 回调）在部分字段缺失时
         * 也能安全调用，缺省即视为 off；浴霸没有开关概念，用 airflow 模式判定高亮。
         */
        const renderPopupClimateVisual = ({
          mode: climateMode = "off",
          visualMode: climateVisualMode = "off",
          running: climateRunning = false,
          accentColor: climateAccentColor = paletteColor("--hos-sensor", "#9eb0c4"),
          targetTemperature: climateTargetTemperature
        } = {}) => {
          const isClimateVisualOn = climateVisualMode !== "off";
          climateVisualButton.classList.toggle("is-on", isClimateVisualOn);
          climateVisualButton.classList.toggle("is-running", climateRunning);
          climateVisualButton.classList.toggle(
            "is-airflow-mode",
            popupClimateDeviceType === "bath-heater" &&
              isClimateVisualOn &&
              bathHeaterModeUsesAirflow(climateMode)
          );
          climateVisualButton.dataset.visualMode = climateVisualMode;
          climateVisualButton.style.setProperty("--hb-climate-visual-accent", climateAccentColor);
          const hasTargetTemperature =
            climateTargetTemperature != null &&
            climateTargetTemperature !== "" &&
            Number.isFinite(Number(climateTargetTemperature));
          climateDisplayElement.textContent = isClimateVisualOn
            ? hasTargetTemperature
              ? Number(climateTargetTemperature) + "°"
              : climateModeLabel(climateMode, popupClimateDeviceType, popupClimateLabelContext)
            : "OFF";
          if (popupClimateDeviceType === "bath-heater") {
            climateVisualButton.setAttribute(
              "aria-label",
              popupModuleTitleElement.textContent + "，点击切换浴霸灯"
            );
          } else {
            climateVisualButton.setAttribute("aria-pressed", String(isClimateVisualOn));
            climateVisualButton.setAttribute(
              "aria-label",
              "" +
                popupModuleTitleElement.textContent +
                (isClimateVisualOn ? "已开启，点击关闭" : "已关闭，点击开启")
            );
          }
        };
        const popupClimateControls = this.createClimateDetailsControls(
          moduleResolvedEntityId,
          moduleCurrentState,
          {
            interactive: !popupPreviewMode,
            deviceType: popupClimateDeviceType,
            onVisualChange: ({
              mode: visualModeUpdate,
              visualMode: visualModeChange,
              running: runningUpdate,
              accentColor: accentColorUpdate,
              accentSoft: accentSoftColorUpdate,
              targetTemperature: targetTemperatureUpdate
            }) => {
              popupModuleStatusElement.textContent = climateModeLabel(
                visualModeUpdate,
                popupClimateDeviceType,
                popupClimateLabelContext
              );
              popupModuleStatusElement.classList.toggle("is-live", visualModeChange !== "off");
              popupModuleStatusElement.classList.toggle("is-running", runningUpdate);
              popupModuleStatusElement.style.setProperty("--hb-climate-accent", accentColorUpdate);
              popupModuleStatusElement.style.setProperty(
                "--hb-climate-accent-soft",
                accentSoftColorUpdate
              );
              renderPopupClimateVisual({
                mode: visualModeUpdate,
                visualMode: visualModeChange,
                running: runningUpdate,
                accentColor: accentColorUpdate,
                targetTemperature: targetTemperatureUpdate
              });
            }
          }
        );
        popupCleanupCallbacks.push(() => popupClimateControls.cleanupClimateDetails?.());
        const bathHeaterLightRoleId =
          popupClimateDeviceType === "bath-heater" ? moduleDeviceProfile?.roles?.light : "";
        const bathHeaterLightEntity = bathHeaterLightRoleId
          ? this.entityMetadata.get(bathHeaterLightRoleId)
          : popupClimateDeviceType === "bath-heater"
            ? relatedDeviceDomainEntity(this.entityMetadata, moduleResolvedEntityId, "light")
            : null;
        let bathHeaterLightControl = null;
        if (bathHeaterLightEntity?.entityId) {
          const bathHeaterLightState = this.states.get(bathHeaterLightEntity.entityId);
          const bathHeaterLightResolvedState = resolveStateEntry(bathHeaterLightState, {
            state: "unknown",
            attributes: {}
          });
          bathHeaterLightControl = this.createBathHeaterLightControl(
            bathHeaterLightEntity.entityId,
            bathHeaterLightResolvedState,
            {
              interactive: !popupPreviewMode,
              onStateChange: ({ isOn: lightIsOn, unavailable: lightIsUnavailable }) => {
                climateVisualButton.classList.toggle(
                  "is-light-on",
                  lightIsOn && !lightIsUnavailable
                );
                climateVisualButton.setAttribute(
                  "aria-pressed",
                  String(lightIsOn && !lightIsUnavailable)
                );
              }
            }
          );
          popupClimateControls.append(bathHeaterLightControl);
          registerPopupStateHandler(bathHeaterLightEntity.entityId, bathLightStateUpdate =>
            bathHeaterLightControl.syncBathLightState?.(bathLightStateUpdate)
          );
        }
        const climateControlChildren = Array.from(popupClimateControls.children);
        const thermostatControlElement = climateControlChildren.find(thermostatChild =>
          thermostatChild.classList.contains("hb-climate-thermostat")
        );
        const fanSliderControlElement = climateControlChildren.find(childNode =>
          childNode.classList.contains("hb-climate-fan-slider")
        );
        const climateLeftColumnElement = document.createElement("div");
        climateLeftColumnElement.className = "hb-custom-climate-left";
        const climateRightColumnElement = document.createElement("div");
        climateRightColumnElement.className = "hb-custom-climate-right";
        if (thermostatControlElement) {
          climateLeftColumnElement.append(thermostatControlElement);
        }
        if (fanSliderControlElement) {
          climateLeftColumnElement.append(fanSliderControlElement);
        }
        climateRightColumnElement.append(
          climateVisualButton,
          ...climateControlChildren.filter(
            remainingChild =>
              remainingChild !== thermostatControlElement &&
              remainingChild !== fanSliderControlElement
          )
        );
        const hasPrimaryClimateControls = !!thermostatControlElement || !!fanSliderControlElement;
        popupClimateControls.classList.toggle(
          "without-primary-controls",
          !hasPrimaryClimateControls
        );
        popupClimateControls.replaceChildren(
          ...(hasPrimaryClimateControls
            ? [climateLeftColumnElement, climateRightColumnElement]
            : [climateRightColumnElement])
        );
        let isClimateTogglePending = false;
        climateVisualButton.addEventListener("click", async () => {
          if (popupClimateDeviceType === "bath-heater") {
            if (bathHeaterLightControl?.toggleBathLight) {
              await bathHeaterLightControl.toggleBathLight();
            } else {
              this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
            }
            return;
          }
          if (popupPreviewMode || isClimateTogglePending) {
            return;
          }
          isClimateTogglePending = true;
          climateVisualButton.setAttribute("aria-busy", "true");
          const previousClimateState = popupClimateState;
          const isClimatePowered = climateIsPoweredOn(previousClimateState, popupClimateDeviceType);
          const climateTargetMode =
            popupClimateControls.dataset.lastClimateMode ||
            (isClimatePowered ? previousClimateState.state : "auto");
          const optimisticClimateState = {
            state: isClimatePowered ? "off" : climateTargetMode,
            attributes: {
              ...(previousClimateState?.attributes || {}),
              hvac_action: isClimatePowered ? "off" : climateTargetMode
            }
          };
          popupClimateState = optimisticClimateState;
          popupClimateControls.syncClimateState?.(optimisticClimateState);
          try {
            const climatePowerRequest = climatePowerCommand(
              moduleResolvedEntityId,
              previousClimateState,
              !isClimatePowered,
              popupClimateDeviceType,
              popupClimateControls.dataset.lastClimateMode || ""
            );
            await this.callEntityService(
              climatePowerRequest.domain,
              climatePowerRequest.service,
              moduleResolvedEntityId,
              climatePowerRequest.data
            );
          } catch (climateToggleError) {
            popupClimateState = previousClimateState;
            popupClimateControls.syncClimateState?.(previousClimateState);
            this.options.onError?.(climateToggleError);
          } finally {
            isClimateTogglePending = false;
            climateVisualButton.removeAttribute("aria-busy");
          }
        });
        registerPopupStateHandler(moduleResolvedEntityId, climateStateUpdate => {
          popupClimateState = climateStateUpdate;
          popupClimateControls.syncClimateState?.(climateStateUpdate);
        });
        popupModuleElement.append(popupClimateControls);
      } else if (resolvedPopupModule.type === "cover") {
        let popupCoverState = moduleCurrentState;
        const coverAttributes = moduleCurrentState?.attributes || {};
        const isAirerCover = coverComponentIsAirer(
          resolvedPopupModule,
          moduleResolvedEntityId,
          moduleCurrentState,
          this.entityMetadata,
          this.deviceMetadata
        );
        const coverSupportedFeatures = Number(coverAttributes.supported_features || 0);
        const coverIdentityText =
          moduleResolvedEntityId +
          " " +
          (coverAttributes.friendly_name || "") +
          " " +
          (resolvedPopupModule.title || "");
        const supportsCoverTilt =
          Number.isFinite(Number(coverAttributes.current_tilt_position)) ||
          !!(coverSupportedFeatures & 240);
        const isDreamCurtainName = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(
          coverIdentityText
        );
        const coverKind = ["standard", "dream", "airer"].includes(
          resolvedPopupModule.properties?.coverKind
        )
          ? resolvedPopupModule.properties.coverKind
          : "auto";
        const isDreamCurtainCover =
          !isAirerCover &&
          (coverKind === "dream" ||
            (coverKind === "auto" && (supportsCoverTilt || isDreamCurtainName)));
        const airerLightEntityId =
          (isAirerCover
            ? relatedAirerLightEntity(this.entityMetadata, moduleResolvedEntityId)
            : null
          )?.entityId || "";
        const airerLightStateRecord = airerLightEntityId
          ? this.states.get(airerLightEntityId)
          : null;
        let airerLightState = resolveStateEntry(airerLightStateRecord);
        const airerPositionEntityId =
          (isAirerCover
            ? relatedAirerPositionNumberEntity(this.entityMetadata, moduleResolvedEntityId)
            : null
          )?.entityId || "";
        const airerPositionStateRecord = this.states.get(airerPositionEntityId);
        const airerPositionState =
          resolveStateEntry(airerPositionStateRecord);
        const airerCurrentPositionEntityId =
          (isAirerCover
            ? relatedAirerCurrentPositionSensor(this.entityMetadata, moduleResolvedEntityId)
            : null
          )?.entityId || "";
        const airerMotorSpeedEntityId =
          (isAirerCover
            ? relatedAirerMotorSpeedSensor(this.entityMetadata, moduleResolvedEntityId)
            : null
          )?.entityId || "";
        const airerMotorSpeedStateRecord = this.states.get(airerMotorSpeedEntityId);
        const airerMotorSpeedState =
          resolveStateEntry(airerMotorSpeedStateRecord);
        const airerMotorActionEntities = isAirerCover
          ? relatedAirerMotorActionEntities(this.entityMetadata, moduleResolvedEntityId)
          : {};
        const airerActionEntityIds = Object.fromEntries(
          Object.entries(airerMotorActionEntities).map(([actionName, actionEntity]) => [
            actionName,
            actionEntity?.entityId || ""
          ])
        );
        const airerFeedbackStateRecord = this.states.get(
          airerCurrentPositionEntityId || airerPositionEntityId
        );
        const airerFeedbackState =
          resolveStateEntry(airerFeedbackStateRecord);
        const supportsCoverTiltControl = isDreamCurtainCover && supportsCoverTilt;
        const coverMotorIsReversed = coverMotorIsReversedForComponent(resolvedPopupModule);
        const closeCoverService = coverMotorIsReversed ? "open_cover" : "close_cover";
        const openCoverService = coverMotorIsReversed ? "close_cover" : "open_cover";
        const coverDirection = ["left", "right"].includes(
          resolvedPopupModule.properties?.coverDirection
        )
          ? resolvedPopupModule.properties.coverDirection
          : "split";
        const coverLayoutElement = document.createElement("div");
        coverLayoutElement.className = "hb-custom-cover-layout";
        const coverVisualButton = document.createElement("button");
        coverVisualButton.type = "button";
        coverVisualButton.className = "hb-cover-visual hb-custom-cover-visual";
        coverVisualButton.inert = popupPreviewMode;
        coverVisualButton.setAttribute("aria-disabled", String(popupPreviewMode));
        const coverRailElement = document.createElement("i");
        coverRailElement.className = "hb-cover-visual-rail";
        const coverLeftPanelElement = document.createElement("i");
        coverLeftPanelElement.className = "hb-cover-visual-panel left";
        const coverRightPanelElement = document.createElement("i");
        coverRightPanelElement.className = "hb-cover-visual-panel right";
        const coverSlatsElement = document.createElement("span");
        coverSlatsElement.className = "hb-cover-visual-slats";
        const coverSlatCount = 13;
        for (let slatIndex = 0; slatIndex < coverSlatCount; slatIndex += 1) {
          const coverSlatElement = document.createElement("span");
          coverSlatElement.className = "hb-cover-visual-slat";
          const coverSlatInnerElement = document.createElement("i");
          coverSlatElement.style.setProperty("--hb-cover-slat-index", String(slatIndex));
          const slatDelayIndex =
            coverDirection === "right"
              ? coverSlatCount - 1 - slatIndex
              : coverDirection === "split"
                ? Math.abs((coverSlatCount - 1) / 2 - slatIndex)
                : slatIndex;
          coverSlatElement.style.setProperty("--hb-cover-slat-delay-index", String(slatDelayIndex));
          const slatShiftPx =
            coverDirection === "left"
              ? -slatIndex * 14.5
              : coverDirection === "right"
                ? (coverSlatCount - 1 - slatIndex) * 14.5
                : slatIndex <= (coverSlatCount - 1) / 2
                  ? -slatIndex * 14.5
                  : (coverSlatCount - 1 - slatIndex) * 14.5;
          coverSlatElement.style.setProperty("--hb-cover-retracted-shift", slatShiftPx + "px");
          coverSlatElement.append(coverSlatInnerElement);
          coverSlatsElement.append(coverSlatElement);
        }
        const coverWindowElement = document.createElement("i");
        coverWindowElement.className = "hb-cover-visual-window";
        coverVisualButton.classList.toggle("is-dream", isDreamCurtainCover);
        coverVisualButton.classList.toggle("is-airer", isAirerCover);
        coverVisualButton.classList.add("direction-" + coverDirection);
        coverVisualButton.append(
          coverWindowElement,
          coverRailElement,
          coverLeftPanelElement,
          coverRightPanelElement,
          coverSlatsElement
        );
        if (isAirerCover) {
          appendAirerVisual(coverVisualButton);
        }
        /**
         * 同步晾衣机顶灯状态（仅晾衣机形态生效），非晾衣机直接返回。
         * 晾衣机下整块可视化本身就是灯的开关按钮，故灯实体不可用时要置按钮 disabled 并给出
         * 对应的无障碍文案。
         */
        const renderAirerLightState = (airerLightNextState = airerLightState) => {
          if (!isAirerCover) {
            return;
          }
          airerLightState = airerLightNextState || airerLightState;
          const isAirerLightUnavailable =
            !airerLightEntityId ||
            ["unknown", "unavailable"].includes(String(airerLightState?.state || "unknown"));
          const isAirerLightOn = airerLightState?.state === "on";
          coverVisualButton.classList.toggle(
            "is-light-on",
            isAirerLightOn && !isAirerLightUnavailable
          );
          coverVisualButton.classList.toggle("is-light-unavailable", isAirerLightUnavailable);
          coverVisualButton.disabled = popupPreviewMode || isAirerLightUnavailable;
          coverVisualButton.setAttribute(
            "aria-pressed",
            String(isAirerLightOn && !isAirerLightUnavailable)
          );
          coverVisualButton.setAttribute(
            "aria-label",
            isAirerLightUnavailable
              ? "晾衣机灯光实体不可用"
              : "晾衣机灯光" + (isAirerLightOn ? "已开启，点击关闭" : "已关闭，点击开启")
          );
        };
        renderAirerLightState();
        let coverPositionPercent = 0;
        const airerCalibration = airerPositionCalibration(
          this.entityMetadata,
          this.deviceMetadata,
          moduleResolvedEntityId
        );
        /**
         * 渲染窗帘 / 晾衣机可视化：开合位置、叶片角度、帘幕位移与状态文案。
         * 位置 0~100 映射到一组 CSS 变量（开合比、单 / 双面板宽度、叶片角度、晾衣机下移量），面板宽度用线性式 拟合以免在样式层写分段函数。「物理状态」与「展示状态」分开算：电机接反时两者相反，所以 open / opening
         * 一律用 physicalCoverState 归一后再判高亮，保证位置与图标方向始终一致。
         */
        const renderPopupCoverVisual = ({
          position: coverTargetPosition = 0,
          state: coverStateText = ""
        } = {}) => {
          const coverPositionValue = Math.max(0, Math.min(100, Number(coverTargetPosition) || 0));
          const coverDisplayState = coverPresentationState(
            {
              state: coverStateText,
              attributes: {
                current_position: coverPositionValue
              }
            },
            coverMotorIsReversed
          );
          const resolvedPhysicalState = physicalCoverState(
            coverStateText || popupCoverState?.state,
            coverMotorIsReversed
          );
          const isCoverOpeningOrOpen =
            resolvedPhysicalState === "open" || resolvedPhysicalState === "opening";
          coverPositionPercent = coverPositionValue;
          coverVisualButton.style.setProperty("--hb-cover-open-position", coverPositionValue + "%");
          coverVisualButton.style.setProperty(
            "--hb-airer-drop",
            airerVisualDrop(coverPositionValue) + "px"
          );
          coverVisualButton.style.setProperty(
            "--hb-cover-panel-width",
            45.9 - coverPositionValue * 0.331 + "%"
          );
          coverVisualButton.style.setProperty(
            "--hb-cover-single-panel-width",
            91.8 - coverPositionValue * 0.79 + "%"
          );
          coverVisualButton.style.setProperty(
            "--hb-cover-slat-angle",
            coverPositionValue * 1.8 + "deg"
          );
          coverVisualButton.classList.toggle("is-tilt-reversed", coverPositionValue > 50);
          coverVisualButton.classList.toggle(
            "is-tilt-center",
            Math.abs(coverPositionValue - 50) <= 2
          );
          coverVisualButton.classList.toggle(
            "is-open",
            isDreamCurtainCover
              ? isCoverOpeningOrOpen
              : coverDisplayState === "open" || coverDisplayState === "opening"
          );
          coverVisualButton.classList.toggle(
            "is-moving",
            coverStateText === "opening" || coverStateText === "closing"
          );
          coverVisualButton.setAttribute(
            "aria-pressed",
            String(
              isDreamCurtainCover
                ? isCoverOpeningOrOpen
                : coverDisplayState === "open" || coverDisplayState === "opening"
            )
          );
          if (isAirerCover) {
            popupModuleStatusElement.textContent =
              airerPositionLabel(coverDisplayState) || Math.round(coverPositionValue) + "%";
          } else if (isDreamCurtainCover) {
            popupModuleStatusElement.textContent = dreamCurtainStatusText(
              coverStateText || popupCoverState?.state,
              coverPositionValue,
              coverMotorIsReversed
            );
          } else {
            popupModuleStatusElement.textContent =
              {
                open: "已打开",
                closed: "已关闭",
                opening: "正在打开",
                closing: "正在关闭"
              }[coverDisplayState] || Math.round(coverPositionValue) + "%";
          }
          popupModuleStatusElement.classList.toggle(
            "is-live",
            isDreamCurtainCover
              ? isCoverOpeningOrOpen
              : coverDisplayState === "open" || coverDisplayState === "opening"
          );
          if (!isAirerCover) {
            coverVisualButton.setAttribute(
              "aria-label",
              isDreamCurtainCover
                ? "" +
                    popupModuleTitleElement.textContent +
                    dreamCurtainStatusText(
                      coverStateText || popupCoverState?.state,
                      coverPositionValue,
                      coverMotorIsReversed
                    )
                : "" +
                    popupModuleTitleElement.textContent +
                    (coverDisplayState === "open" || coverDisplayState === "opening"
                      ? "已打开，点击关闭"
                      : "已关闭，点击打开")
            );
          }
        };
        const popupCoverControls = this.createCoverDetailsControls(
          moduleResolvedEntityId,
          moduleCurrentState,
          {
            interactive: !popupPreviewMode,
            dream: isDreamCurtainCover,
            airer: isAirerCover,
            tilt: supportsCoverTiltControl,
            motorReversed: coverMotorIsReversed,
            positionState: airerFeedbackState,
            positionCommandEntityId: airerPositionEntityId,
            positionCommandState: airerPositionState,
            motorState: airerMotorSpeedState,
            airerActionEntityIds: airerActionEntityIds,
            positionCalibration: airerCalibration,
            onVisualChange: renderPopupCoverVisual,
            onCurtainPositionChange: ({
              retracted: curtainIsRetracted,
              moving: curtainIsMoving
            }) => {
              coverVisualButton.classList.toggle("is-curtain-retracted", curtainIsRetracted);
              coverVisualButton.classList.toggle("is-curtain-moving", curtainIsMoving);
              coverVisualButton.dataset.curtainRetracted = String(curtainIsRetracted);
              if (isDreamCurtainCover) {
                popupModuleStatusElement.textContent = dreamCurtainStatusFromRetraction(
                  curtainIsRetracted,
                  curtainIsMoving,
                  coverPositionPercent
                );
                popupModuleStatusElement.classList.toggle("is-live", curtainIsRetracted);
              }
            }
          }
        );
        let isCoverTogglePending = false;
        coverVisualButton.addEventListener("click", async () => {
          if (popupPreviewMode || isCoverTogglePending) {
            return;
          }
          isCoverTogglePending = true;
          coverVisualButton.setAttribute("aria-busy", "true");
          if (isAirerCover) {
            const previousAirerLightState = airerLightState;
            renderAirerLightState({
              ...(airerLightState || {}),
              state: airerLightState?.state === "on" ? "off" : "on"
            });
            try {
              await this.callEntityService("homeassistant", "toggle", airerLightEntityId);
            } catch (airerLightToggleError) {
              renderAirerLightState(previousAirerLightState);
              this.options.onError?.(airerLightToggleError);
            } finally {
              isCoverTogglePending = false;
              coverVisualButton.removeAttribute("aria-busy");
            }
            return;
          }
          const previousCoverPosition = coverPositionPercent;
          const isCurtainRetractedNow =
            popupCoverControls.isDreamCurtainRetracted?.() ??
            coverVisualButton.dataset.curtainRetracted === "true";
          const shouldCloseCover = previousCoverPosition > COVER_POSITION_EPSILON_PERCENT;
          if (isDreamCurtainCover) {
            popupCoverControls.beginDreamCurtainMotion?.(!isCurtainRetractedNow);
          } else {
            popupCoverControls.beginCoverMotion?.(
              shouldCloseCover ? 0 : 100,
              shouldCloseCover ? "closing" : "opening"
            );
          }
          try {
            await this.callEntityService(
              "cover",
              isDreamCurtainCover
                ? dreamCurtainToggleService(
                    isCurtainRetractedNow,
                    openCoverService,
                    closeCoverService
                  )
                : shouldCloseCover
                  ? closeCoverService
                  : openCoverService,
              moduleResolvedEntityId
            );
          } catch (coverToggleError) {
            if (isDreamCurtainCover) {
              popupCoverControls.cancelDreamCurtainMotion?.();
              popupCoverControls.setDreamCurtainRetracted?.(isCurtainRetractedNow, false);
            } else {
              popupCoverControls.cancelCoverMotion?.();
            }
            popupCoverControls.syncCoverState?.(popupCoverState);
            this.options.onError?.(coverToggleError);
          } finally {
            isCoverTogglePending = false;
            coverVisualButton.removeAttribute("aria-busy");
          }
        });
        registerPopupStateHandler(moduleResolvedEntityId, coverStateUpdate => {
          popupCoverState = coverStateUpdate;
          popupCoverControls.syncCoverState?.(coverStateUpdate);
        });
        if (airerLightEntityId) {
          registerPopupStateHandler(airerLightEntityId, renderAirerLightState);
        }
        if (airerCurrentPositionEntityId) {
          registerPopupStateHandler(airerCurrentPositionEntityId, positionSensorUpdate =>
            popupCoverControls.syncCoverPositionState?.(positionSensorUpdate)
          );
        }
        if (airerPositionEntityId) {
          registerPopupStateHandler(airerPositionEntityId, positionCommandUpdate => {
            popupCoverControls.syncCoverPositionCommandState?.(positionCommandUpdate);
            if (!airerCurrentPositionEntityId) {
              popupCoverControls.syncCoverPositionState?.(positionCommandUpdate);
            }
          });
        }
        if (airerMotorSpeedEntityId) {
          registerPopupStateHandler(airerMotorSpeedEntityId, motorSpeedUpdate =>
            popupCoverControls.syncAirerMotorState?.(motorSpeedUpdate)
          );
        }
        popupCleanupCallbacks.push(() => popupCoverControls.cleanupCoverDetails?.());
        coverLayoutElement.append(coverVisualButton, popupCoverControls);
        popupModuleElement.append(coverLayoutElement);
      } else if (resolvedPopupModule.type === "air-purifier") {
        let popupAirPurifierState = moduleCurrentState || {
          entityId: moduleResolvedEntityId,
          state: "unknown",
          attributes: {}
        };
        const airPurifierVisualButton = document.createElement("button");
        airPurifierVisualButton.type = "button";
        airPurifierVisualButton.className = "hb-air-purifier-visual hb-custom-air-purifier-visual";
        airPurifierVisualButton.inert = popupPreviewMode;
        airPurifierVisualButton.setAttribute("aria-disabled", String(popupPreviewMode));
        const airPurifierAuraElement = document.createElement("i");
        airPurifierAuraElement.className = "hb-air-purifier-visual-aura";
        const airPurifierAirflowElement = document.createElement("span");
        airPurifierAirflowElement.className = "hb-air-purifier-visual-airflow";
        for (
          let airPurifierAirflowIndex = 0;
          airPurifierAirflowIndex < 4;
          airPurifierAirflowIndex += 1
        ) {
          airPurifierAirflowElement.append(document.createElement("i"));
        }
        const airPurifierBodyElement = document.createElement("span");
        airPurifierBodyElement.className = "hb-air-purifier-visual-body";
        const airPurifierTopElement = document.createElement("i");
        airPurifierTopElement.className = "hb-air-purifier-visual-top";
        const airPurifierVentElement = document.createElement("i");
        airPurifierVentElement.className = "hb-air-purifier-visual-vent";
        const airPurifierDisplayElement = document.createElement("span");
        airPurifierDisplayElement.className = "hb-air-purifier-visual-display";
        const airPurifierDisplayValueElement = document.createElement("strong");
        airPurifierDisplayElement.append(airPurifierDisplayValueElement);
        airPurifierBodyElement.append(
          airPurifierTopElement,
          airPurifierVentElement,
          airPurifierDisplayElement
        );
        airPurifierVisualButton.append(
          airPurifierAuraElement,
          airPurifierAirflowElement,
          airPurifierBodyElement
        );
        const airPurifierDetailsControls = this.createCapabilityDetailsControls(
          moduleResolvedEntityId,
          popupAirPurifierState,
          {
            interactive: !popupPreviewMode,
            variant: "air-purifier"
          }
        );
        const airPurifierLayoutElement = document.createElement("div");
        airPurifierLayoutElement.className = "hb-air-purifier-layout hb-custom-air-purifier-layout";
        const airPurifierSummaryElement = document.createElement("section");
        airPurifierSummaryElement.className = "hb-air-purifier-summary";
        const airPurifierGaugeWrapElement = document.createElement("div");
        airPurifierGaugeWrapElement.className = "hb-air-purifier-gauge-wrap";
        const airPurifierGaugeElement = document.createElement("div");
        airPurifierGaugeElement.className = "hb-air-purifier-gauge is-quality";
        const airPurifierGaugeOrbitElement = document.createElement("i");
        airPurifierGaugeOrbitElement.className = "hb-air-purifier-gauge-orbit";
        const airPurifierArcStartElement = document.createElement("i");
        airPurifierArcStartElement.className = "hb-air-purifier-arc-cap start";
        const airPurifierArcEndElement = document.createElement("i");
        airPurifierArcEndElement.className = "hb-air-purifier-arc-cap end";
        const airPurifierGaugeContentElement = document.createElement("div");
        airPurifierGaugeContentElement.className = "hb-air-purifier-gauge-content";
        const airPurifierGaugeLabelElement = document.createElement("small");
        airPurifierGaugeLabelElement.textContent = "室内空气质量";
        const airPurifierQualityValueElement = document.createElement("strong");
        const airPurifierQualityTextElement = document.createElement("span");
        const airPurifierStatusTextElement = document.createElement("span");
        airPurifierStatusTextElement.textContent = "设备状态 --";
        airPurifierQualityValueElement.append(airPurifierQualityTextElement);
        airPurifierGaugeContentElement.append(
          airPurifierGaugeLabelElement,
          airPurifierQualityValueElement,
          airPurifierStatusTextElement
        );
        airPurifierGaugeElement.append(
          airPurifierArcStartElement,
          airPurifierArcEndElement,
          airPurifierGaugeContentElement
        );
        airPurifierGaugeWrapElement.append(airPurifierGaugeOrbitElement, airPurifierGaugeElement);
        const airPurifierControlsPaneElement = document.createElement("section");
        airPurifierControlsPaneElement.className = "hb-air-purifier-controls-pane";
        airPurifierControlsPaneElement.append(airPurifierDetailsControls);
        const airPurifierMetricLabels = {
          pm25: "PM2.5",
          pm10: "PM10",
          filterLife: "滤芯寿命",
          filterLeftTime: "滤芯剩余时间",
          hcho: "甲醛",
          temperature: "温度",
          humidity: "湿度"
        };
        const airPurifierMetricDefinitions = [
          {
            role: "pm25",
            ids: [moduleDeviceProfile?.roles?.pm25]
          },
          {
            role: "pm10",
            ids: [moduleDeviceProfile?.roles?.pm10]
          },
          {
            role: "filterLife",
            ids: [
              moduleDeviceProfile?.roles?.filterLife,
              moduleDeviceProfile?.roles?.filterLeftTime
            ]
          },
          {
            role: "hcho",
            ids: [moduleDeviceProfile?.roles?.hcho]
          },
          {
            role: "temperature",
            ids: [moduleDeviceProfile?.roles?.temperature]
          },
          {
            role: "humidity",
            ids: [moduleDeviceProfile?.roles?.humidity]
          }
        ].map(airMetricDefinition => ({
          ...airMetricDefinition,
          ids: airMetricDefinition.ids.filter(Boolean)
        }));
        /**
         * 取实体状态记录：优先返回状态更新里的 newState，退回缓存的整条记录。
         */
        const getEntityStateRecord = entityId => {
          const entityStateRecord = this.states.get(entityId);
          return resolveStateEntry(entityStateRecord);
        };
        /**
         * 判断实体是否处于「有可读数值」的状态。
         * 离线实体的 state 是 "unknown"/"unavailable" 字符串，Number() 会得到 NaN，因此先排除哨兵值再判 isFinite；用于在多个候选实体里挑真正在上报数据的那个。
         * @returns {boolean} 状态存在、不是哨兵值且可解析为有限数时为 true。
         */
        const hasNumericEntityState = stateEntityId => {
          const entityStateValue = getEntityStateRecord(stateEntityId);
          return (
            entityStateValue &&
            !["unknown", "unavailable"].includes(
              String(entityStateValue.state || "").toLowerCase()
            ) &&
            Number.isFinite(Number(entityStateValue.state))
          );
        };
        const airPurifierMetrics = airPurifierMetricDefinitions
          .map(airMetricItem => ({
            ...airMetricItem,
            id:
              airMetricItem.ids.find(candidateEntityId =>
                hasNumericEntityState(candidateEntityId)
              ) ||
              airMetricItem.ids.find(fallbackEntityId => this.entityMetadata.has(fallbackEntityId))
          }))
          .filter(metricWithId => metricWithId.id)
          .slice(0, 3);
        const airPurifierSecondaryMetricsElement = document.createElement("div");
        airPurifierSecondaryMetricsElement.className =
          "hb-air-purifier-secondary-metrics hb-custom-air-purifier-metrics";
        for (const metric of airPurifierMetrics) {
          const metricMetadata = this.entityMetadata.get(metric.id);
          const metricRowElement = document.createElement("div");
          metricRowElement.className =
            "hb-air-purifier-secondary-metric hb-air-purifier-secondary-metric--" + metric.role;
          const metricLabelElement = document.createElement("small");
          metricLabelElement.textContent = airPurifierMetricLabels[metric.role] || metric.role;
          const metricStrongElement = document.createElement("strong");
          metricRowElement.append(metricLabelElement, metricStrongElement);
          airPurifierSecondaryMetricsElement.append(metricRowElement);
          /**
           * 把某个指标实体的状态写进净化器的次要指标行。
           * 单位优先取状态里的 unit_of_measurement，退回实体元数据；unknown/unavailable 显示
           * "--"，避免出现 "unknown ppm" 这类文案。
           */
          const renderMetricValue = metricState => {
            metricStrongElement.textContent = ["unknown", "unavailable"].includes(
              String(metricState?.state || "").toLowerCase()
            )
              ? "--"
              : (
                  (metricState?.state ?? "--") +
                  " " +
                  (metricState?.attributes?.unit_of_measurement ||
                    metricMetadata?.unitOfMeasurement ||
                    "")
                ).trim();
          };
          renderMetricValue(getEntityStateRecord(metric.id));
          registerPopupStateHandler(metric.id, renderMetricValue);
        }
        const airQualityRoleId = moduleDeviceProfile?.roles?.airQuality;
        const pm25RoleId = moduleDeviceProfile?.roles?.pm25;
        /**
         * 渲染净化器空气质量表盘（含无专用空气质量实体时用 PM2.5 分档的兜底）。
         * 文案优先按专用空气质量实体的中英文关键词归类（正则覆盖 excellent / 优 等写法）；
         * 取不到就退回 PM2.5 数值分档：≤15 优、≤35 良、≤75 轻度污染，其余较差。
         */
        const renderAirQualityGauge = () => {
          const airQualityStateValue = getEntityStateRecord(airQualityRoleId);
          const pm25State = getEntityStateRecord(pm25RoleId);
          const airQualityText = ["unknown", "unavailable"].includes(
            String(airQualityStateValue?.state || "").toLowerCase()
          )
            ? ""
            : String(airQualityStateValue?.state || "").trim();
          const pm25Value = Number(pm25State?.state);
          const airQualityKey = airQualityText.toLowerCase();
          let airQualityLabel = airQualityText;
          let airQualityGrade = "unknown";
          if (/excellent|优/.test(airQualityKey)) {
            airQualityGrade = "excellent";
          } else if (/good|良/.test(airQualityKey)) {
            airQualityGrade = "good";
          } else if (/moderate|fair|一般|轻度|污染/.test(airQualityKey)) {
            airQualityGrade = "warning";
          } else if (/poor|unhealthy|较差|中度|重度|严重/.test(airQualityKey)) {
            airQualityGrade = "poor";
          } else if (Number.isFinite(pm25Value)) {
            airQualityGrade =
              pm25Value <= 15
                ? "excellent"
                : pm25Value <= 35
                  ? "good"
                  : pm25Value <= 75
                    ? "warning"
                    : "poor";
            airQualityLabel = {
              excellent: "空气优",
              good: "空气良",
              warning: "轻度污染",
              poor: "空气较差"
            }[airQualityGrade];
          }
          airPurifierQualityTextElement.textContent = airQualityLabel || "--";
          airPurifierGaugeElement.style.setProperty(
            "--hb-air-purifier-progress",
            {
              excellent: 72,
              good: 58,
              warning: 42,
              poor: 26,
              unknown: 0
            }[airQualityGrade] + "%"
          );
          airPurifierGaugeElement.classList.toggle("is-warning", airQualityGrade === "warning");
          airPurifierGaugeElement.classList.toggle("is-poor", airQualityGrade === "poor");
          const airQualityColor = airQualityAccent(airQualityGrade);
          const airQualitySoftColor = airQualityAccentSoft(airQualityGrade, 0.14);
          popupModuleElement.style.setProperty("--hb-air-purifier-accent", airQualityColor);
          popupModuleElement.style.setProperty(
            "--hb-air-purifier-accent-soft",
            airQualitySoftColor
          );
        };
        if (airQualityRoleId) {
          registerPopupStateHandler(airQualityRoleId, renderAirQualityGauge);
        }
        if (pm25RoleId && pm25RoleId !== airQualityRoleId) {
          registerPopupStateHandler(pm25RoleId, renderAirQualityGauge);
        }
        renderAirQualityGauge();
        /**
         * 渲染净化器弹窗的开关状态：刷新 ON/OFF 文案、按钮态、表盘运行态与状态文案。
         * 除 unknown/unavailable 外只要不是 off 都视为运行中（fan 实体还可能有 auto 或各档风速，
         * 不能只认 "on"）；参数默认取弹窗缓存状态，便于无参调用时重绘。
         */
        const renderAirPurifierPower = (airPurifierNextState = popupAirPurifierState) => {
          popupAirPurifierState = airPurifierNextState || popupAirPurifierState;
          const airPurifierStateKey = String(popupAirPurifierState?.state || "").toLowerCase();
          const isAirPurifierUnavailable = ["unknown", "unavailable"].includes(airPurifierStateKey);
          const isAirPurifierOn = !isAirPurifierUnavailable && airPurifierStateKey !== "off";
          airPurifierDisplayValueElement.textContent = isAirPurifierOn ? "ON" : "OFF";
          airPurifierVisualButton.classList.toggle("is-on", isAirPurifierOn);
          airPurifierVisualButton.classList.toggle("is-unavailable", isAirPurifierUnavailable);
          airPurifierVisualButton.setAttribute("aria-pressed", String(isAirPurifierOn));
          airPurifierVisualButton.setAttribute(
            "aria-label",
            "" +
              popupModuleTitleElement.textContent +
              (isAirPurifierOn ? "已开启，点击关闭" : "已关闭，点击开启")
          );
          popupModuleStatusElement.textContent = isAirPurifierUnavailable
            ? "当前不可用"
            : isAirPurifierOn
              ? "已开启"
              : "已关闭";
          popupModuleStatusElement.classList.toggle("is-live", isAirPurifierOn);
          airPurifierStatusTextElement.textContent = isAirPurifierUnavailable
            ? "设备不可用"
            : isAirPurifierOn
              ? "净化中"
              : "已关闭";
          airPurifierGaugeElement.classList.toggle("is-running", isAirPurifierOn);
          airPurifierGaugeOrbitElement.classList.toggle("is-running", isAirPurifierOn);
          airPurifierDetailsControls.syncCapabilityState?.(popupAirPurifierState);
        };
        renderAirPurifierPower();
        let isAirPurifierTogglePending = false;
        airPurifierVisualButton.addEventListener("click", async () => {
          if (
            popupPreviewMode ||
            isAirPurifierTogglePending ||
            ["unknown", "unavailable"].includes(
              String(popupAirPurifierState?.state || "").toLowerCase()
            )
          ) {
            return;
          }
          isAirPurifierTogglePending = true;
          airPurifierVisualButton.setAttribute("aria-busy", "true");
          const previousAirPurifierState = popupAirPurifierState;
          const isAirPurifierOff =
            String(previousAirPurifierState?.state || "").toLowerCase() === "off";
          renderAirPurifierPower({
            ...previousAirPurifierState,
            state: isAirPurifierOff ? "on" : "off"
          });
          try {
            await this.callEntityService(
              "fan",
              isAirPurifierOff ? "turn_on" : "turn_off",
              moduleResolvedEntityId
            );
          } catch (airPurifierToggleError) {
            renderAirPurifierPower(previousAirPurifierState);
            this.options.onError?.(airPurifierToggleError);
          } finally {
            isAirPurifierTogglePending = false;
            airPurifierVisualButton.removeAttribute("aria-busy");
          }
        });
        registerPopupStateHandler(moduleResolvedEntityId, renderAirPurifierPower);
        popupModuleHeadingElement.append(airPurifierVisualButton);
        airPurifierSummaryElement.append(
          airPurifierGaugeWrapElement,
          airPurifierSecondaryMetricsElement
        );
        airPurifierLayoutElement.append(airPurifierSummaryElement, airPurifierControlsPaneElement);
        popupModuleElement.append(airPurifierLayoutElement);
      } else if (resolvedPopupModule.type === "media-player") {
        popupModuleTitleElement.textContent = popupModuleDialogTitle(
          resolvedPopupModule,
          moduleCurrentState,
          "媒体"
        );
        popupModuleElement.classList.add("hb-media-player-details");
        const mediaSpeakerElement = document.createElement("div");
        mediaSpeakerElement.className = "hb-media-speaker-visual";
        mediaSpeakerElement.setAttribute("aria-hidden", "true");
        mediaSpeakerVisuals.push(mediaSpeakerElement);
        const mediaSpeakerBodyElement = document.createElement("i");
        mediaSpeakerBodyElement.className = "hb-media-speaker-body";
        const mediaSpeakerArtworkElement = document.createElement("img");
        mediaSpeakerArtworkElement.className = "hb-media-speaker-artwork";
        mediaSpeakerArtworkElement.alt = "";
        mediaSpeakerArtworkElement.hidden = true;
        const mediaSpeakerLightElement = document.createElement("i");
        mediaSpeakerLightElement.className = "hb-media-speaker-light";
        mediaSpeakerElement.append(
          mediaSpeakerBodyElement,
          mediaSpeakerArtworkElement,
          mediaSpeakerLightElement
        );
        popupModuleHeadingElement.append(mediaSpeakerElement);
        const popupMediaBodyElement = document.createElement("div");
        popupMediaBodyElement.className =
          "hb-media-player-details-body hb-custom-media-player-body";
        const mediaNowPlayingElement = document.createElement("section");
        mediaNowPlayingElement.className = "hb-media-player-now-playing";
        const mediaArtworkElement = document.createElement("img");
        mediaArtworkElement.className = "hb-media-player-artwork";
        mediaArtworkElement.alt = "";
        mediaArtworkElement.hidden = true;
        const mediaCopyElement = document.createElement("div");
        mediaCopyElement.className = "hb-media-player-copy";
        const mediaTitleElement = document.createElement("strong");
        const mediaSubtitleElement = document.createElement("span");
        const mediaProgressElement = document.createElement("div");
        mediaProgressElement.className = "hb-media-player-progress";
        mediaProgressElement.hidden = true;
        const mediaProgressBarElement = document.createElement("progress");
        mediaProgressBarElement.max = 1;
        mediaProgressBarElement.value = 0;
        const mediaTimeRowElement = document.createElement("span");
        const mediaElapsedTimeElement = document.createElement("time");
        const mediaDurationTimeElement = document.createElement("time");
        mediaTimeRowElement.append(mediaElapsedTimeElement, mediaDurationTimeElement);
        mediaProgressElement.append(mediaProgressBarElement, mediaTimeRowElement);
        mediaCopyElement.append(mediaTitleElement, mediaSubtitleElement, mediaProgressElement);
        mediaNowPlayingElement.append(mediaArtworkElement, mediaCopyElement);
        const popupMediaActionsElement = document.createElement("div");
        popupMediaActionsElement.className = "hb-media-player-actions";
        /**
         * 创建组合弹窗内媒体模块的动作按钮。
         * 与详情弹窗同款按钮共用一套写法：置灰防连点、失败交给 onError、finally 恢复可用；
         * 预览态只渲染不派发。
         */
        const createPopupMediaActionButton = (buttonLabel, buttonService) => {
          const popupMediaActionButton = document.createElement("button");
          popupMediaActionButton.type = "button";
          popupMediaActionButton.textContent = buttonLabel;
          popupMediaActionButton.addEventListener("click", async () => {
            if (!popupPreviewMode) {
              popupMediaActionButton.disabled = true;
              try {
                await this.callEntityService("media_player", buttonService, moduleResolvedEntityId);
              } catch (popupMediaActionError) {
                this.options.onError?.(popupMediaActionError);
              } finally {
                popupMediaActionButton.disabled = false;
              }
            }
          });
          popupMediaActionsElement.append(popupMediaActionButton);
          return popupMediaActionButton;
        };
        const popupPreviousTrackButton = createPopupMediaActionButton(
          "上一曲",
          "media_previous_track"
        );
        const popupPlayPauseButton = createPopupMediaActionButton("播放", "media_play_pause");
        const popupNextTrackButton = createPopupMediaActionButton("下一曲", "media_next_track");
        const popupMediaBrowserControl = this.createMediaBrowserControl(moduleResolvedEntityId, {
          preview: popupPreviewMode
        });
        popupCleanupCallbacks.push(() => popupMediaBrowserControl.cleanup?.());
        const popupVolumeGroupElement = document.createElement("section");
        popupVolumeGroupElement.className = "hb-capability-range-group";
        const popupVolumeHeadingElement = document.createElement("div");
        popupVolumeHeadingElement.className = "hb-capability-range-heading";
        const volumeLabelElement = document.createElement("strong");
        volumeLabelElement.textContent = "音量";
        const popupVolumeOutputElement = document.createElement("output");
        popupVolumeHeadingElement.append(volumeLabelElement, popupVolumeOutputElement);
        const volumeSliderElement = document.createElement("input");
        volumeSliderElement.type = "range";
        volumeSliderElement.min = "0";
        volumeSliderElement.max = "1";
        volumeSliderElement.step = ".01";
        volumeSliderElement.disabled = popupPreviewMode;
        popupVolumeGroupElement.append(popupVolumeHeadingElement, volumeSliderElement);
        let currentArtworkUrl = "";
        let popupMediaDurationSeconds = null;
        let popupMediaPositionSeconds = 0;
        let popupPositionUpdatedAtMs = null;
        let isPopupMediaPlaying = false;
        let pendingVolumeLevel = null;
        let confirmedVolumeLevel = null;
        let localVolumeLevel = null;
        let queuedVolumeLevel = null;
        let isVolumeRequestPending = false;
        let volumeRetryTimer = null;
        let volumeResyncTimer = null;
        /**
         * 把秒数格式化成 "分:秒" 的播放时间文本。
         */
        const formatMediaTime = timeSeconds => {
          const popupTotalSeconds = Math.max(0, Math.floor(Number(timeSeconds) || 0));
          return (
            Math.floor(popupTotalSeconds / 60) +
            ":" +
            String(popupTotalSeconds % 60).padStart(2, "0")
          );
        };
        /**
         * 渲染组合弹窗媒体模块的播放进度条与时长文本。
         * 与详情弹窗同一套外推逻辑：HA 只给 media_position 快照，播放中须叠加
         * media_position_updated_at 之后流逝的时间；无时长则整块隐藏。
         */
        const renderMediaProgress = () => {
          if (!Number.isFinite(popupMediaDurationSeconds) || popupMediaDurationSeconds <= 0) {
            mediaProgressElement.hidden = true;
            return;
          }
          let elapsedSeconds = Number.isFinite(popupMediaPositionSeconds)
            ? popupMediaPositionSeconds
            : 0;
          if (isPopupMediaPlaying && Number.isFinite(popupPositionUpdatedAtMs)) {
            elapsedSeconds += Math.max(0, (Date.now() - popupPositionUpdatedAtMs) / 1000);
          }
          elapsedSeconds = Math.max(0, Math.min(popupMediaDurationSeconds, elapsedSeconds));
          mediaProgressElement.hidden = false;
          mediaProgressBarElement.max = popupMediaDurationSeconds;
          mediaProgressBarElement.value = elapsedSeconds;
          mediaElapsedTimeElement.textContent = formatMediaTime(elapsedSeconds);
          mediaDurationTimeElement.textContent = formatMediaTime(popupMediaDurationSeconds);
        };
        const mediaProgressTimer = window.setInterval(renderMediaProgress, 1000);
        popupCleanupCallbacks.push(() => {
          window.clearInterval(mediaProgressTimer);
          window.clearTimeout(volumeRetryTimer);
          window.clearTimeout(volumeResyncTimer);
        });
        mediaArtworkElement.addEventListener("error", () => {
          mediaArtworkElement.hidden = true;
          mediaNowPlayingElement.classList.remove("has-artwork");
        });
        mediaArtworkElement.addEventListener("load", () => {
          mediaArtworkElement.hidden = false;
          mediaNowPlayingElement.classList.add("has-artwork");
        });
        mediaSpeakerArtworkElement.addEventListener("error", () => {
          mediaSpeakerArtworkElement.hidden = true;
          mediaSpeakerElement.classList.remove("has-artwork");
        });
        mediaSpeakerArtworkElement.addEventListener("load", () => {
          mediaSpeakerArtworkElement.hidden = false;
          mediaSpeakerElement.classList.add("has-artwork");
        });
        /**
         * 判断两个数值是否在容差 0.005 内相等。
         * 用于区分「HA 已确认刚下发的音量」与「HA 仍在报旧值」，从而决定能否撤掉本地覆盖值。
         */
        const areNumbersClose = (firstNumber, secondNumber) =>
          Number.isFinite(firstNumber) &&
          Number.isFinite(secondNumber) &&
          Math.abs(firstNumber - secondNumber) <= 0.005;
        /**
         * 渲染媒体模块的音量滑杆与百分比文本，音量夹到 0~1。
         */
        const renderPopupVolumeLevel = popupVolumeLevel => {
          pendingVolumeLevel = Math.max(0, Math.min(1, Number(popupVolumeLevel) || 0));
          volumeSliderElement.value = String(pendingVolumeLevel);
          popupVolumeOutputElement.textContent = Math.round(pendingVolumeLevel * 100) + "%";
        };
        /**
         * 把排队的音量值下发给 media_player.volume_set。
         * 同一时刻只允许一个在途请求：下发时取走队列并置忙，期间新值留在队列，本次结束后
         * 若有不同值则 140ms 后补发，既避免乱序又不丢最后一次拖动；失败清本地覆盖并上报 onError。
         */
        const flushVolumeRequest = async () => {
          window.clearTimeout(volumeRetryTimer);
          volumeRetryTimer = null;
          if (isVolumeRequestPending || queuedVolumeLevel === null) {
            return;
          }
          const requestedVolumeLevel = queuedVolumeLevel;
          queuedVolumeLevel = null;
          isVolumeRequestPending = true;
          try {
            await this.callEntityService("media_player", "volume_set", moduleResolvedEntityId, {
              volume_level: requestedVolumeLevel
            });
          } catch (volumeRequestError) {
            queuedVolumeLevel = null;
            localVolumeLevel = null;
            window.clearTimeout(volumeResyncTimer);
            if (confirmedVolumeLevel !== null) {
              renderPopupVolumeLevel(confirmedVolumeLevel);
            }
            this.options.onError?.(volumeRequestError);
          } finally {
            isVolumeRequestPending = false;
            if (
              queuedVolumeLevel !== null &&
              !areNumbersClose(queuedVolumeLevel, requestedVolumeLevel)
            ) {
              volumeRetryTimer = window.setTimeout(flushVolumeRequest, 140);
            }
          }
        };
        /**
         * 滑杆 change 提交：记录本地覆盖值并延迟下发音量。
         * 120ms 延迟用于合并拖动中的连续 change；若有请求在途则不再排定时器，交给
         * flushVolumeRequest 的补发逻辑收尾。
         */
        const handleVolumeChange = () => {
          const sliderVolumeLevel = Math.max(
            0,
            Math.min(1, Number(volumeSliderElement.value) || 0)
          );
          localVolumeLevel = sliderVolumeLevel;
          queuedVolumeLevel = sliderVolumeLevel;
          window.clearTimeout(volumeResyncTimer);
          if (!isVolumeRequestPending) {
            window.clearTimeout(volumeRetryTimer);
            volumeRetryTimer = window.setTimeout(flushVolumeRequest, 120);
          }
        };
        volumeSliderElement.addEventListener("input", () =>
          renderPopupVolumeLevel(volumeSliderElement.value)
        );
        volumeSliderElement.addEventListener("change", handleVolumeChange);
        /**
         * 把 media_player 最新状态渲染进组合弹窗的媒体模块。
         * 与播放器详情弹窗逻辑一致：状态文案与扬声器视觉态、标题/副标题回退链、按钮可用性
         * （supported_features 位掩码 16/32）、播放进度、音量博弈；封面地址变化时才重建 img。
         */
        const renderMediaPlayerState = popupMediaState => {
          const mediaAttributes = popupMediaState?.attributes || {};
          const mediaStateKey = String(popupMediaState?.state || "unknown").toLowerCase();
          const mediaSupportedFeatures = Number(mediaAttributes.supported_features || 0);
          popupMediaBrowserControl.sync(popupMediaState);
          const mediaStateLabels = {
            off: "已关闭",
            on: "已开启",
            idle: "空闲",
            playing: "播放中",
            paused: "已暂停",
            buffering: "缓冲中",
            standby: "待机",
            unavailable: "不可用",
            unknown: "未知状态"
          };
          popupModuleStatusElement.textContent =
            mediaStateLabels[mediaStateKey] || popupMediaState?.state || "未知状态";
          popupModuleStatusElement.classList.toggle(
            "is-live",
            ["playing", "paused"].includes(mediaStateKey)
          );
          mediaTitleElement.textContent =
            mediaAttributes.media_title ||
            mediaAttributes.media_series_title ||
            mediaAttributes.app_name ||
            mediaAttributes.source ||
            "暂无播放内容";
          mediaSubtitleElement.textContent =
            [mediaAttributes.media_artist, mediaAttributes.media_album_name]
              .filter(Boolean)
              .join(" · ") ||
            mediaAttributes.media_content_type ||
            "媒体播放器";
          popupPlayPauseButton.textContent = mediaStateKey === "playing" ? "暂停" : "播放";
          popupPlayPauseButton.disabled =
            popupPreviewMode || ["off", "unavailable", "unknown"].includes(mediaStateKey);
          popupPreviousTrackButton.disabled = popupPreviewMode || !(mediaSupportedFeatures & 16);
          popupNextTrackButton.disabled = popupPreviewMode || !(mediaSupportedFeatures & 32);
          mediaSpeakerElement.classList.toggle("is-playing", mediaStateKey === "playing");
          mediaSpeakerElement.classList.toggle("is-paused", mediaStateKey === "paused");
          mediaSpeakerElement.classList.toggle(
            "is-off",
            ["off", "unavailable", "unknown"].includes(mediaStateKey)
          );
          popupMediaDurationSeconds = Number.isFinite(Number(mediaAttributes.media_duration))
            ? Number(mediaAttributes.media_duration)
            : null;
          popupMediaPositionSeconds = Number.isFinite(Number(mediaAttributes.media_position))
            ? Number(mediaAttributes.media_position)
            : 0;
          const positionUpdatedAtTimestamp = Date.parse(
            String(mediaAttributes.media_position_updated_at || "")
          );
          popupPositionUpdatedAtMs = Number.isFinite(positionUpdatedAtTimestamp)
            ? positionUpdatedAtTimestamp
            : null;
          isPopupMediaPlaying = mediaStateKey === "playing";
          renderMediaProgress();
          const remoteVolumeLevel = Number(mediaAttributes.volume_level);
          popupVolumeGroupElement.hidden = !Number.isFinite(remoteVolumeLevel);
          if (Number.isFinite(remoteVolumeLevel)) {
            if (localVolumeLevel === null) {
              confirmedVolumeLevel = remoteVolumeLevel;
              renderPopupVolumeLevel(remoteVolumeLevel);
            } else if (areNumbersClose(remoteVolumeLevel, localVolumeLevel)) {
              confirmedVolumeLevel = remoteVolumeLevel;
              renderPopupVolumeLevel(localVolumeLevel);
              window.clearTimeout(volumeResyncTimer);
              volumeResyncTimer = window.setTimeout(() => {
                localVolumeLevel = null;
              }, 1800);
            } else {
              window.clearTimeout(volumeResyncTimer);
            }
          }
          const popupArtworkUrl =
            [
              mediaAttributes.entity_picture_local,
              mediaAttributes.entity_picture,
              mediaAttributes.media_image_url
            ]
              .map(artworkCandidateUrl => String(artworkCandidateUrl || "").trim())
              .find(
                artworkProxyUrl =>
                  artworkProxyUrl.startsWith("/api/media_player_proxy/") ||
                  artworkProxyUrl.startsWith("/api/image_proxy/")
              ) || "";
          if (popupArtworkUrl !== currentArtworkUrl) {
            currentArtworkUrl = popupArtworkUrl;
            mediaArtworkElement.hidden = !currentArtworkUrl;
            mediaSpeakerArtworkElement.hidden = !currentArtworkUrl;
            mediaNowPlayingElement.classList.toggle("has-artwork", !!currentArtworkUrl);
            mediaSpeakerElement.classList.toggle("has-artwork", !!currentArtworkUrl);
            if (currentArtworkUrl) {
              mediaArtworkElement.src = currentArtworkUrl;
              mediaSpeakerArtworkElement.src = currentArtworkUrl;
            } else {
              mediaArtworkElement.removeAttribute("src");
              mediaSpeakerArtworkElement.removeAttribute("src");
            }
          }
        };
        mediaNowPlayingElement.append(popupMediaBrowserControl.root);
        renderMediaPlayerState(moduleCurrentState);
        registerPopupStateHandler(moduleResolvedEntityId, renderMediaPlayerState);
        popupMediaBodyElement.append(
          mediaNowPlayingElement,
          popupMediaActionsElement,
          popupVolumeGroupElement
        );
        mediaBrowserPanels.push(popupMediaBrowserControl.panel);
        popupModuleElement.append(popupMediaBodyElement);
      } else {
        const genericStatusElement = document.createElement("p");
        genericStatusElement.className = "hb-custom-popup-generic";
        /**
         * 通用模块的状态渲染：把实体 state 原样拼成一行「当前状态：xxx」。
         */
        const renderGenericStatus = genericStatusState => {
          genericStatusElement.textContent =
            "当前状态：" + (genericStatusState?.state ?? "暂无状态");
        };
        renderGenericStatus(moduleCurrentState);
        registerPopupStateHandler(moduleResolvedEntityId, renderGenericStatus);
        popupModuleElement.append(genericStatusElement);
      }
      popupGridElement.append(popupModuleElement);
    }
    if (!(popupDefinition.modules || []).length) {
      const emptyModulesElement = document.createElement("p");
      emptyModulesElement.className = "hb-custom-popup-generic";
      emptyModulesElement.textContent = "这个组合弹窗还没有添加模块。";
      popupGridElement.append(emptyModulesElement);
    }
    popupCardElement.append(popupHeadingElement, popupGridElement, ...mediaBrowserPanels);
    popupDialogElement.append(popupCardElement);
    const popupDialogLayerElement = document.createElement("div");
    popupDialogLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    popupDialogLayerElement.tabIndex = -1;
    popupDialogLayerElement.append(popupDialogElement);
    this.container.append(popupDialogLayerElement);
    this.detailsDialog = popupDialogElement;
    /**
     * 为组合弹窗的模块列表生成签名串，用于判断是否需要整体重建弹窗。
     * 签名不仅含模块 id 与类型，还含电动床各角色解析出的实体 ID：实体目录刷新后同一模块可能换绑到别的实体， 只比 id/type 会漏判、弹窗继续显示旧设备。模块间用 "|"、字段间用 ":" 分隔，拼成可整体比较的字符串。
     * @returns {string} 模块列表的签名串。
     */
    const buildModulesSignature = moduleList =>
      moduleList
        .map(popupModuleEntry => {
          const bedDeviceProfile =
            popupModuleEntry.type === "electric-bed"
              ? this.deviceProfile(this.runtimeEntityId(popupModuleEntry.entityId))
              : null;
          const bedDeviceRoles =
            bedDeviceProfile?.deviceType === "electric-bed" ? bedDeviceProfile.roles || {} : {};
          return [
            popupModuleEntry.id,
            bedDeviceProfile?.deviceType || popupModuleEntry.type || "generic",
            "backrest",
            "leg",
            "waist",
            "mode",
            "memory1",
            "memory2"
          ]
            .map(bedRoleName =>
              String(
                bedRoleName === popupModuleEntry.id
                  ? popupModuleEntry.id
                  : bedDeviceRoles[bedRoleName] || ""
              )
            )
            .join(":");
        })
        .join("|");
    const modulesSignature = buildModulesSignature(popupModules);
    this.detailsStateSync = {
      dialog: popupDialogElement,
      handlers: popupHandlersByEntityId,
      refreshHistory: () => chartRefreshCleanups.forEach(refreshCleanup => refreshCleanup()),
      refreshEntityCatalog: () => {
        if (this.detailsDialog === popupDialogElement && !!popupDialogElement.open) {
          if (buildModulesSignature(popupModules) !== modulesSignature) {
            this.showCustomPopup(popupDefinition, {
              preview: popupPreviewMode
            });
          }
        }
      }
    };
    this.registerRuntimeDialogScale(
      popupDialogLayerElement,
      popupDialogElement,
      popupWidthPx,
      popupHeightPx
    );
    popupCloseButton.addEventListener("click", () => popupDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(
      popupDialogLayerElement,
      popupDialogElement,
      popupCardElement
    );
    this.bindRuntimeDialogEscapeClose(popupDialogLayerElement, popupDialogElement);
    popupDialogElement.addEventListener(
      "close",
      () => {
        for (const popupCleanupCallback of popupCleanupCallbacks.splice(0)) {
          popupCleanupCallback();
        }
        this.clearRuntimeDialogScale(popupDialogElement);
        if (this.detailsDialog === popupDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === popupDialogElement) {
          this.detailsStateSync = null;
        }
        if (!this.replacingDocument && this.activePopupId === String(popupDefinition?.id || "")) {
          this.activePopupId = null;
          this.historyPopupGeneration += 1;
          this.connectRuntime();
          this.refreshHistorySeries();
        }
        popupDialogLayerElement.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(popupDialogLayerElement, popupDialogElement);
    this.refreshHistorySeries();
    for (const speakerVisualEntry of mediaSpeakerVisuals) {
      const speakerEntranceHandle = playMediaSpeakerEntrance(speakerVisualEntry);
      if (speakerEntranceHandle) {
        popupCleanupCallbacks.push(() => speakerEntranceHandle.cancel());
      }
    }
    for (const dropEntranceEntry of deviceDropEntries) {
      const dropEntranceAnimation = playFixedDeviceDropEntrance(
        dropEntranceEntry.visual,
        dropEntranceEntry
      );
      if (dropEntranceAnimation) {
        popupCleanupCallbacks.push(() => dropEntranceAnimation.cancel());
      }
    }
  }
};
