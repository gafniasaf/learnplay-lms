/**
 * queryKD - MCP handler for KD 2026 queries
 * Provides structured access to KD data for e-Xpert SAM
 */

// Embedded KD 2026 data structure
const KD_2026 = {
  id: "kd-2026-vigvp",
  version: "2026",
  title: "Kwalificatiedossier Verzorging en verpleging",
  kwalificaties: [
    { code: "P1", naam: "Verzorgende IG", niveau: 3 },
    { code: "P2", naam: "Mbo-Verpleegkundige", niveau: 4 },
  ],
  basisdeel: {
    kerntaken: [
      {
        code: "B1-K1",
        titel: "Biedt zorg, ondersteuning en begeleiding",
        werkprocessen: [
          { code: "B1-K1-W1", titel: "Inventariseert de behoefte aan zorg en/of ondersteuning" },
          { code: "B1-K1-W2", titel: "Stelt het zorgplan op en/of bij" },
          { code: "B1-K1-W3", titel: "Voert zorginterventies en/of begeleidingsactiviteiten uit" },
          { code: "B1-K1-W4", titel: "Voert verpleegtechnische handelingen uit" },
          { code: "B1-K1-W5", titel: "Handelt in onvoorziene en/of acute situaties" },
          { code: "B1-K1-W6", titel: "Geeft informatie en advies over zorg en gezondheid" },
        ],
      },
      {
        code: "B1-K2",
        titel: "Stemt de zorg en ondersteuning af",
        werkprocessen: [
          { code: "B1-K2-W1", titel: "Stemt af met informele zorgverleners" },
          { code: "B1-K2-W2", titel: "Werkt samen met andere zorgprofessionals" },
        ],
      },
      {
        code: "B1-K3",
        titel: "Draagt bij aan kwaliteit van zorg",
        werkprocessen: [
          { code: "B1-K3-W1", titel: "Draagt bij aan het innoveren van zorg" },
          { code: "B1-K3-W2", titel: "Evalueert de werkzaamheden en ontwikkelt zichzelf als professional" },
          { code: "B1-K3-W3", titel: "Draagt bij aan een sociaal en fysiek veilige werkomgeving" },
        ],
      },
    ],
  },
  profieldeel: {
    P2: {
      code: "P2",
      naam: "Mbo-Verpleegkundige",
      niveau: 4,
      extra_kerntaken: [
        {
          code: "P2-K1",
          titel: "Organiseert en coördineert de zorgverlening",
          werkprocessen: [
            { code: "P2-K1-W1", titel: "Stelt een verpleegkundige diagnose" },
            { code: "P2-K1-W2", titel: "Coacht en begeleidt collega's" },
            { code: "P2-K1-W3", titel: "Coördineert en optimaliseert de zorgverlening" },
          ],
        },
      ],
      extra_vakkennis: [
        "brede en specialistische kennis van comorbiditeit",
        "brede en specialistische kennis van evidence based practice (EBP)",
        "kan klinisch redeneren toepassen",
        "kan verschillende begeleidingsstijlen toepassen",
        "kan korte, eenvoudige informatie of instructies geven in het Engels",
      ],
    },
  },
};

export type QueryKDInput = {
  query: "overlap" | "werkprocessen" | "kerntaak" | "combi" | "search" | "all";
  niveau?: 3 | 4;
  kerntaak?: string;
  searchTerm?: string;
};

export type Werkproces = {
  code: string;
  titel: string;
  kerntaak?: string;
};

export type KerntaakInfo = {
  code: string;
  titel: string;
  werkprocessen: Werkproces[];
  niveau: "basisdeel" | "profieldeel_n4";
};

export type CombiAnalyse = {
  basisdeel: {
    kerntaken: number;
    werkprocessen: number;
    gedeeld: boolean;
    details: Array<{ code: string; titel: string; wpCount: number }>;
  };
  alleenN4: {
    kerntaken: string[];
    werkprocessen: string[];
    details: Array<{ code: string; titel: string }>;
  };
  overlapPercentage: number;
  advies: string;
  samenvatting: string;
};

export type OverlapAnalyse = {
  n3: {
    kerntaken: number;
    werkprocessen: number;
    codes: string[];
  };
  n4: {
    kerntaken: number;
    werkprocessen: number;
    codes: string[];
  };
  gedeeld: {
    kerntaken: number;
    werkprocessen: number;
    codes: string[];
  };
  alleenN4: {
    kerntaken: number;
    werkprocessen: number;
    codes: string[];
  };
};

