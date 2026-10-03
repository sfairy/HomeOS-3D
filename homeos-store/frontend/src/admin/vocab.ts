/** 领域词表。 */

export const ORDER_TYPE: Record<string, string> = {
  base: '基础',
  addon: '增购',
  upgrade: '升级',
  package: '套餐',
};

export const LICENSE_ACTION: Record<string, string> = {
  issue: '签发',
  patch: '补发',
  upgrade: '升级',
};

export const LICENSE_SOURCE: Record<string, string> = {
  payment_automatic: '支付自动',
  manual: '手动签发',
};


export const PRODUCT_TYPE: Record<string, string> = {
  base: '基础授权',
  bundle: '全授权',
  package: '套餐',
  module: '增量包',
  template: '模板',
};
