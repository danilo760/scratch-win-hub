# Scratch & Win Hub

Aplicação web de raspadinhas digitais construída com React, TypeScript, TanStack Router/Query, Tailwind CSS, shadcn/ui e Supabase.

> Estado técnico: o projeto está em remediação e validação. Não considere este repositório `PRODUCTION READY` apenas porque build, lint ou testes estáticos passam. Testes de integração, concorrência, RLS multiusuário e configurações externas de Auth ainda precisam ser validados em ambiente apropriado.

## Stack

- React + TypeScript
- Vite / TanStack Start e TanStack Router
- TanStack Query
- Tailwind CSS + shadcn/ui + lucide-react
- Supabase Auth + PostgreSQL + RLS + RPCs
- GitHub Actions para validação
- Lovable como editor/preview sincronizado com a branch `main`

## Fluxo principal de raspadinha

A aba **Raspadinhas** usa `GameTab` e a RPC `play_scratchcard_v1`.

Fluxo simplificado:

```text
scratchcards ativos
→ versão matemática PUBLISHED
→ raridade da versão publicada
→ play_scratchcard_v1(card_id, client_request_id, source)
→ outcome ponderado server-side
→ débito/prêmio/pontos
→ ledgers append-only
→ resposta completa
→ ScratchCard apenas revela visualmente o resultado já decidido
```

O canvas nunca decide o prêmio. O resultado financeiro e de pontos é definido no servidor antes da raspagem visual.

## Matemática e raridades

Raridades atualmente utilizadas pelo schema:

```text
bronze
prata
ouro
diamante
```

Versões matemáticas seguem o ciclo:

```text
DRAFT → PUBLISHED → RETIRED
```

- `DRAFT`: editável.
- `PUBLISHED`: imutável, salvo transição controlada para `RETIRED`.
- `RETIRED`: histórico imutável.
- Outcomes de versões `PUBLISHED` ou `RETIRED` não podem ser alterados.

Cada outcome possui nome, prêmio em créditos, pontos e peso. A probabilidade informativa é calculada como `weight / soma(weights)`; o peso permanece a fonte de verdade.

## Idempotência

Operações críticas usam `client_request_id` para proteger retries de rede.

Principais RPCs:

- `play_scratchcard_v1`
- `redeem_reward_v1`
- `claim_daily_scratch_v2`
- `open_mystery_scratch_v1`

A jogada principal serializa retries simultâneos da mesma requisição por usuário e devolve o mesmo contrato completo em retry, incluindo saldo e pontos autoritativos.

## Ledgers

Alterações relevantes são registradas em estruturas append-only:

- `credit_ledger`
- `points_ledger`
- `audit_logs`
- `admin_audit_logs`

O frontend não deve ajustar saldo/pontos de forma autoritativa. Após uma mutação válida, ele atualiza a experiência e refaz a consulta do perfil no servidor.

## Raspadinha Diária

O cliente usa:

```text
claim_daily_scratch_v2(client_request_id)
```

O frontend não escolhe arbitrariamente `card_id`. A configuração da diária é resolvida no servidor. Se não existir uma raspadinha diária ativa com matemática publicada, a interface mostra **Configuração pendente / Em breve** e não chama a RPC.

A função antiga `claim_daily_scratch_v1(card_id, client_request_id)` foi mantida apenas para compatibilidade interna e não é executável diretamente por usuários autenticados.

## Raspadinha Misteriosa

A Misteriosa usa versões/pools publicados com entradas ponderadas. A interface só habilita a ação quando o pool publicado continua integralmente válido:

- todas as entradas possuem peso positivo;
- todas apontam para raspadinhas existentes e ativas;
- todas possuem matemática `PUBLISHED`.

Retries simultâneos do mesmo `client_request_id` também são serializados.

## Loja e resgates

A loja usa o schema atual de `store_items`, incluindo:

- `stock_total`
- `stock_available`
- `per_user_limit`
- `points_cost`
- `category`
- `starts_at` / `ends_at`
- `display_order`
- `image_url`
- `active`

Resgates usam `redeem_reward_v1` e administração por `admin_update_redemption_v1`.

Transições administrativas são protegidas no servidor; o frontend não faz `UPDATE` direto de status.

## Perfis, XP e conquistas

`profiles` contém, entre outros campos:

- saldo e pontos;
- `display_name` e `public_slug`;
- preferências de perfil público;
- XP e nível;
- status administrativo.

O cadastro cria o perfil por trigger server-side. O slug público é derivado deterministicamente do UUID do usuário e possui unicidade no banco.

As conquistas atuais refletem ações realmente verificáveis, como primeira raspadinha, primeira jogada de determinada raridade e uma diária. A concessão ocorre server-side e as funções internas de progressão/conquista não são executáveis por `anon` ou `authenticated`.

## Admin

O workspace administrativo possui áreas para:

- Visão Geral
- Raspadinhas
- Versões Matemáticas
- Resultados
- Raridades
- Diária
- Misteriosa
- Loja
- Resgates
- Conquistas
- Usuários
- Ledger
- Auditoria
- Simulador

Operações administrativas críticas são feitas por RPCs que validam `auth.uid()` e autorização de admin no servidor.

## Fluxos legados

O produto antigo de sorteios (`raffles` / `raffle_tickets`) foi retirado da experiência principal. As estruturas históricas permanecem no banco quando necessárias para preservar migrations e histórico.

O antigo fluxo de depósito PIX também não faz parte da experiência atual. O frontend não possui chave PIX hardcoded nem permissão para criar diretamente novas `credit_transactions`.

## Segurança

Princípios atuais:

- RLS ativo nas tabelas públicas relevantes;
- ownership com `(select auth.uid())` quando apropriado;
- RPCs administrativas validam admin server-side;
- funções privilegiadas têm grants restritos;
- matemática publicada/histórica é imutável;
- ledgers e auditoria preservam histórico;
- `.env` e `.env.*` não são versionados;
- `service_role` é exclusivamente server-side.

### Configuração externa pendente

O Supabase Security Advisor indica que **Leaked Password Protection** está desativado. Essa opção deve ser habilitada no painel/configuração de Auth antes de considerar produção real.

Também é recomendado revisar confirmação de e-mail, recuperação de senha, rate limits, SMTP/CAPTCHA conforme o volume e MFA para administradores.

## Variáveis de ambiente

Copie `.env.example` e preencha apenas no ambiente apropriado.

Client-side:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Server-side:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` ao browser ou ao repositório.

## Scripts

```bash
npm run dev
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

A CI executa a sequência de validação:

```text
format → lint → typecheck → test → build
```

## Testes e limites atuais

Os testes existentes de contrato são úteis para detectar regressões de código, mas não substituem testes transacionais reais.

Antes de produção ainda devem ser executados em ambiente isolado:

- cadastro completo Auth → profile → login;
- concorrência de 50 jogadas com retries controlados;
- 20 solicitações simultâneas da diária;
- disputa concorrente do último item em estoque;
- retry após perda de resposta de rede;
- matriz RLS `anon / user_a / user_b / admin`;
- validação de interface em viewports mobile e desktop.

Esses testes não devem ser executados contra dados reais de produção.

## Migrations

Alterações de banco são feitas por migrations incrementais em `supabase/migrations`. Não edite migrations históricas já aplicadas e não altere versões matemáticas `PUBLISHED` diretamente.

## Desenvolvimento

```bash
git clone https://github.com/danilo760/scratch-win-hub.git
cd scratch-win-hub
npm install
npm run dev
```

O projeto também pode ser aberto no Lovable. Mudanças enviadas para `main` ficam disponíveis para sincronização no editor.
