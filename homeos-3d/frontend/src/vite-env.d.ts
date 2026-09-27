/// <reference types="vite/client" />

interface Navigator {
  standalone?: boolean;
  deviceMemory?: number;
}

interface Window {
  __HA_BRIDGE_PAIRING_HASH__?: string;
  HABridgeLog?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
    linkError?: (error: Error, response?: Response | null) => Error;
    [key: string]: unknown;
  };
  HABridgeDisplayBoot?: {
    mark?: (phase: string) => void;
    done?: () => void;
    fail?: (reason?: unknown) => void;
    [key: string]: unknown;
  };
}


declare module "/static/vendor/qrcode-generator/qrcode.js" {
  interface QrCodeInstance {
    addData(data: string): void;
    make(): void;
    createSvgTag(options?: {
      cellSize?: number;
      margin?: number;
      scalable?: boolean;
    }): string;
  }

  interface QrCodeFactory {
    (typeNumber: number, errorCorrectionLevel: string): QrCodeInstance;
    stringToBytes: (s: string) => number[];
    stringToBytesFuncs: Record<string, (s: string) => number[]>;
  }

  const qrcode: QrCodeFactory;
  export default qrcode;
}

declare module "/api/v1/modules/interaction3d/core/runtime.js" {
  const runtimeModule: Record<string, unknown>;
  export default runtimeModule;
}

declare module "/api/v1/modules/interaction3d/editor/config-editor.js" {
  const configEditorModule: Record<string, unknown>;
  export default configEditorModule;
}

declare module "/api/v1/modules/interaction3d/security/security-editor.js" {
  const securityEditorModule: Record<string, unknown>;
  export default securityEditorModule;
}
