<<<<<<< Updated upstream
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
=======
# PSN-HUB Manager Save Manager handoff

The current `main` branch uses a newer layout than the downloaded folder
`PSN-HUB2-main (1)`. Its Manager UI lives at `manager/dashboard.html`; the
experimental native server is in `native/src/` and runs on port 8087. The stable
ELF runs on port 8085. Do not copy the old `native-manager/server.c` or its ELF
over the newer layout.

The current GitHub build now labels the Save Manager tab **WIP** and shows the
requested **Use at your own risk** disclaimer. The current GitHub build has no
save operations wired up yet. The earlier local download folder contains an
experimental implementation for save listing, raw downloads, manual title
backups, and auto-backups, but it has not been ported to this newer native server
or verified on-console.

Planned next work: port read-only save discovery and backup routes into the
current `native/src/server.c` using its descriptor-relative storage helpers,
then integrate the dashboard to the experimental API. Implement decrypt/encrypt,
resign/import, restore, and USB support only after safe interfaces and console
verification are available.

Credits: Garlic SaveMgr and Garlic Worker by earthonion. Garlic Worker is
GPL-3.0; no Garlic source or ELF is bundled in this handoff.
>>>>>>> Stashed changes
