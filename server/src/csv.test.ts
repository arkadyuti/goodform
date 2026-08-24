import { describe, expect, it } from 'vitest';
import { cell } from './csv.js';

describe('CSV cell escaping', () => {
  it('neutralises formulas so an exported name cannot run in a spreadsheet', () => {
    // A custom food or habit is free text, and it ends up in a file the owner
    // opens in Excel. Without the leading apostrophe this executes.
    expect(cell('=HYPERLINK("http://example.com","Click")')).toBe(
      '"\'=HYPERLINK(""http://example.com"",""Click"")"',
    );
    expect(cell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(cell('+1-800-scam')).toBe("'+1-800-scam");
  });

  it('leaves numbers alone, including negative ones', () => {
    // -0.4 is a weight change. Quoting it would turn the column into text.
    expect(cell(-5)).toBe('-5');
    expect(cell(-0.4)).toBe('-0.4');
    expect(cell('-5')).toBe('-5');
    expect(cell(0)).toBe('0');
  });

  it('quotes by RFC 4180 and doubles inner quotes', () => {
    expect(cell('Beans, black')).toBe('"Beans, black"');
    expect(cell('Say "hi"')).toBe('"Say ""hi"""');
    expect(cell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('renders absent values as an empty field', () => {
    expect(cell(null)).toBe('');
    expect(cell(undefined)).toBe('');
    expect(cell('')).toBe('');
  });
});
