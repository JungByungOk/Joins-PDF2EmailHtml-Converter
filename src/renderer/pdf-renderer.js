import * as pdfjsLib from 'pdfjs-dist';
// Webpack asset/resource rule emits the file and returns its URL
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const PDF_DPI = 72;

/**
 * Load a PDF file and return the document proxy.
 * @param {Uint8Array} data
 * @returns {Promise<PDFDocumentProxy>}
 */
export async function loadPdf(data) {
  const loadingTask = pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableAutoFetch: true,
    disableStream: true,
  });
  return loadingTask.promise;
}

/**
 * Render a single page to a canvas and extract link annotations.
 * Also extracts all text lines within link band regions so the HTML generator
 * can reproduce the text layout with real <a> tags.
 *
 * @param {PDFDocumentProxy} pdfDoc
 * @param {number} pageNumber - 1-based page number
 * @param {HTMLCanvasElement} canvas
 * @param {number} [dpi=300] - Rendering DPI
 */
export async function renderPage(pdfDoc, pageNumber, canvas, dpi = 300) {
  const scale = dpi / PDF_DPI;
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  // Extract annotations and text content
  const annotations = await page.getAnnotations();
  const textContent = await page.getTextContent();
  const textItems = textContent.items;
  const pdfViewport1x = page.getViewport({ scale: 1 });
  const pdfPageHeight = pdfViewport1x.height;
  const pdfPageWidth = pdfViewport1x.width;

  // Build links array with text and font size info
  const links = [];
  for (const anno of annotations) {
    if (anno.subtype === 'Link' && anno.url) {
      const rect = anno.rect; // PDF coords [x1,y1,x2,y2], bottom-left origin

      // Find text items within link rectangle
      let linkText = '';
      let fontSize = 12;
      for (const item of textItems) {
        if (item.transform) {
          const tx = item.transform[4];
          const ty = item.transform[5];
          if (tx >= rect[0] - 2 && tx <= rect[2] + 2 &&
              ty >= rect[1] - 2 && ty <= rect[3] + 2) {
            linkText += item.str;
            fontSize = Math.abs(item.transform[0]) || fontSize;
          }
        }
      }

      links.push({
        url: anno.url,
        text: linkText || anno.url,
        fontSize: Math.round(fontSize),
        // Pixel coords (top-left origin) at render DPI
        left: Math.floor(rect[0] * scale),
        top: Math.floor((pdfPageHeight - rect[3]) * scale),
        right: Math.ceil(rect[2] * scale),
        bottom: Math.ceil((pdfPageHeight - rect[1]) * scale),
        // PDF coords for text line matching
        pdfRect: rect,
      });
    }
  }

  // For each link, collect text items on the same line (same Y) that are
  // OUTSIDE the link rect but near it horizontally. These are labels like
  // "사내 챗봇:" that precede the URL on the same line.
  for (const link of links) {
    const rect = link.pdfRect;
    const lineY1 = rect[1] - 2;
    const lineY2 = rect[3] + 2;

    // Find all text items on the same line
    const lineItems = [];
    for (const item of textItems) {
      if (!item.transform) continue;
      const ty = item.transform[5];
      if (ty >= lineY1 && ty <= lineY2) {
        lineItems.push({
          str: item.str,
          x: item.transform[4],
          fontSize: Math.abs(item.transform[0]) || 12,
        });
      }
    }

    // Sort by x position
    lineItems.sort((a, b) => a.x - b.x);

    // Build prefix (text before link) and suffix (text after link)
    let prefix = '';
    let suffix = '';
    let prefixStartX = null; // PDF coordinate of first prefix text item
    for (const item of lineItems) {
      if (item.x < rect[0] - 2) {
        if (prefixStartX === null) {
          prefixStartX = item.x;
        }
        prefix += item.str;
      } else if (item.x > rect[2] + 2) {
        suffix += item.str;
      }
    }

    link.prefix = prefix.trim();
    link.suffix = suffix.trim();
    // Store the pixel X position where the line text starts (prefix or link)
    if (prefixStartX !== null) {
      link.lineStartLeft = Math.floor(prefixStartX * scale);
    } else {
      link.lineStartLeft = link.left; // no prefix, line starts at link
    }
    // Clean up - don't send pdfRect over IPC
    delete link.pdfRect;
  }

  // Convert canvas to ArrayBuffer for efficient IPC transfer (no Base64 overhead)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const pngArrayBuffer = await blob.arrayBuffer();

  return {
    pngBuffer: pngArrayBuffer,  // ArrayBuffer (Base64 인코딩 불필요)
    links,
    pagePixelWidth: Math.round(viewport.width),
    pagePixelHeight: Math.round(viewport.height),
    pdfPageWidthPt: pdfPageWidth,
  };
}
