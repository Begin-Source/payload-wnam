# SEO/GEO KPI Definitions

## 1. Organic Search KPIs

### Organic Sessions
- **Formula**: Count of sessions where medium = "organic"
- **Source**: Analytics platform
- **Good**: Growing MoM; 3-10% MoM growth is healthy
- **Warning**: Decline >10% MoM without seasonal cause
- **Key**: Always separate brand vs. non-brand organic sessions

### Organic CTR
- **Formula**: (Organic Clicks / Organic Impressions) x 100
- **Source**: Search Console
- **Good**: >3% overall
- **Warning**: <1.5% or declining trend

**CTR Benchmarks by Position**: #1: 25-35% | #2: 12-18% | #3: 8-13% | #4-5: 4-8% | #6-10: 2-5% | #11-20: 0.5-2%

**Signals**: Low CTR at stable position = title/meta descriptions need work. Declining CTR = SERP features (AI Overview, PAA) stealing clicks.

### Average Position
- **Formula**: Sum of all positions / count of keywords
- **Source**: Search Console (query-level), SEO tool (keyword-level)
- **Good**: <20 for tracked keywords; improving trend
- **Warning**: >30 or worsening trend
- **Key**: Directional indicator only — pair with keyword distribution (how many in top 10, top 20)

### Keyword Visibility Score
- **Formula**: Sum of (estimated CTR at position x monthly search volume) per keyword
- **Source**: SEO tool
- **Good**: Growing over time
- **Warning**: Declining 3+ consecutive weeks

### Pages Indexed
- **Formula**: Count of valid indexed pages in Index Coverage report
- **Source**: Search Console
- **Good**: Close to total intended indexable pages
- **Warning**: Dropping without intentional removal; large gap between submitted and indexed
- **Signals**: Indexed < submitted = quality/technical issues. Sudden drop = possible noindex, robots.txt change, or manual action. Indexed > intended = duplicate content or parameter URLs.

### Organic Conversion Rate
- **Formula**: (Organic Conversions / Organic Sessions) x 100
- **Source**: Analytics platform
- **Good**: >2% lead gen; >1% e-commerce
- **Warning**: <0.5% or declining while traffic grows

**Industry Benchmarks**: SaaS 2-5% | E-commerce 1-3% | Finance 3-6% | Healthcare 2-4% | B2B Services 2-5% | Media 0.5-2%

### Non-Brand Organic Traffic Share
- **Formula**: (Organic sessions - brand query sessions) / Organic sessions x 100
- **Good**: >50% of total organic
- **Warning**: <30% (over-reliance on brand awareness, not SEO)

---

## 2. GEO / AI Visibility KPIs

### AI Citation Rate
- **Formula**: (Queries where you are cited / Total monitored queries with AI answers) x 100
- **Good**: >20% of monitored queries
- **Warning**: <5% or declining

### AI Citation Position
- **Formula**: Sum of citation positions / count of citations
- **Good**: Top 3 sources on average
- **Warning**: Not cited or consistently position 5+

### AI Answer Coverage
- **Formula**: (Topics with AI answers / Total target topics) x 100
- **Good**: Growing over time
- **Warning**: Declining coverage

### Brand Mention in AI Responses
- **Formula**: Count of AI responses containing your brand name
- **Good**: Growing; present for your key topics
- **Warning**: Zero mentions for authority topics

---

## 3. Domain Authority KPIs

### Domain Rating / Domain Authority
- **Formula**: Logarithmic scale based on backlink quantity and quality (0-100)
- **Good**: Growing; competitive with top-ranking sites in niche
- **Benchmarks**: New (0-6mo): 0-15 | Early growth (6-18mo): 15-30 | Established (18-36mo): 25-50 | Mature (3+yr): 40-70+ | Industry leader: 70-90+

### Referring Domains
- **Formula**: Count of distinct root domains with at least one link
- **Good**: Growing MoM; higher than primary competitors
- **Warning**: Net loss for 2+ consecutive months

### Backlink Growth Rate
- **Formula**: New backlinks gained - backlinks lost in period
- **Good**: Positive and steady
- **Warning**: Negative 2+ months; sudden spikes (may indicate spam)

