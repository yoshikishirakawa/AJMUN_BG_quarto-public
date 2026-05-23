/**
 * Scroll Sync Engine
 * 
 * Document-Space座標系を中心とした同期エンジン
 * 
 * 特徴:
 * - 入力イベント(wheel/touch)でリーダーを決定（scroll eventではなく）
 * - isProgrammaticフラグで振動を完全防止
 * - 中心位置(Center)を基準とした同期
 * - ResizeObserver/MutationObserverで動的コンテンツ対応
 */

import { useEffect, useRef, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import type { DocumentPos, Leader, ProgrammaticScrollState, ScrollSyncConfig } from './types';
import { DEFAULT_SCROLL_SYNC_CONFIG } from './types';
import {
  editorScrollToDocPos,
  docPosToEditorScroll,
  previewScrollToDocPos,
  docPosToPreviewScroll,
} from './documentPosMapper';
import { AnchorManager } from './anchorManager';
import { scrollProgrammatically, cancelAllAnimations } from './scrollAnimator';

export interface UseScrollSyncEngineOptions {
  enabled?: boolean;
  animationDuration?: number;
  syncDelay?: number;
}

export interface UseScrollSyncEngineReturn {
  clearCache: () => void;
}

export function useScrollSyncEngine(
  editorViewRef: React.MutableRefObject<EditorView | null>,
  previewRef: React.RefObject<HTMLElement | null>,
  options: UseScrollSyncEngineOptions = {}
): UseScrollSyncEngineReturn {
  const config: ScrollSyncConfig = {
    ...DEFAULT_SCROLL_SYNC_CONFIG,
    enabled: options.enabled ?? true,
    animationDuration: options.animationDuration ?? DEFAULT_SCROLL_SYNC_CONFIG.animationDuration,
    syncDelay: options.syncDelay ?? DEFAULT_SCROLL_SYNC_CONFIG.syncDelay,
  };
  
  // Source of Truth: ドキュメント空間座標
  const docPosRef = useRef<DocumentPos>({ line: 1, fraction: 0 });
  
  // 現在のリーダー
  const leaderRef = useRef<Leader>(null);
  
  // リーダータイムアウト用
  const leaderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // プログラマティックスクロール状態
  const isProgrammaticRef = useRef<ProgrammaticScrollState>({
    editor: false,
    preview: false,
  });
  
  // RAFスケジューリング用
  const rafRef = useRef<number | null>(null);
  
  // 遅延同期用タイマー
  const syncDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // AnchorManager
  const anchorManagerRef = useRef<AnchorManager>(new AnchorManager());
  
  /**
   * リーダーを設定し、タイムアウトを更新
   */
  const setLeader = useCallback((leader: Leader) => {
    leaderRef.current = leader;
    
    // 既存のタイムアウトをクリア
    if (leaderTimeoutRef.current) {
      clearTimeout(leaderTimeoutRef.current);
      leaderTimeoutRef.current = null;
    }
    
    // リーダータイムアウトを設定
    if (leader !== null) {
      leaderTimeoutRef.current = setTimeout(() => {
        leaderRef.current = null;
        leaderTimeoutRef.current = null;
      }, config.leaderTimeout);
    }
  }, [config.leaderTimeout]);
  
  /**
   * エディタ → プレビュー 同期
   */
  const syncToPreview = useCallback(() => {
    const view = editorViewRef.current;
    const preview = previewRef.current;
    
    if (!view || !preview || !config.enabled) return;
    
    const anchors = anchorManagerRef.current.getAnchors();
    if (anchors.length === 0) return;
    
    const targetScrollTop = docPosToPreviewScroll(preview, docPosRef.current, anchors);
    
    scrollProgrammatically(
      'preview',
      preview,
      targetScrollTop,
      isProgrammaticRef.current,
      config.animationDuration
    );
  }, [editorViewRef, previewRef, config.enabled, config.animationDuration]);
  
  /**
   * プレビュー → エディタ 同期
   */
  const syncToEditor = useCallback(() => {
    const view = editorViewRef.current;
    const preview = previewRef.current;
    
    if (!view || !preview || !config.enabled) return;
    
    // docPosが有効かチェック
    const pos = docPosRef.current;
    if (pos.line <= 0) return;
    
    const targetScrollTop = docPosToEditorScroll(view, pos);
    
    scrollProgrammatically(
      'editor',
      view.scrollDOM,
      targetScrollTop,
      isProgrammaticRef.current,
      config.animationDuration
    );
  }, [editorViewRef, previewRef, config.enabled, config.animationDuration]);
  
  /**
   * フォロワーを同期（遅延 + RAFでスケジュール）
   * 滑らかな追従のため、少し遅れて同期を開始
   */
  const scheduleSync = useCallback((target: 'editor' | 'preview') => {
    // 既存のタイマーをクリア
    if (syncDelayTimerRef.current !== null) {
      clearTimeout(syncDelayTimerRef.current);
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    
    // 遅延後にRAFで実行
    syncDelayTimerRef.current = setTimeout(() => {
      syncDelayTimerRef.current = null;
      
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        
        if (target === 'preview') {
          syncToPreview();
        } else {
          syncToEditor();
        }
      });
    }, config.syncDelay);
  }, [syncToPreview, syncToEditor, config.syncDelay]);
  
  /**
   * エディタのスクロールハンドラ
   */
  const handleEditorScroll = useCallback(() => {
    if (!config.enabled) return;
    
    // プログラマティックスクロールなら無視
    if (isProgrammaticRef.current.editor) return;
    
    const view = editorViewRef.current;
    if (!view) return;
    
    // リーダーをエディタに設定
    setLeader('editor');
    
    // ドキュメント座標を更新
    docPosRef.current = editorScrollToDocPos(view);
    
    // プレビューを同期
    scheduleSync('preview');
  }, [config.enabled, editorViewRef, setLeader, scheduleSync]);
  
  /**
   * プレビューのスクロールハンドラ
   */
  const handlePreviewScroll = useCallback(() => {
    if (!config.enabled) return;
    
    // プログラマティックスクロールなら無視
    if (isProgrammaticRef.current.preview) return;
    
    const preview = previewRef.current;
    if (!preview) return;
    
    // リーダーをプレビューに設定
    setLeader('preview');
    
    // アンカーを取得（必要なら強制構築）
    let anchors = anchorManagerRef.current.getAnchors();
    if (anchors.length === 0) {
      // アンカーがない場合は強制再構築
      anchorManagerRef.current.forceRebuild();
      anchors = anchorManagerRef.current.getAnchors();
    }
    
    // アンカーがまだない場合は同期をスキップ
    if (anchors.length === 0) return;
    
    // ドキュメント座標を更新
    docPosRef.current = previewScrollToDocPos(preview, anchors);
    
    // エディタを同期
    scheduleSync('editor');
  }, [config.enabled, previewRef, setLeader, scheduleSync]);
  
  /**
   * 入力イベントでリーダーを先行設定（より正確な意図検出）
   */
  const handleEditorInput = useCallback(() => {
    setLeader('editor');
  }, [setLeader]);
  
  const handlePreviewInput = useCallback(() => {
    setLeader('preview');
  }, [setLeader]);
  
  /**
   * キャッシュをクリア
   */
  const clearCache = useCallback(() => {
    anchorManagerRef.current.markDirty();
    docPosRef.current = { line: 1, fraction: 0 };
  }, []);
  
  /**
   * イベントリスナーのセットアップ
   */
  useEffect(() => {
    const anchorManager = anchorManagerRef.current;
    let cleanedUp = false;
    let attachedEditorScrollDOM: HTMLElement | null = null;
    let attachedPreview: HTMLElement | null = null;
    
    const setupListeners = () => {
      if (cleanedUp) return false;
      
      const view = editorViewRef.current;
      const preview = previewRef.current;
      
      if (!view || !preview) return false;
      
      const editorScrollDOM = view.scrollDOM;
      attachedEditorScrollDOM = editorScrollDOM;
      attachedPreview = preview;
      
      // AnchorManagerをアタッチ
      anchorManager.attach(preview);
      
      // スクロールイベント（パッシブ）
      editorScrollDOM.addEventListener('scroll', handleEditorScroll, { passive: true });
      preview.addEventListener('scroll', handlePreviewScroll, { passive: true });
      
      // 入力イベント（リーダー先行設定）
      editorScrollDOM.addEventListener('wheel', handleEditorInput, { passive: true });
      editorScrollDOM.addEventListener('touchstart', handleEditorInput, { passive: true });
      editorScrollDOM.addEventListener('keydown', handleEditorInput, { passive: true });
      
      preview.addEventListener('wheel', handlePreviewInput, { passive: true });
      preview.addEventListener('touchstart', handlePreviewInput, { passive: true });
      
      return true;
    };
    
    // ref が準備できるまでポーリング
    const pollInterval = setInterval(() => {
      if (setupListeners()) {
        clearInterval(pollInterval);
      }
    }, 100);
    
    // 初回チェック
    setupListeners();
    
    return () => {
      cleanedUp = true;
      clearInterval(pollInterval);
      
      if (attachedEditorScrollDOM) {
        attachedEditorScrollDOM.removeEventListener('scroll', handleEditorScroll);
        attachedEditorScrollDOM.removeEventListener('wheel', handleEditorInput);
        attachedEditorScrollDOM.removeEventListener('touchstart', handleEditorInput);
        attachedEditorScrollDOM.removeEventListener('keydown', handleEditorInput);
      }
      
      if (attachedPreview) {
        attachedPreview.removeEventListener('scroll', handlePreviewScroll);
        attachedPreview.removeEventListener('wheel', handlePreviewInput);
        attachedPreview.removeEventListener('touchstart', handlePreviewInput);
      }
      
      // AnchorManagerをデタッチ
      anchorManager.detach();
      
      // アニメーションをキャンセル
      cancelAllAnimations();
      
      // RAFをキャンセル
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      
      // 遅延タイマーをキャンセル
      if (syncDelayTimerRef.current !== null) {
        clearTimeout(syncDelayTimerRef.current);
      }
      
      // タイムアウトをクリア
      if (leaderTimeoutRef.current) {
        clearTimeout(leaderTimeoutRef.current);
      }
    };
  }, [
    editorViewRef,
    previewRef,
    handleEditorScroll,
    handlePreviewScroll,
    handleEditorInput,
    handlePreviewInput,
  ]);
  
  return { clearCache };
}
