/* ============================================
   Коммуналка — служебный скрипт (sw.js)
   Сохраняет файлы приложения на устройстве,
   чтобы оно открывалось без интернета.
   ============================================ */
'use strict';

// Версия кэша. МЕНЯТЬ при обновлении файлов приложения
// (index.html, style.css, *.js, иконок): kommynalka-v2 → kommynalka-v3.
const CACHE = 'kommynalka-v2';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './data.js',
  './logic.js',
  './ui.js',
  './app.js',
  './zip.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Установка: скачать и спрятать в кэш все файлы приложения.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Активация: убрать кэши прошлых версий.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Ответ на запросы: сначала из кэша, в фоне обновляем из сети
// (stale-while-revalidate). Нет интернета — работает из кэша.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req)
        .then(resp => {
          // Обновляем кэш только ответами нашего сайта
          if (resp && resp.ok &&
              new URL(req.url).origin === self.location.origin) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => {
          // Сети нет: отдаём из кэша; для страниц — index.html
          return hit || caches.match('./index.html');
        });
      return hit || net;
    })
  );
});
