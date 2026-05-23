/**
 * FontSize.js
 * フォントサイズ調整
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/04-interaction.md
 */

export class FontSize {
  constructor(appState) {
    this.appState = appState;
    this.sizes = ['XS', 'S', 'M', 'L', 'XL'];
    this.storageKey = 'reader-font-size';
    this.currentSize = appState.get('fontSize') || this.loadSize();
    this.init();
  }

  init() {
    this.applySize(this.currentSize);
    this.bindEvents();
    this.bindKeyboardShortcuts();
  }

  bindEvents() {
    // フォントサイズボタン
    document.querySelectorAll('.font-size-btn').forEach(btn => {
      const size = btn.dataset.size;
      if (size) {
        btn.addEventListener('click', () => {
          this.setSize(size);
        });
      }
    });
  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Plus で拡大
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        this.increase();
      }
      // Ctrl/Cmd + Minus で縮小
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        this.decrease();
      }
      // Ctrl/Cmd + 0 でリセット
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        this.reset();
      }
    });
  }

  loadSize() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved && this.sizes.includes(saved)) {
        return saved;
      }
    } catch (e) {
      console.warn('Failed to load font size:', e);
    }
    return 'M';
  }

  saveSize(size) {
    try {
      localStorage.setItem(this.storageKey, size);
    } catch (e) {
      console.warn('Failed to save font size:', e);
    }
  }

  applySize(size) {
    if (!this.sizes.includes(size)) {
      size = 'M';
    }

    document.body.setAttribute('data-font-size', size);
    this.currentSize = size;

    // ボタンのアクティブ状態を更新
    document.querySelectorAll('.font-size-btn').forEach(btn => {
      if (btn.dataset.size === size) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  setSize(size) {
    if (this.sizes.includes(size)) {
      this.applySize(size);
      this.saveSize(size);
      this.appState.set('fontSize', size);
    }
  }

  increase() {
    const currentIndex = this.sizes.indexOf(this.currentSize);
    if (currentIndex < this.sizes.length - 1) {
      const nextSize = this.sizes[currentIndex + 1];
      this.setSize(nextSize);
    }
  }

  decrease() {
    const currentIndex = this.sizes.indexOf(this.currentSize);
    if (currentIndex > 0) {
      const prevSize = this.sizes[currentIndex - 1];
      this.setSize(prevSize);
    }
  }

  reset() {
    this.setSize('M');
  }

  getCurrentSize() {
    return this.currentSize;
  }

  getSizes() {
    return [...this.sizes];
  }

  getSizeValue(size) {
    const values = {
      'XS': 15,
      'S': 16,
      'M': 17,
      'L': 19,
      'XL': 21
    };
    return values[size] || 17;
  }
}

export default FontSize;
