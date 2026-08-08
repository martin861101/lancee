import sanitizeHtml from 'sanitize-html'
import { requestPublicResource, validatePublicUrl } from './network.mjs'
import { LanceeCapabilityError, textInput } from './registry.mjs'

const MAX_SEARCH_RESPONSE_LENGTH = 1_000_000
const MAX_PAGE_RESPONSE_LENGTH = 1_000_000
const MAX_PAGE_TEXT_LENGTH = 100_000

function decodeHtml(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#')) {
      const hexadecimal = entity.toLowerCase().startsWith('#x')
      const code = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return named[entity.toLowerCase()] || match
  })
}

function plainText(html, maximumLength = MAX_PAGE_TEXT_LENGTH) {
  return decodeHtml(sanitizeHtml(String(html || ''), {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'template', 'svg'],
  }))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength)
}

function pageTitle(html) {
  return plainText(String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', 500)
}

function pageDescription(html) {
  const source = String(html || '')
  const tag = source.match(/<meta\s+[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)?.[0]
  if (!tag) return ''
  return plainText(tag.match(/content=["']([\s\S]*?)["']/i)?.[1] || '', 1_000)
}

function pageLinks(html, baseUrl, maximum = 100) {
  const links = []
  const seen = new Set()
  for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const target = new URL(decodeHtml(match[1]), baseUrl)
      target.hash = ''
      if (!['http:', 'https:'].includes(target.protocol) || seen.has(target.toString())) continue
      seen.add(target.toString())
      links.push({ url: target.toString(), text: plainText(match[2], 300) })
      if (links.length >= maximum) break
    } catch {
      // Ignore invalid or unsupported links from untrusted pages.
    }
  }
  return links
}

function searchResultUrl(value) {
  try {
    const target = new URL(String(value || ''), 'https://html.duckduckgo.com')
    const redirected = target.searchParams.get('uddg')
    const selected = redirected ? new URL(redirected) : target
    return ['http:', 'https:'].includes(selected.protocol) ? selected.toString() : null
  } catch {
    return null
  }
}

function contentType(headers) {
  return String(headers['content-type'] || '').split(';')[0].trim().toLowerCase()
}

function assertTextualResponse(response) {
  const mimeType = contentType(response.headers)
  if (
    mimeType &&
    !mimeType.startsWith('text/') &&
    !['application/json', 'application/xml', 'application/xhtml+xml'].includes(mimeType)
  ) {
    throw new LanceeCapabilityError('UNSUPPORTED_MEDIA_TYPE', `Web access does not support ${mimeType}.`, 415)
  }
  return mimeType || 'text/html'
}

function robotsRules(value) {
  const disallowed = []
  let applies = false
  for (const rawLine of String(value || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const rule = line.slice(separator + 1).trim()
    if (key === 'user-agent') applies = rule === '*'
    else if (key === 'disallow' && applies && rule) disallowed.push(rule)
  }
  return disallowed
}

function robotsAllows(url, rules) {
  const path = `${url.pathname}${url.search}`
  return !rules.some((rule) => path.startsWith(rule))
}

export function createWebCapabilities({
  requestImpl = requestPublicResource,
  dnsLookup,
  env = process.env,
  now = () => new Date(),
} = {}) {
  const requestPage = async (url, { signal, maximumRedirects = 3 } = {}) => requestImpl(url, {
    method: 'GET',
    dnsLookup,
    protocols: ['https:', 'http:'],
    maximumBytes: MAX_PAGE_RESPONSE_LENGTH,
    timeoutMs: 15_000,
    maximumRedirects,
    signal,
    userAgent: 'LanceeResearch/1.0 (+https://lancee.hookitupservices.com)',
  })

  const accessPage = async (url, { signal, maximumTextLength = MAX_PAGE_TEXT_LENGTH } = {}) => {
    const response = await requestPage(url, { signal })
    const mimeType = assertTextualResponse(response)
    const source = response.body.toString('utf8')
    return {
      url: response.url,
      status: response.status,
      contentType: mimeType,
      title: mimeType.includes('html') ? pageTitle(source) : '',
      description: mimeType.includes('html') ? pageDescription(source) : '',
      text: mimeType.includes('html') ? plainText(source, maximumTextLength) : source.slice(0, maximumTextLength),
      links: mimeType.includes('html') ? pageLinks(source, response.url) : [],
      retrievedAt: now().toISOString(),
      source,
    }
  }

  return [
    {
      id: 'web.search',
      namespace: 'web',
      version: '1.1.0',
      description: 'Search the public web and return bounded, normalized source results.',
      provider: 'lancee.web.duckduckgo-html',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2, maxLength: 300 },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['query', 'provider', 'results', 'searchedAt'] },
      requiredPermissions: ['web:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 15_000,
      concurrencyLimit: 3,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['web', 'research', 'search'],
      async execute({ input, signal }) {
        const query = textInput(input, 'query', { required: true, maxLength: 300 })
        const limit = Number.isInteger(input.limit) ? input.limit : 10
        const endpoint = env.LANCEE_WEB_SEARCH_URL || 'https://html.duckduckgo.com/html/'
        const response = await requestImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: Buffer.from(new URLSearchParams({ q: query }).toString()),
          dnsLookup,
          protocols: ['https:'],
          maximumBytes: MAX_SEARCH_RESPONSE_LENGTH,
          timeoutMs: 15_000,
          maximumRedirects: 0,
          signal,
          userAgent: 'LanceeResearch/1.0 (+https://lancee.hookitupservices.com)',
        })
        if (response.status < 200 || response.status >= 300) {
          throw new LanceeCapabilityError('SEARCH_FAILED', `The web search provider returned HTTP ${response.status}.`, 502)
        }
        const html = response.body.toString('utf8')
        const links = [...html.matchAll(/<a[^>]*class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        const results = []
        const seen = new Set()
        for (let index = 0; index < links.length && results.length < limit; index += 1) {
          const match = links[index]
          const url = searchResultUrl(match[1])
          if (!url || seen.has(url)) continue
          const segment = html.slice(match.index + match[0].length, links[index + 1]?.index || html.length)
          const snippet = segment.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i)?.[1]
          const title = plainText(match[2], 500)
          if (!title) continue
          seen.add(url)
          results.push({ title, url, snippet: plainText(snippet || '', 800) })
        }
        if (!results.length) throw new LanceeCapabilityError('SEARCH_EMPTY', 'The web search provider returned no usable results.', 502)
        return { query, provider: 'DuckDuckGo HTML', results, searchedAt: now().toISOString() }
      },
    },
    {
      id: 'web.access',
      namespace: 'web',
      version: '1.0.0',
      description: 'Retrieve one public textual webpage with pinned DNS, bounded redirects, bytes, time, text, and links.',
      provider: 'lancee.web.reader',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', minLength: 1, maxLength: 2048, format: 'uri' },
          max_chars: { type: 'integer', minimum: 1_000, maximum: MAX_PAGE_TEXT_LENGTH },
        },
        required: ['url'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['url', 'status', 'contentType', 'text', 'links', 'retrievedAt'] },
      requiredPermissions: ['web:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 20_000,
      concurrencyLimit: 3,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['web', 'read', 'page'],
      async execute({ input, signal }) {
        const page = await accessPage(textInput(input, 'url', { required: true, maxLength: 2048 }), {
          signal,
          maximumTextLength: Number.isInteger(input.max_chars) ? input.max_chars : MAX_PAGE_TEXT_LENGTH,
        })
        const { source: _source, ...result } = page
        return result
      },
    },
    {
      id: 'web.extract',
      namespace: 'web',
      version: '1.0.0',
      description: 'Extract selected deterministic fields from one bounded public webpage.',
      provider: 'lancee.web.extractor',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', minLength: 1, maxLength: 2048, format: 'uri' },
          fields: {
            type: 'array',
            items: { type: 'string', enum: ['title', 'description', 'headings', 'links', 'emails', 'phones', 'text'] },
            minItems: 1,
            maxItems: 7,
          },
        },
        required: ['url', 'fields'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['url', 'data', 'retrievedAt'] },
      requiredPermissions: ['web:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 20_000,
      concurrencyLimit: 3,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['web', 'extract', 'structured'],
      async execute({ input, signal }) {
        const page = await accessPage(textInput(input, 'url', { required: true, maxLength: 2048 }), { signal })
        const fields = [...new Set(input.fields)]
        const data = {}
        for (const field of fields) {
          if (field === 'title') data.title = page.title
          else if (field === 'description') data.description = page.description
          else if (field === 'links') data.links = page.links
          else if (field === 'text') data.text = page.text
          else if (field === 'headings') {
            data.headings = [...page.source.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
              .slice(0, 100).map((match) => plainText(match[1], 500)).filter(Boolean)
          } else if (field === 'emails') {
            data.emails = [...new Set(page.text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 50)
          } else if (field === 'phones') {
            data.phones = [...new Set(page.text.match(/(?:\+?\d[\d .()-]{6,}\d)/g) || [])].slice(0, 50)
          }
        }
        return { url: page.url, data, retrievedAt: page.retrievedAt }
      },
    },
    {
      id: 'web.crawl',
      namespace: 'web',
      version: '1.0.0',
      description: 'Crawl up to five exact-origin pages with depth, robots, cycle, byte, and wall-time bounds.',
      provider: 'lancee.web.crawler',
      inputSchema: {
        type: 'object',
        properties: {
          start_url: { type: 'string', minLength: 1, maxLength: 2048, format: 'uri' },
          max_pages: { type: 'integer', minimum: 1, maximum: 5 },
          max_depth: { type: 'integer', minimum: 0, maximum: 2 },
        },
        required: ['start_url'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['startUrl', 'pages', 'visited', 'robotsApplied', 'completedAt'] },
      requiredPermissions: ['web:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 30_000,
      concurrencyLimit: 1,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['web', 'crawl', 'bounded'],
      async execute({ input, signal }) {
        const startUrl = textInput(input, 'start_url', { required: true, maxLength: 2048 })
        const { target: startTarget } = await validatePublicUrl(startUrl, { dnsLookup, protocols: ['https:', 'http:'] })
        const maxPages = Number.isInteger(input.max_pages) ? input.max_pages : 5
        const maxDepth = Number.isInteger(input.max_depth) ? input.max_depth : 1
        let rules = []
        try {
          const robots = await requestPage(new URL('/robots.txt', startTarget), { signal, maximumRedirects: 1 })
          if (robots.status >= 200 && robots.status < 300) rules = robotsRules(robots.body.toString('utf8'))
        } catch {
          rules = []
        }
        const queue = [{ url: startTarget.toString(), depth: 0 }]
        const seen = new Set()
        const pages = []
        while (queue.length && pages.length < maxPages) {
          const item = queue.shift()
          const url = new URL(item.url)
          url.hash = ''
          const normalized = url.toString()
          if (seen.has(normalized) || url.origin !== startTarget.origin) continue
          seen.add(normalized)
          if (!robotsAllows(url, rules)) {
            pages.push({ url: normalized, depth: item.depth, blockedByRobots: true })
            continue
          }
          try {
            const page = await accessPage(normalized, { signal, maximumTextLength: 20_000 })
            pages.push({
              url: page.url,
              depth: item.depth,
              status: page.status,
              title: page.title,
              description: page.description,
              text: page.text,
            })
            if (item.depth < maxDepth) {
              for (const link of page.links) {
                const linked = new URL(link.url)
                if (linked.origin === startTarget.origin && !seen.has(linked.toString())) {
                  queue.push({ url: linked.toString(), depth: item.depth + 1 })
                }
              }
            }
          } catch (error) {
            pages.push({ url: normalized, depth: item.depth, error: error.code || 'UNAVAILABLE' })
          }
        }
        return {
          startUrl: startTarget.toString(),
          pages,
          visited: seen.size,
          robotsApplied: rules.length > 0,
          completedAt: now().toISOString(),
        }
      },
    },
  ]
}
