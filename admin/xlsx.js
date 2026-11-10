// Minimal .xlsx writer with no dependencies (ZIP "store" method). Cells are written as plain text or numbers, never formulas.
const enc = new TextEncoder(), te = s => enc.encode(s);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
export function zip(files) {
  const parts = [], central = []; let off = 0;
  const u16 = v => [v & 255, v >>> 8 & 255], u32 = v => [v & 255, v >>> 8 & 255, v >>> 16 & 255, v >>> 24 & 255];
  for (const [name, data] of files) {
    const nb = te(name), crc = crc32(data), head = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0x21, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), 0, 0]);
    parts.push(head, nb, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0x21, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), nb);
    off += head.length + nb.length + data.length;
  }
  const cs = central.reduce((s, p) => s + p.length, 0), end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}
const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const STYLE = { money: 2, int: 3, pct: 4 };
export const safeSheetName = (n, used = []) => { let b = String(n).replace(/[\\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet', x = b, i = 2; while (used.includes(x.toLowerCase())) x = b.slice(0, 28) + ' ' + i++; return x; };
/** sheets: [{ name, cols: [{label, fmt?: 'money'|'int'|'pct'|'text', width?}], rows: [[cell,...]], notes?: [string] }] */
export function buildXlsx(sheets) {
  const used = [], names = sheets.map(s => { const n = safeSheetName(s.name, used); used.push(n.toLowerCase()); return n; });
  const files = [['[Content_Types].xml', te(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)],
    ['_rels/.rels', te('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')],
    ['xl/workbook.xml', te(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${X(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`)],
    ['xl/_rels/workbook.xml.rels', te(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)],
    ['xl/styles.xml', te('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7A0A16"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')]];
  sheets.forEach((sh, si) => {
    const cell = (v, ci, ri, s) => { const r = colName(ci) + (ri + 1); if (v == null || v === '') return ''; if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${r}" s="${s}"><v>${v}</v></c>`; return `<c r="${r}" t="inlineStr"${s === 1 ? ' s="1"' : ''}><is><t xml:space="preserve">${X(v)}</t></is></c>`; };
    const notes = (sh.notes || []).map(String), off = notes.length ? notes.length + 1 : 0, hr = off;
    const rowsXml = [...notes.map((t, i) => `<row r="${i + 1}">${cell(t, 0, i, 0)}</row>`), `<row r="${hr + 1}">${sh.cols.map((c, ci) => cell(c.label, ci, hr, 1)).join('')}</row>`, ...sh.rows.map((row, ri) => `<row r="${hr + ri + 2}">${row.map((v, ci) => cell(v, ci, hr + 1 + ri, STYLE[(sh.cols[ci] || {}).fmt] || 0)).join('')}</row>`)].join('');
    files.push([`xl/worksheets/sheet${si + 1}.xml`, te(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${hr + 1}" topLeftCell="A${hr + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${sh.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || Math.max(12, Math.min(40, String(c.label).length + 4))}" customWidth="1"/>`).join('')}</cols><sheetData>${rowsXml}</sheetData></worksheet>`)]);
  });
  return zip(files);
}
