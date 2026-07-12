// Single source of truth for US shipping destinations — used by BOTH the
// checkout State dropdown AND the server-side US-only shipping gate in
// /api/orders/create, so the two can never drift (the client/server parity
// lesson from the whitespace email bug). Includes the 50 states, DC, the
// inhabited territories, and military (APO/FPO) codes — all USPS-domestic, so
// excluding them would wrongly block legitimate US customers.
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'GU', name: 'Guam' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'AA', name: 'Armed Forces Americas (AA)' },
  { code: 'AE', name: 'Armed Forces Europe (AE)' },
  { code: 'AP', name: 'Armed Forces Pacific (AP)' },
]

const US_STATE_LOOKUP = new Set()
for (const s of US_STATES) {
  US_STATE_LOOKUP.add(s.code.toLowerCase())
  US_STATE_LOOKUP.add(s.name.toLowerCase())
}

// Accept either the 2-letter code or the full name (case-insensitive). The
// dropdown submits the code ("PA"); older orders + browser autofill may submit
// the full name ("Pennsylvania") — both must validate so legacy/edge inputs
// aren't wrongly rejected. Anything else (a foreign state/province) → false.
export function isUsState(value) {
  if (typeof value !== 'string') return false
  return US_STATE_LOOKUP.has(value.trim().toLowerCase())
}

// ── Canada (2026-07-11: Canada shipping enabled — flat $50, customs-risk
// acknowledgment required at checkout; see lib/shipping + orders/create) ──
export const CA_PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
]

const CA_PROVINCE_LOOKUP = new Set(
  CA_PROVINCES.flatMap((p) => [p.code.toLowerCase(), p.name.toLowerCase()])
)

export function isCaProvince(value) {
  if (typeof value !== 'string') return false
  return CA_PROVINCE_LOOKUP.has(value.trim().toLowerCase())
}

// Canadian postal code (A1A 1A1, space optional). Mirrors client + server.
export function isCaPostal(value) {
  if (typeof value !== 'string') return false
  return /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(value.trim())
}
