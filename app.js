/* Gym Tracker PWA (Hamburger menu + simple program builder)
   Storage: localStorage
   Weight stored internally in pounds; UI can show lb/kg.

   NOTE: If you previously had a version that "did nothing",
   it was likely service worker cache. This is v3 and updates sw.js cache.
*/

const LS_KEY = "gym_tracker_v3";
const LEGACY_KEYS = ["gym_tracker_v2", "gym_tracker_v1"];

let state = loadState();
let route = "workout";

const ui = {
  programs: { screen: "list", programId: null, workoutId: null },
  history: { screen: "list", sessionId: null }
};

// ---------- DOM ----------
const drawer = document.getElementById("drawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const drawerClose = document.getElementById("drawerClose");
const menuBtn = document.getElementById("menuBtn");
const navItems = Array.from(document.querySelectorAll(".navitem"));

const routeLabel = document.getElementById("routeLabel");
const headerPill = document.getElementById("headerPill");

menuBtn.addEventListener("click", openDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);
drawerClose.addEventListener("click", closeDrawer);
navItems.forEach(btn => btn.addEventListener("click", () => {
  const r = btn.dataset.route;
  setRoute(r);
  closeDrawer();
}));

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
  if (!tplId) return toast("Create a workout in Programs first.");
  startWorkoutFromTemplate(tplId);
});
document.getElementById("endWorkoutBtn").addEventListener("click", finishWorkout);

const workoutStart = document.getElementById("workoutStart");
const activeWorkout = document.getElementById("activeWorkout");
const activeTitle = document.getElementById("activeTitle");
const activeMeta = document.getElementById("activeMeta");
const activeExercises = document.getElementById("activeExercises");

// roots
const programsRoot = document.getElementById("programsRoot");
const historyRoot = document.getElementById("historyRoot");

// settings
const unitsToggle = document.getElementById("unitsToggle");
const autoRestToggle = document.getElementById("autoRestToggle");
const blankWeightUsesBaselineToggle = document.getElementById("blankWeightUsesBaselineToggle");
document.getElementById("resetAppBtn").addEventListener("click", resetAllData);

const customExercisesList = document.getElementById("customExercisesList");

