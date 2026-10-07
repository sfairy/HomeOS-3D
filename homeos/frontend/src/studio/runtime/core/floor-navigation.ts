export function floorNavigationChoices(floors: any, elevationById: Record<string, any> = {}) {
  const parseFloorNumber = (token: any) => {
      if (/^\d+$/.test(token)) return Number(token);
      const chineseDigits = {
        "一": 1,
        "二": 2,
        "两": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
      };
      if (token.includes("十")) {
        const [tensDigit, onesDigit] = token.split("十");
        return ((chineseDigits as any)[tensDigit] || 1) * 10 + ((chineseDigits as any)[onesDigit] || 0);
      }
      return (chineseDigits as any)[token] || 0;
    },
    entries = [...floors]
      .sort((floorA, floorB) => (Number(floorA.elevation) || 0) - (Number(floorB.elevation) || 0))
      .map((floor) => {
        const name = String(floor.name || "").trim(),
          basementMatch = name.match(
            /^(?:B|地下|负|[-−])\s*([0-9一二两三四五六七八九十]+)(?:F|楼|层)?$/i,
          ),
          levelMatch = name.match(/^([0-9一二两三四五六七八九十]+)(?:F|楼|层)$/i);
        return {
          floor: floor,
          basement: !!basementMatch || (!levelMatch && Number(floor.elevation) < 0),
          explicit: parseFloorNumber((basementMatch || levelMatch)?.[1] || ""),
        };
      });
  let basementCount = entries.filter((entry) => entry.basement).length,
    floorNumber = 0;
  return [
    ...entries
      .map(({ floor: listedFloor, basement: isBasement, explicit: explicitNumber }) => {
        const assignedNumber = isBasement ? basementCount-- : ++floorNumber,
          elevation = (elevationById as any)[listedFloor.id];
        return Number.isInteger(elevation) && elevation !== 0 && Math.abs(elevation) <= 99
          ? [
              listedFloor.id,
              elevation < 0 ? "B" + -elevation : elevation + "F",
              listedFloor.name || "未命名楼层",
            ]
          : [
              listedFloor.id,
              isBasement
                ? "B" + (explicitNumber || assignedNumber)
                : (explicitNumber || assignedNumber) + "F",
              listedFloor.name || "未命名楼层",
            ];
      })
      .reverse(),
    ...(floors.length > 1 ? [["all", "ALL", "全部楼层"]] : []),
  ];
}
