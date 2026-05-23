
import requests
import json
import os

BASE_URL = "http://localhost:8000/api/v1"

def test_image_feature():
    print("Testing Image Insertion Feature...")

    # 1. Create Image Group
    print("\n[1] Creating Image Group...")
    res = requests.post(f"{BASE_URL}/project/chapters/image-group", json={"title": "Test Image Group"})
    if res.status_code != 200:
        print(f"Failed to create image group: {res.text}")
        return

    chapter = res.json()
    chapter_id = chapter["id"]
    print(f"Created chapter: {chapter_id} ({chapter['title']})")
    print(f"Local Path: {chapter['localPath']}")

    # Verify .qmd file exists
    qmd_path = f"content/img_{chapter_id}.qmd" # This should match backend logic
    # Note: Backend returns localPath, simpler to use that
    # Assuming script runs from project root
    real_qmd_path = chapter['localPath']
    if os.path.exists(real_qmd_path):
        print(f"Confirmed .qmd file exists: {real_qmd_path}")
    else:
        print(f"ERROR: .qmd file not found: {real_qmd_path}")

    # 2. Upload Image
    print("\n[2] Uploading Image...")
    # Create dummy image
    dummy_img_path = "dummy_test_image.jpg"
    with open(dummy_img_path, "wb") as f:
        f.write(b"fake image data")

    files = {'file': (dummy_img_path, open(dummy_img_path, 'rb'), 'image/jpeg')}
    res = requests.post(f"{BASE_URL}/project/chapters/{chapter_id}/images", files=files)
    
    if res.status_code != 200:
        print(f"Failed to upload image: {res.text}")
    else:
        image_item = res.json()
        print(f"Uploaded image: {image_item['path']}")

        # Verify .qmd content updated
        with open(real_qmd_path, "r") as f:
            content = f.read()
            print("Updated .qmd content:")
            print("----------------")
            print(content)
            print("----------------")
            if image_item['path'] in content:
                print("SUCCESS: Image path found in .qmd")
            else:
                print("ERROR: Image path NOT found in .qmd")

    # Cleanup
    os.remove(dummy_img_path)
    # Optional: Delete chapter to clean up? 
    # requests.delete(f"{BASE_URL}/project/chapters/{chapter_id}")

if __name__ == "__main__":
    test_image_feature()
