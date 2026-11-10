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
  // Вызывается при каждом запуске и после импорта, исправляет только то, что нужно.
  function normalize() {
    let changed = false;
    if (!state.archives) { state.archives = {}; changed = true; }
    const fix = r => {
      if (!r || r.address) return;
      // Адрес есть у каждой записи: у ТВ/Интернета/Налогов — своя привязка,
      // у остальных (счётчики, мусор) — основной дом.
      r.address = FIXED_ADDR[r.service] || 'Рабочая 23';
      changed = true;
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

  // Дата операции: дата оплаты, иначе дата показаний, иначе техническая.
  // По ней определяется «последняя операция» месяца.
  function opDate(r) {
    return String(r.payment_date || r.readings_submitted_date ||
      r.technical_date || '');
  }

  function byOpDate(a, b) {
    return opDate(a).localeCompare(opDate(b)) ||
      String(a.technical_date || '').localeCompare(String(b.technical_date || ''));
  }

  // Все записи одной «линии» (услуга + адрес + подпункт) за период.
  // За один месяц может быть несколько записей. От старых к свежим.
  function recordsFor(service, address, subservice, year, month) {
    return state.records
      .filter(r => r.service === service &&
        (r.address || null) === (address || null) &&
        (r.subservice || null) === (subservice || null) &&
        r.period_year === year &&
        (r.period_month || null) === (month || null))
      .sort(byOpDate);
  }

  // Найти запись по уникальному ключу: услуга + адрес + подпункт + период
  // (возвращает первую; для всех записей месяца есть recordsFor)
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

  // Содержимое записи без служебных полей — для поиска точных дублей.
  // За один месяц теперь может быть несколько записей, поэтому совпадение
  // ищется и по id, и по ключу + содержимому.
  const CONTENT_FIELDS = ['service', 'address', 'subservice',
    'period_year', 'period_month', 'record_type',
    'previous_readings', 'current_readings', 'tariff', 'residents_count',
    'tax_house', 'tax_land', 'tax_car',
    'debt_advance', 'debt_advance_closed',
    'fact_payment', 'payment_date', 'readings_submitted_date',
    'flag_readings_submitted', 'flag_paid', 'comment'];

  function contentSignature(r) {
    return CONTENT_FIELDS.map(f => (r[f] === undefined ? null : r[f])).join('|');
  }

  // Найти «двойника» в списке: та же запись (id) или то же содержимое
  function findTwin(list, rec) {
    if (rec.id) {
      const byId = list.find(r => r.id === rec.id);
      if (byId) return byId;
    }
    const sig = contentSignature(rec);
    return list.find(r =>
      sameKey(r, rec.service, rec.address, rec.subservice,
        rec.period_year, rec.period_month) &&
      contentSignature(r) === sig) || null;
  }

  // Добавить записи из файла в архив своего года.
  // Совпадение по id или по ключу и содержимому — дубль не добавляется.
  function addArchived(records) {
    let n = 0;
    (records || []).forEach(rec => {
      if (!rec || !rec.service) return;
      const rec2 = Object.assign({}, rec);
      if (!rec2.id) rec2.id = uid();
      if (!rec2.technical_date) rec2.technical_date = new Date().toISOString();
      const y = yearOf(rec2);
      if (!state.archives[y]) state.archives[y] = [];
      const twin = findTwin(state.archives[y], rec2);
      if (!twin) { state.archives[y].push(rec2); n++; }
      else if (twin.id === rec2.id &&
               String(rec2.technical_date || '') > String(twin.technical_date || '')) {
        Object.assign(twin, rec2);
        n++;
      }
    });
    persist();
    normalize();
    return n;
  }

  // ---------- Импорт / сброс (этап 7) ----------

  // Уникальный ключ записи — тот же, по которому ищем записи
  function sameKey(r, service, address, subservice, year, month) {
    return r.service === service &&
      (r.address || null) === (address || null) &&
      (r.subservice || null) === (subservice || null) &&
      r.period_year === year &&
      (r.period_month || null) === (month || null);
  }

  // Подготовить запись из файла: дать id и техническую дату, если их нет
  function prepareImported(rec) {
    const rec2 = Object.assign({}, rec);
    if (!rec2.id) rec2.id = uid();
    if (!rec2.technical_date) rec2.technical_date = new Date().toISOString();
    return rec2;
  }

  // Умное слияние: записи из файла добавляются к базе.
  // За месяц может быть несколько записей, поэтому совпадение ищется
  // сначала по id, затем по ключу и содержимому (точный дубль — пропуск).
  function mergeRecords(incoming) {
    let added = 0, updated = 0, skipped = 0;
    (incoming || []).forEach(rec => {
      if (!rec || !rec.service) return;
      const rec2 = prepareImported(rec);
      const twin = findTwin(state.records, rec2);
      if (!twin) { state.records.push(rec2); added++; }
      else if (twin.id === rec2.id &&
               String(rec2.technical_date || '') >
               String(twin.technical_date || '')) {
        Object.assign(twin, rec2);
        updated++;
      }
      else skipped++;
    });
    if (added || updated) persist();
    normalize();
    return { added: added, updated: updated, skipped: skipped };
  }

  // Полная замена: база целиком становится такой, как в файле.
  // Принимает и массив записей, и полную копию {records, archives, ...}.
  function replaceAll(data) {
    const fresh = emptyState();
    fresh.prefs.launches = (state.prefs && state.prefs.launches) || 0;
    const recs = Array.isArray(data) ? data : (data && data.records) || [];
    recs.forEach(rec => {
      if (!rec || !rec.service) return;
      fresh.records.push(prepareImported(rec));
    });
    if (!Array.isArray(data) && data && data.archives) {
      Object.keys(data.archives).forEach(y => {
        const list = [];
        (data.archives[y] || []).forEach(rec => {
          if (!rec || !rec.service) return;
          list.push(prepareImported(rec));
        });
        if (list.length) fresh.archives[y] = list;
      });
    }
    if (!Array.isArray(data) && data) {
      if (data.residents) fresh.residents = Object.assign(fresh.residents, data.residents);
      if (data.tariffs) fresh.tariffs = data.tariffs;
    }
    state = fresh;
    persist();
    normalize();
  }

  // Полный сброс: стереть всё и начать с чистого листа
  function resetAll() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    state = emptyState();
    state.prefs.launches = 1;
    persist();
  }

  return {
    init, persist, uid, isHealthy,
    findRecord, recordsFor, upsertRecord, removeRecord,
    autoArchive, archiveRecords, restoreRecords, addArchived,
    mergeRecords, replaceAll, resetAll,
    get state() { return state; }
  };
})();
