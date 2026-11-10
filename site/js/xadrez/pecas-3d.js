import * as THREE from './vendor/three.module.js';

// Render the six solid models once per material, then reuse the resulting images on the board.
export function criarPecas3D() {
  const imagens = {};
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(384, 384);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const cena = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.12, 1.12, 1.12, -1.12, 0.1, 30);
    camera.position.set(3, 4, 8); camera.lookAt(0, 1.02, 0);
    cena.add(new THREE.HemisphereLight(0xfff5dc, 0x35434a, 1.45));
    const luz = new THREE.DirectionalLight(0xffffff, 2.3); luz.position.set(-4, 8, 7); cena.add(luz);
    const contraluz = new THREE.DirectionalLight(0xb4d3dc, 1.3); contraluz.position.set(5, 4, -4); cena.add(contraluz);
    function textura(cor) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = cor === 'b' ? '#f1e4cd' : '#4b5659'; ctx.fillRect(0, 0, 256, 256);
      // Fine, restrained veins give the surfaces a natural polished appearance.
      for (let i = 0; i < 36; i++) {
        const x = (i * 79 + 17) % 256;
        ctx.strokeStyle = cor === 'b' ? `rgba(141,110,72,${i % 5 === 0 ? .09 : .035})` : `rgba(155,183,179,${i % 6 === 0 ? .13 : .045})`;
        ctx.lineWidth = i % 6 === 0 ? 1.3 : .55;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 18, 85, x - 15, 170, x + 8, 256); ctx.stroke();
      }
      const mapa = new THREE.CanvasTexture(canvas); mapa.colorSpace = THREE.SRGBColorSpace; return mapa;
    }
    const texturaMarfim = textura('b'), texturaObsidiana = textura('p');
    const materiais = {
      b: new THREE.MeshPhysicalMaterial({ color: 0xf8eedb, map: texturaMarfim, roughness: .29, clearcoat: .35, clearcoatRoughness: .23 }),
      p: new THREE.MeshPhysicalMaterial({ color: 0xc2cfd0, map: texturaObsidiana, roughness: .26, metalness: .1, clearcoat: .8, clearcoatRoughness: .15 }),
    };
    const perfilBase = [[0,0],[.58,0],[.64,.06],[.64,.13],[.58,.18],[.52,.2],[.5,.25],[.55,.28],[.55,.33],[.47,.37],[.35,.41]];
    const perfis = {
      p: [[.25,.52],[.18,.94],[.27,1.03],[.27,1.1]],
      r: [[.35,.44],[.31,1.15],[.4,1.18],[.43,1.27],[.43,1.34]],
      n: [[.3,.43],[.28,.67]],
      b: [[.27,.48],[.21,.94],[.33,1.02],[.34,1.1],[.22,1.18],[.25,1.34],[.18,1.58],[0,1.82]],
      q: [[.27,.48],[.19,1.1],[.35,1.2],[.4,1.29],[.4,1.35],[.32,1.4],[.38,1.65],[.28,1.69]],
      k: [[.28,.48],[.21,1.2],[.36,1.3],[.37,1.4],[.29,1.45],[.32,1.63],[.24,1.69]],
    };
    const adicionar = (grupo, geometria, material, x, y, z) => { const mesh = new THREE.Mesh(geometria, material); mesh.position.set(x,y,z); grupo.add(mesh); return mesh; };
    for (const [cor, material] of Object.entries(materiais)) for (const tipo of ['p','r','n','b','q','k']) {
      const grupo = new THREE.Group();
      const pontos = [...perfilBase,...perfis[tipo]].map(([r,y]) => new THREE.Vector2(r,y));
      grupo.add(new THREE.Mesh(new THREE.LatheGeometry(pontos, 48), material));
      if (tipo === 'p') adicionar(grupo, new THREE.SphereGeometry(.25,32,20),material,0,1.31,0);
      if (tipo === 'r') {
        adicionar(grupo,new THREE.CylinderGeometry(.41,.41,.12,48),material,0,1.36,0);
        for (let i=0;i<6;i++) { const a=i*Math.PI/3; const bloco=adicionar(grupo,new THREE.BoxGeometry(.18,.18,.18),material,.34*Math.cos(a),1.5,.34*Math.sin(a)); bloco.rotation.y=-a; }
      }
      if (tipo === 'q') {
        for(let i=0;i<8;i++){ const a=i*Math.PI/4; adicionar(grupo,new THREE.SphereGeometry(.075,16,12),material,.33*Math.cos(a),1.72,.33*Math.sin(a)); }
        adicionar(grupo,new THREE.SphereGeometry(.13,24,16),material,0,1.78,0);
      }
      if (tipo === 'k') {
        adicionar(grupo,new THREE.BoxGeometry(.13,.37,.12),material,0,1.87,0);
        adicionar(grupo,new THREE.BoxGeometry(.32,.12,.12),material,0,1.92,0);
      }
      if (tipo === 'n') {
        const forma = new THREE.Shape();
        forma.moveTo(-.33,.58); forma.lineTo(.25,.58);
        forma.bezierCurveTo(.23,.78,.12,.91,.20,1.02);
        forma.lineTo(.39,1.06); forma.bezierCurveTo(.46,1.08,.49,1.16,.43,1.23);
        forma.lineTo(.22,1.34); forma.lineTo(.12,1.59); forma.lineTo(.01,1.49);
        forma.lineTo(-.13,1.58); forma.lineTo(-.18,1.37);
        forma.bezierCurveTo(-.46,1.23,-.45,.84,-.33,.58);

        const cabeca=adicionar(grupo,new THREE.ExtrudeGeometry(forma,{depth:.25,bevelEnabled:true,bevelThickness:.07,bevelSize:.05,bevelSegments:3,steps:1}),material,0,0,-.125);
        cabeca.rotation.y=-.25;
        const olhoMaterial=new THREE.MeshStandardMaterial({color:cor==='b'?0x8e795d:0x84999b,roughness:.4});
        adicionar(grupo,new THREE.SphereGeometry(.04,16,12),olhoMaterial,.09,1.3,.20);
        adicionar(grupo,new THREE.SphereGeometry(.025,12,8),olhoMaterial,.34,1.15,.19);
        grupo.userData.olhoMaterial=olhoMaterial;
      }
      cena.add(grupo); renderer.render(cena,camera); imagens[cor==='b'?tipo.toUpperCase():tipo]=renderer.domElement.toDataURL('image/png'); cena.remove(grupo);
      grupo.traverse(objeto=>{if(objeto.geometry) objeto.geometry.dispose();}); grupo.userData.olhoMaterial?.dispose();
    }
    Object.values(materiais).forEach(material=>material.dispose()); texturaMarfim.dispose(); texturaObsidiana.dispose();
  } catch { return {}; } finally { renderer?.dispose(); renderer?.forceContextLoss(); }
  return imagens;
}
