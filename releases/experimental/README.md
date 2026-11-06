# Experimental Save Manager 0.3.2

[Download the latest experimental Manager ELF](PSN-HUB-Manager-native-0.3.2.elf).
[Read the save-tools guide](../../Manager/SAVE-TOOLS.md).

Built by [GitHub Actions run 42280923990](https://github.com/ItssJustAaron/PSN-HUB2/actions/runs/42280923990)
from source `b84eca06488d2295cfe3b164613e84aa9c961ae0`.
SHA-256: `83aa6f56b5e2f4c700eb7c666c91d07815d99f437ce55b14786177b548cfdc34`.
UI release: `2026.11.06.5`; matching build: `232a0e643482`.

This version fixes PS5 fallback filesystem syscall error handling. The service
was started successfully on a real PS5 and read-only save discovery was verified.
The separate background updater was also verified on-console, with database
backups and six committed artwork references. Advanced save transformations and
imports still require on-console validation before promotion to stable.

1. Send this ELF through the stable Manager after jailbreaking.
2. Open `http://<PS5-IP>:8087` and select **SAVES (WIP)**.
3. For advanced operations choose **Open advanced save tools → Start save engine**.
4. Review the payload send, wait for Garlic SaveMgr, then choose **Check engine**.
5. Imports stage the save, back up existing title data and require a review.

Garlic SaveMgr by earthonion performs the local PFS/account operations on 8082.
The normal jailbreak still starts the stable Manager on 8085. Close games before
imports and keep independent verified backups. Automatic backups, unattended
bulk restores and database-wide rollback are not provided.

The Payloads tab includes a weed-themed jailbreak background preview and guarded
Apply/Restore controls. See [the background guide](../../native/shortcut/BACKGROUND.md).
Earlier versioned ELFs are retained for reproducing their respective builds.
