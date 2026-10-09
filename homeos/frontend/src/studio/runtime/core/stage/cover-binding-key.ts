/** Cover feedback cache key (entity + rail kind). */

export function computeCoverBindingKey(coverKeyBinding: any) {
  return JSON.stringify([
    coverKeyBinding.entityId,
    coverKeyBinding.coverKind === "dream" ? "dream" : "rail",
  ]);
}
