let PROMPTS = [];

const els = {
  navItems: () => Array.from(document.querySelectorAll('.nav-item')),
  panels: () => Array.from(document.querySelectorAll('.panel')),
  notice: document.getElementById('notice'),
  promptCount: document.getElementById('promptCount'),
  decisionFlow: document.getElementById('decisionFlow'),

  // builder
  task: document.getElementById('task'),
  platform: document.getElementById('platform'),
  generate: document.getElementById('generate'),
  output: document.getElementById('output'),
  copy: document.getElementById('copy'),
  download: document.getElementById('download'),
  riskBadge: document.getElementById('riskBadge'),
  riskDetails: document.getElementById('riskDetails'),
  lockIdentity: document.getElementById('lockIdentity'),
  preserveGrain: document.getElementById('preserveGrain'),
  noCinematic: document.getElementById('noCinematic'),
  noBeautify: document.getElementById('noBeautify'),

  // library
  filterMode: document.getElementById('filterMode'),
  filterCategory: document.getElementById('filterCategory'),
  filterSearch: document.getElementById('filterSearch'),
  applyFilters: document.getElementById('applyFilters'),
  results: document.getElementById('results'),

  // drift sim
  opType: document.getElementById('opType'),
  sensitivity: document.getElementById('sensitivity'),
  simBadge: document.getElementById('simBadge'),
  simDetails: document.getElementById('simDetails'),
  riskWords: () => Array.from(document.querySelectorAll('.riskWord')),
};

function showNotice(msg, level="warn"){
  els.notice.classList.remove('hidden','bad');
  if(level==="bad") els.notice.classList.add('bad');
  els.notice.textContent = msg;
  setTimeout(()=>{
    els.notice.classList.add('hidden');
  }, 4500);
}

function navTo(id){
  els.panels().forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  els.navItems().forEach(b => b.classList.toggle('active', b.dataset.target === id));
  window.scrollTo({top:0, behavior:'smooth'});
}

function bindNav(){
  els.navItems().forEach(btn => {
    btn.addEventListener('click', () => navTo(btn.dataset.target));
  });
}

function uniq(arr){ return Array.from(new Set(arr)).sort(); }

function loadPrompts(){
  return fetch('assets/prompts.json')
    .then(r => r.json())
    .then(data => {
      PROMPTS = data;
      els.promptCount.textContent = `${PROMPTS.length.toLocaleString()} prompts loaded`;

      // fill category filter
      const cats = uniq(PROMPTS.map(p => p.category));
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        els.filterCategory.appendChild(opt);
      });

      // attempt to load decision flow from the COMMERCIAL/ARCHIVAL pack (if present)
      const df = PROMPTS.find(p => p.path.endsWith('DECISION_FLOW_CHART.txt'));
      if(df) els.decisionFlow.textContent = df.text;
      else els.decisionFlow.textContent = "Decision flow not found in prompt pack.";

      renderResults(PROMPTS.slice(0, 30));
    });
}

function getMode(){
  const m = document.querySelector('input[name="mode"]:checked');
  return m ? m.value : "ARCHIVAL_USE_ONLY";
}

function riskScoreFromSelections(){
  const mode = getMode();
  const task = els.task.value;

  let score = 10; // baseline
  let reasons = [];

  // Mode sensitivity
  if(mode === "ARCHIVAL_USE_ONLY") {
    score += 5;
    reasons.push("Archival mode (higher sensitivity: stop earlier).");
  }

  // Task risk
  const taskRisk = {
    "ENHANCE_FULL_IMAGE": 10,
    "FACE_IDENTITY": 15,
    "SKIN_TEXTURE_GRAIN": 12,
    "LIGHTING_COLOR": 10,
    "BODY_PROPORTION": 18,
    "POSE_ANGLE_SAFE": 28,
    "FACE_REPLACE": 35,
    "UPSCALE_RESOLUTION": 14,
    "RETOUCH": 16,
    "STYLE_CONTROLLED": 26
  };
  score += (taskRisk[task] || 12);
  if(task === "FACE_REPLACE") reasons.push("Face replacement has the highest identity drift risk.");
  if(task === "POSE_ANGLE_SAFE") reasons.push("Angle/pose changes require geometry re-synthesis (drift risk).");
  if(task === "STYLE_CONTROLLED") reasons.push("Style transfer often pushes models into reinterpretation.");

  // Safety toggles reduce risk
  if(els.lockIdentity.checked) { score -= 10; reasons.push("Identity lock enabled (reduces drift)."); }
  if(els.preserveGrain.checked) score -= 3;
  if(els.noCinematic.checked) score -= 3;
  if(els.noBeautify.checked) score -= 4;

  // Bound
  score = Math.max(0, Math.min(100, score));
  return {score, reasons};
}

function badgeFor(score){
  if(score >= 60) return {cls:"bad", label:"Risk: High"};
  if(score >= 35) return {cls:"warn", label:"Risk: Medium"};
  return {cls:"ok", label:"Risk: Low"};
}

