/** Vrai si au moins un vote a été émis et que tous les votes sont identiques. */
export function hasConsensus(votes: Record<string, string>): boolean {
  const values = Object.values(votes);
  return values.length > 0 && values.every((v) => v === values[0]);
}
