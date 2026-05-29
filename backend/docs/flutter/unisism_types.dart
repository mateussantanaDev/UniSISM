// UNISISM · App do Paciente — Tipos Dart
// ─────────────────────────────────────────────────────
// Espelha os DTOs expostos pelo backend em /paciente-app/*
// e os shapes compartilhados de Encaminhamento.
//
// Uso: copie para `lib/api/unisism_types.dart` no seu app Flutter.

import 'package:meta/meta.dart';

// ============================================================
// ENUMS — strings opacas (uso enum-like via constantes)
// ============================================================

/// Status possíveis de um encaminhamento.
class StatusEncaminhamento {
  static const rascunho = 'RASCUNHO';
  static const aguardandoRegulacao = 'AGUARDANDO_REGULACAO';
  static const pendenciaDocumento = 'PENDENCIA_DOCUMENTO';
  static const aprovado = 'APROVADO';
  static const rejeitado = 'REJEITADO';

  /// Texto amigável em pt-BR para exibição.
  static String rotulo(String status) {
    switch (status) {
      case aguardandoRegulacao:
        return 'Aguardando Regulação';
      case pendenciaDocumento:
        return 'Pendência de Documento';
      case aprovado:
        return 'Aprovado';
      case rejeitado:
        return 'Rejeitado';
      case rascunho:
        return 'Rascunho';
      default:
        return status;
    }
  }
}

class PrioridadeClinica {
  static const eletiva = 'ELETIVA';
  static const prioritaria = 'PRIORITARIA';
  static const urgente = 'URGENTE';
  static const emergencia = 'EMERGENCIA';
}

class TipoAnexo {
  static const solicitacao = 'SOLICITACAO';
  static const rg = 'RG';
  static const cpf = 'CPF';
  static const cartaoSus = 'CARTAO_SUS';
  static const exame = 'EXAME';
  static const laudo = 'LAUDO';
  static const respostaSus = 'RESPOSTA_SUS';
  static const outro = 'OUTRO';
}

class StatusScanAnexo {
  static const pendente = 'PENDENTE';
  static const limpo = 'LIMPO';
  static const infectado = 'INFECTADO';
  static const falhou = 'FALHOU';
}

class TipoNotificacao {
  static const encaminhamentoCriado = 'ENCAMINHAMENTO_CRIADO';
  static const pendenciaRegistrada = 'PENDENCIA_REGISTRADA';
  static const pendenciaResolvida = 'PENDENCIA_RESOLVIDA';
  static const aprovado = 'APROVADO';
  static const agendado = 'AGENDADO';
  static const rejeitado = 'REJEITADO';
  static const respostaSusDisponivel = 'RESPOSTA_SUS_DISPONIVEL';
}

// ============================================================
// Paciente (info do login)
// ============================================================

@immutable
class PacienteMe {
  final String id;
  final String nome;
  final String cpf;
  final String cpfFormatado;
  final String? email;
  final String? telefone;

  const PacienteMe({
    required this.id,
    required this.nome,
    required this.cpf,
    required this.cpfFormatado,
    this.email,
    this.telefone,
  });

  factory PacienteMe.fromJson(Map<String, dynamic> json) => PacienteMe(
        id: json['id'] as String,
        nome: json['nome'] as String,
        cpf: json['cpf'] as String,
        cpfFormatado: json['cpfFormatado'] as String,
        email: json['email'] as String?,
        telefone: json['telefone'] as String?,
      );
}

@immutable
class LoginPacienteResposta {
  /// Access token opaco Base64URL · TTL 30 min (v0.18.0+)
  final String token;
  /// Refresh token rotativo Base64URL · TTL 30 dias (v0.18.0+)
  /// Nullable para compat com backend antigo (que não enviava).
  final String? refreshToken;
  /// Segundos até access expirar (1800 = 30 min em v0.18.0+, era 86400 em v0.17.x)
  final int expiresIn;
  /// Segundos até refresh expirar (2592000 = 30 dias) — v0.18.0+
  final int? refreshExpiresIn;
  final PacienteMe paciente;

  const LoginPacienteResposta({
    required this.token,
    this.refreshToken,
    required this.expiresIn,
    this.refreshExpiresIn,
    required this.paciente,
  });

  factory LoginPacienteResposta.fromJson(Map<String, dynamic> json) =>
      LoginPacienteResposta(
        token: json['token'] as String,
        refreshToken: json['refreshToken'] as String?,
        expiresIn: json['expiresIn'] as int,
        refreshExpiresIn: json['refreshExpiresIn'] as int?,
        paciente: PacienteMe.fromJson(json['paciente'] as Map<String, dynamic>),
      );
}

// ============================================================
// Encaminhamento (shape igual ao Face 1/2)
// ============================================================

