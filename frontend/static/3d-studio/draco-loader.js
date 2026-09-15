import { DRACOLoader } from "/static/vendor/three/0.182.0/DRACOLoader.js?v=20260915211726";
function normalizeWorkerError(cause) {
  const errorMessage = String(cause?.message || "").trim();
  return new Error(errorMessage || "Draco 同源解码 Worker 启动失败");
}
export class SameOriginDRACOLoader extends DRACOLoader {
  constructor(workerUrl, decoderPath) {
    super(decoderPath);
    this.sameOriginWorkerUrl = workerUrl;
  }
  _initDecoder() {
    if (this.sameOriginWorkerUrl) {
      this.decoderPending ||= Promise.resolve();
      return this.decoderPending;
    } else {
      return super._initDecoder();
    }
  }
  _getWorker(taskId, taskCost) {
    if (this.sameOriginWorkerUrl) {
      return this._initDecoder().then(() => {
        if (this.workerPool.length < this.workerLimit) {
          let worker;
          try {
            worker = new Worker(this.sameOriginWorkerUrl, {
              name: "homeos-draco"
            });
          } catch (startError) {
            throw normalizeWorkerError(startError);
          }
          worker._callbacks = {};
          worker._taskCosts = {};
          worker._taskLoad = 0;
          worker._fatalError = null;
          worker.onmessage = messageEvent => {
            const workerMessage = messageEvent.data;
            const pendingTask = worker._callbacks[workerMessage?.id];
            if (workerMessage?.type === "decode") {
              pendingTask?.resolve(workerMessage);
            } else if (workerMessage?.type === "error") {
              pendingTask?.reject(new Error(workerMessage.error || "Draco 模型解码失败"));
            }
          };
          worker.onerror = errorEvent => {
            const fatalError = normalizeWorkerError(errorEvent);
            worker._fatalError = fatalError;
            for (const failingTask of Object.values(worker._callbacks)) {
              failingTask.reject(fatalError);
            }
            errorEvent.preventDefault?.();
          };
          worker.postMessage({
            type: "init",
            decoderPath: this.decoderPath,
            decoderConfig: this.decoderConfig
          });
          this.workerPool.push(worker);
        } else {
          this.workerPool.sort((workerA, workerB) =>
            workerA._taskLoad > workerB._taskLoad ? -1 : 1
          );
        }
        const selectedWorker = this.workerPool[this.workerPool.length - 1];
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
