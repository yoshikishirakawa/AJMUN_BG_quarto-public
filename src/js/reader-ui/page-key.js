export function normalizePath(path) {
  var cleaned = String(path || '').replace(/\\/g, '/').split(/[?#]/)[0];
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch (e) {
    // Keep the original path if it was not a valid encoded URI.
  }
  return cleaned.replace(/\/+/g, '/');
}

export function canonicalPageKey(input) {
  var raw = input == null ? window.location.pathname : String(input);
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      raw = new URL(raw, window.location.href).pathname;
    }
  } catch (e) {
    // Fall through to string normalization.
  }

  var path = normalizePath(raw);
  var outIndex = path.indexOf('/out/');
  if (outIndex >= 0) path = path.slice(outIndex + 5);

  var contentIndex = path.indexOf('/content/');
  if (contentIndex >= 0) path = path.slice(contentIndex + 1);

  path = path.replace(/^\/+/, '');
  if (!path || path === '.') return 'index.html';
  if (path.endsWith('/')) path += 'index.html';

  var parts = path.split('/').filter(Boolean);
  if (!parts.length) return 'index.html';

  return parts.join('/');
}

export function currentPageKey() {
  return canonicalPageKey(window.location.pathname || 'index.html');
}
