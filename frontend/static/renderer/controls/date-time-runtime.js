/**
 * 日期 / 时间控件的格式化工具。
 *
 * 把 Date 格式化成控件要展示的三段文案——时间、日期、农历；只做纯格式化，不读控件注册表、
 * 不碰网络，运行时由 home.js 定时触发重绘并传入最新 Date。显示选项来自控件属性（camelCase），
 * showSeconds / hour12 / showWeekday 为 true 时才改变输出形态。
 */

/**
 * 把日期格式化成时间文案。
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
 * 把时间点格式化成中文农历文案（形如「农历八月初十」）。
 * 依赖 Intl 中文农历历法；引擎缺失该历法时返回空串，由调用方隐藏这一行，而不是整个控件渲染失败。
 * 不能直接用 format()：它对「日」会输出阿拉伯数字（如「八月10日」），不符合中文农历读法，
 * 这里改成取部件后按农历口径重排日号。
 */
export function formatLunarDate(dateSource = new Date()) {
  try {
    // Intl 的中文农历历法在部分环境不可用，先构造格式化器再确认历法真的落到了 chinese。
    const lunarFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric"
    });
    if (lunarFormatter.resolvedOptions().calendar !== "chinese") {
      return "";
    }
    const lunarParts = lunarFormatter.formatToParts(dateSource);
    const lunarMonthText = lunarParts.find(lunarPart => lunarPart.type === "month")?.value;
    const lunarDayNumber = Number(lunarParts.find(lunarPart => lunarPart.type === "day")?.value);
    // 月名缺失、日号不是 1-30 的整数都说明这个历法输出不可用，交给调用方隐藏。
    if (!lunarMonthText || !Number.isInteger(lunarDayNumber) || lunarDayNumber < 1 || lunarDayNumber > 30) {
      return "";
    }
    // 日号按农历读法重排：初一…初十 / 十一…十九 / 二十 / 廿一…廿九 / 三十。
    const lunarDayText =
      lunarDayNumber === 10
        ? "初十"
        : lunarDayNumber === 20
          ? "二十"
          : lunarDayNumber === 30
            ? "三十"
            : "" +
              (lunarDayNumber < 10 ? "初" : lunarDayNumber < 20 ? "十" : "廿") +
              "一二三四五六七八九"[lunarDayNumber % 10 - 1];
    return "农历" + lunarMonthText + lunarDayText;
  } catch {
    // 历法不支持时静默降级：返回空串交由调用方隐藏这一行，而不是让整个控件渲染失败。
    return "";
  }
}