export type QueryKDResult = {
  query: string;
  combi?: CombiAnalyse;
  overlap?: OverlapAnalyse;
  werkprocessen?: Werkproces[];
  kerntaak?: KerntaakInfo;
  searchResults?: Array<{ type: string; code: string; titel: string; match: string }>;
  kdVersion: string;
};

function getAllBasisWerkprocessen(): Werkproces[] {
  const result: Werkproces[] = [];
  for (const kt of KD_2026.basisdeel.kerntaken) {
    for (const wp of kt.werkprocessen) {
      result.push({ code: wp.code, titel: wp.titel, kerntaak: kt.titel });
    }
  }
  return result;
}

function getN4ExtraWerkprocessen(): Werkproces[] {
  const result: Werkproces[] = [];
  for (const kt of KD_2026.profieldeel.P2.extra_kerntaken) {
    for (const wp of kt.werkprocessen) {
      result.push({ code: wp.code, titel: wp.titel, kerntaak: kt.titel });
    }
  }
  return result;
}

function computeCombiAnalyse(): CombiAnalyse {
  const basisKerntaken = KD_2026.basisdeel.kerntaken;
  const basisWpCount = basisKerntaken.reduce((sum, kt) => sum + kt.werkprocessen.length, 0);
  
  const n4Extra = KD_2026.profieldeel.P2.extra_kerntaken;
  const n4ExtraWpCount = n4Extra.reduce((sum, kt) => sum + kt.werkprocessen.length, 0);
  
  const totalWp = basisWpCount + n4ExtraWpCount;
  const overlapPct = Math.round((basisWpCount / totalWp) * 100);

  return {
    basisdeel: {
      kerntaken: basisKerntaken.length,
      werkprocessen: basisWpCount,
      gedeeld: true,
      details: basisKerntaken.map(kt => ({
        code: kt.code,
        titel: kt.titel,
        wpCount: kt.werkprocessen.length,
      })),
    },
    alleenN4: {
      kerntaken: n4Extra.map(kt => kt.code),
      werkprocessen: n4Extra.flatMap(kt => kt.werkprocessen.map(wp => wp.code)),
      details: n4Extra.flatMap(kt => kt.werkprocessen.map(wp => ({
        code: wp.code,
        titel: wp.titel,
      }))),
    },
    overlapPercentage: overlapPct,
    advies: `~${overlapPct}% van het curriculum kan klassikaal. Differentieer op P2-K1 thema's (klinisch redeneren, coachen, coördineren).`,
    samenvatting: [
      `BASISDEEL (N3 + N4 gedeeld): ${basisKerntaken.length} kerntaken, ${basisWpCount} werkprocessen`,
      `ALLEEN N4 (profieldeel): ${n4Extra.length} kerntaak, ${n4ExtraWpCount} werkprocessen`,
      `Overlap: ${overlapPct}% - praktisch: ~80% klassikaal mogelijk`,
    ].join("\n"),
  };
}

function computeOverlapAnalyse(): OverlapAnalyse {
  const basisWp = getAllBasisWerkprocessen();
  const n4ExtraWp = getN4ExtraWerkprocessen();
  
  const basisKtCount = KD_2026.basisdeel.kerntaken.length;
  const n4ExtraKtCount = KD_2026.profieldeel.P2.extra_kerntaken.length;

  return {
    n3: {
      kerntaken: basisKtCount,
      werkprocessen: basisWp.length,
      codes: basisWp.map(wp => wp.code),
    },
    n4: {
      kerntaken: basisKtCount + n4ExtraKtCount,
      werkprocessen: basisWp.length + n4ExtraWp.length,
      codes: [...basisWp.map(wp => wp.code), ...n4ExtraWp.map(wp => wp.code)],
    },
    gedeeld: {
      kerntaken: basisKtCount,
      werkprocessen: basisWp.length,
      codes: basisWp.map(wp => wp.code),
    },
    alleenN4: {
      kerntaken: n4ExtraKtCount,
      werkprocessen: n4ExtraWp.length,
      codes: n4ExtraWp.map(wp => wp.code),
    },
  };
}

