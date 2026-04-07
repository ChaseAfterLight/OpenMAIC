import { randomUUID } from 'crypto';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
import { callLLM } from '@/lib/ai/llm';
import { parseModelString } from '@/lib/ai/providers';
import { buildVisionUserContent } from '@/lib/generation/prompt-formatters';
import { createLogger } from '@/lib/logger';
import { resolveApiKey } from '@/lib/server/provider-config';
import { resolveModel } from '@/lib/server/resolve-model';
import {
  getTextbookPdfImportDraft,
  readTextbookPdfImportDraftBlob,
  updateTextbookPdfImportProcessing,
} from '@/lib/server/textbook-library-repository';
import type {
  TextbookPdfImportChapterDraft,
  TextbookPdfImportConflictNote,
  TextbookPdfImportPageAnchor,
  TextbookPdfImportProposalSource,
  TextbookPdfImportUnitDraft,
} from '@/lib/server/textbook-library-types';

const log = createLogger('TextbookPdfImportParser');
const DEFAULT_AI_TIMEOUT_MS = 30_000;
const DEFAULT_AI_MAX_PAGES = 12;
const LOW_CONFIDENCE_THRESHOLD = 0.72;

interface Marker {
  kind: 'unit' | 'chapter';
  page: number;
  title: string;
  confidence: number;
}

interface TocChapterEntry {
  title: string;
  bookPage: number;
}

interface TocUnitEntry {
  startPage: number;
  chapters: TocChapterEntry[];
}

interface AiExtractionContextPage {
  rawPage: number;
  printedPageCandidate: number | null;
  tocScore: number;
  textPreview: string;
}

interface AiExtractionContext {
  sampledPages: AiExtractionContextPage[];
  tocCandidatePages: number[];
}

interface AiVisionPageImage {
  id: string;
  src: string;
  width: number;
  height: number;
}

interface CanvasLike {
  getContext: (contextId: '2d') => object;
  toDataURL: (type?: string) => string;
}

type CreateCanvasFn = (width: number, height: number) => CanvasLike;

let cachedCreateCanvas: CreateCanvasFn | null | undefined;

const aiTocExtractionSchema = z.object({
  pageAnchors: z
    .array(
      z.object({
        printedPage: z.number().int().positive(),
        rawPage: z.number().int().positive(),
        confidence: z.number().min(0).max(1).default(0.8),
      }),
    )
    .default([]),
  units: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        confidence: z.number().min(0).max(1).default(0.8),
        chapters: z
          .array(
            z.object({
              title: z.string().trim().min(1),
              printedPage: z.number().int().positive().nullable().optional(),
              confidence: z.number().min(0).max(1).default(0.8),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

type AiTocExtraction = z.infer<typeof aiTocExtractionSchema>;

interface ParsedAiTocExtractionResponse {
  extraction: AiTocExtraction;
  mode: 'strict' | 'salvaged';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}

function getNestedValue(record: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const segments = path.split('.');
    let current: unknown = record;
    let matched = true;
    for (const segment of segments) {
      if (!isRecord(current) || !(segment in current)) {
        matched = false;
        break;
      }
      current = current[segment];
    }
    if (matched) {
      return current;
    }
  }
  return undefined;
}

function coercePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : null;
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/\d+/);
    if (!match) {
      return null;
    }
    const normalized = Number.parseInt(match[0], 10);
    return normalized > 0 ? normalized : null;
  }
  return null;
}

function coerceConfidenceValue(value: unknown, fallback = 0.6): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampConfidence(value, fallback);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return clampConfidence(fallback, fallback);
    }
    const normalized = Number(trimmed.replace(/%$/, ''));
    if (Number.isFinite(normalized)) {
      const ratio = trimmed.endsWith('%') || normalized > 1 ? normalized / 100 : normalized;
      return clampConfidence(ratio, fallback);
    }
  }
  return clampConfidence(fallback, fallback);
}

function coerceNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function extractJsonCandidates(rawText: string): string[] {
  const stripped = stripCodeFences(rawText);
  const candidates: string[] = [];
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(stripped.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = stripped.indexOf('[');
  const lastBracket = stripped.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(stripped.slice(firstBracket, lastBracket + 1));
  }
  candidates.push(stripped);
  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
}

