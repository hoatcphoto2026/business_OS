/**
 * Generic exporters for compliance reports/evidence.
 * CSV + SpreadsheetML (Excel) + a minimal, valid PDF 1.4 document.
 */
export type ExportRow = Record<string, unknown>;

function cell(row: ExportRow, key: string): string {
  const value = row[key];
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(columns: string[], rows: ExportRow[]): string {
  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((key) => csvEscape(cell(row, key))).join(','));
  return [header, ...lines].join('\n');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function toExcelXml(
  columns: string[],
  rows: ExportRow[],
  sheet = 'Compliance',
): string {
  const header = `<Row>${columns
    .map((key) => `<Cell><Data ss:Type="String">${escapeXml(key)}</Data></Cell>`)
    .join('')}</Row>`;
  const body = rows
    .map((row) => {
      const cells = columns
        .map((key) => `<Cell><Data ss:Type="String">${escapeXml(cell(row, key))}</Data></Cell>`)
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${escapeXml(sheet)}">
<Table>${header}${body}</Table>
</Worksheet>
</Workbook>`;
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function toPdf(
  columns: string[],
  rows: ExportRow[],
  title = 'Business OS Compliance Export',
): Buffer {
  const lines = [
    title,
    `Rows: ${rows.length}`,
    columns.join(' | ').slice(0, 110),
    ...rows
      .slice(0, 40)
      .map((row) => columns.map((key) => cell(row, key)).join(' | ').slice(0, 110)),
  ];
  const content = lines
    .map((line, index) => `BT /F1 9 Tf 30 ${780 - index * 13} Td (${escapePdf(line)}) Tj ET`)
    .join('\n');
  const stream = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj ${stream} endobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
