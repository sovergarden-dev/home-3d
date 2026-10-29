export const POSTCARD_TITLE = "Phố Nhà Mình · ảnh dựng 3D mô phỏng";

export function postcardFrame(width: number, height: number) {
  const padding = Math.round(width * 0.04);
  const footer = Math.round(height * 0.16);
  const borderInset = 24;
  return {
    width,
    height,
    padding,
    borderInset,
    borderWidth: Math.max(4, width / 320),
    photoWidth: width - padding * 2,
    photoHeight: height - footer - padding * 2,
    captionTop: height - footer - padding + padding * 0.25,
    captionBottom: height - Math.max(borderInset * 1.5, padding * 0.5),
  };
}

type Frame = ReturnType<typeof postcardFrame>;
type TextLine = {
  text: string;
  font: string;
  size: number;
  leftBearing: number;
  ascent: number;
  descent: number;
  width: number;
  height: number;
  lineHeight: number;
};

function measureLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  bold: boolean,
  availableWidth: number,
): TextLine {
  const font = (pixels: number) => `${bold ? "bold " : ""}${pixels}px sans-serif`;
  ctx.font = font(size);
  let metrics = ctx.measureText(text);
  const extent = Math.max(
    metrics.width,
    metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
  );
  if (extent > availableWidth) {
    size *= availableWidth / extent;
    ctx.font = font(size);
    metrics = ctx.measureText(text);
  }
  const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  return {
    text,
    font: font(size),
    size,
    leftBearing: metrics.actualBoundingBoxLeft,
    ascent: metrics.actualBoundingBoxAscent,
    descent: metrics.actualBoundingBoxDescent,
    width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
    height,
    lineHeight: size * 1.2,
  };
}

/** Caption ink boxes are measured at export resolution, independently of the screen's DPR. */
export function drawPostcardCaption(ctx: CanvasRenderingContext2D, frame: Frame, detail: string) {
  ctx.save();
  try {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const availableWidth = frame.photoWidth;
    let title = measureLine(
      ctx,
      POSTCARD_TITLE,
      Math.max(24, frame.width / 34),
      true,
      availableWidth,
    );
    let date = measureLine(ctx, detail, Math.max(20, frame.width / 52), false, availableWidth);
    let gap = Math.min(title.lineHeight, date.lineHeight) * 0.6;
    const availableHeight = frame.captionBottom - frame.captionTop;
    const total = title.height + gap + date.height;
    if (total > availableHeight) {
      const scale = availableHeight / total;
      title = measureLine(ctx, title.text, title.size * scale, true, availableWidth);
      date = measureLine(ctx, date.text, date.size * scale, false, availableWidth);
      gap = Math.min(title.lineHeight, date.lineHeight) * 0.6;
    }
    const top = frame.captionTop + (availableHeight - title.height - gap - date.height) / 2;
    const paint = (line: TextLine, y: number) => {
      ctx.font = line.font;
      ctx.fillText(line.text, frame.padding + line.leftBearing, y + line.ascent);
      return {
        text: line.text,
        x: frame.padding,
        y,
        width: line.width,
        height: line.height,
        lineHeight: line.lineHeight,
      };
    };
    return {
      title: paint(title, top),
      detail: paint(date, top + title.height + gap),
      gap,
    };
  } finally {
    ctx.restore();
  }
}
