/* =========================================================================
   Syngyn Peptide Research Library — reference data (deterministic, static)
   -------------------------------------------------------------------------
   TIGHTEST RUO FRAMING. This is an educational reference organizer. For each
   research compound it summarizes (a) its class, (b) HOW IT WORKS mechanistically
   as described in the literature, and (c) WHAT RESEARCHERS STUDY IT FOR — as
   research areas / models, never as uses, indications, doses, or human-use
   guidance. No "take X for Y." Mirrors the store's research-use-only posture.
   ========================================================================= */

const VERSION = '1.0.0'

// goals = filter tags. `how` = mechanism. `researched` = research areas.
// `markers` (optional) = blood markers the literature tracks → Blueprint.
const PEPTIDES = [
  // ---- Recovery / healing ----
  { id: 'bpc', name: 'BPC-157', code: 'Wolverine', cls: 'Synthetic pentadecapeptide (BPC fragment)', goals: ['recovery', 'gut'],
    how: 'A stable fragment of a protein found in gastric juice. In research models it upregulates growth-factor and VEGFR2 signaling and modulates the nitric-oxide system — the pathway most associated with new blood-vessel formation and tissue repair.',
    researched: 'Soft-tissue, tendon and ligament repair models; gut-lining and ulcer models; and angiogenesis (new blood-vessel formation).' },
  { id: 'tb500', name: 'TB-500 (Thymosin β4)', cls: 'Actin-binding peptide (Tβ4 fragment)', goals: ['recovery'],
    how: 'A synthetic version of a region of thymosin beta-4, a protein that regulates actin — the cell’s structural scaffold. In the literature it promotes the cell migration and angiogenesis that tissue uses to rebuild after injury.',
    researched: 'Wound healing, muscle and tendon repair, and cardiac-tissue models; frequently paired with BPC-157 in recovery research.' },
  { id: 'ghkcu', name: 'GHK-Cu', cls: 'Copper tripeptide', goals: ['recovery', 'skin'],
    how: 'A tripeptide that carries copper into tissue. Copper is a cofactor for the enzymes that build and remodel collagen and elastin, and the peptide also shows antioxidant activity in research models.',
    researched: 'Skin regeneration and collagen synthesis, wound healing, and hair-follicle models.' },
  { id: 'kpv', name: 'KPV', cls: 'α-MSH C-terminal tripeptide', goals: ['gut', 'recovery'],
    how: 'The tail fragment of the alpha-MSH hormone, carrying its anti-inflammatory activity. In research it dampens NF-κB and mast-cell signaling without the pigmentation activity of the full hormone.',
    researched: 'Gut inflammation (colitis / IBD models) and inflammatory skin conditions.' },
  { id: 'glow', name: 'Glow (BPC + TB-500 + GHK-Cu)', code: 'Glow', cls: 'Blend — three recovery peptides', goals: ['recovery', 'skin'],
    how: 'Combines the three most-studied recovery peptides so their mechanisms overlap — BPC-157 and TB-500 on tissue repair and angiogenesis, GHK-Cu on collagen and skin.',
    researched: 'Systemic recovery and skin/tissue repair studied as a combined research protocol.' },
  { id: 'klow', name: 'Klow (BPC + TB-500 + GHK-Cu + KPV)', code: 'Klow', cls: 'Blend — Glow + KPV', goals: ['recovery', 'gut', 'skin'],
    how: 'The Glow trio plus KPV, adding a melanocortin-derived anti-inflammatory arm to the recovery and skin stack.',
    researched: 'Recovery, gut and skin research studied as a combined protocol.' },

  // ---- GH axis ----
  { id: 'ipamorelin', name: 'Ipamorelin', cls: 'Ghrelin-receptor agonist (GH secretagogue)', goals: ['gh'],
    how: 'A selective secretagogue: it binds the ghrelin (GHS) receptor in the pituitary to trigger a natural growth-hormone pulse, with little effect on cortisol or prolactin in research models.',
    researched: 'Growth-hormone axis and body-composition models.', markers: ['Fasting Glucose', 'Fasting Insulin', 'IGF-1'] },
  { id: 'cjc', name: 'CJC-1295 (DAC)', cls: 'GHRH analog (long-acting)', goals: ['gh'],
    how: 'A modified growth-hormone-releasing hormone. The DAC (drug-affinity complex) binds albumin so it stays active far longer, extending GH-releasing signaling. Commonly paired with a ghrelin-receptor agonist in research.',
    researched: 'Growth-hormone axis research.', markers: ['Fasting Glucose', 'Fasting Insulin', 'IGF-1'] },
  { id: 'sermorelin', name: 'Sermorelin', cls: 'GHRH(1-29) analog', goals: ['gh'],
    how: 'The shortest active fragment of GHRH. It binds pituitary GHRH receptors to stimulate the body’s own GH release.',
    researched: 'Growth-hormone-deficiency and aging-axis models.', markers: ['Fasting Glucose', 'IGF-1'] },
  { id: 'tesamorelin', name: 'Tesamorelin', cls: 'Stabilized GHRH analog', goals: ['gh', 'metabolic'],
    how: 'A GHRH analog engineered for stability. In clinical research it raises GH/IGF-1 and is notable for its effect on visceral (deep abdominal) fat.',
    researched: 'Visceral-adipose-tissue and metabolic models.', markers: ['Fasting Glucose', 'IGF-1'] },
  { id: 'hgh', name: 'HGH 191AA', code: '191aa', cls: 'Recombinant human growth hormone', goals: ['gh'],
    how: 'Bio-identical 191-amino-acid growth hormone. It acts on GH receptors throughout the body and drives IGF-1 production in the liver — the downstream signal behind most of its studied effects.',
    researched: 'Growth-hormone deficiency, body composition, and tissue-recovery models.', markers: ['Fasting Glucose', 'Fasting Insulin', 'HbA1c', 'IGF-1'] },
  { id: 'igf', name: 'IGF-1 LR3', cls: 'Long-acting IGF-1 analog', goals: ['gh'],
    how: 'A modified insulin-like growth factor 1 with reduced binding-protein affinity, so it stays active far longer than native IGF-1. It signals through the IGF-1 receptor to drive cell growth and metabolism.',
    researched: 'Muscle-hypertrophy and metabolic/growth models.', markers: ['Fasting Glucose', 'Fasting Insulin'] },

  // ---- Metabolic / GLP ----
  { id: 'sema', name: 'Semaglutide', code: 'GLP-1', cls: 'GLP-1 receptor agonist (incretin)', goals: ['metabolic'],
    how: 'Mimics the gut hormone GLP-1: it enhances glucose-dependent insulin release, slows gastric emptying, and acts on appetite centers in the brain.',
    researched: 'Glucose regulation and body-weight / metabolic models.', markers: ['Fasting Glucose', 'HbA1c'] },
  { id: 'tirz', name: 'Tirzepatide', cls: 'Dual GIP / GLP-1 agonist', goals: ['metabolic'],
    how: 'Activates two incretin receptors — GIP and GLP-1 — at once, combining their effects on insulin, appetite and energy balance in research models.',
    researched: 'Glucose and body-weight / metabolic models.', markers: ['Fasting Glucose', 'HbA1c'] },
  { id: 'reta', name: 'Retatrutide', code: 'GLP3', cls: 'Triple GIP / GLP-1 / glucagon agonist', goals: ['metabolic'],
    how: 'A triple agonist that adds glucagon-receptor activity to the GIP/GLP-1 combination, which in research also engages energy expenditure alongside appetite and glucose.',
    researched: 'Metabolic and body-weight models — the newest GLP-class research compound.', markers: ['Fasting Glucose', 'HbA1c'] },
  { id: 'motsc', name: 'MOTS-C', cls: 'Mitochondrial-derived peptide', goals: ['metabolic', 'longevity'],
    how: 'A peptide encoded in mitochondrial DNA. It activates AMPK — the cell’s energy sensor — which in research shifts metabolism toward glucose use and exercise adaptation.',
    researched: 'Metabolic health, exercise capacity, and longevity models.' },
  { id: 'nad', name: 'NAD+', cls: 'Pyridine coenzyme', goals: ['metabolic', 'longevity'],
    how: 'A coenzyme central to cellular energy (redox reactions) and to the sirtuin and PARP enzymes involved in repair and aging. Levels fall with age, which is why it is a longevity-research focus.',
    researched: 'Cellular aging / longevity, mitochondrial function, and metabolism.' },

  // ---- Longevity / mitochondrial ----
  { id: 'epitalon', name: 'Epitalon', cls: 'Pineal tetrapeptide (Ala-Glu-Asp-Gly)', goals: ['longevity'],
    how: 'A synthetic version of a pineal-gland peptide. In research it is associated with telomerase activation and normalization of melatonin / circadian rhythm.',
    researched: 'Aging / longevity and circadian-rhythm models.' },
  { id: 'ss31', name: 'SS-31 (Elamipretide)', cls: 'Mitochondria-targeting tetrapeptide', goals: ['longevity', 'metabolic'],
    how: 'Concentrates in the inner mitochondrial membrane and binds cardiolipin, stabilizing the electron-transport machinery so cells produce energy more efficiently in research models.',
    researched: 'Mitochondrial-disease, cardiac, and age-related-decline models.' },

  // ---- Cognitive / sleep ----
  { id: 'selank', name: 'Selank', cls: 'Tuftsin analog (anxiolytic peptide)', goals: ['cognitive'],
    how: 'A synthetic analog of the immune peptide tuftsin. In research it modulates GABA and serotonin signaling and raises BDNF, with anxiolytic and immune effects.',
    researched: 'Anxiety, cognition, and immune models.' },
  { id: 'semax', name: 'Semax', cls: 'ACTH(4-10) analog (nootropic peptide)', goals: ['cognitive'],
    how: 'A fragment analog of ACTH with the hormonal activity removed. In research it modulates BDNF and NGF and shows neuroprotective activity.',
    researched: 'Cognition, focus, and neuroprotection / stroke models.' },
  { id: 'dsip', name: 'DSIP', cls: 'Delta sleep-inducing peptide', goals: ['cognitive'],
    how: 'A naturally occurring peptide first isolated for its link to deep (delta-wave) sleep. In research it modulates sleep architecture and the stress axis.',
    researched: 'Sleep and stress-response models.' },
  { id: 'adamax', name: 'Adamax', cls: 'Nootropic research peptide', goals: ['cognitive'],
    how: 'A newer nootropic research peptide in the Semax / Selank family of cognitive compounds. It is less characterized in the published literature than the peptides above.',
    researched: 'Cognition and focus models — early / limited research.' },

  // ---- Libido / skin ----
  { id: 'pt141', name: 'PT-141 (Bremelanotide)', cls: 'Melanocortin MC4R agonist', goals: ['libido'],
    how: 'Acts on melanocortin receptors (mainly MC4R) in the central nervous system — a brain pathway tied to sexual arousal, distinct from the vascular route of ED drugs.',
    researched: 'Sexual-arousal / dysfunction models.' },
  { id: 'mt2', name: 'Melanotan II (MT-2)', cls: 'Melanocortin agonist (MC1R / MC4R)', goals: ['skin', 'libido'],
    how: 'A non-selective melanocortin agonist. Through MC1R it stimulates melanin production (pigmentation); through MC4R it engages the same arousal pathway as PT-141.',
    researched: 'Skin pigmentation / tanning and libido models.' },

  // ---- Immune ----
  { id: 'ta1', name: 'Thymosin Alpha-1', cls: 'Immune-modulating peptide', goals: ['immune'],
    how: 'A fragment of the thymic protein prothymosin. It helps mature and direct T-cells, tuning the immune response in research models.',
    researched: 'Immune function, infection, and vaccine-adjuvant models.' },
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
  { id: 'immune', name: 'Immune', icon: '🛡️' },
]

function search(peptides, goalId, query) {
  let list = peptides
  if (goalId && goalId !== 'all') list = list.filter((p) => p.goals.includes(goalId))
  const q = (query || '').trim().toLowerCase()
  if (q) {
    list = list.filter((p) =>
      (p.name + ' ' + (p.code || '') + ' ' + p.cls + ' ' + p.researched + ' ' + p.how).toLowerCase().includes(q)
    )
  }
  return list
}

if (typeof window !== 'undefined') { window.PeptideLibrary = { PEPTIDES, GOALS, search, VERSION } }
