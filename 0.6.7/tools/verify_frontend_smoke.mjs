#!/usr/bin/env node
/**
 * The smoke test the rename gates cannot be: does a browser actually run these pages?
 *
 * Every other frontend gate is an equivalence check - byte equality, alpha equivalence,
 * string multisets, export sets.  A rename that is internally consistent satisfies all
 * of them by construction, which is exactly why gov/PLAN.md records a restore where
 * 'device is None or ...' was inverted and four gates stayed green.  This script is the
 * only one that loads the pages and looks at them.
 *
 * Checks, deliberately the cheapest three that would have caught a real breakage:
 *   /login      a password field exists
 *   /           the document body is non-empty (the app mounted something)
 *   /3d-studio  a canvas exists and is not 300x150 (the browser default, which is what
 *               a canvas reports when the code that sizes it never ran)
 * and on the Chromium backend, no uncaught exception during load.
 *
 * Two backends, because the useful thing on a developer machine is the browser that is
 * there:
 *   chromium-cdp       Chrome / Chromium / Brave / Edge, found on this machine or
 *                      named by HB_BROWSER.  Reported page errors come from
 *                      Runtime.exceptionThrown.
 *   safari-webdriver   safaridriver, opt in with HB_WEBDRIVER=safari because it needs
 *                      'Allow Remote Automation' enabled in Safari's Develop menu.
 *
 * When no backend is usable, or no server answers at the URL, this prints SKIP and
 * exits 0 - and says in one line what was probed - because a check that cannot run is
 * not a check that failed.  It is, however, also not a check that passed, so the caller
 * must not read a SKIP as coverage.
 *
 * Usage:
 *   node tools/verify_frontend_smoke.mjs [base-url] [--browser <path>] [--json]
 * Environment:
 *   HB_BROWSER      path to a Chromium-family binary
 *   HB_WEBDRIVER    'safari' to try safaridriver
 *   HB_SMOKE_URL    base url, when no argument is given (default http://127.0.0.1:8791)
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const DEFAULT_URL = process.env.HB_SMOKE_URL || 'http://127.0.0.1:8791';
const PAGES = [
  { route: '/login', name: 'login', check: "!!document.querySelector('input[type=password]')", describe: 'has a password field' },
  { route: '/', name: 'dashboard', check: 'document.body && document.body.children.length > 0', describe: 'mounted a non-empty body' },
  {
    route: '/3d-studio',
    name: '3d-studio',
    check: "(function(){var c=document.querySelector('canvas');return c?{exists:true,w:c.width,h:c.height}:{exists:false};})()",
    describe: 'sized a canvas away from the 300x150 default',
  },
];

const CHROMIUM_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

function findChromium() {
  if (process.env.HB_BROWSER) {
    return fs.existsSync(process.env.HB_BROWSER) ? process.env.HB_BROWSER : null;
  }
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverAnswers(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.status > 0) return true;
    } catch (error) {
      await delay(200);
    }
  }
  return false;
}

/** Minimal CDP client over the WebSocket global (Node 22+). */
class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.listeners = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        if (entry) {
          this.pending.delete(message.id);
          if (message.error) entry.reject(new Error(message.error.message));
          else entry.resolve(message.result);
        }
        return;
      }
      this.events.push(message);
      for (const listener of this.listeners) listener(message);
    });
  }

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP websocket failed to open')), { once: true });
    });
    return new CdpSession(socket);
  }

  send(method, params) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  once(method, timeoutMs) {
    return new Promise((resolve) => {
      const listener = (message) => {
        if (message.method === method) {
          this.listeners = this.listeners.filter((l) => l !== listener);
          resolve(message.params);
        }
      };
      this.listeners.push(listener);
      setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== listener);
        resolve(null);
      }, timeoutMs);
    });
  }

  pageErrors() {
    return this.events
      .filter((event) => event.method === 'Runtime.exceptionThrown')
      .map((event) => {
        const details = event.params.exceptionDetails || {};
        return (details.exception && (details.exception.description || details.exception.value)) || details.text || 'unknown exception';
      });
  }

  close() {
    try {
      this.socket.close();
    } catch (error) {
      /* already gone */
    }
  }
}

