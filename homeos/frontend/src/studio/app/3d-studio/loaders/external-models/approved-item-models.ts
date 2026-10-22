/** approved furniture/appliance GLB catalog. */
import {
  MODEL_ASSET_CACHE_KEYS,
  withModelAssetCacheKey,
} from "./_shared";
import { modelAssetUrl } from "./model-asset-folders";

type ApprovedItemMeta = {
  label: string;
  glyph: string;
  subcategory: string;
  /** [width, height, depth] meters */
  size: [number, number, number];
  small: string;
  mount?: "floor" | "ceiling" | "wall" | "tabletop";
  elevation?: number;
  /** GLB 批次版本键；缺省沿用 `MODEL_ASSET_CACHE_KEYS.approved`。 */
  assetVersion?: string;
};

/** 0.7.9 参考模型批的版本键（与 `MODEL_ASSET_CACHE_KEYS.reference` 同值）。 */
const REFERENCE_ASSET_VERSION = "20261020-reference-v1";

/** Palette + placement defaults for newly approved item types. */
const APPROVED_ITEM_META: Record<string, ApprovedItemMeta> = {
  "ceiling-fan": {
    label: "吊扇",
    glyph: "◉",
    subcategory: "environment",
    size: [1.32, 0.306, 1.32],
    small: "1.32 × 1.32m",
    mount: "ceiling",
    elevation: 2.8,
  },
  "exhaust-fan": {
    label: "排气扇",
    glyph: "◉",
    subcategory: "environment",
    // [宽, 高, 厚]：卡片小字只展示「宽 × 厚」，厚 0.16 与吸墙时的 depth 兜底一致。
    size: [0.34, 0.34, 0.16],
    small: "0.34 × 0.16m",
    mount: "wall",
    elevation: 1.83,
    assetVersion: MODEL_ASSET_CACHE_KEYS.exhaust,
  },
  "table-lamp": {
    label: "台灯",
    glyph: "⌁",
    subcategory: "environment",
    size: [0.28, 0.45, 0.28],
    small: "0.28 × 0.28m",
    mount: "tabletop",
    elevation: 0.76,
  },
  "up-down-wall-lamp": {
    label: "上下出光壁灯",
    glyph: "◒",
    subcategory: "environment",
    size: [0.12, 0.28, 0.1],
    small: "独立模型",
    mount: "wall",
    elevation: 1.6,
  },
  "smart-display": {
    label: "智慧屏",
    glyph: "▭",
    subcategory: "office",
    size: [0.55, 0.4, 0.12],
    small: "独立模型",
    mount: "tabletop",
    elevation: 0.76,
  },
  "smart-display-wall": {
    label: "智慧屏上墙",
    glyph: "▭",
    subcategory: "media",
    size: [0.7, 0.45, 0.06],
    small: "独立模型",
    mount: "wall",
    elevation: 1.4,
  },
  ps5: {
    label: "PS5",
    glyph: "▤",
    subcategory: "office",
    size: [0.26, 0.39, 0.1],
    small: "独立模型",
    mount: "floor",
  },
  "switch-console": {
    label: "Switch 游戏机",
    glyph: "▤",
    subcategory: "office",
    size: [0.24, 0.12, 0.14],
    small: "独立模型",
    mount: "tabletop",
    elevation: 0.76,
  },
  "xbox-series-x": {
    label: "Xbox Series X",
    glyph: "▤",
    subcategory: "office",
    size: [0.15, 0.3, 0.15],
    small: "独立模型",
    mount: "floor",
  },
  "arcade-machine": {
    label: "游戏街机",
    glyph: "▤",
    subcategory: "office",
    size: [0.75, 1.85, 0.8],
    small: "0.75 × 0.80m",
    mount: "floor",
  },
  "3d-printer": {
    label: "3D 打印机",
    glyph: "▤",
    subcategory: "office",
    size: [0.46, 0.5, 0.46],
    small: "0.46 × 0.46m",
    mount: "tabletop",
    elevation: 0.76,
  },
  "water-purifier": {
    label: "净水器主机",
    glyph: "▤",
    subcategory: "kitchen",
    size: [0.28, 0.45, 0.35],
    small: "独立模型",
    mount: "floor",
  },
  "disinfection-cabinet": {
    label: "消毒柜",
    glyph: "▤",
    subcategory: "kitchen",
    size: [0.5, 0.85, 0.45],
    small: "独立模型",
    mount: "floor",
  },
  "electric-valve": {
    label: "电动阀门",
    glyph: "▤",
    subcategory: "environment",
    size: [0.12, 0.12, 0.18],
    small: "独立模型",
    mount: "wall",
    elevation: 0.4,
  },
  "single-rail-rack": {
    label: "单杆晾衣架",
    glyph: "▤",
    subcategory: "dining",
    size: [1.2, 1.6, 0.35],
    small: "独立模型",
    mount: "floor",
  },
  "drying-rack": {
    label: "落地晾衣架",
    glyph: "▤",
    subcategory: "dining",
    size: [1.0, 1.5, 0.55],
    small: "独立模型",
    mount: "floor",
  },
  "home-network-cabinet": {
    label: "家用网络机柜",
    glyph: "▤",
    subcategory: "office",
    size: [0.55, 1.2, 0.46],
    small: "0.55 × 0.46m",
    mount: "floor",
  },
  "coat-rack": {
    label: "衣帽架",
    glyph: "▤",
    subcategory: "dining",
    size: [0.45, 1.75, 0.43],
    small: "0.45 × 0.43m",
    mount: "floor",
  },
  "baby-crib": {
    label: "婴儿床",
    glyph: "▤",
    subcategory: "bedroom",
    size: [0.83, 0.9, 1.43],
    small: "0.83 × 1.43m",
    mount: "floor",
  },
  "child-highchair": {
    label: "儿童餐椅",
    glyph: "▤",
    subcategory: "dining",
    size: [0.59, 0.95, 0.7],
    small: "0.59 × 0.70m",
    mount: "floor",
  },
  "rocking-horse": {
    label: "玩具木马",
    glyph: "▤",
    subcategory: "bedroom",
    size: [0.56, 0.7, 1.08],
    small: "0.56 × 1.08m",
    mount: "floor",
  },
  "rocking-chair": {
    label: "摇椅",
    glyph: "▤",
    subcategory: "living",
    size: [0.62, 1.05, 1.15],
    small: "0.62 × 1.15m",
    mount: "floor",
  },
  "cat-tree": {
    label: "猫爬架",
    glyph: "▤",
    subcategory: "living",
    size: [0.6, 1.6, 0.6],
    small: "独立模型",
    mount: "floor",
  },
  "pet-bed-bowls": {
    label: "宠物窝＋食盆",
    glyph: "▤",
    subcategory: "living",
    size: [0.7, 0.25, 0.55],
    small: "独立模型",
    mount: "floor",
  },
  "pet-dryer": {
    label: "宠物烘干机",
    glyph: "▤",
    subcategory: "environment",
    size: [0.55, 0.7, 0.55],
    small: "独立模型",
    mount: "floor",
  },
  treadmill: {
    label: "跑步机",
    glyph: "▤",
    subcategory: "environment",
    size: [0.82, 1.35, 1.78],
    small: "0.82 × 1.78m",
    mount: "floor",
  },
  elliptical: {
    label: "椭圆机",
    glyph: "▤",
    subcategory: "environment",
    size: [0.82, 1.55, 1.32],
    small: "0.82 × 1.32m",
    mount: "floor",
  },
  "dumbbell-rack": {
    label: "哑铃架＋哑铃",
    glyph: "▤",
    subcategory: "bedroom",
    size: [1.05, 0.85, 0.6],
    small: "1.05 × 0.60m",
    mount: "floor",
  },
  "yoga-set": {
    label: "瑜伽垫＋健身球",
    glyph: "▤",
    subcategory: "bedroom",
    size: [1.36, 0.35, 1.8],
    small: "1.36 × 1.80m",
    mount: "floor",
  },
  "mahjong-table": {
    label: "麻将桌",
    glyph: "▤",
    subcategory: "living",
    size: [0.94, 0.75, 0.94],
    small: "0.94 × 0.94m",
    mount: "floor",
  },
  "ping-pong-table": {
    label: "乒乓球桌",
    glyph: "▤",
    subcategory: "living",
    size: [1.68, 0.76, 2.74],
    small: "1.68 × 2.74m",
    mount: "floor",
  },
  "drum-kit": {
    label: "架子鼓",
    glyph: "▤",
    subcategory: "living",
    size: [1.83, 1.2, 1.44],
    small: "1.83 × 1.44m",
    mount: "floor",
  },
  "keyboard-stand": {
    label: "电子琴＋支架",
    glyph: "▤",
    subcategory: "living",
    size: [1.03, 0.9, 0.36],
    small: "1.03 × 0.36m",
    mount: "floor",
  },
  "guitar-stand": {
    label: "吉他＋支架",
    glyph: "▤",
    subcategory: "living",
    size: [0.46, 1.05, 0.48],
    small: "0.46 × 0.48m",
    mount: "floor",
  },
  "cello-stand": {
    label: "大提琴＋支架",
    glyph: "▤",
    subcategory: "living",
    size: [0.55, 1.25, 0.55],
    small: "0.55 × 0.55m",
    mount: "floor",
  },
  "wall-art": {
    label: "挂画",
    glyph: "▤",
    subcategory: "decor",
    size: [0.64, 0.9, 0.04],
    small: "0.64 × 0.04m",
    mount: "wall",
    elevation: 1.4,
  },
  "wall-clock": {
    label: "挂钟",
    glyph: "▤",
    subcategory: "decor",
    size: [0.36, 0.36, 0.06],
    small: "0.36 × 0.06m",
    mount: "wall",
    elevation: 1.7,
  },
  "full-length-mirror": {
    label: "穿衣镜",
    glyph: "▤",
    subcategory: "decor",
    size: [0.52, 1.65, 0.35],
    small: "0.52 × 0.35m",
    mount: "floor",
  },
  "round-rug": {
    label: "圆形地毯",
    glyph: "▤",
    subcategory: "decor",
    size: [1.6, 0.02, 1.6],
    small: "独立模型",
    mount: "floor",
  },
  "side-table": {
    label: "边几",
    glyph: "▤",
    subcategory: "living",
    size: [0.45, 0.55, 0.45],
    small: "独立模型",
    mount: "floor",
  },
  "bar-stool": {
    label: "吧台椅",
    glyph: "▤",
    subcategory: "dining",
    size: [0.4, 0.95, 0.4],
    small: "独立模型",
    mount: "floor",
  },
  "trash-bin": {
    label: "垃圾桶",
    glyph: "▤",
    subcategory: "dining",
    size: [0.32, 0.45, 0.34],
    small: "0.32 × 0.34m",
    mount: "floor",
  },
  "storage-box": {
    label: "收纳箱",
    glyph: "▤",
    subcategory: "dining",
    size: [0.5, 0.4, 0.4],
    small: "独立模型",
    mount: "floor",
  },
  "storage-cart": {
    label: "三层收纳推车",
    glyph: "▤",
    subcategory: "dining",
    size: [0.4, 0.85, 0.35],
    small: "独立模型",
    mount: "floor",
  },
  "laundry-basket": {
    label: "洗衣篮",
    glyph: "▤",
    subcategory: "dining",
    size: [0.4, 0.55, 0.4],
    small: "独立模型",
    mount: "floor",
  },
  "aroma-diffuser": {
    label: "香氛机",
    glyph: "▤",
    subcategory: "environment",
    size: [0.18, 0.22, 0.18],
    small: "独立模型",
    mount: "tabletop",
    elevation: 0.76,
  },
  "desktop-frame": {
    label: "桌面相框",
    glyph: "▤",
    subcategory: "decor",
    size: [0.22, 0.2, 0.13],
    small: "0.22 × 0.13m",
    mount: "tabletop",
    elevation: 0.76,
  },
  "easel-board": {
    label: "画架＋画板",
    glyph: "▤",
    subcategory: "bedroom",
    size: [0.75, 1.4, 0.83],
    small: "0.75 × 0.83m",
    mount: "floor",
  },
  "bicycle-rack": {
    label: "自行车＋停放架",
    glyph: "▤",
    subcategory: "living",
    size: [0.64, 1.2, 1.77],
    small: "0.64 × 1.77m",
    mount: "floor",
  },
  dartboard: {
    label: "飞镖靶",
    glyph: "▤",
    subcategory: "decor",
    size: [0.47, 0.47, 0.2],
    small: "0.47 × 0.20m",
    mount: "wall",
    elevation: 1.6,
  },

  /* ── 0.7.9 参考模型批（`20261020-reference-v1`） ─────────────────── */
  "loft-bed-circle": {
    label: "圆孔高架床",
    glyph: "▤",
    subcategory: "bedroom",
    size: [2.402, 2.022, 1.8341],
    small: "2.40 × 1.83m",
    mount: "floor",
    assetVersion: REFERENCE_ASSET_VERSION,
  },
  "entryway-niche-cabinet": {
    label: "玄关到顶柜",
    glyph: "▤",
    subcategory: "dining",
    size: [1.3, 2.6, 0.68],
    small: "1.30 × 0.68m",
    mount: "floor",
    assetVersion: REFERENCE_ASSET_VERSION,
  },
  "arched-glass-console": {
    label: "拱形玻璃玄关台",
    glyph: "▤",
    subcategory: "dining",
    size: [0.78, 2.402, 0.5957],
    small: "0.78 × 0.60m",
    mount: "floor",
    assetVersion: REFERENCE_ASSET_VERSION,
  },
  "double-open-wardrobe": {
    label: "双列开放衣柜",
    glyph: "▤",
    subcategory: "bedroom",
    size: [1.18, 2.4, 0.59],
    small: "1.18 × 0.59m",
    mount: "floor",
    assetVersion: REFERENCE_ASSET_VERSION,
  },

  /* ── 0.8.0 批（窄高置物柜） ─────────────────────────────────────── */
  "slim-recessed-cabinet": {
    label: "窄高置物柜",
    glyph: "▤",
    // 资源库里它挂在「玄关」组（`data-library-group="entry"`），筛选标签却是 dining；
    // 这个错位是 0.8.0 发布产物的真实状态，照搬，别「修正」。
    subcategory: "dining",
    size: [0.66, 2.6, 0.4],
    small: "独立模型",
    mount: "floor",
    assetVersion: MODEL_ASSET_CACHE_KEYS.slimCabinet,
  },
};

