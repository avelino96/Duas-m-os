import { useState, type FormEvent } from 'react';

const inputClass = 'mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

type Definicoes = {
  servicos: string;
  links: string;
  dias: string;
  envio: string;
  provedor: string;
};

export default function ConfiguracaoAgente() {
  const [form, setForm] = useState<Definicoes>({ servicos: '', links: '', dias: '', envio: '', provedor: '' });
  const [revisao, setRevisao] = useState<Definicoes | null>(null);
  const [error, setError] = useState('');

  function change(field: keyof Definicoes, value: string) {
    setForm(current => ({ ...current, [field]: value }));
    setRevisao(null);
    setError('');
  }

  function revisar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dias = Number(form.dias);
    if (!form.servicos.trim() || !Number.isSafeInteger(dias) || dias < 1 || !form.envio) {
      setError('Informe os serviços, um número inteiro de dias maior que zero e a forma de envio.');
      return;
    }
    if (form.envio === 'automatico' && !form.provedor.trim()) {
      setError('Informe qual serviço fará o envio automático ou escreva que precisa de orientação para escolher.');
      return;
    }
    setError('');
    setRevisao({ ...form, servicos: form.servicos.trim(), links: form.links.trim(), provedor: form.provedor.trim() });
  }

  return (
    <section aria-labelledby="configuracao-agente-titulo" className="space-y-6 text-foreground">
      <div className="space-y-2">
        <h2 id="configuracao-agente-titulo" className="text-2xl font-semibold tracking-tight">Configuração do agente</h2>
        <p className="text-sm text-muted-foreground">Defina as conexões desejadas antes de implementar as integrações e automatizar o acompanhamento.</p>
      </div>
      <div className="rounded-xl border bg-muted p-4 text-sm">
        <p className="font-medium">Integrações ainda não ativadas</p>
        <p className="mt-2 text-muted-foreground">Este formulário prepara um rascunho para revisão. Não conecta serviços, não envia mensagens e não altera o prazo atual de 3 dias. As informações não são salvas e serão perdidas ao sair da tela ou recarregar a página.</p>
      </div>
      <form onSubmit={revisar} className="space-y-5 rounded-xl border bg-card p-5 text-card-foreground">
        <label className="block text-sm font-medium" htmlFor="agente-servicos">
          Quais serviços serão conectados e para quê?
          <textarea id="agente-servicos" required rows={3} className={inputClass} placeholder="Informe os serviços e se serão usados para consultar compras, receber atualizações ou enviar mensagens." value={form.servicos} onChange={event => change('servicos', event.target.value)} />
        </label>
        <label className="block text-sm font-medium" htmlFor="agente-links">
          Links dos serviços desejados
          <textarea id="agente-links" rows={3} className={inputClass} placeholder="Um link público por linha. Se ainda não souber, deixe em branco." aria-describedby="agente-links-ajuda" value={form.links} onChange={event => change('links', event.target.value)} />
        </label>
        <p id="agente-links-ajuda" className="text-xs text-muted-foreground">Não informe senhas, tokens, chaves de acesso nem links com credenciais. Nenhum link será acessado por este formulário.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium" htmlFor="agente-dias">
            Após quantos dias o cliente fica inativo?
            <input id="agente-dias" required type="number" min="1" step="1" className={inputClass} placeholder="Prazo atual: 3 dias" value={form.dias} onChange={event => change('dias', event.target.value)} />
          </label>
          <label className="block text-sm font-medium" htmlFor="agente-envio">
            Como será feito o envio pelo WhatsApp?
            <select id="agente-envio" required className={inputClass} value={form.envio} onChange={event => change('envio', event.target.value)}>
              <option value="">Selecione</option>
              <option value="manual">Manual, com abertura do WhatsApp</option>
              <option value="automatico">Automático, por serviço de envio</option>
              <option value="definir">Preciso de orientação para escolher</option>
            </select>
          </label>
        </div>
        {form.envio === 'automatico' && <label className="block text-sm font-medium" htmlFor="agente-provedor">
          Qual serviço fará o envio automático?
          <input id="agente-provedor" required className={inputClass} placeholder="Nome do serviço ou pedido de orientação" value={form.provedor} onChange={event => change('provedor', event.target.value)} />
        </label>}
        {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <button type="submit" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Revisar definições</button>
      </form>
      <section className="space-y-3 rounded-xl border bg-card p-5 text-card-foreground" aria-labelledby="agente-regras">
        <h3 id="agente-regras" className="text-lg font-semibold">Regras do acompanhamento</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Considerar a última compra com status confirmado em pedidos.</li>
          <li>Selecionar somente clientes com autoriza_mensagens habilitado. Clientes sem compra confirmada ficam fora da seleção.</li>
          <li>Vincular cada registro em contatos_whatsapp ao cliente e à compra de referência, evitando outro registro para a mesma compra.</li>
          <li>Uma nova compra confirmada inicia um novo período de acompanhamento. Alterar o prazo não libera outro contato para a mesma compra.</li>
          <li>Registrar um contato não comprova envio ou entrega. O envio automático depende da integração escolhida.</li>
        </ul>
      </section>
      {revisao && <section aria-labelledby="agente-revisao" className="space-y-4 rounded-xl border bg-muted p-5">
        <h3 id="agente-revisao" className="text-lg font-semibold">Definições para esclarecer antes da integração</h3>
        <dl className="space-y-3 text-sm">
          <div><dt className="font-medium">Serviços e objetivos</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{revisao.servicos}</dd></div>
          <div><dt className="font-medium">Links</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{revisao.links || 'Ainda não informados'}</dd></div>
          <div><dt className="font-medium">Inatividade desejada</dt><dd className="mt-1 text-muted-foreground">{revisao.dias} dia(s) completos desde a última compra confirmada</dd></div>
          <div><dt className="font-medium">Envio</dt><dd className="mt-1 break-words text-muted-foreground">{revisao.envio === 'manual' ? 'Manual, com abertura do WhatsApp' : revisao.envio === 'automatico' ? `Automático: ${revisao.provedor}` : 'Forma de envio ainda a definir'}</dd></div>
        </dl>
        <p role="status" className="text-sm font-medium">Rascunho revisado, não salvo nem aplicado. Informe essas definições na conversa para esclarecer as integrações antes da implementação.</p>
      </section>}
    </section>
  );
}
