export function createMotionBuffer({
  THREE: arg1,
  renderer: arg2,
  maxBytes: arg3 = 32 * 1024 * 1024,
}) {
  const value1 = new arg1.Vector2(),
    value2 = new arg1.Scene(),
    value3 = new arg1.Camera(),
    value4 = new arg1.BufferGeometry();
  value4.setAttribute(
    "position",
    new arg1.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const value5 = new arg1.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      blending: arg1.NoBlending,
      toneMapped: false,
      uniforms: {
        map: {
          value: null,
        },
      },
      vertexShader:
        "varying vec2 uvMotion; void main(){uvMotion=position.xy*.5+.5;gl_Position=vec4(position,1.);}",
      fragmentShader:
        "uniform sampler2D map; varying vec2 uvMotion; void main(){gl_FragColor=texture2D(map,uvMotion);}",
    }),
    value6 = new arg1.Mesh(value4, value5);
  ((value6.frustumCulled = false), value2.add(value6));
  let value7 = null,
    text1 = "",
    value8 = false,
    value9 = false,
    value10 = false;
  const object1 = {
    allocations: 0,
    frames: 0,
    bytes: 0,
    failures: 0,
  };
  function fn1(arg4) {
    arg2.getSize(value1);
    const value11 = Math.floor(value1.x * arg4),
      value12 = Math.floor(value1.y * arg4),
      value13 = Math.min(4, arg2.capabilities.maxSamples || 0),
      value14 = value11 * value12 * 4 * (value13 ? 1 + 2 * value13 : 2);
    return {
      width: value11,
      height: value12,
      samples: value13,
      bytes: value14,
      key: value11 + "/" + value12 + "/" + value13 + "/" + arg2.outputColorSpace,
    };
  }
  function fn2() {
    (value7?.dispose(),
      (value7 = null),
      (text1 = ""),
      (value8 = false),
      (object1.bytes = 0),
      (value5.uniforms.map.value = null));
  }
  function fn3(arg5) {
    return !value9 && value8 && text1 === fn1(arg5).key;
  }
  function fn4(arg6) {
    if (value9 || arg2.getRenderTarget() || value10) return false;
    const value15 = fn1(arg6);
    if (
      !Number.isFinite(value15.bytes) ||
      value15.width < 1 ||
      value15.height < 1 ||
      value15.bytes > arg3
    )
      return (fn2(), false);
    if (fn3(arg6)) return true;
    fn2();
    try {
      ((value7 = new arg1.WebGLRenderTarget(value15.width, value15.height, {
        samples: value15.samples,
        colorSpace: arg2.outputColorSpace,
        depthBuffer: true,
        stencilBuffer: false,
      })),
        (value7.isXRRenderTarget = true),
        (value7.texture.internalFormat = "RGBA8"),
        arg2.initRenderTarget(value7));
      const value16 = arg2.getContext?.();
      if (value16) {
        let value17;
        try {
          (arg2.setRenderTarget(value7),
            (value17 =
              value16.checkFramebufferStatus(value16.FRAMEBUFFER) ===
              value16.FRAMEBUFFER_COMPLETE));
        } finally {
          arg2.setRenderTarget(null);
        }
        if (!value17) throw new Error("Motion framebuffer unavailable");
      }
      return (
        (value5.uniforms.map.value = value7.texture),
        arg2.compile(value2, value3),
        (text1 = value15.key),
        (value8 = true),
        (object1.bytes = value15.bytes),
        object1.allocations++,
        true
      );
    } catch {
      return (object1.failures++, fn2(), false);
    }
  }
  function fn5(arg7, arg8) {
    if (!value8 || value9 || arg2.getRenderTarget()) {
      arg2.render(arg7, arg8);
      return;
    }
    const value18 = arg2.info.autoReset,
      value19 = arg2.getViewport(new arg1.Vector4()),
      value20 = arg2.getScissor(new arg1.Vector4()),
      value21 = arg2.getScissorTest(),
      value22 = arg2.autoClear;
    let value23;
    value10 = true;
    try {
      (arg2.setRenderTarget(value7),
        arg2.render(arg7, arg8),
        (value23 = {
          ...arg2.info.render,
        }),
        arg2.setRenderTarget(null),
        arg2.setScissorTest(false),
        (arg2.autoClear = true),
        arg2.render(value2, value3),
        object1.frames++);
    } finally {
      (arg2.setRenderTarget(null),
        arg2.setViewport(value19),
        arg2.setScissor(value20),
        arg2.setScissorTest(value21),
        (arg2.autoClear = value22),
        (arg2.info.autoReset = value18),
        value23 &&
          Object.assign(arg2.info.render, value23, {
            calls: value23.calls + 1,
            triangles: value23.triangles + 1,
          }),
        (value10 = false));
    }
  }
  return {
    prepare: fn4,
    matches: fn3,
    render: fn5,
    clear: fn2,
    stats: object1,
    get isScreenPass() {
      return value10 && arg2.getRenderTarget() === value7;
    },
    dispose() {
      value9 || (fn2(), value4.dispose(), value5.dispose(), (value9 = true));
    },
  };
}
