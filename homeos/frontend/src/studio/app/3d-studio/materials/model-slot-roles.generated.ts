/**
 * 自动生成，勿手改。生成命令：
 *   bun ops/checks/studio/repair_glb_material_slots.mjs --emit-generated
 *
 * 槽位改名后，原本靠 `MODEL_SLOT_ROLES[itemType][slotIndex]` 顺序表解析角色的模型，
 * 名字里已经没有 `material-<n>`；这里把「新 token → 角色」登记进语义表，
 * 让解析从「按顺序猜」变成「按名字定」，重出模型时顺序变化也不会错色。
 */
export const GENERATED_MODEL_SLOT_ROLES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(
{
  "airoutlet": {
    "grille": "grille"
  },
  "bar": {
    "base": "base",
    "body": "body",
    "leg": "leg",
    "metal": "metal",
    "top": "top",
    "trim": "trim"
  },
  "bookcase": {
    "accent": "accent",
    "base": "base",
    "body": "body",
    "book": "book",
    "interior": "interior",
    "shelf": "shelf"
  },
  "cabinet": {
    "door": "door",
    "metal": "metal"
  },
  "smallcar": {
    "bodywork": "bodywork"
  },
  "curtain_left": {
    "fabric": "fabric",
    "metal": "metal"
  },
  "curtain_right": {
    "fabric": "fabric",
    "metal": "metal"
  },
  "curtain_split": {
    "fabric": "fabric",
    "metal": "metal"
  },
  "desk": {
    "frame": "frame",
    "metal": "metal",
    "top": "top"
  },
  "electric-valve": {
    "base": "base",
    "metal": "metal",
    "shell": "shell",
    "trim": "trim"
  },
  "elevator": {
    "body": "body",
    "panel": "panel",
    "trim": "trim"
  },
  "floatingstairs": {
    "body": "body",
    "glass": "glass",
    "tread": "tread",
    "trim": "trim"
  },
  "floor-lamp": {
    "base": "base",
    "body": "body",
    "lit": "lit",
    "metal": "metal",
    "trim": "trim"
  },
  "floorlamp": {
    "base": "base",
    "body": "body",
    "lit": "lit",
    "metal": "metal",
    "trim": "trim"
  },
  "freezer": {
    "base": "base",
    "body": "body",
    "door": "door",
    "grating": "grating",
    "handle": "handle",
    "lit": "lit",
    "metal": "metal",
    "panel": "panel",
    "screen": "screen"
  },
  "fridge": {
    "body": "body",
    "handle": "handle",
    "panel": "panel"
  },
  "glassstairs": {
    "body": "body",
    "glass": "glass",
    "tread": "tread",
    "trim": "trim"
  },
  "glasscabinet": {
    "accent": "accent",
    "body": "body",
    "door": "door",
    "glass": "glass",
    "interior": "interior",
    "stash": "stash",
    "trim": "trim"
  },
  "glasspartition": {
    "glass": "glass",
    "handle": "handle",
    "metal": "metal"
  },
  "kitchenbase": {
    "base": "base",
    "body": "body",
    "door": "door",
    "metal": "metal",
    "top": "top"
  },
  "kitchencooktop": {
    "base": "base",
    "body": "body",
    "cooktop": "cooktop",
    "door": "door",
    "metal": "metal",
    "top": "top"
  },
  "kitchenisland": {
    "base": "base",
    "body": "body",
    "door": "door",
    "leg": "leg",
    "metal": "metal",
    "top": "top"
  },
  "kitchensink": {
    "base": "base",
    "body": "body",
    "door": "door",
    "metal": "metal",
    "sink": "sink",
    "top": "top"
  },
  "nas": {
    "base": "base",
    "body": "body",
    "lit": "lit",
    "panel": "panel",
    "recess": "recess"
  },
  "nightstand": {
    "base": "base",
    "body": "body",
    "drawer": "drawer",
    "metal": "metal",
    "top": "top"
  },
  "piano": {
    "body": "body",
    "dark": "dark",
    "trim": "trim"
  },
  "pillar": {
    "body": "body"
  },
  "pillar_quarter": {
    "base": "base",
    "body": "body",
    "trim": "trim"
  },
  "pillar_quarterinner": {
    "base": "base",
    "body": "body",
    "trim": "trim"
  },
  "pillar_round": {
    "base": "base",
    "body": "body",
    "trim": "trim"
  },
  "pillar_semicircle": {
    "base": "base",
    "body": "body",
    "trim": "trim"
  },
  "pipelinewaterpurifier": {
    "body": "body",
    "trim": "trim"
  },
  "rug": {
    "fabric": "fabric",
    "frame": "frame"
  },
  "shelf": {
    "metal": "metal",
    "shelf": "shelf",
    "top": "top"
  },
  "shoecabinet": {
    "base": "base",
    "body": "body",
    "door": "door",
    "interior": "interior",
    "top": "top"
  },
  "shower": {
    "body": "body",
    "interior": "interior",
    "metal": "metal"
  },
  "sideboard": {
    "body": "body",
    "door": "door",
    "interior": "interior",
    "top": "top"
  },
  "smart-display-wall": {
    "grille": "grille",
    "indicator": "indicator",
    "lit": "lit",
    "screen": "screen",
    "shell": "shell"
  },
  "stairs": {
    "body": "body",
    "top": "top",
    "trim": "trim"
  },
  "steelstairs": {
    "frame": "frame",
    "tread": "tread"
  },
  "suv": {
    "base": "base",
    "body": "body",
    "emissive": "emissive",
    "glass": "glass",
    "seat": "seat",
    "trim": "trim"
  },
  "tea_bar_machine": {
    "body": "body",
    "panel": "panel"
  },
  "tv_mobile": {
    "base": "base",
    "body": "body",
    "leg": "leg",
    "metal": "metal",
    "screen": "screen",
    "trim": "trim"
  },
  "tv_standard": {
    "screen": "screen"
  },
  "tv_tabletop": {
    "base": "base",
    "body": "body",
    "metal": "metal",
    "trim": "trim"
  },
  "wallac": {
    "body": "body",
    "grating": "grating",
    "lit": "lit"
  },
  "wallcabinet": {
    "base": "base",
    "body": "body",
    "door": "door",
    "shelf": "shelf"
  }
}
);

