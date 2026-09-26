# NPTEL AI Solver

A Manifest V3 Chrome extension that reads the multiple-choice questions on an NPTEL Swayam assignment page, asks Google's Gemini API (through a small proxy) for the answers, and selects them for you.

## Disclaimer

This tool is for learning and experimentation. Using it to complete graded assignments may violate NPTEL/Swayam's academic-integrity rules and can put your certification at risk. AI answers are also sometimes wrong. You are responsible for how you use it, so always review the selections before submitting.

## Features

- Extracts every question and its options from the assignment page, including pages that render the quiz inside an iframe.
- Sends all questions to Gemini in one request and fills in the returned answers.
- **Preview** is an on/off toggle that shows exactly what was scraped (question text and lettered options) so you can check extraction before spending an API call.
- Automatic retry with exponential backoff when the API returns `429` or `503`.
- Monospace popup UI with live status, question count, fill progress, and dark-mode support.
- No API key is needed in the extension. The Gemini keys live only as encrypted secrets on a Cloudflare Worker proxy, which rejects requests from any other extension and falls back to a second key when the first is out of quota.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the project folder.

## Usage

1. Open an NPTEL assignment page (`onlinecourses.nptel.ac.in`) and reload it once after installing the extension.
2. Click the extension icon.
3. Turn **PREVIEW** on to check the extracted questions against the page (turn it off to hide them).
4. Press **SOLVE**. The status line goes through extracting, thinking, and filling, then reports how many answers were selected.
5. Review every answer, then submit yourself.

## How it works

| File | Role |
| --- | --- |
| [manifest.json](manifest.json) | MV3 manifest. Injects `content.js` into NPTEL/Swayam pages, including frames. |
| [content.js](content.js) | Groups radio buttons by `name`, finds each question's container without crossing into neighbouring questions, extracts question and option text, and clicks the matching option for each returned answer. |
| [popup.html](popup.html) | Popup markup and styles. |
| [popup.js](popup.js) | Popup logic: talks to the content script, builds the prompt, sends it to the proxy, parses the JSON answer array, and updates the UI. |
| [proxy/worker.js](proxy/worker.js) | Cloudflare Worker that holds the Gemini keys (`GEMINI_API_KEY`, `GEMINI_API_KEY_2` as secrets), checks the caller's extension ID, rate-limits, and forwards to Gemini. |
| [fonts/](fonts/) | Bundled Space Mono (SIL Open Font License). |

The model is asked to return only a JSON array containing the exact text of the correct option for each question, in order. The content script matches those strings back to the radio buttons.

## Deploying the proxy

```
cd proxy
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GEMINI_API_KEY_2   # optional fallback
npx wrangler deploy
```

Then set `PROXY_URL` in [popup.js](popup.js), the matching host permission in [manifest.json](manifest.json), and `ALLOWED_ORIGINS` in [proxy/wrangler.toml](proxy/wrangler.toml) to `chrome-extension://<your-extension-id>`. The model name is a constant at the top of [proxy/worker.js](proxy/worker.js) (and displayed from `popup.js`).

## Known limitations

- Answer quality depends on the model. Small or "flash" models can get questions wrong that a stronger model gets right.
- Only single-answer radio-button questions are supported. Checkboxes and typed answers are ignored.
- Page markup differs between courses. If **PREVIEW** shows wrong question text, open DevTools and check the `[NPTEL AI Solver]` console output, then adjust the selectors in `content.js`.
- Free API tiers are rate limited, so repeated clicks can hit `429` errors.

## License

Code: [MIT](LICENSE). Space Mono is licensed separately under the SIL OFL 1.1 (see [fonts/OFL.txt](fonts/OFL.txt)).
