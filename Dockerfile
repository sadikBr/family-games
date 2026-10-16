# The realtime game server (no npm dependencies: Bun + the shared game code).
#   docker build -t family-games . && docker run -p 5757:5757 family-games
FROM oven/bun:1.3-slim
WORKDIR /app
COPY server ./server
COPY src/shared ./src/shared
ENV NODE_ENV=production
# Hosts like Render set PORT themselves; 5757 is the local default.
EXPOSE 5757
CMD ["bun", "run", "server/index.ts"]