function findGoldPrompt(mode, task){
  // prefer COMMERCIAL/ARCHIVAL gold standard prompt if present
  const normalizedTaskMap = {
    "ENHANCE_FULL_IMAGE": "ENHANCE_FULL_IMAGE",
    "FACE_IDENTITY": "FACE_IDENTITY",
    "SKIN_TEXTURE_GRAIN": "SKIN_TEXTURE_GRAIN",
    "LIGHTING_COLOR": "LIGHTING_COLOR",
    "BODY_PROPORTION": "BODY_PROPORTION",
    "POSE_ANGLE_SAFE": "POSE_ANGLE_SAFE",
    "FACE_REPLACE": "FACE_REPLACE",
    "UPSCALE_RESOLUTION": "UPSCALE_RESOLUTION",
    "RETOUCH": "RETOUCH",
    "STYLE_CONTROLLED": "STYLE_CONTROLLED"
  };
  const folder = normalizedTaskMap[task] || task;

  // try the split pack path convention
  const gold = PROMPTS.find(p =>
    p.mode === mode &&
    p.category === folder &&
    /GOLD_STANDARD_PROMPT\.txt$/i.test(p.path)
  );
  if(gold) return gold.text;

  // fallback to any "gold standard" text in the library
  const gold2 = PROMPTS.find(p => /gold standard/i.test(p.title) && p.category === folder);
  if(gold2) return gold2.text;

  // fallback to first matching prompt
  const fallback = PROMPTS.find(p => (p.mode===mode || p.mode==="GENERAL") && p.category===folder);
  return fallback ? fallback.text : "";
}

function platformHeader(platform){
  if(platform === "CHATGPT") return "PLATFORM TARGET: ChatGPT Image (GPT-Image / chatgpt-image-latest)\n";
  if(platform === "GEMINI") return "PLATFORM TARGET: Google Gemini Image (nano-banana pro)\n";
  return "";
}

function generatePrompt(){
  const mode = getMode();
  const task = els.task.value;
  const platform = els.platform.value;

  const base = findGoldPrompt(mode, task);
  const hdr = platformHeader(platform);

  const safetyLines = [];
  if(els.lockIdentity.checked) safetyLines.push("Do not alter facial structure, age, ethnicity, skin tone, or expression.");
  if(els.preserveGrain.checked) safetyLines.push("Preserve organic grain / sensor noise; do not remove completely.");
  if(els.noCinematic.checked) safetyLines.push("Forbid cinematic grading, HDR, oversaturation, and stylized glow.");
  if(els.noBeautify.checked) safetyLines.push("Forbid beautification, de-aging, face reshaping, and identity blending.");

  const safetyBlock = safetyLines.length ? ("\nSAFETY OVERRIDES (NON-NEGOTIABLE):\n- " + safetyLines.join("\n- ") + "\n") : "";

  const finalPrompt = [
    hdr,
    (mode === "ARCHIVAL_USE_ONLY" ? "ARCHIVAL MODE: prioritize truth over aesthetics.\n" : "COMMERCIAL/EDITORIAL MODE: professional polish without identity drift.\n"),
    base,
    safetyBlock
  ].join("\n").trim();

  els.output.value = finalPrompt;

  const {score, reasons} = riskScoreFromSelections();
  const b = badgeFor(score);
  els.riskBadge.className = `badge ${b.cls}`;
  els.riskBadge.textContent = b.label;
  els.riskDetails.textContent = reasons.join(" ");

  if(score >= 60) showNotice("High drift risk detected. Consider Archival mode, remove any angle/face changes, and stop earlier.", "bad");
  else if(score >= 35) showNotice("Medium drift risk. Run a conservative pass first and compare faces before proceeding.", "warn");
}

function copyPrompt(){
  const txt = els.output.value.trim();
  if(!txt) return;
  navigator.clipboard.writeText(txt).then(()=>showNotice("Copied to clipboard.", "warn"));
}

function downloadPrompt(){
  const txt = els.output.value.trim();
  if(!txt) return;
  const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "AI_Photo_OS_Prompt.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  showNotice("Downloaded prompt file.", "warn");
}

