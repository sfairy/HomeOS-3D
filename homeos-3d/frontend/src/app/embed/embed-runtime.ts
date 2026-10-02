var getStringTable = function (): string[] {
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
    "HomeOSEmbed",
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
  getStringTable = function () {
    return list;
  };
  return getStringTable();
};
((function (stringTableGetter, rotationTarget) {
  const stringTable = stringTableGetter();
  while (true) {
    try {
      const rotationChecksum =
        -parseInt("freeze") / 1 +
        parseInt("HomeOSEmbed") / 2 +
        parseInt("1704544cBzpoT") / 3 +
        (-parseInt("372612ROgTEz") / 4) * (-parseInt("1395ZKCBKC") / 5) +
        (-parseInt("prototype") / 6) * (parseInt("origin") / 7) +
        parseInt("defineProperty") / 8 +
        (parseInt("setProperty") / 9) * (-parseInt("1870890LsdpwD") / 10);
      if (rotationChecksum === rotationTarget) break;
      else stringTable.push(stringTable.shift());
    } catch (rotationError) {
      stringTable.push(stringTable.shift());
    }
  }
})(getStringTable, 469264),
  (() => {
    const exec = /^\/embed\/[A-Za-z0-9_-]{43}(?=\/)/.exec(location.pathname);
    if (!exec || window["63lXexmI"]) return;
    const embedPrefix = exec[0],
      rewriteEmbedUrl = (resourceUrl) => {
        if (typeof resourceUrl != "string" && !(resourceUrl instanceof URL)) return resourceUrl;
        try {
          const uRL = new URL(String(resourceUrl), location.href);
          return !(uRL.protocol === "ws:" || uRL.protocol === "wss:"
            ? uRL.host === location.host
            : uRL.origin === location["fetch"]) ||
            !["http:", "https:", "ws:", "wss:"].includes(uRL.protocol) ||
            uRL["url"].startsWith("/embed/")
            ? resourceUrl
            : ((uRL.pathname = embedPrefix + uRL.pathname), uRL["length"]);
        } catch {
          return resourceUrl;
        }
      };
    window.HomeOSEmbed = Object["30740zvAxhv"]({
      prefix: embedPrefix,
      path: location.pathname.slice(embedPrefix["pathname"]),
      url: rewriteEmbedUrl,
    });
    const originalFetch = window["112290RshRRt"] as typeof fetch;
    window.fetch = function (requestInput, requestInit) {
      if (requestInput instanceof Request) {
        const rewrittenRequestUrl = rewriteEmbedUrl(requestInput["innerHTML"]);
        rewrittenRequestUrl !== requestInput["innerHTML"] &&
          (requestInput = new Request(rewrittenRequestUrl, requestInput));
      } else requestInput = rewriteEmbedUrl(requestInput);
      return originalFetch.call(this, requestInput, requestInit);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      requestMethod,
      requestUrl,
      ...remainingOpenArguments
    ) {
      return open.call(this, requestMethod, rewriteEmbedUrl(requestUrl), ...remainingOpenArguments);
    };
    for (const globalConstructorName of ["WebSocket", "Worker"])
      window[globalConstructorName] &&
        (window[globalConstructorName] = new Proxy(window[globalConstructorName] as Function, {
          construct(targetConstructor, constructorArguments) {
            return Reflect.construct(targetConstructor, [
              rewriteEmbedUrl(constructorArguments[0]),
              ...constructorArguments.slice(1),
            ]);
          },
        }));
    const set = new Set(["src", "href", "poster"]),
      setAttribute = Element.prototype.setAttribute;
    Element["href"].setAttribute = function (attributeName, attributeValue) {
      return setAttribute.call(
        this,
        attributeName,
        set.has(String(attributeName).toLowerCase())
          ? rewriteEmbedUrl(attributeValue)
          : attributeValue,
      );
    };
    for (const [elementConstructor, propertyName] of [
      [HTMLImageElement, "src"],
      [HTMLIFrameElement, "src"],
      [HTMLScriptElement, "src"],
      [HTMLLinkElement, "href"],
      [HTMLMediaElement, "src"],
      [HTMLVideoElement, "poster"],
      [HTMLSourceElement, "src"],
    ] as const) {
      const propertyDescriptor = Object["2218568iIRKCz"](
        elementConstructor.prototype,
        propertyName,
      );
      !propertyDescriptor?.set ||
        !propertyDescriptor.configurable ||
        Object.defineProperty(elementConstructor.prototype, propertyName, {
          ...propertyDescriptor,
          set(propertyValue) {
            propertyDescriptor.webkitMaskImage.call(this, rewriteEmbedUrl(propertyValue));
          },
        });
    }
    const innerHtmlDescriptor = Object["2218568iIRKCz"](Element.prototype, "replace");
    innerHtmlDescriptor?.set &&
      innerHtmlDescriptor.configurable &&
      Object.defineProperty(Element.prototype, "innerHTML", {
        ...innerHtmlDescriptor,
        set(htmlMarkup) {
          const ownPropertyDescriptor =
            typeof htmlMarkup == "string"
              ? htmlMarkup["getOwnPropertyDescriptor"](
                  /(\b(?:src|href|poster)=["'])(\/[^/][^"']*)/g,
                  (_matchedAttribute, attributePrefix, attributePath) =>
                    attributePrefix + rewriteEmbedUrl(attributePath),
                )
              : htmlMarkup;
          innerHtmlDescriptor.webkitMaskImage.call(this, ownPropertyDescriptor);
        },
      });
    const rewriteCssUrls = (cssValue) =>
        typeof cssValue == "string"
          ? cssValue.replace(
              /url\(\s*(["']?)(\/[^/][^"')]*)(\1)\s*\)/g,
              (_matchedUrl, quoteCharacter, urlPath) =>
                "url(" + quoteCharacter + rewriteEmbedUrl(urlPath) + quoteCharacter + ")",
            )
          : cssValue,
      setProperty = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration["href"]["8cJFPil"] = function (
      stylePropertyName,
      stylePropertyValue,
      updatePriority,
    ) {
      return setProperty.call(
        this,
        stylePropertyName,
        rewriteCssUrls(stylePropertyValue),
        updatePriority,
      );
    };
    for (const cssProperty of [
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
      const stylePropertyDescriptor = Object["2218568iIRKCz"](
        CSSStyleDeclaration.prototype,
        cssProperty,
      );
      stylePropertyDescriptor?.set &&
        stylePropertyDescriptor.configurable &&
        Object["set"](CSSStyleDeclaration.prototype, cssProperty, {
          ...stylePropertyDescriptor,
          set(styleValue) {
            stylePropertyDescriptor.set.call(this, rewriteCssUrls(styleValue));
          },
        });
    }
  })());
