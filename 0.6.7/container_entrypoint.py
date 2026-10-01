from __future__ import annotations

import os
import pwd
import sys
from pathlib import Path
from typing import Mapping, MutableMapping, Sequence


RUN_AS_USER = "ha-bridge"


def storage_directories(environment: Mapping[str, str]) -> tuple[Path, ...]:
    ha_credential_path = Path(environment.get("APP_HA_CREDENTIAL_FILE", "/run/secrets/ha_credentials.key"))
    display_pairing_path = Path(
        environment.get(
            "APP_DISPLAY_PAIRING_KEY_FILE",
            str(ha_credential_path.with_name("display_pairing_codes.key")),
        )
    )
    candidates = (
        Path(environment.get("APP_DATA_DIR", "/data")),
        ha_credential_path.parent,
        display_pairing_path.parent,
        Path(
            environment.get(
                "APP_LICENSE_CREDENTIAL_FILE",
                "/run/secrets/license_credentials.key",
            )
        ).parent,
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
        chown_tree_if_needed(directory, account.pw_uid, account.pw_gid)
        os.chmod(directory, 0o700)

    os.initgroups(user_name, account.pw_gid)
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)
    environment["HOME"] = account.pw_dir


def main(arguments: Sequence[str] | None = None) -> None:
    command = list(arguments if arguments is not None else sys.argv[1:])
    if not command:
        raise SystemExit("HA Bridge container command is missing.")
    initialize_permissions(os.environ)
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