function parseJsonWithRepair(rawText: string): unknown {
  let lastError: Error | null = null;
  for (const candidate of extractJsonCandidates(rawText)) {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new SyntaxError('Failed to parse AI TOC JSON');
}

function normalizeAiAnchorCandidate(candidate: unknown): {
  printedPage: number;
  rawPage: number;
  confidence: number;
} | null {
  if (!isRecord(candidate)) {
    return null;
  }
  const printedPage = coercePositiveInt(
    getNestedValue(candidate, ['printedPage', 'page', 'bookPage', 'pageNumber', 'targetPage']),
  );
  const rawPage = coercePositiveInt(
    getNestedValue(candidate, ['rawPage', 'pdfPage', 'sourcePage', 'pageIndex', 'raw.page']),
  );
  if (!printedPage || !rawPage) {
    return null;
  }
  return {
    printedPage,
    rawPage,
    confidence: coerceConfidenceValue(candidate.confidence, 0.65),
  };
}

function normalizeAiChapterCandidate(candidate: unknown): {
  title: string;
  printedPage?: number | null;
  confidence: number;
} | null {
  if (typeof candidate === 'string') {
    const title = coerceNonEmptyString(candidate);
    return title
      ? {
          title,
          printedPage: null,
          confidence: 0.55,
        }
      : null;
  }
  if (!isRecord(candidate)) {
    return null;
  }

  const title = coerceNonEmptyString(
    getNestedValue(candidate, ['title', 'name', 'chapterTitle', 'heading', 'text']),
  );
  if (!title) {
    return null;
  }

  const printedPage = coercePositiveInt(
    getNestedValue(candidate, ['printedPage', 'bookPage', 'page', 'pageNumber']),
  );

  return {
    title,
    printedPage: printedPage ?? null,
    confidence: coerceConfidenceValue(candidate.confidence, 0.6),
  };
}

function normalizeAiUnitCandidate(
  candidate: unknown,
  fallbackIndex: number,
): {
  title: string;
  confidence: number;
  chapters: Array<{
    title: string;
    printedPage?: number | null;
    confidence: number;
  }>;
} | null {
  if (typeof candidate === 'string') {
    const title = coerceNonEmptyString(candidate);
    return title
      ? {
          title,
          confidence: 0.55,
          chapters: [],
        }
      : null;
  }
  if (!isRecord(candidate)) {
    return null;
  }

  const chapters = toArray(
    getNestedValue(candidate, ['chapters', 'lessons', 'sections', 'items', 'children']),
  )
    .map((item) => normalizeAiChapterCandidate(item))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const title =
    coerceNonEmptyString(getNestedValue(candidate, ['title', 'name', 'unitTitle', 'heading'])) ??
    (chapters.length > 0 ? `自动识别单元 ${fallbackIndex + 1}` : null);

  if (!title) {
    return null;
  }

  return {
    title,
    confidence: coerceConfidenceValue(candidate.confidence, chapters.length > 0 ? 0.62 : 0.55),
    chapters,
  };
}

function salvageAiTocExtraction(payload: unknown): AiTocExtraction | null {
  const root = isRecord(payload)
    ? payload
    : Array.isArray(payload)
      ? { units: payload }
      : null;
  if (!root) {
    return null;
  }

  const extractionRoot =
    ([
      getNestedValue(root, ['result']),
      getNestedValue(root, ['data']),
      getNestedValue(root, ['output']),
      getNestedValue(root, ['payload']),
    ].find((candidate) => isRecord(candidate)) as Record<string, unknown> | undefined) ?? root;

  const pageAnchors = toArray(
    getNestedValue(extractionRoot, ['pageAnchors', 'anchors', 'pageMappings', 'pageMap']),
  )
    .map((item) => normalizeAiAnchorCandidate(item))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  let units = toArray(
    getNestedValue(extractionRoot, ['units', 'unitList', 'toc', 'contents', 'sections']),
  )
    .map((item, index) => normalizeAiUnitCandidate(item, index))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (units.length === 0) {
    const chapters = toArray(
      getNestedValue(extractionRoot, ['chapters', 'lessons', 'items']),
    )
      .map((item) => normalizeAiChapterCandidate(item))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (chapters.length > 0) {
      units = [
        {
          title:
            coerceNonEmptyString(getNestedValue(extractionRoot, ['title', 'name'])) ?? '自动识别单元 1',
          confidence: 0.58,
          chapters,
        },
      ];
    }
  }

  if (units.length === 0 && pageAnchors.length === 0) {
    return null;
  }

  return normalizeAiTocExtraction({
    pageAnchors,
    units,
  });
}

function hasDirectAiExtractionFields(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }
  return 'pageAnchors' in payload || 'units' in payload;
}

function normalizeAiTocExtraction(extraction: AiTocExtraction): AiTocExtraction {
  const bestAnchorByPrintedPage = new Map<
    number,
    {
      printedPage: number;
      rawPage: number;
      confidence: number;
    }
  >();

  for (const anchor of extraction.pageAnchors) {
    const existing = bestAnchorByPrintedPage.get(anchor.printedPage);
    if (
      !existing ||
      anchor.confidence > existing.confidence ||
      (anchor.confidence === existing.confidence && anchor.rawPage < existing.rawPage)
    ) {
      bestAnchorByPrintedPage.set(anchor.printedPage, anchor);
    }
  }

  return {
    ...extraction,
    pageAnchors: [...bestAnchorByPrintedPage.values()].sort(
      (left, right) => left.printedPage - right.printedPage,
    ),
    units: extraction.units
      .map((unit) => ({
        ...unit,
        chapters: [...unit.chapters].sort((left, right) => {
          const leftPage = left.printedPage ?? Number.MAX_SAFE_INTEGER;
          const rightPage = right.printedPage ?? Number.MAX_SAFE_INTEGER;
          if (leftPage !== rightPage) {
            return leftPage - rightPage;
          }
          return left.title.localeCompare(right.title, 'zh-Hans-CN');
        }),
      }))
      .filter((unit) => unit.chapters.length > 0 || unit.title.trim().length > 0),
  };
}

function parseAiTocExtractionResponse(rawText: string): AiTocExtraction {
  return parseAiTocExtractionResponseDetailed(rawText).extraction;
}

function parseAiTocExtractionResponseDetailed(rawText: string): ParsedAiTocExtractionResponse {
  const parsedJson = parseJsonWithRepair(rawText);
  const strict = aiTocExtractionSchema.safeParse(parsedJson);
  if (
    strict.success &&
    (hasDirectAiExtractionFields(parsedJson) ||
      strict.data.pageAnchors.length > 0 ||
      strict.data.units.length > 0)
  ) {
    return {
      extraction: normalizeAiTocExtraction(strict.data),
      mode: 'strict',
    };
  }

  const salvaged = salvageAiTocExtraction(parsedJson);
  if (salvaged) {
    return {
      extraction: salvaged,
      mode: 'salvaged',
    };
  }

  throw strict.error;
}

interface ProposalResult {
  units: TextbookPdfImportUnitDraft[];
  unboundPages: number[];
  proposalSource: Exclude<TextbookPdfImportProposalSource, 'manual'>;
  proposalConfidence: number;
  tocCandidatePages: number[];
  pageAnchors: TextbookPdfImportPageAnchor[];
  conflictNotes: TextbookPdfImportConflictNote[];
  lowConfidencePages: number[];
  aiModel?: string;
}

