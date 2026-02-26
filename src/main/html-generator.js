/**
 * Generate email-compatible HTML from stitched image chunks with image maps.
 * @param {Array} chunks - Array of { base64, width, height, areas, mapName }
 * @param {number} [displayWidth] - HTML display width in pixels (defaults to image width)
 * @returns {{ previewHtml: string, emailHtml: string }}
 */
function generateHtml(chunks, displayWidth) {
  // Use the actual image width as display width (matches image scale setting)
  const dw = displayWidth || (chunks.length > 0 ? chunks[0].width : 600);
  const bodyContent = chunks.map((chunk, idx) => generateChunkHtml(chunk, idx, dw)).join('\n');

  const emailHtml = buildEmailShell(bodyContent, dw);
  const previewHtml = buildPreviewShell(bodyContent, dw);

  return { previewHtml, emailHtml };
}

function buildEmailShell(bodyContent, dw) {
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style type="text/css">
body,table,td,a{margin:0;padding:0;border:0;border-spacing:0;}
body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
td{mso-line-height-rule:exactly;}
img{border:0;display:block;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a{display:block;text-decoration:none;border:0;line-height:0;font-size:0;}
@media (prefers-color-scheme:dark){
.email-bg{background-color:#1a1a1a!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;" class="email-bg">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-collapse:collapse;" class="email-bg">
<tr>
<td align="center" style="padding:0;border:none;">
<table role="presentation" width="${dw}" cellpadding="0" cellspacing="0" border="0" style="max-width:${dw}px;width:100%;border-collapse:collapse;">
${bodyContent}
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function buildPreviewShell(bodyContent, dw) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Joins PDF2Email - Preview</title>
<style>
body{margin:0;padding:20px;background:#f0f0f0;display:flex;justify-content:center;}
.container{background:#fff;box-shadow:0 2px 10px rgba(0,0,0,0.1);max-width:${dw}px;}
img{display:block;max-width:100%;height:auto;}
@media (prefers-color-scheme:dark){
body{background:#333;}
.container{background:#1a1a1a;}
}
</style>
</head>
<body>
<div class="container">
<table role="presentation" width="${dw}" cellpadding="0" cellspacing="0" border="0" style="max-width:${dw}px;width:100%;">
${bodyContent}
</table>
</div>
</body>
</html>`;
}

/**
 * Generate HTML for a single stitched image chunk with image map.
 */
function generateChunkHtml(chunk, chunkIdx, dw) {
  const displayHeight = Math.round(chunk.height * (dw / chunk.width));
  const hasLinks = chunk.areas && chunk.areas.length > 0;
  const usemapAttr = hasLinks ? ` usemap="#${chunk.mapName}"` : '';

  // Image map coords must match the displayed image size, not the source pixel size.
  // Scale factor: displayWidth / actual image pixel width
  const coordScale = dw / chunk.width;

  // Use external URL if available (R2 mode), otherwise fallback to base64
  const imgSrc = chunk.src || `data:image/png;base64,${chunk.base64}`;

  let html = `<tr>
<td style="padding:0;margin:0;line-height:0;font-size:0;border:none;">
<img src="${imgSrc}" width="${dw}" height="${displayHeight}" alt="" style="display:block;width:100%;height:auto;border:0;outline:none;margin:0;padding:0;"${usemapAttr} />`;

  if (hasLinks) {
    html += `\n<map name="${chunk.mapName}">`;
    for (const area of chunk.areas) {
      const sx1 = Math.round(area.x1 * coordScale);
      const sy1 = Math.round(area.y1 * coordScale);
      const sx2 = Math.round(area.x2 * coordScale);
      const sy2 = Math.round(area.y2 * coordScale);
      html += `\n<area shape="rect" coords="${sx1},${sy1},${sx2},${sy2}" href="${escapeHtml(area.href)}" target="_blank" alt="${escapeHtml(area.alt)}" />`;
    }
    html += `\n</map>`;
  }

  html += `\n</td>
</tr>`;

  return html;
}

/**
 * Generate Outlook-compatible email HTML from per-page images with <a><img></a> pattern.
 * Unlike image maps (<map>/<area>), this pattern survives Outlook's HTML sanitization.
 *
 * @param {Array} pages - Array of { src, width, height, firstLink }
 * @param {number} [displayWidth] - HTML display width in pixels
 * @returns {string} Complete email HTML string
 */
function generateEmailUrlHtml(pages, displayWidth) {
  const dw = displayWidth || (pages.length > 0 ? pages[0].width : 600);

  const bodyRows = pages.map(page => {
    const displayHeight = Math.round(page.height * (dw / page.width));
    const imgTag = `<img src="${page.src}" width="${dw}" height="${displayHeight}" alt="" style="display:block;width:100%;height:auto;border:0;outline:none;margin:0;padding:0;" />`;

    if (page.firstLink) {
      return `<tr>
<td style="padding:0;margin:0;line-height:0;font-size:0;border:none;mso-line-height-rule:exactly;"><a href="${escapeHtml(page.firstLink)}" target="_blank" style="display:block;text-decoration:none;border:0;line-height:0;font-size:0;margin:0;padding:0;">${imgTag}</a></td>
</tr>`;
    }

    return `<tr>
<td style="padding:0;margin:0;line-height:0;font-size:0;border:none;mso-line-height-rule:exactly;">${imgTag}</td>
</tr>`;
  }).join('\n');

  return buildEmailShell(bodyRows, dw);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { generateHtml, generateEmailUrlHtml };
