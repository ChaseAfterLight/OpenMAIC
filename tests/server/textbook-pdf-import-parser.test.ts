import { describe, expect, it } from 'vitest';
import { __testables } from '@/lib/server/textbook-pdf-import-parser';

describe('textbook pdf import parser', () => {
  it('builds unit and chapter proposals from heading-like page text', () => {
    const result = __testables.buildProposal([
      '第一单元 小数乘法\n第一课 小数乘整数\n本课介绍小数乘整数',
      '练习题与例题',
      '第二课 小数乘小数\n继续学习',
      '第二单元 位置与方向\n第一课 认识方向',
    ]);

    expect(result.units).toHaveLength(2);
    expect(result.units[0]?.title).toBe('小数乘法');
    expect(result.units[0]?.chapters).toHaveLength(2);
    expect(result.units[0]?.chapters[0]?.pageStart).toBe(1);
    expect(result.units[0]?.chapters[0]?.pageEnd).toBe(2);
    expect(result.units[1]?.chapters[0]?.pageStart).toBe(4);
  });

  it('falls back to a single editable chapter when headings are missing', () => {
    const result = __testables.buildProposal([
      '这是一段普通正文，没有明显标题',
      '继续正文内容',
    ]);

    expect(result.units).toHaveLength(1);
    expect(result.units[0]?.chapters).toHaveLength(1);
    expect(result.units[0]?.chapters[0]?.pageStart).toBe(1);
    expect(result.units[0]?.chapters[0]?.pageEnd).toBe(2);
  });

  it('reads textbook-style unit and chapter titles from scanned pages', () => {
    const result = __testables.buildProposal([
      '',
      '',
      '',
      '',
      '',
      '',
      '第\n一\n单\n元\n太 阳 与 影 子\n阳光下，物体的影子是\n什么样的？',
      '',
      '●找一找哪里有影子。\n影 子11',
      '●物体的影子是怎样形成的？\n手一动，手的影子就……',
      '●一天中，阳光下物体影子的方向与长度有什么变化？\n太 阳 和 影 子22',
      '',
      '●认识日晷（ ）。\n日 晷33',
    ]);

    expect(result.units).toHaveLength(1);
    expect(result.units[0]?.title).toBe('太阳与影子');
    expect(result.units[0]?.chapters.map((chapter) => chapter.title)).toEqual([
      '影子',
      '太阳和影子',
      '日晷',
    ]);
  });

  it('removes front-matter boilerplate from ai-bound page text', () => {
    const cleaned = __testables.sanitizePageTextForAi(`
书名
主编
出版发行
ISBN 978-7-5552-8246-4
图书在版编目（CIP）数据
第一单元 太阳与影子
第一课 影子
［1］
`);

    expect(cleaned).not.toContain('ISBN');
    expect(cleaned).not.toContain('出版发行');
    expect(cleaned).toContain('第一单元 太阳与影子');
    expect(cleaned).toContain('第一课 影子');
    expect(cleaned).toContain('［1］');
  });

  it('builds AI extraction context from front pages', () => {
    const context = __testables.buildAiExtractionContext([
      '封面\nISBN 978-7-5552-8246-4\n出版发行\n目录\n第一单元 ........ 3\n第二单元 ........ 12',
      '目录\n第一单元 ........ 3\n第二单元 ........ 12',
      '前言',
    ]);

    expect(context.tocCandidatePages).toContain(2);
    expect(context.sampledPages[1]?.rawPage).toBe(2);
    expect(context.sampledPages[1]?.tocScore).toBeGreaterThan(0);
    expect(context.sampledPages[0]?.textPreview).not.toContain('ISBN');
    expect(context.sampledPages[0]?.textPreview).toContain('第一单元');
  });

  it('samples the first twelve pages for AI extraction by default', () => {
    const pages = Array.from({ length: 20 }, (_, index) =>
      index === 11 ? '目录\n第一课 ........ 1' : `第 ${index + 1} 页`,
    );

    const context = __testables.buildAiExtractionContext(pages);

    expect(context.sampledPages).toHaveLength(12);
    expect(context.sampledPages[11]?.rawPage).toBe(12);
    expect(context.tocCandidatePages).toContain(12);
  });

  it('maps AI printed pages to raw pages and marks low-confidence chapters without rule merging', () => {
    const aiProposal = __testables.buildAiProposal(
      [
        '封面',
        '目录\n第一单元 …… 1',
        '第一单元 认识植物\n第一课 种子发芽',
        '正文内容\n1',
        '第二课 茎和叶\n2',
        '正文内容\n3',
      ],
      {
        pageAnchors: [{ printedPage: 1, rawPage: 4, confidence: 0.91 }],
        units: [
          {
            title: '认识植物',
            confidence: 0.4,
            chapters: [
              { title: '种子发芽', printedPage: 1, confidence: 0.92 },
              { title: '茎和叶', printedPage: 2, confidence: 0.2 },
            ],
          },
        ],
      },
      'openai/gpt-4o-mini',
    );

    expect(aiProposal).not.toBeNull();
    expect(aiProposal?.proposalSource).toBe('ai');
    expect(aiProposal?.pageAnchors).toHaveLength(1);
    expect(aiProposal?.units[0]?.chapters[0]?.pageStart).toBe(4);
    expect(aiProposal?.units[0]?.chapters[1]?.pageStart).toBe(5);
    expect(aiProposal?.lowConfidencePages).toContain(5);
  });
});
