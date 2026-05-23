/**
 * ローカル注釈機能
 * 選択範囲→ハイライト・コメント、保存と復元
 */

(function () { 'use strict'; /* 注釈機能は無効化されました */ })();

// 注釈コントロールの設定
function setupAnnotationControls() {
  const menu = document.querySelector('.header-menu');
  if (!menu) return;

  // 注釈追加ボタン
  const addBtn = document.createElement('button');
  addBtn.id = 'annotate-btn';
  addBtn.className = 'main-menu-button';
  addBtn.innerHTML = '📝 注釈';
  addBtn.title = '選択範囲から注釈を追加';
  addBtn.setAttribute('aria-label', '注釈を追加');

  // イベントリスナー
  addBtn.addEventListener('click', toggleAnnotationMode);

  // メニューに追加
  menu.appendChild(addBtn);

  // 注釈管理パネル（任意）
  createAnnotationPanel();
}

// 注釈モードの切り替え
function toggleAnnotationMode() {
  isAddingAnnotation = !isAddingAnnotation;

  const btn = document.getElementById('annotate-btn');
  if (!btn) return;

  if (isAddingAnnotation) {
    btn.classList.add('active');
    btn.innerHTML = '📝 選択して注釈';
    btn.title = '注釈モードON - テキストを選択してください';

    // 選択イベントリスナーを有効化
    setupSelectionListener();

    // ユーザーに通知
    showNotification('注釈モード：注釈を追加したいテキストを選択してください');
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '📝 注釈';
    btn.title = '選択範囲から注釈を追加';

    // ユーザーに通知
    showNotification('注釈モードを終了しました');
  }
}

// 選択リスナー設定
function setupSelectionListener() {
  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('touchend', handleSelection);
}

// 選択処理
function handleSelection() {
  if (!isAddingAnnotation) {
    removeSelectionListener();
    return;
  }

  const selection = getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }

  const range = selection.getRangeAt(0);
  const selectedText = selection.toString().trim();

  if (selectedText.length === 0 || selectedText.length > 500) {
    showNotification('有効な範囲（500文字以内）を選択してください');
    return;
  }

  // コメント入力
  const comment = prompt('注釈コメントを入力してください：');
  if (comment === null) {
    return; // ユーザーキャンセル
  }

  if (comment.trim().length === 0) {
    showNotification('コメントが必要です');
    return;
  }

  // 注釈を作成
  createAnnotation(range, comment.trim());

  // 選択をクリア
  selection.removeAllRanges();
}

// コンテナ情報の取得（ID付きの親要素とその中でのオフセット）
function getContainerInfo(range) {
  try {
    let container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) {
      container = container.parentNode;
    }

    // IDを持つ最も近い親要素を探す
    const idParent = container.closest('[id]');
    if (!idParent) return null;

    // オフセット計算（コンテナ内のテキスト先頭からの距離）
    const preCaretRange = document.createRange();
    preCaretRange.selectNodeContents(idParent);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preCaretRange.toString().length;

    return {
      id: idParent.id,
      offset: startOffset
    };
  } catch (e) {
    console.error('コンテナ情報取得エラー:', e);
    return null;
  }
}

// 注釈の作成
function createAnnotation(range, comment) {
  try {
    // IDベースの位置情報を取得（DOM変更前）
    const containerInfo = getContainerInfo(range);

    // ハイライト要素作成
    const mark = document.createElement('mark');
    mark.className = 'annotation-highlight';

    // 範囲をマーク要素で囲む
    try {
      range.surroundContents(mark);
    } catch (e) {
      // 複数要素にまたがる場合のフォールバック
      handleCrossNodeSelection(range, mark);
    }

    // 注釈ID生成
    const annotationId = generateAnnotationId();
    mark.setAttribute('data-annotation-id', annotationId);

    // 注釈データ構築
    const annotation = {
      id: annotationId,
      text: range.toString(),
      comment: comment,
      timestamp: Date.now(),
      color: generateRandomColor(),
      xpath: getXPath(mark),
      // IDベースの位置情報（高精度復元用）
      containerId: containerInfo ? containerInfo.id : null,
      containerOffset: containerInfo ? containerInfo.offset : null
    };

    // 保存
    saveAnnotation(annotation);

    // イベントハンドラ追加
    setupAnnotationHandlers(mark, annotation);

    // UI更新
    updateAnnotationPanel();

    // 通知
    showNotification('注釈を追加しました');

    // 注釈モードを終了
    if (isAddingAnnotation) {
      toggleAnnotationMode();
    }
  } catch (error) {
    console.error('注釈作成エラー:', error);
    showNotification('注釈の追加に失敗しました');
  }
}

