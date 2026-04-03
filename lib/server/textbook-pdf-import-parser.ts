import { randomUUID } from 'crypto';
import { extractText, getDocumentProxy } from 'unpdf';
import { createLogger } from '@/lib/logger';
import {
  getTextbookPdfImportDraft,
  readTextbookPdfImportDraftBlob,
  updateTextbookPdfImportProcessing,
} from '@/lib/server/textbook-library-repository';
import type { TextbookPdfImportUnitDraft } from '@/lib/server/textbook-library-types';

const log = createLogger('TextbookPdfImportParser');

interface Marker {
  kind: 'unit' | 'chapter';
  page: number;
  title: string;
  confidence: number;
}

function compactWhitespace(text: string): string {
  return text.replace(/[\s\u3000]+/g, '');
}

function normalizeHeadingText(text: string): string {
  return compactWhitespace(text).replace(/[。！？!?；;：:、]+$/, '').trim();
}

function isLikelyStandaloneHeading(text: string): boolean {
  return Boolean(text) && /[\u4e00-\u9fa5]/.test(text) && !/[。！？!?；;：:、]$/.test(text);
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectUnitTitle(lines: string[]): string | null {
  const compactLines = lines.map((line) => compactWhitespace(line)).filter(Boolean);

  for (const line of compactLines) {
    const inlineMatch = line.match(/^第[一二三四五六七八九十百千万0-9]+单元(.+)?$/);
    if (inlineMatch) {
      const title = normalizeHeadingText(inlineMatch[1] ?? '');
      if (isLikelyStandaloneHeading(title)) {
        return title;
      }
    }
  }

  for (let start = 0; start < compactLines.length; start += 1) {
    let prefix = '';
    for (let end = start; end < Math.min(compactLines.length, start + 8); end += 1) {
      prefix += compactLines[end];
      if (/^第[一二三四五六七八九十百千万0-9]+单元$/.test(prefix)) {
        const title = compactLines.slice(end + 1).find((line) => Boolean(line));
        if (!title) {
          return null;
        }

        const normalized = normalizeHeadingText(title);
        return isLikelyStandaloneHeading(normalized) ? normalized : null;
      }
    }
  }

  return null;
}

function detectExplicitChapterTitle(lines: string[]): string | null {
  for (const line of lines) {
    const compact = compactWhitespace(line);
    const inlineMatch = compact.match(/^第[一二三四五六七八九十百千万0-9]+(课|章|节)(.+)$/);
    if (!inlineMatch) {
      continue;
    }
    const title = normalizeHeadingText(inlineMatch[2]);
    if (isLikelyStandaloneHeading(title)) {
      return title;
    }
  }

  return null;
}

function detectTrailingDigitHeading(lines: string[]): string | null {
  for (const line of lines) {
    const compact = compactWhitespace(line);
    if (!/\d+$/.test(compact)) {
      continue;
    }

    const title = normalizeHeadingText(compact.replace(/\d+$/, ''));
    if (isLikelyStandaloneHeading(title)) {
      return title;
    }
  }

  return null;
}

function detectChapterTitle(lines: string[]): string | null {
  return detectExplicitChapterTitle(lines) ?? detectTrailingDigitHeading(lines);
}

function detectMarkers(lines: string[], page: number): Marker[] {
  const markers: Marker[] = [];

  const unitTitle = detectUnitTitle(lines);
  if (unitTitle) {
    markers.push({
      kind: 'unit',
      page,
      title: unitTitle,
      confidence: 0.96,
    });
  }

  const chapterTitle = detectChapterTitle(lines);
  if (chapterTitle) {
    markers.push({
      kind: 'chapter',
      page,
      title: chapterTitle,
      confidence: 0.92,
    });
  }

  return markers;
}

function collectMarkers(pageTexts: string[]): Marker[] {
  return pageTexts.flatMap((pageText, index) => detectMarkers(splitLines(pageText), index + 1));
}

function findPrimaryTocPage(pageTexts: string[]): string | null {
  let bestPageText: string | null = null;
  let bestScore = 0;

  for (const pageText of pageTexts) {
    const lines = splitLines(pageText);
    const score = lines.reduce((total, line) => {
      const compact = compactWhitespace(line);
      if (/^［\d+］$/.test(compact)) {
        return total + 5;
      }
      if (/^\d+.+［\d+］$/.test(compact)) {
        return total + 3;
      }
      if (/^\d+\s/.test(line)) {
        return total + 1;
      }
      return total;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestPageText = pageText;
    }
  }

  return bestScore > 0 ? bestPageText : null;
}

interface TocChapterEntry {
  title: string;
  bookPage: number;
}

interface TocUnitEntry {
  startPage: number;
  chapters: TocChapterEntry[];
}

function parseTocPage(pageText: string): TocUnitEntry[] | null {
  const lines = splitLines(pageText);
  const units: TocUnitEntry[] = [];
  let currentUnit: TocUnitEntry | null = null;

  for (const line of lines) {
    const compact = compactWhitespace(line);
    const unitMatch = compact.match(/^［(\d+)］$/);
    if (unitMatch) {
      currentUnit = {
        startPage: Number(unitMatch[1]),
        chapters: [],
      };
      units.push(currentUnit);
      continue;
    }

    const chapterMatch = compact.match(/^(\d+)(.+?)［(\d+)］$/);
    if (chapterMatch && currentUnit) {
      const title = normalizeHeadingText(chapterMatch[2].replace(/…+/g, ''));
      if (isLikelyStandaloneHeading(title)) {
        currentUnit.chapters.push({
          title,
          bookPage: Number(chapterMatch[3]),
        });
      }
    }
  }

  return units.length > 0 ? units : null;
}

function extractPrintedPageNumber(lines: string[]): number | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const compact = compactWhitespace(line);
    if (/^\d+$/.test(compact)) {
      return Number(compact);
    }
  }

  return null;
}

