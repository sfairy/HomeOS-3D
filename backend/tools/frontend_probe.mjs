/*
 * 前端高危项的活体探针（P6 / W1-W5）。
 *
 * 为什么要有这个文件：W1-W5 的共同点是「请求悬挂 / 订阅被停掉时页面会安静地卡住」，
 * 这类缺陷在源码里怎么看都正常（该调的函数都调了），只有真的跑一遍、把时钟推到
 * 超时点，才能看出闩有没有松开、横幅有没有出现。仓库里已有的 ``render_probe.cjs``
 * 走的是同一套路（最小 DOM 垫片 + 真的执行页面脚本），这里沿用它的口径：
 *   · 跑的就是磁盘上那一份文件（相对导入原样解析，不做替换、不做改写）；
 *   · 用**假时钟**而不是真的等 20 秒 —— 探针必须秒级完成，且要能断言「预算是多少」；
 *   · 断言的是行为（抛了什么错误、按钮有没有恢复、横幅有没有出现），不是源码长相。
 *
 * 假时钟与假 fetch 都装在**宿主进程**上：被探的模块 import 进来后，它们里面的
 * 裸 `fetch` / `setTimeout` 解析到的是宿主全局，而不是 vm 沙箱里的同名属性。
 * 这一点必须记住，否则会出现「沙箱里换了 fetch，被测代码照旧打真网络」的假通过。
 *
 * 用法：node backend/tools/frontend_probe.mjs <仓库根> <套件>
 *   套件：api-fetch | login | display-boot | request-json | studio-request
 * 输出：末行是 {"results":[{"name":..,"ok":..,"detail":..}]}，供 smoke.py 逐条登记。
 * 退出码：0 = 探针跑完（逐条结果里带成败）；2 = 探针自身崩了（stderr 有原因）。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

const rootArgument = process.argv[2] || ".";
const suiteArgument = process.argv[3] || "";
const ROOT = path.resolve(rootArgument);
const results = [];

/**
 * 登记一条断言。
 *
 * @param {string} name 断言名（会原样出现在 smoke 报告里）。
 * @param {boolean} ok 是否通过。
 * @param {*} [detail] 失败时的现场（成功时也会打印，便于确认探针没有空跑）。
 * @returns {void}
 */
function check(name, ok, detail = "") {
  results.push({
    name,
    ok: Boolean(ok),
    detail: typeof detail === "string" ? detail : JSON.stringify(detail)
  });
}

const wait = () => new Promise(resolve => queueMicrotask(resolve));

/** 把待定的 microtask 全部排空（假时钟下不能用 setTimeout 等）。 */
async function flush(times = 12) {
  for (let index = 0; index < times; index += 1) {
    await wait();
  }
}

/**
 * 装上假时钟，接管 setTimeout / clearTimeout / performance.now。
 *
 * @returns {{now: () => number, delays: () => number[], advance: (ms: number) => void}} 时钟句柄。
 */
function installFakeClock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  let nextTimerId = 1;

  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    const timerId = nextTimerId;
    nextTimerId += 1;
    timers.set(timerId, {
      at: now + Math.max(0, Number(delay) || 0),
      sequence: (sequence += 1),
      callback,
      args
    });
    return timerId;
  };
  globalThis.clearTimeout = timerId => {
    timers.delete(timerId);
  };
  Object.defineProperty(globalThis, "performance", {
    value: { now: () => now },
    configurable: true,
    writable: true
  });

  return {
    now: () => now,
    /** 当前所有待触发定时器距离「现在」还有多久（用来断言超时预算具体是多少）。 */
    delays: () => [...timers.values()].map(timer => timer.at - now).sort((left, right) => left - right),
    advance(ms) {
      const target = now + ms;
      for (let step = 0; step < 200000; step += 1) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort(
            ([, left], [, right]) => left.at - right.at || left.sequence - right.sequence
          )[0];
        if (!due) {
          now = target;
          return;
        }
        const [timerId, timer] = due;
        timers.delete(timerId);
        now = Math.max(now, timer.at);
        // 回调里再排定时器（轮询、两级离场动画）由外层循环继续处理。
        timer.callback(...timer.args);
      }
      throw new Error("假时钟推进出现死循环：有回调在无限重排定时器");
    }
  };
}

/**
 * 装一个可编程的假 fetch，并记录每次调用的参数。
 *
 * @returns {{calls: object[], respond: Function, hang: Function, reject: Function, response: Function}}
 */
function installFakeFetch() {
  const calls = [];
  let handler = () =>
    Promise.reject(new Error("探针没有设置 fetch 行为（这是探针自己的问题）"));

  globalThis.fetch = (url, init = {}) => {
    calls.push({ url: String(url), init, signal: init.signal });
    return handler(String(url), init);
  };

  return {
    calls,
    /** 所有交给 fetch 的信号（用于断言真的把中止信号透传进去了）。 */
    signals: () => calls.map(call => call.signal),
    respond(nextHandler) {
      handler = nextHandler;
    },
    /** 让请求永远不返回（模拟弱网 / 服务端不响应），但被中止时按浏览器的行为立刻失败。 */
    hang() {
      handler = (_url, init = {}) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal;
          if (!signal) {
            // 没有信号才是真的永远挂着 —— 被测代码本来就该自己带超时。
            return;
          }
          const abortError = () =>
            Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
          if (signal.aborted) {
            reject(abortError());
            return;
          }
          // 真实 fetch 在中止时会立刻以 AbortError 失败，垫片必须照做：
          // 否则超时那条路径永远等不到 runWithSignal 结算，探针会静默卡死。
          signal.addEventListener("abort", () => reject(abortError()), { once: true });
        });
    },
    /** 直接以网络错误失败（fetch 在网络层失败时的形态）。 */
    reject(error) {
      handler = () => Promise.reject(error);
    },
    /** 返回一个最小可用的 Response 替身。 */
    response(status, bodyText, { ok = status >= 200 && status < 300 } = {}) {
      handler = () =>
        Promise.resolve({
          status,
          ok,
          text: () => Promise.resolve(bodyText),
          json: () => Promise.resolve(JSON.parse(bodyText))
        });
    }
  };
}

/**
 * 从源码里切出一个 `async function <name>(...) {...}` 的完整文本。
 *
 * 为什么要切而不是 import：home.js / studio-app.js 都是几万行、模块顶层就摸 DOM
 * 的页面脚本，整份 import 进来需要一整套 DOM 实现；而这两个「唯一接口出入口」
 * 本身是自足的（只依赖 apiFetch / window / 日志桥），切开单独跑仍然是磁盘上
 * 那一份原文，没有改写。
 *
 * 切完会做两道自检：能解析（否则报错，不会静默给出半截函数）、结尾是 `}`。
 *
 * @param {string} source 文件全文。
 * @param {string} functionName 函数名。
 * @returns {string} 函数源码。
 */
function extractAsyncFunction(source, functionName) {
  const declaration = new RegExp(
    String.raw`(?<![\w$])async\s+function\s+${functionName}\s*\(`
  ).exec(source);
  if (!declaration) {
    throw new Error(`源码里找不到 async function ${functionName}`);
  }
  return sliceFunctionDeclaration(source, declaration.index, functionName);
}

/**
 * 按「声明起点」切出一个函数体：括号与花括号各配平一次，再自检能解析。
 *
 * @param {string} source 文件全文。
 * @param {number} start 声明起点（`async` 或 `function` 关键字的第一个字符）。
 * @param {string} label 报错里用的名字。
 * @returns {string} 函数源码。
 */
function sliceFunctionDeclaration(source, start, label, prefix = "") {
  const parameterOpen = source.indexOf("(", start);
  const parameterClose = findClosing(source, parameterOpen, "(", ")");
  const bodyOpen = source.indexOf("{", parameterClose);
  const bodyClose = findClosing(source, bodyOpen, "{", "}");
  const extracted = source.slice(start, bodyClose + 1);
  if (!extracted.trimEnd().endsWith("}")) {
    throw new Error(`${label} 的切分没有停在右花括号上`);
  }
  // prefix 只用于解析校验：类方法的切片本身不是合法语句，要补个 `function` 才解析得动。
  new vm.Script(prefix + extracted); // 解析不过会抛，避免把半截函数当成「探针通过」
  return extracted;
}

/**
 * 从源码里切出一个函数，同步或异步都认（`function f()` / `async function f()`）。
 *
 * 为什么先按 async 找：反过来写（`(async\s+)?function`）会把 `async` 关键字切掉，
 * 留下一段还带 `await` 的函数体 —— 一进 vm 就报语法错，表现成「探针自己崩了」，
 * 看不出这是在读被测代码。
 *
 * @param {string} source 文件全文。
 * @param {string} functionName 函数名。
 * @returns {string} 函数源码（异步时含 `async` 关键字）。
 */
function extractFunction(source, functionName) {
  try {
    return extractAsyncFunction(source, functionName);
  } catch {
    const declaration = new RegExp(
      String.raw`(?<![\w$])function\s+${functionName}\s*\(`
    ).exec(source);
    if (!declaration) {
      throw new Error(`源码里找不到 function ${functionName}`);
    }
    return sliceFunctionDeclaration(source, declaration.index, functionName);
  }
}

/**
 * 从源码里切出一个类方法，并转成可独立调用的函数。
 *
 * 为什么需要它：`applyOptimisticToggle` / `bindRuntimeDialogEscapeClose` 都是类方法，
 * 而 `extractFunction` 只认顶格的 `function name(`；把方法体原样搬进沙箱也不行
 * （`name(…) {` 不是合法的顶层语句）。这里切成源码后再加一个 `function` 关键字，
 * 沙箱里就能用 `fn.call(替身 this, …)` 调它 —— 测的仍然是磁盘上那一份实现。
 *
 * 定位用的是「行首缩进 + 名字 + 参数 + 紧接 `{`」：这样不会把 `this.applyOptimisticToggle(`
 * 这类调用点认成方法定义（调用点后面跟的是实参列表与 `;`，不是函数体）。
 *
 * @param {string} source 文件全文。
 * @param {string} methodName 方法名。
 * @returns {string} `function <name>(…) { … }` 形式的源码。
 */
function extractClassMethod(source, methodName) {
  const declaration = new RegExp(
    String.raw`\n[ \t]+${methodName}\s*\([^)]*\)\s*\{`
  ).exec(source);
  if (!declaration) {
    throw new Error(`源码里找不到类方法 ${methodName}`);
  }
  const sliced = sliceFunctionDeclaration(
    source,
    declaration.index + 1,
    methodName,
    "function "
  );
  return "function " + sliced;
}

/**
 * 从源码里切出一行 `<let|const> <name> = …;` 声明（用于把常量与状态变量一起搬进沙箱）。
 *
 * 只认单行：多行初值的变量不该用这个助手取，宁可在沙箱里显式建一个。
 *
 * @param {string} source 文件全文。
 * @param {string} variableName 变量名。
 * @returns {string} 声明源码（含 `let`/`const` 与分号）。
 */
function extractVariableDeclaration(source, variableName) {
  const declaration = new RegExp(
    String.raw`(?<![\w$.])(?:let|const)\s+${variableName}\s*=\s*[^;\n]*;`
  ).exec(source);
  if (!declaration) {
    throw new Error(`源码里找不到单行的 let/const ${variableName} = …;`);
  }
  new vm.Script(declaration[0]);
  return declaration[0];
}

/**
 * 造一个带配额的 sessionStorage 替身。
 *
 * 为什么不能只是「永远成功」：W9 的一半正是「写不进去的时候用户能不能知道」，
 * 没有失败路径就没有那条断言。`attempts` 记录每一次 `setItem` 的内容 ——
 * 「是不是先写一版大的、失败再写一版小的」只能从尝试次数上看出来。
 *
 * @param {object} [options] 选项。
 * @param {number} [options.quotaBytes] 初始配额（按字符串长度计）。
 * @returns {object} 替身（含 `attempts` / `setQuota` / `entries`）。
 */
function makeQuotaStorage({ quotaBytes = Number.MAX_SAFE_INTEGER } = {}) {
  const entries = new Map();
  const attempts = [];
  let quota = quotaBytes;
  return {
    attempts,
    entries,
    setQuota(nextQuotaBytes) {
      quota = nextQuotaBytes;
    },
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    removeItem(key) {
      entries.delete(key);
    },
    setItem(key, value) {
      const storedText = String(value);
      attempts.push(storedText);
      if (storedText.length > quota) {
        const quotaError = new Error("The quota has been exceeded.");
        quotaError.name = "QuotaExceededError";
        throw quotaError;
      }
      entries.set(key, storedText);
    }
  };
}

/**
 * 从 `openIndex` 处的开括号出发，找到配对的那个闭括号（跳过字符串 / 注释 / 正则）。
 *
 * @param {string} source 源码。
 * @param {number} openIndex 开括号下标。
 * @param {string} open 开括号字符。
 * @param {string} close 闭括号字符。
 * @returns {number} 闭括号下标。
 */
function findClosing(source, openIndex, open, close) {
  let depth = 0;
  let mode = "code";
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (mode === "code") {
      if (character === "/" && next === "/") {
        mode = "line-comment";
        index += 1;
        continue;
      }
      if (character === "/" && next === "*") {
        mode = "block-comment";
        index += 1;
        continue;
      }
      if (character === '"') {
        mode = "double";
        continue;
      }
      if (character === "'") {
        mode = "single";
        continue;
      }
      if (character === "`") {
        mode = "template";
        continue;
      }
      if (character === "/" && regexCanStartAfter(source, index)) {
        mode = "regex";
        continue;
      }
      if (character === open) {
        depth += 1;
        continue;
      }
      if (character === close) {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
      continue;
    }
    if (mode === "line-comment") {
      if (character === "\n") {
        mode = "code";
      }
      continue;
    }
    if (mode === "block-comment") {
      if (character === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode === "regex") {
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === "/") {
        mode = "code";
      }
      continue;
    }
    // 字符串与模板串：只处理「被转义的下一个字符」与结束引号。
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (
      (mode === "double" && character === '"') ||
      (mode === "single" && character === "'") ||
      (mode === "template" && character === "`")
    ) {
      mode = "code";
    }
  }
  throw new Error("括号没有配对");
}

/**
 * 判断某个 `/` 是不是正则字面量的开始（除号则不是）。
 *
 * @param {string} source 源码。
 * @param {number} index 斜杠下标。
 * @returns {boolean} 是正则起始则为 true。
 */
function regexCanStartAfter(source, index) {
  const before = source.slice(0, index).trimEnd();
  if (!before) {
    return true;
  }
  const previous = before[before.length - 1];
  if ("(,=:[!&|?{};+-*%~^<>".includes(previous)) {
    return true;
  }
  return /(?:^|\W)(return|typeof|instanceof|in|of|case|delete|void|do|else|yield|await)$/.test(
    before
  );
}

/**
 * 建一个跑「接口出入口函数」的沙箱（window / 日志桥 / 宿主 fetch 与假时钟）。
 *
 * @returns {{context: object, runtime: object}} vm 上下文与观测句柄。
 */
function makeRequestSandbox() {
  const assignedLocations = [];
  const replacedLocations = [];
  const windowStub = {
    location: {
      pathname: "/index.html",
      search: "",
      assign(url) {
        assignedLocations.push(String(url));
      },
      replace(url) {
        replacedLocations.push(String(url));
      }
    },
    HABridgeLog: undefined
  };
  const context = vm.createContext({
    window: windowStub,
    console,
    Blob,
    FormData,
    URLSearchParams,
    // 刻意不提供 fetch：入口函数改回裸 fetch 时应立刻 ReferenceError，
    // 而不是拿到一个没有超时约束的真 fetch 把探针挂死。
    isStageViewerMode: false,
    StudioRequestError: class StudioRequestError extends Error {
      constructor(message, status, payload) {
        super(message);
        this.name = "StudioRequestError";
        this.status = status;
        this.payload = payload;
      }
    }
  });
  return { context, runtime: { windowStub, assignedLocations, replacedLocations } };
}

/**
 * W1/W2 的机制层：utils/api-fetch.js 自己的行为。
 *
 * @returns {Promise<void>}
 */
async function runApiFetchSuite() {
  const clock = installFakeClock();
  const fakeFetch = installFakeFetch();
  const { apiFetch, API_TIMEOUT_MS, API_UPLOAD_TIMEOUT_MS } = await import(
    pathToFileURL(path.join(ROOT, "frontend/static/utils/api-fetch.js")).href
  );

  check(
    "W1 预算常量是「20 秒普通 / 3 分钟上传」两个档，而不是无限制",
    API_TIMEOUT_MS === 20000 && API_UPLOAD_TIMEOUT_MS === 180000,
    `API_TIMEOUT_MS=${API_TIMEOUT_MS} API_UPLOAD_TIMEOUT_MS=${API_UPLOAD_TIMEOUT_MS}`
  );

  // 1) 普通 JSON 体：悬挂到 20 秒必须抛超时，且中止信号真的透传给了 fetch。
  fakeFetch.hang();
  let timeoutError = null;
  const pendingRequest = apiFetch("/api/v1/projects?_=1", {
    method: "POST",
    body: JSON.stringify({ a: 1 })
  }).catch(error => {
    timeoutError = error;
    return null;
  });
  await flush();
  check(
    "W1 普通请求的定时器预算是 2e4 毫秒（不是 0、不是 Infinity）",
    clock.delays().includes(20000),
    JSON.stringify(clock.delays())
  );
  check(
    "W1 调用方给的 signal 被换成了可中止的信号（否则超时中断不了请求）",
    fakeFetch.calls.length === 1 && Boolean(fakeFetch.calls[0].signal),
    JSON.stringify(fakeFetch.calls.map(call => Boolean(call.signal)))
  );
  clock.advance(19999);
  await flush();
  check("W1 未到 20 秒时请求仍在等（不是立刻失败）", timeoutError === null, String(timeoutError));
  clock.advance(2);
  await pendingRequest;
  check(
    "W1 到点后抛出 TimeoutError（上层可以按 name 分支）",
    timeoutError?.name === "TimeoutError",
    String(timeoutError?.name)
  );
  check(
    "W1 超时文案是可直接展示的中文，并带上接口路径",
    /请求超时：\/projects/.test(timeoutError?.message || "") &&
      /超过 20 秒/.test(timeoutError?.message || ""),
    String(timeoutError?.message)
  );
  check(
    "W1 超时后 fetch 收到的信号确实被中止了（请求真的断了，不是只抛了个错）",
    fakeFetch.calls[0].signal.aborted === true,
    String(fakeFetch.calls[0].signal.aborted)
  );

  // 2) 上传体：预算自动放宽到 3 分钟，20 秒时不能误判成超时。
  fakeFetch.calls.length = 0;
  fakeFetch.hang();
  let uploadError = null;
  let uploadSettled = false;
  const uploadRequest = apiFetch("/api/v1/assets/user", {
    method: "POST",
    body: new Blob(["fake-png-bytes"])
  })
    .catch(error => {
      uploadError = error;
      return null;
    })
    .finally(() => {
      uploadSettled = true;
    });
  await flush();
  check(
    "W2 二进制体的预算放宽到 1.8e5 毫秒（素材 / 导出包不会被 20 秒误杀）",
    clock.delays().includes(180000),
    JSON.stringify(clock.delays())
  );
  clock.advance(20000);
  await flush();
  check("W2 上传到 20 秒时仍在正常等待（没有被普通预算误伤）", uploadSettled === false, `settled=${uploadSettled}`);
  clock.advance(160001);
  await uploadRequest;
  check(
    "W2 上传到 3 分钟仍无响应才算超时",
    uploadError?.name === "TimeoutError" && /\/assets\/user/.test(uploadError?.message || ""),
    String(uploadError?.message)
  );

  // 3) 正常返回：不得被误判成超时，且响应原样给回调用方。
  fakeFetch.calls.length = 0;
  fakeFetch.response(200, '{"items":[]}');
  const fastResponse = await apiFetch("/api/v1/projects");
  check(
    "W1 正常响应照样原样返回（超时包装没有改变成功路径）",
    fastResponse?.status === 200,
    String(fastResponse?.status)
  );

  // 4) 调用方自己的取消（外部 signal）保留 AbortError 语义，不被改写成 TimeoutError。
  fakeFetch.calls.length = 0;
  fakeFetch.hang();
  const externalController = new AbortController();
  let abortError = null;
  const abortedRequest = (
    await import(
      pathToFileURL(path.join(ROOT, "frontend/static/utils/request-timeout.js")).href
    )
  );
  const abortedPromise = abortedRequest
    .withRequestTimeout(
      20000,
      abortSignal => fetch("/api/v1/slow", { signal: abortSignal }),
      externalController.signal
    )
    .catch(error => {
      abortError = error;
      return null;
    });
  await flush();
  externalController.abort();
  await abortedPromise;
  check(
    "W1 调用方主动取消仍然是 AbortError（超时包装没有吞掉取消语义）",
    abortError?.name === "AbortError",
    String(abortError?.message || abortError)
  );

  // 5) 已中止的外部信号：立刻失败，不发请求（避免打一次注定被丢弃的调用）。
  fakeFetch.calls.length = 0;
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  let preAbortedError = null;
  await abortedRequest
    .withRequestTimeout(20000, abortSignal => fetch("/api/v1/never", { signal: abortSignal }), alreadyAborted.signal)
    .catch(error => {
      preAbortedError = error;
      return null;
    });
  check(
    "W1 已取消的调用不会真的发出请求",
    fakeFetch.calls.length === 0 && preAbortedError?.name === "AbortError",
    `calls=${fakeFetch.calls.length} error=${preAbortedError?.name}`
  );

  // 6) 非超时错误不许被改写成「请求超时」：网络层失败原样透出，否则用户被引去
  //    「检查网络 / 重试」，而真正的原因（比如服务端 4xx 之外的协议错误）看不到。
  fakeFetch.calls.length = 0;
  fakeFetch.reject(new TypeError("Failed to fetch"));
  let networkError = null;
  await apiFetch("/api/v1/projects").catch(error => {
    networkError = error;
    return null;
  });
  check(
    "W1 网络层错误不被改写成「请求超时」（否则错误提示会把排查方向带偏）",
    networkError?.name === "TypeError" && networkError?.message === "Failed to fetch",
    `name=${networkError?.name} message=${networkError?.message}`
  );

  // 7) 调用方自己的 signal 必须能取消 apiFetch：它得被转交给 withRequestTimeout，
  //    而不是被内部的合并信号顶掉（顶掉的表现是「取消点了没反应」，要等到超时才停）。
  fakeFetch.calls.length = 0;
  fakeFetch.hang();
  const callerController = new AbortController();
  let callerCancelError = null;
  const callerCancelPromise = apiFetch("/api/v1/projects", {
    signal: callerController.signal
  }).catch(error => {
    callerCancelError = error;
    return null;
  });
  await flush();
  callerController.abort();
  await flush();
  // 没转交外部 signal 时这个请求会一直挂着；推一下假时钟，断言看到的就是「取消被
  // 当成了超时」这个具体形态（TimeoutError），而不是干等看门狗。
  clock.advance(20001);
  await callerCancelPromise;
  check(
    "W1 调用方自己的 signal 仍然能取消 apiFetch（init.signal 被转交而不是被顶掉）",
    callerCancelError?.name === "AbortError" && fakeFetch.calls.length === 1,
    `name=${callerCancelError?.name} calls=${fakeFetch.calls.length}`
  );
}

