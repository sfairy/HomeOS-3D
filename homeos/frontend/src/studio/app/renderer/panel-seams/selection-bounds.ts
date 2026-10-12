import type { PanelRenderer } from "../panel-renderer";

export function updateAirConditionerButtonSelectionBounds(self: PanelRenderer, acBoundsHostElement: any,
    acBoundsComponent: any,
    acBoundsElement: any,) {
    if (!acBoundsHostElement || acBoundsComponent?.type !== "air-conditioner" || !acBoundsElement)
      return;
    const acProperties = acBoundsComponent.properties || {},
      acWidth = Math.max(1, Number(acBoundsComponent.position?.width || 100)),
      acHeight = Math.max(1, Number(acBoundsComponent.position?.height || 100)),
      acComponentScale = Math.max(0.01, Number(self.document?.canvas?.componentScale || 1)),
      acBoundsEntries: any = [],
      clampOptionValue = (optionRawValue: any, optionMinValue: any, optionMaxValue: any, optionFallbackValue: any) => {
        const optionNumericValue = Number(optionRawValue);
        return Math.max(
          optionMinValue,
          Math.min(
            optionMaxValue,
            Number.isFinite(optionNumericValue) ? optionNumericValue : optionFallbackValue,
          ),
        );
      },
      pushBoundsRect = (rectCenterX: any, rectCenterY: any, rectWidth: any, rectHeight: any) => {
        acBoundsEntries.push({
          left: rectCenterX - rectWidth / 2,
          top: rectCenterY - rectHeight / 2,
          right: rectCenterX + rectWidth / 2,
          bottom: rectCenterY + rectHeight / 2,
        });
      },
      measureIconBounds = (iconElement: any, iconLeftOption: any, iconTopOption: any, iconMinSize: any) => {
        const iconWidth = Math.max(
            iconMinSize,
            Number(iconElement?.offsetWidth || 0) * acComponentScale,
          ),
          iconHeight = Math.max(
            iconMinSize,
            Number(iconElement?.offsetHeight || 0) * acComponentScale,
          ),
          iconLeft = (acWidth * clampOptionValue(iconLeftOption, -100, 200, 0)) / 100,
          iconTop = (acHeight * clampOptionValue(iconTopOption, -100, 200, 50)) / 100;
        acBoundsEntries.push({
          left: iconLeft,
          top: iconTop - iconHeight / 2,
          right: iconLeft + iconWidth,
          bottom: iconTop + iconHeight / 2,
        });
      },
      badgeSize = (acHeight * clampOptionValue(acProperties.badgeSize, 1, 100, 28)) / 100;
    if (
      (acProperties.iconVisible !== false &&
        pushBoundsRect(
          (acWidth * clampOptionValue(acProperties.iconLeft, -100, 200, 20)) / 100,
          (acHeight * clampOptionValue(acProperties.iconTop, -100, 200, 50)) / 100,
          badgeSize,
          badgeSize,
        ),
      acProperties.mainTextVisible !== false &&
        measureIconBounds(
          acBoundsHostElement.querySelector(
            ":scope > .hb-air-conditioner .hb-air-conditioner-text strong",
          ),
          acProperties.mainTextLeft,
          acProperties.mainTextTop,
          (acHeight * clampOptionValue(acProperties.mainSize, 6, 120, 21)) / 100,
        ),
      acProperties.secondaryTextVisible !== false &&
        measureIconBounds(
          acBoundsHostElement.querySelector(
            ":scope > .hb-air-conditioner .hb-air-conditioner-text small",
          ),
          acProperties.secondaryTextLeft,
          acProperties.secondaryTextTop,
          (acHeight * clampOptionValue(acProperties.secondarySize, 5, 80, 12)) / 100,
        ),
      !acBoundsEntries.length)
    ) {
      Object.assign(acBoundsElement.style, {
        left: "0px",
        top: "0px",
        width: acWidth + "px",
        height: acHeight + "px",
      });
      return;
    }
    const acBoundsPadding = 4,
      acBoundsLeft = Math.min(...acBoundsEntries.map((acEntry: any) => acEntry.left)) - acBoundsPadding,
      acBoundsTop =
        Math.min(...acBoundsEntries.map((acEntryTop: any) => acEntryTop.top)) - acBoundsPadding,
      acBoundsRight =
        Math.max(...acBoundsEntries.map((acBoundsEntryRight: any) => acBoundsEntryRight.right)) +
        acBoundsPadding,
      acBoundsBottom =
        Math.max(...acBoundsEntries.map((acBoundsEntryBottom: any) => acBoundsEntryBottom.bottom)) +
        acBoundsPadding;
    Object.assign(acBoundsElement.style, {
      left: acBoundsLeft + "px",
      top: acBoundsTop + "px",
      width: Math.max(1, acBoundsRight - acBoundsLeft) + "px",
      height: Math.max(1, acBoundsBottom - acBoundsTop) + "px",
    });
  }
