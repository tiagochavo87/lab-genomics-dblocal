/**
 * Testes estatísticos. Cada função documenta o método para que os
 * resultados possam ser descritos nos Métodos de um artigo. Validados contra
 * scipy/statsmodels em src/test/stats.test.ts.
 */
import {
  chiSquareSurvival, fSurvival, logFactorial, normalTwoSided, tTwoSided, Z975,
} from "./distributions";

// ---------------------------------------------------------------------------
// Descritivas

export interface Describe {
  n: number;
  mean: number;
  sd: number;
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
}

/** Quantil tipo 7 (padrão do R e do numpy). */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function describe(values: number[]): Describe {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  const mean = n ? v.reduce((s, x) => s + x, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : NaN;
  return { n, mean, sd, median: quantile(v, 0.5), q1: quantile(v, 0.25), q3: quantile(v, 0.75), min: v[0] ?? NaN, max: v[n - 1] ?? NaN };
}

// ---------------------------------------------------------------------------
// Tabelas de contingência

export interface ChiSquareResult {
  statistic: number;
  df: number;
  p: number;
  expected: number[][];
  /** Proporção de células com esperado < 5 (alerta de validade). */
  lowExpectedFraction: number;
}

/** Qui-quadrado de Pearson para tabela r×c (sem correção de continuidade). */
export function chiSquareTable(table: number[][]): ChiSquareResult {
  const rows = table.filter((r) => r.reduce((s, x) => s + x, 0) > 0);
  const nCols = rows[0]?.length ?? 0;
  const colSums = Array.from({ length: nCols }, (_, j) => rows.reduce((s, r) => s + r[j], 0));
  const keep = colSums.map((c) => c > 0);
  const t = rows.map((r) => r.filter((_, j) => keep[j]));
  const cs = colSums.filter((_, j) => keep[j]);
  const rs = t.map((r) => r.reduce((s, x) => s + x, 0));
  const n = rs.reduce((s, x) => s + x, 0);
  const expected = t.map((_, i) => cs.map((c) => (rs[i] * c) / n));
  let stat = 0;
  let low = 0;
  let cells = 0;
  t.forEach((r, i) => r.forEach((o, j) => {
    const e = expected[i][j];
    stat += ((o - e) ** 2) / e;
    cells++;
    if (e < 5) low++;
  }));
  const df = (t.length - 1) * (cs.length - 1);
  return { statistic: stat, df, p: df > 0 ? chiSquareSurvival(stat, df) : NaN, expected, lowExpectedFraction: cells ? low / cells : 0 };
}

function logHypergeomTable(table: number[][], logDenom: number): number {
  let s = 0;
  for (const r of table) for (const x of r) s += logFactorial(x);
  return logDenom - s;
}

/**
 * Teste exato de Fisher bicaudal para tabelas 2×k (k = 2 ou 3), por
 * enumeração de todas as tabelas com as mesmas margens (Freeman-Halton para
 * k = 3). p = soma das probabilidades <= à observada (critério do R/scipy).
 */
export function fisherExact2xK(table: number[][]): number {
  if (table.length !== 2) return NaN;
  const k = table[0].length;
  const rowSums = table.map((r) => r.reduce((s, x) => s + x, 0));
  const colSums = table[0].map((_, j) => table[0][j] + table[1][j]);
  const n = rowSums[0] + rowSums[1];
  if (n === 0) return NaN;
  let logDenom = 0;
  for (const r of rowSums) logDenom += logFactorial(r);
  for (const c of colSums) logDenom += logFactorial(c);
  logDenom -= logFactorial(n);
  const pObs = logHypergeomTable(table, logDenom);
  const eps = 1e-7;
  let p = 0;
  const r1 = rowSums[0];
  if (k === 2) {
    for (let a = Math.max(0, r1 - colSums[1]); a <= Math.min(r1, colSums[0]); a++) {
      const tb = [[a, r1 - a], [colSums[0] - a, colSums[1] - (r1 - a)]];
      const lp = logHypergeomTable(tb, logDenom);
      if (lp <= pObs + eps) p += Math.exp(lp);
    }
  } else if (k === 3) {
    for (let a = 0; a <= Math.min(r1, colSums[0]); a++) {
      for (let b = 0; b <= Math.min(r1 - a, colSums[1]); b++) {
        const c = r1 - a - b;
        if (c > colSums[2]) continue;
        const tb = [[a, b, c], [colSums[0] - a, colSums[1] - b, colSums[2] - c]];
        const lp = logHypergeomTable(tb, logDenom);
        if (lp <= pObs + eps) p += Math.exp(lp);
      }
    }
  } else {
    return NaN;
  }
  return Math.min(1, p);
}

export interface OddsRatio {
  or: number;
  lower: number;
  upper: number;
  /** true quando foi preciso somar 0,5 às células (alguma célula zero). */
  corrected: boolean;
}

/**
 * Odds ratio de uma tabela 2×2 [[a, b], [c, d]] = (a·d)/(b·c), com IC 95% de
 * Woolf (logit). Com célula zero aplica a correção de Haldane-Anscombe (+0,5).
 * Convenção: linhas = exposto/não exposto; colunas = caso/controle.
 */
export function oddsRatio(a: number, b: number, c: number, d: number): OddsRatio {
  let corrected = false;
  if (a === 0 || b === 0 || c === 0 || d === 0) {
    a += 0.5; b += 0.5; c += 0.5; d += 0.5;
    corrected = true;
  }
  const or = (a * d) / (b * c);
  const se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  return { or, lower: Math.exp(Math.log(or) - Z975 * se), upper: Math.exp(Math.log(or) + Z975 * se), corrected };
}

// ---------------------------------------------------------------------------
// Comparação de grupos (variável numérica)

function rankWithTies(values: number[]): { ranks: number[]; tieTerm: number } {
  const idx = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let tieTerm = 0;
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r;
    const t = j - i + 1;
    tieTerm += t ** 3 - t;
    i = j + 1;
  }
  return { ranks, tieTerm };
}

