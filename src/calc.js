'use strict';

// ============================================================
// 給与・インセンティブ計算ロジック（純粋関数）
//
// ■ 支払サイクル
//   売上（イベント開催 / RPO 月次粗利）が発生した月の翌月にお客様から入金があり、
//   インセンティブはその入金月より「後」の直近のクォーター月（1月・4月・7月・10月）
//   に給与へ反映される。
//     開催 1月 → 入金 2月 → 支給 4月
//     開催 3月 → 入金 4月 → 支給 7月
//     開催 9月 → 入金10月 → 支給 翌1月
//     開催12月 → 入金 翌1月 → 支給 翌4月
//   つまり支給月ごとの対象売上月は
//     4月支給: 前年12月・1月・2月 / 7月支給: 3月・4月・5月
//     10月支給: 6月・7月・8月    / 1月支給: 前年9月・10月・11月
//
// ■ 採用イベントの段階単価（受注した「月」ごとに枠数を通算）
//   1〜5枠目: 2万円 / 6〜10枠目: 4万円 / 11枠目以降: 6万円
//   同じ受注月の中では、イベント開催日が早い順に枠を並べて単価を割り当てる。
//   （受注登録の順番ではなく開催日順で低い段階から消費する）
//
// ■ RPO インセンティブ
//   案件はオーナーが登録し、社員はメイン担当またはサブ担当として案件を選ぶ。
//   同じ担当（メイン/サブ）に複数人がつく案件もあり、その場合は
//   案件の月間粗利を人数で等分した額（例: 粗利80万でメイン2人 → 各40万）を
//   その人の担当分として扱う。
//   「いくら分の案件を持っているか（保有額）」は、按分後粗利に担当割合
//   （初期値: メイン80% / サブ20%、オーナーが変更可能）を掛けて換算する。
//     例: メインで100万の案件を2つ → 100万×80%×2 = 160万 → 150万超〜200万帯
//         メイン100万×2 + サブ100万×2 → 80+80+20+20 = 200万 → 150万超〜200万帯
//   対象 3ヶ月それぞれについて、その月の保有額合計に対して
//   50万円刻みの保有額帯（〜50万/〜100万/〜150万/〜200万/〜250万/〜300万/300万超）
//   ごとにオーナーが設定したパーセンテージを掛けた金額を支給する。
//
// ■ 粗利の可視化（損益グラフ）
//   各メンバーの月次粗利 = RPO保有額（メイン80%/サブ20%換算） + イベント受注金額の50%
//   （イベント分は開催月に計上）。基本給が「粗利 × 損益ライン%（初期値30%）」以内なら
//   黒字、超えたら赤字と判定する。
// ============================================================

const QUARTER_MONTHS = [1, 4, 7, 10];

// 受注月内の通算枠数 (1始まり) に対する単価
const EVENT_SLOT_TIERS = [
  { upTo: 5, rate: 20000 },
  { upTo: 10, rate: 40000 },
  { upTo: Infinity, rate: 60000 },
];

// RPO 保有粗利帯の上限額（この額「以下」で判定、最後の帯は上限なし）: 50万円刻み7段階
const RPO_TIER_BOUNDS = [500000, 1000000, 1500000, 2000000, 2500000, 3000000, Infinity];

// イベント受注金額のうち粗利として計上する割合 (%)
const EVENT_PROFIT_PERCENT = 50;

function isQuarterMonth(month) {
  return QUARTER_MONTHS.includes(month);
}

// 受注月内での通算枠位置 (1始まり) → 1枠あたりの単価
function slotRate(position) {
  for (const tier of EVENT_SLOT_TIERS) {
    if (position <= tier.upTo) return tier.rate;
  }
  return EVENT_SLOT_TIERS[EVENT_SLOT_TIERS.length - 1].rate;
}

// 売上発生月 (イベント開催月 / RPO 粗利計上月) → インセンティブ支給月
// 入金は発生月の翌月、支給は入金月より後の直近クォーター月。
function payoutMonthFor(year, month) {
  let payYear = year;
  let paidMonth = month + 1; // 入金月
  if (paidMonth > 12) {
    paidMonth = 1;
    payYear += 1;
  }
  for (const q of QUARTER_MONTHS) {
    if (q > paidMonth) return { year: payYear, month: q };
  }
  return { year: payYear + 1, month: 1 };
}

