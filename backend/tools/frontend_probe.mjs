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
  const start = declaration.index;
  const parameterOpen = source.indexOf("(", declaration.index);
  const parameterClose = findClosing(source, parameterOpen, "(", ")");
  const bodyOpen = source.indexOf("{", parameterClose);
  const bodyClose = findClosing(source, bodyOpen, "{", "}");
  const extracted = source.slice(start, bodyClose + 1);
  if (!extracted.trimEnd().endsWith("}")) {
    throw new Error(`${functionName} 的切分没有停在右花括号上`);
  }
  new vm.Script(extracted); // 解析不过会抛，避免把半截函数当成「探针通过」
  return extracted;
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
  const submitButton = { disabled: false, textContent: "", setAttribute() {} };
  const listeners = new Map();
  const form = {
    fields: { ...formFields },
    elements: formElements,
    querySelector(selector) {
      // pair.js 在扫码模式下会改按钮里那个 span 的文案，所以两者都要认。
      if (selector.includes("span")) return { textContent: "" };
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

const suites = {
  "api-fetch": runApiFetchSuite,
  login: runLoginSuite,
  "display-boot": runDisplayBootSuite,
  "request-json": runRequestJsonSuite,
  "studio-request": runStudioRequestSuite,
  pair: runPairSuite,
  setup: runSetupSuite,
  license: runLicenseSuite
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
 * 吐出结果并退出（注意：不能叫 flush —— 那个名字已经被「排空微任务」的助手占了）。
 *
 * @param {number} exitCode 0 = 全绿，1 = 有红，2 = 探针自己崩了。
 */
function reportAndExit(exitCode) {
  process.stdout.write(JSON.stringify({ results }) + "\n");
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
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exit(2);
});
