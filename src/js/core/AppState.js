/**
 * AppState.js
 * 全体状態管理
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/05-implementation.md
 */

export class AppState {
  constructor() {
    this.state = {
      theme: 'auto',
      fontSize: 'M',
      sidebarLeft: 'expanded',
      sidebarRight: 'expanded',
      drawerOpen: false,
      swipeEnabled: false
    };
    this.listeners = new Set();
    this.storageKey = 'reader-state';
    this.loadState();
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    if (this.state[key] !== value) {
      this.state[key] = value;
      this.notifyListeners(key, value);
      this.saveState();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(key, value) {
    this.listeners.forEach(listener => listener(key, value));
  }

  loadState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // 既存のキーのみマージ
        Object.keys(this.state).forEach(key => {
          if (parsed[key] !== undefined) {
            this.state[key] = parsed[key];
          }
        });
      }
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  }

  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  clearState() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn('Failed to clear state:', e);
    }
  }
}

// デフォルトエクスポート
export default AppState;
