/**
 * Scroll Animator
 * 
 * 自前のスムーズスクロール実装
 * behavior: 'smooth' は終了タイミングが不明なため使用しない
 * 
 * 特徴:
 * - アニメーション中はisProgrammaticフラグで保護
 * - アニメーション完了時に正確にフラグを解除
 * - easeInOutQuadでなめらかな動き
 */

import type { ProgrammaticScrollState } from './types';

/**
 * Easing関数: ease-in-out quad
 */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * 進行中のアニメーションを追跡
 */
const activeAnimations = new Map<HTMLElement, number>();

/**
 * プログラマティックスクロールを実行
 * 
 * @param target スクロール対象の識別子
 * @param element スクロール対象のDOM要素
 * @param to 目標scrollTop
 * @param isProgrammatic プログラマティック状態のref
 * @param duration アニメーション時間(ms)
 * @param onComplete アニメーション完了時のコールバック
 */
export function scrollProgrammatically(
  target: 'editor' | 'preview',
  element: HTMLElement,
  to: number,
  isProgrammatic: ProgrammaticScrollState,
  duration: number = 120,
  onComplete?: () => void
): void {
  // 既存のアニメーションをキャンセル
  const existingAnimationId = activeAnimations.get(element);
  if (existingAnimationId !== undefined) {
    cancelAnimationFrame(existingAnimationId);
    activeAnimations.delete(element);
  }
  
  const from = element.scrollTop;
  const maxScroll = element.scrollHeight - element.clientHeight;
  const clampedTo = Math.max(0, Math.min(to, maxScroll));
  
  // 差分が小さい場合はスキップ
  if (Math.abs(clampedTo - from) < 2) {
    onComplete?.();
    return;
  }
  
  // プログラマティックフラグを設定
  isProgrammatic[target] = true;
  
  const startTime = performance.now();
  
  const step = (now: number) => {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeInOutQuad(t);
    const currentValue = from + (clampedTo - from) * eased;
    
    element.scrollTop = currentValue;
    
    if (t < 1) {
      // アニメーション継続
      const animationId = requestAnimationFrame(step);
      activeAnimations.set(element, animationId);
    } else {
      // アニメーション完了
      activeAnimations.delete(element);
      
      // フラグを解除（次フレームで確実に処理）
      requestAnimationFrame(() => {
        isProgrammatic[target] = false;
        onComplete?.();
      });
    }
  };
  
  const animationId = requestAnimationFrame(step);
  activeAnimations.set(element, animationId);
}

/**
 * 全てのアクティブなアニメーションをキャンセル
 */
export function cancelAllAnimations(): void {
  activeAnimations.forEach((animationId) => {
    cancelAnimationFrame(animationId);
  });
  activeAnimations.clear();
}

/**
 * 特定要素のアニメーションをキャンセル
 */
export function cancelAnimation(element: HTMLElement): void {
  const animationId = activeAnimations.get(element);
  if (animationId !== undefined) {
    cancelAnimationFrame(animationId);
    activeAnimations.delete(element);
  }
}

/**
 * 要素がアニメーション中かどうか
 */
export function isAnimating(element: HTMLElement): boolean {
  return activeAnimations.has(element);
}
