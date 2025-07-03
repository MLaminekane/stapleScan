import { useState, useEffect, useRef, useCallback } from 'react';
import Quagga from 'quagga';
import Tesseract from 'tesseract.js';
import './App.css';

// Types for the data fetched from our serverless function
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

function App() {
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [productData, setProductData] = useState<ProductData | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const searchProduct = useCallback(async (code: string) => {
    if (!code || isLoading) return;

    setError('');
    setLoadingMessage('Recherche du produit...');
    setIsLoading(true);

    try {
      const response = await fetch(`/api/stock?sku=${code}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Produit non trouvé.');
      }
      const data: ProductData = await response.json();
      setProductData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const handleOcrScan = async () => {
    if (!videoRef.current) return;

    setError('');
    setLoadingMessage('Analyse du texte...');
    setIsLoading(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      const { data: { text } } = await Tesseract.recognize(canvas, 'fra');
      const lines = text.split('\n');
      let foundCode = '';

      for (const line of lines) {
        const ugsMatch = line.match(/(?:UGS|SKU)[:\s]*([\d-]+)/i);
        if (ugsMatch && ugsMatch[1]) {
          foundCode = ugsMatch[1].replace(/-/g, '');
          break;
        }
        const modeleMatch = line.match(/Mod.le[:\s]*([\w\d/]+)/i);
        if (modeleMatch && modeleMatch[1]) {
          foundCode = modeleMatch[1];
          break;
        }
      }

      if (foundCode) {
        await searchProduct(foundCode);
      } else {
        setError('Aucun code UGS ou Modèle trouvé.');
      }
    } catch {
      setError('Erreur lors de l\'analyse du texte.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = () => {
    setProductData(null);
    setError('');
    setManualCode('');
  };

  useEffect(() => {
    if (productData || isLoading) {
      Quagga.stop();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDetected = (result: any) => {
      if (result.codeResult.code) searchProduct(result.codeResult.code);
    };

    if (scannerRef.current) {
      Quagga.init({
        inputStream: {
          name: "Live", type: "LiveStream", target: scannerRef.current,
          constraints: { width: 480, height: 320, facingMode: "environment" },
        },
        decoder: { readers: ['ean_reader', 'upc_reader', 'code_128_reader'] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }, (err: any) => {
        if (err) {
          if (!error) setError('Erreur: Impossible d\'accéder à la caméra.');
          return;
        }
        Quagga.start();
        videoRef.current = scannerRef.current?.querySelector('video') || null;
      });
      Quagga.onDetected(onDetected);
      return () => {
        Quagga.offDetected(onDetected);
        Quagga.stop();
      };
    }
  }, [isLoading, searchProduct, productData, error]);

  if (isLoading) {
    return <div className="container"><h1>{loadingMessage}</h1></div>;
  }

  if (productData) {
    return (
      <div className="container results-container">
        <button onClick={resetState} className="back-button">← Nouvelle Recherche</button>
        <div className="product-info">
          <img src={productData.imageUrl} alt={productData.name} className="product-image" />
          <h2>{productData.name}</h2>
          <p className="product-price">{productData.price}</p>
          <p className="product-sku">SKU: {productData.sku}</p>
        </div>
        <h3>Disponibilité en magasin</h3>
        <ul className="store-list">
          {productData.stores.map((store, index) => (
            <li key={index} className="store-item">
              <span className="store-address">{store.address} ({store.distance})</span>
              <span className={`store-stock stock-${store.stock}`}>{store.stock} en stock</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="container">
        <h1>Scanneur de Produits</h1>
        <p>Pointez la caméra sur un code-barres ou un texte.</p>
        <div ref={scannerRef} className="scanner-container"></div>
        {error && <p className="error-message">{error}</p>}
        <div className="action-buttons">
          <button onClick={handleOcrScan}>Scanner Texte</button>
        </div>
        <div className="manual-search">
          <input 
            type="text" 
            value={manualCode} 
            onChange={(e) => setManualCode(e.target.value)} 
            placeholder="Entrez un code manuellement"
          />
          <button onClick={() => searchProduct(manualCode)}>Rechercher</button>
        </div>
      </div>
    </div>
  );
}

export default App;
