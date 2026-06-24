from typing import Tuple, Optional
import yaml


def validate_yaml(content: str) -> Tuple[bool, Optional[str]]:
    """Validate YAML syntax.

    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str]).
        error_message is None when valid, contains details when invalid.
    """
    if not content or not content.strip():
        return False, "YAML content is empty"

    try:
        yaml.safe_load(content)
        return True, None
    except yaml.YAMLError as e:
        if hasattr(e, 'problem_mark'):
            mark = e.problem_mark
            msg = f"YAML syntax error at line {mark.line + 1}, column {mark.column + 1}"
            if e.problem:
                msg += f": {e.problem}"
            return False, msg
        return False, f"YAML parse error: {str(e)}"