// 複数要素にまたがる選択の処理
function handleCrossNodeSelection(range, mark) {
  const fragment = range.cloneContents();
  const span = document.createElement('span');
  span.className = 'annotation-highlight';
  span.appendChild(fragment);

  range.deleteContents();
  range.insertNode(span);
}

// 注釈IDの生成
function generateAnnotationId() {
  return ANNOTATION_ID_PREFIX + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// 色の生成
function generateRandomColor() {
  const colors = [
    '#ffeb3b', '#e3f2fd', '#f3e5f5', '#e8f5e8', '#fff3e0',
    '#fce4ec', '#e8eaf6', '#ffccbc', '#c8e6c9', '#dcedc8'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// XPathの生成（復元用）
function getXPath(element) {
  if (!element) return '';

  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }

  const parts = [];
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let index = 0;
    let sibling = element.previousSibling;

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === element.tagName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = element.tagName.toLowerCase();
    const pathIndex = index > 0 ? `[${index + 1}]` : '';
    parts.unshift(`${tagName}${pathIndex}`);

    element = element.parentNode;
  }

  return '/' + parts.join('/');
}

// 注釈の保存
function saveAnnotation(annotation) {
  const pageKey = getPageKey();
  const pageAnnotations = currentAnnotations.get(pageKey) || [];

  pageAnnotations.push(annotation);
  currentAnnotations.set(pageKey, pageAnnotations);
  currentPageAnnotations = pageAnnotations;

  // LocalStorageに保存
  const storageData = JSON.stringify(Array.from(currentAnnotations.entries()));
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${pageKey}`, storageData);
}

// 注釈の読み込み
function loadAnnotations() {
  const pageKey = getPageKey();
  const storageData = localStorage.getItem(`${STORAGE_KEY_PREFIX}${pageKey}`);

  if (storageData) {
    try {
      const entries = JSON.parse(storageData);
      currentAnnotations = new Map(entries);
      currentPageAnnotations = currentAnnotations.get(pageKey) || [];
    } catch (error) {
      console.error('注釈の読み込みエラー:', error);
      currentAnnotations = new Map();
      currentPageAnnotations = [];
    }
  }
}

// ページキーの取得
function getPageKey() {
  return location.pathname.replace(/.*\/|\.html/g, '') || 'index';
}

// 既存注釈のレンダリング
function renderExistingAnnotations() {
  currentPageAnnotations.forEach(annotation => {
    try {
      const element = document.querySelector('[data-annotation-id="' + annotation.id + '"]');
      if (!element) {
        // 要素が見つからない場合の復元
        restoreAnnotation(annotation);
      } else {
        setupAnnotationHandlers(element, annotation);
      }
    } catch (error) {
      console.error('注釈レンダリングエラー:', error);
    }
  });
}

// 注釈の復元
function restoreAnnotation(annotation) {
  try {
    // 1. IDベースの復元（高精度）
    if (annotation.containerId) {
      const container = document.getElementById(annotation.containerId);
      if (container) {
        // コンテナ内を検索
        if (restoreByTextSearch(annotation, container)) {
          return;
        }
      }
    }

    // 2. フォールバック：全文検索
    const element = document.querySelector('.main ') || document.body;
    if (!element) return;

    restoreByTextSearch(annotation, element);

  } catch (error) {
    console.error('注釈復元エラー:', error);
  }
}

// テキスト検索による復元
function restoreByTextSearch(annotation, rootElement) {
  const root = rootElement || document.querySelector('.main') || document.body;
  if (!root) return false;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT
  );

  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.includes(annotation.text)) {
      // マッチするテキストをハイライト
      const mark = document.createElement('mark');
      mark.className = 'annotation-highlight';
      mark.setAttribute('data-annotation-id', annotation.id);

      const range = document.createRange();
      range.selectNodeContents(node);
      const text = node.textContent;
      const startIndex = text.indexOf(annotation.text);

      if (startIndex >= 0) {
        range.setStart(node, startIndex);
        range.setEnd(node, startIndex + annotation.text.length);

        mark.appendChild(range.cloneContents());
        range.deleteContents();
        range.insertNode(mark);

        setupAnnotationHandlers(mark, annotation);
        return true; // 復元成功
      }
    }
  }
  return false; // 復元失敗
}

// イベントハンドラ設定
function setupAnnotationHandlers(element, annotation) {
  // ホバーでコメント表示
  element.addEventListener('mouseenter', (e) => {
    showAnnotationTooltip(e.target, annotation);
  });

  element.addEventListener('mouseleave', () => {
    hideAnnotationTooltip();
  });

  // クリックで詳細表示
  element.addEventListener('click', (e) => {
    e.preventDefault();
    showAnnotationDialog(annotation);
  });
}

// ツールチップ表示
function showAnnotationTooltip(element, annotation) {
  const existingTooltip = document.querySelector('.annotation-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'annotation-tooltip';
  tooltip.innerHTML = `
      <div class="tooltip-header">
        <span>${annotation.id}</span>
        <button class="tip-close">×</button>
      </div>
      <div class="tooltip-content">${annotation.comment}</div>
    `;

  // スタイル設定
  tooltip.style.position = 'absolute';
  tooltip.style.background = annotation.color;
  tooltip.style.border = '1px solid #ccc';
  tooltip.style.borderRadius = '4px';
  tooltip.style.padding = '8px';
  tooltip.style.maxWidth = '200px';
  tooltip.style.fontSize = '0.9em';
  tooltip.style.zIndex = '1000';
  tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';

  document.body.appendChild(tooltip);

  // 位置調整
  const rect = element.getBoundingClientRect();
  tooltip.style.left = rect.left + 'px';
  tooltip.style.top = (rect.bottom + 5) + 'px';

  // イベント
  tooltip.querySelector('.tip-close').addEventListener('click', () => {
    tooltip.remove();
  });
}

// ツールチップ非表示
function hideAnnotationTooltip() {
  const tooltip = document.querySelector('.annotation-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
}

// 注釈ダイアログ
function showAnnotationDialog(annotation) {
  // 簡単なモーダル実装
  const existingDialog = document.querySelector('.annotation-dialog');
  if (existingDialog) {
    existingDialog.remove();
  }

  const dialog = document.createElement('div');
  dialog.className = 'annotation-dialog';
  dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>注釈詳細</h3>
          <button class="dialog-close">×</button>
        </div>
        <div class="dialog-body">
          <div class="annotation-text">
            <strong>対象テキスト:</strong> ${annotation.text}
          </div>
          <div class="annotation-comment">
            <strong>コメント:</strong> ${annotation.comment}
          </div>
          <div class="annotation-meta">
            <small>${new Date(annotation.timestamp).toLocaleString()}</small>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="edit-btn">編集</button>
          <button class="delete-btn">削除</button>
          <button class="close-btn">閉じる</button>
        </div>
      </div>
    `;

  // スタイル設定
  Object.assign(dialog.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '1010'
  });

  const overlay = dialog.querySelector('.dialog-overlay');
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    background: 'rgba(0,0,0,0.5)'
  });

  const content = dialog.querySelector('.dialog-content');
  Object.assign(content.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto'
  });

  document.body.appendChild(dialog);

  // イベントハンドラ
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.remove());
  dialog.querySelector('.close-btn').addEventListener('click', () => dialog.remove());
  dialog.querySelector('.overlay').addEventListener('click', () => dialog.remove());

  dialog.querySelector('.delete-btn').addEventListener('click', () => {
    if (confirm('この注釈を削除しますか？')) {
      deleteAnnotation(annotation);
      dialog.remove();
    }
  });

  dialog.querySelector('.edit-btn').addEventListener('click', () => {
    const newComment = prompt('コメントを編集:', annotation.comment);
    if (newComment !== null && newComment.trim()) {
      editAnnotation(annotation, newComment.trim());
      dialog.remove();
    }
  });
}

