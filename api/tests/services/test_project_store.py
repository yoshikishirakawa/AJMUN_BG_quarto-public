"""
Unit tests for Project Store Service
"""
import pytest
import json
import asyncio
from pathlib import Path
from datetime import datetime
from services.project_store import ProjectStore, ChapterType


@pytest.fixture
def temp_project_dir(tmp_path):
    """Create a temporary project directory."""
    project_dir = tmp_path / "test_project"
    project_dir.mkdir()
    return project_dir


@pytest.fixture
def project_store(temp_project_dir, monkeypatch):
    """Create a ProjectStore instance with a temporary project directory."""
    store = ProjectStore()
    monkeypatch.setattr(store, 'project_root', temp_project_dir)
    monkeypatch.setattr(store, 'config_path', temp_project_dir / ".bgproject.json")
    monkeypatch.setattr(store, 'quarto_yml', temp_project_dir / "_quarto.yml")
    return store


@pytest.fixture
def sample_project_data():
    """Sample project data for testing."""
    return {
        "version": "1.0",
        "metadata": {
            "name": "Test Project",
            "author": "Test Author",
            "date": "2024-01-01",
            "description": "Test description"
        },
        "chapters": [
            {
                "id": "ch_001",
                "title": "Chapter 1",
                "googleDocId": None,
                "localPath": "content/chapter1.qmd",
                "order": 0,
                "lastSync": None,
                "enabled": True,
                "type": "document",
                "images": []
            },
            {
                "id": "ch_002",
                "title": "Chapter 2",
                "googleDocId": "doc123",
                "localPath": "content/chapter2.qmd",
                "order": 1,
                "lastSync": "2024-01-01T00:00:00Z",
                "enabled": True,
                "type": "document",
                "images": []
            }
        ],
        "style": {
            "primaryColor": "#1a73e8",
            "typography": {
                "fontSize": 16,
                "lineHeight": 1.6
            }
        },
        "buildOptions": {
            "cleanBuild": False,
            "syncBeforeBuild": False
        },
        "lastBuildStatus": None,
        "lastBuildTime": None,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
    }


@pytest.mark.asyncio
async def test_load_when_config_not_exists(project_store, sample_project_data):
    """Test loading when config file doesn't exist (should initialize from quarto.yml)."""
    # Create a basic _quarto.yml
    quarto_yml_content = """
book:
  title: Test Book from Quarto
  author: Test Author
  date: 2024-01-01
  chapters:
    - content/intro.qmd
    - content/chapter1.qmd
"""
    project_store.quarto_yml.write_text(quarto_yml_content)

    # Load should initialize from quarto.yml
    project = await project_store.load()

    assert project["metadata"]["name"] == "Test Book from Quarto"
    assert project["metadata"]["author"] == "Test Author"
    assert len(project["chapters"]) == 2
    assert project["chapters"][0]["localPath"] == "content/intro.qmd"


@pytest.mark.asyncio
async def test_save_and_load_project(project_store, sample_project_data):
    """Test saving and loading project data."""
    await project_store.save(sample_project_data)

    loaded_project = await project_store.load()

    assert loaded_project["metadata"]["name"] == "Test Project"
    assert len(loaded_project["chapters"]) == 2
    assert loaded_project["chapters"][0]["id"] == "ch_001"


@pytest.mark.asyncio
async def test_save_updates_timestamp(project_store, sample_project_data):
    """Test that save updates the updatedAt timestamp."""
    original_time = sample_project_data["updatedAt"]
    await project_store.save(sample_project_data)

    loaded_project = await project_store.load()

    assert loaded_project["updatedAt"] != original_time
    assert loaded_project["updatedAt"].endswith("Z")


