"use strict";
// 经典 Worker 没有模块作用域：靠这条指令把「给未声明变量赋值」从静默变成报错。

// 解码器 WASM 模块的加载 Promise：只初始化一次，后续解码请求复用同一实例。
let decoderPending: Promise<{ draco: any }> | null = null;
(self as any).onmessage = (event: MessageEvent) => {
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
        const transferables = geometryPayload.attributes.map((attribute: any) => attribute.array.buffer);
        if (geometryPayload.index) {
          transferables.push(geometryPayload.index.array.buffer);
        }
        (self as any).postMessage(
          {
            type: "decode",
            id: payload.id,
            geometry: geometryPayload
          },
          transferables
        );
      } catch (decodeError: any) {
        // 单个模型的解码失败是可以恢复的：只回错误，Worker 继续服务后续请求。
        (self as any).postMessage({
          type: "error",
          id: payload.id,
          error: decodeError?.message || String(decodeError)
        });
      } finally {
        dracoModule.destroy(dracoDecoder);
      }
    })
    .catch((workerError: any) => {
      // 到这里说明是初始化层面的失败（解码器根本没起来），同样只回报错误不终止 Worker。
      (self as any).postMessage({
        type: "error",
        id: payload.id,
        error: workerError?.message || String(workerError)
      });
    });
};

/**
 * 加载并初始化 Draco 解码模块。
 */
function initializeDecoder(options: any): Promise<{ draco: any }> {
  const decoderPath = String(options.decoderPath || "");
  const decoderConfig = {
    ...(options.decoderConfig || {})
  };
  // JS 版解码器与 WASM 版入口文件名不同，由主线程通过 type 声明要哪一套。
  const wrapperFileName =
    decoderConfig.type === "js" ? "draco_decoder.js" : "draco_wasm_wrapper.js";
  try {
    // 用 importScripts 以字符串拼接而非传 URL 对象：部分旧版 Chrome 对 URL 实例支持不全。
    (self as any).importScripts("" + decoderPath + wrapperFileName);
  } catch (importError) {
    return Promise.reject(importError);
  }
  decoderConfig.locateFile = (fileName: string) =>
    "" + decoderPath + (fileName === "draco_decoder_gltf.wasm" ? "draco_decoder.wasm" : fileName);
  return new Promise((resolve, reject) => {
    let isModuleLoaded = false;
    // 新版 Emscripten 走 onModuleLoaded 回调，旧版返回 Promise；
    decoderConfig.onModuleLoaded = (module: any) => {
      isModuleLoaded = true;
      resolve({
        draco: module
      });
    };
    try {
      const modulePromise = (self as any).DracoDecoderModule(decoderConfig);
      if (modulePromise && typeof modulePromise.then == "function") {
        modulePromise.then((dracoInstance: any) => {
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
 * @param {any} taskConfig DRACOLoader 下发的任务配置（属性 id / 类型 / 唯一 id 开关等）。
 */
function decodeGeometry(draco: any, decoder: any, encodedData: any, taskConfig: any) {
  const attributeIds = taskConfig.attributeIDs;
  const attributeTypes = taskConfig.attributeTypes;
  let dracoGeometry: any;
  let decodeResult: any;
  const geometryData: { index: any; attributes: any[] } = {
    index: null,
    attributes: []
  };
  // geometry 由 WASM 侧持有：解码失败以及后续属性/索引提取阶段的任何抛错都必须销毁它，
  // 否则每解一个坏模型就在解码器堆里泄漏一个 Mesh/PointCloud（成功路径同样在 finally 里销毁）。
  try {
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
    for (const attributeKey in attributeIds) {
      const attributeType = (self as any)[attributeTypes[attributeKey]];
      let dracoAttribute;
      // useUniqueIDs 为真说明导出端用的是稳定唯一 id，按 id 取更可靠；
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
      if (attributeKey === "color") {
        decodedAttribute.vertexColorSpace = taskConfig.vertexColorSpace;
      }
      geometryData.attributes.push(decodedAttribute);
    }
    // 点云没有拓扑，只有三角网格才有索引。
    if (geometryType === draco.TRIANGULAR_MESH) {
      geometryData.index = decodeIndex(draco, decoder, dracoGeometry);
    }
    return geometryData;
  } finally {
    if (dracoGeometry) {
      draco.destroy(dracoGeometry);
    }
  }
}

/**
 * 取出网格的三角形索引。
 */
function decodeIndex(dracoLib: any, meshDecoder: any, mesh: any) {
  const indexCount = mesh.num_faces() * 3;
  const indexByteLength = indexCount * 4;
  const indexPointer = dracoLib._malloc(indexByteLength);
  try {
    meshDecoder.GetTrianglesUInt32Array(mesh, indexByteLength, indexPointer);
    // 堆内存里的索引按 Float32 视图读出即可（同一块 ArrayBuffer，仅视图类型不同）。
    const indexArray = new Uint32Array(dracoLib.HEAPF32.buffer, indexPointer, indexCount).slice();
    return {
      array: indexArray,
      itemSize: 1
    };
  } finally {
    // GetTrianglesUInt32Array / 视图构造抛错时也必须归还堆块，否则 WASM 堆逐次泄漏。
    dracoLib._free(indexPointer);
  }
}

/**
 * 解出一个顶点属性。
 */
function decodeAttribute(
  dracoApi: any,
  attributeDecoder: any,
  meshOrPointCloud: any,
  attributeName: any,
  arrayType: any,
  sourceAttribute: any): any {
  const pointCount = meshOrPointCloud.num_points();
  const componentCount = sourceAttribute.num_components();
  const dracoDataType = getDracoDataType(dracoApi, arrayType);
  const componentByteLength = componentCount * arrayType.BYTES_PER_ELEMENT;
  // Draco 输出按 4 字节对齐，单分量 8 位属性（如 Uint8 顶点色）每点后面会带填充字节，
  const alignedByteLength = Math.ceil(componentByteLength / 4) * 4;
  const alignedComponentCount = alignedByteLength / arrayType.BYTES_PER_ELEMENT;
  const dataByteLength = pointCount * componentByteLength;
  const paddedByteLength = pointCount * alignedByteLength;
  const dataPointer = dracoApi._malloc(dataByteLength);
  try {
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
    return {
      name: attributeName,
      count: pointCount,
      itemSize: componentCount,
      array: packedAttributeArray,
      stride: alignedComponentCount
    };
  } finally {
    // 取数或重排抛错时同样归还堆块（_free(0) 在 Emscripten 里等同 free(NULL)，安全）。
    dracoApi._free(dataPointer);
  }
}

/**
 * 把 JS 定型数组类型映射到 Draco 的数据类型常量。
 */
function getDracoDataType(dracoNamespace: any, arrayConstructor: any) {
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
