const form = document.querySelector("#login-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');
function loginDestination() {
  const nextPath = new URLSearchParams(window.location.search).get("next") || "/";
  return nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
}
form.addEventListener("submit", async (submitEvent) => {
  (submitEvent.preventDefault(), (message.textContent = ""), (message.hidden = true));
  const formData = new FormData(form);
  submit.disabled = true;
  try {
    const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || ""),
        }),
      }),
      payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "登录失败。");
    window.location.assign(loginDestination());
  } catch (caughtError) {
    ((message.textContent = caughtError.message),
      (message.hidden = false),
      (submit.disabled = false));
  }
});
