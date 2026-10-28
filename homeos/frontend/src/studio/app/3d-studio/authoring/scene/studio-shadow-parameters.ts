/**
 * 射灯阴影参数 UBO（上游 `studio-shadow-parameters.js`，0.8.1 新增）。
 *
 * ## 为什么需要它
 *
 * 射灯阴影的矩阵/矩形/参数（每个灯 6 个 `vec4`）在 0.8.1 之前是走数据纹理
 * （`userSpotShadowData`，一次 `texelFetch` 一次采样）。灯少的场景没问题，但灯一多：
 *
 * - 数据纹理要按灯数向上取整到 2 的幂分配，且每帧重传；
 * - 顶点着色器里 `NUM_SPOT_LIGHTS` 大时 varying 会爆，只能退化到世界坐标 + 逐灯算。
 *
 * UBO 把这些参数放进 `std140` 块，`bindBufferBase` 一次绑定，所有材质共享同一份上传，
 * 且不占 varying。容量由 `MAX_UNIFORM_BLOCK_SIZE` 反推（每灯 96 字节 = 6 × vec4）。
 *
 * 容量为 0（WebGL1 / 驱动不给大块）时 `update` 恒返回 false，调用方据此退回数据纹理。
 */

/** 每个灯在 UBO 里占的字节数：4 个 `mat4` 列 + `rect` + `params` = 6 × 16。 */
const BYTES_PER_LIGHT = 96;
/** 每灯对应的 `Float32` 个数。 */
const FLOATS_PER_LIGHT = BYTES_PER_LIGHT / 4;

/** 只暴露本模块真正用到的 WebGL2 能力，便于测试注入假的上下文。 */
export interface ShadowParameterGL {
  /** WebGL1 没有；缺失即视为不支持 UBO 路径。 */
  bindBufferBase?: (target: number, index: number, buffer: WebGLBuffer | null) => void;
  bufferSubData: (target: number, offset: number, data: Float32Array) => void;
  isContextLost?: () => boolean;
  getParameter(parameter: number): number;
  createBuffer(): WebGLBuffer | null;
  deleteBuffer(buffer: WebGLBuffer): void;
  bindBuffer(target: number, buffer: WebGLBuffer | null): void;
  bufferData(target: number, size: number, usage: number): void;
  MAX_UNIFORM_BLOCK_SIZE: number;
  UNIFORM_BUFFER: number;
  DYNAMIC_DRAW: number;
}

/** `THREE.Matrix4` / `THREE.Vector4` 的共同写入接口（`toArray` 即可）。 */
export interface ShadowParameterSink {
  toArray(array: number[] | Float32Array, offset?: number): number[] | Float32Array;
}

export interface ShadowParameterBuffer {
  /** 能容纳多少盏灯；0 表示该设备不支持 UBO 路径。 */
  readonly capacity: number;
  /** 写入并上传；参数越界、上下文丢失时返回 false（不抛）。 */
  update(matrices: ReadonlyArray<ShadowParameterSink>, rects: ReadonlyArray<ShadowParameterSink>, params: ReadonlyArray<ShadowParameterSink>): boolean;
  /** 重新绑定已上传的缓冲（材质切换时用）。 */
  bind(): void;
  release(): void;
}

export function createShadowParameterBuffer(gl: ShadowParameterGL | null | undefined): ShadowParameterBuffer {
  // 只有同时具备 `bindBufferBase`（WebGL2）与 `bufferSubData` 才走 UBO；
  // WebGL1 的 `getParameter` 也没有 `MAX_UNIFORM_BLOCK_SIZE`，容量必然是 0。
  const bindBufferBase = gl?.bindBufferBase;
  const capacity =
    gl && typeof bindBufferBase === "function"
      ? Math.min(128, Math.floor((gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE) || 0) / BYTES_PER_LIGHT))
      : 0;
  let buffer: WebGLBuffer | null = null,
    staging: Float32Array | null = null;

  function release() {
    (buffer && gl?.deleteBuffer(buffer), (buffer = null), (staging = null));
  }

  return {
    get capacity() {
      return capacity;
    },
    update(matrices, rects, params) {
      if (!gl || !capacity || matrices.length > capacity || gl.isContextLost?.()) return false;
      if (!buffer) {
        if (((buffer = gl.createBuffer()), !buffer)) return false;
        staging = new Float32Array(capacity * FLOATS_PER_LIGHT);
        (gl.bindBuffer(gl.UNIFORM_BUFFER, buffer),
          gl.bufferData(gl.UNIFORM_BUFFER, staging.byteLength, gl.DYNAMIC_DRAW));
      }
      if (!staging) return false;
      for (let lightIndex = 0; lightIndex < matrices.length; lightIndex++) {
        matrices[lightIndex].toArray(staging, lightIndex * FLOATS_PER_LIGHT);
        rects[lightIndex].toArray(staging, lightIndex * FLOATS_PER_LIGHT + 16);
        params[lightIndex].toArray(staging, lightIndex * FLOATS_PER_LIGHT + 20);
      }
      return (
        gl.bindBuffer(gl.UNIFORM_BUFFER, buffer),
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, staging.subarray(0, matrices.length * FLOATS_PER_LIGHT)),
        // 绑定点是 0：与上游 `UserSpotShadowParameters` 块一致。three 自己的 UBO 用的是
        // 更高编号的绑定点，这里不会互相踩。
        bindBufferBase!.call(gl, gl.UNIFORM_BUFFER, 0, buffer),
        gl.bindBuffer(gl.UNIFORM_BUFFER, null),
        true
      );
    },
    bind() {
      (gl && buffer && bindBufferBase?.call(gl, gl.UNIFORM_BUFFER, 0, buffer));
    },
    release,
  };
}
