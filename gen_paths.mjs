import opentype from 'opentype.js';
import fs from 'fs';

const fontData = fs.readFileSync('./Honk.ttf');
const font = opentype.parse(fontData);

console.log('Font unitsPerEm:', font.unitsPerEm);
console.log('Ascender:', font.ascender);
console.log('Descender:', font.descender);

['P', 'i', 'k', 'A', 'I'].forEach(char => {
    const glyph = font.charToGlyph(char);
    const path = glyph.getPath(0, 0, 1000);
    const advWidth = glyph.advanceWidth;
    const svgPath = path.toSVG();
    
    // Adjust scale for 512px base
    const scale = 512 / (advWidth * 1.2);
    
    console.log(`\n${char}:`);
    console.log(`  advanceWidth: ${advWidth}`);
    console.log(`  path length: ${svgPath.length} chars`);
    console.log(`  path: ${svgPath.substring(0, 80)}...`);
    
    // Generate viewBox
    const bbox = glyph.getBoundingBox();
    console.log(`  bbox: ${JSON.stringify(bbox)}`);
});
