function normalizeDate(value) {
  const s = value != null ? String(value).trim() : '';
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch (_) {
    return '';
  }
}

function safeTrim(value, max) {
  const s = value != null ? String(value).trim() : '';
  if (!max) return s;
  return s.slice(0, max);
}

function cleanLine(line) {
  return String(line || '')
    .replace(/[\t\r]+/g, ' ')
    .replace(/[•·▪◦●]/g, ' ')
    .replace(/^[\s\-—_=#*+\d.、()（）【】\[\]]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForDedupe(line) {
  return String(line || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '');
}

function shouldIgnoreLine(line) {
  if (!line) return true;
  if (line.length < 4) return true;
  if (/^(今日|今天|本日|本周)?(工作|日报|总结|计划|内容|情况|记录)$/i.test(line)) return true;
  if (/^(暂无|无|同上|略)$/i.test(line)) return true;
  return false;
}

function splitContentToLines(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/[；;]/g, '\n')
    .replace(/[。!?！？]/g, '\n')
    .split('\n')
    .map(cleanLine)
    .filter((line) => !shouldIgnoreLine(line));
}

function classifyLine(line) {
  const s = String(line || '');
  if (!s) return 'done';
  if (/(明天|明日|后续|下一步|下周|计划|待办|继续推进|继续跟进|准备)/.test(s)) {
    return 'nextPlan';
  }
  if (/(问题|异常|失败|阻塞|卡点|风险|待确认|待排查|Bug|BUG|缺陷|报错|兼容)/i.test(s)) {
    return 'issue';
  }
  if (/(沟通|协同|对接|会议|讨论|同步|协调|配合|确认|联调)/.test(s)) {
    return 'collab';
  }
  if (/(上线|交付|完成|新增|实现|优化|修复|发布|提测|落地|输出|整理|支撑|支持|推进)/.test(s)) {
    return 'highlight';
  }
  return 'done';
}

function compactTopic(line) {
  const s = cleanLine(line)
    .replace(/^(完成|推进|处理|优化|修复|支持|实现|新增|整理|跟进)/, '')
    .replace(/(相关|事项|工作|内容|问题|任务)$/g, '')
    .trim();
  return safeTrim(s || cleanLine(line), 14);
}

function dedupeLines(lines, limit) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(lines) ? lines : []) {
    const line = cleanLine(raw);
    if (shouldIgnoreLine(line)) continue;
    const key = normalizeForDedupe(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function buildDailyDigests(items) {
  const byDate = new Map();
  for (const item of items) {
    const date = item.date || '';
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(item);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rows]) => {
      const merged = [];
      rows.forEach((row) => {
        (row.lines || []).forEach((line) => merged.push(line));
      });
      return {
        date,
        rawCount: rows.length,
        bullets: dedupeLines(merged, 5),
      };
    });
}

function buildFallbackNextPlans(doneLines) {
  return dedupeLines(
    (doneLines || []).slice(0, 3).map((line) => '继续推进：' + cleanLine(line)),
    3
  );
}

function styleLabel(style) {
  if (style === 'formal') return '正式汇报';
  if (style === 'review') return '述职归纳';
  return '简洁周报';
}

function buildIntro(style, stats, focusTopics) {
  const head =
    '本周共整理 ' +
    stats.total +
    ' 条日报，覆盖 ' +
    stats.activeDays +
    ' 个工作日。';
  const focus = focusTopics.length ? '主要集中在：' + focusTopics.join('、') + '。' : '';
  if (style === 'formal') {
    return head + focus + '整体推进节奏平稳，以下为本周工作归纳。';
  }
  if (style === 'review') {
    return head + focus + '以下从完成事项、问题处理与后续计划三个维度进行归纳。';
  }
  return head + focus;
}

function renderSection(title, lines) {
  const list = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!list.length) return '';
  return ['## ' + title]
    .concat(list.map((line) => '- ' + line))
    .concat([''])
    .join('\n');
}

