/**
 * 舞台控制面板：滑杆控件装配、模块页签与会话绑定收集、编辑器选中态同步。
 *
 * 从 `runtime/core/stage.ts` 的 `mountStage()` 闭包切出，依赖袋 `StageControlsDeps`。
 */

import { GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2, genericDeviceProfile as genericDeviceProfile2, isGenericDeviceKind as isGenericDeviceKind2 } from "../../device/generic-device-catalog";
import { createStageElement, expandGroupMembers } from "./_shared";
import { syncHtmlRangeProgress } from "@app/shared/util/range-progress";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface StageControlsDeps {
  getFocusedEntry: any;
  isEditing: any;
  resolveLightState: any;
  vector: any;
  wakeSceneBackground: any;
  updateDevicePanel: any;
  applyLightStates: any;
  runLightCommand: any;
  lightControlsElement: any;
  currentModuleBindings: any;
  text: any;
  editorSelectionElement: any;
  activeModule: any;
  selectedSecurityKind: any;
  mountOptions: any;
  editorSelectionOutlines: any;
  options: any;
  stageModelIndex: any;
  isOverviewOrAllFloors: any;
  collectSecurityBindings: any;
  collectVacuumShortcuts: any;
  editingVacuumId: any;
  collectGenericDeviceBindings: any;
  collectNasBindings: any;
  collectVacuumBindings: any;
  collectSpeakerBindings: any;
  collectTelevisionBindings: any;
  collectCoverBindings: any;
  collectGroupedCovers: any;
  isModuleTabsHidden: any;
  moduleTabsElement: any;
  /** ⚠ 必须收到**钉死接收者**的包装（`(el) => window.getComputedStyle(el)`），不能收到裸全局：
   * 袋成员调用 `deps.getComputedStyle(el)` 的 `this` 是袋对象，Window 方法只认 Window，
   * 裸全局转发会当场 `TypeError: Illegal invocation`（`check-deps-bag-lazy.mjs` 会拦）。 */
  getComputedStyle: any;
  moduleTabsAnimation: any;
  restoreFocusWithin: any;
  moduleTabsByKind: any;
  configuredModuleKinds2: any;
  markerLayerElement: any;
  cancelGhostAnimation: any;
  map: any;
  outgoingGhostAnimation: any;
  syncStageVisibility: any;
}

export function buildSliderControlCore(deps: StageControlsDeps, sliderLabelText: any, sliderKey: any, sliderMin: any, sliderMax: any) {
    const sliderFieldLabel = createStageElement("label", "i3d-slider i3d-" + sliderKey),
      sliderNameElement = createStageElement("span", "", sliderLabelText),
      sliderOutputElement = createStageElement("output"),
      rangeInput = createStageElement("input");
    ((rangeInput.name = "i3d-light-" + sliderKey),
      (rangeInput.type = "range"),
      rangeInput.classList.add("i3d-control-range"),
      (rangeInput.min = sliderMin),
      (rangeInput.max = sliderMax),
      (rangeInput.step = sliderKey === "temperature" ? "10" : "1"),
      rangeInput.setAttribute("aria-label", sliderLabelText));
    const syncSliderProgress = () => {
      const progressCss = syncHtmlRangeProgress(rangeInput);
      if (sliderKey === "brightness") {
        rangeInput.style.background = `linear-gradient(90deg, #d6ae65 0%, #d6ae65 ${progressCss}, #3a342c ${progressCss}, #3a342c 100%)`;
      } else if (sliderKey === "temperature") {
        rangeInput.style.background = `linear-gradient(90deg, transparent 0%, transparent ${progressCss}, #3a342c ${progressCss}, #3a342c 100%), linear-gradient(90deg, #eaa95b, #f1e1bf, #b8d6f4)`;
      }
    };
    const sliderHeadingElement = createStageElement("div", "i3d-slider-heading");
    sliderHeadingElement.append(sliderNameElement, sliderOutputElement);
    const sliderLegendElement = createStageElement("span", "i3d-slider-legend");
    return (
      sliderLegendElement.append(
        createStageElement("small", "", sliderKey === "temperature" ? "暖色" : "暗"),
        createStageElement("small", "", sliderKey === "temperature" ? "冷色" : "亮"),
      ),
      sliderFieldLabel.append(sliderHeadingElement, rangeInput, sliderLegendElement),
      rangeInput.addEventListener("input", () => {
        (syncSliderProgress(),
          (sliderOutputElement.value =
            "" + rangeInput.value + (sliderKey === "temperature" ? " K" : "%")));
        const interactiveLightEntry = deps.getFocusedEntry();
        !interactiveLightEntry ||
          deps.isEditing ||
          !deps.resolveLightState(interactiveLightEntry).available ||
          (deps.vector.set(interactiveLightEntry.entityId, sliderKey, Number(rangeInput.value)),
          deps.wakeSceneBackground(),
          deps.updateDevicePanel(),
          deps.applyLightStates({
            preview: true,
          }));
      }),
      rangeInput.addEventListener(
        "change",
        () => void deps.runLightCommand(sliderKey, Number(rangeInput.value)),
      ),
      syncSliderProgress(),
      deps.lightControlsElement.append(sliderFieldLabel),
      {
        root: sliderFieldLabel,
        input: rangeInput,
        value: sliderOutputElement,
        syncProgress: syncSliderProgress,
      }
    );
  }

