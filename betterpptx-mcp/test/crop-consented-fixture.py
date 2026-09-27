from pathlib import Path
from PIL import Image

source = Path(r"D:\PptxGenJS_Claude\consentedHumanAsset\FullBodyApose.png")
output = Path(r"C:\Users\SafeUser\AppData\Local\Temp\betterpptx-consented-face-input.png")
image = Image.open(source).convert("RGB")
# Maintainer fixture only: generous head-and-shoulders crop, no enhancement.
image.crop((220, 90, 680, 610)).save(output, format="PNG")
print(output)
