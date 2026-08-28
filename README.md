# 計程車檢舉平台（Taxi Refusal Reporting Platform）

> 免舉證，出口氣 — 查詢制計程車檢舉平台 MVP

---

## 🤖 接手 Prompt（複製給 AI 助手即可快速接手）

```
專案路徑：（填入你本機的專案資料夾路徑）
請先讀取 README.md 與 計程車檢舉平台_專案規格書.md。

這是一個「查詢制」計程車檢舉平台 MVP，已完成：
- 前端：純靜態 SPA（index.html + app.js + style.css + config.js），hash 路由，
  含首頁搜尋、查詢結果頁（匿名/記名分區）、檢舉表單（匿名/記名 OTP 流程）、關於頁。
  config.js 的 API_URL 留空時為 demo 模式（假資料、OTP 固定 123456）。
- 後端：Google Apps Script Web App（Code.gs），8 個 action：
  searchPlate / submitAnonymousReport / sendOtp / verifyOtp / submitVerifiedReport /
  voteReport / getMyReports / editReport。
  資料存 Google Sheets（Reports + EmailVerifications + Votes 三張表，自動建表），
  OTP 用 MailApp 寄送。（佐證上傳功能已移除，不佔用 Google Drive 空間）
  防濫用：車牌正規化、同裝置/同 Email 對同車牌 24h 限 1 次、同 Email 每日上限 5 筆、hash 儲存。
- 帳號與互動功能：
  - Email OTP 驗證通過後發 session_token（30 天），存 localStorage 當登入態
  - 記名帳號可對任何檢舉按讚/倒讚（一人一票可改票，不可投自己）
  - 記名帳號可在「我的檢舉」頁編輯自己的檢舉（分類+描述）
  - searchPlate 回傳每則讚/倒讚數 + 發布者信譽（該發布者全部檢舉的總讚/倒讚），
    前端顯示「可信發布者 / 爭議發布者 / 新發布者」徽章

待辦（Phase 2）：司機申訴表單、後台管理介面、髒話過濾。
請基於以上現況繼續開發，修改前先讀相關檔案。
```

---

## 📁 檔案結構

```
Taxi_Refusal_Reporting_Platform/
├── index.html                  # 前端主頁面（SPA 殼）
├── app.js                      # 前端主程式（路由 + 查詢 + 檢舉流程 + demo 模式）
├── style.css                   # 樣式（手機優先）
├── config.js                   # 前端設定（API_URL、分類、檔案大小限制）
├── Code.gs                     # Google Apps Script 後端（貼到 script.google.com）
├── README.md                   # 本檔
└── 計程車檢舉平台_專案規格書.md   # 原始規格書
```

## 🚀 本地打開檢驗（Demo 模式）

**不需要任何後端設定**，`config.js` 的 `API_URL` 留空即為 demo 模式：

```powershell
# 方式一：直接用 VS Code Live Server 擴充套件開啟 index.html

# 方式二：Python 起本地伺服器（miniforge 環境）
conda activate tmp_env
cd 你的專案資料夾路徑
python -m http.server 8080
# 瀏覽器開 http://localhost:8080
```

Demo 模式驗證重點：
- 首頁搜尋 `ABC-1234` → 會看到 2 筆記名 + 1 筆匿名檢舉
- 搜尋其他車牌 → 顯示「目前尚無相關檢舉紀錄」
- 填寫檢舉 → 記名模式的 OTP 固定為 `123456`（會跳 alert 提示）
- 送出後回到查詢頁可看到新紀錄（僅存在記憶體，重新整理即消失）

## 🌐 部署到線上

### Step 1：建立 Google Sheets（資料庫）

