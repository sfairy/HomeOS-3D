/**
 * home-mode 域页面入口：`views/**` 只能从这里取页面组件（check-frontend-deps 的
 * `views→feature-deep` 规则），与域根 barrel `index.ts` 分离 —— barrel 面向跨域消费者，
 * 本文件只出路由页，避免把页面打进其它域的 chunk。
 */
export { default as ModeTriggerLogsPage } from './ModeTriggerLogsPage.vue'
