// Match employees (full legal names from Airtable Employe) to the agent
// names that appear in After Sales / Demo Booking single-select fields,
// which are usually first names with assorted spelling variants.
//
// Examples we need to handle:
//   "Deepika Pandey"  ↔  "Deepika"
//   "Anshika Thard"   ↔  "Anshika"
//   "Shradha Salvi"   ↔  "Shraddha"   (single d vs double d)
//   "Nehal Singh"     ↔  "Nehaal"     (extra letter)
//   "MD Shabbir"      ↔  "Shabbir"    (skip honorific)
//   "Elegbede Damilola Janet" ↔ exact

const HONORIFICS = new Set(['md', 'mr', 'ms', 'mrs', 'dr', 'sri', 'shri']);

const norm = (s) => (s || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');

const tokens = (s) => norm(s).split(' ').filter(t => t && !HONORIFICS.has(t));

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

// Allow ~2 char difference for short names (≤6 chars), 3 for longer.
function fuzzyEq(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const tol = Math.min(a.length, b.length) <= 6 ? 2 : 3;
  return levenshtein(a, b) <= tol;
}

// Returns true if the employee should be considered the same person as the
// `agentName` value found in an Airtable single-select.
export function matchAgent(employeeFullName, agentName) {
  if (!employeeFullName || !agentName) return false;
  const empToks = tokens(employeeFullName);
  const agToks  = tokens(agentName);
  if (!empToks.length || !agToks.length) return false;

  const empJoined = empToks.join(' ');
  const agJoined  = agToks.join(' ');
  if (empJoined === agJoined) return true;

  // Multi-word agent (e.g., "Elegbede Damilola Janet"): require all agent
  // tokens to appear in employee tokens (in any order).
  if (agToks.length > 1) {
    return agToks.every(at => empToks.some(et => fuzzyEq(et, at)));
  }

  // Single-token agent (typical case — first name only).
  // Compare against ANY employee token (handles "MD Shabbir" → "Shabbir").
  return empToks.some(et => fuzzyEq(et, agToks[0]));
}

// Pick the best agg row out of a list for an employee. Honors a manual
// override on the employee record (`airtable_agent_name`) for ambiguous cases.
export function findAggForEmployee(employee, aggRows, key = 'agent') {
  if (!aggRows?.length) return null;
  const override = employee?.airtable_agent_name;
  if (override) {
    const exact = aggRows.find(r => norm(r[key]) === norm(override));
    if (exact) return exact;
  }
  return aggRows.find(r => matchAgent(employee.fullName || employee.full_name, r[key]));
}