function getWerkprocessenByNiveau(niveau?: 3 | 4): Werkproces[] {
  const basis = getAllBasisWerkprocessen();
  if (niveau === 3) return basis;
  if (niveau === 4) return [...basis, ...getN4ExtraWerkprocessen()];
  // Return all if no niveau specified
  return [...basis, ...getN4ExtraWerkprocessen()];
}

function getKerntaakInfo(code: string): KerntaakInfo | null {
  const upperCode = code.toUpperCase();
  
  // Search in basisdeel
  for (const kt of KD_2026.basisdeel.kerntaken) {
    if (kt.code.toUpperCase() === upperCode) {
      return {
        code: kt.code,
        titel: kt.titel,
        werkprocessen: kt.werkprocessen.map(wp => ({ code: wp.code, titel: wp.titel })),
        niveau: "basisdeel",
      };
    }
  }
  
  // Search in profieldeel N4
  for (const kt of KD_2026.profieldeel.P2.extra_kerntaken) {
    if (kt.code.toUpperCase() === upperCode) {
      return {
        code: kt.code,
        titel: kt.titel,
        werkprocessen: kt.werkprocessen.map(wp => ({ code: wp.code, titel: wp.titel })),
        niveau: "profieldeel_n4",
      };
    }
  }
  
  return null;
}

function searchKD(term: string): Array<{ type: string; code: string; titel: string; match: string }> {
  const results: Array<{ type: string; code: string; titel: string; match: string }> = [];
  const lowerTerm = term.toLowerCase();
  
  // Search kerntaken
  for (const kt of KD_2026.basisdeel.kerntaken) {
    if (kt.code.toLowerCase().includes(lowerTerm) || kt.titel.toLowerCase().includes(lowerTerm)) {
      results.push({ type: "kerntaak", code: kt.code, titel: kt.titel, match: "basisdeel" });
    }
    // Search werkprocessen
    for (const wp of kt.werkprocessen) {
      if (wp.code.toLowerCase().includes(lowerTerm) || wp.titel.toLowerCase().includes(lowerTerm)) {
        results.push({ type: "werkproces", code: wp.code, titel: wp.titel, match: kt.code });
      }
    }
  }
  
  // Search profieldeel
  for (const kt of KD_2026.profieldeel.P2.extra_kerntaken) {
    if (kt.code.toLowerCase().includes(lowerTerm) || kt.titel.toLowerCase().includes(lowerTerm)) {
      results.push({ type: "kerntaak", code: kt.code, titel: kt.titel, match: "profieldeel_n4" });
    }
    for (const wp of kt.werkprocessen) {
      if (wp.code.toLowerCase().includes(lowerTerm) || wp.titel.toLowerCase().includes(lowerTerm)) {
        results.push({ type: "werkproces", code: wp.code, titel: wp.titel, match: kt.code });
      }
    }
  }
  
  // Search extra vakkennis
  for (const vk of KD_2026.profieldeel.P2.extra_vakkennis) {
    if (vk.toLowerCase().includes(lowerTerm)) {
      results.push({ type: "vakkennis_n4", code: "P2", titel: vk, match: "profieldeel_n4" });
    }
  }
  
  return results;
}

export async function queryKD({ params }: { params: QueryKDInput }): Promise<QueryKDResult> {
  const { query, niveau, kerntaak, searchTerm } = params;

  const result: QueryKDResult = {
    query,
    kdVersion: KD_2026.version,
  };

  switch (query) {
    case "combi":
      result.combi = computeCombiAnalyse();
      break;

    case "overlap":
      result.overlap = computeOverlapAnalyse();
      break;

    case "werkprocessen":
      result.werkprocessen = getWerkprocessenByNiveau(niveau);
      break;

    case "kerntaak":
      if (kerntaak) {
        const info = getKerntaakInfo(kerntaak);
        if (info) {
          result.kerntaak = info;
        }
      }
      break;

    case "search":
      if (searchTerm) {
        result.searchResults = searchKD(searchTerm);
      }
      break;

    case "all":
      result.combi = computeCombiAnalyse();
      result.overlap = computeOverlapAnalyse();
      result.werkprocessen = getWerkprocessenByNiveau();
      break;

    default:
      // Default to combi analysis for unknown queries
      result.combi = computeCombiAnalyse();
  }

  return result;
}
