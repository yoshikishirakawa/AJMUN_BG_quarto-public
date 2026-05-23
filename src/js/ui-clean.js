// Clean UI implementation with tabs and markers
(function () {
  'use strict';

  console.log('[UI-Clean] Script initializing...');
  window.__uiCleanAPI__ = {};

  // Helper to ensure we don't run multiple times
  if (window.__uiCleanInitialized) return;
  window.__uiCleanInitialized = true;

  // -- 1. Smooth Scroll Setup with Header Offset --
  // We need to account for the fixed header height when scrolling to anchors.
  const HEADER_SELECTOR = '#quarto-header';
  const SCROLL_OFFSET_VAR = '--idx-scroll-offset';

  function getHeaderOffset() {
    const header = document.querySelector(HEADER_SELECTOR);
    if (header) {
      return header.offsetHeight;
    }
    return 0;
  }

  // Storage keys
  const STORAGE_KEYS = {
    tocLocation: 'quarto-toc-location',
    theme: 'quarto-theme',
    fontSize: 'quarto-font-size',
    markers: 'quarto-markers',
    scrollPosition: 'quarto-scroll-position'
  };
  const PDF_CONFIG = window.AJMUN_PDF_CONFIG || {};
  const PDF_LINK_SELECTOR = '[data-pdf-link="true"]';
  const PDF_FALLBACK_FILENAMES = ['index.pdf'];
  let resolvedPdfVariantsPromise = null;

  let lastTocSpacingFingerprint = null;
  const tocFootnoteObservers = [];

  const FONT_SIZE_DEFAULT = 'M';
  const FONT_SIZE_OPTIONS = ['3XS', '2XS', 'XS', 'S', 'M', 'L', 'XL'];
  const FONT_SIZE_SET = new Set(FONT_SIZE_OPTIONS);
  const FONT_SIZE_ALIASES = {
    '3xs': '3XS',
    '2xs': '2XS',
    'xs': 'XS',
    's': 'S',
    'm': 'M',
    'l': 'L',
    'xl': 'XL',
    'xxx-small': '3XS',
    'xx-small': '2XS',
    'x-small': 'XS',
    'small': 'S',
    'medium': 'M',
    'default': 'M',
    'large': 'L',
    'x-large': 'XL',
    'xx-large': 'XL'
  };

  let readingMeterState = null;
  const FOOTNOTE_INLINE_BREAKPOINT = 1024;
  let currentFootnoteLayout = null;
  let footnotesPlaceholderEl = null;
  let scrollExtensionEventsBound = false;
  let scrollExtensionEl = null;
  let pendingScrollExtensionRaf = 0;
  const SCROLL_EXTENSION_BUFFER = 80;

  function resolveAssetPath(relPath) {
    try {
      // Prefer Quarto's offset meta when available so paths work on index.html and content pages
      const offsetMeta = document.querySelector('meta[name="quarto:offset"]');
      if (offsetMeta) {
        let offset = offsetMeta.getAttribute('content') || '';
        if (offset && !offset.endsWith('/')) offset += '/';
        return offset + relPath;
      }

      // Fallback: derive base from simple-theme.css location if present
      const themeLink = document.querySelector('link[rel="stylesheet"][href*="src/css/simple-theme.css"]');
      if (themeLink) {
        const href = themeLink.getAttribute('href') || '';
        const parts = href.split('/');
        const srcIndex = parts.indexOf('src');
        if (srcIndex >= 0) {
          const prefix = parts.slice(0, srcIndex).join('/');
          const base = prefix ? prefix.replace(/\/*$/, '/') : '';
          return base + relPath;
        }
      }
    } catch (error) {
      console.warn('resolveAssetPath failed', error);
    }
    return relPath;
  }

  function formatReadingNumber(value) {
    if (!Number.isFinite(value)) {
      return '0';
    }
    try {
      return value.toLocaleString('ja-JP');
    } catch (error) {
      console.warn('Failed to format number:', error);
      return String(Math.trunc(value));
    }
  }

  function formatReadingMeter(current, total) {
    return `${formatReadingNumber(current)} / ${formatReadingNumber(total)}`;
  }

  function getCurrentDocumentOffset() {
    const offsetMeta = document.querySelector('meta[name="quarto:offset"]');
    let offset = offsetMeta ? offsetMeta.getAttribute('content') || '' : '';
    if (!offset) {
      return './';
    }
    return offset.endsWith('/') ? offset : `${offset}/`;
  }

  function looksLikeSampleHtmlDeployment() {
    const pathname = window.location.pathname || '';
    return /\/html(?:\/|$)/.test(pathname) || pathname.includes('/sample-outputs/html/');
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function resolvePdfCandidateUrls() {
    const offset = getCurrentDocumentOffset();
    const configuredNames = [];
    if (PDF_CONFIG.bookPdfFilename) {
      configuredNames.push(PDF_CONFIG.bookPdfFilename);
    }
    const filenames = uniqueValues([...configuredNames, ...PDF_FALLBACK_FILENAMES]);
    const relativeCandidates = [];

    if (PDF_CONFIG.samplePdfRelativePath) {
      relativeCandidates.push(PDF_CONFIG.samplePdfRelativePath);
    }
    if (looksLikeSampleHtmlDeployment()) {
      filenames.forEach((name) => {
        relativeCandidates.push(`${offset}../pdf/${name}`);
      });
    }
    if (PDF_CONFIG.officialPdfRelativePath) {
      relativeCandidates.push(PDF_CONFIG.officialPdfRelativePath);
    }
    filenames.forEach((name) => {
      relativeCandidates.push(`${offset}${name}`);
    });

    return uniqueValues(relativeCandidates).map((candidate) => {
      try {
        return new URL(candidate, document.baseURI).href;
      } catch (error) {
        console.warn('Failed to build PDF URL:', candidate, error);
        return null;
      }
    }).filter(Boolean);
  }

  function getConfiguredPdfVariants() {
    if (Array.isArray(PDF_CONFIG.variants) && PDF_CONFIG.variants.length) {
      return PDF_CONFIG.variants;
    }
    return [
      {
        id: 'print',
        label: '印刷版PDF',
        description: '印刷・配布向け',
        relativePath: PDF_CONFIG.officialPdfRelativePath || 'pdf/平和への課題：補遺.pdf'
      }
    ];
  }

  function resolvePdfVariantUrls(variant) {
    const offset = getCurrentDocumentOffset();
    const candidates = [];
    if (variant.relativePath) candidates.push(`${offset}${variant.relativePath}`);
    if (variant.sampleRelativePath) candidates.push(variant.sampleRelativePath);
    return uniqueValues(candidates).map((candidate) => {
      try {
        return new URL(candidate, document.baseURI).href;
      } catch (error) {
        console.warn('Failed to build PDF URL:', candidate, error);
        return null;
      }
    }).filter(Boolean);
  }

  async function resolvePdfVariants() {
    const variants = getConfiguredPdfVariants();
    const resolved = [];
    for (const variant of variants) {
      const candidates = resolvePdfVariantUrls(variant);
      let url = candidates[0] || null;
      let available = Boolean(url);
      if (window.location.protocol !== 'file:') {
        available = false;
        for (const candidate of candidates) {
          try {
            const response = await fetch(candidate, { method: 'HEAD' });
            if (response.ok) {
              url = candidate;
              available = true;
              break;
            }
          } catch (error) {
            console.warn('PDF HEAD request failed:', candidate, error);
          }
        }
      }
      resolved.push({ ...variant, url, available });
    }
    return resolved;
  }

  async function resolveExistingPdfUrl() {
    const candidates = resolvePdfCandidateUrls();
    if (!candidates.length) {
      return null;
    }
    if (window.location.protocol === 'file:') {
      return candidates[0];
    }
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, { method: 'HEAD' });
        if (response.ok) {
          return candidate;
        }
      } catch (error) {
        console.warn('PDF HEAD request failed:', candidate, error);
      }
    }
    return null;
  }

  function getResolvedPdfVariants() {
    if (!resolvedPdfVariantsPromise) {
      resolvedPdfVariantsPromise = resolvePdfVariants().then(async (variants) => {
        if (variants.some((variant) => variant.available)) return variants;
        const legacyUrl = await resolveExistingPdfUrl();
        if (!legacyUrl) return variants;
        return [
          {
            id: 'legacy',
            label: 'PDF版',
            description: '配布用PDF',
            url: legacyUrl,
            available: true
          },
          ...variants
        ];
      });
    }
    return resolvedPdfVariantsPromise;
  }

  function closePdfChooser() {
    const existing = document.querySelector('.pdf-choice-overlay');
    if (existing) existing.remove();
    const lastTrigger = document.querySelector('[data-pdf-last-trigger="true"]');
    if (lastTrigger instanceof HTMLElement) {
      lastTrigger.removeAttribute('data-pdf-last-trigger');
      lastTrigger.focus();
    }
  }

  function openPdfChooser(variants, trigger) {
    closePdfChooser();
    if (trigger instanceof HTMLElement) {
      trigger.setAttribute('data-pdf-last-trigger', 'true');
    }
    const overlay = document.createElement('div');
    overlay.className = 'pdf-choice-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
      <div class="pdf-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-choice-title">
        <div class="pdf-choice-header">
          <h2 id="pdf-choice-title">PDFを選択</h2>
          <button type="button" class="pdf-choice-close" aria-label="閉じる">×</button>
        </div>
        <div class="pdf-choice-list"></div>
      </div>
    `;
    const list = overlay.querySelector('.pdf-choice-list');
    variants.forEach((variant) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pdf-choice-item';
      if (!variant.available || !variant.url) {
        button.disabled = true;
        button.classList.add('is-disabled');
      }
      button.innerHTML = `
        <span class="pdf-choice-label">${variant.label || 'PDF'}</span>
        <span class="pdf-choice-description">${variant.available ? (variant.description || '') : 'PDF準備中'}</span>
      `;
      button.addEventListener('click', () => {
        if (variant.available && variant.url) {
          window.location.href = variant.url;
        }
      });
      list.appendChild(button);
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closePdfChooser();
    });
    overlay.querySelector('.pdf-choice-close')?.addEventListener('click', closePdfChooser);
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        closePdfChooser();
        document.removeEventListener('keydown', onKeydown);
      }
    };
    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);
    const first = overlay.querySelector('.pdf-choice-item:not(:disabled), .pdf-choice-close');
    if (first instanceof HTMLElement) first.focus();
  }

  function applyResolvedPdfVariants(variants) {
    const available = variants.find((variant) => variant.available && variant.url);
    document.querySelectorAll(PDF_LINK_SELECTOR).forEach((link) => {
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }
      if (available) {
        link.href = available.url;
        link.removeAttribute('target');
        link.removeAttribute('rel');
        link.removeAttribute('aria-disabled');
        link.classList.remove('is-pdf-unavailable');
        if ((link.textContent || '').trim() === 'PDF準備中') {
          link.textContent = 'PDF版';
        }
        if (link.dataset.pdfChooserReady !== 'true') {
          link.dataset.pdfChooserReady = 'true';
          link.addEventListener('click', (event) => {
            event.preventDefault();
            openPdfChooser(variants, link);
          });
        }
      } else {
        link.href = '#printing';
        link.removeAttribute('target');
        link.removeAttribute('rel');
        link.setAttribute('aria-disabled', 'true');
        link.classList.add('is-pdf-unavailable');
        link.textContent = 'PDF準備中';
        link.title = 'PDFは現在準備中です。HTML版をご利用ください。';
      }
    });
  }

  function setupPdfDownloadLinks() {
    getResolvedPdfVariants()
      .then((variants) => applyResolvedPdfVariants(variants))
      .catch((error) => {
        console.warn('Failed to resolve PDF URL:', error);
        applyResolvedPdfVariants([]);
      });
  }

  function extractReadableText(root) {
    if (!root) return '';
    const clone = root.cloneNode(true);
    const selectorsToRemove = [
      '.header-ui',
      '.settings-menu',
      '.settings-menu-overlay',
      '.scroll-settings-header',
      '#scroll-settings-header',
      '.toc-overlay',
      '.global-search-overlay',
      '.marker-toolbar'
    ];
    selectorsToRemove.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((node) => node.remove());
    });
    return (clone.textContent || '').replace(/\s+/g, '');
  }

  function ensureScrollExtensionElement() {
    if (scrollExtensionEl && document.body.contains(scrollExtensionEl)) {
      return scrollExtensionEl;
    }
    if (!document.body) return null;
    scrollExtensionEl = document.createElement('div');
    scrollExtensionEl.id = 'scroll-extension-anchor';
    scrollExtensionEl.setAttribute('aria-hidden', 'true');
    scrollExtensionEl.style.cssText = 'width:1px;height:0;margin:0;padding:0;';
    document.body.appendChild(scrollExtensionEl);
    return scrollExtensionEl;
  }

  function updateScrollExtensionNow() {
    const placeholder = ensureScrollExtensionElement();
    if (!placeholder) return;
    placeholder.style.height = '0px';
    const docElement = document.documentElement || document.body;
    const baseHeight = Math.max(
      document.body ? document.body.scrollHeight : 0,
      docElement ? docElement.scrollHeight : 0
    );
    let maxBottom = baseHeight;
    let hasTarget = false;
    const targets = [
      document.getElementById('quarto-document-content'),
      document.getElementById('quarto-sidebar'),
      document.getElementById('quarto-margin-sidebar')
    ];
    targets.forEach(el => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.bottom)) return;
      const bottom = rect.bottom + window.scrollY;
      if (!Number.isFinite(bottom)) return;
      maxBottom = Math.max(maxBottom, bottom);
      hasTarget = true;
    });
    if (!hasTarget) {
      placeholder.style.height = '0px';
      return;
    }
    const needed = Math.max(0, Math.ceil(maxBottom - baseHeight + SCROLL_EXTENSION_BUFFER));
    placeholder.style.height = needed > 0 ? `${needed} px` : '0px';
  }

  function scheduleScrollExtensionUpdate() {
    if (typeof requestAnimationFrame !== 'function') {
      return updateScrollExtensionNow();
    }
    if (pendingScrollExtensionRaf) {
      cancelAnimationFrame(pendingScrollExtensionRaf);
    }
    pendingScrollExtensionRaf = requestAnimationFrame(() => {
      pendingScrollExtensionRaf = 0;
      updateScrollExtensionNow();
    });
  }

  function initializeReadingMeter(displayEl) {
    if (!displayEl) {
      return;
    }

    const readingRoot = document.querySelector('#quarto-document-content');
    if (!readingRoot) {
      displayEl.textContent = formatReadingMeter(0, 0);
      displayEl.setAttribute('aria-label', '読書メーター: 0 / 0');
      displayEl.title = '読書メーター: 0 / 0';
      return;
    }

    // 単一HTMLの仮想ページネーション対応
    // 初期状態では、仮想ページが有効かどうかをチェック
    let activeChapter = document.querySelector('section.chapter-page.active');
    // もし仮想ページが見つからなければ全体(readingRoot)を対象にする
    let measureTarget = activeChapter || readingRoot;

    // テキスト抽出（仮想ページがある場合はその章のみ、なければ全体）
    let totalText = extractReadableText(measureTarget);
    let totalChars = totalText.length;
    let formattedTotal = formatReadingNumber(totalChars);

    displayEl.textContent = formatReadingMeter(0, totalChars);
    displayEl.setAttribute('data-total-chars', `${totalChars} `);
    displayEl.setAttribute('data-current-chars', '0');
    displayEl.setAttribute('data-progress-percent', '0');
    displayEl.setAttribute('aria-live', 'polite');
    displayEl.setAttribute('aria-label', `読書メーター: 0 / ${formattedTotal} `);
    displayEl.title = `読書メーター: 0 / ${formattedTotal}`;

    const state = {
      displayEl,
      readingRoot,
      measureElement: measureTarget,
      totalChars,
      formattedTotal,
      lastCurrent: -1,
      lastOutput: '',
      updateScheduled: false,
      cleanup: null
    };

    const computeRatio = () => {
      if (!state.measureElement) return 0;

      // 単一HTMLページネーションで非表示になっている場合の対策
      // getBoundingClientRect() は非表示要素では高さ0になるため、
      // 仮想ページ切り替えイベントで正しくstate.measureElementが更新されている必要がある

      const rect = state.measureElement.getBoundingClientRect();
      const contentTop = window.scrollY + rect.top;
      const contentBottom = contentTop + rect.height;

      if (!Number.isFinite(contentTop) || !Number.isFinite(contentBottom) || contentBottom <= contentTop) {
        return 0;
      }

      const scrollTop = window.scrollY;
      const scrollBottom = scrollTop + window.innerHeight;
      const scrollRange = contentBottom - contentTop - window.innerHeight;
      let ratio;

      if (scrollRange <= 0) {
        if (scrollBottom >= contentBottom) {
          ratio = 1;
        } else if (scrollTop <= contentTop) {
          ratio = 0;
        } else {
          ratio = (scrollTop - contentTop) / Math.max(1, contentBottom - contentTop);
        }
      } else {
        ratio = (scrollTop - contentTop) / scrollRange;
      }

      if (!Number.isFinite(ratio)) {
        return 0;
      }
      return Math.min(1, Math.max(0, ratio));
    };

    const applyUpdate = () => {
      state.updateScheduled = false;
      if (state.totalChars <= 0) {
        const output = formatReadingMeter(0, 0);
        if (output !== state.lastOutput) {
          state.lastOutput = output;
          state.displayEl.textContent = output;
          state.displayEl.setAttribute('data-current-chars', '0');
          state.displayEl.setAttribute('data-progress-percent', '0');
          state.displayEl.setAttribute('aria-label', '読書メーター: 0 / 0');
          state.displayEl.title = '読書メーター: 0 / 0';
        }
        return;
      }

      const ratio = computeRatio();
      const currentChars = Math.max(0, Math.min(state.totalChars, Math.round(state.totalChars * ratio)));
      if (currentChars === state.lastCurrent && state.lastOutput) {
        return;
      }

      state.lastCurrent = currentChars;
      const formattedCurrent = formatReadingNumber(currentChars);
      const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
      const output = formatReadingMeter(currentChars, state.totalChars);
      if (output !== state.lastOutput) {
        state.lastOutput = output;
        state.displayEl.textContent = output;
        state.displayEl.setAttribute('data-current-chars', `${currentChars} `);
        state.displayEl.setAttribute('data-progress-percent', `${percent}`);
        state.displayEl.setAttribute('aria-label', `読書メーター: ${formattedCurrent} / ${state.formattedTotal}`);
        state.displayEl.title = `読書メーター: ${formattedCurrent} / ${state.formattedTotal}`;
      }
    };

    const scheduleUpdate = () => {
      if (state.updateScheduled) return;
      state.updateScheduled = true;
      requestAnimationFrame(applyUpdate);
    };

    const onScroll = () => scheduleUpdate();
    const onResize = () => scheduleUpdate();

    // 章切り替えイベントのリスナー (単一HTML用)
    const onChapterChanged = (e) => {
      const section = e.detail && e.detail.section;
      if (section) {
        state.measureElement = section;
        // 文字数も再計算（章ごとにリセットする場合）
        const txt = extractReadableText(section);
        state.totalChars = txt.length;
        state.formattedTotal = formatReadingNumber(state.totalChars);
        // Reset current
        state.lastCurrent = -1;
        state.lastOutput = ''; // Force update
        scheduleUpdate();
      }
    };

    if (readingMeterState && typeof readingMeterState.cleanup === 'function') {
      readingMeterState.cleanup();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('quarto-chapter-changed', onChapterChanged);

    state.cleanup = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('quarto-chapter-changed', onChapterChanged);
    };

    readingMeterState = state;
    scheduleUpdate();
  }

  function normalizeFontSize(value) {
    if (value === undefined || value === null) {
      return FONT_SIZE_DEFAULT;
    }
    const trimmed = `${value}`.trim();
    if (!trimmed) {
      return FONT_SIZE_DEFAULT;
    }
    if (FONT_SIZE_SET.has(trimmed)) {
      return trimmed;
    }
    const upper = trimmed.toUpperCase();
    if (FONT_SIZE_SET.has(upper)) {
      return upper;
    }
    const lower = trimmed.toLowerCase();
    if (lower in FONT_SIZE_ALIASES) {
      return FONT_SIZE_ALIASES[lower];
    }
    return FONT_SIZE_DEFAULT;
  }

  function applyFontSize(value, { persist = true } = {}) {
    const normalized = normalizeFontSize(value);
    if (document.body) {
      const current = document.body.getAttribute('data-font-size');
      if (current !== normalized) {
        document.body.setAttribute('data-font-size', normalized);
      }
      requestAnimationFrame(() => {
        updateTocSpacing();
      });
    }
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEYS.fontSize, normalized);
      } catch (err) {
        console.warn('Failed to persist font size:', err);
      }
    }
    return normalized;
  }

  function initializeFontSize() {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEYS.fontSize);
    } catch (err) {
      console.warn('Failed to read stored font size:', err);
    }
    return applyFontSize(stored);
  }

  function updateTocSpacing() {
    if (!document.body) return;
    const fontSizeValue = window.getComputedStyle(document.body).fontSize;
    const fontSize = parseFloat(fontSizeValue);
    console.log('Current font size:', fontSize, 'px');
    if (!Number.isFinite(fontSize) || fontSize <= 0) {
      console.warn('Invalid font size detected:', fontSize);
      return;
    }

    // 線の太さのみpx単位で設定（最小1px確保）
    const lineThickness = Math.max(1, Math.round(fontSize * 0.08));

    const fingerprint = `${fontSize}|${lineThickness}`;

    if (fingerprint === lastTocSpacingFingerprint) {
      console.log('TOC spacing unchanged, skipping update');
      return;
    }
    lastTocSpacingFingerprint = fingerprint;

    const root = document.documentElement;
    // 線の太さのみ更新（その他はCSSのem単位とcalc()に任せる）
    root.style.setProperty('--toc-line-thickness', `${lineThickness}px`);
    console.log('TOC CSS variables updated:', { fontSize, lineThickness });
  }

  // Initialize when DOM is ready (or immediately if already loaded)
  function initUI() {
    console.log('UIクリーン版を初期化');

    const initialFontSize = initializeFontSize();
    console.log('Initial font size applied:', initialFontSize);
    updateTocSpacing();

    setupHeaderControls();
    setupLeftPanelTabs();
    setupRightSidebar();
    setupMarkerFunctionality();
    setupMobileFootnoteToggle();
    setupSidebarSearch();
    setupGlobalSearch();
    setupKeyboardShortcuts();
    setupPdfDownloadLinks();
    setupScrollPosition();
    setupScrollableSettingsHeader(); // スクロール設定ヘッダーを追加

    if (!scrollExtensionEventsBound) {
      window.addEventListener('resize', () => scheduleScrollExtensionUpdate(), { passive: true });
      window.addEventListener('orientationchange', () => scheduleScrollExtensionUpdate());
      window.addEventListener('load', () => scheduleScrollExtensionUpdate(), { once: true });
      scrollExtensionEventsBound = true;
    }
    scheduleScrollExtensionUpdate();

    setupTocFootnoteCleanup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  // Header controls setup
  function setupHeaderControls() {
    const tocLocationBtn = document.getElementById('toc-location-btn');
    const tocMobileBtn = document.getElementById('toc-mobile-btn');
    const pdfBtn = document.getElementById('pdf-download-btn');
    const themeSelect = document.getElementById('theme-select');
    const fontSizeSelect = document.getElementById('font-size-select');
    const searchBtn = document.getElementById('search-open-btn');

    if (themeSelect) {
      const currentTheme = localStorage.getItem(STORAGE_KEYS.theme) || 'light';
      themeSelect.value = currentTheme;
      document.body.setAttribute('data-theme', currentTheme);

      themeSelect.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEYS.theme, theme);
        console.log('Theme switched to:', theme);
      });
    }

    if (fontSizeSelect) {
      const bodySize = document.body ? document.body.getAttribute('data-font-size') : null;
      let storedSize = null;
      try {
        storedSize = localStorage.getItem(STORAGE_KEYS.fontSize);
      } catch (err) {
        console.warn('Failed to read stored font size:', err);
      }
      const currentSize = normalizeFontSize(bodySize || storedSize);
      fontSizeSelect.value = currentSize;

      fontSizeSelect.addEventListener('change', (e) => {
        const normalized = applyFontSize(e.target.value);
        console.log('Font size changed to:', normalized);
        if (fontSizeSelect.value !== normalized) {
          fontSizeSelect.value = normalized;
        }
        const scrollSelect = document.getElementById('scroll-font-size-select');
        if (scrollSelect && scrollSelect.value !== normalized) {
          scrollSelect.value = normalized;
        }
      });
    }

    if (tocMobileBtn) {
      tocMobileBtn.addEventListener('click', toggleMobileToc);
    }

    if (pdfBtn) {
      pdfBtn.addEventListener('click', downloadPdf);
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openSearchOverlay();
      });
    }
  }

  // Left sidebar toggle between project navigation and page TOC
  function setupLeftPanelTabs() {
    const sidebar = document.getElementById('quarto-sidebar');
    if (!sidebar) {
      console.warn('Sidebar element not found');
      return;
    }

    const menuContainer = sidebar.querySelector('.sidebar-menu-container');
    if (!menuContainer) {
      console.warn('Sidebar menu container not found');
      return;
    }

    const marginSidebar = document.getElementById('quarto-margin-sidebar');
    const pageToc = marginSidebar ? marginSidebar.querySelector('#TOC') : null;

    // Build tab UI
    const tabWrapper = document.createElement('div');
    tabWrapper.className = 'toc-switcher';
    tabWrapper.innerHTML = `
      <div class="toc-tabs">
        <button type="button" class="toc-tab active" data-tab="site">各章</button>
        <button type="button" class="toc-tab" data-tab="page">章内</button>
        <button type="button" class="toc-tab" data-tab="all">全体</button>
      </div>
      <div class="toc-panel toc-site-content"></div>
      <div class="toc-panel toc-page-content hidden"></div>
      <div class="toc-panel toc-all-content hidden"></div>
    `;

    // Clone menu for "all" tab before we replace it
    const menuCloneForAll = menuContainer.cloneNode(true);

    // Replace original menu container with the tab wrapper
    const parent = menuContainer.parentNode;
    parent.replaceChild(tabWrapper, menuContainer);

    // Move site navigation into site panel
    const sitePanel = tabWrapper.querySelector('.toc-site-content');
    sitePanel.appendChild(menuContainer);

    // Prepare page TOC panel
    const pagePanel = tabWrapper.querySelector('.toc-page-content');
    if (pageToc) {
      pagePanel.appendChild(pageToc);
      pagePanel.classList.add('page-toc');
      marginSidebar.innerHTML = '';
    } else {
      pagePanel.innerHTML = '<p class="toc-empty">このページには表示できる見出しがありません。</p>';
    }

    // Prepare "all" tab panel (expand all site nav levels)
    const allPanel = tabWrapper.querySelector('.toc-all-content');
    if (menuCloneForAll) {
      expandAllInMenu(menuCloneForAll);
      allPanel.appendChild(menuCloneForAll);
    } else {
      allPanel.innerHTML = '<p class="toc-empty">メニューを読み込めませんでした。</p>';
    }

    // Tab switching behaviour
    const tabButtons = tabWrapper.querySelectorAll('.toc-tab');
    const panels = {
      site: sitePanel,
      page: pagePanel,
      all: allPanel
    };
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const target = button.dataset.tab;
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        Object.values(panels).forEach(p => p.classList.add('hidden'));
        if (panels[target]) panels[target].classList.remove('hidden');
      });
    });

    console.log('サイドバータブを初期化しました');
    scheduleScrollExtensionUpdate();

    // 単一HTMLの場合、タブ構築後に再度ハイライトを適用して同期を確実にする
    if (typeof window.showFromHash === 'function') {
      window.showFromHash();
    }
  }

  // Footnotes layout controller (sidebar vs inline on portrait)
  function setupRightSidebar() {
    const debouncedApply = debounce(applyFootnoteLayout, 150);
    applyFootnoteLayout();
    // respond to orientation/resize/media query changes
    window.addEventListener('resize', debouncedApply);
    window.addEventListener('orientationchange', debouncedApply);
    const breakpointQuery = window.matchMedia(`(max-width: ${FOOTNOTE_INLINE_BREAKPOINT}px)`);
    if (typeof breakpointQuery.addEventListener === 'function') {
      breakpointQuery.addEventListener('change', debouncedApply);
    } else if (typeof breakpointQuery.addListener === 'function') {
      breakpointQuery.addListener(debouncedApply);
    }
  }

  function applyFootnoteLayout() {
    const inlineQuery = window.matchMedia(`(max-width: ${FOOTNOTE_INLINE_BREAKPOINT}px)`);
    const shouldInline = inlineQuery.matches || window.innerWidth <= FOOTNOTE_INLINE_BREAKPOINT;
    const nextMode = shouldInline ? 'inline' : 'sidebar';
    if (currentFootnoteLayout === nextMode) return;
    currentFootnoteLayout = nextMode;
    document.body.classList.toggle('footnotes-inline-mode', shouldInline);
    document.body.classList.toggle('footnotes-sidebar-mode', !shouldInline);
    if (shouldInline) {
      renderInlineFootnotes();
    } else {
      renderSidebarFootnotes();
    }
  }

  function renderSidebarFootnotes() {
    // clear inline blocks if any
    document.querySelectorAll('.footnote-inline').forEach(n => n.remove());

    const marginSidebar = document.getElementById('quarto-margin-sidebar');
    if (!marginSidebar) return;

    const footnotes = document.querySelector('section.footnotes');
    if (!footnotes) {
      marginSidebar.innerHTML = '<p class="footnotes-empty">このページには脚注がありません。</p>';
      return;
    }

    ensureFootnotesPlaceholder(footnotes);
    marginSidebar.innerHTML = '';
    const header = document.createElement('h2');
    header.className = 'footnotes-title';
    header.textContent = '脚注';
    marginSidebar.appendChild(header);
    marginSidebar.appendChild(footnotes);
    footnotes.classList.add('margin-footnotes');
    footnotes.style.display = '';

    // inject numbers label at start of each li
    const items = footnotes.querySelectorAll('ol > li');
    items.forEach((li, idx) => {
      if (!li.querySelector('.footnote-num')) {
        const num = document.createElement('span');
        num.className = 'footnote-num';
        num.textContent = (idx + 1) + '. ';
        // insert before first child paragraph/text
        li.insertBefore(num, li.firstChild);
      }
    });
    scheduleScrollExtensionUpdate();
  }

  function renderInlineFootnotes() {
    const marginSidebar = document.getElementById('quarto-margin-sidebar');
    const footnotesSection = document.querySelector('section.footnotes');
    if (footnotesSection) {
      ensureFootnotesPlaceholder(footnotesSection);
      if (marginSidebar && marginSidebar.contains(footnotesSection)) {
        marginSidebar.removeChild(footnotesSection);
      }
      restoreFootnotesToDocument(footnotesSection);
      footnotesSection.classList.remove('margin-footnotes');
      footnotesSection.style.display = '';
    }
    if (marginSidebar) marginSidebar.innerHTML = '';
    // remove previous inline blocks
    document.querySelectorAll('.footnote-inline').forEach(n => n.remove());

    if (!footnotesSection) return;

    const refSelector = 'a[role="doc-noteref"], a.footnote-ref';
    document.querySelectorAll(refSelector).forEach(ref => {
      const href = ref.getAttribute('href') || ref.getAttribute('data-footnote-href');
      if (!href || !href.startsWith('#')) return;
      const target = document.querySelector(href);
      if (!target) return;

      const numberText = (ref.textContent || '').replace(/[^0-9]/g, '') || '';
      const host = findHostParagraph(ref);
      if (!host) return;

      // clone content and strip back links
      const clone = target.cloneNode(true);
      clone.querySelectorAll('.footnote-back, .footnote-backref, [role="doc-backlink"]').forEach(a => a.remove());

      const container = document.createElement('div');
      container.className = 'footnote-inline';
      const numSpan = document.createElement('span');
      numSpan.className = 'footnote-num';
      numSpan.textContent = (numberText ? numberText : '') + '. ';
      container.appendChild(numSpan);
      // append the inner contents of li (without the id wrapper)
      while (clone.firstChild) {
        container.appendChild(clone.firstChild);
      }
      host.insertAdjacentElement('afterend', container);
    });
    scheduleScrollExtensionUpdate();
  }

  function ensureFootnotesPlaceholder(section) {
    if (footnotesPlaceholderEl || !section || !section.parentNode) return;
    footnotesPlaceholderEl = document.createElement('div');
    footnotesPlaceholderEl.className = 'footnotes-placeholder';
    footnotesPlaceholderEl.style.display = 'none';
    section.parentNode.insertBefore(footnotesPlaceholderEl, section);
  }

  function restoreFootnotesToDocument(section) {
    if (!section || !footnotesPlaceholderEl || !footnotesPlaceholderEl.parentNode) return;
    if (footnotesPlaceholderEl.nextSibling === section) return;
    footnotesPlaceholderEl.parentNode.insertBefore(section, footnotesPlaceholderEl.nextSibling);
  }

  function findHostParagraph(el) {
    let p = el;
    while (p && p !== document.body) {
      if (p.tagName === 'P' || p.tagName === 'LI') return p;
      p = p.parentElement;
    }
    return null;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  // Scrollable settings header setup
  function setupScrollableSettingsHeader() {
    // スクロール設定ヘッダーを作成
    const headerHTML = `
      <div class="scroll-settings-header" id="scroll-settings-header">
        <div class="scroll-settings-header-left">
          <span class="scroll-settings-header-title"><span class="scroll-title-main">平和への課題：補遺</span><span class="scroll-title-sub">Background Guide</span></span>
        </div>
        <div class="scroll-settings-header-controls">
          <button id="scroll-search-btn" class="scroll-search-btn" aria-label="検索">🔍 検索</button>
          <div class="font-size-control">
            <label for="scroll-font-size-select">文字サイズ：</label>
            <select id="scroll-font-size-select">
              <option value="3XS">3XS</option>
              <option value="2XS">2XS</option>
              <option value="XS">XS</option>
              <option value="S">S</option>
              <option value="M" selected>M</option>
              <option value="L">L</option>
              <option value="XL">XL</option>
            </select>
          </div>
          <div class="theme-control">
            <label for="scroll-theme-select">テーマ：</label>
            <select id="scroll-theme-select">
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
              <option value="auto">自動</option>
            </select>
          </div>
          <div class="comment-control">
            <button id="scroll-comments-export-page" class="js-comments-export-page">コメント出力(このページ)</button>
            <button id="scroll-comments-export-all" class="js-comments-export-all">全コメント出力</button>
            <input type="file" id="scroll-comments-import" class="js-comments-import" accept="application/json">
            <label for="scroll-comments-import" class="js-comments-import-button">ファイル選択</label>
          </div>
        </div>
      </div>
    `;

    // ボディにヘッダーを挿入
    document.body.insertAdjacentHTML('afterbegin', headerHTML);
    console.log('Scrollable settings header inserted');

    const scrollHeader = document.getElementById('scroll-settings-header');
    const scrollFontSizeSelect = document.getElementById('scroll-font-size-select');
    const scrollThemeSelect = document.getElementById('scroll-theme-select');
    const scrollSearchBtn = document.getElementById('scroll-search-btn');

    // 検索ボタンのイベントリスナー
    if (scrollSearchBtn) {
      scrollSearchBtn.addEventListener('click', () => {
        if (window.quartoOpenSearch) {
          window.quartoOpenSearch();
        } else {
          openSearchOverlay();
        }
      });
    }

    // イベントリスナーの初期化
    if (scrollFontSizeSelect) {
      const bodySize = document.body ? document.body.getAttribute('data-font-size') : null;
      let storedSize = null;
      try {
        storedSize = localStorage.getItem(STORAGE_KEYS.fontSize);
      } catch (err) {
        console.warn('Failed to read stored font size:', err);
      }
      const currentSize = normalizeFontSize(bodySize || storedSize);
      scrollFontSizeSelect.value = currentSize;

      scrollFontSizeSelect.addEventListener('change', (e) => {
        const normalized = applyFontSize(e.target.value);
        if (scrollFontSizeSelect.value !== normalized) {
          scrollFontSizeSelect.value = normalized;
        }

        // 元のセレクトボックスにも同期
        const originalSelect = document.getElementById('font-size-select');
        if (originalSelect && originalSelect.value !== normalized) {
          originalSelect.value = normalized;
        }
      });
    }

    if (scrollThemeSelect) {
      const currentTheme = localStorage.getItem(STORAGE_KEYS.theme) || 'light';
      scrollThemeSelect.value = currentTheme;

      scrollThemeSelect.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEYS.theme, theme);

        // 元のセレクトボックスにも同期
        const originalSelect = document.getElementById('theme-select');
        if (originalSelect) {
          originalSelect.value = theme;
        }
      });
    }

    // コメント機能イベントリスナー
    const scrollCommentsExportPage = document.getElementById('scroll-comments-export-page');
    const scrollCommentsExportAll = document.getElementById('scroll-comments-export-all');
    const scrollCommentsImport = document.getElementById('scroll-comments-import');

    if (scrollCommentsExportPage) {
      scrollCommentsExportPage.addEventListener('click', () => {
        const originalBtn = document.getElementById('comments-export-page');
        if (originalBtn) originalBtn.click();
      });
    }

    if (scrollCommentsExportAll) {
      scrollCommentsExportAll.addEventListener('click', () => {
        const originalBtn = document.getElementById('comments-export-all');
        if (originalBtn) originalBtn.click();
      });
    }

    if (scrollCommentsImport) {
      scrollCommentsImport.addEventListener('change', (e) => {
        const originalInput = document.getElementById('comments-import');
        if (originalInput) {
          // ファイルを元のインプットに転送
          if (e.target.files.length > 0) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(e.target.files[0]);
            originalInput.files = dataTransfer.files;

            // changeイベントをトリガー
            const event = new Event('change', { bubbles: true });
            originalInput.dispatchEvent(event);
          }
        }
        // ファイル入力をリセット
        e.target.value = '';
      });
    }

    // スクロールイベントでヘッダーの表示/非表示を制御
    let lastScrollY = 0;
    let ticking = false;

    function updateScrollHeader() {
      const scrollY = window.scrollY;
      const threshold = 200; // 200px以上スクロールしたら表示

      console.log('Scroll position:', scrollY, 'Threshold:', threshold);

      if (scrollY > threshold) {
        scrollHeader.classList.add('visible');
        console.log('Header should be visible');
      } else {
        scrollHeader.classList.remove('visible');
        console.log('Header should be hidden');
      }

      lastScrollY = scrollY;
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateScrollHeader();
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll);

    // テーマ変更時にスクロールヘッダーも更新するための監視
    const themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const currentTheme = document.body.getAttribute('data-theme');
          if (scrollThemeSelect && scrollThemeSelect.value !== currentTheme) {
            scrollThemeSelect.value = currentTheme;
          }
        }
      });
    });

    themeObserver.observe(document.body, { attributes: true });

    // フォントサイズ変更時にスクロールヘッダーも更新するための監視
    const fontSizeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-font-size') {
          const currentSize = normalizeFontSize(document.body.getAttribute('data-font-size'));
          if (scrollFontSizeSelect && scrollFontSizeSelect.value !== currentSize) {
            scrollFontSizeSelect.value = currentSize;
          }
          const originalSelect = document.getElementById('font-size-select');
          if (originalSelect && originalSelect.value !== currentSize) {
            originalSelect.value = currentSize;
          }
          // レンダリング後に更新
          requestAnimationFrame(() => {
            updateTocSpacing();
          });
        }
      });
    });

    fontSizeObserver.observe(document.body, { attributes: true });
  }

  // Marker functionality
  function setupMarkerFunctionality() {
    let selectedText = '';
    let markers = JSON.parse(localStorage.getItem(STORAGE_KEYS.markers) || '{}');

    // Listen for text selection
    document.addEventListener('mouseup', (e) => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text.length > 0) {
        selectedText = text;
        showMarkerToolbar(e.pageX, e.pageY);
      } else {
        hideMarkerToolbar();
      }
    });

    // Show marker toolbar
    function showMarkerToolbar(x, y) {
      let toolbar = document.querySelector('.marker-toolbar');
      if (!toolbar) {
        toolbar = createMarkerToolbar();
        document.body.appendChild(toolbar);
      }

      toolbar.style.left = x + 'px';
      toolbar.style.top = (y - 50) + 'px';
      toolbar.classList.add('show');
    }

    // Create marker toolbar
    function createMarkerToolbar() {
      const toolbar = document.createElement('div');
      toolbar.className = 'marker-toolbar';
      toolbar.innerHTML = `
        <div class="marker-colors">
          <button class="marker-color-btn" data-color="yellow">黄</button>
          <button class="marker-color-btn" data-color="green">緑</button>
          <button class="marker-color-btn" data-color="blue">青</button>
          <button class="marker-color-btn" data-color="pink">ピンク</button>
        </div>
        <button class="marker-clear-btn">全消去</button>
      `;

      // Color selection
      toolbar.querySelectorAll('.marker-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          applyMarker(selectedText, btn.dataset.color);
          hideMarkerToolbar();
        });
      });

      // Clear all
      toolbar.querySelector('.marker-clear-btn').addEventListener('click', () => {
        clearAllMarkers();
        hideMarkerToolbar();
        window.getSelection().removeAllRanges();
      });

      return toolbar;
    }

    // Apply marker to selected text
    function applyMarker(text, color) {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const markerId = `marker-${Date.now()}`;

      // Create marker span
      const markerSpan = document.createElement('span');
      markerSpan.className = `text-marker ${color}-marker`;
      markerSpan.id = markerId;
      markerSpan.setAttribute('data-marker-text', text);
      markerSpan.addEventListener('dblclick', () => {
        removeMarker(markerId);
      });

      try {
        range.surroundContents(markerSpan);

        // Save marker data
        if (!markers[window.location.pathname]) {
          markers[window.location.pathname] = [];
        }
        markers[window.location.pathname].push({
          id: markerId,
          text: text,
          color: color,
          timestamp: Date.now()
        });

        localStorage.setItem(STORAGE_KEYS.markers, JSON.stringify(markers));
        console.log(`Marker applied: ${text} (${color})`);

      } catch (error) {
        console.error('Failed to apply marker:', error);
      }

      selection.removeAllRanges();
    }

    // Hide marker toolbar
    function hideMarkerToolbar() {
      const toolbar = document.querySelector('.marker-toolbar');
      if (toolbar) {
        toolbar.classList.remove('show');
      }
    }

    // Remove individual marker
    function removeMarker(markerId) {
      const marker = document.getElementById(markerId);
      if (marker) {
        const parent = marker.parentNode;
        while (marker.firstChild) {
          parent.insertBefore(marker.firstChild, marker);
        }
        parent.removeChild(marker);

        // Remove from storage
        if (markers[window.location.pathname]) {
          markers[window.location.pathname] = markers[window.location.pathname].filter(m => m.id !== markerId);
          localStorage.setItem(STORAGE_KEYS.markers, JSON.stringify(markers));
        }
      }
    }

    // Clear all markers
    function clearAllMarkers() {
      document.querySelectorAll('.text-marker').forEach(marker => marker.remove());
      delete markers[window.location.pathname];
      localStorage.setItem(STORAGE_KEYS.markers, JSON.stringify(markers));
    }
  }

  // Mobile footnote toggle
  function setupMobileFootnoteToggle() {
    const footnotes = document.querySelectorAll('.footnote-ref');
    footnotes.forEach(footnote => {
      footnote.addEventListener('click', (e) => {
        e.preventDefault();
        const footnoteId = footnote.getAttribute('href');
        const footnoteDef = document.querySelector(footnoteId);
        if (footnoteDef) {
          footnoteDef.classList.toggle('expanded');
        }
      });
    });
  }

  function setupSidebarSearch() {
    const sidebarSearch = document.querySelector('#quarto-sidebar .sidebar-search');
    if (!sidebarSearch) {
      return;
    }

    try {
      const defaultBtn = document.getElementById('quarto-search');
      if (defaultBtn) defaultBtn.remove();
      const defaultResultsPanel = document.getElementById('quarto-search-results');
      if (defaultResultsPanel) defaultResultsPanel.remove();
      const defaultOptions = document.getElementById('quarto-search-options');
      if (defaultOptions) defaultOptions.remove();
      if (window.Quarto && window.Quarto.doc) {
        window.Quarto.doc.disableSearch = true;
      }
    } catch (error) {
      console.warn('Failed to disable default Quarto search UI:', error);
    }

    sidebarSearch.innerHTML = '';
    sidebarSearch.style.display = '';

    const utilityBar = document.createElement('div');
    utilityBar.className = 'sidebar-search-utility';

    const searchButton = document.createElement('button');
    searchButton.type = 'button';
    searchButton.className = 'sidebar-search-button';
    searchButton.setAttribute('aria-label', '検索を開く (Cmd+K)');
    searchButton.title = '検索 (Cmd+K)';

    const searchIcon = document.createElement('img');
    searchIcon.className = 'sidebar-search-button-icon';
    searchIcon.alt = '';
    searchIcon.decoding = 'async';
    searchIcon.loading = 'lazy';
    searchIcon.setAttribute('aria-hidden', 'true');
    searchIcon.src = resolveAssetPath('assets/search.png');

    searchButton.appendChild(searchIcon);
    searchButton.addEventListener('click', () => {
      const handle = openSearchOverlay('');
      if (handle && handle.input) {
        const inputEl = handle.input;
        const end = inputEl.value.length;
        inputEl.focus();
        inputEl.setSelectionRange(end, end);
      }
    });

    utilityBar.appendChild(searchButton);

    const meterWrapper = document.createElement('div');
    meterWrapper.className = 'sidebar-reading-meter';
    meterWrapper.setAttribute('role', 'status');
    meterWrapper.setAttribute('aria-label', '読書メーター');
    meterWrapper.title = '読書メーター';

    const meterValue = document.createElement('span');
    meterValue.className = 'sidebar-reading-meter-value';
    meterValue.textContent = formatReadingMeter(0, 0);

    meterWrapper.appendChild(meterValue);
    utilityBar.appendChild(meterWrapper);

    sidebarSearch.appendChild(utilityBar);

    initializeReadingMeter(meterValue);
    restoreSearchSession();
  }
}

const SEARCH_SESSION_KEY = 'quarto-search-session';

function saveSearchSession(session) {
  try {
    sessionStorage.setItem(SEARCH_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn('Search session save failed', error);
  }
}

function loadSearchSession() {
  try {
    const raw = sessionStorage.getItem(SEARCH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Search session load failed', error);
    return null;
  }
}

function restoreSearchSession() {
  const session = loadSearchSession();
  if (!session || !Array.isArray(session.results) || !session.results.length) {
    return;
  }

  // No longer rendering sidebar results since sidebar search is removed
  // SEARCH_RESULTS_VIEW.sidebarData = session;
  // renderSidebarSearchResults(session);

  const currentUrl = new URL(window.location.href, window.location.origin);
  if (session.active) {
    const target = new URL(session.active.url, window.location.href);
    if (target.origin === currentUrl.origin && target.pathname === currentUrl.pathname) {
      requestAnimationFrame(() => {
        clearSearchHighlights();
        scrollToMatchOnPage(session.query, session.active.matchIndex || 0);
      });
    }
  }
}

function clearSidebarSearchResults() {
  // Function kept for compatibility but functionality removed since sidebar search is disabled
  clearSearchHighlights();
  try {
    sessionStorage.removeItem(SEARCH_SESSION_KEY);
  } catch (error) {
    console.warn('Failed to clear search session', error);
  }
}

// Sidebar search results function (deactivated but kept for compatibility)
function renderSidebarSearchResults(session) {
  // Function deactivated - sidebar search is now removed
  // kept for reference compatibility but no longer functional
  return;

  /* Original implementation commented out:
  const container = SEARCH_RESULTS_VIEW.sidebarContainer;
  if (!container) return;

  SEARCH_RESULTS_VIEW.sidebarData = session;

  const empty = container.querySelector('.sidebar-search-empty');
  const summary = SEARCH_RESULTS_VIEW.sidebarSummary;
  const list = SEARCH_RESULTS_VIEW.sidebarList;
  const queryLabel = SEARCH_RESULTS_VIEW.sidebarQuery;

  if (!session || !Array.isArray(session.results) || !session.results.length) {
    clearSidebarSearchResults();
    return;
  }

  container.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');
  if (summary) {
    const hiddenCount = session.results.reduce((sum, item) => sum + (item.remainingMatches || 0), 0);
    const totalMatches = session.results.length + hiddenCount;
    summary.innerHTML = `<p><strong>${totalMatches}</strong>件の結果（「${escapeHtml(session.query)}」）</p>`;
  }
  if (queryLabel) {
    queryLabel.textContent = `「${session.query}」`;
  }
  if (list) {
    list.innerHTML = '';
    session.results.forEach((result, index) => {
      const itemBtn = document.createElement('button');
      itemBtn.type = 'button';
      itemBtn.className = 'sidebar-search-item';
      if (session.active &&
          session.active.url === result.url &&
          session.active.matchIndex === result.matchIndex) {
        itemBtn.classList.add('active');
      }

      itemBtn.innerHTML = `
        <span class="sidebar-search-item-title">${escapeHtml(result.title)}</span>
        <span class="sidebar-search-item-count">${result.totalMatches || result.matchCount}件</span>
        <span class="sidebar-search-item-order">${result.matchIndex + 1}/${result.totalMatches || result.matchCount}</span>
        <div class="sidebar-search-item-context">${result.context}</div>
      `;

      itemBtn.addEventListener('click', () => {
        handleSidebarResultSelection(result, index);
      });
      list.appendChild(itemBtn);
    });
  }
  */
}

function handleSidebarResultSelection(result, index) {
  // Function deactivated - sidebar search is now removed
  // kept for reference compatibility but no longer functional
  return;

  /* Original implementation commented out:
  if (!SEARCH_RESULTS_VIEW.sidebarData) return;
  const session = SEARCH_RESULTS_VIEW.sidebarData;
  session.active = {
    url: result.url,
    matchIndex: result.matchIndex,
    index
  };
  session.timestamp = Date.now();
  saveSearchSession(session);
  renderSidebarSearchResults(session);
  navigateToSearchResult(result, session.query);
  */
}

function handleOverlayResultSelection(result, linkElement) {
  if (!result) return;
  const activePayload = convertResultToSession(result);
  const session = {
    query: SEARCH_RESULTS_VIEW.query,
    results: convertOverlayResultsForSession(SEARCH_RESULTS_VIEW.results),
    active: {
      url: activePayload.url,
      matchIndex: activePayload.matchIndex || 0
    },
    timestamp: Date.now()
  };
  // No longer storing sidebar data since sidebar search is removed
  // SEARCH_RESULTS_VIEW.sidebarData = session;
  saveSearchSession(session);
  // renderSidebarSearchResults(session); // Removed function call
  if (typeof SEARCH_RESULTS_VIEW.closeOverlay === 'function') {
    SEARCH_RESULTS_VIEW.closeOverlay();
  }
  navigateToSearchResult(activePayload, session.query);
}

function resolveResultUrl(url) {
  try {
    const resolved = new URL(url, window.location.href);
    return resolved.href;
  } catch {
    return url;
  }
}

function convertOverlayResultsForSession(results) {
  return results.map(convertResultToSession);
}

function convertResultToSession(result) {
  const page = result.page || {};
  return {
    url: page.url ? resolveResultUrl(page.url) : resolveResultUrl(result.url || window.location.href),
    title: page.title || result.title || (page.url || 'ページ'),
    chapter: page.chapter || result.chapter || '',
    context: result.context || '',
    matchCount: result.matchCount || 1,
    totalMatches: result.totalMatches || result.matchCount || 1,
    remainingMatches: result.remainingMatches || 0,
    matchIndex: result.matchIndex || 0
  };
}

function navigateToSearchResult(result, query) {
  if (!result) return;
  const targetUrl = new URL(result.url, window.location.href);
  const currentUrl = new URL(window.location.href);
  const sameDocument = targetUrl.origin === currentUrl.origin && targetUrl.pathname === currentUrl.pathname;

  if (sameDocument) {
    if (targetUrl.hash && targetUrl.hash !== window.location.hash) {
      window.location.hash = targetUrl.hash;
    }
    requestAnimationFrame(() => {
      if (!scrollToMatchOnPage(query, result.matchIndex || 0)) {
        // fallback to focus heading if hash present
        if (targetUrl.hash) {
          const targetEl = document.querySelector(targetUrl.hash);
          if (targetEl && typeof targetEl.scrollIntoView === 'function') {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    });
  } else {
    window.location.href = targetUrl.href;
  }
}

function scrollToMatchOnPage(query, matchIndex) {
  if (!query) return false;
  clearSearchHighlights();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const target = query.toLowerCase();
  let occurrence = -1;
  let node = walker.nextNode();
  while (node) {
    if (!(node.parentElement && node.parentElement.closest('.global-search-overlay'))) {
      const text = node.textContent || '';
      const lower = text.toLowerCase();
      let pos = 0;
      while (true) {
        const found = lower.indexOf(target, pos);
        if (found === -1) break;
        occurrence += 1;
        if (occurrence === matchIndex) {
          const range = document.createRange();
          range.setStart(node, found);
          range.setEnd(node, found + query.length);
          highlightRange(range);
          return true;
        }
        pos = found + query.length;
      }
    }
    node = walker.nextNode();
  }
  return false;
}

let activeSearchHighlights = [];

function clearSearchHighlights() {
  if (!activeSearchHighlights.length) return;
  activeSearchHighlights.forEach(span => {
    try {
      if (!span || !span.parentNode) return;
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    } catch (error) {
      console.warn('Failed clearing highlight', error);
    }
  });
  activeSearchHighlights = [];
}

function highlightRange(range) {
  if (!range) return;
  const mark = document.createElement('mark');
  mark.className = 'search-hit-highlight';
  try {
    range.surroundContents(mark);
    activeSearchHighlights.push(mark);
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      mark.classList.add('search-hit-fade');
    }, 100);
  } catch (error) {
    console.warn('Failed to highlight range', error);
  }
}

// Global search setup
function setupGlobalSearch() {
  // Trigger async load immediately but don't await
  setupSearchIndex();

  window.quartoOpenSearch = (initialQuery = '') => {
    if (typeof initialQuery !== 'string') {
      initialQuery = '';
    }
    openSearchOverlay(initialQuery);
  };
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearchOverlay();
    }
  });
}

// 検索インデックスのセットアップ
async function setupSearchIndex() {
  if (window.searchIndexLoaded) return;

  try {
    const assetPath = resolveAssetPath('assets/search-index.json');
    console.log('[Search] Fetching index from:', assetPath);
    const response = await fetch(assetPath);

    if (response.ok) {
      const data = await response.json();
      window.searchIndex = data; // { pages: [...] }
      window.searchIndexLoaded = true;
      console.log('[Search] Index loaded:', window.searchIndex.pages.length, 'pages');
    } else {
      console.warn('[Search] Failed to load search-index.json. Falling back to inline scan if available.');
      window.searchIndex = { pages: [] };
    }
  } catch (e) {
    console.error('[Search] Error loading search index:', e);
    window.searchIndex = { pages: [] };
  }
}

const SEARCH_RESULTS_VIEW = {
  results: [],
  query: '',
  rendered: 0,
  chunkSize: 20,
  totalCount: 0,
  summaryEl: null,
  listEl: null,
  loadMoreWrapper: null,
  loadMoreBtn: null,
  lastChapter: '',
  lastPage: '',
  closeOverlay: null,
  overlayKeyHandler: null,
  overlayClickHandler: null,
  sidebarContainer: null,
  sidebarSummary: null,
  sidebarList: null,
  sidebarQuery: null,
  sidebarClearBtn: null,
  sidebarData: null
};

function openSearchOverlay(initialQuery = '') {
  const startQuery = typeof initialQuery === 'string' ? initialQuery.trim() : '';
  // 既存の検索オーバーレイを削除
  const existingOverlay = document.querySelector('.global-search-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // フルビューポートをカバーするワイドオーバーレイを作成
  const searchOverlay = document.createElement('div');
  searchOverlay.className = 'global-search-overlay';
  searchOverlay.innerHTML = `
      <div class="search-overlay-backdrop"></div>
      <div class="search-overlay-content">
        <div class="search-input-container">
          <input type="search" placeholder="すべての章を検索..." class="search-input">
          <button class="search-execute-btn">検索</button>
        </div>
        <div class="search-results-container">
          <div class="search-results-header">
            <h2>検索結果</h2>
            <button class="search-close-btn" aria-label="検索を閉じる">×</button>
          </div>
          <div class="search-results-list">
            <p class="no-results">検索語を入力してください。</p>
          </div>
        </div>
      </div>
    `;

  document.body.appendChild(searchOverlay);

  // メインロントを暗くする
  document.body.classList.add('search-overlay-active');

  // イベントリスナー設定
  const closeBtn = searchOverlay.querySelector('.search-close-btn');
  const backdrop = searchOverlay.querySelector('.search-overlay-backdrop');
  const searchBtn = searchOverlay.querySelector('.search-execute-btn');
  let searchInput = null;

  const closeSearch = () => {
    if (searchInput && searchInput.searchTimeout) {
      clearTimeout(searchInput.searchTimeout);
      searchInput.searchTimeout = null;
    }
    if (SEARCH_RESULTS_VIEW.overlayKeyHandler) {
      document.removeEventListener('keydown', SEARCH_RESULTS_VIEW.overlayKeyHandler, true);
      SEARCH_RESULTS_VIEW.overlayKeyHandler = null;
    }
    if (SEARCH_RESULTS_VIEW.overlayClickHandler) {
      document.removeEventListener('click', SEARCH_RESULTS_VIEW.overlayClickHandler, true);
      SEARCH_RESULTS_VIEW.overlayClickHandler = null;
    }
    searchOverlay.remove();
    document.body.classList.remove('search-overlay-active');
    SEARCH_RESULTS_VIEW.closeOverlay = null;
    resetSearchResultsView();
  };

  closeBtn.addEventListener('click', closeSearch);
  backdrop.addEventListener('click', closeSearch);
  searchBtn.addEventListener('click', renderResults);

  searchOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
    }
  });

  const overlayContent = searchOverlay.querySelector('.search-overlay-content');
  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    }
  };
  const clickHandler = (event) => {
    if (!overlayContent.contains(event.target)) {
      closeSearch();
    }
  };
  document.addEventListener('keydown', keyHandler, true);
  document.addEventListener('click', clickHandler, true);
  SEARCH_RESULTS_VIEW.overlayKeyHandler = keyHandler;
  SEARCH_RESULTS_VIEW.overlayClickHandler = clickHandler;
  SEARCH_RESULTS_VIEW.closeOverlay = closeSearch;

  // 検索入力フィールドのイベントリスナー
  searchInput = searchOverlay.querySelector('input[type="search"]');
  if (searchInput) {
    searchInput.value = startQuery;
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query.length >= 2) {
        // 遅延検索実行
        clearTimeout(searchInput.searchTimeout);
        searchInput.searchTimeout = setTimeout(() => {
          renderResults();
        }, 300);
      } else if (query.length === 0) {
        // 空のクエリの場合は結果をクリア
        const resultsContainer = document.querySelector('.search-results-list');
        if (resultsContainer) {
          resultsContainer.innerHTML = '<p class="no-results">検索語を入力してください。</p>';
        }
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        renderResults();
      }
    });

    // 初期クエリの結果を表示
    searchInput.focus();
    if (startQuery.length) {
      const end = startQuery.length;
      searchInput.setSelectionRange(end, end);
    }
    renderResults();
  }

  return {
    overlay: searchOverlay,
    input: searchInput,
    close: closeSearch
  };

}

