'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { generatePersonalWeeklyReport } = require('../lib/personal-weekly-report-service');

test('generatePersonalWeeklyReport builds markdown and sections from blogs', () => {
  const result = generatePersonalWeeklyReport({
    style: 'formal',
    includeDailyDigest: true,
    blogs: [
      {
        date: '2026-04-13',
        user: '张三',
        department: '研发',
        content:
          '完成日报抓取插件接入；处理接口超时问题并排查原因；与测试同学沟通回归范围；明天继续推进个人周报助手页面。',
      },
      {
        date: '2026-04-14',
        user: '张三',
        department: '研发',
        content:
          '新增周报历史记录功能。修复导出文件名问题。与产品确认周报字段。下周计划：继续优化生成质量。',
      },
    ],
  });

  assert.strictEqual(result.style, 'formal');
  assert.strictEqual(result.stats.total, 2);
  assert.strictEqual(result.stats.activeDays, 2);
  assert.strictEqual(result.stats.rangeFrom, '2026-04-13');
  assert.strictEqual(result.stats.rangeTo, '2026-04-14');
  assert.ok(result.sections.done.length > 0);
  assert.ok(result.sections.nextPlans.length > 0);
  assert.match(result.markdown, /## 本周完成事项/);
  assert.match(result.markdown, /## 下周计划/);
  assert.match(result.markdown, /## 按日纪要/);
});

test('generatePersonalWeeklyReport falls back next plans when source lacks explicit plans', () => {
  const result = generatePersonalWeeklyReport({
    blogs: [
      {
        date: '2026-04-15',
        content: '完成日报抓取整合。优化个人周报预览。',
      },
    ],
  });

  assert.ok(result.sections.nextPlans.length > 0);
  assert.match(result.sections.nextPlans[0], /继续推进/);
});
