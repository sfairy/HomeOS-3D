/**
 * 认证页入口聚合。
 *
 * 五个认证视图（登录 / 注册 / 找回密码 / 授权激活 / 授权恢复）放在同一个动态 import 里：
 *
 * - 它们只在未登录路径上出现，却曾经被 `router/index.ts` 静态引入，结果整个认证子图
 *   （实测 128,337B raw / 40,450B gzip）被 Vite 打进入口依赖图，`index.html` 的
 *   `modulepreload` 因此把它带到**每一页**的首屏关键路径上：总览、3D 展示、工作室
 *   都在下载自己永远用不到的表单代码。
 * - 聚成一个入口（而不是五条各自 `import()`）是为了让这五页共享同一份 chunk：
 *   用户从登录跳到注册、再跳到找回密码时不会重复下载同一批依赖。
 *
 * 首屏观感由外壳保证，不靠本模块：`index.html` 内联了认证场景的骨架与品牌字，
 * 且认证场景的样式表是外壳 `<link>`（见 `homeos/frontend/index.html`），
 * 所以 chunk 到达前页面已经是最终底色 + 字形，不会出现空壳一闪。
 */
export { default as LoginView } from './LoginView.vue'
export { default as RegisterView } from './RegisterView.vue'
export { default as ResetPasswordView } from './ResetPasswordView.vue'
export { default as LicenseView } from './LicenseView.vue'
export { default as LicenseRecoveryView } from './LicenseRecoveryView.vue'
