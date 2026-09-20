/**
 * 导出流程的底层工具：分辨率换算、ZIP 打包、灯光增量图层。
 *
 * 导出（渲染成图 / 打包 zip）时的公共工具层，被 studio-app.js 调用。分辨率单位为像素，
 * 本模块不涉及三维坐标换算；无全局状态，纯计算，buildStoredZip 返回可直接塞进 Blob 的字节数组。
 */

// 文本文件名编码器：ZIP 条目名统一按 UTF-8 写入，与包里的 UTF-8 标志位配套。
const textEncoder = new TextEncoder();

// 导出渲染倍率。1 表示按预设尺寸 1:1 渲染；调大可用于超采样后缩放，代价是显存与耗时。
export const EXPORT_RENDER_SCALE = 1;
// 导出图片统一用 WebP：同画质下体积远小于 PNG，且保留透明通道。
export const EXPORT_IMAGE_MIME_TYPE = "image/webp";
export const EXPORT_IMAGE_EXTENSION = "webp";
// 0.95 是画质与体积的折中：再往上体积增长明显而肉眼难辨。
export const EXPORT_IMAGE_QUALITY = 0.95;

/**
 * 把预设尺寸按渲染倍率换算成实际像素尺寸。
 */
export function scaledExportResolution(width, height, scale = EXPORT_RENDER_SCALE) {
  // 倍率为 0 / NaN 时不能直接乘，否则会得到 0 尺寸的画布。
  const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : EXPORT_RENDER_SCALE;
  return {
    width: Math.max(1, Math.round(Number(width) * effectiveScale)),
    height: Math.max(1, Math.round(Number(height) * effectiveScale))
  };
}

/**
 * 计算 CRC-32 校验和（ZIP 每个条目都必须带）。
 * 多项式 0xEDB88320 写成 -306674912 是为了避免有符号位移在 JS 里被提升成 32 位溢出；
 * 初始值与收尾异或均按规范取 0xFFFFFFFF。
 */
function crc32(bytes) {
  let checksum = 4294967295;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (-(checksum & 1) & -306674912);
    }
  }
  return (checksum ^ -1) >>> 0;
}

/**
 * 写入一个小端 16 位整数。
 */
function writeUint16LE(view, offset, value) {
  view.setUint16(offset, value, true);
}

/**
 * 写入一个小端 32 位无符号整数。
 */
function writeUint32LE(dataView, byteOffset, int32Value) {
  dataView.setUint32(byteOffset, int32Value >>> 0, true);
}

/**
 * 把多段字节拼成一段。
 */
function concatChunks(chunks) {
  const totalLength = chunks.reduce((chunkTotal, chunk) => chunkTotal + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const part of chunks) {
    merged.set(part, writeOffset);
    writeOffset += part.length;
  }
  return merged;
}

/**
 * 生成一个只用 stored（不压缩）方式的 ZIP 字节流。
 * 导出内容基本都是已压过的图片，再走 deflate 收益极小却要额外引入压缩实现，
 * 因此牺牲体积换实现简单与打包速度；各段偏移按 ZIP 规范手工写入。
 */
