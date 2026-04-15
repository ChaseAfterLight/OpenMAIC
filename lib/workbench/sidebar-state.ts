import type { TextbookChapterTreeNode } from '@/lib/utils/textbook-chapter-tree';

const EXPANDED_CHAPTER_PREFIX = 'workbench:chapter-tree-expanded';

function collectNodeIds(nodes: TextbookChapterTreeNode[], ids: Set<string>) {
  for (const node of nodes) {
    ids.add(node.id);
    if (node.children?.length) {
      collectNodeIds(node.children, ids);
    }
  }
}

export function getWorkbenchChapterTreeStorageKey(moduleId: string) {
  return `${EXPANDED_CHAPTER_PREFIX}:${moduleId}`;
}

export function sanitizeSelectedChapterPath(
  treeData: TextbookChapterTreeNode[],
  selectedPath: string[],
) {
  const nextPath: string[] = [];
  let currentLevel = treeData;

  for (const segment of selectedPath) {
    const currentNode = currentLevel.find((node) => node.id === segment);
    if (!currentNode) {
      break;
    }
    nextPath.push(segment);
    currentLevel = currentNode.children ?? [];
  }

  return nextPath;
}

export function sanitizeExpandedChapterKeys(
  treeData: TextbookChapterTreeNode[],
  expandedKeys: Iterable<string>,
  activePath: string[] = [],
) {
  const validNodeIds = new Set<string>();
  collectNodeIds(treeData, validNodeIds);

  const nextKeys = new Set<string>();
  for (const key of expandedKeys) {
    if (validNodeIds.has(key)) {
      nextKeys.add(key);
    }
  }

  for (const segment of activePath.slice(0, -1)) {
    if (validNodeIds.has(segment)) {
      nextKeys.add(segment);
    }
  }

  return nextKeys;
}
