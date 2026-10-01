const lockStateRuntime = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../static/modules/interaction3d/lock-state-runtime.js", import.meta.url))
  : import(
      new URL(
        "../../../../bridge-static/modules/interaction3d/lock-state-runtime.js?v=20260925-xiaomi-contact-v1-20260926-speaker-v1",
        import.meta.url,
      )
    ));
export const {
  lockState,
  doorOpenState,
  doorModels,
  entryDoorModels,
  identifyLockEntities,
  lockEntityRole,
  LOCK_ENTITY_FIELDS,
} = lockStateRuntime;
