/**
 * 编译期影子模块：对应后端下发的舞台运行时 `/api/v1/modules/interaction3d/core/stage.js`。
 *
 * 该地址是运行时动态 import 的接口路径（见 src/app/3d-studio/stage-startup.ts），
 * tsc 无法解析真实文件；由 tsconfig 的 `paths` 指到这里，只声明被调用到的出口。
 */
export declare const mountStage: any;
export declare const createStage: any;
declare const stageModule: Record<string, any>;
export default stageModule;
