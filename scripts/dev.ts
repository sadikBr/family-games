/**
 * Starts the game server and the Expo dev server together:
 *   bun run dev
 */
const server = Bun.spawn(['bun', '--watch', 'server/index.ts'], { stdio: ['ignore', 'inherit', 'inherit'] });
const expo = Bun.spawn(['bunx', 'expo', 'start', ...process.argv.slice(2)], { stdio: ['inherit', 'inherit', 'inherit'] });

const stop = () => {
  server.kill();
  expo.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await expo.exited;
server.kill();

export {};
