import { winPercentFromCentipawns } from '@ccm/core';

export default function App() {
  return (
    <main>
      <h1>chess cheat metrics</h1>
      <p>Statistical anomaly reports for chess.com and lichess accounts.</p>
      <p>
        Scaffold check — win% at +100cp: {winPercentFromCentipawns(100).toFixed(1)} (expected
        ~59.1)
      </p>
    </main>
  );
}
