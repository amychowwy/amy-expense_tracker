# HSBC Red Reward Engine（第 1 階段）

狀態：**第 2 階段：離線計算引擎 + 自動測試 + 模擬資料頁面**。未連接任何 Google Sheets / Apps Script、未部署、未加入 Dashboard 入口。
規格：[`HSBC_Red_Reward_Engine_Spec_v1.0.md`](HSBC_Red_Reward_Engine_Spec_v1.0.md)。

> Engine 只計**預計**回贈，唔代表銀行已確認派發。T01–T30 係 Spec 行為驗收，通過唔代表所有銀行條款已獨立核實。

## 檔案

| 檔案 | 用途 |
|---|---|
| `rewards/reward-engine.js` | 計算引擎（純函數：冇 DOM、fetch、localStorage，唔改輸入） |
| `rewards/rules/hsbc-red.js` | HSBC Red 規則：CardPromotions、PromotionSources、MerchantRewardRules、PromotionExclusions、付款方式 |
| `rewards/mock/mock-data.js` | 虛構 Tracker 交易 + 虛構 RewardTransactionMap；`loadMockRewardData(role)` 只准 Amy |
| `rewards/tests/test-runner.js` | 簡單測試工具：Passed / Failed / Blocked / Not Yet Testable |
| `rewards/tests/fixtures.js` | 測試用虛構資料工具 |
| `rewards/tests/spec-cases.js` | T01–T30 |
| `rewards/tests/extra-cases.js` | X01–X22 邊界測試（覆蓋設計審核 8 項修正） |
| `rewards/tests/test.html` + `test-page.js` | 瀏覽器測試頁 |
| `rewards/tests/run-node.js` | Node 測試（可選） |

| `rewards.html` | 第 2 階段獨立頁面（只有模擬資料） |
| `rewards/ui/rewards.js` | 頁面邏輯：冇 fetch、冇 localStorage，唔讀 `amyb.url` / `amyb.key` |
| `rewards/ui/rewards.css` | 頁面樣式，只用 `.rw-` 開頭，顏色用 `style.css` 已有 token |

原有 `index.html`、`app.js`、`style.css`、`manifest.json` 冇改，亦冇引用以上任何檔案。`rewards.html` 只係只讀引用 `style.css`。

## 頁面（第 2 階段）

| 網址 | 睇乜 |
|---|---|
| `rewards.html?demo` | Amy 身份，虛構數據；預設顯示本月（香港時間），可以切換有資料嘅月份 |
| `rewards.html?demo=lai` | 冇權限畫面，唔會計算或者顯示任何 Amy 資料 |
| `rewards.html` | 「未開放」畫面（未有真實模式） |

內容：
- 本月預計回贈（保守）同「最多可能」。
- 確定 / 條件估算 / 無法確認。
- 8% / 4% 額度：保守已用、剩餘簽帳同 RC，並註明未確定交易佔用咗幾多。
- 基本 0.4%。
- 交易列表：全部 / 需要留意；撳入去睇資格判斷、情境、標記、追溯。
- 唔計入回贈嘅記錄（還款、退款、待處理）。
- 說明。

CSP 設 `connect-src 'none'`，頁面連唔到任何網絡。Dashboard 未有入口，要直接輸入網址先開到（第 6 階段先加）。

注意：額度按次序分配，所以單筆交易嘅高情境回贈有機會低過低情境（排喺前面嘅未確定交易用咗額度）。頁面只會喺「未確定」而高情境較高時先顯示「最多」，每月總數就一定係高 ≥ 低。

## 點樣跑測試

瀏覽器（唔使 Node）：

```bash
python -m http.server 8080
```

然後開 <http://localhost:8080/rewards/tests/test.html>。

Node（如果有裝）：

```bash
node rewards/tests/run-node.js
```

有 Failed 就 exit code 1。Blocked / Not Yet Testable 唔會當通過。

## 輸入

```js
AmyRewards.engine.calculate({ trackerRows, transactionMap, rules: AmyRewards.rules.HSBC_RED })
```

- `trackerRows`：Tracker 欄位 `Date, Time, Type, Account, To Account, Amount, Merchant / Note, Category, Sub-category, Source, Created At`。可選 `_row`（試算表行號，預設 = 陣列位置 + 2）。
- `transactionMap`：RewardTransactionMap overlay。Tracker 冇嘅資料由呢度提供：

| 欄位 | 值 |
|---|---|
| `payment_id`, `source_row_ids` | 付款同 Tracker 行嘅對應；多行 = 合併做一筆 |
| `transaction_date`, `post_date` | `yyyy-MM-dd` |
| `post_status` [擴充] | `posted` / `pending` / `cancelled` |
| `original_currency` [擴充], `original_amount_hkd` | 幣別；銀行 HKD 入帳金額 |
| `payment_method` [擴充] | `physical_card` / `online_card_entry` / `card_on_file_recurring` / `apple_pay_in_store` / `ewallet_payment` / `ewallet_topup` |
| `transaction_channel`, `channel_evidence` | `online` / `offline`；`bank_statement` / `acquirer` / `user_confirmed` / `ai_guess` |
| `transaction_nature` [擴充] | `purchase` / `bill_payment` / `insurance_premium` / `securities` / `rent_management_fee` / `advertising` / `octopus_topup` |
| `location` [擴充], `store_verified` [擴充] | `HK_STORE` / `HK_DEPT_COUNTER` / `HK_OUTLET` / `JP` / `KR` / … |
| `merchant_raw`, `merchant_canonical` | 可選；冇就用 Tracker `Merchant / Note` |
| `refund_of` [擴充] | 退款連返原付款嘅 `payment_id` |

