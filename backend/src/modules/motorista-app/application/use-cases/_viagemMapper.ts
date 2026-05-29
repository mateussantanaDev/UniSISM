/**
 * Mapper centralizado: viagem (Prisma row + relations) → DTO consumido pelo
 * app Flutter (UNISISM-motorista).
 *
 * Shape rígido — cliente Dart depende dos nomes e tipos. Veja spec:
 *   backend/docs/MOTORISTA_APP_API.md §8 (DTOs).
 *
 * IMPORTANTE — convenções alinhadas com o app:
 *   - `data`            → ISO date "YYYY-MM-DD" (sem hora)
 *   - `horaSaida`       → string "HH:mm" (já é assim no DB)
 *   - `iniciadaEm`/etc. → ISO 8601 com timezone (.toISOString())
 *   - BigInt KM         → number (cabe em 2^53)
 *   - `vagasTotais`     → number (capacidade da viagem)
 *   - `coordOrigem`/`coordDestino` → null por enquanto (schema não tem lat/lng)
 *   - `motorista.nome`  → snapshot do Atendente vinculado (não do MotoristaTFD.nome,
 *                         que pode ficar desatualizado)
 */

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface VeiculoResumoDto {
  id: string;
  placa: string;
  modelo: string;
  tipo: 'VAN' | 'ONIBUS' | 'CARRO' | 'AMBULANCIA';
  capacidade: number;
  status: 'ATIVO' | 'EM_MANUTENCAO' | 'INATIVO';
}

export interface MotoristaResumoDto {
  id: string;
  nome: string;
  matricula: string;
  status: 'ATIVO' | 'AFASTADO' | 'INATIVO';
}

export interface UbsResumoDto {
  id: string;
  nome: string;
  bairro: string;
  coord: GeoCoord | null;
  endereco: string | null;
}

export interface PacienteResumoDto {
  id: string;
  nome: string;
  cpf: string;
  dataNascimento: string;
  telefone: string | null;
  fotoUrl: string | null;
  ubs: UbsResumoDto | null;
  observacoesMobilidade: string | null;
}

export interface SolicitacaoResumoDto {
  id: string;
  protocolo: string;
  prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE';
  destino: string;
  unidadeDestino: string | null;
}

export interface PassageiroDto {
  id: string;
  paciente: PacienteResumoDto;
  solicitacao: SolicitacaoResumoDto;
  acompanhante: boolean;
  presenca: 'AGUARDANDO' | 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU';
  observacao: string | null;
  marcadoEm: string | null;
  marcadoPor: string | null;
}

export interface ViagemMotoristaDto {
  id: string;
  protocolo: string | null;
  data: string;
  horaSaida: string;
  horaPrevistaRetorno: string | null;
  destino: string;
  unidadeDestino: string | null;
  rotaResumo: string | null;
  kmEstimados: number | null;
  kmInicialHodometro: number | null;
  kmFinalHodometro: number | null;
  vagasTotais: number;
  observacoes: string | null;
  status: 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  iniciadaEm: string | null;
  concluidaEm: string | null;
  coordOrigem: GeoCoord | null;
  coordDestino: GeoCoord | null;
  veiculo: VeiculoResumoDto;
  motorista: MotoristaResumoDto;
  passageiros: PassageiroDto[];
  atualizadoEm: string | null;
}

export function mapPassageiro(p: any): PassageiroDto {
  const paciente = p.paciente;
  const sol = p.solicitacao;
  return {
    id: p.id,
    paciente: {
      id: paciente.id,
      nome: paciente.nome,
      cpf: paciente.cpf,
      dataNascimento: paciente.dataNascimento.toISOString().slice(0, 10),
      telefone: paciente.telefone ?? null,
      fotoUrl: null,
      ubs: paciente.ubs
        ? {
            id: paciente.ubs.id,
            nome: paciente.ubs.nome,
            // `Ubs` no schema atual não tem campo `bairro` — usamos `municipio`
            // como melhor proxy disponível (cidade onde a UBS opera).
            bairro: paciente.ubs.municipio ?? '',
            coord: null,
            endereco: paciente.ubs.endereco ?? null,
          }
        : null,
      observacoesMobilidade: null,
    },
    solicitacao: {
      id: sol.id,
      protocolo: sol.protocolo,
      prioridade: sol.prioridade,
      destino: sol.destino,
      unidadeDestino: sol.unidadeDestino ?? null,
    },
    acompanhante: p.acompanhante,
    presenca: p.presenca,
    observacao: p.observacao ?? null,
    marcadoEm: p.marcadoEm?.toISOString() ?? null,
    marcadoPor: p.marcadoPorId ?? null,
  };
}

export function mapViagemMotorista(
  r: any,
  motoristaNome: string,
  motoristaMatricula: string,
): ViagemMotoristaDto {
  return {
    id: r.id,
    protocolo: null, // ViagemFrota não tem protocolo próprio hoje
    data: r.data.toISOString().slice(0, 10),
    horaSaida: r.horaSaida,
    horaPrevistaRetorno: r.horaPrevistaRetorno ?? null,
    destino: r.destino,
    unidadeDestino: r.unidadeDestino ?? null,
    rotaResumo: r.rotaResumo ?? null,
    kmEstimados: r.kmEstimados ?? null,
    kmInicialHodometro: r.kmInicialHodometro ? Number(r.kmInicialHodometro) : null,
    kmFinalHodometro: r.kmFinalHodometro ? Number(r.kmFinalHodometro) : null,
    vagasTotais: r.vagasTotais,
    observacoes: r.observacoes ?? null,
    status: r.status,
    iniciadaEm: r.iniciadaEm?.toISOString() ?? null,
    concluidaEm: r.concluidaEm?.toISOString() ?? null,
    coordOrigem: null,
    coordDestino: null,
    veiculo: {
      id: r.veiculo.id,
      placa: r.veiculo.placa,
      modelo: r.veiculo.modelo,
      tipo: r.veiculo.tipo,
      capacidade: r.veiculo.capacidade,
      status: r.veiculo.status,
    },
    motorista: {
      id: r.motoristaId,
      nome: motoristaNome,
      matricula: motoristaMatricula,
      status: 'ATIVO',
    },
    passageiros: (r.passageiros ?? []).map(mapPassageiro),
    atualizadoEm: (r.atualizadoEm ?? r.iniciadaEm ?? r.criadaEm)?.toISOString() ?? null,
  };
}
