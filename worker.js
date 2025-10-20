const ORIGIN_URL = 'https://forums.jtechforums.org';

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const targetUrl = new URL(url.pathname + url.search, ORIGIN_URL);

      const headers = new Headers(request.headers);

      // Essential headers for Discourse
      headers.set('Host', new URL(ORIGIN_URL).hostname);
      headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '127.0.0.1');
      headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      headers.set('X-Forwarded-Host', url.hostname);

      // Fix Origin - Discourse checks this for CSRF
      if (headers.has('Origin')) {
        headers.set('Origin', ORIGIN_URL);
      }

      // Fix Referer - Discourse REQUIRES this for login/POST requests
      if (headers.has('Referer')) {
        const referer = headers.get('Referer');
        try {
          const refererUrl = new URL(referer);
          const newReferer = ORIGIN_URL + refererUrl.pathname + refererUrl.search;
          headers.set('Referer', newReferer);
        } catch (e) {
          headers.set('Referer', ORIGIN_URL + '/');
        }
      }

      // For POST requests without referer, add one
      if (request.method === 'POST' && !headers.has('Referer')) {
        headers.set('Referer', ORIGIN_URL + '/');
      }

      // Handle request body - ONLY read it once
      let body = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = request.body;
      }

      // Create proxied request
      const proxiedRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: headers,
        body: body,
        redirect: 'manual'
      });

      // Fetch from origin
      let response = await fetch(proxiedRequest);

      // Clone response to modify it
      const responseHeaders = new Headers(response.headers);

      // Fix redirect locations
      if (responseHeaders.has('Location')) {
        let location = responseHeaders.get('Location');
        location = location.replace(ORIGIN_URL, url.protocol + '//' + url.hostname);
        location = location.replace('forums.jtechforums.org', url.hostname);
        if (location.startsWith('//forums.jtechforums.org')) {
          location = location.replace('//forums.jtechforums.org', '//' + url.hostname);
        }
        responseHeaders.set('Location', location);
      }

      // Fix CSP
      if (responseHeaders.has('Content-Security-Policy')) {
        let csp = responseHeaders.get('Content-Security-Policy');
        csp = csp.replace(/forums\.jtechforums\.org/g, url.hostname);
        responseHeaders.set('Content-Security-Policy', csp);
      }

      // Fix Strict-Transport-Security for HTTP testing
      if (url.protocol === 'http:') {
        responseHeaders.delete('Strict-Transport-Security');
      }

      // Handle cookies - CRITICAL for authentication
      const newCookies = [];

      // Get all Set-Cookie headers
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() === 'set-cookie') {
          let cookie = value;

          // Remove Domain restrictions
          cookie = cookie.replace(/;\s*[Dd]omain=[^;]+/g, '');

          // Fix Secure flag for HTTP
          if (url.protocol === 'http:') {
            cookie = cookie.replace(/;\s*[Ss]ecure/g, '');
          }

          // Ensure proper SameSite
          if (cookie.match(/;\s*[Ss]ame[Ss]ite=[Ss]trict/)) {
            cookie = cookie.replace(/;\s*[Ss]ame[Ss]ite=[Ss]trict/g, '; SameSite=Lax');
          } else if (!cookie.match(/;\s*[Ss]ame[Ss]ite=/)) {
            cookie = cookie + '; SameSite=Lax';
          }

          // Ensure Path is set
          if (!cookie.match(/;\s*[Pp]ath=/)) {
            cookie = cookie + '; Path=/';
          }

          newCookies.push(cookie);
        }
      }

      // Remove old cookies from headers
      responseHeaders.delete('set-cookie');

      // Set CORS headers
      responseHeaders.set('Access-Control-Allow-Origin', url.protocol + '//' + url.hostname);
      responseHeaders.set('Access-Control-Allow-Credentials', 'true');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Discourse-Present, X-CSRF-Token, Discourse-Logged-In, Discourse-Visible');

      // Handle preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: responseHeaders
        });
      }

      const contentType = responseHeaders.get('Content-Type') || '';

      // Rewrite text-based content
      if (contentType.includes('text/html') ||
          contentType.includes('application/json') ||
          contentType.includes('text/css') ||
          contentType.includes('application/javascript') ||
          contentType.includes('text/javascript')) {

        let text = await response.text();

        // Replace all occurrences of the original domain
        text = text.replace(/https:\/\/forums\.jtechforums\.org/g, url.protocol + '//' + url.hostname);
        text = text.replace(/http:\/\/forums\.jtechforums\.org/g, url.protocol + '//' + url.hostname);
        text = text.replace(/\/\/forums\.jtechforums\.org/g, '//' + url.hostname);
        text = text.replace(/"https:\/\/forums\.jtechforums\.org"/g, '"' + url.protocol + '//' + url.hostname + '"');
        text = text.replace(/"http:\/\/forums\.jtechforums\.org"/g, '"' + url.protocol + '//' + url.hostname + '"');
        text = text.replace(/"forums\.jtechforums\.org"/g, '"' + url.hostname + '"');
        text = text.replace(/'forums\.jtechforums\.org'/g, "'" + url.hostname + "'");
        text = text.replace(/wss:\/\/forums\.jtechforums\.org/g, 'wss://' + url.hostname);
        text = text.replace(/ws:\/\/forums\.jtechforums\.org/g, (url.protocol === 'https:' ? 'wss://' : 'ws://') + url.hostname);

        // Also replace in escaped formats (for JSON)
        text = text.replace(/https:\\\/\\\/forums\\.jtechforums\\.org/g, url.protocol.replace(':', '') + ':\\/\\/' + url.hostname.replace(/\./g, '\\.'));

        const finalResponse = new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });

        // Add all cookies
        newCookies.forEach(function(cookie) {
          finalResponse.headers.append('Set-Cookie', cookie);
        });

        return finalResponse;
      }

      // For binary/other content
      const finalResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });

      // Add cookies
      newCookies.forEach(function(cookie) {
        finalResponse.headers.append('Set-Cookie', cookie);
      });

      return finalResponse;

    } catch (error) {
      return new Response('Proxy Error: ' + error.message + '\n\nStack:\n' + error.stack, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
