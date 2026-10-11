// src/utils/csv.js
// Minimal RFC 4180 CSV parser: quoted fields, "" escapes, commas and newlines
// inside quotes, CRLF or LF line endings. Returns header-keyed rows with the
// 1-based line number of each row, so validation errors can point at it.

export function parseCsv(text) {
  const records = [];
  let field = '';
  let record = [];
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const s = String(text).replace(/^﻿/, ''); // Excel adds a BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      record.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      record.push(field);
      records.push({ line: recordLine, cells: record });
      field = '';
      record = [];
      line++;
      recordLine = line;
    } else field += c;
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push({ line: recordLine, cells: record });
  }
  const nonEmpty = records.filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return { header: [], rows: [] };
  const header = nonEmpty[0].cells.map((h) => h.trim().toLowerCase());
  return {
    header,
    rows: nonEmpty.slice(1).map((r) => ({
      line: r.line,
      values: Object.fromEntries(header.map((h, i) => [h, (r.cells[i] ?? '').trim()])),
      extraCells: r.cells.length > header.length,
    })),
  };
}