interface AiExtractionAttemptResult {
  extraction: AiTocExtraction | null;
  note?: TextbookPdfImportConflictNote;
  modelString?: string;
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

function clampConfidence(value: number | undefined, fallback = 0): number {
  return Math.max(0, Math.min(1, Number(value) || fallback));
}

function averageConfidence(values: number[], fallback = 0.35): number {
  if (values.length === 0) {
    return fallback;
  }
  const total = values.reduce((sum, value) => sum + clampConfidence(value), 0);
  return clampConfidence(total / values.length, fallback);
}

function dedupeSortedPages(pages: number[]): number[] {
  return [...new Set(pages.map((page) => Number(page)).filter((page) => page > 0))].sort(
    (left, right) => left - right,
  );
}

function createConflictNote(
  code: TextbookPdfImportConflictNote['code'],
  message: string,
  extras?: Partial<TextbookPdfImportConflictNote>,
): TextbookPdfImportConflictNote {
  return {
    code,
    message,
    ...extras,
  };
}

function formatPageListPreview(pages: number[], limit = 12): string {
  if (pages.length === 0) {
    return '[]';
  }
  const preview = pages.slice(0, limit).join(', ');
  return pages.length > limit ? `${preview}, ... (${pages.length} total)` : preview;
}

function summarizeDraftState(draft: {
  id: string;
  scope: string;
  libraryId: string;
  volumeId: string;
  filename: string;
  size: number;
  status: string;
}) {
  return {
    draftId: draft.id,
    scope: draft.scope,
    libraryId: draft.libraryId,
    volumeId: draft.volumeId,
    filename: draft.filename,
    size: draft.size,
    status: draft.status,
  };
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

function scoreTocPage(pageText: string): number {
  const lines = splitLines(pageText);
  return lines.reduce((total, line) => {
    const compact = compactWhitespace(line);
    if (/目录|contents/i.test(line)) {
      return total + 8;
    }
    if (/^［\d+］$/.test(compact)) {
      return total + 5;
    }
    if (/^\d+.+［\d+］$/.test(compact)) {
      return total + 4;
    }
    if (/^第[一二三四五六七八九十百千万0-9]+(单元|课|章|节).+\d+$/.test(compact)) {
      return total + 4;
    }
    if (/\.{2,}\d+$/.test(line)) {
      return total + 3;
    }
    if (/^\d+\s/.test(line)) {
      return total + 1;
    }
    return total;
  }, 0);
}

function findPrimaryTocPage(pageTexts: string[]): string | null {
  let bestPageText: string | null = null;
  let bestScore = 0;

  for (const pageText of pageTexts) {
    const score = scoreTocPage(pageText);
    if (score > bestScore) {
      bestScore = score;
      bestPageText = pageText;
    }
  }

  return bestScore > 0 ? bestPageText : null;
}

function findTocCandidatePages(pageTexts: string[], maxPages = DEFAULT_AI_MAX_PAGES): number[] {
  return pageTexts
    .slice(0, Math.max(1, maxPages))
    .map((pageText, index) => ({
      rawPage: index + 1,
      score: scoreTocPage(pageText),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.rawPage - right.rawPage;
    })
    .slice(0, 3)
    .map((item) => item.rawPage);
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

function collectRulePageAnchors(pageTexts: string[]): TextbookPdfImportPageAnchor[] {
  const anchors: TextbookPdfImportPageAnchor[] = [];
  for (const [index, pageText] of pageTexts.entries()) {
    const printedPage = extractPrintedPageNumber(splitLines(pageText));
    if (!printedPage) {
      continue;
    }
    anchors.push({
      printedPage,
      rawPage: index + 1,
      confidence: 0.78,
      source: 'rules',
    });
  }
  return anchors;
}

function mergePageAnchors(
  ...groups: TextbookPdfImportPageAnchor[][]
): TextbookPdfImportPageAnchor[] {
  const bestByPrintedPage = new Map<number, TextbookPdfImportPageAnchor>();

  for (const anchor of groups.flat()) {
    const existing = bestByPrintedPage.get(anchor.printedPage);
    if (
      !existing ||
      anchor.confidence > existing.confidence ||
      (anchor.confidence === existing.confidence &&
        existing.source !== 'rules' &&
        anchor.source === 'rules') ||
      (anchor.confidence === existing.confidence &&
        anchor.source === existing.source &&
        anchor.rawPage < existing.rawPage)
    ) {
      bestByPrintedPage.set(anchor.printedPage, anchor);
    }
  }

  return [...bestByPrintedPage.values()].sort((left, right) => left.printedPage - right.printedPage);
}

function validateAiPageAnchors(
  pageTexts: string[],
  aiAnchors: TextbookPdfImportPageAnchor[],
): {
  verifiedAnchors: TextbookPdfImportPageAnchor[];
  rejectedAnchors: TextbookPdfImportPageAnchor[];
} {
  const verifiedAnchors: TextbookPdfImportPageAnchor[] = [];
  const rejectedAnchors: TextbookPdfImportPageAnchor[] = [];

  for (const anchor of aiAnchors) {
    const pageText = pageTexts[anchor.rawPage - 1] ?? '';
    const printedPageCandidate = extractPrintedPageNumber(splitLines(pageText));
    if (printedPageCandidate === anchor.printedPage) {
      verifiedAnchors.push(anchor);
      continue;
    }
    rejectedAnchors.push(anchor);
  }

  return {
    verifiedAnchors,
    rejectedAnchors,
  };
}

function computeUnboundPages(pageCount: number, units: TextbookPdfImportUnitDraft[]): number[] {
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
  return unboundPages;
}

function computeLowConfidencePages(units: TextbookPdfImportUnitDraft[]): number[] {
  const pages = new Set<number>();
  for (const unit of units) {
    for (const chapter of unit.chapters) {
      if (!chapter.needsReview && clampConfidence(chapter.confidence) >= LOW_CONFIDENCE_THRESHOLD) {
        continue;
      }
      for (let page = chapter.pageStart; page <= chapter.pageEnd; page += 1) {
        pages.add(page);
      }
    }
  }
  return [...pages].sort((left, right) => left - right);
}

function finalizeProposal(
  pageCount: number,
  input: Omit<ProposalResult, 'unboundPages' | 'lowConfidencePages' | 'proposalConfidence'> & {
    proposalConfidence?: number;
  },
): ProposalResult {
  const units = input.units.map((unit, unitIndex) => ({
    ...unit,
    order: unitIndex,
    chapters: unit.chapters.map((chapter, chapterIndex) => ({
      ...chapter,
      order: chapterIndex,
      pageStart: Math.max(1, Number(chapter.pageStart) || 1),
      pageEnd: Math.min(pageCount, Math.max(Number(chapter.pageEnd) || chapter.pageStart || 1, Number(chapter.pageStart) || 1)),
      confidence: clampConfidence(chapter.confidence, input.proposalConfidence ?? 0.35),
      printedPage: chapter.printedPage ? Math.max(1, Number(chapter.printedPage)) : undefined,
      source: chapter.source ?? input.proposalSource,
      needsReview:
        Boolean(chapter.needsReview) ||
        clampConfidence(chapter.confidence, input.proposalConfidence ?? 0.35) < LOW_CONFIDENCE_THRESHOLD,
    })),
    source: unit.source ?? input.proposalSource,
    needsReview:
      Boolean(unit.needsReview) ||
      unit.chapters.some((chapter) => Boolean(chapter.needsReview)),
  }));
  const flattened = units.flatMap((unit) => unit.chapters);
  const proposalConfidence =
    typeof input.proposalConfidence === 'number'
      ? clampConfidence(input.proposalConfidence)
      : averageConfidence(flattened.map((chapter) => chapter.confidence));
  const unboundPages = computeUnboundPages(pageCount, units);
  const lowConfidencePages = computeLowConfidencePages(units);
  const conflictNotes = [...input.conflictNotes];

  for (const page of lowConfidencePages) {
    if (conflictNotes.some((note) => note.code === 'low-confidence-page' && note.page === page)) {
      continue;
    }
    conflictNotes.push(
      createConflictNote('low-confidence-page', `第 ${page} 页切分置信度偏低，建议人工复核`, {
        page,
        source: input.proposalSource,
      }),
    );
  }

  return {
    ...input,
    units,
    unboundPages,
    proposalConfidence,
    tocCandidatePages: dedupeSortedPages(input.tocCandidatePages),
    pageAnchors: input.pageAnchors
      .map((anchor) => ({
        printedPage: Math.max(1, Number(anchor.printedPage) || 1),
        rawPage: Math.max(1, Number(anchor.rawPage) || 1),
        confidence: clampConfidence(anchor.confidence),
        source: anchor.source,
      }))
      .sort((left, right) => left.printedPage - right.printedPage),
    conflictNotes,
    lowConfidencePages,
  };
}

function buildProposalFromToc(
  pageTexts: string[],
  tocUnits: TocUnitEntry[],
): ProposalResult | null {
  const pageAnchors = collectRulePageAnchors(pageTexts);
  const bookPageToRawPage = new Map<number, number>();
  for (const anchor of pageAnchors) {
    if (!bookPageToRawPage.has(anchor.printedPage)) {
      bookPageToRawPage.set(anchor.printedPage, anchor.rawPage);
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
        printedPage: chapter.bookPage,
        rawPage: bookPageToRawPage.get(chapter.bookPage),
        order: chapterIndex,
      }))
      .filter((chapter): chapter is { title: string; printedPage: number; rawPage: number; order: number } =>
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
      source: 'rules',
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
        printedPage: current.printedPage,
        source: 'rules',
        needsReview: false,
      });
    }

    units.push(unit);
  }