@immutable
class PacienteDados {
  final String nome;
  final String cpf;
  final String cartaoSus;
  final String dataNascimento; // YYYY-MM-DD
  final String sexo; // M | F | OUTRO
  final String telefone;
  final String endereco;

  const PacienteDados({
    required this.nome,
    required this.cpf,
    required this.cartaoSus,
    required this.dataNascimento,
    required this.sexo,
    required this.telefone,
    required this.endereco,
  });

  factory PacienteDados.fromJson(Map<String, dynamic> json) => PacienteDados(
        nome: json['nome'] as String,
        cpf: json['cpf'] as String,
        cartaoSus: json['cartaoSus'] as String,
        dataNascimento: json['dataNascimento'] as String,
        sexo: json['sexo'] as String,
        telefone: json['telefone'] as String,
        endereco: json['endereco'] as String,
      );
}

@immutable
class SolicitacaoMedica {
  final String medicoSolicitante;
  final String crm;
  final String especialidadeSolicitada;
  final String cid10;
  final String cidDescricao;
  final String justificativaClinica;
  final String prioridade;
  final String dataSolicitacao;

  const SolicitacaoMedica({
    required this.medicoSolicitante,
    required this.crm,
    required this.especialidadeSolicitada,
    required this.cid10,
    required this.cidDescricao,
    required this.justificativaClinica,
    required this.prioridade,
    required this.dataSolicitacao,
  });

  factory SolicitacaoMedica.fromJson(Map<String, dynamic> json) =>
      SolicitacaoMedica(
        medicoSolicitante: json['medicoSolicitante'] as String,
        crm: json['crm'] as String,
        especialidadeSolicitada: json['especialidadeSolicitada'] as String,
        cid10: json['cid10'] as String,
        cidDescricao: json['cidDescricao'] as String,
        justificativaClinica: json['justificativaClinica'] as String,
        prioridade: json['prioridade'] as String,
        dataSolicitacao: json['dataSolicitacao'] as String,
      );
}

@immutable
class AnexoDocumento {
  final String id;
  final String nome;
  final String tipo;
  final int tamanhoKb;
  final DateTime uploadEm;
  final String scanStatus;

  const AnexoDocumento({
    required this.id,
    required this.nome,
    required this.tipo,
    required this.tamanhoKb,
    required this.uploadEm,
    required this.scanStatus,
  });

  factory AnexoDocumento.fromJson(Map<String, dynamic> json) => AnexoDocumento(
        id: json['id'] as String,
        nome: json['nome'] as String,
        tipo: json['tipo'] as String,
        tamanhoKb: json['tamanhoKb'] as int,
        uploadEm: DateTime.parse(json['uploadEm'] as String),
        scanStatus: json['scanStatus'] as String,
      );

  /// true se o anexo pode ser baixado pelo usuário agora.
  bool get liberadoParaDownload => scanStatus == StatusScanAnexo.limpo;
}

@immutable
class EventoTimeline {
  final String id;
  final String tipo;
  final String titulo;
  final String descricao;
  final String autor;
  final String autorPapel;
  final DateTime em;

  const EventoTimeline({
    required this.id,
    required this.tipo,
    required this.titulo,
    required this.descricao,
    required this.autor,
    required this.autorPapel,
    required this.em,
  });

  factory EventoTimeline.fromJson(Map<String, dynamic> json) => EventoTimeline(
        id: json['id'] as String,
        tipo: json['tipo'] as String,
        titulo: json['titulo'] as String,
        descricao: json['descricao'] as String,
        autor: json['autor'] as String,
        autorPapel: json['autorPapel'] as String,
        em: DateTime.parse(json['em'] as String),
      );
}

@immutable
class RespostaSUS {
  final String anexoId;
  final String observacao;
  final DateTime registradoEm;
  final RegistradoPor registradoPor;

  const RespostaSUS({
    required this.anexoId,
    required this.observacao,
    required this.registradoEm,
    required this.registradoPor,
  });

  factory RespostaSUS.fromJson(Map<String, dynamic> json) => RespostaSUS(
        anexoId: json['anexoId'] as String,
        observacao: json['observacao'] as String,
        registradoEm: DateTime.parse(json['registradoEm'] as String),
        registradoPor:
            RegistradoPor.fromJson(json['registradoPor'] as Map<String, dynamic>),
      );
}

@immutable
class RegistradoPor {
  final String id;
  final String nome;
  final String matricula;

  const RegistradoPor({
    required this.id,
    required this.nome,
    required this.matricula,
  });

  factory RegistradoPor.fromJson(Map<String, dynamic> json) => RegistradoPor(
        id: json['id'] as String,
        nome: json['nome'] as String,
        matricula: json['matricula'] as String,
      );
}

