// Network outage for one page, written by front 4 (pavio-rede) on 28/10/2026 and kept here as an init script.
// window.__caos.cair(ms): for ms milliseconds nothing goes in or out on any RTCDataChannel or WebSocket, and every
// channel and socket that existed before or during the outage stays dead for good, like after a Wi-Fi switch: only
// links opened afterwards work. That is what makes the host reopen its signaling connection and the members
// reconnect. Optional: __caos.atrasoMs, __caos.variacaoMs and __caos.perdaRapida (fast channel only).

export function instalarCaos() {
  return (() => {
    if (window.__caos) return 'already';
    const caos = window.__caos = { voltaEm: 0, atrasoMs: 0, variacaoMs: 0, perdaRapida: 0, descartados: 0 };
    const morto = objeto => performance.now() < caos.voltaEm || caos.vitimas.has(objeto);
    caos.vitimas = new WeakSet();
    const vistos = new Set();
    caos.cair = ms => {
      caos.voltaEm = performance.now() + ms;
      for (const objeto of vistos) caos.vitimas.add(objeto);
      vistos.clear();
      return `down for ${ms} ms`;
    };
    const registrar = objeto => {
      if (caos.vitimas.has(objeto) || vistos.has(objeto)) return;
      if (performance.now() < caos.voltaEm) caos.vitimas.add(objeto);
      else vistos.add(objeto);
    };
    for (const Classe of [RTCDataChannel, WebSocket]) {
      const send = Classe.prototype.send;
      Classe.prototype.send = function (dados) {
        registrar(this);
        if (morto(this)) { caos.descartados++; return; }
        const rapido = this.label === 'salinha-rapido';
        if (rapido && Math.random() < caos.perdaRapida) { caos.descartados++; return; }
        if (!caos.atrasoMs) return send.call(this, dados);
        const atraso = caos.atrasoMs + (rapido ? (Math.random() * 2 - 1) * caos.variacaoMs : 0);
        setTimeout(() => { if (this.readyState === 'open' || this.readyState === 1) send.call(this, dados); }, Math.max(0, atraso));
      };
      const add = Classe.prototype.addEventListener;
      Classe.prototype.addEventListener = function (tipo, f, ...resto) {
        registrar(this);
        if (tipo !== 'message') return add.call(this, tipo, f, ...resto);
        const alvo = this;
        return add.call(this, tipo, function (e) { if (!morto(alvo)) return f.call(this, e); }, ...resto);
      };
      const desc = Object.getOwnPropertyDescriptor(Classe.prototype, 'onmessage');
      Object.defineProperty(Classe.prototype, 'onmessage', {
        configurable: true,
        get() { return desc.get.call(this); },
        set(f) { registrar(this); const alvo = this; desc.set.call(this, f && function (e) { if (!morto(alvo)) return f.call(this, e); }); },
      });
    }
    return 'installed';
  })();
}
