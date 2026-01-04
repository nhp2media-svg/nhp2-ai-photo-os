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

  // library (legacy browse)
  filterMode: document.getElementById('filterMode'),
  filterCategory: document.getElementById('filterCategory'),
  filterSearch: document.getElementById('filterSearch'),
  applyFilters: document.getElementById('applyFilters'),
  results: document.getElementById('results'),


// library (control-based)
libMode: document.getElementById('libMode'),
libCategory: document.getElementById('libCategory'),
libPlatform: document.getElementById('libPlatform'),
libFields: document.getElementById('libFields'),
libDesc: document.getElementById('libDesc'),
libRun: document.getElementById('libRun'),
libOutput: document.getElementById('libOutput'),
libCopy: document.getElementById('libCopy'),
libDownload: document.getElementById('libDownload'),
libRiskBadge: document.getElementById('libRiskBadge'),
libRiskDetails: document.getElementById('libRiskDetails'),
libLockIdentity: document.getElementById('libLockIdentity'),
libPreserveGrain: document.getElementById('libPreserveGrain'),
libNoCinematic: document.getElementById('libNoCinematic'),
libNoBeautify: document.getElementById('libNoBeautify'),

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

      if(els.results) renderResults(PROMPTS.slice(0, 30));
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
  if(els.results) renderResults(list.slice(0, 100));
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
  if(els.applyFilters) els.applyFilters.addEventListener('click', applyFilters);

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
  bindLibraryGenerator();
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

/* ---------------- CONTROL-BASED PROMPT LIBRARY ---------------- */