export interface TestResult {
  statistic: number;
  p: number;
  df?: number;
  df2?: number;
  method: string;
}

/**
 * Mann-Whitney U bicaudal, aproximação normal com correção de empates e de
 * continuidade (equivale ao scipy mannwhitneyu(method="asymptotic")).
 */
export function mannWhitney(x: number[], y: number[]): TestResult {
  const n1 = x.length;
  const n2 = y.length;
  const { ranks, tieTerm } = rankWithTies([...x, ...y]);
  const r1 = ranks.slice(0, n1).reduce((s, r) => s + r, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const n = n1 + n2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  const u = Math.max(u1, n1 * n2 - u1);
  const z = (u - mu - 0.5) / sigma;
  return { statistic: u1, p: Math.min(1, normalTwoSided(z)), method: "Mann-Whitney U (aproximação normal, correção de empates e de continuidade)" };
}

/** Kruskal-Wallis H com correção de empates; qui-quadrado com k-1 gl. */
export function kruskalWallis(groups: number[][]): TestResult {
  const all = groups.flat();
  const n = all.length;
  const { ranks, tieTerm } = rankWithTies(all);
  let h = 0;
  let pos = 0;
  for (const g of groups) {
    const rs = ranks.slice(pos, pos + g.length).reduce((s, r) => s + r, 0);
    h += (rs * rs) / g.length;
    pos += g.length;
  }
  h = (12 / (n * (n + 1))) * h - 3 * (n + 1);
  h /= 1 - tieTerm / (n ** 3 - n);
  const df = groups.length - 1;
  return { statistic: h, df, p: chiSquareSurvival(h, df), method: "Kruskal-Wallis (correção de empates)" };
}

/** Teste t de Welch (variâncias diferentes), bicaudal. */
export function welchT(x: number[], y: number[]): TestResult {
  const a = describe(x);
  const b = describe(y);
  const va = a.sd ** 2 / a.n;
  const vb = b.sd ** 2 / b.n;
  const t = (a.mean - b.mean) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.n - 1) + vb ** 2 / (b.n - 1));
  return { statistic: t, df, p: tTwoSided(t, df), method: "t de Welch" };
}

