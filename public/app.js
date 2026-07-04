'use strict';

// ============ 共通 ============

const app = document.getElementById('app');
let me = null; // ログイン中ユーザー

const yen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');
const ym = (y, m) => `${y}年${m}月`;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `エラー (${res.status})`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

function showMessage(container, text, kind) {
  container.querySelectorAll('.msg').forEach((m) => m.remove());
  if (text) container.prepend(el('div', { class: `msg ${kind}` }, text));
}

function yearOptions(select, from, to, selected) {
  for (let y = from; y <= to; y++) {
    select.append(el('option', { value: y, ...(y === selected ? { selected: '' } : {}) }, `${y}年`));
  }
}
function monthOptions(select, selected) {
  for (let m = 1; m <= 12; m++) {
    select.append(el('option', { value: m, ...(m === selected ? { selected: '' } : {}) }, `${m}月`));
  }
}

// ============ 認証画面 ============

function renderAuth(mode = 'login') {
  app.replaceChildren();
  const box = el('div', { class: 'card auth-box' });
  box.append(el('h2', {}, mode === 'login' ? 'ログイン' : 'アカウント登録'));
  box.append(
    el('p', { class: 'note' },
      mode === 'login'
        ? 'VOCO 給与システム'
        : '最初に登録したアカウントがオーナー（管理者）になります。')
  );

  const email = el('input', { type: 'email', autocomplete: 'email' });
  const name = el('input', { type: 'text' });
  const password = el('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const body = { email: email.value, password: password.value };
        if (mode === 'register') body.name = name.value;
        me = await api(mode === 'login' ? '/api/login' : '/api/register', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        renderApp();
      } catch (err) {
        showMessage(box, err.message, 'error');
      }
    },
  });

  form.append(el('div', { class: 'field' }, el('label', {}, 'メールアドレス'), email));
  if (mode === 'register') {
    form.append(el('div', { class: 'field' }, el('label', {}, '氏名'), name));
  }
  form.append(el('div', { class: 'field' }, el('label', {}, 'パスワード（8文字以上）'), password));
  form.append(el('button', { type: 'submit' }, mode === 'login' ? 'ログイン' : '登録する'));
  box.append(form);

  box.append(
    el('div', { class: 'auth-switch' },
      mode === 'login' ? 'アカウントがない方は ' : '既にアカウントがある方は ',
      el('a', { onclick: () => renderAuth(mode === 'login' ? 'register' : 'login') },
        mode === 'login' ? '新規登録' : 'ログイン'))
  );
  app.append(box);
}

// ============ メイン画面 ============

const TABS = [
  { id: 'salary', label: '給与明細', render: renderSalaryTab },
  { id: 'base', label: '基本給', render: renderBaseTab },
  { id: 'rpo', label: 'RPO案件', render: renderRpoTab },
  { id: 'orders', label: 'イベント受注', render: renderOrdersTab },
  { id: 'events', label: 'イベント管理', render: renderEventsTab, ownerOnly: true },
  { id: 'settings', label: 'RPO率設定', render: renderSettingsTab, ownerOnly: true },
  { id: 'members', label: 'メンバー給与', render: renderMembersTab, ownerOnly: true },
];
let activeTab = 'salary';

function renderApp() {
  app.replaceChildren();
  app.append(
    el('header', { class: 'appbar' },
      el('h1', {}, '株式会社勃興（VOCO）給与システム'),
      el('div', { class: 'who' },
        `${me.name} さん `,
        el('span', { class: 'badge' }, me.role === 'owner' ? 'オーナー' : 'メンバー'),
        ' ',
        el('button', {
          onclick: async () => {
            await api('/api/logout', { method: 'POST' });
            me = null;
            renderAuth();
          },
        }, 'ログアウト')))
  );

  const container = el('div', { class: 'container' });
  const nav = el('nav', { class: 'tabs' });
  const content = el('div');

  const visibleTabs = TABS.filter((t) => !t.ownerOnly || me.role === 'owner');
  if (!visibleTabs.some((t) => t.id === activeTab)) activeTab = 'salary';

  for (const tab of visibleTabs) {
    nav.append(
      el('button', {
        class: tab.id === activeTab ? 'active' : '',
        onclick: () => { activeTab = tab.id; renderApp(); },
      }, tab.label)
    );
  }
  container.append(nav, content);
  app.append(container);

  visibleTabs.find((t) => t.id === activeTab).render(content);
}

