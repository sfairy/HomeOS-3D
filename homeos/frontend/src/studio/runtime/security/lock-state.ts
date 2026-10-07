const lockStateRuntime = await (import("@app/bridge/lock-state-runtime"));
export const {
  lockState,
  doorOpenState,
  doorModels,
  entryDoorModels,
  identifyLockEntities,
  lockEntityRole,
  LOCK_ENTITY_FIELDS,
} = lockStateRuntime;
