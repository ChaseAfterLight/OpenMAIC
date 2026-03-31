export interface TextbookChapterTreeNode {
  id: string;
  label: string;
  children?: TextbookChapterTreeNode[];
}

export interface TextbookChapterSource {
  grade?: string | null;
  subject?: string | null;
  textbookEdition?: string | null;
  chapter?: string | null;
}

interface TextbookChapterAccumulator {
  label: string;
  children: Map<string, TextbookChapterAccumulator>;
}

function normalizeSegment(value: string | null | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function insertNode(nodes: Map<string, TextbookChapterAccumulator>, label: string) {
  const existing = nodes.get(label);
  if (existing) return existing;

  const created = {
    label,
    children: new Map<string, TextbookChapterAccumulator>(),
  };

  nodes.set(label, created);
  return created;
}

function toTreeNodes(nodes: Map<string, TextbookChapterAccumulator>): TextbookChapterTreeNode[] {
  return Array.from(nodes.entries())
    .sort(([left], [right]) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
    )
    .map(([id, node]) => {
      const children = toTreeNodes(node.children);
      return children.length > 0 ? { id, label: node.label, children } : { id, label: node.label };
    });
}

export function buildTextbookChapterTree(
  records: TextbookChapterSource[],
): TextbookChapterTreeNode[] {
  const roots = new Map<string, TextbookChapterAccumulator>();

  for (const record of records) {
    const grade = normalizeSegment(record.grade);
    if (!grade) continue;

    const subject = normalizeSegment(record.subject);
    const edition = normalizeSegment(record.textbookEdition);
    const chapter = normalizeSegment(record.chapter);

    const gradeNode = insertNode(roots, grade);
    if (!subject) continue;

    const subjectNode = insertNode(gradeNode.children, subject);
    if (!edition) continue;

    const editionNode = insertNode(subjectNode.children, edition);
    if (!chapter) continue;

    insertNode(editionNode.children, chapter);
  }

  return toTreeNodes(roots);
}

export function matchesTextbookChapterPath(record: TextbookChapterSource, path: string[]): boolean {
  const normalizedPath = path
    .map((segment) => normalizeSegment(segment))
    .filter(Boolean) as string[];
  if (normalizedPath.length === 0) return true;

  const recordSegments = [
    normalizeSegment(record.grade),
    normalizeSegment(record.subject),
    normalizeSegment(record.textbookEdition),
    normalizeSegment(record.chapter),
  ];

  return normalizedPath.every((segment, index) => recordSegments[index] === segment);
}
