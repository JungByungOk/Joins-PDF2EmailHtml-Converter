const sharp = require('sharp');
const { PNG_COMPRESSION, TRIM_WHITE_THRESHOLD, TRIM_RETAIN_MARGIN, TRIM_SAMPLE_COLUMNS, TRIM_SAFE_MARGIN, TRIM_INNER_MIN_GAP, TRIM_INNER_KEEP } = require('../shared/constants');

/**
 * Crop a region from the full page image and optimize it as PNG.
 * Optionally resize to target width (options.imageWidth) for file size control.
 * The HTML template handles display sizing via CSS width.
 */
async function cropAndOptimize(pageImageBuffer, region, options = {}) {
  const compression = options.compression || PNG_COMPRESSION;
  const targetWidth = options.imageWidth || null;
  const trimWhitespace = options.trimWhitespace || false;

  const metadata = await sharp(pageImageBuffer).metadata();
  const cropHeight = Math.max(1, Math.round(region.height));
  let cropTop = Math.max(0, Math.round(region.top));
  let actualHeight = Math.min(cropHeight, metadata.height - cropTop);

  // Whitespace trimming: detect and remove excessive white rows at top/bottom
  if (trimWhitespace && actualHeight > 1) {
    const trimResult = await detectWhitespaceRows(pageImageBuffer, cropTop, actualHeight, metadata.width);
    if (trimResult.topWhiteRows > 0 || trimResult.bottomWhiteRows > 0) {
      const retain = TRIM_RETAIN_MARGIN;
      const skipTop = Math.max(0, trimResult.topWhiteRows - retain);
      const skipBottom = Math.max(0, trimResult.bottomWhiteRows - retain);
      const contentHeight = actualHeight - skipTop - skipBottom;
      if (contentHeight >= 2) {
        cropTop = cropTop + skipTop;
        actualHeight = contentHeight;
      }
    }
  }

  let pipeline = sharp(pageImageBuffer)
    .extract({
      left: 0,
      top: cropTop,
      width: metadata.width,
      height: actualHeight,
    });

  // Resize to target width if specified and narrower than source
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

  const base64 = optimized.toString('base64');

  return {
    buffer: optimized,
    base64,
    sizeBytes: optimized.length,
    width: outputWidth,
    height: outputHeight,
  };
}

/**
 * Process a full page image (no splitting) - optimize and optionally resize.
 * When trimWhitespace is enabled:
 *  1. Trims top/bottom whitespace (returns trimmedTop for link coordinate correction)
 *  2. Collapses large inner whitespace gaps (returns rowMap for link Y-coordinate remapping)
 */
