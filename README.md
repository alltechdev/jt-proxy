# JTech Proxy

A Cloudflare Worker that proxies to forums.jtechforums.org with automatic domain rewriting.

## Features

- **Daily URL Rotation**: Automatically generates a new worker URL every day at midnight UTC
- **Domain Rewriting**: Seamlessly rewrites all references to the original domain
- **Cookie Handling**: Proper cookie management for authentication
- **CORS Support**: Handles cross-origin requests
- **CSRF Protection**: Maintains security headers

## Current URL

Check the [CURRENT_URL.md](./CURRENT_URL.md) file for today's active URL.

## Deployment

This project automatically deploys via GitHub Actions. The workflow:

1. Generates a random 8-character worker name
2. Updates `wrangler.toml` with the new name
3. Deploys to Cloudflare Workers
4. Creates a GitHub release with the new URL
5. Updates `CURRENT_URL.md` with the latest URL

## Custom Domain

To use a custom domain instead of the default `.workers.dev` subdomain:

1. Set up your domain in Cloudflare Dashboard
2. Add the `CUSTOM_DOMAIN` secret to your GitHub repository
3. The workflow will automatically use your custom domain

## Manual Trigger

You can trigger a URL rotation manually:
- Go to Actions → Daily Worker Rotation → Run workflow
- This will generate a new URL immediately

## Authentication

The worker requires:
- `CLOUDFLARE_API_TOKEN` GitHub secret with Workers permissions
- Optional: `CUSTOM_DOMAIN` secret for custom domain usage

## Development

```bash
# Install dependencies
npm install

# Test locally
npx wrangler dev

# Deploy manually
npx wrangler deploy
```

## How It Works

The worker:
1. Receives requests at its URL
2. Forwards them to `forums.jtechforums.org`
3. Rewrites all domain references in headers and content
4. Handles cookies, CORS, and security headers
5. Returns the response with rewritten URLs

This allows seamless browsing of the forum through a constantly changing proxy URL.