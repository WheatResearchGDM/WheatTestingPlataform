'use client';
import { useEffect, useState } from 'react';
import { diseaseOptions } from '../lib/diseaseRecord';


export default function DiseaseFields({ severity }: { severity: number }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { if (severity <= 1) setSelected([]); }, [severity]);
  if (severity <= 1) return null;
  return <fieldset className="disease-selection"><legend>Doenças identificadas · nota geral {severity}/5</legend><p>Selecione as doenças presentes. A nota geral acima é a única avaliação de severidade.</p><div>{diseaseOptions.map(([id, label]) => <label key={id}><input type="checkbox" name="diseases" value={id} checked={selected.includes(id)} onChange={(event) => setSelected(event.target.checked ? [...selected, id] : selected.filter((value) => value !== id))} />{label}</label>)}</div><label>Observações sobre doenças<textarea name="diseaseNotes" rows={2} placeholder={selected.includes('outros') ? 'Identifique a outra doença e descreva o que foi observado' : 'Descrição opcional do que foi observado'} /></label></fieldset>;
}
