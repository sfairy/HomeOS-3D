/**
 * 地面反射「细节层」网格的简化 Worker 模块。
 *
 * 位置：studio-reflection-detail.js 在生成高细节反射网格前，把合并后的几何
 *   交给本模块做减面，减轻反射通道的绘制负担。
 * 对外：simplifyReflection（可直接 await 的纯函数）；当脚本运行在 Worker 线程
 *   （存在 self 且无 document）时，额外注册 onmessage 处理器以支持消息式调用。
 * 约定：消息字段为 {id, indices, positions, attributes, stride, weights, error}，
 *   回包为 {id, indices} 或 {id, failed: true}；indices 以 Transferable 方式回传。
 */

import { MeshoptSimplifier } from "../vendor/meshoptimizer/0.25/meshopt_simplifier.module.js";

/**
 * 用 meshoptimizer 的带属性简化算法削减索引数量。
 */
export async function simplifyReflection({
  indices: indexArray,
  positions: vertexPositions,
  attributes: vertexAttributes,
  stride: attributeStride,
  weights: attributeWeights,
  error: targetError
}) {
  // 简化器是 WASM 模块，必须先等它 ready，否则调用会拿到未初始化的导出。
  await MeshoptSimplifier.ready;
  // 简化器的目标索引数与误差策略：目标索引数取原索引数的 45%，并向下取整到
  // 3 的倍数（保证三角形完整）；误差类型与边界锁定选项见下方数组。
  return MeshoptSimplifier.simplifyWithAttributes(
    indexArray,
    vertexPositions,
    3,
    vertexAttributes,
    attributeStride,
    attributeWeights,
    null,
    Math.floor((indexArray.length * 0.45) / 3) * 3,
    targetError,
    // ErrorAbsolute 用绝对误差而非相对误差，便于按反射层的视觉尺度定量控制；
    // LockBorder 锁住开放边界，防止简化后网格轮廓出现缺口。
    ["ErrorAbsolute", "LockBorder"]
  )[0];
}
// 同一份文件既被主线程以 import 方式使用，也作为 Worker 脚本加载：
// 只有 Worker 环境（有 self、无 document）才注册消息处理，避免主线程被误挂载。
if (typeof self !== "undefined" && typeof document === "undefined") {
  self.onmessage = async ({ data: messageData }) => {
    try {
      const simplifiedIndices = await simplifyReflection(messageData);
      // 索引缓冲回传后主线程不再需要，转移所有权避免一次结构化克隆拷贝。
      self.postMessage(
        {
          id: messageData.id,
          indices: simplifiedIndices
        },
        [simplifiedIndices.buffer]
      );
    } catch {
      // 减面失败不是致命错误：回一个 failed 标记，让主线程退回未简化的网格继续渲染。
      self.postMessage({
        id: messageData.id,
        failed: true
      });
    }
  };
}
