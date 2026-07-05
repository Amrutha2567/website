/* Highlight Saver — popup script */
(function () {
  const STORAGE_KEY = "hlsaver_highlights_v1";
  const BACKEND_URL = (window.HL_SAVER_CONFIG && window.HL_SAVER_CONFIG.BACKEND_URL) || "";

  const $ = (sel) => document.querySelector(sel);
  const listEl = $("#hs-list");
  const emptyEl = $("#hs-empty");
  const countEl = $("#hs-count");
  const searchEl = $("#hs-search");
  const statusEl = $("#hs-status");

  let cache = [];

  /* ----- Storage ----- */
  function loadAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => resolve(res[STORAGE_KEY] || []));
    });
  }
  function saveAll(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, resolve);
    });
  }

  /* ----- Utilities ----- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function timeAgo(iso) {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  }
  function hostFromUrl(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
  }

  /* ----- Render ----- */
  function render() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const filtered = q
      ? cache.filter((h) =>
          h.text.toLowerCase().includes(q) ||
          (h.title || "").toLowerCase().includes(q) ||
          (h.url || "").toLowerCase().includes(q))
      : cache;

    countEl.textContent = `${cache.length} saved${q ? ` · ${filtered.length} match${filtered.length === 1 ? "" : "es"}` : ""}`;

    if (cache.length === 0) {
      listEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    listEl.hidden = false;
    emptyEl.hidden = true;

    listEl.innerHTML = filtered.map((h) => `
      <article class="hs-item" data-id="${h.id}" data-testid="hs-item">
        <p class="hs-item-text" data-testid="hs-item-text">${escapeHtml(h.text)}</p>
        <div class="hs-item-meta">
          <a class="hs-item-link" href="${escapeHtml(h.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(h.title || h.url)}">${escapeHtml(hostFromUrl(h.url))} · ${escapeHtml(h.title || "")}</a>
          <span class="hs-item-time">${timeAgo(h.createdAt)}</span>
        </div>
        <div class="hs-item-actions">
          <button class="hs-btn primary hs-summarize" data-testid="hs-summarize-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 5 5.6.8-4 3.9.9 5.6L12 14.8 7.1 17.3l.9-5.6-4-3.9 5.6-.8z"/></svg>
            Summarize
          </button>
          <button class="hs-btn hs-copy" data-testid="hs-copy-btn">Copy</button>
          <button class="hs-btn ghost-danger hs-delete" data-testid="hs-delete-btn">Delete</button>
        </div>
        <div class="hs-summary-slot"></div>
      </article>
    `).join("");
  }

  /* ----- Actions ----- */
  async function refresh() {
    cache = await loadAll();
    render();
  }

  async function deleteById(id) {
    cache = cache.filter((h) => h.id !== id);
    await saveAll(cache);
    render();
  }

  async function clearAll() {
    if (!confirm(`Delete all ${cache.length} highlight(s)? This cannot be undone.`)) return;
    cache = [];
    await saveAll(cache);
    render();
    setStatus("Cleared");
  }

  function exportAll() {
    if (cache.length === 0) { setStatus("Nothing to export"); return; }
    const blob = new Blob([JSON.stringify(cache, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `highlights-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setStatus("Exported");
  }

  async function summarize(item, slotEl, btn) {
    if (!BACKEND_URL) {
      slotEl.innerHTML = `<div class="hs-summary error">Backend URL not configured.</div>`;
      return;
    }
    btn.disabled = true;
    slotEl.innerHTML = `<div class="hs-summary loading">Summarizing…</div>`;
    try {
      const res = await fetch(`${BACKEND_URL.replace(/\/+$/, "")}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 140)}`);
      }
      const data = await res.json();
      const summary = (data && data.summary) || "(empty response)";
      slotEl.innerHTML = `<div class="hs-summary" data-testid="hs-summary">${escapeHtml(summary)}</div>`;
    } catch (e) {
      slotEl.innerHTML = `<div class="hs-summary error">Failed to summarize: ${escapeHtml(String(e.message || e))}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const orig = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = orig), 900);
    } catch {
      setStatus("Copy failed");
    }
  }

  function setStatus(t) {
    statusEl.textContent = t;
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => (statusEl.textContent = "Ready"), 1400);
  }

  /* ----- Event wiring ----- */
  listEl.addEventListener("click", (e) => {
    const article = e.target.closest(".hs-item");
    if (!article) return;
    const id = article.getAttribute("data-id");
    const item = cache.find((h) => h.id === id);
    if (!item) return;

    if (e.target.closest(".hs-delete")) return deleteById(id);
    if (e.target.closest(".hs-copy")) return copyText(item.text, e.target.closest(".hs-copy"));
    if (e.target.closest(".hs-summarize")) {
      const btn = e.target.closest(".hs-summarize");
      const slot = article.querySelector(".hs-summary-slot");
      return summarize(item, slot, btn);
    }
  });

  $("#hs-export").addEventListener("click", exportAll);
  $("#hs-clear").addEventListener("click", clearAll);
  searchEl.addEventListener("input", render);
  $("#hs-help").addEventListener("click", (e) => {
    e.preventDefault();
    alert("Select text on any webpage, then click the floating 'Save Highlight?' button. Your highlights appear here.");
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      cache = changes[STORAGE_KEY].newValue || [];
      render();
    }
  });

  refresh();
})();
