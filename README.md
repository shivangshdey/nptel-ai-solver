# NPTEL AI Solver

A Manifest V3 Chrome extension that reads the multiple-choice questions on an NPTEL Swayam assignment page, asks Google's Gemini API for the answers using your own API key, and selects them for you.

## Disclaimer

This tool is for learning and experimentation. Using it to complete graded assignments may violate NPTEL/Swayam's academic-integrity rules and can put your certification at risk. AI answers are also sometimes wrong. You are responsible for how you use it, so always review the selections before submitting.

## Features

- Extracts every question and its options from the assignment page, including pages that render the quiz inside an iframe.
- Sends all questions to Gemini in one request and fills in the returned answers.
- **Preview** is an on/off toggle that shows exactly what was scraped (question text and lettered options) so you can check extraction before spending an API call.
- Automatic retry with exponential backoff when Google is busy or unreachable (`429`, `5xx`, network errors, 60-second timeouts). Honors Google's suggested retry delay, and stops straight away with a clear message for problems a retry can't fix (invalid key, daily quota used up, model not found).
- Monospace popup UI with live status, question count, fill progress, and dark-mode support.
- Bring your own API key. There is no proxy and no key embedded in the extension: your key is stored on this device only (`chrome.storage.local`, never synced) and used only to call Google's Gemini API directly from the popup. Each user runs on their own free quota, so nobody's usage affects anyone else's.
- No standing site access. The extension declares no `host_permissions` and no content script; it uses `activeTab` to read and fill the page only for the moment right after you click Preview or Solve.

## Getting an API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and create a free Gemini API key.
2. Open the extension popup, paste the key into the **KEY** field, and press **SAVE**.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the project folder.

## Usage

1. Open an NPTEL assignment page (`onlinecourses.nptel.ac.in`).
2. Click the extension icon and save your API key (once -- it's remembered after that).
3. Turn **PREVIEW** on to check the extracted questions against the page (turn it off to hide them).
4. Press **SOLVE**. The status line goes through extracting, thinking, and filling, then reports how many answers were selected.
5. Review every answer, then submit yourself.

## How it works

| File | Role |
| --- | --- |
| [manifest.json](manifest.json) | MV3 manifest. Declares no `host_permissions` and no content script -- only `activeTab`, `scripting`, and `storage`. |
| [content.js](content.js) | Not declared in the manifest. `popup.js` injects it into the current tab (all frames) with `chrome.scripting.executeScript` only after the user clicks Preview or Solve, which is what `activeTab` grants access for. Groups radio buttons by `name`, finds each question's container without crossing into neighbouring questions, extracts question and option text, and clicks the matching option for each returned answer. |
| [popup.html](popup.html) | Popup markup and styles, including the API key field. |
| [fonts/](fonts/) | Bundled Space Mono (SIL Open Font License). |
| [popup.js](popup.js) | Popup logic: stores the API key, talks to the content script, builds the prompt, calls Gemini directly with the saved key, maps each answer back to one of that question's own options, and updates the UI. |

The model is asked to return a JSON array with the exact text of the correct option for each question, in order. `popup.js` maps each answer back to one of that question's own options (or `null` if it can't), and the content script selects answer *i* in question *i* only.

## Known limitations

- Answer quality depends on the model. Small or "flash" models can get questions wrong that a stronger model gets right.
- Only single-answer radio-button questions are supported. Checkboxes and typed answers are ignored.
- Page markup differs between courses. If **PREVIEW** shows wrong question text, open DevTools and check the `[NPTEL AI Solver]` console output, then adjust the selectors in `content.js`.
- Free API tiers are rate limited per key, so heavy use on one key can still hit `429` errors -- but that's your own quota, not shared with other users.
- The request runs inside the popup, so closing the popup while it says "Thinking..." cancels that solve.

## License

Code: [MIT](LICENSE). Space Mono is licensed separately under the SIL OFL 1.1 (see [fonts/OFL.txt](fonts/OFL.txt)).