/**
 * W1：home.js 的 requestJson（编辑器唯一出入口）行为。
 *
 * @returns {Promise<void>}
 */
async function runRequestJsonSuite() {
  const clock = installFakeClock();
  const fakeFetch = installFakeFetch();
  const { apiFetch } = await import(
    pathToFileURL(path.join(ROOT, "frontend/static/utils/api-fetch.js")).href
  );
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/home.js"), "utf8");
  const requestJsonSource = extractAsyncFunction(source, "requestJson");
  check(
    "W1 从 home.js 切出的 requestJson 仍然走 apiFetch（不是裸 fetch）",
    requestJsonSource.includes("apiFetch("),
    requestJsonSource.slice(0, 80)
  );
  const { context } = makeRequestSandbox();
  // apiFetch 从宿主注入：它内部用的是宿主的 fetch 与假时钟（见文件头说明）。
  context.apiFetch = apiFetch;
  vm.runInContext(requestJsonSource, context);

  // 1) 悬挂请求：到 20 秒必须抛错，否则 isSaving 永不复位（保存按钮永久锁死）。
  fakeFetch.hang();
  let hangError = null;
  const hangingCall = context
    .requestJson("/projects")
    .then(
      value => ({ value }),
      error => {
        hangError = error;
        return null;
      }
    );
  await flush();
  clock.advance(20001);
  await hangingCall;
  check(
    "W1 悬挂的接口请求在 20 秒后抛超时错（调用方的 finally 才有机会复位 isSaving）",
    hangError?.name === "TimeoutError" && /请求超时：\/projects/.test(hangError?.message || ""),
    String(hangError?.message || hangError)
  );

  // 2) 正常 JSON：解析成对象返回（证明这条探针不是靠「反正都失败」通过的）。
  fakeFetch.response(200, '{"items":[{"id":1}]}');
  const okPayload = await context.requestJson("/projects");
  check(
    "W1 正常响应仍被解析成对象（探针没有把成功路径也判成失败）",
    okPayload?.items?.[0]?.id === 1,
    JSON.stringify(okPayload)
  );

  // 3) 非 2xx：detail 字符串原样成为错误文案。
  fakeFetch.response(500, '{"detail":"库里炸了"}', { ok: false });
  let failedError = null;
  await context.requestJson("/projects").catch(error => {
    failedError = error;
    return null;
  });
  check("W1 非 2xx 的 detail 仍然透传成错误文案", failedError?.message === "库里炸了", String(failedError?.message));

  // 4) 上传（File 体）：预算自动放宽，20 秒时不能抛错。
  fakeFetch.calls.length = 0;
  fakeFetch.hang();
  let uploadSettled = false;
  const uploadCall = context
    .requestJson("/assets/user", {
      method: "POST",
      body: new Blob(["bytes"]),
      headers: { "Content-Type": "image/png" }
    })
    .catch(() => null)
    .finally(() => {
      uploadSettled = true;
    });
  await flush();
  clock.advance(20001);
  await flush();
  check(
    "W1 素材上传不会被 20 秒预算掐断（大文件在弱网上是常态）",
    uploadSettled === false,
    `settled=${uploadSettled}`
  );
  clock.advance(160000);
  await uploadCall;
  check("W1 上传到 3 分钟才超时", uploadSettled === true, `settled=${uploadSettled}`);
}

/**
 * W2：studio-app.js 的 requestStudioApi（舞台页唯一出入口）行为。
 *
 * @returns {Promise<void>}
 */
async function runStudioRequestSuite() {
  const clock = installFakeClock();
  const fakeFetch = installFakeFetch();
  const { apiFetch } = await import(
    pathToFileURL(path.join(ROOT, "frontend/static/utils/api-fetch.js")).href
  );
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/3d-studio/studio-app.js"), "utf8");
  const requestStudioApiSource = extractAsyncFunction(source, "requestStudioApi");
  check(
    "W2 从 studio-app.js 切出的 requestStudioApi 仍然走 apiFetch（不是裸 fetch）",
    requestStudioApiSource.includes("apiFetch("),
    requestStudioApiSource.slice(0, 80)
  );
  const { context } = makeRequestSandbox();
  context.apiFetch = apiFetch;
  vm.runInContext(requestStudioApiSource, context);

  // 1) 自动保存悬挂：必须到点抛错，否则 isSaving 永不复位、后续改动全被挡住。
  fakeFetch.hang();
  let hangError = null;
  const saveCall = context
    .requestStudioApi("/studio3d", { method: "PUT", body: JSON.stringify({ revision: 3, scene: {} }) })
    .catch(error => {
      hangError = error;
      return null;
    });
  await flush();
  clock.advance(20001);
  await saveCall;
  check(
    "W2 悬挂的自动保存请求 20 秒后抛超时错（isSaving 的 finally 才轮得到）",
    hangError?.name === "TimeoutError" && /请求超时：\/studio3d/.test(hangError?.message || ""),
    String(hangError?.message || hangError)
  );

  // 2) 导出包（ZIP Blob）：放宽预算，不能被 20 秒掐掉。
  fakeFetch.calls.length = 0;
  fakeFetch.hang();
  let exportSettled = false;
  const exportCall = context
    .requestStudioApi("/studio3d/exports", {
      method: "POST",
      body: new Blob(["zip-bytes"]),
      headers: { "Content-Type": "application/zip" }
    })
    .catch(() => null)
    .finally(() => {
      exportSettled = true;
    });
  await flush();
  clock.advance(20001);
  await flush();
  check("W2 导出包上传不会被 20 秒预算掐断", exportSettled === false, `settled=${exportSettled}`);
  clock.advance(160000);
  await exportCall;

  // 3) 只读视图的守卫还在（切分出来的函数没有被探针改写成另一份实现）。
  vm.runInContext("isStageViewerMode = true", context);
  let readOnlyError = null;
  await context.requestStudioApi("/studio3d", { method: "PUT", body: "{}" }).catch(error => {
    readOnlyError = error;
    return null;
  });
  check(
    "W2 只读视图禁止写请求的守卫仍然生效",
    readOnlyError?.message === "交互户型为只读视图。",
    String(readOnlyError?.message)
  );

  // 4) 非 2xx 仍然是 StudioRequestError，且带上 status 与 payload。
  vm.runInContext("isStageViewerMode = false", context);
  fakeFetch.response(409, '{"detail":{"message":"版本冲突","code":"REVISION_CONFLICT"}}', { ok: false });
  let conflictError = null;
  await context.requestStudioApi("/studio3d").catch(error => {
    conflictError = error;
    return null;
  });
  check(
    "W2 非 2xx 仍抛 StudioRequestError 并保留 status（409 冲突分支靠它判断）",
    conflictError?.name === "StudioRequestError" &&
      conflictError?.status === 409 &&
      conflictError?.message === "版本冲突",
    `${conflictError?.name} status=${conflictError?.status} message=${conflictError?.message}`
  );
}

/**
 * W3：login.js 的提交路径（按钮必须恢复 + 请求必须超时）。
 *
 * @returns {Promise<void>}
 */
async function runLoginSuite() {
  const clock = installFakeClock();
  const fakeFetch = installFakeFetch();

  const listeners = new Map();
  const submitButton = {
    disabled: false,
    addEventListener(type, handler) {
      listeners.set("submit:" + type, handler);
    }
  };
  const messageElement = { textContent: "", hidden: true };
  const formElement = {
    fields: { username: "pcskycn", password: "hunter2" },
    querySelector(selector) {
      return selector === 'button[type="submit"]' ? submitButton : null;
    },
    get(name) {
      return this.fields[name];
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    }
  };
  const locationAssigns = [];
  const documentStub = {
    querySelector(selector) {
      if (selector === "#login-form") {
        return formElement;
      }
      if (selector === "#message") {
        return messageElement;
      }
      return null;
    }
  };
  const windowStub = {
    location: {
      search: "",
      assign(url) {
        locationAssigns.push(String(url));
      }
    }
  };

  // login.js 是模块：顶层会立刻抓 DOM，所以先铺好全局垫片再 import（跑的就是磁盘那份）。
  // 垫片要一直留到断言跑完 —— submit 处理器是在提交那一刻才 `new FormData(form)`，
  // 提前收摊会让它落到真的 FormData 上并抛 "could not be converted"。
  const hostDocument = globalThis.document;
  const hostWindow = globalThis.window;
  const hostFormData = globalThis.FormData;
  globalThis.document = documentStub;
  globalThis.window = windowStub;
  globalThis.FormData = class FormData {
    constructor(form) {
      this.form = form;
    }
    get(name) {
      return this.form.get(name);
    }
  };
  try {
    await import(pathToFileURL(path.join(ROOT, "frontend/static/login.js")).href);

    const submitHandler = listeners.get("submit");
    check("W3 login.js 注册了 submit 监听（脚本确实加载完成）", typeof submitHandler === "function");

    // 1) 请求悬挂：按钮必须先禁用（防重复登录），到点后必须恢复。
    fakeFetch.hang();
    let submitError = null;
    const submitRun = Promise.resolve(submitHandler({ preventDefault() {} })).catch(error => {
      submitError = error;
      return null;
    });
    await flush();
    check("W3 提交期间按钮被禁用（防重复登录）", submitButton.disabled === true, `disabled=${submitButton.disabled}`);
    check(
      "W3 登录请求的定时器预算是 2e4 毫秒",
      clock.delays().includes(20000),
      JSON.stringify(clock.delays())
    );
    clock.advance(19999);
    await flush();
    check("W3 未到点时按钮仍然禁用", submitButton.disabled === true, `disabled=${submitButton.disabled}`);
    clock.advance(2);
    await submitRun;
    check(
      "W3 超时后按钮必须恢复可用（否则用户只能刷新页面重来）",
      submitButton.disabled === false,
      `disabled=${submitButton.disabled}`
    );
    check(
      "W3 超时文案是可读中文并提示重试",
      messageElement.hidden === false && /请求超时/.test(messageElement.textContent),
      messageElement.textContent
    );
    check("W3 超时不会发生跳转", locationAssigns.length === 0, JSON.stringify(locationAssigns));
    check("W3 提交处理器没有把异常漏出去", submitError === null, String(submitError));

    // 2) 凭据错误：文案来自后端 detail，按钮同样恢复。
    messageElement.textContent = "";
    messageElement.hidden = true;
    fakeFetch.response(401, '{"detail":"用户名或密码不正确。"}', { ok: false });
    await submitHandler({ preventDefault() {} });
    check(
      "W3 登录失败的文案仍然来自后端 detail",
      messageElement.textContent === "用户名或密码不正确。",
      messageElement.textContent
    );
    check("W3 登录失败后按钮恢复可用", submitButton.disabled === false, `disabled=${submitButton.disabled}`);

    // 3) 成功：跳转目标仍按 next 规则收敛到 /license。
    windowStub.location.search = "?next=https://evil.example.com";
    fakeFetch.response(200, "{}");
    await submitHandler({ preventDefault() {} });
    check(
      "W3 成功后的跳转仍拒绝站外 next（开放重定向守卫）",
      locationAssigns.length === 1 && locationAssigns[0] === "/license",
      JSON.stringify(locationAssigns)
    );
  } finally {
    if (hostDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = hostDocument;
    }
    if (hostWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = hostWindow;
    }
    globalThis.FormData = hostFormData;
  }
}

/**
 * 造一个最小 DOM 垫片，供 display-boot.js（classic 脚本）在 vm 里真的跑起来。
 *
 * @param {string} search location.search（用来切 capturePreview 模式）。
 * @returns {object} 垫片与观测句柄。
 */
function makeDisplayBootSandbox(search) {
  const element = (id, tagName = "div", { hidden = false } = {}) => {
    const classes = new Set();
    return {
      id,
      tagName,
      hidden,
      textContent: "",
      className: "",
      dataset: {},
      style: { backgroundImage: "" },
      removed: false,
      focused: false,
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle: (name, force) => (force ? classes.add(name) : classes.delete(name))
      },
      measuredClasses: () => [...classes],
      addEventListener() {},
      removeEventListener() {},
      remove() {
        this.removed = true;
      },
      contains() {
        return false;
      },
      closest() {
        return null;
      },
      focus() {
        this.focused = true;
      },
      getBoundingClientRect() {
        return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      }
    };
  };

  // 初始可见性与 display.html 的标记保持一致：起点不同的话，
  // 「横幅有没有出现」这类断言会得到假通过。
  const elements = new Map(
    [
      ["display-splash", element("display-splash", "section")],
      ["display-splash-message", element("display-splash-message", "p")],
      ["display-splash-actions", element("display-splash-actions", { hidden: true })],
      ["display-splash-enter", element("display-splash-enter", "button", { hidden: true })],
      ["display-notice", element("display-notice", "div", { hidden: true })],
      ["display-shell", element("display-shell", "main")]
    ]
  );
  const storage = new Map();
  const clock = installFakeClock();
  const documentElement = element(null, "html");
  const documentStub = {
    documentElement,
    activeElement: null,
    title: "",
    visibilityState: "visible",
    body: element(null, "body"),
    getElementById: id => elements.get(id) || null,
    addEventListener() {},
    createElement: tagName => element(null, tagName)
  };
  const windowStub = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {}
  };
  const context = vm.createContext({
    document: documentStub,
    window: windowStub,
    location: { search, pathname: "/display/客厅", reload() {} },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    performance: { now: () => clock.now() },
    setTimeout: (callback, delay, ...args) => globalThis.setTimeout(callback, delay, ...args),
    clearTimeout: timerId => globalThis.clearTimeout(timerId),
    requestAnimationFrame: callback => callback(clock.now()),
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
    Image: class Image {},
    innerHeight: 800,
    innerWidth: 1280,
    URLSearchParams,
    console
  });

  return { context, clock, elements, documentElement, documentStub };
}

/**
 * 把启动层推进到 done（首屏就绪 + 两级离场动画走完）。
 *
 * @param {object} sandbox 垫片句柄。
 * @returns {void}
 */
function bootToDone(sandbox) {
  const bridge = sandbox.context.window.HABridgeDisplayBoot;
  bridge.ready(sandbox.elements.get("display-shell"));
  for (let step = 0; step < 60 && bridge.pending; step += 1) {
    sandbox.clock.advance(100);
  }
}

/**
 * W4/W5：展示页运行期横幅的三条来源与各自的撤销条件。
 *
 * @returns {Promise<void>}
 */
async function runDisplayBootSuite() {
  const sandbox = makeDisplayBootSandbox("");
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "frontend/static/display-boot.js"), "utf8"),
    sandbox.context,
    { filename: "display-boot.js" }
  );
  const bridge = sandbox.context.window.HABridgeDisplayBoot;
  const notice = sandbox.elements.get("display-notice");
  const splash = sandbox.elements.get("display-splash");
  const noticeState = () => `hidden=${notice.hidden} text=${JSON.stringify(notice.textContent)}`;

  // 标记是横幅的另一半：JS 全对但模板里没有这个元素时，一切都静默失效。
  const displayTemplate = fs.readFileSync(path.join(ROOT, "frontend/display.html"), "utf8");
  check(
    "W4 display.html 里有横幅元素（role=status + 默认 hidden）",
    /id="display-notice"[^>]*role="status"/.test(displayTemplate) &&
      /id="display-notice"[^>]*hidden/.test(displayTemplate),
    (displayTemplate.match(/<div id="display-notice"[^>]*>/) || ["没找到该元素"])[0]
  );

  check(
    "W4 display-boot 暴露了运行期横幅 / 恢复三个入口",
    typeof bridge.notice === "function" &&
      typeof bridge.recovered === "function" &&
      typeof bridge.setRuntimePush === "function",
    Object.keys(bridge).join(",")
  );

  // 启动期失败仍然走原来的错误界面（这次改动不能把首屏兜底弄丢）。
  bridge.fail(new Error("首屏素材挂了"));
  check(
    "W4 启动期失败仍然进错误界面（遮罩 + 重试入口）",
    splash.measuredClasses().includes("is-error") &&
      sandbox.elements.get("display-splash-actions").hidden === false,
    JSON.stringify({
      classes: splash.measuredClasses(),
      actionsHidden: sandbox.elements.get("display-splash-actions").hidden
    })
  );
  check("W4 启动期失败不挂运行期横幅（遮罩已经把事情说清楚了）", notice.hidden === true, noticeState());

  // 推进到 done：之后才有「运行期」可言。
  const doneSandbox = makeDisplayBootSandbox("");
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "frontend/static/display-boot.js"), "utf8"),
    doneSandbox.context,
    { filename: "display-boot.js" }
  );
  bootToDone(doneSandbox);
  const doneBridge = doneSandbox.context.window.HABridgeDisplayBoot;
  const doneNotice = doneSandbox.elements.get("display-notice");
  check(
    "W4 探针能把启动层推到 done（否则下面所有断言都是空跑）",
    doneBridge.pending === false && doneBridge.failed === false,
    JSON.stringify({ pending: doneBridge.pending, failed: doneBridge.failed })
  );

  // W4：启动层摘掉之后刷新失败 → 必须出现横幅，而不是静默显示旧数据。
  doneBridge.fail(new Error("请求超时：/projects（超过 20 秒未响应），请检查网络后重试。"));
  check(
    "W4 done 之后的刷新失败会挂出「无法更新」横幅（原先直接 return，什么都看不到）",
    doneNotice.hidden === false && /请求超时：\/projects/.test(doneNotice.textContent),
    `hidden=${doneNotice.hidden} text=${doneNotice.textContent}`
  );
  check(
    "W4 done 之后不再退回全屏错误界面（画面仍然可用）",
    doneSandbox.elements.get("display-splash").removed === true,
    `splashRemoved=${doneSandbox.elements.get("display-splash").removed}`
  );
  doneBridge.recovered();
  check(
    "W4 下一次刷新成功即撤掉横幅（恢复联网后它必须自己消失）",
    doneNotice.hidden === true,
    `hidden=${doneNotice.hidden}`
  );

  // W5：实时推送被永久停掉 → 常驻横幅；刷新成功撤不掉，只有重新订阅成功才撤。
  doneBridge.setRuntimePush(false, "实时状态订阅请求无效，已停止自动重连。");
  check(
    "W5 实时推送停止会挂常驻横幅",
    doneNotice.hidden === false && /已停止自动重连/.test(doneNotice.textContent),
    `hidden=${doneNotice.hidden} text=${doneNotice.textContent}`
  );
  doneBridge.recovered();
  check(
    "W5 刷新成功不能撤掉实时推送横幅（刷新成功不代表实体状态会恢复）",
    doneNotice.hidden === false,
    `hidden=${doneNotice.hidden}`
  );
  doneBridge.setRuntimePush(true);
  check("W5 重新订阅成功后横幅才撤销", doneNotice.hidden === true, `hidden=${doneNotice.hidden}`);

  // 一次性提示：8 秒后自己收起（它描述的是已经过去的事件）。
  doneBridge.notice("操作失败。");
  check(
    "W4 一次性提示会立刻出现",
    doneNotice.hidden === false && doneNotice.textContent === "操作失败。",
    `hidden=${doneNotice.hidden} text=${doneNotice.textContent}`
  );
  doneSandbox.clock.advance(7999);
  check("W4 一次性提示 8 秒内不消失", doneNotice.hidden === false, `hidden=${doneNotice.hidden}`);
  doneSandbox.clock.advance(2);
  check("W4 一次性提示 8 秒后自动收起", doneNotice.hidden === true, `hidden=${doneNotice.hidden}`);

  // 优先级：状态类压过一次性提示（页面顶部只留一条）。
  doneBridge.notice("操作失败。");
  doneBridge.fail(new Error("无法连接服务器，请检查网络连接。"));
  check(
    "W4 多条同时存在时只显示更严重的状态类提示",
    doneNotice.textContent === "无法连接服务器，请检查网络连接。",
    doneNotice.textContent
  );

  // capturePreview：截图 / 预览不许出现横幅。
  const previewSandbox = makeDisplayBootSandbox("?capturePreview=1");
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "frontend/static/display-boot.js"), "utf8"),
    previewSandbox.context,
    { filename: "display-boot.js" }
  );
  const previewBridge = previewSandbox.context.window.HABridgeDisplayBoot;
  const previewNotice = previewSandbox.elements.get("display-notice");
  previewBridge.fail(new Error("不该出现的横幅"));
  previewBridge.setRuntimePush(false, "不该出现的横幅");
  previewBridge.notice("不该出现的横幅");
  check(
    "W4 capturePreview 截图模式不出现任何横幅（会污染截图）",
    previewNotice.hidden === true && previewNotice.textContent === "",
    `hidden=${previewNotice.hidden} text=${JSON.stringify(previewNotice.textContent)}`
  );
}