/**
 * **模型变体**：同一个物件类型按样式字段切换 GLB（不进 `APPROVED_ITEM_META`）。
 *
 * 目前只有管线机的「矩形双出水」一款：它由 `pipelineDispenserStyle === "rectangular"`
 * 选中，尺寸取自己的包围盒；原款继续用 `pipelinewaterpurifier`。
 */
const APPROVED_ITEM_VARIANTS_META: Record<string, ApprovedItemMeta> = {
  "rectangular-pipeline-dispenser": {
    label: "矩形双出水管线机",
    glyph: "▤",
    subcategory: "dining",
    size: [0.6, 0.44, 0.233],
    small: "0.60 × 0.44m",
    mount: "wall",
    assetVersion: REFERENCE_ASSET_VERSION,
  },
  /**
   * 0.8.0 柜体上下两节变体：由 `cabinetSections === "two-section"` 选中，
   * 尺寸与整门版一致（换的是门板分缝，不是外包围盒）。
   */
  "wardrobe-two-section": {
    label: "衣柜上下两节",
    glyph: "▤",
    subcategory: "bedroom",
    size: [1.8, 2.2, 0.637],
    small: "独立模型",
    mount: "floor",
    assetVersion: MODEL_ASSET_CACHE_KEYS.storageSections,
  },
  "cabinet-two-section": {
    label: "储物柜上下两节",
    glyph: "▤",
    subcategory: "dining",
    size: [1.6, 1.9, 0.45],
    small: "独立模型",
    mount: "floor",
    assetVersion: MODEL_ASSET_CACHE_KEYS.storageSections,
  },
};

