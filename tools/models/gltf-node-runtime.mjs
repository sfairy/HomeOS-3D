/**
 * 让浏览器版的 three / GLTFExporter 能在 Node 里跑起来的最小运行环境补丁。
 *
 * 为什么需要：GLTFExporter 的 binary 分支用 `new FileReader()` 把合并后的 Blob 读成 ArrayBuffer
 * （见 vendor/three/0.186.0/GLTFExporter.js 的 writeAsync），而 Node 有 Blob、没有 FileReader。
 * 这段补丁只实现导出器真正调用的那几个成员（readAsArrayBuffer / readAsDataURL / onloadend / onerror），
 * 不是完整的 FileReader 实现 —— 别拿去当通用 polyfill 用。
 *
 * 另外导出器产出的结果可能是 Blob（而非 ArrayBuffer），Node 侧要显式转一次，见 toArrayBuffer。
 */
import { Buffer } from "node:buffer";

/** 安装补丁。幂等：已经存在则什么都不做。 */
export function installGltfNodeShims() {
  if (typeof globalThis.FileReader !== "undefined") {
    return;
  }
  class NodeFileReader {
    constructor() {
      this.result = null;
      this.onload = null;
      this.onloadend = null;
      this.onerror = null;
    }
    #settle(result) {
      this.result = result;
      // 导出器只挂 onloadend；onload 一起叫上，省得将来换个用法就静默不返回。
      if (typeof this.onload === "function") {
        this.onload({ target: this });
      }
      if (typeof this.onloadend === "function") {
        this.onloadend({ target: this });
      }
    }
    #fail(error) {
      if (typeof this.onerror === "function") {
        this.onerror(error);
      }
    }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(buffer => this.#settle(buffer), error => this.#fail(error));
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        buffer => {
          const mimeType = blob?.type || "application/octet-stream";
          this.#settle(`data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`);
        },
        error => this.#fail(error)
      );
    }
  }
  globalThis.FileReader = NodeFileReader;
}

/**
 * 把导出结果统一成 Buffer。
 * GLTFExporter 在 binary 模式下返回 Blob（浏览器与 Node 都是），非 binary 模式返回 JSON 对象；
 * 这里只处理前者，JSON 结果属于用法错误，直接抛出来而不是写出一个坏文件。
 */
export async function toArrayBuffer(exported) {
  if (exported instanceof ArrayBuffer) {
    return exported;
  }
  if (typeof Blob !== "undefined" && exported instanceof Blob) {
    return await exported.arrayBuffer();
  }
  throw new TypeError(
    "GLTFExporter 未返回二进制结果：请以 binary: true 调用 parse()（收到的是 " +
      Object.prototype.toString.call(exported) +
      "）"
  );
}
