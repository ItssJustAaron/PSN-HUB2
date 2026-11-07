FROM node:24-bookworm-slim
WORKDIR /app
COPY tools/community-saves.cjs tools/community-save-archive.cjs ./tools/
COPY Manager/community-saves.html Manager/community-saves.js ./Manager/
CMD ["node", "tools/community-saves.cjs"]
