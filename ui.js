/* ============================================
   Коммуналка — «Рисовщик» (ui.js)
   Экраны и карточки услуг.
   ============================================ */
'use strict';

const UI = (() => {

  // Описание услуг: какие вкладки и какой тип карточки
  const SERVICES = [
    { key: 'Газ',        icon: '🔥', kind: 'readings', addresses: ['Рабочая 23', 'Рабочая 23А'] },
    { key: 'Вода',       icon: '💧', kind: 'readings', addresses: ['Рабочая 23', 'Рабочая 23А'] },
    { key: 'Свет',       icon: '⚡', kind: 'readings', addresses: ['Рабочая 23', 'Рабочая 23А'] },
    { key: 'Мусор',      icon: '🗑️', kind: 'trash',    addresses: ['Рабочая 23', 'Рабочая 23А'] },
    { key: 'Интернет',   icon: '🌐', kind: 'internet', subservices: ['Мобильный', 'Домашний'],
      fixedAddress: 'Рабочая 23А' },
    { key: 'Телевидение', icon: '📺', kind: 'annual', fixedAddress: 'Рабочая 23' },
    { key: 'Налоги',     icon: '🧾', kind: 'taxes',   fixedAddress: 'Рабочая 23А' }
  ];

  // Годовая услуга?
  function isAnnual(cfg) {
    return cfg.kind === 'annual' || cfg.kind === 'taxes';
  }

  // ---------- Помощники ----------

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function toast(text, ms = 2200) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const node = el('div', 'toast', text);
    root.appendChild(node);
    setTimeout(() => node.remove(), ms);
  }

  // Сегодня в виде ГГГГ-ММ-ДД
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function numInput(value) {
    const inp = el('input', 'inp');
    inp.type = 'text';
    inp.inputMode = 'decimal';
    inp.autocomplete = 'off';
    inp.placeholder = '0';
    if (value !== null && value !== undefined && value !== '') {
      inp.value = String(value).replace('.', ',');
    }
    return inp;
  }

  function dateInput(value) {
    const inp = el('input', 'inp');
    inp.type = 'date';
    inp.value = value || todayISO();
    return inp;
  }

  function checkRow(labelText, checked) {
    const label = el('label', 'check');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    label.appendChild(box);
    label.appendChild(el('span', null, labelText));
    return label;
  }

  function isChecked(checkEl) {
    return checkEl ? checkEl.querySelector('input').checked : false;
  }

  function fieldRow(labelText, input) {
    const row = el('div', 'frow');
    row.appendChild(el('div', 'flabel', labelText));
    row.appendChild(input);
    return row;
  }

  function infoRow(labelText, valueText, big) {
    const row = el('div', 'frow');
    row.appendChild(el('div', 'flabel', labelText));
    row.appendChild(el('div', 'fval' + (big ? ' fval-big' : ''), valueText));
    return row;
  }

  function hintRow(text) {
    return el('div', 'fhint', text);
  }

  // Блок «Долг / Аванс» с галочкой (общий для всех услуг)
  function buildDebtBlock(value, closed) {
    const debtInp = numInput(value);
    const debtCheck = checkRow('использован долг/аванс', closed);

    const debtRow = el('div', 'frow');
    debtRow.appendChild(el('div', 'flabel', 'Долг / Аванс'));
    debtRow.appendChild(debtInp);
    debtRow.appendChild(debtCheck);
    debtRow.appendChild(hintRow('аванс — без минуса, долг — с минусом'));

    return { debtInp, debtCheck, debtRow };
  }

  // Подкраска «Долг / Аванс»: плюс — зелёный, минус — красный
  function paintDebt(inp) {
    const v = Logic.toNum(inp.value);
    inp.classList.toggle('is-advance', v !== null && v > 0);
    inp.classList.toggle('is-debt', v !== null && v < 0);
  }

  // ---------- Окно подтверждения ----------

  function confirmDialog(text, onYes, yesLabel) {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const overlay = el('div', 'modal-overlay');
    const box = el('div', 'modal');
    box.appendChild(el('div', 'modal-text', text));
    const actions = el('div', 'modal-actions');

    const no = el('button', 'btn btn-ghost', 'Отменить');
    no.type = 'button';
    no.addEventListener('click', () => { root.innerHTML = ''; });

    const yes = el('button', 'btn btn-del', yesLabel || 'Удалить');
    yes.type = 'button';
    yes.addEventListener('click', () => { root.innerHTML = ''; onYes(); });

    actions.appendChild(no);
    actions.appendChild(yes);
    box.appendChild(actions);
    overlay.appendChild(box);
    overlay.addEventListener('click', e => { if (e.target === overlay) root.innerHTML = ''; });
    root.appendChild(overlay);
  }

  // ---------- Карточка операции ----------

  function renderCard(host, cfg, address, subservice) {
    const period = App.period;
    const annual = isAnnual(cfg);
    const rec = Data.findRecord(cfg.key, address, subservice, period.year,
      annual ? null : period.month);
    host.innerHTML = '';

    const card = el('div', 'card');
    const head = el('div', 'card-head');
    let title = cfg.icon + ' ' + cfg.key;
    if (subservice) title += ' · ' + subservice;
    if (address) title += ' · ' + address;
    head.appendChild(el('div', 'card-title', title));
    head.appendChild(el('div', 'card-sub',
      Logic.periodLabel(period.year, annual ? null : period.month) +
      (rec ? ' · запись сохранена' : ' · новая запись')));
    card.appendChild(head);

    let factManual = false;   // пользователь сам правил «Факт оплаты»?

    // ===== Газ / Вода / Свет =====
    if (cfg.kind === 'readings') {
      const prevInp = numInput(rec ? rec.previous_readings :
        Logic.prevReadings(Data.state.records, cfg.key, address, period.year, period.month));
      const curInp = numInput(rec ? rec.current_readings : null);
      const tariffInp = numInput(rec ? rec.tariff :
        Logic.activeTariff(Data.state.records, cfg.key));

      const consRow = infoRow('Расход', '—');
      const debt = buildDebtBlock(
        rec ? rec.debt_advance :
        Logic.carryDebt(Data.state.records, cfg.key, address, subservice, period.year, period.month),
        rec ? rec.debt_advance_closed : false);
      const sumRow = infoRow('Сумма', '—', true);
      const factInp = numInput(rec ? rec.fact_payment : null);
      const payInp = dateInput(rec ? rec.payment_date : null);
      const readInp = dateInput(rec ? rec.readings_submitted_date : null);
      const readCheck = checkRow('показания переданы', rec ? rec.flag_readings_submitted : false);
      const paidCheck = checkRow('оплачено', rec ? rec.flag_paid : false);

      function recalc() {
        const p = Logic.toNum(prevInp.value);
        const c = Logic.toNum(curInp.value);
        const t = Logic.toNum(tariffInp.value);
        const consumption = (p !== null && c !== null) ? Logic.round2(c - p) : null;
        consRow.querySelector('.fval').textContent =
          consumption === null ? '—' : String(consumption).replace('.', ',');
        const amount = Logic.calcAmount(consumption, t, debt.debtInp.value);
        sumRow.querySelector('.fval').textContent = Logic.fmtMoney(amount);
        if (!factManual) factInp.value = amount === null ? '' : String(amount).replace('.', ',');
      }

      [prevInp, curInp, tariffInp].forEach(i => i.addEventListener('input', recalc));
      debt.debtInp.addEventListener('input', () => { paintDebt(debt.debtInp); recalc(); });
      factInp.addEventListener('input', () => { factManual = true; });
      paintDebt(debt.debtInp);

      card.appendChild(fieldRow('Предыдущие показания', prevInp));
      card.appendChild(fieldRow('Текущие показания', curInp));
      card.appendChild(fieldRow('Тариф', tariffInp));
      card.appendChild(consRow);
      card.appendChild(debt.debtRow);
      card.appendChild(sumRow);
      card.appendChild(fieldRow('Факт оплаты', factInp));
      card.appendChild(fieldRow('Дата оплаты', payInp));
      card.appendChild(fieldRow('Дата передачи показаний', readInp));
      card.appendChild(readCheck);
      card.appendChild(paidCheck);

      addButtons(card, host, cfg, address, subservice, rec, () => ({
        previous_readings: Logic.toNum(prevInp.value),
        current_readings: Logic.toNum(curInp.value),
        tariff: Logic.toNum(tariffInp.value),
        debt_advance: Logic.toNum(debt.debtInp.value),
        debt_advance_closed: isChecked(debt.debtCheck),
        fact_payment: Logic.toNum(factInp.value),
        payment_date: payInp.value || null,
        readings_submitted_date: readInp.value || null,
        flag_readings_submitted: isChecked(readCheck),
        flag_paid: isChecked(paidCheck)
      }));
      recalc();
    }

    // ===== Мусор =====
    if (cfg.kind === 'trash') {
      const resInp = numInput(rec ? rec.residents_count : Logic.residentsFor(address));
      const tariffInp = numInput(rec ? rec.tariff :
        Logic.activeTariff(Data.state.records, cfg.key));
      const debt = buildDebtBlock(
        rec ? rec.debt_advance :
        Logic.carryDebt(Data.state.records, cfg.key, address, subservice, period.year, period.month),
        rec ? rec.debt_advance_closed : false);
      const sumRow = infoRow('Сумма', '—', true);
      const factInp = numInput(rec ? rec.fact_payment : null);
      const payInp = dateInput(rec ? rec.payment_date : null);
      const paidCheck = checkRow('оплачено', rec ? rec.flag_paid : false);

      function recalc() {
        const amount = Logic.calcTrashAmount(resInp.value, tariffInp.value, debt.debtInp.value);
        sumRow.querySelector('.fval').textContent = Logic.fmtMoney(amount);
        if (!factManual) factInp.value = amount === null ? '' : String(amount).replace('.', ',');
      }

      [resInp, tariffInp].forEach(i => i.addEventListener('input', recalc));
      debt.debtInp.addEventListener('input', () => { paintDebt(debt.debtInp); recalc(); });
      factInp.addEventListener('input', () => { factManual = true; });
      paintDebt(debt.debtInp);

      card.appendChild(fieldRow('Количество жильцов', resInp));
      card.appendChild(fieldRow('Тариф', tariffInp));
      card.appendChild(sumRow);
      card.appendChild(debt.debtRow);
      card.appendChild(fieldRow('Факт оплаты', factInp));
      card.appendChild(fieldRow('Дата оплаты', payInp));
      card.appendChild(paidCheck);

      addButtons(card, host, cfg, address, subservice, rec, () => ({
        residents_count: Logic.toNum(resInp.value),
        tariff: Logic.toNum(tariffInp.value),
        debt_advance: Logic.toNum(debt.debtInp.value),
        debt_advance_closed: isChecked(debt.debtCheck),
        fact_payment: Logic.toNum(factInp.value),
        payment_date: payInp.value || null,
        flag_paid: isChecked(paidCheck)
      }));
      recalc();
    }

    // ===== Интернет =====
    if (cfg.kind === 'internet') {
      const lp = Logic.lastPayment(Data.state.records, cfg.key, subservice, period.year, period.month);
      const lpText = lp
        ? Logic.fmtMoney(lp.value) + ' · ' + Logic.periodLabel(lp.year, lp.month)
        : '—';
      card.appendChild(infoRow('Последняя оплата', lpText));

      const debt = buildDebtBlock(
        rec ? rec.debt_advance :
        Logic.carryDebt(Data.state.records, cfg.key, address, subservice, period.year, period.month),
        rec ? rec.debt_advance_closed : false);
      const factInp = numInput(rec ? rec.fact_payment : null);
      const payInp = dateInput(rec ? rec.payment_date : null);
      const paidCheck = checkRow('оплачено', rec ? rec.flag_paid : false);

      debt.debtInp.addEventListener('input', () => paintDebt(debt.debtInp));
      paintDebt(debt.debtInp);

      card.appendChild(debt.debtRow);
      card.appendChild(fieldRow('Факт оплаты', factInp));
      card.appendChild(fieldRow('Дата оплаты', payInp));
      card.appendChild(paidCheck);

      addButtons(card, host, cfg, address, subservice, rec, () => ({
        debt_advance: Logic.toNum(debt.debtInp.value),
        debt_advance_closed: isChecked(debt.debtCheck),
        fact_payment: Logic.toNum(factInp.value),
        payment_date: payInp.value || null,
        flag_paid: isChecked(paidCheck)
      }));
    }

    // ===== Телевидение (раз в год) =====
    if (cfg.kind === 'annual') {
      const lp = Logic.lastPayment(Data.state.records, cfg.key, null, period.year, null);
      const lpText = lp
        ? Logic.fmtMoney(lp.value) + ' · ' + Logic.periodLabel(lp.year, lp.month)
        : '—';
      card.appendChild(infoRow('Последняя оплата', lpText));

      const debt = buildDebtBlock(
        rec ? rec.debt_advance :
        Logic.carryDebt(Data.state.records, cfg.key, address, subservice, period.year, null),
        rec ? rec.debt_advance_closed : false);
      const factInp = numInput(rec ? rec.fact_payment : null);
      const payInp = dateInput(rec ? rec.payment_date : null);
      const paidCheck = checkRow('оплачено', rec ? rec.flag_paid : false);

      debt.debtInp.addEventListener('input', () => paintDebt(debt.debtInp));
      paintDebt(debt.debtInp);

      card.appendChild(debt.debtRow);
      card.appendChild(fieldRow('Факт оплаты', factInp));
      card.appendChild(fieldRow('Дата оплаты', payInp));
      card.appendChild(paidCheck);

      addButtons(card, host, cfg, address, subservice, rec, () => ({
        debt_advance: Logic.toNum(debt.debtInp.value),
        debt_advance_closed: isChecked(debt.debtCheck),
        fact_payment: Logic.toNum(factInp.value),
        payment_date: payInp.value || null,
        flag_paid: isChecked(paidCheck)
      }));
    }

    // ===== Налоги (раз в год, только 23А) =====
    if (cfg.kind === 'taxes') {
      const houseInp = numInput(rec ? rec.tax_house : null);
      const landInp = numInput(rec ? rec.tax_land : null);
      const carInp = numInput(rec ? rec.tax_car : null);
      const totalRow = infoRow('Общая сумма налога', '—', true);

      // Предыдущая оплата — строго за прошлый год (даже если там 0)
      const prev = Logic.prevTaxPayment(Data.state.records, period.year);
      const prevRow = el('div', 'frow');
      prevRow.appendChild(el('div', 'flabel', 'Предыдущая оплата · ' + (period.year - 1)));
      if (prev) {
        prevRow.appendChild(el('div', 'fval', Logic.fmtMoney(prev.total)));
        prevRow.appendChild(el('div', 'fhint',
          'дом ' + Logic.fmtMoney(prev.house) +
          ' · земля ' + Logic.fmtMoney(prev.land) +
          ' · машина ' + Logic.fmtMoney(prev.car)));
      } else {
        prevRow.appendChild(el('div', 'fval', '—'));
      }

      const debt = buildDebtBlock(
        rec ? rec.debt_advance :
        Logic.carryDebt(Data.state.records, cfg.key, address, subservice, period.year, null),
        rec ? rec.debt_advance_closed : false);
      const factInp = numInput(rec ? rec.fact_payment : null);
      const payInp = dateInput(rec ? rec.payment_date : null);
      const paidCheck = checkRow('оплачено', rec ? rec.flag_paid : false);

      function recalc() {
        const total = Logic.calcTaxTotal(houseInp.value, landInp.value, carInp.value);
        totalRow.querySelector('.fval').textContent = Logic.fmtMoney(total);

        // «Факт оплаты» подтягивается сам: общая сумма − долг/аванс,
        // пока пользователь не впишет туда своё значение
        const d = Logic.toNum(debt.debtInp.value);
        const amount = total === null ? null : Logic.round2(total - (d === null ? 0 : d));
        if (!factManual) {
          factInp.value = amount === null ? '' : String(amount).replace('.', ',');
        }
      }

      [houseInp, landInp, carInp].forEach(i => i.addEventListener('input', recalc));
      debt.debtInp.addEventListener('input', () => { paintDebt(debt.debtInp); recalc(); });
      factInp.addEventListener('input', () => { factManual = true; });
      paintDebt(debt.debtInp);

      card.appendChild(fieldRow('Дом', houseInp));
      card.appendChild(fieldRow('Земля', landInp));
      card.appendChild(fieldRow('Машина', carInp));
      card.appendChild(totalRow);
      card.appendChild(prevRow);
      card.appendChild(debt.debtRow);
      card.appendChild(fieldRow('Факт оплаты', factInp));
      card.appendChild(fieldRow('Дата оплаты', payInp));
      card.appendChild(paidCheck);

      addButtons(card, host, cfg, address, subservice, rec, () => ({
        tax_house: Logic.toNum(houseInp.value),
        tax_land: Logic.toNum(landInp.value),
        tax_car: Logic.toNum(carInp.value),
        debt_advance: Logic.toNum(debt.debtInp.value),
        debt_advance_closed: isChecked(debt.debtCheck),
        fact_payment: Logic.toNum(factInp.value),
        payment_date: payInp.value || null,
        flag_paid: isChecked(paidCheck)
      }));
      recalc();
    }

    host.appendChild(card);
  }

  // Кнопки «Сохранить» и «Удалить» внизу карточки
  function addButtons(card, host, cfg, address, subservice, rec, collect) {
    const period = App.period;
    const annual = isAnnual(cfg);
    const row = el('div', 'btn-row');

    const save = el('button', 'btn btn-save', 'Сохранить');
    save.type = 'button';
    save.addEventListener('click', () => {
      const record = Object.assign({
        id: rec ? rec.id : Data.uid(),
        service: cfg.key,
        address: address || null,
        subservice: subservice || null,
        period_year: period.year,
        period_month: annual ? null : period.month,
        record_type: annual ? 'annual' : 'monthly',
        previous_readings: null,
        current_readings: null,
        tariff: null,
        residents_count: null,
        tax_house: null, tax_land: null, tax_car: null,
        debt_advance: null,
        debt_advance_closed: false,
        fact_payment: null,
        payment_date: null,
        readings_submitted_date: null,
        flag_readings_submitted: false,
        flag_paid: false,
        technical_date: new Date().toISOString()
      }, collect());

      // Тариф и жильцы сохраняются как «действующие» для следующих месяцев
      if (record.tariff !== null) Data.state.tariffs[record.service] = record.tariff;
      if (record.residents_count !== null && record.address) {
        Data.state.residents[record.address] = record.residents_count;
      }

      Data.upsertRecord(record);
      toast('Сохранено');
      renderCard(host, cfg, address, subservice);
    });
    row.appendChild(save);

    if (rec) {
      const del = el('button', 'btn btn-del', 'Удалить');
      del.type = 'button';
      del.addEventListener('click', () => {
        confirmDialog('Вы хотите удалить запись?', () => {
          Data.removeRecord(rec.id);
          toast('Запись удалена');
          renderCard(host, cfg, address, subservice);
        });
      });
      row.appendChild(del);
    }

    card.appendChild(row);
  }

  // ---------- Экран «Содержание» ----------

  // Плашка «услуга привязана к адресу»
  function addrNote(address) {
    return el('div', 'addr-note',
      '📍 Услуга автоматически ведётся по адресу: ' + address);
  }

  // Вкладки адресов/подпунктов + карточка.
  // preferred — какую вкладку выбрать (при открытии из истории);
  // без него сохраняем текущую выбранную вкладку.
  function renderServiceBody(det, cfg, preferred) {
    const body = det.querySelector('.service-body');
    const prevSel = body.querySelector('.addr-chip.sel');
    const prevText = prevSel ? prevSel.textContent : null;
    body.innerHTML = '';

    const cardHost = el('div', 'card-host');

    // Услуга, привязанная к одному адресу без вкладок (ТВ → 23, Налоги → 23А)
    if (cfg.fixedAddress && !cfg.subservices) {
      body.appendChild(addrNote(cfg.fixedAddress));
      body.appendChild(cardHost);
      renderCard(cardHost, cfg, cfg.fixedAddress, null);
      return;
    }

    const options = cfg.addresses || cfg.subservices || [];

    // Услуга без вкладок — карточка сразу
    if (!options.length) {
      body.appendChild(cardHost);
      renderCard(cardHost, cfg, cfg.fixedAddress || null, null);
      return;
    }

    const tabs = el('div', 'addr-chips');
    options.forEach(opt => {
      const chip = el('button', 'addr-chip', opt);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        tabs.querySelectorAll('.addr-chip').forEach(c => c.classList.remove('sel'));
        chip.classList.add('sel');
        renderCard(cardHost, cfg,
          cfg.fixedAddress || (cfg.addresses ? opt : null),
          cfg.subservices ? opt : null);
      });
      tabs.appendChild(chip);
    });

    if (cfg.fixedAddress) body.appendChild(addrNote(cfg.fixedAddress));
    body.appendChild(tabs);
    body.appendChild(cardHost);

    tabs.children[0].click();   // сразу открыть первую вкладку
    if (preferred) {
      tabs.querySelectorAll('.addr-chip').forEach(ch => {
        if (ch.textContent === preferred) ch.click();
      });
    } else if (prevText) {
      tabs.querySelectorAll('.addr-chip').forEach(ch => {
        if (ch.textContent === prevText) ch.click();
      });
    }
  }

  function renderDashboard() {
    const detailsList = document.querySelectorAll('#page-dashboard .service');
    SERVICES.forEach((cfg, i) => {
      const det = detailsList[i];
      if (!det) return;
      if (det._onToggle) det.removeEventListener('toggle', det._onToggle);
      det._onToggle = function () {
        if (!det.open) return;
        renderServiceBody(det, cfg, det._preferred);
        det._preferred = null;
      };
      det.addEventListener('toggle', det._onToggle);
      if (det.open) renderServiceBody(det, cfg);
    });
  }

  // ---------- Раздел «История» (этап 4) ----------

  // Состояние раздела — сохраняется, пока открыто приложение
  const hist = {
    sortDesc: true,        // true — сначала свежие
    fUnpaid: false,        // фильтр «не оплачено»
    fNoReadings: false,    // фильтр «не переданы показания»
    fAddress: '',          // выбранный адрес ('' — все)
    fService: '',          // выбранная услуга ('' — все)
    fFrom: '',             // дата оплаты «с» (ГГГГ-ММ-ДД)
    fTo: '',               // дата оплаты «по»
    fOpen: false,          // панель фильтров открыта (по умолчанию спрятана)
    selected: new Set()    // id записей, отмеченных галочками
  };

  // Дата в привычном виде ДД.ММ.ГГГГ
  function fmtDate(iso) {
    if (!iso) return '—';
    const p = String(iso).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : iso;
  }

  function histFiltered() {
    const kinds = {};
    SERVICES.forEach(c => { kinds[c.key] = c.kind; });

    let list = Data.state.records.slice();

    if (hist.fService) list = list.filter(r => r.service === hist.fService);
    if (hist.fAddress) list = list.filter(r => (r.address || '') === hist.fAddress);

    if (hist.fUnpaid || hist.fNoReadings) {
      list = list.filter(r =>
        (hist.fUnpaid && !r.flag_paid) ||
        (hist.fNoReadings && kinds[r.service] === 'readings' &&
          !r.flag_readings_submitted));
    }

    if (hist.fFrom) list = list.filter(r => r.payment_date && r.payment_date >= hist.fFrom);
    if (hist.fTo) list = list.filter(r => r.payment_date && r.payment_date <= hist.fTo);

    list.sort((a, b) =>
      String(a.technical_date || '').localeCompare(String(b.technical_date || '')));
    if (hist.sortDesc) list.reverse();

    return list;
  }

  // Выпадающий список с подписью сверху
  function histSelect(labelText, options, current, onChange) {
    const sel = el('select', 'inp hist-select');
    options.forEach(o => {
      const opt = el('option', null, o.label);
      opt.value = o.value;
      sel.appendChild(opt);
    });
    sel.value = current;
    sel.addEventListener('change', () => onChange(sel.value));
    const wrap = el('label', 'hist-field');
    wrap.appendChild(el('span', 'flabel', labelText));
    wrap.appendChild(sel);
    return wrap;
  }

  // Поле даты с подписью сверху
  function histDate(labelText, value, onChange) {
    const inp = el('input', 'inp');
    inp.type = 'date';
    inp.value = value;
    inp.addEventListener('change', () => onChange(inp.value));
    const wrap = el('label', 'hist-field');
    wrap.appendChild(el('span', 'flabel', labelText));
    wrap.appendChild(inp);
    return wrap;
  }

  // Открыть запись из истории на «Содержании»: нужный месяц + нужная вкладка
  function openRecord(rec) {
    const idx = SERVICES.findIndex(s => s.key === rec.service);
    if (idx < 0) return;
    const cfg = SERVICES[idx];
    const annual = isAnnual(cfg);
    App.setPeriod(rec.period_year, annual ? (rec.period_month || 12) : (rec.period_month || 1));
    if (location.hash !== '#dashboard') location.hash = 'dashboard';
    App.showPage('dashboard');

    const det = document.querySelectorAll('#page-dashboard .service')[idx];
    if (!det) return;
    const target = rec.address || rec.subservice || null;
    const options = cfg.addresses || cfg.subservices || [];
    const pref = (target && options.includes(target)) ? target : null;

    if (det.open) {
      renderServiceBody(det, cfg, pref);
    } else {
      det._preferred = pref;   // обработчик toggle отрисует с учётом вкладки
      det.open = true;
    }

    det.scrollIntoView({ behavior: 'smooth', block: 'start' });
    det.classList.remove('flash');
    void det.offsetWidth;      // перезапуск анимации подсветки
    det.classList.add('flash');
  }

  function renderHistory() {
    const root = document.getElementById('history-root');
    if (!root) return;
    root.innerHTML = '';

    const list = histFiltered();
    const filtersOn = hist.fUnpaid || hist.fNoReadings || hist.fAddress ||
                      hist.fService || hist.fFrom || hist.fTo;

    // ----- Счётчик записей и кнопка-шестерёнка -----
    const toolbar = el('div', 'hist-toolbar');
    toolbar.appendChild(el('div', 'hist-count',
      'Записей: ' + list.length +
      (list.length !== Data.state.records.length
        ? ' из ' + Data.state.records.length : '')));

    const gear = el('button', 'hist-gear' +
      (hist.fOpen ? ' open' : '') +
      (!hist.fOpen && filtersOn ? ' has-filters' : ''), '⚙️ Фильтры');
    gear.type = 'button';
    gear.title = hist.fOpen ? 'Скрыть фильтры' : 'Показать фильтры';
    gear.addEventListener('click', () => { hist.fOpen = !hist.fOpen; renderHistory(); });
    toolbar.appendChild(gear);
    root.appendChild(toolbar);

    // ----- Панель фильтров (открывается шестерёнкой) -----
    const panel = el('div', 'hist-panel');

    const row1 = el('div', 'hist-panel-row');
    const chUnpaid = el('label', 'hist-chip');
    const bu = el('input'); bu.type = 'checkbox'; bu.checked = hist.fUnpaid;
    bu.addEventListener('change', () => { hist.fUnpaid = bu.checked; renderHistory(); });
    chUnpaid.appendChild(bu);
    chUnpaid.appendChild(el('span', null, 'не оплачено'));

    const chRead = el('label', 'hist-chip');
    const br = el('input'); br.type = 'checkbox'; br.checked = hist.fNoReadings;
    br.addEventListener('change', () => { hist.fNoReadings = br.checked; renderHistory(); });
    chRead.appendChild(br);
    chRead.appendChild(el('span', null, 'не переданы показания'));

    row1.appendChild(chUnpaid);
    row1.appendChild(chRead);
    panel.appendChild(row1);

    const row2 = el('div', 'hist-panel-row');
    row2.appendChild(histSelect('Адрес', [
      { value: '', label: 'Все адреса' },
      { value: 'Рабочая 23', label: 'Рабочая 23' },
      { value: 'Рабочая 23А', label: 'Рабочая 23А' }
    ], hist.fAddress, v => { hist.fAddress = v; renderHistory(); }));

    row2.appendChild(histSelect('Услуга',
      [{ value: '', label: 'Все услуги' }].concat(
        SERVICES.map(c => ({ value: c.key, label: c.icon + ' ' + c.key }))),
      hist.fService, v => { hist.fService = v; renderHistory(); }));

    row2.appendChild(histSelect('Сортировка', [
      { value: 'new', label: 'Сначала свежие' },
      { value: 'old', label: 'Сначала старые' }
    ], hist.sortDesc ? 'new' : 'old',
      v => { hist.sortDesc = v === 'new'; renderHistory(); }));

    panel.appendChild(row2);

    const row3 = el('div', 'hist-panel-row');
    row3.appendChild(histDate('Оплата с', hist.fFrom,
      v => { hist.fFrom = v; renderHistory(); }));
    row3.appendChild(histDate('Оплата по', hist.fTo,
      v => { hist.fTo = v; renderHistory(); }));

    const reset = el('button', 'btn btn-ghost hist-reset', 'Сбросить');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      hist.fUnpaid = false;
      hist.fNoReadings = false;
      hist.fAddress = '';
      hist.fService = '';
      hist.fFrom = '';
      hist.fTo = '';
      renderHistory();
    });
    row3.appendChild(reset);
    panel.appendChild(row3);

    if (hist.fOpen) root.appendChild(panel);

    // Панель массовых действий
    if (hist.selected.size > 0) {
      const bar = el('div', 'hist-massbar');
      bar.appendChild(el('span', null, 'Выбрано: ' + hist.selected.size));
      const nSel = hist.selected.size;

      const arc = el('button', 'btn btn-ghost hist-mass-del', 'Архивировать');
      arc.type = 'button';
      arc.addEventListener('click', () => {
        confirmDialog('Переместить выбранные записи (' + nSel + ') в архив?', () => {
          Data.archiveRecords(Array.from(hist.selected));
          hist.selected.clear();
          toast('В архив: ' + nSel);
          renderHistory();
        }, 'Архивировать');
      });
      bar.appendChild(arc);

      const expCsv = el('button', 'btn btn-ghost hist-mass-del', 'Выгрузить CSV');
      expCsv.type = 'button';
      expCsv.addEventListener('click', () => {
        const list = Data.state.records.filter(r => hist.selected.has(r.id));
        Pack.download('kommyn-vygruzka.csv', '\ufeff' + Pack.toCSV(list));
        toast('CSV скачан');
      });
      bar.appendChild(expCsv);

      const expJson = el('button', 'btn btn-ghost hist-mass-del', 'Выгрузить JSON');
      expJson.type = 'button';
      expJson.addEventListener('click', () => {
        const list = Data.state.records.filter(r => hist.selected.has(r.id));
        Pack.download('kommyn-vygruzka.json', JSON.stringify(list, null, 2));
        toast('JSON скачан');
      });
      bar.appendChild(expJson);

      const del = el('button', 'btn btn-del hist-mass-del', 'Удалить выбранные');
      del.type = 'button';
      del.addEventListener('click', () => {
        confirmDialog('Вы хотите удалить выбранные записи (' + nSel + ')?', () => {
          hist.selected.forEach(id => Data.removeRecord(id));
          hist.selected.clear();
          toast('Удалено: ' + nSel);
          renderHistory();
        });
      });
      bar.appendChild(del);
      root.appendChild(bar);
    }

    if (!list.length) {
      root.appendChild(el('div', 'placeholder-box',
        Data.state.records.length
          ? (filtersOn
              ? 'Ничего не найдено — измените фильтры (кнопка «⚙️ Фильтры» сверху)'
              : 'Записей пока нет. Заполните карточки на «Содержании» — они появятся здесь.')
          : 'Записей пока нет. Заполните карточки на «Содержании» — они появятся здесь.'));
      return;
    }

    // «Выбрать все показанные»
    const allIds = list.map(r => r.id);
    const allSel = allIds.every(id => hist.selected.has(id));
    const selRow = el('label', 'hist-selrow');
    const sa = el('input'); sa.type = 'checkbox'; sa.checked = allSel;
    sa.addEventListener('change', () => {
      if (sa.checked) allIds.forEach(id => hist.selected.add(id));
      else allIds.forEach(id => hist.selected.delete(id));
      renderHistory();
    });
    selRow.appendChild(sa);
    selRow.appendChild(el('span', null, 'Выбрать все показанные'));
    root.appendChild(selRow);

    const listBox = el('div', 'hist-list');
    list.forEach(rec => {
      const cfg = SERVICES.find(c => c.key === rec.service);
      const icon = cfg ? cfg.icon : '•';
      const row = el('div', 'hist-row');

      const box = el('input');
      box.type = 'checkbox';
      box.checked = hist.selected.has(rec.id);
      box.addEventListener('click', e => e.stopPropagation());
      box.addEventListener('change', () => {
        if (box.checked) hist.selected.add(rec.id);
        else hist.selected.delete(rec.id);
        renderHistory();
      });
      row.appendChild(box);

      const main = el('div', 'hist-main');
      const title = el('div', 'hist-title');
      title.appendChild(el('span', 'hist-icon', icon));
      title.appendChild(el('span', null, rec.service));
      if (rec.address) title.appendChild(el('span', 'hist-tag', rec.address));
      if (rec.subservice) title.appendChild(el('span', 'hist-tag', rec.subservice));
      if (rec.flag_paid) title.appendChild(el('span', 'badge badge-ok', 'оплачено'));
      if (cfg && cfg.kind === 'readings' && rec.flag_readings_submitted) {
        title.appendChild(el('span', 'badge badge-read', 'показания'));
      }
      main.appendChild(title);

      main.appendChild(el('div', 'hist-sub',
        Logic.periodLabel(rec.period_year, rec.period_month) +
        ' · оплата ' + fmtDate(rec.payment_date)));
      row.appendChild(main);

      const fact = Logic.toNum(rec.fact_payment);
      row.appendChild(el('div', 'hist-amount' + (fact === null ? ' none' : ''),
        Logic.fmtMoney(fact)));

      row.addEventListener('click', () => openRecord(rec));
      listBox.appendChild(row);
    });
    root.appendChild(listBox);
  }

  // ---------- Раздел «Отчёты» (этап 5) ----------

  const REP_METRICS = { fact: 'Факт оплаты', accrued: 'Начислено', debt: 'Долг/Аванс' };
  const REP_BUCKETS = ['Рабочая 23', 'Рабочая 23А', 'none'];
  const BUCKET_LABEL = { 'Рабочая 23': '23', 'Рабочая 23А': '23А', none: 'б/а' };
  const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
                        'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  // Состояние раздела — сохраняется, пока открыто приложение
  const rep = {
    dMonth: null, dYear: null,     // «Сравнение месяцев»: текущий месяц
    type: 'summary',               // summary | compare | detail
    metric: 'fact',                // fact | accrued | debt
    ptype: 'month',                // month | year | range
    pMonth: null, pYear: null,     // период «месяц»
    pYearSel: null,                // период «год»
    pFrom: '', pTo: '',            // период «диапазон»
    aType: 'month', aMonth: null, aYear: null,   // сравнительный: период A
    bType: 'month', bMonth: null, bYear: null,   // сравнительный: период B
    fAddress: '', fService: '', fUnpaid: false, fNoReadings: false
  };

  function repInit() {
    if (rep.dMonth === null) { rep.dMonth = App.period.month; rep.dYear = App.period.year; }
    if (rep.pMonth === null) { rep.pMonth = App.period.month; rep.pYear = App.period.year; }
    if (rep.pYearSel === null) rep.pYearSel = App.period.year;
    if (rep.aMonth === null) {
      const prev = repShift({ y: App.period.year, m: App.period.month }, -1);
      rep.aMonth = prev.m; rep.aYear = prev.y;
      rep.bMonth = App.period.month; rep.bYear = App.period.year;
    }
  }

  function repShift(p, delta) {
    let m = p.m + delta, y = p.y;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    return { y: y, m: m };
  }

  function repKinds() {
    const k = {};
    SERVICES.forEach(c => { k[c.key] = c.kind; });
    return k;
  }

  function isAnnualRec(r) { return r.record_type === 'annual'; }

  function repYears() {
    const set = new Set([new Date().getFullYear()]);
    Data.state.records.forEach(r => {
      if (r.period_year) set.add(Number(r.period_year));
      if (r.payment_date) set.add(Number(String(r.payment_date).slice(0, 4)));
    });
    return Array.from(set).sort((a, b) => b - a);
  }

  function monthOpts() {
    return Logic.MONTHS.map((n, i) => ({ value: String(i + 1), label: n }));
  }

  function yearOpts() {
    return repYears().map(y => ({ value: String(y), label: String(y) }));
  }

  // Начислено «по формуле», без учёта долга/аванса
  function recAccrued(r) {
    const k = repKinds()[r.service];
    if (k === 'readings') {
      const p = Logic.toNum(r.previous_readings),
            c = Logic.toNum(r.current_readings),
            t = Logic.toNum(r.tariff);
      if (p === null || c === null || t === null) return null;
      return Logic.round2((c - p) * t);
    }
    if (k === 'trash') {
      const n = Logic.toNum(r.residents_count), t = Logic.toNum(r.tariff);
      if (n === null || t === null) return null;
      return Logic.round2(n * t);
    }
    if (k === 'taxes') {
      const h = Logic.toNum(r.tax_house), l = Logic.toNum(r.tax_land),
            cr = Logic.toNum(r.tax_car);
      if (h === null && l === null && cr === null) return null;
      return Logic.round2((h || 0) + (l || 0) + (cr || 0));
    }
    return null;   // интернет и телевидение — начисленной суммы нет
  }

  function recMetric(r, metric) {
    if (metric === 'fact') return Logic.toNum(r.fact_payment);
    if (metric === 'accrued') return recAccrued(r);
    return Logic.toNum(r.debt_advance);
  }

  // Попадает ли запись в месяц: помесячные — по периоду,
  // годовые — по месяцу даты оплаты
  function recInMonth(r, y, m) {
    if (isAnnualRec(r)) {
      return !!(r.payment_date &&
        r.payment_date.startsWith(y + '-' + String(m).padStart(2, '0')));
    }
    return r.period_year === y && r.period_month === m;
  }

  function recInYear(r, y) {
    return Number(r.period_year) === Number(y);
  }

  function recInRange(r, from, to) {
    const pd = r.payment_date;
    if (!pd) return false;
    if (from && pd < from) return false;
    if (to && pd > to) return false;
    return true;
  }

  // Записи после фильтров конструктора + периода
  function repRecords(mode) {
    let list = Data.state.records.slice();
    if (rep.fService) list = list.filter(r => r.service === rep.fService);
    if (rep.fAddress) list = list.filter(r => (r.address || 'none') === rep.fAddress);
    const kinds = repKinds();
    if (rep.fUnpaid || rep.fNoReadings) {
      list = list.filter(r =>
        (rep.fUnpaid && !r.flag_paid) ||
        (rep.fNoReadings && kinds[r.service] === 'readings' &&
          !r.flag_readings_submitted));
    }
    return list.filter(r => {
      if (mode.kind === 'month') return recInMonth(r, mode.y, mode.m);
      if (mode.kind === 'year') return recInYear(r, mode.y);
      return recInRange(r, mode.from, mode.to);
    });
  }

  // Сумма метрики по набору записей; service/bucket = null — без фильтра
  function sumMetric(records, service, bucket, metric) {
    let s = null;
    records.forEach(r => {
      if (service !== null && r.service !== service) return;
      if (bucket !== null && (r.address || 'none') !== bucket) return;
      const v = recMetric(r, metric);
      if (v !== null) s = (s === null ? 0 : s) + v;
    });
    return s === null ? null : Logic.round2(s);
  }

  function repTable(minWidth) {
    const wrap = el('div', 'rep-scroll');
    const t = el('table', 'rep-table');
    if (minWidth) t.style.minWidth = minWidth + 'px';
    wrap.appendChild(t);
    return { wrap: wrap, t: t };
  }

  function moneyCell(value) {
    const td = el('td', 'rep-num' + (value === null ? ' none' : ''));
    td.textContent = Logic.fmtMoney(value);
    return td;
  }

  function debtCell(value) {
    const td = moneyCell(value);
    if (value !== null && value > 0) td.classList.add('rep-pos');
    if (value !== null && value < 0) td.classList.add('rep-neg');
    return td;
  }

  function diffCell(a, b) {
    const td = el('td', 'rep-num');
    if (a === null && b === null) {
      td.classList.add('none');
      td.textContent = '—';
      return td;
    }
    const d = Logic.round2((b === null ? 0 : b) - (a === null ? 0 : a));
    td.textContent = (d > 0 ? '+' : '') + Logic.fmtMoney(d);
    return td;
  }

  function emptyBox(text) { return el('div', 'placeholder-box', text); }

  function resultBox(subtitleText) {
    const box = el('div', 'rep-result');
    if (subtitleText) box.appendChild(el('div', 'rep-subtitle', subtitleText));
    return box;
  }

  function histChip(labelText, checked, onChange) {
    const lab = el('label', 'hist-chip');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    box.addEventListener('change', () => onChange(box.checked));
    lab.appendChild(box);
    lab.appendChild(el('span', null, labelText));
    return lab;
  }

  // ----- Карточка «Сравнение месяцев» (отчёт по умолчанию) -----

  function buildDefaultCard() {
    const card = el('div', 'rep-block');
    card.appendChild(el('div', 'rep-title', '📊 Сравнение месяцев'));
    card.appendChild(el('div', 'rep-note',
      'В ячейках — факт оплаты. «б/а» — без адреса (интернет, телевидение). ' +
      'Годовые услуги попадают в месяц фактической оплаты.'));

    const row = el('div', 'hist-panel-row');
    row.appendChild(histSelect('Месяц', monthOpts(), String(rep.dMonth),
      v => { rep.dMonth = Number(v); renderReports(); }));
    row.appendChild(histSelect('Год', yearOpts(), String(rep.dYear),
      v => { rep.dYear = Number(v); renderReports(); }));
    card.appendChild(row);

    const cur = { y: rep.dYear, m: rep.dMonth };
    const prev = repShift(cur, -1);
    const inPrev = Data.state.records.filter(r => recInMonth(r, prev.y, prev.m));
    const inCur = Data.state.records.filter(r => recInMonth(r, cur.y, cur.m));

    // Годовые услуги показываем, только если оплачены в один из двух месяцев
    const annualShown = ['Телевидение', 'Налоги'].filter(svc =>
      inPrev.concat(inCur).some(r => r.service === svc && isAnnualRec(r)));

    const rows = ['Газ', 'Вода', 'Свет', 'Мусор', 'Интернет'].concat(annualShown);

    const totals = {
      prev: { 'Рабочая 23': null, 'Рабочая 23А': null, none: null },
      cur: { 'Рабочая 23': null, 'Рабочая 23А': null, none: null }
    };
    function addTot(g, b, v) {
      if (v !== null) g[b] = Logic.round2((g[b] || 0) + v);
    }

    const built = repTable(620);
    const thead = el('thead');
    const tr1 = el('tr');
    const thName = el('th', null, 'Услуга');
    thName.rowSpan = 2;
    tr1.appendChild(thName);
    const thPrev = el('th', 'rep-group',
      'Предыдущий · ' + Logic.MONTHS[prev.m - 1] + ' ' + prev.y);
    thPrev.colSpan = 3;
    const thCur = el('th', 'rep-group',
      'Текущий · ' + Logic.MONTHS[cur.m - 1] + ' ' + cur.y);
    thCur.colSpan = 3;
    tr1.appendChild(thPrev);
    tr1.appendChild(thCur);
    thead.appendChild(tr1);

    const tr2 = el('tr');
    REP_BUCKETS.concat(REP_BUCKETS).forEach(b =>
      tr2.appendChild(el('th', null, BUCKET_LABEL[b])));
    thead.appendChild(tr2);
    built.t.appendChild(thead);

    const tbody = el('tbody');
    rows.forEach(svc => {
      const cfg = SERVICES.find(c => c.key === svc);
      const tr = el('tr');
      tr.appendChild(el('td', 'rep-name', (cfg ? cfg.icon + ' ' : '') + svc));
      [['prev', inPrev], ['cur', inCur]].forEach(pair => {
        REP_BUCKETS.forEach(b => {
          const v = sumMetric(pair[1], svc, b, 'fact');
          addTot(totals[pair[0]], b, v);
          tr.appendChild(moneyCell(v));
        });
      });
      tbody.appendChild(tr);
    });

    const trT = el('tr', 'rep-total');
    trT.appendChild(el('td', null, 'Итого'));
    ['prev', 'cur'].forEach(key => {
      REP_BUCKETS.forEach(b => trT.appendChild(moneyCell(totals[key][b])));
    });
    tbody.appendChild(trT);

    const trG = el('tr', 'rep-grand');
    trG.appendChild(el('td', null, 'Всего за месяц'));
    ['prev', 'cur'].forEach(key => {
      const g = Logic.round2(REP_BUCKETS.reduce(
        (s, b) => s + (totals[key][b] || 0), 0));
      const td = moneyCell(g);
      td.colSpan = 3;   // итог на всю ширину группы месяцев
      trG.appendChild(td);
    });
    tbody.appendChild(trG);

    built.t.appendChild(tbody);
    card.appendChild(built.wrap);
    return card;
  }

  // ----- Конструктор: период и режимы -----

  function currentMode() {
    if (rep.ptype === 'month') return { kind: 'month', y: rep.pYear, m: rep.pMonth };
    if (rep.ptype === 'year') return { kind: 'year', y: rep.pYearSel };
    return { kind: 'range', from: rep.pFrom, to: rep.pTo };
  }

  function modeLabel(mode) {
    if (mode.kind === 'month') return Logic.periodLabel(mode.y, mode.m);
    if (mode.kind === 'year') return mode.y + ' год';
    return 'оплата ' + fmtDate(mode.from) + ' — ' + fmtDate(mode.to);
  }

  function periodRow() {
    const row = el('div', 'hist-panel-row');
    row.appendChild(histSelect('Период', [
      { value: 'month', label: 'Месяц' },
      { value: 'year', label: 'Год' },
      { value: 'range', label: 'Диапазон дат оплаты' }
    ], rep.ptype, v => { rep.ptype = v; renderReports(); }));
    if (rep.ptype === 'month') {
      row.appendChild(histSelect('Месяц', monthOpts(), String(rep.pMonth),
        v => { rep.pMonth = Number(v); renderReports(); }));
      row.appendChild(histSelect('Год', yearOpts(), String(rep.pYear),
        v => { rep.pYear = Number(v); renderReports(); }));
    } else if (rep.ptype === 'year') {
      row.appendChild(histSelect('Год', yearOpts(), String(rep.pYearSel),
        v => { rep.pYearSel = Number(v); renderReports(); }));
    } else {
      row.appendChild(histDate('Оплата с', rep.pFrom,
        v => { rep.pFrom = v; renderReports(); }));
      row.appendChild(histDate('Оплата по', rep.pTo,
        v => { rep.pTo = v; renderReports(); }));
      const hint = el('div', 'fhint',
        'Фильтр по дате оплаты; записи без даты оплаты не попадут в отчёт.');
      hint.style.flexBasis = '100%';
      row.appendChild(hint);
    }
    return row;
  }

  function compareMode(side) {
    if (rep[side + 'Type'] === 'month') {
      return { kind: 'month', y: rep[side + 'Year'], m: rep[side + 'Month'] };
    }
    return { kind: 'year', y: rep[side + 'Year'] };
  }

  function comparePeriodRow(title, side) {
    const row = el('div', 'hist-panel-row');
    row.appendChild(el('div', 'rep-side-title', title));
    row.appendChild(histSelect('Тип периода', [
      { value: 'month', label: 'Месяц' },
      { value: 'year', label: 'Год' }
    ], rep[side + 'Type'], v => { rep[side + 'Type'] = v; renderReports(); }));
    if (rep[side + 'Type'] === 'month') {
      row.appendChild(histSelect('Месяц', monthOpts(), String(rep[side + 'Month']),
        v => { rep[side + 'Month'] = Number(v); renderReports(); }));
    }
    row.appendChild(histSelect('Год', yearOpts(), String(rep[side + 'Year']),
      v => { rep[side + 'Year'] = Number(v); renderReports(); }));
    return row;
  }

  // ----- Сводный отчёт -----

  function buildSummary() {
    const mode = currentMode();
    const recs = repRecords(mode);
    const box = resultBox(
      'Сводный · ' + modeLabel(mode) + ' · ' + REP_METRICS[rep.metric] +
      ' · записей: ' + recs.length);
    if (!recs.length) {
      box.appendChild(emptyBox('Нет записей за выбранный период — измените параметры.'));
      return box;
    }

    const built = repTable(rep.ptype === 'year' ? 880 : 560);
    const thead = el('thead');
    const theadTr = el('tr');
    theadTr.appendChild(el('th', null, 'Услуга'));
    if (rep.ptype === 'year') {
      MONTHS_SHORT.forEach(mn => theadTr.appendChild(el('th', null, mn)));
      theadTr.appendChild(el('th', null, 'За год'));
    } else {
      REP_BUCKETS.forEach(b => theadTr.appendChild(el('th', null, BUCKET_LABEL[b])));
      theadTr.appendChild(el('th', null, 'Сумма'));
    }
    thead.appendChild(theadTr);
    built.t.appendChild(thead);

    const tbody = el('tbody');
    const grandMonths = new Array(12).fill(null);
    const grandAddr = { 'Рабочая 23': null, 'Рабочая 23А': null, none: null, sum: null };

    SERVICES.forEach(cfg => {
      const svcRecs = recs.filter(r => r.service === cfg.key);
      if (!svcRecs.length) return;   // пустые строки не рисуем
      const tr = el('tr');
      tr.appendChild(el('td', 'rep-name', cfg.icon + ' ' + cfg.key));

      if (rep.ptype === 'year') {
        for (let m = 1; m <= 12; m++) {
          const monthRecs = svcRecs.filter(r => isAnnualRec(r)
            ? !!(r.payment_date && r.payment_date.startsWith(
                rep.pYearSel + '-' + String(m).padStart(2, '0')))
            : r.period_month === m);
          const v = sumMetric(monthRecs, null, null, rep.metric);
          if (v !== null) {
            grandMonths[m - 1] = Logic.round2((grandMonths[m - 1] || 0) + v);
          }
          tr.appendChild(moneyCell(v));
        }
        const vTotal = sumMetric(svcRecs, null, null, rep.metric);
        if (vTotal !== null) {
          grandAddr.sum = Logic.round2((grandAddr.sum || 0) + vTotal);
        }
        tr.appendChild(moneyCell(vTotal));
      } else {
        REP_BUCKETS.forEach(b => {
          const v = sumMetric(svcRecs, null, b, rep.metric);
          if (v !== null) grandAddr[b] = Logic.round2((grandAddr[b] || 0) + v);
          tr.appendChild(moneyCell(v));
        });
        const vSum = sumMetric(svcRecs, null, null, rep.metric);
        if (vSum !== null) {
          grandAddr.sum = Logic.round2((grandAddr.sum || 0) + vSum);
        }
        tr.appendChild(moneyCell(vSum));
      }
      tbody.appendChild(tr);
    });

    const trT = el('tr', 'rep-total');
    trT.appendChild(el('td', null, 'Итого'));
    if (rep.ptype === 'year') {
      grandMonths.forEach(v => trT.appendChild(moneyCell(v)));
      trT.appendChild(moneyCell(grandAddr.sum));
    } else {
      REP_BUCKETS.forEach(b => trT.appendChild(moneyCell(grandAddr[b])));
      trT.appendChild(moneyCell(grandAddr.sum));
    }
    tbody.appendChild(trT);

    built.t.appendChild(tbody);
    box.appendChild(built.wrap);
    return box;
  }

  // ----- Сравнительный отчёт -----

  function buildCompare() {
    const modeA = compareMode('a');
    const modeB = compareMode('b');
    const recsA = repRecords(modeA);
    const recsB = repRecords(modeB);
    const labelA = modeLabel(modeA);
    const labelB = modeLabel(modeB);

    const box = resultBox(
      'Сравнительный · ' + labelA + ' и ' + labelB + ' · ' + REP_METRICS[rep.metric]);
    if (!recsA.length && !recsB.length) {
      box.appendChild(emptyBox('Нет записей за выбранные периоды — измените параметры.'));
      return box;
    }

    const built = repTable(560);
    const thead = el('thead');
    const tr = el('tr');
    tr.appendChild(el('th', null, 'Услуга'));
    tr.appendChild(el('th', null, labelA));
    tr.appendChild(el('th', null, labelB));
    tr.appendChild(el('th', null, 'Разница'));
    thead.appendChild(tr);
    built.t.appendChild(thead);

    const tbody = el('tbody');
    let totA = null, totB = null;

    SERVICES.forEach(cfg => {
      const vA = sumMetric(recsA, cfg.key, null, rep.metric);
      const vB = sumMetric(recsB, cfg.key, null, rep.metric);
      if (vA === null && vB === null) return;
      if (vA !== null) totA = Logic.round2((totA || 0) + vA);
      if (vB !== null) totB = Logic.round2((totB || 0) + vB);
      const row = el('tr');
      row.appendChild(el('td', 'rep-name', cfg.icon + ' ' + cfg.key));
      row.appendChild(moneyCell(vA));
      row.appendChild(moneyCell(vB));
      row.appendChild(diffCell(vA, vB));
      tbody.appendChild(row);
    });

    const trT = el('tr', 'rep-total');
    trT.appendChild(el('td', null, 'Итого'));
    trT.appendChild(moneyCell(totA));
    trT.appendChild(moneyCell(totB));
    trT.appendChild(diffCell(totA, totB));
    tbody.appendChild(trT);

    built.t.appendChild(tbody);
    box.appendChild(built.wrap);
    return box;
  }

  // ----- Детализация -----

  function buildDetail() {
    const mode = currentMode();
    const recs = repRecords(mode);
    recs.sort((a, b) =>
      (a.period_year - b.period_year) ||
      ((a.period_month || 12) - (b.period_month || 12)) ||
      a.service.localeCompare(b.service, 'ru'));

    const box = resultBox(
      'Детализация · ' + modeLabel(mode) + ' · записей: ' + recs.length);
    if (!recs.length) {
      box.appendChild(emptyBox('Нет записей за выбранный период — измените параметры.'));
      return box;
    }

    const built = repTable(660);
    const thead = el('thead');
    const tr = el('tr');
    ['Период', 'Услуга', 'Адрес', 'Факт', 'Начислено', 'Долг/аванс', 'Метки']
      .forEach((h, i) => {
        tr.appendChild(el('th', (i < 3 || i === 6) ? 'rep-left' : null, h));
      });
    thead.appendChild(tr);
    built.t.appendChild(thead);

    const tbody = el('tbody');
    let totFact = null, totAcc = null, totDebt = null;

    recs.forEach(r => {
      const cfg = SERVICES.find(c => c.key === r.service);
      const tr = el('tr');
      tr.appendChild(el('td', 'rep-left',
        Logic.periodLabel(r.period_year, r.period_month)));

      let name = (cfg ? cfg.icon + ' ' : '') + r.service;
      if (r.subservice) name += ' · ' + r.subservice;
      tr.appendChild(el('td', 'rep-left', name));
      tr.appendChild(el('td', 'rep-left', r.address || '—'));

      const f = Logic.toNum(r.fact_payment);
      const a = recAccrued(r);
      const d = Logic.toNum(r.debt_advance);
      if (f !== null) totFact = Logic.round2((totFact || 0) + f);
      if (a !== null) totAcc = Logic.round2((totAcc || 0) + a);
      if (d !== null) totDebt = Logic.round2((totDebt || 0) + d);

      tr.appendChild(moneyCell(f));
      tr.appendChild(moneyCell(a));
      tr.appendChild(debtCell(d));

      const tdB = el('td', 'rep-left rep-badge-cell');
      if (r.flag_paid) tdB.appendChild(el('span', 'rep-badge ok', 'оплачено'));
      if (cfg && cfg.kind === 'readings' && r.flag_readings_submitted) {
        tdB.appendChild(el('span', 'rep-badge read', 'показания'));
      }
      if (!tdB.childNodes.length) tdB.textContent = '—';
      tr.appendChild(tdB);
      tbody.appendChild(tr);
    });

    const trT = el('tr', 'rep-total');
    trT.appendChild(el('td', 'rep-left', 'Итого'));
    trT.appendChild(el('td', null, ''));
    trT.appendChild(el('td', null, ''));
    trT.appendChild(moneyCell(totFact));
    trT.appendChild(moneyCell(totAcc));
    trT.appendChild(debtCell(totDebt));
    trT.appendChild(el('td', null, ''));
    tbody.appendChild(trT);

    built.t.appendChild(tbody);
    box.appendChild(built.wrap);
    return box;
  }

  // ----- Сборка страницы «Отчёты» -----

  function buildConstructorCard() {
    const card = el('div', 'rep-block');
    card.appendChild(el('div', 'rep-title', '🧩 Конструктор отчёта'));
    card.appendChild(el('div', 'rep-note',
      'Настройте параметры — отчёт построится сразу. ' +
      '«Начислено» — сумма по формуле без учёта долга/аванса; ' +
      'у интернета и телевидения начисленной суммы нет.'));

    const row1 = el('div', 'hist-panel-row');
    row1.appendChild(histSelect('Тип отчёта', [
      { value: 'summary', label: 'Сводный' },
      { value: 'compare', label: 'Сравнительный' },
      { value: 'detail', label: 'Детализация' }
    ], rep.type, v => { rep.type = v; renderReports(); }));
    if (rep.type !== 'detail') {
      row1.appendChild(histSelect('Значение', [
        { value: 'fact', label: 'Факт оплаты' },
        { value: 'accrued', label: 'Начислено (по формуле)' },
        { value: 'debt', label: 'Долг/Аванс' }
      ], rep.metric, v => { rep.metric = v; renderReports(); }));
    }
    card.appendChild(row1);

    if (rep.type === 'compare') {
      card.appendChild(comparePeriodRow('Период A', 'a'));
      card.appendChild(comparePeriodRow('Период B', 'b'));
    } else {
      card.appendChild(periodRow());
    }

    const rowF = el('div', 'hist-panel-row');
    rowF.appendChild(histSelect('Адрес', [
      { value: '', label: 'Все адреса' },
      { value: 'Рабочая 23', label: 'Рабочая 23' },
      { value: 'Рабочая 23А', label: 'Рабочая 23А' },
      { value: 'none', label: 'Без адреса' }
    ], rep.fAddress, v => { rep.fAddress = v; renderReports(); }));
    rowF.appendChild(histSelect('Услуга',
      [{ value: '', label: 'Все услуги' }].concat(
        SERVICES.map(c => ({ value: c.key, label: c.icon + ' ' + c.key }))),
      rep.fService, v => { rep.fService = v; renderReports(); }));
    card.appendChild(rowF);

    const rowC = el('div', 'hist-panel-row');
    rowC.appendChild(histChip('не оплачено', rep.fUnpaid,
      v => { rep.fUnpaid = v; renderReports(); }));
    rowC.appendChild(histChip('не переданы показания', rep.fNoReadings,
      v => { rep.fNoReadings = v; renderReports(); }));
    card.appendChild(rowC);

    if (rep.type === 'summary') card.appendChild(buildSummary());
    else if (rep.type === 'compare') card.appendChild(buildCompare());
    else card.appendChild(buildDetail());
    return card;
  }

  function renderReports() {
    const root = document.getElementById('reports-root');
    if (!root) return;
    repInit();
    root.innerHTML = '';
    root.appendChild(buildDefaultCard());
    root.appendChild(buildConstructorCard());
  }

  // ---------- Раздел «Архив» (этап 6) ----------

  // Сумма оплат по списку записей
  function paySum(list) {
    return list.reduce((s, r) => s + (Logic.toNum(r.fact_payment) || 0), 0);
  }

  function renderArchive() {
    const root = document.getElementById('archive-root');
    if (!root) return;
    root.innerHTML = '';

    // ----- Загрузка файла архива -----
    const upCard = el('div', 'info-card');
    upCard.appendChild(el('div', null, '📥 Загрузить архив'));
    upCard.appendChild(el('div', 'muted',
      'Файл ZIP (внутри JSON и/или CSV), JSON или CSV. ' +
      'Каждая запись попадает в архив своего года — по дате оплаты.'));
    const fileInp = el('input');
    fileInp.type = 'file';
    fileInp.accept = '.zip,.json,.csv';
    fileInp.className = 'inp arch-file';
    fileInp.addEventListener('change', async () => {
      const f = fileInp.files && fileInp.files[0];
      if (!f) return;
      try {
        let recs = [];
        if (/\.zip$/i.test(f.name)) {
          const entries = await Pack.readZip(await f.arrayBuffer());
          const j = entries.find(e => /\.json$/i.test(e.name));
          const c = entries.find(e => /\.csv$/i.test(e.name));
          if (j) recs = JSON.parse(new TextDecoder().decode(j.data));
          else if (c) recs = Pack.parseCSV(new TextDecoder().decode(c.data));
          else toast('В ZIP нет файлов JSON или CSV');
        } else if (/\.json$/i.test(f.name)) {
          recs = JSON.parse(await f.text());
        } else if (/\.csv$/i.test(f.name)) {
          recs = Pack.parseCSV(await f.text());
        } else {
          toast('Поддерживаются файлы ZIP, JSON и CSV');
        }
        if (recs && !Array.isArray(recs) && Array.isArray(recs.records)) recs = recs.records;
        if (Array.isArray(recs) && recs.length) {
          const n = Data.addArchived(recs);
          toast(n ? 'В архив добавлено записей: ' + n : 'Новых записей не найдено');
        }
      } catch (e) {
        console.error(e);
        toast('Не удалось прочитать файл');
      }
      fileInp.value = '';
      renderArchive();
    });
    upCard.appendChild(fileInp);
    root.appendChild(upCard);

    const years = Object.keys(Data.state.archives || {}).sort().reverse();

    if (!years.length) {
      root.appendChild(el('div', 'placeholder-box',
        'Архив пуст. Записи с датой оплаты старше года автоматически уходят сюда ' +
        'при запуске приложения. Также можно архивировать выбранные записи в «Истории».'));
      return;
    }

    years.forEach(y => {
      const recs = Data.state.archives[y] || [];
      const card = el('div', 'info-card');

      const head = el('div', 'arch-year-head');
      head.appendChild(el('div', 'arch-title',
        '📅 ' + (y === 'без года' ? 'Без года' : y + ' год')));
      head.appendChild(el('div', 'arch-meta',
        'записей: ' + recs.length + ' · оплачено: ' + Logic.fmtMoney(paySum(recs))));
      card.appendChild(head);

      const btns = el('div', 'btn-row');

      const zipBtn = el('button', 'btn btn-ghost', 'Скачать ZIP');
      zipBtn.type = 'button';
      zipBtn.addEventListener('click', () => {
        const enc = new TextEncoder();
        const blob = Pack.makeZip([
          { name: 'kommyn-arhiv-' + y + '.json',
            data: enc.encode(JSON.stringify(recs, null, 2)) },
          { name: 'kommyn-arhiv-' + y + '.csv',
            data: enc.encode('\ufeff' + Pack.toCSV(recs)) }
        ]);
        Pack.download('kommyn-arhiv-' + y + '.zip', blob);
        toast('Архив ' + y + ' скачан');
      });
      btns.appendChild(zipBtn);

      const backAll = el('button', 'btn btn-ghost', 'Вернуть всё в историю');
      backAll.type = 'button';
      backAll.addEventListener('click', () => {
        confirmDialog('Вернуть все записи ' + y + ' года в историю?', () => {
          const n = recs.length;
          Data.restoreRecords(recs.map(r => r.id));
          toast('Возвращено записей: ' + n);
          renderArchive();
        }, 'Вернуть');
      });
      btns.appendChild(backAll);
      card.appendChild(btns);

      // ----- Разбивка по месяцам -----
      const byMonth = {};
      recs.forEach(r => {
        const m = r.period_month || 0;   // 0 — годовые записи
        (byMonth[m] = byMonth[m] || []).push(r);
      });
      Object.keys(byMonth).sort((a, b) => Number(a) - Number(b)).forEach(m => {
        const list = byMonth[m];
        const box = el('div', 'arch-month');

        const mh = el('div', 'arch-month-head');
        mh.appendChild(el('div', 'arch-month-title',
          (Number(m) ? Logic.MONTHS[Number(m) - 1] : 'Годовые') +
          ' · записей: ' + list.length + ' · ' + Logic.fmtMoney(paySum(list))));
        const mb = el('button', 'btn btn-ghost arch-back', 'Вернуть месяц');
        mb.type = 'button';
        mb.addEventListener('click', () => {
          confirmDialog('Вернуть эти записи в историю?', () => {
            Data.restoreRecords(list.map(r => r.id));
            toast('Возвращено записей: ' + list.length);
            renderArchive();
          }, 'Вернуть');
        });
        mh.appendChild(mb);
        box.appendChild(mh);

        list.forEach(rec => {
          const cfg = SERVICES.find(c => c.key === rec.service);
          const row = el('div', 'arch-row');
          row.appendChild(el('span', 'hist-icon', cfg ? cfg.icon : '•'));
          const main = el('div', 'arch-row-main');
          main.appendChild(el('div', 'arch-row-title',
            rec.service +
            (rec.subservice ? ' · ' + rec.subservice : '') +
            (rec.address ? ' · ' + rec.address : '')));
          main.appendChild(el('div', 'arch-row-sub',
            Logic.periodLabel(rec.period_year, rec.period_month) +
            ' · оплата ' + fmtDate(rec.payment_date)));
          row.appendChild(main);
          const fact = Logic.toNum(rec.fact_payment);
          row.appendChild(el('div', 'hist-amount' + (fact === null ? ' none' : ''),
            Logic.fmtMoney(fact)));
          box.appendChild(row);
        });

        card.appendChild(box);
      });

      root.appendChild(card);
    });
  }

  // ---------- Страница «Настройки» (информация) ----------

  function renderSettingsInfo() {
    const root = document.getElementById('settings-info');
    if (!root) return;
    root.innerHTML = '';

    const card = el('div', 'info-card');
    if (Data.isHealthy()) {
      card.appendChild(el('div', null, '✅ Хранилище работает'));
      card.appendChild(el('div', 'muted',
        'Запусков приложения: ' + (Data.state.prefs.launches || 1) +
        ' · Записей в базе: ' + Data.state.records.length));
    } else {
      card.appendChild(el('div', null,
        '⚠️ Хранилище недоступно — данные не будут сохраняться'));
    }
    root.appendChild(card);

    const card2 = el('div', 'info-card');
    card2.appendChild(el('div', null, '🔧 Собрано: этапы 1–6 из 8'));
    card2.appendChild(el('div', 'muted',
      'Дальше: тарифы/жильцы/импорт-экспорт (этап 7), упаковка в EXE/APK (этап 8).'));
    root.appendChild(card2);
  }

  return { el, toast, renderDashboard, renderHistory, renderReports,
           renderArchive, renderSettingsInfo };
})();
