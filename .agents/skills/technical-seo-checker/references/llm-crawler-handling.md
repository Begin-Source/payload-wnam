# LLM Crawler Handling (GPTBot / ClaudeBot / PerplexityBot / etc.)

Referenced from [SKILL.md](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/optimize/technical-seo-checker/SKILL.md). Use during technical audits to decide whether (and how) to allow AI-engine crawlers. As of 2026, this is a required technical-SEO decision, not an optional one.

---

## Why this matters

AI engines (ChatGPT Search, Claude Search, Perplexity, Google AI Overview, Gemini) crawl the web to populate training data AND real-time answer retrieval. Blocking them can:

- Prevent citation in AI answers (GEO visibility loss)
- Reduce brand mentions in AI-generated summaries
- Lock out traffic from the fastest-growing discovery channel

Allowing them can:
- Expose content to training without compensation
- Increase server load
- Leak competitive content to rivals who scrape via AI

**The decision is per-organization.** Common stances:

| Stance | Typical choice | Rationale |
|--------|----------------|-----------|
| Default-open (marketing-led orgs) | Allow all AI crawlers | GEO visibility > training-data concerns |
| Default-closed (IP-heavy orgs) | Block all | Proprietary research, legal docs, customer data |
| Split (most common in 2026) | Allow retrieval bots, block training bots | Best of both — see mapping below |

---

## Known crawler inventory (2026)

### OpenAI
| User-Agent | Purpose | Typical robots.txt choice |
|-----------|---------|---------------------------|
| `GPTBot` | Training data for future ChatGPT models | Most orgs block |
| `ChatGPT-User` | Real-time retrieval when ChatGPT answers with browsing | Most orgs allow (loses citation if blocked) |
| `OAI-SearchBot` | ChatGPT Search (retrieval-focused) | Allow for GEO visibility |

### Anthropic
| User-Agent | Purpose | Typical choice |
|-----------|---------|-----------------|
| `ClaudeBot` / `Claude-Web` | Training data | Most orgs block |
| `Claude-User` | Real-time fetch when user asks Claude to look up a URL | Allow |
| `anthropic-ai` (legacy) | Legacy tag; treat as `ClaudeBot` | Block if blocking training |

### Google
| User-Agent | Purpose | Typical choice |
|-----------|---------|-----------------|
| `Googlebot` | Search + AI Overview | Always allow |
| `Google-Extended` | Opt-out for Bard / Gemini training (does NOT affect Search ranking) | Block if opting out of training only |
| `GoogleOther` | Internal research / product testing | Allow |

### Perplexity
| User-Agent | Purpose | Typical choice |
|-----------|---------|-----------------|
| `PerplexityBot` | Crawl for retrieval answers | Allow for GEO visibility |
| `Perplexity-User` | Real-time fetch for user queries | Allow |

### Common Crawl
| User-Agent | Purpose | Typical choice |
|-----------|---------|-----------------|
| `CCBot` | Feeds Common Crawl dataset used by many LLMs | Blocking here is indirect training opt-out |

### Other 2026
| User-Agent | Purpose |
|-----------|---------|
| `Bytespider` | TikTok / Doubao / ByteDance LLMs |
| `Applebot-Extended` | Apple Intelligence training opt-out |
| `cohere-ai` | Cohere training |
| `Meta-ExternalAgent` | Meta Llama training |
| `Diffbot` | B2B data scraping (may power enterprise LLMs) |
| `omgili` | Data broker — often blocked |
| `DataForSeoBot`, `AhrefsBot`, `SemrushBot` | SEO tool crawlers — allow if you use the tool |

---

## Recommended robots.txt patterns

### Pattern 1 — Default-open (maximize GEO visibility, accept training)

```txt
# Allow all AI engines for both retrieval and training
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: cohere-ai
Allow: /

# Block only data resellers / scrapers
User-agent: omgili
Disallow: /
```

### Pattern 2 — Default-closed (training opt-out, retrieval in)

