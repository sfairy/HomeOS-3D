"""主后端环境变量/保留策略重构与死代码删除的等价性检查。"""

from __future__ import annotations

import importlib
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[4]
_PKG = 'qa_backend_src'
_pkg = types.ModuleType(_PKG)
_pkg.__path__ = [str(REPO / 'homeos' / 'backend' / 'src')]
sys.modules[_PKG] = _pkg
sys.path.insert(0, str(REPO / 'packages' / 'shared-py'))
database = importlib.import_module(f'{_PKG}.platform.core.database')
retention = importlib.import_module(f'{_PKG}.domains.retention.service')
channels = importlib.import_module(f'{_PKG}.domains.channels.config')


class DatabaseEnvNumberTest(unittest.TestCase):
    def test_default_and_parse(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('QA_TEST_ENV', None)
            self.assertEqual(database._environment_int('QA_TEST_ENV', 8), 8)
            self.assertEqual(database._environment_float('QA_TEST_ENV', 5.0), 5.0)
        with mock.patch.dict(os.environ, {'QA_TEST_ENV': '16'}):
            self.assertEqual(database._environment_int('QA_TEST_ENV', 8), 16)

    def test_invalid_and_low_fall_back(self):
        with mock.patch.dict(os.environ, {'QA_TEST_ENV': 'abc'}):
            self.assertEqual(database._environment_int('QA_TEST_ENV', 8, minimum=1), 8)
        with mock.patch.dict(os.environ, {'QA_TEST_ENV': '0'}):
            self.assertEqual(database._environment_int('QA_TEST_ENV', 8, minimum=1), 8)
        with mock.patch.dict(os.environ, {'QA_TEST_ENV': '  '}):
            self.assertEqual(database._environment_float('QA_TEST_ENV', 5.0), 5.0)


class RetentionDescribeTest(unittest.TestCase):
    def test_deleted_messages(self):
        self.assertEqual(
            retention._describe_deleted({'eventLog': 6, 'securityEvent': 2}),
            '事件日志 6 条、安防事件 2 条',
        )
        self.assertEqual(retention._describe_deleted({'unknownKey': 1}), 'unknownKey 1 条')
        self.assertEqual(retention._describe_deleted({'eventLog': 0, 'securityEvent': -3}), '无明细')
        self.assertEqual(retention._describe_deleted({'eventLog': 'bad'}), '无明细')

    def test_retention_messages(self):
        self.assertEqual(retention._describe_retention({'eventLog': 7}), '事件日志 7 天')
        self.assertEqual(retention._describe_retention({}), '未更改')


class RemovedHelpersTest(unittest.TestCase):
    def test_removed_symbols_are_gone(self):
        self.assertFalse(hasattr(channels, '_bool'))
        source = (REPO / 'homeos/backend/src/domains/system/ops/external_api.py').read_text()
        self.assertNotIn('def _iso_from_ms', source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
