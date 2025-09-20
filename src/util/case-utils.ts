/*
 * Derived from Case (MIT) https://github.com/nbubna/Case
 * Copyright (c) 2020 Nathan Bubna
 * Licensed under the MIT License.
 */

const unicodes = (value: string, prefix = ''): string =>
  value.replace(/(^|-)/g, `$1\\u${prefix}`).replace(/,/g, `\\u${prefix}`)

const basicSymbols = unicodes('20-26,28-2F,3A-40,5B-60,7B-7E,A0-BF,D7,F7', '00')
const baseLowerCase = `a-z${unicodes('DF-F6,F8-FF', '00')}`
const baseUpperCase = `A-Z${unicodes('C0-D6,D8-DE', '00')}`
const improperInTitle = 'A|An|And|As|At|But|By|En|For|If|In|Of|On|Or|The|To|Vs?\\.?|Via'

type RegexCollection = {
  capitalize: RegExp
  pascal: RegExp
  fill: RegExp
  sentence: RegExp
  improper: RegExp
  relax: RegExp
  upper: RegExp
  hole: RegExp
  apostrophe: RegExp
  room: RegExp
}

const createRegexps = (
  symbols = basicSymbols,
  lowers = baseLowerCase,
  uppers = baseUpperCase,
  impropers = improperInTitle,
): RegexCollection => ({
  capitalize: new RegExp(`(^|[${symbols}])([${lowers}])`, 'g'),
  pascal: new RegExp(`(^|[${symbols}])+([${lowers}${uppers}])`, 'g'),
  fill: new RegExp(`[${symbols}]+(.|$)`, 'g'),
  sentence: new RegExp(`(^\\s*|[\\?\\!\\.]+"?\\s+"?|,\\s+")([${lowers}])`, 'g'),
  improper: new RegExp(`\\b(${impropers})\\b`, 'g'),
  relax: new RegExp(`([^${uppers}])([${uppers}]*)([${uppers}])(?=[^${uppers}]|$)`, 'g'),
  upper: new RegExp(`^[^${lowers}]+$`),
  hole: /[^\s]\s[^\s]/,
  apostrophe: /'/g,
  room: new RegExp(`[${symbols}]`),
})

const re = createRegexps()

const toUpper = (value: string): string => value.toUpperCase()
const toLower = (value: string): string => value.toLowerCase()

const relaxReplacement = (_match: string, before: string, acronym: string, caps: string): string =>
  `${before} ${acronym ? `${acronym} ` : ''}${caps}`

const applyFill = (
  value: string,
  fill: string | null | undefined,
  removeApostrophes?: boolean,
): string => {
  let result = value
  if (fill != null) {
    result = result.replace(re.fill, (_match, next: string) => (next ? fill + next : ''))
  }
  if (removeApostrophes) {
    result = result.replace(re.apostrophe, '')
  }
  return result
}

const prepareInput = (
  original: string,
  fill: string | false | null | undefined,
  pascal?: boolean,
  treatAsUpper?: boolean,
): string => {
  let value = original == null ? '' : `${original}`
  if (!treatAsUpper && re.upper.test(value)) {
    value = toLower(value)
  }
  if (!fill && !re.hole.test(value)) {
    const holey = applyFill(value, ' ')
    if (re.hole.test(holey)) {
      value = holey
    }
  }
  if (!pascal && !re.room.test(value)) {
    value = value.replace(re.relax, relaxReplacement)
  }
  return value
}

const lowerCase = (
  value: string,
  fill: string | false | null | undefined,
  removeApostrophes?: boolean,
): string => {
  const prepared = prepareInput(value, fill)
  const lowered = toLower(prepared)
  const fillArg = fill === false ? undefined : fill
  return applyFill(lowered, fillArg, removeApostrophes)
}

export const toPascalCase = (value: string): string => {
  const prepared = prepareInput(value, false, true)
  const transformed = prepared.replace(re.pascal, (_match, _border: string, letter: string) =>
    toUpper(letter),
  )
  return applyFill(transformed, '', true)
}

export const toKebabCase = (value: string): string => lowerCase(value, '-', true)
