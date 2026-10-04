/**
 * @file accordion-context.ts
 * @module common/premium
 * @description Premium 手风琴组件的 provide/inject 上下文键
 *  用途：Accordion 容器通过该 key 向后代 AccordionItem 提供 openId 与 toggle 方法，
 *    子项无需走 props/emit 即可感知并切换展开状态。
 */
export const PREMIUM_ACC_KEY = Symbol('premiumAccordion')
