#!/usr/bin/env python3
"""
Quick script to compare page counts and extract text snippets from PDFs.
Usage: python scripts/books/compare-pdf-stats.py <generated.pdf> <reference.pdf>
"""
import sys
import re
from pypdf import PdfReader

def analyze_pdf(path):
    reader = PdfReader(path)
    pages = len(reader.pages)
    full_text = ""
    for p in reader.pages:
        full_text += (p.extract_text() or "") + "\n"
    
    # Count occurrences of key patterns
    praktijk_count = len(re.findall(r"In de praktijk", full_text, re.IGNORECASE))
    verdieping_count = len(re.findall(r"Verdieping", full_text, re.IGNORECASE))
    
    # Count numbered subparagraphs like 1.1.1, 1.1.2, etc.
    subpara_matches = re.findall(r"\b\d+\.\d+\.\d+\b", full_text)
    subpara_count = len(set(subpara_matches))
    
    word_count = len(full_text.split())
    
    return {
        "pages": pages,
        "words": word_count,
        "praktijk_boxes": praktijk_count,
        "verdieping_boxes": verdieping_count,
        "unique_subparagraphs": subpara_count,
        "snippet": full_text[:600].replace("\n", " ").strip()
    }

def main():
    if len(sys.argv) < 2:
        print("Usage: python compare-pdf-stats.py <pdf1> [pdf2]")
        sys.exit(1)
    
    pdf1 = sys.argv[1]
    stats1 = analyze_pdf(pdf1)
    print(f"\n=== {pdf1} ===")
    print(f"  Pages: {stats1['pages']}")
    print(f"  Words: {stats1['words']}")
    print(f"  'In de praktijk' boxes: {stats1['praktijk_boxes']}")
    print(f"  'Verdieping' boxes: {stats1['verdieping_boxes']}")
    print(f"  Unique subparagraphs (X.X.X): {stats1['unique_subparagraphs']}")
    print(f"  Snippet: {stats1['snippet'][:300]}...")
    
    if len(sys.argv) >= 3:
        pdf2 = sys.argv[2]
        stats2 = analyze_pdf(pdf2)
        print(f"\n=== {pdf2} ===")
        print(f"  Pages: {stats2['pages']}")
        print(f"  Words: {stats2['words']}")
        print(f"  'In de praktijk' boxes: {stats2['praktijk_boxes']}")
        print(f"  'Verdieping' boxes: {stats2['verdieping_boxes']}")
        print(f"  Unique subparagraphs (X.X.X): {stats2['unique_subparagraphs']}")
        print(f"  Snippet: {stats2['snippet'][:300]}...")
        
        print("\n=== Comparison ===")
        print(f"  Page difference: {stats1['pages'] - stats2['pages']} ({stats1['pages']} vs {stats2['pages']})")
        print(f"  Word difference: {stats1['words'] - stats2['words']} ({stats1['words']} vs {stats2['words']})")
        print(f"  Praktijk box difference: {stats1['praktijk_boxes'] - stats2['praktijk_boxes']}")
        print(f"  Verdieping box difference: {stats1['verdieping_boxes'] - stats2['verdieping_boxes']}")

if __name__ == "__main__":
    main()

