/**
 * 舞台背景可见性：背景主题对象收集与显隐同步。
 *
 * 自 studio-app.ts 的 createStageController 内簇工厂化外提。
 * 对 studio-app.ts 内部零依赖（模块级依赖为 0），故不存在循环引用；
 * 簇内可变状态经 getter/setter 暴露。
 */
import { state } from "./studio-state.js";

/* ---------- 工厂 ---------- */

export function createStageBackgroundController() {
  let isBackgroundVisible = true;
  let backgroundThemeModelRoot: any;
  let backgroundThemeFirstChild: any;
  let backgroundRoleObjects: any = [];
  let backgroundThemeController: any = null;
  /**
   * 按背景可见性开关同步背景与网格对象的显隐，并兼顾主题控制器与楼层背景的例外规则。
   * @returns {void} 无返回值。
   */
  function applyBackgroundVisibility() {
    if (
      backgroundThemeModelRoot !== state.previewModelRoot ||
      backgroundThemeFirstChild !== state.previewModelRoot?.children[0]
    ) {
      backgroundThemeModelRoot = state.previewModelRoot;
      backgroundThemeFirstChild = state.previewModelRoot?.children[0];
      backgroundRoleObjects = [];
      state.previewModelRoot?.traverse((backgroundSceneNode: any) => {
        if (["background", "grid"].includes(backgroundSceneNode.userData?.exportRole)) {
          backgroundRoleObjects.push(backgroundSceneNode);
        }
      });
    }
    backgroundThemeController?.sync(backgroundRoleObjects, isBackgroundVisible);
    for (const backgroundRoleObject of backgroundRoleObjects) {
      backgroundRoleObject.visible =
        isBackgroundVisible &&
        (!backgroundRoleObject.userData.floorBackgroundHidden ||
          backgroundRoleObject.userData.backgroundThemeKeepVisible === true) &&
        !backgroundRoleObject.userData.backgroundThemeHidden;
    }
  }

  return {
    applyBackgroundVisibility,
    get backgroundThemeController(): any {
      return backgroundThemeController;
    },
    set backgroundThemeController(next: any) {
      backgroundThemeController = next;
    },
    get backgroundThemeFirstChild(): any {
      return backgroundThemeFirstChild;
    },
    set backgroundThemeFirstChild(next: any) {
      backgroundThemeFirstChild = next;
    },
    get backgroundThemeModelRoot(): any {
      return backgroundThemeModelRoot;
    },
    set backgroundThemeModelRoot(next: any) {
      backgroundThemeModelRoot = next;
    },
    get isBackgroundVisible(): any {
      return isBackgroundVisible;
    },
    set isBackgroundVisible(next: any) {
      isBackgroundVisible = next;
    }
  };
}
