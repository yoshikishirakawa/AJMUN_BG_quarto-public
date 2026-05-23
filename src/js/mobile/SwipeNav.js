/**
 * SwipeNav.js
 * スワイプナビゲーション（モバイル）
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/04-interaction.md
 */

export class SwipeNav {
  constructor(chapterManager) {
    this.chapterManager = chapterManager;
    this.enabled = false;
    this.startX = 0;
    this.startTime = 0;
    this.threshold = 100; // スワイプ判定の閾値（px）
    this.timeLimit = 300; // 時間制限（ms）
    this.init();
  }

  init() {
    // 設定から有効/無効を取得
    const saved = localStorage.getItem('reader-swipe-enabled');
    this.enabled = saved === 'true';

    if (this.enabled) {
      this.bindEvents();
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem('reader-swipe-enabled', String(enabled));

    if (enabled) {
      this.bindEvents();
    } else {
      this.unbindEvents();
    }
  }

  bindEvents() {
    if (this.bound) return;

    this.handleTouchStart = (e) => {
      this.startX = e.touches[0].clientX;
      this.startTime = Date.now();
    };

    this.handleTouchEnd = (e) => {
      const endX = e.changedTouches[0].clientX;
      const endTime = Date.now();
      const diffX = endX - this.startX;
      const diffTime = endTime - this.startTime;

      // スワイプ判定: 時間300ms以内、移動距離100px以上
      if (diffTime < this.timeLimit && Math.abs(diffX) > this.threshold) {
        if (diffX > 0) {
          // 右スワイプ = 前章
          this.previousChapter();
        } else {
          // 左スワイプ = 次章
          this.nextChapter();
        }
      }
    };

    document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    document.addEventListener('touchend', this.handleTouchEnd, { passive: true });

    this.bound = true;
  }

  unbindEvents() {
    if (!this.bound) return;

    document.removeEventListener('touchstart', this.handleTouchStart);
    document.removeEventListener('touchend', this.handleTouchEnd);

    this.bound = false;
  }

  previousChapter() {
    if (this.chapterManager) {
      this.chapterManager.previousChapter();
    }
  }

  nextChapter() {
    if (this.chapterManager) {
      this.chapterManager.nextChapter();
    }
  }

  isEnabled() {
    return this.enabled;
  }
}

export default SwipeNav;