/** ANOVA de um fator (F clássico). */
export function oneWayAnova(groups: number[][]): TestResult {
  const all = groups.flat();
  const n = all.length;
  const k = groups.length;
  const grand = all.reduce((s, x) => s + x, 0) / n;
  let ssb = 0;
  let ssw = 0;
  for (const g of groups) {
    const m = g.reduce((s, x) => s + x, 0) / g.length;
    ssb += g.length * (m - grand) ** 2;
    for (const x of g) ssw += (x - m) ** 2;
  }
  const df1 = k - 1;
  const df2 = n - k;
  const f = ssb / df1 / (ssw / df2);
  return { statistic: f, df: df1, df2, p: fSurvival(f, df1, df2), method: "ANOVA de um fator" };
}

// ---------------------------------------------------------------------------
// Hardy-Weinberg

export interface HweResult {
  nAA: number;
  nAB: number;
  nBB: number;
  n: number;
  freqA: number;
  expAA: number;
  expAB: number;
  expBB: number;
  chi2: number;
  pChi2: number;
  pExact: number;
}

/**
 * Equilíbrio de Hardy-Weinberg para um SNP bialélico.
 * - Qui-quadrado de Pearson com 1 gl (sem correção de continuidade).
 * - Teste exato de Wigginton, Cutler & Abecasis (2005), bicaudal (padrão do PLINK).
 */
export function hardyWeinberg(nAA: number, nAB: number, nBB: number): HweResult {
  const n = nAA + nAB + nBB;
  const freqA = (2 * nAA + nAB) / (2 * n);
  const q = 1 - freqA;
  const expAA = n * freqA * freqA;
  const expAB = 2 * n * freqA * q;
  const expBB = n * q * q;
  let chi2 = NaN;
  let pChi2 = NaN;
  if (expAA > 0 && expAB > 0 && expBB > 0) {
    chi2 = (nAA - expAA) ** 2 / expAA + (nAB - expAB) ** 2 / expAB + (nBB - expBB) ** 2 / expBB;
    pChi2 = chiSquareSurvival(chi2, 1);
  } else if (n > 0) {
    chi2 = 0;
    pChi2 = 1;
  }
  return { nAA, nAB, nBB, n, freqA, expAA, expAB, expBB, chi2, pChi2, pExact: hweExact(nAB, nAA, nBB) };
}

/** Implementação de referência SNPHWE (Wigginton et al., 2005). */
export function hweExact(obsHets: number, obsHom1: number, obsHom2: number): number {
  const obsHomc = Math.max(obsHom1, obsHom2);
  const obsHomr = Math.min(obsHom1, obsHom2);
  const rareCopies = 2 * obsHomr + obsHets;
  const genotypes = obsHets + obsHomc + obsHomr;
  if (genotypes === 0) return NaN;
  const probs = new Array(rareCopies + 1).fill(0);
  let mid = Math.floor((rareCopies * (2 * genotypes - rareCopies)) / (2 * genotypes));
  if ((rareCopies & 1) ^ (mid & 1)) mid++;
  let currHets = mid;
  let currHomr = (rareCopies - mid) / 2;
  let currHomc = genotypes - currHets - currHomr;
  probs[mid] = 1;
  let sum = 1;
  for (currHets = mid; currHets > 1; currHets -= 2) {
    probs[currHets - 2] = (probs[currHets] * currHets * (currHets - 1)) / (4 * (currHomr + 1) * (currHomc + 1));
    sum += probs[currHets - 2];
    currHomr++;
    currHomc++;
  }
  currHets = mid;
  currHomr = (rareCopies - mid) / 2;
  currHomc = genotypes - currHets - currHomr;
  for (currHets = mid; currHets <= rareCopies - 2; currHets += 2) {
    probs[currHets + 2] = (probs[currHets] * 4 * currHomr * currHomc) / ((currHets + 2) * (currHets + 1));
    sum += probs[currHets + 2];
    currHomr--;
    currHomc--;
  }
  const target = probs[obsHets];
  let p = 0;
  for (const pr of probs) if (pr <= target * (1 + 1e-7)) p += pr / sum;
  return Math.min(1, p);
}

// ---------------------------------------------------------------------------
// Regressão logística

