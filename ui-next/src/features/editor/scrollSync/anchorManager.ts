/**
 * Anchor Manager
 * 
 * プレビュー側の行位置マッピングを管理
 * ResizeObserver/MutationObserverで動的コンテンツに対応
 */

import type { Anchor } from './types';

export interface AnchorManagerState {
  anchors: Anchor[];
  isDirty: boolean;
  version: number;
}

/**
 * 要素のスクロールコンテナからの絶対オフセットを計算
 */
function getAbsoluteOffsetTop(element: HTMLElement, scrollContainer: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = element;
  
  while (current && current !== scrollContainer && scrollContainer.contains(current)) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  
  return top;
}

/**
 * アンカー配列を構築
 * data-source-line属性を持つ全要素から位置情報を収集
 * 
 * 特殊対応:
 * - lawquoteなどのコンテナ内では、子要素の位置を優先
 * - コンテナ自体のline番号は子要素がない場合のみ使用
 */
export function buildAnchors(preview: HTMLElement): Anchor[] {
  const elements = Array.from(
    preview.querySelectorAll<HTMLElement>('[data-source-line]')
  );
  
  const anchors: Anchor[] = [];
  const processedElements = new Set<HTMLElement>();
  
  for (const element of elements) {
    // 既に処理済みの場合はスキップ
    if (processedElements.has(element)) continue;
    
    const lineStr = element.dataset.sourceLine;
    if (!lineStr) continue;
    
    const line = parseInt(lineStr, 10);
    if (isNaN(line) || line <= 0) continue;
    
    // コンテナ要素（lawquote等）の場合、子要素も走査してより細かいアンカーを作成
    const isContainer = element.classList.contains('lawquote') || 
                        element.classList.contains('colmin') ||
                        element.tagName === 'BLOCKQUOTE';
    
    if (isContainer) {
      // コンテナ内の各子要素を個別のアンカーとして追加
      const children = Array.from(element.children) as HTMLElement[];
      let hasChildAnchors = false;
      let childLineOffset = 1; // 行オフセット（ラベル等をスキップするため）
      
      for (const child of children) {
        // ラベルやタイトル要素はスキップ
        if (child.classList.contains('lawquote-label') || 
            child.classList.contains('lawquote-title')) {
          continue;
        }
        
        // 実際のコンテンツ要素のみ処理
        if (child.offsetHeight <= 0) continue;
        
        // 子要素にdata-source-lineがあればそれを使用
        const childLineStr = child.dataset?.sourceLine;
        let childLine: number;
        
        if (childLineStr) {
          childLine = parseInt(childLineStr, 10);
          if (isNaN(childLine) || childLine <= 0) continue;
        } else {
          // 子要素にdata-source-lineがない場合、位置ベースで推定
          // コンテナの開始行 + オフセット
          childLine = line + childLineOffset;
          childLineOffset++;
        }
        
        // 絶対位置を計算（コンテナ内のoffsetTopは相対値のため）
        const childTop = getAbsoluteOffsetTop(child, preview);
        const childHeight = child.offsetHeight || 1;
        
        anchors.push({ line: childLine, top: childTop, height: childHeight });
        processedElements.add(child);
        hasChildAnchors = true;
      }
      
      // 子アンカーがある場合、コンテナ自体は追加しない
      if (hasChildAnchors) {
        processedElements.add(element);
        continue;
      }
    }
    
    // 通常の要素、またはコンテナに子アンカーがない場合
    const top = getAbsoluteOffsetTop(element, preview);
    const height = element.offsetHeight || 1;
    
    anchors.push({ line, top, height });
    processedElements.add(element);
  }
  
  // 行番号でソート
  anchors.sort((a, b) => a.line - b.line);
  
  // 重複行を除去（同じ行の最も具体的な要素を保持）
  const uniqueAnchors: Anchor[] = [];
  let lastLine = -1;
  
  for (const anchor of anchors) {
    if (anchor.line !== lastLine) {
      uniqueAnchors.push(anchor);
      lastLine = anchor.line;
    }
  }
  
  return uniqueAnchors;
}

