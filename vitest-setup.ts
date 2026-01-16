import { vi } from 'vitest'

// Create a jest-compatible object using Vitest's vi
// Vitest mocks already have Jest-compatible methods, we just need to expose them
const jestCompat = {
  ...vi,
  fn: vi.fn,
  mock: vi.mock,
  clearAllMocks: vi.clearAllMocks,
  resetAllMocks: vi.resetAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
  // Add jest.Mock and jest.MockedClass as type aliases for compatibility
  Mock: Object,
  MockedClass: Object,
}

// Provide jest compatibility for test files that use jest.* APIs
;(globalThis as any).jest = jestCompat
