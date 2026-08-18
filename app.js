/* Gym Tracker PWA v6
   - Workouts is the home screen
   - Each workout card has Start + Edit
   - Create new workout from the same screen
   - Active workout shows on top when running
   - Adds Alex's four-day strength rebuild plan + seeded Upper A baseline
*/

const LS_KEY = "gym_tracker_v5";
const LEGACY_KEYS = ["gym_tracker_v4","gym_tracker_v3","gym_tracker_v2","gym_tracker_v1"];
const STRENGTH_PLAN_MIGRATION = "strength_rebuild_2026_08_17_v1";

let state = loadState();
applyStrengthPlanUpgrade(state);
saveState();
let route = "workouts";

const ui = {
  workouts: { screen: "list", workoutId: null },
  history: { screen: "list", sessionId: null }
};

// ---------- optional toast ----------
const toastEl = document.getElementById("toast") || null;
function toast(msg){
  if (!toastEl) { console.log(msg); return; }
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 1800);
}

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
  setRoute(btn.dataset.route);
  closeDrawer();
}));

// timer
const timerBar = document.getElementById("timerBar");
const timerCountdown = document.getElementById("timerCountdown");
const timerProgress = document.getElementById("timerProgress");
const timerSub = document.getElementById("timerSub");
document.getElementById("timerStop").addEventListener("click", () => stopTimer(true));
document.getElementById("timerPlus").addEventListener("click", () => addTimer(30));

// active workout panel (now lives on Workouts/home)
const activeWorkout = document.getElementById("activeWorkout");
const activeTitle = document.getElementById("activeTitle");
const activeMeta = document.getElementById("activeMeta");
const activeExercises = document.getElementById("activeExercises");
document.getElementById("endWorkoutBtn").addEventListener("click", finishWorkout);

// roots
const workoutsRoot = document.getElementById("workoutsRoot");
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
    settings: { isKg:false, autoRest:true, blankWeightUsesBaseline:true },
    exercises: seedExercises(),
    workouts: [],         // saved templates
    sessions: [],         // history
    activeSessionId: null,
    timer: { running:false, total:0, remaining:0, endTs:null, label:"" },
    appMigrations: []
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

function ex(name, muscleGroup, equipment, trackingType = "weight_reps") {
  return { id: uid(), name, muscleGroup, equipment, trackingType, notes:"", isCustom:false };
}

function ensureExercise(s, name, muscleGroup, equipment, trackingType = "weight_reps") {
  const key = name.trim().toLowerCase();
  let found = s.exercises.find(item => item.name.trim().toLowerCase() === key);
  if (found) {
    found.trackingType = found.trackingType || trackingType;
    return found;
  }

  found = {
    id: uid(),
    name,
    muscleGroup,
    equipment,
    trackingType,
    notes:"",
    isCustom:true
  };
  s.exercises.push(found);
  return found;
}

function plannedExercise(exerciseId, targetSets, targetReps, restSeconds, targetEffort, notes = "") {
  return {
    id: uid(),
    exerciseId,
    targetSets,
    targetReps,
    restSeconds,
    targetEffort,
    notes
  };
}

