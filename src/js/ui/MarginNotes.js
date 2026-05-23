/**
 * MarginNotes.js
 * 傍注の制御（デスクトップ）
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/03-components.md
 */

export class MarginNotes {
  constructor() {
    this.activeNoteId = null;
    this.init();
  }

  init() {
    // 傍注の表示条件チェック
    this.checkVisibility();

    // 脚注参照のクリックイベント
    this.bindFootnoteRefs();

    // 傍注のクリックイベント
    this.bindMarginNotes();

    // ウィンドウリサイズ時に表示条件を再チェック
    window.addEventListener('resize', () => this.checkVisibility());
  }

  checkVisibility() {
    const width = window.innerWidth;
    const marginNotes = document.querySelectorAll('.margin-note');

    if (width >= 768) {
      marginNotes.forEach(note => {
        note.style.display = '';
      });
    } else {
      marginNotes.forEach(note => {
        note.style.display = 'none';
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
          this.scrollToMarginNote(targetId);
        }
      });
    });
  }

  bindMarginNotes() {
    const notes = document.querySelectorAll('.margin-note');
    notes.forEach(note => {
      note.addEventListener('click', () => {
        this.returnToRef(note.id);
      });
    });
  }

  scrollToMarginNote(noteId) {
    const note = document.getElementById(noteId);
    if (!note) return;

    // アクティブ状態を更新
    this.clearActiveNote();
    note.classList.add('active');
    this.activeNoteId = noteId;

    // スクロール
    note.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  returnToRef(noteId) {
    // 参照元に戻るリンクを探す
    const note = document.getElementById(noteId);
    if (!note) return;

    const backLink = note.querySelector('.margin-note-back-link');
    if (backLink) {
      const refId = backLink.dataset.ref;
      const ref = document.querySelector(`.footnote-ref[data-ref="${refId}"]`);
      if (ref) {
        ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ref.classList.add('active');
        setTimeout(() => ref.classList.remove('active'), 2000);
      }
    }

    this.clearActiveNote();
  }

  clearActiveNote() {
    if (this.activeNoteId) {
      const activeNote = document.getElementById(this.activeNoteId);
      if (activeNote) {
        activeNote.classList.remove('active');
      }
    }

    // 全ての参照のアクティブ状態をクリア
    document.querySelectorAll('.footnote-ref.active').forEach(ref => {
      ref.classList.remove('active');
    });

    this.activeNoteId = null;
  }
}

export default MarginNotes;
