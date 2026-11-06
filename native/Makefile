ifdef PS5_PAYLOAD_SDK
include $(PS5_PAYLOAD_SDK)/toolchain/prospero.mk
else
$(error Set PS5_PAYLOAD_SDK to the official ps5-payload-dev SDK)
endif
CFLAGS := -std=c11 -O2 -Wall -Wextra -Werror -Wno-misleading-indentation -Ibuild
SOURCES := src/server.c src/storage.c src/sha256.c src/saves.c
.PHONY: all clean
all: build/PSN-HUB-Manager-native.elf
build/PSN-HUB-Manager-native.elf: $(SOURCES) src/hub.h build/dashboard.h
	$(CC) $(CFLAGS) -o $@ $(SOURCES)
clean:
	rm -f build/PSN-HUB-Manager-native.elf build/manager-host build/dashboard.h
