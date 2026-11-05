# Emulator installer payloads

Place emulator installer `.elf` files here, optionally in named subfolders.
Add descriptions, instructions and confirmed firmware support in
`Manager/descriptions.json`, keyed by paths such as `Emulators/MyEmulator.elf`.
Rebuild with `python tools/build-manager.py` and upload the generated files.

Manager sends the ELF to the console loader. Installation behavior and location
are determined by the payload itself.
