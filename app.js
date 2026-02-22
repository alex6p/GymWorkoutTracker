/* Gym Tracker PWA (no build tools)
   Storage: localStorage JSON (simple + reliable for GitHub Pages)
   We store weights internally in pounds; UI can display lb/kg.
*/

const LS_KEY = "gym_tracker_v1";

const DEFAULT_STATE = () => ({
  settings: {
    isKg: false,                 // default lb
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
    endTs: null
  }
});

function seedExercises() {
  const base = [
    { id: uid(), name: "Bench Press", muscleGroup: "Chest", equipment: "Barbell", notes: "", isCustom: false },
    { id: uid(), name: "Incline Dumbbell Press", muscleGroup: "Chest", equipment: "Dumbbells", notes: "", isCustom: false },
    { id: uid(), name: "Overhead Press", muscleGroup: "Shoulders", equipment: "Barbell", notes: "", isCustom: false },
    { id: uid(), name: "Lat Pulldown", muscleGroup: "Back", equipment: "Cable", notes: "", isCustom: false },
    { id: uid(), name: "Barbell Row", muscleGroup: "Back", equipment: "Barbell", notes: "", isCustom: false },
    { id: uid(), name: "Deadlift", muscleGroup: "Back", equipment: "Barbell", notes: "", isCustom: false },
    { id: uid(), name: "Squat", muscleGroup: "Legs", equipment: "Barbell", notes: "", isCustom: false },
    { id: uid(), name: "Leg Press", muscleGroup: "Legs", equipment: "Machine", notes: "", isCustom: false },
    { id: uid(), name: "Romanian Deadlift", muscleGroup: "Legs", equipment: "Barbell", notes: "", isCustom: false },
    { id: uid(), name: "Bicep Curl", muscleGroup: "Arms", equipment: "Dumbbells", notes: "", isCustom: false },
    { id: uid(), name: "Tricep Pushdown", muscleGroup: "Arms", equipment: "Cable", notes: "", isCustom: false }
  ];
  return base;
}

// ---------- state ----------
let state = loadState();
let timerInterval = null;

// ---------- utilities ----------
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STATE();
    const parsed = JSON.parse(raw);
    // basic migration guard
    return { ...DEFAULT_STATE(), ...parsed };
  } catch {
    return DEFAULT_STATE();
  }
}

function toDisplayWeight(lb) {
  if (!lb && lb !== 0) return "";
  return state.settings.isKg ? (lb / 2.2046226218) : lb;
}
function toPounds(displayVal) {
  const v = Number(displayVal);
  if (!isFinite(v)) return 0;
  return state.settings.isKg ? (v * 2.2046226218) : v;
}
function unitLabel() {
  return state.settings.isKg ? "kg" : "lb";
}
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString();
}
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
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- baseline lookup (last set for exercise) ----------
function lastSetForExercise(exerciseId) {
  // Only completed sessions
  const completed = state.sessions.filter(s => s.endedAt);
  // walk newest first
  completed.sort((a,b) => b.endedAt - a.endedAt);
  for (const sess of completed) {
    for (const se of sess.exercises) {
      if (se.exerciseId !== exerciseId) continue;
      if (!se.sets?.length) continue;
      // newest set by createdAt
      const sorted = [...se.sets].sort((a,b) => b.createdAt - a.createdAt);
      const last = sorted[0];
      return { reps: last.reps, weightLb: last.weightLb, date: last.createdAt };
    }
  }
  return null;
}

// ---------- tabs ----------
const tabs = document.querySelectorAll(".tab");
tabs.forEach(btn => btn.addEventListener("click", () => {
  tabs.forEach(b => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  const t = btn.dataset.tab;
  showTab(t);
}));

function showTab(tabName) {
  document.querySelectorAll(".tabpage").forEach(p => p.classList.add("hidden"));
  document.querySelector(`#tab-${tabName}`).classList.remove("hidden");
  renderAll();
}

// ---------- timer ----------
const timerBar = document.getElementById("timerBar");
const timerCountdown = document.getElementById("timerCountdown");
const timerProgress = document.getElementById("timerProgress");
const timerSub = document.getElementById("timerSub");
document.getElementById("timerStop").addEventListener("click", stopTimer);
document.getElementById("timerPlus").addEventListener("click", () => addTimer(30));

function startTimer(seconds, label) {
  stopTimer();

  state.timer.running = true;
  state.timer.total = Math.max(0, seconds);
  state.timer.remaining = state.timer.total;
  state.timer.endTs = Date.now() + state.timer.total * 1000;
  saveState();

  timerSub.textContent = label || "—";
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
    // finish
    stopTimer(false);
    try { navigator.vibrate?.([200,100,200]); } catch {}
    // basic beep fallback
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      setTimeout(() => { o.stop(); ctx.close(); }, 250);
    } catch {}
  }
}

