/**
 * 鉴权壳页的表情角色动效与密码显隐脚本：/pair 使用角色区，/login 无角色区，但两页共用密码显隐接线。
 *
 * 职责：按密码框是否有内容切换角色表情、随机间隔眨眼、角色眼睛跟随指针；负责 [data-toggle-password]。
 * 约定：角色节点是可选的，缺了密码显隐照常工作 —— 本文件同时管密码可见性按钮，顶层直接解引用会在
 * 模块加载时抛错并中断后续接线，故角色相关代码整段收在 `if (characters)` 里、无关接线放在它前面；
 * 密码可见性给输入框打 data-password-field 标记来跟踪，文字型按钮还要同步按钮文案。
 * 约定：指针几何按需缓存（resize / 旋转 / 滚动后失效），pointermove 里不读 getBoundingClientRect
 * （会强制同步布局，高频指针下等于每帧重排）。
 */

const characters = document.querySelector(".home-characters");

// 兼容多种表单写法：既认 type=password，也认已切换成 text 但带标记的输入框。
function passwordInputs() {
  return [...document.querySelectorAll('input[type="password"], input[data-password-field]')];
}

// 把「有密码」「密码可见」两个状态同步成角色根节点上的类名。
function syncPasswordState() {
  if (!characters) return;
  const passwordFields = passwordInputs(),
    hasPassword = passwordFields.some(field => field.value.length > 0),
    isPasswordVisible = passwordFields.some(
      visibleInput => visibleInput.value.length > 0 && visibleInput.type === "text"
    );
  (characters.classList.toggle("has-password", hasPassword),
    characters.classList.toggle("is-password-visible", isPasswordVisible));
}

/* ===== 与角色无关的接线：角色区不存在也必须照常工作 ===== */

for (const toggleButton of document.querySelectorAll("[data-toggle-password]"))
  toggleButton.addEventListener("click", () => {
    // 用 getElementById 取目标，而不是把 id 拼进选择器：id 里有特殊字符时也只是
    // 查不到，不会在选择器解析处抛异常。
    const passwordInput = document.getElementById(toggleButton.dataset.togglePassword);
    // 一处 id 写错只该让这一个按钮失效：顶层解引用会让整个模块停在那行，
    // 同一页的密码显隐按钮从此全部没反应。
    if (!passwordInput) return;
    // 切换成 text 后 type 选择器就失效了，靠 data-password-field 标记让
    // syncPasswordState 仍能识别这个输入框。
    const isVisible = passwordInput.type === "text";
    ((passwordInput.type = isVisible ? "password" : "text"),
      (passwordInput.dataset.passwordField = "true"),
      toggleButton.setAttribute(
        "aria-label",
        isVisible ? "显示密码" : "隐藏密码"
      ),
      (toggleButton.title = isVisible ? "显示密码" : "隐藏密码"),
      // 纯文字按钮（登录 / 初始化页同款）还要跟着换文案；图标按钮保留 SVG，只换无障碍名称。
      !toggleButton.firstElementChild &&
        (toggleButton.textContent = isVisible ? "显示" : "隐藏"),
      syncPasswordState());
  });

for (const formInput of document.querySelectorAll(".auth-form input"))
  (formInput.addEventListener("focus", () => {
    // 只在账号框聚焦时高亮角色，密码框聚焦交给 is-password-visible 表达。
    formInput.name === "username" && characters?.classList.add("is-account-typing");
  }),
    formInput.addEventListener("blur", () => {
      formInput.name === "username" && characters?.classList.remove("is-account-typing");
    }),
    formInput.addEventListener("input", syncPasswordState));

/* ===== 角色动效：没有角色节点时整段跳过 ===== */

if (characters) {
  // 递归排程下一次眨眼：3~7 秒随机间隔 + 150ms 的闭眼时长，避免机械感。
  const scheduleBlink = blinkClass => {
    window.setTimeout(
      () => {
        (characters.classList.add(blinkClass),
          window.setTimeout(() => {
            // 睁眼后立刻排下一轮，保证眨眼循环不中断。
            (characters.classList.remove(blinkClass), scheduleBlink(blinkClass));
          }, 150));
      },
      Math.random() * 4e3 + 3e3
    );
  };

  // 指针位置换算成 -1~1 的归一化坐标（--look-x / --look-y），由 CSS 决定眼珠偏移量；
  // 保留两位小数即可，减少无意义的重绘抖动。
  //
  // 几何只在失效后量一次：pointermove 里读 getBoundingClientRect 会强制同步布局，
  // 指针高频移动时等于每帧重排一次。失效也是惰性的 —— resize / 滚动只作废缓存，
  // 真正测量发生在下一帧要用它的时候；拖动窗口时 resize 事件连着来，
  // 每次都在事件里量一遍等于把重排搬进了 resize 处理器。
  let lookBounds = null,
    pendingLookPoint = null,
    lookFrameId = 0;

  const invalidateLookBounds = () => {
    lookBounds = null;
  };
  const applyLookPoint = () => {
    lookFrameId = 0;
    const point = pendingLookPoint;
    pendingLookPoint = null;
    if (!point) return;
    lookBounds || (lookBounds = characters.getBoundingClientRect());
    // 角色区没渲染出来（宽度或高度为 0）时不做除法，避免把 NaN 写进 CSS 变量。
    if (!lookBounds.width || !lookBounds.height) return;
    const lookX = Math.max(
        -1,
        Math.min(
          1,
          (point.clientX - lookBounds.left - lookBounds.width / 2) / (lookBounds.width / 2)
        )
      ),
      lookY = Math.max(
        -1,
        Math.min(
          1,
          (point.clientY - lookBounds.top - lookBounds.height / 2) / (lookBounds.height / 2)
        )
      );
    (characters.style.setProperty("--look-x", lookX.toFixed(2)),
      characters.style.setProperty("--look-y", lookY.toFixed(2)));
  };

  (window.addEventListener("resize", invalidateLookBounds),
    window.addEventListener("orientationchange", invalidateLookBounds),
    // capture: true —— 滚动可能发生在任意容器里，任何一种滚动都会改变角色相对
    // 视口的位置，缓存必须跟着失效。
    window.addEventListener("scroll", invalidateLookBounds, { passive: true, capture: true }),
    document.addEventListener("pointermove", pointerEvent => {
      pendingLookPoint = { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY };
      lookFrameId || (lookFrameId = requestAnimationFrame(applyLookPoint));
    }));

  // 进入动画：双 rAF 确保首帧样式已生效，再触发入场类，避免过渡被跳过。
  (scheduleBlink("is-purple-blinking"),
    scheduleBlink("is-dark-blinking"),
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        (characters.classList.add("is-ready"),
          // 入场动画期间角色位置一直在变，动画结束前的测量都不算数 —— 作废缓存，
          // 等它落定之后的第一帧再量真位置。
          invalidateLookBounds(),
          // 1250ms 与 CSS 入场动画时长对齐，结束后换成常驻的 is-entered 状态。
          window.setTimeout(() => {
            (characters.classList.remove("is-ready"),
              characters.classList.add("is-entered"),
              invalidateLookBounds());
          }, 1250));
      })
    ));
}

// 覆盖浏览器自动填充密码后直接进入页面的场景（自动填充不会派发 input 事件）。
syncPasswordState();
