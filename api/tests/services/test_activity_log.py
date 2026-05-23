"""
Unit tests for Activity Log Service
"""
import pytest
import json
import asyncio
from pathlib import Path
from datetime import datetime
from services.activity_log import ActivityLogService


@pytest.fixture
def temp_log_file(tmp_path):
    """Create a temporary log file for testing."""
    log_path = tmp_path / ".bgactivity.json"
    return log_path


@pytest.fixture
def activity_log_service(temp_log_file, tmp_path, monkeypatch):
    """Create an ActivityLogService instance with a temporary log file."""
    # Patch the project root to use temp directory
    service = ActivityLogService()
    monkeypatch.setattr(service, 'log_path', temp_log_file)
    monkeypatch.setattr(service, 'project_root', tmp_path)
    return service


@pytest.mark.asyncio
async def test_log_activity(activity_log_service):
    """Test logging an activity."""
    await activity_log_service.log("edit", "Edited chapter 1")

    logs = await activity_log_service.get_recent()
    assert len(logs) == 1
    assert logs[0]["type"] == "edit"
    assert logs[0]["msg"] == "Edited chapter 1"
    assert "time" in logs[0]
    assert "id" in logs[0]


@pytest.mark.asyncio
async def test_log_multiple_activities(activity_log_service):
    """Test logging multiple activities."""
    await activity_log_service.log("edit", "Edited chapter 1")
    await activity_log_service.log("sync", "Synced from Google Docs")
    await activity_log_service.log("build", "Built PDF")

    logs = await activity_log_service.get_recent()
    assert len(logs) == 3
    assert logs[0]["type"] == "build"  # Most recent first
    assert logs[1]["type"] == "sync"
    assert logs[2]["type"] == "edit"


@pytest.mark.asyncio
async def test_log_limit_to_50(activity_log_service):
    """Test that logs are limited to 50 entries."""
    # Log 60 activities
    for i in range(60):
        await activity_log_service.log("test", f"Test activity {i}")

    logs = await activity_log_service.get_recent()
    assert len(logs) == 50  # Should be limited to 50


@pytest.mark.asyncio
async def test_log_with_different_types(activity_log_service):
    """Test logging different activity types."""
    activity_types = ["edit", "sync", "build", "system"]

    for activity_type in activity_types:
        await activity_log_service.log(activity_type, f"{activity_type} activity")

    logs = await activity_log_service.get_recent()
    assert len(logs) == 4

    log_types = [log["type"] for log in logs]
    assert "edit" in log_types
    assert "sync" in log_types
    assert "build" in log_types
    assert "system" in log_types


@pytest.mark.asyncio
async def test_log_timestamp_format(activity_log_service):
    """Test that log timestamps are in ISO format with Z suffix."""
    await activity_log_service.log("test", "Test message")

    logs = await activity_log_service.get_recent()
    assert len(logs) == 1

    timestamp = logs[0]["time"]
    assert timestamp.endswith("Z")
    # Verify it's a valid ISO format timestamp
    datetime.fromisoformat(timestamp.replace("Z", ""))


@pytest.mark.asyncio
async def test_log_id_is_timestamp(activity_log_service):
    """Test that log ID is a timestamp."""
    await activity_log_service.log("test", "Test message")

    logs = await activity_log_service.get_recent()
    assert len(logs) == 1

    log_id = logs[0]["id"]
    assert isinstance(log_id, float)
    assert log_id > 0


@pytest.mark.asyncio
async def test_get_recent_when_empty(activity_log_service):
    """Test getting recent logs when there are none."""
    logs = await activity_log_service.get_recent()
    assert logs == []


@pytest.mark.asyncio
async def test_log_persistence(activity_log_service, temp_log_file):
    """Test that logs persist across service instances."""
    # Create first service and log activity
    await activity_log_service.log("test", "Test message")

    # Create second service with same log file
    service2 = ActivityLogService()
    service2.log_path = temp_log_file

    logs = await service2.get_recent()
    assert len(logs) == 1
    assert logs[0]["msg"] == "Test message"


@pytest.mark.asyncio
async def test_log_unicode_support(activity_log_service):
    """Test logging with unicode characters (Japanese)."""
    japanese_message = "日本語のテストメッセージ"
    await activity_log_service.log("edit", japanese_message)

    logs = await activity_log_service.get_recent()
    assert len(logs) == 1
    assert logs[0]["msg"] == japanese_message


@pytest.mark.asyncio
async def test_log_empty_message(activity_log_service):
    """Test logging with empty message."""
    await activity_log_service.log("test", "")

    logs = await activity_log_service.get_recent()
    assert len(logs) == 1
    assert logs[0]["msg"] == ""


@pytest.mark.asyncio
async def test_corrupted_log_file(activity_log_service, temp_log_file):
    """Test handling of corrupted log file."""
    # Write invalid JSON to log file
    temp_log_file.write_text("invalid json content")

    # Should return empty list instead of crashing
    logs = await activity_log_service.get_recent()
    assert logs == []
