import { Component, type ReactNode } from 'react';
import { TEXTOS } from '../textos';

/** Captura erros de renderização do desenho e mostra uma mensagem em texto, em vez de deixar a página em branco. */
export class Protecao extends Component<{ children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  render() {
    if (this.state.falhou)
      return (
        <p className="erro" data-testid="erro" role="alert">
          {TEXTOS.erroDesenho}
        </p>
      );
    return this.props.children;
  }
}
