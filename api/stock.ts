import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

interface StoreInventory {
  address: string;
  distance: string;
  stock: string;
}

interface ProductData {
  name: string;
  sku: string;
  price: string;
  imageUrl: string;
  stores: StoreInventory[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { sku } = req.query;

  if (!sku || typeof sku !== 'string') {
    return res.status(400).json({ error: 'SKU parameter is required' });
  }

  try {
    const url = `https://stocktrack.ca/st/index.php?s=st&sku=${sku}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data from stocktrack.ca, status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const productResult = $('#divProductSearchResults');
    if (productResult.length === 0) {
      return res.status(404).json({ error: 'Product not found or invalid SKU' });
    }

    const name = productResult.find('a').first().text().trim();
    let imageUrl = productResult.find('img').attr('src') || '';
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = `https://stocktrack.ca${imageUrl}`;
    }

    const price = productResult.find('b > font[color="#FF0000"]').text().trim();
    const skuText = productResult.find('div:contains("SKU:")').text().replace('SKU:', '').trim();

    const stores: StoreInventory[] = [];
    $('#tblInventory tbody tr').each((i, elem) => {
      const columns = $(elem).find('td');
      if (columns.length >= 4) {
        const address = $(columns[1]).text().trim();
        const distance = $(columns[2]).text().trim();
        const stock = $(columns[3]).text().trim();
        if (address) {
          stores.push({ address, distance, stock });
        }
      }
    });

    const data: ProductData = {
      name,
      sku: skuText,
      price,
      imageUrl,
      stores,
    };

    res.status(200).json(data);

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ error: 'Failed to scrape stock data.', details: errorMessage });
  }
}