/* ------------------------------------------------------------------------- */
/* W6/W7：三个未激活页面（配网 / 初始化 / 授权）的提交与轮询                    */
/* ------------------------------------------------------------------------- */

/**
 * 造一个「表单页」垫片。
 *
 * 为什么抽成一处：login / setup / pair / license 四个未激活页面结构相同 —— 模块顶层
 * 抓若干元素、给 form 挂 submit、从 window 上取跳转入口。所以只能先铺好垫片再真的
 * import 磁盘上那一份，而垫片必须留到断言跑完（提交处理器在提交那一刻才
 * `new FormData(form)`）。四个页面各写一份垫片必然漂移，抽成一处只维护一份。
 *
 * @param {object} options
 * @param {string} options.formSelector form 的选择器（如 `#pair-form`）。
 * @param {object} [options.formFields={}] `FormData` 替身读的字段值。
 * @param {object} [options.formElements={}] `form.elements.<name>`（pair 页直接读 `elements.code`）。
 * @param {object} [options.selectors={}] 其余选择器 → 元素替身的初始属性（默认 `hidden: true`）。
 * @param {object} [options.location] 覆盖 location 垫片上的字段（如 `hash`、`hostname`）。
 * @param {object} [options.windowExtra={}] 附加到 window 垫片上的属性（如 setInterval）。
 * @returns {object} 垫片句柄：`listeners` / `submitButton` / `element(selector)` /
 *   `window` / `assignedLocations` / `replacedLocations` / `install()`（返回还原函数）。
 */
function createFormPageStub(options) {
  const {
    formSelector,
    formFields = {},
    formElements = {},
    selectors = {},
    location: locationOverrides = {},
    windowExtra = {}
  } = options;

  // 四个页面的按钮都是「提交期间禁用 + 文案可能被改写」，垫片跟着带这两样。
  // focus 要记账：W27 的修复点是「扫码之后把焦点交给主按钮」，
  // 不记账的话「有没有真的交」完全不可观测。
  const submitButton = {
    disabled: false,
    textContent: "",
    focused: false,
    focusCalls: 0,
    focus() {
      this.focused = true;
      this.focusCalls += 1;
    },
    setAttribute() {}
  };
  // 按钮里的文案节点必须是同一个对象：pair.js 扫码模式会改写它，
  // 每次 querySelector 返回新对象的话「文案有没有改成『连接』」就断言不了。
  const submitLabel = { textContent: "" };
  const listeners = new Map();
  const form = {
    fields: { ...formFields },
    elements: formElements,
    querySelector(selector) {
      // pair.js 在扫码模式下会改按钮里那个 span 的文案，所以两者都要认。
      if (selector.includes("span")) return submitLabel;
      return selector.includes('button[type="submit"]') ? submitButton : null;
    },
    querySelectorAll: () => [],
    get(name) {
      return this.fields[name];
    },
    addEventListener(type, handler) {
      listeners.set("form:" + type, handler);
    }
  };

  const elements = new Map();
  const makeElement = initial => ({
    hidden: true,
    textContent: "",
    required: false,
    addEventListener(type, handler) {
      listeners.set("element:" + type, handler);
    },
    querySelector: () => ({ required: false }),
    ...initial
  });
  const documentStub = {
    querySelector(selector) {
      if (selector === formSelector) return form;
      if (!elements.has(selector)) elements.set(selector, makeElement(selectors[selector]));
      return elements.get(selector);
    }
  };

  const assignedLocations = [];
  const replacedLocations = [];
  const windowStub = {
    location: {
      origin: "http://127.0.0.1:18081",
      pathname: "/probe",
      search: "",
      hash: "",
      hostname: "127.0.0.1",
      assign(url) {
        assignedLocations.push(String(url));
      },
      replace(url) {
        replacedLocations.push(String(url));
      },
      ...locationOverrides
    },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, handler) {
      listeners.set("window:" + type, handler);
    },
    ...windowExtra
  };

  return {
    listeners,
    form,
    submitButton,
    submitLabel,
    window: windowStub,
    assignedLocations,
    replacedLocations,
    element: selector => documentStub.querySelector(selector),
    /**
     * 装上垫片（并返回还原函数）。
     *
     * navigator 用 defineProperty 覆盖：pair.js 会通过 pairing-link.js 读它的 UA
     * 判断要不要弹「添加到主屏」引导，而宿主 Node 的 platform 是当前系统（macOS 上
     * 就是 "MacIntel"），不固定下来的话探针的结论会随机器变。
     */
    install() {
      const saved = {
        document: globalThis.document,
        window: globalThis.window,
        location: globalThis.location,
        history: globalThis.history,
        navigator: globalThis.navigator,
        FormData: globalThis.FormData
      };
      globalThis.document = documentStub;
      globalThis.window = windowStub;
      // pair.js 读的是裸 location（不是 window.location），两个名字都得铺。
      globalThis.location = windowStub.location;
      globalThis.history = { replaceState() {}, state: null };
      Object.defineProperty(globalThis, "navigator", {
        value: {
          userAgent: "Mozilla/5.0 (Macintosh) HomeOS-frontend-probe",
          platform: "MacIntel",
          maxTouchPoints: 0,
          standalone: false
        },
        configurable: true,
        writable: true
      });
      globalThis.FormData = class FormData {
        constructor(formElement) {
          this.formElement = formElement;
        }
        get(name) {
          return this.formElement.get(name);
        }
      };
      return () => {
        Object.assign(globalThis, {
          document: saved.document,
          window: saved.window,
          location: saved.location,
          history: saved.history,
          FormData: saved.FormData
        });
        Object.defineProperty(globalThis, "navigator", {
          value: saved.navigator,
          configurable: true,
          writable: true
        });
      };
    }
  };
}

/**
 * 把 window 上的 setInterval / clearInterval 接到假时钟上。
 *
 * license.js 用的是 `window.setInterval`，而假时钟只替换了全局的 `setTimeout`；
 * 用真实定时器会让整个套件变成「等 5 秒真的过去」，而假时钟下的轮询又根本不会走。
 *
 * @param {object} windowStub 表单页垫片上的 window。
 * @returns {{handles: object[], pending: () => number}} 已排上的间隔句柄。
 */
function installFakeIntervals(windowStub) {
  const handles = [];
  windowStub.setInterval = (callback, delay) => {
    const handle = { timerId: null, cleared: false };
    const arm = () => {
      handle.timerId = setTimeout(() => {
        if (handle.cleared) return;
        callback();
        arm();
      }, delay);
    };
    arm();
    handles.push(handle);
    return handle;
  };
  windowStub.clearInterval = handle => {
    handle.cleared = true;
    clearTimeout(handle.timerId);
  };
  return {
    handles,
    pending: () => handles.filter(handle => !handle.cleared).length
  };
}

/**
 * W6：配网页（/pair）的提交按钮必须恢复，请求必须带超时。
 *
 * @returns {Promise<void>}
 */
async function runPairSuite() {
  const clock = installFakeClock();
  const fakeFetch = installFakeFetch();
  const stub = createFormPageStub({
    formSelector: "#pair-form",
    formElements: {
      code: { value: "135790", addEventListener() {}, closest: () => ({ hidden: false }) }
    },
    selectors: {
      "#message": {},
      "#apple-pair-note": {},
      "#pair-title": { hidden: false },
      "#pair-description": { hidden: false }
    }
  });
  const restore = stub.install();
  try {
    await import(pathToFileURL(path.join(ROOT, "frontend/static/pair.js")).href);
    const submitHandler = stub.listeners.get("form:submit");
    check("W6 pair.js 注册了 submit 监听（脚本确实加载完成）", typeof submitHandler === "function");
    if (typeof submitHandler !== "function") return;

    // 1) 悬挂：按钮先禁用（防重复配对），到点必须恢复。
    fakeFetch.hang();
    const hangingSubmit = Promise.resolve(submitHandler({ preventDefault() {} })).catch(() => null);
    await flush();
    check(
      "W6 配对提交期间按钮被禁用（防重复配对同一台设备）",
      stub.submitButton.disabled === true,
      `disabled=${stub.submitButton.disabled}`
    );
    check(
      "W6 配对请求的定时器预算是 2e4 毫秒（弱网下按钮不会永久灰掉）",
      clock.delays().includes(20000),
      JSON.stringify(clock.delays())
    );
    clock.advance(20001);
    await hangingSubmit;
    check(
      "W6 配对请求悬挂 20 秒后按钮恢复可用",
      stub.submitButton.disabled === false,
      `disabled=${stub.submitButton.disabled}`
    );
    check(
      "W6 配对超时给出可读提示（用户知道该重试而不是刷新页面）",
      /请求超时：\/displays\/pair/.test(stub.element("#message").textContent),
      stub.element("#message").textContent
    );

    // 2) 非 2xx：后端 detail 原样成为错误文案（文案归后端所有）。
    fakeFetch.response(400, '{"detail":"配对码无效或已过期。"}', { ok: false });
    await submitHandler({ preventDefault() {} });
    check(
      "W6 配对失败文案仍取后端 detail（没有被超时层改写）",
      stub.element("#message").textContent === "配对码无效或已过期。",
      stub.element("#message").textContent
    );
    check(
      "W6 配对失败后按钮同样恢复可用",
      stub.submitButton.disabled === false,
      `disabled=${stub.submitButton.disabled}`
    );

    // 3) 跨站的 targetUrl 必须被拒（服务端被污染也不能把用户带去外站）。
    fakeFetch.response(200, '{"targetUrl":"https://evil.example/display/x"}');
    await submitHandler({ preventDefault() {} });
    check(
      "W6 跨站的 targetUrl 仍然被拒（同源守卫没被这次改动松开）",
      stub.replacedLocations.length === 0 && /面板地址无效/.test(stub.element("#message").textContent),
      `replaced=${JSON.stringify(stub.replacedLocations)} message=${stub.element("#message").textContent}`
    );

    // 4) 成功：跳到自己站点的展示页，按钮也复位（成功路径不能被 finally 之外的写法漏掉）。
    fakeFetch.response(200, '{"targetUrl":"/display/abc123"}');
    await submitHandler({ preventDefault() {} });
    check(
      "W6 配对成功后跳转到同源展示页",
      stub.replacedLocations.length === 1 && stub.replacedLocations[0] === "/display/abc123",
      JSON.stringify(stub.replacedLocations)
    );
    check(
      "W6 配对成功后按钮也复位（不是只在失败分支里复位）",
      stub.submitButton.disabled === false,
      `disabled=${stub.submitButton.disabled}`
    );
  } finally {
    restore();
  }
}

/**
 * W27：扫码带入配对码之后，焦点不能掉到 body 上。
 *
 * 为什么单独一个套件：模块只能 import 一次（Node 的模块缓存），而扫码分支是在
 * 模块加载时执行的，所以它必须和 runPairSuite 分开跑、各占一个进程。
 *
 * 三件事一起测，因为缺陷正是「少做了一件」：
 *  1. 配对码要填进输入框；
 *  2. **手输入口不能隐藏** —— 把焦点所在的元素藏起来，浏览器会把焦点甩回 body，
 *     键盘 / 读屏用户直接落到页面顶部，等于失去了「改一下再连」的退路；
 *  3. 焦点要交给主操作按钮，用户按 Enter 就能连。
 *
 * @returns {Promise<void>}
 */
async function runPairScanSuite() {
  installFakeClock();
  installFakeFetch();
  // 常驻的 label 节点：pair.js 若又去藏它，这里看得见。
  const labelStub = { hidden: false };
  const stub = createFormPageStub({
    formSelector: "#pair-form",
    formElements: {
      code: { value: "", addEventListener() {}, closest: () => labelStub }
    },
    selectors: {
      "#message": {},
      "#apple-pair-note": {},
      "#pair-title": { hidden: false },
      "#pair-description": { hidden: false }
    },
    // 扫码链接的固定落点是 /pair?scan=1#code=...，解析器会逐项校验路径与查询串。
    location: { search: "?scan=1", pathname: "/pair" },
    windowExtra: {
      __HA_BRIDGE_PAIRING_HASH__: "#code=135790&type=homeos-pair&version=1"
    }
  });
  const restore = stub.install();
  try {
    await import(pathToFileURL(path.join(ROOT, "frontend/static/pair.js")).href);

    check(
      "W27 扫码带入的配对码填进了输入框",
      stub.form.elements.code.value === "135790",
      `code=${stub.form.elements.code.value}`
    );
    check(
      "W27 扫码后手机输入口仍然可见（藏起聚焦中的元素会把焦点甩回 body，用户也没法改码）",
      labelStub.hidden === false,
      `labelHidden=${labelStub.hidden}`
    );
    check(
      "W27 扫码后焦点交给主操作按钮（键盘 / 读屏用户不用自己找，按 Enter 就能连）",
      stub.submitButton.focused === true && stub.submitButton.focusCalls === 1,
      JSON.stringify({
        focused: stub.submitButton.focused,
        focusCalls: stub.submitButton.focusCalls
      })
    );
    check(
      "W27 扫码后主按钮文案改成「连接」（保留手输入口，文案要说明这一步是连接）",
      stub.submitLabel.textContent === "连接",
      JSON.stringify(stub.submitLabel.textContent)
    );
    check(
      "W27 扫码后标题与说明同步改成连接引导（否则页面还写着「输入 6 位配对码」）",
      stub.element("#pair-title").textContent === "连接 HomeOS" &&
        /已识别配对二维码/.test(stub.element("#pair-description").textContent),
      JSON.stringify({
        title: stub.element("#pair-title").textContent,
        description: stub.element("#pair-description").textContent
      })
    );

    // 无效哈希（配对码只有 2 位）：只提示原因，不许抢焦点、不许把输入口藏起来。
    stub.window.__HA_BRIDGE_PAIRING_HASH__ = "#code=12&type=homeos-pair&version=1";
    const hashListener = stub.listeners.get("window:homeos-pairing-link");
    check("W27 扫码事件被接上了（否则下面这条断言是空跑）", typeof hashListener === "function");
    hashListener?.();
    check(
      "W27 无效二维码只提示原因，输入口仍可见、仍可编辑（保留退路）",
      labelStub.hidden === false &&
        stub.form.elements.code.value === "" &&
        /配对链接无效/.test(stub.element("#message").textContent),
      JSON.stringify({
        labelHidden: labelStub.hidden,
        code: stub.form.elements.code.value,
        message: stub.element("#message").textContent
      })
    );
  } finally {
    restore();
  }
}

/**
 * W6：初始化页（/setup）的提交按钮必须恢复，请求必须带超时。
 *
 * @returns {Promise<void>}
 */
async function runSetupSuite() {
  const clock = installFakeClock();
  const fakeFetch = installFakeFetch();
  const stub = createFormPageStub({
    formSelector: "#setup-form",
    formFields: {
      username: "pcskycn",
      password: "hunter2hunter2",
      passwordConfirmation: "hunter2hunter2",
      setupToken: ""
    },
    selectors: { "#message": {}, "#setup-token-field": { hidden: true } }
  });
  const restore = stub.install();
  try {
    await import(pathToFileURL(path.join(ROOT, "frontend/static/setup.js")).href);
    const submitHandler = stub.listeners.get("form:submit");
    check("W6 setup.js 注册了 submit 监听（脚本确实加载完成）", typeof submitHandler === "function");
    if (typeof submitHandler !== "function") return;

    // 1) 两次密码不一致：纯前端校验，必须立刻提示且不发请求（也不该把按钮禁用）。
    stub.form.fields.passwordConfirmation = "mismatch";
    fakeFetch.calls.length = 0;
    await submitHandler({ preventDefault() {} });
    check(
      "W6 两次密码不一致时不发请求（前端校验先拦住）",
      fakeFetch.calls.length === 0,
      `calls=${fakeFetch.calls.length}`
    );
    check(
      "W6 早退分支不让按钮进入禁用态（否则用户改完密码也点不动）",
      stub.submitButton.disabled === false,
      `disabled=${stub.submitButton.disabled}`
    );
    stub.form.fields.passwordConfirmation = "hunter2hunter2";

    // 2) 悬挂：按钮禁用 → 20 秒超时 → 必须恢复。
    fakeFetch.hang();
    const hangingSubmit = Promise.resolve(submitHandler({ preventDefault() {} })).catch(() => null);
    await flush();
    check(
      "W6 初始化提交期间按钮被禁用",
      stub.submitButton.disabled === true,
      `disabled=${stub.submitButton.disabled}`
    );
    check(
      "W6 初始化请求的定时器预算是 2e4 毫秒",
      clock.delays().includes(20000),
      JSON.stringify(clock.delays())
    );
    clock.advance(20001);
    await hangingSubmit;
    check(
      "W6 初始化请求悬挂 20 秒后按钮恢复可用",
      stub.submitButton.disabled === false,
      `disabled=${stub.submitButton.disabled}`
    );

    // 3) FastAPI 校验错误是数组：必须取 detail[0].msg（否则用户看到「初始化失败」）。
    fakeFetch.response(422, '{"detail":[{"msg":"密码长度至少 10 位"}]}', { ok: false });
    await submitHandler({ preventDefault() {} });
    check(
      "W6 后端数组形态的校验错误仍然取出可读文案",
      stub.element("#message").textContent === "密码长度至少 10 位",
      stub.element("#message").textContent
    );

    // 4) 成功：跳去授权页，按钮复位。
    fakeFetch.response(200, '{"ok":true}');
    await submitHandler({ preventDefault() {} });
    check(
      "W6 初始化成功后跳转到授权页",
      stub.assignedLocations.length === 1 && stub.assignedLocations[0] === "/license",
      JSON.stringify(stub.assignedLocations)
    );
    check(
      "W6 初始化成功后按钮也复位",
      stub.submitButton.disabled === false,
      `disabled=${stub.submitButton.disabled}`
    );
  } finally {
    restore();
  }
}

/**
 * W6/W7：授权页（/license）的激活提交与 5 秒轮询。
 *
 * @returns {Promise<void>}
 */
