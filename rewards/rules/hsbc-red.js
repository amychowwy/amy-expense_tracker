/* Amy Reward Engine — HSBC Red 規則（v1.0）
 *
 * 來源：HSBC_Red_Reward_Engine_Spec_v1.0.md（摘錄自用戶提供嘅 Red.pdf，
 * HSBC Red Credit Card Reward Scheme，2026-07-01 至 2026-12-31，修訂於 2026-07-15 生效）。
 *
 * 重要：
 * - 呢度所有規則都只係「按 Spec 摘錄」，未經獨立核實銀行原文（verification_status 寫明）。
 * - 唔可以加入 Spec / Red 專屬條款冇寫嘅商戶、地區或者日期；冇法核實就標 needs_verification。
 * - 呢個檔只有規則，冇任何真實交易、key 或 URL。
 */
'use strict';
(function (g) {
  const NS = g.AmyRewards = g.AmyRewards || {};
  NS.rules = NS.rules || {};

  const SRC = 'SRC_RED_SPEC_V1';
  const PERIOD = { valid_from: '2026-07-01', valid_to: '2026-12-31' };

  NS.rules.HSBC_RED = Object.freeze({
    card_id: 'HSBC_RED',
    rules_version: 'hsbc-red-rules-1.0',
    // Tracker 嘅 Account 欄（去頭尾空格後完全相同）
    account_names: ['HSBC Red'],

    // ===== PromotionSources =====
    sources: [
      {
        source_id: SRC,
        document_name: 'Red.pdf — HSBC Red Credit Card Reward Scheme（經 Spec v1.0 摘錄）',
        source_url: '',
        document_effective_date: '2026-07-15',
        checked_at: '2026-11-11',
        extracted_at: '2026-11-11',
        verification_status: 'spec_summary_not_independently_verified',
        notes: 'Engine 只讀 Spec 摘錄，未直接閱讀 Red.pdf 原文。',
      },
      {
        source_id: 'SRC_USER_NOTE',
        document_name: '用戶說明（Spec §4 第 4 點）',
        source_url: '',
        document_effective_date: '',
        checked_at: '2026-11-11',
        extracted_at: '2026-11-11',
        verification_status: 'user_statement_not_bank_terms',
        notes: 'iCloud 兩筆為 Apple 自動扣信用卡；未確認 Mastercard 網購資格或入帳日。',
      },
    ],

    // ===== CardPromotions =====
    // rate_inclusive：回贈率數值字串；includes_base：呢個回贈率係咪已經包含基本 0.4%。
    promotions: [
      Object.assign({
        promotion_id: 'RED_DESIGNATED_8', card_id: 'HSBC_RED', name: '指定商戶 8%',
        rate_inclusive: '0.08', includes_base: true,
        cap_unit: 'RC', cap_value: '100', high_rate_spend_limit: '1250',
        cycle_type: 'calendar_month', cycle_date_basis: 'post_date', priority: 1,
        overflow_to: 'RED_BASE_04', // 條款 5：用完 8% 唔會轉 4%
        source_id: SRC, source_ref: 'Red.pdf p.1–2，條款 1–7',
        verification_status: 'per_spec_v1.0',
      }, PERIOD),
      Object.assign({
        promotion_id: 'RED_ONLINE_4', card_id: 'HSBC_RED', name: '網上簽帳 4%',
        rate_inclusive: '0.04', includes_base: true,
        cap_unit: 'RC', cap_value: '400', high_rate_spend_limit: '10000',
        cycle_type: 'calendar_month', cycle_date_basis: 'post_date', priority: 2,
        overflow_to: 'RED_BASE_04',
        source_id: SRC, source_ref: 'Red.pdf p.1–2，條款 1–7',
        verification_status: 'per_spec_v1.0',
      }, PERIOD),
      Object.assign({
        // 基本回贈本身。Spec 只喺「超出高回贈額度合資格消費按基本 0.4%」提及，
        // 所以只登記同一個有效期；期外冇記錄 → Engine 唔推論（T23 / T29）。
        promotion_id: 'RED_BASE_04', card_id: 'HSBC_RED', name: '基本 0.4%',
        rate_inclusive: '0.004', includes_base: true,
        cap_unit: 'RC', cap_value: null, high_rate_spend_limit: null,
        cycle_type: 'calendar_month', cycle_date_basis: 'post_date', priority: 9,
        overflow_to: null,
        source_id: SRC, source_ref: 'Red.pdf p.1–2（超出相關高回贈額度合資格消費按基本 0.4%）',
        verification_status: 'per_spec_v1.0_scope_limited',
      }, PERIOD),
    ],

    // ===== MerchantRewardRules =====
    // match：normalize 後完全相同，或者以 alias + 空格 / 標點開頭（例如 "sushiro 晚餐"）。
    // 只用 Spec 列出嘅英文名稱；中文別名要 Amy 確認先加（避免自行推論）。
    // location_restriction：
    //   HK_STORE            香港店舖（唔包百貨公司專櫃、outlets）
    //   JP_DESIGNATED_STORE 日本指定門市（門市名單未提供 → 一律要逐筆核實）
    //   JP / KR / KR_STORE  海外地區
    // channel_restriction：not_via_ewallet = 交易經電子錢包唔算指定商戶交易
    merchants: [
      ...[
        'Sushiro', 'TamJai SamGor Mixian', 'TamJai Yunnan Mixian', 'Bakehouse',
        'Decathlon Hong Kong', 'NAMCO', 'TAITO STATION', 'Sephora',
        '@cosme STORE', '@cosme HONG KONG', '3COINS',
      ].map((name, i) => Object.assign({
        merchant_rule_id: 'MR_HK_' + String(i + 1).padStart(2, '0'),
        canonical_merchant: name,
        aliases: [name],
        location_restriction: 'HK_STORE',
        channel_restriction: 'not_via_ewallet',
        promotion_id: 'RED_DESIGNATED_8',
        confidence: 'per_spec_v1.0',
        source_id: SRC, source_ref: 'Red.pdf p.1',
      }, PERIOD)),
      Object.assign({
        merchant_rule_id: 'MR_JP_FAMILYMART', canonical_merchant: 'FamilyMart',
        aliases: ['FamilyMart'],
        location_restriction: 'JP_DESIGNATED_STORE', channel_restriction: 'not_via_ewallet',
        promotion_id: 'RED_DESIGNATED_8',
        confidence: 'needs_store_verification', // Spec 冇提供指定門市名單
        source_id: SRC, source_ref: 'Red.pdf p.1（FamilyMart 指定日本門市）',
      }, PERIOD),
      Object.assign({
        merchant_rule_id: 'MR_JP_SUICA', canonical_merchant: 'Suica',
        aliases: ['Suica'],
        location_restriction: 'JP', channel_restriction: 'not_via_ewallet',
        promotion_id: 'RED_DESIGNATED_8',
        confidence: 'per_spec_v1.0',
        source_id: SRC, source_ref: 'Red.pdf p.1（旅遊預付卡 Suica）',
      }, PERIOD),
      Object.assign({
        merchant_rule_id: 'MR_KR_TMONEY', canonical_merchant: 'Tmoney',
        aliases: ['Tmoney'],
        location_restriction: 'KR', channel_restriction: 'not_via_ewallet',
        promotion_id: 'RED_DESIGNATED_8',
        confidence: 'needs_verification', // Spec：須按商戶及交易形式再核實資格
        source_id: SRC, source_ref: 'Red.pdf p.1（Tmoney）',
      }, PERIOD),
      {
        merchant_rule_id: 'MR_KR_OLIVEYOUNG', canonical_merchant: 'OLIVE YOUNG',
        aliases: ['OLIVE YOUNG', 'OLIVEYOUNG'],
        location_restriction: 'KR_STORE', channel_restriction: 'not_via_ewallet',
        promotion_id: 'RED_DESIGNATED_8',
        // Spec：2026-07-15 起修訂。07-01 至 07-14 點處理未知 → 呢段期間標 uncertain。
        valid_from: '2026-07-15', valid_to: '2026-12-31',
        uncertain_before: '2026-07-15', uncertain_from: '2026-07-01',
        confidence: 'per_spec_v1.0',
        source_id: SRC, source_ref: 'Red.pdf p.1（OLIVE YOUNG 韓國門市，2026-07-15 起修訂）',
      },
      {
        merchant_rule_id: 'MR_KR_WOWPASS', canonical_merchant: 'WOWPASS',
        aliases: ['WOWPASS'],
        location_restriction: null, channel_restriction: null,
        promotion_id: null, // 已從名單刪除
        removed: true,
        // 刪除生效日未寫明 → 修訂生效日（2026-07-15）之前嘅交易標 uncertain，唔推論
        uncertain_before: '2026-07-15', uncertain_from: '2026-07-01',
        valid_from: null, valid_to: null,
        confidence: 'per_spec_v1.0',
        source_id: SRC, source_ref: 'Red.pdf p.1（WOWPASS 已從名單刪除）',
      },
      {
        merchant_rule_id: 'MR_APPLE_ICLOUD', canonical_merchant: 'Apple iCloud',
        aliases: ['iCloud subscription', 'icloud'],
        location_restriction: null, channel_restriction: null,
        promotion_id: 'RED_ONLINE_4', // 只係候選；網上資格未確認
        recurring: true,
        valid_from: null, valid_to: null,
        confidence: 'unverified',
        source_id: 'SRC_USER_NOTE', source_ref: 'Spec §4 第 4 點',
      },
    ],

    // ===== PromotionExclusions（Spec §2 第 5 點：非合資格網上交易，Red.pdf p.2）=====
    // 判斷依據係 overlay 嘅 transaction_nature / payment_method，唔睇 Tracker Category 或者 Source。
    // base_effect = unconfirmed：唔符合高回贈，唔代表一定有基本 0.4%。
    exclusions: [
      { exclusion_id: 'EX_BILL_PAYMENT', nature: 'bill_payment', applies_to: ['RED_ONLINE_4'], base_effect: 'unconfirmed', note: '網上繳費（包括 HSBC 網上理財 / 繳費服務）' },
      { exclusion_id: 'EX_INSURANCE', nature: 'insurance_premium', applies_to: ['RED_ONLINE_4'], base_effect: 'unconfirmed', note: '保費' },
      { exclusion_id: 'EX_SECURITIES', nature: 'securities', applies_to: ['RED_ONLINE_4'], base_effect: 'unconfirmed', note: '證券' },
      { exclusion_id: 'EX_RENT_MGMT', nature: 'rent_management_fee', applies_to: ['RED_ONLINE_4'], base_effect: 'unconfirmed', note: '租金 / 管理費' },
      { exclusion_id: 'EX_ADVERTISING', nature: 'advertising', applies_to: ['RED_ONLINE_4'], base_effect: 'unconfirmed', note: '廣告費' },
      { exclusion_id: 'EX_OCTOPUS', nature: 'octopus_topup', applies_to: ['RED_ONLINE_4'], base_effect: 'unconfirmed', note: '八達通自動增值及八達通充值' },
      { exclusion_id: 'EX_EWALLET_TOPUP', payment_method: 'ewallet_topup', applies_to: ['RED_ONLINE_4'], base_effect: 'unconfirmed', note: '信用卡於電子錢包的交易（充值）' },
      { exclusion_id: 'EX_EWALLET_PAYMENT', payment_method: 'ewallet_payment', applies_to: ['RED_ONLINE_4', 'RED_DESIGNATED_8'], base_effect: 'unconfirmed', note: '信用卡於電子錢包的交易；交易經電子錢包不算指定商戶交易' },
    ].map(x => Object.assign({ source_id: SRC, source_ref: 'Red.pdf p.1–2' }, x)),

    // ===== 付款方式（修正 1：分開識別，唔可以一律當電子錢包）=====
    // 只可以由 overlay 嘅 payment_method 提供，Engine 唔會讀 Tracker 嘅 Source。
    payment_methods: {
      physical_card:         { label: '實體卡 / 拍卡', ewallet: 'no' },
      online_card_entry:     { label: '網上輸入卡號', ewallet: 'no' },
      card_on_file_recurring:{ label: '自動訂閱扣款（例如 Apple 訂閱）', ewallet: 'no' },
      apple_pay_in_store:    { label: 'Apple Pay 實體店付款', ewallet: 'unverified', note: 'Apple Pay 是否屬 Red 條款所指「電子錢包」未經核實' },
      ewallet_payment:       { label: '經電子錢包用信用卡付款', ewallet: 'yes' },
      ewallet_topup:         { label: '電子錢包充值', ewallet: 'yes' },
    },

    // 網購證據：只接受 Mastercard / 收單機構分類（Spec §2 第 4 點）
    accepted_online_evidence: ['bank_statement', 'acquirer'],

    // 修正 8：只係 UI 風險提示，唔係銀行入帳規則，唔會改變計算
    ui_month_end_hint_days: 3,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
