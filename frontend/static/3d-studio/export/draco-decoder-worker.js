/**
 * Draco 解码 Worker 脚本（同源部署版）。
 *
 * 位置：3D 工作室加载外部模型时，studio-app.js 经由 draco-loader.js 里的
 *   SameOriginDRACOLoader 启动本 Worker，在后台线程把 .drc 压缩几何解成
 *   three.js 需要的属性数组，避免主线程卡顿。
 * 对外：本文件没有模块导出，只通过 self.onmessage 与主线程通信。
 * 协议：初始化 {type: "init", decoderPath, decoderConfig}；
 *   解码请求 {type: "decode", id, buffer, taskConfig}；
 *   成功回包 {type: "decode", id, geometry}，失败回包 {type: "error", id, error}。
 * 约定：类型名、错误文案、以及 taskConfig 里的 attributeIDs / useUniqueIDs /
 *   vertexColorSpace 字段名都沿用 three.js DRACOLoader 的既有约定，方便对照上游实现。
 */
"use strict";
// 经典 Worker 没有模块作用域：靠这条指令把「给未声明变量赋值」从静默变成报错。
// 解码结果要按转移对象回传给主线程，写错的属性名不该被悄悄挂到 self 上。

// 解码器 WASM 模块的加载 Promise：只初始化一次，后续解码请求复用同一实例。
let decoderPending = null;
self.onmessage = event => {
  const payload = event.data || {};
  // 第一条消息必然是 init，先把 WASM 模块拉起来（异步，不阻塞本次事件循环返回）。
  if (payload.type === "init") {
    decoderPending = initializeDecoder(payload);
    return;
  }
  // 未知消息类型直接忽略，防止上层版本不一致时抛错打断 Worker。
  if (payload.type !== "decode") {
    return;
  }
  // 未初始化就收到解码请求属于调用顺序错误，用一个被拒绝的 Promise 走统一错误分支。
  (decoderPending || Promise.reject(new Error("Draco decoder is not initialized")))
    .then(({ draco: dracoModule }) => {
      const dracoDecoder = new dracoModule.Decoder();
      try {
        const geometryPayload = decodeGeometry(
          dracoModule,
          dracoDecoder,
          new Int8Array(payload.buffer),
          payload.taskConfig
        );
        // 属性与索引的 ArrayBuffer 以可转移对象回传，省掉一次结构化克隆的大块内存拷贝。
        const transferables = geometryPayload.attributes.map(attribute => attribute.array.buffer);
        if (geometryPayload.index) {
          transferables.push(geometryPayload.index.array.buffer);
        }
        self.postMessage(
          {
            type: "decode",
            id: payload.id,
            geometry: geometryPayload
          },
          transferables
        );
      } catch (decodeError) {
        // 单个模型的解码失败是可以恢复的：只回错误，Worker 继续服务后续请求。
        self.postMessage({
          type: "error",
          id: payload.id,
          error: decodeError?.message || String(decodeError)
        });
      } finally {
        // 无论成败都要销毁 WASM 侧的 Decoder，否则堆内存会随请求数持续增长。
        dracoModule.destroy(dracoDecoder);
      }
    })
    .catch(workerError => {
      // 到这里说明是初始化层面的失败（解码器根本没起来），同样只回报错误不终止 Worker。
      self.postMessage({
        type: "error",
        id: payload.id,
        error: workerError?.message || String(workerError)
      });
    });
};

/**
 * 加载并初始化 Draco 解码模块。
 */
