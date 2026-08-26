/* Lift Log PWA
   A fast, offline-first workout tracker inspired by strong routine planning,
   inline gym logging, rest timers, history, and personal records.
*/

const LS_KEY = "gym_tracker_v6";
const LEGACY_KEYS = ["gym_tracker_v5","gym_tracker_v4","gym_tracker_v3","gym_tracker_v2","gym_tracker_v1"];
const APP_VERSION = "7.2.0";
const WEEKLY_PLAN_MIGRATION = "strength_rebuild_2026_08_24_v1";
const BASELINE_SESSION_KEY = "upper_a_2026_08_17";
const PUBLISHED_PLAN_PATH = "./data/current-plan.json";
const PUBLISHED_SYNC_CONFIG_PATH = "./data/sync-config.json";
const SYNC_LS_KEY = "lift_log_private_sync_v1";

let state = loadState();
let syncState = loadSyncState();
let syncBusy = false;
let syncRefreshPromise = null;
let screenWakeLock = null;
let wakeLockRequestPromise = null;
let wakeLockError = "";
saveState();
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
  distanceUnitSelect: $("distanceUnitSelect"),
  autoRestToggle: $("autoRestToggle"),
  timerSoundToggle: $("timerSoundToggle"),
  testTimerSoundBtn: $("testTimerSoundBtn"),
  blankWeightUsesBaselineToggle: $("blankWeightUsesBaselineToggle"),
  keepScreenAwakeToggle: $("keepScreenAwakeToggle"),
  wakeLockStatus: $("wakeLockStatus"),
  blockTextUndoToggle: $("blockTextUndoToggle"),
  enableNotificationsBtn: $("enableNotificationsBtn"),
  notificationStatus: $("notificationStatus"),
  syncStatus: $("syncStatus"),
  syncDetails: $("syncDetails"),
  supabaseUrlInput: $("supabaseUrlInput"),
  supabaseKeyInput: $("supabaseKeyInput"),
  syncEmailInput: $("syncEmailInput"),
  syncPasswordInput: $("syncPasswordInput"),
  saveSyncConfigBtn: $("saveSyncConfigBtn"),
  signUpSyncBtn: $("signUpSyncBtn"),
  signInSyncBtn: $("signInSyncBtn"),
  syncNowBtn: $("syncNowBtn"),
  signOutSyncBtn: $("signOutSyncBtn"),
  exportDataBtn: $("exportDataBtn"),
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
els.testTimerSoundBtn.addEventListener("click", testTimerSound);
els.saveSyncConfigBtn?.addEventListener("click", saveSyncConfigFromForm);
els.signUpSyncBtn?.addEventListener("click", () => void signUpForSync());
els.signInSyncBtn?.addEventListener("click", () => void signInForSync());
els.syncNowBtn?.addEventListener("click", () => void syncAllCompletedSessions({ silent:false }));
els.signOutSyncBtn?.addEventListener("click", () => void signOutOfSync());
els.exportDataBtn?.addEventListener("click", exportWorkoutData);
els.modalBackdrop.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("touchmove", (e) => e.preventDefault(), { passive:false });
document.addEventListener("pointerdown", unlockTimerAudio, { once:true, passive:true });
document.addEventListener("touchend", unlockTimerAudio, { once:true, passive:true });
document.addEventListener("keydown", unlockTimerAudio, { once:true });
document.addEventListener("pointerdown", () => void ensureScreenAwake(), { once:true, passive:true });
document.addEventListener("touchend", () => void ensureScreenAwake(), { once:true, passive:true });
document.addEventListener("beforeinput", blockAccidentalTextUndo, true);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void ensureScreenAwake();
  else updateWakeLockStatus();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.modal.classList.contains("hidden")) closeModal();
  else if (!els.drawer.classList.contains("hidden")) closeDrawer();
});
window.addEventListener("online", () => {
  void syncAllCompletedSessions({ silent:true });
  void refreshBestAvailablePlan();
});

function DEFAULT_STATE(){
  const exercises = seedExercises();
  return {
    settings: {
      isKg:false,
      distanceUnit:"mi",
      autoRest:true,
      timerSound:true,
      blankWeightUsesBaseline:true,
      keepScreenAwake:true,
      blockTextUndo:true
    },
    exercises,
    workouts: seedWorkouts(exercises),
    sessions: [],
    publishedPlan: null,
    appMigrations: [],
    activeSessionId: null,
    timer: { running:false, total:0, remaining:0, endTs:null, label:"" }
  };
}

