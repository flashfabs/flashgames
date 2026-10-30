import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiSalas } from '../netlify/functions/salas-farm.mjs';

function preparar() {
  const dados=new Map(); let agora=100000, sequencia=0;
  const armazem={
    async list({prefix}){return {blobs:[...dados.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};},
    async get(key){return dados.get(key)?.data ?? null;},
    async getWithMetadata(key){return dados.get(key) ?? null;},
    async setJSON(key,data,opcoes){const atual=dados.get(key);if((opcoes.onlyIfNew&&atual)||(opcoes.onlyIfMatch&&atual?.etag!==opcoes.onlyIfMatch))return {modified:false};dados.set(key,{data,etag:String(++sequencia)});return {modified:true};},
  };
  return {api:criarApiSalas({armazem,agora:()=>agora}),tempo:valor=>{agora+=valor;}};
}
const registro={codigo:'ABCDE',token:'12345678-1234-1234-1234-123456789abc',nome:'Fazenda',limite:4,ocupadas:2,bots:1,aberta:true};
const post=(corpo,origem='http://localhost:8793')=>new Request('http://localhost:8793/api/salas-farm',{method:'POST',headers:{origin:origem,'content-type':'application/json'},body:JSON.stringify(corpo)});
const get=()=>new Request('http://localhost:8793/api/salas-farm');
test('public rooms are listed without their secret and disappear when closed or expired',async()=>{
  const {api,tempo}=preparar();assert.equal((await api(post(registro))).status,200);let lista=await (await api(get())).json();assert.equal(lista.salas.length,1);assert.equal(lista.salas[0].nome,'Fazenda');assert.equal(lista.salas[0].tokenHash,undefined);
  assert.equal((await api(post({...registro,aberta:false}))).status,200);lista=await (await api(get())).json();assert.equal(lista.salas.length,0);
  await api(post(registro));tempo(61000);lista=await (await api(get())).json();assert.equal(lista.salas.length,0);
});
test('another host cannot overwrite a live room and invalid origins are rejected',async()=>{
  const {api}=preparar();await api(post(registro));assert.equal((await api(post({...registro,token:'87654321-1234-1234-1234-123456789abc'}))).status,409);assert.equal((await api(post(registro,'https://example.org'))).status,403);
});

test('a full room with bots remains discoverable because bots yield seats to people',async()=>{
  const {api}=preparar(); await api(post({...registro,limite:3,ocupadas:3,bots:2})); const lista=await (await api(get())).json(); assert.equal(lista.salas.length,1);
});
