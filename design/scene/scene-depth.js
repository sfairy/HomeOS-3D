/**
 * 场景 3D 相机：把指针位置喂给场景的景深层，并让表单坞跟着微倾。
 *
 * 从哪里来：.hos-scene__stage 里的十几张平面本来就按远近排好了，但静置时它们是一张画 ——
 * 层与层之间没有相对位移，眼睛读不出深度。这里把指针当成一台悬停的相机：远处星层几乎不动，
 * 近处浮尘和扫描线多走一点，前后关系立刻成立。
 *
 * 为什么只写变量：位移的实际算法留在 scene.css 的景深段（--hos-depth），倾斜留在 page.css
 * 的 .hos-dock。脚本只把指针换算成两个像素数 + 两个角度，写进 CSS 变量。
 * 改这两处之前先看这里 —— 变量名是两份样式与这份脚本之间唯一的契约：
 *
 *   scene.css  .hos-scene__stage > *  → --hos-px / --hos-py（px）
 *   page.css   .hos-page > .hos-dock  → --hos-tilt-x / --hos-tilt-y（deg）
 *
 * 脚本缺席、或页面没有场景时，变量保持默认值，页面与从前完全一致 —— 这份片段同时喂
 * 主项目入口页、商店入口页和 Activate，不能因为少一个脚本就变样。
 *
 * 为什么必须给自己留停止开关：空闲漂移没有自然终点（正弦一直在走），所以这个 rAF 循环
 * 不会像一次动画那样自己结束。标签页切走、用户开了减少动态效果，都要真的停下来。
 *
 * 分发产物由 tools/sync_scene_assets.mjs 写入，请勿手改副本。
 */
(function sceneDepth() {
  const stage = document.querySelector('.hos-scene__stage');
  const page = document.querySelector('.hos-page');
  if (!stage && !page) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');

  // 位移量程必须随视口缩放，不能写死成 14px。理由在 scene.css 景深段那段推导里：
  // 全屏层靠透视放大出来的「余量」正比于它离透视角的距离，而透视角定在 30% 处 ——
  // 窄屏上到左边缘只有 0.3×420 ≈ 126px，放大出的余量只剩 1px 量级，
  // 写死 14px 就会在左边缘拉出一道缝（实测：窄屏下 scan 层缺 9.67px、haze 缺 7.44px）。
  // 0.058 是上限 140/(2400−140d) 在 d→0 时的取值，也就是最坏的那一档。
  const shiftRange = () => {
    // 竖直方向只走 0.7 倍，所以它的约束更松。
    return Math.max(4, Math.min(14, window.innerWidth * 0.3 * 0.058, window.innerHeight * 0.5 * 0.083));
  };
  const MAX_TILT = 2.6;
  const IDLE_AFTER = 2400;
  const FRAME_MS = 1000 / 30; // 30fps 足够：最大速度下每帧位移不到 0.2px
  const FOLLOW = 0.09; // 每帧向目标靠拢的比例，约 250ms 追上

  let pointerX = 0; // -1（左）..1（右）
  let pointerY = 0;
  let lastPointerAt = 0;
  let shiftX = 0;
  let shiftY = 0;
  let tiltX = 0;
  let tiltY = 0;
  let frameId = 0;
  let lastFrameAt = 0;
  let running = false;

  function apply() {
    if (stage) {
      stage.style.setProperty('--hos-px', shiftX.toFixed(2) + 'px');
      stage.style.setProperty('--hos-py', shiftY.toFixed(2) + 'px');
    }
    if (page) {
      page.style.setProperty('--hos-tilt-x', tiltX.toFixed(3) + 'deg');
      page.style.setProperty('--hos-tilt-y', tiltY.toFixed(3) + 'deg');
    }
  }

  function clear() {
    shiftX = shiftY = tiltX = tiltY = 0;
    stage?.style.removeProperty('--hos-px');
    stage?.style.removeProperty('--hos-py');
    page?.style.removeProperty('--hos-tilt-x');
    page?.style.removeProperty('--hos-tilt-y');
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
    let toTiltX;
    let toTiltY;

    // 每帧取一次：改窗口大小时量程立刻跟上，不用额外监听 resize。
    const maxShift = shiftRange();

    if (now - lastPointerAt > IDLE_AFTER) {
      // 空闲漂移。两个互质周期的正弦叠加：不会在同一处来回摆，也永远不会整齐地回到原点。
      const t = now / 1000;
      toShiftX = Math.sin(t / 9.5) * maxShift * 0.55;
      toShiftY = Math.sin(t / 13.3 + 1.1) * maxShift * 0.4;
      toTiltX = Math.sin(t / 12.1 + 0.6) * MAX_TILT * 0.5;
      toTiltY = Math.sin(t / 15.7) * MAX_TILT * 0.5;
    } else {
      // 指针跟随：画面往指针的反方向让开一点，像一台跟着看过去的相机；
      // 坞体则朝指针方向微微抬起 —— 一个躲、一个迎，深度才有两个证据。
      toShiftX = -pointerX * maxShift;
      toShiftY = -pointerY * maxShift * 0.7;
      toTiltX = pointerY * MAX_TILT;
      toTiltY = -pointerX * MAX_TILT;
    }

    shiftX += (toShiftX - shiftX) * k;
    shiftY += (toShiftY - shiftY) * k;
    tiltX += (toTiltX - tiltX) * k;
    tiltY += (toTiltY - tiltY) * k;

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
