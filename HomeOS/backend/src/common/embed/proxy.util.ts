/**
 * 内嵌反代核心工具集
 *
 * 所属模块：backend/src/common/embed
 * 职责：为内嵌页（iframe）反代提供一站式工具函数，覆盖：
 *   - 目标 URL 安全校验（防 SSRF，仅允许局域网）
 *   - 反代前缀构造（HTTP / WebSocket）
 *   - 请求头改写（Referer / Origin / Cookie）
 *   - 响应头改写（Location 重定向 / Set-Cookie Path 收敛）
 *   - HTML / JS / CSS 内容改写（根相对路径 / 同源绝对地址 / base 前缀）
 *   - 运行时垫片注入（fetch / XHR / SSE / WS 拦截）
 * 关键依赖：
 *   - ../errors/api-error-messages#API_ERROR：错误码与中文文案
 *   - ../utils/business-exception#badRequest：抛出 400 业务异常
 *   - ../http-security/cookie-cors.util#isLanOrigin：局域网判定
 */
import { API_ERROR } from '../errors/api-error-messages';
import { badRequest } from '../utils/business-exception';
import { isLanOrigin } from '../http-security/cookie-cors.util';
import { escapeRegExp } from '../utils/regex.util';

/** 校验内嵌反代目标 URL（仅允许 http(s) 局域网地址，防 SSRF） */
export function validateEmbedTargetUrl(urlString: string): URL {
  const trimmed = urlString?.trim();
  if (!trimmed) {
    badRequest(API_ERROR.EMBED_URL_MISSING);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    badRequest(API_ERROR.EMBED_URL_INVALID);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    badRequest(API_ERROR.EMBED_URL_PROTOCOL);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    badRequest(API_ERROR.EMBED_URL_LOCALHOST);
  }
  const origin = `${parsed.protocol}//${parsed.host}`;
  if (!isLanOrigin(origin)) {
    badRequest(API_ERROR.EMBED_URL_LAN_ONLY);
  }
  return parsed;
}



/**
 * 内嵌目标与当前请求是否同一 origin（协议+主机+端口）。
 * 用于「本地 dist 伺服 /assets/*」短路：仅当反代目标与 HomeOS 访问入口完全一致时才启用，
 * 避免同 NAS IP 不同端口服务（如 Jellyfin :8096）的 /assets 被误替换为 HomeOS 前端包。
 */
export function isEmbedSameOriginAsRequest(
  embedBase: string,
  reqHost: string | undefined,
  reqSecure = false,
): boolean {
  try {
    const embedOrigin = new URL(embedBase).origin;
    const host = String(reqHost || '').trim();
    if (!host) return false;
    const protocol = reqSecure ? 'https:' : 'http:';
    const reqOrigin = host.includes('://') ? new URL(host).origin : new URL(`${protocol}//${host}`).origin;
    return embedOrigin === reqOrigin;
  } catch {
    return false;
  }
}

/** 是否为前端 dist 下的静态资源路径（/assets/...） */
export function isFrontendDistAssetPath(subPath: string): boolean {
  const p = (subPath || '/').split('?')[0].split('#')[0];
  return p.startsWith('/assets/');
}

/**
 * 拼接转发给上游的完整 URL：base + subPath + search。
 * 自动去除 base 末尾斜杠、补齐 subPath 开头斜杠，保证拼接结果路径合法。
 *
 * @param base    上游 origin（如 http://192.168.1.10:8096）
 * @param subPath 子路径，可能为空
 * @param search  查询串（含 ?），可为空
 * @returns 完整 URL
 */
export function buildEmbedUpstreamUrl(base: string, subPath: string, search: string): string {
  const cleanBase = base.replace(/\/$/, '');
  let path = subPath || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  return `${cleanBase}${path}${search || ''}`;
}

/**
 * 构造内嵌页 HTTP 反代前缀：`/api/v1/embed-proxy/<embedId>/`。
 * embedId 经 encodeURIComponent 编码，避免路径注入。
 *
 * @param embedId 内嵌配置 ID
 * @returns 反代前缀路径（带末尾斜杠）
 */
export function buildEmbedProxyPrefix(embedId: string): string {
  return `/api/v1/embed-proxy/${encodeURIComponent(embedId)}/`;
}

