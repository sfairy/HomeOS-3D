/**
 * 自动生成，勿手改。生成命令：
 *   bun ops/checks/studio/repair_glb_material_slots.mjs --emit-generated
 *
 * 作用：GLB 槽位改名后，`studio-external-models.ts` 里按 `material-<n>` / 原始名取色的
 * 分支仍然要看到**旧名**。加载器在拿 `materialName` 的第一时间过一遍这张表，
 * 旧分支逻辑与视觉结果都不变；表为空时函数退化为小写归一，行为完全等价。
 */

export const LEGACY_MATERIAL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "airoutlet-grille": "M03_Pewter_Shine",
  "bar-base": "bar-material-2",
  "bar-body": "bar-material-1",
  "bar-leg": "bar-material-4",
  "bar-metal": "bar-material-5",
  "bar-top": "bar-material-0",
  "bar-trim": "bar-material-3",
  "bookcase-accent": "bookcase-material-3",
  "bookcase-accent-2": "bookcase-material-4",
  "bookcase-accent-3": "bookcase-material-5",
  "bookcase-accent-4": "bookcase-material-6",
  "bookcase-accent-5": "bookcase-material-8",
  "bookcase-base": "bookcase-material-1",
  "bookcase-body": "bookcase-material-7",
  "bookcase-book": "bookcase-material-11",
  "bookcase-book-2": "bookcase-material-12",
  "bookcase-book-3": "bookcase-material-13",
  "bookcase-book-4": "bookcase-material-14",
  "bookcase-book-5": "bookcase-material-15",
  "bookcase-book-6": "bookcase-material-16",
  "bookcase-interior": "bookcase-material-0",
  "bookcase-shelf": "bookcase-material-2",
  "bookcase-shelf-2": "bookcase-material-9",
  "bookcase-shelf-3": "bookcase-material-10",
  "cabinet-door": "cabinet-material-0",
  "cabinet-door-2": "cabinet-material-1",
  "cabinet-metal": "cabinet-material-2",
  "curtain_left-fabric": "curtain_left-material-1",
  "curtain_left-fabric-2": "curtain_left-material-2",
  "curtain_left-fabric-3": "curtain_left-material-4",
  "curtain_left-fabric-4": "curtain_left-material-5",
  "curtain_left-metal": "curtain_left-material-0",
  "curtain_left-metal-2": "curtain_left-material-3",
  "curtain_right-fabric": "curtain_right-material-1",
  "curtain_right-fabric-2": "curtain_right-material-2",
  "curtain_right-fabric-3": "curtain_right-material-4",
  "curtain_right-fabric-4": "curtain_right-material-5",
  "curtain_right-metal": "curtain_right-material-0",
  "curtain_right-metal-2": "curtain_right-material-3",
  "curtain_split-fabric": "curtain_split-material-1",
  "curtain_split-fabric-2": "curtain_split-material-2",
  "curtain_split-fabric-3": "curtain_split-material-4",
  "curtain_split-fabric-4": "curtain_split-material-5",
  "curtain_split-metal": "curtain_split-material-0",
  "curtain_split-metal-2": "curtain_split-material-3",
  "desk-frame": "desk-material-2",
  "desk-metal": "desk-material-0",
  "desk-top": "desk-material-1",
  "electric-valve-base": "valve-coupling",
  "electric-valve-metal": "valve-metal",
  "electric-valve-shell": "valve-casing",
  "electric-valve-trim": "valve-detail",
  "elevator-body": "[Color_002]",
  "elevator-body-2": "[Color_007]",
  "elevator-panel": "[Color_003]",
  "elevator-panel-2": "[Color_001]",
  "elevator-panel-3": "[Color_004]",
  "elevator-trim": "[Color_A01]",
  "floatingstairs-body": "sacfdsa004",
  "floatingstairs-glass": "sacfdsa001_1",
  "floatingstairs-glass-2": "sacfdsa001_2",
  "floatingstairs-tread": "B-1",
  "floatingstairs-trim": "sacfdsa010",
  "floor-lamp-base": "[Color_008]1",
  "floor-lamp-body": "white_ppc1",
  "floor-lamp-lit": "frosted-white",
  "floor-lamp-lit-2": "*5",
  "floor-lamp-metal": "Metal_Corrogated_Shiny",
  "floor-lamp-trim": "[<0011_Seashell>]",
  "floorlamp-base": "floorlamp-material-0",
  "floorlamp-body": "floorlamp-material-1",
  "floorlamp-lit": "floorlamp-material-2",
  "floorlamp-metal": "floorlamp-material-3",
  "floorlamp-trim": "floorlamp-material-4",
  "freezer-base": "material-2-base",
  "freezer-body": "material-0-body",
  "freezer-door": "material-1-door",
  "freezer-grating": "material-7-grating",
  "freezer-handle": "material-3-handle",
  "freezer-lit": "material-8-lit",
  "freezer-metal": "material-6-metal",
  "freezer-panel": "material-4-panel",
  "freezer-screen": "material-5-screen",
  "fridge-body": "fridge-material-0",
  "fridge-handle": "fridge-material-2",
  "fridge-panel": "fridge-material-1",
  "glasscabinet-accent": "glasscabinet-material-6",
  "glasscabinet-accent-2": "glasscabinet-material-7",
  "glasscabinet-accent-3": "glasscabinet-material-8",
  "glasscabinet-accent-4": "glasscabinet-material-9",
  "glasscabinet-body": "glasscabinet-material-10",
  "glasscabinet-door": "glasscabinet-material-1",
  "glasscabinet-door-2": "glasscabinet-material-2",
  "glasscabinet-glass": "glasscabinet-material-3",
  "glasscabinet-glass-2": "glasscabinet-material-4",
  "glasscabinet-glass-3": "glasscabinet-material-5",
  "glasscabinet-interior": "glasscabinet-material-0",
  "glasscabinet-interior-2": "glasscabinet-material-11",
  "glasscabinet-stash": "glasscabinet-material-13",
  "glasscabinet-stash-2": "glasscabinet-material-14",
  "glasscabinet-stash-3": "glasscabinet-material-15",
  "glasscabinet-stash-4": "glasscabinet-material-16",
  "glasscabinet-stash-5": "glasscabinet-material-17",
  "glasscabinet-trim": "glasscabinet-material-12",
  "glasspartition-glass": "glasspartition-material-0",
  "glasspartition-handle": "glasspartition-material-2",
  "glasspartition-metal": "glasspartition-material-1",
  "glassstairs-body": "sacfdsa004",
  "glassstairs-glass": "sacfdsa001_1",
  "glassstairs-glass-2": "sacfdsa001_2",
  "glassstairs-tread": "B-1",
  "glassstairs-trim": "sacfdsa010",
  "kitchenbase-base": "kitchenbase-material-0",
  "kitchenbase-body": "kitchenbase-material-1",
  "kitchenbase-door": "kitchenbase-material-3",
  "kitchenbase-metal": "kitchenbase-material-4",
  "kitchenbase-top": "kitchenbase-material-2",
  "kitchencooktop-base": "kitchencooktop-material-0",
  "kitchencooktop-body": "kitchencooktop-material-1",
  "kitchencooktop-cooktop": "kitchencooktop-material-3",
  "kitchencooktop-door": "kitchencooktop-material-4",
  "kitchencooktop-metal": "kitchencooktop-material-5",
  "kitchencooktop-metal-2": "kitchencooktop-material-6",
  "kitchencooktop-metal-3": "kitchencooktop-material-7",
  "kitchencooktop-top": "kitchencooktop-material-2",
  "kitchenisland-base": "material-4-base",
  "kitchenisland-body": "material-0-body",
  "kitchenisland-door": "material-2-door",
  "kitchenisland-leg": "material-5-leg",
  "kitchenisland-metal": "material-3-metal",
  "kitchenisland-top": "material-1-top",
  "kitchensink-base": "kitchensink-material-0",
  "kitchensink-body": "kitchensink-material-1",
  "kitchensink-door": "kitchensink-material-7",
  "kitchensink-metal": "kitchensink-material-5",
  "kitchensink-metal-2": "kitchensink-material-8",
  "kitchensink-sink": "kitchensink-material-3",
  "kitchensink-sink-2": "kitchensink-material-4",
  "kitchensink-top": "kitchensink-material-2",
  "nas-base": "nas-material-1",
  "nas-body": "nas-material-3",
  "nas-lit": "nas-material-4",
  "nas-panel": "nas-material-0",
  "nas-recess": "nas-material-2",
  "nightstand-base": "nightstand-material-4",
  "nightstand-body": "nightstand-material-0",
  "nightstand-drawer": "nightstand-material-3",
  "nightstand-metal": "nightstand-material-2",
  "nightstand-top": "nightstand-material-1",
  "piano-body": "*2",
  "piano-dark": "[Color_009]1",
  "piano-trim": "*1",
  "pillar_quarter-base": "material-1-base",
  "pillar_quarter-body": "material-0-body",
  "pillar_quarter-trim": "material-2-trim",
  "pillar_quarterinner-base": "material-1-base",
  "pillar_quarterinner-body": "material-0-body",
  "pillar_quarterinner-trim": "material-2-trim",
  "pillar_round-base": "material-1-base",
  "pillar_round-body": "material-0-body",
  "pillar_round-trim": "material-2-trim",
  "pillar_semicircle-base": "material-1-base",
  "pillar_semicircle-body": "material-0-body",
  "pillar_semicircle-trim": "material-2-trim",
  "pillar-body": "pillar-material-0",
  "pipelinewaterpurifier-body": "Material #1",
  "pipelinewaterpurifier-trim": "Material #2",
  "rug-fabric": "ha-rug-soft",
  "rug-frame": "ha-rug-furniture",
  "shelf-metal": "shelf-material-1",
  "shelf-shelf": "shelf-material-2",
  "shelf-top": "shelf-material-0",
  "shoecabinet-base": "shoecabinet-material-1",
  "shoecabinet-body": "shoecabinet-material-3",
  "shoecabinet-door": "shoecabinet-material-4",
  "shoecabinet-interior": "shoecabinet-material-0",
  "shoecabinet-top": "shoecabinet-material-2",
  "shower-body": "shower-material-0",
  "shower-interior": "shower-material-1",
  "shower-metal": "shower-material-2",
  "sideboard-body": "sideboard-material-2",
  "sideboard-door": "sideboard-material-3",
  "sideboard-interior": "sideboard-material-1",
  "sideboard-top": "sideboard-material-0",
  "smallcar-bodywork": "car_tms",
  "smart-display-wall-grille": "smart-display-speaker",
  "smart-display-wall-indicator": "smart-display-icon",
  "smart-display-wall-lit": "smart-display-ui",
  "smart-display-wall-screen": "smart-display-screen",
  "smart-display-wall-shell": "smart-display-body",
  "stairs-body": "stairs-material-0",
  "stairs-top": "stairs-material-1",
  "stairs-trim": "stairs-material-2",
  "steelstairs-frame": "0005",
  "steelstairs-tread": "004",
  "suv-base": "base",
  "suv-body": "body",
  "suv-emissive": "headlight",
  "suv-emissive-2": "headlight_01",
  "suv-emissive-3": "headlight_02",
  "suv-glass": "glass_01",
  "suv-glass-2": "glass_02",
  "suv-glass-3": "glass_back",
  "suv-glass-4": "glass",
  "suv-seat": "salon",
  "suv-trim": "gray",
  "tea_bar_machine-body": "om.cn_1336",
  "tea_bar_machine-panel": "om.cn_1342",
  "tv_mobile-base": "tv_mobile-material-1",
  "tv_mobile-body": "tv_mobile-material-3",
  "tv_mobile-leg": "tv_mobile-material-0",
  "tv_mobile-metal": "tv_mobile-material-2",
  "tv_mobile-screen": "tv_mobile-material-5",
  "tv_mobile-trim": "tv_mobile-material-4",
  "tv_standard-screen": "tv_standard-material-0",
  "tv_tabletop-base": "tv_tabletop-material-0",
  "tv_tabletop-body": "tv_tabletop-material-2",
  "tv_tabletop-metal": "tv_tabletop-material-1",
  "tv_tabletop-trim": "tv_tabletop-material-3",
  "wallac-body": "wallac-material-0",
  "wallac-grating": "wallac-material-1",
  "wallac-lit": "wallac-material-2",
  "wallcabinet-base": "wallcabinet-material-0",
  "wallcabinet-body": "wallcabinet-material-1",
  "wallcabinet-door": "wallcabinet-material-3",
  "wallcabinet-shelf": "wallcabinet-material-2"
});

