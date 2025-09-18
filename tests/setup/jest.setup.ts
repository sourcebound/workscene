import { afterEach, jest } from '@jest/globals'

afterEach(() => {
  jest.clearAllMocks()
  jest.restoreAllMocks()
})
