(function () {
  // === 個人專屬密碼設定 ===
  // 修改下方字串即可更換您的網站進入密碼：
  const SITE_PASSWORD = "27001";
  const AUTH_STORAGE_KEY = "iso27001_site_unlocked_v1";

  const STORAGE_KEY = "iso27001_practice_state_v1";
  const allQuestions = window.ISO27001_QUESTIONS || [];
  const questionMap = {};
  allQuestions.forEach((q) => {
    questionMap[q.id] = q;
  });

  const defaultState = {
    theme: "dark",
    lastSequentialId: 1,
    studyMode: false,
    autoNext: false,
    records: {}, // qId -> { status: 'correct'|'wrong', attempts: 0, wrongCount: 0, lastSelected: [] }
    wrongIds: [],
    bookmarkIds: [],
    notes: {}, // qId -> string
    examHistory: [] // { id, date, modeName, total, correct, scorePct, scaledScore, passPct, passed, durationSec, wrongQIds }
  };

  let state = loadState();

  // Practice Runtime State
  let practiceQueue = allQuestions.map((q) => q.id);
  let practiceIndex = 0;
  let practiceModeName = "順序完整練習 (Q1 ~ Q418)";
  let practiceModeKey = "sequential";
  let currentPracticeSelected = new Set();
  let currentPracticeRevealed = false;

  // Exam Runtime State
  let activeExam = null; // { modeName, questions: [...], currentIndex, answers: {qId: Set}, flags: Set, totalSec, remainSec, passPct, paused, timerId, startTime, optionMap: {qId: [{displayKey, origKey, text}]} }
  let lastExamReport = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultState));
      const parsed = JSON.parse(raw);
      return Object.assign({}, defaultState, parsed);
    } catch (e) {
      return JSON.parse(JSON.stringify(defaultState));
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state:", e);
    }
  }

  function applyTheme() {
    if (state.theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
      document.getElementById("themeToggleBtn").innerHTML = "🌙 深色模式";
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.getElementById("themeToggleBtn").innerHTML = "☀️ 淺色模式";
    }
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function arraysEqualIgnoreOrder(a, b) {
    if (a.length !== b.length) return false;
    const sa = a.slice().sort();
    const sb = b.slice().sort();
    return sa.every((v, idx) => v === sb[idx]);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSubTypeLabel(q) {
    if (q.subType === "sequence") return "🔢 流程排序圖表題";
    if (q.subType === "matching") return "🔗 角色／條款配對圖表題";
    if (q.subType === "fill") return "✍️ 條款克漏字填空題";
    if (q.subType === "table") return "📋 表格判讀題";
    if (q.type === "multiple") return `☑️ 多選題 (應選 ${q.answer.length} 項)`;
    return "🔘 單選題";
  }

  function getSubTypeBadgeClass(q) {
    if (q.type === "interactive" || q.subType === "table") return "badge-purple";
    if (q.type === "multiple") return "badge-amber";
    return "badge-blue";
  }

  // ==================== DASHBOARD RENDERING ====================
  function renderDashboard() {
    const total = allQuestions.length;
    const answeredIds = Object.keys(state.records);
    const answeredCount = answeredIds.length;
    let correctCount = 0;
    let wrongStatusCount = 0;
    answeredIds.forEach((id) => {
      if (state.records[id].status === "correct") correctCount++;
      else wrongStatusCount++;
    });

    const progressPct = ((answeredCount / total) * 100).toFixed(1);
    const accuracyPct = answeredCount > 0 ? ((correctCount / answeredCount) * 100).toFixed(1) : "0.0";

    document.getElementById("continueQLabel").textContent = `#${state.lastSequentialId || 1}`;
    document.getElementById("statAnsweredCount").textContent = `${answeredCount} / ${total}`;
    document.getElementById("statProgressBar").style.width = `${progressPct}%`;
    document.getElementById("statProgressPct").textContent = `已完成 ${progressPct}% 題庫練習`;

    document.getElementById("statAccuracy").textContent = `${accuracyPct}%`;
    document.getElementById("statAccuracySub").textContent = `目前答對 ${correctCount} 題 / 答錯 ${wrongStatusCount} 題`;

    document.getElementById("statWrongCount").textContent = `${state.wrongIds.length} 題`;
    document.getElementById("statBookmarkCount").textContent = `${state.bookmarkIds.length} 題`;

    const unansweredCount = total - answeredCount;
    document.getElementById("cardUnansweredBadge").textContent = `${unansweredCount} 題`;

    // Exam stats
    const examCount = state.examHistory.length;
    document.getElementById("statExamCount").textContent = `${examCount} 次`;
    if (examCount > 0) {
      const passCount = state.examHistory.filter((e) => e.passed).length;
      const lastExam = state.examHistory[0];
      document.getElementById("statExamSub").textContent = `累計及格 ${passCount} 次｜最近一次：${lastExam.scorePct}% (${lastExam.passed ? "PASS" : "FAIL"})`;
    } else {
      document.getElementById("statExamSub").textContent = "尚無模擬考紀錄，點擊立即測驗";
    }

    // Render 6 Domain Cards
    const domains = [
      "不符合事項、矯正措施與持續改進",
      "資訊安全風險管理與適用性聲明 (SoA)",
      "稽核原則、方案規劃與認證流程",
      "ISMS 核心條款與管理系統要求 (Clauses 4-9)",
      "附錄 A 安全控制措施與實務 (Annex A)",
      "執行稽核、取證與面談實務"
    ];

    const container = document.getElementById("domainCardsContainer");
    container.innerHTML = domains
      .map((dom) => {
        const domQs = allQuestions.filter((q) => q.domain === dom);
        const domDone = domQs.filter((q) => state.records[q.id]).length;
        const domCorrect = domQs.filter((q) => state.records[q.id] && state.records[q.id].status === "correct").length;
        const domPct = domQs.length > 0 ? Math.round((domDone / domQs.length) * 100) : 0;
        const domAcc = domDone > 0 ? Math.round((domCorrect / domDone) * 100) : 0;
        return `
        <div class="mode-card" onclick="app.startDomainPractice('${escapeHtml(dom)}')">
          <div>
            <div class="mode-card-header">
              <div class="mode-card-title">${escapeHtml(dom)}</div>
              <span class="badge badge-blue">${domQs.length} 題</span>
            </div>
            <div class="mode-card-desc">
              已完成：<strong>${domDone} / ${domQs.length}</strong> (${domPct}%) ｜ 正確率：<strong>${domAcc}%</strong>
              <div class="progress-bar-track" style="margin-top:10px;">
                <div class="progress-bar-fill" style="width:${domPct}%"></div>
              </div>
            </div>
          </div>
          <div class="mode-card-footer">
            <span>點擊進行本領域專項練習</span>
            <span>進入練習 →</span>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // ==================== PRACTICE ENGINE ====================
  function startPracticeMode(modeKey, customIds, customTitle) {
    practiceModeKey = modeKey;
    if (customIds && customIds.length > 0) {
      practiceQueue = customIds.slice();
      practiceModeName = customTitle || `篩選專項練習 (${practiceQueue.length} 題)`;
      practiceIndex = 0;
    } else if (modeKey === "sequential") {
      practiceQueue = allQuestions.map((q) => q.id);
      practiceModeName = "📖 順序完整練習 (Q1 ~ Q418)";
      const savedIdx = practiceQueue.indexOf(state.lastSequentialId || 1);
      practiceIndex = savedIdx >= 0 ? savedIdx : 0;
    } else if (modeKey === "random") {
      practiceQueue = shuffleArray(allQuestions.map((q) => q.id));
      practiceModeName = "🎲 全題庫隨機刷題 (418 題)";
      practiceIndex = 0;
    } else if (modeKey === "unanswered") {
      const unans = allQuestions.filter((q) => !state.records[q.id]).map((q) => q.id);
      if (unans.length === 0) {
        alert("🎉 恭喜！您已經完成全部 418 道題目的作答！");
        return;
      }
      practiceQueue = unans;
      practiceModeName = `🆕 未作答題目專練 (${unans.length} 題)`;
      practiceIndex = 0;
    } else if (modeKey === "multiple") {
      practiceQueue = allQuestions.filter((q) => q.type === "multiple").map((q) => q.id);
      practiceModeName = `☑️ 多選題高分特訓 (${practiceQueue.length} 題)`;
      practiceIndex = 0;
    } else if (modeKey === "interactive") {
      practiceQueue = allQuestions
        .filter((q) => q.type === "interactive" || q.subType === "table")
        .map((q) => q.id);
      practiceModeName = `🧩 圖表／排序／配對／填空專練 (${practiceQueue.length} 題)`;
      practiceIndex = 0;
    } else if (modeKey === "scenario") {
      practiceQueue = allQuestions.filter((q) => q.isScenario).map((q) => q.id);
      practiceModeName = `🏢 稽核實務情境案例題專練 (${practiceQueue.length} 題)`;
      practiceIndex = 0;
    } else if (modeKey === "wrong") {
      if (state.wrongIds.length === 0) {
        alert("目前錯題本沒有題目！答錯的題目會自動收錄至此。");
        return;
      }
      practiceQueue = state.wrongIds.slice();
      practiceModeName = `❌ 錯題本複習專練 (${practiceQueue.length} 題)`;
      practiceIndex = 0;
    } else if (modeKey === "bookmark") {
      if (state.bookmarkIds.length === 0) {
        alert("目前收藏夾沒有題目！您可在練習時點擊「☆ 收藏題目」加入重點題。");
        return;
      }
      practiceQueue = state.bookmarkIds.slice();
      practiceModeName = `⭐ 重點收藏夾複習 (${practiceQueue.length} 題)`;
      practiceIndex = 0;
    }

    switchView("practice", true);
    renderPracticeQuestion();
  }

  function startDomainPractice(domainName) {
    const ids = allQuestions.filter((q) => q.domain === domainName).map((q) => q.id);
    startPracticeMode("domain", ids, `📚 領域專練：${domainName} (${ids.length} 題)`);
  }

  function renderPracticeQuestion() {
    if (!practiceQueue || practiceQueue.length === 0) return;
    if (practiceIndex < 0) practiceIndex = 0;
    if (practiceIndex >= practiceQueue.length) practiceIndex = practiceQueue.length - 1;

    const qId = practiceQueue[practiceIndex];
    const q = questionMap[qId];
    if (practiceModeKey === "sequential") {
      state.lastSequentialId = qId;
      saveState();
    }

    currentPracticeSelected = new Set();
    currentPracticeRevealed = Boolean(state.studyMode);

    document.getElementById("practiceModeTitle").textContent = practiceModeName;
    document.getElementById("studyModeToggle").checked = Boolean(state.studyMode);
    document.getElementById("autoNextToggle").checked = Boolean(state.autoNext);
    document.getElementById("jumpQInput").value = qId;

    // Top badges
    const metaHtml = [
      `<span class="q-number-badge">QUESTION NO: ${q.id}</span>`,
      `<span class="badge ${getSubTypeBadgeClass(q)}">${escapeHtml(getSubTypeLabel(q))}</span>`,
      `<span class="badge badge-green">${escapeHtml(q.domain)}</span>`,
      q.isScenario ? `<span class="badge badge-amber">🏢 情境案例</span>` : "",
      `<span class="badge" style="background:var(--bg-tertiary); color:var(--text-secondary);">PDF 第 ${q.pages.join("-")} 頁</span>`
    ].join("");
    document.getElementById("practiceMetaBadges").innerHTML = metaHtml;

    // Bookmark & Wrong buttons
    const isBookmarked = state.bookmarkIds.includes(q.id);
    const bmBtn = document.getElementById("practiceBookmarkBtn");
    bmBtn.innerHTML = isBookmarked ? "⭐ 已收藏 (F)" : "☆ 收藏題目 (F)";
    bmBtn.style.borderColor = isBookmarked ? "var(--warning)" : "";
    bmBtn.style.color = isBookmarked ? "var(--warning)" : "";

    const isWrong = state.wrongIds.includes(q.id);
    const rmWrongBtn = document.getElementById("practiceRemoveWrongBtn");
    rmWrongBtn.style.display = isWrong ? "inline-flex" : "none";

    // Stem
    document.getElementById("practiceQuestionStem").textContent = q.question;

    // Question Images
    const qImgBox = document.getElementById("practiceQuestionImages");
    if (q.questionImages && q.questionImages.length > 0) {
      qImgBox.innerHTML = q.questionImages
        .map(
          (src, idx) => `
        <div class="exam-figure-wrapper">
          <div class="exam-figure-caption">📌 原題附圖 ${idx + 1}（點擊圖片可放大檢視）</div>
          <img src="${src}" class="exam-figure-img" alt="Question Figure" onclick="app.openLightbox('${src}')" />
        </div>
      `
        )
        .join("");
    } else {
      qImgBox.innerHTML = "";
    }

    renderPracticeOptionsAndExplanation(q);
    renderPracticePalette();
  }

  function renderPracticeOptionsAndExplanation(q) {
    const optContainer = document.getElementById("practiceOptionsList");
    const keys = Object.keys(q.options);
    const correctSet = new Set(q.answer);

    optContainer.innerHTML = keys
      .map((key, idx) => {
        let cls = "option-item";
        const isSelected = currentPracticeSelected.has(key);
        const isCorrect = correctSet.has(key);

        if (currentPracticeRevealed) {
          if (isCorrect && isSelected) cls += " correct";
          else if (isCorrect && !isSelected) cls += state.studyMode ? " correct" : " missed-correct";
          else if (!isCorrect && isSelected) cls += " wrong";
        } else if (isSelected) {
          cls += " selected";
        }

        const kbdNum = idx < 9 ? `<span class="kbd-hint" style="margin-left:auto;">${idx + 1}</span>` : "";
        return `
        <div class="${cls}" onclick="app.selectPracticeOption('${key}')">
          <div class="option-key">${key}</div>
          <div class="option-text">${escapeHtml(q.options[key])}</div>
          ${kbdNum}
        </div>
      `;
      })
      .join("");

    const expPanel = document.getElementById("practiceExplanationPanel");
    if (currentPracticeRevealed) {
      expPanel.style.display = "block";
      const selectedArr = Array.from(currentPracticeSelected).sort();
      const isAllCorrect = arraysEqualIgnoreOrder(selectedArr, q.answer);

      const banner = document.getElementById("practiceResultBanner");
      if (state.studyMode && selectedArr.length === 0) {
        banner.innerHTML = `<span style="color:var(--accent-primary);">💡 背題速覽模式</span>`;
      } else if (isAllCorrect) {
        banner.innerHTML = `<span style="color:var(--success);">✅ 回答正確！（您的選擇：${selectedArr.join(", ")}）</span>`;
      } else {
        banner.innerHTML = `<span style="color:var(--danger);">❌ 回答錯誤（您的選擇：${selectedArr.join(", ") || "未作答"}）</span>`;
      }

      document.getElementById("practiceCorrectAnsBadge").textContent = `正確答案：${q.answer.join(" ")}`;

      // Answer images
      const aImgBox = document.getElementById("practiceAnswerImages");
      if (q.answerImages && q.answerImages.length > 0) {
        aImgBox.innerHTML = q.answerImages
          .map(
            (src, idx) => `
          <div class="exam-figure-wrapper">
            <div class="exam-figure-caption">✅ 官方標準解答原圖 ${idx + 1}（點擊圖片可放大檢視）</div>
            <img src="${src}" class="exam-figure-img" alt="Answer Figure" onclick="app.openLightbox('${src}')" />
          </div>
        `
          )
          .join("");
      } else {
        aImgBox.innerHTML = "";
      }

      document.getElementById("practiceExplanationText").textContent = q.explanation;
      document.getElementById("practiceNoteInput").value = state.notes[q.id] || "";
      document.getElementById("noteSavedStatus").textContent = "";
    } else {
      expPanel.style.display = "none";
    }
  }

  function selectPracticeOption(key) {
    if (currentPracticeRevealed && !state.studyMode) return;
    const qId = practiceQueue[practiceIndex];
    const q = questionMap[qId];

    if (q.answer.length === 1) {
      currentPracticeSelected.clear();
      currentPracticeSelected.add(key);
      // Single choice: immediately verify in practice mode
      submitPracticeAnswer();
    } else {
      if (currentPracticeSelected.has(key)) {
        currentPracticeSelected.delete(key);
      } else {
        currentPracticeSelected.add(key);
      }
      renderPracticeOptionsAndExplanation(q);
    }
  }

  function submitPracticeAnswer() {
    const qId = practiceQueue[practiceIndex];
    const q = questionMap[qId];
    if (currentPracticeSelected.size === 0) {
      revealPracticeAnswer();
      return;
    }

    const selectedArr = Array.from(currentPracticeSelected).sort();
    const isCorrect = arraysEqualIgnoreOrder(selectedArr, q.answer);

    const prevRec = state.records[qId] || { attempts: 0, wrongCount: 0 };
    state.records[qId] = {
      status: isCorrect ? "correct" : "wrong",
      attempts: (prevRec.attempts || 0) + 1,
      wrongCount: (prevRec.wrongCount || 0) + (isCorrect ? 0 : 1),
      lastSelected: selectedArr,
      lastTime: Date.now()
    };

    if (!isCorrect && !state.wrongIds.includes(qId)) {
      state.wrongIds.push(qId);
    }

    saveState();
    currentPracticeRevealed = true;
    renderPracticeOptionsAndExplanation(q);
    renderPracticePalette();

    const rmWrongBtn = document.getElementById("practiceRemoveWrongBtn");
    rmWrongBtn.style.display = state.wrongIds.includes(q.id) ? "inline-flex" : "none";

    if (isCorrect && state.autoNext && practiceIndex < practiceQueue.length - 1) {
      setTimeout(() => {
        nextPracticeQuestion();
      }, 650);
    }
  }

  function revealPracticeAnswer() {
    const qId = practiceQueue[practiceIndex];
    const q = questionMap[qId];
    currentPracticeRevealed = true;
    renderPracticeOptionsAndExplanation(q);
  }

  function prevPracticeQuestion() {
    if (practiceIndex > 0) {
      practiceIndex--;
      renderPracticeQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function nextPracticeQuestion() {
    if (practiceIndex < practiceQueue.length - 1) {
      practiceIndex++;
      renderPracticeQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function jumpToQuestionId() {
    const val = parseInt(document.getElementById("jumpQInput").value, 10);
    if (!val || val < 1 || val > allQuestions.length) return;
    const idx = practiceQueue.indexOf(val);
    if (idx >= 0) {
      practiceIndex = idx;
      renderPracticeQuestion();
    } else {
      // Switch to sequential mode at that question
      state.lastSequentialId = val;
      saveState();
      startPracticeMode("sequential");
    }
  }

  function renderPracticePalette() {
    document.getElementById("practicePaletteProgress").textContent = `${practiceIndex + 1} / ${practiceQueue.length}`;
    const grid = document.getElementById("practicePaletteGrid");
    grid.innerHTML = practiceQueue
      .map((qId, idx) => {
        let cls = "palette-btn";
        if (idx === practiceIndex) cls += " current";
        const rec = state.records[qId];
        if (rec) {
          cls += rec.status === "correct" ? " correct" : " wrong";
        }
        if (state.bookmarkIds.includes(qId)) {
          cls += " flagged";
        }
        return `<button class="${cls}" onclick="app.goToPracticeIndex(${idx})">${qId}</button>`;
      })
      .join("");
  }

  function goToPracticeIndex(idx) {
    practiceIndex = idx;
    renderPracticeQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleStudyMode(checked) {
    state.studyMode = Boolean(checked);
    saveState();
    currentPracticeRevealed = Boolean(state.studyMode);
    const qId = practiceQueue[practiceIndex];
    renderPracticeOptionsAndExplanation(questionMap[qId]);
  }

  function toggleAutoNext(checked) {
    state.autoNext = Boolean(checked);
    saveState();
  }

  function toggleBookmarkCurrent() {
    const qId = practiceQueue[practiceIndex];
    const idx = state.bookmarkIds.indexOf(qId);
    if (idx >= 0) {
      state.bookmarkIds.splice(idx, 1);
    } else {
      state.bookmarkIds.push(qId);
    }
    saveState();
    renderPracticeQuestion();
  }

  function removeCurrentFromWrong() {
    const qId = practiceQueue[practiceIndex];
    const idx = state.wrongIds.indexOf(qId);
    if (idx >= 0) {
      state.wrongIds.splice(idx, 1);
      saveState();
    }
    if (practiceModeKey === "wrong") {
      practiceQueue = state.wrongIds.slice();
      if (practiceQueue.length === 0) {
        alert("🎉 錯題本中的所有題目皆已移出！");
        switchView("dashboard");
        return;
      }
      if (practiceIndex >= practiceQueue.length) practiceIndex = practiceQueue.length - 1;
    }
    renderPracticeQuestion();
  }

  function saveCurrentNote(text) {
    const qId = practiceQueue[practiceIndex];
    if (text && text.trim()) {
      state.notes[qId] = text;
    } else {
      delete state.notes[qId];
    }
    saveState();
    const statusEl = document.getElementById("noteSavedStatus");
    statusEl.textContent = "✓ 已自動儲存";
  }

  // ==================== MOCK EXAM ENGINE ====================
  function buildStratifiedPool(targetCount, preferScenario) {
    const singlePool = shuffleArray(allQuestions.filter((q) => q.type === "single" && !q.isScenario));
    const scenarioPool = shuffleArray(allQuestions.filter((q) => q.isScenario && q.type !== "interactive"));
    const multiPool = shuffleArray(allQuestions.filter((q) => q.type === "multiple" && !q.isScenario));
    const interactivePool = shuffleArray(allQuestions.filter((q) => q.type === "interactive"));

    let selected = [];
    if (preferScenario) {
      // IRCA 40-question style: ~55% scenario, ~25% multiple, ~20% interactive/single
      const nInteractive = Math.min(interactivePool.length, Math.round(targetCount * 0.15));
      const nScenario = Math.min(scenarioPool.length, Math.round(targetCount * 0.6));
      const nMulti = Math.min(multiPool.length, Math.round(targetCount * 0.15));
      selected = selected
        .concat(interactivePool.slice(0, nInteractive))
        .concat(scenarioPool.slice(0, nScenario))
        .concat(multiPool.slice(0, nMulti));
    } else {
      // PECB standard proportional distribution
      const ratio = targetCount / allQuestions.length;
      const nInteractive = Math.min(interactivePool.length, Math.max(2, Math.round(interactivePool.length * ratio)));
      const nScenario = Math.min(scenarioPool.length, Math.round(scenarioPool.length * ratio));
      const nMulti = Math.min(multiPool.length, Math.round(multiPool.length * ratio));
      selected = selected
        .concat(interactivePool.slice(0, nInteractive))
        .concat(scenarioPool.slice(0, nScenario))
        .concat(multiPool.slice(0, nMulti));
    }

    const usedIds = new Set(selected.map((q) => q.id));
    const remaining = shuffleArray(allQuestions.filter((q) => !usedIds.has(q.id)));
    while (selected.length < targetCount && remaining.length > 0) {
      selected.push(remaining.pop());
    }
    return shuffleArray(selected);
  }

  function startPresetExam(presetKey) {
    if (presetKey === "pecb_standard") {
      const qs = buildStratifiedPool(80, false);
      launchExam("PECB 官方標準全真模擬考 (80題 / 180分鐘)", qs, 180, 70, false);
    } else if (presetKey === "irca_scenario") {
      const qs = buildStratifiedPool(40, true);
      launchExam("CQI & IRCA 實務稽核情境模擬考 (40題 / 105分鐘)", qs, 105, 70, false);
    } else if (presetKey === "quick_sprint") {
      const qs = buildStratifiedPool(25, false);
      launchExam("考前快速衝刺模擬考 (25題 / 45分鐘)", qs, 45, 70, false);
    }
  }

  function startCustomExam() {
    const countInput = parseInt(document.getElementById("customExamCount").value, 10) || 50;
    const minutesInput = parseInt(document.getElementById("customExamMinutes").value, 10);
    const passPct = parseInt(document.getElementById("customExamPassPct").value, 10) || 70;
    const source = document.getElementById("customExamSource").value;
    const shuffleOpts = document.getElementById("customExamShuffleOptions").checked;

    let pool = allQuestions.slice();
    if (source === "unanswered") {
      pool = allQuestions.filter((q) => !state.records[q.id]);
    } else if (source === "wrong") {
      pool = allQuestions.filter((q) => state.wrongIds.includes(q.id));
    } else if (source === "scenario") {
      pool = allQuestions.filter((q) => q.isScenario);
    } else if (source === "multiple") {
      pool = allQuestions.filter((q) => q.type === "multiple");
    } else if (source === "interactive") {
      pool = allQuestions.filter((q) => q.type === "interactive" || q.subType === "table");
    }

    if (pool.length === 0) {
      alert("所選題庫範圍目前沒有符合條件的題目，請更換出題範圍！");
      return;
    }

    const finalCount = Math.min(Math.max(1, countInput), pool.length);
    const selectedQs = shuffleArray(pool).slice(0, finalCount);
    const timeMin = isNaN(minutesInput) ? 90 : Math.max(0, minutesInput);
    launchExam(
      `自訂模擬考 (${finalCount}題 / ${timeMin > 0 ? timeMin + "分鐘" : "不限時"})`,
      selectedQs,
      timeMin,
      passPct,
      shuffleOpts
    );
  }

  function launchExam(modeName, questionsList, durationMinutes, passPct, shuffleOpts) {
    if (activeExam && activeExam.timerId) {
      clearInterval(activeExam.timerId);
    }

    const optionMap = {};
    questionsList.forEach((q) => {
      const origKeys = Object.keys(q.options);
      const orderKeys = shuffleOpts ? shuffleArray(origKeys) : origKeys;
      optionMap[q.id] = orderKeys.map((origKey, idx) => ({
        displayKey: origKeys[idx],
        origKey: origKey,
        text: q.options[origKey]
      }));
    });

    const totalSec = durationMinutes > 0 ? durationMinutes * 60 : 0;
    activeExam = {
      modeName,
      questions: questionsList,
      currentIndex: 0,
      answers: {}, // qId -> Set of origKeys
      flags: new Set(),
      totalSec,
      remainSec: totalSec,
      elapsedSec: 0,
      passPct,
      paused: false,
      timerId: null,
      optionMap
    };

    questionsList.forEach((q) => {
      activeExam.answers[q.id] = new Set();
    });

    document.getElementById("exam-lobby").style.display = "none";
    document.getElementById("exam-report").style.display = "none";
    document.getElementById("exam-active").style.display = "block";
    document.getElementById("examModeNameLabel").textContent = modeName;

    updateExamTimerDisplay();
    activeExam.timerId = setInterval(() => {
      if (!activeExam || activeExam.paused) return;
      activeExam.elapsedSec++;
      if (activeExam.totalSec > 0) {
        activeExam.remainSec--;
        updateExamTimerDisplay();
        if (activeExam.remainSec <= 0) {
          clearInterval(activeExam.timerId);
          alert("⏰ 考試時間到！系統將自動為您交卷並計算成績。");
          finishAndGradeExam();
        }
      } else {
        updateExamTimerDisplay();
      }
    }, 1000);

    renderExamQuestion();
  }

  function formatTimeHMS(sec) {
    const s = Math.max(0, sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return [hrs, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
  }

  function updateExamTimerDisplay() {
    if (!activeExam) return;
    const el = document.getElementById("examTimerDisplay");
    if (activeExam.totalSec > 0) {
      el.textContent = formatTimeHMS(activeExam.remainSec);
      el.className = "timer-display";
      if (activeExam.remainSec <= 300) el.classList.add("danger");
      else if (activeExam.remainSec <= 900) el.classList.add("warning");
    } else {
      el.textContent = formatTimeHMS(activeExam.elapsedSec);
      el.className = "timer-display";
    }
  }

  function togglePauseExam() {
    if (!activeExam) return;
    activeExam.paused = !activeExam.paused;
    document.getElementById("examPauseBtn").innerHTML = activeExam.paused ? "▶️ 繼續計時" : "⏸️ 暫停計時";
  }

  function renderExamQuestion() {
    if (!activeExam) return;
    const idx = activeExam.currentIndex;
    const q = activeExam.questions[idx];
    const selectedOrigSet = activeExam.answers[q.id];

    const metaHtml = [
      `<span class="q-number-badge">第 ${idx + 1} / ${activeExam.questions.length} 題 (原題號 #${q.id})</span>`,
      `<span class="badge ${getSubTypeBadgeClass(q)}">${escapeHtml(getSubTypeLabel(q))}</span>`,
      `<span class="badge badge-green">${escapeHtml(q.domain)}</span>`,
      q.isScenario ? `<span class="badge badge-amber">🏢 情境案例</span>` : ""
    ].join("");
    document.getElementById("examMetaBadges").innerHTML = metaHtml;

    const isFlagged = activeExam.flags.has(q.id);
    const flagBtn = document.getElementById("examFlagBtn");
    flagBtn.innerHTML = isFlagged ? "🚩 已標記待查 (F)" : "🏳️ 標記待查 (F)";
    flagBtn.style.borderColor = isFlagged ? "var(--warning)" : "";
    flagBtn.style.color = isFlagged ? "var(--warning)" : "";

    document.getElementById("examQuestionStem").textContent = q.question;

    const qImgBox = document.getElementById("examQuestionImages");
    if (q.questionImages && q.questionImages.length > 0) {
      qImgBox.innerHTML = q.questionImages
        .map(
          (src, i) => `
        <div class="exam-figure-wrapper">
          <div class="exam-figure-caption">📌 考題附圖 ${i + 1}（點擊圖片可放大檢視）</div>
          <img src="${src}" class="exam-figure-img" alt="Exam Figure" onclick="app.openLightbox('${src}')" />
        </div>
      `
        )
        .join("");
    } else {
      qImgBox.innerHTML = "";
    }

    const mappedOpts = activeExam.optionMap[q.id];
    document.getElementById("examOptionsList").innerHTML = mappedOpts
      .map((item, i) => {
        const isSel = selectedOrigSet.has(item.origKey);
        const kbdNum = i < 9 ? `<span class="kbd-hint" style="margin-left:auto;">${i + 1}</span>` : "";
        return `
        <div class="option-item ${isSel ? "selected" : ""}" onclick="app.selectExamOption('${item.origKey}')">
          <div class="option-key">${item.displayKey}</div>
          <div class="option-text">${escapeHtml(item.text)}</div>
          ${kbdNum}
        </div>
      `;
      })
      .join("");

    renderExamPalette();
  }

  function selectExamOption(origKey) {
    if (!activeExam) return;
    const q = activeExam.questions[activeExam.currentIndex];
    const selSet = activeExam.answers[q.id];

    if (q.answer.length === 1) {
      selSet.clear();
      selSet.add(origKey);
    } else {
      if (selSet.has(origKey)) {
        selSet.delete(origKey);
      } else {
        selSet.add(origKey);
      }
    }
    renderExamQuestion();
  }

  function toggleExamFlagCurrent() {
    if (!activeExam) return;
    const q = activeExam.questions[activeExam.currentIndex];
    if (activeExam.flags.has(q.id)) activeExam.flags.delete(q.id);
    else activeExam.flags.add(q.id);
    renderExamQuestion();
  }

  function prevExamQuestion() {
    if (!activeExam) return;
    if (activeExam.currentIndex > 0) {
      activeExam.currentIndex--;
      renderExamQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function nextExamQuestion() {
    if (!activeExam) return;
    if (activeExam.currentIndex < activeExam.questions.length - 1) {
      activeExam.currentIndex++;
      renderExamQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goToExamIndex(idx) {
    if (!activeExam) return;
    activeExam.currentIndex = idx;
    renderExamQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderExamPalette() {
    if (!activeExam) return;
    let answeredCount = 0;
    activeExam.questions.forEach((q) => {
      if (activeExam.answers[q.id].size > 0) answeredCount++;
    });

    document.getElementById("examAnsweredCountLabel").textContent = `${answeredCount} / ${activeExam.questions.length}`;
    document.getElementById("examFlaggedCountLabel").textContent = `${activeExam.flags.size}`;

    document.getElementById("examPaletteGrid").innerHTML = activeExam.questions
      .map((q, idx) => {
        let cls = "palette-btn";
        if (idx === activeExam.currentIndex) cls += " current";
        if (activeExam.answers[q.id].size > 0) cls += " answered";
        if (activeExam.flags.has(q.id)) cls += " flagged";
        return `<button class="${cls}" onclick="app.goToExamIndex(${idx})">${idx + 1}</button>`;
      })
      .join("");
  }

  function abortExam() {
    if (!confirm("確定要放棄本次模擬考嗎？目前的作答進度將不會計入成績。")) return;
    if (activeExam && activeExam.timerId) clearInterval(activeExam.timerId);
    activeExam = null;
    backToExamLobby();
  }

  function confirmSubmitExam() {
    if (!activeExam) return;
    let unanswered = 0;
    activeExam.questions.forEach((q) => {
      if (activeExam.answers[q.id].size === 0) unanswered++;
    });
    const flagged = activeExam.flags.size;
    let msg = "確定要正式交卷並計算模擬考成績嗎？";
    if (unanswered > 0 || flagged > 0) {
      msg = `⚠️ 提醒您：目前還有 ${unanswered} 題尚未作答、${flagged} 題標記待查。\n\n確定要現在交卷評分嗎？`;
    }
    if (!confirm(msg)) return;
    finishAndGradeExam();
  }

  function finishAndGradeExam() {
    if (!activeExam) return;
    if (activeExam.timerId) clearInterval(activeExam.timerId);

    const total = activeExam.questions.length;
    let correct = 0;
    const wrongQIds = [];
    const domainStats = {};
    const typeStats = {
      single: { label: "🔘 單選題", total: 0, correct: 0 },
      multiple: { label: "☑️ 多選題", total: 0, correct: 0 },
      interactive: { label: "🧩 圖表／配對／排序／填空題", total: 0, correct: 0 },
      scenario: { label: "🏢 稽核實務情境案例題", total: 0, correct: 0 }
    };

    const reviewItems = activeExam.questions.map((q, idx) => {
      const userOrigArr = Array.from(activeExam.answers[q.id]).sort();
      const isCorrect = arraysEqualIgnoreOrder(userOrigArr, q.answer);
      if (isCorrect) {
        correct++;
      } else {
        wrongQIds.push(q.id);
        if (!state.wrongIds.includes(q.id)) {
          state.wrongIds.push(q.id);
        }
      }

      // Update global practice record as well
      const prevRec = state.records[q.id] || { attempts: 0, wrongCount: 0 };
      state.records[q.id] = {
        status: isCorrect ? "correct" : "wrong",
        attempts: (prevRec.attempts || 0) + 1,
        wrongCount: (prevRec.wrongCount || 0) + (isCorrect ? 0 : 1),
        lastSelected: userOrigArr,
        lastTime: Date.now()
      };

      // Domain stats
      if (!domainStats[q.domain]) {
        domainStats[q.domain] = { total: 0, correct: 0 };
      }
      domainStats[q.domain].total++;
      if (isCorrect) domainStats[q.domain].correct++;

      // Type stats
      if (q.type === "interactive" || q.subType === "table") {
        typeStats.interactive.total++;
        if (isCorrect) typeStats.interactive.correct++;
      } else if (q.type === "multiple") {
        typeStats.multiple.total++;
        if (isCorrect) typeStats.multiple.correct++;
      } else {
        typeStats.single.total++;
        if (isCorrect) typeStats.single.correct++;
      }

      if (q.isScenario) {
        typeStats.scenario.total++;
        if (isCorrect) typeStats.scenario.correct++;
      }

      return {
        examIndex: idx + 1,
        question: q,
        userAnswer: userOrigArr,
        isCorrect,
        isFlagged: activeExam.flags.has(q.id)
      };
    });

    const scorePct = Number(((correct / total) * 100).toFixed(1));
    const scaledScore = Math.round(scorePct * 10); // 1000-point scale
    const passed = scorePct >= activeExam.passPct;

    const historyEntry = {
      id: Date.now(),
      date: new Date().toLocaleString("zh-TW", { hour12: false }),
      modeName: activeExam.modeName,
      total,
      correct,
      scorePct,
      scaledScore,
      passPct: activeExam.passPct,
      passed,
      durationSec: activeExam.elapsedSec,
      wrongQIds
    };

    state.examHistory.unshift(historyEntry);
    if (state.examHistory.length > 50) state.examHistory.pop();
    saveState();

    lastExamReport = {
      summary: historyEntry,
      domainStats,
      typeStats,
      reviewItems
    };

    activeExam = null;
    renderExamReport("all");
  }

  function renderExamReport(filterMode) {
    if (!lastExamReport) return;
    document.getElementById("exam-lobby").style.display = "none";
    document.getElementById("exam-active").style.display = "none";
    document.getElementById("exam-report").style.display = "block";

    const s = lastExamReport.summary;
    const hero = document.getElementById("examReportHero");
    hero.className = `report-hero ${s.passed ? "pass" : "fail"}`;
    hero.innerHTML = `
      <span class="badge ${s.passed ? "badge-green" : "badge-red"}" style="font-size:15px; padding:6px 16px;">
        ${s.passed ? "🎉 CONGRATULATIONS — 通過 ISO/IEC 27001 模擬認證考試 (PASS)" : "⚠️ 未達及格標準 — 建議針對弱點領域加強複習 (FAIL)"}
      </span>
      <div class="report-score-big" style="color:${s.passed ? "var(--success)" : "var(--danger)"}">
        ${s.scorePct}% <span style="font-size:22px; color:var(--text-secondary);">(${s.scaledScore} / 1000 分)</span>
      </div>
      <div style="font-size:15px; color:var(--text-secondary);">
        考試模式：<strong>${escapeHtml(s.modeName)}</strong> ｜ 答對題數：<strong>${s.correct} / ${s.total} 題</strong> ｜ 及格門檻：<strong>${s.passPct}% (${s.passPct * 10}分)</strong> ｜ 作答耗時：<strong>${formatTimeHMS(s.durationSec)}</strong>
      </div>
    `;

    // Domain Breakdown
    const domContainer = document.getElementById("examDomainBreakdown");
    domContainer.innerHTML = Object.keys(lastExamReport.domainStats)
      .map((dom) => {
        const d = lastExamReport.domainStats[dom];
        const pct = Math.round((d.correct / d.total) * 100);
        const color = pct >= s.passPct ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
        return `
        <div style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span>${escapeHtml(dom)}</span>
            <strong style="color:${color}">${d.correct} / ${d.total} (${pct}%)</strong>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${pct}%; background-color:${color};"></div>
          </div>
        </div>
      `;
      })
      .join("");

    // Type Breakdown
    const typeContainer = document.getElementById("examTypeBreakdown");
    typeContainer.innerHTML = Object.keys(lastExamReport.typeStats)
      .map((k) => {
        const t = lastExamReport.typeStats[k];
        if (t.total === 0) return "";
        const pct = Math.round((t.correct / t.total) * 100);
        const color = pct >= s.passPct ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
        return `
        <div style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span>${t.label}</span>
            <strong style="color:${color}">${t.correct} / ${t.total} (${pct}%)</strong>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${pct}%; background-color:${color};"></div>
          </div>
        </div>
      `;
      })
      .join("");

    filterExamReview(filterMode || "all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function filterExamReview(mode) {
    if (!lastExamReport) return;
    let items = lastExamReport.reviewItems;
    if (mode === "wrong") {
      items = items.filter((it) => !it.isCorrect);
    } else if (mode === "flagged") {
      items = items.filter((it) => it.isFlagged);
    }

    const listEl = document.getElementById("examReviewList");
    if (items.length === 0) {
      listEl.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-muted);">沒有符合此篩選條件的題目。</div>`;
      return;
    }

    listEl.innerHTML = items
      .map((it) => {
        const q = it.question;
        const correctSet = new Set(q.answer);
        const userSet = new Set(it.userAnswer);

        const optsHtml = Object.keys(q.options)
          .map((k) => {
            const isC = correctSet.has(k);
            const isU = userSet.has(k);
            let style = "padding:8px 12px; border-radius:6px; font-size:14px; margin-bottom:6px; border:1px solid var(--border-color);";
            let tag = "";
            if (isC && isU) {
              style += "background:var(--success-soft); border-color:var(--success);";
              tag = " ✅ (您的選擇・正確)";
            } else if (isC && !isU) {
              style += "background:var(--warning-soft); border-color:var(--warning);";
              tag = " 💡 (應選正解)";
            } else if (!isC && isU) {
              style += "background:var(--danger-soft); border-color:var(--danger);";
              tag = " ❌ (誤選)";
            }
            return `<div style="${style}"><strong>${k}.</strong> ${escapeHtml(q.options[k])} <strong>${tag}</strong></div>`;
          })
          .join("");

        const qImgsHtml = (q.questionImages || [])
          .map(
            (src) =>
              `<div class="exam-figure-wrapper" style="margin:10px 0;"><img src="${src}" class="exam-figure-img" onclick="app.openLightbox('${src}')" /></div>`
          )
          .join("");

        const aImgsHtml = (q.answerImages || [])
          .map(
            (src) =>
              `<div class="exam-figure-wrapper" style="margin:10px 0;"><div class="exam-figure-caption">官方解答圖表</div><img src="${src}" class="exam-figure-img" onclick="app.openLightbox('${src}')" /></div>`
          )
          .join("");

        return `
        <div class="question-panel" style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <span class="q-number-badge">第 ${it.examIndex} 題 (題庫 #${q.id})</span>
              <span class="badge ${it.isCorrect ? "badge-green" : "badge-red"}">${it.isCorrect ? "✅ 答對" : "❌ 答錯"}</span>
              ${it.isFlagged ? `<span class="badge badge-amber">🚩 標記待查</span>` : ""}
              <span class="badge ${getSubTypeBadgeClass(q)}">${escapeHtml(getSubTypeLabel(q))}</span>
              <span class="badge badge-blue">${escapeHtml(q.domain)}</span>
            </div>
            <button class="icon-btn" onclick="app.openQuestionInPractice(${q.id})">✍️ 前往練習頁檢視</button>
          </div>
          <div class="question-stem" style="font-size:15px;">${escapeHtml(q.question)}</div>
          ${qImgsHtml}
          <div style="margin:14px 0;">${optsHtml}</div>
          <div class="explanation-panel" style="margin-top:12px;">
            <div style="font-weight:700; margin-bottom:8px; color:var(--accent-primary);">
              正確答案：${q.answer.join(" ")} ｜ 您的作答：${it.userAnswer.join(" ") || "未作答"}
            </div>
            ${aImgsHtml}
            <div class="explanation-body">${escapeHtml(q.explanation)}</div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  function retakeExamWrongQuestions() {
    if (!lastExamReport || !lastExamReport.summary.wrongQIds.length) {
      alert("🎉 您在本次模擬考全對，沒有錯題需要重測！");
      return;
    }
    startPracticeMode(
      "custom_exam_wrong",
      lastExamReport.summary.wrongQIds,
      `🔄 模擬考錯題專練 (${lastExamReport.summary.wrongQIds.length} 題)`
    );
  }

  function backToExamLobby() {
    document.getElementById("exam-active").style.display = "none";
    document.getElementById("exam-report").style.display = "none";
    document.getElementById("exam-lobby").style.display = "block";
    renderExamHistory();
  }

  function renderExamHistory() {
    const container = document.getElementById("examHistoryContainer");
    if (!state.examHistory || state.examHistory.length === 0) {
      container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">尚無模擬考紀錄，立即選擇上方任一方案開始您的第一次模擬考！</div>`;
      return;
    }

    container.innerHTML = state.examHistory
      .map(
        (h) => `
      <div class="explorer-item" style="cursor:default;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
            <span class="badge ${h.passed ? "badge-green" : "badge-red"}">${h.passed ? "PASS 通過" : "FAIL 未通過"}</span>
            <strong>${escapeHtml(h.modeName)}</strong>
            <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(h.date)}</span>
          </div>
          <div style="font-size:13px; color:var(--text-secondary);">
            得分：<strong style="color:${h.passed ? "var(--success)" : "var(--danger)"}">${h.scorePct}% (${h.scaledScore} / 1000 分)</strong> ｜ 答對：${h.correct} / ${h.total} 題 ｜ 用時：${formatTimeHMS(h.durationSec)}
          </div>
        </div>
        ${
          h.wrongQIds && h.wrongQIds.length > 0
            ? `<button class="btn btn-outline" style="padding:6px 12px; font-size:12px;" onclick="app.startPracticeMode('exam_wrong_hist', [${h.wrongQIds.join(",")}], '模擬考錯題複習 (${h.wrongQIds.length}題)')">複習本次錯題 (${h.wrongQIds.length})</button>`
            : `<span class="badge badge-green">滿分全對</span>`
        }
      </div>
    `
      )
      .join("");
  }

  function clearExamHistory() {
    if (!confirm("確定要清除所有歷史模擬考紀錄嗎？")) return;
    state.examHistory = [];
    saveState();
    renderExamHistory();
    renderDashboard();
  }

  // ==================== QUESTION EXPLORER ====================
  function getFilteredExplorerQuestions() {
    const keyword = (document.getElementById("explorerSearchInput").value || "").trim().toLowerCase();
    const statusFilter = document.getElementById("explorerStatusFilter").value;
    const typeFilter = document.getElementById("explorerTypeFilter").value;
    const domainFilter = document.getElementById("explorerDomainFilter").value;

    return allQuestions.filter((q) => {
      if (statusFilter === "wrong" && !state.wrongIds.includes(q.id)) return false;
      if (statusFilter === "bookmark" && !state.bookmarkIds.includes(q.id)) return false;
      if (statusFilter === "noted" && !state.notes[q.id]) return false;
      if (statusFilter === "unanswered" && state.records[q.id]) return false;
      if (statusFilter === "correct" && (!state.records[q.id] || state.records[q.id].status !== "correct"))
        return false;

      if (typeFilter === "single" && q.type !== "single") return false;
      if (typeFilter === "multiple" && q.type !== "multiple") return false;
      if (typeFilter === "interactive" && q.type !== "interactive" && q.subType !== "table") return false;
      if (typeFilter === "scenario" && !q.isScenario) return false;

      if (domainFilter !== "all" && q.domain !== domainFilter) return false;

      if (keyword) {
        if (`#${q.id}` === keyword || String(q.id) === keyword) return true;
        const hay = [
          q.id,
          q.question,
          Object.values(q.options).join(" "),
          q.explanation,
          state.notes[q.id] || ""
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
  }

  function renderExplorer() {
    const filtered = getFilteredExplorerQuestions();
    document.getElementById("explorerCountBadge").textContent = filtered.length;

    const listEl = document.getElementById("explorerResultsList");
    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-muted);">找不到符合篩選條件的題目。</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((q) => {
        const rec = state.records[q.id];
        const isBm = state.bookmarkIds.includes(q.id);
        const isWr = state.wrongIds.includes(q.id);
        const hasNote = Boolean(state.notes[q.id]);
        const preview = q.question.length > 135 ? q.question.slice(0, 135) + "..." : q.question;

        return `
        <div class="explorer-item" onclick="app.openQuestionInPractice(${q.id})">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
              <span class="q-number-badge">#${q.id}</span>
              <span class="badge ${getSubTypeBadgeClass(q)}">${escapeHtml(getSubTypeLabel(q))}</span>
              <span class="badge badge-green">${escapeHtml(q.domain)}</span>
              ${isWr ? `<span class="badge badge-red">❌ 錯題本</span>` : ""}
              ${isBm ? `<span class="badge badge-amber">⭐ 已收藏</span>` : ""}
              ${hasNote ? `<span class="badge badge-purple">📝 有筆記</span>` : ""}
              ${
                rec
                  ? `<span class="badge ${rec.status === "correct" ? "badge-green" : "badge-red"}">${
                      rec.status === "correct" ? "✓ 已答對" : "✗ 曾答錯"
                    }</span>`
                  : ""
              }
            </div>
            <div style="font-size:14px; color:var(--text-primary);">${escapeHtml(preview)}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px; min-width:85px;">
            <span class="badge badge-blue">答案: ${q.answer.join(" ")}</span>
            <span style="font-size:12px; color:var(--text-muted);">PDF p.${q.pages[0]}</span>
          </div>
        </div>
      `;
      })
      .join("");
  }

  function practiceFilteredExplorer() {
    const filtered = getFilteredExplorerQuestions();
    if (filtered.length === 0) {
      alert("目前篩選結果為 0 題，請調整篩選條件！");
      return;
    }
    startPracticeMode(
      "explorer_filtered",
      filtered.map((q) => q.id),
      `🔍 檢索篩選練習 (${filtered.length} 題)`
    );
  }

  function openQuestionInPractice(qId) {
    const idx = practiceQueue.indexOf(qId);
    if (idx >= 0) {
      practiceIndex = idx;
      switchView("practice", true);
      renderPracticeQuestion();
    } else {
      state.lastSequentialId = qId;
      saveState();
      startPracticeMode("sequential");
    }
  }

  // ==================== VIEW NAVIGATION & UTILITIES ====================
  function switchView(viewName, skipPracticeInit) {
    if (activeExam && viewName !== "exam") {
      if (!confirm("您目前正在進行線上模擬考，切換頁面將暫停計時。確定要切換嗎？")) {
        return;
      }
      activeExam.paused = true;
    }

    document.querySelectorAll(".view-section").forEach((sec) => sec.classList.remove("active"));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
    });

    if (viewName === "dashboard") {
      renderDashboard();
    } else if (viewName === "practice" && !skipPracticeInit) {
      renderPracticeQuestion();
    } else if (viewName === "exam") {
      if (!activeExam && !lastExamReport) {
        backToExamLobby();
      } else if (!activeExam && lastExamReport) {
        backToExamLobby();
      }
    } else if (viewName === "explorer") {
      renderExplorer();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function continueSequentialPractice() {
    startPracticeMode("sequential");
  }

  function toggleTheme() {
    state.theme = state.theme === "light" ? "dark" : "light";
    saveState();
    applyTheme();
  }

  function resetPracticeStats() {
    if (!confirm("確定要重置作答進度統計嗎？（您的「重點收藏夾」與「個人筆記」將會保留）")) return;
    state.records = {};
    state.wrongIds = [];
    state.lastSequentialId = 1;
    saveState();
    renderDashboard();
  }

  function exportProgress() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `ISO27001_練習站備份_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importProgress(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const imported = JSON.parse(e.target.result);
        state = Object.assign({}, defaultState, imported);
        saveState();
        applyTheme();
        renderDashboard();
        alert("✅ 學習紀錄、錯題本與個人筆記匯入成功！");
      } catch (err) {
        alert("❌ 備份檔案格式不正確，無法匯入。");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function openLightbox(src) {
    const modal = document.getElementById("lightboxModal");
    const img = document.getElementById("lightboxImage");
    img.src = src;
    modal.classList.add("open");
  }

  function closeLightbox() {
    document.getElementById("lightboxModal").classList.remove("open");
  }

  // Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    const authOverlay = document.getElementById("authOverlay");
    if (authOverlay && !authOverlay.classList.contains("hidden")) return;

    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "Escape") {
      closeLightbox();
      return;
    }

    const practiceVisible = document.getElementById("view-practice").classList.contains("active");
    const examVisible =
      document.getElementById("view-exam").classList.contains("active") &&
      document.getElementById("exam-active").style.display !== "none";

    if (practiceVisible) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevPracticeQuestion();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextPracticeQuestion();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitPracticeAnswer();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleBookmarkCurrent();
      } else if (/^[1-9]$/.test(e.key)) {
        const q = questionMap[practiceQueue[practiceIndex]];
        const keys = Object.keys(q.options);
        const idx = parseInt(e.key, 10) - 1;
        if (keys[idx]) {
          e.preventDefault();
          selectPracticeOption(keys[idx]);
        }
      }
    } else if (examVisible && activeExam) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevExamQuestion();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextExamQuestion();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleExamFlagCurrent();
      } else if (/^[1-9]$/.test(e.key)) {
        const q = activeExam.questions[activeExam.currentIndex];
        const mapped = activeExam.optionMap[q.id];
        const idx = parseInt(e.key, 10) - 1;
        if (mapped && mapped[idx]) {
          e.preventDefault();
          selectExamOption(mapped[idx].origKey);
        }
      }
    }
  });

  function initAuthLock() {
    const overlay = document.getElementById("authOverlay");
    if (!overlay) return;
    if (!SITE_PASSWORD || localStorage.getItem(AUTH_STORAGE_KEY) === SITE_PASSWORD) {
      overlay.classList.add("hidden");
    } else {
      overlay.classList.remove("hidden");
    }
  }

  function unlockSite(event) {
    if (event) event.preventDefault();
    const input = document.getElementById("authPasswordInput");
    const errEl = document.getElementById("authErrorMsg");
    const overlay = document.getElementById("authOverlay");
    if (!input) return;

    if (input.value.trim() === SITE_PASSWORD) {
      localStorage.setItem(AUTH_STORAGE_KEY, SITE_PASSWORD);
      if (errEl) errEl.textContent = "";
      input.value = "";
      if (overlay) overlay.classList.add("hidden");
    } else {
      if (errEl) errEl.textContent = "❌ 密碼不正確，請重新輸入";
      input.select();
    }
  }

  function lockSite() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    const overlay = document.getElementById("authOverlay");
    const input = document.getElementById("authPasswordInput");
    const errEl = document.getElementById("authErrorMsg");
    if (errEl) errEl.textContent = "";
    if (overlay) overlay.classList.remove("hidden");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 50);
    }
  }

  // Expose Public API
  window.app = {
    unlockSite,
    lockSite,
    switchView,
    continueSequentialPractice,
    startPracticeMode,
    startDomainPractice,
    selectPracticeOption,
    submitPracticeAnswer,
    revealPracticeAnswer,
    prevPracticeQuestion,
    nextPracticeQuestion,
    jumpToQuestionId,
    goToPracticeIndex,
    toggleStudyMode,
    toggleAutoNext,
    toggleBookmarkCurrent,
    removeCurrentFromWrong,
    saveCurrentNote,
    startPresetExam,
    startCustomExam,
    togglePauseExam,
    selectExamOption,
    toggleExamFlagCurrent,
    prevExamQuestion,
    nextExamQuestion,
    goToExamIndex,
    abortExam,
    confirmSubmitExam,
    filterExamReview,
    retakeExamWrongQuestions,
    backToExamLobby,
    clearExamHistory,
    renderExplorer,
    practiceFilteredExplorer,
    openQuestionInPractice,
    toggleTheme,
    resetPracticeStats,
    exportProgress,
    importProgress,
    openLightbox,
    closeLightbox
  };

  // Initial Boot
  applyTheme();
  initAuthLock();
  renderDashboard();
})();
