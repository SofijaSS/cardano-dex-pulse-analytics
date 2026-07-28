type TablePdfOptions = {
  filename: string;
  title: string;
  subtitle: string;
  headers: string[];
  rows: string[][];
};

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 34;
const ROW_HEIGHT = 18;
const ROWS_PER_PAGE = 23;

function asciiText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function truncate(value: string, width: number) {
  const maxCharacters = Math.max(7, Math.floor(width / 4.7));
  if (value.length <= maxCharacters) return value;
  return `${value.slice(0, Math.max(1, maxCharacters - 3))}...`;
}

function textCommand(
  value: string,
  x: number,
  y: number,
  size: number,
  font = "F1",
) {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${asciiText(value)}) Tj ET`;
}

function buildPageContent({
  title,
  subtitle,
  headers,
  rows,
  pageNumber,
  totalPages,
}: Omit<TablePdfOptions, "filename"> & {
  pageNumber: number;
  totalPages: number;
}) {
  const availableWidth = PAGE_WIDTH - MARGIN * 2;
  const firstColumnWidth = Math.min(132, availableWidth * 0.2);
  const remainingWidth = availableWidth - firstColumnWidth;
  const metricWidth = remainingWidth / Math.max(1, headers.length - 1);
  const columnWidths = headers.map((_, index) =>
    index === 0 ? firstColumnWidth : metricWidth,
  );
  const commands: string[] = [
    "0.08 0.15 0.21 rg",
    textCommand(title, MARGIN, 558, 15, "F2"),
    "0.41 0.48 0.52 rg",
    textCommand(subtitle, MARGIN, 539, 7.5),
    textCommand(`Page ${pageNumber} of ${totalPages}`, PAGE_WIDTH - 91, 558, 7.5),
    "0.93 0.95 0.97 rg",
    `${MARGIN} 504 ${availableWidth} ${ROW_HEIGHT} re f`,
    "0.08 0.15 0.21 rg",
  ];

  let x = MARGIN;
  headers.forEach((header, index) => {
    commands.push(
      textCommand(truncate(header, columnWidths[index]), x + 5, 510, 7.2, "F2"),
    );
    x += columnWidths[index];
  });

  rows.forEach((row, rowIndex) => {
    const y = 504 - (rowIndex + 1) * ROW_HEIGHT;
    if (rowIndex % 2 === 1) {
      commands.push(
        "0.97 0.98 0.98 rg",
        `${MARGIN} ${y} ${availableWidth} ${ROW_HEIGHT} re f`,
      );
    }
    commands.push(
      "0.83 0.86 0.88 RG",
      "0.4 w",
      `${MARGIN} ${y} m ${PAGE_WIDTH - MARGIN} ${y} l S`,
      "0.08 0.15 0.21 rg",
    );
    let cellX = MARGIN;
    headers.forEach((_, columnIndex) => {
      commands.push(
        textCommand(
          truncate(row[columnIndex] || "", columnWidths[columnIndex]),
          cellX + 5,
          y + 6,
          7.1,
        ),
      );
      cellX += columnWidths[columnIndex];
    });
  });

  commands.push(
    "0.41 0.48 0.52 rg",
    textCommand("Cardano DEX Pulse", MARGIN, 24, 7),
    textCommand("Generated from the selected dashboard range.", PAGE_WIDTH - 235, 24, 7),
  );
  return commands.join("\n");
}

export function createTablePdfBytes({
  title,
  subtitle,
  headers,
  rows,
}: Omit<TablePdfOptions, "filename">) {
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE)) },
    (_, index) => rows.slice(index * ROWS_PER_PAGE, (index + 1) * ROWS_PER_PAGE),
  );
  const objects: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };
  const regularFontId = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  );
  const boldFontId = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  );
  const pagesId = addObject("");
  const pageIds = pages.map((pageRows, index) => {
    const content = buildPageContent({
      title,
      subtitle,
      headers,
      rows: pageRows,
      pageNumber: index + 1,
      totalPages: pages.length,
    });
    const contentId = addObject(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
    return addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
  });
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function downloadTablePdf(options: TablePdfOptions) {
  const bytes = createTablePdfBytes(options);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = options.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
