#!/usr/bin/python3
"""
PikAI Feeder - fetch RSS on Pi 5 (no subrequest limit), POST to Worker for AI + OG + KV
Run via cron: */30 * * * * /usr/bin/python3 /home/blackpi/ai-news-webapp/pikai-feeder.py
"""

import feedparser
import json
import re
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import URLError
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import random

WORKER_URL = "https://pikai.isearover.workers.dev/api/ingest"
TOP_N = 100  # Number of articles to process

# Exact copy from worker.js
NEWS_SOURCES = [
    {"name": "MIT Technology Review", "url": "https://www.technologyreview.com/feed/"},
    {"name": "TechRadar", "url": "https://www.techradar.com/rss"},
    {"name": "TechCrunch", "url": "https://techcrunch.com/feed/"},
    {"name": "VentureBeat", "url": "https://venturebeat.com/feed/"},
    {"name": "The Verge", "url": "https://www.theverge.com/rss/frontpage/index.xml"},
    {"name": "Wired", "url": "https://www.wired.com/feed/rss"},
    {"name": "Wired AI", "url": "https://www.wired.com/feed/tag/ai/latest/rss"},
    {"name": "Ars Technica", "url": "https://arstechnica.com/ai/feed/"},
    {"name": "Hugging Face", "url": "https://huggingface.co/blog/feed.xml"},
    {"name": "The Decoder", "url": "https://the-decoder.com/feed/"},
    {"name": "XDA", "url": "https://www.xda-developers.com/feed/"},
    {"name": "GitHub Blog", "url": "https://github.blog/feed/"},
    {"name": "Vercel Blog", "url": "https://vercel.com/atom", "format": "atom"},
    {"name": "Product Hunt", "url": "https://www.producthunt.com/feed", "format": "atom"},
    {"name": "Google AI Blog", "url": "https://blog.google/technology/ai/rss/"},
    {"name": "Kilo Blog", "url": "https://blog.kilo.ai/feed"},
    {"name": "How-To Geek", "url": "https://www.howtogeek.com/feed/"},
    {"name": "ZDNet", "url": "https://www.zdnet.com/news/rss.xml"},
    {"name": "OpenAI", "url": "https://openai.com/news/rss.xml"},
    {"name": "AI News", "url": "https://buttondown.email/ainews/rss"},
    {"name": "One Useful Thing", "url": "https://www.oneusefulthing.org/feed"},
    {"name": "LangChain", "url": "https://blog.langchain.dev/rss.xml"},
    {"name": "Import AI", "url": "https://importai.substack.com/feed"},
    {"name": "MIT News AI", "url": "https://news.mit.edu/rss/topic/artificial-intelligence2"},
    {"name": "VentureBeat AI", "url": "https://venturebeat.com/category/ai/feed/"},
    {"name": "IEEE Spectrum AI", "url": "https://spectrum.ieee.org/rss/topic/artificial-intelligence"},
    {"name": "Towards Data Science", "url": "https://towardsdatascience.com/feed"},
    {"name": "Simon Willison", "url": "https://simonwillison.net/atom/everything/", "format": "atom"},
    {"name": "Lil'Log", "url": "https://lilianweng.github.io/index.xml"},
    {"name": "Interconnects", "url": "https://www.interconnects.ai/feed"},
    {"name": "Semianalysis", "url": "https://semianalysis.com/feed/"},
    {"name": "Ahead of AI", "url": "https://magazine.sebastianraschka.com/feed"},
    {"name": "Not Boring", "url": "https://www.notboring.co/feed"},
    {"name": "Stratechery", "url": "https://stratechery.com/feed/"},
    {"name": "Platformer", "url": "https://www.platformer.news/feed"},
    {"name": "The Algorithm", "url": "https://www.technologyreview.com/topic/artificial-intelligence/rss/"},
    {"name": "IEEE Robotics", "url": "https://spectrum.ieee.org/feeds/topic/robotics.rss"},
    {"name": "Robohub", "url": "https://robohub.org/feed/"},
    {"name": "Robotics & Auto News", "url": "https://www.roboticsandautomationnews.com/feed/"},
    {"name": "ScienceDaily Robotics", "url": "https://www.sciencedaily.com/rss/computers_math/robotics.xml"},
    # Extra sources for volume
    {"name": "Hacker News", "url": "https://hnrss.org/frontpage"},
    {"name": "Hacker News Show", "url": "https://hnrss.org/show"},
    {"name": "Reddit ML", "url": "https://www.reddit.com/r/MachineLearning/.rss"},
    {"name": "Reddit AI", "url": "https://www.reddit.com/r/artificial/.rss"},
    {"name": "Techmeme", "url": "https://www.techmeme.com/feed.xml"},
    {"name": "TNW", "url": "https://thenextweb.com/feed"},
    {"name": "NYT AI", "url": "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"},
    {"name": "Bloomberg", "url": "https://feeds.bloomberg.com/markets/news.rss"},
    {"name": "Engadget", "url": "https://www.engadget.com/rss.xml"},
    {"name": "The Guardian Tech", "url": "https://www.theguardian.com/technology/rss"},
    {"name": "BBC Tech", "url": "https://feeds.bbci.co.uk/news/technology/rss.xml"},
    {"name": "CNBC AI", "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100370673"},
    {"name": "KDnuggets", "url": "https://www.kdnuggets.com/feed"},
    {"name": "FreeCodeCamp AI", "url": "https://www.freecodecamp.org/news/tag/artificial-intelligence/rss/"},
    {"name": "Dev.to AI", "url": "https://dev.to/feed/tag/ai"},
    {"name": "Analytics Vidhya", "url": "https://www.analyticsvidhya.com/blog/feed/"},
    {"name": "Machine Learning Mastery", "url": "https://machinelearningmastery.com/blog/feed/"},
    # AI tutorial / educational sources
    {"name": "BAIR Blog", "url": "https://bair.berkeley.edu/blog/feed.xml"},
    {"name": "PyTorch Blog", "url": "https://pytorch.org/blog/feed/"},
    {"name": "Chip Huyen", "url": "https://huyenchip.com/feed.xml"},
    {"name": "Google Research", "url": "https://research.google/blog/rss/"},
    {"name": "NVIDIA Dev Blog", "url": "https://developer.nvidia.com/blog/feed"},
    {"name": "AWS ML Blog", "url": "https://aws.amazon.com/blogs/machine-learning/feed/"},
    {"name": "Roboflow Blog", "url": "https://blog.roboflow.com/feed/"},
    {"name": "Papers With Code", "url": "https://paperswithcode.com/feed/"},
    {"name": "DataTalks Club", "url": "https://datatalks.club/feed.xml"},
    {"name": "Anyscale Blog", "url": "https://www.anyscale.com/blog/feed"},
    {"name": "Meta Engineering", "url": "https://engineering.fb.com/feed/"},
    {"name": "Gradient Science", "url": "https://gradientscience.org/feed.xml"},
    {"name": "Real Python", "url": "https://realpython.com/atom.xml"},
    {"name": "ML Nuggets", "url": "https://www.machinelearningnuggets.com/feed/"},
]

