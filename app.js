(() => {
  'use strict';

  const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'witr'];
  const STEP = 1;

  let counts = {};
  let currentIndex = 0;
  let lastAction = null;
  let sessionActive = false;
  let sessionStart = null;
  let sessionCounts = {};
  let sessionInterval = null;
  let saving = false;
  let editingPrayer = null;

  const $ = (id) => document.getElementById(id);
  const saveIndicator = $('save-indicator');
  const totalEl = $('total-remaining');
  const prayerName = $('prayer-name');
  const prayerCount = $('prayer-count');
  const prayerInput = $('prayer-input');
  const editBtn = $('edit-btn');
  const prayerProgress = $('prayer-progress');
  const prayerDone = $('prayer-done');
  const prayerButtons = $('prayer-buttons');
  const arrowLeft = $('arrow-left');
  const arrowRight = $('arrow-right');
  const dotsContainer = $('dots');
  const undoBar = $('undo-bar');
  const undoText = $('undo-text');
  const undoBtn = $('undo-btn');
  const sessionControls = $('session-controls');
  const sessionTimer = $('session-timer');
  const sessionCountEl = $('session-count');
  const sessionToggle = $('session-toggle');
  const sessionList = $('session-list');
  const clearHistoryBtn = $('clear-history');
  const exportBtn = $('export-btn');
  const importTrigger = $('import-trigger');
  const importFile = $('import-file');
  const resetGrid = $('reset-grid');
  const saveCountsBtn = $('save-counts-btn');
  const resetAllBtn = $('reset-all-btn');
  const overlay = $('overlay');
  const dialogTitle = $('dialog-title');
  const dialogMessage = $('dialog-message');
  const dialogCancel = $('dialog-cancel');
  const dialogConfirm = $('dialog-confirm');

  // --- Save indicator ---
  let saveTimeout = null;
  function showSaved() {
    saveIndicator.textContent = '\u2713 Saved';
    saveIndicator.className = 'saved';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { saveIndicator.className = ''; }, 1000);
  }

  function showSaveError() {
    saveIndicator.textContent = 'Save failed';
    saveIndicator.className = 'error';
  }

  // --- Confirm dialog ---
  let dialogResolve = null;
  function confirm(title, message, danger) {
    dialogTitle.textContent = title;
    dialogMessage.textContent = message;
    dialogConfirm.className = danger ? 'dialog-confirm danger' : 'dialog-confirm';
    overlay.classList.add('visible');
    return new Promise((resolve) => { dialogResolve = resolve; });
  }

  dialogCancel.addEventListener('click', () => {
    overlay.classList.remove('visible');
    if (dialogResolve) dialogResolve(false);
  });
  dialogConfirm.addEventListener('click', () => {
    overlay.classList.remove('visible');
    if (dialogResolve) dialogResolve(true);
  });

  // --- Navigation ---
  document.querySelectorAll('nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
      document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
      $('screen-' + screen).classList.add('active');
      btn.classList.add('active');
      if (screen === 'history') loadHistory();
      if (screen === 'settings') loadSettingsGrid();
    });
  });

  // --- Carousel navigation ---
  function buildDots() {
    dotsContainer.innerHTML = '';
    PRAYERS.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'dot' + (i === currentIndex ? ' active' : '');
      dot.addEventListener('click', () => goTo(i));
      dotsContainer.appendChild(dot);
    });
  }

  function goTo(index) {
    if (editingPrayer !== null) cancelEdit();
    currentIndex = Math.max(0, Math.min(PRAYERS.length - 1, index));
    renderCurrent();
  }

  arrowLeft.addEventListener('click', () => goTo(currentIndex - 1));
  arrowRight.addEventListener('click', () => goTo(currentIndex + 1));

  // Swipe support
  let touchStartX = 0;
  const carousel = document.querySelector('.carousel');
  carousel.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      goTo(currentIndex + (dx < 0 ? 1 : -1));
    }
  }, { passive: true });

  // --- Render current prayer ---
  function renderCurrent() {
    const prayer = PRAYERS[currentIndex];
    const val = Math.max(0, counts[prayer] || 0);
    const initial = DB.INITIAL_COUNTS[prayer];

    prayerName.textContent = prayer;
    prayerCount.textContent = val.toLocaleString();

    const pct = initial > 0 ? Math.max(0, Math.min(100, ((initial - val) / initial) * 100)) : 100;
    prayerProgress.style.width = pct + '%';

    if (val <= 0) {
      prayerDone.style.display = 'block';
      btnMinus.disabled = true;
    } else {
      prayerDone.style.display = 'none';
      btnMinus.disabled = false;
    }

    // Update dots
    dotsContainer.querySelectorAll('.dot').forEach((d, i) => {
      d.classList.toggle('active', i === currentIndex);
    });

    // Arrow visibility
    arrowLeft.style.visibility = currentIndex === 0 ? 'hidden' : 'visible';
    arrowRight.style.visibility = currentIndex === PRAYERS.length - 1 ? 'hidden' : 'visible';
  }

  function updateTotal() {
    const total = PRAYERS.reduce((s, p) => s + Math.max(0, counts[p] || 0), 0);
    totalEl.textContent = total.toLocaleString() + ' remaining';
  }

  // --- Plus / Minus buttons ---
  const btnMinus = $('btn-minus');
  const btnPlus = $('btn-plus');

  btnMinus.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleDecrement(PRAYERS[currentIndex], 1);
  });

  btnPlus.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleIncrement(PRAYERS[currentIndex], 1);
  });

  async function handleDecrement(prayer, amount) {
    if (saving) return;
    const current = counts[prayer] || 0;
    if (current <= 0 || amount > current) return;

    const newVal = current - amount;
    counts[prayer] = newVal;

    requestAnimationFrame(() => {
      renderCurrent();
      updateTotal();
    });

    lastAction = { prayer, amount, timestamp: Date.now() };
    undoText.textContent = `${prayer} -${amount}`;
    undoBar.classList.add('visible');

    if (sessionActive) {
      sessionCounts[prayer] = (sessionCounts[prayer] || 0) + amount;
      updateSessionCount();
    }

    saving = true;
    try {
      await DB.updateCount(prayer, newVal);
      showSaved();
      checkAutoBackup();
    } catch (e) {
      console.error('Save failed:', e);
      showSaveError();
      counts[prayer] = current;
      renderCurrent();
      updateTotal();
      if (sessionActive) {
        sessionCounts[prayer] = (sessionCounts[prayer] || 0) - amount;
        updateSessionCount();
      }
      lastAction = null;
      undoBar.classList.remove('visible');
    }
    saving = false;
  }

  // --- Increment ---
  async function handleIncrement(prayer, amount) {
    if (saving) return;
    const current = counts[prayer] || 0;
    const newVal = current + amount;
    counts[prayer] = newVal;

    requestAnimationFrame(() => {
      renderCurrent();
      updateTotal();
    });

    lastAction = { prayer, amount: -amount, timestamp: Date.now() };
    undoText.textContent = `${prayer} +${amount}`;
    undoBar.classList.add('visible');

    saving = true;
    try {
      await DB.updateCount(prayer, newVal);
      showSaved();
      checkAutoBackup();
    } catch (e) {
      console.error('Save failed:', e);
      showSaveError();
      counts[prayer] = current;
      renderCurrent();
      updateTotal();
      lastAction = null;
      undoBar.classList.remove('visible');
    }
    saving = false;
  }

  // --- Inline edit ---
  editBtn.addEventListener('click', () => enterEdit());

  function enterEdit() {
    editingPrayer = PRAYERS[currentIndex];
    prayerCount.style.display = 'none';
    editBtn.style.display = 'none';
    prayerInput.style.display = 'block';
    prayerInput.value = counts[editingPrayer] || 0;
    prayerInput.focus();
    prayerInput.select();
  }

  function cancelEdit() {
    editingPrayer = null;
    prayerInput.style.display = 'none';
    prayerCount.style.display = '';
    editBtn.style.display = '';
  }

  async function commitEdit() {
    if (editingPrayer === null) return;
    const prayer = editingPrayer;
    const raw = prayerInput.value.trim();

    if (raw === '' || isNaN(raw)) { cancelEdit(); return; }

    const newVal = Math.max(0, Math.floor(Number(raw)));
    const oldVal = counts[prayer] || 0;

    if (newVal === oldVal) { cancelEdit(); return; }

    counts[prayer] = newVal;
    cancelEdit();
    renderCurrent();
    updateTotal();

    saving = true;
    try {
      await DB.updateCount(prayer, newVal);
      showSaved();
    } catch (e) {
      console.error('Edit save failed:', e);
      showSaveError();
      counts[prayer] = oldVal;
      renderCurrent();
      updateTotal();
    }
    saving = false;
  }

  prayerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });
  prayerInput.addEventListener('blur', () => commitEdit());

  // --- Undo ---
  undoBtn.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    if (!lastAction || saving) return;
    const { prayer, amount } = lastAction;
    const newVal = (counts[prayer] || 0) + amount;
    counts[prayer] = newVal;

    renderCurrent();
    updateTotal();

    if (sessionActive) {
      sessionCounts[prayer] = Math.max(0, (sessionCounts[prayer] || 0) - amount);
      updateSessionCount();
    }

    saving = true;
    try {
      await DB.updateCount(prayer, newVal);
      showSaved();
    } catch (e) {
      console.error('Undo save failed:', e);
      showSaveError();
    }
    saving = false;
    lastAction = null;
    undoBar.classList.remove('visible');
  });

  // --- Session ---
  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const ss = String(s % 60).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function updateSessionTimer() {
    if (!sessionActive) return;
    sessionTimer.textContent = formatDuration(Date.now() - sessionStart);
  }

  function updateSessionCount() {
    const total = Object.values(sessionCounts).reduce((s, v) => s + v, 0);
    sessionCountEl.textContent = total > 0 ? `${total} completed` : '';
  }

  function startSession() {
    sessionActive = true;
    sessionStart = Date.now();
    sessionCounts = {};
    sessionControls.classList.add('in-session');
    sessionToggle.textContent = 'End Session';
    sessionToggle.classList.add('end');
    sessionTimer.textContent = '00:00';
    sessionCountEl.textContent = '';
    sessionInterval = setInterval(updateSessionTimer, 1000);
  }

  async function endSession() {
    clearInterval(sessionInterval);
    const elapsed = Date.now() - sessionStart;
    const total = Object.values(sessionCounts).reduce((s, v) => s + v, 0);

    if (total > 0) {
      try {
        await DB.addSession({
          date: new Date(sessionStart).toISOString(),
          duration: elapsed,
          counts: { ...sessionCounts },
          total,
        });
      } catch (e) {
        console.error('Failed to save session:', e);
      }
    }

    sessionActive = false;
    sessionStart = null;
    sessionCounts = {};
    sessionControls.classList.remove('in-session');
    sessionToggle.textContent = 'Start Session';
    sessionToggle.classList.remove('end');
    sessionTimer.textContent = '00:00';
    sessionCountEl.textContent = '';
    loadHistory();
  }

  sessionToggle.addEventListener('click', () => {
    sessionActive ? endSession() : startSession();
  });

  // --- History ---
  async function loadHistory() {
    try {
      const sessions = await DB.getSessions();
      if (sessions.length === 0) {
        sessionList.innerHTML = '<div class="no-sessions">No sessions yet.</div>';
        return;
      }
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      sessionList.innerHTML = sessions.map((s) => {
        const d = new Date(s.date);
        const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const dur = formatDuration(s.duration);
        const breakdown = Object.entries(s.counts || {})
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `<span>${k}: ${v}</span>`)
          .join('');
        return `<div class="session-card">
          <div class="session-date">${dateStr}</div>
          <div class="session-stats">
            <span class="session-total">${s.total} prayers</span>
            <span class="session-duration">${dur}</span>
          </div>
          ${breakdown ? `<div class="session-breakdown">${breakdown}</div>` : ''}
        </div>`;
      }).join('');
    } catch (e) {
      sessionList.innerHTML = '<div class="no-sessions">Error loading sessions.</div>';
    }
  }

  clearHistoryBtn.addEventListener('click', async () => {
    const ok = await confirm('Clear History', 'Delete all session history? This cannot be undone.', true);
    if (!ok) return;
    try { await DB.clearSessions(); loadHistory(); } catch (e) { console.error(e); }
  });

  // --- Settings ---
  function loadSettingsGrid() {
    resetGrid.innerHTML = PRAYERS.map((p) => `
      <label>${p}<input type="number" id="set-${p}" value="${counts[p] || 0}" min="0" inputmode="numeric"></label>
    `).join('');
  }

  saveCountsBtn.addEventListener('click', async () => {
    const ok = await confirm('Update Counts', 'Overwrite all prayer counts with the values entered?', false);
    if (!ok) return;
    for (const p of PRAYERS) {
      const input = $('set-' + p);
      if (!input) continue;
      const val = Math.max(0, parseInt(input.value) || 0);
      counts[p] = val;
      try { await DB.updateCount(p, val); } catch (e) { showSaveError(); return; }
    }
    renderCurrent();
    updateTotal();
    showSaved();
  });

  resetAllBtn.addEventListener('click', async () => {
    const ok = await confirm('Reset All', 'Reset all counts to initial values? This cannot be undone.', true);
    if (!ok) return;
    for (const p of PRAYERS) {
      counts[p] = DB.INITIAL_COUNTS[p];
      try { await DB.updateCount(p, counts[p]); } catch (e) { showSaveError(); return; }
    }
    renderCurrent();
    updateTotal();
    loadSettingsGrid();
    showSaved();
  });

  // --- Backup/Restore ---
  exportBtn.addEventListener('click', async () => {
    try {
      const data = await DB.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qada-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed.');
    }
  });

  importTrigger.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.counts) throw new Error('Invalid backup file');
      const ok = await confirm('Import Backup', `Restore from "${file.name}"? This will overwrite all current data.`, true);
      if (!ok) { importFile.value = ''; return; }
      await DB.importAll(data);
      counts = await DB.getCounts();
      renderCurrent();
      updateTotal();
      loadSettingsGrid();
      showSaved();
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed: ' + err.message);
    }
    importFile.value = '';
  });

  // --- Auto-backup to localStorage ---
  const BACKUP_KEY = 'qada-auto-backup';
  const BACKUP_EVERY_TAPS = 20;
  const BACKUP_EVERY_MS = 20 * 60 * 1000; // 20 minutes
  let tapsSinceBackup = 0;

  function autoBackup() {
    try {
      const data = JSON.stringify({ counts, backedUpAt: new Date().toISOString() });
      localStorage.setItem(BACKUP_KEY, data);
      tapsSinceBackup = 0;
      showBackedUp();
    } catch (e) {
      console.warn('Auto-backup failed:', e);
    }
  }

  let backupTimeout = null;
  function showBackedUp() {
    saveIndicator.textContent = '\u2601 Backed up';
    saveIndicator.className = 'backed-up';
    clearTimeout(backupTimeout);
    backupTimeout = setTimeout(() => { saveIndicator.className = ''; }, 2000);
  }

  function checkAutoBackup() {
    tapsSinceBackup++;
    if (tapsSinceBackup >= BACKUP_EVERY_TAPS) {
      autoBackup();
    }
  }

  // Timer-based backup every 20 minutes
  setInterval(autoBackup, BACKUP_EVERY_MS);

  // Restore from localStorage if IndexedDB is empty (got wiped)
  async function tryRestoreFromBackup() {
    const total = PRAYERS.reduce((s, p) => s + (counts[p] || 0), 0);
    if (total > 0) return; // IndexedDB has data, no need to restore

    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return;

    try {
      const backup = JSON.parse(raw);
      if (!backup.counts) return;

      // Check backup actually has data
      const backupTotal = PRAYERS.reduce((s, p) => s + (backup.counts[p] || 0), 0);
      if (backupTotal === 0) return;

      // Restore
      counts = backup.counts;
      for (const p of PRAYERS) {
        await DB.updateCount(p, counts[p] || 0);
      }
      console.log('Restored from auto-backup dated', backup.backedUpAt);
    } catch (e) {
      console.warn('Auto-restore failed:', e);
    }
  }

  // --- Service Worker ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  // --- Init ---
  async function init() {
    try {
      await DB.init();
      counts = await DB.getCounts();
      await tryRestoreFromBackup();
      autoBackup(); // initial backup on load
      buildDots();
      renderCurrent();
      updateTotal();
    } catch (e) {
      console.error('Init failed:', e);
      totalEl.textContent = 'Error';
    }
  }

  init();
})();
