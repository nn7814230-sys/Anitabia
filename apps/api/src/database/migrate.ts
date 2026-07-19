import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const schemaUrl = new URL("./schema.sql", import.meta.url);

async function migrate() {
  const schema = await readFile(fileURLToPath(schemaUrl), "utf8");
  await pool.query(schema);
  console.log("Database schema is up to date.");
}

migrate()
  .catch((error: unknown) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