function buildProposalFromToc(
  pageTexts: string[],
  tocUnits: TocUnitEntry[],
): { units: TextbookPdfImportUnitDraft[]; unboundPages: number[] } | null {
  const bookPageToRawPage = new Map<number, number>();
  for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
    const printedPage = extractPrintedPageNumber(splitLines(pageTexts[pageIndex]));
    if (printedPage && !bookPageToRawPage.has(printedPage)) {
      bookPageToRawPage.set(printedPage, pageIndex + 1);
    }
  }

  const unitIntroPages: Array<{ page: number; title: string }> = [];
  for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
    const unitTitle = detectUnitTitle(splitLines(pageTexts[pageIndex] ?? ''));
    if (unitTitle) {
      unitIntroPages.push({
        page: pageIndex + 1,
        title: unitTitle,
      });
    }
  }

  if (unitIntroPages.length === 0) {
    return null;
  }

  const units: TextbookPdfImportUnitDraft[] = [];
  const unitCount = Math.min(tocUnits.length, unitIntroPages.length);

  for (let index = 0; index < unitCount; index += 1) {
    const tocUnit = tocUnits[index];
    const unitIntroPage = unitIntroPages[index];
    const nextUnitIntroPage = unitIntroPages[index + 1];
    const unitTitle = unitIntroPage.title || `自动导入单元 ${index + 1}`;
    const nextUnitRawPage = nextUnitIntroPage ? nextUnitIntroPage.page : undefined;

    const chapters = tocUnit.chapters
      .map((chapter, chapterIndex) => ({
        title: chapter.title,
        rawPage: bookPageToRawPage.get(chapter.bookPage),
        order: chapterIndex,
      }))
      .filter((chapter): chapter is { title: string; rawPage: number; order: number } =>
        Boolean(chapter.rawPage),
      )
      .sort((left, right) => left.rawPage - right.rawPage);

    if (chapters.length === 0) {
      continue;
    }

    const nextUnitPageLimit = nextUnitRawPage ?? pageTexts.length + 1;
    const unit: TextbookPdfImportUnitDraft = {
      id: `import-unit-${units.length + 1}`,
      title: unitTitle,
      order: units.length,
      chapters: [],
    };

    for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
      const current = chapters[chapterIndex];
      const next = chapters[chapterIndex + 1];
      const pageStart = current.rawPage;
      const pageEnd = next ? Math.max(pageStart, next.rawPage - 1) : Math.max(pageStart, nextUnitPageLimit - 1);
      unit.chapters.push({
        id: `import-chapter-${units.length + 1}-${chapterIndex + 1}`,
        title: current.title,
        order: chapterIndex,
        pageStart,
        pageEnd,
        confidence: 0.95,
      });
    }

    units.push(unit);
  }

  if (units.length === 0) {
    return null;
  }

  const coveredPages = new Set<number>();
  for (const unit of units) {
    for (const chapter of unit.chapters) {
      for (let page = chapter.pageStart; page <= chapter.pageEnd; page += 1) {
        coveredPages.add(page);
      }
    }
  }

  const unboundPages: number[] = [];
  for (let page = 1; page <= pageTexts.length; page += 1) {
    if (!coveredPages.has(page)) {
      unboundPages.push(page);
    }
  }

  return { units, unboundPages };
}

function buildFallbackProposal(pageTexts: string[]): TextbookPdfImportUnitDraft[] {
  return [
    {
      id: 'import-unit-1',
      title: '自动导入单元',
      order: 0,
      chapters: [
        {
          id: 'import-chapter-1',
          title: '自动导入章节',
          order: 0,
          pageStart: 1,
          pageEnd: Math.max(1, pageTexts.length),
          confidence: 0.35,
        },
      ],
    },
  ];
}

