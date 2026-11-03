/**
 * 轻量 SHA-256 实现（同步、无 WebCrypto 依赖）。
 *
 * 0.8.4 把原先内联在 `render-cache.js` 里的实现抽成独立模块 `utils/sha256.js`，
 * 由 `render-cache.js` 再导出、`editor-history.js` 直接 import。此处保持同样的
 * 单一实现来源，避免出现第二份哈希代码。
 */
export function sha256(text: any) {
  const messageBytes = new TextEncoder().encode(text),
    byteLength = messageBytes.length,
    paddedBytes = new Uint8Array(Math.ceil((byteLength + 9) / 64) * 64);
  (paddedBytes.set(messageBytes), (paddedBytes[byteLength] = 128));
  const byteView = new DataView(paddedBytes.buffer);
  (byteView.setUint32(paddedBytes.length - 8, Math.floor(byteLength / 536870912)),
    byteView.setUint32(paddedBytes.length - 4, byteLength * 8));
  const primes: any = [],
    cubeRootConstants: any[] = [],
    squareRootConstants: any[] = [];
  for (let candidate = 2; primes.length < 64; candidate++)
    primes.some((prime: any) => candidate % prime === 0) ||
      (primes.push(candidate),
      cubeRootConstants.push(((Math.cbrt(candidate) % 1) * 4294967296) >>> 0),
      squareRootConstants.length < 8 &&
        squareRootConstants.push(((Math.sqrt(candidate) % 1) * 4294967296) >>> 0));
  const rotateRight = (word: any, shift: any) => (word >>> shift) | (word << (32 - shift)),
    messageSchedule = new Uint32Array(64),
    hashState = squareRootConstants;
  for (let chunkOffset = 0; chunkOffset < paddedBytes.length; chunkOffset += 64) {
    for (let scheduleIndex = 0; scheduleIndex < 16; scheduleIndex++)
      messageSchedule[scheduleIndex] = byteView.getUint32(chunkOffset + scheduleIndex * 4);
    for (let wordIndex = 16; wordIndex < 64; wordIndex++) {
      const earlierScheduleWord = messageSchedule[wordIndex - 15],
        recentScheduleWord = messageSchedule[wordIndex - 2];
      messageSchedule[wordIndex] =
        messageSchedule[wordIndex - 16] +
        (rotateRight(earlierScheduleWord, 7) ^
          rotateRight(earlierScheduleWord, 18) ^
          (earlierScheduleWord >>> 3)) +
        messageSchedule[wordIndex - 7] +
        (rotateRight(recentScheduleWord, 17) ^
          rotateRight(recentScheduleWord, 19) ^
          (recentScheduleWord >>> 10));
    }
    let [stateA, stateB, stateC, stateD, stateE, stateF, stateG, stateH] = hashState;
    for (let roundIndex = 0; roundIndex < 64; roundIndex++) {
      const roundTermA =
          (stateH +
            (rotateRight(stateE, 6) ^ rotateRight(stateE, 11) ^ rotateRight(stateE, 25)) +
            ((stateE & stateF) ^ (~stateE & stateG)) +
            cubeRootConstants[roundIndex] +
            messageSchedule[roundIndex]) >>>
          0,
        roundTermB =
          ((rotateRight(stateA, 2) ^ rotateRight(stateA, 13) ^ rotateRight(stateA, 22)) +
            ((stateA & stateB) ^ (stateA & stateC) ^ (stateB & stateC))) >>>
          0;
      ((stateH = stateG),
        (stateG = stateF),
        (stateF = stateE),
        (stateE = (stateD + roundTermA) >>> 0),
        (stateD = stateC),
        (stateC = stateB),
        (stateB = stateA),
        (stateA = (roundTermA + roundTermB) >>> 0));
    }
    [stateA, stateB, stateC, stateD, stateE, stateF, stateG, stateH].forEach(
      (stateWord, stateIndex) => {
        hashState[stateIndex] = (hashState[stateIndex] + stateWord) >>> 0;
      },
    );
  }
  return hashState.map((hexWord) => hexWord.toString(16).padStart(8, "0")).join("");
}
