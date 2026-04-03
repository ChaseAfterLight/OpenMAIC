import { describe, expect, it } from 'vitest';
import {
  buildOfficialTextbookSeedLibraries,
  buildPublishedTextbookSeedLibraries,
} from '@/lib/server/textbook-library-seed';

describe('textbook library seed', () => {
  it('builds official textbook libraries from K12 presets', () => {
    const libraries = buildOfficialTextbookSeedLibraries(123);
    expect(libraries.length).toBeGreaterThan(0);

    const gradeFourMath = libraries.find(
      (library) => library.subjectId === 'math' && library.gradeId === 'grade-4',
    );
    expect(gradeFourMath).toBeDefined();
    expect(gradeFourMath?.publisher).toBe('人民教育出版社');
    expect(gradeFourMath?.volumes[0]?.units[0]?.chapters[0]?.attachments[0]).toMatchObject({
      status: 'ready',
      externalUrl: '/textbooks/pep/math/grade-4-upper/unit-1/chapter-1.pdf',
    });
  });

  it('builds published seed libraries with publish metadata', () => {
    const libraries = buildPublishedTextbookSeedLibraries(456);
    expect(libraries[0]?.publishedAt).toBe(456);
    expect(libraries[0]?.publishedByUserId).toBe('system-seed');
  });
});