export function updateEditorSelectionCore(deps: StageControlsDeps) {
    const editorSelectionEntry = deps.isEditing
      ? deps.currentModuleBindings().find(
          (editorTargetEntry: any) =>
            editorTargetEntry.id === deps.text ||
            editorTargetEntry.entryId === deps.text ||
            // 「设备」大类的绑定 id 带 `<deviceKind>:` 前缀，配置编辑器给的是裸 id。
            (!!editorTargetEntry.deviceKind &&
              editorTargetEntry.id === editorTargetEntry.deviceKind + ":" + deps.text),
        )
      : null;
    deps.editorSelectionElement.hidden = !deps.isEditing;
    const deviceKindLabels = {
        light: "灯光",
        climate: "空调/浴霸",
        fan: "电风扇",
        purifier: "空气净化器",
        "water-heater": "热水器",
        airer: "晾衣架",
        cover: "窗帘",
        nas: "NAS",
        speaker: "智能音响",
        television: "电视",
        vacuum: "扫地机",
        "vacuum-shortcut": "快捷按钮",
        "temperature-humidity": "环境标签",
        lock: "门",
        camera: "摄像头",
        presence: "人体传感器",
        alarm: "安防传感器",
        moisture: "水浸",
        smoke: "烟雾",
        gas: "天然气",
      },
      editorSelectionKind = deps.activeModule === "security" ? deps.selectedSecurityKind : deps.activeModule,
      editorSelectionFloor = deps.mountOptions.document.floors.find(
        (editorSelectionFloorModel: any) =>
          editorSelectionFloorModel.id === editorSelectionEntry?.floorId,
      ),
      editorSelectionModels = editorSelectionEntry
        ? deps.activeModule === "light"
          ? (editorSelectionFloor?.scene?.items || [])
              .filter(
                (editorLightItem: any) => editorLightItem.lightGroupId === editorSelectionEntry.groupId,
              )
              .map((editorModelItem: any) => ({
                floorId: editorSelectionFloor.id,
                modelId: editorModelItem.id,
              }))
          : expandGroupMembers([editorSelectionEntry]).filter(
              (editorModelCandidate: any) => editorModelCandidate.modelId,
            )
        : [];
    ((deps.editorSelectionElement.textContent = editorSelectionEntry
      ? "正在配置：" +
        ((deviceKindLabels as any)[editorSelectionKind] ||
          genericDeviceProfile2(editorSelectionKind)?.label ||
          "设备") +
        " · " +
        (editorSelectionEntry.label ||
          editorSelectionEntry.deviceName ||
          editorSelectionEntry.entityId ||
          "未命名") +
        (editorSelectionFloor?.name ? " · " + editorSelectionFloor.name : "") +
        (editorSelectionModels.length > 1 ? " · " + editorSelectionModels.length + " 个模型" : "")
      : "请选择要配置的对象"),
      deps.editorSelectionOutlines.sync(
        deps.mountOptions.modelRoot,
        deps.mountOptions.environmentRevision ?? deps.mountOptions.sceneRevision,
        editorSelectionModels,
        !!(
          deps.isEditing &&
          editorSelectionEntry &&
          editorSelectionEntry.deviceKind !== "smallcar" &&
          !deps.mountOptions.floorTransitionActive
        ),
      ),
      deps.editorSelectionOutlines.update());
  }

