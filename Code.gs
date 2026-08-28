// ===== 計程車檢舉平台 — Google Apps Script 後端 =====
// 部署方式請見 README.md
//
// 需要的 Google Sheets 欄位結構：
//   Sheet「Reports」: id, plate_normalized, plate_display, type, category,
//     description, occurred_at, location, submitted_at,
//     submitter_hash, status
//   Sheet「EmailVerifications」: email, otp_code, created_at, expires_at, verified, session_token
//   Sheet「Votes」: report_id, voter_hash, vote, created_at

// ====== 設定 ======
const SPREADSHEET_ID = "貼上你的 Google Sheets ID"; // Sheets URL 中 /d/ 後面那串
const OTP_TTL_MINUTES = 10;
const RATE_LIMIT_HOURS = 24; // 同裝置/同 Email 對同車牌限 1 次
const DAILY_EMAIL_LIMIT = 5; // 同 Email 每日總提交上限

// ====== 進入點 ======
function doPost(e) {
    let action = "";
    let payload = {};
    try {
        if (e.parameter && e.parameter.action) action = e.parameter.action;
        if (e.postData && e.postData.contents) {
            payload = JSON.parse(e.postData.contents);
        } else if (e.parameter && e.parameter.payload) {
            payload = JSON.parse(e.parameter.payload);
        }
    } catch (err) {
        return jsonOut({ ok: false, error: "payload 解析失敗" });
    }

    try {
        switch (action) {
            case "searchPlate":
                return jsonOut(searchPlate(payload));
            case "submitAnonymousReport":
                return jsonOut(submitAnonymousReport(payload));
            case "sendOtp":
                return jsonOut(sendOtp(payload));
            case "verifyOtp":
                return jsonOut(verifyOtp(payload));
            case "submitVerifiedReport":
                return jsonOut(submitVerifiedReport(payload));
            case "voteReport":
                return jsonOut(voteReport(payload));
            case "getMyReports":
                return jsonOut(getMyReports(payload));
            case "editReport":
                return jsonOut(editReport(payload));
            default:
                return jsonOut({ ok: false, error: "未知 action: " + action });
        }
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

// CORS 預檢（保險用，text/plain POST 通常不觸發）
function doGet(e) {
    return jsonOut({ ok: true, service: "taxi-report-api", version: "1.0" });
}

function jsonOut(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
        ContentService.MimeType.JSON
    );
}

// ====== 工具 ======
function getSheet(name) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        const headers = {
            Reports: [
                "id", "plate_normalized", "plate_display", "type", "category",
                "description", "occurred_at", "location",
                "submitted_at", "submitter_hash", "status"
            ],
            EmailVerifications: ["email", "otp_code", "created_at", "expires_at", "verified", "session_token"],
            Votes: ["report_id", "voter_hash", "vote", "created_at"],
        };
        sheet.appendRow(headers[name]);
    }
    return sheet;
}

function normalizePlate(plate) {
    return String(plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hash(str) {
    const raw = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        String(str) + "taxi-salt-2026"
    );
    return raw.map((b) => ((b & 0xff) + 0x100).toString(16).slice(1)).join("");
}

function genId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function sheetToObjects(sheet) {
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    const headers = values[0];
    return values.slice(1).map((row) => {
        const obj = {};
        headers.forEach((h, i) => (obj[h] = row[i]));
        return obj;
    });
}

// ====== 快取（CacheService）======
const CACHE_TTL_SECONDS = 300; // 5 分鐘

// 讀 Reports（優先走快取）
function getReportsCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("reports_all");
    if (cached) return JSON.parse(cached);
    const rows = sheetToObjects(getSheet("Reports"));
    try {
        cache.put("reports_all", JSON.stringify(rows), CACHE_TTL_SECONDS);
    } catch (e) {
        // 超過 100KB 上限時不快取，直接回傳（資料量大時可改分片）
    }
    return rows;
}

// 讀 Votes（優先走快取）
function getVotesCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("votes_all");
    if (cached) return JSON.parse(cached);
    const rows = sheetToObjects(getSheet("Votes"));
    try {
        cache.put("votes_all", JSON.stringify(rows), CACHE_TTL_SECONDS);
    } catch (e) {
        // 同上
    }
    return rows;
}

// 任何寫入 Reports / Votes 後呼叫，確保查詢即時看到新資料
function invalidateCache() {
    CacheService.getScriptCache().removeAll(["reports_all", "votes_all"]);
}

