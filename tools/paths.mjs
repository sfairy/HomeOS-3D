/**
 * 仓库路径的单一事实来源。
 *
 * 规矩只有一条：**任何脚本都不许再自己拼仓库相对路径**。要用某个目录，从这里 import；
 * 这里没有的，先加到这里。``tools/check_invariants.mjs`` 的「路径常量不许重复推导」一条会强制它 ——
 * 起因是守卫文件里一度把 ``frontend/modules/runtime`` 定义了两次（``RUNTIME_DIR`` 与
 * ``RUNTIME_MODULES_DIR``），两处同名不同源，改路径时漏掉一处就会出现"守卫看着绿、实际查了个空目录"。
 *
 * 为什么值得单独一个文件：搬一个目录要同时改的东西里，最容易被漏掉的就是**工具脚本里的路径**
 * （运行时代码的路径早就集中在 ``apps/server/config.py`` / ``apps/store/config.py`` 了）。把这些常量收在
 * 这里之后，"搬目录"从"改 N 个文件"变成"改这一个文件"。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根目录（tools/ 的上一级）。 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const join = (...segments) => path.join(ROOT, ...segments);

/** 主应用后端包。 */
export const BACKEND_DIR = join("apps", "server");
/** 前端静态资源树的根（挂载为 /static）。 */
export const FRONTEND_DIR = join("frontend");
/** 公开静态资源目录（浏览器里的 /static）。 */
export const STATIC_DIR = join("frontend", "static");
/** 3D 交互运行时模块：按增量包能力码下发的模块包。 */
export const RUNTIME_MODULES_DIR = join("frontend", "modules", "runtime");
/** 3D 户型工作室的前端代码。 */
export const STUDIO_DIR = join("frontend", "static", "3d-studio", "studio");
/** 户型工作室的构件构造器（每类家具一份）。 */
export const ITEM_BUILDERS_DIR = join("frontend", "static", "3d-studio", "studio", "item-builders");
/** 3D 模型素材（.glb / 贴图），由建模流水线生成。 */
export const MODELS_DIR = join("frontend", "static", "3d-studio", "models");
/** 授权商店（独立部署单元，与 apps/server 互不 import）。 */
export const STORE_DIR = join("apps", "store");
/** 商店自带的前端资源。 */
export const STORE_STATIC_DIR = join("apps", "store", "static");
/** 设计源（canonical 调色板与场景），由构建期分发到两个部署单元。 */
export const DESIGN_DIR = join("design");
/** 场景的 canonical 源目录。 */
export const DESIGN_SCENE_DIR = join("design", "scene");
/** 审计与生成脚本自身。 */
export const TOOLS_DIR = join("tools");

/**
 * 把绝对路径转成仓库相对的 POSIX 路径（报告里统一用这个形态，跨平台可比）。
 */
export function rel(target) {
  return path.relative(ROOT, target).split(path.sep).join("/");
}
