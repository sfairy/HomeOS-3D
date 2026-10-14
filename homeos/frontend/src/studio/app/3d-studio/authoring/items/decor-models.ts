import { WARM_WOOD_STYLE } from "../scene/studio-scene-style";
import { defaultViewSettings } from "../scene/studio-view-settings";
export const DECOR_THEMES = Object.freeze({
    default: Object.freeze({
      name: "默认蓝灰",
      ground: 1382690,
      base: 8226713,
      light: 12634839,
      dark: 5397873,
      accent: 10332346,
      /**
       * `leaf` = **叶子 / 草 / 绿篱**这一支队料，不是「深色家具」。
       *
       * 这里原本与 `base` **同值**（`8226713` = 导出占位蓝灰 `#7D8799`）—— 那是一个照抄
       * `base` 的遗留值，于是庭院乔木的树冠、绿篱、草坪、小盆栽的叶片全都出**蓝灰**，
       * 与「绿植 = 绿叶」的语义完全相反（暖木主题一直是 `WARM_WOOD_STYLE.leafColor`）。
       * 现在跟默认主题的语义键 `leafColor` 走，保证任何主题下 `leaf` 都是叶子色。
       */
      leaf: defaultViewSettings.leafColor,
    }),
    warm: Object.freeze({
      name: "暖阳原木",
      ground: WARM_WOOD_STYLE.ground,
      base: WARM_WOOD_STYLE.wood,
      light: WARM_WOOD_STYLE.furnitureLight,
      dark: WARM_WOOD_STYLE.furnitureDark,
      accent: WARM_WOOD_STYLE.decorAccent,
      leaf: WARM_WOOD_STYLE.leafColor,
    }),
  }),
  DECOR_MODELS = Object.freeze({
    "decor-books": {
      name: "书本组合",
      size: [0.28, 0.09, 0.21],
      roles: ["base", "light", "accent"],
      detail: "三本错落叠放 · 细薄封面与整块书页",
    },
    "decor-vase": {
      name: "陶瓷花瓶",
      size: [0.23, 0.43, 0.15],
      roles: ["accent", "light", "dark"],
      detail: "收口陶瓶与三枝花 · 疏朗花束与真实瓶口",
    },
    "decor-tea-tray": {
      name: "托盘杯子",
      size: [0.34, 0.094, 0.23],
      roles: ["base", "light", "dark"],
      detail: "圆角托盘 · 双杯与低位茶面",
    },
    "decor-tissue-box": {
      name: "纸巾盒",
      size: [0.23, 0.145, 0.13],
      roles: ["base", "light", "dark"],
      detail: "圆角盒身 · 开口顶盖与折叠纸巾",
    },
    "decor-small-plant": {
      name: "小盆栽",
      size: [0.24, 0.32, 0.22],
      roles: ["light", "leaf", "dark"],
      detail: "陶盆与七片宽叶 · 实体叶片无需透明贴图",
    },
  });