// 注釈削除
function deleteAnnotation(annotation) {
  // DOMから削除
  document.querySelector(`[data-annotation-id="${annotation.id}"]`)?.remove();

  // データから削除
  const pageKey = getPageKey();
  const pageAnnotations = currentAnnotations.get(pageKey) || [];
  const filteredAnnotations = pageAnnotations.filter(a => a.id !== annotation.id);

  currentAnnotations.set(pageKey, filteredAnnotations);
  currentPageAnnotations = filteredAnnotations;

  // 保存
  const storageData = JSON.stringify(Array.from(currentAnnotations.entries()));
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${pageKey}`, storageData);

  // UI更新
  updateAnnotationPanel();
  showNotification('注釈を削除しました');
}

// 注釈編集
function editAnnotation(annotation, newComment) {
  annotation.comment = newComment;
  annotation.timestamp = Date.now();

  // データ更新
  const pageKey = getPageKey();
  const pageAnnotations = currentAnnotations.get(pageKey) || [];
  const index = pageAnnotations.findIndex(a => a.id === annotation.id);

  if (index >= 0) {
    pageAnnotations[index] = annotation;
    currentAnnotations.set(pageKey, pageAnnotations);
    currentPageAnnotations = pageAnnotations;

    // 保存
    const storageData = JSON.stringify(Array.from(currentAnnotations.entries()));
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${pageKey}`, storageData);

    showNotification('注釈を更新しました');
  }
}