// 検索結果を表示する関数
async function renderResults() {
  const resultsContainer = document.querySelector('.search-results-list');
  if (!resultsContainer) return;

  // 検索入力値を取得
  const searchInput = document.querySelector('.search-overlay-content input[type="search"]');
  const query = searchInput ? searchInput.value.trim() : '';

  if (!query || query.length < 2) {
    resultsContainer.innerHTML = '<p class="no-results">検索語を2文字以上入力してください。</p>';
    resetSearchResultsView();
    return;
  }

  resultsContainer.innerHTML = '<div class="search-loading">検索中...</div>';

  try {
    const results = await searchAcrossPages(query);
    displaySearchResults(results, query);
  } catch (error) {
    console.error('Search error:', error);
    resultsContainer.innerHTML = '<p class="no-results">検索中にエラーが発生しました。</p>';
  }
}

// ページをまたいだ検索を実行
async function searchAcrossPages(query) {
  // Ensure index is loaded
  if (!window.searchIndexLoaded) {
      await setupSearchIndex();
  }

  const results = [];
  // Use loaded JSON index
  const searchIndex = window.searchIndex || { pages: [] };

  // If index is empty (e.g. file protocol failure), fallback to current page
  if (!searchIndex.pages || searchIndex.pages.length === 0) {
    console.warn('[Search] No index available, searching current page only.');
    const currentPageContent = getDocumentContent('main');
    const pageResults = searchInContent(currentPageContent, query, {
        url: window.location.pathname,
        title: document.title || '現在のページ',
        chapter: '現在のページ'
    });
    results.push(...pageResults);
    return results;
  }

  // Optimized Search: Scan JSON content instead of fetching HTML
  for (const page of searchIndex.pages) {
    try {
      const content = page.content;
      if (!content) continue;

      const pageResults = searchInContent(content, query, page);
      results.push(...pageResults);
    } catch (error) {
      console.warn(`Error searching page ${page.url}:`, error);
      continue;
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ドキュメントからコンテンツを取得
function getDocumentContent(selector) {
  const element = document.querySelector(selector);
  if (!element) return '';

  const clone = element.cloneNode(true);
  const scriptsAndStyles = clone.querySelectorAll('script, style, nav, .header-ui, .toc-overlay, .search-overlay');
  scriptsAndStyles.forEach(el => el.remove());

  return clone.textContent || clone.innerText || '';
}

// パースされたドキュメントからコンテンツを取得
function getDocumentContentFromDoc(doc, selector) {
  const element = doc.querySelector(selector);
  if (!element) return '';

  const clone = element.cloneNode(true);
  const scriptsAndStyles = clone.querySelectorAll('script, style, nav, .header-ui, .toc-overlay, .search-overlay');
  scriptsAndStyles.forEach(el => el.remove());

  return clone.textContent || clone.innerText || '';
}

const MAX_SNIPPETS_PER_PAGE = 20;
const MAX_MATCHES_SCAN = 400;

// コンテンツ内を検索
function searchInContent(content, query, page) {
  const results = [];
  if (!content || !query) return results;

  const sanitized = (content || '').replace(/\s+/g, ' ');
  if (!sanitized) return results;

  const scanRegex = new RegExp(escapeRegExp(query), 'gi');
  const indices = [];
  let match;
  let safety = 0;
  while ((match = scanRegex.exec(sanitized)) !== null) {
    indices.push(match.index);
    safety += 1;
    if (safety >= MAX_MATCHES_SCAN) break;
  }

  const totalMatches = indices.length;
  if (!totalMatches) return results;

  const limit = Math.min(totalMatches, MAX_SNIPPETS_PER_PAGE);
  const highlightRegex = new RegExp(escapeRegExp(query), 'gi');

  for (let i = 0; i < limit; i += 1) {
    const position = indices[i];
    const start = Math.max(0, position - 80);
    const end = Math.min(sanitized.length, position + query.length + 80);
    let snippet = sanitized.slice(start, end);
    snippet = snippet.replace(highlightRegex, '<mark>$&</mark>');

    if (start > 0) {
      snippet = '…' + snippet;
    }
    if (end < sanitized.length) {
      snippet = snippet + '…';
    }

    const remaining = (totalMatches > limit && i === limit - 1)
      ? totalMatches - limit
      : 0;
    if (remaining > 0) {
      snippet += `<span class="search-result-more">他${remaining}件の一致</span>`;
    }

    results.push({
      page,
      score: totalMatches,
      context: snippet,
      matchCount: totalMatches,
      matchIndex: i,
      totalMatches,
      remainingMatches: remaining
    });
  }

  return results;
}

// 正規表現エスケープ
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text) {
  return (text || '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case '\'': return '&#39;';
      default: return char;
    }
  });
}

