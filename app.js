// ===== 計程車檢舉平台 前端主程式 =====
(function () {
    "use strict";

    const app = document.getElementById("app");
    // ===== 登入 session（記名帳號，存 localStorage，30 天有效）=====
    const session = {
        email: localStorage.getItem("session_email") || "",
        token: localStorage.getItem("session_token") || "",
        save(email, token) {
            this.email = email;
            this.token = token;
            localStorage.setItem("session_email", email);
            localStorage.setItem("session_token", token);
        },
        clear() {
            this.email = "";
            this.token = "";
            localStorage.removeItem("session_email");
            localStorage.removeItem("session_token");
        },
        get isLoggedIn() {
            return Boolean(this.email && this.token);
        },
    };

    const state = {
        // 暴露到全域供 inline onclick 使用（僅 plate 帶入，無敏感資料）
        // 檢舉流程狀態
        report: {
            plate: "",
            mode: "anonymous", // anonymous | verified
            email: "",
            otpToken: "",
        },
        // demo 模式假資料
        demoReports: [
            {
                id: "demo-r1",
                votes_up: 3,
                votes_down: 0,
                author_up: 7,
                author_down: 1,
                type: "verified",
                category: "拒載",
                description: "在台北車站排班區招車，司機搖下窗問去哪，聽到目的地後直接說不順路開走，但當時是空車。",
                occurred_at: "2026/08/20 21:30",
                location: "台北車站東三門",
                submitted_at: "2026/08/20 22:05",
                },
            {
                id: "demo-r2",
                votes_up: 1,
                votes_down: 1,
                author_up: 7,
                author_down: 1,
                type: "verified",
                category: "繞路",
                description: "從信義區到南港明明走市民大道最快，司機硬繞環東大道，多收了 80 元。",
                occurred_at: "2026/08/15 18:10",
                location: "台北市信義區",
                submitted_at: "2026/08/15 19:00",
                },
            {
                id: "demo-r3",
                votes_up: 0,
                votes_down: 2,
                author_up: null,
                author_down: null,
                type: "anonymous",
                category: "服務態度不佳",
                description: "上車後司機一路罵髒話、批評政治，要求小聲一點被嗆「不爽就下車」。",
                occurred_at: "2026/07/30 14:20",
                location: "台中一中街",
                submitted_at: "2026/07/30 15:00",
                },
        ],
    };

    window.state = state;

    // ===== 工具函式 =====
    function normalizePlate(plate) {
        return String(plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    }

    function esc(str) {
        const div = document.createElement("div");
        div.textContent = String(str ?? "");
        return div.innerHTML;
    }

    function isDemo() {
        return !CONFIG.API_URL;
    }

    async function callApi(action, payload) {
        if (isDemo()) return demoApi(action, payload);
        const res = await fetch(CONFIG.API_URL + "?action=" + action, {
            method: "POST",
            body: JSON.stringify(payload || {}),
            // Apps Script Web App 不支援 CORS preflight，用 text/plain 避免 OPTIONS
            headers: { "Content-Type": "text/plain;charset=utf-8" },
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
    }

    // demo 模式模擬後端
    async function demoApi(action, payload) {
        await new Promise((r) => setTimeout(r, 400));
        switch (action) {
            case "searchPlate": {
                const p = normalizePlate(payload.plate);
                // demo：固定車牌 ABC1234 有資料
                const reports = (p === "ABC1234" ? state.demoReports : []).map((r) => ({
                    ...r,
                    my_vote: r._myVote || 0,
                }));
                return { ok: true, plate: p, reports };
            }
            case "sendOtp":
                console.log("[DEMO] OTP 驗證碼：123456");
                alert("[DEMO 模式] 驗證碼固定為 123456（正式環境會寄 Email）");
                return { ok: true };
            case "verifyOtp":
                if (payload.code === "123456") {
                    return { ok: true, token: "demo-token", session_token: "demo-session" };
                }
                return { ok: false, error: "驗證碼錯誤（demo 提示：123456）" };
            case "submitAnonymousReport":
            case "submitVerifiedReport":
                state.demoReports.push({
                    id: "demo-" + Date.now(),
                    type: action === "submitVerifiedReport" ? "verified" : "anonymous",
                    category: payload.category,
                    description: payload.description,
                    occurred_at: payload.occurred_at || "",
                    location: payload.location || "",
                    submitted_at: new Date().toLocaleString("zh-TW"),
                    votes_up: 0,
                    votes_down: 0,
                    author_up: action === "submitVerifiedReport" ? 7 : null,
                    author_down: action === "submitVerifiedReport" ? 1 : null,
                });
                return { ok: true, id: "demo-" + Date.now() };
            case "voteReport": {
                if (!session.isLoggedIn) {
                    return { ok: false, error: "請先完成 Email 驗證登入" };
                }
                const r = state.demoReports.find((x) => x.id === payload.report_id);
                if (!r) return { ok: false, error: "檢舉不存在" };
                const v = Number(payload.vote);
                if (r._myVote === v) return { ok: true }; // 重複點同方向 = 不變
                if (r._myVote) {
                    // 更新既有票
                    if (r._myVote === 1) r.votes_up--;
                    else r.votes_down--;
                }
                if (v === 1) r.votes_up++;
                else r.votes_down++;
                r._myVote = v;
                return { ok: true };
            }
            case "getMyReports": {
                if (!session.isLoggedIn) {
                    return { ok: false, error: "請先完成 Email 驗證登入" };
                }
                return {
                    ok: true,
                    reports: state.demoReports
                        .filter((r) => r.type === "verified")
                        .map((r) => ({
                            id: r.id,
                            plate_display: "ABC-1234",
                            plate_normalized: "ABC1234",
                            type: r.type,
                            category: r.category,
                            description: r.description,
                            status: "active",
                            submitted_at: r.submitted_at,
                        })),
                };
            }
            case "editReport": {
                const r = state.demoReports.find((x) => x.id === payload.report_id);
                if (!r) return { ok: false, error: "找不到這筆檢舉" };
                if (payload.category) r.category = payload.category;
                if (payload.description) r.description = payload.description;
                return { ok: true };
            }
            default:
                return { ok: false, error: "未知 action" };
        }
    }

    // ===== 路由 =====
    function route() {
        const hash = location.hash.replace(/^#\/?/, "");
        const [view, param] = hash.split("/");
        switch (view) {
            case "result":
                renderResult(decodeURIComponent(param || ""));
                break;
            case "report":
                renderReportForm();
                break;
            case "mine":
                renderMyReports();
                break;
            default:
                renderHome();
        }
    }

    window.addEventListener("hashchange", route);

    // ===== 首頁 =====
    function renderHome() {
        app.innerHTML = `
            <section class="hero">
                <h1>免舉證，出口氣</h1>
                <p>查詢計程車車牌的過往檢舉紀錄，或分享你的遭遇</p>
                <form class="search-box" id="search-form">
                    <input type="text" id="plate-input" placeholder="輸入完整車牌，如 ABC-1234" autocomplete="off" required>
                    <button type="submit">查詢</button>
                </form>
                <p class="hint">僅提供查詢，不提供瀏覽清單。資料由民眾自主提供，非政府認定結果。</p>
            </section>
        `;
        const plateInput = document.getElementById("plate-input");
        // 自動大寫 + 過濾非法字元
        plateInput.addEventListener("input", () => {
            const pos = plateInput.selectionStart;
            plateInput.value = plateInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
            plateInput.setSelectionRange(pos, pos);
        });
        document.getElementById("search-form").addEventListener("submit", (e) => {
            e.preventDefault();
            const plate = plateInput.value.trim();
            if (!plate) return;
            location.hash = "#/result/" + encodeURIComponent(plate);
        });
    }

    // ===== 查詢結果頁 =====
    async function renderResult(plate) {
        const norm = normalizePlate(plate);
        if (!norm) {
            location.hash = "#/";
            return;
        }
        app.innerHTML = `<div class="loading">查詢中…</div>`;
        try {
            const searchPayload = { plate: norm };
            if (session.isLoggedIn) {
                searchPayload.email = session.email;
                searchPayload.session_token = session.token;
            }
            const data = await callApi("searchPlate", searchPayload);
            if (!data.ok) throw new Error(data.error || "查詢失敗");
            const reports = data.reports || [];
            const anon = reports.filter((r) => r.type === "anonymous");
            const verified = reports.filter((r) => r.type === "verified");

            if (reports.length === 0) {
                app.innerHTML = `
                    <a href="#/" class="back-link">← 返回首頁</a>
                    <div class="result-plate">${esc(plate)}</div>
                    <div class="empty-state">
                        <p>目前尚無相關檢舉紀錄</p>
                        <br>
                        <a href="#/report" class="btn btn-primary" data-plate="${esc(norm)}">填寫檢舉</a>
                    </div>
                `;
                bindPlateLinks();
                return;
            }

            app.innerHTML = `
                <a href="#/" class="back-link">← 返回首頁</a>
                <div class="result-plate">${esc(plate)}</div>
                <div class="stats-row">
                    <div class="stat-card anon">
                        <div class="num">${anon.length}</div>
                        <div class="label">🔓 匿名檢舉</div>
                    </div>
                    <div class="stat-card verified">
                        <div class="num">${verified.length}</div>
                        <div class="label">✅ 記名檢舉（Email 驗證）</div>
                    </div>
                </div>
                <div class="section-title">✅ 記名檢舉 <span class="badge-verified">Email 已驗證</span></div>
                <div id="list-verified">${verified.map(renderReportCard).join("") || '<p class="empty-state" style="padding:16px">無紀錄</p>'}</div>
                <div class="section-title">🔓 匿名檢舉 <span class="badge-anon">未驗證</span></div>
                <div id="list-anon">${anon.map(renderReportCard).join("") || '<p class="empty-state" style="padding:16px">無紀錄</p>'}</div>
                <br>
                <a href="#/report" class="btn btn-primary btn-block" data-plate="${esc(norm)}">填寫檢舉</a>
            `;
            bindPlateLinks();
        } catch (err) {
            app.innerHTML = `
                <a href="#/" class="back-link">← 返回首頁</a>
                <div class="msg error">查詢失敗：${esc(err.message)}</div>
            `;
        }
    }

    // 「填寫檢舉」按鈕：點擊時帶入車牌（事件委派，避免 inline onclick）
    function bindPlateLinks() {
        app.querySelectorAll("[data-plate]").forEach((el) => {
            el.addEventListener("click", () => {
                state.report.plate = el.dataset.plate;
            });
        });
    }

    function renderReportCard(r) {
        // 發布者信譽徽章（僅記名）
        let repBadge = "";
        if (r.type === "verified" && r.author_up !== null && r.author_up !== undefined) {
            const total = r.author_up + r.author_down;
            const good = total === 0 ? null : r.author_up / total >= 0.7;
            const label =
                total === 0
                    ? "新發布者"
                    : good
                    ? `👍 可信發布者（${r.author_up} 讚 / ${r.author_down} 倒讚）`
                    : `⚠️ 爭議發布者（${r.author_up} 讚 / ${r.author_down} 倒讚）`;
            repBadge = `<span class="rep-badge ${total === 0 ? "" : good ? "good" : "bad"}">${label}</span>`;
        }

        // 投票區（登入才顯示；my_vote 高亮自己投的票）
        const myVote = Number(r.my_vote || 0);
        const voteBox = session.isLoggedIn
            ? `
            <div class="vote-box">
                <button class="vote-btn up ${myVote === 1 ? "active" : ""}" data-id="${esc(r.id)}" data-vote="1">👍 ${r.votes_up || 0}</button>
                <button class="vote-btn down ${myVote === -1 ? "active" : ""}" data-id="${esc(r.id)}" data-vote="-1">👎 ${r.votes_down || 0}</button>
            </div>`
            : `<div class="vote-box vote-locked">👍 ${r.votes_up || 0} · 👎 ${r.votes_down || 0}（登入後可投票）</div>`;

        return `
            <div class="report-card" data-report-id="${esc(r.id)}">
                <div class="meta">
                    <span class="category">${esc(r.category)}</span>
                    <span>🕒 ${esc(r.submitted_at || "")}</span>
                    ${r.occurred_at ? `<span>發生：${esc(r.occurred_at)}</span>` : ""}
                    ${r.location ? `<span>📍 ${esc(r.location)}</span>` : ""}
                </div>
                ${repBadge}
                <div class="desc">${esc(r.description)}</div>
                ${voteBox}
            </div>
        `;
    }

    // 投票事件（事件委派，掛在 app 上）
    app.addEventListener("click", async (e) => {
        const btn = e.target.closest(".vote-btn");
        if (!btn) return;
        e.preventDefault();
        btn.disabled = true;
        try {
            const res = await callApi("voteReport", {
                email: session.email,
                session_token: session.token,
                report_id: btn.dataset.id,
                vote: Number(btn.dataset.vote),
            });
            if (!res.ok) throw new Error(res.error || "投票失敗");
            // 重新渲染當前頁
            route();
        } catch (err) {
            alert("投票失敗：" + err.message);
            btn.disabled = false;
        }
    });

    // ===== 我的檢舉頁（記名帳號）=====
    async function renderMyReports() {
        if (!session.isLoggedIn) {
            app.innerHTML = `
                <a href="#/" class="back-link">← 返回首頁</a>
                <div class="form-card">
                    <h2>我的檢舉</h2>
                    <p style="margin:16px 0">此功能需 Email 驗證登入。請先透過<a href="#/report">填寫檢舉</a>完成記名驗證。</p>
                </div>
            `;
            return;
        }
        app.innerHTML = `<div class="loading">載入中…</div>`;
        try {
            const data = await callApi("getMyReports", {
                email: session.email,
                session_token: session.token,
            });
            if (!data.ok) throw new Error(data.error || "載入失敗");
            const catOptions = CONFIG.CATEGORIES.map(
                (c) => `<option value="${esc(c)}">${esc(c)}</option>`
            ).join("");
            const cards = data.reports
                .map(
                    (r) => `
                <div class="report-card">
                    <div class="meta">
                        <span class="category">${esc(r.category)}</span>
                        <span>🚕 ${esc(r.plate_display)}</span>
                        <span>🕒 ${esc(r.submitted_at)}</span>
                        ${r.status !== "active" ? `<span style="color:var(--danger)">已下架</span>` : ""}
                    </div>
                    <div class="desc">${esc(r.description)}</div>
                    ${r.status === "active" ? `
                    <div class="edit-area">
                        <button class="btn btn-secondary btn-edit" data-id="${esc(r.id)}" data-cat="${esc(r.category)}" data-desc="${esc(r.description).replace(/"/g, "&quot;")}">編輯</button>
                    </div>` : ""}
                </div>`
                )
                .join("");
            app.innerHTML = `
                <a href="#/" class="back-link">← 返回首頁</a>
                <div class="form-card">
                    <h2>我的檢舉（${esc(session.email)}）</h2>
                    <div id="mine-msg"></div>
                    ${cards || '<p class="empty-state">您還沒有發布過記名檢舉</p>'}
                </div>
                <br>
                <button class="btn btn-secondary btn-block" id="btn-logout">登出</button>
            `;
            document.getElementById("btn-logout").addEventListener("click", () => {
                session.clear();
                location.hash = "#/";
            });
            // 編輯（展開 inline 編輯器）
            app.querySelectorAll(".btn-edit").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const card = btn.closest(".report-card");
                    const area = card.querySelector(".edit-area");
                    area.innerHTML = `
                        <div class="field">
                            <label>事由分類</label>
                            <select class="edit-cat">${catOptions}</select>
                        </div>
                        <div class="field">
                            <label>描述（限 300 字）</label>
                            <textarea class="edit-desc" maxlength="300">${esc(btn.dataset.desc)}</textarea>
                        </div>
                        <button class="btn btn-primary btn-save" data-id="${esc(btn.dataset.id)}">儲存</button>
                        <button class="btn btn-secondary btn-cancel">取消</button>
                    `;
                    area.querySelector(".edit-cat").value = btn.dataset.cat;
                    area.querySelector(".btn-cancel").addEventListener("click", () => renderMyReports());
                    area.querySelector(".btn-save").addEventListener("click", async () => {
                        const msg = document.getElementById("mine-msg");
                        try {
                            const res = await callApi("editReport", {
                                email: session.email,
                                session_token: session.token,
                                report_id: btn.dataset.id,
                                category: area.querySelector(".edit-cat").value,
                                description: area.querySelector(".edit-desc").value,
                            });
                            if (!res.ok) throw new Error(res.error || "儲存失敗");
                            msg.innerHTML = `<div class="msg success">已更新</div>`;
                            renderMyReports();
                        } catch (err) {
                            msg.innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
                        }
                    });
                });
            });
        } catch (err) {
            app.innerHTML = `
                <a href="#/" class="back-link">← 返回首頁</a>
                <div class="msg error">載入失敗：${esc(err.message)}</div>
            `;
        }
    }

    // ===== 檢舉表單頁 =====
    function renderReportForm() {
        state.report.otpToken = "";
        const catOptions = CONFIG.CATEGORIES.map(
            (c) => `<option value="${esc(c)}">${esc(c)}</option>`
        ).join("");

        app.innerHTML = `
            <a href="#/" class="back-link">← 返回首頁</a>
            <div class="form-card">
                <h2>填寫檢舉</h2>
                <div id="form-msg"></div>

                <div class="field">
                    <label>車牌號碼 *</label>
                    <input type="text" id="r-plate" placeholder="如 ABC-1234" value="${esc(state.report.plate)}" required>
                </div>

                <div class="field">
                    <label>提交模式 *</label>
                    <div class="mode-toggle">
                        <div class="mode-option selected" data-mode="anonymous" id="mode-anon">
                            <div class="mode-title">🔓 匿名</div>
                            <div class="mode-desc">直接送出，可信度較低</div>
                        </div>
                        <div class="mode-option" data-mode="verified" id="mode-verified">
                            <div class="mode-title">✅ 記名驗證</div>
                            <div class="mode-desc">Email 驗證，可信度較高</div>
                        </div>
                    </div>
                </div>

                <div id="otp-section" style="display:none">
                    <div class="field">
                        <label>Email（僅用於驗證，不會公開顯示）*</label>
                        <div class="otp-row">
                            <input type="email" id="r-email" placeholder="your@email.com">
                            <button type="button" class="btn btn-secondary" id="btn-send-otp">寄驗證碼</button>
                        </div>
                    </div>
                    <div class="field" id="otp-input-field" style="display:none">
                        <label>6 位數驗證碼 *</label>
                        <div class="otp-row">
                            <input type="text" id="r-otp" maxlength="6" inputmode="numeric" placeholder="000000">
                            <button type="button" class="btn btn-secondary" id="btn-verify-otp">驗證</button>
                        </div>
                    </div>
                </div>

                <div class="field">
                    <label>事由分類 *</label>
                    <select id="r-category">${catOptions}</select>
                </div>

                <div class="field">
                    <label>文字描述（選填，限 ${CONFIG.MAX_DESC_LENGTH} 字）</label>
                    <textarea id="r-desc" maxlength="${CONFIG.MAX_DESC_LENGTH}" placeholder="選填：補充說明事發經過，避免人身攻擊字眼"></textarea>
                    <div class="char-count"><span id="char-count">0</span> / ${CONFIG.MAX_DESC_LENGTH}</div>
                </div>

                <div class="field">
                    <label>發生時間（選填）</label>
                    <input type="datetime-local" id="r-occurred">
                </div>

                <div class="field">
                    <label>發生地點（選填）</label>
                    <input type="text" id="r-location" placeholder="如：台北車站東三門">
                </div>

                <button type="button" class="btn btn-primary btn-block" id="btn-submit">送出檢舉</button>
            </div>
        `;

        bindReportForm();
    }

    function bindReportForm() {
        const msg = document.getElementById("form-msg");
        const showMsg = (text, type) => {
            msg.innerHTML = `<div class="msg ${type}">${esc(text)}</div>`;
        };

        // 模式切換
        document.querySelectorAll(".mode-option").forEach((el) => {
            el.addEventListener("click", () => {
                document.querySelectorAll(".mode-option").forEach((o) => o.classList.remove("selected"));
                el.classList.add("selected");
                state.report.mode = el.dataset.mode;
                document.getElementById("otp-section").style.display =
                    state.report.mode === "verified" ? "block" : "none";
            });
        });

        // 字數統計
        const desc = document.getElementById("r-desc");
        desc.addEventListener("input", () => {
            document.getElementById("char-count").textContent = desc.value.length;
        });

        // 車牌輸入：自動大寫 + 過濾
        const plateInput = document.getElementById("r-plate");
        plateInput.addEventListener("input", () => {
            const pos = plateInput.selectionStart;
            plateInput.value = plateInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
            plateInput.setSelectionRange(pos, pos);
        });

        // 寄驗證碼
        document.getElementById("btn-send-otp").addEventListener("click", async () => {
            const email = document.getElementById("r-email").value.trim();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                showMsg("請輸入有效的 Email", "error");
                return;
            }
            showMsg("驗證碼寄送中…", "info");
            try {
                const res = await callApi("sendOtp", { email });
                if (!res.ok) throw new Error(res.error || "寄送失敗");
                state.report.email = email;
                document.getElementById("otp-input-field").style.display = "block";
                showMsg("驗證碼已寄出，請至信箱查看（10 分鐘內有效）", "success");
            } catch (err) {
                showMsg(err.message, "error");
            }
        });

        // 驗證 OTP
        document.getElementById("btn-verify-otp").addEventListener("click", async () => {
            const code = document.getElementById("r-otp").value.trim();
            if (!/^\d{6}$/.test(code)) {
                showMsg("請輸入 6 位數驗證碼", "error");
                return;
            }
            try {
                const res = await callApi("verifyOtp", { email: state.report.email, code });
                if (!res.ok) throw new Error(res.error || "驗證失敗");
                state.report.otpToken = res.token;
                if (res.session_token) session.save(state.report.email, res.session_token);
                showMsg("✅ Email 驗證成功（已登入，可投票與管理我的檢舉）", "success");
            } catch (err) {
                showMsg(err.message, "error");
            }
        });

        // 送出
        document.getElementById("btn-submit").addEventListener("click", async () => {
            const plate = document.getElementById("r-plate").value.trim();
            const category = document.getElementById("r-category").value;
            const description = desc.value.trim();
            const occurred = document.getElementById("r-occurred").value;
            const location = document.getElementById("r-location").value.trim();

            if (!plate) return showMsg("請輸入車牌號碼", "error");
            if (!category) return showMsg("請選擇檢舉分類", "error");
            if (state.report.mode === "verified" && !state.report.otpToken) {
                return showMsg("記名模式需先完成 Email 驗證", "error");
            }

            const btn = document.getElementById("btn-submit");
            btn.disabled = true;
            btn.textContent = "送出中…";
            try {
                const payload = {
                    plate: normalizePlate(plate),
                    plate_display: plate,
                    category,
                    description,
                    occurred_at: occurred,
                    location,
                    device_token: getDeviceToken(),
                };

                const action =
                    state.report.mode === "verified"
                        ? "submitVerifiedReport"
                        : "submitAnonymousReport";
                if (state.report.mode === "verified") {
                    payload.email = state.report.email;
                    payload.token = state.report.otpToken;
                }

                const res = await callApi(action, payload);
                if (!res.ok) throw new Error(res.error || "送出失敗");

                app.innerHTML = `
                    <div class="form-card" style="text-align:center">
                        <h2>✅ 檢舉已送出</h2>
                        <p style="margin:16px 0">感謝你的分享，車牌 <strong>${esc(plate)}</strong> 的紀錄已更新。</p>
                        <a href="#/result/${encodeURIComponent(plate)}" class="btn btn-primary">查看結果</a>
                    </div>
                `;
            } catch (err) {
                showMsg("送出失敗：" + err.message, "error");
                btn.disabled = false;
                btn.textContent = "送出檢舉";
            }
        });
    }

    // 匿名防濫用：localStorage 裝置 token
    function getDeviceToken() {
        let t = localStorage.getItem("device_token");
        if (!t) {
            t = "dev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem("device_token", t);
        }
        return t;
    }

    // ===== 啟動 =====
    route();
})();