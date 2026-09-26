/**
 * 窗帘组合（一拖多）的控制面板：把组合内两名成员各渲染成一块独立窗帘面板，并排或竖排呈现。
 *
 * 组合本身没有新的控制逻辑，只负责把「组级视图模型」拆成每名成员各自的子视图模型，全部转发给
 * cover-panel.js 的 createCoverPanel —— 于是组内每个成员都能独立开合 / 调角度，任意一名成员
 * 缺失（memberItems 不足两名）时对应位置的面板会隐藏并停用。
 *
 * 约定：根元素上的 is-vertical 由组合配置的 panelLayout 决定；子面板复用 .i3d-cover-panel 的
 * 全部样式，因此本模块不再引入静态资源。
 */
import { createCoverPanel } from "./cover-panel.js?v=2609260946";

/**
 * 创建窗帘组合面板。
 *
 * 固定创建两块子面板（组合至多两名成员），update 时按 memberItems 的序号取用；这样成员从
 * 「无」变「有」时不必重建 DOM，拖动中的滑杆也不会被替换掉。onControl / onPreview 原样透传给
 * 每个子面板，组合层不额外拦截命令。
 */
export function createCoverGroupPanel({
  element: hostElement,
  onControl: onControl = async () => {},
  onPreview: onPreview = () => {}
} = {}) {
  // 用宿主的 ownerDocument，面板被放进别的文档（弹窗 / 预览）时才不会造出孤儿节点。
  const ownerDocument = hostElement?.ownerDocument || globalThis.document;
  const rootElement = hostElement || ownerDocument.createElement("section");
  rootElement.classList.add("i3d-cover-group-panel");
  // 与登记表里「面板构造时一律 hidden」的约定一致：首帧 renderLightPanel 之前这块面板还没被
  // 派发过，不预先藏起来就会在灯光面板里闪出两块空白子面板。
  rootElement.hidden = true;
  const titleElement = ownerDocument.createElement("h3");
  titleElement.className = "i3d-cover-group-title";
  rootElement.append(titleElement);
  // 组合固定两名成员，预先建好两块子面板并挂在根上。
  const memberPanels = [0, 1].map(() =>
    createCoverPanel({
      element: ownerDocument.createElement("section"),
      onControl: onControl,
      onPreview: onPreview
    })
  );
  // 子面板同样先藏起来：第一次 update() 才按 memberItems 决定显不显示，
  // 否则「组面板被藏起来」的窗口期内两名成员仍是可见的。
  memberPanels.forEach(panel => {
    panel.root.hidden = true;
  });
  memberPanels.forEach(panel => rootElement.append(panel.root));
  return {
    root: rootElement,
    update(nextViewModel = {}) {
      const memberItems = nextViewModel.item?.memberItems || [];
      // 竖排 / 并排由组合配置决定，样式层只看这个类名。
      rootElement.classList.toggle(
        "is-vertical",
        nextViewModel.item?.panelLayout === "vertical"
      );
      titleElement.textContent = nextViewModel.item?.label || "双层窗帘";
      rootElement.setAttribute("aria-label", titleElement.textContent);
      memberPanels.forEach((panel, index) => {
        const memberItem = memberItems[index];
        // 成员缺失时隐藏该子面板，并停用它（取消可能进行中的拖动预览）。
        panel.root.hidden = !memberItem;
        panel.root.setAttribute("aria-label", memberItem?.label || "窗帘 " + (index + 1));
        if (memberItem) {
          panel.update({
            item: memberItem,
            // 组级视图模型按成员 id 分发状态 / 展示态 / 错误，子面板各取各的。
            state: nextViewModel.states?.[memberItem.id],
            presentation: nextViewModel.presentations?.[memberItem.id],
            editing: nextViewModel.editing,
            error: nextViewModel.errors?.[memberItem.id] || ""
          });
        } else {
          // 0.6.5 的 cover-panel 导出 deactivate；本项目的 cover-panel.js 暂无该方法，
          // 故用可选调用兜底 —— 成员缺失时面板本就隐藏，没有需要撤销的拖动预览。
          panel.deactivate?.();
        }
      });
    },
    deactivate() {
      memberPanels.forEach(panel => panel.deactivate?.());
    },
    dispose() {
      memberPanels.forEach(panel => panel.dispose());
      rootElement.replaceChildren();
    }
  };
}
