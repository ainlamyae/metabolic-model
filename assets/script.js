// Metabolic Model — standalone extraction of the "Tune" sheet from the
// ledger app's Health Indicator panel. No saving, no pinning: every box is
// either typed or computed live, and reloading the page resets it to the
// default profile below. `currentSettings` stays permanently empty — it
// exists only so the ported calorie/BMR math can read its inputs through the
// same getSetting() overlay the original app uses to preview unsaved edits,
// which here is simply the only mode there is.

let currentSettings = {};

function getSetting(key, fallback) {
  const raw = currentSettings[key];
  const num = Number(raw);
  return raw !== undefined && raw !== '' && !Number.isNaN(num) ? num : fallback;
}

function getSettingString(key, fallback) {
  const raw = currentSettings[key];
  return raw !== undefined && raw !== '' ? raw : fallback;
}

// ---------------------------------------------------------------------------
// Ported math (charts.js in the ledger app). Trimmed of every setting that
// only ever fed a persisted plan — the pinning system, the wellness-log body
// mass sourcing, privacy masking — since none of those exist without saving.
// ---------------------------------------------------------------------------

const BODY_MASS_TARGET_KG_DEFAULT = 70;
const ACTIVITY_TARGET_MIN_DEFAULT = 70;

// Protein per kg of LEAN mass, not total mass. 1.8-2.2 spans what the
// resistance-training literature supports for holding lean mass in an energy
// deficit: Morton et al. 2018 (Br J Sports Med) puts the point above which
// fat-free-mass gains stop accruing at ~1.6 g/kg total mass with a 2.2 upper
// confidence bound, and Helms et al. 2014 recommends scaling to fat-free mass
// instead, which is what makes 1.8-2.2 the same advice expressed against LBM.
const PROTEIN_G_PER_KG_LBM_MIN_DEFAULT = 1.8;
const PROTEIN_G_PER_KG_LBM_MAX_DEFAULT = 2.2;

// The fiber band's two coefficients. 14 g/1000 kcal is the USDA/Dietary Guidelines for
// Americans rule of thumb (derived from the ~25g/2000kcal adult reference intake); 0.5 g/kg
// body weight is a common upper-bound heuristic so the ceiling scales with the person rather
// than staying a flat number regardless of size.
const FIBER_G_PER_1000_KCAL_MIN_DEFAULT = 14;
const FIBER_G_PER_KG_MAX_DEFAULT = 0.5;

// The fat band's two coefficients — 20-35% of total energy from fat is the Institute of
// Medicine's Acceptable Macronutrient Distribution Range for adults (Dietary Reference
// Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino
// Acids, 2005), the same range the USDA Dietary Guidelines for Americans carries forward.
// Both ends scale off Eᵢₙ (percent of intake calories), unlike fiber's floor/ceiling on two
// different bases, since that's how the AMDR itself is defined.
const FAT_PCT_OF_KCAL_MIN_DEFAULT = 20;
const FAT_PCT_OF_KCAL_MAX_DEFAULT = 35;
// Fat's fixed energy density (Atwater) — grams per kcal, not a personal parameter, so it's a
// plain constant rather than an overridable setting the way the two percentages above are.
const KCAL_PER_G_FAT = 9;

// The carb band's two coefficients — 45-65% of total energy from carbohydrate is the same
// AMDR report's range for carbohydrate (Dietary Reference Intakes for Energy, Carbohydrate,
// Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids, 2005), also carried forward
// by the USDA Dietary Guidelines for Americans. Both ends scale off Eᵢₙ, same shape as the
// fat band above.
const CARB_PCT_OF_KCAL_MIN_DEFAULT = 45;
const CARB_PCT_OF_KCAL_MAX_DEFAULT = 65;
// Carbohydrate's fixed energy density (Atwater) — grams per kcal, same role as KCAL_PER_G_FAT.
const KCAL_PER_G_CARB = 4;

// Sleep Efficiency Factor's rate — the literature's own 2-3%/hr range, defaulting to its
// midpoint. A per-hour cost to fat-loss efficiency, not a fixed constant, so it's tunable
// here like every other coefficient on this sheet.
const SLEEP_DEPRIVATION_PCT_PER_HOUR_KEY = 'SLEEP_DEPRIVATION_PCT_PER_HOUR';
const SLEEP_DEPRIVATION_PCT_PER_HOUR_DEFAULT = 2.5;
// What "hitting your sleep target" means — the plan sleep length (s) is measured against
// this. The ledger app reads it off a separate Settings row (SLEEP_TARGET_HOURS); there's
// nothing to store here, so it's a plain constant, and s defaults to exactly this — an
// untouched box means "assume you hit it", i.e. zero effect.
const SLEEP_TARGET_HOURS_DEFAULT = 8;

// Intensity assumed for the activity target (3.0 walking, 5.0 compound
// lifting, 7.0 jogging).
const ACTIVITY_MET_FALLBACK = 2.75;
const ACTIVITY_MET_SETTING_KEYS = ['ACTIVITY_MET', 'ACTIVITY_MET_DEFAULT'];

function activityMet() {
  for (const key of ACTIVITY_MET_SETTING_KEYS) {
    const met = getSetting(key, null);
    if (met !== null) return met;
  }
  return ACTIVITY_MET_FALLBACK;
}

// Energy density of body fat — a population constant, not a personal one.
const GENERIC_KCAL_PER_KG_FAT = 7700;

// ACSM form: 1 MET = 3.5 mL O₂/kg/min and a litre of O₂ releases ~5 kcal (200
// mL per kcal), so 3.5/200 kcal per MET per kg per minute.
const MET_ML_O2_PER_KG_MIN_DEFAULT = 3.5;
const ML_O2_PER_KCAL = 200;

function kcalPerMetKgMin() {
  return getSetting('KCAL_PER_MET_KG_MIN', MET_ML_O2_PER_KG_MIN_DEFAULT) / ML_O2_PER_KCAL;
}

function metKcal(met, bodyMassKg, minutes) {
  return met * bodyMassKg * minutes * kcalPerMetKgMin();
}

// Mifflin-St Jeor BMR (kcal/day).
function mifflinStJeorBmr(bodyMassKg, heightCm, age, sex) {
  return 10 * bodyMassKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

// Katch-McArdle (1996): BMR = 370 + 21.6 × LBM.
const KATCH_BASE_KCAL = 370;
const KATCH_KCAL_PER_KG_LBM = 21.6;

function katchMcArdleBmr(lbmKg) {
  return KATCH_BASE_KCAL + KATCH_KCAL_PER_KG_LBM * lbmKg;
}

// The LBM this equation is evaluated at, rounded to the same 0.1 kg the LBM
// box and the protein band show — so the trace's `370 + 21.6 × 61.4` multiplies
// out to the BMR printed beside it instead of missing it by a kcal.
function bmrLeanBodyMassKg(bodyMassKg, heightCm, sex) {
  return Math.round(boerLeanBodyMassKg(bodyMassKg, heightCm, sex) * 10) / 10;
}

const BMR_FORMULA_KEY = 'BMR_FORMULA';
const BMR_FORMULA_DEFAULT = 'mifflin';

function bmrFormula() {
  return getSettingString(BMR_FORMULA_KEY, BMR_FORMULA_DEFAULT) === 'katch' ? 'katch' : BMR_FORMULA_DEFAULT;
}

// Age is a Mifflin term only — Katch-McArdle reads lean mass instead.
function bmrNeedsAge(formula = bmrFormula()) {
  return formula !== 'katch';
}

function bmrKcal(bodyMassKg, heightCm, age, sex, formula = bmrFormula()) {
  return formula === 'katch'
    ? katchMcArdleBmr(bmrLeanBodyMassKg(bodyMassKg, heightCm, sex))
    : mifflinStJeorBmr(bodyMassKg, heightCm, age, sex);
}

// Thermic effect of food: Eᵢₙ = (BMR + Eₐ − D) / (1 − f). Defaults to 0, which
// is the plain sum with no digestion cost counted.
const TEF_PERCENT_KEY = 'TEF_PERCENT_OF_INTAKE';
const TEF_PERCENT_DEFAULT = 10;
const TEF_PERCENT_MAX = 90;

function tefPercent() {
  return getSetting(TEF_PERCENT_KEY, TEF_PERCENT_DEFAULT);
}

function tefDivisor(percent = tefPercent()) {
  return 1 - Math.min(Math.max(percent, 0), TEF_PERCENT_MAX) / 100;
}

// Metabolic adaptation: BMR_adapt(t) = BMR × (1 − λt), λt capped near 10-15%
// by week 10-12. Reported, never planned with — see adaptedPlateauKg below.
const ADAPT_PCT_PER_WEEK_KEY = 'BMR_ADAPT_PCT_PER_WEEK';
const ADAPT_PCT_CAP_KEY = 'BMR_ADAPT_PCT_CAP';
const ADAPT_PCT_PER_WEEK_DEFAULT = 1;
const ADAPT_PCT_CAP_DEFAULT = 12;

function adaptationFraction(days, pctPerWeek, pctCap) {
  const grown = (pctPerWeek / 100) * (days / 7);
  return Math.max(0, Math.min(grown, pctCap / 100));
}

// What the activity target implies at `bodyMassKg`. Gross, not net of resting.
function activityTargetKcal(bodyMassKg) {
  return metKcal(activityMet(), bodyMassKg, getSetting('ACTIVITY_TARGET_MIN', ACTIVITY_TARGET_MIN_DEFAULT));
}

// Sleep Efficiency Factor: 1 − rate × hours below target — the per-hour cost a short night
// has on fat-loss efficiency. 1.0 at or above target, floored at 0 rather than going
// negative on an extreme night. The rate itself is a sheet input (γ,
// SLEEP_DEPRIVATION_PCT_PER_HOUR_KEY), not a constant.
function sleepEfficiencyFactor(sleepHours, sleepTargetHours) {
  if (sleepHours === null || sleepHours === undefined || !sleepTargetHours) return 1;
  const hoursBelow = Math.max(0, sleepTargetHours - sleepHours);
  const pctPerHour = getSetting(SLEEP_DEPRIVATION_PCT_PER_HOUR_KEY, SLEEP_DEPRIVATION_PCT_PER_HOUR_DEFAULT);
  return Math.max(0, 1 - (pctPerHour / 100) * hoursBelow);
}

// Never divide the deficit up by more than this — realistic inputs never come close, but a
// typed extreme shouldn't be able to send the target intake to ±Infinity.
const SLEEP_EFFICIENCY_FACTOR_MIN = 0.2;

// The FORWARD question: given a night that only delivers `sleepEfficiencyFactor` of full
// value, how much BIGGER does the raw deficit need to be to still realize `rawDeficitKcal`/day
// of actual fat loss? Only on an actual deficit; a surplus or maintenance passes through
// unchanged, since poor sleep isn't modelled as making a bulk MORE effective. Shared by
// calorieTargetDetail and TAU, so neither can quote a different D for the same inputs.
function sleepAdjustedDeficitKcal(rawDeficitKcal, planSleepHours, sleepTargetHours) {
  // Read once and carried in the result, rather than re-read by every caller that wants to
  // trace η back to γ — so a typed γ reaches the trace the same way it reached the factor,
  // off this one read.
  const pctPerHour = getSetting(SLEEP_DEPRIVATION_PCT_PER_HOUR_KEY, SLEEP_DEPRIVATION_PCT_PER_HOUR_DEFAULT);
  if (rawDeficitKcal === null || rawDeficitKcal <= 0) {
    return { rawDeficitKcal, deficitKcal: rawDeficitKcal, sleepDeprivationEffectKcal: 0, factor: 1, pctPerHour };
  }
  const factor = sleepEfficiencyFactor(planSleepHours, sleepTargetHours);
  const deficitKcal = rawDeficitKcal / Math.max(factor, SLEEP_EFFICIENCY_FACTOR_MIN);
  return {
    rawDeficitKcal, deficitKcal, sleepDeprivationEffectKcal: Math.round(deficitKcal - rawDeficitKcal), factor, pctPerHour,
  };
}

// The daily intake target at ONE body mass and age — the single identity
// every mode on the sheet rearranges. `age` is a direct parameter (the ledger
// app instead reads a stored birth date; there's nothing to store here, so
// the typed age just flows straight through). Null when an input is missing.
function calorieTargetDetail(bodyMassKg, age) {
  const heightCm = getSetting('HEIGHT_CM', null);
  const sex = getSettingString('SEX', null);
  const weeklyFatLossKg = getSetting('WEEKLY_FAT_LOSS_KG', null);

  const haveAllInputs = bodyMassKg !== null && heightCm !== null && (age !== null || !bmrNeedsAge())
    && (sex === 'male' || sex === 'female') && weeklyFatLossKg !== null;
  if (!haveAllInputs) return null;

  const bmr = bmrKcal(bodyMassKg, heightCm, age, sex);
  const activityKcal = activityTargetKcal(bodyMassKg);

  // A negative WEEKLY_FAT_LOSS_KG (lean bulk) makes this a surplus and lifts the target
  // above maintenance, flipping it from a ceiling to a floor.
  const rawDeficit = (weeklyFatLossKg * GENERIC_KCAL_PER_KG_FAT) / 7;

  // PLAN_SLEEP_HOURS defaults to the sleep target itself — "assume you hit it" — so an
  // untouched setting keeps this identical to the arithmetic before the sleep model
  // existed. Type fewer hours in `s` and the deficit below grows to compensate for the
  // lost efficiency (see sleepAdjustedDeficitKcal).
  const sleepTargetHours = SLEEP_TARGET_HOURS_DEFAULT;
  const planSleepHours = getSetting('PLAN_SLEEP_HOURS', sleepTargetHours);
  const {
    deficitKcal: deficit, sleepDeprivationEffectKcal, factor, pctPerHour,
  } = sleepAdjustedDeficitKcal(rawDeficit, planSleepHours, sleepTargetHours);

  const divisor = tefDivisor();
  const kcal = Math.round((bmr + activityKcal - deficit) / divisor);

  return {
    kcal, bmr, activityKcal, weeklyFatLossKg, rawDeficit, deficit, sleepDeprivationEffectKcal, factor, pctPerHour,
    planSleepHours, sleepTargetHours, tefKcal: kcal * (1 - divisor), tefDivisor: divisor,
  };
}

// Δm as a share of body mass. 0.5-1% of body mass per week is the usual
// sustainable range, and 1% the ceiling.
const WEEKLY_FAT_LOSS_PCT_FLOOR = 0.5;
const WEEKLY_FAT_LOSS_PCT_CEILING = 1;

function weeklyFatLossPct(weeklyFatLossKg, bodyMassKg) {
  if (weeklyFatLossKg === null || bodyMassKg === null || bodyMassKg <= 0) return null;
  return Math.round((weeklyFatLossKg / bodyMassKg) * 10000) / 100;
}

function weeklyFatLossKgFromPct(pct, bodyMassKg) {
  if (pct === null || bodyMassKg === null) return null;
  return Math.round((pct / 100) * bodyMassKg * 1000) / 1000;
}

const BOER_LBM_COEFFICIENTS = {
  male: { perKg: 0.407, perCm: 0.267, constant: -19.2 },
  female: { perKg: 0.252, perCm: 0.473, constant: -48.3 },
};

function boerLeanBodyMassCoefficients(sex) {
  return sex === 'male' ? BOER_LBM_COEFFICIENTS.male : BOER_LBM_COEFFICIENTS.female;
}

function boerLeanBodyMassKg(bodyMassKg, heightCm, sex) {
  const c = boerLeanBodyMassCoefficients(sex);
  return c.perKg * bodyMassKg + c.perCm * heightCm + c.constant;
}

// bodyMassKg / heightM².
function computeBmi(bodyMassKg, heightCm) {
  const heightM = heightCm / 100;
  return Math.round((bodyMassKg / (heightM * heightM)) * 10) / 10;
}

function bodyMassKgFromBmi(bmi, heightCm) {
  const heightM = heightCm / 100;
  return Math.round(bmi * heightM * heightM * 10) / 10;
}

const BMI_HEALTHY_MIN = 18.5;
const BMI_HEALTHY_MAX = 24.9;

function bmiVerdict(bmi) {
  if (bmi < 16) return { text: 'severely underweight', outside: true };
  if (bmi < BMI_HEALTHY_MIN) return { text: 'underweight', outside: true };
  if (bmi <= BMI_HEALTHY_MAX) return { text: `in the healthy ${BMI_HEALTHY_MIN}–${BMI_HEALTHY_MAX} band`, outside: false };
  if (bmi < 30) return { text: 'overweight', outside: true };
  if (bmi < 35) return { text: 'obese (class I)', outside: true };
  return { text: 'obese (class II+)', outside: true };
}

// UTC end to end: `new Date("YYYY-MM-DD")` parses as UTC midnight, and
// formatting that back in local time rolls it back a day in any
// negative-offset zone.
function parseIsoDateUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// A and B from "Maintenance is affine in body mass — M(m) = A + B×m": the
// body-mass-independent and body-mass-scaling halves of BMR + activity burn.
// Affine under both BMR equations, which is what lets one decay model serve
// them both.
function maintenanceAffineCoefficients({
  heightCm, age, sex, met, tau, kappa, formula = bmrFormula(), tef = tefPercent(),
}) {
  const activityPerKg = (met * tau * kappa) / ML_O2_PER_KCAL;
  const lbm = boerLeanBodyMassCoefficients(sex);
  const aBmr = formula === 'katch'
    ? KATCH_BASE_KCAL + KATCH_KCAL_PER_KG_LBM * (lbm.perCm * heightCm + lbm.constant)
    : 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const bBmr = formula === 'katch' ? KATCH_KCAL_PER_KG_LBM * lbm.perKg : 10;
  const divisor = tefDivisor(tef);

  return {
    a: aBmr / divisor,
    b: (bBmr + activityPerKg) / divisor,
    aBmr,
    bBmr,
    activityPerKg,
    tefDivisor: divisor,
    formula,
  };
}

// Where the mass actually levels off once BMR has adapted — the same
// m∞ = (Eᵢₙ − A)/B, with the BMR half of each coefficient scaled by (1 − λt).
function adaptedPlateauKg(intakeKcal, coefficients, adaptFraction) {
  const { aBmr, bBmr, activityPerKg, tefDivisor: divisor } = coefficients;
  const remaining = 1 - adaptFraction;
  return (intakeKcal - (remaining * aBmr) / divisor)
    / ((remaining * bBmr + activityPerKg) / divisor);
}

const BODY_MASS_AT_TARGET_TOLERANCE_KG = 0.1;

// The constant-intake journey — closed form of dm/dt = (Eᵢₙ − A − B·m)/ρ.
function projectTargetDays({
  intakeKcal, bodyMassKg, heightCm, age, sex, met, tau, kappa, targetKg, formula, tef,
}) {
  const { a, b } = maintenanceAffineCoefficients({ heightCm, age, sex, met, tau, kappa, formula, tef });
  const equilibriumKg = (intakeKcal - a) / b;

  if (Math.abs(bodyMassKg - targetKg) < BODY_MASS_AT_TARGET_TOLERANCE_KG) {
    return { a, b, equilibriumKg, status: 'reached' };
  }

  const ratio = (bodyMassKg - equilibriumKg) / (targetKg - equilibriumKg);
  if (!Number.isFinite(ratio) || ratio <= 1) {
    return { a, b, equilibriumKg, status: 'unreachable' };
  }

  const days = (GENERIC_KCAL_PER_KG_FAT / b) * Math.log(ratio);
  const eta = new Date();
  eta.setDate(eta.getDate() + Math.round(days));
  return { a, b, decayPerKg: b, equilibriumKg, days, etaIso: isoFromDate(eta), status: 'ok', journey: 'intake' };
}

// The OTHER trajectory — a pinned percentage's constant-fraction journey:
// m(t) = m × (1 − p/100)^(t/7). No plateau, so a positive rate always arrives.
function projectTargetDaysAtFixedPct({ bodyMassKg, targetKg, weeklyPct }) {
  const base = { decayPerKg: 0, equilibriumKg: 0, journey: 'pct' };
  if (Math.abs(bodyMassKg - targetKg) < BODY_MASS_AT_TARGET_TOLERANCE_KG) {
    return { ...base, status: 'reached' };
  }

  const kPerDay = -Math.log(1 - weeklyPct / 100) / 7;
  const decayPerKg = kPerDay * GENERIC_KCAL_PER_KG_FAT;
  const days = Math.log(bodyMassKg / targetKg) / kPerDay;
  if (!Number.isFinite(days) || days <= 0) {
    return {
      ...base,
      status: 'unreachable',
      reason: weeklyPct > 0
        ? 'the target is not below your current body mass'
        : 'a rate of 0% or less never moves the mass',
    };
  }

  const eta = new Date();
  eta.setDate(eta.getDate() + Math.round(days));
  return { ...base, decayPerKg, days, etaIso: isoFromDate(eta), status: 'ok' };
}

// ---------------------------------------------------------------------------
// The sheet itself (formula-playground.js in the ledger app). Trimmed of
// Save and the "which stays fixed" pin fieldsets — there is nowhere to save
// to, so every quantity here is either typed or computed for this session
// only.
// ---------------------------------------------------------------------------

// The profile a fresh load (or Reset) seeds the sheet with — the ledger app
// instead reads these from a saved weigh-in log and settings sheet, neither
// of which exists here.
const DEFAULT_BODY_MASS_KG = 82;
const DEFAULT_HEIGHT_CM = 170;
const DEFAULT_AGE = 30;
const DEFAULT_SEX = 'male';

const FORMULA_FIELDS = [
  { key: 'KCAL_PER_MET_KG_MIN', inputId: 'formula-met-o2', fallback: () => MET_ML_O2_PER_KG_MIN_DEFAULT },
  { key: 'ACTIVITY_MET', inputId: 'formula-met', fallback: () => activityMet() },
  { key: 'ACTIVITY_TARGET_MIN', inputId: 'formula-activity-min', fallback: () => ACTIVITY_TARGET_MIN_DEFAULT },
  // Defaults to the sleep target itself — "assume you hit it" — so an untouched box keeps
  // producing the exact deficit this sheet always has. Type fewer hours and D (below)
  // grows to compensate for the lost fat-loss efficiency.
  { key: 'PLAN_SLEEP_HOURS', inputId: 'formula-plan-sleep-hours', fallback: () => SLEEP_TARGET_HOURS_DEFAULT },
  // The literature's own 2-3%/hr range, defaulting to its midpoint — a rate, not a fixed
  // constant, so it's tunable here like every other coefficient on this sheet.
  { key: SLEEP_DEPRIVATION_PCT_PER_HOUR_KEY, inputId: 'formula-sleep-deprivation-pct', fallback: () => SLEEP_DEPRIVATION_PCT_PER_HOUR_DEFAULT },
  // Defaults to 0.5% of body mass/week — the floor of the sustainable
  // 0.5-1%/week band (§1.8) — so a fresh load opens on a real journey
  // instead of "already there".
  { key: 'WEEKLY_FAT_LOSS_KG', inputId: 'formula-weekly-loss', fallback: () => weeklyFatLossKgFromPct(0.5, DEFAULT_BODY_MASS_KG) },
  { key: 'BODY_MASS_TARGET_KG', inputId: 'formula-target', fallback: () => BODY_MASS_TARGET_KG_DEFAULT },
  { key: TEF_PERCENT_KEY, inputId: 'formula-tef-pct', fallback: () => TEF_PERCENT_DEFAULT },
];

const ADAPT_FORMULA_FIELDS = [
  { key: ADAPT_PCT_PER_WEEK_KEY, inputId: 'formula-adapt-per-week', fallback: () => ADAPT_PCT_PER_WEEK_DEFAULT },
  { key: ADAPT_PCT_CAP_KEY, inputId: 'formula-adapt-cap', fallback: () => ADAPT_PCT_CAP_DEFAULT },
];

const PROTEIN_FORMULA_FIELDS = [
  { key: 'PROTEIN_G_PER_KG_LBM_MIN', inputId: 'formula-protein-per-kg-min', fallback: () => PROTEIN_G_PER_KG_LBM_MIN_DEFAULT },
  { key: 'PROTEIN_G_PER_KG_LBM_MAX', inputId: 'formula-protein-per-kg-max', fallback: () => PROTEIN_G_PER_KG_LBM_MAX_DEFAULT },
];

// The fiber band's two coefficients, kept out of FORMULA_FIELDS for the same reason as
// PROTEIN_FORMULA_FIELDS: fiber feeds no calorie identity, so a blank one should only stop
// fiber from being computed, not the target.
const FIBER_FORMULA_FIELDS = [
  { key: 'FIBER_G_PER_1000_KCAL_MIN', inputId: 'formula-fiber-per-1000kcal-min', fallback: () => FIBER_G_PER_1000_KCAL_MIN_DEFAULT },
  { key: 'FIBER_G_PER_KG_MAX', inputId: 'formula-fiber-per-kg-max', fallback: () => FIBER_G_PER_KG_MAX_DEFAULT },
];

// The fat band's two coefficients, kept out of FORMULA_FIELDS for the same reason as
// FIBER_FORMULA_FIELDS: fat feeds no calorie identity, so a blank one should only stop fat
// from being computed, not the target.
const FAT_FORMULA_FIELDS = [
  { key: 'FAT_PCT_OF_KCAL_MIN', inputId: 'formula-fat-pct-min', fallback: () => FAT_PCT_OF_KCAL_MIN_DEFAULT },
  { key: 'FAT_PCT_OF_KCAL_MAX', inputId: 'formula-fat-pct-max', fallback: () => FAT_PCT_OF_KCAL_MAX_DEFAULT },
];

// The carb band's two coefficients, kept out of FORMULA_FIELDS for the same reason as
// FAT_FORMULA_FIELDS: carb feeds no calorie identity, so a blank one should only stop carb
// from being computed, not the target.
const CARB_FORMULA_FIELDS = [
  { key: 'CARB_PCT_OF_KCAL_MIN', inputId: 'formula-carb-pct-min', fallback: () => CARB_PCT_OF_KCAL_MIN_DEFAULT },
  { key: 'CARB_PCT_OF_KCAL_MAX', inputId: 'formula-carb-pct-max', fallback: () => CARB_PCT_OF_KCAL_MAX_DEFAULT },
];

const FORMULA_SOLVE_FIELD_ID = {
  EIN: 'formula-ein',
  TARGET_MASS: 'formula-target',
  TAU: 'formula-activity-min',
  DELTA_M: 'formula-weekly-loss',
};

const FORMULA_TOGGLE_IDS = [...Object.values(FORMULA_SOLVE_FIELD_ID), 'formula-days', 'formula-eta', 'formula-weekly-loss-pct', 'formula-target-bmi'];

const FORMULA_COMPUTED_IDS = {
  EIN: ['formula-ein', 'formula-days', 'formula-eta'],
  TARGET_MASS: ['formula-target', 'formula-target-bmi'],
  FIXED_PCT: ['formula-weekly-loss', 'formula-ein', 'formula-days', 'formula-eta'],
};

// For TAU and DELTA_M, either Eᵢₙ or t can be the known that drives the solve
// — whichever you last typed into.
const dualKnownField = { TAU: 'ein', DELTA_M: 'days' };

let weeklyLossKnownField = 'kg';   // 'kg' | 'pct'
let targetMassKnownField = 'kg';   // 'kg' | 'bmi'

function targetBmiIsTyped() {
  if (currentSolveFor() === 'TARGET_MASS') return false;
  return targetMassKnownField === 'bmi';
}

function weeklyLossPctIsTyped() {
  const mode = currentSolveFor();
  if (mode === 'FIXED_PCT') return true;
  if (mode === 'DELTA_M') return false;
  return weeklyLossKnownField === 'pct';
}

// Which BMR equation the preview is running.
function currentBmrFormula() {
  return document.querySelector('input[name="formula-bmr-formula"]:checked').value;
}

function formulaBodyMassKg() {
  return formulaNumber('formula-body-mass-smooth');
}

function weeklyLossPctInPlay(weeklyLossKg, bodyMassKg) {
  return weeklyLossPctIsTyped()
    ? formulaNumber('formula-weekly-loss-pct')
    : weeklyFatLossPct(weeklyLossKg, bodyMassKg);
}

function computedIdsForMode(mode) {
  if (mode === 'TAU') {
    return dualKnownField.TAU === 'ein'
      ? ['formula-activity-min', 'formula-days', 'formula-eta']
      : ['formula-activity-min', 'formula-ein'];
  }
  if (mode === 'DELTA_M') {
    return dualKnownField.DELTA_M === 'ein'
      ? ['formula-weekly-loss', 'formula-weekly-loss-pct', 'formula-days', 'formula-eta']
      : ['formula-weekly-loss', 'formula-weekly-loss-pct', 'formula-ein'];
  }
  return FORMULA_COMPUTED_IDS[mode];
}

function currentSolveFor() {
  return document.querySelector('input[name="formula-solve-for"]:checked').value;
}

const FORMULA_DUAL_FIELD_IDS = ['formula-ein', 'formula-days', 'formula-eta'];

function applySolveForMode(mode) {
  const computed = new Set(computedIdsForMode(mode));
  const isDualMode = mode === 'TAU' || mode === 'DELTA_M';
  FORMULA_TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (isDualMode && FORMULA_DUAL_FIELD_IDS.includes(id)) {
      el.readOnly = false;
      el.classList.toggle('formula-field-computed', computed.has(id));
    } else {
      el.readOnly = computed.has(id);
      el.classList.remove('formula-field-computed');
    }
  });
}

