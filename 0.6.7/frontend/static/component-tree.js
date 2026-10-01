export function findComponentInItems(arg1, arg2) {
  for (const value1 of arg1 || []) {
    if (value1.id === arg2) return value1;
    const value2 = findComponentInItems(value1.children, arg2);
    if (value2) return value2;
  }
  return null;
}
export function findComponent(arg3, arg4) {
  if (!arg3 || !arg4) return null;
  const value3 = findComponentInItems(arg3.sharedComponents, arg4);
  if (value3)
    return {
      component: value3,
      scope: "shared",
    };
  for (const value4 of arg3.pages || []) {
    const value5 = findComponentInItems(value4.components, arg4);
    if (value5)
      return {
        component: value5,
        scope: "page",
        page: value4,
      };
  }
  return null;
}
export function findComponentLocation(arg5, arg6) {
  if (!arg5 || !arg6) return null;
  const fn1 = (arg7, arg8, arg9 = null, arg10 = false) => {
      for (let value7 = 0; value7 < (arg7 || []).length; value7 += 1) {
        const value8 = arg7[value7];
        if (value8.id === arg6)
          return {
            component: value8,
            collection: arg7,
            index: value7,
            scope: arg8,
            page: arg9,
            root: arg10,
          };
        const value9 = fn1(value8.children, arg8, arg9, false);
        if (value9) return value9;
      }
      return null;
    },
    value6 = fn1(arg5.sharedComponents, "shared", null, true);
  if (value6) return value6;
  for (const value10 of arg5.pages || []) {
    const value11 = fn1(value10.components, "page", value10, true);
    if (value11) return value11;
  }
  return null;
}
export function componentDirectLocation(arg11, arg12) {
  const value12 = findComponentLocation(arg11, arg12);
  return value12?.root ? value12 : null;
}
