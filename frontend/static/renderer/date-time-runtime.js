/**
 * 日期 / 时间控件的格式化工具。
 *
 * 职责：把 Date 实例格式化成控件要展示的三段文案——时间、日期、农历。
 * 这里只做纯格式化，不读控件注册表，也不碰网络；
 * 运行时由 home.js 定时触发重绘，把最新的 Date 传进来即可。
 *
 * 约定：显示选项来自控件属性（camelCase），
 * showSeconds / hour12 / showWeekday 为 true 时才改变输出形态。
 */

/**
 * 把日期格式化成时间文案。
 *
 * @param {object} options 控件显示选项，读取 showSeconds 与 hour12 两个布尔项。
 * @param {Date} [date] 待格式化的时间点，默认取当前时刻。
 * @returns {{value: string, suffix: string}} value 为 HH:mm[:ss]，suffix 为 AM / PM（24 小时制时为空串）。
 */
export function formatLocalTime(options, date = new Date()) {
  const isSecondsVisible = options.showSeconds === true;
  const isHour12 = options.hour12 === true;
  let hour = date.getHours();
  let periodSuffix = "";
  if (isHour12) {
    // 12 小时制下先取上午 / 下午后缀，再把 0 点与 12 点一起归一到 12 点显示。
    periodSuffix = hour >= 12 ? "PM" : "AM";
    hour %= 12;
    hour ||= 12;
  }
  const timeParts = [String(hour).padStart(2, "0"), String(date.getMinutes()).padStart(2, "0")];
  if (isSecondsVisible) {
    timeParts.push(String(date.getSeconds()).padStart(2, "0"));
  }
  return {
    value: timeParts.join(":"),
    suffix: periodSuffix
  };
}
/**
 * 把日期格式化成 `YYYY-MM-DD[ 星期X]` 文案。
 *
 * @param {object} displayOptions 控件显示选项，showWeekday 显式为 false 时才省略星期。
 * @param {Date} [dateValue] 待格式化的时间点，默认取当前时刻。
 * @returns {string} 日期文案；星期取自 `日一二三四五六`，用 getDay() 的下标直接取字。
 */
export function formatLocalDate(displayOptions, dateValue = new Date()) {
  // 刻意不用 toISOString()：那条路径按 UTC 切片，跨时区会整体偏移一天。
  const dateText =
    dateValue.getFullYear() +
    "-" +
    String(dateValue.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dateValue.getDate()).padStart(2, "0");
  if (displayOptions.showWeekday === false) {
    return dateText;
  } else {
    return dateText + " 星期" + "日一二三四五六"[dateValue.getDay()];
  }
}
/**
 * 把时间点格式化成中文农历文案（形如「农历八月初六」）。
 *
 * 依赖 Intl 的中文农历历法；运行时（如精简版 JS 引擎）缺失该历法时返回空串，
 * 由调用方据此隐藏农历这一行，而不是让整个时钟控件渲染失败。
 *
 * @param {Date} [dateSource] 待格式化的时间点，默认取当前时刻。
 * @returns {string} 农历文案；环境不支持农历历法时返回空串。
 */
export function formatLunarDate(dateSource = new Date()) {
  try {
    // Intl 的中文农历历法在部分环境不可用，且输出的月份 / 日期之间可能夹空格，这里一次性去掉。
    const lunarText = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric"
    })
      .format(dateSource)
      .replace(/\s+/g, "");
    if (lunarText) {
      // 不同运行时有的已经自带「农历」前缀，有的没有，统一补齐且不重复叠加。
      return "农历" + lunarText.replace(/^农历/, "");
    } else {
      return "";
    }
  } catch {
    // 历法不支持时静默降级：返回空串交由调用方隐藏这一行，而不是让整个控件渲染失败。
    return "";
  }
}