const CATEGORY_DEFS = {
  ENHANCE_FULL_IMAGE: {
    desc: "Clean, realistic enhancement of the entire photo: clarity, tonal balance, texture preservation. No identity changes.",
    fields: [
      { id:"enhStrength", label:"Enhancement strength", type:"select", options:[["low","Low (safest)"],["med","Medium"],["high","High (riskier)"]] },
      { id:"denoise", label:"Compression cleanup", type:"select", options:[["gentle","Gentle (recommended)"],["standard","Standard"],["aggressive","Aggressive (risk of artifacts)"]] },
    ],
    inject: (v)=>[
      `Enhancement strength: ${v.enhStrength || "low"}.`,
      `Artifact cleanup: ${v.denoise || "gentle"}.`
    ]
  },
  FACE_IDENTITY: {
    desc: "Face-only quality improvements while preserving identity exactly. Best for sensitive images.",
    fields: [
      { id:"faceDetail", label:"Face detail level", type:"select", options:[["subtle","Subtle (recommended)"],["normal","Normal"],["strong","Strong (drift risk)"]] },
      { id:"eyes", label:"Eyes handling", type:"select", options:[["lock","Lock shape/color; only sharpen natural catchlights"],["micro","Micro-contrast only"],["none","No changes"]] },
    ],
    inject: (v)=>[
      `Face detail level: ${v.faceDetail || "subtle"}.`,
      `Eyes: ${v.eyes || "lock"}.`
    ]
  },
  SKIN_TEXTURE_GRAIN: {
    desc: "Restore natural photographic texture and preserve organic grain. Prevents plastic skin and blotchy artifacts.",
    fields: [
      { id:"grain", label:"Grain handling", type:"select", options:[["preserve","Preserve (recommended)"],["normalize","Normalize slightly"],["reduce","Reduce a bit (risk: waxy)"]] },
      { id:"skin", label:"Skin texture", type:"select", options:[["natural","Natural pores + micro-variation"],["soft","Softer but realistic"],["detail","More detail (risk: synthetic)"]] },
    ],
    inject: (v)=>[
      `Grain: ${v.grain || "preserve"}.`,
      `Skin texture: ${v.skin || "natural"}.`
    ]
  },
  LIGHTING_COLOR: {
    desc: "Even out exposure, shadows, and highlights while preserving original lighting direction and color cast.",
    fields: [
      { id:"exposure", label:"Exposure correction", type:"select", options:[["gentle","Gentle (recommended)"],["balanced","Balanced"],["strong","Strong (risk: modernized look)"]] },
      { id:"wb", label:"White balance", type:"select", options:[["preserve","Preserve original cast"],["neutralize","Neutralize slightly"],["match","Match skin to original (strict)"]] },
    ],
    inject: (v)=>[
      `Exposure correction: ${v.exposure || "gentle"}.`,
      `White balance: ${v.wb || "preserve"}.`
    ]
  },
  BODY_PROPORTION: {
    desc: "Body realism and safe definition. Enhances existing definition through lighting only. No reshaping.",
    fields: [
      { id:"muscle", label:"Muscle definition", type:"select", options:[["none","None"],["subtle","Subtle (recommended)"],["moderate","Moderate"],["strong","Strong (risk: exaggeration)"]] },
      { id:"proportionLock", label:"Proportion lock", type:"select", options:[["strict","Strict (recommended)"],["normal","Normal"]] },
    ],
    inject: (v)=>[
      `Muscle definition: ${v.muscle || "subtle"} (lighting-based only).`,
      `Proportion lock: ${v.proportionLock || "strict"}.`
    ]
  },
  POSE_ANGLE_SAFE: {
    desc: "Change pose and/or camera angle while preserving facial identity exactly. Highest drift risk—use Archival first.",
    fields: [
      { id:"changeType", label:"Change type", type:"select", options:[["camera","Camera angle only"],["pose","Pose only"],["both","Pose + camera angle"]] },
      { id:"axis", label:"Rotation axis", type:"select", options:[["yaw","Yaw (left/right)"],["pitch","Pitch (up/down)"],["roll","Roll (tilt)"]] },
      { id:"degrees", label:"Rotation amount", type:"select", options:[["10","10° (safest)"],["20","20°"],["30","30°"],["45","45° (high risk)"]] },
      { id:"target", label:"Rotate", type:"select", options:[["head","Head only"],["body","Body only"],["both","Head + body (hardest)"]] },
    ],
    inject: (v)=>[
      `Change type: ${v.changeType || "camera"}.`,
      `Rotate ${v.target || "head"} by ${v.degrees || "10"}° using ${v.axis || "yaw"} (yaw/pitch/roll) while preserving exact facial geometry.`,
      `Recalculate lighting and shadows physically for the new angle; do not modernize or beautify.`
    ]
  },
  FACE_REPLACE: {
    desc: "Composite / face replace with strict identity source. Requires precise angle, lighting, and grain match.",
    fields: [
      { id:"match", label:"Match priority", type:"select", options:[["lighting","Lighting + grain match"],["angle","Angle + perspective match"],["both","Angle + lighting + grain (recommended)"]] },
      { id:"blend", label:"Blend edge softness", type:"select", options:[["soft","Soft natural edge"],["medium","Medium"],["tight","Tight (risk: seams)"]] },
    ],
    inject: (v)=>[
      `Match priority: ${v.match || "both"}.`,
      `Blend: ${v.blend || "soft"} edge transitions; avoid seams.`,
      `Identity source is authoritative; forbid face averaging or blending multiple identities.`
    ]
  },
  UPSCALE_RESOLUTION: {
    desc: "Upscale while preserving texture. Avoid invented micro-detail and halos.",
    fields: [
      { id:"targetRes", label:"Target size", type:"select", options:[["4k","4K"],["8k","8K"],["2x","2× upscale"],["4x","4× upscale (riskier)"]] },
      { id:"sharp", label:"Sharpening", type:"select", options:[["none","None"],["gentle","Gentle (recommended)"],["strong","Strong (risk: halos)"]] },
    ],
    inject: (v)=>[
      `Target: ${v.targetRes || "8k"}.`,
      `Sharpening: ${v.sharp || "gentle"}; avoid halos and oversharpening.`,
      `Do not invent new detail; reconstruct only what is physically plausible.`
    ]
  },
  RETOUCH: {
    desc: "Photoshop-style cleanup: remove small distractions and blemishes without changing identity.",
    fields: [
      { id:"retouch", label:"Retouch level", type:"select", options:[["minimal","Minimal (recommended)"],["standard","Standard"],["heavy","Heavy (risk: plastic)"]] },
      { id:"remove", label:"Remove", type:"select", options:[["blemishes","Minor blemishes only"],["distract","Small distractions"],["both","Both (careful)"]] },
    ],
    inject: (v)=>[
      `Retouch level: ${v.retouch || "minimal"}.`,
      `Remove: ${v.remove || "blemishes"} while preserving texture and age cues.`,
      `No airbrush look; keep pores, grain, and natural variation.`
    ]
  },
  STYLE_CONTROLLED: {
    desc: "Apply a style while keeping identity intact. Style transfer increases reinterpretation risk.",
    fields: [
      { id:"style", label:"Style intensity", type:"select", options:[["subtle","Subtle (recommended)"],["moderate","Moderate"],["strong","Strong (risk: drift)"]] },
      { id:"keepPhoto", label:"Keep photographic realism", type:"select", options:[["yes","Yes (recommended)"],["partial","Partial"],["no","No (not recommended)"]] },
    ],
    inject: (v)=>[
      `Style intensity: ${v.style || "subtle"}.`,
      `Photographic realism: ${v.keepPhoto || "yes"}.`,
      `Do not distort faces/bodies; do not add elements; keep lighting physically plausible.`
    ]
  },
};

