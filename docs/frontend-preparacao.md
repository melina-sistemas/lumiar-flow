# Preparacao para a Interface

Para facilitar a integracao com o frontend, foi criada uma camada inicial de servico em:

- `apps/web/src/services/loan-api.ts`

## O que esse arquivo faz

Ele centraliza as chamadas da interface para a API:

- `createLoan(input)`
- `returnLoan(input)`

Assim, as telas nao precisam montar `fetch` diretamente em cada componente.

## Como isso ajuda no frontend

Quando formos criar a interface:

- a tela de emprestimo vai chamar `createLoan`
- a tela de devolucao vai chamar `returnLoan`
- os tipos de entrada e saida ja estao prontos via `@lumiar-flow/shared`

## Fluxo simples da tela de emprestimo

1. usuario escolhe livro e usuario
2. frontend envia `CreateLoanRequest`
3. API responde com `CreateLoanResult`
4. tela mostra sucesso ou erro de validacao

## Fluxo simples da tela de devolucao

1. usuario abre o emprestimo
2. preenche `learning`, `application` e `example`
3. frontend envia `ReturnLoanRequest`
4. API responde com `ReturnLoanResult`
5. tela mostra atraso, pontuacao e confirmacao de devolucao

## Proximo passo ideal

Agora estamos prontos para montar a primeira interface com duas telas:

1. cadastro de emprestimo
2. devolucao de livro com formulario das 3 respostas
