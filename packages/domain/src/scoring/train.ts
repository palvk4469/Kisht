import type { ModelParams } from "./model.ts";

// Plain batch gradient descent with L2. Deterministic: no random init, no
// shuffling, so the same data always yields the same coefficients.

export type TrainingRow = { x: (number | null)[]; y: 0 | 1 };

export function train(
  rows: readonly TrainingRow[],
  opts: { version: string; iterations?: number; learningRate?: number; l2?: number },
): ModelParams {
  const size = rows[0]?.x.length ?? 0;
  const means = new Array<number>(size).fill(0);
  const stds = new Array<number>(size).fill(1);

  for (let j = 0; j < size; j++) {
    const known = rows.map((r) => r.x[j]).filter((v): v is number => v !== null && v !== undefined);
    const mean = known.reduce((a, b) => a + b, 0) / (known.length || 1);
    const variance = known.reduce((a, b) => a + (b - mean) ** 2, 0) / (known.length || 1);
    means[j] = mean;
    stds[j] = Math.sqrt(variance) || 1;
  }

  // Standardised once up front; unknown values sit at the mean (0).
  const X = rows.map((r) =>
    r.x.map((v, j) => (v === null ? 0 : (v - (means[j] ?? 0)) / (stds[j] ?? 1))),
  );

  const iterations = opts.iterations ?? 2000;
  const learningRate = opts.learningRate ?? 0.3;
  const l2 = opts.l2 ?? 1e-3;
  const weights = new Array<number>(size).fill(0);
  let intercept = 0;

  for (let it = 0; it < iterations; it++) {
    const grad = new Array<number>(size).fill(0);
    let gradIntercept = 0;
    rows.forEach((row, i) => {
      const xi = X[i] as number[];
      let z = intercept;
      for (let j = 0; j < size; j++) z += (weights[j] as number) * (xi[j] as number);
      const error = 1 / (1 + Math.exp(-z)) - row.y;
      gradIntercept += error;
      for (let j = 0; j < size; j++) grad[j] = (grad[j] as number) + error * (xi[j] as number);
    });
    const n = rows.length || 1;
    intercept -= (learningRate * gradIntercept) / n;
    for (let j = 0; j < size; j++) {
      weights[j] =
        (weights[j] as number) -
        learningRate * ((grad[j] as number) / n + l2 * (weights[j] as number));
    }
  }

  return { version: opts.version, intercept, weights, means, stds };
}
