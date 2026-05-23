import { IMPORT_LIMITS, MARKER_COLORS } from './constants.js';
import { canonicalPageKey } from './page-key.js';

var ID_RE = /^(?:marker|comment)-[A-Za-z0-9._:-]+$/;

export function parseJsonObject(raw) {
  var parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON root must be an object');
  }
  return parsed;
}

export function safeString(value, maxLength) {
  if (typeof value !== 'string') return null;
  if (value.length > maxLength) return null;
  return value;
}

function validId(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= IMPORT_LIMITS.maxIdLength &&
    ID_RE.test(value);
}

function validPath(path) {
  return Array.isArray(path) &&
    path.length <= IMPORT_LIMITS.maxPathDepth &&
    path.every(function (part) {
      return Number.isInteger(part) && part >= 0 && part <= IMPORT_LIMITS.maxNodeIndex;
    });
}

function validOffset(value) {
  return Number.isInteger(value) && value >= 0 && value <= IMPORT_LIMITS.maxOffset;
}

function sanitizeRange(range) {
  if (!range || typeof range !== 'object' || Array.isArray(range)) return null;
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

export function sanitizeMarkerRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (!validId(record.id)) return null;
  if (!MARKER_COLORS.includes(record.color)) return null;
  var ranges = sanitizeRanges(record.ranges || (record.range ? [record.range] : []));
  if (!ranges) return null;
  var text = safeString(record.text || '', IMPORT_LIMITS.maxTextLength);
  if (text === null) return null;
  return {
    id: record.id,
    color: record.color,
    text: text,
    ranges: ranges,
    t: Number.isFinite(record.t) ? Math.max(0, Math.floor(record.t)) : Date.now()
  };
}

export function sanitizeCommentRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (!validId(record.id)) return null;
  var text = safeString(record.text || '', IMPORT_LIMITS.maxTextLength);
  var body = safeString(record.body || '', IMPORT_LIMITS.maxBodyLength);
  if (text === null || body === null) return null;
  var ranges = sanitizeRanges(record.ranges || []);
  return {
    id: record.id,
    text: text,
    body: body,
    ranges: ranges || [],
    t: Number.isFinite(record.t) ? Math.max(0, Math.floor(record.t)) : Date.now()
  };
}

export function sanitizeRecordDB(input, recordSanitizer) {
  var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  var output = {};
  var rejected = 0;
  var accepted = 0;
  var pageCount = 0;

  Object.keys(source).slice(0, IMPORT_LIMITS.maxPages + 1).forEach(function (rawPageKey) {
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
    var seen = new Set();
    list.slice(0, IMPORT_LIMITS.maxRecordsPerPage + 1).forEach(function (record) {
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

  return { data: output, accepted: accepted, rejected: rejected };
}

export function normalizeAnnotationImport(json) {
  return {
    markers: json.markers || json.data?.markers || (json.type === 'markers' ? json.data : null) || {},
    comments: json.comments || json.data?.comments || (json.type === 'comments' ? json.data : null) || {}
  };
}
