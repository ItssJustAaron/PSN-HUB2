# Console saves and USB backups — 6 November 2026

- The Saves tab now opens the local console save browser and automatically lists PS4/PS5 save folders.
- Select **View saves / download** to download raw encrypted save files to your phone or computer. Keep PS4 companion `.bin` files together with their images.
- Added **Back up save to USB** for individual games and **Back up all changed saves to USB**.
- Added optional automatic USB backups, disabled by default, with a 15–1440 minute interval and settings saved on the console.
- USB backups are organised under `/PSN-HUB/Saves/<user>/<platform>/<game>/`. Completed snapshots are verified; original console saves are preserved and unchanged saves are skipped.
- Supplied payload cards are removed from the Payloads tab. Users' uploaded payloads appear in a two-column grid.
- HENs, mod menus and emulator sections remain available. Background shortcut controls are under My library.

The dedicated save service runs separately from the stable Manager. After a console reboot, use **Start save service** in the Saves tab, then **Reload save browser**. Automatic backups run only while this service is active and a USB drive is connected. Close games so their latest save data is written to disk.

Validation: 17 sanitizer-backed native tests passed, including USB export, unchanged-file skipping, automatic timing/settings persistence and path protection. The PS5 build passed. The new service was started on a PS5 and found 13 save folders. No USB drive was connected, so physical USB writes remain unverified.
