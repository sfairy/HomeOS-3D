export function randomUuid() {
  if (typeof globalThis.crypto?.randomUUID == "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues == "function")
    globalThis.crypto.getRandomValues(bytes);
  else
    for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1)
      bytes[byteIndex] = Math.floor(Math.random() * 256);
  ((bytes[6] = (bytes[6] & 15) | 64), (bytes[8] = (bytes[8] & 63) | 128));
  const hexBytes = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hexBytes.slice(0, 4).join("")}-${hexBytes.slice(4, 6).join("")}-${hexBytes.slice(6, 8).join("")}-${hexBytes.slice(8, 10).join("")}-${hexBytes.slice(10).join("")}`;
}
