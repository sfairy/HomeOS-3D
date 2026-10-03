/** 行操作「⋯」菜单的全局协调：同一时刻只开一个，点外面 / Esc / 滚动都关掉。 */

interface RowMenuHandle {
  root: HTMLElement;
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
}

const handles: RowMenuHandle[] = [];
let installed = false;

export function closeRowMenus(): void {
  for (const handle of [...handles]) handle.close();
}

export function registerRowMenu(handle: RowMenuHandle): () => void {
  handles.push(handle);
  install();
  return () => {
    const index = handles.indexOf(handle);
    if (index >= 0) handles.splice(index, 1);
  };
}

function install(): void {
  if (installed) return;
  installed = true;

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        closeRowMenus();
        return;
      }
      const toggle = target.closest("[data-menu-toggle]");
      if (toggle) {
        const root = toggle.closest(".menu") as HTMLElement | null;
        const handle = root ? handles.find((item) => item.root === root) : undefined;
        if (!handle) return;
        const wasOpen = handle.isOpen();
        closeRowMenus();
        if (!wasOpen) handle.open();
        return;
      }
      closeRowMenus();
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRowMenus();
  });

  document.addEventListener("scroll", closeRowMenus, { passive: true, capture: true });
  window.addEventListener("resize", closeRowMenus, { passive: true });
}
