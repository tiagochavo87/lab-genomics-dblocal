/**
 * Validação da biblioteca estatística contra valores de referência gerados
 * com scipy 1.17 / statsmodels 0.15 (e enumerações exatas independentes em
 * Python para Fisher 2×k e Hardy-Weinberg). Ver stats-reference.json.
 */
import { describe as d, it, expect } from "vitest";
import ref from "./stats-reference.json";
import { chiSquareSurvival, fSurvival, normalQuantile, tTwoSided } from "@/lib/stats/distributions";
import {
  chiSquareTable, describe, fisherExact2xK, hardyWeinberg, kruskalWallis, logisticRegression,
  mannWhitney, oddsRatio, oneWayAnova, welchT,
} from "@/lib/stats/tests";
import { associationForSnp } from "@/lib/stats/association";
import { parseGenotype } from "@/lib/stats/genotype";

const close = (a: number, b: number, rel = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

d("distribuições", () => {
  it("qui-quadrado, t, F e normal", () => {
    [[3.84, 1], [10.5, 2], [0.2, 3], [55.0, 4], [120.3, 10]].forEach(([x, df], i) => close(chiSquareSurvival(x, df), ref.chi2sf[i], 1e-9));
    [[2.1, 5], [-0.7, 30.5], [4.2, 12], [1.96, 1000]].forEach(([t, df], i) => close(tTwoSided(t, df), ref.tsf[i], 1e-9));
    [[3.2, 2, 27], [0.5, 3, 100], [10.1, 1, 8]].forEach(([f, a, b], i) => close(fSurvival(f, a, b), ref.fsf[i], 1e-9));
    close(normalQuantile(0.975), ref.normq, 1e-12);
  });
});

d("tabelas", () => {
  it("qui-quadrado r×c", () => {
    const r = chiSquareTable([[20, 35, 15], [30, 25, 5]]);
    close(r.statistic, ref.chi2_t2[0]);
    close(r.p, ref.chi2_t2[1]);
    expect(r.df).toBe(ref.chi2_t2[2]);
  });
  it("Fisher exato 2×2 e 2×3 (Freeman-Halton)", () => {
    close(fisherExact2xK([[12, 5], [3, 9]]), ref.fisher_t1_enum, 1e-9);
    close(fisherExact2xK([[3, 1, 0], [1, 4, 6]]), ref.fisher_t3, 1e-9);
    close(fisherExact2xK([[20, 35, 15], [30, 25, 5]]), ref.fisher_t2, 1e-9);
  });
  it("OR de Woolf", () => {
    const o = oddsRatio(12, 5, 3, 9);
    close(o.or, ref.or_t1[0]); close(o.lower, ref.or_t1[1]); close(o.upper, ref.or_t1[2]);
  });
});

d("grupos", () => {
  const { x, y, z } = ref as unknown as { x: number[]; y: number[]; z: number[] };
  it("Mann-Whitney, Kruskal-Wallis, Welch, ANOVA e descritivas", () => {
    const mw = mannWhitney(x, y);
    close(mw.statistic, ref.mw[0]); close(mw.p, ref.mw[1], 1e-8);
    const kw = kruskalWallis([x, y, z]);
    close(kw.statistic, ref.kw[0]); close(kw.p, ref.kw[1], 1e-8);
    const wt = welchT(x, y);
    close(wt.statistic, ref.welch[0]); close(wt.p, ref.welch[1], 1e-8);
    const an = oneWayAnova([x, y, z]);
    close(an.statistic, ref.anova[0]); close(an.p, ref.anova[1], 1e-8);
    const ds = describe(x);
    close(ds.q1, ref.quant[0]); close(ds.median, ref.quant[1]); close(ds.q3, ref.quant[2]); close(ds.sd, ref.quant[3]);
  });
});

d("Hardy-Weinberg", () => {
  it("qui-quadrado e exato (Wigginton)", () => {
    for (const h of ref.hwe) {
      const r = hardyWeinberg(h.g[0], h.g[1], h.g[2]);
      close(r.chi2, h.chi2); close(r.pChi2, h.p_chi2, 1e-8); close(r.pExact, h.p_exact, 1e-8);
    }
  });
});

d("regressão logística", () => {
  it("bate com statsmodels Logit", () => {
    const L = ref.logit_data;
    const X = L.y.map((_, i) => [L.dose[i], L.age[i], L.sex[i]]);
    const r = logisticRegression(X, L.y, ["dose", "idade", "sexo"]);
    expect(r.converged).toBe(true);
    r.terms.forEach((t, i) => {
      close(t.beta, ref.logit.params[i + 1], 1e-6);
      close(t.se, ref.logit.bse[i + 1], 1e-6);
      close(t.p, ref.logit.p[i + 1], 1e-6);
      close(Math.log(t.lower), ref.logit.ci[i + 1][0], 1e-6);
      close(Math.log(t.upper), ref.logit.ci[i + 1][1], 1e-6);
    });
    close(r.logLik, ref.logit.llf, 1e-9); close(r.logLikNull, ref.logit.llnull, 1e-9);
    close(r.lrP, ref.logit.llr_p, 1e-6); close(r.aic, ref.logit.aic, 1e-9); close(r.mcFaddenR2, ref.logit.prsq, 1e-9);
  });
});

d("genótipos e associação", () => {
  it("lê formatos comuns de genótipo", () => {
    expect(parseGenotype("AG")).toEqual(["A", "G"]);
    expect(parseGenotype("g/a")).toEqual(["A", "G"]);
    expect(parseGenotype("C|T")).toEqual(["C", "T"]);
    expect(parseGenotype("1/2")).toEqual(["1", "2"]);
    expect(parseGenotype("-9")).toBeNull();
    expect(parseGenotype("NA")).toBeNull();
    expect(parseGenotype("")).toBeNull();
  });
  it("associação caso-controle: contagens, ORs e log-aditivo coerentes com a regressão", () => {
    const L = ref.logit_data;
    const code = ["CC", "CT", "TT"];
    const rows = L.y.map((yy, i) => ({ snp: code[L.dose[i]], grupo: yy ? "Caso" : "Controle", idade: L.age[i], sexo: L.sex[i] ? "M" : "F" }));
    const res = associationForSnp({ rows, snpColumn: "snp", groupColumn: "grupo", caseValue: "Caso", controlValue: "Controle", refAllele: "C" });
    expect(res.snp.ref).toBe("C");
    expect(res.nCases + res.nControls).toBe(L.y.length);
    const la = res.models.find((m) => m.model === "log-aditivo")!;
    const direct = logisticRegression(L.dose.map((x) => [x]), L.y, ["dose"]);
    close(la.ors[0].or, direct.terms[0].or, 1e-9);
    close(la.pLogistic, direct.terms[0].p, 1e-9);
    const adj = associationForSnp({ rows, snpColumn: "snp", groupColumn: "grupo", caseValue: "Caso", controlValue: "Controle", refAllele: "C", covariates: ["idade", "sexo"] });
    const laAdj = adj.models.find((m) => m.model === "log-aditivo")!;
    close(Math.log(laAdj.ors[0].or), ref.logit.params[1], 1e-6);
    close(laAdj.pLogistic, ref.logit.p[1], 1e-6);
    const dom = res.models.find((m) => m.model === "dominante")!;
    const [c0, c1] = dom.cases; const [k0, k1] = dom.controls;
    close(dom.ors[0].or, (c1 * k0) / (k1 * c0), 1e-12);
  });
});

d("conversão para MLOCUS (LD a partir de tabela)", () => {
  it("codifica 1 = alelo mais frequente, 2 = o outro, -9 faltante e roda o LD", async () => {
    const { toMlocus } = await import("@/lib/stats/genotype");
    const { runLDAnalysis } = await import("@/lib/ldAnalysis");
    const rows = [
      { Amostra: "P1", snpA: "AA", snpB: "C/C", snpC: "AT" },
      { Amostra: "P2", snpA: "AG", snpB: "CT", snpC: "AT" },
      { Amostra: "P3", snpA: "GG", snpB: "TT", snpC: "" },
      { Amostra: "P4", snpA: "AA", snpB: "CC", snpC: "AG" },
      { Amostra: "P5", snpA: "AA", snpB: "CC", snpC: "TT" },
      { Amostra: "P6", snpA: "NA", snpB: "CT", snpC: "AA" },
    ];
    const conv = toMlocus(rows, "Amostra", ["snpA", "snpB", "snpC"]);
    const lines = conv.text.split("\n");
    expect(lines[0]).toBe("ID\tsnpA_1\tsnpA_2\tsnpB_1\tsnpB_2");
    expect(lines[1]).toBe("P1\t1\t1\t1\t1");
    expect(lines[2]).toBe("P2\t1\t2\t1\t2");
    expect(lines[3]).toBe("P3\t2\t2\t2\t2");
    expect(lines[6]).toBe("P6\t-9\t-9\t1\t2");
    expect(conv.legend.find((l) => l.snp === "snpC")?.biallelic).toBe(false);
    expect(conv.legend[0]).toMatchObject({ allele1: "A", allele2: "G" });
    const res = runLDAnalysis(conv.text);
    expect(res.summary.nLoci).toBe(2);
    expect(res.ldDetails[0].dPrime).toBeCloseTo(1, 6);
  });
});

d("classificação automática de colunas", () => {
  it("reconhece genótipo, numérica, categórica e identificador; N/A é faltante", async () => {
    const { columnKind, uniqueValues } = await import("@/components/analysis/controls");
    const rows = Array.from({ length: 30 }, (_, i) => ({
      id: `S${i + 1}`,
      snp: ["AA", "AG", "GG"][i % 3],
      tempo: `${10 + i} anos`,
      idade: 20 + i,
      nefrite: i % 5 === 0 ? "N/A" : i % 2 ? "Sim" : "Não",
    }));
    expect(columnKind(rows, "snp")).toBe("genotipo");
    expect(columnKind(rows, "tempo")).not.toBe("genotipo");
    expect(columnKind(rows, "idade")).toBe("numerica");
    expect(columnKind(rows, "nefrite")).toBe("categorica");
    expect(columnKind(rows, "id")).toBe("identificador");
    expect(uniqueValues(rows, "nefrite").sort()).toEqual(["Não", "Sim"]);
  });
});
