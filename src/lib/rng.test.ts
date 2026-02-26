import { describe, it, expect } from 'vitest'
import { mulberry32 } from './rng'
describe('mulberry32', () => {
  it('deterministic', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 50; i++) expect(a()).toBe(b())
  })
  it('values in [0,1)', () => {
    const rng = mulberry32(12345)
    for (let i = 0; i < 500; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
