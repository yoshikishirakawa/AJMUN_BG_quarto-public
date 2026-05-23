var NAV_DATA_STATE = {
  promise: null,
  data: null,
  rootPrefix: null
};

export function getRootPrefix() {
  if (NAV_DATA_STATE.rootPrefix != null) return NAV_DATA_STATE.rootPrefix;
  var meta = document.querySelector('meta[name="quarto:offset"]');
  var prefix = meta ? (meta.getAttribute('content') || '') : '';
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  NAV_DATA_STATE.rootPrefix = prefix;
  return prefix;
}

function resolveNavData(data) {
  if (data && typeof data === 'object' && Array.isArray(data.pages)) {
    NAV_DATA_STATE.data = data;
    return data;
  }
  throw new Error('Invalid navigation data payload');
}

function loadNavDataViaScript(prefix) {
  return new Promise(function (resolve, reject) {
    var existing = document.querySelector('script[data-nav-data="true"]');
    if (existing && window.__NAV_DATA__) {
      try {
        resolve(resolveNavData(window.__NAV_DATA__));
      } catch (e) {
        reject(e);
      }
      return;
    }

    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.dataset.navData = 'true';
    script.src = (prefix || '') + 'assets/nav-data.js';
    script.onload = function () {
      try {
        resolve(resolveNavData(window.__NAV_DATA__));
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = function () {
      reject(new Error('Failed to load nav-data.js'));
    };
    document.head.appendChild(script);
  });
}

export function loadNavData() {
  if (NAV_DATA_STATE.data) return Promise.resolve(NAV_DATA_STATE.data);
  if (window.__NAV_DATA__) {
    try {
      return Promise.resolve(resolveNavData(window.__NAV_DATA__));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  if (NAV_DATA_STATE.promise) return NAV_DATA_STATE.promise;

  var prefix = getRootPrefix() || '';
  if (window.location.protocol === 'file:') {
    NAV_DATA_STATE.promise = loadNavDataViaScript(prefix).catch(function () {
      NAV_DATA_STATE.data = null;
      return null;
    });
    return NAV_DATA_STATE.promise;
  }

  var url = new URL(prefix + 'assets/nav-data.json', window.location.href);
  NAV_DATA_STATE.promise = fetch(url.href)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(resolveNavData)
    .catch(function () {
      return loadNavDataViaScript(prefix).catch(function () {
        NAV_DATA_STATE.data = null;
        return null;
      });
    });

  return NAV_DATA_STATE.promise;
}
