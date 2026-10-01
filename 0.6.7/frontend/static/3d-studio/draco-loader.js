import { DRACOLoader } from "../vendor/three/0.182.0/DRACOLoader.js?v=20260903-three-0182-draco-module-path-v1";
function toWorkerError(event) {
  const messageText = String(event?.message || "").trim();
  return new Error(messageText || "Draco 同源解码 Worker 启动失败");
}
export class SameOriginDRACOLoader extends DRACOLoader {
  constructor(workerUrl, options) {
    (super(options), (this.sameOriginWorkerUrl = workerUrl), (this.disposed = false));
  }
  ["_initDecoder"]() {
    return this.sameOriginWorkerUrl
      ? (this.decoderPending || (this.decoderPending = Promise.resolve()), this.decoderPending)
      : super._initDecoder();
  }
  ["_getWorker"](jobId, jobCost) {
    return this.sameOriginWorkerUrl
      ? this._initDecoder().then(() => {
          if (this.disposed) throw new DOMException("Draco 解码器已关闭", "AbortError");
          if (this.workerPool.length < this.workerLimit) {
            let worker;
            try {
              worker = new Worker(this.sameOriginWorkerUrl, {
                name: "ha-bridge-draco",
              });
            } catch (workerError) {
              throw toWorkerError(workerError);
            }
            ((worker._callbacks = {}),
              (worker._taskCosts = {}),
              (worker._taskLoad = 0),
              (worker._fatalError = null),
              (worker.onmessage = (message) => {
                const payload = message.data,
                  callback = worker._callbacks[payload?.id];
                payload?.type === "decode"
                  ? callback?.resolve(payload)
                  : payload?.type === "error" &&
                    callback?.reject(new Error(payload.error || "Draco 模型解码失败"));
              }),
              (worker.onerror = (errorEvent) => {
                const fatalError = toWorkerError(errorEvent);
                worker._fatalError = fatalError;
                for (const pending of Object.values(worker._callbacks)) pending.reject(fatalError);
                errorEvent.preventDefault?.();
              }),
              worker.postMessage({
                type: "init",
                decoderPath: globalThis.HABridgeEmbed?.url(this.decoderPath) || this.decoderPath,
                decoderConfig: this.decoderConfig,
              }),
              this.workerPool.push(worker));
          } else
            this.workerPool.sort((workerA, workerB) =>
              workerA._taskLoad > workerB._taskLoad ? -1 : 1,
            );
          const selectedWorker = this.workerPool[this.workerPool.length - 1];
          if (selectedWorker._fatalError) throw selectedWorker._fatalError;
          return (
            (selectedWorker._taskCosts[jobId] = jobCost),
            (selectedWorker._taskLoad += jobCost),
            selectedWorker
          );
        })
      : super._getWorker(jobId, jobCost);
  }
  ["dispose"]() {
    this.disposed = true;
    const dOMException1 = new DOMException("Draco 解码已取消", "AbortError");
    for (const poolWorker of this.workerPool)
      for (const poolCallback of Object.values(poolWorker._callbacks))
        poolCallback.reject(dOMException1);
    return super.dispose();
  }
}