export function updateDeviceButtonSelectionBounds(self: PanelRenderer, deviceBoundsHostElement: any,
    deviceBoundsComponent: any,
    deviceBoundsElement: any,) {
    if (
      !deviceBoundsHostElement ||
      deviceBoundsComponent?.type !== "device-button" ||
      !deviceBoundsElement
    )
      return false;
    const deviceProperties = deviceBoundsComponent.properties || {},
      isHiddenContentClickable = deviceProperties.hiddenContentClickable === true,
      deviceWidth = Math.max(1, Number(deviceBoundsComponent.position?.width || 100)),
      deviceHeight = Math.max(1, Number(deviceBoundsComponent.position?.height || 100)),
      deviceComponentScale = Math.max(0.01, Number(self.document?.canvas?.componentScale || 1)),
      deviceBoundsEntries: any = [],
      clampDeviceValue = (
        deviceOptionRaw: any,
        deviceOptionMin: any,
        deviceOptionMax: any,
        deviceOptionFallback: any,
      ) => {
        const deviceOptionNumber = Number(deviceOptionRaw);
        return Math.max(
          deviceOptionMin,
          Math.min(
            deviceOptionMax,
            Number.isFinite(deviceOptionNumber) ? deviceOptionNumber : deviceOptionFallback,
          ),
        );
      },
      pushDeviceBoundsRect = (
        deviceRectCenterX: any,
        deviceRectCenterY: any,
        deviceRectWidth: any,
        deviceRectHeight: any,
      ) => {
        ![deviceRectCenterX, deviceRectCenterY, deviceRectWidth, deviceRectHeight].every(
          Number.isFinite,
        ) ||
          deviceRectWidth <= 0 ||
          deviceRectHeight <= 0 ||
          deviceBoundsEntries.push({
            left: deviceRectCenterX - deviceRectWidth / 2,
            top: deviceRectCenterY - deviceRectHeight / 2,
            right: deviceRectCenterX + deviceRectWidth / 2,
            bottom: deviceRectCenterY + deviceRectHeight / 2,
          });
      },
      measureDeviceIconBounds = (
        deviceIconElement: any,
        deviceIconLeftOption: any,
        deviceIconTopOption: any,
        deviceIconMinSize: any,
      ) => {
        const deviceIconWidth = Math.max(
            deviceIconMinSize,
            Number(deviceIconElement?.offsetWidth || 0) * deviceComponentScale,
          ),
          deviceIconHeight = Math.max(
            deviceIconMinSize,
            Number(deviceIconElement?.offsetHeight || 0) * deviceComponentScale,
          ),
          deviceIconLeft =
            (deviceWidth * clampDeviceValue(deviceIconLeftOption, -100, 200, 0)) / 100,
          deviceIconTop =
            (deviceHeight * clampDeviceValue(deviceIconTopOption, -100, 200, 50)) / 100;
        deviceBoundsEntries.push({
          left: deviceIconLeft,
          top: deviceIconTop - deviceIconHeight / 2,
          right: deviceIconLeft + deviceIconWidth,
          bottom: deviceIconTop + deviceIconHeight / 2,
        });
      },
      deviceBadgeSize =
        (deviceHeight *
          clampDeviceValue(deviceProperties.badgeSize ?? deviceProperties.iconSize, 1, 100, 28)) /
        100;
    if (
      ((deviceProperties.iconVisible !== false || isHiddenContentClickable) &&
        pushDeviceBoundsRect(
          (deviceWidth * clampDeviceValue(deviceProperties.iconLeft, -100, 200, 20)) / 100,
          (deviceHeight * clampDeviceValue(deviceProperties.iconTop, -100, 200, 50)) / 100,
          deviceBadgeSize,
          deviceBadgeSize,
        ),
      (deviceProperties.mainTextVisible !== false || isHiddenContentClickable) &&
        measureDeviceIconBounds(
          deviceBoundsHostElement.querySelector(
            ":scope > .hb-icon-button .hb-icon-button-text strong",
          ),
          deviceProperties.mainTextLeft,
          deviceProperties.mainTextTop,
          (deviceHeight * clampDeviceValue(deviceProperties.mainSize, 6, 120, 21)) / 100,
        ),
      (deviceProperties.secondaryTextVisible !== false || isHiddenContentClickable) &&
        measureDeviceIconBounds(
          deviceBoundsHostElement.querySelector(
            ":scope > .hb-icon-button .hb-icon-button-text small",
          ),
          deviceProperties.secondaryTextLeft,
          deviceProperties.secondaryTextTop,
          (deviceHeight * clampDeviceValue(deviceProperties.secondarySize, 5, 80, 12)) / 100,
        ),
      !deviceBoundsEntries.length)
    )
      return false;
    const deviceBoundsPadding = 4,
      deviceBoundsLeft =
        Math.min(...deviceBoundsEntries.map((deviceEntry: any) => deviceEntry.left)) -
        deviceBoundsPadding,
      deviceBoundsTop =
        Math.min(...deviceBoundsEntries.map((deviceEntryTop: any) => deviceEntryTop.top)) -
        deviceBoundsPadding,
      deviceBoundsRight =
        Math.max(
          ...deviceBoundsEntries.map((deviceBoundsEntryRight: any) => deviceBoundsEntryRight.right),
        ) + deviceBoundsPadding,
      deviceBoundsBottom =
        Math.max(
          ...deviceBoundsEntries.map((deviceBoundsEntryBottom: any) => deviceBoundsEntryBottom.bottom),
        ) + deviceBoundsPadding;
    return (
      Object.assign(deviceBoundsElement.style, {
        left: deviceBoundsLeft + "px",
        top: deviceBoundsTop + "px",
        width: Math.max(1, deviceBoundsRight - deviceBoundsLeft) + "px",
        height: Math.max(1, deviceBoundsBottom - deviceBoundsTop) + "px",
      }),
      true
    );
  }
