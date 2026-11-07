/* ============================================
   Коммуналка — «Кладовая» (data.js)
   Хранит все данные приложения на устройстве
   и отвечает за записи учёта.
   ============================================ */
'use strict';

const Data = (() => {

  const KEY = 'kommynalka.v1';   // имя «ящика» с данными

  let state = null;              // все данные приложения
  let healthy = true;            // работает ли хранилище

  // Свежая пустая база
  function emptyState() {
    return {
      schema: 1,
      records: [],               // все записи учёта
      archives: {},              // архив по годам: { '2025': [записи] }
      tariffs: {},               // действующие тарифы по услугам
      residents: {               // количество жильцов по адресам
        'Рабочая 23': 1,
        'Рабочая 23А': 4
      },
      prefs: {
        launches: 0              // счётчик запусков (проверка хранилища)
      }
    };
  }

  // Услуги, которые автоматически ведутся по одному адресу
  const FIXED_ADDR = {
    'Телевидение': 'Рабочая 23',
    'Интернет': 'Рабочая 23А',
    'Налоги': 'Рабочая 23А'
  };

  // Привести базу в порядок: добавить архив, привязать адреса услуг.
  // Вызывается при каждом запуске, исправляет только то, что нужно.
  function normalize() {
    let changed = false;
    if (!state.archives) { state.archives = {}; changed = true; }
    const fix = r => {
      const a = FIXED_ADDR[r.service];
      if (a && !r.address) { r.address = a; changed = true; }
    };
    state.records.forEach(fix);
    Object.keys(state.archives).forEach(y => (state.archives[y] || []).forEach(fix));
    if (changed) persist();
  }

  // Прочитать базу с устройства (или создать новую)
  function init() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        state = Object.assign(emptyState(), JSON.parse(raw));
      } else {
        state = emptyState();
        persist();
      }
    } catch (e) {
      console.error('Не удалось прочитать данные.', e);
      healthy = false;
      state = emptyState();
    }
    normalize();
    return state;
  }

  // Записать базу на устройство
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      healthy = true;
      return true;
    } catch (e) {
      console.error('Не удалось сохранить данные.', e);
      healthy = false;
      return false;
    }
  }

  // Уникальный номер для новых записей
  function uid() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function isHealthy() { return healthy; }

  // ---------- Записи ----------

  // Найти запись по уникальному ключу: услуга + адрес + подпункт + период
  function findRecord(service, address, subservice, year, month) {
    return state.records.find(r =>
      r.service === service &&
      (r.address || null) === (address || null) &&
      (r.subservice || null) === (subservice || null) &&
      r.period_year === year &&
      (r.period_month || null) === (month || null)) || null;
  }

  // Добавить или обновить запись
  function upsertRecord(record) {
    const i = state.records.findIndex(r => r.id === record.id);
    if (i >= 0) state.records[i] = record;
    else state.records.push(record);
    persist();
    return record;
  }

  // Удалить запись
  function removeRecord(id) {
    state.records = state.records.filter(r => r.id !== id);
    persist();
  }

  // ---------- Архив ----------

  // Граница автоархивации: сегодня минус один год (ГГГГ-ММ-ДД)
  function archiveCutoff() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // Год архива для записи: по дате оплаты, иначе по периоду
  function yearOf(r) {
    const y = String(r.payment_date || '').slice(0, 4);
    if (/^\d{4}$/.test(y)) return y;
    if (r.period_year) return String(r.period_year);
    return 'без года';
  }

  // Автоархивация: записи с датой оплаты старше 1 года — в архив своего года.
  // Возвращает количество перемещённых записей.
  function autoArchive() {
    const cutoff = archiveCutoff();
    const toMove = state.records.filter(r => r.payment_date && r.payment_date < cutoff);
    if (!toMove.length) return 0;
    toMove.forEach(r => {
      const y = yearOf(r);
      if (!state.archives[y]) state.archives[y] = [];
      state.archives[y].push(r);
    });
    const ids = new Set(toMove.map(r => r.id));
    state.records = state.records.filter(r => !ids.has(r.id));
    persist();
    return toMove.length;
  }

  // Переместить выбранные записи (по id) в архив своего года
  function archiveRecords(ids) {
    const set = new Set(ids || []);
    const moved = [];
    state.records = state.records.filter(r => {
      if (set.has(r.id)) { moved.push(r); return false; }
      return true;
    });
    moved.forEach(r => {
      const y = yearOf(r);
      if (!state.archives[y]) state.archives[y] = [];
      state.archives[y].push(r);
    });
    persist();
    return moved.length;
  }

  // Вернуть записи из архива в историю (по id).
  // Год, который опустел, удаляется.
  function restoreRecords(ids) {
    const set = new Set(ids || []);
    Object.keys(state.archives).forEach(y => {
      const back = [], keep = [];
      state.archives[y].forEach(r => (set.has(r.id) ? back : keep).push(r));
      if (back.length) {
        state.records.push(...back);
        state.archives[y] = keep;
      }
    });
    Object.keys(state.archives).forEach(y => {
      if (!state.archives[y].length) delete state.archives[y];
    });
    persist();
  }

  // Добавить записи из файла в архив своего года.
  // Совпадение по уникальному ключу — остаётся более свежая запись.
  function addArchived(records) {
    let n = 0;
    (records || []).forEach(rec => {
      if (!rec || !rec.service) return;
      const rec2 = Object.assign({}, rec);
      if (!rec2.id) rec2.id = uid();
      if (!rec2.technical_date) rec2.technical_date = new Date().toISOString();
      const y = yearOf(rec2);
      if (!state.archives[y]) state.archives[y] = [];
      const twin = state.archives[y].find(r =>
        r.service === rec2.service &&
        (r.address || null) === (rec2.address || null) &&
        (r.subservice || null) === (rec2.subservice || null) &&
        r.period_year === rec2.period_year &&
        (r.period_month || null) === (rec2.period_month || null));
      if (!twin) { state.archives[y].push(rec2); n++; }
      else if (String(rec2.technical_date || '') > String(twin.technical_date || '')) {
        Object.assign(twin, rec2);
        n++;
      }
    });
    persist();
    return n;
  }

  return {
    init, persist, uid, isHealthy,
    findRecord, upsertRecord, removeRecord,
    autoArchive, archiveRecords, restoreRecords, addArchived,
    get state() { return state; }
  };
})();
