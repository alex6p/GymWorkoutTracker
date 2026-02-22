/* Gym Tracker PWA (modern UI, no build tools)
   Storage: localStorage
   Weight stored internally in pounds; UI can show lb/kg.
*/

const LS_KEY = "gym_tracker_v2";
const LEGACY_KEYS = ["gym_tracker_v1"];

let state = loadState();
const ui = {
  tab: "workout",
  programs: { screen: "list", programId: null, workoutId: null },
  history: { screen: "list", sessionId: null }
};

// ---------- DOM ----------
const tabs = document.querySelectorAll(".tab");
const pages = document.querySelectorAll(".tabpage");

const headerPill = document.getElementById("headerPill");

// timer
const timerBar = document.getElementById("timerBar");
const timerCountdown = document.getElementById("timerCountdown");
const timerProgress = document.getElementById("timerProgress");
const timerSub = document.getElementById("timerSub");
document.getElementById("timerStop").addEventListener("click", () => stopTimer(true));
document.getElementById("timerPlus").addEventListener("click", () => addTimer(30));

// workout
const startTemplateSelect = document.getElementById("startTemplateSelect");
document.getElementById("startWorkoutBtn").addEventListener("click", () => {
  const tplId = startTemplateSelect.value;
  if (!tplId) return toast("Create a template in Programs first.");
  startWorkoutFromTemplate(tplId);
});
document.getElementById("endWorkoutBtn").addEventListener("click", finishWorkout);

const workoutStart = document.getElementById("workoutStart");
const activeWorkout = document.getElementById("activeWorkout");
const activeTitle = document.getElementById("activeTitle");
const activeMeta = document.getElementById("activeMeta");
const activeExercises = document.getElementById("activeExercises");

// programs/history roots
const programsRoot = document.getElementById("programsRoot");
const historyRoot = document.getElementById("historyRoot");

// exercises
const exSearch = document.getElementById("exerciseSearch");
const exercisesList = document.getElementById("exercisesList");
document.getElementById("addCustomExerciseBtn").addEventListener("click", () => openCustomExerciseModal());
exSearch.addEventListener("input", () => renderExercises());

// settings
const unitsToggle = document.getElementById("unitsToggle");
const autoRestToggle = document.getElementById("autoRestToggle");
const blankWeightUsesBaselineToggle = document.getElementById("blankWeightUsesBaselineToggle");
document.getElementById("resetAppBtn").addEventListener("click", resetAllData);

// modal
const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");
modalBackdrop.addEventListener("click", closeModal);

// ---------- events (tabs) ----------
tabs.forEach(btn => btn.addEventListener("click", () => {
  tabs.forEach(b => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  ui.tab = btn.dataset.tab;
  // reset sub-navigation when switching
  if (ui.tab !== "programs") ui.programs = { screen: "list", programId: null, workoutId: null };
  if (ui.tab !== "history") ui.history = { screen: "list", sessionId: null };
  showTab(ui.tab);
}));

function showTab(name) {
  pages.forEach(p => p.classList.add("hidden"));
  document.getElementById(`tab-${name}`).classList.remove("hidden");
  renderAll();
}

// ---------- state ----------
function DEFAULT_STATE() {
  return {
    settings: {
      isKg: false,
      autoRest: true,
      blankWeightUsesBaseline: true
    },
    exercises: seedExercises(),
    programs: [],
    sessions: [],
    activeSessionId: null,
    timer: {
      running: false,
      total: 0,
      remaining: 0,
      endTs: null,
      label: ""
    }
  };
}

function seedExercises() {
  return [
    ex("Bench Press","Chest","Barbell"),
    ex("Incline Dumbbell Press","Chest","Dumbbells"),
    ex("Overhead Press","Shoulders","Barbell"),
    ex("Lat Pulldown","Back","Cable"),
    ex("Barbell Row","Back","Barbell"),
    ex("Deadlift","Back","Barbell"),
    ex("Squat","Legs","Barbell"),
    ex("Leg Press","Legs","Machine"),
    ex("Romanian Deadlift","Legs","Barbell"),
    ex("Bicep Curl","Arms","Dumbbells"),
    ex("Tricep Pushdown","Arms","Cable")
  ];
}

function ex(name, muscleGroup, equipment) {
  return { id: uid(), name, muscleGroup, equipment, notes:"", isCustom:false };
}

function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try { return { ...DEFAULT_STATE(), ...JSON.parse(raw) }; } catch { /* fallthrough */ }
  }
  // migrate from legacy if exists
  for (const k of LEGACY_KEYS) {
    const legacy = localStorage.getItem(k);
    if (legacy) {
      try {
        const migrated = { ...DEFAULT_STATE(), ...JSON.parse(legacy) };
        localStorage.setItem(LS_KEY, JSON.stringify(migrated));
        // optional: keep legacy or remove
        // localStorage.removeItem(k);
        return migrated;
      } catch { /* ignore */ }
    }
  }
  return DEFAULT_STATE();
}

