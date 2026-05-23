import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEYS,
  VIEWER_LOCAL_STORAGE_KEYS,
  VIEWER_SESSION_STORAGE_KEYS
} from './constants.js';
import { currentPageKey, canonicalPageKey } from './page-key.js';
import { sanitizeCommentRecord, sanitizeMarkerRecord, sanitizeRecordDB } from './sanitize.js';

export class Storage {
  constructor(prefix) {
    this.prefix = prefix || 'reader-';
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
    } catch (e) {}
  }

  remove(key) {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (e) {}
  }

  clear() {
    clearViewerStorage();
  }
}

export function readJsonStorage(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function writeJsonStorage(key, value) {
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
  Object.keys(clean).forEach(function (key) {
    var pageKey = canonicalPageKey(key);
    if (!merged[pageKey]) merged[pageKey] = [];
    var seen = new Set(merged[pageKey].map(function (record) { return record.id; }));
    clean[key].forEach(function (record) {
      if (!seen.has(record.id)) {
        merged[pageKey].push(record);
        seen.add(record.id);
      }
    });
  });
  return merged;
}

export function loadMarkersDB() {
  var db = readJsonStorage(STORAGE_KEYS.markers, {});
  LEGACY_STORAGE_KEYS.markers.forEach(function (legacyKey) {
    var legacy = readJsonStorage(legacyKey, null);
    if (legacy) {
      db = Object.assign({}, migrateArrayToCurrentPage(legacy), migrateArrayToCurrentPage(db));
    }
  });
  db = canonicalizeDB(db, sanitizeMarkerRecord);
  writeJsonStorage(STORAGE_KEYS.markers, db);
  return db;
}

export function saveMarkersDB(db) {
  return writeJsonStorage(STORAGE_KEYS.markers, canonicalizeDB(db, sanitizeMarkerRecord));
}

export function loadCommentsDB() {
  var db = readJsonStorage(STORAGE_KEYS.comments, {});
  LEGACY_STORAGE_KEYS.comments.forEach(function (legacyKey) {
    var legacy = readJsonStorage(legacyKey, null);
    if (legacy) {
      db = Object.assign({}, migrateArrayToCurrentPage(legacy), migrateArrayToCurrentPage(db));
    }
  });
  db = canonicalizeDB(db, sanitizeCommentRecord);
  writeJsonStorage(STORAGE_KEYS.comments, db);
  return db;
}

export function saveCommentsDB(db) {
  return writeJsonStorage(STORAGE_KEYS.comments, canonicalizeDB(db, sanitizeCommentRecord));
}

export function loadReadingList() {
  var list = readJsonStorage(STORAGE_KEYS.readingList, []);
  return Array.isArray(list) ? list : [];
}

export function saveReadingList(list) {
  return writeJsonStorage(STORAGE_KEYS.readingList, Array.isArray(list) ? list : []);
}

export function clearViewerStorage() {
  VIEWER_LOCAL_STORAGE_KEYS.forEach(function (key) {
    try { localStorage.removeItem(key); } catch (e) {}
  });
  VIEWER_SESSION_STORAGE_KEYS.forEach(function (key) {
    try { sessionStorage.removeItem(key); } catch (e) {}
  });
}

export function mergeRecordDB(existing, incoming) {
  var merged = Object.assign({}, existing || {});
  Object.keys(incoming || {}).forEach(function (pageKey) {
    if (!Array.isArray(incoming[pageKey])) return;
    if (!merged[pageKey]) merged[pageKey] = [];
    var seen = new Set(merged[pageKey].map(function (record) { return record.id; }));
    incoming[pageKey].forEach(function (record) {
      if (!seen.has(record.id)) {
        merged[pageKey].push(record);
        seen.add(record.id);
      }
    });
  });
  return merged;
}