1. 到 [sheets.new](https://sheets.new) 建新試算表
2. 複製 URL 中的 Sheets ID：`https://docs.google.com/spreadsheets/d/`**`這串就是ID`**`/edit`
3. 不用手動建表，`Code.gs` 首次執行會自動建立 `Reports` 與 `EmailVerifications` 兩張表

### Step 2：部署 Apps Script 後端

1. 到 [script.google.com](https://script.google.com) → 新增專案
2. 把 `Code.gs` 全部內容貼進去
3. 修改檔案開頭常數：
   ```js
   const SPREADSHEET_ID = "你的 Sheets ID";
   ```
4. **部署 → 新增部署作業 → 類型選「網頁應用程式」**：
   - 說明：隨意（如 v1）
   - 執行身分：**我**（你的帳號）
   - 誰可以存取：**任何人**（Anonymous access，前端才能直接打 API）
5. 部署 → 授權（會要求存取 Sheets / Gmail / Drive 權限，全部允許）
6. 複製產生的 Web App URL：`https://script.google.com/macros/s/XXXX/exec`

### Step 3：設定每日清理觸發器（選配但建議）

Apps Script 編輯器左側「觸發條件（鬧鐘圖示）」→ 新增觸發條件：
- 函式：`cleanupExpiredVerifications`
- 事件來源：時間驅動
- 類型：日計時器

### Step 4：部署前端

**GitHub Pages：**
```powershell
cd D:\XXX\Taxi_Refusal_Reporting_Platform
git init
git add index.html app.js style.css config.js README.md Code.gs
git commit -m "init: taxi report platform MVP"
git remote add origin https://github.com/你的帳號/你的repo.git
git branch -M main
git push -u origin main
```

**開啟 GitHub Pages（取得網址）：**

1. 瀏覽器打開你的 repo：`https://github.com/a3ipak/trrp`
2. 上方 tab 列點 **Settings**（設定）
3. 左側選單最下方點 **Pages**（頁面）
4. 「Build and deployment」區塊 → **Branch** 下拉選單選 `main`，資料夾選 `/ (root)`，按 **Save**
5. 等約 1–3 分鐘，重新整理該頁面，上方會出現綠色框顯示網址：
  **https://a3ipak.github.io/trrp/**
6. 用手機或電腦瀏覽器打開這個網址，就是你的網站了

> 之後每次 `git push`，GitHub 會自動重新部署（約 1 分鐘生效）。
> 若顯示 404：確認 Step 4 有按 Save、等幾分鐘、檢查 repo 是 public（private repo 的 Pages 需付費方案）。


### Step 5：接上後端

用編輯器（VS Code）打開**本專案資料夾裡的 `config.js`**（跟 `index.html` 同一層的那個檔案），找到第 4 行：

```js
// 修改前（API_URL 是空字串 = demo 模式）
const CONFIG = {
    API_URL: "",

// 修改後（貼上你在 Step 2 部署完成時複製的 Web App URL）
const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycb...你的ID.../exec",
```

> 那組 URL 在哪？回到 [script.google.com](https://script.google.com) 你的專案 → 右上「部署 → 管理部署作業」→ 每個部署旁有一個網址（`https://script.google.com/macros/s/.../exec`），點旁邊的複製圖示即可。

改完存檔後，把更新推上 GitHub（前端才會重新部署）：

```powershell
git add config.js
git commit -m "feat: connect to Apps Script backend"
git push
```

**注意：Apps Script 部署後若改程式碼，需「部署 → 管理部署作業 → 編輯 → 新版本」才會生效。**

## 🔄 日常更新如何部署

改完程式碼後，依你改了什麼決定要部署哪邊：

### 情況 A：只改了前端（`index.html` / `app.js` / `style.css` / `config.js`）

```powershell
cd D:\XXX\Taxi_Refusal_Reporting_Platform
git add .
git commit -m "描述你改了什麼"
git push
```

push 後 GitHub Pages 約 1 分鐘自動重新部署。瀏覽器記得 **Ctrl+F5** 強制刷新（避免吃到快取的舊 JS）。

### 情況 B：只改了後端（`Code.gs`）

1. 打開 [script.google.com](https://script.google.com) 你的專案
2. 把本地 `Code.gs` 的最新內容**整份複製貼上**覆蓋編輯器（記得 `SPREADSHEET_ID` 保持你的真實 ID）
3. 右上 **部署 → 管理部署作業**（Manage deployments）
4. 點右上的**鉛筆圖示（編輯）**
5. 「版本」下拉 → 選 **新增版本**（New version），描述隨意
6. 按 **部署**

> ⚠️ 只按編輯器裡的「儲存」**不會**更新線上版本——Web App 永遠跑「部署時的版本」，一定要走上面的「新版本」流程。

### 情況 C：前後端都改了

先做 B（後端新版本），再做 A（push 前端），順序不影響結果。

### 驗證更新有沒有生效

- 後端：瀏覽器直接開 `你的_API_URL?action=test`（GET），看回傳的版本資訊；或到 Apps Script 專案 →「執行記錄」看有沒有新請求進來
- 前端：網站上 Ctrl+F5，F12 → Network 分頁確認載入的 `app.js` 是新的

## ⚠️ 已知限制

- Google Sheets API 速率限制（每 100 秒約 60–300 次請求），小規模夠用，流量大需換 Firebase/Supabase
- Apps Script 單次執行上限約 6 分鐘
- 此架構適合 MVP 驗證，不適合高流量正式環境

## 📋 Roadmap

- [x] Phase 1（MVP）：車牌查詢、匿名/記名檢舉、OTP 驗證、頻率限制、免責聲明
- [x] 追加：Email 帳號 session、按讚/倒讚、發布者信譽徽章、編輯自己的檢舉
- [ ] Phase 2：司機申訴/移除機制、後台管理介面、髒話過濾