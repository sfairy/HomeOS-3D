
export function lightSignatureOf(lightList: any) {
  let lightListSpotLightCount = 0,
    rectAreaLightCount = 0,
    pointLightCount = 0,
    otherLightCount = 0;
  for (const lightListLightEntry of lightList)
    lightListLightEntry.isSpotLight
      ? (lightListSpotLightCount += 1)
      : lightListLightEntry.isRectAreaLight
        ? (rectAreaLightCount += 1)
        : lightListLightEntry.isPointLight
          ? (pointLightCount += 1)
          : (otherLightCount += 1);
  return (
    lightListSpotLightCount +
    ":" +
    rectAreaLightCount +
    ":" +
    pointLightCount +
    ":" +
    otherLightCount
  );
}