function libGetMode(){ return els.libMode?.value || "ARCHIVAL_USE_ONLY"; }
function libGetCategory(){ return els.libCategory?.value || "ENHANCE_FULL_IMAGE"; }
function libGetPlatform(){ return els.libPlatform?.value || "GENERAL"; }

function libReadFieldValues(){
  const box = els.libFields;
  const vals = {};
  if(!box) return vals;
  box.querySelectorAll('[data-lib-field]').forEach(el => {
    vals[el.dataset.libField] = el.value;
  });
  return vals;
}

function renderLibFields(){
  if(!els.libFields || !els.libDesc) return;
  const key = libGetCategory();
  const def = CATEGORY_DEFS[key];
  els.libDesc.textContent = def ? def.desc : "Select a category to see options.";
  els.libFields.innerHTML = "";

  if(!def || !def.fields || !def.fields.length){
    els.libFields.innerHTML = "<div class='muted small'>No additional options for this category.</div>";
    return;
  }

  def.fields.forEach(f => {
    const wrap = document.createElement('div');
    wrap.className = "field";
    const label = document.createElement('label');
    label.className = "small";
    label.textContent = f.label;
    wrap.appendChild(label);

    if(f.type === "select"){
      const sel = document.createElement('select');
      sel.dataset.libField = f.id;
      f.options.forEach(([v,t]) => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = t;
        sel.appendChild(opt);
      });
      wrap.appendChild(sel);
    }
    els.libFields.appendChild(wrap);
  });
}

function libRiskScore(){
  const mode = libGetMode();
  const cat = libGetCategory();
  // reuse builder risk baseline map
  let score = 10;
  let reasons = [];

  if(mode === "ARCHIVAL_USE_ONLY"){ score += 5; reasons.push("Archival mode (higher sensitivity)."); }

  const taskRisk = {
    ENHANCE_FULL_IMAGE: 10,
    FACE_IDENTITY: 15,
    SKIN_TEXTURE_GRAIN: 12,
    LIGHTING_COLOR: 10,
    BODY_PROPORTION: 18,
    POSE_ANGLE_SAFE: 35,
    FACE_REPLACE: 45,
    UPSCALE_RESOLUTION: 14,
    RETOUCH: 16,
    STYLE_CONTROLLED: 28
  };
  score += (taskRisk[cat] || 12);

  if(cat === "POSE_ANGLE_SAFE") reasons.push("Angle/pose changes require geometry synthesis (drift risk).");
  if(cat === "FACE_REPLACE") reasons.push("Face replacement/compositing is extremely high risk.");

  // Safety toggles reduce risk
  if(els.libLockIdentity?.checked){ score -= 10; reasons.push("Identity lock enabled."); }
  if(els.libPreserveGrain?.checked) score -= 3;
  if(els.libNoCinematic?.checked) score -= 3;
  if(els.libNoBeautify?.checked) score -= 4;

  score = Math.max(0, Math.min(100, score));
  return {score, reasons};
}

