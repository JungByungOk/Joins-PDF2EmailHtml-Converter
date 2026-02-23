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

  try {
    fs.mkdirSync(path.join(outputDir, 'images'), { recursive: true });
  } catch (err) {
    throw new Error(`출력 폴더 생성 실패 (${outputDir}): ${err.message}`);
  }
  return outputDir;
}

/**
 * Write HTML files and metadata to the output folder.
 */
async function writeOutput(outputDir, { previewHtml, emailHtml, images, metadata }) {
  try {
    await Promise.all([
      fs.promises.writeFile(path.join(outputDir, 'preview.html'), previewHtml, 'utf-8'),
      fs.promises.writeFile(path.join(outputDir, 'email.html'), emailHtml, 'utf-8'),
      fs.promises.writeFile(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8'),
      ...images.map(img =>
        fs.promises.writeFile(path.join(outputDir, 'images', img.filename), img.buffer)
      ),
    ]);
  } catch (err) {
    throw new Error(`파일 저장 실패: ${err.message}`);
  }
  return outputDir;
}

module.exports = { createOutputFolder, writeOutput };
