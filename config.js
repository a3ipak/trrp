// ===== 設定檔 =====
// 部署 Apps Script Web App 後，將 URL 填入下方 API_URL
// 格式：https://script.google.com/macros/s/XXXX/exec
const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbyqyv1D_Ln8CCjBQ2O3CsRjU8EtZ_uesgmLDXkEVvFaelo_zf2YYh7iqUxwZNDSsIq56A/exec", // 留空 = demo 模式（本地預覽用假資料）

    // 前端限制
    MAX_DESC_LENGTH: 300,

    // 事由分類
    CATEGORIES: [
        "拒載",
        "繞路",
        "超收車資 / 亂跳表",
        "服務態度不佳",
        "危險駕駛",
        "其他",
    ],
};
