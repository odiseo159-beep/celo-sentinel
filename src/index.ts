import { buildServer } from "./server.js";
import { config } from "./config.js";

const app = buildServer();
app.listen(config.port, () => {
  console.log(`celo-sentinel escuchando en http://localhost:${config.port}`);
  console.log(`  GET /                     descriptor del servicio`);
  console.log(`  GET /check/token/:addr    token safety`);
  console.log(`  GET /check/contract/:addr contract safety`);
  console.log(`  GET /check/wallet/:addr   wallet reputation`);
});
