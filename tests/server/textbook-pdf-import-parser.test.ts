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

  it('builds AI extraction context from raw front pages', () => {
    const context = __testables.buildAiExtractionContext([
      '封面\nISBN 978-7-5552-8246-4\n出版发行\n目录\n第一单元 ........ 3\n第二单元 ........ 12',
      '目录\n第一单元 ........ 3\n第二单元 ........ 12',
      '前言',
    ]);

    expect(context.tocCandidatePages).toContain(2);
    expect(context.sampledPages[1]?.rawPage).toBe(2);
    expect(context.sampledPages[1]?.tocScore).toBeGreaterThan(0);
    expect(context.sampledPages[0]?.textPreview).toContain('ISBN');
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

  it('maps AI printed pages to raw pdf pages while preserving printed page metadata', () => {
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
    expect(aiProposal?.pageAnchors).toEqual([
      { printedPage: 1, rawPage: 4, confidence: 0.91, source: 'ai' },
      { printedPage: 2, rawPage: 5, confidence: 0.78, source: 'rules' },
      { printedPage: 3, rawPage: 6, confidence: 0.78, source: 'rules' },
    ]);
    expect(aiProposal?.units[0]?.chapters[0]?.pageStart).toBe(4);
    expect(aiProposal?.units[0]?.chapters[0]?.pageEnd).toBe(4);
    expect(aiProposal?.units[0]?.chapters[0]?.printedPage).toBe(1);
    expect(aiProposal?.units[0]?.chapters[1]?.pageStart).toBe(5);
    expect(aiProposal?.units[0]?.chapters[1]?.pageEnd).toBe(6);
    expect(aiProposal?.units[0]?.chapters[1]?.printedPage).toBe(2);
    expect(aiProposal?.lowConfidencePages).toContain(5);
  });

  it('prefers verified pdf anchors over inconsistent ai anchors and computes page ranges globally', () => {
    const aiProposal = __testables.buildAiProposal(
      [
        '封面',
        '目录\n课文\n1 小蝌蚪找妈妈 ........ 1\n识字\n1 场景歌 ........ 2\n4 曹冲称象 ........ 5',
        '版权页',
        '第一页正文\n1',
        '第二页正文\n2',
        '第三页正文\n3',
        '第五页正文\n5',
        '第六页正文\n6',
      ],
      {
        pageAnchors: [
          { printedPage: 1, rawPage: 2, confidence: 1 },
          { printedPage: 2, rawPage: 2, confidence: 1 },
          { printedPage: 5, rawPage: 3, confidence: 1 },
        ],
        units: [
          {
            title: '课文',
            confidence: 0.95,
            chapters: [
              { title: '1 小蝌蚪找妈妈', printedPage: 1, confidence: 0.95 },
              { title: '4 曹冲称象', printedPage: 5, confidence: 0.95 },
            ],
          },
          {
            title: '识字',
            confidence: 0.95,
            chapters: [{ title: '1 场景歌', printedPage: 2, confidence: 0.95 }],
          },
        ],
      },
      'openai/gpt-4o-mini',
    );

    expect(aiProposal).not.toBeNull();
    expect(aiProposal?.pageAnchors).toEqual([
      { printedPage: 1, rawPage: 4, confidence: 0.78, source: 'rules' },
      { printedPage: 2, rawPage: 5, confidence: 0.78, source: 'rules' },
      { printedPage: 3, rawPage: 6, confidence: 0.78, source: 'rules' },
      { printedPage: 5, rawPage: 7, confidence: 0.78, source: 'rules' },
      { printedPage: 6, rawPage: 8, confidence: 0.78, source: 'rules' },
    ]);
    expect(aiProposal?.units[0]?.chapters[0]?.pageStart).toBe(4);
    expect(aiProposal?.units[0]?.chapters[0]?.pageEnd).toBe(4);
    expect(aiProposal?.units[1]?.chapters[0]?.pageStart).toBe(5);
    expect(aiProposal?.units[1]?.chapters[0]?.pageEnd).toBe(6);
    expect(aiProposal?.units[0]?.chapters[1]?.pageStart).toBe(7);
    expect(aiProposal?.units[0]?.chapters[1]?.pageEnd).toBe(8);
  });

  it('accepts AI payloads with more than sixteen page anchors and deduplicates conflicts', () => {
    const parsed = __testables.parseAiTocExtractionResponse(
      JSON.stringify({
        pageAnchors: [
          { printedPage: 1, rawPage: 10, confidence: 0.2 },
          { printedPage: 1, rawPage: 4, confidence: 0.9 },
          ...Array.from({ length: 18 }, (_, index) => ({
            printedPage: index + 2,
            rawPage: index + 5,
            confidence: 0.8,
          })),
        ],
        units: [
          {
            title: '第一单元',
            confidence: 0.9,
            chapters: [{ title: '第一课', printedPage: 1, confidence: 0.9 }],
          },
        ],
      }),
    );

    expect(parsed.pageAnchors).toHaveLength(19);
    expect(parsed.pageAnchors[0]).toEqual({ printedPage: 1, rawPage: 4, confidence: 0.9 });
  });

  it('salvages wrapped ai json with mixed field types instead of failing fast', () => {
    const parsed = __testables.parseAiTocExtractionResponseDetailed(`
下面是结果：
\`\`\`json
{
  "result": {
    "anchors": [
      { "page": "1", "pdfPage": "4", "confidence": "92%" },
      { "page": "bad", "pdfPage": 5, "confidence": 0.1 }
    ],
    "chapters": [
      { "name": "影子", "page": "1", "confidence": "0.9" },
      { "name": "太阳和影子", "pageNumber": "2" },
      { "page": 3 }
    ]
  }
}
\`\`\`
`);

    expect(parsed.mode).toBe('salvaged');
    expect(parsed.extraction.pageAnchors).toEqual([
      { printedPage: 1, rawPage: 4, confidence: 0.92 },
    ]);
    expect(parsed.extraction.units).toHaveLength(1);
    expect(parsed.extraction.units[0]?.chapters.map((chapter) => chapter.title)).toEqual([
      '影子',
      '太阳和影子',
    ]);
  });
});
