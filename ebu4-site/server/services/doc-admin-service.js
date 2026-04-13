const fs = require('fs');
const path = require('path');

/**
 * 主文档 Markdown 的读/写（章节级与整文件）。
 * 多主文档：按 slug 读写；SQLite 为 main_documents 表，文件模式为 main-docs/{slug}.md。
 */
function createDocAdminService(opts) {
  const {
    MD_PATH,
    backupKeepCount,
    reloadDocData,
    backupWithPrune,
    docMd,
    siteDatabase,
  } = opts;

  function readRawMarkdown(slug) {
    const s = slug || siteDatabase.getDefaultMainDocSlug();
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      const c = siteDatabase.getMainMarkdownForSlug(s);
      if (c != null && c !== '') return c;
    } else {
      const c = siteDatabase.getMainMarkdownForSlug(s);
      if (c != null && c !== '') return c;
    }
    if (s === siteDatabase.getDefaultMainDocSlug() && fs.existsSync(MD_PATH)) {
      try {
        return fs.readFileSync(MD_PATH, 'utf-8');
      } catch (_) {
        return '';
      }
    }
    return '';
  }

  function readSectionsFromDisk(slug) {
    try {
      const s = slug || siteDatabase.getDefaultMainDocSlug();
      if (siteDatabase && siteDatabase.isSiteSqlite()) {
        return siteDatabase.listSectionsForSlug(s);
      }
      const raw = readRawMarkdown(slug);
      if (!raw) return [];
      return docMd.parseSectionsFromRaw(raw);
    } catch (_) {
      return [];
    }
  }

  function persistSections(sections, slug) {
    const s = slug || siteDatabase.getDefaultMainDocSlug();
    const md = docMd.sectionsToMarkdown(sections);
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      siteDatabase.setMainMarkdownForSlug(s, md);
      reloadDocData();
      return;
    }
    const root = path.join(path.dirname(MD_PATH), 'main-docs');
    const fp = path.join(root, `${s}.md`);
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(fp)) {
      backupWithPrune(fp, backupKeepCount);
    } else if (fs.existsSync(MD_PATH) && s === siteDatabase.getDefaultMainDocSlug()) {
      backupWithPrune(MD_PATH, backupKeepCount);
    }
    fs.writeFileSync(fp, md, 'utf-8');
    reloadDocData();
  }

  function writeFullMarkdown(content, slug) {
    const s = slug || siteDatabase.getDefaultMainDocSlug();
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      siteDatabase.setMainMarkdownForSlug(s, content);
      reloadDocData();
      return;
    }
    const root = path.join(path.dirname(MD_PATH), 'main-docs');
    const fp = path.join(root, `${s}.md`);
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(fp)) {
      backupWithPrune(fp, backupKeepCount);
    } else if (fs.existsSync(MD_PATH) && s === siteDatabase.getDefaultMainDocSlug()) {
      backupWithPrune(MD_PATH, backupKeepCount);
    }
    fs.writeFileSync(fp, content, 'utf-8');
    reloadDocData();
  }

  return {
    readSectionsFromDisk,
    persistSections,
    writeFullMarkdown,
  };
}

module.exports = createDocAdminService;
