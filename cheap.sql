psql -h localhost -U myapp_user -d hyjacked -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

ALTER TABLE backtests
    ADD COLUMN IF NOT EXISTS strategy_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'backtests'::regclass
          AND contype = 'f'
          AND pg_get_constraintdef(oid)
              LIKE 'FOREIGN KEY (strategy_id)%'
    ) THEN
        ALTER TABLE backtests
            ADD CONSTRAINT backtests_strategy_id_fkey
            FOREIGN KEY (strategy_id)
            REFERENCES strategies(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ix_backtests_strategy_id
    ON backtests (strategy_id);

COMMIT;
SQL