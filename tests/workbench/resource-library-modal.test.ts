import { describe, expect, it } from 'vitest';
import {
  filterTextbookCards,
  type TextbookCard,
} from '@/components/workbench/resource-library-modal';

const cards: TextbookCard[] = [
  {
    id: 'official-card',
    libraryId: 'official-lib',
    source: 'official',
    name: '四年级上册',
    edition: '人教版',
    subject: '数学',
    publisher: '人民教育出版社',
    grade: '四年级',
    editionId: 'pep-math',
    volumeId: 'volume-1',
    volumeLabel: '四年级上册',
    gradeId: 'grade-4',
    gradeLabel: '四年级',
    subjectId: 'math',
    units: [
      {
        id: 'unit-1',
        title: '大数的认识',
        children: [
          {
            id: 'chapter-1',
            title: '亿以内数的认识',
            summary: '学习大数在生活里的表达。',
            keywords: ['大数'],
            resources: [],
          },
        ],
      },
    ],
  },
  {
    id: 'personal-card',
    libraryId: 'personal-lib',
    source: 'personal',
    name: '我的专题册',
    edition: '校本拓展',
    subject: '数学',
    publisher: '校本资源',
    grade: '四年级',
    editionId: 'school-math',
    volumeId: 'volume-2',
    volumeLabel: '专题册',
    gradeId: 'grade-4',
    gradeLabel: '四年级',
    subjectId: 'math',
    units: [
      {
        id: 'unit-2',
        title: '生活中的数学',
        children: [
          {
            id: 'chapter-2',
            title: '校园统计',
            summary: '围绕校园人数做统计练习。',
            keywords: ['统计'],
            resources: [],
          },
        ],
      },
    ],
  },
];

describe('resource library modal filters', () => {
  it('filters textbook cards by source, publisher, grade, and search query', () => {
    const filtered = filterTextbookCards(cards, {
      searchQuery: '大数',
      sourceFilter: 'official',
      subjectFilter: '数学',
      gradeFilter: '四年级',
      publisherFilter: '人民教育出版社',
      editionFilter: '全部',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('official-card');
  });

  it('keeps fallback cards available when filters are broad', () => {
    const filtered = filterTextbookCards(cards, {
      searchQuery: '',
      sourceFilter: 'all',
      subjectFilter: '全部',
      gradeFilter: '全部',
      publisherFilter: '全部',
      editionFilter: '全部',
    });

    expect(filtered).toHaveLength(2);
  });
});