### Toxic Link Ratio
- **Formula**: (Toxic backlinks / Total backlinks) x 100
- **Good**: <5% | **Warning**: 5-10% | **Critical**: >10% (disavow needed)

---

## 4. Technical SEO KPIs

### Core Web Vitals

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| **LCP** | <=2.5s | 2.5-4.0s | >4.0s |
| **CLS** | <=0.1 | 0.1-0.25 | >0.25 |
| **INP** | <=200ms | 200-500ms | >500ms |

### Crawl Budget Utilization
- **Formula**: (Useful pages crawled / Total pages crawled) x 100
- **Good**: >80% of crawled pages are indexable, valuable
- **Warning**: High crawl of non-indexable or low-value pages

### Index Coverage Rate
- **Formula**: (Indexed pages / Submitted pages) x 100
- **Good**: >90% for curated sitemaps
- **Warning**: <80% or declining

---

## 5. Content Performance KPIs

### Content Efficiency Score
- **Formula**: Organic sessions per content piece / cost per content piece
- **Good**: Improving over time

### Content Decay Rate
- **Formula**: (Pages with >20% traffic decline over 6 months / Total pages with traffic) x 100
- **Good**: <20% per 6-month period
- **Warning**: >30%

### Organic Revenue Per Session
- **Formula**: Total organic revenue / Total organic sessions
- **Good**: Stable or growing
- **Warning**: Declining while traffic grows (quality deteriorating)

---

## 6. Competitive KPIs

### Share of Voice (SOV)
- **Formula**: (Your visibility score / Sum of all competitors' visibility scores) x 100
- **Good**: Growing; leading in core topic areas
- **Warning**: Declining 3+ consecutive months

### Competitive Keyword Overlap
- **Formula**: (Keywords where both rank in top 20 / Your total tracked keywords) x 100
- **Key**: High overlap for direct competitors is expected. New competitor with high overlap = emerging threat.

---

## 7. ROI and Business Impact KPIs

### SEO ROI
- **Formula**: ((Organic Revenue - SEO Investment) / SEO Investment) x 100
- **Good**: >200% annually
- **Warning**: <100% after 12+ months
- **Note**: Measure over 12+ month horizons — SEO compounds over time

### Organic Traffic Value
- **Formula**: Sum of (monthly organic clicks per keyword x CPC for that keyword)
- **Good**: Growing; significantly higher than SEO investment
- **Use**: Communicates SEO value in paid media terms ($50K/month traffic value with $10K SEO spend = 5:1 return)

---

## Summary Tables

### Organic Search Metrics

| Metric | Good | Warning | Source |
|--------|------|---------|--------|
| Organic sessions | Growing MoM | >10% decline | Analytics |
| Keyword visibility | >60% in top 100 | <40% | SEO tool |
| Average position | <20 | >30 | Search Console |
| Organic CTR | >3% | <1.5% | Search Console |
| Pages indexed | Growing | Dropping | Search Console |
| Organic CVR | >2% | <0.5% | Analytics |
| Non-brand share | >50% | <30% | Analytics |

### GEO/AI Visibility Metrics

| Metric | Good | Warning | Source |
|--------|------|---------|--------|
| AI citation rate | >20% | <5% | AI monitor |
| AI citation position | Top 3 | Not cited | AI monitor |
| AI answer coverage | Growing | Declining | AI monitor |
| Brand mention in AI | Growing | Zero | AI monitor |

---

## Trend Interpretation

| Pattern | Likely Cause | Action |
|---------|-------------|--------|
| Steady growth | Strategy working | Continue, optimize high performers |
| Sudden spike then drop | Viral content or algorithm volatility | Investigate, replicate if possible |
| Gradual decline | Content decay, competition, technical debt | Comprehensive audit |
| Flat line | Plateau — strategy maxed out | New content areas, new link strategies |
| Seasonal pattern | Industry/demand cycles | Plan content calendar around peaks |

### Period Comparison Guide

| Comparison | Best For | Limitation |
|-----------|---------|-----------|
| WoW | Sudden changes | Noisy, day-of-week patterns |
| MoM | Trends | Seasonal bias |
| YoY | Seasonality control | Doesn't reflect recent trajectory |
| Rolling 30-day | Smoothing noise | Lags behind real changes |
