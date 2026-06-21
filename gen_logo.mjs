import opentype from 'opentype.js';
import fs from 'fs';

const fontData = fs.readFileSync('./Honk.ttf');
const font = opentype.parse(fontData);
const upem = font.unitsPerEm;

function getGlyphPath(char, size) {
    const glyph = font.charToGlyph(char);
    const path = glyph.getPath(0, 0, size);
    return { path: path.toSVG(), advance: glyph.advanceWidth * size / upem };
}

// ── Horizontal Logo ──
// Render "Pik" and "AI" at 1000 units font size
const fontSize = 1000;
const pikChars = 'Pik'.split('').map(c => getGlyphPath(c, fontSize));
const aiChars = 'AI'.split('').map(c => getGlyphPath(c, fontSize));

// Calculate total widths
const pikWidth = pikChars.reduce((s, c) => s + c.advance, 0);
const aiWidth = aiChars.reduce((s, c) => s + c.advance, 0);
const gap = 140; // gap between Pik and divider + divider + gap
const dividerGap = 60;
const totalWidth = pikWidth + gap + aiWidth;

// Scale to fit in a nice viewBox
const targetHeight = 120;
const scale = targetHeight / fontSize;

const svgW = Math.round(totalWidth * scale + 40);
const svgH = Math.round(fontSize * scale + 30);

// Y position: centered, with baseline at proper position
// Font ascender = 1800, descender = -640 (below baseline)
// With fontSize = 1000, the effective ascender = 1000 * (1800/2000) = 900
// The bbox y1=0, y2=1172 means at full font size, glyph goes from y=0 to y=1172 (in font coords)
// In opentype.js SVG output, y=0 at top, positive down
// The baseline in font coords is y=0, which in SVG is y = some offset
// Need to shift the text so it appears centered in the viewBox

// Let's calculate: the visual content spans from y=-1172 to y=0 in standard font coords
// In SVG (opentype.js output): y=baseline ≈ font.ascender * size/upem ≈ 900
// So the content spans roughly from y=(900-1172)=-272 to y=900
// Total visual height ≈ 1172
// Center of content: (900 + (-272))/2 = 314
// We want center of viewBox to be at content center

let logoParts = [];

// Calculate the font-space bounds
const asc = font.ascender * fontSize / upem;
const desc = font.descender * fontSize / upem;
const glyphHeight = 1172 * fontSize / upem; // from bbox
const visualTop = asc - 1172 * fontSize / upem; // top of the tallest glyph
const visualBottom = asc; // baseline for most glyphs

function buildHorizontalSvg() {
    const scale = targetHeight / glyphHeight;
    const h = Math.round(targetHeight + 30);
    const w = Math.round((pikWidth + gap + aiWidth) * scale + 40);
    
    // Center the text vertically
    const contentH = glyphHeight * scale;
    const yOffset = (h - contentH) / 2 + (asc - 1172 * fontSize / upem) * scale + contentH;
    // Actually, let's just position with yOffset so the text sits nicely
    
    // The opentype.js SVG paths have y=0 as baseline, positive y going DOWN
    // After scaling, a point at font-coord y asc (top) becomes... 
    // In opentype's SVG output for getPath(0, 0, size): 
    //   x, y are font coordinates where y increases UP
    //   But SVG path uses y increases DOWN
    //   So opentype flips y: SVG y = some_reference - font_y
    // Let me just position the baselines
    
    let yBaseline = h * 0.78; // position baseline at ~78% of height
    
    let x = 20;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">\n`;
    
    // Pik - dark color
    for (const ch of pikChars) {
        svg += `  <g transform="translate(${x}, ${yBaseline}) scale(${scale})">\n`;
        svg += `    ${ch.path.replace('<path d="', '<path fill="#0f172a" d="')}\n`;
        svg += `  </g>\n`;
        x += ch.advance * scale;
    }
    
    // Divider
    x += 20;
    svg += `  <line x1="${x}" y1="${h * 0.2}" x2="${x}" y2="${h * 0.8}" stroke="#94a3b8" stroke-width="2" opacity="0.4"/>\n`;
    x += 40;
    
    // AI - blue
    for (const ch of aiChars) {
        svg += `  <g transform="translate(${x}, ${yBaseline}) scale(${scale})">\n`;
        svg += `    ${ch.path.replace('<path d="', '<path fill="#0ea5e9" d="')}\n`;
        svg += `  </g>\n`;
        x += ch.advance * scale;
    }
    
    svg += `</svg>`;
    return svg;
}

const hsvg = buildHorizontalSvg();
fs.writeFileSync('/home/blackpi/ai-news-webapp/logo-horizontal.svg', hsvg);
console.log('✅ logo-horizontal.svg');

// ── Square Favicon (stacked) ──
function buildFaviconSvg() {
    const iconSize = 512;
    const padding = 48;
    const innerW = iconSize - padding * 2;
    
    // Scale so the wider line fits
    const maxW = Math.max(pikWidth, aiWidth);
    const contentScale = innerW / (maxW * 1.1);
    
    // Height of each word
    const wordH = glyphHeight * contentScale;
    const totalContentH = wordH * 2 + 40; // two words + gap
    
    // Center vertically
    const yStart = (iconSize - totalContentH) / 2;
    const yBaselinePik = yStart + wordH;
    const yBaselineAi = yStart + wordH * 2 + 40;
    
    // Center horizontally
    const xPik = padding + (innerW - pikWidth * contentScale) / 2;
    const xAi = padding + (innerW - aiWidth * contentScale) / 2;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${iconSize} ${iconSize}">\n`;
    // Background
    svg += `  <rect width="${iconSize}" height="${iconSize}" rx="${iconSize * 0.1875}" fill="#0f172a"/>\n`;
    
    // Pik - white
    let x = xPik;
    for (const ch of pikChars) {
        svg += `  <g transform="translate(${x}, ${yBaselinePik}) scale(${contentScale})">\n`;
        svg += `    ${ch.path.replace('<path d="', '<path fill="#ffffff" d="')}\n`;
        svg += `  </g>\n`;
        x += ch.advance * contentScale;
    }
    
    // Divider line
    const divY = yBaselinePik + 25;
    svg += `  <line x1="${padding * 1.5}" y1="${divY}" x2="${iconSize - padding * 1.5}" y2="${divY}" stroke="#334155" stroke-width="1.5" opacity="0.5"/>\n`;
    
    // AI - blue
    x = xAi;
    for (const ch of aiChars) {
        svg += `  <g transform="translate(${x}, ${yBaselineAi}) scale(${contentScale})">\n`;
        svg += `    ${ch.path.replace('<path d="', '<path fill="#0ea5e9" d="')}\n`;
        svg += `  </g>\n`;
        x += ch.advance * contentScale;
    }
    
    svg += `</svg>`;
    return svg;
}

const favicon = buildFaviconSvg();
fs.writeFileSync('/home/blackpi/ai-news-webapp/favicon.svg', favicon);
console.log('✅ favicon.svg');

// Also generate PNG icons
console.log('Done! Now generating PNG with rsvg-convert...');
