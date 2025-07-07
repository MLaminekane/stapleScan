import { useState, useEffect, useRef, useCallback } from 'react';
import Quagga from 'quagga';
import Tesseract from 'tesseract.js';
import './App.css';

// Define types for the API response to avoid using 'any'
interface Product {
  productUrl: string;
}

interface ApiResponse {
  data?: {
    products?: Product[];
  };
}

function App() {
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Recherche en cours...');
  const scannerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const searchProduct = useCallback(async (code: string) => {
    if (!code || isLoading) return;

    setLoadingMessage('Recherche du produit...');
    setIsLoading(true);

    const fallbackUrl = `https://www.bureauengros.com/search?q=${code}`;
    const apiUrl = `https://www.bureauengros.com/proxy/product-search/v2/products/search?q=${code}&lang=fr`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('API response not OK');
      const result: ApiResponse = await response.json();

      if (result?.data?.products?.length === 1) {
        const productUrl = result.data.products[0].productUrl;
        window.location.href = `https://www.bureauengros.com${productUrl}`;
      } else {
        window.location.href = fallbackUrl;
      }
    } catch (err) {
      console.error("API call failed, falling back to search page", err);
      window.location.href = fallbackUrl;
    }
  }, [isLoading]);

  const handleOcrScan = async () => {
    if (!videoRef.current) return;

    setLoadingMessage('Analyse du texte...');
    setIsLoading(true);

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext('2d');
    context?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const { data: { text } } = await Tesseract.recognize(canvas, 'fra');
    const lines = text.split('\n');
    let foundCode = '';

    for (const line of lines) {
      const ugsMatch = line.match(/UGS\s*([\d-]+)/i);
      if (ugsMatch && ugsMatch[1]) {
        foundCode = ugsMatch[1].split('-')[0];
        break;
      }
      const modeleMatch = line.match(/Mod.le\s*([\w\d/]+)/i);
      if (modeleMatch && modeleMatch[1]) {
        foundCode = modeleMatch[1];
        break;
      }
    }

    if (foundCode) {
      searchProduct(foundCode);
    } else {
      setError('Aucun code UGS ou Modèle trouvé.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDetected = (result: any) => {
      if (result.codeResult.code) searchProduct(result.codeResult.code);
    };

    if (scannerRef.current && !isLoading) {
      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "environment",
            advanced: [
              { zoom: { ideal: 1.5 } },
              { focusMode: "continuous" },
              { focusDistance: { ideal: 0.1 } }
            ]
          },
        },
        decoder: {
          readers: ['ean_reader', 'upc_reader', 'code_128_reader'],
          debug: {
            drawBoundingBox: true,
            showFrequency: true,
            drawScanline: true,
            showPattern: true
          }
        },
        locate: true,
        numOfWorkers: navigator.hardwareConcurrency || 4,
        frequency: 10
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }, (err: any) => {
        if (err) {
          setError('Erreur: Impossible d\'accéder à la caméra.');
          return;
        }
        Quagga.start();
        // Fix for lint error: ensure the value is not undefined
        videoRef.current = scannerRef.current?.querySelector('video') || null;
      });
      Quagga.onDetected(onDetected);
      return () => {
        Quagga.offDetected(onDetected);
        Quagga.stop();
      };
    }
  }, [isLoading, searchProduct]);

  return (
    <div className="App">
      <div className="container">
        {isLoading ? (
          <div><h1>{loadingMessage}</h1></div>
        ) : (
          <>
            <h1>Scanneur de Produits</h1>
            <p>Pointez la caméra sur un code-barre ou un texte.</p>
            <div ref={scannerRef} className="scanner-container"></div>
            {error && <p className="error-message">{error}</p>}
            <div className="manual-search">
              <button onClick={handleOcrScan}>Scanner Texte</button>
              <input 
                type="text" 
                value={manualCode} 
                onChange={(e) => setManualCode(e.target.value)} 
                placeholder="Entrez sku ou upc"
              />
              <button onClick={() => searchProduct(manualCode)}>Rechercher</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
