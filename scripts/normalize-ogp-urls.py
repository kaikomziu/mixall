#!/usr/bin/env python3
"""Normalize Open Graph URLs for MixAll pages at Netlify build time."""
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit
import html
import os
import re
import sys

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
public = root / 'public'
raw_base = (os.environ.get('OGP_SITE_URL') or os.environ.get('URL') or os.environ.get('DEPLOY_PRIME_URL') or 'https://mix-alls.netlify.app').strip().rstrip('/')
parsed_base = urlsplit(raw_base)
if parsed_base.scheme not in ('http', 'https') or not parsed_base.netloc:
    print('Invalid OGP_SITE_URL/URL; using https://mix-alls.netlify.app')
    base = 'https://mix-alls.netlify.app'
else:
    base = f'{parsed_base.scheme}://{parsed_base.netloc}'

patterns = {
    'og:url': re.compile(r'(<meta\s+property=["\']og:url["\']\s+content=["\'])([^"\']+)(["\'])', re.I),
    'og:image': re.compile(r'(<meta\s+property=["\']og:image["\']\s+content=["\'])([^"\']+)(["\'])', re.I),
    'og:image:secure_url': re.compile(r'(<meta\s+property=["\']og:image:secure_url["\']\s+content=["\'])([^"\']+)(["\'])', re.I),
    'twitter:image': re.compile(r'(<meta\s+name=["\']twitter:image["\']\s+content=["\'])([^"\']+)(["\'])', re.I),
}

def canonical_route(rel):
    parts = list(rel.parts)
    if rel.as_posix() == 'index.html':
        return '/'
    if rel.name.lower() == 'index.html':
        directory = '/'.join(parts[:-1])
        return '/' + directory + '/' if directory else '/'
    path_parts = parts[:-1] + [Path(parts[-1]).stem]
    return '/' + '/'.join(path_parts)

def normalized(value, key, rel):
    parsed = urlsplit(value)
    path = parsed.path or '/'
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    # 既存ビルドで絶対URL化されたタグも、デプロイ先の現在URLへ再構成する。
    # 相対パス・同一サイトの絶対URL・旧サイトURLをすべて同じルールで扱う。
    if key == 'og:url':
        path = canonical_route(rel)
        query = {}
    elif path.startswith('/ogp/'):
        query['v'] = '20261012-2'
    return base + path + (('?' + urlencode(query)) if query else '')

# Repair malformed tag boundaries from the previous build-script revision.
repair = re.compile(r'(<meta\s+property=["\']og:image["\']\s+content=["\'][^"\']+["\'])\s*\n(\s*<meta\s+property=["\']og:image:secure_url["\']\s+content=["\'][^"\']+["\'])>>', re.I)
updated = 0
for page in sorted(public.rglob('*.html')):
    rel = page.relative_to(public)
    text = page.read_text(encoding='utf-8')
    old = text
    text = repair.sub(r'\1>\n\2>', text)
    for key, pattern in patterns.items():
        text = pattern.sub(lambda m, k=key, r=rel: m.group(1) + normalized(m.group(2), k, r) + m.group(3), text)
    image = patterns['og:image'].search(text)
    if image and not patterns['og:image:secure_url'].search(text):
        value = html.escape(image.group(2), quote=True)
        tag = f'\n  <meta property="og:image:secure_url" content="{value}">'
        insertion_point = image.end()
        if insertion_point < len(text) and text[insertion_point] == '>':
            insertion_point += 1
        text = text[:insertion_point] + tag + text[insertion_point:]
    # 古い/緊急ページを含め、全HTMLページに完全な共有メタデータを補う。
    fallback_images = {
        'Tools/index.html': '/ogp/14-website-creation.jpg',
        'emergency.html': '/ogp/07-pocket-chat.jpg',
        'emergency-peer.html': '/ogp/07-pocket-chat.jpg',
        'downloads/mixall-emergency.html': '/ogp/07-pocket-chat.jpg',
    }
    def has_tag(name, prop=False):
        attr = 'property' if prop else 'name'
        return re.search(r'<meta\s+' + attr + r'=["\']' + re.escape(name) + r'["\']', text, re.I) is not None
    title_match = re.search(r'<title[^>]*>(.*?)</title>', text, re.I | re.S)
    title = html.unescape(re.sub(r'<[^>]+>', '', title_match.group(1))).strip() if title_match else 'MixAll'
    description_match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']*)["\']', text, re.I)
    description = html.unescape(description_match.group(1)) if description_match else 'MixAllのサービスと便利な機能をご紹介します。'
    extra = []
    if not has_tag('og:title', True): extra.append(f'<meta property="og:title" content="{html.escape(title, quote=True)}">')
    if not has_tag('og:description', True): extra.append(f'<meta property="og:description" content="{html.escape(description, quote=True)}">')
    if not has_tag('og:type', True): extra.append('<meta property="og:type" content="website">')
    if not has_tag('og:url', True): extra.append(f'<meta property="og:url" content="{html.escape(base + canonical_route(rel), quote=True)}">')
    if not has_tag('og:image', True):
        image_path = fallback_images.get(rel.as_posix(), '/ogp/14-website-creation.jpg')
        image_url = f'{base}{image_path}?v=20261012-2'
        extra.extend([f'<meta property="og:image" content="{image_url}">', f'<meta property="og:image:secure_url" content="{image_url}">'])
    else:
        image_match = patterns['og:image'].search(text)
        image_url = image_match.group(2) if image_match else f'{base}/ogp/14-website-creation.jpg?v=20261012-2'
        if not has_tag('og:image:secure_url', True): extra.append(f'<meta property="og:image:secure_url" content="{html.escape(image_url, quote=True)}">')
    if not has_tag('twitter:card'): extra.append('<meta name="twitter:card" content="summary_large_image">')
    if not has_tag('twitter:image'): extra.append(f'<meta name="twitter:image" content="{html.escape(image_url, quote=True)}">')
    if extra:
        head_end = re.search(r'</head\s*>', text, re.I)
        if head_end:
            text = text[:head_end.start()] + '\n  ' + '\n  '.join(extra) + '\n' + text[head_end.start():]
    if text != old:
        page.write_text(text, encoding='utf-8')
        updated += 1
print(f'Normalized absolute OGP URLs for {updated} pages using {base}; image cache version=20261012-2.')
