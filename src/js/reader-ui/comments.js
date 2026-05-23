import { currentPageKey } from './page-key.js';
import { loadCommentsDB, saveCommentsDB, mergeRecordDB } from './storage.js';

export class CommentsController {
  constructor() {
    this.db = loadCommentsDB();
    this.list = document.getElementById('comments-list');
    this.render();
  }

  getDB() {
    return this.db;
  }

  setDB(db) {
    this.db = db || {};
    saveCommentsDB(this.db);
    this.render();
  }

  mergeDB(incoming) {
    this.setDB(mergeRecordDB(this.db, incoming));
  }

  render() {
    if (!this.list) return;
    this.list.replaceChildren();
    var page = currentPageKey();
    var comments = this.db[page] || [];
    if (!comments.length) {
      var empty = document.createElement('p');
      empty.className = 'u-text-muted';
      empty.textContent = 'このページにはコメントがありません。';
      this.list.appendChild(empty);
      return;
    }

    var ul = document.createElement('ul');
    ul.className = 'comments-list-items';
    comments.slice().sort(function (a, b) { return (b.t || 0) - (a.t || 0); }).forEach(function (comment) {
      var li = document.createElement('li');
      li.className = 'comment-list-item';

      var body = document.createElement('p');
      body.textContent = comment.body || 'コメント内容がありません。';
      li.appendChild(body);

      if (comment.text) {
        var target = document.createElement('small');
        target.textContent = '対象: ' + comment.text.slice(0, 120);
        li.appendChild(target);
      }
      ul.appendChild(li);
    });
    this.list.appendChild(ul);
  }

  export(pageOnly) {
    var page = currentPageKey();
    var data = pageOnly ? { [page]: this.db[page] || [] } : this.db;
    downloadJson('comments', { version: '1.0', type: 'comments', exportedAt: new Date().toISOString(), data: data });
  }
}

export function downloadJson(base, payload) {
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = base + '_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
