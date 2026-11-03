/**
 * 窗型绘制弹窗的 DOM 骨架（0.8.4）。
 *
 * 单独一个文件：它是从 0.8.4 的 `studio-window-designer.js` 里原样抽出来的模板，
 * 保留 `#wd-*` 这组 id 与 class —— 样式表（`designer.css`）按这些选择器写，
 * 控制器（`designer.ts`）也按它们取节点，改一个名字要同时改三处。
 */
export const WINDOW_DESIGNER_TEMPLATE = `<dialog class="window-designer" id="wd-designer" aria-labelledby="wd-dialog-title">
    <header class="dialog-header"><div><h2 id="wd-dialog-title">自定义窗型</h2><p>窗户正立面 · 在区域中画分隔线，点击窗格设置开启方式</p></div><div class="dialog-actions"><button id="wd-tutorial" class="tutorial-entry">操作教程</button><button id="wd-close-dialog" aria-label="关闭绘制弹窗">×</button></div></header>
    <nav class="drawing-toolbar" aria-label="绘制工具">
      <div class="tool-group"><button data-tool="select" aria-pressed="true">选择 / 移动</button><button data-tool="x" aria-pressed="false">│ 竖向分隔</button><button data-tool="y" aria-pressed="false">─ 横向分隔</button></div>
      <div class="tool-group"><button id="wd-undo" disabled>撤销</button><button id="wd-redo" disabled>重做</button><button id="wd-delete-split" disabled>删除选中线段</button></div>
      <button id="wd-blank">清空分格</button>
    </nav>
    <div class="editor-grid">
      <section class="drawing-section"><div class="panel-heading"><strong>正立面绘制</strong><span id="wd-cell-count">2 个分格</span></div><div class="drawing-host"><svg id="wd-drawing" role="img" aria-label="窗户正立面绘制画布"></svg></div><p id="wd-tool-hint" class="tool-hint">点击窗格设置类型；拖动分隔线调整尺寸。</p><div class="cell-list" id="wd-cell-list" aria-label="选择窗格"></div></section>
      <section class="preview-section"><div class="panel-heading"><strong>3D 预览</strong><div><button id="wd-front-view">室内正面</button><button id="wd-exterior-view">室外正面</button><button id="wd-reset-view">透视</button></div></div><div id="wd-preview" class="view"></div><div class="motion-controls"><label for="wd-opening">临时开合预览 <output id="wd-opening-value" aria-live="off">0%</output></label><input id="wd-opening" type="range" min="0" max="100" step="any" value="0"><div class="motion-buttons"><button id="wd-preview-play">播放动画</button><button id="wd-preview-open">打开</button><button id="wd-preview-close">关闭</button><button id="wd-preview-stop" disabled>停止</button><button id="wd-preview-default">恢复默认开度</button></div><span id="wd-motion-status" class="muted" role="status">预览就绪 · 不控制设备</span></div></section>
      <aside class="inspector"><div class="section-label">整窗尺寸</div><div class="field-pair"><label>宽度 / mm<input id="wd-draft-width" type="number" min="300" max="20000" step="10"></label><label>高度 / mm<input id="wd-draft-height" type="number" min="300" max="20000" step="10"></label></div><hr>
        <h3 id="wd-selection-name">窗格 1</h3>
        <div id="wd-leaf-fields"><label>区域类型<select id="wd-leaf-kind"><option value="fixed">固定玻璃</option><option value="casement">平开窗</option><option value="top-hung">上悬窗 · 顶部铰链</option><option value="bottom-hung">下悬窗 · 底部铰链</option><option value="sliding">推拉窗组</option></select></label>
          <div class="field-pair"><label>分格宽 / mm<input id="wd-leaf-width" type="number" step="10"></label><label>分格高 / mm<input id="wd-leaf-height" type="number" step="10"></label></div>
          <div id="wd-casement-fields" hidden><div class="field-pair"><label id="wd-side-hinge-field">铰链位置<select id="wd-hinge"><option value="left">左侧</option><option value="right">右侧</option></select></label><label id="wd-hung-hinge-field" hidden>铰链位置<input id="wd-hung-hinge" value="顶部" disabled></label><label>开启方向<select id="wd-swing"><option value="in">向内开</option><option value="out">向外开</option></select></label></div></div>
          <div id="wd-sliding-fields" hidden><label>窗扇与轨道<select id="wd-slide-count"><option value="2">两扇 / 双轨</option><option value="3">三扇 / 三轨</option></select></label><label>开启后停靠<select id="wd-slide-direction"><option value="right">右侧</option><option value="left">左侧</option></select></label><p class="muted">各扇沿独立轨道叠合，保留搭接。</p></div>
          <div id="wd-default-opening-field"><div id="wd-opening-fields" class="field-pair"><label id="wd-angle-field">最大开角 / °<input id="wd-angle" type="number" min="10" max="120" step="5" value="75"></label><label>默认开度 / %<input id="wd-default-opening" type="number" min="0" max="100" step="5" value="0"></label></div><p class="field-note">默认开度值即户型图未绑定设备时默认的开合大小，数值为最大开角的百分比。</p></div>
          <div id="wd-sash-remarks"></div>
        </div>
        <div id="wd-split-fields" hidden><label id="wd-split-label">距左边 / mm<input id="wd-split-position" type="number" step="10"></label><button id="wd-equalize" class="full">两侧平均分配</button><p id="wd-split-delete-note" class="field-note"></p></div>
      </aside>
    </div>
    <p id="wd-notice" class="designer-notice" role="alert" hidden></p><footer class="dialog-footer"><span id="wd-draft-status" role="status">修改尚未应用</span><div><button id="wd-cancel">取消</button><button id="wd-apply" class="primary">应用窗型</button></div></footer>
  </dialog>`;