// modal
const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");
modalBackdrop.addEventListener("click", closeModal);

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
    timer: { running:false, total:0, remaining:0, endTs:null, label:"" }
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
    try { return { ...DEFAULT_STATE(), ...JSON.parse(raw) }; } catch {}
  }
  for (const k of LEGACY_KEYS) {
    const legacy = localStorage.getItem(k);
    if (legacy) {
      try {
        const migrated = { ...DEFAULT_STATE(), ...JSON.parse(legacy) };
        localStorage.setItem(LS_KEY, JSON.stringify(migrated));
        return migrated;
      } catch {}
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
  setTimeout(() => headerPill.classList.add("hidden"), 1800);
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
  const b = el("button","iconbtn");
  b.textContent = symbol;
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

// ---------- drawer / routing ----------
function openDrawer() {
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden","false");
}
function closeDrawer() {
  drawer.classList.add("hidden");
  drawer.setAttribute("aria-hidden","true");
}
function setRoute(r) {
  route = r;
  navItems.forEach(b => b.classList.toggle("is-active", b.dataset.route === r));

  document.querySelectorAll(".route").forEach(s => s.classList.add("hidden"));
  document.getElementById(`route-${r}`).classList.remove("hidden");

  routeLabel.textContent =
    r === "workout" ? "Start workout" :
    r === "programs" ? "Programs" :
    r === "history" ? "History" :
    "Settings";

  // reset sub-nav
  if (r !== "programs") ui.programs = { screen:"list", programId:null, workoutId:null };
  if (r !== "history") ui.history = { screen:"list", sessionId:null };

  renderAll();
}

// ---------- baseline ----------
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
  renderWorkout();
  toast("Workout started");
}

function finishWorkout() {
  const sess = getActiveSession();
  if (!sess) return;
  sess.endedAt = Date.now();
  state.activeSessionId = null;
  saveState();
  stopTimer(true);
  ui.history = { screen:"list", sessionId:null };
  setRoute("history");
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

// ---------- programs ----------
function gotoProgramsList() {
  ui.programs = { screen:"list", programId:null, workoutId:null };
  renderPrograms();
}
function gotoProgram(programId) {
  ui.programs = { screen:"program", programId, workoutId:null };
  renderPrograms();
}
function gotoWorkout(programId, workoutId) {
  ui.programs = { screen:"workout", programId, workoutId };
  renderPrograms();
}

function addProgram(name) {
  const n = name.trim();
  if (!n) return toast("Name required");
  state.programs.push({ id: uid(), name: n, workouts: [] });
  saveState();
  renderPrograms();
  toast("Program created");
}
function deleteProgram(programId) {
  if (!confirm("Delete this program?")) return;
  state.programs = state.programs.filter(p => p.id !== programId);
  saveState();
  gotoProgramsList();
}
function addWorkout(programId, name) {
  const n = name.trim();
  if (!n) return toast("Name required");
  const p = state.programs.find(x => x.id === programId);
  if (!p) return;
  p.workouts.push({ id: uid(), name: n, exercises: [] });
  saveState();
  renderPrograms();
  toast("Workout added");
}
function deleteWorkout(programId, workoutId) {
  if (!confirm("Delete this workout?")) return;
  const p = state.programs.find(x => x.id === programId);
  if (!p) return;
  p.workouts = p.workouts.filter(w => w.id !== workoutId);
  saveState();
  gotoProgram(programId);
}

function addTemplateExercisesBulk(programId, workoutId, exerciseIds) {
  const p = state.programs.find(x => x.id === programId);
  const w = p?.workouts.find(x => x.id === workoutId);
  if (!w) return;

  // default template values (can edit after adding)
  for (const exId of exerciseIds) {
    // avoid duplicates by exerciseId
    if (w.exercises.some(te => te.exerciseId === exId)) continue;
    w.exercises.push({
      id: uid(),
      exerciseId: exId,
      targetSets: 3,
      targetReps: 10,
      restSeconds: 90
    });
  }

  saveState();
  renderPrograms();
  toast("Exercises added");
}

function removeTemplateExercise(programId, workoutId, templateExerciseId) {
  const p = state.programs.find(x => x.id === programId);
  const w = p?.workouts.find(x => x.id === workoutId);
  if (!w) return;
  w.exercises = w.exercises.filter(te => te.id !== templateExerciseId);
  saveState();
  renderPrograms();
}

function updateTemplateExercise(programId, workoutId, templateExerciseId, sets, reps, rest) {
  const p = state.programs.find(x => x.id === programId);
  const w = p?.workouts.find(x => x.id === workoutId);
  const te = w?.exercises.find(x => x.id === templateExerciseId);
  if (!te) return;
  te.targetSets = Number(sets) || te.targetSets;
  te.targetReps = Number(reps) || te.targetReps;
  te.restSeconds = Number(rest) || te.restSeconds;
  saveState();
  renderPrograms();
}

// ---------- custom exercises ----------
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
  toast("Custom exercise added");
}
function deleteCustomExercise(exId) {
  const ex = exerciseById(exId);
  if (!ex || !ex.isCustom) return;
  if (!confirm(`Delete "${ex.name}"?`)) return;

  state.exercises = state.exercises.filter(e => e.id !== exId);
  for (const p of state.programs) {
    for (const w of p.workouts) {
      w.exercises = w.exercises.filter(te => te.exerciseId !== exId);
    }
  }
  saveState();
  renderSettings();
  toast("Deleted");
}

// ---------- history ----------
function gotoHistoryList() {
  ui.history = { screen:"list", sessionId:null };
  renderHistory();
}
function gotoHistoryDetail(sessionId) {
  ui.history = { screen:"detail", sessionId };
  renderHistory();
}

// ---------- modal ----------
function openModal(html) {
  modalContent.innerHTML = html;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
}
function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
  modalContent.innerHTML = "";
}

function openAddProgramModal() {
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">New program</div>
        <div class="sheetsub">Example: PPL, Upper/Lower</div>
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
    addProgram(document.getElementById("mProgramName").value);
    closeModal();
  };
}

function openAddWorkoutModal(programId) {
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">New workout</div>
        <div class="sheetsub">Example: Push Day, Pull Day</div>
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
    addWorkout(programId, document.getElementById("mWorkoutName").value);
    closeModal();
  };
}