async function runLicenseSuite() {
  const clock = installFakeClock();
  const fakeFetch = installFakeFetch();
  const stub = createFormPageStub({
    formSelector: "#license-form",
    formFields: { email: "buyer@example.com", activationCode: "ABC-123" },
    selectors: {
      "#message": {},
      "#license-status-text": { hidden: false },
      "#license-recovery-hint": {},
      "#logout": { hidden: false }
    }
  });
  const intervals = installFakeIntervals(stub.window);
  const restore = stub.install();
  try {
    // 初始那一次状态请求就挂住：轮询守卫与「闩会不会永久卡住」都在这上面看。
    fakeFetch.hang();
    await import(pathToFileURL(path.join(ROOT, "frontend/static/license.js")).href);
    const submitHandler = stub.listeners.get("form:submit");
    check("W6 license.js 注册了 submit 监听（脚本确实加载完成）", typeof submitHandler === "function");
    const statusCalls = () => fakeFetch.calls.filter(call => call.url.includes("/license/status")).length;

    check(
      "W7 初始状态请求的定时器预算是 2e4 毫秒（没有预算的轮询会越堆越多）",
      clock.delays().includes(20000),
      JSON.stringify(clock.delays())
    );
    check("W7 初始状态请求发了且只发了一次", statusCalls() === 1, `calls=${statusCalls()}`);
    check(
      "W7 授权页排上了 5 秒轮询",
      intervals.pending() === 1,
      `pending=${intervals.pending()}`
    );

    // 1) 5 秒那一拍：上一次还挂着 → 必须跳过（W7 的核心：不叠加悬挂请求）。
    clock.advance(5001);
    await flush();
    check(
      "W7 上一次状态请求还没回来时，下一拍跳过（悬挂请求不叠加在同源连接上）",
      statusCalls() === 1,
      `calls=${statusCalls()}`
    );

    // 2) 20 秒超时：闩必须释放，否则一次弱网就把轮询永久冻住（这正是不加守卫的另一半风险）。
    clock.advance(20001);
    await flush();
    check(
      "W7 状态请求超时后给出提示（用户知道是授权服务没应声）",
      /请求超时：\/license\/status/.test(stub.element("#license-status-text").textContent),
      stub.element("#license-status-text").textContent
    );
    clock.advance(5001);
    await flush();
    check(
      "W7 超时后轮询闩释放：下一拍真的重新发请求（有超时兜底，守卫不会把轮询锁死）",
      statusCalls() === 2,
      `calls=${statusCalls()}`
    );

    // 3) 401：必须回登录页（而不是把「无法读取授权状态」摆给用户）。
    //    注意 advance() 是同步的：它一口气把定时器全部跑完，但「闩释放」发生在
    //    await 的续体（微任务）里。所以要先 flush 让上一拍那个悬挂请求的超时落地，
    //    再推进下一拍 —— 否则下一拍看到的闩还是 held（这不是被测代码的问题，
    //    是假时钟的固有性质，探针必须照它的规则来）。
    fakeFetch.response(401, "{}", { ok: false });
    clock.advance(20001);
    await flush();
    clock.advance(5001);
    await flush();
    check(
      "W7 状态接口 401 时回登录页",
      stub.replacedLocations.includes("/login"),
      JSON.stringify({ replaced: stub.replacedLocations, calls: statusCalls() })
    );

    // 4) 激活提交：悬挂 → 超时 → 按钮与 activationPending 都要复位（否则用户改完激活码点不动）。
    fakeFetch.hang();
    const hangingActivate = Promise.resolve(submitHandler({ preventDefault() {} })).catch(() => null);
    await flush();
    check(
      "W6 激活提交期间按钮被禁用（防重复提交）",
      stub.submitButton.disabled === true,
      `disabled=${stub.submitButton.disabled}`
    );
    check(
      "W6 激活请求的定时器预算是 2e4 毫秒（没有预算，激活中按钮就再也回不来）",
      clock.delays().includes(20000),
      JSON.stringify(clock.delays())
    );
    clock.advance(20001);
    await hangingActivate;
    check(
      "W6 激活请求悬挂 20 秒后按钮恢复可用",
      stub.submitButton.disabled === false,
      `disabled=${stub.submitButton.disabled}`
    );
    check(
      "W6 激活超时给出可读提示",
      /请求超时：\/license\/activate/.test(stub.element("#message").textContent),
      stub.element("#message").textContent
    );

    // 5) 激活成功但不含编辑器权益：文案必须区分开（两种情况的下一步动作不同）。
    fakeFetch.response(200, '{"status":"ACTIVE","allowed":true,"editorAllowed":false}');
    await submitHandler({ preventDefault() {} });
    check(
      "W6 「授权有效但不含编辑器权益」有专门文案",
      stub.element("#message").textContent === "激活成功，但当前商品未包含编辑器权益。",
      stub.element("#message").textContent
    );

    // 6) 激活成功：这一次能真的发出去（证明上一步的超时把 activationPending 复位了），并跳转。
    fakeFetch.calls.length = 0;
    fakeFetch.response(200, '{"status":"ACTIVE","allowed":true,"editorAllowed":true}');
    await submitHandler({ preventDefault() {} });
    check(
      "W6 超时之后能再次提交激活（activationPending 已在 finally 里复位）",
      fakeFetch.calls.some(call => call.url.includes("/license/activate")),
      `calls=${JSON.stringify(fakeFetch.calls.map(call => call.url))}`
    );
    check(
      "W6 激活成功即进入编辑器（location.replace，返回键回不到授权页）",
      stub.replacedLocations.includes("/"),
      JSON.stringify(stub.replacedLocations)
    );
    check(
      "W7 进入编辑器时停掉轮询（跳转瞬间不再多发一次状态请求）",
      intervals.pending() === 0,
      `pending=${intervals.pending()}`
    );
  } finally {
    restore();
  }
}

/* ------------------------------------------------------------------------- */
/* W8/W9：编辑器启动分片与草稿恢复快照                                        */
/* ------------------------------------------------------------------------- */

/**
 * W8：启动分片加载（一片失败不该让整块面板空白）。
 *
 * 这三个函数从 `home.js` 按源码切出来在 vm 里跑，六个加载动作换成受控桩 ——
 * 「哪几片失败」由探针摆出来。测的是三件事：失败片的**名字**能不能进报错文案、
 * 面板是不是**照样渲染**、以及「一片失败」与「六片失败」是不是都被合成一条告警。
 *
 * @returns {Promise<void>}
 */
async function runHomeBootSuite() {
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/home.js"), "utf8");
  const bootSource = ["editorBootSlices", "loadEditorBootSlices", "reportBootFailures"]
    .map(functionName => extractFunction(source, functionName))
    .join("\n\n");

  const loaderCalls = [];
  const renderCalls = [];
  const logEntries = [];
  const dialogs = [];
  let failingSliceNames = new Set();
  const makeLoader = sliceName => () => {
    loaderCalls.push(sliceName);
    return failingSliceNames.has(sliceName)
      // 故意用一个**不含分片名**的失败原因：真实的网络失败（TypeError: Failed to
      // fetch）不会替我们说出是哪一分片坏了。第一版垫片写的是 `${sliceName}读取失败`，
      // 于是「告警文案点出是哪一片」这条断言在「聚合文案被删掉」时仍然是绿的 ——
      // 分片名从失败原因里漏进去了，断言测到的就不是它该测的东西。
      ? Promise.reject(new Error("Failed to fetch"))
      : Promise.resolve(sliceName);
  };
  const context = vm.createContext({
    console,
    activeProject: null,
    refreshAuthSession: makeLoader("会话"),
    refreshLicenseStatus: makeLoader("授权状态"),
    refreshHaConnection: makeLoader("Home Assistant 连接"),
    loadProjects: makeLoader("项目列表"),
    reloadAssetCatalog: makeLoader("素材目录"),
    ensureEntitiesLoaded: makeLoader("实体清单"),
    renderComponentLists: () => renderCalls.push("render"),
    handleOperationError: (operationError, options) =>
      dialogs.push({
        message: operationError?.message || "",
        name: operationError?.name || "",
        phase: options?.phase || ""
      }),
    window: {
      HABridgeLog: {
        error: (operationError, logContext) =>
          logEntries.push({ message: operationError?.message || "", ...logContext })
      }
    }
  });
  vm.runInContext(bootSource, context);

  const reset = () => {
    loaderCalls.length = 0;
    renderCalls.length = 0;
    logEntries.length = 0;
    dialogs.length = 0;
    failingSliceNames = new Set();
  };

  const bootSlices = context.editorBootSlices();
  check(
    "W8 启动分片清单每片都有名字（名字是报错能指认是哪一片的前提）",
    bootSlices.length === 6 &&
      bootSlices.every(
        ([sliceName, loadSlice]) =>
          typeof sliceName === "string" && sliceName.length > 0 && typeof loadSlice === "function"
      ),
    JSON.stringify(bootSlices.map(([sliceName]) => sliceName))
  );

  // 1) 一片失败：面板必须照样画出来（修复前 renderComponentLists 整段被跳过）。
  failingSliceNames = new Set(["项目列表"]);
  await context.loadEditorBootSlices();
  check(
    "W8 一片失败时组件面板照样渲染（修复前是整块面板空白）",
    renderCalls.length === 1,
    `render=${renderCalls.length}`
  );
  check(
    "W8 一片失败时六片照样全部发出（一片失败不该让另外五片的成果作废）",
    loaderCalls.length === 6,
    JSON.stringify(loaderCalls)
  );
  check(
    "W8 告警文案点出是哪一片失败（不是一句「操作失败」）",
    dialogs.length === 1 &&
      dialogs[0].message.includes("项目列表") &&
      !dialogs[0].message.includes("素材目录"),
    JSON.stringify(dialogs)
  );
  check(
    "W8 失败片的日志带 phase=editor-boot 与 slice 名字（后台能按片归因）",
    logEntries.some(entry => entry.phase === "editor-boot" && entry.slice === "项目列表"),
    JSON.stringify(logEntries)
  );

  // 2) 全部成功：不许弹任何告警（修复不能变成「处处告警」）。
  reset();
  await context.loadEditorBootSlices();
  check(
    "W8 全部成功时不弹告警（否则这条提示会被用户当成噪声关掉）",
    dialogs.length === 0 && logEntries.length === 0,
    JSON.stringify({ dialogs, logEntries })
  );
  check("W8 全部成功时面板也只渲染一次", renderCalls.length === 1, `render=${renderCalls.length}`);

  // 3) 六片全失败：只合成一条告警，但把六片都列出来；且绝不抛。
  reset();
  failingSliceNames = new Set(bootSlices.map(([sliceName]) => sliceName));
  let allFailedThrew = false;
  await context.loadEditorBootSlices().catch(() => {
    allFailedThrew = true;
    return null;
  });
  check("W8 六片同时失败也不抛（allSettled 的语义：没有「第一个 rejection」）", !allFailedThrew);
  check(
    "W8 六片同时失败只弹一条告警（弹六次等于什么都没说）",
    dialogs.length === 1 && dialogs[0].name === "EditorBootSliceError",
    JSON.stringify(dialogs)
  );
  check(
    "W8 六片同时失败的文案把六片都列出来",
    bootSlices.every(([sliceName]) => dialogs[0]?.message.includes(sliceName)),
    dialogs[0]?.message || ""
  );
  check(
    "W8 六片同时失败时面板仍然渲染（用户至少还能看见自己有的东西）",
    renderCalls.length === 1,
    `render=${renderCalls.length}`
  );
  check(
    "W8 告警走的是带阶段名的通道（phase=editor-boot，便于日志归因）",
    dialogs[0]?.phase === "editor-boot",
    JSON.stringify(dialogs[0] || null)
  );
}

/**
 * W9：草稿恢复快照的内容与失败告警。
 *
 * `scheduleRecoverySnapshot` / `persistRecoverySnapshot` / `notifyRecoveryWriteFailure`
 * 三个函数按源码切出来跑，`recoveryWriter` 用的是 `editor-history.js` 里**真的**那一个
 * （只把定时器换成受控的），存储换成带配额的替身 —— 「配额爆了会怎样」是这一条的一半，
 * 没有失败路径就测不到。
 *
 * 断言详情一律走 `summarizeSnapshot`：快照里可能躺着 400 KB 的填充数据，把整份快照塞进
 * detail 会把探针的结果 JSON 撑到管道缓冲区之外（见 `writeSync` 的说明）。
 *
 * @returns {Promise<void>}
 */
function summarizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return String(snapshot);
  }
  return JSON.stringify({
    keys: Object.keys(snapshot),
    revision: snapshot.revision ?? null,
    documentPages: Array.isArray(snapshot.document?.pages) ? snapshot.document.pages.length : null,
    selectedPath: snapshot.selectedPath ?? null,
    selectedComponentCount: Array.isArray(snapshot.selectedComponentIds)
      ? snapshot.selectedComponentIds.length
      : null,
    historyBytes: snapshot.undo || snapshot.redo ? JSON.stringify(snapshot).length : 0
  });
}

async function runHomeSnapshotSuite() {
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/home.js"), "utf8");
  const recoverySource = [
    extractVariableDeclaration(source, "recoveryFailureNotifiedProjectId"),
    extractFunction(source, "scheduleRecoverySnapshot"),
    extractFunction(source, "persistRecoverySnapshot"),
    extractFunction(source, "notifyRecoveryWriteFailure")
  ].join("\n\n");
  const { createRecoveryWriter, recoveryStorageKey } = await import(
    pathToFileURL(path.join(ROOT, "frontend/static/editor-history.js")).href
  );

  const storage = makeQuotaStorage();
  const dialogs = [];
  const logEntries = [];
  const documentStub = { visibilityState: "visible" };
  const scheduledTimers = [];
  const context = vm.createContext({
    console,
    sessionStorage: storage,
    document: documentStub,
    recoveryStorageKey,
    RECOVERY_STORAGE_PREFIX: "homeos:unsaved:",
    activeProject: null,
    hasUnsavedChanges: false,
    pageSelectElement: { value: "/overview" },
    selectedComponentId: "component-1",
    selectedComponentIds: new Set(["component-1"]),
    historyState: { undo: [], redo: [], busy: false },
    handleOperationError: (operationError, options) =>
      dialogs.push({
        message: operationError?.message || "",
        name: operationError?.name || "",
        phase: options?.phase || ""
      }),
    window: {
      HABridgeLog: {
        error: (operationError, logContext) =>
          logEntries.push({ message: operationError?.message || "", ...logContext })
      }
    }
  });
  vm.runInContext(recoverySource, context);
  // 写入器用真的那一个（editor-history.js）：节流/合并/切项目先落盘这些语义都在它身上，
  // 探针要证明的是「排进去的内容」与「真写进去的内容」，不是等 200 毫秒。
  context.recoveryWriter = createRecoveryWriter(
    recoveryState => context.persistRecoverySnapshot(recoveryState),
    {
      delay: 200,
      setTimer: callback => {
        scheduledTimers.push(callback);
        return scheduledTimers.length;
      },
      clearTimer: () => {}
    }
  );

  const flushSnapshot = () => {
    context.recoveryWriter.flush();
  };

  // 一份「未保存的文档 + 很胖的历史栈」：历史栈在内存里（撤销还要用），但绝不该进快照。
  context.activeProject = {
    projectId: "project-1",
    revision: 3,
    document: { pages: [{ path: "/overview", components: [{ id: "component-1" }] }] }
  };
  context.hasUnsavedChanges = true;
  context.historyState.undo = Array.from({ length: 20 }, (_, index) => ({
    kind: "edit",
    document: { filler: "x".repeat(20000), index }
  }));
  context.historyState.redo = [{ kind: "edit", document: { filler: "y".repeat(20000) } }];

  context.scheduleRecoverySnapshot();
  flushSnapshot();
  const storedSnapshot = JSON.parse(storage.getItem("homeos:unsaved:project-1") || "null");
  check(
    "W9 快照里不再带撤销/重做栈（历史栈是 200ms 一节流里最贵的那一项）",
    storedSnapshot !== null && storedSnapshot.undo === undefined && storedSnapshot.redo === undefined,
    summarizeSnapshot(storedSnapshot)
  );
  check(
    "W9 快照仍然带着文档本体、revision 与选择集（去掉历史栈不能把要救的东西也去掉）",
    storedSnapshot?.document?.pages?.[0]?.components?.[0]?.id === "component-1" &&
      storedSnapshot?.revision === 3 &&
      storedSnapshot?.selectedPath === "/overview" &&
      storedSnapshot?.selectedComponentId === "component-1" &&
      storedSnapshot?.selectedComponentIds?.[0] === "component-1",
    summarizeSnapshot(storedSnapshot)
  );
  check(
    "W9 配额充足时成功写入不弹告警",
    dialogs.length === 0,
    JSON.stringify(dialogs)
  );

  // 1) 配额爆掉：必须让用户知道，而且只尝试写一次。
  storage.setQuota(64);
  storage.attempts.length = 0;
  context.activeProject = { ...context.activeProject, revision: 4 };
  context.scheduleRecoverySnapshot();
  flushSnapshot();
  context.activeProject = { ...context.activeProject, revision: 5 };
  context.scheduleRecoverySnapshot();
  flushSnapshot();
  context.activeProject = { ...context.activeProject, revision: 6 };
  context.scheduleRecoverySnapshot();
  flushSnapshot();
  check(
    "W9 写不进去时给出告警（草稿恢复失效而页面毫无异样，用户会一直以为有兜底）",
    dialogs.length === 1 && dialogs[0].name === "RecoverySnapshotError",
    JSON.stringify(dialogs)
  );
  check(
    "W9 告警文案说清后果与下一步（让用户改成手动保存）",
    dialogs[0]?.message.includes("草稿恢复快照") && dialogs[0]?.message.includes("手动保存"),
    dialogs[0]?.message || ""
  );
  check(
    "W9 连续失败只提醒一次（写入是 200ms 一节流的，不去重就是反复弹同一个框）",
    dialogs.length === 1,
    `dialogs=${dialogs.length}`
  );
  check(
    "W9 写不进去时也只尝试一次（不再「先序列化一版大的、失败再写一版小的」）",
    storage.attempts.length === 3,
    `attempts=${storage.attempts.length}`
  );
  check(
    "W9 每次失败都进日志（同一项目只弹一次，但每一次都要留痕）",
    logEntries.filter(entry => entry.phase === "recovery-snapshot").length === 3,
    JSON.stringify(logEntries.map(entry => entry.phase))
  );

  // 2) 空间腾出来之后：下一次失败必须能重新提醒。
  storage.setQuota(Number.MAX_SAFE_INTEGER);
  context.activeProject = { ...context.activeProject, revision: 7 };
  context.scheduleRecoverySnapshot();
  flushSnapshot();
  storage.setQuota(64);
  context.activeProject = { ...context.activeProject, revision: 8 };
  context.scheduleRecoverySnapshot();
  flushSnapshot();
  check(
    "W9 写入成功过之后再失败要能重新提醒（否则用户腾出空间也永远听不到第二次）",
    dialogs.length === 2,
    `dialogs=${dialogs.length}`
  );

  // 3) 页面不可见（pagehide / beforeunload 那一跳）：只记日志，不弹对话框。
  //    先写成功一次，把「已提醒过」的闩复位 —— 否则上一段的去重会替可见性判断兜底，
  //    这一条即使在可见性分支被删掉之后也照样是绿的（去重把缺陷藏起来了）。
  storage.setQuota(Number.MAX_SAFE_INTEGER);
  context.activeProject = { ...context.activeProject, revision: 9 };
  context.scheduleRecoverySnapshot();
  flushSnapshot();
  documentStub.visibilityState = "hidden";
  storage.setQuota(64);
  dialogs.length = 0;
  logEntries.length = 0;
  context.activeProject = { ...context.activeProject, revision: 10 };
  context.scheduleRecoverySnapshot();
  flushSnapshot();
  check(
    "W9 页面不可见时不弹对话框（那时弹窗既看不见也没意义）",
    dialogs.length === 0,
    JSON.stringify(dialogs)
  );
  check(
    "W9 页面不可见时仍然记日志（离开页面那一刻的失败同样是事实）",
    logEntries.some(entry => entry.phase === "recovery-snapshot"),
    JSON.stringify(logEntries)
  );

  // 4) 没有未保存改动：不写快照（别用一份「等于已保存内容」的快照盖掉更有价值的旧快照）。
  documentStub.visibilityState = "visible";
  storage.setQuota(Number.MAX_SAFE_INTEGER);
  storage.attempts.length = 0;
  context.hasUnsavedChanges = false;
  context.activeProject = { ...context.activeProject, revision: 11 };
  context.scheduleRecoverySnapshot();
  flushSnapshot();
  check(
    "W9 没有未保存改动时不写快照（保留旧快照里的未保存内容）",
    storage.attempts.length === 0,
    `attempts=${storage.attempts.length}`
  );
}

