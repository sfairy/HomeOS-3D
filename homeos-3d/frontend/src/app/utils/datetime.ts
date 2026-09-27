/**
 * 时间戳 → 中文可读时间的唯一实现。
 */
export function formatZhDateTime(
  value: unknown,
  options: { withDate?: boolean; withSeconds?: boolean } = {},
): string {
  const { withDate = true, withSeconds = false } = options;
  const parsedDate = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }
  const dateTimeFormatOptions: Intl.DateTimeFormatOptions = { hour12: false };
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
