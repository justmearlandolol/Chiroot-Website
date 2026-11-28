import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'scripts' / 'check_static.py'
spec = importlib.util.spec_from_file_location('check_static', MODULE)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class StaticChecksTest(unittest.TestCase):
    def setUp(self):
        checker.ERRORS.clear()

    def test_duplicate_ids_and_missing_assets_are_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            with patch.object(checker, 'ROOT', root):
                page = checker.Page(root / 'Main.html')
                page.feed('<div id="same"></div><div id="same"></div><script src="missing.js"></script>')
                page.validate()
        self.assertTrue(any('duplicate id' in err for err in checker.ERRORS))
        self.assertTrue(any('missing or invalid local asset' in err for err in checker.ERRORS))

    def test_inline_syntax_failure_is_reported(self):
        page = checker.Page(Path('Main.html'))
        page.feed('<script>const = ;</script>')
        self.assertTrue(any('JavaScript syntax error' in err for err in checker.ERRORS))

    def test_json_script_is_not_executed(self):
        page = checker.Page(Path('Main.html'))
        page.feed('<script type="application/ld+json">{"name":"Chiroot"}</script>')
        self.assertEqual(checker.ERRORS, [])


if __name__ == '__main__':
    unittest.main()
