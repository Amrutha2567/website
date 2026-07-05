# Highlight Saver — Chrome Extension

Highlight any text on any webpage, save it locally, and get AI-powered summaries.

## Features

- Select text on any page → floating **"Save Highlight?"** popup appears near the selection.
- Click the extension icon in the toolbar to open a scrollable list of all saved highlights.
- Delete highlights, copy them to the clipboard, or export all as JSON.
- **AI Summarize** — one-click GPT summary for any saved highlight.
- Saved highlights are visually preserved (yellow marker) when you revisit the page.
- Full-text search across saved highlights.
- Modern dark-themed popup UI.

## Load the extension locally (Chrome / Edge / Brave)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `/app/extension` folder.
4. Pin **Highlight Saver** to the toolbar.
5. Visit any webpage, select a piece of text, then click **"Save Highlight?"**.
6. Click the extension icon to see your highlights, run **Summarize**, or **Export**.

## Backend

The AI summary is powered by a small FastAPI endpoint that uses the Emergent Universal LLM key
(OpenAI GPT). The backend URL is configured in `extension/config.js`.

Endpoint used:
```
POST {BACKEND_URL}/api/summarize
Content-Type: application/json
{ "text": "…" }
→ { "summary": "…" }
```

## Storage

All highlights are stored **locally** in `chrome.storage.local` under the key
`hlsaver_highlights_v1`. Each highlight contains:

```json
{
  "id": "…",
  "text": "…",
  "url": "https://example.com/page",
  "title": "Page title",
  "createdAt": "2026-01-01T12:00:00.000Z"
}
```

Nothing is sent to any server unless you press the **Summarize** button.
