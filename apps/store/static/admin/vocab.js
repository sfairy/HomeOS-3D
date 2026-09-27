/**
 * 领域词表。
 */

export const ORDER_TYPE = { base: '基础', addon: '增购', upgrade: '升级', package: '套餐' };

export const LICENSE_ACTION = { issue: '签发', patch: '补发', upgrade: '升级' };

export const LICENSE_SOURCE = {
  payment_automatic: '支付自动', manual: '手动签发',
};

// 商品类型：前台 store.js 用的口径是「全授权 / 自定义套餐 / 功能增量包」，
export const PRODUCT_TYPE = {
  base: '基础授权', bundle: '全授权', package: '套餐',
  module: '增量包', template: '模板',
};
