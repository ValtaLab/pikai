#!/usr/bin/env python3
"""Generate Honk-based SVG logo with solid colors (no gradient)."""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

font = TTFont('/home/blackpi/ai-news-webapp/Honk.ttf')
cmap = font.getBestCmap()
upem = font['head'].unitsPerEm  # 2000

def get_glyph_path(char):
    glyph_name = cmap[ord(char)]
    pen = SVGPathPen(font.getGlyphSet())
    font.getGlyphSet()[glyph_name].draw(pen)
    return pen.getCommands(), font['hmtx'][glyph_name][0]

def collect_paths(text, x_offset, y_offset=0, scale=1.0):
    """Collect SVG paths for each character in text, positioned at x_offset."""
    paths = []
    x = x_offset
    for char in text:
        char_path, adv_width = get_glyph_path(char)
        paths.append({
            'char': char,
            'path': char_path,
            'x': x,
            'adv_width': adv_width * scale
        })
        x += adv_width * scale
    return paths, x

# ── Horizontal Logo (for page header) ──
# Scale so total sits in ~260px viewport
pik_paths, pik_end = collect_paths("Pik", 0, 0, 1.0)
ai_paths, ai_end = collect_paths("AI", 0, 0, 1.0)
total_width = pik_end + 200 + ai_end
scale_h = 200 / upem  # scale to fit
logo_h = int(total_width * scale_h)

# Generate inline SVG for page
svg_parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {logo_h} 72" class="logo-svg" style="display:inline-block;vertical-align:middle;height:56px">']

# Pik - dark color
for p in pik_paths:
    svg_parts.append(f'<path d="{p["path"]}" fill="#0f172a" transform="translate({p["x"] * scale_h}, 10) scale({scale_h})"/>')

# Divider
div_x = pik_end * scale_h
svg_parts.append(f'<line x1="{div_x}" y1="18" x2="{div_x}" y2="60" stroke="#94a3b8" stroke-width="1.5" opacity="0.4"/>')

# AI - blue
for p in ai_paths:
    svg_parts.append(f'<path d="{p["path"]}" fill="#0ea5e9" transform="translate({(pik_end + 200 + p["x"]) * scale_h}, 10) scale({scale_h})"/>')

svg_parts.append('</svg>')
horizontal_svg = '\n'.join(svg_parts)

with open('/home/blackpi/ai-news-webapp/logo-horizontal.svg', 'w') as f:
    f.write(horizontal_svg)
print("✅ logo-horizontal.svg created")

# ── Square Favicon / App Icon (512x512) ──
# Stack Pik on top of AI
pik_w = 1060 * 2 + 542  # P + i + k
ai_w = 1060 + 542       # A + I
max_w = max(pik_w, ai_w)  # ~2662

icon_size = 512
scale_i = icon_size / (max_w * 1.15)

# Center Pik and AI vertically stacked
pik_y = (font['hhea'].ascent - 1172) / 2  # center Pik glyph
ai_y = pik_y  # same baseline

svg_icon = [
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {icon_size} {icon_size}">',
    # Dark rounded square background
    f'<rect width="{icon_size}" height="{icon_size}" rx="{icon_size * 0.1875}" fill="#0f172a"/>',
]

# Pik - white on dark bg
x_pik = (icon_size - pik_w * scale_i) / 2
for p in pik_paths:
    svg_icon.append(
        f'<path d="{p["path"]}" fill="#ffffff" '
        f'transform="translate({x_pik + p["x"] * scale_i}, {(icon_size/2 - 60) * scale_i}) scale({scale_i})"/>'
    )

# Divider line
svg_icon.append(
    f'<line x1="{icon_size * 0.15}" y1="{icon_size * 0.5}" '
    f'x2="{icon_size * 0.85}" y2="{icon_size * 0.5}" '
    f'stroke="#94a3b8" stroke-width="{2 * scale_i}" opacity="0.3"/>'
)

# AI - blue accent
x_ai = (icon_size - ai_w * scale_i) / 2
for p in ai_paths:
    svg_icon.append(
        f'<path d="{p["path"]}" fill="#0ea5e9" '
        f'transform="translate({x_ai + p["x"] * scale_i}, {(icon_size/2 + 60) * scale_i}) scale({scale_i})"/>'
    )

svg_icon.append('</svg>')
icon_svg = '\n'.join(svg_icon)

with open('/home/blackpi/ai-news-webapp/favicon.svg', 'w') as f:
    f.write(icon_svg)
print("✅ favicon.svg created")

# Print also the corrected horizontal SVG for inline use in worker.js
print("\n=== HORIZONTAL SVG (for worker.js) ===")
print(horizontal_svg)