function formulaFieldValue(field) {
  return getSetting(field.key, null) ?? field.fallback();
}

// Runs fn with `currentSettings` overlaid by the sheet's own edits, so the
// preview goes through the real calorieTargetDetail/metKcal path instead of a
// second copy of the arithmetic that could disagree with it.
function withFormulaOverrides(overrides, fn) {
  const saved = currentSettings;
  currentSettings = { ...currentSettings, ...overrides };
  try {
    return fn();
  } finally {
    currentSettings = saved;
  }
}

function formulaNumber(inputId) {
  const raw = document.getElementById(inputId).value.trim();
  const num = Number(raw);
  return (raw === '' || Number.isNaN(num)) ? null : num;
}

function setComputedField(inputId, text) {
  document.getElementById(inputId).value = text;
}

function isoDateFromDays(days) {
  const eta = new Date();
  eta.setDate(eta.getDate() + Math.round(days));
  return isoFromDate(eta);
}

function daysFromTodayIso(dateIso) {
  return Math.round((parseIsoDateUTC(dateIso) - parseIsoDateUTC(isoFromDate(new Date()))) / 86400000);
}

// Every box maps to a would-be settings key except current body mass, which
// is a plain measurement scaling both terms of the formula.
function readFormulaInputs() {
  const mode = currentSolveFor();
  const overrides = {};
  const invalid = [];
  FORMULA_FIELDS.forEach((field) => {
    const num = formulaNumber(field.inputId);
    if (num === null) invalid.push(field.key);
    else overrides[field.key] = num;
  });

  const bodyMassKg = formulaBodyMassKg();
  const heightCm = formulaNumber('formula-height');
  const age = formulaNumber('formula-age');
  const sex = document.getElementById('formula-sex').value;
  const formula = currentBmrFormula();
  if (bodyMassKg === null) invalid.push('m̄ (smoothed body mass)');
  if (heightCm === null) invalid.push('HEIGHT_CM');
  // Age is a Mifflin input only — Katch-McArdle reads lean mass instead — so
  // on that equation a blank age isn't missing, it's simply not part of the model.
  if (age === null && bmrNeedsAge(formula)) invalid.push('BIRTH_DATE (age)');

  if (heightCm !== null) overrides.HEIGHT_CM = heightCm;
  overrides.SEX = sex;
  overrides[BMR_FORMULA_KEY] = formula;

  const preview = { ...overrides };

  // Blank exactly when the current mode is about to compute it — not
  // invalid, just not typed yet.
  const computed = computedIdsForMode(mode);
  const einIsTyped = !computed.includes('formula-ein');
  const daysIsTyped = !computed.includes('formula-days');

  const einKcal = einIsTyped ? formulaNumber('formula-ein') : null;
  if (einIsTyped && einKcal === null) invalid.push('Eᵢₙ (target daily intake)');

  const days = daysIsTyped ? formulaNumber('formula-days') : null;
  if (daysIsTyped && days === null) invalid.push('t (days)');

  if (mode === 'FIXED_PCT' && formulaNumber('formula-weekly-loss-pct') === null) {
    invalid.push('Δm% (weekly fat loss, % of body mass)');
  }

  return { mode, overrides, preview, bodyMassKg, heightCm, age, sex, formula, einKcal, days, invalid };
}

// The formula with every symbol replaced by the figure actually used.
//
// Δm%, TEF and BMI_g are NOT read here: each sits inside `rows` itself, appended by the
// mode that built it, at the spot the legend puts it (Δm% by D, TEF by Eᵢₙ, BMI_g by m_d),
// rather than tacked on after everything mode-specific is done.
function renderFormulaSubstituted(rows, plan = null) {
  const el = document.getElementById('formula-substituted');
  el.innerHTML = '';
  let lbmRows = [];
  try {
    lbmRows = renderLbmField();
  } catch (err) {
    console.error('Lean body mass failed to render', err);
  }
  let proteinRows = [];
  try {
    proteinRows = renderProteinFields();
  } catch (err) {
    console.error('Protein band failed to render', err);
  }
  // Independent of the protein block above — reads m̄ and Eᵢₙ, not LBM — but guarded
  // separately for the same reason every block here is: one throwing can't take the others
  // down with it.
  let fiberRows = [];
  try {
    fiberRows = renderFiberFields();
  } catch (err) {
    console.error('Fiber band failed to render', err);
  }
  // Independent of the fiber block above too — reads only Eᵢₙ, no body mass — but guarded
  // separately for the same reason.
  let fatRows = [];
  try {
    fatRows = renderFatFields();
  } catch (err) {
    console.error('Fat band failed to render', err);
  }
  // Independent of the fat block above too — reads only Eᵢₙ, no body mass — but guarded
  // separately for the same reason.
  let carbRows = [];
  try {
    carbRows = renderCarbFields();
  } catch (err) {
    console.error('Carb band failed to render', err);
  }
  let glycogenRows = [];
  try {
    glycogenRows = renderGlycogenSwingField();
  } catch (err) {
    console.error('Glycogen swing failed to render', err);
  }
  let correctionRows = [];
  try {
    correctionRows = renderCorrectionFields(plan);
  } catch (err) {
    console.error('Correction terms failed to render', err);
  }

  // LBM leads (it sits with the profile, ahead of everything `rows` itself starts with),
  // then `rows` — which carries Δm%, TEF and BMI_g inline, at the legend's own positions —
  // then the adaptation pair, then glycogen, protein, fiber, fat and carb: the same order
  // the legend lists them in.
  [...lbmRows, ...(rows ?? []), ...correctionRows, ...glycogenRows, ...proteinRows, ...fiberRows, ...fatRows, ...carbRows].forEach(([label, value]) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.append(strong, document.createTextNode(value));
    el.appendChild(p);
  });
}

function setEtaDate(iso) {
  document.getElementById('formula-eta').value = iso;
}

function setEtaNote(text) {
  document.getElementById('formula-eta-note').textContent = text;
}

// `direction` ({ bodyMassKg, targetKg }) is only read on the 'intake' journey's
// unreachable branch, to tell two different failures apart: an equilibrium
// past the target (a real plateau, just short of it) reads very differently
// from an equilibrium on the WRONG side of it — e.g. a target above m̄ with a
// typed Eᵢₙ still below maintenance, which is a deficit heading away from a
// gain goal, not a diet that merely falls short. Omitted by the 'pct' journey,
// which already carries its own reason string, and by callers where t itself
// was typed rather than solved for.
function renderFormulaDaysField(proj, direction = null) {
  if (proj === null) {
    setComputedField('formula-days', '');
    setEtaDate('');
    setEtaNote('');
    return;
  }
  if (proj.status === 'reached') {
    setComputedField('formula-days', '');
    setEtaDate('');
    setEtaNote('already there');
    return;
  }
  if (proj.status === 'unreachable') {
    setComputedField('formula-days', '');
    setEtaDate('');
    if (proj.journey === 'pct') {
      setEtaNote(`never — ${proj.reason}`);
      return;
    }
    const equilibriumKg = Math.round(proj.equilibriumKg * 10) / 10;
    if (direction !== null) {
      const { bodyMassKg, targetKg } = direction;
      const wantsGain = targetKg > bodyMassKg;
      const headingTowardTarget = wantsGain ? proj.equilibriumKg > bodyMassKg : proj.equilibriumKg < bodyMassKg;
      if (!headingTowardTarget) {
        setEtaNote(`never — Eᵢₙ needs to be ${wantsGain ? 'above' : 'below'} maintenance to reach a target ${wantsGain ? 'above' : 'below'} m̄ (a ${wantsGain ? 'negative' : 'positive'} Δm)`);
        return;
      }
    }
    setEtaNote(`never — plateaus at ${equilibriumKg} kg`);
    return;
  }
  setComputedField('formula-days', String(Math.round(proj.days)));
  setEtaDate(proj.etaIso);
  setEtaNote('');
}

