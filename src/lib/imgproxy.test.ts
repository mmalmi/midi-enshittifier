import { describe, expect, it } from 'vitest'
import { proxyImageUrl } from './imgproxy'

describe('proxyImageUrl', () => {
  it('passes through non-http image sources', async () => {
    await expect(proxyImageUrl('data:image/png;base64,abc')).resolves.toBe('data:image/png;base64,abc')
    await expect(proxyImageUrl('blob:http://localhost/image')).resolves.toBe('blob:http://localhost/image')
    await expect(proxyImageUrl('not-a-url')).resolves.toBe('not-a-url')
  })

  it('wraps external images through iris imgproxy', async () => {
    const proxied = await proxyImageUrl('https://example.com/avatar.jpg?size=128', {
      width: 24,
      height: 24,
      square: true,
    })

    expect(proxied).toMatch(/^https:\/\/imgproxy\.iris\.to\//)
    expect(proxied).toContain('/rs:fill:24:24/dpr:2/')
    expect(proxied).not.toContain('example.com/avatar.jpg?size=128')
  })
})
