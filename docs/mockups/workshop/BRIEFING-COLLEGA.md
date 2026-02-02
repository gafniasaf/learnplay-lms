# Briefing: Expert-SAM Workshop

**Voor:** Collega die meehelpt met de workshop  
**Leestijd:** 5-7 minuten  
**Datum workshop:** [invullen]

---

## Wat is dit voor workshop?

We geven een workshop van 60 minuten aan MBO-docenten Verpleegkunde en Verzorgende IG (VIG). Het doel is om hen te laten zien hoe ze met behulp van AI (Expert-SAM) sneller een lesplan kunnen maken dat aansluit bij het nieuwe curriculum (KD 2026).

**Belangrijk:** De deelnemers zijn AI-beginners. Ze hebben misschien ChatGPT geprobeerd, maar weten niet hoe ze het effectief kunnen gebruiken voor hun werk.

---

## Wat is Expert-SAM?

Expert-SAM is een AI-assistent die we hebben gebouwd specifiek voor MBO-docenten. Het is **geen ChatGPT** — het is een eigen systeem dat:

- Getraind is op het KD 2026 (het nieuwe curriculum)
- Nederlands spreekt met een informele, collegiale toon
- Lesplannen kan genereren op basis van een korte instructie
- Eerlijk zegt als het iets niet weet

**Hoe het werkt:**
1. Docent typt een vraag/instructie (bijv. "Maak een lesplan over SBAR-communicatie")
2. SAM genereert binnen 10-15 seconden een volledig lesplan
3. Docent past het aan waar nodig

**SAM is een startpunt, geen eindproduct.** De docent blijft de expert die het resultaat beoordeelt en aanpast.

---

## Wat is het KD 2026?

KD staat voor **Kwalificatiedossier**. Dit is het officiële document dat beschrijft wat een student moet kunnen aan het eind van een MBO-opleiding. Het is vergelijkbaar met een curriculum of leerplan, maar dan landelijk vastgesteld.

### Structuur van het KD

```
Kwalificatiedossier
└── Kerntaken (K) — Grote werkgebieden
    └── Werkprocessen (W) — Specifieke taken binnen een kerntaak
        └── Gedragsindicatoren — Concreet gedrag dat de student moet tonen
```

### Voorbeeld voor Verpleegkunde niveau 4:

| Code | Betekenis |
|------|-----------|
| **B1** | Basisdeel (verplicht voor iedereen) |
| **K1** | Kerntaak 1: Bieden van zorg en ondersteuning |
| **W2** | Werkproces 2: Stelt het zorgplan op en/of bij |

Dus **B1-K1-W2** betekent:
> "Basisdeel, Kerntaak 1 (Zorg bieden), Werkproces 2 (Zorgplan opstellen)"

### De 5 subdomeinen in de workshop

We focussen op deze vijf, omdat ze vaak voorkomen in de praktijk:

| Code | Kort gezegd | Typische les |
|------|-------------|--------------|
| B1-K1-W2 | Zorgplan maken/aanpassen | Casus: cliënt verandert, plan moet mee |
| B1-K1-W3 | Zorghandelingen uitvoeren | Praktijk: bloeddruk meten, wond verzorgen |
| B1-K1-W5 | Handelen bij nood | Simulatie: wat doe je bij een allergische reactie? |
| B1-K2-W2 | Samenwerken met anderen | Rollenspel: bellen met de arts (SBAR) |
| B1-K3-W2 | Reflecteren | Reflectieopdracht na stage-incident |

---

## Wat is SBAR?

SBAR komt meerdere keren terug in de workshop. Het is een communicatiemethode in de zorg:

| Letter | Betekenis | Wat zeg je? |
|--------|-----------|-------------|
| **S** | Situatie | "Ik bel over mevrouw Jansen op kamer 12" |
| **B** | Background | "Ze heeft diabetes en is gisteren opgenomen" |
| **A** | Assessment | "Haar bloedsuiker is nu 2.8, ze is verward" |
| **R** | Recommendation | "Ik denk dat ze glucose nodig heeft, kunt u komen?" |

Studenten leren dit om gestructureerd te communiceren met artsen/collega's, zodat ze niets vergeten en duidelijk overkomen.

---

## Hoe verloopt de workshop?