/**
 * 内嵌页 WebSocket 反代前缀。
 *
 * 刻意与 HTTP 反代前缀同根（仅去掉末尾斜杠）：浏览器按 RFC6265 path-match 回传 Cookie，
 * 只有 WS 握手路径落在内嵌站 Cookie 的 Path（`/api/v1/embed-proxy/<id>/...`）之下，
 * 登录后的实时通道才能带上会话 Cookie。WS 升级请求由 server 'upgrade' 事件按
 * `Upgrade` 头与该前缀识别，普通 HTTP 仍走 Express 控制器，二者互不干扰。
 */
function buildEmbedWsProxyPrefix(embedId: string): string {
  return `/api/v1/embed-proxy/${encodeURIComponent(embedId)}`;
}

/** 上游内嵌站的 origin（协议+主机），用于改写转发请求的 Origin/WS 握手 Origin */
export function getEmbedUpstreamOrigin(embedBase: string): string {
  try {
    return new URL(embedBase).origin;
  } catch {
    return embedBase;
  }
}

/**
 * 将转发给上游的 Referer 由「HomeOS 同源反代地址」还原为「内嵌站真实地址」。
 * 许多自托管应用按 Origin/Referer 做同源或 CSRF 校验，若原样透传 HomeOS 地址会拒绝登录。
 */
export function rewriteEmbedReferer(
  referer: string | undefined,
  embedBase: string,
  proxyPrefix: string,
): string {
  const upstreamOrigin = getEmbedUpstreamOrigin(embedBase);
  if (!referer) return `${upstreamOrigin}/`;
  const prefixNoSlash = proxyPrefix.replace(/\/$/, '');
  const idx = referer.indexOf(prefixNoSlash);
  if (idx >= 0) {
    const after = referer.slice(idx + prefixNoSlash.length);
    const suffix = after.startsWith('/') ? after : `/${after}`;
    return `${getEmbedUpstreamOrigin(embedBase)}${suffix}`;
  }
  return `${upstreamOrigin}/`;
}

/**
 * 改写上游响应的 Location 头：把内嵌站同源绝对地址改写为反代前缀下的相对路径。
 *
 * 处理三种情形：
 *   1. 同源绝对地址 → 改写为反代前缀下的相对路径；
 *   2. 跨域跳转 → 地址本身不动，但其查询串里仍可能含上游同源地址，尝试改写；
 *   3. 非法 URL → 仍尝试改写其中内嵌的同源绝对地址。
 *
 * @param location   原始 Location 头
 * @param embedBase  上游 origin
 * @param proxyPrefix 反代前缀
 * @returns 改写后的 Location 字符串
 */
export function rewriteEmbedLocation(
  location: string,
  embedBase: string,
  proxyPrefix: string,
): string {
  try {
    const base = new URL(embedBase + '/');
    const proxyRoot = proxyPrefix.replace(/\/$/, '');
    let loc: URL;
    try {
      loc = new URL(location, base);
    } catch {
      // 非法 URL：仍尝试改写其中内嵌的同源绝对地址（含查询串里的 redirect_uri 等）
      return rewriteEmbedSameOriginUrls(location, embedBase, proxyRoot);
    }
    if (loc.origin === base.origin) {
      const suffix = `${loc.pathname}${loc.search}${loc.hash}`;
      const pathPart = suffix.startsWith('/') ? suffix.slice(1) : suffix;
      // 查询串里常嵌有上游同源绝对地址（如 ?redirect_uri=http(s)://host/...，
      // 可能为明文或百分号编码），一并改写为同源反代路径，避免登录后跳回 HTTP 原站被拦截。
      return rewriteEmbedSameOriginUrls(`${proxyPrefix}${pathPart}`, embedBase, proxyRoot);
    }
    // 跨域跳转：地址本身不动，但其查询串里仍可能含上游同源地址，尝试改写
    return rewriteEmbedSameOriginUrls(location, embedBase, proxyRoot);
  } catch {
    return location;
  }
}

/**
 * 判定 Content-Type 是否为 HTML（含 XHTML）。
 * 用于决定是否需要执行 HTML 改写（注入 base、改写根相对 URL 等）。
 *
 * @param contentType Content-Type 头
 * @returns true 表示 HTML 内容
 */
export function isHtmlContentType(contentType: string | null | undefined): boolean {
  const ct = (contentType || '').toLowerCase();
  return ct.includes('text/html') || ct.includes('application/xhtml');
}

