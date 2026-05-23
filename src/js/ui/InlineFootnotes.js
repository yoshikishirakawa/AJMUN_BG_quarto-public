/**
 * InlineFootnotes.js
 * インライン脚注の制御（モバイル）
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/03-components.md
 */

export class InlineFootnotes {
  constructor() {
    this.expanded = true;
    this.init();
  }

  init() {
    // 表示条件チェック
    this.checkVisibility();

    // 脚注参照のクリックイベント
    this.bindFootnoteRefs();

    // 折りたたみボタン
    this.bindCollapseToggle();

    // ウィンドウリサイズ時に表示条件を再チェック
    window.addEventListener('resize', () => this.checkVisibility());
  }

  checkVisibility() {
    const width = window.innerWidth;
    const inlineFootnotes = document.querySelectorAll('.inline-footnotes');

    if (width < 768) {
      inlineFootnotes.forEach(block => {
        block.style.display = 'block';
      });
    } else {
      inlineFootnotes.forEach(block => {
        block.style.display = 'none';
      });
    }
  }

  bindFootnoteRefs() {
    const refs = document.querySelectorAll('.footnote-ref');
    refs.forEach(ref => {
      ref.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = ref.dataset.ref || ref.getAttribute('href')?.substring(1);
        if (targetId) {
          this.scrollToInlineFootnote(targetId);
        }
      });
    });
  }

  bindCollapseToggle() {
    const toggles = document.querySelectorAll('.footnote-collapse-toggle');
    toggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        this.toggleAll();
      });
    });
  }

  scrollToInlineFootnote(footnoteId) {
    // インライン脚注を探す
    const inlineFootnote = document.querySelector(`.inline-footnote[data-id="${footnoteId}"]`);
    if (!inlineFootnote) return;

    // すべての脚注を展開
    this.expandAll();

    // スクロール
    inlineFootnote.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // ハイライト
    inlineFootnote.classList.add('active');
    setTimeout(() => {
      inlineFootnote.classList.remove('active');
    }, 2000);
  }

  expandAll() {
    const footnotes = document.querySelectorAll('.inline-footnote');
    footnotes.forEach(fn => {
      fn.style.display = 'flex';
    });

    this.expanded = true;
    this.updateToggleButton();
  }

  collapseAll() {
    const footnotes = document.querySelectorAll('.inline-footnote');
    footnotes.forEach(fn => {
      fn.style.display = 'none';
    });

    this.expanded = false;
    this.updateToggleButton();
  }

  toggleAll() {
    if (this.expanded) {
      this.collapseAll();
    } else {
      this.expandAll();
    }
  }

  updateToggleButton() {
    const toggles = document.querySelectorAll('.footnote-collapse-toggle');
    const text = this.expanded ? '▼ 脚注を隠す' : '▲ 脚注を表示';
    toggles.forEach(toggle => {
      toggle.textContent = text;
    });
  }
}

export default InlineFootnotes;