@pytest.mark.asyncio
async def test_add_chapter(project_store, sample_project_data):
    """Test adding a new chapter."""
    await project_store.save(sample_project_data)

    new_chapter = {
        "id": "ch_003",
        "title": "New Chapter",
        "googleDocId": None,
        "localPath": "content/chapter3.qmd",
        "order": 2,
        "lastSync": None,
        "enabled": True,
        "type": "document",
        "images": []
    }

    await project_store.add_chapter(new_chapter)

    project = await project_store.load()
    assert len(project["chapters"]) == 3
    assert project["chapters"][2]["id"] == "ch_003"


@pytest.mark.asyncio
async def test_update_metadata(project_store, sample_project_data):
    """Test updating project metadata."""
    await project_store.save(sample_project_data)

    new_metadata = {
        "name": "Updated Project Name",
        "author": "Updated Author"
    }

    await project_store.update_metadata(new_metadata)

    project = await project_store.load()
    assert project["metadata"]["name"] == "Updated Project Name"
    assert project["metadata"]["author"] == "Updated Author"
    assert project["metadata"]["date"] == "2024-01-01"  # Original value preserved


@pytest.mark.asyncio
async def test_update_chapters_order(project_store, sample_project_data):
    """Test updating chapter order."""
    await project_store.save(sample_project_data)

    # Reverse the order
    new_order = ["ch_002", "ch_001"]
    await project_store.update_chapters_order(new_order)

    project = await project_store.load()
    assert project["chapters"][0]["id"] == "ch_002"
    assert project["chapters"][0]["order"] == 0
    assert project["chapters"][1]["id"] == "ch_001"
    assert project["chapters"][1]["order"] == 1


@pytest.mark.asyncio
async def test_get_chapter_content(project_store, sample_project_data, temp_project_dir):
    """Test getting chapter content."""
    await project_store.save(sample_project_data)

    # Create chapter file with content
    chapter_path = temp_project_dir / "content" / "chapter1.qmd"
    chapter_path.parent.mkdir(parents=True, exist_ok=True)
    chapter_path.write_text("# Chapter 1 Content\n\nThis is test content.")

    content = await project_store.get_chapter_content("ch_001")

    assert content == "# Chapter 1 Content\n\nThis is test content."


@pytest.mark.asyncio
async def test_get_chapter_content_not_found(project_store, sample_project_data):
    """Test getting content for non-existent chapter."""
    await project_store.save(sample_project_data)

    content = await project_store.get_chapter_content("nonexistent")

    assert content is None


@pytest.mark.asyncio
async def test_update_chapter_content(project_store, sample_project_data, temp_project_dir):
    """Test updating chapter content."""
    await project_store.save(sample_project_data)

    new_content = "# Updated Content\n\nNew chapter content."

    success = await project_store.update_chapter_content("ch_001", new_content)

    assert success is True

    # Verify content was saved
    content = await project_store.get_chapter_content("ch_001")
    assert content == new_content


@pytest.mark.asyncio
async def test_update_chapter_content_not_found(project_store, sample_project_data):
    """Test updating content for non-existent chapter."""
    await project_store.save(sample_project_data)

    success = await project_store.update_chapter_content("nonexistent", "content")

    assert success is False


@pytest.mark.asyncio
async def test_update_conversion_rules(project_store, sample_project_data):
    """Test updating conversion rules."""
    await project_store.save(sample_project_data)

    rules = [
        {"pattern": "foo", "replacement": "bar"},
        {"pattern": "baz", "replacement": "qux"}
    ]

    await project_store.update_conversion_rules(rules)

    project = await project_store.load()
    assert len(project["conversionRules"]) == 2
    assert project["conversionRules"][0]["pattern"] == "foo"


@pytest.mark.asyncio
async def test_update_build_status(project_store, sample_project_data):
    """Test updating build status."""
    await project_store.save(sample_project_data)

    await project_store.update_build_status("success")

    project = await project_store.load()
    assert project["lastBuildStatus"] == "success"
    assert project["lastBuildTime"] is not None
    assert project["lastBuildTime"].endswith("Z")


