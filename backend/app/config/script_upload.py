"""Configuration for script file upload feature.

Defines file size limits, extension whitelist, and storage paths.
"""

import os
from pathlib import Path

# File size limit: 512KB
SCRIPT_MAX_SIZE_BYTES = 512 * 1024

# Allowed script file extensions
SCRIPT_ALLOWED_EXTENSIONS = {".sh", ".bash"}

# Distribute file: 10MB default, no extension whitelist
DISTRIBUTE_MAX_SIZE_BYTES = 10 * 1024 * 1024

# Storage paths
_SCRIPT_STORAGE_DIR = Path(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))) / "data" / "task-scripts"
TEMP_DIR = _SCRIPT_STORAGE_DIR / "temp"
TASK_SCRIPTS_DIR = _SCRIPT_STORAGE_DIR


def get_upload_temp_path(upload_id: str) -> Path:
    """Get the temp file path for an uploaded script."""
    return TEMP_DIR / f"{upload_id}.sh"


def get_task_script_dir(task_id: int) -> Path:
    """Get the script directory for a specific task."""
    return TASK_SCRIPTS_DIR / str(task_id)


def get_task_script_path(task_id: int, filename: str) -> Path:
    """Get the script file path for a specific task."""
    return get_task_script_dir(task_id) / filename


def get_distribute_upload_temp_path(upload_id: str) -> Path:
    """Get the temp file path for an uploaded distribute file (no extension)."""
    return TEMP_DIR / f"{upload_id}"
