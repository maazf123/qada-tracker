# Qada Tracker PWA

Offline-first Progressive Web App to track and complete missed prayer (qada) counts.

## Features

- Track 6 prayer categories: Fajr, Dhuhr, Asr, Maghrib, Isha, Witr
- Rapid decrement buttons (-1, -5, -10, -25, -50, -100)
- Session tracking with timer and per-prayer breakdown
- Undo last action
- Backup/restore via JSON export/import
- Works fully offline via Service Worker
- Installable on iPhone via Safari "Add to Home Screen"

## Deploy

### Option 1: GitHub Pages
1. Push this folder to a GitHub repo
2. Go to Settings > Pages > Source: main branch
3. Your app will be at `https://<user>.github.io/<repo>/`

### Option 2: Any static host
Upload all files to any static hosting (Netlify, Vercel, Cloudflare Pages, etc.).

### Option 3: Local testing
```bash
# Python
python -m http.server 8000

# Node
npx serve .
```
Then open `http://localhost:8000`

## Install on iPhone
1. Open the deployed URL in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. The app will work offline as a standalone app

## Backup Warning
Safari PWAs can lose IndexedDB storage during iOS updates or storage pressure. **Export backups regularly** from the Settings tab.

## File Structure
```
index.html          — Single-page app UI
style.css           — Mobile-first styling
db.js               — IndexedDB persistence layer
app.js              — UI logic and event handling
service-worker.js   — Offline caching
manifest.json       — PWA install manifest
icons/              — App icons (192px, 512px)
```