function seedExercises(){
  const defs = [
    ["Bench Press","Chest","Barbell"],
    ["Incline Dumbbell Press","Chest","Dumbbells"],
    ["Chest Fly","Chest","Machine"],
    ["Overhead Press","Shoulders","Barbell"],
    ["Lateral Raise","Shoulders","Dumbbells"],
    ["Lat Pulldown","Back","Cable"],
    ["Pull Up","Back","Bodyweight"],
    ["Barbell Row","Back","Barbell"],
    ["Deadlift","Back","Barbell"],
    ["Squat","Legs","Barbell"],
    ["Leg Press","Legs","Machine"],
    ["Romanian Deadlift","Legs","Barbell"],
    ["Leg Curl","Legs","Machine"],
    ["Calf Raise","Legs","Machine"],
    ["Bicep Curl","Arms","Dumbbells"],
    ["Hammer Curl","Arms","Dumbbells"],
    ["Tricep Pushdown","Arms","Cable"],
    ["Plank","Core","Bodyweight"],
    ...trainingPlanExerciseDefs()
  ];
  const seen = new Set();
  return defs
    .filter(([name]) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(([name, muscleGroup, equipment, trackingType]) => ex(name, muscleGroup, equipment, trackingType));
}

function seedWorkouts(exercises){
  const idByName = exerciseIdMap(exercises);
  const make = (name, rows) => ({
    id: uid(),
    name,
    notes: "",
    exercises: rows.map(([exerciseName, sets, reps, rest]) => ({
      id: uid(),
      exerciseId: idByName[exerciseName.toLowerCase()],
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
    ]),
    ...trainingPlanRoutineDefs().map(def => workoutFromPlanDefinition(def, idByName))
  ];
}

function ex(name, muscleGroup, equipment, trackingType = "weight_reps"){
  return { id: uid(), name, muscleGroup, equipment, trackingType, notes:"", isCustom:false };
}

function trainingPlanExerciseDefs(){
  return [
    ["Smith Machine Bench Press","Chest","Smith Machine"],
    ["Chest-Supported Row","Back","Machine"],
    ["Neutral-Grip Pulldown","Back","Cable"],
    ["Cable Lateral Raise","Shoulders","Cable"],
    ["Rope Pressdown","Arms","Cable"],
    ["Seated Leg Curl","Legs","Machine"],
    ["Standing Calf Raise","Legs","Machine"],
    ["Elliptical (Optional)","Cardio","Elliptical","duration"],
    ["Seated Cable Row","Back","Cable"],
    ["Machine Shoulder Press","Shoulders","Machine"],
    ["Cable Curl","Arms","Cable"],
    ["Reverse Pec Deck","Shoulders","Machine"],
    ["Hack Squat","Legs","Machine"],
    ["Hip Thrust","Legs","Barbell or Machine"],
    ["Leg Extension","Legs","Machine"],
    ["Seated Calf Raise","Legs","Machine"],
    ["StairMaster (Optional)","Cardio","StairMaster","duration"],
    ["Treadmill Run","Cardio","Treadmill","duration"],
    ["Stationary Bike","Cardio","Bike","duration"],
    ["Rowing Machine","Cardio","Rower","duration"]
  ];
}

function trainingPlanRoutineDefs(){
  const progression = "Double progression: keep the same load until every work set reaches the top of the rep range at the target RIR. Then add about 5 lb to upper-body lifts or 5-10 lb to lower-body lifts. Stop any movement that causes sharp or worsening pain and use a pain-free substitute.";
  return [
    {
      planKey: "strength-upper-a",
      scheduleOrder: 1,
      planWeek: "2026-08-24",
      legacyNames: ["Day 1 - Upper A", "1 • Upper A (Monday)"],
      name: "1 - Upper A (Monday)",
      notes: `About 40-50 minutes including a 5-minute warm-up. ${progression}`,
      rows: [
        planRow("Smith Machine Bench Press", 3, 6, "6-8", 180, "2 RIR; final set may reach 1", "Use 135 lb x 10 as the final warm-up, then work at 155 lb. Try to add one total work rep. Substitute: machine chest press or dumbbell bench.", 155),
        planRow("Chest-Supported Row", 3, 6, "6-8", 120, "2 RIR", "Stay at 145 lb. Three productive work sets are enough; aim for about 7/6/6. Substitute: seated cable row.", 145),
        planRow("Neutral-Grip Pulldown", 2, 8, "8-12", 90, "2 RIR", "Stay at 105 lb and aim for at least 17-18 total reps. Substitute: assisted neutral-grip pull-up.", 105),
        planRow("Cable Lateral Raise", 2, 12, "12-15", 60, "2-3 RIR", "Use last week's weight. Superset with rope pressdowns. Substitute: dumbbell lateral raise."),
        planRow("Rope Pressdown", 2, 12, "12-15", 60, "2 RIR", "Stay at 30 lb and aim for 13 reps per set before increasing. Superset after lateral raises.", 30)
      ]
    },
    {
      planKey: "strength-lower-a",
      scheduleOrder: 2,
      planWeek: "2026-08-24",
      legacyNames: ["Day 2 - Lower A", "2 • Lower A (Tuesday)"],
      name: "2 - Lower A (Tuesday)",
      notes: `About 40-50 minutes including a 5-minute warm-up. Repeat prior lower-body loads because no results were reported. ${progression}`,
      rows: [
        planRow("Leg Press", 3, 6, "6-10", 180, "2-3 RIR", "Repeat your previous load. Substitute: Smith-machine squat."),
        planRow("Romanian Deadlift", 3, 6, "6-10", 180, "2-3 RIR", "Repeat your previous load. Substitute: cable pull-through or 45-degree back extension."),
        planRow("Seated Leg Curl", 2, 10, "10-15", 75, "2 RIR", "Superset with standing calf raises if the machines are close."),
        planRow("Standing Calf Raise", 2, 10, "10-15", 75, "2 RIR", "Rest after completing the superset pair."),
        planRow("Elliptical (Optional)", 1, 10, "8-12 min", 0, "Easy conversational pace", "Optional after lifting. Skip it if your legs are unusually fatigued.")
      ]
    },
    {
      planKey: "strength-upper-b",
      scheduleOrder: 3,
      planWeek: "2026-08-24",
      legacyNames: ["Day 3 - Upper B", "3 • Upper B (Thursday)"],
      name: "3 - Upper B (Thursday)",
      notes: `About 40-50 minutes including a 5-minute warm-up. ${progression}`,
      rows: [
        planRow("Incline Dumbbell Press", 3, 6, "6-10", 180, "2 RIR", "Repeat your prior load unless every set was comfortably inside the range. Substitute: incline machine press."),
        planRow("Seated Cable Row", 3, 8, "8-12", 120, "2 RIR", "Substitute: chest-supported machine row."),
        planRow("Machine Shoulder Press", 2, 8, "8-12", 120, "2-3 RIR", "Substitute: seated dumbbell overhead press."),
        planRow("Reverse Pec Deck", 2, 12, "12-15", 75, "2 RIR", "Superset with cable curls."),
        planRow("Cable Curl", 2, 10, "10-15", 75, "2 RIR", "Rest after completing the superset pair.")
      ]
    },
    {
      planKey: "strength-lower-b",
      scheduleOrder: 4,
      planWeek: "2026-08-24",
      legacyNames: ["Day 4 - Lower B", "4 • Lower B + StairMaster (Friday)"],
      name: "4 - Lower B + StairMaster (Friday)",
      notes: `About 40-50 minutes including a 5-minute warm-up and optional cardio. ${progression}`,
      rows: [
        planRow("Hack Squat", 3, 6, "6-10", 180, "2-3 RIR", "Repeat your previous load. Substitute: Smith-machine squat or leg press."),
        planRow("Hip Thrust", 3, 8, "8-12", 120, "2 RIR", "Substitute: glute-drive machine."),
        planRow("Leg Extension", 2, 10, "10-15", 75, "2 RIR", "Use smooth, controlled reps."),
        planRow("Seated Calf Raise", 2, 10, "10-15", 75, "2 RIR", "Keep the full range of motion."),
        planRow("StairMaster (Optional)", 1, 10, "8-12 min", 0, "RPE 5-6", "Use a steady, moderate pace after lifting. It should feel like cardio, not another hard leg workout. Elliptical is an equal substitute.")
      ]
    }
  ];
}

function planRow(exerciseName, sets, reps, targetRepRange, restSeconds, targetEffort, notes, plannedLoadLb = null){
  return { exerciseName, sets, reps, targetRepRange, restSeconds, targetEffort, notes, plannedLoadLb };
}

function exerciseIdMap(exercises){
  return Object.fromEntries(exercises.map(e => [e.name.toLowerCase(), e.id]));
}

function workoutFromPlanDefinition(def, idByName){
  return {
    id: uid(),
    planKey: def.planKey,
    scheduleOrder: def.scheduleOrder,
    planWeek: def.planWeek,
    name: def.name,
    notes: def.notes,
    exercises: def.rows.map(row => ({
      id: uid(),
      exerciseId: idByName[row.exerciseName.toLowerCase()],
      targetSets: row.sets,
      targetReps: row.reps,
      targetRepRange: row.targetRepRange,
      targetEffort: row.targetEffort,
      plannedLoadLb: Number.isFinite(row.plannedLoadLb) ? row.plannedLoadLb : null,
      restSeconds: row.restSeconds,
      notes: row.notes
    })).filter(x => x.exerciseId)
  };
}

function ensureTrainingPlanRoutines(s){
  const exerciseDefs = trainingPlanExerciseDefs();
  for (const [name, muscleGroup, equipment, trackingType] of exerciseDefs) {
    const existing = s.exercises.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (!existing) {
      s.exercises.push(ex(name, muscleGroup, equipment, trackingType));
    } else {
      existing.trackingType ||= trackingType || "weight_reps";
    }
  }

  const idByName = exerciseIdMap(s.exercises);
  const planDefs = trainingPlanRoutineDefs();
  const needsUpgrade = !s.appMigrations.includes(WEEKLY_PLAN_MIGRATION);

  for (const def of planDefs) {
    const names = [def.name, ...(def.legacyNames || [])].map(name => name.toLowerCase());
    const existing = s.workouts.find(w => w.planKey === def.planKey || names.includes(w.name.toLowerCase()));
    const fresh = workoutFromPlanDefinition(def, idByName);

    if (!existing) {
      s.workouts.push(fresh);
    } else if (needsUpgrade) {
      Object.assign(existing, fresh, { id:existing.id });
    } else {
      existing.planKey ||= def.planKey;
      existing.scheduleOrder ??= def.scheduleOrder;
      existing.planWeek ||= def.planWeek;
    }
  }

  if (needsUpgrade) {
    seedBaselineSession(s, idByName, planDefs[0]);
    s.appMigrations.push(WEEKLY_PLAN_MIGRATION);
  }
}

function startingTargetReps(range, fallback = 10){
  const match = String(range || "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function validatePublishedPlan(plan){
  const requiredKeys = ["strength-upper-a","strength-lower-a","strength-upper-b","strength-lower-b"];
  if (!plan || plan.schemaVersion !== 1 || typeof plan.planId !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.planWeek || "")) return false;
  if (!Array.isArray(plan.days) || plan.days.length !== 4) return false;
  const keys = plan.days.map(day => day.planKey);
  if (requiredKeys.some(key => !keys.includes(key)) || new Set(keys).size !== 4) return false;
  return plan.days.every(day =>
    typeof day.name === "string" &&
    Number.isFinite(day.scheduleOrder) &&
    Number.isFinite(day.durationMinutes) && day.durationMinutes >= 30 && day.durationMinutes <= 60 &&
    Array.isArray(day.exercises) && day.exercises.length >= 4 && day.exercises.length <= 5 &&
    day.exercises.every(item =>
      typeof item.exerciseName === "string" && item.exerciseName.trim() &&
      ["weight_reps","duration"].includes(item.trackingType) &&
      Number.isFinite(item.targetSets) && item.targetSets >= 1 && item.targetSets <= 3 &&
      typeof item.targetRepRange === "string" &&
      Number.isFinite(item.restSeconds)
    )
  );
}

function workoutFromPublishedDay(day, idByName){
  return {
    id:uid(),
    planKey:day.planKey,
    scheduleOrder:day.scheduleOrder,
    planWeek:day.planWeek,
    name:day.name,
    notes:[day.notes, state.publishedPlan?.progressionRule, state.publishedPlan?.safetyNote].filter(Boolean).join(" "),
    exercises:day.exercises.map(item => {
      const substitutions = (item.substitutions || []).filter(Boolean);
      const notes = [item.notes, substitutions.length ? `Substitutions: ${substitutions.join(" or ")}.` : ""]
        .filter(Boolean)
        .join(" ");
      return {
        id:uid(),
        exerciseId:idByName[item.exerciseName.toLowerCase()],
        targetSets:Number(item.targetSets) || 1,
        targetReps:startingTargetReps(item.targetRepRange, item.trackingType === "duration" ? 10 : 8),
        targetRepRange:item.targetRepRange,
        targetEffort:item.targetEffort || (Number.isFinite(item.targetRir) ? `${item.targetRir} RIR` : ""),
        plannedLoadLb:Number.isFinite(item.plannedLoadLb) ? item.plannedLoadLb : null,
        restSeconds:Number(item.restSeconds) || 0,
        notes
      };
    }).filter(item => item.exerciseId)
  };
}

function applyPublishedPlan(plan){
  if (!validatePublishedPlan(plan)) throw new Error("Published weekly plan is invalid.");
  if (state.publishedPlan?.planId === plan.planId) return false;
  if (state.publishedPlan?.planWeek && state.publishedPlan.planWeek > plan.planWeek) return false;

  for (const day of plan.days) {
    day.planWeek = plan.planWeek;
    for (const item of day.exercises) {
      let exercise = state.exercises.find(entry => entry.name.toLowerCase() === item.exerciseName.toLowerCase());
      if (!exercise) {
        exercise = ex(item.exerciseName, item.muscleGroup || "Other", item.equipment || "Other", item.trackingType);
        state.exercises.push(exercise);
      } else {
        exercise.trackingType = item.trackingType || exercise.trackingType || "weight_reps";
      }
    }
  }

  state.publishedPlan = {
    planId:plan.planId,
    planWeek:plan.planWeek,
    generatedAt:plan.generatedAt || null,
    reviewSummary:plan.reviewSummary || "",
    progressionRule:plan.progressionRule || "",
    safetyNote:plan.safetyNote || ""
  };
  const idByName = exerciseIdMap(state.exercises);
  for (const day of plan.days) {
    const fresh = workoutFromPublishedDay(day, idByName);
    const existing = state.workouts.find(workout => workout.planKey === day.planKey);
    if (existing) Object.assign(existing, fresh, { id:existing.id });
    else state.workouts.push(fresh);
  }
  saveState();
  return true;
}

async function refreshPublishedPlan(){
  try {
    const response = await fetch(PUBLISHED_PLAN_PATH, { cache:"no-store" });
    if (!response.ok) throw new Error(`Plan request failed (${response.status})`);
    const plan = await response.json();
    const changed = applyPublishedPlan(plan);
    if (changed) {
      renderAll();
      toast(`Plan updated for week of ${fmtPlanWeek(plan.planWeek)}`);
    }
    return changed;
  } catch (error) {
    console.warn("Weekly plan refresh skipped:", error);
    return false;
  }
}

async function refreshSupabasePlan(retried = false){
  if (!syncConfigIsValid() || (!syncState.accessToken && !syncState.refreshToken)) {
    return { available:false, found:false, changed:false };
  }

  try {
    const accessToken = await ensureFreshSyncSession();
    const endpoint = new URL(`${syncState.supabaseUrl}/rest/v1/weekly_plans`);
    endpoint.searchParams.set("select", "plan");
    endpoint.searchParams.set("order", "plan_week.desc,generated_at.desc");
    endpoint.searchParams.set("limit", "1");
    const response = await fetch(endpoint, {
      headers:authHeaders(accessToken),
      cache:"no-store"
    });
    if (response.status === 401 && !retried && syncState.refreshToken) {
      syncState.accessToken = "";
      syncState.expiresAt = 0;
      saveSyncState();
      return refreshSupabasePlan(true);
    }
    const rows = await responseJsonOrError(response, "Weekly plan sync");
    if (!Array.isArray(rows) || !rows.length) {
      return { available:true, found:false, changed:false };
    }
    const plan = rows[0]?.plan;
    if (!validatePublishedPlan(plan)) throw new Error("The synced weekly plan is invalid.");
    const changed = applyPublishedPlan(plan);
    if (changed) {
      renderAll();
      toast(`Plan updated for week of ${fmtPlanWeek(plan.planWeek)}`);
    }
    return { available:true, found:true, changed };
  } catch (error) {
    console.warn("Supabase weekly plan refresh skipped:", error);
    return { available:false, found:false, changed:false };
  }
}

async function refreshBestAvailablePlan(){
  const cloud = await refreshSupabasePlan();
  if (cloud.found) return cloud.changed;
  return refreshPublishedPlan();
}

function seedBaselineSession(s, idByName, upperADefinition){
  const hasSeed = s.sessions.some(session => session.seedKey === BASELINE_SESSION_KEY);
  const hasMatchingSession = s.sessions.some(session => {
    if (!Number.isFinite(session.startedAt)) return false;
    const sameDay = new Date(session.startedAt).toISOString().slice(0,10) === "2026-08-17";
    const hasBench155 = (session.exercises || []).some(item =>
      (item.sets || []).some(set => Number(set.weightLb) === 155 && Number(set.reps) === 6));
    return sameDay && hasBench155;
  });
  if (hasSeed || hasMatchingSession) return;

  const endedAt = Date.parse("2026-08-17T18:00:00-04:00");
  const startedAt = endedAt - 42 * 60 * 1000;
  let createdAt = startedAt;
  const rowByName = Object.fromEntries(upperADefinition.rows.map(row => [row.exerciseName, row]));
  const workout = s.workouts.find(item => item.planKey === upperADefinition.planKey);
  const makeSets = rows => rows.map((row, index) => ({
    id:uid(),
    setNumber:index + 1,
    type:row.type || "normal",
    reps:row.reps,
    weightLb:Number.isFinite(row.weightLb) ? row.weightLb : 0,
    rir:Number.isFinite(row.rir) ? row.rir : null,
    done:true,
    createdAt:(createdAt += 90 * 1000)
  }));
  const makeExercise = (exerciseName, orderIndex, sets) => {
    const row = rowByName[exerciseName];
    return {
      id:uid(),
      orderIndex,
      exerciseId:idByName[exerciseName.toLowerCase()],
      targetSets:row.sets,
      targetReps:row.reps,
      targetRepRange:row.targetRepRange,
      targetEffort:row.targetEffort,
      plannedLoadLb:Number.isFinite(row.plannedLoadLb) ? row.plannedLoadLb : null,
      restSeconds:row.restSeconds,
      notes:row.notes,
      sets:makeSets(sets)
    };
  };

  s.sessions.push({
    id:uid(),
    seedKey:BASELINE_SESSION_KEY,
    workoutId:workout?.id || null,
    workoutName:"1 - Upper A (Monday)",
    planWeek:"2026-08-17",
    notes:"Completed in 42 minutes.",
    startedAt,
    endedAt,
    exercises:[
      makeExercise("Smith Machine Bench Press", 0, [
        { reps:10, weightLb:135, type:"warmup" },
        { reps:6, weightLb:155 },
        { reps:6, weightLb:155, rir:1 }
      ]),
      makeExercise("Chest-Supported Row", 1, [
        { reps:6, weightLb:145 }, { reps:6, weightLb:145 },
        { reps:6, weightLb:145 }, { reps:6, weightLb:145 }
      ]),
      makeExercise("Neutral-Grip Pulldown", 2, [
        { reps:8, weightLb:105 }, { reps:8, weightLb:105 }
      ]),
      makeExercise("Cable Lateral Raise", 3, [
        { reps:12 }, { reps:12 }
      ]),
      makeExercise("Rope Pressdown", 4, [
        { reps:12, weightLb:30 }, { reps:12, weightLb:30 }
      ])
    ]
  });
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
  return normalizeState(defaults);
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
  s.settings = {
    isKg:false,
    distanceUnit:"mi",
    autoRest:true,
    timerSound:true,
    blankWeightUsesBaseline:true,
    keepScreenAwake:true,
    blockTextUndo:true,
    ...(s.settings || {})
  };
  s.settings.distanceUnit = s.settings.distanceUnit === "km" ? "km" : "mi";
  s.exercises = Array.isArray(s.exercises) ? s.exercises : [];
  s.workouts = Array.isArray(s.workouts) ? s.workouts : [];
  s.sessions = Array.isArray(s.sessions) ? s.sessions : [];
  s.publishedPlan = s.publishedPlan && typeof s.publishedPlan === "object" ? s.publishedPlan : null;
  s.appMigrations = Array.isArray(s.appMigrations) ? s.appMigrations : [];
  s.exercises.forEach(exercise => { exercise.trackingType ||= "weight_reps"; });
  s.workouts.forEach(w => {
    w.notes ||= "";
    w.exercises = Array.isArray(w.exercises) ? w.exercises : [];
    w.exercises.forEach(te => {
      te.targetSets ||= 3;
      te.targetReps ||= 10;
      te.restSeconds = Number.isFinite(Number(te.restSeconds)) ? Number(te.restSeconds) : 90;
      te.targetRepRange ||= String(te.targetReps);
      te.targetEffort ||= "";
      te.plannedLoadLb = Number.isFinite(te.plannedLoadLb) ? te.plannedLoadLb : null;
      te.notes ||= "";
    });
  });
  s.sessions.forEach(sess => {
    sess.notes ||= "";
    sess.sessionRpe = Number.isFinite(sess.sessionRpe) ? sess.sessionRpe : null;
    sess.exercises = Array.isArray(sess.exercises) ? sess.exercises : [];
    sess.exercises.forEach(se => {
      const trackingType = s.exercises.find(exercise => exercise.id === se.exerciseId)?.trackingType || "weight_reps";
      se.notes ||= "";
      se.targetRepRange ||= String(se.targetReps || "");
      se.targetEffort ||= "";
      se.plannedLoadLb = Number.isFinite(se.plannedLoadLb) ? se.plannedLoadLb : null;
      se.sets = Array.isArray(se.sets) ? se.sets : [];
      se.sets.forEach(set => {
        set.type ||= "normal";
        if (trackingType !== "duration") {
          set.weightLb = Number.isFinite(set.weightLb) ? set.weightLb : 0;
          set.reps = Number.isFinite(set.reps) ? set.reps : 0;
        } else {
          const savedKm = set.distanceKm;
          const legacyDistance = set.distance;
          if (savedKm !== null && savedKm !== "" && Number.isFinite(Number(savedKm))) {
            set.distanceKm = Math.max(0, Number(savedKm));
          } else if (legacyDistance !== null && legacyDistance !== "" && Number.isFinite(Number(legacyDistance))) {
            const legacyUnit = set.distanceUnit === "mi" ? "mi" : "km";
            set.distanceKm = legacyUnit === "mi" ? Math.max(0, Number(legacyDistance)) * 1.609344 : Math.max(0, Number(legacyDistance));
          } else {
            set.distanceKm = null;
          }
        }
        set.rir = Number.isFinite(set.rir) ? set.rir : null;
        set.rpe = Number.isFinite(set.rpe) ? set.rpe : null;
        set.done = set.done !== false;
      });
    });
  });
  s.timer ||= { running:false, total:0, remaining:0, endTs:null, label:"" };
  ensureTrainingPlanRoutines(s);
  return s;
}

function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function unitLabel(){ return state.settings.isKg ? "kg" : "lb"; }
function toDisplayWeight(lb){
  const weight = Number(lb);
  if (!Number.isFinite(weight)) return 0;
  return state.settings.isKg ? weight / 2.2046226218 : weight;
}
function toPounds(display){
  const v = Number(display);
  if (!Number.isFinite(v)) return 0;
  return state.settings.isKg ? v * 2.2046226218 : v;
}
function fmtWeight(lb){
  const v = toDisplayWeight(lb);
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} ${unitLabel()}`;
}
function distanceUnitLabel(){ return state.settings.distanceUnit === "km" ? "km" : "mi"; }
function toDisplayDistance(km){
  const distance = Number(km);
  if (!Number.isFinite(distance)) return null;
  return distanceUnitLabel() === "mi" ? distance / 1.609344 : distance;
}
function toKilometers(display){
  if (display === "" || display === null || display === undefined) return null;
  const distance = Number(display);
  if (!Number.isFinite(distance)) return null;
  return Math.max(0, distanceUnitLabel() === "mi" ? distance * 1.609344 : distance);
}
function displayDistanceValue(km){
  const distance = toDisplayDistance(km);
  if (!Number.isFinite(distance)) return "";
  return Number(distance.toFixed(2)).toString();
}
function fmtDistance(km){
  const distance = toDisplayDistance(km);
  return Number.isFinite(distance) ? `${Number(distance.toFixed(2))} ${distanceUnitLabel()}` : "";
}
function cardioSetSummary(set){
  if (!set) return "";
  return [
    Number.isFinite(set.durationMinutes) ? `${set.durationMinutes} min` : null,
    Number.isFinite(set.distanceKm) ? fmtDistance(set.distanceKm) : null,
    Number.isFinite(set.rpe) ? `RPE ${set.rpe}` : null
  ].filter(Boolean).join(" - ");
}
function fmtDateTime(ts){ return new Date(ts).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }); }
function fmtDate(ts){ return new Date(ts).toLocaleDateString([], { month:"short", day:"numeric", year:"numeric" }); }
function fmtPlanWeek(dateString){ return new Date(`${dateString}T12:00:00`).toLocaleDateString([], { month:"short", day:"numeric", year:"numeric" }); }
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
function exerciseTitleBlock(exerciseId, metaText){
  const exercise = exerciseById(exerciseId);
  const wrap = el("div","exercise-title-block");
  wrap.appendChild(exerciseThumbnail(exercise));
  const copy = el("div","exercise-title-copy");
  copy.appendChild(el("div","exercise-name", exercise?.name || "Exercise"));
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

function exerciseVisualIndex(exercise){
  const name = String(exercise?.name || "").toLowerCase();
  const group = String(exercise?.muscleGroup || "").toLowerCase();
  if (/stair/.test(name)) return 14;
  if (/elliptical|treadmill|run|walk|bike|cycling|rowing machine|cardio/.test(name) || group === "cardio") return 13;
  if (/plank|core/.test(name) || group === "core") return 15;
  if (/hip thrust|glute/.test(name)) return 12;
  if (/calf/.test(name)) return 11;
  if (/leg extension/.test(name)) return 10;
  if (/leg curl/.test(name)) return 9;
  if (/deadlift|back extension|pull.through/.test(name)) return 8;
  if (/squat|leg press|lunge/.test(name)) return 7;
  if (/shoulder press|overhead press/.test(name)) return 6;
  if (/bicep|hammer curl|cable curl/.test(name)) return 5;
  if (/tricep|pressdown|pushdown|dip/.test(name)) return 4;
  if (/lateral raise|reverse pec|rear.delt/.test(name)) return 3;
  if (/pulldown|pull.up/.test(name)) return 2;
  if (/row/.test(name)) return 1;
  if (/bench|chest|press|fly/.test(name)) return 0;
  if (group === "legs") return 7;
  if (group === "back") return 1;
  if (group === "shoulders") return 6;
  if (group === "arms") return 5;
  return 0;
}

function exerciseThumbnail(exercise, compact = false){
  const name = String(exercise?.name || "").toLowerCase();
  const cardioIndex = /rowing machine|rower/.test(name) ? 2
    : /bike|cycling/.test(name) ? 1
    : /walk/.test(name) ? 3
    : /treadmill|run/.test(name) ? 0
    : null;
  const index = cardioIndex ?? exerciseVisualIndex(exercise);
  const gridSize = cardioIndex === null ? 4 : 2;
  const col = index % gridSize;
  const row = Math.floor(index / gridSize);
  const thumb = el("span", `exercise-thumb${compact ? " compact" : ""}`);
  if (cardioIndex !== null) thumb.classList.add("cardio-sprite");
  thumb.style.backgroundPosition = `${(col * 100) / (gridSize - 1)}% ${(row * 100) / (gridSize - 1)}%`;
  thumb.setAttribute("aria-hidden", "true");
  return thumb;
}

let lastUndoToastAt = 0;
function blockAccidentalTextUndo(event){
  if (!state.settings.blockTextUndo) return;
  if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") return;
  if (event.cancelable) event.preventDefault();
  const now = Date.now();
  if (now - lastUndoToastAt > 1800) {
    lastUndoToastAt = now;
    toast("Accidental text undo blocked");
  }
}

function updateWakeLockStatus(){
  if (!els.wakeLockStatus) return;
  if (!state.settings.keepScreenAwake) {
    els.wakeLockStatus.textContent = "Off. Your normal screen-lock setting applies.";
    return;
  }
  if (!("wakeLock" in navigator)) {
    els.wakeLockStatus.textContent = "Not available in this browser. On iPhone, add Lift Log to the Home Screen and use iOS 18.4 or later.";
    return;
  }
  if (screenWakeLock && !screenWakeLock.released) {
    els.wakeLockStatus.textContent = "Active while Lift Log is visible. This uses a little extra battery.";
    return;
  }
  if (wakeLockError) {
    els.wakeLockStatus.textContent = "Unavailable right now. Low Power Mode or the browser may be blocking it; tap the page to retry.";
    return;
  }
  els.wakeLockStatus.textContent = document.visibilityState === "visible"
    ? "Ready. Tap anywhere if the screen does not stay awake."
    : "Paused while Lift Log is in the background.";
}

async function ensureScreenAwake({ notify = false } = {}){
  updateWakeLockStatus();
  if (!state.settings.keepScreenAwake || document.visibilityState !== "visible") return false;
  if (!("wakeLock" in navigator) || typeof navigator.wakeLock?.request !== "function") {
    if (notify) toast("Screen wake lock is not supported here");
    return false;
  }
  if (screenWakeLock && !screenWakeLock.released) return true;
  if (wakeLockRequestPromise) return wakeLockRequestPromise;

  wakeLockRequestPromise = navigator.wakeLock.request("screen")
    .then(lock => {
      screenWakeLock = lock;
      wakeLockError = "";
      lock.addEventListener("release", () => {
        if (screenWakeLock === lock) screenWakeLock = null;
        updateWakeLockStatus();
      });
      updateWakeLockStatus();
      if (notify) toast("Screen will stay awake");
      return true;
    })
    .catch(error => {
      wakeLockError = error?.name || "WakeLockError";
      updateWakeLockStatus();
      if (notify) toast("Could not keep the screen awake");
      return false;
    })
    .finally(() => { wakeLockRequestPromise = null; });
  return wakeLockRequestPromise;
}

async function releaseScreenWakeLock(){
  const lock = screenWakeLock;
  screenWakeLock = null;
  wakeLockError = "";
  if (lock && !lock.released) {
    try { await lock.release(); } catch {}
  }
  updateWakeLockStatus();
}

function exerciseById(id){ return state.exercises.find(e => e.id === id) || null; }
function exerciseName(id){ return exerciseById(id)?.name || "Exercise"; }
function workoutById(id){ return state.workouts.find(w => w.id === id) || null; }
function trackingTypeForExercise(exerciseId){ return exerciseById(exerciseId)?.trackingType || "weight_reps"; }
function isDurationExercise(exerciseId){ return trackingTypeForExercise(exerciseId) === "duration"; }
function targetLabel(item){
  const range = item.targetRepRange || String(item.targetReps || "");
  if (isDurationExercise(item.exerciseId)) {
    return [range, item.targetEffort].filter(Boolean).join(" - ");
  }
  const load = Number.isFinite(item.plannedLoadLb) ? ` at ${fmtWeight(item.plannedLoadLb)}` : "";
  const effort = item.targetEffort ? ` - ${item.targetEffort}` : "";
  return `${item.targetSets} x ${range}${load}${effort}`;
}
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

function exportTemplateExercise(item){
  const exercise = exerciseById(item.exerciseId);
  return {
    exerciseName:exercise?.name || "Exercise",
    muscleGroup:exercise?.muscleGroup || "Other",
    equipment:exercise?.equipment || "Other",
    trackingType:exercise?.trackingType || "weight_reps",
    targetSets:item.targetSets,
    targetRepRange:item.targetRepRange || String(item.targetReps || ""),
    plannedLoadLb:Number.isFinite(item.plannedLoadLb) ? item.plannedLoadLb : null,
    targetEffort:item.targetEffort || "",
    restSeconds:item.restSeconds || 0,
    notes:item.notes || ""
  };
}

function exportSession(session){
  const endedAt = Number.isFinite(session.endedAt) ? session.endedAt : null;
  return {
    clientSessionId:session.id || null,
    workoutName:session.workoutName || "Workout",
    planWeek:session.planWeek || null,
    status:endedAt ? "completed" : "active",
    startedAt:Number.isFinite(session.startedAt) ? new Date(session.startedAt).toISOString() : null,
    endedAt:endedAt ? new Date(endedAt).toISOString() : null,
    durationMinutes:Number.isFinite(session.startedAt)
      ? Number((((endedAt || Date.now()) - session.startedAt) / 60000).toFixed(1))
      : null,
    sessionRpe:Number.isFinite(session.sessionRpe) ? session.sessionRpe : null,
    notes:session.notes || "",
    exercises:(session.exercises || [])
      .slice()
      .sort((a,b)=>(a.orderIndex || 0) - (b.orderIndex || 0))
      .map(item => {
        const trackingType = trackingTypeForExercise(item.exerciseId);
        return {
          exerciseName:exerciseName(item.exerciseId),
          trackingType,
          targetSets:item.targetSets,
          targetRepRange:item.targetRepRange || String(item.targetReps || ""),
          plannedLoadLb:Number.isFinite(item.plannedLoadLb) ? item.plannedLoadLb : null,
          targetEffort:item.targetEffort || "",
          restSeconds:item.restSeconds || 0,
          notes:item.notes || "",
          sets:(item.sets || [])
            .filter(set => set.done !== false)
            .slice()
            .sort((a,b)=>(a.setNumber || 0) - (b.setNumber || 0))
            .map(set => trackingType === "duration"
              ? {
                  setNumber:set.setNumber,
                  durationMinutes:Number.isFinite(set.durationMinutes) ? set.durationMinutes : null,
                  distanceKm:Number.isFinite(set.distanceKm) ? Number(set.distanceKm.toFixed(3)) : null,
                  distance:Number.isFinite(set.distanceKm) ? Number(toDisplayDistance(set.distanceKm).toFixed(2)) : null,
                  distanceUnit:distanceUnitLabel(),
                  rpe:Number.isFinite(set.rpe) ? set.rpe : null,
                  loggedAt:Number.isFinite(set.createdAt) ? new Date(set.createdAt).toISOString() : null
                }
              : {
                  setNumber:set.setNumber,
                  type:set.type || "normal",
                  weightLb:Number.isFinite(set.weightLb) ? Number(set.weightLb.toFixed(2)) : null,
                  reps:Number.isFinite(set.reps) ? set.reps : null,
                  rir:Number.isFinite(set.rir) ? set.rir : null,
                  loggedAt:Number.isFinite(set.createdAt) ? new Date(set.createdAt).toISOString() : null
                })
        };
      })
  };
}

function buildExportPayload(){
  const sessions = completedSessions().slice().sort((a,b)=>a.startedAt-b.startedAt);
  const totalLoggedSets = sessions.reduce((total, session) =>
    total + session.exercises.reduce((exerciseTotal, item) =>
      exerciseTotal + (item.sets || []).filter(set => set.done !== false).length, 0), 0);

  return {
    exportFormat:"lift-log-review-v1",
    app:{ name:"Lift Log", version:APP_VERSION },
    exportedAt:new Date().toISOString(),
    displayUnits:unitLabel(),
    cardioDistanceUnit:distanceUnitLabel(),
    publishedPlan:state.publishedPlan,
    reviewInstructions:"Automatic weekly review uses the private Supabase sync. Upload this file to ChatGPT only as a manual backup or troubleshooting fallback.",
    summary:{
      workoutTemplates:state.workouts.length,
      completedSessions:sessions.length,
      totalLoggedSets,
      firstCompletedWorkout:sessions.length ? new Date(sessions[0].startedAt).toISOString() : null,
      mostRecentCompletedWorkout:sessions.length ? new Date(sessions[sessions.length - 1].startedAt).toISOString() : null
    },
    progressionRule:"Keep the load until every work set reaches the top of the rep range at the target RIR; then add about 5 lb to upper-body lifts or 5-10 lb to lower-body lifts.",
    workoutTemplates:state.workouts
      .slice()
      .sort((a,b)=>(a.scheduleOrder ?? 999) - (b.scheduleOrder ?? 999) || a.name.localeCompare(b.name))
      .map(workout => ({
        name:workout.name,
        planWeek:workout.planWeek || null,
        notes:workout.notes || "",
        exercises:(workout.exercises || []).map(exportTemplateExercise)
      })),
    completedSessions:sessions.map(exportSession),
    activeSession:getActiveSession() ? exportSession(getActiveSession()) : null,
    backup:{ storageKey:LS_KEY, state }
  };
}

function downloadExport(blob, filename){
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportWorkoutData(){
  const originalText = els.exportDataBtn.textContent;
  els.exportDataBtn.disabled = true;
  els.exportDataBtn.textContent = "Preparing...";

  try {
    const json = JSON.stringify(buildExportPayload(), null, 2);
    const filename = `lift-log-export-${new Date().toISOString().slice(0,10)}.json`;
    const blob = new Blob([json], { type:"application/json" });
    const file = typeof File === "function" ? new File([blob], filename, { type:"application/json" }) : null;

    if (file && navigator.share && navigator.canShare?.({ files:[file] })) {
      await navigator.share({
        title:"Lift Log workout export",
        text:"Workout history and current strength plan",
        files:[file]
      });
      toast("Export shared");
      return;
    }

    downloadExport(blob, filename);
    toast("Export downloaded");
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      toast("Export failed. Please try again.");
    }
  } finally {
    els.exportDataBtn.disabled = false;
    els.exportDataBtn.textContent = originalText;
  }
}

function loadSyncState(){
  const defaults = {
    supabaseUrl:"",
    supabasePublishableKey:"",
    email:"",
    accessToken:"",
    refreshToken:"",
    expiresAt:0,
    userId:"",
    lastSyncAt:0,
    lastError:""
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_LS_KEY) || "null");
    return parsed && typeof parsed === "object" ? { ...defaults, ...parsed } : defaults;
  } catch {
    return defaults;
  }
}

function saveSyncState(){
  localStorage.setItem(SYNC_LS_KEY, JSON.stringify(syncState));
}

function normalizedSupabaseUrl(value){
  return String(value || "").trim().replace(/\/$/, "");
}

function syncConfigIsValid(){
  try {
    const url = new URL(syncState.supabaseUrl);
    return url.protocol === "https:" && !!syncState.supabasePublishableKey;
  } catch {
    return false;
  }
}

function syncUserFromToken(token){
  try {
    const rawPayload = token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
    const payload = rawPayload.padEnd(Math.ceil(rawPayload.length / 4) * 4, "=");
    const bytes = atob(payload);
    const encoded = Array.from(bytes, char => `%${char.charCodeAt(0).toString(16).padStart(2,"0")}`).join("");
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return { id:parsed.sub || "", email:parsed.email || "" };
  } catch {
    return { id:"", email:"" };
  }
}

function clearSyncSession(){
  syncState.accessToken = "";
  syncState.refreshToken = "";
  syncState.expiresAt = 0;
  syncState.userId = "";
}

function captureSyncConfigFromForm(){
  const nextUrl = normalizedSupabaseUrl(els.supabaseUrlInput?.value);
  const nextKey = String(els.supabaseKeyInput?.value || "").trim();
  const changed = nextUrl !== syncState.supabaseUrl || nextKey !== syncState.supabasePublishableKey;
  if (changed) clearSyncSession();
  syncState.supabaseUrl = nextUrl;
  syncState.supabasePublishableKey = nextKey;
  syncState.email = String(els.syncEmailInput?.value || syncState.email || "").trim();
  syncState.lastError = "";
  saveSyncState();
  return syncConfigIsValid();
}

function saveSyncConfigFromForm(){
  if (!captureSyncConfigFromForm()) {
    renderSyncSettings();
    return toast("Enter a valid HTTPS project URL and publishable key.");
  }
  renderSyncSettings();
  toast("Sync connection saved");
}

function authHeaders(token = syncState.supabasePublishableKey){
  return {
    apikey:syncState.supabasePublishableKey,
    Authorization:`Bearer ${token}`,
    "Content-Type":"application/json",
    Accept:"application/json"
  };
}

async function responseJsonOrError(response, label){
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message:text }; }
  if (!response.ok) {
    throw new Error(payload.msg || payload.message || payload.error_description || payload.error || `${label} failed (${response.status})`);
  }
  return payload;
}

function applySyncSession(payload){
  if (!payload?.access_token) return false;
  const tokenUser = syncUserFromToken(payload.access_token);
  syncState.accessToken = payload.access_token;
  syncState.refreshToken = payload.refresh_token || syncState.refreshToken;
  syncState.expiresAt = Number(payload.expires_at)
    ? Number(payload.expires_at) * 1000
    : Date.now() + (Number(payload.expires_in) || 3600) * 1000;
  syncState.userId = payload.user?.id || tokenUser.id || syncState.userId;
  syncState.email = payload.user?.email || tokenUser.email || syncState.email;
  syncState.lastError = "";
  saveSyncState();
  return true;
}

async function ensureFreshSyncSession(){
  if (syncState.accessToken && syncState.expiresAt > Date.now() + 90000) return syncState.accessToken;
  if (!syncConfigIsValid() || !syncState.refreshToken) throw new Error("Sign in to enable private workout sync.");
  if (syncRefreshPromise) return syncRefreshPromise;
  syncRefreshPromise = (async () => {
    const response = await fetch(`${syncState.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method:"POST",
      headers:authHeaders(),
      body:JSON.stringify({ refresh_token:syncState.refreshToken })
    });
    const payload = await responseJsonOrError(response, "Session refresh");
    applySyncSession(payload);
    return syncState.accessToken;
  })().finally(() => { syncRefreshPromise = null; });
  return syncRefreshPromise;
}