AI_ONLY_SOURCES = {
    "OpenAI", "AI News", "LangChain", "Import AI", "MIT News AI",
    "VentureBeat AI", "IEEE Spectrum AI", "Towards Data Science",
    "Artificial Intelligence News", "Ars Technica", "Hugging Face",
    "The Decoder", "MarkTechPost", "Google AI Blog", "Kilo Blog",
    "Wired AI", "Semianalysis", "Ahead of AI", "The Algorithm",
    "KDnuggets", "FreeCodeCamp AI", "Dev.to AI", "Analytics Vidhya",
    "Machine Learning Mastery", "IEEE Robotics", "Robohub",
    "Robotics & Auto News", "ScienceDaily Robotics",
    "BAIR Blog", "PyTorch Blog", "Chip Huyen", "Google Research",
    "NVIDIA Dev Blog", "AWS ML Blog", "Roboflow Blog",
    "Papers With Code", "DataTalks Club", "Anyscale Blog",
    "Meta Engineering", "Gradient Science", "Real Python",
    "ML Nuggets"
}

# AI keyword filter - same as worker.js parseRSS
AI_KEYWORDS = [
    r'\bAI\b', r'\bartificial intelligence\b', r'\bLLM\b', r'\blarge language model',
    r'\bmachine learning\b', r'\bdeep learning\b', r'\bneural network',
    r'\bGPT\b', r'\bClaude\b', r'\bGemini\b', r'\bOpenAI\b', r'\bAnthropic\b',
    r'\bChatGPT\b', r'\btransformer\b', r'\bdiffusion\b', r'\bRAG\b',
    r'\bagent\b', r'\brobot\b', r'\bautonomous\b', r'\bself-driving\b',
    r'\bCopilot\b', r'\bCodex\b', r'\bMistral\b', r'\bLlama\b',
    r'\bcomputer vision\b', r'\bNLP\b', r'\bnatural language',
    r'\bgenerative\b', r'\bfine.?tun', r'\bembedding\b',
    r'\bquantiz\w+\b', r'\binference\b', r'\bmultimodal\b',
    r'\btraining\b', r'\bmodel\b', r'\bdataset\b', r'\balgorithm\b',
]

