"""商店回归测试的公共夹具。

这些测试刻意使用**临时数据目录与临时密钥目录**：它们会建库、签发授权、写文件，
绝不能碰到 apps/store/data 与 apps/store/keys/local 里的真实数据。
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.store.config import load_settings  # noqa: E402


@pytest.fixture
def make_settings(tmp_path):
    """每次调用都拿到一套**互不共享**的数据目录与密钥目录。"""
    counter = {"n": 0}

    def build(**overrides):
        counter["n"] += 1
        index = counter["n"]
        values = {
            "data_dir": tmp_path / f"data{index}",
            "license_keys_dir": tmp_path / f"keys{index}",
            "project_root": tmp_path,
            # 测试里不跑巡检循环（巡检另有针对性的单测）。
            "payment_sweep_interval_seconds": 0,
            # 真实收款场景的默认值：订单 TTL 对齐支付宝二维码寿命。
            "order_ttl_seconds": 900,
        }
        values.update(overrides)
        return load_settings(**values)

    return build


@pytest.fixture
def make_app():
    """建应用并保证退出时关掉数据库连接。"""
    created = []

    def build(settings):
        from apps.store.app import create_app

        application = create_app(settings)
        created.append(application)
        return application

    yield build
    for application in created:
        application.state.database.dispose()


@pytest.fixture
def make_client():
    """TestClient 上下文的集合：进入时跑 lifespan（建表、默认商品）。"""
    from fastapi.testclient import TestClient

    def build(application):
        return TestClient(application)

    return build


@pytest.fixture
def alipay_keys():
    from apps.store.tests.support import generate_alipay_keypair

    return generate_alipay_keypair()


#: 微信支付要**两对**密钥，角色不能互换：
#:
#: * ``merchant_keys`` —— 商户 API 私钥，用来签我们发出的请求；
#: * ``platform_keys`` —— 微信支付平台公钥，用来验微信推来的回调（测试里由我们扮演微信）。
#:
#: 测试里把两者混用是最容易犯的错，所以刻意取两个不同的名字、固定成两个夹具。
@pytest.fixture
def merchant_keys():
    from apps.store.tests.support import generate_rsa_keypair

    return generate_rsa_keypair()


@pytest.fixture
def platform_keys():
    from apps.store.tests.support import generate_rsa_keypair

    return generate_rsa_keypair()