export function updateTitleButtonSelectionBounds(self: PanelRenderer, titleBoundsHostElement: any,
    titleBoundsComponent: any,
    titleBoundsElement: any,) {
    if (
      !titleBoundsHostElement ||
      titleBoundsComponent?.type !== "title-button" ||
      !titleBoundsElement
    )
      return false;
    const titleProperties = titleBoundsComponent.properties || {},
      isTitleHiddenContentClickable = titleProperties.hiddenContentClickable === true,
      titleWidth = Math.max(1, Number(titleBoundsComponent.position?.width || 100)),
      titleHeight = Math.max(1, Number(titleBoundsComponent.position?.height || 100)),
      titleComponentScale = Math.max(0.01, Number(self.document?.canvas?.componentScale || 1)),
      titleBoundsEntries: any = [],
      pushTitleBoundsRect = (
        titleRectCenterX: any,
        titleRectCenterY: any,
        titleRectWidth: any,
        titleRectHeight: any,
      ) => {
        ![titleRectCenterX, titleRectCenterY, titleRectWidth, titleRectHeight].every(
          Number.isFinite,
        ) ||
          titleRectWidth <= 0 ||
          titleRectHeight <= 0 ||
          titleBoundsEntries.push({
            left: titleRectCenterX,
            top: titleRectCenterY,
            right: titleRectCenterX + titleRectWidth,
            bottom: titleRectCenterY + titleRectHeight,
          });
      },
      clampTitleValue = (titleOptionRaw: any, titleOptionMin: any, titleOptionMax: any, titleOptionFallback: any) => {
        const titleOptionNumber = Number(titleOptionRaw);
        return Math.max(
          titleOptionMin,
          Math.min(
            titleOptionMax,
            Number.isFinite(titleOptionNumber) ? titleOptionNumber : titleOptionFallback,
          ),
        );
      };
    if (titleProperties.frameVisible !== false || isTitleHiddenContentClickable) {
      const frameSizeRatio = clampTitleValue(titleProperties.frameSize, 10, 300, 100) / 100,
        frameHeight = titleHeight * 0.45 * frameSizeRatio,
        frameCenterX =
          titleWidth / 2 +
          (titleWidth * clampTitleValue(titleProperties.frameOffsetX, -100, 100, 0)) / 100,
        frameCenterY =
          titleHeight / 2 +
          (titleHeight * clampTitleValue(titleProperties.frameOffsetY, -100, 100, 0)) / 100,
        frameHalfSpacing =
          (titleWidth * clampTitleValue(titleProperties.frameSpacing, 0, 300, 100)) / 200,
        frameBarWidth = titleHeight * 0.12,
        frameStrokeWidth = clampTitleValue(titleProperties.frameWidth, 0, 12, 1.5);
      (pushTitleBoundsRect(
        frameCenterX - frameHalfSpacing - frameStrokeWidth / 2,
        frameCenterY - frameHeight / 2 - frameStrokeWidth / 2,
        frameBarWidth + frameStrokeWidth,
        frameHeight + frameStrokeWidth,
      ),
        pushTitleBoundsRect(
          frameCenterX + frameHalfSpacing - frameBarWidth - frameStrokeWidth / 2,
          frameCenterY - frameHeight / 2 - frameStrokeWidth / 2,
          frameBarWidth + frameStrokeWidth,
          frameHeight + frameStrokeWidth,
        ));
    }
    if (titleProperties.mainTextVisible !== false || isTitleHiddenContentClickable) {
      const titleMainElement = titleBoundsHostElement.querySelector(
          ":scope > .hb-title-button .hb-title-button-main",
        ),
        mainTextSize = (titleHeight * clampTitleValue(titleProperties.mainSize, 8, 200, 34)) / 100;
      pushTitleBoundsRect(
        (titleWidth * clampTitleValue(titleProperties.mainTextLeft, -100, 200, 5.5)) / 100,
        (titleHeight * clampTitleValue(titleProperties.mainTextTop, -100, 200, 45)) / 100 -
          mainTextSize / 2,
        Math.max(mainTextSize, Number(titleMainElement?.offsetWidth || 0) * titleComponentScale),
        Math.max(mainTextSize, Number(titleMainElement?.offsetHeight || 0) * titleComponentScale),
      );
    }
    if (titleProperties.secondaryTextVisible !== false || isTitleHiddenContentClickable) {
      const titleSecondaryElement = titleBoundsHostElement.querySelector(
          ":scope > .hb-title-button .hb-title-button-secondary",
        ),
        secondaryTextSize =
          (titleHeight * clampTitleValue(titleProperties.secondarySize, 6, 100, 12)) / 100,
        secondaryTextHeight = Math.max(
          secondaryTextSize,
          Number(titleSecondaryElement?.offsetHeight || 0) * titleComponentScale,
        );
      pushTitleBoundsRect(
        (titleWidth * clampTitleValue(titleProperties.secondaryTextLeft, -100, 200, 54)) / 100,
        (titleHeight * clampTitleValue(titleProperties.secondaryTextTop, -100, 200, 43)) / 100 -
          secondaryTextHeight / 2,
        Math.max(
          secondaryTextSize,
          Number(titleSecondaryElement?.offsetWidth || 0) * titleComponentScale,
        ),
        secondaryTextHeight,
      );
    }
    if (
      (titleProperties.iconVisible !== false || isTitleHiddenContentClickable) &&
      titleProperties.icon
    ) {
      const titleIconSize =
        (titleHeight * clampTitleValue(titleProperties.iconSize, 1, 100, 30)) / 100;
      pushTitleBoundsRect(
        (titleWidth * clampTitleValue(titleProperties.iconLeft, -100, 200, 50)) / 100 -
          titleIconSize / 2,
        (titleHeight * clampTitleValue(titleProperties.iconTop, -100, 200, 45)) / 100 -
          titleIconSize / 2,
        titleIconSize,
        titleIconSize,
      );
    }
    if (titleProperties.markerVisible !== false || isTitleHiddenContentClickable) {
      const titleMarkerSize =
          (titleHeight * clampTitleValue(titleProperties.markerSize, 2, 60, 10)) / 100,
        titleMarkerLeft =
          (titleWidth * clampTitleValue(titleProperties.markerLeft, -100, 200, 1.8)) / 100,
        titleMarkerTop =
          (titleHeight * clampTitleValue(titleProperties.markerTop, -100, 200, 84)) / 100;
      pushTitleBoundsRect(
        titleMarkerLeft - titleMarkerSize * 0.58,
        titleMarkerTop,
        titleMarkerSize * 1.16,
        titleMarkerSize,
      );
    }
    if (!titleBoundsEntries.length) return false;
    const titleBoundsPadding = 4,
      titleBoundsLeft =
        Math.min(...titleBoundsEntries.map((titleEntry: any) => titleEntry.left)) - titleBoundsPadding,
      titleBoundsTop =
        Math.min(...titleBoundsEntries.map((titleEntryTop: any) => titleEntryTop.top)) -
        titleBoundsPadding,
      titleBoundsRight =
        Math.max(
          ...titleBoundsEntries.map((titleBoundsEntryRight: any) => titleBoundsEntryRight.right),
        ) + titleBoundsPadding,
      titleBoundsBottom =
        Math.max(
          ...titleBoundsEntries.map((titleBoundsEntryBottom: any) => titleBoundsEntryBottom.bottom),
        ) + titleBoundsPadding;
    return (
      Object.assign(titleBoundsElement.style, {
        left: titleBoundsLeft + "px",
        top: titleBoundsTop + "px",
        width: Math.max(1, titleBoundsRight - titleBoundsLeft) + "px",
        height: Math.max(1, titleBoundsBottom - titleBoundsTop) + "px",
      }),
      true
    );
  }
