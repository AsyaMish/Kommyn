/* ============================================
   Коммуналка — «Упаковщик» (zip.js)
   ZIP-файлы и CSV для выгрузки/загрузки архивов.
   Работает полностью офлайн, без библиотек.
   ============================================ */
'use strict';

const Pack = (() => {

  // ----- CRC32 (контрольная сумма для ZIP) -----

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ----- Сборка ZIP (без сжатия — способ «store») -----

  function makeZip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    const now = new Date();
    const dTime = ((now.getHours() << 11) | (now.getMinutes() << 5) |
                   (now.getSeconds() >> 1)) & 0xFFFF;
    const dDate = (((now.getFullYear() - 1980) << 9) |
                   ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

    files.forEach(f => {
      const nameB = enc.encode(f.name);
      const data = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
      const crc = crc32(data);

      // Локальный заголовок файла
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);          // версия ZIP
      lh.setUint16(6, 0x0800, true);      // имена в UTF-8
      lh.setUint16(8, 0, true);           // без сжатия
      lh.setUint16(10, dTime, true);
      lh.setUint16(12, dDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameB.length, true);
      lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), nameB, data);

      central.push({ nameB, crc, size: data.length, offset });
      offset += 30 + nameB.length + data.length;
    });

    // Центральный каталог
    const cdStart = offset;
    let cdSize = 0;
    central.forEach(c => {
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dTime, true);
      ch.setUint16(14, dDate, true);
      ch.setUint32(16, c.crc, true);
      ch.setUint32(20, c.size, true);
      ch.setUint32(24, c.size, true);
      ch.setUint16(28, c.nameB.length, true);
      ch.setUint32(42, c.offset, true);
      chunks.push(new Uint8Array(ch.buffer), c.nameB);
      cdSize += 46 + c.nameB.length;
    });

    // Конец каталога
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, central.length, true);
    end.setUint16(10, central.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, cdStart, true);
    chunks.push(new Uint8Array(end.buffer));

    return new Blob(chunks, { type: 'application/zip' });
  }

  // ----- Чтение ZIP -----

  async function readZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const dv = new DataView(buffer);
    const dec = new TextDecoder();

    // Ищем «конец центрального каталога» с конца файла
    let eocd = -1;
    const min = Math.max(0, bytes.length - 22 - 65536);
    for (let i = bytes.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Это не ZIP-файл');

    const count = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    const entries = [];

    for (let k = 0; k < count; k++) {
      if (ptr + 46 > bytes.length) break;
      if (dv.getUint32(ptr, true) !== 0x02014b50) break;
      const method = dv.getUint16(ptr + 10, true);
      const compSize = dv.getUint32(ptr + 20, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const commLen = dv.getUint16(ptr + 32, true);
      const localOff = dv.getUint32(ptr + 42, true);

      // Размеры имени/доп. полей берём из локального заголовка
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const name = dec.decode(bytes.slice(localOff + 30, localOff + 30 + lNameLen));
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = bytes.slice(start, start + compSize);

      let data;
      if (method === 0) {
        data = raw;                                   // без сжатия
      } else if (method === 8 && window.DecompressionStream) {
        const stream = new Blob([raw]).stream()
          .pipeThrough(new DecompressionStream('deflate-raw'));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error('Сжатие в файле не поддерживается');
      }
      entries.push({ name, data });
      ptr += 46 + nameLen + extraLen + commLen;
    }
    return entries;
  }

  // ----- CSV -----

  const CSV_FIELDS = [
    'id', 'service', 'address', 'subservice', 'period_year', 'period_month', 'record_type',
    'previous_readings', 'current_readings', 'tariff', 'residents_count',
    'tax_house', 'tax_land', 'tax_car',
    'debt_advance', 'debt_advance_closed',
    'fact_payment', 'payment_date', 'readings_submitted_date',
    'flag_readings_submitted', 'flag_paid', 'comment', 'technical_date'
  ];
  const NUM_FIELDS = ['previous_readings', 'current_readings', 'tariff',
    'residents_count', 'tax_house', 'tax_land', 'tax_car',
    'debt_advance', 'fact_payment'];
  const BOOL_FIELDS = ['debt_advance_closed', 'flag_readings_submitted', 'flag_paid'];

  function csvCell(v) {
    let s = (v === null || v === undefined) ? '' : String(v);
    if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // Записи → текст CSV. Разделитель «;» — так дружелюбнее к Excel.
  function toCSV(records) {
    const rows = [CSV_FIELDS.join(';')];
    (records || []).forEach(r => {
      rows.push(CSV_FIELDS.map(f => {
        const v = r[f];
        if (NUM_FIELDS.indexOf(f) >= 0) {
          return (v === null || v === undefined || v === '') ? '' :
            String(v).replace('.', ',');
        }
        if (BOOL_FIELDS.indexOf(f) >= 0) return v ? 'да' : 'нет';
        return csvCell(v);
      }).join(';'));
    });
    return rows.join('\r\n');
  }

  // Текст CSV → записи
  function parseCSV(text) {
    text = String(text).replace(/^\ufeff/, '');

    // Разделитель — по шапке: чего больше, «;» или «,»
    const cut = text.indexOf('\n');
    const headLine = text.slice(0, cut < 0 ? text.length : cut);
    const sep = headLine.split(';').length >= headLine.split(',').length ? ';' : ',';

    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQ = false;
        } else cell += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];

    const head = rows.shift().map(h => h.trim());
    return rows
      .filter(r => r.some(c => c.trim() !== ''))
      .map(r => {
        const src = {};
        head.forEach((h, i) => { src[h] = (r[i] || '').trim(); });

        const out = {
          id: src.id || null,
          service: src.service || '',
          address: src.address || null,
          subservice: src.subservice || null
        };
        out.period_year = parseInt(src.period_year, 10) || null;
        out.period_month = src.period_month
          ? (parseInt(src.period_month, 10) || null)
          : null;
        out.record_type = src.record_type ||
          (out.period_month ? 'monthly' : 'annual');

        NUM_FIELDS.forEach(f => {
          const s = String(src[f] || '').replace(/\s/g, '').replace(',', '.');
          const v = s === '' ? NaN : parseFloat(s);
          out[f] = isNaN(v) ? null : v;
        });
        BOOL_FIELDS.forEach(f => {
          out[f] = ['да', 'yes', 'true', '1', 'v'].indexOf(
            String(src[f] || '').toLowerCase()) >= 0;
        });
        out.payment_date = src.payment_date || null;
        out.readings_submitted_date = src.readings_submitted_date || null;
        out.comment = src.comment || null;
        out.technical_date = src.technical_date || new Date().toISOString();
        return out;
      });
  }

  // ----- Скачивание файла -----

  function download(filename, content) {
    const blob = content instanceof Blob
      ? content
      : new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return { makeZip, readZip, toCSV, parseCSV, download };
})();