function applyStrengthPlanUpgrade(s) {
  s.exercises = Array.isArray(s.exercises) ? s.exercises : [];
  s.workouts = Array.isArray(s.workouts) ? s.workouts : [];
  s.sessions = Array.isArray(s.sessions) ? s.sessions : [];
  s.appMigrations = Array.isArray(s.appMigrations) ? s.appMigrations : [];

  if (s.appMigrations.includes(STRENGTH_PLAN_MIGRATION)) return s;

  const exercise = {
    smithBench: ensureExercise(s, "Smith Machine Bench Press", "Chest", "Smith Machine"),
    chestSupportedRow: ensureExercise(s, "Chest-Supported Row", "Back", "Machine"),
    neutralPulldown: ensureExercise(s, "Neutral-Grip Lat Pulldown", "Back", "Cable"),
    cableLateral: ensureExercise(s, "Cable Lateral Raise", "Shoulders", "Cable"),
    ropePressdown: ensureExercise(s, "Rope Triceps Pressdown", "Arms", "Cable"),
    backSquat: ensureExercise(s, "Back Squat", "Legs", "Barbell"),
    romanianDeadlift: ensureExercise(s, "Romanian Deadlift", "Legs", "Barbell"),
    legCurl: ensureExercise(s, "Seated or Lying Leg Curl", "Legs", "Machine"),
    calfRaise: ensureExercise(s, "Standing Calf Raise", "Legs", "Machine"),
    dumbbellOHP: ensureExercise(s, "Seated Dumbbell Overhead Press", "Shoulders", "Dumbbells"),
    assistedPullup: ensureExercise(s, "Assisted Pull-Up or Lat Pulldown", "Back", "Machine"),
    inclineDumbbell: ensureExercise(s, "Incline Dumbbell Press", "Chest", "Dumbbells"),
    cableRow: ensureExercise(s, "Seated Cable Row", "Back", "Cable"),
    cableCurl: ensureExercise(s, "Cable Curl", "Arms", "Cable"),
    reversePecDeck: ensureExercise(s, "Reverse Pec Deck", "Shoulders", "Machine"),
    trapBarDeadlift: ensureExercise(s, "Trap-Bar Deadlift", "Legs", "Trap Bar"),
    legPress: ensureExercise(s, "Leg Press", "Legs", "Machine"),
    reverseLunge: ensureExercise(s, "Reverse Lunge", "Legs", "Dumbbells"),
    seatedLegCurl: ensureExercise(s, "Seated Leg Curl", "Legs", "Machine"),
    stairMaster: ensureExercise(s, "StairMaster", "Cardio", "StairMaster", "duration")
  };

  const workoutDefs = [
    {
      planKey:"strength-upper-a",
      scheduleOrder:1,
      name:"1 • Upper A (Monday)",
      exercises:[
        plannedExercise(exercise.smithBench.id, 3, "6–8", 180, "3 RIR", "Next planned load: 145 lb. Build to 3×8 before increasing."),
        plannedExercise(exercise.chestSupportedRow.id, 3, "6–10", 120, "2–3 RIR", "Next planned load: 145 lb. Start by aiming for 7/6/6."),
        plannedExercise(exercise.neutralPulldown.id, 2, "8–12", 90, "2 RIR", "Next planned load: 105 lb. Aim for 9/8 if form stays clean."),
        plannedExercise(exercise.cableLateral.id, 2, "12–15", 60, "2–3 RIR", "Superset with rope pressdowns."),
        plannedExercise(exercise.ropePressdown.id, 2, "10–15", 60, "2 RIR", "Next planned load: 30 lb. Superset after lateral raises.")
      ]
    },
    {
      planKey:"strength-lower-a",
      scheduleOrder:2,
      name:"2 • Lower A (Tuesday)",
      exercises:[
        plannedExercise(exercise.backSquat.id, 3, "5–8", 180, "3 RIR", "Substitute: hack squat or Smith box squat."),
        plannedExercise(exercise.romanianDeadlift.id, 3, "6–10", 150, "3 RIR", "Substitute: 45° back extension."),
        plannedExercise(exercise.legCurl.id, 2, "10–15", 60, "2 RIR", "Superset with standing calf raises."),
        plannedExercise(exercise.calfRaise.id, 2, "10–15", 75, "2 RIR", "Rest after completing the superset pair.")
      ]
    },
    {
      planKey:"strength-upper-b",
      scheduleOrder:3,
      name:"3 • Upper B (Thursday)",
      exercises:[
        plannedExercise(exercise.dumbbellOHP.id, 3, "5–8", 150, "3 RIR", "Substitute: machine shoulder press."),
        plannedExercise(exercise.assistedPullup.id, 3, "6–10", 120, "2–3 RIR", "Use the pulldown if assisted pull-ups are unavailable."),
        plannedExercise(exercise.inclineDumbbell.id, 2, "8–12", 90, "2 RIR", "Substitute: incline machine press."),
        plannedExercise(exercise.cableRow.id, 2, "8–12", 90, "2 RIR", "Substitute: machine row."),
        plannedExercise(exercise.cableCurl.id, 2, "10–15", 60, "2 RIR", "Superset with reverse pec deck."),
        plannedExercise(exercise.reversePecDeck.id, 2, "12–15", 60, "2–3 RIR", "Rest after completing the superset pair.")
      ]
    },
    {
      planKey:"strength-lower-b",
      scheduleOrder:4,
      name:"4 • Lower B + StairMaster (Friday)",
      exercises:[
        plannedExercise(exercise.trapBarDeadlift.id, 3, "4–6", 180, "3 RIR", "Substitute: conventional deadlift or heavy leg press."),
        plannedExercise(exercise.legPress.id, 3, "8–12", 120, "2–3 RIR", "Substitute: hack squat."),
        plannedExercise(exercise.reverseLunge.id, 2, "8–10 / leg", 90, "2–3 RIR", "Substitute: split squat or step-up."),
        plannedExercise(exercise.seatedLegCurl.id, 2, "10–15", 90, "2 RIR", "Substitute: lying leg curl."),
        plannedExercise(exercise.stairMaster.id, 1, "8–12 min", 0, "RPE 5–6", "Perform after lifting at a moderate, conversational pace.")
      ]
    }
  ];

  for (const definition of workoutDefs) {
    const workout = {
      id: uid(),
      planKey: definition.planKey,
      scheduleOrder: definition.scheduleOrder,
      name: definition.name,
      exercises: definition.exercises
    };
    s.workouts.push(workout);
  }

  const upperA = s.workouts.find(item => item.planKey === "strength-upper-a");
  const seedKey = "upper_a_2026_08_17";
  if (upperA && !s.sessions.some(item => item.seedKey === seedKey)) {
    const endedAt = Date.parse("2026-08-17T18:00:00-04:00");
    const startedAt = endedAt - (42 * 60 * 1000);
    let createdAt = startedAt + (5 * 60 * 1000);
    const sets = rows => rows.map((row, index) => {
      createdAt += 90 * 1000;
      return {
        id:uid(),
        setNumber:index + 1,
        reps:row.reps,
        weightLb:Number.isFinite(row.weightLb) ? row.weightLb : null,
        rir:Number.isFinite(row.rir) ? row.rir : null,
        createdAt
      };
    });

    s.sessions.push({
      id:uid(),
      seedKey,
      workoutId:upperA.id,
      workoutName:upperA.name,
      startedAt,
      endedAt,
      exercises:[
        {
          id:uid(), orderIndex:0, exerciseId:exercise.smithBench.id,
          targetSets:3, targetReps:"6–8", restSeconds:180, targetEffort:"3 RIR",
          sets:sets([
            { reps:10, weightLb:135 },
            { reps:6, weightLb:155 },
            { reps:6, weightLb:155, rir:1 }
          ])
        },
        {
          id:uid(), orderIndex:1, exerciseId:exercise.chestSupportedRow.id,
          targetSets:3, targetReps:"6–10", restSeconds:120, targetEffort:"2–3 RIR",
          sets:sets([
            { reps:6, weightLb:145 },
            { reps:6, weightLb:145 },
            { reps:6, weightLb:145 },
            { reps:6, weightLb:145 }
          ])
        },
        {
          id:uid(), orderIndex:2, exerciseId:exercise.neutralPulldown.id,
          targetSets:2, targetReps:"8–12", restSeconds:90, targetEffort:"2 RIR",
          sets:sets([
            { reps:8, weightLb:105 },
            { reps:8, weightLb:105 }
          ])
        },
        {
          id:uid(), orderIndex:3, exerciseId:exercise.cableLateral.id,
          targetSets:2, targetReps:"12–15", restSeconds:60, targetEffort:"2–3 RIR",
          sets:sets([
            { reps:12, weightLb:null },
            { reps:12, weightLb:null }
          ])
        },
        {
          id:uid(), orderIndex:4, exerciseId:exercise.ropePressdown.id,
          targetSets:2, targetReps:"10–15", restSeconds:60, targetEffort:"2 RIR",
          sets:sets([
            { reps:12, weightLb:30 },
            { reps:12, weightLb:30 }
          ])
        }
      ]
    });
  }

  s.appMigrations.push(STRENGTH_PLAN_MIGRATION);
  return s;
}

