# Knowledge Graph Optimization Guide

> Part of [entity-optimizer](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/cross-cutting/entity-optimizer/SKILL.md). See also: [entity-signal-checklist.md](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/cross-cutting/entity-optimizer/references/entity-signal-checklist.md)

## How Knowledge Graphs Work

```
Your Entity
+-- is described by -> Wikidata, Wikipedia, Schema.org on your site
+-- is linked to -> Social profiles (LinkedIn, X, etc.)
+-- is mentioned by -> News articles, industry sites
+-- is recognized by -> Google KG, Bing Satori, AI training data
```

| Knowledge Graph | Who Uses It | Impact |
|----------------|-------------|--------|
| **Google Knowledge Graph** | Google Search, Google AI | Knowledge Panels, rich results, entity understanding |
| **Wikidata** | Google, Bing, Apple, Amazon, AI systems | Open data feeding multiple KGs; primary structured source |
| **Wikipedia** | Google, all AI systems | LLM training data; KP descriptions often sourced here |
| **Bing Satori** | Bing, Copilot | Bing entity understanding + Microsoft Copilot |
| **Schema.org (your site)** | All search engines, AI crawlers | First-party structured data you control |

Data flow: Your Website (Schema.org) + Wikidata + Wikipedia + Directories + News + Social -> Google Knowledge Graph -> Knowledge Panel / AI Results / Rich Results

## Google Knowledge Graph

### Getting In
1. **Have a Wikidata entry** — most direct path
2. **Earn a Wikipedia article** — strongest single signal
3. **Implement Schema.org markup** — structured self-description
4. **Get mentioned on authoritative sites** — third-party validation
5. **Build branded search demand** — signals users look for your entity

### Checking Status
- **Google Search**: search entity name in quotes; Knowledge Panel = in KG
- **KG API**: `GET https://kgsearch.googleapis.com/v1/entities:search?query=[entity]&key=[API_KEY]`
- **~~knowledge graph**: query directly if connected

### Claiming Your Knowledge Panel
1. Search for entity on Google
2. Click "Claim this knowledge panel" at bottom of panel
3. Verify via official website, Search Console, YouTube, or other Google property

### Common Knowledge Panel Fixes

| Problem | Solution |
|---------|----------|
| No Knowledge Panel | Build Wikidata + Schema.org + authoritative mentions. 2-6 months. |
| Wrong image | Update on Wikidata (P18), About page, social profiles. Claim panel and suggest. |
| Wrong description | Edit Wikidata description. Update About page first paragraph. |
| Missing attributes | Add to Wikidata and Schema.org. Claim panel and suggest. |
| Outdated information | Update Wikidata, About page, Wikipedia, social profiles. |
| Wrong entity shown | Disambiguation needed — see Wikidata section. |

## Wikidata

### Creating a Wikidata Entry

**Step 1: Check Eligibility** — entity must be referenced in at least one external source. Lower bar than Wikipedia.

**Step 2: Create Item** at https://www.wikidata.org/wiki/Special:NewItem — Label, Description, Aliases.

**Step 3: Add Core Statements**

