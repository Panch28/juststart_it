/**
 * Generates small but *real* placeholder files for the seeded demo documents.
 *
 * The document library must never contain dead download links, so every seeded
 * `documents` row gets a genuine file on disk with the correct extension and a
 * matching checksum. The formats are deliberately minimal but valid:
 *
 *   PDF   – a one-page PDF 1.4 document
 *   DOCX  – an OOXML wordprocessing package (stored ZIP entries)
 *   XLSX  – an OOXML spreadsheet package (stored ZIP entries)
 *
 * Each file is padded to the size recorded in the seed data, so the sizes shown
 * in the UI match the bytes on disk and the checksum is a real SHA-256 of those
 * bytes. Padding is legal in all three formats (PDF stream whitespace, and an
 * extra plain-text package part in the OOXML archives).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const NOTICE =
  'Northgate University - sample document. This file contains fictional demonstration data.';

/* ------------------------------------------------------------------ CRC-32 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

/* --------------------------------------------------------------- ZIP writer */

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Builds a valid ZIP archive using stored (uncompressed) entries. */
function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x0021, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    const localHeader = Buffer.concat([local, name]);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0x0021, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset

    locals.push(localHeader, data);
    centrals.push(Buffer.concat([central, name]));
    offset += localHeader.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuf, eocd]);
}

/** ASCII padding of an exact byte length. */
function padding(bytes: number): string {
  if (bytes <= 0) return '';
  const line = 'Northgate University sample appendix. ';
  const body = line.repeat(Math.ceil(bytes / line.length)).slice(0, bytes);
  return body;
}

/**
 * Adds an explanatory appendix part so the archive reaches `targetSize`.
 * The appendix makes the file bigger without breaking the OOXML package.
 */
function zipToSize(entries: ZipEntry[], padName: string, targetSize: number): Buffer {
  const base = buildZip(entries);
  if (base.length >= targetSize) return base;

  const nameLength = Buffer.byteLength(padName, 'utf8');
  const overhead = 30 + nameLength + 46 + nameLength;
  const padBytes = targetSize - base.length - overhead;
  if (padBytes <= 0) return base;

  return buildZip([...entries, { name: padName, data: Buffer.from(padding(padBytes), 'ascii') }]);
}

/* ----------------------------------------------------------------- OOXML */

function docxEntries(title: string): ZipEntry[] {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
        'utf8',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
        'utf8',
      ),
    },
    {
      name: 'word/document.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(title)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${esc(NOTICE)}</w:t></w:r></w:p>
<w:p><w:r><w:t>Generated by the Northgate University demo seeder.</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr>
</w:body>
</w:document>`,
        'utf8',
      ),
    },
  ];
}

function xlsxEntries(title: string): ZipEntry[] {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cell = (ref: string, value: string) =>
    `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
  return [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
        'utf8',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
        'utf8',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
        'utf8',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
        'utf8',
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1">${cell('A1', title)}</row>
<row r="2">${cell('A2', 'Item')}${cell('B2', 'Amount')}</row>
<row r="3">${cell('A3', 'Sample line item')}${cell('B3', '0.00')}</row>
<row r="5">${cell('A5', NOTICE)}</row>
</sheetData>
</worksheet>`,
        'utf8',
      ),
    },
  ];
}

/* ------------------------------------------------------------------- PDF */

function pdf(title: string, targetSize: number): Buffer {
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?');

  const lines = [
    'Northgate University',
    'Research, Innovation, IPR and Startup Management System',
    '',
    title,
    '',
    NOTICE,
    '',
    'This placeholder exists so the demo document library has working downloads.',
  ];

  const render = (pad: number): Buffer => {
    const text = lines.map((line) => `(${esc(line)}) Tj T*`).join('\n');
    // Trailing spaces inside the content stream are legal whitespace.
    const content = `BT\n/F1 15 Tf\n14 TL\n64 780 Td\n${text}\n${' '.repeat(pad)}\nET\n`;

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Title (${esc(title)}) /Producer (Northgate University demo seeder) >>`,
    ];

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(out.length);
      out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    // Every character is ASCII, so string length equals byte length.
    return Buffer.from(out, 'latin1');
  };

  let file = render(0);
  if (file.length < targetSize) {
    let pad = targetSize - file.length;
    // Padding changes the /Length digits, so converge over a few passes.
    for (let pass = 0; pass < 5; pass++) {
      file = render(pad);
      const delta = targetSize - file.length;
      if (delta === 0) break;
      pad += delta;
      if (pad < 0) {
        pad = 0;
        break;
      }
    }
  }
  return file;
}

/* --------------------------------------------------------------- public API */

const BUILDERS: Record<string, (title: string, targetSize: number) => Buffer> = {
  PDF: pdf,
  DOCX: (title, targetSize) => zipToSize(docxEntries(title), 'docProps/appendix.txt', targetSize),
  XLSX: (title, targetSize) => zipToSize(xlsxEntries(title), 'docProps/appendix.txt', targetSize),
};

export interface SampleDocument {
  /** Storage path recorded in the database, e.g. `seed/rp-1001-project-proposal`. */
  storagePath: string;
  /** Display name, used as the document title inside the generated file. */
  title: string;
  /** Declared file type: PDF, DOCX or XLSX. */
  fileType: string;
  /** Desired byte size; the generated file is padded to approximately this size. */
  targetSize: number;
}

/**
 * Writes a real file for a seeded document (skipping if it already exists) and
 * reports the actual on-disk size and SHA-256 checksum.
 */
export function writeSampleDocument(uploadDir: string, doc: SampleDocument): { size: number; checksum: string } {
  mkdirSync(uploadDir, { recursive: true });

  // The download route resolves files with basename(), so the `seed/` prefix is
  // not part of the on-disk path.
  const file = join(uploadDir, basename(doc.storagePath));

  let bytes: Buffer;
  if (existsSync(file)) {
    bytes = readFileSync(file);
  } else {
    const build = BUILDERS[doc.fileType.toUpperCase()];
    bytes = build
      ? build(doc.title, doc.targetSize)
      : Buffer.from(`${doc.title}\n\n${NOTICE}\n`, 'utf8');
    writeFileSync(file, bytes);
  }

  return {
    size: bytes.length,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  };
}
