"""Check COLR layers for Honk font."""
from fontTools.ttLib import TTFont
from fontTools.colorLib.builder import build_COLR

font = TTFont('/home/blackpi/ai-news-webapp/Honk.ttf')

# Access COLR table
colr = font['COLR']
print("COLR version:", colr.version)

# Access the color layers differently based on version
if colr.version == 0:
    print("Version 0 - using BaseGlyphRecord")
    if hasattr(colr, 'table'):
        t = colr.table
        if hasattr(t, 'BaseGlyphRecord'):
            for rec in t.BaseGlyphRecord.BaseGlyphRecord:
                if rec.BaseGlyph in [b'P', b'i', b'k', b'A', b'I']:
                    print(f"  {rec.BaseGlyph}: first_layer={rec.FirstLayerIndex}, num_layers={rec.NumLayers}")
        if hasattr(t, 'LayerRecord'):
            print(f"  Total layer records: {len(t.LayerRecord.LayerRecord)}")
            for i, lr in enumerate(t.LayerRecord.LayerRecord[:20]):
                print(f"    Layer {i}: glyph={lr.Glyph}, palette={lr.PaletteIndex}")
elif colr.version == 1:
    print("Version 1")
    # Access via BaseGlyphList / LayerList

# Also let's try to render each layer separately using getGlyphSet
gs = font.getGlyphSet()
cmap = font.getBestCmap()

print("\n=== GlyphSet keys for layers ===")
# Print all available glyph names
glyph_names = list(gs.keys())
# Find relevant ones
for name in glyph_names:
    if any(prefix in name for prefix in [b'P', b'i', b'k', b'A', b'I']):
        print(f"  {name}")
    elif name in ['P', 'i', 'k', 'A', 'I']:
        print(f"  {name} (direct)")