function buildProposal(pageTexts: string[]): {
  units: TextbookPdfImportUnitDraft[];
  unboundPages: number[];
} {
  const pageCount = Math.max(1, pageTexts.length);

  const tocPageText = findPrimaryTocPage(pageTexts);
  if (tocPageText) {
    const tocUnits = parseTocPage(tocPageText);
    if (tocUnits) {
      const proposal = buildProposalFromToc(pageTexts, tocUnits);
      if (proposal) {
        return proposal;
      }
    }
  }

  const markers = collectMarkers(pageTexts);
  const unitMarkers = markers.filter((marker) => marker.kind === 'unit');
  const chapterMarkers = markers.filter((marker) => marker.kind === 'chapter');

  if (chapterMarkers.length === 0 && unitMarkers.length === 0) {
    return {
      units: buildFallbackProposal(pageTexts),
      unboundPages: [],
    };
  }

  const units: TextbookPdfImportUnitDraft[] = [];
  let currentUnit: TextbookPdfImportUnitDraft | null = null;

  const ensureUnit = () => {
    if (!currentUnit) {
      currentUnit = {
        id: `import-unit-${units.length + 1}`,
        title: units.length === 0 ? '自动导入单元' : `自动导入单元 ${units.length + 1}`,
        order: units.length,
        chapters: [],
      };
      units.push(currentUnit);
    }
    return currentUnit;
  };

  for (let page = 1; page <= pageCount; page += 1) {
    const unitMarker = unitMarkers.find((marker) => marker.page === page);
    if (unitMarker) {
      currentUnit = {
        id: `import-unit-${units.length + 1}`,
        title: unitMarker.title,
        order: units.length,
        chapters: [],
      };
      units.push(currentUnit);
    }

    const chapterMarker = chapterMarkers.find((marker) => marker.page === page);
    if (chapterMarker) {
      const unit = ensureUnit();
      unit.chapters.push({
        id: `import-chapter-${unit.order + 1}-${unit.chapters.length + 1}`,
        title: chapterMarker.title,
        order: unit.chapters.length,
        pageStart: page,
        pageEnd: page,
        confidence: chapterMarker.confidence,
      });
    }
  }

  const allChapters = units.flatMap((unit) =>
    unit.chapters.map((chapter) => ({
      unit,
      chapter,
    })),
  );

  if (allChapters.length === 0) {
    if (unitMarkers.length > 0) {
      const fallbackUnits = unitMarkers.map((marker, index) => {
        const nextMarker = unitMarkers[index + 1];
        const pageStart = marker.page;
        const pageEnd = nextMarker ? Math.max(pageStart, nextMarker.page - 1) : pageCount;
        return {
          id: `import-unit-${index + 1}`,
          title: marker.title,
          order: index,
          chapters: [
            {
              id: `import-chapter-${index + 1}-1`,
              title: `${marker.title} 导入内容`,
              order: 0,
              pageStart,
              pageEnd,
              confidence: 0.5,
            },
          ],
        };
      });
      return {
        units: fallbackUnits,
        unboundPages: [],
      };
    }
    return {
      units: buildFallbackProposal(pageTexts),
      unboundPages: [],
    };
  }

  for (let index = 0; index < allChapters.length; index += 1) {
    const current = allChapters[index];
    const next = allChapters[index + 1];
    current.chapter.pageEnd = next ? Math.max(current.chapter.pageStart, next.chapter.pageStart - 1) : pageCount;
  }

  for (const unit of units) {
    if (unit.chapters.length === 0) {
      unit.chapters.push({
        id: `import-chapter-${unit.order + 1}-1`,
        title: `${unit.title} 导入内容`,
        order: 0,
        pageStart: 1,
        pageEnd: pageCount,
        confidence: 0.45,
      });
    }
  }

  const coveredPages = new Set<number>();
  for (const unit of units) {
    for (const chapter of unit.chapters) {
      for (let page = chapter.pageStart; page <= chapter.pageEnd; page += 1) {
        coveredPages.add(page);
      }
    }
  }

  const unboundPages: number[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    if (!coveredPages.has(page)) {
      unboundPages.push(page);
    }
  }

  return { units, unboundPages };
}

export async function runTextbookPdfImportProcessing(draftId: string): Promise<void> {
  const draft = await getTextbookPdfImportDraft(draftId);
  if (!draft) {
    return;
  }

  const parserJobId = `textbook-import-${randomUUID()}`;
  await updateTextbookPdfImportProcessing({
    draftId,
    status: 'parsing',
    parserJobId,
    parseError: undefined,
  });

  try {
    const blob = await readTextbookPdfImportDraftBlob(draftId);
    if (!blob) {
      throw new Error('导入 PDF 源文件不存在');
    }

    const pdf = await getDocumentProxy(new Uint8Array(blob.buffer));
    const { totalPages, text: pageTexts } = await extractText(pdf);
    const mergedText = pageTexts.join('\n');
    const proposal = buildProposal(pageTexts);

    await updateTextbookPdfImportProcessing({
      draftId,
      status: 'ready',
      parserJobId,
      pageCount: totalPages,
      extractedText: mergedText,
      units: proposal.units,
      unboundPages: proposal.unboundPages,
      parseError: undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`教材 PDF 导入解析失败 [draftId=${draftId}]`, error);
    await updateTextbookPdfImportProcessing({
      draftId,
      status: 'failed',
      parserJobId,
      parseError: message,
    });
  }
}

export const __testables = {
  buildProposal,
};