/**
 * 判定 Content-Type 是否需要内容改写：HTML / JS / CSS / JSON。
 * JSON 接口常携带内嵌站自身的绝对地址（应用据此在运行时拼出图片/资源 URL），
 * CSS 中的 url(/assets/...) 同为根相对资源，HTTPS 反代下须改写为同源反代路径。
 *
 * @param contentType Content-Type 头
 * @returns true 表示需要执行内容改写
 */
export function isEmbedRewriteableContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  if (isHtmlContentType(ct)) return true;
  // JSON 接口常携带内嵌站自身的绝对地址（应用据此在运行时拼出图片/资源 URL）。
  // CSS 中的 url(/assets/...) 同为根相对资源，HTTPS 反代下须改写为同源反代路径。
  // 一并改写为同源反代路径，避免 HTTPS 父页下出现混合内容/逃逸到 HomeOS 根路径。
  return (
    ct.includes('javascript') ||
    ct.includes('ecmascript') ||
    ct.includes('json') ||
    ct.includes('css')
  );
}

/** 静态资源文件扩展名：据此识别 JS/CSS 里根相对的「资源文件」引用并改写到反代前缀下 */
const EMBED_STATIC_ASSET_EXT =
  'js|mjs|cjs|css|json|wasm|map|woff2?|ttf|otf|eot|png|jpe?g|svg|gif|webp|avif|ico|mp3|mp4|webm|ogg';

/**
 * 改写 HTML 标签属性里的根相对 URL（`src`/`href`/`action` 等以单个 `/` 开头）。
 *
 * 路径型反代下，`<base>` 对根相对 URL 无效：浏览器会把 `/assets/x.js` 解析到
 * HomeOS 根而非反代前缀，最终被 SPA 回退成 index.html，触发模块脚本 MIME 报错。
 * 故须将这些属性显式重写到反代前缀下。须在注入 `<base>` 前对原始 HTML 执行，
 * 避免误伤后注入的 base href。
 */