// ---------- 給与明細 ----------

function salaryBreakdownView(data) {
  const wrap = el('div');
  wrap.append(
    el('div', { class: 'salary-grid' },
      el('div', { class: 'item' },
        el('div', { class: 'label' }, '基本給'),
        el('div', { class: 'value' }, yen(data.base))),
      el('div', { class: 'item' },
        el('div', { class: 'label' }, 'イベントインセンティブ'),
        el('div', { class: 'value' }, yen(data.eventIncentive.total))),
      el('div', { class: 'item' },
        el('div', { class: 'label' }, 'RPOインセンティブ'),
        el('div', { class: 'value' }, yen(data.rpoIncentive.total))),
      el('div', { class: 'item' },
        el('div', { class: 'label' }, '支給合計'),
        el('div', { class: 'value salary-total' }, yen(data.total))))
  );

  if (!data.isQuarterMonth) {
    wrap.append(el('p', { class: 'note' },
      'この月はインセンティブ支給月ではありません（支給月は1月・4月・7月・10月）。'));
    return wrap;
  }

  if (data.eventIncentive.units.length > 0) {
    const tbody = el('tbody');
    for (const u of data.eventIncentive.units) {
      tbody.append(el('tr', {},
        el('td', {}, u.eventName),
        el('td', {}, u.eventDate),
        el('td', {}, ym(u.orderYear, u.orderMonth)),
        el('td', { class: 'num' }, `${u.position}枠目`),
        el('td', { class: 'num' }, yen(u.rate))));
    }
    wrap.append(
      el('h3', {}, 'イベントインセンティブ内訳（この支給月に対象となる枠）'),
      el('div', { class: 'table-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'イベント'), el('th', {}, '開催日'), el('th', {}, '受注月'),
            el('th', { class: 'num' }, '受注月内の通算枠'), el('th', { class: 'num' }, '単価'))),
          tbody))
    );
  }

  const rpoRows = data.rpoIncentive.detail.filter((d) => d.monthlyProfit > 0);
  if (rpoRows.length > 0) {
    const tbody = el('tbody');
    for (const d of rpoRows) {
      tbody.append(el('tr', {},
        el('td', {}, ym(d.year, d.month)),
        el('td', { class: 'num' }, yen(d.monthlyProfit)),
        el('td', { class: 'num' }, `${d.percent}%`),
        el('td', { class: 'num' }, yen(d.amount))));
    }
    wrap.append(
      el('h3', {}, 'RPOインセンティブ内訳（対象3ヶ月）'),
      el('div', { class: 'table-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, '対象月'), el('th', { class: 'num' }, '月間粗利合計'),
            el('th', { class: 'num' }, '適用率'), el('th', { class: 'num' }, 'インセンティブ'))),
          tbody))
    );
  }
  return wrap;
}

function monthPicker(onChange) {
  const now = new Date();
  const yearSel = el('select');
  yearOptions(yearSel, now.getFullYear() - 2, now.getFullYear() + 2, now.getFullYear());
  const monthSel = el('select');
  monthOptions(monthSel, now.getMonth() + 1);
  const handler = () => onChange(Number(yearSel.value), Number(monthSel.value));
  yearSel.addEventListener('change', handler);
  monthSel.addEventListener('change', handler);
  return { yearSel, monthSel, fire: handler };
}

function renderSalaryTab(content) {
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, '給与明細（自分）'));
  card.append(el('p', { class: 'note' },
    'インセンティブは1月・4月・7月・10月に支給されます。イベントは開催月の翌月入金、その後直近の支給月に反映されます。'));

  const result = el('div');
  const picker = monthPicker(async (year, month) => {
    try {
      const data = await api(`/api/salary?year=${year}&month=${month}`);
      result.replaceChildren(salaryBreakdownView(data));
    } catch (err) {
      showMessage(card, err.message, 'error');
    }
  });
  card.append(
    el('form', { class: 'inline', onsubmit: (e) => e.preventDefault() },
      el('div', { class: 'field' }, el('label', {}, '年'), picker.yearSel),
      el('div', { class: 'field' }, el('label', {}, '月'), picker.monthSel)),
    result
  );
  content.append(card);
  picker.fire();
}

// ---------- 基本給 ----------

