/**
 * Drawer.js
 * ドロワー（モバイルサイドメニュー）
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/04-interaction.md
 */

export class Drawer {
  constructor(appState) {
    this.appState = appState;
    this.drawer = null;
    this.backdrop = null;
    this.init();
  }

  init() {
    this.drawer = document.querySelector('.drawer');
    this.backdrop = document.querySelector('.drawer-backdrop');

    if (!this.drawer) return;

    this.bindEvents();
  }

  bindEvents() {
    // 閉じるボタン
    const closeBtn = this.drawer.querySelector('.drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // 背景クリックで閉じる
    if (this.backdrop) {
      this.backdrop.addEventListener('click', () => this.close());
    }

    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // ドロワー内のリンククリックで閉じる
    const links = this.drawer.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
      link.addEventListener('click', () => {
        this.close();
      });
    });
  }

  open() {
    if (!this.drawer || !this.backdrop) return;

    this.drawer.classList.add('open');
    this.backdrop.classList.add('open');
    this.appState.set('drawerOpen', true);

    // 背景スクロールを防止
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (!this.drawer || !this.backdrop) return;

    this.drawer.classList.remove('open');
    this.backdrop.classList.remove('open');
    this.appState.set('drawerOpen', false);

    // 背景スクロールを再有効化
    document.body.style.overflow = '';
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  isOpen() {
    return this.drawer?.classList.contains('open') || false;
  }
}

export default Drawer;
