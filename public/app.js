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
        ? '株式会社VOCO給与管理システム'
        : '最初に登録したアカウントがオーナー（管理者）になります。')
  );

  const email = el('input', { type: 'email', autocomplete: 'email' });
  const name = el('input', { type: 'text' });
  const password = el('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
  const signupCode = el('input', { type: 'text', autocomplete: 'off' });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const body = { email: email.value, password: password.value };
        if (mode === 'register') {
          body.name = name.value;
          body.signupCode = signupCode.value;
        }
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
  if (mode === 'register') {
    form.append(el('div', { class: 'field' },
      el('label', {}, '招待コード（オーナーから共有されたもの。最初のオーナー登録では不要）'),
      signupCode));
  }
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
  { id: 'settings', label: '設定', render: renderSettingsTab, ownerOnly: true },
  { id: 'members', label: 'メンバー管理', render: renderMembersTab, ownerOnly: true },
];
let activeTab = 'salary';

function renderApp() {
  app.replaceChildren();
  app.append(
    el('header', { class: 'appbar' },
      el('h1', {}, '株式会社VOCO給与管理システム'),
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
      for (const deal of d.deals) {
        tbody.append(el('tr', {},
          el('td', {}, ym(d.year, d.month)),
          el('td', {}, deal.clientName),
          el('td', {}, deal.role === 'main' ? 'メイン' : 'サブ'),
          el('td', { class: 'num' }, yen(deal.monthlyProfit)),
          el('td', { class: 'num' }, `${d.percent}%`),
          el('td', { class: 'num' }, `${deal.share}%`),
          el('td', { class: 'num' }, yen(deal.amount))));
      }
    }
    wrap.append(
      el('h3', {}, 'RPOインセンティブ内訳（対象3ヶ月・案件別）'),
      el('p', { class: 'note' }, '適用率は、その月に担当している案件の粗利合計（保有額帯）で決まります。'),
      el('div', { class: 'table-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, '対象月'), el('th', {}, '案件'), el('th', {}, '担当'),
            el('th', { class: 'num' }, '月間粗利'), el('th', { class: 'num' }, '適用率'),
            el('th', { class: 'num' }, '担当割合'), el('th', { class: 'num' }, 'インセンティブ'))),
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

function assignmentCell(card, deal, assignment, role) {
  const roleLabel = role === 'main' ? 'メイン' : 'サブ';
  // 誰かが担当している場合: 名前 + （本人またはオーナーなら）外すボタン
  if (assignment) {
    const cell = el('td', {}, assignment.userName);
    if (assignment.userId === me.id || me.role === 'owner') {
      cell.append(' ', el('button', {
        class: 'danger',
        onclick: async () => {
          const who = assignment.userId === me.id ? '自分' : assignment.userName + ' さん';
          if (!confirm(`「${deal.clientName}」の${roleLabel}担当（${who}）を外しますか？`)) return;
          try {
            await api(`/api/rpo-assignments/${assignment.id}`, { method: 'DELETE' });
            renderApp();
          } catch (err) {
            showMessage(card, err.message, 'error');
          }
        },
      }, '外す'));
    }
    return cell;
  }
  return el('td', {}, el('span', { class: 'note', style: 'margin:0;' }, '未定'));
}

// 自分の担当案件を複数選択で選ぶセクション（メイン/サブそれぞれ複数社を持てる）
function myDealsSection(card, deals) {
  const wrap = el('div');
  const dealLabel = (d) =>
    `${d.clientName}（月間粗利 ${yen(d.monthlyProfit)} / ${ym(d.startYear, d.startMonth)}開始 / ${d.termMonths === 6 ? '半年' : '1年'}）`;

  for (const role of ['main', 'sub']) {
    const roleLabel = role === 'main' ? 'メイン' : 'サブ';

    // 現在の担当一覧
    const mine = deals.filter((d) => d[role] && d[role].userId === me.id);
    wrap.append(el('h3', {}, `自分の${roleLabel}案件（${mine.length}社）`));
    if (mine.length === 0) {
      wrap.append(el('p', { class: 'note' }, `${roleLabel}担当の案件はまだありません。下のリストから選んで追加してください。`));
    } else {
      const list = el('div');
      for (const d of mine) {
        list.append(el('div', { class: 'bulk-bar' },
          el('span', {}, dealLabel(d)),
          el('button', {
            class: 'danger',
            onclick: async () => {
              if (!confirm(`「${d.clientName}」の${roleLabel}担当を外れますか？`)) return;
              try {
                await api(`/api/rpo-assignments/${d[role].id}`, { method: 'DELETE' });
                renderApp();
              } catch (err) {
                showMessage(card, err.message, 'error');
              }
            },
          }, '外れる')));
      }
      wrap.append(list);
    }

    // 複数選択の追加フォーム: その担当枠が空いていて、自分がまだ関わっていない案件のみ
    const available = deals.filter((d) =>
      !d[role] &&
      !(d.main && d.main.userId === me.id) &&
      !(d.sub && d.sub.userId === me.id));
    if (available.length > 0) {
      const checks = [];
      const addBtn = el('button', { disabled: '' }, `選択した案件を${roleLabel}担当に追加`);
      const updateBtn = () => {
        const n = checks.filter((c) => c.checkbox.checked).length;
        addBtn.textContent = n > 0
          ? `選択した案件を${roleLabel}担当に追加（${n}社）`
          : `選択した案件を${roleLabel}担当に追加`;
        if (n > 0) addBtn.removeAttribute('disabled');
        else addBtn.setAttribute('disabled', '');
      };
      const tbody = el('tbody');
      for (const d of available) {
        const checkbox = el('input', { type: 'checkbox', onchange: updateBtn });
        checks.push({ checkbox, deal: d });
        tbody.append(el('tr', {},
          el('td', {}, checkbox),
          el('td', {}, d.clientName),
          el('td', { class: 'num' }, yen(d.monthlyProfit)),
          el('td', {}, ym(d.startYear, d.startMonth) + ' 開始'),
          el('td', {}, d.termMonths === 6 ? '半年' : '1年')));
      }
      addBtn.addEventListener('click', async () => {
        const dealIds = checks.filter((c) => c.checkbox.checked).map((c) => c.deal.id);
        try {
          await api('/api/rpo-assignments/bulk', {
            method: 'POST',
            body: JSON.stringify({ role, dealIds }),
          });
          renderApp();
        } catch (err) {
          showMessage(card, err.message, 'error');
        }
      });
      wrap.append(
        el('div', { class: 'table-scroll' },
          el('table', {},
            el('thead', {}, el('tr', {},
              el('th', {}, '選択'), el('th', {}, '案件名'), el('th', { class: 'num' }, '月間粗利'),
              el('th', {}, '契約開始'), el('th', {}, '期間'))),
            tbody)),
        el('div', { style: 'margin-top:10px;' }, addBtn));
    } else {
      wrap.append(el('p', { class: 'note' }, `現在追加できる案件はありません（${roleLabel}担当の枠が空いている案件がないか、すでに担当済みです）。`));
    }
  }
  return wrap;
}

async function renderRpoTab(content) {
  const isOwner = me.role === 'owner';
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, 'RPO案件'));
  card.append(el('p', { class: 'note' },
    (isOwner ? '案件（名前・月間粗利・契約期間）の登録・編集はオーナーが行います。' : '案件はオーナーが登録します。') +
    '各案件にメイン担当1名・サブ担当1名がつき、1人がメイン・サブそれぞれ複数社を担当できます。' +
    '下のリストにチェックを入れてまとめて追加してください。' +
    'インセンティブは保有額帯ごとの率に、担当割合（メイン/サブ、設定画面で変更可能）を掛けて支給月に支払われます。'));

  // ---- オーナー用: 新規登録フォーム ----
  if (isOwner) {
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
            await api('/api/rpo-deals', {
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
  }

  const myDealsArea = el('div');
  const list = el('div');
  card.append(myDealsArea, el('h3', {}, '案件一覧（全体）'), list);
  content.append(card);

  try {
    const deals = await api('/api/rpo-deals');
    if (deals.length === 0) {
      list.append(el('p', { class: 'note' },
        isOwner ? 'RPO案件はまだ登録されていません。' : 'RPO案件はまだ登録されていません（オーナーに登録を依頼してください）。'));
      return;
    }
    myDealsArea.append(myDealsSection(card, deals));
    const tbody = el('tbody');
    for (const d of deals) {
      const tr = el('tr', {},
        el('td', {}, d.clientName),
        el('td', { class: 'num' }, yen(d.monthlyProfit)),
        el('td', {}, ym(d.startYear, d.startMonth) + ' 開始'),
        el('td', {}, d.termMonths === 6 ? '半年' : '1年'),
        assignmentCell(card, d, d.main, 'main'),
        assignmentCell(card, d, d.sub, 'sub'));

      // オーナーのみ: 編集・削除
      const actions = el('td', {});
      if (isOwner) {
        actions.append(
          el('button', {
            class: 'danger',
            onclick: () => {
              // 行を編集フォームに切り替える
              const name = el('input', { type: 'text', value: d.clientName });
              const profit = el('input', { type: 'number', min: 0, step: 1, value: d.monthlyProfit });
              const ySel = el('select');
              yearOptions(ySel, d.startYear - 3, d.startYear + 3, d.startYear);
              const mSel = el('select');
              monthOptions(mSel, d.startMonth);
              const tSel = el('select');
              tSel.append(
                el('option', { value: 6, ...(d.termMonths === 6 ? { selected: '' } : {}) }, '半年'),
                el('option', { value: 12, ...(d.termMonths === 12 ? { selected: '' } : {}) }, '1年'));
              tr.replaceChildren(
                el('td', {}, name),
                el('td', {}, profit),
                el('td', {}, ySel, ' ', mSel),
                el('td', {}, tSel),
                el('td', { colspan: 3 },
                  el('button', {
                    onclick: async () => {
                      try {
                        await api(`/api/rpo-deals/${d.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({
                            clientName: name.value,
                            monthlyProfit: Number(profit.value),
                            startYear: Number(ySel.value),
                            startMonth: Number(mSel.value),
                            termMonths: Number(tSel.value),
                          }),
                        });
                        renderApp();
                      } catch (err) {
                        showMessage(card, err.message, 'error');
                      }
                    },
                  }, '保存'),
                  ' ',
                  el('button', { class: 'danger', onclick: () => renderApp() }, 'キャンセル')));
            },
          }, '編集'),
          ' ',
          el('button', {
            class: 'danger',
            onclick: async () => {
              if (!confirm(`「${d.clientName}」を削除しますか？担当情報も一緒に削除されます。`)) return;
              try {
                await api(`/api/rpo-deals/${d.id}`, { method: 'DELETE' });
                renderApp();
              } catch (err) {
                showMessage(card, err.message, 'error');
              }
            },
          }, '削除'));
      }
      tr.append(actions);
      tbody.append(tr);
    }
    list.append(el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, '案件名'), el('th', { class: 'num' }, '月間粗利'),
          el('th', {}, '契約開始'), el('th', {}, '期間'),
          el('th', {}, 'メイン担当'), el('th', {}, 'サブ担当'), el('th', {}, ''))),
        tbody)));
  } catch (err) {
    showMessage(card, err.message, 'error');
  }
}

// ---------- イベント受注 ----------

function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

// 月別受注枠数の棒グラフ（受注月ベース・1年分）
function monthlySlotsChart(orders, year) {
  const counts = Array(12).fill(0);
  for (const o of orders) {
    if (o.orderYear === year) counts[o.orderMonth - 1] += o.slots;
  }
  const W = 720, H = 240;
  const m = { top: 22, right: 8, bottom: 28, left: 36 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const rawMax = Math.max(...counts, 1);
  const step = rawMax <= 4 ? 1 : Math.ceil(rawMax / 4);
  const yMax = step * 4 >= rawMax ? step * 4 : step * 5;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `${year}年の月別受注枠数`,
  });

  // 横グリッド線と目盛り（控えめな色）
  for (let i = 0; i <= 4; i++) {
    const value = (yMax / 4) * i;
    const y = m.top + plotH - (plotH * value) / yMax;
    svg.append(svgEl('line', {
      x1: m.left, x2: m.left + plotW, y1: y, y2: y,
      stroke: i === 0 ? '#d1d5db' : '#eceef1', 'stroke-width': 1,
    }));
    svg.append(svgEl('text', {
      x: m.left - 6, y: y + 4, 'text-anchor': 'end',
      'font-size': 11, fill: '#6b7280',
    }, String(value)));
  }

  const slotW = plotW / 12;
  const barW = Math.min(34, slotW * 0.62);
  for (let i = 0; i < 12; i++) {
    const cx = m.left + slotW * i + slotW / 2;
    const x = cx - barW / 2;
    const barH = (plotH * counts[i]) / yMax;
    const topY = m.top + plotH - barH;
    const baseY = m.top + plotH;
    if (counts[i] > 0) {
      const r = Math.min(4, barH);
      const bar = svgEl('path', {
        d: `M${x},${baseY} L${x},${topY + r} Q${x},${topY} ${x + r},${topY} ` +
          `L${x + barW - r},${topY} Q${x + barW},${topY} ${x + barW},${topY + r} L${x + barW},${baseY} Z`,
        fill: '#ea580c',
      });
      bar.append(svgEl('title', {}, `${year}年${i + 1}月: ${counts[i]}枠`));
      svg.append(bar);
      // 値ラベル（0の月には付けない）
      svg.append(svgEl('text', {
        x: cx, y: topY - 6, 'text-anchor': 'middle',
        'font-size': 11, fill: '#6b7280',
      }, String(counts[i])));
    }
    svg.append(svgEl('text', {
      x: cx, y: m.top + plotH + 18, 'text-anchor': 'middle',
      'font-size': 11, fill: '#6b7280',
    }, `${i + 1}月`));
  }
  return svg;
}

async function renderOrdersTab(content) {
  const now = new Date();

  // ---- 受注の一括登録 ----
  const regCard = el('div', { class: 'card' });
  regCard.append(el('h2', {}, '採用イベントの受注登録（自分の実績）'));
  regCard.append(el('p', { class: 'note' },
    '受注したイベントにチェックを入れ、枠数を入力してまとめて登録できます。' +
    '同じ受注月の合計枠数で単価が決まります: 1〜5枠目 2万円 / 6〜10枠目 4万円 / 11枠目以降 6万円。' +
    '単価はイベント開催日が早い順に割り当てられ、開催月の翌月入金後、直近の支給月（1月・4月・7月・10月）に反映されます。'));

  const yearSel = el('select');
  yearOptions(yearSel, now.getFullYear() - 2, now.getFullYear() + 2, now.getFullYear());
  const monthSel = el('select');
  monthOptions(monthSel, now.getMonth() + 1);
  regCard.append(el('div', { class: 'bulk-bar' },
    el('div', { class: 'field' }, el('label', {}, '受注年'), yearSel),
    el('div', { class: 'field' }, el('label', {}, '受注月'), monthSel)));

  const eventArea = el('div');
  const registerBtn = el('button', { disabled: '' }, '選択したイベントをまとめて登録');
  regCard.append(eventArea, el('div', { style: 'margin-top:12px;' }, registerBtn));

  // ---- 受注一覧（一括削除） ----
  const listCard = el('div', { class: 'card' });
  listCard.append(el('h2', {}, '受注一覧'));
  const listArea = el('div');
  const deleteBtn = el('button', { class: 'danger', disabled: '' }, '選択した受注を削除');
  listCard.append(listArea);

  // ---- 月別受注グラフ ----
  const chartCard = el('div', { class: 'card' });
  chartCard.append(el('h2', {}, '月別受注枠数'));
  chartCard.append(el('p', { class: 'note' }, '受注月ベースで、各月に登録した枠数の合計を表示します。'));
  const chartYearSel = el('select');
  const chartArea = el('div', { class: 'chart-box' });
  chartCard.append(
    el('div', { class: 'bulk-bar' }, el('div', { class: 'field' }, el('label', {}, '年'), chartYearSel)),
    chartArea);

  content.append(regCard, listCard, chartCard);

  try {
    const [events, orders] = await Promise.all([api('/api/events'), api('/api/orders')]);

    // --- 登録テーブル: チェックボックス + 枠数入力 ---
    if (events.length === 0) {
      eventArea.append(el('p', { class: 'note' }, 'イベントが未登録です（オーナーに登録を依頼してください）。'));
    } else {
      const rows = []; // { checkbox, slotsInput, event }
      const updateRegisterBtn = () => {
        const anyChecked = rows.some((r) => r.checkbox.checked);
        if (anyChecked) registerBtn.removeAttribute('disabled');
        else registerBtn.setAttribute('disabled', '');
      };
      const tbody = el('tbody');
      for (const ev of events) {
        const checkbox = el('input', { type: 'checkbox', onchange: () => {
          slotsInput.disabled = !checkbox.checked;
          updateRegisterBtn();
        } });
        const slotsInput = el('input', { type: 'number', min: 1, step: 1, value: 1, style: 'width:80px;' });
        slotsInput.disabled = true;
        rows.push({ checkbox, slotsInput, event: ev });
        tbody.append(el('tr', {},
          el('td', {}, checkbox),
          el('td', {}, ev.eventDate),
          el('td', {}, ev.name),
          el('td', {}, slotsInput)));
      }
      eventArea.append(el('div', { class: 'table-scroll' },
        el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, '選択'), el('th', {}, '開催日'), el('th', {}, 'イベント名'), el('th', {}, '枠数'))),
          tbody)));

      registerBtn.addEventListener('click', async () => {
        const items = rows
          .filter((r) => r.checkbox.checked)
          .map((r) => ({ eventId: r.event.id, slots: Number(r.slotsInput.value) }));
        try {
          const result = await api('/api/orders/bulk', {
            method: 'POST',
            body: JSON.stringify({
              orderYear: Number(yearSel.value),
              orderMonth: Number(monthSel.value),
              items,
            }),
          });
          showMessage(regCard, `${result.count}件の受注を登録しました`, 'ok');
          renderApp();
        } catch (err) {
          showMessage(regCard, err.message, 'error');
        }
      });
    }

    // --- 受注一覧: チェックボックス + 一括削除 ---
    if (orders.length === 0) {
      listArea.append(el('p', { class: 'note' }, '受注はまだ登録されていません。'));
    } else {
      const checks = [];
      const updateDeleteBtn = () => {
        const n = checks.filter((c) => c.checkbox.checked).length;
        deleteBtn.textContent = n > 0 ? `選択した受注を削除（${n}件）` : '選択した受注を削除';
        if (n > 0) deleteBtn.removeAttribute('disabled');
        else deleteBtn.setAttribute('disabled', '');
      };
      const selectAll = el('input', { type: 'checkbox', onchange: () => {
        for (const c of checks) c.checkbox.checked = selectAll.checked;
        updateDeleteBtn();
      } });
      const tbody = el('tbody');
      for (const o of orders) {
        const checkbox = el('input', { type: 'checkbox', onchange: updateDeleteBtn });
        checks.push({ checkbox, order: o });
        tbody.append(el('tr', {},
          el('td', {}, checkbox),
          el('td', {}, o.eventName),
          el('td', {}, o.eventDate),
          el('td', {}, ym(o.orderYear, o.orderMonth)),
          el('td', { class: 'num' }, `${o.slots}枠`)));
      }
      listArea.append(
        el('div', { class: 'table-wrap' },
          el('table', {},
            el('thead', {}, el('tr', {},
              el('th', {}, selectAll), el('th', {}, 'イベント'), el('th', {}, '開催日'),
              el('th', {}, '受注月'), el('th', { class: 'num' }, '枠数'))),
            tbody)),
        el('div', { style: 'margin-top:12px;' }, deleteBtn));

      deleteBtn.addEventListener('click', async () => {
        const ids = checks.filter((c) => c.checkbox.checked).map((c) => c.order.id);
        if (!confirm(`選択した${ids.length}件の受注を削除しますか？`)) return;
        try {
          await api('/api/orders/delete', { method: 'POST', body: JSON.stringify({ ids }) });
          renderApp();
        } catch (err) {
          showMessage(listCard, err.message, 'error');
        }
      });
    }

    // --- 月別グラフ ---
    const years = [...new Set([...orders.map((o) => o.orderYear), now.getFullYear()])].sort();
    for (const y of years) {
      chartYearSel.append(el('option', {
        value: y, ...(y === now.getFullYear() ? { selected: '' } : {}),
      }, `${y}年`));
    }
    const drawChart = () => {
      chartArea.replaceChildren(monthlySlotsChart(orders, Number(chartYearSel.value)));
    };
    chartYearSel.addEventListener('change', drawChart);
    drawChart();
  } catch (err) {
    showMessage(regCard, err.message, 'error');
  }
}

// ---------- イベント管理（オーナー） ----------

async function renderEventsTab(content) {
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, '採用イベントの管理（オーナー）'));
  card.append(el('p', { class: 'note' },
    '年間のイベント（50〜100回程度）の開催日と名前を登録します。社員はここに登録されたイベントに対して受注を記録します。' +
    '登録後も「編集」から名前・開催日を変更できます（開催日を変えると支給月の計算にも自動反映されます）。'));

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
        const tr = el('tr', {},
          el('td', {}, ev.eventDate),
          el('td', {}, ev.name),
          el('td', {},
            el('button', {
              onclick: () => {
                // 行を編集フォームに切り替える（受注済みイベントも名前・日付を変更できる）
                const dateInput = el('input', { type: 'date', value: ev.eventDate });
                const nameInput = el('input', { type: 'text', value: ev.name });
                tr.replaceChildren(
                  el('td', {}, dateInput),
                  el('td', {}, nameInput),
                  el('td', {},
                    el('button', {
                      onclick: async () => {
                        try {
                          await api(`/api/events/${ev.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ name: nameInput.value, eventDate: dateInput.value }),
                          });
                          renderApp();
                        } catch (err) {
                          showMessage(card, err.message, 'error');
                        }
                      },
                    }, '保存'),
                    ' ',
                    el('button', { class: 'danger', onclick: () => renderApp() }, 'キャンセル')));
              },
            }, '編集'),
            ' ',
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
            }, '削除')));
        tbody.append(tr);
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
  card.append(el('h2', {}, '設定（オーナー）'));

  const tierFields = [
    ['rpoTier1Percent', '〜100万円'],
    ['rpoTier2Percent', '100万円超〜150万円'],
    ['rpoTier3Percent', '150万円超〜200万円'],
    ['rpoTier4Percent', '200万円超'],
  ];
  const shareFields = [
    ['rpoMainPercent', 'メイン担当'],
    ['rpoSubPercent', 'サブ担当'],
  ];
  const allFields = [...tierFields, ...shareFields];
  const inputs = {};
  for (const [key] of allFields) {
    inputs[key] = el('input', { type: 'number', min: 0, max: 100, step: 0.1 });
  }

  const signupCodeInput = el('input', { type: 'text', autocomplete: 'off' });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const body = { signupCode: signupCodeInput.value };
        for (const [key] of allFields) body[key] = Number(inputs[key].value);
        await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
        showMessage(card, '保存しました', 'ok');
      } catch (err) {
        showMessage(card, err.message, 'error');
      }
    },
  });

  const tierRow = el('div', { class: 'inline', style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;' });
  for (const [key, label] of tierFields) {
    tierRow.append(el('div', { class: 'field' }, el('label', {}, `${label} (%)`), inputs[key]));
  }
  const shareRow = el('div', { class: 'inline', style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;' });
  for (const [key, label] of shareFields) {
    shareRow.append(el('div', { class: 'field' }, el('label', {}, `${label} (%)`), inputs[key]));
  }

  form.append(
    el('h3', {}, 'RPO: 保有額帯ごとの率'),
    el('p', { class: 'note' }, '月間粗利の保有額帯ごとに、インセンティブとして支給するパーセンテージを設定します。'),
    tierRow,
    el('h3', {}, 'RPO: 担当割合（メイン / サブ）'),
    el('p', { class: 'note' }, '各案件のインセンティブを、メイン担当とサブ担当にどの割合で配分するかを設定します（初期値: メイン80% / サブ20%）。'),
    shareRow,
    el('h3', {}, 'アカウント登録の招待コード'),
    el('p', { class: 'note' },
      '新しく社員がアカウント登録するときに必要なコードです。登録してほしい社員にだけ共有してください。' +
      'コードを変更すると、以降の新規登録には新しいコードが必要になります（既存アカウントには影響しません）。'),
    el('div', { class: 'field', style: 'max-width:280px;' }, el('label', {}, '招待コード（4文字以上）'), signupCodeInput),
    el('div', { style: 'margin-top:16px;' }, el('button', { type: 'submit' }, '保存')));
  card.append(form);
  content.append(card);

  try {
    const settings = await api('/api/settings');
    for (const [key] of allFields) inputs[key].value = settings[key];
    signupCodeInput.value = settings.signupCode || '';
  } catch (err) {
    showMessage(card, err.message, 'error');
  }
}

// ---------- メンバー管理（オーナー） ----------

async function renderMembersTab(content) {
  // ---- 権限管理 ----
  const roleCard = el('div', { class: 'card' });
  roleCard.append(el('h2', {}, 'メンバー一覧・権限管理（オーナー）'));
  roleCard.append(el('p', { class: 'note' },
    'メンバーをオーナー権限に変更したり、オーナーをメンバーに戻したりできます。' +
    'オーナーはイベント・RPO案件・設定の管理と全メンバーの給与閲覧ができます。オーナーは最低1人必要です。'));
  const roleArea = el('div');
  roleCard.append(roleArea);
  content.append(roleCard);

  try {
    const users = await api('/api/admin/users');
    const tbody = el('tbody');
    for (const u of users) {
      const isSelf = u.id === me.id;
      const toOwner = u.role === 'member';
      const actionLabel = toOwner ? 'オーナーにする' : 'メンバーに戻す';
      const confirmText = toOwner
        ? `${u.name} さんをオーナー権限にしますか？\nイベント・案件・設定の管理と全メンバーの給与閲覧ができるようになります。`
        : `${u.name} さん${isSelf ? '（自分）' : ''}をメンバー権限に戻しますか？${isSelf ? '\n自分の管理画面へのアクセスも失われます。' : ''}`;
      tbody.append(el('tr', {},
        el('td', {}, u.name + (isSelf ? '（自分）' : '')),
        el('td', {}, u.email),
        el('td', {}, el('span', { class: 'badge' }, u.role === 'owner' ? 'オーナー' : 'メンバー')),
        el('td', {},
          el('button', {
            class: toOwner ? '' : 'danger',
            onclick: async () => {
              if (!confirm(confirmText)) return;
              try {
                await api(`/api/admin/users/${u.id}/role`, {
                  method: 'PUT',
                  body: JSON.stringify({ role: toOwner ? 'owner' : 'member' }),
                });
                if (isSelf) me = await api('/api/me'); // 自分を変更した場合は権限を取り直す
                renderApp();
              } catch (err) {
                showMessage(roleCard, err.message, 'error');
              }
            },
          }, actionLabel))));
    }
    roleArea.append(el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, '氏名'), el('th', {}, 'メールアドレス'), el('th', {}, '権限'), el('th', {}, ''))),
        tbody)));
  } catch (err) {
    showMessage(roleCard, err.message, 'error');
  }

  // ---- 給与確認 ----
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
