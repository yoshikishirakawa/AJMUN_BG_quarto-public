import { downloadJson } from './comments.js';
import { loadReadingList, saveReadingList } from './storage.js';
import {
  getLinkHref,
  getLinkLabel,
  isExternalHref,
  isPdfHref,
  isSamePageAnchor,
  normalizeActionUrl,
  openInCurrentTab,
  openInNewTab
} from './link-utils.js';

function makeId(href) {
  try {
    return btoa(unescape(encodeURIComponent(href))).replace(/=+$/g, '').slice(0, 80);
  } catch (e) {
    return String(Date.now());
  }
}

function classifyHref(href) {
  if (isPdfHref(href)) return 'pdf';
  if (isSamePageAnchor(href)) return 'anchor';
  if (isExternalHref(href)) return 'external';
  return 'internal';
}

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  var href = String(item.href || '').trim();
  var absoluteHref = String(item.absoluteHref || normalizeActionUrl(href)).trim();
  if (!href || !absoluteHref) return null;

  return {
    id: String(item.id || makeId(absoluteHref)).slice(0, 100),
    title: String(item.title || href).replace(/\s+/g, ' ').trim().slice(0, 200),
    href: href.slice(0, 1000),
    absoluteHref: absoluteHref.slice(0, 1500),
    type: String(item.type || classifyHref(href)).slice(0, 30),
    addedAt: String(item.addedAt || new Date().toISOString())
  };
}

export class ReadingListController {
  constructor() {
    this.items = loadReadingList().map(sanitizeItem).filter(Boolean);
    this.list = document.getElementById('reading-list');
    this.count = document.getElementById('reading-list-count');
    this.bindToolbar();
    this.save(false);
    this.render();
  }

  createItemFromLink(link) {
    var href = getLinkHref(link);
    var absoluteHref = normalizeActionUrl(href);
    return sanitizeItem({
      id: makeId(absoluteHref),
      title: getLinkLabel(link),
      href: href,
      absoluteHref: absoluteHref,
      type: classifyHref(href),
      addedAt: new Date().toISOString()
    });
  }

  hasHref(href) {
    var absoluteHref = normalizeActionUrl(href);
    return this.items.some(function (item) {
      return item.absoluteHref === absoluteHref;
    });
  }

  toggleFromLink(link) {
    var item = this.createItemFromLink(link);
    if (!item) return false;
    var index = this.items.findIndex(function (existing) {
      return existing.absoluteHref === item.absoluteHref;
    });
    if (index >= 0) {
      this.items.splice(index, 1);
      this.save(true);
      return false;
    }
    this.items.push(item);
    this.save(true);
    return true;
  }

  remove(id) {
    this.items = this.items.filter(function (item) { return item.id !== id; });
    this.save(true);
  }

  clear() {
    this.items = [];
    this.save(true);
  }

  save(emit) {
    saveReadingList(this.items);
    this.render();
    if (emit) {
      document.dispatchEvent(new CustomEvent('reader:reading-list-updated', {
        detail: { items: this.items }
      }));
    }
  }

  render() {
    if (!this.list) return;

    this.list.replaceChildren();
    if (this.count) this.count.textContent = String(this.items.length);

    var note = document.createElement('p');
    note.className = 'u-text-muted reading-list-note';
    note.textContent = '読むリストはこの端末のブラウザに保存されます。';
    this.list.appendChild(note);

    if (!this.items.length) {
      var empty = document.createElement('p');
      empty.className = 'u-text-muted';
      empty.textContent = '読むリストは空です。';
      this.list.appendChild(empty);
      return;
    }

    var ol = document.createElement('ol');
    ol.className = 'reading-list-items';

    this.items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'reading-list-item';
      li.dataset.id = item.id;

      var title = document.createElement('a');
      title.className = 'reading-list-title';
      title.href = item.href;
      if (item.type === 'external') {
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
      }
      title.textContent = item.title || item.href;

      var path = document.createElement('div');
      path.className = 'reading-list-path';
      path.textContent = item.href;

      var actions = document.createElement('div');
      actions.className = 'reading-list-actions';

      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.textContent = '開く';
      openBtn.addEventListener('click', function () {
        if (item.type === 'external') openInNewTab(item.href);
        else openInCurrentTab(item.href);
      });

      var newTabBtn = document.createElement('button');
      newTabBtn.type = 'button';
      newTabBtn.textContent = '新しいタブ';
      newTabBtn.addEventListener('click', function () {
        openInNewTab(item.href);
      });

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '削除';
      removeBtn.addEventListener('click', function () {
        this.remove(item.id);
      }.bind(this));

      actions.append(openBtn, newTabBtn, removeBtn);
      li.append(title, path, actions);
      ol.appendChild(li);
    }.bind(this));

    this.list.appendChild(ol);
  }

  bindToolbar() {
    var exportBtn = document.getElementById('export-reading-list');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        downloadJson('reading-list', {
          version: '1.0',
          type: 'reading-list',
          exportedAt: new Date().toISOString(),
          data: this.items
        });
      }.bind(this));
    }

    var clearBtn = document.getElementById('clear-reading-list');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (window.confirm('読むリストをすべて削除しますか？')) this.clear();
      }.bind(this));
    }
  }
}
