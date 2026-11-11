/* 額外邊界測試（X 系列），同 Spec T01–T30 分開。主要覆蓋設計審核嘅 8 項修正。 */
'use strict';
(function (g) {
  const NS = g.AmyRewards;
  const { row, designated, online, pay, cyc } = NS.fixtures;
  const X = (id, title, expected, fn) => NS.test.define('extra', id, title, expected, fn);
  const D8 = 'RED_DESIGNATED_8', O4 = 'RED_ONLINE_4', B04 = 'RED_BASE_04';
  const I = NS.engine._internal;

  X('X01', '修正 1：Apple Pay 實體店、Apple 訂閱、電子錢包充值分開識別', '三種付款方式各自處理，唔會一律當電子錢包', ctx => {
    const r = ctx.calc({
      trackerRows: [
        row(2, { Amount: '200.00', Source: 'Apple Pay' }),
        row(3, { Time: '13:00', Amount: '8.00', 'Merchant / Note': 'iCloud subscription', Source: 'Apple Pay' }),
        row(4, { Time: '14:00', Amount: '300.00', 'Merchant / Note': '示範電子錢包增值', Source: 'Apple Pay' }),
      ],
      transactionMap: [
        designated('AP', 2, '200.00', { payment_method: 'apple_pay_in_store' }),
        online('SUB', 3, '8.00', { payment_method: 'card_on_file_recurring', channel_evidence: null, transaction_channel: null }),
        online('TOP', 4, '300.00', { payment_method: 'ewallet_topup' }),
      ],
    });
    ctx.check('Apple Pay 實體店：8% 未確認（唔係直接排除）', pay(r, 'AP').evaluation.designated.status, 'maybe');
    ctx.check('Apple 訂閱：唔係電子錢包，網上資格待確認', pay(r, 'SUB').evaluation.online.status, 'maybe');
    ctx.truthy('Apple 訂閱冇電子錢包原因', !pay(r, 'SUB').evaluation.online.reasons.some(x => x.includes('電子錢包')));
    ctx.check('電子錢包充值：唔入 4%', pay(r, 'TOP').evaluation.online.status, 'no');
  });

  X('X02', '修正 1：Source 唔影響結果', '同一筆交易 Source 唔同，分類完全相同', ctx => {
    const make = src => NS.engine.calculate({
      rules: NS.rules.HSBC_RED, trackerRows: [row(2, { Source: src })], transactionMap: [designated('P1', 2, '500.00')],
    }).payments[0];
    const a = make('Manual'), b = make('Apple Pay'), c = make('Notification');
    const strip = p => Object.assign({}, p, { source_hint: null });
    ctx.check('Manual = Apple Pay', JSON.stringify(strip(a)), JSON.stringify(strip(b)));
    ctx.check('Manual = Notification', JSON.stringify(strip(a)), JSON.stringify(strip(c)));
  });

  X('X03', 'Category 唔影響資格', 'Category 改咗，分類唔變', ctx => {
    const make = cat => NS.engine.calculate({ rules: NS.rules.HSBC_RED, trackerRows: [row(2, { Category: cat })], transactionMap: [designated('P1', 2, '500.00')] }).payments[0];
    ctx.check('Meal vs Insurance', [make('Meal').classification, make('Insurance').classification], [D8, D8]);
  });

  X('X04', '修正 2：冇幣別唔可以當確定 HKD', 'CURRENCY_UNCONFIRMED，最多 conditional', ctx => {
    const r = ctx.calc({ trackerRows: [row(2)], transactionMap: [designated('P1', 2, null, { original_currency: null })] });
    const p = r.payments[0];
    ctx.check('金額來源', p.amount_basis, 'tracker_assumed_hkd');
    ctx.truthy('標示 CURRENCY_UNCONFIRMED', p.flags.some(f => f.code === 'CURRENCY_UNCONFIRMED'));
    ctx.check('唔係 determined', p.uncertainty, 'conditional');
    const r2 = ctx.calc({ trackerRows: [row(2)], transactionMap: [designated('P1', 2, null, { original_currency: 'HKD' })] });
    ctx.check('有申報 HKD：可以 determined', r2.payments[0].uncertainty, 'determined');
  });

  X('X05', '修正 3：跨月退款', '模擬淨額照計，但標 uncertain；低情境已扣、高情境未扣', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '1000.00' }), row(3, { Date: '2026-11-03', Type: 'Refund', Amount: '400.00' })],
      transactionMap: [designated('P1', 2, '1000.00'), { payment_id: 'RF1', source_row_ids: [3], post_date: '2026-11-04', original_currency: 'HKD', refund_of: 'P1' }],
    });
    const p = pay(r, 'P1');
    ctx.truthy('標示 CROSS_MONTH_REFUND', p.flags.some(f => f.code === 'CROSS_MONTH_REFUND'));
    ctx.check('確定程度', p.uncertainty, 'uncertain');
    ctx.check('淨額（低 / 高）', [p.net_amount_low_hkd, p.net_amount_high_hkd], ['600.00', '1000.00']);
    ctx.check('回贈（低 / 高）', [p.low.reward_rc, p.high.reward_rc], ['48.000000', '80.000000']);
  });

  X('X06', '修正 4：基本 0.4% 獨立判斷', '一般簽帳 = conditional；被排除嘅交易 = 未確認，低情境唔計', ctx => {
    const r = ctx.calc({
      trackerRows: [
        row(2, { Amount: '100.00', 'Merchant / Note': '示範茶餐廳' }),
        row(3, { Time: '13:00', Amount: '1000.00', 'Merchant / Note': '示範保險公司' }),
      ],
      transactionMap: [
        designated('N1', 2, '100.00'),
        online('INS', 3, '1000.00', { transaction_nature: 'insurance_premium' }),
      ],
    });
    ctx.check('一般簽帳：基本 conditional', pay(r, 'N1').evaluation.base.status, 'conditional');
    ctx.check('一般簽帳：低情境 0.4%', [pay(r, 'N1').low.promotion_id, pay(r, 'N1').low.reward_rc], [B04, '0.400000']);
    ctx.check('一般簽帳：conditional', pay(r, 'N1').uncertainty, 'conditional');
    ctx.check('保費：基本未確認', pay(r, 'INS').evaluation.base.status, 'maybe');
    ctx.check('保費：低情境 0', [pay(r, 'INS').low.promotion_id, pay(r, 'INS').low.reward_rc], [null, null]);
  });

  X('X07', '修正 6：OLIVE YOUNG 修訂日期', '2026-07-15 前 = 未確認；之後韓國門市 = 符合', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Date: '2026-07-10', 'Merchant / Note': 'OLIVE YOUNG' }), row(3, { Date: '2026-07-20', 'Merchant / Note': 'OLIVE YOUNG' })],
      transactionMap: [
        designated('OY1', 2, '500.00', { post_date: '2026-07-11', location: 'KR' }),
        designated('OY2', 3, '500.00', { post_date: '2026-07-21', location: 'KR' }),
      ],
    });
    ctx.check('07-10', pay(r, 'OY1').evaluation.designated.status, 'maybe');
    ctx.check('07-20', pay(r, 'OY2').evaluation.designated.status, 'yes');
  });

  X('X08', '修正 6：WOWPASS / 百貨專櫃 / Tmoney / 冇地區', '唔自行推論資格', ctx => {
    const r = ctx.calc({
      trackerRows: [
        row(2, { Date: '2026-10-05', 'Merchant / Note': 'WOWPASS' }),
        row(3, { Time: '13:00', 'Merchant / Note': 'Sephora' }),
        row(4, { Time: '14:00', 'Merchant / Note': 'Tmoney' }),
        row(5, { Time: '15:00', 'Merchant / Note': 'Sephora' }),
      ],
      transactionMap: [
        designated('W', 2, '500.00', { location: 'KR' }),
        designated('C', 3, '500.00', { location: 'HK_DEPT_COUNTER' }),
        designated('TM', 4, '500.00', { location: 'KR' }),
        designated('NL', 5, '500.00', { location: null }),
      ],
    });
    ctx.check('WOWPASS 已刪除', pay(r, 'W').evaluation.designated.status, 'no');
    ctx.check('百貨專櫃唔計', pay(r, 'C').evaluation.designated.status, 'no');
    ctx.check('Tmoney 需再核實', pay(r, 'TM').evaluation.designated.status, 'maybe');
    ctx.check('冇地區資料', pay(r, 'NL').evaluation.designated.status, 'maybe');
  });

  X('X09', '修正 7：rate_inclusive + includes_base', '每個 promotion 都明確記錄；8% 唔會再加 0.4%', ctx => {
    ctx.check('includes_base 欄位', NS.rules.HSBC_RED.promotions.map(p => [p.promotion_id, typeof p.rate_inclusive, p.includes_base]),
      [[D8, 'string', true], [O4, 'string', true], [B04, 'string', true]]);
    const r = ctx.calc({ trackerRows: [row(2)], transactionMap: [designated('P1', 2, '500.00')] });
    ctx.check('$500 × 8% = 40（唔係 42）', r.payments[0].low.reward_rc, '40.000000');
  });

  X('X10', '修正 8：月尾提示唔影響計算', '有入帳日嘅月尾交易冇提示，仍然 determined', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Date: '2026-10-30' })], transactionMap: [designated('P1', 2, '500.00', { post_date: '2026-10-31' })] });
    const p = r.payments[0];
    ctx.check('冇 UI 提示', p.flags.some(f => f.code === 'UI_MONTH_END_HINT'), false);
    ctx.check('determined', p.uncertainty, 'determined');
  });

  X('X11', '交易次序唔影響每月總數', '打亂 rows 次序，cycle 結果相同', ctx => {
    const rows = [row(2, { Amount: '900.00' }), row(3, { Date: '2026-10-08', Amount: '600.00' }), row(4, { Date: '2026-10-09', Amount: '300.00', 'Merchant / Note': '示範網店 A' })];
    const map = [designated('A', 2, '900.00'), designated('B', 3, '600.00', { post_date: '2026-10-09' }), online('C', 4, '300.00', { post_date: '2026-10-10' })];
    const a = ctx.calc({ trackerRows: rows, transactionMap: map });
    const b = ctx.calc({ trackerRows: rows.slice().reverse(), transactionMap: map.slice().reverse() });
    ctx.check('cycle 結果相同', JSON.stringify(a.cycles), JSON.stringify(b.cycles));
  });

  X('X12', '4% 跨越門檻拆單', '$9,900 + $200 → 4% × 100 + 0.4% × 100', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '9900.00', 'Merchant / Note': '示範網店 A' }), row(3, { Date: '2026-10-08', Amount: '200.00', 'Merchant / Note': '示範網店 A' })],
      transactionMap: [online('A', 2, '9900.00'), online('B', 3, '200.00', { post_date: '2026-10-09' })],
    });
    ctx.check('今筆', [pay(r, 'B').low.high_rate_spend_hkd, pay(r, 'B').low.reward_rc], ['100.00', '4.400000']);
  });

  X('X13', '上限 invariant', '10 筆 $500 指定商戶，8% 高回贈最多 100 RC', ctx => {
    const rows = [], map = [];
    for (let i = 0; i < 10; i++) { rows.push(row(i + 2, { Date: `2026-10-${String(i + 1).padStart(2, '0')}` })); map.push(designated('P' + i, i + 2, '500.00', { post_date: `2026-10-${String(i + 2).padStart(2, '0')}` })); }
    const r = ctx.calc({ trackerRows: rows, transactionMap: map });
    ctx.check('8% 類別 = 100 + 3,750 × 0.4%', cyc(r).promotions[D8].low.reward_rc, '115.000000');
    ctx.check('8% 已用簽帳', cyc(r).promotions[D8].low.high_rate_spend_used_hkd, '1250.00');
  });

  X('X14', '精確運算', '冇浮點數誤差', ctx => {
    ctx.check('HK$1,234.50', I.parseCents('HK$1,234.50'), 123450);
    ctx.check('0.10 + 0.20', I.parseCents('0.10') + I.parseCents('0.20'), I.parseCents('0.30'));
    ctx.check('rate', [I.parseRateBp('0.08'), I.parseRateBp('0.04'), I.parseRateBp('0.004')], [800, 400, 40]);
    ctx.check('$0.01 × 0.4%', I.microStr(I.parseCents('0.01') * 40), '0.000040');
    ctx.check('顯示四捨五入', [I.microDisplay(5000), I.microDisplay(4999)], ['0.01', '0.00']);
  });

  X('X15', '退款冇連結原交易', '放入 review，唔計入', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Type: 'Refund', Amount: '100.00' })] });
    ctx.check('review', r.review.map(x => x.code), ['REFUND_UNLINKED']);
    ctx.check('冇付款', r.payments.length, 0);
  });

  X('X16', '有效期跨越 12-31', '交易日 12-30、入帳日 2027-01-02 → uncertain', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Date: '2026-12-30' })], transactionMap: [designated('P1', 2, '500.00', { post_date: '2027-01-02' })] });
    const p = r.payments[0];
    ctx.check('8% 未確認', p.evaluation.designated.status, 'maybe');
    ctx.check('確定程度', p.uncertainty, 'uncertain');
  });

  X('X17', '未知 HSBC Red 記錄類型', '放入 review，唔估', ctx => {
    const r = ctx.calc({ trackerRows: [row(2, { Type: 'Transfer', 'Sub-category': 'Cash' })] });
    ctx.check('review', r.review.map(x => x.code), ['UNHANDLED_ROW']);
    ctx.check('冇付款', r.payments.length, 0);
  });

  X('X18', '已取消交易', '唔計', ctx => {
    const r = ctx.calc({ trackerRows: [row(2)], transactionMap: [designated('P1', 2, '500.00', { post_status: 'cancelled' })] });
    ctx.check('cancelled', r.cancelled.map(x => x.payment_id), ['P1']);
    ctx.check('冇付款', r.payments.length, 0);
  });

  X('X19', '模擬資料可以完整計算', 'mock 資料行到，冇錯誤', ctx => {
    const d = NS.mock.loadMockRewardData('amy');
    const r = ctx.calc({ trackerRows: d.trackerRows, transactionMap: d.transactionMap });
    ctx.truthy('有 2026-10 週期', !!r.cycles['2026-10']);
    ctx.check('還款唔計', r.not_spend.length, 1);
    ctx.truthy('JPY 冇 HKD → 無法確認', pay(r, 'M-FAMILYMART-JP').uncertainty === 'undeterminable');
  });

  X('X21', '指定商戶未確認 + 網購證據齊全', '低情境用 0.4%，唔會改計 4%（優先 8% 規則）', ctx => {
    const r = ctx.calc({
      trackerRows: [row(2, { Amount: '500.00' })],
      transactionMap: [online('P1', 2, '500.00')], // Sushiro，冇地區資料
    });
    const p = r.payments[0];
    ctx.check('8% 未確認', p.evaluation.designated.status, 'maybe');
    ctx.check('網購本身成立', p.evaluation.online.status, 'yes');
    ctx.check('低 / 高情境', [p.low.promotion_id, p.high.promotion_id], [B04, D8]);
    ctx.check('4% 已用（低 / 高）', [cyc(r).promotions[O4].low.high_rate_spend_used_hkd, cyc(r).promotions[O4].high.high_rate_spend_used_hkd], ['0.00', '0.00']);
  });

  X('X22', '指定商戶經電子錢包付款', '唔算指定商戶交易（Spec §2 第 7 點）', ctx => {
    const r = ctx.calc({ trackerRows: [row(2)], transactionMap: [designated('P1', 2, '500.00', { payment_method: 'ewallet_payment' })] });
    const p = r.payments[0];
    ctx.check('8% 唔適用', p.evaluation.designated.status, 'no');
    ctx.check('低 / 高情境都唔係 8%', [p.low.promotion_id !== D8, p.high.promotion_id !== D8], [true, true]);
  });

  X('X20', '商戶名唔會模糊配對', '「TamJai」唔會配中任何一間；「Sushiro 晚餐」會配中 Sushiro', ctx => {
    const prep = I.prepareRules(NS.rules.HSBC_RED);
    ctx.check('TamJai', I.matchMerchant('TamJai', prep).status, 'none');
    ctx.check('Sushiro 晚餐', I.matchMerchant('Sushiro 晚餐', prep).rule.canonical_merchant, 'Sushiro');
    ctx.check('Sushirox', I.matchMerchant('Sushirox', prep).status, 'none');
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
