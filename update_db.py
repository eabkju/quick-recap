#!/usr/bin/env python3
"""
Sync Script for Medical Quick Recap
Auto-detects any new or modified JSON files in database/,
categorizes them into Mother Topics & Curriculum Parts,
rebuilds database/manifest.json & database/curriculum.json,
updates sw.js offline cache, and optionally commits and pushes to GitHub.
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

# Define Curriculum Hierarchy
CURRICULUM = {
    "parts": [
        {
            "id": "clinical",
            "title": "Clinical Part",
            "icon": "🩺",
            "mother_topics": [
                {
                    "id": "medicine",
                    "title": "Medicine",
                    "icon": "💊",
                    "description": "Internal Medicine & Super-specialties (Cardio, Neuro, Nephro, etc.)"
                },
                {
                    "id": "surgery",
                    "title": "Surgery",
                    "icon": "✂️",
                    "description": "General Surgery, Orthopedics, Urology, Surgical Principles"
                },
                {
                    "id": "gyne_obs",
                    "title": "Gyne & Obs",
                    "icon": "👶",
                    "description": "Obstetrics & Gynaecology, Maternal-Fetal Medicine"
                }
            ]
        },
        {
            "id": "para_clinical",
            "title": "Para Clinical Part",
            "icon": "🔬",
            "mother_topics": [
                {
                    "id": "anatomy",
                    "title": "Anatomy",
                    "icon": "🦴",
                    "description": "Gross Anatomy, Histology, Embryology & Neuroanatomy"
                },
                {
                    "id": "physiology",
                    "title": "Physiology",
                    "icon": "⚡",
                    "description": "Systemic Human Physiology & Homeostasis"
                },
                {
                    "id": "biochemistry",
                    "title": "Biochemistry",
                    "icon": "🧬",
                    "description": "Metabolism, Enzymes, Molecular Biology & Genetics"
                },
                {
                    "id": "pharmacology",
                    "title": "Pharmacology",
                    "icon": "💊",
                    "description": "General Principles, ANS, CNS, Antimicrobials & Chemotherapy"
                },
                {
                    "id": "forensic_toxicology",
                    "title": "Forensic & Toxicology",
                    "icon": "⚖️",
                    "description": "Forensic Medicine, Medical Jurisprudence & Toxicology"
                },
                {
                    "id": "community_medicine",
                    "title": "Community Medicine",
                    "icon": "🏥",
                    "description": "Public Health, Epidemiology, Biostatistics & Healthcare"
                },
                {
                    "id": "pathology",
                    "title": "Pathology",
                    "icon": "🔬",
                    "description": "General Pathology, Hematology, Systemic & Clinical Pathology"
                },
                {
                    "id": "microbiology",
                    "title": "Microbiology",
                    "icon": "🦠",
                    "description": "Bacteriology, Virology, Mycology, Parasitology & Immunology"
                }
            ]
        }
    ]
}

# Lookup helpers
MOTHER_TOPIC_LOOKUP = {}
for p in CURRICULUM["parts"]:
    for mt in p["mother_topics"]:
        MOTHER_TOPIC_LOOKUP[mt["id"]] = {
            "part": p["id"],
            "part_title": p["title"],
            "mother_topic": mt["id"],
            "mother_title": mt["title"],
            "icon": mt["icon"]
        }

def classify_file(filename, items):
    """Classifies a JSON file into its Part and Mother Topic."""
    # Check if items contain an explicit mother_topic tag
    if isinstance(items, list) and items:
        explicit_mt = items[0].get('mother_topic') or items[0].get('subject')
        if explicit_mt and explicit_mt.lower() in MOTHER_TOPIC_LOOKUP:
            return MOTHER_TOPIC_LOOKUP[explicit_mt.lower()]

    fname = filename.lower()
    
    # Prefix / Keyword matching for other subjects
    if 'surgery' in fname:
        return MOTHER_TOPIC_LOOKUP['surgery']
    if any(k in fname for k in ['gyne', 'obs', 'gynae', 'obstetric']):
        return MOTHER_TOPIC_LOOKUP['gyne_obs']
    if 'anatomy' in fname:
        return MOTHER_TOPIC_LOOKUP['anatomy']
    if 'physiology' in fname:
        return MOTHER_TOPIC_LOOKUP['physiology']
    if 'biochem' in fname:
        return MOTHER_TOPIC_LOOKUP['biochemistry']
    if 'pharmacol' in fname:
        return MOTHER_TOPIC_LOOKUP['pharmacology']
    if 'forensic' in fname:
        return MOTHER_TOPIC_LOOKUP['forensic_toxicology']
    if any(k in fname for k in ['community', 'psm', 'spm']):
        return MOTHER_TOPIC_LOOKUP['community_medicine']
    if 'pathology' in fname:
        return MOTHER_TOPIC_LOOKUP['pathology']
    if 'microbiology' in fname:
        return MOTHER_TOPIC_LOOKUP['microbiology']

    # Default: All current 17 topics (Cardiology, Dermatology, Endocrinology, Envenomation,
    # Environmental Medicine, Gastroenterology, Geriatrics, Haematology, Immunology,
    # Infectious Diseases, Nephrology, Neurology, Nutrition, Psychiatry, Respiratory,
    # Rheumatology, Toxicology) belong to Medicine!
    return MOTHER_TOPIC_LOOKUP['medicine']

# 1. Update manifest.json & curriculum.json
manifest = []
db_files = []
total_questions = 0

for filename in sorted(os.listdir(db_dir)):
    if filename.endswith('.json') and filename not in ['manifest.json', 'curriculum.json']:
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

            cat_info = classify_file(filename, items)

            manifest.append({
                'id': clean_name,
                'filename': filename,
                'title': title,
                'count': count,
                'topics': topics,
                'part': cat_info['part'],
                'part_title': cat_info['part_title'],
                'mother_topic': cat_info['mother_topic'],
                'mother_title': cat_info['mother_title']
            })
            db_files.append(f"  './database/{filename}'")
        except Exception as e:
            print(f"⚠️  Warning: Could not parse {filename}: {e}")

# Save curriculum.json
with open(os.path.join(db_dir, 'curriculum.json'), 'w', encoding='utf-8') as f:
    json.dump(CURRICULUM, f, ensure_ascii=False, indent=2)

# Save manifest.json
with open(os.path.join(db_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f"✓ Manifest updated: {len(manifest)} topic(s) ready with {total_questions} total questions.")
print(f"✓ Curriculum hierarchy saved: Clinical Part (Medicine: {len(manifest)} topics) & Para Clinical Part (8 subjects).")

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
        "  './database/curriculum.json',\n"
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
        commit_msg = f"data: update database hierarchy ({len(manifest)} topics in Medicine Mother Topic)"
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=DIR, check=False)
        subprocess.run(["git", "push", "origin", "main"], cwd=DIR, check=True)
        print("🚀 Done! GitHub Pages is now deploying your updated database.")
    except Exception as e:
        print(f"⚠️  Git push error: {e}")
