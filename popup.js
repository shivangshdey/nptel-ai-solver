// Display only; the model is chosen in proxy/worker.js.
const MODEL = "gemini-3.8-flash";
// Cloudflare Worker that holds the API key. Replace with your deployed worker URL.
const PROXY_URL = "https://proxy.example.workers.dev/solve";

const previewBtn = document.getElementById("previewBtn");
const solveBtn = document.getElementById("solveBtn");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const clockEl = document.getElementById("clock");
const qCountEl = document.getElementById("qCount");
const fillCountEl = document.getElementById("fillCount");
const coilEl = document.getElementById("coil");
const ringEl = document.getElementById("ring");
const ringFillEl = document.getElementById("ringFill");
const ringPctEl = document.getElementById("ringPct");

const RING_CIRCUMFERENCE = 2 * Math.PI * 20;
const SVG_NS = "http://www.w3.org/2000/svg";

document.getElementById("modelName").textContent = MODEL;

function setStatus(msg, type = "busy") {
  statusEl.textContent = msg;
  statusEl.dataset.state = type;
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  ringEl.classList.toggle("spinning", busy);
  if (busy) setRing(0.25);
}

function tickClock() {
  const now = new Date();
  clockEl.textContent =
    String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
}
tickClock();
setInterval(tickClock, 10000);

// Serpentine glyph: one vertical stroke per question (capped), inked up to the filled fraction.
function drawCoil(total, filled) {
  const lines = Math.max(2, Math.min(total || 8, 10));
  const gap = 7;
  const r = gap / 2;
  const top = 4;
  const bottom = 42;
  const width = 3 + (lines - 1) * gap + 3;
  let d = `M 3 ${bottom} V ${top}`;
  for (let i = 0; i < lines - 1; i++) {
    const x = 3 + (i + 1) * gap;
    d += i % 2 === 0
      ? ` A ${r} ${r} 0 0 1 ${x} ${top} V ${bottom}`
      : ` A ${r} ${r} 0 0 0 ${x} ${bottom} V ${top}`;
  }
  const fraction = total ? Math.min(1, (filled || 0) / total) : 0;

  coilEl.setAttribute("width", width);
  coilEl.setAttribute("viewBox", `0 0 ${width} 46`);
  coilEl.replaceChildren();

  const clip = document.createElementNS(SVG_NS, "clipPath");
  clip.id = "coilClip";
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("width", width * fraction);
  rect.setAttribute("height", 46);
  clip.appendChild(rect);

  const base = document.createElementNS(SVG_NS, "path");
  base.setAttribute("class", "coil-base");
  base.setAttribute("d", d);

  const done = document.createElementNS(SVG_NS, "path");
  done.setAttribute("class", "coil-done");
  done.setAttribute("d", d);
  done.setAttribute("clip-path", "url(#coilClip)");

  coilEl.append(clip, base, done);
}

function setRing(fraction) {
  ringFillEl.style.strokeDasharray = RING_CIRCUMFERENCE;
  ringFillEl.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
}

function renderStats(total, filled) {
  qCountEl.textContent = total ? String(total).padStart(2, "0") : "--";
  if (typeof filled === "number" && total) {
    const fraction = Math.min(1, filled / total);
    fillCountEl.innerHTML = `${String(filled).padStart(2, "0")}<small>/${total}</small>`;
    ringPctEl.textContent = `${Math.round(fraction * 100)}%`;
    setRing(fraction);
  } else {
    fillCountEl.textContent = "--";
    ringPctEl.textContent = "0%";
    setRing(0);
  }
  drawCoil(total, filled);
}

renderStats(0);

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(
          "Could not reach the page. Open the assignment page and reload it, then try again."
        ));
      }
      resolve(response);
    });
  });
}

function formatQuestionsForPreview(questions) {
  return questions
    .map((q, i) => {
      const opts = q.options.map((o, j) => `    ${String.fromCharCode(65 + j)}) ${o}`).join("\n");
      return `Q${i + 1}: ${q.question}\n${opts}`;
    })
    .join("\n\n");
}

