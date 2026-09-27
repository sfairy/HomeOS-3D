/*
 * 设备标记层。
 */
// 组合条目的 id 口径只有一份实现（cover-groups.js）：拖拽回写要靠它把舞台 id 反查回配置组。
import { curtainGroupEntryId } from "../../cover/cover-groups.js?v=2609271508";

/* 标记上文字（安防标签、扫地机状态卡、扫地机房间名）的「设计画布倍数」。
 */
const MARKER_LABEL_SCALE = 2;

/**
 * 门牌（门锁标记上那块标签）该不该贴。
 */
const doorLabelVisibility = binding =>
  binding.labelMode === "hidden" || binding.labelMode === "open" || binding.labelMode === "always"
    ? binding.labelMode
    : binding.labelHidden === true
      ? "hidden"
      : "always";

const doorLabelVisible = (binding, lockStateValue) =>
  binding.deviceKind !== "lock" ||
  doorLabelVisibility(binding) === "always" ||
  (doorLabelVisibility(binding) === "open" && lockStateValue?.doorOpen === true);

export function createMarkerLayer(ctx) {
  /**
   * 重绘标记列表：按当前模块的绑定集合增删 DOM 节点并同步内容。
   */
  function renderMarkers() {
    if (ctx.isSceneUpdating) {
      return;
    }
    ctx.wakeFrameLoop();
    const activeMarkerIds = new Set(
      ctx.collectModuleBindings().map(renderMarkerBinding => renderMarkerBinding.id)
    );
    for (const [activeMarkerId, staleMarker] of ctx.markersById) {
      if (!activeMarkerIds.has(activeMarkerId)) {
        staleMarker.remove();
        ctx.markersById.delete(activeMarkerId);
        ctx.markerPointsById.delete(activeMarkerId);
      }
    }
    for (const renderedBinding of ctx.collectModuleBindings()) {
      let markerElement = ctx.markersById.get(renderedBinding.id);
      if (!markerElement) {
        // 温湿度计是一块只读信息卡（卡片本身就是标记），与展示态的人体传感器一样用 div
        const isTemperatureHumidityMarker =
          renderedBinding.deviceKind === "temperature-humidity";
        markerElement = ctx.makeElement(
          renderedBinding.passiveSensor || isTemperatureHumidityMarker ? "div" : "button",
          "i3d-marker"
        );
        markerElement.type = "button";
        markerElement.addEventListener("click", markerClickEvent => {
          markerClickEvent.stopPropagation();
          // 温湿度计没有对应面板：展示态点它只会落进灯光面板那条兜底分支，
          if (!ctx.isEditing && renderedBinding.deviceKind === "temperature-humidity") {
            return;
          }
          if (
            !ctx.findBinding(renderedBinding.id)?.passiveSensor &&
            !ctx.isSceneUpdating &&
            !ctx.isViewEditing &&
            ctx.focusMode !== "edit" &&
            (!!ctx.isEditing || ctx.findBinding(renderedBinding.id)?.buttonHidden !== true)
          ) {
            if (markerElement.dataset.dragged === "true") {
              markerElement.dataset.dragged = "";
              return;
            }
            ctx.activateBinding(renderedBinding.id, true);
          }
        });
        markerElement.addEventListener("pointerdown", markerPointerDownEvent =>
          beginMarkerDrag(markerPointerDownEvent, renderedBinding.id)
        );
        markerElement.addEventListener("pointermove", moveMarkerDrag);
        markerElement.addEventListener("pointerup", endMarkerDrag);
        markerElement.addEventListener("pointercancel", cancelMarkerDrag);
        ctx.markersElement.append(markerElement);
        ctx.markersById.set(renderedBinding.id, markerElement);
      }
      const iconName = /^mdi:[a-z0-9-]+$/.test(renderedBinding.icon || "")
        ? renderedBinding.icon
        : "";
      const isCurtainGroupMarker = renderedBinding.isCurtainGroup === true;
      const isVacuumMarker = renderedBinding.deviceKind === "vacuum";
      const isVacuumRoomMarker = renderedBinding.deviceKind === "vacuum-room";
      const isTemperatureHumidityMarker = renderedBinding.deviceKind === "temperature-humidity";
      if (isCurtainGroupMarker) {
        // 组合标记要并排显示两名成员的图标（典型是纱帘 + 布帘），并按图标组合做重建签名：
        const curtainGroupMemberIcons = (renderedBinding.memberItems || []).map(memberItem =>
          /^mdi:[a-z0-9-]+$/.test(memberItem.icon || "") ? memberItem.icon : "mdi:curtains"
        );
        const curtainGroupIconKey = curtainGroupMemberIcons.join("|");
        if (markerElement.dataset.groupIcons !== curtainGroupIconKey) {
          markerElement.dataset.groupIcons = curtainGroupIconKey;
          markerElement.replaceChildren(
            ...curtainGroupMemberIcons.map(memberIconName => {
              const memberIconElement = ctx.makeElement("span", "i3d-marker-icon");
              memberIconElement.setAttribute("aria-hidden", "true");
              // 遮罩地址与图标名白名单统一在 utils/icon-url.js（版本号只此一份）。
              ctx.applyMdiMask(memberIconElement, memberIconName);
              return memberIconElement;
            })
          );
        }
      } else if (
        // 温湿度计的卡片自带两枚遮罩图标，不能走「普通标记的一枚图标」这条支路 ——
        !isVacuumMarker &&
        !isTemperatureHumidityMarker &&
        markerElement.dataset.icon !== iconName
      ) {
        markerElement.dataset.icon = iconName;
        if (iconName) {
          const iconElement = ctx.makeElement("span", "i3d-marker-icon");
          iconElement.setAttribute("aria-hidden", "true");
          // 遮罩地址与图标名白名单统一在 utils/icon-url.js（版本号只此一份）。
          ctx.applyMdiMask(iconElement, iconName);
          markerElement.replaceChildren(iconElement);
        } else {
          markerElement.innerHTML = ctx.DEFAULT_MARKER_ICON_SVG;
        }
      }
      const deviceState = renderedBinding.deviceKind?.startsWith("vacuum")
        ? {
            available:
              !!ctx.statesByEntityId[renderedBinding.entityId] &&
              !["unknown", "unavailable"].includes(
                ctx.statesByEntityId[renderedBinding.entityId].state
              ),
            on: ctx.statesByEntityId[renderedBinding.entityId]?.state === "cleaning"
          }
        : renderedBinding.deviceKind === "television"
          ? ctx.televisionState(renderedBinding, ctx.statesByEntityId)
          : renderedBinding.deviceKind === "nas"
            ? ctx.nasDeviceState(renderedBinding, ctx.statesByEntityId)
            : isCurtainGroupMarker
              ? {
                  // 组合没有自己的实体：任一成员在线就算在线、任一成员「开着」就点亮，
                  available: (renderedBinding.memberItems || []).some(memberItem =>
                    ctx.coverState(
                      memberItem.entityId,
                      ctx.statesByEntityId[memberItem.entityId],
                      memberItem
                    ).available
                  ),
                  on: (renderedBinding.memberItems || []).some(memberItem =>
                    ctx.coverIconIsOn(
                      memberItem,
                      ctx.coverState(
                        memberItem.entityId,
                        ctx.statesByEntityId[memberItem.entityId],
                        memberItem
                      )
                    )
                  )
                }
              : renderedBinding.deviceKind === "cover"
                ? ctx.coverState(
                    renderedBinding.entityId,
                    ctx.statesByEntityId[renderedBinding.entityId],
                    renderedBinding
                  )
                : renderedBinding.deviceKind === "lock"
                ? (() => {
                    const lockStateValue = ctx.lockState(renderedBinding, ctx.statesByEntityId);
                    return {
                      available: lockStateValue.available,
                      on:
                        lockStateValue.state === "unlocked" || lockStateValue.state === "open",
                      name: renderedBinding.label || "门",
                      lock: lockStateValue
                    };
                  })()
              : renderedBinding.deviceKind === "temperature-humidity"
                ? (() => {
                    // 只要有任意一路读到数就算在线：温湿度计允许只绑温度或只绑湿度。
                    const temperatureHumidityDeviceReadings = [
                      ctx.temperatureHumidityReading(
                        ctx.statesByEntityId[renderedBinding.temperatureEntityId]
                      ),
                      ctx.temperatureHumidityReading(
                        ctx.statesByEntityId[renderedBinding.humidityEntityId]
                      )
                    ];
                    return {
                      available: temperatureHumidityDeviceReadings.some(
                        temperatureHumidityDeviceReading => temperatureHumidityDeviceReading.available
                      ),
                      on: false,
                      name: renderedBinding.label || "温湿度计"
                    };
                  })()
                : renderedBinding.modelId
                  ? ctx.climateState(renderedBinding.entityId, ctx.statesByEntityId[renderedBinding.entityId])
                  : ctx.resolveLightState(renderedBinding.entityId);
      const markerSize =
        Number.isFinite(renderedBinding.size) && renderedBinding.size > 0
          ? renderedBinding.size
          : 44;
      const iconSize =
        Number.isFinite(renderedBinding.iconSize) && renderedBinding.iconSize > 0
          ? renderedBinding.iconSize
          : isVacuumMarker
            ? 26
            : Math.min(markerSize, Math.max(4, markerSize - 18));
      const hitSize =
        Number.isFinite(renderedBinding.hitSize) && renderedBinding.hitSize > 0
          ? renderedBinding.hitSize
          : Math.max(44, markerSize);
      markerElement.style.width = markerElement.style.height = hitSize + "px";
      if (isCurtainGroupMarker) {
        markerElement.style.width = Math.max(hitSize, iconSize * 2 + 8) + "px";
        markerElement.style.height = Math.max(hitSize, iconSize + 8) + "px";
      }
      markerElement.classList.toggle("is-vacuum-status", isVacuumMarker);
      markerElement.classList.toggle("is-curtain-group", isCurtainGroupMarker);
      markerElement.classList.toggle("is-overview-quip", renderedBinding.overviewQuip === true);
      markerElement.style.pointerEvents =
        renderedBinding.overviewQuip || renderedBinding.passiveSensor ? "none" : "";
      markerElement.classList.toggle("is-presence-wave", renderedBinding.passiveSensor === true);
      markerElement.classList.toggle(
        "is-security-label",
        renderedBinding.deviceKind === "lock" ||
          renderedBinding.deviceKind === "camera" ||
          (renderedBinding.deviceKind === "presence" && ctx.isEditing)
      );
      // 温湿度计：卡片自带底色与圆角，不是圆形按钮，故单独一类；
      markerElement.classList.toggle("is-temperature-humidity", isTemperatureHumidityMarker);
      markerElement.classList.toggle(
        "is-editable-temperature-humidity",
        isTemperatureHumidityMarker && ctx.isEditing
      );
      if (isTemperatureHumidityMarker) {
        let temperatureHumidityCard = markerElement.querySelector(
          ".i3d-temperature-humidity-card"
        );
        // 卡片只建一次，之后每帧只更新文案与读数 —— 重建会打断 CSS 过渡，也浪费节点。
        if (!temperatureHumidityCard) {
          temperatureHumidityCard = ctx.makeElement("span", "i3d-temperature-humidity-card");
          temperatureHumidityCard.append(
            ctx.makeElement("strong", "i3d-temperature-humidity-title"),
            ctx.makeElement("span", "i3d-temperature-humidity-values")
          );
          const temperatureHumidityValuesElement = temperatureHumidityCard.lastElementChild;
          for (const [
            temperatureHumidityKind,
            temperatureHumidityAriaLabel,
            temperatureHumidityIconName
          ] of [
            ["temperature", "温度", "thermometer"],
            ["humidity", "湿度", "water-percent"]
          ]) {
            const meterReadingElement = ctx.makeElement(
              "span",
              "i3d-meter-reading is-" + temperatureHumidityKind
            );
            const meterIconElement = ctx.makeElement("i");
            meterIconElement.setAttribute("aria-hidden", "true");
            // 遮罩地址与图标白名单统一走 utils/icon-url.js（applyMdiMask 只在名字合法时才写）。
            ctx.applyMdiMask(meterIconElement, "mdi:" + temperatureHumidityIconName);
            meterReadingElement.setAttribute("aria-label", temperatureHumidityAriaLabel);
            meterReadingElement.append(
              meterIconElement,
              ctx.makeElement("span", "i3d-meter-number")
            );
            temperatureHumidityValuesElement.append(meterReadingElement);
          }
          markerElement.replaceChildren(temperatureHumidityCard);
        }
        const temperatureHumidityTitleElement = temperatureHumidityCard.querySelector(
          ".i3d-temperature-humidity-title"
        );
        temperatureHumidityTitleElement.textContent = renderedBinding.label ?? "温湿度计";
        // 标题「留空隐藏」：卡片是 display:flex + gap:8px，只清空 textContent 仍会占一行
        temperatureHumidityTitleElement.hidden = !temperatureHumidityTitleElement.textContent;
        // 「这条温湿度计配没配实体」是两路实体任一非空；用于决定未绑定的那一行
        const isTemperatureHumidityBound = !!(
          renderedBinding.temperatureEntityId || renderedBinding.humidityEntityId
        );
        for (const temperatureHumidityKind of ["temperature", "humidity"]) {
          const temperatureHumidityEntityId =
            renderedBinding[temperatureHumidityKind + "EntityId"];
          const temperatureHumidityMeterReading = ctx.temperatureHumidityReading(
            ctx.statesByEntityId[temperatureHumidityEntityId]
          );
          const meterReadingElement = temperatureHumidityCard.querySelector(
            ".i3d-meter-reading.is-" + temperatureHumidityKind
          );
          meterReadingElement.hidden =
            !temperatureHumidityEntityId && isTemperatureHumidityBound;
          meterReadingElement.classList.toggle(
            "is-unavailable",
            !temperatureHumidityMeterReading.available
          );
          // 没绑实体就写空串（不要拿 bridge 的破折号占位）；绑了但读不到数才用 bridge 的「—」。
          meterReadingElement.querySelector(".i3d-meter-number").textContent =
            temperatureHumidityEntityId
              ? temperatureHumidityMeterReading.value +
                (temperatureHumidityMeterReading.unit
                  ? " " + temperatureHumidityMeterReading.unit
                  : "")
              : "";
        }
        // 卡片宽度由配置的 size 决定（缺省 180 逻辑 px）；整块按标记标签倍数放大，
        temperatureHumidityCard.style.width =
          Math.min(600, Math.max(100, Number(renderedBinding.size) || 180)) + "px";
        // 文字大小：卡片内所有字号（标题 1em、读数 1.5em/1.2em）都是相对单位，
        const meterConfiguredFontSize = Number(renderedBinding.iconSize);
        temperatureHumidityCard.style.fontSize =
          (meterConfiguredFontSize >= 9 && meterConfiguredFontSize <= 24
            ? meterConfiguredFontSize
            : 12) + "px";
        temperatureHumidityCard.style.setProperty(
          "--i3d-meter-scale",
          String(MARKER_LABEL_SCALE)
        );
        const temperatureHumidityCardRect = {
          width: temperatureHumidityCard.offsetWidth || 180,
          height: temperatureHumidityCard.offsetHeight || 96
        };
        markerElement.style.width =
          Math.max(hitSize, temperatureHumidityCardRect.width * MARKER_LABEL_SCALE) + "px";
        markerElement.style.height =
          Math.max(hitSize, temperatureHumidityCardRect.height * MARKER_LABEL_SCALE) + "px";
        // 卡片是只读信息块：编辑态才可聚焦选中，展示态交给屏幕阅读器当一组读数。
        markerElement.setAttribute("role", ctx.isEditing ? "button" : "group");
        if (ctx.isEditing) {
          markerElement.setAttribute("tabindex", "0");
        } else {
          markerElement.removeAttribute("tabindex");
        }
      }
      if (isVacuumMarker) {
        let statusElement = markerElement.querySelector(".i3d-vacuum-status");
        if (
          !statusElement ||
          statusElement.dataset.compact !== String(renderedBinding.overviewQuip === true)
        ) {
          statusElement = ctx.makeElement("span", "i3d-vacuum-status");
          statusElement.dataset.compact = String(renderedBinding.overviewQuip === true);
          if (!renderedBinding.overviewQuip) {
            statusElement.append(
              ctx.makeElement("strong", "i3d-vacuum-status-name"),
              ctx.makeElement("span", "i3d-vacuum-status-detail")
            );
            statusElement.lastElementChild.append(
              ctx.makeElement("span", "i3d-vacuum-status-text"),
              ctx.makeElement("span", "i3d-vacuum-status-battery")
            );
          }
          statusElement.append(ctx.makeElement("span", "i3d-vacuum-quip"));
          if (renderedBinding.overviewQuip) {
            Object.assign(statusElement.style, {
              opacity: ".55",
              pointerEvents: "none",
              background: "none",
              border: "none",
              boxShadow: "none",
              backdropFilter: "none",
              webkitBackdropFilter: "none"
            });
            statusElement.lastElementChild.style.pointerEvents = "none";
          }
          markerElement.replaceChildren(statusElement);
        }
        const vacuumStatus = ctx.vacuumStatusPresentation(renderedBinding, ctx.statesByEntityId);
        // 整块状态卡（名称 / 明细 / 电量 / 卡片内边距 / 箭头）一起按标记标签口径放大：
        const statusScale = (markerSize / 44) * MARKER_LABEL_SCALE;
        if (!renderedBinding.overviewQuip) {
          statusElement.querySelector(".i3d-vacuum-status-name").textContent =
            renderedBinding.label || "扫地机器人";
          statusElement.querySelector(".i3d-vacuum-status-text").textContent = vacuumStatus.status;
          statusElement.querySelector(".i3d-vacuum-status-battery").textContent =
            vacuumStatus.battery;
        }
        const quipElement = statusElement.querySelector(".i3d-vacuum-quip");
        quipElement.textContent = vacuumStatus.active
          ? ctx.vacuumQuip(renderedBinding, ctx.statesByEntityId, performance.now())
          : "";
        quipElement.hidden = !quipElement.textContent;
        statusElement.style.transform = "translate(-50%,-50%) scale(" + statusScale + ")";
        statusElement.style.fontSize = Math.max(8, iconSize / 2) + "px";
        const statusHeight = Math.max(
          renderedBinding.overviewQuip ? 28 : 50,
          statusElement.offsetHeight
        );
        markerElement.style.width = Math.max(hitSize, statusScale * 140) + "px";
        markerElement.style.height = Math.max(hitSize, statusHeight * statusScale) + "px";
        markerElement.dataset.status = vacuumStatus.status;
        markerElement.title =
          (renderedBinding.label || "扫地机器人") +
          " · " +
          vacuumStatus.status +
          " · " +
          vacuumStatus.battery;
        deviceState.on = vacuumStatus.active;
        deviceState.available = vacuumStatus.available;
      }
      if (
        renderedBinding.deviceKind === "lock" ||
        renderedBinding.deviceKind === "camera" ||
        renderedBinding.deviceKind === "presence"
      ) {
        const entityState = ctx.resolveStateEntry(ctx.statesByEntityId[renderedBinding.entityId]);
        // 门锁的「在线」由 lockState 综合判定：锁本体 / 门磁 / 电量任一条在线即算在线，
        const lockStateValue =
          renderedBinding.deviceKind === "lock" ? deviceState.lock : null;
        const isAvailable =
          renderedBinding.deviceKind === "lock"
            ? lockStateValue.available
            : renderedBinding.deviceKind === "camera"
              ? ctx.cameraOnline(entityState)
              : entityState?.available !== false &&
                !!entityState?.state &&
                !["unknown", "unavailable"].includes(entityState.state);
        deviceState.available = isAvailable;
        // 「亮起」的口径：门锁是「已解锁或锁舌已释放」（这两种状态才需要用户注意），
        deviceState.on =
          renderedBinding.deviceKind === "lock"
            ? lockStateValue.state === "unlocked" || lockStateValue.state === "open"
            : renderedBinding.deviceKind === "camera"
              ? entityState?.state === "recording"
              : entityState?.state === "on";
        if (renderedBinding.passiveSensor) {
          if (!markerElement.querySelector(".i3d-sensor-wave")) {
            markerElement.replaceChildren(
              ...[0, 1, 2].map(() => ctx.makeElement("span", "i3d-sensor-wave"))
            );
          }
          markerElement.hidden = !isAvailable;
          markerElement.setAttribute("aria-hidden", "true");
          markerElement.classList.toggle("is-inactive", !isAvailable);
        } else {
          const isSensorChoice = renderedBinding.deviceKind === "presence" && ctx.isEditing;
          const isLockMarker = renderedBinding.deviceKind === "lock";
          markerElement.classList.toggle("is-sensor-choice", isSensorChoice);
          let securityLabelElement = markerElement.querySelector(".i3d-security-label");
          if (!securityLabelElement) {
            securityLabelElement = ctx.makeElement("span", "i3d-security-label");
            securityLabelElement.append(ctx.makeElement("strong"), ctx.makeElement("span"));
            markerElement.append(securityLabelElement);
          }
          securityLabelElement.children[0].textContent =
            renderedBinding.label ||
            (isLockMarker ? "门" : renderedBinding.deviceKind === "camera" ? "摄像头" : "人体传感器");
          // 「这条锁配没配实体」与其它两类不同：锁的实体散在五个槽位里，任何一个非空都算配过，
          const lockBoundEntityId =
            isLockMarker &&
            (renderedBinding.doorEntityId ||
              renderedBinding.doorEventEntityId ||
              renderedBinding.doorOpenEntityId ||
              renderedBinding.doorCloseEntityId ||
              renderedBinding.batteryEntityId ||
              renderedBinding.entityId);
          securityLabelElement.children[1].textContent =
            ctx.isEditing && !(isLockMarker ? lockBoundEntityId : renderedBinding.entityId)
              ? "未绑定实体"
              : isAvailable
                ? isLockMarker
                  ? (deviceState.lock.doorOpen === true
                      ? "已打开"
                      : deviceState.lock.doorOpen === false
                        ? "已关闭"
                        : "状态未知") +
                    (renderedBinding.batteryEntityId && deviceState.lock.battery !== "—"
                      ? " · " + deviceState.lock.battery
                      : "")
                  : renderedBinding.deviceKind === "presence"
                    ? entityState.state === "on"
                      ? "有人"
                      : "检测中"
                    : "在线"
                : "离线";
          securityLabelElement.children[1].hidden = isSensorChoice;
          securityLabelElement.classList.toggle(
            "is-camera-status",
            renderedBinding.deviceKind === "camera"
          );
          securityLabelElement.classList.toggle("is-lock-status", isLockMarker);
          securityLabelElement.classList.toggle("is-camera-offline", !isAvailable);
          // 门牌贴不贴由 labelMode 决定：always 常显；open 只在门开着时显；hidden 不显。
          securityLabelElement.hidden = !doorLabelVisible(renderedBinding, deviceState.lock);
          securityLabelElement.style.fontSize = (renderedBinding.fontSize || 12) + "px";
          // 标签整块按标记标签口径放大：字号、内边距、圆角、图标位置都跟着 --i3d-security-scale
          const securityLabelScale = (markerSize / 44) * MARKER_LABEL_SCALE;
          if (renderedBinding.deviceKind === "camera" || isLockMarker) {
            const securityIconElement = markerElement.querySelector(".i3d-marker-icon");
            if (securityIconElement && securityIconElement.parentNode !== securityLabelElement) {
              securityLabelElement.append(securityIconElement);
            }
            securityLabelElement.style.setProperty(
              "--i3d-marker-icon-size",
              iconSize / MARKER_LABEL_SCALE + "px"
            );
          }
          markerElement.style.setProperty("--i3d-security-scale", String(securityLabelScale));
          const labelHitWidth = Math.max(
            securityLabelElement.offsetWidth,
            renderedBinding.deviceKind === "camera" ? 0 : isSensorChoice ? 120 : 180
          );
          const labelHitHeight = Math.max(
            securityLabelElement.offsetHeight,
            renderedBinding.deviceKind === "camera" ? 0 : isSensorChoice ? 32 : 58
          );
          markerElement.style.width = Math.max(hitSize, labelHitWidth * securityLabelScale) + "px";
          markerElement.style.height = Math.max(hitSize, labelHitHeight * securityLabelScale) + "px";
        }
      }
      markerElement.classList.toggle("i3d-vacuum-room", isVacuumRoomMarker);
      markerElement.classList.toggle(
        "is-icon-hidden",
        isVacuumRoomMarker && renderedBinding.iconHidden === true
      );
      if (isVacuumRoomMarker) {
        let roomLabelElement = markerElement.querySelector(".i3d-room-label");
        if (!roomLabelElement) {
          roomLabelElement = ctx.makeElement("span", "i3d-room-label");
          markerElement.append(roomLabelElement);
        }
        roomLabelElement.textContent = renderedBinding.label || "清扫";
        roomLabelElement.hidden = renderedBinding.labelHidden === true;
        // 房间名是 chip 而不是整块缩放的元素，这里直接放字号；CSS 里的内边距 / 圆角已改成 em，
        roomLabelElement.style.fontSize =
          (renderedBinding.fontSize || 12) * MARKER_LABEL_SCALE + "px";
      }
      markerElement.style.setProperty("--i3d-marker-size", markerSize + "px");
      markerElement.style.setProperty("--i3d-marker-icon-size", iconSize + "px");
      markerElement.setAttribute(
        "aria-label",
        renderedBinding.overviewQuip
          ? ctx.vacuumQuip(renderedBinding, ctx.statesByEntityId, performance.now())
          : renderedBinding.label || deviceState.name || "灯光"
      );
      if (!isVacuumMarker) {
        markerElement.title = renderedBinding.label || deviceState.name;
      }
      markerElement.classList.toggle(
        "is-on",
        renderedBinding.deviceKind === "cover" && !isCurtainGroupMarker
          ? ctx.coverIconIsOn(renderedBinding, deviceState)
          : deviceState.on
      );
      markerElement.classList.toggle("is-offline", !ctx.isEditing && !deviceState.available);
      markerElement.classList.toggle("is-nas", renderedBinding.deviceKind === "nas");
      markerElement.classList.toggle("is-selected", ctx.isEditing && ctx.selectedId === renderedBinding.id);
    }
    ctx.applyLightStates();
    ctx.renderStage();
    ctx.renderLightPanel();
    ctx.layoutStage();
    updateMarkerVisibility();
    updateMarkerPositions(true);
  }

  /**
   * 把标记的世界坐标投影成屏幕坐标并摆放 DOM：空闲超过 240ms 且没有扫地机在动时跳过（省每帧投影），
   * @param {boolean} [forceLayout=false] 强制重排，忽略签名缓存。
   */
  function updateMarkerPositions(forceLayout = false) {
    if (ctx.isRangeEditorOpen || ctx.isSceneUpdating || ctx.isDisposed) {
      return;
    }
    const moduleBindings = ctx.collectModuleBindings();
    if (ctx.stageOptions.floorTransitionActive || ctx.cameraTransition) {
      ctx.screenOutlines.pause();
    }
    ctx.screenOutlines.update();
    if (
      ctx.idleSinceTimestamp !== null &&
      performance.now() - ctx.idleSinceTimestamp >= 240 &&
      !moduleBindings.some(
        positionedMarkerBinding =>
          positionedMarkerBinding.deviceKind === "vacuum" &&
          ctx.vacuumStatusPresentation(positionedMarkerBinding, ctx.statesByEntityId).active
      )
    ) {
      ctx.markerLayoutSignature = "";
      return;
    }
    ctx.stageOptions.camera.updateMatrixWorld();
    if (ctx.cachedSceneDocument !== ctx.stageOptions.document || ctx.cachedMarkerFloorId !== ctx.currentFloorId) {
      ctx.markerPointsById.clear();
      ctx.cachedSceneDocument = ctx.stageOptions.document;
      ctx.cachedMarkerFloorId = ctx.currentFloorId;
    }
    const viewportRect = ctx.presentationLayout || ctx.containerElement.getBoundingClientRect();
    const viewportWidth = ctx.presentationLayout?.width || viewportRect.width;
    const viewportHeight = ctx.presentationLayout?.height || viewportRect.height;
    if (ctx.moduleTransition && ctx.stageOptions.presentationPoint) {
      for (const outgoingMarker of ctx.moduleTransition.outgoing) {
        if (!outgoingMarker.node) {
          continue;
        }
        const markerWorldPoint = ctx.stageOptions.presentationPoint(
          outgoingMarker.floorId,
          outgoingMarker.x,
          outgoingMarker.y,
          outgoingMarker.height
        );
        if (!markerWorldPoint) {
          outgoingMarker.node.hidden = true;
          continue;
        }
        const markerProjectedPoint = markerWorldPoint.project(ctx.stageOptions.camera);
        outgoingMarker.node.hidden =
          markerProjectedPoint.z < -1 ||
          markerProjectedPoint.z > 1 ||
          Math.abs(markerProjectedPoint.x) > 1.05 ||
          Math.abs(markerProjectedPoint.y) > 1.05;
        outgoingMarker.node.style.left = ((markerProjectedPoint.x + 1) * viewportWidth) / 2 + "px";
        outgoingMarker.node.style.top = ((1 - markerProjectedPoint.y) * viewportHeight) / 2 + "px";
      }
    }
    const isUniformOverview =
      ctx.currentFloorId === "all" && ctx.stageOptions.document.uniformOverviewStack === true;
    const layoutSignature =
      viewportWidth +
      ":" +
      viewportHeight +
      ":" +
      isUniformOverview +
      ":" +
      ctx.stageOptions.camera.matrixWorld.elements +
      ":" +
      ctx.stageOptions.camera.projectionMatrix.elements;
    if (
      forceLayout === true ||
      !!ctx.stageOptions.floorTransitionActive ||
      layoutSignature !== ctx.markerLayoutSignature
    ) {
      ctx.markerLayoutSignature = layoutSignature;
      for (const markerBindingEntry of moduleBindings) {
        const markerPositionBinding =
          ctx.markerDragState?.id === markerBindingEntry.id
            ? {
                ...markerBindingEntry,
                ...ctx.markerDragState.point
              }
            : markerBindingEntry;
        const markerBindingId = markerPositionBinding.id;
        const markerElementRef = ctx.markersById.get(markerBindingId);
        if (!markerElementRef) {
          continue;
        }
        const isMarkerVisible =
          (ctx.isEditing || markerPositionBinding.visible !== false) &&
          (ctx.isEditing || markerPositionBinding.buttonHidden !== true) &&
          markerPositionBinding.modelAvailable !== false &&
          (ctx.currentFloorId === "all" || markerPositionBinding.floorId === ctx.currentFloorId);
        let cachedMarkerPoint = ctx.markerPointsById.get(markerBindingId);
        if (
          isMarkerVisible &&
          (!cachedMarkerPoint ||
            cachedMarkerPoint.floorId !== markerPositionBinding.floorId ||
            cachedMarkerPoint.x !== markerPositionBinding.x ||
            cachedMarkerPoint.y !== markerPositionBinding.y ||
            cachedMarkerPoint.height !== markerPositionBinding.height)
        ) {
          cachedMarkerPoint = {
            floorId: markerPositionBinding.floorId,
            x: markerPositionBinding.x,
            y: markerPositionBinding.y,
            height: markerPositionBinding.height,
            point: ctx.stageOptions.worldPoint(
              markerPositionBinding.floorId,
              markerPositionBinding.x,
              markerPositionBinding.y,
              markerPositionBinding.height
            )
          };
          ctx.markerPointsById.set(markerBindingId, cachedMarkerPoint);
        }
        const resolvedMarkerPoint =
          isMarkerVisible &&
          ((ctx.stageOptions.floorTransitionActive || isUniformOverview) &&
          ctx.stageOptions.presentationPoint
            ? ctx.stageOptions.presentationPoint(
                markerPositionBinding.floorId,
                markerPositionBinding.x,
                markerPositionBinding.y,
                markerPositionBinding.height
              )
            : cachedMarkerPoint?.point);
        if (!resolvedMarkerPoint) {
          markerElementRef.hidden = true;
          continue;
        }
        const projectedMarkerPoint = ctx.tempProjectedPoint
          .copy(resolvedMarkerPoint)
          .project(ctx.stageOptions.camera);
        markerElementRef.hidden =
          projectedMarkerPoint.z < -1 ||
          projectedMarkerPoint.z > 1 ||
          Math.abs(projectedMarkerPoint.x) > 1.05 ||
          Math.abs(projectedMarkerPoint.y) > 1.05;
        markerElementRef.style.left = ((projectedMarkerPoint.x + 1) * viewportWidth) / 2 + "px";
        markerElementRef.style.top = ((1 - projectedMarkerPoint.y) * viewportHeight) / 2 + "px";
      }
    }
  }

  // 依据楼层过渡进度与相机过渡状态决定标记可见性：过渡未揭开标记时隐藏，
  function updateMarkerVisibility() {
    const isFloorMarkersTransitioning =
      ctx.cameraTransition?.owner === "floor" && !ctx.cameraTransition.markersRevealed;
    const hasHiddenClickable =
      !ctx.isEditing &&
      !ctx.isViewEditing &&
      ctx.collectModuleBindings().some(
        concealedMarkerBinding =>
          concealedMarkerBinding.visible !== false &&
          concealedMarkerBinding.buttonHidden !== true &&
          concealedMarkerBinding.hiddenClickable === true
      );
    const shouldConcealMarkers =
      isFloorMarkersTransitioning ||
      ctx.hasUserInteracted ||
      ctx.areIconsHiddenByRotation ||
      (ctx.areIdleIconsHidden && !hasHiddenClickable) ||
      (ctx.hasIdleReturnPending && ctx.pageBehavior.hideIconsWhileRotating === true) ||
      (!!ctx.focusMode && !["edit", "panel"].includes(ctx.focusMode));
    for (const [markerId, marker] of ctx.markersById) {
      const isButtonHidden = !ctx.isEditing && ctx.findBinding(markerId)?.buttonHidden === true;
      const isHiddenClickable =
        !ctx.isEditing &&
        !ctx.isViewEditing &&
        !isButtonHidden &&
        ctx.findBinding(markerId)?.hiddenClickable === true;
      marker.disabled =
        ctx.cameraTransition?.owner === "floor" ||
        isButtonHidden ||
        (!ctx.isEditing && (ctx.isOverviewMode() || ctx.findBinding(markerId)?.overviewQuip === true));
      const visibilityBinding = ctx.findBinding(markerId);
      const isPassiveMarker =
        !ctx.isEditing &&
        (visibilityBinding?.passiveSensor ||
          (visibilityBinding?.deviceKind === "vacuum" &&
            ctx.vacuumStatusPresentation(visibilityBinding, ctx.statesByEntityId).active));
      const markerLayerElement = isPassiveMarker ? ctx.vacuumWorkingLayerElement : ctx.markersElement;
      if (marker.parentElement !== markerLayerElement) {
        markerLayerElement.append(marker);
      }
      const isIdleHidden =
        (isFloorMarkersTransitioning && isPassiveMarker) ||
        (!isPassiveMarker &&
          (ctx.areIdleIconsHidden || ctx.areIconsHiddenByRotation) &&
          !isHiddenClickable &&
          !ctx.isEditing &&
          !ctx.isViewEditing);
      marker.classList.toggle("is-hidden-clickable", isHiddenClickable);
      marker.classList.toggle("is-idle-hidden", isIdleHidden);
      if (
        isIdleHidden ||
        isButtonHidden ||
        (!ctx.isEditing && (ctx.isOverviewMode() || ctx.findBinding(markerId)?.overviewQuip === true))
      ) {
        ctx.moveFocusInto(marker);
        marker.setAttribute("inert", "");
      } else {
        marker.removeAttribute("inert");
      }
      marker.title = isHiddenClickable ? "" : marker.getAttribute("aria-label") || "";
    }
    if (shouldConcealMarkers) {
      ctx.moveFocusInto(
        ctx.markersElement,
        ctx.lightPanelElement.classList.contains("is-open") ? ctx.lightPanelElement : ctx.canvasElement
      );
      ctx.markersElement.setAttribute("inert", "");
    } else if (ctx.moduleTransition) {
      ctx.markersElement.setAttribute("inert", "");
    } else {
      ctx.markersElement.removeAttribute("inert");
    }
    ctx.markersElement.removeAttribute("aria-hidden");
    if (shouldConcealMarkers && ctx.idleSinceTimestamp === null) {
      ctx.idleSinceTimestamp = performance.now();
    } else if (!shouldConcealMarkers) {
      ctx.idleSinceTimestamp = null;
    }
    ctx.markersElement.style.transition = isFloorMarkersTransitioning ? "none" : "";
    ctx.markersElement.style.opacity = isFloorMarkersTransitioning ? "0" : "";
    ctx.markersElement.classList.toggle("is-concealed", shouldConcealMarkers);
  }

  // 开始拖拽标记：只在编辑态、无聚焦、鼠标左键时生效，并把指针捕获到元素上，
  function beginMarkerDrag(dragStartEvent, dragBindingId) {
    if (!ctx.isEditing || ctx.focusMode || dragStartEvent.button !== 0) {
      return;
    }
    dragStartEvent.preventDefault();
    dragStartEvent.stopPropagation();
    const draggedBinding = ctx.findBinding(dragBindingId);
    if (!draggedBinding) {
      return;
    }
    if (draggedBinding.deviceKind === "presence") {
      ctx.selectedId = dragBindingId;
      ctx.renderStage();
      ctx.postToHost({
        type: "edit",
        action: "select",
        id: dragBindingId
      });
      return;
    }
    ctx.selectedId = dragBindingId;
    ctx.renderStage();
    ctx.postToHost({
      type: "edit",
      action: "select",
      id: dragBindingId
    });
    const pointerOffset = ctx.pointerToFloorPoint(dragStartEvent, draggedBinding);
    ctx.markerDragState = {
      id: dragBindingId,
      pointerId: dragStartEvent.pointerId,
      clientX: dragStartEvent.clientX,
      clientY: dragStartEvent.clientY,
      original: {
        x: draggedBinding.x,
        y: draggedBinding.y
      },
      point: {
        x: draggedBinding.x,
        y: draggedBinding.y
      },
      height: draggedBinding.height,
      offset: pointerOffset
        ? {
            x: draggedBinding.x - pointerOffset.x,
            y: draggedBinding.y - pointerOffset.y
          }
        : {
            x: 0,
            y: 0
          },
      moved: false
    };
    ctx.capturePointer(dragStartEvent.currentTarget, dragStartEvent.pointerId);
    ctx.stageOptions.controls.enabled = false;
  }

  function moveMarkerDrag(dragMoveEvent) {
    if (
      !ctx.markerDragState ||
      ctx.markerDragState.pointerId !== dragMoveEvent.pointerId ||
      (Math.hypot(
        dragMoveEvent.clientX - ctx.markerDragState.clientX,
        dragMoveEvent.clientY - ctx.markerDragState.clientY
      ) < 4 &&
        !ctx.markerDragState.moved)
    ) {
      return;
    }
    const draggedPosition = ctx.pointerToFloorPoint(dragMoveEvent, ctx.findBinding(ctx.markerDragState.id));
    if (draggedPosition) {
      ctx.markerDragState.moved = true;
      ctx.markerDragState.point = {
        x: Math.round((draggedPosition.x + ctx.markerDragState.offset.x) * 100) / 100,
        y: Math.round((draggedPosition.y + ctx.markerDragState.offset.y) * 100) / 100
      };
      if (ctx.activeModule === "light") {
        Object.assign(ctx.findBinding(ctx.markerDragState.id), ctx.markerDragState.point);
      }
      updateMarkerPositions(true);
    }
  }

  // 结束拖拽：把最终坐标回报宿主落库；在元素上打 dataset.dragged，
  function endMarkerDrag(dragEndEvent) {
    if (!!ctx.markerDragState && ctx.markerDragState.pointerId === dragEndEvent.pointerId) {
      if (ctx.markerDragState.moved) {
        dragEndEvent.currentTarget.dataset.dragged = "true";
        const draggedBindingEntry = ctx.findBinding(ctx.markerDragState.id);
        const draggedModel =
          draggedBindingEntry.deviceKind === "camera"
            ? ctx.config.security?.cameras?.find(
                draggedCameraEntry => "camera:" + draggedCameraEntry.id === draggedBindingEntry.id
              )
            : draggedBindingEntry.deviceKind === "vacuum-room"
              ? ctx.config.devices?.vacuums
                  ?.find(
                    draggedVacuumEntry => draggedVacuumEntry.id === draggedBindingEntry.vacuumId
                  )
                  ?.shortcuts?.find(
                    draggedShortcutEntry =>
                      draggedShortcutEntry.id === draggedBindingEntry.shortcutId
                  )
            : draggedBindingEntry.deviceKind === "temperature-humidity"
              ? ctx.config.environment?.temperatureHumidity?.find(
                  draggedMeterEntry => draggedMeterEntry.id === draggedBindingEntry.id
                )
              : draggedBindingEntry.isCurtainGroup
                ? // 组合条目的 id 带 "curtain-group:" 前缀，不能按裸 id 去 curtains 里找；
                  // 反查到的组合才是要写回 x / y 的那条配置。
                  ctx.config.environment?.curtainGroups?.find(
                    draggedGroupEntry =>
                      curtainGroupEntryId(draggedGroupEntry) === draggedBindingEntry.id
                  )
                : ctx.activeModule === "light"
                ? draggedBindingEntry
                : (["nas", "television", "vacuum"].includes(ctx.activeModule)
                    ? ctx.config.devices?.[
                        ctx.activeModule === "vacuum"
                          ? "vacuums"
                          : ctx.activeModule === "television"
                            ? "televisions"
                            : "nas"
                      ] || []
                    : ctx.activeModule === "cover"
                      ? ctx.config.environment?.curtains || []
                      : // 净化器与空调同属 climate 模块，但配置分属两个集合：拖拽写回必须两个都找，
                        // 否则净化器标记拖完落不回配置（位置弹回原处，且浏览器里不报错）。
                        [
                          ...(ctx.config.environment?.airConditioners || []),
                          ...(ctx.config.environment?.airPurifiers || [])
                        ]
                  ).find(deviceEntry => deviceEntry.id === ctx.markerDragState.id);
        if (draggedModel) {
          Object.assign(draggedModel, ctx.markerDragState.point);
        }
        ctx.postToHost({
          type: "edit",
          action: "position",
          id: draggedBindingEntry.id,
          x: ctx.markerDragState.point.x,
          y: ctx.markerDragState.point.y
        });
      }
      ctx.markerDragState = null;
      ctx.syncCameraInteraction();
    }
  }

  // 取消拖拽：灯光模块下把坐标回滚到按下时的快照，其它模块交给
  function cancelMarkerDrag() {
    if (ctx.markerDragState && ctx.activeModule === "light") {
      Object.assign(ctx.findBinding(ctx.markerDragState.id), ctx.markerDragState.original);
    }
    ctx.markerDragState = null;
    ctx.syncCameraInteraction();
    updateMarkerPositions(true);
  }

  let pendingMarkerPositionFrameId = 0;
  let pendingMarkerForceLayout = false;

  /** 合并同一帧内的多次相机 change，每帧最多投影一次。 */
  function scheduleMarkerPositionUpdate(forceLayout = false) {
    if (forceLayout === true) {
      pendingMarkerForceLayout = true;
    }
    if (pendingMarkerPositionFrameId) {
      return;
    }
    pendingMarkerPositionFrameId = requestAnimationFrame(() => {
      pendingMarkerPositionFrameId = 0;
      const force = pendingMarkerForceLayout;
      pendingMarkerForceLayout = false;
      updateMarkerPositions(force);
    });
  }

  return {
    beginMarkerDrag,
    cancelMarkerDrag,
    endMarkerDrag,
    moveMarkerDrag,
    renderMarkers,
    scheduleMarkerPositionUpdate,
    updateMarkerPositions,
    updateMarkerVisibility
  };
}