export function updateLightStatisticsSelectionBounds(self: PanelRenderer, statsBoundsHostElement: any,
    statsBoundsComponent: any,
    statsBoundsElement: any,) {
    if (
      !statsBoundsHostElement ||
      statsBoundsComponent?.type !== "light-statistics" ||
      !statsBoundsElement ||
      statsBoundsHostElement.hidden
    )
      return false;
    const statsRootElement = statsBoundsHostElement.querySelector(":scope > .hb-light-statistics");
    if (!statsRootElement) return false;
    const visibleStatsRows = [...statsRootElement.children].filter((statsRowElement) =>
      statsRowElement.hidden ||
      Number(statsRowElement.offsetWidth || 0) <= 0 ||
      Number(statsRowElement.offsetHeight || 0) <= 0
        ? false
        : window.getComputedStyle?.(statsRowElement).display !== "none",
    );
    if (!visibleStatsRows.length) return false;
    const statsComponentScale = Math.max(0.01, Number(self.document?.canvas?.componentScale || 1)),
      statsBoundsPadding = 4,
      statsBoundsLeft =
        (Math.min(
          ...visibleStatsRows.map((statsRowLeftElement) => statsRowLeftElement.offsetLeft),
        ) -
          statsBoundsPadding) *
        statsComponentScale,
      statsBoundsTop =
        (Math.min(...visibleStatsRows.map((statsRowTopElement) => statsRowTopElement.offsetTop)) -
          statsBoundsPadding) *
        statsComponentScale,
      statsBoundsRight =
        (Math.max(
          ...visibleStatsRows.map(
            (statsRowRightElement) =>
              statsRowRightElement.offsetLeft + statsRowRightElement.offsetWidth,
          ),
        ) +
          statsBoundsPadding) *
        statsComponentScale,
      statsBoundsBottom =
        (Math.max(
          ...visibleStatsRows.map(
            (statsRowBottomElement) =>
              statsRowBottomElement.offsetTop + statsRowBottomElement.offsetHeight,
          ),
        ) +
          statsBoundsPadding) *
        statsComponentScale;
    return (
      Object.assign(statsBoundsElement.style, {
        left: statsBoundsLeft + "px",
        top: statsBoundsTop + "px",
        width: Math.max(1, statsBoundsRight - statsBoundsLeft) + "px",
        height: Math.max(1, statsBoundsBottom - statsBoundsTop) + "px",
      }),
      true
    );
  }
