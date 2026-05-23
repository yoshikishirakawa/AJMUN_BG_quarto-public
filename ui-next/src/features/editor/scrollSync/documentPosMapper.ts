/**
 * Document Position Mapper
 * 
 * Editor/Preview ⇔ DocumentPos 変換関数
 * 中心位置(Center)を基準とした座標変換
 */

import { EditorView } from '@codemirror/view';
import type { DocumentPos, Anchor } from './types';

/**
 * エディタのscrollTopからDocumentPosを計算
 * ビューポート中心の行を基準とする
 */
export function editorScrollToDocPos(view: EditorView): DocumentPos {
  const scrollDOM = view.scrollDOM;
  const scrollTop = scrollDOM.scrollTop;
  const viewportHeight = scrollDOM.clientHeight;
  
  // ビューポート中心のY座標
  const centerY = scrollTop + viewportHeight * 0.5;
  
  try {
    // 中心Y座標にある行ブロックを取得
    const block = view.lineBlockAtHeight(centerY);
    const lineNumber = view.state.doc.lineAt(block.from).number;
    
    // ブロック内での位置を計算 (0.0~1.0)
    const fraction = Math.max(0, Math.min(1, (centerY - block.top) / block.height));
    
    return { line: lineNumber, fraction };
  } catch {
    // エラー時はドキュメント先頭を返す
    return { line: 1, fraction: 0 };
  }
}

/**
 * DocumentPosからエディタのtarget scrollTopを計算
 */
export function docPosToEditorScroll(view: EditorView, pos: DocumentPos): number {
  const scrollDOM = view.scrollDOM;
  const viewportHeight = scrollDOM.clientHeight;
  
  try {
    const lineInt = Math.floor(pos.line);
    const clampedLine = Math.max(1, Math.min(lineInt, view.state.doc.lines));
    
    const lineInfo = view.state.doc.line(clampedLine);
    const block = view.lineBlockAt(lineInfo.from);
    
    // 行内の位置を加味したY座標
    const targetY = block.top + block.height * pos.fraction;
    
    // 中心にくるようにscrollTopを計算
    const scrollTop = targetY - viewportHeight * 0.5;
    
    // 有効範囲にクランプ
    const maxScrollTop = scrollDOM.scrollHeight - viewportHeight;
    return Math.max(0, Math.min(scrollTop, maxScrollTop));
  } catch {
    return 0;
  }
}

/**
 * プレビューのscrollTopからDocumentPosを計算
 * アンカー配列を使用して行番号を特定
 */
export function previewScrollToDocPos(
  preview: HTMLElement,
  anchors: Anchor[]
): DocumentPos {
  if (anchors.length === 0) {
    return { line: 1, fraction: 0 };
  }
  
  const scrollTop = preview.scrollTop;
  const viewportHeight = preview.clientHeight;
  
  // ビューポート中心のY座標
  const centerY = scrollTop + viewportHeight * 0.5;
  
  // 二分探索で中心Y座標を含むアンカーを探す
  const anchor = findAnchorAtPosition(anchors, centerY);
  
  if (anchor) {
    // アンカー内での位置を計算
    const fraction = Math.max(0, Math.min(1, (centerY - anchor.top) / anchor.height));
    return { line: anchor.line, fraction };
  }
  
  // アンカーが見つからない場合、前後のアンカーから補間
  const { before, after } = findSurroundingAnchors(anchors, centerY);
  
  if (before && after) {
    // 線形補間で行番号を推定
    const t = (centerY - before.top) / (after.top - before.top);
    const interpolatedLine = before.line + (after.line - before.line) * t;
    return { line: interpolatedLine, fraction: 0.5 };
  }
  
  if (before) {
    return { line: before.line, fraction: 1 };
  }
  
  if (after) {
    return { line: after.line, fraction: 0 };
  }
  
  return { line: 1, fraction: 0 };
}

/**
 * DocumentPosからプレビューのtarget scrollTopを計算
 */
export function docPosToPreviewScroll(
  preview: HTMLElement,
  pos: DocumentPos,
  anchors: Anchor[]
): number {
  if (anchors.length === 0) {
    return 0;
  }
  
  const viewportHeight = preview.clientHeight;
  
  // 対象行のアンカーを二分探索
  const { before, after } = findSurroundingAnchorsByLine(anchors, pos.line);
  
  let targetY: number;
  
  if (before && after && before !== after) {
    // 前後アンカー間で線形補間
    const lineDiff = after.line - before.line;
    const t = (pos.line - before.line) / lineDiff;
    const interpolatedTop = before.top + (after.top - before.top) * t;
    const interpolatedHeight = before.height + (after.height - before.height) * t;
    targetY = interpolatedTop + interpolatedHeight * pos.fraction;
  } else if (before) {
    // 完全一致または前方のみ
    targetY = before.top + before.height * pos.fraction;
  } else if (after) {
    targetY = after.top;
  } else {
    return 0;
  }
  
  // 中心にくるようにscrollTopを計算
  const scrollTop = targetY - viewportHeight * 0.5;
  
  // 有効範囲にクランプ
  const maxScrollTop = preview.scrollHeight - viewportHeight;
  return Math.max(0, Math.min(scrollTop, maxScrollTop));
}

/**
 * 二分探索: 指定Y座標を含むアンカーを探す
 */
function findAnchorAtPosition(anchors: Anchor[], y: number): Anchor | null {
  let left = 0;
  let right = anchors.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const anchor = anchors[mid];
    
    if (anchor.top <= y && y < anchor.top + anchor.height) {
      return anchor;
    }
    
    if (anchor.top < y) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return null;
}

/**
 * 二分探索: Y座標の前後にあるアンカーを探す
 */
function findSurroundingAnchors(
  anchors: Anchor[],
  y: number
): { before: Anchor | null; after: Anchor | null } {
  let before: Anchor | null = null;
  let after: Anchor | null = null;
  
  let left = 0;
  let right = anchors.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const anchor = anchors[mid];
    
    if (anchor.top + anchor.height <= y) {
      before = anchor;
      left = mid + 1;
    } else if (anchor.top > y) {
      after = anchor;
      right = mid - 1;
    } else {
      // y is within this anchor
      return { before: anchor, after: anchor };
    }
  }
  
  return { before, after };
}

/**
 * 二分探索: 行番号の前後にあるアンカーを探す
 */
function findSurroundingAnchorsByLine(
  anchors: Anchor[],
  line: number
): { before: Anchor | null; after: Anchor | null } {
  let before: Anchor | null = null;
  let after: Anchor | null = null;
  
  let left = 0;
  let right = anchors.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const anchor = anchors[mid];
    
    if (anchor.line === Math.floor(line)) {
      return { before: anchor, after: anchor };
    }
    
    if (anchor.line < line) {
      before = anchor;
      left = mid + 1;
    } else {
      after = anchor;
      right = mid - 1;
    }
  }
  
  return { before, after };
}
