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
  const identityBase = { phone_number_id: "1104024252793908", waba_id: "1728980918069286", sender_id: "919999000004", phone: "+919999000004", user_id: "IN.PARALLEL123", profile_name: "Identity guest", message_type: "text", message_text: "Mixed identity concurrency test" };
  run("psql", [...psql, "-c", `select public.crm_ingest_whatsapp_message('${JSON.stringify({ ...identityBase, message_id: "identity-association" })}'::jsonb)`]);
  await Promise.all(Array.from({ length: 12 }, (_, i) => {
    // Replay each ID with the opposite identifier form in the second six jobs.
    const identity = (i + Math.floor(i / 6)) % 2 ? { sender_id: "bsuid:IN.PARALLEL123", phone: null } : { user_id: null };
    const msg = { ...identityBase, ...identity, message_id: `identity-parallel-${i % 6}` };
    return runAsync(join(bin, "psql"), [...psql, "-c", `select public.crm_ingest_whatsapp_message('${JSON.stringify(msg)}'::jsonb)`]);
  }));
  const identityCounts = run("psql", [...psql, "-Atc", "select (select count(*) from leads),(select count(*) from contacts),(select count(*) from whatsapp_messages)"]).trim();
  if (identityCounts !== "2|2|13") throw new Error(`Mixed identity concurrency assertion failed: ${identityCounts}`);
  console.log("Passed: concurrent phone/BSUID follow-ups retain one customer and deduplicate retries.");
  for (const file of ["tests/ads-repair-fixtures.sql", "supabase/migrations/20260921_meta_ads_only.sql", "tests/ads-only-assertions.sql"]) {
    run("psql", [...psql, "-f", resolve(file)]); console.log(`Passed: ${file}`);
  }
  // Historical ordinary chats are archived, not deleted, and snapshots remain recoverable.
  const repaired = run("psql", [...psql, "-Atc", "select (select count(*) from leads where deleted_at is null),(select count(*) from leads),(select count(*) from crm_intake_repair_journal where table_name='leads')"]).trim();
  if (repaired !== "1|6|5") throw new Error(`Archive preservation failed: ${repaired}`);
  run("psql", [...psql, "-c", "insert into meta_ad_attribution(organization_id,ad_id,campaign_id,enrichment_status) values ('00000000-0000-4000-8000-000000000001','55555555','55550000','ready'),('00000000-0000-4000-8000-000000000001','55555556','55550000','ready')"]);
  await Promise.all(Array.from({ length: 12 }, (_, i) => {
    const msg = { phone_number_id: "1104024252793908", waba_id: "1728980918069286", message_id: `ads-parallel-${i % 6}`, sender_id: "919800000005", phone: "+919800000005", message_type: "text", message_text: "Ad concurrency test", referral: {source_type:"ad",source_id:i%2 ? "55555555":"55555556"} };
    return runAsync(join(bin, "psql"), [...psql, "-c", `select public.crm_ingest_whatsapp_message('${JSON.stringify(msg)}'::jsonb)`]);
  }));
  const unique = run("psql", [...psql, "-Atc", "select (select count(*) from leads where intake_campaign_id='55550000'),(select count(*) from whatsapp_messages where message_id like 'ads-parallel-%')"]).trim();
  if (unique !== "1|6") throw new Error(`Campaign concurrency failed: ${unique}`);
  console.log("Passed: 12 competing ad deliveries, two ads in one campaign → 1 lead and 6 messages.");
} catch (error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode = 1;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  console.log(`Stopped isolated test database. Test files retained at ${directory}`);
}
