import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import { LanceeCapabilityError } from './registry.mjs'

function privateIpv4(address) {
  const octets = address.split('.').map(Number)
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) ||
    (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) ||
    (octets[0] === 192 && octets[1] === 88 && octets[2] === 99) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 198 && [18, 19].includes(octets[1])) ||
    (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
    (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) ||
    octets[0] >= 224
  )
}

function ipv6Integer(address) {
  let normalized = address.toLowerCase()
  if (normalized.includes('.')) {
    const separator = normalized.lastIndexOf(':')
    const octets = normalized.slice(separator + 1).split('.').map(Number)
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
    normalized = `${normalized.slice(0, separator)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }
  const compressed = normalized.split('::')
  if (compressed.length > 2) return null
  const left = compressed[0] ? compressed[0].split(':') : []
  const right = compressed[1] ? compressed[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((compressed.length === 1 && missing !== 0) || missing < 0) return null
  const groups = compressed.length === 2
    ? [...left, ...Array(missing).fill('0'), ...right]
    : left
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n)
}

const blockedIpv6Ranges = [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].map(([address, bits]) => ({ value: ipv6Integer(address), bits }))

function privateIpv6(address) {
  const value = ipv6Integer(address)
  if (value === null) return true
  return blockedIpv6Ranges.some((range) => (
    value >> BigInt(128 - range.bits) === range.value >> BigInt(128 - range.bits)
  ))
}

export function isPrivateNetworkAddress(address) {
  const version = isIP(address)
  return version === 4 ? privateIpv4(address) : version === 6 ? privateIpv6(address) : true
}

export async function validatePublicUrl(value, {
  dnsLookup = lookup,
  protocols = ['https:'],
} = {}) {
  let target
  try {
    target = new URL(String(value || ''))
  } catch {
    throw new LanceeCapabilityError('INVALID_URL', 'Enter a valid public URL.')
  }
  if (target.username || target.password) {
    throw new LanceeCapabilityError('INVALID_URL', 'Public URLs cannot contain credentials.')
  }
  target.hash = ''
  if (!protocols.includes(target.protocol)) {
    throw new LanceeCapabilityError('HTTPS_REQUIRED', `Only ${protocols.join(' or ')} URLs are allowed.`)
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new LanceeCapabilityError('PRIVATE_ADDRESS_BLOCKED', 'Private and internal hosts are not allowed.')
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await dnsLookup(hostname, { all: true, verbatim: true }).catch(() => [])
  if (!addresses.length) {
    throw new LanceeCapabilityError('HOST_UNREACHABLE', 'The public hostname could not be resolved.', 502, { retryable: true })
  }
  if (addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new LanceeCapabilityError('PRIVATE_ADDRESS_BLOCKED', 'The hostname must resolve only to public addresses.')
  }
  return { target, addresses }
}

function pinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, addresses.map(({ address, family }) => ({ address, family: Number(family) || isIP(address) })))
      return
    }
    const selected = addresses[0]
    callback(null, selected.address, Number(selected.family) || isIP(selected.address))
  }
}

function readBoundedResponse(response, maximumBytes) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(response.headers['content-length'] || 0)
    if (declaredLength > maximumBytes) {
      response.destroy()
      reject(new LanceeCapabilityError('RESPONSE_TOO_LARGE', `The response exceeded ${maximumBytes} bytes.`, 413))
      return
    }
    const chunks = []
    let length = 0
    response.on('data', (chunk) => {
      length += chunk.length
      if (length > maximumBytes) {
        response.destroy(new LanceeCapabilityError('RESPONSE_TOO_LARGE', `The response exceeded ${maximumBytes} bytes.`, 413))
        return
      }
      chunks.push(Buffer.from(chunk))
    })
    response.on('end', () => resolve(Buffer.concat(chunks)))
    response.on('error', reject)
  })
}

export async function requestPublicResource(value, {
  method = 'GET',
  headers = {},
  body = null,
  dnsLookup = lookup,
  protocols = ['https:'],
  maximumBytes = 1_000_000,
  timeoutMs = 15_000,
  maximumRedirects = 0,
  signal,
  userAgent = 'LanceeCapability/1.0',
} = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  const requestBody = body === null || body === undefined
    ? null
    : Buffer.isBuffer(body) ? body : Buffer.from(String(body))

  async function send(targetValue, redirectsRemaining) {
    const { target, addresses } = await validatePublicUrl(targetValue, { dnsLookup, protocols })
    const transport = target.protocol === 'https:' ? https : http
    const response = await new Promise((resolve, reject) => {
      const request = transport.request(target, {
        method: normalizedMethod,
        headers: {
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          'User-Agent': userAgent,
          ...headers,
          ...(requestBody && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')
            ? { 'Content-Length': requestBody.byteLength }
            : {}),
        },
        lookup: pinnedLookup(addresses),
        signal,
      }, resolve)
      request.setTimeout(timeoutMs, () => {
        request.destroy(new LanceeCapabilityError('TIMEOUT', 'The public request timed out.', 504, { retryable: true }))
      })
      request.on('error', (error) => {
        if (error instanceof LanceeCapabilityError) reject(error)
        else if (error?.name === 'AbortError') reject(new LanceeCapabilityError('TIMEOUT', 'The public request was cancelled.', 504, { retryable: true }))
        else reject(new LanceeCapabilityError('UNAVAILABLE', 'The public host could not be reached.', 502, { retryable: true }))
      })
      if (requestBody) request.write(requestBody)
      request.end()
    })

    const location = response.headers.location
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
      response.resume()
      if (redirectsRemaining <= 0) {
        throw new LanceeCapabilityError('REDIRECT_BLOCKED', 'The public request redirected outside its allowed budget.', 502)
      }
      const redirected = new URL(location, target)
      return send(redirected, redirectsRemaining - 1)
    }
    const encoding = String(response.headers['content-encoding'] || 'identity').toLowerCase()
    if (!['', 'identity'].includes(encoding)) {
      response.resume()
      throw new LanceeCapabilityError('UNSUPPORTED_ENCODING', 'The server returned an unsupported compressed response.', 502)
    }
    const responseBody = normalizedMethod === 'HEAD'
      ? (response.resume(), Buffer.alloc(0))
      : await readBoundedResponse(response, maximumBytes)
    return {
      url: target.toString(),
      status: Number(response.statusCode || 0),
      headers: response.headers,
      body: responseBody,
    }
  }

  return send(value, Math.max(0, Math.min(5, Number(maximumRedirects) || 0)))
}
