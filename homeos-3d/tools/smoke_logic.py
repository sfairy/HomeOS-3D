#!/usr/bin/env python3
"""对 HomeOS 后端做进程内逻辑回归冒烟：纯函数、模型元数据、限流器状态机。

用法（解释器用仓库根的 .venv-store，见 ops/start.py 的 VENV_DIR）：
    cd homeos-3d && ../.venv-store/bin/python tools/smoke_logic.py

为什么还需要它：tools/smoke_pages.py 起整个 ASGI 应用，验证的是「路由 / 静态资源 / 生命周期」
这条线能不能跑通；它测不到纯逻辑分支 —— 比如一个 ZIP 里塞两个同名条目、限流器封禁到期后
还要不要再攒够一次失败次数、配对码删除时该 SET NULL 还是级联删设备。这些缺陷不用起服务
就能复现，却最容易被后续重构悄悄改回去，所以单独用这个脚本把语义钉死。

与 smoke_pages.py 的分工：
- 不起 ASGI 应用、不连数据库、不联网、不起后台进程：只在进程内 import 被测模块后直接调函数。
- 只读元数据、只在 tempfile 里造文件，不碰 data/ 下的真实数据，秒级跑完。
- 每个检查一行 OK/FAIL，失败时打印期望与实际；有失败就非零退出，可直接当门禁。

口径说明（任务书与真实代码不一致时以真实代码为准，差异见交付报告）：
- _decode_document_json 对空串 / None 返回的是空 dict 而不是 None，出自 studio3d.py:90 的
  「json.loads(raw) if raw else {}」；调用方 studio3d.py:321 依赖这个口径，故这里按真实代码断言。
- viewer_user_asset_ids 只在「主体没有绑定项目」时返回 None；把内部收集函数换成返回 None 的
  桩会抛 TypeError（没有 None 兜底），这一条按「测不到则不测」处理，写在报告里而不是脚本里。

检查范围只允许读，不允许改产品代码：任何一条发现产品代码有问题，先看是不是这里预期写错了，
确属产品问题的记进报告，不在这里顺手改。
"""
from __future__ import annotations

import inspect
import os
import sys
import tempfile
import time
import warnings
import zipfile
from pathlib import Path

# 脚本自身在 homeos-3d/tools/ 下：把 homeos-3d 加到 sys.path，顶层包名才是 backend.src。
ROOT = Path(__file__).resolve().parents[1]

PNG_MAGIC = b'\x89PNG\r\n\x1a\n'

failures: list[str] = []
checks = 0


def expect(condition: bool, message: str) -> None:
    """把「不满足就结束这个检查」写成一句话，失败信息里同时给出期望与实际。"""
    if not condition:
        raise AssertionError(message)


def check(name: str, fn) -> None:
    """跑一个检查：成功一行 OK，失败一行 FAIL 加一行期望/实际。"""
    global checks
    checks += 1
    try:
        fn()
    except Exception as error:  # noqa: BLE001 —— 任何异常都算这条检查失败，不该中断整个冒烟
        detail = str(error) if isinstance(error, AssertionError) else f'{type(error).__name__}: {error}'
        failures.append(f'{name} -> {detail}')
        print(f'  FAIL {name}')
        print(f'       期望/实际：{detail}')
        return
    print(f'  OK   {name}')


def prepare_import_root() -> None:
    """在 import 后端之前把数据目录指到临时目录。

    config 在 import 期就会从 APP_DATA_DIR 推导路径；晚一步设置，import 链就可能写到真实
    data/ 下。这里只是防御 —— 本脚本不会真正落盘业务数据。
    """
    os.environ.setdefault('APP_DATA_DIR', tempfile.mkdtemp(prefix='homeos-logic-'))
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# 1) studio3d._decode_document_json：宽松解析的退化口径
# ---------------------------------------------------------------------------