/**
 * W10：乐观开关等不到状态确认时的回滚与提示。
 *
 * `applyOptimisticToggle` 按源码切出来（类方法 → `fn.call(替身 this)`），计时器交给
 * 桩接管 —— 于是「8 秒后回滚」可以精确摆出来，而不是真的等 8 秒。
 *
 * 这一条测的是「界面自己变色又自己变回去」这个形态：用户唯一的解释是「点了没反应」，
 * 于是会反复点；修复后回滚必须带一条一次性提示。反向也要测 ——
 * **已经有人处理过**（手动撤销 / HA 推送到达）时不许报错，否则正常操作也会弹提示。
 *
 * @returns {Promise<void>}
 */
async function runOptimisticToggleSuite() {
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/renderer/renderer.js"), "utf8");
  const toggleSource = [
    extractVariableDeclaration(source, "OPTIMISTIC_TOGGLE_CONFIRM_TIMEOUT_MS"),
    extractFunction(source, "createOptimisticToggleTimeoutError"),
    extractClassMethod(source, "applyOptimisticToggle")
  ].join("\n\n");

  const fixedNow = 1_700_000_000_000;
  const scheduledTimers = [];
  const reportedErrors = [];
  const context = vm.createContext({
    console,
    // 只换成可拨的「现在」：被测代码用 Date.now() 记 expiresAt，探针要给得出确定值。
    Date: { now: () => fixedNow },
    window: {
      setTimeout: (callback, delayMs) => {
        scheduledTimers.push({ callback, delayMs });
        return scheduledTimers.length;
      },
      clearTimeout: timerId => {
        if (scheduledTimers[timerId - 1]) {
          scheduledTimers[timerId - 1].cancelled = true;
        }
      }
    },
    // 覆盖域实体才走的三个助手：本例用 light. 实体，真被调用就说明分支判断错了。
    coverComponentIsDream: () => {
      throw new Error("非 cover 实体不该走 cover 分支");
    },
    runtimeEntityStateIsActive: () => {
      throw new Error("非 cover 实体不该走 cover 分支");
    },
    runtimeCoverStateIsActive: () => {
      throw new Error("非 cover 实体不该走 cover 分支");
    },
    entityPowerIsOn: (entityId, entityState, powerComponent) => !!powerComponent?.on,
    optimisticToggleState: (entityId, entityState, powerComponent) => ({
      ...entityState,
      state: powerComponent?.on ? "on" : "off"
    })
  });
  vm.runInContext(toggleSource, context);

  const makeRendererStub = () => ({
    states: new Map([["light.kitchen", { entityId: "light.kitchen", state: "off" }]]),
    entityMetadata: new Map(),
    pendingOptimisticStates: new Map(),
    visualUpdates: [],
    powerEntityId: () => "light.kitchen",
    runtimePowerComponent: powerComponent => powerComponent,
    cachedLightVisualState: () => null,
    updateOptimisticToggleVisuals(entityId) {
      this.visualUpdates.push(entityId);
    },
    options: {
      onError: error => reportedErrors.push(error)
    }
  });

  // 1) 交互先变色，并把回滚排进定时器（两处必须用同一个值，这里比对的就是这一点）。
  scheduledTimers.length = 0;
  reportedErrors.length = 0;
  const renderer = makeRendererStub();
  const rollbackOptimistic = context.applyOptimisticToggle.call(renderer, "light.kitchen", {
    on: true
  });
  const pendingEntry = renderer.pendingOptimisticStates.get("light.kitchen");
  const expiryTimer = scheduledTimers[0];
  check(
    "W10 乐观态先落界面（等 HA 推送再变色会有明显延迟）",
    renderer.states.get("light.kitchen")?.state === "on" &&
      renderer.visualUpdates.length === 1,
    JSON.stringify({ state: renderer.states.get("light.kitchen"), updates: renderer.visualUpdates })
  );
  check(
    "W10 回滚排期与 expiresAt 是同一个值（8 秒，改一处必须同步改另一处）",
    expiryTimer?.delayMs === 8000 && pendingEntry?.expiresAt === fixedNow + 8000,
    JSON.stringify({ delayMs: expiryTimer?.delayMs, expiresAt: pendingEntry?.expiresAt })
  );

  // 2) 8 秒内没有确认：回滚到上报值，并且必须说出来。
  expiryTimer.callback();
  check(
    "W10 超时回滚到设备上报的状态",
    renderer.states.get("light.kitchen")?.state === "off" &&
      !renderer.pendingOptimisticStates.has("light.kitchen"),
    JSON.stringify(renderer.states.get("light.kitchen") || null)
  );
  check(
    "W10 回滚必须给用户一条提示（否则「点了没反应」会被解释成按钮坏了，反复点）",
    reportedErrors.length === 1 && reportedErrors[0]?.name === "OptimisticToggleTimeoutError",
    JSON.stringify(reportedErrors.map(error => error?.name))
  );
  check(
    "W10 提示文案说清「多久没确认」与「哪个实体」",
    reportedErrors[0]?.message.includes("8 秒") &&
      reportedErrors[0]?.message.includes("light.kitchen") &&
      reportedErrors[0]?.message.includes("已恢复"),
    reportedErrors[0]?.message || ""
  );

  // 3) 已经手动撤销过（双击 / 长按抢走手势、或调用失败回滚）：定时器再跑也不许报错。
  reportedErrors.length = 0;
  const manualRenderer = makeRendererStub();
  const manualRollback = context.applyOptimisticToggle.call(manualRenderer, "light.kitchen", {
    on: true
  });
  const manualExpiryTimer = scheduledTimers[scheduledTimers.length - 1];
  manualRollback();
  manualExpiryTimer.callback();
  check(
    "W10 已经撤销过的乐观态不再报错（手动回滚 / 失败的路径不该弹提示）",
    reportedErrors.length === 0,
    JSON.stringify(reportedErrors.map(error => error?.message))
  );

  // 4) HA 推送按时到达（推送路径会清掉 pending 并写入新状态）：也不许报错。
  reportedErrors.length = 0;
  const ackedRenderer = makeRendererStub();
  context.applyOptimisticToggle.call(ackedRenderer, "light.kitchen", { on: true });
  const ackedExpiryTimer = scheduledTimers[scheduledTimers.length - 1];
  ackedRenderer.pendingOptimisticStates.delete("light.kitchen");
  const confirmedState = { entityId: "light.kitchen", state: "on" };
  ackedRenderer.states.set("light.kitchen", confirmedState);
  ackedExpiryTimer.callback();
  check(
    "W10 设备按时回报时一句提示都不出（正常操作不该被当成故障）",
    reportedErrors.length === 0 && ackedRenderer.states.get("light.kitchen") === confirmedState,
    JSON.stringify(reportedErrors.map(error => error?.message))
  );

  // 5) 返回的回滚函数仍然还原「确认过的」那一份状态（既有语义不许被这次改动带偏）。
  const restoreRenderer = makeRendererStub();
  const restoreRollback = context.applyOptimisticToggle.call(restoreRenderer, "light.kitchen", {
    on: true
  });
  restoreRollback();
  check(
    "W10 调用方拿到的回滚函数仍然还原确认过的状态（失败时由它兜底）",
    restoreRenderer.states.get("light.kitchen")?.state === "off" &&
      restoreRenderer.pendingOptimisticStates.size === 0,
    JSON.stringify(restoreRenderer.states.get("light.kitchen") || null)
  );
}

/**
 * W12：ESC 逐层收口。
 *
 * `bindRuntimeDialogEscapeClose` 按源码切出来跑，用假层元素与假弹窗驱动：
 * 里层没处理过的 ESC 要关掉这一层，里层处理过（`defaultPrevented`）的不许再关。
 *
 * 「所有弹窗都走这个助手」探针看不见（它是十次接线），由 smoke 侧的结构断言钉住。
 *
 * @returns {Promise<void>}
 */
async function runDialogEscapeSuite() {
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/renderer/renderer.js"), "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(extractClassMethod(source, "bindRuntimeDialogEscapeClose"), context);

  const makeLayerElement = () => {
    const handlers = {};
    return {
      handlers,
      addEventListener(eventType, handler) {
        handlers[eventType] = handler;
      }
    };
  };
  const makeDialogElement = () => {
    const closeCalls = [];
    return { closeCalls, close: () => closeCalls.push("close") };
  };

  const layerElement = makeLayerElement();
  const dialogElement = makeDialogElement();
  context.bindRuntimeDialogEscapeClose(layerElement, dialogElement);
  check(
    "W12 挂的是 keydown（ESC 是键盘事件）",
    typeof layerElement.handlers.keydown === "function" && !layerElement.handlers.click,
    JSON.stringify(Object.keys(layerElement.handlers))
  );

  layerElement.handlers.keydown({ key: "Escape", defaultPrevented: false });
  check(
    "W12 没人处理过 ESC 时，这一层照常关掉（不能因为加守卫就把关闭也弄丢）",
    dialogElement.closeCalls.length === 1,
    JSON.stringify(dialogElement.closeCalls)
  );

  dialogElement.closeCalls.length = 0;
  layerElement.handlers.keydown({ key: "Escape", defaultPrevented: true });
  check(
    "W12 里层已经处理过 ESC（下拉菜单/展开面板）时不再关掉整个弹窗",
    dialogElement.closeCalls.length === 0,
    JSON.stringify(dialogElement.closeCalls)
  );

  layerElement.handlers.keydown({ key: "Enter", defaultPrevented: false });
  layerElement.handlers.keydown({ key: "ArrowDown", defaultPrevented: false });
  check(
    "W12 其它按键不影响弹窗（守卫只针对 ESC）",
    dialogElement.closeCalls.length === 0,
    JSON.stringify(dialogElement.closeCalls)
  );
}

/**
 * W13：3D 运行时挂载失败的兜底。
 *
 * `showInteraction3dLoadFailure` 按源码切出来跑：占位文案要带原因、原始错误要进全局日志、
 * 编辑态的等待者要当场被拒（不是干等 25 秒）。原先这里是裸 `catch {}`，
 * 动态 import 404 / 授权被撤 / 运行时抛栈在页面上长得一模一样。
 *
 * @returns {Promise<void>}
 */
async function runInteraction3dMountSuite() {
  const source = fs.readFileSync(
    path.join(ROOT, "frontend/static/modules/interaction3d/bridge.js"),
    "utf8"
  );
  const mountSource = [
    extractFunction(source, "interaction3dLoadFailureReason"),
    extractFunction(source, "showInteraction3dLoadFailure")
  ].join("\n\n");

  const logEntries = [];
  const notifiedWaiters = [];
  const context = vm.createContext({
    console,
    document: {
      createElement: () => ({
        className: "",
        textContent: "",
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        }
      })
    },
    window: {
      HABridgeLog: {
        error: (errorObject, logContext) => logEntries.push({ errorObject, ...logContext })
      }
    },
    notifyViewReady: (componentId, error) => notifiedWaiters.push({ componentId, error })
  });
  vm.runInContext(mountSource, context);

  const makeHostElement = () => ({
    dataset: {},
    children: [],
    replaceChildren(child) {
      this.children = [child];
    }
  });

  const hostElement = makeHostElement();
  context.showInteraction3dLoadFailure(
    hostElement,
    { id: "component-3d" },
    { editable: true },
    new Error("Failed to fetch dynamically imported module: /api/v1/modules/interaction3d/runtime.js")
  );
  const placeholderElement = hostElement.children[0];
  check(
    "W13 挂载失败的占位文案带原因（原先只剩一句「无法载入」，排查只能靠猜）",
    placeholderElement?.textContent.includes("Failed to fetch") &&
      placeholderElement?.textContent.includes("户型暂时无法载入"),
    placeholderElement?.textContent || ""
  );
  check(
    "W13 占位元素是 role=status 且宿主回到待授权态",
    placeholderElement?.attributes?.role === "status" && hostElement.dataset.access === "pending",
    JSON.stringify({ role: placeholderElement?.attributes?.role, access: hostElement.dataset.access })
  );
  check(
    "W13 原始错误进全局日志（日志面板是唯一能事后取证的通道）",
    logEntries.length === 1 &&
      logEntries[0].errorObject?.message.includes("Failed to fetch") &&
      logEntries[0].phase === "interaction3d-mount" &&
      logEntries[0].componentId === "component-3d",
    JSON.stringify(logEntries.map(entry => entry.phase))
  );
  check(
    "W13 编辑态的等待者当场被拒（不必干等到 25 秒超时）",
    notifiedWaiters.length === 1 &&
      notifiedWaiters[0].componentId === "component-3d" &&
      notifiedWaiters[0].error?.message.includes("Failed to fetch"),
    JSON.stringify(notifiedWaiters.map(waiter => waiter.componentId))
  );

  // 展示态（非编辑）：不登记视图，但原因照样要写进占位文案。
  const displayHostElement = makeHostElement();
  context.showInteraction3dLoadFailure(
    displayHostElement,
    { id: "component-3d" },
    { editable: false },
    new Error("403 明确拒绝")
  );
  check(
    "W13 展示态不通知等待者，但占位文案仍然带原因",
    notifiedWaiters.length === 1 && displayHostElement.children[0]?.textContent.includes("403"),
    displayHostElement.children[0]?.textContent || ""
  );

  // 取不到原因（非 Error、空 message）时退回通用文案，不留半截括号。
  const reasonlessHostElement = makeHostElement();
  context.showInteraction3dLoadFailure(reasonlessHostElement, { id: "component-3d" }, {}, {});
  check(
    "W13 拿不到原因时退回通用文案（不出现「（原因：undefined）」这种半截话）",
    reasonlessHostElement.children[0]?.textContent === "户型暂时无法载入，请稍候重试。",
    reasonlessHostElement.children[0]?.textContent || ""
  );

  // 很长的运行期栈只留一句能读的。
  const longReasonHostElement = makeHostElement();
  context.showInteraction3dLoadFailure(
    longReasonHostElement,
    { id: "component-3d" },
    {},
    new Error("x".repeat(200))
  );
  check(
    "W13 过长的原因截断（占位块不能被一整段栈撑爆）",
    longReasonHostElement.children[0]?.textContent.includes("…") &&
      longReasonHostElement.children[0]?.textContent.length < 120,
    String(longReasonHostElement.children[0]?.textContent.length)
  );
}

/**
 * W15：保存冲突的三条出路与「稍后处理」。
 *
 * `saveStudioDraft` / `handleSaveConflict` / `deferSaveConflict` / `resolveSaveConflict`
 * 按源码切出来跑，`requestStudioApi` 换成可编程的假实现（409 / 成功都能摆），
 * 弹窗与状态栏换成替身。要证明的是三件事：
 *
 *   1. 「稍后处理」不丢东西（不加载、不覆盖）且**不再停掉自动保存**；
 *   2. 冲突期间界面一直有出口（状态栏 + 常驻的「处理保存冲突」按钮），
 *      而且用户已经选了稍后处理时不再拿同一个冲突反复弹窗；
 *   3. 保存结论要能传到调用方 —— 冲突/失败时不再有「已保存」这种假消息。
 *
 * @returns {Promise<void>}
 */
async function runStudioConflictSuite() {
  const source = fs.readFileSync(
    path.join(ROOT, "frontend/static/3d-studio/studio-app.js"),
    "utf8"
  );
  const saveSource = [
    "setSaveState",
    "setSaveConflictPendingUi",
    "openSaveConflictDialog",
    "handleSaveConflict",
    "deferSaveConflict",
    "resolveSaveConflict",
    "saveStudioDraft"
  ]
    .map(functionName => extractFunction(source, functionName))
    .join("\n\n");

  const toasts = [];
  const logEntries = [];
  const scheduledTimers = [];
  const saveStateElement = { className: "", innerHTML: "" };
  const reopenButtonElement = { hidden: true };
  const dialogElement = {
    open: false,
    showModalCalls: 0,
    closeCalls: 0,
    showModal() {
      this.open = true;
      this.showModalCalls += 1;
    },
    close() {
      this.open = false;
      this.closeCalls += 1;
    }
  };
  const putResponses = [];
  const requestCalls = [];
  // 请求期间用户继续编辑的开关：用来验「成功后把尾巴追上」这条既有语义。
  let bumpRevisionDuringPut = false;
  const context = vm.createContext({
    console,
    saveStateElement,
    saveConflictReopenButton: reopenButtonElement,
    saveConflictDialogElement: dialogElement,
    showToast: (toastMessage, tone) => toasts.push({ toastMessage, tone: tone || "" }),
    window: {
      HABridgeLog: { error: (errorObject, logContext) => logEntries.push({ errorObject, ...logContext }) },
      setTimeout: (callback, delayMs) => {
        scheduledTimers.push({ callback, delayMs });
        return scheduledTimers.length;
      },
      clearTimeout: () => {}
    },
    requestStudioApi: async (requestPath, requestOptions = {}) => {
      requestCalls.push({ requestPath, method: requestOptions.method || "GET" });
      if (bumpRevisionDuringPut && requestOptions.method === "PUT") {
        context.changeRevision += 1;
      }
      const nextResponse = putResponses.shift();
      if (nextResponse?.error) {
        throw nextResponse.error;
      }
      return nextResponse?.payload ?? { revision: 1 };
    },
    snapshotDocumentForSave: () => ({ pages: [{ path: "/overview" }] }),
    // 模块级状态：在沙箱里就是全局变量，被测代码读写的就是它们。
    isStageViewerMode: false,
    savedSceneRecord: { revision: 1, scene: { pages: [] } },
    isSaving: false,
    saveConflict: null,
    saveConflictDeferred: false,
    changeRevision: 2,
    savedRevision: 1,
    autosaveTimer: null
  });
  vm.runInContext(saveSource, context);

  const conflictError = () => Object.assign(new Error("版本冲突"), { name: "StudioRequestError", status: 409 });
  const remoteRecord = { revision: 5, scene: { pages: [{ path: "/overview", remote: true }] } };
  const resetScene = () => {
    context.savedSceneRecord = { revision: 1, scene: { pages: [] } };
    context.isSaving = false;
    context.saveConflict = null;
    context.saveConflictDeferred = false;
    context.changeRevision = 2;
    context.savedRevision = 1;
    context.autosaveTimer = null;
    dialogElement.open = false;
    reopenButtonElement.hidden = true;
    toasts.length = 0;
    logEntries.length = 0;
    requestCalls.length = 0;
    scheduledTimers.length = 0;
    putResponses.length = 0;
  };

  // 1) 首次 409：拉取服务器版本 → 弹窗 + 常驻入口，且绝不自动覆盖。
  resetScene();
  putResponses.push({ error: conflictError() }, { payload: remoteRecord });
  const conflictOutcome = await context.saveStudioDraft();
  check(
    "W15 收到 409 时拉取服务器版本并弹窗（绝不静默覆盖）",
    requestCalls.length === 2 &&
      requestCalls[0].method === "PUT" &&
      requestCalls[1].method === "GET" &&
      dialogElement.open &&
      context.saveConflict?.latest === remoteRecord,
    JSON.stringify(requestCalls)
  );
  check(
    "W15 冲突期间状态栏与「处理保存冲突」按钮都在（界面必须留出口）",
    saveStateElement.innerHTML.includes("等待处理保存冲突") && reopenButtonElement.hidden === false,
    JSON.stringify({ state: saveStateElement.innerHTML, hidden: reopenButtonElement.hidden })
  );
  check(
    "W15 冲突时的保存结论是 blocked-by-conflict（调用方据此不再说「已保存」）",
    conflictOutcome === "blocked-by-conflict",
    String(conflictOutcome)
  );
  check(
    "W15 冲突挂着时不再排下一次自动保存（否则就是每 500ms 撞一次 409 的空转）",
    scheduledTimers.filter(timer => timer.delayMs === 500).length === 0,
    JSON.stringify(scheduledTimers.map(timer => timer.delayMs))
  );

  // 2) 冲突未处理且用户没选稍后处理：跳过保存（避免把同一个冲突反复撞上去）。
  requestCalls.length = 0;
  putResponses.length = 0;
  const blockedOutcome = await context.saveStudioDraft();
  check(
    "W15 未处理的冲突仍然会挡住自动保存（不重复撞同一个 409）",
    blockedOutcome === "blocked-by-conflict" && requestCalls.length === 0,
    JSON.stringify({ outcome: blockedOutcome, calls: requestCalls.length })
  );

  // 3) 「稍后处理」：收起对话框、记录留着、本地内容一点不丢、入口继续挂着。
  const localSceneBeforeDefer = JSON.stringify(context.saveConflict.localScene);
  context.deferSaveConflict();
  check(
    "W15 稍后处理收起对话框但保留冲突记录与入口（三条出路里唯一不丢东西的一条）",
    context.saveConflict !== null &&
      context.saveConflictDeferred === true &&
      dialogElement.open === false &&
      reopenButtonElement.hidden === false &&
      JSON.stringify(context.saveConflict.localScene) === localSceneBeforeDefer,
    JSON.stringify({
      hasConflict: context.saveConflict !== null,
      deferred: context.saveConflictDeferred,
      open: dialogElement.open,
      hidden: reopenButtonElement.hidden
    })
  );
  check(
    "W15 稍后处理之后自动保存不再被停掉（修复前这里一次请求都不发，界面却毫无异样）",
    await (async () => {
      requestCalls.length = 0;
      putResponses.push({ error: conflictError() }, { payload: remoteRecord });
      const deferredOutcome = await context.saveStudioDraft();
      return requestCalls.length === 2 && deferredOutcome === "blocked-by-conflict";
    })(),
    JSON.stringify(requestCalls)
  );
  check(
    "W15 稍后处理之后同一个冲突不再反复弹窗（记录照刷新，但不打扰用户）",
    dialogElement.showModalCalls === 1 && context.saveConflict?.latest === remoteRecord,
    JSON.stringify({ showModalCalls: dialogElement.showModalCalls })
  );

  // 4) 冲突被处理掉之后：入口收起、deferred 复位，下一次 409 会重新弹窗。
  context.saveConflict = { latest: remoteRecord, localScene: { pages: [] }, targetVersion: 2 };
  context.saveConflictDeferred = true;
  reopenButtonElement.hidden = false;
  context.resolveSaveConflict();
  check(
    "W15 处理掉冲突后撤掉常驻入口、复位稍后处理标记并关掉对话框",
    context.saveConflict === null &&
      context.saveConflictDeferred === false &&
      reopenButtonElement.hidden === true &&
      dialogElement.open === false,
    JSON.stringify({
      hasConflict: context.saveConflict !== null,
      deferred: context.saveConflictDeferred,
      hidden: reopenButtonElement.hidden
    })
  );
  putResponses.push({ error: conflictError() }, { payload: remoteRecord });
  await context.saveStudioDraft();
  check(
    "W15 处理掉之后的下一次冲突仍然会弹窗（不因为「用过一次稍后处理」就永久静音）",
    dialogElement.showModalCalls === 2,
    JSON.stringify({ showModalCalls: dialogElement.showModalCalls })
  );

  // 5) 保存成功的结论与状态；失败时不许说「已保存」。
  resetScene();
  putResponses.push({ payload: { revision: 2, scene: { pages: [] } } });
  const savedOutcome = await context.saveStudioDraft();
  check(
    "W15 保存成功返回 saved 且状态栏给出「已自动保存」",
    savedOutcome === "saved" && saveStateElement.innerHTML.includes("已自动保存"),
    JSON.stringify({ outcome: savedOutcome, state: saveStateElement.innerHTML })
  );
  check(
    "W15 保存期间没有新改动时不必再排一次（已经干净落盘）",
    scheduledTimers.filter(timer => timer.delayMs === 500).length === 0,
    JSON.stringify(scheduledTimers.map(timer => timer.delayMs))
  );

  // 请求期间用户继续编辑：成功后要把尾巴追上（既有语义，不许被这次改动带偏）。
  resetScene();
  bumpRevisionDuringPut = true;
  putResponses.push({ payload: { revision: 2, scene: { pages: [] } } });
  const tailOutcome = await context.saveStudioDraft();
  bumpRevisionDuringPut = false;
  check(
    "W15 保存期间有新改动时仍然排下一次保存追尾巴（既有语义不许回退）",
    tailOutcome === "saved" &&
      scheduledTimers.filter(timer => timer.delayMs === 500).length === 1 &&
      context.changeRevision === 3,
    JSON.stringify({ outcome: tailOutcome, timers: scheduledTimers.map(timer => timer.delayMs) })
  );

  resetScene();
  putResponses.push({ error: Object.assign(new Error("服务器错误"), { status: 500 }) });
  const failedOutcome = await context.saveStudioDraft();
  check(
    "W15 保存失败返回 failed 并给出可见提示（不静默）",
    failedOutcome === "failed" &&
      saveStateElement.innerHTML.includes("保存失败") &&
      toasts.some(toast => toast.tone === "error") &&
      logEntries.some(entry => entry.phase === "studio-save"),
    JSON.stringify({ outcome: failedOutcome, toasts: toasts.map(toast => toast.toastMessage) })
  );

  resetScene();
  context.changeRevision = 1;
  const noChangeOutcome = await context.saveStudioDraft();
  check(
    "W15 没有改动时不发请求（手动点保存也安静返回）",
    noChangeOutcome === "no-changes" && requestCalls.length === 0,
    JSON.stringify({ outcome: noChangeOutcome, calls: requestCalls.length })
  );

  resetScene();
  context.isStageViewerMode = true;
  const viewerOutcome = await context.saveStudioDraft();
  check(
    "W15 只读视图仍然一次都不写（既有守卫不许被这次改动放松）",
    viewerOutcome === "skipped" && requestCalls.length === 0,
    JSON.stringify({ outcome: viewerOutcome, calls: requestCalls.length })
  );
  context.isStageViewerMode = false;
}

