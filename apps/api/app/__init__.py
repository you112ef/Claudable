# Inject vendor path for optional, vendored dependencies (e.g., claude_code_sdk)
import os as _os
import sys as _sys
_VENDOR_DIR = _os.path.join(_os.path.dirname(__file__), 'vendor')
if _os.path.isdir(_VENDOR_DIR) and _VENDOR_DIR not in _sys.path:
    _sys.path.insert(0, _VENDOR_DIR)
    _os.environ.setdefault('CLAUDABLE_VENDOR_ENABLED', '1')
