import os
import json
import unittest

class TestRapidRecallApp(unittest.TestCase):
    def setUp(self):
        self.app_dir = '/data/data/com.termux/files/home/rapid-recall-app'
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

if __name__ == '__main__':
    unittest.main()
