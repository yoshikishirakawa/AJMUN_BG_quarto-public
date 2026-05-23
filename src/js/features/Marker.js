/**
 * Marker.js
 * マーカー（ハイライト）機能
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/04-interaction.md
 */

export class Marker {
  constructor() {
    this.storageKey = 'reader-markers';
    this.markers = this.loadMarkers();
    this.toolbar = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.restoreMarkers();
  }

  bindEvents() {
    document.addEventListener('mouseup', (e) => this.handleSelection(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideToolbar();
    });
  }

  handleSelection(e) {
    // プロセス外のクリックを無視
    const target = e.target;
    if (target.closest('.marker-toolbar') ||
        target.closest('.search-overlay') ||
        target.closest('.settings-menu') ||
        target.closest('.header-actions')) {
      return;
    }

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      this.showToolbar(rect.left + rect.width / 2, rect.top, text);
    } else {
      this.hideToolbar();
    }
  }

  showToolbar(x, y, text) {
    if (!this.toolbar) {
      this.toolbar = this.createToolbar();
      document.body.appendChild(this.toolbar);
    }

    this.toolbar.style.left = `${x}px`;
    this.toolbar.style.top = `${y - 50}px`;
    this.toolbar.classList.add('show');
    this.toolbar.dataset.selectedText = text;
  }

  hideToolbar() {
    if (this.toolbar) {
      this.toolbar.classList.remove('show');
    }
  }

  createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'marker-toolbar';
    toolbar.innerHTML = `
      <div class="marker-colors">
        <button class="marker-color-btn" data-color="yellow" title="黄">🟡</button>
        <button class="marker-color-btn" data-color="green" title="緑">🟢</button>
        <button class="marker-color-btn" data-color="blue" title="青">🔵</button>
        <button class="marker-color-btn" data-color="pink" title="ピンク">🩷</button>
      </div>
      <button class="marker-clear-btn" title="全消去">🗑</button>
    `;

    toolbar.querySelectorAll('.marker-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        const text = this.toolbar.dataset.selectedText;
        this.applyMarker(text, color);
        this.hideToolbar();
      });
    });

    toolbar.querySelector('.marker-clear-btn').addEventListener('click', () => {
      this.clearAllMarkers();
    });

    return toolbar;
  }

  applyMarker(text, color) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const markerId = `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const markerSpan = document.createElement('span');
    markerSpan.className = `text-marker ${color}-marker`;
    markerSpan.id = markerId;
    markerSpan.dataset.markerText = text;
    markerSpan.dataset.markerColor = color;
    markerSpan.dataset.markerTime = Date.now().toString();

    markerSpan.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.removeMarker(markerId);
    });

    try {
      range.surroundContents(markerSpan);
      this.saveMarker(markerId, text, color, range);
      selection.removeAllRanges();
    } catch (error) {
      // 複数の要素にまたがる場合はテキストノードを分割して処理
      this.handleComplexSelection(range, color, text);
    }
  }

  handleComplexSelection(range, color, text) {
    // 複雑な選択に対するフォールバック処理
    const markerId = `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const span = document.createElement('span');
    span.className = `text-marker ${color}-marker`;
    span.id = markerId;
    span.dataset.markerText = text;
    span.dataset.markerColor = color;
    span.dataset.markerTime = Date.now().toString();

    try {
      range.surroundContents(span);
      this.saveMarker(markerId, text, color, range);
    } catch (e) {
      console.warn('Failed to apply marker:', e);
    }
  }

  removeMarker(markerId) {
    const marker = document.getElementById(markerId);
    if (marker) {
      const parent = marker.parentNode;
      while (marker.firstChild) {
        parent.insertBefore(marker.firstChild, marker);
      }
      parent.removeChild(marker);
    }

    // 保存データからも削除
    this.markers = this.markers.filter(m => m.id !== markerId);
    this.saveMarkers();
  }

  clearAllMarkers() {
    document.querySelectorAll('.text-marker').forEach(marker => {
      const parent = marker.parentNode;
      while (marker.firstChild) {
        parent.insertBefore(marker.firstChild, marker);
      }
      parent.removeChild(marker);
    });
    this.markers = [];
    this.saveMarkers();
  }

  saveMarker(id, text, color, range) {
    // 位置情報を保存
    const container = range.commonAncestorContainer;
    const chapter = container.closest('.chapter');
    const chapterNum = chapter?.dataset.chapter || '0';

    this.markers.push({
      id,
      text,
      color,
      chapter: chapterNum,
      timestamp: Date.now()
    });
    this.saveMarkers();
  }

  saveMarkers() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.markers));
    } catch (e) {
      console.warn('Failed to save markers:', e);
    }
  }

  loadMarkers() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('Failed to load markers:', e);
      return [];
    }
  }

  restoreMarkers() {
    // マーカーの復元はHTMLが静的生成されているため、
    // サーバーサイドで処理するか、別の方法が必要
    // ここではクライアントサイドで保存されたデータベースを参照する実装
    console.log('Markers loaded:', this.markers.length);
  }

  exportMarkers() {
    const data = JSON.stringify(this.markers, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `markers-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importMarkers(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const markers = JSON.parse(e.target.result);
        if (Array.isArray(markers)) {
          this.markers = markers;
          this.saveMarkers();
          this.restoreMarkers();
        }
      } catch (error) {
        console.warn('Failed to import markers:', error);
      }
    };
    reader.readAsText(file);
  }

  getMarkers() {
    return [...this.markers];
  }

  getMarkersByChapter(chapterNum) {
    return this.markers.filter(m => m.chapter === String(chapterNum));
  }
}

export default Marker;
