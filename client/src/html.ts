/**
 * Tiny HTML helpers, kept in their own module so ui/ primitives can use them
 * without importing ui.ts (which imports the primitives back).
 */

/** Escape user-controlled text before it goes into a template literal. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}

/** 0xRRGGBB → "#rrggbb". */
export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** Build a div with a class and (trusted) inner HTML. */
export function div(cls: string, html = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}
