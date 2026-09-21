/**
 * 领域词表。
 *
 * 订单类型、授权动作与来源、商品类型的中文标签（服务端另有权威词表，这里只是展示映射）。
 *
 * 展示用词表。服务端另有一份权威词表（状态、类型），这里只放不会变的中文标签。
 */

// 订单类型 / 授权动作：原始值是 base|addon|upgrade|package 与 issue|patch|upgrade
// （值域与写入点都在 store/api/store.py 的下单分支；models.py 的字段注释同步维护）。
// 直接显示英文在中文界面里很突兀，且 addon/issue 这种拼接串很占列宽。
// 清单里不要放后端从不写入的值：多一个键不会报错，只会让下一个人以为那个状态存在。
export const ORDER_TYPE = { base: '基础', addon: '增购', upgrade: '升级', package: '套餐' };

export const LICENSE_ACTION = { issue: '签发', patch: '补发', upgrade: '升级' };

// 授权来源：值域是 ``License.issuance_source`` 实际会被写入的两个值（``admin.py`` 手工签发写
// ``manual``、``fulfill.py`` 发卡写 ``payment_automatic``），与后端 ``serializers.py`` 的
// ``ISSUANCE_SOURCE_LABELS`` 同一口径。曾多出 trial / migration / compensation 三个从无人写入
// 的值 —— 多一个键不会报错，只会让下一个人以为那个来源存在。
export const LICENSE_SOURCE = {
  payment_automatic: '支付自动', manual: '手动签发',
};

// 商品类型：前台 store.js 用的口径是「全授权 / 自定义套餐 / 功能增量包」，
// 后台列窄，取等价的短说法，含义保持一致。
// 取值清单的唯一出处是 store/commerce/catalog.py 的 PRODUCT_TYPE_LABELS（它同时约束接口校验）；
// 这里曾多一个 `addon`，那个值后端根本不接受 —— 真选中它只会拿到 422。
export const PRODUCT_TYPE = {
  base: '基础授权', bundle: '全授权', package: '套餐',
  module: '增量包', template: '模板',
};
