import { useState, useEffect, useRef, useCallback } from 'react';
import Quagga from 'quagga';
import './App.css';

function App() {
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);

  const searchProduct = useCallback(async (code: string) => {
    if (!code || isLoading) return;

    setIsLoading(true);

    const fallbackUrl = `https://www.bureauengros.com/search?q=${code}`;
    const apiUrl = `https://www.bureauengros.com/proxy/product-search/v2/products/search?q=${code}&lang=fr`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await response.json();

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

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDetected = (result: any) => {
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
            width: 480,
            height: 320,
            facingMode: "environment"
          },
        },
        decoder: {
          readers: ['ean_reader', 'upc_reader', 'code_128_reader']
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }, (err: any) => {
        if (err) {
          console.error(err);
          setError('Erreur: Impossible d\'accéder à la caméra.');
          return;
        }
        Quagga.start();
      });

      Quagga.onDetected(onDetected);

      return () => {
        Quagga.offDetected(onDetected);
        Quagga.stop();
      };
    }
  }, [isLoading, searchProduct]);

  const handleManualSearch = () => {
    searchProduct(manualCode);
  };

  return (
    <div className="App">
      <div className="container">
        {isLoading ? (
          <div>
            <h1>Recherche en cours...</h1>
          </div>
        ) : (
          <>
            <h1>Scanneur de Produits</h1>
            <p>Pointez la caméra sur un code-barres ou entrez un code.</p>
            <div ref={scannerRef} className="scanner-container"></div>
            {error && <p className="error-message">{error}</p>}
            <div className="manual-search">
              <input 
                type="text" 
                value={manualCode} 
                onChange={(e) => setManualCode(e.target.value)} 
                placeholder="Entrez un code SKU ou UPC"
                disabled={isLoading}
              />
              <button onClick={handleManualSearch} disabled={isLoading}>
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
