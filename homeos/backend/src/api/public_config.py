'''匿名公开配置：登录页与授权对话框要用的商店入口地址。'''
from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(tags=['public'])

STORE_PASSWORD_RESET_PATH = '/user/authentication/forget'


@router.get('/public/config')
async def public_config(request: Request) -> dict:
    '''登录页拿它改写「忘记密码 / 商店」两个链接的 href。

    ``storeUrl`` 三层取值（见 ``domains/store/discovery.py``）：
    1. 显式 ``APP_STORE_URL``（权威；同机部署必须用它 —— 那时容器只认服务名）；
    2. 商店对 ``GET /store/v1/base-url`` 的回答（分机部署里 = 客户机连它的地址）；
    3. 空串 —— 前端用自己的兜底值（``store-links.util.ts``），链接退化但不报错。

    这里调用的 ``resolve()`` 是带缓存与失败退避的，不会每次请求都联网。
    '''
    resolver = getattr(request.app.state, 'store_base_url_resolver', None)
    store_url = await resolver.resolve() if resolver is not None else ''
    return {
        'storeUrl': store_url,
        'storePasswordResetPath': STORE_PASSWORD_RESET_PATH,
    }
