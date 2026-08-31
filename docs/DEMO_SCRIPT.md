# SIH Demo Script (3 minutes)

## Setup

```bash
DEMO_MODE=on npm run dev
# Or live mode with GEMINI_API_KEY set
```

Open http://localhost:3000 — verify DEMO or LIVE badge in header.

---

## Demo 1: Multilingual Weather (60 seconds)

**Action:** Type or use quick prompt:
> उद्या पुण्यात संध्याकाळी पाऊस पडेल का?

**Show:**
1. Query understanding detected (forecast + precipitation intent)
2. Location resolved to Pune
3. Rain probability from forecast evidence
4. Risk score displayed
5. Answer in Marathi (if Gemini configured) or deterministic English
6. Source attribution: "Demo Provider" or "Open-Meteo"
7. Evidence section in response

**Judge point:** "The AI explains evidence — it doesn't invent the rain probability."

---

## Demo 2: Disaster Intelligence (60 seconds)

**Action:** Ask:
> Are there any weather warnings for Pune?

**Show:**
1. Active ORANGE alert from demo fixture
2. Severity badge (GREEN/YELLOW/ORANGE/RED)
3. Issued time and expiry time
4. Source label (Demo Provider — not IMD)
5. Affected areas
6. Recommendation to follow advisory

**Judge point:** "We consume and explain warnings — we don't declare official warnings independently."

---

## Demo 3: Agriculture (60 seconds)

**Action:** Ask:
> मी पुण्यात सोयाबीन पिकवतो. उद्या सिंचन करावं का?

Or use agriculture advisory API:
```bash
curl -X POST http://localhost:3000/api/v1/agriculture/advisory \
  -H "Content-Type: application/json" \
  -d '{"crop":"soybean","stage":"flowering","location":"Pune"}'
```

**Show:**
1. Crop identified: soybean
2. Weather + forecast considered
3. Rule engine recommendation (e.g., delay irrigation if rain > 70%)
4. Reason codes explaining WHY
5. Disclaimer about professional agronomic advice
6. LLM explanation of the recommendation

**Judge point:** "Agriculture decisions come from the rule engine, not the LLM."

---

## Backup: Architecture Walkthrough

If live demo fails, show:
- `/api/v1/ready` — dependency health
- `/api/v1/sources` — data transparency
- `docs/ARCHITECTURE_AUDIT.md` — honest gap analysis
- `docs/SAFETY.md` — hallucination prevention
