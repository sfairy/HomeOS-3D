/** 邮箱验证码的重发冷却（秒级倒计时）。 */

import { onBeforeUnmount, ref } from "vue";

export function useCooldown() {
  const seconds = ref(0);
  let timer: number | undefined;

  function stop() {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    seconds.value = 0;
  }

  function start(total: number) {
    if (!Number.isFinite(total) || total <= 0) return;
    stop();
    let remaining = Math.ceil(total);
    seconds.value = remaining;
    timer = window.setInterval(() => {
      remaining -= 1;
      seconds.value = Math.max(0, remaining);
      if (remaining <= 0) stop();
    }, 1000);
  }

  onBeforeUnmount(stop);

  return { seconds, start, stop };
}
