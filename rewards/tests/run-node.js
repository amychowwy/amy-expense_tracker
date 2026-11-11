/* 用 Node 跑測試（可選；瀏覽器開 test.html 效果一樣）：
 *   node rewards/tests/run-node.js
 * 冇 npm 依賴。有 failed 就 exit code 1；blocked / not_yet_testable 唔會當通過。 */
'use strict';
const path = require('path');
const base = path.join(__dirname, '..');
[
  'rules/hsbc-red.js', 'reward-engine.js', 'mock/mock-data.js',
  'tests/test-runner.js', 'tests/fixtures.js', 'tests/spec-cases.js', 'tests/extra-cases.js',
].forEach(f => require(path.join(base, f)));

const NS = globalThis.AmyRewards;
const res = NS.test.runAll();
const LABEL = { passed: 'PASSED', failed: 'FAILED', blocked: 'BLOCKED', not_yet_testable: 'NOT YET TESTABLE' };

['spec', 'extra'].forEach(s => {
  console.log(`\n=== ${s === 'spec' ? 'Spec 驗收 T01–T30' : '額外邊界測試'} ===`);
  res[s].forEach(r => {
    console.log(`${r.id.padEnd(4)} ${LABEL[r.status].padEnd(16)} ${r.title}`);
    if (r.status !== 'passed') {
      console.log(`     原因：${r.reason}`);
      r.checks.filter(c => !c.ok).forEach(c =>
        console.log(`     ✗ ${c.label}：實際 ${JSON.stringify(c.actual)}，預期 ${JSON.stringify(c.expected)}`));
    }
  });
  const c = res.counts[s];
  console.log(`--- Passed ${c.passed}｜Failed ${c.failed}｜Blocked ${c.blocked}｜Not Yet Testable ${c.not_yet_testable}`);
});

const failed = res.counts.spec.failed + res.counts.extra.failed;
process.exitCode = failed ? 1 : 0;
