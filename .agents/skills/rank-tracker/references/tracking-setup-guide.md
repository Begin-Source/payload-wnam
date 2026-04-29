# Rank Tracking Setup Guide

---

## 1. Tracking Tool Configuration

### Initial Setup Checklist

| Step | Action | Notes |
|------|--------|-------|
| 1 | Select tracking tool | ~~SEO tool with rank tracking capability |
| 2 | Add target domain | Primary domain + any subdomains |
| 3 | Set tracking location | Country, state/region, or city level |
| 4 | Configure device settings | Mobile + desktop (recommended: both) |
| 5 | Set search engine | Google (primary), Bing (optional) |
| 6 | Set language | Match target audience language |
| 7 | Configure update frequency | Daily for priority, weekly for long-tail |
| 8 | Add competitor domains | 3-5 direct competitors |
| 9 | Import keyword list | From keyword research or existing tracking |
| 10 | Verify initial data pull | Confirm positions match manual spot checks |

### Location Configuration

| Scenario | Location Setting |
|----------|-----------------|
| National business | Country level |
| Regional business | State/region level |
| Local business | City level |
| Multi-location | Separate project per location |
| International | Separate project per country |

### Update Frequency

| Keyword Tier | Frequency |
|-------------|-----------|
| Top 20 revenue keywords | Daily |
| Brand keywords | Daily |
| Page 1 keywords (21-50) | 2-3x per week |
| Page 2 keywords (51-100) | Weekly |
| Long-tail / monitoring (100+) | Weekly |
| New/experimental keywords | Daily for first 30 days, then adjust |

---

## 2. Keyword Selection for Tracking

### How Many Keywords to Track

| Site Size | Recommended | Breakdown |
|-----------|-------------|-----------|
| Small (< 50 pages) | 50-100 | 10 brand + 20 primary + 20 secondary + rest long-tail |
| Medium (50-500 pages) | 100-500 | 20 brand + 50 primary + 100 secondary + rest long-tail |
| Large (500+ pages) | 500-2000+ | Scale proportionally; focus on revenue pages |
| Enterprise | 2000-10000+ | Comprehensive with automated management |

### Keyword Selection Criteria

| Factor | Weight | Selection Rule |
|--------|--------|---------------|
| Revenue impact | High | Always track keywords that drive conversions |
| Search volume | Medium | Track keywords with meaningful volume |
| Current ranking | Medium | Track pages 1-3 plus targets |
| Competitive value | Medium | Track keywords your competitors target |
| Strategic importance | High | Track keywords aligned with business goals |
| Content investment | Medium | Track keywords for pages you invested in |

### Keyword Types to Include

| Type | % of Tracked | Examples |
|------|-------------|---------|
| Brand | 5-10% | "[brand]", "[brand] + product", "[brand] reviews" |
| Primary commercial | 15-25% | "[product category]", "best [product]" |
| Secondary commercial | 15-25% | "[product] for [use case]", "[product] vs [competitor]" |
| Informational | 20-30% | "how to [topic]", "what is [concept]" |
| Long-tail | 15-25% | Specific queries with 3+ words |
| Local (if applicable) | 5-10% | "[service] near me", "[service] in [city]" |

### Keywords NOT to Track

| Skip These | Why |
|-----------|-----|
| Zero-volume (unless strategic) | No measurable impact |
| No content for them | Track only when targeting content exists |
| Extremely broad single-word | Too volatile, misleading |
| Misspellings (unless significant volume) | Clutters reporting |

---

## 3. Keyword Grouping Strategies

### Grouping Dimensions

| Dimension | Insight Gained |
|-----------|----------------|
| **Topic cluster** | Content hub performance |
| **Search intent** | Funnel stage performance |
| **Product/service** | Product line performance |
| **Content type** | Format effectiveness |
| **Priority tier** | Resource allocation |
| **Page** (URL-level) | Page-specific performance |
| **Competitor overlap** | Competitive intelligence |

### Recommended Group Hierarchy

```
Level 1: Business Unit / Product Line
  -> Level 2: Topic Cluster / Category
       -> Level 3: Search Intent
            -> Level 4: Priority Tier
```

### Group Naming Conventions

| Pattern | Example |
|---------|---------|
| `[Category] - [Intent]` | "Email Marketing - Commercial" |
| `[Product] / [Feature]` | "CRM / Lead Scoring" |
| `T1: [Topic]` | "T1: Core Product Terms" |

---