/**
 * W11：运行时弹窗的模态语义（aria-modal / aria-labelledby）与焦点管理。
 *
 * 为什么被测的是这一段源码：`showModal()` 在这里用不了 —— 弹窗层挂在画布容器里，
 * 弹窗坐标是画布坐标，提到顶层会在整体缩放的展示页上走样，相机/实体详情那两条
 * `::backdrop` 规则还会和层自带的遮罩叠加。所以模态该有的四件事由
 * `presentRuntimeDialog` 自己做，这里就按「浏览器会怎么配合」把 DOM 桩铺出来验它。
 *
 * 桩的边界写在两处注释里：`getClientRects()` 是代码真的会读的可见性判据（按真实语义桩），
 * 而选择器匹配只实现本文件用到的两种形态 —— 它不是选择器引擎，具体的
 * `:not([disabled])` 写法由自检那侧的结构断言盯着。
 *
 * @returns {Promise<void>} 无（断言直接进全局结果表）。
 */
async function runDialogA11ySuite() {
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/renderer/renderer.js"), "utf8");
  const focusableSelectorSource = source.match(
    /const RUNTIME_DIALOG_FOCUSABLE_SELECTOR = \[[\s\S]*?\]\.join\(', '\);/
  )?.[0];
  if (!focusableSelectorSource) {
    throw new Error("找不到 RUNTIME_DIALOG_FOCUSABLE_SELECTOR 的声明（写法变了就要同步探针）");
  }

  const context = vm.createContext({ console });
  vm.runInContext(extractVariableDeclaration(source, "runtimeDialogTitleSerial"), context);
  vm.runInContext(focusableSelectorSource, context);
  vm.runInContext(extractClassMethod(source, "presentRuntimeDialog"), context);
  // `const` 声明落在脚本的词法作用域里，不会变成沙箱对象的属性，
  // 所以这里求值取出它（顺带证明那段声明真的求出了一个非空选择器串）。
  const focusableSelector = vm.runInContext("RUNTIME_DIALOG_FOCUSABLE_SELECTOR", context);
  check(
    "W11 焦点可及性的选择器取到了值（否则后面几条断言测的其实是空选择器）",
    typeof focusableSelector === "string" && focusableSelector.includes("button"),
    JSON.stringify(focusableSelector)
  );

  /**
   * 只认本文件用到的选择器形态：`tag:not([disabled])` 与 `[tabindex]:not([tabindex="-1"])`。
   *
   * @param {object} element 桩元素。
   * @param {string} selector RUNTIME_DIALOG_FOCUSABLE_SELECTOR 的值。
   * @returns {boolean} 是否命中。
   */
  const matchesFocusableSelector = (element, selector) =>
    selector
      .split(",")
      .map(part => part.trim())
      .some(part => {
        if (part.startsWith("[tabindex]")) {
          return element.tabIndex !== undefined && !(element.tabIndex === -1 && part.includes("-1"));
        }
        const [tagName] = part.split(":");
        if (tagName !== element.tagName.toLowerCase()) {
          return false;
        }
        return !(part.includes("[disabled]") && element.disabled);
      });

  const createFocusableElement = (label, options = {}) => {
    const element = {
      label,
      tagName: options.tagName || "BUTTON",
      disabled: options.disabled === true,
      visible: options.visible !== false,
      // 真实 DOM 元素默认都在文档里；只有「切项目 / 刷新」那种时序才不在。
      isConnected: options.isConnected !== false,
      focusCalls: 0,
      getClientRects: () => (element.visible ? [{}] : []),
      focus: () => {
        element.focusCalls += 1;
        context.document.activeElement = element;
      }
    };
    return element;
  };

  const createLayerStub = () => {
    const handlers = new Map();
    return {
      handlers,
      addEventListener: (type, handler) => {
        handlers.set(type, [...(handlers.get(type) || []), handler]);
      },
      removeEventListener: (type, handler) => {
        handlers.set(type, (handlers.get(type) || []).filter(item => item !== handler));
      },
      dispatchKeydown: keyEvent => {
        for (const handler of handlers.get("keydown") || []) {
          handler(keyEvent);
        }
      }
    };
  };

  const createDialogStub = (focusableElements, titleText) => {
    const handlers = new Map();
    const attributes = new Map();
    const titleElement = { id: "", textContent: titleText };
    const dialogElement = {
      open: false,
      tabIndex: undefined,
      focusCalls: 0,
      showCalls: 0,
      closeCalls: 0,
      querySelector: selector => (selector === "strong" ? titleElement : null),
      querySelectorAll: selector =>
        focusableElements.filter(element => matchesFocusableSelector(element, selector)),
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: name => attributes.get(name) || null,
      contains: element => focusableElements.includes(element) || element === dialogElement,
      addEventListener: (type, handler) => handlers.set(type, handler),
      focus: () => {
        dialogElement.focusCalls += 1;
        context.document.activeElement = dialogElement;
      },
      show: () => {
        dialogElement.open = true;
        dialogElement.showCalls += 1;
      },
      close: () => {
        dialogElement.open = false;
        dialogElement.closeCalls += 1;
        handlers.get("close")?.();
      }
    };
    return { dialogElement, titleElement };
  };

  const createTabKeyEvent = shiftKey => ({
    key: "Tab",
    shiftKey,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  });

  // ---- 1) 打开：模态语义 + 焦点交接 ----
  const openTrigger = createFocusableElement("打开弹窗的按钮");
  context.document = { activeElement: openTrigger };
  const layer = createLayerStub();
  const firstButton = createFocusableElement("第一个");
  const middleButton = createFocusableElement("中间");
  const lastButton = createFocusableElement("最后");
  const { dialogElement, titleElement } = createDialogStub(
    [firstButton, middleButton, lastButton],
    "客厅灯"
  );
  context.presentRuntimeDialog(layer, dialogElement);

  check(
    "W11 打开时标上 aria-modal 并把焦点交给弹窗（读屏才知道「弹窗出现了、背景不可用」）",
    dialogElement.getAttribute("aria-modal") === "true" &&
      dialogElement.showCalls === 1 &&
      dialogElement.focusCalls === 1 &&
      context.document.activeElement === dialogElement,
    JSON.stringify({
      modal: dialogElement.getAttribute("aria-modal"),
      show: dialogElement.showCalls,
      focus: dialogElement.focusCalls
    })
  );
  check(
    "W11 aria-labelledby 指向弹窗标题，且给标题补了唯一 id（十个弹窗共用一段代码）",
    dialogElement.getAttribute("aria-labelledby") === titleElement.id &&
      /^hb-runtime-dialog-title-\d+$/.test(titleElement.id),
    JSON.stringify({ labelledby: dialogElement.getAttribute("aria-labelledby"), id: titleElement.id })
  );
  check(
    "W11 弹窗自己被排除在 Tab 顺序外（tabIndex=-1，焦点只是「落上去」而不是多一个 Tab 停靠点）",
    dialogElement.tabIndex === -1,
    String(dialogElement.tabIndex)
  );

  // ---- 2) 第二个弹窗拿到不同的标题 id ----
  const secondLayer = createLayerStub();
  const secondFocusable = createFocusableElement("另一个");
  const second = createDialogStub([secondFocusable], "影音室");
  context.presentRuntimeDialog(secondLayer, second.dialogElement);
  check(
    "W11 第二个弹窗的标题 id 与第一个不同（同一个 id 会让读屏念错名字）",
    second.titleElement.id !== titleElement.id,
    JSON.stringify([titleElement.id, second.titleElement.id])
  );

  // ---- 3) Tab 在弹窗内首尾相接 ----
  context.document.activeElement = lastButton;
  const forwardTab = createTabKeyEvent(false);
  layer.dispatchKeydown(forwardTab);
  check(
    "W11 焦点在最后一个控件时按 Tab 回到第一个（焦点不许跑到背后的编辑器上）",
    forwardTab.defaultPrevented && firstButton.focusCalls === 1,
    JSON.stringify({ prevented: forwardTab.defaultPrevented, focusCalls: firstButton.focusCalls })
  );
  context.document.activeElement = firstButton;
  const backwardTab = createTabKeyEvent(true);
  layer.dispatchKeydown(backwardTab);
  check(
    "W11 焦点在第一个控件时按 Shift+Tab 落到最后一个",
    backwardTab.defaultPrevented && lastButton.focusCalls === 1,
    JSON.stringify({
      prevented: backwardTab.defaultPrevented,
      focusCalls: lastButton.focusCalls
    })
  );
  context.document.activeElement = middleButton;
  const middleTab = createTabKeyEvent(false);
  layer.dispatchKeydown(middleTab);
  check(
    "W11 焦点在中间时不动手（只在边界上接管，别把浏览器的默认 Tab 顺序改坏）",
    !middleTab.defaultPrevented,
    JSON.stringify({ prevented: middleTab.defaultPrevented })
  );

  // ---- 4) 不可用 / 不可见的控件不参与循环 ----
  // 两层过滤各测一层：禁用由选择器排掉（`button:not([disabled])`），不可见由处理器里的
  // `getClientRects().length` 排掉 —— 选择器管不到「没渲染出来」的元素。
  const disabledButton = createFocusableElement("禁用的", { disabled: true });
  const hiddenButton = createFocusableElement("隐藏的", { visible: false });
  const onlyVisible = createFocusableElement("可见的");
  const sparse = createDialogStub([disabledButton, hiddenButton, onlyVisible], "只剩一个");
  context.document.activeElement = openTrigger;
  context.presentRuntimeDialog(createLayerStub(), sparse.dialogElement);
  check(
    "W11 禁用控件不进焦点循环（选择器层：Tab 不许停在点不动的按钮上）",
    !sparse.dialogElement
      .querySelectorAll(focusableSelector)
      .includes(disabledButton),
    JSON.stringify(
      sparse.dialogElement.querySelectorAll(focusableSelector).map(element => element.label)
    )
  );
  const hiddenLayer = createLayerStub();
  const hiddenMix = createDialogStub([hiddenButton, onlyVisible], "含隐藏控件");
  context.document.activeElement = openTrigger;
  context.presentRuntimeDialog(hiddenLayer, hiddenMix.dialogElement);
  context.document.activeElement = onlyVisible;
  const hiddenShiftTab = createTabKeyEvent(true);
  hiddenLayer.dispatchKeydown(hiddenShiftTab);
  check(
    "W11 不可见控件不进焦点循环（处理器层：它没渲染出来，Tab 落上去等于焦点丢了）",
    hiddenButton.focusCalls === 0 &&
      hiddenShiftTab.defaultPrevented &&
      context.document.activeElement === onlyVisible,
    JSON.stringify({
      hiddenFocusCalls: hiddenButton.focusCalls,
      prevented: hiddenShiftTab.defaultPrevented,
      active: context.document.activeElement?.label || "?"
    })
  );

  // ---- 5) 循环里只剩一个控件：Tab 自己转回去，别漏到背后的编辑器 ----
  const singleLayer = createLayerStub();
  const single = createDialogStub([onlyVisible], "只剩一个");
  context.document.activeElement = openTrigger;
  context.presentRuntimeDialog(singleLayer, single.dialogElement);
  context.document.activeElement = onlyVisible;
  const singleTab = createTabKeyEvent(false);
  singleLayer.dispatchKeydown(singleTab);
  check(
    "W11 循环里只剩一个控件时 Tab 自己转回到它（不 preventDefault 就会漏出去）",
    singleTab.defaultPrevented && onlyVisible.focusCalls >= 1,
    JSON.stringify({
      prevented: singleTab.defaultPrevented,
      focusCalls: onlyVisible.focusCalls
    })
  );

  // ---- 6) 一个可聚焦控件都没有时把焦点留在弹窗上 ----
  const emptyLayer = createLayerStub();
  const empty = createDialogStub([], "纯文本提示");
  context.document.activeElement = openTrigger;
  context.presentRuntimeDialog(emptyLayer, empty.dialogElement);
  const emptyTab = createTabKeyEvent(false);
  emptyLayer.dispatchKeydown(emptyTab);
  check(
    "W11 弹窗里没有可聚焦控件时 Tab 被拦下并把焦点留在弹窗上（别放它去背后的编辑器）",
    emptyTab.defaultPrevented && empty.dialogElement.focusCalls >= 2,
    JSON.stringify({
      prevented: emptyTab.defaultPrevented,
      focusCalls: empty.dialogElement.focusCalls
    })
  );

  // ---- 7) 关闭：还焦点 + 撤掉 Trap ----
  dialogElement.close();
  check(
    "W11 关闭后焦点还给打开它之前那个元素（可能是另一个弹窗里的按钮）",
    context.document.activeElement === openTrigger,
    JSON.stringify({ active: context.document.activeElement?.label || "?" })
  );
  context.document.activeElement = middleButton;
  const afterCloseTab = createTabKeyEvent(false);
  layer.dispatchKeydown(afterCloseTab);
  check(
    "W11 关闭后 Trap 必须撤掉（留着的键盘监听会去动一个已经消失的弹窗）",
    !afterCloseTab.defaultPrevented &&
      middleButton.focusCalls === 0 &&
      (layer.handlers.get("keydown") || []).length === 0,
    JSON.stringify({
      prevented: afterCloseTab.defaultPrevented,
      focusCalls: middleButton.focusCalls,
      remaining: layer.handlers.get("keydown")?.length || 0
    })
  );

  // ---- 8) 打开它的那个元素已经不在了：不许抛，也不许把焦点丢给空气 ----
  const detachedTrigger = createFocusableElement("已被移出文档的按钮");
  detachedTrigger.isConnected = false;
  context.document.activeElement = detachedTrigger;
  const detachedLayer = createLayerStub();
  const detached = createDialogStub([firstButton], "详情");
  context.presentRuntimeDialog(detachedLayer, detached.dialogElement);
  context.document.activeElement = firstButton;
  let detachCloseThrew = false;
  try {
    detached.dialogElement.close();
  } catch (closeError) {
    detachCloseThrew = true;
  }
  check(
    "W11 打开它的元素已被移出文档时不还焦点、也不抛（切项目 / 刷新时就是这么个时序）",
    !detachCloseThrew && context.document.activeElement === firstButton,
    JSON.stringify({
      threw: detachCloseThrew,
      active: context.document.activeElement?.label || "?"
    })
  );

  // ---- 9) 重复打开同一个弹窗：不许再 show() 一次 ----
  const reopenLayer = createLayerStub();
  const reopen = createDialogStub([firstButton], "重复打开");
  context.presentRuntimeDialog(reopenLayer, reopen.dialogElement);
  context.presentRuntimeDialog(reopenLayer, reopen.dialogElement);
  check(
    "W11 已经打开的弹窗再呈现一次不会重复 show()（原生 show() 对已打开的弹窗会抛 InvalidStateError）",
    reopen.dialogElement.showCalls === 1 &&
      (reopenLayer.handlers.get("keydown")?.length || 0) === 1,
    JSON.stringify({
      showCalls: reopen.dialogElement.showCalls,
      traps: reopenLayer.handlers.get("keydown")?.length || 0
    })
  );
}

/**
 * W25/W26：鉴权壳页（login / pair 共用）的密码显隐与指针几何缓存。
 *
 * auth-shell.js 没有导出、且顶层就摸 DOM，所以按 display-boot 那套做法：
 * 铺一层最小 DOM 之后整份 `vm.runInContext` 跑，观测量由垫片自己记账
 * （几何读了几次、样式写了几个值、类名加了哪些）。
 *
 * @param {object} [options] 场景开关。
 * @param {boolean} [options.withCharacters] 页面上有没有角色区（/pair 没有）。
 * @param {string[]} [options.toggleTargets] 每个显隐按钮指向的输入框 id。
 * @returns {object} 沙箱与观测量。
 */
