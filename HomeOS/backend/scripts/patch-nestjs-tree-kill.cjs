/**
 * Nest CLI 的 treeKillSync 在 Windows 上通过 execSync 调用 `taskkill`，
 * 但没有处理 "process not found"（退出码 128）的情况。这会导致 watch 重载时
 * 整个 start:dev 崩溃。
 *
 * 在 nest start --watch 之前应用此幂等补丁。
 */
const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(
  __dirname,
  '../../node_modules/@nestjs/cli/lib/utils/tree-kill.js',
);

const MARKER = '/* homeos:tree-kill-win32-esrch */';

const PATCHED = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.treeKillSync = treeKillSync;
const child_process_1 = require("child_process");
function treeKillSync(pid, signal) {
    if (process.platform === 'win32') {
        ${MARKER}
        try {
            (0, child_process_1.execSync)('taskkill /pid ' + pid + ' /T /F', {
                stdio: 'ignore',
            });
        }
        catch (err) {
            const status = err && typeof err.status === 'number' ? err.status : null;
            const detail = String((err && (err.stderr || err.message)) || err);
            // 128 / "not found"：子进程在 watch 重载期间已退出
            if (status !== 128 && !/not found/i.test(detail)) {
                throw err;
            }
        }
        return;
    }
    const childs = getAllChilds(pid);
    childs.forEach(function (pid) {
        killPid(pid, signal);
    });
    killPid(pid, signal);
    return;
}
function getAllPid() {
    const result = (0, child_process_1.spawnSync)('ps', ['-A', '-o', 'pid,ppid'], {
        encoding: 'utf-8',
        stdio: 'pipe',
    });
    if (result.error || !result.stdout) {
        return [];
    }
    const rows = result.stdout.trim().split('\\n').slice(1);
    return rows
        .map(function (row) {
        const parts = row.match(/\\s*(\\d+)\\s*(\\d+)/);
        if (parts === null) {
            return null;
        }
        return {
            pid: Number(parts[1]),
            ppid: Number(parts[2]),
        };
    })
        .filter((input) => {
        return input != null;
    });
}
function getAllChilds(pid) {
    const allpid = getAllPid();
    const ppidHash = {};
    const result = [];
    allpid.forEach(function (item) {
        ppidHash[item.ppid] = ppidHash[item.ppid] || [];
        ppidHash[item.ppid].push(item.pid);
    });
    const find = function (pid) {
        ppidHash[pid] = ppidHash[pid] || [];
        ppidHash[pid].forEach(function (childPid) {
            result.push(childPid);
            find(childPid);
        });
    };
    find(pid);
    return result;
}
function killPid(pid, signal) {
    try {
        process.kill(pid, signal);
    }
    catch (err) {
        if (err.code !== 'ESRCH') {
            throw err;
        }
    }
}
`;

if (!fs.existsSync(TARGET)) {
  const msg =
    '[patch-nestjs-tree-kill] @nestjs/cli tree-kill.js not found — run bun install';
  if (process.platform === 'win32') {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`${msg}; skipping on non-Windows`);
  process.exit(0);
}

const current = fs.readFileSync(TARGET, 'utf8');
if (current.includes(MARKER)) {
  process.exit(0);
}

fs.writeFileSync(TARGET, PATCHED, 'utf8');
console.log('[patch-nestjs-tree-kill] patched Windows taskkill ESRCH handling');
