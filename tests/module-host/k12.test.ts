import { describe, expect, it } from 'vitest';
import {
  buildK12RequirementText,
  buildK12TextbookResourceReferenceText,
  getDefaultK12StructuredInput,
  mergeK12TextbookResourcesIntoReferenceText,
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
    expect(requirement).toContain('章节参考资料');
    expect(requirement).toContain('补充资料 PDF《班级学情分析.pdf》');
  });

  it('preserves non-preset textbook snapshots and resource references', () => {
    const input = syncK12StructuredInput(
      {
        ...getDefaultK12StructuredInput(presets),
        textbookSource: 'official',
        textbookEditionId: 'official-math-grade-4',
        textbookEditionLabel: '学校统编版',
        volumeId: 'school-volume-1',
        volumeLabel: '四年级上册',
        unitId: 'unit-a',
        unitTitle: '第一单元',
        chapterId: 'chapter-a',
        chapterTitle: '校园里的大数',
        chapterSummary: '结合校园和城市数据理解大数。',
        chapterKeywords: ['大数', '校园数据'],
        chapterResources: [
          {
            id: 'resource-1',
            title: '教材原页',
            type: 'pdf',
            description: '含课本例题与练习',
            url: '/api/textbook-libraries?action=downloadAttachment&id=resource-1',
          },
        ],
      },
      presets,
    );

    expect(input.chapterTitle).toBe('校园里的大数');
    expect(input.chapterResources?.[0]?.title).toBe('教材原页');

    const resourceReference = buildK12TextbookResourceReferenceText({
      resources: input.chapterResources ?? [],
      locale: 'zh-CN',
    });
    expect(resourceReference).toContain('教材原页');
    expect(resourceReference).toContain('含课本例题与练习');
  });

  it('merges textbook resources into reference text without requiring an extra pdf upload', () => {
    const merged = mergeK12TextbookResourcesIntoReferenceText({
      baseText: '',
      locale: 'zh-CN',
      resources: [
        {
          title: '教师讲义',
          description: '用于课堂导入和例题讲解',
          url: '/api/textbook-libraries?action=downloadAttachment&id=teacher-note',
        },
      ],
    });

    expect(merged).toContain('章节参考资料');
    expect(merged).toContain('教师讲义');
    expect(merged).toContain('用于课堂导入和例题讲解');
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
      textbookEdition: '人教版',
      volume: '四年级上册',
      unit: '大数的认识',
      chapter: '亿以内数的认识',
      chapterId: 'g4u-u1-c1',
    });
  });
});
