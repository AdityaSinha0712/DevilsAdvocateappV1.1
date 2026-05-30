import zipfile
import xml.etree.ElementTree as ET
import os

filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ARCHITECTURE_BLUEPRINT.md.docx")
z = zipfile.ZipFile(filepath)
doc = z.read('word/document.xml')
root = ET.fromstring(doc)
ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

paragraphs = []
for para in root.iter(f'{{{ns}}}p'):
    texts = []
    for run in para.iter(f'{{{ns}}}r'):
        for t in run.iter(f'{{{ns}}}t'):
            if t.text:
                texts.append(t.text)
    if texts:
        paragraphs.append(''.join(texts))

output = '\n'.join(paragraphs)
# Write to a text file for easy reading
outpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ARCHITECTURE_BLUEPRINT_TEXT.md")
with open(outpath, 'w', encoding='utf-8') as f:
    f.write(output)
print(f"Written {len(paragraphs)} paragraphs to {outpath}")
