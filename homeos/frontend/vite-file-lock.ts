/** 构建 / 发布用的跨进程文件锁（vite.config.ts 专用）。 */
import fs from 'node:fs'
import { dirname } from 'node:path'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 锁文件的父目录可能还不存在：``dist/`` 被 gitignore，干净检出（CI、全新 clone）里没有
 * ``dist/homeos/``，此时 ``openSync(lock, 'wx')`` 抛的是 **ENOENT** 而不是 **EEXIST**，
 * 两个锁函数都把它当「意外错误」重新抛出，构建直接失败。
 *
 * 这个坑只在干净检出上出现（本地通常已有历史 ``dist/`` 兜着），所以是「本地绿、CI 红」：
 * 2026-10-10 的 Docker #14 就栽在这里，且因为 ``dist/`` 是首次构建，四个架构全挂。
 */
export function ensureLockParent(lockPath: string): void {
  fs.mkdirSync(dirname(lockPath), { recursive: true })
}

/**
 * 持有者被 kill（watch-build 重启、Ctrl-C）时 finally 不会跑，锁文件会永久残留。
 * 锁里记 pid：持有者已死即可回收；空文件（旧格式或刚 open 还没写 pid）超过 10s 也回收。
 */
function reclaimDeadLock(lockPath: string): void {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8').trim()
    if (raw) {
      if (!pidAlive(Number(raw))) fs.unlinkSync(lockPath)
    } else if (Date.now() - fs.statSync(lockPath).mtimeMs > 10_000) {
      fs.unlinkSync(lockPath)
    }
  } catch {
    /* 读/删失败则继续等 */
  }
}

/** 跨进程互斥：`wx` 创建锁文件，持有期间执行 fn（或 await 异步 fn）。 */
export async function withFileLock(lockPath: string, fn: () => void | Promise<void>): Promise<void> {
  const deadline = Date.now() + 180_000
  ensureLockParent(lockPath)
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx')
      try {
        fs.writeSync(fd, `${process.pid}\n`)
      } catch {
        /* 锁文件有 fd 即可 */
      }
      try {
        await fn()
      } finally {
        fs.closeSync(fd)
        try {
          fs.unlinkSync(lockPath)
        } catch {
          /* ignore */
        }
      }
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw err
      reclaimDeadLock(lockPath)
      if (Date.now() > deadline) {
        throw new Error(`等待锁超时：${lockPath}（可能有崩溃残留，删掉后重试）`)
      }
      await sleep(50)
    }
  }
}

export function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
