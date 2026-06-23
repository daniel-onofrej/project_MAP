ALTER TABLE "deployment_providers"
  ADD COLUMN IF NOT EXISTS "credential_keys" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'deployment_providers'
      AND column_name = 'credential_key_names'
  ) THEN
    UPDATE deployment_providers
    SET credential_keys = COALESCE(
      (
        SELECT array_agg(value)
        FROM jsonb_array_elements_text(credential_key_names) AS value
      ),
      '{}'::text[]
    )
    WHERE credential_keys = '{}';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "deployment_providers"
  ALTER COLUMN "role" SET DEFAULT 'llm';
