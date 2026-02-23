const sharp = require('sharp');
const { PNG_COMPRESSION, TRIM_WHITE_THRESHOLD, TRIM_RETAIN_MARGIN, TRIM_SAMPLE_COLUMNS, TRIM_SAFE_MARGIN, TRIM_INNER_MIN_GAP, TRIM_INNER_KEEP, SEPARATOR_HEIGHT, SEPARATOR_COLOR } = require('../shared/constants');

// ── Helper: build evenly-spaced sample column indices ──────────────────────
function buildSampleColumns(width) {
  const numSamples = Math.min(TRIM_SAMPLE_COLUMNS, width);
  const sampleCols = [];
  for (let i = 0; i < numSamples; i++) {
    sampleCols.push(Math.floor((i / numSamples) * width));
  }
  return sampleCols;
}

// ── Helper: check if a pixel row is "white" by sampling specific columns ───
function isRowWhite(data, row, rowBytes, channels, threshold, sampleCols) {
  const rowOffset = row * rowBytes;
  for (const col of sampleCols) {
    const px = rowOffset + col * channels;
    if (data[px] < threshold || data[px + 1] < threshold || data[px + 2] < threshold) {
      return false;
    }
  }
  return true;
}

// ── detectWhitespaceRows ───────────────────────────────────────────────────
/**
 * Detect contiguous near-white rows at the top and bottom of a region.
 * Operates directly on pre-decoded raw pixel data.
 *
 * @param {Buffer} rawData  - Raw pixel buffer for the full image
 * @param {number} startRow - First row of the region to analyse
 * @param {number} endRow   - One-past-last row of the region (startRow + height)
 * @param {number} width    - Image width in pixels
 * @param {number} channels - Number of colour channels (3 or 4)
 */
function detectWhitespaceRows(rawData, startRow, endRow, width, channels) {
  const height = endRow - startRow;
  const fullRowBytes = width * channels;
  const threshold = TRIM_WHITE_THRESHOLD;
  const sampleCols = buildSampleColumns(width);

  // Scan from top downward
  let topWhiteRows = 0;
  for (let row = 0; row < height; row++) {
    if (!isRowWhite(rawData, startRow + row, fullRowBytes, channels, threshold, sampleCols)) break;
    topWhiteRows++;
  }

  // Scan from bottom upward
  let bottomWhiteRows = 0;
  for (let row = height - 1; row >= topWhiteRows; row--) {
    if (!isRowWhite(rawData, startRow + row, fullRowBytes, channels, threshold, sampleCols)) break;
    bottomWhiteRows++;
  }

  return { topWhiteRows, bottomWhiteRows };
}

// ── collapseInnerWhitespace sub-functions ──────────────────────────────────

/** Classify each row in the region as white (true) or content (false). */
function classifyRows(rawData, regionStartRow, regionHeight, width, channels) {
  const fullRowBytes = width * channels;
  const threshold = TRIM_WHITE_THRESHOLD;
  const sampleCols = buildSampleColumns(width);

  const isWhite = new Array(regionHeight);
  for (let row = 0; row < regionHeight; row++) {
    isWhite[row] = isRowWhite(rawData, regionStartRow + row, fullRowBytes, channels, threshold, sampleCols);
  }
  return isWhite;
}

/** Find inner whitespace gaps (between first and last content rows). */
function findInnerGaps(isWhite, regionHeight, minGap) {
  let firstContent = -1;
  let lastContent = -1;
  for (let row = 0; row < regionHeight; row++) {
    if (!isWhite[row]) {
      if (firstContent === -1) firstContent = row;
      lastContent = row;
    }
  }
  if (firstContent === -1) return null; // entirely white

  const gaps = [];
  let gapStart = -1;
  for (let row = firstContent; row <= lastContent; row++) {
    if (isWhite[row]) {
      if (gapStart === -1) gapStart = row;
    } else {
      if (gapStart !== -1) {
        const gapLen = row - gapStart;
        if (gapLen >= minGap) {
          const safeStart = gapStart + TRIM_SAFE_MARGIN;
          const safeEnd = row - TRIM_SAFE_MARGIN;
          const safeLen = safeEnd - safeStart;
          if (safeLen >= minGap) {
            gaps.push({ start: safeStart, end: safeEnd, length: safeLen });
          }
        }
        gapStart = -1;
      }
    }
  }
  return gaps.length > 0 ? gaps : null;
}

/** Build content/collapsed-gap strips from the gap list. */
function buildStrips(gaps, regionHeight, keepPercent) {
  const strips = [];
  let currentStart = 0;

  for (const gap of gaps) {
    if (gap.start > currentStart) {
      strips.push({ srcTop: currentStart, srcHeight: gap.start - currentStart });
    }
    const keepRows = Math.max(1, Math.round(gap.length * keepPercent / 100));
    const keepStart = gap.start + Math.floor((gap.length - keepRows) / 2);
    strips.push({ srcTop: keepStart, srcHeight: keepRows });
    currentStart = gap.end;
  }
  if (currentStart < regionHeight) {
    strips.push({ srcTop: currentStart, srcHeight: regionHeight - currentStart });
  }
  return strips;
}

