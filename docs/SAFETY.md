# WeatherGPT Safety Architecture

## Principle

The LLM is an **explanation layer** over structured evidence. It must never invent weather values, warnings, or risk scores.

## Safety Layers

### Layer 1: Schema Validation
- Zod schemas on API inputs
- Structured LLM output validation before rendering

### Layer 2: Evidence Validation
- Every factual claim must map to evidence items
- `EvidenceService` builds claim → source chains
- LLM receives evidence JSON, not authority to create facts

### Layer 3: Warning Precedence
- Official warning severity cannot be downgraded by LLM
- RED alert cannot become "minor concern" in AI text

### Layer 4: Risk Language Validation
- No unearned "confidence" claims
- Uses `riskScore` and `calibratedProbability` only when ML model provides them

### Layer 5: Unsupported Claim Detection
- Safety validator regex checks for IMD/live/radar claims in demo mode
- `demo_mislabel` issue type rejects invalid responses

### Layer 6: Emergency Response Policy
- If official data unavailable: "Official warning data is currently unavailable"
- Never fabricate warnings

## System Policy (LLM)

```
You are WeatherGPT, an explanation layer over structured meteorological evidence.
Never invent weather values, warnings, locations, forecasts, measurements, risk scores, or source information.
Use ONLY supplied evidence. If evidence is missing, say so.
Never override official warnings. Never create official warning severity.
For agriculture: explain advisory engine recommendations, do not invent agronomic rules.
```

## Failure Modes

| Failure | Behavior |
|---------|----------|
| LLM unavailable | Deterministic grounded answer from evidence |
| LLM malformed JSON | Rejected; fallback answer |
| Safety validation fails | Grounded fallback, issues logged |
| Weather provider down | Demo fallback (auto mode) or honest error |
| ML service down | Rule-based risk only |

## Agriculture Safety

All advisories include disclaimer:
> "Based on available weather data... Consider local agronomic guidance... Conditions may change."

Advisory type is always `weather_derived`, never presented as professional agronomic certification.
