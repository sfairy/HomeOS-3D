export function formatLocalTime(config, date = new Date()) {
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
export function formatLocalDate(options, referenceDate = new Date()) {
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
export function formatLunarDate(targetDate = new Date()) {
  try {
    const lunarFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric",
    });
    if (lunarFormatter.resolvedOptions().calendar !== "chinese") return "";
    const parts = lunarFormatter.formatToParts(targetDate),
      monthText = parts.find((part) => part.type === "month")?.value,
      dayNumber = Number(parts.find((dayPart) => dayPart.type === "day")?.value);
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
