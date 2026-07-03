#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const ROOT = process.cwd();
const ICONS_DIR = path.join(ROOT, "src-tauri", "icons");
const PUBLIC = path.join(ROOT, "public");

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function transparentBounds(imageData, width, height, threshold = 8) {
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height };
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function loadCroppedSource(sourcePath) {
  const img = await loadImage(sourcePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  return { image: img, bounds: transparentBounds(data, img.width, img.height) };
}

function renderIcon(source, size, options = {}) {
  const {
    padRatio = 0.045,
    outline = 0,
    outlineAlpha = 0.6,
    sharpen = false,
  } = options;
  const scale = sharpen ? 4 : 2;
  const workSize = size * scale;
  const canvas = createCanvas(workSize, workSize);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const pad = Math.round(workSize * padRatio);
  const drawSize = workSize - pad * 2;
  const dx = pad;
  const dy = pad;
  const { image, bounds } = source;

  if (outline > 0) {
    const mask = createCanvas(workSize, workSize);
    const maskCtx = mask.getContext("2d");
    maskCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingQuality = "high";
    maskCtx.drawImage(
      image,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      dx,
      dy,
      drawSize,
      drawSize,
    );
    const imgData = maskCtx.getImageData(0, 0, workSize, workSize);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      data[i] = 70;
      data[i + 1] = 44;
      data[i + 2] = 190;
      data[i + 3] = Math.round(a * outlineAlpha);
    }
    maskCtx.putImageData(imgData, 0, 0);
    const radius = Math.max(1, Math.round(outline * scale));
    for (let oy = -radius; oy <= radius; oy += radius) {
      for (let ox = -radius; ox <= radius; ox += radius) {
        if (ox !== 0 || oy !== 0) {
          ctx.drawImage(mask, ox, oy);
        }
      }
    }
  }

  ctx.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    dx,
    dy,
    drawSize,
    drawSize,
  );

  const out = createCanvas(size, size);
  const outCtx = out.getContext("2d");
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(canvas, 0, 0, size, size);

  if (sharpen) {
    tuneSmallIcon(outCtx, size, size);
  }
  return out;
}

function tuneSmallIcon(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(imgData.data);
  const data = imgData.data;
  const kernel = [0, -0.22, 0, -0.22, 1.88, -0.22, 0, -0.22, 0];
  const at = (x, y, c) => source[(y * width + x) * 4 + c];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = source[idx + 3];
      if (alpha === 0) continue;
      for (let c = 0; c < 3; c += 1) {
        let v = 0;
        let k = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            v += at(x + ox, y + oy, c) * kernel[k];
            k += 1;
          }
        }
        v = (v - 128) * 1.12 + 128;
        data[idx + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
      if (alpha > 230) data[idx + 3] = 255;
      else if (alpha < 18) data[idx + 3] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function pngBuffer(canvas) {
  return canvas.toBuffer("image/png");
}

function savePng(canvas, filePath) {
  writeBufferIfChanged(filePath, pngBuffer(canvas));
}

function writeBufferIfChanged(filePath, buffer) {
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath);
    if (current.length === buffer.length && current.equals(buffer)) {
      return false;
    }
  }
  fs.writeFileSync(filePath, buffer);
  return true;
}

function writeIco(entries, filePath) {
  const headerSize = 6 + entries.length * 16;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  entries.forEach((entry, index) => {
    const o = 6 + index * 16;
    header[o] = entry.size >= 256 ? 0 : entry.size;
    header[o + 1] = entry.size >= 256 ? 0 : entry.size;
    header[o + 2] = 0;
    header[o + 3] = 0;
    header.writeUInt16LE(1, o + 4);
    header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(entry.buffer.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += entry.buffer.length;
  });

  writeBufferIfChanged(filePath, Buffer.concat([header, ...entries.map((entry) => entry.buffer)]));
}

async function exportHero(heroPath) {
  const img = await loadImage(heroPath);
  const ratio = Math.min(1, 640 / Math.max(img.width, img.height));
  const canvas = createCanvas(Math.round(img.width * ratio), Math.round(img.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  savePng(canvas, path.join(PUBLIC, "chat-empty-hero.png"));
}

async function main() {
  const sourcePath = path.resolve(ROOT, argValue("--source", "brands/xiaonuo/icon-source.png"));
  const heroPath = argValue("--hero");
  if (!fs.existsSync(sourcePath)) {
    console.error(`Icon source not found: ${sourcePath}`);
    process.exit(1);
  }

  ensureDir(ICONS_DIR);
  ensureDir(PUBLIC);

  const source = await loadCroppedSource(sourcePath);
  const normal = (size) => renderIcon(source, size, { padRatio: 0.045 });
  const compact = (size) => renderIcon(source, size, {
    padRatio: size <= 32 ? 0.015 : 0.025,
    outline: size <= 32 ? 1.4 : 1,
    outlineAlpha: size <= 32 ? 0.72 : 0.56,
    sharpen: true,
  });

  const pngs = new Map([
    [16, compact(16)],
    [32, compact(32)],
    [48, compact(48)],
    [64, compact(64)],
    [128, normal(128)],
    [256, normal(256)],
    [512, normal(512)],
  ]);

  savePng(pngs.get(32), path.join(ICONS_DIR, "32x32.png"));
  savePng(pngs.get(64), path.join(ICONS_DIR, "64x64.png"));
  savePng(pngs.get(128), path.join(ICONS_DIR, "128x128.png"));
  savePng(pngs.get(256), path.join(ICONS_DIR, "128x128@2x.png"));
  savePng(pngs.get(512), path.join(ICONS_DIR, "icon.png"));

  for (const [size, name] of [
    [30, "Square30x30Logo.png"],
    [44, "Square44x44Logo.png"],
    [71, "Square71x71Logo.png"],
    [89, "Square89x89Logo.png"],
    [107, "Square107x107Logo.png"],
    [142, "Square142x142Logo.png"],
    [150, "Square150x150Logo.png"],
    [284, "Square284x284Logo.png"],
    [310, "Square310x310Logo.png"],
    [50, "StoreLogo.png"],
  ]) {
    savePng(size <= 64 ? compact(size) : normal(size), path.join(ICONS_DIR, name));
  }

  writeIco(
    [16, 32, 48, 64, 128, 256].map((size) => ({ size, buffer: pngBuffer(pngs.get(size)) })),
    path.join(ICONS_DIR, "icon.ico"),
  );
  writeIco(
    [16, 32, 48, 64, 128, 256].map((size) => ({ size, buffer: pngBuffer(pngs.get(size)) })),
    path.join(ICONS_DIR, "installer.ico"),
  );

  savePng(pngs.get(512), path.join(PUBLIC, "piscis.png"));
  savePng(pngs.get(512), path.join(PUBLIC, "app-icon.png"));

  if (heroPath && fs.existsSync(path.resolve(ROOT, heroPath))) {
    await exportHero(path.resolve(ROOT, heroPath));
    console.log(`hero: ${heroPath} -> public/chat-empty-hero.png`);
  }

  console.log("icon.icns: retained");
  console.log("done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
