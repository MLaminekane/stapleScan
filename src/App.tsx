import { useState, useEffect, useRef } from 'react';
import Quagga from 'quagga';
import './App.css';

function App() {
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const scannerRef = useRef<HTMLDivElement>(null);

  const searchProduct = (code: string) => {
    if (code) {
      window.location.href = `https://www.bureauengros.com/search?q=${code}`;
    }
  };

  useEffect(() => {
    if (scannerRef.current) {
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
          setError('Erreur: Impossible d\'accéder à la caméra. Veuillez vérifier les autorisations dans votre navigateur.');
          return;
        }
        Quagga.start();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Quagga.onDetected((result: any) => {
        if (result.codeResult.code) {
          Quagga.stop();
          searchProduct(result.codeResult.code);
        }
      });

      return () => {
        Quagga.stop();
      };
    }
  }, []);

  const handleManualSearch = () => {
    searchProduct(manualCode);
  };

  return (
    <div className="App">
      <div className="container">
        <h1>Scanneur de Produits</h1>
        <p>Pointez la caméra sur un code-barres ou entrez un code manuellement.</p>
        <div ref={scannerRef} className="scanner-container"></div>
        {error && <p className="error-message">{error}</p>}
        <div className="manual-search">
          <input 
            type="text" 
            value={manualCode} 
            onChange={(e) => setManualCode(e.target.value)} 
            placeholder="Entrez un code SKU ou UPC"
          />
          <button onClick={handleManualSearch}>Rechercher</button>
        </div>
      </div>
    </div>
  );
}

export default App;
