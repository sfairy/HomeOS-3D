/**
 * 3d-studio 内共享的极小颜色工具。
 */

/**
 * 把颜色朝白（amount > 0）或朝黑（amount < 0）插值。纯整数运算，不引 THREE。
 *
 * 语义说明：这是“插值版”——按 |amount| 在原通道值与 255/0 之间线性插值，
 * amount 取 -1..1，返回 0xRRGGBB 整数。请勿与 materials/studio-surface-textures.ts
 * 里的同名“乘法版”合并：那一版按 factor 对通道做乘法并夹取、返回 "rgb(...)" 字符串，
 * 二者入参范围、返回类型与颜色结果都不同。
 * @param {number} color 0xRRGGBB。
 * @param {number} amount -1..1。
 * @returns {number} 0xRRGGBB。
 */
export function shadeColor(color: any, amount: any) {
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const channel = (shift: any) => {
    const value = (color >> shift) & 255;
    return Math.round(value + (target - value) * weight);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
