import { toKebabCase, toPascalCase } from '@/util/case-utils'

export const symbolVariants = <S extends string, V extends readonly string[]>(
  symbol: S,
  variants: V,
) => variants.map((v) => toKebabCase(symbol + toPascalCase(v)))

export const symbolWithVariants = <S extends string, V extends readonly string[]>(
  symbol: S,
  variants: V,
  options?: { includeBase?: boolean },
) => {
  const uniqueVariants = Array.from(new Set(variants.filter((v) => v !== symbol)))
  const base = options?.includeBase === false ? [] : [symbol]
  return [...base, ...symbolVariants(symbol, uniqueVariants)]
}
