export function isEntityStateActive(stateEntityId: any, stateLookupEnvironment: any) {
  if (!stateEntityId) return false;
  const entityStateRecord = stateLookupEnvironment?.states?.get?.(String(stateEntityId)),
    entityStateText = String(
      entityStateRecord?.newState?.state ?? entityStateRecord?.state ?? "",
    ).toLowerCase();
  return ["on", "true", "1", "open", "opening", "active", "playing"].includes(entityStateText);
}