// 支給月 → 対象となる売上発生月 3ヶ月分
function revenueMonthsForPayout(payoutYear, payoutMonth) {
  switch (payoutMonth) {
    case 1:
      return [
        { year: payoutYear - 1, month: 9 },
        { year: payoutYear - 1, month: 10 },
        { year: payoutYear - 1, month: 11 },
      ];
    case 4:
      return [
        { year: payoutYear - 1, month: 12 },
        { year: payoutYear, month: 1 },
        { year: payoutYear, month: 2 },
      ];
    case 7:
      return [
        { year: payoutYear, month: 3 },
        { year: payoutYear, month: 4 },
        { year: payoutYear, month: 5 },
      ];
    case 10:
      return [
        { year: payoutYear, month: 6 },
        { year: payoutYear, month: 7 },
        { year: payoutYear, month: 8 },
      ];
    default:
      return [];
  }
}

// ---------------- 基本給 ----------------
// records: [{ amount, effectiveYear, effectiveMonth }]
// 対象月以前に発効した最新の基本給を返す（最初に登録した額が変更されるまで毎月続く）
function baseSalaryForMonth(records, year, month) {
  const target = year * 12 + (month - 1);
  let best = null;
  for (const r of records) {
    const eff = r.effectiveYear * 12 + (r.effectiveMonth - 1);
    if (eff > target) continue;
    if (
      best === null ||
      eff > best.eff ||
      (eff === best.eff && (r.id || 0) > (best.record.id || 0))
    ) {
      best = { eff, record: r };
    }
  }
  return best ? best.record.amount : 0;
}

// ---------------- 採用イベント ----------------
// orders: [{ id, slots, orderYear, orderMonth, eventName, eventDate: 'YYYY-MM-DD' }]
// 全受注を 1枠 = 1ユニットに展開し、受注月ごとに開催日順で段階単価を割り当てる。
function computeEventUnits(orders) {
  const byOrderMonth = new Map();
  for (const o of orders) {
    const key = `${o.orderYear}-${o.orderMonth}`;
    if (!byOrderMonth.has(key)) byOrderMonth.set(key, []);
    byOrderMonth.get(key).push(o);
  }

  const units = [];
  for (const group of byOrderMonth.values()) {
    const sorted = [...group].sort((a, b) => {
      if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? -1 : 1;
      return (a.id || 0) - (b.id || 0);
    });
    let position = 0;
    for (const order of sorted) {
      const [ey, em] = order.eventDate.split('-').map(Number);
      const payout = payoutMonthFor(ey, em);
      for (let i = 0; i < order.slots; i++) {
        position += 1;
        units.push({
          orderId: order.id,
          eventName: order.eventName,
          eventDate: order.eventDate,
          orderYear: order.orderYear,
          orderMonth: order.orderMonth,
          position,
          rate: slotRate(position),
          payoutYear: payout.year,
          payoutMonth: payout.month,
        });
      }
    }
  }
  return units;
}

// 指定支給月に支払われるイベントインセンティブ
function eventIncentiveForPayout(orders, payoutYear, payoutMonth) {
  const units = computeEventUnits(orders).filter(
    (u) => u.payoutYear === payoutYear && u.payoutMonth === payoutMonth
  );
  return {
    total: units.reduce((sum, u) => sum + u.rate, 0),
    units,
  };
}

// ---------------- RPO ----------------
// deal: { monthlyProfit, startYear, startMonth, termMonths }
function dealActiveInMonth(deal, year, month) {
  const start = deal.startYear * 12 + (deal.startMonth - 1);
  const idx = year * 12 + (month - 1);
  return idx >= start && idx < start + deal.termMonths;
}

// 保有額合計 → 適用パーセンテージ
// tierPercents: [tier1..tier7] （〜50万/〜100万/〜150万/〜200万/〜250万/〜300万/300万超）
function rpoTierPercent(monthlyTotal, tierPercents) {
  for (let i = 0; i < RPO_TIER_BOUNDS.length; i++) {
    if (monthlyTotal <= RPO_TIER_BOUNDS[i]) return tierPercents[i];
  }
  return tierPercents[tierPercents.length - 1];
}

// 担当1件分の保有額換算: 按分後粗利 × 担当割合（メイン80% / サブ20%）
function weightedProfit(assignment, roleShares) {
  const members = assignment.roleMemberCount || 1;
  const share = roleShares[assignment.role] ?? 0;
  return ((assignment.monthlyProfit / members) * share) / 100;
}