function renderDailyDigest(digests) {
  const list = Array.isArray(digests) ? digests : [];
  if (!list.length) return '';
  const out = ['## 按日纪要', ''];
  list.forEach((item) => {
    out.push('### ' + item.date);
    (item.bullets || []).forEach((line) => out.push('- ' + line));
    out.push('');
  });
  return out.join('\n');
}

function generatePersonalWeeklyReport(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const style =
    payload.style === 'formal' || payload.style === 'review' ? payload.style : 'concise';
  const includeDailyDigest = payload.includeDailyDigest !== false;
  const title = safeTrim(payload.title, 120);
  const rawBlogs = Array.isArray(payload.blogs) ? payload.blogs : [];
  const normalizedBlogs = rawBlogs
    .map((item) => {
      const date = normalizeDate(item && item.date);
      const content = safeTrim(item && item.content, 20000);
      return {
        date,
        user: safeTrim(item && item.user, 120),
        department: safeTrim(item && item.department, 160),
        content,
        lines: dedupeLines(splitContentToLines(content), 12),
      };
    })
    .filter((item) => item.date && item.content);

  const dailyDigests = buildDailyDigests(normalizedBlogs);
  const allLines = [];
  const categories = {
    done: [],
    highlight: [],
    issue: [],
    collab: [],
    nextPlan: [],
  };

  normalizedBlogs.forEach((item) => {
    item.lines.forEach((line) => {
      allLines.push(line);
      const kind = classifyLine(line);
      categories[kind].push(line);
      if (kind === 'highlight') categories.done.push(line);
      else if (kind === 'done') categories.highlight.push(line);
    });
  });

  const doneLines = dedupeLines(categories.done, 8);
  const highlightLines = dedupeLines(categories.highlight, 5);
  const issueLines = dedupeLines(categories.issue, 5);
  const collabLines = dedupeLines(categories.collab, 5);
  let nextPlanLines = dedupeLines(categories.nextPlan, 5);
  if (!nextPlanLines.length) nextPlanLines = buildFallbackNextPlans(doneLines);

  const dates = dailyDigests.map((item) => item.date).filter(Boolean);
  const rangeFrom = dates.length ? dates[0] : '';
  const rangeTo = dates.length ? dates[dates.length - 1] : '';
  const focusTopics = dedupeLines(
    doneLines.concat(highlightLines).slice(0, 5).map((line) => compactTopic(line)),
    3
  );

  const stats = {
    total: normalizedBlogs.length,
    activeDays: dailyDigests.length,
    rangeFrom,
    rangeTo,
    focusTopics,
    style,
    styleLabel: styleLabel(style),
  };

  const resolvedTitle =
    title ||
    '个人周报（' + (rangeFrom || '未定') + (rangeTo ? ' ~ ' + rangeTo : '') + '）';
  const lines = [
    '# ' + resolvedTitle,
    '',
    '> 生成方式：个人日报助手 · ' + stats.styleLabel,
    '> 时间范围：' + (rangeFrom || '未定') + (rangeTo ? ' ~ ' + rangeTo : ''),
    '',
    '## 本周概览',
    '',
    buildIntro(style, stats, focusTopics),
    '',
  ];

  if (doneLines.length) lines.push(renderSection('本周完成事项', doneLines));
  if (highlightLines.length) lines.push(renderSection('重点成果', highlightLines));
  if (issueLines.length) lines.push(renderSection('问题与处理', issueLines));
  if (collabLines.length) lines.push(renderSection('协作与沟通', collabLines));
  if (nextPlanLines.length) lines.push(renderSection('下周计划', nextPlanLines));
  if (includeDailyDigest) lines.push(renderDailyDigest(dailyDigests));

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

  return {
    title: resolvedTitle,
    style,
    includeDailyDigest,
    stats,
    sections: {
      done: doneLines,
      highlights: highlightLines,
      issues: issueLines,
      collaboration: collabLines,
      nextPlans: nextPlanLines,
      dailyDigest: dailyDigests,
    },
    blogs: normalizedBlogs,
    markdown,
  };
}

module.exports = {
  generatePersonalWeeklyReport,
};
