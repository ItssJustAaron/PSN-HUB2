# PSN-HUB — Manager
PSN-HUB2 is a community PS5 jailbreak and payload hub with a companion PS5 Manager. The site is a static project intended for GitHub Pages. It does not require PHP, a database, or a custom web server.

## Contents

- [Website](#website)
- [Firmware support](#firmware-support)
- [PSN-HUB Manager](#psn-hub-manager)
- [Local network setup](#local-network-setup)
- [Offline use](#offline-use)
- [Hosting on GitHub Pages](#hosting-on-github-pages)
- [Updating the Manager library](#updating-the-manager-library)
- [Repository layout](#repository-layout)
- [Important notes](#important-notes)

## Website

`index.html` is the PSN-HUB home page. It links to the jailbreak flow in `relapse.html` and contains the PAYLOADS navigation entry.

`relapse.html` runs the PS5 browser jailbreak flow and displays its payload menu. On a successful run, the current flow can start the PSN-HUB Manager automatically. If the console is already jailbroken in the same browser session, the home page PAYLOADS link opens sender-only mode. Sender-only mode checks for elfldr and sends payloads without rerunning the exploit.

Payload sending uses the console's own syscalls to connect to elfldr at `127.0.0.1:9021`. The website itself is static, so it can be served from GitHub Pages or another static host.

## Firmware support

The jailbreak includes these firmware versions:

`7.00` `7.01` `7.20` `7.40` `7.60` `7.61` `8.00` `8.20` `8.40` `8.60` `9.00` `9.20` `9.40` `9.60` `10.00` `10.01` `10.20` `10.40` `11.00` `11.20` `11.60` `12.00` `12.02` `12.20` `12.40` `12.60` `12.70` `13.00` `13.20` `13.40` `13.42` `13.60`

Firmware `10.60` and `11.40` are not included because the required firmware modules are unavailable. HEN, mod-menu, and individual payload support can have narrower firmware requirements than the jailbreak itself; check each entry's compatibility information before sending it.

## PSN-HUB Manager

The Manager is a separate PS5 ELF. Its release file is `payloads/PSN-HUB-Manager.elf`; the web dashboard, library catalogue, artwork, and descriptions are in `Manager/`.

The dashboard opens on PAYLOADS and includes:

- **PAYLOADS** — Upload `.elf` or `.bin` files from a PC or phone, browse the files stored on the PS5, inspect payload details, and send a selected payload to elfldr. The Manager checks file sizes and ELF signatures before transfer and verifies SHA-256 when browser support is available.
- **Autoload categories** — Create named groups from saved payloads, set a delay between sends, and run a group in sequence. Running a category sends its files to elfldr; it does not guarantee every payload remains active or that all payloads work together.
- **CHEATS** — Search and filter the bundled cheat catalogue by title, title ID, creator, platform, format, and game version. Install an individual cheat file, a game version, or the entire catalogue. DOWNLOAD ALL applies to the whole catalogue regardless of the current filters. Supported files are installed under `/data/etaHEN/cheats/{json,mc4,shn}`.
- **HENS** — Browse collapsible HEN entries with creator, description, source, and firmware support information. Entries live under `Manager/Hens/`; each entry can provide its own ELF and metadata.
- **MOD MENUS** — Browse collapsible mod-menu entries under `Manager/ModMenus/`. Each entry shows its instructions and sends its ELF to elfldr.
- **EMULATORS** — View emulator information and send the PS5SX2 installer ELF. The installer itself decides what it installs and where.

The dashboard also provides console setup guidance, firmware and active-HEN profiles, favourites, recent actions, a version and catalogue check, and TV/controller display mode. Profiles and browser preferences are stored locally in that browser; saving a profile does not connect to another console. Firmware compatibility is kept separate from game-version compatibility. Known-incompatible entries are hidden by default, and their SEND controls remain disabled when shown.

The Manager includes controls to set the PSN-HUB JAILBREAK home-screen shortcut using the site's mascot artwork and to restore the original Store shortcut. When replacement succeeds, it hides the duplicate Media shortcut.

## Local network setup

1. Start the PS5 jailbreak and ensure elfldr is available for payload transfers.
2. Keep the computer or phone and PS5 on the same trusted local network.
3. Open the Manager's displayed local address in the computer or phone browser, normally `http://<PS5-IP>:8085/`.
4. Upload `.elf` or `.bin` payloads, then use the dashboard to send them to elfldr or store them for later.

The PS5 Manager's web dashboard uses port `8085`; elfldr receives payloads on port `9021`. The current native API does not support every console-side maintenance operation. For example, console cheat-file hash scanning, changing the cheat root, and creating or restoring console backups remain unavailable; controls requiring those APIs are disabled.

## Offline use

`cache.appcache` supports offline use in PS5 browsers that still implement Application Cache. Open the site while online first and let its cache installation finish. Offline availability depends on browser support and the cached files. Manager library downloads and online version checks require internet access.

The home page's update control refreshes the legacy offline cache. It does not reload an active jailbreak session.

## Hosting on GitHub Pages

1. Push the project to a GitHub repository.
2. Open the repository's **Settings → Pages** page.
3. Choose **GitHub Actions** as the publishing source, or use the included Pages workflow.
4. Wait for the Pages workflow to finish, then open the URL shown in repository settings.

When hosting under a project path such as `/PSN-HUB2/`, keep page and asset references relative so they resolve under that path. The site does not need PHP or a server-side database.

## Updating the Manager library

Place files in the relevant `Manager/` folders and customize descriptions in `Manager/descriptions.json`. HEN and mod-menu folders can include their own metadata and ELF. Cheat files are organized into `json`, `mc4`, and `shn` formats. Artwork and attribution are recorded in the Manager catalogue files.

From the repository root on Windows, rebuild the embedded dashboard and generated catalogue with:

```powershell
python tools/build-manager.py
node tools/check-site.cjs
```

The builder discovers the library files, regenerates the Manager catalogue and firmware index, embeds the web dashboard in `payloads/PSN-HUB-Manager.elf`, and updates the offline cache manifest. It preserves the existing ELF native code and offsets; it does not compile the missing native engine source. See [Manager/README.md](Manager/README.md) and [Manager/NATIVE-API.md](Manager/NATIVE-API.md) for the detailed library format, compatibility rules, API requirements, and limitations.

A read-only local preview is available with:

```powershell
node tools/preview-manager.cjs
```

Then open `http://127.0.0.1:8086`. The preview cannot upload or execute console payloads. The online Manager library loads content from this project's GitHub `main` branch, so publish the library files together with the updated ELF. Existing consoles may need the site cache refreshed and the Manager restarted to load the new build.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | PSN-HUB home page |
| `relapse.html` | PS5 jailbreak flow and payload menu |
| `main.js`, `exploit.js`, `kexp.js`, `rop.js`, and related scripts | Website and exploit-chain functionality |
| `payloads/` | ELF payloads, including `PSN-HUB-Manager.elf` |
| `Manager/` | Manager dashboard, library catalogue, cheats, HENs, mod menus, emulators, and artwork |
| `native/` | Native shortcut payload source |
| `api/`, `offsets/` | Supporting server tools and firmware data |
| `.github/workflows/` | Pages and release automation | 

## Important notes

- Only use payloads that match your firmware and setup. Payloads can conflict, exit, or have effects described by their authors.
- The site and Manager are community software. Review payload sources and compatibility notes before use.
- The Manager is intended for a trusted local network. It has no user accounts or transport encryption; do not expose port `8085` directly to the public internet.
- Manager library downloads require internet. A cached jailbreak page does not make remote library files available offline.
- Credits for the original exploit chain and payload authors are retained in the site and project files.

  <img width="1280" height="720" alt="PSNHUB-JB" src="https://github.com/user-attachments/assets/100f14d6-91f1-4e2b-9274-5da3466783dc" />



## Save Manager (WIP)

The Manager dashboard includes a clearly marked **SAVE MANAGER (WIP)** tab. **Use at your own risk.** Save listing, backups, decrypt/encrypt, resigning, importing, restoring, and exporting are not implemented in this GitHub build. Do not rely on it for save protection; keep separate backups until save operations are implemented and verified on a PS5.

Research credit: [Garlic SaveMgr](https://github.com/earthonion/garlic-savemgr) and [Garlic Worker](https://github.com/earthonion/garlic-worker) by earthonion. These projects informed the research; their code and binaries are not included here.
