/* ============================================
   Коммуналка — «Рисовщик» (ui.js)
   Показывает на экране содержимое разделов.
   ============================================ */
'use strict';

const UI = (() => {

  // Маленькая заготовка: создать элемент страницы
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // Всплывающая подсказка внизу экрана
  function toast(text, ms = 2200) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const node = el('div', 'toast', text);
    root.appendChild(node);
    setTimeout(() => node.remove(), ms);
  }

  // Информация на странице «Настройки» (пока — проверка хранилища)
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
    card2.appendChild(el('div', null, '🔧 Собрано: этап 1 из 8 (каркас)'));
    card2.appendChild(el('div', 'muted',
      'Тарифы, жильцы, импорт/экспорт и сброс появятся на этапе 7.'));
    root.appendChild(card2);
  }

  return { el, toast, renderSettingsInfo };
})();