function makeAuthShellSandbox(options = {}) {
  const { withCharacters = true, toggleTargets = ["password"] } = options;
  const classes = new Set();
  const styleWrites = [];
  const box = { width: 100, height: 50, left: 0, top: 0 };
  let boundsReads = 0;

  const characters = withCharacters
    ? {
        classList: {
          add: (...names) => names.forEach(name => classes.add(name)),
          remove: (...names) => names.forEach(name => classes.delete(name)),
          toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
          contains: name => classes.has(name)
        },
        style: {
          setProperty: (name, value) => styleWrites.push([name, value])
        },
        getBoundingClientRect() {
          boundsReads += 1;
          return {
            width: box.width,
            height: box.height,
            left: box.left,
            top: box.top,
            right: box.left + box.width,
            bottom: box.top + box.height
          };
        }
      }
    : null;

  const passwordFields = [
    {
      value: "",
      type: "password",
      dataset: {},
      addEventListener() {}
    }
  ];
  const fieldsById = new Map([["password", passwordFields[0]]]);
  const toggles = toggleTargets.map(targetId => ({
    dataset: { togglePassword: targetId },
    title: "",
    labels: [],
    handlers: [],
    setAttribute(name, value) {
      this.labels.push([name, value]);
    },
    addEventListener(type, handler) {
      this.handlers.push([type, handler]);
    }
  }));
  const formInputs = [{ name: "username", addEventListener() {} }];
  const windowListeners = new Map();
  const documentListeners = new Map();

  const frameQueue = [];
  const context = vm.createContext({
    Math,
    document: {
      querySelector: selector => (selector === ".home-characters" ? characters : null),
      querySelectorAll(selector) {
        if (selector.includes('input[type="password"]')) return passwordFields;
        if (selector === "[data-toggle-password]") return toggles;
        if (selector === ".auth-form input") return formInputs;
        return [];
      },
      getElementById: id => fieldsById.get(id) || null,
      addEventListener(type, handler) {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(handler);
      }
    },
    window: {
      addEventListener(type, handler) {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type).push(handler);
      },
      // 接到假时钟上，眨眼与入场那两级 setTimeout 才能被推着走。
      setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay)
    },
    requestAnimationFrame: callback => {
      frameQueue.push(callback);
      return frameQueue.length;
    }
  });

  return {
    context,
    characters,
    classes,
    styleWrites,
    box,
    boundsReads: () => boundsReads,
    passwordFields,
    toggles,
    formInputs,
    windowListeners,
    documentListeners,
    frameQueue,
    /** 同步跑完当前排队的所有 rAF 回调（含回调里新排的）。 */
    flushFrames() {
      for (let step = 0; step < 50 && frameQueue.length; step += 1) frameQueue.shift()();
    },
    dispatch(type, event) {
      for (const handler of documentListeners.get(type) || []) handler(event);
    },
    fireWindow(type, event) {
      for (const handler of windowListeners.get(type) || []) handler(event);
    }
  };
}

/**
 * W25/W26：角色区缺失不能拖垮密码显隐，指针跟随不能每帧强制重排。
 *
 * @returns {Promise<void>}
 */
async function runAuthShellSuite() {
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/auth-shell.js"), "utf8");
  const clock = installFakeClock();

  // ---- W25：/pair 页没有角色区，密码显隐按钮必须照常工作 ----
  const bare = makeAuthShellSandbox({
    withCharacters: false,
    // 第二个按钮故意指向一个不存在的 id（线上就是一处 id 笔误）。
    toggleTargets: ["password", "password-typo"]
  });
  let loadThrew = null;
  try {
    vm.runInContext(source, bare.context, { filename: "auth-shell.js" });
  } catch (error) {
    loadThrew = error;
  }
  check(
    "W25 页面没有角色区时脚本照样加载完（以前顶层解引用会在这里抛错并中断后面全部接线）",
    loadThrew === null,
    loadThrew ? String(loadThrew.message) : "无异常"
  );
  check(
    "W25 与角色无关的接线排在角色块之前（缺角色区不会连累密码显隐按钮）",
    source.indexOf("[data-toggle-password]") < source.indexOf("if (characters) {"),
    JSON.stringify({
      toggleAt: source.indexOf("[data-toggle-password]"),
      charactersBlockAt: source.indexOf("if (characters) {")
    })
  );

  const goodToggle = bare.toggles[0];
  const goodClick = goodToggle.handlers.find(([type]) => type === "click");
  check("W25 密码显隐按钮挂上了 click（脚本确实执行到底）", Boolean(goodClick));
  goodClick?.[1]();
  check(
    "W25 点一下就把密码框切成明文，并打上 data-password-field 标记",
    bare.passwordFields[0].type === "text" && bare.passwordFields[0].dataset.passwordField === "true",
    JSON.stringify({ type: bare.passwordFields[0].type, dataset: bare.passwordFields[0].dataset })
  );
  check(
    "W25 切显隐后按钮的无障碍名称同步（读屏要知道按下去是显示还是隐藏）",
    goodToggle.labels.some(([name, value]) => name === "aria-label" && value === "隐藏密码"),
    JSON.stringify(goodToggle.labels)
  );
  check(
    "W25 无角色区时不碰角色节点（不该为了动效把密码显隐一起赔进去）",
    bare.styleWrites.length === 0,
    JSON.stringify(bare.styleWrites)
  );

  const typoToggle = bare.toggles[1];
  const typoClick = typoToggle.handlers.find(([type]) => type === "click");
  let typoThrew = null;
  try {
    typoClick?.[1]();
  } catch (error) {
    typoThrew = error;
  }
  check(
    "W25 按钮指向不存在的 id 时只让这一个按钮失效，不抛错",
    typoThrew === null,
    typoThrew ? String(typoThrew.message) : "无异常"
  );

  // ---- W26：指针跟随的几何按需缓存，事件回调里不做同步布局 ----
  const shell = makeAuthShellSandbox({ withCharacters: true });
  // 密码框的内容与可见状态必须在脚本跑之前就位：模块末尾那次 syncPasswordState
  // 就是「自动填充后直接进页面」这个场景，值晚一步设等于什么都没测。
  shell.passwordFields[0].value = "hunter2";
  shell.passwordFields[0].type = "text";
  vm.runInContext(source, shell.context, { filename: "auth-shell.js" });
  check(
    "W26 角色区在时密码状态同步照旧（has-password + is-password-visible 都得上）",
    shell.classes.has("has-password") && shell.classes.has("is-password-visible"),
    JSON.stringify([...shell.classes])
  );

  // 让入场动画先落定（它会作废缓存，但不测量）。
  shell.flushFrames();
  shell.flushFrames();
  clock.advance(1251);
  shell.flushFrames();
  check(
    "W26 入场动画只作废缓存、不当场测量（动画里的位置本来就不算数）",
    shell.boundsReads() === 0,
    `reads=${shell.boundsReads()}`
  );

  // 冷缓存：三次移动只该量一次。
  shell.dispatch("pointermove", { clientX: 10, clientY: 20 });
  shell.dispatch("pointermove", { clientX: 30, clientY: 40 });
  shell.dispatch("pointermove", { clientX: 100, clientY: 25 });
  check(
    "W26 三次指针移动期间一次几何都不量（指针事件里读 rect 会强制同步布局）",
    shell.boundsReads() === 0,
    `reads=${shell.boundsReads()}`
  );
  shell.flushFrames();
  check(
    "W26 冷缓存下三次移动合并成一次测量（事件只记坐标，活儿留到下一帧）",
    shell.boundsReads() === 1,
    `reads=${shell.boundsReads()}`
  );
  check(
    "W26 三次移动只写一次（合并到一帧里，不是每个事件写一遍样式）",
    shell.styleWrites.length === 2,
    JSON.stringify(shell.styleWrites)
  );
  // 几何：left=0 / width=100 → 中心 50；clientX=100 → (100-50)/50 = 1.00；clientY=25 → 0.00。
  check(
    "W26 用的是最后一次指针位置（不是第一帧那个，否则眼珠会跟着旧坐标抖）",
    JSON.stringify(shell.styleWrites.slice(-2)) ===
      JSON.stringify([
        ["--look-x", "1.00"],
        ["--look-y", "0.00"]
      ]),
    JSON.stringify(shell.styleWrites.slice(-2))
  );

  // 热缓存：继续移动不该再量。
  shell.dispatch("pointermove", { clientX: 50, clientY: 25 });
  shell.flushFrames();
  check(
    "W26 缓存热的时候继续移动连一次都不量（否则每帧都重排）",
    shell.boundsReads() === 1 && shell.styleWrites.length === 4,
    JSON.stringify({ reads: shell.boundsReads(), writes: shell.styleWrites.length })
  );

  // 失效路径：resize / orientationchange / scroll 三个都要作废缓存。
  for (const [eventName, expected] of [
    ["resize", 2],
    ["orientationchange", 3],
    ["scroll", 4]
  ]) {
    shell.fireWindow(eventName);
    shell.dispatch("pointermove", { clientX: 50, clientY: 25 });
    shell.flushFrames();
    check(
      `W26 ${eventName} 之后重新量一次（窗口 / 屏幕方向 / 滚动都会让缓存的位置过时）`,
      shell.boundsReads() === expected,
      `reads=${shell.boundsReads()} 期望 ${expected}`
    );
  }

  shell.box.width = 0;
  shell.box.height = 0;
  shell.fireWindow("resize");
  shell.dispatch("pointermove", { clientX: 100, clientY: 25 });
  shell.flushFrames();
  check(
    "W26 角色区没渲染出来（宽高为 0）时不把 NaN 写进 CSS 变量",
    shell.styleWrites.slice(-2).every(([, value]) => value !== "NaN"),
    JSON.stringify(shell.styleWrites.slice(-2))
  );
}

/**
 * W20：renderer 的 resize 必须「先读后写 + 一帧一遍」。
 *
 * 这个方法的病是**排版抖动**而不是结果错误，所以观测手段也得是顺序与次数：
 * 垫片把每一次 `getBoundingClientRect`（读）与每一次手柄样式写入（写）都记进
 * 一条流水，然后断言「写之前全部读完了」。旧的「逐个 写→读」写法下，第二个宿主
 * 的那次读已经排在前一个宿主的写之后，于是每个宿主都强制一次同步布局 ——
 * 组件多的页面在手机上滚动（visualViewport 每帧派发 resize）时就是每帧 N 次重排。
 *
 * @returns {Promise<void>}
 */
async function runRendererResizeSuite() {
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/renderer/renderer.js"), "utf8");
  const script = [
    extractClassMethod(source, "resize"),
    extractClassMethod(source, "scheduleResize"),
    extractClassMethod(source, "transformHandleBoundsElement"),
    extractClassMethod(source, "updateTransformHandleScale"),
    extractClassMethod(source, "updateMultiSelectionHandleScale")
  ].join("\n\n");

  const operations = [];
  const makeBoundsElement = (id, box = { width: 200, height: 150 }) => ({
    id,
    box,
    style: {
      setProperty(name, value) {
        operations.push({ kind: "write", id, name, value });
      }
    },
    classList: {
      toggle(name, force) {
        operations.push({ kind: "write", id, name: `class:${name}`, value: force });
      }
    },
    getBoundingClientRect() {
      operations.push({ kind: "read", id });
      return {
        width: this.box.width,
        height: this.box.height,
        left: 0,
        top: 0,
        right: this.box.width,
        bottom: this.box.height
      };
    }
  });

  const frames = [];
  const context = vm.createContext({
    Math,
    window: {
      requestAnimationFrame: callback => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: frameId => {
        if (frames[frameId - 1]) frames[frameId - 1] = null;
      }
    }
  });
  vm.runInContext(script, context, { filename: "renderer.resize.js" });

  const resetOperations = () => operations.splice(0, operations.length);
  const readIds = () => operations.filter(entry => entry.kind === "read").map(entry => entry.id);
  const boundsWriteIndexes = () =>
    operations
      .map((entry, index) => (entry.kind === "write" && entry.id !== "canvas" ? index : -1))
      .filter(index => index !== -1);
  const lastReadIndex = () =>
    operations.reduce((found, entry, index) => (entry.kind === "read" ? index : found), -1);

  /**
   * 造一个可用的渲染器替身。
   *
   * @param {number} [hostCount] 带手柄外框的组件宿主数量。
   * @returns {object} 替身（含 element 查询入口与观测计数）。
   */
  const makeReceiver = (hostCount = 3) => {
    const hostBounds = Array.from({ length: hostCount }, (ignored, index) =>
      makeBoundsElement(`host-${index + 1}`)
    );
    const multiBounds = makeBoundsElement("multi");
    // 第 4 个宿主没有外框元素：用来覆盖「定位不到就跳过」这条分支。
    const hostsWithoutBounds = { querySelector: () => null };
    const receiver = {
      appliedScaleX: 1,
      appliedScaleY: 1,
      resizeFrameId: 0,
      document: { canvas: { width: 1000, height: 800 } },
      options: {},
      container: { clientWidth: 500, clientHeight: 400, dataset: {} },
      viewport: { style: {} },
      canvas: {
        style: {},
        querySelector: selector =>
          selector === ":scope > .hb-multi-selection-bounds" ? multiBounds : null
      },
      componentHosts: new Map([
        ...hostBounds.map((bounds, index) => [
          `comp-${index + 1}`,
          { querySelector: selector => (selector === ":scope > .hb-selection-bounds" ? bounds : null) }
        ]),
        ...(hostCount > 0 ? [["comp-empty", hostsWithoutBounds]] : [])
      ]),
      componentRecords: new Map(
        hostBounds.map((bounds, index) => [`comp-${index + 1}`, { id: `comp-${index + 1}`, style: { scale: 1 } }])
      ),
      componentSelectionOverlays: new Map(),
      componentParentTransform: () => ({ scale: 1 }),
      runtimeDialogScaleCalls: 0,
      updateRuntimeDialogScale() {
        this.runtimeDialogScaleCalls += 1;
      }
    };
    Object.assign(receiver, {
      resize: context.resize,
      scheduleResize: context.scheduleResize,
      transformHandleBoundsElement: context.transformHandleBoundsElement,
      updateTransformHandleScale: context.updateTransformHandleScale,
      updateMultiSelectionHandleScale: context.updateMultiSelectionHandleScale
    });
    return { receiver, hostBounds, multiBounds };
  };

  // ---- 先读后写 ----
  const first = makeReceiver(3);
  resetOperations();
  first.receiver.resize();
  const boundsWrites = boundsWriteIndexes();
  check(
    "W20 一遍 resize 里所有手柄矩形先读齐再开始写（写一个读一个 = 每个宿主强制一次同步布局）",
    boundsWrites.length > 0 && lastReadIndex() < boundsWrites[0],
    JSON.stringify({
      ops: operations.map(entry => `${entry.kind}:${entry.id}`),
      lastRead: lastReadIndex(),
      firstBoundsWrite: boundsWrites[0] ?? null
    })
  );
  check(
    "W20 每个手柄外框每遍只量一次（三个宿主 + 多选框 = 4 次，没有外框的宿主跳过）",
    JSON.stringify(readIds()) === JSON.stringify(["host-1", "host-2", "host-3", "multi"]),
    JSON.stringify(readIds())
  );
  check(
    "W20 没有外框的宿主不会中断这一遍（定位阶段跳过它，缩放照样算完）",
    first.receiver.appliedScaleX === 0.5 &&
      first.receiver.appliedScaleY === 0.5 &&
      first.receiver.componentHosts.has("comp-empty"),
    JSON.stringify({
      scaleX: first.receiver.appliedScaleX,
      scaleY: first.receiver.appliedScaleY,
      hosts: [...first.receiver.componentHosts.keys()]
    })
  );

  // 先读后写不能改变判定：小外框照样要切到「手柄外置」。
  first.hostBounds[1].box = { width: 100, height: 90 };
  resetOperations();
  first.receiver.resize();
  const outsideToggles = operations.filter(
    entry => entry.kind === "write" && entry.name === "class:handles-outside"
  );
  check(
    "W20 先读后写不改变判定：100×90 的宿主仍然切到外置手柄、200×150 的不切",
    outsideToggles.length === 4 &&
      outsideToggles[0].value === false &&
      outsideToggles[1].value === true,
    JSON.stringify(outsideToggles.map(entry => [entry.id, entry.value]))
  );

  // ---- 一帧一遍 ----
  const second = makeReceiver(2);
  resetOperations();
  second.receiver.scheduleResize();
  second.receiver.scheduleResize();
  second.receiver.scheduleResize();
  check(
    "W20 同一帧里的三个尺寸事件只排一帧、当场什么都不读（visualViewport 每帧都在派发）",
    frames.length === 1 && operations.length === 0,
    JSON.stringify({ frames: frames.length, ops: operations.length })
  );
  while (frames.length) frames.shift()?.();
  check(
    "W20 合并后的那一帧只跑一遍完整 resize（两个宿主 + 多选框共 3 次测量）",
    JSON.stringify(readIds()) === JSON.stringify(["host-1", "host-2", "multi"]) &&
      second.receiver.runtimeDialogScaleCalls === 1,
    JSON.stringify({ reads: readIds(), dialogScale: second.receiver.runtimeDialogScaleCalls })
  );
  check(
    "W20 合并只作用于事件入口：直接调 resize() 仍然是同步的（渲染完一页要立刻用缩放值）",
    (() => {
      resetOperations();
      second.receiver.resize();
      return readIds().length === 3 && second.receiver.runtimeDialogScaleCalls === 2;
    })(),
    JSON.stringify({ reads: readIds(), dialogScale: second.receiver.runtimeDialogScaleCalls })
  );

  // ---- 既有边界不能被顺手改松 ----
  const third = makeReceiver(1);
  third.receiver.container.clientWidth = 0;
  resetOperations();
  third.receiver.resize();
  check(
    "W20 容器宽高为 0 时整遍直接返回（不写样式、也不量手柄）",
    operations.length === 0,
    JSON.stringify(operations)
  );
}

/**
 * W22：撤销 / 重做必须互斥，长按的自动重复必须被挡掉。
 *
 * 垫片提供两个可摆布的替身：`cloneSceneForHistory`（记录「当前状态」被 clone 了
 * 几份）与 `applySceneSnapshot`（返回一个由探针决定的 promise）。于是三条性质都能
 * 观测：套用期间的第二下不生效、套用失败也放闩、`repeat` 的按键不算数。
 *
 * @returns {Promise<void>}
 */