function initializeDecoder(options) {
  const decoderPath = String(options.decoderPath || "");
  const decoderConfig = {
    ...(options.decoderConfig || {})
  };
  // JS 版解码器与 WASM 版入口文件名不同，由主线程通过 type 声明要哪一套。
  const wrapperFileName =
    decoderConfig.type === "js" ? "draco_decoder.js" : "draco_wasm_wrapper.js";
  try {
    // 用 importScripts 以字符串拼接而非传 URL 对象：部分旧版 Chrome 对 URL 实例支持不全。
    self.importScripts("" + decoderPath + wrapperFileName);
  } catch (importError) {
    return Promise.reject(importError);
  }
  // glTF 版导出的是 draco_decoder_gltf.wasm，仓库里实际只放了 draco_decoder.wasm，
  // 这里统一重定向到真实文件名，与上游 DRACOLoader 的处理保持一致。
  decoderConfig.locateFile = fileName =>
    "" + decoderPath + (fileName === "draco_decoder_gltf.wasm" ? "draco_decoder.wasm" : fileName);
  return new Promise((resolve, reject) => {
    let isModuleLoaded = false;
    // 新版 Emscripten 走 onModuleLoaded 回调，旧版返回 Promise；
    // 两条路径都接上，用幂等标记保证只 resolve 一次。
    decoderConfig.onModuleLoaded = module => {
      isModuleLoaded = true;
      resolve({
        draco: module
      });
    };
    try {
      const modulePromise = self.DracoDecoderModule(decoderConfig);
      if (modulePromise && typeof modulePromise.then == "function") {
        modulePromise.then(dracoInstance => {
          // 回调版本已经 resolve 过就不再重复处理，Promise 的二次 resolve 是空操作但仍需避免歧义。
          if (!isModuleLoaded) {
            resolve({
              draco: dracoInstance
            });
          }
        }, reject);
      }
    } catch (moduleError) {
      // 同步抛错（脚本加载失败等）转成 reject，让调用方统一走 catch。
      reject(moduleError);
    }
  });
}

/**
 * 把一段 Draco 压缩数据解成 three.js 的几何数据。
 *
 * @param {object} taskConfig DRACOLoader 下发的任务配置（属性 id / 类型 / 唯一 id 开关等）。
 * @throws {Error} 几何类型未知或解码失败。
 */
function decodeGeometry(draco, decoder, encodedData, taskConfig) {
  const attributeIds = taskConfig.attributeIDs;
  const attributeTypes = taskConfig.attributeTypes;
  let dracoGeometry;
  let decodeResult;
  const geometryType = decoder.GetEncodedGeometryType(encodedData);
  // Draco 只承载三角网格与点云两种几何，分别走不同的解码入口。
  if (geometryType === draco.TRIANGULAR_MESH) {
    dracoGeometry = new draco.Mesh();
    decodeResult = decoder.DecodeArrayToMesh(encodedData, encodedData.byteLength, dracoGeometry);
  } else if (geometryType === draco.POINT_CLOUD) {
    dracoGeometry = new draco.PointCloud();
    decodeResult = decoder.DecodeArrayToPointCloud(
      encodedData,
      encodedData.byteLength,
      dracoGeometry
    );
  } else {
    // 文案与上游 THREE.DRACOLoader 逐字一致，便于按上游报错检索。
    throw new Error("THREE.DRACOLoader: Unexpected geometry type.");
  }
  // ptr 为 0 表示 WASM 侧对象已失效，此时再取属性会读到野指针。
  if (!decodeResult.ok() || dracoGeometry.ptr === 0) {
    throw new Error("THREE.DRACOLoader: Decoding failed: " + decodeResult.error_msg());
  }
  const geometryData = {
    index: null,
    attributes: []
  };
  for (const attributeKey in attributeIds) {
    const attributeType = self[attributeTypes[attributeKey]];
    let dracoAttribute;
    // useUniqueIDs 为真说明导出端用的是稳定唯一 id，按 id 取更可靠；
    // 否则按语义类型（POSITION / NORMAL / ...）取，缺失的属性直接跳过。
    if (taskConfig.useUniqueIDs) {
      dracoAttribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeIds[attributeKey]);
    } else {
      const attributeId = decoder.GetAttributeId(dracoGeometry, draco[attributeIds[attributeKey]]);
      if (attributeId === -1) {
        continue;
      }
      dracoAttribute = decoder.GetAttribute(dracoGeometry, attributeId);
    }
    const decodedAttribute = decodeAttribute(
      draco,
      decoder,
      dracoGeometry,
      attributeKey,
      attributeType,
      dracoAttribute
    );
    // 顶点色在不同 glTF 导出器里可能是线性空间也可能是 sRGB，把主线程的判定结果带回，
    // three.js 侧据此决定要不要做色彩空间转换。
    if (attributeKey === "color") {
      decodedAttribute.vertexColorSpace = taskConfig.vertexColorSpace;
    }
    geometryData.attributes.push(decodedAttribute);
  }
  // 点云没有拓扑，只有三角网格才有索引。
  if (geometryType === draco.TRIANGULAR_MESH) {
    geometryData.index = decodeIndex(draco, decoder, dracoGeometry);
  }
  draco.destroy(dracoGeometry);
  return geometryData;
}

