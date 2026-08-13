# HHgoa 2026 — Builder ID Card Generator

Upload a photo, fill in a few fields, get back a branded HHgoa 2026 badge you
can download and share to X — with a real link preview, not a blank card.

**Live demo:** _[add your deployed URL here before submitting]_

Built for the HH Goa 2026 shortlisting task (Format B: Builder ID Card).

---

## What it does

1. Upload a photo (JPG, PNG, or HEIC/HEIF straight from an iPhone — converted
   to JPEG in-browser before upload).
2. Fill in name, stack, role, and a fun field.
3. Hit **Generate badge** — the server composites your photo into the
   HHgoa card and returns a real image file in a few seconds.
4. **Download PNG/JPG** gets you the actual file.
5. **Share to X** opens a pre-filled tweet linking to a page whose
   `og:image` is the generated badge, so the tweet unfurls with the real
   graphic — not a generic thumbnail.

## Why it's built this way

**Format B over Format A.** A PFP frame is a lower ceiling — it's just a
border. A builder ID card lets us show off HHgoa branding *and* let people
express themselves (stack, role, fun field), which makes for a more
shareable, more "unmistakably this event" result per the brief.

**Server-rendered final image, client-rendered live preview.** A browser
cannot attach a locally-generated image to a Twitter/X share-intent URL —
that's a hard platform restriction, not a limitation of this build. The
*only* way to satisfy "link preview shows the actual graphic" is for the
image to exist at a public URL before the tweet is posted, so Twitter's
crawler can fetch it for the OG card. That means the real badge has to be
rendered server-side and hosted, with `/s/:id` serving an HTML page with
proper `og:image` tags pointing at `/share/:id.jpg`.

The canvas-based live preview in the browser stays in — it's genuinely
useful (instant feedback while typing, zero server load) — but it's cosmetic
until the user hits Generate. The server-rendered image is the only one
that ever gets downloaded or shared.

**Static artwork rendered once, not per-request.** The card background/frame
is fixed for every user, so it's rendered to a PNG buffer once at server
boot and reused. Only the photo composite and text overlay are generated
per request. This is most of why generation stays in the "few seconds, not
a loading screen" range the brief asks for.

**HEIC conversion happens client-side.** iPhone photos get converted to JPEG
in the browser via `heic2any` before upload, rather than relying on the
server's image library having HEIC decode support compiled in (which isn't
guaranteed across hosting environments and is a common silent-failure point).

## What was deliberately cut, and why

Given the timeline, these were cut rather than half-built:

- **Rate limiting on `/api/generate`.** Matters for a public production
  service under sustained load; doesn't materially affect a hackathon judge
  testing the flow once or twice. Flagged as a known gap, not shipped
  half-working.
- **Automatic cleanup of old generated images.** Same reasoning — matters
  at scale over weeks, not during a judging window.
- **Multi-member "crew" fields.** The brief asks for "a couple of quick
  fields," and the badge layout already has a builder ID card feel with
  name/stack/role/fun field. Adding team members was scope beyond what was
  asked and risked spreading effort thin over things nobody would grade.

What *wasn't* cut, because the brief calls them out explicitly: HEIC
support, mobile layout, the OG-image share flow, and handling non-square/
off-center photos (the photo is object-fit: cover'd, not assumed pre-cropped,
on both the live preview and the server render).

## Running it locally

```
npm install
npm start
```

Serves on `http://localhost:3000`. Set `PUBLIC_URL` to your real domain
before deploying — the OG image tags use it directly, and a `localhost`
value will make the X share preview fail for anyone but you.

## Stack

Node.js + Express + Sharp (server-side compositing), vanilla HTML/Canvas/JS
(client-side live preview), `heic2any` (client-side HEIC→JPEG conversion).
