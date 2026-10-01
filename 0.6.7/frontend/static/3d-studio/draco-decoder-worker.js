let decoderPending = null;
self.onmessage = (arg1) => {
  const value1 = arg1.data || {};
  if (value1.type === "init") {
    decoderPending = initializeDecoder(value1);
    return;
  }
  if (value1.type !== "decode") return;
  (decoderPending || Promise.reject(new Error("Draco decoder is not initialized")))
    .then(({ draco: arg2 }) => {
      const value2 = new arg2.Decoder();
      try {
        const value3 = decodeGeometry(
            arg2,
            value2,
            new Int8Array(value1.buffer),
            value1.taskConfig,
          ),
          value4 = value3.attributes.map((arg3) => arg3.array.buffer);
        (value3.index && value4.push(value3.index.array.buffer),
          self.postMessage(
            {
              type: "decode",
              id: value1.id,
              geometry: value3,
            },
            value4,
          ));
      } catch (error1) {
        self.postMessage({
          type: "error",
          id: value1.id,
          error: error1?.message || String(error1),
        });
      } finally {
        arg2.destroy(value2);
      }
    })
    .catch((arg4) => {
      self.postMessage({
        type: "error",
        id: value1.id,
        error: arg4?.message || String(arg4),
      });
    });
};
function initializeDecoder(arg5) {
  const value5 = String(arg5.decoderPath || ""),
    object1 = {
      ...(arg5.decoderConfig || {}),
    },
    value6 = object1.type === "js" ? "draco_decoder.js" : "draco_wasm_wrapper.js";
  try {
    self.importScripts("" + value5 + value6);
  } catch (error2) {
    return Promise.reject(error2);
  }
  return (
    (object1.locateFile = (arg6) =>
      "" + value5 + (arg6 === "draco_decoder_gltf.wasm" ? "draco_decoder.wasm" : arg6)),
    new Promise((arg7, arg8) => {
      let value7 = false;
      object1.onModuleLoaded = (arg9) => {
        ((value7 = true),
          arg7({
            draco: arg9,
          }));
      };
      try {
        const value8 = self.DracoDecoderModule(object1);
        value8 &&
          typeof value8.then == "function" &&
          value8.then((arg10) => {
            value7 ||
              arg7({
                draco: arg10,
              });
          }, arg8);
      } catch (error3) {
        arg8(error3);
      }
    })
  );
}
function decodeGeometry(arg11, arg12, arg13, arg14) {
  const value9 = arg14.attributeIDs,
    value10 = arg14.attributeTypes;
  let value11, value12;
  const value13 = arg12.GetEncodedGeometryType(arg13);
  if (value13 === arg11.TRIANGULAR_MESH)
    ((value11 = new arg11.Mesh()),
      (value12 = arg12.DecodeArrayToMesh(arg13, arg13.byteLength, value11)));
  else {
    if (value13 === arg11.POINT_CLOUD)
      ((value11 = new arg11.PointCloud()),
        (value12 = arg12.DecodeArrayToPointCloud(arg13, arg13.byteLength, value11)));
    else throw new Error("THREE.DRACOLoader: Unexpected geometry type.");
  }
  if (!value12.ok() || value11.ptr === 0)
    throw new Error("THREE.DRACOLoader: Decoding failed: " + value12.error_msg());
  const object2 = {
    index: null,
    attributes: [],
  };
  for (const value14 in value9) {
    const value15 = self[value10[value14]];
    let value16;
    if (arg14.useUniqueIDs) value16 = arg12.GetAttributeByUniqueId(value11, value9[value14]);
    else {
      const value18 = arg12.GetAttributeId(value11, arg11[value9[value14]]);
      if (value18 === -1) continue;
      value16 = arg12.GetAttribute(value11, value18);
    }
    const value17 = decodeAttribute(arg11, arg12, value11, value14, value15, value16);
    (value14 === "color" && (value17.vertexColorSpace = arg14.vertexColorSpace),
      object2.attributes.push(value17));
  }
  return (
    value13 === arg11.TRIANGULAR_MESH && (object2.index = decodeIndex(arg11, arg12, value11)),
    arg11.destroy(value11),
    object2
  );
}
function decodeIndex(arg15, arg16, arg17) {
  const value19 = arg17.num_faces() * 3,
    value20 = value19 * 4,
    value21 = arg15._malloc(value20);
  arg16.GetTrianglesUInt32Array(arg17, value20, value21);
  const value22 = new Uint32Array(arg15.HEAPF32.buffer, value21, value19).slice();
  return (
    arg15._free(value21),
    {
      array: value22,
      itemSize: 1,
    }
  );
}
function decodeAttribute(arg18, arg19, arg20, arg21, arg22, arg23) {
  const value23 = arg20.num_points(),
    value24 = arg23.num_components(),
    value25 = getDracoDataType(arg18, arg22),
    value26 = value24 * arg22.BYTES_PER_ELEMENT,
    value27 = Math.ceil(value26 / 4) * 4,
    value28 = value27 / arg22.BYTES_PER_ELEMENT,
    value29 = value23 * value26,
    value30 = value23 * value27,
    value31 = arg18._malloc(value29);
  arg19.GetAttributeDataArrayForAllPoints(arg20, arg23, value25, value29, value31);
  const value32 = new arg22(arg18.HEAPF32.buffer, value31, value29 / arg22.BYTES_PER_ELEMENT);
  let value33;
  if (value26 === value27) value33 = value32.slice();
  else {
    value33 = new arg22(value30 / arg22.BYTES_PER_ELEMENT);
    let value34 = 0;
    for (let value35 = 0; value35 < value32.length; value35 += value24) {
      for (let value36 = 0; value36 < value24; value36 += 1)
        value33[value34 + value36] = value32[value35 + value36];
      value34 += value28;
    }
  }
  return (
    arg18._free(value31),
    {
      name: arg21,
      count: value23,
      itemSize: value24,
      array: value33,
      stride: value28,
    }
  );
}
function getDracoDataType(arg24, arg25) {
  if (arg25 === Float32Array) return arg24.DT_FLOAT32;
  if (arg25 === Int8Array) return arg24.DT_INT8;
  if (arg25 === Int16Array) return arg24.DT_INT16;
  if (arg25 === Int32Array) return arg24.DT_INT32;
  if (arg25 === Uint8Array) return arg24.DT_UINT8;
  if (arg25 === Uint16Array) return arg24.DT_UINT16;
  if (arg25 === Uint32Array) return arg24.DT_UINT32;
  throw new Error("THREE.DRACOLoader: Unsupported attribute array type.");
}
