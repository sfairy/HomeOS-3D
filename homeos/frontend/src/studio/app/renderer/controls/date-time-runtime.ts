export function formatLocalTime(config: any, date = new Date()) {
  const shouldShowSeconds = config.showSeconds === true,
    shouldUse12Hour = config.hour12 === true;
  let hours = date.getHours(),
    suffix = "";
  shouldUse12Hour && ((suffix = hours >= 12 ? "PM" : "AM"), (hours %= 12), hours || (hours = 12));
  const timeParts = [String(hours).padStart(2, "0"), String(date.getMinutes()).padStart(2, "0")];
  return (
    shouldShowSeconds && timeParts.push(String(date.getSeconds()).padStart(2, "0")),
    {
      value: timeParts.join(":"),
      suffix: suffix,
    }
  );
}
export function formatLocalDate(options: any, referenceDate = new Date()) {
  const dateText =
    referenceDate.getFullYear() +
    "-" +
    String(referenceDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(referenceDate.getDate()).padStart(2, "0");
  return options.showWeekday === false
    ? dateText
    : dateText + " 星期" + "日一二三四五六"[referenceDate.getDay()];
}
const CHINESE_DIGITS: Readonly<Record<string, number>> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/**
 * 解析农历日：`Intl` 的 chinese calendar 会输出「初一」「十二」「廿三」「三十」
 * 这类中文数字，直接 `Number()` 是 NaN。也兼容少数实现输出阿拉伯数字。
 */
export function parseChineseLunarDay(dayText: unknown) {
  if (typeof dayText === "number") return Number.isInteger(dayText) ? dayText : NaN;
  if (typeof dayText !== "string") return NaN;
  const normalizedDayText = dayText.trim();
  if (/^\d+$/.test(normalizedDayText)) return Number(normalizedDayText);
  if (!normalizedDayText) return NaN;
  if (normalizedDayText === "初十") return 10;
  if (normalizedDayText === "二十" || normalizedDayText === "廿十") return 20;
  if (normalizedDayText === "三十") return 30;
  const prefix = normalizedDayText[0],
    digit = CHINESE_DIGITS[normalizedDayText[1]];
  if (!digit) return NaN;
  return prefix === "初" ? digit : prefix === "十" ? 10 + digit : prefix === "廿" ? 20 + digit : NaN;
}

export function formatLunarDate(targetDate = new Date()) {
  try {
    const lunarFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      // 显示数字固定为拉丁数字：否则部分浏览器会把「初七」再套一次本地化数字。
      numberingSystem: "latn",
      month: "long",
      day: "numeric",
    });
    if (lunarFormatter.resolvedOptions().calendar !== "chinese") return "";
    const parts = lunarFormatter.formatToParts(targetDate),
      monthText = parts.find((part) => part.type === "month")?.value,
      dayNumber = parseChineseLunarDay(parts.find((dayPart) => dayPart.type === "day")?.value);
    if (!monthText || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 30) return "";
    const dayText =
      dayNumber === 10
        ? "初十"
        : dayNumber === 20
          ? "二十"
          : dayNumber === 30
            ? "三十"
            : "" +
              (dayNumber < 10 ? "初" : dayNumber < 20 ? "十" : "廿") +
              "一二三四五六七八九"[(dayNumber % 10) - 1];
    return "农历" + monthText + dayText;
  } catch {
    return "";
  }
}
