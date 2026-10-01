export function boundEntityIds(arg1, arg2 = new Set(), arg3 = new Set()) {
  if (typeof arg1 == "string") /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(arg1) && arg2.add(arg1);
  else {
    if (arg1 && typeof arg1 == "object" && !arg3.has(arg1)) {
      arg3.add(arg1);
      for (const [value1, value2] of Object.entries(arg1))
        (boundEntityIds(value1, arg2, arg3), boundEntityIds(value2, arg2, arg3));
    }
  }
  return arg2;
}
export function createStateUpdatePlan(arg4, arg5) {
  if (!arg5 || typeof arg5 != "object" || Array.isArray(arg5)) return null;
  const set1 = new Set(Object.keys(arg5)),
    { lights: value4 = [], ...value3 } = arg4 || {},
    value5 = boundEntityIds(value4),
    value6 = boundEntityIds(value3);
  if ([...set1].some((arg6) => !value5.has(arg6) && !value6.has(arg6))) return null;
  const fn1 = (arg7) => [...arg7].some((arg8) => set1.has(arg8));
  return {
    changed: set1,
    lightOnlyIds: [...set1].filter((arg9) => value5.has(arg9) && !value6.has(arg9)),
    get lighting() {
      return fn1(value5);
    },
    get environment() {
      return fn1(value6);
    },
    affects(arg10) {
      const value7 = boundEntityIds(arg10);
      return !value7.size || fn1(value7);
    },
  };
}
export function lightBindingsForUpdate(arg11, arg12) {
  if (!arg12) return arg11;
  const fn2 = (arg13) => JSON.stringify([arg13.floorId, arg13.groupId]),
    set2 = new Set(arg11.filter((arg14) => arg12.affects(arg14)).map(fn2));
  return arg11.filter((arg15) => set2.has(fn2(arg15)));
}
