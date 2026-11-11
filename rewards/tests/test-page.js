/* test.html 嘅畫面（CSP 唔准 inline script，所以獨立一個檔） */
'use strict';
(function () {
  const NS = window.AmyRewards;
  const LABEL = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked', not_yet_testable: 'Not Yet Testable' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const j = v => esc(JSON.stringify(v));

  function counts(c) {
    return `<div class="counts">${Object.keys(LABEL).map(k => `<span class="pill ${k}">${LABEL[k]} ${c[k]}</span>`).join('')}</div>`;
  }

  function caseHTML(r) {
    const checks = r.checks.map(c => `<tr><td class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✗'}</td><td>${esc(c.label)}</td><td>${j(c.actual)}</td><td>${c.ok ? '' : j(c.expected)}</td></tr>`).join('');
    const report = (r.report || []).map(x => `<tr><td>${esc(x.cycle)}</td><td>${esc(x.determined_rc)}</td><td>${esc(x.conditional_low_rc)} – ${esc(x.conditional_high_rc)}</td><td>${x.undeterminable}</td><td>${esc(x.total_low_rc)} – ${esc(x.total_high_rc)}</td></tr>`).join('');
    return `<details class="case"${r.status === 'passed' ? '' : ' open'}>
      <summary><span class="id">${esc(r.id)}</span><span class="pill ${r.status}">${LABEL[r.status]}</span><span>${esc(r.title)}</span></summary>
      <p class="exp">預期：${esc(r.expected)}</p>
      ${r.reason ? `<p class="why">原因：${esc(r.reason)}</p>` : ''}
      <div class="scroll"><table><tr><th></th><th>斷言</th><th>實際</th><th>預期（失敗時）</th></tr>${checks}</table></div>
      ${report ? `<div class="scroll"><table><tr><th>週期</th><th>確定 RC</th><th>條件估算 RC（低 – 高）</th><th>無法確認（筆）</th><th>總數 RC（低 – 高）</th></tr>${report}</table></div>` : ''}
    </details>`;
  }

  const res = NS.test.runAll();
  document.getElementById('out').innerHTML =
    `<h2>Spec 驗收 T01–T30</h2>${counts(res.counts.spec)}${res.spec.map(caseHTML).join('')}` +
    `<h2>額外邊界測試</h2>${counts(res.counts.extra)}${res.extra.map(caseHTML).join('')}`;
  document.title = `${res.counts.spec.failed + res.counts.extra.failed ? '✗' : '✓'} Reward Engine 測試`;
})();
