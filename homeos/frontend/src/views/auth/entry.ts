/** 认证入口统一出口。
 *
 * 这五个视图只由认证路由、以及 App.vue 的授权恢复遮罩使用。集中到一个静态入口后，
 * 构建产物里只会有单个认证 chunk；服务端按路由把它的 modulepreload / stylesheet
 * 注入认证页外壳（见 backend/src/bootstrap/spa_static.py），非认证页不再预载。
 */
export { default as LoginView } from './LoginView.vue'
export { default as RegisterView } from './RegisterView.vue'
export { default as ResetPasswordView } from './ResetPasswordView.vue'
export { default as LicenseView } from './LicenseView.vue'
export { default as LicenseRecoveryView } from './LicenseRecoveryView.vue'
