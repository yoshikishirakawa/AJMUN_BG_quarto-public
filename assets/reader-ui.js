(() => {
  // src/js/reader-ui/constants.js
  var STORAGE_KEYS = {
    appState: "reader-state",
    swipeEnabled: "reader-swipe-enabled",
    scrollPosition: "reader-scroll-position",
    markers: "reader-markers",
    comments: "reader-comments",
    readingList: "reader-reading-list"
  };
  var LEGACY_STORAGE_KEYS = {
    markers: ["quarto-markers"],
    comments: ["quarto-comments"],
    scrollPosition: ["quarto-scroll-position"]
  };
  var VIEWER_LOCAL_STORAGE_KEYS = [
    STORAGE_KEYS.appState,
    STORAGE_KEYS.swipeEnabled,
    STORAGE_KEYS.markers,
    STORAGE_KEYS.comments,
    STORAGE_KEYS.readingList,
    "quarto-toc-location",
    "quarto-theme",
    "quarto-font-size",
    "quarto-right-tab",
    "footnotes-sort",
    "comments-sort",
    "txtSize",
    "theme",
    "tocLocation",
    "scrollPos",
    "gdocPreviewMaxToasts",
    "gdocPreviewState_v2"
  ];
  var VIEWER_SESSION_STORAGE_KEYS = [
    STORAGE_KEYS.scrollPosition,
    "quarto-reading-state",
    "quarto-scroll-position"
  ];
  var IMPORT_LIMITS = {
    maxBytes: 1024 * 1024,
    maxPages: 200,
    maxRecords: 3e3,
    maxRecordsPerPage: 500,
    maxIdLength: 80,
    maxTextLength: 500,
    maxBodyLength: 5e3,
    maxRangesPerRecord: 20,
    maxPathDepth: 80,
    maxNodeIndex: 1e4,
    maxOffset: 1e5
  };
  var MARKER_COLORS = ["yellow", "green", "blue", "pink"];

  // src/js/reader-ui/page-key.js
  function normalizePath(path) {
    var cleaned = String(path || "").replace(/\\/g, "/").split(/[?#]/)[0];
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch (e) {
    }
    return cleaned.replace(/\/+/g, "/");
  }
  function canonicalPageKey(input) {
    var raw = input == null ? window.location.pathname : String(input);
    try {
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        raw = new URL(raw, window.location.href).pathname;
      }
    } catch (e) {
    }
    var path = normalizePath(raw);
    var outIndex = path.indexOf("/out/");
    if (outIndex >= 0) path = path.slice(outIndex + 5);
    var contentIndex = path.indexOf("/content/");
    if (contentIndex >= 0) path = path.slice(contentIndex + 1);
    path = path.replace(/^\/+/, "");
    if (!path || path === ".") return "index.html";
    if (path.endsWith("/")) path += "index.html";
    var parts = path.split("/").filter(Boolean);
    if (!parts.length) return "index.html";
    return parts.join("/");
  }
  function currentPageKey() {
    return canonicalPageKey(window.location.pathname || "index.html");
  }

  // src/js/reader-ui/sanitize.js
  var ID_RE = /^(?:marker|comment)-[A-Za-z0-9._:-]+$/;
  function parseJsonObject(raw) {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON root must be an object");
    }
    return parsed;
  }
  function safeString(value, maxLength) {
    if (typeof value !== "string") return null;
    if (value.length > maxLength) return null;
    return value;
  }
  function validId(value) {
    return typeof value === "string" && value.length > 0 && value.length <= IMPORT_LIMITS.maxIdLength && ID_RE.test(value);
  }
  function validPath(path) {
    return Array.isArray(path) && path.length <= IMPORT_LIMITS.maxPathDepth && path.every(function(part) {
      return Number.isInteger(part) && part >= 0 && part <= IMPORT_LIMITS.maxNodeIndex;
    });
  }
  function validOffset(value) {
    return Number.isInteger(value) && value >= 0 && value <= IMPORT_LIMITS.maxOffset;
  }
  function sanitizeRange(range) {
    if (!range || typeof range !== "object" || Array.isArray(range)) return null;
    if (!validPath(range.s) || !validPath(range.e)) return null;
    if (!validOffset(range.so) || !validOffset(range.eo)) return null;
    if (JSON.stringify(range.s) === JSON.stringify(range.e) && range.so === range.eo) return null;
    return {
      s: range.s.slice(),
      so: range.so,
      e: range.e.slice(),
      eo: range.eo
    };
  }
  function sanitizeRanges(value) {
    if (!Array.isArray(value) || value.length > IMPORT_LIMITS.maxRangesPerRecord) return null;
    var ranges = value.map(sanitizeRange).filter(Boolean);
    return ranges.length ? ranges : null;
  }
  function sanitizeMarkerRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    if (!validId(record.id)) return null;
    if (!MARKER_COLORS.includes(record.color)) return null;
    var ranges = sanitizeRanges(record.ranges || (record.range ? [record.range] : []));
    if (!ranges) return null;
    var text = safeString(record.text || "", IMPORT_LIMITS.maxTextLength);
    if (text === null) return null;
    return {
      id: record.id,
      color: record.color,
      text,
      ranges,
      t: Number.isFinite(record.t) ? Math.max(0, Math.floor(record.t)) : Date.now()
    };
  }
  function sanitizeCommentRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    if (!validId(record.id)) return null;
    var text = safeString(record.text || "", IMPORT_LIMITS.maxTextLength);
    var body = safeString(record.body || "", IMPORT_LIMITS.maxBodyLength);
    if (text === null || body === null) return null;
    var ranges = sanitizeRanges(record.ranges || []);
    return {
      id: record.id,
      text,
      body,
      ranges: ranges || [],
      t: Number.isFinite(record.t) ? Math.max(0, Math.floor(record.t)) : Date.now()
    };
  }
  function sanitizeRecordDB(input, recordSanitizer) {
    var source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    var output = {};
    var rejected = 0;
    var accepted = 0;
    var pageCount = 0;
    Object.keys(source).slice(0, IMPORT_LIMITS.maxPages + 1).forEach(function(rawPageKey) {
      if (pageCount >= IMPORT_LIMITS.maxPages) {
        rejected += Array.isArray(source[rawPageKey]) ? source[rawPageKey].length : 1;
        return;
      }
      var list = source[rawPageKey];
      if (!Array.isArray(list)) {
        rejected += 1;
        return;
      }
      var pageKey = canonicalPageKey(rawPageKey);
      var pageRecords = [];
      var seen = /* @__PURE__ */ new Set();
      list.slice(0, IMPORT_LIMITS.maxRecordsPerPage + 1).forEach(function(record) {
        if (pageRecords.length >= IMPORT_LIMITS.maxRecordsPerPage) {
          rejected += 1;
          return;
        }
        if (accepted >= IMPORT_LIMITS.maxRecords) {
          rejected += 1;
          return;
        }
        var clean = recordSanitizer(record);
        if (!clean || seen.has(clean.id)) {
          rejected += 1;
          return;
        }
        seen.add(clean.id);
        pageRecords.push(clean);
        accepted += 1;
      });
      if (pageRecords.length) {
        output[pageKey] = pageRecords;
        pageCount += 1;
      }
    });
    return { data: output, accepted, rejected };
  }
  function normalizeAnnotationImport(json) {
    var _a, _b;
    return {
      markers: json.markers || ((_a = json.data) == null ? void 0 : _a.markers) || (json.type === "markers" ? json.data : null) || {},
      comments: json.comments || ((_b = json.data) == null ? void 0 : _b.comments) || (json.type === "comments" ? json.data : null) || {}
    };
  }

  // src/js/reader-ui/storage.js
  var Storage = class {
    constructor(prefix) {
      this.prefix = prefix || "reader-";
    }
    get(key) {
      try {
        var value = localStorage.getItem(this.prefix + key);
        return value ? JSON.parse(value) : null;
      } catch (e) {
        return null;
      }
    }
    set(key, value) {
      try {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
      } catch (e) {
      }
    }
    remove(key) {
      try {
        localStorage.removeItem(this.prefix + key);
      } catch (e) {
      }
    }
    clear() {
      clearViewerStorage();
    }
  };
  function readJsonStorage(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function migrateArrayToCurrentPage(value) {
    if (Array.isArray(value)) {
      return { [currentPageKey()]: value };
    }
    return value;
  }
  function canonicalizeDB(db, sanitizer) {
    var clean = sanitizeRecordDB(migrateArrayToCurrentPage(db), sanitizer).data;
    var merged = {};
    Object.keys(clean).forEach(function(key) {
      var pageKey = canonicalPageKey(key);
      if (!merged[pageKey]) merged[pageKey] = [];
      var seen = new Set(merged[pageKey].map(function(record) {
        return record.id;
      }));
      clean[key].forEach(function(record) {
        if (!seen.has(record.id)) {
          merged[pageKey].push(record);
          seen.add(record.id);
        }
      });
    });
    return merged;
  }
  function loadMarkersDB() {
    var db = readJsonStorage(STORAGE_KEYS.markers, {});
    LEGACY_STORAGE_KEYS.markers.forEach(function(legacyKey) {
      var legacy = readJsonStorage(legacyKey, null);
      if (legacy) {
        db = Object.assign({}, migrateArrayToCurrentPage(legacy), migrateArrayToCurrentPage(db));
      }
    });
    db = canonicalizeDB(db, sanitizeMarkerRecord);
    writeJsonStorage(STORAGE_KEYS.markers, db);
    return db;
  }
  function saveMarkersDB(db) {
    return writeJsonStorage(STORAGE_KEYS.markers, canonicalizeDB(db, sanitizeMarkerRecord));
  }
  function loadCommentsDB() {
    var db = readJsonStorage(STORAGE_KEYS.comments, {});
    LEGACY_STORAGE_KEYS.comments.forEach(function(legacyKey) {
      var legacy = readJsonStorage(legacyKey, null);
      if (legacy) {
        db = Object.assign({}, migrateArrayToCurrentPage(legacy), migrateArrayToCurrentPage(db));
      }
    });
    db = canonicalizeDB(db, sanitizeCommentRecord);
    writeJsonStorage(STORAGE_KEYS.comments, db);
    return db;
  }
  function saveCommentsDB(db) {
    return writeJsonStorage(STORAGE_KEYS.comments, canonicalizeDB(db, sanitizeCommentRecord));
  }
  function loadReadingList() {
    var list = readJsonStorage(STORAGE_KEYS.readingList, []);
    return Array.isArray(list) ? list : [];
  }
  function saveReadingList(list) {
    return writeJsonStorage(STORAGE_KEYS.readingList, Array.isArray(list) ? list : []);
  }
  function clearViewerStorage() {
    VIEWER_LOCAL_STORAGE_KEYS.forEach(function(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
      }
    });
    VIEWER_SESSION_STORAGE_KEYS.forEach(function(key) {
      try {
        sessionStorage.removeItem(key);
      } catch (e) {
      }
    });
  }
  function mergeRecordDB(existing, incoming) {
    var merged = Object.assign({}, existing || {});
    Object.keys(incoming || {}).forEach(function(pageKey) {
      if (!Array.isArray(incoming[pageKey])) return;
      if (!merged[pageKey]) merged[pageKey] = [];
      var seen = new Set(merged[pageKey].map(function(record) {
        return record.id;
      }));
      incoming[pageKey].forEach(function(record) {
        if (!seen.has(record.id)) {
          merged[pageKey].push(record);
          seen.add(record.id);
        }
      });
    });
    return merged;
  }

  // src/js/reader-ui/comments.js
  var CommentsController = class {
    constructor() {
      this.db = loadCommentsDB();
      this.list = document.getElementById("comments-list");
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
        var empty = document.createElement("p");
        empty.className = "u-text-muted";
        empty.textContent = "\u3053\u306E\u30DA\u30FC\u30B8\u306B\u306F\u30B3\u30E1\u30F3\u30C8\u304C\u3042\u308A\u307E\u305B\u3093\u3002";
        this.list.appendChild(empty);
        return;
      }
      var ul = document.createElement("ul");
      ul.className = "comments-list-items";
      comments.slice().sort(function(a, b) {
        return (b.t || 0) - (a.t || 0);
      }).forEach(function(comment) {
        var li = document.createElement("li");
        li.className = "comment-list-item";
        var body = document.createElement("p");
        body.textContent = comment.body || "\u30B3\u30E1\u30F3\u30C8\u5185\u5BB9\u304C\u3042\u308A\u307E\u305B\u3093\u3002";
        li.appendChild(body);
        if (comment.text) {
          var target = document.createElement("small");
          target.textContent = "\u5BFE\u8C61: " + comment.text.slice(0, 120);
          li.appendChild(target);
        }
        ul.appendChild(li);
      });
      this.list.appendChild(ul);
    }
    export(pageOnly) {
      var page = currentPageKey();
      var data = pageOnly ? { [page]: this.db[page] || [] } : this.db;
      downloadJson("comments", { version: "1.0", type: "comments", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), data });
    }
  };
  function downloadJson(base, payload) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = base + "_" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // src/js/reader-ui/markers.js
  var MarkerController = class {
    constructor() {
      this.db = loadMarkersDB();
      this.toolbar = document.getElementById("marker-toolbar");
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
      document.addEventListener("mouseup", this.handleSelection.bind(this));
      document.addEventListener("touchend", this.handleSelection.bind(this));
      document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") this.hideToolbar();
      }.bind(this));
      if (!this.toolbar) return;
      this.toolbar.querySelectorAll(".marker-color-btn").forEach(function(button) {
        button.addEventListener("click", function() {
          this.apply(button.dataset.color);
        }.bind(this));
      }.bind(this));
      var clear = this.toolbar.querySelector(".marker-clear-btn");
      if (clear) {
        clear.addEventListener("click", function() {
          this.clearCurrentPage();
        }.bind(this));
      }
    }
    handleSelection(event) {
      if (event.target && event.target.closest(".marker-toolbar, .settings-menu, .search-overlay, .reader-header, a, button, input, textarea, select")) {
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
      var x = rect && (rect.left || rect.right) ? rect.left + rect.width / 2 : event.clientX;
      var y = rect && (rect.top || rect.bottom) ? rect.top : event.clientY;
      this.toolbar.style.left = Math.max(8, Math.round(x - 80)) + "px";
      this.toolbar.style.top = Math.max(8, Math.round(y - 50)) + "px";
      this.toolbar.classList.add("show");
    }
    hideToolbar() {
      if (this.toolbar) this.toolbar.classList.remove("show");
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
      var id = "marker-" + Date.now() + "-" + Math.floor(Math.random() * 1e5);
      var text = range.toString().slice(0, IMPORT_LIMITS.maxTextLength);
      var ranges = [];
      segments.forEach(function(segment) {
        var wrapper = document.createElement("span");
        wrapper.className = "text-marker " + color + "-marker";
        wrapper.dataset.markerId = id;
        wrapper.title = "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u524A\u9664";
        wrapper.addEventListener("dblclick", function() {
          this.remove(id);
        }.bind(this));
        ranges.push({ s: getPath(segment.node), so: segment.start, e: getPath(segment.node), eo: segment.end });
        wrapBySplitText(segment.node, segment.start, segment.end, wrapper);
      }.bind(this));
      var page = currentPageKey();
      if (!this.db[page]) this.db[page] = [];
      this.db[page].push({ id, color, text, ranges, t: Date.now() });
      saveMarkersDB(this.db);
      if (selection) selection.removeAllRanges();
      this.pendingRange = null;
      this.hideToolbar();
    }
    restore() {
      unwrapMarkers();
      var page = currentPageKey();
      (this.db[page] || []).forEach(function(marker) {
        (marker.ranges || []).forEach(function(range) {
          var node = getNodeByPath(range.s);
          if (!node || node.nodeType !== Node.TEXT_NODE) return;
          var wrapper = document.createElement("span");
          wrapper.className = "text-marker " + marker.color + "-marker";
          wrapper.dataset.markerId = marker.id;
          wrapper.title = "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u524A\u9664";
          wrapper.addEventListener("dblclick", function() {
            this.remove(marker.id);
          }.bind(this));
          wrapBySplitText(node, range.so, range.eo, wrapper);
        }.bind(this));
      }.bind(this));
    }
    remove(id) {
      unwrapMarkers(id);
      var page = currentPageKey();
      this.db[page] = (this.db[page] || []).filter(function(marker) {
        return marker.id !== id;
      });
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
      downloadJson("markers", { version: "1.0", type: "markers", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), data });
    }
  };
  function unwrapMarkers(id) {
    document.querySelectorAll(".text-marker[data-marker-id]").forEach(function(marker) {
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
      var end = node === range.endContainer ? range.endOffset : (node.nodeValue || "").length;
      if (start !== end) segments.push({ node, start, end });
      return segments;
    }
    var walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node2) {
        try {
          return range.intersectsNode(node2) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        } catch (e) {
          return NodeFilter.FILTER_REJECT;
        }
      }
    });
    var node;
    while (node = walker.nextNode()) {
      var startOffset = node === range.startContainer ? range.startOffset : 0;
      var endOffset = node === range.endContainer ? range.endOffset : (node.nodeValue || "").length;
      if (startOffset !== endOffset) segments.push({ node, start: startOffset, end: endOffset });
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
    }
  }

  // src/js/reader-ui/nav-data.js
  var NAV_DATA_STATE = {
    promise: null,
    data: null,
    rootPrefix: null
  };
  function getRootPrefix() {
    if (NAV_DATA_STATE.rootPrefix != null) return NAV_DATA_STATE.rootPrefix;
    var meta = document.querySelector('meta[name="quarto:offset"]');
    var prefix = meta ? meta.getAttribute("content") || "" : "";
    if (prefix && !prefix.endsWith("/")) prefix += "/";
    NAV_DATA_STATE.rootPrefix = prefix;
    return prefix;
  }
  function resolveNavData(data) {
    if (data && typeof data === "object" && Array.isArray(data.pages)) {
      NAV_DATA_STATE.data = data;
      return data;
    }
    throw new Error("Invalid navigation data payload");
  }
  function loadNavDataViaScript(prefix) {
    return new Promise(function(resolve, reject) {
      var existing = document.querySelector('script[data-nav-data="true"]');
      if (existing && window.__NAV_DATA__) {
        try {
          resolve(resolveNavData(window.__NAV_DATA__));
        } catch (e) {
          reject(e);
        }
        return;
      }
      var script = document.createElement("script");
      script.type = "text/javascript";
      script.dataset.navData = "true";
      script.src = (prefix || "") + "assets/nav-data.js";
      script.onload = function() {
        try {
          resolve(resolveNavData(window.__NAV_DATA__));
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = function() {
        reject(new Error("Failed to load nav-data.js"));
      };
      document.head.appendChild(script);
    });
  }
  function loadNavData() {
    if (NAV_DATA_STATE.data) return Promise.resolve(NAV_DATA_STATE.data);
    if (window.__NAV_DATA__) {
      try {
        return Promise.resolve(resolveNavData(window.__NAV_DATA__));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    if (NAV_DATA_STATE.promise) return NAV_DATA_STATE.promise;
    var prefix = getRootPrefix() || "";
    if (window.location.protocol === "file:") {
      NAV_DATA_STATE.promise = loadNavDataViaScript(prefix).catch(function() {
        NAV_DATA_STATE.data = null;
        return null;
      });
      return NAV_DATA_STATE.promise;
    }
    var url = new URL(prefix + "assets/nav-data.json", window.location.href);
    NAV_DATA_STATE.promise = fetch(url.href).then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(resolveNavData).catch(function() {
      return loadNavDataViaScript(prefix).catch(function() {
        NAV_DATA_STATE.data = null;
        return null;
      });
    });
    return NAV_DATA_STATE.promise;
  }

  // src/js/reader-ui/toc.js
  function enhanceTOC() {
    var quartoTOC = document.getElementById("TOC") || document.getElementById("TableOfContents");
    var mainTOC = document.getElementById("main-toc");
    if (quartoTOC && mainTOC) {
      mainTOC.replaceChildren();
      mainTOC.appendChild(quartoTOC.cloneNode(true));
    }
    document.querySelectorAll(".chapter").forEach(function(chapter) {
      var id = chapter.id || "";
      var match = id.match(/chapter-(\d+)/) || id.match(/(\d+)/);
      if (match) chapter.setAttribute("data-chapter", match[1]);
    });
    document.querySelectorAll(".toc a").forEach(function(link) {
      var href = link.getAttribute("href") || "";
      var match = href.match(/chapter-(\d+)/);
      var item = link.closest(".toc-item, li");
      if (match && item) item.setAttribute("data-chapter", match[1]);
    });
  }
  function copyTOCToDrawer() {
    var drawerTOC = document.getElementById("drawer-toc");
    var mainTOC = document.getElementById("main-toc");
    if (!drawerTOC || !mainTOC) return;
    drawerTOC.replaceChildren();
    Array.from(mainTOC.childNodes).forEach(function(node) {
      drawerTOC.appendChild(node.cloneNode(true));
    });
  }

  // src/js/reader-ui/settings.js
  function initSettings(options) {
    var fontSize = options.fontSize;
    var markers = options.markers;
    var comments = options.comments;
    document.querySelectorAll(".font-size-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        fontSize.setSize(btn.dataset.size);
      });
    });
    var swipeCheckbox = document.getElementById("swipe-enabled");
    if (swipeCheckbox) {
      swipeCheckbox.addEventListener("change", function(event) {
        if (window.readerApp.swipeNav) {
          window.readerApp.swipeNav.setEnabled(event.target.checked);
        }
      });
    }
    bindExport("export-markers", function() {
      markers.export(false);
    });
    bindExport("export-comments", function() {
      comments.export(false);
    });
    bindImport("import-markers-btn", "import-markers-input", markers, comments);
    bindImport("import-comments-btn", "import-comments-input", markers, comments);
    var resetBtn = document.getElementById("reset-all-settings");
    if (resetBtn) {
      resetBtn.addEventListener("click", function() {
        if (confirm("\u3053\u306EBG\u30D3\u30E5\u30FC\u30A2\u306E\u8A2D\u5B9A\u3001\u30DE\u30FC\u30AB\u30FC\u3001\u30B3\u30E1\u30F3\u30C8\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3059\u304B\uFF1F")) {
          clearViewerStorage();
          location.reload();
        }
      });
    }
    document.addEventListener("click", function(event) {
      if (event.target.classList.contains("settings-menu") || event.target.classList.contains("search-overlay")) {
        event.target.classList.remove("open");
      }
    });
  }
  function bindExport(id, handler) {
    var button = document.getElementById(id);
    if (button) button.addEventListener("click", handler);
  }
  function bindImport(buttonId, inputId, markers, comments) {
    var button = document.getElementById(buttonId);
    var input = document.getElementById(inputId);
    if (!button || !input) return;
    button.addEventListener("click", function() {
      input.click();
    });
    input.addEventListener("change", function(event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      importAnnotationsFromFile(file, markers, comments).finally(function() {
        input.value = "";
      });
    });
  }
  function importAnnotationsFromFile(file, markers, comments) {
    if (file.size > IMPORT_LIMITS.maxBytes) {
      alert("JSON\u30D5\u30A1\u30A4\u30EB\u304C\u5927\u304D\u3059\u304E\u307E\u3059\u30021MB\u4EE5\u4E0B\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return Promise.resolve(false);
    }
    return Promise.all([file.text(), loadNavData().catch(function() {
      return null;
    })]).then(function(values) {
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
        throw new Error("No valid annotation records found");
      }
      if (markerResult.accepted) markers.mergeDB(markerResult.data);
      if (commentResult.accepted) comments.mergeDB(commentResult.data);
      alert(
        "\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F: \u30DE\u30FC\u30AB\u30FC " + markerResult.accepted + "\u4EF6\u3001\u30B3\u30E1\u30F3\u30C8 " + commentResult.accepted + "\u4EF6\uFF08\u9664\u5916 " + (markerResult.rejected + commentResult.rejected) + "\u4EF6\uFF09"
      );
      return true;
    }).catch(function() {
      alert("\u30B3\u30E1\u30F3\u30C8/\u30DE\u30FC\u30AB\u30FCJSON\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u5F62\u5F0F\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return false;
    });
  }
  function buildKnownPageSet(navData) {
    if (!navData || !Array.isArray(navData.pages)) return null;
    var pages = /* @__PURE__ */ new Set(["index.html"]);
    navData.pages.forEach(function(page) {
      if (page && typeof page.output === "string") pages.add(page.output);
    });
    return pages;
  }
  function filterKnownPages(result, knownPages) {
    if (!knownPages) return result;
    var filtered = {};
    var rejected = result.rejected;
    Object.keys(result.data).forEach(function(pageKey) {
      if (knownPages.has(pageKey)) {
        filtered[pageKey] = result.data[pageKey];
      } else {
        rejected += result.data[pageKey].length;
      }
    });
    var accepted = Object.keys(filtered).reduce(function(sum, pageKey) {
      return sum + filtered[pageKey].length;
    }, 0);
    return { data: filtered, accepted, rejected };
  }

  // src/js/reader-ui/link-utils.js
  function getLinkHref(link) {
    if (!link) return "";
    return link.getAttribute("href") || "";
  }
  function getLinkLabel(link) {
    if (!link) return "";
    var text = (link.textContent || "").replace(/\s+/g, " ").trim();
    return text || link.getAttribute("aria-label") || link.getAttribute("title") || getLinkHref(link);
  }
  function normalizeActionUrl(href) {
    try {
      return new URL(href, window.location.href).href;
    } catch (e) {
      return href || "";
    }
  }
  function isHashOnlyHref(href) {
    return typeof href === "string" && href.startsWith("#");
  }
  function isSamePageAnchor(href) {
    if (!href) return false;
    try {
      var url = new URL(href, window.location.href);
      return url.origin === window.location.origin && url.pathname === window.location.pathname && !!url.hash;
    } catch (e) {
      return isHashOnlyHref(href);
    }
  }
  function isExternalHref(href) {
    if (!href || /^(mailto:|tel:)/i.test(href)) return false;
    try {
      var url = new URL(href, window.location.href);
      return url.origin !== window.location.origin;
    } catch (e) {
      return false;
    }
  }
  function isPdfHref(href) {
    return /\.pdf(?:[#?].*)?$/i.test(href || "");
  }
  function openInCurrentTab(href) {
    if (!href) return;
    window.location.href = href;
  }
  function openInNewTab(href) {
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
    return Promise.resolve();
  }

  // src/js/reader-ui/read-list.js
  function makeId(href) {
    try {
      return btoa(unescape(encodeURIComponent(href))).replace(/=+$/g, "").slice(0, 80);
    } catch (e) {
      return String(Date.now());
    }
  }
  function classifyHref(href) {
    if (isPdfHref(href)) return "pdf";
    if (isSamePageAnchor(href)) return "anchor";
    if (isExternalHref(href)) return "external";
    return "internal";
  }
  function sanitizeItem(item) {
    if (!item || typeof item !== "object") return null;
    var href = String(item.href || "").trim();
    var absoluteHref = String(item.absoluteHref || normalizeActionUrl(href)).trim();
    if (!href || !absoluteHref) return null;
    return {
      id: String(item.id || makeId(absoluteHref)).slice(0, 100),
      title: String(item.title || href).replace(/\s+/g, " ").trim().slice(0, 200),
      href: href.slice(0, 1e3),
      absoluteHref: absoluteHref.slice(0, 1500),
      type: String(item.type || classifyHref(href)).slice(0, 30),
      addedAt: String(item.addedAt || (/* @__PURE__ */ new Date()).toISOString())
    };
  }
  var ReadingListController = class {
    constructor() {
      this.items = loadReadingList().map(sanitizeItem).filter(Boolean);
      this.list = document.getElementById("reading-list");
      this.count = document.getElementById("reading-list-count");
      this.bindToolbar();
      this.save(false);
      this.render();
    }
    createItemFromLink(link) {
      var href = getLinkHref(link);
      var absoluteHref = normalizeActionUrl(href);
      return sanitizeItem({
        id: makeId(absoluteHref),
        title: getLinkLabel(link),
        href,
        absoluteHref,
        type: classifyHref(href),
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    hasHref(href) {
      var absoluteHref = normalizeActionUrl(href);
      return this.items.some(function(item) {
        return item.absoluteHref === absoluteHref;
      });
    }
    toggleFromLink(link) {
      var item = this.createItemFromLink(link);
      if (!item) return false;
      var index = this.items.findIndex(function(existing) {
        return existing.absoluteHref === item.absoluteHref;
      });
      if (index >= 0) {
        this.items.splice(index, 1);
        this.save(true);
        return false;
      }
      this.items.push(item);
      this.save(true);
      return true;
    }
    remove(id) {
      this.items = this.items.filter(function(item) {
        return item.id !== id;
      });
      this.save(true);
    }
    clear() {
      this.items = [];
      this.save(true);
    }
    save(emit) {
      saveReadingList(this.items);
      this.render();
      if (emit) {
        document.dispatchEvent(new CustomEvent("reader:reading-list-updated", {
          detail: { items: this.items }
        }));
      }
    }
    render() {
      if (!this.list) return;
      this.list.replaceChildren();
      if (this.count) this.count.textContent = String(this.items.length);
      var note = document.createElement("p");
      note.className = "u-text-muted reading-list-note";
      note.textContent = "\u8AAD\u3080\u30EA\u30B9\u30C8\u306F\u3053\u306E\u7AEF\u672B\u306E\u30D6\u30E9\u30A6\u30B6\u306B\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002";
      this.list.appendChild(note);
      if (!this.items.length) {
        var empty = document.createElement("p");
        empty.className = "u-text-muted";
        empty.textContent = "\u8AAD\u3080\u30EA\u30B9\u30C8\u306F\u7A7A\u3067\u3059\u3002";
        this.list.appendChild(empty);
        return;
      }
      var ol = document.createElement("ol");
      ol.className = "reading-list-items";
      this.items.forEach(function(item) {
        var li = document.createElement("li");
        li.className = "reading-list-item";
        li.dataset.id = item.id;
        var title = document.createElement("a");
        title.className = "reading-list-title";
        title.href = item.href;
        if (item.type === "external") {
          title.target = "_blank";
          title.rel = "noopener noreferrer";
        }
        title.textContent = item.title || item.href;
        var path = document.createElement("div");
        path.className = "reading-list-path";
        path.textContent = item.href;
        var actions = document.createElement("div");
        actions.className = "reading-list-actions";
        var openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.textContent = "\u958B\u304F";
        openBtn.addEventListener("click", function() {
          if (item.type === "external") openInNewTab(item.href);
          else openInCurrentTab(item.href);
        });
        var newTabBtn = document.createElement("button");
        newTabBtn.type = "button";
        newTabBtn.textContent = "\u65B0\u3057\u3044\u30BF\u30D6";
        newTabBtn.addEventListener("click", function() {
          openInNewTab(item.href);
        });
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "\u524A\u9664";
        removeBtn.addEventListener("click", function() {
          this.remove(item.id);
        }.bind(this));
        actions.append(openBtn, newTabBtn, removeBtn);
        li.append(title, path, actions);
        ol.appendChild(li);
      }.bind(this));
      this.list.appendChild(ol);
    }
    bindToolbar() {
      var exportBtn = document.getElementById("export-reading-list");
      if (exportBtn) {
        exportBtn.addEventListener("click", function() {
          downloadJson("reading-list", {
            version: "1.0",
            type: "reading-list",
            exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
            data: this.items
          });
        }.bind(this));
      }
      var clearBtn = document.getElementById("clear-reading-list");
      if (clearBtn) {
        clearBtn.addEventListener("click", function() {
          if (window.confirm("\u8AAD\u3080\u30EA\u30B9\u30C8\u3092\u3059\u3079\u3066\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) this.clear();
        }.bind(this));
      }
    }
  };

  // src/js/reader-ui/link-actions.js
  var LinkActionsController = class {
    constructor(options) {
      this.readingList = options && options.readingList;
      this.menu = null;
      this.init();
    }
    init() {
      this.createMenuRoot();
      this.normalizeGeneratedLinks();
      this.enhanceStaticLinks();
      document.addEventListener("reader:reading-list-updated", function() {
        this.syncAddedState();
      }.bind(this));
      document.addEventListener("click", function(event) {
        if (!this.menu || this.menu.hidden) return;
        if (this.menu.contains(event.target)) return;
        this.closeMenu();
      }.bind(this));
      document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") this.closeMenu();
      }.bind(this));
    }
    createMenuRoot() {
      this.menu = document.getElementById("link-action-menu");
      if (this.menu) return;
      this.menu = document.createElement("div");
      this.menu.id = "link-action-menu";
      this.menu.className = "link-action-menu";
      this.menu.hidden = true;
      document.body.appendChild(this.menu);
    }
    normalizeGeneratedLinks() {
      document.querySelectorAll("main#quarto-document-content a[href], main.reader-main a[href]").forEach(function(link) {
        var href = getLinkHref(link);
        if (/^(mailto:|tel:)/i.test(href)) return;
        if (isExternalHref(href)) {
          link.setAttribute("target", "_blank");
          link.setAttribute("rel", "noopener noreferrer");
          link.classList.add("external-link");
        }
        if (isPdfHref(href)) link.classList.add("pdf-link");
      });
    }
    enhanceStaticLinks() {
      [
        ".toc-item > a",
        ".toc-sublist a",
        ".drawer-toc a",
        ".chapter-nav-prev",
        ".chapter-nav-next",
        ".drawer-chapter-nav-prev",
        ".drawer-chapter-nav-next",
        ".index-list a",
        ".aj-index__locations a"
      ].forEach(function(selector) {
        document.querySelectorAll(selector).forEach(function(link) {
          this.enhanceLink(link);
        }.bind(this));
      }.bind(this));
      this.syncAddedState();
    }
    enhanceLink(link) {
      if (!link || link.dataset.readerActionsEnhanced === "true") return;
      var href = getLinkHref(link);
      if (!href || isSamePageAnchor(href)) return;
      if (!link.parentNode) return;
      link.dataset.readerActionsEnhanced = "true";
      var wrapper = document.createElement("span");
      wrapper.className = "link-action-wrapper";
      link.parentNode.insertBefore(wrapper, link);
      wrapper.appendChild(link);
      var newTabButton = this.createActionButton("\u2197", "\u65B0\u3057\u3044\u30BF\u30D6\u3067\u958B\u304F", function(event) {
        event.preventDefault();
        event.stopPropagation();
        openInNewTab(href);
      });
      var addButton = this.createActionButton("\uFF0B", "\u8AAD\u3080\u30EA\u30B9\u30C8\u306B\u8FFD\u52A0", function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.readingList) this.readingList.toggleFromLink(link);
        this.syncAddedState();
      }.bind(this));
      addButton.dataset.readerAction = "toggle-reading-list";
      var moreButton = this.createActionButton("\u2026", "\u30EA\u30F3\u30AF\u64CD\u4F5C", function(event) {
        event.preventDefault();
        event.stopPropagation();
        this.openMenu(link, moreButton);
      }.bind(this));
      wrapper.append(newTabButton, addButton, moreButton);
    }
    createActionButton(text, label, handler) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "link-action-btn";
      button.textContent = text;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", handler);
      return button;
    }
    syncAddedState() {
      if (!this.readingList) return;
      document.querySelectorAll(".link-action-wrapper").forEach(function(wrapper) {
        var link = wrapper.querySelector("a[href]");
        var button = wrapper.querySelector('[data-reader-action="toggle-reading-list"]');
        if (!link || !button) return;
        var added = this.readingList.hasHref(getLinkHref(link));
        button.classList.toggle("is-added", added);
        button.textContent = added ? "\u2713" : "\uFF0B";
        button.setAttribute("aria-label", added ? "\u8AAD\u3080\u30EA\u30B9\u30C8\u304B\u3089\u524A\u9664" : "\u8AAD\u3080\u30EA\u30B9\u30C8\u306B\u8FFD\u52A0");
      }.bind(this));
    }
    openMenu(link, anchor) {
      if (!this.menu) return;
      var href = getLinkHref(link);
      this.menu.replaceChildren();
      [
        ["\u958B\u304F", function() {
          openInCurrentTab(href);
        }],
        ["\u65B0\u3057\u3044\u30BF\u30D6", function() {
          openInNewTab(href);
        }],
        ["\u8AAD\u3080\u30EA\u30B9\u30C8", function() {
          if (this.readingList) this.readingList.toggleFromLink(link);
        }.bind(this)],
        ["\u30B3\u30D4\u30FC", function() {
          copyText(normalizeActionUrl(href));
        }]
      ].forEach(function(entry) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = entry[0];
        button.addEventListener("click", function(event) {
          event.preventDefault();
          event.stopPropagation();
          entry[1]();
          this.closeMenu();
          this.syncAddedState();
        }.bind(this));
        this.menu.appendChild(button);
      }.bind(this));
      var rect = anchor.getBoundingClientRect();
      this.menu.style.left = Math.min(window.innerWidth - 180, rect.left) + "px";
      this.menu.style.top = rect.bottom + 6 + window.scrollY + "px";
      this.menu.hidden = false;
    }
    closeMenu() {
      if (this.menu) this.menu.hidden = true;
    }
  };

  // src/js/reader-ui/main.js
  (function() {
    "use strict";
    function AppState() {
      this.state = {
        theme: "auto",
        fontSize: "M",
        sidebarLeft: "expanded",
        sidebarRight: "expanded",
        drawerOpen: false,
        swipeEnabled: false
      };
      this.listeners = [];
      this.loadState();
    }
    AppState.prototype.get = function(key) {
      return this.state[key];
    };
    AppState.prototype.set = function(key, value) {
      if (this.state[key] !== value) {
        this.state[key] = value;
        this.notifyListeners(key, value);
        this.saveState();
      }
    };
    AppState.prototype.subscribe = function(listener) {
      this.listeners.push(listener);
      return function() {
        var index = this.listeners.indexOf(listener);
        if (index > -1) this.listeners.splice(index, 1);
      }.bind(this);
    };
    AppState.prototype.notifyListeners = function(key, value) {
      this.listeners.forEach(function(listener) {
        listener(key, value);
      });
    };
    AppState.prototype.loadState = function() {
      var parsed = readJsonStorage(STORAGE_KEYS.appState, null);
      if (!parsed || typeof parsed !== "object") return;
      Object.keys(this.state).forEach(function(key) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          this.state[key] = parsed[key];
        }
      }.bind(this));
    };
    AppState.prototype.saveState = function() {
      writeJsonStorage(STORAGE_KEYS.appState, this.state);
    };
    function ChapterManager() {
      this.currentChapter = 1;
      this.totalChapters = 0;
      this.init();
    }
    ChapterManager.prototype.init = function() {
      this.countChapters();
      this.detectCurrentChapter();
      window.addEventListener("hashchange", function() {
        this.detectCurrentChapter();
        this.updateNavigation();
      }.bind(this));
      this.updateNavigation();
    };
    ChapterManager.prototype.countChapters = function() {
      this.totalChapters = Math.max(1, document.querySelectorAll(".chapter[data-chapter]").length || 1);
    };
    ChapterManager.prototype.detectCurrentChapter = function() {
      var hash = window.location.hash;
      var match = hash.match(/#chapter-(\d+)/);
      this.currentChapter = match ? parseInt(match[1], 10) : 1;
      this.updateTOCHighlight();
    };
    ChapterManager.prototype.goToChapter = function(chapterNum) {
      window.location.hash = "chapter-" + chapterNum;
    };
    ChapterManager.prototype.nextChapter = function() {
      if (this.currentChapter < this.totalChapters) this.goToChapter(this.currentChapter + 1);
    };
    ChapterManager.prototype.previousChapter = function() {
      if (this.currentChapter > 1) this.goToChapter(this.currentChapter - 1);
    };
    ChapterManager.prototype.updateTOCHighlight = function() {
      document.querySelectorAll(".toc-item, .toc li").forEach(function(item) {
        item.classList.remove("toc-item--current", "toc-item--visited", "toc-item--future");
      });
      var current = document.querySelector('.toc-item[data-chapter="' + this.currentChapter + '"], .toc li[data-chapter="' + this.currentChapter + '"]');
      if (current) current.classList.add("toc-item--current");
    };
    ChapterManager.prototype.updateNavigation = function() {
      var prevBtn = document.querySelector(".chapter-nav-prev, .drawer-chapter-nav-prev");
      var nextBtn = document.querySelector(".chapter-nav-next, .drawer-chapter-nav-next");
      if (prevBtn) {
        prevBtn.style.opacity = this.currentChapter <= 1 ? "0.5" : "1";
        prevBtn.style.pointerEvents = this.currentChapter <= 1 ? "none" : "auto";
      }
      if (nextBtn) {
        nextBtn.style.opacity = this.currentChapter >= this.totalChapters ? "0.5" : "1";
        nextBtn.style.pointerEvents = this.currentChapter >= this.totalChapters ? "none" : "auto";
      }
      this.updateDrawerNavigation();
    };
    ChapterManager.prototype.updateDrawerNavigation = function() {
      updateDrawerTitle(".drawer-chapter-nav-prev .drawer-chapter-nav-title", this.currentChapter - 1);
      updateDrawerTitle(".drawer-chapter-nav-next .drawer-chapter-nav-title", this.currentChapter + 1);
    };
    function updateDrawerTitle(selector, chapterNumber) {
      var target = document.querySelector(selector);
      if (!target || chapterNumber < 1) return;
      var chapter = document.querySelector('.chapter[data-chapter="' + chapterNumber + '"]');
      if (!chapter) return;
      var heading = chapter.querySelector("h1");
      target.textContent = heading ? heading.textContent : "\u7B2C" + chapterNumber + "\u7AE0";
    }
    function ThemeManager(appState) {
      this.appState = appState;
      this.themes = ["light", "dark", "auto"];
      this.currentTheme = appState.get("theme") || "auto";
      this.mediaQuery = null;
      this.applyTheme(this.currentTheme);
    }
    ThemeManager.prototype.applyTheme = function(theme) {
      if (theme === "auto") {
        document.body.removeAttribute("data-theme");
        this.watchSystemTheme();
      } else {
        document.body.setAttribute("data-theme", theme);
        this.stopWatchingSystemTheme();
      }
      this.currentTheme = theme;
      this.updateIcon();
    };
    ThemeManager.prototype.updateIcon = function() {
      var btn = document.querySelector(".theme-btn");
      if (!btn) return;
      btn.textContent = { light: "\u{1F319}", dark: "\u2600\uFE0F", auto: "\u{1F317}" }[this.currentTheme] || "\u{1F319}";
    };
    ThemeManager.prototype.cycleTheme = function() {
      var currentIndex = this.themes.indexOf(this.currentTheme);
      var nextTheme = this.themes[(currentIndex + 1) % this.themes.length];
      this.applyTheme(nextTheme);
      this.appState.set("theme", nextTheme);
    };
    ThemeManager.prototype.watchSystemTheme = function() {
      if (!this.mediaQuery || typeof this.mediaQuery.addEventListener !== "function") {
        this.mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      }
    };
    ThemeManager.prototype.stopWatchingSystemTheme = function() {
      this.mediaQuery = null;
    };
    function Sidebar(appState) {
      this.appState = appState;
      this.layout = document.getElementById("reader-layout");
      if (this.layout) {
        this.bindToggleEvents();
        this.bindResizeEvents();
        this.updateTriggers();
      }
    }
    Sidebar.prototype.bindToggleEvents = function() {
      var leftToggle = this.layout.querySelector(".sidebar--left .sidebar-toggle");
      var rightToggle = this.layout.querySelector(".sidebar--right .sidebar-toggle");
      if (leftToggle) leftToggle.addEventListener("click", function() {
        this.toggleSidebar("left");
      }.bind(this));
      if (rightToggle) rightToggle.addEventListener("click", function() {
        this.toggleSidebar("right");
      }.bind(this));
      document.addEventListener("click", function(event) {
        if (event.target.classList.contains("sidebar-trigger--left")) this.toggleSidebar("left");
        if (event.target.classList.contains("sidebar-trigger--right")) this.toggleSidebar("right");
      }.bind(this));
    };
    Sidebar.prototype.bindResizeEvents = function() {
      var leftHandle = this.layout.querySelector(".sidebar--left .sidebar-resize-handle");
      var rightHandle = this.layout.querySelector(".sidebar--right .sidebar-resize-handle");
      if (leftHandle) this.setupResize(leftHandle, "left");
      if (rightHandle) this.setupResize(rightHandle, "right");
    };
    Sidebar.prototype.setupResize = function(handle, side) {
      var startX = 0;
      var startWidth = 0;
      var isDragging = false;
      handle.addEventListener("mousedown", function(event) {
        startX = event.clientX;
        var sidebar = document.querySelector(".sidebar--" + side);
        startWidth = sidebar ? sidebar.offsetWidth : 280;
        isDragging = true;
        handle.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        event.preventDefault();
      });
      document.addEventListener("mousemove", function(event) {
        if (!isDragging) return;
        var diff = side === "left" ? event.clientX - startX : startX - event.clientX;
        var width = Math.max(200, Math.min(400, startWidth + diff));
        document.documentElement.style.setProperty(side === "left" ? "--sidebar-left-width" : "--sidebar-right-width", width + "px");
      });
      document.addEventListener("mouseup", function() {
        if (!isDragging) return;
        isDragging = false;
        handle.classList.remove("dragging");
        document.body.style.cursor = "";
      });
    };
    Sidebar.prototype.toggleSidebar = function(side) {
      var key = side === "left" ? "sidebarLeft" : "sidebarRight";
      this.appState.set(key, this.appState.get(key) === "expanded" ? "collapsed" : "expanded");
      this.applyState();
    };
    Sidebar.prototype.applyState = function() {
      if (!this.layout) return;
      this.layout.dataset.sidebarLeft = this.appState.get("sidebarLeft");
      this.layout.dataset.sidebarRight = this.appState.get("sidebarRight");
      this.updateTriggers();
    };
    Sidebar.prototype.updateTriggers = function() {
      updateSidebarTrigger("left", this.appState.get("sidebarLeft") === "collapsed");
      updateSidebarTrigger("right", this.appState.get("sidebarRight") === "collapsed");
    };
    function updateSidebarTrigger(side, visible) {
      var trigger = document.querySelector(".sidebar-trigger--" + side);
      if (visible && !trigger) {
        trigger = document.createElement("div");
        trigger.className = "sidebar-trigger sidebar-trigger--" + side;
        document.body.appendChild(trigger);
      }
      if (!trigger) return;
      trigger.classList.toggle("show", visible);
      trigger.classList.toggle("hide", !visible);
    }
    function Progress(chapterManager) {
      this.chapterManager = chapterManager;
      this.progressFill = document.getElementById("progress-fill");
      this.progressBar = document.getElementById("progress-bar");
      if (!this.progressBar) return;
      window.addEventListener("scroll", this.update.bind(this), { passive: true });
      this.update();
    }
    Progress.prototype.update = function() {
      var currentChapter = this.chapterManager.currentChapter;
      var totalChapters = Math.max(1, this.chapterManager.totalChapters);
      var scrollProgress = this.calculateScrollProgress();
      var percentage = Math.min(100, Math.max(0, Math.round(((currentChapter - 1) / totalChapters + scrollProgress / totalChapters) * 100)));
      if (this.progressFill) this.progressFill.style.width = percentage + "%";
      if (this.progressBar) this.progressBar.dataset.progress = "\u7B2C" + currentChapter + "\u7AE0 / \u5168" + totalChapters + "\u7AE0 (" + percentage + "%)";
    };
    Progress.prototype.calculateScrollProgress = function() {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      return docHeight > 0 ? Math.min(1, window.scrollY / docHeight) : 0;
    };
    function Drawer(appState) {
      this.appState = appState;
      this.drawer = document.getElementById("drawer");
      this.backdrop = document.getElementById("drawer-backdrop");
      if (this.drawer) this.bindEvents();
    }
    Drawer.prototype.bindEvents = function() {
      var closeBtn = this.drawer.querySelector(".drawer-close");
      if (closeBtn) closeBtn.addEventListener("click", this.close.bind(this));
      if (this.backdrop) this.backdrop.addEventListener("click", this.close.bind(this));
      document.addEventListener("keydown", function(event) {
        if (event.key === "Escape" && this.isOpen()) this.close();
      }.bind(this));
      this.drawer.querySelectorAll('a[href^="#"]').forEach(function(link) {
        link.addEventListener("click", this.close.bind(this));
      }.bind(this));
    };
    Drawer.prototype.open = function() {
      if (!this.drawer || !this.backdrop) return;
      this.drawer.classList.add("open");
      this.backdrop.classList.add("open");
      this.appState.set("drawerOpen", true);
      document.body.style.overflow = "hidden";
    };
    Drawer.prototype.close = function() {
      if (!this.drawer || !this.backdrop) return;
      this.drawer.classList.remove("open");
      this.backdrop.classList.remove("open");
      this.appState.set("drawerOpen", false);
      document.body.style.overflow = "";
    };
    Drawer.prototype.toggle = function() {
      this.isOpen() ? this.close() : this.open();
    };
    Drawer.prototype.isOpen = function() {
      return !!(this.drawer && this.drawer.classList.contains("open"));
    };
    function FontSize(appState) {
      this.appState = appState;
      this.sizes = ["XS", "S", "M", "L", "XL"];
      this.currentSize = appState.get("fontSize") || "M";
      this.applySize(this.currentSize);
      this.bindKeyboardShortcuts();
    }
    FontSize.prototype.applySize = function(size) {
      if (!this.sizes.includes(size)) size = "M";
      document.body.setAttribute("data-font-size", size);
      this.currentSize = size;
      document.querySelectorAll(".font-size-btn").forEach(function(button) {
        button.classList.toggle("active", button.dataset.size === size);
      });
    };
    FontSize.prototype.setSize = function(size) {
      if (!this.sizes.includes(size)) return;
      this.applySize(size);
      this.appState.set("fontSize", size);
    };
    FontSize.prototype.increase = function() {
      var index = this.sizes.indexOf(this.currentSize);
      if (index < this.sizes.length - 1) this.setSize(this.sizes[index + 1]);
    };
    FontSize.prototype.decrease = function() {
      var index = this.sizes.indexOf(this.currentSize);
      if (index > 0) this.setSize(this.sizes[index - 1]);
    };
    FontSize.prototype.reset = function() {
      this.setSize("M");
    };
    FontSize.prototype.bindKeyboardShortcuts = function() {
      document.addEventListener("keydown", function(event) {
        if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) {
          event.preventDefault();
          this.increase();
        } else if ((event.ctrlKey || event.metaKey) && event.key === "-") {
          event.preventDefault();
          this.decrease();
        } else if ((event.ctrlKey || event.metaKey) && event.key === "0") {
          event.preventDefault();
          this.reset();
        }
      }.bind(this));
    };
    function SwipeNav(chapterManager) {
      this.chapterManager = chapterManager;
      this.enabled = localStorage.getItem(STORAGE_KEYS.swipeEnabled) === "true";
      this.startX = 0;
      this.startTime = 0;
      this.threshold = 100;
      this.timeLimit = 300;
      if (this.enabled) this.bindEvents();
    }
    SwipeNav.prototype.setEnabled = function(enabled) {
      this.enabled = !!enabled;
      localStorage.setItem(STORAGE_KEYS.swipeEnabled, String(this.enabled));
      this.enabled ? this.bindEvents() : this.unbindEvents();
    };
    SwipeNav.prototype.bindEvents = function() {
      if (this.bound) return;
      this.handleTouchStart = function(event) {
        this.startX = event.touches[0].clientX;
        this.startTime = Date.now();
      }.bind(this);
      this.handleTouchEnd = function(event) {
        var diffTime = Date.now() - this.startTime;
        var diffX = event.changedTouches[0].clientX - this.startX;
        if (diffTime < this.timeLimit && Math.abs(diffX) > this.threshold) {
          diffX > 0 ? this.chapterManager.previousChapter() : this.chapterManager.nextChapter();
        }
      }.bind(this);
      document.addEventListener("touchstart", this.handleTouchStart, { passive: true });
      document.addEventListener("touchend", this.handleTouchEnd, { passive: true });
      this.bound = true;
    };
    SwipeNav.prototype.unbindEvents = function() {
      if (!this.bound) return;
      document.removeEventListener("touchstart", this.handleTouchStart);
      document.removeEventListener("touchend", this.handleTouchEnd);
      this.bound = false;
    };
    function initApp() {
      var appState = new AppState();
      var storage = new Storage();
      var chapterManager = new ChapterManager();
      var sidebar = new Sidebar(appState);
      var progress = new Progress(chapterManager);
      var themeManager = new ThemeManager(appState);
      var fontSize = new FontSize(appState);
      var drawer = new Drawer(appState);
      var swipeNav = new SwipeNav(chapterManager);
      var comments = new CommentsController();
      var markers = new MarkerController();
      var readingList = new ReadingListController();
      window.readerApp = {
        appState,
        chapterManager,
        storage,
        sidebar,
        progress,
        themeManager,
        fontSize,
        drawer,
        swipeNav,
        comments,
        readingList,
        markers
      };
      initHeader(themeManager, drawer);
      initSettings({ fontSize, markers, comments });
      initTabs();
      enhanceTOC();
      chapterManager.countChapters();
      updateChapterNavLinks(chapterManager);
      copyTOCToDrawer();
      var linkActions = new LinkActionsController({ readingList });
      window.readerApp.linkActions = linkActions;
      initReadingProgress();
      initKeyboardShortcuts(drawer, themeManager);
      sidebar.applyState();
      themeManager.applyTheme(appState.get("theme"));
      loadNavData().catch(function() {
      });
    }
    function initHeader(themeManager, drawer) {
      var menuBtn = document.querySelector(".menu-btn");
      if (menuBtn) menuBtn.addEventListener("click", function() {
        drawer.toggle();
      });
      var searchBtn = document.querySelector(".search-btn");
      if (searchBtn) {
        searchBtn.addEventListener("click", function() {
          var overlay = document.getElementById("search-overlay");
          if (!overlay) return;
          overlay.classList.add("open");
          var input = overlay.querySelector(".search-input");
          if (input) setTimeout(function() {
            input.focus();
          }, 100);
        });
      }
      var settingsBtn = document.querySelector(".settings-btn");
      if (settingsBtn) {
        settingsBtn.addEventListener("click", function() {
          var menu = document.getElementById("settings-menu");
          if (menu) menu.classList.add("open");
        });
      }
      var themeBtn = document.querySelector(".theme-btn");
      if (themeBtn) themeBtn.addEventListener("click", function() {
        themeManager.cycleTheme();
      });
    }
    function initTabs() {
      var tabs = document.querySelectorAll(".tab");
      var tabContents = document.querySelectorAll(".tab-content");
      tabs.forEach(function(tab) {
        tab.addEventListener("click", function() {
          var targetTab = tab.dataset.tab;
          if (!targetTab) return;
          tabs.forEach(function(item) {
            item.classList.remove("active");
          });
          tab.classList.add("active");
          tabContents.forEach(function(content) {
            content.classList.toggle("active", content.id === "tab-" + targetTab);
            content.classList.toggle("tab-content--active", content.id === "tab-" + targetTab);
          });
        });
      });
    }
    function updateChapterNavLinks(chapterManager) {
      setTimeout(function() {
        var _a, _b;
        var chapters = document.querySelectorAll(".chapter[data-chapter]");
        var currentIndex = chapterManager.currentChapter;
        var prevLink = document.querySelector(".chapter-nav-prev, .drawer-chapter-nav-prev");
        var nextLink = document.querySelector(".chapter-nav-next, .drawer-chapter-nav-next");
        if (prevLink && currentIndex > 1 && ((_a = chapters[currentIndex - 2]) == null ? void 0 : _a.id)) {
          prevLink.href = "#" + chapters[currentIndex - 2].id;
        }
        if (nextLink && currentIndex < chapters.length && ((_b = chapters[currentIndex]) == null ? void 0 : _b.id)) {
          nextLink.href = "#" + chapters[currentIndex].id;
        }
      }, 100);
    }
    function initReadingProgress() {
      var saveTimeout;
      function savePosition() {
        try {
          sessionStorage.setItem(STORAGE_KEYS.scrollPosition, String(window.scrollY));
        } catch (e) {
        }
      }
      function restorePosition() {
        try {
          var saved = sessionStorage.getItem(STORAGE_KEYS.scrollPosition);
          var position = saved ? parseInt(saved, 10) : 0;
          if (!Number.isNaN(position) && position > 0) window.scrollTo(0, position);
        } catch (e) {
        }
      }
      window.addEventListener("scroll", function() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(savePosition, 500);
      }, { passive: true });
      window.addEventListener("beforeunload", savePosition);
      window.addEventListener("load", function() {
        setTimeout(restorePosition, 100);
      });
    }
    function initKeyboardShortcuts(drawer) {
      document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") {
          var searchOverlay = document.getElementById("search-overlay");
          var settingsMenu = document.getElementById("settings-menu");
          if (searchOverlay) searchOverlay.classList.remove("open");
          if (settingsMenu) settingsMenu.classList.remove("open");
          if (drawer.isOpen()) drawer.close();
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "k") {
          event.preventDefault();
          var overlay = document.getElementById("search-overlay");
          if (overlay) {
            overlay.classList.add("open");
            var input = overlay.querySelector(".search-input");
            if (input) setTimeout(function() {
              input.focus();
            }, 100);
          }
        }
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initApp);
    } else {
      initApp();
    }
  })();
})();
