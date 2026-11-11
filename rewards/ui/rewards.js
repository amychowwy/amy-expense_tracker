/* HSBC Red 回贈頁面（第 2 階段：只用模擬資料）
 * - 冇 fetch、冇 localStorage，唔讀 amyb.url / amyb.key。
 * - ?demo / ?demo=amy：Amy 身份睇虛構數據；?demo=lai：冇權限畫面；冇 ?demo：說明畫面。
 * - 所有數字都係「預計」，唔代表銀行已確認派發。 */
'use strict';
(() => {
  const NS = window.AmyRewards;
  const D8 = 'RED_DESIGNATED_8', O4 = 'RED_ONLINE_4', B04 = 'RED_BASE_04';
  const HK_TZ = 'Asia/Hong_Kong';

  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo') ? (params.get('demo') || 'amy') : null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ===== 格式（全部用字串計，唔經浮點數）=====
  function withCommas(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  // "1180.00" → "HK$1,180.00"
  function hkd(s) {
    if (s == null) return '—';
    const neg = s.startsWith('-');
    const [i, d = '00'] = (neg ? s.slice(1) : s).split('.');
    return (neg ? '-' : '') + 'HK$' + withCommas(i) + '.' + d.padEnd(2, '0').slice(0, 2);
  }
  // "40.000000"（micro-RC）→ "40.00"，四捨五入只供顯示
  function rc(s) {
    if (s == null) return '—';
    const neg = s.startsWith('-');
    const [i, d = ''] = (neg ? s.slice(1) : s).split('.');
    const micro = Number(i) * 1e6 + Number(d.padEnd(6, '0').slice(0, 6));
    const cents = Math.floor((micro + 5000) / 10000);
    return (neg && cents ? '-' : '') + withCommas(String(Math.floor(cents / 100))) + '.' + String(cents % 100).padStart(2, '0');
  }
  // 字串 → 整數（HKD 或 RC 嘅 1e-6 單位），只用嚟比較同計差額
  function micro(s) {
    if (s == null) return 0;
    const neg = s.startsWith('-');
    const [i, d = ''] = (neg ? s.slice(1) : s).split('.');
    const v = Number(i) * 1e6 + Number(d.padEnd(6, '0').slice(0, 6));
    return neg ? -v : v;
  }
  const hkdMicro = u => hkd((u < 0 ? '-' : '') + Math.floor(Math.abs(u) / 1e6) + '.' + String(Math.round((Math.abs(u) % 1e6) / 1e4)).padStart(2, '0'));
  const dm = d => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}` : '—');

  function currentMonth() {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: HK_TZ, year: 'numeric', month: '2-digit' })
      .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return `${p.year}-${p.month}`;
  }

  const PROMO_LABEL = { [D8]: '指定商戶 8%', [O4]: '網上 4%', [B04]: '基本 0.4%' };
  const CERT_LABEL = { determined: '確定', conditional: '條件估算', uncertain: '未確定', undeterminable: '無法確認' };
  const STATUS_LABEL = { yes: '符合', no: '唔符合', maybe: '未確定', conditional: '假設符合', terms_missing: '冇條款' };
  const METHOD_LABEL = Object.fromEntries(Object.entries(NS.rules.HSBC_RED.payment_methods).map(([k, v]) => [k, v.label]));
  const promoLabel = id => PROMO_LABEL[id] || '冇回贈';
  const chip = (text, cls) => `<span class="rw-chip ${cls || ''}">${esc(text)}</span>`;

  // ===== 狀態 =====
  const state = { result: null, rows: [], months: [], month: null, filter: 'all' };

  // ===== 畫面 =====
  function render() {
    const r = state.result;
    const c = r.cycles[state.month];
    const idx = state.months.indexOf(state.month);
    $('rwMonth').hidden = false;
    $('rwMonthLabel').textContent = state.month;
    $('rwPrev').disabled = idx <= 0;
    $('rwNext').disabled = idx >= state.months.length - 1;

    const pays = r.payments.filter(p => p.cycle_key === state.month);
    let html = banner();
    if (!c) {
      html += '<div class="card empty">呢個月冇 HSBC Red 交易</div>';
    } else {
      html += hero(c);
      html += `<div class="sec"><h2>回贈額度</h2><small>按入帳日・曆月</small></div>`;
      html += quota(c, D8, pays) + quota(c, O4, pays) + baseCard(c);
      html += transactions(pays);
    }
    html += excluded();
    html += legend() + footer();
    $('rwContent').innerHTML = html;
  }

  function banner() {
    return `<div class="rw-banner"><b>模擬資料・全部虛構</b>只係預計回贈，唔代表銀行已確認派發。</div>`;
  }

  function hero(c) {
    const lo = c.totals.low_rc, hi = c.totals.high_rc;
    const rp = c.report;
    return `<section class="card hero">
      <div class="hero-label">${state.month === currentMonth() ? '本月' : esc(state.month)} 預計回贈（保守）</div>
      <div class="hero-value">${rc(lo)}<span class="rw-unit">RC</span></div>
      ${micro(hi) > micro(lo) ? `<div class="rw-max">如果未確定嘅交易全部符合，最多 ${rc(hi)} RC</div>` : ''}
      <div class="rw-levels">
        <div><span>確定</span><b>${rc(rp.determined.reward_rc)}</b><small>${rp.determined.count} 筆</small></div>
        <div><span>條件估算</span><b>${rc(rp.conditional.reward_low_rc)}</b><small>${rp.conditional.count} 筆</small></div>
        <div><span>無法確認</span><b>${rp.undeterminable.count} 筆</b><small>未計入</small></div>
      </div>
    </section>`;
  }

  function quota(c, id, pays) {
    const q = c.promotions[id];
    const limit = micro(q.high_rate_spend_limit_hkd);
    const used = limit - micro(q.remaining_spend_conservative_hkd);
    const pct = limit > 0 ? Math.min(100, used / limit * 100) : 0;
    const full = used >= limit;
    const lowUsed = micro(q.low.high_rate_spend_used_hkd);
    const notes = [];
    if (used > lowUsed) {
      notes.push(`<div class="rw-q-note warn">已包括未確定交易用咗嘅 ${hkdMicro(used - lowUsed)}；如果佢哋唔符合，剩餘額度係 ${hkd(q.remaining_spend_if_low_hkd)}</div>`);
    }
    if (q.remaining_may_be_lower.length) {
      notes.push(`<div class="rw-q-note warn">另有 ${q.remaining_may_be_lower.length} 筆交易冇 HKD 金額，剩餘額度可能更少</div>`);
    }
    return `<div class="card rw-quota ${full ? 'rw-full' : 'lv-ok'}">
      <div class="rw-q-head"><span class="rw-q-name">${esc(promoLabel(id))}</span>
        <span class="rw-q-rc">${rc(q.low.reward_rc)} RC</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="rw-q-nums">
        <div><span>高回贈簽帳已用（保守）</span><b>${hkdMicro(used)}</b></div>
        <div><span>剩餘（保守）</span><b>${full ? '已用完' : hkd(q.remaining_spend_conservative_hkd)}</b><span>${rc(q.remaining_reward_conservative_rc)} RC</span></div>
      </div>
      ${notes.join('')}
      <div class="rw-q-note">每曆月首 ${hkd(q.high_rate_spend_limit_hkd)}、上限 ${rc(q.cap_rc)} RC；超出部分按基本 0.4% 估算</div>
    </div>`;
  }

  function baseCard(c) {
    const b = c.promotions[B04];
    return `<div class="card list"><div class="row"><div class="name">基本 0.4%<small>唔屬 8% / 4% 嘅交易（簽帳 ${hkd(b.low.eligible_spend_hkd)}）</small></div>
      <span class="amt">${rc(b.low.reward_rc)} RC</span></div></div>`;
  }

  // ----- 交易 -----
  const needsAttention = p => p.uncertainty !== 'determined';

  function transactions(pays) {
    const attention = pays.filter(needsAttention);
    const list = state.filter === 'attention' ? attention : pays;
    const seg = `<div class="seg rw-seg" role="tablist">
      <button type="button" role="tab" data-filter="all" aria-selected="${state.filter === 'all'}">全部 ${pays.length}</button>
      <button type="button" role="tab" data-filter="attention" aria-selected="${state.filter === 'attention'}">需要留意 ${attention.length}</button>
    </div>`;
    const body = list.length
      ? `<div class="card list">${list.map(txn).join('')}</div>`
      : '<div class="card empty">冇需要留意嘅交易</div>';
    return `<div class="sec"><h2>交易</h2><small>撳交易睇原因</small></div>${seg}${body}`;
  }

  function txn(p) {
    const lo = p.low.reward_rc, hi = p.high.reward_rc;
    const showMax = p.uncertainty === 'uncertain' && micro(hi) > micro(lo);
    const rewardText = p.uncertainty === 'undeterminable' ? '—' : `${rc(lo || '0')} RC`;
    // 類別唔確定時，只顯示確定程度標籤，避免重複
    const promo = p.classification === 'UNCERTAIN' ? '' : chip(promoLabel(p.low.promotion_id));
    return `<details class="rw-txn">
      <summary>
        <div class="rw-t-main">
          <div class="rw-t-name">${esc(p.merchant_canonical || p.merchant_raw || '（冇商戶名）')}</div>
          <div class="rw-t-sub">${dm(p.transaction_date)}・${hkd(p.amount_hkd)} ${promo} ${chip(CERT_LABEL[p.uncertainty], 'rw-c-' + p.uncertainty)}</div>
        </div>
        <div class="rw-t-right"><div class="rw-t-rc">${rewardText}</div>${showMax ? `<div class="rw-t-max">最多 ${rc(hi)}</div>` : ''}</div>
      </summary>
      <div class="rw-t-body">${txnDetail(p)}</div>
    </details>`;
  }

  function txnDetail(p) {
    const ev = p.evaluation || {};
    const evalRow = (name, e) => e ? `<li><b class="rw-st-${e.status}">${esc(name)}：${esc(STATUS_LABEL[e.status] || e.status)}</b>${
      e.reasons.length ? '<ul>' + e.reasons.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : ''}</li>` : '';
    // 標記入面去走資格判斷已經寫過嘅句子
    const shown = new Set(['designated', 'online', 'base'].flatMap(k => (ev[k] ? ev[k].reasons : [])));
    const flags = p.flags.filter(f => !shown.has(f.message));
    const scen = p.classification === 'UNCERTAIN'
      ? `<li>保守：${esc(promoLabel(p.low.promotion_id))}（${rc(p.low.reward_rc || '0')} RC）</li><li>最多：${esc(promoLabel(p.high.promotion_id))}（${rc(p.high.reward_rc || '0')} RC）</li>`
      : '';
    return `
      <h4>資料</h4>
      <div class="rw-kv">
        <span>交易日</span><b>${esc(p.transaction_date || '—')} ${esc(p.transaction_time || '')}</b>
        <span>入帳日</span><b>${esc(p.post_date || '未有')}${p.post_status === 'pending' ? '（未入帳）' : ''}</b>
        <span>歸入月份</span><b>${esc(p.cycle_key)}（${p.cycle_basis === 'post_date' ? '按入帳日' : '按交易日暫估'}）</b>
        <span>金額</span><b>${hkd(p.amount_hkd)}${p.net_amount_low_hkd !== p.amount_hkd && p.net_amount_low_hkd != null ? `・退款後 ${hkd(p.net_amount_low_hkd)}` : ''}</b>
        <span>付款方式</span><b>${esc(METHOD_LABEL[p.payment_method] || '未知')}</b>
        <span>Tracker 行</span><b>${esc(p.source_row_ids.join('、'))}${p.source_hint ? `・Source：${esc(p.source_hint)}（只供參考）` : ''}</b>
      </div>
      ${scen ? `<h4>情境</h4><ul>${scen}</ul>` : ''}
      <h4>資格判斷</h4>
      <ul>${evalRow('指定商戶 8%', ev.designated)}${evalRow('網上 4%', ev.online)}${evalRow('基本 0.4%', ev.base)}</ul>
      ${flags.length ? `<h4>標記</h4><ul>${flags.map(f => `<li>${esc(f.message)}</li>`).join('')}</ul>` : ''}
      ${p.trace.length ? `<h4>追溯</h4><ul>${p.trace.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
  }

  // ----- 唔計入回贈嘅記錄 -----
  function rowInfo(id) {
    const r = state.rows.find(x => Number(x._row) === Number(id));
    return r ? { date: String(r.Date || ''), name: r['Merchant / Note'] || '', amount: r.Amount } : { date: '', name: '', amount: '' };
  }
  function excluded() {
    const r = state.result;
    const inMonth = d => d && d.replace(/\//g, '-').startsWith(state.month);
    const items = [];
    r.not_spend.forEach(x => { const i = rowInfo(x.row_id); if (inMonth(i.date)) items.push([i, '還款', x.reason]); });
    r.review.forEach(x => { const i = rowInfo(x.row_id || (x.payment_id || '').replace('ROW-', '')); if (inMonth(i.date)) items.push([i, '待處理', x.reason]); });
    r.refunds.filter(x => x.cycle_key === state.month).forEach(x => {
      const orig = r.payments.find(p => p.payment_id === x.refund_of);
      items.push([{ date: '', name: `退款 ${hkd(x.amount_hkd)}`, amount: '' }, '退款',
        orig ? `已計入原交易（${orig.merchant_canonical || orig.merchant_raw}，${orig.cycle_key}）` : '冇連結原交易']);
    });
    r.cancelled.forEach(x => items.push([{ date: '', name: x.payment_id, amount: '' }, '已取消', x.reason]));
    if (!items.length) return '';
    return `<div class="sec"><h2>唔計入回贈</h2><small>${items.length} 項</small></div>
      <div class="card list">${items.map(([i, tag, why]) => `<div class="row"><div class="name">${esc(i.name)}<small>${esc(why)}</small></div>${chip(tag)}</div>`).join('')}</div>`;
  }

  function legend() {
    return `<div class="sec"><h2>說明</h2></div><div class="card rw-legend">
      <div>${chip('確定', 'rw-c-determined')} 按規則同現有資料計得出，<b>唔等於銀行已確認</b></div>
      <div>${chip('條件估算', 'rw-c-conditional')} 要靠假設，例如冇入帳日、未入帳、冇幣別</div>
      <div>${chip('未確定', 'rw-c-uncertain')} 資格未能核實，以「保守 / 最多」範圍顯示</div>
      <div>${chip('無法確認', 'rw-c-undeterminable')} 缺少金額或條款，唔計入總數</div>
      <div>「保守剩餘額度」假設所有未確定交易都用咗額度。</div>
    </div>`;
  }

  function footer() {
    const r = state.result, src = NS.rules.HSBC_RED.sources[0];
    return `<div class="rw-foot">
      <div>規則 ${esc(r.rules_version)}・${esc(r.engine_version)}・來源 ${esc(src.document_name)}</div>
      <div>條款狀態：按 Spec 摘錄，未獨立核實銀行原文</div>
      <div>顯示值四捨五入至 2 位，只供參考；銀行實際尾數規則未確認</div>
    </div>`;
  }

  // ===== 特別畫面 =====
  function screen(title, msg, link) {
    $('rwMonth').hidden = true;
    $('rwContent').innerHTML = `<div class="card err"><b>${esc(title)}</b><p>${esc(msg)}</p>${link || ''}</div>`;
  }

  // ===== 事件 =====
  function bindEvents() {
    $('rwPrev').addEventListener('click', () => go(-1));
    $('rwNext').addEventListener('click', () => go(1));
    document.addEventListener('click', e => {
      const f = e.target.closest('[data-filter]');
      if (f) { state.filter = f.dataset.filter; render(); }
    });
  }
  function go(delta) {
    const i = state.months.indexOf(state.month) + delta;
    if (i < 0 || i >= state.months.length) return;
    state.month = state.months[i];
    window.scrollTo(0, 0);
    render();
  }

  // ===== 開始 =====
  function boot() {
    $('rwBack').href = DEMO ? `./?demo${DEMO === 'lai' ? '=lai' : ''}` : './';
    if (!DEMO) {
      screen('未開放', '呢個頁面暫時只提供模擬資料，未連接你嘅真實交易。',
        '<a class="btn primary rw-demo-btn" href="?demo">睇模擬資料</a>');
      return;
    }
    document.title = 'HSBC Red 回贈（demo）';
    const data = NS.mock.loadMockRewardData(DEMO === 'lai' ? 'lai' : 'amy');
    if (!data.ok) { screen('冇權限', data.message); return; }
    try {
      state.rows = data.trackerRows;
      state.result = NS.engine.calculate({ trackerRows: data.trackerRows, transactionMap: data.transactionMap, rules: NS.rules.HSBC_RED });
    } catch (e) {
      screen('計算失敗', (e && e.message) || String(e));
      return;
    }
    const cur = currentMonth();
    state.months = Object.keys(state.result.cycles).filter(k => k <= cur).sort();
    if (!state.months.length) { screen('冇資料', '模擬資料入面冇任何月份。'); return; }
    state.month = state.months.includes(cur) ? cur : state.months[state.months.length - 1];
    bindEvents();
    render();
  }

  boot();
})();