```txt
# Allow retrieval bots (needed for GEO visibility)
User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Googlebot
Allow: /

# Block training bots
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: cohere-ai
Disallow: /

User-agent: Meta-ExternalAgent
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /
```

### Pattern 3 — Section-specific (e.g., allow blog, block pricing)

```txt
User-agent: GPTBot
Allow: /blog/
Allow: /guides/
Disallow: /pricing/
Disallow: /customers/
Disallow: /
# The trailing Disallow: / is the default; Allow: entries above it take precedence
```

---

## Legal layer beyond robots.txt

Robots.txt alone is **not a legal opt-out** under EU law. For full compliance:

### EU DSM Directive Art 4(3) — TDM reservation

```html
<!-- In page HEAD -->
<meta name="tdm-reservation" content="1" />
```

Or HTTP response header:

```
X-Robots-Tag: noai, notrain
```

Reference: [W3C TDM Reservation Protocol](https://www.w3.org/2022/tdmrep/).

### EU AI Act Art 53(1)(c) — GPAI provider obligations
Art 53 applicable date: **2025-08-02**. GPAI providers must: publish training data summary, respect `tdm-reservation` opt-out, establish copyright policy. Content owners: monitor training data summaries; file DMCA/EU complaints if content appears despite opt-out.

### CCPA — 2026 California extension
CA AG 2025 guidance extends "right to opt-out of sale/share" to training data. Use `Global Privacy Control (GPC)` HTTP header.

### Post-training content removal
- **OpenAI**: https://platform.openai.com/privacy-removal-request
- **Google**: Search Console > Settings > Crawling (Google-Extended block)
- **Perplexity**: legal@perplexity.ai with URL + copyright assertion
- **Anthropic**: privacy@anthropic.com

### Enforcement timeline
| Jurisdiction | Regulation | Effective | Status |
|---|---|---|---|
| EU | DSM Art 4 | 2019 / 2021 transposition deadline | Active |
| EU | AI Act Art 53 GPAI | 2025-08 | Active |
| US CA | CCPA training data | 2025 AG guidance | Enforceable |
| UK | TDM exception | 2025 consultation | Pending |

## Diagnostic signals

| Signal | Action |
|--------|--------|
| No `User-agent: GPTBot` / `ClaudeBot` / `PerplexityBot` rules in robots.txt | Site is using default-allow; confirm this is intentional with user |
| `Disallow: /` under `User-agent: *` | All bots blocked including Googlebot — usually accidental |
| Rules in robots.txt but no `<meta name="robots">` counterpart on high-value pages | Inconsistent — AI bots may honor meta tag differently |
| Server logs show `GPTBot` / `ClaudeBot` 429s or 403s | Firewall / CDN rate-limiting the bot (Cloudflare's default AI scraper rule, for example) — decide explicitly |
| Cloudflare "Block AI scrapers" toggle on | Check if user expects this — it overrides robots.txt |

## Cloudflare-specific (2026)

Cloudflare "Block AI scrapers" toggle blocks GPTBot, ClaudeBot, CCBot at the edge **before** robots.txt. Audit: Security -> Bots -> AI Scrapers and Crawlers -> verify toggle matches org stance. If Cloudflare blocks but robots.txt allows, Cloudflare wins.

## Handoff addition

- `ai_crawler_stance`: `default-open` | `default-closed` | `mixed` | `unknown`
- `ai_crawler_blocked`: list of bot user-agents blocked (e.g., `[GPTBot, ClaudeBot, CCBot]`)
- `ai_crawler_allowed`: list allowed for retrieval (e.g., `[ChatGPT-User, PerplexityBot]`)
- `ai_crawler_edge_override`: `true` if Cloudflare / Cloudfront is enforcing rules ahead of robots.txt
- Open loop: ask user to confirm or modify stance if unknown

## See also

- [geo-content-optimizer](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/build/geo-content-optimizer/SKILL.md) — downstream skill that depends on AI engines actually seeing your content
- [entity-optimizer](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/cross-cutting/entity-optimizer/SKILL.md) — blocking retrieval bots breaks AI entity recognition
