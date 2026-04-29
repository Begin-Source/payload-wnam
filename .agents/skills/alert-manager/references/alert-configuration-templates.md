# Alert Configuration Templates

---

## Ranking Alerts

### Position Drop Alerts
| Alert Name | Condition | Threshold | Priority |
|------------|-----------|-----------|----------|
| Critical Drop | Top 3 keyword drops 5+ positions | Position change >=5 | Critical |
| Major Drop | Top 10 keyword drops out of top 10 | Position >10 | High |
| Moderate Drop | Any keyword drops 10+ positions | Position change >=10 | Medium |
| Competitor Overtake | Competitor passes you for key term | Comp position < yours | Medium |

### Position Improvement / SERP Feature Alerts
| Alert Name | Condition | Priority |
|------------|-----------|----------|
| New Top 3 | Keyword enters top 3 | Positive |
| Page 1 Entry | Keyword enters top 10 | Positive |
| Significant Climb | Keyword improves 10+ positions | Positive |
| Snippet Lost | Lost featured snippet | High |
| Snippet Won | Won featured snippet | Positive |
| AI Overview Change | Appeared/disappeared in AI Overview | Medium |

---

## Traffic Alerts

### Traffic Decline Alerts
| Alert Name | Condition | Threshold | Priority |
|------------|-----------|-----------|----------|
| Traffic Crash | Day-over-day decline | >=50% drop | Critical |
| Significant Drop | Week-over-week decline | >=30% drop | High |
| Moderate Decline | Month-over-month decline | >=20% drop | Medium |
| Trend Warning | 3 consecutive weeks decline | Any decline | Medium |

### Page-Level Alerts
| Page Type | Alert Condition | Priority |
|-----------|-----------------|----------|
| Homepage | Any 20%+ decline | Critical |
| Top 10 pages | Any 30%+ decline | High |
| Conversion pages | Any 25%+ decline | High |
| Blog posts | Any 40%+ decline | Medium |

### Conversion Alerts
| Alert Name | Condition | Priority |
|------------|-----------|----------|
| Conversion Drop | Organic conversions down 30%+ | Critical |
| CVR Decline | Conversion rate drops 20%+ | High |

---

## Technical SEO Alerts

### Critical
| Alert Name | Condition | Priority | Response Time |
|------------|-----------|----------|---------------|
| Site Down | HTTP 5xx errors | Critical | Immediate |
| SSL Expiry | Certificate expiring in 14 days | Critical | Same day |
| Robots.txt Block | Important pages blocked | Critical | Same day |
| Index Dropped | Pages dropping from index | Critical | Same day |

### Crawl, Index & Performance
| Alert Name | Condition | Priority |
|------------|-----------|----------|
| Crawl Errors Spike | Errors increase 50%+ | High |
| New 404 Pages | 404 errors on important pages | Medium |
| Redirect Chains | 3+ redirect hops | Medium |
| Index Coverage Drop | Indexed pages decline 10%+ | High |
| Core Web Vitals Fail | CWV drops to "Poor" | High |
| Mobile Issues | Mobile usability errors | High |

### Security
| Alert Name | Condition | Priority |
|------------|-----------|----------|
| Security Issue / Manual Action / Malware | GSC warning or flagged | Critical |

---

## Backlink Alerts

| Alert Name | Condition | Priority |
|------------|-----------|----------|
| High-Value Link Lost | DA 70+ link removed | High |
| Multiple Links Lost | 10+ links lost in a day | Medium |
| High-Value Link Gained | New DA 70+ link | Positive |
| Suspicious/Negative SEO Links | Spam link pattern | High |
| Toxic Score Increase | Toxic score up 20%+ | High |

---

## Competitor Monitoring Alerts

| Alert Name | Condition | Priority |
|------------|-----------|----------|
| Competitor Overtake | Competitor passes you | Medium |
| Competitor Top 3 | Competitor enters top 3 on key term | Medium |
| Competitor Content/Update | Publishes or updates on your topic | Info |
| Competitor New Backlinks | Gains high-DA link | Info |

---

## GEO (AI Visibility) Alerts

| Alert Name | Condition | Priority |
|------------|-----------|----------|
| Citation Lost | Lost AI Overview citation | Medium |
| Citation Won | New AI Overview citation | Positive |
| Citation Rate Drop | AI citation rate drops 20%+ | High |
| GEO Competitor | Competitor cited where you're not | Medium |

---

## Brand Monitoring Alerts

| Alert Name | Condition | Priority |
|------------|-----------|----------|
| Negative Mention | Negative sentiment mention | High |
| Review Alert | New review on key platforms | Medium |
| Unlinked Mention | Brand mention without link | Opportunity |
| Review Rating Drop | Average rating drops | High |

---

## Alert Response Plans

### Critical (within 1 hour)
| Alert Type | Immediate Actions |
|------------|-------------------|
| Site Down | Check server status, contact hosting, check DNS |
| Traffic Crash | Check algorithm update, review GSC errors, check competitors |
| Manual Action | Review GSC message, identify issue, begin remediation |
| Critical Rank Drop | Check indexing, review SERP, analyze competitors |

### High Priority (same day)
| Alert Type | Actions |
|------------|---------|
| Major Rank Drops | Analyze cause, create recovery plan |
| Traffic Decline | Investigate source, check technical issues |
| Backlink Loss | Attempt recovery outreach |
| CWV Failure | Diagnose and fix performance issues |

### Medium (within 48 hours)
Moderate rank changes, competitor movement, new 404s.

### Low (weekly review)
Positive changes, info alerts — document and log for trend analysis.

---

## Alert Notification Setup

| Priority | Channels | Frequency |
|----------|----------|-----------|
| Critical | Email + SMS + Slack | Immediate |
| High | Email + Slack | Immediate |
| Medium | Email + Slack | Daily digest |
| Low | Email | Weekly digest |

### Recipients
| Role | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| SEO Manager | Yes | Yes | Yes | Yes |
| Dev Team | Yes | Yes (tech only) | No | No |
| Marketing Lead | Yes | Yes | No | No |
| Executive | Yes | No | No | No |

### Suppression & Escalation
- Suppress duplicate alerts for 24 hours
- Don't alert on known issues (maintenance windows)
- Batch low-priority alerts into digests
- Escalate: Critical no response in 1hr -> Director; High 4hr -> Manager; Medium 24hr -> Lead