// 注釈パネルの作成
function createAnnotationPanel() {
  // 簡易的なパネル実装
}

// 注釈パネルの更新
function updateAnnotationPanel() {
  // パネルの更新を実装
}

// キーボードショートカット
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+A: 注釈モード
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      toggleAnnotationMode();
    }
  });
}

// 選択リスナーの削除
function removeSelectionListener() {
  document.removeEventListener('mouseup', handleSelection);
  document.removeEventListener('touchend', handleSelection);
}

// 通知表示
function showNotification(message) {
  // 簡易な通知実装
  const notification = document.createElement('div');
  notification.className = 'annotation-notification';
  notification.textContent = message;
  notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 1001;
      font-size: 14px;
      max-width: 300px;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '1';
  }, 10);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// スタイル追加
function addAnnotationStyles() {
  const style = document.createElement('style');
  style.textContent = `
      .annotation-highlight {
        background-color: #ffeb3b;
        padding: 2px 4px;
        border-radius: 2px;
        cursor: pointer;
        transition: background-color 0.2s ease;
      }
      
      .annotation-highlight:hover {
        background-color: #ffd54f;
      }
      
      .annotation-highlight.active {
        background-color: #ff9800;
        color: white;
      }
      
      .annotation-tooltip {
        font-family: inherit;
      }
      
      .annotation-notification {
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      
      .dialog-actions {
        display: flex;
        gap: 8px;
        margin-top: 20px;
      }
      
      .dialog-actions button {
        padding: 8px 16px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .dialog-actions button.delete-btn {
        background: #f44336;
        color: white;
        border-color: #f44336;
      }
      
      .dialog-actions button:hover {
        background: #f5f5f5;
      }
      
      .dialog-actions button.delete-btn:hover {
        background: #d32f2f;
      }
    `;
  document.head.appendChild(style);
}

// 注釈エクスポート機能
function setupExportControls() {
  const controls = document.querySelector('.js-header__controls');
  if (!controls) return;

  // エクスポートボタン
  const exportBtn = document.createElement('button');
  exportBtn.className = 'js-export-annotations-btn';
  exportBtn.textContent = '注釈出力';
  exportBtn.title = '注釈をエクスポート';

  // インポートボタン
  const importBtn = document.createElement('input');
  importBtn.type = 'file';
  importBtn.accept = '.json';
  importBtn.className = 'js-import-annotations-btn';
  importBtn.style.display = 'none';

  controls.insertBefore(exportBtn, controls.firstChild);
  controls.insertBefore(importBtn, exportBtn.nextSibling);

  // エクスポート処理
  exportBtn.addEventListener('click', () => {
    exportAnnotations();
  });

  // インポート処理
  importBtn.addEventListener('change', (e) => {
    importAnnotations(e.target.files[0]);
  });
}

function exportAnnotations() {
  const_annotations = Array.from(currentAnnotations.values());

  if (_annotations.length === 0) {
    showNotification('出力できる注釈がありません', 'info');
    return;
  }

  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    currentPage: window.location.pathname,
    count: _annotations.length,
    annotations: _annotations.map(ann => ({
      id: ann.id,
      text: ann.text,
      selectedText: ann.selectedText,
      startOffset: ann.startOffset,
      endOffset: ann.endOffset,
      elementXPath: ann.elementXPath,
      pageNumber: ann.pageNumber,
      sectionTitle: ann.sectionTitle,
      position: ann.position,
      created: ann.created,
      modified: ann.modified,
      tags: ann.tags || []
    }))
  };

  // JSON文字列に変換
  const jsonString = JSON.stringify(exportData, null, 2);

  // Blobとしてダウンロード
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;

  // ファイル名生成
  const timestamp = new Date().toISOString().slice(0, 10);
  const pageName = window.location.pathname.split('/').pop().replace(/\.(html|qmd)$/, '');
  const fileName = `annotations_${pageName}_${timestamp}.json`;

  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // URL解放
  URL.revokeObjectURL(url);

  showNotification(`注釈をエクスポートしました: ${fileName}`, 'success');
}

