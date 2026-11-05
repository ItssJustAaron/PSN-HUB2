# Native Manager source still required

The project currently includes `payloads/PSN-HUB-Manager.elf`, not the C/C++
source or native build toolchain that produced it. The web builder edits only
the ELF's embedded dashboard slot; it does not compile a native Manager.

Place the original, appropriately licensed source project here when available,
including its build files and PS5 SDK/toolchain requirements. Preserve its
license and author credits. `Manager/NATIVE-API.md` documents the integration
needed for console inventory, additional cheat destinations and backup/restore.

Neither the release workflow nor a source folder can recover that implementation
from the compiled payload. Native compilation and those storage features remain
unavailable until the real source/build project is supplied.
