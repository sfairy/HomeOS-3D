/**
 * Name buckets shared by the semantic-renaming tooling.
 *
 * Three tools need to answer "is this identifier mechanical residue, a short
 * leftover, or meaningful?" - `report_frontend_names.mjs` (progress + gate),
 * `apply_frontend_renames.mjs` (refuse to rename meaningful names) and
 * `plan_frontend_rename_ranges.mjs` (balance ranges by residue).  They used to
 * carry three hand-copied regexes, and the copies drifted: the whitelist below
 * was 15 prefixes while the pass that produced the names can emit many more.
 *
 * ## Why the prefix list is a whitelist and not a shape rule
 *
 * `rename_frontend_locals.mjs` derives a role prefix with
 * `toCamelCase(callee.name)`, so `new WeakMap()` became `weakMap1` and
 * `new IntersectionObserver()` became `intersectionObserver1`: the prefix set
 * is open ended.  The obvious fix - treat every `<lowercase word><digits>` as
 * residue - is wrong, because real code contains meaningful names of that exact
 * shape:
 *
 *   - `sha256`    an *exported* hash function, i.e. frozen public API;
 *   - `alignTo16` a helper whose `16` is part of its meaning
 *                 (`Math.max(16, Math.ceil(size / 16) * 16)`).
 *
 * Shape cannot separate `date1` (residue from `new Date`) from `alignTo16`, so
 * the classifier stays an explicit list of prefixes the pass can emit.  The list
 * is complete *by measurement*, not by guess: the pass has already run over the
 * whole frontend, so enumerating its output enumerates its vocabulary.
 *
 * ## Re-derivation for 0.6.7 (2026-10-01)
 *
 * The 0.6.6 derivation found 25 prefixes and this file shipped with them.  Run
 * against the 0.6.7 tree the same measurement finds ~50 more, carrying roughly
 * 10,900 bindings - more residue than every batch renamed so far combined.  The
 * big one is `v` (9,698 bindings, `v10` ... `v1452`, all inside the four
 * machine-minified giants), so the under-report was not a rounding error: the
 * gate was calling four files with ~10k obfuscated bindings "clean", and
 * `apply_frontend_renames.mjs` was refusing to touch a single one of them.
 *
 * Two changes came out of that measurement.
 *
 * 1. The word prefixes below join ROLE_PREFIXES.  All are `toCamelCase` output
 *    (`Math.max` -> `max3`, `performance.now` -> `now10`,
 *    `getBoundingClientRect` -> `boundingClientRect10`).
 *
 * 2. Group 2 is now also matched by a *narrow* shape rule, MECHANICAL_SHORT_
 *    PREFIX_RE: a one- or two-character prefix followed by *two or more*
 *    digits.  The pass names its counter-only bindings after the callee's short
 *    name (`v10`, `w7`, `f02`, `Ie10`, `_10`), and enumerating every
 *    one- and two-character prefix it can emit is the same open-ended problem
 *    the whitelist exists to avoid.  The rule is safe by construction against
 *    every false positive this file documents:
 *
 *      - the prefix is at most two characters, so `sha256` (`sha`),
 *        `base64` (`base`), `alignTo16` (`alignTo`), `temp1` (`temp`),
 *        `word15` (`word`) can never match - their digits are not reachable
 *        after consuming at most two characters;
 *      - at least two digits are required, so THREE's `uv2`, `mat4`, `vec3`
 *        and friends stay semantic while `v10` is residue.
 *
 * If a future run of the pass introduces new *word* prefixes, re-derive the
 * list the same way instead of widening the shape rule.
 */

/**
 * Role prefixes emitted by `rename_frontend_locals.mjs`.
 *
 * Group 1 is the fixed vocabulary derived from the declaration shape
 * (function/list/object/string/...).  Group 2 is the `toCamelCase(callee.name)`
 * output, observed across `frontend/**` and sorted by frequency.
 */