export function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  // 中央目录里每个条目记录的本地头偏移，需按已写出的字节数累计。
  let centralOffset = 0;
  for (const entry of entries) {
    const nameBytes = textEncoder.encode(String(entry.name));
    const dataBytes = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc32Value = crc32(dataBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    // 0x04034b50：本地文件头签名。
    writeUint32LE(localView, 0, 67324752);
    // 解压所需版本 2.0（stored 方式的最低要求）。
    writeUint16LE(localView, 4, 20);
    // 通用标志位 0x0800：文件名按 UTF-8 编码，中文名才能被正确解出。
    writeUint16LE(localView, 6, 2048);
    // 压缩方式 0 = stored（不压缩）。
    writeUint16LE(localView, 8, 0);
    // 最后修改时间与日期写 0：导出结果可复现，避免同一份内容因时间戳不同而字节不一致。
    writeUint16LE(localView, 10, 0);
    writeUint16LE(localView, 12, 0);
    writeUint32LE(localView, 14, crc32Value);
    // 压缩后大小与原始大小相等（未压缩）。
    writeUint32LE(localView, 18, dataBytes.length);
    writeUint32LE(localView, 22, dataBytes.length);
    writeUint16LE(localView, 26, nameBytes.length);
    // 扩展字段长度为 0。
    writeUint16LE(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);
    // 中央目录项与本地头字段基本对应，但多了偏移、属性等字段。
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    // 0x02014b50：中央目录项签名。
    writeUint32LE(centralView, 0, 33639248);
    // 制作版本与解压所需版本都写 2.0。
    writeUint16LE(centralView, 4, 20);
    writeUint16LE(centralView, 6, 20);
    writeUint16LE(centralView, 8, 2048);
    writeUint16LE(centralView, 10, 0);
    writeUint16LE(centralView, 12, 0);
    writeUint16LE(centralView, 14, 0);
    writeUint32LE(centralView, 16, crc32Value);
    writeUint32LE(centralView, 20, dataBytes.length);
    writeUint32LE(centralView, 24, dataBytes.length);
    writeUint16LE(centralView, 28, nameBytes.length);
    writeUint16LE(centralView, 30, 0);
    writeUint16LE(centralView, 32, 0);
    writeUint16LE(centralView, 34, 0);
    writeUint16LE(centralView, 36, 0);
    // 外部属性写 0 即可（导出包只关心内容，不关心平台属性）。
    writeUint32LE(centralView, 38, 0);
    writeUint32LE(centralView, 42, centralOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    // 累加本地头 + 数据的长度，得到下一个条目的偏移。
    centralOffset += localHeader.length + dataBytes.length;
  }
  const centralDirectory = concatChunks(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  // 0x06054b50：中央目录结束记录签名。
  writeUint32LE(endView, 0, 101010256);
  // 本分卷编号与中央目录起始分卷都写 0（单分卷包）。
  writeUint16LE(endView, 4, 0);
  writeUint16LE(endView, 6, 0);
  // 分卷内条目数与总条目数相同。
  writeUint16LE(endView, 8, entries.length);
  writeUint16LE(endView, 10, entries.length);
  writeUint32LE(endView, 12, centralDirectory.length);
  writeUint32LE(endView, 16, centralOffset);
  // 注释长度为 0。
  writeUint16LE(endView, 20, 0);
  return concatChunks([...localParts, centralDirectory, endRecord]);
}

/**
 * 计算「灯光图层」相对「基础图层」的增量像素：基础图已是完整场景，灯光层只承载变化过的像素，
 * 按 alpha 叠加即可还原开灯效果。亮度差 ≤1.5（Rec.709 加权，低于人眼 8 位色深分辨力）且
 * alpha 差 ≤1/255 时视为未变化；两帧尺寸不一致（多半是渲染分辨率没对齐）时抛 Error。
 */
export function buildLightDeltaPixels(basePixels, litPixels) {
  if (basePixels.length !== litPixels.length) {
    throw new Error("Light layer frames must have matching dimensions.");
  }
  const deltaPixels = new Uint8ClampedArray(basePixels.length);
  for (let pixelOffset = 0; pixelOffset < basePixels.length; pixelOffset += 4) {
    const baseAlpha = basePixels[pixelOffset + 3] / 255;
    const litAlpha = litPixels[pixelOffset + 3] / 255;
    // 基础图该处本来就是透明的：增量层直接照抄灯光图层，叠加逻辑无从参考底色。
    if (baseAlpha < 0.999) {
      // 灯光层也透明就跳过，保持 delta 的 alpha 为 0（本来就全零，continue 只是省掉写入）。
      if (litAlpha <= 1 / 255) {
        continue;
      }
      deltaPixels[pixelOffset] = litPixels[pixelOffset];
      deltaPixels[pixelOffset + 1] = litPixels[pixelOffset + 1];
      deltaPixels[pixelOffset + 2] = litPixels[pixelOffset + 2];
      deltaPixels[pixelOffset + 3] = litPixels[pixelOffset + 3];
      continue;
    }
    let maxDelta = 0;
    // Rec.709 亮度权重；基色亮度先算好，下面与灯光像素亮度作差。
    const baseLuma =
      basePixels[pixelOffset] * 0.2126 +
      basePixels[pixelOffset + 1] * 0.7152 +
      basePixels[pixelOffset + 2] * 0.0722;
    if (
      !(
        litPixels[pixelOffset] * 0.2126 +
          litPixels[pixelOffset + 1] * 0.7152 +
          litPixels[pixelOffset + 2] * 0.0722 -
          baseLuma <=
        1.5
      ) ||
      !(Math.abs(litAlpha - baseAlpha) <= 1 / 255)
    ) {
      // 逐通道算归一化差值：除以该方向上的可用余量，得到「用多大不透明度才能还原」。
      for (let channelIndex = 0; channelIndex < 3; channelIndex += 1) {
        const baseChannel = basePixels[pixelOffset + channelIndex];
        const channelDelta = litPixels[pixelOffset + channelIndex] - baseChannel;
        const normalizedDelta =
          channelDelta >= 0
            ? channelDelta / Math.max(255 - baseChannel, 1)
            : -channelDelta / Math.max(baseChannel, 1);
        maxDelta = Math.max(maxDelta, normalizedDelta);
      }
      // 三个通道共用同一个不透明度，取其中最大者；alpha 本身的变化也要计入。
      maxDelta = Math.min(Math.max(maxDelta, Math.abs(litAlpha - baseAlpha)), 1);
      if (!(maxDelta < 1 / 255)) {
        // 反解叠加公式 result = delta*alpha + base*(1-alpha)，求出应写入的颜色值。
        for (let channelOffset = 0; channelOffset < 3; channelOffset += 1) {
          const baseValue = basePixels[pixelOffset + channelOffset];
          const litValue = litPixels[pixelOffset + channelOffset];
          deltaPixels[pixelOffset + channelOffset] = Math.round(
            Math.min(Math.max((litValue - baseValue * (1 - maxDelta)) / maxDelta, 0), 255)
          );
        }
        deltaPixels[pixelOffset + 3] = Math.round(maxDelta * 255);
      }
    }
  }
  return deltaPixels;
}
