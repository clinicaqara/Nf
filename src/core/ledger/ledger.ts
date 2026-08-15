import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { empresaPorSlug } from '../empresas/index.ts';
import { identificadorTomador, type Nota } from '../nota.ts';

export type StatusNota =
  | 'pending'
  | 'in_progress'
  | 'emitted'
  | 'downloaded'
  | 'failed'
  | 'cancelled'
  | 'substituted';

const TRANSICOES: Record<StatusNota, StatusNota[]> = {
  pending: ['in_progress'],
  in_progress: ['emitted', 'failed'],
  emitted: ['downloaded', 'cancelled', 'substituted'],
  downloaded: ['cancelled', 'substituted'],
  failed: ['in_progress'],
  cancelled: [],
  substituted: [],
};

export interface RegistroLedger {
  id: number;
  hashNatural: string;
  empresa: string;
  dataAtendimento: string;
  tomadorIdentificador: string;
  codigoServico: string;
  valorCentavos: number;
  status: StatusNota;
  chaveAcesso: string | null;
  numeroNota: string | null;
  arquivos: string[] | null;
  erro: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

interface RowNota {
  id: number;
  hash_natural: string;
  empresa: string;
  data_atendimento: string;
  tomador_identificador: string;
  codigo_servico: string;
  valor_centavos: number;
  status: StatusNota;
  chave_acesso: string | null;
  numero_nota: string | null;
  arquivos: string | null;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
}

function mapRow(row: RowNota): RegistroLedger {
  return {
    id: row.id,
    hashNatural: row.hash_natural,
    empresa: row.empresa,
    dataAtendimento: row.data_atendimento,
    tomadorIdentificador: row.tomador_identificador,
    codigoServico: row.codigo_servico,
    valorCentavos: row.valor_centavos,
    status: row.status,
    chaveAcesso: row.chave_acesso,
    numeroNota: row.numero_nota,
    arquivos: row.arquivos ? (JSON.parse(row.arquivos) as string[]) : null,
    erro: row.erro,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export class DuplicidadeError extends Error {
  constructor(
    public readonly hash: string,
    public readonly existente: RegistroLedger
  ) {
    super(
      `Nota duplicada: já existe registro id=${existente.id} (status=${existente.status}) ` +
        'com a mesma empresa, tomador, data, serviço e valor.'
    );
    this.name = 'DuplicidadeError';
  }
}

/**
 * Chave natural anti-duplicidade: CNPJ do emitente + identificador do
 * tomador + data de atendimento + código de serviço + valor. Mesma nota
 * "de novo" com esses cinco campos iguais é bloqueada enquanto houver um
 * registro ativo (pending/in_progress/emitted/downloaded) com esse hash.
 */
export function hashNatural(nota: Nota): string {
  const empresa = empresaPorSlug(nota.empresa);
  const partes = [
    empresa.cnpj,
    identificadorTomador(nota.tomador),
    nota.dataAtendimento,
    nota.servico.codigo,
    String(nota.servico.valorCentavos),
  ];
  return createHash('sha256').update(partes.join('|')).digest('hex');
}

export class Ledger {
  private readonly db: Database.Database;

  constructor(caminho: string) {
    this.db = new Database(caminho);
    this.db.pragma('journal_mode = WAL');
    this.migrar();
  }

  private migrar(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash_natural TEXT NOT NULL,
        empresa TEXT NOT NULL,
        data_atendimento TEXT NOT NULL,
        tomador_identificador TEXT NOT NULL,
        codigo_servico TEXT NOT NULL,
        valor_centavos INTEGER NOT NULL,
        status TEXT NOT NULL,
        chave_acesso TEXT,
        numero_nota TEXT,
        arquivos TEXT,
        erro TEXT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_notas_hash_ativo
        ON notas(hash_natural)
        WHERE status IN ('pending', 'in_progress', 'emitted', 'downloaded');
    `);
  }

  buscarPorId(id: number): RegistroLedger | undefined {
    const row = this.db.prepare('SELECT * FROM notas WHERE id = ?').get(id) as RowNota | undefined;
    return row ? mapRow(row) : undefined;
  }

  buscarPorHashAtivo(hash: string): RegistroLedger | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM notas
         WHERE hash_natural = ? AND status IN ('pending', 'in_progress', 'emitted', 'downloaded')`
      )
      .get(hash) as RowNota | undefined;
    return row ? mapRow(row) : undefined;
  }

  listarPorStatus(status: StatusNota): RegistroLedger[] {
    const rows = this.db.prepare('SELECT * FROM notas WHERE status = ? ORDER BY id').all(status) as RowNota[];
    return rows.map(mapRow);
  }

  /** Registra a intenção de emitir *antes* de tocar no navegador — sobra rastro mesmo se o processo morrer no meio. */
  inserirPendente(nota: Nota): RegistroLedger {
    const hash = hashNatural(nota);
    const existente = this.buscarPorHashAtivo(hash);
    if (existente) {
      throw new DuplicidadeError(hash, existente);
    }

    const agora = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO notas
           (hash_natural, empresa, data_atendimento, tomador_identificador, codigo_servico, valor_centavos, status, criado_em, atualizado_em)
         VALUES
           (@hash, @empresa, @dataAtendimento, @tomadorIdentificador, @codigoServico, @valorCentavos, 'pending', @agora, @agora)`
      )
      .run({
        hash,
        empresa: nota.empresa,
        dataAtendimento: nota.dataAtendimento,
        tomadorIdentificador: identificadorTomador(nota.tomador),
        codigoServico: nota.servico.codigo,
        valorCentavos: nota.servico.valorCentavos,
        agora,
      });

    return this.buscarPorId(Number(info.lastInsertRowid)) as RegistroLedger;
  }

  marcarEmProgresso(id: number): RegistroLedger {
    return this.aplicarTransicao(id, 'in_progress', `UPDATE notas SET status = 'in_progress', atualizado_em = @agora WHERE id = @id`);
  }

  marcarEmitida(id: number, chaveAcesso: string, numeroNota: string): RegistroLedger {
    return this.aplicarTransicao(
      id,
      'emitted',
      `UPDATE notas SET status = 'emitted', chave_acesso = @chaveAcesso, numero_nota = @numeroNota, atualizado_em = @agora WHERE id = @id`,
      { chaveAcesso, numeroNota }
    );
  }

  marcarFalha(id: number, erro: string): RegistroLedger {
    return this.aplicarTransicao(
      id,
      'failed',
      `UPDATE notas SET status = 'failed', erro = @erro, atualizado_em = @agora WHERE id = @id`,
      { erro }
    );
  }

  marcarBaixada(id: number, arquivos: string[]): RegistroLedger {
    return this.aplicarTransicao(
      id,
      'downloaded',
      `UPDATE notas SET status = 'downloaded', arquivos = @arquivos, atualizado_em = @agora WHERE id = @id`,
      { arquivos: JSON.stringify(arquivos) }
    );
  }

  marcarCancelada(id: number, motivo: string): RegistroLedger {
    return this.aplicarTransicao(
      id,
      'cancelled',
      `UPDATE notas SET status = 'cancelled', erro = @erro, atualizado_em = @agora WHERE id = @id`,
      { erro: motivo }
    );
  }

  marcarSubstituida(id: number): RegistroLedger {
    return this.aplicarTransicao(id, 'substituted', `UPDATE notas SET status = 'substituted', atualizado_em = @agora WHERE id = @id`);
  }

  private aplicarTransicao(
    id: number,
    novoStatus: StatusNota,
    sql: string,
    extra: Record<string, unknown> = {}
  ): RegistroLedger {
    const atual = this.buscarPorId(id);
    if (!atual) {
      throw new Error(`Nota id=${id} não existe no ledger.`);
    }
    if (!TRANSICOES[atual.status].includes(novoStatus)) {
      throw new Error(`Transição inválida: ${atual.status} → ${novoStatus} (nota id=${id}).`);
    }
    this.db.prepare(sql).run({ id, agora: new Date().toISOString(), ...extra });
    return this.buscarPorId(id) as RegistroLedger;
  }

  close(): void {
    this.db.close();
  }
}