@immutable
class Encaminhamento {
  final String id;
  final String protocolo;
  final String status;
  final PacienteDados paciente;
  final SolicitacaoMedica solicitacao;
  final List<AnexoDocumento> anexos;
  final List<EventoTimeline> timeline;
  final String unidadeOrigem;
  final String atendenteResponsavel;
  final String? observacoesRegulacao;
  final DateTime? agendamentoPrevisto;
  final RespostaSUS? respostaSUS;
  final DateTime criadoEm;
  final DateTime atualizadoEm;

  const Encaminhamento({
    required this.id,
    required this.protocolo,
    required this.status,
    required this.paciente,
    required this.solicitacao,
    required this.anexos,
    required this.timeline,
    required this.unidadeOrigem,
    required this.atendenteResponsavel,
    this.observacoesRegulacao,
    this.agendamentoPrevisto,
    this.respostaSUS,
    required this.criadoEm,
    required this.atualizadoEm,
  });

  factory Encaminhamento.fromJson(Map<String, dynamic> json) => Encaminhamento(
        id: json['id'] as String,
        protocolo: json['protocolo'] as String,
        status: json['status'] as String,
        paciente: PacienteDados.fromJson(json['paciente'] as Map<String, dynamic>),
        solicitacao:
            SolicitacaoMedica.fromJson(json['solicitacao'] as Map<String, dynamic>),
        anexos: (json['anexos'] as List)
            .map((a) => AnexoDocumento.fromJson(a as Map<String, dynamic>))
            .toList(),
        timeline: ((json['timeline'] as List?) ?? [])
            .map((e) => EventoTimeline.fromJson(e as Map<String, dynamic>))
            .toList(),
        unidadeOrigem: json['unidadeOrigem'] as String,
        atendenteResponsavel: json['atendenteResponsavel'] as String,
        observacoesRegulacao: json['observacoesRegulacao'] as String?,
        agendamentoPrevisto: json['agendamentoPrevisto'] != null
            ? DateTime.parse(json['agendamentoPrevisto'] as String)
            : null,
        respostaSUS: json['respostaSUS'] != null
            ? RespostaSUS.fromJson(json['respostaSUS'] as Map<String, dynamic>)
            : null,
        criadoEm: DateTime.parse(json['criadoEm'] as String),
        atualizadoEm: DateTime.parse(json['atualizadoEm'] as String),
      );

  /// Retorna o anexo com o PDF oficial do SUS, se existir.
  AnexoDocumento? get anexoRespostaSUS {
    if (respostaSUS == null) return null;
    try {
      return anexos.firstWhere((a) => a.id == respostaSUS!.anexoId);
    } catch (_) {
      return null;
    }
  }
}

// ============================================================
// Notificação (timeline do paciente estilo Amazon/Shopee)
// ============================================================

@immutable
class NotificacaoPaciente {
  final String id;
  final String tipo;
  final String titulo;
  final String corpo;
  final String? encaminhamentoId;
  final String? protocolo;
  final Map<String, dynamic>? payload;
  final DateTime criadaEm;
  final DateTime? lidaEm;

  const NotificacaoPaciente({
    required this.id,
    required this.tipo,
    required this.titulo,
    required this.corpo,
    this.encaminhamentoId,
    this.protocolo,
    this.payload,
    required this.criadaEm,
    this.lidaEm,
  });

  bool get lida => lidaEm != null;

  factory NotificacaoPaciente.fromJson(Map<String, dynamic> json) =>
      NotificacaoPaciente(
        id: json['id'] as String,
        tipo: json['tipo'] as String,
        titulo: json['titulo'] as String,
        corpo: json['corpo'] as String,
        encaminhamentoId: json['encaminhamentoId'] as String?,
        protocolo: json['protocolo'] as String?,
        payload: json['payload'] as Map<String, dynamic>?,
        criadaEm: DateTime.parse(json['criadaEm'] as String),
        lidaEm: json['lidaEm'] != null
            ? DateTime.parse(json['lidaEm'] as String)
            : null,
      );
}

// ============================================================
// Erros (shape padrão do backend)
// ============================================================

@immutable
class UnisismApiError implements Exception {
  final int status;
  final String code;
  final String message;
  final Map<String, dynamic>? details;

  const UnisismApiError({
    required this.status,
    required this.code,
    required this.message,
    this.details,
  });

  factory UnisismApiError.fromResponse(int status, Map<String, dynamic>? body) {
    final err = (body?['error'] as Map<String, dynamic>?) ?? const {};
    return UnisismApiError(
      status: status,
      code: (err['code'] as String?) ?? 'ERRO_INTERNO',
      message: (err['message'] as String?) ?? 'Erro desconhecido',
      details: err['details'] as Map<String, dynamic>?,
    );
  }

  @override
  String toString() => 'UnisismApiError($status · $code): $message';
}
