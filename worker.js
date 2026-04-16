/**
 * worker.js — CW QSO Trainer edge Worker
 *
 * Intercepts every request to Workers Assets, then injects:
 *   - Optimised Cache-Control (immutable / no-cache / stale-while-revalidate)
 *   - Full security header suite (CSP, HSTS, COOP, Permissions-Policy …)
 *   - Resource preload Link header on the root HTML document
 *
 * Immutable assets (JS, CSS, images) are additionally stored in the
 * Workers edge cache so repeated requests within the same PoP skip the
 * Assets fetch entirely.
 */

// ── Cache-Control rules ───────────────────────────────────────────────────────
// Evaluated top-to-bottom; first match wins.

const CACHE_RULES = [
  {
    // Versioned build artifacts — content never changes for a given URL.
    // Safe to cache for 1 year; a new deploy produces new asset hashes.
    test:    p => p.startsWith('/js/') || p === '/style.css' ||
                  /^\/icon-\d+\.png$/.test(p) || p === '/og-image.png',
    control: 'public, max-age=31536000, immutable',
    edge:    true,   // store in Workers Cache API between requests
  },
  {
    // Root HTML — must revalidate on every navigation so users always
    // get the latest version after a deploy.
    test:    p => p === '/' || p === '/index.html',
    control: 'no-cache, must-revalidate',
    edge:    false,
  },
  {
    // PWA manifest — short TTL so icon / name changes reach installed apps
    // quickly, but with stale-while-revalidate so it never blocks.
    test:    p => p === '/manifest.json',
    control: 'public, max-age=3600, stale-while-revalidate=86400',
    edge:    false,
  },
  {
    // Default for any unlisted static file.
    test:    () => true,
    control: 'public, max-age=86400, stale-while-revalidate=604800',
    edge:    false,
  },
];

// ── Security headers ──────────────────────────────────────────────────────────

const SECURITY_HEADERS = {
  // Force HTTPS for 1 year; include subdomains; opt into browser preload list.
  'Strict-Transport-Security':  'max-age=31536000; includeSubDomains; preload',

  // Prevent MIME-type sniffing (stops browsers treating JS as HTML etc.)
  'X-Content-Type-Options':     'nosniff',

  // Deny framing — no legitimate reason to embed this app in an iframe.
  'X-Frame-Options':            'DENY',

  // Send only the origin (no path) on cross-origin navigations.
  'Referrer-Policy':            'strict-origin-when-cross-origin',

  // Disable browser features the app never needs.
  'Permissions-Policy':         'camera=(), microphone=(), geolocation=(), payment=(), usb=()',

  // Prevent opener access from cross-origin windows (Spectre mitigation).
  'Cross-Origin-Opener-Policy': 'same-origin',

  // Content Security Policy
  //   script-src 'self'        — ES modules from same origin only
  //   style-src  'unsafe-inline' — JS-generated HTML uses inline style attrs;
  //                               no external stylesheets are loaded
  //   media-src 'self'         — Web Audio API (no external audio)
  //   worker-src 'self'        — future PWA service-worker scope
  //   upgrade-insecure-requests — rewrite any accidental http:// sub-resources
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "media-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '),
};

// ── Resource hints pushed with the HTML root (Early Hint–style Link header) ──

const ROOT_LINK_HEADER = [
  '</style.css>; rel=preload; as=style',
  '</js/app.js>; rel=modulepreload',
].join(', ');

// ── Request handler ───────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {

    // Reject methods the app never expects.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status:  405,
        headers: { Allow: 'GET, HEAD' },
      });
    }

    const url  = new URL(request.url);
    const path = url.pathname;
    const rule = CACHE_RULES.find(r => r.test(path));

    // ── Edge cache lookup for immutable assets ────────────────────────────────
    if (rule.edge) {
      const cache    = caches.default;
      const cacheKey = new Request(url.toString(), { method: 'GET' });
      const hit      = await cache.match(cacheKey);

      if (hit) {
        // Re-apply security headers on cache hits (headers are not persisted
        // in the Workers Cache API between deployments).
        const headers = new Headers(hit.headers);
        applySecurityHeaders(headers);
        return new Response(hit.body, {
          status:     hit.status,
          statusText: hit.statusText,
          headers,
        });
      }
    }

    // ── Fetch from Workers Assets ─────────────────────────────────────────────
    let asset;
    try {
      asset = await env.ASSETS.fetch(request);
    } catch {
      return new Response('Service Unavailable', { status: 503 });
    }

    // ── Build the optimised response ──────────────────────────────────────────
    const headers = new Headers(asset.headers);

    headers.set('Cache-Control', rule.control);
    applySecurityHeaders(headers);

    // Push preload hints with the root HTML to eliminate render-blocking.
    if (path === '/' || path === '/index.html') {
      headers.set('Link', ROOT_LINK_HEADER);
    }

    const response = new Response(asset.body, {
      status:     asset.status,
      statusText: asset.statusText,
      headers,
    });

    // ── Populate edge cache (non-blocking) ────────────────────────────────────
    if (rule.edge && asset.ok) {
      const cache    = caches.default;
      const cacheKey = new Request(url.toString(), { method: 'GET' });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Apply every security header to a mutable Headers object. */
function applySecurityHeaders(headers) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
}