// The one case with no closed form: TAU with a typed day count instead of a
// typed Eᵢₙ. Solved by bisection — h(B) changes sign at most once for a
// physically reachable target.
function solveBForTypedDays({ deficit, massToLose, t, rho, minB = 10 }) {
  const h = (B) => deficit * (1 - Math.exp((-B * t) / rho)) - massToLose * B;
  const lo = minB;
  const hi = 1e7;
  const hLo = h(lo);
  const hHi = h(hi);
  if (Math.abs(hLo) < 1e-9) return lo;
  if (Math.abs(hHi) < 1e-9) return hi;
  if (!Number.isFinite(hLo) || !Number.isFinite(hHi) || Math.sign(hLo) === Math.sign(hHi)) return null;

  let low = lo;
  let high = hi;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (Math.sign(h(mid)) === Math.sign(hLo)) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

// LBM and the protein band it implies, from whatever m, h and σ currently
// read — or null when any of the four numbers it needs is missing.
function readProteinFormula() {
  const bodyMassKg = formulaBodyMassKg();
  const heightCm = formulaNumber('formula-height');
  const sex = document.getElementById('formula-sex').value;
  const perKgMin = formulaNumber('formula-protein-per-kg-min');
  const perKgMax = formulaNumber('formula-protein-per-kg-max');
  if (bodyMassKg === null || heightCm === null || perKgMin === null || perKgMax === null) return null;

  const raw = boerLeanBodyMassKg(bodyMassKg, heightCm, sex);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const lbmKg = Math.round(raw * 10) / 10;

  const low = Math.min(perKgMin, perKgMax);
  const high = Math.max(perKgMin, perKgMax);
  return {
    bodyMassKg, heightCm, sex, lbmKg, perKgMin: low, perKgMax: high,
    minG: Math.round(lbmKg * low),
    maxG: Math.round(lbmKg * high),
  };
}

// The LBM box and its trace row alone — split out from the protein band below so it can
// sit with the profile (m̄/h/σ/BMR) at the top of the sheet, ahead of the calorie solve,
// while still sharing the one Boer read every other lean-mass consumer here (protein,
// glycogen) uses.
function renderLbmField() {
  const protein = readProteinFormula();

  if (protein === null) {
    setComputedField('formula-lbm', '—');
    return [];
  }

  const { lbmKg, bodyMassKg, heightCm, sex } = protein;
  setComputedField('formula-lbm', String(lbmKg));

  const coefficients = sex === 'male'
    ? `0.407 × ${bodyMassKg} + 0.267 × ${heightCm} − 19.2`
    : `0.252 × ${bodyMassKg} + 0.473 × ${heightCm} − 48.3`;
  return [['LBM', `${coefficients}  =  ${lbmKg} kg`]];
}

function renderProteinFields() {
  const protein = readProteinFormula();

  if (protein === null) {
    ['formula-protein-min', 'formula-protein-max'].forEach((id) => setComputedField(id, '—'));
    return [];
  }

  const { lbmKg, perKgMin, perKgMax, minG, maxG } = protein;
  setComputedField('formula-protein-min', String(minG));
  setComputedField('formula-protein-max', String(maxG));

  return [
    ['P_min', `${perKgMin} × ${lbmKg}  =  ${minG} g/day`],
    ['P_max', `${perKgMax} × ${lbmKg}  =  ${maxG} g/day`],
  ];
}

// The fiber band: a floor scaled to how much you eat (14 g/1000 kcal, the USDA/DGA rule of
// thumb) and a ceiling scaled to body weight (0.5 g/kg) — two different bases, unlike
// protein's single LBM, so neither end rides on a box the other computes.
//
// Reads formula-ein directly rather than re-deriving it: by the time renderFiberFields runs
// (from renderFormulaSubstituted, after the calorie half of the sheet), that box already
// holds this render's Eᵢₙ — typed or solved, in every mode — so this is the one read that
// can't disagree with what the sheet just showed.
function readFiberFormula() {
  const bodyMassKg = formulaBodyMassKg();
  const einKcal = formulaNumber('formula-ein');
  const perKcalMin = formulaNumber('formula-fiber-per-1000kcal-min');
  const perKgMax = formulaNumber('formula-fiber-per-kg-max');
  if (bodyMassKg === null || einKcal === null || perKcalMin === null || perKgMax === null) return null;

  return {
    bodyMassKg, einKcal, perKcalMin, perKgMax,
    minG: Math.round(perKcalMin * (einKcal / 1000)),
    maxG: Math.round(perKgMax * bodyMassKg),
  };
}

// The two fiber boxes and their trace rows — same pairing and same dash-on-missing-input
// convention renderProteinFields uses.
function renderFiberFields() {
  const fiber = readFiberFormula();

  if (fiber === null) {
    ['formula-fiber-min', 'formula-fiber-max'].forEach((id) => setComputedField(id, '—'));
    return [];
  }

  const { bodyMassKg, einKcal, perKcalMin, perKgMax, minG, maxG } = fiber;
  setComputedField('formula-fiber-min', String(minG));
  setComputedField('formula-fiber-max', String(maxG));

  return [
    ['F_min', `${perKcalMin} × (${einKcal} / 1000)  =  ${minG} g/day`],
    ['F_max', `${perKgMax} × ${bodyMassKg}  =  ${maxG} g/day`],
  ];
}

// The fat band: both ends a share of Eᵢₙ (20-35%, the IOM's Acceptable Macronutrient
// Distribution Range for adults) converted to grams at fat's fixed 9 kcal/g energy density —
// unlike fiber's two different bases, both k_min and k_max scale off the same Eᵢₙ, since
// that's how the AMDR itself is defined.
//
// Reads formula-ein directly, same reason readFiberFormula does: by the time
// renderFatFields runs (from renderFormulaSubstituted, after the calorie half of the sheet),
// that box already holds this render's Eᵢₙ — typed or solved, in every mode.
function readFatFormula() {
  const einKcal = formulaNumber('formula-ein');
  const pctMin = formulaNumber('formula-fat-pct-min');
  const pctMax = formulaNumber('formula-fat-pct-max');
  if (einKcal === null || pctMin === null || pctMax === null) return null;

  return {
    einKcal, pctMin, pctMax,
    minG: Math.round((pctMin / 100) * einKcal / KCAL_PER_G_FAT),
    maxG: Math.round((pctMax / 100) * einKcal / KCAL_PER_G_FAT),
  };
}

// The two fat boxes and their trace rows — same pairing and same dash-on-missing-input
// convention renderFiberFields uses.
function renderFatFields() {
  const fat = readFatFormula();

  if (fat === null) {
    ['formula-fat-min', 'formula-fat-max'].forEach((id) => setComputedField(id, '—'));
    return [];
  }

  const { einKcal, pctMin, pctMax, minG, maxG } = fat;
  setComputedField('formula-fat-min', String(minG));
  setComputedField('formula-fat-max', String(maxG));

  return [
    ['G_min', `(${pctMin}% × ${einKcal}) / ${KCAL_PER_G_FAT}  =  ${minG} g/day`],
    ['G_max', `(${pctMax}% × ${einKcal}) / ${KCAL_PER_G_FAT}  =  ${maxG} g/day`],
  ];
}

// The carb band: both ends a share of Eᵢₙ (45-65%, the IOM's Acceptable Macronutrient
// Distribution Range for adults) converted to grams at carbohydrate's fixed 4 kcal/g energy
// density — same shape as readFatFormula, just the AMDR's other end and Atwater factor.
//
// Reads formula-ein directly, same reason readFatFormula does: by the time renderCarbFields
// runs (from renderFormulaSubstituted, after the calorie half of the sheet), that box
// already holds this render's Eᵢₙ — typed or solved, in every mode.
function readCarbFormula() {
  const einKcal = formulaNumber('formula-ein');
  const pctMin = formulaNumber('formula-carb-pct-min');
  const pctMax = formulaNumber('formula-carb-pct-max');
  if (einKcal === null || pctMin === null || pctMax === null) return null;

  return {
    einKcal, pctMin, pctMax,
    minG: Math.round((pctMin / 100) * einKcal / KCAL_PER_G_CARB),
    maxG: Math.round((pctMax / 100) * einKcal / KCAL_PER_G_CARB),
  };
}

// The two carb boxes and their trace rows — same pairing and same dash-on-missing-input
// convention renderFatFields uses.
function renderCarbFields() {
  const carb = readCarbFormula();

  if (carb === null) {
    ['formula-carb-min', 'formula-carb-max'].forEach((id) => setComputedField(id, '—'));
    return [];
  }

  const { einKcal, pctMin, pctMax, minG, maxG } = carb;
  setComputedField('formula-carb-min', String(minG));
  setComputedField('formula-carb-max', String(maxG));

  return [
    ['C_min', `(${pctMin}% × ${einKcal}) / ${KCAL_PER_G_CARB}  =  ${minG} g/day`],
    ['C_max', `(${pctMax}% × ${einKcal}) / ${KCAL_PER_G_CARB}  =  ${maxG} g/day`],
  ];
}

// m_musc, m_gly and the glycogen+water swing they imply, from whatever m, h and the four
// glycogen knobs currently read — or null when any of them is missing. Independent of
// "Solve for" like the protein band above: no calorie identity involves it, it's purely
// the explanation for why m and m̄ disagree day to day.
//
// LBM drives it rather than body mass directly, same reasoning Katch-McArdle and the
// protein band already use here: glycogen is stored in muscle (and the liver, which
// doesn't scale with a lifter's muscle mass at all), not in fat, so two people at the
// same body mass but different body composition don't carry the same glycogen store.
// But LBM alone overstates it: skeletal muscle is only about 40-50% of LBM — the rest is
// water, organs, skin and bone, none of which store meaningful glycogen — so applying a
// published muscle-TISSUE glycogen density (g/kg wet muscle) straight to LBM comes out
// roughly double. s cuts LBM down to that muscle share first, so g_musc can be the real
// muscle-tissue figure instead of a diluted per-LBM one.
function readGlycogenSwingFormula() {
  const bodyMassKg = formulaBodyMassKg();
  const heightCm = formulaNumber('formula-height');
  const sex = document.getElementById('formula-sex').value;
  const skeletalFrac = formulaNumber('formula-glycogen-skeletal-frac');
  const gPerKgMuscle = formulaNumber('formula-glycogen-per-kg-muscle');
  const liverG = formulaNumber('formula-glycogen-liver');
  const waterRatio = formulaNumber('formula-glycogen-water-ratio');
  if (bodyMassKg === null || heightCm === null || skeletalFrac === null || gPerKgMuscle === null
    || liverG === null || waterRatio === null) return null;

  const rawLbm = boerLeanBodyMassKg(bodyMassKg, heightCm, sex);
  if (!Number.isFinite(rawLbm) || rawLbm <= 0) return null;
  // Rounded to 0.1 kg before it's used further, same as readProteinFormula — otherwise
  // the trace's `s × LBM = m_musc` line would show a rounded LBM that doesn't actually
  // multiply out to the muscle mass figure beside it.
  const lbmKg = Math.round(rawLbm * 10) / 10;
  // s is a share of LBM, not of m̄: it's a fat-free-mass ratio (skeletal muscle vs. the
  // rest of LBM), and m̄ still carries the fat LBM has already had stripped out.
  const muscleKg = Math.round((lbmKg * (skeletalFrac / 100)) * 10) / 10;
  if (muscleKg <= 0) return null;

  const glycogenG = Math.round(gPerKgMuscle * muscleKg + liverG);
  return {
    lbmKg, skeletalFrac, muscleKg, gPerKgMuscle, liverG, glycogenG,
    waterRatio, swingKg: Math.round((glycogenG * (1 + waterRatio)) / 100) / 10,
  };
}

// The m_musc, m_gly and ΔM_gly boxes and their trace rows — always as a pair per box,
// same rule every other computed field here follows. A dash in all three when an input
// is missing.
function renderGlycogenSwingField() {
  const swing = readGlycogenSwingFormula();
  if (swing === null) {
    ['formula-glycogen-muscle', 'formula-glycogen-g', 'formula-glycogen-swing'].forEach((id) => setComputedField(id, '—'));
    return [];
  }

  const { lbmKg, skeletalFrac, muscleKg, gPerKgMuscle, liverG, glycogenG, waterRatio, swingKg } = swing;
  setComputedField('formula-glycogen-muscle', String(muscleKg));
  setComputedField('formula-glycogen-g', String(glycogenG));
  setComputedField('formula-glycogen-swing', String(swingKg));
  return [
    ['m_musc', `${skeletalFrac}% × ${lbmKg}  =  ${muscleKg} kg`],
    ['m_gly', `${gPerKgMuscle} × ${muscleKg} + ${liverG}  =  ${glycogenG} g`],
    ['ΔM_gly', `${glycogenG} × (1 + ${waterRatio}) / 1000  =  ${swingKg} kg`],
  ];
}

function syncTargetMassFromBmi() {
  if (!targetBmiIsTyped()) return;
  const bmi = formulaNumber('formula-target-bmi');
  const heightCm = formulaNumber('formula-height');
  if (bmi === null || heightCm === null || heightCm <= 0) return;
  document.getElementById('formula-target').value = String(bodyMassKgFromBmi(bmi, heightCm));
}

function renderTargetBmiField() {
  const targetKg = formulaNumber('formula-target');
  const heightCm = formulaNumber('formula-height');
  const el = document.getElementById('formula-target-bmi');
  const typed = targetBmiIsTyped();

  if (targetKg === null || heightCm === null || heightCm <= 0) {
    if (!typed) setComputedField('formula-target-bmi', '');
    el.classList.remove('formula-out-of-band');
    return [];
  }

  const bmi = computeBmi(targetKg, heightCm);
  if (!typed) setComputedField('formula-target-bmi', String(bmi));
  const verdict = bmiVerdict(bmi);
  el.classList.toggle('formula-out-of-band', verdict.outside);
  return [['BMI_g', `${targetKg} / (${heightCm / 100})²  =  ${bmi} kg/m² — ${verdict.text}`]];
}

function syncWeeklyLossFromPct() {
  if (!weeklyLossPctIsTyped()) return;
  const kg = weeklyFatLossKgFromPct(formulaNumber('formula-weekly-loss-pct'), formulaBodyMassKg());
  if (kg === null) return;
  document.getElementById('formula-weekly-loss').value = String(kg);
}

function formulaJourneyIsProportional() {
  return currentSolveFor() === 'FIXED_PCT';
}

function formulaProjection(args, weeklyPct) {
  if (formulaJourneyIsProportional() && weeklyPct !== null && weeklyPct > 0) {
    return projectTargetDaysAtFixedPct({
      bodyMassKg: args.bodyMassKg, targetKg: args.targetKg, weeklyPct,
    });
  }
  return projectTargetDays(args);
}

function formulaDaysRow(proj, { bodyMassKg, targetKg, weeklyPct, bRounded, eqRounded }) {
  if (proj.status !== 'ok') return [];
  if (proj.journey === 'pct') {
    return [['t', `7 × ln(${bodyMassKg} / ${targetKg}) / −ln(1 − ${weeklyPct}/100)  =  ${Math.round(proj.days)} days`]];
  }
  return [['t', `(7700 / ${bRounded}) × ln[(${bodyMassKg} − ${eqRounded}) / (${targetKg} − ${eqRounded})]  =  ${Math.round(proj.days)} days`]];
}

function weeklyLossPctVerdict(pct) {
  if (pct > WEEKLY_FAT_LOSS_PCT_CEILING) {
    return { text: `above the ${WEEKLY_FAT_LOSS_PCT_CEILING}%/week ceiling`, over: true };
  }
  if (pct >= WEEKLY_FAT_LOSS_PCT_FLOOR) {
    return { text: `in the ${WEEKLY_FAT_LOSS_PCT_FLOOR}–${WEEKLY_FAT_LOSS_PCT_CEILING}%/week band`, over: false };
  }
  if (pct > 0) return { text: `under the ${WEEKLY_FAT_LOSS_PCT_FLOOR}%/week floor`, over: false };
  if (pct === 0) return { text: 'maintenance', over: false };
  return { text: 'a surplus, not a deficit', over: false };
}

function renderWeeklyLossPctField() {
  const bodyMassKg = formulaBodyMassKg();
  const weeklyLossKg = formulaNumber('formula-weekly-loss');
  const derivedPct = weeklyFatLossPct(weeklyLossKg, bodyMassKg);
  const pctIsTyped = weeklyLossPctIsTyped();
  const pct = weeklyLossPctInPlay(weeklyLossKg, bodyMassKg);
  const pctEl = document.getElementById('formula-weekly-loss-pct');

  if (pct === null) {
    if (!pctIsTyped) setComputedField('formula-weekly-loss-pct', '');
    pctEl.classList.remove('formula-pct-over');
    return [];
  }

  if (!pctIsTyped) setComputedField('formula-weekly-loss-pct', String(pct));
  const verdict = weeklyLossPctVerdict(pct);
  pctEl.classList.toggle('formula-pct-over', verdict.over);

  if (derivedPct === null) return [];
  return [['Δm%', `100 × ${weeklyLossKg} / ${bodyMassKg}  =  ${derivedPct} %/week — ${verdict.text}`]];
}

function formulaBmrRow(bmr, { bodyMassKg, heightCm, age, sex, formula }) {
  if (formula === 'katch') {
    return ['BMR', `370 + 21.6 × ${bmrLeanBodyMassKg(bodyMassKg, heightCm, sex)}  =  ${Math.round(bmr)} kcal/day — Katch-McArdle, from lean mass`];
  }
  const sigma = sex === 'male' ? '+ 5' : '− 161';
  return ['BMR', `10 × ${bodyMassKg} + 6.25 × ${heightCm} − 5 × ${age} ${sigma}  =  ${Math.round(bmr)} kcal/day`];
}

function formulaAffineRows(coefficients, { heightCm, age, sex, met, tau, kappa }) {
  const { a, b, tefDivisor: divisor, formula } = coefficients;
  const lbm = boerLeanBodyMassCoefficients(sex);
  const sigma = sex === 'male' ? '+ 5' : '− 161';
  const aTerms = formula === 'katch'
    ? `370 + 21.6 × (${lbm.perCm} × ${heightCm} − ${Math.abs(lbm.constant)})`
    : `6.25 × ${heightCm} − 5 × ${age} ${sigma}`;
  const bTerms = formula === 'katch'
    ? `21.6 × ${lbm.perKg} + ${met} × ${tau} × ${kappa} / 200`
    : `10 + ${met} × ${tau} × ${kappa} / 200`;
  const byDivisor = divisor === 1 ? '' : `, all / ${Math.round(divisor * 1000) / 1000}`;
  return [
    ['A', `${aTerms}${byDivisor}  =  ${Math.round(a)} kcal/day`],
    ['B', `${bTerms}${byDivisor}  =  ${Math.round(b * 100) / 100} kcal/day per kg`],
  ];
}

function formulaEinRows(coefficients, { bmr, activityKcal, deficit, einKcal }) {
  const divisor = coefficients.tefDivisor;
  const sum = `${Math.round(bmr)} + ${Math.round(activityKcal)} − ${Math.round(deficit)}`;
  if (divisor === 1) return [['Eᵢₙ', `${sum}  =  ${Math.round(einKcal)} kcal/day`]];
  return [['Eᵢₙ', `(${sum}) / ${Math.round(divisor * 1000) / 1000}  =  ${Math.round(einKcal)} kcal/day`]];
}

function formulaDeficitRows(coefficients, { bmr, activityKcal, einKcal, deficit }) {
  const divisor = coefficients.tefDivisor;
  const head = `${Math.round(bmr)} + ${Math.round(activityKcal)} − `;
  const intake = divisor === 1
    ? `${Math.round(einKcal)}`
    : `${Math.round(einKcal)}×${Math.round(divisor * 1000) / 1000}`;
  return [['D', `${head}${intake}  =  ${Math.round(deficit)} kcal/day`]];
}

function readAdaptationInputs() {
  return {
    pctPerWeek: formulaNumber('formula-adapt-per-week'),
    pctCap: formulaNumber('formula-adapt-cap'),
  };
}

// The TEF box and its trace row — reads formula-ein and f (formula-tef-pct) directly, same
// reason readFiberFormula/readFatFormula do: by the time this runs, formula-ein already
// holds this render's value in every mode, so this can't disagree with what the sheet just
// showed. Split out from renderCorrectionFields so it can sit right above Eᵢₙ rather than
// down with the adaptation pair.
function readTefFormula() {
  const einKcal = formulaNumber('formula-ein');
  const tefPct = formulaNumber('formula-tef-pct');
  if (einKcal === null || tefPct === null) return null;
  return { einKcal, tefPct, tefKcal: Math.round(einKcal * (tefPct / 100)) };
}

function renderTefField() {
  const tef = readTefFormula();

  if (tef === null) {
    setComputedField('formula-tef', '—');
    return [];
  }

  const { einKcal, tefPct, tefKcal } = tef;
  setComputedField('formula-tef', String(tefKcal));
  // Only when there is one: at f = 0 the identity is true and empty, and a row reading
  // "0 × 1163 = 0" is three columns of nothing.
  if (tefKcal <= 0) return [];
  return [['TEF', `${tefPct}% × ${einKcal}  =  ${tefKcal} kcal/day`]];
}

// The `δ` box and its trace rows (η, δ) — always as a pair with the box, so the number shown
// and the arithmetic behind it come from one call. `sleepInfo` is `{ weeklyFatLossKg,
// rawDeficit, deficit, sleepDeprivationEffectKcal, factor, pctPerHour, planSleepHours,
// sleepTargetHours }` — either calorieTargetDetail's own return (EIN/FIXED_PCT) or the
// equivalent object TAU builds locally from the same sleepAdjustedDeficitKcal call.
// `null` in TARGET_MASS and DELTA_M: both those modes reverse-solve D FROM a typed Eᵢₙ
// rather than building it from a target rate, so "how much bigger does D need to be" is a
// question that doesn't arise there.
function renderSleepDeprivationField(sleepInfo) {
  if (sleepInfo === null) {
    setComputedField('formula-deprivation-effect', '—');
    return [];
  }
  const { rawDeficit, sleepDeprivationEffectKcal, factor, pctPerHour, planSleepHours, sleepTargetHours } = sleepInfo;
  setComputedField('formula-deprivation-effect', String(sleepDeprivationEffectKcal));
  // Only when there is one: at s ≥ s_target the identity is true and empty, same reason
  // TEF's row above is skipped at f = 0.
  if (sleepDeprivationEffectKcal <= 0) return [];
  const factorRounded = Math.round(factor * 1000) / 1000;
  return [
    ['η', `1 − (${pctPerHour}/100) × max(0, ${sleepTargetHours} − ${planSleepHours})  =  ${factorRounded}`],
    ['δ', `${Math.round(rawDeficit)} / ${factorRounded} − ${Math.round(rawDeficit)}  =  ${sleepDeprivationEffectKcal} kcal/day`],
  ];
}

// The D row itself, in whichever form applies: the plain rate this sheet shows when sleep
// isn't costing anything, or that same rate divided by η when it is — so a reader can trace
// exactly where the extra kcal in δ above came from.
function formulaDeficitTraceLine(sleepInfo) {
  const raw = `${sleepInfo.weeklyFatLossKg} × 7700 / 7`;
  if (sleepInfo.sleepDeprivationEffectKcal <= 0) return `${raw}  =  ${Math.round(sleepInfo.deficit)} kcal/day`;
  const factorRounded = Math.round(sleepInfo.factor * 1000) / 1000;
  return `(${raw}) / ${factorRounded}  =  ${Math.round(sleepInfo.deficit)} kcal/day`;
}

function renderCorrectionFields(plan) {
  const bmrEl = 'formula-bmr-adapt';
  const plateauEl = 'formula-plateau-adapt';
  const { pctPerWeek, pctCap } = readAdaptationInputs();

  if (plan === null) {
    ['formula-bmr', 'formula-activity-kcal', 'formula-maintenance', 'formula-deficit', bmrEl, plateauEl].forEach((id) => setComputedField(id, '—'));
    renderSleepDeprivationField(null);
    return [];
  }

  const { intakeKcal, coefficients, bmr, activityKcal, deficit, days, journey } = plan;
  const rows = [];

  // Two figures with boxes but no trace rows of their own here — BMR and Eₐ already print
  // their substituted lines as rows of every mode, D prints its own in all but TARGET_MASS,
  // and M is just the BMR and Eₐ boxes added together in front of the reader.
  setComputedField('formula-bmr', String(Math.round(bmr)));
  setComputedField('formula-activity-kcal', String(Math.round(activityKcal)));
  setComputedField('formula-maintenance', String(Math.round(bmr + activityKcal)));
  setComputedField('formula-deficit', String(Math.round(deficit)));

  if (pctPerWeek === null || pctCap === null || bmr === null) {
    [bmrEl, plateauEl].forEach((id) => setComputedField(id, '—'));
    return rows;
  }

  const atCap = days === null;
  const fraction = atCap
    ? adaptationFraction(Infinity, pctPerWeek, pctCap)
    : adaptationFraction(days, pctPerWeek, pctCap);
  const adaptedBmr = bmr * (1 - fraction);
  const lostPct = Math.round(fraction * 1000) / 10;
  setComputedField(bmrEl, String(Math.round(adaptedBmr)));
  rows.push(['BMR_adp', `${Math.round(bmr)} × (1 − ${lostPct}/100)  =  ${Math.round(adaptedBmr)} kcal/day — ${atCap ? `at the ${pctCap}% ceiling` : `by day ${Math.round(days)}`}`]);

  if (journey === 'pct') {
    setComputedField(plateauEl, '—');
    rows.push(['m∞_adp', 'no plateau on a proportional journey, so no overshoot to report']);
    return rows;
  }

  const plateauKg = adaptedPlateauKg(intakeKcal, coefficients, fraction);
  const plainPlateauKg = (intakeKcal - coefficients.a) / coefficients.b;
  if (!Number.isFinite(plateauKg)) {
    setComputedField(plateauEl, '—');
    return rows;
  }

  const plateauRounded = Math.round(plateauKg * 10) / 10;
  const overshootKg = Math.round((plateauKg - plainPlateauKg) * 10) / 10;
  setComputedField(plateauEl, String(plateauRounded));
  rows.push(['m∞_adp', `(${Math.round(intakeKcal)} − ${Math.round(coefficients.aBmr * (1 - fraction) / coefficients.tefDivisor)}) / ${Math.round(((1 - fraction) * coefficients.bBmr + coefficients.activityPerKg) / coefficients.tefDivisor * 100) / 100}  =  ${plateauRounded} kg${overshootKg > 0 ? ` — ${overshootKg} kg above m∞, which is the usual overshoot` : ''}`]);
  return rows;
}

function renderFormulaPreview() {
  renderFormulaPreviewCore();
  renderMassTrajectoryChart();
  renderBalanceChart();
  renderCaloriesIntakeChart();
  renderActivityChart();
}

// Walks the sheet's own h2/h3/h4 headings (numbers themselves are CSS
// counters, never typed here) and builds the nav's nested list from them,
// so the contents list can never drift from the sections it lists.
function buildTableOfContents() {
  const nav = document.querySelector('.toc');
  if (!nav) return;

  const root = document.createElement('ul');
  let h2Ul = null;
  let h3Ul = null;

  document.querySelectorAll('.sheet h2[id], .sheet h3[id], .sheet h4[id]').forEach((heading) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${heading.id}`;
    a.textContent = heading.textContent;
    li.appendChild(a);

    if (heading.tagName === 'H2') {
      root.appendChild(li);
      h2Ul = null;
      h3Ul = null;
    } else if (heading.tagName === 'H3') {
      if (!h2Ul) {
        h2Ul = document.createElement('ul');
        root.lastElementChild.appendChild(h2Ul);
      }
      h2Ul.appendChild(li);
      h3Ul = null;
    } else if (heading.tagName === 'H4') {
      if (!h3Ul) {
        h3Ul = document.createElement('ul');
        h2Ul.lastElementChild.appendChild(h3Ul);
      }
      h3Ul.appendChild(li);
    }
  });

  nav.innerHTML = '';
  nav.appendChild(root);
}

// Below the wide-screen breakpoint the contents sidebar is a drawer: the
// floating Contents button opens it; a link, the backdrop, or Escape closes it.
function setupTableOfContentsDrawer() {
  const sidebar = document.getElementById('toc-sidebar');
  const toggle = document.querySelector('.toc-toggle');
  const backdrop = document.querySelector('.toc-backdrop');
  if (!sidebar || !toggle || !backdrop) return;

  const setOpen = (open) => {
    sidebar.classList.toggle('open', open);
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setOpen(false));
  sidebar.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
}
setupTableOfContentsDrawer();

// Samples the mass-over-time curve at day t: exponential decay to
// equilibrium under a fixed intake, or proportional decay under a fixed
// weekly percentage — the same two formulas eqns. (18) and (20) use.
// Days appended after arrival, at the desire mass, so every subplot's tail
// shows what maintenance looks like once the deficit that drove (a) is gone.
const MAINTENANCE_EXTENSION_DAYS = 14;

function massTrajectoryAtDay(inputs, t) {
  if (t > inputs.tTotal) return inputs.mg;
  if (inputs.mode === 'pct') {
    return inputs.m0 * Math.pow(1 - inputs.weeklyPct / 100, t / 7);
  }
  const { m0, equilibriumKg, b } = inputs;
  return equilibriumKg + (m0 - equilibriumKg) * Math.exp((-b * t) / GENERIC_KCAL_PER_KG_FAT);
}

// The BMR/activity/TEF inputs the balance, calories-intake, and activity
// subplots need to recompute maintenance at any day's mass — read
// independently of which journey mode (intake vs weekly %) is driving the
// mass curve itself, since these sheet fields exist regardless of mode. Null
// when the sheet doesn't have enough typed to know them (e.g. a weekly-%
// journey that never needed Eᵢₙ).
function readMaintenanceCoefficients() {
  const heightCm = formulaNumber('formula-height');
  const einKcal = formulaNumber('formula-ein');
  const age = formulaNumber('formula-age');
  const sex = document.getElementById('formula-sex').value;
  const met = formulaNumber('formula-met');
  const tau = formulaNumber('formula-activity-min');
  const kappa = formulaNumber('formula-met-o2');
  const tefPct = formulaNumber('formula-tef-pct');
  const formula = currentBmrFormula();
  if (heightCm === null || einKcal === null || met === null || tau === null
    || kappa === null || tefPct === null) return null;
  if (formula !== 'katch' && age === null) return null;

  const coefficients = maintenanceAffineCoefficients({
    heightCm, age: age ?? 0, sex, met, tau, kappa, formula, tef: tefPct,
  });
  if (!Number.isFinite(coefficients.a) || !Number.isFinite(coefficients.b)) return null;

  const sleepEffect = formulaNumber('formula-deprivation-effect');
  return {
    einKcal,
    tau,
    coefficients,
    sleepDeprivationKcal: sleepEffect !== null && sleepEffect > 0 ? sleepEffect : 0,
  };
}

// Maintenance (BMR + activity burn) at mass `mass`, from the affine
// coefficients above — M(m) = A_bmr + (B_bmr + activity/kg) × m.
function maintenanceKcalAtMass(coefficients, mass) {
  return coefficients.aBmr + (coefficients.bBmr + coefficients.activityPerKg) * mass;
}

// The dietary-requirement bands' own coefficients (§1.5), read once — same
// fields renderProteinFields/renderFiberFields/renderFatFields/
// renderCarbFields already read, so re-derived here rather than duplicated
// with different numbers. Ein isn't baked in here: it's passed into
// macroBandsAtMass separately, since past arrival Eᵢₙ itself jumps to the
// new maintenance level, and fat/carb/fiber's floor need to follow it.
function readMacroBandCoefficients() {
  const heightCm = formulaNumber('formula-height');
  const sex = document.getElementById('formula-sex').value;
  const proteinPerKgMin = formulaNumber('formula-protein-per-kg-min');
  const proteinPerKgMax = formulaNumber('formula-protein-per-kg-max');
  const fiberPerKcalMin = formulaNumber('formula-fiber-per-1000kcal-min');
  const fiberPerKgMax = formulaNumber('formula-fiber-per-kg-max');
  const fatPctMin = formulaNumber('formula-fat-pct-min');
  const fatPctMax = formulaNumber('formula-fat-pct-max');
  const carbPctMin = formulaNumber('formula-carb-pct-min');
  const carbPctMax = formulaNumber('formula-carb-pct-max');
  if ([heightCm, proteinPerKgMin, proteinPerKgMax, fiberPerKcalMin, fiberPerKgMax,
    fatPctMin, fatPctMax, carbPctMin, carbPctMax].some((v) => v === null)) return null;

  return {
    heightCm,
    sex,
    proteinPerKgMin: Math.min(proteinPerKgMin, proteinPerKgMax),
    proteinPerKgMax: Math.max(proteinPerKgMin, proteinPerKgMax),
    fiberPerKcalMin,
    fiberPerKgMax,
    fatPctMin,
    fatPctMax,
    carbPctMin,
    carbPctMax,
  };
}

// The four macro bands at one day's mass and that day's own Eᵢₙ — protein's
// both ends and fiber's ceiling move with mass (lean mass and body weight
// respectively); fiber's floor, fat and carb move with Eᵢₙ instead, which is
// constant pre-arrival and a step up to the maintenance level after it.
function macroBandsAtMass(macro, mass, einKcal) {
  const lbmKg = boerLeanBodyMassKg(mass, macro.heightCm, macro.sex);
  return {
    protein: { minG: macro.proteinPerKgMin * lbmKg, maxG: macro.proteinPerKgMax * lbmKg },
    fiber: { minG: macro.fiberPerKcalMin * (einKcal / 1000), maxG: macro.fiberPerKgMax * mass },
    fat: { minG: ((macro.fatPctMin / 100) * einKcal) / KCAL_PER_G_FAT, maxG: ((macro.fatPctMax / 100) * einKcal) / KCAL_PER_G_FAT },
    carb: { minG: ((macro.carbPctMin / 100) * einKcal) / KCAL_PER_G_CARB, maxG: ((macro.carbPctMax / 100) * einKcal) / KCAL_PER_G_CARB },
  };
}

// Fixed hues for the four macro bands — kept apart from Eᵢₙ/BMR's
// accent/ink-soft above them in the same subplot, and from the other three
// subplots' own accent colors, since all four can be on screen together.
const MACRO_BAND_COLORS = {
  protein: '#b91c1c', fiber: '#15803d', fat: '#b5680a', carb: '#7c3aed',
};
const MACRO_BAND_ORDER = ['protein', 'fiber', 'fat', 'carb'];
const MACRO_BAND_LABELS = {
  protein: 'P_min–P_max (desired daily protein)',
  fiber: 'F_min–F_max (desired daily dietary fiber)',
  fat: 'G_min–G_max (desired daily fat)',
  carb: 'C_min–C_max (desired daily carbohydrate)',
};

// Reads the sheet's OWN already-computed fields — m̄, m_d, t, the arrival
// date — rather than re-deriving a solve-for-mode-specific result, so the
// chart can never disagree with the numbers printed above it.
function readMassTrajectoryInputs() {
  const m0 = formulaNumber('formula-body-mass-smooth');
  const mg = formulaNumber('formula-target');
  const heightCm = formulaNumber('formula-height');
  const etaIso = document.getElementById('formula-eta').value;
  const daysStr = document.getElementById('formula-days').value.trim();
  const tTotal = daysStr === '' ? NaN : Number(daysStr);

  if (m0 === null || mg === null || heightCm === null || !etaIso
    || !Number.isFinite(tTotal) || tTotal <= 0) {
    return null;
  }

  const curve = readMaintenanceCoefficients();
  const totalDays = tTotal + MAINTENANCE_EXTENSION_DAYS;

  if (formulaJourneyIsProportional()) {
    const weeklyPct = formulaNumber('formula-weekly-loss-pct');
    if (weeklyPct === null || weeklyPct <= 0) return null;
    return {
      m0, mg, heightCm, etaIso, tTotal, totalDays, mode: 'pct', weeklyPct, curve,
    };
  }

  if (!curve || curve.coefficients.b === 0) return null;
  const equilibriumKg = (curve.einKcal - curve.coefficients.a) / curve.coefficients.b;

  return {
    m0, mg, heightCm, etaIso, tTotal, totalDays, mode: 'intake', equilibriumKg, b: curve.coefficients.b, curve,
  };
}

// Which chart layers the legend has toggled on — module-level so a click
// survives the next re-render (every input change rebuilds the chart from
// scratch, so this can't live as local state inside the render function).
const massTrajectoryLayerVisible = {
  trend: true, bmiband: true, swing: true, today: true, desire: true,
};

// A 5-pointed star centered at (cx, cy) — used for the Desire marker so it
// reads as a distinct shape from the Today circle, not just a second dot.
function starPathD(cx, cy, outerR, innerR) {
  const points = [];
  const spikes = 5;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes; i += 1) {
    points.push(`${(cx + Math.cos(rot) * outerR).toFixed(1)},${(cy + Math.sin(rot) * outerR).toFixed(1)}`);
    rot += step;
    points.push(`${(cx + Math.cos(rot) * innerR).toFixed(1)},${(cy + Math.sin(rot) * innerR).toFixed(1)}`);
    rot += step;
  }
  return `M ${points.join(' L ')} Z`;
}

// A small SVG line chart: body mass (left axis) from m̄ today to m_d on the
// estimated arrival date, with BMI as a right-hand axis that is just that
// same mass rescaled by the fixed (1/height²) factor — one physical
// quantity in two units, not a second independent series.
function renderMassTrajectoryChart() {
  const el = document.getElementById('mass-trajectory-chart');
  const inputs = readMassTrajectoryInputs();
  if (!inputs) {
    el.innerHTML = '';
    return;
  }

  const { m0, mg, heightCm, etaIso, tTotal, totalDays } = inputs;
  const toBmi = (kg) => kg / ((heightCm / 100) ** 2);

  const steps = 40;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (totalDays * i) / steps;
    points.push({ t, mass: massTrajectoryAtDay(inputs, t) });
  }

  const masses = points.map((p) => p.mass);
  const massMax = Math.max(...masses, m0, mg);
  // The axis starts at 0 kg; the top is the next round multiple of the tick step.
  const yMin = 0;
  const yStep = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(massMax / 8))).find((s) => massMax / s <= 8);
  let yMax = Math.ceil(massMax / yStep) * yStep;
  if (yMax - massMax < yStep * 0.1) yMax += yStep;

  const width = 680;
  const height = 260;
  const marginLeft = 46;
  const marginRight = 46;
  const marginTop = 16;
  const marginBottom = 34;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const xAt = (t) => marginLeft + (plotW * t) / totalDays;
  const yAt = (mass) => marginTop + plotH - (plotH * (mass - yMin)) / (yMax - yMin);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.t).toFixed(1)},${yAt(p.mass).toFixed(1)}`).join(' ');

  const yTicks = [];
  for (let mass = yMin; mass <= yMax + yStep / 2; mass += yStep) yTicks.push(mass);

  const startDate = new Date();
  const endDate = parseIsoDateUTC(etaIso);
  const fmtDate = (date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const xTicks = dateAxisTicks(totalDays, startDate);

  // The WHO healthy-BMI band (18.5-24.9), converted to this profile's mass —
  // same conversion as the right axis, shown as a shaded reference zone
  // rather than left implicit.
  const massAtBmi = (bmi) => bmi * ((heightCm / 100) ** 2);
  const bandTopMass = Math.min(massAtBmi(BMI_HEALTHY_MAX), yMax);
  const bandBottomMass = Math.max(massAtBmi(BMI_HEALTHY_MIN), yMin);
  const bandVisible = bandTopMass > yMin && bandBottomMass < yMax;

  const svgParts = [];
  svgParts.push(`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Body mass trajectory from ${m0} kg today to ${mg} kg by ${etaIso}">`);

  // Healthy-BMI reference band, drawn first so gridlines and the curve sit on top.
  if (bandVisible && massTrajectoryLayerVisible.bmiband) {
    const bandY1 = yAt(bandTopMass);
    const bandY2 = yAt(bandBottomMass);
    svgParts.push(`<rect x="${marginLeft}" y="${bandY1.toFixed(1)}" width="${plotW}" height="${(bandY2 - bandY1).toFixed(1)}" fill="var(--teal)" fill-opacity="0.08"></rect>`);
  }

  // Gridlines + left (mass) / right (BMI) axis ticks — the right axis reuses
  // the same y pixel positions, just labelled with the BMI that mass works
  // out to at this height, so it's a unit conversion, not a second scale.
  yTicks.forEach((mass) => {
    const y = yAt(mass);
    svgParts.push(`<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${width - marginRight}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"></line>`);
    svgParts.push(`<text x="${marginLeft - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--ink-faint)">${Math.round(mass)}</text>`);
    svgParts.push(`<text x="${width - marginRight + 8}" y="${(y + 3).toFixed(1)}" text-anchor="start" font-size="10.5" fill="var(--ink-faint)">${(Math.round(toBmi(mass) * 2) / 2).toFixed(1)}</text>`);
  });

  xTicks.forEach(({ t, label }) => {
    const x = xAt(t);
    svgParts.push(`<line x1="${x.toFixed(1)}" y1="${marginTop}" x2="${x.toFixed(1)}" y2="${height - marginBottom}" stroke="var(--line)" stroke-width="1"></line>`);
    svgParts.push(`<text x="${x.toFixed(1)}" y="${height - marginBottom + 18}" text-anchor="middle" font-size="10.5" fill="var(--ink-faint)">${label}</text>`);
  });

  // The axis spines themselves — drawn after the gridlines/band so they read
  // as the frame, not just another gridline.
  svgParts.push(`<line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${height - marginBottom}" stroke="var(--ink-faint)" stroke-width="1.4"></line>`);
  svgParts.push(`<line x1="${width - marginRight}" y1="${marginTop}" x2="${width - marginRight}" y2="${height - marginBottom}" stroke="var(--ink-faint)" stroke-width="1.4"></line>`);
  svgParts.push(`<line x1="${marginLeft}" y1="${height - marginBottom}" x2="${width - marginRight}" y2="${height - marginBottom}" stroke="var(--ink-faint)" stroke-width="1.4"></line>`);
  // Arrowhead on the x-axis — time only runs one way here, into the future.
  {
    const axisY = height - marginBottom;
    const tipX = width - marginRight + 6;
    svgParts.push(`<path d="M ${tipX},${axisY} L ${(tipX - 6).toFixed(1)},${(axisY - 3.5).toFixed(1)} L ${(tipX - 6).toFixed(1)},${(axisY + 3.5).toFixed(1)} Z" fill="var(--ink)"></path>`);
  }

  svgParts.push(`<text x="${marginLeft}" y="12" font-size="10.5" font-weight="600" fill="var(--ink-faint)">kg</text>`);
  svgParts.push(`<text x="${width - marginRight}" y="12" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--ink-faint)">kg/m²</text>`);

  // The arrival boundary — everything past it is the maintenance tail, held
  // flat at m_d with the deficit gone, not more of the same decay.
  svgParts.push(`<line x1="${xAt(tTotal).toFixed(1)}" y1="${marginTop}" x2="${xAt(tTotal).toFixed(1)}" y2="${height - marginBottom}" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="2 2"></line>`);

  // The glycogen + water swing (ΔM_gly) as a band straddling the curve — the
  // day-to-day scale noise it alone can account for, not real fat-mass change.
  const swingKg = formulaNumber('formula-glycogen-swing');
  if (swingKg !== null && swingKg > 0 && massTrajectoryLayerVisible.swing) {
    const half = swingKg / 2;
    const upperPts = points.map((p) => `${xAt(p.t).toFixed(1)},${yAt(p.mass + half).toFixed(1)}`);
    const lowerPts = points.slice().reverse().map((p) => `${xAt(p.t).toFixed(1)},${yAt(p.mass - half).toFixed(1)}`);
    const bandD = `M ${upperPts.join(' L ')} L ${lowerPts.join(' L ')} Z`;
    svgParts.push(`<path d="${bandD}" fill="var(--amber)" fill-opacity="0.18" stroke="none"></path>`);
  }

  // The mass curve itself, m̄ → m_d — just the line, no fill beneath it.
  if (massTrajectoryLayerVisible.trend) {
    svgParts.push(`<path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"></path>`);
  }

  // Today — a circle — and Desire — a star — are distinct shapes as well as
  // distinct legend entries, so the two remain tellable apart without color.
  if (massTrajectoryLayerVisible.today) {
    svgParts.push(`<circle cx="${xAt(0).toFixed(1)}" cy="${yAt(m0).toFixed(1)}" r="4.5" fill="var(--bg-alt)" stroke="var(--accent)" stroke-width="2.5"></circle>`);
    svgParts.push(`<text x="${xAt(0).toFixed(1)}" y="${(yAt(m0) - 12).toFixed(1)}" text-anchor="start" font-size="11" font-weight="600" fill="var(--ink)">Today · ${m0} kg</text>`);
  }
  if (massTrajectoryLayerVisible.desire) {
    svgParts.push(`<path d="${starPathD(xAt(tTotal), yAt(mg), 7, 3)}" fill="var(--accent)" stroke="var(--bg-alt)" stroke-width="1.5"></path>`);
    svgParts.push(`<text x="${xAt(tTotal).toFixed(1)}" y="${(yAt(mg) - 12).toFixed(1)}" text-anchor="end" font-size="11" font-weight="600" fill="var(--ink)">Desire · ${mg} kg</text>`);
  }

  svgParts.push('<g class="mtc-hover" style="display:none">'
    + '<line class="mtc-hover-line" y1="' + marginTop + '" y2="' + (height - marginBottom) + '" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="3 3"></line>'
    + '<circle class="mtc-hover-dot" r="4" fill="var(--accent)"></circle>'
    + '</g>');

  svgParts.push('</svg>');
  svgParts.push('<div class="mtc-tooltip" hidden></div>');

  // The color key lives below the plot as real HTML, never drawn inside the
  // SVG itself, so it never overlaps the curve or the bands it explains.
  // Each item is clickable — it toggles that layer's entry in
  // massTrajectoryLayerVisible and re-renders, same as any other input here.
  const legendItems = [
    { key: 'trend', color: 'var(--accent)', label: 'm (body mass)', shape: 'line' },
    { key: 'today', color: 'var(--accent)', label: `m̄ (7-day rolling average body mass) ${m0} kg`, shape: 'circle' },
    { key: 'desire', color: 'var(--accent)', label: `m_d (healthy body mass) ${mg} kg`, shape: 'star' },
  ];
  if (bandVisible) legendItems.push({ key: 'bmiband', color: 'var(--teal)', label: 'BMI_g (healthy body mass index) 18.5–24.9 kg/m²', shape: 'swatch' });
  if (swingKg !== null && swingKg > 0) legendItems.push({ key: 'swing', color: 'var(--amber)', label: `ΔM_gly (glycogen + water swing) ±${(swingKg / 2).toFixed(1)} kg`, shape: 'swatch' });
  const legendMarkup = (item) => {
    if (item.shape === 'circle') return `<svg class="mtc-legend-mark" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4" fill="var(--bg-alt)" stroke="${item.color}" stroke-width="2.2"></circle></svg>`;
    if (item.shape === 'star') return `<svg class="mtc-legend-mark" viewBox="0 0 14 14"><path d="${starPathD(7, 7, 6, 2.6)}" fill="${item.color}"></path></svg>`;
    if (item.shape === 'line') return `<svg class="mtc-legend-mark" viewBox="0 0 14 14"><line x1="1" y1="7" x2="13" y2="7" stroke="${item.color}" stroke-width="2.2" stroke-linecap="round"></line></svg>`;
    return `<span class="mtc-legend-swatch" style="background:${item.color}"></span>`;
  };
  svgParts.push(`<div class="mtc-legend">${legendItems.map((item) => `<button type="button" class="mtc-legend-item${massTrajectoryLayerVisible[item.key] ? '' : ' mtc-legend-item-off'}" data-layer="${item.key}">${legendMarkup(item)}${item.label}</button>`).join('')}</div>`);

  el.innerHTML = svgParts.join('');

  el.querySelectorAll('.mtc-legend-item').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.layer;
      massTrajectoryLayerVisible[key] = !massTrajectoryLayerVisible[key];
      renderMassTrajectoryChart();
    });
  });

  registerSubplotHover('mass-trajectory-chart', (rawT) => {
    const t = Math.min(totalDays, Math.max(0, rawT));
    const mass = massTrajectoryAtDay(inputs, t);
    const date = new Date(startDate);
    date.setDate(date.getDate() + Math.round(t));
    const lines = [fmtDate(date), `m (body mass) ${mass.toFixed(1)} kg`, `BMI (body mass index) ${toBmi(mass).toFixed(1)} kg/m²`];
    if (t > tTotal) lines.push('(maintenance tail, past arrival)');
    return { x: xAt(t), y: yAt(mass), text: lines.join('\n') };
  });

  const svg = el.querySelector('svg');
  svg.addEventListener('mousemove', (event) => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const t = ((svgX - marginLeft) / plotW) * totalDays;
    broadcastSubplotHover(t);
  });
  svg.addEventListener('mouseleave', hideAllSubplotHovers);
}

