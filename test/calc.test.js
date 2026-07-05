'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const calc = require('../src/calc');

// ---------------- 支給月マッピング ----------------
// 開催月 → 支給月（要件で明示された全12ヶ月分）
test('イベント開催月 → インセンティブ支給月のマッピング', () => {
  const cases = [
    // [開催月, 支給年オフセット, 支給月]
    [1, 0, 4],
    [2, 0, 4],
    [3, 0, 7],
    [4, 0, 7],
    [5, 0, 7],
    [6, 0, 10],
    [7, 0, 10],
    [8, 0, 10],
    [9, 1, 1],
    [10, 1, 1],
    [11, 1, 1],
    [12, 1, 4],
  ];
  for (const [eventMonth, yearOffset, payoutMonth] of cases) {
    const result = calc.payoutMonthFor(2026, eventMonth);
    assert.deepEqual(
      result,
      { year: 2026 + yearOffset, month: payoutMonth },
      `開催 ${eventMonth}月 → 支給 ${payoutMonth}月 になるはず (実際: ${result.year}年${result.month}月)`
    );
  }
});

test('支給月 → 対象売上3ヶ月のマッピング（開催月マッピングと整合）', () => {
  for (const payoutMonth of [1, 4, 7, 10]) {
    const months = calc.revenueMonthsForPayout(2026, payoutMonth);
    assert.equal(months.length, 3);
    for (const { year, month } of months) {
      assert.deepEqual(calc.payoutMonthFor(year, month), { year: 2026, month: payoutMonth });
    }
  }
});

// ---------------- イベント段階単価 ----------------

test('段階単価: 1〜5枠 2万 / 6〜10枠 4万 / 11枠〜 6万', () => {
  assert.equal(calc.slotRate(1), 20000);
  assert.equal(calc.slotRate(5), 20000);
  assert.equal(calc.slotRate(6), 40000);
  assert.equal(calc.slotRate(10), 40000);
  assert.equal(calc.slotRate(11), 60000);
  assert.equal(calc.slotRate(25), 60000);
});

test('要件の例: 1ヶ月で11枠 → 合計36万円 (10万+20万+6万)', () => {
  const orders = [
    { id: 1, slots: 11, orderYear: 2026, orderMonth: 1, eventName: 'A', eventDate: '2026-01-15' },
  ];
  // 開催1月 → 支給4月
  const { total } = calc.eventIncentiveForPayout(orders, 2026, 4);
  assert.equal(total, 360000);
});

test('要件の例: 受注順が「10月,10月,10月,4月,4月,4月」でも開催日が早い順に単価を割り当てる', () => {
  // 同じ受注月 (2026年3月) に、10月開催×3枠 → 4月開催×3枠 の順で登録された場合
  const orders = [
    { id: 1, slots: 1, orderYear: 2026, orderMonth: 3, eventName: '秋イベント', eventDate: '2026-10-10' },
    { id: 2, slots: 1, orderYear: 2026, orderMonth: 3, eventName: '秋イベント', eventDate: '2026-10-10' },
    { id: 3, slots: 1, orderYear: 2026, orderMonth: 3, eventName: '秋イベント', eventDate: '2026-10-10' },
    { id: 4, slots: 1, orderYear: 2026, orderMonth: 3, eventName: '春イベント', eventDate: '2026-04-20' },
    { id: 5, slots: 1, orderYear: 2026, orderMonth: 3, eventName: '春イベント', eventDate: '2026-04-20' },
    { id: 6, slots: 1, orderYear: 2026, orderMonth: 3, eventName: '春イベント', eventDate: '2026-04-20' },
  ];
  const units = calc.computeEventUnits(orders);

  // 開催日順: 4月開催の3枠が1〜3枠目 (各2万)
  const april = units.filter((u) => u.eventDate === '2026-04-20');
  assert.deepEqual(april.map((u) => u.rate), [20000, 20000, 20000]);

  // 10月開催は4〜6枠目: 2万, 2万, 4万
  const october = units.filter((u) => u.eventDate === '2026-10-10');
  assert.deepEqual(october.map((u) => u.rate), [20000, 20000, 40000]);

  // 支給月: 4月開催 → 7月支給 / 10月開催 → 翌1月支給
  assert.equal(calc.eventIncentiveForPayout(orders, 2026, 7).total, 60000);
  assert.equal(calc.eventIncentiveForPayout(orders, 2027, 1).total, 80000);
});

