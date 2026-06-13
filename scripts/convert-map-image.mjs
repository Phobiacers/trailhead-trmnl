#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const crcTable = buildCrcTable();
const options = parseArgs(process.argv.slice(2));

if (options.help || options._.length === 0) {
  printUsage();
  process.exit(options.help ? 0 : 1);
}

const inputPath = path.resolve(options._[0]);
if (!existsSync(inputPath)) {
  throw new Error(`Input image not found: ${inputPath}`);
}

const width = parsePositiveInteger(options.width, 800, "width");
const height = parsePositiveInteger(options.height, 480, "height");
const fit = options.fit || "cover";
const dither = options.dither || "ordered";
const levels = parseLevels(options.levels || "16,4,2");
const baseName = slug(options.prefix || path.basename(inputPath, path.extname(inputPath)));
const outputDir = path.resolve(options._[1] || path.join("public", "maps", baseName));

if (!["cover", "contain"].includes(fit)) {
  throw new Error("--fit must be cover or contain");
}
if (!["ordered", "none"].includes(dither)) {
  throw new Error("--dither must be ordered or none");
}

await mkdir(outputDir, { recursive: true });

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "trailhead-map-"));
try {
  const bmpPath = path.join(tmpDir, "source.bmp");
  execFileSync("sips", ["-s", "format", "bmp", inputPath, "-o", bmpPath], { stdio: "pipe" });

  const source = parseBmp(await readFile(bmpPath));
  const gray = resampleToGray(source, width, height, fit);
  const outputFiles = [];

  for (const levelCount of levels) {
    const quantized = quantizeGray(gray, width, height, levelCount, dither);
    const outputPath = path.join(outputDir, `${baseName}-${width}x${height}-${levelCount}gray.png`);
    await writeFile(outputPath, encodeGrayscalePng(width, height, quantized));
    outputFiles.push(outputPath);
  }

  console.log(`Converted ${path.basename(inputPath)} to ${width}x${height} grayscale map assets:`);
  for (const outputFile of outputFiles) {
    console.log(`- ${path.relative(process.cwd(), outputFile)}`);
  }
} finally {
  await rm(tmpDir, { force: true, recursive: true });
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key === "help") {
      parsed.help = true;
      continue;
    }

    parsed[key] = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return parsed;
}

function printUsage() {
  console.log(`Usage:
  npm run map:convert -- <input-image> [output-dir] [options]

Options:
  --width 800           Output width in pixels
  --height 480          Output height in pixels
  --levels 16,4,2       Grayscale palettes to generate
  --fit cover           cover or contain
  --dither ordered      ordered or none
  --prefix name         Output filename prefix

Example:
  npm run map:convert -- assets/maps/source/rubicon.png public/maps/rubicon --width 800 --height 480 --levels 16,4,2
`);
}

function parsePositiveInteger(value, fallback, label) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return parsed;
}

function parseLevels(value) {
  const parsed = String(value)
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isInteger(item));

  if (parsed.length === 0 || parsed.some((item) => item < 2 || item > 256)) {
    throw new Error("--levels must be a comma-separated list of integers from 2 to 256");
  }
  return [...new Set(parsed)];
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "map";
}

function parseBmp(buffer) {
  if (buffer.toString("ascii", 0, 2) !== "BM") {
    throw new Error("sips did not produce a BMP file");
  }

  const pixelOffset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const bitDepth = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);

  if (compression !== 0) {
    throw new Error("Compressed BMP output is not supported");
  }
  if (![24, 32].includes(bitDepth)) {
    throw new Error(`Unsupported BMP bit depth: ${bitDepth}`);
  }

  const bytesPerPixel = bitDepth / 8;
  const rowStride = Math.floor((bitDepth * width + 31) / 32) * 4;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sourceY = topDown ? y : height - 1 - y;
    const rowOffset = pixelOffset + sourceY * rowStride;
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = rowOffset + x * bytesPerPixel;
      const targetIndex = (y * width + x) * 4;
      const blue = buffer[sourceIndex];
      const green = buffer[sourceIndex + 1];
      const red = buffer[sourceIndex + 2];
      const alpha = bytesPerPixel === 4 ? buffer[sourceIndex + 3] / 255 : 1;

      pixels[targetIndex] = Math.round(red * alpha + 255 * (1 - alpha));
      pixels[targetIndex + 1] = Math.round(green * alpha + 255 * (1 - alpha));
      pixels[targetIndex + 2] = Math.round(blue * alpha + 255 * (1 - alpha));
      pixels[targetIndex + 3] = 255;
    }
  }

  return { width, height, pixels };
}

