/* Amy Reward Engine — 簡單測試工具（唔用 framework）
 * 結果分四類：passed / failed / blocked / not_yet_testable。
 * blocked 同 not_yet_testable 永遠唔會當 passed。 */
'use strict';
(function (g) {
  const NS = g.AmyRewards = g.AmyRewards || {};
  const suites = { spec: [], extra: [] };

  function define(suite, id, title, expected, fn) {
    suites[suite].push({ id, title, expected, fn });
  }

  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function makeCtx() {
    const ctx = {
      checks: [], forced: null, lastResult: null,
      check(label, actual, expected) {
        const ok = same(actual, expected);
        ctx.checks.push({ label, ok, actual, expected });
        return ok;
      },
      truthy(label, value) {
        const ok = !!value;
        ctx.checks.push({ label, ok, actual: value, expected: true });
        return ok;
      },
      blocked(reason) { ctx.forced = { status: 'blocked', reason }; },
      notYetTestable(reason) { ctx.forced = { status: 'not_yet_testable', reason }; },
      calc(input) {
        const r = NS.engine.calculate(Object.assign({ rules: NS.rules.HSBC_RED }, input));
        ctx.lastResult = r;
        return r;
      },
    };
    return ctx;
  }

  function runOne(t) {
    const ctx = makeCtx();
    let error = null;
    try { t.fn(ctx); } catch (e) { error = (e && e.stack) || String(e); }
    const failedChecks = ctx.checks.filter(c => !c.ok);
    let status;
    let reason = '';
    if (error) { status = 'failed'; reason = '執行錯誤：' + error.split('\n')[0]; }
    else if (failedChecks.length) { status = 'failed'; reason = failedChecks.map(c => c.label).join('；'); }
    else if (ctx.forced) { status = ctx.forced.status; reason = ctx.forced.reason; }
    else if (!ctx.checks.length) { status = 'failed'; reason = '冇任何斷言'; }
    else status = 'passed';
    return {
      id: t.id, title: t.title, expected: t.expected, status, reason,
      checks: ctx.checks, error, report: summarize(ctx.lastResult),
    };
  }

  // 差異報告：確定 / 條件估算 / 無法確認（Spec §8）
  function summarize(r) {
    if (!r) return null;
    return Object.keys(r.cycles).sort().map(k => {
      const c = r.cycles[k];
      return {
        cycle: k,
        determined_rc: c.report.determined.reward_rc,
        conditional_low_rc: c.report.conditional.reward_low_rc,
        conditional_high_rc: c.report.conditional.reward_high_rc,
        undeterminable: c.report.undeterminable.count,
        total_low_rc: c.totals.low_rc,
        total_high_rc: c.totals.high_rc,
      };
    });
  }

  function runAll() {
    const out = {};
    Object.keys(suites).forEach(s => { out[s] = suites[s].map(runOne); });
    out.counts = {};
    Object.keys(suites).forEach(s => {
      const c = { passed: 0, failed: 0, blocked: 0, not_yet_testable: 0 };
      out[s].forEach(r => { c[r.status]++; });
      out.counts[s] = c;
    });
    return out;
  }

  NS.test = { define, runAll, suites };
})(typeof globalThis !== 'undefined' ? globalThis : this);
