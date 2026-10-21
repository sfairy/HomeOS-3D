"""跨项目/跨模块抽取后的等价性检查（ETag、email 迁移、百分比、金额、密钥文案、embedId）。

每个用例都把「抽取前的一份实现」作为对照写在本文件里（逐字复制自改动前的源码），
对随机输入断言两者输出完全一致，包括异常类型与错误文案。
"""

from __future__ import annotations

import importlib
import math
import random
import sqlite3
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / 'packages' / 'shared-py'))

_PKG = 'qa_shared_src'
_pkg = types.ModuleType(_PKG)
_pkg.__path__ = [str(REPO / 'homeos' / 'backend' / 'src')]
sys.modules[_PKG] = _pkg
_STORE = 'qa_shared_store'
_store = types.ModuleType(_STORE)
_store.__path__ = [str(REPO / 'homeos-store' / 'backend' / 'src')]
sys.modules[_STORE] = _store

http_cache = importlib.import_module('homeos_shared.http_cache')
sqlite_email = importlib.import_module('homeos_shared.sqlite_email')
schema_migrate = importlib.import_module('homeos_shared.schema_migrate')
percent_mod = importlib.import_module(f'{_PKG}.domains.client_power.percent')
linkage = importlib.import_module(f'{_PKG}.domains.client_power.linkage')
normalize = importlib.import_module(f'{_PKG}.domains.client_power.normalize')
embed = importlib.import_module(f'{_PKG}.platform.core.embed_proxy_util')
money = importlib.import_module(f'{_STORE}.commerce.money')
alipay = importlib.import_module(f'{_STORE}.payments.alipay_signing')


# ---------------------------------------------------------------------------
# 抽取前的对照实现
# ---------------------------------------------------------------------------
class _Request:
    def __init__(self, method, headers):
        self.method = method
        self.headers = headers


class _Response:
    def __init__(self, status_code, headers):
        self.status_code = status_code
        self.headers = headers


def legacy_etag_matches(request, response):
    if request.method not in {'GET', 'HEAD'} or response.status_code != 200:
        return False
    etag = response.headers.get('etag')
    requested = request.headers.get('if-none-match')
    if not etag or not requested:
        return False
    normalized = etag.removeprefix('W/')
    return any(
        value == '*' or value.removeprefix('W/') == normalized
        for value in (part.strip() for part in requested.split(','))
    )