def is_ai_related(title, description, is_ai_only):
    """Check if article is AI-related - mirrors worker.js parseRSS logic"""
    if is_ai_only:
        return True
    text = f"{title} {description or ''}"
    return any(re.search(kw, text, re.IGNORECASE) for kw in AI_KEYWORDS)


def extract_image(entry, source_url):
    """Extract image from RSS entry - mirrors worker.js RSS image parsing"""
    # media:content
    if hasattr(entry, 'media_content') and entry.media_content:
        for mc in entry.media_content:
            url = mc.get('url', '')
            if url:
                return url
    # media:thumbnail
    if hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
        return entry.media_thumbnail[0].get('url', '')
    # enclosures
    if hasattr(entry, 'enclosures') and entry.enclosures:
        for enc in entry.enclosures:
            url = enc.get('href', enc.get('url', ''))
            if url and any(ext in (enc.get('type', '') or '') for ext in ['image', 'jpeg', 'png', 'webp']):
                return url
    # content with images
    if hasattr(entry, 'content') and entry.content:
        for c in entry.content:
            if c.get('type', '').startswith('image'):
                return c.get('value', '')
    # Try to find image in summary HTML
    summary_html = ''
    if hasattr(entry, 'summary'):
        summary_html = entry.summary or ''
    elif hasattr(entry, 'content') and entry.content:
        summary_html = entry.content[0].get('value', '')
    img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', summary_html)
    if img_match:
        src = img_match.group(1)
        if not src.startswith('data:'):
            return src
    return None


def parse_pubdate(entry):
    """Parse publication date from RSS entry"""
    if hasattr(entry, 'published_parsed') and entry.published_parsed:
        import time as _time
        return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
    if hasattr(entry, 'pubDate') and entry.pubDate:
        try:
            return parsedate_to_datetime(entry.pubDate)
        except:
            pass
    return None


def fetch_source(source):
    """Fetch and parse a single RSS source, return list of articles"""
    articles = []
    is_ai_only = source['name'] in AI_ONLY_SOURCES
    
    try:
        req = Request(source['url'], headers={
            'User-Agent': 'Mozilla/5.0 (compatible; PikAI-Feeder/1.0)'
        })
        resp = urlopen(req, timeout=6)
        xml_data = resp.read()
        
        feed = feedparser.parse(xml_data)
        
        for entry in feed.entries[:50]:  # Read up to 50 entries per source
            title = entry.get('title', '').strip()
            if not title:
                continue
            
            # Description/summary
            desc = ''
            if hasattr(entry, 'summary'):
                # Strip HTML tags from summary
                desc = re.sub(r'<[^>]+>', '', entry.summary or '').strip()
            elif hasattr(entry, 'description'):
                desc = re.sub(r'<[^>]+>', '', entry.description or '').strip()
            desc = desc[:1000]
            
            # URL
            article_url = entry.get('link', '')
            if not article_url:
                continue
            
            # Check AI relevance
            if not is_ai_related(title, desc, is_ai_only):
                continue
            
            # Image from RSS - skip for Techmeme (tiny 140x74 thumbnails,
            # Worker will fetch high-res OG image from Techmeme page instead)
            image = '' if source['name'] == 'Techmeme' else extract_image(entry, source['url'])
            
            # Publication date
            pub_date = parse_pubdate(entry)
            pub_date_str = pub_date.isoformat() if pub_date else datetime.now(timezone.utc).isoformat()
            
            articles.append({
                'title': title,
                'url': article_url,
                'summary': desc,
                'source': source['name'],
                'pubDate': pub_date_str,
                'ogImage': image or '',
            })
            
            # Cap per source to 5 articles to ensure diversity
            if len(articles) >= 5:
                break
        
        print(f"  {source['name']}: {len(feed.entries)} raw, {len(articles)} AI-filtered", flush=True)
        
    except Exception as e:
        print(f"  {source['name']}: ERROR - {e}", flush=True)
    
    return articles


