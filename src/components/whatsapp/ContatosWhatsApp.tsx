import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import ConfiguracaoAgente from './ConfiguracaoAgente';

type Cliente = { id: string; usuario_id: string; nome: string; telefone_whatsapp: string; autoriza_mensagens: boolean };
type Pedido = { id: string; cliente_id: string; data_compra: string; status: string };
type Contato = { id: string; cliente_id: string; data_contato: string; status_envio: string; compra_referencia_id: string };
type Aba = 'oportunidades' | 'clientes' | 'pedidos' | 'historico' | 'configuracao';
type Props = { supabase: SupabaseClient };

const inputClass = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const buttonClass = 'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryClass = 'inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50';
const emptyCliente = { id: '', nome: '', telefone_whatsapp: '', autoriza_mensagens: false };
const emptyPedido = { id: '', cliente_id: '', data_compra: '', status: 'pendente' };
const emptyContato = { cliente_id: '', compra_referencia_id: '', data_contato: '', status_envio: 'pendente' };
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const formatDate = (value: string) => dateFormatter.format(new Date(value));
function localDate(value = new Date().toISOString()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function errorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error && error.code === '23505') return 'Já existe um contato registrado para esse cliente e essa compra de referência.';
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Não foi possível concluir a operação. Tente novamente.';
}

