const DB = (() => {
  const DB_NAME = 'qada-tracker';
  const DB_VERSION = 1;
  let db = null;

  const INITIAL_COUNTS = {
    fajr: 2815,
    dhuhr: 2624,
    asr: 2778,
    maghrib: 2785,
    isha: 2815,
    witr: 2815,
  };

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('prayers')) {
          d.createObjectStore('prayers', { keyPath: 'name' });
        }
        if (!d.objectStoreNames.contains('sessions')) {
          d.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(store, mode) {
    const t = db.transaction(store, mode);
    return t.objectStore(store);
  }

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function seed() {
    const store = tx('prayers', 'readonly');
    const count = await promisify(store.count());
    if (count === 0) {
      const ws = tx('prayers', 'readwrite');
      const promises = Object.entries(INITIAL_COUNTS).map(([name, remaining]) =>
        promisify(ws.put({ name, remaining }))
      );
      await Promise.all(promises);
    }
  }

  async function init() {
    await open();
    await seed();
  }

  async function getCounts() {
    const store = tx('prayers', 'readonly');
    const all = await promisify(store.getAll());
    const counts = {};
    for (const row of all) {
      counts[row.name] = row.remaining;
    }
    return counts;
  }

  async function updateCount(prayer, newValue) {
    const store = tx('prayers', 'readwrite');
    await promisify(store.put({ name: prayer, remaining: newValue }));
  }

  async function addSession(record) {
    const store = tx('sessions', 'readwrite');
    await promisify(store.add(record));
  }

  async function getSessions() {
    const store = tx('sessions', 'readonly');
    return promisify(store.getAll());
  }

  async function clearSessions() {
    const store = tx('sessions', 'readwrite');
    await promisify(store.clear());
  }

  async function exportAll() {
    const counts = await getCounts();
    const sessions = await getSessions();
    return { counts, sessions, exportedAt: new Date().toISOString() };
  }

  async function importAll(data) {
    // Overwrite prayers
    const ps = tx('prayers', 'readwrite');
    await promisify(ps.clear());
    const promises = Object.entries(data.counts).map(([name, remaining]) =>
      promisify(tx('prayers', 'readwrite').put({ name, remaining }))
    );
    await Promise.all(promises);

    // Overwrite sessions
    const ss = tx('sessions', 'readwrite');
    await promisify(ss.clear());
    for (const s of data.sessions || []) {
      const ws = tx('sessions', 'readwrite');
      // Remove auto-increment id so it gets a new one
      const record = { ...s };
      delete record.id;
      await promisify(ws.add(record));
    }
  }

  return { init, getCounts, updateCount, addSession, getSessions, clearSessions, exportAll, importAll, INITIAL_COUNTS };
})();
