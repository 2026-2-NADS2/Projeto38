// Formulario.jsx — peças de formulário com rótulo, dica, erro e acessibilidade prontos.
//
//   <Campo nome="email" rotulo="E-mail" erro={f.erros.email} dica="Usado no login">
//     <input type="email" value={f.valores.email} onChange={f.campo('email')} />
//   </Campo>
// O Campo liga sozinho id, aria-invalid, aria-required e aria-describedby ao elemento filho.
// Campos obrigatórios (padrão) recebem um * visível e "obrigatório" para leitores de tela;
// os que não são levam opcional (aparece "(opcional)"). Campo desabilitado/somente leitura não leva *.

import { Children, cloneElement, isValidElement } from 'react';
import Icone from './Icone';

export function Campo({ nome, rotulo, erro, dica, opcional, obrigatorio, children, className = '' }) {
  const id = `campo-${nome}`;
  const idDica = dica ? `${id}-dica` : undefined;
  const idErro = `${id}-erro`;
  const filho = Children.only(children);
  const p = isValidElement(filho) ? filho.props : {};
  const exigido = obrigatorio ?? (!opcional && !p.disabled && !p.readOnly && p.type !== 'checkbox');
  const controle = isValidElement(filho)
    ? cloneElement(filho, {
        id,
        name: nome,
        'aria-invalid': erro ? true : undefined,
        'aria-required': exigido ? true : undefined,
        'aria-describedby': [idDica, erro ? idErro : null].filter(Boolean).join(' ') || undefined,
        className: `${filho.props.className || (filho.type === 'select' ? 'input select-campo' : 'input')}${erro ? ' invalido' : ''}`,
      })
    : filho;
  return (
    <div className={`campo ${className}`.trim()}>
      <label htmlFor={id}>
        {rotulo}
        {exigido && (
          <span className="obrigatorio" title="Campo obrigatório">
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obrigatório)</span>
          </span>
        )}
        {opcional && <span className="opcional"> (opcional)</span>}
      </label>
      {controle}
      {dica && (
        <small className="campo-dica" id={idDica}>
          {dica}
        </small>
      )}
      <small className="campo-erro" id={idErro} role={erro ? 'alert' : undefined}>
        {erro}
      </small>
    </div>
  );
}

// Mensagem de erro geral do formulário (falha que não é de um campo)
export function ErroFormulario({ children }) {
  if (!children) return null;
  return (
    <p className="erro-formulario" role="alert">
      <Icone nome="alerta" /> {children}
    </p>
  );
}

// Caixa de aviso / informação dentro das telas
export function Aviso({ tom = 'info', titulo, children, className = '' }) {
  const icone = { info: 'info', ok: 'check', warn: 'alerta', danger: 'x' }[tom] || 'info';
  return (
    <div className={`aviso-caixa aviso-${tom} ${className}`.trim()} role={tom === 'danger' ? 'alert' : 'note'}>
      <Icone nome={icone} tamanho={18} />
      <div>
        {titulo && <strong>{titulo}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
