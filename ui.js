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
    { key: 'Интернет',   icon: '🌐', kind: 'internet', subservices: ['Мобильный', 'Домашний'] },
    { key: 'Телевидение', icon: '📺', kind: 'annual' },
    { key: 'Налоги',     icon: '🧾', kind: 'taxes',    addresses: ['Рабочая 23А'] }
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

  function confirmDialog(text, onYes) {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const overlay = el('div', 'modal-overlay');
    const box = el('div', 'modal');
    box.appendChild(el('div', 'modal-text', text));
    const actions = el('div', 'modal-actions');

    const no = el('button', 'btn btn-ghost', 'Отменить');
    no.type = 'button';
    no.addEventListener('click', () => { root.innerHTML = ''; });

    const yes = el('button', 'btn btn-del', 'Удалить');
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

  // Вкладки адресов/подпунктов + карточка.
  // preferred — какую вкладку выбрать (при открытии из истории);
  // без него сохраняем текущую выбранную вкладку.
  function renderServiceBody(det, cfg, preferred) {
    const body = det.querySelector('.service-body');
    const prevSel = body.querySelector('.addr-chip.sel');
    const prevText = prevSel ? prevSel.textContent : null;
    body.innerHTML = '';

    const options = cfg.addresses || cfg.subservices || [];
    const cardHost = el('div', 'card-host');

    // Услуга без вкладок (Телевидение) — карточка сразу
    if (!options.length) {
      body.appendChild(cardHost);
      renderCard(cardHost, cfg, null, null);
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
          cfg.addresses ? opt : null,
          cfg.subservices ? opt : null);
      });
      tabs.appendChild(chip);
    });

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

    // ----- Панель фильтров -----
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

    root.appendChild(panel);

    // ----- Список записей -----
    const list = histFiltered();

    const toolbar = el('div', 'hist-toolbar');
    toolbar.appendChild(el('div', 'hist-count',
      'Записей: ' + list.length +
      (list.length !== Data.state.records.length
        ? ' из ' + Data.state.records.length : '')));
    root.appendChild(toolbar);

    // Панель массовых действий
    if (hist.selected.size > 0) {
      const bar = el('div', 'hist-massbar');
      bar.appendChild(el('span', null, 'Выбрано: ' + hist.selected.size));
      const del = el('button', 'btn btn-del hist-mass-del', 'Удалить выбранные');
      del.type = 'button';
      del.addEventListener('click', () => {
        confirmDialog('Вы хотите удалить выбранные записи (' + hist.selected.size + ')?', () => {
          hist.selected.forEach(id => Data.removeRecord(id));
          const n = hist.selected.size;
          hist.selected.clear();
          toast('Удалено: ' + n);
          renderHistory();
        });
      });
      bar.appendChild(del);
      root.appendChild(bar);
    }

    if (!list.length) {
      root.appendChild(el('div', 'placeholder-box',
        Data.state.records.length
          ? 'Ничего не найдено — попробуйте изменить фильтры'
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
    card2.appendChild(el('div', null, '🔧 Собрано: этапы 1–4 из 8'));
    card2.appendChild(el('div', 'muted',
      'Дальше: отчёты (этап 5), архив (этап 6), тарифы/жильцы/импорт-экспорт (этап 7).'));
    root.appendChild(card2);
  }

  return { el, toast, renderDashboard, renderHistory, renderSettingsInfo };
})();
