"""授权（License）子包。

分五层：crypto（Ed25519 验签 / X25519 传输加密 / 本地凭证加密）、endpoints
（地址池选路与拉黑）、hardware（硬件指纹派生实例 ID）、trust（启动期信任锚自检）、
service（激活、心跳续租、租约恢复、能力码判定）。

对外契约：LicenseService 提供 status / activate / reactivate / heartbeat 等方法，
统一以 LicenseClientError（中文文案 + 可选 HTTP 状态码与业务错误码）报错。
"""
from .service import LicenseClientError, LicenseService
# 只导出这两个名字：crypto / endpoints / hardware / trust 属于实现细节，外部不应绕过 LicenseService 使用。
__all__ = [
    'LicenseClientError',
    'LicenseService']
