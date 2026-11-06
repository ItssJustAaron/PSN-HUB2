# Save Manager handoff

## Current state

The PSN-HUB Manager dashboard has a **SAVE MANAGER (WIP)** tab. It says **Use at your own risk** and clearly explains that save operations are not implemented in this GitHub build.

No save listing, backup, decrypt/encrypt, resign, import, restore, or export feature is currently available. The earlier experimental work from a different local folder was not ported into this repository because the repository uses a newer native server and file layout. Do not copy an older Manager ELF or backend over this project.

## Next implementation work

- Port save support into the current native server architecture.
- Confirm the PS5 save-data access methods and permissions supported by the target environment.
- Implement read-only save listing and raw downloads first.
- Add manual backups before any restore or transformation features.
- Add opt-in automatic backups only after manual backup and restore have been validated on-console.
- Verify behavior with real PS5 saves before removing the WIP warning.

## Research credit

Research references: [Garlic SaveMgr](https://github.com/earthonion/garlic-savemgr) and [Garlic Worker](https://github.com/earthonion/garlic-worker) by earthonion. These projects informed the research; their code and binaries are not included here.