// 検索結果を表示
function displaySearchResults(results, query) {
  const container = document.querySelector('.search-results-list');
  if (!container) return;

  if (!results.length) {
    container.innerHTML = `
        <div class="search-no-results">
          <p>「${escapeHtml(query)}」に一致する結果が見つかりませんでした</p>
          <ul>
            <li>検索語の綴りを確認してください</li>
            <li>別のキーワードで試してください</li>
            <li>部分一致でも検索できます</li>
          </ul>
        </div>
      `;
    resetSearchResultsView();
    return;
  }

  resetSearchResultsView();
  clearSearchHighlights();
  SEARCH_RESULTS_VIEW.results = results;
  SEARCH_RESULTS_VIEW.query = query;
  SEARCH_RESULTS_VIEW.totalCount = results.length + results.reduce((sum, r) => sum + (r.remainingMatches || 0), 0);

  container.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'search-results-summary';
  container.appendChild(summary);
  SEARCH_RESULTS_VIEW.summaryEl = summary;

  const list = document.createElement('div');
  list.className = 'search-results-items';
  container.appendChild(list);
  SEARCH_RESULTS_VIEW.listEl = list;

  const loadMoreWrapper = document.createElement('div');
  loadMoreWrapper.className = 'search-load-more-wrapper';
  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.type = 'button';
  loadMoreBtn.className = 'search-load-more-btn';
  loadMoreBtn.textContent = 'さらに表示';
  loadMoreWrapper.appendChild(loadMoreBtn);
  container.appendChild(loadMoreWrapper);
  SEARCH_RESULTS_VIEW.loadMoreWrapper = loadMoreWrapper;
  SEARCH_RESULTS_VIEW.loadMoreBtn = loadMoreBtn;
  loadMoreBtn.addEventListener('click', () => renderSearchResultsChunk());

  renderSearchResultsChunk(true);
}