/** Build rowMap: for each original row (relative to crop region), compute the output row. */
function buildRowMap(strips, gaps, regionHeight, keepPercent) {
  const rowMap = new Float32Array(regionHeight);
  let outputY = 0;

  for (const strip of strips) {
    for (let r = 0; r < strip.srcHeight; r++) {
      const origRow = strip.srcTop + r;
      if (origRow < regionHeight) {
        rowMap[origRow] = outputY + r;
      }
    }
    outputY += strip.srcHeight;
  }

  // Fill in rows that fall inside collapsed gap regions
  for (const gap of gaps) {
    const keepRows = Math.max(1, Math.round(gap.length * keepPercent / 100));
    const keepStart = gap.start + Math.floor((gap.length - keepRows) / 2);
    const keepEnd = keepStart + keepRows;
    for (let r = gap.start; r < keepStart; r++) {
      if (r < regionHeight) rowMap[r] = rowMap[keepStart] || 0;
    }
    for (let r = keepEnd; r < gap.end; r++) {
      if (r < regionHeight) rowMap[r] = rowMap[Math.min(keepEnd - 1, regionHeight - 1)] || 0;
    }
  }

  return rowMap;
}

// ── collapseInnerWhitespace (main) ─────────────────────────────────────────
/**
 * Detect and collapse large inner whitespace gaps in a page region.
 * Operates on pre-decoded raw pixel data — no extra Sharp decode calls.
 *
 * @param {Buffer} rawData       - Raw pixel buffer for the full image
 * @param {number} regionTop     - First row of the region (absolute)
 * @param {number} regionHeight  - Number of rows in the region
 * @param {number} width         - Image width in pixels
 * @param {number} channels      - Number of colour channels
 * @param {number} minGap        - Minimum consecutive white rows to count as gap
 * @param {number} keepPercent   - Percentage of gap rows to retain
 * @returns {{ buffer: Buffer, height: number, rowMap: Float32Array } | null}
 */
