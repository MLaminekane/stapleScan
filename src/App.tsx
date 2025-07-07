import { useState, useEffect, useRef, useCallback } from 'react';
import Quagga from 'quagga';
import Tesseract from 'tesseract.js';
import './App.css';

interface Product {
  productUrl: string;
}

interface ApiResponse {
  data?: {
    products?: Product[];
  };
}

function App() {
  const [manualCode, setManualCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Recherche en cours...');
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

  const enhanceImage = (context: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    const contrast = 1.5;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      data[i] = factor * (gray - 128) + 128;
      data[i + 1] = factor * (gray - 128) + 128;
      data[i + 2] = factor * (gray - 128) + 128;
      
      const threshold = 128;
      const value = gray > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    
    context.putImageData(imageData, 0, 0);
  };

  interface DetectedWord {
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }

  const handleOcrScan = useCallback(async () => {
    if (!videoRef.current) return;

    setLoadingMessage('Analyse précise en cours...');
    setIsLoading(true);
    setError('');

    const processTextDetection = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current!.videoWidth * 2;
      canvas.height = videoRef.current!.videoHeight * 2;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!context) {
        throw new Error('Impossible d\'initialiser le contexte graphique');
      }

      context.drawImage(videoRef.current!, 0, 0, canvas.width, canvas.height);
      enhanceImage(context, canvas.width, canvas.height);

      const { data: { text } } = await Tesseract.recognize(
        canvas,
        'eng+fra',
        { logger: m => console.log(m) }
      );

      console.log('Texte détecté:', text);
      
      // 1. Recherche prioritaire des UGS (format: UGS XXXXXXX)
      const ugsRegex = /UGS\s*[:-]?\s*(\d+)[^\d]*/i;
      const ugsMatch = ugsRegex.exec(text);
      if (ugsMatch && ugsMatch[1]) {
        const ugsCode = ugsMatch[1];
        console.log('UGS trouvé:', ugsCode);
        return ugsCode;
      }

      // 2. Recherche des modèles (format: Modèle XXXXXXX)
      const modeleRegex = /Mod[eè]le\s*[:-]?\s*(\w[\w\d-]+)/i;
      const modeleMatch = modeleRegex.exec(text);
      if (modeleMatch && modeleMatch[1]) {
        const modeleCode = modeleMatch[1].replace(/[^\w\d-]/g, '');
        console.log('Modèle trouvé:', modeleCode);
        return modeleCode;
      }

      // 3. Recherche de codes produits typiques (séries de chiffres)
      const codeRegex = /(\d{5,})|([A-Z0-9]{6,})/g;
      const codeMatches = [];
      let match;
      
      while ((match = codeRegex.exec(text)) !== null) {
        const cleanCode = match[0].replace(/[^\w\d]/g, '');
        if (cleanCode.length >= 5) {
          codeMatches.push(cleanCode);
        }
      }
      
      if (codeMatches.length > 0) {
        // Tri par longueur décroissante
        const bestMatch = codeMatches.reduce((a, b) => a.length > b.length ? a : b);
        console.log('Code produit trouvé:', bestMatch);
        return bestMatch;
      }

      // 4. Ancienne méthode de secours
      console.warn("Aucun motif spécifique trouvé, utilisation de l'ancienne méthode");
      const lines = text.split(/\n+/);
      const detectedWords: DetectedWord[] = [];
      
      lines.forEach((line) => {
        const wordsInLine = line.split(/\s+/);
        wordsInLine.forEach(word => {
          const trimmedWord = word.trim();
          if (trimmedWord.length >= 4) {
            detectedWords.push({
              text: trimmedWord,
              confidence: 80,
              bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }
            });
          }
        });
      });

      const potentialCodes = detectedWords
        .filter(word => {
          const cleanText = word.text.replace(/[^\w\d-]/g, '');
          return cleanText.length >= 4 && /[0-9]/.test(cleanText);
        })
        .sort((a, b) => b.text.length - a.text.length);

      if (potentialCodes.length > 0) {
        return potentialCodes[0].text.replace(/[^\w\d-]/g, '');
      }
      
      return null;
    };

    try {
      const foundCode = await processTextDetection();
      
      if (foundCode) {
        searchProduct(foundCode);
      } else {
        setError('Aucun code valide détecté. Essayez de mieux cadrer le code.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Erreur lors de la reconnaissance du texte:', error);
      setError('Erreur lors de l\'analyse du texte. Veuillez réessayer.');
      setIsLoading(false);
    }
  }, [searchProduct]);

  // Suppression de onDetected non utilisé car remplacé par handleQuaggaDetected

  useEffect(() => {
    if (!scannerRef.current || isLoading) return;
    
    let quaggaInitialized = false;
    
    const handleQuaggaError = (error: Error) => {
      console.error('Erreur Quagga:', error);
      setError('Erreur lors de l\'initialisation du scanner. Veuillez recharger la page.');
    };
    
    const handleQuaggaDetected = (result: { codeResult: { code: string } }) => {
      if (result?.codeResult?.code) {
        searchProduct(result.codeResult.code);
      }
    };
    const initQuagga = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          Quagga.init({
            inputStream: {
              name: "Live",
              type: "LiveStream",
              target: scannerRef.current!,
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
            numOfWorkers: Math.min(navigator.hardwareConcurrency || 4, 4),
            frequency: 10
          }, (err: Error | null) => {
            if (err) {
              reject(err);
              return;
            }
            quaggaInitialized = true;
            Quagga.start();
            videoRef.current = scannerRef.current?.querySelector('video') || null;
            resolve();
          });
        });
        
        Quagga.onDetected(handleQuaggaDetected);
      } catch (error) {
        handleQuaggaError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    initQuagga();

    return () => {
      if (quaggaInitialized) {
        Quagga.offDetected(handleQuaggaDetected);
        Quagga.stop();
      }
    };
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
            <div className="scanner-container">
              {error && <p className="error-message">{error}</p>}
            </div>
            <div className="manual-search">
              <button onClick={handleOcrScan} disabled={isLoading}>
                {isLoading ? 'Analyse en cours...' : 'Scanner Texte'}
              </button>
              <div className="search-box">
                <input 
                  type="text" 
                  value={manualCode} 
                  onChange={(e) => setManualCode(e.target.value)} 
                  placeholder="Entrez sku ou upc"
                  onKeyPress={(e) => e.key === 'Enter' && manualCode.trim() && searchProduct(manualCode.trim())}
                  disabled={isLoading}
                />
                <button 
                  onClick={() => searchProduct(manualCode.trim())}
                  disabled={!manualCode.trim() || isLoading}
                >
                  {isLoading ? 'Recherche...' : 'Rechercher'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;