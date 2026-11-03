'use client';
import { Component, type ReactNode } from 'react';

export default class ApplicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Field Wheat Testing:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-recovery"><h1>Não foi possível abrir esta tela</h1><p>Os cadastros não foram apagados. Reabra a plataforma ou baixe uma cópia dos dados locais para recuperação.</p><button type="button" onClick={() => window.location.reload()}>Reabrir plataforma</button><button type="button" onClick={() => {
      const data = Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('field-wheat-') || key.startsWith('fwt-')).map((key) => [key, localStorage.getItem(key)]));
      const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, createdAt: new Date().toISOString(), data })], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'field-wheat-recuperacao.json'; link.click(); URL.revokeObjectURL(url);
    }}>Baixar cópia dos dados locais</button><small>As fotos permanecem no navegador e não fazem parte deste arquivo de recuperação.</small></main>;
  }
}
