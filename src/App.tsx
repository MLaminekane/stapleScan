import { useState, useEffect, useRef, useCallback } from 'react';
import Quagga from 'quagga';
import Tesseract from 'tesseract.js';
import './App.css';

// Types pour l'API
interface Product {
  productUrl: string;
}

interface ApiResponse {
  data?: {
    products?: Product[];
  };
}

// Type pour les résultats de détection de code-barres
interface QuaggaResult {
  codeResult: {
    code: string;
  };
}

// Type pour les mots potentiels avec leur priorité
interface PotentialCode {
  text: string;
  cleanText: string;
  priority: number;
}

function App(): JSX.Element {
  const [manualCode, setManualCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Recherche en cours...');
  const scannerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const searchProduct = useCallback(async (code: string): Promise<void> => {
    if (!code || isLoading) return;

    setLoadingMessage('Recherche du produit...');
    setIsLoading(true);
    setError('');

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
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const enhanceImage = useCallback((context: CanvasRenderingContext2D, width: number, height: number): void => {
    try {
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      const contrast = 1.5;
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // Application du contraste
        const enhancedValue = factor * (gray - 128) + 128;
        data[i] = enhancedValue;     // R
        data[i + 1] = enhancedValue; // G
        data[i + 2] = enhancedValue; // B
        
        // Seuillage pour rendre le texte plus net
        const threshold = 128;
        const finalValue = gray > threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = finalValue;
      }
      
      context.putImageData(imageData, 0, 0);
    } catch (error) {
      console.error('Erreur lors de l\'amélioration de l\'image:', error);
    }
  }, []);

  // Fonction pour détecter si un texte est une date
  const isDate = useCallback((text: string): boolean => {
    const cleanText = text.replace(/[^\d\/\-\.]/g, '');
    
    const datePatterns = [
      /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,    // 01/01/2024
      /^\d{1,2}-\d{1,2}-\d{2,4}$/,      // 01-01-2024
      /^\d{1,2}\.\d{1,2}\.\d{2,4}$/,    // 01.01.2024
      /^\d{2,4}\/\d{1,2}\/\d{1,2}$/,    // 2024/01/01
      /^\d{2,4}-\d{1,2}-\d{1,2}$/,      // 2024-01-01
      /^\d{2,4}\.\d{1,2}\.\d{1,2}$/,    // 2024.01.01
      /^\d{8}$/,                         // 20240101
      /^\d{6}$/                          // 240101
    ];
    
    return datePatterns.some(pattern => pattern.test(cleanText));
  }, []);

  // Fonction pour nettoyer et valider un code UGS
  const cleanUgsCode = useCallback((text: string): string | null => {
    const ugsMatch = text.match(/UGS[^\d]*(\d+)/i);
    if (ugsMatch) {
      const digits = ugsMatch[1].replace(/\D/g, '');
      return digits.length >= 4 ? digits : null;
    }
    return null;
  }, []);

  // Fonction pour valider un code produit
  const isValidProductCode = useCallback((text: string): boolean => {
    const cleanText = text.replace(/[^\w\d-]/g, '');
    
    // Rejeter si c'est une date
    if (isDate(text)) return false;
    
    // Rejeter si c'est trop court
    if (cleanText.length < 4) return false;
    
    // Rejeter si c'est uniquement des lettres
    if (!/\d/.test(cleanText)) return false;
    
    // Rejeter les patterns de prix
    if (/^\$?\d+[\.,]\d{2}$/.test(cleanText)) return false;
    
    // Rejeter les numéros de téléphone
    if (/^\d{3}[-\s]?\d{3}[-\s]?\d{4}$/.test(cleanText)) return false;
    
    // Rejeter les codes postaux
    if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(cleanText)) return false;
    
    // Accepter les codes qui ont au moins 4 chiffres ou un bon format
    const digitCount = (cleanText.match(/\d/g) || []).length;
    return digitCount >= 4 || /^[A-Z]{1,3}\d{4,}$/i.test(cleanText);
  }, [isDate]);

  // Fonction pour calculer la priorité d'un code
  const getCodePriority = useCallback((text: string): number => {
    let priority = 0;
    const cleanText = text.replace(/[^\w\d-]/g, '');
    
    // Priorité maximale pour les codes UGS
    if (/^UGS/i.test(text)) {
      priority += 1000;
    }
    
    // Priorité élevée pour les codes avec format produit typique
    if (/^\d{6,}$/.test(cleanText)) {
      priority += 500;
    }
    
    if (/^[A-Z]{1,3}\d{4,}$/i.test(cleanText)) {
      priority += 400;
    }
    
    if (/^\d{4,5}$/.test(cleanText)) {
      priority += 300;
    }
    
    // Bonus pour la longueur
    if (cleanText.length >= 6) priority += 100;
    if (cleanText.length >= 8) priority += 50;
    
    // Bonus pour les chiffres
    const digitCount = (cleanText.match(/\d/g) || []).length;
    priority += digitCount * 10;
    
    // Malus pour les caractères spéciaux
    const specialChars = cleanText.replace(/[A-Z0-9]/gi, '').length;
    priority -= specialChars * 20;
    
    return priority;
  }, []);

  const handleOcrScan = useCallback(async (): Promise<void> => {
    if (!videoRef.current) {
      setError('Caméra non disponible. Veuillez réessayer.');
      return;
    }

    setLoadingMessage('Analyse précise en cours...');
    setIsLoading(true);
    setError('');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth * 2;
      canvas.height = videoRef.current.videoHeight * 2;
      
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        throw new Error('Impossible d\'initialiser le contexte graphique');
      }

      // Dessiner l'image en haute résolution
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      // Améliorer le contraste et la netteté
      enhanceImage(context, canvas.width, canvas.height);

      // Détection du texte avec Tesseract
      const { data: { text } } = await Tesseract.recognize(
        canvas,
        'eng',
        { 
          logger: (m) => console.log(m)
        }
      );

      console.log('Texte détecté:', text);
      
      // Extraire tous les mots du texte
      const allWords = text.split(/[\s\n\r]+/)
        .map(word => word.trim())
        .filter(word => word.length > 0);

      console.log('Tous les mots:', allWords);
      
      // Filtrer et évaluer les codes potentiels
      const potentialCodes: PotentialCode[] = allWords
        .filter(word => isValidProductCode(word))
        .map(word => ({
          text: word,
          cleanText: word.replace(/[^\w\d-]/g, ''),
          priority: getCodePriority(word)
        }))
        .sort((a, b) => b.priority - a.priority);

      console.log('Codes potentiels avec priorité:', potentialCodes);
      
      // Vérifier d'abord les codes UGS
      for (const code of potentialCodes) {
        const ugsCode = cleanUgsCode(code.text);
        if (ugsCode) {
          console.log('Code UGS trouvé:', ugsCode);
          await searchProduct(ugsCode);
          return;
        }
      }
      
      // Ensuite prendre le code avec la plus haute priorité
      if (potentialCodes.length > 0) {
        const bestCode = potentialCodes[0];
        let finalCode = bestCode.cleanText;
        
        // Si c'est un code purement numérique, garder seulement les chiffres
        if (/^\d+[-\s]*\d*$/.test(finalCode)) {
          finalCode = finalCode.replace(/\D/g, '');
        }
        
        console.log('Meilleur code trouvé:', finalCode);
        await searchProduct(finalCode);
        return;
      }
      
      // Aucun code trouvé
      setError('Aucun code produit valide détecté. Assurez-vous que le code UGS ou modèle est bien visible.');
    } catch (error) {
      console.error('Erreur lors de la reconnaissance du texte:', error);
      setError('Erreur lors de l\'analyse du texte. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  }, [videoRef, enhanceImage, isValidProductCode, getCodePriority, cleanUgsCode, searchProduct]);

  const handleManualSearch = useCallback((): void => {
    if (manualCode.trim()) {
      searchProduct(manualCode.trim());
    }
  }, [manualCode, searchProduct]);

  useEffect(() => {
    const onDetected = (result: QuaggaResult): void => {
      if (result.codeResult.code) {
        searchProduct(result.codeResult.code);
      }
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
      }, (err: Error | null) => {
        if (err) {
          console.error('Erreur Quagga:', err);
          setError('Erreur: Impossible d\'accéder à la caméra.');
          return;
        }
        
        try {
          Quagga.start();
          videoRef.current = scannerRef.current?.querySelector('video') || null;
        } catch (startError) {
          console.error('Erreur lors du démarrage:', startError);
          setError('Erreur lors du démarrage de la caméra.');
        }
      });
      
      Quagga.onDetected(onDetected);
      
      return () => {
        try {
          Quagga.offDetected(onDetected);
          Quagga.stop();
        } catch (stopError) {
          console.error('Erreur lors de l\'arrêt:', stopError);
        }
      };
    }
  }, [isLoading, searchProduct]);

  return (
    <div className="App">
      <div className="container">
        {isLoading ? (
          <div>
            <h1>{loadingMessage}</h1>
          </div>
        ) : (
          <>
            <h1>Scanneur de Produits</h1>
            <p>Pointez la caméra sur un code-barre ou un texte.</p>
            <div ref={scannerRef} className="scanner-container"></div>
            {error && <p className="error-message">{error}</p>}
            <div className="manual-search">
              <button onClick={handleOcrScan} disabled={isLoading}>
                Scanner Texte
              </button>
              <input 
                type="text" 
                value={manualCode} 
                onChange={(e) => setManualCode(e.target.value)} 
                placeholder="Entrez sku ou upc"
                disabled={isLoading}
              />
              <button onClick={handleManualSearch} disabled={isLoading || !manualCode.trim()}>
                Rechercher
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;