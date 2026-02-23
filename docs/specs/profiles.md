# Archon Profiles and Risk Configuration v0.1

Profiles are convenience wrappers over explicit module toggles and restriction templates.

Profiles are not authoritative beyond setting toggles.

---

# 1. Profile Structure

A profile consists of:

- Name
- Module toggle set
- Optional dynamic restriction template
- Declared maximum risk tier

Profiles resolve to:

Profile → Explicit Module Toggle Diff + DRR Diff

---

# 2. Confirm-on-Change Policy

The following require operator confirmation:

- Applying a profile
- Enabling/disabling modules
- Modifying dynamic restrictions

Confirmation must surface:

- Toggle changes
- Tier elevation (if any)
- Hazard combination flags
- Required typed acknowledgment text

---

# 3. Risk Tier Elevation

If applying a profile increases system tier:

Operator must:

- Type required acknowledgment phrase
- Confirm awareness of elevated risk

Tier change must be logged with:

- Previous tier
- New tier
- Snapshot hash

---

# 4. Default Posture

System start state:

- No modules enabled
- Tier = T0
- No capabilities active

Archon must boot as chatbot-only.

---

# 5. Profile Transparency

Profiles must not:

- Hide module enablement
- Implicitly enable high-tier capability
- Modify rules without surfacing diff

Profiles are inspectable and versioned.