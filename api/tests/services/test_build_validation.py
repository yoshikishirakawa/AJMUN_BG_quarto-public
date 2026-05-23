"""
Validation tests for partial build chapter selection.
"""

from __future__ import annotations

import pytest

from api.services.build_runner import BuildRunner


@pytest.fixture
def build_runner():
    return BuildRunner()


@pytest.fixture
def sample_project_data():
    return {
        "chapters": [
            {
                "id": "ch_001",
                "title": "Chapter 1",
                "localPath": "content/chapter1.qmd",
                "enabled": True,
            },
            {
                "id": "ch_002",
                "title": "Chapter 2",
                "localPath": "content/chapter2.qmd",
                "enabled": False,
            },
        ]
    }


def test_resolve_target_chapter_paths_returns_requested_paths(build_runner, sample_project_data):
    paths = build_runner.resolve_target_chapter_paths(sample_project_data, ["ch_001"])

    assert paths == ["content/chapter1.qmd"]


def test_resolve_target_chapter_paths_rejects_unknown_chapters(build_runner, sample_project_data):
    with pytest.raises(ValueError, match="Unknown chapter ids"):
        build_runner.resolve_target_chapter_paths(sample_project_data, ["ch_999"])


def test_resolve_target_chapter_paths_rejects_disabled_chapters(build_runner, sample_project_data):
    with pytest.raises(ValueError, match="Disabled chapters cannot be built"):
        build_runner.resolve_target_chapter_paths(sample_project_data, ["ch_002"])