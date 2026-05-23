import { STORAGE_KEYS } from './constants.js';
import { CommentsController } from './comments.js';
import { MarkerController } from './markers.js';
import { loadNavData } from './nav-data.js';
import { Storage, readJsonStorage, writeJsonStorage } from './storage.js';
import { copyTOCToDrawer, enhanceTOC } from './toc.js';
import { initSettings } from './settings.js';
import { ReadingListController } from './read-list.js';
import { LinkActionsController } from './link-actions.js';

(function () {
  'use strict';

  function AppState() {
    this.state = {
      theme: 'auto',
      fontSize: 'M',
      sidebarLeft: 'expanded',
      sidebarRight: 'expanded',
      drawerOpen: false,
      swipeEnabled: false
    };
    this.listeners = [];
    this.loadState();
  }

  AppState.prototype.get = function (key) {
    return this.state[key];
  };

  AppState.prototype.set = function (key, value) {
    if (this.state[key] !== value) {
      this.state[key] = value;
      this.notifyListeners(key, value);
      this.saveState();
    }
  };

  AppState.prototype.subscribe = function (listener) {
    this.listeners.push(listener);
    return function () {
      var index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    }.bind(this);
  };

  AppState.prototype.notifyListeners = function (key, value) {
    this.listeners.forEach(function (listener) {
      listener(key, value);
    });
  };

  AppState.prototype.loadState = function () {
    var parsed = readJsonStorage(STORAGE_KEYS.appState, null);
    if (!parsed || typeof parsed !== 'object') return;
    Object.keys(this.state).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        this.state[key] = parsed[key];
      }
    }.bind(this));
  };

  AppState.prototype.saveState = function () {
    writeJsonStorage(STORAGE_KEYS.appState, this.state);
  };

  function ChapterManager() {
    this.currentChapter = 1;
    this.totalChapters = 0;
    this.init();
  }

  ChapterManager.prototype.init = function () {
    this.countChapters();
    this.detectCurrentChapter();
    window.addEventListener('hashchange', function () {
      this.detectCurrentChapter();
      this.updateNavigation();
    }.bind(this));
    this.updateNavigation();
  };

  ChapterManager.prototype.countChapters = function () {
    this.totalChapters = Math.max(1, document.querySelectorAll('.chapter[data-chapter]').length || 1);
  };

  ChapterManager.prototype.detectCurrentChapter = function () {
    var hash = window.location.hash;
    var match = hash.match(/#chapter-(\d+)/);
    this.currentChapter = match ? parseInt(match[1], 10) : 1;
    this.updateTOCHighlight();
  };

  ChapterManager.prototype.goToChapter = function (chapterNum) {
    window.location.hash = 'chapter-' + chapterNum;
  };

  ChapterManager.prototype.nextChapter = function () {
    if (this.currentChapter < this.totalChapters) this.goToChapter(this.currentChapter + 1);
  };

  ChapterManager.prototype.previousChapter = function () {
    if (this.currentChapter > 1) this.goToChapter(this.currentChapter - 1);
  };

  ChapterManager.prototype.updateTOCHighlight = function () {
    document.querySelectorAll('.toc-item, .toc li').forEach(function (item) {
      item.classList.remove('toc-item--current', 'toc-item--visited', 'toc-item--future');
    });
    var current = document.querySelector('.toc-item[data-chapter="' + this.currentChapter + '"], .toc li[data-chapter="' + this.currentChapter + '"]');
    if (current) current.classList.add('toc-item--current');
  };

  ChapterManager.prototype.updateNavigation = function () {
    var prevBtn = document.querySelector('.chapter-nav-prev, .drawer-chapter-nav-prev');
    var nextBtn = document.querySelector('.chapter-nav-next, .drawer-chapter-nav-next');
    if (prevBtn) {
      prevBtn.style.opacity = this.currentChapter <= 1 ? '0.5' : '1';
      prevBtn.style.pointerEvents = this.currentChapter <= 1 ? 'none' : 'auto';
    }
    if (nextBtn) {
      nextBtn.style.opacity = this.currentChapter >= this.totalChapters ? '0.5' : '1';
      nextBtn.style.pointerEvents = this.currentChapter >= this.totalChapters ? 'none' : 'auto';
    }
    this.updateDrawerNavigation();
  };

  ChapterManager.prototype.updateDrawerNavigation = function () {
    updateDrawerTitle('.drawer-chapter-nav-prev .drawer-chapter-nav-title', this.currentChapter - 1);
    updateDrawerTitle('.drawer-chapter-nav-next .drawer-chapter-nav-title', this.currentChapter + 1);
  };

  function updateDrawerTitle(selector, chapterNumber) {
    var target = document.querySelector(selector);
    if (!target || chapterNumber < 1) return;
    var chapter = document.querySelector('.chapter[data-chapter="' + chapterNumber + '"]');
    if (!chapter) return;
    var heading = chapter.querySelector('h1');
    target.textContent = heading ? heading.textContent : '第' + chapterNumber + '章';
  }

  function ThemeManager(appState) {
    this.appState = appState;
    this.themes = ['light', 'dark', 'auto'];
    this.currentTheme = appState.get('theme') || 'auto';
    this.mediaQuery = null;
    this.applyTheme(this.currentTheme);
  }

  ThemeManager.prototype.applyTheme = function (theme) {
    if (theme === 'auto') {
      document.body.removeAttribute('data-theme');
      this.watchSystemTheme();
    } else {
      document.body.setAttribute('data-theme', theme);
      this.stopWatchingSystemTheme();
    }
    this.currentTheme = theme;
    this.updateIcon();
  };

  ThemeManager.prototype.updateIcon = function () {
    var btn = document.querySelector('.theme-btn');
    if (!btn) return;
    btn.textContent = ({ light: '🌙', dark: '☀️', auto: '🌗' })[this.currentTheme] || '🌙';
  };

  ThemeManager.prototype.cycleTheme = function () {
    var currentIndex = this.themes.indexOf(this.currentTheme);
    var nextTheme = this.themes[(currentIndex + 1) % this.themes.length];
    this.applyTheme(nextTheme);
    this.appState.set('theme', nextTheme);
  };

  ThemeManager.prototype.watchSystemTheme = function () {
    if (!this.mediaQuery || typeof this.mediaQuery.addEventListener !== 'function') {
      this.mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    }
  };

  ThemeManager.prototype.stopWatchingSystemTheme = function () {
    this.mediaQuery = null;
  };

  function Sidebar(appState) {
    this.appState = appState;
    this.layout = document.getElementById('reader-layout');
    if (this.layout) {
      this.bindToggleEvents();
      this.bindResizeEvents();
      this.updateTriggers();
    }
  }

  Sidebar.prototype.bindToggleEvents = function () {
    var leftToggle = this.layout.querySelector('.sidebar--left .sidebar-toggle');
    var rightToggle = this.layout.querySelector('.sidebar--right .sidebar-toggle');
    if (leftToggle) leftToggle.addEventListener('click', function () { this.toggleSidebar('left'); }.bind(this));
    if (rightToggle) rightToggle.addEventListener('click', function () { this.toggleSidebar('right'); }.bind(this));
    document.addEventListener('click', function (event) {
      if (event.target.classList.contains('sidebar-trigger--left')) this.toggleSidebar('left');
      if (event.target.classList.contains('sidebar-trigger--right')) this.toggleSidebar('right');
    }.bind(this));
  };

  Sidebar.prototype.bindResizeEvents = function () {
    var leftHandle = this.layout.querySelector('.sidebar--left .sidebar-resize-handle');
    var rightHandle = this.layout.querySelector('.sidebar--right .sidebar-resize-handle');
    if (leftHandle) this.setupResize(leftHandle, 'left');
    if (rightHandle) this.setupResize(rightHandle, 'right');
  };

  Sidebar.prototype.setupResize = function (handle, side) {
    var startX = 0;
    var startWidth = 0;
    var isDragging = false;
    handle.addEventListener('mousedown', function (event) {
      startX = event.clientX;
      var sidebar = document.querySelector('.sidebar--' + side);
      startWidth = sidebar ? sidebar.offsetWidth : 280;
      isDragging = true;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      event.preventDefault();
    });
    document.addEventListener('mousemove', function (event) {
      if (!isDragging) return;
      var diff = side === 'left' ? event.clientX - startX : startX - event.clientX;
      var width = Math.max(200, Math.min(400, startWidth + diff));
      document.documentElement.style.setProperty(side === 'left' ? '--sidebar-left-width' : '--sidebar-right-width', width + 'px');
    });
    document.addEventListener('mouseup', function () {
      if (!isDragging) return;
      isDragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
    });
  };

  Sidebar.prototype.toggleSidebar = function (side) {
    var key = side === 'left' ? 'sidebarLeft' : 'sidebarRight';
    this.appState.set(key, this.appState.get(key) === 'expanded' ? 'collapsed' : 'expanded');
    this.applyState();
  };

  Sidebar.prototype.applyState = function () {
    if (!this.layout) return;
    this.layout.dataset.sidebarLeft = this.appState.get('sidebarLeft');
    this.layout.dataset.sidebarRight = this.appState.get('sidebarRight');
    this.updateTriggers();
  };

  Sidebar.prototype.updateTriggers = function () {
    updateSidebarTrigger('left', this.appState.get('sidebarLeft') === 'collapsed');
    updateSidebarTrigger('right', this.appState.get('sidebarRight') === 'collapsed');
  };

  function updateSidebarTrigger(side, visible) {
    var trigger = document.querySelector('.sidebar-trigger--' + side);
    if (visible && !trigger) {
      trigger = document.createElement('div');
      trigger.className = 'sidebar-trigger sidebar-trigger--' + side;
      document.body.appendChild(trigger);
    }
    if (!trigger) return;
    trigger.classList.toggle('show', visible);
    trigger.classList.toggle('hide', !visible);
  }

  function Progress(chapterManager) {
    this.chapterManager = chapterManager;
    this.progressFill = document.getElementById('progress-fill');
    this.progressBar = document.getElementById('progress-bar');
    if (!this.progressBar) return;
    window.addEventListener('scroll', this.update.bind(this), { passive: true });
    this.update();
  }

  Progress.prototype.update = function () {
    var currentChapter = this.chapterManager.currentChapter;
    var totalChapters = Math.max(1, this.chapterManager.totalChapters);
    var scrollProgress = this.calculateScrollProgress();
    var percentage = Math.min(100, Math.max(0, Math.round((((currentChapter - 1) / totalChapters) + (scrollProgress / totalChapters)) * 100)));
    if (this.progressFill) this.progressFill.style.width = percentage + '%';
    if (this.progressBar) this.progressBar.dataset.progress = '第' + currentChapter + '章 / 全' + totalChapters + '章 (' + percentage + '%)';
  };

  Progress.prototype.calculateScrollProgress = function () {
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    return docHeight > 0 ? Math.min(1, window.scrollY / docHeight) : 0;
  };

  function Drawer(appState) {
    this.appState = appState;
    this.drawer = document.getElementById('drawer');
    this.backdrop = document.getElementById('drawer-backdrop');
    if (this.drawer) this.bindEvents();
  }

  Drawer.prototype.bindEvents = function () {
    var closeBtn = this.drawer.querySelector('.drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', this.close.bind(this));
    if (this.backdrop) this.backdrop.addEventListener('click', this.close.bind(this));
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && this.isOpen()) this.close();
    }.bind(this));
    this.drawer.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', this.close.bind(this));
    }.bind(this));
  };

  Drawer.prototype.open = function () {
    if (!this.drawer || !this.backdrop) return;
    this.drawer.classList.add('open');
    this.backdrop.classList.add('open');
    this.appState.set('drawerOpen', true);
    document.body.style.overflow = 'hidden';
  };

  Drawer.prototype.close = function () {
    if (!this.drawer || !this.backdrop) return;
    this.drawer.classList.remove('open');
    this.backdrop.classList.remove('open');
    this.appState.set('drawerOpen', false);
    document.body.style.overflow = '';
  };

  Drawer.prototype.toggle = function () {
    this.isOpen() ? this.close() : this.open();
  };

  Drawer.prototype.isOpen = function () {
    return !!(this.drawer && this.drawer.classList.contains('open'));
  };

  function FontSize(appState) {
    this.appState = appState;
    this.sizes = ['XS', 'S', 'M', 'L', 'XL'];
    this.currentSize = appState.get('fontSize') || 'M';
    this.applySize(this.currentSize);
    this.bindKeyboardShortcuts();
  }

  FontSize.prototype.applySize = function (size) {
    if (!this.sizes.includes(size)) size = 'M';
    document.body.setAttribute('data-font-size', size);
    this.currentSize = size;
    document.querySelectorAll('.font-size-btn').forEach(function (button) {
      button.classList.toggle('active', button.dataset.size === size);
    });
  };

  FontSize.prototype.setSize = function (size) {
    if (!this.sizes.includes(size)) return;
    this.applySize(size);
    this.appState.set('fontSize', size);
  };

  FontSize.prototype.increase = function () {
    var index = this.sizes.indexOf(this.currentSize);
    if (index < this.sizes.length - 1) this.setSize(this.sizes[index + 1]);
  };

  FontSize.prototype.decrease = function () {
    var index = this.sizes.indexOf(this.currentSize);
    if (index > 0) this.setSize(this.sizes[index - 1]);
  };

  FontSize.prototype.reset = function () {
    this.setSize('M');
  };

  FontSize.prototype.bindKeyboardShortcuts = function () {
    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        this.increase();
      } else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        this.decrease();
      } else if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        this.reset();
      }
    }.bind(this));
  };

  function SwipeNav(chapterManager) {
    this.chapterManager = chapterManager;
    this.enabled = localStorage.getItem(STORAGE_KEYS.swipeEnabled) === 'true';
    this.startX = 0;
    this.startTime = 0;
    this.threshold = 100;
    this.timeLimit = 300;
    if (this.enabled) this.bindEvents();
  }

  SwipeNav.prototype.setEnabled = function (enabled) {
    this.enabled = !!enabled;
    localStorage.setItem(STORAGE_KEYS.swipeEnabled, String(this.enabled));
    this.enabled ? this.bindEvents() : this.unbindEvents();
  };

  SwipeNav.prototype.bindEvents = function () {
    if (this.bound) return;
    this.handleTouchStart = function (event) {
      this.startX = event.touches[0].clientX;
      this.startTime = Date.now();
    }.bind(this);
    this.handleTouchEnd = function (event) {
      var diffTime = Date.now() - this.startTime;
      var diffX = event.changedTouches[0].clientX - this.startX;
      if (diffTime < this.timeLimit && Math.abs(diffX) > this.threshold) {
        diffX > 0 ? this.chapterManager.previousChapter() : this.chapterManager.nextChapter();
      }
    }.bind(this);
    document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    document.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    this.bound = true;
  };

  SwipeNav.prototype.unbindEvents = function () {
    if (!this.bound) return;
    document.removeEventListener('touchstart', this.handleTouchStart);
    document.removeEventListener('touchend', this.handleTouchEnd);
    this.bound = false;
  };

  function initApp() {
    var appState = new AppState();
    var storage = new Storage();
    var chapterManager = new ChapterManager();
    var sidebar = new Sidebar(appState);
    var progress = new Progress(chapterManager);
    var themeManager = new ThemeManager(appState);
    var fontSize = new FontSize(appState);
    var drawer = new Drawer(appState);
    var swipeNav = new SwipeNav(chapterManager);
    var comments = new CommentsController();
    var markers = new MarkerController();
    var readingList = new ReadingListController();

    window.readerApp = {
      appState: appState,
      chapterManager: chapterManager,
      storage: storage,
      sidebar: sidebar,
      progress: progress,
      themeManager: themeManager,
      fontSize: fontSize,
      drawer: drawer,
      swipeNav: swipeNav,
      comments: comments,
      readingList: readingList,
      markers: markers
    };

    initHeader(themeManager, drawer);
    initSettings({ fontSize: fontSize, markers: markers, comments: comments });
    initTabs();
    enhanceTOC();
    chapterManager.countChapters();
    updateChapterNavLinks(chapterManager);
    copyTOCToDrawer();
    var linkActions = new LinkActionsController({ readingList: readingList });
    window.readerApp.linkActions = linkActions;
    initReadingProgress();
    initKeyboardShortcuts(drawer, themeManager);
    sidebar.applyState();
    themeManager.applyTheme(appState.get('theme'));
    loadNavData().catch(function () {});
  }

  function initHeader(themeManager, drawer) {
    var menuBtn = document.querySelector('.menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', function () { drawer.toggle(); });
    var searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', function () {
        var overlay = document.getElementById('search-overlay');
        if (!overlay) return;
        overlay.classList.add('open');
        var input = overlay.querySelector('.search-input');
        if (input) setTimeout(function () { input.focus(); }, 100);
      });
    }
    var settingsBtn = document.querySelector('.settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () {
        var menu = document.getElementById('settings-menu');
        if (menu) menu.classList.add('open');
      });
    }
    var themeBtn = document.querySelector('.theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', function () { themeManager.cycleTheme(); });
  }

  function initTabs() {
    var tabs = document.querySelectorAll('.tab');
    var tabContents = document.querySelectorAll('.tab-content');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var targetTab = tab.dataset.tab;
        if (!targetTab) return;
        tabs.forEach(function (item) { item.classList.remove('active'); });
        tab.classList.add('active');
        tabContents.forEach(function (content) {
          content.classList.toggle('active', content.id === 'tab-' + targetTab);
          content.classList.toggle('tab-content--active', content.id === 'tab-' + targetTab);
        });
      });
    });
  }

  function updateChapterNavLinks(chapterManager) {
    setTimeout(function () {
      var chapters = document.querySelectorAll('.chapter[data-chapter]');
      var currentIndex = chapterManager.currentChapter;
      var prevLink = document.querySelector('.chapter-nav-prev, .drawer-chapter-nav-prev');
      var nextLink = document.querySelector('.chapter-nav-next, .drawer-chapter-nav-next');
      if (prevLink && currentIndex > 1 && chapters[currentIndex - 2]?.id) {
        prevLink.href = '#' + chapters[currentIndex - 2].id;
      }
      if (nextLink && currentIndex < chapters.length && chapters[currentIndex]?.id) {
        nextLink.href = '#' + chapters[currentIndex].id;
      }
    }, 100);
  }

  function initReadingProgress() {
    var saveTimeout;
    function savePosition() {
      try { sessionStorage.setItem(STORAGE_KEYS.scrollPosition, String(window.scrollY)); } catch (e) {}
    }
    function restorePosition() {
      try {
        var saved = sessionStorage.getItem(STORAGE_KEYS.scrollPosition);
        var position = saved ? parseInt(saved, 10) : 0;
        if (!Number.isNaN(position) && position > 0) window.scrollTo(0, position);
      } catch (e) {}
    }
    window.addEventListener('scroll', function () {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(savePosition, 500);
    }, { passive: true });
    window.addEventListener('beforeunload', savePosition);
    window.addEventListener('load', function () { setTimeout(restorePosition, 100); });
  }

  function initKeyboardShortcuts(drawer) {
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var searchOverlay = document.getElementById('search-overlay');
        var settingsMenu = document.getElementById('settings-menu');
        if (searchOverlay) searchOverlay.classList.remove('open');
        if (settingsMenu) settingsMenu.classList.remove('open');
        if (drawer.isOpen()) drawer.close();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        var overlay = document.getElementById('search-overlay');
        if (overlay) {
          overlay.classList.add('open');
          var input = overlay.querySelector('.search-input');
          if (input) setTimeout(function () { input.focus(); }, 100);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