function stopTimer(hide=true) {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  state.timer.running = false;
  state.timer.total = 0;
  state.timer.remaining = 0;
  state.timer.endTs = null;
  saveState();
  if (hide) timerBar.classList.add("hidden");
  timerProgress.style.width = "0%";
  timerCountdown.textContent = "0:00";
}

function addTimer(seconds) {
  if (!state.timer.running || !state.timer.endTs) return;
  state.timer.endTs += seconds * 1000;
  state.timer.total += seconds;
  saveState();
  tickTimer();
}

// ---------- workout ----------
const startTemplateSelect = document.getElementById("startTemplateSelect");
const startWorkoutBtn = document.getElementById("startWorkoutBtn");
const activeWorkout = document.getElementById("activeWorkout");
const activeTitle = document.getElementById("activeTitle");
const activeMeta = document.getElementById("activeMeta");
const activeExercises = document.getElementById("activeExercises");
const endWorkoutBtn = document.getElementById("endWorkoutBtn");

startWorkoutBtn.addEventListener("click", () => {
  const tplId = startTemplateSelect.value;
  if (!tplId) return alert("Create a workout template first under Programs.");
  startWorkoutFromTemplate(tplId);
});

endWorkoutBtn.addEventListener("click", () => {
  const sess = getActiveSession();
  if (!sess) return;
  sess.endedAt = Date.now();
  state.activeSessionId = null;
  saveState();
  renderAll();
  showTab("history");
});

function getAllTemplatesFlat() {
  const out = [];
  for (const p of state.programs) {
    for (const w of p.workouts) {
      out.push({ programId: p.id, programName: p.name, workout: w });
    }
  }
  return out;
}

function startWorkoutFromTemplate(templateWorkoutId) {
  const flat = getAllTemplatesFlat();
  const found = flat.find(x => x.workout.id === templateWorkoutId);
  if (!found) return alert("Template not found.");

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
}

function getActiveSession() {
  if (!state.activeSessionId) return null;
  return state.sessions.find(s => s.id === state.activeSessionId) || null;
}

function saveSet(sessionExerciseId, reps, weightDisplayStr) {
  const sess = getActiveSession();
  if (!sess) return;

  const se = sess.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;

  const repsNum = Number(reps);
  if (!isFinite(repsNum) || repsNum <= 0) return;

  // baseline if weight empty
  let weightLb = 0;
  const weightTrim = (weightDisplayStr ?? "").trim();
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
  renderAll();

  // auto rest
  if (state.settings.autoRest) {
    startTimer(se.restSeconds || 90, `Next set • ${exerciseName(se.exerciseId)}`);
  }
}

// ---------- programs ----------
document.getElementById("addProgramBtn").addEventListener("click", () => {
  const name = document.getElementById("newProgramName").value.trim();
  if (!name) return;
  state.programs.push({ id: uid(), name, workouts: [] });
  document.getElementById("newProgramName").value = "";
  saveState();
  renderAll();
});

// ---------- exercises ----------
const exSearch = document.getElementById("exerciseSearch");
const addExercisePanel = document.getElementById("addExercisePanel");
document.getElementById("showAddExerciseBtn").addEventListener("click", () => {
  addExercisePanel.classList.remove("hidden");
});
document.getElementById("cancelExerciseBtn").addEventListener("click", () => {
  addExercisePanel.classList.add("hidden");
});
document.getElementById("saveExerciseBtn").addEventListener("click", () => {
  const name = document.getElementById("exName").value.trim();
  const muscleGroup = document.getElementById("exMuscle").value.trim() || "Other";
  const equipment = document.getElementById("exEquip").value.trim() || "Other";
  const notes = document.getElementById("exNotes").value.trim() || "";
  if (!name) return alert("Exercise name is required.");

  state.exercises.push({ id: uid(), name, muscleGroup, equipment, notes, isCustom: true });

  document.getElementById("exName").value = "";
  document.getElementById("exMuscle").value = "";
  document.getElementById("exEquip").value = "";
  document.getElementById("exNotes").value = "";
  addExercisePanel.classList.add("hidden");

  saveState();
  renderAll();
});
exSearch.addEventListener("input", renderExercises);