function setSyncBusy(busy){
  syncBusy = busy;
  renderSyncSettings();
}

async function signUpForSync(){
  if (!captureSyncConfigFromForm()) return toast("Save a valid Supabase connection first.");
  const email = String(els.syncEmailInput?.value || "").trim();
  const password = String(els.syncPasswordInput?.value || "");
  if (!email || password.length < 8) return toast("Enter your email and a password with at least 8 characters.");
  let shouldSync = false;
  setSyncBusy(true);
  try {
    const response = await fetch(`${syncState.supabaseUrl}/auth/v1/signup`, {
      method:"POST",
      headers:authHeaders(),
      body:JSON.stringify({ email, password })
    });
    const payload = await responseJsonOrError(response, "Account creation");
    syncState.email = email;
    if (payload.access_token) {
      applySyncSession(payload);
      shouldSync = true;
      toast("Account created and connected");
    } else {
      saveSyncState();
      toast("Account created. Confirm the email, then sign in.");
    }
  } catch (error) {
    syncState.lastError = error.message;
    saveSyncState();
    toast(error.message);
  } finally {
    if (els.syncPasswordInput) els.syncPasswordInput.value = "";
    setSyncBusy(false);
    if (shouldSync) {
      void Promise.all([
        syncAllCompletedSessions({ silent:true, force:true }),
        refreshBestAvailablePlan()
      ]);
    }
  }
}

