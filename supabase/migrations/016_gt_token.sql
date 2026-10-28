-- Global Token (GT): premium digital currency shown in the header, below cash.
-- Read-only for players (writes are already revoked in 012_hardening); only server functions may change it.
alter table companies add column if not exists gt numeric(18,2) not null default 0 check (gt >= 0);
