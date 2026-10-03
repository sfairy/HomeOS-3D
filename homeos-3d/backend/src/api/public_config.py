'''匿名公开配置：登录页与授权对话框要用的商店入口地址。'''
from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(tags=["public"])

STORE_PASSWORD_RESET_PATH = '/user/authentication/forget'


@router.get('/public/config')
def public_config(request: Request) -> dict:
    settings = request.app.state.settings
    return {
        'storeUrl': settings.store_url,
        'storePasswordResetPath': STORE_PASSWORD_RESET_PATH,
    }
