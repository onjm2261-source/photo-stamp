(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // ===== 목록 (여기만 고치면 화면 후보가 바뀝니다. 점검 항목표에 맞춰 채우세요) =====
  const PARTS = ["거실", "주방", "욕실", "안방", "방", "세대 현관", "발코니", "다용도실", "복도", "계단실", "지하주차장", "옥상", "외벽"];
  const TRADES = ["방화문·창호", "방수", "타일", "결로", "균열", "바닥구조", "변경시공", "설비", "기타"];
  const TO_LIST = ["", "공사팀장", "현장소장", "공무", "협력업체 담당", "감리", "기타"];
  const CAND = {
    "방화문·창호": { p: ["실링 누락", "개폐 불량", "하드웨어 미설치", "인정표시 확인 안 됨", "틈새 과다"], a: ["실링 보완 후 재점검", "개폐 조정", "하드웨어 설치 확인", "인정서 확인"] },
    "방수": { p: ["두께 확인 기록 없음", "관통부 처리 미흡", "모서리 파손", "담수시험 미실시", "치켜올림 부족"], a: ["담수시험 재실시·사진 첨부", "관통부 보강 후 재점검", "두께 측정 기록", "치켜올림 보완"] },
    "타일": { p: ["들뜸", "줄눈 불량", "구배 불량", "파손·깨짐", "단차"], a: ["들뜬 부위 재시공 후 재점검", "줄눈 재시공", "물 흘려 구배 확인", "교체 후 재점검"] },
    "결로": { p: ["단열재 누락", "곰팡이 흔적", "창호 주위 결로", "환기 부족"], a: ["단열 보강", "원인 확인 후 재점검", "환기 개선"] },
    "균열": { p: ["미세 균열", "구조 균열 의심", "진행 여부 확인 필요", "누수 동반"], a: ["폭·길이 기록", "게이지 부착 관찰", "보수 후 재점검", "구조 검토 요청"] },
    "바닥구조": { p: ["수평 불량", "완충재 누락", "들뜸·소음", "두께 부족"], a: ["레벨 측정 기록", "완충재 확인", "보수 후 재점검"] },
    "변경시공": { p: ["도면과 다름", "승인 기록 없음", "자재 변경"], a: ["변경 승인 서류 확인", "도면 대조", "감리 확인 요청"] },
    "설비": { p: ["누수", "배관 구배 불량", "보온 누락", "고정 불량"], a: ["누수 시험", "구배 재조정", "보온 보완", "고정 보강"] },
    "기타": { p: ["정리정돈 불량", "안전시설 미흡"], a: ["정리 후 재확인", "담당자 확인 요청"] }
  };
  const LIMIT = { reason: 30, problem: 40, advice: 40 };
  const MAX_SIDE = 4096;
  const FONT = '"Apple SD Gothic Neo","Noto Sans KR","Noto Sans CJK KR","Malgun Gothic",sans-serif';
  const COLORS = { "양호": "#1f8a4c", "미흡": "#e0362a", "확인 필요": "#e0a000" };

  const ui = {};
  ["site", "dong", "floor", "part", "reason", "problem", "advice", "to", "due", "tags", "author",
   "autosave", "saveOrig", "clearAfter", "hideSite", "size"].forEach((k) => ui[k] = $(k));
  const out = $("out"), tag = $("tag"), hint = $("hint"), toast = $("toast"), cam = $("cam");
  const saveBtn = $("saveBtn"), shareBtn = $("shareBtn");

  let trade = "", status = "", tagsEdited = false;
  let source = null, origFile = null, shotTime = null, lastBlob = null, lastUrl = null, savedThisShot = false;

  // ===== 저장소 (이 휴대폰에만) =====
  const KEY = "photo-stamp-v3", REC = "photo-stamp-records";
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let S = load(KEY, null);
  if (!S) {
    S = { sites: [], site: "", dong: "", floor: "", author: "", autosave: true, saveOrig: true, clearAfter: true, hideSite: false, size: "3" };
    const old = load("photo-stamp-v2", null);   // 예전 버전 현장명 옮기기
    if (old && old.site && old.site !== "OO현장") S.sites.push({ name: old.site, used: Date.now() });
  }
  const saveS = () => {
    Object.assign(S, { site: ui.site.value, dong: ui.dong.value, floor: ui.floor.value, author: ui.author.value,
      autosave: ui.autosave.checked, saveOrig: ui.saveOrig.checked, clearAfter: ui.clearAfter.checked,
      hideSite: ui.hideSite.checked, size: ui.size.value });
    store(KEY, S);
  };

  // ===== 날짜 =====
  const pad = (n) => String(n).padStart(2, "0");
  const fmtWhen = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fileStamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  // ===== 음성으로 들어온 부위에서 조사 떼기 =====
  const P_LONG = ["에서는", "에서도", "에서", "으로는", "으로", "에는", "에도", "까지", "부터", "입니다", "이에요", "에요", "예요", "이다", "이고"];
  const P_ONE = "은는이가을를도만로와과의에";
  const KEEP1 = "방벽문층창";
  function stripWord(w) {
    w = w.replace(/[.,!?~…]+$/g, "");
    if (!w) return "";
    for (const p of P_LONG) if (w.length > p.length && w.endsWith(p)) return w.slice(0, -p.length);
    const last = w[w.length - 1];
    if (P_ONE.includes(last) && w.length >= 2) {
      const rest = w.slice(0, -1);
      if (rest.length >= 2 || KEEP1.includes(rest) || /^\d+$/.test(rest)) return rest;
    }
    return w;
  }
  const cleanWords = (t) => (t || "").split(/[\s,，、]+/).map(stripWord).filter(Boolean).join(" ");

  // ===== 현장 목록 (최근 쓴 현장이 위로) =====
  function fillSites() {
    const cur = S.site;
    const list = S.sites.slice().sort((a, b) => (b.used || 0) - (a.used || 0));
    ui.site.innerHTML = "";
    const first = document.createElement("option");
    first.value = ""; first.textContent = list.length ? "현장 선택" : "먼저 '현장 목록 관리'에서 현장을 추가하세요";
    ui.site.appendChild(first);
    list.forEach((s) => { const o = document.createElement("option"); o.value = o.textContent = s.name; ui.site.appendChild(o); });
    ui.site.value = list.some((s) => s.name === cur) ? cur : "";
    const box = $("siteList"); box.innerHTML = "";
    list.forEach((s) => {
      const row = document.createElement("div"); row.className = "siteitem";
      const name = document.createElement("span"); name.textContent = s.name;
      const del = document.createElement("button"); del.type = "button"; del.className = "btn small"; del.textContent = "삭제";
      del.addEventListener("click", () => { S.sites = S.sites.filter((x) => x.name !== s.name); if (S.site === s.name) S.site = ""; store(KEY, S); fillSites(); update(); });
      row.append(name, del); box.appendChild(row);
    });
  }
  $("siteManage").addEventListener("click", () => { $("siteSheet").hidden = false; $("newSite").focus(); });
  $("siteClose").addEventListener("click", () => { $("siteSheet").hidden = true; });
  function addSite() {
    const n = $("newSite").value.trim().replace(/\s+/g, " ");
    if (!n) return;
    if (!S.sites.some((s) => s.name === n)) S.sites.push({ name: n, used: Date.now() });
    S.site = n; $("newSite").value = ""; store(KEY, S); fillSites(); update();
  }
  $("addSite").addEventListener("click", addSite);
  $("newSite").addEventListener("keydown", (e) => { if (e.key === "Enter") addSite(); });

  // ===== 버튼 목록 만들기 =====
  function chips(boxId, items, onPick, isOn) {
    const box = $(boxId); box.innerHTML = "";
    items.forEach((v) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = v;
      b.setAttribute("aria-pressed", isOn && isOn(v) ? "true" : "false");
      b.addEventListener("click", () => onPick(v));
      box.appendChild(b);
    });
  }
  const addText = (el, v, lim) => {   // 후보를 누르면 이어 붙이기 (이미 있으면 빼기)
    const parts = el.value.split(/\s*,\s*/).filter(Boolean);
    const i = parts.indexOf(v);
    if (i >= 0) parts.splice(i, 1); else parts.push(v);
    el.value = parts.join(", ").slice(0, lim);
  };
  function drawChips() {
    chips("partChips", PARTS, (v) => { ui.part.value = v; update(); }, (v) => ui.part.value === v);
    chips("tradeChips", TRADES, (v) => { trade = trade === v ? "" : v; update(); }, (v) => v === trade);
    const c = CAND[trade] || { p: [], a: [] };
    const has = (el) => (v) => el.value.split(/\s*,\s*/).includes(v);
    chips("problemChips", c.p, (v) => { addText(ui.problem, v, LIMIT.problem); update(); }, has(ui.problem));
    chips("adviceChips", c.a, (v) => { addText(ui.advice, v, LIMIT.advice); update(); }, has(ui.advice));
    document.querySelectorAll(".st").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === status ? "true" : "false"));
  }
  document.querySelectorAll(".st").forEach((b) => b.addEventListener("click", () => { status = status === b.dataset.v ? "" : b.dataset.v; update(); }));
  TO_LIST.forEach((v) => { const o = document.createElement("option"); o.value = v; o.textContent = v || "선택 안 함"; ui.to.appendChild(o); });

  // ===== 값 정리 =====
  function locText() {
    let d = ui.dong.value.trim(), f = ui.floor.value.trim();
    if (d && /^\d+$/.test(d)) d += "동";
    if (f && /^(B?\d+)$/i.test(f)) f = f.toUpperCase() + "층";
    return [d, f, ui.part.value.trim()].filter(Boolean).join(" ");
  }
  const oneLine = (s) => s.replace(/\s*\n\s*/g, " ").trim();
  function autoTags() {
    const t = [];
    if (trade) t.push("#" + trade.replace(/[·\s]/g, ""));
    if (status) t.push("#" + status.replace(/\s/g, ""));
    if (status === "미흡" || status === "확인 필요") t.push("#품질");
    if (ui.due.value) t.push("#보완기한");
    return t.join(" ");
  }
  function missing() {
    const m = [];
    if (!ui.site.value) m.push(["fSite", "현장명"]);
    if (!ui.dong.value.trim() && !ui.floor.value.trim() && !ui.part.value.trim()) m.push(["fLoc", "위치"]);
    if (!trade) m.push(["fTrade", "공종"]);
    if (!status) m.push(["fStatus", "상태"]);
    return m;
  }
  function counters() {
    [["reason", "cReason"], ["problem", "cProblem"], ["advice", "cAdvice"]].forEach(([k, c]) => { $(c).textContent = ui[k].value.length + " / " + LIMIT[k] + "자"; });
    $("locPreview").textContent = locText();
  }
  Object.keys(LIMIT).forEach((k) => ui[k].maxLength = LIMIT[k]);

  // ===== 사진 위 글자: 최대 5줄, 한 줄이 넘치면 … 으로 줄임 =====
  function buildLines() {
    const L = [];
    const when = fmtWhen(shotTime || new Date());
    const site = ui.hideSite.checked ? "" : ui.site.value;
    L.push({ t: site ? site + "  " + when : when });
    const loc = locText();
    const head = [loc, trade].filter(Boolean).join("  ·  ");
    if (head || status) L.push({ t: head, status });
    const reason = oneLine(ui.reason.value);
    if (reason) L.push({ t: "이유 : " + reason });
    const prob = oneLine(ui.problem.value);
    if (prob) L.push({ t: "문제점 : " + prob });
    const adv = oneLine(ui.advice.value);
    if (adv) L.push({ t: "조언 : " + adv });
    return L.slice(0, 5);
  }
  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  function lumaAt(ctx, x, y, w, h, cw, ch) {
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
    w = Math.max(1, Math.min(cw - x, Math.ceil(w))); h = Math.max(1, Math.min(ch - y, Math.ceil(h)));
    const d = ctx.getImageData(x, y, w, h).data;
    const step = Math.max(1, Math.floor(d.length / 4 / 4000)) * 4;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += step) { sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
    return n ? sum / n : 128;
  }
  function drawStamp(ctx, w, h) {
    const lines = buildLines();
    const fs = Math.round(Math.min(w, h) * Number(ui.size.value) / 100);
    const lh = Math.round(fs * 1.22);
    const m = Math.max(2, Math.round(Math.min(w, h) * 0.006));
    ctx.font = `700 ${fs}px ${FONT}`;
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.lineJoin = "round";
    const maxW = w - m * 2;
    const lastBase = h - m - Math.round(fs * 0.2);
    lines.forEach((ln, i) => {
      const y = lastBase - (lines.length - 1 - i) * lh;
      const stTxt = ln.status ? (ln.t ? "  ·  " : "") + ln.status : "";
      const stW = stTxt ? ctx.measureText(stTxt).width : 0;
      const t = ln.t ? fit(ctx, ln.t, maxW - stW) : "";
      const tw = ctx.measureText(t).width;
      const light = lumaAt(ctx, m, y - fs * 0.9, tw + stW, fs * 1.1, w, h) < 135;
      ctx.lineWidth = Math.max(2, fs * 0.2);
      ctx.strokeStyle = light ? "rgba(0,0,0,.85)" : "rgba(255,255,255,.9)";
      if (t) { ctx.strokeText(t, m, y); ctx.fillStyle = light ? "#fff" : "#111"; ctx.fillText(t, m, y); }
      if (stTxt) {                                  // 상태는 색으로 구분
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.strokeText(stTxt, m + tw, y);
        ctx.fillStyle = COLORS[ln.status] || "#fff";
        ctx.fillText(stTxt, m + tw, y);
      }
    });
  }
  function drawSample(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, "#8fb3d4"); sky.addColorStop(1, "#d7e2ea");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#9a9284"; ctx.fillRect(0, h * 0.62, w, h * 0.38);
    ctx.fillStyle = "#b9bcbf"; ctx.fillRect(w * 0.18, h * 0.12, w * 0.42, h * 0.4);
    ctx.fillStyle = "#7d858d";
    for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.18, h * (0.12 + i * 0.1), w * 0.42, h * 0.012);
    for (let j = 0; j < 5; j++) ctx.fillRect(w * (0.18 + j * 0.1), h * 0.12, w * 0.012, h * 0.4);
    ctx.fillStyle = "#e0a222"; ctx.fillRect(w * 0.72, h * 0.06, w * 0.02, h * 0.5); ctx.fillRect(w * 0.5, h * 0.06, w * 0.42, h * 0.018);
  }

  let renderId = 0;
  async function render() {
    const id = ++renderId;
    let w = 1200, h = 900;
    if (source) { const k = Math.min(1, MAX_SIDE / Math.max(source.width, source.height)); w = Math.round(source.width * k); h = Math.round(source.height * k); }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (source) ctx.drawImage(source, 0, 0, w, h); else drawSample(ctx, w, h);
    drawStamp(ctx, w, h);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
    if (id !== renderId || !blob) return;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastBlob = blob; lastUrl = URL.createObjectURL(blob); out.src = lastUrl;
  }

  // ===== 저장 =====
  function say(msg, err) { toast.textContent = msg; toast.className = "toast" + (err ? " err" : ""); }
  const safe = (s) => (s || "현장").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 30);
  const baseName = () => `${safe(ui.site.value)}_${fileStamp(shotTime || new Date())}`;
  function download(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  function record() {
    const recs = load(REC, []);
    recs.push({
      파일: baseName() + "_글자.jpg", 현장명: ui.site.value, 촬영시각: fmtWhen(shotTime), 위치: locText(), 공종: trade, 상태: status,
      사진찍은이유: oneLine(ui.reason.value), 문제점: oneLine(ui.problem.value), 조언대책: oneLine(ui.advice.value),
      전달받은사람: ui.to.value, 보완기한: ui.due.value, 태그: ui.tags.value.trim(), 작성자: ui.author.value.trim()
    });
    store(REC, recs); showCount();
  }
  function save() {
    if (!lastBlob || !source) return;
    const m = missing();
    if (m.length) { mark(); say("필수 칸을 채워 주세요: " + m.map((x) => x[1]).join(", "), true); return; }
    try {
      if (ui.saveOrig.checked && origFile && !savedThisShot) {
        const ext = (origFile.name.match(/\.\w+$/) || [".jpg"])[0];
        download(origFile, baseName() + "_원본" + ext);
      }
      download(lastBlob, baseName() + "_글자.jpg");
      if (!savedThisShot) record();
      savedThisShot = true;
      const s = S.sites.find((x) => x.name === ui.site.value); if (s) { s.used = Date.now(); store(KEY, S); }
      say("저장했습니다 · " + baseName() + (ui.saveOrig.checked ? " (원본 + 글자)" : ""));
      $("notSaved").hidden = false;
      hint.textContent = "저장됐습니다. 다음 사진을 찍으세요.";
      if (ui.clearAfter.checked) clearFields();
    } catch (e) { openSheet(); }
  }
  const toDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  async function openSheet() {
    let src = lastUrl; try { src = await toDataUrl(lastBlob); } catch (e) {}
    $("saveImg").src = src; $("saveName").textContent = baseName() + "_글자.jpg"; $("saveSheet").hidden = false;
  }
  $("notSaved").addEventListener("click", openSheet);
  $("saveClose").addEventListener("click", () => { $("saveSheet").hidden = true; });
  async function share() {
    if (!lastBlob || !source) return;
    try {
      const f = new File([lastBlob], baseName() + "_글자.jpg", { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] });
      else say("이 휴대폰은 공유를 지원하지 않습니다. 저장 후 보내 주세요.", true);
    } catch (e) { if (e && e.name !== "AbortError") say("공유하지 못했습니다.", true); }
  }
  function clearFields() {   // 사진은 그대로 두고 칸만 비움 (현장명·동·층·공종은 유지)
    clearTimeout(timer);
    ["reason", "problem", "advice"].forEach((k) => ui[k].value = "");
    ui.due.value = ""; ui.to.value = ""; status = ""; tagsEdited = false;
    update(true);   // 저장된 사진 미리보기는 그대로 둠
  }
  function showCount() {
    const recs = load(REC, []);
    const today = fmtWhen(new Date()).slice(0, 10);
    $("recCount").textContent = `기록 ${recs.length}건 (오늘 ${recs.filter((r) => (r.촬영시각 || "").startsWith(today)).length}건)`;
  }
  $("exportBtn").addEventListener("click", () => {
    const recs = load(REC, []);
    if (!recs.length) { say("아직 저장된 기록이 없습니다.", true); return; }
    const cols = Object.keys(recs[0]);
    const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const csv = "﻿" + [cols.map(q).join(",")].concat(recs.map((r) => cols.map((c) => q(r[c])).join(","))).join("\r\n");
    download(new Blob([csv], { type: "text/csv" }), `현장사진기록_${fileStamp(new Date())}.csv`);
    say("기록을 내보냈습니다 (" + recs.length + "건)");
  });

  function mark() {
    ["fSite", "fLoc", "fTrade", "fStatus"].forEach((id) => $(id).classList.remove("missing"));
    missing().forEach(([id]) => $(id).classList.add("missing"));
  }

  // ===== 촬영 =====
  async function loadImage(file) {
    if ("createImageBitmap" in window) { try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) {} }
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error("x")); img.src = URL.createObjectURL(file); });
  }
  cam.addEventListener("change", async () => {
    const file = cam.files && cam.files[0];
    cam.value = "";
    if (!file) return;
    say("문구를 넣는 중…");
    try {
      ui.part.value = cleanWords(ui.part.value);
      source = await loadImage(file);
      origFile = file; shotTime = new Date(); savedThisShot = false;   // 날짜·시간은 촬영 순간으로 고정
      $("when").textContent = fmtWhen(shotTime);
      await render();
      tag.hidden = true; saveBtn.disabled = false; shareBtn.disabled = false;
      say("");
      if (ui.autosave.checked && !missing().length) save();
      else { mark(); hint.textContent = missing().length ? "필수 칸(빨간 글자)을 채운 뒤 저장을 누르세요." : "문구를 고치면 사진에 바로 반영됩니다. 저장을 누르세요."; }
    } catch (e) { say("사진을 불러오지 못했습니다. 다시 촬영해 주세요.", true); }
  });

  // ===== 음성 입력 =====
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  document.querySelectorAll(".mic").forEach((btn) => btn.addEventListener("click", () => {
    const k = btn.dataset.for, field = ui[k];
    if (!SR) { say("여기서는 음성 입력이 안 됩니다. 키보드의 마이크 버튼을 쓰세요.", true); field.focus(); return; }
    const rec = new SR();
    rec.lang = "ko-KR"; rec.interimResults = false; rec.maxAlternatives = 1;
    btn.setAttribute("aria-pressed", "true"); btn.textContent = "듣는 중";
    const done = () => { btn.setAttribute("aria-pressed", "false"); btn.textContent = "🎤 음성"; };
    rec.onresult = (e) => {
      let t = e.results[0][0].transcript.trim();
      if (k === "part") t = cleanWords(t);
      const lim = LIMIT[k] || field.maxLength || 40;
      field.value = (field.value && k !== "part" ? field.value + " " + t : t).slice(0, lim);
      update();
    };
    rec.onerror = () => { say("음성을 알아듣지 못했습니다. 키보드 마이크를 써 보세요.", true); done(); };
    rec.onend = done;
    try { rec.start(); } catch (e) { done(); }
  }));

  // ===== 화면 갱신 =====
  let timer;
  function update(keepPhoto) {
    if (!tagsEdited) ui.tags.value = autoTags();
    drawChips(); counters(); saveS();
    if (source) mark();
    clearTimeout(timer);
    if (!keepPhoto) timer = setTimeout(render, 120);
  }
  ["site", "dong", "floor", "part", "reason", "problem", "advice", "to", "due", "author"].forEach((k) =>
    ui[k].addEventListener(ui[k].tagName === "SELECT" || k === "due" ? "change" : "input", () => update()));
  ui.part.addEventListener("blur", () => { ui.part.value = cleanWords(ui.part.value); update(); });
  ui.tags.addEventListener("input", () => { tagsEdited = ui.tags.value.trim() !== ""; saveS(); });
  ["autosave", "saveOrig", "clearAfter"].forEach((k) => ui[k].addEventListener("change", saveS));
  ui.hideSite.addEventListener("change", () => update());
  ui.size.addEventListener("input", () => { $("sizeVal").textContent = ui.size.value + "%"; update(); });
  saveBtn.addEventListener("click", save);
  shareBtn.addEventListener("click", share);
  if (navigator.canShare) shareBtn.hidden = false;

  // ===== 시작 =====
  ui.dong.value = S.dong || ""; ui.floor.value = S.floor || ""; ui.author.value = S.author || "";
  ui.autosave.checked = S.autosave !== false; ui.saveOrig.checked = S.saveOrig !== false;
  ui.clearAfter.checked = S.clearAfter !== false; ui.hideSite.checked = !!S.hideSite; ui.size.value = S.size || "3";
  $("sizeVal").textContent = ui.size.value + "%";
  fillSites(); showCount(); update();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
