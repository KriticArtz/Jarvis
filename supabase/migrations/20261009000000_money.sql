-- =============================================================================
-- Money (financial command center)
--
-- Bank data comes from Plaid. Plaid-derived tables are READ-ONLY for users:
-- they can select their own rows, and only server code (service role) writes
-- them after authenticating the user. Plaid access tokens are encrypted by the
-- app (AES-256-GCM, INTEGRATIONS_ENCRYPTION_KEY) and live in a server-only
-- table with no API grants. Bank passwords are never seen or stored.
--
--   financial_connections     one row per linked institution (Plaid item)
--   financial_credentials     encrypted access token + sync cursor (server-only)
--   financial_accounts        normalized accounts with balances
--   financial_transactions    normalized transactions (no raw Plaid payloads)
--   recurring_payments        detected recurring outflows (+ the user's review decision)
--   financial_goals           user-defined savings / payoff goals
--   financial_budgets         monthly budget: 'total' and optional per category
--   financial_income_profile  user-PROVIDED gross monthly income (kept apart from
--                             transaction-derived income) for debt-to-income
--
-- Sign convention: amount > 0 is money in, amount < 0 is money out.
-- Everything is deleted with the account; disconnecting an institution deletes
-- its accounts and transactions (cascade).
-- =============================================================================

create table public.financial_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'plaid' check (provider in ('plaid')),
  item_id text not null check (char_length(item_id) between 1 and 200),
  institution_id text check (char_length(institution_id) <= 100),
  institution_name text check (char_length(institution_name) <= 200),
  -- reauth_required: the institution needs the user to sign in again (Plaid update mode)
  status text not null default 'connected' check (status in ('connected', 'reauth_required', 'error')),
  last_synced_at timestamptz,
  last_error text check (char_length(last_error) <= 200),
  -- Plaid imports history after Link: 'pending' (nothing yet), 'recent' (about
  -- the last 30 days), 'complete' (the full history requested)
  history_status text not null default 'pending' check (history_status in ('pending', 'recent', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, item_id)
);
create index financial_connections_user_idx on public.financial_connections (user_id);
create trigger financial_connections_updated_at before update on public.financial_connections
  for each row execute function public.set_updated_at();

create table public.financial_credentials (
  connection_id uuid primary key references public.financial_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Encrypted by the app; never plaintext.
  access_token_enc text not null,
  -- Plaid /transactions/sync cursor: makes syncing incremental and idempotent.
  sync_cursor text check (char_length(sync_cursor) <= 4096),
  updated_at timestamptz not null default now()
);
create trigger financial_credentials_updated_at before update on public.financial_credentials
  for each row execute function public.set_updated_at();

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.financial_connections (id) on delete cascade,
  provider_account_id text not null check (char_length(provider_account_id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 200),
  official_name text check (char_length(official_name) <= 200),
  mask text check (char_length(mask) <= 8),
  type text not null check (type in ('depository', 'credit', 'loan', 'investment', 'other')),
  subtype text check (char_length(subtype) <= 50),
  -- For credit and loan accounts, current_balance is the amount owed (positive).
  current_balance numeric(14, 2),
  available_balance numeric(14, 2),
  credit_limit numeric(14, 2),
  iso_currency text not null default 'USD' check (char_length(iso_currency) <= 3),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_account_id)
);
create index financial_accounts_user_idx on public.financial_accounts (user_id);
create trigger financial_accounts_updated_at before update on public.financial_accounts
  for each row execute function public.set_updated_at();

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.financial_connections (id) on delete cascade,
  account_id uuid not null references public.financial_accounts (id) on delete cascade,
  provider_transaction_id text not null check (char_length(provider_transaction_id) between 1 and 200),
  date date not null,
  authorized_date date,
  name text not null check (char_length(name) between 1 and 300),
  merchant_name text check (char_length(merchant_name) <= 200),
  -- Normalized merchant ("netflix") for grouping and recurring detection.
  merchant_key text not null check (char_length(merchant_key) between 1 and 120),
  -- Only when the provider reports one; never guessed.
  merchant_website text check (char_length(merchant_website) <= 300),
  amount numeric(14, 2) not null,
  iso_currency text not null default 'USD' check (char_length(iso_currency) <= 3),
  category text not null check (char_length(category) between 1 and 40),
  provider_category text check (char_length(provider_category) <= 80),
  pending boolean not null default false,
  payment_channel text check (char_length(payment_channel) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_transaction_id)
);
create index financial_transactions_user_date_idx on public.financial_transactions (user_id, date desc);
create index financial_transactions_user_merchant_idx on public.financial_transactions (user_id, merchant_key);
create trigger financial_transactions_updated_at before update on public.financial_transactions
  for each row execute function public.set_updated_at();

