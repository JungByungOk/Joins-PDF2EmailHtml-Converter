const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Create a timestamped output folder.
 * @param {string} pdfName - Original PDF filename (without extension)
 * @returns {string} Path to created output folder
 */
function createOutputFolder(pdfName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const folderName = `${pdfName}_${timestamp}`;
  const outputDir = path.join(app.getPath('documents'), 'pdf2email', folderName);

  fs.mkdirSync(path.join(outputDir, 'images'), { recursive: true });
  return outputDir;
}

/**
 * Write HTML files and metadata to the output folder.
 */
function writeOutput(outputDir, { previewHtml, emailHtml, images, metadata }) {
  // Write HTML files
  fs.writeFileSync(path.join(outputDir, 'preview.html'), previewHtml, 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'email.html'), emailHtml, 'utf-8');

  // Write individual image files
  for (const img of images) {
    fs.writeFileSync(
      path.join(outputDir, 'images', img.filename),
      img.buffer
    );
  }

  // Write metadata
  fs.writeFileSync(
    path.join(outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );

  return outputDir;
}

module.exports = { createOutputFolder, writeOutput };