## 4. Alert Threshold Configuration

### Alert Configuration by Keyword Tier

| Keyword Tier | Drop Alert | Gain Alert | Competitor Alert |
|-------------|-----------|-----------|-----------------|
| Tier 1 (revenue) | Drop >= 3 positions | Gain >= 3 positions | Competitor enters top 5 |
| Tier 2 (growth) | Drop >= 5 positions | Enters top 10 | Competitor overtakes you |
| Tier 3 (monitor) | Drop >= 10 positions | Enters top 20 | None |
| Brand | Any drop from #1 | N/A | Competitor ranks for your brand |

### Alert Delivery

| Alert Type | Channel | Frequency |
|-----------|---------|-----------|
| Critical drops (Tier 1) | Email + Slack | Immediate |
| Significant changes | Email | Daily digest |
| Weekly summary | Email | Every Monday |
| Monthly report | Email + dashboard | 1st of month |

---

## 5. Reporting Cadences

| Report Type | Audience | Frequency | Key Metrics |
|------------|----------|-----------|-------------|
| Quick pulse | SEO team | Daily | Major movements, alerts fired |
| Weekly summary | Marketing team | Weekly | Position changes, trends, actions |
| Monthly report | Stakeholders | Monthly | Full analysis, MoM comparisons |
| Quarterly review | Leadership | Quarterly | Strategic trends, ROI, competitive position |

**Daily**: biggest position changes, alerts, competitor movements.
**Weekly**: position distribution changes, top 5 improvements/declines, SERP feature wins/losses, AI citation changes.
**Monthly**: full position distribution, competitor share of voice, GEO visibility trends, content performance by group, recommendations.
**Quarterly**: QoQ trends, progress vs annual goals, competitive landscape shifts, strategic opportunities.

---

## 6. Data Interpretation Guidelines

### Understanding Rank Fluctuations

| Pattern | Meaning | Action |
|---------|---------|--------|
| Daily +/- 1-2 positions | Normal fluctuation | Ignore; track weekly trend |
| Sudden drop 5+, recovers in 2-3 days | Google testing / data center variation | Monitor only |
| Steady decline over 2+ weeks | Real ranking loss | Investigate cause |
| Sudden drop affecting many keywords | Algorithm update or technical issue | Check Search Status Dashboard |
| One keyword drops, others stable | Page or competitor-specific | Analyze that SERP |
| All keywords for one URL drop | Page-level issue (noindex, 404, slow) | Check page technical health |

### Position vs. Traffic Relationship

| Position Change | Est. Traffic Impact |
|----------------|------------------------|
| #1 to #2 | -50% to -60% click loss |
| #2 to #3 | -25% to -30% |
| #3 to #5 | -30% to -40% |
| #5 to #10 | -50% to -60% |
| #10 to #11 | -60% to -80% (page 2 cliff) |

### Comparing Against Competitors

| Signal | Meaning | Response |
|--------|---------|----------|
| Competitor rising, yours stable | They are gaining ground | Analyze their strategy |
| Your visibility rising faster | You are winning share of voice | Continue strategy |
| All competitors dropping | Algorithm update | Focus on quality, wait |
| One competitor surging | Significant change | Analyze what they did |

### Data Quality Checks

| Check | Frequency |
|-------|-----------|
| Spot-check positions manually (5-10 kw) | Weekly |
| Compare with Search Console | Monthly |
| Check for tracking errors (position 0) | Weekly |
| Verify competitor data manually | Monthly |
| Confirm location accuracy (VPN) | Quarterly |

---

## 7. Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Tracking too many keywords | Focus on business-impact keywords |
| Checking rankings too frequently | Focus on weekly/monthly trends |
| Not segmenting data | Group by intent, topic, priority |
| Ignoring SERP features | Track snippets, AI Overviews, PAA |
| Not tracking competitors | Always track 3-5 competitors |
| Single location tracking | Track each target market separately |
| Forgetting mobile | Always track both devices |
| Not documenting changes | Log all content/technical/link changes |

---

## 8. Migration and Tool Switching

| Step | Action |
|------|--------|
| 1 | Export all historical data from current tool |
| 2 | Run both tools in parallel for 2-4 weeks |
| 3 | Compare data between tools |
| 4 | Document systematic position differences |
| 5 | Import historical data into new tool if supported |
| 6 | Reconfigure all alerts and reports |
| 7 | Decommission old tool after confidence in new data |

**Note**: 1-2 position variance between tools is normal.
