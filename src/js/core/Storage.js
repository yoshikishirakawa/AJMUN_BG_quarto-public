/**
 * Storage.js
 * localStorageラッパー
 * 永続化処理の一元管理
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/05-implementation.md
 */

export class Storage {
  constructor(prefix = 'reader-') {
    this.prefix = prefix;
  }

  get(key) {
    try {
      const value = localStorage.getItem(this.prefix + key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.warn(`Failed to get ${key}:`, e);
      return null;
    }
  }

  set(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to set ${key}:`, e);
    }
  }

  remove(key) {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (e) {
      console.warn(`Failed to remove ${key}:`, e);
    }
  }

  clear() {
    // 全てのreader-*キーを削除
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.prefix))
      .forEach(key => localStorage.removeItem(key));
  }

  has(key) {
    return localStorage.getItem(this.prefix + key) !== null;
  }

  getKeys() {
    return Object.keys(localStorage)
      .filter(key => key.startsWith(this.prefix))
      .map(key => key.slice(this.prefix.length));
  }
}

// SessionStorage用のクラス
export class SessionStorage {
  constructor(prefix = 'reader-') {
    this.prefix = prefix;
  }

  get(key) {
    try {
      const value = sessionStorage.getItem(this.prefix + key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.warn(`Failed to get ${key} from sessionStorage:`, e);
      return null;
    }
  }

  set(key, value) {
    try {
      sessionStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to set ${key} in sessionStorage:`, e);
    }
  }

  remove(key) {
    try {
      sessionStorage.removeItem(this.prefix + key);
    } catch (e) {
      console.warn(`Failed to remove ${key} from sessionStorage:`, e);
    }
  }

  has(key) {
    return sessionStorage.getItem(this.prefix + key) !== null;
  }
}

export default Storage;
