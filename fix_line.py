import re

with open('/home/blackpi/ai-news-webapp/worker.js', 'r') as f:
    lines = f.readlines()

# Fix line 2217 (0-indexed: 2216)
# The problematic line has unescaped quotes
lines[2216] = "      html += '<div class=\"summarized-card blog-card\" onclick=\"window.open(\\'' + (post.sourceUrl || \"#\") + \"', '_blank')\">';\n"

with open('/home/blackpi/ai-news-webapp/worker.js', 'w') as f:
    f.writelines(lines)

print("Fixed line 2217")