// Date ticks for the three subplots below the mass chart — same tick-count
// rule as the mass chart's own x-axis, so a day lines up at the same pixel
// column in every subplot.
// The calendar date at day t, formatted the same way the mass chart's own
// x-axis and tooltip already format it — shared so every subplot's hover
// leads with the same date line.
function dayDateLabel(t) {
  const date = new Date();
  date.setDate(date.getDate() + Math.round(t));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dateAxisTicks(tTotal, startDate = new Date()) {
  const fmtDate = (date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const xTickCount = Math.min(5, Math.max(2, Math.round(tTotal / 14)));
  const xTicks = [];
  for (let i = 0; i <= xTickCount; i += 1) {
    const t = (tTotal * i) / xTickCount;
    const date = new Date(startDate);
    date.setDate(date.getDate() + Math.round(t));
    xTicks.push({ t, label: fmtDate(date) });
  }
  return xTicks;
}

// A linked cursor across all four panels of Fig. 1: hovering any one of them
// broadcasts the day to every panel's own updater, so each draws its OWN
// crosshair/tooltip for that same date — a shared x position read across
// four different y series, rather than four independent hovers.
const SUBPLOT_HOVER_IDS = ['mass-trajectory-chart', 'balance-chart', 'calories-intake-chart', 'activity-chart'];
const subplotHoverUpdaters = {};

// Registers (or replaces, on re-render) chart `id`'s updater — given a day
// t, returns where its OWN crosshair/dot/tooltip belong. Kept per-id rather
// than per-DOM-node since each render() replaces its container's innerHTML,
// invalidating any node reference taken before this call.
function registerSubplotHover(id, sampleAtDay) {
  subplotHoverUpdaters[id] = sampleAtDay;
}

function broadcastSubplotHover(t) {
  SUBPLOT_HOVER_IDS.forEach((id) => {
    const el = document.getElementById(id);
    const updater = subplotHoverUpdaters[id];
    if (!el || !updater) return;
    const hoverGroup = el.querySelector('.mtc-hover');
    const hoverLine = el.querySelector('.mtc-hover-line');
    const hoverDot = el.querySelector('.mtc-hover-dot');
    const tooltip = el.querySelector('.mtc-tooltip');
    if (!hoverGroup) return;
    const { x, y, text } = updater(t);
    hoverLine.setAttribute('x1', x.toFixed(1));
    hoverLine.setAttribute('x2', x.toFixed(1));
    hoverDot.setAttribute('cx', x.toFixed(1));
    hoverDot.setAttribute('cy', y.toFixed(1));
    hoverGroup.style.display = '';
    tooltip.hidden = false;
    tooltip.textContent = text;
    // Anchored from whichever side has room, rather than always positioned
    // via `left` + a transform: a browser sizes an auto-width absolutely
    // positioned box using the space between its set side and the far edge
    // of its container, regardless of any transform — so a box pinned near
    // the right edge via `left: 95%` gets squeezed into that last 5% and
    // THEN translated, it doesn't get to be full-size first. Anchoring from
    // `right` instead when we're on the right side gives it the whole
    // container to size against.
    const pct = Math.max(0, Math.min(100, (x / SUBPLOT_WIDTH) * 100));
    tooltip.style.transform = 'none';
    if (pct > 65) {
      tooltip.style.left = 'auto';
      tooltip.style.right = `${(100 - pct).toFixed(2)}%`;
    } else if (pct < 35) {
      tooltip.style.left = `${pct.toFixed(2)}%`;
      tooltip.style.right = 'auto';
    } else {
      tooltip.style.left = `${pct.toFixed(2)}%`;
      tooltip.style.right = 'auto';
      tooltip.style.transform = 'translateX(-50%)';
    }
  });
}

function hideAllSubplotHovers() {
  SUBPLOT_HOVER_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const hoverGroup = el.querySelector('.mtc-hover');
    const tooltip = el.querySelector('.mtc-tooltip');
    if (hoverGroup) hoverGroup.style.display = 'none';
    if (tooltip) tooltip.hidden = true;
  });
}

