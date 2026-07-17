"""Tests for ALLOWED_TAGS in ansible_service."""
from app.services.ansible_service import ALLOWED_TAGS


class TestAllowedTags:

    def test_edge_pack_list_is_allowed(self):
        assert "edge_pack_list" in ALLOWED_TAGS