@pytest.mark.asyncio
async def test_update_sync_time(project_store, sample_project_data):
    """Test updating sync time."""
    await project_store.save(sample_project_data)

    await project_store.update_sync_time()

    project = await project_store.load()
    assert project["lastSyncTime"] is not None
    assert project["lastSyncTime"].endswith("Z")


@pytest.mark.asyncio
async def test_get_stats(project_store, sample_project_data, temp_project_dir):
    """Test getting project statistics."""
    await project_store.save(sample_project_data)

    # Create chapter files
    for chapter in sample_project_data["chapters"]:
        chapter_path = temp_project_dir / chapter["localPath"]
        chapter_path.parent.mkdir(parents=True, exist_ok=True)
        chapter_path.write_text(f"# {chapter['title']}\n\nTest content with some words.")

    stats = await project_store.get_stats()

    assert "total_words" in stats
    assert "chapters" in stats
    assert len(stats["chapters"]) == 2
    assert stats["chapters"][0]["id"] == "ch_001"


@pytest.mark.asyncio
async def test_get_raw_config(project_store, temp_project_dir):
    """Test getting raw Quarto config."""
    quarto_content = """
book:
  title: Test Book
  chapters:
    - intro.qmd
"""
    project_store.quarto_yml.write_text(quarto_content)

    raw_config = await project_store.get_raw_config()

    assert raw_config == quarto_content


@pytest.mark.asyncio
async def test_get_raw_config_not_exists(project_store):
    """Test getting raw config when file doesn't exist."""
    raw_config = await project_store.get_raw_config()
    assert raw_config == ""


@pytest.mark.asyncio
async def test_update_raw_config(project_store):
    """Test updating raw Quarto config."""
    new_content = """
book:
  title: Updated Book
"""

    await project_store.update_raw_config(new_content)

    raw_config = await project_store.get_raw_config()
    assert raw_config == new_content


@pytest.mark.asyncio
async def test_update_raw_config_rejects_non_mapping(project_store):
    with pytest.raises(ValueError, match="must be a YAML mapping"):
        await project_store.update_raw_config("- item\n")


@pytest.mark.asyncio
async def test_update_raw_config_rejects_invalid_yaml(project_store):
    original_content = "project:\n  type: book\n"
    project_store.quarto_yml.write_text(original_content, encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid YAML"):
        await project_store.update_raw_config("project: [")

    assert project_store.quarto_yml.read_text(encoding="utf-8") == original_content


@pytest.mark.asyncio
async def test_image_group_generation(project_store, sample_project_data, temp_project_dir):
    """Test that image groups generate .qmd files."""
    # Add an image group chapter
    image_group = {
        "id": "img_001",
        "title": "Image Group 1",
        "localPath": "content/images/group1.qmd",
        "order": 2,
        "type": "image_group",
        "images": [
            {"path": "images/img1.png"},
            {"path": "images/img2.png"}
        ],
        "enabled": True
    }

    sample_project_data["chapters"].append(image_group)
    await project_store.save(sample_project_data)

    # Check that the .qmd file was generated
    qmd_path = temp_project_dir / "content" / "images" / "group1.qmd"
    assert qmd_path.exists()

    content = qmd_path.read_text()
    assert "![](/images/img1.png){width=100%}" in content
    assert "![](/images/img2.png){width=100%}" in content
    assert "\\clearpage" in content


@pytest.mark.asyncio
async def test_image_group_with_no_images(project_store, sample_project_data, temp_project_dir):
    """Test image group with no images."""
    image_group = {
        "id": "img_001",
        "title": "Empty Image Group",
        "localPath": "content/images/empty.qmd",
        "order": 2,
        "type": "image_group",
        "images": [],
        "enabled": True
    }

    sample_project_data["chapters"].append(image_group)
    await project_store.save(sample_project_data)

    qmd_path = temp_project_dir / "content" / "images" / "empty.qmd"
    assert qmd_path.exists()

    content = qmd_path.read_text()
    assert "(No images)" in content