function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

function migrateLegacy(old) {
  const s = { ...DEFAULT_STATE(), ...old };

  // If older had programs -> flatten workouts
  if (!s.workouts?.length && Array.isArray(s.programs)) {
    const flattened = [];
    for (const p of s.programs) {
      for (const w of (p.workouts || [])) {
        flattened.push({
          id: w.id || uid(),
          name: `${p.name} • ${w.name}`,
          exercises: (w.exercises || []).map(te => ({
            id: te.id || uid(),
            exerciseId: te.exerciseId,
            targetSets: te.targetSets ?? 3,
            targetReps: te.targetReps ?? 10,
            restSeconds: te.restSeconds ?? 90
          }))
        });
      }
    }
    s.workouts = flattened;
  }

  delete s.programs;
  return s;
}

function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try { return { ...DEFAULT_STATE(), ...JSON.parse(raw) }; } catch {}
  }
  for (const k of LEGACY_KEYS) {
    const legacy = localStorage.getItem(k);
    if (legacy) {
      try {
        const migrated = migrateLegacy(JSON.parse(legacy));
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
function trackingTypeForExercise(exerciseId) {
  return exerciseById(exerciseId)?.trackingType || "weight_reps";
}
function targetSummary(item) {
  if (trackingTypeForExercise(item.exerciseId) === "duration") {
    const effort = item.targetEffort ? ` • ${item.targetEffort}` : "";
    return `Target: ${item.targetReps}${effort}`;
  }
  const effort = item.targetEffort ? ` • ${item.targetEffort}` : "";
  const rest = item.restSeconds ? ` • Rest: ${item.restSeconds}s` : "";
  return `Target: ${item.targetSets} × ${item.targetReps}${effort}${rest}`;
}
function formatLoggedSet(set, exerciseId) {
  if (trackingTypeForExercise(exerciseId) === "duration") {
    const rpe = Number.isFinite(set.rpe) ? ` • RPE ${set.rpe}` : "";
    return `${set.durationMinutes} min${rpe}`;
  }

  const weight = Number.isFinite(set.weightLb)
    ? `${toDisplayWeight(set.weightLb).toFixed(1)} ${unitLabel()}`
    : "weight not recorded";
  const rir = Number.isFinite(set.rir) ? ` • ${set.rir} RIR` : "";
  return `${set.reps} reps • ${weight}${rir}`;
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

function exerciseById(id) { return state.exercises.find(e => e.id === id) || null; }
function exerciseName(id) { return exerciseById(id)?.name || "Exercise"; }
function workoutById(id) { return state.workouts.find(w => w.id === id) || null; }

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
  const active = document.getElementById(`route-${r}`);
  if (active) active.classList.remove("hidden");

  routeLabel.textContent =
    r === "workouts" ? "Workouts" :
    r === "history" ? "History" :
    "Settings";

  if (r !== "workouts") ui.workouts = { screen:"list", workoutId:null };
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
      return { ...last, date:last.createdAt };
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

// ---------- sessions ----------
function getActiveSession() {
  if (!state.activeSessionId) return null;
  return state.sessions.find(s => s.id === state.activeSessionId) || null;
}

function startWorkout(workoutId) {
  if (getActiveSession()) return toast("Finish your current workout first.");
  const w = workoutById(workoutId);
  if (!w) return toast("Workout not found.");

  const session = {
    id: uid(),
    workoutId: w.id,
    workoutName: w.name,
    startedAt: Date.now(),
    endedAt: null,
    exercises: (w.exercises || []).map((te, idx) => ({
      id: uid(),
      orderIndex: idx,
      exerciseId: te.exerciseId,
      targetSets: te.targetSets,
      targetReps: te.targetReps,
      restSeconds: te.restSeconds,
      targetEffort: te.targetEffort || "",
      notes: te.notes || "",
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
  ui.history = { screen:"list", sessionId:null };
  setRoute("history");
}

function addSetToSessionExercise(sessionExerciseId, values) {
  const sess = getActiveSession();
  if (!sess) return;

  const se = sess.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;

  const nextSetNumber = (se.sets.map(s => s.setNumber).reduce((a,b)=>Math.max(a,b), 0)) + 1;

  if (trackingTypeForExercise(se.exerciseId) === "duration") {
    const durationMinutes = Number(values.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return toast("Enter minutes");

    const rpeTrim = String(values.rpe ?? "").trim();
    const rpeNumber = rpeTrim ? Number(rpeTrim) : null;
    se.sets.push({
      id:uid(),
      setNumber:nextSetNumber,
      durationMinutes,
      rpe:Number.isFinite(rpeNumber) ? rpeNumber : null,
      createdAt:Date.now()
    });

    saveState();
    renderActiveWorkout();
    return;
  }

  const repsNum = Number(values.reps);
  if (!Number.isFinite(repsNum) || repsNum <= 0) return toast("Enter reps");

  const weightTrim = String(values.weightDisplay ?? "").trim();
  let weightLb = null;

  if (!weightTrim && state.settings.blankWeightUsesBaseline) {
    const last = lastSetForExercise(se.exerciseId);
    if (last && Number.isFinite(last.weightLb)) weightLb = last.weightLb;
  } else if (weightTrim) {
    weightLb = toPounds(weightTrim);
  }

  const rirTrim = String(values.rir ?? "").trim();
  const rirNumber = rirTrim ? Number(rirTrim) : null;

  se.sets.push({
    id: uid(),
    setNumber: nextSetNumber,
    reps: Math.floor(repsNum),
    weightLb: Number.isFinite(weightLb) ? weightLb : null,
    rir: Number.isFinite(rirNumber) ? rirNumber : null,
    createdAt: Date.now()
  });

  saveState();
  renderActiveWorkout();

  if (state.settings.autoRest) {
    startTimer(se.restSeconds || 90, `Next set • ${exerciseName(se.exerciseId)}`);
  }
}

// ---------- workouts (templates) ----------
function createWorkout(name) {
  const n = name.trim();
  if (!n) return toast("Name required");
  state.workouts.push({ id: uid(), name: n, exercises: [] });
  saveState();
  toast("Workout created");
  ui.workouts = { screen:"detail", workoutId: state.workouts[state.workouts.length - 1].id };
  renderWorkoutsHome();
}

function deleteWorkout(workoutId) {
  const w = workoutById(workoutId);
  if (!w) return;
  if (!confirm(`Delete "${w.name}"?`)) return;
  state.workouts = state.workouts.filter(x => x.id !== workoutId);
  saveState();
  ui.workouts = { screen:"list", workoutId:null };
  renderWorkoutsHome();
}

function addExercisesBulkToWorkout(workoutId, exerciseIds) {
  const w = workoutById(workoutId);
  if (!w) return;

  for (const exId of exerciseIds) {
    if (w.exercises.some(te => te.exerciseId === exId)) continue;
    w.exercises.push({
      id:uid(), exerciseId:exId, targetSets:3, targetReps:"10", restSeconds:90,
      targetEffort:"", notes:""
    });
  }

  saveState();
  toast("Exercises added");
  renderWorkoutsHome();
}

function removeWorkoutExercise(workoutId, workoutExerciseId) {
  const w = workoutById(workoutId);
  if (!w) return;
  w.exercises = w.exercises.filter(te => te.id !== workoutExerciseId);
  saveState();
  renderWorkoutsHome();
}

function updateWorkoutExercise(workoutId, workoutExerciseId, sets, reps, rest, effort, notes) {
  const w = workoutById(workoutId);
  const te = w?.exercises.find(x => x.id === workoutExerciseId);
  if (!te) return;
  te.targetSets = Number(sets) || te.targetSets;
  te.targetReps = String(reps || te.targetReps).trim();
  te.restSeconds = Number(rest) || 0;
  te.targetEffort = String(effort || "").trim();
  te.notes = String(notes || "").trim();
  saveState();
  toast("Updated");
  renderWorkoutsHome();
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
  for (const w of state.workouts) {
    w.exercises = w.exercises.filter(te => te.exerciseId !== exId);
  }
  saveState();
  renderSettingsRoute();
  toast("Deleted");
}

function openModal(html, kind = "") {
  modalContent.innerHTML = html;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
  modal.classList.toggle("picker-open", kind === "picker");
}

function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
  modalContent.innerHTML = "";
  modal.classList.remove("picker-open");
}

function openNewWorkoutModal() {
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">New workout</div>
        <div class="sheetsub">Example: Push Day, Pull Day, Legs</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <input id="mName" class="input" placeholder="Workout name" />

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Create</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;
  document.getElementById("mSave").onclick = () => {
    createWorkout(document.getElementById("mName").value);
    closeModal();
  };
}

function openBulkExercisePicker(workoutId) {
  const all = state.exercises.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const selected = new Set();

  openModal(`
  <div class="picker-top">
    <div class="sheethead">
      <div>
        <div class="sheettitle">Add exercises</div>
        <div class="sheetsub">Search + select multiple</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="row">
      <input id="mSearch" class="input" placeholder="Search…" />
      <button class="iconbtn" id="mNewCustom" title="New custom">＋</button>
    </div>
  </div>

  <div id="mList" class="list picker-list"></div>

  <!-- ✅ Add/Cancel stays AFTER the list, like before -->
  <div class="row space-between" style="margin-top:12px">
    <div class="muted" id="mCount">0 selected</div>
    <div class="row">
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
      <button class="btn" id="mAddBtn">Add</button>
    </div>
  </div>
`, "picker");

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
    const raw = (mSearch.value || "").trim();
    const q = raw.toLowerCase();
    const filtered = all.filter(ex => !q || ex.name.toLowerCase().includes(q));

    mList.innerHTML = "";

    // “Create …” only when 3+ chars and no results
    if (filtered.length === 0 && raw.length >= 3) {
      const row = el("div","listrow");
      const left = el("div");
      left.appendChild(txt("div","label", `Create "${raw}"`));
      left.appendChild(txt("div","muted", "Add as a new custom exercise"));
      row.appendChild(left);

      row.appendChild(iconBtn("＋","Create", () => {
        openCustomExerciseModal(() => {
          all.splice(0, all.length, ...state.exercises.slice().sort((a,b)=>a.name.localeCompare(b.name)));
          const newest = state.exercises.slice().reverse().find(e => e.isCustom && e.name.toLowerCase() === raw.toLowerCase());
          if (newest) selected.add(newest.id);
          renderList();
        }, raw);
      }));

      mList.appendChild(row);
      mCount.textContent = `${selected.size} selected`;
      return;
    }

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

  // debounce typing
  let searchT = null;
  mSearch.oninput = () => {
    clearTimeout(searchT);
    searchT = setTimeout(renderList, 150);
  };

  mNewCustom.onclick = () => {
    openCustomExerciseModal(() => {
      all.splice(0, all.length, ...state.exercises.slice().sort((a,b)=>a.name.localeCompare(b.name)));
      renderList();
    }, mSearch.value.trim());
  };

  mAddBtn.onclick = () => {
    if (selected.size === 0) return toast("Select at least 1");
    addExercisesBulkToWorkout(workoutId, Array.from(selected));
    closeModal();
  };

  renderList();
}

function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function openCustomExerciseModal(onDone, prefillName = "") {
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">New custom exercise</div>
        <div class="sheetsub">Adds it to your library</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="grid2">
      <input id="mName" class="input" placeholder="Name" value="${escapeHtml(prefillName)}" />
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

function openEditWorkoutExerciseModal(workoutId, te) {
  const exName = exerciseName(te.exerciseId);
  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">${exName}</div>
        <div class="sheetsub">Sets, reps, rest</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="grid2">
      <input id="mSets" class="input" type="number" min="1" value="${te.targetSets}" placeholder="Sets" />
      <input id="mReps" class="input" type="text" value="${escapeHtml(te.targetReps)}" placeholder="Reps or minutes" />
      <input id="mRest" class="input" type="number" min="0" step="10" value="${te.restSeconds || 0}" placeholder="Rest seconds" />
      <input id="mEffort" class="input" type="text" value="${escapeHtml(te.targetEffort || "")}" placeholder="Effort, e.g. 3 RIR" />
      <input id="mNotes" class="input" type="text" value="${escapeHtml(te.notes || "")}" placeholder="Notes or next load" />
      <div class="muted" style="padding: 10px 2px">Use longer rest for compound lifts.</div>
    </div>

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Save</button>
      <button class="btn btn-ghost" id="mRemove">Remove exercise</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mSave").onclick = () => {
    updateWorkoutExercise(
      workoutId, te.id,
      document.getElementById("mSets").value,
      document.getElementById("mReps").value,
      document.getElementById("mRest").value,
      document.getElementById("mEffort").value,
      document.getElementById("mNotes").value
    );
    closeModal();
  };
  document.getElementById("mRemove").onclick = () => {
    removeWorkoutExercise(workoutId, te.id);
    closeModal();
    toast("Removed");
  };
}

function openSetModal(sessionExerciseId) {
  const sess = getActiveSession();
  if (!sess) return;

  const se = sess.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;

  const last = lastSetForExercise(se.exerciseId);
  const lastLine = last ? `Last: ${formatLoggedSet(last, se.exerciseId)}` : `No history yet`;
  const isDuration = trackingTypeForExercise(se.exerciseId) === "duration";
  const inputFields = isDuration
    ? `
      <input id="mMinutes" class="input" type="number" min="1" step="1" placeholder="Minutes" />
      <input id="mRpe" class="input" type="number" min="1" max="10" step="0.5" placeholder="RPE (optional)" />
    `
    : `
      <input id="mReps" class="input" type="number" min="1" placeholder="Reps" />
      <input id="mWeight" class="input" type="number" step="0.5" placeholder="Weight (${unitLabel()})" />
      <input id="mRir" class="input" type="number" min="0" max="10" step="1" placeholder="RIR (optional)" />
    `;

  openModal(`
    <div class="sheethead">
      <div>
        <div class="sheettitle">${exerciseName(se.exerciseId)}</div>
        <div class="sheetsub">${lastLine}</div>
      </div>
      <button class="iconbtn" id="mClose">✕</button>
    </div>

    <div class="grid2">
      ${inputFields}
    </div>

    <div class="help">${isDuration
      ? "Record total minutes and optional effort."
      : "Leave weight blank to use your last recorded weight (if enabled)."}</div>

    <div class="row" style="margin-top:12px">
      <button class="btn" id="mSave">Save</button>
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
    </div>
  `);

  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mCancel").onclick = closeModal;

  if (!isDuration && last && Number.isFinite(last.weightLb)) {
    document.getElementById("mWeight").placeholder = `Weight (${unitLabel()}) — e.g. ${toDisplayWeight(last.weightLb).toFixed(1)}`;
  }

  document.getElementById("mSave").onclick = () => {
    const values = isDuration
      ? {
          durationMinutes:document.getElementById("mMinutes").value,
          rpe:document.getElementById("mRpe").value
        }
      : {
          reps:document.getElementById("mReps").value,
          weightDisplay:document.getElementById("mWeight").value,
          rir:document.getElementById("mRir").value
        };
    addSetToSessionExercise(sessionExerciseId, values);
    closeModal();
  };
}

// ---------- render ----------
function renderAll() {
  renderHeader();
  renderActiveWorkout();
  renderWorkoutsHome();
  renderHistoryRoute();
  renderSettingsRoute();
}

function renderHeader() {
  const sess = getActiveSession();
  if (sess) {
    headerPill.textContent = "Active";
    headerPill.classList.remove("hidden");
  } else {
    headerPill.classList.add("hidden");
  }
}

function renderActiveWorkout() {
  const sess = getActiveSession();

  if (route !== "workouts") {
    activeWorkout.classList.add("hidden");
    return;
  }

  if (!sess) {
    activeWorkout.classList.add("hidden");
    activeExercises.innerHTML = "";
    return;
  }

  activeWorkout.classList.remove("hidden");
  activeTitle.textContent = sess.workoutName || "Workout";
  activeMeta.textContent = `Started ${fmtDateTime(sess.startedAt)}`;

  activeExercises.innerHTML = "";

  for (const se of sess.exercises.sort((a,b)=>a.orderIndex-b.orderIndex)) {
    const card = el("div","card");
    const header = el("div","exercise-header");

    const left = el("div");
    left.appendChild(txt("div","exercise-title", exerciseName(se.exerciseId)));
    left.appendChild(txt("div","exercise-meta", targetSummary(se)));
    if (se.notes) left.appendChild(txt("div","help", se.notes));

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
        row.appendChild(txt("span","",formatLoggedSet(s, se.exerciseId)));
        setsWrap.appendChild(row);
      }
    }

    card.appendChild(header);
    card.appendChild(setsWrap);
    activeExercises.appendChild(card);
  }
}

function renderWorkoutsHome() {
  if (route !== "workouts") return;
  workoutsRoot.innerHTML = "";

  const sess = getActiveSession();

  // If workout is active, keep home clean: show only active panel + small hint
  if (sess) {
    const hint = el("div","panel");
    hint.appendChild(txt("div","label","Workout in progress"));
    hint.appendChild(txt("div","help","Finish it above, then your workout list will reappear."));
    workoutsRoot.appendChild(hint);
    return;
  }

  // LIST or DETAIL
  if (ui.workouts.screen === "list") {
    const panel = el("div","panel");
    const top = el("div","row space-between");

    const left = el("div");
    left.appendChild(txt("h2","", "Workouts"));
    left.appendChild(txt("div","muted","Tap Start to begin, or › to edit."));
    top.appendChild(left);

    top.appendChild(iconBtn("＋","New workout", openNewWorkoutModal));
    panel.appendChild(top);
    workoutsRoot.appendChild(panel);

    const workouts = state.workouts.slice().sort((a,b) => {
      const aOrder = Number.isFinite(a.scheduleOrder) ? a.scheduleOrder : 999;
      const bOrder = Number.isFinite(b.scheduleOrder) ? b.scheduleOrder : 999;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    });
    if (!workouts.length) {
      workoutsRoot.appendChild(txt("div","panel muted","No workouts yet. Tap + to create one."));
      return;
    }

    for (const w of workouts) {
      const card = el("div","card");
      const row = el("div","row space-between");

      const l = el("div");
      l.appendChild(txt("div","label", w.name));
      l.appendChild(txt("div","muted", `${w.exercises.length} exercise(s)`));
      row.appendChild(l);

      const r = el("div");
      r.style.display="flex"; r.style.gap="8px";
      r.appendChild(iconBtn("▶","Start", () => startWorkout(w.id)));
      r.appendChild(iconBtn("›","Edit", () => { ui.workouts = { screen:"detail", workoutId:w.id }; renderWorkoutsHome(); }));
      r.appendChild(iconBtn("🗑","Delete", () => deleteWorkout(w.id)));
      row.appendChild(r);

      card.appendChild(row);
      workoutsRoot.appendChild(card);
    }
    return;
  }

  if (ui.workouts.screen === "detail") {
    const w = workoutById(ui.workouts.workoutId);
    if (!w) { ui.workouts = { screen:"list", workoutId:null }; return renderWorkoutsHome(); }

    const panel = el("div","panel");
    const top = el("div","row space-between");

    const l = el("div");
    l.appendChild(txt("h2","", w.name));
    l.appendChild(txt("div","muted","Add exercises, then edit sets/reps/rest."));
    top.appendChild(l);

    const r = el("div"); r.style.display="flex"; r.style.gap="8px";
    r.appendChild(iconBtn("‹","Back", () => { ui.workouts = { screen:"list", workoutId:null }; renderWorkoutsHome(); }));
    r.appendChild(iconBtn("＋","Add exercises", () => openBulkExercisePicker(w.id)));
    r.appendChild(iconBtn("▶","Start", () => { ui.workouts = { screen:"list", workoutId:null }; startWorkout(w.id); }));
    top.appendChild(r);

    panel.appendChild(top);
    workoutsRoot.appendChild(panel);

    if (!w.exercises.length) {
      const empty = el("div","panel");
      empty.appendChild(txt("div","label","No exercises yet"));
      empty.appendChild(txt("div","help","Tap “Add exercises” and pick multiple."));
      workoutsRoot.appendChild(empty);
      return;
    }

    for (const te of w.exercises.slice()) {
      const card = el("div","card");
      const row = el("div","row space-between");

      const left = el("div");
      left.appendChild(txt("div","label", exerciseName(te.exerciseId)));
      left.appendChild(txt("div","muted", targetSummary(te)));
      if (te.notes) left.appendChild(txt("div","help", te.notes));
      row.appendChild(left);

      row.appendChild(iconBtn("⋯","Edit", () => openEditWorkoutExerciseModal(w.id, te)));

      card.appendChild(row);
      workoutsRoot.appendChild(card);
    }
  }
}

function renderHistoryRoute() {
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
      left.appendChild(txt("div","label", s.workoutName || "Workout"));
      left.appendChild(txt("div","muted", `${fmtDateTime(s.startedAt)} • ${fmtDuration(s.endedAt - s.startedAt)}`));
      row.appendChild(left);

      row.appendChild(iconBtn("›","Open", () => { ui.history = { screen:"detail", sessionId:s.id }; renderHistoryRoute(); }));
      card.appendChild(row);

      const names = s.exercises.map(se => exerciseName(se.exerciseId)).join(", ");
      if (names) card.appendChild(txt("div","help", names));

      historyRoot.appendChild(card);
    }
    return;
  }

  if (ui.history.screen === "detail") {
    const s = state.sessions.find(x => x.id === ui.history.sessionId);
    if (!s) { ui.history = { screen:"list", sessionId:null }; return renderHistoryRoute(); }

    const panel = el("div","panel");
    const top = el("div","row space-between");

    const left = el("div");
    left.appendChild(txt("h2","", s.workoutName || "Workout"));
    left.appendChild(txt("div","muted", `${fmtDateTime(s.startedAt)} • ${fmtDuration(s.endedAt - s.startedAt)}`));
    top.appendChild(left);

    top.appendChild(iconBtn("‹","Back", () => { ui.history = { screen:"list", sessionId:null }; renderHistoryRoute(); }));
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
            `Set ${set.setNumber}: ${formatLoggedSet(set, se.exerciseId)}`
          ));
        }
      }
      historyRoot.appendChild(card);
    }
  }
}

function renderSettingsRoute() {
  if (route !== "settings") return;

  unitsToggle.checked = !!state.settings.isKg;
  autoRestToggle.checked = !!state.settings.autoRest;
  blankWeightUsesBaselineToggle.checked = !!state.settings.blankWeightUsesBaseline;

  unitsToggle.onchange = () => { state.settings.isKg = unitsToggle.checked; saveState(); renderAll(); };
  autoRestToggle.onchange = () => { state.settings.autoRest = autoRestToggle.checked; saveState(); };
  blankWeightUsesBaselineToggle.onchange = () => { state.settings.blankWeightUsesBaseline = blankWeightUsesBaselineToggle.checked; saveState(); };

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
  state.appMigrations.push(STRENGTH_PLAN_MIGRATION);
  saveState();
  stopTimer(true);
  ui.workouts = { screen:"list", workoutId:null };
  ui.history = { screen:"list", sessionId:null };
  renderAll();
  toast("Reset complete");
}

// ---------- boot ----------
renderAll();
setRoute("workouts");

// restore timer if running
if (state.timer.running && state.timer.endTs) {
  timerBar.classList.remove("hidden");
  timerSub.textContent = state.timer.label || "—";
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}