test('受注月が異なれば枠数の通算はリセットされる', () => {
  const orders = [
    { id: 1, slots: 5, orderYear: 2026, orderMonth: 1, eventName: 'A', eventDate: '2026-01-10' },
    { id: 2, slots: 5, orderYear: 2026, orderMonth: 2, eventName: 'B', eventDate: '2026-02-10' },
  ];
  const units = calc.computeEventUnits(orders);
  // 各月とも1〜5枠目扱いで全て2万円
  assert.ok(units.every((u) => u.rate === 20000));
});

// ---------------- 基本給 ----------------

test('基本給: 最初に登録した額が変更まで毎月続く', () => {
  const records = [
    { id: 1, amount: 300000, effectiveYear: 2026, effectiveMonth: 1 },
  ];
  assert.equal(calc.baseSalaryForMonth(records, 2026, 1), 300000);
  assert.equal(calc.baseSalaryForMonth(records, 2027, 12), 300000);
  assert.equal(calc.baseSalaryForMonth(records, 2025, 12), 0); // 発効前は0

  // 途中で変更した場合、それ以降は新しい額
  records.push({ id: 2, amount: 350000, effectiveYear: 2026, effectiveMonth: 7 });
  assert.equal(calc.baseSalaryForMonth(records, 2026, 6), 300000);
  assert.equal(calc.baseSalaryForMonth(records, 2026, 7), 350000);
  assert.equal(calc.baseSalaryForMonth(records, 2027, 3), 350000);
});

// ---------------- RPO ----------------

test('RPO: 保有粗利帯ごとの率', () => {
  const tiers = [3, 5, 7, 10];
  assert.equal(calc.rpoTierPercent(1000000, tiers), 3); // 〜100万
  assert.equal(calc.rpoTierPercent(1000001, tiers), 5); // 100万超〜150万
  assert.equal(calc.rpoTierPercent(1500000, tiers), 5);
  assert.equal(calc.rpoTierPercent(1500001, tiers), 7); // 150万超〜200万
  assert.equal(calc.rpoTierPercent(2000000, tiers), 7);
  assert.equal(calc.rpoTierPercent(2000001, tiers), 10); // 200万超
});

test('RPO: 契約期間内の月だけ粗利が計上される', () => {
  const deal = { monthlyProfit: 800000, startYear: 2026, startMonth: 1, termMonths: 6 };
  assert.equal(calc.dealActiveInMonth(deal, 2025, 12), false);
  assert.equal(calc.dealActiveInMonth(deal, 2026, 1), true);
  assert.equal(calc.dealActiveInMonth(deal, 2026, 6), true);
  assert.equal(calc.dealActiveInMonth(deal, 2026, 7), false);
});

test('RPO: 支給月に対象3ヶ月分の粗利×率×担当割合が支払われる', () => {
  const tiers = [3, 5, 7, 10];
  const shares = { main: 80, sub: 20 };
  // 月80万の案件 (2026/1〜6) をメイン担当 → 4月支給は 12月(対象外)+1月+2月 = 80万×2ヶ月, 各月3%×80%
  const assignments = [
    { clientName: 'A社', monthlyProfit: 800000, startYear: 2026, startMonth: 1, termMonths: 6, role: 'main' },
  ];
  const apr = calc.rpoIncentiveForPayout(assignments, 2026, 4, tiers, shares);
  assert.equal(apr.total, 800000 * 0.03 * 0.8 * 2);

  // 7月支給は 3月+4月+5月 = 3ヶ月分
  const jul = calc.rpoIncentiveForPayout(assignments, 2026, 7, tiers, shares);
  assert.equal(jul.total, 800000 * 0.03 * 0.8 * 3);

  // サブ担当なら20%
  const subAssignments = [
    { clientName: 'A社', monthlyProfit: 800000, startYear: 2026, startMonth: 1, termMonths: 6, role: 'sub' },
  ];
  const julSub = calc.rpoIncentiveForPayout(subAssignments, 2026, 7, tiers, shares);
  assert.equal(julSub.total, 800000 * 0.03 * 0.2 * 3);

  // 担当案件が2つで月合計120万なら、帯の判定は粗利全額で行われ5%帯になる
  const assignments2 = [
    { clientName: 'A社', monthlyProfit: 800000, startYear: 2026, startMonth: 1, termMonths: 12, role: 'main' },
    { clientName: 'B社', monthlyProfit: 400000, startYear: 2026, startMonth: 1, termMonths: 12, role: 'sub' },
  ];
  const jul2 = calc.rpoIncentiveForPayout(assignments2, 2026, 7, tiers, shares);
  // A社: 80万×5%×80%, B社: 40万×5%×20%, ×3ヶ月
  assert.equal(jul2.total, (800000 * 0.05 * 0.8 + 400000 * 0.05 * 0.2) * 3);
  // 内訳にも案件別の行が入る
  assert.equal(jul2.detail[0].deals.length, 2);
  assert.equal(jul2.detail[0].percent, 5);
});

