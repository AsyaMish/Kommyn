/* ============================================
   Коммуналка — «Пульт» (app.js)
   Запуск, навигация, выбранный месяц.
   ============================================ */
'use strict';

const App = (() => {

  const PAGES = ['dashboard', 'history', 'reports', 'archive', 'settings'];
  const TITLES = {
    dashboard: 'Содержание',
    history: 'История',
    reports: 'Отчёты',
    archive: 'Архив',
    settings: 'Настройки'
  };

  let period = { year: 2026, month: 1 };   // выбранный месяц на «Содержании»

  // ----- Выбранный месяц (по умолчанию — текущий) -----

  function initPeriod() {
    const now = new Date();
    period = { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  function renderPeriod() {
    const label = document.getElementById('period-label');
    if (label) label.textContent = Logic.MONTHS[period.month - 1] + ' ' + period.year;
  }

  function shiftMonth(delta) {
    let m = period.month + delta;
    let y = period.year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    period = { year: y, month: m };
    renderPeriod();
    UI.renderDashboard();   // карточки зависят от выбранного месяца
  }

  // Поставить выбранный период (например, при открытии записи из истории)
  function setPeriod(year, month) {
    period = { year: year, month: month };
    renderPeriod();
  }

  // ----- Переключение разделов -----

  function pageFromHash() {
    const h = location.hash.replace('#', '');
    return PAGES.includes(h) ? h : 'dashboard';
  }

  function showPage(id) {
    document.querySelectorAll('.page').forEach(s => {
      s.classList.toggle('active', s.id === 'page-' + id);
    });
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.page === id);
    });
    const title = document.getElementById('page-title');
    if (title) title.textContent = TITLES[id] || '';
    if (id === 'dashboard') UI.renderDashboard();
    if (id === 'history') UI.renderHistory();
    if (id === 'settings') UI.renderSettingsInfo();
    window.scrollTo(0, 0);
  }

  function navigate(id) {
    if (location.hash === '#' + id) showPage(id);
    else location.hash = id;
  }

  // ----- Запуск -----

  function wireEvents() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });
    document.getElementById('period-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('period-next').addEventListener('click', () => shiftMonth(1));
    window.addEventListener('hashchange', () => showPage(pageFromHash()));
  }

  function start() {
    Data.init();
    Data.state.prefs.launches = (Data.state.prefs.launches || 0) + 1;
    Data.persist();
    initPeriod();
    wireEvents();
    renderPeriod();
    showPage(pageFromHash());
    console.log('Коммуналка: приложение запущено, запуск № ' + Data.state.prefs.launches);
  }

  document.addEventListener('DOMContentLoaded', start);

  return {
    get period() { return period; },
    setPeriod, showPage
  };
})();
