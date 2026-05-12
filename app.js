/* Lift Log PWA
   A fast, offline-first workout tracker inspired by strong routine planning,
   inline gym logging, rest timers, history, and personal records.
*/

const LS_KEY = "gym_tracker_v6";
const LEGACY_KEYS = ["gym_tracker_v5","gym_tracker_v4","gym_tracker_v3","gym_tracker_v2","gym_tracker_v1"];

let state = loadState();
let route = "workouts";
let ui = {
  workouts: { screen: "list", workoutId: null },
  history: { screen: "list", sessionId: null }
};

const $ = (id) => document.getElementById(id);
const els = {
  toast: $("toast"),
  drawer: $("drawer"),
  drawerBackdrop: $("drawerBackdrop"),
  drawerClose: $("drawerClose"),
  menuBtn: $("menuBtn"),
  navItems: Array.from(document.querySelectorAll(".navitem")),
  routeLabel: $("routeLabel"),
  headerPill: $("headerPill"),
  timerBar: $("timerBar"),
  timerSub: $("timerSub"),
  timerCountdown: $("timerCountdown"),
  timerProgress: $("timerProgress"),
  activeWorkout: $("activeWorkout"),
  workoutsRoot: $("workoutsRoot"),
  historyRoot: $("historyRoot"),
  settingsRoute: $("route-settings"),
  unitsToggle: $("unitsToggle"),
  autoRestToggle: $("autoRestToggle"),
  blankWeightUsesBaselineToggle: $("blankWeightUsesBaselineToggle"),
  enableNotificationsBtn: $("enableNotificationsBtn"),
  notificationStatus: $("notificationStatus"),
  customExercisesList: $("customExercisesList"),
  modal: $("modal"),
  modalBackdrop: $("modalBackdrop"),
  modalContent: $("modalContent")
};

els.menuBtn.addEventListener("click", openDrawer);
els.drawerBackdrop.addEventListener("click", closeDrawer);
els.drawerClose.addEventListener("click", closeDrawer);
els.navItems.forEach(btn => btn.addEventListener("click", () => {
  setRoute(btn.dataset.route);
  closeDrawer();
}));
$("timerStop").addEventListener("click", () => stopTimer(true));
$("timerPlus").addEventListener("click", () => addTimer(30));
$("timerMinus").addEventListener("click", () => addTimer(-15));
$("newExerciseBtn").addEventListener("click", () => openCustomExerciseModal(() => renderSettingsRoute()));
els.enableNotificationsBtn.addEventListener("click", enableTimerNotifications);
els.modalBackdrop.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("touchmove", (e) => e.preventDefault(), { passive:false });

function DEFAULT_STATE(){
  const exercises = seedExercises();
  return {
    settings: { isKg:false, autoRest:true, blankWeightUsesBaseline:true },
    exercises,
    workouts: seedWorkouts(exercises),
    sessions: [],
    activeSessionId: null,
    timer: { running:false, total:0, remaining:0, endTs:null, label:"" }
  };
}

function seedExercises(){
  return [
    ex("Bench Press","Chest","Barbell"),
    ex("Incline Dumbbell Press","Chest","Dumbbells"),
    ex("Chest Fly","Chest","Machine"),
    ex("Overhead Press","Shoulders","Barbell"),
    ex("Lateral Raise","Shoulders","Dumbbells"),
    ex("Lat Pulldown","Back","Cable"),
    ex("Pull Up","Back","Bodyweight"),
    ex("Barbell Row","Back","Barbell"),
    ex("Deadlift","Back","Barbell"),
    ex("Squat","Legs","Barbell"),
    ex("Leg Press","Legs","Machine"),
    ex("Romanian Deadlift","Legs","Barbell"),
    ex("Leg Curl","Legs","Machine"),
    ex("Calf Raise","Legs","Machine"),
    ex("Bicep Curl","Arms","Dumbbells"),
    ex("Hammer Curl","Arms","Dumbbells"),
    ex("Tricep Pushdown","Arms","Cable"),
    ex("Plank","Core","Bodyweight")
  ];
}

function seedWorkouts(exercises){
  const idByName = Object.fromEntries(exercises.map(e => [e.name, e.id]));
  const make = (name, rows) => ({
    id: uid(),
    name,
    notes: "",
    exercises: rows.map(([exerciseName, sets, reps, rest]) => ({
      id: uid(),
      exerciseId: idByName[exerciseName],
      targetSets: sets,
      targetReps: reps,
      restSeconds: rest,
      notes: ""
    })).filter(x => x.exerciseId)
  });
  return [
    make("Push Day", [
      ["Bench Press", 3, 8, 120],
      ["Incline Dumbbell Press", 3, 10, 90],
      ["Overhead Press", 3, 8, 120],
      ["Lateral Raise", 3, 12, 60],
      ["Tricep Pushdown", 3, 12, 60]
    ]),
    make("Pull Day", [
      ["Deadlift", 3, 5, 180],
      ["Lat Pulldown", 3, 10, 90],
      ["Barbell Row", 3, 8, 120],
      ["Bicep Curl", 3, 12, 60],
      ["Hammer Curl", 2, 12, 60]
    ]),
    make("Leg Day", [
      ["Squat", 3, 6, 180],
      ["Leg Press", 3, 10, 120],
      ["Romanian Deadlift", 3, 8, 120],
      ["Leg Curl", 3, 12, 75],
      ["Calf Raise", 4, 12, 60]
    ])
  ];
}

function ex(name, muscleGroup, equipment){
  return { id: uid(), name, muscleGroup, equipment, notes:"", isCustom:false };
}

function loadState(){
  const defaults = DEFAULT_STATE();
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try { return normalizeState({ ...defaults, ...JSON.parse(raw) }); } catch {}
  }
  for (const key of LEGACY_KEYS) {
    const legacy = localStorage.getItem(key);
    if (!legacy) continue;
    try {
      const migrated = migrateLegacy(JSON.parse(legacy), defaults);
      localStorage.setItem(LS_KEY, JSON.stringify(migrated));
      return migrated;
    } catch {}
  }
  return defaults;
}

