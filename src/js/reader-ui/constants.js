export const STORAGE_KEYS = {
  appState: 'reader-state',
  swipeEnabled: 'reader-swipe-enabled',
  scrollPosition: 'reader-scroll-position',
  markers: 'reader-markers',
  comments: 'reader-comments',
  readingList: 'reader-reading-list'
};

export const LEGACY_STORAGE_KEYS = {
  markers: ['quarto-markers'],
  comments: ['quarto-comments'],
  scrollPosition: ['quarto-scroll-position']
};

export const VIEWER_LOCAL_STORAGE_KEYS = [
  STORAGE_KEYS.appState,
  STORAGE_KEYS.swipeEnabled,
  STORAGE_KEYS.markers,
  STORAGE_KEYS.comments,
  STORAGE_KEYS.readingList,
  'quarto-toc-location',
  'quarto-theme',
  'quarto-font-size',
  'quarto-right-tab',
  'footnotes-sort',
  'comments-sort',
  'txtSize',
  'theme',
  'tocLocation',
  'scrollPos',
  'gdocPreviewMaxToasts',
  'gdocPreviewState_v2'
];

export const VIEWER_SESSION_STORAGE_KEYS = [
  STORAGE_KEYS.scrollPosition,
  'quarto-reading-state',
  'quarto-scroll-position'
];

export const IMPORT_LIMITS = {
  maxBytes: 1024 * 1024,
  maxPages: 200,
  maxRecords: 3000,
  maxRecordsPerPage: 500,
  maxIdLength: 80,
  maxTextLength: 500,
  maxBodyLength: 5000,
  maxRangesPerRecord: 20,
  maxPathDepth: 80,
  maxNodeIndex: 10000,
  maxOffset: 100000
};

export const MARKER_COLORS = ['yellow', 'green', 'blue', 'pink'];
