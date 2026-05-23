/**
 * 脚注のレスポンシブ制御
 * 横長画面：右パネル表示
 * モバイル：段落末ブロック挿入（デフォルト折りたたみ）
 */

(function() {
  'use strict';
  
  // 定数
  const MOBILE_BREAKPOINT = 767;
  const DEBOUNCE_DELAY = 300;
  
  // 状態管理
  let isMobile = false;
  let resizeTimer = null;
  let footnoteMap = new Map();
  
  // 初期化
  function init() {
    setupFootnoteMap();
    handleResize();
    setupResizeListener();
    setupIntersectionObserver();
    setupRightPanelContent();
  }
  
  // 脚注マップの構築
  function setupFootnoteMap() {
    const footnotes = {};
    const footnoteRefs = document.querySelectorAll('[role="doc-noteref"]');
    const footnoteContents = document.querySelectorAll('[role="doc-endnote"], .footnotes li');
    
    // 脚注参照のマップ
    footnoteRefs.forEach(ref => {
      const href = ref.getAttribute('href') || ref.querySelector('a')?.getAttribute('href');
      if (href && href.startsWith('#')) {
        const id = href.slice(1);
        footnotes[id] = footnotes[id] || { refs: [], content: null };
        footnotes[id].refs.push(ref);
      }
    });
    
    // 脚注コンテンツのマップ
    footnoteContents.forEach(content => {
      const id = content.id || content.querySelector('a')?.getAttribute('id') || 
                content.getAttribute('id');
      
      if (id && footnotes[id]) {
        footnotes[id].content = content;
      }
    });
    
    footnoteMap = new Map(Object.entries(footnotes));
  }
  
  // リサイズ処理
  function handleResize() {
    const wasMobile = isMobile;
    isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    
    if (wasMobile !== isMobile) {
      toggleFootnoteDisplay();
    }
  }
  
  // リサイズリスナー
  function setupResizeListener() {
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, DEBOUNCE_DELAY);
    });
  }
  
  // 脚注表示の切り替え
  function toggleFootnoteDisplay() {
    if (isMobile) {
      enableMobileFootnotes();
      disableDesktopFootnotes();
    } else {
      enableDesktopFootnotes();
      disableMobileFootnotes();
    }
  }
  
  // モバイル脚注の有効化
  function enableMobileFootnotes() {
    footnoteMap.forEach((footnote, id) => {
      if (!footnote.refs || !footnote.content) return;
      
      footnote.refs.forEach(ref => {
        const paragraph = findHostParagraph(ref);
        if (paragraph && !hasFootnoteInline(paragraph, id)) {
          insertInlineFootnote(paragraph, footnote, id);
        }
      });
    });
  }
  
  // モバイル脚注の無効化
  function disableMobileFootnotes() {
    document.querySelectorAll('.footnote-inline').forEach(inline => {
      inline.remove();
    });
    
    // 脚注リンクを再有効化
    document.querySelectorAll('.footnote-ref[style*="display: none"]').forEach(ref => {
      ref.style.display = '';
    });
  }
  
  // デスクトップ脚注の有効化
  function enableDesktopFootnotes() {
    // 右パネルの表示を有効化
    const rightPanel = document.querySelector('.right-panel');
    const tocRight = document.querySelector('.toc-right-on');
    
    if (rightPanel && tocRight) {
      rightPanel.style.display = '';
    }
    
    // 脚注参照の有効化
    document.querySelectorAll('.footnote-ref').forEach(ref => {
      ref.style.display = '';
    });
  }
  
  // デスクトップ脚注の無効化
  function disableDesktopFootnotes() {
    // 右パネルを非表示
    const rightPanel = document.querySelector('.right-panel');
    if (rightPanel) {
      rightPanel.style.display = 'none';
    }
  }
  
  // ホスト段落の検索
  function findHostParagraph(element) {
    let parent = element.parentNode;
    
    while (parent) {
      if (parent.tagName === 'P' || parent.tagName === 'LI' || 
          parent.tagName === 'DIV' && parent.classList.contains('footnote-definition')) {
        return parent;
      }
      parent = parent.parentNode;
    }
    
    return null;
  }
  
  // インライン脚注の有無チェック
  function hasFootnoteInline(paragraph, footnoteId) {
    const existingInline = paragraph.querySelector(`.footnote-inline[data-footnote="${footnoteId}"]`);
    return existingInline !== null;
  }
  
  // インライン脚注の挿入
  function insertInlineFootnote(paragraph, footnote, id) {
    if (!footnote.content) return;
    
    // インライン要素の作成
    const inline = document.createElement('div');
    inline.className = 'footnote-inline';
    inline.setAttribute('data-footnote', id);
    
    // 脚注内容の複製
    const content = footnote.content.cloneNode(true);
    
    // 戻りリンクの調整
    const backlink = content.querySelector('.footnote-backref, a[rev="footnote"]');
    if (backlink) {
      backlink.addEventListener('click', (e) => {
        e.preventDefault();
        const originalRef = footnote.refs[0];
        if (originalRef) {
          originalRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
    
    inline.appendChild(content);
    
    // 引用番号の追加
    const refNumbers = footnote.refs.map(ref => {
      const text = ref.textContent.replace(/[^0-9]/g, '');
      return text || ref.textContent;
    }).join(', ');
    
    const label = document.createElement('span');
    label.className = 'footnote-label';
    label.textContent = `脚注${refNumbers}:`;
    inline.insertBefore(label, inline.firstChild);
    
    // 段落への挿入
    paragraph.insertAdjacentElement('afterend', inline);
    
    // 脚注参照を非表示（重複を防ぐため）
    footnote.refs.forEach(ref => {
      ref.style.display = 'none';
    });
  }
  
  // Intersection Observer設定
  function setupIntersectionObserver() {
    // 脚注の自動スクロール機能
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          highlightInToc(entry.target.id);
        }
      });
    }, {
      root: isMobile ? null : document.querySelector('.right-panel'),
      rootMargin: '0px -50px'
    });
    
    // 脚注要素の監視
    document.querySelectorAll('[role="doc-endnote"], .footnotes li').forEach(el => {
      observer.observe(el);
    });
  }
  
  // ToCハイライト
  function highlightInToc(footnoteId) {
    // ToCのハイライト処理（実装の詳細はプロジェクト次第）
    document.querySelectorAll('.toc-item').forEach(item => {
      item.classList.remove('active');
    });
  }
  
  // 脚注クリック時の処理
  function setupFootnoteClickHandlers() {
    document.querySelectorAll('.footnote-ref').forEach(ref => {
      ref.addEventListener('click', (e) => {
        e.preventDefault();
        const href = ref.getAttribute('href') || ref.querySelector('a')?.getAttribute('href');
        
        if (href && href.startsWith('#')) {
          const footnoteId = href.slice(1);
          
          if (isMobile) {
            scrollToInlineFootnote(footnoteId);
          } else {
            scrollToFootnotePanel(footnoteId);
          }
        }
      });
    });
  }
  
  // モバイル：インライン脚注へスクロール
  function scrollToInlineFootnote(footnoteId) {
    const inline = document.querySelector(`.footnote-inline[data-footnote="${footnoteId}"]`);
    if (inline) {
      inline.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // ハイライト効果
      inline.classList.add('footnote-highlight');
      setTimeout(() => {
        inline.classList.remove('footnote-highlight');
      }, 2000);
    }
  }
  
  // デスクトップ：脚注パネルへスクロール
  function scrollToFootnotePanel(footnoteId) {
    const rightPanel = document.querySelector('.right-panel');
    const footnote = document.getElementById(footnoteId);
    
    if (rightPanel && footnote) {
      // 右パネルの表示確認
      if (rightPanel.style.display === 'none') {
        rightPanel.style.display = '';
      }
      
      // スクロール
      const panelScrollTop = footnote.offsetTop - rightPanel.offsetTop - 50;
      rightPanel.scrollTo({
        top: panelScrollTop,
        behavior: 'smooth'
      });
      
      // ハイライト
      footnote.classList.add('footnote-highlight');
      setTimeout(() => {
        footnote.classList.remove('footnote-highlight');
      }, 2000);
    }
  }
  
  // 脚注ハイライト用CSS動的追加
  function addFootnoteStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .footnote-highlight {
        background-color: rgba(255, 107, 53, 0.2) !important;
        transition: background-color 1s ease;
      }
      
      .footnote-label {
        font-weight: 600;
        color: var(--accent);
        margin-right: 4px;
      }
      
      @keyframes footnote-pulse {
        0% { background-color: rgba(255, 107, 53, 0.1); }
        50% { background-color: rgba(255, 107, 53, 0.3); }
        100% { background-color: rgba(255, 107, 53, 0.1); }
      }
      
      .footnote-scroll-target {
        animation: footnote-pulse 2s ease;
      }
    `;
    document.head.appendChild(style);
  }
  
  // 右パネル脚注コンテンツ設定
  function setupRightPanelContent() {
    const rightPanel = document.querySelector('.right-sidebar .footnotes-content');
    if (!rightPanel) return;
    
    // 脚注HTMLを取得して右パネルに配置
    const footnotesSection = document.querySelector('.footnotes');
    if (footnotesSection) {
      const footnotesHtml = footnotesSection.innerHTML;
      rightPanel.innerHTML = footnotesHtml;
      
      // 脚注の戻りリンクを調整
      const backLinks = rightPanel.querySelectorAll('.footnote-back-ref');
      backLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const refId = link.getAttribute('href').substring(1);
          const refElement = document.getElementById(refId);
          if (refElement) {
            refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            refElement.classList.add('footnote-scroll-target');
            setTimeout(() => {
              refElement.classList.remove('footnote-scroll-target');
            }, 2000);
          }
        });
      });
    }
  }

  // モバイル脚注折りたたみ機能
  function setupMobileFootnoteToggle() {
    const footnoteBlocks = document.querySelectorAll('.footnote-inline-block');
    
    footnoteBlocks.forEach(block => {
      const header = document.createElement('div');
      header.className = 'footnote-inline-header';
      header.innerHTML = `
        <span class="footnote-toggle-text">脚注 ${block.dataset.footnoteNumber}</span>
        <button class="footnote-toggle-btn">▼</button>
      `;
      
      block.insertBefore(header, block.firstChild);
      
      const content = block.querySelector('.footnote-inline-content');
      if (content) {
        content.style.display = 'none'; // デフォルトで折りたたみ
        
        header.addEventListener('click', () => {
          const isOpen = content.style.display === 'block';
          content.style.display = isOpen ? 'none' : 'block';
          header.querySelector('.footnote-toggle-btn').textContent = isOpen ? '▼' : '▲';
          header.querySelector('.footnote-toggle-text').classList.toggle('expanded', !isOpen);
        });
      }
    });
  }

  // モバイル脚注コンテンツ作成（改良版）
  function createMobileFootnoteBlock(footnote, index) {
    const container = document.createElement('div');
    container.className = 'footnote-inline-block';
    container.dataset.footnoteNumber = index + 1;
    
    const content = document.createElement('div');
    content.className = 'footnote-inline-content';
    content.innerHTML = footnote.innerHTML;
    
    container.appendChild(content);
    return container;
  }

// 実行
  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupFootnoteClickHandlers();
    addFootnoteStyles();
    setupMobileFootnoteToggle();
  });
  
})();
