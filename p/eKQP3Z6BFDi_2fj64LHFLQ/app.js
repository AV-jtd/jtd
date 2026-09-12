// Трекер поступления: статическая страница вне React-приложения.
// Собирается Vite как отдельная точка входа (см. vite.config.ts), поэтому
// import.meta.env даёт тот же ключ Supabase, что и основное приложение.

(function () {
  // ---------- data ----------
  const PROGRAMS = [
    { id: 'hse-media', tier: 'core', uni: 'ВШЭ', name: 'Медиакоммуникации', exams: 'рус · лит · англ', extra: 'нет', budget: 283, paid: 187, scale: 300, cost: '680 тыс.', places: '30 бюдж. / 97 платн.', note: 'Лучшее попадание. Бюджет только через «Высшую пробу»' },
    { id: 'hse-fashion', tier: 'core', uni: 'ВШЭ, Школа дизайна', name: 'Мода', exams: 'рус · лит', extra: 'творческий проект', budget: null, paid: null, scale: 200, cost: 'уточнить', places: 'уточнить', note: 'Конкурс по проекту, английский не участвует' },
    { id: 'mgimo-journ', tier: 'core', uni: 'МГИМО', name: 'Международная журналистика', exams: 'рус · лит · англ', extra: 'творческое ДВИ', budget: 379, paid: 249, scale: 400, cost: '760 тыс.', places: '30 бюдж. / 37 платн.', note: 'Единственная программа МГИМО под её набор' },
    { id: 'msu-journ', tier: 'core', uni: 'МГУ', name: 'Журналистика', exams: 'рус · лит · англ', extra: 'творческое ДВИ', budget: null, paid: null, scale: 400, cost: 'уточнить', places: 'уточнить', note: 'Пороги смотреть на journ.msu.ru, платно реально' },
    { id: 'ranepa-media', tier: 'budget', uni: 'РАНХиГС, Институт медиа', name: 'Журналистика / Медиакоммуникации', exams: 'рус · лит · англ', extra: 'уточнить', budget: null, paid: null, scale: 300, cost: 'уточнить', places: 'уточнить', note: 'Бюджет при 270 возможен' },
    { id: 'rggu-media', tier: 'budget', uni: 'РГГУ', name: 'Медиакоммуникации', exams: 'рус · лит · англ', extra: 'нет', budget: 260, paid: null, scale: 300, cost: 'уточнить', places: 'уточнить', note: 'Порог 2025 ориентировочный, проверить на rsuh.ru' },
    { id: 'kosygin', tier: 'budget', uni: 'РГУ им. Косыгина', name: 'Реклама и PR / Дизайн костюма', exams: 'проверить набор', extra: 'творческие (дизайн)', budget: null, paid: null, scale: 300, cost: 'низкая', places: 'есть бюджет', note: 'Главный государственный вуз индустрии моды' },
    { id: 'hse-spb', tier: 'backup', uni: 'ВШЭ Санкт-Петербург', name: 'Медиакоммуникации', exams: 'рус · лит · англ', extra: 'нет', budget: null, paid: null, scale: 300, cost: 'уточнить', places: 'уточнить', note: 'Тот же бренд, ниже конкурс' },
    { id: 'spbu-journ', tier: 'backup', uni: 'СПбГУ', name: 'Журналистика', exams: 'рус · лит', extra: 'творческое', budget: null, paid: null, scale: 400, cost: 'уточнить', places: 'уточнить', note: 'Сильная школа, творческий конкурс' },
    { id: 'bhsad', tier: 'backup', uni: 'БВШД (Universal University)', name: 'Fashion', exams: 'внутренние', extra: 'портфолио', budget: null, paid: null, scale: 0, cost: 'высокая', places: 'платно', note: 'Британский диплом, обучение на английском, аккредитация не на всех программах' },
  ];
  const TIERS = [
    { id: 'core', tag: 'Основа', desc: 'Куда целимся. Платно проходит при 270, бюджет требует олимпиады' },
    { id: 'budget', tag: 'Бюджет реально', desc: 'Сильные программы, где 270 хватает на бесплатное место' },
    { id: 'backup', tag: 'Запас', desc: 'Петербург и частный вариант, если основные не сложатся' },
  ];
  const STATUSES = ['Рассматриваем', 'В приоритете', 'Отложено'];

  const MONTHS = [
    { key: '2026-09', m: 'Сентябрь', y: '2026', items: [
      ['сен–окт', 'Школьный этап ВсОШ по литературе и английскому', false],
      ['сен', 'Дни открытых дверей: ВШЭ, Школа дизайна ВШЭ, МГИМО, РАНХиГС', false],
    ]},
    { key: '2026-10', m: 'Октябрь', y: '2026', items: [
      ['окт', 'Регистрация на «Высшую пробу» (медиакоммуникации, журналистика, дизайн)', false],
      ['окт', 'Регистрация на «Ломоносов» (журналистика, литература)', false],
      ['до 1 ноя', 'Вузы публикуют правила приёма 2027: сверить наборы ЕГЭ', true],
    ]},
    { key: '2026-11', m: 'Ноябрь', y: '2026', items: [
      ['ноя', 'Отборочный этап «Высшей пробы» (онлайн)', false],
      ['ноя–дек', 'Отборочный этап «Ломоносова»', false],
      ['ноя–дек', 'Муниципальный этап ВсОШ', false],
    ]},
    { key: '2026-12', m: 'Декабрь', y: '2026', items: [
      ['2 дек', 'Итоговое сочинение, допуск к ЕГЭ', true],
      ['до 31 дек', 'Решение по ДВИ: МГИМО, МГУ или ни то, ни другое', false],
    ]},
    { key: '2027-01', m: 'Январь', y: '2027', items: [
      ['янв–фев', 'Региональный этап ВсОШ', false],
      ['янв', 'Старт подготовки к ДВИ, если решили', false],
    ]},
    { key: '2027-02', m: 'Февраль', y: '2027', items: [
      ['1 фев', 'Последний день подать заявление на ЕГЭ с выбором предметов', true],
      ['фев–мар', 'Заключительные этапы «Высшей пробы» и «Ломоносова»', false],
    ]},
    { key: '2027-03', m: 'Март–апрель', y: '2027', items: [
      ['мар', 'Итоги олимпиад: понятно, есть ли БВИ или 100 баллов', false],
      ['апр', 'Вузы публикуют места и стоимость 2027: пересобрать таблицу', false],
    ]},
    { key: '2027-05', m: 'Май', y: '2027', items: [
      ['май', 'Творческий проект для Школы дизайна ВШЭ в финальном виде', false],
      ['конец мая', 'Старт основного периода ЕГЭ', true],
      ['май', 'Финальный список 5 вузов и порядок приоритетов', false],
    ]},
    { key: '2027-06', m: 'Июнь', y: '2027', items: [
      ['июн', 'ЕГЭ по литературе, русскому, английскому', true],
      ['20 июн', 'Открывается подача документов, Госуслуги', true],
    ]},
    { key: '2027-07', m: 'Июль', y: '2027', items: [
      ['~7–10 июл', 'Дедлайн подачи на программы с ДВИ и творческим конкурсом (уточнить)', true],
      ['середина', 'ДВИ МГИМО, ДВИ МГУ, творческие испытания', false],
      ['25 июл', 'Дедлайн подачи документов на все программы', true],
      ['конец июл', 'Расстановка приоритетов и согласие на зачисление', true],
    ]},
    { key: '2027-08', m: 'Август', y: '2027', items: [
      ['нач. авг', 'Приказы о зачислении, договоры на платное', false],
    ]},
  ];

  const GROUPS = [
    { id: 'olymp', name: 'Олимпиады', tasks: [
      ['o1', 'Зарегистрироваться на «Высшую пробу»: медиакоммуникации, журналистика, дизайн', 'октябрь'],
      ['o2', 'Пройти школьный этап ВсОШ по литературе и английскому', 'сен–окт'],
      ['o3', 'Зарегистрироваться на «Ломоносов»', 'октябрь'],
      ['o4', 'Прорешать задания «Высшей пробы» прошлых лет', 'до ноября'],
      ['o5', 'Отборочный этап «Высшей пробы»', 'ноябрь'],
      ['o6', 'Заключительный этап', 'фев–мар'],
    ]},
    { id: 'fashion', name: 'Творческий проект: Мода', tasks: [
      ['f1', 'Изучить требования к творческому проекту Школы дизайна на 2027', 'октябрь'],
      ['f2', 'Сходить на день открытых дверей Школы дизайна', 'осень'],
      ['f3', 'Посмотреть проекты поступивших прошлых лет', 'осень'],
      ['f4', 'Выбрать тему и формат проекта', 'декабрь'],
      ['f5', 'Собрать проект, показать преподавателю или выпускнику', 'до мая'],
    ]},
    { id: 'dvi', name: 'ДВИ (МГИМО, МГУ)', tasks: [
      ['d1', 'Решить, идём ли на ДВИ вообще', 'до 31 дек'],
      ['d2', 'Разобрать формат творческого ДВИ МГИМО и варианты прошлых лет', 'январь'],
      ['d3', 'Разобрать формат ДВИ журфака МГУ', 'январь'],
      ['d4', 'Найти курсы или репетитора по ДВИ', 'январь'],
      ['d5', 'Написать 5 тренировочных работ в формате ДВИ', 'фев–июн'],
    ]},
    { id: 'ege', name: 'ЕГЭ', tasks: [
      ['e1', 'Итоговое сочинение', '2 дек'],
      ['e2', 'Подать заявление на ЕГЭ: литература, русский, английский', 'до 1 фев'],
      ['e3', 'Пробник №1 по трём предметам', 'ноябрь'],
      ['e4', 'Пробник №2', 'январь'],
      ['e5', 'Пробник №3', 'март'],
      ['e6', 'Пробник №4', 'май'],
    ]},
    { id: 'docs', name: 'Документы и подача', tasks: [
      ['p1', 'Сверить наборы ЕГЭ по всем программам после публикации правил 2027', 'ноябрь'],
      ['p2', 'Обновить пороги и стоимость по данным 2027', 'апрель'],
      ['p3', 'Утвердить 5 вузов и порядок приоритетов', 'май'],
      ['p4', 'Подготовить аттестат, паспорт, СНИЛС, дипломы олимпиад, фото', 'июнь'],
      ['p5', 'Подать документы через Госуслуги', 'с 20 июня'],
      ['p6', 'Подать на программы с ДВИ до раннего дедлайна', 'до ~10 июля'],
      ['p7', 'Расставить приоритеты, дать согласие', 'до 25–30 июля'],
    ]},
  ];

  // ---------- state ----------
  const LS_KEY = 'postuplenie-2027';
  const PAGE_ID = 'eKQP3Z6BFDi_2fj64LHFLQ';
  let state = { tasks: {}, scores: { lit: '', rus: '', eng: '' }, status: {}, notes: '' };
  let timer = null, remoteStamp = null, online = false;

  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) state = merge(state, JSON.parse(raw));
  } catch (e) {}

  function merge(base, inc) {
    if (!inc || typeof inc !== 'object') return base;
    return {
      tasks: Object.assign({}, base.tasks, inc.tasks || {}),
      scores: Object.assign({}, base.scores, inc.scores || {}),
      status: Object.assign({}, base.status, inc.status || {}),
      notes: typeof inc.notes === 'string' ? inc.notes : base.notes,
    };
  }

  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; pushRemote(); }, 500);
  }

  // ---------- render helpers ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function sumScores() {
    const v = ['lit', 'rus', 'eng'].map((k) => parseInt(state.scores[k], 10));
    if (v.some((n) => isNaN(n))) return null;
    return v.reduce((a, b) => a + b, 0);
  }

  function reachChip(p, sum) {
    if (p.scale === 0) return '<span class="chip plain">вне ЕГЭ</span>';
    if (sum === null) return '<span class="chip plain">—</span>';
    if (p.scale === 400) {
      if (p.paid === null) return '<span class="chip info">зависит от ДВИ</span>';
      const need = p.paid - sum;
      return need <= 0
        ? '<span class="chip ok">платно при любом ДВИ</span>'
        : need > 100
          ? '<span class="chip bad">не хватает и с ДВИ</span>'
          : `<span class="chip info">платно при ДВИ ≥ ${need}</span>`;
    }
    if (p.scale === 200) return '<span class="chip info">решает проект</span>';
    if (p.budget !== null && sum >= p.budget) return '<span class="chip ok">бюджет</span>';
    if (p.paid !== null && sum >= p.paid) return '<span class="chip warn">платно</span>';
    if (p.budget === null && p.paid === null) return '<span class="chip plain">порог уточнить</span>';
    return '<span class="chip bad">ниже порога</span>';
  }

  function fmtThreshold(p) {
    const b = p.budget === null ? '—' : p.budget;
    const pd = p.paid === null ? '—' : p.paid;
    const sc = p.scale === 400 ? '<span class="note">из 400, с ДВИ</span>' : p.scale === 200 ? '<span class="note">конкурс по проекту</span>' : '';
    if (p.scale === 0) return '<span class="num">—</span>';
    return `<span class="num">${b} / ${pd}</span>${sc}`;
  }

  function renderPrograms() {
    const sum = sumScores();
    const host = $('#tiers');
    host.innerHTML = '';
    host.style.display = 'grid';
    host.style.gap = '26px';
    TIERS.forEach((t) => {
      const rows = PROGRAMS.filter((p) => p.tier === t.id).map((p) => {
        const st = state.status[p.id] || STATUSES[0];
        const opts = STATUSES.map((s) => `<option${s === st ? ' selected' : ''}>${s}</option>`).join('');
        return `<tr class="${st === 'Отложено' ? 'dim' : ''}" data-id="${p.id}">
          <td class="name"><strong>${esc(p.name)}</strong><span>${esc(p.uni)}</span><span class="note">${esc(p.note)}</span></td>
          <td class="nw">${esc(p.exams)}</td>
          <td>${esc(p.extra)}</td>
          <td>${fmtThreshold(p)}</td>
          <td><span class="num">${esc(p.cost)}</span><span class="note">${esc(p.places)}</span></td>
          <td>${reachChip(p, sum)}</td>
          <td><select id="st-${p.id}" aria-label="Статус ${esc(p.name)}">${opts}</select></td>
        </tr>`;
      }).join('');
      const div = document.createElement('div');
      div.className = 'tier';
      div.innerHTML = `<div class="tier-head"><span class="tag">${t.tag}</span><span class="desc">${t.desc}</span></div>
        <div class="tablewrap"><table>
          <thead><tr><th>Программа</th><th>ЕГЭ</th><th>Доп. испытание</th><th>Порог 2025 бюджет / платно</th><th>Стоимость в год</th><th>При прогнозе</th><th>Статус</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`;
      host.appendChild(div);
    });
    host.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', () => {
        state.status[sel.closest('tr').dataset.id] = sel.value;
        persist(); renderPrograms();
      });
    });
  }

  function renderForecast() {
    ['lit', 'rus', 'eng'].forEach((k) => { const el = $('#s-' + k); if (document.activeElement !== el) el.value = state.scores[k]; });
    const s = sumScores();
    $('#sum').textContent = s === null ? '—' : s;
    $('#sum-hint').textContent = s === null ? 'Заполните все три поля'
      : s >= 283 ? 'Бюджет ВШЭ на Медиакоммуникации в зоне досягаемости'
      : s >= 260 ? 'Платно в ВШЭ уверенно, бюджет РГГУ и РАНХиГС в зоне'
      : 'Платно в ВШЭ проходит, бюджет пока только с олимпиадой';
  }

  function renderTimeline() {
    const now = new Date();
    const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    $('#timeline').innerHTML = MONTHS.map((mo) => {
      const cls = mo.key < cur ? 'past' : mo.key === cur ? 'now' : '';
      const items = mo.items.map(([d, t, hard]) => `<li class="${hard ? 'hard' : ''}"><span class="d">${esc(d)}</span><span>${esc(t)}</span></li>`).join('');
      return `<div class="month ${cls}"><div class="m">${mo.m}<small>${mo.y}</small></div><ul>${items}</ul></div>`;
    }).join('');
  }

  function renderTasks() {
    let total = 0, done = 0;
    $('#groups').innerHTML = GROUPS.map((g) => {
      const d = g.tasks.filter(([id]) => state.tasks[id]).length;
      total += g.tasks.length; done += d;
      const pct = Math.round(100 * d / g.tasks.length);
      const items = g.tasks.map(([id, t, when]) => `<div class="task ${state.tasks[id] ? 'done' : ''}">
        <input type="checkbox" id="t-${id}" ${state.tasks[id] ? 'checked' : ''}>
        <label for="t-${id}">${esc(t)}<span class="when">${esc(when)}</span></label></div>`).join('');
      return `<div class="group"><h3>${g.name}<span class="cnt">${d}/${g.tasks.length}</span></h3><div class="bar"><i style="width:${pct}%"></i></div>${items}</div>`;
    }).join('');
    $('#cd-tasks').innerHTML = `${done}<small>из ${total}</small>`;
    $('#groups').querySelectorAll('input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.id.slice(2);
        if (cb.checked) state.tasks[id] = true; else delete state.tasks[id];
        persist(); renderTasks();
      });
    });
  }

  function renderCountdowns() {
    const days = (iso) => Math.max(0, Math.ceil((new Date(iso) - new Date()) / 86400000));
    $('#cd-essay').innerHTML = `${days('2026-12-02T00:00:00+03:00')}<small>дней</small>`;
    $('#cd-reg').innerHTML = `${days('2027-02-01T23:59:00+03:00')}<small>дней</small>`;
    $('#cd-ege').innerHTML = `${days('2027-05-25T00:00:00+03:00')}<small>дней</small>`;
  }

  function renderAll() {
    renderCountdowns(); renderForecast(); renderPrograms(); renderTasks();
    const n = $('#notes'); if (document.activeElement !== n) n.value = state.notes;
  }

  // ---------- inputs ----------
  ['lit', 'rus', 'eng'].forEach((k) => {
    $('#s-' + k).addEventListener('input', (e) => {
      state.scores[k] = e.target.value.slice(0, 3);
      persist(); renderForecast(); renderPrograms();
    });
  });
  $('#notes').addEventListener('input', (e) => { state.notes = e.target.value; persist(); });

  renderTimeline();
  renderAll();

  // ---------- shared storage (Supabase RPC, security by unguessable URL) ----------
  const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const API_BASE = import.meta.env.VITE_SUPABASE_PROXY_URL || (window.location.origin + '/sb');

  async function rpc(name, body) {
    const r = await fetch(`${API_BASE}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: API_KEY, authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('rpc ' + name + ' ' + r.status);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }

  function setStatus(kind, text) {
    const el = $('#savestate');
    el.textContent = text;
    el.classList.toggle('shared', kind === 'ok');
  }

  function applyRemote(res) {
    if (!res || !res.data) return false;
    if (res.updated_at === remoteStamp) return false;
    remoteStamp = res.updated_at;
    state = merge(state, res.data);
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    renderAll();
    return true;
  }

  async function pushRemote() {
    try {
      const res = await rpc('shared_page_put', { p_id: PAGE_ID, p_data: state });
      if (res && res.updated_at) remoteStamp = res.updated_at;
      online = true;
      setStatus('ok', 'Общий трекер: изменения видят все, у кого есть ссылка');
    } catch (e) {
      online = false;
      setStatus('warn', 'Нет связи с сервером, сохранено только в этом браузере');
    }
  }

  async function pullRemote(initial) {
    if (timer && !initial) return; // a local write is pending, do not overwrite it
    try {
      const res = await rpc('shared_page_get', { p_id: PAGE_ID });
      online = true;
      if (initial && res && res.data && Object.keys(res.data).length === 0) {
        // Fresh page on the server: seed it with whatever this browser already has.
        pushRemote();
      } else {
        applyRemote(res);
        setStatus('ok', 'Общий трекер: изменения видят все, у кого есть ссылка');
      }
    } catch (e) {
      online = false;
      setStatus('warn', 'Нет связи с сервером, сохранено только в этом браузере');
    }
  }

  pullRemote(true);
  setInterval(() => pullRemote(false), 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullRemote(false); });
})();