export const ROLE_PREFIXES = [
  // 1. derived from the declaration shape by `roleForBinding`
  'value',
  'fn',
  'arg',
  'error',
  'element',
  'object',
  'text',
  'map',
  'set',
  'list',
  'keys',
  'values',
  'entries',
  'ClassName',
  // 2. derived from a callee or constructor name by `toCamelCase`
  'weakMap', // new WeakMap()
  'uint8Array', // new Uint8Array()
  'resizeObserver', // new ResizeObserver()
  'float32Array', // new Float32Array()
  'abortController', // new AbortController()
  'uRLSearchParams', // new URLSearchParams()  (see note below)
  'date', // new Date()
  'image', // new Image()
  'uRL', // new URL()
  'dataView', // new DataView()
  'uint32Array', // new Uint32Array()
  'hc', // short callee name
  'promise', // Promise.resolve()
  'roundedBoxGeometry', // new RoundedBoxGeometry()
  'weakSet', // new WeakSet()
  'formData', // new FormData()
  'uint8ClampedArray', // new Uint8ClampedArray()
  'int32Array', // new Int32Array()
  'orbitControls', // new OrbitControls()
  'blob', // new Blob()
  'float64Array', // new Float64Array()
  'option', // new Option()
  'webSocket', // new WebSocket()
  // 3. 0.6.7 re-derivation - `toCamelCase(callee.name)` output the 0.6.6 pass
  //    had not yet produced.  Counts are from the 2026-10-01 measurement over
  //    `frontend/**` (vendor excluded).
  'num', // numeric locals, 435
  'options', // 416
  'max', // Math.max(), 415
  'closest', // Element.closest(), 143
  'selector', // 109
  'min', // Math.min(), 89
  'filter', // Array.prototype.filter(), 84
  'vector', // 48
  'boundingClientRect', // getBoundingClientRect(), 46
  'includes', // 20
  'context', // 19
  'target', // 18
  'atan', // Math.atan(), 10
  'trim', // 8
  'index', // 8
  'material', // 5
  'stringify', // JSON.stringify(), 4
  'now', // performance.now(), 2
  'localeLowerCase', // 2
  'setTimeout', // 1
  'deviceProfile', // 1
];

// Note the `uRL` / `uRLSearchParams` casing: `toCamelCase` lowercases only the
// first character, so `URL` became `uRL`.  Those names are ugly, but they are
// the pass's *output* and are exactly what the renaming batches are here to
// replace - which is why they must be classified as residue, not as semantic.

/**
 * `<role><counter>`, e.g. `value1234`, `weakMap1`.
 *
 * The counter is `\d+`, not `\d{2,}`, because the pass starts at 1: `date1` is
 * residue and so is `date12`.
 */
export const MECHANICAL_RE = new RegExp(`^(?:${ROLE_PREFIXES.join('|')})\\d+$`);

/**
 * A one- or two-character prefix plus *two or more* digits: `v10`, `f02`,
 * `Ie10`, `_10`, `$e10`.
 *
 * These are the pass's counter-only bindings, named after a callee whose own
 * name was already one or two characters.  The prefix set is open ended for the
 * same reason group 2 is, so this is a shape rule - but a deliberately narrow
 * one.  Consuming at most two characters before the digits is what keeps
 * `sha256`, `base64`, `alignTo16`, `temp1` and `word15` out (see the file
 * header), and requiring two digits keeps THREE's `uv2` / `mat4` / `vec3` out.
 * The self-test pins both directions.
 */
export const MECHANICAL_SHORT_PREFIX_RE = /^[A-Za-z_$][A-Za-z0-9_$]?\d{2,}$/;

/** One- and two-character bindings, the other thing the passes left behind. */
export const SHORT_RE = /^[A-Za-z_$][A-Za-z0-9_$]?$/;

/**
 * Classify a binding name.
 *
 * @param {string} name
 * @returns {'mechanical' | 'short' | 'semantic'}
 */
export function classifyName(name) {
  if (MECHANICAL_RE.test(name)) return 'mechanical';
  if (MECHANICAL_SHORT_PREFIX_RE.test(name)) return 'mechanical';
  if (SHORT_RE.test(name)) return 'short';
  return 'semantic';
}
