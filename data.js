/* ============================================
   Коммуналка — «Кладовая» (data.js)
   Хранит все данные приложения на устройстве,
   в памяти браузера. Без интернета и серверов.
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
      tariffs: {},               // действующие тарифы по услугам (этап 2)
      residents: {               // количество жильцов по адресам
        'Рабочая 23': 1,
        'Рабочая 23А': 4
      },
      prefs: {                   // настройки интерфейса
        launches: 0              // счётчик запусков (проверка хранилища)
      }
    };
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

  return {
    init, persist, uid, isHealthy,
    get state() { return state; }
  };
})();
