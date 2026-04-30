/**
 * Strip REFERENCES / FOREIGN KEY constraints from a D1 SQL dump so it can be
 * applied to an empty SQLite DB (Wrangler export order is often invalid).
 *
 * Order matters: remove full FOREIGN KEY lines BEFORE inline REFERENCES,
 * otherwise REFERENCES inside FOREIGN KEY gets stripped and leaves junk.
 *
 * Usage: node scripts/strip-d1-column-references.mjs [input.sql] [output.sql]
 */
import fs from 'node:fs'
import path from 'node:path'

const input = path.resolve(process.argv[2] ?? 'remote-d1.sql')
const output = path.resolve(process.argv[3] ?? 'remote-d1-import.sql')

let s = fs.readFileSync(input, 'utf8')

// 1) Table-level FOREIGN KEY (…) REFERENCES … (same line in this dump)
const tableFk =
  /,?\s*FOREIGN KEY\s*\([^)]+\)\s*REFERENCES\s+(?:"[^"]+"|`[^`]+`|\w+)\s*\([^)]*\)(?:\s+ON\s+UPDATE\s+[^,\n)]+)?(?:\s+ON\s+DELETE\s+[^,\n)]+)?/gi

// 2) Column-level REFERENCES … (not part of FOREIGN KEY — run after tableFk)
const colRef =
  /\s+REFERENCES\s+(?:"[^"]+"|`[^`]+`|\w+)\s*\([^)]*\)(?:\s+ON\s+UPDATE\s+[^,\n)]+)?(?:\s+ON\s+DELETE\s+[^,\n)]+)?/gi

for (let i = 0; i < 30; i++) {
  const next = s.replace(tableFk, '').replace(colRef, '')
  if (next === s) break
  s = next
}

// Orphan FOREIGN KEY lines (if any)
s = s.replace(/\n[ \t]*FOREIGN KEY\s*\([^)]*\)[ \t]*(?=\n)/g, '\n')

s = s.replace(/,(\s*),/g, ',')

fs.writeFileSync(output, s)
console.log(`Wrote ${output} (${(s.length / 1024).toFixed(1)} KiB)`)
