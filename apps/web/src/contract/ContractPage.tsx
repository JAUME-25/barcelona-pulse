import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { LanguageSwitch } from '../app/LanguageSwitch';
import '../app/brand.css';
import { BrandMark } from '../features/stations/OctagonGlyph';
import { t } from '../i18n';
import {
  readContract,
  referencedSchemas,
  type Contract,
  type ContractEndpoint,
  type ContractSchema,
  type OpenApiDocument,
  type TypeText,
} from './openapi';
import './contract.css';

/** El documento que publica la API; detrás de nginx, bajo /api como todo lo demás. */
export const DOCUMENT_PATH = '/api/openapi/v1.json';
const CODE_URL = 'https://github.com/JAUME-25/barcelona-pulse';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; contract: Contract };

function documentUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return `${base}${DOCUMENT_PATH}`;
}

/** Las descripciones de la API llevan `código` entre acentos graves: se enseña como código. */
function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(`[^`]+`)/);
  return parts.map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code key={i}>{part.slice(1, -1)}</code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** Un tipo; si es un esquema, enlaza con su sección. */
function Type({ type }: { type: TypeText }) {
  if (type.ref === null) return <code className="contract-type">{type.text}</code>;
  return (
    <a className="contract-type" href={`#schema-${type.ref}`}>
      <code>{type.text}</code>
    </a>
  );
}

function tagName(tag: string): string {
  return t().contract.tags[tag] ?? tag;
}