  if (units.length === 0) {
    return null;
  }

  return finalizeProposal(pageTexts.length, {
    units,
    proposalSource: 'rules',
    tocCandidatePages: findTocCandidatePages(pageTexts),
    pageAnchors,
    conflictNotes: [],
  });
}

function buildFallbackProposal(pageTexts: string[]): ProposalResult {
  return finalizeProposal(Math.max(1, pageTexts.length), {
    units: [
      {
        id: 'import-unit-1',
        title: '自动导入单元',
        order: 0,
        source: 'fallback',
        chapters: [
          {
            id: 'import-chapter-1',
            title: '自动导入章节',
            order: 0,
            pageStart: 1,
            pageEnd: Math.max(1, pageTexts.length),
            confidence: 0.35,
            source: 'fallback',
            needsReview: true,
          },
        ],
      },
    ],
    proposalSource: 'fallback',
    tocCandidatePages: findTocCandidatePages(pageTexts),
    pageAnchors: collectRulePageAnchors(pageTexts),
    conflictNotes: [
      createConflictNote('mapping-low-confidence', '未识别到稳定目录结构，已回退为单章节草稿', {
        source: 'fallback',
      }),
    ],
  });
}

function buildRuleProposal(pageTexts: string[]): ProposalResult {
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
    return buildFallbackProposal(pageTexts);
  }

  const units: TextbookPdfImportUnitDraft[] = [];
  let currentUnit: TextbookPdfImportUnitDraft | null = null;

  const ensureUnit = () => {
    if (!currentUnit) {
      currentUnit = {
        id: `import-unit-${units.length + 1}`,
        title: units.length === 0 ? '自动导入单元' : `自动导入单元 ${units.length + 1}`,
        order: units.length,
        source: 'rules',
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
        source: 'rules',
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
        source: 'rules',
        needsReview: false,
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
      return finalizeProposal(pageCount, {
        units: unitMarkers.map((marker, index) => {
          const nextMarker = unitMarkers[index + 1];
          const pageStart = marker.page;
          const pageEnd = nextMarker ? Math.max(pageStart, nextMarker.page - 1) : pageCount;
          return {
            id: `import-unit-${index + 1}`,
            title: marker.title,
            order: index,
            source: 'rules',
            chapters: [
              {
                id: `import-chapter-${index + 1}-1`,
                title: `${marker.title} 导入内容`,
                order: 0,
                pageStart,
                pageEnd,
                confidence: 0.5,
                source: 'rules',
                needsReview: true,
              },
            ],
          };
        }),
        proposalSource: 'rules',
        tocCandidatePages: findTocCandidatePages(pageTexts),
        pageAnchors: collectRulePageAnchors(pageTexts),
        conflictNotes: [
          createConflictNote('mapping-low-confidence', '仅识别到单元标题，章节边界需要人工确认', {
            source: 'rules',
          }),
        ],
      });
    }
    return buildFallbackProposal(pageTexts);
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
        source: 'rules',
        needsReview: true,
      });
    }
  }

  return finalizeProposal(pageCount, {
    units,
    proposalSource: 'rules',
    tocCandidatePages: findTocCandidatePages(pageTexts),
    pageAnchors: collectRulePageAnchors(pageTexts),
    conflictNotes: [],
  });
}