function libPlatformHeader(platform){
  if(platform === "CHATGPT") return "PLATFORM TARGET: ChatGPT Image (GPT-Image / chatgpt-image-latest)\n";
  if(platform === "GEMINI") return "PLATFORM TARGET: Google Gemini Image (nano-banana pro)\n";
  return "";
}

function libGeneratePrompt(){
  const mode = libGetMode();
  const category = libGetCategory();
  const platform = libGetPlatform();
  const def = CATEGORY_DEFS[category];
  const v = libReadFieldValues();

  const base = findGoldPrompt(mode, category); // from existing packs
  const hdr = libPlatformHeader(platform);

  const injectLines = (def && def.inject) ? def.inject(v) : [];
  const specifics = injectLines.length ? ("\nCATEGORY-SPECIFIC DIRECTIVES:\n- " + injectLines.join("\n- ") + "\n") : "";

  const safetyLines = [];
  if(els.libLockIdentity?.checked) safetyLines.push("Do not alter facial structure, age, ethnicity, skin tone, or expression.");
  if(els.libPreserveGrain?.checked) safetyLines.push("Preserve organic grain / sensor noise; do not remove completely.");
  if(els.libNoCinematic?.checked) safetyLines.push("Forbid cinematic grading, HDR, oversaturation, and stylized glow.");
  if(els.libNoBeautify?.checked) safetyLines.push("Forbid beautification, de-aging, face reshaping, and identity blending.");
  const safetyBlock = safetyLines.length ? ("\nSAFETY OVERRIDES (NON-NEGOTIABLE):\n- " + safetyLines.join("\n- ") + "\n") : "";

  const modeLine = (mode === "ARCHIVAL_USE_ONLY")
    ? "ARCHIVAL MODE: prioritize truth over aesthetics.\n"
    : "COMMERCIAL/EDITORIAL MODE: professional polish without identity drift.\n";

  const out = [hdr, modeLine, base, specifics, safetyBlock].join("\n").trim();
  if(els.libOutput) els.libOutput.value = out;

  const {score, reasons} = libRiskScore();
  const b = badgeFor(score);
  if(els.libRiskBadge){
    els.libRiskBadge.className = `badge ${b.cls}`;
    els.libRiskBadge.textContent = b.label;
  }
  if(els.libRiskDetails) els.libRiskDetails.textContent = reasons.join(" ");
  if(score >= 60) showNotice("High drift risk detected. Reduce rotation degrees, prefer Archival, and stop early.", "bad");
  else if(score >= 35) showNotice("Medium drift risk. Run a conservative pass first and compare faces carefully.", "warn");
}

function libCopy(){
  const txt = (els.libOutput?.value || "").trim();
  if(!txt) return;
  navigator.clipboard.writeText(txt).then(()=>showNotice("Copied library prompt.", "warn"));
}
function libDownload(){
  const txt = (els.libOutput?.value || "").trim();
  if(!txt) return;
  const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "AI_Photo_OS_Library_Prompt.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  showNotice("Downloaded library prompt file.", "warn");
}

function bindLibraryGenerator(){
  if(!els.libCategory) return; // library panel not present
  renderLibFields();
  els.libCategory.addEventListener('change', renderLibFields);
  els.libMode.addEventListener('change', () => {
    // update risk badge quickly
    const {score} = libRiskScore();
    const b = badgeFor(score);
    els.libRiskBadge.className = `badge ${b.cls}`;
    els.libRiskBadge.textContent = b.label;
  });
  // update risk when toggles change
  [els.libLockIdentity, els.libPreserveGrain, els.libNoCinematic, els.libNoBeautify].forEach(el => {
    el?.addEventListener('change', () => {
      const {score} = libRiskScore();
      const b = badgeFor(score);
      els.libRiskBadge.className = `badge ${b.cls}`;
      els.libRiskBadge.textContent = b.label;
    });
  });
  els.libRun.addEventListener('click', libGeneratePrompt);
  els.libCopy.addEventListener('click', libCopy);
  els.libDownload.addEventListener('click', libDownload);
}