// Recebe a mesma instância autenticada utilizada pelo restante do aplicativo.
// As consultas usam a sessão do usuário; não utilizam credenciais administrativas.
export default function ContatosWhatsApp({ supabase }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [aba, setAba] = useState<Aba>('oportunidades');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [clienteForm, setClienteForm] = useState(emptyCliente);
  const [pedidoForm, setPedidoForm] = useState(emptyPedido);
  const [contatoForm, setContatoForm] = useState(emptyContato);
  const [filterCliente, setFilterCliente] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const ownerRef = useRef<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const applySession = (id: string | null) => {
      if (!active) return;
      if (ownerRef.current !== id) {
        ownerRef.current = id;
        setClientes([]); setPedidos([]); setContatos([]); setLoaded(false);
        setClienteForm(emptyCliente); setPedidoForm(emptyPedido); setContatoForm(emptyContato);
        setError(''); setNotice(''); setFilterCliente('');
      }
      setUserId(id);
      setAuthReady(true);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      applySession(session?.user.id ?? null);
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || receivedAuthEvent) return;
      applySession(data.session?.user.id ?? null);
      if (sessionError) setError(sessionError.message);
    }).catch((err: unknown) => {
      if (!active || receivedAuthEvent) return;
      applySession(null); setError(errorMessage(err));
    });
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { active = false; ownerRef.current = null; subscription.unsubscribe(); window.clearInterval(timer); };
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true); setLoaded(false); setError('');
    // Paginação evita calcular a última compra sobre uma lista truncada.
    async function readAll<T>(table: 'clientes' | 'pedidos' | 'contatos_whatsapp', columns: string): Promise<T[]> {
      const rows: T[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        if (!active) return [];
        let query = supabase.from(table).select(columns).order('id').range(offset, offset + pageSize - 1);
        if (table === 'clientes') query = query.eq('usuario_id', userId);
        const { data, error: queryError } = await query;
        if (queryError) throw queryError;
        const page = (data ?? []) as unknown as T[];
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    }
    void Promise.all([
      readAll<Cliente>('clientes', 'id,usuario_id,nome,telefone_whatsapp,autoriza_mensagens'),
      readAll<Pedido>('pedidos', 'id,cliente_id,data_compra,status'),
      readAll<Contato>('contatos_whatsapp', 'id,cliente_id,data_contato,status_envio,compra_referencia_id'),
    ]).then(([nextClientes, nextPedidos, nextContatos]) => {
      if (!active) return;
      setClientes(nextClientes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setPedidos(nextPedidos.sort((a, b) => Date.parse(b.data_compra) - Date.parse(a.data_compra)));
      setContatos(nextContatos.sort((a, b) => Date.parse(b.data_contato) - Date.parse(a.data_contato)));
      setNow(Date.now()); setLoaded(true);
    }).catch((err: unknown) => { if (active) setError(errorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [supabase, userId, revision]);

  const clienteMap = useMemo(() => new Map(clientes.map(cliente => [cliente.id, cliente])), [clientes]);
  const pedidoMap = useMemo(() => new Map(pedidos.map(pedido => [pedido.id, pedido])), [pedidos]);
  const contactMap = useMemo(() => new Map(contatos.map(contato => [`${contato.cliente_id}:${contato.compra_referencia_id}`, contato])), [contatos]);
  const oportunidades = useMemo(() => {
    const ultimas = new Map<string, Pedido>();
    for (const pedido of pedidos) {
      if (pedido.status !== 'confirmado') continue;
      const anterior = ultimas.get(pedido.cliente_id);
      if (!anterior || Date.parse(pedido.data_compra) > Date.parse(anterior.data_compra)) ultimas.set(pedido.cliente_id, pedido);
    }
    return clientes.flatMap(cliente => {
      const compra = ultimas.get(cliente.id);
      if (!cliente.autoriza_mensagens || !compra || now - Date.parse(compra.data_compra) < 3 * 86400000) return [];
      return [{ cliente, compra, contato: contactMap.get(`${cliente.id}:${compra.id}`) }];
    }).sort((a, b) => Date.parse(a.compra.data_compra) - Date.parse(b.compra.data_compra));
  }, [clientes, pedidos, contactMap, now]);

  async function save(operation: (owner: string) => Promise<void>, reset: () => void) {
    if (savingRef.current || !userId || !loaded || loading) return;
    const owner = userId;
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (data.session?.user.id !== owner || ownerRef.current !== owner) throw new Error('Sua sessão mudou. Entre novamente para continuar.');
      await operation(owner);
      if (ownerRef.current !== owner) return;
      reset(); setNotice('Registro salvo com sucesso.'); setLoaded(false); setRevision(value => value + 1);
    } catch (err) {
      if (ownerRef.current === owner) setError(errorMessage(err));
    } finally { savingRef.current = false; setSaving(false); }
  }

  function saveCliente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(async owner => {
      const nome = clienteForm.nome.trim();
      const telefone_whatsapp = clienteForm.telefone_whatsapp.trim();
      if (!nome || telefone_whatsapp.replace(/\D/g, '').length < 8) throw new Error('Informe o nome e um telefone WhatsApp válido com DDD.');
      const payload = { nome, telefone_whatsapp, autoriza_mensagens: clienteForm.autoriza_mensagens };
      const query = clienteForm.id
        ? supabase.from('clientes').update(payload).eq('id', clienteForm.id).eq('usuario_id', owner)
        : supabase.from('clientes').insert({ ...payload, usuario_id: owner });
      const { error: writeError } = await query.select('id').single();
      if (writeError) throw writeError;
    }, () => setClienteForm(emptyCliente));
  }

  function savePedido(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(async () => {
      if (!clienteMap.has(pedidoForm.cliente_id)) throw new Error('Selecione um cliente disponível.');
      const status = pedidoForm.status.trim();
      if (!status) throw new Error('Informe o status do pedido.');
      const payload = { cliente_id: pedidoForm.cliente_id, data_compra: new Date(pedidoForm.data_compra).toISOString(), status };
      const query = pedidoForm.id
        ? supabase.from('pedidos').update(payload).eq('id', pedidoForm.id)
        : supabase.from('pedidos').insert(payload);
      const { error: writeError } = await query.select('id').single();
      if (writeError) throw writeError;
    }, () => setPedidoForm(emptyPedido));
  }

  function saveContato(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(async owner => {
      const compra = pedidoMap.get(contatoForm.compra_referencia_id);
      if (!compra || compra.cliente_id !== contatoForm.cliente_id) throw new Error('Selecione uma compra pertencente ao cliente.');
      if (contactMap.has(`${compra.cliente_id}:${compra.id}`)) throw new Error('Esse contato já está registrado para a compra selecionada.');
      const { data: clienteAtual, error: readError } = await supabase.from('clientes').select('autoriza_mensagens').eq('id', compra.cliente_id).eq('usuario_id', owner).single();
      if (readError) throw readError;
      if (!clienteAtual.autoriza_mensagens) throw new Error('O cliente não autorizou mensagens.');
      const status_envio = contatoForm.status_envio.trim();
      if (!status_envio) throw new Error('Informe o status do contato.');
      const { error: writeError } = await supabase.from('contatos_whatsapp').insert({
        cliente_id: compra.cliente_id,
        compra_referencia_id: compra.id,
        data_contato: new Date(contatoForm.data_contato).toISOString(),
        status_envio,
      }).select('id').single();
      if (writeError) throw writeError;
    }, () => setContatoForm(emptyContato));
  }

  const disabled = saving || loading || !loaded;
  const clienteOptions = clientes.map(cliente => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>);
  const filteredPedidos = pedidos.filter(pedido => !filterCliente || pedido.cliente_id === filterCliente);
  const filteredContatos = contatos.filter(contato => !filterCliente || contato.cliente_id === filterCliente);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-3xl font-bold tracking-tight">Contatos WhatsApp</h1><p className="mt-2 text-sm text-muted-foreground">Clientes, compras e acompanhamento de contatos em um só lugar.</p></div>
          {userId && <button type="button" className={secondaryClass} disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Atualizar dados</button>}
        </header>
        {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
        {notice && <div role="status" className="rounded-lg border bg-muted p-4 text-sm">{notice}</div>}
        {!authReady ? <p className="rounded-lg border p-6 text-center text-muted-foreground">Verificando sessão…</p> : !userId ? <section className="flex min-h-64 flex-col items-center justify-center rounded-xl border bg-card p-8 text-center"><h2 className="text-xl font-semibold">Entre na sua conta</h2><p className="mt-2 text-muted-foreground">Use o acesso existente do aplicativo para consultar seus clientes e pedidos.</p></section> : <>
          <nav aria-label="Seções do agente de contatos" className="flex flex-wrap gap-2 rounded-lg border bg-card p-2">
            {([['oportunidades', 'Oportunidades'], ['clientes', 'Clientes'], ['pedidos', 'Pedidos'], ['historico', 'Histórico'], ['configuracao', 'Configuração do agente']] as const).map(([key, label]) => <button key={key} type="button" aria-current={aba === key ? 'page' : undefined} className={aba === key ? buttonClass : secondaryClass} onClick={() => setAba(key)}>{label}</button>)}
          </nav>
          <div hidden={aba !== 'configuracao'}><ConfiguracaoAgente key={userId} /></div>
          {loading && <p role="status" className="text-sm text-muted-foreground">Carregando registros…</p>}
          {!loading && !loaded && <p className="rounded-lg border p-6 text-center text-muted-foreground">Os dados não estão disponíveis. Use Atualizar dados para tentar novamente.</p>}
          {loaded && <>
            {aba === 'oportunidades' && <section className="space-y-4">
              <div><h2 className="text-xl font-semibold">Clientes há pelo menos 3 dias sem compra confirmada</h2><p className="mt-2 text-sm text-muted-foreground">Somente clientes que autorizaram mensagens. O prazo é de 72 horas desde a última compra confirmada. Clientes sem compra confirmada não entram nesta seleção.</p></div>
              <p className="text-sm font-medium">{oportunidades.length} elegíveis · {oportunidades.filter(item => !item.contato).length} sem contato registrado para a compra</p>
              {oportunidades.length === 0 && <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Nenhum cliente atende aos critérios neste momento.</p>}
              <div className="grid gap-4 md:grid-cols-2">{oportunidades.map(({ cliente, compra, contato }) => <article key={cliente.id} className="space-y-3 rounded-xl border bg-card p-5 text-card-foreground">
                <h3 className="text-lg font-semibold">{cliente.nome}</h3><p className="text-sm">{cliente.telefone_whatsapp}</p>
                <p className="text-sm text-muted-foreground">Última compra confirmada: {formatDate(compra.data_compra)} · {Math.floor((now - Date.parse(compra.data_compra)) / 86400000)} dias</p>
                <p className="break-all text-xs text-muted-foreground">Compra de referência: {compra.id}</p>
                {contato ? <p className="rounded-md bg-muted p-3 text-sm">Contato já registrado em {formatDate(contato.data_contato)} — {contato.status_envio}. Não registrar novamente para esta compra.</p> : <button type="button" className={buttonClass} disabled={disabled} onClick={() => { setContatoForm({ cliente_id: cliente.id, compra_referencia_id: compra.id, data_contato: localDate(), status_envio: 'pendente' }); setAba('historico'); }}>Registrar contato</button>}
              </article>)}</div>
            </section>}
            {aba === 'clientes' && <section className="space-y-6">
              <form onSubmit={saveCliente} className="rounded-xl border bg-card p-5 text-card-foreground">
                <h2 className="mb-4 text-xl font-semibold">{clienteForm.id ? 'Editar cliente' : 'Cadastrar cliente'}</h2>
                <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">Nome<input required className={inputClass} value={clienteForm.nome} onChange={event => setClienteForm({ ...clienteForm, nome: event.target.value })} /></label>
                  <label className="text-sm font-medium">Telefone WhatsApp<input required type="tel" placeholder="+55 11 99999-9999" className={inputClass} value={clienteForm.telefone_whatsapp} onChange={event => setClienteForm({ ...clienteForm, telefone_whatsapp: event.target.value })} /></label>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={clienteForm.autoriza_mensagens} onChange={event => setClienteForm({ ...clienteForm, autoriza_mensagens: event.target.checked })} />O cliente autoriza receber mensagens</label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2"><button className={buttonClass} type="submit">{saving ? 'Salvando…' : 'Salvar cliente'}</button>{clienteForm.id && <button className={secondaryClass} type="button" onClick={() => setClienteForm(emptyCliente)}>Cancelar edição</button>}</div>
                </fieldset>
              </form>
              <div className="space-y-3">{clientes.length === 0 && <p className="rounded-lg border p-6 text-center text-muted-foreground">Nenhum cliente cadastrado.</p>}{clientes.map(cliente => <article key={cliente.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4"><div><h3 className="font-semibold">{cliente.nome}</h3><p className="mt-1 text-sm text-muted-foreground">{cliente.telefone_whatsapp} · {cliente.autoriza_mensagens ? 'Mensagens autorizadas' : 'Sem autorização para mensagens'}</p></div><button type="button" className={secondaryClass} disabled={disabled} onClick={() => setClienteForm({ id: cliente.id, nome: cliente.nome, telefone_whatsapp: cliente.telefone_whatsapp, autoriza_mensagens: cliente.autoriza_mensagens })}>Editar</button></article>)}</div>
            </section>}
            {(aba === 'pedidos' || aba === 'historico') && <label className="block max-w-sm text-sm font-medium">Filtrar listagem por cliente<select className={inputClass} value={filterCliente} onChange={event => setFilterCliente(event.target.value)}><option value="">Todos os clientes</option>{clienteOptions}</select></label>}
            {aba === 'pedidos' && <section className="space-y-6">
              <form onSubmit={savePedido} className="rounded-xl border bg-card p-5 text-card-foreground">
                <h2 className="mb-4 text-xl font-semibold">{pedidoForm.id ? 'Editar pedido' : 'Registrar pedido'}</h2>
                <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-3">
                  <label className="text-sm font-medium">Cliente<select required disabled={Boolean(pedidoForm.id)} className={inputClass} value={pedidoForm.cliente_id} onChange={event => setPedidoForm({ ...pedidoForm, cliente_id: event.target.value })}><option value="">Selecione</option>{clienteOptions}</select></label>
                  <label className="text-sm font-medium">Data da compra<input required type="datetime-local" className={inputClass} value={pedidoForm.data_compra} onChange={event => setPedidoForm({ ...pedidoForm, data_compra: event.target.value })} /></label>
                  <label className="text-sm font-medium">Status<input required list="whatsapp-pedido-status" className={inputClass} value={pedidoForm.status} onChange={event => setPedidoForm({ ...pedidoForm, status: event.target.value })} /></label>
                  <datalist id="whatsapp-pedido-status"><option value="pendente" /><option value="confirmado" /><option value="cancelado" /></datalist>
                  <div className="flex flex-wrap gap-2 sm:col-span-3"><button type="submit" className={buttonClass}>{saving ? 'Salvando…' : 'Salvar pedido'}</button>{pedidoForm.id && <button type="button" className={secondaryClass} onClick={() => setPedidoForm(emptyPedido)}>Cancelar edição</button>}</div>
                </fieldset>
              </form>
              <div className="space-y-3">{filteredPedidos.length === 0 && <p className="rounded-lg border p-6 text-center text-muted-foreground">Nenhum pedido encontrado.</p>}{filteredPedidos.map(pedido => <article key={pedido.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4"><div className="min-w-0"><h3 className="font-semibold">{clienteMap.get(pedido.cliente_id)?.nome ?? 'Cliente indisponível'}</h3><p className="mt-1 text-sm text-muted-foreground">{formatDate(pedido.data_compra)} · {pedido.status}</p><p className="mt-1 break-all text-xs text-muted-foreground">Pedido: {pedido.id}</p></div><button type="button" className={secondaryClass} disabled={disabled} onClick={() => setPedidoForm({ ...pedido, data_compra: localDate(pedido.data_compra) })}>Editar pedido</button></article>)}</div>
            </section>}
            {aba === 'historico' && <section className="space-y-6">
              <form onSubmit={saveContato} className="rounded-xl border bg-card p-5 text-card-foreground">
                <h2 className="text-xl font-semibold">Registrar contato</h2><p className="mb-4 mt-2 text-sm text-muted-foreground">Este registro não envia mensagens. Use o status correspondente ao acompanhamento real. Cada compra aceita apenas um registro de contato.</p>
                <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">Cliente autorizado<select required className={inputClass} value={contatoForm.cliente_id} onChange={event => setContatoForm({ ...contatoForm, cliente_id: event.target.value, compra_referencia_id: '' })}><option value="">Selecione</option>{clientes.filter(cliente => cliente.autoriza_mensagens).map(cliente => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></label>
                  <label className="text-sm font-medium">Compra de referência<select required className={inputClass} value={contatoForm.compra_referencia_id} onChange={event => setContatoForm({ ...contatoForm, compra_referencia_id: event.target.value })}><option value="">Selecione uma compra</option>{pedidos.filter(pedido => pedido.cliente_id === contatoForm.cliente_id).map(pedido => { const registrado = contactMap.has(`${pedido.cliente_id}:${pedido.id}`); return <option key={pedido.id} value={pedido.id} disabled={registrado}>{formatDate(pedido.data_compra)} · {pedido.status} · {pedido.id}{registrado ? ' — contato já registrado' : ''}</option>; })}</select></label>
                  <label className="text-sm font-medium">Data do contato<input required type="datetime-local" className={inputClass} value={contatoForm.data_contato} onChange={event => setContatoForm({ ...contatoForm, data_contato: event.target.value })} /></label>
                  <label className="text-sm font-medium">Status do envio<input required list="whatsapp-contato-status" className={inputClass} value={contatoForm.status_envio} onChange={event => setContatoForm({ ...contatoForm, status_envio: event.target.value })} /></label>
                  <datalist id="whatsapp-contato-status"><option value="pendente" /><option value="enviado" /><option value="falhou" /></datalist>
                  <div className="sm:col-span-2"><button type="submit" className={buttonClass}>{saving ? 'Salvando…' : 'Salvar registro de contato'}</button></div>
                </fieldset>
              </form>
              <h2 className="text-xl font-semibold">Histórico de contatos</h2>
              <div className="space-y-3">{filteredContatos.length === 0 && <p className="rounded-lg border p-6 text-center text-muted-foreground">Nenhum contato registrado.</p>}{filteredContatos.map(contato => <article key={contato.id} className="space-y-2 rounded-lg border bg-card p-4"><h3 className="font-semibold">{clienteMap.get(contato.cliente_id)?.nome ?? 'Cliente indisponível'}</h3><p className="text-sm">{formatDate(contato.data_contato)} · {contato.status_envio}</p><p className="break-all text-xs text-muted-foreground">Cliente: {contato.cliente_id}</p><p className="break-all text-xs text-muted-foreground">Compra de referência: {contato.compra_referencia_id}</p></article>)}</div>
            </section>}
          </>}
        </>}
      </div>
    </main>
  );
}
