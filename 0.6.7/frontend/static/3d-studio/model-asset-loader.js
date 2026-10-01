export function releaseModelAsset(arg1) {
  const set1 = new Set([
      arg1?.preparedTemplate?.source,
      arg1?.source,
      arg1?.scene,
      ...(arg1?.scenes || []),
    ]),
    set2 = new Set(),
    set3 = new Set(),
    set4 = new Set();
  for (const value1 of set1)
    value1?.traverse?.((arg2) => {
      arg2.geometry && set2.add(arg2.geometry);
      for (const value2 of [arg2.material].flat().filter(Boolean)) {
        set3.add(value2);
        for (const value3 of Object.values(value2)) value3?.isTexture && set4.add(value3);
      }
    });
  for (const value4 of [...set2, ...set3, ...set4]) value4.dispose?.();
}
export function createModelAssetLoader({
  THREE: arg3,
  GLTFLoader: arg4,
  createDracoLoader: arg5 = () => null,
  requestTimeoutMs: arg6 = 60000,
  fetchImpl: arg7 = globalThis.fetch,
  resolveURL: arg8 = (arg11) => arg11,
  scheduleDeadline: arg9 = setTimeout,
  cancelDeadline: arg10 = clearTimeout,
}) {
  const list1 = [],
    set5 = new Set(),
    value5 = Math.max(50, Number(arg6) || 60000);
  let value6 = false;
  function fn1() {
    const value7 = new arg3.LoadingManager();
    value7.setURLModifier(arg8);
    const value8 = arg5(value7),
      value9 = new arg4(value7);
    return (
      value8 && value9.setDRACOLoader(value8),
      {
        manager: value7,
        decoder: value8,
        loader: value9,
        retired: false,
      }
    );
  }
  function fn2(arg12) {
    arg12.retired || ((arg12.retired = true), arg12.manager.abort(), arg12.decoder?.dispose());
  }
  function fn3(arg13) {
    if (value6) return Promise.reject(new DOMException("模型加载器已关闭", "AbortError"));
    const value10 = list1.pop() || fn1(),
      abortController1 = new AbortController();
    let value11, value12;
    const promise1 = new Promise((arg14, arg15) => {
      ((value11 = (arg16) => {
        (abortController1.abort(arg16), fn2(value10), arg15(arg16));
      }),
        (value12 = arg9(
          () => value11(new DOMException("模型加载超时，已取消并释放加载名额", "TimeoutError")),
          value5,
        )),
        (async () => {
          const value13 = await arg7(arg8(arg13), {
            signal: abortController1.signal,
            credentials: "same-origin",
          });
          if (!value13.ok) {
            const error1 = new Error("模型请求失败：HTTP " + value13.status);
            throw ((error1.response = value13), error1);
          }
          const value14 = await value13.arrayBuffer();
          if (abortController1.signal.aborted) throw abortController1.signal.reason;
          const value15 = arg13.slice(0, arg13.lastIndexOf("/") + 1);
          return await value10.loader.parseAsync(value14, value15);
        })().then(
          (arg17) => {
            abortController1.signal.aborted ? releaseModelAsset(arg17) : arg14(arg17);
          },
          (arg18) => {
            (fn2(value10), arg15(arg18));
          },
        ));
    });
    return (
      set5.add(value11),
      promise1.finally(() => {
        (arg10(value12), set5.delete(value11), !value6 && !value10.retired && list1.push(value10));
      })
    );
  }
  function fn4() {
    if (!value6) {
      value6 = true;
      for (const value16 of set5) value16(new DOMException("模型加载器已关闭", "AbortError"));
      for (const value17 of list1.splice(0)) fn2(value17);
    }
  }
  return {
    loadAsync: fn3,
    dispose: fn4,
  };
}
