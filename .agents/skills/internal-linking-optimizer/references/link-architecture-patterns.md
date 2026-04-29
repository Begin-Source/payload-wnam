# Link Architecture Patterns

Architecture models with implementation guides and measurement frameworks for internal linking optimization.

## 1. Hub-and-Spoke (Topic Cluster) Model

```
                    Homepage
                       |
         +-------------+-------------+
         |             |             |
      Hub A         Hub B         Hub C
     (Pillar)      (Pillar)      (Pillar)
     /  |  \          |          /  |  \
   A1  A2  A3      B1  B2     C1  C2  C3
    +---+---+               +---+---+
     cross-links             cross-links
```

### Implementation Steps

1. Identify 3-7 core topics defining your business expertise
2. Create pillar pages (2,000-5,000 words) broadly covering each topic
3. Map cluster articles (800-2,000 words) for each subtopic
4. Implement bidirectional links: every cluster links to pillar, every pillar links to all clusters
5. Add cross-links between related clusters within same hub
6. Add bridge links between hubs where subtopics overlap

### Link Rules

| Link Type | Direction | Anchor Text Strategy |
|-----------|-----------|---------------------|
| Pillar -> Cluster | Pillar links to each cluster | "learn about [subtopic]" |
| Cluster -> Pillar | Every cluster links back | "our complete [topic] guide" |
| Cluster <-> Cluster | Between related clusters in same hub | "as we covered in [related article]" |
| Hub <-> Hub (bridge) | Between related pillars | "see also our [topic] resource" |

**When to Use**: Content marketing sites, SaaS, publishers, 50-500 content pages.

### Measurement

| Metric | Target |
|--------|--------|
| Pillar rankings for head terms | Top 10 |
| Cluster rankings for long-tail | Top 20 |
| Internal links per cluster | 3-5 minimum |
| Click depth homepage to cluster | <=3 clicks |

---

## 2. Silo Structure

```
                    Homepage
                       |
         +-------------+-------------+
         |             |             |
      Silo A        Silo B        Silo C
      Category      Category      Category
         |             |             |
      Sub-cat       Sub-cat       Sub-cat
         |             |             |
       Pages         Pages         Pages

    No horizontal links between silos (strict model)
```

### Implementation Steps

1. Define 5-15 top-level categories (silos) based on taxonomy
2. Create category landing pages with overview content
3. Build subcategory pages linking down to individual pages
4. Enforce vertical linking: pages link up to parent, down to children
5. Use breadcrumbs to reinforce hierarchy
6. Limit cross-silo links (strict) or allow strategically (modified)

### Link Rules

| Link Type | Direction | Allowed? |
|-----------|-----------|----------|
| Parent -> Child | Downward within silo | Always |
| Child -> Parent | Upward within silo | Always |
| Sibling <-> Sibling | Horizontal within same parent | Yes |
| Cross-silo | Between different silos | Strict: No. Modified: Sparingly |

**When to Use**: Large e-commerce (100+ categories), directory sites, distinct topic categories, separate business lines.

---

## 3. Flat Architecture

```
              Homepage
                 |
    +---+---+---+---+---+---+
   P1  P2  P3  P4  P5  P6  P7
    +---+---+---+---+---+---+
         (cross-linked freely)
```

### Implementation Steps

1. Link all key pages from homepage
2. Keep URL structure shallow: /category/page
3. Cross-link freely between related pages
4. Use comprehensive navigation menus or HTML sitemaps

| Site Size | Feasibility |
|-----------|-------------|
| <50 pages | Ideal |
| 50-100 pages | Manageable |
| 100-500 pages | Difficult; consider hub-and-spoke |
| 500+ pages | Not recommended |

---

## 4. Pyramid Architecture

```
Level 0:              Homepage
                      /      \
Level 1:        Category A    Category B
                /    \          /    \
Level 2:    Sub A1   Sub A2  Sub B1  Sub B2
            / \      / \      / \     / \
Level 3:  P1  P2   P3  P4   P5  P6  P7  P8
```

### Implementation Steps

1. Design clear hierarchy with 3-4 levels maximum
2. Homepage links to all top-level categories
3. Category pages link to all subcategories
4. Subcategory pages link to all child pages
5. Implement breadcrumbs
6. Add "related content" cross-links at page level

**When to Use**: News/media sites, large blogs (500+ posts), corporate sites, government/educational sites.

---

## 5. Mesh/Matrix Architecture

```
    P1 <--> P2 <--> P3
    |   \   |   /   |
    P4 <--> P5 <--> P6
    |   /   |   \   |
    P7 <--> P8 <--> P9
```

### Implementation Steps

1. Set linking rules: link only when topically relevant
2. Use contextual anchors describing destination
3. Set link budget: 5-15 contextual links per 1,000 words
4. Review link density quarterly to prune irrelevant connections
5. Maintain a link map to track the network

### Governance Rules

| Rule | Purpose |
|------|---------|
| Every link must have topical relevance | Prevents link dilution |
| Max 15 contextual links per 1,000 words | Prevents link farms |
| Review links quarterly | Prunes outdated connections |
| Descriptive anchor text only | Maintains semantic value |

**When to Use**: Knowledge bases, wikis, research repositories, FAQ/help centers.

---

## Migration Between Models

| From | To | Difficulty |
|------|----|-----------|
| Flat -> Hub-and-Spoke | Site grew beyond 100 pages | Medium |
| Silo -> Hub-and-Spoke | Silos too rigid | Medium |
| Pyramid -> Hub-and-Spoke | Want topical clusters | High |
| No structure -> Any model | Starting disorganized | High |

### Migration Steps

1. Audit current state: map all existing internal links
2. Design target architecture: map pages to new positions
3. Create link change plan: document every link change
4. Implement in phases: start with highest-priority cluster/silo
5. Preserve existing equity: don't remove valuable links without replacement
6. Monitor impact: track rankings/traffic for 4-8 weeks per phase
7. Iterate based on measured results

---

## Measurement Framework

### Key Metrics by Model

| Metric | Hub-Spoke | Silo | Flat | Pyramid | Mesh |
|--------|-----------|------|------|---------|------|
| Avg click depth | <=3 | <=4 | <=2 | <=4 | <=3 |
| Orphan pages | 0 | 0 | 0 | 0 | 0 |
| Avg internal links/page | 5-10 | 3-7 | 8-15 | 3-5 | 8-15 |
| Cross-section links | Many | Few | N/A | Some | Many |

### Monthly Monitoring Checklist

| Check | Action if Failing |
|-------|-------------------|
| Orphan pages count | Add internal links immediately |
| Average click depth | Add shortcuts to deep pages |
| Internal link count per page | Add links to under-linked pages |
| Anchor text diversity | Vary anchors for over-optimized pages |
| Broken internal links | Fix or remove |
| New content linked within 48 hours | Add to related pages upon publishing |

---

## Hybrid: Hub-and-Spoke + Silo (Recommended for Medium-Large Sites)

```
Homepage
  +-- Category Silo A
  |     +-- Hub A1 (pillar) <-> Cluster articles
  |     +-- Hub A2 (pillar) <-> Cluster articles
  +-- Category Silo B
  |     +-- Hub B1 (pillar) <-> Cluster articles
  +-- Cross-category bridge links where relevant
```

### Implementation Priority Order

1. Fix structural issues first (orphan pages, broken links)
2. Implement primary architecture model
3. Add cross-linking strategy
4. Optimize anchor text
5. Monitor and iterate
