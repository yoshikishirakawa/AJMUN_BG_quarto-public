/**
 * Sidebar.js
 * サイドバーの制御（開閉・リサイズ）
 *
 * 作成日: 2026-01-24
 * 関連: docs/ui-redesign/02-layout-structure.md
 */

export class Sidebar {
  constructor(appState) {
    this.appState = appState;
    this.layout = document.querySelector('.reader-layout');
    this.init();
  }

  init() {
    if (!this.layout) return;

    this.bindToggleEvents();
    this.bindResizeEvents();
    this.updateTriggers();
  }

  bindToggleEvents() {
    // 左パネルトグル
    const leftToggle = this.layout.querySelector('.sidebar--left .sidebar-toggle');
    if (leftToggle) {
      leftToggle.addEventListener('click', () => this.toggleSidebar('left'));
    }

    // 右パネルトグル
    const rightToggle = this.layout.querySelector('.sidebar--right .sidebar-toggle');
    if (rightToggle) {
      rightToggle.addEventListener('click', () => this.toggleSidebar('right'));
    }

    // トリガー（折りたたみ時の端に表示されるボタン）
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('sidebar-trigger--left')) {
        this.toggleSidebar('left');
      }
      if (e.target.classList.contains('sidebar-trigger--right')) {
        this.toggleSidebar('right');
      }
    });
  }

  bindResizeEvents() {
    const leftHandle = this.layout.querySelector('.sidebar--left .sidebar-resize-handle');
    const rightHandle = this.layout.querySelector('.sidebar--right .sidebar-resize-handle');

    if (leftHandle) {
      this.setupResize(leftHandle, 'left');
    }

    if (rightHandle) {
      this.setupResize(rightHandle, 'right');
    }
  }

  setupResize(handle, side) {
    let startX = 0;
    let startWidth = 0;
    let isDragging = false;

    handle.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      const sidebar = this.layout.querySelector(`.sidebar--${side}`);
      startWidth = sidebar.offsetWidth;
      isDragging = true;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const diff = side === 'left' ? e.clientX - startX : startX - e.clientX;
      let newWidth = startWidth + diff;

      // 最小・最大制限
      const minWidth = 200;
      const maxWidth = 400;
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      this.setSidebarWidth(side, newWidth);
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
      }
    });
  }

  toggleSidebar(side) {
    const currentState = this.appState.get(`sidebar${side.charAt(0).toUpperCase() + side.slice(1)}`);
    const newState = currentState === 'expanded' ? 'collapsed' : 'expanded';

    this.appState.set(`sidebar${side.charAt(0).toUpperCase() + side.slice(1)}`, newState);
    this.applyState();
  }

  applyState() {
    const leftState = this.appState.get('sidebarLeft');
    const rightState = this.appState.get('sidebarRight');

    // data属性を設定
    this.layout.dataset.sidebarLeft = leftState;
    this.layout.dataset.sidebarRight = rightState;

    this.updateTriggers();
  }

  setSidebarWidth(side, width) {
    const cssVar = side === 'left' ? '--sidebar-left-width' : '--sidebar-right-width';
    document.documentElement.style.setProperty(cssVar, `${width}px`);
  }

  updateTriggers() {
    const leftCollapsed = this.appState.get('sidebarLeft') === 'collapsed';
    const rightCollapsed = this.appState.get('sidebarRight') === 'collapsed';

    let leftTrigger = document.querySelector('.sidebar-trigger--left');
    let rightTrigger = document.querySelector('.sidebar-trigger--right');

    if (leftCollapsed) {
      if (!leftTrigger) {
        leftTrigger = document.createElement('div');
        leftTrigger.className = 'sidebar-trigger sidebar-trigger--left show';
        document.body.appendChild(leftTrigger);
      }
      leftTrigger.classList.add('show');
      leftTrigger.classList.remove('hide');
    } else {
      if (leftTrigger) {
        leftTrigger.classList.remove('show');
        leftTrigger.classList.add('hide');
      }
    }

    if (rightCollapsed) {
      if (!rightTrigger) {
        rightTrigger = document.createElement('div');
        rightTrigger.className = 'sidebar-trigger sidebar-trigger--right show';
        document.body.appendChild(rightTrigger);
      }
      rightTrigger.classList.add('show');
      rightTrigger.classList.remove('hide');
    } else {
      if (rightTrigger) {
        rightTrigger.classList.remove('show');
        rightTrigger.classList.add('hide');
      }
    }
  }

  collapseLeft() {
    this.appState.set('sidebarLeft', 'collapsed');
    this.applyState();
  }

  collapseRight() {
    this.appState.set('sidebarRight', 'collapsed');
    this.applyState();
  }

  expandLeft() {
    this.appState.set('sidebarLeft', 'expanded');
    this.applyState();
  }

  expandRight() {
    this.appState.set('sidebarRight', 'expanded');
    this.applyState();
  }
}

export default Sidebar;
