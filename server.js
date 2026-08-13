import express from "express";
import multer from "multer";
import sharp from "sharp";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

const app = express();

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const SHARES_DIR = path.join(ROOT, "shares");

await fs.mkdir(SHARES_DIR, { recursive: true });

// IMPORTANT: cache Sharp aggressively. The old version rebuilt the entire
// 1600x2000 SVG, including the photo base64, on every request.
sharp.cache({ memory: 64, files: 0, items: 100 });
sharp.concurrency(Math.max(1, Math.min(4, Number(process.env.SHARP_CONCURRENCY || 2))));

app.use(express.static(PUBLIC_DIR));
app.use(express.json({ limit: "50kb" }));

// FIX: generated share IDs are always 16 lowercase hex chars. Anything else
// hitting /share/:id.jpg or /s/:id is not a real ID and must be rejected
// before it ever touches the filesystem, since path.join() does NOT stop
// ".." segments or encoded slashes from escaping SHARES_DIR.
const ID_RE = /^[0-9a-f]{16}$/;

function safeSharePath(id) {
  if (!ID_RE.test(id)) return null;
  return path.join(SHARES_DIR, `${id}.jpg`);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    // FIX: without this, a malicious client can send a multi-MB text field
    // before clean() ever gets a chance to truncate it — the truncation
    // happens after the full field is already buffered in memory.
    fieldSize: 2 * 1024, // 2KB per text field is generous for names/roles
    fields: 10
  },
  fileFilter: (_req, file, cb) => {
    const ok =
      /image\/(jpeg|png|webp|heic|heif)/i.test(file.mimetype) ||
      /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname);
    cb(ok ? null : new Error("Use JPG, PNG, WebP, HEIC or HEIF."), ok);
  }
});

function clean(value, fallback = "") {
  const s = String(value ?? "").replace(/[<>]/g, "").trim().slice(0, 42);
  return s || fallback;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function text(s, x, y, size, weight = 800, fill = "#183d2b", anchor = "start") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`;
}

function builderId(name) {
  const seed = String(name || "GOA").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "X");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = 0;
  for (const c of seed) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[n % chars.length];
    n = Math.floor(n / chars.length) || (n * 17 + 13);
  }
  return `#HH-GOA-${seed}-${code}`;
}

function barcode() {z
  return Array.from({ length: 24 }, (_, i) =>
    `<rect x="${i * 14}" y="0" width="${i % 4 === 0 ? 7 : 3}" height="52" fill="#183d2b"/>`
  ).join("");
}

