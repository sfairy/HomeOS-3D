/**
 * C5 —— 历史栈（undo / redo）。
 *
 * 只记录文档补丁 `DocumentPatch`（add / remove / update / move），每条 `HistoryEntry` 都是
 * 「一次用户操作 → 一个补丁 + 其精确逆补丁」，因此：
 * - 多选删除 = 一个含多条 entries 的 remove 补丁；拖拽 = 一个含多条 moves 的 move 补丁，
 *   天然是**一个 transaction**，撤销一次全部回退；
 * - 选择、相机视角、切楼层不产生 DocumentPatch，因此永远不会入栈；
 * - 撤销前先 `canApply` 预检（例如合并墙保护导致的不可逆状态），预检失败**不出栈**；
 *   出栈后应用失败则把条目压回原栈并回调 `onApplyFailure` 提示用户；
 * - 双容量上限：条数 + 字节数（默认 40 条 / 32MB），超限从最旧条目开始丢弃。
 */

import type { DocumentPatch } from "./document-store";
import { invertDocumentPatch } from "./document-store";

interface HistoryEntry {
  patch: DocumentPatch;
  inverse: DocumentPatch;
  label: string;
  at: number;
}

interface HistoryStoreOptions {
  /** 应用补丁（就地改文档），返回是否成功。 */
  apply: (patch: DocumentPatch) => boolean;
  /** 应用前预检；返回 false 时撤销/重做不落栈也不改文档。 */
  canApply?: (patch: DocumentPatch) => boolean;
  maxEntries?: number;
  maxBytes?: number;
  now?: () => number;
  /** 出栈后应用失败（例如物件已被别处删除）。 */
  onApplyFailure?: (entry: HistoryEntry) => void;
}

const DEFAULT_HISTORY_MAX_ENTRIES = 40;
const DEFAULT_HISTORY_MAX_BYTES = 32 * 1024 * 1024;

type HistoryDirection = "undo" | "redo";

type HistoryApplyResult =
  | { ok: true; direction: HistoryDirection; entry: HistoryEntry }
  | {
      ok: false;
      direction: HistoryDirection;
      reason: "empty" | "not-applicable" | "apply-failed";
      entry?: HistoryEntry;
    };

/** UTF-8 字节数（浏览器没有 Buffer，手算避免依赖 TextEncoder 的实例化开销）。 */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function estimateHistoryEntryBytes(entry: HistoryEntry): number {
  return utf8ByteLength(JSON.stringify(entry.patch)) + utf8ByteLength(JSON.stringify(entry.inverse));
}

export class StudioHistoryStore {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private undoBytesValue = 0;
  private redoBytesValue = 0;
  private readonly applyPatch: (patch: DocumentPatch) => boolean;
  private readonly canApplyPatch: ((patch: DocumentPatch) => boolean) | null;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private readonly onApplyFailure: ((entry: HistoryEntry) => void) | null;

  constructor(options: HistoryStoreOptions) {
    this.applyPatch = options.apply;
    this.canApplyPatch = options.canApply ?? null;
    this.maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? DEFAULT_HISTORY_MAX_ENTRIES));
    this.maxBytes = Math.max(1, Math.trunc(options.maxBytes ?? DEFAULT_HISTORY_MAX_BYTES));
    this.now = options.now ?? Date.now;
    this.onApplyFailure = options.onApplyFailure ?? null;
  }

  /** 记录一次用户操作；新操作会清空 redo 栈。 */
  record(patch: DocumentPatch, label: string, inverse?: DocumentPatch): HistoryEntry {
    const entry: HistoryEntry = {
      patch,
      inverse: inverse ?? invertDocumentPatch(patch),
      label,
      at: this.now(),
    };
    this.undoStack.push(entry);
    this.undoBytesValue += estimateHistoryEntryBytes(entry);
    this.dropRedoStack();
    this.enforceCaps();
    return entry;
  }

  undo(): HistoryApplyResult {
    const entry = this.undoStack[this.undoStack.length - 1];
    if (!entry) return { ok: false, direction: "undo", reason: "empty" };
    if (!this.canApply(entry.inverse)) {
      return { ok: false, direction: "undo", reason: "not-applicable", entry };
    }
    const entryBytes = estimateHistoryEntryBytes(entry);
    this.undoStack.pop();
    this.undoBytesValue -= entryBytes;
    if (!this.applyWithGuard(entry.inverse)) {
      this.undoStack.push(entry);
      this.undoBytesValue += entryBytes;
      this.onApplyFailure?.(entry);
      return { ok: false, direction: "undo", reason: "apply-failed", entry };
    }
    this.redoStack.push(entry);
    this.redoBytesValue += entryBytes;
    return { ok: true, direction: "undo", entry };
  }

  redo(): HistoryApplyResult {
    const entry = this.redoStack[this.redoStack.length - 1];
    if (!entry) return { ok: false, direction: "redo", reason: "empty" };
    if (!this.canApply(entry.patch)) {
      return { ok: false, direction: "redo", reason: "not-applicable", entry };
    }
    const entryBytes = estimateHistoryEntryBytes(entry);
    this.redoStack.pop();
    this.redoBytesValue -= entryBytes;
    if (!this.applyWithGuard(entry.patch)) {
      this.redoStack.push(entry);
      this.redoBytesValue += entryBytes;
      this.onApplyFailure?.(entry);
      return { ok: false, direction: "redo", reason: "apply-failed", entry };
    }
    this.undoStack.push(entry);
    this.undoBytesValue += entryBytes;
    this.enforceCaps();
    return { ok: true, direction: "redo", entry };
  }

  peekUndo(): HistoryEntry | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  peekRedo(): HistoryEntry | null {
    return this.redoStack[this.redoStack.length - 1] ?? null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.undoBytesValue = 0;
    this.redoBytesValue = 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  get byteSizes(): { undo: number; redo: number } {
    return { undo: this.undoBytesValue, redo: this.redoBytesValue };
  }

  private canApply(patch: DocumentPatch): boolean {
    return this.canApplyPatch ? this.canApplyPatch(patch) : true;
  }

  private applyWithGuard(patch: DocumentPatch): boolean {
    try {
      return this.applyPatch(patch) === true;
    } catch {
      return false;
    }
  }

  private dropRedoStack(): void {
    this.redoStack = [];
    this.redoBytesValue = 0;
  }

  private enforceCaps(): void {
    while (this.undoStack.length > this.maxEntries) this.dropOldestUndo();
    while (this.undoBytesValue > this.maxBytes && this.undoStack.length > 1) {
      this.dropOldestUndo();
    }
  }

  private dropOldestUndo(): void {
    const dropped = this.undoStack.shift();
    if (dropped) this.undoBytesValue -= estimateHistoryEntryBytes(dropped);
  }
}
