/* 測試用虛構資料工具。全部數據係作出嚟，冇真實交易。 */
'use strict';
(function (g) {
  const NS = g.AmyRewards = g.AmyRewards || {};

  // Tracker row（Spec §6 欄位）
  function row(r, o) {
    return Object.assign({
      _row: r, Date: '2026-10-05', Time: '12:00', Type: 'Expense', Account: 'HSBC Red', 'To Account': '',
      Amount: '500.00', 'Merchant / Note': 'Sushiro', Category: 'Meal', 'Sub-category': '',
      Source: 'Manual', 'Created At': '2026-10-05 12:01',
    }, o);
  }

  // 證據齊全嘅指定商戶 overlay（香港店舖、實體卡、已入帳、HKD）
  function designated(id, rowId, amount, o) {
    return Object.assign({
      payment_id: id, source_row_ids: [rowId], post_date: '2026-10-06', post_status: 'posted',
      original_currency: 'HKD', original_amount_hkd: amount, payment_method: 'physical_card',
      transaction_channel: 'offline', channel_evidence: 'bank_statement', transaction_nature: 'purchase',
      location: 'HK_STORE',
    }, o);
  }

  // 證據齊全嘅網上簽帳 overlay（收單機構分類為網上、網上輸入卡號）
  function online(id, rowId, amount, o) {
    return Object.assign({
      payment_id: id, source_row_ids: [rowId], post_date: '2026-10-06', post_status: 'posted',
      original_currency: 'HKD', original_amount_hkd: amount, payment_method: 'online_card_entry',
      transaction_channel: 'online', channel_evidence: 'acquirer', transaction_nature: 'purchase',
    }, o);
  }

  const pay = (r, id) => r.payments.find(p => p.payment_id === id);
  const cyc = (r, k) => r.cycles[k || '2026-10'];

  NS.fixtures = { row, designated, online, pay, cyc };
})(typeof globalThis !== 'undefined' ? globalThis : this);
