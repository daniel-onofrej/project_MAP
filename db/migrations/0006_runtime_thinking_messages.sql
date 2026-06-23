ALTER TABLE "deployment_messages" DROP CONSTRAINT IF EXISTS "deployment_messages_role_check";--> statement-breakpoint
ALTER TABLE "deployment_messages" ADD CONSTRAINT "deployment_messages_role_check" CHECK ("role" IN ('user', 'assistant', 'system', 'tool', 'thinking'));
