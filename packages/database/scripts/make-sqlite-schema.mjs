// Generates the SQLite variant of the Prisma schema for local development.
// The models are provider-neutral, so only the datasource provider changes.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const prismaDir = join(here, "..", "prisma");
const source = join(prismaDir, "schema.prisma");
const target = join(prismaDir, "schema.sqlite.prisma");

const schema = readFileSync(source, "utf8");

if (!schema.includes('provider = "postgresql"')) {
  throw new Error("schema.prisma does not declare the postgresql provider");
}

const sqlite = schema
  .replace('provider = "postgresql"', 'provider = "sqlite"')
  .replace(
    "// The models are deliberately provider-neutral",
    "// GENERATED FROM schema.prisma - do not edit by hand.\n// The models are deliberately provider-neutral",
  );

writeFileSync(target, sqlite, "utf8");
console.log(`Wrote ${target}`);
