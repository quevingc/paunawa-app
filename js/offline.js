/**
 * offline.js
 * Stores reports submitted while offline in IndexedDB, then syncs them
 * to the backend automatically once the browser regains connectivity.
 */

const OfflineQueue = {
  db: null,

  async open() {
    if (OfflineQueue.db) return OfflineQueue.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.OFFLINE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CONFIG.OFFLINE_STORE_NAME)) {
          db.createObjectStore(CONFIG.OFFLINE_STORE_NAME, { keyPath: "localId" });
        }
      };
      req.onsuccess = () => {
        OfflineQueue.db = req.result;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async add(report) {
    const db = await OfflineQueue.open();
    const localId = Utils.generateId("OFFLINE");
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONFIG.OFFLINE_STORE_NAME, "readwrite");
      tx.objectStore(CONFIG.OFFLINE_STORE_NAME).add({ localId, report, queuedAt: Utils.nowISO() });
      tx.oncomplete = () => resolve(localId);
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAll() {
    const db = await OfflineQueue.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONFIG.OFFLINE_STORE_NAME, "readonly");
      const req = tx.objectStore(CONFIG.OFFLINE_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async remove(localId) {
    const db = await OfflineQueue.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONFIG.OFFLINE_STORE_NAME, "readwrite");
      tx.objectStore(CONFIG.OFFLINE_STORE_NAME).delete(localId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async count() {
    const all = await OfflineQueue.getAll();
    return all.length;
  },

  /** Attempt to push all queued reports to the server. Returns { synced, failed } */
  async sync() {
    if (!navigator.onLine) return { synced: 0, failed: 0 };
    const pending = await OfflineQueue.getAll();
    let synced = 0;
    let failed = 0;
    for (const item of pending) {
      try {
        await Api.createReport(item.report);
        await OfflineQueue.remove(item.localId);
        synced++;
      } catch (e) {
        console.warn("Offline sync failed for", item.localId, e);
        failed++;
      }
    }
    return { synced, failed };
  },

  /** Wire up automatic sync on reconnect + periodic retry */
  init(onSyncComplete) {
    window.addEventListener("online", async () => {
      const result = await OfflineQueue.sync();
      if (onSyncComplete) onSyncComplete(result);
    });
    // Retry every 60s in case 'online' event is unreliable on some devices
    setInterval(async () => {
      if (navigator.onLine) {
        const count = await OfflineQueue.count();
        if (count > 0) {
          const result = await OfflineQueue.sync();
          if (onSyncComplete && result.synced > 0) onSyncComplete(result);
        }
      }
    }, 60000);
  },
};
