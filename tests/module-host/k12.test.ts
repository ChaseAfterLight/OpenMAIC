import { describe, expect, it } from 'vitest';
import {
  buildK12RequirementText,
  getDefaultK12StructuredInput,
  resolveK12LessonPackMetadata,
  syncK12StructuredInput,
} from '@/lib/module-host/k12';
import type { K12ModulePresets } from '@/lib/module-host/types';
import { k12ModuleManifest } from '@/modules/k12/manifest';

const presets = k12ModuleManifest.presets as unknown as K12ModulePresets;

describe('k12 textbook helpers', () => {
  it('hydrates default K12 input with chapter snapshot data', () => {
    const input = getDefaultK12StructuredInput(presets);

    expect(input).toMatchObject({
      gradeId: 'grade-4',
      subjectId: 'math',
      textbookEditionId: 'pep-elementary-math',
      volumeId: 'pep-math-grade-4-upper',
      unitId: 'g4u-unit-1',
      chapterId: 'g4u-u1-c1',
    });
    expect(input.chapterSummary).toContain('亿以内大数');
    expect(input.chapterResources?.length).toBeGreaterThan(0);
  });

  it('clears textbook selections when the chosen subject has no configured catalog', () => {
    const input = syncK12StructuredInput(
      {
        ...getDefaultK12StructuredInput(presets),
        subjectId: 'english',
      },
      presets,
    );

    expect(input.textbookEditionId).toBeUndefined();
    expect(input.volumeId).toBeUndefined();
    expect(input.chapterId).toBeUndefined();
    expect(input.chapterResources).toEqual([]);
  });

  it('builds a chapter-aware K12 requirement with supplementary PDF context', () => {
    const requirement = buildK12RequirementText({
      input: getDefaultK12StructuredInput(presets),
      presets,
      locale: 'zh-CN',
      freeform: '加入一个生活化导入和 3 道练习题。',
      supplementaryPdfName: '班级学情分析.pdf',
    });

    expect(requirement).toContain('亿以内数的认识');
    expect(requirement).toContain('章节摘要');
    expect(requirement).toContain('章节可参考资料');
    expect(requirement).toContain('补充资料 PDF《班级学情分析.pdf》');
  });

  it('resolves lesson pack metadata from textbook selection', () => {
    const metadata = resolveK12LessonPackMetadata({
      input: getDefaultK12StructuredInput(presets),
      presets,
      locale: 'zh-CN',
    });

    expect(metadata).toMatchObject({
      grade: '四年级',
      subject: '数学',
      lessonType: '新课导入',
      textbookEdition: '人教版小学数学',
      volume: '四年级上册',
      unit: '大数的认识',
      chapter: '亿以内数的认识',
      chapterId: 'g4u-u1-c1',
    });
  });
});
