"""Check Honk font COLR layers."""
from fontTools.ttLib import TTFont
font = TTFont('/home/blackpi/ai-news-webapp/Honk.ttf')

if 'COLR' in font:
    colr = font['COLR']
    print("COLR version:", colr.version)
    if hasattr(colr, 'ColorLayers'):
        for glyph_name, layers in colr.ColorLayers.items():
            u_name = glyph_name  # assume it's the glyph name
            if glyph_name in ['P', 'i', 'k', 'A', 'I']:
                print(f"\n{glyph_name} has {len(layers)} layers:")
                for i, layer in enumerate(layers):
                    print(f"  Layer {i}: glyph={layer.name}, palette_index={layer.colorID}")

if 'CPAL' in font:
    cpal = font['CPAL']
    print("\nCPAL Palette (first palette):")
    for i, color in enumerate(cpal.palettes[0]):
        r = (color >> 24) & 0xFF
        g = (color >> 16) & 0xFF
        b = (color >> 8) & 0xFF
        a = color & 0xFF
        print(f"  {i}: rgba({r},{g},{b},{a})")