// ====== API: 查詢車牌 ======
function searchPlate(payload) {
    const plate = normalizePlate(payload.plate);
    if (!plate) return { ok: false, error: "車牌不可為空" };

    const rows = getReportsCached();

    // 彙整投票資料
    const voteRows = getVotesCached();
    const voteMap = {}; // report_id -> {up, down}
    voteRows.forEach((v) => {
        if (!voteMap[v.report_id]) voteMap[v.report_id] = { up: 0, down: 0 };
        if (Number(v.vote) === 1) voteMap[v.report_id].up++;
        else if (Number(v.vote) === -1) voteMap[v.report_id].down++;
    });

    // 若帶 session，計算目前使用者的投票狀態
    let myHash = null;
    if (payload.email && payload.session_token) {
        myHash = validateSession(
            String(payload.email).trim().toLowerCase(),
            payload.session_token
        );
    }
    const myVoteMap = {}; // report_id -> 1 | -1
    if (myHash) {
        voteRows.forEach((v) => {
            if (v.voter_hash === myHash) myVoteMap[v.report_id] = Number(v.vote);
        });
    }

    // 彙整發布者信譽：該 submitter_hash 所有 active 檢舉獲得的總讚/倒讚
    const repMap = {}; // submitter_hash -> {up, down}
    rows.forEach((r) => {
        if (r.status !== "active") return;
        if (!repMap[r.submitter_hash]) repMap[r.submitter_hash] = { up: 0, down: 0 };
        const v = voteMap[r.id] || { up: 0, down: 0 };
        repMap[r.submitter_hash].up += v.up;
        repMap[r.submitter_hash].down += v.down;
    });

    const reports = rows
        .filter((r) => r.plate_normalized === plate && r.status === "active")
        .map((r) => {
            const v = voteMap[r.id] || { up: 0, down: 0 };
            const rep = repMap[r.submitter_hash] || { up: 0, down: 0 };
            return {
                id: r.id,
                type: r.type,
                category: r.category,
                description: r.description,
                occurred_at: r.occurred_at ? String(r.occurred_at) : "",
                location: r.location,
                submitted_at: r.submitted_at ? String(r.submitted_at) : "",
                votes_up: v.up,
                votes_down: v.down,
                my_vote: myVoteMap[r.id] || 0,
                // 僅記名檢舉回傳信譽（匿名無意義）
                author_up: r.type === "verified" ? rep.up : null,
                author_down: r.type === "verified" ? rep.down : null,
            };
        })
        .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1));

    return { ok: true, plate: plate, reports: reports };
}

// ====== API: 匿名檢舉 ======
function submitAnonymousReport(payload) {
    const plate = normalizePlate(payload.plate);
    if (!plate) return { ok: false, error: "車牌不可為空" };
    if (payload.description && payload.description.length > 300) {
        return { ok: false, error: "描述超過 300 字" };
    }

    const submitterHash = hash(payload.device_token || "unknown");
    if (isRateLimited(plate, submitterHash)) {
        return { ok: false, error: "此裝置對該車牌 24 小時內已提交過檢舉" };
    }

    appendReport(payload, plate, "anonymous", submitterHash);
    invalidateCache();
    return { ok: true, id: genId() };
}

// ====== API: 寄 OTP ======
function sendOtp(payload) {
    const email = String(payload.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return { ok: false, error: "Email 格式錯誤" };
    }

    // 防濫用：同 Email 10 分鐘內不可重複寄送
    const sheet = getSheet("EmailVerifications");
    const rows = sheetToObjects(sheet);
    const now = new Date();
    const recent = rows.filter(
        (r) =>
            r.email === email &&
            new Date(r.created_at).getTime() > now.getTime() - 10 * 60 * 1000
    );
    if (recent.length > 0) {
        return { ok: false, error: "驗證碼已寄出，請稍後再試（10 分鐘內勿重複寄送）" };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
    sheet.appendRow([email, code, now, expires, false]);

    MailApp.sendEmail({
        to: email,
        subject: "【計程車檢舉平台】Email 驗證碼",
        body:
            "您的驗證碼為：" + code +
            "\n\n此驗證碼 " + OTP_TTL_MINUTES + " 分鐘內有效。" +
            "\n若非本人操作，請忽略此信。",
    });

    return { ok: true };
}

// ====== API: 驗證 OTP ======
function verifyOtp(payload) {
    const email = String(payload.email || "").trim().toLowerCase();
    const code = String(payload.code || "").trim();
    const sheet = getSheet("EmailVerifications");
    const rows = sheetToObjects(sheet);
    const now = new Date();

    // 找最新一筆未過期、未驗證的紀錄
    let target = null;
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.email === email && !r.verified && new Date(r.expires_at) > now) {
            target = { row: r, index: i };
            break;
        }
    }
    if (!target) return { ok: false, error: "驗證碼已過期或不存在，請重新寄送" };
    if (String(target.row.otp_code) !== code) {
        return { ok: false, error: "驗證碼錯誤" };
    }

    // 標記已驗證（index+2 因為有 header 列）
    sheet.getRange(target.index + 2, 5).setValue(true);

    // 產生一次性提交 token（以該筆 OTP 的 created_at 時間窗計算，與 findVerifiedOtpIndex 一致）
    const token = hash(
        email + code + Math.floor(new Date(target.row.created_at).getTime() / (OTP_TTL_MINUTES * 60 * 1000))
    );

    // 產生 session token（長效登入態，供投票/編輯/我的檢舉使用）
    const sessionToken = Utilities.getUuid();
    sheet.getRange(target.index + 2, 6).setValue(sessionToken);

    return { ok: true, token: token, session_token: sessionToken };
}