function renderSearchResultsChunk(reset = false) {
  const state = SEARCH_RESULTS_VIEW;
  if (!state.listEl) return;

  if (reset) {
    state.listEl.innerHTML = '';
    state.rendered = 0;
    state.lastChapter = '';
    state.lastPage = '';
  }

  const total = state.results.length;
  if (state.rendered >= total) {
    updateSearchResultsSummary();
    if (state.loadMoreWrapper) {
      state.loadMoreWrapper.style.display = 'none';
    }
    return;
  }

  const limit = Math.min(total, state.rendered + state.chunkSize);
  for (let i = state.rendered; i < limit; i += 1) {
    const result = state.results[i];
    const chapter = result.page?.chapter || '';
    const pageUrl = result.page?.url || '';

    if (chapter && (chapter !== state.lastChapter || pageUrl !== state.lastPage)) {
      const chapterSection = document.createElement('div');
      chapterSection.className = 'search-chapter-section';
      const heading = document.createElement('h4');
      heading.className = 'search-chapter-title';
      heading.textContent = chapter;
      chapterSection.appendChild(heading);
      state.listEl.appendChild(chapterSection);
      state.lastChapter = chapter;
      state.lastPage = pageUrl;
    }

    const item = document.createElement('div');
    item.className = 'search-result-item';

    const title = document.createElement('div');
    title.className = 'search-result-title';

    const link = document.createElement('a');
    link.href = result.page?.url || '#';
    link.className = 'search-result-link';
    link.textContent = result.page?.title || 'ページ';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      handleOverlayResultSelection(result, link);
    });

    const count = document.createElement('span');
    count.className = 'search-match-count';
    count.textContent = `${result.totalMatches || result.matchCount || 1}件`;

    const order = document.createElement('span');
    order.className = 'search-snippet-order';
    order.textContent = `${(result.matchIndex || 0) + 1}/${result.totalMatches || result.matchCount || 1}`;

    title.appendChild(link);
    title.appendChild(order);
    title.appendChild(count);
    item.appendChild(title);

    const context = document.createElement('div');
    context.className = 'search-result-context';
    context.innerHTML = result.context;
    item.appendChild(context);

    state.listEl.appendChild(item);
  }

  state.rendered = limit;
  updateSearchResultsSummary();

  if (state.loadMoreWrapper) {
    state.loadMoreWrapper.style.display = state.rendered >= total ? 'none' : '';
  }
}

