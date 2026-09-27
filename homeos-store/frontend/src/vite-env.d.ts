/// <reference types="vite/client" />

declare const $: any;

interface JQuery {
  qrcode?: (options: { width?: number; height?: number; text?: string }) => JQuery;
}

interface JQueryStatic {
  (element: Element | null): JQuery;
}

interface Window {
  jQuery: JQueryStatic;
}
