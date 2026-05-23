import {
  copyText,
  getLinkHref,
  isExternalHref,
  isPdfHref,
  isSamePageAnchor,
  normalizeActionUrl,
  openInCurrentTab,
  openInNewTab
} from './link-utils.js';

export class LinkActionsController {
  constructor(options) {
    this.readingList = options && options.readingList;
    this.menu = null;
    this.init();
  }

  init() {
    this.createMenuRoot();
    this.normalizeGeneratedLinks();
    this.enhanceStaticLinks();

    document.addEventListener('reader:reading-list-updated', function () {
      this.syncAddedState();
    }.bind(this));

    document.addEventListener('click', function (event) {
      if (!this.menu || this.menu.hidden) return;
      if (this.menu.contains(event.target)) return;
      this.closeMenu();
    }.bind(this));

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') this.closeMenu();
    }.bind(this));
  }

  createMenuRoot() {
    this.menu = document.getElementById('link-action-menu');
    if (this.menu) return;
    this.menu = document.createElement('div');
    this.menu.id = 'link-action-menu';
    this.menu.className = 'link-action-menu';
    this.menu.hidden = true;
    document.body.appendChild(this.menu);
  }

  normalizeGeneratedLinks() {
    document.querySelectorAll('main#quarto-document-content a[href], main.reader-main a[href]').forEach(function (link) {
      var href = getLinkHref(link);
      if (/^(mailto:|tel:)/i.test(href)) return;
      if (isExternalHref(href)) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        link.classList.add('external-link');
      }
      if (isPdfHref(href)) link.classList.add('pdf-link');
    });
  }

  enhanceStaticLinks() {
    [
      '.toc-item > a',
      '.toc-sublist a',
      '.drawer-toc a',
      '.chapter-nav-prev',
      '.chapter-nav-next',
      '.drawer-chapter-nav-prev',
      '.drawer-chapter-nav-next',
      '.index-list a',
      '.aj-index__locations a'
    ].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (link) {
        this.enhanceLink(link);
      }.bind(this));
    }.bind(this));
    this.syncAddedState();
  }

  enhanceLink(link) {
    if (!link || link.dataset.readerActionsEnhanced === 'true') return;
    var href = getLinkHref(link);
    if (!href || isSamePageAnchor(href)) return;
    if (!link.parentNode) return;

    link.dataset.readerActionsEnhanced = 'true';

    var wrapper = document.createElement('span');
    wrapper.className = 'link-action-wrapper';
    link.parentNode.insertBefore(wrapper, link);
    wrapper.appendChild(link);

    var newTabButton = this.createActionButton('↗', '新しいタブで開く', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openInNewTab(href);
    });

    var addButton = this.createActionButton('＋', '読むリストに追加', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (this.readingList) this.readingList.toggleFromLink(link);
      this.syncAddedState();
    }.bind(this));
    addButton.dataset.readerAction = 'toggle-reading-list';

    var moreButton = this.createActionButton('…', 'リンク操作', function (event) {
      event.preventDefault();
      event.stopPropagation();
      this.openMenu(link, moreButton);
    }.bind(this));

    wrapper.append(newTabButton, addButton, moreButton);
  }

  createActionButton(text, label, handler) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-action-btn';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', handler);
    return button;
  }

  syncAddedState() {
    if (!this.readingList) return;
    document.querySelectorAll('.link-action-wrapper').forEach(function (wrapper) {
      var link = wrapper.querySelector('a[href]');
      var button = wrapper.querySelector('[data-reader-action="toggle-reading-list"]');
      if (!link || !button) return;
      var added = this.readingList.hasHref(getLinkHref(link));
      button.classList.toggle('is-added', added);
      button.textContent = added ? '✓' : '＋';
      button.setAttribute('aria-label', added ? '読むリストから削除' : '読むリストに追加');
    }.bind(this));
  }

  openMenu(link, anchor) {
    if (!this.menu) return;
    var href = getLinkHref(link);
    this.menu.replaceChildren();
    [
      ['開く', function () { openInCurrentTab(href); }],
      ['新しいタブ', function () { openInNewTab(href); }],
      ['読むリスト', function () { if (this.readingList) this.readingList.toggleFromLink(link); }.bind(this)],
      ['コピー', function () { copyText(normalizeActionUrl(href)); }]
    ].forEach(function (entry) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry[0];
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        entry[1]();
        this.closeMenu();
        this.syncAddedState();
      }.bind(this));
      this.menu.appendChild(button);
    }.bind(this));

    var rect = anchor.getBoundingClientRect();
    this.menu.style.left = Math.min(window.innerWidth - 180, rect.left) + 'px';
    this.menu.style.top = rect.bottom + 6 + window.scrollY + 'px';
    this.menu.hidden = false;
  }

  closeMenu() {
    if (this.menu) this.menu.hidden = true;
  }
}
