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
  const MAIN_DOC_HISTORY_KEEP = 100;

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

  function persistSections(sections, slug, historyMeta) {
    const s = slug || siteDatabase.getDefaultMainDocSlug();
    const beforeRaw =
      siteDatabase && siteDatabase.isSiteSqlite()
        ? siteDatabase.getMainMarkdownForSlug(s) || ''
        : '';
    const md = docMd.sectionsToMarkdown(sections);
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      if (beforeRaw !== md && typeof siteDatabase.appendMainDocHistory === 'function') {
        siteDatabase.appendMainDocHistory({
          slug: s,
          content: beforeRaw,
          source: historyMeta && historyMeta.source ? historyMeta.source : 'docs.sections.persist',
          actorUserId: historyMeta && historyMeta.actorUserId,
          actorUsername: historyMeta && historyMeta.actorUsername,
          summary: historyMeta && historyMeta.summary,
        });
        if (typeof siteDatabase.pruneMainDocHistory === 'function') {
          siteDatabase.pruneMainDocHistory(s, MAIN_DOC_HISTORY_KEEP);
        }
      }
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

  function writeFullMarkdown(content, slug, historyMeta) {
    const s = slug || siteDatabase.getDefaultMainDocSlug();
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      const body = content != null ? String(content) : '';
      const beforeRaw = siteDatabase.getMainMarkdownForSlug(s) || '';
      if (beforeRaw !== body && typeof siteDatabase.appendMainDocHistory === 'function') {
        siteDatabase.appendMainDocHistory({
          slug: s,
          content: beforeRaw,
          source: historyMeta && historyMeta.source ? historyMeta.source : 'docs.main.full_markdown',
          actorUserId: historyMeta && historyMeta.actorUserId,
          actorUsername: historyMeta && historyMeta.actorUsername,
          summary: historyMeta && historyMeta.summary,
        });
        if (typeof siteDatabase.pruneMainDocHistory === 'function') {
          siteDatabase.pruneMainDocHistory(s, MAIN_DOC_HISTORY_KEEP);
        }
      }
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