function rewriteEmbedRootRelativeHtml(html: string, proxyRoot: string): string {
  let out = html.replace(
    /\b(href|src|action|formaction|poster|data-src|data-href)\s*=\s*(["'])(\/(?!\/)[^"']*)\2/gi,
    (m, attr: string, quote: string, val: string) =>
      val === proxyRoot || val.startsWith(`${proxyRoot}/`)
        ? m
        : `${attr}=${quote}${proxyRoot}${val}${quote}`,
  );
  // srcset：逗号分隔的「URL 尺寸」列表，逐项处理其根相对 URL
  out = out.replace(/\bsrcset\s*=\s*(["'])([^"']*)\1/gi, (_m, quote: string, val: string) => {
    const rewritten = val.replace(/(^|,\s*)\/(?!\/)/g, (_s, sep: string) => `${sep}${proxyRoot}/`);
    return `srcset=${quote}${rewritten}${quote}`;
  });
  return out;
}

/**
 * 改写 JS/CSS/HTML 中字符串字面量与 CSS url() 里「根相对的静态资源文件」引用。
 *
 * 按扩展名识别（与具体打包目录无关），覆盖任意 `/xxx/yyy.js|css|...` 形式，
 * 解决 SPA 模块 chunk 的绝对 import 逃逸；不命中无扩展名的 API/路由路径
 * （那些由注入的运行时垫片在 fetch/XHR 层处理），避免误改。
 */
function rewriteEmbedRootRelativeAssetPaths(content: string, proxyRoot: string): string {
  // 幂等：已位于反代前缀下的路径不再加前缀（HTML 属性改写后会与本函数叠加，需防双重前缀）
  const prefixed = (p: string) => `/${p}` === proxyRoot || `/${p}`.startsWith(`${proxyRoot}/`);
  let out = content;
  // 引号字符串字面量： "/x/y.js  '/x/y.css  `/x/y.woff2（含带引号的 CSS url("/x/y.png")）
  out = out.replace(
    new RegExp(`(["'\`])\\/(?!\\/)([^"'\`\\s?#]*?\\.(?:${EMBED_STATIC_ASSET_EXT}))`, 'gi'),
    (m, quote: string, p: string) => (prefixed(p) ? m : `${quote}${proxyRoot}/${p}`),
  );
  // 无引号 CSS： url(/x/y.png)
  out = out.replace(
    new RegExp(`(url\\(\\s*)\\/(?!\\/)([^)'"\\s?#]*?\\.(?:${EMBED_STATIC_ASSET_EXT}))`, 'gi'),
    (m, pre: string, p: string) => (prefixed(p) ? m : `${pre}${proxyRoot}/${p}`),
  );
  return out;
}

/**
 * 「挂载点重定位」：把基路径型 SPA（如 Vite `base:'/p/'` 构建的飞牛 fnOS 子应用 相册/影视）
 * 烤进包里的 base 前缀（`/p`）重写到反代前缀之下（`/api/v1/embed-proxy/<id>/p`）。
 *
 * 关键：这类应用把**客户端路由路径**以绝对形式烤进包里（如 `/p/`、`/p/search`、
 * `/p/setting`、`/p/folderview` 等）。路由是拿 `location.pathname` 去比对路由表，而非经
 * fetch 发出，故运行时垫片无法兜底。经反代后 iframe 地址为 `/api/v1/embed-proxy/<id>/p/...`，
 * 若不改写，路由表里的 `/p/...` 与 `location` 不匹配 → 路由无命中 → 白屏。
 * （API 路径如 `/p/api/v1/...` 由运行时垫片在 fetch/XHR 层兜底前缀，二者不冲突：垫片对已带
 * 反代前缀的地址幂等跳过。）
 *
 * 安全性：仅改写「字符串字面量开头、且作为完整路径段出现」的 base 前缀——即引号/反引号紧跟
 * `/p` 且其后为 `/`、引号/反引号、`?`、`#` 或模板 `${`。据此排除 `/person`、`/pending` 等
 * 同字符前缀但不同路径段者；也不会二次前缀已是 `/api/v1/embed-proxy/<id>/p/...` 的字面量
 * （其引号后紧跟的是 `/api` 而非 `/p`）。根路径（`/`）应用不处理。
 */
function rewriteEmbedAppBasePath(
  content: string,
  basePath: string | undefined,
  proxyRoot: string,
): string {
  if (!basePath) return content;
  const clean = basePath.split('?')[0].split('#')[0].replace(/\/+$/, ''); // /p
  if (!clean) return content;
  const esc = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 引号/反引号 + base +（后接路径分隔/字面量结束/查询/锚点/模板插值）
  const re = new RegExp(`(["'\`])${esc}(?=[/?#"'\`]|\\$\\{)`, 'g');
  return content.replace(re, (_m, q: string) => `${q}${proxyRoot}${clean}`);
}

/**
 * 注入到内嵌页的运行时垫片：在 fetch / XMLHttpRequest / EventSource / WebSocket
 * 层把「根相对绝对地址」(`/api/...`、`/sse/...`、`ws:///...`） 改写到同源反代前缀下。
 *
 * 静态改写只能处理 HTML/JS/CSS 文本里出现的字面量；而 SPA 运行时拼接的 API/SSE/WS
 * 地址（如 axios baseURL=`/api/v1`）无法静态识别，必须运行时拦截，否则会逃逸到 HomeOS
 * 根路径，导致内嵌站登录接口 404 / 会话失效。
 */
function buildEmbedRuntimeShimScript(prefix: string): string {
  const sq = '\u0027';
  const escSingleQuote = '\\' + sq;
  const P = prefix.replace(/\\/g, '\\\\').replace(/'/g, escSingleQuote);
  return `<script data-homeos-embed-shim>(function(){if(window.__homeos_embed_patched)return;window.__homeos_embed_patched=1;var P='${P}';function A(u){if(typeof u!=='string'||!u)return u;if(u.charAt(0)==='/'&&u.charAt(1)!=='/'&&u!==P&&u.lastIndexOf(P+'/',0)!==0)return P+u;try{if(/^https?:\\/\\//i.test(u)){var x=new URL(u);if(x.origin===location.origin&&x.pathname!==P&&x.pathname.lastIndexOf(P+'/',0)!==0)return P+x.pathname+x.search+x.hash;}}catch(e){}return u;}function csrf(){try{var m=document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);return m?decodeURIComponent(m[1]):'';}catch(e){return '';}}function withCsrf(o){var t=csrf();if(!t)return o;o=o&&typeof o==='object'?Object.assign({},o):{};var h=o.headers;if(typeof Headers!=='undefined'&&h instanceof Headers){if(!h.has('X-CSRF-Token')&&!h.has('x-csrf-token'))h.set('X-CSRF-Token',t);return o;}var n={};if(h&&typeof h==='object'&&!Array.isArray(h)){for(var k in h)n[k]=h[k];}if(!n['X-CSRF-Token']&&!n['x-csrf-token'])n['X-CSRF-Token']=t;o.headers=n;return o;}if(window.fetch){var F=window.fetch;window.fetch=function(i,o){try{if(typeof i==='string')i=A(i);else if(i&&typeof i.url==='string'){var n=A(i.url);if(n!==i.url)i=new Request(n,i);}}catch(e){}return F.call(this,i,withCsrf(o));};}try{if(navigator&&typeof navigator.sendBeacon==='function'){var SB=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){try{u=A(u);}catch(e){}return SB(u,d);};}}catch(e){}try{var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);try{if(typeof u==='string')a[1]=A(u);}catch(e){}return XO.apply(this,a);};var XS=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(){try{var t=csrf();if(t)this.setRequestHeader('X-CSRF-Token',t);}catch(e){}return XS.apply(this,arguments);};}catch(e){}if(window.EventSource){var ES=window.EventSource;var NE=function(u,c){return new ES(A(u),c);};NE.prototype=ES.prototype;try{NE.CONNECTING=ES.CONNECTING;NE.OPEN=ES.OPEN;NE.CLOSED=ES.CLOSED;}catch(e){}window.EventSource=NE;}var WS=window.WebSocket;function W(u){if(typeof u!=='string'||!u.length)return u;if(u.charAt(0)==='/'&&u.lastIndexOf(P,0)!==0){var h=location.protocol==='https:'?'wss:':'ws:';return h+'//'+location.host+P+u;}return u;}var NW=function(u,p){u=W(u);return p!==undefined?new WS(u,p):new WS(u);};NW.prototype=WS.prototype;NW.CONNECTING=WS.CONNECTING;NW.OPEN=WS.OPEN;NW.CLOSING=WS.CLOSING;NW.CLOSED=WS.CLOSED;window.WebSocket=NW;})();</script>`;
}

/** 将内嵌站 ws(s):// 绝对地址改写为同源反代路径 */
function rewriteEmbedWsUrls(
  content: string,
  embedBase: string,
  wsProxyPrefix: string,
): string {
  try {
    const base = new URL(embedBase + '/');
    const wsOrigin = `${base.protocol === 'https:' ? 'wss' : 'ws'}://${base.host}`;
    const escaped = wsOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return content.replace(
      new RegExp(`${escaped}([^"'\\s]*)`, 'gi'),
      (_, pathSuffix: string) => `${wsProxyPrefix}${pathSuffix || ''}`,
    );
  } catch {
    return content;
  }
}

/**
 * 将内嵌站的同源绝对 URL 改写为同源反代根路径：
 * - `http(s)://host[:port]` 带协议形式
 * - `http(s):\/\/host[:port]` JSON/JS 中转义斜杠形式（JSON 编码器常把 `/` 转义为 `\/`）
 * - `//host[:port]` 协议相对形式（负向后顾排除 `http://`、`ws://` 等带 scheme 的情形，避免误伤）
 */
function rewriteEmbedSameOriginUrls(content: string, embedBase: string, proxyRoot: string): string {
  try {
    const u = new URL(embedBase + '/');
    let out = content.replace(new RegExp(escapeRegExp(u.origin), 'gi'), proxyRoot);
    const escapedSlashOrigin = u.origin.replace(/\//g, '\\/');
    out = out.replace(new RegExp(escapeRegExp(escapedSlashOrigin), 'gi'), proxyRoot);
    // 百分号编码形式（如查询参数 redirect_uri=http%3A%2F%2Fhost%3Aport...）
    const encodedOrigin = encodeURIComponent(u.origin);
    out = out.replace(new RegExp(escapeRegExp(encodedOrigin), 'gi'), proxyRoot);
    out = out.replace(new RegExp(`(?<!:)//${escapeRegExp(u.host)}`, 'gi'), proxyRoot);
    return out;
  } catch {
    return content;
  }
}

/**
 * 计算当前文档在反代下的 <base> 地址。
 *
 * 浏览器解析相对 URL 时以「文档自身目录」为基准。内嵌站若被重定向到 `/home/`
 * 等子路径，其相对资源（如 `assets/x.css`）应相对该子目录解析。若一律把 base
 * 注入为反代根目录，子路径会被丢弃，导致请求落到上游不存在的路径并被 SPA
 * 回退成 index.html（text/html），进而触发严格 MIME 校验失败。
 */
function buildEmbedDocBaseHref(proxyPrefix: string, docSubPath: string | undefined): string {
  const root = proxyPrefix.endsWith('/') ? proxyPrefix : `${proxyPrefix}/`;
  let p = (docSubPath || '/').split('?')[0].split('#')[0];
  if (p.startsWith('/')) p = p.slice(1);
  const lastSlash = p.lastIndexOf('/');
  const dir = lastSlash >= 0 ? p.slice(0, lastSlash + 1) : '';
  return `${root}${dir}`;
}

/** 注入 base 并改写同源绝对 URL，便于 HTTPS 父页加载 HTTP 内嵌站 */
export function rewriteEmbedHtml(
  html: string,
  embedBase: string,
  proxyPrefix: string,
  embedId?: string,
  docSubPath?: string,
  basePath?: string,
): string {
  const wsProxyPrefix = embedId ? buildEmbedWsProxyPrefix(embedId) : '';
  const proxyRoot = proxyPrefix.replace(/\/$/, '');
  const baseHref = buildEmbedDocBaseHref(proxyPrefix, docSubPath);
  const baseTag = `<base href="${baseHref}">`;
  // 强制 Referer 带完整路径：让逃逸子资源的 Referer 兜底（据 embedId 转回反代）始终可用。
  const referrerMeta = '<meta name="referrer" content="unsafe-url">';
  // 运行时垫片须尽早执行（拦截 fetch/XHR/SSE/WS），故与 base 一起注入 head 顶部
  const wsShim = embedId ? buildEmbedRuntimeShimScript(proxyRoot) : '';
  const headInjection = `${baseTag}${referrerMeta}${wsShim}`;
  // 先在原始 HTML 上重写根相对属性 URL（须早于注入 <base>，避免误伤 base href），
  // 并移除上游自带的 referrer meta（否则可能覆盖我们的 unsafe-url 策略）
  let out = rewriteEmbedRootRelativeHtml(html, proxyRoot).replace(
    /<meta[^>]+name=["']referrer["'][^>]*>/gi,
    '',
  );
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>${headInjection}`);
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/<html([^>]*)>/i, `<html$1><head>${headInjection}</head>`);
  } else {
    out = headInjection + out;
  }
  // ws(s):// 须先改写（其同源地址含 //host，避免被同源 URL 改写截断）
  if (wsProxyPrefix) {
    out = rewriteEmbedWsUrls(out, embedBase, wsProxyPrefix);
  }
  out = rewriteEmbedSameOriginUrls(out, embedBase, proxyRoot);
  // 内联脚本/样式里的根相对资源目录（/assets/ 等）
  out = rewriteEmbedRootRelativeAssetPaths(out, proxyRoot);
  // 基路径型 SPA 的 base 字面量（路由 basename）重定位到反代前缀下
  out = rewriteEmbedAppBasePath(out, basePath, proxyRoot);
  return out;
}

/**
 * 改写静态资源（JS/CSS/JSON）内容：依次执行 ws 改写、同源 URL 改写、
 * 根相对资源目录改写、base 路径重定位。
 * 与 rewriteEmbedHtml 不同，不注入 base/runtime shim，仅做文本替换。
 *
 * @param content   原始资源内容
 * @param embedBase 上游 origin
 * @param embedId   内嵌配置 ID
 * @param basePath  可选的 SPA base 路径（如 /p）
 * @returns 改写后的内容
 */
export function rewriteEmbedAssetContent(
  content: string,
  embedBase: string,
  embedId: string,
  basePath?: string,
): string {
  const wsProxyPrefix = buildEmbedWsProxyPrefix(embedId);
  const proxyRoot = buildEmbedProxyPrefix(embedId).replace(/\/$/, '');
  // 先改写 ws(s):// 同源地址，再改写 http(s):// 与协议相对同源地址，最后根相对资源目录
  let out = rewriteEmbedWsUrls(content, embedBase, wsProxyPrefix);
  out = rewriteEmbedSameOriginUrls(out, embedBase, proxyRoot);
  out = rewriteEmbedRootRelativeAssetPaths(out, proxyRoot);
  // 基路径型 SPA 的 base 字面量（路由 basename）重定位到反代前缀下
  out = rewriteEmbedAppBasePath(out, basePath, proxyRoot);
  return out;
}

/**
 * 改写上游 Set-Cookie，使会话 Cookie 在同源反代下可正确写入并回传：
 * - 去掉 `Domain`：绑定到当前反代主机（上游 Domain 可能与本源不符而被浏览器拒绝）。
 * - 把 `Path` 收敛到反代前缀下：浏览器只在请求路径匹配 Path 时回传 Cookie；
 *   而内嵌站的所有请求都走 `/api/v1/embed-proxy/<id>/...`，故须将原 Path 前缀为反代挂载点，
 *   否则原 `Path=/xxx` 永远无法与代理子路径匹配，导致登录会话「写了却不回传」。
 * - 当 HomeOS 自身经 HTTP 访问（requestSecure=false）时：浏览器会丢弃带 `Secure` 的
 *   Cookie，且 `SameSite=None` 必须搭配 `Secure` 否则同样被丢弃。内嵌站（尤其 HTTPS 上游）
 *   常下发 `Secure; SameSite=None` 的会话 Cookie，若原样透传会导致 HTTP 下「登录写不进去」。
 *   因反代后 Cookie 已是同源第一方，这里剥离 `Secure` 并把 `SameSite=None` 降级为 `Lax`。
 */
export function rewriteEmbedSetCookie(
  cookie: string,
  proxyPrefix: string,
  requestSecure = true,
): string {
  const prefixNoSlash = proxyPrefix.replace(/\/$/, '');
  const parts = cookie
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  let hasPath = false;
  for (const part of parts) {
    const eq = part.indexOf('=');
    const key = (eq >= 0 ? part.slice(0, eq) : part).trim().toLowerCase();
    if (key === 'domain') continue;
    // 非安全（HTTP）请求下剥离 Secure，否则浏览器拒绝写入
    if (key === 'secure' && !requestSecure) continue;
    if (key === 'samesite' && !requestSecure) {
      const rawVal =
        eq >= 0
          ? part
              .slice(eq + 1)
              .trim()
              .toLowerCase()
          : '';
      // SameSite=None 需 Secure 配套；HTTP 下降级为 Lax（同源第一方足够）
      out.push(rawVal === 'none' ? 'SameSite=Lax' : part);
      continue;
    }
    if (key === 'path') {
      const rawVal = eq >= 0 ? part.slice(eq + 1).trim() : '/';
      const norm = rawVal.startsWith('/') ? rawVal : `/${rawVal}`;
      out.push(`Path=${prefixNoSlash}${norm}`);
      hasPath = true;
      continue;
    }
    out.push(part);
  }
  if (!hasPath) out.push(`Path=${prefixNoSlash}/`);
  return out.join('; ');
}

/** 转发上游响应时需剥离的响应头（CSP / referrer / 压缩相关，避免干扰浏览器解析） */
export const EMBED_PROXY_STRIP_RESPONSE_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  // 剥离上游 referrer 策略：否则 origin/no-referrer 会让逃逸子资源请求丢失 Referer 路径，
  // SPA 回退中间件的 Referer 兜底（据此识别内嵌页并转回反代）将失效。
  'referrer-policy',
  'transfer-encoding',
  'connection',
  // fetch 会自动解压上游响应；若把原始 content-encoding/length 透传给浏览器，
  // 会导致 ERR_CONTENT_DECODING_FAILED 或长度不符截断（HTML/JS 改写后长度还会变）。
  'content-encoding',
  'content-length',
]);

/** 转发给上游请求时需剔除的请求头（压缩协商 / 转发头 / HomeOS 注入头） */
export const EMBED_PROXY_SKIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  // 不转发客户端的 accept-encoding：否则 undici(fetch) 会关闭自动解压，
  // 返回仍被压缩的响应体，导致下游 res.send/pipe 后浏览器解码失败
  // （ERR_CONTENT_DECODING_FAILED）。剥离后由 undici 自行协商并解压为明文，
  // 再由本服务的 compression 中间件按需重新压缩。
  'accept-encoding',
  // 剥离 HomeOS（及其外层反代）注入的转发头：否则上游可能据 x-forwarded-host/proto
  // 把重定向、绝对链接、Cookie scheme 指回 HomeOS 主机，破坏内嵌站登录跳转。
  // 让上游看到一次「直连」请求，scheme/host 与其自身一致。
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-server',
  'forwarded',
  'x-real-ip',
]);
