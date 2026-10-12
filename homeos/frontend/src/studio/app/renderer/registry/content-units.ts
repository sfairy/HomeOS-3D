export function componentContentUnitsPx(unitsComponent: any, unitsRenderEnvironment: any) {
  const unitsComponentScale = Math.max(
    0.01,
    Number(unitsRenderEnvironment?.document?.canvas?.componentScale || 1),
  );
  return {
    width: Math.max(1, Number(unitsComponent?.position?.width || 100)) / unitsComponentScale / 100,
    height:
      Math.max(1, Number(unitsComponent?.position?.height || 100)) / unitsComponentScale / 100,
  };
}
export function navigationContentUnitPx(
  navigationUnitsComponent: any,
  navigationUnitsRenderEnvironment: any,
) {
  return (
    (componentContentUnitsPx(navigationUnitsComponent, navigationUnitsRenderEnvironment).height *
      100) /
    64.36
  );
}
