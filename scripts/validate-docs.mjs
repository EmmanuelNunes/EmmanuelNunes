import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean))];

const anchors = new Map();
function getAnchors(text) {
  text = text.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "");
  const ids = new Set([...text.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
  const duplicates = new Map();
  for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = match[1].toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s/g, "-");
    const count = duplicates.get(base) ?? 0;
    duplicates.set(base, count + 1);
    ids.add(count ? `${base}-${count}` : base);
  }
  return ids;
}

let links = 0;
for (const file of files) {
  if (!/\.md$/.test(file)) continue;
  const content = await readFile(path.join(root, file), "utf8");
  const text = content.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "").replace(/`[^`\n]+`/g, "");
  const targets = [...text.matchAll(/\]\(([^)]+)\)|\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1] ?? match[2]);
  for (const match of text.matchAll(/\bsrcset=["']([^"']+)["']/g)) {
    targets.push(...match[1].split(",").map(candidate => candidate.trim().split(/\s+/)[0]));
  }
  for (let target of new Set(targets)) {
    if (/^(?:[a-z]+:|\/\/)/i.test(target)) continue;
    target = target.replace(/^<|>$/g, "");
    const [relative, anchor] = target.split("#");
    const resolved = relative ? path.resolve(root, path.dirname(file), decodeURIComponent(relative)) : path.join(root, file);
    assert((await stat(resolved).catch(() => null)), `${file}: missing link ${target}`);
    if (anchor && /\.md$/.test(resolved)) {
      if (!anchors.has(resolved)) anchors.set(resolved, getAnchors(await readFile(resolved, "utf8")));
      assert(anchors.get(resolved).has(decodeURIComponent(anchor)), `${file}: missing anchor ${target}`);
    }
    links++;
  }
}
console.log(`PASS profile documentation: ${links} local links/anchors validated successfully.`);
