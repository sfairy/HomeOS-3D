from __future__ import annotations

import errno
import os
import pwd
import shutil
import sys
from collections.abc import Mapping, MutableMapping, Sequence
from pathlib import Path

RUN_AS_USER = "homeos"

#: 镜像内置的默认 UI 素材（种子）。只读，随镜像升级而更新。
DEFAULT_ASSETS_DIR = "/app/assets-default"

#: 实例目录下需要保证「有内容」的子目录；与 ``spa_static._mount_replaceable_asset_dirs``
#: 挂载的四个前缀一一对应（``/icons``、``/backgrounds``、``/sounds``、``/logo``）。
ASSET_SUBDIRECTORIES = ("icons", "backgrounds", "sounds", "logo")


def _path_from(environment: Mapping[str, str], key: str, fallback: str) -> Path:
    value = (environment.get(key) or "").strip()
    return Path(value or fallback)


def sync_license_keys(environment: MutableMapping[str, str]) -> None:
    try:
        from ops.license_keys import sync_store_keys
    except Exception as error:
        print(f"授权公钥：未加载同步模块（{error}），跳过。", file=sys.stderr, flush=True)
        return
    try:
        sync_store_keys(environment=dict(environment))
    except Exception as error:
        print(f"授权公钥：同步失败（{error}），交由主应用启动自检处理。", file=sys.stderr, flush=True)


def _app_data_dir(environment: Mapping[str, str]) -> str | None:
    """主应用数据目录（``HOMEOS_DATA_DIR``）。"""
    value = (environment.get("HOMEOS_DATA_DIR") or "").strip()
    return value or None


def storage_directories(environment: Mapping[str, str]) -> tuple[Path, ...]:
    """需要校正属主的可写目录。
    """
    candidates: list[Path] = []

    app_data_dir = _app_data_dir(environment)
    if app_data_dir is not None:
        candidates.append(Path(app_data_dir))
    elif "STORE_DATA_DIR" not in environment:
        candidates.append(Path("/data"))

    # 备份包目录（``HOMEOS_BACKUPS_DIR``）必须**单独**校正属主，不能指望上面那轮的递归。
    # compose 把宿主机的 ``./backups`` bind mount 到 ``/data/backups``：bind mount 不继承
    # 镜像里 ``chown homeos:homeos /data`` 的属主，宿主目录通常是 root 755 —— 而进程随后
    # 以 uid 1000 运行，备份写入会直接 EACCES。另外上面那轮的 ``chown_tree_if_needed`` 在
    # ``/data`` 属主已经正确时会**提前返回**，根本不会走到这个子目录。
    backups_dir = (environment.get("HOMEOS_BACKUPS_DIR") or "").strip()
    if backups_dir:
        candidates.append(Path(backups_dir))

    if "STORE_DATA_DIR" in environment:
        candidates.append(Path(environment["STORE_DATA_DIR"]))
    if "STORE_LICENSE_KEYS_DIR" in environment:
        candidates.append(Path(environment["STORE_LICENSE_KEYS_DIR"]))
    if "APP_CLIENT_KEYS_DIR" in environment:
        candidates.append(Path(environment["APP_CLIENT_KEYS_DIR"]))

    ha_credential_path = Path(environment.get("APP_HA_CREDENTIAL_FILE", "/run/secrets/ha_credentials.key"))
    if app_data_dir is not None or "APP_HA_CREDENTIAL_FILE" in environment:
        candidates.extend(
            (
                ha_credential_path.parent,
                Path(
                    environment.get(
                        "APP_LICENSE_CREDENTIAL_FILE",
                        "/run/secrets/license_credentials.key",
                    )
                ).parent,
            )
        )

    return tuple(dict.fromkeys(path.resolve() for path in candidates))