// ---------- utils ----------
function uid() { return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function unitLabel() { return state.settings.isKg ? "kg" : "lb"; }
function toDisplayWeight(lb) { return state.settings.isKg ? (lb / 2.2046226218) : lb; }
function toPounds(display) {
  const v = Number(display);
  if (!isFinite(v)) return 0;
  return state.settings.isKg ? (v * 2.2046226218) : v;
}
function fmtDateTime(ts) { return new Date(ts).toLocaleString(); }
function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ss = s % 60;
  if (h > 0) return `${h}h ${mm}m ${ss}s`;
  return `${mm}m ${ss}s`;
}
function fmtCountdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2,"0")}`;
}
function toast(msg) {
  headerPill.textContent = msg;
  headerPill.classList.remove("hidden");
  setTimeout(() => headerPill.classList.add("hidden"), 2200);
}

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
function txt(tag, cls, content) {
  const n = el(tag, cls);
  n.textContent = content;
  return n;
}
function iconBtn(symbol, title, onClick) {
  const b = el("button", "iconbtn");
  b.textContent = symbol;
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

// ---------- baseline lookup ----------
function lastSetForExercise(exerciseId) {
  const completed = state.sessions.filter(s => s.endedAt).sort((a,b)=>b.endedAt-a.endedAt);
  for (const sess of completed) {
    for (const se of sess.exercises) {
      if (se.exerciseId !== exerciseId) continue;
      if (!se.sets?.length) continue;
      const last = [...se.sets].sort((a,b)=>b.createdAt-a.createdAt)[0];
      return { reps: last.reps, weightLb: last.weightLb, date: last.createdAt };
    }
  }
  return null;
}

// ---------- timer ----------
let timerInterval = null;

function startTimer(seconds, label) {
  stopTimer(false);

  state.timer.running = true;
  state.timer.total = Math.max(0, seconds);
  state.timer.endTs = Date.now() + state.timer.total * 1000;
  state.timer.label = label || "";
  saveState();

  timerSub.textContent = state.timer.label || "—";
  timerBar.classList.remove("hidden");

  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}

function tickTimer() {
  if (!state.timer.running || !state.timer.endTs) return;
  const remaining = Math.max(0, Math.ceil((state.timer.endTs - Date.now()) / 1000));
  state.timer.remaining = remaining;
  saveState();

  timerCountdown.textContent = fmtCountdown(remaining);
  const pct = state.timer.total > 0 ? (1 - (remaining / state.timer.total)) * 100 : 0;
  timerProgress.style.width = `${Math.max(0, Math.min(100, pct))}%`;

  if (remaining <= 0) {
    stopTimer(true);
    try { navigator.vibrate?.([200,100,200]); } catch {}
  }
}

function stopTimer(hide) {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  state.timer.running = false;
  state.timer.total = 0;
  state.timer.remaining = 0;
  state.timer.endTs = null;
  state.timer.label = "";
  saveState();

  if (hide) timerBar.classList.add("hidden");
  timerProgress.style.width = "0%";
  timerCountdown.textContent = "0:00";
  timerSub.textContent = "—";
}

function addTimer(seconds) {
  if (!state.timer.running || !state.timer.endTs) return;
  state.timer.endTs += seconds * 1000;
  state.timer.total += seconds;
  saveState();
  tickTimer();
}

// ---------- templates ----------
function templatesFlat() {
  const out = [];
  for (const p of state.programs) {
    for (const w of p.workouts) {
      out.push({ programId: p.id, programName: p.name, workout: w });
    }
  }
  return out.sort((a,b) => (a.programName + a.workout.name).localeCompare(b.programName + b.workout.name));
}

function exerciseById(id) { return state.exercises.find(e => e.id === id) || null; }
function exerciseName(id) { return exerciseById(id)?.name || "Exercise"; }

// ---------- workout flow ----------
function getActiveSession() {
  if (!state.activeSessionId) return null;
  return state.sessions.find(s => s.id === state.activeSessionId) || null;
}

function startWorkoutFromTemplate(templateWorkoutId) {
  const flat = templatesFlat();
  const found = flat.find(x => x.workout.id === templateWorkoutId);
  if (!found) return toast("Template not found.");

  const session = {
    id: uid(),
    templateWorkoutId: found.workout.id,
    templateName: found.workout.name,
    programName: found.programName,
    startedAt: Date.now(),
    endedAt: null,
    exercises: found.workout.exercises.map((te, idx) => ({
      id: uid(),
      orderIndex: idx,
      exerciseId: te.exerciseId,
      targetSets: te.targetSets,
      targetReps: te.targetReps,
      restSeconds: te.restSeconds,
      sets: []
    }))
  };

  state.sessions.push(session);
  state.activeSessionId = session.id;
  saveState();
  renderAll();
  toast("Workout started");
}

function finishWorkout() {
  const sess = getActiveSession();
  if (!sess) return;
  sess.endedAt = Date.now();
  state.activeSessionId = null;
  saveState();
  stopTimer(true);
  ui.tab = "history";
  tabs.forEach(b => b.classList.remove("is-active"));
  document.querySelector('.tab[data-tab="history"]').classList.add("is-active");
  showTab("history");
}

function addSetToSessionExercise(sessionExerciseId, reps, weightDisplay) {
  const sess = getActiveSession();
  if (!sess) return;

  const se = sess.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;

  const repsNum = Number(reps);
  if (!isFinite(repsNum) || repsNum <= 0) return toast("Enter reps");

  const weightTrim = String(weightDisplay ?? "").trim();
  let weightLb = 0;

  if (!weightTrim && state.settings.blankWeightUsesBaseline) {
    const last = lastSetForExercise(se.exerciseId);
    if (last) weightLb = last.weightLb;
  } else {
    weightLb = toPounds(weightTrim);
  }

  const nextSetNumber = (se.sets.map(s => s.setNumber).reduce((a,b)=>Math.max(a,b), 0)) + 1;

  se.sets.push({
    id: uid(),
    setNumber: nextSetNumber,
    reps: Math.floor(repsNum),
    weightLb: Number.isFinite(weightLb) ? weightLb : 0,
    createdAt: Date.now()
  });

  saveState();
  renderWorkout();

  if (state.settings.autoRest) {
    startTimer(se.restSeconds || 90, `Next set • ${exerciseName(se.exerciseId)}`);
  }
}

// ---------- programs (navigation) ----------
function gotoProgramsList() {
  ui.programs = { screen: "list", programId: null, workoutId: null };
  renderPrograms();
}

function gotoProgram(programId) {
  ui.programs = { screen: "program", programId, workoutId: null };
  renderPrograms();
}

function gotoWorkout(programId, workoutId) {
  ui.programs = { screen: "workout", programId, workoutId };
  renderPrograms();
}

function addProgram(name) {
  const n = name.trim();
  if (!n) return;
  state.programs.push({ id: uid(), name: n, workouts: [] });
  saveState();
  renderPrograms();
}

function deleteProgram(programId) {
  if (!confirm("Delete this program?")) return;
  state.programs = state.programs.filter(p => p.id !== programId);
  saveState();
  gotoProgramsList();
}

function addWorkout(programId, name) {
  const n = name.trim();
  if (!n) return;
  const p = state.programs.find(x => x.id === programId);
  if (!p) return;
  p.workouts.push({ id: uid(), name: n, exercises: [] });
  saveState();
  renderPrograms();
}

function deleteWorkout(programId, workoutId) {
  if (!confirm("Delete this workout?")) return;
  const p = state.programs.find(x => x.id === programId);
  if (!p) return;
  p.workouts = p.workouts.filter(w => w.id !== workoutId);
  saveState();
  gotoProgram(programId);
}

function addTemplateExercise(programId, workoutId, exerciseId, sets, reps, rest) {
  const p = state.programs.find(x => x.id === programId);
  const w = p?.workouts.find(x => x.id === workoutId);
  if (!w) return;

  w.exercises.push({
    id: uid(),
    exerciseId,
    targetSets: Number(sets) || 3,
    targetReps: Number(reps) || 10,
    restSeconds: Number(rest) || 90
  });

  saveState();
  renderPrograms();
}

function removeTemplateExercise(programId, workoutId, templateExerciseId) {
  const p = state.programs.find(x => x.id === programId);
  const w = p?.workouts.find(x => x.id === workoutId);
  if (!w) return;
  w.exercises = w.exercises.filter(te => te.id !== templateExerciseId);
  saveState();
  renderPrograms();
}

// ---------- exercises ----------
function addCustomExercise({ name, muscleGroup, equipment, notes }) {
  const n = name.trim();
  if (!n) return toast("Name required");
  state.exercises.push({
    id: uid(),
    name: n,
    muscleGroup: (muscleGroup || "Other").trim() || "Other",
    equipment: (equipment || "Other").trim() || "Other",
    notes: (notes || "").trim(),
    isCustom: true
  });
  saveState();
  renderExercises();
  toast("Exercise added");
}

function deleteCustomExercise(exId) {
  const ex = exerciseById(exId);
  if (!ex || !ex.isCustom) return;
  if (!confirm(`Delete "${ex.name}"?`)) return;

  // remove from library
  state.exercises = state.exercises.filter(e => e.id !== exId);

  // remove from templates
  for (const p of state.programs) {
    for (const w of p.workouts) {
      w.exercises = w.exercises.filter(te => te.exerciseId !== exId);
    }
  }

  saveState();
  renderExercises();
  toast("Deleted");
}

// ---------- history ----------
function gotoHistoryList() {
  ui.history = { screen: "list", sessionId: null };
  renderHistory();
}

function gotoHistoryDetail(sessionId) {
  ui.history = { screen: "detail", sessionId };
  renderHistory();
}

// ---------- modal ----------
function openModal(html) {
  modalContent.innerHTML = html;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  modalContent.innerHTML = "";
}

function openAddProgramModal() {
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">New program</div>
        <div class="sheetsub">Example: PPL, Upper/Lower, 5x5</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <input id="mProgramName" class="input" placeholder="Program name" />

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Create</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;
  document.getElementById("mSave").onclick = () => {
    const name = document.getElementById("mProgramName").value;
    addProgram(name);
    closeModal();
  };
}

function openAddWorkoutModal(programId) {
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">New workout</div>
        <div class="sheetsub">Example: Push Day, Pull Day, Legs</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <input id="mWorkoutName" class="input" placeholder="Workout name" />

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Add</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;
  document.getElementById("mSave").onclick = () => {
    const name = document.getElementById("mWorkoutName").value;
    addWorkout(programId, name);
    closeModal();
  };
}

function openAddTemplateExerciseModal(programId, workoutId) {
  const options = state.exercises
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name))
    .map(ex => `<option value="${ex.id}">${ex.name}</option>`)
    .join("");

  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">Add exercise</div>
        <div class="sheetsub">Sets, reps, and rest come from the template.</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="row">
      <select id="mExercise">${options}</select>
    </div>

    <div class="grid2" style="margin-top:10px">
      <input id="mSets" class="input" type="number" min="1" value="3" placeholder="Sets" />
      <input id="mReps" class="input" type="number" min="1" value="10" placeholder="Reps" />
      <input id="mRest" class="input" type="number" min="10" step="10" value="90" placeholder="Rest (sec)" />
      <div class="muted" style="padding: 10px 2px">Tip: Bench might be 120s, curls 60s.</div>
    </div>

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Add</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;
  document.getElementById("mSave").onclick = () => {
    const exerciseId = document.getElementById("mExercise").value;
    const sets = document.getElementById("mSets").value;
    const reps = document.getElementById("mReps").value;
    const rest = document.getElementById("mRest").value;
    addTemplateExercise(programId, workoutId, exerciseId, sets, reps, rest);
    closeModal();
  };
}

function openSetModal(sessionExerciseId) {
  const sess = getActiveSession();
  if (!sess) return;

  const se = sess.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;

  const exId = se.exerciseId;
  const last = lastSetForExercise(exId);
  const lastLine = last
    ? `Last: ${toDisplayWeight(last.weightLb).toFixed(1)} ${unitLabel()} × ${last.reps} reps`
    : `No history yet`;

  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">${exerciseName(exId)}</div>
        <div class="sheetsub">${lastLine} • Rest ${se.restSeconds}s</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="grid2">
      <input id="mReps" class="input" type="number" min="1" placeholder="Reps" />
      <input id="mWeight" class="input" type="number" step="0.5" placeholder="Weight (${unitLabel()})" />
    </div>

    <div class="help">Tip: leave weight blank to use your baseline (if enabled in Settings).</div>

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Save set</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;

  // show baseline weight as placeholder
  if (last) {
    const w = document.getElementById("mWeight");
    w.placeholder = `Weight (${unitLabel()}) — e.g. ${toDisplayWeight(last.weightLb).toFixed(1)}`;
  }

  document.getElementById("mSave").onclick = () => {
    const reps = document.getElementById("mReps").value;
    const weight = document.getElementById("mWeight").value;
    addSetToSessionExercise(sessionExerciseId, reps, weight);
    closeModal();
  };
}

function openCustomExerciseModal() {
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">New exercise</div>
        <div class="sheetsub">Add your own movement to the library.</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="grid2">
      <input id="mName" class="input" placeholder="Name (e.g., Cable Fly)" />
      <input id="mMuscle" class="input" placeholder="Muscle group (Chest)" />
      <input id="mEquip" class="input" placeholder="Equipment (Cable)" />
      <input id="mNotes" class="input" placeholder="Notes (optional)" />
    </div>

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Save</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;
  document.getElementById("mSave").onclick = () => {
    addCustomExercise({
      name: document.getElementById("mName").value,
      muscleGroup: document.getElementById("mMuscle").value,
      equipment: document.getElementById("mEquip").value,
      notes: document.getElementById("mNotes").value
    });
    closeModal();
  };
}

// ---------- render ----------
function renderAll() {
  renderHeader();
  renderTemplateSelect();
  renderWorkout();
  renderPrograms();
  renderExercises();
  renderHistory();
  renderSettings();
}

function renderHeader() {
  const sess = getActiveSession();
  if (!sess) {
    headerPill.classList.add("hidden");
    return;
  }
  headerPill.textContent = "Active workout";
  headerPill.classList.remove("hidden");
}

function renderTemplateSelect() {
  const flat = templatesFlat();
  startTemplateSelect.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = flat.length ? "Select a workout template…" : "No templates yet";
  startTemplateSelect.appendChild(opt0);

  for (const x of flat) {
    const opt = document.createElement("option");
    opt.value = x.workout.id;
    opt.textContent = `${x.programName} • ${x.workout.name}`;
    startTemplateSelect.appendChild(opt);
  }
}

function renderWorkout() {
  const sess = getActiveSession();

  if (!sess) {
    workoutStart.classList.remove("hidden");
    activeWorkout.classList.add("hidden");
    return;
  }

  workoutStart.classList.add("hidden");
  activeWorkout.classList.remove("hidden");

  activeTitle.textContent = sess.templateName || "Workout";
  activeMeta.textContent = `${sess.programName} • Started ${fmtDateTime(sess.startedAt)}`;

  activeExercises.innerHTML = "";

  for (const se of sess.exercises.sort((a,b)=>a.orderIndex-b.orderIndex)) {
    const ex = exerciseById(se.exerciseId);
    const card = el("div", "card");

    const header = el("div", "exercise-header");
    const left = el("div");

    left.appendChild(txt("div", "exercise-title", ex?.name || "Exercise"));
    left.appendChild(txt("div", "exercise-meta", `Target: ${se.targetSets} × ${se.targetReps} • Rest: ${se.restSeconds}s`));

    const last = lastSetForExercise(se.exerciseId);
    if (last) {
      left.appendChild(txt("div", "lastline",
        `Last: ${toDisplayWeight(last.weightLb).toFixed(1)} ${unitLabel()} × ${last.reps} reps`
      ));
    }

    const right = el("div");
    right.appendChild(iconBtn("＋", "Add set", () => openSetModal(se.id)));

    header.appendChild(left);
    header.appendChild(right);

    const setsWrap = el("div", "sets");

    if (!se.sets.length) {
      setsWrap.appendChild(txt("div", "small", "No sets yet"));
    } else {
      for (const s of se.sets.slice().sort((a,b)=>a.setNumber-b.setNumber)) {
        const row = el("div", "set-row");
        row.appendChild(txt("span", "badge", `Set ${s.setNumber}`));
        row.appendChild(txt("span", "", `${s.reps} reps`));
        row.appendChild(txt("span", "small", "•"));
        row.appendChild(txt("span", "", `${toDisplayWeight(s.weightLb).toFixed(1)} ${unitLabel()}`));
        setsWrap.appendChild(row);
      }
    }

    card.appendChild(header);
    card.appendChild(setsWrap);
    activeExercises.appendChild(card);
  }
}

function renderPrograms() {
  programsRoot.innerHTML = "";

  if (ui.programs.screen === "list") {
    const header = el("div", "panel");
    const headRow = el("div", "row space-between");
    const titleWrap = el("div");
    titleWrap.appendChild(txt("h2", "", "Programs"));
    titleWrap.appendChild(txt("div", "muted", "Create a program, then add workouts and exercises."));
    headRow.appendChild(titleWrap);
    headRow.appendChild(iconBtn("＋", "New program", openAddProgramModal));
    header.appendChild(headRow);
    programsRoot.appendChild(header);

    if (!state.programs.length) {
      programsRoot.appendChild(txt("div", "panel muted", "No programs yet. Tap + to add one."));
      return;
    }

    for (const p of state.programs.slice().sort((a,b)=>a.name.localeCompare(b.name))) {
      const card = el("div", "card");
      const row = el("div", "row space-between");

      const left = el("div");
      left.appendChild(txt("div", "exercise-title", p.name));
      left.appendChild(txt("div", "exercise-meta", `${p.workouts.length} workout(s)`));
      row.appendChild(left);

      const right = el("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.appendChild(iconBtn("›", "Open", () => gotoProgram(p.id)));
      right.appendChild(iconBtn("⋯", "More", () => {
        openModal(`
          <div class="sheethead">
            <div>
              <div class="sheettitle">${p.name}</div>
              <div class="sheetsub">Program actions</div>
            </div>
            <button class="iconbtn" id="mClose">✕</button>
          </div>

          <div class="row">
            <button class="btn btn-danger" id="mDelete">Delete program</button>
            <button class="btn btn-ghost" id="mCancel">Cancel</button>
          </div>
        `);

        document.getElementById("mClose").onclick = closeModal;
        document.getElementById("mCancel").onclick = closeModal;
        document.getElementById("mDelete").onclick = () => { closeModal(); deleteProgram(p.id); };
      }));
      row.appendChild(right);

      card.appendChild(row);
      programsRoot.appendChild(card);
    }

    return;
  }

  if (ui.programs.screen === "program") {
    const p = state.programs.find(x => x.id === ui.programs.programId);
    if (!p) return gotoProgramsList();

    const panel = el("div", "panel");
    const headRow = el("div", "row space-between");

    const left = el("div");
    left.appendChild(txt("h2","",p.name));
    left.appendChild(txt("div","muted","Workouts inside this program."));
    headRow.appendChild(left);

    const right = el("div");
    right.style.display="flex";
    right.style.gap="8px";
    right.appendChild(iconBtn("‹","Back",gotoProgramsList));
    right.appendChild(iconBtn("＋","Add workout",() => openAddWorkoutModal(p.id)));
    headRow.appendChild(right);

    panel.appendChild(headRow);
    programsRoot.appendChild(panel);

    if (!p.workouts.length) {
      programsRoot.appendChild(txt("div","panel muted","No workouts yet. Tap + to add one."));
      return;
    }

    for (const w of p.workouts.slice().sort((a,b)=>a.name.localeCompare(b.name))) {
      const card = el("div","card");
      const row = el("div","row space-between");

      const wl = el("div");
      wl.appendChild(txt("div","exercise-title",w.name));
      wl.appendChild(txt("div","exercise-meta",`${w.exercises.length} exercise(s)`));
      row.appendChild(wl);

      const wr = el("div");
      wr.style.display="flex";
      wr.style.gap="8px";
      wr.appendChild(iconBtn("›","Open",() => gotoWorkout(p.id, w.id)));
      wr.appendChild(iconBtn("🗑","Delete",() => deleteWorkout(p.id, w.id)));
      row.appendChild(wr);

      card.appendChild(row);
      programsRoot.appendChild(card);
    }
    return;
  }

  if (ui.programs.screen === "workout") {
    const p = state.programs.find(x => x.id === ui.programs.programId);
    const w = p?.workouts.find(x => x.id === ui.programs.workoutId);
    if (!p || !w) return gotoProgramsList();

    const panel = el("div","panel");
    const headRow = el("div","row space-between");

    const left = el("div");
    left.appendChild(txt("h2","",w.name));
    left.appendChild(txt("div","muted","Template exercises (sets/reps/rest)."));
    headRow.appendChild(left);

    const right = el("div");
    right.style.display="flex";
    right.style.gap="8px";
    right.appendChild(iconBtn("‹","Back",() => gotoProgram(p.id)));
    right.appendChild(iconBtn("＋","Add exercise",() => openAddTemplateExerciseModal(p.id, w.id)));
    headRow.appendChild(right);

    panel.appendChild(headRow);
    programsRoot.appendChild(panel);

    if (!w.exercises.length) {
      programsRoot.appendChild(txt("div","panel muted","No exercises yet. Tap + to add one."));
      return;
    }

    for (const te of w.exercises.slice()) {
      const ex = exerciseById(te.exerciseId);
      const card = el("div","card");

      const row = el("div","row space-between");
      const tl = el("div");
      tl.appendChild(txt("div","exercise-title",ex?.name || "Exercise"));
      tl.appendChild(txt("div","exercise-meta",`Target: ${te.targetSets} × ${te.targetReps} • Rest: ${te.restSeconds}s`));
      row.appendChild(tl);

      row.appendChild(iconBtn("✕","Remove",() => removeTemplateExercise(p.id, w.id, te.id)));
      card.appendChild(row);

      programsRoot.appendChild(card);
    }
  }
}

function renderExercises() {
  exercisesList.innerHTML = "";

  const q = (exSearch.value || "").trim().toLowerCase();
  const list = state.exercises
    .filter(ex => !q || ex.name.toLowerCase().includes(q))
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name));

  for (const ex of list) {
    const card = el("div","card");

    const row = el("div","row space-between");
    const left = el("div");
    left.appendChild(txt("div","exercise-title",ex.name));
    left.appendChild(txt("div","exercise-meta",`${ex.muscleGroup} • ${ex.equipment}${ex.isCustom ? " • Custom" : ""}`));
    row.appendChild(left);

    const right = el("div");
    right.style.display="flex";
    right.style.gap="8px";

    if (ex.isCustom) {
      right.appendChild(iconBtn("🗑","Delete",() => deleteCustomExercise(ex.id)));
    }
    row.appendChild(right);

    card.appendChild(row);

    if (ex.notes) card.appendChild(txt("div","help",ex.notes));
    exercisesList.appendChild(card);
  }
}

function renderHistory() {
  historyRoot.innerHTML = "";

  const completed = state.sessions.filter(s => s.endedAt).sort((a,b)=>b.endedAt-a.endedAt);

  if (ui.history.screen === "list") {
    const panel = el("div","panel");
    panel.appendChild(txt("h2","", "History"));
    panel.appendChild(txt("div","muted","Completed workouts."));
    historyRoot.appendChild(panel);

    if (!completed.length) {
      historyRoot.appendChild(txt("div","panel muted","No completed workouts yet."));
      return;
    }

    for (const s of completed) {
      const card = el("div","card");
      const row = el("div","row space-between");

      const left = el("div");
      left.appendChild(txt("div","exercise-title",s.templateName || "Workout"));
      left.appendChild(txt("div","exercise-meta",`${fmtDateTime(s.startedAt)} • ${fmtDuration(s.endedAt - s.startedAt)}`));
      row.appendChild(left);

      row.appendChild(iconBtn("›","Open",() => gotoHistoryDetail(s.id)));
      card.appendChild(row);

      const names = s.exercises.map(se => exerciseName(se.exerciseId)).join(", ");
      if (names) card.appendChild(txt("div","help",names));

      historyRoot.appendChild(card);
    }
    return;
  }

  if (ui.history.screen === "detail") {
    const s = state.sessions.find(x => x.id === ui.history.sessionId);
    if (!s) return gotoHistoryList();

    const panel = el("div","panel");
    const headRow = el("div","row space-between");

    const left = el("div");
    left.appendChild(txt("h2","", s.templateName || "Workout"));
    left.appendChild(txt("div","muted", `${fmtDateTime(s.startedAt)} • ${fmtDuration(s.endedAt - s.startedAt)}`));
    headRow.appendChild(left);

    headRow.appendChild(iconBtn("‹","Back",gotoHistoryList));
    panel.appendChild(headRow);
    historyRoot.appendChild(panel);

    for (const se of s.exercises.slice().sort((a,b)=>a.orderIndex-b.orderIndex)) {
      const exName = exerciseName(se.exerciseId);
      const card = el("div","card");

      card.appendChild(txt("div","exercise-title",exName));

      if (!se.sets.length) {
        card.appendChild(txt("div","small","No sets"));
      } else {
        for (const set of se.sets.slice().sort((a,b)=>a.setNumber-b.setNumber)) {
          card.appendChild(
            txt("div","help",
              `Set ${set.setNumber}: ${set.reps} reps • ${toDisplayWeight(set.weightLb).toFixed(1)} ${unitLabel()}`
            )
          );
        }
      }
      historyRoot.appendChild(card);
    }
  }
}

function renderSettings() {
  unitsToggle.checked = !!state.settings.isKg;
  autoRestToggle.checked = !!state.settings.autoRest;
  blankWeightUsesBaselineToggle.checked = !!state.settings.blankWeightUsesBaseline;

  unitsToggle.onchange = () => { state.settings.isKg = unitsToggle.checked; saveState(); renderAll(); };
  autoRestToggle.onchange = () => { state.settings.autoRest = autoRestToggle.checked; saveState(); };
  blankWeightUsesBaselineToggle.onchange = () => { state.settings.blankWeightUsesBaseline = blankWeightUsesBaselineToggle.checked; saveState(); };
}

// ---------- reset ----------
function resetAllData() {
  if (!confirm("Reset all data? This cannot be undone.")) return;
  state = DEFAULT_STATE();
  saveState();
  stopTimer(true);
  ui.programs = { screen: "list", programId: null, workoutId: null };
  ui.history = { screen: "list", sessionId: null };
  renderAll();
  toast("Reset complete");
}

// ---------- boot ----------
renderAll();
showTab("workout");

// restore timer if running
if (state.timer.running && state.timer.endTs) {
  timerBar.classList.remove("hidden");
  timerSub.textContent = state.timer.label || "—";
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}
