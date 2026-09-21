"""身份、会话与请求来源的安全设施。

包含访问主体解析（access）、管理员账号外置、口令与会话令牌（security）、
真实来源 IP 与同源校验（http_security）、登录与配对限流、首次初始化守卫、
展示页访问控制，以及落盘密钥文件的原子创建。

请求级的 FastAPI 认证 / 授权依赖（`CurrentUser`、`LicensedViewer`、能力码门禁、
中控可见范围等）在 `dependencies.py` —— 它是 `api`、`modules`、`observability`
三处的共用入口，因此必须待在比它们更低的一层（早先放在 `core/` 会让 `core`
反向依赖 `panel`/`ha`，放在 `api/` 则与 `modules`、`observability` 成环）。

导入本包不产生副作用：不连库、不读密钥、不注册路由。
"""
