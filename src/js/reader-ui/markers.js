import { IMPORT_LIMITS, MARKER_COLORS } from './constants.js';
import { currentPageKey } from './page-key.js';
import { downloadJson } from './comments.js';
import { loadMarkersDB, mergeRecordDB, saveMarkersDB } from './storage.js';

export class MarkerController {
  constructor() {
    this.db = loadMarkersDB();
    this.toolbar = document.getElementById('marker-toolbar');
    this.pendingRange = null;
    this.bindEvents();
    this.restore();
  }

  getDB() {
    return this.db;
  }

  setDB(db) {
    this.db = db || {};
    saveMarkersDB(this.db);
    this.restore();
  }

  mergeDB(incoming) {
    this.setDB(mergeRecordDB(this.db, incoming));
  }

  bindEvents() {
    document.addEventListener('mouseup', this.handleSelection.bind(this));
    document.addEventListener('touchend', this.handleSelection.bind(this));
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') this.hideToolbar();
    }.bind(this));

    if (!this.toolbar) return;
    this.toolbar.querySelectorAll('.marker-color-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        this.apply(button.dataset.color);
      }.bind(this));
    }.bind(this));
    var clear = this.toolbar.querySelector('.marker-clear-btn');
    if (clear) {
      clear.addEventListener('click', function () {
        this.clearCurrentPage();
      }.bind(this));
    }
  }

  handleSelection(event) {
    if (event.target && event.target.closest('.marker-toolbar, .settings-menu, .search-overlay, .reader-header, a, button, input, textarea, select')) {
      return;
    }
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      this.hideToolbar();
      this.pendingRange = null;
      return;
    }
    this.pendingRange = selection.getRangeAt(0).cloneRange();
    this.showToolbar(this.pendingRange.getBoundingClientRect(), event);
  }

  showToolbar(rect, event) {
    if (!this.toolbar) return;
    var x = rect && (rect.left || rect.right) ? rect.left + (rect.width / 2) : event.clientX;
    var y = rect && (rect.top || rect.bottom) ? rect.top : event.clientY;
    this.toolbar.style.left = Math.max(8, Math.round(x - 80)) + 'px';
    this.toolbar.style.top = Math.max(8, Math.round(y - 50)) + 'px';
    this.toolbar.classList.add('show');
  }

  hideToolbar() {
    if (this.toolbar) this.toolbar.classList.remove('show');
  }

  apply(color) {
    if (!MARKER_COLORS.includes(color)) return;
    var selection = window.getSelection();
    var range = selection && selection.rangeCount ? selection.getRangeAt(0) : this.pendingRange;
    if (!range || range.collapsed) return;

    var segments = getTextSegments(range);
    if (!segments.length) {
      this.hideToolbar();
      return;
    }

    var id = 'marker-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    var text = range.toString().slice(0, IMPORT_LIMITS.maxTextLength);
    var ranges = [];
    segments.forEach(function (segment) {
      var wrapper = document.createElement('span');
      wrapper.className = 'text-marker ' + color + '-marker';
      wrapper.dataset.markerId = id;
      wrapper.title = 'ダブルクリックで削除';
      wrapper.addEventListener('dblclick', function () {
        this.remove(id);
      }.bind(this));
      ranges.push({ s: getPath(segment.node), so: segment.start, e: getPath(segment.node), eo: segment.end });
      wrapBySplitText(segment.node, segment.start, segment.end, wrapper);
    }.bind(this));

    var page = currentPageKey();
    if (!this.db[page]) this.db[page] = [];
    this.db[page].push({ id: id, color: color, text: text, ranges: ranges, t: Date.now() });
    saveMarkersDB(this.db);
    if (selection) selection.removeAllRanges();
    this.pendingRange = null;
    this.hideToolbar();
  }

  restore() {
    unwrapMarkers();
    var page = currentPageKey();
    (this.db[page] || []).forEach(function (marker) {
      (marker.ranges || []).forEach(function (range) {
        var node = getNodeByPath(range.s);
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        var wrapper = document.createElement('span');
        wrapper.className = 'text-marker ' + marker.color + '-marker';
        wrapper.dataset.markerId = marker.id;
        wrapper.title = 'ダブルクリックで削除';
        wrapper.addEventListener('dblclick', function () {
          this.remove(marker.id);
        }.bind(this));
        wrapBySplitText(node, range.so, range.eo, wrapper);
      }.bind(this));
    }.bind(this));
  }

  remove(id) {
    unwrapMarkers(id);
    var page = currentPageKey();
    this.db[page] = (this.db[page] || []).filter(function (marker) { return marker.id !== id; });
    if (!this.db[page].length) delete this.db[page];
    saveMarkersDB(this.db);
  }

  clearCurrentPage() {
    unwrapMarkers();
    delete this.db[currentPageKey()];
    saveMarkersDB(this.db);
  }

  export(pageOnly) {
    var page = currentPageKey();
    var data = pageOnly ? { [page]: this.db[page] || [] } : this.db;
    downloadJson('markers', { version: '1.0', type: 'markers', exportedAt: new Date().toISOString(), data: data });
  }
}

function unwrapMarkers(id) {
  document.querySelectorAll('.text-marker[data-marker-id]').forEach(function (marker) {
    if (id && marker.dataset.markerId !== id) return;
    var parent = marker.parentNode;
    if (!parent) return;
    while (marker.firstChild) parent.insertBefore(marker.firstChild, marker);
    parent.removeChild(marker);
    parent.normalize();
  });
}

function getTextSegments(range) {
  var segments = [];
  if (range.commonAncestorContainer && range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
    var node = range.commonAncestorContainer;
    var start = node === range.startContainer ? range.startOffset : 0;
    var end = node === range.endContainer ? range.endOffset : (node.nodeValue || '').length;
    if (start !== end) segments.push({ node: node, start: start, end: end });
    return segments;
  }

  var walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      try {
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      } catch (e) {
        return NodeFilter.FILTER_REJECT;
      }
    }
  });
  var node;
  while ((node = walker.nextNode())) {
    var startOffset = node === range.startContainer ? range.startOffset : 0;
    var endOffset = node === range.endContainer ? range.endOffset : (node.nodeValue || '').length;
    if (startOffset !== endOffset) segments.push({ node: node, start: startOffset, end: endOffset });
  }
  return segments;
}

function nodeIndex(node) {
  var index = 0;
  while (node && node.previousSibling) {
    node = node.previousSibling;
    index += 1;
  }
  return index;
}

function getPath(node) {
  var path = [];
  var current = node;
  while (current && current !== document.body) {
    path.push(nodeIndex(current));
    current = current.parentNode;
  }
  return path.reverse();
}

function getNodeByPath(path) {
  var node = document.body;
  if (!Array.isArray(path)) return null;
  for (var i = 0; i < path.length; i += 1) {
    if (!node || !node.childNodes[path[i]]) return null;
    node = node.childNodes[path[i]];
  }
  return node;
}

function wrapBySplitText(textNode, start, end, wrapper) {
  try {
    var boundedStart = Math.max(0, Math.min(start, textNode.nodeValue.length));
    var boundedEnd = Math.max(boundedStart, Math.min(end, textNode.nodeValue.length));
    var mid = textNode;
    if (boundedStart > 0) mid = textNode.splitText(boundedStart);
    var length = boundedEnd - boundedStart;
    if (length < mid.nodeValue.length) mid.splitText(length);
    var parent = mid.parentNode;
    parent.insertBefore(wrapper, mid);
    wrapper.appendChild(mid);
  } catch (e) {
    // Invalid imported ranges are ignored during restore.
  }
}
