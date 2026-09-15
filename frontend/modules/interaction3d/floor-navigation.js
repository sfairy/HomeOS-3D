/**
 * 楼层导航选项的生成逻辑。
 *
 * 在 3D 子系统里的位置：为楼层切换控件产出「选项列表」，每个选项同时给出
 * 楼层 ID、显示标签与原始名称；3D 舞台与面板共用同一份结果，保证各处标签一致。
 *
 * 对外提供：floorNavigationChoices —— 纯函数，无副作用，可直接单测。
 *
 * 约定：返回值的标签格式固定为数字层「3F」、地下层「B1」、全楼层「ALL」，
 *       前端若有地方按前缀判断楼层类型（例如隐藏地下层专用图元），依赖的正是这个格式。
 */

/**
 * 依据楼层数据与人工覆盖表生成导航选项，并按「从上到下」排序。
 *
 * @param {Array<object>} floors 楼层列表，元素含 id / name / elevation。
 * @param {Object<string, number>} floorNumbers 楼层 ID → 人工指定的数字层号覆盖表；
 *       约定 0 视为「未指定」，绝对值需 ≤ 99 才生效。
 * @returns {Array<[string, string, string]>} 三元组数组：[楼层 ID, 标签, 显示名]，
 *       末尾可能追加 ["all", "ALL", "全部楼层"]。
 */
export function floorNavigationChoices(floors, floorNumbers = {}) {
  /**
   * 把楼层名里的数字解析成整数。
   *
   * 支持三种写法：阿拉伯数字（"3F" 里的 3）、中文数字（三）、以及带「十」的
   * 复合中文数字（十三 → 13、十 → 10）。无法识别时返回 0，交由调用方兜底。
   */
  const parseFloorNumber = floorNameText => {
    if (/^\d+$/.test(floorNameText)) {
      return Number(floorNameText);
    }
    // 中文数字映射；「两」与「二」同义，是家居场景里更常见的口语写法。
    const CHINESE_DIGITS = {
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
    if (floorNameText.includes("十")) {
      // 以「十」为界拆成十位与个位；"十" 单独出现时十位缺省，按 1 计。
      const [tensCharacter, onesCharacter] = floorNameText.split("十");
      return (CHINESE_DIGITS[tensCharacter] || 1) * 10 + (CHINESE_DIGITS[onesCharacter] || 0);
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
        const overrideNumber = floorNumbers[floorEntry.id];
        if (
          Number.isInteger(overrideNumber) &&
          overrideNumber !== 0 &&
          Math.abs(overrideNumber) <= 99
        ) {
          // 人工覆盖优先：负数表示地下层，转成 B 前缀；0 与超界值视为无效而忽略。
          return [
            floorEntry.id,
            overrideNumber < 0 ? "B" + -overrideNumber : overrideNumber + "F",
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
    // 只有一层时不给「全部楼层」，避免出现没有意义的入口。
    ...(floors.length > 1 ? [["all", "ALL", "全部楼层"]] : [])
  ];
}
