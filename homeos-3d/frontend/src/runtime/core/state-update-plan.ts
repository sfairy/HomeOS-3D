function boundEntityIds(
  candidate,
  collectedIdSet = new Set(),
  visitedObjectSet = new Set(),
) {
  if (typeof candidate == "string")
    /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(candidate) && collectedIdSet.add(candidate);
  else {
    if (candidate && typeof candidate == "object" && !visitedObjectSet.has(candidate)) {
      visitedObjectSet.add(candidate);
      for (const [entryKey, entryValue] of Object.entries(candidate))
        (boundEntityIds(entryKey, collectedIdSet, visitedObjectSet),
          boundEntityIds(entryValue, collectedIdSet, visitedObjectSet));
    }
  }
  return collectedIdSet;
}
export function createStateUpdatePlan(component, update) {
  return !update || typeof update != "object" || Array.isArray(update)
    ? null
    : buildStateUpdatePlan(bindLightingAndEnvironmentSets(component), update);
}
export function createStateUpdatePlanner() {
  let cachedComponent,
    cachedBindings;
  return {
    plan(component, update) {
      return !update || typeof update != "object" || Array.isArray(update)
        ? null
        : ((!cachedBindings || cachedComponent !== component) &&
            ((cachedComponent = component),
            (cachedBindings = bindLightingAndEnvironmentSets(component))),
          buildStateUpdatePlan(cachedBindings, update));
    },
    invalidate() {
      cachedComponent = cachedBindings = undefined;
    },
  };
}
function buildStateUpdatePlan(boundBindings, update) {
  if (!update || typeof update != "object" || Array.isArray(update)) return null;
  const changedKeySet = new Set(Object.keys(update)),
    { lighting: lightIdSet, environment: environmentIdSet } = boundBindings;
  if (
    [...changedKeySet].some(
      (entityId) => !lightIdSet.has(entityId) && !environmentIdSet.has(entityId),
    )
  )
    return null;
  const hasChangedEntry = (idSet) =>
    [...idSet].some((candidateId) => changedKeySet.has(candidateId));
  return {
    changed: changedKeySet,
    lightOnlyIds: [...changedKeySet].filter(
      (lightId) => lightIdSet.has(lightId) && !environmentIdSet.has(lightId),
    ),
    get lighting() {
      return hasChangedEntry(lightIdSet);
    },
    get environment() {
      return hasChangedEntry(environmentIdSet);
    },
    affects(incomingUpdate) {
      const updateIdSet = boundEntityIds(incomingUpdate);
      return !updateIdSet.size || hasChangedEntry(updateIdSet);
    },
  };
}
function bindLightingAndEnvironmentSets(component) {
  const { lights: lightIds = [], ...componentRest } = component || {};
  return {
    lighting: boundEntityIds(lightIds),
    environment: boundEntityIds(componentRest),
  };
}
export function lightBindingsForUpdate(lights, plan) {
  if (!plan) return lights;
  const lightKey = (light) => JSON.stringify([light.floorId, light.groupId]),
    matchingKeySet = new Set(
      lights.filter((matchedLight) => plan.affects(matchedLight)).map(lightKey),
    );
  return lights.filter((listedLight) => matchingKeySet.has(lightKey(listedLight)));
}