function Endpoint({ endpoint }: { endpoint: ContractEndpoint }) {
  const m = t().contract;
  const { id } = endpoint;
  return (
    <section className="contract-endpoint" id={id} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="contract-endpoint__title">
        <span className={`contract-method contract-method--${endpoint.method.toLowerCase()}`}>
          {endpoint.method}
        </span>{' '}
        <code className="contract-path">{endpoint.path}</code>
      </h3>
      <p className="contract-endpoint__summary">{endpoint.summary}</p>
      {endpoint.description !== '' && (
        <p className="contract-endpoint__description">
          <Inline text={endpoint.description} />
        </p>
      )}
      <h4>{m.parameters}</h4>
      {endpoint.parameters.length === 0 ? (
        <p className="contract-muted">{m.noParameters}</p>
      ) : (
        <ul className="contract-list">
          {endpoint.parameters.map((p) => (
            <li key={p.name}>
              <div className="contract-list__head">
                <code className="contract-list__name">{p.name}</code>
                <span className="contract-badge">{m.in[p.in] ?? p.in}</span>
                {p.required && (
                  <span className="contract-badge contract-badge--required">{m.required}</span>
                )}
                <Type type={p.type} />
              </div>
              {p.description !== '' && (
                <p>
                  <Inline text={p.description} />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {endpoint.requestBody !== null && (
        <>
          <h4>{m.body}</h4>
          <p className="contract-body">
            <Type type={endpoint.requestBody} />
          </p>
        </>
      )}
      <h4>{m.responses}</h4>
      <ul className="contract-list">
        {endpoint.responses.map((r) => (
          <li key={r.status}>
            <div className="contract-list__head">
              <code className="contract-list__name">{r.status}</code>
              {r.type !== null && <Type type={r.type} />}
            </div>
            {r.description !== '' && (
              <p>
                <Inline text={r.description} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Schema({ schema }: { schema: ContractSchema }) {
  const m = t().contract;
  return (
    <section
      className="contract-schema"
      id={`schema-${schema.name}`}
      aria-labelledby={`schema-${schema.name}-title`}
    >
      <h3 id={`schema-${schema.name}-title`}>
        <code>{schema.name}</code>
      </h3>
      {schema.description !== '' && (
        <p className="contract-schema__description">
          <Inline text={schema.description} />
        </p>
      )}
      {schema.values !== null ? (
        <p className="contract-values">
          <span className="contract-muted">{m.values} </span>
          {schema.values.map((v) => (
            <code key={v}>{v}</code>
          ))}
        </p>
      ) : (
        <ul className="contract-list">
          {schema.properties.map((p) => (
            <li key={p.name}>
              <div className="contract-list__head">
                <code className="contract-list__name">{p.name}</code>
                {p.required && (
                  <span className="contract-badge contract-badge--required">{m.required}</span>
                )}
                <Type type={p.type} />
              </div>
              {p.description !== '' && (
                <p>
                  <Inline text={p.description} />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * «Contrato de la API»: el documento OpenAPI que publica la API, como página legible y en el
 * idioma de la interfaz (los textos del contrato están en castellano, como los escribe la API).
 * Rutas por etiqueta con parámetros y respuestas, y los esquemas que esas rutas nombran.
 */
export function ContractPage() {
  const m = t().contract;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    document.title = `${m.title} · Barcelona Pulse`;
  }, [m.title]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(documentUrl(), { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const doc = (await response.json()) as OpenApiDocument;
        setState({ status: 'ready', contract: readContract(doc) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => {
      controller.abort();
    };
  }, [attempt]);

  const contract = state.status === 'ready' ? state.contract : null;
  const used = contract === null ? null : referencedSchemas(contract);
  const schemas = contract?.schemas.filter((s) => used?.has(s.name) === true) ?? [];

  return (
    <div className="contract">
      <header className="contract-head">
        <div className="brand">
          <BrandMark />
          <p className="brand__name">
            <a href="/">Barcelona Pulse</a>
          </p>
          <LanguageSwitch />
          <p className="brand__tagline">{m.title}</p>
        </div>
      </header>

      <main className="contract-main">
        <h1>{m.title}</h1>
        <p className="contract-lead">{m.tagline}</p>
        <p>{m.intro(<a href={documentUrl()}>{m.jsonLink}</a>)}</p>

        {state.status === 'loading' && (
          <p className="contract-muted" role="status">
            {m.loading}
          </p>
        )}
        {state.status === 'error' && (
          <div className="panel-status" role="alert">
            <p>{m.failed}</p>
            <button type="button" className="button" onClick={retry}>
              {m.retry}
            </button>
          </div>
        )}

        {contract !== null && (
          <>
            <p className="contract-muted">
              {contract.description} {m.version(contract.openapi, contract.version)}
            </p>

            <section aria-labelledby="contract-rules">
              <h2 id="contract-rules">{m.rules}</h2>
              <ul className="contract-rules">
                {m.ruleList.map((rule) => (
                  <li key={rule}>
                    <Inline text={rule} />
                  </li>
                ))}
              </ul>
            </section>

            <nav className="contract-index" aria-labelledby="contract-index">
              <h2 id="contract-index">{m.index}</h2>
              {contract.groups.map((g) => (
                <div key={g.tag}>
                  <h3>{tagName(g.tag)}</h3>
                  <ul>
                    {g.endpoints.map((e) => (
                      <li key={e.id}>
                        <a href={`#${e.id}`}>
                          <span className="contract-method contract-method--small">{e.method}</span>{' '}
                          <code>{e.path}</code>
                        </a>
                        <span className="contract-muted"> · {e.summary}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            {contract.groups.map((g) => (
              <section key={g.tag} aria-labelledby={`tag-${g.tag}`}>
                <h2 id={`tag-${g.tag}`}>{tagName(g.tag)}</h2>
                {g.endpoints.map((e) => (
                  <Endpoint key={e.id} endpoint={e} />
                ))}
              </section>
            ))}

            <section aria-labelledby="contract-schemas">
              <h2 id="contract-schemas">{m.schemas}</h2>
              <p className="contract-muted">{m.schemasNote}</p>
              {schemas.map((s) => (
                <Schema key={s.name} schema={s} />
              ))}
            </section>
          </>
        )}
      </main>

      <footer className="contract-foot">
        <p>
          <a href="/">{m.backToApp}</a>
        </p>
        <p>
          {m.code}{' '}
          <a href={CODE_URL} target="_blank" rel="noreferrer">
            github.com/JAUME-25/barcelona-pulse
          </a>
        </p>
      </footer>
    </div>
  );
}
