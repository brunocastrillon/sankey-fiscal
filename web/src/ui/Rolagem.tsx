import { useState, type ReactNode } from 'react';
import type { Layout } from '../layout/layout';
import { TEXTOS } from '../textos';

/** Contêiner rolável do celular: duas paradas (scroll-snap) e a dica "arraste →", que some na primeira rolagem. */
export function Rolagem({ layout, children }: { layout: Layout; children: ReactNode }) {
  const [dica, setDica] = useState(true);
  const paradas = layout.paradas;
  return (
    <div className="rolagem-moldura">
      <div
        className="rolagem"
        data-testid="rolagem"
        data-parada={paradas ? paradas.bordas.join(',') : undefined}
        tabIndex={0}
        role="region"
        aria-label={TEXTOS.ariaRolagem}
        onScroll={() => setDica(false)}
      >
        <div className="trilho" style={{ width: layout.largura }}>
          {paradas && (
            <>
              <span className="parada" style={{ left: 0 }} />
              <span className="parada" style={{ left: paradas.bordas[1] }} />
            </>
          )}
          {children}
        </div>
      </div>
      {paradas && dica && (
        <div className="dica" data-testid="dica" aria-hidden="true">
          {TEXTOS.dicaArraste}
        </div>
      )}
    </div>
  );
}
