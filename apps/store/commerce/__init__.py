"""交易与账务口径：商品、订单、支付履约与积分。

- ``catalog`` / ``order_status``：类型与状态的合法取值（服务端唯一来源）；
- ``money``：“积分与金额”的分币运算唯一口径（Decimal，整数厘）；
- ``coupons`` / ``fulfill`` / ``cashier`` / ``expiry``：核销、发码与订单收尾；
- ``referrals`` / ``points_migration``：邀请钱包与积分口径迁移。

导入本包不产生副作用。
"""
