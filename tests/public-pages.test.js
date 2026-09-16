import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPublicPages } from "../scripts/build-github-pages.mjs";
import { policyResponse } from "../worker/policies.js";

test("GitHub Pages contains only approved static policies and the CRM redirect", async (t) => {
  const output = await mkdtemp(join(tmpdir(), "japs-public-pages-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  await buildPublicPages(output);
  assert.deepEqual((await readdir(output)).sort(), [".nojekyll", "data-deletion", "index.html", "privacy"]);
  assert.match(await readFile(join(output, "index.html"), "utf8"), /https:\/\/japs-crm\.rakesh-collegedunia\.chatgpt\.site\//);
  for (const route of ["privacy", "data-deletion"]) {
    assert.deepEqual(await readdir(join(output, route)), ["index.html"]);
    const html = await readFile(join(output, route, "index.html"), "utf8");
    const expected = (await policyResponse(`/${route}`).text())
      .replaceAll('href="/privacy"', 'href="/Japs_CRM/privacy/"')
      .replaceAll('href="/data-deletion"', 'href="/Japs_CRM/data-deletion/"')
      .replaceAll('href="/"', 'href="https://japs-crm.rakesh-collegedunia.chatgpt.site/"');
    assert.equal(html, expected);
    assert.match(html, /contactjapstours@gmail.com/);
    assert.doesNotMatch(html, /<script|<form|SUPABASE_SERVICE_ROLE_KEY|META_APP_SECRET|http-equiv="refresh"/i);
  }
});
