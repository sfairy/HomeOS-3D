/**
 * 编译期影子模块：对应 `/static/vendor/qrcode-generator/qrcode.js`（经典 UMD，默认导出工厂函数）。
 */
export interface QrCodeInstance {
  addData(data: string): void;
  make(): void;
  createSvgTag(options?: {
    cellSize?: number;
    margin?: number;
    scalable?: boolean;
  }): string;
  createImgTag(options?: { cellSize?: number; margin?: number; alt?: string }): string;
  createDataURL(options?: { cellSize?: number; margin?: number }): string;
}

export interface QrCodeFactory {
  (typeNumber: number, errorCorrectionLevel: string): QrCodeInstance;
  stringToBytes: (s: string) => number[];
  stringToBytesFuncs: Record<string, (s: string) => number[]>;
}

declare const qrcode: QrCodeFactory;
export default qrcode;