def dedup_articles(articles):
    """Deduplicate articles by URL and similar title"""
    seen_urls = set()
    seen_titles = {}
    deduped = []
    
    # Sort by pubDate descending
    articles.sort(key=lambda a: a.get('pubDate', ''), reverse=True)
    
    for article in articles:
        # URL dedup
        url = article['url']
        if url in seen_urls:
            continue
        seen_urls.add(url)
        
        # Title similarity dedup
        title_normalized = re.sub(r'[^\u4e00-\u9fa5a-z0-9]', '', article['title'].lower())[:30]
        if title_normalized and len(title_normalized) > 5:
            if title_normalized in seen_titles:
                continue
            seen_titles[title_normalized] = True
        
        # Filter by age (24h)
        pub_date = article.get('pubDate', '')
        if pub_date:
            try:
                dt = datetime.fromisoformat(pub_date.replace('Z', '+00:00'))
                if (datetime.now(timezone.utc) - dt).total_seconds() > 86400:  # 24h
                    continue
            except:
                pass
        
        deduped.append(article)
    
    return deduped


def main():
    print(f"[PikAI Feeder] Starting fetch at {datetime.now().isoformat()}", flush=True)
    print(f"[PikAI Feeder] Sources: {len(NEWS_SOURCES)}", flush=True)
    
    start = time.time()
    all_articles = []
    lock = threading.Lock()
    
    # Parallel fetch all sources (10 workers at a time)
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_source, source): source['name'] for source in NEWS_SOURCES}
        for future in as_completed(futures):
            source_name = futures[future]
            try:
                articles = future.result()
                with lock:
                    all_articles.extend(articles)
            except Exception as e:
                print(f"  {source_name}: EXCEPTION - {e}", flush=True)
    
    print(f"\n[PikAI Feeder] Total raw: {len(all_articles)}", flush=True)
    
    # Dedup
    deduped = dedup_articles(all_articles)
    print(f"[PikAI Feeder] After dedup: {len(deduped)}", flush=True)
    
    # Shuffle to mix sources (not grouped by source)
    random.shuffle(deduped)
    
    # Cap at TOP_N
    to_send = deduped[:TOP_N]
    print(f"[PikAI Feeder] Sending top {len(to_send)} articles to Worker", flush=True)
    
    # POST to Worker
    payload = json.dumps({
        'articles': to_send,
        'topN': TOP_N,
    }).encode('utf-8')
    
    req = Request(WORKER_URL, data=payload, headers={
        'Content-Type': 'application/json',
        'User-Agent': 'PikAI-Feeder/1.0',
    })
    
    try:
        resp = urlopen(req, timeout=180)
        result = json.loads(resp.read().decode('utf-8'))
        
        elapsed = time.time() - start
        print(f"\n[PikAI Feeder] Done in {elapsed:.1f}s", flush=True)
        print(f"  Articles: {result.get('articlesProcessed', '?')}", flush=True)
        print(f"  Summarized: {result.get('summarizedCount', '?')}", flush=True)
        print(f"  OG fetches: {result.get('ogFetches', '?')}", flush=True)
        print(f"  KV written: {result.get('kvWritten', '?')}", flush=True)
        
        if result.get('success'):
            print("\n✅ Success!", flush=True)
            return 0
        else:
            print(f"\n❌ Worker error: {result}", flush=True)
            return 1
            
    except URLError as e:
        print(f"\n❌ Failed to POST to Worker: {e}", flush=True)
        return 1
    except json.JSONDecodeError as e:
        print(f"\n❌ Invalid response from Worker: {e}", flush=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
