import { applySchema, DB_PATH } from './db/connection.js';
import { app } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);

applySchema();

app.listen(PORT, () => {
  console.log(`\n  Research & Innovation Hub API`);
  console.log(`  ------------------------------------------------------------`);
  console.log(`  API      : http://localhost:${PORT}/api`);
  console.log(`  Database : ${DB_PATH}`);
  console.log(`  Health   : http://localhost:${PORT}/api/health\n`);
});
