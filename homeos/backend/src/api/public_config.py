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

    1. 显式 ``APP_STORE_URL`` —— 权威，原样使用（地址特殊时靠它兜底）；
    2. 否则问商店「你的对外地址是什么」，得到它回答里浏览器解析不了的主机名
       （``homeos-store`` 这类容器服务名 / 回环）时，把主机名替换成浏览器自己访问
       本应用用的那个 —— 同机部署正是这样拿到 ``http://<宿主IP>:8802`` 的；
    3. 完全取不到则回空串，前端用自己的兜底值（``store-links.util.ts``）。

    第 2 步的取回带缓存与失败退避，不会每次请求都联网。
    '''
    resolver = getattr(request.app.state, 'store_base_url_resolver', None)
    if resolver is None:
        return {'storeUrl': '', 'storePasswordResetPath': STORE_PASSWORD_RESET_PATH}
    return {
        'storeUrl': await resolver.resolve_for_browser(browser_origin(request)),
        'storePasswordResetPath': STORE_PASSWORD_RESET_PATH,
    }