// ---------- settings ----------
const unitsToggle = document.getElementById("unitsToggle");
const autoRestToggle = document.getElementById("autoRestToggle");
const blankWeightUsesBaselineToggle = document.getElementById("blankWeightUsesBaselineToggle");

unitsToggle.addEventListener("change", () => {
  state.settings.isKg = unitsToggle.checked;
  saveState();
  renderAll();
});
autoRestToggle.addEventListener("change", () => {
  state.settings.autoRest = autoRestToggle.checked;
  saveState();
});
blankWeightUsesBaselineToggle.addEventListener("change", () => {
  state.settings.blankWeightUsesBaseline = blankWeightUsesBaselineToggle.checked;
  saveState();
});
document.getElementById("resetAppBtn").addEventListener("click", () => {
  if (!confirm("Reset all data? This cannot be undone.")) return;
  state = DEFAULT_STATE();
  saveState();
  stopTimer(true);
  renderAll();
});

// ---------- render ----------
function renderAll() {
  renderTemplateSelect();
  renderActiveWorkout();
  renderPrograms();
  renderExercises();
  renderHistory();
  renderSettings();
}

function renderTemplateSelect() {
  const flat = getAllTemplatesFlat();
  startTemplateSelect.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = flat.length ? "Select a workout template…" : "No templates yet (create in Programs)";
  startTemplateSelect.appendChild(opt0);

  for (const x of flat) {
    const opt = document.createElement("option");
    opt.value = x.workout.id;
    opt.textContent = `${x.programName} • ${x.workout.name}`;
    startTemplateSelect.appendChild(opt);
  }
}

function renderActiveWorkout() {
  const sess = getActiveSession();
  if (!sess) {
    activeWorkout.classList.add("hidden");
    return;
  }

  activeWorkout.classList.remove("hidden");
  activeTitle.textContent = sess.templateName || "Workout";
  activeMeta.textContent = `${sess.programName || ""} • Started ${fmtDateTime(sess.startedAt)}`.replace(/^ • /,'');

  // build exercise cards
  activeExercises.innerHTML = "";
  for (const se of sess.exercises.sort((a,b)=>a.orderIndex-b.orderIndex)) {
    const ex = state.exercises.find(e => e.id === se.exerciseId);
    const exName = ex?.name ?? "Exercise";

    const last = lastSetForExercise(se.exerciseId);
    const lastLine = last
      ? `Last: ${toDisplayWeight(last.weightLb).toFixed(1)} ${unitLabel()} x ${last.reps} reps`
      : "";

    const card = el("div", "card");
    const header = el("div", "exercise-header");
    const left = el("div");
    left.appendChild(elText("div", "exercise-title", exName));
    left.appendChild(elText("div", "exercise-meta", `Target: ${se.targetSets} x ${se.targetReps} • Rest: ${se.restSeconds}s`));
    if (lastLine) left.appendChild(elText("div", "lastline", lastLine));
    header.appendChild(left);

    const setsWrap = el("div", "sets");

    // existing sets list
    if (se.sets.length) {
      for (const s of [...se.sets].sort((a,b)=>a.setNumber-b.setNumber)) {
        const row = el("div", "set-row");
        row.appendChild(elText("span", "badge", `Set ${s.setNumber}`));
        row.appendChild(elText("span", "", `${s.reps} reps`));
        row.appendChild(elText("span", "", "•"));
        row.appendChild(elText("span", "", `${toDisplayWeight(s.weightLb).toFixed(1)} ${unitLabel()}`));
        setsWrap.appendChild(row);
      }
    } else {
      setsWrap.appendChild(elText("div", "small", "No sets yet"));
    }

    // input row
    const inputRow = el("div", "set-row");
    const repsInput = elInput("Reps", "number");
    repsInput.style.maxWidth = "90px";

    const weightWrap = el("div");
    weightWrap.style.position = "relative";
    weightWrap.style.maxWidth = "180px";
    weightWrap.style.flex = "1";

    const weightInput = elInput("Weight", "number");
    weightInput.step = "0.5";

    // baseline placeholder in gray
    if (last) {
      weightInput.setAttribute("placeholder", toDisplayWeight(last.weightLb).toFixed(1));
      // browsers render placeholder as gray; extra class if needed:
      weightInput.classList.add("placeholder");
    }

    const saveBtn = el("button", "btn");
    saveBtn.textContent = "Save Set";
    saveBtn.addEventListener("click", () => {
      saveSet(se.id, repsInput.value, weightInput.value);
      repsInput.value = "";
      // keep weight for repeated sets (nice UX)
    });

    weightWrap.appendChild(weightInput);

    inputRow.appendChild(repsInput);
    inputRow.appendChild(weightWrap);
    inputRow.appendChild(elText("span", "small", unitLabel()));
    inputRow.appendChild(saveBtn);

    setsWrap.appendChild(inputRow);

    card.appendChild(header);
    card.appendChild(setsWrap);
    activeExercises.appendChild(card);
  }
}