// Static artwork: rendered ONCE when the server boots.
function makeStaticSvg() {
  return `
  <svg width="1600" height="2000" viewBox="0 0 1600 2000" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="2" fill="#183d2b" opacity=".12"/>
      </pattern>
    </defs>

    <rect width="1600" height="2000" rx="54" fill="#f5e9cf"/>
    <rect x="28" y="28" width="1544" height="1944" rx="42" fill="none" stroke="#183d2b" stroke-width="8"/>
    <rect x="46" y="46" width="1508" height="1908" rx="32" fill="none" stroke="#ffb71b" stroke-width="5"/>

    <g opacity=".9">
      <path d="M55 80 C120 35 190 35 245 75" fill="none" stroke="#183d2b" stroke-width="6"/>
      <path d="M1335 90 C1400 45 1470 45 1530 85" fill="none" stroke="#183d2b" stroke-width="6"/>
      <path d="M100 1780 Q190 1695 280 1780 T460 1780" fill="none" stroke="#ff4b36" stroke-width="10"/>
      <path d="M1150 1780 Q1240 1695 1330 1780 T1510 1780" fill="none" stroke="#ff4b36" stroke-width="10"/>
    </g>

    <g fill="#183d2b">
      <path d="M54 330 q45-85 75 0 q-55-28-75 0z"/>
      <path d="M1480 330 q45-85 75 0 q-55-28-75 0z"/>
      <path d="M60 1430 q40-95 72 0 q-50-30-72 0z"/>
      <path d="M1470 1430 q40-95 72 0 q-50-30-72 0z"/>
    </g>

    <text x="800" y="145" text-anchor="middle" font-family="Arial" font-size="25" font-weight="900" fill="#ffb71b">HH</text>
    <rect x="685" y="62" width="230" height="165" rx="18" fill="#e82f68" stroke="#183d2b" stroke-width="7"/>
    <text x="800" y="140" text-anchor="middle" font-family="Arial" font-size="58" font-weight="950" fill="#ffdf4d">GOA</text>
    <text x="800" y="194" text-anchor="middle" font-family="Arial" font-size="38" font-weight="950" fill="#ffdf4d">2026</text>

    ${text("BUILD IN GOA", 100, 280, 20, 900)}
    ${text("SHIP FROM PARADISE", 1500, 280, 20, 900, "#183d2b", "end")}

    ${text("HACKER", 800, 390, 88, 900, "#183d2b", "middle")}
    ${text("GOA", 800, 470, 92, 950, "#ff4b36", "middle")}
    ${text("HOUSE", 800, 550, 88, 900, "#183d2b", "middle")}

    <!-- portrait frame -->
    <circle cx="800" cy="790" r="382" fill="#ff4b36"/>
    <circle cx="800" cy="790" r="370" fill="#f7d83f"/>
    <circle cx="800" cy="790" r="355" fill="#183d2b"/>
    <circle cx="800" cy="790" r="345" fill="#ddd"/>
    <circle cx="800" cy="790" r="345" fill="none" stroke="#f5e9cf" stroke-width="10"/>

    <rect x="270" y="1160" width="1060" height="120" rx="28" fill="#183d2b" stroke="#ffb71b" stroke-width="8"/>
    <rect x="420" y="1300" width="760" height="78" rx="20" fill="#ffb71b"/>

    <rect x="85" y="1410" width="680" height="360" rx="28" fill="url(#dots)" stroke="#183d2b" stroke-width="5"/>
    <rect x="835" y="1410" width="680" height="360" rx="28" fill="#fff7e4" stroke="#183d2b" stroke-width="5"/>

    <rect x="550" y="1800" width="500" height="76" rx="20" fill="#e82f68" stroke="#183d2b" stroke-width="6"/>

    ${text("HHGOA 2026", 90, 1915, 22, 950)}
    ${text("BUILD  •  SHIP  •  REPEAT", 1510, 1915, 22, 950, "#183d2b", "end")}

    <g transform="translate(1130 1870)">${barcode()}</g>
  </svg>`;
}

const STATIC_CARD = await sharp(Buffer.from(makeStaticSvg()))
  .png({ compressionLevel: 6 })
  .toBuffer();

// Generate a circular portrait separately. No base64 photo inside the giant SVG.
async function makePortrait(buffer) {
  const resized = await sharp(buffer, {
    // FIX: "none" told Sharp to silently push through corrupt/malformed
    // input. For untrusted uploads you want a loud failure, not a mangled
    // image quietly shipped to users.
    failOn: "truncated",
    limitInputPixels: 30_000_000
  })
    .rotate()
    .resize(690, 690, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 1 })
    .toBuffer();

  const mask = Buffer.from(`
    <svg width="690" height="690" xmlns="http://www.w3.org/2000/svg">
      <circle cx="345" cy="345" r="345" fill="white"/>
    </svg>
  `);

  return sharp(resized)
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 1 })
    .toBuffer();
}

