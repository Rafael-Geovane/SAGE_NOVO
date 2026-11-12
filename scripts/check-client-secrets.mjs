import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? walk(`${directory}/${item.name}`)
      : [`${directory}/${item.name}`],
  );
const files = [...walk("src"), ...walk("dist")].filter((file) =>
  /\.(tsx?|js|json|html)$/.test(file),
);
const findings = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  if (/sb_secret_[A-Za-z0-9_-]+/.test(content))
    findings.push({ file, type: "secret_key" });
  for (const match of content.matchAll(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      if (
        JSON.parse(Buffer.from(match[0].split(".")[1], "base64url").toString())
          .role === "service_role"
      )
        findings.push({ file, type: "privileged_jwt" });
    } catch {}
  }
  if (/fixture@example\.test|public-test-fixture-only|DEMO_USER/.test(content))
    findings.push({ file, type: "test_fixture" });
}
const result = {
  checkedAt: new Date().toISOString(),
  scope: "src and dist text assets",
  filesChecked: files.length,
  findings,
};
writeFileSync(
  "docs/security-scan.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({ filesChecked: files.length, findings: findings.length }),
);
if (findings.length) process.exitCode = 1;
