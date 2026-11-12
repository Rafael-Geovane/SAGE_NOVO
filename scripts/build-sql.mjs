import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const root = new URL("../supabase/", import.meta.url);
const files = readdirSync(new URL("migrations/", root))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const header = `-- SAGE: instalacao completa para um projeto Supabase novo.
-- Execute TODO este arquivo no SQL Editor. Nao executar junto com as migrations.
-- Nao apaga dados. Se o esquema SAGE ja existe, aplique apenas as migrations pendentes.
-- Auth (email/senha), Site URL e Redirect URLs sao configurados no painel Supabase.
-- Nunca coloque chaves service_role no frontend. Veja README.md.
\nbegin;\ngrant usage on schema public to authenticated, service_role;\n`;
writeFileSync(
  new URL("setup.sql", root),
  header +
    files
      .map(
        (name) =>
          `\n-- Migration: ${name}\n` +
          readFileSync(new URL(`migrations/${name}`, root), "utf8")
            .replace(/\r\n/g, "\n")
            .trim() +
          "\n",
      )
      .join("\n") +
    "\ncommit;\n",
  "utf8",
);
console.log(`supabase/setup.sql gerado com ${files.length} migrations.`);
