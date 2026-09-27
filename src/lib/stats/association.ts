/**
 * Associação genética caso-controle para SNPs bialélicos, nos modelos
 * codominante, dominante, recessivo, sobredominante e log-aditivo (mesma
 * organização do pacote SNPassoc do R). ORs brutos por tabela 2×2 (Woolf) e
 * log-aditivo por regressão logística; ajuste por covariáveis opcional.
 */
import { chiSquareSurvival } from "./distributions";
import { isMissingValue } from "./missing";
import { altDosage, encodeModel, GeneticModel, inspectSnp, SnpInfo } from "./genotype";
import {
  chiSquareTable, fisherExact2xK, hardyWeinberg, HweResult, logisticRegression, oddsRatio, OddsRatio,
} from "./tests";

export interface ModelRow {
  model: GeneticModel;
  comparison: string;
  /** Contagens [casos, controles] por categoria. */
  cases: number[];
  controls: number[];
  categories: string[];
  ors: Array<{ label: string; or: number; lower: number; upper: number; corrected?: boolean }>;
  pChi2: number;
  pFisher: number;
  pLogistic: number;
  adjusted: boolean;
}

export interface SnpAssociation {
  snp: SnpInfo;
  nCases: number;
  nControls: number;
  genotypeCases: [number, number, number];
  genotypeControls: [number, number, number];
  altFreqCases: number;
  altFreqControls: number;
  allelic: { or: OddsRatio; pChi2: number; pFisher: number };
  hweControls: HweResult;
  models: ModelRow[];
  warnings: string[];
}

export interface AssociationInput {
  rows: Record<string, unknown>[];
  snpColumn: string;
  groupColumn: string;
  caseValue: string;
  controlValue: string;
  covariates?: string[];
  refAllele?: string;
}

