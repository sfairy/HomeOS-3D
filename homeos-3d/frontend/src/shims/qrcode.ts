export interface QrCodeInstance {
  addData(data: string): void;
  make(): void;
  createSvgTag(options?: {
    cellSize?: number;
    margin?: number;
    scalable?: boolean;
  }): string;
}

export interface QrCodeFactory {
  (typeNumber: number, errorCorrectionLevel: string): QrCodeInstance;
  stringToBytes: (s: string) => number[];
  stringToBytesFuncs: Record<string, (s: string) => number[]>;
}

declare const qrcode: QrCodeFactory;
export default qrcode;
