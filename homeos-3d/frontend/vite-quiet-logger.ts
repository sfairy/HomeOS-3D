import { createLogger, type Logger } from "vite";

/** 压掉「经典 IIFE / 运行时路径」等预期告警，避免刷屏。 */
export function quietLogger(): Logger {
  const logger = createLogger();
  const warn = logger.warn.bind(logger);
  const warnOnce = logger.warnOnce.bind(logger);

  const suppress = (msg: string) =>
    msg.includes('can\'t be bundled without type="module" attribute') ||
    msg.includes("doesn't exist at build time, it will remain unchanged");

  logger.warn = (msg, options) => {
    if (typeof msg === "string" && suppress(msg)) return;
    warn(msg, options);
  };
  logger.warnOnce = (msg, options) => {
    if (typeof msg === "string" && suppress(msg)) return;
    warnOnce(msg, options);
  };
  return logger;
}