def check_decode_document_json_valid_and_broken() -> None:
    from backend.src.api.studio3d import _decode_document_json

    expect(_decode_document_json('{"name": "x", "n": 1}') == {'name': 'x', 'n': 1},
           f'合法 JSON 对象应得到 dict，实际 {_decode_document_json(chr(123) + chr(34) + "n" + chr(34) + ": 1}")!r}')
    expect(_decode_document_json('{') is None, f'损坏 JSON 左花括号应得到 None，实际 {_decode_document_json("{")!r}')
    expect(_decode_document_json(b'{') is None, f'损坏 bytes JSON 应得到 None，实际 {_decode_document_json(b"{")!r}')
    expect(_decode_document_json('[1, 2]') is None, f'数组应得到 None，实际 {_decode_document_json("[1, 2]")!r}')
    expect(_decode_document_json('3') is None, f'纯数字应得到 None，实际 {_decode_document_json("3")!r}')
    expect(_decode_document_json('null') is None, f'null 应得到 None，实际 {_decode_document_json("null")!r}')


def check_decode_document_json_empty_fallback() -> None:
    # 任务书说「空串与 None 得到 None」，真实代码（studio3d.py:90）走的是 json.loads(raw) if raw else {}
    # 分支 —— 空串 / None 被判为「没有文档」，退化成空 dict 而不是解析失败。
    # 调用方 studio3d.py:321 正是靠这个口径把 saved 保持成 dict，所以这里锁定真实语义。
    from backend.src.api.studio3d import _decode_document_json

    expect(_decode_document_json('') == {}, f'空串应退化成空 dict，实际 {_decode_document_json("")!r}')
    expect(_decode_document_json(None) == {}, f'None 应退化成空 dict，实际 {_decode_document_json(None)!r}')
    expect(_decode_document_json(b'') == {}, f'空 bytes 应退化成空 dict，实际 {_decode_document_json(b"")!r}')


# ---------------------------------------------------------------------------
# 2) studio3d._validate_archive：导出 ZIP 的结构校验
# ---------------------------------------------------------------------------

def _write_zip(path: Path, entries: list[tuple[str, bytes]]) -> None:
    # 同名条目要写两次，zipfile 会发一条 Duplicate name 的 UserWarning —— 那是被测场景本身，
    # 不该污染冒烟输出，这里就地静音。
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        with zipfile.ZipFile(path, 'w') as archive:
            for name, data in entries:
                archive.writestr(name, data)


def _validate(path: Path):
    from backend.src.api.studio3d import _validate_archive

    return _validate_archive(path)


def check_archive_duplicate_entries_rejected() -> None:
    from fastapi import HTTPException

    with tempfile.TemporaryDirectory(prefix='homeos-logic-zip-') as directory:
        archive_path = Path(directory) / 'duplicate.zip'
        payload = PNG_MAGIC + b'\x00' * 8
        _write_zip(archive_path, [('a.png', payload), ('a.png', payload)])
        try:
            _validate(archive_path)
        except HTTPException as error:
            expect(error.status_code == 422,
                   f'重名条目应返回 422，实际 status_code={error.status_code}, detail={error.detail!r}')
            expect(error.detail == '导出包包含重名文件。',
                   f'重名条目 detail 应为「导出包包含重名文件。」，实际 {error.detail!r}')
        else:
            raise AssertionError('重名条目应抛 HTTPException(422)，实际未抛')


def check_archive_valid_package_accepted() -> None:
    with tempfile.TemporaryDirectory(prefix='homeos-logic-zip-') as directory:
        archive_path = Path(directory) / 'valid.zip'
        _write_zip(archive_path, [('a.png', PNG_MAGIC + b'\x00' * 8), ('b.json', b'{}')])
        entries = _validate(archive_path)
        names = sorted(entry.filename for entry in entries)
        expect(len(entries) == 2, f'合法包应返回 2 个条目，实际 {len(entries)} 个：{names}')
        expect(names == ['a.png', 'b.json'], f'合法包条目名应为 [a.png, b.json]，实际 {names}')


