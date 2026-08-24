/**
 * CSV formatting for the data export.
 *
 * Deliberately free of any database or environment import: this is string
 * handling, and keeping it separate means it can be tested without a running
 * Postgres or a populated `.env`.
 */

export type Cell = string | number | boolean | null | undefined | Date;

export function cell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Excel and Sheets treat a leading =, +, - or @ as the start of a formula, so
  // a custom food named `=HYPERLINK("http://…","Click")` would run on open
  // rather than read as a name. A leading apostrophe is the spreadsheet's own
  // "this is text" marker; it is not shown in the cell.
  //
  // Numbers are exempt: -0.4 is a weight change, not a formula, and quoting it
  // would turn a numeric column into text.
  const numeric = typeof value === 'number' || (text !== '' && Number.isFinite(Number(text)));
  if (!numeric && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  // Quote anything a spreadsheet would otherwise misread, and double any quote
  // inside it — the whole of RFC 4180 that matters in practice.
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csv(headers: string[], rows: Cell[][]): string {
  // A BOM so Excel opens UTF-8 names — Hindi, accents — without mangling them.
  return `﻿${[headers.join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n')}\r\n`;
}
