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
    { key: 'Телевидение', icon: '📺', kind: 'later' },
    { key: 'Налоги',     icon: '🧾', kind: 'later' }
  ];

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
    const rec = Data.findRecord(cfg.key, address, subservice, period.year, period.month);
    host.innerHTML = '';

    const card = el('div', 'card');
    const head = el('div', 'card-head');
    let title = cfg.icon + ' ' + cfg.key;
    if (subservice) title += ' · ' + subservice;
    if (address) title += ' · ' + address;
    head.appendChild(el('div', 'card-title', title));
    head.appendChild(el('div', 'card-sub',
      Logic.periodLabel(period.year, period.month) +
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
      const debtInp = numInput(rec ? rec.debt_advance :
        Logic.carryDebt(Data.state.records, cfg.key, address, subservice, period.year, period.month));
      const debtCheck = checkRow('использован долг/аванс', rec ? rec.debt_advance_closed : false);
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
        const amount = Logic.calcAmount(consumption, t, debtInp.value);
        sumRow.querySelector('.fval').textContent = Logic.fmtMoney(amount);
        if (!factManual) factInp.value = amount === null ? '' : String(amount).replace('.', ',');
      }

      [prevInp, curInp, tariffInp].forEach(i => i.addEventListener('input', recalc));
      debtInp.addEventListener('input', () => { paintDebt(debtInp); recalc(); });
      factInp.addEventListener('input', () => { factManual = true; });
      paintDebt(debtInp);

      card.appendChild(fieldRow('Предыдущие показания', prevInp));
      card.appendChild(fieldRow('Текущие показания', curInp));
      card.appendChild(fieldRow('Тариф', tariffInp));
      card.appendChild(consRow);

      const debtRow = el('div', 'frow');
      debtRow.appendChild(el('div', 'flabel', 'Долг / Аванс'));
      debtRow.appendChild(debtInp);
      debtRow.appendChild(debtCheck);
      debtRow.appendChild(hintRow('аванс — без минуса, долг — с минусом'));
      card.appendChild(debtRow);

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
        debt_advance: Logic.toNum(debtInp.value),
        debt_advance_closed: isChecked(debtCheck),
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
      const debtInp = numInput(rec ? rec.debt_advance :
        Logic.carryDebt(Data.state.records, cfg.key, address, subservice, period.year, period.month));
      const debtCheck = checkRow('использован долг/аванс', rec ? rec.debt_advance_closed : false);
      const sumRow = infoRow('Сумма', '—', true);
      const factInp = numInput(rec ? rec.fact_payment : null);
      const payInp = dateInput(rec ? rec.payment_date : null);
      const paidCheck = checkRow('оплачено', rec ? rec.flag_paid : false);

      function recalc() {
        const amount = Logic.calcTrashAmount(resInp.value, tariffInp.value, debtInp.value);
        sumRow.querySelector('.fval').textContent = Logic.fmtMoney(amount);
        if (!factManual) factInp.value = amount === null ? '' : String(amount).replace('.', ',');
      }

      [resInp, tariffInp].forEach(i => i.addEventListener('input', recalc));
      debtInp.addEventListener('input', () => { paintDebt(debtInp); recalc(); });
      factInp.addEventListener('input', () => { factManual = true; });
      paintDebt(debtInp);

      card.appendChild(fieldRow('Количество жильцов', resInp));
      card.appendChild(fieldRow('Тариф', tariffInp));
      card.appendChild(sumRow);

      const debtRow = el('div', 'frow');
      debtRow.appendChild(el('div', 'flabel', 'Долг / Аванс'));
      debtRow.appendChild(debtInp);
      debtRow.appendChild(debtCheck);
      debtRow.appendChild(hintRow('аванс — без минуса, долг — с минусом'));
      card.appendChild(debtRow);

      card.appendChild(fieldRow('Факт оплаты', factInp));
      card.appendChild(fieldRow('Дата оплаты', payInp));
      card.appendChild(paidCheck);

      addButtons(card, host, cfg, address, subservice, rec, () => ({
        residents_count: Logic.toNum(resInp.value),
        tariff: Logic.toNum(tariffInp.value),
        debt_advance: Logic.toNum(debtInp.value),
        debt_advance_closed: isChecked(debtCheck),
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

      const debtInp = numInput(rec ? rec.debt_advance :
        Logic.carryDebt(Data.state.records, cfg.key, address, subservice, period.year, period.month));
      const debtCheck = checkRow('использован долг/аванс', rec ? rec.debt_advance_closed : false);
      const factInp = numInput(rec ? rec.fact_payment : null);
      const payInp = dateInput(rec ? rec.payment_date : null);
      const paidCheck = checkRow('оплачено', rec ? rec.flag_paid : false);

      debtInp.addEventListener('input', () => paintDebt(debtInp));
      paintDebt(debtInp);

      const debtRow = el('div', 'frow');
      debtRow.appendChild(el('div', 'flabel', 'Долг / Аванс'));
      debtRow.appendChild(debtInp);
      debtRow.appendChild(debtCheck);
      debtRow.appendChild(hintRow('аванс — без минуса, долг — с минусом'));
      card.appendChild(debtRow);

      card.appendChild(fieldRow('Факт оплаты', factInp));
      card.appendChild(fieldRow('Дата оплаты', payInp));
      card.appendChild(paidCheck);

      addButtons(card, host, cfg, address, subservice, rec, () => ({
        debt_advance: Logic.toNum(debtInp.value),
        debt_advance_closed: isChecked(debtCheck),
        fact_payment: Logic.toNum(factInp.value),
        payment_date: payInp.value || null,
        flag_paid: isChecked(paidCheck)
      }));
    }

    host.appendChild(card);
  }

  // Кнопки «Сохранить» и «Удалить» внизу карточки
  function addButtons(card, host, cfg, address, subservice, rec, collect) {
    const period = App.period;
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
        period_month: period.month,
        record_type: 'monthly',
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

  // Вкладки адресов/подпунктов + карточка
  function renderServiceBody(det, cfg) {
    const body = det.querySelector('.service-body');
    body.innerHTML = '';

    const options = cfg.addresses || cfg.subservices || [];
    const tabs = el('div', 'addr-chips');
    const cardHost = el('div', 'card-host');

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
    if (options.length) tabs.children[0].click();   // сразу открыть первую вкладку
  }

  function renderDashboard() {
    const detailsList = document.querySelectorAll('#page-dashboard .service');
    SERVICES.forEach((cfg, i) => {
      const det = detailsList[i];
      if (!det) return;
      if (cfg.kind === 'later') {
        det.querySelector('.service-body').innerHTML =
          '<div class="placeholder-box small">Карточка появится на этапе 3</div>';
        return;
      }
      if (det._onToggle) det.removeEventListener('toggle', det._onToggle);
      det._onToggle = function () { if (det.open) renderServiceBody(det, cfg); };
      det.addEventListener('toggle', det._onToggle);
      if (det.open) renderServiceBody(det, cfg);
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
    card2.appendChild(el('div', null, '🔧 Собрано: этапы 1–2 из 8'));
    card2.appendChild(el('div', 'muted',
      'Тарифы, жильцы, импорт/экспорт и сброс появятся на этапе 7.'));
    root.appendChild(card2);
  }

  return { el, toast, renderDashboard, renderSettingsInfo };
})();
