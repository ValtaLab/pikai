const opentype = require('opentype.js');
const fs = require('fs');

const font = opentype.loadSync('./Honk.ttf');

function getSVGPath(char) {
    const glyph = font.charToGlyph(char);
    const path = glyph.getPath(0, 0, 1000);
    return path.toSVG();
}

// Get metrics
console.log('Font unitsPerEm:', font.unitsPerEm);
console.log('Ascender:', font.ascender);
console.log('Descender:', font.descender);

// Test each character
['P', 'i', 'k', 'A', 'I'].forEach(char => {
    const glyph = font.charToGlyph(char);
    const path = glyph.getPath(0, 0, 1000);
    const advWidth = glyph.advanceWidth;
    const bbox = glyph.getBoundingBox();
    console.log(`\n${char}:`);
    console.log(`  advanceWidth: ${advWidth}`);
    console.log(`  bbox: x1=${bbox.x1}, y1=${bbox.y1}, x2=${bbox.x2}, y2=${bbox.y2}`);
    const svgPath = path.toSVG();
    console.log(`  path length: ${svgPath.length} chars`);
    console.log(`  path: ${svgPath.substring(0, 100)}...`);
    
    // Save individual SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bbox.x1 - 50} ${bbox.y1 - 50} ${bbox.x2 - bbox.x1 + 100} ${bbox.y2 - bbox.y1 + 100}">
  <path d="${svgPath}" fill="#0f172a"/>
</svg>`;
    fs.writeFileSync(`/home/blackpi/ai-news-webapp/op_${char}.svg`, svg);
});