async function renderBaseTab(content) {
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, '基本給の登録'));
  card.append(el('p', { class: 'note' },
    '一度登録した基本給は、変更を登録するまで毎月そのまま適用されます。金額が変わる場合は新しい発効年月で追加登録してください。'));

  const now = new Date();
  const amount = el('input', { type: 'number', min: 0, step: 1, placeholder: '例: 300000' });
  const yearSel = el('select');
  yearOptions(yearSel, now.getFullYear() - 2, now.getFullYear() + 2, now.getFullYear());
  const monthSel = el('select');
  monthOptions(monthSel, now.getMonth() + 1);

  card.append(
    el('form', {
      class: 'inline',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/base-salary', {
            method: 'POST',
            body: JSON.stringify({
              amount: Number(amount.value),
              effectiveYear: Number(yearSel.value),
              effectiveMonth: Number(monthSel.value),
            }),
          });
          activeTab = 'base';
          renderApp();
        } catch (err) {
          showMessage(card, err.message, 'error');
        }
      },
    },
      el('div', { class: 'field' }, el('label', {}, '基本給（月額・円）'), amount),
      el('div', { class: 'field' }, el('label', {}, '発効年'), yearSel),
      el('div', { class: 'field' }, el('label', {}, '発効月'), monthSel),
      el('button', { type: 'submit' }, '登録'))
  );

  const history = el('div');
  card.append(el('h3', {}, '登録履歴'), history);
  content.append(card);

  try {
    const rows = await api('/api/base-salary');
    if (rows.length === 0) {
      history.append(el('p', { class: 'note' }, 'まだ基本給が登録されていません。最初に登録してください。'));
    } else {
      const tbody = el('tbody');
      for (const r of rows) {
        tbody.append(el('tr', {},
          el('td', {}, ym(r.effectiveYear, r.effectiveMonth) + ' から'),
          el('td', { class: 'num' }, yen(r.amount))));
      }
      history.append(el('div', { class: 'table-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, '発効年月'), el('th', { class: 'num' }, '金額'))),
          tbody)));
    }
  } catch (err) {
    showMessage(card, err.message, 'error');
  }
}

// ---------- RPO案件 ----------

async function renderRpoTab(content) {
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, 'RPO案件（自分の担当分）'));
  card.append(el('p', { class: 'note' },
    '契約は半年または1年。対象3ヶ月の月間粗利合計に、保有額帯ごとの率（オーナー設定）を掛けた金額が支給月にインセンティブとして入ります。'));

  const now = new Date();
  const clientName = el('input', { type: 'text', placeholder: 'クライアント名' });
  const monthlyProfit = el('input', { type: 'number', min: 0, step: 1, placeholder: '月間粗利（円）' });
  const yearSel = el('select');
  yearOptions(yearSel, now.getFullYear() - 2, now.getFullYear() + 2, now.getFullYear());
  const monthSel = el('select');
  monthOptions(monthSel, now.getMonth() + 1);
  const termSel = el('select');
  termSel.append(el('option', { value: 6 }, '半年（6ヶ月）'), el('option', { value: 12 }, '1年（12ヶ月）'));

  card.append(
    el('form', {
      class: 'inline',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/rpo', {
            method: 'POST',
            body: JSON.stringify({
              clientName: clientName.value,
              monthlyProfit: Number(monthlyProfit.value),
              startYear: Number(yearSel.value),
              startMonth: Number(monthSel.value),
              termMonths: Number(termSel.value),
            }),
          });
          renderApp();
        } catch (err) {
          showMessage(card, err.message, 'error');
        }
      },
    },
      el('div', { class: 'field' }, el('label', {}, '案件名'), clientName),
      el('div', { class: 'field' }, el('label', {}, '月間粗利（円）'), monthlyProfit),
      el('div', { class: 'field' }, el('label', {}, '契約開始年'), yearSel),
      el('div', { class: 'field' }, el('label', {}, '契約開始月'), monthSel),
      el('div', { class: 'field' }, el('label', {}, '契約期間'), termSel),
      el('button', { type: 'submit' }, '登録'))
  );

  const list = el('div');
  card.append(el('h3', {}, '登録済み案件'), list);
  content.append(card);

  try {
    const deals = await api('/api/rpo');
    if (deals.length === 0) {
      list.append(el('p', { class: 'note' }, 'RPO案件はまだ登録されていません。'));
    } else {
      const tbody = el('tbody');
      for (const d of deals) {
        tbody.append(el('tr', {},
          el('td', {}, d.clientName),
          el('td', { class: 'num' }, yen(d.monthlyProfit)),
          el('td', {}, ym(d.startYear, d.startMonth) + ' 開始'),
          el('td', {}, d.termMonths === 6 ? '半年' : '1年'),
          el('td', {},
            el('button', {
              class: 'danger',
              onclick: async () => {
                if (!confirm(`「${d.clientName}」を削除しますか？`)) return;
                await api(`/api/rpo/${d.id}`, { method: 'DELETE' });
                renderApp();
              },
            }, '削除'))));
      }
      list.append(el('div', { class: 'table-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, '案件名'), el('th', { class: 'num' }, '月間粗利'),
            el('th', {}, '契約開始'), el('th', {}, '期間'), el('th', {}, ''))),
          tbody)));
    }
  } catch (err) {
    showMessage(card, err.message, 'error');
  }
}

