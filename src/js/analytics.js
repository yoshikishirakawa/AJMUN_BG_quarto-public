/**
 * Optional analytics bootstrap.
 *
 * Analytics are disabled by default. To enable them, define
 * `window.AJMUN_ANALYTICS_CONFIG = { enabled: true, firebaseConfig: {...} }`
 * before this script loads.
 */

import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent, setUserId } from 'firebase/analytics';

const runtimeConfig = window.AJMUN_ANALYTICS_CONFIG || {};
const analyticsEnabled = runtimeConfig.enabled === true && runtimeConfig.firebaseConfig;

let app;
let analytics;
let isOnline = navigator.onLine;
let anonymousId = null;
const QUEUE_KEY = 'ajmun_analytics_queue';
const FLUSH_INTERVAL = 10000;
const HEARTBEAT_RATE = 30000;
let heartbeatInterval;

function getAnonymousId() {
    let id = localStorage.getItem('ajmun_anonymous_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('ajmun_anonymous_id', id);
    }
    return id;
}

function getQueue() {
    try {
        const q = localStorage.getItem(QUEUE_KEY);
        return q ? JSON.parse(q) : [];
    } catch (e) {
        console.error('Analytics: Error reading queue', e);
        return [];
    }
}

function saveQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function addToQueue(eventName, params) {
    const queue = getQueue();
    queue.push({
        eventName,
        params: {
            ...params,
            timestamp: Date.now(),
            anonymous_id: anonymousId,
            page_location: window.location.href,
            page_title: document.title,
        },
    });
    saveQueue(queue);
    if (isOnline) {
        flushQueue();
    }
}

function flushQueue() {
    if (!analytics || !navigator.onLine) {
        isOnline = navigator.onLine;
        return;
    }

    const queue = getQueue();
    if (!queue.length) return;

    for (const event of queue) {
        try {
            logEvent(analytics, event.eventName, event.params);
        } catch (e) {
            console.error('Analytics: Error logging event', e);
        }
    }
    saveQueue([]);
}

function trackPageView() {
    const params = {
        page_path: window.location.pathname,
        offline_mode: !navigator.onLine,
    };
    if (analytics) {
        logEvent(analytics, 'page_view', params);
    } else {
        addToQueue('page_view', params);
    }
}

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (document.visibilityState !== 'visible' || !analytics) return;
        logEvent(analytics, 'heartbeat', {
            page_path: window.location.pathname,
            duration_ms: HEARTBEAT_RATE,
        });
    }, HEARTBEAT_RATE);
}

function initAnalytics() {
    anonymousId = getAnonymousId();
    if (!analyticsEnabled) {
        console.info('Analytics: disabled');
        return;
    }

    try {
        app = initializeApp(runtimeConfig.firebaseConfig);
        analytics = getAnalytics(app);
        setUserId(analytics, anonymousId);

        isOnline = navigator.onLine;
        window.addEventListener('online', () => {
            isOnline = true;
            flushQueue();
        });
        window.addEventListener('offline', () => {
            isOnline = false;
        });

        trackPageView();
        startHeartbeat();
        setInterval(flushQueue, FLUSH_INTERVAL);
        console.info('Analytics: initialized');
    } catch (e) {
        console.error('Analytics: init failed', e);
    }
}

initAnalytics();
