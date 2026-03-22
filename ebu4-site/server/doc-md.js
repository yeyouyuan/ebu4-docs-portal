/**
 * 解析 ebu4-docs.md：按一级标题 # 分章（与 index.js 逻辑一致）
 */
const { ORDER } = require('./security-levels');

const SEC_RE = /<!--\s*ebu4-security:\s*([a-z]+)\s*-->/i;

/** 从章节正文提取 `<!-- ebu4-security: level -->` 并剥离（前台不展示该标记） */
function extractSecurityMeta(content) {
  const raw = String(content || '');
  const m = raw.match(SEC_RE);
  let securityLevel = 'public';
  if (m) {
    const s = m[1].toLowerCase();
    if (ORDER.includes(s)) securityLevel = s;
  }
  const stripped = m ? raw.replace(SEC_RE, '').replace(/^\s*\n/, '') : raw;
  return { securityLevel, content: stripped };
}

function slugFromTitle(title) {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-');
}

function parseSectionsFromRaw(raw) {
  const lines = raw.split('\n');
  const sections = [];
  let current = null;
  let lineNum = 0;
  let inCodeBlock = false;

  for (const line of lines) {
    lineNum++;

    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (current) current.content += line + '\n';
      continue;
    }
    if (inCodeBlock) {
      if (current) current.content += line + '\n';
      continue;
    }

    const h1Match = line.match(/^# (.+)/);
    if (h1Match) {
      if (current) {
        current.endLine = lineNum - 1;
        const ex = extractSecurityMeta(current.content);
        current.content = ex.content;
        current.securityLevel = ex.securityLevel;
        sections.push(current);
      }
      current = {
        id: sections.length,
        title: h1Match[1].trim(),
        slug: slugFromTitle(h1Match[1]),
        startLine: lineNum,
        content: '',
        toc: [],
      };
    }
    if (current) {
      current.content += line + '\n';
      const h3Match = line.match(/^\s{0,3}###\s+(.+)/);
      const h2Match = line.match(/^\s{0,3}##\s+(.+)/);
      if (h3Match) {
        current.toc.push({
          level: 3,
          text: h3Match[1].trim(),
          line: lineNum - current.startLine,
        });
      } else if (h2Match) {
        current.toc.push({
          level: 2,
          text: h2Match[1].trim(),
          line: lineNum - current.startLine,
        });
      }
    }
  }
  if (current) {
    current.endLine = lineNum;
    const ex = extractSecurityMeta(current.content);
    current.content = ex.content;
    current.securityLevel = ex.securityLevel;
    sections.push(current);
  }
  return sections;
}

function sectionsToMarkdown(sections) {
  if (!sections.length) return '';
  const parts = sections.map((s) => String(s.content || '').replace(/\s+$/, ''));
  return parts.join('\n\n') + '\n';
}

/** 单章内容必须且仅能解析出一个一级章节（否则保存会破坏文件结构） */
function assertSingleSectionBlock(content) {
  const trimmed = String(content || '').replace(/^\uFEFF/, '');
  const secs = parseSectionsFromRaw(trimmed);
  if (secs.length === 0) {
    const err = new Error('内容须以一级标题 # 开头');
    err.code = 'VALIDATION';
    throw err;
  }
  if (secs.length > 1) {
    const err = new Error('一章内只能有一个一级标题 #，请拆成多章或使用 ## / ###');
    err.code = 'VALIDATION';
    throw err;
  }
  return secs[0];
}

function reindexSections(sections) {
  return sections.map((s, i) => Object.assign({}, s, { id: i }));
}

function replaceSection(sections, id, newContent) {
  const next = assertSingleSectionBlock(newContent);
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) {
    const err = new Error('章节不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const copy = sections.slice();
  copy[idx] = Object.assign({}, next, { id: idx });
  return reindexSections(copy);
}

function deleteSection(sections, id) {
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) {
    const err = new Error('章节不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (sections.length <= 1) {
    const err = new Error('至少保留一个章节');
    err.code = 'VALIDATION';
    throw err;
  }
  const copy = sections.filter((_, i) => i !== idx);
  return reindexSections(copy);
}

/** afterId: null 插到最前；数字表示插在该 id 对应章节之后。返回 { sections, insertedId } */
function insertSection(sections, afterId, newContent) {
  const next = assertSingleSectionBlock(newContent);
  const copy = sections.slice();
  let insertAt = 0;
  if (afterId != null && afterId !== '') {
    const idx = copy.findIndex((s) => s.id === Number(afterId));
    if (idx === -1) {
      const err = new Error('参照章节不存在');
      err.code = 'NOT_FOUND';
      throw err;
    }
    insertAt = idx + 1;
  }
  copy.splice(insertAt, 0, Object.assign({}, next, { id: insertAt }));
  const reindexed = reindexSections(copy);
  return { sections: reindexed, insertedId: insertAt };
}

function reorderSections(sections, orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length !== sections.length) {
    const err = new Error('order 须包含全部章节 id');
    err.code = 'VALIDATION';
    throw err;
  }
  const set = new Set(orderedIds);
  if (set.size !== orderedIds.length) {
    const err = new Error('order 中有重复 id');
    err.code = 'VALIDATION';
    throw err;
  }
  const byId = new Map(sections.map((s) => [s.id, s]));
  const next = [];
  for (const oid of orderedIds) {
    const s = byId.get(oid);
    if (!s) {
      const err = new Error('无效的章节 id：' + oid);
      err.code = 'VALIDATION';
      throw err;
    }
    next.push(s);
  }
  return reindexSections(next);
}

function moveSection(sections, id, delta) {
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) {
    const err = new Error('章节不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const j = idx + delta;
  if (j < 0 || j >= sections.length) return sections.slice();
  const copy = sections.slice();
  const t = copy[idx];
  copy[idx] = copy[j];
  copy[j] = t;
  return reindexSections(copy);
}

module.exports = {
  parseSectionsFromRaw,
  extractSecurityMeta,
  sectionsToMarkdown,
  slugFromTitle,
  assertSingleSectionBlock,
  replaceSection,
  deleteSection,
  insertSection,
  reorderSections,
  moveSection,
  reindexSections,
};