async function runStudioHistorySuite() {
  const source = fs.readFileSync(path.join(ROOT, "frontend/static/3d-studio/studio-app.js"), "utf8");
  const script = [
    extractVariableDeclaration(source, "historyBusy"),
    extractVariableDeclaration(source, "undoStack"),
    extractVariableDeclaration(source, "redoStack"),
    extractFunction(source, "undo"),
    extractFunction(source, "redo"),
    extractFunction(source, "applyHistoryShortcut"),
    // vm 里的顶层 let 从外面读不到（前面批次已经踩过一次：const 不是沙箱的属性），
    // 所以由沙箱自己的代码把入口与状态交出来。
    "globalThis.historyProbe = {",
    "  undo,",
    "  redo,",
    "  applyHistoryShortcut,",
    "  seed: (undoEntries, redoEntries) => { undoStack = undoEntries; redoStack = redoEntries; },",
    "  snapshot: () => ({ undo: undoStack.slice(), redo: redoStack.slice() })",
    "};"
  ].join("\n");

  const applied = [];
  const pending = [];
  const clones = [];
  const context = vm.createContext({
    cloneSceneForHistory: () => {
      const snapshot = { kind: "live", serial: clones.length };
      clones.push(snapshot);
      return snapshot;
    },
    applySceneSnapshot: snapshot => {
      applied.push(snapshot);
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    }
  });
  vm.runInContext(script, context, { filename: "studio.history.js" });
  const probeHandle = context.historyProbe;
  const settle = async () => {
    while (pending.length) pending.shift().resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  // ---- 套用期间不许重入 ----
  probeHandle.seed(["A", "B", "C"], []);
  const firstPass = probeHandle.undo();
  await Promise.resolve();
  const overlapping = probeHandle.undo();
  await Promise.resolve();
  check(
    "W22 快照还在套用时再按撤销不再排队（第二下会在半成品状态上 clone 当前场景）",
    applied.length === 1,
    JSON.stringify({ applied: applied.map(entry => entry.kind === "live" ? `live#${entry.serial}` : entry) })
  );
  await settle();
  await firstPass;
  await overlapping;
  check(
    "W22 一趟撤销只动一步：撤销栈 A/B/C → A/B，重做栈拿到被替换掉的当前状态",
    JSON.stringify(probeHandle.snapshot()) ===
      JSON.stringify({ undo: ["A", "B"], redo: [{ kind: "live", serial: 0 }] }),
    JSON.stringify(probeHandle.snapshot())
  );
  check(
    "W22 套用结束后闩必须松开（否则之后所有撤销都静默失效）",
    (() => {
      const before = applied.length;
      probeHandle.undo();
      return applied.length === before + 1;
    })(),
    JSON.stringify({ applied: applied.length, state: probeHandle.snapshot() })
  );
  await settle();

  // ---- 套用失败也要放闩 ----
  probeHandle.seed(["A", "B"], []);
  const failing = probeHandle.undo();
  await Promise.resolve();
  pending.shift().reject(new Error("快照套用失败"));
  let failureSeen = !1;
  try {
    await failing;
  } catch {
    failureSeen = !0;
  }
  const afterFailure = applied.length;
  probeHandle.undo();
  check(
    "W22 快照套用抛错后同样放闩（卡住的闩会让撤销永久静默失效）",
    failureSeen && applied.length === afterFailure + 1,
    JSON.stringify({ failureSeen, applied: applied.length })
  );
  await settle();

  // ---- 长按的自动重复不算数 ----
  probeHandle.seed(["A", "B"], ["R1"]);
  const beforeRepeat = applied.length;
  probeHandle.applyHistoryShortcut({ repeat: true, shiftKey: false });
  probeHandle.applyHistoryShortcut({ repeat: true, shiftKey: true });
  await Promise.resolve();
  check(
    "W22 长按 Ctrl+Z / Ctrl+Shift+Z 的自动重复不算数（一下要 clone 整份场景，排队跑完会跳好几步）",
    applied.length === beforeRepeat &&
      JSON.stringify(probeHandle.snapshot()) ===
        JSON.stringify({ undo: ["A", "B"], redo: ["R1"] }),
    JSON.stringify({ applied: applied.length, state: probeHandle.snapshot() })
  );
  await settle();
  const beforeShortcut = applied.length;
  probeHandle.applyHistoryShortcut({ repeat: false, shiftKey: false });
  probeHandle.applyHistoryShortcut({ repeat: false, shiftKey: true });
  await Promise.resolve();
  check(
    "W22 真按键仍然照做：Ctrl+Z 走撤销、Ctrl+Shift+Z 走重做",
    applied.length === beforeShortcut + 1 && applied.at(-1) === "B",
    JSON.stringify({ applied: applied.map(entry => (entry.kind === "live" ? "live" : entry)) })
  );
  await settle();
  const redoTopBeforeRedo = probeHandle.snapshot().redo.at(-1);
  probeHandle.applyHistoryShortcut({ repeat: false, shiftKey: true });
  await Promise.resolve();
  check(
    "W22 重做套用的是重做栈顶那一份快照（而不是把当前状态又套一遍）",
    redoTopBeforeRedo !== undefined && applied.at(-1) === redoTopBeforeRedo,
    JSON.stringify({ last: applied.at(-1), redoTop: redoTopBeforeRedo })
  );
  await settle();

  // ---- 重做也走同一把闩（只闩撤销 = 重做这条路径照样能在半成品上重入）----
  probeHandle.seed([], ["R1", "R2"]);
  const redoBaseline = applied.length;
  const clonesBeforeRedo = clones.length;
  const redoPass = probeHandle.redo();
  await Promise.resolve();
  const overlappingRedo = probeHandle.redo();
  await Promise.resolve();
  check(
    "W22 重做套用期间再按重做同样不排队（闩只挡撤销就等于这条路径没保护）",
    applied.length === redoBaseline + 1,
    JSON.stringify({ applied: applied.map(entry => (entry.kind === "live" ? "live" : entry)) })
  );
  await settle();
  await redoPass;
  await overlappingRedo;
  check(
    "W22 一趟重做只动一步、结束后放闩（重做栈 R1/R2 → R1，撤销栈只拿到这一下 clone 的当前状态）",
    JSON.stringify(probeHandle.snapshot()) ===
      JSON.stringify({ undo: [{ kind: "live", serial: clonesBeforeRedo }], redo: ["R1"] }),
    JSON.stringify({ state: probeHandle.snapshot(), clonesBeforeRedo })
  );
  await settle();

  // ---- 栈空时什么都不做 ----
  probeHandle.seed([], []);
  const beforeEmpty = applied.length;
  const clonesBeforeEmpty = clones.length;
  probeHandle.undo();
  probeHandle.redo();
  await Promise.resolve();
  check(
    "W22 栈空时连 clone 都不做（空撤销不该往重做栈里塞一份当前状态）",
    applied.length === beforeEmpty && clones.length === clonesBeforeEmpty,
    JSON.stringify({ applied: applied.length, clones: clones.length - clonesBeforeEmpty })
  );
}

/**
 * 跑 `utils/debug-log.js`：开关关着的时候必须真的不出声。
 *
 * 为什么值得一条活体探针：`debugLog` 的两半（判断开关、转发 console）分开看源码都没问题，
 * 但「关着时到底有没有调用 console」只有把 console 换成桩才看得见 —— 这正是 W23 的缺陷
 * 形态：同一条错误既走 `HABridgeLog` 上报、又在控制台里响一遍，而且没有任何开关能关掉它。
 * 同理，`isFrontendDebugMode` 的取值口径（只认 `1` / `true`）也只能按输入摆出来。
 */
async function runDebugLogSuite() {
  const { debugLog, isFrontendDebugMode, FRONTEND_DEBUG_QUERY_PARAM } = await import(
    pathToFileURL(path.join(ROOT, "frontend/static/utils/debug-log.js")).href
  );

  // 开关读的是调用时刻的 `globalThis.location`（默认参数在每次调用时求值），
  // 所以换掉这个全局就能摆出各种地址栏；探针结束后必须原样还回去。
  const originalLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  const originalConsole = globalThis.console;
  const setSearch = search => {
    globalThis.location = { search };
  };
  const consoleCalls = [];
  const installConsoleStub = () => {
    const stub = {};
    for (const level of ["debug", "info", "log", "warn", "error"]) {
      stub[level] = (...args) => consoleCalls.push({ level, args });
    }
    globalThis.console = stub;
  };

  try {
    check(
      "W23 开关只看查询参数 debug（常量对外可用，断言引的就是它）",
      FRONTEND_DEBUG_QUERY_PARAM === "debug",
      `FRONTEND_DEBUG_QUERY_PARAM=${FRONTEND_DEBUG_QUERY_PARAM}`
    );

    const opened = ["?debug=1", "?debug=true", "?foo=1&debug=1"];
    const closed = ["", "?", "?debug=0", "?debug=false", "?debug=", "?debug=yes", "?debug", "?other=1"];
    setSearch("?debug=1");
    check(
      "W23 显式开启才算打开：?debug=1 / ?debug=true",
      opened.every(search => {
        setSearch(search);
        return isFrontendDebugMode() === true;
      }),
      opened.join("、")
    );
    check(
      "W23 其余取值一律算关闭（?debug=0 / ?debug=false / ?debug=yes / 只有键名都不算打开）",
      closed.every(search => {
        setSearch(search);
        return isFrontendDebugMode() === false;
      }),
      closed.map(search => JSON.stringify(search)).join("、")
    );

    // 显式传参这条路也要成立：它不依赖全局，是排查时按单个对象判定的入口。
    check(
      "W23 开关可直接对给定 location 判定（不依赖全局）",
      isFrontendDebugMode({ search: "?debug=1" }) === true &&
        isFrontendDebugMode({ search: "?debug=0" }) === false,
      JSON.stringify({
        on: isFrontendDebugMode({ search: "?debug=1" }),
        off: isFrontendDebugMode({ search: "?debug=0" })
      })
    );

    // 开关自己不能成为故障源：没有 location、search 抛错、search 类型不对，都要安静地返回 false。
    let malformedThrew = false;
    let malformedResult = null;
    try {
      delete globalThis.location;
      const noLocation = isFrontendDebugMode();
      const throwingSearch = isFrontendDebugMode({
        get search() {
          throw new Error("search 读不出来");
        }
      });
      const nonStringSearch = isFrontendDebugMode({ search: { toString: null } });
      malformedResult = { noLocation, throwingSearch, nonStringSearch };
    } catch (malformedError) {
      malformedThrew = true;
      malformedResult = String(malformedError?.message || malformedError);
    }
    check(
      "W23 没有 location / search 抛错 / search 不是字符串时都按关闭处理且不抛",
      !malformedThrew &&
        malformedResult?.noLocation === false &&
        malformedResult?.throwingSearch === false &&
        malformedResult?.nonStringSearch === false,
      JSON.stringify(malformedResult)
    );

    // ---- 关着的时候必须一点动静都没有 ----
    installConsoleStub();
    setSearch("?debug=0");
    debugLog("error", "不该出现", { entityId: "light.kitchen" });
    debugLog("debug", "也不该出现");
    debugLog("warn");
    check(
      "W23 开关关闭时 debugLog 一次 console 都不碰（生产控制台不该有第二份）",
      consoleCalls.length === 0,
      `console 调用 ${consoleCalls.length} 次：${JSON.stringify(consoleCalls.slice(0, 3))}`
    );

    // ---- 打开的时候要原样转发 ----
    setSearch("?debug=1");
    consoleCalls.length = 0;
    const errorPayload = { phase: "studio-export" };
    debugLog("error", "导出失败", errorPayload);
    debugLog("warn", "阴影图集: 单灯阴影烘焙失败，已按无阴影处理。", "spot-light-1");
    check(
      "W23 开关打开时按级别转发 console，参数原样透传（诊断信息没有被改写）",
      consoleCalls.length === 2 &&
        consoleCalls[0].level === "error" &&
        consoleCalls[0].args.length === 2 &&
        consoleCalls[0].args[0] === "导出失败" &&
        consoleCalls[0].args[1] === errorPayload &&
        consoleCalls[1].level === "warn" &&
        consoleCalls[1].args[1] === "spot-light-1",
      JSON.stringify(consoleCalls)
    );

    // 级别名不存在（拼错）时不许抛：日志本身不该把调用方带崩。
    let unknownLevelThrew = false;
    try {
      debugLog("not-a-console-level", "x");
    } catch {
      unknownLevelThrew = true;
    }
    check(
      "W23 级别名不存在时不抛（日志不该成为调用方的崩溃源）",
      !unknownLevelThrew && consoleCalls.length === 2,
      `抛错=${unknownLevelThrew}，console 调用 ${consoleCalls.length} 次`
    );

    // console 本身缺失（极早期的启动脚本里可能还没装）时同样不许抛。
    let missingConsoleThrew = false;
    try {
      globalThis.console = undefined;
      debugLog("error", "控制台不在");
    } catch {
      missingConsoleThrew = true;
    }
    check(
      "W23 console 缺失时不抛（启动早期也要能安全调用）",
      !missingConsoleThrew,
      `抛错=${missingConsoleThrew}`
    );
  } finally {
    if (originalLocationDescriptor) {
      Object.defineProperty(globalThis, "location", originalLocationDescriptor);
    } else {
      delete globalThis.location;
    }
    globalThis.console = originalConsole;
  }
}

/**
 * 跑 `renderer/runtime-caches.js` 的历史序列缓存（W19）。
 *
 * W19 的形态是「常量与淘汰循环里的字面量各写一份」：调常量不生效，而**不生效在行为上
 * 与没调过一模一样**。所以这里不能只断言「插到上限就不再涨」（写死 512 也能通过），
 * 必须把常量改小、加载那份改过的模块、看淘汰上限有没有跟着变 —— 这才是「常量是唯一上限」。
 *
 * 改小后的模块写到临时目录再 import，被测的仍然是磁盘上那一份原文（只换常量值）。
 */
async function runRuntimeCachesSuite() {
  const runtimeCachesPath = path.join(ROOT, "frontend/static/renderer/runtime-caches.js");
  const runtimeCachesSource = fs.readFileSync(runtimeCachesPath, "utf8");
  const { cacheHistorySeries, historySeriesCacheKey, MAX_HISTORY_SERIES_CACHE_SIZE } = await import(
    pathToFileURL(runtimeCachesPath).href
  );

  const makeSeries = (hours, pointCount = 1) => ({
    hours,
    points: Array.from({ length: pointCount }, (ignored, index) => index)
  });
  const fillFrom = (cache, startIndex, count) => {
    for (let index = 0; index < count; index += 1) {
      cacheHistorySeries(cache, `entity-${startIndex + index}`, makeSeries(1));
    }
  };

  check(
    "W19 上限常量是对外可见的那一个（断言引的就是模块自己导出的常量）",
    MAX_HISTORY_SERIES_CACHE_SIZE === 512,
    `MAX_HISTORY_SERIES_CACHE_SIZE=${MAX_HISTORY_SERIES_CACHE_SIZE}`
  );

  // ---- 到达上限前一个都不淘汰；越界后从最旧的开始丢 ----
  const cache = new Map();
  fillFrom(cache, 0, MAX_HISTORY_SERIES_CACHE_SIZE);
  const sizeAtLimit = cache.size;
  fillFrom(cache, MAX_HISTORY_SERIES_CACHE_SIZE, 3);
  check(
    "W19 刚好到上限时不淘汰、越界后按插入顺序丢最旧的",
    sizeAtLimit === MAX_HISTORY_SERIES_CACHE_SIZE &&
      cache.size === MAX_HISTORY_SERIES_CACHE_SIZE &&
      !cache.has(historySeriesCacheKey("entity-0", 1)) &&
      !cache.has(historySeriesCacheKey("entity-1", 1)) &&
      cache.has(historySeriesCacheKey(`entity-${MAX_HISTORY_SERIES_CACHE_SIZE + 2}`, 1)),
    JSON.stringify({
      sizeAtLimit,
      sizeAfter: cache.size,
      oldestStillThere: cache.has(historySeriesCacheKey("entity-0", 1))
    })
  );

  // 空序列不写：请求失败会得到空数组，写进去会把上一次的好数据顶掉。
  const beforeEmpty = cache.size;
  cacheHistorySeries(cache, "entity-empty", makeSeries(1, 0));
  check(
    "W19 空序列不写进缓存（失败的空结果不该顶掉上一次的好数据）",
    cache.size === beforeEmpty && !cache.has(historySeriesCacheKey("entity-empty", 1)),
    `size ${beforeEmpty} → ${cache.size}`
  );

  // ---- 常量真的是唯一的上限：改小它，淘汰上限必须跟着变 ----
  const variantDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "homeos-runtime-caches-"));
  try {
    const loadVariant = async limit => {
      const variantSource = runtimeCachesSource.replace(
        /export const MAX_HISTORY_SERIES_CACHE_SIZE = \d+;/,
        `export const MAX_HISTORY_SERIES_CACHE_SIZE = ${limit};`
      );
      if (variantSource === runtimeCachesSource) {
        return null;
      }
      const variantPath = path.join(variantDirectory, `runtime-caches-limit-${limit}.mjs`);
      fs.writeFileSync(variantPath, variantSource, "utf8");
      return import(pathToFileURL(variantPath).href);
    };

    for (const limit of [1, 3, 7]) {
      const variant = await loadVariant(limit);
      if (!variant) {
        check(
          `W19 能定位到上限常量声明（改小到 ${limit} 用）`,
          false,
          "源码里找不到 `export const MAX_HISTORY_SERIES_CACHE_SIZE = <数字>;`"
        );
        continue;
      }
      const variantCache = new Map();
      const variantFill = count => {
        for (let index = 0; index < count; index += 1) {
          variant.cacheHistorySeries(variantCache, `entity-${index}`, makeSeries(1));
        }
      };
      variantFill(limit + 4);
      check(
        `W19 上限改成 ${limit} 后淘汰跟着变（淘汰循环里不能再写死数字）`,
        variant.MAX_HISTORY_SERIES_CACHE_SIZE === limit && variantCache.size === limit,
        JSON.stringify({ 常量: variant.MAX_HISTORY_SERIES_CACHE_SIZE, 实际条数: variantCache.size, 期望: limit })
      );
    }
  } finally {
    fs.rmSync(variantDirectory, { recursive: true, force: true });
  }
}

const suites = {
  "api-fetch": runApiFetchSuite,
  login: runLoginSuite,
  "display-boot": runDisplayBootSuite,
  "request-json": runRequestJsonSuite,
  "studio-request": runStudioRequestSuite,
  pair: runPairSuite,
  "pair-scan": runPairScanSuite,
  setup: runSetupSuite,
  license: runLicenseSuite,
  "home-boot": runHomeBootSuite,
  "home-snapshot": runHomeSnapshotSuite,
  "optimistic-toggle": runOptimisticToggleSuite,
  "dialog-escape": runDialogEscapeSuite,
  "dialog-a11y": runDialogA11ySuite,
  "interaction3d-mount": runInteraction3dMountSuite,
  "studio-conflict": runStudioConflictSuite,
  "pair-scan": runPairScanSuite,
  "auth-shell": runAuthShellSuite,
  "renderer-resize": runRendererResizeSuite,
  "studio-history": runStudioHistorySuite,
  "debug-log": runDebugLogSuite,
  "runtime-caches": runRuntimeCachesSuite
};

/**
 * 套件看门狗（真实定时器，不走假时钟）。
 *
 * 为什么要它：探针的等待全由假时钟驱动，而假时钟下的「永远不结算」不会占住事件
 * 循环 —— Node 会静默退出（退出码 0、一个字节都不输出），自检那边只能看到一句
 * 「探针没吐出完整结果」，看不出是哪一条断言卡住了（P6-T1 的 W3 回退就是这个形态：
 * 去掉超时后 fetch 永远挂着）。有了这条真实定时器，卡住会先被它抓住，并把已经跑出
 * 来的断言一并吐出；同时它本身占住事件循环，进程不会再提前消失。
 *
 * @type {number}
 */
const SUITE_WATCHDOG_MS = 20000;

/**
 * 同步写 fd（这是给「马上要 process.exit」用的）。
 *
 * 为什么不用 `process.stdout.write`：往**管道**写是异步的，紧接着 `process.exit()`
 * 会把还没落盘的字节直接丢掉。管道缓冲区一格刚好 64 KiB，所以后果是「结果 JSON 恰好
 * 在 65536 字节处被切断、后面的断言全丢」—— 自检那边只会看到一句「探针没吐出完整
 * 结果」，看不出是哪一条断言变红了（P7-T2 的 W9 回退就是这个形态：一条断言的详情里
 * 带了 400 KB 的快照，于是整份 JSON 被截断，真正的红项反而不见了）。
 *
 * 非阻塞管道下 `fs.writeSync` 可能抛 EAGAIN（缓冲区满），所以循环重写。
 *
 * @param {number} fd 1 = stdout，2 = stderr。
 * @param {string} text 要写出的文本。
 * @returns {void}
 */
function writeSync(fd, text) {
  const buffer = Buffer.from(text, "utf8");
  let written = 0;
  while (written < buffer.length) {
    try {
      written += fs.writeSync(fd, buffer, written, buffer.length - written);
    } catch (writeError) {
      if (writeError?.code !== "EAGAIN") {
        throw writeError;
      }
    }
  }
}

/**
 * 吐出结果并退出（注意：不能叫 flush —— 那个名字已经被「排空微任务」的助手占了）。
 *
 * @param {number} exitCode 0 = 全绿，1 = 有红，2 = 探针自己崩了。
 */
function reportAndExit(exitCode) {
  writeSync(1, JSON.stringify({ results }) + "\n");
  process.exit(exitCode);
}

async function main() {
  const watchdog = setTimeout(() => {
    results.push({
      name: `套件能在 ${SUITE_WATCHDOG_MS / 1000} 秒内跑完（卡住 = 后面的断言没执行）`,
      ok: false,
      detail: "卡在永远不结算的等待上（多半是超时预算被去掉，或假时钟推不动它）"
    });
    reportAndExit(1);
  }, SUITE_WATCHDOG_MS);

  const runner = suites[suiteArgument];
  if (!runner) {
    check(`未知套件：${suiteArgument}`, false, `可选：${Object.keys(suites).join(" / ")}`);
  } else {
    try {
      await runner();
    } catch (suiteError) {
      // 套件中途抛异常 = 后面的断言一条都没跑。必须显式变红，并且要把已经跑出来的
      // 结果一并吐出：否则「这次改动打掉了哪一条断言」在自检里只剩一句「探针崩了」，
      // 牙齿测试也就抓不到具体那一条回归（P6-T1 的 W1/W2 回退就是这种形态）。
      results.push({
        name: "套件能跑到底（中途抛异常 = 后面的断言没执行）",
        ok: false,
        detail: String(suiteError?.stack || suiteError)
          .split("\n")
          .slice(0, 3)
          .join(" / ")
      });
    }
  }

  clearTimeout(watchdog);
  // 有红就给非零退出码：调用方不看 stdout 也能判定（smoke.py 仍以 JSON 为准）。
  reportAndExit(results.some(result => !result.ok) ? 1 : 0);
}

main().catch(error => {
  writeSync(2, String(error?.stack || error) + "\n");
  process.exit(2);
});
