// Background service worker — kept minimal.
// Storage lives in chrome.storage.local and is accessed from content + popup scripts directly.
chrome.runtime.onInstalled.addListener(() => {
  console.log("Highlight Saver installed.");
});
