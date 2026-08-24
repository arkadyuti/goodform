/**
 * Multi-select toggle with support for one mutually exclusive option, such as
 * "Nothing" in a list of equipment: picking it clears the rest, and picking
 * anything else clears it.
 */
export function toggleChoice<T extends string>(
  selected: readonly T[],
  option: T,
  exclusive?: T,
): T[] {
  const isSelected = selected.includes(option);

  if (option === exclusive) return isSelected ? [] : [option];
  if (isSelected) return selected.filter((v) => v !== option);
  return [...selected.filter((v) => v !== exclusive), option];
}