// Shared crosshair/tooltip wiring for the three subplot SVGs below the mass
// chart — registers this panel's own updater, then broadcasts whatever day
// the mouse is over to every panel via broadcastSubplotHover.
function attachSubplotHover(el, { xAt, plotW, marginLeft, tTotal, sample }) {
  const svg = el.querySelector('svg');
  if (!svg) return;

  registerSubplotHover(el.id, (t) => {
    const clamped = Math.min(tTotal, Math.max(0, t));
    const { y, text } = sample(clamped);
    return { x: xAt(clamped), y, text };
  });

  svg.addEventListener('mousemove', (event) => {
    const rect = svg.getBoundingClientRect();
    const width = svg.viewBox.baseVal.width;
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const t = ((svgX - marginLeft) / plotW) * tTotal;
    broadcastSubplotHover(t);
  });
  svg.addEventListener('mouseleave', hideAllSubplotHovers);
}

// Common frame (gridlines, axis spines, date ticks) shared by the three
// kcal-scale subplots below the mass chart. Margins match the mass chart's
// own margins exactly, so every subplot's day-0 and day-t columns fall on
// the same pixel x as the chart above it.
const SUBPLOT_WIDTH = 680;
const SUBPLOT_HEIGHT = 200;
const SUBPLOT_MARGIN_LEFT = 46;
const SUBPLOT_MARGIN_RIGHT = 46;
const SUBPLOT_MARGIN_TOP = 16;
const SUBPLOT_MARGIN_BOTTOM = 34;

function subplotFrameSvgParts({
  tTotal, yMin, yMax, yUnitLabel, xAt, yAt, rightUnitLabel, rightConvert, yStep,
}) {
  const parts = [];
  // With yStep, ticks sit on its round multiples; without, the range splits into 4.
  const yTickCount = yStep ? Math.round((yMax - yMin) / yStep) : 4;
  for (let i = 0; i <= yTickCount; i += 1) {
    const v = yStep ? yMin + yStep * i : yMin + ((yMax - yMin) * i) / yTickCount;
    const y = yAt(v);
    parts.push(`<line x1="${SUBPLOT_MARGIN_LEFT}" y1="${y.toFixed(1)}" x2="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"></line>`);
    parts.push(`<text x="${SUBPLOT_MARGIN_LEFT - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--ink-faint)">${Math.round(v)}</text>`);
    // Right axis, when given — the same y-pixel row relabelled in another
    // unit via a fixed conversion factor, same trick as (a)'s BMI axis,
    // rather than a second independent scale.
    if (rightConvert) {
      parts.push(`<text x="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT + 8}" y="${(y + 3).toFixed(1)}" text-anchor="start" font-size="10.5" fill="var(--ink-faint)">${rightConvert(v)}</text>`);
    }
  }
  dateAxisTicks(tTotal).forEach(({ t, label }) => {
    const x = xAt(t);
    parts.push(`<line x1="${x.toFixed(1)}" y1="${SUBPLOT_MARGIN_TOP}" x2="${x.toFixed(1)}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--line)" stroke-width="1"></line>`);
    parts.push(`<text x="${x.toFixed(1)}" y="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM + 18}" text-anchor="middle" font-size="10.5" fill="var(--ink-faint)">${label}</text>`);
  });
  parts.push(`<line x1="${SUBPLOT_MARGIN_LEFT}" y1="${SUBPLOT_MARGIN_TOP}" x2="${SUBPLOT_MARGIN_LEFT}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--ink-faint)" stroke-width="1.4"></line>`);
  parts.push(`<line x1="${SUBPLOT_MARGIN_LEFT}" y1="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" x2="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--ink-faint)" stroke-width="1.4"></line>`);
  parts.push(`<text x="${SUBPLOT_MARGIN_LEFT}" y="12" font-size="10.5" font-weight="600" fill="var(--ink-faint)">${yUnitLabel}</text>`);
  if (rightUnitLabel) {
    parts.push(`<line x1="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y1="${SUBPLOT_MARGIN_TOP}" x2="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--ink-faint)" stroke-width="1.4"></line>`);
    parts.push(`<text x="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y="12" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--ink-faint)">${rightUnitLabel}</text>`);
  }
  return parts;
}