async function optimizeFullPage(pageImageBuffer, options = {}) {
  const compression = options.compression || PNG_COMPRESSION;
  const targetWidth = options.imageWidth || null;
  const trimWhitespace = options.trimWhitespace || false;
  const trimGapSize = options.trimGapSize || TRIM_INNER_MIN_GAP;
  const trimKeepPercent = options.trimKeepPercent != null ? options.trimKeepPercent : 30;

  const metadata = await sharp(pageImageBuffer).metadata();

  let cropTop = 0;
  let actualHeight = metadata.height;
  let trimmedTop = 0;
  let rowMap = null; // maps original row → output row (for inner gap collapse)

  // Whitespace trimming: detect and remove excessive white rows at top/bottom
  // Top: slider settings (trimGapSize detection + trimKeepPercent% retention)
  // Bottom: fixed TRIM_RETAIN_MARGIN px only (clean page-break cut)
  if (trimWhitespace && actualHeight > 1) {
    const trimResult = await detectWhitespaceRows(pageImageBuffer, 0, actualHeight, metadata.width);

    // Top: use slider settings (detect threshold + keep %)
    const topKeep = trimResult.topWhiteRows >= trimGapSize
      ? Math.max(1, Math.round(trimResult.topWhiteRows * trimKeepPercent / 100))
      : trimResult.topWhiteRows; // below threshold → keep all

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

  // Inner whitespace collapse: find large gaps within the content region and shrink them
  let processedBuffer = pageImageBuffer;
  if (trimWhitespace && actualHeight > trimGapSize * 2) {
    const innerResult = await collapseInnerWhitespace(pageImageBuffer, cropTop, actualHeight, metadata.width, trimGapSize, trimKeepPercent);
    if (innerResult) {
      processedBuffer = innerResult.buffer;
      actualHeight = innerResult.height;
      rowMap = innerResult.rowMap; // array mapping original rows to collapsed rows
      // processedBuffer is already extracted (cropTop applied), so reset cropTop
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

  const base64 = optimized.toString('base64');

  return {
    buffer: optimized,
    base64,
    sizeBytes: optimized.length,
    width: outputWidth,
    height: outputHeight,
    trimmedTop,
    rowMap,
  };
}

/**
 * Detect and collapse large inner whitespace gaps in a page region.
 * Returns { buffer, height, rowMap } where rowMap maps original-row → collapsed-row,
 * or null if no significant gaps were found.
 */
async function collapseInnerWhitespace(pageImageBuffer, top, height, width, minGap, keepPercent) {
  minGap = minGap || TRIM_INNER_MIN_GAP;
  keepPercent = keepPercent != null ? keepPercent : 30;
  // Get raw pixel data for the region
  const { data, info } = await sharp(pageImageBuffer)
    .extract({ left: 0, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const rowBytes = width * channels;
  const threshold = TRIM_WHITE_THRESHOLD;

  // Build sample columns
  const numSamples = Math.min(TRIM_SAMPLE_COLUMNS, width);
  const sampleCols = [];
  for (let i = 0; i < numSamples; i++) {
    sampleCols.push(Math.floor((i / numSamples) * width));
  }

  // Classify each row as white or content
  const isWhite = new Array(height);
  for (let row = 0; row < height; row++) {
    isWhite[row] = isRowWhite(data, row, rowBytes, channels, threshold, sampleCols);
  }

  // Find inner gaps: consecutive white rows >= minGap
  // (skip leading and trailing white runs, those are handled by top/bottom trim)
  const gaps = [];
  let firstContent = -1;
  let lastContent = -1;
  for (let row = 0; row < height; row++) {
    if (!isWhite[row]) {
      if (firstContent === -1) firstContent = row;
      lastContent = row;
    }
  }

  if (firstContent === -1) return null; // entirely white

  let gapStart = -1;
  for (let row = firstContent; row <= lastContent; row++) {
    if (isWhite[row]) {
      if (gapStart === -1) gapStart = row;
    } else {
      if (gapStart !== -1) {
        const gapLen = row - gapStart;
        if (gapLen >= minGap) {
          // Shrink gap inward by TRIM_SAFE_MARGIN to protect content at edges
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

  if (gaps.length === 0) return null; // no significant inner gaps

  // Build list of content strips (regions to keep) with collapsed gaps
  const strips = [];
  let currentStart = 0;

  for (const gap of gaps) {
    // Content strip before this gap
    if (gap.start > currentStart) {
      strips.push({ srcTop: currentStart, srcHeight: gap.start - currentStart });
    }
    // Collapsed gap: keep keepPercent% of the original gap
    const keepRows = Math.max(1, Math.round(gap.length * keepPercent / 100));
    const keepStart = gap.start + Math.floor((gap.length - keepRows) / 2);
    strips.push({ srcTop: keepStart, srcHeight: keepRows });
    currentStart = gap.end;
  }
  // Remaining content after last gap
  if (currentStart < height) {
    strips.push({ srcTop: currentStart, srcHeight: height - currentStart });
  }

  // Build rowMap: for each original row (relative to crop region), what's the output row
  const rowMap = new Float32Array(height);
  let outputY = 0;
  let stripIdx = 0;
  let inGap = false;
  let gapIdx = 0;

  // More precise approach: iterate through strips
  outputY = 0;
  for (const strip of strips) {
    for (let r = 0; r < strip.srcHeight; r++) {
      const origRow = strip.srcTop + r;
      if (origRow < height) {
        rowMap[origRow] = outputY + r;
      }
    }
    outputY += strip.srcHeight;
  }

  // Fill in rows that fall inside collapsed gap regions (map to the collapse point)
  for (const gap of gaps) {
    const keepRows = Math.max(1, Math.round(gap.length * keepPercent / 100));
    const keepStart = gap.start + Math.floor((gap.length - keepRows) / 2);
    const keepEnd = keepStart + keepRows;
    // Rows before keepStart in the gap: map to the start of the kept region
    for (let r = gap.start; r < keepStart; r++) {
      if (r < height) rowMap[r] = rowMap[keepStart] || 0;
    }
    // Rows after keepEnd in the gap: map to the end of the kept region
    for (let r = keepEnd; r < gap.end; r++) {
      if (r < height) rowMap[r] = rowMap[Math.min(keepEnd - 1, height - 1)] || 0;
    }
  }

  const totalHeight = strips.reduce((sum, s) => sum + s.srcHeight, 0);

  // Extract each strip as a PNG buffer, then composite onto a white canvas
  const compositeInputs = [];
  let destY = 0;
  for (const strip of strips) {
    const extracted = await sharp(pageImageBuffer)
      .extract({ left: 0, top: top + strip.srcTop, width, height: strip.srcHeight })
      .png()
      .toBuffer();
    compositeInputs.push({ input: extracted, top: destY, left: 0 });
    destY += strip.srcHeight;
  }

  // Create canvas with 4 channels (RGBA) to match input images, then output as PNG
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

/**
 * Stitch multiple page images vertically into a single tall image.
 * Input: array of { buffer, width, height } objects.
 * All pages are resized to the same width (the width of the first page).
 * Returns the composite image as { buffer, base64, sizeBytes, width, height }.
 */
async function stitchPages(pages, options = {}) {
  if (pages.length === 0) {
    throw new Error('stitchPages: no pages provided');
  }

  if (pages.length === 1) {
    // Single page — no stitching needed, just return as-is
    const base64 = pages[0].buffer.toString('base64');
    return {
      buffer: pages[0].buffer,
      base64,
      sizeBytes: pages[0].buffer.length,
      width: pages[0].width,
      height: pages[0].height,
    };
  }

  const targetWidth = pages[0].width;
  const compression = options.compression || PNG_COMPRESSION;

  // Calculate total height and prepare composite inputs
  let totalHeight = 0;
  const compositeInputs = [];

  for (const page of pages) {
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
  }

  // Create RGBA canvas and composite all pages (4ch to match collapseInnerWhitespace output)
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

  const base64 = stitched.toString('base64');

  return {
    buffer: stitched,
    base64,
    sizeBytes: stitched.length,
    width: targetWidth,
    height: totalHeight,
  };
}

/**
 * Detect contiguous near-white rows at the top and bottom of a region.
 * Uses column sampling for performance (checks TRIM_SAMPLE_COLUMNS per row).
 * Conservative: any non-white sample in a row marks the row as content.
 */
async function detectWhitespaceRows(pageImageBuffer, top, height, width) {
  const { data, info } = await sharp(pageImageBuffer)
    .extract({ left: 0, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const rowBytes = width * channels;
  const threshold = TRIM_WHITE_THRESHOLD;

  // Build evenly-spaced sample column indices
  const numSamples = Math.min(TRIM_SAMPLE_COLUMNS, width);
  const sampleCols = [];
  for (let i = 0; i < numSamples; i++) {
    sampleCols.push(Math.floor((i / numSamples) * width));
  }

  // Scan from top downward
  let topWhiteRows = 0;
  for (let row = 0; row < height; row++) {
    if (!isRowWhite(data, row, rowBytes, channels, threshold, sampleCols)) break;
    topWhiteRows++;
  }

  // Scan from bottom upward
  let bottomWhiteRows = 0;
  for (let row = height - 1; row >= topWhiteRows; row--) {
    if (!isRowWhite(data, row, rowBytes, channels, threshold, sampleCols)) break;
    bottomWhiteRows++;
  }

  return { topWhiteRows, bottomWhiteRows };
}

/**
 * Check if a pixel row is "white" by sampling specific columns.
 */
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

module.exports = { cropAndOptimize, optimizeFullPage, stitchPages };
