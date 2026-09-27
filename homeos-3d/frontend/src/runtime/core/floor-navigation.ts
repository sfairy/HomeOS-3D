/**
 * 楼层导航选项的生成逻辑。
 */

type FloorEntry = {
  id?: string;
  name?: string;
  elevation?: number | string | null;
  [key: string]: unknown;
};

const CHINESE_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
};

/**
 * 依据楼层数据与人工覆盖表生成导航选项，并按「从上到下」排序。
 */
export function floorNavigationChoices(
  floors: FloorEntry[],
  floorNumbers: Record<string, number> = {},
) {
  /**
   * 把楼层名里的数字解析成整数：支持阿拉伯数字、中文数字与带「十」的复合中文数字；
   */
  const parseFloorNumber = (floorNameText: string) => {
    if (/^\d+$/.test(floorNameText)) {
      return Number(floorNameText);
    }
    if (floorNameText.includes("十")) {
      // 以「十」为界拆成十位与个位；"十" 单独出现时十位缺省，按 1 计。
      const [tensCharacter, onesCharacter] = floorNameText.split("十");
      return (CHINESE_DIGITS[tensCharacter || ""] || 1) * 10 + (CHINESE_DIGITS[onesCharacter || ""] || 0);
    }
    return CHINESE_DIGITS[floorNameText] || 0;
  };
  // 按 elevation 升序排列，保证编号从下往上分配；缺失 elevation 视为 0。
  const floorEntries = [...floors]
    .sort(
      (firstEntry, secondEntry) =>
        (Number(firstEntry.elevation) || 0) - (Number(secondEntry.elevation) || 0)
    )
    .map(floor => {
      const rawName = String(floor.name || "").trim();
      // 地下层写法：B1 / 地下2 / 负1 / -1（含全角减号 U+2212，中文输入法常见）。
      const basementMatch = rawName.match(
        /^(?:B|地下|负|[-−])\s*([0-9一二两三四五六七八九十]+)(?:F|楼|层)?$/i
      );
      // 地上层写法：3F / 3楼 / 3层。
      const numberedMatch = rawName.match(/^([0-9一二两三四五六七八九十]+)(?:F|楼|层)$/i);
      return {
        floor: floor,
        // 名字没写楼层号时，用负的 elevation 兜底推断是否为地下层。
        basement: !!basementMatch || (!numberedMatch && Number(floor.elevation) < 0),
        // 只认「名称里显式写出的楼层号」；没写就是 0，后面再按顺序分配。
        explicit: parseFloorNumber((basementMatch || numberedMatch)?.[1] || "")
      };
    });
  // 地下层用「从下往上递增后倒序」的等价做法：先统计总数，分配时自减。
  let remainingBasementCount = floorEntries.filter(entry => entry.basement).length;
  let nextFloorNumber = 0;
  return [
    ...floorEntries
      .map(({ floor: floorEntry, basement: isBasement, explicit: explicitNumber }) => {
        // 地下层倒着分号（B2、B1），地上层正着分号（1F、2F），保证视觉上自上而下有序。
        const assignedNumber = isBasement ? remainingBasementCount-- : ++nextFloorNumber;
        const overrideNumber = floorNumbers[String(floorEntry.id)];
        if (
          Number.isInteger(overrideNumber) &&
          overrideNumber !== 0 &&
          Math.abs(overrideNumber!) <= 99
        ) {
          // 人工覆盖优先：负数表示地下层，转成 B 前缀；0 与超界值视为无效而忽略。
          return [
            floorEntry.id,
            overrideNumber! < 0 ? "B" + -overrideNumber! : overrideNumber + "F",
            floorEntry.name || "未命名楼层"
          ];
        } else {
          return [
            floorEntry.id,
            isBasement
              ? "B" + (explicitNumber || assignedNumber)
              : (explicitNumber || assignedNumber) + "F",
            floorEntry.name || "未命名楼层"
          ];
        }
      })
      // 反转让地上层自上而下排列（顶层在前），符合楼层选择器的视觉习惯。
      .reverse(),
    ...(floors.length > 1 ? [["all", "ALL", "全部楼层"]] : [])
  ];
}
