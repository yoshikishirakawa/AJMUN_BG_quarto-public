import { IMPORT_LIMITS } from './constants.js';
import {
  normalizeAnnotationImport,
  parseJsonObject,
  sanitizeCommentRecord,
  sanitizeMarkerRecord,
  sanitizeRecordDB
} from './sanitize.js';
import { loadNavData } from './nav-data.js';
import { clearViewerStorage } from './storage.js';

export function initSettings(options) {
  var fontSize = options.fontSize;
  var markers = options.markers;
  var comments = options.comments;

  document.querySelectorAll('.font-size-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fontSize.setSize(btn.dataset.size);
    });
  });

  var swipeCheckbox = document.getElementById('swipe-enabled');
  if (swipeCheckbox) {
    swipeCheckbox.addEventListener('change', function (event) {
      if (window.readerApp.swipeNav) {
        window.readerApp.swipeNav.setEnabled(event.target.checked);
      }
    });
  }

  bindExport('export-markers', function () { markers.export(false); });
  bindExport('export-comments', function () { comments.export(false); });
  bindImport('import-markers-btn', 'import-markers-input', markers, comments);
  bindImport('import-comments-btn', 'import-comments-input', markers, comments);

  var resetBtn = document.getElementById('reset-all-settings');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      if (confirm('このBGビューアの設定、マーカー、コメントをリセットしますか？')) {
        clearViewerStorage();
        location.reload();
      }
    });
  }

  document.addEventListener('click', function (event) {
    if (event.target.classList.contains('settings-menu') ||
        event.target.classList.contains('search-overlay')) {
      event.target.classList.remove('open');
    }
  });
}

function bindExport(id, handler) {
  var button = document.getElementById(id);
  if (button) button.addEventListener('click', handler);
}

function bindImport(buttonId, inputId, markers, comments) {
  var button = document.getElementById(buttonId);
  var input = document.getElementById(inputId);
  if (!button || !input) return;
  button.addEventListener('click', function () {
    input.click();
  });
  input.addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    importAnnotationsFromFile(file, markers, comments).finally(function () {
      input.value = '';
    });
  });
}

export function importAnnotationsFromFile(file, markers, comments) {
  if (file.size > IMPORT_LIMITS.maxBytes) {
    alert('JSONファイルが大きすぎます。1MB以下にしてください。');
    return Promise.resolve(false);
  }

  return Promise.all([file.text(), loadNavData().catch(function () { return null; })]).then(function (values) {
    var raw = values[0];
    var navData = values[1];
    var knownPages = buildKnownPageSet(navData);
    var json = parseJsonObject(raw);
    var normalized = normalizeAnnotationImport(json);
    var markerResult = sanitizeRecordDB(normalized.markers, sanitizeMarkerRecord);
    var commentResult = sanitizeRecordDB(normalized.comments, sanitizeCommentRecord);
    markerResult = filterKnownPages(markerResult, knownPages);
    commentResult = filterKnownPages(commentResult, knownPages);

    if (!markerResult.accepted && !commentResult.accepted) {
      throw new Error('No valid annotation records found');
    }

    if (markerResult.accepted) markers.mergeDB(markerResult.data);
    if (commentResult.accepted) comments.mergeDB(commentResult.data);

    alert(
      'インポートしました: マーカー ' + markerResult.accepted +
      '件、コメント ' + commentResult.accepted +
      '件（除外 ' + (markerResult.rejected + commentResult.rejected) + '件）'
    );
    return true;
  }).catch(function () {
    alert('コメント/マーカーJSONを読み込めませんでした。形式を確認してください。');
    return false;
  });
}

function buildKnownPageSet(navData) {
  if (!navData || !Array.isArray(navData.pages)) return null;
  var pages = new Set(['index.html']);
  navData.pages.forEach(function (page) {
    if (page && typeof page.output === 'string') pages.add(page.output);
  });
  return pages;
}

function filterKnownPages(result, knownPages) {
  if (!knownPages) return result;
  var filtered = {};
  var rejected = result.rejected;
  Object.keys(result.data).forEach(function (pageKey) {
    if (knownPages.has(pageKey)) {
      filtered[pageKey] = result.data[pageKey];
    } else {
      rejected += result.data[pageKey].length;
    }
  });
  var accepted = Object.keys(filtered).reduce(function (sum, pageKey) {
    return sum + filtered[pageKey].length;
  }, 0);
  return { data: filtered, accepted: accepted, rejected: rejected };
}
