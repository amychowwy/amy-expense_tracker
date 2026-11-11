/* Amy Reward Engine — 獨立計算引擎（第 1 階段，離線）
 *
 * - 純函數：冇 DOM、冇 fetch、冇 localStorage、唔改輸入資料。
 * - 只計「預計」回贈，唔代表銀行已確認派發。
 * - 金額用整數「仙」；回贈率用 bp（0.08 = 800）；回贈單位 micro-RC（1 RC = 1,000,000）。
 *   仙 × bp = micro-RC，全程整數，唔會逐筆四捨五入。
 * - 唔讀 Tracker 嘅 Source 同 Category 嚟判斷回贈資格。
 *
 * 用法：AmyRewards.engine.calculate({ trackerRows, transactionMap, rules })
 */
'use strict';
(function (g) {
  const NS = g.AmyRewards = g.AmyRewards || {};
  const ENGINE_VERSION = 'reward-engine-0.1';

  const D8 = 'RED_DESIGNATED_8';
  const O4 = 'RED_ONLINE_4';
  const B04 = 'RED_BASE_04';
  const ADVANCE_SUBS = ['Household Advance', 'Travel Advance'];
  const SPLIT_CATEGORY = 'Others';
  const SPLIT_SUB = 'Reimbursable';

  // 每個 flag 嘅嚴重程度：ui < info < conditional < uncertain < undeterminable
  const SEVERITY = { ui: 0, info: 1, conditional: 2, uncertain: 3, undeterminable: 4 };
  const FLAG_SEVERITY = {
    UI_MONTH_END_HINT: 'ui',                     // 修正 8：只係 UI 提示
    ADVANCE_PAYMENT: 'info',
    RECURRING: 'info',
    REFUND_APPLIED: 'info',
    AMOUNT_SIGN_ASSUMED: 'conditional',
    CURRENCY_UNCONFIRMED: 'conditional',         // 修正 2：冇幣別唔可以當確定 HKD
    POST_DATE_MISSING: 'conditional',
    PENDING_NOT_POSTED: 'conditional',
    SUSPECTED_SPLIT: 'conditional',
    POSSIBLE_DUPLICATE: 'conditional',
    BASE_GENERAL_ELIGIBILITY_ASSUMED: 'conditional', // 修正 4
    REFUND_POST_DATE_MISSING: 'conditional',
    CROSS_MONTH_REFUND: 'uncertain',             // 修正 3
    REFUND_EXCEEDS_ORIGINAL: 'uncertain',
    FX_NO_HKD_AMOUNT: 'undeterminable',
    AMOUNT_INVALID: 'undeterminable',
    DATE_INVALID: 'undeterminable',
    TERMS_MISSING: 'undeterminable',
  };

  // ===== 金額同日期工具 =====
  function parseCents(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(/\s+/g, '').replace(/,/g, '').replace(/HK\$/i, '');
    const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    const c = Number(m[2]) * 100 + Number((m[3] || '').padEnd(2, '0'));
    if (!Number.isSafeInteger(c)) return null;
    return m[1] ? -c : c;
  }
  function parseRateBp(s) {
    const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(s).trim());
    if (!m) throw new Error('回贈率格式錯誤（最多 4 位小數）：' + s);
    return Number(m[1]) * 10000 + Number((m[2] || '').padEnd(4, '0'));
  }
  function fixed(n, scale, digits) {
    const neg = n < 0; n = Math.abs(n);
    return (neg ? '-' : '') + Math.floor(n / scale) + '.' + String(n % scale).padStart(digits, '0');
  }
  const centsStr = c => fixed(c, 100, 2);          // "500.00"
  const microStr = u => fixed(u, 1000000, 6);      // "40.000000"
  // 只供顯示：四捨五入至 2 位（唔係銀行尾數規則）
  const microDisplay = u => centsStr((u < 0 ? -1 : 1) * Math.floor((Math.abs(u) + 5000) / 10000));
  function mulSafe(a, b) {
    const r = a * b;
    if (!Number.isSafeInteger(r)) throw new Error('金額超出安全整數範圍');
    return r;
  }

  function parseDate(v) {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(String(v || '').trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
    return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function parseTime(v) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v || '').trim());
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
  }
  function daysIn(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
  const monthOf = d => d.slice(0, 7);
  function nearMonthEnd(d, n) {
    const [y, mo, day] = d.split('-').map(Number);
    return day > daysIn(y, mo) - n;
  }
  const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
  const trim = v => String(v ?? '').trim();
  const normName = s => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

  // ===== 規則準備 =====
  function prepareRules(rules) {
    const promos = {};
    rules.promotions.forEach(p => {
      promos[p.promotion_id] = Object.assign({}, p, {
        rateBp: parseRateBp(p.rate_inclusive),
        limitCents: p.high_rate_spend_limit == null ? null : parseCents(p.high_rate_spend_limit),
        capMicro: p.cap_value == null ? null : mulSafe(parseCents(p.cap_value), 10000),
      });
    });
    [D8, O4, B04].forEach(id => { if (!promos[id]) throw new Error('缺少 promotion：' + id); });
    const src = rules.sources[0];
    return {
      raw: rules,
      promos,
      merchants: rules.merchants.map(r => Object.assign({}, r, { _aliases: r.aliases.map(normName) })),
      sourceVersion: `${src.source_id}@${src.document_effective_date}`,
    };
  }

  // ===== ① 候選篩選 =====
  function classifyRow(row, rules) {
    const acct = trim(row.Account), to = trim(row['To Account']);
    const type = trim(row.Type), sub = trim(row['Sub-category']);
    const isCard = rules.account_names.includes(acct);
    const toCard = rules.account_names.includes(to);
    if (type === 'Transfer' && (toCard || (isCard && sub === 'Credit Card Repayment'))) {
      return { kind: 'NOT_SPEND', reason: '信用卡還款，唔係簽帳，唔扣回贈額度' };
    }
    if (!isCard) return { kind: 'IGNORE' };
    if (type === 'Expense') return { kind: 'SPEND' };
    if (type === 'Transfer' && ADVANCE_SUBS.includes(sub)) return { kind: 'SPEND', advance: sub };
    if (type === 'Transfer' && sub === 'Credit Card Repayment') return { kind: 'NOT_SPEND', reason: '信用卡還款' };
    if (type === 'Refund' || type === 'Income') return { kind: 'REFUND' };
    return { kind: 'REVIEW', reason: `HSBC Red 嘅「${type || '（冇 Type）'}」記錄，未有對應規則，唔計入` };
  }

  // ===== ② 商戶配對 =====
  function matchMerchant(name, prep) {
    const n = normName(name);
    if (!n) return { status: 'none' };
    const hits = prep.merchants.filter(r => r._aliases.some(a =>
      n === a || (n.startsWith(a) && /[\s\-–—,.:;()|/（）]/.test(n.charAt(a.length)))));
    if (!hits.length) return { status: 'none' };
    if (hits.length > 1) return { status: 'conflict', rules: hits.map(h => h.merchant_rule_id) };
    return { status: 'match', rule: hits[0] };
  }

  // ===== ③ 建立付款 =====
  function buildPayments(rows, map, prep, out) {
    const rules = prep.raw;
    const info = rows.map((row, i) => ({
      row, rowId: row._row != null ? Number(row._row) : i + 2, cls: classifyRow(row, rules),
    }));
    const byId = new Map(info.map(x => [x.rowId, x]));
    info.forEach(x => {
      if (x.cls.kind === 'NOT_SPEND') out.not_spend.push({ row_id: x.rowId, reason: x.cls.reason });
      if (x.cls.kind === 'REVIEW') out.review.push({ row_id: x.rowId, code: 'UNHANDLED_ROW', reason: x.cls.reason });
      if (x.cls.kind === 'IGNORE') out.ignored_rows++;
    });

    const used = new Set();
    const payments = [];

    (map || []).forEach(m => {
      const ids = (m.source_row_ids || []).map(Number);
      const members = [];
      ids.forEach(id => {
        const x = byId.get(id);
        if (!x) { out.issues.push({ code: 'OVERLAY_ROW_MISSING', payment_id: m.payment_id, row_id: id }); return; }
        if (used.has(id)) { out.issues.push({ code: 'OVERLAY_ROW_REUSED', payment_id: m.payment_id, row_id: id }); return; }
        if (x.cls.kind !== 'SPEND' && x.cls.kind !== 'REFUND') {
          out.issues.push({ code: 'OVERLAY_ROW_NOT_CANDIDATE', payment_id: m.payment_id, row_id: id }); return;
        }
        members.push(x); used.add(id);
      });
      if (members.length) payments.push(makePayment(m.payment_id, members, m, prep));
    });

    info.forEach(x => {
      if (used.has(x.rowId) || (x.cls.kind !== 'SPEND' && x.cls.kind !== 'REFUND')) return;
      payments.push(makePayment('ROW-' + x.rowId, [x], null, prep));
    });

    markSplitsAndDuplicates(payments);
    return payments;
  }

  function makePayment(id, members, m, prep) {
    m = m || {};
    const first = members[0].row;
    const p = {
      payment_id: id,
      source_row_ids: members.map(x => x.rowId),
      kind: members.some(x => x.cls.kind === 'REFUND') ? 'refund' : 'spend',
      from_overlay: !!m.payment_id,
      txn_date: parseDate(m.transaction_date) || parseDate(first.Date),
      txn_time: parseTime(first.Time),
      post_date: m.post_date ? parseDate(m.post_date) : null,
      post_status: m.post_status || null,
      merchant_raw: m.merchant_raw || trim(first['Merchant / Note']),
      merchant_canonical: null,
      currency: m.original_currency || null,
      amount_cents: null,
      amount_basis: null,
      payment_method: m.payment_method || null,
      transaction_channel: m.transaction_channel || null,
      channel_evidence: m.channel_evidence || null,
      transaction_nature: m.transaction_nature || null,
      location: m.location || null,
      store_verified: m.store_verified === true,
      refund_of: m.refund_of || null,
      source_hint: trim(first.Source), // 只供顯示，唔參與判斷
      is_split_row: members.some(x => trim(x.row.Category) === SPLIT_CATEGORY && trim(x.row['Sub-category']) === SPLIT_SUB),
      flags: [], reasons: [], trace: [],
    };
    if (members.length > 1) p.trace.push(`合併 row ${p.source_row_ids.join(' + ')}（payment_id ${id}）`);
    const adv = members.find(x => x.cls.advance);
    if (adv) addFlag(p, 'ADVANCE_PAYMENT', `${adv.cls.advance} 由 HSBC Red 支付，當一筆候選簽帳`);
    if (m.post_date && !p.post_date) addFlag(p, 'DATE_INVALID', 'post_date 格式錯誤');

    // 金額（修正 2）
    const tracker = members.map(x => parseCents(x.row.Amount));
    if (m.original_amount_hkd != null && m.original_amount_hkd !== '') {
      const c = parseCents(m.original_amount_hkd);
      if (c == null) addFlag(p, 'AMOUNT_INVALID', 'original_amount_hkd 格式錯誤');
      else { p.amount_cents = Math.abs(c); p.amount_basis = 'bank_hkd'; }
    } else if (p.currency && p.currency !== 'HKD') {
      addFlag(p, 'FX_NO_HKD_AMOUNT', `${p.currency} 交易冇銀行 HKD 入帳金額，暫唔計算`);
    } else if (tracker.some(c => c == null)) {
      addFlag(p, 'AMOUNT_INVALID', 'Tracker Amount 格式無法讀取');
    } else {
      if (tracker.some(c => c < 0)) addFlag(p, 'AMOUNT_SIGN_ASSUMED', 'Tracker Amount 有負數，按絕對值處理');
      p.amount_cents = tracker.reduce((s, c) => s + Math.abs(c), 0);
      if (p.currency === 'HKD') p.amount_basis = 'tracker_declared_hkd';
      else {
        p.amount_basis = 'tracker_assumed_hkd';
        addFlag(p, 'CURRENCY_UNCONFIRMED', '未有幣別資料，暫按 Tracker 金額當 HKD');
      }
    }

    const match = matchMerchant(m.merchant_canonical || p.merchant_raw, prep);
    p.match = match.status === 'match'
      ? { status: 'match', merchant_rule_id: match.rule.merchant_rule_id }
      : match;
    p._rule = match.status === 'match' ? match.rule : null;
    if (p._rule) {
      p.merchant_canonical = p._rule.canonical_merchant;
      if (p._rule.recurring) addFlag(p, 'RECURRING', '定期扣款（recurring）');
    } else if (m.merchant_canonical) {
      p.merchant_canonical = m.merchant_canonical;
    }
    return p;
  }

  function markSplitsAndDuplicates(payments) {
    const plain = payments.filter(p => !p.from_overlay && p.kind === 'spend');
    plain.forEach(a => {
      if (!a.is_split_row) return;
      plain.forEach(b => {
        if (a === b || a.txn_date !== b.txn_date || a.txn_time !== b.txn_time) return;
        [a, b].forEach((p, i) => {
          const other = i ? a : b;
          if (!p.flags.some(f => f.code === 'SUSPECTED_SPLIT' && f.with === other.payment_id)) {
            addFlag(p, 'SUSPECTED_SPLIT', `疑似同 ${other.payment_id} 屬同一筆簽帳（冇 payment_id，唔合併）`, { with: other.payment_id });
          }
        });
      });
    });
    const key = p => [p.txn_date, p.txn_time, p.amount_cents, normName(p.merchant_raw)].join('|');
    const groups = new Map();
    plain.forEach(p => { const k = key(p); (groups.get(k) || groups.set(k, []).get(k)).push(p); });
    groups.forEach(list => {
      if (list.length < 2) return;
      list.forEach(p => addFlag(p, 'POSSIBLE_DUPLICATE',
        `同 ${list.filter(x => x !== p).map(x => x.payment_id).join('、')} 時間、金額、商戶相同；冇交易 ID，唔當重複刪除`));
    });
  }

  function addFlag(p, code, message, extra) {
    p.flags.push(Object.assign({ code, severity: FLAG_SEVERITY[code] || 'info', message }, extra || {}));
  }

  // ===== ④ 週期 =====
  function assignCycle(p, rules) {
    if (p.post_status === 'cancelled') return false;
    if (p.post_date) {
      p.cycle_date = p.post_date; p.cycle_basis = 'post_date';
    } else if (p.txn_date) {
      p.cycle_date = p.txn_date; p.cycle_basis = 'transaction_date';
      addFlag(p, 'POST_DATE_MISSING', '冇入帳日，暫按交易日歸入月份');
      if (nearMonthEnd(p.txn_date, rules.ui_month_end_hint_days)) {
        addFlag(p, 'UI_MONTH_END_HINT', `月尾最後 ${rules.ui_month_end_hint_days} 日交易，可能下個月先入帳（UI 提示，唔係銀行規則）`);
      }
    } else {
      addFlag(p, 'DATE_INVALID', '冇有效交易日或入帳日');
      p.cycle_date = null; p.cycle_basis = null;
    }
    if (p.post_status === 'pending') addFlag(p, 'PENDING_NOT_POSTED', '未入帳，只係預計值，唔可以當已確認');
    p.cycle_key = p.cycle_date ? monthOf(p.cycle_date) : null;
    return true;
  }

  // ===== ⑤ 退款 =====
  function applyRefunds(spends, refunds, out) {
    const byId = new Map(spends.map(p => [p.payment_id, p]));
    spends.forEach(p => { p.refunds = []; p.net_low = p.amount_cents; p.net_high = p.amount_cents; });
    refunds.forEach(r => {
      const orig = r.refund_of && byId.get(r.refund_of);
      if (!orig) {
        out.review.push({ payment_id: r.payment_id, code: 'REFUND_UNLINKED', reason: '退款冇連結原交易（refund_of），唔計入' });
        return;
      }
      if (r.amount_cents == null || orig.amount_cents == null) {
        out.review.push({ payment_id: r.payment_id, code: 'REFUND_AMOUNT_UNKNOWN', reason: '退款或者原交易金額未知' });
        return;
      }
      orig.refunds.push(r.payment_id);
      orig.net_low -= r.amount_cents;
      orig.trace.push(`退款 ${r.payment_id}：-${centsStr(r.amount_cents)} HKD（${r.cycle_key || '月份未知'}）`);
      addFlag(orig, 'REFUND_APPLIED', `已按退款 ${r.payment_id} 重新計算模擬淨額`);
      if (!r.post_date) addFlag(orig, 'REFUND_POST_DATE_MISSING', `退款 ${r.payment_id} 冇入帳日`);
      if (r.cycle_key !== orig.cycle_key) {
        addFlag(orig, 'CROSS_MONTH_REFUND',
          `跨月退款（原 ${orig.cycle_key}，退款 ${r.cycle_key}）：銀行實際扣回同額度恢復方式未確認`);
      } else {
        orig.net_high -= r.amount_cents;
      }
    });
    spends.forEach(p => {
      if (p.net_low < 0 || p.net_high < 0) {
        addFlag(p, 'REFUND_EXCEEDS_ORIGINAL', '退款總額大過原交易');
        p.net_low = Math.max(0, p.net_low); p.net_high = Math.max(0, p.net_high);
      }
    });
  }

  // ===== ⑥ 資格判斷：每項回傳 yes / no / maybe =====
  function periodStatus(promo, p) {
    const dates = [p.txn_date, p.post_date].filter(Boolean);
    if (!dates.length) return 'maybe';
    const hits = dates.map(d => inRange(d, promo.valid_from, promo.valid_to));
    if (hits.every(Boolean)) return 'yes';
    if (!hits.some(Boolean)) return 'no';
    return 'maybe'; // 交易日同入帳日一個喺期內一個喺期外：有效期以邊個日期為準未確認
  }
  function combine(parts) {
    if (parts.some(x => x.s === 'no')) return { status: 'no', reasons: parts.filter(x => x.s === 'no').map(x => x.r) };
    const maybe = parts.filter(x => x.s === 'maybe').map(x => x.r);
    return maybe.length ? { status: 'maybe', reasons: maybe } : { status: 'yes', reasons: [] };
  }
  function methodEwallet(p, rules) {
    if (!p.payment_method) return 'unknown';
    const pm = rules.payment_methods[p.payment_method];
    return pm ? pm.ewallet : 'unknown';
  }
  function matchedExclusions(p, rules, promoId) {
    return rules.exclusions.filter(x => (!promoId || x.applies_to.includes(promoId)) &&
      ((x.nature && x.nature === p.transaction_nature) || (x.payment_method && x.payment_method === p.payment_method)));
  }

  function evalDesignated(p, prep) {
    const rules = prep.raw;
    if (p.match.status === 'conflict') return { status: 'maybe', reasons: ['商戶名稱配中多條規則：' + p.match.rules.join('、')] };
    const r = p._rule;
    if (!r) return { status: 'no', reasons: ['唔係指定商戶名單內嘅商戶'] };
    const d = p.txn_date;
    if (r.uncertain_from && d && inRange(d, r.uncertain_from, prevDay(r.uncertain_before))) {
      return { status: 'maybe', reasons: [`${r.canonical_merchant}：${r.uncertain_from} 至 ${prevDay(r.uncertain_before)} 嘅資格未能由 Red 條款核實`] };
    }
    if (r.removed) return { status: 'no', reasons: [`${r.canonical_merchant} 已從指定商戶名單刪除`] };
    if (r.promotion_id !== D8) return { status: 'no', reasons: ['唔係指定商戶'] };
    const parts = [];
    if (d && !inRange(d, r.valid_from, r.valid_to)) parts.push({ s: 'no', r: `${r.canonical_merchant} 於 ${d} 唔喺指定商戶有效期內` });
    const ps = periodStatus(prep.promos[D8], p);
    if (ps === 'no') parts.push({ s: 'no', r: '唔喺 8% 推廣有效期內' });
    if (ps === 'maybe') parts.push({ s: 'maybe', r: '交易日 / 入帳日跨越推廣有效期，以邊個日期為準未確認' });
    if (r.confidence === 'needs_verification') parts.push({ s: 'maybe', r: `${r.canonical_merchant} 資格需按商戶及交易形式再核實` });
    if (r.confidence === 'unverified') parts.push({ s: 'maybe', r: '商戶規則未核實' });
    parts.push(locationCheck(r, p));
    if (r.channel_restriction === 'not_via_ewallet') {
      const ew = methodEwallet(p, rules);
      if (ew === 'yes') parts.push({ s: 'no', r: '交易經電子錢包，唔算指定商戶交易' });
      else if (ew === 'unverified') parts.push({ s: 'maybe', r: rules.payment_methods[p.payment_method].note });
      else if (ew === 'unknown') parts.push({ s: 'maybe', r: '付款方式未知，未能排除電子錢包交易' });
    }
    return combine(parts.filter(Boolean));
  }

  const LOCATION_LABEL = {
    HK_STORE: '只限香港店舖（唔包百貨公司專櫃 / outlets）', JP_DESIGNATED_STORE: '只限日本指定門市',
    JP: '只限日本', KR: '只限韓國', KR_STORE: '只限韓國門市',
  };
  function locationCheck(r, p) {
    const loc = p.location;
    const need = r.location_restriction;
    if (!need) return null;
    if (!loc) return { s: 'maybe', r: `冇地區 / 店舖資料，未能核實「${LOCATION_LABEL[need] || need}」` };
    if (need === 'HK_STORE') {
      if (loc === 'HK_STORE') return { s: 'yes' };
      if (loc === 'HK_DEPT_COUNTER' || loc === 'HK_OUTLET') return { s: 'no', r: '百貨公司專櫃 / outlets 唔包括喺內' };
      return { s: 'no', r: `只限香港店舖（交易地區：${loc}）` };
    }
    if (need === 'JP_DESIGNATED_STORE') {
      if (loc !== 'JP') return { s: 'no', r: `只限日本指定門市（交易地區：${loc}）` };
      return p.store_verified ? { s: 'yes' } : { s: 'maybe', r: '未核實係咪指定日本門市（Spec 冇提供門市名單）' };
    }
    const country = need.slice(0, 2); // JP / KR / KR_STORE
    return loc === country ? { s: 'yes' } : { s: 'no', r: `只限 ${country}（交易地區：${loc}）` };
  }

  function evalOnline(p, prep) {
    const rules = prep.raw;
    const parts = [];
    const ps = periodStatus(prep.promos[O4], p);
    if (ps === 'no') parts.push({ s: 'no', r: '唔喺 4% 推廣有效期內' });
    if (ps === 'maybe') parts.push({ s: 'maybe', r: '交易日 / 入帳日跨越推廣有效期，以邊個日期為準未確認' });
    matchedExclusions(p, rules, O4).forEach(x => parts.push({ s: 'no', r: `非合資格網上交易：${x.note}` }));
    const ch = p.transaction_channel, ev = p.channel_evidence;
    if (ch === 'offline') parts.push({ s: 'no', r: '非網上交易' });
    else if (ch === 'online') {
      if (!rules.accepted_online_evidence.includes(ev)) {
        parts.push({ s: 'maybe', r: ev === 'ai_guess' ? '渠道只係 AI 推測，唔當確定網購' : `網購證據（${ev || '冇'}）唔係 Mastercard / 收單機構分類` });
      }
    } else {
      parts.push({ s: 'maybe', r: p._rule && p._rule.promotion_id === O4 ? `${p._rule.canonical_merchant} 網上資格待確認` : '冇渠道資料' });
    }
    const ew = methodEwallet(p, rules);
    if (ew === 'unknown') parts.push({ s: 'maybe', r: '付款方式未知，未能排除電子錢包交易' });
    if (!p.transaction_nature) parts.push({ s: 'maybe', r: '交易性質未知，未能排除繳費 / 保費等非合資格類別' });
    return combine(parts);
  }

  // 修正 4：基本 0.4% 獨立判斷
  function evalBase(p, prep) {
    const rules = prep.raw;
    const ps = periodStatus(prep.promos[B04], p);
    if (ps === 'no') return { status: 'terms_missing', reasons: ['呢段日期冇登記嘅 Red 條款（唔推論基本回贈）'] };
    const reasons = [];
    let status = 'conditional';
    if (ps === 'maybe') { status = 'maybe'; reasons.push('交易日 / 入帳日跨越條款有效期'); }
    const ex = matchedExclusions(p, rules, null);
    if (ex.length) { status = 'maybe'; reasons.push('唔符合高回贈，基本 0.4% 資格亦未確認：' + ex.map(x => x.note).join('；')); }
    if (status === 'conditional') reasons.push('一般簽帳嘅基本 0.4% 資格未經 Red 專屬條款逐項核實');
    return { status, reasons };
  }
  function prevDay(d) {
    const [y, m, dd] = d.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, dd - 1));
    return t.toISOString().slice(0, 10);
  }

  // ===== ⑦ 分類（低 / 高情境）=====
  function classify(p, prep) {
    const dsg = evalDesignated(p, prep);
    const onl = evalOnline(p, prep);
    const base = evalBase(p, prep);
    p.evaluation = { designated: dsg, online: onl, base };

    const baseLow = base.status === 'conditional';
    const baseHigh = base.status === 'conditional' || base.status === 'maybe';
    let low, high;
    // 低情境：只有「yes」先用高回贈；8% 唔確定就唔會轉去 4%（保守）
    if (dsg.status === 'yes') low = { bucket: D8, overflowBase: true };
    else if (dsg.status === 'maybe') low = { bucket: baseLow ? B04 : null };
    else if (onl.status === 'yes') low = { bucket: O4, overflowBase: true };
    else low = { bucket: baseLow ? B04 : null };
    // 高情境：所有 maybe 都當符合
    if (dsg.status !== 'no') high = { bucket: D8, overflowBase: dsg.status === 'yes' || baseHigh };
    else if (onl.status !== 'no') high = { bucket: O4, overflowBase: onl.status === 'yes' || baseHigh };
    else high = { bucket: baseHigh ? B04 : null };
    p.low = low; p.high = high;

    if (low.bucket === B04 && base.status === 'conditional') {
      addFlag(p, 'BASE_GENERAL_ELIGIBILITY_ASSUMED', base.reasons[0]);
    }
    if (!low.bucket && !high.bucket && base.status === 'terms_missing') {
      addFlag(p, 'TERMS_MISSING', base.reasons[0] + '；8% / 4% 亦唔適用');
    }
    p.classification = low.bucket === high.bucket ? (low.bucket || 'NO_REWARD') : 'UNCERTAIN';
    p.classification_reason = [dsg, onl, base].flatMap(x => x.reasons).filter(Boolean);
  }

  const LEVEL_NAME = { 1: 'determined', 2: 'conditional', 3: 'uncertain', 4: 'undeterminable' };
  function finalizeCertainty(p) {
    let rank = 1; // ui / info 唔影響
    p.flags.forEach(f => { rank = Math.max(rank, SEVERITY[f.severity]); });
    if (rank < 4 && (p.low.bucket !== p.high.bucket || p.net_low !== p.net_high)) rank = Math.max(rank, 3);
    p.uncertainty = LEVEL_NAME[rank];
  }

  // ===== ⑧ 分配額度 =====
  function allocate(payments, prep, out) {
    const cycles = {};
    const ensure = k => cycles[k] || (cycles[k] = newCycle(k, prep));
    payments.forEach(p => { if (p.cycle_key) ensure(p.cycle_key).payment_ids.push(p.payment_id); });

    ['low', 'high'].forEach(sc => {
      Object.keys(cycles).forEach(k => {
        const used = { [D8]: 0, [O4]: 0 };
        const reward = { [D8]: 0, [O4]: 0, [B04]: 0 };
        const spend = { [D8]: 0, [O4]: 0, [B04]: 0 };
        const list = payments
          .filter(p => p.cycle_key === k && p.uncertainty !== 'undeterminable' && p[sc].bucket)
          .sort(orderCmp);
        list.forEach(p => {
          const amt = sc === 'low' ? p.net_low : p.net_high;
          const s = p[sc];
          const row = { hi: 0, hiMicro: 0, baseSpend: 0, baseMicro: 0 };
          if (s.bucket === B04) {
            row.baseSpend = amt;
            row.baseMicro = mulSafe(amt, prep.promos[B04].rateBp);
          } else {
            const promo = prep.promos[s.bucket];
            row.hi = Math.min(amt, Math.max(0, promo.limitCents - used[s.bucket]));
            used[s.bucket] += row.hi;
            row.hiMicro = mulSafe(row.hi, promo.rateBp);
            const over = amt - row.hi;
            if (over > 0 && s.overflowBase) { row.baseSpend = over; row.baseMicro = mulSafe(over, prep.promos[B04].rateBp); }
            else if (over > 0) p.trace.push(`${sc}：超出 ${s.bucket} 額度嘅 ${centsStr(over)} HKD，基本回贈資格未確認，唔計`);
          }
          const total = row.hiMicro + row.baseMicro;
          reward[s.bucket] += total;
          spend[s.bucket] += amt;
          p[sc].reward_micro = total;
          p[sc].high_rate_spend_cents = row.hi;
          out.ledger.push({
            payment_id: p.payment_id,
            promotion_id: s.bucket,
            cycle_key: k,
            scenario: sc,
            eligible_spend_hkd: centsStr(amt),
            high_rate_spend_hkd: centsStr(row.hi),
            estimated_reward_rc: microStr(total),
            base_reward_rc: microStr(row.baseMicro),
            uncertainty: p.uncertainty,
            calculation_version: ENGINE_VERSION,
            source_version: prep.sourceVersion,
          });
        });
        // Invariant：額度同上限
        [D8, O4].forEach(id => {
          const pr = prep.promos[id];
          const hiMicro = out.ledger.filter(l => l.cycle_key === k && l.scenario === sc && l.promotion_id === id)
            .reduce((s2, l) => s2 + mulSafe(parseCents(l.high_rate_spend_hkd), pr.rateBp), 0);
          if (used[id] > pr.limitCents || hiMicro > pr.capMicro) {
            throw new Error(`Invariant 失敗：${k} ${sc} ${id} 超出額度或上限`);
          }
        });
        const c = cycles[k];
        [D8, O4].forEach(id => {
          c.promotions[id][sc] = {
            high_rate_spend_used_hkd: centsStr(used[id]),
            eligible_spend_hkd: centsStr(spend[id]),
            reward_rc: microStr(reward[id]),
          };
        });
        c.promotions[B04][sc] = { eligible_spend_hkd: centsStr(spend[B04]), reward_rc: microStr(reward[B04]) };
        c._micro[sc] = reward[D8] + reward[O4] + reward[B04];
        c._used[sc] = used;
      });
    });

    Object.keys(cycles).forEach(k => finishCycle(cycles[k], payments, prep));
    return cycles;
  }

  function orderCmp(a, b) {
    return (a.cycle_date || '').localeCompare(b.cycle_date || '') ||
      (a.txn_date || '').localeCompare(b.txn_date || '') ||
      (a.txn_time || '').localeCompare(b.txn_time || '') ||
      Math.min(...a.source_row_ids) - Math.min(...b.source_row_ids) ||
      a.payment_id.localeCompare(b.payment_id);
  }

  function newCycle(k, prep) {
    return {
      cycle_key: k,
      payment_ids: [],
      promotions: { [D8]: {}, [O4]: {}, [B04]: {} },
      _micro: {}, _used: {},
    };
  }

  function finishCycle(c, payments, prep) {
    const mine = payments.filter(p => p.cycle_key === c.cycle_key);
    [D8, O4].forEach(id => {
      const pr = prep.promos[id];
      const usedHigh = c._used.high ? c._used.high[id] : 0;
      const usedLow = c._used.low ? c._used.low[id] : 0;
      const pending = mine.filter(p => p.uncertainty === 'undeterminable' && p.evaluation &&
        (p.evaluation.designated.status !== 'no' && id === D8 || p.evaluation.online.status !== 'no' && id === O4));
      Object.assign(c.promotions[id], {
        high_rate_spend_limit_hkd: centsStr(pr.limitCents),
        cap_rc: microStr(pr.capMicro),
        // Spec §4 第 8 點：保守剩餘額度 = 假設所有唔確定交易都用咗額度（高情境）
        remaining_spend_conservative_hkd: centsStr(pr.limitCents - usedHigh),
        remaining_spend_if_low_hkd: centsStr(pr.limitCents - usedLow),
        remaining_reward_conservative_rc: microStr(pr.capMicro - mulSafe(usedHigh, pr.rateBp)),
        remaining_may_be_lower: pending.map(p => p.payment_id),
      });
    });
    const by = lvl => mine.filter(p => p.uncertainty === lvl);
    const sumLow = list => list.reduce((s, p) => s + (p.low.reward_micro || 0), 0);
    const sumHigh = list => list.reduce((s, p) => s + (p.high.reward_micro || 0), 0);
    const low = c._micro.low || 0, high = c._micro.high || 0;
    c.totals = {
      low_rc: microStr(low), high_rc: microStr(high),
      potential_exposure_rc: microStr(high - low),
      low_display: microDisplay(low), high_display: microDisplay(high),
      display_note: '顯示值四捨五入至 2 位，只供參考；銀行實際尾數規則未確認，全部係估算',
    };
    // Spec §8：確定 / 條件估算 / 無法確認
    c.report = {
      determined: { count: by('determined').length, reward_rc: microStr(sumLow(by('determined'))) },
      conditional: {
        count: by('conditional').length + by('uncertain').length,
        reward_low_rc: microStr(sumLow(by('conditional')) + sumLow(by('uncertain'))),
        reward_high_rc: microStr(sumHigh(by('conditional')) + sumHigh(by('uncertain'))),
      },
      undeterminable: { count: by('undeterminable').length, payment_ids: by('undeterminable').map(p => p.payment_id) },
      note: '「確定」只代表按規則同現有資料計得出，唔代表銀行已確認派發',
    };
    delete c._micro; delete c._used;
  }

  // ===== 主函數 =====
  function calculate(input) {
    if (!input || !input.rules) throw new Error('缺少 rules');
    const prep = prepareRules(input.rules);
    const rows = JSON.parse(JSON.stringify(input.trackerRows || [])); // 唔改輸入
    const map = JSON.parse(JSON.stringify(input.transactionMap || []));
    const out = {
      engine_version: ENGINE_VERSION,
      rules_version: input.rules.rules_version,
      source_version: prep.sourceVersion,
      payments: [], ledger: [], cycles: {},
      not_spend: [], review: [], cancelled: [], issues: [], ignored_rows: 0,
    };

    const all = buildPayments(rows, map, prep, out);
    const live = all.filter(p => {
      const keep = assignCycle(p, prep.raw);
      if (!keep) out.cancelled.push({ payment_id: p.payment_id, reason: '已取消 / 退回，唔計' });
      return keep;
    });
    // 輸出次序固定（唔跟輸入次序），保證同一組資料結果完全相同
    const spends = live.filter(p => p.kind === 'spend').sort(orderCmp);
    const refunds = live.filter(p => p.kind === 'refund').sort(orderCmp);
    applyRefunds(spends, refunds, out);
    spends.forEach(p => { classify(p, prep); finalizeCertainty(p); });
    out.cycles = allocate(spends, prep, out);

    out.refunds = refunds.map(r => ({ payment_id: r.payment_id, refund_of: r.refund_of, amount_hkd: r.amount_cents == null ? null : centsStr(r.amount_cents), cycle_key: r.cycle_key }));
    out.payments = spends.map(publicPayment);
    out.ledger.sort((a, b) => a.cycle_key.localeCompare(b.cycle_key) || a.scenario.localeCompare(b.scenario));
    return out;
  }

  function publicPayment(p) {
    const sc = s => ({
      promotion_id: s.bucket,
      reward_rc: s.reward_micro == null ? null : microStr(s.reward_micro),
      high_rate_spend_hkd: s.high_rate_spend_cents == null ? null : centsStr(s.high_rate_spend_cents),
    });
    return {
      payment_id: p.payment_id, source_row_ids: p.source_row_ids,
      transaction_date: p.txn_date, transaction_time: p.txn_time, post_date: p.post_date, post_status: p.post_status,
      cycle_key: p.cycle_key, cycle_basis: p.cycle_basis,
      merchant_raw: p.merchant_raw, merchant_canonical: p.merchant_canonical, merchant_match: p.match,
      amount_hkd: p.amount_cents == null ? null : centsStr(p.amount_cents), amount_basis: p.amount_basis,
      net_amount_low_hkd: p.net_low == null ? null : centsStr(p.net_low),
      net_amount_high_hkd: p.net_high == null ? null : centsStr(p.net_high),
      currency: p.currency, payment_method: p.payment_method,
      transaction_channel: p.transaction_channel, channel_evidence: p.channel_evidence,
      transaction_nature: p.transaction_nature, location: p.location, source_hint: p.source_hint,
      refunds: p.refunds,
      classification: p.classification, classification_reason: p.classification_reason,
      evaluation: p.evaluation, low: sc(p.low), high: sc(p.high),
      uncertainty: p.uncertainty, flags: p.flags, trace: p.trace,
    };
  }

  NS.engine = {
    ENGINE_VERSION, calculate,
    _internal: { parseCents, parseRateBp, centsStr, microStr, microDisplay, parseDate, normName, matchMerchant, prepareRules, nearMonthEnd },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