function updateSearchResultsSummary() {
  const state = SEARCH_RESULTS_VIEW;
  if (!state.summaryEl) return;
  const hiddenCount = state.results.reduce((sum, item) => sum + (item.remainingMatches || 0), 0);
  const totalMatches = state.results.length + hiddenCount;
  const shownMatches = Math.min(state.rendered, state.results.length);
  const escapedQuery = escapeHtml(state.query);
  state.summaryEl.innerHTML = `
      <p><strong>${totalMatches}</strong>件の結果（「${escapedQuery}」）</p>
      <p class="search-results-muted">${shownMatches}件を表示中${hiddenCount > 0 ? `（他${hiddenCount}件）` : ''}</p>
    `;
}

function resetSearchResultsView() {
  SEARCH_RESULTS_VIEW.results = [];
  SEARCH_RESULTS_VIEW.query = '';
  SEARCH_RESULTS_VIEW.rendered = 0;
  SEARCH_RESULTS_VIEW.totalCount = 0;
  SEARCH_RESULTS_VIEW.summaryEl = null;
  SEARCH_RESULTS_VIEW.listEl = null;
  SEARCH_RESULTS_VIEW.loadMoreWrapper = null;
  SEARCH_RESULTS_VIEW.loadMoreBtn = null;
  SEARCH_RESULTS_VIEW.lastChapter = '';
  SEARCH_RESULTS_VIEW.lastPage = '';
}