app.post("/api/generate", upload.single("photo"), async (req, res) => {
  const started = performance.now();

  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please add a photo." });
    }

    const name = clean(req.body.name, "YOUR NAME");
    const stack = clean(req.body.stack, "YOUR STACK");
    const role = clean(req.body.role, "YOUR ROLE");
    const field1 = clean(req.body.field1, "BUILDER CLASS");
    const field2 = clean(req.body.field2, "CURRENTLY SHIPPING");

    const members = [
      clean(req.body.m1, ""),
      clean(req.body.m2, ""),
      clean(req.body.m3, "")
    ].filter(Boolean).slice(0, 3);

    const id = crypto.randomBytes(8).toString("hex"); // 16 hex chars, matches ID_RE
    const bid = builderId(name);

    const portraitPromise = makePortrait(req.file.buffer);

    const crew = members.length
      ? members.map((m, i) =>
          text(`${String(i + 1).padStart(2, "0")}  ${m}`, 870, 1525 + i * 58, 25, 900)
        ).join("")
      : text("Supriya SM", 870, 1525, 22, 900);
	  :	text("Swapna", 870, 1525, 22, 900);
	  : text("Arnab Kumar", 870, 1525, 22, 900);

    const overlaySvg = `
      <svg width="1600" height="2000" viewBox="0 0 1600 2000" xmlns="http://www.w3.org/2000/svg">

        ${text(name.toUpperCase(), 800, 1238, 48, 950, "#fff8e8", "middle")}
        ${text(role.toUpperCase(), 800, 1350, 27, 950, "#183d2b", "middle")}

        ${text("YOUR SIGNAL", 120, 1465, 19, 900, "#ff4b36")}
        ${text(field1.toUpperCase(), 120, 1525, 35, 950)}
        ${text("STACK", 120, 1590, 19, 900, "#ff4b36")}
        ${text(stack, 120, 1640, 31, 900)}
        ${text("CURRENTLY", 120, 1700, 19, 900, "#ff4b36")}
        ${text(field2.toUpperCase(), 120, 1742, 26, 900)}

        ${text("THE GOA HOUSE CREW", 870, 1465, 19, 900, "#ff4b36")}
        ${crew}

        ${text("#FRAMEINGOA", 800, 1850, 30, 950, "#fff4dc", "middle")}

        <rect x="535" y="1860" width="530" height="62" rx="18" fill="#183d2b"/>
        ${text(bid, 800, 1902, 22, 950, "#ffdf4d", "middle")}

      </svg>
    `;

    const overlayPromise = sharp(Buffer.from(overlaySvg))
      .png({ compressionLevel: 1 })
      .toBuffer();

    const [portrait, overlay] = await Promise.all([
      portraitPromise,
      overlayPromise
    ]);

    const finalJpeg = await sharp(STATIC_CARD)
      .composite([
        { input: portrait, left: 455, top: 445 },
        { input: overlay, left: 0, top: 0 }
      ])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    const filePath = path.join(SHARES_DIR, `${id}.jpg`);
    await fs.writeFile(filePath, finalJpeg);

    const imageUrl = `${PUBLIC_URL}/share/${id}.jpg`;
    const shareUrl = `${PUBLIC_URL}/s/${id}`;

    const elapsed = Math.round(performance.now() - started);

    res.json({
      success: true,
      imageUrl,
      shareUrl,
      builderId: bid,
      tweetText: `${name} just checked into HHgoa 2026 🌴⚡ ${bid} #FrameInGoa`,
      generationMs: elapsed
    });

  } catch (error) {
    console.error("GENERATION ERROR:", error);

    res.status(500).json({
      error: "Could not generate badge.",
      detail:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
});

app.get("/share/:id.jpg", async (req, res) => {
  try {
    const filePath = safeSharePath(req.params.id);
    if (!filePath) return res.status(400).send("Invalid image id.");

    await fs.access(filePath);

    res.set({
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable"
    });

    res.sendFile(filePath);
  } catch {
    res.status(404).send("Image not found.");
  }
});

app.get("/s/:id", async (req, res) => {
  try {
    const imageId = req.params.id;
    const filePath = safeSharePath(imageId);
    if (!filePath) return res.status(400).send("Invalid share id.");

    await fs.access(filePath);

    const imageUrl = `${PUBLIC_URL}/share/${imageId}.jpg`;

    res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>HHgoa 2026 — Hacker Goa House</title>

<meta property="og:type" content="website">
<meta property="og:title" content="HHgoa 2026 — Hacker Goa House">
<meta property="og:description" content="HHgoa 2026 ready ✨ #FrameInGoa">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:width" content="1600">
<meta property="og:image:height" content="2000">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="HHgoa 2026 — Hacker Goa House">
<meta name="twitter:description" content="HHgoa 2026 ready ✨ #FrameInGoa">
<meta name="twitter:image" content="${imageUrl}">

<style>
html,body{margin:0;background:#f5e9cf}
img{display:block;width:min(800px,100%);height:auto;margin:auto}
</style>
</head>

<body>
<img src="${imageUrl}" alt="HHgoa 2026 generated card">
</body>
</html>`);

  } catch {
    res.status(404).send("Share page not found.");
  }
});

app.use((error, _req, res, _next) => {
  console.error("SERVER ERROR:", error);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Photo is too large. Maximum size is 10MB." });
    }
    return res.status(400).json({ error: error.message });
  }

  res.status(400).json({ error: error?.message || "Something went wrong." });
});

app.listen(PORT, () => {
  console.log(`🌴 HHgoa 2026 running at ${PUBLIC_URL}`);
  console.log(`⚡ Static artwork cached at startup`);
  console.log(`🚀 Sharp concurrency: ${process.env.SHARP_CONCURRENCY || 2}`);
});
