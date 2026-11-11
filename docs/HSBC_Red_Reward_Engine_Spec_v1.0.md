# Amy Reward Engine｜HSBC Red 規則及測試規格 v1.0

狀態：**設計草案／不修改原程式**　｜　日期：2026-11-11　｜　時區：Asia/Hong_Kong

## 1. 範圍與來源

- 主來源：使用者提供的 `Red.pdf`，**HSBC Red Credit Card Reward Scheme**，2026-07-01 至 2026-12-31。修訂內容由 2026-07-15 生效。
- 不引用先前上載的 HSBC RewardCash 通用條款作為本版本之專屬優惠資料來源。
- 程式背景：Amy Expense Tracker Apps Script v1.34。實作測試只使用虛構交易；不得存取或提交真實 Transactions.csv。
- 這是供 Claude Code 開發／測試的規格，**並非已上線、已核實銀行實際派發獎賞錢**。

## 2. 經文件確認的規則

| 欄位 | RED_DESIGNATED_8 | RED_ONLINE_4 |
|---|---|---|
| 適用信用卡 | HSBC Red | HSBC Red |
| 高回贈率（包含基本回贈） | 8% | 4% |
| 每月高回贈對應簽帳額 | 首 HK$1,250 | 首 HK$10,000 |
| 每曆月最高高回贈 | $100 RewardCash | $400 RewardCash |
| 超出相關高回贈額度 | 合資格消費按基本 0.4% | 合資格消費按基本 0.4% |
| 月份歸屬 | 交易入帳日（post date），按曆月 | 同左 |
| 優惠有效日期 | 2026-07-01 ~ 2026-12-31 | 同左 |
| 來源 | Red.pdf p.1–2，條款 1–7 | 同左 |

共同條件：

1. 指定商戶與網上交易兩類如果重疊，**優先分類指定商戶 8%**，不可兩邊佔額度或疊加回贈（條款5）。即使指定商戶 8% 高回贈額度已耗盡，亦不應自動改歸 4%，除非日後有更明確的官方條款修訂。
2. 8% 與 4% **已包含基本 0.4%**，不可再加一次 0.4%。
3. 只有已入帳而且未取消／退回的交易才是銀行最終有效交易。Tracker 沒有 post date 時，可按交易日作**暫定估算**，但必須顯示不確定性。
4. 網購認定按 Mastercard／商戶收單機構分類；**不能單靠 Tracker 的 `Source=Manual/Apple Pay/Notification` 判斷**。
5. PDF 列出的非合資格網上交易：網上繳費（包括 HSBC 網上理財／繳費服務）、信用卡於電子錢包的交易、保費、證券、租金／管理費、廣告費、八達通自動增值及八達通充值等（Red.pdf p.2）。其餘是否合資格仍以銀行判定為準。
6. HKD 以外交易按銀行入帳的 HKD 兌換金額計。沒有該金額時不能出確定值。
7. 指定商戶名單及地區限制（參考 Red.pdf p.1）：香港 Sushiro、TamJai SamGor Mixian、TamJai Yunnan Mixian、Bakehouse、Decathlon Hong Kong、NAMCO、TAITO STATION、Sephora、@cosme STORE、@cosme HONG KONG、3COINS；海外日本 FamilyMart 指定日本門市、旅遊預付卡 Suica、Tmoney（WOWPASS 已從名單刪除；須按商戶及交易形式再核實資格）、韓國 OLIVE YOUNG 韓國門市（2026-07-15 起修訂）。香港指定商戶限定香港店舖（不含百貨公司專櫃及 outlets）；交易經電子錢包不算指定商戶交易。
8. 可另外保存 HK Express 機上餐飲免費飲品優惠（Red.pdf p.3），但該優惠不屬金錢回贈額度，不納入本次 RewardCash 計算。

## 3. 建議的資料表（不實施）

### CardPromotions
`promotion_id,card_id,name,valid_from,valid_to,rate_inclusive,cap_unit,cap_value,high_rate_spend_limit,cycle_type,cycle_date_basis,priority,source_id,verification_status`

### MerchantRewardRules
`merchant_rule_id,canonical_merchant,aliases,location_restriction,channel_restriction,promotion_id,valid_from,valid_to,confidence,source_id`

### RewardTransactionMap
`payment_id,source_row_ids,card_id,transaction_date,post_date,merchant_raw,merchant_canonical,original_amount_hkd,transaction_channel,channel_evidence,classification,classification_reason,review_status`

### RewardLedger
`payment_id,promotion_id,cycle_key,eligible_spend_hkd,high_rate_spend_hkd,estimated_reward_rc,base_reward_rc,uncertainty,calculation_version,source_version`

### PromotionSources
`source_id,document_name,source_url,document_effective_date,checked_at,extracted_at,verification_status,notes`

注意：這些是**設計資料表**，未有寫入現有 Google Sheets。

## 4. 交易清洗及配對流程

1. 只讀匯入原始 `Transactions`；保留原始列號、日期、時間、戶口、商戶及金額以追溯來源。
2. `Account=HSBC Red` 且 `Type=Expense`：候選信用卡付款；`Type=Transfer` 且 `Sub-category=Household Advance/Travel Advance`、來源戶口為 HSBC Red：候選付款；`Credit Card Repayment` 不是簽帳。
3. `Others|Reimbursable` 夾錢分拆行嘗試跟同日同時同卡交易配對；沒有原始 transaction_id 只能做**疑似配對**，不可無條件把兩行當成一筆。
4. 商戶標準化：`iCloud subscription`、`icloud` -> `Apple iCloud`；已由使用者確認兩筆均為 Apple 自動扣信用卡；**尚未確認 Mastercard 網購資格或銀行入帳日**。
5. 若交易同時符合指定商戶及網購，只計 `RED_DESIGNATED_8`。
6. 依 `post_date`（缺少則 `transaction_date` 及註記假設）及 promotion 期限，按曆月排序與累計合資格簽帳額；每筆高回贈部分=min(本筆合資格金額, 當月高回贈簽帳上限－之前已用)。剩餘合資格簽帳按基本 0.4% 估算。
7. 重跑計算以原始資料為主，不直接永久遞減手動欄位；記錄規則版本與結果，避免修改舊交易後越扣越多。
8. 不完整／不確定交易另列 potential exposure，保守估算剩餘額度；**不可聲稱銀行已確認派發**。

