
const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
};
const ESCAPE_PATTERN = /[&<>'"]/g;

export function esc(value: unknown): string {

  return String(value ?? '').replace(
    ESCAPE_PATTERN,
    (character) => ESCAPE_MAP[character] ?? character,
  );
}
