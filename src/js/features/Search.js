/**
 * Search.js
 * 検索機能
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/04-interaction.md
 */

export class Search {
  constructor(searchIndexUrl) {
    this.searchIndexUrl = searchIndexUrl || '/assets/search.json';
    this.searchIndex = null;
    this.currentScope = 'all'; // current, all, external
    this.init();
  }

  async init() {
    await this.loadIndex();
    this.bindEvents();
  }

  async loadIndex() {
    try {
      const response = await fetch(this.searchIndexUrl);
      if (response.ok) {
        this.searchIndex = await response.json();
      }
    } catch (e) {
      console.warn('Failed to load search index:', e);
      this.searchIndex = { pages: [] };
    }
  }

  bindEvents() {
    const overlay = document.querySelector('.search-overlay');
    const input = document.querySelector('.search-input');
    const backdrop = document.querySelector('.search-overlay');

    // 入力イベント
    if (input) {
      input.addEventListener('input', (e) => {
        this.performSearch(e.target.value);
      });
    }

    // 検索範囲選択
    const scopeInputs = document.querySelectorAll('input[name="search-scope"]');
    scopeInputs.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.currentScope = e.target.value;
        const input = document.querySelector('.search-input');
        if (input) {
          this.performSearch(input.value);
        }
      });
    });

    // オーバーレイ外側クリックで閉じる
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.close();
        }
      });
    }

    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  performSearch(query) {
    if (!query || query.length < 2) {
      this.clearResults();
      return;
    }

    const results = this.search(query, this.currentScope);
    this.displayResults(results, query);
  }

  search(query, scope = this.currentScope) {
    const results = [];

    if (scope === 'current') {
      // 現在の章のみ検索
      results.push(...this.searchInDocument(document.body, query));
    } else if (scope === 'all') {
      // 全ドキュメント検索
      if (this.searchIndex && this.searchIndex.pages) {
        for (const page of this.searchIndex.pages) {
          const pageResults = this.searchInContent(page.content, query);
          results.push(...pageResults.map(r => ({ ...r, page })));
        }
      }
    } else if (scope === 'external') {
      // 外部サイトも含む（オプション）
      results.push(...this.searchExternal(query));
    }

    return results.sort((a, b) => b.score - a.score);
  }

  searchInDocument(root, query) {
    const results = [];
    const regex = new RegExp(this.escapeRegex(query), 'gi');
    let match;

    // .prose 内のテキストノードを探索
    const proseElements = root.querySelectorAll('.prose, .chapter-header');

    proseElements.forEach(element => {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node;
      while ((node = walker.nextNode()) && results.length < 100) {
        const text = node.textContent || '';
        regex.lastIndex = 0;

        while ((match = regex.exec(text)) !== null) {
          results.push({
            text: match[0],
            context: this.getContext(text, match.index, 30),
            score: this.calculateScore(query, match[0]),
            element: element
          });
        }
      }
    });

    return results;
  }

  searchInContent(content, query) {
    const results = [];
    const regex = new RegExp(this.escapeRegex(query), 'gi');
    let match;

    while ((match = regex.exec(content)) !== null && results.length < 20) {
      results.push({
        text: match[0],
        context: this.getContext(content, match.index, 30),
        score: this.calculateScore(query, match[0])
      });
    }

    return results;
  }

  searchExternal(query) {
    // 外部サイト検索はオプション実装
    return [];
  }

  getContext(text, index, padding) {
    const start = Math.max(0, index - padding);
    const end = Math.min(text.length, index + query?.length || 0 + padding);
    let context = text.slice(start, end);
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';
    return context;
  }

  calculateScore(query, match) {
    if (!query) return 50;
    // 完全一致 > 部分一致
    if (query === match) return 100;
    if (match.toLowerCase() === query.toLowerCase()) return 90;
    return 50;
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  displayResults(results, query) {
    const container = document.querySelector('.search-results');
    if (!container) return;

    if (results.length === 0) {
      container.innerHTML = '<p class="u-text-muted">検索結果がありません</p>';
      return;
    }

    container.innerHTML = `
      <p class="u-text-muted">${results.length}件の結果「${this.escapeHtml(query)}」</p>
      ${results.slice(0, 20).map(result => this.renderResult(result, query)).join('')}
    `;

    // 結果クリックイベント
    container.querySelectorAll('.search-result-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.goToResult(results[index]);
      });
    });
  }

  renderResult(result, query) {
    const highlightedContext = result.context.replace(
      new RegExp(`(${this.escapeRegex(query)})`, 'gi'),
      '<span class="search-result-highlight">$1</span>'
    );

    const chapterTitle = result.page?.title || '結果';

    return `
      <div class="search-result-item">
        <div class="search-result-chapter">${chapterTitle}</div>
        <p>${highlightedContext}</p>
      </div>
    `;
  }

  goToResult(result) {
    this.close();

    if (result.element) {
      result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (result.page?.url) {
      window.location.href = result.page.url;
    }
  }

  clearResults() {
    const container = document.querySelector('.search-results');
    if (container) {
      container.innerHTML = '';
    }
  }

  open() {
    const overlay = document.querySelector('.search-overlay');
    if (overlay) {
      overlay.classList.add('open');
      const input = overlay.querySelector('.search-input');
      if (input) {
        setTimeout(() => input.focus(), 100);
      }
    }
  }

  close() {
    const overlay = document.querySelector('.search-overlay');
    if (overlay) {
      overlay.classList.remove('open');
    }
    this.clearResults();
    const input = document.querySelector('.search-input');
    if (input) {
      input.value = '';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export default Search;