**Organizations:**
| Property | Code | Example |
|----------|------|---------|
| instance of | P31 | business (Q4830453) |
| official website | P856 | https://example.com |
| inception | P571 | 2020-01-15 |
| country | P17 | United States (Q30) |
| headquarters location | P159 | San Francisco (Q62) |
| industry | P452 | software industry (Q638608) |
| founded by | P112 | [founder's Wikidata item] |
| CEO | P169 | [CEO's Wikidata item] |

**Persons:**
| Property | Code |
|----------|------|
| instance of | P31 -> human (Q5) |
| occupation | P106 |
| employer | P108 |
| educated at | P69 |
| country of citizenship | P27 |
| official website | P856 |

**Products/Software:**
| Property | Code |
|----------|------|
| instance of | P31 -> software (Q7397) or web application (Q189210) |
| developer | P178 |
| official website | P856 |
| programming language | P277 |
| software license | P275 |
| inception | P571 |

**Step 4: Add External Identifiers** — P856 (website), P2002 (X), P4264 (LinkedIn), P2037 (GitHub), P2087 (CrunchBase), P2671 (Google KG ID), P3861 (App Store).

**Step 5: Add References** — every statement must have one. Use official website, news articles, industry reports, government registries.

### Wikidata Maintenance
| Task | Frequency |
|------|-----------|
| Review existing statements | Quarterly |
| Add new properties | When available |
| Check for vandalism | Monthly |
| Add new references | When new coverage appears |
| Update identifiers | When new profiles created |

## Wikipedia

### Notability Requirements
- **Significant coverage** in **reliable, independent sources**
- Coverage must be **non-trivial**
- Sources must be **independent** of the entity

### Building Toward Notability
| Strategy | Timeline | Impact |
|----------|----------|--------|
| News article coverage | 1-3 months | High |
| Academic paper citations | 6-12+ months | High |
| Book publication or feature | 6-12+ months | High |
| Industry report mentions | 3-6 months | Medium |
| Conference speaking + coverage | 3-12 months | Medium |

### Wikipedia Article Rules
**DO**: neutral encyclopedic tone, independent reliable sources, follow Manual of Style, disclose COI.
**DO NOT**: promotional content, use entity's own website as primary source, create from company account without disclosure, remove sourced criticism.

## Schema.org Entity Markup

### Minimum Viable Entity Schema

**Organization:**
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://example.com/#organization",
  "name": "Example Corp",
  "url": "https://example.com",
  "logo": "https://example.com/logo.png",
  "description": "Example Corp is a [what it is] that [what it does].",
  "foundingDate": "2020-01-15",
  "founder": { "@type": "Person", "name": "Jane Smith", "@id": "https://example.com/about/jane-smith#person" },
  "sameAs": [
    "https://www.wikidata.org/wiki/Q12345678",
    "https://en.wikipedia.org/wiki/Example_Corp",
    "https://www.linkedin.com/company/example-corp",
    "https://x.com/examplecorp"
  ]
}
```

**Person:**
```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://example.com/about/jane-smith#person",
  "name": "Jane Smith",
  "jobTitle": "CEO",
  "worksFor": { "@type": "Organization", "@id": "https://example.com/#organization" },
  "sameAs": ["https://www.wikidata.org/wiki/Q87654321", "https://www.linkedin.com/in/janesmith"]
}
```

### sameAs Best Practices
**Must include**: Wikidata URL (most important), Wikipedia URL, LinkedIn URL, official social profiles.
**Common mistakes**: linking generic pages, inconsistent naming, missing Wikidata link, dead URLs.

### Cross-Page Entity Consistency
Every page should reference the same entity `@id`:
```json
{ "@type": "Article", "author": { "@type": "Person", "@id": "https://example.com/about/jane-smith#person" }, "publisher": { "@type": "Organization", "@id": "https://example.com/#organization" } }
```

## Monitoring Entity Health

### Quarterly Check
| Check | What to Look For |
|-------|-----------------|
| Knowledge Panel accuracy | Correct info, image, attributes |
| Wikidata entry | No vandalism, info current |
| AI entity resolution (3+ systems) | Accurate recognition and description |
| Schema.org validation | No errors, complete entity data |
| Branded search SERP | Clean SERP, no disambiguation issues |
| Social profile consistency | Same name, description, links |

### Entity Health Metrics
| Metric | Target |
|--------|--------|
| Knowledge Panel presence | Present and accurate |
| Branded search CTR | > 50% for exact brand name |
| AI recognition rate | Recognized by 3/3 major AI systems |
| Wikidata completeness | 15+ properties with references |
| Schema.org error count | 0 errors |

### Recovery Playbooks

**Entity disappeared from KG**: Check Wikidata deletion/merge -> verify Schema.org -> check algorithm updates -> rebuild signals (Wikidata first). Timeline: 2-8 weeks.

**AI systems giving incorrect info**: Identify incorrect sources -> correct at source (Wikidata, Wikipedia, About page) -> use feedback mechanisms. Timeline: weeks to months.

**KP showing wrong entity**: Claim panel -> strengthen disambiguation signals -> add qualifiers -> build unique entity signals. Timeline: 1-3 months.
