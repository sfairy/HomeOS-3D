/**
 * 编译期影子模块：对应后端在 `/api/v1/modules/interaction3d/core/stage.js` 上提供的舞台模块。
 *
 * 该地址是运行时动态 import 的接口路径（见 stage-startup.ts / studio-app.ts），tsc 无法解析，
 * 由 tsconfig 的 `paths` 指到这里，只声明被调用到的出口。
 */
export declare const mountStage: any;
