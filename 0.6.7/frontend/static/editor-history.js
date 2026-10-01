const l = new Set(["actions", "bindings", "position", "properties", "style"]);
export function createRecoveryWriter(
  arg1,
  { delay: arg2 = 200, setTimer: arg3 = setTimeout, clearTimer: arg4 = clearTimeout } = {},
) {
  let value1 = null,
    value2 = null;
  const fn1 = () => {
    (value2 !== null && arg4(value2), (value2 = null));
    const value3 = value1;
    ((value1 = null), value3 && arg1(value3));
  };
  return {
    schedule(arg5) {
      (value1 && value1.projectId !== arg5.projectId && fn1(),
        (value1 = arg5),
        value2 === null && (value2 = arg3(fn1, arg2)));
    },
    flush: fn1,
    cancel(arg6) {
      !value1 ||
        value1.projectId !== arg6 ||
        ((value1 = null), value2 !== null && arg4(value2), (value2 = null));
    },
  };
}
export function editorComponentEntries(arg7) {
  const map1 = new Map(),
    list1 = [],
    fn2 = (arg8, arg9, arg10, arg11 = null) => {
      if (!arg8?.id) return;
      const value4 = String(arg8.id);
      (map1.set(value4, {
        component: arg8,
        scope: arg9,
        pagePath: arg10,
        parentId: arg11,
      }),
        list1.push(arg9 + ":" + (arg10 || "") + ":" + (arg11 || "") + ":" + value4));
      for (const value5 of arg8.children || []) fn2(value5, arg9, arg10, value4);
    };
  for (const value6 of arg7?.sharedComponents || []) fn2(value6, "shared", "", null);
  for (const value7 of arg7?.pages || [])
    for (const value8 of value7.components || []) fn2(value8, "page", value7.path, null);
  return {
    entries: map1,
    order: list1,
  };
}
export function editorComponentStructure(arg12) {
  const object1 = {};
  for (const [value9, value10] of Object.entries(arg12 || {}))
    l.has(value9) || value9 === "children" || (object1[value9] = value10);
  return (
    (object1.children = (arg12?.children || []).map((arg13) => arg13.id)),
    JSON.stringify(object1)
  );
}
export function editorDocumentFrameSignature(arg14) {
  const object2 = {
    ...(arg14 || {}),
  };
  return (
    (object2.sharedComponents = []),
    object2.pages &&
      (object2.pages = object2.pages.map((arg15) => ({
        ...arg15,
        components: [],
      }))),
    documentSignature(object2)
  );
}
export function documentSignature(arg16) {
  const fn3 = (arg17) => {
      if (!arg17 || !arg17.type || arg17.type === "none") return null;
      const object3 = {
        ...arg17,
      };
      return (
        (!object3.data || !Object.keys(object3.data).length) && delete object3.data,
        object3.type !== "navigate" && delete object3.target,
        delete object3.domain,
        delete object3.service,
        fn4(object3)
      );
    },
    fn4 = (arg18, arg19 = "") =>
      Array.isArray(arg18)
        ? arg18.map((arg20) => fn4(arg20))
        : arg18 && typeof arg18 == "object"
          ? Object.fromEntries(
              arg19 === "actions"
                ? Object.keys(arg18)
                    .sort()
                    .flatMap((arg21) => {
                      const value11 = fn3(arg18[arg21]);
                      return value11 ? [[arg21, value11]] : [];
                    })
                : Object.keys(arg18)
                    .sort()
                    .map((arg22) => [arg22, fn4(arg18[arg22], arg22)]),
            )
          : arg18;
  return JSON.stringify(fn4(arg16 || null));
}
export function recoveryStorageKey(arg23, arg24) {
  return "" + arg23 + arg24;
}
