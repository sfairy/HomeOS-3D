/**
 * 实体检索文本与实体域：两个「从实体身上取出一个字符串」的契约，各只有一份实现。
 *
 *   | 助手 | 输入 | 输出 |
 *   | --- | --- | --- |
 *   | entitySearchText | 任意层级的字符串 / 数组片段 | 小写、单空格分隔、无空段 |
 *   | entitySearchTextOf | 实体对象 + 额外片段 | 同上（四个命名字段 + 额外片段） |
 *   | entityDomainOf | 实体对象 | 裸域名字符串；取不到时 "" |
 *   | entityDomainFromId | 实体 ID 字符串 | 同上 |
 */

/**
 * 把若干字段拼成一段用于关键词匹配的小写文本（接受任意层级数组）。
 *
 * 一律小写、段间压单空格 —— 调用方正则全带 `i`，因此只可能多命中、不会漏命中。
 */
export function entitySearchText(...searchParts) {
  return searchParts
    .flat()
    .map(part => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * 取参与关键词匹配的四个标准字段（`entityId` / `name` / `originalName` / `translationKey`）
 * 外加调用方补充的片段；字段名收在这里，是为了「哪些字段参与识别」只有一处定义。
 */
export function entitySearchTextOf(entity = {}, ...extraParts) {
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
 *
 * 刻意不 `trim()`、不 `toLowerCase()`：消费方要上游原样的域，需要小写归一的自己处理。
 */
export function entityDomainFromId(entityId) {
  return String(entityId || "").split(".", 1)[0];
}

/**
 * 取实体的域（`light` / `switch` / `sensor` …）：优先 `domain` 字段，缺失时从 `entityId` 推导。
 * 两条路径都 `String(...)` 归一 —— 消费方拿它查表或比较，非字符串会静默查不到。取不到时返回 `""`。
 */
export function entityDomainOf(entity) {
  return entityDomainFromId(entity?.domain || entity?.entityId);
}