function importAnnotations(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!data.annotations || !Array.isArray(data.annotations)) {
        throw new Error('無効な注釈データ形式です');
      }

      let importCount = 0;
      let updateCount = 0;
      let errorCount = 0;

      // 各注釈をインポート
      data.annotations.forEach(ann => {
        try {
          // 既存チェック
          if (currentAnnotations.has(ann.id)) {
            updateCount++;
            // 既存注釈を更新（上書き）
            currentAnnotations.set(ann.id, ann);
          } else {
            // 新規注釈
            currentAnnotations.set(ann.id, ann);
            renderAnnotation(ann);
            importCount++;
          }
        } catch (error) {
          console.error(`注釈インポートエラー (ID: ${ann.id}):`, error);
          errorCount++;
        }
      });

      // 保存
      saveAnnotations();

      // インポート結果通知
      let message = `注釈インポート完了: 新規${importCount}件、更新${updateCount}件`;
      if (errorCount > 0) {
        message += `、エラー${errorCount}件`;
      }

      showNotification(message, errorCount > 0 ? 'warning' : 'success');

    } catch (error) {
      console.error('注釈インポートエラー:', error);
      showNotification('注釈のインポートに失敗しました。ファイル形式を確認してください。', 'error');
    }
  };

  reader.onerror = () => {
    showNotification('ファイルの読み込みに失敗しました。', 'error');
  };

  reader.readAsText(file, 'utf-8');
}

// 注釈をHTML形式でエクスポート
function exportAnnotationsAsHTML() {
  const annotations = Array.from(currentAnnotations.values());

  if (annotations.length === 0) {
    showNotification('出力できる注釈がありません', 'info');
    return;
  }

  // 章ごとにグループ化
  const chapterGroups = {};
  annotations.forEach(ann => {
    const chapter = ann.sectionTitle || '未分類';
    if (!chapterGroups[chapter]) {
      chapterGroups[chapter] = [];
    }
    chapterGroups[chapter].push(ann);
  });

  // HTML生成
  let html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>注釈一覧 - ${document.title}</title>
    <style>
        body { font-family: 'Noto Sans JP', sans-serif; margin: 20px; line-height: 1.6; }
        .annotation-item { border: 1px solid #ddd; padding: 12px; margin: 8px 0; border-radius: 4px; }
        .annotation-text { background: yellow; padding: 2px 4px; }
        .annotation-note { margin-top: 8px; color: #555; border-left: 3px solid #1976d2; padding-left: 12px; }
        .annotation-meta { font-size: 12px; color: #888; margin-top: 4px; }
        .chapter-section { margin: 24px 0 12px; }
        .chapter-title { font-size: 18px; font-weight: bold; color: #1976d2; border-bottom: 2px solid #1976d2; padding-bottom: 4px; }
    </style>
</head>
<body>
    <h1>注釈一覧</h1>
    <p>出力日時: ${new Date().toLocaleString('ja-JP')}</p>
    <p>ページ: ${document.title}</p>
    <p>注釈数: ${annotations.length}件</p>
`;

  // 各章の注釈を出力
  for (const [chapter, chapterAnn] of Object.entries(chapterGroups)) {
    html += `    <div class="chapter-section">\n`;
    html += `        <div class="chapter-title">${chapter}</div>\n`;

    chapterAnn.forEach(ann => {
      const date = new Date(ann.created).toLocaleDateString('ja-JP');
      html += `        <div class="annotation-item">\n`;
      html += `            <div class="annotation-text">${ann.selectedText}</div>\n`;
      html += `            <div class="annotation-note">${ann.text}</div>\n`;
      html += `            <div class="annotation-meta">注釈日: ${date} ${ann.tags ? 'タグ: ' + ann.tags.join(', ') : ''}</div>\n`;
      html += `        </div>\n`;
    });

    html += `    </div>\n`;
  }

  html += `</body>\n</html>`;

  // Blobとしてダウンロード
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `annotations_${new Date().toISOString().slice(0, 10)}.html`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  showNotification('注釈をHTML形式でエクスポートしました', 'success');
}

// 通知機能
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `annotation-notification ${type}`;
  notification.textContent = message;

  // スタイル
  notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 4px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: opacity 0.3s ease;
    `;

  // 色分け
  const colors = {
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
    info: '#2196f3'
  };
  notification.style.background = colors[type] || colors.info;

  document.body.appendChild(notification);

  // 自動閉じ
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// 実行
document.addEventListener('DOMContentLoaded', () => {
  init();
  addAnnotationStyles();
  setupExportControls();
});
  
}) ();
