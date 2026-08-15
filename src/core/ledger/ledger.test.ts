import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Nota } from '../nota.ts';
import { DuplicidadeError, Ledger } from './ledger.ts';

function notaExemplo(overrides: Partial<Nota> = {}): Nota {
  return {
    empresa: 'qara',
    dataAtendimento: '15/08/2026',
    tomador: { tipo: 'cpf', cpf: '12345678909', cep: '22041012', numero: '100' },
    servico: { codigo: 'DIEGO', valorCentavos: 45000, descricao: 'Consulta em 15/08/2026.' },
    ...overrides,
  };
}

describe('Ledger', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = new Ledger(':memory:');
  });

  afterEach(() => {
    ledger.close();
  });

  it('insere uma nota pendente', () => {
    const registro = ledger.inserirPendente(notaExemplo());
    expect(registro.status).toBe('pending');
    expect(registro.id).toBeGreaterThan(0);
  });

  it('bloqueia duplicidade enquanto a nota estiver ativa', () => {
    ledger.inserirPendente(notaExemplo());
    expect(() => ledger.inserirPendente(notaExemplo())).toThrow(DuplicidadeError);
  });

  it('permite tentar de novo depois de failed (hash deixa de estar ativo)', () => {
    const registro = ledger.inserirPendente(notaExemplo());
    ledger.marcarEmProgresso(registro.id);
    ledger.marcarFalha(registro.id, 'timeout no portal');

    const novaTentativa = ledger.inserirPendente(notaExemplo());
    expect(novaTentativa.id).not.toBe(registro.id);
  });

  it('segue o fluxo completo até downloaded', () => {
    const registro = ledger.inserirPendente(notaExemplo());
    ledger.marcarEmProgresso(registro.id);

    const emitida = ledger.marcarEmitida(registro.id, 'CHAVE123', 'NF001');
    expect(emitida.status).toBe('emitted');
    expect(emitida.chaveAcesso).toBe('CHAVE123');

    const baixada = ledger.marcarBaixada(registro.id, ['danfse.pdf']);
    expect(baixada.status).toBe('downloaded');
    expect(baixada.arquivos).toEqual(['danfse.pdf']);
  });

  it('preserva emitido_em nas transições seguintes (é a competência real, não pode se mover)', () => {
    const registro = ledger.inserirPendente(notaExemplo());
    ledger.marcarEmProgresso(registro.id);
    const emitida = ledger.marcarEmitida(registro.id, 'CHAVE123', 'NF001');
    expect(emitida.emitidoEm).not.toBeNull();

    const baixada = ledger.marcarBaixada(registro.id, ['danfse.pdf']);
    expect(baixada.emitidoEm).toBe(emitida.emitidoEm);

    const cancelada = ledger.marcarCancelada(registro.id, 'pedido do paciente');
    expect(cancelada.emitidoEm).toBe(emitida.emitidoEm);
  });

  it('rejeita transição fora da máquina de estados', () => {
    const registro = ledger.inserirPendente(notaExemplo());
    // pending → emitted não é permitido, tem que passar por in_progress
    expect(() => ledger.marcarEmitida(registro.id, 'X', 'Y')).toThrow(/Transição inválida/);
  });

  it('cancela uma nota emitida e guarda o motivo', () => {
    const registro = ledger.inserirPendente(notaExemplo());
    ledger.marcarEmProgresso(registro.id);
    ledger.marcarEmitida(registro.id, 'CHAVE', 'NF');

    const cancelada = ledger.marcarCancelada(registro.id, 'pedido do paciente');
    expect(cancelada.status).toBe('cancelled');
    expect(cancelada.erro).toBe('pedido do paciente');
  });

  it('listarPorStatus filtra corretamente', () => {
    ledger.inserirPendente(notaExemplo());
    ledger.inserirPendente(notaExemplo({ dataAtendimento: '16/08/2026' }));

    expect(ledger.listarPorStatus('pending')).toHaveLength(2);
    expect(ledger.listarPorStatus('emitted')).toHaveLength(0);
  });
});
