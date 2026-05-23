/**
 * 索引アンカーへのスクロールを調整
 */
(function () {
  'use strict';

  const IDX_PREFIX = 'idx-';
  const HIGHLIGHT_DURATION = 2000;

  function getScrollOffset() {
    const docEl = document.documentElement;
    const styles = window.getComputedStyle(docEl);
    const headerVarRaw = parseFloat(styles.getPropertyValue('--header-h'));
    const extraVarRaw = parseFloat(styles.getPropertyValue('--idx-scroll-offset'));
    const headerVar = Number.isFinite(headerVarRaw) ? headerVarRaw : 60;
    const extraVar = Number.isFinite(extraVarRaw) ? extraVarRaw : 20;

    // ヘッダーの高さを動的に取得
    const headerEl = document.querySelector('#quarto-header') || document.querySelector('.headroom');
    const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : headerVar;

    return headerHeight + extraVar;
  }

  function highlightTargetElement(target) {
    if (!target) return;
    const parent = target.closest('p, div, section, li, h1, h2, h3, h4, h5, h6');
    if (!parent) return;

    // ハイライトクラスの追加と削除
    parent.classList.add('highlight-target');
    setTimeout(() => parent.classList.remove('highlight-target'), HIGHLIGHT_DURATION);
  }

  function scrollToAnchor(target, options) {
    if (!target) return false;

    // アンカー自体ではなく、親のブロック要素をターゲットにする（より確実）
    const scrollTarget = target.closest('p, div, section, li, h1, h2, h3, h4, h5, h6') || target;

    const offset = getScrollOffset();
    const rect = scrollTarget.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top;
    const top = Math.max(absoluteTop - offset, 0);
    const instant = options && options.instant;

    // console.log('Scrolling to:', target.id, 'Top:', top, 'Offset:', offset);

    const scrollOptions = {
      top,
      left: 0,
      behavior: instant ? 'auto' : 'smooth'
    };

    try {
      window.scrollTo(scrollOptions);
    } catch (err) {
      window.scrollTo(0, top);
    }

    highlightTargetElement(target);
    return true;
  }

  function focusIndexAnchorFromHash(options) {
    const hash = window.location.hash;
    if (!hash || hash.length <= 1) {
      return;
    }

    let targetId = hash.slice(1);
    try {
      targetId = decodeURIComponent(targetId);
    } catch (err) {
      // no-op
    }

    if (!targetId.startsWith(IDX_PREFIX)) {
      return;
    }

    const target = document.getElementById(targetId);
    if (!target) {
      // console.log('Target not found:', targetId);
      return;
    }

    const delay = options && typeof options.delay === 'number' ? options.delay : 0;

    if (delay > 0) {
      setTimeout(() => {
        scrollToAnchor(target, options);
      }, delay);
    } else {
      scrollToAnchor(target, options);
    }
  }

  // 読み込み完了時（画像なども含む）に実行
  window.addEventListener('load', () => {
    if (window.location.hash) {
      // 少し遅延させて確実にスクロール
      focusIndexAnchorFromHash({ delay: 100, instant: true });
      // 念のためもう一度（レイアウトシフト対策）
      setTimeout(() => {
        focusIndexAnchorFromHash({ delay: 0, instant: true });
      }, 500);
    }
  });

  // ハッシュ変更時
  window.addEventListener('hashchange', () => {
    focusIndexAnchorFromHash({ delay: 50 });
  });

  // DOMContentLoadedでも一応走らせる（早めに移動したい場合のため）
  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash) {
      focusIndexAnchorFromHash({ delay: 0, instant: true });
    }
  });

})();
