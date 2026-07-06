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

test('RPO: 保有額帯（50万円刻み7段階）ごとの率', () => {
  const tiers = [2, 3, 4, 5, 6, 7, 8];
  assert.equal(calc.rpoTierPercent(500000, tiers), 2); // 〜50万
  assert.equal(calc.rpoTierPercent(500001, tiers), 3); // 50万超〜100万
  assert.equal(calc.rpoTierPercent(1000000, tiers), 3);
  assert.equal(calc.rpoTierPercent(1500000, tiers), 4); // 100万超〜150万
  assert.equal(calc.rpoTierPercent(2000000, tiers), 5); // 150万超〜200万
  assert.equal(calc.rpoTierPercent(2500000, tiers), 6); // 200万超〜250万
  assert.equal(calc.rpoTierPercent(3000000, tiers), 7); // 250万超〜300万
  assert.equal(calc.rpoTierPercent(3000001, tiers), 8); // 300万超
});

test('RPO: 保有額はメイン80%・サブ20%で換算される（要件の例）', () => {
  const shares = { main: 80, sub: 20 };
  // メインで100万円の案件を2つ → 160万円の保有
  const twoMains = [
    { clientName: 'A', monthlyProfit: 1000000, startYear: 2026, startMonth: 1, termMonths: 12, role: 'main' },
    { clientName: 'B', monthlyProfit: 1000000, startYear: 2026, startMonth: 1, termMonths: 12, role: 'main' },
  ];
  const held2 = twoMains.reduce((s, a) => s + calc.weightedProfit(a, shares), 0);
  assert.equal(held2, 1600000); // → 150万超〜200万帯

  // メイン100万×2 + サブ100万×2 → 80+80+20+20 = 200万円の保有
  const four = [
    ...twoMains,
    { clientName: 'C', monthlyProfit: 1000000, startYear: 2026, startMonth: 1, termMonths: 12, role: 'sub' },
    { clientName: 'D', monthlyProfit: 1000000, startYear: 2026, startMonth: 1, termMonths: 12, role: 'sub' },
  ];
  const held4 = four.reduce((s, a) => s + calc.weightedProfit(a, shares), 0);
  assert.equal(held4, 2000000); // → 150万超〜200万帯（200万ちょうど）

  const tiers = [2, 3, 4, 5, 6, 7, 8];
  const payout = calc.rpoIncentiveForPayout(four, 2026, 7, tiers, shares);
  // 各月: 保有200万 → 5% → 200万×5% = 10万円/月 × 3ヶ月
  assert.equal(payout.detail[0].heldAmount, 2000000);
  assert.equal(payout.detail[0].percent, 5);
  assert.equal(payout.total, 2000000 * 0.05 * 3);
});

test('RPO: 契約期間内の月だけ粗利が計上される', () => {
  const deal = { monthlyProfit: 800000, startYear: 2026, startMonth: 1, termMonths: 6 };
  assert.equal(calc.dealActiveInMonth(deal, 2025, 12), false);
  assert.equal(calc.dealActiveInMonth(deal, 2026, 1), true);
  assert.equal(calc.dealActiveInMonth(deal, 2026, 6), true);
  assert.equal(calc.dealActiveInMonth(deal, 2026, 7), false);
});

test('RPO: 支給月に対象3ヶ月分の保有額×率が支払われる', () => {
  const tiers = [2, 3, 4, 5, 6, 7, 8];
  const shares = { main: 80, sub: 20 };
  // 月80万の案件 (2026/1〜6) をメイン担当 → 保有額 64万 → 50万超〜100万帯 3%
  // 4月支給は 12月(対象外)+1月+2月 = 2ヶ月分
  const assignments = [
    { clientName: 'A社', monthlyProfit: 800000, startYear: 2026, startMonth: 1, termMonths: 6, role: 'main' },
  ];
  const apr = calc.rpoIncentiveForPayout(assignments, 2026, 4, tiers, shares);
  assert.equal(apr.total, 640000 * 0.03 * 2);

  // 7月支給は 3月+4月+5月 = 3ヶ月分
  const jul = calc.rpoIncentiveForPayout(assignments, 2026, 7, tiers, shares);
  assert.equal(jul.total, 640000 * 0.03 * 3);

  // サブ担当なら保有額 16万 → 〜50万帯 2%
  const subAssignments = [
    { clientName: 'A社', monthlyProfit: 800000, startYear: 2026, startMonth: 1, termMonths: 6, role: 'sub' },
  ];
  const julSub = calc.rpoIncentiveForPayout(subAssignments, 2026, 7, tiers, shares);
  assert.equal(julSub.total, 160000 * 0.02 * 3);
});

