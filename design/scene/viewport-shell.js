/**
 * 视口缩放壳：把整页按 1366×1024 的设计稿等比缩放，装进任意尺寸的窗口。
 *
 * 从哪里来：HomeOS-Activate 签发页原先把它内联在 <script> 里。抽出来是因为它是
 * 「壳」而不是「场景」——只有需要固定比例画布的页面（签发页）才用得上，主项目入口页
 * 与商店入口页都是全视口自适应，装了反而会缩错。
 *
 * 与 --hos-scene 的 cqw 约定：缩放开启时 .app-shell 的宽高被写成「视口 / 缩放比」，
 * 因此场景内的容器查询单位仍然按设计稿尺度解析，两端一致。
 *
 * 依赖 DOM：#appShell（缩放对象）、#appContent（固定设计稿尺寸的内容层）。
 * 两者缺任意一个就直接返回：本脚本贴在共享壳里，没壳的页面不该因此报错。
 *
 * 改动请以 design/scene/ 下的同名文件为准，两侧必须一致，勿单侧手改。
 *
 * 注意这是一对**参考副本**：本仓库里没有任何页面用到它（`#appShell` / `#appContent`
 * 在全库都不存在），真正的消费方是同名的兄弟项目。因此在这儿判断「有没有人读某个变量」
 * 只能看这一对文件自身（viewport-shell.js + viewport-shell.css 是配套的）。
 * 2026-09 清掉 `--hos-scale` 时正是按这个口径判的：这一对文件里谁都不读它，
 * 若兄弟项目那侧有读，需要把这次删除一并带过去、或在其 CSS 里补 var() 取用点。
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
    // 这里曾有 shell.style.setProperty('--hos-scale', scale)。全站没有任何 var(--hos-scale)
    // 取用它 —— 缩放一直是直接落成上面那行行内 transform 的，这枚变量自始至终没接上。
    // 已删除（tools/check_invariants.mjs 第 10 条记录了这一类「写了没人读」）。
    // 若将来真需要从样式表侧按缩放比做补偿（例如浮层反向缩放以保持视觉尺寸一致），
    // 再把 scale 发布成 --hos-scale；届时要连行内 transform 一起挪进样式表，
    // 因为行内样式永远压过样式表规则、变量加了也不会生效。
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
