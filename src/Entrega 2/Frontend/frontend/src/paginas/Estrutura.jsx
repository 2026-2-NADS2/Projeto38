// Estrutura.jsx — "Turmas e disciplinas" (coordenação). Cada aba fica num arquivo em paginas/estrutura/:
//   Turmas · Disciplinas · Vinculos (professores e grade) · Bimestres (ano letivo) · AreasTags

import { useState } from 'react';
import { useTitulo } from '../componentes/Basicos';
import { Abas, Topo } from '../componentes/Interface';
import AreasTags from './estrutura/AreasTags';
import Bimestres from './estrutura/Bimestres';
import Disciplinas from './estrutura/Disciplinas';
import Turmas from './estrutura/Turmas';
import Vinculos from './estrutura/Vinculos';

export default function Estrutura() {
  useTitulo('Turmas e disciplinas');
  const [aba, setAba] = useState('turmas');
  return (
    <>
      <Topo titulo="Turmas e disciplinas" descricao="Estrutura da escola: turmas, disciplinas, quem leciona o quê (com a grade), o calendário dos bimestres, áreas e tags." />
      <Abas
        rotulo="Seções"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'turmas', rotulo: 'Turmas' },
          { id: 'disciplinas', rotulo: 'Disciplinas' },
          { id: 'vinculos', rotulo: 'Professores e grade' },
          { id: 'bimestres', rotulo: 'Bimestres' },
          { id: 'areas', rotulo: 'Áreas e tags' },
        ]}
      />
      <div className="pilha">
        {aba === 'turmas' && <Turmas />}
        {aba === 'disciplinas' && <Disciplinas />}
        {aba === 'vinculos' && <Vinculos />}
        {aba === 'bimestres' && <Bimestres />}
        {aba === 'areas' && <AreasTags />}
      </div>
    </>
  );
}
