/* ============================================
   Коммуналка — «Правила» (logic.js)
   Подтягивание значений из прошлых записей
   и расчёт сумм.
   ============================================ */
'use strict';

const Logic = (() => {

  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  // ---------- Помощники ----------

  // Период одним числом (2026-11 → 24343), чтобы легко сравнивать.
  // Годовая запись считается декабрём своего года.
  function periodNum(year, month) {
    return year * 12 + (month || 12);
  }

  // Строка → число (понимает запятую: «8,43»)
  function toNum(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = parseFloat(String(value).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return round2(n).toLocaleString('ru-RU',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  }

  function periodLabel(year, month) {
    return month ? MONTHS[month - 1] + ' ' + year : year + ' год';
  }

  // Записи одной «линии» (та же услуга, адрес, подпункт), от старых к свежим
  function sameStream(records, service, address, subservice) {
    return records
      .filter(r => r.service === service &&
        (r.address || null) === (address || null) &&
        (r.subservice || null) === (subservice || null))
      .sort((a, b) =>
        periodNum(a.period_year, a.period_month) - periodNum(b.period_year, b.period_month) ||
        String(a.technical_date || '').localeCompare(String(b.technical_date || '')));
  }

  // ---------- Подтягивание ----------

  // Предыдущие показания: последнее непустое значение из более ранних месяцев
  function prevReadings(records, service, address, year, month) {
    const stream = sameStream(records, service, address, null)
      .filter(r => periodNum(r.period_year, r.period_month) < periodNum(year, month) &&
        toNum(r.current_readings) !== null);
    const last = stream[stream.length - 1];
    return last ? toNum(last.current_readings) : null;
  }

  // Действующий тариф: последний введённый по этой услуге (адрес не важен)
  function activeTariff(records, service) {
    const stream = records
      .filter(r => r.service === service && toNum(r.tariff) !== null)
      .sort((a, b) =>
        periodNum(b.period_year, b.period_month) - periodNum(a.period_year, a.period_month) ||
        String(b.technical_date || '').localeCompare(String(a.technical_date || '')));
    const last = stream[0];
    return last ? toNum(last.tariff) : null;
  }

  // Долг/аванс из прошлых записей (пока не стоит галочка «использован»).
  // Работает и для месяцев, и для годов: пустой месяц = null.
  function carryDebt(records, service, address, subservice, year, month) {
    const stream = sameStream(records, service, address, subservice)
      .filter(r => periodNum(r.period_year, r.period_month) < periodNum(year, month) &&
        toNum(r.debt_advance) !== null);
    const last = stream[stream.length - 1];
    if (!last) return null;
    return last.debt_advance_closed ? null : toNum(last.debt_advance);
  }

  // Актуальное количество жильцов по адресу
  function residentsFor(address) {
    const v = Data.state.residents[address];
    return v === undefined ? null : v;
  }

  // Последняя оплата (справочно): из более ранних записей
  function lastPayment(records, service, subservice, year, month) {
    const stream = sameStream(records, service, null, subservice)
      .filter(r => periodNum(r.period_year, r.period_month) < periodNum(year, month) &&
        toNum(r.fact_payment) !== null);
    const last = stream[stream.length - 1];
    return last
      ? { value: toNum(last.fact_payment), year: last.period_year, month: last.period_month }
      : null;
  }

  // Предыдущая оплата налогов: строго за прошлый год (даже если там 0)
  function prevTaxPayment(records, year) {
    const prev = records.find(r =>
      r.service === 'Налоги' &&
      r.period_year === year - 1 &&
      r.record_type === 'annual') || null;
    if (!prev) return null;
    const house = toNum(prev.tax_house) || 0;
    const land = toNum(prev.tax_land) || 0;
    const car = toNum(prev.tax_car) || 0;
    return {
      house: toNum(prev.tax_house),
      land: toNum(prev.tax_land),
      car: toNum(prev.tax_car),
      total: round2(house + land + car)
    };
  }

  // ---------- Расчёты ----------

  // Сумма = расход × тариф − аванс + долг (аванс — число без минуса)
  function calcAmount(consumption, tariff, debtAdvance) {
    const c = toNum(consumption), t = toNum(tariff);
    const d = toNum(debtAdvance) === null ? 0 : toNum(debtAdvance);
    if (c === null || t === null) return null;
    return round2(c * t - d);
  }

  // Сумма для мусора = жильцы × тариф − аванс + долг
  function calcTrashAmount(residents, tariff, debtAdvance) {
    const n = toNum(residents), t = toNum(tariff);
    const d = toNum(debtAdvance) === null ? 0 : toNum(debtAdvance);
    if (n === null || t === null) return null;
    return round2(n * t - d);
  }

  // Общая сумма налога = дом + земля + машина
  function calcTaxTotal(house, land, car) {
    const h = toNum(house), l = toNum(land), c = toNum(car);
    if (h === null && l === null && c === null) return null;
    return round2((h || 0) + (l || 0) + (c || 0));
  }

  return {
    MONTHS, periodNum, toNum, round2, fmtMoney, periodLabel,
    prevReadings, activeTariff, carryDebt, residentsFor, lastPayment,
    prevTaxPayment, calcAmount, calcTrashAmount, calcTaxTotal
  };
})();
