# Sprint 10 – LLM Integration Layer

Architecture (mandatory):

```
Question
  → LLM (AIProvider.classifyIntent)
  → QueryEngine (tenant + scope)     ← unchanged from Sprint 9
  → ContextBuilder (scoped payload only)
  → LLM (summarize / insights / recommendations)
  → copilot_logs
```

LLM never accesses the database.

## Providers
- `MockProvider` (default, `AI_PROVIDER=mock`)
- `OpenAIProvider` (`AI_PROVIDER=openai`, needs `OPENAI_API_KEY`)
- `AzureOpenAIProvider` (`AI_PROVIDER=azure`, needs Azure env vars)

## New pieces
- `AIProvider` interface
- `PromptTemplateService`
- `ContextBuilder`
- `GET /copilot/ceo-summary`
- `copilot_logs` table (migration `1737000000000`)
- Feature `business_copilot_ai` (AI endpoints require it)

## Env
```
AI_PROVIDER=mock          # mock | openai | azure
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
```
