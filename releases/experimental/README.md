# Experimental Save Manager 0.2.0

[Download the experimental ELF](PSN-HUB-Manager-native-0.2.0.elf).

This binary was built by GitHub Actions run 42256749185 from source commit
98aace8c556f843acf4890019ef8cb718b5aae58. Its SHA-256 is recorded alongside it.
All 14 native integration tests passed with sanitizers. PS5 hardware validation
is pending. Use at your own risk and keep independent verified save backups.

Upload and send this ELF manually from the stable Manager, then open
`http://<PS5-IP>:8087`. The normal jailbreak continues to launch port 8085.
Save listing, per-file raw downloads and manual snapshots are experimental.
Decryption, import, restore, automatic backups and restorable archive exports
are unavailable. See [the Save Manager guide](../../native/SAVES.md).
