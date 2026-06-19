#!/usr/bin/env node
/**
 * fetch-og-image.js
 * 從 URL 列表提取 og:image
 * 用法: node fetch-og-image.js < urls.txt > images.json
 */

const https = require('https');
const http = require('http');

function fetchUrl(url) {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, { timeout: 10000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                // 提取 og:image
                const ogImageMatch = data.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                                     data.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
                if (ogImageMatch) {
                    resolve({ url, image: ogImageMatch[1] });
                } else {
                    resolve({ url, image: null });
                }
            });
        });
        req.on('error', () => resolve({ url, image: null }));
        req.on('timeout', () => { req.destroy(); resolve({ url, image: null }); });
    });
}

async function main() {
    const urls = [];
    for await (const line of process.stdin) {
        const trimmed = line.trim();
        if (trimmed) urls.push(trimmed);
    }
    
    const results = {};
    for (const url of urls) {
        process.stdout.write(`Fetching: ${url}\n`);
        const result = await fetchUrl(url);
        results[url] = result.image;
        // Rate limiting - wait 500ms between requests
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
