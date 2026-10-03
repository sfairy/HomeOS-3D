/**
 * 3D 场景里「文字类卡片」的统一字号（舞台设计 px）。
 *
 * 所有卡片都挂在 .i3d-presentation 下，被演示层统一缩放 scale(mediaScale)，
 * 于是屏幕字号 = 配置值 × 演示层缩放系数（本机实测约 0.73）。门锁 / 摄像头 / 车卡
 * 如果各自沿用旧的 12，屏幕上只剩 ~8.7px，还不到环境标签（21 → ~15.3px）的六成，
 * 观感就是「这几张卡片偏小」。
 *
 * 所以文字卡片的默认字号一律取这一个常量，改这一处同时生效：
 * - frontend/src/runtime/core/stage.ts                     门 / 摄像头 渲染兜底
 * - frontend/src/runtime/vehicle/car-card.ts               车卡渲染兜底
 * - frontend/src/runtime/security/security-editor.ts       新建项默认值
 *
 * 注意：这里只管「文字」，不要顺手统一 size —— 各卡 size 语义本来就不同
 * （门 / 摄像头是 size÷44 的倍率，车卡是 cardWidth 宽度，环境标签是信息框宽度）。
 */
export const CARD_TEXT_SIZE_PX = 21;