async function withChromium(binary, baseUrl, report) {
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-smoke-'));
  const child = spawn(
    binary,
    [
      '--headless=new',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--user-data-dir=' + profile,
      '--remote-debugging-port=' + port,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    const versionUrl = 'http://127.0.0.1:' + port + '/json/version';
    if (!(await serverAnswers(versionUrl, 20000))) {
      report.skip = 'chromium did not open a DevTools endpoint: ' + stderr.split('\n').slice(-3).join(' ').trim();
      return;
    }
    for (const page of PAGES) {
      const target = await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' });
      const info = await target.json();
      const session = await CdpSession.connect(info.webSocketDebuggerUrl);
      try {
        await session.send('Page.enable');
        await session.send('Runtime.enable');
        const loaded = session.once('Page.loadEventFired', 30000);
        await session.send('Page.navigate', { url: new URL(page.route, baseUrl).toString() });
        await loaded;
        await delay(500);
        const result = await session.send('Runtime.evaluate', { expression: page.check, returnByValue: true });
        const value = result.result && result.result.value;
        const errors = session.pageErrors();
        report.pages.push({ page, value, errors });
      } finally {
        session.close();
        await fetch('http://127.0.0.1:' + port + '/json/close/' + info.id).catch(() => {});
      }
    }
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

class WebDriverSession {
  constructor(base, id) {
    this.base = base;
    this.id = id;
  }

  async command(method, suffix, body) {
    const response = await fetch(this.base + '/session/' + this.id + suffix, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    if (payload && payload.value && payload.value.error) throw new Error(payload.value.error + ': ' + payload.value.message);
    return payload ? payload.value : undefined;
  }
}

async function withWebDriver(baseUrl, report) {
  const port = await freePort();
  const child = spawn('safaridriver', ['-p', String(port)], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const base = 'http://127.0.0.1:' + port;
  try {
    if (!(await serverAnswers(base + '/status', 15000))) {
      report.skip = 'safaridriver did not start: ' + stderr.split('\n')[0].trim();
      return;
    }
    const created = await fetch(base + '/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capabilities: { alwaysMatch: { browserName: 'safari' } } }),
    });
    const payload = await created.json();
    if (!payload.value || !payload.value.sessionId) {
      report.skip = 'safaridriver refused a session (Allow Remote Automation is off?): ' + JSON.stringify(payload.value || payload).slice(0, 200);
      return;
    }
    const session = new WebDriverSession(base, payload.value.sessionId);
    try {
      for (const page of PAGES) {
        await session.command('POST', '/url', { url: new URL(page.route, baseUrl).toString() });
        await delay(800);
        const value = await session.command('POST', '/execute/sync', { script: page.check, args: [] });
        report.pages.push({ page, value, errors: [], note: 'page errors are not observable through safaridriver' });
      }
    } finally {
      await session.command('DELETE', '').catch(() => {});
    }
  } catch (error) {
    report.skip = 'safaridriver session failed: ' + error.message;
  } finally {
    child.kill('SIGKILL');
  }
}

function evaluatePage(entry) {
  const { page, value } = entry;
  if (page.name === '3d-studio') {
    if (!value || value.exists !== true) return 'no canvas element on the page';
    if (Number(value.w) === 300 && Number(value.h) === 150) return 'the canvas is still the 300x150 default, so nothing sized it';
    return 'canvas ' + value.w + 'x' + value.h;
  }
  if (value !== true) return 'the check returned ' + JSON.stringify(value);
  return page.describe;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const browserFlag = args.indexOf('--browser');
  const positional = args.filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1] === '--browser'));
  const baseUrl = positional[0] || DEFAULT_URL;

  const report = { url: baseUrl, backend: null, skip: null, pages: [], probed: {} };
  const chromium = browserFlag === -1 ? findChromium() : fs.existsSync(args[browserFlag + 1]) ? args[browserFlag + 1] : null;
  report.probed = { HB_BROWSER: process.env.HB_BROWSER || null, chromium, HB_WEBDRIVER: process.env.HB_WEBDRIVER || null };

  if (!(await serverAnswers(baseUrl, 3000))) {
    report.skip = 'no server answered at ' + baseUrl + ' (start the app, or set HB_SMOKE_URL)';
  } else if (chromium) {
    report.backend = 'chromium-cdp';
    await withChromium(chromium, baseUrl, report);
  } else if (process.env.HB_WEBDRIVER === 'safari') {
    report.backend = 'safari-webdriver';
    await withWebDriver(baseUrl, report);
  } else {
    report.skip =
      'no Chromium-family browser found (probed: ' + CHROMIUM_CANDIDATES.join(', ') +
      '); set HB_BROWSER, or HB_WEBDRIVER=safari to try Safari';
  }

  const failures = [];
  if (report.skip === null) {
    for (const entry of report.pages) {
      const verdict = evaluatePage(entry);
      entry.verdict = verdict;
      if (entry.errors && entry.errors.length > 0) {
        failures.push(entry.page.name + ': threw ' + entry.errors[0].split('\n')[0]);
      }
      if (entry.page.name === '3d-studio') {
        if (entry.value && entry.value.exists === true && !(Number(entry.value.w) === 300 && Number(entry.value.h) === 150)) {
          /* ok */
        } else {
          failures.push(entry.page.name + ': ' + verdict);
        }
      } else if (entry.value !== true) {
        failures.push(entry.page.name + ': ' + verdict);
      }
    }
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.skip !== null) {
    console.log('# SKIP ' + report.skip);
    console.log('# SKIP nothing was verified: a skipped smoke test is not evidence that the pages work');
  } else {
    console.log('# url=' + baseUrl + ' backend=' + report.backend + ' pages=' + report.pages.length);
    for (const entry of report.pages) {
      console.log((failures.some((f) => f.startsWith(entry.page.name + ':')) ? 'FAIL ' : 'ok   ') + entry.page.name + ': ' + entry.verdict);
      if (entry.note) console.log('     note: ' + entry.note);
    }
    console.log(failures.length === 0 ? 'PASS the pages load and run' : 'FAIL ' + failures.join('; '));
  }
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main();
