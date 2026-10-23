/**
 * 自动生成，勿手改。生成命令：
 *   bun ops/checks/studio/repair_glb_material_slots.mjs --emit-generated
 *
 * 槽位改名后，原本靠 `MODEL_SLOT_ROLES[itemType][slotIndex]` 顺序表解析角色的模型，
 * 名字里已经没有 `material-<n>`；这里把「新 token → 角色」登记进语义表，
 * 让解析从「按顺序猜」变成「按名字定」，重出模型时顺序变化也不会错色。
 */
export const GENERATED_MODEL_SLOT_ROLES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(
{}
);

/**
 * 完整材质名 → 角色（改名后的新名）。优先级高于 token 推断：
 * `shower-body` 的 token `body` 在 ceramic 家族里会被读成「陶瓷本体」，
 * 而该槽位的契约角色是金属淋浴房本体，只能按完整名锁定。
 */
export const GENERATED_MATERIAL_ROLE_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(
{
  "ball-pit": {
    "ball-pit-candidate-soft": "body",
    "ball-pit-candidate-light": "playBall",
    "ball-pit-candidate-body": "playBall",
    "ball-pit-candidate-accent": "accent"
  },
  "bed-tray": {
    "bed-tray-candidate-body": "board",
    "bed-tray-candidate-light": "handle"
  },
  "decorative-plate": {
    "decorative-plate-candidate-light": "plate",
    "decorative-plate-candidate-accent": "trim",
    "decorative-plate-candidate-body": "accent",
    "decorative-plate-candidate-dark": "base"
  },
  "scooter": {
    "scooter-lamp": "emissive",
    "scooter-lamp-2": "emissive",
    "scooter-lamp-3": "emissive",
    "scooter-lamp-4": "emissive"
  },
  "sofa-throw": {
    "sofa-throw-candidate-soft": "throwBlanket",
    "sofa-throw-candidate-light": "trim"
  }
}
);