async function signInForSync(){
  if (!captureSyncConfigFromForm()) return toast("Save a valid Supabase connection first.");
  const email = String(els.syncEmailInput?.value || "").trim();
  const password = String(els.syncPasswordInput?.value || "");
  if (!email || !password) return toast("Enter your sync email and password.");
  let shouldSync = false;
  setSyncBusy(true);
  try {
    const response = await fetch(`${syncState.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method:"POST",
      headers:authHeaders(),
      body:JSON.stringify({ email, password })
    });
    const payload = await responseJsonOrError(response, "Sign in");
    applySyncSession(payload);
    shouldSync = true;
    toast("Private sync connected");
  } catch (error) {
    syncState.lastError = error.message;
    saveSyncState();
    toast(error.message);
  } finally {
    if (els.syncPasswordInput) els.syncPasswordInput.value = "";
    setSyncBusy(false);
    if (shouldSync) {
      void Promise.all([
        syncAllCompletedSessions({ silent:true, force:true }),
        refreshBestAvailablePlan()
      ]);
    }
  }
}

async function signOutOfSync(){
  setSyncBusy(true);
  try {
    if (syncState.accessToken && syncConfigIsValid()) {
      await fetch(`${syncState.supabaseUrl}/auth/v1/logout`, {
        method:"POST",
        headers:authHeaders(syncState.accessToken)
      });
    }
  } catch (error) {
    console.warn("Remote sign out failed:", error);
  } finally {
    clearSyncSession();
    syncState.lastError = "";
    saveSyncState();
    setSyncBusy(false);
    toast("Sync account signed out");
  }
}

async function upsertCompletedSessions(sessions, retried = false){
  const accessToken = await ensureFreshSyncSession();
  const now = new Date().toISOString();
  const rows = sessions.map(session => ({
    client_session_id:session.id,
    workout_name:session.workoutName || "Workout",
    plan_week:session.planWeek || null,
    started_at:new Date(session.startedAt).toISOString(),
    ended_at:new Date(session.endedAt).toISOString(),
    payload:exportSession(session),
    app_version:APP_VERSION,
    updated_at:now
  }));
  const response = await fetch(`${syncState.supabaseUrl}/rest/v1/workout_sessions?on_conflict=user_id,client_session_id`, {
    method:"POST",
    headers:{
      ...authHeaders(accessToken),
      Prefer:"resolution=merge-duplicates,return=minimal"
    },
    body:JSON.stringify(rows)
  });
  if (response.status === 401 && !retried && syncState.refreshToken) {
    syncState.accessToken = "";
    syncState.expiresAt = 0;
    saveSyncState();
    await ensureFreshSyncSession();
    return upsertCompletedSessions(sessions, true);
  }
  await responseJsonOrError(response, "Workout sync");
}

async function syncAllCompletedSessions({ silent = true, force = false } = {}){
  if (syncBusy || !navigator.onLine || !syncConfigIsValid() || (!syncState.accessToken && !syncState.refreshToken)) {
    if (!silent && !syncConfigIsValid()) toast("Configure private sync in Settings first.");
    else if (!silent && !navigator.onLine) toast("Offline. Workouts will sync when you reconnect.");
    else if (!silent && !syncState.refreshToken) toast("Sign in to sync workouts.");
    renderSyncSettings();
    return false;
  }
  const sessions = completedSessions().filter(session => force || !session.syncedAt);
  if (!sessions.length) {
    if (!silent) toast("All completed workouts are synced");
    renderSyncSettings();
    return true;
  }

  setSyncBusy(true);
  try {
    await upsertCompletedSessions(sessions);
    const syncedAt = Date.now();
    sessions.forEach(session => {
      session.syncedAt = syncedAt;
      session.syncError = "";
    });
    syncState.lastSyncAt = syncedAt;
    syncState.lastError = "";
    saveState();
    saveSyncState();
    if (!silent) toast(`${sessions.length} workout${sessions.length === 1 ? "" : "s"} synced`);
    return true;
  } catch (error) {
    syncState.lastError = error.message;
    sessions.forEach(session => { session.syncError = error.message; });
    saveState();
    saveSyncState();
    console.error("Workout sync failed:", error);
    if (!silent) toast(`Sync failed: ${error.message}`);
    return false;
  } finally {
    setSyncBusy(false);
  }
}

async function loadPublishedSyncConfig(){
  try {
    const response = await fetch(PUBLISHED_SYNC_CONFIG_PATH, { cache:"no-store" });
    if (!response.ok) return false;
    const config = await response.json();
    const url = normalizedSupabaseUrl(config.supabaseUrl);
    const key = String(config.supabasePublishableKey || "").trim();
    if (!url || !key) return false;
    const changed = url !== syncState.supabaseUrl || key !== syncState.supabasePublishableKey;
    if (changed) clearSyncSession();
    syncState.supabaseUrl = url;
    syncState.supabasePublishableKey = key;
    saveSyncState();
    return true;
  } catch (error) {
    console.warn("Published sync configuration unavailable:", error);
    return false;
  }
}

function renderSyncSettings(){
  if (!els.syncStatus) return;
  const configured = syncConfigIsValid();
  const connected = configured && (!!syncState.accessToken || !!syncState.refreshToken) && !!syncState.userId;
  const pending = completedSessions().filter(session => !session.syncedAt).length;
  els.syncStatus.textContent = syncBusy ? "Working..." : connected ? "Connected" : configured ? "Sign in required" : "Not configured";
  els.syncStatus.classList.toggle("pr", connected);
  if (document.activeElement !== els.supabaseUrlInput) els.supabaseUrlInput.value = syncState.supabaseUrl;
  if (document.activeElement !== els.supabaseKeyInput) els.supabaseKeyInput.value = syncState.supabasePublishableKey;
  if (document.activeElement !== els.syncEmailInput) els.syncEmailInput.value = syncState.email;
  const details = [];
  if (connected) details.push(`Connected as ${syncState.email || syncState.userId}`);
  details.push(`${pending} completed workout${pending === 1 ? "" : "s"} waiting to sync`);
  if (syncState.lastSyncAt) details.push(`last synced ${fmtDateTime(syncState.lastSyncAt)}`);
  if (syncState.lastError) details.push(`last error: ${syncState.lastError}`);
  els.syncDetails.textContent = details.join(" - ") + ". Your password is never saved.";
  [els.saveSyncConfigBtn, els.signUpSyncBtn, els.signInSyncBtn, els.syncNowBtn, els.signOutSyncBtn]
    .filter(Boolean)
    .forEach(button => { button.disabled = syncBusy; });
  els.syncNowBtn.disabled = syncBusy || !connected;
  els.signOutSyncBtn.disabled = syncBusy || !connected;
}

async function initializeCloudFeatures(){
  await loadPublishedSyncConfig();
  await Promise.all([
    refreshBestAvailablePlan(),
    syncAllCompletedSessions({ silent:true })
  ]);
  renderSyncSettings();
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
let timerAudioContext = null;
let scheduledTimerSoundNodes = [];
let timerSoundScheduledForEndTs = null;
function nativeBridge(){ return window.LiftLogNative || null; }
function isNativeApp(){ return !!nativeBridge()?.isNative; }
async function scheduleNativeRestAlert(){
  const bridge = nativeBridge();
  if (!bridge?.isNative || !state.timer.running || !state.timer.endTs) return false;
  try {
    const result = await bridge.scheduleRestAlert({
      endTs: state.timer.endTs,
      label: state.timer.label
    });
    return !!result?.scheduled;
  } catch {
    return false;
  }
}
async function cancelNativeRestAlert(){
  const bridge = nativeBridge();
  if (!bridge?.isNative) return false;
  try { return await bridge.cancelRestAlert(); } catch { return false; }
}
function getTimerAudioContext(){
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  timerAudioContext ||= new AudioContextClass();
  return timerAudioContext;
}
async function unlockTimerAudio(){
  if (!state.settings.timerSound) return false;
  try {
    const context = getTimerAudioContext();
    if (!context) return false;
    if (context.state === "suspended") {
      const resumePromise = context.resume();
      await Promise.race([
        resumePromise,
        new Promise(resolve => setTimeout(resolve, 750))
      ]);
    }
    return context.state === "running";
  } catch {
    return false;
  }
}
function createTimerChime(context, startAt){
  return [
    { frequency:880, offset:0, duration:0.16 },
    { frequency:1046.5, offset:0.22, duration:0.16 },
    { frequency:1318.5, offset:0.44, duration:0.34 }
  ].map(note => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startAt + note.offset;
    const noteEnd = noteStart + note.duration;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.32, noteStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
    oscillator.onended = () => {
      try { oscillator.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    };
    return { oscillator, gain };
  });
}
function cancelScheduledTimerSound(){
  scheduledTimerSoundNodes.forEach(({ oscillator, gain }) => {
    try { oscillator.stop(); } catch {}
    try { oscillator.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  });
  scheduledTimerSoundNodes = [];
  timerSoundScheduledForEndTs = null;
}
async function scheduleTimerCompleteSound(){
  cancelScheduledTimerSound();
  if (!state.settings.timerSound || !state.timer.running || !state.timer.endTs) return false;
  const scheduledEndTs = state.timer.endTs;
  if (!(await unlockTimerAudio())) return false;
  if (!state.timer.running || state.timer.endTs !== scheduledEndTs) return false;
  try {
    const context = getTimerAudioContext();
    const secondsUntilEnd = Math.max(0.05, (scheduledEndTs - Date.now()) / 1000);
    scheduledTimerSoundNodes = createTimerChime(context, context.currentTime + secondsUntilEnd);
    timerSoundScheduledForEndTs = scheduledEndTs;
    return true;
  } catch {
    cancelScheduledTimerSound();
    return false;
  }
}
async function playTimerCompleteSound(){
  if (!state.settings.timerSound || !(await unlockTimerAudio())) return false;
  try {
    const context = getTimerAudioContext();
    createTimerChime(context, context.currentTime + 0.03);
    return true;
  } catch {
    return false;
  }
}
async function testTimerSound(){
  const played = await playTimerCompleteSound();
  toast(played ? "Timer sound is working" : "Sound is off or blocked by this browser");
}
function startTimer(seconds, label){
  stopTimer(false, true, false);
  void unlockTimerAudio();
  state.timer.running = true;
  state.timer.total = Math.max(0, Number(seconds) || 0);
  state.timer.endTs = Date.now() + state.timer.total * 1000;
  state.timer.label = label || "";
  saveState();
  els.timerBar.classList.remove("hidden");
  els.timerSub.textContent = state.timer.label || "Ready for the next set";
  timerInterval = setInterval(tickTimer, 250);
  void scheduleTimerCompleteSound();
  void scheduleNativeRestAlert();
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
    const soundWasScheduled = timerSoundScheduledForEndTs === state.timer.endTs;
    stopTimer(true, false, false);
    timerSoundScheduledForEndTs = null;
    notifyRestComplete(soundWasScheduled);
    toast("Rest complete");
  }
}
function notifyRestComplete(soundWasScheduled = false){
  if (!soundWasScheduled) void playTimerCompleteSound();
  if (isNativeApp()) void nativeBridge().restCompleteHaptic();
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
  if (isNativeApp()) {
    try {
      const permission = await nativeBridge().requestNotificationPermission();
      toast(permission === "granted" ? "iPhone timer alerts enabled" : "Notifications not enabled");
      if (permission === "granted" && state.timer.running) void scheduleNativeRestAlert();
    } catch {
      toast("Could not enable iPhone notifications");
    }
    renderNotificationStatus();
    return;
  }
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
  if (isNativeApp()) {
    els.notificationStatus.textContent = "Enable iPhone local notifications for locked-screen rest alerts.";
    els.enableNotificationsBtn.disabled = false;
    els.enableNotificationsBtn.textContent = "Enable";
    void refreshNativeNotificationStatus();
    return;
  }
  if (!("Notification" in window)) {
    els.notificationStatus.textContent = "Notifications are not supported in this browser.";
    els.enableNotificationsBtn.disabled = true;
    els.enableNotificationsBtn.textContent = "Unavailable";
    return;
  }
  if (Notification.permission === "granted") {
    els.notificationStatus.textContent = "Enabled. Background rest alerts can appear as system notifications.";
    els.enableNotificationsBtn.textContent = "Enabled";
    els.enableNotificationsBtn.disabled = true;
    return;
  }
  if (Notification.permission === "denied") {
    els.notificationStatus.textContent = "Blocked. Turn notifications back on in your device or browser settings.";
    els.enableNotificationsBtn.textContent = "Blocked";
    els.enableNotificationsBtn.disabled = true;
    return;
  }
  els.notificationStatus.textContent = "Show a system alert when supported. On iPhone, add the app to your Home Screen first.";
  els.enableNotificationsBtn.textContent = "Enable";
  els.enableNotificationsBtn.disabled = false;
}
async function refreshNativeNotificationStatus(){
  try {
    const permission = await nativeBridge().getNotificationPermission();
    if (!isNativeApp()) return;
    if (permission === "granted") {
      els.notificationStatus.textContent = "Enabled. Rest alerts can sound when the iPhone is locked.";
      els.enableNotificationsBtn.textContent = "Enabled";
      els.enableNotificationsBtn.disabled = true;
    } else if (permission === "denied") {
      els.notificationStatus.textContent = "Blocked. Enable Lift Log notifications and Sounds in iPhone Settings.";
      els.enableNotificationsBtn.textContent = "Blocked";
      els.enableNotificationsBtn.disabled = true;
    }
  } catch {}
}
function addTimer(seconds){
  if (!state.timer.running || !state.timer.endTs) return;
  state.timer.endTs += seconds * 1000;
  state.timer.total = Math.max(1, state.timer.total + seconds);
  saveState();
  void scheduleTimerCompleteSound();
  void scheduleNativeRestAlert();
  tickTimer();
}
function stopTimer(hide, cancelSound = true, cancelNative = true){
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  if (cancelSound) cancelScheduledTimerSound();
  if (cancelNative) void cancelNativeRestAlert();
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
    planWeek: workout.planWeek || null,
    notes: workout.notes || "",
    sessionRpe: null,
    startedAt: Date.now(),
    endedAt: null,
    exercises: workout.exercises.map((te, index) => ({
      id: uid(),
      orderIndex: index,
      exerciseId: te.exerciseId,
      targetSets: Number(te.targetSets) || 3,
      targetReps: Number(te.targetReps) || 10,
      targetRepRange: te.targetRepRange || String(te.targetReps || ""),
      targetEffort: te.targetEffort || "",
      plannedLoadLb: Number.isFinite(te.plannedLoadLb) ? te.plannedLoadLb : null,
      restSeconds: Number.isFinite(Number(te.restSeconds)) ? Number(te.restSeconds) : 90,
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
  const isDuration = isDurationExercise(te.exerciseId);
  const last = lastSetForExercise(te.exerciseId);
  const count = Math.max(1, Number(te.targetSets) || 3);
  return Array.from({ length: count }, (_, i) => isDuration
    ? {
        id:uid(),
        setNumber:i + 1,
        durationMinutes:Number(te.targetReps) || 10,
        distanceKm:null,
        rpe:null,
        done:false,
        createdAt:Date.now()
      }
    : {
        id:uid(),
        setNumber:i + 1,
        type:"normal",
        reps:Number(te.targetReps) || 10,
        weightLb:Number.isFinite(te.plannedLoadLb) ? te.plannedLoadLb : (last?.weightLb || 0),
        rir:null,
        done:false,
        createdAt:Date.now()
      });
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
  void syncAllCompletedSessions({ silent:true });
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
  se.sets.push(isDurationExercise(se.exerciseId)
    ? {
        id:uid(),
        setNumber:se.sets.length + 1,
        durationMinutes:previous?.durationMinutes || se.targetReps || 10,
        distanceKm:Number.isFinite(previous?.distanceKm) ? previous.distanceKm : null,
        rpe:Number.isFinite(previous?.rpe) ? previous.rpe : null,
        done:false,
        createdAt:Date.now()
      }
    : {
        id:uid(),
        setNumber:se.sets.length + 1,
        type:"normal",
        reps:previous?.reps || se.targetReps || 10,
        weightLb:previous?.weightLb || se.plannedLoadLb || 0,
        rir:Number.isFinite(previous?.rir) ? previous.rir : null,
        done:false,
        createdAt:Date.now()
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
  if (field === "rir") set.rir = value === "" ? null : Math.max(0, Math.min(10, Number(value)));
  if (field === "durationMinutes") set.durationMinutes = Math.max(0, Number(value) || 0);
  if (field === "distanceDisplay") set.distanceKm = toKilometers(value);
  if (field === "rpe") set.rpe = value === "" ? null : Math.max(1, Math.min(10, Number(value)));
  if (field === "type") set.type = value || "normal";
  saveState();
}
function toggleSet(sessionExerciseId, setId, checked){
  const sess = getActiveSession();
  const se = sess?.exercises.find(x => x.id === sessionExerciseId);
  const set = se?.sets.find(s => s.id === setId);
  if (!set || !se) return;
  if (checked && !isDurationExercise(se.exerciseId) && !set.weightLb && state.settings.blankWeightUsesBaseline) {
    const last = lastSetForExercise(se.exerciseId);
    if (last) set.weightLb = last.weightLb;
  }
  set.done = checked;
  set.createdAt = Date.now();
  saveState();
  renderActiveWorkout();
  if (checked && state.settings.autoRest && se.restSeconds > 0) {
    startTimer(se.restSeconds, `${exerciseName(se.exerciseId)} rest`);
  }
}
function updateSessionNotes(value){
  const sess = getActiveSession();
  if (!sess) return;
  sess.notes = value;
  saveState();
}
function updateSessionRpe(value){
  const sess = getActiveSession();
  if (!sess) return;
  const rpe = Number(value);
  sess.sessionRpe = Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null;
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
      const isDuration = isDurationExercise(exerciseId);
      w.exercises.push({
        id:uid(),
        exerciseId,
        targetSets:isDuration ? 1 : 3,
        targetReps:10,
        targetRepRange:isDuration ? "10 min" : "10",
        restSeconds:isDuration ? 0 : 90,
        notes:""
      });
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
  else {
    const minimum = field === "restSeconds" ? (isDurationExercise(te.exerciseId) ? 0 : 10) : 1;
    te[field] = Math.max(minimum, Number(value) || te[field] || minimum);
  }
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
  if (!name) {
    toast("Name required");
    return null;
  }
  const existing = state.exercises.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    toast("Exercise already exists");
    return null;
  }
  const exercise = {
    id: uid(),
    name,
    muscleGroup: String(data.muscleGroup || "Other").trim() || "Other",
    equipment: String(data.equipment || "Other").trim() || "Other",
    trackingType:data.trackingType === "duration" ? "duration" : "weight_reps",
    notes: String(data.notes || "").trim(),
    isCustom: true
  };
  state.exercises.push(exercise);
  saveState();
  toast("Exercise added");
  return exercise;
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
let modalReturnFocus = null;
function openModal(html, mode = ""){
  scrollY = window.scrollY || 0;
  modalReturnFocus = document.activeElement;
  document.body.classList.add("modal-open");
  document.body.style.top = `-${scrollY}px`;
  els.modalContent.innerHTML = html;
  els.modal.classList.remove("hidden");
  els.modal.setAttribute("aria-hidden","false");
  els.modal.classList.toggle("picker-modal", mode === "picker");
  requestAnimationFrame(() => {
    els.modalContent.querySelector("[autofocus], input, button, select, textarea")?.focus();
  });
}
function closeModal(){
  els.modal.classList.add("hidden");
  els.modal.setAttribute("aria-hidden","true");
  els.modal.classList.remove("picker-modal");
  els.modalContent.innerHTML = "";
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, scrollY);
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
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
      <select id="mTracking" class="input" aria-label="Tracking type">
        <option value="weight_reps">Strength: weight and reps</option>
        <option value="duration">Cardio: time and distance</option>
      </select>
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
    const exercise = addCustomExercise({
      name: $("mName").value,
      muscleGroup: $("mMuscle").value,
      equipment: $("mEquip").value,
      trackingType: $("mTracking").value,
      notes: $("mNotes").value
    });
    if (!exercise) return;
    closeModal();
    onDone?.(exercise);
  };
}
function openExercisePicker(workoutId, selected = new Set()){
  openModal(`
    <div class="picker-top">
      <div class="sheethead">
        <div><div class="sheettitle">Add Exercises</div><div class="sheetsub">Select one or more exercises.</div></div>
        <button class="iconbtn" id="mClose">Close</button>
      </div>
      <div class="search-row">
        <input id="mSearch" class="input" placeholder="Search exercises" />
        <button class="btn secondary" id="mNew">New</button>
      </div>
    </div>
    <div id="mList" class="list picker-list"></div>
    <div class="row-between picker-footer">
      <div class="muted" id="mCount">0 selected</div>
      <button class="btn" id="mAdd">Add selected</button>
    </div>
  `, "picker");
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
      row.classList.add("exercise-picker-row");
      row.appendChild(exerciseThumbnail(exercise, true));
      const copy = el("span","exercise-picker-copy");
      copy.appendChild(el("strong","", exercise.name));
      copy.appendChild(el("small","", `${exercise.muscleGroup} - ${exercise.equipment}`));
      row.appendChild(copy);
      const checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(exercise.id);
      row.appendChild(checkbox);
      checkbox.onchange = (e) => {
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
  $("mNew").onclick = () => openCustomExerciseModal((exercise) => {
    selected.add(exercise.id);
    openExercisePicker(workoutId, selected);
  }, $("mSearch").value.trim());
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
  notes.placeholder = "Workout notes: soreness, pain, fatigue, substitutions, or anything unusual";
  notes.value = sess.notes || "";
  notes.addEventListener("change", e => updateSessionNotes(e.target.value));
  head.appendChild(notes);
  const rpeField = el("label","field session-rpe");
  rpeField.appendChild(el("span","", "Overall session RPE (optional)"));
  const rpeInput = el("input","input");
  rpeInput.type = "number";
  rpeInput.inputMode = "decimal";
  rpeInput.min = "1";
  rpeInput.max = "10";
  rpeInput.step = "0.5";
  rpeInput.placeholder = "1-10";
  rpeInput.value = Number.isFinite(sess.sessionRpe) ? sess.sessionRpe : "";
  rpeInput.addEventListener("change", e => updateSessionRpe(e.target.value));
  rpeField.appendChild(rpeInput);
  head.appendChild(rpeField);
  els.activeWorkout.appendChild(head);

  sess.exercises.slice().sort((a,b)=>a.orderIndex-b.orderIndex).forEach(se => {
    const card = el("div","exercise-card");
    const isDuration = isDurationExercise(se.exerciseId);
    const isExerciseComplete = se.sets.length > 0 && se.sets.every(set => set.done);
    card.classList.toggle("is-complete", isExerciseComplete);
    const topRow = el("div","exercise-head");
    const best = isDuration ? null : bestSetForExercise(se.exerciseId);
    const last = lastSetForExercise(se.exerciseId);
    const title = exerciseTitleBlock(se.exerciseId, [
      `Target ${targetLabel(se)}`,
      se.restSeconds > 0 ? `Rest ${se.restSeconds}s` : null,
      best ? `Best est. 1RM ${fmtWeight(e1rm(best))}` : null,
      isDuration && cardioSetSummary(last) ? `Last ${cardioSetSummary(last)}` : null,
      !isDuration && last ? `Last ${last.reps} x ${fmtWeight(last.weightLb)}` : null
    ].filter(Boolean).join(" - "));
    if (isDuration) {
      title.copy.appendChild(el("div","previous-weight", cardioSetSummary(last) ? `Previous cardio: ${cardioSetSummary(last)}` : "Previous cardio: none yet"));
    } else {
      title.copy.appendChild(el("div","previous-weight", last ? `Previous weight: ${fmtWeight(last.weightLb)}` : "Previous weight: none yet"));
    }
    topRow.appendChild(title.wrap);
    const activeControls = el("div","active-exercise-controls");
    if (se.restSeconds > 0) {
      const restField = el("label","field compact");
      restField.innerHTML = `<span>Rest timer</span>`;
      const restInput = el("input","input");
      restInput.type = "number";
      restInput.inputMode = "numeric";
      restInput.pattern = "[0-9]*";
      restInput.min = "10";
      restInput.step = "5";
      restInput.value = se.restSeconds;
      restInput.addEventListener("change", e => updateSessionExerciseRest(se.id, e.target.value));
      restField.appendChild(restInput);
      restField.appendChild(el("small","field-help", "seconds"));
      activeControls.appendChild(restField);
    }
    activeControls.appendChild(button("Add Set", "btn secondary", () => addSet(se.id)));
    topRow.appendChild(activeControls);
    card.appendChild(topRow);

    const table = el("table","set-table");
    table.classList.toggle("duration-table", isDuration);
    table.innerHTML = isDuration
      ? `<thead><tr><th>Set</th><th>Minutes</th><th>Distance (${distanceUnitLabel()})</th><th>RPE</th><th>Done</th><th></th></tr></thead>`
      : `<thead><tr><th>Set</th><th>Type</th><th>Weight</th><th>Reps</th><th>RIR</th><th>Done</th><th></th></tr></thead>`;
    const tbody = el("tbody");
    se.sets.forEach(set => {
      const row = el("tr");
      row.classList.toggle("is-complete", !!set.done);
      row.innerHTML = isDuration
        ? `
          <td>${set.setNumber}</td>
          <td><input data-field="durationMinutes" type="number" inputmode="decimal" min="0" step="1" value="${set.durationMinutes || ""}" aria-label="Cardio minutes" /></td>
          <td><input data-field="distanceDisplay" type="number" inputmode="decimal" min="0" step="0.01" value="${displayDistanceValue(set.distanceKm)}" placeholder="${distanceUnitLabel()}" aria-label="Cardio distance in ${distanceUnitLabel()}" /></td>
          <td><input data-field="rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5" value="${Number.isFinite(set.rpe) ? set.rpe : ""}" placeholder="1-10" aria-label="Cardio RPE" /></td>
          <td class="set-done"><input data-field="done" type="checkbox" ${set.done ? "checked" : ""} /></td>
          <td><button class="mini-btn" data-action="remove">Del</button></td>
        `
        : `
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
          <td><input data-field="rir" type="number" inputmode="numeric" min="0" max="10" step="1" value="${Number.isFinite(set.rir) ? set.rir : ""}" placeholder="RIR" aria-label="Reps in reserve" /></td>
          <td class="set-done"><input data-field="done" type="checkbox" ${set.done ? "checked" : ""} /></td>
          <td><button class="mini-btn" data-action="remove">Del</button></td>
        `;
      if (!isDuration) row.querySelector("select").value = set.type || "normal";
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
    const tableScroll = el("div","table-scroll");
    tableScroll.appendChild(table);
    card.appendChild(tableScroll);
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
  state.workouts.slice().sort((a,b)=>(a.scheduleOrder ?? 999) - (b.scheduleOrder ?? 999) || a.name.localeCompare(b.name)).forEach(workout => {
    const card = el("div","routine-card");
    const top = el("div","routine-top");
    const leftSide = el("div");
    leftSide.appendChild(el("h3","", workout.name));
    leftSide.appendChild(el("p","muted", `${workout.planWeek ? `Week of ${fmtPlanWeek(workout.planWeek)} - ` : ""}${workout.exercises.length} exercises${workout.notes ? " - has notes" : ""}`));
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
    const isDuration = isDurationExercise(te.exerciseId);
    const card = el("div","exercise-card");
    const header = el("div","exercise-head");
    const best = bestSetForExercise(te.exerciseId);
    header.appendChild(exerciseTitleBlock(te.exerciseId, [
      `Target ${targetLabel(te)}`,
      te.restSeconds > 0 ? `Rest ${te.restSeconds}s` : null,
      best ? `Best est. 1RM ${fmtWeight(e1rm(best))}` : null
    ].filter(Boolean).join(" - ")).wrap);
    header.appendChild(button("Remove", "btn secondary", () => removeTemplateExercise(workout.id, te.id)));
    card.appendChild(header);
    const grid = el("div","grid2");
    [
      ["targetSets", "Sets", te.targetSets],
      ["targetReps", isDuration ? "Minutes" : "Reps", te.targetReps],
      ["restSeconds", "Rest seconds", te.restSeconds]
    ].forEach(([field, label, value]) => {
      const fieldWrap = el("label","field");
      fieldWrap.appendChild(el("span","", label));
      const input = el("input","input");
      input.type = "number";
      input.inputMode = "numeric";
      input.pattern = "[0-9]*";
      input.min = field === "restSeconds" ? (isDuration ? "0" : "10") : "1";
      input.placeholder = label;
      input.value = value;
      input.addEventListener("change", e => updateTemplateExercise(workout.id, te.id, field, e.target.value));
      fieldWrap.appendChild(input);
      fieldWrap.appendChild(el("small","field-help", field === "restSeconds" ? "Timer after each completed set" : field === "targetSets" ? "Planned sets" : isDuration ? "Target minutes per set" : "Target reps per set"));
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
    if (Number.isFinite(sess.sessionRpe)) chips.appendChild(el("span","badge", `Session RPE ${sess.sessionRpe}`));
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
  if (Number.isFinite(sess.sessionRpe)) block.appendChild(el("span","badge", `Session RPE ${sess.sessionRpe}`));
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
      const isDuration = isDurationExercise(se.exerciseId);
      const table = el("table","set-table");
      table.classList.toggle("duration-table", isDuration);
      table.innerHTML = isDuration
        ? `<thead><tr><th>Set</th><th>Minutes</th><th>Distance (${distanceUnitLabel()})</th><th>RPE</th></tr></thead>`
        : "<thead><tr><th>Set</th><th>Type</th><th>Weight</th><th>Reps</th><th>RIR</th><th>Est. 1RM</th></tr></thead>";
      const tbody = el("tbody");
      const best = isDuration ? null : bestSetForExercise(se.exerciseId);
      sets.forEach(set => {
        const row = el("tr");
        const isBest = best && set.id === best.id;
        row.innerHTML = isDuration
          ? `
            <td>${set.setNumber}</td>
            <td>${Number.isFinite(set.durationMinutes) ? set.durationMinutes : "-"}</td>
            <td>${Number.isFinite(set.distanceKm) ? fmtDistance(set.distanceKm) : "-"}</td>
            <td>${Number.isFinite(set.rpe) ? set.rpe : "-"}</td>
          `
          : `
            <td>${set.setNumber}</td>
            <td><span class="set-type ${escapeHtml(set.type || "normal")}">${escapeHtml(set.type || "normal")}</span></td>
            <td>${fmtWeight(set.weightLb)}</td>
            <td>${set.reps}</td>
            <td>${Number.isFinite(set.rir) ? set.rir : "-"}</td>
            <td>${fmtWeight(e1rm(set))} ${isBest ? '<span class="badge pr">PR</span>' : ""}</td>
          `;
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      const tableScroll = el("div","table-scroll");
      tableScroll.appendChild(table);
      card.appendChild(tableScroll);
    }
    els.historyRoot.appendChild(card);
  });
}
function renderSettingsRoute(){
  if (route !== "settings") return;
  renderNotificationStatus();
  renderSyncSettings();
  els.unitsToggle.checked = !!state.settings.isKg;
  els.distanceUnitSelect.value = distanceUnitLabel();
  els.autoRestToggle.checked = !!state.settings.autoRest;
  els.timerSoundToggle.checked = !!state.settings.timerSound;
  els.testTimerSoundBtn.disabled = !state.settings.timerSound;
  els.blankWeightUsesBaselineToggle.checked = !!state.settings.blankWeightUsesBaseline;
  els.keepScreenAwakeToggle.checked = !!state.settings.keepScreenAwake;
  els.blockTextUndoToggle.checked = !!state.settings.blockTextUndo;
  updateWakeLockStatus();
  els.unitsToggle.onchange = () => { state.settings.isKg = els.unitsToggle.checked; saveState(); renderAll(); };
  els.distanceUnitSelect.onchange = () => {
    state.settings.distanceUnit = els.distanceUnitSelect.value === "km" ? "km" : "mi";
    saveState();
    renderAll();
  };
  els.autoRestToggle.onchange = () => { state.settings.autoRest = els.autoRestToggle.checked; saveState(); };
  els.timerSoundToggle.onchange = () => {
    state.settings.timerSound = els.timerSoundToggle.checked;
    els.testTimerSoundBtn.disabled = !state.settings.timerSound;
    saveState();
    if (state.settings.timerSound) {
      void unlockTimerAudio();
      if (state.timer.running) void scheduleTimerCompleteSound();
    } else {
      cancelScheduledTimerSound();
    }
  };
  els.blankWeightUsesBaselineToggle.onchange = () => { state.settings.blankWeightUsesBaseline = els.blankWeightUsesBaselineToggle.checked; saveState(); };
  els.keepScreenAwakeToggle.onchange = () => {
    state.settings.keepScreenAwake = els.keepScreenAwakeToggle.checked;
    saveState();
    if (state.settings.keepScreenAwake) void ensureScreenAwake({ notify:true });
    else void releaseScreenWakeLock();
  };
  els.blockTextUndoToggle.onchange = () => {
    state.settings.blockTextUndo = els.blockTextUndoToggle.checked;
    saveState();
  };
  els.customExercisesList.innerHTML = "";
  const customs = state.exercises.filter(e => e.isCustom).sort((a,b)=>a.name.localeCompare(b.name));
  if (!customs.length) {
    els.customExercisesList.appendChild(el("div","empty", "No custom exercises yet."));
  } else {
    customs.forEach(exercise => {
      const row = el("div","setting-row");
      row.appendChild(exerciseTitleBlock(exercise.id, `${exercise.muscleGroup} - ${exercise.equipment}`).wrap);
      row.appendChild(button("Delete", "btn secondary", () => deleteCustomExercise(exercise.id)));
      els.customExercisesList.appendChild(row);
    });
  }
}
function resetAllData(){
  if (!confirm("Reset all data? This cannot be undone.")) return;
  state = DEFAULT_STATE();
  state.appMigrations.push(WEEKLY_PLAN_MIGRATION);
  saveState();
  stopTimer(true);
  ui = { workouts:{ screen:"list", workoutId:null }, history:{ screen:"list", sessionId:null } };
  setRoute("workouts");
  toast("Reset complete");
}

renderAll();
setRoute("workouts");
startWorkoutClock();
void initializeCloudFeatures();
void ensureScreenAwake();
if (state.timer.running && state.timer.endTs) {
  els.timerBar.classList.remove("hidden");
  els.timerSub.textContent = state.timer.label || "Ready for the next set";
  timerInterval = setInterval(tickTimer, 250);
  void scheduleNativeRestAlert();
  tickTimer();
}
