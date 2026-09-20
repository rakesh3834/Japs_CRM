// Creates a disposable local cluster, never connects to Supabase or a live DB.
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const runAsync = promisify(execFile);
const directory = mkdtempSync(join(tmpdir(), "japs-crm-db-test-"));
const data = join(directory, "data");
const bin = process.env.JAPS_TEST_PG_BIN || "/opt/homebrew/bin";
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const psql = ["-h", directory, "-p", "55439", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
let started = false;
try {
  run("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
  run("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -p 55439 -h ''`, "-w", "start"]); started = true;
  for (const file of ["tests/database-fixtures.sql", "supabase/schema.sql", "supabase/migrations/20260917_verified_staff_whatsapp.sql", "supabase/migrations/20260917_whatsapp_profile_attribution.sql", "supabase/migrations/20260920_whatsapp_sender_identity.sql", "supabase/bootstrap_verified_admin.sql", "tests/database-assertions.sql", "tests/identity-assertions.sql"]) {
    run("psql", [...psql, "-f", resolve(file)]); console.log(`Passed: ${file}`);
  }
  // Real competing transactions: replayed ID plus different messages from one sender.
  run("psql", [...psql, "-c", "update public.whatsapp_connections set active=true where phone_number_id='1104024252793908'"]);
  const jobs = Array.from({ length: 12 }, (_, i) => {
    const msg = { phone_number_id: "1104024252793908", waba_id: "1728980918069286", message_id: `parallel-${i % 6}`, sender_id: "parallel-customer", profile_name: "Concurrent guest", message_type: "text", message_text: "Concurrency test" };
    return runAsync(join(bin, "psql"), [...psql, "-c", `select public.crm_ingest_whatsapp_message('${JSON.stringify(msg)}'::jsonb)`]);
  });
  await Promise.all(jobs);
  const counts = run("psql", [...psql, "-Atc", "select (select count(*) from leads),(select count(*) from contacts),(select count(*) from whatsapp_messages)"]).trim();
  if (counts !== "1|1|6") throw new Error(`Concurrency assertion failed: ${counts}`);
  console.log("Passed: 12 simultaneous deliveries → 1 contact, 1 enquiry, 6 unique messages.");
} catch (error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode = 1;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  console.log(`Stopped isolated test database. Test files retained at ${directory}`);
}