function setPreviewOn(on) {
  previewBtn.setAttribute("aria-pressed", String(on));
  previewEl.hidden = !on;
}

previewBtn.addEventListener("click", async () => {
  if (previewBtn.getAttribute("aria-pressed") === "true") {
    setPreviewOn(false);
    return;
  }
  setBusy(previewBtn, true);
  solveBtn.disabled = true;
  previewEl.hidden = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");

    setStatus("Extracting questions...");
    const extracted = await sendToTab(tab.id, { action: "extract_quiz" });
    if (!extracted || extracted.error) throw new Error(extracted?.error || "No response from page.");

    if (!extracted.questions?.length) {
      const d = extracted.debug;
      if (d && d.radios > 0) {
        throw new Error(
          `Found ${d.radios} radio buttons in ${d.groups} groups, but couldn't read their option text ` +
          `(${d.emptyOptionGroups} groups had no readable text). Open DevTools (F12) > Console on the ` +
          `assignment page and check the "[NPTEL AI Solver]" log line for a markup sample.`
        );
      }
      throw new Error("No multiple-choice questions found on this page.");
    }

    previewEl.textContent = formatQuestionsForPreview(extracted.questions);
    setPreviewOn(true);
    renderStats(extracted.questions.length);
    setStatus(`Extracted ${extracted.questions.length} question(s). Compare against the page below.`, "ok");
  } catch (err) {
    renderStats(0);
    setStatus(err.message || String(err), "error");
  } finally {
    setBusy(previewBtn, false);
    solveBtn.disabled = false;
  }
});

const RETRYABLE_STATUS = new Set([429, 503]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function askSolver(questions, { maxRetries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions })
      });
    } catch (_) {
      throw new Error("Could not reach the solver server. Check your internet connection.");
    }
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      if (!Array.isArray(data.answers)) throw new Error("Empty response from the AI.");
      return data.answers;
    }

    lastErr = new Error(`API error ${res.status}: ${data?.error?.message || res.statusText}`);
    if (!RETRYABLE_STATUS.has(res.status) || attempt === maxRetries) break;

    const backoffMs = 1000 * Math.pow(2, attempt);
    setStatus(`Model is busy (${res.status}). Retrying in ${backoffMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
    await sleep(backoffMs);
  }
  throw lastErr;
}

solveBtn.addEventListener("click", async () => {
  setBusy(solveBtn, true);
  previewBtn.disabled = true;
  let total = 0;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");

    setStatus("Extracting questions...");
    const extracted = await sendToTab(tab.id, { action: "extract_quiz" });
    if (!extracted || extracted.error) throw new Error(extracted?.error || "No response from page.");
    if (!extracted.questions?.length) {
      const d = extracted.debug;
      if (d && d.radios > 0) {
        throw new Error(
          `Found ${d.radios} radio buttons in ${d.groups} groups, but couldn't read their option text ` +
          `(${d.emptyOptionGroups} groups had no readable text). Open DevTools (F12) > Console on the ` +
          `assignment page and check the "[NPTEL AI Solver]" log line for a markup sample.`
        );
      }
      throw new Error("No multiple-choice questions found on this page.");
    }

    total = extracted.questions.length;
    qCountEl.textContent = String(total).padStart(2, "0");
    drawCoil(total, 0);

    setStatus(`Thinking... (${total} questions)`);
    const answers = await askSolver(extracted.questions);

    setStatus("Filling answers...");
    const result = await sendToTab(tab.id, { action: "fill_answers", answers });
    if (!result || result.error) throw new Error(result?.error || "Fill failed.");

    renderStats(total, result.filled);
    setStatus(`Done. Selected ${result.filled} of ${total}. Review before submitting!`, "ok");
  } catch (err) {
    renderStats(total);
    setStatus(err.message || String(err), "error");
  } finally {
    setBusy(solveBtn, false);
    previewBtn.disabled = false;
  }
});
