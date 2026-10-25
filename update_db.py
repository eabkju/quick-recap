#!/usr/bin/env python3
"""
Sync Script for Medical Quick Recap
Auto-detects any new or modified JSON files in database/,
rebuilds database/manifest.json, updates sw.js offline cache,
and optionally commits and pushes to GitHub.
"""

import os
import json
import re
import subprocess
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
db_dir = os.path.join(DIR, 'database')
sw_file = os.path.join(DIR, 'sw.js')

if not os.path.exists(db_dir):
    print("Error: database directory not found!")
    sys.exit(1)

# 1. Update manifest.json
manifest = []
db_files = []
total_questions = 0

for filename in sorted(os.listdir(db_dir)):
    if filename.endswith('.json') and filename != 'manifest.json':
        filepath = os.path.join(db_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                items = json.load(f)
            
            clean_name = filename.replace('.json', '')
            title_words = [w.capitalize() for w in clean_name.split('_')]
            title = ' '.join(title_words).replace('Rapid Recall', 'Quick Recap')
            
            topics = list(set(it.get('topic', 'General') for it in items if isinstance(it, dict)))
            count = len(items)
            total_questions += count

            manifest.append({
                'id': clean_name,
                'filename': filename,
                'title': title,
                'count': count,
                'topics': topics
            })
            db_files.append(f"  './database/{filename}'")
        except Exception as e:
            print(f"⚠️  Warning: Could not parse {filename}: {e}")

with open(os.path.join(db_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f"✓ Manifest updated: {len(manifest)} topic(s) ready with {total_questions} total questions.")

# 2. Update Service Worker Cache (sw.js)
if os.path.exists(sw_file):
    with open(sw_file, 'r', encoding='utf-8') as f:
        sw_content = f.read()

    def bump_ver(m):
        prefix, ver = m.group(1), int(m.group(2))
        return f"{prefix}{ver + 1}';"

    sw_content = re.sub(r"(const CACHE_NAME = 'quick-recap-v)(\d+)';", bump_ver, sw_content)

    base_assets = (
        "  './',\n"
        "  './index.html',\n"
        "  './css/app.css',\n"
        "  './js/app.js',\n"
        "  './js/storage.js',\n"
        "  './js/mcq.js',\n"
        "  './js/swipe.js',\n"
        "  './database/manifest.json',\n"
    )
    new_assets = base_assets + ",\n".join(db_files)
    sw_content = re.sub(
        r"const ASSETS_TO_CACHE = \[[^\]]*\];",
        f"const ASSETS_TO_CACHE = [\n{new_assets}\n];",
        sw_content
    )

    with open(sw_file, 'w', encoding='utf-8') as f:
        f.write(sw_content)
    print("✓ Offline cache (sw.js) updated.")

# 3. Git Push if flag provided or if running interactively
auto_push = '--push' in sys.argv or '-p' in sys.argv
if not auto_push and len(sys.argv) == 1:
    # Ask if user wants to push to GitHub
    try:
        reply = input("\nDo you want to commit and push to GitHub right now? [Y/n]: ").strip().lower()
        if reply in ('', 'y', 'yes'):
            auto_push = True
    except EOFError:
        pass

if auto_push:
    print("\n📦 Pushing to GitHub...")
    try:
        subprocess.run(["git", "add", "database/", "sw.js"], cwd=DIR, check=True)
        commit_msg = f"data: update database ({len(manifest)} topics, {total_questions} questions)"
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=DIR, check=False)
        subprocess.run(["git", "push", "origin", "main"], cwd=DIR, check=True)
        print("🚀 Done! GitHub Pages is now deploying your updated database.")
    except Exception as e:
        print(f"⚠️  Git push error: {e}")
