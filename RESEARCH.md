# Problem research — why DrawFix AI exists

Compiled 2026-11-18 from public web sources. Every claim carries a confidence tag:
**[confirmed]** several independent sources agree; **[single-source]** one outlet or one report;
**[unverified]** repeated by secondary sources, original document not found.
Anything not found is listed under "Open questions", not guessed.

## 1. The problem in one paragraph

Deadly building fires in Bangladesh keep repeating the same plan-level failures: a single stair where two
are required, no protected exit, exit doors locked or blocked. Rules exist (BNBC), but checking a drawing
against them depends on overstretched people in several agencies, and the body meant to enforce the
current code has reportedly not been set up. DrawFix AI measures escape routes on a DXF plan and checks
them against the code, so a reviewer starts from evidence instead of a blank sheet.

## 2. How big is the fire problem

| Fact | Source | Confidence |
|---|---|---|
| 2024: 26,659 fires, 140 deaths, 341 injuries (about 73 fires/day) | [TBS](https://www.tbsnews.net/bangladesh/country-witnesses-26659-fire-incidents-140-deaths-2024-fscd-1054826), [UNB](https://unb.com.bd/category/Bangladesh/140-people-die-in-fire-incidents-in-2024-fscd/152199) | confirmed (FSCD figures) |
| 2025: about 27,059 fires, 85 deaths (FSCD), 88 in one TBS analysis | [bdnews24](https://bdnews24.com/bangladesh/c224c27c2bb9), [Financial Express](https://thefinancialexpress.com.bd/national/over-27000-fire-incidents-recorded-in-bangladesh-in-2025) | confirmed, death count differs by source |
| Top causes: electrical faults (~34%), discarded cigarettes/bidi (~16%), stoves (~11%) | [TBS](https://www.tbsnews.net/infograph/numbers/what-caused-most-fire-outbreaks-bangladesh-2025-1536716) | confirmed |
| Most deaths and injuries in houses/residential buildings, gas cylinders, restaurants | UNB, bdnews24 above | confirmed |

**What this means for the product:** most fires start from ignition causes (wiring, cigarettes, stoves) that
a floor-plan check cannot see. DrawFix addresses the part of the harm that depends on **whether people can
get out**, not how fires start. Pitch it that way; do not claim it reduces fires.

## 3. Case evidence: the failures are plan-level and repeat

| Incident | What failed | Source | Confidence |
|---|---|---|---|
| **Bailey Road, Dhaka, 29 Feb 2024**, 46 dead | No fire exits; one staircase where buildings over five floors need two; stairs blocked by gas cylinders; no approval for commercial use; insufficient firefighting water. Fire Service blamed the owner; RAJUK's own probe blamed owner, city corporation and Fire Service; critics said RAJUK was the most negligent. | [Daily Star](https://www.thedailystar.net/node/3581596), [Prothom Alo](https://en.prothomalo.com/bangladesh/weuggu1j8f), [BenarNews](https://www.benarnews.org/english/news/bengali/no-fire-exits-in-shopping-mall-where-dozens-died-in-huge-fire-03012024153137.html) | confirmed |
| **Mirpur garment/chemical warehouse, 14 Oct 2025**, 16 dead | Roof exit door found padlocked; toxic gas; warehouse ran an illegal chemical trade with no licence; garment unit lacked required fire clearance. | [TBS](https://www.tbsnews.net/bangladesh/locked-roof-door-toxic-gas-caused-most-deaths-mirpur-fire-fire-service-1260761), [Dhaka Tribune](https://www.dhakatribune.com/bangladesh/393951/death-toll-rise-to-16-in-mirpur-garment-factory), [Daily Star](https://www.thedailystar.net/news/bangladesh/accidents-fires/news/mirpur-factory-fire-warehouse-owner-ran-illegal-chemical-trade) | confirmed |
| **Tazreen, 2012**, at least 112 dead | Workers trapped between locked exits and barred windows. | [Clean Clothes Campaign](https://cleanclothes.org/news/2018/tazreen-fashions-6-years) | confirmed |
| H&M supplier factories, 2015 analysis | About 61% lacked exits meeting Accord standards (enclosed stairwells, fire-rated doors). | [Quartz](https://qz.com/516038/report-most-of-hms-best-factories-in-bangladesh-still-dont-have-working-fire-exits) | single-source, 2015 data |

**Limit that matters:** in Bailey Road and Mirpur the building was used differently from what was approved
(unapproved commercial use, illegal chemical storage) and exits were locked **in operation**. A drawing check
cannot see use changes or padlocks. DrawFix only catches what is on the drawing or what a reviewer ticks in
the Review step (Exit / Locked per door). Say this on stage before a judge says it for you.

## 4. Why checking is hard today (enforcement gap)

| Fact | Source | Confidence |
|---|---|---|
| BNBC 2020 was gazetted, but the Bangladesh Building Regulatory Authority (BBRA) meant to enforce it had not been set up (article is "five years after" gazette; exact date not shown) | [Daily Star](https://www.thedailystar.net/news/bangladesh/news/revised-building-code-no-dedicated-body-yet-enforce-3253936) | single-source, check current status |
| Responsibility is split across RAJUK, city corporations and the Fire Service with no single accountable body | [Dhaka Tribune op-ed](https://www.dhakatribune.com/opinion/op-ed/421978/no-exit-why-bangladesh-s-cities-keep-burning) | single-source (opinion) |
| About 66% of Dhaka buildings violate the code (parliamentary disclosure, quoted in an op-ed) | same op-ed | **unverified** |
| "Over 60%" non-compliant (UN-Habitat, 2022) and "only 40% of new buildings fully comply with BNBC 2012" (MoHPW survey), both from a consultancy site | [Starpath](https://starpathholdings.com/construction-compliance-bangladesh/) | **unverified** |
| RAJUK once said 95% of structures in the capital were built without approval | [Daily Star](https://thedailystar.net/node/1808119) | single-source, older |
| FSCD: about 480 stations, about 13,000 staff, "major manpower shortage" (older report) | [TBS](https://www.tbsnews.net/node/478830), [Daily Star](https://www.thedailystar.net/opinion/editorial/news/time-equip-fire-service-properly-3308026) | single-source, dated |
| FSCD inspected 10,533 buildings in 2025; one outlet says 37.39% had deficiencies | [Observer](https://observerbd.com/news/587799) | **unverified** |

## 5. The approval workflow (where a tool would sit)

- RAJUK runs an online permit system (ECPS). Reported: 10,985 online planning and construction permit
  applications in seven months, 7,993 approved ([Financial Express](https://thefinancialexpress.com.bd/national/rajuk-gets-11000-applications-in-7-months-after-digitising-approval-process)).
  Applications with errors or missing documents are returned through the system ([Daily Star](https://www.thedailystar.net/city/news/rajuks-building-construction-approval-goes-online-1738060)).
- Stated deadlines conflict: 30 days for planning permits, 24 days to reach the Building Construction
  Committee, 45 days on ECPS's own page, 3 to 4 months overall on a consultancy blog. **[conflicting]**
- Some steps stay manual: site inspections during construction and no-objection certificates from other
  agencies; officials proposed a single-window platform ([Financial Express](https://thefinancialexpress.com.bd/national/rajuk-gets-11000-applications-in-7-months-after-digitising-approval-process)).
- One report says the permit system went offline after a hack. Its date is unclear. **[unverified]**
  ([Industry Insider](https://industryinsiderbd.com/rajuk-permit-system-offline-for-three-months-after-hack/))
- Drawing content is governed by the Dhaka Imarat Nirman Bidhimala 2008; a practitioner guide lists what
  sheets are expected ([Arch-Bangla](https://arch-bangla.com/rajuk-approval-drawing/)). Not an official source.

## 6. What already exists (and the gap)

| Tool | What it does | Limits found | Source |
|---|---|---|---|
| **Archistar AI PreCheck** (AU/US/CA, 30+ councils; City of Austin contract Oct 2024) | Automated zoning/code check on PDF, CAD or BIM; sold to councils and applicants | Pricing not public; rules are for those countries' codes | [Archistar](https://archistar.ai/), [Austin](https://www.austintexas.gov/node/96266) |
| **CORENET e-PlanCheck** (Singapore) | Government automated checker | Described as a black box; rules are procedural code only software experts can change | [AEC Bytes](https://mail.aecbytes.com/feature/2005/CORENETePlanCheck.html) |
| **Solibri Model Checker** | Rule templates on BIM models | Hard-coded templates; custom checks need Java; needs a BIM model | research literature, see [Preidel & Borrmann](https://itcon.org/papers/2016_25.content.01707.pdf) |
| LLM-based compliance research | Early-stage | Still needs manual reading and formalising of the code | [W78 2024 paper](https://itc.scix.net/pdfs/w78-2024-paper_73.pdf) |

**Gap DrawFix targets (hypothesis, not proven):** a checker built for **BNBC and Dhaka rules, in Bangla,
working from 2D DXF** rather than BIM, with every limit labelled by how far it can be trusted. No source
found says Bangladeshi architects submit DXF/DWG, or whether ECPS runs any automated drawing check. See
open questions.

## 7. Implications for the product (decisions this research supports)

1. **Keep the pitch on "can people get out", not "prevents fires".** Section 2 says ignition dominates.
2. **Keep the trust labels (verified / screening / drawing).** Section 4 shows citation errors would be
   costly in an environment where agencies already blame each other. Never show a screening limit as law.
3. **Lead with the repeated failure patterns from section 3:** second stair missing, locked exit, blocked
   stair. These match rules already in `rules.ts` (dual exit count, exit unobstructed).
4. **State the limit up front:** use changes and padlocks in operation are outside a drawing check.
5. **Buyer framing:** approval offices and the Fire Service are capacity-constrained (section 4); the tool
   is a triage aid that gives a reviewer a first pass, not a replacement for sign-off.
6. **Do not cite the 66% / 60% / 40% / 37.39% figures on stage** until the original documents are found.

## 8. Open questions (not answered by this research)

1. Do architects in Bangladesh submit DXF/DWG to RAJUK, or only PDF? Does ECPS do any automated check?
   Ask RAJUK, an architect, or read the ECPS user manual. Decides whether DXF input fits real workflow.
2. Current status of BBRA (the Daily Star article is undated here).
3. The primary documents behind the 66%, 60%, 40% and 37.39% figures.
4. Exact BNBC 2020 Part 4 Ch. 3 text: travel distance tables, exit width, exit count, capacity factors.
   Needed to move 12 screening rules to verified. Not found online in this pass.
5. Outcome of the High Court committee on Dhaka fire safety and the Mirpur prosecution.
6. Judging criteria for the congress track: a search found nothing about the event.
