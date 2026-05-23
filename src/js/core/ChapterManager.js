/**
 * ChapterManager.js
 * 章管理・遷移
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/05-implementation.md
 */

export class ChapterManager {
  constructor(appState) {
    this.appState = appState;
    this.currentChapter = 1;
    this.totalChapters = 0;
    this.init();
  }

  init() {
    this.countChapters();
    this.detectCurrentChapter();

    // URLハッシュの監視
    window.addEventListener('hashchange', () => {
      this.detectCurrentChapter();
      this.updateNavigation();
    });

    // 初期化時にナビゲーションを更新
    this.updateNavigation();
  }

  countChapters() {
    this.totalChapters = document.querySelectorAll('.chapter[data-chapter]').length;
  }

  detectCurrentChapter() {
    const hash = window.location.hash;
    const chapterMatch = hash.match(/#chapter-(\d+)/);

    if (chapterMatch) {
      this.currentChapter = parseInt(chapterMatch[1], 10);
    } else {
      // ハッシュがない場合は第1章
      this.currentChapter = 1;
    }

    this.updateTOCHighlight();
  }

  goToChapter(chapterNum) {
    const targetChapter = document.querySelector(`.chapter[data-chapter="${chapterNum}"]`);
    if (targetChapter) {
      window.location.hash = `chapter-${chapterNum}`;
    }
  }

  nextChapter() {
    if (this.currentChapter < this.totalChapters) {
      this.goToChapter(this.currentChapter + 1);
    }
  }

  previousChapter() {
    if (this.currentChapter > 1) {
      this.goToChapter(this.currentChapter - 1);
    }
  }

  updateTOCHighlight() {
    // 目次のハイライトを更新
    document.querySelectorAll('.toc-item').forEach(item => {
      item.classList.remove('toc-item--current', 'toc-item--visited', 'toc-item--future');
    });

    const currentTOCItem = document.querySelector(`.toc-item[data-chapter="${this.currentChapter}"]`);
    if (currentTOCItem) {
      currentTOCItem.classList.add('toc-item--current');
    }

    // 既読章のハイライト
    for (let i = 1; i < this.currentChapter; i++) {
      const visitedItem = document.querySelector(`.toc-item[data-chapter="${i}"]`);
      if (visitedItem) {
        visitedItem.classList.add('toc-item--visited');
      }
    }

    // 未読章のハイライト
    for (let i = this.currentChapter + 1; i <= this.totalChapters; i++) {
      const futureItem = document.querySelector(`.toc-item[data-chapter="${i}"]`);
      if (futureItem) {
        futureItem.classList.add('toc-item--future');
      }
    }
  }

  updateNavigation() {
    // 前/次章ボタンの有効/無効を更新
    const prevBtn = document.querySelector('.chapter-nav-prev, .drawer-chapter-nav-prev');
    const nextBtn = document.querySelector('.chapter-nav-next, .drawer-chapter-nav-next');

    if (prevBtn) {
      if (this.currentChapter <= 1) {
        prevBtn.style.opacity = '0.5';
        prevBtn.style.pointerEvents = 'none';
      } else {
        prevBtn.style.opacity = '1';
        prevBtn.style.pointerEvents = 'auto';
      }
    }

    if (nextBtn) {
      if (this.currentChapter >= this.totalChapters) {
        nextBtn.style.opacity = '0.5';
        nextBtn.style.pointerEvents = 'none';
      } else {
        nextBtn.style.opacity = '1';
        nextBtn.style.pointerEvents = 'auto';
      }
    }

    // ドロワー内の章タイトルを更新
    this.updateDrawerNavigation();
  }

  updateDrawerNavigation() {
    const prevTitle = document.querySelector('.drawer-chapter-nav-prev .drawer-chapter-nav-title');
    const nextTitle = document.querySelector('.drawer-chapter-nav-next .drawer-chapter-nav-title');

    if (prevTitle && this.currentChapter > 1) {
      const prevChapter = document.querySelector(`.chapter[data-chapter="${this.currentChapter - 1}"]`);
      if (prevChapter) {
        const title = prevChapter.querySelector('h1')?.textContent || `第${this.currentChapter - 1}章`;
        prevTitle.textContent = title;
      }
    }

    if (nextTitle && this.currentChapter < this.totalChapters) {
      const nextChapter = document.querySelector(`.chapter[data-chapter="${this.currentChapter + 1}"]`);
      if (nextChapter) {
        const title = nextChapter.querySelector('h1')?.textContent || `第${this.currentChapter + 1}章`;
        nextTitle.textContent = title;
      }
    }
  }

  getChapterInfo(chapterNum) {
    const chapter = document.querySelector(`.chapter[data-chapter="${chapterNum}"]`);
    if (!chapter) return null;

    const title = chapter.querySelector('h1')?.textContent || `第${chapterNum}章`;
    return { number: chapterNum, title, element: chapter };
  }
}

export default ChapterManager;
