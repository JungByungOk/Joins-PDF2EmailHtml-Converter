const { optimizeFullPage, stitchPages } = require('./image-processor');
const { generateHtml } = require('./html-generator');
const { createOutputFolder, writeOutput } = require('./file-manager');
const { SizeMonitor } = require('./size-monitor');
const { MAX_STITCH_PAGES, IMAGE_WIDTH_PERCENT } = require('../shared/constants');

class PdfPipeline {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.sizeMonitor = new SizeMonitor();
    this.pageImages = [];  // [{ buffer, width, height }] per page
    this.pageLinks = [];   // [{ links: [...], height }] per page (scaled coordinates)
    this.allImages = [];
    this.pdfName = '';
  }

  reset() {
    this.sizeMonitor.reset();
    this.pageImages = [];
    this.pageLinks = [];
    this.allImages = [];
    this.pdfName = '';
  }

  /**
   * Process a single page: optimize full page image and scale link coordinates.
   * @param {object} data - { pageIndex, pngBuffer, links, pagePixelWidth, pagePixelHeight, totalPages, imageWidth, trimWhitespace, trimGapSize }
   * @param {object} [options] - Preset overrides
   */
  async processPage(data, options = {}) {
    const { pageIndex, pngBuffer, links, pagePixelWidth, pagePixelHeight, totalPages, imageWidth, trimWhitespace, trimGapSize, trimKeepPercent } = data;
    const buffer = Buffer.from(pngBuffer);

    // Optimize the full page image (with optional whitespace trimming)
    const result = await optimizeFullPage(buffer, {
      ...options,
      imageWidth: imageWidth || Math.round(pagePixelWidth * IMAGE_WIDTH_PERCENT / 100),
      trimWhitespace,
      trimGapSize,
      trimKeepPercent,
    });

    // Store optimized page image
    this.pageImages[pageIndex] = {
      buffer: result.buffer,
      width: result.width,
      height: result.height,
    };

    // Scale link coordinates from render DPI pixels to resized image pixels
    const scaleX = result.width / pagePixelWidth;
    const trimmedTop = result.trimmedTop || 0;
    const rowMap = result.rowMap || null;
    // sourceHeight = height before resize (after trim + inner collapse)
    const sourceHeight = rowMap
      ? result.height * (pagePixelWidth / result.width) // reverse the resize ratio
      : (result.height / scaleX);

    const scaledLinks = (links || []).map(link => {
      // Step 1: adjust Y for top trim (in source pixels)
      let srcTop = link.top - trimmedTop;
      let srcBottom = link.bottom - trimmedTop;

      // Step 2: if inner whitespace was collapsed, remap Y through rowMap
      if (rowMap) {
        const clampRow = (r) => Math.max(0, Math.min(Math.round(r), rowMap.length - 1));
        srcTop = rowMap[clampRow(srcTop)];
        srcBottom = rowMap[clampRow(srcBottom)];
      }

      // Step 3: scale to resized image pixels
      return {
        url: link.url,
        text: link.text || link.url,
        left: link.left * scaleX,
        top: srcTop * scaleX,
        right: link.right * scaleX,
        bottom: srcBottom * scaleX,
      };
    }).filter(link => link.bottom > 0 && link.top < result.height); // Filter out trimmed-away links

    this.pageLinks[pageIndex] = {
      links: scaledLinks,
      height: result.height,
    };

    // Track size (buffer byte size → SizeMonitor가 base64 이메일 크기로 환산)
    this.sizeMonitor.addImage(result.sizeBytes, pageIndex);

    // Emit progress
    const sizeStatus = this.sizeMonitor.getStatus();
    this.mainWindow.webContents.send('progress', {
      pageIndex,
      totalPages,
      percent: Math.round(((pageIndex + 1) / totalPages) * 100),
    });
    this.mainWindow.webContents.send('size-update', sizeStatus);

    return { pageIndex, sizeStatus };
  }

  /**
   * Generate final output: stitch pages into chunks, build image maps, generate HTML.
   */
  async generateOutput(pdfName, options = {}) {
    this.pdfName = pdfName || 'output';
    const useSeparator = options.separator || false;

    // Filter out any empty slots (in case pages were processed out of order)
    const validPages = this.pageImages.filter(Boolean);

    if (validPages.length === 0) {
      throw new Error('처리된 페이지가 없습니다. 먼저 processPage를 호출하세요.');
    }

    // Split into chunks of MAX_STITCH_PAGES
    const chunks = [];
    for (let i = 0; i < validPages.length; i += MAX_STITCH_PAGES) {
      const chunkPages = validPages.slice(i, i + MAX_STITCH_PAGES);
      const chunkStartIndex = i;

      // Stitch pages in this chunk into one image
      const stitched = await stitchPages(chunkPages, { separator: useSeparator });

      // Calculate cumulative Y offsets for link coordinate mapping
      let cumulativeY = 0;
      const chunkAreas = [];

      for (let j = 0; j < chunkPages.length; j++) {
        const globalPageIndex = chunkStartIndex + j;
        const pageLink = this.pageLinks[globalPageIndex];

        if (pageLink && pageLink.links.length > 0) {
          // Map link coords: add cumulative Y offset
          // Image width = HTML display width (no extra scaling needed)
          for (const link of pageLink.links) {
            chunkAreas.push({
              x1: Math.round(link.left),
              y1: Math.round(link.top + cumulativeY),
              x2: Math.round(link.right),
              y2: Math.round(link.bottom + cumulativeY),
              href: link.url,
              alt: link.text || link.url,
            });
          }
        }

        cumulativeY += chunkPages[j].height;
        // Add separator height between pages (not after the last page)
        if (useSeparator && j < chunkPages.length - 1) {
          cumulativeY += stitched.separatorHeight;
        }
      }

      // Store stitched image for file output
      const chunkIndex = chunks.length;
      const filename = `stitched_${chunkIndex + 1}.png`;
      this.allImages.push({ filename, buffer: stitched.buffer });

      chunks.push({
        base64: stitched.base64,
        width: stitched.width,
        height: stitched.height,
        areas: chunkAreas,
        mapName: `map_${chunkIndex}`,
      });
    }

    // Generate HTML using image map approach
    // displayWidth: PDF 원본 크기 × 배율(%)로 계산된 DPI 독립 표시 폭
    const displayWidth = options.displayWidth || (chunks.length > 0 ? chunks[0].width : 600);
    const { previewHtml, emailHtml } = generateHtml(chunks, displayWidth);

    const outputDir = createOutputFolder(this.pdfName);
    const sizeStatus = this.sizeMonitor.getStatus();

    const totalLinks = this.pageLinks.reduce((sum, pl) =>
      sum + (pl && pl.links ? pl.links.length : 0), 0);

    const metadata = {
      sourcePdf: this.pdfName,
      createdAt: new Date().toISOString(),
      pageCount: validPages.length,
      linkCount: totalLinks,
      chunkCount: chunks.length,
      totalSizeMB: sizeStatus.currentMB,
      pageStats: this.sizeMonitor.getPageStats(),
    };

    await writeOutput(outputDir, {
      previewHtml,
      emailHtml,
      images: this.allImages,
      metadata,
    });

    // 출력 완료 후 대형 버퍼 참조 즉시 해제 (GC 가능하도록)
    this.pageImages = [];
    this.pageLinks = [];
    this.allImages = [];

    return {
      outputDir,
      metadata,
      sizeStatus,
    };
  }
}

module.exports = { PdfPipeline };
