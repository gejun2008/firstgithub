const fs = require('fs');
const path = require('path');

class ProgressManager {
  constructor(progressFile) {
    this.progressFile = progressFile;
  }

  async readAll() {
    try {
      const raw = await fs.promises.readFile(this.progressFile, 'utf8');
      return JSON.parse(raw || '{}');
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.#writeAll({});
        return {};
      }
      throw error;
    }
  }

  async saveProgress(entry) {
    const data = await this.readAll();
    const { bookId, chapterId, positionSeconds } = entry;
    if (!bookId) {
      throw new Error('saveProgress: bookId is required');
    }
    data[bookId] = {
      chapterId: chapterId ?? null,
      positionSeconds: typeof positionSeconds === 'number' ? positionSeconds : 0,
      updatedAt: new Date().toISOString(),
    };
    await this.#writeAll(data);
    return { bookId, ...data[bookId] };
  }

  async getProgress(bookId) {
    const data = await this.readAll();
    return data[bookId] || null;
  }

  async #writeAll(data) {
    const dir = path.dirname(this.progressFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(this.progressFile, JSON.stringify(data, null, 2), 'utf8');
  }
}

module.exports = ProgressManager;
