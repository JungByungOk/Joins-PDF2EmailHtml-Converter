module.exports = {
  // PDF rendering
  TARGET_DPI: 250,
  PDF_DPI: 72,
  get SCALE_FACTOR() { return this.TARGET_DPI / this.PDF_DPI; }, // ~2.083

  // Image output
  IMAGE_WIDTH_PERCENT: 135, // default output width as % of source image width
  PNG_COLORS: 256,
  PNG_COMPRESSION: 9,

  // Email size limits (bytes)
  EMAIL_SIZE_LIMIT: 25 * 1024 * 1024,
  EMAIL_SIZE_WARNING: 20 * 1024 * 1024,
  EMAIL_SIZE_DANGER: 24 * 1024 * 1024,

  // Page stitching
  MAX_STITCH_PAGES: 30, // max pages per stitched image chunk
  SEPARATOR_HEIGHT: 2,  // separator line height between pages (px)
  SEPARATOR_COLOR: { r: 204, g: 204, b: 204, alpha: 1 }, // light gray

  // Whitespace trimming
  TRIM_WHITE_THRESHOLD: 250,    // RGB each channel >= this counts as "white"
  TRIM_RETAIN_MARGIN: 20,       // pixels of whitespace to keep at bottom after trimming
  TRIM_SAMPLE_COLUMNS: 50,      // columns to sample per row (higher = more accurate, catches thin text)
  TRIM_SAFE_MARGIN: 4,          // extra content rows to protect at gap edges (prevents text clipping)
  TRIM_INNER_MIN_GAP: 50,       // minimum consecutive white rows to consider as inner gap (in source pixels)
  TRIM_INNER_KEEP: 15,          // white rows to retain when collapsing an inner gap

  // Optimization presets
  PRESETS: {
    text: { dpi: 150, imageWidth: 600, colors: 256, compression: 9, label: '텍스트 최적화' },
    quality: { dpi: 200, imageWidth: 1000, colors: 256, compression: 6, label: '고품질' },
    bulk: { dpi: 120, imageWidth: 400, colors: 128, compression: 9, label: '대량 페이지' },
  },
};
