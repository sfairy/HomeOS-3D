from __future__ import annotations

import errno
import os
import pwd
import sys
from pathlib import Path
from typing import Mapping, MutableMapping, Sequence


RUN_AS_USER = "homeos"


def storage_directories(environment: Mapping[str, str]) -> tuple[Path, ...]:
    """需要校正属主的可写目录。

    只纳入环境里显式给出的路径，避免商店镜像误建主应用目录、反之亦然。
    未设置 ``APP_DATA_DIR`` / ``STORE_DATA_DIR`` 时仍回落到各自默认值，兼容旧启动方式。
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
            # 只读挂载（例如主应用以 :ro 挂载的公钥卷）跳过属主校正。
            if error.errno in {errno.EROFS, errno.EACCES, errno.EPERM}:
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
    initialize_permissions(os.environ)
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
