# PSN-HUB native Manager (experimental)

A new, source-built implementation. It is separate from the supplied compiled
Manager and is not automatically loaded by the jailbreak page.

- Experimental listener: **8087**. Stable Manager remains on **8085**.
- Dedicated save service: **8088**, started from the stable Manager Saves tab. Its private settings and snapshots use `/data/psn-hub-save-service`.
- Native version: `0.3.3-experimental`.
- Payload/category/backup storage: `/data/psn-hub-native`.
- Fixed cheat destinations: `/data/etaHEN/cheats` and `/data/OnionHEN/cheats`.
- HTTP: payload upload/list/delete/send, saved category CRUD/run, SHA-256 cheat
  inventory, atomic cheat uploads, durable backup/list and recoverable restore.
- Sends payloads to the console's loopback elfldr on port 9021.
- Console shortcut registration is not implemented and is reported unsupported.

## Build

The Windows checkout does not need WSL. The separate **Build experimental native
Manager** GitHub Actions workflow runs the host integration tests with address
and undefined-behavior sanitizers, downloads the official SDK v0.45 with a pinned
SHA-256 checksum, cross-compiles the PS5 ELF and uploads an artifact.

On Linux with the official SDK and clang-18/lld-18 installed:

```sh
python tools/build-native.py
PS5_PAYLOAD_SDK=/path/to/ps5-payload-sdk make -C native
```

For host tests (uses disposable directories, never console paths):

```sh
python tools/build-native.py
gcc -std=c11 -O1 -g -Wall -Wextra -Werror -Wno-misleading-indentation \
  -fsanitize=address,undefined -fno-pie -no-pie -DHUB_HOST_TEST -Inative/build \
  native/src/*.c -o native/build/manager-host
ASAN_OPTIONS=detect_leaks=0 python native/tests/test_server.py native/build/manager-host
```

## Verification status

The GitHub runner has compiled this source into a PS5 ELF with SDK v0.45. All 12
host integration tests pass with AddressSanitizer and UndefinedBehaviorSanitizer,
including standard SHA-256 vectors, real binary uploads, interrupted/crashed
uploads, symlink/traversal rejection, cross-origin rejection, backup persistence,
destination isolation, payload forwarding, categories and restore crash recovery.
These results do not establish runtime compatibility with PS5 firmware/filesystems.

Download the ELF and checksum from the **experimental-native-manager** artifact
of the latest successful native workflow run. The artifact is separate from the
stable update ZIP. GitHub retains it for 30 days; rerun the workflow to rebuild.

## Console validation

A successful cross-build is not console validation. Load this ELF manually only
when testing is appropriate, then open `http://<PS5-IP>:8087`. No tool here sends
it to a console automatically. Do not promote it to the stable auto-loader until
real hardware checks pass. Start with disposable cheats and independently backed
up data. Do not run other cheat installers or edit cheat files during backup or
restore; external writers cannot be locked by this service.

Restore copies a complete backup into a sibling staging directory, syncs it,
renames the old root aside, then publishes the complete staged root. Startup
recovers an interrupted rename before serving requests. It does not merge a
backup into existing cheats: files added since the backup are removed. Available
space must accommodate a full staged copy and the previous directory.

Uploads stream to same-directory temporary files. Incomplete uploads preserve the
previous file. File and directory sync errors fail the operation. Backups are
listed only after their complete staged tree has been committed. Symbolic links
and unsupported file types cause backup/restore to fail rather than follow them.

This is a local-network service with no user login. Mutation requests require the
UI's request marker and reject cross-origin browser requests. Do not expose the
listener through router port forwarding. These checks are not authentication.

## Sources and licensing

New source files are GPL-3.0-or-later (see COPYING), compatible with the SDK's
licensing. The existing stable ELF is not reimplemented by disassembly and its
license is not changed. SDK runtime/library work belongs to its upstream authors;
FreeBSD SDK headers retain their BSD licenses.

Official SDK and build instructions:
https://github.com/ps5-payload-dev/sdk/tree/v0.45

## Experimental Save Manager

Raw PS4/PS5 title discovery, raw file downloads and manual snapshots are implemented in source. The updated dashboard adds advanced save tools backed by the separately launched local Garlic SaveMgr engine. See [SAVES.md](SAVES.md) for routes, limits, testing and installation. Hardware validation is pending.

PS5 filesystem compatibility uses explicit carry/errno conversion for the SDK’s
fallback openat/mkdirat/fstatat/renameat/unlinkat calls. Host tests exercise the
error decoder, and the layer was validated by the live Store artwork update.