| Tijd | Wat gebeurt er | Jouw rol |
|------|----------------|----------|
| 0-10 min | Introductie + probleem schetsen | Meeluisteren |
| 10-15 min | Subdomeinen kiezen (handopsteken) | Tellen wie wat kiest |
| 15-20 min | Goede vs slechte prompt uitleggen | Meeluisteren |
| 20-30 min | **Live demo** (pre-rendered) | Eventueel techniek ondersteunen |
| 30-37 min | KD-check + discussie | Deelnemers aanmoedigen te reageren |
| 37-40 min | Takeaways | Meeluisteren |
| 40-60 min | **Vragen & discussie** | Vragen verzamelen, doorspelen |

---

## Veelgestelde vragen (en antwoorden)

### "Is dit ChatGPT?"
> "Nee, Expert-SAM is een eigen systeem dat specifiek is gebouwd voor MBO-docenten. Het kent het KD 2026 en spreekt Nederlands. ChatGPT is algemeen en kent het KD niet."

### "Vervangt dit mijn werk?"
> "Nee, SAM geeft je een startpunt. Jij blijft de expert die beoordeelt of het klopt en het aanpast aan jouw studenten. Het scheelt je het blanco-vel-syndroom."

### "Hoe weet SAM wat goed is?"
> "SAM is getraind op het KD 2026 en lesmateriaal. Het combineert jouw instructie met die kennis. Maar het is niet perfect — daarom check je altijd zelf."

### "Wat als SAM iets fouts zegt?"
> "SAM is eerlijk: als het iets niet weet, zegt het dat. En jij bent de eindredacteur — je past aan wat niet klopt."

### "Kan ik dit thuis ook gebruiken?"
> "Ja, Expert-SAM is beschikbaar via [URL]. Na de workshop kun je zelf experimenteren."

### "Werkt dit ook voor andere opleidingen?"
> "Op dit moment is SAM getraind op VIG en Verpleegkunde niveau 3-4. Andere opleidingen volgen later."

---

## Technische dingen om te weten

### De presentatie
- Is een HTML-bestand, geen PowerPoint
- Opent in de browser (Chrome/Edge/Firefox)
- Navigatie: pijltjestoetsen, spatiebalk, of klikken
- `F` voor fullscreen

### De demo
- De "live demo" is **pre-rendered** — we laten een vooraf gegenereerd lesplan zien
- Dit voorkomt dat we afhankelijk zijn van wifi/API
- Als iemand vraagt "kun je ook X proberen?" → "Goed idee, dat doen we na de sessie"

### Als de techniek faalt
- Presentatie werkt offline (het is een HTML-bestand)
- Geen internet nodig tijdens de workshop
- Backup: de slides staan ook als tekst in de briefing

---

## Jouw rol samengevat

1. **Bij de stemming (slide 5):** Tel handen, roep het winnende subdomein
2. **Bij de demo:** Let op of het scherm zichtbaar is, geluid werkt
3. **Bij discussie:** Moedig stille deelnemers aan, verzamel vragen
4. **Algemeen:** Vang vragen op die je niet kunt beantwoorden → "Goede vraag, die pakken we zo"

---

## Belangrijke termen (spiekbriefje)

| Term | Betekenis |
|------|-----------|
| **KD** | Kwalificatiedossier — het curriculum |
| **KD 2026** | De nieuwe versie van het curriculum |
| **Kerntaak** | Groot werkgebied (bijv. "Zorg bieden") |
| **Werkproces** | Specifieke taak binnen een kerntaak |
| **SBAR** | Communicatiemethode: Situatie-Background-Assessment-Recommendation |
| **VIG** | Verzorgende IG (niveau 3) |
| **Verpleegkunde** | Niveau 4 opleiding |
| **BPV** | Beroepspraktijkvorming — stage |
| **Prompt** | De instructie/vraag die je aan de AI geeft |
| **Expert-SAM** | Onze AI-assistent voor docenten |

---

## Contact tijdens de workshop

Als je iets niet weet of er gaat iets mis:
- Fluister naar mij of stuur een appje
- Zeg tegen de deelnemers: "Goede vraag, even checken" → geef door aan mij

---

**Vragen vooraf?** Laat het me weten, dan bespreken we het voor de workshop begint.
