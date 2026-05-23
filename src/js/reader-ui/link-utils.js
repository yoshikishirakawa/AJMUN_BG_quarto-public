export function isModifiedClick(event) {
  return !!(
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button === 1
  );
}

export function isPrimaryClick(event) {
  return event.button === 0 && !isModifiedClick(event);
}

export function getClosestLink(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest('a[href]');
}

export function getLinkHref(link) {
  if (!link) return '';
  return link.getAttribute('href') || '';
}

export function getLinkLabel(link) {
  if (!link) return '';
  var text = (link.textContent || '').replace(/\s+/g, ' ').trim();
  return text || link.getAttribute('aria-label') || link.getAttribute('title') || getLinkHref(link);
}

export function normalizeActionUrl(href) {
  try {
    return new URL(href, window.location.href).href;
  } catch (e) {
    return href || '';
  }
}

export function isHashOnlyHref(href) {
  return typeof href === 'string' && href.startsWith('#');
}

export function isSamePageAnchor(href) {
  if (!href) return false;
  try {
    var url = new URL(href, window.location.href);
    return (
      url.origin === window.location.origin &&
      url.pathname === window.location.pathname &&
      !!url.hash
    );
  } catch (e) {
    return isHashOnlyHref(href);
  }
}

export function isExternalHref(href) {
  if (!href || /^(mailto:|tel:)/i.test(href)) return false;
  try {
    var url = new URL(href, window.location.href);
    return url.origin !== window.location.origin;
  } catch (e) {
    return false;
  }
}

export function isPdfHref(href) {
  return /\.pdf(?:[#?].*)?$/i.test(href || '');
}

export function openInCurrentTab(href) {
  if (!href) return;
  window.location.href = href;
}

export function openInNewTab(href) {
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  var textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }

  return Promise.resolve();
}