function createApprovedAssetDescriptor(
  assetId: string,
  scaleBasis: [number, number, number],
  assetVersion: string = MODEL_ASSET_CACHE_KEYS.approved,
) {
  // approved 批的 URL 带版本键：GLB 定稿后按批次固定键，用于控制缓存失效。
  // 0.7.9 参考批（`20261020-reference-v1`）单独带键，旧键的缓存不会串到新字节上。
  return Object.freeze({
    url: withModelAssetCacheKey(
      modelAssetUrl(assetId, "lite"),
      assetVersion,
    ),
    fallbackUrl: withModelAssetCacheKey(
      modelAssetUrl(assetId, "full"),
      assetVersion,
    ),
    scaleBasis,
    preserveOrigin: true,
  });
}

/** Merge into EXTERNAL_ITEM_MODELS / ALL_ITEM_MODELS. */
export const APPROVED_ITEM_MODELS = Object.freeze(
  Object.fromEntries(
    Object.entries(APPROVED_ITEM_META).map(([assetId, meta]) => [
      assetId,
      createApprovedAssetDescriptor(assetId, meta.size, meta.assetVersion),
    ]),
  ),
);

/** 变体模型（样式切换用）；同样并入 `EXTERNAL_ITEM_MODELS`。 */
export const APPROVED_MODEL_VARIANTS = Object.freeze(
  Object.fromEntries(
    Object.entries(APPROVED_ITEM_VARIANTS_META).map(([assetId, meta]) => [
      assetId,
      createApprovedAssetDescriptor(assetId, meta.size, meta.assetVersion),
    ]),
  ),
);
