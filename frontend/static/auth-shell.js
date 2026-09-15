/**
 * 登录 / 授权页的表情角色动效脚本。
 *
 * 位置：login、license 等鉴权壳页共用，负责 .home-characters 角色的眨眼与
 *   视线跟随。
 * 职责：根据密码框是否有内容切换角色表情，按随机间隔播放眨眼动画，
 *   并让角色眼睛跟随指针移动。
 * 约定：角色节点必须存在（class 为 home-characters）；密码可见性通过给
 *   输入框打 data-password-field 标记来跟踪，与各页表单结构解耦。
 */
const characters = document.querySelector(".home-characters");

// 兼容多种表单写法：既认 type=password，也认已切换成 text 但带标记的输入框。
function passwordInputs() {
  return [...document.querySelectorAll('input[type="password"], input[data-password-field]')];
}

// 把「有密码」「密码可见」两个状态同步成角色根节点上的类名。
function syncPasswordState() {
  const passwordFields = passwordInputs(),
    hasPassword = passwordFields.some(field => field.value.length > 0),
    isPasswordVisible = passwordFields.some(
      visibleInput => visibleInput.value.length > 0 && visibleInput.type === "text"
    );
  (characters.classList.toggle("has-password", hasPassword),
    characters.classList.toggle("is-password-visible", isPasswordVisible));
}

// 递归排程下一次眨眼：3~7 秒随机间隔 + 150ms 的闭眼时长，避免机械感。
function scheduleBlink(blinkClass) {
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
}

// 进入动画：双 rAF 确保首帧样式已生效，再触发入场类，避免过渡被跳过。
(scheduleBlink("is-purple-blinking"),
  scheduleBlink("is-dark-blinking"),
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      (characters.classList.add("is-ready"),
        // 1250ms 与 CSS 入场动画时长对齐，结束后换成常驻的 is-entered 状态。
        window.setTimeout(() => {
          (characters.classList.remove("is-ready"), characters.classList.add("is-entered"));
        }, 1250));
    })
  ));

for (const toggleButton of document.querySelectorAll("[data-toggle-password]"))
  toggleButton.addEventListener("click", () => {
    // 切换成 text 后 type 选择器就失效了，靠 data-password-field 标记让
    // syncPasswordState 仍能识别这个输入框。
    const passwordInput = document.querySelector(`#${toggleButton.dataset.togglePassword}`),
      isVisible = passwordInput.type === "text";
    ((passwordInput.type = isVisible ? "password" : "text"),
      (passwordInput.dataset.passwordField = "true"),
      toggleButton.setAttribute(
        "aria-label",
        isVisible ? "\u663E\u793A\u5BC6\u7801" : "\u9690\u85CF\u5BC6\u7801"
      ),
      (toggleButton.title = isVisible ? "\u663E\u793A\u5BC6\u7801" : "\u9690\u85CF\u5BC6\u7801"),
      syncPasswordState());
  });

for (const formInput of document.querySelectorAll(".auth-form input"))
  (formInput.addEventListener("focus", () => {
    // 只在账号框聚焦时高亮角色，密码框聚焦交给 is-password-visible 表达。
    formInput.name === "username" && characters.classList.add("is-account-typing");
  }),
    formInput.addEventListener("blur", () => {
      formInput.name === "username" && characters.classList.remove("is-account-typing");
    }),
    formInput.addEventListener("input", syncPasswordState));

// 指针位置换算成 -1~1 的归一化坐标（--look-x / --look-y），由 CSS 决定眼珠偏移量；
// 保留两位小数即可，减少无意义的重绘抖动。最后的 syncPasswordState 覆盖浏览器
// 自动填充密码后直接进入页面的场景。
(document.addEventListener("pointermove", pointerEvent => {
  const bounds = characters.getBoundingClientRect(),
    lookX = Math.max(
      -1,
      Math.min(1, (pointerEvent.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2))
    ),
    lookY = Math.max(
      -1,
      Math.min(1, (pointerEvent.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2))
    );
  (characters.style.setProperty("--look-x", lookX.toFixed(2)),
    characters.style.setProperty("--look-y", lookY.toFixed(2)));
}),
  syncPasswordState());
