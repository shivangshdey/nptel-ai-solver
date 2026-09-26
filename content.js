(() => {
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const LOG = "[NPTEL AI Solver]";

  function getRadios() {
    return Array.from(document.querySelectorAll('input[type="radio"]'));
  }

  // Climb from the radio's parent until we hit an ancestor that actually
  // has visible text (handles hidden native radios + a styled label sibling,
  // radios wrapped in <label>, or radios sitting a couple of levels below
  // the text node in framework-generated markup).
  function optionText(radio) {
    if (radio.id) {
      const byFor = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
      const t = (byFor?.innerText || "").trim();
      if (t) return t;
    }
    const wrappingLabel = radio.closest("label");
    if (wrappingLabel) {
      const t = (wrappingLabel.innerText || "").trim();
      if (t) return t;
    }
    let el = radio.parentElement;
    for (let i = 0; i < 5 && el; i++, el = el.parentElement) {
      const t = (el.innerText || el.textContent || "").trim();
      if (t) return t;
    }
    // aria-label / value as a last resort
    return (radio.getAttribute("aria-label") || radio.value || "").trim();
  }

  // Nearest common ancestor of a set of elements.
  function commonAncestor(nodes) {
    if (nodes.length === 1) return nodes[0].parentElement || nodes[0];
    let common = null;
    for (const n of nodes) {
      const chain = new Set();
      let el = n;
      while (el) { chain.add(el); el = el.parentElement; }
      common = common ? new Set([...common].filter((c) => chain.has(c))) : chain;
    }
    let el = nodes[0];
    while (el) {
      if (common && common.has(el)) return el;
      el = el.parentElement;
    }
    return document.body;
  }

  // Climb from the radios' common ancestor toward the document root, but stop
  // as soon as a wider container would start swallowing another question's
  // radio buttons too (i.e. we've crossed a question boundary).
  function questionContainer(groupRadios, allRadios) {
    let container = commonAncestor(groupRadios);
    for (let i = 0; i < 6 && container.parentElement && container !== document.body; i++) {
      const candidate = container.parentElement;
      const radiosInCandidate = allRadios.filter((r) => candidate.contains(r)).length;
      if (radiosInCandidate > groupRadios.length) break;
      container = candidate;
    }
    return container;
  }

  const BARE_NUMBER_RE = /^\d+[.)]?$/;

  // Radio groups that have readable option text, in page order. Extraction and
  // filling both use this so answer i always goes to question i.
  function questionGroups() {
    const radios = getRadios();
    const groups = new Map();
    radios.forEach((radio, idx) => {
      const name = radio.name || `__unnamed_${idx}`;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(radio);
    });
    const withText = [];
    let emptyOptionGroups = 0;
    let sampleHtml = "";
    for (const groupRadios of groups.values()) {
      if (groupRadios.map(optionText).some(Boolean)) {
        withText.push(groupRadios);
      } else {
        emptyOptionGroups++;
        if (!sampleHtml) sampleHtml = groupRadios[0]?.parentElement?.outerHTML?.slice(0, 800) || "";
      }
    }
    return { radios, groupCount: groups.size, withText, emptyOptionGroups, sampleHtml };
  }

  function extractQuiz() {
    const { radios, groupCount, withText, emptyOptionGroups, sampleHtml } = questionGroups();
    const questions = withText.map((groupRadios) => {
      const options = groupRadios.map(optionText).filter(Boolean);
      const container = questionContainer(groupRadios, radios);
      const lines = (container?.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
      const optSet = new Set(options.map(norm));
      const candidates = lines.filter((l) => !optSet.has(norm(l)) && !BARE_NUMBER_RE.test(l));
      const question = candidates.sort((a, b) => b.length - a.length)[0] || lines[0] || "";
      return { question, options };
    });

    console.log(`${LOG} radios=${radios.length} groups=${groupCount} questions=${questions.length} emptyOptionGroups=${emptyOptionGroups}`);
    if (!questions.length && radios.length) {
      console.log(`${LOG} Found radio buttons but could not read option text. Sample markup around one option:\n`, sampleHtml);
    }
    return { questions, debug: { radios: radios.length, groups: groupCount, emptyOptionGroups, sampleHtml } };
  }

  // answers[i] is the exact option text for question i, or null to skip it.
  function fillAnswers(answers) {
    const { withText } = questionGroups();
    let filled = 0;
    withText.forEach((groupRadios, i) => {
      const wanted = norm(answers[i]);
      if (!wanted) return;
      const target = groupRadios.find((r) => norm(optionText(r)) === wanted);
      if (!target) return;
      target.click(); // triggers framework handlers (Angular/React etc.)
      if (!target.checked) target.checked = true;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      filled++;
    });
    return filled;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // Frames without radios stay silent so the frame that has the quiz can answer.
    if (getRadios().length === 0) return false;
    try {
      if (msg.action === "extract_quiz") {
        sendResponse(extractQuiz());
      } else if (msg.action === "fill_answers") {
        sendResponse({ filled: fillAnswers(Array.isArray(msg.answers) ? msg.answers : []) });
      } else {
        return false;
      }
    } catch (err) {
      sendResponse({ error: err.message || String(err) });
    }
    return false;
  });
})();