## 5. 示範計算公式與邊界

8%：本期指定商戶高回贈 `0.08 × min(合資格累計金額,1250)`，超出部分基本 `0.004 × max(合資格累計金額−1250,0)`。4%：同理以 `0.04` 與 `10000` 代入。兩個類別分開累積，回贈以 `RewardCash` 單位呈現。

注意：本公式為**高回贈與基本回贈的理論估算**，並非對銀行逐筆小數入帳或零碎結轉處理的完整重現；未知尾數規則先標示估算，不應假定逐筆四捨五入。

## 6. 測試資料使用原則（公開 Repository 安全版）

- 本開發規格不包含真實交易記錄、個人消費明細、任何存取密鑰或 Web App URL。
- 開發時只使用虛構交易，欄位結構模仿現有 Tracker：`Date, Time, Type, Account, To Account, Amount, Merchant / Note, Category, Sub-category, Source, Created At`。
- `iCloud subscription` / `icloud` 是商戶別名邏輯的示例；不代表銀行已確認交易符合網上回贈。
- 需要讀取真實交易前，必須另外取得用戶明確批准並完成安全審查。

## 7. 驗收測試清單

| ID | 測試情境 | 預期結果 |
|---|---|---|
| T01 | HSBC Red 指定商戶已入帳 HK$500 | 8% 高回贈約 $40；8% 高回贈簽帳容量餘 $750 |
| T02 | 指定商戶同月再入帳 $750 | 累計 8% 高回贈 $100；額度用盡 |
| T03 | 指定商戶同月再入帳 $200 | 不再享 8%；基本 0.4% 約 $0.80 |
| T04 | HSBC Red 合資格網上消費 $2,000 | 4% 高回贈約 $80；網上餘 $8,000 高回贈簽帳容量 |
| T05 | 網上同月累積達 $10,000 | 4% 高回贈 $400；高回贈額度用盡 |
| T06 | 4% 上限用盡後再合資格網購 $100 | 僅基本 0.4% 約 $0.40 |
| T07 | 指定商戶亦屬網購 | 僅歸 8%，不計入 4% 容量 |
| T08 | 指定商戶 8% 額度已耗盡，再有同店網購 | 仍歸指定商戶類別，不能自動轉到 4% |
| T09 | `iCloud subscription` | 名稱標準化為 `Apple iCloud`；付款為 recurring；網上資格待確認 |
| T10 | `icloud` | 同 T09；不自動合併成同一筆付款 |
| T11 | HSBC Red 還款 Transfer $8.08 | 不計簽帳，不得扣回贈容量 |
| T12 | Household Advance 由 HSBC Red 支付 | 作候選信用卡簽帳一次，不能因屋企記錄重複 |
| T13 | Travel Advance 由 HSBC Red 支付 | 同 T12 |
| T14 | 夾錢拆分兩行 300+600 | 有可靠 payment_id 時合併原簽帳 $900；舊紀錄無 ID 則疑似配對 |
| T15 | 不同交易剛好同時、同金額、同商戶 | 不可無條件當重複，需交易 ID 或證據 |
| T16 | 未入帳交易 | 可以有預計值，但不可當已確認派發；入帳日未明須標示 |
| T17 | 月末交易，次月入帳 | 按實際次月 post date 計入次月 |
| T18 | 無 post date 交易 | 按交易日作暫估，月底顯示週期風險 |
| T19 | 已入帳後全數退款 | 清除／沖回相應回贈，整月重新計算 |
| T20 | 部分退款 | 按退款後合資格金額重算，保留追溯鏈 |
| T21 | 商戶別名相同但不同地區 | 不可單靠名稱判定指定海外商戶資格 |
| T22 | 電子錢包交易或八達通充值 | 不計入 4% 網上高回贈 |
| T23 | 官方活動日期之外消費 | 不適用 8%／4% 專屬活動 |
| T24 | 8% 網上交疊但 8% 額度已用完 | 仍屬指定商戶，不自動切換 4% |
| T25 | 任一舊交易類別／金額更改 | 全週期重算結果更新，不重複扣限額 |
| T26 | 重複執行同一計算 | 結果相同，無重覆 Reward Ledger 計算項 |
| T27 | 只有 AI 猜測商戶渠道 | 保留 uncertain，不當確定享 4% |
| T28 | Lai 查看家庭 Dashboard | 不可取得 Amy 個人信用卡回贈資料 |
| T29 | 遇到缺失官方條款 | 不自動推論，有效性標記未確認 |
| T30 | 交易資料含外幣，無入帳 HKD | 保留候選交易，暫不作確定回贈計算 |

## 8. 下一次交 Claude Code 前的交付要求

- 先**離線實作測試引擎**（獨立 JS 檔，不引用真實 Sheet 或 Apps Script 寫入 API）。
- 所有 T01–T30 自動測試通過；產生差異報告，分別標出確定、條件估算及無法確認。
- 現有 v1.34 不變。未經用戶明確批准不得編輯 Code.gs、捷徑、Google Sheets 或部署。
- 原程式包含敏感設定：交給 Claude／GitHub 前先做無密鑰版本；不得將密鑰或 Web App URL 寫入 repo。