export const LEGACY_MATERIAL_ALIASES_BY_ITEM: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(
{
  "airoutlet": {
    "airoutlet-grille": "M03_Pewter_Shine"
  },
  "bar": {
    "bar-base": "bar-material-2",
    "bar-body": "bar-material-1",
    "bar-leg": "bar-material-4",
    "bar-metal": "bar-material-5",
    "bar-top": "bar-material-0",
    "bar-trim": "bar-material-3"
  },
  "bookcase": {
    "bookcase-accent": "bookcase-material-3",
    "bookcase-accent-2": "bookcase-material-4",
    "bookcase-accent-3": "bookcase-material-5",
    "bookcase-accent-4": "bookcase-material-6",
    "bookcase-accent-5": "bookcase-material-8",
    "bookcase-base": "bookcase-material-1",
    "bookcase-body": "bookcase-material-7",
    "bookcase-book": "bookcase-material-11",
    "bookcase-book-2": "bookcase-material-12",
    "bookcase-book-3": "bookcase-material-13",
    "bookcase-book-4": "bookcase-material-14",
    "bookcase-book-5": "bookcase-material-15",
    "bookcase-book-6": "bookcase-material-16",
    "bookcase-interior": "bookcase-material-0",
    "bookcase-shelf": "bookcase-material-2",
    "bookcase-shelf-2": "bookcase-material-9",
    "bookcase-shelf-3": "bookcase-material-10"
  },
  "cabinet": {
    "cabinet-door": "cabinet-material-0",
    "cabinet-door-2": "cabinet-material-1",
    "cabinet-metal": "cabinet-material-2"
  },
  "curtain_left": {
    "curtain_left-fabric": "curtain_left-material-1",
    "curtain_left-fabric-2": "curtain_left-material-2",
    "curtain_left-fabric-3": "curtain_left-material-4",
    "curtain_left-fabric-4": "curtain_left-material-5",
    "curtain_left-metal": "curtain_left-material-0",
    "curtain_left-metal-2": "curtain_left-material-3"
  },
  "curtain_right": {
    "curtain_right-fabric": "curtain_right-material-1",
    "curtain_right-fabric-2": "curtain_right-material-2",
    "curtain_right-fabric-3": "curtain_right-material-4",
    "curtain_right-fabric-4": "curtain_right-material-5",
    "curtain_right-metal": "curtain_right-material-0",
    "curtain_right-metal-2": "curtain_right-material-3"
  },
  "curtain_split": {
    "curtain_split-fabric": "curtain_split-material-1",
    "curtain_split-fabric-2": "curtain_split-material-2",
    "curtain_split-fabric-3": "curtain_split-material-4",
    "curtain_split-fabric-4": "curtain_split-material-5",
    "curtain_split-metal": "curtain_split-material-0",
    "curtain_split-metal-2": "curtain_split-material-3"
  },
  "desk": {
    "desk-frame": "desk-material-2",
    "desk-metal": "desk-material-0",
    "desk-top": "desk-material-1"
  },
  "electric-valve": {
    "electric-valve-base": "valve-coupling",
    "electric-valve-metal": "valve-metal",
    "electric-valve-shell": "valve-casing",
    "electric-valve-trim": "valve-detail"
  },
  "elevator": {
    "elevator-body": "[Color_002]",
    "elevator-body-2": "[Color_007]",
    "elevator-panel": "[Color_003]",
    "elevator-panel-2": "[Color_001]",
    "elevator-panel-3": "[Color_004]",
    "elevator-trim": "[Color_A01]"
  },
  "floatingstairs": {
    "floatingstairs-body": "sacfdsa004",
    "floatingstairs-glass": "sacfdsa001_1",
    "floatingstairs-glass-2": "sacfdsa001_2",
    "floatingstairs-tread": "B-1",
    "floatingstairs-trim": "sacfdsa010"
  },
  "floor-lamp": {
    "floor-lamp-base": "[Color_008]1",
    "floor-lamp-body": "white_ppc1",
    "floor-lamp-lit": "frosted-white",
    "floor-lamp-lit-2": "*5",
    "floor-lamp-metal": "Metal_Corrogated_Shiny",
    "floor-lamp-trim": "[<0011_Seashell>]"
  },
  "floorlamp": {
    "floorlamp-base": "floorlamp-material-0",
    "floorlamp-body": "floorlamp-material-1",
    "floorlamp-lit": "floorlamp-material-2",
    "floorlamp-metal": "floorlamp-material-3",
    "floorlamp-trim": "floorlamp-material-4"
  },
  "freezer": {
    "freezer-base": "material-2-base",
    "freezer-body": "material-0-body",
    "freezer-door": "material-1-door",
    "freezer-grating": "material-7-grating",
    "freezer-handle": "material-3-handle",
    "freezer-lit": "material-8-lit",
    "freezer-metal": "material-6-metal",
    "freezer-panel": "material-4-panel",
    "freezer-screen": "material-5-screen"
  },
  "fridge": {
    "fridge-body": "fridge-material-0",
    "fridge-handle": "fridge-material-2",
    "fridge-panel": "fridge-material-1"
  },
  "glasscabinet": {
    "glasscabinet-accent": "glasscabinet-material-6",
    "glasscabinet-accent-2": "glasscabinet-material-7",
    "glasscabinet-accent-3": "glasscabinet-material-8",
    "glasscabinet-accent-4": "glasscabinet-material-9",
    "glasscabinet-body": "glasscabinet-material-10",
    "glasscabinet-door": "glasscabinet-material-1",
    "glasscabinet-door-2": "glasscabinet-material-2",
    "glasscabinet-glass": "glasscabinet-material-3",
    "glasscabinet-glass-2": "glasscabinet-material-4",
    "glasscabinet-glass-3": "glasscabinet-material-5",
    "glasscabinet-interior": "glasscabinet-material-0",
    "glasscabinet-interior-2": "glasscabinet-material-11",
    "glasscabinet-stash": "glasscabinet-material-13",
    "glasscabinet-stash-2": "glasscabinet-material-14",
    "glasscabinet-stash-3": "glasscabinet-material-15",
    "glasscabinet-stash-4": "glasscabinet-material-16",
    "glasscabinet-stash-5": "glasscabinet-material-17",
    "glasscabinet-trim": "glasscabinet-material-12"
  },
  "glasspartition": {
    "glasspartition-glass": "glasspartition-material-0",
    "glasspartition-handle": "glasspartition-material-2",
    "glasspartition-metal": "glasspartition-material-1"
  },
  "glassstairs": {
    "glassstairs-body": "sacfdsa004",
    "glassstairs-glass": "sacfdsa001_1",
    "glassstairs-glass-2": "sacfdsa001_2",
    "glassstairs-tread": "B-1",
    "glassstairs-trim": "sacfdsa010"
  },
  "kitchenbase": {
    "kitchenbase-base": "kitchenbase-material-0",
    "kitchenbase-body": "kitchenbase-material-1",
    "kitchenbase-door": "kitchenbase-material-3",
    "kitchenbase-metal": "kitchenbase-material-4",
    "kitchenbase-top": "kitchenbase-material-2"
  },
  "kitchencooktop": {
    "kitchencooktop-base": "kitchencooktop-material-0",
    "kitchencooktop-body": "kitchencooktop-material-1",
    "kitchencooktop-cooktop": "kitchencooktop-material-3",
    "kitchencooktop-door": "kitchencooktop-material-4",
    "kitchencooktop-metal": "kitchencooktop-material-5",
    "kitchencooktop-metal-2": "kitchencooktop-material-6",
    "kitchencooktop-metal-3": "kitchencooktop-material-7",
    "kitchencooktop-top": "kitchencooktop-material-2"
  },
  "kitchenisland": {
    "kitchenisland-base": "material-4-base",
    "kitchenisland-body": "material-0-body",
    "kitchenisland-door": "material-2-door",
    "kitchenisland-leg": "material-5-leg",
    "kitchenisland-metal": "material-3-metal",
    "kitchenisland-top": "material-1-top"
  },
  "kitchensink": {
    "kitchensink-base": "kitchensink-material-0",
    "kitchensink-body": "kitchensink-material-1",
    "kitchensink-door": "kitchensink-material-7",
    "kitchensink-metal": "kitchensink-material-5",
    "kitchensink-metal-2": "kitchensink-material-8",
    "kitchensink-sink": "kitchensink-material-3",
    "kitchensink-sink-2": "kitchensink-material-4",
    "kitchensink-top": "kitchensink-material-2"
  },
  "nas": {
    "nas-base": "nas-material-1",
    "nas-body": "nas-material-3",
    "nas-lit": "nas-material-4",
    "nas-panel": "nas-material-0",
    "nas-recess": "nas-material-2"
  },
  "nightstand": {
    "nightstand-base": "nightstand-material-4",
    "nightstand-body": "nightstand-material-0",
    "nightstand-drawer": "nightstand-material-3",
    "nightstand-metal": "nightstand-material-2",
    "nightstand-top": "nightstand-material-1"
  },
  "piano": {
    "piano-body": "*2",
    "piano-dark": "[Color_009]1",
    "piano-trim": "*1"
  },
  "pillar": {
    "pillar-body": "pillar-material-0"
  },
  "pillar_quarter": {
    "pillar_quarter-base": "material-1-base",
    "pillar_quarter-body": "material-0-body",
    "pillar_quarter-trim": "material-2-trim"
  },
  "pillar_quarterinner": {
    "pillar_quarterinner-base": "material-1-base",
    "pillar_quarterinner-body": "material-0-body",
    "pillar_quarterinner-trim": "material-2-trim"
  },
  "pillar_round": {
    "pillar_round-base": "material-1-base",
    "pillar_round-body": "material-0-body",
    "pillar_round-trim": "material-2-trim"
  },
  "pillar_semicircle": {
    "pillar_semicircle-base": "material-1-base",
    "pillar_semicircle-body": "material-0-body",
    "pillar_semicircle-trim": "material-2-trim"
  },
  "pipelinewaterpurifier": {
    "pipelinewaterpurifier-body": "Material #1",
    "pipelinewaterpurifier-trim": "Material #2"
  },
  "rug": {
    "rug-fabric": "ha-rug-soft",
    "rug-frame": "ha-rug-furniture"
  },
  "shelf": {
    "shelf-metal": "shelf-material-1",
    "shelf-shelf": "shelf-material-2",
    "shelf-top": "shelf-material-0"
  },
  "shoecabinet": {
    "shoecabinet-base": "shoecabinet-material-1",
    "shoecabinet-body": "shoecabinet-material-3",
    "shoecabinet-door": "shoecabinet-material-4",
    "shoecabinet-interior": "shoecabinet-material-0",
    "shoecabinet-top": "shoecabinet-material-2"
  },
  "shower": {
    "shower-body": "shower-material-0",
    "shower-interior": "shower-material-1",
    "shower-metal": "shower-material-2"
  },
  "sideboard": {
    "sideboard-body": "sideboard-material-2",
    "sideboard-door": "sideboard-material-3",
    "sideboard-interior": "sideboard-material-1",
    "sideboard-top": "sideboard-material-0"
  },
  "smallcar": {
    "smallcar-bodywork": "car_tms"
  },
  "smart-display-wall": {
    "smart-display-wall-grille": "smart-display-speaker",
    "smart-display-wall-indicator": "smart-display-icon",
    "smart-display-wall-lit": "smart-display-ui",
    "smart-display-wall-screen": "smart-display-screen",
    "smart-display-wall-shell": "smart-display-body"
  },
  "stairs": {
    "stairs-body": "stairs-material-0",
    "stairs-top": "stairs-material-1",
    "stairs-trim": "stairs-material-2"
  },
  "steelstairs": {
    "steelstairs-frame": "0005",
    "steelstairs-tread": "004"
  },
  "suv": {
    "suv-base": "base",
    "suv-body": "body",
    "suv-emissive": "headlight",
    "suv-emissive-2": "headlight_01",
    "suv-emissive-3": "headlight_02",
    "suv-glass": "glass_01",
    "suv-glass-2": "glass_02",
    "suv-glass-3": "glass_back",
    "suv-glass-4": "glass",
    "suv-seat": "salon",
    "suv-trim": "gray"
  },
  "tea_bar_machine": {
    "tea_bar_machine-body": "om.cn_1336",
    "tea_bar_machine-panel": "om.cn_1342"
  },
  "tv_mobile": {
    "tv_mobile-base": "tv_mobile-material-1",
    "tv_mobile-body": "tv_mobile-material-3",
    "tv_mobile-leg": "tv_mobile-material-0",
    "tv_mobile-metal": "tv_mobile-material-2",
    "tv_mobile-screen": "tv_mobile-material-5",
    "tv_mobile-trim": "tv_mobile-material-4"
  },
  "tv_standard": {
    "tv_standard-screen": "tv_standard-material-0"
  },
  "tv_tabletop": {
    "tv_tabletop-base": "tv_tabletop-material-0",
    "tv_tabletop-body": "tv_tabletop-material-2",
    "tv_tabletop-metal": "tv_tabletop-material-1",
    "tv_tabletop-trim": "tv_tabletop-material-3"
  },
  "wallac": {
    "wallac-body": "wallac-material-0",
    "wallac-grating": "wallac-material-1",
    "wallac-lit": "wallac-material-2"
  },
  "wallcabinet": {
    "wallcabinet-base": "wallcabinet-material-0",
    "wallcabinet-body": "wallcabinet-material-1",
    "wallcabinet-door": "wallcabinet-material-3",
    "wallcabinet-shelf": "wallcabinet-material-2"
  }
}
);
