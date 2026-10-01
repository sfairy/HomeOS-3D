const M = 60000,
  h = 30000,
  R = 30000;
export function createAccessMonitor({
  requestGrant: arg1,
  now: arg2 = () => performance.now(),
  setTimer: arg3 = setTimeout,
  clearTimer: arg4 = clearTimeout,
}) {
  const set1 = new Set();
  let value1 = 0,
    value2,
    value3;
  const fn1 = () => ({
    allowed: false,
    status: "checking",
    message: "正在验证 3D 交互授权…",
  });
  let value4 = fn1(),
    value5 = false;
  const fn2 = (arg5) => {
    value4 = arg5;
    for (const value6 of set1) value6(value4);
  };
  function fn3() {
    ((value1 += 1), arg4(value2), arg4(value3));
  }
  async function fn4() {
    if (!set1.size || value5) return;
    const value7 = ++value1,
      value8 = arg2();
    try {
      const value9 = await arg1();
      if (value7 !== value1 || !set1.size || value5) return;
      const value10 = Math.min(60000, Number(value9?.validForSeconds) * 1000);
      if (value9?.allowed !== true || !Number.isFinite(value10) || value10 <= 0)
        throw Object.assign(new Error("invalid grant"), {
          status: 403,
        });
      const value11 = value10 - (arg2() - value8);
      if (value11 <= 0) throw new Error("grant response arrived too late");
      (arg4(value3),
        (value3 = arg3(() => {
          fn2({
            allowed: false,
            status: "checking",
            message: "正在重新验证 3D 交互授权…",
          });
        }, value11)),
        fn2({
          allowed: true,
          status: "allowed",
          message: "",
          deadline: arg2() + value11,
        }),
        (value2 = arg3(fn4, Math.min(30000, Math.max(100, value11 / 2)))));
    } catch (error1) {
      if (value7 !== value1 || !set1.size || value5) return;
      (arg4(value3),
        fn2(
          error1?.status === 403
            ? {
                allowed: false,
                status: "denied",
                message: "3D 交互授权不可用，请在授权信息中查看。",
              }
            : {
                allowed: false,
                status: "unavailable",
                message:
                  error1?.status === 401
                    ? "登录状态已失效，请重新登录。"
                    : "连接暂时中断，正在重新验证…",
              },
        ),
        (value2 = arg3(fn4, 30000)));
    }
  }
  return {
    subscribe(arg6) {
      return (
        set1.add(arg6),
        arg6(value4),
        set1.size === 1 && fn4(),
        () => {
          (set1.delete(arg6), set1.size || (fn3(), (value4 = fn1())));
        }
      );
    },
    suspend() {
      ((value5 = true),
        fn3(),
        fn2({
          allowed: false,
          status: "suspended",
          message: "3D 交互已暂停，返回页面后重新验证授权。",
        }));
    },
    resume() {
      ((value5 = false), fn3(), fn2(fn1()), fn4());
    },
  };
}
