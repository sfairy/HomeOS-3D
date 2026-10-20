"""门店后端 config 环境变量读取重构的等价性检查。"""

from __future__ import annotations

import importlib
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[4]
_PKG = 'qa_store_src'
_pkg = types.ModuleType(_PKG)
_pkg.__path__ = [str(REPO / 'homeos-store' / 'backend' / 'src')]
sys.modules[_PKG] = _pkg
sys.path.insert(0, str(REPO / 'packages' / 'shared-py'))
config = importlib.import_module(f'{_PKG}.config')


class StoreEnvNumberTest(unittest.TestCase):
    def test_defaults(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('QA_TEST_ENV', None)
            self.assertEqual(config._env_int('QA_TEST_ENV', 7), 7)
            self.assertEqual(config._env_float('QA_TEST_ENV', 1.5), 1.5)

    def test_parse_and_bounds(self):
        with mock.patch.dict(os.environ, {'QA_TEST_ENV': '42'}):
            self.assertEqual(config._env_int('QA_TEST_ENV', 7), 42)
            self.assertEqual(config._env_int('QA_TEST_ENV', 7, minimum=40, maximum=42), 42)
        with mock.patch.dict(os.environ, {'QA_TEST_ENV': '2.5'}):
            self.assertEqual(config._env_float('QA_TEST_ENV', 1.5), 2.5)

    def test_errors_keep_messages(self):
        with (
            mock.patch.dict(os.environ, {'QA_TEST_ENV': 'abc'}),
            self.assertRaisesRegex(ValueError, r'环境变量 QA_TEST_ENV 需要整数，实际是 .abc.'),
        ):
            config._env_int('QA_TEST_ENV', 7)
        with (
            mock.patch.dict(os.environ, {'QA_TEST_ENV': 'abc'}),
            self.assertRaisesRegex(ValueError, r'环境变量 QA_TEST_ENV 需要数字，实际是 .abc.'),
        ):
            config._env_float('QA_TEST_ENV', 1.5)
        with (
            mock.patch.dict(os.environ, {'QA_TEST_ENV': '1'}),
            self.assertRaisesRegex(ValueError, '不能小于 5'),
        ):
            config._env_int('QA_TEST_ENV', 7, minimum=5)
        with (
            mock.patch.dict(os.environ, {'QA_TEST_ENV': '9'}),
            self.assertRaisesRegex(ValueError, '不能大于 8'),
        ):
            config._env_int('QA_TEST_ENV', 7, maximum=8)


if __name__ == '__main__':
    unittest.main(verbosity=2)