// ====== API: 記名檢舉 ======
function submitVerifiedReport(payload) {
    const email = String(payload.email || "").trim().toLowerCase();
    const plate = normalizePlate(payload.plate);
    if (!plate) return { ok: false, error: "車牌不可為空" };
    if (payload.description && payload.description.length > 300) {
        return { ok: false, error: "描述超過 300 字" };
    }

    // 驗證 token：比對近期已驗證、尚未使用的 OTP
    const otpRowIndex = findVerifiedOtpIndex(email, payload.token);
    if (otpRowIndex === -1) {
        return { ok: false, error: "驗證 token 無效或已使用，請重新完成 Email 驗證" };
    }

    const submitterHash = hash(email);
    if (isRateLimited(plate, submitterHash)) {
        return { ok: false, error: "此 Email 對該車牌 24 小時內已提交過檢舉" };
    }

    // 同 Email 每日總提交上限
    const rows = sheetToObjects(getSheet("Reports"));
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = rows.filter(
        (r) => r.submitter_hash === submitterHash && new Date(r.submitted_at) >= todayStart
    ).length;
    if (todayCount >= DAILY_EMAIL_LIMIT) {
        return { ok: false, error: "已達每日提交上限（" + DAILY_EMAIL_LIMIT + " 筆）" };
    }

    appendReport(payload, plate, "verified", submitterHash);
    invalidateCache();

    // 一次性作廢提交 token：清空 otp_code（session_token 保留，登入態不受影響）
    const verSheet = getSheet("EmailVerifications");
    verSheet.getRange(otpRowIndex + 2, 2).setValue("USED");

    return { ok: true, id: genId() };
}

// 回傳 token 對應的已驗證 OTP 列 index（0-based，不含 header），找不到回 -1
function findVerifiedOtpIndex(email, token) {
    if (!token) return -1;
    const sheet = getSheet("EmailVerifications");
    const rows = sheetToObjects(sheet);
    const now = new Date();
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.email !== email || !r.verified) continue;
        // 驗證後 30 分鐘內有效
        if (now - new Date(r.expires_at) > 30 * 60 * 1000) break;
        const expected = hash(
            email + String(r.otp_code) + Math.floor(new Date(r.created_at).getTime() / (OTP_TTL_MINUTES * 60 * 1000))
        );
        if (expected === token) return i;
    }
    return -1;
}

// ====== Session 驗證 ======
// 驗證 email + session_token，通過回 submitterHash，失敗回 null
// session 有效期：驗證後 30 天
function validateSession(email, sessionToken) {
    if (!email || !sessionToken) return null;
    const sheet = getSheet("EmailVerifications");
    const rows = sheetToObjects(sheet);
    const now = new Date();
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.email === email && r.verified && r.session_token === sessionToken) {
            // session 30 天有效
            if (now - new Date(r.created_at) > 30 * 24 * 60 * 60 * 1000) return null;
            return hash(email);
        }
    }
    return null;
}