async function collapseInnerWhitespace(rawData, regionTop, regionHeight, width, channels, minGap, keepPercent) {
  minGap = minGap || TRIM_INNER_MIN_GAP;
  keepPercent = keepPercent != null ? keepPercent : 30;

  const isWhite = classifyRows(rawData, regionTop, regionHeight, width, channels);
  const gaps = findInnerGaps(isWhite, regionHeight, minGap);
  if (!gaps) return null;

  const strips = buildStrips(gaps, regionHeight, keepPercent);
  const rowMap = buildRowMap(strips, gaps, regionHeight, keepPercent);
  const totalHeight = strips.reduce((sum, s) => sum + s.srcHeight, 0);

  // Build composite inputs by slicing raw data directly (no Sharp re-decode)
  const fullRowBytes = width * channels;
  const compositeInputs = [];
  let destY = 0;
  for (const strip of strips) {
    const absTop = regionTop + strip.srcTop;
    const byteOffset = absTop * fullRowBytes;
    const byteLen = strip.srcHeight * fullRowBytes;
    const stripRaw = rawData.subarray(byteOffset, byteOffset + byteLen);
    compositeInputs.push({
      input: Buffer.from(stripRaw),
      raw: { width, height: strip.srcHeight, channels },
      top: destY,
      left: 0,
    });
    destY += strip.srcHeight;
  }

  // Composite onto white canvas and encode as PNG
  const collapsedPng = await sharp({
    create: { width, height: totalHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();

  return {
    buffer: collapsedPng,
    height: totalHeight,
    rowMap,
  };
}

// ── optimizeFullPage ───────────────────────────────────────────────────────
/**
 * Process a full page image (no splitting) — optimize and optionally resize.
 * When trimWhitespace is enabled:
 *  1. Trims top/bottom whitespace (returns trimmedTop for link coordinate correction)
 *  2. Collapses large inner whitespace gaps (returns rowMap for link Y-coordinate remapping)
 *
 * Returns { buffer, sizeBytes, width, height, trimmedTop, rowMap }
 */
async function optimizeFullPage(pageImageBuffer, options = {}) {
  const compression = options.compression || PNG_COMPRESSION;
  const targetWidth = options.imageWidth || null;
  const trimWhitespace = options.trimWhitespace || false;
  const trimGapSize = options.trimGapSize || TRIM_INNER_MIN_GAP;
  const trimKeepPercent = options.trimKeepPercent != null ? options.trimKeepPercent : 30;

  // Single decode: get metadata + raw pixel data in one pass
  const { data: rawData, info } = await sharp(pageImageBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const metadata = { width: info.width, height: info.height, channels: info.channels };

  let cropTop = 0;
  let actualHeight = metadata.height;
  let trimmedTop = 0;
  let rowMap = null;

  // Whitespace trimming: detect and remove excessive white rows at top/bottom
  if (trimWhitespace && actualHeight > 1) {
    const trimResult = detectWhitespaceRows(rawData, 0, actualHeight, metadata.width, metadata.channels);

    // Top: use slider settings (detect threshold + keep %)
    const topKeep = trimResult.topWhiteRows >= trimGapSize
      ? Math.max(1, Math.round(trimResult.topWhiteRows * trimKeepPercent / 100))
      : trimResult.topWhiteRows;

    // Bottom: always trim to fixed margin (clean page join)
    const bottomKeep = Math.min(trimResult.bottomWhiteRows, TRIM_RETAIN_MARGIN);

    const skipTop = Math.max(0, trimResult.topWhiteRows - topKeep);
    const skipBottom = Math.max(0, trimResult.bottomWhiteRows - bottomKeep);
    const contentHeight = actualHeight - skipTop - skipBottom;
    if (contentHeight >= 2) {
      cropTop = skipTop;
      trimmedTop = skipTop;
      actualHeight = contentHeight;
    }
  }

  // Inner whitespace collapse
  let processedBuffer = pageImageBuffer;
  if (trimWhitespace && actualHeight > trimGapSize * 2) {
    const innerResult = await collapseInnerWhitespace(rawData, cropTop, actualHeight, metadata.width, metadata.channels, trimGapSize, trimKeepPercent);
    if (innerResult) {
      processedBuffer = innerResult.buffer;
      actualHeight = innerResult.height;
      rowMap = innerResult.rowMap;
      cropTop = 0;
    }
  }

  let pipeline = sharp(processedBuffer);

  // Apply trim extraction if needed (only if inner collapse didn't already do it)
  if (cropTop > 0 || (actualHeight < metadata.height && !rowMap)) {
    pipeline = pipeline.extract({
      left: 0,
      top: cropTop,
      width: metadata.width,
      height: actualHeight,
    });
  }

  let outputWidth = metadata.width;
  let outputHeight = actualHeight;
  if (targetWidth && targetWidth < metadata.width) {
    pipeline = pipeline.resize({
      width: targetWidth,
      withoutEnlargement: true,
      fit: 'inside',
    });
    outputWidth = targetWidth;
    outputHeight = Math.round(actualHeight * (targetWidth / metadata.width));
  }

  const optimized = await pipeline
    .png({
      compressionLevel: compression,
    })
    .toBuffer();

  return {
    buffer: optimized,
    sizeBytes: optimized.length,
    width: outputWidth,
    height: outputHeight,
    trimmedTop,
    rowMap,
  };
}

// ── stitchPages ────────────────────────────────────────────────────────────
/**
 * Stitch multiple page images vertically into a single tall image.
 * Input: array of { buffer, width, height } objects.
 * All pages are resized to the same width (the width of the first page).
 * Returns the composite image with a lazy base64 getter.
 */
async function stitchPages(pages, options = {}) {
  if (pages.length === 0) {
    throw new Error('stitchPages: no pages provided');
  }

  if (pages.length === 1) {
    const buf = pages[0].buffer;
    return {
      buffer: buf,
      get base64() {
        const val = buf.toString('base64');
        Object.defineProperty(this, 'base64', { value: val });
        return val;
      },
      sizeBytes: buf.length,
      width: pages[0].width,
      height: pages[0].height,
      separatorHeight: 0,
    };
  }

  const targetWidth = pages[0].width;
  const compression = options.compression || PNG_COMPRESSION;
  const useSeparator = options.separator || false;
  const sepHeight = useSeparator ? SEPARATOR_HEIGHT : 0;

  // Pre-generate separator strip buffer if needed
  let separatorBuf = null;
  if (useSeparator) {
    separatorBuf = await sharp({
      create: { width: targetWidth, height: SEPARATOR_HEIGHT, channels: 4, background: SEPARATOR_COLOR },
    }).png().toBuffer();
  }

  // Calculate total height and prepare composite inputs
  let totalHeight = 0;
  const compositeInputs = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    let buf = page.buffer;
    let pageHeight = page.height;

    // Resize to target width if different
    if (page.width !== targetWidth) {
      const resized = await sharp(buf)
        .resize({ width: targetWidth, withoutEnlargement: false, fit: 'fill' })
        .toBuffer({ resolveWithObject: true });
      buf = resized.data;
      pageHeight = resized.info.height;
    }

    compositeInputs.push({
      input: buf,
      top: totalHeight,
      left: 0,
    });
    totalHeight += pageHeight;

    // Insert separator between pages (not after the last page)
    if (useSeparator && i < pages.length - 1) {
      compositeInputs.push({
        input: separatorBuf,
        top: totalHeight,
        left: 0,
      });
      totalHeight += SEPARATOR_HEIGHT;
    }
  }

  // Create RGBA canvas and composite all pages
  const stitched = await sharp({
    create: {
      width: targetWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeInputs)
    .png({ compressionLevel: compression })
    .toBuffer();

  return {
    buffer: stitched,
    get base64() {
      const val = stitched.toString('base64');
      Object.defineProperty(this, 'base64', { value: val });
      return val;
    },
    sizeBytes: stitched.length,
    width: targetWidth,
    height: totalHeight,
    separatorHeight: sepHeight,
  };
}

module.exports = { optimizeFullPage, stitchPages };