export function collectClimateBindingsCore(deps: StageControlsDeps) {
    return [
      ...(deps.options.environment?.airConditioners || []),
      ...(deps.options.environment?.fans || []),
      ...(deps.options.environment?.exhaustFans || []),
      ...(deps.options.environment?.airPurifiers || []),
      ...(deps.options.environment?.waterHeaters || []),
    ].map((climateSourceEntry) => {
      const isFanBinding = (deps.options.environment?.fans || []).includes(climateSourceEntry),
        isExhaustBinding = (deps.options.environment?.exhaustFans || []).includes(
          climateSourceEntry,
        ),
        climateModel = deps.stageModelIndex.item(
          climateSourceEntry.floorId,
          climateSourceEntry.modelId,
          deps.options.environment?.waterHeaters?.includes(climateSourceEntry)
            ? ["storagewaterheater", "gaswaterheater"]
            : isExhaustBinding
              ? ["exhaust-fan"]
              : isFanBinding
                ? ["fan", "ceiling-fan"]
                : deps.options.environment?.airPurifiers?.includes(climateSourceEntry)
                  ? ["airpurifier"]
                  : ["wallac", "floorac", "airoutlet"],
        ),
        isCeilingFan =
          isFanBinding &&
          (climateModel?.type === "ceiling-fan" ||
            climateSourceEntry.visualMode === "ceiling");
      return {
        ...climateSourceEntry,
        /** 0.8.0 里排气扇与落地扇共用 `pedestalFan`（面板的风扇外形分支），`exhaustFan` 再细分。 */
        pedestalFan:
          isFanBinding || isExhaustBinding,
        exhaustFan: isExhaustBinding,
        ceilingFan: isCeilingFan,
        waterHeater: (deps.options.environment?.waterHeaters || []).includes(climateSourceEntry),
        airPurifier: (deps.options.environment?.airPurifiers || []).includes(climateSourceEntry),
        deviceKind: "climate",
        x: Number.isFinite(climateSourceEntry.x) ? climateSourceEntry.x : (climateModel?.x ?? 0),
        y: Number.isFinite(climateSourceEntry.y) ? climateSourceEntry.y : (climateModel?.y ?? 0),
        height: Number.isFinite(climateSourceEntry.height)
          ? climateSourceEntry.height
          : climateModel
            ? (Number(climateModel.elevation) || 0) +
              (climateModel.type === "ceiling-fan" ? -1 : 1) *
                (Number(climateModel.height) || 0.28) /
                2
            : 0,
        modelAvailable: !!climateModel,
        icon:
          climateSourceEntry.icon ||
          (deps.options.environment?.waterHeaters?.includes(climateSourceEntry)
            ? "mdi:water-boiler"
            : isExhaustBinding
              ? "mdi:fan"
              : isCeilingFan
                ? "mdi:ceiling-fan"
                : isFanBinding
                  ? "mdi:fan"
                  : deps.options.environment?.airPurifiers?.includes(climateSourceEntry)
                    ? "mdi:air-purifier"
                    : "mdi:air-conditioner"),
      };
    });
  }

