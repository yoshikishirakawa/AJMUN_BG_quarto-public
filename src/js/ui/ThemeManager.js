/**
 * ThemeManager.js
 * テーマ切替の制御
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/04-interaction.md
 */

export class ThemeManager {
  constructor(appState) {
    this.appState = appState;
    this.themes = ['light', 'dark', 'auto'];
    this.currentTheme = appState.get('theme') || 'auto';
    this.storageKey = 'reader-theme';
    this.mediaQuery = null;
    this.init();
  }

  init() {
    this.applyTheme(this.currentTheme);
  }

  applyTheme(theme) {
    if (theme === 'auto') {
      document.body.removeAttribute('data-theme');
      // システム設定を監視して適用
      this.watchSystemTheme();
    } else {
      document.body.setAttribute('data-theme', theme);
      this.stopWatchingSystemTheme();
    }
    this.currentTheme = theme;
  }

  loadTheme() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved && this.themes.includes(saved)) {
        return saved;
      }
    } catch (e) {
      console.warn('Failed to load theme:', e);
    }
    return 'auto';
  }

  saveTheme(theme) {
    try {
      localStorage.setItem(this.storageKey, theme);
    } catch (e) {
      console.warn('Failed to save theme:', e);
    }
  }

  cycleTheme() {
    const currentIndex = this.themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % this.themes.length;
    const nextTheme = this.themes[nextIndex];
    this.applyTheme(nextTheme);
    this.saveTheme(nextTheme);
    this.appState.set('theme', nextTheme);
  }

  setTheme(theme) {
    if (this.themes.includes(theme)) {
      this.applyTheme(theme);
      this.saveTheme(theme);
      this.appState.set('theme', theme);
    }
  }

  getThemeIcon() {
    const icons = {
      light: '🌙',
      dark: '☀️',
      auto: '🌗'
    };
    return icons[this.currentTheme] || '🌙';
  }

  watchSystemTheme() {
    if (this.mediaQuery) return;

    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', (e) => {
      if (this.currentTheme === 'auto') {
        this.applySystemTheme(e.matches);
      }
    });
    this.applySystemTheme(this.mediaQuery.matches);
  }

  stopWatchingSystemTheme() {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', this.applySystemTheme);
      this.mediaQuery = null;
    }
  }

  applySystemTheme(isDark) {
    // 自動モード時、必要に応じて追加のスタイル調整が可能
    // 基本的にはCSSのcolor-scheme: light darkに任せる
  }

  isDark() {
    if (this.currentTheme === 'dark') return true;
    if (this.currentTheme === 'light') return false;
    // auto
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}

export default ThemeManager;