function buildAiExtractionContext(
  pageTexts: string[],
  maxPages = DEFAULT_AI_MAX_PAGES,
): AiExtractionContext {
  const sampledPages = pageTexts.slice(0, Math.max(1, maxPages)).map((pageText, index) => {
    return {
      rawPage: index + 1,
      printedPageCandidate: extractPrintedPageNumber(splitLines(pageText)),
      tocScore: scoreTocPage(pageText),
      textPreview: splitLines(pageText).slice(0, 24).join('\n').slice(0, 2400),
    };
  });

  return {
    sampledPages,
    tocCandidatePages: dedupeSortedPages(
      sampledPages.filter((page) => page.tocScore > 0).map((page) => page.rawPage),
    ).slice(0, 3),
  };
}

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

function isAiImportEnabled(): boolean {
  const raw = process.env.TEXTBOOK_PDF_IMPORT_AI_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function getAiTimeoutMs(): number {
  return Math.max(1_000, Number(process.env.TEXTBOOK_PDF_IMPORT_AI_TIMEOUT_MS) || DEFAULT_AI_TIMEOUT_MS);
}

function getAiMaxPages(): number {
  return Math.max(1, Math.min(12, Number(process.env.TEXTBOOK_PDF_IMPORT_AI_MAX_PAGES) || DEFAULT_AI_MAX_PAGES));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TEXTBOOK_IMPORT_AI_TIMEOUT')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function getCreateCanvas(): Promise<CreateCanvasFn | null> {
  if (cachedCreateCanvas !== undefined) {
    return cachedCreateCanvas;
  }

  try {
    const canvasModule = (await import('@napi-rs/canvas')) as {
      createCanvas?: CreateCanvasFn;
    };
    cachedCreateCanvas =
      typeof canvasModule.createCanvas === 'function' ? canvasModule.createCanvas : null;
    if (!cachedCreateCanvas) {
      log.warn('教材 PDF 视觉渲染不可用，@napi-rs/canvas 未导出 createCanvas，已回退到纯文本 AI 解析');
    }
  } catch (error) {
    cachedCreateCanvas = null;
    log.warn('教材 PDF 视觉渲染不可用，@napi-rs/canvas 原生绑定缺失，已回退到纯文本 AI 解析', error);
  }

  return cachedCreateCanvas;
}

async function renderPdfPagesForVision(
  pdf: {
    getPage: (pageNumber: number) => Promise<{
      getViewport: (params: { scale: number }) => { width: number; height: number };
      render: (params: {
        canvasContext: object;
        viewport: { width: number; height: number };
      }) => { promise: Promise<unknown> };
    }>;
  },
  pageNumbers: number[],
): Promise<AiVisionPageImage[]> {
  const createCanvas = await getCreateCanvas();
  if (!createCanvas) {
    log.info('教材 PDF 视觉渲染未启用，继续使用文本解析上下文');
    return [];
  }

  const results: AiVisionPageImage[] = [];
  log.info(
    `准备渲染教材 PDF 视觉页: pages=${formatPageListPreview(dedupeSortedPages(pageNumbers))}`,
  );

  for (const pageNumber of dedupeSortedPages(pageNumbers)) {
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      results.push({
        id: `pdf_page_${pageNumber}`,
        src: canvas.toDataURL('image/png'),
        width: Math.ceil(viewport.width),
        height: Math.ceil(viewport.height),
      });
    } catch (error) {
      log.warn(`教材 PDF 第 ${pageNumber} 页渲染为视觉图片失败，已跳过该页`, error);
    }
  }

  log.info(`教材 PDF 视觉页渲染完成: success=${results.length}`);

  return results;
}

