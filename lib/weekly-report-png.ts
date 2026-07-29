export type WeeklyReportPngMetric = {
  label: string;
  value: string;
  tone?: "positive" | "negative";
};

export type WeeklyReportPngEntry = {
  rank: number;
  name: string;
  value: string;
  color: string;
  selected: boolean;
};

type CopyWeeklyReportPngOptions = {
  filename: string;
  focus: string;
  title: string;
  subtitle: string;
  metrics: WeeklyReportPngMetric[];
  summary: string;
  sourceLine: string;
  generatedLine: string;
  topThree: WeeklyReportPngEntry[];
};

const LOGICAL_WIDTH = 1_600;
const LOGICAL_HEIGHT = 800;
const MAX_PNG_WIDTH = 4_096;
const MAX_PNG_HEIGHT = 3_072;
const MAX_PNG_AREA = 12_000_000;

const COLORS = {
  ink: "#f7fbff",
  muted: "#9fb2bf",
  line: "rgba(255, 255, 255, 0.14)",
  blue: "#82a4ff",
  blueStrong: "#1b5cff",
  surface: "rgba(255, 255, 255, 0.035)",
  summary: "#111e27",
  positive: "#70dfb2",
  negative: "#ff8c8f",
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function calculateWeeklyPngScale(
  logicalWidth: number,
  logicalHeight: number,
  devicePixelRatio: number,
) {
  const preferredScale = clamp((devicePixelRatio || 1) * 1.25, 2, 2.5);
  const widthScale = MAX_PNG_WIDTH / logicalWidth;
  const heightScale = MAX_PNG_HEIGHT / logicalHeight;
  const areaScale = Math.sqrt(
    MAX_PNG_AREA / (logicalWidth * logicalHeight),
  );

  return Math.min(preferredScale, widthScale, heightScale, areaScale);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

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

function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
  maximumLines: number,
) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maximumWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
    if (lines.length === maximumLines - 1) break;
  }

  if (current && lines.length < maximumLines) lines.push(current);
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    lines[lines.length - 1] = ellipsize(
      context,
      `${lines[lines.length - 1]} ${words.slice(consumed).join(" ")}`,
      maximumWidth,
    );
  }
  return lines;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maximumWidth: number,
  lineHeight: number,
  maximumLines: number,
) {
  const lines = wrapText(context, value, maximumWidth, maximumLines);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
  return lines.length;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The weekly brief PNG could not be created."));
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

export async function copyWeeklyReportAsPng({
  filename,
  focus,
  title,
  subtitle,
  metrics,
  summary,
  sourceLine,
  generatedLine,
  topThree,
}: CopyWeeklyReportPngOptions): Promise<"copied" | "downloaded"> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  const scale = calculateWeeklyPngScale(
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    window.devicePixelRatio || 1,
  );
  canvas.width = Math.ceil(LOGICAL_WIDTH * scale);
  canvas.height = Math.ceil(LOGICAL_HEIGHT * scale);
  context.scale(scale, scale);
  context.textBaseline = "top";

  const background = context.createLinearGradient(0, 0, LOGICAL_WIDTH, 0);
  background.addColorStop(0, "#0d2638");
  background.addColorStop(0.62, "#102f49");
  background.addColorStop(1, "#153c59");
  context.fillStyle = background;
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  const glow = context.createRadialGradient(1_440, 70, 10, 1_440, 70, 620);
  glow.addColorStop(0, "rgba(27, 92, 255, 0.78)");
  glow.addColorStop(1, "rgba(27, 92, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(800, 0, 800, 620);

  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  [210, 155, 100].forEach((radius) => {
    context.beginPath();
    context.arc(1_510, 775, radius, 0, Math.PI * 2);
    context.stroke();
  });

  const outerX = 48;
  context.fillStyle = COLORS.blue;
  context.font = '700 13px "SFMono-Regular", "Cascadia Code", monospace';
  context.fillText(focus.toUpperCase(), outerX, 48);
  context.fillStyle = COLORS.ink;
  context.font = '700 44px "Avenir Next", Avenir, sans-serif';
  context.fillText(title, outerX, 83);
  context.fillStyle = COLORS.muted;
  context.font = '500 15px "Avenir Next", Avenir, sans-serif';
  context.fillText(subtitle, outerX, 144);

  const contentTop = 198;
  const contentHeight = 360;
  const metricsWidth = 1_000;
  const contentGap = 16;
  const summaryX = outerX + metricsWidth + contentGap;
  const summaryWidth = LOGICAL_WIDTH - summaryX - outerX;

  roundedRect(context, outerX, contentTop, metricsWidth, contentHeight, 14);
  context.fillStyle = COLORS.surface;
  context.fill();
  context.strokeStyle = COLORS.line;
  context.stroke();

  const metricWidth = metricsWidth / 3;
  const metricHeight = contentHeight / 3;
  metrics.slice(0, 9).forEach((metric, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = outerX + column * metricWidth;
    const y = contentTop + row * metricHeight;

    if (column > 0) {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y + metricHeight);
      context.strokeStyle = COLORS.line;
      context.stroke();
    }
    if (row > 0) {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + metricWidth, y);
      context.strokeStyle = COLORS.line;
      context.stroke();
    }

    context.fillStyle = COLORS.muted;
    context.font = '700 11px "SFMono-Regular", "Cascadia Code", monospace';
    context.fillText(metric.label.toUpperCase(), x + 22, y + 24);
    context.fillStyle =
      metric.tone === "positive"
        ? COLORS.positive
        : metric.tone === "negative"
          ? COLORS.negative
          : COLORS.ink;
    context.font = '600 26px "SFMono-Regular", "Cascadia Code", monospace';
    context.fillText(
      ellipsize(context, metric.value, metricWidth - 44),
      x + 22,
      y + 62,
    );
  });

  roundedRect(
    context,
    summaryX,
    contentTop,
    summaryWidth,
    contentHeight,
    14,
  );
  context.fillStyle = COLORS.summary;
  context.fill();

  const summaryPadding = 28;
  context.fillStyle = COLORS.blue;
  context.font = '700 11px "SFMono-Regular", "Cascadia Code", monospace';
  context.fillText(
    "AUTO-GENERATED WEEKLY SUMMARY",
    summaryX + summaryPadding,
    contentTop + 28,
  );
  context.fillStyle = COLORS.ink;
  context.font = '650 22px "Avenir Next", Avenir, sans-serif';
  drawWrappedText(
    context,
    summary,
    summaryX + summaryPadding,
    contentTop + 76,
    summaryWidth - summaryPadding * 2,
    31,
    6,
  );

  context.fillStyle = COLORS.muted;
  context.font = '500 10px "Avenir Next", Avenir, sans-serif';
  drawWrappedText(
    context,
    sourceLine,
    summaryX + summaryPadding,
    contentTop + 286,
    summaryWidth - summaryPadding * 2,
    15,
    2,
  );
  context.fillText(
    ellipsize(context, generatedLine, summaryWidth - summaryPadding * 2),
    summaryX + summaryPadding,
    contentTop + 329,
  );

  context.fillStyle = COLORS.muted;
  context.font = '700 11px "SFMono-Regular", "Cascadia Code", monospace';
  context.fillText("SELECT A TOP-THREE TABLE ENTRY", outerX, 605);

  const cardTop = 636;
  const cardHeight = 104;
  const cardGap = 12;
  const cardWidth =
    (LOGICAL_WIDTH - outerX * 2 - cardGap * 2) / 3;
  topThree.slice(0, 3).forEach((entry, index) => {
    const x = outerX + index * (cardWidth + cardGap);
    roundedRect(context, x, cardTop, cardWidth, cardHeight, 12);
    context.fillStyle = entry.selected
      ? "rgba(27, 92, 255, 0.34)"
      : "rgba(255, 255, 255, 0.04)";
    context.fill();
    context.strokeStyle = entry.selected
      ? "rgba(112, 152, 255, 0.9)"
      : COLORS.line;
    context.lineWidth = entry.selected ? 2 : 1;
    context.stroke();

    context.fillStyle = COLORS.muted;
    context.font = '600 12px "SFMono-Regular", "Cascadia Code", monospace';
    context.fillText(`#${entry.rank}`, x + 20, cardTop + 22);
    context.fillStyle = entry.color;
    context.beginPath();
    context.arc(x + 59, cardTop + 29, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = COLORS.ink;
    context.font = '650 15px "Avenir Next", Avenir, sans-serif';
    context.fillText(
      ellipsize(context, entry.name, cardWidth - 112),
      x + 76,
      cardTop + 18,
    );
    context.fillStyle = COLORS.muted;
    context.font = '600 11px "SFMono-Regular", "Cascadia Code", monospace';
    context.fillText(
      ellipsize(context, entry.value, cardWidth - 96),
      x + 76,
      cardTop + 57,
    );
  });

  context.fillStyle = COLORS.muted;
  context.font = '600 10px "SFMono-Regular", "Cascadia Code", monospace';
  context.fillText("CARDANO DEX PULSE", outerX, 770);
  context.textAlign = "right";
  context.fillText("HIGH-RESOLUTION WEEKLY REPORT", LOGICAL_WIDTH - outerX, 770);

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
