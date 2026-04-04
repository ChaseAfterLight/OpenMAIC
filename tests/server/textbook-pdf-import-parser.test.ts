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

  it('builds AI extraction context from front pages', () => {
    const context = __testables.buildAiExtractionContext([
      '封面',
      '目录\n第一单元 ........ 3\n第二单元 ........ 12',
      '前言',
    ]);

    expect(context.tocCandidatePages).toContain(2);
    expect(context.sampledPages[1]?.rawPage).toBe(2);
    expect(context.sampledPages[1]?.tocScore).toBeGreaterThan(0);
  });

  it('maps AI printed pages to raw pages and marks low-confidence chapters', () => {
    const ruleProposal = __testables.buildProposal([
      '封面',
      '目录\n第一单元 …… 1',
      '第一单元 认识植物\n第一课 种子发芽',
      '正文内容\n1',
      '第二课 茎和叶\n2',
      '正文内容\n3',
    ]);

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
        tocCandidatePages: [2],
        pageAnchors: [{ printedPage: 1, rawPage: 4, confidence: 0.91, source: 'ai' }],
        units: [
          {
            title: '认识植物',
            confidence: 0.4,
            source: 'ai',
            chapters: [
              { title: '种子发芽', printedPage: 1, confidence: 0.92, source: 'ai' },
              { title: '茎和叶', printedPage: 2, confidence: 0.2, source: 'ai' },
            ],
          },
        ],
        notes: [],
      },
      ruleProposal,
      'openai/gpt-4o-mini',
    );

    expect(aiProposal).not.toBeNull();
    expect(aiProposal?.units[0]?.chapters[0]?.pageStart).toBe(4);
    expect(aiProposal?.units[0]?.chapters[1]?.pageStart).toBe(5);
    expect(aiProposal?.lowConfidencePages).toContain(5);
  });

  it('keeps conflict notes when AI and rules disagree on chapter boundaries', () => {
    const ruleProposal = __testables.buildProposal([
      '第一单元 天气\n第一课 晴天',
      '正文',
      '第二课 下雨',
      '正文',
    ]);
    const aiProposal = {
      ...ruleProposal,
      units: [
        {
          ...ruleProposal.units[0],
          source: 'ai' as const,
          chapters: ruleProposal.units[0].chapters.map((chapter, index) => ({
            ...chapter,
            pageStart: index === 1 ? chapter.pageStart + 2 : chapter.pageStart,
            source: 'ai' as const,
          })),
        },
      ],
      proposalSource: 'ai' as const,
      conflictNotes: [],
      lowConfidencePages: [],
    };

    const merged = __testables.mergeProposalResults(
      ['第一页', '第二页', '第三页', '第四页'],
      ruleProposal,
      aiProposal,
    );

    expect(merged.proposalSource).toBe('merged');
    expect(merged.conflictNotes.some((note) => note.code === 'structure-conflict')).toBe(true);
  });
});
