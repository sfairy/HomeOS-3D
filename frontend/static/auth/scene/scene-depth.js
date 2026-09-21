/**
 * 场景视差相机：把指针位置喂给场景各层的景深倍率。
 *
 * 从哪里来：.hos-scene__stage 里的十几张平面本来就按远近排好了，但静置时它们是一张画 ——
 * 层与层之间没有相对位移，眼睛读不出深度。这里把指针当成一台悬停的相机：远处的晨光几乎
 * 不动，近处的轨道环多走一点，前后关系立刻成立。
 *
 * 为什么只写变量：位移的实际算法留在 scene.css 的景深段（每层的 --hos-depth）。脚本只把
 * 指针换算成两个像素数，写进 CSS 变量。改样式之前先看这里 —— 变量名是样式与脚本之间唯一
 * 的契约：
 *
 *   scene.css  .hos-scene__stage > *  → --hos-px / --hos-py（px）
 *
 * 只有 X/Y：没有 Z 位移，也不倾表单坞。两件事的代价分别写在 scene.css 景深段的 ①②③ 与
 * page.css 的 .hos-dock 那一段 —— 那里才是判断依据，这里不复制结论。
 *
 * 脚本缺席、或页面没有场景时，变量保持默认值，页面与从前完全一致 —— 这份片段同时喂
 * 主项目入口页、商店入口页和 Activate，不能因为少一个脚本就变样。
 *
 * 为什么必须给自己留停止开关：空闲漂移没有自然终点（正弦一直在走），所以这个 rAF 循环
 * 不会像一次动画那样自己结束。标签页切走、用户开了减少动态效果，都要真的停下来。
 *
 * 改动请以 design/scene/ 下的同名文件为准，两侧必须一致，勿单侧手改。
 */
(function sceneDepth() {
  const stage = document.querySelector('.hos-scene__stage');
  if (!stage) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');

  // 量程随视口收放：桌面 16px，窄屏按比例降到 6px 封底。
  // 不再像有 Z 位移时那样按透视余量反推上限 —— 现在会动的全是「自带定位尺寸」的装饰层
  // （满屏层的倍率是 0，见 scene.css），没有露边风险，这个数字就只由幅度好不好看决定。
  const shiftRange = () => Math.max(6, Math.min(16, window.innerWidth * 0.016));
  const IDLE_AFTER = 2400;
  const FRAME_MS = 1000 / 30; // 30fps 足够：最大速度下每帧位移不到 0.2px
  const FOLLOW = 0.09; // 每帧向目标靠拢的比例，约 250ms 追上

  let pointerX = 0; // -1（左）..1（右）
  let pointerY = 0;
  let lastPointerAt = 0;
  let shiftX = 0;
  let shiftY = 0;
  let frameId = 0;
  let lastFrameAt = 0;
  let running = false;

  function apply() {
    stage.style.setProperty('--hos-px', shiftX.toFixed(2) + 'px');
    stage.style.setProperty('--hos-py', shiftY.toFixed(2) + 'px');
  }

  function clear() {
    shiftX = 0;
    shiftY = 0;
    stage.style.removeProperty('--hos-px');
    stage.style.removeProperty('--hos-py');
  }

  function schedule() {
    if (frameId || !running) return;
    frameId = requestAnimationFrame(tick);
  }

  function tick(now) {
    frameId = 0;
    if (now - lastFrameAt < FRAME_MS) {
      schedule();
      return;
    }
    // 掉帧时按实际间隔补偿追赶速度，否则回到前台后的第一帧会「弹」一下。
    const step = Math.min(64, lastFrameAt ? now - lastFrameAt : FRAME_MS);
    lastFrameAt = now;
    const k = 1 - Math.pow(1 - FOLLOW, step / 16.67);

    let toShiftX;
    let toShiftY;

    // 每帧取一次：改窗口大小时量程立刻跟上，不用额外监听 resize。
    const maxShift = shiftRange();

    if (now - lastPointerAt > IDLE_AFTER) {
      // 空闲漂移。两个互质周期的正弦叠加：不会在同一处来回摆，也永远不会整齐地回到原点。
      const t = now / 1000;
      toShiftX = Math.sin(t / 9.5) * maxShift * 0.55;
      toShiftY = Math.sin(t / 13.3 + 1.1) * maxShift * 0.4;
    } else {
      // 指针跟随：画面往指针的反方向让开一点，像一台跟着看过去的相机。
      toShiftX = -pointerX * maxShift;
      toShiftY = -pointerY * maxShift * 0.7;
    }

    shiftX += (toShiftX - shiftX) * k;
    shiftY += (toShiftY - shiftY) * k;

    apply();
    schedule();
  }

  function start() {
    if (running || reduceMotion.matches) return;
    running = true;
    lastFrameAt = 0;
    schedule();
  }

  function stop() {
    running = false;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      // 触摸设备也发 pointermove（滑动时），但那时候没有「悬停的相机」，只有手指。
      if (!finePointer.matches) return;
      pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      pointerY = (event.clientY / window.innerHeight) * 2 - 1;
      lastPointerAt = performance.now();
      start();
    },
    { passive: true }
  );

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      stop();
      clear();
    } else {
      lastPointerAt = 0;
      start();
    }
  });

  // 没人碰指针时也要动起来：一进来就是漂移状态（lastPointerAt = 0 让第一帧就判空闲）。
  start();
})();
