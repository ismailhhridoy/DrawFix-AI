import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { DrawFixLogo } from '../components/DrawFixLogo';
import type { Block, Section } from './content';
import type { DocsPayload } from './payload';
import type { Diagram } from './diagrams';
import type { DocsAccess } from './access';
import { toMarkdown } from './markdown';

type Status =
  | { kind: 'loading' }
  | { kind: 'open'; data: DocsPayload }
  | { kind: 'closed'; access: Extract<DocsAccess, { state: 'closed' }> }
  | { kind: 'locked' }
  | { kind: 'error' };

const KEY_PARAM = 'key';

function keyFromUrl(): string {
  return new URLSearchParams(window.location.search).get(KEY_PARAM) ?? '';
}

async function loadDocs(key: string): Promise<Status> {
  try {
    const res = await fetch('/api/docs/payload', { headers: key ? { 'X-Docs-Key': key } : {} });
    if (res.ok) return { kind: 'open', data: (await res.json()) as DocsPayload };
    if (res.status === 403) {
      const access = (await res.json()) as DocsAccess;
      if (access.state === 'locked') return { kind: 'locked' };
      if (access.state === 'closed') return { kind: 'closed', access };
    }
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }) + ' (Dhaka time)';
}

export function DocsPage() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [keyInput, setKeyInput] = useState(keyFromUrl);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus({ kind: 'loading' });
    loadDocs(keyFromUrl()).then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  if (status.kind === 'loading') return <Shell><p className="text-[#64748B]">Loading…</p></Shell>;
  if (status.kind === 'error') return <Shell><p className="text-[#64748B]">The documentation could not be loaded. Try again in a minute.</p></Shell>;
  if (status.kind === 'closed') {
    const a = status.access;
    const text =
      a.reason === 'not-yet' && a.opensAt
        ? `This page opens on ${fmtDate(a.opensAt)}.`
        : a.reason === 'ended'
          ? 'This review period has ended.'
          : 'This page is not published right now.';
    return <Shell><h1 className="text-2xl font-semibold text-[#0F172A]">DrawFix AI</h1><p className="mt-3 text-[#475569]">{text}</p></Shell>;
  }
  if (status.kind === 'locked') {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-[#0F172A]">DrawFix AI</h1>
        <p className="mt-3 text-[#475569]">This page is for invited reviewers. Enter the access key you were given.</p>
        <form
          className="mt-5 flex max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const url = new URL(window.location.href);
            url.searchParams.set(KEY_PARAM, keyInput.trim());
            window.history.replaceState(null, '', url.toString());
            setStatus({ kind: 'loading' });
            loadDocs(keyInput.trim()).then(setStatus);
          }}
        >
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            className="flex-1 rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm"
            placeholder="Access key"
            autoComplete="off"
          />
          <button className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white" type="submit">Open</button>
        </form>
      </Shell>
    );
  }

  const data = status.data;
  return <Docs data={data} query={query} setQuery={setQuery} copied={copied} onCopy={() => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }} />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-[#E2E8F0] p-8">
        <div className="mb-4"><DrawFixLogo size={36} /></div>
        {children}
      </div>
    </div>
  );
}