function subplotHoverSvgParts(dotColor) {
  return '<g class="mtc-hover" style="display:none">'
    + `<line class="mtc-hover-line" y1="${SUBPLOT_MARGIN_TOP}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="3 3"></line>`
    + `<circle class="mtc-hover-dot" r="4" fill="${dotColor}"></circle>`
    + '</g>';
}

function legendLineMark(color, dashed) {
  return `<svg class="mtc-legend-mark" viewBox="0 0 14 14"><line x1="1" y1="7" x2="13" y2="7" stroke="${color}" stroke-width="2.2"${dashed ? ' stroke-dasharray="3 2"' : ''} stroke-linecap="round"></line></svg>`;
}

// Which layer of the balance subplot is toggled on — same pattern as
// massTrajectoryLayerVisible above.
const balanceLayerVisible = {
  deficit: true, maintenance: true, bmr: true, activity: true, intake: true, tef: true, sleep: true,
};

// Subplot (b): the daily energy balance (deficit/surplus) that drives the
// mass curve above, decomposed into maintenance, intake, digestion (TEF),
// and the sleep-deprivation penalty already computed elsewhere on the sheet
// — recomputed at each day's own mass, since maintenance falls as mass does.
function renderBalanceChart() {
  const el = document.getElementById('balance-chart');
  const inputs = readMassTrajectoryInputs();
  if (!inputs || !inputs.curve) { el.innerHTML = ''; return; }

  const { tTotal, totalDays, mg, curve } = inputs;
  const { einKcal, coefficients, sleepDeprivationKcal } = curve;
  const divisor = coefficients.tefDivisor;
  // Past arrival, Eᵢₙ steps up to whatever holds mass at m_d exactly — the
  // zero-deficit intake at the desire mass — rather than staying at the
  // deficit-bearing value that got the trajectory there.
  const maintenanceEin = maintenanceKcalAtMass(coefficients, mg) / divisor;

  const steps = 40;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (totalDays * i) / steps;
    const einAtT = t > tTotal ? maintenanceEin : einKcal;
    const mass = massTrajectoryAtDay(inputs, t);
    const bmr = coefficients.aBmr + coefficients.bBmr * mass;
    const activityKcal = coefficients.activityPerKg * mass;
    const maintenance = bmr + activityKcal;
    const tefAtT = einAtT * (1 - divisor);
    const deficit = maintenance - einAtT * divisor;
    points.push({
      // Signed by physical direction — leaves the body (BMR, activity,
      // maintenance, TEF, and net balance while in a real deficit) negative,
      // enters it (intake, and net balance while in a surplus) positive.
      t,
      bmrSigned: -bmr,
      activitySigned: -activityKcal,
      maintenanceSigned: -maintenance,
      einAtT,
      tefSigned: -tefAtT,
      deficit,
      deficitSigned: -deficit,
    });
  }

  const values = [
    ...points.map((p) => p.bmrSigned), ...points.map((p) => p.activitySigned),
    ...points.map((p) => p.maintenanceSigned), ...points.map((p) => p.tefSigned),
    ...points.map((p) => p.deficitSigned), ...points.map((p) => p.einAtT), 0,
    ...(sleepDeprivationKcal > 0 ? [sleepDeprivationKcal] : []),
  ];
  const valMin = Math.min(...values);
  const valMax = Math.max(...values);
  // Round, evenly spaced ticks: the smallest 1/2/2.5/5 × 10ⁿ step giving at most
  // 6 intervals, with the limits on its multiples so 0 is always a tick.
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(valMax - valMin, 1) / 6));
  const yStep = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => (valMax - valMin) / s <= 6);
  let yMin = Math.floor(valMin / yStep) * yStep;
  let yMax = Math.ceil(valMax / yStep) * yStep;
  if (valMin - yMin < yStep * 0.1) yMin -= yStep;
  if (yMax - valMax < yStep * 0.1) yMax += yStep;

  const plotW = SUBPLOT_WIDTH - SUBPLOT_MARGIN_LEFT - SUBPLOT_MARGIN_RIGHT;
  const plotH = SUBPLOT_HEIGHT - SUBPLOT_MARGIN_TOP - SUBPLOT_MARGIN_BOTTOM;
  const xAt = (t) => SUBPLOT_MARGIN_LEFT + (plotW * t) / totalDays;
  const yAt = (v) => SUBPLOT_MARGIN_TOP + plotH - (plotH * (v - yMin)) / (yMax - yMin);
  const lineD = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.t).toFixed(1)},${yAt(p[key]).toFixed(1)}`).join(' ');

  const svgParts = [`<svg viewBox="0 0 ${SUBPLOT_WIDTH} ${SUBPLOT_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Daily energy balance over the trajectory and the maintenance tail after arrival">`];

  if (yMin < 0 && yMax > 0) {
    svgParts.push(`<line x1="${SUBPLOT_MARGIN_LEFT}" y1="${yAt(0).toFixed(1)}" x2="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y2="${yAt(0).toFixed(1)}" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="2 3"></line>`);
  }
  svgParts.push(...subplotFrameSvgParts({
    tTotal: totalDays,
    yMin,
    yMax,
    yUnitLabel: 'kcal/day',
    xAt,
    yAt,
    rightUnitLabel: 'g fat',
    rightConvert: (v) => (v / KCAL_PER_G_FAT).toFixed(1),
    yStep,
  }));
  svgParts.push(`<line x1="${xAt(tTotal).toFixed(1)}" y1="${SUBPLOT_MARGIN_TOP}" x2="${xAt(tTotal).toFixed(1)}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="2 2"></line>`);

  if (balanceLayerVisible.intake) svgParts.push(`<path d="${lineD('einAtT')}" fill="none" stroke="var(--accent)" stroke-width="2"></path>`);
  if (balanceLayerVisible.tef) svgParts.push(`<path d="${lineD('tefSigned')}" fill="none" stroke="var(--amber)" stroke-width="2"></path>`);
  if (sleepDeprivationKcal > 0 && balanceLayerVisible.sleep) svgParts.push(`<line x1="${SUBPLOT_MARGIN_LEFT}" y1="${yAt(sleepDeprivationKcal).toFixed(1)}" x2="${xAt(tTotal).toFixed(1)}" y2="${yAt(sleepDeprivationKcal).toFixed(1)}" stroke="var(--teal)" stroke-width="2" stroke-dasharray="4 3"></line>`);
  if (balanceLayerVisible.bmr) svgParts.push(`<path d="${lineD('bmrSigned')}" fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="1 3" stroke-linecap="round"></path>`);
  if (balanceLayerVisible.activity) svgParts.push(`<path d="${lineD('activitySigned')}" fill="none" stroke="#0891b2" stroke-width="2" stroke-dasharray="1 3" stroke-linecap="round"></path>`);
  if (balanceLayerVisible.maintenance) svgParts.push(`<path d="${lineD('maintenanceSigned')}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="5 3"></path>`);
  if (balanceLayerVisible.deficit) svgParts.push(`<path d="${lineD('deficitSigned')}" fill="none" stroke="var(--danger)" stroke-width="2.5" stroke-linecap="round"></path>`);

  svgParts.push(subplotHoverSvgParts('var(--danger)'), '</svg>', '<div class="mtc-tooltip" hidden></div>');

  const legendItems = [
    { key: 'deficit', color: 'var(--danger)', label: 'D (daily energy deficit)' },
    { key: 'maintenance', color: 'var(--ink-soft)', label: 'M (maintenance at m̄ — BMR + Eₐ)', dashed: true },
    { key: 'bmr', color: '#7c3aed', label: 'BMR (resting metabolic rate, at m̄)', dashed: true },
    { key: 'activity', color: '#0891b2', label: 'Eₐ (daily desired activity burn)', dashed: true },
    { key: 'intake', color: 'var(--accent)', label: 'Eᵢₙ (desired daily intake)' },
    { key: 'tef', color: 'var(--amber)', label: 'TEF (energy spent digesting that intake)' },
  ];
  if (sleepDeprivationKcal > 0) legendItems.push({ key: 'sleep', color: 'var(--teal)', label: 'δ (Sleep Deprivation Effect)', dashed: true });
  svgParts.push(`<div class="mtc-legend">${legendItems.map((item) => `<button type="button" class="mtc-legend-item${balanceLayerVisible[item.key] ? '' : ' mtc-legend-item-off'}" data-layer="${item.key}">${legendLineMark(item.color, item.dashed)}${item.label}</button>`).join('')}</div>`);

  el.innerHTML = svgParts.join('');
  el.querySelectorAll('.mtc-legend-item').forEach((button) => {
    button.addEventListener('click', () => {
      balanceLayerVisible[button.dataset.layer] = !balanceLayerVisible[button.dataset.layer];
      renderBalanceChart();
    });
  });

  attachSubplotHover(el, {
    xAt, plotW, marginLeft: SUBPLOT_MARGIN_LEFT, tTotal: totalDays,
    sample: (t) => {
      const mass = massTrajectoryAtDay(inputs, t);
      const bmr = coefficients.aBmr + coefficients.bBmr * mass;
      const activityKcal = coefficients.activityPerKg * mass;
      const maintenance = bmr + activityKcal;
      const einAtT = t > tTotal ? maintenanceEin : einKcal;
      const deficit = maintenance - einAtT * divisor;
      const lines = [
        dayDateLabel(t),
        `D (daily energy deficit) ${Math.round(-deficit)} kcal/day`,
        `M (maintenance at m̄ — BMR + Eₐ) ${Math.round(-maintenance)} kcal/day`,
        `BMR (resting metabolic rate, at m̄) ${Math.round(-bmr)} kcal/day`,
        `Eₐ (daily desired activity burn) ${Math.round(-activityKcal)} kcal/day`,
        `Eᵢₙ (desired daily intake) ${Math.round(einAtT)} kcal/day`,
        `TEF (energy spent digesting that intake) ${Math.round(-einAtT * (1 - divisor))} kcal/day`,
      ];
      if (sleepDeprivationKcal > 0 && t <= tTotal) lines.push(`δ (Sleep Deprivation Effect) +${Math.round(sleepDeprivationKcal)} kcal/day`);
      if (t > tTotal) lines.push('(maintenance tail, past arrival)');
      return { y: yAt(-deficit), text: lines.join('\n') };
    },
  });
}

// Which layer of the calories-intake subplot is toggled on.
const intakeLayerVisible = {
  ein: true, protein: true, fiber: true, fat: true, carb: true,
};

// Subplot (c): Eᵢₙ, the sheet's own desired-daily-intake field (left axis,
// kcal/day) — reads exactly like formula-ein above, so day 0 here never
// disagrees with the sheet. Layered underneath it, purely comparative (no
// gram axis, since the stack sums four different substances a single scale
// couldn't read accurately for any one of them), the four §1.5 dietary
// bands — protein at the bottom then dietary fiber, fat and carbohydrate —
// each a solid floor (its min) under a lighter ceiling (its max), stacked
// on the previous layer's max so bands never overlap. Exact grams for each
// are in the hover text.
function renderCaloriesIntakeChart() {
  const el = document.getElementById('calories-intake-chart');
  const inputs = readMassTrajectoryInputs();
  if (!inputs || !inputs.curve) { el.innerHTML = ''; return; }

  const { tTotal, totalDays, mg, curve } = inputs;
  const einKcal = curve.einKcal;
  const maintenanceEin = maintenanceKcalAtMass(curve.coefficients, mg) / curve.coefficients.tefDivisor;
  const macroCoeffs = readMacroBandCoefficients();

  const steps = 40;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (totalDays * i) / steps;
    const mass = massTrajectoryAtDay(inputs, t);
    const einAtT = t > tTotal ? maintenanceEin : einKcal;
    const point = { t, einAtT };
    if (macroCoeffs) {
      const bands = macroBandsAtMass(macroCoeffs, mass, einAtT);
      let base = 0;
      point.layers = {};
      MACRO_BAND_ORDER.forEach((key) => {
        const { minG, maxG } = bands[key];
        point.layers[key] = { base, minTop: base + minG, maxTop: base + maxG };
        base += maxG;
      });
      point.stackTop = base;
    }
    points.push(point);
  }

  const valMax = Math.max(...points.map((p) => p.einAtT));
  const yMin = 0;
  const yMax = valMax * 1.15;
  const gramsMax = macroCoeffs ? Math.max(...points.map((p) => p.stackTop)) * 1.08 : 0;

  const plotW = SUBPLOT_WIDTH - SUBPLOT_MARGIN_LEFT - SUBPLOT_MARGIN_RIGHT;
  const plotH = SUBPLOT_HEIGHT - SUBPLOT_MARGIN_TOP - SUBPLOT_MARGIN_BOTTOM;
  const xAt = (t) => SUBPLOT_MARGIN_LEFT + (plotW * t) / totalDays;
  const yAt = (v) => SUBPLOT_MARGIN_TOP + plotH - (plotH * (v - yMin)) / (yMax - yMin);
  const yAtGrams = (v) => SUBPLOT_MARGIN_TOP + plotH - (plotH * v) / gramsMax;
  const einPathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.t).toFixed(1)},${yAt(p.einAtT).toFixed(1)}`).join(' ');
  const macroBandPath = (key, lowField, highField) => {
    const top = points.map((p) => `${xAt(p.t).toFixed(1)},${yAtGrams(p.layers[key][highField]).toFixed(1)}`);
    const bottom = points.slice().reverse().map((p) => `${xAt(p.t).toFixed(1)},${yAtGrams(p.layers[key][lowField]).toFixed(1)}`);
    return `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`;
  };

  const svgParts = [`<svg viewBox="0 0 ${SUBPLOT_WIDTH} ${SUBPLOT_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Desired daily intake, with the protein, dietary fiber, fat and carbohydrate bands stacked on the right axis">`];
  svgParts.push(...subplotFrameSvgParts({
    tTotal: totalDays, yMin, yMax, yUnitLabel: 'kcal/day', xAt, yAt,
  }));
  svgParts.push(`<line x1="${xAt(tTotal).toFixed(1)}" y1="${SUBPLOT_MARGIN_TOP}" x2="${xAt(tTotal).toFixed(1)}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="2 2"></line>`);

  // No right (grams) axis: the stack sums four different substances, so a
  // single gram scale on it wouldn't accurately read for any one of them —
  // the bands stay purely comparative, with exact grams in the hover text.
  if (macroCoeffs) {
    MACRO_BAND_ORDER.forEach((key) => {
      if (!intakeLayerVisible[key]) return;
      const color = MACRO_BAND_COLORS[key];
      svgParts.push(`<path d="${macroBandPath(key, 'base', 'minTop')}" fill="${color}" fill-opacity="0.55" stroke="none"></path>`);
      svgParts.push(`<path d="${macroBandPath(key, 'minTop', 'maxTop')}" fill="${color}" fill-opacity="0.22" stroke="none"></path>`);
    });
  }

  if (intakeLayerVisible.ein) svgParts.push(`<path d="${einPathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"></path>`);

  svgParts.push(subplotHoverSvgParts('var(--accent)'), '</svg>', '<div class="mtc-tooltip" hidden></div>');

  const legendItems = [
    { key: 'ein', color: 'var(--accent)', label: 'Eᵢₙ (desired daily intake)', line: true },
  ];
  if (macroCoeffs) MACRO_BAND_ORDER.forEach((key) => legendItems.push({ key, color: MACRO_BAND_COLORS[key], label: MACRO_BAND_LABELS[key] }));
  svgParts.push(`<div class="mtc-legend">${legendItems.map((item) => `<button type="button" class="mtc-legend-item${intakeLayerVisible[item.key] ? '' : ' mtc-legend-item-off'}" data-layer="${item.key}">${item.line ? legendLineMark(item.color, item.dashed) : `<span class="mtc-legend-swatch" style="background:${item.color}"></span>`}${item.label}</button>`).join('')}</div>`);

  el.innerHTML = svgParts.join('');
  el.querySelectorAll('.mtc-legend-item').forEach((button) => {
    button.addEventListener('click', () => {
      intakeLayerVisible[button.dataset.layer] = !intakeLayerVisible[button.dataset.layer];
      renderCaloriesIntakeChart();
    });
  });

  attachSubplotHover(el, {
    xAt, plotW, marginLeft: SUBPLOT_MARGIN_LEFT, tTotal: totalDays,
    sample: (t) => {
      const mass = massTrajectoryAtDay(inputs, t);
      const einAtT = t > tTotal ? maintenanceEin : einKcal;
      const lines = [
        dayDateLabel(t),
        `Eᵢₙ (desired daily intake) ${Math.round(einAtT)} kcal/day`,
      ];
      if (macroCoeffs) {
        const bands = macroBandsAtMass(macroCoeffs, mass, einAtT);
        MACRO_BAND_ORDER.forEach((key) => {
          if (!intakeLayerVisible[key]) return;
          lines.push(`${MACRO_BAND_LABELS[key]} ${Math.round(bands[key].minG)}–${Math.round(bands[key].maxG)} g/day`);
        });
      }
      if (t > tTotal) lines.push('(maintenance tail, past arrival)');
      return { y: yAt(einAtT), text: lines.join('\n') };
    },
  });
}

// Which layer of the activity subplot is toggled on.
const activityLayerVisible = { kcal: true, minutes: true };