export function collectModuleBindingsCore(deps: StageControlsDeps) {
    const temperatureHumidityBindings = (deps.options.environment?.temperatureHumidity || []).map(
      (temperatureHumidityEntry: any) => ({
        ...temperatureHumidityEntry,
        deviceKind: "temperature-humidity",
      }),
    );
    return deps.isOverviewOrAllFloors()
      ? []
      : deps.activeModule === "security"
        ? deps.collectSecurityBindings()
        : deps.activeModule === "vacuum-shortcut"
          ? deps.collectVacuumShortcuts().filter(
              (vacuumShortcutBinding: any) => vacuumShortcutBinding.vacuumId === deps.editingVacuumId,
            )
          : isGenericDeviceKind2(deps.activeModule)
            ? deps.collectGenericDeviceBindings(deps.activeModule)
            : deps.activeModule === "nas"
              ? deps.collectNasBindings()
              : deps.activeModule === "vacuum"
                ? deps.collectVacuumBindings()
                    .filter((visibleVacuumBinding: any) => deps.isEditing || visibleVacuumBinding.entityId)
                    .map((vacuumModuleBinding: any) => ({
                      ...vacuumModuleBinding,
                      id: deps.isEditing ? vacuumModuleBinding.id : "vacuum:" + vacuumModuleBinding.id,
                    }))
                : deps.activeModule === "speaker"
                  ? deps.collectSpeakerBindings()
                  : deps.activeModule === "television"
                    ? deps.collectTelevisionBindings()
                    : deps.activeModule === "devices"
                      ? [
                          ...deps.collectCoverBindings().filter(
                            (airerModuleBinding: any) => airerModuleBinding.airer,
                          ),
                          ...collectClimateBindingsCore(deps).filter(
                            (waterHeaterModuleBinding) => waterHeaterModuleBinding.waterHeater,
                          ),
                          ...deps.collectNasBindings(),
                          ...deps.collectSpeakerBindings(),
                          ...deps.collectTelevisionBindings(),
                          ...GENERIC_DEVICE_KINDS2.flatMap((genericModuleDeviceKind) =>
                            deps.collectGenericDeviceBindings(genericModuleDeviceKind),
                          ),
                        ].map((genericModuleBinding) => ({
                          ...genericModuleBinding,
                          id: genericModuleBinding.deviceKind + ":" + genericModuleBinding.id,
                        }))
                      : deps.activeModule === "airer"
                        ? deps.collectCoverBindings().filter(
                            (airerFilteredBinding: any) => airerFilteredBinding.airer,
                          )
                        : deps.activeModule === "cover"
                          ? deps.collectGroupedCovers().filter(
                              (coverFilteredBinding: any) => !coverFilteredBinding.airer,
                            )
                          : deps.activeModule === "climate"
                            ? collectClimateBindingsCore(deps).filter((climateFilteredBinding) =>
                                (deps.options.environment?.airConditioners || []).some(
                                  (climateFilterSource: any) =>
                                    climateFilterSource.id === climateFilteredBinding.id,
                                ),
                              )
                            : deps.activeModule === "water-heater"
                              ? collectClimateBindingsCore(deps).filter((waterHeaterFilteredBinding) =>
                                  (deps.options.environment?.waterHeaters || []).some(
                                    (waterHeaterFilterSource: any) =>
                                      waterHeaterFilterSource.id === waterHeaterFilteredBinding.id,
                                  ),
                                )
                              : deps.activeModule === "fan"
                                ? collectClimateBindingsCore(deps).filter(
                                    (fanFilteredBinding) =>
                                      fanFilteredBinding.pedestalFan &&
                                      !fanFilteredBinding.exhaustFan,
                                  )
                                : deps.activeModule === "exhaust-fan"
                                  ? collectClimateBindingsCore(deps).filter(
                                      (exhaustFilteredBinding) =>
                                        exhaustFilteredBinding.exhaustFan,
                                    )
                                : deps.activeModule === "purifier"
                                  ? collectClimateBindingsCore(deps).filter((purifierFilteredBinding) =>
                                      (deps.options.environment?.airPurifiers || []).some(
                                        (purifierFilterSource: any) =>
                                          purifierFilterSource.id === purifierFilteredBinding.id,
                                      ),
                                    )
                                  : deps.activeModule === "temperature-humidity"
                                    ? temperatureHumidityBindings
                                    : [
                                        ...collectClimateBindingsCore(deps).filter(
                                          (fallbackClimateBinding) =>
                                            !fallbackClimateBinding.waterHeater,
                                        ),
                                        ...deps.collectGroupedCovers().filter(
                                          (fallbackCoverBinding: any) => !fallbackCoverBinding.airer,
                                        ),
                                        ...temperatureHumidityBindings,
                                      ].map((fallbackModuleBinding) => ({
                                        ...fallbackModuleBinding,
                                        id:
                                          fallbackModuleBinding.deviceKind +
                                          ":" +
                                          fallbackModuleBinding.id,
                                      }));
  }

