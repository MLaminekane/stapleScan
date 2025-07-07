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

  const handleOcrScan = async () => {
    if (!videoRef.current) return;

    setLoadingMessage('Analyse précise en cours...');
    setIsLoading(true);
    setError('');

    const processTextDetection = async () => {
      const canvas = document.createElement('canvas');
      // Augmenter la taille du canvas pour une meilleure précision
      canvas.width = videoRef.current!.videoWidth * 2;
      canvas.height = videoRef.current!.videoHeight * 2;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!context) {
        throw new Error('Impossible d\'initialiser le contexte graphique');
      }

      // Dessiner l'image en haute résolution
      context.drawImage(videoRef.current!, 0, 0, canvas.width, canvas.height);
      
      // Améliorer le contraste et la netteté
      enhanceImage(context, canvas.width, canvas.height);

      // Détection du texte avec Tesseract
      const { data: { text } } = await Tesseract.recognize(
        canvas,
        'eng', // Utiliser uniquement l'anglais pour les codes
        { 
          logger: m => console.log(m)
        }
      );

      console.log('Texte détecté:', text);
      
      // Extraire les mots avec leurs positions
      const detectedWords: DetectedWord[] = [];
      const lines = text.split(/\n+/);
      
      lines.forEach((line) => {
        const wordsInLine = line.split(/\s+/);
        wordsInLine.forEach(word => {
          const trimmedWord = word.trim();
          if (trimmedWord.length >= 4) { // Ignorer les mots trop courts
            detectedWords.push({
              text: trimmedWord,
              confidence: 80, // Estimation
              bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } // Non utilisé pour le moment
            });
          }
        });
      });

      console.log('Mots détectés:', detectedWords);
      
      // Filtrer et trier les mots détectés
      const potentialCodes = detectedWords
        .filter((word) => {
          const cleanText = word.text.replace(/[^\w\d-]/g, '');
          return (
            cleanText.length >= 4 && // Au moins 4 caractères
            /[0-9]/.test(cleanText) // Doit contenir au moins un chiffre
          );
        })
        .sort((a, b) => b.text.length - a.text.length); // Trier par longueur décroissante

      console.log('Codes potentiels:', potentialCodes);
      
      // Chercher en priorité les UGS
      const ugsMatch = potentialCodes.find((word) => 
        /^UGS[^\d]*(\d[\d-]*\d?)$/i.test(word.text) ||
        /^[A-Z]{2,}\d{3,}/i.test(word.text) // Format comme "ABC123"
      );
      
      if (ugsMatch) {
        // Extraire uniquement les chiffres et lettres
        const foundCode = ugsMatch.text.replace(/[^\w\d-]/g, '');
        console.log('Code trouvé:', foundCode);
        return foundCode;
      } 
      // Sinon, chercher des numéros de modèle
      else if (potentialCodes.length > 0) {
        // Prendre le code le plus long qui ressemble à une référence
        const foundCode = potentialCodes[0].text.replace(/[^\w\d-]/g, '');
        console.log('Code potentiel trouvé:', foundCode);
        return foundCode;
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