def seed_default_assets(
    environment: Mapping[str, str],
    user_name: str = RUN_AS_USER,
) -> None:
    """首次启动把镜像内置素材铺进实例目录（通常是宿主机 ``./assets`` 的 bind mount）。

    bind mount 会整个遮住镜像里的 ``/app/assets``，所以宿主目录为空时所有默认素材都会
    404 —— 连带 ``sw.js`` 的 ``cache.addAll(['/logo/logo.svg', …])`` 失败、SW 装不上。

    语义边界（这一条比「补齐」更重要）：
    - **只补空目录**：某个子目录已有任何内容，就整棵视为管理员自己的素材，一个文件都不动；
    - 因此替换 / 删除单个文件后重启容器**不会**复活默认文件；
    - 把某个子目录清空 = 恢复该子目录的出厂默认（下一次启动重新铺满）。

    以一个子目录为单位而不是逐文件补齐，正是为了让「用户删掉的素材」不会被悄悄塞回来；
    真要在 UI 里隐藏默认素材，走 ``.hidden-assets.json`` 标记，而不是改这个只读层。
    """
    target = _path_from(environment, "HOMEOS_ASSETS_DIR", "/app/assets")
    source = _path_from(environment, "HOMEOS_ASSETS_DEFAULT_DIR", DEFAULT_ASSETS_DIR)
    if not source.is_dir():
        # 构建期没进镜像（老镜像 / 自定义构建）：没有种子可铺，保持原样。
        return
    try:
        if target.resolve() == source.resolve():
            return
    except OSError:
        return

    seeded: list[Path] = []
    try:
        target.mkdir(parents=True, exist_ok=True)
        for name in ASSET_SUBDIRECTORIES:
            source_dir = source / name
            if not source_dir.is_dir():
                continue
            destination = target / name
            # 已有内容 = 管理员自己的素材，不覆盖（见 docstring 的语义边界）。
            if destination.is_dir() and any(destination.iterdir()):
                continue
            shutil.copytree(source_dir, destination, dirs_exist_ok=True)
            seeded.append(destination)
    except OSError as error:
        print(
            f"警告：默认素材未能铺到 {target}（{error.strerror or error}）。"
            "该目录若是只读挂载，请清空后重试或改由宿主机自行放置素材。",
            file=sys.stderr,
            flush=True,
        )
        return

    if not seeded:
        return

    print(
        f"默认素材：已铺入 {target}（{', '.join(path.name for path in seeded)}）",
        file=sys.stderr,
        flush=True,
    )
    # 拷贝是 root 做的，宿主目录里的文件会变成 root 所有 —— 改成运行用户（通常是 uid 1000），
    # 这样宿主上的管理员能直接编辑 / 替换。**只改刚铺的那几个子树与根目录本身**，
    # 不递归用户已有内容：现场换过的文件（属主可能是别的 uid）不该被顺手改掉。
    # 跨文件系统（macOS virtiofs、NFS）可能不支持 chown，那时文件仍是 644/755，
    # 容器读得到，只是宿主侧要 sudo，故只告警不失败。
    try:
        account = pwd.getpwnam(user_name)
        os.chown(target, account.pw_uid, account.pw_gid)
        for destination in seeded:
            chown_tree_if_needed(destination, account.pw_uid, account.pw_gid)
    except (KeyError, OSError) as error:
        print(
            f"警告：默认素材已铺好，但属主未能改为 {user_name}（{error}）。"
            "宿主上编辑这些文件可能需要 sudo。",
            file=sys.stderr,
            flush=True,
        )


def chown_tree_if_needed(root: Path, uid: int, gid: int) -> None:
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root_stat = root.stat()
    if root_stat.st_uid == uid and root_stat.st_gid == gid:
        return

    for current, directory_names, file_names in os.walk(root, followlinks=False):
        current_path = Path(current)
        os.chown(current_path, uid, gid)
        for name in (*directory_names, *file_names):
            os.chown(current_path / name, uid, gid, follow_symlinks=False)


def initialize_permissions(
    environment: MutableMapping[str, str],
    user_name: str = RUN_AS_USER,
) -> None:
    if os.geteuid() != 0:
        return

    account = pwd.getpwnam(user_name)
    # 备份目录只校正属主，**不**收紧成 0700：它常常是宿主机 bind mount 进来看的目录
    # （compose 的 ``./backups``），宿主上的管理员账号（uid 往往不是 1000）需要能读走
    # 备份包。目录保持原模式（Docker 新建时是 0755），数据目录自身仍然收紧为 0700。
    backups = (environment.get("HOMEOS_BACKUPS_DIR") or "").strip()
    backups_path = Path(backups).resolve() if backups else None
    for directory in storage_directories(environment):
        try:
            chown_tree_if_needed(directory, account.pw_uid, account.pw_gid)
            if directory != backups_path:
                os.chmod(directory, 0o700)
        except OSError as error:
            if error.errno in {errno.EROFS, errno.EACCES, errno.EPERM}:
                print(
                    f'警告：无法校正 {directory} 的属主（{error.strerror}）。'
                    f'该目录若是跨机器拷入的，请确认 uid {account.pw_uid} 可读'
                    '（文件 644、目录 755）。',
                    file=sys.stderr,
                    flush=True,
                )
                continue
            raise

    os.initgroups(user_name, account.pw_gid)
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)
    environment["HOME"] = account.pw_dir


def main(arguments: Sequence[str] | None = None) -> None:
    command = list(arguments if arguments is not None else sys.argv[1:])
    if not command:
        raise SystemExit("HomeOS container command is missing.")
    sync_license_keys(os.environ)
    # 必须在 initialize_permissions 之前：它末尾会 setuid 降权，之后就没法在 bind mount
    # 里建目录 / 改属主了。
    seed_default_assets(os.environ)
    initialize_permissions(os.environ)
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
