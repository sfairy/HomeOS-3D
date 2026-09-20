/**
 * 全局随机 ID 工具。
 *
 * 最底层的通用工具，被 3D 交互编辑器、舞台页以及其它需要「前端自造唯一标识」的地方复用。
 * 对外导出 randomUuid。返回字符串只保证唯一性与 UUID v4 的形态，后端不解析其中的时间或节点
 * 信息；只读全局 crypto，不写任何全局状态。
 */

/**
 * 生成一个 UUID v4 字符串。
 * 三级降级是刻意的：crypto.randomUUID 只在安全上下文存在（内网 http 会缺失），
 * getRandomValues 在更老的 WebView 里也可能没有，故必须保留 Math.random 分支。
 */
export function randomUuid() {
  // 原生实现可用时直接返回，省掉一次 16 字节数组的构造与手工格式化。
  if (typeof globalThis.crypto?.randomUUID == "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  // 优先取密码学安全随机源，取不到才退回 Math.random —— 可用性优先的兜底。
  if (typeof globalThis.crypto?.getRandomValues == "function")
    globalThis.crypto.getRandomValues(bytes);
  else
    for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1)
      bytes[byteIndex] = Math.floor(Math.random() * 256);
  // 按 RFC 4122 打标：第 7 字节高 4 位固定为版本号 4，第 9 字节高 2 位固定为变体 10。
  ((bytes[6] = (bytes[6] & 15) | 64), (bytes[8] = (bytes[8] & 63) | 128));
  // 每个字节补零成两位十六进制，再按 4-2-2-2-6 的分段拼回标准 UUID 文本。
  const hexBytes = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
  return `${hexBytes.slice(0, 4).join("")}-${hexBytes.slice(4, 6).join("")}-${hexBytes.slice(6, 8).join("")}-${hexBytes.slice(8, 10).join("")}-${hexBytes.slice(10).join("")}`;
}