export interface LogisticTerm {
  name: string;
  beta: number;
  se: number;
  z: number;
  p: number;
  or: number;
  lower: number;
  upper: number;
}

export interface LogisticResult {
  terms: LogisticTerm[];
  n: number;
  nEvents: number;
  logLik: number;
  logLikNull: number;
  lrStatistic: number;
  lrDf: number;
  lrP: number;
  aic: number;
  mcFaddenR2: number;
  iterations: number;
  converged: boolean;
  warnings: string[];
}

function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-12) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

/**
 * Regressão logística por máxima verossimilhança (IRLS / Newton-Raphson).
 * X sem a coluna de intercepto (é adicionada aqui). y ∈ {0, 1}.
 * Wald para cada coeficiente; teste da razão de verossimilhança global.
 */
export function logisticRegression(X: number[][], y: number[], names: string[], maxIter = 50): LogisticResult {
  const n = y.length;
  const p = names.length + 1;
  const Z = X.map((row) => [1, ...row]);
  let beta = new Array(p).fill(0);
  const warnings: string[] = [];
  const nEvents = y.reduce((s, v) => s + v, 0);
  const pBar = nEvents / n;
  beta[0] = Math.log(pBar / (1 - pBar));
  let converged = false;
  let iter = 0;
  let cov: number[][] | null = null;
  let ll = -Infinity;
  const loglik = (b: number[]) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const eta = Z[i].reduce((acc, z, j) => acc + z * b[j], 0);
      s += y[i] * eta - Math.log1p(Math.exp(-Math.abs(eta))) - Math.max(eta, 0);
    }
    return s;
  };
  for (iter = 1; iter <= maxIter; iter++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    const g = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const eta = Z[i].reduce((acc, z, j) => acc + z * beta[j], 0);
      const mu = 1 / (1 + Math.exp(-eta));
      const w = mu * (1 - mu);
      for (let j = 0; j < p; j++) {
        g[j] += (y[i] - mu) * Z[i][j];
        for (let k = j; k < p; k++) H[j][k] += w * Z[i][j] * Z[i][k];
      }
    }
    for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    cov = invertMatrix(H);
    if (!cov) {
      warnings.push("Matriz singular: há variáveis redundantes (colineares) ou categorias sem observações.");
      break;
    }
    const step = cov.map((row) => row.reduce((s, v, k) => s + v * g[k], 0));
    const next = beta.map((b, j) => b + step[j]);
    const llNext = loglik(next);
    beta = next;
    const diff = Math.abs(llNext - ll);
    ll = llNext;
    if (diff < 1e-10) { converged = true; break; }
  }
  if (!converged && !warnings.length) warnings.push("O modelo não convergiu; os resultados podem não ser confiáveis.");
  if (beta.some((b) => Math.abs(b) > 15)) warnings.push("Coeficientes muito grandes: possível separação completa (alguma categoria só tem casos ou só controles).");
  const llNull = nEvents > 0 && nEvents < n ? nEvents * Math.log(pBar) + (n - nEvents) * Math.log(1 - pBar) : 0;
  const terms: LogisticTerm[] = names.map((name, idx) => {
    const j = idx + 1;
    const b = beta[j];
    const se = cov ? Math.sqrt(cov[j][j]) : NaN;
    const z = b / se;
    return { name, beta: b, se, z, p: normalTwoSided(z), or: Math.exp(b), lower: Math.exp(b - Z975 * se), upper: Math.exp(b + Z975 * se) };
  });
  const lrStatistic = 2 * (ll - llNull);
  const lrDf = p - 1;
  if (n < 10 * lrDf || Math.min(nEvents, n - nEvents) < 10 * lrDf) {
    warnings.push("Poucos eventos por variável (recomendação: ≥ 10 casos e ≥ 10 controles por termo); interprete com cautela.");
  }
  return {
    terms, n, nEvents, logLik: ll, logLikNull: llNull, lrStatistic, lrDf,
    lrP: chiSquareSurvival(lrStatistic, lrDf), aic: -2 * ll + 2 * p,
    mcFaddenR2: llNull !== 0 ? 1 - ll / llNull : NaN, iterations: iter, converged, warnings,
  };
}