// ====== API: 按讚/倒讚（限記名帳號）======
function voteReport(payload) {
    const email = String(payload.email || "").trim().toLowerCase();
    const submitterHash = validateSession(email, payload.session_token);
    if (!submitterHash) {
        return { ok: false, error: "請先完成 Email 驗證登入" };
    }
    const vote = Number(payload.vote);
    if (vote !== 1 && vote !== -1) {
        return { ok: false, error: "vote 必須是 1 或 -1" };
    }
    if (!payload.report_id) return { ok: false, error: "缺少 report_id" };

    // 檢查目標報告存在
    const reportRows = sheetToObjects(getSheet("Reports"));
    const report = reportRows.find((r) => r.id === payload.report_id && r.status === "active");
    if (!report) return { ok: false, error: "檢舉不存在" };

    // 不可對自己的檢舉投票
    if (report.submitter_hash === submitterHash) {
        return { ok: false, error: "不可對自己的檢舉投票" };
    }

    // 一人一票：已投過就更新
    const sheet = getSheet("Votes");
    const rows = sheetToObjects(sheet);
    const existing = rows.findIndex(
        (r) => r.report_id === payload.report_id && r.voter_hash === submitterHash
    );
    if (existing >= 0) {
        sheet.getRange(existing + 2, 3).setValue(vote);
        sheet.getRange(existing + 2, 4).setValue(new Date());
    } else {
        sheet.appendRow([payload.report_id, submitterHash, vote, new Date()]);
    }
    invalidateCache();
    return { ok: true };
}

// ====== API: 我的檢舉（限記名帳號）======
function getMyReports(payload) {
    const email = String(payload.email || "").trim().toLowerCase();
    const submitterHash = validateSession(email, payload.session_token);
    if (!submitterHash) {
        return { ok: false, error: "請先完成 Email 驗證登入" };
    }
    const rows = sheetToObjects(getSheet("Reports"));
    const mine = rows
        .filter((r) => r.submitter_hash === submitterHash)
        .map((r) => ({
            id: r.id,
            plate_display: r.plate_display,
            plate_normalized: r.plate_normalized,
            type: r.type,
            category: r.category,
            description: r.description,
            status: r.status,
            submitted_at: r.submitted_at ? String(r.submitted_at) : "",
        }))
        .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1));
    return { ok: true, reports: mine };
}

// ====== API: 編輯自己的檢舉（限記名帳號）======
function editReport(payload) {
    const email = String(payload.email || "").trim().toLowerCase();
    const submitterHash = validateSession(email, payload.session_token);
    if (!submitterHash) {
        return { ok: false, error: "請先完成 Email 驗證登入" };
    }
    if (!payload.report_id) return { ok: false, error: "缺少 report_id" };
    if (payload.description && payload.description.length > 300) {
        return { ok: false, error: "描述超過 300 字" };
    }

    const sheet = getSheet("Reports");
    const rows = sheetToObjects(sheet);
    const index = rows.findIndex(
        (r) => r.id === payload.report_id && r.submitter_hash === submitterHash
    );
    if (index < 0) return { ok: false, error: "找不到您發布的這筆檢舉" };

    // 更新欄位（category 第5欄、description 第6欄）
    if (payload.category) sheet.getRange(index + 2, 5).setValue(payload.category);
    if (payload.description && payload.description.trim()) {
        sheet.getRange(index + 2, 6).setValue(payload.description.trim());
    }
    invalidateCache();
    return { ok: true };
}


// ====== 共用 ======
function appendReport(payload, plate, type, submitterHash) {
    const sheet = getSheet("Reports");
    sheet.appendRow([
        genId(),
        plate,
        payload.plate_display || payload.plate,
        type,
        payload.category || "其他",
        (payload.description || "").trim(),
        payload.occurred_at || "",
        payload.location || "",
        new Date(),
        submitterHash,
        "active",
    ]);
}

function isRateLimited(plate, submitterHash) {
    const rows = sheetToObjects(getSheet("Reports"));
    const cutoff = Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000;
    return rows.some(
        (r) =>
            r.plate_normalized === plate &&
            r.submitter_hash === submitterHash &&
            r.status === "active" &&
            new Date(r.submitted_at).getTime() > cutoff
    );
}

// ====== 每日清理過期驗證碼（設定時間觸發器執行）======
function cleanupExpiredVerifications() {
    const sheet = getSheet("EmailVerifications");
    const rows = sheetToObjects(sheet);
    const now = new Date();
    const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    // 保留：未過期的 OTP，或仍有有效 session（30 天）的已驗證列
    const keep = rows.filter(
        (r) =>
            new Date(r.expires_at) > now ||
            (r.verified && r.session_token && now - new Date(r.created_at) <= SESSION_TTL_MS)
    );
    if (keep.length !== rows.length) {
        sheet.clearContents();
        sheet.appendRow(["email", "otp_code", "created_at", "expires_at", "verified", "session_token"]);
        if (keep.length > 0) {
            sheet.getRange(2, 1, keep.length, 6).setValues(
                keep.map((r) => [r.email, r.otp_code, r.created_at, r.expires_at, r.verified, r.session_token || ""])
            );
        }
    }
}