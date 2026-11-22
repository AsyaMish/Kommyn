/* ============================================
   Коммуналка — «Облако» (dropbox.js)
   Синхронизация базы с Dropbox без сервера:
   вход через OAuth2 (PKCE), один файл-копия
   в Dropbox, автосохранение при изменениях.
   ============================================ */
'use strict';

const DBX = (() => {

  const LS_KEY = 'kommynalka.dropbox';    // «ящик» с настройками подключения
  const FILE_PATH = '/kommynalka.json';   // файл-копия в Dropbox
  const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
  const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
  const RPC_URL = 'https://api.dropboxapi.com/2/';
  const CONTENT_URL = 'https://content.dropboxapi.com/2/';
  const TOLERANCE = 15000;   // разница часов устройств, которую не считаем «свежестью»
  const PUSH_DELAY = 3000;   // пауза автосохранения после последнего изменения

  let cfg = {
    appKey: '',            // App Key приложения Dropbox
    accessToken: '',       // ключ доступа (живёт ~4 часа, обновляем сами)
    refreshToken: '',      // долгий ключ — им обновляем доступ
    expiresAt: 0,          // когда истекает ключ доступа
    account: null,         // { email, name } — чей Dropbox
    autoSync: true,        // автосохранение при изменениях
    lastPush: null,        // { time, records } — последняя отправка
    seenRemote: ''         // копия в Dropbox, которую это устройство уже видело
  };
  let justConnected = false;
  let initError = '';
  let pushTimer = null;
  let pushBusy = false;

  // ----- Хранение настроек подключения -----

  function loadCfg() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      cfg.appKey = o.appKey || '';
      cfg.accessToken = o.accessToken || '';
      cfg.refreshToken = o.refreshToken || '';
      cfg.expiresAt = o.expiresAt || 0;
      cfg.account = o.account || null;
      cfg.autoSync = o.autoSync !== false;
      cfg.lastPush = o.lastPush || null;
      cfg.seenRemote = o.seenRemote || '';
    } catch (e) {
      console.warn('Не удалось прочитать настройки Dropbox.', e);
    }
  }

  function saveCfg() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    } catch (e) {
      console.warn('Не удалось сохранить настройки Dropbox.', e);
    }
  }

  function connected() {
    return !!(cfg.refreshToken && cfg.appKey);
  }

  // ----- OAuth2: вход без сервера, по ключу приложения (PKCE) -----

  // Кодировщик base64url (для PKCE)
  function b64url(bytes) {
    let s = '';
    bytes.forEach(b => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Пара «проверочная фраза — её отпечаток» для безопасного входа
  async function pkcePair() {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const verifier = b64url(raw);
    const digest = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(verifier));
    return { verifier: verifier, challenge: b64url(new Uint8Array(digest)) };
  }

  // Адрес, на который Dropbox вернёт ответ, — сам сайт приложения
  function redirectUri() {
    return location.origin + location.pathname;
  }

  // Ссылка на страницу Dropbox «Разрешить доступ»
  function authUrl(challenge) {
    const u = new URL(AUTH_URL);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', cfg.appKey);
    u.searchParams.set('redirect_uri', redirectUri());
    u.searchParams.set('code_challenge', challenge);
    u.searchParams.set('code_challenge_method', 'S256');
    u.searchParams.set('token_access_type', 'offline');
    return u.toString();
  }

  // Уйти на страницу Dropbox: там «Разрешить», потом возврат сюда
  async function connect() {
    if (!cfg.appKey) throw new Error('сначала вставьте App Key');
    const pair = await pkcePair();
    sessionStorage.setItem('kommynalka.dbx.verifier', pair.verifier);
    saveCfg();
    location.assign(authUrl(pair.challenge));
  }

  // Получить ключи по коду согласия (или обновить по долгому ключу)
  async function tokenRequest(params) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.access_token) {
      const d = (j && (j.error_description || j.error)) || 'код ' + res.status;
      throw new Error('не выдан ключ доступа (' + d + ')');
    }
    cfg.accessToken = j.access_token;
    if (j.refresh_token) cfg.refreshToken = j.refresh_token;
    cfg.expiresAt = Date.now() + (j.expires_in || 14400) * 1000;
    saveCfg();
  }

  // Возврат с Dropbox: в адресе страницы код согласия → обмен на ключи
  async function handleRedirect() {
    const p = new URLSearchParams(location.search);
    const code = p.get('code');
    const errDesc = p.get('error_description');
    if (!code && !errDesc) return false;
    // Сразу убрать код из адреса, чтобы он не остался в истории браузера
    if (history.replaceState) history.replaceState(null, '', location.pathname);
    if (errDesc) throw new Error('Dropbox отказал: ' + errDesc);
    const verifier = sessionStorage.getItem('kommynalka.dbx.verifier') || '';
    sessionStorage.removeItem('kommynalka.dbx.verifier');
    await tokenRequest({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri(),
      client_id: cfg.appKey,
      code_verifier: verifier
    });
    await loadAccount();
    justConnected = true;
    return true;
  }

  // Узнать, чей Dropbox подключён
  async function loadAccount() {
    try {
      const j = await rpc('users/get_current_account', {});
      cfg.account = {
        email: j.email || '',
        name: (j.name && j.name.display_name) || ''
      };
      saveCfg();
    } catch (e) { /* не критично: имя можно узнать позже */ }
  }

  // Обновить ключ доступа, если истекает
  async function ensureToken() {
    if (!cfg.refreshToken) throw new Error('Dropbox не подключён');
    if (cfg.accessToken && Date.now() < cfg.expiresAt - 60000) return;
    await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: cfg.refreshToken,
      client_id: cfg.appKey
    });
  }

  // ----- Запросы к Dropbox -----

  // Понятная ошибка из ответа Dropbox
  function apiError(res, text) {
    let summary = '';
    try {
      const j = JSON.parse(text);
      summary = j.error_summary || (j.error && j.error.message) || '';
    } catch (e) { /* нет текста — останется только статус */ }
    const err = new Error(
      (res.status === 401 || /invalid_access_token/.test(summary))
        ? 'подключение устарело — отключите Dropbox и подключите заново'
        : (summary || 'ошибка (код ' + res.status + ')'));
    err.status = res.status;
    return err;
  }

  // Обычный запрос к API (POST + JSON)
  async function rpc(endpoint, arg) {
    await ensureToken();
    const res = await fetch(RPC_URL + endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfg.accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(arg || {})
    });
    if (!res.ok) throw apiError(res, await res.text().catch(() => ''));
    return res.json().catch(() => ({}));
  }

  // Записи с учётом архива
  function totalRecords(state) {
    let n = (state && state.records ? state.records.length : 0);
    const arch = (state && state.archives) || {};
    Object.keys(arch).forEach(y => { n += (arch[y] || []).length; });
    return n;
  }

  // Отправить текущую базу в Dropbox (перезаписать файл-копию)
  async function push() {
    if (!connected()) throw new Error('Dropbox не подключён');
    await ensureToken();
    const state = Data.state;
    const res = await fetch(CONTENT_URL + 'files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfg.accessToken,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: FILE_PATH,
          mode: { '.tag': 'overwrite' },
          mute: true
        })
      },
      body: JSON.stringify(state)
    });
    if (!res.ok) throw apiError(res, await res.text().catch(() => ''));
    cfg.lastPush = {
      time: new Date().toISOString(),
      records: totalRecords(state)
    };
    cfg.seenRemote = (state && state.updated) || cfg.lastPush.time;
    saveCfg();
    return cfg.lastPush;
  }

  // Скачать копию из Dropbox. null — файла ещё нет.
  async function pull() {
    if (!connected()) throw new Error('Dropbox не подключён');
    await ensureToken();
    const res = await fetch(CONTENT_URL + 'files/download', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfg.accessToken,
        'Dropbox-API-Arg': JSON.stringify({ path: FILE_PATH })
      }
    });
    if (res.status === 409) return null;   // файла ещё нет
    if (!res.ok) throw apiError(res, await res.text().catch(() => ''));
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('копия в Dropbox повреждена');
    }
  }

  // Сведения о файле-копии. null — файла нет.
  async function remoteInfo() {
    try {
      return await rpc('files/get_metadata', { path: FILE_PATH });
    } catch (e) {
      if (e.status === 409) return null;
      throw e;
    }
  }

  // ----- Автосохранение при изменениях -----

  function scheduleAutoPush() {
    if (!connected() || !cfg.autoSync) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      if (pushBusy) return;
      pushBusy = true;
      try {
        await push();
      } catch (e) {
        console.warn('Автосохранение в Dropbox не удалось.', e);
      } finally {
        pushBusy = false;
      }
    }, PUSH_DELAY);
  }

  window.addEventListener('kommyn:persisted', scheduleAutoPush);

  // ----- Сверка копий при запуске -----

  // Возвращает: завершилось ли только что подключение, есть ли в Dropbox
  // более свежая копия, отправлена ли копия при запуске, была ли ошибка.
  async function startup() {
    await redirectDone;   // дождаться завершения обмена кода (если был возврат)
    const out = { justConnected: false, account: '', pushed: false, error: null, newer: null };
    if (initError) { out.error = initError; initError = ''; return out; }
    if (justConnected) {
      out.justConnected = true;
      justConnected = false;
      out.account = cfg.account ? (cfg.account.email || cfg.account.name) : '';
      try { await push(); } catch (e) { out.error = e.message; }
      return out;
    }
    if (!connected()) return out;
    try {
      const remote = await pull();
      if (!remote) { await push(); out.pushed = true; return out; }
      const remoteUpdated = Date.parse(remote.updated) || 0;
      const localUpdated = Date.parse(Data.state && Data.state.updated) || 0;
      if (remoteUpdated > localUpdated + TOLERANCE) {
        if (remote.updated !== cfg.seenRemote) {
          out.newer = {
            updated: remote.updated,
            records: totalRecords(remote)
          };
        }
        cfg.seenRemote = remote.updated;   // больше не спрашивать про эту копию
        saveCfg();
      } else if (localUpdated > remoteUpdated + TOLERANCE) {
        await push();                      // местные данные свежее — выкладываем
        out.pushed = true;
      }
    } catch (e) {
      out.error = e.message;
    }
    return out;
  }

  // ----- Настройки подключения -----

  function setAppKey(v) { cfg.appKey = (v || '').trim(); saveCfg(); }
  function setAutoSync(v) { cfg.autoSync = !!v; saveCfg(); }

  function disconnect() {
    clearTimeout(pushTimer);      // отменить запланированное автосохранение
    cfg.accessToken = '';
    cfg.refreshToken = '';
    cfg.expiresAt = 0;
    cfg.account = null;
    cfg.lastPush = null;
    cfg.seenRemote = '';
    saveCfg();
  }

  function status() {
    return {
      connected: connected(),
      appKey: cfg.appKey,
      account: cfg.account,
      autoSync: cfg.autoSync,
      lastPush: cfg.lastPush,
      redirectUri: redirectUri()
    };
  }

  // ----- Запуск модуля -----

  loadCfg();
  // Обмен кода согласия идёт по сети — стартовая сверка должна его дождаться
  const redirectDone = handleRedirect().catch(e => {
    console.warn('Не удалось завершить подключение Dropbox.', e);
    initError = e.message;
  });

  return {
    status, setAppKey, setAutoSync,
    connected, connect, disconnect,
    push, pull, remoteInfo, startup, authUrl
  };
})();
