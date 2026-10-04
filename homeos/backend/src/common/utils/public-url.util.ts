/**
 * 职责：
 *  - 拼接静态资源（平面图 / 背景图 / 图标 / 房间图 / 3D 导出包）的公开访问 URL；
 * 关键依赖：
 *  - 无外部依赖，纯函数；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 拼接静态资源的公开访问 URL。
 *
 * - 空/空白路径片段自动忽略，避免出现 `//`；
 * - 反斜杠统一转为正斜杠，规避 Windows 路径混入 URL；
 * - 根路径与各片段的首尾斜杠会被归一，保证结果始终是单前导斜杠的绝对路径。
 *
 * @param root 资源根路径（如 `floorplans` / `backgrounds` / `icons`）
 * @param segments 路径片段（文件名 / 子目录）
 * @returns 形如 `/floorplans/sub/a.png` 的公开 URL
 */
export function publicAssetUrl(root: string, ...segments: string[]): string {
  const base = String(root ?? '').replace(/^\/+|\/+$/g, '');
  const tail = segments
    .filter((s) => Boolean(s))
    .join('/')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!base) return tail ? `/${tail}` : '/';
  return tail ? `/${base}/${tail}` : `/${base}`;
}