test('RPO: 同じ担当に複数人がつく場合は粗利を人数で等分してから換算する', () => {
  const tiers = [2, 3, 4, 5, 6, 7, 8];
  const shares = { main: 80, sub: 20 };
  // 粗利80万円の案件をメイン2人で分担 → 各40万円 → ×80% = 保有額32万 → 〜50万帯 2%
  const assignments = [
    { clientName: 'A社', monthlyProfit: 800000, startYear: 2026, startMonth: 3, termMonths: 6, role: 'main', roleMemberCount: 2 },
  ];
  const jul = calc.rpoIncentiveForPayout(assignments, 2026, 7, tiers, shares);
  assert.equal(jul.total, 320000 * 0.02 * 3);
  assert.equal(jul.detail[0].deals[0].sharedProfit, 400000);
  assert.equal(jul.detail[0].deals[0].weightedProfit, 320000);
  assert.equal(jul.detail[0].deals[0].members, 2);
});

test('RPO: 担当割合はオーナー設定値が反映される (例: 70/30)', () => {
  const tiers = [2, 3, 4, 5, 6, 7, 8];
  const shares = { main: 70, sub: 30 };
  const assignments = [
    { clientName: 'A社', monthlyProfit: 1000000, startYear: 2026, startMonth: 3, termMonths: 6, role: 'main' },
  ];
  // 保有額 70万 → 50万超〜100万帯 3%
  const jul = calc.rpoIncentiveForPayout(assignments, 2026, 7, tiers, shares);
  assert.equal(jul.total, 700000 * 0.03 * 3);
});

// ---------------- 粗利の可視化（損益） ----------------

test('profitSeriesForYear: RPO保有額 + イベント受注金額50%（受注月に計上）で月次粗利と損益を判定する', () => {
  const input = {
    assignments: [
      // メイン 月100万 (2026/1〜12) → 保有額 80万/月
      { clientName: 'A社', monthlyProfit: 1000000, startYear: 2026, startMonth: 1, termMonths: 12, role: 'main' },
    ],
    orders: [
      // 3月に受注したイベント（開催は10月）80万円 → 開催月ではなく受注月の3月に40万円計上
      { eventDate: '2026-10-15', orderYear: 2026, orderMonth: 3, amount: 800000, slots: 3 },
    ],
    baseRecords: [{ id: 1, amount: 300000, effectiveYear: 2026, effectiveMonth: 1 }],
    roleShares: { main: 80, sub: 20 },
    thresholdPercent: 30,
  };
  const series = calc.profitSeriesForYear(input, 2026);
  assert.equal(series.length, 12);

  // 1月: 粗利80万 → ×30% = 24万 < 基本給30万 → 赤字
  assert.equal(series[0].total, 800000);
  assert.equal(series[0].surplus, false);

  // 3月: 粗利80万+40万=120万 → ×30% = 36万 >= 30万 → 黒字
  assert.equal(series[2].rpoProfit, 800000);
  assert.equal(series[2].eventProfit, 400000);
  assert.equal(series[2].total, 1200000);
  assert.equal(series[2].surplus, true);

  // 開催月の10月にはイベント分は計上されない（受注月ベース）
  assert.equal(series[9].eventProfit, 0);
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
    tierPercents: [2, 3, 4, 5, 6, 7, 8],
    roleShares: { main: 80, sub: 20 },
  };

  // 2月は支給月ではない → 基本給のみ
  const feb = calc.salaryForMonth(input, 2026, 2);
  assert.equal(feb.total, 300000);
  assert.equal(feb.isQuarterMonth, false);

  // 4月: 基本給30万 + イベント(1月開催3枠×2万=6万)
  //     + RPO(1月+2月: 保有額 50万×80%=40万 → 〜50万帯2% → 8000円×2ヶ月)
  const apr = calc.salaryForMonth(input, 2026, 4);
  assert.equal(apr.eventIncentive.total, 60000);
  assert.equal(apr.rpoIncentive.total, 400000 * 0.02 * 2);
  assert.equal(apr.total, 300000 + 60000 + 16000);
});
