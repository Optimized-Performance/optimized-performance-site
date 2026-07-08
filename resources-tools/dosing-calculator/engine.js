/* ============================================================
   FORGED DOSING CALCULATOR — calculation engine
   Pure math. No recommendations. The user supplies every input;
   we only convert between mg / mcg / mL / insulin units.

   Conventions:
   - Insulin ("slin") syringe is U-100: 100 units = 1.00 mL.
   - Peptide doses are handled in mcg internally.
   - Oil/gear doses are handled in mg internally.
   ============================================================ */

const FORGED_RECON = (function () {
  const U100_UNITS_PER_ML = 100;

  // frequency -> how the weekly schedule breaks down
  // injPerWeek is used to split a weekly dose; daysPerDose is used for vial-duration.
  const FREQUENCIES = {
    daily:   { label: "Daily",            injPerWeek: 7,   daysPerDose: 1   },
    eod:     { label: "Every other day",  injPerWeek: 3.5, daysPerDose: 2   },
    twice:   { label: "Twice / week",     injPerWeek: 2,   daysPerDose: 3.5 },
    weekly:  { label: "Once / week",      injPerWeek: 1,   daysPerDose: 7   },
  };

  const round = (n, dp) => {
    const f = Math.pow(10, dp);
    return Math.round((n + Number.EPSILON) * f) / f;
  };

  function freq(key) {
    return FREQUENCIES[key] || FREQUENCIES.weekly;
  }

  /* ----------------------------------------------------------
     PEPTIDE RECONSTITUTION
     in:  vialMg     – mg of peptide in the vial (lyophilized)
          bacMl      – mL of bacteriostatic water added
          doseValue  – number the user wants per administration
          doseUnit   – 'mcg' | 'mg'
          frequency  – key in FREQUENCIES
     out: concentration, units to draw on a U-100 pin, doses/vial, duration
     ---------------------------------------------------------- */
  function peptide({ vialMg, bacMl, doseValue, doseUnit, frequency }) {
    const errors = [];
    if (!(vialMg > 0))   errors.push("Enter the mg of peptide in the vial.");
    if (!(bacMl > 0))    errors.push("Enter how much BAC water you're adding.");
    if (!(doseValue > 0)) errors.push("Enter the dose you want per shot.");
    if (errors.length) return { ok: false, errors };

    const f = freq(frequency);
    const doseMcg = doseUnit === "mg" ? doseValue * 1000
                  : doseUnit === "IU" ? doseValue * (1000 / 3)   // HGH 191aa (somatropin): 3 IU = 1 mg
                  : doseValue;

    const concMgMl   = vialMg / bacMl;            // mg per mL
    const concMcgMl  = concMgMl * 1000;           // mcg per mL
    const mcgPerUnit = concMcgMl / U100_UNITS_PER_ML; // mcg per insulin unit

    const volumeMl = doseMcg / concMcgMl;         // mL per dose
    const units    = volumeMl * U100_UNITS_PER_ML; // units on a U-100 pin

    const vialMcg     = vialMg * 1000;
    const dosesPerVial = vialMcg / doseMcg;
    const durationDays = dosesPerVial * f.daysPerDose;
    const weeklyMcg    = doseMcg * f.injPerWeek;

    const warnings = [];
    if (units > 100) warnings.push("This dose is more than 1 mL — it won't fit in a single U-100 insulin syringe. Use a larger pin or split the shot.");
    if (units > 0 && units < 2) warnings.push("Under 2 units per draw is hard to measure accurately on a slin pin. Consider adding less BAC water for a more concentrated, easier-to-read draw.");
    if (volumeMl > 0 && bacMl > 0 && dosesPerVial < 1) warnings.push("Your chosen dose is larger than the whole vial — double-check the numbers.");

    return {
      ok: true,
      warnings,
      inputs: { vialMg, bacMl, doseMcg, frequency: f.label, injPerWeek: f.injPerWeek },
      concMgMl:   round(concMgMl, 3),
      concMcgMl:  round(concMcgMl, 1),
      mcgPerUnit: round(mcgPerUnit, 2),
      units:      round(units, 1),
      volumeMl:   round(volumeMl, 3),
      dosesPerVial:  Math.floor(dosesPerVial + 0.02),  // tolerate float/mg-rounding (e.g. 10 IU vial = 3.33 mg -> 4.99 -> 5)
      dosesPerVialExact: round(dosesPerVial, 1),
      durationDays:  round(durationDays, 0),
      durationWeeks: round(durationDays / 7, 1),
      weeklyMcg:     round(weeklyMcg, 0),
      weeklyMg:      round(weeklyMcg / 1000, 2),
    };
  }

  /* ----------------------------------------------------------
     OIL / GEAR INJECTION (test, nandrolone, etc.)
     in:  concMgMl   – mg per mL of the oil (e.g. 250 for Test E)
          weeklyMg   – total mg the user wants per week
          frequency  – key in FREQUENCIES
     out: mg/injection, mL/injection, units on a U-100 pin
     ---------------------------------------------------------- */
  function oil({ concMgMl, weeklyMg, frequency }) {
    const errors = [];
    if (!(concMgMl > 0)) errors.push("Enter the concentration of your oil (mg/mL).");
    if (!(weeklyMg > 0)) errors.push("Enter your total weekly dose (mg).");
    if (errors.length) return { ok: false, errors };

    const f = freq(frequency);
    const mgPerInjection = weeklyMg / f.injPerWeek;
    const mlPerInjection = mgPerInjection / concMgMl;
    const unitsPerInjection = mlPerInjection * U100_UNITS_PER_ML;

    const warnings = [];
    if (mlPerInjection > 2) warnings.push(`That's ${round(mlPerInjection,2)} mL of oil in one shot — a lot of volume for a single site. Many split it across two sites or inject more frequently.`);
    if (unitsPerInjection > 100) warnings.push("Over 100 units — this won't fit in a single U-100 insulin syringe. Use a 3 mL barrel or split the shot.");

    return {
      ok: true,
      warnings,
      inputs: { concMgMl, weeklyMg, frequency: f.label, injPerWeek: f.injPerWeek },
      injPerWeek: f.injPerWeek,
      mgPerInjection: round(mgPerInjection, 1),
      mlPerInjection: round(mlPerInjection, 3),
      unitsPerInjection: round(unitsPerInjection, 1),
    };
  }

  return { peptide, oil, FREQUENCIES, round };
})();

if (typeof module !== "undefined" && module.exports) module.exports = FORGED_RECON;
