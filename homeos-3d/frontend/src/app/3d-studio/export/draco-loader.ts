import { DRACOLoader } from "/static/vendor/three/0.186.0/DRACOLoader.js";

/** Draco Worker 上每条解码任务挂起的回调句柄。 */
type DracoPendingCallback = {
  resolve: (value: any) => void;
  reject: (error: any) => void;
};
function toWorkerError(event) {
  const messageText = String(event?.message || "").trim();
  return new Error(messageText || "Draco 同源解码 Worker 启动失败");
}
/**
 * 从解码器文件的 URL 反推它所在的目录（含结尾 `/`）。取不到时返回空串，由调用方判定「没配」。
 *
 * r186 的基类只保留 `decoderPaths`（一个对象），没有能直接喂给 Worker 的目录字符串；
 * 少了它，Worker 里的 `importScripts` 会以 Worker 脚本自身所在目录为基准，找不到解码器。
 */
function directoryFromDecoderUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  const slash = value.lastIndexOf("/");
  return slash >= 0 ? value.slice(0, slash + 1) : "";
}
export class SameOriginDRACOLoader extends DRACOLoader {
  constructor(workerUrl, options) {
    (super(options),
      (this.sameOriginWorkerUrl = workerUrl),
      (this.decoderDirectory = ""),
      (this.disposed = false));
  }
  /** 交给基类解析出 decoderPaths，再从结果反推目录供同源 Worker 使用。 */
  setDecoderPath(path) {
    return (
      super.setDecoderPath(path),
      (this.decoderDirectory = directoryFromDecoderUrl(this.decoderPaths?.js)),
      this
    );
  }
  /**
   * 静默写入解码器配置。
   *
   * 基类的 `setDecoderConfig` 自 r186 起已废弃（调用会打 console.warn，r194 移除），
   * 这里直接写字段，行为与基类一致但不出告警。
   */
  setDecoderConfig(config) {
    return ((this.decoderConfig = config), this);
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
            if (!this.decoderDirectory) throw new Error("Draco decoderPath 未配置");
            let worker;
            try {
              worker = new Worker(this.sameOriginWorkerUrl, {
                name: "homeos-draco",
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
                for (const pending of Object.values<DracoPendingCallback>(worker._callbacks))
                  pending.reject(fatalError);
                worker._callbacks = {};
                // 毒化 Worker 必须立刻出池并销毁：它永久占着槽位，池满后 _getWorker
                // 只会反复选到它并抛 _fatalError，再也没有重建机会。
                const poolIndex = this.workerPool.indexOf(worker);
                poolIndex >= 0 && this.workerPool.splice(poolIndex, 1);
                (worker.terminate(), errorEvent.preventDefault?.());
              }),
              worker.postMessage({
                type: "init",
                decoderPath:
                  globalThis.HomeOSEmbed?.url(this.decoderDirectory) || this.decoderDirectory,
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
      for (const poolCallback of Object.values<DracoPendingCallback>(poolWorker._callbacks))
        poolCallback.reject(dOMException1);
    return super.dispose();
  }
}