// ---------- イベント受注 ----------

async function renderOrdersTab(content) {
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, '採用イベントの受注（自分の実績）'));
  card.append(el('p', { class: 'note' },
    '同じ受注月の合計枠数で単価が決まります: 1〜5枠目 2万円 / 6〜10枠目 4万円 / 11枠目以降 6万円。' +
    '単価はイベント開催日が早い順に割り当てられ、開催月の翌月入金後、直近の支給月（1月・4月・7月・10月）に反映されます。'));

  const now = new Date();
  const eventSel = el('select');
  const slots = el('input', { type: 'number', min: 1, step: 1, value: 1 });
  const yearSel = el('select');
  yearOptions(yearSel, now.getFullYear() - 2, now.getFullYear() + 2, now.getFullYear());
  const monthSel = el('select');
  monthOptions(monthSel, now.getMonth() + 1);

  card.append(
    el('form', {
      class: 'inline',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
              eventId: Number(eventSel.value),
              slots: Number(slots.value),
              orderYear: Number(yearSel.value),
              orderMonth: Number(monthSel.value),
            }),
          });
          renderApp();
        } catch (err) {
          showMessage(card, err.message, 'error');
        }
      },
    },
      el('div', { class: 'field' }, el('label', {}, 'イベント'), eventSel),
      el('div', { class: 'field' }, el('label', {}, '枠数'), slots),
      el('div', { class: 'field' }, el('label', {}, '受注年'), yearSel),
      el('div', { class: 'field' }, el('label', {}, '受注月'), monthSel),
      el('button', { type: 'submit' }, '登録'))
  );

  const list = el('div');
  card.append(el('h3', {}, '受注一覧'), list);
  content.append(card);

  try {
    const [events, orders] = await Promise.all([api('/api/events'), api('/api/orders')]);
    if (events.length === 0) {
      eventSel.append(el('option', { value: '' }, 'イベント未登録（オーナーに依頼してください）'));
    } else {
      for (const ev of events) {
        eventSel.append(el('option', { value: ev.id }, `${ev.eventDate} ${ev.name}`));
      }
    }
    if (orders.length === 0) {
      list.append(el('p', { class: 'note' }, '受注はまだ登録されていません。'));
    } else {
      const tbody = el('tbody');
      for (const o of orders) {
        tbody.append(el('tr', {},
          el('td', {}, o.eventName),
          el('td', {}, o.eventDate),
          el('td', {}, ym(o.orderYear, o.orderMonth)),
          el('td', { class: 'num' }, `${o.slots}枠`),
          el('td', {},
            el('button', {
              class: 'danger',
              onclick: async () => {
                if (!confirm('この受注を削除しますか？')) return;
                await api(`/api/orders/${o.id}`, { method: 'DELETE' });
                renderApp();
              },
            }, '削除'))));
      }
      list.append(el('div', { class: 'table-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'イベント'), el('th', {}, '開催日'), el('th', {}, '受注月'),
            el('th', { class: 'num' }, '枠数'), el('th', {}, ''))),
          tbody)));
    }
  } catch (err) {
    showMessage(card, err.message, 'error');
  }
}

// ---------- イベント管理（オーナー） ----------

