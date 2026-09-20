"""运营支撑：站点配置、邮件投递、发布信息与自检原语。

- ``site_settings``：站点级运行时配置（后台可改）的读写与序列化；
- ``mailer`` / ``mail_settings``：验证码投递与配置解析；
- ``release_info`` / ``features``：发布记录与客户端能力码目录；
- ``net_probe`` / ``incidents``：可达性探测与「被刻意吞掉」的异常计数。

导入本包不产生副作用。
"""
