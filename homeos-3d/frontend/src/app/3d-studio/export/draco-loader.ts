/**
 * 同源部署下的 Draco 加载器。
 */

import { DRACOLoader } from "/static/vendor/three/0.186.0/DRACOLoader.js";

type WorkerTaskCallback = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type DracoWorker = Worker & {
  _callbacks: Record<string | number, WorkerTaskCallback>;
  _taskCosts: Record<string | number, number>;
  _taskLoad: number;
  _fatalError: Error | null;
};

type DracoLoaderBase = {
  sameOriginWorkerUrl?: string;
  decoderDirectory?: string;
  decoderPaths?: { js?: string };
  decoderConfig?: unknown;
  decoderPending?: Promise<void>;
  workerPool: DracoWorker[];
  workerLimit: number;
  setDecoderPath(path: string): unknown;
  setWorkerLimit(limit: number): void;
  preload(): void;
  _initDecoder(): Promise<void>;
  _getWorker(taskId: string | number, taskCost: number): Promise<Worker>;
};

function normalizeWorkerError(cause: { message?: string } | null | undefined): Error {
  const errorMessage = String(cause?.message || "").trim();
  return new Error(errorMessage || "Draco 同源解码 Worker 启动失败");
}

/**
 * 从解码器文件的 URL 反推它所在的目录（含结尾 `/`）。取不到时返回空串，由调用方判定「没配」。
 */
function directoryFromDecoderUrl(url: unknown): string {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }
  const slash = value.lastIndexOf("/");
  return slash >= 0 ? value.slice(0, slash + 1) : "";
}

/**
 * 使用同源 Worker 脚本的 DRACOLoader。
 */
export class SameOriginDRACOLoader extends (DRACOLoader as unknown as new (
  manager?: unknown
) => DracoLoaderBase) {
  sameOriginWorkerUrl: string;
  decoderDirectory: string;
  declare decoderPaths?: { js?: string };
  declare decoderConfig?: unknown;
  declare decoderPending?: Promise<void>;
  declare workerPool: DracoWorker[];
  declare workerLimit: number;

  /**
   * @param workerUrl 同源的 draco-decoder-worker.js 地址。
   * @param manager 交给基类的加载管理器。
   */
  constructor(workerUrl: string, manager?: unknown) {
    super(manager);
    this.sameOriginWorkerUrl = workerUrl;
    // r186 基类只保留 decoderPaths（对象），没有能直接喂给 Worker 的目录字符串，这里另存一份。
    this.decoderDirectory = "";
  }

  /**
   * 交给基类解析出 decoderPaths，再从结果反推目录供同源 Worker 使用。
   */
  setDecoderPath(path: string) {
    super.setDecoderPath(path);
    this.decoderDirectory = directoryFromDecoderUrl(this.decoderPaths?.js);
    return this;
  }

  /**
   * 静默写入解码器配置。
   */
  setDecoderConfig(config: unknown) {
    this.decoderConfig = config;
    return this;
  }

  /**
   * 解码器初始化整体在 Worker 内完成，主线程这边立刻给一个已 resolve 的 Promise。
   */
  _initDecoder(): Promise<void> {
    if (this.sameOriginWorkerUrl) {
      this.decoderPending ||= Promise.resolve();
      return this.decoderPending;
    } else {
      // 没配同源地址时退回基类逻辑，便于本地调试对比。
      return super._initDecoder();
    }
  }

  /**
   * 从 Worker 池中取出一个可用 Worker，必要时新建。
   */
  _getWorker(taskId: string | number, taskCost: number): Promise<Worker> {
    if (this.sameOriginWorkerUrl) {
      return this._initDecoder().then(() => {
        // 池未满就新建；_callbacks / _taskCosts / _taskLoad 三个字段沿用基类的约定，
        if (this.workerPool.length < this.workerLimit) {
          if (!this.decoderDirectory) {
            throw new Error("Draco decoderPath 未配置");
          }
          let worker: DracoWorker;
          try {
            worker = new Worker(this.sameOriginWorkerUrl, {
              name: "homeos-draco"
            }) as DracoWorker;
          } catch (startError) {
            // 构造 Worker 时同步抛错（脚本 404、CSP 拦截）也要转成中文可读的错误。
            throw normalizeWorkerError(startError as { message?: string });
          }
          worker._callbacks = {};
          worker._taskCosts = {};
          worker._taskLoad = 0;
          // 记录致命错误：Worker 一旦 onerror，后续任务都应直接失败而不是挂死。
          worker._fatalError = null;
          worker.onmessage = messageEvent => {
            const workerMessage = (messageEvent as MessageEvent).data as {
              id?: string | number;
              type?: string;
              error?: string;
            };
            const pendingTask = worker._callbacks[workerMessage?.id as string | number];
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
            for (const failingTask of Object.values(worker._callbacks)) {
              failingTask.reject(fatalError);
            }
            worker._callbacks = {};
            // 毒化 worker 必须立刻出池并销毁：否则它永久占着槽位，池满后
            // _getWorker 只会反复选到它并抛 _fatalError，再也没有重建机会。
            const poolIndex = this.workerPool.indexOf(worker);
            if (poolIndex >= 0) {
              this.workerPool.splice(poolIndex, 1);
            }
            worker.terminate();
            // 阻止浏览器把错误再冒泡成全局未捕获异常。
            errorEvent.preventDefault?.();
          };
          worker.postMessage({
            type: "init",
            decoderPath: this.decoderDirectory,
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
