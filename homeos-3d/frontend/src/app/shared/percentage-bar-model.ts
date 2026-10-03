export const PERCENTAGE_BAR_LIMIT = 8,
  percentageBarDefaults = Object.freeze({
    variant: "gradient",
    orientation: "vertical" as "vertical" | "horizontal",
    thickness: 48,
    length: 300,
    gap: 52,
    valueGap: 11,
    labelGap: 16,
    valueSize: 26,
    labelSize: 11,
    radius: 5,
    valueOffsetX: 0,
    valueOffsetY: 0,
    labelOffsetX: 0,
    labelOffsetY: 0,
    fillOpacity: 32,
    precision: 0,
    valueVisible: true,
    labelVisible: true,
    valueColor: "#dce1e5",
    labelColor: "#94a5b3",
  }),
  percentageBarNumbers = Object.freeze({
    thickness: [8, 96],
    length: [80, 600],
    gap: [0, 80],
    valueGap: [0, 40],
    labelGap: [0, 40],
    valueSize: [12, 48],
    labelSize: [8, 24],
    radius: [0, 24],
    fillOpacity: [5, 90],
    precision: [0, 2],
    valueOffsetX: [-600, 600],
    valueOffsetY: [-600, 600],
    labelOffsetX: [-600, 600],
    labelOffsetY: [-600, 600],
  });
export function percentageBarSeries(component) {
  const series = component.properties?.series ?? component.bindings?.series;
  return Array.isArray(series) && series.length
    ? series
    : [
        {
          entityId: component.bindings?.entity?.entityId || "",
          label: "",
          color: "#f2a20d",
        },
      ];
}
export function percentageBarDimensions(overrides = {}, barCount = 1) {
  const options = {
    ...percentageBarDefaults,
    ...overrides,
  };
  for (const [optionKey, [minValue, maxValue]] of Object.entries(percentageBarNumbers))
    options[optionKey] = Number.isFinite(Number(options[optionKey]))
      ? Math.max(minValue, Math.min(maxValue, Number(options[optionKey])))
      : percentageBarDefaults[optionKey];
  const num = options.valueVisible ? options.valueSize + options.valueGap : 0,
    labelSpan = options.labelVisible ? options.labelGap + options.labelSize * 2.9 : 0;
  return options.orientation === "horizontal"
    ? {
        width:
          16 +
          (options.labelVisible ? 84 + options.labelGap : 0) +
          options.length +
          (options.valueVisible ? options.valueGap + Math.max(64, options.valueSize * 3.4) : 0),
        height: barCount * options.thickness + (barCount - 1) * options.gap,
      }
    : {
        width:
          Math.max(
            options.thickness,
            options.valueVisible ? options.valueSize * 3.4 : 0,
            options.labelVisible ? options.thickness + Math.min(options.gap, 32) : 0,
          ) +
          (barCount - 1) * (options.thickness + options.gap) +
          16,
        height: options.length + num + labelSpan,
      };
}
function refitPercentageBar(refitComponent, nextOptions, refitBarCount) {
  const percentageBarDimensions2 = percentageBarDimensions(nextOptions, refitBarCount),
    percentageBarDimensions3 = percentageBarDimensions(
      refitComponent.properties,
      percentageBarSeries(refitComponent).length,
    ),
    currentPosition = refitComponent.position || {},
    width = Number(currentPosition.width) || percentageBarDimensions2.width,
    height = Number(currentPosition.height) || percentageBarDimensions2.height,
    min = Math.min(
      width / percentageBarDimensions2.width,
      height / percentageBarDimensions2.height,
    );
  refitComponent.position = {
    ...currentPosition,
    width: percentageBarDimensions3.width * min,
    height: percentageBarDimensions3.height * min,
    x: (Number(currentPosition.x) || 0) + (width - percentageBarDimensions3.width * min) / 2,
    y: (Number(currentPosition.y) || 0) + (height - percentageBarDimensions3.height * min) / 2,
  };
}
export function applyPercentageBarChange(
  editedComponent,
  change,
  viewport: { width?: number; height?: number } = {},
) {
  const mergedOptions = {
      ...percentageBarDefaults,
      ...editedComponent.properties,
    },
    map = percentageBarSeries(editedComponent).map((entry) => ({
      ...entry,
    })),
    seriesCount = map.length;
  let shouldRefit = false;
  if (
    ((editedComponent.properties = {
      ...mergedOptions,
      series: map,
    }),
    (editedComponent.style = {
      ...editedComponent.style,
    }),
    (editedComponent.position = {
      ...editedComponent.position,
    }),
    (editedComponent.actions = {}),
    change.add && map.length < 8)
  )
    (map.push({
      entityId: "",
      attribute: "",
      label: "",
      color: ["#f2a20d", "#68cc3e", "#94a5b3"][map.length % 3],
    }),
      (shouldRefit = true));
  else {
    if (Number.isInteger(change.seriesIndex) && map[change.seriesIndex]) {
      const seriesIndex = change.seriesIndex;
      change.remove && map.length > 1
        ? (map.splice(seriesIndex, 1), (shouldRefit = true))
        : change.move && map[seriesIndex + change.move]
          ? ([map[seriesIndex], map[seriesIndex + change.move]] = [
              map[seriesIndex + change.move],
              map[seriesIndex],
            ])
          : change.patch &&
            (map[seriesIndex] = {
              ...map[seriesIndex],
              ...change.patch,
            });
    } else {
      if (change.property) {
        let nextValue = change.value;
        const numericRange = percentageBarNumbers[change.property];
        if (numericRange) {
          if (!Number.isFinite(Number(nextValue))) return;
          nextValue = Math.max(numericRange[0], Math.min(numericRange[1], Number(nextValue)));
        }
        ((editedComponent.properties[change.property] = nextValue),
          (shouldRefit = [
            "orientation",
            "thickness",
            "length",
            "gap",
            "valueGap",
            "labelGap",
            "valueSize",
            "labelSize",
            "valueVisible",
            "labelVisible",
          ].includes(change.property)));
      } else {
        if (change.geometry) {
          const numericValue = Number(change.value);
          if (!Number.isFinite(numericValue)) return;
          (change.geometry === "left" &&
            (editedComponent.position.x =
              ((viewport.width || 2778) * numericValue) / 100 - editedComponent.position.width / 2),
            change.geometry === "top" &&
              (editedComponent.position.y =
                ((viewport.height || 1940) * numericValue) / 100 -
                editedComponent.position.height / 2),
            change.geometry === "scale" && (editedComponent.style.scale = numericValue / 100),
            change.geometry === "rotation" && (editedComponent.position.rotation = numericValue));
        }
      }
    }
  }
  shouldRefit && refitPercentageBar(editedComponent, mergedOptions, seriesCount);
}
