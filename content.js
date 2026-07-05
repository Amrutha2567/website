/* Highlight Saver — content script
 * - Detects text selection
 * - Shows floating "Save Highlight?" popup near selection
 * - Persists highlights to chrome.storage.local (per-URL)
 * - Re-applies visual highlight marks on page load
 */
(function () {
  const STORAGE_KEY = "hlsaver_highlights_v1";
  const PAGE_URL = location.href.split("#")[0];
  const PAGE_TITLE = document.title || PAGE_URL;

  let popupEl = null;
  let currentSelectionText = "";

  /* -------- Storage helpers -------- */
  function getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        resolve(res[STORAGE_KEY] || []);
      });
    });
  }
  function setAll(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, resolve);
    });
  }
  async function addHighlight(text) {
    const list = await getAll();
    const item = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random()),
      text: text,
      url: PAGE_URL,
      title: PAGE_TITLE,
      createdAt: new Date().toISOString(),
    };
    list.unshift(item);
    await setAll(list);
    return item;
  }

  /* -------- Popup UI -------- */
  function removePopup() {
    if (popupEl && popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
    popupEl = null;
  }

  function showPopupAt(rect, text) {
    removePopup();
    const el = document.createElement("div");
    el.className = "hlsaver-popup";
    el.setAttribute("data-testid", "hlsaver-save-popup");
    el.innerHTML = '<span class="hlsaver-dot"></span><span class="hlsaver-label">Save Highlight?</span>';

    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const top = rect.top + scrollY - 40;
    const left = rect.left + scrollX + Math.max(0, (rect.width / 2) - 70);

    el.style.top = `${Math.max(scrollY + 4, top)}px`;
    el.style.left = `${Math.max(4, left)}px`;

    el.addEventListener("mousedown", (e) => {
      // prevent selection loss
      e.preventDefault();
    });
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const item = await addHighlight(text);
      applyHighlightForText(item.text);
      el.classList.add("saved");
      el.querySelector(".hlsaver-label").textContent = "Saved ✓";
      setTimeout(removePopup, 900);
    });

    document.body.appendChild(el);
    popupEl = el;
  }

  /* -------- Selection detection -------- */
  function onMouseUp(e) {
    // Ignore clicks on our own popup
    if (e.target && e.target.closest && e.target.closest(".hlsaver-popup")) return;

    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { removePopup(); return; }
      const text = sel.toString().trim();
      if (!text || text.length < 2) { removePopup(); return; }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { removePopup(); return; }

      currentSelectionText = text;
      showPopupAt(rect, text);
    }, 10);
  }

  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("scroll", removePopup, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") removePopup(); });

  /* -------- Highlight rendering on page -------- */
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function applyHighlightForText(text) {
    if (!text || text.length < 2) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA" || tag === "INPUT") return NodeFilter.FILTER_REJECT;
        if (p.classList && p.classList.contains("hlsaver-mark")) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest(".hlsaver-popup")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    // Try full-text single-node match first
    const re = new RegExp(escapeRegex(text), "g");
    const targets = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes(text)) targets.push(node);
    }
    targets.forEach((textNode) => {
      const frag = document.createDocumentFragment();
      const parts = textNode.nodeValue.split(re);
      const matches = textNode.nodeValue.match(re) || [];
      parts.forEach((part, i) => {
        if (part) frag.appendChild(document.createTextNode(part));
        if (i < parts.length - 1) {
          const mark = document.createElement("mark");
          mark.className = "hlsaver-mark";
          mark.textContent = matches[i];
          frag.appendChild(mark);
        }
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  async function reapplyAllHighlights() {
    const list = await getAll();
    const forPage = list.filter((h) => h.url === PAGE_URL);
    // De-dupe by text to avoid double-wrap issues
    const seen = new Set();
    for (const h of forPage) {
      if (seen.has(h.text)) continue;
      seen.add(h.text);
      try { applyHighlightForText(h.text); } catch (_) {}
    }
  }

  // React to storage changes (e.g., delete/clear from popup)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    // Remove all existing marks and re-apply
    document.querySelectorAll(".hlsaver-mark").forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });
    reapplyAllHighlights();
  });

  // Initial re-apply on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reapplyAllHighlights);
  } else {
    reapplyAllHighlights();
  }
})();