test('RPO: 同じ担当に複数人がつく場合は粗利を人数で等分してから計算する', () => {
  const tiers = [3, 5, 7, 10];
  const shares = { main: 80, sub: 20 };
  // 要件の例: 粗利80万円の案件をメイン2人で分担 → 各40万円として計算
  const assignments = [
    { clientName: 'A社', monthlyProfit: 800000, startYear: 2026, startMonth: 3, termMonths: 6, role: 'main', roleMemberCount: 2 },
  ];
  const jul = calc.rpoIncentiveForPayout(assignments, 2026, 7, tiers, shares);
  // 按分後40万 → 〜100万帯 3% × メイン80% × 3ヶ月
  assert.equal(jul.total, 400000 * 0.03 * 0.8 * 3);
  assert.equal(jul.detail[0].deals[0].sharedProfit, 400000);
  assert.equal(jul.detail[0].deals[0].members, 2);

  // サブ3人なら各 1/3
  const subs = [
    { clientName: 'B社', monthlyProfit: 900000, startYear: 2026, startMonth: 3, termMonths: 6, role: 'sub', roleMemberCount: 3 },
  ];
  const julSub = calc.rpoIncentiveForPayout(subs, 2026, 7, tiers, shares);
  assert.equal(julSub.total, Math.round(300000 * 0.03 * 0.2) * 3);

  // 保有額帯の判定も按分後の合計で行われる（120万を2人で分担 → 60万 → 3%帯）
  const shared = [
    { clientName: 'C社', monthlyProfit: 1200000, startYear: 2026, startMonth: 3, termMonths: 6, role: 'main', roleMemberCount: 2 },
  ];
  const julShared = calc.rpoIncentiveForPayout(shared, 2026, 7, tiers, shares);
  assert.equal(julShared.detail[0].percent, 3);
  assert.equal(julShared.total, 600000 * 0.03 * 0.8 * 3);
});

test('RPO: 担当割合はオーナー設定値が反映される (例: 70/30)', () => {
  const tiers = [3, 5, 7, 10];
  const shares = { main: 70, sub: 30 };
  const assignments = [
    { clientName: 'A社', monthlyProfit: 1000000, startYear: 2026, startMonth: 3, termMonths: 6, role: 'main' },
  ];
  const jul = calc.rpoIncentiveForPayout(assignments, 2026, 7, tiers, shares);
  assert.equal(jul.total, 1000000 * 0.03 * 0.7 * 3);
});

// ---------------- 月次まとめ ----------------

test('salaryForMonth: 支給月以外はインセンティブ0、支給月は合算される', () => {
  const input = {
    baseRecords: [{ id: 1, amount: 300000, effectiveYear: 2026, effectiveMonth: 1 }],
    orders: [
      { id: 1, slots: 3, orderYear: 2026, orderMonth: 1, eventName: 'A', eventDate: '2026-01-20' },
    ],
    assignments: [
      { clientName: 'A社', monthlyProfit: 500000, startYear: 2026, startMonth: 1, termMonths: 12, role: 'main' },
    ],
    tierPercents: [3, 5, 7, 10],
    roleShares: { main: 80, sub: 20 },
  };

  // 2月は支給月ではない → 基本給のみ
  const feb = calc.salaryForMonth(input, 2026, 2);
  assert.equal(feb.total, 300000);
  assert.equal(feb.isQuarterMonth, false);

  // 4月: 基本給30万 + イベント(1月開催3枠×2万=6万) + RPO(1月+2月の粗利50万×3%×80%×2)
  const apr = calc.salaryForMonth(input, 2026, 4);
  assert.equal(apr.eventIncentive.total, 60000);
  assert.equal(apr.rpoIncentive.total, 500000 * 0.03 * 0.8 * 2);
  assert.equal(apr.total, 300000 + 60000 + 24000);
});