def legacy_clamp_percent(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(num) or math.isinf(num):
        return None
    return max(0.0, min(100.0, round(num * 100) / 100))


def legacy_apply_rate_floor_cents(amount_cents, rate_percent):
    base = int(amount_cents)
    if base <= 0:
        return 0
    bps = money.percent_to_bps(rate_percent)
    if bps <= 0:
        return 0
    return base * bps // (money.CENTI_PER_POINT * money.CENTI_PER_POINT)


def legacy_discount_centi(price_cents, percent):
    base = int(price_cents)
    if base <= 0:
        return 0
    bps = money.percent_to_bps(percent)
    if bps <= 0:
        return 0
    return base * bps // (money.BPS_PER_PERCENT * money.BPS_PER_PERCENT)


def legacy_private_key_error(text):
    if not (text or '').strip():
        return '未配置应用私钥。'
    try:
        key = alipay._load_private_key(text)
    except alipay.PaymentError as error:
        return str(error)
    if key.key_size < alipay.MIN_RSA_BITS:
        return (
            f'应用私钥只有 {key.key_size} 位，支付宝要求 RSA{alipay.MIN_RSA_BITS}。'
            '请用支付宝密钥工具重新生成 2048 位密钥。'
        )
    return ''


def legacy_public_key_error(text):
    if not (text or '').strip():
        return '未配置支付宝公钥。'
    try:
        key = alipay._load_public_key(text)
    except alipay.PaymentError as error:
        return str(error)
    if key.key_size < alipay.MIN_RSA_BITS:
        return f'支付宝公钥只有 {key.key_size} 位，支付宝要求 RSA{alipay.MIN_RSA_BITS}。'
    return ''


def legacy_parse_embed_id_from_referer(referer):
    import re
    from urllib.parse import unquote

    match = re.search(r'/api/v1/embed-proxy/([^/?#]+)', str(referer or ''))
    if not match:
        return None
    raw = match.group(1)
    try:
        return unquote(raw)
    except Exception:
        return raw


def legacy_parse_embed_id_from_context_cookie(cookie_header):
    import re
    from urllib.parse import unquote

    match = re.search(r'(?:^|;\s*)embed_ctx__([^=;]+)=', str(cookie_header or ''))
    if not match:
        return None
    raw = match.group(1)
    try:
        return unquote(raw)
    except Exception:
        return raw


# ---------------------------------------------------------------------------
# ETag
# ---------------------------------------------------------------------------
class EtagMatchesTest(unittest.TestCase):
    def test_matches_legacy_on_random_headers(self):
        rng = random.Random(20261021)
        tokens = ['W/"abc"', '"abc"', '*', ' "ABC" ', '', '"def"', 'W/"def"']
        methods = ['GET', 'HEAD', 'POST', 'PUT']
        statuses = [200, 204, 304, 404]
        for _ in range(300):
            etag = rng.choice(['"abc"', 'W/"abc"', '', None])
            requested = ','.join(rng.choice(tokens) for _ in range(rng.randint(0, 3))) or None
            headers = {}
            if etag is not None:
                headers['etag'] = etag
            if requested is not None:
                headers['if-none-match'] = requested
            request = _Request(rng.choice(methods), {})
            response = _Response(rng.choice(statuses), headers)
            self.assertEqual(
                legacy_etag_matches(request, response),
                http_cache.etag_matches(request, response),
                (headers, request.method, response.status_code),
            )


# ---------------------------------------------------------------------------
# email 迁移
# ---------------------------------------------------------------------------
class NormalizeEmailColumnTest(unittest.TestCase):
    def _prepare(self, table, not_null_default):
        connection = sqlite3.connect(':memory:')
        column = "email VARCHAR(255) NOT NULL DEFAULT ''" if not_null_default else 'email VARCHAR(255)'
        if not_null_default:
            connection.execute(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY, {column})')
        else:
            connection.execute(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY)')
        return connection

    def test_adds_column_normalizes_and_creates_index(self):
        connection = self._prepare('users', not_null_default=False)
        connection.execute("INSERT INTO users (id) VALUES (1)")
        connection.execute("INSERT INTO users (id) VALUES (2)")
        sqlite_email.normalize_email_column(
            connection,
            table='users',
            add_column_sql='ALTER TABLE users ADD COLUMN email VARCHAR(255)',
            index_name='users_email_idx',
        )
        connection.commit()
        self.assertEqual(
            [row[0] for row in connection.execute('SELECT email FROM users ORDER BY id')], [None, None]
        )
        indexes = {row[1] for row in connection.execute('PRAGMA index_list("users")')}
        self.assertIn('users_email_idx', indexes)

    def test_normalizes_existing_rows_and_is_idempotent(self):
        connection = self._prepare('accounts', not_null_default=True)
        connection.execute("INSERT INTO accounts (id, email) VALUES (1, '  Alice@Example.COM ')")
        connection.execute("INSERT INTO accounts (id, email) VALUES (2, 'B@EXAMPLE.com')")
        for _ in range(2):
            sqlite_email.normalize_email_column(
                connection,
                table='accounts',
                add_column_sql="ALTER TABLE accounts ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ''",
                index_name='ix_accounts_email',
            )
        connection.commit()
        self.assertEqual(
            [row[0] for row in connection.execute('SELECT email FROM accounts ORDER BY id')],
            ['alice@example.com', 'b@example.com'],
        )

    def test_duplicate_error_message_matches_legacy_wording(self):
        connection = self._prepare('users', not_null_default=True)
        connection.execute("INSERT INTO users (id, email) VALUES (7, 'A@x.com')")
        connection.execute("INSERT INTO users (id, email) VALUES (9, 'a@X.com')")
        with self.assertRaises(schema_migrate.SchemaMigrationError) as raised:
            sqlite_email.normalize_email_column(
                connection,
                table='users',
                add_column_sql='ALTER TABLE users ADD COLUMN email VARCHAR(255)',
                index_name='users_email_idx',
            )
        self.assertEqual(
            str(raised.exception),
            'users.email 归一化后出现重复，请先人工处理：7 与 9 都映射到 a@x.com',
        )
        # 冲突时不得写入任何归一化结果
        self.assertEqual(
            [row[0] for row in connection.execute('SELECT email FROM users ORDER BY id')],
            ['A@x.com', 'a@X.com'],
        )

    def test_missing_table_is_noop(self):
        connection = sqlite3.connect(':memory:')
        sqlite_email.normalize_email_column(
            connection,
            table='users',
            add_column_sql='ALTER TABLE users ADD COLUMN email VARCHAR(255)',
            index_name='users_email_idx',
        )
        self.assertEqual(
            connection.execute(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='users'"
            ).fetchone()[0],
            0,
        )


# ---------------------------------------------------------------------------
# 百分比 / 金额 / 密钥 / embedId
# ---------------------------------------------------------------------------
class PercentNormalizationTest(unittest.TestCase):
    def test_matches_legacy_on_random_values(self):
        rng = random.Random(7)
        samples = [None, True, False, '12.345', ' abc ', '', float('nan'), float('inf'), -1, 0, 1, 100, 100.005, 12.344999]
        samples += [rng.uniform(-200, 300) for _ in range(300)]
        for value in samples:
            expected = legacy_clamp_percent(value)
            self.assertEqual(expected, percent_mod.normalize_percent(value), repr(value))
            self.assertEqual(expected, linkage.clamp_percent(value), repr(value))
            self.assertEqual(expected, normalize.normalize_level(value), repr(value))


def _outcome(call):
    """统一记录「返回值 / 异常类型+文案」，用于比较等价性。"""
    try:
        return ('ok', call())
    except Exception as error:  # 对照实现与抽取实现异常必须一致
        return ('error', type(error).__name__, str(error))


class MoneyScalingTest(unittest.TestCase):
    def test_matches_legacy_on_random_values(self):
        rng = random.Random(11)
        amounts = [-5, 0, 1, 2, 99, 100, 1005, 10**9] + [rng.randint(-1000, 10**7) for _ in range(300)]
        rates = [-10, 0, 0.01, 0.5, 1, 5, 12.5, 100, 1000, '3.75', 'bad', None]
        for amount in amounts:
            for rate in rates:
                self.assertEqual(
                    _outcome(lambda amount=amount, rate=rate: legacy_apply_rate_floor_cents(amount, rate)),
                    _outcome(lambda amount=amount, rate=rate: money.apply_rate_floor_cents(amount, rate)),
                    (amount, rate),
                )
                self.assertEqual(
                    _outcome(lambda amount=amount, rate=rate: legacy_discount_centi(amount, rate)),
                    _outcome(lambda amount=amount, rate=rate: money.discount_centi(amount, rate)),
                    (amount, rate),
                )


class _FakeKey:
    def __init__(self, key_size):
        self.key_size = key_size


class AlipayKeyErrorTest(unittest.TestCase):
    def test_messages_match_legacy(self):
        cases = [
            ('', ''),
            ('   ', '   '),
            ('broken', 'broken'),
        ]
        for text, other in cases:
            with (
                mock.patch.object(
                    alipay, '_load_private_key', side_effect=alipay.PaymentError('私钥解析失败')
                ),
                mock.patch.object(
                    alipay, '_load_public_key', side_effect=alipay.PaymentError('公钥解析失败')
                ),
            ):
                self.assertEqual(legacy_private_key_error(text), alipay.private_key_error(other))
                self.assertEqual(legacy_public_key_error(text), alipay.public_key_error(other))
        for key_size in (1024, 2047, 2048, 4096):
            with (
                mock.patch.object(alipay, '_load_private_key', return_value=_FakeKey(key_size)),
                mock.patch.object(alipay, '_load_public_key', return_value=_FakeKey(key_size)),
            ):
                self.assertEqual(legacy_private_key_error('k'), alipay.private_key_error('k'))
                self.assertEqual(legacy_public_key_error('k'), alipay.public_key_error('k'))


class EmbedIdParsingTest(unittest.TestCase):
    def test_matches_legacy_on_random_inputs(self):
        rng = random.Random(13)
        samples = [
            '',
            '/api/v1/embed-proxy/abc',
            'https://x/api/v1/embed-proxy/a%20b?x=1',
            'embed_ctx__id123=1; other=2',
            'other=1; embed_ctx__a%2Fb=2',
            '/api/v1/embed-proxy/',
        ]
        alphabet = 'abcdef/%? =&;'
        samples += [''.join(rng.choice(alphabet) for _ in range(rng.randint(0, 40))) for _ in range(200)]
        for text in samples:
            self.assertEqual(
                legacy_parse_embed_id_from_referer(text),
                embed.parse_embed_id_from_referer(text),
                text,
            )
            self.assertEqual(
                legacy_parse_embed_id_from_context_cookie(text),
                embed.parse_embed_id_from_context_cookie(text),
                text,
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
