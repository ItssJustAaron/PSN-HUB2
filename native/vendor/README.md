# Embedded save-processing engine

`garlic-savemgr_08c24b5.elf.gz` is the unchanged Garlic SaveMgr engine by
earthonion, compressed only for source storage. It is built into the Manager
ELF and sent internally to elfldr only when the user starts advanced save tools.
Users do not download or upload this file separately.

Source: https://github.com/earthonion/garlic-savemgr/tree/08c24b5f98bf410f0addeec210857cfa07b73f63

Uncompressed SHA-256:
`4fe4bada2e11075a3dcece3230d0184e5d81865c38668898254c5ae6d0a3fdeb`.

PSN-HUB supplies the Manager interface and integration. The engine retains its
original identity and attribution; PSN-HUB does not claim its cryptography as
its own. See `Manager/SAVE-TOOLS.md` for capabilities and current limits.

The Manager also embeds the unchanged **PS5 Themes v1.80** ELF by Blaze414.
The Themes tab starts it through the console's ELF loader when needed.
The pinned binary and corresponding source are available in the
[upstream release](https://github.com/Blaze414/ps5-theme/releases/tag/v1.80).
