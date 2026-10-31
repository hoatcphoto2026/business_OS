import { AuditEvent } from './entities/audit-event.entity';

const COLUMNS = [
  'eventId',
  'tenantId',
  'actorId',
  'actorEmail',
  'category',
  'resourceType',
  'resourceId',
  'action',
  'ipAddress',
  'userAgent',
  'traceId',
  'createdAt',
] as const;

function cell(event: AuditEvent, key: (typeof COLUMNS)[number]): string {
  const value = event[key];
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(events: AuditEvent[]): string {
  const header = COLUMNS.join(',');
  const lines = events.map((event) => COLUMNS.map((key) => csvEscape(cell(event, key))).join(','));
  return [header, ...lines].join('\n');
}

export function toExcelXml(events: AuditEvent[]): string {
  const header = `<Row>${COLUMNS.map((key) => `<Cell><Data ss:Type="String">${key}</Data></Cell>`).join('')}</Row>`;
  const rows = events
    .map((event) => {
      const cells = COLUMNS.map((key) => {
        const value = escapeXml(cell(event, key));
        return `<Cell><Data ss:Type="String">${value}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Audit">
<Table>${header}${rows}</Table>
</Worksheet>
</Workbook>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function toPdf(events: AuditEvent[]): Buffer {
  const lines = [
    'Business OS Audit Export',
    `Rows: ${events.length}`,
    ...events.slice(0, 40).map((event) => {
      const when = event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt);
      return `${when} ${event.category} ${event.action} ${event.resourceType} ${event.actorEmail ?? ''}`.slice(0, 110);
    }),
  ];
  const content = lines
    .map((line, index) => `BT /F1 10 Tf 40 ${780 - index * 14} Td (${escapePdf(line)}) Tj ET`)
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

function escapePdf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