async function runAiTocExtraction(
  pageTexts: string[],
  pdf?: {
    getPage: (pageNumber: number) => Promise<{
      getViewport: (params: { scale: number }) => { width: number; height: number };
      render: (params: {
        canvasContext: object;
        viewport: { width: number; height: number };
      }) => { promise: Promise<unknown> };
    }>;
  },
): Promise<AiExtractionAttemptResult> {
  if (!isAiImportEnabled()) {
    log.info('教材 PDF AI 辅助已关闭，使用规则解析');
    return {
      extraction: null,
      note: createConflictNote('ai-disabled', 'AI 辅助目录识别已关闭，当前使用规则解析结果', {
        source: 'system',
      }),
    };
  }

  const preferredModelString =
    process.env.TEXTBOOK_PDF_IMPORT_AI_MODEL?.trim() || process.env.DEFAULT_MODEL || 'gpt-4o-mini';
  const { providerId } = parseModelString(preferredModelString);
  const apiKey = resolveApiKey(providerId);
  if (!apiKey) {
    log.warn(
      `教材 PDF AI 模型缺少 API key，已回退到规则解析: model=${preferredModelString}, provider=${providerId}`,
    );
    return {
      extraction: null,
      modelString: preferredModelString,
      note: createConflictNote('ai-unavailable', '未配置可用的 AI 模型密钥，已回退到规则解析', {
        source: 'system',
      }),
    };
  }

  const { model: languageModel, modelInfo, modelString: resolvedModelString } = resolveModel({
    modelString: preferredModelString,
    requiresApiKey: false,
  });
  log.info(
    `教材 PDF AI 开始调用: model=${resolvedModelString}, provider=${providerId}, vision=${Boolean(modelInfo?.capabilities?.vision)}, timeoutMs=${getAiTimeoutMs()}`,
  );

  const context = buildAiExtractionContext(pageTexts, getAiMaxPages());
  log.debug('教材 PDF AI 解析上下文', {
    totalPages: pageTexts.length,
    tocCandidatePages: context.tocCandidatePages,
    sampledPages: context.sampledPages.map((page) => ({
      rawPage: page.rawPage,
      printedPageCandidate: page.printedPageCandidate,
      tocScore: page.tocScore,
      textPreview: page.textPreview.slice(0, 120),
    })),
  });
  const visionPages =
    context.tocCandidatePages.length > 0
      ? context.tocCandidatePages
      : context.sampledPages.slice(0, 3).map((page) => page.rawPage);
  const visionImages =
    modelInfo?.capabilities?.vision && pdf
      ? await renderPdfPagesForVision(pdf, visionPages)
      : [];
  log.info(
    `教材 PDF AI 提示词模式: ${visionImages.length > 0 ? 'vision' : 'text-only'}, tocCandidates=${context.tocCandidatePages.length}, visionImages=${visionImages.length}`,
  );
  const promptPayload = {
    task: '识别教材 PDF 前几页中的目录候选、目录层级、印刷页码锚点',
    outputRequirements: {
      pageAnchors: '印刷页码 printedPage 与 PDF 原始页码 rawPage 的映射锚点',
      units: '单元列表，每个单元包含章节列表与 printedPage',
    },
    sampledPages: context.sampledPages,
  };

  const systemPrompt =
    '你是教材 PDF 目录解析器。你只能返回合法 JSON，不要输出解释、Markdown、注释或多余文本。若信息不确定，请降低 confidence，不要编造缺失页码。';

  const userPrompt = `请根据下面的教材前几页 OCR / 文本抽取结果，识别目录层级和页码锚点。

返回 JSON，字段严格限制为：
{
  "pageAnchors": [{ "printedPage": number, "rawPage": number, "confidence": number }],
  "units": [{
    "title": string,
    "confidence": number,
    "chapters": [{
      "title": string,
      "printedPage": number | null,
      "confidence": number
    }]
  }]
}

要求：
1. 不确定时保留条目，但 confidence 必须低于 0.7。
2. 章节 printedPage 指教材印刷页码，不是 PDF 原始页码。
3. pageAnchors 只能填写你能从页面文本中直接判断的锚点。
4. 如果看不到稳定目录，也要尽量输出低置信度结构，不要返回空对象。

上下文如下：
${JSON.stringify(promptPayload, null, 2)}`;

  try {
    const result = await withTimeout(
      callLLM(
        visionImages.length > 0
          ? {
              model: languageModel,
              system: systemPrompt,
              messages: [
                {
                  role: 'user',
                  content: buildVisionUserContent(userPrompt, visionImages),
                },
              ],
              maxOutputTokens: Math.min(modelInfo?.outputWindow ?? 2_048, 2_048),
            }
          : {
              model: languageModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              maxOutputTokens: Math.min(modelInfo?.outputWindow ?? 2_048, 2_048),
            },
        'textbook-pdf-import-toc',
      ),
      getAiTimeoutMs(),
    );
    log.debug(
      `教材 PDF AI 返回完成: chars=${result.text.length}, model=${resolvedModelString}, vision=${visionImages.length > 0}`,
    );

    const parsed = parseAiTocExtractionResponseDetailed(result.text);
    if (parsed.mode === 'salvaged') {
      log.warn(`教材 PDF AI 返回非标准 JSON，已启用兜底解析: model=${resolvedModelString}`);
    }
    log.info(
      `教材 PDF AI 解析成功: anchors=${parsed.extraction.pageAnchors.length}, units=${parsed.extraction.units.length}, mode=${parsed.mode}`,
    );
    return {
      extraction: parsed.extraction,
      modelString: resolvedModelString,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'TEXTBOOK_IMPORT_AI_TIMEOUT') {
      log.warn(`教材 PDF AI 调用超时，已回退规则解析: model=${resolvedModelString}`);
      return {
        extraction: null,
        modelString: resolvedModelString,
        note: createConflictNote('ai-timeout', 'AI 目录识别超时，已自动回退到规则解析', {
          source: 'system',
        }),
      };
    }
    if (error instanceof z.ZodError) {
      log.warn(
        `教材 PDF AI 返回 JSON 结构不符合约束，已回退规则解析: model=${resolvedModelString}`,
        error,
      );
      return {
        extraction: null,
        modelString: resolvedModelString,
        note: createConflictNote('ai-invalid-json', 'AI 返回 JSON 结构不符合预期，已使用规则解析', {
          source: 'system',
        }),
      };
    }
    if (error instanceof SyntaxError) {
      log.warn(
        `教材 PDF AI 返回不可解析 JSON，已回退规则解析: model=${resolvedModelString}`,
        error,
      );
      return {
        extraction: null,
        modelString: resolvedModelString,
        note: createConflictNote('ai-invalid-json', 'AI 返回结果无法解析为合法目录 JSON，已使用规则解析', {
          source: 'system',
        }),
      };
    }
    log.warn('教材 PDF AI 目录识别失败，已回退到规则解析', error);
    return {
      extraction: null,
      modelString: resolvedModelString,
      note: createConflictNote('ai-failed', 'AI 目录识别失败，已回退到规则解析', {
        source: 'system',
      }),
    };
  }
}

