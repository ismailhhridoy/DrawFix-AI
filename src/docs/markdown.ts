// Turns the /docs payload into one Markdown document (for the "Download Markdown" button).
import type { DocsPayload } from './payload';
import type { Block, Section } from './content';

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head: string[], rows: string[][]) =>
  [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

function blockToMd(b: Block, p: DocsPayload): string {
  switch (b.t) {
    case 'p':
      return b.text;
    case 'ul':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'table':
      return table(b.head, b.rows);
    case 'note':
      return `> ${b.text}`;
    case 'live': {
      if (b.key === 'rules') {
        const r = p.live.rules;
        return `- Rules: ${r.total} (verified ${r.verified}, screening ${r.screening}, drawing ${r.drawing})`;
      }
      if (b.key === 'buildings') return `- Sample buildings: ${p.live.sampleBuildings.length}`;
      if (b.key === 'ai') return `- AI features: ${p.live.aiConfigured ? 'on' : 'off, fixed wording and hand-written fixes'}`;
      return `- Workspace steps: ${p.live.workspaceSteps.join(', ')}`;
    }
    case 'features':
      return table(
        ['Area', 'Feature', 'Status', 'Needs AI'],
        p.live.features.map((f) => [f.area, f.name, f.status, f.needsAi ? 'yes' : 'no']),
      );
    case 'team':
      return p.team.members.map((m) => `- **${m.name}**, ${m.roles.join(' · ')}${m.email ? ` (${m.email})` : ''}`).join('\n') || '_No members published._';
    case 'diagram': {
      const d = b.key === 'architecture' ? p.diagrams.architecture : p.diagrams.dataflow;
      const names = new Map(d.nodes.map((n) => [n.id, n.label]));
      const nodes = d.nodes.map((n) => `- ${n.label}${n.sub ? `: ${n.sub}` : ''}`).join('\n');
      const edges = d.edges.map((e) => `- ${names.get(e.from)} → ${names.get(e.to)}${e.label ? ` (${e.label})` : ''}`).join('\n');
      return `Components:\n${nodes}\n\nConnections:\n${edges}`;
    }
  }
}

export function toMarkdown(p: DocsPayload): string {
  const out: string[] = [
    '# DrawFix AI: documentation',
    '',
    `_Generated ${p.generatedAt}${p.live.commit ? `, build ${p.live.commit}` : ''}._`,
    '',
  ];
  for (const g of p.groups) {
    out.push(`## ${g.title}`, '');
    for (const s of p.sections.filter((x: Section) => x.group === g.id)) {
      out.push(`### ${s.title}`, '');
      for (const b of s.blocks) out.push(blockToMd(b, p), '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
