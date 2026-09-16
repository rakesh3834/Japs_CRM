import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { policyResponse } from "../worker/policies.js";

// Publish only the existing redirect and approved policies. Never copy the
// repository, CRM bundle, environment, database data or server code to Pages.
export async function buildPublicPages(output) {
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "index.html"), await readFile(new URL("../github-pages/index.html", import.meta.url)));
  for (const route of ["privacy", "data-deletion"]) {
    const html = (await policyResponse(`/${route}`).text())
      .replaceAll('href="/privacy"', 'href="/Japs_CRM/privacy/"')
      .replaceAll('href="/data-deletion"', 'href="/Japs_CRM/data-deletion/"')
      .replaceAll('href="/"', 'href="https://japs-crm.rakesh-collegedunia.chatgpt.site/"');
    const directory = resolve(output, route);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, "index.html"), html);
  }
  await writeFile(resolve(output, ".nojekyll"), "");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildPublicPages(resolve(".github-pages-dist"));
}