export function toggleModuleTabsCore(deps: StageControlsDeps, shouldHideTabs: any) {
    if (deps.isModuleTabsHidden === shouldHideTabs) return;
    const isModuleTabsInitial = deps.isModuleTabsHidden === null,
      computedStyle =
        !deps.moduleTabsElement.hidden &&
        deps.moduleTabsElement.animate &&
        typeof deps.getComputedStyle == "function"
          ? deps.getComputedStyle(deps.moduleTabsElement)
          : null,
      moduleTabsBaseKeyframe = {
        clipPath: deps.moduleTabsElement.hidden
          ? "inset(0 100% 0 0 round 12px)"
          : computedStyle?.clipPath && computedStyle.clipPath !== "none"
            ? computedStyle.clipPath
            : "inset(0 0% 0 0 round 12px)",
        opacity: deps.moduleTabsElement.hidden ? 0 : Number(computedStyle?.opacity ?? 1),
        transform: deps.moduleTabsElement.hidden
          ? "translateX(-6px)"
          : computedStyle?.transform || "none",
      };
    if (
      (deps.moduleTabsAnimation?.cancel(),
      (deps.moduleTabsAnimation = null),
      (deps.isModuleTabsHidden = shouldHideTabs),
      (deps.moduleTabsElement.inert = shouldHideTabs),
      deps.moduleTabsElement.setAttribute("aria-hidden", String(shouldHideTabs)),
      shouldHideTabs && deps.restoreFocusWithin(deps.moduleTabsElement),
      isModuleTabsInitial ||
        !deps.moduleTabsElement.animate ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    ) {
      deps.moduleTabsElement.hidden = shouldHideTabs;
      return;
    }
    deps.moduleTabsElement.hidden = false;
    const moduleTabsKeyframes = shouldHideTabs
        ? [
            moduleTabsBaseKeyframe,
            {
              clipPath: "inset(0 100% 0 0 round 12px)",
              opacity: 0,
              transform: "translateX(-4px)",
            },
          ]
        : [
            moduleTabsBaseKeyframe,
            {
              clipPath: "inset(0 0% 0 0 round 12px)",
              opacity: 1,
              transform: "translateX(2px)",
              offset: 0.8,
            },
            {
              clipPath: "inset(0 0% 0 0 round 12px)",
              opacity: 1,
              transform: "translateX(0)",
            },
          ],
      animate = deps.moduleTabsElement.animate(moduleTabsKeyframes, {
        duration: shouldHideTabs ? 380 : 480,
        easing: "cubic-bezier(.2,.7,.2,1)",
        fill: "both",
      });
    ((deps.moduleTabsAnimation = animate),
      (animate.onfinish = () => {
        if (deps.moduleTabsAnimation === animate) {
          ((deps.moduleTabsAnimation = null), (deps.moduleTabsElement.hidden = shouldHideTabs));
          for (const [finishedModuleKind, finishedModuleTabElement] of deps.moduleTabsByKind)
            finishedModuleTabElement.hidden =
              shouldHideTabs || !deps.configuredModuleKinds2.includes(finishedModuleKind);
          animate.cancel();
        }
      }));
  }

export function animateModuleSwitchCore(deps: StageControlsDeps, switchContent: any) {
    const previousOpacityList = deps.markerLayerElement.animate
      ? [...deps.markerLayerElement.children].map((opacityChild) =>
          Number(deps.getComputedStyle(opacityChild).opacity),
        )
      : [];
    if (
      (deps.cancelGhostAnimation(),
      !deps.markerLayerElement.animate ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    ) {
      switchContent();
      return;
    }
    const childIndexByNode = new Map(
        [...deps.markerLayerElement.children].map((indexedChild, indexedChildIndex) => [
          indexedChild,
          indexedChildIndex,
        ]),
      ),
      outgoingEntries = deps.currentModuleBindings()
        .map((outgoingBinding: any) => ({
          ...outgoingBinding,
          index: childIndexByNode.get(deps.map.get(outgoingBinding.id)) ?? -1,
        }))
        .filter((outgoingEntry: any) => outgoingEntry.index >= 0),
      cloneNode = deps.markerLayerElement.cloneNode(true);
    (cloneNode.setAttribute("aria-hidden", "true"),
      cloneNode.setAttribute("inert", ""),
      cloneNode.classList.add("i3d-module-outgoing"),
      (cloneNode.style.pointerEvents = "none"));
    for (const ghostButton of cloneNode.querySelectorAll("button"))
      ((ghostButton.style.pointerEvents = "none"), ghostButton.removeAttribute("id"));
    (deps.markerLayerElement.parentNode.append(cloneNode),
      switchContent(),
      deps.markerLayerElement.setAttribute("inert", ""));
    const ghostAnimationState = (deps.outgoingGhostAnimation = {
      ghost: cloneNode,
      animations: [] as any[],
      outgoing: outgoingEntries.map((ghostOutgoingEntry: any) => ({
        ...ghostOutgoingEntry,
        node: cloneNode.children[ghostOutgoingEntry.index],
      })),
    });
    for (const [ghostChildIndex, ghostChildElement] of [...cloneNode.children].entries())
      ghostChildElement.hidden ||
        ghostAnimationState.animations.push(
          ghostChildElement.animate(
            [
              {
                opacity: previousOpacityList[ghostChildIndex] ?? 1,
              },
              {
                opacity: 0,
              },
            ],
            {
              duration: 240,
              easing: "linear",
              fill: "both",
            },
          ),
        );
    if (!deps.markerLayerElement.classList.contains("is-concealed")) {
      for (const stageChildElement of deps.markerLayerElement.children)
        if (!stageChildElement.hidden) {
          const childOpacity = Number(deps.getComputedStyle(stageChildElement).opacity);
          ghostAnimationState.animations.push(
            stageChildElement.animate(
              [
                {
                  opacity: 0,
                },
                {
                  opacity: childOpacity,
                },
              ],
              {
                duration: 240,
                easing: "linear",
                fill: "backwards",
              },
            ),
          );
        }
    }
    Promise.all(
      ghostAnimationState.animations.map((ghostAnimationHandle) => ghostAnimationHandle.finished),
    )
      .then(() => {
        deps.outgoingGhostAnimation === ghostAnimationState &&
          (deps.cancelGhostAnimation(), deps.syncStageVisibility());
      })
      .catch(() => {});
  }
