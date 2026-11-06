# Experimental Save Manager 0.3.0

[Download the latest experimental ELF](PSN-HUB-Manager-native-0.3.0.elf).
[Read the advanced save-tools guide](../../Manager/SAVE-TOOLS.md).

This ELF was built by [GitHub Actions run 42266124428](https://github.com/ItssJustAaron/PSN-HUB2/actions/runs/42266124428)
from source commit `a782669bd72a31be68602aae3134c23a0595a2e5`.
SHA-256: `f021c7fa6697d93d03c036ed2d64bd678764cf01d2819bf5138957ae08c19ed8`.
Manager UI release: `2026.11.06.4`; matching UI build: `ec83a64594e7`.

1. Upload and send this ELF through the stable Manager.
2. Open `http://<PS5-IP>:8087` and select **Save Manager (WIP)**.
3. Choose **Open advanced save tools**, then **Start save engine**.
4. Approve the payload send review. When Garlic SaveMgr starts, choose **Check engine**.
5. Select decrypt, encrypt, resign or import/restore. Imports have a backup and review step.

PSN-HUB provides raw save access, snapshots and integration controls. The
separately launched, unmodified Garlic SaveMgr engine by earthonion performs PFS
and account operations on port 8082. Its pinned binary is included in this repo.
The normal jailbreak continues to start the stable Manager on port 8085.

Raw save access was confirmed working by the user. All 14 native tests, UI/
protocol tests and the PS5 build passed; advanced on-console testing is pending.
Close games before importing and keep independent verified backups.
Automatic backups, unattended bulk restores and database-wide rollback are not
provided. Limits and backup scope are described in the guide.

Version 0.2.0 remains available for reproducing the earlier raw-access build.
