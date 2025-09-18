import { describe, expect, it } from '@jest/globals'
import Case from 'case'

describe('changeCase', () => {
  it('should convert string to camel case', () => {
    expect(Case.kebab('Hello world')).toBe('hello-world')
  })
})
