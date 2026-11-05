# relapse

PS5 WebKit + kernel exploit chain (relapse / aio), firmware **7.00 - 13.60**.

Retail and testkit build. Devkits want the [relapse-dev](https://github.com/soniciso1/relapse-dev) build instead.

Open the page on the console and let it run. A successful run draws the payload menu
in place and sends each ELF through the console'"'"'s own syscalls to `127.0.0.1:9021`,
so no server-side support is needed and this works from any static host.

Supported: 7.00, 7.01, 7.20, 7.40, 7.60, 7.61, 8.00, 8.20, 8.40, 8.60, 9.00, 9.20,
9.40, 9.60, 10.00, 10.01, 10.20, 10.40, 11.00, 11.20, 11.60, 12.00, 12.02, 12.20,
12.40, 12.60, 12.70, 13.00, 13.20, 13.40, 13.42, 13.60.

10.60 and 11.40 are absent: those firmware images are missing the modules the offsets
have to be read out of.

For an already-jailbroken console, the homepage's PAYLOADS link opens
`relapse.html?menu=1` after a successful run in the same browser session.
Sender-only mode checks elfldr before enabling the menu and does not rerun the
kernel exploit or automatically restart Manager. This works on static hosts.

See [Manager library instructions](Manager/README.md) for adding files,
descriptions, rebuilding the Manager ELF, and refreshing the offline cache.
PS5SX2 installer details are included under EMULATORS. The first-run console
setup and optional TV/controller mode are in Manager. The homepage update button
refreshes the offline cache; online Manager loads check the published ELF version.
The GitHub build workflow packages matching releases and can prepare drafts.
The jailbreak and bundled payload menu can work offline after a successful cache
installation in a browser that supports Application Cache. Manager library
downloads require internet access.

I just cloned this to make a web to my own fun style as personal use however all is free to use if they like it. 