function removeFootnoteRefsFromToc(container) {
  if (!container) return;

  const supNodes = container.querySelectorAll('sup');
  supNodes.forEach((sup) => {
    if (!sup || !sup.parentNode) return;
    const hasFootnoteRef = sup.classList.contains('footnote-ref') ||
      sup.querySelector('.footnote-ref, [role="doc-noteref"]');
    if (hasFootnoteRef) {
      sup.remove();
    }
  });

  const strayRefs = container.querySelectorAll('a.footnote-ref, a[role="doc-noteref"]');
  strayRefs.forEach((ref) => {
    if (!ref) return;
    const sup = ref.closest('sup');
    if (sup && sup.parentNode) {
      sup.remove();
    } else if (ref.parentNode) {
      ref.remove();
    }
  });
}

function setupTocFootnoteCleanup() {
  tocFootnoteObservers.forEach((observer) => observer.disconnect());
  tocFootnoteObservers.length = 0;

  const candidates = [
    document.getElementById('TOC'),
    document.querySelector('.toc-page-content'),
    document.querySelector('.toc-all-content'),
    document.querySelector('.toc-site-content'),
    document.getElementById('quarto-sidebar')
  ].filter(Boolean);

  if (!candidates.length) return;

  candidates.forEach((container) => {
    removeFootnoteRefsFromToc(container);
    const observer = new MutationObserver(() => removeFootnoteRefsFromToc(container));
    observer.observe(container, { childList: true, subtree: true });
    tocFootnoteObservers.push(observer);
  });
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Esc key
    if (e.key === 'Escape') {
      hideMarkerToolbar();
      const dialogs = document.querySelectorAll('.global-search-dialog');
      dialogs.forEach(dialog => dialog.remove());
    }
  });
}