/**
 * 完整材质名 → 角色（改名后的新名）。优先级高于 token 推断：
 * `shower-body` 的 token `body` 在 ceramic 家族里会被读成「陶瓷本体」，
 * 而该槽位的契约角色是金属淋浴房本体，只能按完整名锁定。
 */
export const GENERATED_MATERIAL_ROLE_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(
{
  "airoutlet": {
    "airoutlet-grille": "grille",
    "m03_pewter_shine": "grille"
  },
  "ball-pit": {
    "ball-pit-candidate-soft": "body",
    "ball-pit-candidate-light": "playBall",
    "ball-pit-candidate-body": "playBall",
    "ball-pit-candidate-accent": "accent"
  },
  "bar": {
    "bar-top": "top",
    "bar-material-0": "top",
    "bar-body": "body",
    "bar-material-1": "body",
    "bar-base": "base",
    "bar-material-2": "base",
    "bar-trim": "trim",
    "bar-material-3": "trim",
    "bar-leg": "leg",
    "bar-material-4": "leg",
    "bar-metal": "metal",
    "bar-material-5": "metal"
  },
  "bed-tray": {
    "bed-tray-candidate-body": "board",
    "bed-tray-candidate-light": "handle"
  },
  "bookcase": {
    "bookcase-interior": "interior",
    "bookcase-material-0": "interior",
    "bookcase-base": "base",
    "bookcase-material-1": "base",
    "bookcase-shelf": "shelf",
    "bookcase-material-2": "shelf",
    "bookcase-accent": "accent",
    "bookcase-material-3": "accent",
    "bookcase-accent-2": "accent",
    "bookcase-material-4": "accent",
    "bookcase-accent-3": "accent",
    "bookcase-material-5": "accent",
    "bookcase-accent-4": "accent",
    "bookcase-material-6": "accent",
    "bookcase-body": "body",
    "bookcase-material-7": "body",
    "bookcase-accent-5": "accent",
    "bookcase-material-8": "accent",
    "bookcase-shelf-2": "shelf",
    "bookcase-material-9": "shelf",
    "bookcase-shelf-3": "shelf",
    "bookcase-material-10": "shelf",
    "bookcase-book": "book",
    "bookcase-material-11": "book",
    "bookcase-book-2": "book",
    "bookcase-material-12": "book",
    "bookcase-book-3": "book",
    "bookcase-material-13": "book",
    "bookcase-book-4": "book",
    "bookcase-material-14": "book",
    "bookcase-book-5": "book",
    "bookcase-material-15": "book",
    "bookcase-book-6": "book",
    "bookcase-material-16": "book"
  },
  "cabinet": {
    "cabinet-door": "door",
    "cabinet-material-0": "door",
    "cabinet-door-2": "door",
    "cabinet-material-1": "door",
    "cabinet-metal": "metal",
    "cabinet-material-2": "metal"
  },
  "smallcar": {
    "smallcar-bodywork": "bodywork",
    "car_tms": "bodywork"
  },
  "curtain_left": {
    "curtain_left-metal": "metal",
    "curtain_left-material-0": "metal",
    "curtain_left-fabric": "fabric",
    "curtain_left-material-1": "fabric",
    "curtain_left-fabric-2": "fabric",
    "curtain_left-material-2": "fabric",
    "curtain_left-metal-2": "metal",
    "curtain_left-material-3": "metal",
    "curtain_left-fabric-3": "fabric",
    "curtain_left-material-4": "fabric",
    "curtain_left-fabric-4": "fabric",
    "curtain_left-material-5": "fabric"
  },
  "curtain_right": {
    "curtain_right-metal": "metal",
    "curtain_right-material-0": "metal",
    "curtain_right-fabric": "fabric",
    "curtain_right-material-1": "fabric",
    "curtain_right-fabric-2": "fabric",
    "curtain_right-material-2": "fabric",
    "curtain_right-metal-2": "metal",
    "curtain_right-material-3": "metal",
    "curtain_right-fabric-3": "fabric",
    "curtain_right-material-4": "fabric",
    "curtain_right-fabric-4": "fabric",
    "curtain_right-material-5": "fabric"
  },
  "curtain_split": {
    "curtain_split-metal": "metal",
    "curtain_split-material-0": "metal",
    "curtain_split-fabric": "fabric",
    "curtain_split-material-1": "fabric",
    "curtain_split-fabric-2": "fabric",
    "curtain_split-material-2": "fabric",
    "curtain_split-metal-2": "metal",
    "curtain_split-material-3": "metal",
    "curtain_split-fabric-3": "fabric",
    "curtain_split-material-4": "fabric",
    "curtain_split-fabric-4": "fabric",
    "curtain_split-material-5": "fabric"
  },
  "decorative-plate": {
    "decorative-plate-candidate-light": "plate",
    "decorative-plate-candidate-accent": "trim",
    "decorative-plate-candidate-body": "accent",
    "decorative-plate-candidate-dark": "base"
  },
  "desk": {
    "desk-metal": "metal",
    "desk-material-0": "metal",
    "desk-top": "top",
    "desk-material-1": "top",
    "desk-frame": "frame",
    "desk-material-2": "frame"
  },
  "electric-valve": {
    "electric-valve-metal": "metal",
    "valve-metal": "metal",
    "electric-valve-base": "base",
    "valve-coupling": "base",
    "electric-valve-shell": "shell",
    "valve-casing": "shell",
    "electric-valve-trim": "trim",
    "valve-detail": "trim"
  },
  "elevator": {
    "elevator-panel": "panel",
    "[color_003]": "panel",
    "elevator-body": "body",
    "[color_002]": "body",
    "elevator-trim": "trim",
    "[color_a01]": "trim",
    "elevator-panel-2": "panel",
    "[color_001]": "panel",
    "elevator-panel-3": "panel",
    "[color_004]": "panel",
    "elevator-body-2": "body",
    "[color_007]": "body"
  },
  "floatingstairs": {
    "floatingstairs-body": "body",
    "sacfdsa004": "body",
    "floatingstairs-tread": "tread",
    "b-1": "tread",
    "floatingstairs-trim": "trim",
    "sacfdsa010": "trim",
    "floatingstairs-glass": "glass",
    "sacfdsa001_1": "glass",
    "floatingstairs-glass-2": "glass",
    "sacfdsa001_2": "glass"
  },
  "floor-lamp": {
    "floor-lamp-lit": "lit",
    "frosted-white": "lit",
    "floor-lamp-metal": "metal",
    "metal_corrogated_shiny": "metal",
    "floor-lamp-body": "body",
    "white_ppc1": "body",
    "floor-lamp-trim": "trim",
    "[<0011_seashell>]": "trim",
    "floor-lamp-lit-2": "lit",
    "*5": "lit",
    "floor-lamp-base": "base",
    "[color_008]1": "base"
  },
  "floorlamp": {
    "floorlamp-base": "base",
    "floorlamp-material-0": "base",
    "floorlamp-body": "body",
    "floorlamp-material-1": "body",
    "floorlamp-lit": "lit",
    "floorlamp-material-2": "lit",
    "floorlamp-metal": "metal",
    "floorlamp-material-3": "metal",
    "floorlamp-trim": "trim",
    "floorlamp-material-4": "trim"
  },
  "freezer": {
    "freezer-body": "body",
    "material-0-body": "body",
    "freezer-door": "door",
    "material-1-door": "door",
    "freezer-base": "base",
    "material-2-base": "base",
    "freezer-handle": "handle",
    "material-3-handle": "handle",
    "freezer-panel": "panel",
    "material-4-panel": "panel",
    "freezer-screen": "screen",
    "material-5-screen": "screen",
    "freezer-metal": "metal",
    "material-6-metal": "metal",
    "freezer-grating": "grating",
    "material-7-grating": "grating",
    "freezer-lit": "lit",
    "material-8-lit": "lit"
  },
  "fridge": {
    "fridge-body": "body",
    "fridge-material-0": "body",
    "fridge-panel": "panel",
    "fridge-material-1": "panel",
    "fridge-handle": "handle",
    "fridge-material-2": "handle"
  },
  "glassstairs": {
    "glassstairs-glass": "glass",
    "sacfdsa001_1": "glass",
    "glassstairs-glass-2": "glass",
    "sacfdsa001_2": "glass",
    "glassstairs-trim": "trim",
    "sacfdsa010": "trim",
    "glassstairs-body": "body",
    "sacfdsa004": "body",
    "glassstairs-tread": "tread",
    "b-1": "tread"
  },
  "glasscabinet": {
    "glasscabinet-interior": "interior",
    "glasscabinet-material-0": "interior",
    "glasscabinet-door": "door",
    "glasscabinet-material-1": "door",
    "glasscabinet-door-2": "door",
    "glasscabinet-material-2": "door",
    "glasscabinet-glass": "glass",
    "glasscabinet-material-3": "glass",
    "glasscabinet-glass-2": "glass",
    "glasscabinet-material-4": "glass",
    "glasscabinet-glass-3": "glass",
    "glasscabinet-material-5": "glass",
    "glasscabinet-accent": "accent",
    "glasscabinet-material-6": "accent",
    "glasscabinet-accent-2": "accent",
    "glasscabinet-material-7": "accent",
    "glasscabinet-accent-3": "accent",
    "glasscabinet-material-8": "accent",
    "glasscabinet-accent-4": "accent",
    "glasscabinet-material-9": "accent",
    "glasscabinet-body": "body",
    "glasscabinet-material-10": "body",
    "glasscabinet-interior-2": "interior",
    "glasscabinet-material-11": "interior",
    "glasscabinet-trim": "trim",
    "glasscabinet-material-12": "trim",
    "glasscabinet-stash": "stash",
    "glasscabinet-material-13": "stash",
    "glasscabinet-stash-2": "stash",
    "glasscabinet-material-14": "stash",
    "glasscabinet-stash-3": "stash",
    "glasscabinet-material-15": "stash",
    "glasscabinet-stash-4": "stash",
    "glasscabinet-material-16": "stash",
    "glasscabinet-stash-5": "stash",
    "glasscabinet-material-17": "stash"
  },
  "glasspartition": {
    "glasspartition-glass": "glass",
    "glasspartition-material-0": "glass",
    "glasspartition-metal": "metal",
    "glasspartition-material-1": "metal",
    "glasspartition-handle": "handle",
    "glasspartition-material-2": "handle"
  },
  "kitchenbase": {
    "kitchenbase-base": "base",
    "kitchenbase-material-0": "base",
    "kitchenbase-body": "body",
    "kitchenbase-material-1": "body",
    "kitchenbase-top": "top",
    "kitchenbase-material-2": "top",
    "kitchenbase-door": "door",
    "kitchenbase-material-3": "door",
    "kitchenbase-metal": "metal",
    "kitchenbase-material-4": "metal"
  },
  "kitchencooktop": {
    "kitchencooktop-base": "base",
    "kitchencooktop-material-0": "base",
    "kitchencooktop-body": "body",
    "kitchencooktop-material-1": "body",
    "kitchencooktop-top": "top",
    "kitchencooktop-material-2": "top",
    "kitchencooktop-cooktop": "cooktop",
    "kitchencooktop-material-3": "cooktop",
    "kitchencooktop-door": "door",
    "kitchencooktop-material-4": "door",
    "kitchencooktop-metal": "metal",
    "kitchencooktop-material-5": "metal",
    "kitchencooktop-metal-2": "metal",
    "kitchencooktop-material-6": "metal",
    "kitchencooktop-metal-3": "metal",
    "kitchencooktop-material-7": "metal"
  },
  "kitchenisland": {
    "kitchenisland-body": "body",
    "material-0-body": "body",
    "kitchenisland-top": "top",
    "material-1-top": "top",
    "kitchenisland-door": "door",
    "material-2-door": "door",
    "kitchenisland-metal": "metal",
    "material-3-metal": "metal",
    "kitchenisland-base": "base",
    "material-4-base": "base",
    "kitchenisland-leg": "leg",
    "material-5-leg": "leg"
  },
  "kitchensink": {
    "kitchensink-base": "base",
    "kitchensink-material-0": "base",
    "kitchensink-body": "body",
    "kitchensink-material-1": "body",
    "kitchensink-top": "top",
    "kitchensink-material-2": "top",
    "kitchensink-sink": "sink",
    "kitchensink-material-3": "sink",
    "kitchensink-sink-2": "sink",
    "kitchensink-material-4": "sink",
    "kitchensink-metal": "metal",
    "kitchensink-material-5": "metal",
    "kitchensink-door": "door",
    "kitchensink-material-7": "door",
    "kitchensink-metal-2": "metal",
    "kitchensink-material-8": "metal"
  },
  "nas": {
    "nas-panel": "panel",
    "nas-material-0": "panel",
    "nas-base": "base",
    "nas-material-1": "base",
    "nas-recess": "recess",
    "nas-material-2": "recess",
    "nas-body": "body",
    "nas-material-3": "body",
    "nas-lit": "lit",
    "nas-material-4": "lit"
  },
  "nightstand": {
    "nightstand-body": "body",
    "nightstand-material-0": "body",
    "nightstand-top": "top",
    "nightstand-material-1": "top",
    "nightstand-metal": "metal",
    "nightstand-material-2": "metal",
    "nightstand-drawer": "drawer",
    "nightstand-material-3": "drawer",
    "nightstand-base": "base",
    "nightstand-material-4": "base"
  },
  "piano": {
    "piano-body": "body",
    "*2": "body",
    "piano-dark": "dark",
    "[color_009]1": "dark",
    "piano-trim": "trim",
    "*1": "trim"
  },
  "pillar": {
    "pillar-body": "body",
    "pillar-material-0": "body"
  },
  "pillar_quarter": {
    "pillar_quarter-body": "body",
    "material-0-body": "body",
    "pillar_quarter-base": "base",
    "material-1-base": "base",
    "pillar_quarter-trim": "trim",
    "material-2-trim": "trim"
  },
  "pillar_quarterinner": {
    "pillar_quarterinner-body": "body",
    "material-0-body": "body",
    "pillar_quarterinner-base": "base",
    "material-1-base": "base",
    "pillar_quarterinner-trim": "trim",
    "material-2-trim": "trim"
  },
  "pillar_round": {
    "pillar_round-body": "body",
    "material-0-body": "body",
    "pillar_round-base": "base",
    "material-1-base": "base",
    "pillar_round-trim": "trim",
    "material-2-trim": "trim"
  },
  "pillar_semicircle": {
    "pillar_semicircle-body": "body",
    "material-0-body": "body",
    "pillar_semicircle-base": "base",
    "material-1-base": "base",
    "pillar_semicircle-trim": "trim",
    "material-2-trim": "trim"
  },
  "pipelinewaterpurifier": {
    "pipelinewaterpurifier-body": "body",
    "material #1": "body",
    "pipelinewaterpurifier-trim": "trim",
    "material #2": "trim"
  },
  "rug": {
    "rug-frame": "frame",
    "ha-rug-furniture": "frame",
    "rug-fabric": "fabric",
    "ha-rug-soft": "fabric"
  },
  "scooter": {
    "scooter-lamp": "emissive",
    "scooter-lamp-2": "emissive",
    "scooter-lamp-3": "emissive",
    "scooter-lamp-4": "emissive"
  },
  "shelf": {
    "shelf-top": "top",
    "shelf-material-0": "top",
    "shelf-metal": "metal",
    "shelf-material-1": "metal",
    "shelf-shelf": "shelf",
    "shelf-material-2": "shelf"
  },
  "shoecabinet": {
    "shoecabinet-interior": "interior",
    "shoecabinet-material-0": "interior",
    "shoecabinet-base": "base",
    "shoecabinet-material-1": "base",
    "shoecabinet-top": "top",
    "shoecabinet-material-2": "top",
    "shoecabinet-body": "body",
    "shoecabinet-material-3": "body",
    "shoecabinet-door": "door",
    "shoecabinet-material-4": "door"
  },
  "shower": {
    "shower-body": "body",
    "shower-material-0": "body",
    "shower-interior": "interior",
    "shower-material-1": "interior",
    "shower-metal": "metal",
    "shower-material-2": "metal"
  },
  "sideboard": {
    "sideboard-top": "top",
    "sideboard-material-0": "top",
    "sideboard-interior": "interior",
    "sideboard-material-1": "interior",
    "sideboard-body": "body",
    "sideboard-material-2": "body",
    "sideboard-door": "door",
    "sideboard-material-3": "door"
  },
  "smart-display-wall": {
    "smart-display-wall-shell": "shell",
    "smart-display-body": "shell",
    "smart-display-wall-screen": "screen",
    "smart-display-screen": "screen",
    "smart-display-wall-indicator": "indicator",
    "smart-display-icon": "indicator",
    "smart-display-wall-lit": "lit",
    "smart-display-ui": "lit",
    "smart-display-wall-grille": "grille",
    "smart-display-speaker": "grille"
  },
  "sofa-throw": {
    "sofa-throw-candidate-soft": "throwBlanket",
    "sofa-throw-candidate-light": "trim"
  },
  "stairs": {
    "stairs-body": "body",
    "stairs-material-0": "body",
    "stairs-top": "top",
    "stairs-material-1": "top",
    "stairs-trim": "trim",
    "stairs-material-2": "trim"
  },
  "steelstairs": {
    "steelstairs-tread": "tread",
    "004": "tread",
    "steelstairs-frame": "frame",
    "0005": "frame"
  },
  "suv": {
    "suv-trim": "trim",
    "gray": "trim",
    "suv-emissive": "emissive",
    "headlight": "emissive",
    "suv-emissive-2": "emissive",
    "headlight_01": "emissive",
    "suv-emissive-3": "emissive",
    "headlight_02": "emissive",
    "suv-base": "base",
    "base": "base",
    "suv-body": "body",
    "body": "body",
    "suv-glass": "glass",
    "glass_01": "glass",
    "suv-glass-2": "glass",
    "glass_02": "glass",
    "suv-glass-3": "glass",
    "glass_back": "glass",
    "suv-glass-4": "glass",
    "glass": "glass",
    "suv-seat": "seat",
    "salon": "seat"
  },
  "tea_bar_machine": {
    "tea_bar_machine-body": "body",
    "om.cn_1336": "body",
    "tea_bar_machine-panel": "panel",
    "om.cn_1342": "panel"
  },
  "tv_mobile": {
    "tv_mobile-leg": "leg",
    "tv_mobile-material-0": "leg",
    "tv_mobile-base": "base",
    "tv_mobile-material-1": "base",
    "tv_mobile-metal": "metal",
    "tv_mobile-material-2": "metal",
    "tv_mobile-body": "body",
    "tv_mobile-material-3": "body",
    "tv_mobile-trim": "trim",
    "tv_mobile-material-4": "trim",
    "tv_mobile-screen": "screen",
    "tv_mobile-material-5": "screen"
  },
  "tv_standard": {
    "tv_standard-screen": "screen",
    "tv_standard-material-0": "screen"
  },
  "tv_tabletop": {
    "tv_tabletop-base": "base",
    "tv_tabletop-material-0": "base",
    "tv_tabletop-metal": "metal",
    "tv_tabletop-material-1": "metal",
    "tv_tabletop-body": "body",
    "tv_tabletop-material-2": "body",
    "tv_tabletop-trim": "trim",
    "tv_tabletop-material-3": "trim"
  },
  "wallac": {
    "wallac-body": "body",
    "wallac-material-0": "body",
    "wallac-grating": "grating",
    "wallac-material-1": "grating",
    "wallac-lit": "lit",
    "wallac-material-2": "lit"
  },
  "wallcabinet": {
    "wallcabinet-base": "base",
    "wallcabinet-material-0": "base",
    "wallcabinet-body": "body",
    "wallcabinet-material-1": "body",
    "wallcabinet-shelf": "shelf",
    "wallcabinet-material-2": "shelf",
    "wallcabinet-door": "door",
    "wallcabinet-material-3": "door"
  }
}
);
