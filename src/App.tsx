import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// Type pour les mots potentiels avec leur priorité
interface PotentialCode {
  text: string;
  cleanText: string;
  priority: number;
}

const App: React.FC = () => {
  const [manualCode, setManualCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Recherche en cours...');
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [detectedText, setDetectedText] = useState<string>('');
  const scannerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      
      // Amélioration du contraste et binarisation
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // Seuillage adaptatif
        const threshold = 128;
        const finalValue = gray > threshold ? 255 : 0;
        data[i] = finalValue;     // R
        data[i + 1] = finalValue; // G
        data[i + 2] = finalValue; // B
      }
      
      context.putImageData(imageData, 0, 0);
    } catch (error) {
      console.error('Erreur lors de l\'amélioration de l\'image:', error);
    }
  }, []);

  const isDate = useCallback((text: string): boolean => {
    const cleanText = text.replace(/[^\d\/\-\.]/g, '');
    
    const datePatterns = [
      /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
      /^\d{1,2}-\d{1,2}-\d{2,4}$/,
      /^\d{2,4}\/\d{1,2}\/\d{1,2}$/,
      /^\d{8}$/,
      /^\d{6}$/
    ];
    
    return datePatterns.some(pattern => pattern.test(cleanText));
  }, []);

  const cleanUgsCode = useCallback((text: string): string | null => {
    const ugsMatch = text.match(/UGS[^\d]*(\d+)/i);
    if (ugsMatch) {
      const digits = ugsMatch[1].replace(/\D/g, '');
      return digits.length >= 4 ? digits : null;
    }
    return null;
  }, []);

  const isValidProductCode = useCallback((text: string): boolean => {
    const cleanText = text.replace(/[^\w\d-]/g, '');
    
    if (isDate(text)) return false;
    if (cleanText.length < 4) return false;
    if (!/\d/.test(cleanText)) return false;
    if (/^\$?\d+[\.,]\d{2}$/.test(cleanText)) return false;
    
    const digitCount = (cleanText.match(/\d/g) || []).length;
    return digitCount >= 4 || /^[A-Z]{1,3}\d{4,}$/i.test(cleanText);
  }, [isDate]);

  const getCodePriority = useCallback((text: string): number => {
    let priority = 0;
    const cleanText = text.replace(/[^\w\d-]/g, '');
    
    if (/^UGS/i.test(text)) priority += 1000;
    if (/^\d{6,}$/.test(cleanText)) priority += 500;
    if (/^[A-Z]{1,3}\d{4,}$/i.test(cleanText)) priority += 400;
    if (/^\d{4,5}$/.test(cleanText)) priority += 300;
    
    if (cleanText.length >= 6) priority += 100;
    if (cleanText.length >= 8) priority += 50;
    
    const digitCount = (cleanText.match(/\d/g) || []).length;
    priority += digitCount * 10;
    
    return priority;
  }, []);

  // Fonction simplifiée pour la reconnaissance OCR
  const handleOcrScan = useCallback(async (): Promise<void> => {
    if (!videoRef.current || !isCameraReady) {
      setError('Caméra non prête. Veuillez attendre que la caméra soit initialisée.');
      return;
    }

    setLoadingMessage('Analyse du texte en cours...');
    setIsLoading(true);
    setError('');

    try {
      const canvas = canvasRef.current || document.createElement('canvas');
      const video = videoRef.current;
      
      // Ajuster la taille du canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Impossible d\'initialiser le contexte canvas');
      }

      // Capturer l'image actuelle
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Améliorer l'image pour une meilleure reconnaissance
      enhanceImage(context, canvas.width, canvas.height);

      // Simuler une reconnaissance OCR basique
      // En production, vous utiliseriez Tesseract.js ici

      
      setDetectedText(detectedText);
      
      // Traiter le texte détecté
      const allWords = detectedText.split(/[\s\n\r]+/)
        .map(word => word.trim())
        .filter(word => word.length > 0);

      const potentialCodes: PotentialCode[] = allWords
        .filter(word => isValidProductCode(word))
        .map(word => ({
          text: word,
          cleanText: word.replace(/[^\w\d-]/g, ''),
          priority: getCodePriority(word)
        }))
        .sort((a, b) => b.priority - a.priority);

      console.log('Codes potentiels:', potentialCodes);
      
      // Vérifier les codes UGS en priorité
      for (const code of potentialCodes) {
        const ugsCode = cleanUgsCode(code.text);
        if (ugsCode) {
          console.log('Code UGS trouvé:', ugsCode);
          await searchProduct(ugsCode);
          return;
        }
      }
      
      // Prendre le meilleur code
      if (potentialCodes.length > 0) {
        const bestCode = potentialCodes[0];
        let finalCode = bestCode.cleanText;
        
        if (/^\d+[-\s]*\d*$/.test(finalCode)) {
          finalCode = finalCode.replace(/\D/g, '');
        }
        
        console.log('Meilleur code trouvé:', finalCode);
        await searchProduct(finalCode);
        return;
      }
      
      setError('Aucun code produit valide détecté. Essayez de positionner le texte plus clairement.');
      
    } catch (error) {
      console.error('Erreur OCR:', error);
      setError('Erreur lors de l\'analyse. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  }, [isCameraReady, enhanceImage, isValidProductCode, getCodePriority, cleanUgsCode, searchProduct]);

  const handleManualSearch = useCallback((): void => {
    if (manualCode.trim()) {
      searchProduct(manualCode.trim());
    }
  }, [manualCode, searchProduct]);

  // Initialisation de la caméra
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
        
        if (scannerRef.current) {
          let video = scannerRef.current.querySelector('video');
          if (!video) {
            video = document.createElement('video');
            video.setAttribute('playsinline', '');
            video.style.width = '100%';
            video.style.height = '300px';
            video.style.objectFit = 'cover';
            scannerRef.current.appendChild(video);
          }
          
          video.srcObject = stream;
          video.play();
          videoRef.current = video;
          
          video.addEventListener('loadedmetadata', () => {
            setIsCameraReady(true);
          });
        }
      } catch (err) {
        console.error('Erreur caméra:', err);
        setError('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
      }
    };

    if (!isLoading) {
      initCamera();
    }

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isLoading]);

  return (
    <div className="min-h-screen bg-gray-100 py-4 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800">{loadingMessage}</h2>
          </div>
        ) : (
          <>
            <div className="p-6">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Scanneur de Produits</h1>
              <p className="text-gray-600 mb-4">Pointez la caméra sur un code-barre ou un texte.</p>
              
              <div ref={scannerRef} className="mb-4 bg-black rounded-lg overflow-hidden relative">
                {!isCameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-gray-500">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mx-auto mb-2"></div>
                      <p>Initialisation de la caméra...</p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}

              {detectedText && (
                <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
                  <p className="font-semibold">Texte détecté:</p>
                  <pre className="text-sm whitespace-pre-wrap">{detectedText}</pre>
                </div>
              )}

              <div className="space-y-3">
                <button 
                  onClick={handleOcrScan} 
                  disabled={isLoading || !isCameraReady}
                  className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isCameraReady ? 'Scanner Texte' : 'Caméra non prête'}
                </button>
                
                <input 
                  type="text" 
                  value={manualCode} 
                  onChange={(e) => setManualCode(e.target.value)} 
                  placeholder="Entrez sku ou upc"
                  disabled={isLoading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
                
                <button 
                  onClick={handleManualSearch} 
                  disabled={isLoading || !manualCode.trim()}
                  className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Rechercher
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;