export function updateTextSelectionBounds(self: PanelRenderer, textBoundsHostElement: any, textBoundsComponent: any, textBoundsElement: any) {
    return !textBoundsHostElement ||
      !["time", "date", "weather"].includes(textBoundsComponent?.type) ||
      !textBoundsElement
      ? false
      : self.withSelectionMeasurementHost(textBoundsHostElement, () => {
          const textRootElement = textBoundsHostElement.querySelector(
            ":scope > .hb-time-component, :scope > .hb-date-component, :scope > .hb-weather-component",
          );
          if (!textRootElement) return false;
          const visibleTextLines = (
              textBoundsComponent.type === "time"
                ? [
                    ...textRootElement.querySelectorAll(
                      ":scope > .hb-time-value, :scope > .hb-time-period",
                    ),
                  ]
                : textBoundsComponent.type === "date"
                  ? [
                      ...textRootElement.querySelectorAll(
                        ":scope > .hb-date-primary, :scope > .hb-date-lunar",
                      ),
                    ]
                  : [
                      ...textRootElement.querySelectorAll(
                        ":scope > .hb-weather-icon, :scope > .hb-weather-content > strong, :scope > .hb-weather-content > small",
                      ),
                    ]
            ).filter((textLineElement) => self.selectionElementIsVisible(textLineElement)),
            textComponentScale = Math.max(0.01, Number(self.document?.canvas?.componentScale || 1)),
            textWidth = Math.max(1, Number(textBoundsComponent.position?.width || 100)),
            textHeight = Math.max(1, Number(textBoundsComponent.position?.height || 100));
          if (!visibleTextLines.length) {
            const textMarkerSize = Math.min(
              32,
              Math.max(20, Math.min(textWidth, textHeight) * 0.2),
            );
            return (
              Object.assign(textBoundsElement.style, {
                left: (textWidth - textMarkerSize) / 2 + "px",
                top: (textHeight - textMarkerSize) / 2 + "px",
                width: textMarkerSize + "px",
                height: textMarkerSize + "px",
              }),
              false
            );
          }
          const textLineBoxes = visibleTextLines.map((textLine) =>
              self.selectionElementBox(textLine, textBoundsHostElement),
            ),
            textBoundsPadding = 3,
            textBoundsLeft =
              (Math.min(...textLineBoxes.map((textBoxEntry) => textBoxEntry.left)) -
                textBoundsPadding) *
              textComponentScale,
            textBoundsTop =
              (Math.min(...textLineBoxes.map((textBoxTop) => textBoxTop.top)) - textBoundsPadding) *
              textComponentScale,
            textBoundsRight =
              (Math.max(
                ...textLineBoxes.map((textBoxRight) => textBoxRight.left + textBoxRight.width),
              ) +
                textBoundsPadding) *
              textComponentScale,
            textBoundsBottom =
              (Math.max(
                ...textLineBoxes.map((textBoxBottom) => textBoxBottom.top + textBoxBottom.height),
              ) +
                textBoundsPadding) *
              textComponentScale;
          return (
            Object.assign(textBoundsElement.style, {
              left: textBoundsLeft + "px",
              top: textBoundsTop + "px",
              width: Math.max(1, textBoundsRight - textBoundsLeft) + "px",
              height: Math.max(1, textBoundsBottom - textBoundsTop) + "px",
            }),
            true
          );
        });
  }