// 指定支給月に支払われる RPO インセンティブ（対象3ヶ月の月別・案件別内訳つき）
// assignments: [{ clientName, monthlyProfit, startYear, startMonth, termMonths,
//                 role: 'main'|'sub', roleMemberCount }]
//   roleMemberCount: その案件の同じ担当（メイン/サブ）についている人数。
//   複数人の場合は粗利を人数で等分した額をその人の担当分として計算する。
// roleShares: { main: 80, sub: 20 } のような担当割合 (%)
function rpoIncentiveForPayout(assignments, payoutYear, payoutMonth, tierPercents, roleShares) {
  const months = revenueMonthsForPayout(payoutYear, payoutMonth);
  const detail = [];
  let total = 0;
  for (const { year, month } of months) {
    const active = assignments
      .filter((a) => dealActiveInMonth(a, year, month))
      .map((a) => ({
        ...a,
        members: a.roleMemberCount || 1,
        sharedProfit: a.monthlyProfit / (a.roleMemberCount || 1),
        weighted: weightedProfit(a, roleShares),
      }));
    // 保有額帯の判定は「按分後粗利 × 担当割合」で換算した保有額の合計で行う
    const heldAmount = active.reduce((sum, a) => sum + a.weighted, 0);
    if (heldAmount <= 0) {
      detail.push({ year, month, heldAmount: 0, percent: 0, amount: 0, deals: [] });
      continue;
    }
    const percent = rpoTierPercent(heldAmount, tierPercents);
    const deals = active.map((a) => ({
      clientName: a.clientName,
      role: a.role,
      monthlyProfit: a.monthlyProfit,
      members: a.members,
      sharedProfit: Math.round(a.sharedProfit),
      share: roleShares[a.role] ?? 0,
      weightedProfit: Math.round(a.weighted),
      amount: Math.round((a.weighted * percent) / 100),
    }));
    const amount = deals.reduce((sum, d) => sum + d.amount, 0);
    total += amount;
    detail.push({ year, month, heldAmount: Math.round(heldAmount), percent, amount, deals });
  }
  return { total, detail };
}

// ---------------- 粗利の可視化（損益） ----------------
// 1年分の月次粗利と損益判定を返す。
//   RPO分: その月に稼働中の担当案件の保有額（按分後粗利 × 担当割合）
//   イベント分: 開催月がその月のイベントの受注金額 × 50%
//   判定: 基本給 <= 粗利合計 × thresholdPercent% → 黒字 (surplus: true)
function profitSeriesForYear({ assignments, orders, baseRecords, roleShares, thresholdPercent }, year) {
  const series = [];
  for (let month = 1; month <= 12; month++) {
    const rpoProfit = assignments
      .filter((a) => dealActiveInMonth(a, year, month))
      .reduce((sum, a) => sum + weightedProfit(a, roleShares), 0);
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const eventProfit = orders
      .filter((o) => o.eventDate.startsWith(prefix))
      .reduce((sum, o) => sum + ((o.amount || 0) * EVENT_PROFIT_PERCENT) / 100, 0);
    const total = Math.round(rpoProfit + eventProfit);
    const baseSalary = baseSalaryForMonth(baseRecords, year, month);
    const surplus = baseSalary <= (total * thresholdPercent) / 100;
    series.push({
      month,
      rpoProfit: Math.round(rpoProfit),
      eventProfit: Math.round(eventProfit),
      total,
      baseSalary,
      surplus,
    });
  }
  return series;
}

// ---------------- 月次給与まとめ ----------------
function salaryForMonth({ baseRecords, orders, assignments, tierPercents, roleShares }, year, month) {
  const base = baseSalaryForMonth(baseRecords, year, month);
  const quarter = isQuarterMonth(month);
  const eventIncentive = quarter
    ? eventIncentiveForPayout(orders, year, month)
    : { total: 0, units: [] };
  const rpoIncentive = quarter
    ? rpoIncentiveForPayout(assignments, year, month, tierPercents, roleShares)
    : { total: 0, detail: [] };
  return {
    year,
    month,
    isQuarterMonth: quarter,
    base,
    eventIncentive,
    rpoIncentive,
    total: base + eventIncentive.total + rpoIncentive.total,
  };
}

module.exports = {
  QUARTER_MONTHS,
  EVENT_SLOT_TIERS,
  RPO_TIER_BOUNDS,
  EVENT_PROFIT_PERCENT,
  isQuarterMonth,
  slotRate,
  payoutMonthFor,
  revenueMonthsForPayout,
  baseSalaryForMonth,
  computeEventUnits,
  eventIncentiveForPayout,
  dealActiveInMonth,
  rpoTierPercent,
  weightedProfit,
  rpoIncentiveForPayout,
  profitSeriesForYear,
  salaryForMonth,
};
