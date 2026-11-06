ifdef PS5_PAYLOAD_SDK
include $(PS5_PAYLOAD_SDK)/toolchain/prospero.mk
else
$(error Set PS5_PAYLOAD_SDK to the official ps5-payload-dev SDK)
endif
CFLAGS := -std=c11 -O2 -Wall -Wextra -Werror -Wno-misleading-indentation -DHUB_EMBEDDED -Isrc -Ibuild -Ibuild/sqlite
SOURCES := src/server.c src/storage.c src/sha256.c src/saves.c src/usb.c src/posix.c src/installer.c shortcut/background.c shortcut/icons.c shortcut/patch.c shortcut/media.c
LDADD := -lkernel_sys -lSceAppInstUtil -lSceUserService -lSceSystemService -lSceIpmi
.PHONY: all clean
all: build/PSN-HUB-Manager.elf build/PSN-HUB-Manager-preflight.elf
build/PSN-HUB-Manager.elf: $(SOURCES) src/hub.h build/dashboard.h build/sqlite3.o
	$(CC) $(CFLAGS) -o $@ $(SOURCES) build/sqlite3.o $(LDADD)
build/PSN-HUB-Manager-preflight.elf: $(SOURCES) src/hub.h build/dashboard.h build/sqlite3.o
	$(CC) $(CFLAGS) -DHUB_UNIFIED_PREVIEW -o $@ $(SOURCES) build/sqlite3.o $(LDADD)
clean:
	rm -f build/PSN-HUB-Manager-native.elf build/manager-host build/dashboard.h