function migrateLegacy(old, defaults){
  const s = normalizeState({ ...defaults, ...old });
  if (!s.workouts.length && Array.isArray(old.programs)) {
    s.workouts = old.programs.flatMap(p => (p.workouts || []).map(w => ({
      id: w.id || uid(),
      name: `${p.name} - ${w.name}`,
      notes: "",
      exercises: (w.exercises || []).map(te => ({
        id: te.id || uid(),
        exerciseId: te.exerciseId,
        targetSets: te.targetSets || 3,
        targetReps: te.targetReps || 10,
        restSeconds: te.restSeconds || 90,
        notes: ""
      }))
    })));
  }
  delete s.programs;
  return s;
}

function normalizeState(s){
  s.settings = { isKg:false, autoRest:true, blankWeightUsesBaseline:true, ...(s.settings || {}) };
  s.exercises = Array.isArray(s.exercises) ? s.exercises : [];
  s.workouts = Array.isArray(s.workouts) ? s.workouts : [];
  s.sessions = Array.isArray(s.sessions) ? s.sessions : [];
  s.workouts.forEach(w => {
    w.notes ||= "";
    w.exercises = Array.isArray(w.exercises) ? w.exercises : [];
    w.exercises.forEach(te => {
      te.targetSets ||= 3;
      te.targetReps ||= 10;
      te.restSeconds ||= 90;
      te.notes ||= "";
    });
  });
  s.sessions.forEach(sess => {
    sess.notes ||= "";
    sess.exercises = Array.isArray(sess.exercises) ? sess.exercises : [];
    sess.exercises.forEach(se => {
      se.notes ||= "";
      se.sets = Array.isArray(se.sets) ? se.sets : [];
      se.sets.forEach(set => {
        set.type ||= "normal";
        set.done = set.done !== false;
      });
    });
  });
  s.timer ||= { running:false, total:0, remaining:0, endTs:null, label:"" };
  return s;
}

