import { Bi, useLang } from '../i18n';
import { buildTemplateExplanation } from '../engine/aiFallback';
import { ruleName } from '../engine/rules';
import type { BuildingProject, ComplianceAudit, RemediationDelta, Violation } from '../types/plan';

/**
 * Print-friendly report. The browser shapes Bangla correctly (jsPDF does not), so the reviewer
 * prints this page or saves it as PDF from the print dialog. Follows the display language:
 * English, Bangla, or both. Every number comes from the audit; only digits change.
 */
export function PrintReport({
  project,
  beforeAudit,
  afterAudit,
  deltas,
  generatedAt,
}: {
  project: BuildingProject;
  beforeAudit: ComplianceAudit;
  afterAudit: ComplianceAudit;
  deltas: RemediationDelta[];
  generatedAt: Date;
}) {
  const { t, num, uiLang, showBn } = useLang();
  const height = project.floors.length * project.storyHeightM;
  const verified = beforeAudit.violations.filter((v) => v.basis === 'verified').length;
  const screening = beforeAudit.violations.filter((v) => v.basis === 'screening').length;
  const sec = (s: number) => (s > 0 && Number.isFinite(s) ? t('common.seconds', { n: num(s, 1) }) : t('review.notMeasured'));
  const measured = (v: Violation) => (v.blocked ? t('common.noRoute') : `${num(v.measuredValue)} ${v.unit}`);
  const basisLabel = (v: Violation) => t(`basis.${v.basis || 'screening'}.label`);

  return (
    <article className="print-report-body" lang={uiLang}>
      <header className="pr-head">
        <div className="pr-draft">{t('print.draft')}</div>
        <h1>{t('print.title')}</h1>
        <div className="pr-meta">
          {project.name} · {t('report.floorsHeight', { n: project.floors.length, h: num(height, 1) })} ·{' '}
          {t('print.generated', { d: generatedAt.toISOString().slice(0, 10) })}
        </div>
        {showBn && <p className="pr-note">{t('bnNotice.text')}</p>}
      </header>

      <section>
        <h2>{t('print.summary')}</h2>
        <table className="pr-table">
          <tbody>
            <tr>
              <th>{t('print.asDrawn')}</th>
              <td>
                {t('report.nFail', { n: beforeAudit.failCount })} · {t('report.nWarn', { n: beforeAudit.warnCount })} ·{' '}
                {t('report.nPass', { n: beforeAudit.passedCount })}
              </td>
            </tr>
            <tr>
              <th>{t('print.withChanges')}</th>
              <td>
                {t('report.nFail', { n: afterAudit.failCount })} · {t('report.nWarn', { n: afterAudit.warnCount })}
              </td>
            </tr>
            <tr>
              <th>{t('compare.slowest')}</th>
              <td>
                {sec(beforeAudit.worstEscapeSec)} → {sec(afterAudit.worstEscapeSec)}
              </td>
            </tr>
            <tr>
              <th>{t('compare.noRoute')}</th>
              <td>
                {num(beforeAudit.trappedRoomCount)} → {num(afterAudit.trappedRoomCount)}
              </td>
            </tr>
            <tr>
              <th>{t('print.trust')}</th>
              <td>{t('report.trust.counts', { v: verified, s: screening })}</td>
            </tr>
          </tbody>
        </table>
        <p className="pr-small">{t('report.trust.body')}</p>
      </section>

      <section>
        <h2>{t('report.findings', { n: beforeAudit.violations.length })}</h2>
        {beforeAudit.violations.length === 0 && <p>{t('report.noFindings')}</p>}
        <ol className="pr-findings">
          {beforeAudit.violations.map((v) => {
            const ex = v.aiExplanation || buildTemplateExplanation(v);
            return (
              <li key={v.id}>
                <div className="pr-f-head">
                  <span className={v.status === 'FAIL' ? 'pr-fail' : 'pr-warn'}>
                    {v.status === 'FAIL' ? t('common.fail') : t('common.warn')}
                  </span>{' '}
                  {v.floorLabel ? `[${v.floorLabel}] ` : ''}
                  <strong>{ruleName(v.ruleId, v.ruleName, uiLang)}</strong> · {v.roomName}
                </div>
                <div className="pr-f-nums">
                  {t('report.measured')} <strong>{measured(v)}</strong>
                  {!v.blocked && v.category !== 'input_required' && (
                    <>
                      {' '}
                      · {t('report.limit')} {v.comparator} {num(v.limitValue)} {v.unit}
                    </>
                  )}{' '}
                  · {basisLabel(v)} · <span className="pr-cite">{v.citation}</span>
                </div>
                <Bi className="pr-f-text" en={ex.en} bn={ex.bn} />
                <Bi
                  className="pr-f-action"
                  en={`${t('report.whatToDo')} ${ex.actionEn}`}
                  bn={ex.actionBn ? `করণীয়: ${ex.actionBn}` : undefined}
                />
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2>{t('report.notChecked', { n: (beforeAudit.notChecked || []).length })}</h2>
        {(beforeAudit.notChecked || []).length === 0 ? (
          <p>{t('report.nothingSkipped')}</p>
        ) : (
          <ul>
            {(beforeAudit.notChecked || []).map((n, i) => (
              <li key={i} lang="en">
                {n.floorLabel ? `[${n.floorLabel}] ` : ''}
                <strong>{n.item}.</strong> {n.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{t('compare.copyTitle')}</h2>
        {deltas.length === 0 ? (
          <p>{t('compare.noFix')}</p>
        ) : (
          <ul>
            {deltas.map((d) => (
              <li key={d.id}>
                <Bi as="span" en={d.summary} bn={d.summaryBn} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="pr-foot">{t('print.footer')}</footer>
    </article>
  );
}
