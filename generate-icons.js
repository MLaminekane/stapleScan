import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateIcons() {
  const svgPath = path.join(__dirname, 'public', 'icon.svg');
  const publicPath = path.join(__dirname, 'public');
  
  if (!fs.existsSync(svgPath)) {
    console.error('SVG icon not found at:', svgPath);
    return;
  }
  
  const sizes = [192, 512];
  
  for (const size of sizes) {
    const outputPath = path.join(publicPath, `icon-${size}x${size}.png`);
    
    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      
      console.log(`Generated: icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`Error generating ${size}x${size} icon:`, error);
    }
  }
}

generateIcons();
