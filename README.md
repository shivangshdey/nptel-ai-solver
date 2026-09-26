# NPTEL AI Solver

A Manifest V3 Chrome extension that reads the multiple-choice questions on an NPTEL Swayam assignment page, asks Google's Gemini API for the answers, and selects them for you.

## Disclaimer

This tool is for learning and experimentation. Using it to complete graded assignments may violate NPTEL/Swayam's academic-integrity rules and can put your certification at risk. AI answers are also sometimes wrong. You are responsible for how you use it, so always review the selections before submitting.

## Features

- Extracts every question and its options from the assignment page, including pages that render the quiz inside an iframe.
- Sends all questions to Gemini in one request and fills in the returned answers.
- **Preview** mode shows exactly what was scraped (question text and lettered options) so you can check extraction before spending an API call.
- Automatic retry with exponential backoff when the API returns `429` or `503`.
- Monospace popup UI with live status, question count, fill progress, and dark-mode support.
- Your API key is stored only in `chrome.storage.sync`. It is never hard-coded or sent anywhere except Google's API.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).

## Usage

1. Open an NPTEL assignment page (`onlinecourses.nptel.ac.in`) and reload it once after installing the extension.
2. Click the extension icon, paste your Gemini API key, and press **SAVE**.
3. Press **PREVIEW** to check the extracted questions against the page.
4. Press **SOLVE**. The status line goes through extracting, thinking, and filling, then reports how many answers were selected.
5. Review every answer, then submit yourself.

## How it works

| File | Role |
| --- | --- |
| [manifest.json](manifest.json) | MV3 manifest. Injects `content.js` into NPTEL/Swayam pages, including frames. |
| [content.js](content.js) | Groups radio buttons by `name`, finds each question's container without crossing into neighbouring questions, extracts question and option text, and clicks the matching option for each returned answer. |
| [popup.html](popup.html) | Popup markup and styles. |
| [popup.js](popup.js) | Popup logic: talks to the content script, builds the prompt, calls Gemini, parses the JSON answer array, and updates the UI. |
| [fonts/](fonts/) | Bundled Space Mono (SIL Open Font License). |

The model is asked to return only a JSON array containing the exact text of the correct option for each question, in order. The content script matches those strings back to the radio buttons.

## Configuration

The model name is a constant at the top of [popup.js](popup.js):

```js
const MODEL = "gemini-3.8-flash";
```

Change it if Google renames or retires the model, or to trade speed for accuracy with a larger model.

## Known limitations

- Answer quality depends on the model. Small or "flash" models can get questions wrong that a stronger model gets right.
- Only single-answer radio-button questions are supported. Checkboxes and typed answers are ignored.
- Page markup differs between courses. If **PREVIEW** shows wrong question text, open DevTools and check the `[NPTEL AI Solver]` console output, then adjust the selectors in `content.js`.
- Free API tiers are rate limited, so repeated clicks can hit `429` errors.

## License

Code: no license file yet, so all rights reserved by default. Add one (for example MIT) if you want others to reuse it. Space Mono is licensed separately under the SIL OFL 1.1 (see [fonts/OFL.txt](fonts/OFL.txt)).
