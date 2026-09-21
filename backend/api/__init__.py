"""HomeOS 的 API 路由包。

每个业务域各自一个 APIRouter（认证、仪表盘、中控设备、素材、图标等），
由 main.py 统一挂到 /api/v1 前缀下。本文件刻意不导入任何子模块，
避免只是 import 这个包就把全部路由与依赖一并拉起来。

请求级的认证 / 授权依赖不在本包，见 `backend/security/dependencies.py`：
它被本包与 `modules`、`observability` 共用，放在 `api/` 会形成包级环。
"""
