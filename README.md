# 計程車檢舉平台（Taxi Refusal Reporting Platform）

> 免舉證，出口氣 — 查詢制計程車拒載檢舉平台

搭計程車被拒載、繞路、惡意加價？上網查一下這台車的「前科」，或花 30 秒留下你的紀錄，讓下一位乘客有所警覺。

## ✨ 功能

- **車牌查詢**：輸入車牌即看該車所有檢舉紀錄，匿名與記名分區顯示
- **匿名檢舉**：免註冊、免個資，選個分類就能送出
- **記名檢舉**：Email OTP 驗證，紀錄帶發布者信譽（可信／爭議／新發布者徽章）
- **社群投票**：記名帳號可對檢舉按讚／倒讚，一人一票可改票
- **我的檢舉**：登入後可編輯自己發布的檢舉
- **防濫用**：車牌正規化、同裝置／同 Email 對同車牌 24 小時限 1 筆、每日提交上限、身分 hash 儲存

## 🛠 技術棧

| 層 | 技術 |
|---|---|
| 前端 | 純靜態 SPA（vanilla JS + hash 路由），零框架零建置 |
| 後端 | Google Apps Script Web App |
| 資料庫 | Google Sheets（自動建表） |
| 驗證 | Email OTP（MailApp）+ 30 天 session token |
| 快取 | CacheService（查詢加速） |
| 部署 | GitHub Pages（前端）+ Apps Script（後端） |

## 🚀 快速開始

```bash
git clone https://github.com/a3ipak/trrp.git
cd trrp
# 用任何靜態伺服器打開即可，例如：
python -m http.server 8080
```

`config.js` 的 `API_URL` 留空即為 **demo 模式**：內建假資料、OTP 固定 `123456`，不需任何後端設定即可體驗完整流程。

## 📁 專案結構

```
├── index.html      # SPA 殼
├── app.js          # 路由 + 查詢 + 檢舉流程 + demo 模式
├── style.css       # 手機優先樣式
├── config.js       # API_URL、分類設定
└── Code.gs         # Apps Script 後端（8 個 API action）
```

## 🗺 Roadmap

- [x] Phase 1（MVP）：車牌查詢、匿名/記名檢舉、OTP 驗證、頻率限制
- [x] 追加：帳號 session、按讚/倒讚、發布者信譽徽章、編輯檢舉
- [ ] Phase 2：司機申訴機制、後台管理介面、髒話過濾

## ⚠️ 免責聲明

本平台為使用者自主分享之經驗紀錄，不構成任何指控或法律依據。檢舉內容由發布者自負責任，請保持客觀描述，避免人身攻擊字眼。

## 📄 License

MIT