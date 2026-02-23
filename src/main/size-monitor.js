const { EMAIL_SIZE_LIMIT, EMAIL_SIZE_WARNING, EMAIL_SIZE_DANGER } = require('../shared/constants');

class SizeMonitor {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalBytes = 0;
    this.pageBytes = [];
    this.htmlOverhead = 5000; // estimated base HTML template size
  }

  addImage(sizeBytes, pageIndex) {
    // 이메일에서 base64 인코딩 시 실제 크기 = ceil(bytes/3)*4
    const emailBytes = Math.ceil(sizeBytes / 3) * 4;
    this.totalBytes += emailBytes;
    if (!this.pageBytes[pageIndex]) {
      this.pageBytes[pageIndex] = 0;
    }
    this.pageBytes[pageIndex] += emailBytes;
    return this.getStatus();
  }

  getStatus() {
    const total = this.totalBytes + this.htmlOverhead;
    const currentMB = (total / (1024 * 1024)).toFixed(1);
    const limitMB = (EMAIL_SIZE_LIMIT / (1024 * 1024)).toFixed(0);

    let level = 'ok';
    let message = '';

    if (total > EMAIL_SIZE_LIMIT) {
      level = 'exceeded';
      message = `이메일 용량 한도(${limitMB}MB)를 초과했습니다. 페이지 분할을 권장합니다.`;
    } else if (total > EMAIL_SIZE_DANGER) {
      level = 'danger';
      message = `이메일 용량 한도에 근접했습니다 (${currentMB}/${limitMB}MB)`;
    } else if (total > EMAIL_SIZE_WARNING) {
      level = 'warning';
      message = `용량 주의: ${currentMB}/${limitMB}MB`;
    }

    return {
      level,
      message,
      currentBytes: total,
      currentMB: parseFloat(currentMB),
      limitMB: parseInt(limitMB),
      percent: Math.min(100, (total / EMAIL_SIZE_LIMIT) * 100),
    };
  }

  getPageStats() {
    return this.pageBytes.map((bytes, i) => ({
      page: i + 1,
      sizeKB: (bytes / 1024).toFixed(0),
    }));
  }
}

module.exports = { SizeMonitor };