**Engine 唔會讀 `Source` 同 `Category` 嚟判斷資格。**`Source` 只會原樣輸出做參考。

## 計算流程

1. **候選篩選**：`Account=HSBC Red` 而 `Type=Expense`；`Type=Transfer` 而 `Sub-category` 係 Household / Travel Advance。還款（`To Account=HSBC Red` 或者 `Credit Card Repayment`）屬於 NOT_SPEND。`Refund` / `Income` 屬於退款候選。其他 HSBC Red 記錄放入 review。
2. **付款分組**：有 overlay `payment_id` 先合併。冇 ID 嘅 `Others|Reimbursable` 同日同時交易只標「疑似配對」。完全相同嘅交易只標「可能重複」，唔會刪除。
3. **金額**：有銀行 HKD 金額就用；申報咗 HKD 就用 Tracker 金額；冇幣別資料就暫按 HKD 計，但標 conditional；外幣冇 HKD 金額就標無法確認，唔計入總數。
4. **週期**：有 post date 就用 post date 嘅曆月；冇就用交易日，標 conditional。月尾 3 日提示只係 UI 提示。
5. **退款**：用淨額重新計算。跨月退款標 uncertain：低情境扣除，高情境唔扣。
6. **資格**（每項結果都係 yes / no / maybe）：
   - **8% 指定商戶**：名單、商戶有效日期、推廣期、地區 / 店舖、唔可以經電子錢包。Apple Pay 未核實，所以當 maybe。
   - **4% 網上**：推廣期；排除項目；渠道證據只接受 `bank_statement` / `acquirer`；付款方式同交易性質都要知道。
   - **基本 0.4%**：獨立判斷。超出 8% / 4% 額度嘅部分有 Red 條款支持。一般簽帳屬 conditional。被排除嘅交易屬 maybe。條款期外屬 terms_missing。
7. **分類**（優先 8%）：
   - 低情境：只有 yes 先計高回贈；8% maybe 就用 0.4%，唔會轉去 4%。
   - 高情境：所有 maybe 都當符合。
8. **分配額度**：每個曆月按（週期日期、交易日、時間、行號）排序，累積計算。每筆高回贈部分 = min(金額, 上限 − 已用)，餘下部分用 0.4%。8% 唔會佔用 4% 額度。
9. **Invariant**：已用簽帳 ≤ 門檻，高回贈 ≤ 上限；違反就報錯。
10. **輸出**：`payments`、`ledger`（RewardLedger）、`cycles`（每月摘要、保守剩餘額度、確定 / 條件估算 / 無法確認報告）、`not_spend`、`review`、`cancelled`、`issues`。

精確運算：金額用整數「仙」，回贈率用 bp，回贈單位 = 1e-6 RC。全程唔四捨五入；`*_display` 先四捨五入至 2 位，只供顯示。

## 確定程度

| 值 | 意思 | Spec §8 |
|---|---|---|
| `determined` | 按規則同現有資料計得出（**唔等於銀行確認**） | 確定 |
| `conditional` | 要靠假設，例如冇 post date、冇幣別、未入帳、一般簽帳嘅基本回贈 | 條件估算 |
| `uncertain` | 分類或者金額有範圍（低 ≠ 高） | 條件估算 |
| `undeterminable` | 冇金額或者冇條款 | 無法確認 |

`remaining_spend_conservative_hkd` = 假設所有唔確定交易都用咗額度（高情境）。

## 仍未確認嘅銀行條款

1. Apple Pay 係咪 Red 條款所指嘅「電子錢包」。
2. 被排除嘅網上交易（八達通、繳費、保費等）仲有冇基本 0.4%。
3. 推廣有效期以交易日定入帳日為準。
4. 跨月退款：銀行喺邊個月扣回，額度會唔會恢復。
5. 銀行尾數規則；RewardCash 顯示幾多位小數。
6. FamilyMart 日本指定門市名單；Tmoney 交易形式；OLIVE YOUNG 2026-07-01 至 07-14；WOWPASS 刪除生效日。
7. 香港指定商戶點樣分辨百貨公司專櫃 / outlets。
8. 分期付款、附屬卡、DCC。
9. 一般簽帳嘅基本 0.4% 資格（Spec 冇引用通用 RewardCash 條款）。
10. 2026-12-31 之後嘅條款。

## Tracker 格式假設（D9 未確認）

- `Date` 格式係 `yyyy-MM-dd` 或者 `yyyy/MM/dd`；`Time` 格式係 `HH:mm`。
- `Amount` 可以有 `HK$` 同千位逗號；負數按絕對值處理並加 flag。
- 退款用 `Type=Refund` 或者 `Type=Income`，並且要有 overlay `refund_of`。

## 未完成

- T28 server-side 權限：要 Apps Script 按 key 拒絕 Lai。v1.34 唔可以改，所以列為 Not Yet Testable。
- 真實資料模式：要 Apps Script 加只讀 action（第 4–5 階段，要另外批准）。
- Dashboard 入口（第 6 階段）。
