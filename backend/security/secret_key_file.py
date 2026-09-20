"""落盘密钥文件的「读取或原子创建」。

两个加密模块都要做同一件事：把一把 Fernet 密钥写在 0600 的文件里，第一次使用时惰性生成，
多个进程同时首次启动时只能有一个写成功、其余读到赢家写的那份。``ha/crypto.py``（HA 长期
访问令牌）与 ``license/crypto.py``（落库凭证）原本各写一遍，而两者写法不同、都不完全正确 ——
所以抽到这里，只留一份。

要点只有四个，写错任何一个都会变成很难查的故障：

1. **权限**：目录 0700、文件 ``O_EXCL`` + 0600。``mkdir(mode=...)`` 对**已存在**的目录不生效，
   所以还要显式 ``chmod`` 一次（容器里挂载的卷很常见）。
2. **只对 ``FileExistsError`` 重试**：那是并发抢锁的输家，重读一次就能拿到赢家写好的密钥。
   其它 ``OSError`` 是永久失败（只读挂载、磁盘满、路径被目录占住……）。早期
   ``ha/crypto.py`` 写成 ``while True: … except OSError: continue``，只读挂载下会**不带 sleep
   地永久空转**，而调用方是 ``asyncio.to_thread``，空转会把线程池占满，表现为「HA 相关接口
   全部卡死」而不是能查到原因的报错。
3. **重试有上限与退避**：真实竞态只需两三次，但不能让它有机会变成死循环。
4. **每进程只读一次**：``load_or_create_secret_key`` 带缓存，第二次起直接回内存里那把钥。
   原先每个加解密都要走「mkdir + chmod + exists + read」四个系统调用，而加解密落在每个带会话
   Cookie 的请求上，于是每个请求都为一把永不改变的本机密钥付一遍磁盘往返。换密钥等于让既存
   密文全部解不开，属于换部署而不是运行期操作。**加载失败不进缓存** —— 文件损坏、目录不可写
   这些每次调用都要照原样报错，不能靠缓存把一次失败变成「以后都成功」。
"""
from __future__ import annotations

import os
import time
from collections.abc import Callable
from pathlib import Path
from threading import Lock

from cryptography.fernet import Fernet

#: 抢锁重试上限。真正的竞态只有「两个进程同时首次加密」这一种，赢家写完 44 字节
#: 是瞬时的；给上限是为了让任何意外都变成一条明确的报错，而不是挂死。
SECRET_KEY_CREATE_ATTEMPTS = 5
#: 每次重试之间的退避。极短：只是把时间片让给正在写文件的赢家。
SECRET_KEY_CREATE_RETRY_SECONDS = 0.05

#: 已加载的密钥：{路径: Fernet 密钥字节}，见模块开头第 4 条。
#: 锁只保护字典本身，文件 I/O 一律在锁外做 —— 首次加载可能要在重试之间等待，
#: 不该让另一个路径的加载排在它后面。
_loaded_secret_keys: dict[str, bytes] = {}
_loaded_secret_keys_lock = Lock()


def load_or_create_secret_key(
    path: Path,
    *,
    error_factory: Callable[[str], Exception],
    empty_message: str,
) -> bytes:
    """读取 ``path`` 里的 Fernet 密钥；不存在则原子创建后返回；**每进程只碰一次文件**。

    第一次调用（每个路径）真去碰文件系统，之后回缓存的字节。缓存的是密钥本身而不是「这个路径
    有效」—— 文件后来被删除或改坏都不影响已在使用的密钥，这正是想要的：密钥文件一旦存在就是
    这个部署的加密身份。加载失败不写缓存，因此损坏文件会稳定地每次报错。

    ``path`` 的父目录会按 0700 收紧；``error_factory`` 由调用方给出异常类型（两个模块各有自己的
    异常，但对外都要变成面向用户的配置/损坏提示）；``empty_message`` 是「文件存在但内容为空」的
    报错文案 —— 空文件一律视为**损坏**而不是「还没生成」，静默重新生成会让已落库的密文全部解不开。
    返回 Fernet 格式的密钥字节（末尾可能带一个换行，调用方自己 strip）。
    """
    cache_key = str(path)
    with _loaded_secret_keys_lock:
        cached = _loaded_secret_keys.get(cache_key)
    if cached is not None:
        return cached
    value = _read_or_create_secret_key(
        path, error_factory=error_factory, empty_message=empty_message
    )
    # 并发首次加载时两个线程可能各读了一遍（结果必然相同），先到者为准。
    with _loaded_secret_keys_lock:
        return _loaded_secret_keys.setdefault(cache_key, value)


def _read_or_create_secret_key(
    path: Path,
    *,
    error_factory: Callable[[str], Exception],
    empty_message: str,
) -> bytes:
    """真正去读/创建密钥文件的那一层：每次调用都碰文件系统（重试都在这里）。"""
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    except OSError as error:
        # 目录建不出来（只读挂载 / 磁盘满 / 路径被文件占住）—— 没有可用的落盘位置，
        # 这是永久失败，必须立刻抛错。
        raise error_factory(
            f'无法准备密钥目录 {path.parent}：{error.strerror or error}'
        ) from error
    try:
        # 已存在的目录不会因为上面的 mode 参数改权限（挂载卷很常见），所以再收紧一次。这一步**尽力而为**：
        # 目录属于我们时永远成功（默认数据目录、容器里 chown 给运行账号的 /run/secrets）；运维自己给的只读挂载
        # 不归我们管，不该因为收紧不了就整个服务起不来 —— 密钥文件本身的 0600 才是主防线。
        os.chmod(path.parent, 0o700)
    except OSError:
        pass

    for attempt in range(SECRET_KEY_CREATE_ATTEMPTS):
        try:
            if path.exists():
                value = path.read_bytes().strip()
                if not value:
                    raise error_factory(empty_message)
                return value
            key = Fernet.generate_key()
            # O_EXCL：创建即独占。两个进程各生成一份密钥的话，后写的那把会让
            # 先写的那把加密的历史数据再也解不开，所以这里必须是原子的。
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'wb') as key_file:
                # 末尾补换行便于人工 cat 查看；调用方读取时会 strip 掉。
                key_file.write(key + b'\n')
            return key
        except FileExistsError:
            # 并发首次启动的输家：赢家已经把文件创建出来了，重来一次就能读到。
            if attempt == SECRET_KEY_CREATE_ATTEMPTS - 1:
                raise error_factory(
                    f'密钥文件在并发创建中反复被抢占，放弃：{path}'
                ) from None
            time.sleep(SECRET_KEY_CREATE_RETRY_SECONDS)
        except OSError as error:
            raise error_factory(
                f'无法写入密钥文件 {path}：{error.strerror or error}'
            ) from error

    # 循环只可能以 return 或 raise 结束；这行是给静态检查看的兜底。
    raise error_factory(f'无法创建密钥文件 {path}。')
