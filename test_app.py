import os
import json
import unittest

class TestRapidRecallApp(unittest.TestCase):
    def setUp(self):
        self.app_dir = os.path.dirname(os.path.abspath(__file__))
        self.db_dir = os.path.join(self.app_dir, 'database')

    def test_database_files_exist(self):
        manifest_path = os.path.join(self.db_dir, 'manifest.json')
        self.assertTrue(os.path.exists(manifest_path), "manifest.json must exist")
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        self.assertGreaterEqual(len(manifest), 3, "At least 3 chapters in manifest")
        
        for ch in manifest:
            filepath = os.path.join(self.db_dir, ch['filename'])
            self.assertTrue(os.path.exists(filepath), f"File {ch['filename']} must exist")
            with open(filepath, 'r', encoding='utf-8') as f:
                items = json.load(f)
            self.assertEqual(len(items), ch['count'], f"Item count mismatch in {ch['filename']}")
            
            # Check fields
            for item in items:
                self.assertIn('question', item)
                self.assertIn('answer', item)
                self.assertIn('explanation_bn', item)
                self.assertTrue(len(item['question']) > 0)
                self.assertTrue(len(item['answer']) > 0)
                self.assertTrue(len(item['explanation_bn']) > 0)

    def test_frontend_assets_exist(self):
        index_path = os.path.join(self.app_dir, 'index.html')
        css_path = os.path.join(self.app_dir, 'css', 'app.css')
        app_js = os.path.join(self.app_dir, 'js', 'app.js')
        storage_js = os.path.join(self.app_dir, 'js', 'storage.js')
        mcq_js = os.path.join(self.app_dir, 'js', 'mcq.js')
        swipe_js = os.path.join(self.app_dir, 'js', 'swipe.js')
        
        self.assertTrue(os.path.exists(index_path))
        self.assertTrue(os.path.exists(css_path))
        self.assertTrue(os.path.exists(app_js))
        self.assertTrue(os.path.exists(storage_js))
        self.assertTrue(os.path.exists(mcq_js))
        self.assertTrue(os.path.exists(swipe_js))

    def test_search_frontend_elements(self):
        js_path = os.path.join(self.app_dir, 'js', 'app.js')
        css_path = os.path.join(self.app_dir, 'css', 'app.css')
        with open(js_path, 'r', encoding='utf-8') as f:
            js_content = f.read()
        with open(css_path, 'r', encoding='utf-8') as f:
            css_content = f.read()

        # Check that search bar elements exist in JS
        self.assertIn('home-search-input', js_content, "Search input element must exist in app.js")
        self.assertIn('home-search-clear-btn', js_content, "Search clear button must exist in app.js")
        self.assertIn('renderHomeSearchResults', js_content, "renderHomeSearchResults method must exist")
        self.assertIn('highlightMatch', js_content, "highlightMatch method must exist")
        self.assertIn('search-filter-chip', js_content, "Chapter filter chips must exist")

        # Check that search styles exist in CSS
        self.assertIn('.home-search-box', css_content, ".home-search-box CSS class must exist")
        self.assertIn('.home-search-input', css_content, ".home-search-input CSS class must exist")
        self.assertIn('.search-highlight', css_content, ".search-highlight CSS class must exist")
        self.assertIn('.search-result-card', css_content, ".search-result-card CSS class must exist")

    def test_search_query_matching(self):
        manifest_path = os.path.join(self.db_dir, 'manifest.json')
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        
        all_questions = []
        for ch in manifest:
            filepath = os.path.join(self.db_dir, ch['filename'])
            with open(filepath, 'r', encoding='utf-8') as f:
                items = json.load(f)
                for it in items:
                    it['chapterTitle'] = ch['title']
                    all_questions.append(it)

        # Search for known medical terms
        def search(query):
            tokens = query.lower().split()
            matches = []
            for q in all_questions:
                blob = " ".join([q.get('question', ''), q.get('answer', ''), q.get('explanation_bn', ''), q.get('topic', ''), q.get('chapterTitle', '')]).lower()
                if all(t in blob for t in tokens):
                    matches.append(q)
            return matches

        self.assertGreater(len(search('angina')), 0, "Search for 'angina' should yield results")
        self.assertGreater(len(search('stroke')), 0, "Search for 'stroke' should yield results")
        self.assertGreater(len(search('asthma')), 0, "Search for 'asthma' should yield results")
        self.assertGreater(len(search('হৃদরোগ')), 0, "Search for Bengali keyword 'হৃদরোগ' should yield results")

if __name__ == '__main__':
    unittest.main()
