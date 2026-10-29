/*
 * `/3d-studio` 首屏加载遮罩控制器（经典脚本，非 module）。
 *
 * 为什么必须是外部经典脚本：
 *  1. 外壳页 CSP 是 `script-src 'self'`，行内脚本会被拦；
 *  2. 它必须在 Vue 入口 module 执行**之前**就跑起来 —— module 是 defer 的，body 里的经典
 *     脚本按解析顺序立即执行，正好卡在前面；
 *  3. 入口 chunk 本身要下载几百 KB，遮罩必须早于它出现，否则用户看到的是纯白空壳。
 *
 * 契约（`window.homeosStudioStartup`）：
 *   active  是否仍处于加载态
 *   signal  AbortSignal：页面退出 / 失败 / ready 时 abort（下游据此取消准备工作）
 *   phase   换阶段文案
 *   fail    进入错误态（显示标题 + 原因 + 重试按钮），并 abort
 *   wait    等一个 promise，但 abort 时立即以 abort 原因拒绝
 *   ready   收起遮罩，恢复外壳
 *
 * 只服务创作页：`/3d-studio` 精确匹配（含尾斜杠），`?embed=1` 与自动导图组件嵌入态跳过。
 */
(function () {
  "use strict";

  var STALL_TIMEOUT_MS = 60000;
  var DEFAULT_FAILURE = "户型暂时无法打开，请重试。";

  var params = new URLSearchParams(window.location.search);
  var isCreatorPath = /^\/3d-studio\/?$/.test(window.location.pathname);
  if (
    !isCreatorPath ||
    params.get("embed") === "1" ||
    params.get("auto-diagram-component")
  ) {
    return;
  }

  var root = document.documentElement;
  var panel = document.getElementById("studio-loading");
  if (!panel) return;

  var titleElement = panel.querySelector("[data-loading-title]");
  var detailElement = panel.querySelector("[data-loading-detail]");
  var retryElement = panel.querySelector("[data-loading-retry]");
  var controller = new AbortController();

  var active = true;
  var failed = false;
  var leaving = false;
  var stallTimer = null;

  root.classList.add("studio-starting");
  panel.hidden = false;

  // 加载期间用户按键一律吞掉：此时编辑器还没挂上，键盘快捷键打到的是一份空壳。
  function swallowKeydown(event) {
    if (active) event.stopImmediatePropagation();
  }
  document.addEventListener("keydown", swallowKeydown, true);

  function clearStallTimer() {
    window.clearTimeout(stallTimer);
    stallTimer = null;
  }

  // 只在页面可见时计时：后台标签页里 60s 到了也不算「卡住」，那是浏览器在省电。
  function armStallTimer() {
    clearStallTimer();
    if (!active || failed || document.hidden) return;
    stallTimer = window.setTimeout(function () {
      fail("准备时间较长，请重试或返回后检查连接。");
    }, STALL_TIMEOUT_MS);
  }

  function fail(reason) {
    if (!active || failed || leaving) return;
    reason = reason || DEFAULT_FAILURE;
    failed = true;
    clearStallTimer();
    panel.classList.add("is-error");
    if (titleElement) titleElement.textContent = "暂时无法打开";
    if (detailElement) detailElement.textContent = reason;
    if (retryElement) retryElement.hidden = false;
    controller.abort(new Error(reason));
  }

  function teardown() {
    clearStallTimer();
    document.removeEventListener("keydown", swallowKeydown, true);
    document.removeEventListener("visibilitychange", armStallTimer);
    window.removeEventListener("pagehide", onPageHide);
  }

  function onPageHide(event) {
    // persisted=true 是进入 bfcache（返回时会原样恢复），不能当退出处理。
    if (event.persisted) return;
    leaving = true;
    teardown();
    controller.abort(new Error("页面已退出"));
  }

  if (retryElement) {
    retryElement.addEventListener("click", function () {
      window.location.reload();
    });
  }
  document.addEventListener("visibilitychange", armStallTimer);
  window.addEventListener("pagehide", onPageHide);

  window.homeosStudioStartup = Object.freeze({
    get active() {
      return active;
    },
    signal: controller.signal,
    phase: function (text) {
      if (!active || failed || leaving) return;
      if (detailElement) detailElement.textContent = text;
    },
    fail: fail,
    wait: function (task) {
      return new Promise(function (resolve, reject) {
        function onAbort() {
          reject(controller.signal.reason);
        }
        Promise.resolve(task).then(resolve, reject).finally(function () {
          controller.signal.removeEventListener("abort", onAbort);
        });
        if (controller.signal.aborted) onAbort();
        else controller.signal.addEventListener("abort", onAbort, { once: true });
      });
    },
    ready: function () {
      if (!active || failed || leaving) return;
      active = false;
      teardown();
      root.classList.remove("studio-starting");
      panel.hidden = true;
    },
  });

  armStallTimer();
})();
