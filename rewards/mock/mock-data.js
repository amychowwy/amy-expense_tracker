/* Amy Reward Engine — 模擬資料（全部虛構）
 *
 * - 欄位模仿 Tracker：Date, Time, Type, Account, To Account, Amount, Merchant / Note,
 *   Category, Sub-category, Source, Created At（Spec §6）。
 * - 冇任何真實交易、key 或 Apps Script URL。金額同日期都係作出嚟。
 * - transactionMap 係 RewardTransactionMap 嘅虛構 overlay（Tracker 冇 post date / 幣別 / 渠道）。
 * - 第 1 階段只供測試同日後 demo 用，冇任何 fetch。
 */
'use strict';
(function (g) {
  const NS = g.AmyRewards = g.AmyRewards || {};

  const row = (r, o) => Object.assign({
    _row: r, Date: '2026-10-05', Time: '12:00', Type: 'Expense', Account: 'HSBC Red', 'To Account': '',
    Amount: '0.00', 'Merchant / Note': '', Category: 'Others', 'Sub-category': '', Source: 'Manual',
    'Created At': '2026-10-05 12:01',
  }, o);

  const trackerRows = [
    row(2, { Date: '2026-10-03', Time: '19:20', Amount: '320.00', 'Merchant / Note': 'Sushiro', Category: 'Meal', Source: 'Apple Pay' }),
    row(3, { Date: '2026-10-08', Time: '13:05', Amount: '1,180.00', 'Merchant / Note': 'Sephora', Category: 'Beauty' }),
    row(4, { Date: '2026-10-10', Time: '21:40', Amount: '2,350.50', 'Merchant / Note': '示範網店 A', Category: 'Shopping', Source: 'Notification' }),
    row(5, { Date: '2026-10-12', Time: '08:00', Amount: '8.00', 'Merchant / Note': 'iCloud subscription', Category: 'Others' }),
    row(6, { Date: '2026-10-15', Time: '18:30', Amount: '260.00', 'Merchant / Note': '示範茶餐廳', Category: 'Meal' }),
    row(7, { Date: '2026-10-18', Time: '10:10', Amount: '500.00', 'Merchant / Note': '八達通自動增值', Category: 'Transport' }),
    row(8, { Date: '2026-10-20', Time: '20:00', Type: 'Transfer', Amount: '450.00', 'Merchant / Note': '示範超級市場', Category: 'Groceries', 'Sub-category': 'Household Advance' }),
    row(9, { Date: '2026-10-22', Time: '15:00', Type: 'Transfer', Account: '示範銀行', 'To Account': 'HSBC Red', Amount: '3,000.00', 'Merchant / Note': '還款', 'Sub-category': 'Credit Card Repayment' }),
    row(10, { Date: '2026-10-24', Time: '12:30', Amount: '1,200.00', 'Merchant / Note': '示範網店 B', Category: 'Shopping' }),
    row(11, { Date: '2026-10-26', Time: '12:00', Type: 'Refund', Amount: '400.00', 'Merchant / Note': '示範網店 B 退款', Category: 'Shopping' }),
    row(12, { Date: '2026-10-30', Time: '22:15', Amount: '780.00', 'Merchant / Note': 'FamilyMart', Category: 'Travelling' }),
    row(13, { Date: '2026-10-31', Time: '23:10', Amount: '150.00', 'Merchant / Note': '示範網店 C', Category: 'Shopping' }),
    // ---- 11 月 ----
    row(14, { Date: '2026-11-02', Time: '12:40', Amount: '168.00', 'Merchant / Note': 'TamJai SamGor Mixian', Category: 'Meal' }),
    row(15, { Date: '2026-11-03', Time: '10:00', Type: 'Refund', Amount: '350.50', 'Merchant / Note': '示範網店 A 部分退款', Category: 'Shopping' }),
    row(16, { Date: '2026-11-04', Time: '20:15', Amount: '3,680.00', 'Merchant / Note': '示範網店 A', Category: 'Shopping', Source: 'Notification' }),
    row(17, { Date: '2026-11-06', Time: '16:30', Amount: '899.00', 'Merchant / Note': 'Decathlon Hong Kong', Category: 'Shopping' }),
    row(18, { Date: '2026-11-07', Time: '19:00', Type: 'Transfer', Amount: '1,560.00', 'Merchant / Note': '示範航空公司', Category: 'Travelling', 'Sub-category': 'Travel Advance' }),
    row(19, { Date: '2026-11-08', Time: '13:10', Amount: '420.00', 'Merchant / Note': '@cosme STORE', Category: 'Beauty', Source: 'Apple Pay' }),
    row(20, { Date: '2026-11-10', Time: '09:00', Amount: '1,200.00', 'Merchant / Note': '示範管理公司', Category: 'Others' }),
    row(21, { Date: '2026-11-10', Time: '22:30', Amount: '258.00', 'Merchant / Note': '示範網店 B', Category: 'Shopping' }),
  ];

  const transactionMap = [
    { payment_id: 'M-SUSHIRO', source_row_ids: [2], post_date: '2026-10-04', post_status: 'posted', original_currency: 'HKD', original_amount_hkd: '320.00', payment_method: 'apple_pay_in_store', transaction_channel: 'offline', channel_evidence: 'bank_statement', transaction_nature: 'purchase', location: 'HK_STORE' },
    { payment_id: 'M-SEPHORA', source_row_ids: [3], post_date: '2026-10-09', post_status: 'posted', original_currency: 'HKD', original_amount_hkd: '1180.00', payment_method: 'physical_card', transaction_channel: 'offline', channel_evidence: 'bank_statement', transaction_nature: 'purchase', location: 'HK_STORE' },
    { payment_id: 'M-SHOP-A', source_row_ids: [4], post_date: '2026-10-12', post_status: 'posted', original_currency: 'HKD', original_amount_hkd: '2350.50', payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'acquirer', transaction_nature: 'purchase' },
    { payment_id: 'M-OCTOPUS', source_row_ids: [7], post_date: '2026-10-19', post_status: 'posted', original_currency: 'HKD', payment_method: 'physical_card', transaction_channel: 'online', channel_evidence: 'bank_statement', transaction_nature: 'octopus_topup' },
    { payment_id: 'M-SHOP-B', source_row_ids: [10], post_date: '2026-10-25', post_status: 'posted', original_currency: 'HKD', payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'acquirer', transaction_nature: 'purchase' },
    { payment_id: 'M-SHOP-B-REFUND', source_row_ids: [11], post_date: '2026-10-27', post_status: 'posted', original_currency: 'HKD', refund_of: 'M-SHOP-B' },
    { payment_id: 'M-FAMILYMART-JP', source_row_ids: [12], post_status: 'pending', original_currency: 'JPY', payment_method: 'physical_card', transaction_channel: 'offline', transaction_nature: 'purchase', location: 'JP' },
    // ---- 11 月 ----
    { payment_id: 'M-TAMJAI', source_row_ids: [14], post_date: '2026-11-03', post_status: 'posted', original_currency: 'HKD', original_amount_hkd: '168.00', payment_method: 'physical_card', transaction_channel: 'offline', channel_evidence: 'bank_statement', transaction_nature: 'purchase', location: 'HK_STORE' },
    { payment_id: 'M-SHOP-A-REFUND', source_row_ids: [15], post_date: '2026-11-04', post_status: 'posted', original_currency: 'HKD', refund_of: 'M-SHOP-A' }, // 跨月退款（原交易喺 10 月）
    { payment_id: 'M-SHOP-A-NOV', source_row_ids: [16], post_date: '2026-11-05', post_status: 'posted', original_currency: 'HKD', original_amount_hkd: '3680.00', payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'acquirer', transaction_nature: 'purchase' },
    { payment_id: 'M-TRAVEL', source_row_ids: [18], post_date: '2026-11-08', post_status: 'posted', original_currency: 'HKD', payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'user_confirmed', transaction_nature: 'purchase' },
    { payment_id: 'M-COSME', source_row_ids: [19], post_date: '2026-11-09', post_status: 'posted', original_currency: 'HKD', payment_method: 'apple_pay_in_store', transaction_channel: 'offline', channel_evidence: 'bank_statement', transaction_nature: 'purchase', location: 'HK_STORE' },
    { payment_id: 'M-MGMT', source_row_ids: [20], post_date: '2026-11-11', post_status: 'posted', original_currency: 'HKD', payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'bank_statement', transaction_nature: 'rent_management_fee' },
    { payment_id: 'M-SHOP-B-NOV', source_row_ids: [21], post_status: 'pending', original_currency: 'HKD', payment_method: 'online_card_entry', transaction_channel: 'online', channel_evidence: 'acquirer', transaction_nature: 'purchase' },
  ];

  // T28 離線部分：只有 role = amy 先攞到個人信用卡回贈資料。
  // 真正嘅權限必須由 server（Apps Script）按 key 判斷；呢度只係前端 guard，唔算保安。
  function loadMockRewardData(role) {
    if (role !== 'amy') {
      return { ok: false, code: 'FORBIDDEN', message: '只有 Amy 可以查看個人信用卡回贈', trackerRows: [], transactionMap: [] };
    }
    return {
      ok: true, role: 'amy', mock: true,
      trackerRows: JSON.parse(JSON.stringify(trackerRows)),
      transactionMap: JSON.parse(JSON.stringify(transactionMap)),
    };
  }

  NS.mock = { loadMockRewardData };
})(typeof globalThis !== 'undefined' ? globalThis : this);
