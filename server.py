#!/usr/bin/env python3
import os
import json
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def update_manifest():
    db_dir = os.path.join(DIRECTORY, 'database')
    if not os.path.exists(db_dir):
        return

    manifest = []
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
                manifest.append({
                    'id': clean_name,
                    'filename': filename,
                    'title': title,
                    'count': len(items),
                    'topics': topics
                })
            except Exception as e:
                print(f"Warning: Could not parse {filename}: {e}")

    with open(os.path.join(db_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"✓ Manifest updated: {len(manifest)} chapter(s) ready.")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and disable aggressive caching for dev/study
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    update_manifest()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"\n=======================================================")
        print(f"🩺 Medical Quick Recap Web App is running!")
        print(f"👉 Local URL: http://localhost:{PORT}")
        print(f"👉 Network:   http://127.0.0.1:{PORT}")
        print(f"=======================================================\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
