"""授权（License）子包。

按职责分四层，包外只需关心这里导出的两个名字：
- 密码学原语（crypto.py）：Ed25519 租约验签、X25519 传输加密、本地凭证加密；
- 服务器端点池（endpoints.py）：ESA / EO / 直连三批地址的选路与失败拉黑；
- 硬件指纹（hardware.py）：由机器与主板标识派生安装实例 ID；
- 服务与门禁（service.py）：激活、心跳续租、租约恢复、能力码判定。

对外契约：LicenseService 提供 status / activate / reactivate / heartbeat 等方法，
统一以 LicenseClientError（中文文案 + 可选 HTTP 状态码与业务错误码）报错。
"""
from .service import LicenseClientError, LicenseService
# 只导出这两个名字：crypto / endpoints / hardware 属于实现细节，
# 外部（如 app 层与路由依赖）不应绕过 LicenseService 直接使用。
__all__ = [
    'LicenseClientError',
    'LicenseService']