export async function updateImageSelectionBounds(self: PanelRenderer, imageBoundsHostElement: any,
    imageBoundsComponent: any,
    imageBoundsElement: any,) {
    const imageDisplayElement = imageBoundsHostElement.querySelector(
      ":scope > .hb-image-component",
    );
    if (
      !imageDisplayElement ||
      ((!imageDisplayElement.complete || !imageDisplayElement.naturalWidth) &&
        (await new Promise((imageLoadHandler) => {
          (imageDisplayElement.addEventListener("load", imageLoadHandler, {
            once: true,
          }),
            imageDisplayElement.addEventListener("error", imageLoadHandler, {
              once: true,
            }));
        })),
      !imageBoundsHostElement.isConnected ||
        !imageBoundsElement.isConnected ||
        !imageDisplayElement.naturalWidth ||
        !imageDisplayElement.naturalHeight)
    )
      return;
    const imageWidth = Number(imageBoundsComponent.position?.width || 100),
      imageHeight = Number(imageBoundsComponent.position?.height || 100),
      imageNaturalRatio = imageDisplayElement.naturalWidth / imageDisplayElement.naturalHeight,
      imageBoxRatio = imageWidth / imageHeight,
      fittedWidth =
        imageNaturalRatio >= imageBoxRatio ? imageWidth : imageHeight * imageNaturalRatio,
      fittedHeight =
        imageNaturalRatio >= imageBoxRatio ? imageWidth / imageNaturalRatio : imageHeight,
      fittedLeft = (imageWidth - fittedWidth) / 2,
      fittedTop = (imageHeight - fittedHeight) / 2;
    Object.assign(imageBoundsElement.style, {
      left: (fittedLeft / imageWidth) * 100 + "%",
      top: (fittedTop / imageHeight) * 100 + "%",
      width: (fittedWidth / imageWidth) * 100 + "%",
      height: (fittedHeight / imageHeight) * 100 + "%",
    });
  }