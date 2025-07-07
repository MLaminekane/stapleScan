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

  const enhanceImage = (context: CanvasRenderingContext2D, width: number, height: number) => {
    // Amélioration du contraste et de la netteté
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Augmentation du contraste
    const contrast = 1.5;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
      // Conversion en niveaux de gris
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Application du contraste
      data[i] = factor * (gray - 128) + 128;     // R
      data[i + 1] = factor * (gray - 128) + 128; // G
      data[i + 2] = factor * (gray - 128) + 128; // B
      
      // Seuillage pour rendre le texte plus net
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

  const processTextDetection = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current!.videoWidth * 2;
    canvas.height = videoRef.current!.videoHeight * 2;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Impossible d\'initialiser le contexte graphique');
    context.drawImage(videoRef.current!, 0, 0, canvas.width, canvas.height);
    enhanceImage(context, canvas.width, canvas.height);

    const { data: { text } } = await Tesseract.recognize(
      canvas,
      'eng',
      { logger: m => console.log(m) }
    );
    console.log('Texte OCR détecté :', text);
    const rawLines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    // 1. Chercher la ligne UGS
    for (const line of rawLines) {
      const ugs = line.match(/UGS\s*([\d-]+)/i);
      if (ugs && ugs[1]) {
        const code = ugs[1].replace(/-/g, '');
        if (code.length >= 5) {
          console.log('UGS extrait:', code);
          return code;
        }
      }
    }
    // 2. Chercher la ligne Modèle
    for (const line of rawLines) {
      const modele = line.match(/Mod[èe]le\s*([\w\d]+)/i);
      if (modele && modele[1]) {
        const code = modele[1];
        if (code.length >= 4) {
          console.log('Modèle extrait:', code);
          return code;
        }
      }
    }
    // 3. Sinon, rien (pas de fallback sur les chiffres seuls pour éviter les dates)
    return null;
  };

  const handleOcrScan = async () => {
    if (!videoRef.current) return;

    setLoadingMessage('Analyse précise en cours...');
    setIsLoading(true);
    setError('');

w\d-]/g, '');
        // Vérifier le format UGS suivi de chiffres
        if (/^UGS[^\d]*(\d[\d-]*\d?)$/i.test(cleanText)) {
          // S'assurer qu'il y a au moins 4 chiffres après UGS
          const digits = cleanText.replace(/^UGS[^\d]*/i, '').replace(/\D/g, '');
          return digits.length >= 4;
        }
        return false;
      });
      
      if (ugsMatch) {
        // Extraire uniquement les chiffres après UGS
        const digits = ugsMatch.text.replace(/^UGS[^\d]*/i, '').replace(/\D/g, '');
        console.log('Code UGS trouvé:', digits);
        return digits;
      }
      
      // Ensuite chercher des suites de chiffres suffisamment longues
      const numberMatch = potentialCodes.find(word => {
        const cleanText = word.text.replace(/[^\d]/g, '');
        return cleanText.length >= 5; // Au moins 5 chiffres consécutifs
      });
      
      if (numberMatch) {
        const digits = numberMatch.text.replace(/\D/g, '');
        console.log('Numéro trouvé:', digits);
        return digits;
      }
      
      // En dernier recours, essayer de trouver un code avec chiffres et lettres
      const codeMatch = potentialCodes.find(word => {
        const cleanText = word.text.replace(/[^\w\d-]/g, '');
        // Au moins 4 caractères avec au moins 2 chiffres
        return cleanText.length >= 4 && (cleanText.match(/\d/g) || []).length >= 2;
      });
      
      if (codeMatch) {
        const code = codeMatch.text.replace(/[^\w\d-]/g, '');
        console.log('Code potentiel trouvé:', code);
        return code;
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

    // La gestion du code trouvé est maintenant gérée dans le bloc try/catch ci-dessus
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