function renderResults(list){
  if(!list.length){
    els.results.innerHTML = "<div class='result'>No results.</div>";
    return;
  }
  els.results.innerHTML = "";
  list.forEach(p => {
    const div = document.createElement('div');
    div.className = "result";
    div.innerHTML = `
      <div class="result-title">${escapeHtml(p.title)}</div>
      <div class="result-meta">${escapeHtml(p.mode)} • ${escapeHtml(p.category)} • ${escapeHtml(p.source_zip)}</div>
      <pre>${escapeHtml(p.text)}</pre>
    `;
    div.addEventListener('dblclick', () => {
      els.output.value = p.text;
      showNotice("Loaded prompt into the builder output (double-click).", "warn");
      navTo('builder');
    });
    els.results.appendChild(div);
  });
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function applyFilters(){
  const mode = els.filterMode.value;
  const cat = els.filterCategory.value;
  const q = (els.filterSearch.value || "").toLowerCase().trim();

  let list = PROMPTS.slice();
  if(mode !== "ALL") list = list.filter(p => p.mode === mode);
  if(cat !== "ALL") list = list.filter(p => p.category === cat);
  if(q) list = list.filter(p =>
    (p.title||"").toLowerCase().includes(q) ||
    (p.text||"").toLowerCase().includes(q) ||
    (p.path||"").toLowerCase().includes(q)
  );
  renderResults(list.slice(0, 100));
}

function simulateRisk(){
  const op = els.opType.value;
  const sens = els.sensitivity.value;
  const words = els.riskWords().filter(c => c.checked).map(c => c.value);

  let score = 10;
  const opRisk = { enhance: 10, lighting: 12, upscale: 18, pose: 35, face_replace: 45, style: 32 };
  score += (opRisk[op] || 12);

  if(sens === "med") score += 10;
  if(sens === "high") score += 22;

  // risky words
  score += words.length * 6;

  score = Math.max(0, Math.min(100, score));
  const b = badgeFor(score);
  els.simBadge.className = `badge ${b.cls}`;
  els.simBadge.textContent = b.label;
  els.simDetails.textContent = [
    `Operation: ${op}`,
    `Sensitivity: ${sens}`,
    words.length ? `Risky terms toggled: ${words.join(", ")}` : "No risky terms toggled."
  ].join(" • ");

  if(score >= 60) showNotice("High risk: models will likely hallucinate or drift identity. Reduce ambition and lock faces.", "bad");
}

function bind(){
  els.generate.addEventListener('click', generatePrompt);
  els.copy.addEventListener('click', copyPrompt);
  els.download.addEventListener('click', downloadPrompt);
  els.applyFilters.addEventListener('click', applyFilters);

  // drift sim bindings
  els.opType.addEventListener('change', simulateRisk);
  els.sensitivity.addEventListener('change', simulateRisk);
  els.riskWords().forEach(c => c.addEventListener('change', simulateRisk));

  // auto-update badge when task or toggles change
  [els.task, els.platform, els.lockIdentity, els.preserveGrain, els.noCinematic, els.noBeautify].forEach(el => {
    el.addEventListener('change', () => {
      const {score} = riskScoreFromSelections();
      const b = badgeFor(score);
      els.riskBadge.className = `badge ${b.cls}`;
      els.riskBadge.textContent = b.label;
    });
  });
}

bindNav();
loadPrompts().then(()=>{
  bind();
  simulateRisk();
}).catch(err => {
  console.error(err);
  els.promptCount.textContent = "Failed to load prompts.";
  showNotice("Failed to load prompts.json. Ensure assets/prompts.json exists.", "bad");
});

/* ---------------- PROMPT LINT ---------------- */

const lintRules = [
  { pattern: /cinematic|hdr|hollywood/i, risk: 18, msg: "Cinematic/HDR language often triggers stylization and hallucination.", replace: "photographic, neutral grading" },
  { pattern: /perfect skin|airbrushed|flawless/i, risk: 20, msg: "Perfection language causes plastic skin and identity drift.", replace: "natural skin texture with imperfections preserved" },
  { pattern: /ultra sharp|hyper sharp|extremely sharp/i, risk: 14, msg: "Over-sharpening creates halos and fake detail.", replace: "clear but natural detail without oversharpening" },
  { pattern: /beauty|model-like|editorial beauty/i, risk: 16, msg: "Beauty language can alter facial structure.", replace: "identity-faithful, non-beautified appearance" },
  { pattern: /reimagine|reinterpret|idealized/i, risk: 25, msg: "Creative reinterpretation breaks archival truth.", replace: "faithful restoration of the original image" },
  { pattern: /youthful|younger|aged?/i, risk: 30, msg: "Age modification is identity-altering.", replace: "preserve original age cues exactly" },
  { pattern: /change face|new face|average face/i, risk: 40, msg: "Face replacement/averaging is extremely high risk.", replace: "preserve facial identity exactly" },
];

function runLint(){
  const input = document.getElementById('lintInput').value || "";
  const results = document.getElementById('lintResults');
  const badge = document.getElementById('lintBadge');

  results.innerHTML = "";
  let score = 0;
  let hits = [];

  lintRules.forEach(rule => {
    if(rule.pattern.test(input)){
      score += rule.risk;
      hits.push(rule);
    }
  });

  if(!hits.length){
    badge.className = "badge ok";
    badge.textContent = "Lint: Clean";
    results.innerHTML = "<div class='result'>No risky phrases detected.</div>";
    return;
  }

  const level = score >= 50 ? "bad" : score >= 25 ? "warn" : "ok";
  badge.className = "badge " + level;
  badge.textContent = "Lint Risk: " + (level==="bad" ? "High" : level==="warn" ? "Medium" : "Low");

  hits.forEach(h => {
    const div = document.createElement('div');
    div.className = "result";
    div.innerHTML = `
      <div class="result-title">⚠️ ${escapeHtml(h.pattern.toString())}</div>
      <div class="result-meta">Risk +${h.risk}</div>
      <div>${escapeHtml(h.msg)}</div>
      <div class="muted tiny">Suggested replacement: <code>${escapeHtml(h.replace)}</code></div>
    `;
    results.appendChild(div);
  });
}

document.getElementById('lintRun')?.addEventListener('click', runLint);