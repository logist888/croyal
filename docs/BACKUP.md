# Backup Policy

**Rule: before coding in any run, save a backup first — to Git AND locally — then
code.** Depth is exactly **two builds**: from the 2nd run onward the **current** and
**previous** builds are both retained; older ones are overwritten.

## What runs
`scripts/backup.sh` (also `npm run backup`) does both halves:

1. **Local rotation** into `backups/` (git-ignored, machine-local):
   - `backups/previous` ← old `backups/current`
   - `backups/current`  ← a fresh snapshot of the working tree
     (excludes `.git`, `node_modules`, `backups`, `dist`)
2. **Git backup**:
   - commits the current state on the working branch, and
   - force-moves a build tag (e.g. `build-2`) onto it.

So after run N you have `build-N` (current) + `build-(N-1)` (previous) both locally
(`backups/current`, `backups/previous`) and as Git commits/tags.

## Usage
```bash
# At the START of every coding run, before changing code:
npm run backup -- build-<N>     # e.g. build-2

# ...then code, test, and commit your actual changes as usual.
```

`backups/` is in `.gitignore` — local snapshots are never committed (they would
duplicate history); Git history + tags are the shareable backup.

## Restore
- **Local:** copy files back from `backups/previous/` (the prior build) or
  `backups/current/`.
- **Git:** `git checkout build-<N-1>` (previous) or reset to the desired tag.

## Run log
Each build is also recorded in [CHANGELOG.md](CHANGELOG.md) (build number + what
changed) so backups are traceable to a description.
