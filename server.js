import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { startServer } = require("./app-server.cjs");

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
