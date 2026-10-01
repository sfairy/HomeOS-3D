function fn1() {
  const list = [
    "getOwnPropertyDescriptor",
    "replace",
    "innerHTML",
    "url",
    "pathname",
    "length",
    "href",
    "prototype",
    "372612ROgTEz",
    "8cJFPil",
    "setProperty",
    "1395ZKCBKC",
    "112290RshRRt",
    "fetch",
    "origin",
    "63lXexmI",
    "HABridgeEmbed",
    "1704544cBzpoT",
    "1870890LsdpwD",
    "30740zvAxhv",
    "freeze",
    "293487VYMLps",
    "webkitMaskImage",
    "set",
    "defineProperty",
    "2218568iIRKCz",
  ];
  fn1 = function () {
    return list;
  };
  return fn1();
}
((function (arg1, arg2) {
  const list2 = arg1();
  while (true) {
    try {
      const v1 =
        -parseInt("freeze") / 1 +
        parseInt("HABridgeEmbed") / 2 +
        parseInt("1704544cBzpoT") / 3 +
        (-parseInt("372612ROgTEz") / 4) * (-parseInt("1395ZKCBKC") / 5) +
        (-parseInt("prototype") / 6) * (parseInt("origin") / 7) +
        parseInt("defineProperty") / 8 +
        (parseInt("setProperty") / 9) * (-parseInt("1870890LsdpwD") / 10);
      if (v1 === arg2) break;
      else list2.push(list2.shift());
    } catch (v2) {
      list2.push(list2.shift());
    }
  }
})(fn1, 469264),
  (() => {
    const exec = /^\/embed\/[A-Za-z0-9_-]{43}(?=\/)/.exec(location.pathname);
    if (!exec || window["63lXexmI"]) return;
    const v3 = exec[0],
      v4 = (arg3) => {
        if (typeof arg3 != "string" && !(arg3 instanceof URL)) return arg3;
        try {
          const uRL = new URL(String(arg3), location.href);
          return !(uRL.protocol === "ws:" || uRL.protocol === "wss:"
            ? uRL.host === location.host
            : uRL.origin === location.fetch) ||
            !["http:", "https:", "ws:", "wss:"].includes(uRL.protocol) ||
            uRL.url.startsWith("/embed/")
            ? arg3
            : ((uRL.pathname = v3 + uRL.pathname), uRL.length);
        } catch {
          return arg3;
        }
      };
    window.HABridgeEmbed = Object["30740zvAxhv"]({
      prefix: v3,
      path: location.pathname.slice(v3.pathname),
      url: v4,
    });
    const v5 = window["112290RshRRt"];
    window.fetch = function (arg4, arg5) {
      if (arg4 instanceof Request) {
        const v6 = v4(arg4.innerHTML);
        v6 !== arg4.innerHTML && (arg4 = new Request(v6, arg4));
      } else arg4 = v4(arg4);
      return v5.call(this, arg4, arg5);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (arg6, arg7, ...v7) {
      return open.call(this, arg6, v4(arg7), ...v7);
    };
    for (const v8 of ["WebSocket", "Worker"])
      window[v8] &&
        (window[v8] = new Proxy(window[v8], {
          construct(arg8, arg9) {
            return Reflect.construct(arg8, [v4(arg9[0]), ...arg9.slice(1)]);
          },
        }));
    const set = new Set(["src", "href", "poster"]),
      setAttribute = Element.prototype.setAttribute;
    Element.href.setAttribute = function (arg10, arg11) {
      return setAttribute.call(
        this,
        arg10,
        set.has(String(arg10).toLowerCase()) ? v4(arg11) : arg11,
      );
    };
    for (const [v9, v10] of [
      [HTMLImageElement, "src"],
      [HTMLIFrameElement, "src"],
      [HTMLScriptElement, "src"],
      [HTMLLinkElement, "href"],
      [HTMLMediaElement, "src"],
      [HTMLVideoElement, "poster"],
      [HTMLSourceElement, "src"],
    ]) {
      const v11 = Object["2218568iIRKCz"](v9.prototype, v10);
      !v11?.set ||
        !v11.configurable ||
        Object.defineProperty(v9.prototype, v10, {
          ...v11,
          set(arg12) {
            v11.webkitMaskImage.call(this, v4(arg12));
          },
        });
    }
    const v12 = Object["2218568iIRKCz"](Element.prototype, "replace");
    v12?.set &&
      v12.configurable &&
      Object.defineProperty(Element.prototype, "innerHTML", {
        ...v12,
        set(arg13) {
          const ownPropertyDescriptor =
            typeof arg13 == "string"
              ? arg13.getOwnPropertyDescriptor(
                  /(\b(?:src|href|poster)=["'])(\/[^/][^"']*)/g,
                  (arg14, arg15, arg16) => arg15 + v4(arg16),
                )
              : arg13;
          v12.webkitMaskImage.call(this, ownPropertyDescriptor);
        },
      });
    const v13 = (arg17) =>
        typeof arg17 == "string"
          ? arg17.replace(
              /url\(\s*(["']?)(\/[^/][^"')]*)(\1)\s*\)/g,
              (arg18, arg19, arg20) => "url(" + arg19 + v4(arg20) + arg19 + ")",
            )
          : arg17,
      setProperty = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.href["8cJFPil"] = function (arg21, arg22, arg23) {
      return setProperty.call(this, arg21, v13(arg22), arg23);
    };
    for (const v14 of [
      "background",
      "backgroundImage",
      "mask",
      "maskImage",
      "webkitMask",
      "293487VYMLps",
      "borderImage",
      "borderImageSource",
      "listStyleImage",
      "cursor",
      "cssText",
    ]) {
      const v15 = Object["2218568iIRKCz"](CSSStyleDeclaration.prototype, v14);
      v15?.set &&
        v15.configurable &&
        Object.set(CSSStyleDeclaration.prototype, v14, {
          ...v15,
          set(arg24) {
            v15.set.call(this, v13(arg24));
          },
        });
    }
  })());
