# Smoke test manual — checklist iOS + Android

Procedimento manual a executar antes de cada release. Cobre o golden path
do motorista — usar mock seed (sem backend).

```bash
flutter run --dart-define=USE_MOCK=true
# Credenciais: matrícula 12345, senha trocar123 (força 1º acesso)
```

## Auth

- [ ] Splash institucional aparece e desaparece (~1s).
- [ ] Login: matrícula errada (`99999`) → erro inline "Matrícula ou senha inválida".
- [ ] Login: matrícula `12345` + senha qualquer (8+ chars) → entra direto.
- [ ] Login: senha `trocar123` → vai para tela de troca de senha; tentar nova senha < 8 chars dá erro; senha válida entra.
- [ ] Token sobrevive ao kill do app: feche o app, reabra — deve entrar direto na lista (cache).

## Lista de viagens

- [ ] Tab HOJE: aparece 1 viagem EM_ANDAMENTO + 2 AGENDADAs.
- [ ] MetricCards no topo somam corretamente.
- [ ] Pull-to-refresh dispara sync (SyncIndicator muda pra SINCRONIZANDO… → SINCRONIZADO).
- [ ] Tab PRÓXIMAS: 2 viagens (daqui 2 e 5 dias).
- [ ] Tab HISTÓRICO: 2 viagens CONCLUÍDAS.
- [ ] Bottom nav: tocar em Abastec. → vai pra /abastecimentos; Perfil → /perfil.

## Detalhe da viagem (tocar em qualquer)

- [ ] Action bar mostra protocolo + dia/horário + status badge.
- [ ] Tab Resumo: 4 painéis (Trajeto, Veículo, Hodômetro, Ocupação).
- [ ] Tab Passageiros: lista dos pacientes com avatar de iniciais + chips de UBS + prioridade.
- [ ] Tab Mapa: OpenStreetMap aparece com markers O/U/D (origem azul, UBS âmbar, destino verde). Pan + zoom funcionam.
- [ ] Tab Histórico: timeline com bullets coloridos por tom.
- [ ] Voltar leva pra lista preservando a aba.

## Chamada digital (em viagem EM_ANDAMENTO ou AGENDADA)

- [ ] Aba Passageiros → swipe-right num passageiro AGUARDANDO → vira EMBARCADO (verde) + snackbar.
- [ ] Swipe-left → abre modal de presença pré-selecionada com AUSENTE; observação é obrigatória.
- [ ] Tap no card abre modal completo com as 4 opções; ao confirmar, status atualiza ao vivo via StreamBuilder.
- [ ] Em viagem CONCLUÍDA, swipe não funciona (modo read-only).

## Iniciar/concluir viagem

- [ ] Viagem AGENDADA: bottom action mostra "INICIAR VIAGEM". Tap abre modal.
- [ ] Modal valida km > 0; ao confirmar mostra overlay de sucesso verde com protocolo grande, auto-fecha em ~1.7s.
- [ ] Status muda pra EM_ANDAMENTO; bottom action vira "CONCLUIR VIAGEM".
- [ ] Concluir: modal mostra km inicial como referência; bloqueia km final ≤ inicial; overlay de sucesso mostra KM rodados.

## Abastecimento

- [ ] /abastecimentos: lista com 1 abastecimento histórico (mock seed) e MetricCards.
- [ ] Tap em "+ Novo abastecimento" → form abre.
- [ ] Total calculado atualiza ao digitar litros/valor.
- [ ] Botão "Câmera" pede permissão na 1ª vez; foto fica em preview com botão X pra remover.
- [ ] "Galeria" funciona igual.
- [ ] Salvar sem foto → snackbar "Abastecimento registrado".
- [ ] Salvar com foto → snackbar "Abastecimento registrado com comprovante".

## Ajuda de custo

- [ ] /perfil → Ajudas de custo → 1 ajuda do mock seed aparece.
- [ ] Card mostra protocolo, paciente, itens (2 itens), valor total destacado em R$.
- [ ] Status badge correto (AUTORIZADA → âmbar).

## Perfil

- [ ] Header mostra avatar de iniciais + nome + matrícula + StatusBadge ATIVO.
- [ ] Painel CNH com badge "OK" (mock seed tem CNH válida 320 dias).
- [ ] MetricCards: 247 viagens, 38 452 KM rodados.
- [ ] Tap em "Encerrar sessão" abre modal de confirmação brutalista.
- [ ] Cancelar mantém logado. Confirmar limpa tudo e volta pra /login.
- [ ] Após logout, abrir o app deve voltar pra /login (sem auto-login).

## Modo offline

```bash
flutter run --dart-define=USE_MOCK=true --dart-define=SIMULATE_OFFLINE=true
```

- [ ] Login com matrícula 12345 → erro "Modo offline simulado ativo" (esperado, sem sessão salva).
- [ ] Reabrir app com sessão salva (sem SIMULATE_OFFLINE → login → quit; depois com SIMULATE_OFFLINE) deve entrar.
- [ ] SyncIndicator mostra "OFFLINE".
- [ ] Marcar presença ainda funciona — UI atualiza, contador "N PENDENTES" sobe.
- [ ] Rodar sem SIMULATE_OFFLINE depois → outbox drena, contador zera, SyncIndicator vira "SINCRONIZADO".

## Mapa offline

- [ ] Em qualquer viagem com coordenadas, abrir a aba Mapa.
- [ ] Tiles carregam (online).
- [ ] Pan a área visualizada fica cacheada.
- [ ] Ligar avião → reabrir viagem → mapa ainda mostra área visitada.

---

# Audit de anti-patterns (rodar antes de cada PR)

```bash
# Cantos arredondados proibidos
grep -rn 'rounded-\(lg\|xl\|full\|2xl\|3xl\)' lib/  # esperado: 0

# Sombras difusas
grep -rn 'shadow-\(md\|lg\|xl\|2xl\)' lib/          # esperado: 0
grep -rn 'BoxShadow' lib/ | grep -v 'blurRadius: 0' # apenas modal brutalista permite

# Cores literais fora do tokens.dart
grep -rn 'Color(0x' lib/ | grep -v 'tokens.dart' | grep -v 'app_theme.dart' | grep -v 'main.dart' | grep -v 'splash_screen.dart'

# Fontes do Google CDN proibidas (LGPD)
grep -rn 'google_fonts' lib/ | grep -v 'pubspec.lock'  # esperado: 0 (Inter + JetBrains Mono são locais)
```

Resultados esperados: todos os greps acima devem retornar **0 linhas**
(excetuadas as exceções documentadas).

---

# Suite de testes automatizada

```bash
flutter analyze    # 0 issues esperado
flutter test       # 23+ testes passando esperado
```

Atualmente cobertos:
- Roundtrip dos enums (StatusViagem, PresencaPassageiro).
- Roundtrip Motorista + cnhAVencer/cnhVencida.
- Viagem.fromJson + copyWith.
- TfdApiMock (login, viagens, presença, simulateOffline).
- Splash widget.
- Widgets do DS: PrimaryButton (5 cenários), StatusBadge (3), MetricCard (3),
  SyncIndicator (5), SubNav (3).

Lacunas conhecidas (próximos PRs):
- Drift in-memory test do ViagensDao.
- Unit test do OutboxProcessor com fakes.
- Integration test do golden path (chamada → iniciar → concluir).
