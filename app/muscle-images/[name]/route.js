import { deflateSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-static";

const SIZE = 512;
const ALLOWED = new Set(["chest", "back", "shoulders", "biceps", "triceps", "legs", "core"]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function makeCanvas() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (x - SIZE * 0.48) / (SIZE * 0.72);
      const dy = (y - SIZE * 0.42) / (SIZE * 0.72);
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const index = (y * SIZE + x) * 4;
      pixels[index] = 5 + Math.round(glow * 5);
      pixels[index + 1] = 10 + Math.round(glow * 13);
      pixels[index + 2] = 11 + Math.round(glow * 12);
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function blendPixel(pixels, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const index = (Math.floor(y) * SIZE + Math.floor(x)) * 4;
  const a = Math.max(0, Math.min(1, alpha));
  pixels[index] = Math.round(pixels[index] * (1 - a) + color[0] * a);
  pixels[index + 1] = Math.round(pixels[index + 1] * (1 - a) + color[1] * a);
  pixels[index + 2] = Math.round(pixels[index + 2] * (1 - a) + color[2] * a);
  pixels[index + 3] = 255;
}

function ellipse(pixels, cx, cy, rx, ry, color, alpha = 1) {
  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(SIZE - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(cy - ry));
  const maxY = Math.min(SIZE - 1, Math.ceil(cy + ry));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (d <= 1) blendPixel(pixels, x, y, color, alpha * Math.min(1, (1 - d) * 4 + 0.3));
    }
  }
}

function rect(pixels, x1, y1, x2, y2, radius, color, alpha = 1) {
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      const dx = Math.max(x1 + radius - x, 0, x - (x2 - radius));
      const dy = Math.max(y1 + radius - y, 0, y - (y2 - radius));
      if (dx * dx + dy * dy <= radius * radius) blendPixel(pixels, x, y, color, alpha);
    }
  }
}

function line(pixels, x1, y1, x2, y2, width, color, alpha = 1) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps ? i / steps : 0;
    ellipse(pixels, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, width / 2, color, alpha);
  }
}

function baseTorso(pixels, back = false) {
  const grey = [137, 145, 146];
  const greyDark = [72, 80, 81];
  const contour = [205, 213, 214];
  ellipse(pixels, 256, 82, 50, 55, grey, 0.92);
  rect(pixels, 228, 118, 284, 170, 18, greyDark, 0.95);
  ellipse(pixels, 256, 275, 120, 150, grey, 0.96);
  rect(pixels, 114, 175, 181, 394, 31, greyDark, 0.95);
  rect(pixels, 331, 175, 398, 394, 31, greyDark, 0.95);
  line(pixels, 256, 158, 256, 415, 4, contour, 0.28);
  if (!back) {
    line(pixels, 190, 245, 322, 245, 4, contour, 0.22);
    line(pixels, 196, 300, 316, 300, 4, contour, 0.22);
    line(pixels, 204, 355, 308, 355, 4, contour, 0.22);
  } else {
    line(pixels, 185, 220, 256, 285, 4, contour, 0.22);
    line(pixels, 327, 220, 256, 285, 4, contour, 0.22);
  }
}

function highlight(pixels, type) {
  const red = [215, 48, 30];
  const orange = [255, 112, 78];
  const glow = [255, 48, 20];
  const add = (cx, cy, rx, ry) => {
    ellipse(pixels, cx, cy, rx + 18, ry + 18, glow, 0.12);
    ellipse(pixels, cx, cy, rx, ry, red, 0.9);
    ellipse(pixels, cx - rx * 0.2, cy - ry * 0.2, rx * 0.55, ry * 0.42, orange, 0.42);
  };

  if (type === "chest") {
    add(210, 214, 54, 42); add(302, 214, 54, 42);
  } else if (type === "back") {
    add(210, 252, 50, 105); add(302, 252, 50, 105);
  } else if (type === "shoulders") {
    add(162, 196, 42, 48); add(350, 196, 42, 48);
  } else if (type === "biceps") {
    add(148, 264, 28, 58); add(364, 264, 28, 58);
  } else if (type === "triceps") {
    add(151, 280, 25, 68); add(361, 280, 25, 68);
  } else if (type === "core") {
    add(230, 302, 29, 92); add(282, 302, 29, 92);
  }
}

function legsImage(pixels) {
  const grey = [137, 145, 146];
  const greyDark = [72, 80, 81];
  rect(pixels, 162, 64, 350, 166, 42, greyDark, 0.95);
  rect(pixels, 166, 132, 244, 455, 36, grey, 0.96);
  rect(pixels, 268, 132, 346, 455, 36, grey, 0.96);
  const red = [215, 48, 30];
  const orange = [255, 112, 78];
  ellipse(pixels, 205, 242, 40, 102, red, 0.9);
  ellipse(pixels, 307, 242, 40, 102, red, 0.9);
  ellipse(pixels, 194, 213, 18, 58, orange, 0.42);
  ellipse(pixels, 296, 213, 18, 58, orange, 0.42);
  line(pixels, 256, 132, 256, 455, 5, [205, 213, 214], 0.25);
}

function encodePng(pixels) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * (SIZE * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function GET(_request, { params }) {
  const resolved = await params;
  const rawName = String(resolved?.name || "").toLowerCase().replace(/\.png$/, "");
  if (!ALLOWED.has(rawName)) return new Response("Not found", { status: 404 });

  const pixels = makeCanvas();
  if (rawName === "legs") legsImage(pixels);
  else {
    baseTorso(pixels, rawName === "back" || rawName === "triceps");
    highlight(pixels, rawName);
  }

  return new Response(encodePng(pixels), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