def check_archive_nested_path_rejected() -> None:
    from fastapi import HTTPException

    with tempfile.TemporaryDirectory(prefix='homeos-logic-zip-') as directory:
        archive_path = Path(directory) / 'nested.zip'
        _write_zip(archive_path, [('目录/图片.png', PNG_MAGIC + b'\x00' * 8)])
        try:
            _validate(archive_path)
        except HTTPException as error:
            expect(400 <= error.status_code < 500,
                   f'多层级路径应返回 4xx，实际 status_code={error.status_code}, detail={error.detail!r}')
        else:
            raise AssertionError('多层级路径应抛 HTTPException(4xx)，实际未抛')


def check_archive_bad_extension_rejected() -> None:
    from fastapi import HTTPException

    with tempfile.TemporaryDirectory(prefix='homeos-logic-zip-') as directory:
        archive_path = Path(directory) / 'bad-extension.zip'
        _write_zip(archive_path, [('c.txt', b'hello')])
        try:
            _validate(archive_path)
        except HTTPException as error:
            expect(400 <= error.status_code < 500,
                   f'非法扩展名应返回 4xx，实际 status_code={error.status_code}, detail={error.detail!r}')
        else:
            raise AssertionError('非法扩展名应抛 HTTPException(4xx)，实际未抛')


# ---------------------------------------------------------------------------
# 3) auth_limiter.LoginAttemptLimiter：封禁到期后不再白送整轮失败预算
# ---------------------------------------------------------------------------

def check_limiter_blocks_after_max_failures() -> None:
    from backend.src.auth_limiter import LoginAttemptLimiter

    limiter = LoginAttemptLimiter(max_failures=5, window_seconds=300, block_seconds=600)
    key = 'smoke-user'
    expect(limiter.blocked(key) is False, '未失败时不应处于封禁态')
    expect(limiter.retry_after(key) == 0, f'未封禁时 retry_after 应为 0，实际 {limiter.retry_after(key)!r}')
    for _ in range(5):
        limiter.record_failure(key)
    expect(limiter.blocked(key) is True, '连续 5 次失败后应处于封禁态')
    expect(limiter.retry_after(key) > 0, f'封禁中 retry_after 应大于 0，实际 {limiter.retry_after(key)!r}')


def check_limiter_keeps_failure_timestamps_across_block() -> None:
    """关键回归：封禁到期时不清空失败时间戳，再失败一次必须立刻重新封禁。

    参数必须满足 window_seconds > block_seconds —— 窗口比封禁还短的话，失败时间戳会在封禁
    到期前自然过期，这条差别就测不出来了。任务书举例的 0.2 / 0.3 恰好反了，这里改成 5.0 / 0.2。
    """
    from backend.src.auth_limiter import LoginAttemptLimiter

    limiter = LoginAttemptLimiter(max_failures=2, window_seconds=5.0, block_seconds=0.2)
    key = 'smoke-regression'
    limiter.record_failure(key)
    limiter.record_failure(key)
    expect(limiter.blocked(key) is True, '2 次失败（max_failures=2）后应立刻封禁')

    time.sleep(0.35)
    expect(limiter.blocked(key) is False, 'block_seconds=0.2 到期后不应再处于封禁态')

    # 旧实现（封禁时 failures.clear()）到这里失败记录已被清空，这一次失败只是 1/2，
    # 不会重新封禁；新实现保留时间戳，这一次失败就把窗口撑满，立刻再次封禁。
    limiter.record_failure(key)
    expect(limiter.blocked(key) is True,
           '封禁到期后再失败一次应立刻重新封禁（失败时间戳被清空会导致这里为 False）')


# ---------------------------------------------------------------------------
# 4) api.assets：上传体积上限
# ---------------------------------------------------------------------------