// Subplot (d): activity energy expenditure — left axis kcal/day, falling as
// the trajectory's mass falls (same MET and minutes, less mass to move);
// right axis the fixed activity-minutes target itself, τ, drawn as a flat
// reference since the plan's duration doesn't change, only what it costs.
function renderActivityChart() {
  const el = document.getElementById('activity-chart');
  const inputs = readMassTrajectoryInputs();
  if (!inputs || !inputs.curve) { el.innerHTML = ''; return; }

  const { tTotal, totalDays, curve } = inputs;
  const { coefficients, tau } = curve;

  // Activity burn leaves the body, so it's plotted negative — same
  // outflow-negative/inflow-positive convention as the balance subplot.
  const steps = 40;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (totalDays * i) / steps;
    points.push({ t, kcal: -coefficients.activityPerKg * massTrajectoryAtDay(inputs, t) });
  }

  const kcalMin = Math.min(...points.map((p) => p.kcal));
  const yMin = kcalMin * 1.15;
  const yMax = 0;
  // The right (minutes) axis has its own, independent scale — τ centred in
  // it — since minutes and calories aren't linearly tied the way mass and
  // BMI are in the chart above.
  const minutesYMin = 0;
  const minutesYMax = tau * 2;

  const plotW = SUBPLOT_WIDTH - SUBPLOT_MARGIN_LEFT - SUBPLOT_MARGIN_RIGHT;
  const plotH = SUBPLOT_HEIGHT - SUBPLOT_MARGIN_TOP - SUBPLOT_MARGIN_BOTTOM;
  const xAt = (t) => SUBPLOT_MARGIN_LEFT + (plotW * t) / totalDays;
  const yAt = (v) => SUBPLOT_MARGIN_TOP + plotH - (plotH * (v - yMin)) / (yMax - yMin);
  const yAtMinutes = (v) => SUBPLOT_MARGIN_TOP + plotH - (plotH * (v - minutesYMin)) / (minutesYMax - minutesYMin);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.t).toFixed(1)},${yAt(p.kcal).toFixed(1)}`).join(' ');

  const svgParts = [`<svg viewBox="0 0 ${SUBPLOT_WIDTH} ${SUBPLOT_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Activity calories burned over the trajectory, against the fixed activity-minutes target">`];
  svgParts.push(...subplotFrameSvgParts({
    tTotal: totalDays, yMin, yMax, yUnitLabel: 'kcal', xAt, yAt,
  }));
  svgParts.push(`<line x1="${xAt(tTotal).toFixed(1)}" y1="${SUBPLOT_MARGIN_TOP}" x2="${xAt(tTotal).toFixed(1)}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="2 2"></line>`);

  // Right-axis (minutes) ticks, at the same rows as the left axis, labelled
  // off the minutes scale rather than the kcal one.
  for (let i = 0; i <= 4; i += 1) {
    const v = minutesYMin + ((minutesYMax - minutesYMin) * i) / 4;
    const y = yAtMinutes(v);
    svgParts.push(`<text x="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT + 8}" y="${(y + 3).toFixed(1)}" text-anchor="start" font-size="10.5" fill="var(--ink-faint)">${Math.round(v)}</text>`);
  }
  svgParts.push(`<line x1="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y1="${SUBPLOT_MARGIN_TOP}" x2="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y2="${SUBPLOT_HEIGHT - SUBPLOT_MARGIN_BOTTOM}" stroke="var(--ink-faint)" stroke-width="1.4"></line>`);
  svgParts.push(`<text x="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y="12" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--ink-faint)">min</text>`);

  if (activityLayerVisible.minutes) svgParts.push(`<line x1="${SUBPLOT_MARGIN_LEFT}" y1="${yAtMinutes(tau).toFixed(1)}" x2="${SUBPLOT_WIDTH - SUBPLOT_MARGIN_RIGHT}" y2="${yAtMinutes(tau).toFixed(1)}" stroke="var(--amber)" stroke-width="2" stroke-dasharray="4 3"></line>`);
  if (activityLayerVisible.kcal) svgParts.push(`<path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"></path>`);

  svgParts.push(subplotHoverSvgParts('var(--accent)'), '</svg>', '<div class="mtc-tooltip" hidden></div>');

  const legendItems = [
    { key: 'kcal', color: 'var(--accent)', label: 'Eₐ (daily desired activity burn)' },
    { key: 'minutes', color: 'var(--amber)', label: 'τ (Activity time)', dashed: true },
  ];
  svgParts.push(`<div class="mtc-legend">${legendItems.map((item) => `<button type="button" class="mtc-legend-item${activityLayerVisible[item.key] ? '' : ' mtc-legend-item-off'}" data-layer="${item.key}">${legendLineMark(item.color, item.dashed)}${item.label}</button>`).join('')}</div>`);

  el.innerHTML = svgParts.join('');
  el.querySelectorAll('.mtc-legend-item').forEach((button) => {
    button.addEventListener('click', () => {
      activityLayerVisible[button.dataset.layer] = !activityLayerVisible[button.dataset.layer];
      renderActivityChart();
    });
  });

  attachSubplotHover(el, {
    xAt, plotW, marginLeft: SUBPLOT_MARGIN_LEFT, tTotal: totalDays,
    sample: (t) => {
      const mass = massTrajectoryAtDay(inputs, t);
      const kcal = -coefficients.activityPerKg * mass;
      const lines = [dayDateLabel(t), `Eₐ (daily desired activity burn) ${Math.round(kcal)} kcal/day`, `τ (Activity time) ${Math.round(tau)} min/day`];
      if (t > tTotal) lines.push('(maintenance tail, past arrival)');
      return { y: yAt(kcal), text: lines.join('\n') };
    },
  });
}

function renderFormulaPreviewCore() {
  syncTargetMassFromBmi();
  syncWeeklyLossFromPct();
  const { mode, preview, bodyMassKg, heightCm, age, sex, formula, einKcal, days, invalid } = readFormulaInputs();
  const noteEl = document.getElementById('formula-profile-note');

  const computedNow = computedIdsForMode(mode);
  const showFailure = (message) => {
    if (computedNow.includes('formula-ein')) setComputedField('formula-ein', '—');
    if (computedNow.includes('formula-days')) {
      setComputedField('formula-days', '');
      setEtaDate('');
      setEtaNote('');
    }
    renderFormulaSubstituted(null);
    noteEl.textContent = message;
  };

  if (invalid.length) {
    showFailure(`Needs a number in: ${invalid.join(', ')}.`);
    return;
  }

  const cantCompute = () => showFailure("Can't compute from these values.");

  const met = withFormulaOverrides(preview, activityMet);
  const kappa = preview.KCAL_PER_MET_KG_MIN;
  const bmr = bmrKcal(bodyMassKg, heightCm, age, sex, formula);
  const tef = preview[TEF_PERCENT_KEY];

  const profile = { heightCm, age, sex, met, kappa, formula, tef };
  const bmrRow = formulaBmrRow(bmr, { bodyMassKg, heightCm, age, sex, formula });

  noteEl.textContent = '';

  if (mode === 'EIN' || mode === 'FIXED_PCT') {
    const tau = preview.ACTIVITY_TARGET_MIN;
    const targetKg = preview.BODY_MASS_TARGET_KG;
    const detail = withFormulaOverrides(preview, () => calorieTargetDetail(bodyMassKg, age));
    if (detail === null) { cantCompute(); return; }
    const weeklyPct = weeklyLossPctInPlay(detail.weeklyFatLossKg, bodyMassKg);
    const coefficients = maintenanceAffineCoefficients({ ...profile, tau });
    const { a, b } = coefficients;
    const proj = formulaProjection({
      intakeKcal: detail.kcal, bodyMassKg, targetKg, tau, ...profile,
    }, weeklyPct);
    setComputedField('formula-ein', String(Math.round(detail.kcal)));
    renderFormulaDaysField(proj, { bodyMassKg, targetKg });

    // calorieTargetDetail already ran the sleep adjustment (see sleepAdjustedDeficitKcal
    // above) — `detail` IS the sleepInfo shape renderSleepDeprivationField wants, so this
    // mode reads the deficit straight off it rather than recomputing the raw rate.
    const deficit = detail.deficit;
    const bRounded = Math.round(b * 100) / 100;
    const eqRounded = Math.round(((detail.kcal - a) / b) * 10) / 10;
    const rows = [
      bmrRow,
      ['Eₐ', `${met} × ${bodyMassKg} × ${tau} × ${kappa} / 200  =  ${Math.round(detail.activityKcal)} kcal/day`],
      ...renderSleepDeprivationField(detail),
      ...renderWeeklyLossPctField(),
      ['D', formulaDeficitTraceLine(detail)],
      ...renderTefField(),
      ...formulaEinRows(coefficients, {
        bmr: detail.bmr, activityKcal: detail.activityKcal, deficit, einKcal: detail.kcal,
      }),
      ...renderTargetBmiField(),
    ];
    if (proj.journey !== 'pct') {
      rows.push(
        ...formulaAffineRows(coefficients, { heightCm, age, sex, met, tau, kappa }),
        ['m∞', `(${detail.kcal} − ${Math.round(a)}) / ${bRounded}  =  ${eqRounded} kg`],
      );
    }
    rows.push(...formulaDaysRow(proj, { bodyMassKg, targetKg, weeklyPct, bRounded, eqRounded }));
    renderFormulaSubstituted(rows, {
      intakeKcal: detail.kcal,
      coefficients,
      bmr: detail.bmr,
      activityKcal: detail.activityKcal,
      deficit,
      days: proj.status === 'ok' ? proj.days : null,
      journey: proj.journey,
    });
    return;
  }

  if (mode === 'TAU') {
    const deltaM = preview.WEEKLY_FAT_LOSS_KG;
    const targetKg = preview.BODY_MASS_TARGET_KG;
    const knownField = dualKnownField.TAU;

    // Δm is the fixed known in BOTH directions of this mode — only τ (and, in the
    // days-known direction, Eᵢₙ) is being solved for — so the sleep adjustment applies the
    // same forward way calorieTargetDetail's own does, regardless of which box drove the
    // solve.
    const planSleepHours = preview.PLAN_SLEEP_HOURS;
    const sleepTargetHours = SLEEP_TARGET_HOURS_DEFAULT;
    const rawDeficit = (deltaM * GENERIC_KCAL_PER_KG_FAT) / 7;
    const { deficitKcal: deficit, sleepDeprivationEffectKcal, factor, pctPerHour } = withFormulaOverrides(
      preview, () => sleepAdjustedDeficitKcal(rawDeficit, planSleepHours, sleepTargetHours),
    );
    const sleepInfo = {
      weeklyFatLossKg: deltaM, rawDeficit, deficit, sleepDeprivationEffectKcal, factor, pctPerHour, planSleepHours, sleepTargetHours,
    };

    const shape = maintenanceAffineCoefficients({ ...profile, tau: 0 });
    const divisor = shape.tefDivisor;

    let tau;
    if (knownField === 'ein') {
      const activityKcalNeeded = einKcal * divisor + deficit - bmr;
      tau = Math.round((activityKcalNeeded * ML_O2_PER_KCAL) / (met * bodyMassKg * kappa));
    } else {
      const c = (met * kappa) / ML_O2_PER_KCAL;
      const B = solveBForTypedDays({
        deficit: deficit / divisor,
        massToLose: bodyMassKg - targetKg,
        t: days,
        rho: GENERIC_KCAL_PER_KG_FAT,
        minB: shape.bBmr / divisor,
      });
      tau = B === null ? NaN : Math.round((B * divisor - shape.bBmr) / c);
    }
    if (!Number.isFinite(tau) || tau < 0) { cantCompute(); return; }
    setComputedField('formula-activity-min', String(tau));

    const coefficients = maintenanceAffineCoefficients({ ...profile, tau });
    const { a, b } = coefficients;
    const activityKcal = withFormulaOverrides(
      { ...preview, ACTIVITY_TARGET_MIN: tau },
      () => activityTargetKcal(bodyMassKg),
    );
    const einForDisplay = knownField === 'ein' ? einKcal : (bmr + activityKcal - deficit) / divisor;

    const weeklyPct = weeklyLossPctInPlay(deltaM, bodyMassKg);
    const projArgs = { intakeKcal: einForDisplay, bodyMassKg, targetKg, tau, ...profile };
    const proj = knownField === 'ein' ? formulaProjection(projArgs, weeklyPct) : projectTargetDays(projArgs);
    if (knownField === 'ein') {
      renderFormulaDaysField(proj, { bodyMassKg, targetKg });
    } else {
      setComputedField('formula-ein', String(Math.round(einForDisplay)));
      setEtaDate(isoDateFromDays(days));
      setEtaNote('');
    }

    const bRounded = Math.round(b * 100) / 100;
    const eqRounded = Math.round(((einForDisplay - a) / b) * 10) / 10;
    const rows = [];
    if (knownField === 'days') {
      rows.push(['τ', `solved numerically so that m(t=${days}) = ${targetKg} kg`]);
    }
    rows.push(
      bmrRow,
      ['Eₐ', `${met} × ${bodyMassKg} × ${tau} × ${kappa} / 200  =  ${Math.round(activityKcal)} kcal/day`],
      ...renderSleepDeprivationField(sleepInfo),
      ...renderWeeklyLossPctField(),
      ['D', formulaDeficitTraceLine(sleepInfo)],
      ...renderTefField(),
      ...formulaEinRows(coefficients, { bmr, activityKcal, deficit, einKcal: einForDisplay }),
      ...renderTargetBmiField(),
    );
    if (proj.journey !== 'pct') {
      rows.push(
        ...formulaAffineRows(coefficients, { heightCm, age, sex, met, tau, kappa }),
        ['m∞', `(${Math.round(einForDisplay)} − ${Math.round(a)}) / ${bRounded}  =  ${eqRounded} kg`],
      );
    }
    rows.push(...formulaDaysRow(proj, { bodyMassKg, targetKg, weeklyPct, bRounded, eqRounded }));
    renderFormulaSubstituted(rows, {
      intakeKcal: einForDisplay,
      coefficients,
      bmr,
      activityKcal,
      deficit,
      days: knownField === 'days' ? days : (proj.status === 'ok' ? proj.days : null),
      journey: proj.journey,
    });
    return;
  }

  if (mode === 'TARGET_MASS') {
    const tau = preview.ACTIVITY_TARGET_MIN;
    const coefficients = maintenanceAffineCoefficients({ ...profile, tau });
    const { a, b } = coefficients;
    const equilibriumKg = (einKcal - a) / b;
    const mG = equilibriumKg + (bodyMassKg - equilibriumKg) * Math.exp((-b * days) / GENERIC_KCAL_PER_KG_FAT);
    if (!Number.isFinite(mG)) { cantCompute(); return; }
    const mGRounded = Math.round(mG * 10) / 10;
    setComputedField('formula-target', String(mGRounded));
    setEtaDate(isoDateFromDays(days));
    setEtaNote('');

    const bRounded = Math.round(b * 100) / 100;
    const eqRounded = Math.round(equilibriumKg * 10) / 10;
    // No BMR/Eₐ/D/Eᵢₙ preamble here: those describe maintenance at the CURRENT mass, which
    // this mode never claims equals the typed Eᵢₙ. D isn't being built from a target rate
    // here — Eᵢₙ is typed — so there's no forward "how much bigger does D need to be"
    // question for the sleep adjustment to answer; dashed rather than computed.
    renderSleepDeprivationField(null);
    renderFormulaSubstituted([
      ...renderTefField(),
      ...formulaAffineRows(coefficients, { heightCm, age, sex, met, tau, kappa }),
      ['m∞', `(${Math.round(einKcal)} − ${Math.round(a)}) / ${bRounded}  =  ${eqRounded} kg`],
      ['m_d', `${eqRounded} + (${bodyMassKg} − ${eqRounded}) × e^(−${bRounded}×${days}/7700)  =  ${mGRounded} kg`],
      ...renderTargetBmiField(),
      ...renderWeeklyLossPctField(),
    ], (() => {
      const activityKcal = withFormulaOverrides(preview, () => activityTargetKcal(bodyMassKg));
      return {
        intakeKcal: einKcal,
        coefficients,
        bmr,
        activityKcal,
        deficit: bmr + activityKcal - einKcal * coefficients.tefDivisor,
        days,
        journey: 'intake',
      };
    })());
    return;
  }

  // DELTA_M
  const tau = preview.ACTIVITY_TARGET_MIN;
  const targetKg = preview.BODY_MASS_TARGET_KG;
  const coefficients = maintenanceAffineCoefficients({ ...profile, tau });
  const { a, b } = coefficients;
  const activityKcal = withFormulaOverrides(preview, () => activityTargetKcal(bodyMassKg));
  const knownField = dualKnownField.DELTA_M;
  // D is reverse-solved FROM Eᵢₙ or m_d in this mode (below), never built from a target
  // rate — so, same as TARGET_MASS, there's no forward question for the sleep adjustment
  // to answer here; dashed rather than computed.
  renderSleepDeprivationField(null);

  let einForDisplay;
  let decay;
  if (knownField === 'ein') {
    einForDisplay = einKcal;
  } else {
    decay = Math.exp((-b * days) / GENERIC_KCAL_PER_KG_FAT);
    const equilibriumKg = (targetKg - bodyMassKg * decay) / (1 - decay);
    einForDisplay = a + b * equilibriumKg;
  }
  if (!Number.isFinite(einForDisplay)) { cantCompute(); return; }

  const deficit = bmr + activityKcal - einForDisplay * coefficients.tefDivisor;
  const deltaMSolved = Math.round((deficit * 7 / GENERIC_KCAL_PER_KG_FAT) * 100) / 100;
  if (!Number.isFinite(deltaMSolved)) { cantCompute(); return; }
  setComputedField('formula-weekly-loss', String(deltaMSolved));

  const bRounded = Math.round(b * 100) / 100;
  const eqRounded = Math.round(((einForDisplay - a) / b) * 10) / 10;

  if (knownField === 'ein') {
    const weeklyPct = weeklyFatLossPct(deltaMSolved, bodyMassKg);
    const proj = formulaProjection({
      intakeKcal: einForDisplay, bodyMassKg, targetKg, tau, ...profile,
    }, weeklyPct);
    renderFormulaDaysField(proj, { bodyMassKg, targetKg });

    renderFormulaSubstituted([
      bmrRow,
      ['Eₐ', `${met} × ${bodyMassKg} × ${tau} × ${kappa} / 200  =  ${Math.round(activityKcal)} kcal/day`],
      ...formulaDeficitRows(coefficients, { bmr, activityKcal, einKcal: einForDisplay, deficit }),
      ...renderTefField(),
      ['Δm', `${Math.round(deficit)} × 7 / 7700  =  ${deltaMSolved} kg/week`],
      ...(proj.journey === 'pct' ? [] : [
        ...formulaAffineRows(coefficients, { heightCm, age, sex, met, tau, kappa }),
        ['m∞', `(${Math.round(einForDisplay)} − ${Math.round(a)}) / ${bRounded}  =  ${eqRounded} kg`],
      ]),
      ...formulaDaysRow(proj, { bodyMassKg, targetKg, weeklyPct, bRounded, eqRounded }),
      ...renderTargetBmiField(),
      ...renderWeeklyLossPctField(),
    ], {
      intakeKcal: einForDisplay,
      coefficients,
      bmr,
      activityKcal,
      deficit,
      days: proj.status === 'ok' ? proj.days : null,
      journey: proj.journey,
    });
    return;
  }

  setEtaDate(isoDateFromDays(days));
  setEtaNote('');
  setComputedField('formula-ein', String(Math.round(einForDisplay)));

  const decayRounded = Math.round(decay * 1000) / 1000;
  renderFormulaSubstituted([
    ...formulaAffineRows(coefficients, { heightCm, age, sex, met, tau, kappa }),
    ['m∞', `(${targetKg} − ${bodyMassKg}×${decayRounded}) / (1 − ${decayRounded})  =  ${eqRounded} kg`],
    ['Eᵢₙ', `${Math.round(a)} + ${bRounded} × ${eqRounded}  =  ${Math.round(einForDisplay)} kcal/day`],
    ...renderTefField(),
    bmrRow,
    ['Eₐ', `${met} × ${bodyMassKg} × ${tau} × ${kappa} / 200  =  ${Math.round(activityKcal)} kcal/day`],
    ...formulaDeficitRows(coefficients, { bmr, activityKcal, einKcal: einForDisplay, deficit }),
    ['Δm', `${Math.round(deficit)} × 7 / 7700  =  ${deltaMSolved} kg/week`],
    ...renderTargetBmiField(),
    ...renderWeeklyLossPctField(),
  ], {
    intakeKcal: einForDisplay,
    coefficients,
    bmr,
    activityKcal,
    deficit,
    days,
    journey: 'intake',
  });
}

