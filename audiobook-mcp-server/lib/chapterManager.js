const fs = require('fs');
const path = require('path');

class ChapterManager {
  constructor(booksDir) {
    this.booksDir = booksDir;
  }

  async listChapters(bookId) {
    const resolved = path.join(this.booksDir, `${bookId}.json`);
    const raw = await fs.promises.readFile(resolved, 'utf8');
    const book = JSON.parse(raw);
    return {
      bookId: book.id,
      title: book.title,
      author: book.author,
      chapters: book.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        text: chapter.text,
        wordCount: chapter.text.split(/\s+/).filter(Boolean).length,
      })),
    };
  }
}

module.exports = ChapterManager;
