/**
 * 视口缩放壳：把整页按 1366×1024 的设计稿等比缩放，装进任意尺寸的窗口。
 */
(function syncViewportShell() {
  const DESIGN_W = 1366;
  const DESIGN_H = 1024;
  const STORAGE_KEY = 'homeos_viewport_scaling';

  const shell = document.getElementById('appShell');
  const content = document.getElementById('appContent');
  if (!shell || !content) return;

  const isPhone = (w, h) => {
    const min = Math.min(w, h);
    const max = Math.max(w, h);
    return min < 600 && max < 900;
  };
  const isTabletLike = (w, h) => {
    const min = Math.min(w, h);
    const max = Math.max(w, h);
    return min >= 600 && max >= 768;
  };

  // 手机强制关闭整页缩放；其余读用户在站内的偏好。
  function readScalingEnabled(w, h) {
    if (isPhone(w, h)) return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === 'true';
    } catch (_) {
      /* 隐私模式下 localStorage 会抛：按默认值走 */
    }
    // 平板与桌面都默认关闭，与站内 useScaling 的默认一致。
    if (isTabletLike(w, h) && !isPhone(w, h)) return false;
    return false;
  }

  function viewportSize() {
    const vv = window.visualViewport;
    return {
      w: Math.round(vv?.width ?? window.innerWidth),
      h: Math.round(vv?.height ?? window.innerHeight),
    };
  }

  function apply() {
    const { w, h } = viewportSize();
    const phone = isPhone(w, h);
    const scaling = readScalingEnabled(w, h);

    shell.classList.toggle('app-shell--scaling', scaling);
    shell.classList.toggle('app-shell--mobile-native', phone && !scaling);
    content.classList.toggle('app-shell__content--fluid', !scaling);

    if (!scaling) {
      shell.style.width = '100%';
      shell.style.height = '100%';
      shell.style.maxWidth = phone ? '100%' : DESIGN_W + 'px';
      shell.style.transform = '';
      shell.style.transformOrigin = '';
      shell.style.flexShrink = '';
      content.style.width = '';
      content.style.height = '';
      content.style.flexShrink = '';
      return;
    }

    const scale = Math.min(w / DESIGN_W, h / DESIGN_H);
    const shellW = w / scale;
    const shellH = h / scale;
    shell.style.width = shellW + 'px';
    shell.style.height = shellH + 'px';
    shell.style.maxWidth = '';
    shell.style.transform = 'scale(' + scale + ')';
    shell.style.transformOrigin = 'center center';
    shell.style.flexShrink = '0';
    content.style.width = DESIGN_W + 'px';
    content.style.height = DESIGN_H + 'px';
    content.style.flexShrink = '0';
  }

  // 拖动窗口时每一帧都重排会卡；停手 120ms 后再算一次。
  let timer = null;
  const onResize = () => {
    shell.classList.add('app-shell--resizing');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      shell.classList.remove('app-shell--resizing');
      apply();
    }, 120);
  };

  apply();
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);
  window.addEventListener('homeos-scaling-change', apply);
})();
