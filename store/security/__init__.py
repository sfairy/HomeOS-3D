"""商店侧的密码学与访问控制：口令哈希、会话令牌、限流与库结构守卫。

包含 ``security``（口令与会话工具）、``request_security``（来源 IP / HTTPS /
同源判定，与主应用 ``backend/security/http_security.py`` 同构的另一份实现）、
``password_gate`` 与 ``limiter``（失败限流）、``setup_guard``（首次初始化守卫）、
``secret_fields``（后台密钥字段打码）与 ``schema_guard``（存量库补列 / 删退役列）。

导入本包不产生副作用。
"""
