/* T01–T30：Spec v1.0 §7 行為驗收測試。
 * 注意：通過只代表 Engine 行為符合 Spec，唔代表所有銀行條款已獨立核實。 */
'use strict';
(function (g) {
  const NS = g.AmyRewards;
  const { row, designated, online, pay, cyc } = NS.fixtures;
  const T = (id, title, expected, fn) => NS.test.define('spec', id, title, expected, fn);
  const D8 = 'RED_DESIGNATED_8', O4 = 'RED_ONLINE_4', B04 = 'RED_BASE_04';

  // ---- 8% 累積情境（T01–T03）----
  const d8Rows = [
    row(2, { Amount: '500.00' }),
    row(3, { Date: '2026-10-10', Amount: '750.00' }),
    row(4, { Date: '2026-10-15', Amount: '200.00' }),
  ];
  const d8Map = [
    designated('P1', 2, '500.00'),
    designated('P2', 3, '750.00', { post_date: '2026-10-11' }),
    designated('P3', 4, '200.00', { post_date: '2026-10-16' }),
  ];

  T('T01', 'HSBC Red 指定商戶已入帳 HK$500', '8% 高回贈約 $40；8% 高回贈簽帳容量餘 $750', ctx => {
    const r = ctx.calc({ trackerRows: d8Rows.slice(0, 1), transactionMap: d8Map.slice(0, 1) });
    const p = pay(r, 'P1');
    ctx.check('分類', p.classification, D8);
    ctx.check('回贈（低 / 高）', [p.low.reward_rc, p.high.reward_rc], ['40.000000', '40.000000']);
    ctx.check('8% 剩餘簽帳', cyc(r).promotions[D8].remaining_spend_conservative_hkd, '750.00');
    ctx.check('確定程度', p.uncertainty, 'determined');
  });

  T('T02', '指定商戶同月再入帳 $750', '累計 8% 高回贈 $100；額度用盡', ctx => {
    const r = ctx.calc({ trackerRows: d8Rows.slice(0, 2), transactionMap: d8Map.slice(0, 2) });
    ctx.check('8% 累計回贈', cyc(r).promotions[D8].low.reward_rc, '100.000000');
    ctx.check('8% 剩餘簽帳', cyc(r).promotions[D8].remaining_spend_conservative_hkd, '0.00');
    ctx.check('8% 剩餘 RC', cyc(r).promotions[D8].remaining_reward_conservative_rc, '0.000000');
    ctx.check('今筆回贈', pay(r, 'P2').low.reward_rc, '60.000000');
  });

  T('T03', '指定商戶同月再入帳 $200', '不再享 8%；基本 0.4% 約 $0.80', ctx => {
    const r = ctx.calc({ trackerRows: d8Rows, transactionMap: d8Map });
    const p = pay(r, 'P3');
    ctx.check('仍屬指定商戶類別', p.classification, D8);
    ctx.check('8% 部分簽帳', p.low.high_rate_spend_hkd, '0.00');
    ctx.check('今筆回贈（0.4%）', p.low.reward_rc, '0.800000');
    ctx.check('8% 類別累計', cyc(r).promotions[D8].low.reward_rc, '100.800000');
    ctx.check('確定程度', p.uncertainty, 'determined');
  });

  // ---- 4% 累積情境（T04–T06）----
  const o4Rows = [
    row(2, { Amount: '2000.00', 'Merchant / Note': '示範網店 A', Category: 'Shopping' }),
    row(3, { Date: '2026-10-12', Amount: '8000.00', 'Merchant / Note': '示範網店 A', Category: 'Shopping' }),
    row(4, { Date: '2026-10-20', Amount: '100.00', 'Merchant / Note': '示範網店 A', Category: 'Shopping' }),
  ];
  const o4Map = [
    online('Q1', 2, '2000.00'),
    online('Q2', 3, '8000.00', { post_date: '2026-10-13' }),
    online('Q3', 4, '100.00', { post_date: '2026-10-21' }),
  ];

  T('T04', 'HSBC Red 合資格網上消費 $2,000', '4% 高回贈約 $80；網上餘 $8,000 高回贈簽帳容量', ctx => {
    const r = ctx.calc({ trackerRows: o4Rows.slice(0, 1), transactionMap: o4Map.slice(0, 1) });
    const p = pay(r, 'Q1');
    ctx.check('分類', p.classification, O4);
    ctx.check('回贈', p.low.reward_rc, '80.000000');
    ctx.check('4% 剩餘簽帳', cyc(r).promotions[O4].remaining_spend_conservative_hkd, '8000.00');
    ctx.check('確定程度', p.uncertainty, 'determined');
  });

  T('T05', '網上同月累積達 $10,000', '4% 高回贈 $400；高回贈額度用盡', ctx => {
    const r = ctx.calc({ trackerRows: o4Rows.slice(0, 2), transactionMap: o4Map.slice(0, 2) });
    ctx.check('4% 累計回贈', cyc(r).promotions[O4].low.reward_rc, '400.000000');
    ctx.check('4% 剩餘簽帳', cyc(r).promotions[O4].remaining_spend_conservative_hkd, '0.00');
  });

  T('T06', '4% 上限用盡後再合資格網購 $100', '僅基本 0.4% 約 $0.40', ctx => {
    const r = ctx.calc({ trackerRows: o4Rows, transactionMap: o4Map });
    ctx.check('今筆回贈', pay(r, 'Q3').low.reward_rc, '0.400000');
    ctx.check('4% 部分簽帳', pay(r, 'Q3').low.high_rate_spend_hkd, '0.00');
    ctx.check('4% 類別累計', cyc(r).promotions[O4].low.reward_rc, '400.400000');
  });

  T('T07', '指定商戶亦屬網購', '僅歸 8%，不計入 4% 容量', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '500.00' })],
      transactionMap: [designated('P1', 2, '500.00', { payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'acquirer' })],
    });
    const p = pay(r, 'P1');
    ctx.check('分類', p.classification, D8);
    ctx.check('回贈', p.low.reward_rc, '40.000000');
    ctx.check('網購資格本身成立', p.evaluation.online.status, 'yes');
    ctx.check('4% 已用（低 / 高）', [cyc(r).promotions[O4].low.high_rate_spend_used_hkd, cyc(r).promotions[O4].high.high_rate_spend_used_hkd], ['0.00', '0.00']);
    ctx.check('4% 剩餘', cyc(r).promotions[O4].remaining_spend_conservative_hkd, '10000.00');
  });

  T('T08', '指定商戶 8% 額度已耗盡，再有同店網購', '仍歸指定商戶類別，不能自動轉到 4%', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '1250.00' }), row(3, { Date: '2026-10-12', Amount: '300.00' })],
      transactionMap: [
        designated('P1', 2, '1250.00'),
        designated('P2', 3, '300.00', { post_date: '2026-10-13', payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'acquirer' }),
      ],
    });
    const p = pay(r, 'P2');
    ctx.check('分類', p.classification, D8);
    ctx.check('今筆回贈（0.4%）', p.low.reward_rc, '1.200000');
    ctx.check('4% 已用', cyc(r).promotions[O4].high.high_rate_spend_used_hkd, '0.00');
  });

  T('T09', '`iCloud subscription`', '名稱標準化為 Apple iCloud；付款為 recurring；網上資格待確認', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Amount: '8.00', 'Merchant / Note': 'iCloud subscription', Category: 'Others' })] });
    const p = r.payments[0];
    ctx.check('canonical', p.merchant_canonical, 'Apple iCloud');
    ctx.truthy('recurring flag', p.flags.some(f => f.code === 'RECURRING'));
    ctx.check('網上資格', p.evaluation.online.status, 'maybe');
    ctx.check('低情境唔當 4%', p.low.promotion_id !== O4, true);
    ctx.check('高情境可能 4%', p.high.promotion_id, O4);
    ctx.check('確定程度', p.uncertainty, 'uncertain');
  });

  T('T10', '`icloud`', '同 T09；不自動合併成同一筆付款', ctx => {
    const r = ctx.calc({
      trackerRows: [
        row(2, { Date: '2026-10-12', Time: '08:00', Amount: '8.00', 'Merchant / Note': 'iCloud subscription' }),
        row(3, { Date: '2026-10-12', Time: '08:00', Amount: '8.00', 'Merchant / Note': 'icloud' }),
      ],
    });
    ctx.check('付款數', r.payments.length, 2);
    ctx.check('兩筆 canonical', r.payments.map(p => p.merchant_canonical), ['Apple iCloud', 'Apple iCloud']);
    ctx.check('網上資格待確認', r.payments.map(p => p.evaluation.online.status), ['maybe', 'maybe']);
  });

  T('T11', 'HSBC Red 還款 Transfer $8.08', '不計簽帳，不得扣回贈容量', ctx => {
    const r = ctx.calc({
      trackerRows: [
        row(2, { Amount: '500.00' }),
        row(3, { Type: 'Transfer', Account: '示範銀行', 'To Account': 'HSBC Red', Amount: '8.08', 'Merchant / Note': '還款', Category: 'Others', 'Sub-category': 'Credit Card Repayment' }),
      ],
      transactionMap: [designated('P1', 2, '500.00')],
    });
    ctx.check('付款數（只有簽帳）', r.payments.map(p => p.payment_id), ['P1']);
    ctx.check('還款列入 NOT_SPEND', r.not_spend.map(x => x.row_id), [3]);
    ctx.check('8% 剩餘唔受影響', cyc(r).promotions[D8].remaining_spend_conservative_hkd, '750.00');
  });

  function advanceCase(ctx, sub) {
    const r = ctx.calc({
      trackerRows: [
        row(2, { Type: 'Transfer', Amount: '450.00', 'Merchant / Note': '示範超級市場', Category: 'Groceries', 'Sub-category': sub }),
        // 屋企帳嗰邊嘅記錄（唔係 HSBC Red），唔可以重複計
        row(3, { Account: 'Family', Amount: '450.00', 'Merchant / Note': '示範超級市場', Category: 'Groceries' }),
      ],
    });
    ctx.check('候選付款只有一筆', r.payments.map(p => p.source_row_ids), [[2]]);
    ctx.truthy('標示代付', r.payments[0].flags.some(f => f.code === 'ADVANCE_PAYMENT'));
    ctx.check('屋企帳記錄被忽略', r.ignored_rows, 1);
    ctx.check('金額', r.payments[0].amount_hkd, '450.00');
  }
  T('T12', 'Household Advance 由 HSBC Red 支付', '作候選信用卡簽帳一次，不能因屋企記錄重複', ctx => advanceCase(ctx, 'Household Advance'));
  T('T13', 'Travel Advance 由 HSBC Red 支付', '同 T12', ctx => advanceCase(ctx, 'Travel Advance'));

  T('T14', '夾錢拆分兩行 300+600', '有可靠 payment_id 時合併原簽帳 $900；舊紀錄無 ID 則疑似配對', ctx => {
    const rows = [
      row(2, { Time: '19:00', Amount: '300.00', Category: 'Others', 'Sub-category': 'Reimbursable' }),
      row(3, { Time: '19:00', Amount: '600.00', Category: 'Meal' }),
    ];
    const a = ctx.calc({ trackerRows: rows, transactionMap: [designated('S1', 2, '900.00', { source_row_ids: [2, 3] })] });
    ctx.check('(a) 合併做一筆', a.payments.map(p => [p.payment_id, p.amount_hkd]), [['S1', '900.00']]);
    ctx.check('(a) source_row_ids', a.payments[0].source_row_ids, [2, 3]);
    const b = ctx.calc({ trackerRows: rows });
    ctx.check('(b) 唔合併，兩筆', b.payments.length, 2);
    ctx.check('(b) 兩筆都標疑似配對', b.payments.map(p => p.flags.some(f => f.code === 'SUSPECTED_SPLIT')), [true, true]);
    ctx.check('(b) 總額唔變', b.payments.reduce((s, p) => s + Math.round(Number(p.amount_hkd) * 100), 0), 90000);
  });

  T('T15', '不同交易剛好同時、同金額、同商戶', '不可無條件當重複，需交易 ID 或證據', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Time: '12:00' }), row(3, { Time: '12:00' })] });
    ctx.check('兩筆都保留', r.payments.length, 2);
    ctx.check('兩筆都標可能重複', r.payments.map(p => p.flags.some(f => f.code === 'POSSIBLE_DUPLICATE')), [true, true]);
    ctx.check('唔係 determined', r.payments.every(p => p.uncertainty !== 'determined'), true);
  });

  T('T16', '未入帳交易', '可以有預計值，但不可當已確認派發；入帳日未明須標示', ctx => {
    const r = ctx.calc({ trackerRows: [row(2)], transactionMap: [designated('P1', 2, '500.00', { post_date: null, post_status: 'pending' })] });
    const p = r.payments[0];
    ctx.check('有預計值', p.low.reward_rc, '40.000000');
    ctx.truthy('標示未入帳', p.flags.some(f => f.code === 'PENDING_NOT_POSTED'));
    ctx.truthy('標示入帳日未明', p.flags.some(f => f.code === 'POST_DATE_MISSING'));
    ctx.check('唔係 determined', p.uncertainty, 'conditional');
  });

  T('T17', '月末交易，次月入帳', '按實際次月 post date 計入次月', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Date: '2026-10-31' })], transactionMap: [designated('P1', 2, '500.00', { post_date: '2026-11-02' })] });
    ctx.check('週期', r.payments[0].cycle_key, '2026-11');
    ctx.check('10 月冇呢筆', r.cycles['2026-10'], undefined);
    ctx.check('11 月 8% 回贈', r.cycles['2026-11'].promotions[D8].low.reward_rc, '40.000000');
  });

  T('T18', '無 post date 交易', '按交易日作暫估，月底顯示週期風險', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Date: '2026-10-30' })], transactionMap: [designated('P1', 2, '500.00', { post_date: null })] });
    const p = r.payments[0];
    ctx.check('按交易日歸入', [p.cycle_key, p.cycle_basis], ['2026-10', 'transaction_date']);
    ctx.truthy('標示冇入帳日', p.flags.some(f => f.code === 'POST_DATE_MISSING'));
    ctx.check('月底提示（只屬 UI）', p.flags.filter(f => f.code === 'UI_MONTH_END_HINT').map(f => f.severity), ['ui']);
    ctx.check('暫估', p.uncertainty, 'conditional');
  });

  T('T19', '已入帳後全數退款', '清除／沖回相應回贈，整月重新計算', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2), row(3, { Date: '2026-10-20', Type: 'Refund', Amount: '500.00', 'Merchant / Note': 'Sushiro 退款' })],
      transactionMap: [designated('P1', 2, '500.00'), { payment_id: 'RF1', source_row_ids: [3], post_date: '2026-10-21', post_status: 'posted', original_currency: 'HKD', refund_of: 'P1' }],
    });
    const p = pay(r, 'P1');
    ctx.check('淨額', p.net_amount_low_hkd, '0.00');
    ctx.check('回贈沖回', [p.low.reward_rc, cyc(r).totals.low_rc], ['0.000000', '0.000000']);
    ctx.check('8% 額度恢復', cyc(r).promotions[D8].remaining_spend_conservative_hkd, '1250.00');
    ctx.check('追溯鏈', p.refunds, ['RF1']);
  });

  T('T20', '部分退款', '按退款後合資格金額重算，保留追溯鏈', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '1000.00' }), row(3, { Date: '2026-10-20', Type: 'Refund', Amount: '400.00', 'Merchant / Note': 'Sushiro 退款' })],
      transactionMap: [designated('P1', 2, '1000.00'), { payment_id: 'RF1', source_row_ids: [3], post_date: '2026-10-21', post_status: 'posted', original_currency: 'HKD', refund_of: 'P1' }],
    });
    const p = pay(r, 'P1');
    ctx.check('淨額', p.net_amount_low_hkd, '600.00');
    ctx.check('回贈', p.low.reward_rc, '48.000000');
    ctx.check('追溯鏈', [p.refunds, p.trace.some(t => t.includes('RF1'))], [['RF1'], true]);
  });

  T('T21', '商戶別名相同但不同地區', '不可單靠名稱判定指定海外商戶資格', ctx => {
    const base = { 'Merchant / Note': 'FamilyMart', Amount: '100.00' };
    const r = ctx.calc({
      trackerRows: [row(2, base), row(3, Object.assign({ Time: '13:00' }, base)), row(4, Object.assign({ Time: '14:00' }, base))],
      transactionMap: [
        designated('HK', 3, '100.00', { location: 'HK_STORE' }),
        designated('JP', 4, '100.00', { location: 'JP', store_verified: true, original_currency: 'JPY' }),
      ],
    });
    ctx.check('(a) 淨係名稱：未能確定', pay(r, 'ROW-2').evaluation.designated.status, 'maybe');
    ctx.check('(b) 香港 FamilyMart：唔係指定商戶', pay(r, 'HK').evaluation.designated.status, 'no');
    ctx.check('(c) 日本指定門市（已核實）：符合', pay(r, 'JP').evaluation.designated.status, 'yes');
    ctx.check('(a) 低情境唔計 8%', pay(r, 'ROW-2').low.promotion_id !== D8, true);
  });

  T('T22', '電子錢包交易或八達通充值', '不計入 4% 網上高回贈', ctx => {
    const r = ctx.calc({
      trackerRows: [
        row(2, { Amount: '300.00', 'Merchant / Note': '示範網店 A', Category: 'Shopping' }),
        row(3, { Time: '13:00', Amount: '500.00', 'Merchant / Note': '八達通自動增值', Category: 'Transport' }),
      ],
      transactionMap: [
        online('EW', 2, '300.00', { payment_method: 'ewallet_payment' }),
        online('OCT', 3, '500.00', { payment_method: 'physical_card', transaction_nature: 'octopus_topup', channel_evidence: 'bank_statement' }),
      ],
    });
    ['EW', 'OCT'].forEach(id => {
      const p = pay(r, id);
      ctx.check(`${id} 網上資格`, p.evaluation.online.status, 'no');
      ctx.check(`${id} 低 / 高情境都唔係 4%`, [p.low.promotion_id !== O4, p.high.promotion_id !== O4], [true, true]);
      ctx.check(`${id} 基本 0.4% 未確認`, p.evaluation.base.status, 'maybe');
    });
    ctx.check('4% 已用', cyc(r).promotions[O4].high.high_rate_spend_used_hkd, '0.00');
  });

  T('T23', '官方活動日期之外消費', '不適用 8%／4% 專屬活動', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Date: '2026-06-28' })], transactionMap: [designated('P1', 2, '500.00', { post_date: '2026-06-30' })] });
    const p = r.payments[0];
    ctx.check('8% / 4% 唔適用', [p.evaluation.designated.status, p.evaluation.online.status], ['no', 'no']);
    ctx.check('冇高回贈', [p.low.promotion_id, p.high.promotion_id], [null, null]);
    ctx.check('期外基本回贈唔推論', p.evaluation.base.status, 'terms_missing');
    ctx.check('冇 ledger', r.ledger.length, 0);
  });

  T('T24', '8% 網上交疊但 8% 額度已用完', '仍屬指定商戶，不自動切換 4%', ctx => {
    // 跨越門檻版本：已用 $1,000，再有同店網購 $500
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '1000.00' }), row(3, { Date: '2026-10-12', Amount: '500.00' })],
      transactionMap: [
        designated('P1', 2, '1000.00'),
        designated('P2', 3, '500.00', { post_date: '2026-10-13', payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'acquirer' }),
      ],
    });
    const p = pay(r, 'P2');
    ctx.check('分類', p.classification, D8);
    ctx.check('$250 用 8% + $250 用 0.4%', [p.low.high_rate_spend_hkd, p.low.reward_rc], ['250.00', '21.000000']);
    ctx.check('4% 已用（低 / 高）', [cyc(r).promotions[O4].low.high_rate_spend_used_hkd, cyc(r).promotions[O4].high.high_rate_spend_used_hkd], ['0.00', '0.00']);
    ctx.check('8% 類別累計（高回贈 100 + 基本 1）', cyc(r).promotions[D8].low.reward_rc, '101.000000');
  });

  T('T25', '任一舊交易類別／金額更改', '全週期重算結果更新，不重複扣限額', ctx => {
    const input = { trackerRows: d8Rows.slice(0, 2), transactionMap: d8Map.slice(0, 2) };
    const before = JSON.stringify(input);
    const r1 = ctx.calc(input);
    ctx.check('原本結果', cyc(r1).promotions[D8].low.reward_rc, '100.000000');
    ctx.check('輸入冇被修改', JSON.stringify(input), before);
    // 修改舊交易：$500 → $400，同時改 Category
    const changed = JSON.parse(before);
    changed.trackerRows[0].Amount = '400.00';
    changed.trackerRows[0].Category = 'Shopping';
    changed.transactionMap[0].original_amount_hkd = '400.00';
    const r2 = ctx.calc(changed);
    ctx.check('重算：0.08 × 1,150', cyc(r2).promotions[D8].low.reward_rc, '92.000000');
    ctx.check('剩餘額度更新', cyc(r2).promotions[D8].remaining_spend_conservative_hkd, '100.00');
    const fresh = NS.engine.calculate(Object.assign({ rules: NS.rules.HSBC_RED }, JSON.parse(JSON.stringify(changed))));
    ctx.check('同全新計算結果完全相同', JSON.stringify(r2), JSON.stringify(fresh));
  });

  T('T26', '重複執行同一計算', '結果相同，無重覆 Reward Ledger 計算項', ctx => {
    const input = { trackerRows: d8Rows, transactionMap: d8Map };
    const a = ctx.calc(input), b = ctx.calc(input);
    ctx.check('兩次結果完全相同', JSON.stringify(a), JSON.stringify(b));
    const keys = a.ledger.map(l => [l.payment_id, l.promotion_id, l.cycle_key, l.scenario].join('|'));
    ctx.check('ledger key 冇重複', new Set(keys).size, keys.length);
    ctx.check('每筆付款每個情境一行', keys.length, 6);
  });

  T('T27', '只有 AI 猜測商戶渠道', '保留 uncertain，不當確定享 4%', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '300.00', 'Merchant / Note': '示範網店 A', Category: 'Shopping' })],
      transactionMap: [online('Q1', 2, '300.00', { channel_evidence: 'ai_guess' })],
    });
    const p = r.payments[0];
    ctx.check('網上資格', p.evaluation.online.status, 'maybe');
    ctx.check('低情境唔係 4%', p.low.promotion_id !== O4, true);
    ctx.check('確定程度', p.uncertainty, 'uncertain');
    ctx.check('4% 低情境已用', cyc(r).promotions[O4].low.high_rate_spend_used_hkd, '0.00');
  });

  T('T28', 'Lai 查看家庭 Dashboard', '不可取得 Amy 個人信用卡回贈資料', ctx => {
    // 離線部分：前端 mock 資料層 guard
    const lai = NS.mock.loadMockRewardData('lai');
    ctx.check('Lai：FORBIDDEN', [lai.ok, lai.code], [false, 'FORBIDDEN']);
    ctx.check('Lai：冇交易資料', [lai.trackerRows.length, lai.transactionMap.length], [0, 0]);
    const unknown = NS.mock.loadMockRewardData(undefined);
    ctx.check('冇 role：FORBIDDEN', unknown.code, 'FORBIDDEN');
    const amy = NS.mock.loadMockRewardData('amy');
    ctx.check('Amy：有資料', amy.ok && amy.trackerRows.length > 0, true);
    // Server 部分：Apps Script v1.34 唔可以改，冇 server 可測
    ctx.notYetTestable('離線部分已通過；server-side 權限（Apps Script 按 key 拒絕 Lai）未實作，未能測試');
  });

  T('T29', '遇到缺失官方條款', '不自動推論，有效性標記未確認', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Date: '2027-01-05' })], transactionMap: [designated('P1', 2, '500.00', { post_date: '2027-01-06' })] });
    const p = r.payments[0];
    ctx.truthy('標示 TERMS_MISSING', p.flags.some(f => f.code === 'TERMS_MISSING'));
    ctx.check('無法確認', p.uncertainty, 'undeterminable');
    ctx.check('冇推論任何回贈', [p.low.promotion_id, p.high.promotion_id, r.ledger.length], [null, null, 0]);
    ctx.check('列入無法確認', cyc(r, '2027-01').report.undeterminable.payment_ids, ['P1']);
  });

  T('T30', '交易資料含外幣，無入帳 HKD', '保留候選交易，暫不作確定回贈計算', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '3200', 'Merchant / Note': 'FamilyMart' })],
      transactionMap: [designated('JP1', 2, null, { original_currency: 'JPY', location: 'JP', store_verified: true })],
    });
    const p = r.payments[0];
    ctx.check('保留候選', p.payment_id, 'JP1');
    ctx.check('冇 HKD 金額', p.amount_hkd, null);
    ctx.truthy('標示 FX_NO_HKD_AMOUNT', p.flags.some(f => f.code === 'FX_NO_HKD_AMOUNT'));
    ctx.check('無法確認', p.uncertainty, 'undeterminable');
    ctx.check('唔計入總數', [cyc(r).totals.low_rc, cyc(r).totals.high_rc], ['0.000000', '0.000000']);
    ctx.check('提示剩餘額度可能更少', cyc(r).promotions[D8].remaining_may_be_lower, ['JP1']);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
