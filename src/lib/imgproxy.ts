export interface ImgProxyConfig {
  url: string
  key: string
  salt: string
}

export interface ImgProxyOptions {
  width?: number
  height?: number
  square?: boolean
}

export const DEFAULT_IMGPROXY_CONFIG: ImgProxyConfig = {
  url: 'https://imgproxy.iris.to',
  key: 'f66233cb160ea07078ff28099bfa3e3e654bc10aa4a745e12176c433d79b8996',
  salt: '5e608e60945dcd2a787e8465d76ba34149894765061d39287609fb9d776caa0c',
}

function urlSafeBase64(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('')
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }

  return result
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength)
  copied.set(bytes)
  return copied.buffer
}

function getImgproxyConfig(): ImgProxyConfig {
  return {
    url: import.meta.env.VITE_IMGPROXY_URL?.trim() || DEFAULT_IMGPROXY_CONFIG.url,
    key: import.meta.env.VITE_IMGPROXY_KEY?.trim() || DEFAULT_IMGPROXY_CONFIG.key,
    salt: import.meta.env.VITE_IMGPROXY_SALT?.trim() || DEFAULT_IMGPROXY_CONFIG.salt,
  }
}

function isProxyableImageUrl(value: string, config: ImgProxyConfig): boolean {
  if (!value) return false
  if (value.startsWith(config.url) || value.startsWith('data:') || value.startsWith('blob:')) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function signPath(path: string, key: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyBytes = hexToBytes(key)
  const saltBytes = hexToBytes(salt)
  const pathBytes = encoder.encode(path)
  const data = concatBytes(saltBytes, pathBytes)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, toArrayBuffer(data))
  return urlSafeBase64(new Uint8Array(signature))
}

export async function proxyImageUrl(
  originalUrl: string,
  options: ImgProxyOptions = {},
): Promise<string> {
  const config = getImgproxyConfig()
  if (!isProxyableImageUrl(originalUrl, config)) return originalUrl

  try {
    const encoder = new TextEncoder()
    const encodedUrl = urlSafeBase64(encoder.encode(originalUrl))
    const params: string[] = []

    if (options.width || options.height) {
      const resizeType = options.square ? 'fill' : 'fit'
      const width = options.width || options.height || 0
      const height = options.height || options.width || 0
      params.push(`rs:${resizeType}:${width}:${height}`)
    }

    params.push('dpr:2')

    const path = `/${params.join('/')}/${encodedUrl}`
    const signature = await signPath(path, config.key, config.salt)
    return `${config.url}/${signature}${path}`
  } catch {
    return originalUrl
  }
}