async function renderEventsTab(content) {
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, '採用イベントの管理（オーナー）'));
  card.append(el('p', { class: 'note' }, '年間のイベント（50〜100回程度）の開催日と名前を登録します。社員はここに登録されたイベントに対して受注を記録します。'));

  const name = el('input', { type: 'text', placeholder: 'イベント名' });
  const date = el('input', { type: 'date' });

  card.append(
    el('form', {
      class: 'inline',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/events', {
            method: 'POST',
            body: JSON.stringify({ name: name.value, eventDate: date.value }),
          });
          renderApp();
        } catch (err) {
          showMessage(card, err.message, 'error');
        }
      },
    },
      el('div', { class: 'field' }, el('label', {}, 'イベント名'), name),
      el('div', { class: 'field' }, el('label', {}, '開催日'), date),
      el('button', { type: 'submit' }, '登録'))
  );

  const list = el('div');
  card.append(el('h3', {}, '登録済みイベント'), list);
  content.append(card);

  try {
    const events = await api('/api/events');
    if (events.length === 0) {
      list.append(el('p', { class: 'note' }, 'イベントはまだ登録されていません。'));
    } else {
      const tbody = el('tbody');
      for (const ev of events) {
        tbody.append(el('tr', {},
          el('td', {}, ev.eventDate),
          el('td', {}, ev.name),
          el('td', {},
            el('button', {
              class: 'danger',
              onclick: async () => {
                if (!confirm(`「${ev.name}」を削除しますか？`)) return;
                try {
                  await api(`/api/events/${ev.id}`, { method: 'DELETE' });
                  renderApp();
                } catch (err) {
                  showMessage(card, err.message, 'error');
                }
              },
            }, '削除'))));
      }
      list.append(el('div', { class: 'table-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, '開催日'), el('th', {}, 'イベント名'), el('th', {}, ''))),
          tbody)));
    }
  } catch (err) {
    showMessage(card, err.message, 'error');
  }
}

// ---------- RPO率設定（オーナー） ----------

async function renderSettingsTab(content) {
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, 'RPOインセンティブ率の設定（オーナー）'));
  card.append(el('p', { class: 'note' }, '月間粗利の保有額帯ごとに、インセンティブとして支給するパーセンテージを設定します。'));

  const fields = [
    ['rpoTier1Percent', '〜100万円'],
    ['rpoTier2Percent', '100万円超〜150万円'],
    ['rpoTier3Percent', '150万円超〜200万円'],
    ['rpoTier4Percent', '200万円超'],
  ];
  const inputs = {};
  const form = el('form', {
    class: 'inline',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const body = {};
        for (const [key] of fields) body[key] = Number(inputs[key].value);
        await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
        showMessage(card, '保存しました', 'ok');
      } catch (err) {
        showMessage(card, err.message, 'error');
      }
    },
  });
  for (const [key, label] of fields) {
    inputs[key] = el('input', { type: 'number', min: 0, max: 100, step: 0.1 });
    form.append(el('div', { class: 'field' }, el('label', {}, `${label} (%)`), inputs[key]));
  }
  form.append(el('button', { type: 'submit' }, '保存'));
  card.append(form);
  content.append(card);

  try {
    const settings = await api('/api/settings');
    for (const [key] of fields) inputs[key].value = settings[key];
  } catch (err) {
    showMessage(card, err.message, 'error');
  }
}

// ---------- メンバー給与（オーナー） ----------

async function renderMembersTab(content) {
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, 'メンバー給与の確認（オーナー）'));

  const userSel = el('select');
  const result = el('div');

  const load = async () => {
    if (!userSel.value) return;
    const year = Number(picker.yearSel.value);
    const month = Number(picker.monthSel.value);
    try {
      const data = await api(`/api/admin/salary?userId=${userSel.value}&year=${year}&month=${month}`);
      result.replaceChildren(
        el('h3', {}, `${data.userName} さん / ${ym(year, month)}`),
        salaryBreakdownView(data));
    } catch (err) {
      showMessage(card, err.message, 'error');
    }
  };

  const picker = monthPicker(load);
  userSel.addEventListener('change', load);

  card.append(
    el('form', { class: 'inline', onsubmit: (e) => e.preventDefault() },
      el('div', { class: 'field' }, el('label', {}, 'メンバー'), userSel),
      el('div', { class: 'field' }, el('label', {}, '年'), picker.yearSel),
      el('div', { class: 'field' }, el('label', {}, '月'), picker.monthSel)),
    result
  );
  content.append(card);

  try {
    const users = await api('/api/admin/users');
    for (const u of users) {
      userSel.append(el('option', { value: u.id }, `${u.name}（${u.email}）`));
    }
    load();
  } catch (err) {
    showMessage(card, err.message, 'error');
  }
}

// ============ 起動 ============

(async () => {
  try {
    me = await api('/api/me');
    renderApp();
  } catch {
    renderAuth();
  }
})();