def check_upload_byte_limits() -> None:
    from backend.src.api import assets

    expect(assets.MAX_UPLOAD_BYTES == 20 * 1024 * 1024,
           f'MAX_UPLOAD_BYTES 应为 {20 * 1024 * 1024}，实际 {assets.MAX_UPLOAD_BYTES!r}')
    expect(assets.MAX_UPLOAD_SVG_BYTES == 5000000,
           f'MAX_UPLOAD_SVG_BYTES 应保持 5000000，实际 {assets.MAX_UPLOAD_SVG_BYTES!r}')


# ---------------------------------------------------------------------------
# 5) 响应模型与线程池约定
# ---------------------------------------------------------------------------

def check_setup_status_schema_has_no_version() -> None:
    from backend.src.schemas import SetupStatusResponse

    fields = set(SetupStatusResponse.model_fields)
    expect('version' not in fields, f'SetupStatusResponse 不应再有 version 字段，实际字段 {sorted(fields)}')
    expect(fields == {'initialized'}, f'SetupStatusResponse 字段应只有 initialized，实际 {sorted(fields)}')


def check_export_handler_is_async_and_store_is_sync() -> None:
    from backend.src.api import studio3d

    expect(hasattr(studio3d, '_store_export_package'), '_store_export_package 应存在（被 run_in_threadpool 调用）')
    expect(not inspect.iscoroutinefunction(studio3d._store_export_package),
           '_store_export_package 应保持同步函数（丢进线程池执行），实际是协程函数')
    expect(inspect.iscoroutinefunction(studio3d.save_studio3d_export),
           'save_studio3d_export 应是异步路由处理函数，实际不是')


# ---------------------------------------------------------------------------
# 6) models：唯一约束与「配对码删除只解绑设备」的外键语义
# ---------------------------------------------------------------------------

def check_project_name_unique() -> None:
    from backend.src.models import Project

    unique = Project.__table__.c.name.unique
    expect(bool(unique) is True, f'projects.name 应带唯一约束，实际 unique={unique!r}')


def check_display_device_pairing_fk_set_null() -> None:
    from backend.src.models import DisplayDevice

    column = DisplayDevice.__table__.c.pairing_code_id
    ondeletes = {foreign_key.ondelete for foreign_key in column.foreign_keys}
    expect('SET NULL' in ondeletes,
           f'display_devices.pairing_code_id 外键 ondelete 应为 SET NULL，实际 {sorted(str(item) for item in ondeletes)}')


def check_pairing_relationship_cascades() -> None:
    from backend.src.models import DisplayDevice, DisplayPairingCode

    for label, relation in (
        ('DisplayDevice.pairing_code', DisplayDevice.pairing_code),
        ('DisplayPairingCode.device', DisplayPairingCode.device),
    ):
        cascade = relation.property.cascade
        expect('delete-orphan' not in str(cascade),
               f'{label} 的 cascade 不应含 delete-orphan（删配对码只能解绑设备），实际 cascade={cascade!r}')


# ---------------------------------------------------------------------------
# 7) dependencies.viewer_user_asset_ids：可复用前缀 + 不受限时返回 None
# ---------------------------------------------------------------------------

# 桩集合里三种前缀都有：user: 走默认，studio3d: 走调用方自定义，other: 两边都不该收。
STUB_BOUND_VALUES = ('user:a', 'studio3d:f/n', 'other:x')


class _StubViewer:
    """只用到 project_id / project_ids 两个属性，避免为了取一份文档去建真设备行。"""

    project_id = 'project-1'
    project_ids = frozenset({'project-1'})


class _StubDatabase:
    """_display_document 会对每个绑定项目取草稿；这里一律没有草稿，文档退化成空。"""

    def get(self, model, key):
        return None


def check_viewer_user_asset_ids_signature() -> None:
    from backend.src import dependencies

    parameters = inspect.signature(dependencies.viewer_user_asset_ids).parameters
    expect('prefixes' in parameters,
           f'viewer_user_asset_ids 应有 prefixes 形参，实际形参 {list(parameters)}')
    expect(parameters['prefixes'].default == ('user:',),
           f'prefixes 默认值应为 (\'user:\',)，实际 {parameters["prefixes"].default!r}')