create table public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- merchant + frequency + amount band: two different subscriptions from one
  -- merchant stay apart, while a modest price change keeps the same row (and decision).
  pattern_key text not null check (char_length(pattern_key) between 1 and 200),
  merchant_key text not null check (char_length(merchant_key) between 1 and 120),
  merchant_name text not null check (char_length(merchant_name) between 1 and 200),
  merchant_website text check (char_length(merchant_website) <= 300),
  category text not null check (char_length(category) between 1 and 40),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual')),
  -- Typical charge (positive number, money out).
  average_amount numeric(14, 2) not null check (average_amount > 0),
  last_amount numeric(14, 2) not null check (last_amount > 0),
  last_date date not null,
  next_expected_date date,
  occurrences integer not null check (occurrences >= 2),
  -- 0..1: how sure the detector is. Only confident patterns are stored.
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  status text not null default 'active' check (status in ('active', 'inactive')),
  -- The user's review: keep / review later / wants to cancel (we never cancel anything).
  decision text check (decision in ('keep', 'review', 'cancel')),
  account_id uuid references public.financial_accounts (id) on delete set null,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pattern_key)
);
create index recurring_payments_user_idx on public.recurring_payments (user_id);
create trigger recurring_payments_updated_at before update on public.recurring_payments
  for each row execute function public.set_updated_at();

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- save: build up to the target. pay_off: bring a balance down by the target.
  kind text not null default 'save' check (kind in ('save', 'pay_off')),
  target_amount numeric(14, 2) not null check (target_amount > 0 and target_amount < 100000000),
  current_amount numeric(14, 2) not null default 0 check (current_amount >= 0 and current_amount < 100000000),
  target_date date,
  -- The user's assumed monthly contribution; projections say so explicitly.
  monthly_contribution numeric(14, 2) check (monthly_contribution is null or (monthly_contribution > 0 and monthly_contribution < 10000000)),
  -- Optional: track progress from a connected account's balance.
  account_id uuid references public.financial_accounts (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'achieved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index financial_goals_user_idx on public.financial_goals (user_id);
create trigger financial_goals_updated_at before update on public.financial_goals
  for each row execute function public.set_updated_at();

create table public.financial_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'total' is the overall monthly spending budget; otherwise a spending category key.
  category text not null check (char_length(category) between 1 and 40),
  monthly_amount numeric(14, 2) not null check (monthly_amount > 0 and monthly_amount < 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);
create trigger financial_budgets_updated_at before update on public.financial_budgets
  for each row execute function public.set_updated_at();

create table public.financial_income_profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- What the user TOLD us (before taxes). Never inferred from deposits.
  gross_monthly_income numeric(14, 2) check (gross_monthly_income is null or (gross_monthly_income > 0 and gross_monthly_income < 10000000)),
  -- Debt payments we can't see in connected accounts (e.g. a car loan paid elsewhere).
  other_monthly_debt_payments numeric(14, 2) check (other_monthly_debt_payments is null or (other_monthly_debt_payments >= 0 and other_monthly_debt_payments < 10000000)),
  updated_at timestamptz not null default now()
);
create trigger financial_income_profile_updated_at before update on public.financial_income_profile
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.financial_connections enable row level security;
alter table public.financial_credentials enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.financial_goals enable row level security;
alter table public.financial_budgets enable row level security;
alter table public.financial_income_profile enable row level security;

-- Plaid-derived data: owners read; the server writes.
create policy "financial_connections_select_own" on public.financial_connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "financial_accounts_select_own" on public.financial_accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "financial_transactions_select_own" on public.financial_transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "recurring_payments_select_own" on public.recurring_payments
  for select to authenticated using (user_id = (select auth.uid()));
-- The user's review decision is the only thing they can change on a recurring payment (column grant below).
create policy "recurring_payments_update_own" on public.recurring_payments
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- financial_credentials: intentionally no policies.

-- User-defined money settings: full control of their own rows.
create policy "financial_goals_all_own" on public.financial_goals
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "financial_budgets_all_own" on public.financial_budgets
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "financial_income_profile_all_own" on public.financial_income_profile
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A goal may only track the user's own account.
create policy "financial_goals_account_owned" on public.financial_goals as restrictive
  for all to authenticated
  using (true)
  with check (account_id is null or exists (select 1 from public.financial_accounts a where a.id = account_id and a.user_id = (select auth.uid())));

revoke all on public.financial_connections, public.financial_credentials, public.financial_accounts, public.financial_transactions,
  public.recurring_payments, public.financial_goals, public.financial_budgets, public.financial_income_profile from anon, authenticated;

grant select on public.financial_connections, public.financial_accounts, public.financial_transactions, public.recurring_payments to authenticated;
grant update (decision) on public.recurring_payments to authenticated;
grant select, insert, update, delete on public.financial_goals, public.financial_budgets, public.financial_income_profile to authenticated;

grant all on public.financial_connections, public.financial_credentials, public.financial_accounts, public.financial_transactions,
  public.recurring_payments, public.financial_goals, public.financial_budgets, public.financial_income_profile to service_role;
