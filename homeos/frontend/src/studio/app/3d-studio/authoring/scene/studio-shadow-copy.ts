/**
 * 阴影纹理拷贝（上游 `studio-shadow-copy.js`，0.8.1 新增）。
 *
 * 分层阴影要把「一层的基础阴影图」按每个楼层的裁剪矩形拷进纹理数组的一层。0.8.1 之前
 * 只能 `copyTextureToTexture`（three 的逐层路径），在 `DataArrayTexture` 上会退化成
 * 一次逐像素拷贝，大图很慢。
 *
 * 这里改成直接走 `blitFramebuffer`：
 *
 * - 读/写帧缓冲各自 attach 源/目标纹理（数组纹理按层 `framebufferTextureLayer`）；
 * - `blitFramebuffer` 一次搬整个矩形，硬件完成；
 * - **必须**保存并还原 `READ_FRAMEBUFFER_BINDING` / `DRAW_FRAMEBUFFER_BINDING` / 剪裁状态，
 *   否则会把 three 当帧的渲染状态搞乱（表现为下一次 draw 画到错误的 target 上）。
 *
 * 不具备 `blitFramebuffer`（WebGL1）时退回 `copyTextureToTexture`。
 *
 * 说明：本项目的 three 是浏览器直载的外部模块，编译期只有宽泛的影子声明，所以这里用
 * 最小结构化接口描述用到的部分，而不是 `import type` from "three"。
 */

export interface ShadowCopyBox {
  min: { x: number; y: number; z?: number };
  max: { x: number; y: number; z?: number };
  /** `THREE.Box3` 上有这个标量字段；二维 box 没有。 */
  isBox3?: boolean;
}

/** 只用到 three 纹理的数组层标记。 */
export interface ShadowCopyTexture {
  isDataArrayTexture?: boolean;
}

/** 只用到 three 渲染器状态与纹理属性表的这一小部分。 */
export interface ShadowCopyRenderer {
  getContext?(): unknown;
  properties: {
    get(texture: ShadowCopyTexture): { __webglTexture?: WebGLTexture };
  };
  state: {
    bindFramebuffer(target: number, framebuffer: WebGLFramebuffer | null): void;
    setScissorTest(enabled: boolean): void;
  };
  copyTextureToTexture(
    source: ShadowCopyTexture,
    target: ShadowCopyTexture,
    sourceBox: ShadowCopyBox,
    targetOrigin: { x: number; y: number; z?: number },
  ): void;
}

export interface ShadowTextureCopy {
  /** 把 `source` 的 `sourceBox` 区域拷到 `target` 的 `targetOrigin`（`z` 为数组层）。 */
  copy(
    source: ShadowCopyTexture,
    target: ShadowCopyTexture,
    sourceBox: ShadowCopyBox,
    targetOrigin: { x: number; y: number; z?: number },
  ): void;
  release(): void;
}

function createFallbackCopy(renderer: ShadowCopyRenderer): ShadowTextureCopy {
  return {
    copy: (source, target, sourceBox, targetOrigin) =>
      renderer.copyTextureToTexture(source, target, sourceBox, targetOrigin),
    release() {},
  };
}

export function createShadowTextureCopy(renderer: ShadowCopyRenderer): ShadowTextureCopy {
  const gl = renderer.getContext?.() as WebGL2RenderingContext | undefined;
  // WebGL1（或上下文已销毁）没有 blit，直接给 three 的逐纹理路径。
  if (!gl || typeof gl.blitFramebuffer !== "function") return createFallbackCopy(renderer);
  let readFramebuffer: WebGLFramebuffer | null = null,
    drawFramebuffer: WebGLFramebuffer | null = null;

  function release() {
    (readFramebuffer && gl?.deleteFramebuffer(readFramebuffer),
      drawFramebuffer && gl?.deleteFramebuffer(drawFramebuffer),
      (readFramebuffer = drawFramebuffer = null));
  }

  /**
   * 把纹理挂到「当前绑定在 `target` 上的帧缓冲」。
   *
   * 注意这里传的是**绑定点**（`READ_FRAMEBUFFER` / `DRAW_FRAMEBUFFER`）而不是帧缓冲对象：
   * `framebufferTextureLayer` / `framebufferTexture2D` 的语义就是作用于该绑定点当前绑定的
   * 那个帧缓冲。上游也是这么用的，改成传对象会直接编译不过。
   */
  function attachLayer(target: number, texture: ShadowCopyTexture, layer: number) {
    const webglTexture = renderer.properties.get(texture).__webglTexture;
    if (!webglTexture) throw new Error("阴影复制纹理尚未分配");
    if (texture.isDataArrayTexture)
      gl!.framebufferTextureLayer(target, gl!.COLOR_ATTACHMENT0, webglTexture, 0, layer);
    else gl!.framebufferTexture2D(target, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, webglTexture, 0);
  }

  return {
    release,
    copy(source, target, sourceBox, targetOrigin) {
      if (gl.isContextLost()) throw new Error("显卡上下文丢失，取消阴影复制");
      const previousReadFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
        previousDrawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
        wasScissorTestEnabled = gl.isEnabled(gl.SCISSOR_TEST);
      try {
        if (
          ((readFramebuffer ||= gl.createFramebuffer()),
          (drawFramebuffer ||= gl.createFramebuffer()),
          !readFramebuffer || !drawFramebuffer)
        )
          throw new Error("无法创建阴影复制缓冲");
        // 用 three 的 state 而不是裸 gl 调用：它能保证 three 内部的缓存跟着一起失效。
        renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
        renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawFramebuffer);
        renderer.state.setScissorTest(false);
        const copyWidth = sourceBox.max.x - sourceBox.min.x,
          copyHeight = sourceBox.max.y - sourceBox.min.y,
          // 与上游一致：`max.z - min.z` 就是层数（`[0,1]` 表示 1 层），不要再 +1。
          copyLayers = sourceBox.isBox3 ? (sourceBox.max.z || 0) - (sourceBox.min.z || 0) : 1;
        for (let layerIndex = 0; layerIndex < copyLayers; layerIndex++) {
          attachLayer(gl.READ_FRAMEBUFFER, source, (sourceBox.min.z || 0) + layerIndex);
          attachLayer(gl.DRAW_FRAMEBUFFER, target, (targetOrigin.z || 0) + layerIndex);
          gl.blitFramebuffer(
            sourceBox.min.x,
            sourceBox.min.y,
            sourceBox.max.x,
            sourceBox.max.y,
            targetOrigin.x,
            targetOrigin.y,
            targetOrigin.x + copyWidth,
            targetOrigin.y + copyHeight,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST,
          );
        }
      } finally {
        renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, previousReadFramebuffer);
        renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDrawFramebuffer);
        renderer.state.setScissorTest(wasScissorTestEnabled);
      }
    },
  };
}
