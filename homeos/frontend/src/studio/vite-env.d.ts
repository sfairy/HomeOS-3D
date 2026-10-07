

interface Navigator {
  standalone?: boolean;
  deviceMemory?: number;
}

/** 全局日志桥接对象（由 client-log / global-log 系列注入）。 */
interface HomeOSLog {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
  linkError?: (error: Error, response?: Response | null) => Error;
  /** display 启动时写入上下文（项目 id 等）。 */
  setContext?: (context: { [key: string]: unknown }) => void;
  report?: (level: string, category?: string, message?: string, details?: unknown) => void;
  [key: string]: unknown;
}

interface HomeOSDisplayBoot {
  mark?: (phase: string) => void;
  done?: () => void;
  fail?: (reason?: unknown) => void;
  /** 拿到项目草稿后交给渲染器。 */
  setDocument?: (document: unknown) => void;
  /** 首屏渲染完成。 */
  ready?: (rootElement: HTMLElement) => void;
  /**
   * 收起启动 splash 并放行外壳（不改写 splash 文案）。
   * 供「总览尚无仪表盘」等空状态使用：提示文案要求用户去「设置 → 布局」，
   * 必须让 MainLayout 的导航可见可点，不能被整屏 splash 挡住。
   */
  reveal?: () => void;
  [key: string]: unknown;
}

/** display 首屏预热请求：按路径取走已发起的请求，避免重复请求。 */
interface HomeOSDisplayStartup {
  take?: (requestPath: string) =>
    | {
        controller?: AbortController;
        result: Promise<{ response: Response; payload: any }>;
      }
    | null
    | undefined;
}

interface Window {
  HomeOSLog?: HomeOSLog;
  HomeOSDisplayBoot?: HomeOSDisplayBoot;
  HomeOSDisplayStartup?: HomeOSDisplayStartup;
  /** 外模型是否走延后加载（studio-app 置位，外模型管理器读取）。 */
  externalModelLoadsDeferred?: boolean;
  /** 正在释放延后加载的模型：避免同一帧又被排回队列。 */
  __homeosReleasingDeferredModels?: boolean;
  /** 把某个外模型类型排进延后加载队列。 */
  __homeosDeferExternalModel?: (modelTypeName: string) => void;
  /** 导出家具 JSON 的桥接钩子（由 bridge 侧注入）。 */
  __homeosExportFurnitureJson?: (exportType: string, presets: any) => any;
  [key: string]: unknown;
}

/** User-Agent Client Hints（UA-CH）还没有进入 TS 的 lib.dom，renderer 用 navigator.userAgentData.platform 判平台，这里按实际用到的字段补齐。 */
interface Navigator {
  userAgentData?: {
    platform?: string;
    mobile?: boolean;
    brands?: { brand: string; version: string }[];
  };
}

declare const HomeOSLog: HomeOSLog | undefined;
declare const HomeOSDisplayBoot: HomeOSDisplayBoot | undefined;