// Scroll position saving
function setupScrollPosition() {
  const scrollY = sessionStorage.getItem(STORAGE_KEYS.scrollPosition);
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY));
  }

  window.addEventListener('beforeunload', () => {
    sessionStorage.setItem(STORAGE_KEYS.scrollPosition, window.scrollY);
  });
}

// Utility functions
function toggleMobileToc() {
  const tocPanel = document.getElementById('quarto-sidebar');
  if (tocPanel) {
    tocPanel.classList.toggle('mobile-open');
  }
}

  function downloadPdf() {
    getResolvedPdfUrl()
      .then((url) => {
        if (url) {
          window.open(url, '_blank', 'noopener');
          return;
        }
        window.print();
      })
      .catch((error) => {
        console.warn('Failed to open PDF, falling back to print:', error);
        window.print();
      });
  }

// Expand all helper: open all collapsible sections in Quarto sidebar clone
function expandAllInMenu(root) {
  try {
    // Show all collapsed sections
    root.querySelectorAll('.collapse').forEach(el => {
      el.classList.add('show');
      el.style.height = 'auto';
    });
    // Ensure toggles are set to expanded
    root.querySelectorAll('[data-bs-toggle="collapse"]').forEach(tg => {
      tg.setAttribute('aria-expanded', 'true');
    });
    // Remove collapse handlers to avoid interference
    root.querySelectorAll('[data-bs-toggle="collapse"]').forEach(tg => {
      tg.removeAttribute('data-bs-toggle');
      tg.removeAttribute('data-bs-target');
    });
  } catch (e) {
    console.warn('Failed to expand all menu levels:', e);
  }
}

}) ();