function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function unitLabel(){ return state.settings.isKg ? "kg" : "lb"; }
function toDisplayWeight(lb){ return state.settings.isKg ? lb / 2.2046226218 : lb; }
function toPounds(display){
  const v = Number(display);
  if (!Number.isFinite(v)) return 0;
  return state.settings.isKg ? v * 2.2046226218 : v;
}
function fmtWeight(lb){
  const v = toDisplayWeight(lb);
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} ${unitLabel()}`;
}
function fmtDateTime(ts){ return new Date(ts).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }); }
function fmtDate(ts){ return new Date(ts).toLocaleDateString([], { month:"short", day:"numeric", year:"numeric" }); }
function fmtDuration(ms){
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtCountdown(seconds){
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2,"0")}`;
}
function volumeOfSet(set){ return Math.max(0, Number(set.reps) || 0) * Math.max(0, Number(set.weightLb) || 0); }
function e1rm(set){
  const reps = Number(set.reps) || 0;
  const weight = Number(set.weightLb) || 0;
  if (!reps || !weight) return 0;
  return weight * (1 + reps / 30);
}
function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
function el(tag, cls, text){
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
function button(text, cls, onClick){
  const b = el("button", cls || "btn", text);
  b.addEventListener("click", onClick);
  return b;
}
function exerciseThumb(exerciseId){
  const exercise = exerciseById(exerciseId);
  const muscle = exercise?.muscleGroup || "Other";
  const words = (exercise?.name || "Exercise").split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const thumb = el("div", `exercise-thumb ${muscle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  thumb.setAttribute("aria-hidden", "true");
  thumb.textContent = initials || "EX";
  return thumb;
}
function exerciseTitleBlock(exerciseId, metaText){
  const wrap = el("div","exercise-title-block");
  wrap.appendChild(exerciseThumb(exerciseId));
  const copy = el("div");
  copy.appendChild(el("div","exercise-name", exerciseName(exerciseId)));
  if (metaText) copy.appendChild(el("div","exercise-meta", metaText));
  wrap.appendChild(copy);
  return { wrap, copy };
}
function toast(msg){
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(els.toast._timer);
  els.toast._timer = setTimeout(() => els.toast.classList.add("hidden"), 1800);
}

function exerciseById(id){ return state.exercises.find(e => e.id === id) || null; }
function exerciseName(id){ return exerciseById(id)?.name || "Exercise"; }
function workoutById(id){ return state.workouts.find(w => w.id === id) || null; }
function getActiveSession(){
  if (!state.activeSessionId) return null;
  return state.sessions.find(s => s.id === state.activeSessionId) || null;
}
function completedSessions(){ return state.sessions.filter(s => s.endedAt).sort((a,b)=>b.endedAt-a.endedAt); }
function completedSetsForExercise(exerciseId){
  return completedSessions().flatMap(sess => sess.exercises
    .filter(se => se.exerciseId === exerciseId)
    .flatMap(se => (se.sets || []).filter(s => s.done !== false).map(set => ({ set, session:sess }))));
}
function bestSetForExercise(exerciseId){
  const sets = completedSetsForExercise(exerciseId).map(x => x.set).filter(s => Number(s.weightLb) > 0 && Number(s.reps) > 0);
  return sets.sort((a,b)=>e1rm(b)-e1rm(a))[0] || null;
}
function lastSetForExercise(exerciseId){
  const sets = completedSetsForExercise(exerciseId)
    .sort((a,b)=>b.set.createdAt-a.set.createdAt);
  return sets[0]?.set || null;
}
function appStats(){
  const sessions = completedSessions();
  const sets = sessions.flatMap(s => s.exercises.flatMap(se => se.sets || [])).filter(set => set.done !== false);
  const volume = sets.reduce((sum,set)=>sum + volumeOfSet(set), 0);
  const prs = new Set();
  state.exercises.forEach(exercise => {
    if (bestSetForExercise(exercise.id)) prs.add(exercise.id);
  });
  const last = sessions[0];
  return { sessions, sets, volume, prs: prs.size, last };
}

function openDrawer(){
  els.drawer.classList.remove("hidden");
  els.drawer.setAttribute("aria-hidden","false");
}
function closeDrawer(){
  els.drawer.classList.add("hidden");
  els.drawer.setAttribute("aria-hidden","true");
}
function setRoute(next){
  route = next;
  els.navItems.forEach(b => b.classList.toggle("is-active", b.dataset.route === route));
  document.querySelectorAll(".route").forEach(section => section.classList.add("hidden"));
  $(`route-${route}`).classList.remove("hidden");
  els.routeLabel.textContent = route === "workouts" ? "Routines" : route === "history" ? "History" : "Settings";
  if (route !== "workouts") ui.workouts = { screen:"list", workoutId:null };
  if (route !== "history") ui.history = { screen:"list", sessionId:null };
  renderAll();
}

let timerInterval = null;
let workoutClockInterval = null;
function startTimer(seconds, label){
  stopTimer(false);
  state.timer.running = true;
  state.timer.total = Math.max(0, Number(seconds) || 0);
  state.timer.endTs = Date.now() + state.timer.total * 1000;
  state.timer.label = label || "";
  saveState();
  els.timerBar.classList.remove("hidden");
  els.timerSub.textContent = state.timer.label || "Ready for the next set";
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}
function tickTimer(){
  if (!state.timer.running || !state.timer.endTs) return;
  const remaining = Math.max(0, Math.ceil((state.timer.endTs - Date.now()) / 1000));
  state.timer.remaining = remaining;
  els.timerCountdown.textContent = fmtCountdown(remaining);
  const pct = state.timer.total > 0 ? (1 - remaining / state.timer.total) * 100 : 0;
  els.timerProgress.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (remaining <= 0) {
    stopTimer(true);
    notifyRestComplete();
    toast("Rest complete");
  }
}
function notifyRestComplete(){
  try {
    if (navigator.vibrate) {
      navigator.vibrate([450,140,450,140,700]);
    }
  } catch {}
  document.body.classList.remove("rest-complete-alert");
  void document.body.offsetWidth;
  document.body.classList.add("rest-complete-alert");
  clearTimeout(notifyRestComplete._timer);
  notifyRestComplete._timer = setTimeout(() => {
    document.body.classList.remove("rest-complete-alert");
  }, 1800);
  showTimerNotification();
}
async function enableTimerNotifications(){
  if (!("Notification" in window)) {
    toast("Notifications are not supported here.");
    renderNotificationStatus();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    toast(permission === "granted" ? "Timer notifications enabled" : "Notifications not enabled");
  } catch {
    toast("Could not enable notifications");
  }
  renderNotificationStatus();
}
async function showTimerNotification(){
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = {
    body: "Rest is over. Time for your next set.",
    tag: "lift-log-rest-timer",
    renotify: true,
    silent: false,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png"
  };
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification("Rest timer done", options);
      return;
    }
  } catch {}
  try {
    new Notification("Rest timer done", options);
  } catch {}
}
function renderNotificationStatus(){
  if (!els.notificationStatus || !els.enableNotificationsBtn) return;
  if (!("Notification" in window)) {
    els.notificationStatus.textContent = "Notifications are not supported in this browser.";
    els.enableNotificationsBtn.disabled = true;
    els.enableNotificationsBtn.textContent = "Unavailable";
    return;
  }
  if (Notification.permission === "granted") {
    els.notificationStatus.textContent = "Enabled. iPhone requires the app to be added to the Home Screen.";
    els.enableNotificationsBtn.textContent = "Enabled";
    return;
  }
  if (Notification.permission === "denied") {
    els.notificationStatus.textContent = "Blocked. Turn it back on in iPhone notification settings.";
    els.enableNotificationsBtn.textContent = "Blocked";
    return;
  }
  els.notificationStatus.textContent = "Ask your phone to show a notification when rest ends.";
  els.enableNotificationsBtn.textContent = "Enable";
}
function addTimer(seconds){
  if (!state.timer.running || !state.timer.endTs) return;
  state.timer.endTs += seconds * 1000;
  state.timer.total = Math.max(1, state.timer.total + seconds);
  saveState();
  tickTimer();
}
function stopTimer(hide){
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  state.timer.running = false;
  state.timer.total = 0;
  state.timer.remaining = 0;
  state.timer.endTs = null;
  state.timer.label = "";
  saveState();
  els.timerCountdown.textContent = "0:00";
  els.timerProgress.style.width = "0%";
  els.timerSub.textContent = "Ready for the next set";
  if (hide) els.timerBar.classList.add("hidden");
}
function startWorkoutClock(){
  if (workoutClockInterval) clearInterval(workoutClockInterval);
  workoutClockInterval = setInterval(updateWorkoutClock, 1000);
  updateWorkoutClock();
}
function updateWorkoutClock(){
  const sess = getActiveSession();
  if (!sess) return;
  const elapsed = fmtDuration(Date.now() - sess.startedAt);
  els.headerPill.textContent = elapsed;
  document.querySelectorAll("[data-workout-elapsed]").forEach(node => {
    node.textContent = elapsed;
  });
}

function startWorkout(workoutId){
  if (getActiveSession()) return toast("Finish your current workout first.");
  const workout = workoutById(workoutId);
  if (!workout) return toast("Routine not found.");
  if (!workout.exercises.length) return toast("Add exercises before starting.");
  const session = {
    id: uid(),
    workoutId: workout.id,
    workoutName: workout.name,
    notes: workout.notes || "",
    startedAt: Date.now(),
    endedAt: null,
    exercises: workout.exercises.map((te, index) => ({
      id: uid(),
      orderIndex: index,
      exerciseId: te.exerciseId,
      targetSets: Number(te.targetSets) || 3,
      targetReps: Number(te.targetReps) || 10,
      restSeconds: Number(te.restSeconds) || 90,
      notes: te.notes || "",
      sets: buildPlannedSets(te)
    }))
  };
  state.sessions.push(session);
  state.activeSessionId = session.id;
  saveState();
  setRoute("workouts");
  toast("Workout started");
}
function buildPlannedSets(te){
  const last = lastSetForExercise(te.exerciseId);
  const count = Math.max(1, Number(te.targetSets) || 3);
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    setNumber: i + 1,
    type: "normal",
    reps: Number(te.targetReps) || 10,
    weightLb: last ? last.weightLb : 0,
    done: false,
    createdAt: Date.now()
  }));
}
function finishWorkout(){
  const sess = getActiveSession();
  if (!sess) return;
  const doneSets = sess.exercises.flatMap(se => se.sets).filter(s => s.done);
  if (!doneSets.length && !confirm("Finish without any completed sets?")) return;
  sess.endedAt = Date.now();
  state.activeSessionId = null;
  saveState();
  stopTimer(true);
  ui.history = { screen:"detail", sessionId:sess.id };
  setRoute("history");
  toast("Workout saved");
}
function discardWorkout(){
  const sess = getActiveSession();
  if (!sess || !confirm("Discard this active workout?")) return;
  state.sessions = state.sessions.filter(s => s.id !== sess.id);
  state.activeSessionId = null;
  saveState();
  stopTimer(true);
  renderAll();
}
function addSet(sessionExerciseId){
  const sess = getActiveSession();
  const se = sess?.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;
  const previous = se.sets[se.sets.length - 1] || lastSetForExercise(se.exerciseId);
  se.sets.push({
    id: uid(),
    setNumber: se.sets.length + 1,
    type: "normal",
    reps: previous?.reps || se.targetReps || 10,
    weightLb: previous?.weightLb || 0,
    done: false,
    createdAt: Date.now()
  });
  saveState();
  renderActiveWorkout();
}
function removeSet(sessionExerciseId, setId){
  const sess = getActiveSession();
  const se = sess?.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;
  se.sets = se.sets.filter(s => s.id !== setId).map((s,i) => ({ ...s, setNumber:i + 1 }));
  saveState();
  renderActiveWorkout();
}
function updateSet(sessionExerciseId, setId, field, value){
  const sess = getActiveSession();
  const se = sess?.exercises.find(x => x.id === sessionExerciseId);
  const set = se?.sets.find(s => s.id === setId);
  if (!set || !se) return;
  if (field === "weightDisplay") set.weightLb = toPounds(value);
  if (field === "reps") set.reps = Math.max(0, Math.floor(Number(value) || 0));
  if (field === "type") set.type = value || "normal";
  saveState();
}
function toggleSet(sessionExerciseId, setId, checked){
  const sess = getActiveSession();
  const se = sess?.exercises.find(x => x.id === sessionExerciseId);
  const set = se?.sets.find(s => s.id === setId);
  if (!set || !se) return;
  if (checked && !set.weightLb && state.settings.blankWeightUsesBaseline) {
    const last = lastSetForExercise(se.exerciseId);
    if (last) set.weightLb = last.weightLb;
  }
  set.done = checked;
  set.createdAt = Date.now();
  saveState();
  renderActiveWorkout();
  if (checked && state.settings.autoRest) {
    startTimer(se.restSeconds || 90, `${exerciseName(se.exerciseId)} rest`);
  }
}
function updateSessionNotes(value){
  const sess = getActiveSession();
  if (!sess) return;
  sess.notes = value;
  saveState();
}
function updateSessionExerciseNotes(sessionExerciseId, value){
  const sess = getActiveSession();
  const se = sess?.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;
  se.notes = value;
  saveState();
}
function updateSessionExerciseRest(sessionExerciseId, value){
  const sess = getActiveSession();
  const se = sess?.exercises.find(x => x.id === sessionExerciseId);
  if (!se) return;
  se.restSeconds = Math.max(10, Number(value) || se.restSeconds || 90);
  saveState();
  renderActiveWorkout();
}

function createWorkout(name){
  const n = String(name || "").trim();
  if (!n) return toast("Name required");
  const workout = { id: uid(), name:n, notes:"", exercises:[] };
  state.workouts.push(workout);
  saveState();
  ui.workouts = { screen:"detail", workoutId:workout.id };
  closeModal();
  renderWorkoutsHome();
}
function deleteWorkout(workoutId){
  const w = workoutById(workoutId);
  if (!w || !confirm(`Delete "${w.name}"?`)) return;
  state.workouts = state.workouts.filter(x => x.id !== workoutId);
  saveState();
  ui.workouts = { screen:"list", workoutId:null };
  renderWorkoutsHome();
}
function updateWorkoutName(workoutId, name){
  const w = workoutById(workoutId);
  if (!w) return;
  w.name = String(name || "").trim() || w.name;
  saveState();
}
function updateWorkoutNotes(workoutId, notes){
  const w = workoutById(workoutId);
  if (!w) return;
  w.notes = notes;
  saveState();
}
function addExercisesToWorkout(workoutId, ids){
  const w = workoutById(workoutId);
  if (!w) return;
  ids.forEach(exerciseId => {
    if (!w.exercises.some(te => te.exerciseId === exerciseId)) {
      w.exercises.push({ id: uid(), exerciseId, targetSets:3, targetReps:10, restSeconds:90, notes:"" });
    }
  });
  saveState();
  closeModal();
  renderWorkoutsHome();
}
function updateTemplateExercise(workoutId, templateId, field, value){
  const w = workoutById(workoutId);
  const te = w?.exercises.find(x => x.id === templateId);
  if (!te) return;
  if (field === "notes") te.notes = value;
  else te[field] = Math.max(field === "restSeconds" ? 10 : 1, Number(value) || te[field]);
  saveState();
}
function removeTemplateExercise(workoutId, templateId){
  const w = workoutById(workoutId);
  if (!w) return;
  w.exercises = w.exercises.filter(x => x.id !== templateId);
  saveState();
  renderWorkoutsHome();
}
function addCustomExercise(data){
  const name = String(data.name || "").trim();
  if (!name) return toast("Name required");
  const existing = state.exercises.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (existing) return toast("Exercise already exists");
  state.exercises.push({
    id: uid(),
    name,
    muscleGroup: String(data.muscleGroup || "Other").trim() || "Other",
    equipment: String(data.equipment || "Other").trim() || "Other",
    notes: String(data.notes || "").trim(),
    isCustom: true
  });
  saveState();
  toast("Exercise added");
}
function deleteCustomExercise(exerciseId){
  const exercise = exerciseById(exerciseId);
  if (!exercise?.isCustom || !confirm(`Delete "${exercise.name}"?`)) return;
  state.exercises = state.exercises.filter(e => e.id !== exerciseId);
  state.workouts.forEach(w => w.exercises = w.exercises.filter(te => te.exerciseId !== exerciseId));
  saveState();
  renderSettingsRoute();
}

let scrollY = 0;
function openModal(html){
  scrollY = window.scrollY || 0;
  document.body.classList.add("modal-open");
  document.body.style.top = `-${scrollY}px`;
  els.modalContent.innerHTML = html;
  els.modal.classList.remove("hidden");
  els.modal.setAttribute("aria-hidden","false");
}
function closeModal(){
  els.modal.classList.add("hidden");
  els.modal.setAttribute("aria-hidden","true");
  els.modalContent.innerHTML = "";
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, scrollY);
}
function openNewWorkoutModal(){
  openModal(`
    <div class="sheethead">
      <div><div class="sheettitle">New Routine</div><div class="sheetsub">Build a reusable workout plan.</div></div>
      <button class="iconbtn" id="mClose">Close</button>
    </div>
    <input id="mName" class="input" placeholder="Routine name" autofocus />
    <div class="row-between" style="margin-top:12px">
      <button class="btn secondary" id="mCancel">Cancel</button>
      <button class="btn" id="mSave">Create</button>
    </div>
  `);
  $("mClose").onclick = closeModal;
  $("mCancel").onclick = closeModal;
  $("mSave").onclick = () => createWorkout($("mName").value);
}
function openCustomExerciseModal(onDone, prefillName = ""){
  openModal(`
    <div class="sheethead">
      <div><div class="sheettitle">New Exercise</div><div class="sheetsub">Add it to your exercise library.</div></div>
      <button class="iconbtn" id="mClose">Close</button>
    </div>
    <div class="grid2">
      <input id="mName" class="input" placeholder="Name" value="${escapeHtml(prefillName)}" />
      <input id="mMuscle" class="input" placeholder="Muscle group" />
      <input id="mEquip" class="input" placeholder="Equipment" />
      <input id="mNotes" class="input" placeholder="Notes" />
    </div>
    <div class="row-between" style="margin-top:12px">
      <button class="btn secondary" id="mCancel">Cancel</button>
      <button class="btn" id="mSave">Save</button>
    </div>
  `);
  $("mClose").onclick = closeModal;
  $("mCancel").onclick = closeModal;
  $("mSave").onclick = () => {
    addCustomExercise({
      name: $("mName").value,
      muscleGroup: $("mMuscle").value,
      equipment: $("mEquip").value,
      notes: $("mNotes").value
    });
    closeModal();
    onDone?.();
  };
}
function openExercisePicker(workoutId){
  const selected = new Set();
  openModal(`
    <div class="sheethead">
      <div><div class="sheettitle">Add Exercises</div><div class="sheetsub">Select one or more exercises.</div></div>
      <button class="iconbtn" id="mClose">Close</button>
    </div>
    <div class="search-row">
      <input id="mSearch" class="input" placeholder="Search exercises" />
      <button class="btn secondary" id="mNew">New</button>
    </div>
    <div id="mList" class="list"></div>
    <div class="row-between" style="margin-top:12px">
      <div class="muted" id="mCount">0 selected</div>
      <button class="btn" id="mAdd">Add selected</button>
    </div>
  `);
  const render = () => {
    const q = $("mSearch").value.trim().toLowerCase();
    const list = $("mList");
    list.innerHTML = "";
    const existing = new Set((workoutById(workoutId)?.exercises || []).map(te => te.exerciseId));
    const filtered = state.exercises
      .filter(exercise => !existing.has(exercise.id))
      .filter(exercise => !q || [exercise.name, exercise.muscleGroup, exercise.equipment].join(" ").toLowerCase().includes(q))
      .sort((a,b)=>a.name.localeCompare(b.name));
    if (!filtered.length) {
      const empty = el("div","empty", q.length >= 2 ? `No matches. Create "${$("mSearch").value.trim()}" as a custom exercise.` : "No exercises available.");
      list.appendChild(empty);
    }
    filtered.forEach(exercise => {
      const row = el("label","setting-row");
      row.innerHTML = `
        <span><strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(exercise.muscleGroup)} - ${escapeHtml(exercise.equipment)}</small></span>
        <input type="checkbox" ${selected.has(exercise.id) ? "checked" : ""} />
      `;
      row.querySelector("input").onchange = (e) => {
        if (e.target.checked) selected.add(exercise.id);
        else selected.delete(exercise.id);
        $("mCount").textContent = `${selected.size} selected`;
      };
      list.appendChild(row);
    });
    $("mCount").textContent = `${selected.size} selected`;
  };
  $("mClose").onclick = closeModal;
  $("mSearch").oninput = render;
  $("mNew").onclick = () => openCustomExerciseModal(() => openExercisePicker(workoutId), $("mSearch").value.trim());
  $("mAdd").onclick = () => selected.size ? addExercisesToWorkout(workoutId, Array.from(selected)) : toast("Select at least one");
  render();
}

function renderAll(){
  renderHeader();
  renderActiveWorkout();
  renderWorkoutsHome();
  renderHistoryRoute();
  renderSettingsRoute();
}
function renderHeader(){
  const sess = getActiveSession();
  els.routeLabel.textContent = sess && route === "workouts" ? "" :
    route === "workouts" ? "Routines" :
    route === "history" ? "History" :
    "Settings";
  els.headerPill.classList.toggle("hidden", !sess);
  if (sess) els.headerPill.textContent = fmtDuration(Date.now() - sess.startedAt);
}
function renderDashboard(){
  const stats = appStats();
  const wrap = el("div","section-block");
  const head = el("div","section-head");
  const left = el("div");
  left.appendChild(el("h1","", "Ready to train?"));
  left.appendChild(el("p","", stats.last ? `Last workout: ${stats.last.workoutName} on ${fmtDate(stats.last.endedAt)}` : "Start with a routine or build your own."));
  head.appendChild(left);
  head.appendChild(button("New Routine", "btn", openNewWorkoutModal));
  wrap.appendChild(head);
  const grid = el("div","dashboard-grid");
  [
    ["Workouts", stats.sessions.length],
    ["Total sets", stats.sets.length],
    [`Volume (${unitLabel()})`, Math.round(toDisplayWeight(stats.volume)).toLocaleString()],
    ["Tracked PRs", stats.prs]
  ].forEach(([label, value]) => {
    const stat = el("div","stat");
    stat.appendChild(el("strong","", value));
    stat.appendChild(el("span","", label));
    grid.appendChild(stat);
  });
  wrap.appendChild(grid);
  return wrap;
}
function renderActiveWorkout(){
  const sess = getActiveSession();
  if (route !== "workouts" || !sess) {
    els.activeWorkout.classList.add("hidden");
    els.activeWorkout.innerHTML = "";
    return;
  }
  els.activeWorkout.classList.remove("hidden");
  els.activeWorkout.innerHTML = "";

  const doneSets = sess.exercises.flatMap(se => se.sets).filter(s => s.done);
  const totalSets = sess.exercises.flatMap(se => se.sets).length;
  const volume = doneSets.reduce((sum,set)=>sum + volumeOfSet(set), 0);

  const head = el("div","active-head");
  const top = el("div","row-between");
  const left = el("div");
  left.appendChild(el("h1","", sess.workoutName));
  left.appendChild(el("p","muted", `Started ${fmtDateTime(sess.startedAt)}`));
  top.appendChild(left);
  const actions = el("div","routine-actions");
  actions.appendChild(button("Discard", "btn secondary", discardWorkout));
  actions.appendChild(button("Finish", "btn", finishWorkout));
  top.appendChild(actions);
  head.appendChild(top);
  const meta = el("div","active-meta");
  meta.appendChild(el("span","badge blue", `${doneSets.length}/${totalSets} sets`));
  meta.appendChild(el("span","badge", `${fmtWeight(volume)} volume`));
  const elapsedBadge = el("span","badge", fmtDuration(Date.now() - sess.startedAt));
  elapsedBadge.dataset.workoutElapsed = "true";
  meta.appendChild(elapsedBadge);
  head.appendChild(meta);
  const notes = el("textarea","textarea workout-notes");
  notes.placeholder = "Workout notes";
  notes.value = sess.notes || "";
  notes.addEventListener("change", e => updateSessionNotes(e.target.value));
  head.appendChild(notes);
  els.activeWorkout.appendChild(head);

  sess.exercises.slice().sort((a,b)=>a.orderIndex-b.orderIndex).forEach(se => {
    const card = el("div","exercise-card");
    const isExerciseComplete = se.sets.length > 0 && se.sets.every(set => set.done);
    card.classList.toggle("is-complete", isExerciseComplete);
    const topRow = el("div","exercise-head");
    const best = bestSetForExercise(se.exerciseId);
    const last = lastSetForExercise(se.exerciseId);
    const title = exerciseTitleBlock(se.exerciseId, [
      `Target ${se.targetSets} x ${se.targetReps}`,
      `Rest ${se.restSeconds}s`,
      best ? `Best est. 1RM ${fmtWeight(e1rm(best))}` : null,
      last ? `Last ${last.reps} x ${fmtWeight(last.weightLb)}` : null
    ].filter(Boolean).join(" - "));
    title.copy.appendChild(el("div","previous-weight", last ? `Previous weight: ${fmtWeight(last.weightLb)}` : "Previous weight: none yet"));
    topRow.appendChild(title.wrap);
    const activeControls = el("div","active-exercise-controls");
    const restField = el("label","field compact");
    restField.innerHTML = `<span>Rest timer</span>`;
    const restInput = el("input","input");
    restInput.type = "number";
    restInput.inputMode = "numeric";
    restInput.pattern = "[0-9]*";
    restInput.min = "10";
    restInput.step = "5";
    restInput.value = se.restSeconds || 90;
    restInput.addEventListener("change", e => updateSessionExerciseRest(se.id, e.target.value));
    restField.appendChild(restInput);
    restField.appendChild(el("small","field-help", "seconds"));
    activeControls.appendChild(restField);
    activeControls.appendChild(button("Add Set", "btn secondary", () => addSet(se.id)));
    topRow.appendChild(activeControls);
    card.appendChild(topRow);

    const table = el("table","set-table");
    table.innerHTML = `<thead><tr><th>Set</th><th>Type</th><th>Weight</th><th>Reps</th><th>Done</th><th></th></tr></thead>`;
    const tbody = el("tbody");
    se.sets.forEach(set => {
      const row = el("tr");
      row.classList.toggle("is-complete", !!set.done);
      row.innerHTML = `
        <td>${set.setNumber}</td>
        <td>
          <select data-field="type">
            <option value="normal">Normal</option>
            <option value="warmup">Warmup</option>
            <option value="drop">Drop</option>
            <option value="failure">Failure</option>
          </select>
        </td>
        <td><input data-field="weightDisplay" type="number" inputmode="decimal" step="0.5" value="${set.weightLb ? toDisplayWeight(set.weightLb).toFixed(1) : ""}" placeholder="${last ? fmtWeight(last.weightLb) : unitLabel()}" aria-label="Weight, previous ${last ? fmtWeight(last.weightLb) : unitLabel()}" /></td>
        <td><input data-field="reps" type="number" inputmode="numeric" min="0" value="${set.reps || ""}" /></td>
        <td class="set-done"><input data-field="done" type="checkbox" ${set.done ? "checked" : ""} /></td>
        <td><button class="mini-btn" data-action="remove">Del</button></td>
      `;
      row.querySelector("select").value = set.type || "normal";
      row.querySelectorAll("[data-field]").forEach(input => {
        if (input.dataset.field === "done") {
          input.addEventListener("change", e => toggleSet(se.id, set.id, e.target.checked));
        } else {
          input.addEventListener("change", e => updateSet(se.id, set.id, input.dataset.field, e.target.value));
        }
      });
      row.querySelector("[data-action='remove']").addEventListener("click", () => removeSet(se.id, set.id));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    const notes = el("textarea","textarea");
    notes.placeholder = "Exercise notes";
    notes.value = se.notes || "";
    notes.addEventListener("change", e => updateSessionExerciseNotes(se.id, e.target.value));
    card.appendChild(notes);
    els.activeWorkout.appendChild(card);
  });
}
function renderWorkoutsHome(){
  if (route !== "workouts") return;
  els.workoutsRoot.innerHTML = "";
  if (getActiveSession()) {
    const hint = el("div","section-block");
    hint.appendChild(el("h2","", "Keep logging"));
    hint.appendChild(el("p","muted", "Your routines are tucked away until the active workout is finished."));
    els.workoutsRoot.appendChild(hint);
    return;
  }
  if (ui.workouts.screen === "detail") return renderWorkoutDetail();
  els.workoutsRoot.appendChild(renderDashboard());
  const block = el("div","section-block");
  const head = el("div","section-head");
  const left = el("div");
  left.appendChild(el("h2","", "Routines"));
  left.appendChild(el("p","", "Start fast, or open a routine to edit its plan."));
  head.appendChild(left);
  block.appendChild(head);
  const list = el("div","routine-list");
  if (!state.workouts.length) list.appendChild(el("div","empty", "No routines yet. Create one to get started."));
  state.workouts.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(workout => {
    const card = el("div","routine-card");
    const top = el("div","routine-top");
    const leftSide = el("div");
    leftSide.appendChild(el("h3","", workout.name));
    leftSide.appendChild(el("p","muted", `${workout.exercises.length} exercises${workout.notes ? " - has notes" : ""}`));
    const chips = el("div","chips");
    workout.exercises.slice(0,4).forEach(te => chips.appendChild(el("span","badge", exerciseName(te.exerciseId))));
    if (workout.exercises.length > 4) chips.appendChild(el("span","badge", `+${workout.exercises.length - 4}`));
    leftSide.appendChild(chips);
    top.appendChild(leftSide);
    const actions = el("div","routine-actions");
    actions.appendChild(button("Start", "btn", () => startWorkout(workout.id)));
    actions.appendChild(button("Edit", "btn secondary", () => { ui.workouts = { screen:"detail", workoutId:workout.id }; renderWorkoutsHome(); }));
    actions.appendChild(button("Delete", "btn secondary", () => deleteWorkout(workout.id)));
    top.appendChild(actions);
    card.appendChild(top);
    list.appendChild(card);
  });
  block.appendChild(list);
  els.workoutsRoot.appendChild(block);
}
function renderWorkoutDetail(){
  const workout = workoutById(ui.workouts.workoutId);
  if (!workout) {
    ui.workouts = { screen:"list", workoutId:null };
    return renderWorkoutsHome();
  }
  const block = el("div","section-block");
  const head = el("div","section-head");
  const left = el("div");
  const name = el("input","input");
  name.value = workout.name;
  name.addEventListener("change", e => updateWorkoutName(workout.id, e.target.value));
  left.appendChild(name);
  left.appendChild(el("p","", "Plan sets, reps, rest, and notes before you lift."));
  head.appendChild(left);
  const actions = el("div","routine-actions");
  actions.appendChild(button("Back", "btn secondary", () => { ui.workouts = { screen:"list", workoutId:null }; renderWorkoutsHome(); }));
  actions.appendChild(button("Add Exercises", "btn secondary", () => openExercisePicker(workout.id)));
  actions.appendChild(button("Start", "btn", () => startWorkout(workout.id)));
  head.appendChild(actions);
  block.appendChild(head);
  const notes = el("textarea","textarea");
  notes.placeholder = "Routine notes";
  notes.value = workout.notes || "";
  notes.addEventListener("change", e => updateWorkoutNotes(workout.id, e.target.value));
  block.appendChild(notes);
  els.workoutsRoot.appendChild(block);

  if (!workout.exercises.length) {
    els.workoutsRoot.appendChild(el("div","empty", "Add exercises to make this routine usable."));
    return;
  }
  workout.exercises.forEach(te => {
    const card = el("div","exercise-card");
    const header = el("div","exercise-head");
    const best = bestSetForExercise(te.exerciseId);
    header.appendChild(exerciseTitleBlock(te.exerciseId, best ? `Best est. 1RM ${fmtWeight(e1rm(best))}` : "No completed history yet").wrap);
    header.appendChild(button("Remove", "btn secondary", () => removeTemplateExercise(workout.id, te.id)));
    card.appendChild(header);
    const grid = el("div","grid2");
    [
      ["targetSets", "Sets", te.targetSets],
      ["targetReps", "Reps", te.targetReps],
      ["restSeconds", "Rest seconds", te.restSeconds]
    ].forEach(([field, label, value]) => {
      const fieldWrap = el("label","field");
      fieldWrap.appendChild(el("span","", label));
      const input = el("input","input");
      input.type = "number";
      input.inputMode = "numeric";
      input.pattern = "[0-9]*";
      input.min = field === "restSeconds" ? "10" : "1";
      input.placeholder = label;
      input.value = value;
      input.addEventListener("change", e => updateTemplateExercise(workout.id, te.id, field, e.target.value));
      fieldWrap.appendChild(input);
      fieldWrap.appendChild(el("small","field-help", field === "restSeconds" ? "Timer after each completed set" : field === "targetSets" ? "Planned working sets" : "Target reps per set"));
      grid.appendChild(fieldWrap);
    });
    card.appendChild(grid);
    const note = el("textarea","textarea");
    note.placeholder = "Exercise setup notes";
    note.value = te.notes || "";
    note.addEventListener("change", e => updateTemplateExercise(workout.id, te.id, "notes", e.target.value));
    card.appendChild(note);
    els.workoutsRoot.appendChild(card);
  });
}
function renderHistoryRoute(){
  if (route !== "history") return;
  els.historyRoot.innerHTML = "";
  const sessions = completedSessions();
  if (ui.history.screen === "detail") return renderHistoryDetail();
  const stats = appStats();
  const block = el("div","section-block");
  const head = el("div","section-head");
  const left = el("div");
  left.appendChild(el("h1","", "Progress"));
  left.appendChild(el("p","", "Completed workouts, PRs, and exercise history."));
  head.appendChild(left);
  block.appendChild(head);
  const grid = el("div","dashboard-grid");
  [
    ["Workouts", stats.sessions.length],
    ["Completed sets", stats.sets.length],
    [`Volume (${unitLabel()})`, Math.round(toDisplayWeight(stats.volume)).toLocaleString()],
    ["Exercise PRs", stats.prs]
  ].forEach(([label, value]) => {
    const stat = el("div","stat");
    stat.appendChild(el("strong","", value));
    stat.appendChild(el("span","", label));
    grid.appendChild(stat);
  });
  block.appendChild(grid);
  els.historyRoot.appendChild(block);

  const listBlock = el("div","section-block");
  const listHead = el("div","section-head");
  const lh = el("div");
  lh.appendChild(el("h2","", "Workout History"));
  lh.appendChild(el("p","", "Open a workout to review sets and notes."));
  listHead.appendChild(lh);
  listBlock.appendChild(listHead);
  const list = el("div","routine-list");
  if (!sessions.length) list.appendChild(el("div","empty", "No completed workouts yet."));
  sessions.forEach(sess => {
    const card = el("div","routine-card");
    const doneSets = sess.exercises.flatMap(se => se.sets).filter(s => s.done !== false);
    const volume = doneSets.reduce((sum,set)=>sum + volumeOfSet(set), 0);
    const top = el("div","routine-top");
    const left = el("div");
    left.appendChild(el("h3","", sess.workoutName || "Workout"));
    left.appendChild(el("p","muted", `${fmtDateTime(sess.startedAt)} - ${fmtDuration(sess.endedAt - sess.startedAt)}`));
    const chips = el("div","chips");
    chips.appendChild(el("span","badge blue", `${doneSets.length} sets`));
    chips.appendChild(el("span","badge", `${fmtWeight(volume)} volume`));
    left.appendChild(chips);
    top.appendChild(left);
    top.appendChild(button("Open", "btn secondary", () => { ui.history = { screen:"detail", sessionId:sess.id }; renderHistoryRoute(); }));
    card.appendChild(top);
    list.appendChild(card);
  });
  listBlock.appendChild(list);
  els.historyRoot.appendChild(listBlock);
}
function renderHistoryDetail(){
  const sess = state.sessions.find(s => s.id === ui.history.sessionId);
  if (!sess) {
    ui.history = { screen:"list", sessionId:null };
    return renderHistoryRoute();
  }
  const block = el("div","section-block");
  const head = el("div","section-head");
  const left = el("div");
  left.appendChild(el("h1","", sess.workoutName || "Workout"));
  left.appendChild(el("p","", `${fmtDateTime(sess.startedAt)} - ${fmtDuration(sess.endedAt - sess.startedAt)}`));
  head.appendChild(left);
  head.appendChild(button("Back", "btn secondary", () => { ui.history = { screen:"list", sessionId:null }; renderHistoryRoute(); }));
  block.appendChild(head);
  if (sess.notes) block.appendChild(el("p","muted", sess.notes));
  els.historyRoot.appendChild(block);
  sess.exercises.slice().sort((a,b)=>a.orderIndex-b.orderIndex).forEach(se => {
    const card = el("div","exercise-card");
    card.appendChild(exerciseTitleBlock(se.exerciseId).wrap);
    if (se.notes) card.appendChild(el("p","muted", se.notes));
    const sets = (se.sets || []).filter(s => s.done !== false);
    if (!sets.length) {
      card.appendChild(el("p","muted", "No completed sets."));
    } else {
      const table = el("table","set-table");
      table.innerHTML = "<thead><tr><th>Set</th><th>Type</th><th>Weight</th><th>Reps</th><th>Est. 1RM</th></tr></thead>";
      const tbody = el("tbody");
      const best = bestSetForExercise(se.exerciseId);
      sets.forEach(set => {
        const row = el("tr");
        const isBest = best && set.id === best.id;
        row.innerHTML = `
          <td>${set.setNumber}</td>
          <td><span class="set-type ${escapeHtml(set.type || "normal")}">${escapeHtml(set.type || "normal")}</span></td>
          <td>${fmtWeight(set.weightLb)}</td>
          <td>${set.reps}</td>
          <td>${fmtWeight(e1rm(set))} ${isBest ? '<span class="badge pr">PR</span>' : ""}</td>
        `;
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      card.appendChild(table);
    }
    els.historyRoot.appendChild(card);
  });
}
function renderSettingsRoute(){
  if (route !== "settings") return;
  renderNotificationStatus();
  els.unitsToggle.checked = !!state.settings.isKg;
  els.autoRestToggle.checked = !!state.settings.autoRest;
  els.blankWeightUsesBaselineToggle.checked = !!state.settings.blankWeightUsesBaseline;
  els.unitsToggle.onchange = () => { state.settings.isKg = els.unitsToggle.checked; saveState(); renderAll(); };
  els.autoRestToggle.onchange = () => { state.settings.autoRest = els.autoRestToggle.checked; saveState(); };
  els.blankWeightUsesBaselineToggle.onchange = () => { state.settings.blankWeightUsesBaseline = els.blankWeightUsesBaselineToggle.checked; saveState(); };
  els.customExercisesList.innerHTML = "";
  const customs = state.exercises.filter(e => e.isCustom).sort((a,b)=>a.name.localeCompare(b.name));
  if (!customs.length) {
    els.customExercisesList.appendChild(el("div","empty", "No custom exercises yet."));
  } else {
    customs.forEach(exercise => {
      const row = el("div","setting-row");
      const left = el("span");
      left.innerHTML = `<strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(exercise.muscleGroup)} - ${escapeHtml(exercise.equipment)}</small>`;
      row.appendChild(left);
      row.appendChild(button("Delete", "btn secondary", () => deleteCustomExercise(exercise.id)));
      els.customExercisesList.appendChild(row);
    });
  }
}
function resetAllData(){
  if (!confirm("Reset all data? This cannot be undone.")) return;
  state = DEFAULT_STATE();
  saveState();
  stopTimer(true);
  ui = { workouts:{ screen:"list", workoutId:null }, history:{ screen:"list", sessionId:null } };
  setRoute("workouts");
  toast("Reset complete");
}

renderAll();
setRoute("workouts");
startWorkoutClock();
if (state.timer.running && state.timer.endTs) {
  els.timerBar.classList.remove("hidden");
  els.timerSub.textContent = state.timer.label || "Ready for the next set";
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}