function buildPageMapper(
  pageAnchors: TextbookPdfImportPageAnchor[],
  conflictNotes: TextbookPdfImportConflictNote[],
) {
  const direct = new Map<number, TextbookPdfImportPageAnchor>();
  const offsetScores = new Map<number, number>();

  for (const anchor of pageAnchors) {
    direct.set(anchor.printedPage, anchor);
    const offset = anchor.rawPage - anchor.printedPage;
    offsetScores.set(offset, (offsetScores.get(offset) ?? 0) + anchor.confidence);
  }

  const dominantOffsetEntry = [...offsetScores.entries()].sort((left, right) => right[1] - left[1])[0];
  const dominantOffset = dominantOffsetEntry?.[0];
  const dominantOffsetConfidence = dominantOffsetEntry
    ? clampConfidence(Math.min(0.84, dominantOffsetEntry[1] / Math.max(pageAnchors.length, 1)))
    : 0;

  if (!dominantOffsetEntry) {
    conflictNotes.push(
      createConflictNote('mapping-low-confidence', '未找到稳定页码锚点，页码映射需要人工确认', {
        source: 'system',
      }),
    );
  }

  return (printedPage: number | null | undefined) => {
    if (!printedPage) {
      return null;
    }
    const directAnchor = direct.get(printedPage);
    if (directAnchor) {
      return {
        rawPage: directAnchor.rawPage,
        confidence: directAnchor.confidence,
        source: directAnchor.source,
      };
    }
    if (typeof dominantOffset === 'number') {
      const inferredSource = pageAnchors.some((anchor) => anchor.source === 'rules') ? 'rules' : 'ai';
      return {
        rawPage: printedPage + dominantOffset,
        confidence: clampConfidence(Math.max(0.55, dominantOffsetConfidence)),
        source: inferredSource,
      };
    }
    return null;
  };
}

function buildAiProposal(
  pageTexts: string[],
  extraction: AiTocExtraction,
  aiModel?: string,
): ProposalResult | null {
  const aiAnchors: TextbookPdfImportPageAnchor[] = extraction.pageAnchors.map((anchor) => ({
    printedPage: anchor.printedPage,
    rawPage: anchor.rawPage,
    confidence: clampConfidence(anchor.confidence, 0.8),
    source: 'ai',
  }));
  const conflictNotes: TextbookPdfImportConflictNote[] = [];
  const ruleAnchors = collectRulePageAnchors(pageTexts);
  const { verifiedAnchors: verifiedAiAnchors, rejectedAnchors } = validateAiPageAnchors(
    pageTexts,
    aiAnchors,
  );
  const mappingAnchors =
    ruleAnchors.length > 0
      ? mergePageAnchors(ruleAnchors, verifiedAiAnchors)
      : verifiedAiAnchors.length > 0
        ? verifiedAiAnchors
        : aiAnchors;

  if (rejectedAnchors.length > 0) {
    conflictNotes.push(
      createConflictNote(
        'mapping-low-confidence',
        `已忽略 ${rejectedAnchors.length} 个与 PDF 实际页码不一致的 AI 锚点`,
        {
          source: 'ai',
        },
      ),
    );
  }

  if (ruleAnchors.length > 0 && mappingAnchors.some((anchor) => anchor.source === 'rules')) {
    conflictNotes.push(
      createConflictNote('mapping-low-confidence', '页码映射已优先使用 PDF 实际页码锚点校正 AI 结果', {
        source: 'rules',
      }),
    );
  }

  const mapPrintedPage = buildPageMapper(mappingAnchors, conflictNotes);
  const units: TextbookPdfImportUnitDraft[] = [];
  const pageCount = Math.max(1, pageTexts.length);

  for (const [unitIndex, aiUnit] of extraction.units.entries()) {
    const chapters: TextbookPdfImportChapterDraft[] = [];
    for (const [chapterIndex, aiChapter] of aiUnit.chapters.entries()) {
      const mapped = mapPrintedPage(aiChapter.printedPage ?? undefined);

      const rawPage = mapped?.rawPage;
      const confidence = averageConfidence([
        clampConfidence(aiUnit.confidence, 0.8),
        clampConfidence(aiChapter.confidence, 0.8),
        mapped?.confidence ?? 0,
      ]);
      const source: Exclude<TextbookPdfImportProposalSource, 'fallback' | 'manual'> = 'ai';
      const needsReview = confidence < LOW_CONFIDENCE_THRESHOLD;

      if (!rawPage) {
        conflictNotes.push(
          createConflictNote('mapping-low-confidence', `章节“${aiChapter.title}”未找到可靠起始页`, {
            chapterTitle: aiChapter.title,
            source: 'ai',
          }),
        );
        continue;
      }

      chapters.push({
        id: `import-chapter-${unitIndex + 1}-${chapterIndex + 1}`,
        title: aiChapter.title,
        order: chapterIndex,
        pageStart: Math.max(1, Math.min(pageCount, rawPage)),
        pageEnd: Math.max(1, Math.min(pageCount, rawPage)),
        confidence,
        printedPage: aiChapter.printedPage ?? undefined,
        source,
        needsReview,
      });
    }

    chapters.sort((left, right) => left.pageStart - right.pageStart);
    if (chapters.length === 0) {
      continue;
    }

    units.push({
      id: `import-unit-${unitIndex + 1}`,
      title: aiUnit.title,
      order: unitIndex,
      source: 'ai',
      needsReview:
        clampConfidence(aiUnit.confidence, 0.8) < LOW_CONFIDENCE_THRESHOLD ||
        chapters.some((chapter) => Boolean(chapter.needsReview)),
      chapters,
    });
  }

  if (units.length === 0) {
    return null;
  }

  const flatChapters = units.flatMap((unit) => unit.chapters);
  const globalChapters = [...flatChapters].sort((left, right) => {
    if (left.pageStart !== right.pageStart) {
      return left.pageStart - right.pageStart;
    }
    if ((left.printedPage ?? Number.MAX_SAFE_INTEGER) !== (right.printedPage ?? Number.MAX_SAFE_INTEGER)) {
      return (left.printedPage ?? Number.MAX_SAFE_INTEGER) - (right.printedPage ?? Number.MAX_SAFE_INTEGER);
    }
    return left.order - right.order;
  });
  for (let index = 0; index < globalChapters.length; index += 1) {
    const current = globalChapters[index];
    const next = globalChapters[index + 1];
    current.pageEnd = next ? Math.max(current.pageStart, next.pageStart - 1) : pageCount;
  }

  return finalizeProposal(pageCount, {
    units,
    proposalSource: 'ai',
    tocCandidatePages: findTocCandidatePages(pageTexts),
    pageAnchors: mappingAnchors,
    conflictNotes,
    aiModel,
  });
}

