# Scratch & Win Hub

Aja como um desenvolvedor Front-end Sênior especialista em React, TypeScript, Tailwind CSS, Shadcn UI e Supabase. Sua missão é criar um Web App completo de "Raspadinha Online Gamificada".

1. CONTEXTO DE BANCO DE DADOS E BACKEND (SUPABASE) O backend já está 100% configurado no meu Supabase com as seguintes tabelas e funções RLS habilitadas:

Tabela profiles: id (uuid), balance (numeric), points (int), is_admin (boolean). (Nota: um trigger já insere R$10.00 iniciais no cadastro).

Tabela scratchcards: id, title, price (numeric), points_reward (int), active (boolean).

Tabela store_items: id, title, description, points_cost (int), stock (int), active.

RPC 1: play_scratchcard(card_id). Retorna: { prize: number, new_balance: number, new_points: number, points_earned: number }.

RPC 2: redeem_item(item_id_param). Retorna: { success: boolean, new_points: number }.

2. AUTENTICAÇÃO E GERENCIAMENTO DE ESTADO

Integre o Supabase Auth (Email e Senha). Crie uma tela bonita de Login/Cadastro.

Se o usuário estiver autenticado, busque os dados dele na tabela profiles e armazene no estado global da aplicação (Saldo, Pontos e status de Admin).

3. LAYOUT PRINCIPAL (DASHBOARD LOGADO)

Header Fixo: Mostre o E-mail do usuário, Botão de Logout, "Saldo: R$ X,XX" (com ícone de dinheiro verde) e "Pontos: X" (com ícone de moeda dourada).

Navegação (Tabs do Shadcn): Crie 3 abas principais: "🎮 Jogar", "🛍️ Loja de Resgate" e "⚙️ Painel Admin" (Renderize a aba Admin APENAS se is_admin for true).

4. ABA 1: O JOGO DA RASPADINHA (CRÍTICO)

Exiba as raspadinhas ativas (scratchcards) em cards contendo o Título, Preço e Recompensa em pontos. Adicione um botão "Comprar e Jogar".

Ao clicar em "Comprar":

Bloqueie o botão (loading).

Chame supabase.rpc('play_scratchcard', { card_id: id }).

Com a resposta, exiba o componente interativo de Raspadinha.

O Componente Canvas (Raspadinha):

Precisa ter uma div relativa de aprox 300x150px.

O Fundo (camada inferior) mostra o prêmio recebido pela RPC (Verde com R$ se ganhou, Vermelho se perdeu).

A Frente (camada superior) deve ser um <canvas> HTML5 absoluto preenchido com a cor #9CA3AF e o texto "RASPE AQUI".

Implemente a lógica de raspagem no Canvas usando globalCompositeOperation = 'destination-out' ao disparar eventos de mousemove e touchmove (suporte mobile é obrigatório). Conforme o usuário passa o dedo/mouse, revela o prêmio embaixo.

Mostre um botão "Jogar Novamente" abaixo do canvas para resetar o estado.

5. ABA 2: LOJA DE RESGATE (STORE)

Liste os store_items ativos em um Grid responsivo usando os Cards do Shadcn.

Cada card mostra: Título, Descrição, Preço em Pontos e Estoque disponível.

Botão "Resgatar Item": Chama a RPC redeem_item. Mostre um toast (Shadcn Toast) de Sucesso ou Erro e atualize os pontos no Header em tempo real.

6. ABA 3: PAINEL DE ADMINISTRAÇÃO

Layout em duas colunas (ou abas internas):

Nova Raspadinha: Formulário para inserir title, price, points_reward. Ao salvar, insere no supabase (insert em scratchcards).

Novo Item na Loja: Formulário para title, description, points_cost, stock. Salva no supabase (insert em store_items).

Mostre toasts de sucesso após a criação.

7. UI/UX E ESTILIZAÇÃO

Use um tema escuro (Dark Mode) estilo "iGaming/Cassino moderno". Fundo escuro (slate-950), bordas suaves, efeitos de "glow" em botões primários.

Use a biblioteca lucide-react para todos os ícones.

O design deve ser 100% responsivo (mobile-first). As raspadinhas devem caber perfeitamente na tela de um celular.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f75abdfa-2e62-4320-8856-aba1d6e98a65).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
