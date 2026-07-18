# Finsec repository instructions

## Source-file size

- Treat 400 physical lines as a hard ceiling for hand-written source files; target 150-300 lines.
- Before an edit would cross 400 lines, split the file by responsibility in the same change.
- Do not evade the ceiling by minifying, collapsing readable statements, or moving unrelated code into a generic utility file.
- Generated files, lockfiles, migrations, fixtures, and vendored code are exempt.
- Existing oversized files are grandfathered debt: do not grow them, and split them when the task materially touches them.
- Prefer deleting duplicate paths and unused compatibility fields before adding abstractions.
- Keep frontend and backend request/response contracts synchronized.
