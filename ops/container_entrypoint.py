from __future__ import annotations

import errno
import os
import pwd
import sys
from collections.abc import Mapping, MutableMapping, Sequence
from pathlib import Path

RUN_AS_USER = "homeos"


def sync_license_keys(environment: MutableMapping[str, str]) -> None:
    # [补充说明] 降权前先同步授权公钥，并把指纹注入环境变量。
    #
    # 顺序原因有二：镜像要写 keys/（需要写权限，降权后可能写不动）；指纹必须赶在主应用
    # 读配置之前进环境，否则它只会看到随包分发的旧指纹。
    #
    # 失败不阻断启动：公钥缺失 / 指纹不符由主应用的信任锚自检给出可定位的报错，
    # 在这里再拦一次只会把同一件事说两遍。
    try:
        from ops.license_keys import sync_store_keys
    except Exception as error:  # 打包遗漏 ops/license_keys.py 时不该连容器都起不来
        print(f"授权公钥：未加载同步模块（{error}），跳过。", file=sys.stderr, flush=True)
        return
    try:
        # 直接传主应用的 os.environ：同步函数就地把路径与指纹写进去，exec 后自然生效。
        sync_store_keys(environment=environment)
    except Exception as error:
        print(f"授权公钥：同步失败（{error}），交由主应用启动自检处理。", file=sys.stderr, flush=True)


def storage_directories(environment: Mapping[str, str]) -> tuple[Path, ...]:
    """需要校正属主的可写目录。
    """
    candidates: list[Path] = []

    if "APP_DATA_DIR" in environment:
        candidates.append(Path(environment["APP_DATA_DIR"]))
    elif "STORE_DATA_DIR" not in environment:
        candidates.append(Path("/data"))

    if "STORE_DATA_DIR" in environment:
        candidates.append(Path(environment["STORE_DATA_DIR"]))
    if "STORE_LICENSE_KEYS_DIR" in environment:
        candidates.append(Path(environment["STORE_LICENSE_KEYS_DIR"]))
    if "APP_CLIENT_KEYS_DIR" in environment:
        candidates.append(Path(environment["APP_CLIENT_KEYS_DIR"]))

    ha_credential_path = Path(environment.get("APP_HA_CREDENTIAL_FILE", "/run/secrets/ha_credentials.key"))
    display_pairing_path = Path(
        environment.get(
            "APP_DISPLAY_PAIRING_KEY_FILE",
            str(ha_credential_path.with_name("display_pairing_codes.key")),
        )
    )
    if "APP_DATA_DIR" in environment or "APP_HA_CREDENTIAL_FILE" in environment:
        candidates.extend(
            (
                ha_credential_path.parent,
                display_pairing_path.parent,
                Path(
                    environment.get(
                        "APP_LICENSE_CREDENTIAL_FILE",
                        "/run/secrets/license_credentials.key",
                    )
                ).parent,
            )
        )

    return tuple(dict.fromkeys(path.resolve() for path in candidates))


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
    for directory in storage_directories(environment):
        try:
            chown_tree_if_needed(directory, account.pw_uid, account.pw_gid)
            os.chmod(directory, 0o700)
        except OSError as error:
            # 只读挂载（例如主应用以 :ro 挂载的公钥卷）无法校正属主，这里出声而不是
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
    # 公钥同步必须排在降权之前：镜像要写 keys/，降权后就未必写得动了；
    # 指纹也要赶在主应用读配置之前进环境。
    sync_license_keys(os.environ)
    initialize_permissions(os.environ)
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
