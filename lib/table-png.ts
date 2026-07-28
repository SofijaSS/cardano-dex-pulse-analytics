export type TablePngRow = {
  cells: string[];
  accentColor?: string;
};

type CopyTablePngOptions = {
  filename: string;
  title: string;
  subtitle: string;
  headers: string[];
  rows: TablePngRow[];
  theme: "light" | "dark";
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function ellipsize(
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
) {
  if (context.measureText(value).width <= maximumWidth) return value;
  let shortened = value;
  while (
    shortened.length > 1 &&
    context.measureText(`${shortened}…`).width > maximumWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The PNG image could not be created."));
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function copyTableAsPng({
  filename,
  title,
  subtitle,
  headers,
  rows,
  theme,
}: CopyTablePngOptions): Promise<"copied" | "downloaded"> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  const colors = theme === "dark"
    ? {
        canvas: "#09121a",
        surface: "#101b24",
        surfaceStrong: "#17242e",
        header: "#15222c",
        stripe: "#13212b",
        ink: "#edf4f6",
        muted: "#91a3ad",
        line: "#2c3c47",
        blue: "#7098ff",
      }
    : {
        canvas: "#f2f1eb",
        surface: "#faf9f5",
        surfaceStrong: "#ffffff",
        header: "#f6f5ef",
        stripe: "#f7f6f1",
        ink: "#142636",
        muted: "#687984",
        line: "#d4d7d5",
        blue: "#1b5cff",
      };
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const outerPadding = 30;
  const titleHeight = 92;
  const headerHeight = 40;
  const rowHeight = 36;
  const footerHeight = 32;

  context.font = '600 12px "SFMono-Regular", "Cascadia Code", monospace';
  const columnWidths = headers.map((header, columnIndex) => {
    const widestCell = rows.reduce(
      (width, row) =>
        Math.max(width, context.measureText(row.cells[columnIndex] || "").width),
      context.measureText(header).width,
    );
    return clamp(
      widestCell + (columnIndex === 0 ? 42 : 22),
      columnIndex === 0 ? 220 : 90,
      columnIndex === 0 ? 300 : 164,
    );
  });
  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);
  const logicalWidth = Math.ceil(tableWidth + outerPadding * 2);
  const logicalHeight = Math.ceil(
    outerPadding * 2 +
      titleHeight +
      headerHeight +
      rows.length * rowHeight +
      footerHeight,
  );

  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;
  context.scale(scale, scale);
  context.textBaseline = "middle";
  context.fillStyle = colors.canvas;
  context.fillRect(0, 0, logicalWidth, logicalHeight);

  context.fillStyle = colors.surface;
  context.fillRect(
    outerPadding,
    outerPadding,
    tableWidth,
    logicalHeight - outerPadding * 2,
  );
  context.fillStyle = colors.blue;
  context.font = '700 10px "SFMono-Regular", "Cascadia Code", monospace';
  context.fillText("EXCHANGE DETAIL", outerPadding + 16, outerPadding + 16);
  context.fillStyle = colors.ink;
  context.font = '650 25px "Avenir Next", Avenir, sans-serif';
  context.fillText(title, outerPadding + 16, outerPadding + 45);
  context.fillStyle = colors.muted;
  context.font = '500 11px "Avenir Next", Avenir, sans-serif';
  context.fillText(
    ellipsize(context, subtitle, tableWidth - 32),
    outerPadding + 16,
    outerPadding + 71,
  );

  const tableTop = outerPadding + titleHeight;
  context.fillStyle = colors.header;
  context.fillRect(outerPadding, tableTop, tableWidth, headerHeight);

  let columnX = outerPadding;
  headers.forEach((header, columnIndex) => {
    context.fillStyle = colors.muted;
    context.font = '700 10px "SFMono-Regular", "Cascadia Code", monospace';
    context.textAlign = columnIndex === 0 ? "left" : "right";
    const textX = columnIndex === 0
      ? columnX + 16
      : columnX + columnWidths[columnIndex] - 12;
    context.fillText(
      ellipsize(context, header.toUpperCase(), columnWidths[columnIndex] - 28),
      textX,
      tableTop + headerHeight / 2,
    );
    columnX += columnWidths[columnIndex];
  });

  rows.forEach((row, rowIndex) => {
    const rowTop = tableTop + headerHeight + rowIndex * rowHeight;
    context.fillStyle = rowIndex % 2 === 1 ? colors.stripe : colors.surface;
    context.fillRect(outerPadding, rowTop, tableWidth, rowHeight);
    context.strokeStyle = colors.line;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(outerPadding, rowTop + rowHeight);
    context.lineTo(outerPadding + tableWidth, rowTop + rowHeight);
    context.stroke();

    let cellX = outerPadding;
    row.cells.forEach((cell, columnIndex) => {
      const width = columnWidths[columnIndex];
      const firstColumnOffset = columnIndex === 0 && row.accentColor ? 31 : 16;
      if (columnIndex === 0 && row.accentColor) {
        context.fillStyle = row.accentColor;
        context.beginPath();
        context.arc(cellX + 17, rowTop + rowHeight / 2, 4, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = colors.ink;
      context.font = columnIndex === 0
        ? '600 11px "Avenir Next", Avenir, sans-serif'
        : '500 10px "SFMono-Regular", "Cascadia Code", monospace';
      context.textAlign = columnIndex === 0 ? "left" : "right";
      const textX = columnIndex === 0
        ? cellX + firstColumnOffset
        : cellX + width - 12;
      context.fillText(
        ellipsize(
          context,
          cell,
          width - (columnIndex === 0 ? firstColumnOffset + 10 : 22),
        ),
        textX,
        rowTop + rowHeight / 2,
      );
      cellX += width;
    });
  });

  const footerY =
    tableTop + headerHeight + rows.length * rowHeight + footerHeight / 2;
  context.fillStyle = colors.muted;
  context.font = '500 9px "SFMono-Regular", "Cascadia Code", monospace';
  context.textAlign = "left";
  context.fillText("Cardano DEX Pulse", outerPadding + 16, footerY);
  context.textAlign = "right";
  context.fillText(
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date()),
    outerPadding + tableWidth - 16,
    footerY,
  );

  const blob = await canvasBlob(canvas);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return "copied";
  }

  downloadBlob(blob, filename);
  return "downloaded";
}
