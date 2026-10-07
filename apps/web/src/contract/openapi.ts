// El contrato de la API, leído del documento OpenAPI 3.1 que publica la propia API
// (`/api/openapi/v1.json`, generado al compilar y versionado en el repositorio) y reducido a lo
// que se enseña en la página: rutas agrupadas por etiqueta, con sus parámetros y respuestas, y
// los esquemas con sus propiedades. Nada se escribe a mano: lo que dice la página es lo que
// declara el código.

interface OpenApiSchema {
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  additionalProperties?: boolean | OpenApiSchema;
  $ref?: string;
  nullable?: boolean;
}

interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

interface OpenApiMediaType {
  schema?: OpenApiSchema;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, OpenApiMediaType>;
}

interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: { required?: boolean; content?: Record<string, OpenApiMediaType> };
  responses?: Record<string, OpenApiResponse>;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; description?: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

/** Un tipo tal como se enseña: el texto y, si apunta a un esquema, su nombre para enlazarlo. */
export interface TypeText {
  text: string;
  ref: string | null;
}

export interface ContractParameter {
  name: string;
  in: string;
  required: boolean;
  description: string;
  type: TypeText;
}

export interface ContractResponse {
  status: string;
  description: string;
  type: TypeText | null;
}

export interface ContractEndpoint {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: ContractParameter[];
  requestBody: TypeText | null;
  responses: ContractResponse[];
}

export interface ContractGroup {
  tag: string;
  endpoints: ContractEndpoint[];
}

export interface ContractProperty {
  name: string;
  required: boolean;
  description: string;
  type: TypeText;
}

export interface ContractSchema {
  name: string;
  description: string;
  /** Los valores si es una enumeración; si no, sus propiedades. */
  values: string[] | null;
  properties: ContractProperty[];
}

export interface Contract {
  title: string;
  description: string;
  version: string;
  openapi: string;
  groups: ContractGroup[];
  schemas: ContractSchema[];
}

/** Orden de las etiquetas en la página: lo que se consulta primero, primero. */
const TAG_ORDER = ['Sources', 'Stations', 'History', 'Scenarios'];

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'];

function refName(ref: string): string {
  return ref.slice(ref.lastIndexOf('/') + 1);
}

/** «string», «integer (int64)», «string | null», «StationItem[]», «StationItem»… */
export function typeText(schema: OpenApiSchema | undefined): TypeText {
  if (schema === undefined) return { text: '?', ref: null };
  if (schema.$ref !== undefined) {
    const name = refName(schema.$ref);
    return { text: name, ref: name };
  }
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type ?? 'object']).filter(
    (t): t is string => typeof t === 'string',
  );
  const nullable = types.includes('null') || schema.nullable === true;
  const main = types.filter((t) => t !== 'null');
  let text: string;
  let ref: string | null = null;
  if (main.includes('array')) {
    const inner = typeText(schema.items);
    text = `${inner.text}[]`;
    ref = inner.ref;
  } else if (schema.enum !== undefined) {
    text = schema.enum.map(String).join(' | ');
  } else {
    const base = main[0] ?? 'object';
    text = schema.format === undefined ? base : `${base} (${schema.format})`;
  }
  return { text: nullable ? `${text} | null` : text, ref };
}

function firstSchema(content: Record<string, OpenApiMediaType> | undefined): TypeText | null {
  if (content === undefined) return null;
  const media = Object.values(content)[0];
  return media?.schema === undefined ? null : typeText(media.schema);
}

function endpointId(method: string, path: string): string {
  return `${method}-${path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`.toLowerCase();
}

/** Las rutas agrupadas por etiqueta (en el orden fijo de arriba; las demás, después) y ordenadas. */
export function readContract(doc: OpenApiDocument): Contract {
  const byTag = new Map<string, ContractEndpoint[]>();
  for (const [path, operations] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(operations)) {
      const tag = op.tags?.[0] ?? 'Otros';
      const endpoint: ContractEndpoint = {
        id: endpointId(method, path),
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? '',
        description: op.description ?? '',
        parameters: (op.parameters ?? []).map((p) => ({
          name: p.name,
          in: p.in,
          required: p.required === true,
          description: p.description ?? '',
          type: typeText(p.schema),
        })),
        requestBody: firstSchema(op.requestBody?.content),
        responses: Object.entries(op.responses ?? {})
          .map(([status, r]) => ({
            status,
            description: r.description ?? '',
            type: firstSchema(r.content),
          }))
          .sort((a, b) => a.status.localeCompare(b.status)),
      };
      const list = byTag.get(tag) ?? [];
      list.push(endpoint);
      byTag.set(tag, list);
    }
  }
  const tags = [...byTag.keys()].sort((a, b) => {
    const ia = TAG_ORDER.indexOf(a);
    const ib = TAG_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const groups = tags.map((tag) => ({
    tag,
    endpoints: (byTag.get(tag) ?? []).sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        METHOD_ORDER.indexOf(a.method.toLowerCase()) - METHOD_ORDER.indexOf(b.method.toLowerCase()),
    ),
  }));

  const schemas = Object.entries(doc.components?.schemas ?? {})
    .map(([name, schema]) => ({
      name,
      description: schema.description ?? '',
      values: schema.enum === undefined ? null : schema.enum.map(String),
      properties: Object.entries(schema.properties ?? {}).map(([prop, s]) => ({
        name: prop,
        required: schema.required?.includes(prop) === true,
        description: s.description ?? '',
        type: typeText(s),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    title: doc.info.title,
    description: doc.info.description ?? '',
    version: doc.info.version,
    openapi: doc.openapi,
    groups,
    schemas,
  };
}

/** Los esquemas que alguna ruta o esquema nombra, para no enseñar los que solo usa ASP.NET. */
export function referencedSchemas(contract: Contract): Set<string> {
  const used = new Set<string>();
  const visit = (name: string | null) => {
    if (name === null || used.has(name)) return;
    used.add(name);
    const schema = contract.schemas.find((s) => s.name === name);
    for (const p of schema?.properties ?? []) visit(p.type.ref);
  };
  for (const g of contract.groups) {
    for (const e of g.endpoints) {
      visit(e.requestBody?.ref ?? null);
      for (const p of e.parameters) visit(p.type.ref);
      for (const r of e.responses) visit(r.type?.ref ?? null);
    }
  }
  return used;
}