function Docs({ data, query, setQuery, copied, onCopy }: {
  data: DocsPayload;
  query: string;
  setQuery: (q: string) => void;
  copied: boolean;
  onCopy: () => void;
}) {
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    return data.sections.filter((s) => JSON.stringify([s.title, s.blocks]).toLowerCase().includes(q));
  }, [data, q]);
  const visible = matches ?? data.sections;

  const downloadMd = () => {
    const blob = new Blob([toMarkdown(data)], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'drawfix-ai-docs.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#0F172A]">
      <style>{`@media print {
        .docs-no-print { display: none !important; }
        .docs-print-wide { max-width: none !important; padding: 0 !important; }
        .docs-section { break-inside: avoid-page; }
        body { background: #fff !important; }
      }`}</style>

      <header className="docs-no-print sticky top-0 z-20 border-b border-[#E2E8F0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="#top" className="flex items-center gap-2 font-semibold"><DrawFixLogo size={30} />DrawFix AI</a>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the documentation"
            className="ml-auto w-full max-w-xs rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm"
            aria-label="Search the documentation"
          />
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm">Save as PDF</button>
            <button onClick={downloadMd} className="rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm">Markdown</button>
            <button onClick={onCopy} className="rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm">{copied ? 'Link copied' : 'Copy link'}</button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
        <nav className="docs-no-print hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 space-y-5 text-sm">
            {data.groups.map((g) => (
              <div key={g.id}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#64748B]">{g.title}</div>
                {data.sections.filter((s) => s.group === g.id).map((s) => (
                  <a key={s.id} href={`#${s.id}`} className="block rounded px-2 py-1 text-[#334155] hover:bg-white hover:text-[#2563EB]">{s.title}</a>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <main id="top" className="docs-print-wide min-w-0 flex-1 space-y-12">
          <div className="docs-no-print flex gap-2 overflow-x-auto lg:hidden">
            {data.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-[#CBD5E1] bg-white px-3 py-1 text-xs">{s.title}</a>
            ))}
          </div>

          <section>
            <h1 className="text-3xl font-bold tracking-tight">DrawFix AI</h1>
            <p className="mt-2 text-lg text-[#475569]">Faster government scrutiny. Validated before filing.</p>
            <p className="mt-2 text-xs text-[#64748B]">
              Live status generated {fmtDate(data.generatedAt)}{data.live.commit ? ` · build ${data.live.commit}` : ''}
            </p>
          </section>

          {matches && (
            <p className="text-sm text-[#475569]">{matches.length} section{matches.length === 1 ? '' : 's'} match “{query}”.</p>
          )}

          {visible.length === 0 && <p className="text-[#64748B]">Nothing matches that search.</p>}

          {data.groups.map((g) => {
            const items = visible.filter((s) => s.group === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id} className="space-y-10">
                <h2 className="border-b border-[#CBD5E1] pb-2 text-sm font-semibold uppercase tracking-wide text-[#2563EB]">{g.title}</h2>
                {items.map((s) => (
                  <SectionView key={s.id} section={s} data={data} />
                ))}
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}

function SectionView({ section, data }: { section: Section; data: DocsPayload }) {
  return (
    <section id={section.id} className="docs-section scroll-mt-28 space-y-4">
      <h3 className="text-2xl font-semibold tracking-tight">{section.title}</h3>
      {section.blocks.map((b, i) => <BlockView key={i} block={b} data={data} />)}
    </section>
  );
}

function BlockView({ block, data }: { block: Block; data: DocsPayload }) {
  switch (block.t) {
    case 'p':
      return <p className="leading-relaxed text-[#334155]">{block.text}</p>;
    case 'ul':
      return (
        <ul className="list-disc space-y-2 pl-5 text-[#334155]">
          {block.items.map((x, i) => <li key={i} className="leading-relaxed">{x}</li>)}
        </ul>
      );
    case 'note':
      return <div className="rounded-lg border-l-4 border-[#2563EB] bg-white px-4 py-3 text-sm text-[#334155]">{block.text}</div>;
    case 'table':
      return <Table head={block.head} rows={block.rows} />;
    case 'live':
      return <LiveBlock k={block.key} data={data} />;
    case 'features':
      return <FeatureMatrix data={data} />;
    case 'team':
      return <TeamGrid data={data} />;
    case 'diagram':
      return <DiagramView diagram={block.key === 'architecture' ? data.diagrams.architecture : data.diagrams.dataflow} />;
  }
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-[#F8FAFC] text-[#475569]">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[#E2E8F0] align-top">
              {r.map((c, j) => <td key={j} className="px-4 py-2 text-[#334155]">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-[#64748B]">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-[#64748B]">{sub}</div>}
    </div>
  );
}

function LiveBlock({ k, data }: { k: 'rules' | 'buildings' | 'ai' | 'steps'; data: DocsPayload }) {
  const l = data.live;
  if (k === 'rules') {
    return (
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Code checks" value={String(l.rules.total)} sub="from the rule registry" />
        <Stat label="Verified" value={String(l.rules.verified)} sub="limit read in the code text" />
        <Stat label="Screening" value={String(l.rules.screening)} sub="prototype values, to confirm" />
        <Stat label="Drawing" value={String(l.rules.drawing)} sub="consistency checks" />
      </div>
    );
  }
  if (k === 'buildings') {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {l.sampleBuildings.map((b) => <Stat key={b.id} label="Sample plan" value={b.name.split(' (')[0]} sub={b.subtitle} />)}
      </div>
    );
  }
  if (k === 'ai') {
    return (
      <div className="grid gap-3 sm:grid-cols-1">
        <Stat label="AI status" value={l.aiConfigured ? 'On' : 'Off'} sub={l.aiConfigured ? 'Gemini key is configured on the server' : 'Fixed wording and hand-written fixes are used'} />
      </div>
    );
  }
  return <p className="text-sm text-[#334155]">Steps: {l.workspaceSteps.join(' → ')}</p>;
}

const STATUS_STYLE: Record<string, string> = {
  shipped: 'bg-[#DCFCE7] text-[#166534]',
  'in-progress': 'bg-[#DBEAFE] text-[#1E40AF]',
  planned: 'bg-[#F1F5F9] text-[#475569]',
};
const STATUS_LABEL: Record<string, string> = { shipped: 'Shipped', 'in-progress': 'In progress', planned: 'Planned' };

function FeatureMatrix({ data }: { data: DocsPayload }) {
  const c = data.live.featureCounts;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Shipped" value={String(c.shipped)} />
        <Stat label="In progress" value={String(c['in-progress'])} />
        <Stat label="Planned" value={String(c.planned)} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-[#F8FAFC] text-[#475569]">
            <tr><th className="px-4 py-2 font-medium">Area</th><th className="px-4 py-2 font-medium">Feature</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Now</th></tr>
          </thead>
          <tbody>
            {data.live.features.map((f) => (
              <tr key={f.id} className="border-t border-[#E2E8F0]">
                <td className="px-4 py-2 text-[#64748B]">{f.area}</td>
                <td className="px-4 py-2">{f.name}</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[f.status]}`}>{STATUS_LABEL[f.status]}</span></td>
                <td className="px-4 py-2 text-xs text-[#64748B]">{f.needsAi && !f.available ? 'Needs AI (off)' : f.needsAi ? 'Needs AI (on)' : 'Works without AI'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function TeamGrid({ data }: { data: DocsPayload }) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-[#334155]">{data.team.teamName}</p>
      {data.team.members.length === 0 && <p className="text-sm text-[#64748B]">Team members are being added.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.team.members.map((m) => (
          <div key={m.name} className="flex flex-col rounded-xl border border-[#E2E8F0] bg-white p-5">
            <div className="aspect-square w-28 overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#EEF4FF]">
              {m.photo ? (
                <img src={m.photo} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[#2563EB]" aria-label={`${m.name} (no photo yet)`}>
                  {initials(m.name)}
                </div>
              )}
            </div>
            <div className="mt-4 font-semibold">{m.name}</div>
            <div className="mt-1 text-sm text-[#475569]">{m.roles.join(' · ')}</div>
            {m.email && <a href={`mailto:${m.email}`} className="mt-2 break-all text-sm text-[#2563EB] underline underline-offset-2">{m.email}</a>}
          </div>
        ))}
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  ui: '#EEF4FF',
  api: '#F1F5F9',
  svc: '#ECFDF5',
  ext: '#FFF7ED',
  data: '#F5F3FF',
};

function DiagramView({ diagram }: { diagram: Diagram }) {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const W = (n: { w?: number }) => n.w ?? 200;
  const H = (n: { h?: number }) => n.h ?? 72;
  // Where the segment from a box's centre towards `toward` leaves the box, so arrows start and stop at box edges.
  const edgePoint = (n: { x: number; y: number; w?: number; h?: number }, toward: { x: number; y: number }) => {
    const cx = n.x + W(n) / 2;
    const cy = n.y + H(n) / 2;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    const tx = dx !== 0 ? (W(n) / 2) / Math.abs(dx) : Infinity;
    const ty = dy !== 0 ? (H(n) / 2) / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  };
  const centre = (n: { x: number; y: number; w?: number; h?: number }) => ({ x: n.x + W(n) / 2, y: n.y + H(n) / 2 });
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white p-4">
      <svg viewBox={`0 0 ${diagram.width} ${diagram.height}`} className="h-auto w-full min-w-[640px]" role="img" aria-label="Diagram">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#64748B" />
          </marker>
        </defs>
        {diagram.edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const p = edgePoint(a, centre(b));
          const q = edgePoint(b, centre(a));
          const mx = (p.x + q.x) / 2;
          const my = (p.y + q.y) / 2;
          return (
            <g key={i}>
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#94A3B8" strokeWidth={1.6} markerEnd="url(#arrow)" />
              {e.label && (
                <text x={mx} y={my - 8} textAnchor="middle" fontSize={12} fill="#475569" paintOrder="stroke" stroke="#FFFFFF" strokeWidth={4}>{e.label}</text>
              )}
            </g>
          );
        })}
        {diagram.nodes.map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={W(n)} height={H(n)} rx={12} fill={TONE[n.tone ?? 'ui']} stroke="#CBD5E1" />
            <text x={n.x + W(n) / 2} y={n.y + H(n) / 2 - 2} textAnchor="middle" fontSize={15} fontWeight={600} fill="#0F172A">{n.label}</text>
            {n.sub && <text x={n.x + W(n) / 2} y={n.y + H(n) / 2 + 17} textAnchor="middle" fontSize={11.5} fill="#475569">{n.sub}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}
