/**
 * 同源部署下的 Draco 加载器。
 *
 * 加载外部 glTF / GLB（几何用 Draco 压缩）时的解码入口，由 studio-app.js 实例化后交给
 * three.js 的 GLTFLoader。对外：SameOriginDRACOLoader。原版 DRACOLoader 用 Blob URL 启
 * Worker，而部署环境 CSP 只允许同源脚本，故改成直接用同源的 draco-decoder-worker.js。
 *
 * r186 的 DRACOLoader 把解码器路径收进 `this.decoderPaths`（`{js, wasm, dep_js}` 对象），
 * 既不保留可交给 Worker 的目录字符串，init 消息里也不再带 `decoderPath`；本类因此自己记一份
 * 目录（`setDecoderPath` 时从基类解析结果反推），并在发 init 时补上。
 */

import { DRACOLoader } from "/static/vendor/three/0.186.0/DRACOLoader.js?v=2609251920";

/**
 * 把 Worker 启动失败的原因包装成带中文兜底文案的 Error。
 */
function normalizeWorkerError(cause) {
  // Worker / 事件对象上的 message 可能为空，此时用中文文案兜底，避免抛出空错误难以排查。
  const errorMessage = String(cause?.message || "").trim();
  return new Error(errorMessage || "Draco 同源解码 Worker 启动失败");
}

/**
 * 从解码器文件的 URL 反推它所在的目录（含结尾 `/`）。取不到时返回空串，由调用方判定「没配」。
 */
function directoryFromDecoderUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }
  const slash = value.lastIndexOf("/");
  return slash >= 0 ? value.slice(0, slash + 1) : "";
}

/**
 * 使用同源 Worker 脚本的 DRACOLoader。
 * 与基类差异有三处：_initDecoder 不做主线程预加载（真正的初始化在 Worker 内完成）、
 * _getWorker 由基类的 Blob URL 方案改为 new Worker(同源 URL)、setDecoderPath 额外留一份目录字符串。
 */
export class SameOriginDRACOLoader extends DRACOLoader {
  /**
   * @param {string} workerUrl 同源的 draco-decoder-worker.js 地址。
   * @param {import("three").LoadingManager} [manager] 交给基类的加载管理器。
   */
  constructor(workerUrl, manager) {
    super(manager);
    this.sameOriginWorkerUrl = workerUrl;
    // r186 基类只保留 decoderPaths（对象），没有能直接喂给 Worker 的目录字符串，这里另存一份。
    this.decoderDirectory = "";
  }

  /**
   * 交给基类解析出 decoderPaths，再从结果反推目录供同源 Worker 使用。
   * 这样说字符串与 `{ js, wasm }` 两种入口都能覆盖，不必自己判类型。
   */
  setDecoderPath(path) {
    super.setDecoderPath(path);
    this.decoderDirectory = directoryFromDecoderUrl(this.decoderPaths?.js);
    return this;
  }

  /**
   * 静默写入解码器配置。
   *
   * 基类 r186 起给这个方法打了弃用警告（r194 移除），但本仓仍按 `{ type: "wasm" | "js" }` 传，
   * 且 Worker 侧就是靠它选 draco_wasm_wrapper.js / draco_decoder.js。这里直接赋同样的字段，
   * 免得每次进 3D 工作室都往控制台刷一条与调用方无关的废弃警告。
   */
  setDecoderConfig(config) {
    this.decoderConfig = config;
    return this;
  }

  /**
   * 解码器初始化整体在 Worker 内完成，主线程这边立刻给一个已 resolve 的 Promise。
   * 覆写是为了绕开基类「主线程预加载 + Blob URL Worker」那条 CSP 走不通的路径。
   */
  _initDecoder() {
    if (this.sameOriginWorkerUrl) {
      // 用 ||= 而不是直接赋值：基类可能已写入其它值，避免覆盖。
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
  _getWorker(taskId, taskCost) {
    if (this.sameOriginWorkerUrl) {
      return this._initDecoder().then(() => {
        // 池未满就新建；_callbacks / _taskCosts / _taskLoad 三个字段沿用基类的约定，
        // 因为基类的 load() 会直接读写它们。
        if (this.workerPool.length < this.workerLimit) {
          if (!this.decoderDirectory) {
            // 先于 Worker 创建检查：否则会先漏一个 Worker 再抛错。
            throw new Error("Draco decoderPath 未配置");
          }
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