function resampleToGray(source, targetWidth, targetHeight, fit) {
  const output = new Float32Array(targetWidth * targetHeight);
  const sourceAspect = source.width / source.height;
  const targetAspect = targetWidth / targetHeight;

  let sampleWidth = source.width;
  let sampleHeight = source.height;
  let sampleX = 0;
  let sampleY = 0;
  let drawnWidth = targetWidth;
  let drawnHeight = targetHeight;
  let padX = 0;
  let padY = 0;

  if (fit === "cover") {
    if (sourceAspect > targetAspect) {
      sampleWidth = source.height * targetAspect;
      sampleX = (source.width - sampleWidth) / 2;
    } else {
      sampleHeight = source.width / targetAspect;
      sampleY = (source.height - sampleHeight) / 2;
    }
  } else if (sourceAspect > targetAspect) {
    drawnHeight = Math.round(targetWidth / sourceAspect);
    padY = Math.floor((targetHeight - drawnHeight) / 2);
  } else {
    drawnWidth = Math.round(targetHeight * sourceAspect);
    padX = Math.floor((targetWidth - drawnWidth) / 2);
  }

  output.fill(255);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      if (x < padX || y < padY || x >= padX + drawnWidth || y >= padY + drawnHeight) {
        continue;
      }

      const normalizedX = (x - padX + 0.5) / drawnWidth;
      const normalizedY = (y - padY + 0.5) / drawnHeight;
      const sourceX = sampleX + normalizedX * sampleWidth - 0.5;
      const sourceY = sampleY + normalizedY * sampleHeight - 0.5;
      output[y * targetWidth + x] = sampleLuma(source, sourceX, sourceY);
    }
  }

  return output;
}

function sampleLuma(source, x, y) {
  const x0 = clamp(Math.floor(x), 0, source.width - 1);
  const y0 = clamp(Math.floor(y), 0, source.height - 1);
  const x1 = clamp(x0 + 1, 0, source.width - 1);
  const y1 = clamp(y0 + 1, 0, source.height - 1);
  const xWeight = clamp(x - x0, 0, 1);
  const yWeight = clamp(y - y0, 0, 1);

  const top = mixPixel(source, x0, y0, x1, y0, xWeight);
  const bottom = mixPixel(source, x0, y1, x1, y1, xWeight);
  return top * (1 - yWeight) + bottom * yWeight;
}

function mixPixel(source, x0, y0, x1, y1, weight) {
  return lumaAt(source, x0, y0) * (1 - weight) + lumaAt(source, x1, y1) * weight;
}

function lumaAt(source, x, y) {
  const index = (y * source.width + x) * 4;
  return source.pixels[index] * 0.2126 + source.pixels[index + 1] * 0.7152 + source.pixels[index + 2] * 0.0722;
}

function quantizeGray(gray, width, height, levels, dither) {
  const output = Buffer.alloc(width * height);
  const step = 255 / (levels - 1);
  const matrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  const ditherStrength = dither === "ordered" ? step * 0.85 : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const threshold = ((matrix[y % 4][x % 4] + 0.5) / 16 - 0.5) * ditherStrength;
      const value = clamp(gray[index] + threshold, 0, 255);
      output[index] = Math.round(value / step) * step;
    }
  }

  return output;
}

function encodeGrayscalePng(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width, (y + 1) * width);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