function toNumberOrNull(v: unknown): number | null {
  if (isMissingValue(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Prepara covariáveis: numéricas entram como estão; categóricas viram
 * variáveis indicadoras (referência = categoria mais frequente).
 */
export function buildCovariates(rows: Record<string, unknown>[], columns: string[]) {
  const specs = columns.map((col) => {
    const vals = rows.map((r) => r[col]).filter((v) => !isMissingValue(v));
    const numeric = vals.length > 0 && vals.every((v) => toNumberOrNull(v) !== null);
    if (numeric) return { col, numeric: true as const, levels: [] as string[], names: [col] };
    const freq = new Map<string, number>();
    for (const v of vals) freq.set(String(v), (freq.get(String(v)) || 0) + 1);
    const levels = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
    return { col, numeric: false as const, levels, names: levels.slice(1).map((l) => `${col}: ${l} vs ${levels[0]}`) };
  });
  const encode = (row: Record<string, unknown>): number[] | null => {
    const out: number[] = [];
    for (const s of specs) {
      const v = row[s.col];
      if (s.numeric) {
        const n = toNumberOrNull(v);
        if (n === null) return null;
        out.push(n);
      } else {
        if (isMissingValue(v)) return null;
        const sv = String(v);
        if (!s.levels.includes(sv)) return null;
        for (const l of s.levels.slice(1)) out.push(sv === l ? 1 : 0);
      }
    }
    return out;
  };
  return { names: specs.flatMap((s) => s.names), encode };
}

export function associationForSnp(input: AssociationInput): SnpAssociation {
  const { rows, snpColumn, groupColumn, caseValue, controlValue } = input;
  const covCols = input.covariates ?? [];
  const warnings: string[] = [];
  const inGroups = rows.filter((r) => {
    const g = String(r[groupColumn] ?? "");
    return g === caseValue || g === controlValue;
  });
  const snp = inspectSnp(inGroups, snpColumn, input.refAllele);
  if (!snp.biallelic) warnings.push(`O SNP ${snpColumn} não é bialélico (alelos encontrados: ${snp.alleles.join(", ") || "nenhum"}).`);
  if (snp.nUnparsed) warnings.push(`${snp.nUnparsed} valor(es) de ${snpColumn} não reconhecidos como genótipo foram ignorados.`);

  const cov = buildCovariates(inGroups, covCols);
  const records: Array<{ dose: number; y: number; cov: number[] }> = [];
  for (const r of inGroups) {
    const dose = altDosage(r[snpColumn], snp);
    if (dose === null) continue;
    const c = cov.encode(r);
    if (c === null) continue;
    records.push({ dose, y: String(r[groupColumn]) === caseValue ? 1 : 0, cov: c });
  }

  const gc: [number, number, number] = [0, 0, 0];
  const gk: [number, number, number] = [0, 0, 0];
  for (const rec of records) (rec.y ? gc : gk)[rec.dose]++;
  const nCases = gc[0] + gc[1] + gc[2];
  const nControls = gk[0] + gk[1] + gk[2];
  const altCases = gc[1] + 2 * gc[2];
  const altControls = gk[1] + 2 * gk[2];

  // Alélico: [alt, ref] × [caso, controle]
  const alleleTable = [[altCases, altControls], [2 * nCases - altCases, 2 * nControls - altControls]];
  const allelic = {
    or: oddsRatio(altCases, altControls, 2 * nCases - altCases, 2 * nControls - altControls),
    pChi2: chiSquareTable(alleleTable).p,
    pFisher: fisherExact2xK([[altCases, 2 * nCases - altCases], [altControls, 2 * nControls - altControls]]),
  };

  const adjusted = covCols.length > 0;
  const fitLogistic = (model: GeneticModel) => {
    const X: number[][] = [];
    const y: number[] = [];
    let names: string[] = [];
    for (const rec of records) {
      const enc = encodeModel(rec.dose, model, snp);
      names = [...enc.names, ...cov.names];
      X.push([...enc.values, ...rec.cov]);
      y.push(rec.y);
    }
    if (!X.length || nCases === 0 || nControls === 0) return null;
    return logisticRegression(X, y, names);
  };

  const [rr, ra, aa] = snp.labels;
  const models: ModelRow[] = [];
  const mk = (model: GeneticModel, categories: string[], cases: number[], controls: number[]): ModelRow => {
    const table = [cases, controls];
    const logit = fitLogistic(model);
    const nSnpTerms = model === "codominante" ? 2 : 1;
    let ors: ModelRow["ors"];
    let pLog = NaN;
    if (adjusted || model === "log-aditivo") {
      ors = logit ? logit.terms.slice(0, nSnpTerms).map((t) => ({ label: t.name.split(": ")[1] ?? t.name, or: t.or, lower: t.lower, upper: t.upper })) : [];
      if (logit) {
        if (nSnpTerms === 1) pLog = logit.terms[0].p;
        else {
          // Teste conjunto (RV) dos 2 termos do codominante contra o modelo sem o SNP.
          const base = covCols.length
            ? logisticRegression(records.map((r) => r.cov), records.map((r) => r.y), cov.names)
            : null;
          const llBase = base ? base.logLik : logit.logLikNull;
          const stat = 2 * (logit.logLik - llBase);
          pLog = chiSquareSurvival(stat, 2);
        }
        logit.warnings.forEach((w) => { if (!warnings.includes(w)) warnings.push(w); });
      }
    } else {
      // Brutos: OR de cada categoria contra a primeira (referência).
      ors = categories.slice(1).map((label, i) => {
        const o = oddsRatio(cases[i + 1], controls[i + 1], cases[0], controls[0]);
        return { label: `${label} vs ${categories[0]}`, or: o.or, lower: o.lower, upper: o.upper, corrected: o.corrected };
      });
      if (logit) pLog = nSnpTerms === 1 ? logit.terms[0].p : logit.lrP;
    }
    return {
      model, comparison: categories.join(" / "), cases, controls, categories, ors,
      pChi2: chiSquareTable(table).p,
      pFisher: fisherExact2xK(table),
      pLogistic: pLog,
      adjusted,
    };
  };

  models.push(mk("codominante", [rr, ra, aa], [gc[0], gc[1], gc[2]], [gk[0], gk[1], gk[2]]));
  models.push(mk("dominante", [rr, `${ra}+${aa}`], [gc[0], gc[1] + gc[2]], [gk[0], gk[1] + gk[2]]));
  models.push(mk("recessivo", [`${rr}+${ra}`, aa], [gc[0] + gc[1], gc[2]], [gk[0] + gk[1], gk[2]]));
  models.push(mk("sobredominante", [`${rr}+${aa}`, ra], [gc[0] + gc[2], gc[1]], [gk[0] + gk[2], gk[1]]));
  const la = mk("log-aditivo", [`0 (${rr})`, `1 (${ra})`, `2 (${aa})`], [gc[0], gc[1], gc[2]], [gk[0], gk[1], gk[2]]);
  la.pChi2 = NaN; // teste de tendência é o da regressão
  la.pFisher = NaN;
  models.push(la);

  if (chiSquareTable([[gc[0], gc[1], gc[2]], [gk[0], gk[1], gk[2]]]).lowExpectedFraction > 0.2) {
    warnings.push("Há células com frequência esperada < 5: prefira o p do teste exato de Fisher.");
  }

  return {
    snp, nCases, nControls, genotypeCases: gc, genotypeControls: gk,
    altFreqCases: nCases ? altCases / (2 * nCases) : NaN,
    altFreqControls: nControls ? altControls / (2 * nControls) : NaN,
    allelic,
    hweControls: hardyWeinberg(gk[0], gk[1], gk[2]),
    models,
    warnings,
  };
}