/**
 * 取出网格的三角形索引。
 *
 * Draco 的索引固定为 32 位；这里在 WASM 堆上分配临时缓冲，
 * 读出后立刻 slice 成独立数组再释放，避免返回的视图指向已回收的堆内存。
 */
function decodeIndex(dracoLib, meshDecoder, mesh) {
  const indexCount = mesh.num_faces() * 3;
  const indexByteLength = indexCount * 4;
  const indexPointer = dracoLib._malloc(indexByteLength);
  meshDecoder.GetTrianglesUInt32Array(mesh, indexByteLength, indexPointer);
  // 堆内存里的索引按 Float32 视图读出即可（同一块 ArrayBuffer，仅视图类型不同）。
  const indexArray = new Uint32Array(dracoLib.HEAPF32.buffer, indexPointer, indexCount).slice();
  dracoLib._free(indexPointer);
  return {
    array: indexArray,
    itemSize: 1
  };
}

/**
 * 解出一个顶点属性。
 */
function decodeAttribute(
  dracoApi,
  attributeDecoder,
  meshOrPointCloud,
  attributeName,
  arrayType,
  sourceAttribute
) {
  const pointCount = meshOrPointCloud.num_points();
  const componentCount = sourceAttribute.num_components();
  const dracoDataType = getDracoDataType(dracoApi, arrayType);
  const componentByteLength = componentCount * arrayType.BYTES_PER_ELEMENT;
  // Draco 输出按 4 字节对齐，单分量 8 位属性（如 Uint8 顶点色）每点后面会带填充字节，
  // 因此先按对齐后的长度申请缓冲，再把有效分量压实。
  const alignedByteLength = Math.ceil(componentByteLength / 4) * 4;
  const alignedComponentCount = alignedByteLength / arrayType.BYTES_PER_ELEMENT;
  const dataByteLength = pointCount * componentByteLength;
  const paddedByteLength = pointCount * alignedByteLength;
  const dataPointer = dracoApi._malloc(dataByteLength);
  attributeDecoder.GetAttributeDataArrayForAllPoints(
    meshOrPointCloud,
    sourceAttribute,
    dracoDataType,
    dataByteLength,
    dataPointer
  );
  const rawAttributeArray = new arrayType(
    dracoApi.HEAPF32.buffer,
    dataPointer,
    dataByteLength / arrayType.BYTES_PER_ELEMENT
  );
  let packedAttributeArray;
  if (componentByteLength === alignedByteLength) {
    // 本身已对齐，直接拷一份带走，不需要逐点重排。
    packedAttributeArray = rawAttributeArray.slice();
  } else {
    packedAttributeArray = new arrayType(paddedByteLength / arrayType.BYTES_PER_ELEMENT);
    let targetOffset = 0;
    // 逐点把有效分量搬到紧凑数组里，丢弃对齐填充。
    for (
      let sourceOffset = 0;
      sourceOffset < rawAttributeArray.length;
      sourceOffset += componentCount
    ) {
      for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
        packedAttributeArray[targetOffset + componentIndex] =
          rawAttributeArray[sourceOffset + componentIndex];
      }
      targetOffset += alignedComponentCount;
    }
  }
  dracoApi._free(dataPointer);
  return {
    name: attributeName,
    count: pointCount,
    itemSize: componentCount,
    array: packedAttributeArray,
    stride: alignedComponentCount
  };
}

/**
 * 把 JS 定型数组类型映射到 Draco 的数据类型常量。
 *
 * @throws {Error} 遇到不支持的数组类型。
 */
function getDracoDataType(dracoNamespace, arrayConstructor) {
  if (arrayConstructor === Float32Array) {
    return dracoNamespace.DT_FLOAT32;
  }
  if (arrayConstructor === Int8Array) {
    return dracoNamespace.DT_INT8;
  }
  if (arrayConstructor === Int16Array) {
    return dracoNamespace.DT_INT16;
  }
  if (arrayConstructor === Int32Array) {
    return dracoNamespace.DT_INT32;
  }
  if (arrayConstructor === Uint8Array) {
    return dracoNamespace.DT_UINT8;
  }
  if (arrayConstructor === Uint16Array) {
    return dracoNamespace.DT_UINT16;
  }
  if (arrayConstructor === Uint32Array) {
    return dracoNamespace.DT_UINT32;
  }
  throw new Error("THREE.DRACOLoader: Unsupported attribute array type.");
}
