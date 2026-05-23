/**
 * Header.js
 * ヘッダーの制御
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/03-components.md
 */

export class Header {
  constructor(appState) {
    this.appState = appState;
    this.header = document.querySelector('.reader-header');
    this.init();
  }

  init() {
    if (!this.header) return;

    this.bindEvents();
  }

  bindEvents() {
    // メニューボタン（モバイル）
    const menuBtn = this.header.querySelector('.menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => this.toggleDrawer());
    }

    // 検索ボタン
    const searchBtn = this.header.querySelector('.search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => this.openSearch());
    }

    // 設定ボタン
    const settingsBtn = this.header.querySelector('.settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettings());
    }

    // テーマボタン
    const themeBtn = this.header.querySelector('.theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.cycleTheme());
    }

    // タイトルクリックで表紙へ
    const title = this.header.querySelector('.doc-title');
    if (title) {
      title.addEventListener('click', () => this.goToCover());
    }

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K で検索
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.openSearch();
      }
    });
  }

  toggleDrawer() {
    const drawer = document.querySelector('.drawer');
    const backdrop = document.querySelector('.drawer-backdrop');
    const isOpen = drawer?.classList.contains('open');

    if (isOpen) {
      drawer?.classList.remove('open');
      backdrop?.classList.remove('open');
    } else {
      drawer?.classList.add('open');
      backdrop?.classList.add('open');
    }

    this.appState.set('drawerOpen', !isOpen);
  }

  openSearch() {
    const searchOverlay = document.querySelector('.search-overlay');
    if (searchOverlay) {
      searchOverlay.classList.add('open');
      const input = searchOverlay.querySelector('.search-input');
      if (input) {
        setTimeout(() => input.focus(), 100);
      }
    }
  }

  closeSearch() {
    const searchOverlay = document.querySelector('.search-overlay');
    if (searchOverlay) {
      searchOverlay.classList.remove('open');
    }
  }

  openSettings() {
    const settingsMenu = document.querySelector('.settings-menu');
    if (settingsMenu) {
      settingsMenu.classList.add('open');
    }
  }

  closeSettings() {
    const settingsMenu = document.querySelector('.settings-menu');
    if (settingsMenu) {
      settingsMenu.classList.remove('open');
    }
  }

  cycleTheme() {
    const currentTheme = this.appState.get('theme');
    const themes = ['light', 'dark', 'auto'];
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];

    this.applyTheme(nextTheme);
    this.appState.set('theme', nextTheme);
  }

  applyTheme(theme) {
    const btn = this.header.querySelector('.theme-btn');
    if (!btn) return;

    // アイコン更新
    const icons = {
      light: '🌙',
      dark: '☀️',
      auto: '🌗'
    };
    btn.textContent = icons[theme] || '🌙';

    // data-theme属性を設定
    if (theme === 'auto') {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', theme);
    }
  }

  goToCover() {
    window.location.hash = '';
  }

  updateThemeIcon(theme) {
    const btn = this.header.querySelector('.theme-btn');
    if (!btn) return;

    const icons = {
      light: '🌙',
      dark: '☀️',
      auto: '🌗'
    };
    btn.textContent = icons[theme] || '🌙';
  }
}

export default Header;
