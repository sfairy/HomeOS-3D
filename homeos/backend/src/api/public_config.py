'''匿名公开配置：登录页与授权对话框要用的商店入口地址。'''
from __future__ import annotations

from fastapi import APIRouter, Request

from ..platform.security.request_origin import browser_origin

router = APIRouter(tags=['public'])

STORE_PASSWORD_RESET_PATH = '/user/authentication/forget'


@router.get('/public/config')
async def public_config(request: Request) -> dict:
    '''登录页拿它改写「忘记密码 / 商店」两个链接的 href。

    ``storeUrl`` 是**浏览器**要打开的地址，所以取值全程站在浏览器的角度（见
    ``domains/store/discovery.py``）：

    1. 显式 ``APP_STORE_URL`` —— 权威，原样使用（两份 compose 默认写公网商店域名，所以
       注册 / 激活 / 商店入口一律走公网，不会落到内网地址）；
    2. 否则问商店：声明了 ``STORE_BASE_URL``（``declared=true``）就**原样采信**（优先于
       同机推断）；没声明时才把浏览器解析不了的主机名换成浏览器访问本应用用的那个；
    3. 完全取不到则回空串，前端据此**隐藏**商店入口（激活页改显「请联系厂商」），
       不回落到任何猜测的地址。见 ``shared/utils/store-links.util.ts``。

    第 2 步的取回带缓存与失败退避，不会每次请求都联网。
    '''
    resolver = getattr(request.app.state, 'store_base_url_resolver', None)
    if resolver is None:
        return {'storeUrl': '', 'storePasswordResetPath': STORE_PASSWORD_RESET_PATH}
    return {
        'storeUrl': await resolver.resolve_for_browser(browser_origin(request)),
        'storePasswordResetPath': STORE_PASSWORD_RESET_PATH,
    }
