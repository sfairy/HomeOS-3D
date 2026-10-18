/**
 * 冻结的公开路径兼容再导出。
 *
 * 旧实现曾直接放在 runtime/editor/config-editor.ts，重构后拆到 runtime/config-ui/
 * 并进一步拆出 config-editor/appearance-editor.ts。但页面 bridge 里的动态 import
 * 公网 URL（/api/v1/modules/interaction3d/editor/config-editor.js）是冻结契约，
 * 后端只按 runtime manifest 放行该路径（见 studio/README.md），因此这里保留
 * 薄再导出，不要删除或改名；新增实现请写到 runtime/config-ui/ 下并由本文件转发。
 */
export {
  openInteraction3dEditor,
  openInteraction3dAppearanceEditor,
} from "../config-ui/config-editor";
