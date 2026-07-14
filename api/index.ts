// Entry point serverless para Vercel: exporta la app Express.
// Todas las rutas se reescriben aquí vía vercel.json.
import { buildServer } from "../src/server.js";

const app = buildServer();
export default app;
