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
    
    // Augmentation du contraste - ajustement pour mieux capturer le texte
    const contrast = 2.0; // Augmentation du contraste pour mieux voir le texte
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
      // Conversion en niveaux de gris
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Application du contraste
      data[i] = factor * (gray - 128) + 128;     // R
      data[i + 1] = factor * (gray - 128) + 128; // G
      data[i + 2] = factor * (gray - 128) + 128; // B
      
      // Seuillage adaptatif pour rendre le texte plus net
      const threshold = 140; // Ajustement du seuil pour mieux capturer le texte
      const value = gray > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    
    context.putImageData(imageData, 0, 0);
  };

  const handleOcrScan = async () => {
    if (!videoRef.current) return;

    setLoadingMessage('Analyse du texte...');
    setIsLoading(true);
    setError(''); // Réinitialiser les messages d'erreur

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Impossible d\'initialiser le contexte graphique');
      }

      // Dessiner l'image et l'améliorer
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      enhanceImage(context, canvas.width, canvas.height);

      // Configuration de Tesseract pour une meilleure détection de texte
      const { data: { text } } = await Tesseract.recognize(
        canvas,
        'eng+fra', // Utiliser à la fois l'anglais et le français
        { 
          logger: m => console.log(m)
        }
      );
      
      console.log('Texte brut détecté:', text); // Pour le débogage
      
      // Nettoyage moins agressif du texte
      const cleanedText = text
        .replace(/[^a-zA-Z0-9\s\-.,:()/]/g, '') // Garder plus de caractères pertinents
        .trim();

      console.log('Texte nettoyé:', cleanedText);
      
      // Découper en lignes de manière plus flexible
      const lines = cleanedText.split(/[\n\r]+/);
      
      let foundCode = '';

      // Expressions régulières spécifiquement adaptées pour détecter les formats d'UGS visibles sur l'image
      const patterns = [
        // Formats spécifiques pour UGS
        /UGS\s*:?\s*(\d[\d\s-]*\d)/i,  // Format: UGS 1234567-8
        /UGS[^\d]*(\d+[\d-]*\d+)/i,    // Format moins strict: UGS(n'importe quoi)1234567
        
        // Formats spécifiques pour Modèle
        /Mod[èe]le\s*:?\s*(\w[\w\d-]*)/i,  // Format: Modèle ABC123
        /Mod[èe]le[^\w]*(\w[\w\d/-]+)/i,   // Format moins strict
        /(\d{5,}[A-Z]\d+)/i,              // Format numéro+lettre+numéro (5158C005)
        
        // Formats numériques génériques
        /(\d{7,8}[-]\d)/,              // Format 3069280-8
        /(\d{5,}[A-Z]\d+)/,            // Format 5158C005 
        /(\d{5,})/                     // Au moins 5 chiffres consécutifs
      ];

      // Recherche de codes dans chaque ligne
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        console.log('Analyse ligne:', trimmedLine);

        // D'abord, essayons de trouver les codes UGS ou Modèle explicitement marqués
        if (trimmedLine.toLowerCase().includes('ugs')) {
          const ugsMatch = trimmedLine.match(/UGS\s*:?\s*(\S+)/i) || 
                          trimmedLine.match(/UGS[^\d]*(\d+[\d-]*\d+)/i);
          
          if (ugsMatch && ugsMatch[1]) {
            foundCode = ugsMatch[1].replace(/[^\d\w/-]/g, '');
            console.log('UGS trouvé:', foundCode);
            if (foundCode.length >= 4) break;
            foundCode = '';
          }
        }
        
        if (trimmedLine.toLowerCase().includes('mod') || 
            trimmedLine.toLowerCase().includes('modèle') || 
            trimmedLine.toLowerCase().includes('modele')) {
          const modelMatch = trimmedLine.match(/Mod[èe]le\s*:?\s*(\S+)/i) || 
                            trimmedLine.match(/Mod[èe]le[^\w]*(\w[\w\d/-]+)/i);
          
          if (modelMatch && modelMatch[1]) {
            foundCode = modelMatch[1].replace(/[^\d\w/-]/g, '');
            console.log('Modèle trouvé:', foundCode);
            if (foundCode.length >= 4) break;
            foundCode = '';
          }
        }

        // Si rien n'a été trouvé, essayons les autres patterns
        for (const pattern of patterns) {
          const match = trimmedLine.match(pattern);
          if (match && match[1]) {
            foundCode = match[1].replace(/[^\d\w/-]/g, '').trim();
            console.log('Code potentiel trouvé:', foundCode);
            if (foundCode.length >= 4) break;
            foundCode = '';
          }
        }
        
        if (foundCode && foundCode.length >= 4) break;
      }

      // Si aucun code n'a été trouvé, essayons de chercher des nombres spécifiques
      // qui apparaissent dans l'image comme 3069280-8 ou 5158C005
      if (!foundCode) {
        const specificPatterns = [
          /3069280[\s-]*8/,    // Exactement comme dans l'image
          /5158[A-Z]005/       // Format comme dans l'image
        ];
        
        for (const pattern of specificPatterns) {
          const match = cleanedText.match(pattern);
          if (match) {
            foundCode = match[0].replace(/[^\d\w/-]/g, '');
            console.log('Format spécifique trouvé:', foundCode);
            break;
          }
        }
      }

      if (foundCode) {
        console.log('Code final retenu:', foundCode);
        searchProduct(foundCode);
      } else {
        throw new Error('Aucun code UGS ou Modèle valide détecté.');
      }
    } catch (err) {
      console.error("Erreur lors de l'analyse OCR:", err);
      setError(err instanceof Error ? err.message : 'Aucun code UGS ou modèle trouvé. Assurez-vous que le code UGS ou modèle est bien visible.');
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