function openEditTemplateExerciseModal(programId, workoutId, te) {
  const exName = exerciseName(te.exerciseId);
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">${exName}</div>
        <div class="sheetsub">Edit sets, reps, rest</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="grid2">
      <input id="mSets" class="input" type="number" min="1" value="${te.targetSets}" placeholder="Sets" />
      <input id="mReps" class="input" type="number" min="1" value="${te.targetReps}" placeholder="Reps" />
      <input id="mRest" class="input" type="number" min="10" step="10" value="${te.restSeconds}" placeholder="Rest (sec)" />
      <div class="muted" style="padding: 10px 2px">Tip: longer rest for compounds.</div>
    </div>

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Save</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;
  document.getElementById("mSave").onclick = () => {
    updateTemplateExercise(
      programId, workoutId, te.id,
      document.getElementById("mSets").value,
      document.getElementById("mReps").value,
      document.getElementById("mRest").value
    );
    closeModal();
    toast("Updated");
  };
}

function openBulkExercisePicker(programId, workoutId) {
  // Hevy-like idea: add exercises from library with search and add multiple. :contentReference[oaicite:1]{index=1}
  const all = state.exercises.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const selected = new Set();

  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">Add exercises</div>
        <div class="sheetsub">Search and select multiple</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="row">
      <input id="mSearch" class="input" placeholder="Search…" />
      <button class="iconbtn" id="mNewCustom" title="New custom">＋</button>
    </div>

    <div id="mList" class="list"></div>

    <div class="row space-between" style="margin-top:12px">
      <div class="muted" id="mCount">0 selected</div>
      <div class="row">
        <button class="btn btn-ghost" id="mCancel">Cancel</button>
        <button class="btn" id="mAddBtn">Add</button>
      </div>
    </div>
  `);

  const mClose = document.getElementById("mClose");
  const mCancel = document.getElementById("mCancel");
  const mSearch = document.getElementById("mSearch");
  const mList = document.getElementById("mList");
  const mCount = document.getElementById("mCount");
  const mAddBtn = document.getElementById("mAddBtn");
  const mNewCustom = document.getElementById("mNewCustom");

  mClose.onclick = closeModal;
  mCancel.onclick = closeModal;

  const renderList = () => {
    const q = (mSearch.value || "").trim().toLowerCase();
    const filtered = all.filter(ex => !q || ex.name.toLowerCase().includes(q));

    mList.innerHTML = "";
    for (const ex of filtered) {
      const row = el("div","listrow");
      const left = el("div");
      left.appendChild(txt("div","label", ex.name));
      left.appendChild(txt("div","muted", `${ex.muscleGroup} • ${ex.equipment}${ex.isCustom ? " • Custom" : ""}`));
      row.appendChild(left);

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "chk";
      chk.checked = selected.has(ex.id);
      chk.onchange = () => {
        if (chk.checked) selected.add(ex.id);
        else selected.delete(ex.id);
        mCount.textContent = `${selected.size} selected`;
      };

      row.onclick = (e) => {
        if (e.target === chk) return;
        chk.checked = !chk.checked;
        chk.onchange();
      };

      row.appendChild(chk);
      mList.appendChild(row);
    }
    mCount.textContent = `${selected.size} selected`;
  };

  mSearch.oninput = renderList;

  mNewCustom.onclick = () => {
    openCustomExerciseModal(() => {
      // refresh list after custom added
      all.splice(0, all.length, ...state.exercises.slice().sort((a,b)=>a.name.localeCompare(b.name)));
      renderList();
    });
  };

  mAddBtn.onclick = () => {
    if (selected.size === 0) return toast("Select at least 1");
    addTemplateExercisesBulk(programId, workoutId, Array.from(selected));
    closeModal();
  };

  renderList();
}

function openCustomExerciseModal(onDone) {
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">New custom exercise</div>
        <div class="sheetsub">Creates it and adds to your library</div>
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
    onDone?.();
  };
}

function openSetModal(sessionExerciseId) {
  const sess = getActiveSession();
  if (!sess) return;

  const se = sess.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;

  const last = lastSetForExercise(se.exerciseId);
  const lastLine = last
    ? `Last: ${toDisplayWeight(last.weightLb).toFixed(1)} ${unitLabel()} × ${last.reps} reps`
    : `No history yet`;

  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">${exerciseName(se.exerciseId)}</div>
        <div class="sheetsub">${lastLine} • Rest ${se.restSeconds}s</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="grid2">
      <input id="mReps" class="input" type="number" min="1" placeholder="Reps" />
      <input id="mWeight" class="input" type="number" step="0.5" placeholder="Weight (${unitLabel()})" />
    </div>

    <div class="help">Tip: leave weight blank to use your baseline (if enabled).</div>

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Save set</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;

  if (last) {
    document.getElementById("mWeight").placeholder = `Weight (${unitLabel()}) — e.g. ${toDisplayWeight(last.weightLb).toFixed(1)}`;
  }

  document.getElementById("mSave").onclick = () => {
    addSetToSessionExercise(sessionExerciseId,
      document.getElementById("mReps").value,
      document.getElementById("mWeight").value
    );
    closeModal();
  };
}

// ---------- render ----------
function renderAll() {
  renderHeader();
  renderTemplateSelect();
  renderWorkout();
  renderPrograms();
  renderHistory();
  renderSettings();
}

function renderHeader() {
  const sess = getActiveSession();
  if (sess) {
    headerPill.textContent = "Active workout";
    headerPill.classList.remove("hidden");
  } else {
    headerPill.classList.add("hidden");
  }
}

function renderTemplateSelect() {
  const flat = templatesFlat();
  startTemplateSelect.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = flat.length ? "Select a workout template…" : "No templates yet (make one in Programs)";
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
    const card = el("div","card");

    const header = el("div","exercise-header");
    const left = el("div");
    left.appendChild(txt("div","exercise-title", ex?.name || "Exercise"));
    left.appendChild(txt("div","exercise-meta", `Target: ${se.targetSets} × ${se.targetReps} • Rest: ${se.restSeconds}s`));

    const last = lastSetForExercise(se.exerciseId);
    if (last) {
      left.appendChild(txt("div","lastline",
        `Last: ${toDisplayWeight(last.weightLb).toFixed(1)} ${unitLabel()} × ${last.reps} reps`
      ));
    }

    const right = el("div");
    right.appendChild(iconBtn("＋","Add set", () => openSetModal(se.id)));

    header.appendChild(left);
    header.appendChild(right);

    const setsWrap = el("div","sets");
    if (!se.sets.length) {
      setsWrap.appendChild(txt("div","small","No sets yet"));
    } else {
      for (const s of se.sets.slice().sort((a,b)=>a.setNumber-b.setNumber)) {
        const row = el("div","set-row");
        row.appendChild(txt("span","badge",`Set ${s.setNumber}`));
        row.appendChild(txt("span","",`${s.reps} reps`));
        row.appendChild(txt("span","small","•"));
        row.appendChild(txt("span","",`${toDisplayWeight(s.weightLb).toFixed(1)} ${unitLabel()}`));
        setsWrap.appendChild(row);
      }
    }

    card.appendChild(header);
    card.appendChild(setsWrap);
    activeExercises.appendChild(card);
  }
}

function renderPrograms() {
  if (route !== "programs") return;
  programsRoot.innerHTML = "";

  // LIST
  if (ui.programs.screen === "list") {
    const panel = el("div","panel");
    const top = el("div","row space-between");
    const left = el("div");
    left.appendChild(txt("h2","", "Programs"));
    left.appendChild(txt("div","muted","Tap a program → add workouts → add exercises."));
    top.appendChild(left);
    top.appendChild(iconBtn("＋","New program", openAddProgramModal));
    panel.appendChild(top);
    programsRoot.appendChild(panel);

    if (!state.programs.length) {
      programsRoot.appendChild(txt("div","panel muted","No programs yet. Tap + to add one."));
      return;
    }

    for (const p of state.programs.slice().sort((a,b)=>a.name.localeCompare(b.name))) {
      const card = el("div","card");
      const row = el("div","row space-between");
      const l = el("div");
      l.appendChild(txt("div","label", p.name));
      l.appendChild(txt("div","muted", `${p.workouts.length} workout(s)`));
      row.appendChild(l);

      const r = el("div");
      r.style.display="flex"; r.style.gap="8px";
      r.appendChild(iconBtn("›","Open", () => gotoProgram(p.id)));
      r.appendChild(iconBtn("🗑","Delete", () => deleteProgram(p.id)));
      row.appendChild(r);

      card.appendChild(row);
      programsRoot.appendChild(card);
    }
    return;
  }

  // PROGRAM DETAIL
  if (ui.programs.screen === "program") {
    const p = state.programs.find(x => x.id === ui.programs.programId);
    if (!p) return gotoProgramsList();

    const panel = el("div","panel");
    const top = el("div","row space-between");

    const l = el("div");
    l.appendChild(txt("h2","", p.name));
    l.appendChild(txt("div","muted","Workouts inside this program"));
    top.appendChild(l);

    const r = el("div"); r.style.display="flex"; r.style.gap="8px";
    r.appendChild(iconBtn("‹","Back", gotoProgramsList));
    r.appendChild(iconBtn("＋","Add workout", () => openAddWorkoutModal(p.id)));
    top.appendChild(r);

    panel.appendChild(top);
    programsRoot.appendChild(panel);

    if (!p.workouts.length) {
      programsRoot.appendChild(txt("div","panel muted","No workouts yet. Tap + to add one."));
      return;
    }

    for (const w of p.workouts.slice().sort((a,b)=>a.name.localeCompare(b.name))) {
      const card = el("div","card");
      const row = el("div","row space-between");
      const wl = el("div");
      wl.appendChild(txt("div","label", w.name));
      wl.appendChild(txt("div","muted", `${w.exercises.length} exercise(s)`));
      row.appendChild(wl);

      const wr = el("div"); wr.style.display="flex"; wr.style.gap="8px";
      wr.appendChild(iconBtn("›","Open", () => gotoWorkout(p.id, w.id)));
      wr.appendChild(iconBtn("🗑","Delete", () => deleteWorkout(p.id, w.id)));
      row.appendChild(wr);

      card.appendChild(row);
      programsRoot.appendChild(card);
    }
    return;
  }

  // WORKOUT BUILDER
  if (ui.programs.screen === "workout") {
    const p = state.programs.find(x => x.id === ui.programs.programId);
    const w = p?.workouts.find(x => x.id === ui.programs.workoutId);
    if (!p || !w) return gotoProgramsList();

    const panel = el("div","panel");
    const top = el("div","row space-between");

    const l = el("div");
    l.appendChild(txt("h2","", w.name));
    l.appendChild(txt("div","muted","Add exercises (multi-select) then edit sets/reps/rest"));
    top.appendChild(l);

    const r = el("div"); r.style.display="flex"; r.style.gap="8px";
    r.appendChild(iconBtn("‹","Back", () => gotoProgram(p.id)));
    r.appendChild(iconBtn("＋","Add exercises", () => openBulkExercisePicker(p.id, w.id)));
    top.appendChild(r);

    panel.appendChild(top);
    programsRoot.appendChild(panel);

    if (!w.exercises.length) {
      const empty = el("div","panel");
      empty.appendChild(txt("div","label","No exercises yet"));
      empty.appendChild(txt("div","help","Tap “Add exercises” and pick multiple from the list."));
      programsRoot.appendChild(empty);
      return;
    }

    for (const te of w.exercises.slice()) {
      const exObj = exerciseById(te.exerciseId);
      const card = el("div","card");
      const row = el("div","row space-between");

      const left = el("div");
      left.appendChild(txt("div","label", exObj?.name || "Exercise"));
      left.appendChild(txt("div","muted", `Target: ${te.targetSets} × ${te.targetReps} • Rest: ${te.restSeconds}s`));
      row.appendChild(left);

      const right = el("div"); right.style.display="flex"; right.style.gap="8px";
      right.appendChild(iconBtn("✎","Edit", () => openEditTemplateExerciseModal(p.id, w.id, te)));
      right.appendChild(iconBtn("✕","Remove", () => removeTemplateExercise(p.id, w.id, te.id)));
      row.appendChild(right);

      card.appendChild(row);
      programsRoot.appendChild(card);
    }
  }
}

function renderHistory() {
  if (route !== "history") return;
  historyRoot.innerHTML = "";

  const completed = state.sessions.filter(s => s.endedAt).sort((a,b)=>b.endedAt-a.endedAt);

  if (ui.history.screen === "list") {
    const panel = el("div","panel");
    panel.appendChild(txt("h2","", "History"));
    panel.appendChild(txt("div","muted","Completed workouts"));
    historyRoot.appendChild(panel);

    if (!completed.length) {
      historyRoot.appendChild(txt("div","panel muted","No completed workouts yet."));
      return;
    }

    for (const s of completed) {
      const card = el("div","card");
      const row = el("div","row space-between");

      const left = el("div");
      left.appendChild(txt("div","label", s.templateName || "Workout"));
      left.appendChild(txt("div","muted", `${fmtDateTime(s.startedAt)} • ${fmtDuration(s.endedAt - s.startedAt)}`));
      row.appendChild(left);

      row.appendChild(iconBtn("›","Open", () => { ui.history = { screen:"detail", sessionId:s.id }; renderHistory(); }));
      card.appendChild(row);

      const names = s.exercises.map(se => exerciseName(se.exerciseId)).join(", ");
      if (names) card.appendChild(txt("div","help", names));

      historyRoot.appendChild(card);
    }
    return;
  }

  if (ui.history.screen === "detail") {
    const s = state.sessions.find(x => x.id === ui.history.sessionId);
    if (!s) { ui.history = { screen:"list", sessionId:null }; return renderHistory(); }

    const panel = el("div","panel");
    const top = el("div","row space-between");

    const left = el("div");
    left.appendChild(txt("h2","", s.templateName || "Workout"));
    left.appendChild(txt("div","muted", `${fmtDateTime(s.startedAt)} • ${fmtDuration(s.endedAt - s.startedAt)}`));
    top.appendChild(left);
    top.appendChild(iconBtn("‹","Back", () => { ui.history = { screen:"list", sessionId:null }; renderHistory(); }));
    panel.appendChild(top);
    historyRoot.appendChild(panel);

    for (const se of s.exercises.slice().sort((a,b)=>a.orderIndex-b.orderIndex)) {
      const card = el("div","card");
      card.appendChild(txt("div","label", exerciseName(se.exerciseId)));

      if (!se.sets.length) {
        card.appendChild(txt("div","muted","No sets"));
      } else {
        for (const set of se.sets.slice().sort((a,b)=>a.setNumber-b.setNumber)) {
          card.appendChild(txt("div","help",
            `Set ${set.setNumber}: ${set.reps} reps • ${toDisplayWeight(set.weightLb).toFixed(1)} ${unitLabel()}`
          ));
        }
      }
      historyRoot.appendChild(card);
    }
  }
}

function renderSettings() {
  if (route !== "settings") return;

  unitsToggle.checked = !!state.settings.isKg;
  autoRestToggle.checked = !!state.settings.autoRest;
  blankWeightUsesBaselineToggle.checked = !!state.settings.blankWeightUsesBaseline;

  unitsToggle.onchange = () => { state.settings.isKg = unitsToggle.checked; saveState(); renderAll(); };
  autoRestToggle.onchange = () => { state.settings.autoRest = autoRestToggle.checked; saveState(); };
  blankWeightUsesBaselineToggle.onchange = () => { state.settings.blankWeightUsesBaseline = blankWeightUsesBaselineToggle.checked; saveState(); };

  // custom exercises list
  const customs = state.exercises.filter(e => e.isCustom).sort((a,b)=>a.name.localeCompare(b.name));
  customExercisesList.innerHTML = "";
  if (!customs.length) {
    customExercisesList.appendChild(txt("div","muted","No custom exercises yet."));
  } else {
    for (const ex of customs) {
      const row = el("div","listrow");
      const left = el("div");
      left.appendChild(txt("div","label", ex.name));
      left.appendChild(txt("div","muted", `${ex.muscleGroup} • ${ex.equipment}`));
      row.appendChild(left);
      row.appendChild(iconBtn("🗑","Delete", () => deleteCustomExercise(ex.id)));
      customExercisesList.appendChild(row);
    }
  }
}

// ---------- reset ----------
function resetAllData() {
  if (!confirm("Reset all data? This cannot be undone.")) return;
  state = DEFAULT_STATE();
  saveState();
  stopTimer(true);
  ui.programs = { screen:"list", programId:null, workoutId:null };
  ui.history = { screen:"list", sessionId:null };
  renderAll();
  toast("Reset complete");
}

// ---------- boot ----------
function renderAllSafe() {
  try { renderAll(); } catch (e) {
    console.error(e);
    toast("UI error — open console");
  }
}

renderAllSafe();
setRoute("workout");

// restore timer if running
if (state.timer.running && state.timer.endTs) {
  timerBar.classList.remove("hidden");
  timerSub.textContent = state.timer.label || "—";
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}