function renderPrograms() {
  const root = document.getElementById("programsList");
  root.innerHTML = "";

  if (!state.programs.length) {
    root.appendChild(elText("div", "panel muted", "No programs yet. Add one above."));
    return;
  }

  for (const p of state.programs) {
    const card = el("div", "panel");

    const head = el("div", "row space-between");
    head.appendChild(elText("h2", "", p.name));

    const del = el("button", "btn btn-danger");
    del.textContent = "Delete Program";
    del.addEventListener("click", () => {
      if (!confirm(`Delete program "${p.name}"?`)) return;
      state.programs = state.programs.filter(x => x.id !== p.id);
      saveState();
      renderAll();
    });
    head.appendChild(del);
    card.appendChild(head);

    // add workout
    const wRow = el("div", "row");
    const wName = elInput("New workout name (e.g., Push Day)", "text");
    const addW = el("button", "btn");
    addW.textContent = "Add Workout";
    addW.addEventListener("click", () => {
      const name = wName.value.trim();
      if (!name) return;
      p.workouts.push({ id: uid(), name, exercises: [] });
      wName.value = "";
      saveState();
      renderAll();
    });
    wRow.appendChild(wName);
    wRow.appendChild(addW);
    card.appendChild(wRow);

    // workouts list
    for (const w of p.workouts) {
      const wCard = el("div", "card");

      const wHead = el("div", "row space-between");
      wHead.appendChild(elText("h3", "", w.name));

      const wDel = el("button", "btn btn-ghost");
      wDel.textContent = "Delete";
      wDel.addEventListener("click", () => {
        if (!confirm(`Delete workout "${w.name}"?`)) return;
        p.workouts = p.workouts.filter(x => x.id !== w.id);
        saveState();
        renderAll();
      });
      wHead.appendChild(wDel);
      wCard.appendChild(wHead);

      // add template exercise
      const addRow = el("div", "row");
      const exSel = document.createElement("select");
      exSel.style.flex = "1";
      exSel.style.minWidth = "240px";
      exSel.innerHTML = `<option value="">Pick exercise…</option>` + state.exercises
        .slice()
        .sort((a,b)=>a.name.localeCompare(b.name))
        .map(ex => `<option value="${ex.id}">${ex.name}</option>`)
        .join("");

      const sets = elInput("Sets", "number"); sets.value = 3; sets.style.maxWidth = "90px";
      const reps = elInput("Reps", "number"); reps.value = 10; reps.style.maxWidth = "90px";
      const rest = elInput("Rest (sec)", "number"); rest.value = 90; rest.style.maxWidth = "120px";

      const addExBtn = el("button", "btn");
      addExBtn.textContent = "Add Exercise";
      addExBtn.addEventListener("click", () => {
        if (!exSel.value) return alert("Pick an exercise");
        w.exercises.push({
          id: uid(),
          exerciseId: exSel.value,
          targetSets: Number(sets.value) || 3,
          targetReps: Number(reps.value) || 10,
          restSeconds: Number(rest.value) || 90
        });
        saveState();
        renderAll();
      });

      addRow.appendChild(exSel);
      addRow.appendChild(sets);
      addRow.appendChild(reps);
      addRow.appendChild(rest);
      addRow.appendChild(addExBtn);
      wCard.appendChild(addRow);

      // list template exercises
      if (!w.exercises.length) {
        wCard.appendChild(elText("div", "help", "No exercises in this workout yet."));
      } else {
        for (const te of w.exercises) {
          const ex = state.exercises.find(e => e.id === te.exerciseId);
          const line = el("div", "set-row");
          line.appendChild(elText("span", "badge", ex?.name ?? "Exercise"));
          line.appendChild(elText("span", "", `Target ${te.targetSets} x ${te.targetReps}`));
          line.appendChild(elText("span", "", "•"));
          line.appendChild(elText("span", "", `Rest ${te.restSeconds}s`));

          const rm = el("button", "btn btn-ghost");
          rm.textContent = "Remove";
          rm.addEventListener("click", () => {
            w.exercises = w.exercises.filter(x => x.id !== te.id);
            saveState();
            renderAll();
          });
          line.appendChild(rm);
          wCard.appendChild(line);
        }
      }

      card.appendChild(wCard);
    }

    root.appendChild(card);
  }
}

