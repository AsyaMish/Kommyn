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

  return {
    init, persist, uid, isHealthy,
    findRecord, upsertRecord, removeRecord,
    get state() { return state; }
  };
})();