async function buildImportProposal(
  pageTexts: string[],
  pdf?: {
    getPage: (pageNumber: number) => Promise<{
      getViewport: (params: { scale: number }) => { width: number; height: number };
      render: (params: {
        canvasContext: object;
        viewport: { width: number; height: number };
      }) => { promise: Promise<unknown> };
    }>;
  },
): Promise<ProposalResult> {
  log.info(
    `开始生成教材 PDF 导入提议: pages=${pageTexts.length}, aiEnabled=${isAiImportEnabled()}, aiModel=${process.env.TEXTBOOK_PDF_IMPORT_AI_MODEL?.trim() || process.env.DEFAULT_MODEL || 'gpt-4o-mini'}`,
  );
  const aiAttempt = await runAiTocExtraction(pageTexts, pdf);
  if (aiAttempt.note) {
    log.info(`AI 解析提示: ${aiAttempt.note.code} - ${aiAttempt.note.message}`);
  }
  const aiProposal = aiAttempt.extraction
    ? buildAiProposal(pageTexts, aiAttempt.extraction, aiAttempt.modelString)
    : null;
  if (aiProposal) {
    log.info(
      `AI 提议完成: source=${aiProposal.proposalSource}, units=${aiProposal.units.length}, chapters=${aiProposal.units.reduce((total, unit) => total + unit.chapters.length, 0)}, anchors=${aiProposal.pageAnchors.length}, conflicts=${aiProposal.conflictNotes.length}, lowConfidencePages=${aiProposal.lowConfidencePages.length}`,
    );
    return aiProposal;
  }

  const ruleProposal = buildRuleProposal(pageTexts);
  log.info(
    `规则回退完成: source=${ruleProposal.proposalSource}, units=${ruleProposal.units.length}, chapters=${ruleProposal.units.reduce((total, unit) => total + unit.chapters.length, 0)}, anchors=${ruleProposal.pageAnchors.length}, lowConfidencePages=${ruleProposal.lowConfidencePages.length}`,
  );
  const merged = finalizeProposal(Math.max(1, pageTexts.length), {
    ...ruleProposal,
    conflictNotes: aiAttempt.note ? [...ruleProposal.conflictNotes, aiAttempt.note] : ruleProposal.conflictNotes,
    aiModel: aiAttempt.modelString,
  });
  log.info(
    `教材 PDF 导入提议已回退: source=${merged.proposalSource}, confidence=${Math.round(merged.proposalConfidence * 100)}%, units=${merged.units.length}, chapters=${merged.units.reduce((total, unit) => total + unit.chapters.length, 0)}, unboundPages=${merged.unboundPages.length}, anchors=${merged.pageAnchors.length}, conflicts=${merged.conflictNotes.length}, lowConfidencePages=${merged.lowConfidencePages.length}`,
  );
  log.debug('教材 PDF 导入提议详情', {
    tocCandidatePages: merged.tocCandidatePages,
    pageAnchors: merged.pageAnchors,
    conflictNotes: merged.conflictNotes,
    lowConfidencePages: merged.lowConfidencePages,
  });
  return merged;
}

export async function runTextbookPdfImportProcessing(draftId: string): Promise<void> {
  const draft = await getTextbookPdfImportDraft(draftId);
  if (!draft) {
    log.warn(`教材 PDF 导入草稿不存在，跳过解析: draftId=${draftId}`);
    return;
  }

  const parserJobId = `textbook-import-${randomUUID()}`;
  log.info(
    `教材 PDF 导入解析开始: ${JSON.stringify(summarizeDraftState(draft))}, parserJobId=${parserJobId}`,
  );
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
    log.info(
      `教材 PDF 源文件读取成功: draftId=${draftId}, filename=${blob.filename}, mimeType=${blob.mimeType}, size=${blob.buffer.length}`,
    );

    const pdf = await getDocumentProxy(new Uint8Array(blob.buffer));
    const { totalPages, text: pageTexts } = await extractText(pdf);
    const mergedText = pageTexts.join('\n');
    log.info(
      `教材 PDF 文本抽取完成: draftId=${draftId}, totalPages=${totalPages}, extractedPages=${pageTexts.length}, textChars=${mergedText.length}`,
    );
    log.debug('教材 PDF 前几页文本预览', {
      draftId,
      firstPages: pageTexts.slice(0, Math.min(5, pageTexts.length)).map((text, index) => ({
        page: index + 1,
        preview: text.slice(0, 160),
      })),
    });
    const proposal = await buildImportProposal(pageTexts, pdf);

    await updateTextbookPdfImportProcessing({
      draftId,
      status: 'ready',
      parserJobId,
      pageCount: totalPages,
      extractedText: mergedText,
      units: proposal.units,
      unboundPages: proposal.unboundPages,
      proposalSource: proposal.proposalSource,
      proposalConfidence: proposal.proposalConfidence,
      aiModel: proposal.aiModel,
      tocCandidatePages: proposal.tocCandidatePages,
      pageAnchors: proposal.pageAnchors,
      conflictNotes: proposal.conflictNotes,
      lowConfidencePages: proposal.lowConfidencePages,
      parseError: undefined,
    });
    log.info(
      `教材 PDF 导入解析完成: draftId=${draftId}, status=ready, proposalSource=${proposal.proposalSource}, units=${proposal.units.length}, chapters=${proposal.units.reduce((total, unit) => total + unit.chapters.length, 0)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`教材 PDF 导入解析失败 [draftId=${draftId}]`, error);
    await updateTextbookPdfImportProcessing({
      draftId,
      status: 'failed',
      parserJobId,
      parseError: message,
    });
    log.warn(`教材 PDF 导入解析已标记失败: draftId=${draftId}, error=${message}`);
  }
}

export const __testables = {
  buildAiExtractionContext,
  buildAiProposal,
  buildRuleProposal,
  buildImportProposal,
  buildProposal: buildRuleProposal,
  parseAiTocExtractionResponse,
  parseAiTocExtractionResponseDetailed,
};
