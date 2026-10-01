const form = document.querySelector("#setup-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');
form.addEventListener("submit", async (submitEvent) => {
  (submitEvent.preventDefault(), (message.textContent = ""), (message.hidden = true));
  const formData = new FormData(form),
    password = String(formData.get("password") || ""),
    passwordConfirmation = String(formData.get("passwordConfirmation") || "");
  if (password !== passwordConfirmation) {
    ((message.textContent = "两次输入的密码不一致。"), (message.hidden = false));
    return;
  }
  submit.disabled = true;
  try {
    const response = await fetch("/api/v1/setup/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: password,
          passwordConfirmation: passwordConfirmation,
        }),
      }),
      payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail?.[0]?.msg || payload.detail || "初始化失败。");
    window.location.assign("/");
  } catch (caughtError) {
    ((message.textContent = caughtError.message),
      (message.hidden = false),
      (submit.disabled = false));
  }
});
