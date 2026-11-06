// useFormulario.js — valores, erros por campo e erros vindos da API (422) num lugar só.
//
//   const f = useFormulario({ nome: '', email: '' });
//   <input value={f.valores.nome} onChange={f.campo('nome')} />
//   if (!f.validar({ nome: (v) => (!v.trim() ? 'Informe o nome.' : '') })) return;
//   try { ... } catch (err) { if (!f.errosDaApi(err)) toast(err.message, 'erro'); }

import { useCallback, useState } from 'react';

export function useFormulario(inicial) {
  const [valores, setValores] = useState(inicial);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');

  const definir = useCallback((nome, valor) => {
    setValores((v) => ({ ...v, [nome]: valor }));
    setErros((e) => (e[nome] ? { ...e, [nome]: '' } : e));
    setErroGeral('');
  }, []);

  // onChange pronto para <input>, <select>, <textarea> e checkbox
  const campo = useCallback(
    (nome) => (e) => definir(nome, e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e),
    [definir]
  );

  // regras: { campo: (valor, todos) => 'mensagem' | '' }
  function validar(regras) {
    const novos = {};
    for (const [nome, regra] of Object.entries(regras)) {
      const msg = regra(valores[nome], valores);
      if (msg) novos[nome] = msg;
    }
    setErros(novos);
    const primeiro = Object.keys(novos)[0];
    if (primeiro) document.getElementById(`campo-${primeiro}`)?.focus();
    return !primeiro;
  }

  // Erros 422 da API ({ detalhes: [{ campo, mensagem }] }) aparecem embaixo de cada campo
  function errosDaApi(err) {
    if (!err?.detalhes?.length) {
      setErroGeral(err?.message || 'Não foi possível salvar.');
      return false;
    }
    const novos = {};
    const soltos = [];
    for (const d of err.detalhes) {
      const nome = String(d.campo).split('.')[0];
      if (nome in valores) novos[nome] = novos[nome] || d.mensagem;
      else soltos.push(d.mensagem);
    }
    setErros(novos);
    setErroGeral(soltos.join(' '));
    return true;
  }

  const reiniciar = useCallback((novo) => {
    setValores(novo ?? inicial);
    setErros({});
    setErroGeral('');
  }, [inicial]);

  return { valores, setValores, definir, campo, erros, setErros, erroGeral, setErroGeral, validar, errosDaApi, reiniciar };
}

// Regras comuns
export const obrigatorio = (msg) => (v) => (v === null || v === undefined || String(v).trim() === '' ? msg : '');
export const minimo = (n, msg) => (v) => (String(v || '').trim().length < n ? msg : '');
export const emailValido = (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? 'Formato de e-mail inválido.' : '');
export const telefoneValido = (v) => (v && !/^[0-9()+\-\s]{8,20}$/.test(String(v).trim()) ? 'Use apenas números, espaços, parênteses e hífen.' : '');