// Fills every box from the default demo profile — what a fresh load, and
// Reset, both seed the sheet with.
function loadDefaultInputs() {
  [...FORMULA_FIELDS, ...PROTEIN_FORMULA_FIELDS, ...FIBER_FORMULA_FIELDS, ...FAT_FORMULA_FIELDS, ...CARB_FORMULA_FIELDS, ...ADAPT_FORMULA_FIELDS].forEach((field) => {
    document.getElementById(field.inputId).value = formulaFieldValue(field);
  });
  document.getElementById('formula-body-mass-smooth').value = DEFAULT_BODY_MASS_KG;
  document.getElementById('formula-height').value = DEFAULT_HEIGHT_CM;
  document.getElementById('formula-age').value = DEFAULT_AGE;
  document.getElementById('formula-sex').value = DEFAULT_SEX;
}

function initSheet() {
  buildTableOfContents();

  document.querySelector('input[name="formula-solve-for"][value="EIN"]').checked = true;
  dualKnownField.TAU = 'ein';
  dualKnownField.DELTA_M = 'days';
  weeklyLossKnownField = 'kg';
  targetMassKnownField = 'kg';
  document.querySelector('input[name="formula-bmr-formula"][value="mifflin"]').checked = true;
  loadDefaultInputs();
  applySolveForMode('EIN');
  renderFormulaPreview();
}

function wireSheet() {
  [...FORMULA_FIELDS.map((f) => f.inputId).filter((id) => id !== 'formula-weekly-loss' && id !== 'formula-target'),
    ...PROTEIN_FORMULA_FIELDS.map((f) => f.inputId),
    ...FIBER_FORMULA_FIELDS.map((f) => f.inputId),
    ...FAT_FORMULA_FIELDS.map((f) => f.inputId),
    ...CARB_FORMULA_FIELDS.map((f) => f.inputId),
    ...ADAPT_FORMULA_FIELDS.map((f) => f.inputId),
    'formula-body-mass-smooth', 'formula-height', 'formula-age',
    'formula-glycogen-skeletal-frac', 'formula-glycogen-per-kg-muscle', 'formula-glycogen-liver',
    'formula-glycogen-water-ratio'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderFormulaPreview);
  });
  document.getElementById('formula-sex').addEventListener('change', renderFormulaPreview);

  document.querySelectorAll('input[name="formula-bmr-formula"]').forEach((radio) => {
    radio.addEventListener('change', renderFormulaPreview);
  });

  [['formula-weekly-loss', 'kg'], ['formula-weekly-loss-pct', 'pct']].forEach(([id, field]) => {
    document.getElementById(id).addEventListener('input', () => {
      weeklyLossKnownField = field;
      renderFormulaPreview();
    });
  });

  [['formula-target', 'kg'], ['formula-target-bmi', 'bmi']].forEach(([id, field]) => {
    document.getElementById(id).addEventListener('input', () => {
      targetMassKnownField = field;
      renderFormulaPreview();
    });
  });

  const markDualKnown = (field) => {
    const mode = currentSolveFor();
    if (mode === 'TAU' || mode === 'DELTA_M') {
      dualKnownField[mode] = field;
      applySolveForMode(mode);
    }
  };
  document.getElementById('formula-ein').addEventListener('input', () => {
    markDualKnown('ein');
    renderFormulaPreview();
  });
  document.getElementById('formula-days').addEventListener('input', () => {
    markDualKnown('days');
    renderFormulaPreview();
  });

  document.getElementById('formula-eta').addEventListener('change', (event) => {
    if (event.target.readOnly || !event.target.value) return;
    markDualKnown('days');
    document.getElementById('formula-days').value = String(daysFromTodayIso(event.target.value));
    renderFormulaPreview();
  });

  document.querySelectorAll('input[name="formula-solve-for"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      applySolveForMode(currentSolveFor());
      renderFormulaPreview();
    });
  });

  document.getElementById('formula-reset-btn').addEventListener('click', () => {
    loadDefaultInputs();
    renderFormulaPreview();
  });
}

function renderMarkdownInline(text) {
  return text.replace(/\[([^\]\[]*)\]\(([^)]*)\)/g, (match, label, url) => `<a href="${url}">${label}</a>`);
}

// GitHub-style heading slug: lowercase, spaces to hyphens, strip anything
// that isn't a letter/digit/hyphen. Every heading in this document has
// unique text, so slugs never collide — which is what lets ids be computed
// from the heading text instead of hand-typed in README.md. Add a new
// subsection there and it gets a correct, unique id for free.
function slugifyHeading(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
}

// Minimal BibTeX reader for the fenced ```bibtex block in README.md's
// References section — that block is the source of truth (a real .bib file
// a reader can paste straight into LaTeX), and the IEEE-formatted citations
// on the page are rendered from it, never hand-typed. Scoped to the fields
// the 13 entries here actually use; not a general BibTeX parser.
function parseBibtex(text) {
  const entries = [];
  const entryRegex = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\}/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(text))) {
    const [, type, key, body] = entryMatch;
    const fields = {};
    const fieldRegex = /(\w+)\s*=\s*\{([^}]*)\}/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(body))) {
      fields[fieldMatch[1]] = fieldMatch[2].replace(/\\&/g, '&').replace(/--/g, '–').trim();
    }
    entries.push({ type: type.toLowerCase(), key, fields });
  }
  return entries;
}

// BibTeX's " and "-separated author list, in IEEE style: "A and B" for two,
// "A, B, and C" for three or more. Only meant for a genuine list of person
// names (the `author` field) — an `institution` field is a single
// organization name and is used verbatim, since an org's own name can
// legitimately contain the word "and" (e.g. "Health and Human Services").
function formatAuthorList(author) {
  const names = author.split(' and ');
  if (names.length <= 2) return author;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// Renders one parsed BibTeX entry as an IEEE-style reference string —
// covering the three entry types this bibliography actually contains
// (article, book, techreport).
function formatIeeeReference(entry, number) {
  const f = entry.fields;
  const doiClause = f.doi
    ? `, doi: <a href="https://doi.org/${f.doi}" target="_blank" rel="noopener">${f.doi}</a>`
    : '';

  if (entry.type === 'article') {
    const parts = [`vol. ${f.volume}`];
    if (f.number) parts.push(`no. ${f.number}`);
    parts.push(f.articleno ? `art. no. ${f.articleno}` : `pp. ${f.pages}`);
    return `[${number}] ${formatAuthorList(f.author)}, "${f.title}," <i>${f.journal}</i>, ${parts.join(', ')}, ${f.year}${doiClause}.`;
  }

  if (entry.type === 'book') {
    const authorStr = f.author ? formatAuthorList(f.author) : f.institution;
    const editionStr = f.edition ? `, ${f.edition} ed` : '';
    const publisherStr = f.publisher ? `: ${f.publisher}` : '';
    return `[${number}] ${authorStr}, <i>${f.title}</i>${editionStr}. ${f.address}${publisherStr}, ${f.year}.`;
  }

  if (entry.type === 'techreport') {
    const bits = [f.type, f.number, f.address].filter(Boolean);
    return `[${number}] ${f.institution}, "${f.title}," ${bits.join(', ')}, ${f.year}.`;
  }

  return `[${number}] ${f.author || f.institution}, "${f.title}," ${f.year}.`;
}

// Index of the '{' at openIndex's own matching '}', accounting for further
// {}-nesting in between (e.g. a subscript inside a \frac numerator).
function findMatchingBrace(text, openIndex) {
  let depth = 0;
  for (let j = openIndex; j < text.length; j += 1) {
    if (text[j] === '{') depth += 1;
    else if (text[j] === '}') {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return text.length - 1;
}

// Minimal LaTeX-flavored math renderer for equation lines: x_{sub} becomes a
// real <sub>, x^{sup} a real <sup>, and \frac{a}{b} a stacked fraction — not
// a general LaTeX engine, just the handful of constructs the equations in
// README.md actually use. \frac is extracted with explicit brace-matching
// rather than a single regex, since its numerator or denominator can itself
// contain a {}-delimited subscript or superscript (e.g. \frac{m_{d}}{...}) —
// a plain [^{}]* group would stop at that inner brace. The _{...}/^{...}
// pass then runs once over the whole result, reaching those nested ones too.
function renderEquationMath(text) {
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('\\frac{', i)) {
      const numOpen = i + 5;
      const numClose = findMatchingBrace(text, numOpen);
      if (text[numClose + 1] === '{') {
        const denOpen = numClose + 1;
        const denClose = findMatchingBrace(text, denOpen);
        const num = text.slice(numOpen + 1, numClose);
        const den = text.slice(denOpen + 1, denClose);
        result += `<span class="eqn-frac"><span class="eqn-frac-num">${num}</span><span class="eqn-frac-den">${den}</span></span>`;
        i = denClose + 1;
        continue;
      }
    }
    result += text[i];
    i += 1;
  }
  result = result.replace(/_\{([^{}]*)\}/g, (match, sub) => `<sub>${sub}</sub>`);
  result = result.replace(/\^\{([^{}]*)\}/g, (match, sup) => `<sup>${sup}</sup>`);
  return result;
}

// Escapes real LaTeX prose needs but plain web text doesn't: \% \_ \& read
// back as % _ &, and a ~ (LaTeX's non-breaking space) as a plain space.
// Subscript/superscript underscores inside equations are never escaped
// (that's what makes them math-mode operators, not literal characters), so
// this never touches those.
function stripLatexEscapes(text) {
  return text.replace(/\\%/g, '%').replace(/\\_/g, '_').replace(/\\&/g, '&').replace(/~/g, ' ');
}

// Equation-only LaTeX spacing/sizing macros that have no visual equivalent
// this renderer needs — stripped to their plain-text content before the
// \frac/sub/sup pass in renderEquationMath.
function stripEquationMacros(text) {
  return text
    .replace(/\\quad/g, ' ')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\left([[(])/g, '$1')
    .replace(/\\right([\])])/g, '$1')
    .replace(/\\!/g, '')
    .replace(/\\min/g, 'min')
    .replace(/\\max/g, 'max')
    .replace(/\\ln/g, 'ln');
}

// A small LaTeX-to-HTML converter for "2 Human Metabolic System Model.tex",
// scoped to exactly the constructs that file uses: \section/\subsection/
// \subsubsection (id auto-derived via slugifyHeading, never typed), blank-
// line-separated paragraphs, and \begin{equation}\label{x}...\end{equation}
// blocks (consecutive ones grouped into one scrollable eqn-scroll, same as
// the equation-run grouping the sheet already used under Markdown). Citation
// numbers come from citationNumberByKey, built by the caller from the
// separately-fetched references.bib — this function only resolves \eqref
// against labels it finds in the same document.
function renderReadmeLatex(texSource, citationNumberByKey) {
  const lines = texSource.split('\n');

  // Pass 1: number every equation by document order and record that number
  // against its \label{eqn_x} — a permanent key, independent of position,
  // that \eqref{eqn_x} in prose resolves against.
  const equationNumberByLabel = {};
  let equationTotal = 0;
  lines.forEach((rawLine, i) => {
    if (/^\s*\\begin\{equation\}/.test(rawLine)) {
      equationTotal += 1;
      const labelMatch = (lines[i + 1] || '').match(/^\s*\\label\{([\w-]+)\}/);
      if (labelMatch) equationNumberByLabel[labelMatch[1]] = equationTotal;
    }
  });

  function resolveRefs(text) {
    return stripLatexEscapes(text)
      .replace(/\{,\}/g, ',')
      .replace(/\\emph\{([^{}]*)\}/g, '<em>$1</em>')
      .replace(/\$([^$]+)\$/g, (match, math) => renderEquationMath(math))
      .replace(/\\eqref\{([\w-]+)\}/g, (match, label) => {
        const num = equationNumberByLabel[label];
        return num ? `<a href="#${label}">(${num})</a>` : match;
      })
      .replace(/\\cite\{([\w-]+)\}/g, (match, key) => {
        const num = citationNumberByKey[key];
        return num ? `<a href="#${key}">[${num}]</a>` : match;
      });
  }

  const htmlParts = [];
  let paragraphLines = [];
  let equationCount = 0;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    const text = renderMarkdownInline(resolveRefs(paragraphLines.join(' ').trim()));
    if (text) htmlParts.push(`<p>${text}</p>`);
    paragraphLines = [];
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (line === '' || line.startsWith('%') || /^\\(maketitle|title\{|date\{|bibliographystyle\{|bibliography\{|input\{)/.test(line)) {
      flushParagraph();
      continue;
    }

    // Equation run: one or more consecutive \begin{equation} blocks (no
    // prose between them), grouped into one scrollable container, same as
    // a multi-line equation block used to be.
    if (/^\\begin\{equation\}/.test(line)) {
      flushParagraph();
      const rows = [];
      while (i < lines.length && /^\\begin\{equation\}/.test(lines[i].trim())) {
        equationCount += 1;
        let label = null;
        const bodyLines = [];
        i += 1;
        while (i < lines.length && !/^\\end\{equation\}/.test(lines[i].trim())) {
          const t = lines[i].trim();
          const labelMatch = t.match(/^\\label\{([\w-]+)\}$/);
          if (labelMatch) label = labelMatch[1];
          else if (t !== '') bodyLines.push(t);
          i += 1;
        }
        const id = label || `eqn-${equationCount}`;
        const body = stripEquationMacros(stripLatexEscapes(bodyLines.join(' ')));
        rows.push(`<div class="eqn-row" id="${id}"><span class="eqn-body">${renderEquationMath(body)}</span><a class="eqn-num" href="#${id}">(${equationCount})</a></div>`);
        i += 1; // past this block's \end{equation}
        while (i < lines.length && lines[i].trim() === '') i += 1; // skip blanks before checking for the next \begin{equation}
      }
      i -= 1;
      htmlParts.push(`<div class="formula-expression"><div class="eqn-scroll">${rows.join('')}</div></div>`);
      continue;
    }

    if (/^\\begin\{description\}/.test(line)) {
      flushParagraph();
      htmlParts.push('<dl class="glossary">');
      continue;
    }
    if (/^\\end\{description\}/.test(line)) {
      htmlParts.push('</dl>');
      continue;
    }
    const itemMatch = line.match(/^\\item\[(.+?)\]\s*(.*)$/);
    if (itemMatch) {
      htmlParts.push(`<dt>${resolveRefs(itemMatch[1])}</dt><dd>${resolveRefs(itemMatch[2])}</dd>`);
      continue;
    }

    const headingMatch = line.match(/^\\(section|subsection|subsubsection)\{(.+)\}$/);
    if (headingMatch) {
      flushParagraph();
      const level = { section: 2, subsection: 3, subsubsection: 4 }[headingMatch[1]];
      const text = headingMatch[2].trim();
      const id = slugifyHeading(text);
      htmlParts.push(`<h${level} id="${id}">${renderMarkdownInline(resolveRefs(text))}</h${level}>`);
      continue;
    }

    paragraphLines.push(line);
  }
  flushParagraph();
  return htmlParts.join('\n');
}

// The References section's HTML, built straight from references.bib via the
// same parseBibtex/formatIeeeReference pipeline the sheet already used for
// its embedded bibliography — only the source moved to its own file.
function renderReferencesSection(bibText) {
  const entries = parseBibtex(bibText);
  const items = entries.map((entry, index) => `<p class="ref-item" id="${entry.key}">${formatIeeeReference(entry, index + 1)}</p>`).join('\n');
  return { html: `<h2 id="references">References</h2>\n${items}`, entries };
}

// index.html ships only an empty #sheet-root. Everything it shows lives in
// content/, numbered in page order: 1 the system diagram, 2 the model text
// (LaTeX fragment), 3 the glossary (LaTeX fragment), 4 the bibliography
// (BibTeX), 5 the calculation UI. README.md is never fetched here. All are
// spliced together in that order before the init logic below runs.
async function loadSheet() {
  const sheetRoot = document.getElementById('sheet-root');
  const [texSource, glossarySource, bibText, sheetHtml, systemDiagramHtml] = await Promise.all([
    fetch('content/2 Human Metabolic System Model.tex', { cache: 'no-store' }).then((response) => response.text()),
    fetch('content/3 Glossary.tex', { cache: 'no-store' }).then((response) => response.text()),
    fetch('content/4 References.bib', { cache: 'no-store' }).then((response) => response.text()),
    fetch('content/5 Interactive Calculation Sheet.html', { cache: 'no-store' }).then((response) => response.text()),
    fetch('content/1 Human Metabolic System Diagram.html', { cache: 'no-store' }).then((response) => response.text()),
  ]);

  const citationNumberByKey = {};
  parseBibtex(bibText).forEach((entry, index) => { citationNumberByKey[entry.key] = index + 1; });

  const modelHtml = renderReadmeLatex(texSource, citationNumberByKey);
  const modelNodes = [...new DOMParser().parseFromString(modelHtml, 'text/html').body.childNodes];

  // The system diagram goes at the end of its own "Human Metabolic System Diagram"
  // section, after the section's text — the same spot the .tex \input{}s it —
  // found by heading text, not position.
  const overviewIndex = modelNodes.findIndex((node) => node.tagName === 'H2' && node.textContent.trim() === 'Human Metabolic System Diagram');
  const nextSectionIndex = modelNodes.findIndex((node, i) => i > overviewIndex && node.tagName === 'H2');
  modelNodes.forEach((node, i) => {
    if (overviewIndex >= 0 && i === nextSectionIndex) sheetRoot.insertAdjacentHTML('beforeend', systemDiagramHtml);
    sheetRoot.appendChild(document.importNode(node, true));
  });

  sheetRoot.insertAdjacentHTML('beforeend', renderReadmeLatex(glossarySource, citationNumberByKey));
  sheetRoot.insertAdjacentHTML('beforeend', renderReferencesSection(bibText).html);
  sheetRoot.insertAdjacentHTML('beforeend', sheetHtml);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSheet();
  wireSheet();
  initSheet();
  document.getElementById('footer-year').textContent = new Date().getFullYear();
});
