export function isDeleteSettledResult(result) {
  return Boolean(result?.ok || result?.reason === "not_found");
}