/**
 * AnchorManagerクラス
 * 
 * プレビュー要素の位置情報を管理し、
 * レイアウト変更時に自動的にキャッシュを無効化
 */
export class AnchorManager {
  private anchors: Anchor[] = [];
  private isDirty: boolean = true;
  private version: number = 0;
  private preview: HTMLElement | null = null;
  
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private imageLoadHandlers: Map<HTMLImageElement, () => void> = new Map();
  
  /**
   * プレビュー要素をアタッチし、オブザーバーを設定
   */
  attach(preview: HTMLElement): void {
    if (this.preview === preview) return;
    
    this.detach();
    this.preview = preview;
    this.isDirty = true;
    
    // ResizeObserver: 要素のリサイズを監視
    this.resizeObserver = new ResizeObserver(() => {
      this.markDirty();
    });
    this.resizeObserver.observe(preview);
    
    // MutationObserver: DOM変更を監視
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldMarkDirty = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // 子要素の追加・削除
          shouldMarkDirty = true;
          
          // 追加された画像に load イベントリスナーを設定
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              this.observeImages(node);
            }
          });
          
          // 削除された画像のリスナーをクリーンアップ
          mutation.removedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              this.unobserveImages(node);
            }
          });
        } else if (mutation.type === 'attributes') {
          // data-source-line の変更
          if (mutation.attributeName === 'data-source-line') {
            shouldMarkDirty = true;
          }
        }
      }
      
      if (shouldMarkDirty) {
        this.markDirty();
      }
    });
    
    this.mutationObserver.observe(preview, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-source-line'],
    });
    
    // 初期画像を監視
    this.observeImages(preview);
  }
  
  /**
   * オブザーバーをデタッチ
   */
  detach(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    
    // 画像リスナーをクリーンアップ
    this.imageLoadHandlers.forEach((handler, img) => {
      img.removeEventListener('load', handler);
    });
    this.imageLoadHandlers.clear();
    
    this.preview = null;
    this.anchors = [];
    this.isDirty = true;
  }
  
  /**
   * キャッシュを無効化
   */
  markDirty(): void {
    this.isDirty = true;
    this.version++;
  }
  
  /**
   * 強制的にキャッシュを再構築
   */
  forceRebuild(): void {
    if (!this.preview) return;
    
    this.anchors = buildAnchors(this.preview);
    this.isDirty = false;
    this.version++;
  }
  
  /**
   * アンカー配列を取得（必要なら再構築）
   */
  getAnchors(): Anchor[] {
    if (this.isDirty && this.preview) {
      this.anchors = buildAnchors(this.preview);
      this.isDirty = false;
    }
    
    return this.anchors;
  }
  
  /**
   * 現在のバージョンを取得
   */
  getVersion(): number {
    return this.version;
  }
  
  /**
   * ダーティ状態を取得
   */
  getIsDirty(): boolean {
    return this.isDirty;
  }
  
  /**
   * 画像要素を監視してloadイベントでキャッシュを無効化
   */
  private observeImages(container: HTMLElement): void {
    const images = container.querySelectorAll<HTMLImageElement>('img');
    
    images.forEach((img) => {
      if (this.imageLoadHandlers.has(img)) return;
      
      // 既に読み込み済みでないならリスナーを追加
      if (!img.complete) {
        const handler = () => {
          this.markDirty();
          img.removeEventListener('load', handler);
          this.imageLoadHandlers.delete(img);
        };
        
        img.addEventListener('load', handler);
        this.imageLoadHandlers.set(img, handler);
      }
    });
  }
  
  /**
   * 画像のリスナーをクリーンアップ
   */
  private unobserveImages(container: HTMLElement): void {
    const images = container.querySelectorAll<HTMLImageElement>('img');
    
    images.forEach((img) => {
      const handler = this.imageLoadHandlers.get(img);
      if (handler) {
        img.removeEventListener('load', handler);
        this.imageLoadHandlers.delete(img);
      }
    });
  }
}
