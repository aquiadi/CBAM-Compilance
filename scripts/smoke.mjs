/**
 * End-to-end smoke test against a running server.
 *
 *   BASE_URL=http://localhost:3000 node scripts/smoke.mjs
 *
 * Walks the real product through its HTTP interface: sign up, open the demo,
 * render every screen, export every format, upload and confirm a file, run the
 * supplier portal round trip, and check roles are enforced. CI runs it against
 * the production build; it exits non-zero on the first failure.
 */

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;

class Client {
  cookies = new Map();

  async request(path, { method = "GET", json, form, expect = [200] } = {}) {
    const headers = { origin: ORIGIN };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    let body;
    if (json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    const res = await fetch(`${BASE}${path}`, { method, headers, body, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === "" || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    if (!expect.includes(res.status)) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `${method} ${path} -> ${res.status} (expected ${expect.join("/")}): ${text.slice(0, 300)}`,
      );
    }
    return res;
  }

  async json(path, options) {
    const res = await this.request(path, options);
    return res.json();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const step = (name) => console.log(`- ${name}`);

/** An authenticator app's code for a base32 secret and 30-second step (RFC 6238). */
async function totp(secret, stepOffset = 0) {
  const { createHmac } = await import("node:crypto");
  const { Buffer } = await import("node:buffer");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secret) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset));
  const mac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
const stamp = Date.now().toString(36);

async function main() {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert(health.ok, `health: ${JSON.stringify(health)}`);
  step(`health ok (${health.database}, schema v${health.schemaVersion})`);

  // Anonymous users see the landing page; the app sends them to sign in, and
  // API calls are refused.
  const anon = new Client();
  const landing = await (await anon.request("/")).text();
  assert(landing.includes("Five steps"), "landing page renders");
  const home = await anon.request("/overview", { expect: [307, 308] });
  assert(
    home.headers.get("location")?.includes("/login"),
    "anonymous /overview redirects to /login",
  );
  await anon.request("/api/export?format=json", { expect: [401] });
  step("anonymous access refused");

  const owner = new Client();
  const email = `owner-${stamp}@example.com`;
  await owner.json("/api/auth/signup", {
    method: "POST",
    json: {
      name: "Smoke Owner",
      email,
      password: "correct horse battery",
      organisation: `Smoke ${stamp}`,
    },
  });
  step("signed up");

  // Cross-origin writes are refused even with a valid session.
  const forged = await fetch(`${BASE}/api/workspaces`, {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
      cookie: [...owner.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: JSON.stringify({ mode: "demo" }),
  });
  assert(forged.status === 403, `cross-origin write refused (got ${forged.status})`);
  step("cross-origin write refused");

  const ws = await owner.json("/api/workspaces", { method: "POST", json: { mode: "demo" } });
  assert(ws.workspaceId, "demo workspace created");
  step("demo workspace created");

  for (const path of [
    "/overview",
    "/ingest",
    "/review",
    "/calculate",
    "/declaration",
    "/audit",
    "/methodology",
    "/regulation",
    "/evidence",
    "/suppliers",
    "/activity",
    "/settings",
    "/settings/team",
    "/settings/workspaces",
    "/settings/account",
  ]) {
    await owner.request(path);
  }
  step("every screen renders");

  const d = await owner.json("/api/export?format=json");
  const cns = d.lines.map((l) => l.cnCode).sort();
  assert(
    JSON.stringify(cns) === JSON.stringify(["72031000", "72071114", "72142000"]),
    `lines ${cns}`,
  );
  assert(d.exposure.grossCertificates > 0, "certificates computed");
  assert(
    d.lines.every((l) => l.sefa > 0),
    "every line has a free allocation",
  );
  const codes = d.findings.map((f) => f.code);
  assert(codes.includes("CP-005") && codes.includes("CP-020"), `seeded findings present: ${codes}`);
  step(
    `declaration: ${Math.round(d.exposure.netCertificates)} certificates, ${codes.length} findings`,
  );

  // Excluding the seeded kg row brings the intensity back into range.
  const outlier = d.findings.find((f) => f.code === "CP-005");
  await owner.json("/api/workspace/exclusions", {
    method: "POST",
    json: { activityIds: outlier.activityIds, reason: "Row exported in kg; UOM column says MT" },
  });
  const after = await owner.json("/api/export?format=json");
  assert(after.exposure.netCertificates < d.exposure.netCertificates / 10, "exclusion took effect");
  assert(
    !after.findings.some((f) => f.code === "CP-003"),
    "no implausible intensity after the fix",
  );
  step(`after excluding the kg row: ${Math.round(after.exposure.netCertificates)} certificates`);

  for (const [format, type] of [
    ["csv", "text/csv"],
    ["communication", "application/json"],
    ["xlsx", "spreadsheetml"],
    ["monitoring-plan", "text/html"],
    ["verifier-pack", "application/zip"],
  ]) {
    const res = await owner.request(`/api/export?format=${format}`);
    assert(res.headers.get("content-type")?.includes(type), `${format} content type`);
    const bytes = (await res.arrayBuffer()).byteLength;
    assert(bytes > 200, `${format} has content (${bytes} bytes)`);
  }
  step("every export downloads");

  // Upload a file, review it, confirm it.
  const csv = [
    "Month,Section,Item,Consumption,Unit",
    "Sep-26,Melt Shop (IF/EAF),GRAPHITE ELECTRODE,70,MT",
  ].join("\n");
  const form = new FormData();
  form.set("file", new Blob([csv], { type: "text/csv" }), "extra-electrodes.csv");
  const upload = await owner.json("/api/datasets", { method: "POST", form });
  const draft = await owner.json("/api/export?format=json");
  assert(
    Math.abs(draft.totals.directT - after.totals.directT) < 1e-6,
    "a draft upload does not change the declaration",
  );
  await owner.request(`/ingest/${upload.datasetId}`);
  await owner.json(`/api/datasets/${upload.datasetId}/status`, {
    method: "POST",
    json: { status: "confirmed" },
  });
  const confirmed = await owner.json("/api/export?format=json");
  assert(confirmed.totals.directT > after.totals.directT, "confirmed upload counts");
  step("upload -> review -> confirm");

  // A bill as a PDF: stored as evidence, read (or, without a key, left for
  // manual entry), and imported as a draft only after the lines are checked.
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    "4 0 obj<</Length 52>>stream",
    "BT /F1 12 Tf 20 150 Td (HSD 12.45 KL) Tj ET",
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ].join("\n");
  const docForm = new FormData();
  docForm.set("file", new Blob([pdf], { type: "application/pdf" }), "iocl-invoice.pdf");
  const read = await owner.json("/api/documents", { method: "POST", form: docForm });
  assert(read.fileId && Array.isArray(read.extraction.lines), "document stored and read");
  // Reading it again (after a rate limit, say) reuses the stored copy.
  const againForm = new FormData();
  againForm.set("fileId", read.fileId);
  const again = await owner.json("/api/documents", { method: "POST", form: againForm });
  assert(again.fileId === read.fileId, "a stored document can be read again without a new copy");
  const beforeDoc = await owner.json("/api/export?format=json");
  const processId = beforeDoc.installation.processes[0].id;
  const imported = await owner.json("/api/documents/import", {
    method: "POST",
    json: {
      fileId: read.fileId,
      processId,
      lines: [
        {
          description: "HSD",
          category: "fuel",
          quantity: 12.45,
          unit: "KL",
          date: "2026-08",
          origin: read.extraction.lines.length ? "model" : "manual",
        },
      ],
    },
  });
  assert(
    imported.datasets.length === 1 && imported.datasets[0].records === 1,
    "document line imported",
  );
  const afterDoc = await owner.json("/api/export?format=json");
  assert(
    Math.abs(afterDoc.totals.directT - beforeDoc.totals.directT) < 1e-6,
    "a document's draft does not count until confirmed",
  );
  step(
    `document -> ${read.outcome.producedBy === "model" ? "read by model" : "manual entry"} -> draft dataset`,
  );

  // Supplier portal round trip.
  const req = await owner.json("/api/suppliers/requests", {
    method: "POST",
    json: { supplierName: "Maa Ambey Ispat", cnCode: "7203 10 00" },
  });
  const token = req.link.split("/supplier/")[1];
  const supplier = new Client();
  await supplier.request(`/supplier/${token}`);
  const submission = new FormData();
  for (const [k, v] of Object.entries({
    companyName: "Maa Ambey Ispat",
    installationName: "Siltara plant",
    country: "India",
    reportingYear: "2026",
    seeDirect: "2.6",
    seeIndirect: "0.08",
    sefa: "0.29",
    verified: "yes",
    verifierName: "Example Verification GmbH",
    contactName: "S. Agarwal",
    contactEmail: "s.agarwal@example.com",
  })) {
    submission.set(k, v);
  }
  submission.set(
    "file",
    new Blob(["%PDF-1.4 smoke"], { type: "application/pdf" }),
    "verification.pdf",
  );
  await supplier.json(`/api/supplier/${token}`, { method: "POST", form: submission });
  await owner.json(`/api/suppliers/requests/${req.id}`, {
    method: "POST",
    json: { decision: "accept" },
  });
  const withSupplier = await owner.json("/api/export?format=json");
  assert(
    !withSupplier.findings.some((f) => f.code === "CP-007"),
    "accepted supplier data replaces the default values",
  );
  step("supplier request -> submission -> accepted");

  // A viewer can read but not write.
  const invite = await owner.json("/api/team/invitations", {
    method: "POST",
    json: { email: `viewer-${stamp}@example.com`, role: "viewer" },
  });
  // An invitation only works for the address it was sent to, and a refused
  // attempt must not leave an account behind.
  const inviteToken = invite.link.split("/invite/")[1];
  const stranger = new Client();
  await stranger.request("/api/auth/signup", {
    method: "POST",
    json: {
      name: "Wrong Address",
      email: `stranger-${stamp}@example.com`,
      password: "another long password",
      inviteToken,
    },
    expect: [403],
  });
  await stranger.request("/api/auth/login", {
    method: "POST",
    json: { email: `stranger-${stamp}@example.com`, password: "another long password" },
    expect: [401],
  });

  const viewer = new Client();
  await viewer.json("/api/auth/signup", {
    method: "POST",
    json: {
      name: "Smoke Viewer",
      email: `viewer-${stamp}@example.com`,
      password: "another long password",
      inviteToken,
    },
  });
  await viewer.request("/declaration");
  await viewer.request("/api/export?format=csv");
  await viewer.request("/api/workspace/assumptions", {
    method: "PATCH",
    json: { etsPriceEur: 90 },
    expect: [403],
  });
  step("invitation refused for another address; viewer can read, cannot write");

  // A forgotten password: the owner issues a one-time link; using it changes
  // the password and ends the viewer's other sessions.
  const { members } = await owner.json("/api/team/members");
  const viewerMember = members.find((m) => m.email === `viewer-${stamp}@example.com`);
  assert(viewerMember, "viewer listed as a member");
  const me = await viewer.json("/api/export?format=json");
  assert(me.installation, "viewer session works before the reset");
  const forgot = await new Client().json("/api/auth/forgot", {
    method: "POST",
    json: { email: `viewer-${stamp}@example.com` },
  });
  assert(forgot.ok === true, "forgot-password answers without revealing the account");
  const issued = await owner.json(`/api/team/members/${viewerMember.userId}/reset`, {
    method: "POST",
  });
  const resetToken = issued.link.split("/reset/")[1];
  const fresh = new Client();
  await fresh.request(`/reset/${resetToken}`);
  await fresh.json("/api/auth/reset", {
    method: "POST",
    json: { token: resetToken, password: "a new password after reset" },
  });
  await viewer.request("/api/export?format=json", { expect: [401] });
  await fresh.request("/api/auth/reset", {
    method: "POST",
    json: { token: resetToken, password: "trying the link twice" },
    expect: [410],
  });
  await new Client().json("/api/auth/login", {
    method: "POST",
    json: { email: `viewer-${stamp}@example.com`, password: "a new password after reset" },
  });
  step("owner-issued reset link: new password works, old sessions end, link works once");

  // Two-factor sign-in: set it up, then a password alone no longer signs in.
  const setup = await owner.json("/api/account/two-factor", {
    method: "POST",
    json: { action: "begin" },
  });
  const enabled = await owner.json("/api/account/two-factor", {
    method: "POST",
    json: { action: "confirm", code: await totp(setup.secret) },
  });
  assert(enabled.recoveryCodes?.length === 10, "ten recovery codes issued");
  const second = new Client();
  const half = await second.json("/api/auth/login", {
    method: "POST",
    json: { email, password: "correct horse battery" },
  });
  assert(half.twoFactor === true, "password alone asks for the code");
  await second.request("/api/export?format=json", { expect: [401] });
  await second.request("/api/auth/login/verify", {
    method: "POST",
    json: { code: "000000" },
    expect: [400],
  });
  // The confirming code's step is spent, so use the next one.
  await second.json("/api/auth/login/verify", {
    method: "POST",
    json: { code: await totp(setup.secret, 1) },
  });
  await second.json("/api/export?format=json");
  await owner.json("/api/account/two-factor", {
    method: "POST",
    json: { action: "disable", code: enabled.recoveryCodes[0] },
  });
  step("two-factor: password alone refused, code signs in, recovery code turns it off");

  // "Ask the regulation" answers with no evalgate service connected, from
  // the built-in rulebook, with the passages behind the answer.
  const asked = await owner.json("/api/regulation", {
    method: "POST",
    json: { question: "When is the first annual CBAM declaration due?" },
  });
  assert(asked.source === "rulebook", "answered from the built-in rulebook");
  assert(
    asked.passages.some((p) => p.text.includes("30 September 2027")),
    "the passage with the deadline is returned",
  );
  step("ask the regulation: answered from the built-in rulebook with its passages");

  const log = await owner.request("/activity");
  const html = await log.text();
  assert(
    html.includes("supplier.accepted") && html.includes("records.excluded"),
    "activity log records changes",
  );
  step("activity log records every change");

  await owner.json("/api/auth/logout", { method: "POST" });
  await owner.request("/overview", { expect: [307, 308] });
  step("signed out");

  console.log("\nSmoke test passed.");
}

main().catch((error) => {
  console.error(`\nSmoke test FAILED: ${error.message}`);
  process.exit(1);
});
