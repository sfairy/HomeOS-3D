const characters = document.querySelector(".home-characters");
function passwordInputs() {
  return [...document.querySelectorAll('input[type="password"], input[data-password-field]')];
}
function syncPasswordState() {
  const inputs = passwordInputs(),
    hasTypedPassword = inputs.some((typedInput) => typedInput.value.length > 0),
    isPasswordVisible = inputs.some(
      (visibleInput) => visibleInput.value.length > 0 && visibleInput.type === "text",
    );
  (characters.classList.toggle("has-password", hasTypedPassword),
    characters.classList.toggle("is-password-visible", isPasswordVisible));
}
function scheduleBlink(blinkClass) {
  window.setTimeout(
    () => {
      (characters.classList.add(blinkClass),
        window.setTimeout(() => {
          (characters.classList.remove(blinkClass), scheduleBlink(blinkClass));
        }, 150));
    },
    Math.random() * 4000 + 3000,
  );
}
(scheduleBlink("is-purple-blinking"),
  scheduleBlink("is-dark-blinking"),
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      (characters.classList.add("is-ready"),
        window.setTimeout(() => {
          (characters.classList.remove("is-ready"), characters.classList.add("is-entered"));
        }, 1250));
    }),
  ));
for (const toggleButton of document.querySelectorAll("[data-toggle-password]"))
  toggleButton.addEventListener("click", () => {
    const field = document.querySelector(`#${toggleButton.dataset.togglePassword}`),
      wasVisible = field.type === "text";
    ((field.type = wasVisible ? "password" : "text"),
      (field.dataset.passwordField = "true"),
      toggleButton.setAttribute("aria-label", wasVisible ? "显示密码" : "隐藏密码"),
      (toggleButton.title = wasVisible ? "显示密码" : "隐藏密码"),
      syncPasswordState());
  });
for (const formInput of document.querySelectorAll(".auth-form input"))
  (formInput.addEventListener("focus", () => {
    formInput.name === "username" && characters.classList.add("is-account-typing");
  }),
    formInput.addEventListener("blur", () => {
      formInput.name === "username" && characters.classList.remove("is-account-typing");
    }),
    formInput.addEventListener("input", syncPasswordState));
(document.addEventListener("pointermove", (pointerEvent) => {
  const boundingBox = characters.getBoundingClientRect(),
    lookX = Math.max(
      -1,
      Math.min(
        1,
        (pointerEvent.clientX - boundingBox.left - boundingBox.width / 2) / (boundingBox.width / 2),
      ),
    ),
    lookY = Math.max(
      -1,
      Math.min(
        1,
        (pointerEvent.clientY - boundingBox.top - boundingBox.height / 2) /
          (boundingBox.height / 2),
      ),
    );
  (characters.style.setProperty("--look-x", lookX.toFixed(2)),
    characters.style.setProperty("--look-y", lookY.toFixed(2)));
}),
  syncPasswordState());
