const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');

let client = null;
let config = null;

/**
 * Initialize or re-initialize the R2 client with given settings.
 */
function init(settings) {
  config = settings;
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
}

/**
 * Test connection to the R2 bucket.
 * @returns {Promise<boolean>}
 */
async function testConnection(settings) {
  const testClient = new S3Client({
    region: 'auto',
    endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
  await testClient.send(new HeadBucketCommand({ Bucket: settings.bucketName }));
  return true;
}

/**
 * Upload an image buffer to R2.
 * @param {Buffer} buffer - PNG image buffer
 * @param {string} key - Object key (e.g. "report_2025/stitched_1.png")
 * @returns {Promise<string>} Public URL of the uploaded image
 */
async function uploadImage(buffer, key) {
  if (!client || !config) throw new Error('R2 클라이언트가 초기화되지 않았습니다.');

  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
  }));

  // Build public URL: custom domain or r2.dev subdomain
  const baseUrl = config.publicUrl.replace(/\/+$/, '');
  return `${baseUrl}/${key}`;
}

/**
 * Check if R2 is configured and ready.
 */
function isConfigured() {
  return !!(client && config);
}

module.exports = { init, testConnection, uploadImage, isConfigured };
