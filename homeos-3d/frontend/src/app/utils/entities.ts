/**
 * 实体检索文本与实体域：两个「从实体身上取出一个字符串」的契约，各只有一份实现。
 */

type EntityLike = {
  entityId?: unknown;
  name?: unknown;
  originalName?: unknown;
  translationKey?: unknown;
  domain?: unknown;
};

/**
 * 把若干字段拼成一段用于关键词匹配的小写文本（接受任意层级数组）。
 */
export function entitySearchText(...searchParts: unknown[]): string {
  return searchParts
    .flat()
    .map(part => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function entitySearchTextOf(entity: EntityLike = {}, ...extraParts: unknown[]): string {
  return entitySearchText(
    entity?.entityId,
    entity?.name,
    entity?.originalName,
    entity?.translationKey,
    ...extraParts
  );
}

/**
 * 从实体 ID 取域（`entityDomainOf` 的姊妹入口），也是「按第一个点号切域」的唯一实现。
 */
export function entityDomainFromId(entityId: unknown): string {
  return String(entityId || "").split(".", 1)[0];
}

export function entityDomainOf(entity: EntityLike | null | undefined): string {
  return entityDomainFromId(entity?.domain || entity?.entityId);
}
