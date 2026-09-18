/**
 * 同源部署下的 Draco 加载器。
 *
 * 位置：3D 工作室加载外部 3D 模型（glTF / GLB，几何用 Draco 压缩）时的解码入口，
 *   由 studio-app.js 实例化后交给 three.js 的 GLTFLoader。
 * 对外：SameOriginDRACOLoader。
 * 为什么要重写：three.js 原版 DRACOLoader 用 Blob URL 启动 Worker，
 *   而部署环境的 CSP 只允许同源脚本，因此这里改成直接用同源的
 *   draco-decoder-worker.js 作为 Worker 地址，其余接口与原版保持一致。
 * 单位约定：本模块不涉及几何换算，坐标与单位由上层模型归一化逻辑负责。
 */

import { DRACOLoader } from "/static/vendor/three/0.182.0/DRACOLoader.js?v=20260918202529";

/**
 * 把 Worker 启动失败的原因包装成带中文兜底文案的 Error。
 *
 * @param {Error|Event|*} cause 原始错误对象或错误事件。
 * @returns {Error} 归一化后的错误。
 */
function normalizeWorkerError(cause) {
  // Worker / 事件对象上的 message 可能为空，此时用中文文案兜底，避免抛出空错误难以排查。
  const errorMessage = String(cause?.message || "").trim();
  return new Error(errorMessage || "Draco 同源解码 Worker 启动失败");
}

/**
 * 使用同源 Worker 脚本的 DRACOLoader。
 *
 * 与基类的差异只有两处：_initDecoder 不做解码器预加载（真正的初始化在 Worker 内完成），
 * _getWorker 由基类的 Blob 方案改为 new Worker(同源 URL)。
 */
export class SameOriginDRACOLoader extends DRACOLoader {
  /**
   * @param {string} workerUrl 同源 Worker 脚本地址（draco-decoder-worker.js）。
   * @param {string} decoderPath Draco 解码器资源目录，透传给基类，最终由 Worker 使用。
   */
  constructor(workerUrl, decoderPath) {
    super(decoderPath);
    this.sameOriginWorkerUrl = workerUrl;
  }

  /**
   * 省略主线程侧的解码器初始化。
   *
   * 返回一个已 resolve 的 Promise 告诉基类「解码器已就绪」，
   * 真正的 WASM 加载发生在 Worker 内部收到 init 消息之后。
   *
   * @returns {Promise<void>} 恒为已完成状态。
   */
  _initDecoder() {
    if (this.sameOriginWorkerUrl) {
      // 用 ||= 而不是直接赋值：基类可能已写入其它值，避免覆盖。
      this.decoderPending ||= Promise.resolve();
      return this.decoderPending;
    } else {
      // 没配同源地址时退回基类逻辑（Blob Worker + 预加载），便于本地调试对比。
      return super._initDecoder();
    }
  }

  /**
   * 从 Worker 池中取出一个可用 Worker，必要时新建。
   *
   * @param {number} taskId 任务 id，回包时原样带回用于匹配回调。
   * @param {number} taskCost 任务预估开销，用于挑选负载最低的 Worker。
   * @returns {Promise<Worker>} 已挂好回调、可就绪接收任务的 Worker。
   */
  _getWorker(taskId, taskCost) {
    if (this.sameOriginWorkerUrl) {
      return this._initDecoder().then(() => {
        // 池未满就新建；_callbacks / _taskCosts / _taskLoad 三个字段沿用基类的约定，
        // 因为基类的 load() 会直接读写它们。
        if (this.workerPool.length < this.workerLimit) {
          let worker;
          try {
            worker = new Worker(this.sameOriginWorkerUrl, {
              name: "homeos-draco"
            });
          } catch (startError) {
            // 构造 Worker 时同步抛错（脚本 404、CSP 拦截）也要转成中文可读的错误。
            throw normalizeWorkerError(startError);
          }
          worker._callbacks = {};
          worker._taskCosts = {};
          worker._taskLoad = 0;
          // 记录致命错误：Worker 一旦 onerror，后续任务都应直接失败而不是挂死。
          worker._fatalError = null;
          worker.onmessage = messageEvent => {
            const workerMessage = messageEvent.data;
            const pendingTask = worker._callbacks[workerMessage?.id];
            if (workerMessage?.type === "decode") {
              // 解码成功：把整个消息交给基类的 load() 继续组 Geometry。
              pendingTask?.resolve(workerMessage);
            } else if (workerMessage?.type === "error") {
              pendingTask?.reject(new Error(workerMessage.error || "Draco 模型解码失败"));
            }
          };
          worker.onerror = errorEvent => {
            const fatalError = normalizeWorkerError(errorEvent);
            worker._fatalError = fatalError;
            // Worker 已不可用，把在飞的任务全部拒掉，否则调用方会永久等待。
            for (const failingTask of Object.values(worker._callbacks)) {
              failingTask.reject(fatalError);
            }
            // 阻止浏览器把错误再冒泡成全局未捕获异常。
            errorEvent.preventDefault?.();
          };
          worker.postMessage({
            type: "init",
            decoderPath: this.decoderPath,
            decoderConfig: this.decoderConfig
          });
          this.workerPool.push(worker);
        } else {
          // 池已满：按负载降序排，排序后取末尾即负载最小的那个。
          this.workerPool.sort((workerA, workerB) =>
            workerA._taskLoad > workerB._taskLoad ? -1 : 1
          );
        }
        const selectedWorker = this.workerPool[this.workerPool.length - 1];
        // 该 Worker 之前出过致命错误就直接抛出，避免任务被派给死掉的 Worker。
        if (selectedWorker._fatalError) {
          throw selectedWorker._fatalError;
        }
        selectedWorker._taskCosts[taskId] = taskCost;
        selectedWorker._taskLoad += taskCost;
        return selectedWorker;
      });
    } else {
      return super._getWorker(taskId, taskCost);
    }
  }
}
