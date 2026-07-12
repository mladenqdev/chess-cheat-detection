/**
 * Converts a centipawn evaluation (from White's perspective) into White's expected
 * winning chances in percent, using the lichess model: https://lichess.org/page/accuracy
 *
 * Win% is the basis of the Accuracy metric: unlike raw centipawns, a given Win% delta
 * means the same thing in equal and in decided positions.
 */
export function winPercentFromCentipawns(cp: number): number {
  // lichess ceils cp to ±1000 before the sigmoid (Cp.ceiled) — match it for fidelity
  const ceiled = Math.min(1000, Math.max(-1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * ceiled)) - 1);
}