def check_viewer_user_asset_ids_prefix_filter() -> None:
    from backend.src import dependencies

    original = dependencies._document_bound_values
    dependencies._document_bound_values = lambda value, suffix: set(STUB_BOUND_VALUES)
    try:
        scoped = dependencies.viewer_user_asset_ids(_StubDatabase(), _StubViewer(), prefixes=('studio3d:',))
        expect(scoped == {'f/n'}, f'prefixes=(\'studio3d:\',) 应得到 {{"f/n"}}，实际 {scoped!r}')
        default = dependencies.viewer_user_asset_ids(_StubDatabase(), _StubViewer())
        expect(default == {'a'}, f'默认 prefixes 应得到 {{"a"}}，实际 {default!r}')
    finally:
        dependencies._document_bound_values = original


def check_viewer_user_asset_ids_unrestricted() -> None:
    from backend.src import dependencies

    # 管理员会话（没有 display）=> project_id 为 None => 不受限，返回 None 而不是空集合。
    unrestricted = dependencies.viewer_user_asset_ids(_StubDatabase(), dependencies.ViewerPrincipal())
    expect(unrestricted is None, f'无绑定项目的主体应得到 None（不受限），实际 {unrestricted!r}')


def main() -> int:
    prepare_import_root()
    print('逻辑回归冒烟（进程内，不起应用）。\n')

    print('studio3d._decode_document_json：')
    check('_decode_document_json 合法对象 / 损坏 / 非对象', check_decode_document_json_valid_and_broken)
    check('_decode_document_json 空串与 None 退化成空对象', check_decode_document_json_empty_fallback)

    print('studio3d._validate_archive：')
    check('_validate_archive 重名条目被拒（422 / 导出包包含重名文件。）', check_archive_duplicate_entries_rejected)
    check('_validate_archive 合法包通过且条目数正确', check_archive_valid_package_accepted)
    check('_validate_archive 多层级路径被拒（4xx）', check_archive_nested_path_rejected)
    check('_validate_archive 非法扩展名被拒（4xx）', check_archive_bad_extension_rejected)

    print('auth_limiter.LoginAttemptLimiter：')
    check('LoginAttemptLimiter 连续失败后封禁且 retry_after > 0', check_limiter_blocks_after_max_failures)
    check('LoginAttemptLimiter 封禁到期后再失败一次立刻重新封禁', check_limiter_keeps_failure_timestamps_across_block)

    print('api.assets / schemas / 线程池约定：')
    check('assets.MAX_UPLOAD_BYTES == 20MB 且 MAX_UPLOAD_SVG_BYTES == 5000000', check_upload_byte_limits)
    check('SetupStatusResponse 字段集里没有 version', check_setup_status_schema_has_no_version)
    check('save_studio3d_export 异步 / _store_export_package 同步', check_export_handler_is_async_and_store_is_sync)

    print('models：')
    check('projects.name 带唯一约束', check_project_name_unique)
    check('display_devices.pairing_code_id 外键 ondelete == SET NULL', check_display_device_pairing_fk_set_null)
    check('配对码-设备 relationship 不含 delete-orphan', check_pairing_relationship_cascades)

    print('dependencies.viewer_user_asset_ids：')
    check('viewer_user_asset_ids 有 prefixes 形参且默认 (\'user:\',)', check_viewer_user_asset_ids_signature)
    check('viewer_user_asset_ids 按前缀过滤并去前缀', check_viewer_user_asset_ids_prefix_filter)
    check('viewer_user_asset_ids 无绑定项目时返回 None', check_viewer_user_asset_ids_unrestricted)

    if failures:
        print(f'\n逻辑回归冒烟失败，共 {len(failures)} 条：')
        for item in failures:
            print(f'  - {item}')
        return 1
    print(f'\n逻辑回归冒烟通过（{checks} 项检查）。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
