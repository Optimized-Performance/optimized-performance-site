/* =========================================================================
   Forged Peptide Protocol Designer — research organizer (deterministic)
   -------------------------------------------------------------------------
   TIGHTEST RUO FRAMING IN THE SUITE. This tool does NOT recommend, prescribe,
   or endorse any peptide, dose, or protocol for any human use. It is a
   research-organization reference: the user selects research goals + peptides,
   and it organizes a reference sheet — what each is COMMONLY RESEARCHED FOR,
   how it's reconstituted (→ Dosing Calculator for the math), what markers the
   literature associates with it (→ Blueprint), and where to source research
   forms (→ OPP). Everything is for research/educational reference only.

   No doses. No "take X for Y." Mirrors OPP's research-use-only posture.
   ========================================================================= */

const VERSION = '1.0.0'

// Public code names (per OPP convention) shown where they apply.
const PEPTIDES = [
  { id: 'bpc', name: 'BPC-157', code: 'Wolverine', goals: ['recovery', 'gut'], form: 'lyophilized',
    researched: 'Studied in the context of soft-tissue and gut-lining repair models.', monitor: [] },
  { id: 'tb500', name: 'TB-500 (Thymosin β4)', goals: ['recovery'], form: 'lyophilized',
    researched: 'Studied alongside BPC-157 in recovery/angiogenesis research.', monitor: [] },
  { id: 'ghkcu', name: 'GHK-Cu', goals: ['recovery', 'skin'], form: 'lyophilized',
    researched: 'Copper peptide studied for skin/collagen and wound models.', monitor: [] },
  { id: 'kpv', name: 'KPV', goals: ['gut', 'recovery'], form: 'lyophilized',
    researched: 'Studied for anti-inflammatory / gut models.', monitor: [] },
  { id: 'glow', name: 'Glow (BPC + TB-500 + GHK-Cu)', code: 'Glow', goals: ['recovery', 'skin'], form: 'lyophilized',
    researched: 'Combination blend studied across the recovery/skin literature.', monitor: [] },
  // GH secretagogues
  { id: 'ipamorelin', name: 'Ipamorelin', goals: ['gh'], form: 'lyophilized',
    researched: 'Selective GH-secretagogue research compound.', monitor: ['Fasting Glucose', 'Fasting Insulin', 'IGF-1'] },
  { id: 'cjc', name: 'CJC-1295 (DAC)', goals: ['gh'], form: 'lyophilized',
    researched: 'GHRH-analog research compound, commonly paired with a secretagogue.', monitor: ['Fasting Glucose', 'Fasting Insulin', 'IGF-1'] },
  { id: 'sermorelin', name: 'Sermorelin', goals: ['gh'], form: 'lyophilized',
    researched: 'GHRH-analog research compound.', monitor: ['Fasting Glucose', 'IGF-1'] },
  { id: 'hgh', name: 'HGH 191AA', code: '191aa', goals: ['gh'], form: 'lyophilized',
    researched: 'Recombinant GH research compound; metabolic markers are the literature focus.', monitor: ['Fasting Glucose', 'Fasting Insulin', 'HbA1c', 'IGF-1'] },
  { id: 'igf', name: 'IGF-1 LR3', goals: ['gh'], form: 'lyophilized',
    researched: 'IGF-1 analog research compound.', monitor: ['Fasting Glucose', 'Fasting Insulin'] },
  // Metabolic / GLP
  { id: 'sema', name: 'Semaglutide', goals: ['metabolic'], form: 'lyophilized',
    researched: 'GLP-1 research compound; glucose/appetite literature.', monitor: ['Fasting Glucose', 'HbA1c'] },
  { id: 'tirz', name: 'Tirzepatide', goals: ['metabolic'], form: 'lyophilized',
    researched: 'Dual GIP/GLP-1 research compound.', monitor: ['Fasting Glucose', 'HbA1c'] },
  { id: 'reta', name: 'Retatrutide', code: 'GLP3', goals: ['metabolic'], form: 'lyophilized',
    researched: 'Triple-agonist research compound; glucose/metabolic literature.', monitor: ['Fasting Glucose', 'HbA1c'] },
  { id: 'motsc', name: 'MOTS-C', goals: ['metabolic', 'longevity'], form: 'lyophilized',
    researched: 'Mitochondrial-derived peptide studied in metabolic/longevity models.', monitor: [] },
  // Longevity / cognitive / other
  { id: 'epitalon', name: 'Epitalon', goals: ['longevity'], form: 'lyophilized',
    researched: 'Studied in telomere/longevity research models.', monitor: [] },
  { id: 'selank', name: 'Selank', goals: ['cognitive'], form: 'lyophilized',
    researched: 'Studied in anxiolytic/cognitive research models.', monitor: [] },
  { id: 'dsip', name: 'DSIP', goals: ['cognitive'], form: 'lyophilized',
    researched: 'Delta-sleep-inducing peptide studied in sleep research.', monitor: [] },
  { id: 'pt141', name: 'PT-141 (Bremelanotide)', goals: ['libido'], form: 'lyophilized',
    researched: 'Melanocortin-agonist studied for libido/arousal models.', monitor: [] },
]

const GOALS = [
  { id: 'recovery', name: 'Recovery & healing', icon: '🩹' },
  { id: 'gh', name: 'GH / growth axis', icon: '📈' },
  { id: 'metabolic', name: 'Metabolic / body comp', icon: '🔥' },
  { id: 'longevity', name: 'Longevity / mitochondrial', icon: '🧬' },
  { id: 'cognitive', name: 'Cognitive / sleep', icon: '🧠' },
  { id: 'gut', name: 'Gut & immune', icon: '🦠' },
  { id: 'libido', name: 'Libido', icon: '❤️' },
  { id: 'skin', name: 'Skin / collagen', icon: '✨' },
]

function peptidesForGoals(goalIds) {
  if (!goalIds || !goalIds.length) return PEPTIDES
  return PEPTIDES.filter((p) => p.goals.some((g) => goalIds.includes(g)))
}

function design(selectedIds) {
  const items = selectedIds.map((id) => PEPTIDES.find((p) => p.id === id)).filter(Boolean)
  if (!items.length) return { empty: true }
  const monitor = [...new Set(items.flatMap((p) => p.monitor))]
  const reconstitute = items.filter((p) => p.form === 'lyophilized')
  const ghLoad = items.some((p) => p.goals.includes('gh')) || items.some((p) => p.goals.includes('metabolic'))
  return { items, monitor, reconstitute, ghLoad, empty: false }
}

if (typeof window !== 'undefined') { window.PeptideEngine = { PEPTIDES, GOALS, peptidesForGoals, design, VERSION } }
