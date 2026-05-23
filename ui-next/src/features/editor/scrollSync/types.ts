/**
 * Scroll Sync Type Definitions
 * 
 * Document-Space座標系を中心とした型定義
 */

/**
 * ドキュメント空間座標
 * 両ペインで共有される唯一の真実(Source of Truth)
 */
export interface DocumentPos {
  /** Markdown行番号 (1-based) */
  line: number;
  /** その行/ブロック内の位置 (0.0~1.0) */
  fraction: number;
}

/**
 * プレビュー側のアンカー要素
 * data-source-line属性を持つ要素から構築
 */
export interface Anchor {
  /** Markdownソース行番号 */
  line: number;
  /** 要素のoffsetTop (px) */
  top: number;
  /** 要素の高さ (px) */
  height: number;
}

/**
 * 現在のスクロール操作を主導しているペイン
 */
export type Leader = 'editor' | 'preview' | null;

/**
 * プログラマティックスクロールの状態
 */
export interface ProgrammaticScrollState {
  editor: boolean;
  preview: boolean;
}

/**
 * スクロール同期エンジンの設定
 */
export interface ScrollSyncConfig {
  /** 同期を有効にするか */
  enabled: boolean;
  /** アニメーション時間 (ms) */
  animationDuration: number;
  /** リーダー状態のタイムアウト (ms) */
  leaderTimeout: number;
  /** 最小スクロール差分 (px) - これ以下は無視 */
  minScrollDelta: number;
  /** 同期開始までの遅延 (ms) - 滑らかな追従のため */
  syncDelay: number;
}

/**
 * デフォルト設定
 */
export const DEFAULT_SCROLL_SYNC_CONFIG: ScrollSyncConfig = {
  enabled: true,
  animationDuration: 150,
  leaderTimeout: 500,
  minScrollDelta: 2,
  syncDelay: 80,
};
