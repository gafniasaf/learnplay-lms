#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract and organize book images from extracted_images.zip
Creates: books/{book_name}/images/ for each book
"""
import zipfile
import os
import sys
from pathlib import Path
from collections import defaultdict
import shutil

# Fix Windows console encoding
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

ZIP_PATH = Path("extracted_images.zip")
OUTPUT_BASE = Path("books")

def extract_and_organize():
    """Extract zip and organize images by book"""
    
    if not ZIP_PATH.exists():
        print(f"ERROR: {ZIP_PATH} not found!")
        return
    
    print(f"Opening {ZIP_PATH}...")
    
    # First pass: identify all books and their images
    books_images = defaultdict(list)
    
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        print("Scanning zip structure...")
        all_entries = zip_ref.namelist()
        
        for entry in all_entries:
            # Look for pattern: extracted_images/{book_name}/linked_images/{image_file}
            parts = entry.split('/')
            # Skip directory entries (end with /)
            if entry.endswith('/'):
                continue
            # Pattern: extracted_images/{book_name}/linked_images/{image_file}
            if len(parts) >= 4 and parts[0] == 'extracted_images' and parts[2] == 'linked_images':
                book_name = parts[1]
                image_file = '/'.join(parts[3:])  # Get full path after linked_images/
                if image_file:  # Skip empty
                    books_images[book_name].append((entry, image_file))
        
        print(f"Found {len(books_images)} books:")
        for book_name, images in books_images.items():
            print(f"  - {book_name}: {len(images)} images")
        
        # Extract and organize
        print("\nExtracting and organizing...")
        total_files = sum(len(images) for images in books_images.values())
        processed = 0
        
        for book_name, image_list in books_images.items():
            book_dir = OUTPUT_BASE / book_name / "images"
            book_dir.mkdir(parents=True, exist_ok=True)
            
            print(f"  Processing {book_name}...")
            
            for zip_path, image_name in image_list:
                # Extract to book-specific directory
                dest_path = book_dir / Path(image_name).name
                
                try:
                    with zip_ref.open(zip_path) as source:
                        with open(dest_path, 'wb') as target:
                            shutil.copyfileobj(source, target)
                    
                    processed += 1
                    if processed % 100 == 0:
                        print(f"    Progress: {processed}/{total_files} files...")
                except Exception as e:
                    print(f"    WARNING: Error extracting {zip_path}: {e}")
        
        print(f"\nComplete! Processed {processed} images")
        print(f"Images organized in: {OUTPUT_BASE}/")

if __name__ == "__main__":
    extract_and_organize()

