/**
 * 时间戳 → 中文可读时间的唯一实现。
 *
 * 首页设备列表、全局日志、控件注册表的图表提示、渲染层的存在感时间轴过去各写一份
 * `Intl.DateTimeFormat("zh-CN", {...})`：选项各写各的，输出分隔符也就各行其是 ——
 * 同一个时刻在日志里是 `09-20 07:28`、在设备列表里却是 `09/20 07:28`（zh-CN 默认
 * 用斜杠分隔）。这里把「哪些字段、要不要秒」收成两个开关，分隔符统一成短横线。
 */
export function formatZhDateTime(value, options = {}) {
  const { withDate = true, withSeconds = false } = options;
  const parsedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }
  const dateTimeFormatOptions = { hour12: false };
  if (withDate) {
    dateTimeFormatOptions.month = "2-digit";
    dateTimeFormatOptions.day = "2-digit";
  }
  dateTimeFormatOptions.hour = "2-digit";
  dateTimeFormatOptions.minute = "2-digit";
  if (withSeconds) {
    dateTimeFormatOptions.second = "2-digit";
  }
  return new Intl.DateTimeFormat("zh-CN", dateTimeFormatOptions)
    .format(parsedDate)
    .replace(/\//g, "-");
}
