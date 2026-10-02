'''匿名公开配置：登录页与授权对话框要用的商店入口地址。'''
# [补充说明] 这些值必须**匿名可读**：登录页在未登录、未激活、未初始化时就要渲染
# 「忘记密码」和「商店」入口，所以本模块刻意不带任何身份依赖（对照 api/updates.py 的
# CurrentUser）。正因如此，这里只允许暴露运营配置 —— 密钥、数据目录、实例标识等一律不放。
from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(tags=["public"])

# 商店站内的找回密码页。路径由 homeos-store 的页面路由固定
# （homeos-store/backend/src/api/pages.py），跟着商店地址一起下发，前端不必再拼字符串。
STORE_PASSWORD_RESET_PATH = '/user/authentication/forget'


@router.get('/public/config')
def public_config(request: Request) -> dict:
    # [补充说明] 下发浏览器可直接访问的商店入口；地址来自 APP_STORE_URL（见 config.Settings.store_url）。
    #
    # 不查库、不联网，纯读进程内快照，因此不需要 no-store 之外的缓存策略。
    settings = request.app.state.settings
    return {
        'storeUrl': settings.store_url,
        'storePasswordResetPath': STORE_PASSWORD_RESET_PATH,
    }
