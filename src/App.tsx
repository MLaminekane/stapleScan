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

  const handleOcrScan = async () => {
    if (!videoRef.current) return;

    setLoadingMessage('Analyse du texte...');
    setIsLoading(true);

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext('2d');
    
    if (!context) {
      setError('Impossible d\'initialiser le contexte graphique');
      setIsLoading(false);
      return;
    }

    // Dessiner l'image et l'améliorer
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    enhanceImage(context, canvas.width, canvas.height);

    // Configuration minimale de Tesseract pour une meilleure compatibilité
    const { data: { text } } = await Tesseract.recognize(
      canvas,
      'eng+fra', // Utiliser à la fois l'anglais et le français
      { 
        logger: m => console.log(m)
      }
    );
    
    // Appliquer un post-traitement pour nettoyer le texte
    const cleanedText = text
      .replace(/[^\w\d\s-/]/g, '') // Supprimer les caractères spéciaux
      .replace(/\s+/g, ' ') // Remplacer les espaces multiples par un seul
      .trim();

    console.log('Texte détecté:', cleanedText); // Pour le débogage
    
    // Utiliser le texte nettoyé pour la détection
    const lines = cleanedText.split(/[\s\n\r]+/); // Séparer sur tout type d'espace ou retour à la ligne
    let foundCode = '';

    // Expressions régulières plus flexibles
    const patterns = [
      /UGS[^\d]*(\d[\d-]*\d)/i, // UGS suivi de chiffres et tirets
      /(\d{5,})/, // Au moins 5 chiffres consécutifs
      /(\d[\d\s-]{4,}\d)/, // Numéros avec tirets ou espaces
      /mod[ée]le[^\d]*(\w[\w/\d-]+)/i, // Modèle avec différents séparateurs
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        if (match && match[1]) {
          // Nettoyer le code trouvé
          foundCode = match[1]
            .replace(/[^\d\w/-]/g, '') // Garder uniquement chiffres, lettres, / et -
            .replace(/^0+/, '') // Supprimer les zéros en début de chaîne
            .replace(/-+$/, ''); // Supprimer les tirets en fin de chaîne
          
          if (foundCode.length >= 4) { // Code valide si au moins 4 caractères
            console.log('Code trouvé:', foundCode, 'dans la ligne:', trimmedLine);
            break;
          }
          foundCode = '';
        }
      }
      
      if (foundCode) break;
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

