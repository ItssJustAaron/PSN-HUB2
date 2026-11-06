# Experimental Save Manager 0.3.3

Use the normal Manager's **Saves** tab to open the console save browser. It lists current PS4/PS5 save folders and offers raw file downloads, per-game USB exports and optional automatic USB backups.

- [Dedicated save-service ELF](../../payloads/PSN-HUB-Save-Service.elf): port **8088**, SHA-256 `9982f52ecc3cda1a606518bb0879c5fff69f20280c7e48e25ae4fa6cdd7d4d6a`.
- [Experimental full Manager ELF](PSN-HUB-Manager-native-0.3.3.elf): port **8087**, SHA-256 `8ee3e4c7f961836ab36d55128d1781402cf73f049744314a15cd394102ff7952`.
- Stable Manager remains on **8085**.

Built by [Actions run 42295669661](https://github.com/ItssJustAaron/PSN-HUB2/actions/runs/42295669661) from source `a786bea`. All 17 native integration tests passed. The dedicated service was started on a PS5 and found 13 save folders. Physical USB writes still need validation with a connected drive.

After rebooting the PS5, select **Start save service**, then **Reload save browser** in the normal Manager Saves tab. Automatic USB backup is off by default; its selected drive and interval are saved on the console. It runs while the save service is active. Existing saves are preserved, unchanged saves are skipped, and backups are not automatically deleted.

Downloads are raw encrypted console files, not portable decrypted exports. Keep PS4 companion `.bin` keys. Advanced transforms/imports use Garlic SaveMgr by earthonion on port 8082 and remain WIP. Close games before backup/import and keep independent verified backups.

[USB and raw-save guide](../../native/SAVES.md) · [Advanced save tools](../../Manager/SAVE-TOOLS.md).

Earlier versioned ELFs are retained to reproduce their respective builds.
