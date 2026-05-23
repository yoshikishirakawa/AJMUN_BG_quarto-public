/**
 * Progress.js
 * 読み進捗バーの制御
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/03-components.md
 */

export class Progress {
  constructor(chapterManager) {
    this.chapterManager = chapterManager;
    this.progressFill = document.querySelector('.progress-fill');
    this.progressBar = document.querySelector('.progress-bar');
    this.init();
  }

  init() {
    if (!this.progressBar) return;

    // スクロールイベント
    window.addEventListener('scroll', () => {
      this.update();
    }, { passive: true });

    // 初期更新
    this.update();
  }

  update() {
    const currentChapter = this.chapterManager.currentChapter;
    const totalChapters = this.chapterManager.totalChapters;

    // スクロール進捗を計算
    const scrollProgress = this.calculateScrollProgress();

    // 全体の進捗を計算
    const chapterProgress = (currentChapter - 1) / totalChapters;
    const currentChapterProgress = scrollProgress / totalChapters;
    const totalProgress = chapterProgress + currentChapterProgress;

    const percentage = Math.min(100, Math.max(0, Math.round(totalProgress * 100)));

    if (this.progressFill) {
      this.progressFill.style.width = `${percentage}%`;
    }

    // ホバー表示用のテキスト
    if (this.progressBar) {
      this.progressBar.dataset.progress = `第${currentChapter}章 / 全${totalChapters}章 (${percentage}%)`;
    }
  }

  calculateScrollProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;

    if (docHeight <= 0) return 0;
    return Math.min(1, Math.max(0, scrollTop / docHeight));
  }

  getCurrentChapter() {
    return this.chapterManager?.currentChapter || 1;
  }

  getTotalChapters() {
    return this.chapterManager?.totalChapters || 1;
  }
}

export default Progress;