function renderExercises() {
  const root = document.getElementById("exercisesList");
  root.innerHTML = "";

  const q = (exSearch.value || "").trim().toLowerCase();
  const list = state.exercises
    .filter(ex => !q || ex.name.toLowerCase().includes(q))
    .sort((a,b)=>a.name.localeCompare(b.name));

  for (const ex of list) {
    const card = el("div", "card");
    card.appendChild(elText("div", "exercise-title", ex.name));
    card.appendChild(elText("div", "sub", `${ex.muscleGroup} • ${ex.equipment}${ex.isCustom ? " • Custom" : ""}`));
    if (ex.notes) card.appendChild(elText("div", "sub", ex.notes));

    if (ex.isCustom) {
      const del = el("button", "btn btn-ghost");
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        if (!confirm(`Delete custom exercise "${ex.name}"?`)) return;
        // remove from exercises
        state.exercises = state.exercises.filter(e => e.id !== ex.id);
        // also remove from templates
        for (const p of state.programs) {
          for (const w of p.workouts) {
            w.exercises = w.exercises.filter(te => te.exerciseId !== ex.id);
          }
        }
        saveState();
        renderAll();
      });
      card.appendChild(del);
    }

    root.appendChild(card);
  }
}

function renderHistory() {
  const root = document.getElementById("historyList");
  root.innerHTML = "";

  const completed = state.sessions.filter(s => s.endedAt).sort((a,b)=>b.endedAt - a.endedAt);

  if (!completed.length) {
    root.appendChild(elText("div", "panel muted", "No completed workouts yet."));
    return;
  }

  for (const s of completed) {
    const card = el("div", "panel");
    card.appendChild(elText("h2", "", s.templateName || "Workout"));
    card.appendChild(elText("div", "muted", `${fmtDateTime(s.startedAt)} • ${fmtDuration(s.endedAt - s.startedAt)}`));

    const names = s.exercises.map(se => exerciseName(se.exerciseId)).join(", ");
    if (names) card.appendChild(elText("div", "help", names));

    // details
    for (const se of s.exercises) {
      const exTitle = elText("div", "exercise-title", exerciseName(se.exerciseId));
      exTitle.style.marginTop = "10px";
      card.appendChild(exTitle);

      if (!se.sets.length) {
        card.appendChild(elText("div", "small", "No sets"));
        continue;
      }

      for (const set of [...se.sets].sort((a,b)=>a.setNumber-b.setNumber)) {
        card.appendChild(elText(
          "div",
          "sub",
          `Set ${set.setNumber}: ${set.reps} reps • ${toDisplayWeight(set.weightLb).toFixed(1)} ${unitLabel()}`
        ));
      }
    }

    root.appendChild(card);
  }
}

function renderSettings() {
  unitsToggle.checked = !!state.settings.isKg;
  autoRestToggle.checked = !!state.settings.autoRest;
  blankWeightUsesBaselineToggle.checked = !!state.settings.blankWeightUsesBaseline;
}

// ---------- helpers ----------
function exerciseName(exId) {
  return state.exercises.find(e => e.id === exId)?.name ?? "Exercise";
}
function el(tag, cls) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  return d;
}
function elText(tag, cls, text) {
  const d = el(tag, cls);
  d.textContent = text;
  return d;
}
function elInput(placeholder, type) {
  const i = document.createElement("input");
  i.className = "input";
  i.placeholder = placeholder;
  i.type = type || "text";
  return i;
}

// ---------- boot ----------
renderAll();
showTab("workout");

// restore timer if running
if (state.timer.running && state.timer.endTs) {
  timerBar.classList.remove("hidden");
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}
